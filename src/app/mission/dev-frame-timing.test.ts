import { describe, expect, it, vi } from 'vitest';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { FrameReport } from '../runtime/game-runtime.ts';
import type { GameSessionFrame, GameSessionRun } from '../session/game-session.ts';
import { ControlledHost } from '../session/session-host.test-support.ts';
import { createFrameTiming, type FrameTimingNotice } from './dev-frame-timing.ts';
import type { MissionOwnerConsumer, MissionOwnerContext } from './mission-owner.ts';
import { openMission, TestClock, toFlight } from './mission.test-support.ts';

// P3-04 AC-22, the frame timing window (docs/plan/p3/04/spec.md: 开发诊断, 帧耗时): one clock read just before and one
// just after each effective Session frame, never the wait between frames, and a failing clock is reported, not 0 ms.

const report = (ticks: number, capped = false, stop: FrameReport['stop'] = null): FrameReport => Object.freeze({ ticks, capped, stop, cut: null, transitions: [] });

/** A timing on a ControlledHost, connected to a stand-in run whose frame listeners the test calls. */
function setup({ connect = true } = {}) {
  const host = new ControlledHost();
  const clock = new TestClock();
  clock.time = 100;
  const timing = createFrameTiming(host, clock.read);
  const notices: FrameTimingNotice[] = [];
  timing.subscribe((notice) => { notices.push(notice); });
  const listeners: ((frame: GameSessionFrame) => undefined)[] = [];
  const run = {
    runId: 7,
    onFrame: (listener: (frame: GameSessionFrame) => undefined) => { listeners.push(listener); return () => undefined; },
    ownCleanup: () => () => undefined,
  } as unknown as GameSessionRun;
  const connection = connect ? timing.consumer.connect({} as MissionOwnerContext) : null;
  connection?.attachRun?.(run, { ownerId: 1, runId: 7 });
  /** What the Session's frame does: notifies its frame listeners with `frameReport`. */
  const frame = (frameReport: FrameReport | null) => {
    for (const listener of listeners) listener({ runId: 7, phase: 'running', report: frameReport } as GameSessionFrame);
  };
  return { host, clock, timing, notices, frame, connection };
}

const samples = (notices: readonly FrameTimingNotice[]) => notices.flatMap((notice) => (notice.type === 'sample' ? [notice.sample] : []));

describe('frame timing window', () => {
  it('times from just before to just after the frame callback, never the wait for the next frame', () => {
    const { host, clock, timing, notices, frame } = setup();
    const callback = (work: number, frameReport: FrameReport) => () => {
      clock.time += work; // simulation and event delivery
      frame(frameReport);
      clock.time += 0.5; // frame consumers and the rest of the boundary
      return undefined;
    };
    timing.host.requestFrame(callback(3, report(2)));
    host.deliver(0);
    clock.time += 16; // waiting for the next animation frame
    timing.host.requestFrame(callback(1, report(5, true)));
    host.deliver(16);
    expect(notices).toEqual([
      { type: 'sample', runId: 7, sample: { processingMs: 3.5, ticks: 2, capped: false }, endMs: 103.5, stop: null },
      { type: 'sample', runId: 7, sample: { processingMs: 1.5, ticks: 5, capped: true }, endMs: 121, stop: null },
    ]);
    expect(clock.reads).toBe(4);
    expect(Object.isFrozen(notices[0]) && Object.isFrozen(samples(notices)[0])).toBe(true);
  });

  it('keeps the frame\'s report through the still frame of a stop that follows it', () => {
    const { host, timing, notices, frame } = setup();
    timing.host.requestFrame(() => { frame(report(3, false, 'recording-capacity')); frame(null); return undefined; });
    host.deliver(0);
    expect(notices).toMatchObject([{ type: 'sample', sample: { ticks: 3, capped: false }, stop: 'recording-capacity' }]);
  });

  it('gives no sample for a callback without a report, after one clock read', () => {
    const { host, clock, timing, notices } = setup();
    const callback = vi.fn(() => undefined);
    timing.host.requestFrame(callback);
    host.deliver(5);
    expect(callback).toHaveBeenCalledWith(5);
    expect({ notices, reads: clock.reads }).toEqual({ notices: [], reads: 1 });
  });

  it('passes a cancelled or repeated callback through untimed', () => {
    const { host, clock, timing, notices, frame } = setup();
    const callback = vi.fn(() => { frame(report(1)); return undefined; });
    const handle = timing.host.requestFrame(callback);
    timing.host.cancelFrame(handle);
    expect(host.cancelled).toEqual([handle]);
    host.callbacks[0](1);
    timing.host.requestFrame(callback);
    host.deliver(2);
    host.callbacks[1](3);
    expect(callback).toHaveBeenCalledTimes(3);
    expect(clock.reads).toBe(2);
    expect(samples(notices)).toHaveLength(1);
  });

  it.each([
    ['throws at the start', () => () => { throw new Error('clock'); }],
    ['throws at the end', () => { let reads = 0; return () => { if (reads++ === 0) return 100; throw new Error('clock'); }; }],
    ['is not finite', () => () => Number.NaN],
    ['goes backwards', () => { let reads = 0; return () => (reads++ === 0 ? 100 : 99); }],
  ])('reports a clock that %s instead of a sample, and still runs the frame', (_, brokenClock: () => () => number) => {
    const host = new ControlledHost();
    const timing = createFrameTiming(host, brokenClock());
    const notices: FrameTimingNotice[] = [];
    timing.subscribe((notice) => { notices.push(notice); });
    let frameListener: ((frame: GameSessionFrame) => undefined) | null = null;
    timing.consumer.connect({} as MissionOwnerContext).attachRun?.({
      runId: 3, onFrame: (listener: typeof frameListener) => { frameListener = listener; return () => undefined; }, ownCleanup: () => () => undefined,
    } as unknown as GameSessionRun, { ownerId: 1, runId: 3 });
    const callback = vi.fn(() => { frameListener!({ runId: 3, report: report(1) } as GameSessionFrame); return undefined; });
    timing.host.requestFrame(callback);
    host.deliver(0);
    expect(callback).toHaveBeenCalledOnce();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ type: 'clock-failed', runId: 3 });
    expect((notices[0] as { cause: unknown }).cause).toBeInstanceOf(Error);
  });

  it('notifies before rethrowing the callback\'s failure, and throws listener failures after the frame', () => {
    const { host, timing, notices, frame } = setup();
    const failure = new Error('boundary');
    timing.host.requestFrame(() => { frame(report(1)); throw failure; });
    expect(() => { host.deliver(0); }).toThrow(failure);
    expect(samples(notices)).toHaveLength(1);

    const listenerFailure = new Error('listener');
    const later = vi.fn();
    timing.subscribe(() => { throw listenerFailure; });
    timing.subscribe(later);
    const callback = vi.fn(() => { frame(report(1)); return undefined; });
    timing.host.requestFrame(callback);
    expect(() => { host.deliver(1); }).toThrow(AggregateError);
    expect(callback).toHaveBeenCalledOnce();
    expect(later).toHaveBeenCalledOnce();
  });

  it('passes callbacks through untimed before the consumer connects and after its release', () => {
    const { host, clock, timing, notices, frame } = setup({ connect: false });
    timing.host.requestFrame(() => { frame(report(1)); return undefined; });
    host.deliver(0);
    const connection = timing.consumer.connect({} as MissionOwnerContext);
    expect(() => timing.consumer.connect({} as MissionOwnerContext)).toThrow(/one owner/);
    connection.release();
    timing.host.requestFrame(() => undefined);
    host.deliver(1);
    expect({ notices, reads: clock.reads }).toEqual({ notices: [], reads: 0 });
    expect(timing.subscribe(() => undefined)()).toBeUndefined();
  });

  it('delegates every host operation and requests no frame of its own', () => {
    const { host, timing } = setup();
    const listener = vi.fn(() => undefined);
    const cancel = timing.host.subscribeLifecycle(listener);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(listener).toHaveBeenCalledWith({ type: 'visibility', visibility: 'hidden' });
    expect(timing.host.readVisibility()).toBe('hidden');
    cancel();
    expect(host.unsubscribed).toBe(1);
    expect(timing.host.requestFrame(() => undefined)).toBe(0);
    expect(timing.host.requestFrame(() => undefined)).toBe(1);
    expect(host.callbacks).toHaveLength(2);
    host.requestFailure = new Error('request');
    expect(() => timing.host.requestFrame(() => undefined)).toThrow('request');
  });
});

describe('frame timing of a real mission owner', () => {
  /** A `ui` consumer whose run listeners take `eventMs` per event and `frameMs` per frame on the timing clock. */
  function workload(clock: TestClock, eventMs: number, frameMs: number) {
    const readsAtEvents: number[] = [];
    /** The events delivered in each frame. */
    const eventCounts: number[] = [];
    let events = 0;
    const consumer: MissionOwnerConsumer = {
      stage: 'ui',
      connect: () => ({
        release: () => undefined,
        attachRun(run) {
          run.ownCleanup(run.onAny(() => { readsAtEvents.push(clock.reads); events += 1; clock.time += eventMs; return undefined; }));
          run.ownCleanup(run.onFrame(() => { eventCounts.push(events); events = 0; clock.time += frameMs; return undefined; }));
        },
      }),
    };
    return { consumer, readsAtEvents, eventCounts };
  }

  async function timedMission() {
    const frames = new ControlledHost();
    const clock = new TestClock();
    const timing = createFrameTiming(frames, clock.read);
    const notices: FrameTimingNotice[] = [];
    timing.subscribe((notice) => { notices.push(notice); });
    const load = workload(clock, 2, 1);
    const mission = await openMission('mission-startable', { host: timing.host, consumers: [timing.consumer, load.consumer] });
    return { ...mission, frames, clock, notices, readsAtEvents: load.readsAtEvents, eventCounts: load.eventCounts };
  }

  it('measures the Runtime frame, its event delivery and the frame consumers, with the frame report', async () => {
    const { owner, frames, clock, notices, readsAtEvents, eventCounts, run } = await timedMission();
    toFlight(owner);
    frames.deliver(0);
    run()!.submitCommand({ type: 'launch' });
    clock.time += 50;
    frames.deliver(2 * TICK_MS);
    clock.time += 50;
    frames.deliver(20 * TICK_MS);
    // 2 ms per delivered event and 1 ms per frame consumer call, none of the 50 ms between frames.
    expect(eventCounts[1]).toBeGreaterThan(0);
    expect(samples(notices)).toEqual([
      { processingMs: 1 + 2 * eventCounts[0], ticks: 0, capped: false },
      { processingMs: 1 + 2 * eventCounts[1], ticks: 2, capped: false },
      { processingMs: 1 + 2 * eventCounts[2], ticks: 5, capped: true },
    ]);
    expect(notices.map((notice) => notice.runId)).toEqual([1, 1, 1]);
    // Every event of a frame is delivered after its start read and before its end read.
    expect(readsAtEvents.every((reads) => reads % 2 === 1)).toBe(true);
    expect(clock.reads).toBe(6);
  });

  it('gives no sample for a frame that pauses on a hidden page, and times each new run', async () => {
    const { owner, frames, clock, notices, run } = await timedMission();
    toFlight(owner);
    frames.deliver(0);
    frames.visibility = 'hidden';
    frames.deliver(TICK_MS);
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', pauseReason: 'hidden' });
    expect(samples(notices)).toHaveLength(1);
    expect(clock.reads).toBe(3);

    frames.visibility = 'visible';
    owner.restart();
    toFlight(owner);
    expect(run()!.runId).toBe(2);
    frames.deliver(2 * TICK_MS);
    expect(notices.at(-1)).toMatchObject({ type: 'sample', runId: 2, sample: { ticks: 0 } });
  });
});
