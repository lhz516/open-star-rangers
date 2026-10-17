/**
 * Owner-scoped bridge from one formal Session to that owner's UI store (docs/plan/p3/04/spec.md: UI 桥接与命令反馈;
 * the attachment and clock rules of docs/plan/p1/06/spec.md). It writes:
 * - status changes, a new run, and a pause, hold or stop boundary at once;
 * - the projection on the session's existing frame notifications, sampled every 100 ms and never twice for the same
 *   owner, run and tick; it creates no session, host, animation frame or timer;
 * - at the end of the frame, without waiting for the sample, a change of `mission.status`, `player.interactionContext`,
 *   a partition's readiness (each of the flight partition's motion and combat groups on its own), the base page's
 *   selection or order (P3-10, G-05), the result's content, or the map's key state (docs/plan/p3/09/spec.md, 地图
 *   projection; docs/plan/p3/02/spec.md, MW-15): the map open, closed or without a player, the committed destination
 *   and marker, the `warpRequest` result and reason, view mode 1 and its Warp transit's serial, compared by those fields
 *   rather than by object identity. A hover only moves the cursor and its readings, which are sampled;
 * - what run consumers settle at the end of a frame (command results), together with the frame-end projection.
 * The sampling clock must give finite, non-decreasing milliseconds. As in P1-06, attaching a running run reads it to
 * start the sample (other phases start it on the first frame, which only anchors); a failed or invalid read throws
 * from the frame listener, so the Session records a consumer fault. A failure while attaching from a status
 * notification is reported on the run's next frame instead, since the Session drops a status listener that throws.
 */
import type { GameIntent } from '../../app/runtime/game-runtime.ts';
import type { GameSession, GameSessionFrame, GameSessionRun, GameSessionStatus } from '../../app/session/game-session.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import type { GameSessionError } from '../../app/session/session-errors.ts';
import type { SessionCleanup } from '../../app/session/session-host.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import type { MapPlayer, Projection, WarpRequestReading } from '../../core/projections/projection.ts';
import type { RenderState } from '../../core/projections/render-state.ts';
import { WARP_VIEW_MODE } from '../../core/systems/view-switch.ts';
import { attemptAll } from '../../render/scene/cleanup.ts';
import { projectedBase, type GameChange, type GameRunStore, type UiCommandSettlement } from './game-store.ts';

/** 10 Hz, the lower end of the master plan's 10–20 Hz for React-facing data, as in P1-06. */
export const PROJECTION_SAMPLE_INTERVAL_MS = 100;

/** Finite, non-decreasing host milliseconds; spaces projection publications only. */
export type SamplingClock = () => number;

/** What the bridge reads of a Session: it never controls it. */
export type GameSessionView = Pick<GameSession, 'status' | 'currentRun' | 'onStatus'>;

/** One run attached to one bridge. */
export interface GameRunBinding {
  readonly ownerId: number;
  readonly runId: number;
  readonly run: GameSessionRun;
  /** False until the attachment succeeded, and once the run ended, another run replaced it or the bridge unbound. */
  isCurrent(): boolean;
  /**
   * Submits through this run, so the Session reports its own refusals. Throws without touching the run once the bridge
   * retired the binding by rollback or unbind.
   */
  submitCommand(command: Command): number;
  /** Same retirement guard as commands; the Session checks the run, phase and notification mode. */
  setIntent(intent: GameIntent): void;
  /**
   * Writes pending commands, errors and settlements now if the binding is current; returns the number settled. With
   * `withLatestProjection`, the run's latest projection comes along when its tick is unpublished.
   */
  commit(change: GameRunFeedback, withLatestProjection?: boolean): number;
  /** Hands a registration's cancellation to the bridge, which runs it on rollback or unbind. */
  own(cleanup: SessionCleanup): void;
}

/** The part of a store change that run consumers may write. */
export type GameRunFeedback = Pick<GameChange, 'addPending' | 'settle' | 'actionError'>;

/** Run-scoped UI logic the bridge attaches to every run it binds. */
export interface GameRunConsumer {
  /**
   * Registers run listeners, handing each cancellation to `binding.own` as soon as it exists. If attachment throws,
   * the bridge rolls back everything owned so far and rethrows, as a RollbackError if a cancellation also failed.
   */
  attach(binding: GameRunBinding): void;
  /** Settlements received during the frame's event delivery, written with the frame-end projection. */
  frameEnd?(binding: GameRunBinding): readonly UiCommandSettlement[];
  /** Settlements written together with the status that shows the bound run faulted. */
  faulted?(binding: GameRunBinding): readonly UiCommandSettlement[];
}

export interface GameSessionBridgeOptions {
  readonly store: GameRunStore;
  readonly clock: SamplingClock;
  /** Attached to every run in order, after the bridge's own frame listener. */
  readonly consumers?: readonly GameRunConsumer[];
}

export interface GameSessionBridge {
  readonly ownerId: number;
  /** Session error outlet: writes sessionError only, never controls the session or throws. */
  readonly onError: (error: GameSessionError) => undefined;
  /**
   * Binds the bridge's only session and attaches its current run, then every new run its status reports. A failed
   * bind may be retried, a successful one may not.
   */
  bind(session: GameSessionView): void;
  /**
   * Attaches `run`, the bound session's current run, now; a no-op if it is attached already. An owner may call it as a
   * run-level consumer, for instance from its own status listener; the bridge otherwise attaches the run itself. A
   * clock failure is reported on the run's next frame.
   */
  attach(run: GameSessionRun): void;
  /** Cancels the bridge's own subscriptions for good; idempotent. Does not dispose the session. */
  unbind(): void;
  currentRun(): GameRunBinding | null;
}

/** The projection facts published at the end of their frame, whatever the sample. */
interface KeyFacts {
  readonly missionStatus: Projection['mission']['status'];
  readonly interactionContext: Projection['player']['interactionContext'];
  readonly motion: Projection['flight']['motion']['readiness'];
  readonly combat: Projection['flight']['combat']['readiness'];
  readonly map: Projection['map']['readiness'];
  readonly communications: Projection['communications']['readiness'];
  readonly result: Projection['result']['readiness'];
  /** The base page's selection and order (P3-10, G-05): the cursor row and the rows' records; null outside the base view. */
  readonly baseSelection: string | null;
  readonly outcome: unknown;
  readonly reason: unknown;
  readonly message: unknown;
  /** Null when the map is not ready or has no player. */
  readonly mapState: MapPlayer['state'] | null;
  /** The committed destination's coordinates, not its object: each read builds a new one. */
  readonly destinationX: number | null;
  readonly destinationY: number | null;
  readonly destinationZ: number | null;
  readonly markerEntityId: number | null;
  /** `accepted` or the refusal's reason. */
  readonly warpRequest: 'accepted' | Extract<WarpRequestReading, { accepted: false }>['reason'] | null;
  /** View mode 1, the Warp view. */
  readonly warpView: boolean;
  /** The serial of the Warp transit the view shows (Render State, view mode 1); null outside it. */
  readonly warpSerial: number | null;
}

/** The serial of the Warp transit `render` shows, or null. */
const warpSerialOf = (render: RenderState): number | null => render.warp?.serial ?? null;

function keyFacts(projection: Projection, warpSerial: number | null): KeyFacts {
  const { mission, player, flight, map, communications, result } = projection;
  const ready = result.readiness === 'ready';
  const mapPlayer = map.readiness === 'ready' ? map.player : null;
  const destination = mapPlayer === null ? null : mapPlayer.state === 'open' ? mapPlayer.destination?.position ?? null : mapPlayer.destination;
  const request = mapPlayer?.warpRequest ?? null;
  const base = projectedBase(projection);
  return {
    missionStatus: mission.status, interactionContext: player.interactionContext,
    motion: flight.motion.readiness, combat: flight.combat.readiness, map: map.readiness, communications: communications.readiness,
    result: result.readiness,
    baseSelection: base && `${base.cursor}:${base.rows.map(({ record }) => record).join(',')}`,
    outcome: ready ? result.outcome : null,
    reason: ready && 'reason' in result ? result.reason : null,
    message: ready && 'message' in result ? result.message : null,
    mapState: mapPlayer?.state ?? null,
    destinationX: destination?.x ?? null, destinationY: destination?.y ?? null, destinationZ: destination?.z ?? null,
    markerEntityId: mapPlayer?.markerEntityId ?? null,
    warpRequest: request === null ? null : request.accepted ? 'accepted' : request.reason,
    warpView: player.viewMode === WARP_VIEW_MODE,
    warpSerial,
  };
}

const sameFacts = (a: KeyFacts, b: KeyFacts) => (Object.keys(a) as (keyof KeyFacts)[]).every((key) => a[key] === b[key]);

/** Who attaches a run: a direct bind throws a clock failure, the others defer it to the run's next frame. */
type AttachCaller = 'bind' | 'notification' | 'owner';

class RunBinding implements GameRunBinding {
  readonly ownerId: number;
  readonly runId: number;
  readonly run: GameSessionRun;
  readonly cleanups: SessionCleanup[] = [];
  /**
   * `live` while the run is attached; `ended` once the run released its registrations or another run replaced it;
   * `retired` once the bridge abandoned it by rollback or unbind, while its run may still be running.
   */
  state: 'live' | 'ended' | 'retired' = 'live';
  faultPublished = false;
  /** Tick and key facts of the last projection written for this run. */
  publishedTick: number;
  publishedFacts: KeyFacts;
  /** Clock value that starts the current sample window; null until the attachment or first frame anchors it. */
  sampleBase: number | null;
  /** A clock failure while attaching from a notification, thrown on the run's next frame. */
  deferredFailure: { readonly cause: unknown } | null;
  readonly #bridge: Bridge;

  constructor(bridge: Bridge, run: GameSessionRun, now: number | null, deferredFailure: { readonly cause: unknown } | null) {
    this.#bridge = bridge;
    this.ownerId = bridge.ownerId;
    this.run = run;
    this.runId = run.runId;
    const projection = run.projection();
    this.publishedTick = projection.clock.tick;
    this.publishedFacts = keyFacts(projection, warpSerialOf(run.renderFrame().current));
    this.sampleBase = now;
    this.deferredFailure = deferredFailure;
  }

  isCurrent(): boolean {
    return this.state === 'live' && this.#bridge.isCurrent(this);
  }

  submitCommand(command: Command): number {
    this.#requireOwner();
    return this.run.submitCommand(command);
  }

  setIntent(intent: GameIntent): void {
    this.#requireOwner();
    this.run.setIntent(intent);
  }

  commit(change: GameRunFeedback, withLatestProjection = false): number {
    if (!this.isCurrent()) return 0;
    return this.#bridge.write(this, change, withLatestProjection ? this.run.projection() : null);
  }

  own(cleanup: SessionCleanup): void {
    this.cleanups.push(cleanup);
  }

  end(): void {
    if (this.state === 'live') this.state = 'ended';
  }

  /** Retires the binding and cancels its registrations newest first; returns their errors. */
  drain(): unknown[] {
    this.state = 'retired';
    return attemptAll(this.cleanups.splice(0).reverse());
  }

  #requireOwner(): void {
    if (this.state === 'retired') throw new Error('The UI owner no longer controls this run');
  }
}

class Bridge implements GameSessionBridge {
  readonly ownerId: number;
  readonly #store: GameRunStore;
  readonly #clock: SamplingClock;
  readonly #consumers: readonly GameRunConsumer[];
  /** A bridge serves one session for its lifetime; only a failed first bind returns to unbound. */
  #state: 'unbound' | 'bound' | 'closed' = 'unbound';
  #session: GameSessionView | null = null;
  #stopStatus: SessionCleanup | null = null;
  #binding: RunBinding | null = null;
  #lastNow: number | null = null;

  constructor(store: GameRunStore, clock: SamplingClock, consumers: readonly GameRunConsumer[]) {
    this.ownerId = store.ownerId;
    this.#store = store;
    this.#clock = clock;
    this.#consumers = consumers;
  }

  readonly onError = (error: GameSessionError): undefined => {
    if (this.#state === 'bound') this.#store.commit({ sessionError: error });
  };

  bind(session: GameSessionView): void {
    if (this.#state !== 'unbound') throw new Error('A session bridge binds exactly one session');
    this.#state = 'bound';
    this.#session = session;
    try {
      this.#subscribeStatus();
      this.#sync(session.status(), 'bind');
    } catch (cause) {
      try {
        this.#release();
      } catch (cleanup) {
        throw new RollbackError(cause, [cleanup], 'Session bridge binding and rollback failed');
      } finally {
        this.#state = 'unbound';
      }
      throw cause;
    }
  }

  attach(run: GameSessionRun): void {
    const session = this.#session;
    if (this.#state !== 'bound' || !session) throw new Error('The session bridge is not bound');
    if (session.currentRun() !== run) throw new Error('Only the bound session\'s current run can be attached');
    if (this.#binding?.runId === run.runId) return;
    this.#attach(session.status(), run, 'owner');
  }

  unbind(): void {
    if (this.#state !== 'bound') return;
    this.#state = 'closed';
    this.#release();
  }

  currentRun(): GameRunBinding | null {
    const binding = this.#binding;
    return binding && binding.isCurrent() ? binding : null;
  }

  isCurrent(binding: RunBinding): boolean {
    return this.#state === 'bound' && this.#binding === binding;
  }

  /**
   * One store write for `binding`, with `projection` when its tick is unpublished; `now` restarts the sample. Without
   * the frame's `facts`, the Warp serial stays the last published one, so a change shows on the next frame.
   */
  write(binding: RunBinding, change: GameRunFeedback & Pick<GameChange, 'status'>, projection: Projection | null, now: number | null = null, facts?: KeyFacts): number {
    const latest = projection !== null && projection.clock.tick !== binding.publishedTick ? projection : null;
    if (latest !== null) {
      binding.publishedTick = latest.clock.tick;
      binding.publishedFacts = facts ?? keyFacts(latest, binding.publishedFacts.warpSerial);
    }
    if (now !== null) binding.sampleBase = now;
    return this.#store.commit(latest === null ? change : { ...change, projection: latest });
  }

  #subscribeStatus(): void {
    this.#stopStatus = this.#session!.onStatus((status) => { if (this.#state === 'bound') this.#sync(status, 'notification'); });
  }

  #release(): void {
    this.#session = null;
    const errors = this.#binding?.drain() ?? [];
    this.#binding = null;
    const stopStatus = this.#stopStatus;
    this.#stopStatus = null;
    try { stopStatus?.(); } catch (cause) { errors.push(cause); }
    if (errors.length > 0) throw new AggregateError(errors, 'Game session bridge cleanup failed');
  }

  #sync(status: GameSessionStatus, caller: AttachCaller): void {
    const run = this.#session?.currentRun() ?? null;
    switch (status.phase) {
      case 'transition': case 'running': case 'paused': case 'stopped':
        if (run && this.#binding?.runId !== run.runId) this.#attach(status, run, caller);
        else this.#store.commit({ status });
        return;
      case 'faulted':
        this.#faulted(status, run);
        return;
      default:
        this.#detach();
        this.#store.commit({ status, projection: null, clearRun: true });
    }
  }

  /**
   * Registers the run's listeners and consumers, then makes the binding current and writes the run's status and
   * projection; nothing is written unless every registration succeeded. A running run starts its sample here.
   */
  #attach(status: GameSessionStatus, run: GameSessionRun, caller: AttachCaller): void {
    this.#detach();
    let now: number | null = null;
    let deferred: { readonly cause: unknown } | null = null;
    // A run in another phase has no frame until it runs, and that first frame only anchors: it starts the sample then.
    if (status.phase === 'running') {
      try {
        now = this.#readClock();
      } catch (cause) {
        if (caller === 'bind') throw cause;
        deferred = { cause };
      }
    }
    const binding = new RunBinding(this, run, now, deferred);
    try {
      binding.own(run.onFrame((frame) => { this.#onFrame(binding, frame); }));
      binding.own(run.ownCleanup(() => { binding.end(); }));
      for (const consumer of this.#consumers) consumer.attach(binding);
    } catch (cause) {
      const rollback = binding.drain();
      // The Session drops a status listener that throws; keep observing the fault this failure causes.
      if (caller === 'notification') this.#subscribeStatus();
      if (rollback.length > 0) throw new RollbackError(cause, rollback, 'Run attachment and rollback failed');
      throw cause;
    }
    this.#binding = binding;
    this.#store.commit({ status, projection: run.projection(), clearRun: true, ...(status.error === null ? { sessionError: null } : {}) });
  }

  #faulted(status: GameSessionStatus, run: GameSessionRun | null): void {
    const binding = this.#binding;
    if (binding && run && binding.runId === run.runId) {
      if (binding.faultPublished) {
        this.#store.commit({ status });
        return;
      }
      binding.faultPublished = true;
      // The Session released the run's registrations, so the binding is no longer current: write directly, once.
      const settle = this.#consumers.flatMap((consumer) => consumer.faulted?.(binding) ?? []);
      this.write(binding, { status, settle }, run.projection());
      return;
    }
    this.#detach();
    this.#store.commit({ status, projection: run?.projection() ?? null, clearRun: true });
  }

  #detach(): void {
    this.#binding?.end();
    this.#binding = null;
  }

  #onFrame(binding: RunBinding, frame: GameSessionFrame): void {
    if (!binding.isCurrent() || frame.runId !== binding.runId) return;
    const deferred = binding.deferredFailure;
    if (deferred) {
      // Results the consumers hold for this frame are written when the run faults.
      binding.deferredFailure = null;
      throw deferred.cause;
    }
    const settle = this.#consumers.flatMap((consumer) => consumer.frameEnd?.(binding) ?? []);
    const { projection } = frame;
    if (projection.clock.tick === binding.publishedTick) {
      if (settle.length > 0) this.write(binding, { settle }, null);
      if (binding.sampleBase === null) binding.sampleBase = this.#readClock();
      return;
    }
    let now: number;
    try {
      now = this.#readClock();
    } catch (cause) {
      // Results already received stay authoritative; the failure still faults the run.
      if (settle.length > 0) this.write(binding, { settle }, projection);
      throw cause;
    }
    const facts = keyFacts(projection, warpSerialOf(frame.render.current));
    const immediate = settle.length > 0 || frame.report === null || !sameFacts(facts, binding.publishedFacts);
    const base = binding.sampleBase;
    if (immediate || (base !== null && now - base >= PROJECTION_SAMPLE_INTERVAL_MS)) this.write(binding, { settle }, projection, now, facts);
    // Without a start, this frame starts the sample rather than publishing right after the attachment's write.
    else if (base === null) binding.sampleBase = now;
  }

  #readClock(): number {
    const now = this.#clock();
    if (typeof now !== 'number' || !Number.isFinite(now)) {
      throw new RangeError(`Sampling clock returned ${String(now)}; expected finite milliseconds`);
    }
    if (this.#lastNow !== null && now < this.#lastNow) {
      throw new RangeError(`Sampling clock went backwards from ${this.#lastNow} to ${now} ms`);
    }
    this.#lastNow = now;
    return now;
  }
}

/**
 * Creates an unbound bridge for the owner of `store`. Pass `onError` to the session constructor, then `bind` the
 * session; `unbind` when the owner releases it, after the session.
 */
export function createGameSessionBridge({ store, clock, consumers = [] }: GameSessionBridgeOptions): GameSessionBridge {
  if (typeof clock !== 'function') throw new TypeError('The sampling clock must be a function');
  return new Bridge(store, clock, Object.freeze([...consumers]));
}
