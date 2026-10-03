/**
 * Owner-scoped bridge from one synthetic session controller to the UI store. Status changes are
 * written at once. Projections are sampled at 10 Hz on the session's existing frame notifications
 * and published at once on run, command, pause and fault boundaries. The bridge creates no
 * session, host, animation frame or timer. Contract: docs/plan/p1/06/spec.md.
 */
import type { GameSessionError } from '../../app/session/session-errors.ts';
import type { SessionCleanup } from '../../app/session/session-host.ts';
import type { SessionFrame, SessionRun, SessionStatus, SyntheticSession } from '../../app/session/synthetic-session.ts';
import type { SyntheticGameChange, SyntheticGameStoreWriter, UiCommandSettlement } from './synthetic-game-store.ts';

/** 10 Hz, within the master plan's 10–20 Hz range for React-facing data. */
export const PROJECTION_SAMPLE_INTERVAL_MS = 100;

/** Finite, non-decreasing host milliseconds; spaces projection publications only. */
export type SamplingClock = () => number;

/** One run attached to one bridge. */
export interface SyntheticRunBinding {
  readonly run: SessionRun;
  readonly runId: number;
  /** False once the run ended, another run replaced it, or the bridge unbound. */
  isCurrent(): boolean;
  /**
   * Commits command feedback if this run is still current, optionally with the run's latest
   * projection when that tick is unpublished. Returns the number of commands settled. Status,
   * run clearing and errors stay with the bridge.
   */
  commit(change: SyntheticRunFeedback, withLatestProjection?: boolean): number;
}

/** The part of a store change that run consumers may write. */
export type SyntheticRunFeedback = Pick<SyntheticGameChange, 'addPending' | 'settle'>;

/** Run-scoped UI logic attached by the bridge to every new run. */
export interface SyntheticRunConsumer {
  /** Registers run listeners and returns their cancellations. */
  attach(binding: SyntheticRunBinding): readonly SessionCleanup[];
  /** Settlements committed together with the status that shows the bound run as faulted. */
  faulted?(binding: SyntheticRunBinding): readonly UiCommandSettlement[];
}

export interface SyntheticSessionBridge {
  /** Session error outlet: writes sessionError only, never controls the session or throws. */
  readonly onError: (error: GameSessionError) => undefined;
  /** Binds the bridge's only session; a failed bind may be retried, a successful one may not. */
  bind(session: SyntheticSession): void;
  /** Cancels the bridge's own subscriptions for good; idempotent. Does not dispose the session. */
  unbind(): void;
  currentRun(): SyntheticRunBinding | null;
}

class RunBinding implements SyntheticRunBinding {
  readonly run: SessionRun;
  readonly runId: number;
  readonly cleanups: SessionCleanup[] = [];
  live = true;
  faultPublished = false;
  publishedTick: number;
  /** Clock value of the last projection publication, or null when none is due-tracked. */
  sampleBase: number | null;
  lastNow: number | null;
  /** A clock failure during attachment inside a status notification, rethrown on the next frame. */
  deferredClockFailure: { readonly cause: unknown } | null;
  readonly #bridge: Bridge;

  constructor(bridge: Bridge, run: SessionRun, publishedTick: number, now: number | null, deferred: { readonly cause: unknown } | null) {
    this.#bridge = bridge;
    this.run = run;
    this.runId = run.runId;
    this.publishedTick = publishedTick;
    this.sampleBase = now;
    this.lastNow = now;
    this.deferredClockFailure = deferred;
  }

  isCurrent(): boolean {
    return this.live && this.#bridge.isCurrent(this);
  }

  commit(change: SyntheticRunFeedback, withLatestProjection = false): number {
    return this.#bridge.commitFor(this, change, withLatestProjection);
  }

  /** Invalidates the binding and cancels its registrations newest first; returns their errors. */
  drain(): unknown[] {
    this.live = false;
    const errors: unknown[] = [];
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (cause) { errors.push(cause); }
    }
    return errors;
  }
}

class Bridge implements SyntheticSessionBridge {
  readonly #store: SyntheticGameStoreWriter;
  readonly #clock: SamplingClock;
  readonly #consumers: readonly SyntheticRunConsumer[];
  /** A bridge serves one session for its lifetime; only a failed first bind returns to unbound. */
  #state: 'unbound' | 'bound' | 'closed' = 'unbound';
  #session: SyntheticSession | null = null;
  #stopStatus: SessionCleanup | null = null;
  #binding: RunBinding | null = null;

  constructor(store: SyntheticGameStoreWriter, clock: SamplingClock, consumers: readonly SyntheticRunConsumer[]) {
    this.#store = store;
    this.#clock = clock;
    this.#consumers = consumers;
  }

  readonly onError = (error: GameSessionError): undefined => {
    if (this.#state === 'bound') this.#store.commit({ sessionError: error });
  };

  bind(session: SyntheticSession): void {
    if (this.#state !== 'unbound') throw new Error('A session bridge binds exactly one session');
    this.#state = 'bound';
    this.#session = session;
    try {
      this.#subscribeStatus();
      this.#sync(session.status(), false);
    } catch (cause) {
      try {
        this.#release();
      } catch (cleanup) {
        throw new AggregateError([cause, cleanup], 'Bridge binding and rollback failed', { cause: cleanup });
      } finally {
        this.#state = 'unbound';
      }
      throw cause;
    }
  }

  unbind(): void {
    if (this.#state !== 'bound') return;
    this.#state = 'closed';
    this.#release();
  }

  currentRun(): SyntheticRunBinding | null {
    const binding = this.#binding;
    return binding && binding.isCurrent() ? binding : null;
  }

  isCurrent(binding: RunBinding): boolean {
    return this.#state === 'bound' && this.#binding === binding;
  }

  commitFor(binding: RunBinding, { addPending, settle }: SyntheticRunFeedback, withLatestProjection: boolean): number {
    const change = { addPending, settle };
    if (!binding.isCurrent()) return 0;
    if (!withLatestProjection) return this.#store.commit(change);
    const projection = binding.run.uiProjection();
    if (projection.tick === binding.publishedTick) return this.#store.commit(change);
    let failure: { readonly cause: unknown } | null = null;
    try {
      binding.sampleBase = this.#readClock(binding);
    } catch (cause) {
      failure = { cause };
    }
    // A received result stays authoritative even when the clock fails; the failure still faults the run.
    binding.publishedTick = projection.tick;
    const settled = this.#store.commit({ ...change, projection });
    if (failure) throw failure.cause;
    return settled;
  }

  #subscribeStatus(): void {
    this.#stopStatus = this.#session!.onStatus(status => { if (this.#state === 'bound') this.#sync(status, true); });
  }

  #release(): void {
    this.#session = null;
    const errors = this.#binding?.drain() ?? [];
    this.#binding = null;
    const stopStatus = this.#stopStatus;
    this.#stopStatus = null;
    try { stopStatus?.(); } catch (cause) { errors.push(cause); }
    if (errors.length > 0) throw new AggregateError(errors, 'Synthetic session bridge cleanup failed');
  }

  #sync(status: SessionStatus, inNotification: boolean): void {
    const run = this.#session?.currentRun() ?? null;
    if (status.phase === 'running' || status.phase === 'paused') {
      if (run && this.#binding?.runId !== run.runId) this.#attach(status, run, inNotification);
      else this.#store.commit({ status });
    } else if (status.phase === 'faulted') {
      this.#faulted(status, run);
    } else {
      this.#detach();
      this.#store.commit({ status, projection: null, clearRun: true });
    }
  }

  #attach(status: SessionStatus, run: SessionRun, inNotification: boolean): void {
    this.#detach();
    const projection = run.uiProjection();
    let now: number | null = null;
    let deferred: { readonly cause: unknown } | null = null;
    // A paused run has no frame to report a clock failure on, so it anchors on its first frame instead.
    if (status.phase === 'running') {
      try {
        now = this.#readClock(null);
      } catch (cause) {
        // The session drops a status listener that throws, so report on the run's next frame instead.
        if (!inNotification) throw cause;
        deferred = { cause };
      }
    }
    const binding = new RunBinding(this, run, projection.tick, now, deferred);
    this.#binding = binding;
    try {
      binding.cleanups.push(run.onFrame(frame => { this.#onFrame(binding, frame); }));
      binding.cleanups.push(run.ownCleanup(() => { binding.live = false; }));
      for (const consumer of this.#consumers) binding.cleanups.push(...consumer.attach(binding));
    } catch (cause) {
      this.#binding = null;
      binding.drain(); // The attachment failure is reported instead of rollback errors.
      // The session drops a throwing status listener; keep observing the fault this failure causes.
      if (inNotification) this.#subscribeStatus();
      throw cause;
    }
    this.#store.commit({ status, projection, clearRun: true, ...(status.error === null ? { sessionError: null } : {}) });
  }

  #faulted(status: SessionStatus, run: SessionRun | null): void {
    const binding = this.#binding;
    if (binding && run && binding.runId === run.runId) {
      if (binding.faultPublished) {
        this.#store.commit({ status });
        return;
      }
      binding.faultPublished = true;
      const settle = this.#consumers.flatMap(consumer => consumer.faulted?.(binding) ?? []);
      const projection = run.uiProjection();
      const latest = projection.tick === binding.publishedTick ? {} : { projection };
      binding.publishedTick = projection.tick;
      this.#store.commit({ status, ...latest, settle });
      return;
    }
    this.#detach();
    this.#store.commit({ status, projection: run?.uiProjection() ?? null, clearRun: true });
  }

  #detach(): void {
    const binding = this.#binding;
    this.#binding = null;
    if (binding) binding.live = false;
  }

  #onFrame(binding: RunBinding, frame: SessionFrame): void {
    if (!binding.isCurrent()) return;
    const deferred = binding.deferredClockFailure;
    if (deferred) {
      binding.deferredClockFailure = null;
      throw deferred.cause;
    }
    const { projection } = frame;
    const unchanged = projection.tick === binding.publishedTick;
    if (unchanged && binding.sampleBase !== null) return;
    const now = this.#readClock(binding);
    if (unchanged) {
      binding.sampleBase = now;
      return;
    }
    if (frame.phase === 'paused' || binding.sampleBase === null || now - binding.sampleBase >= PROJECTION_SAMPLE_INTERVAL_MS) {
      binding.publishedTick = projection.tick;
      binding.sampleBase = now;
      this.#store.commit({ projection });
    }
  }

  #readClock(binding: RunBinding | null): number {
    const now = this.#clock();
    if (typeof now !== 'number' || !Number.isFinite(now)) {
      throw new RangeError(`Sampling clock returned ${String(now)}; expected finite milliseconds`);
    }
    if (binding?.lastNow != null && now < binding.lastNow) {
      throw new RangeError(`Sampling clock went backwards from ${binding.lastNow} to ${now} ms`);
    }
    if (binding) binding.lastNow = now;
    return now;
  }
}

/**
 * Creates an unbound bridge. Pass `onError` to the session constructor, then `bind` the session.
 * Consumers attach to every new run the bridge observes.
 */
export function createSyntheticSessionBridge(
  store: SyntheticGameStoreWriter, clock: SamplingClock, consumers: readonly SyntheticRunConsumer[] = [],
): SyntheticSessionBridge {
  return new Bridge(store, clock, Object.freeze([...consumers]));
}
