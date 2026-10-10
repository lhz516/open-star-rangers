/**
 * Development frame timing (docs/plan/p3/04/spec.md: 开发诊断, 帧耗时). It wraps one owner's SessionHost and times each
 * effective frame callback with one monotonic clock read just before the Session processes the frame and one just after
 * it returns. The window therefore holds the Runtime's simulation, the frame's event delivery, the frame consumers and
 * the rest of the Session's frame boundary, and never the wait for the next animation frame. It schedules nothing of its
 * own: every request, cancellation and lifecycle subscription goes to the wrapped host unchanged.
 *
 * A frame is effective when the Session reports it: the run-level frame listener of `consumer` takes the report's ticks
 * and capped flag. A callback the Session cancelled is not timed, and one without a report (a pause on a hidden page,
 * a Runtime fault) gives no sample. A clock read that throws, is not finite or goes backwards gives a failure notice,
 * never a 0 ms sample. These are development measurements, not GPU or display timings, and they never reach Core.
 */
import type { FrameReport } from '../runtime/game-runtime.ts';
import type { GameSessionRun } from '../session/game-session.ts';
import type { SessionHost } from '../session/session-host.ts';
import type { MissionConsumerConnection, MissionOwnerConsumer } from './mission-owner.ts';
import type { MonotonicClock } from './mission-ports.ts';

/** One effective frame: its processing time, and its report's tick count and capped flag. */
export interface FrameTimingSample {
  readonly processingMs: number;
  readonly ticks: number;
  readonly capped: boolean;
}

export type FrameTimingNotice =
  | {
    readonly type: 'sample';
    readonly runId: number;
    readonly sample: FrameTimingSample;
    /** The clock reading that ended the frame's window. */
    readonly endMs: number;
    readonly stop: FrameReport['stop'];
  }
  | { readonly type: 'clock-failed'; readonly runId: number; readonly cause: unknown };

export type FrameTimingListener = (notice: FrameTimingNotice) => void;

export interface FrameTiming {
  /** The host for the owner's session, `MissionOwnerSetup.host`. */
  readonly host: SessionHost;
  /** A `ui` owner consumer that reads each frame's report; one owner connects it, once. */
  readonly consumer: MissionOwnerConsumer;
  /**
   * Receives a notice after each timed frame, outside the Session's frame boundary. A listener that throws does not
   * stop the others; the host callback throws the failures after the Session finished the frame.
   */
  subscribe(listener: FrameTimingListener): () => void;
}

/** One frame request of the Session; `live` until it fires or is cancelled. */
interface Request {
  live: boolean;
  handle: number | null;
}

/** The frame being timed, and the report its listener saw. */
interface Window {
  report: FrameReport | null;
  runId: number;
}

/**
 * Wraps `host` for one owner. Until `consumer` is connected and after its release, callbacks pass through untimed.
 * `clock` is the owner's monotonic clock; its values are checked again here.
 */
export function createFrameTiming(host: SessionHost, clock: MonotonicClock): FrameTiming {
  if (typeof clock !== 'function') throw new TypeError('The frame timing clock must be a function');
  const listeners = new Set<{ readonly listener: FrameTimingListener }>();
  const requests = new Map<number, Request>();
  let state: 'unconnected' | 'connected' | 'released' = 'unconnected';
  let window: Window | null = null;
  let last = -Infinity;

  const read = (): number => {
    const now = clock();
    if (typeof now !== 'number' || !Number.isFinite(now)) throw new RangeError(`The frame timing clock returned ${String(now)}`);
    if (now < last) throw new RangeError(`The frame timing clock went back from ${last} to ${now} ms`);
    last = now;
    return now;
  };

  const finish = (current: Window, start: number | { readonly cause: unknown }): FrameTimingNotice | null => {
    const { report, runId } = current;
    if (report === null) return null;
    if (typeof start !== 'number') return Object.freeze({ type: 'clock-failed', runId, cause: start.cause });
    let end: number;
    try {
      end = read();
    } catch (cause) {
      return Object.freeze({ type: 'clock-failed', runId, cause });
    }
    const sample: FrameTimingSample = Object.freeze({ processingMs: end - start, ticks: report.ticks, capped: report.capped });
    return Object.freeze({ type: 'sample', runId, sample, endMs: end, stop: report.stop });
  };

  const timed = (request: Request, callback: (nowMs: number) => undefined, nowMs: number): undefined => {
    const live = request.live;
    request.live = false;
    if (request.handle !== null && requests.get(request.handle) === request) requests.delete(request.handle);
    if (!live || state !== 'connected') return callback(nowMs);
    let start: number | { readonly cause: unknown };
    try {
      start = read();
    } catch (cause) {
      start = { cause };
    }
    const current: Window = { report: null, runId: 0 };
    window = current;
    let thrown: { readonly error: unknown } | null = null;
    try {
      callback(nowMs);
    } catch (error) {
      thrown = { error };
    } finally {
      window = null;
    }
    const notice = state === 'connected' ? finish(current, start) : null;
    const errors: unknown[] = [];
    if (notice) {
      for (const entry of [...listeners]) {
        if (!listeners.has(entry)) continue;
        try {
          entry.listener(notice);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (thrown) throw thrown.error;
    if (errors.length > 0) throw new AggregateError(errors, 'A frame timing listener failed');
    return undefined;
  };

  const wrapped: SessionHost = Object.freeze({
    requestFrame(callback: (nowMs: number) => undefined): number {
      const request: Request = { live: true, handle: null };
      const handle = host.requestFrame((nowMs) => timed(request, callback, nowMs));
      request.handle = handle;
      requests.set(handle, request);
      return handle;
    },
    cancelFrame(handle: number): undefined {
      const request = requests.get(handle);
      if (request) request.live = false;
      requests.delete(handle);
      return host.cancelFrame(handle);
    },
    readVisibility: () => host.readVisibility(),
    subscribeLifecycle: (listener: Parameters<SessionHost['subscribeLifecycle']>[0]) => host.subscribeLifecycle(listener),
  });

  const consumer: MissionOwnerConsumer = Object.freeze({
    stage: 'ui',
    connect(): MissionConsumerConnection {
      if (state !== 'unconnected') throw new Error('A frame timing serves one owner');
      state = 'connected';
      return {
        release(): undefined {
          state = 'released';
          listeners.clear();
          requests.clear();
          return undefined;
        },
        attachRun(run: GameSessionRun) {
          run.ownCleanup(run.onFrame(({ runId, report }) => {
            if (window !== null && report !== null) {
              window.report = report;
              window.runId = runId;
            }
            return undefined;
          }));
        },
      };
    },
  });

  return Object.freeze({
    host: wrapped,
    consumer,
    subscribe(listener: FrameTimingListener): () => void {
      if (typeof listener !== 'function') throw new TypeError('A frame timing listener must be a function');
      if (state === 'released') return () => undefined;
      const entry = { listener };
      listeners.add(entry);
      return () => { listeners.delete(entry); };
    },
  });
}
