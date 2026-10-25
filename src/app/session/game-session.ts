/**
 * Formal game Session (docs/plan/p3/04/spec.md: 会话; the control part of 任务菜单、暂停与退出; the hold interface of
 * 衔接占位). It keeps the P1-05 controller contract (docs/plan/p1/05/spec.md): at most one valid frame request, run
 * IDs, the notification boundary, idempotent cleanup and aggregated errors. It differs as the spec lists:
 * - `start` takes the run spec and is accepted only in idle; there is no restart (exit, configure, start again).
 * - `transition` holds a new run at tick 0 for the initial departure: no frame request, no input, a folded read model.
 *   `complete-departure` for that runId ends it once. A hidden page or pagehide during the hold latches
 *   `resumeRequired`, so the run then waits paused (hidden) for an explicit resume.
 * - A frame the Runtime cut at a transition tick (运行中衔接（P3-10 的修订）) enters `transition` after its frame
 *   consumers, unless the run faulted or an exit or dispose is queued: the queue is cancelled once for `transition`, the
 *   read model folds, and a still frame follows. The tick's transitions form a sequence of at most two items, each with
 *   its own transitionId; `complete-transition` with the runId and the current item's transitionId ends that item
 *   once. After the last, the Runtime's barrier is lowered and its clock re-anchored (nothing is caught up), and the
 *   run continues as after the departure.
 * - A frame the Runtime cut at the run's last tick (终局与救援衔接（P3-11 的修订）) enters `completed` after its frame
 *   consumers, unless the run faulted or an exit or dispose is queued: the queue is cancelled once for
 *   `mission-complete`, the read model folds, the completion tick's result is kept, and a still frame follows. The
 *   result's ending placeholders (G-02/7 to G-02/9) then hold one by one, with transitionIds from the same counter;
 *   `complete-transition` ends each once, and after the last only the result remains. Nothing resumes the run: the
 *   Runtime's completion barrier is permanent. Reads and the recording's export stay available until exit or dispose.
 * - `stopped` follows a recording-capacity stop: the frame's earlier ticks are delivered and reported first, then the
 *   queue is cancelled once and the run stays readable and exportable until exit or dispose.
 * - Input is the Runtime's continuous intent and Core commands, only while running. `clear-input` clears it on focus
 *   loss or a Pointer Lock exit without pausing or re-anchoring.
 * - A faulted run gives no new snapshot or recording export. Commands whose result a fault left unknown are never
 *   reported cancelled: they are the Runtime fault's `unconfirmed`, kept in the error.
 * Nothing here reads Core state to pause or resume, and there is no per-tick hook or Core write-back.
 */
import { ContentContractError } from '../../content/contract-validation.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import { integerIn, readChoice, readDataRecord, readExactRecord, readNumber, requireExactFields } from '../../core/contracts/validation.ts';
import { CoreInputError } from '../../core/errors.ts';
import type { EndingGap, Projection, ResultProjection } from '../../core/projections/projection.ts';
import type { Recording } from '../../core/replay/recording.ts';
import type { GameSnapshot } from '../../core/replay/snapshot.ts';
import { CONTENT_INPUT_FIELDS } from '../../core/world/create-world.ts';
import type { DomainEventType, GameEventListener } from '../runtime/game-event-bus.ts';
import {
  createGameRuntime, type FrameReport, type FrameTransition, type GameIntent, type GameRuntime, type GameRuntimeSpec, type RenderFrame,
} from '../runtime/game-runtime.ts';
import { GameRuntimeError } from '../runtime/runtime-errors.ts';
import { GameSessionError, type GameSessionPhase, type SessionErrorListener, type SessionFailure } from './session-errors.ts';
import type { SessionCleanup, SessionHost, SessionLifecycleEvent } from './session-host.ts';

/** G-02/2, the departure before flight; the variant follows the run's wingman selection. */
export interface DepartureTransition {
  readonly gap: 'G-02/2';
  readonly variant: 'solo' | 'wingman';
}

/** One item of a hold a running run entered at a transition tick (G-02/3 docking, G-02/4 launch, G-02/5 and G-02/6 rescues). */
export interface RunningTransition {
  readonly gap: FrameTransition['gap'];
  /** Monotonic within the controller from 1, never reused across runs; not in Core, the recording or replay. */
  readonly transitionId: number;
  /** The Core tick that produced it. */
  readonly tick: number;
  /** Its position in that tick's sequence, from 0. */
  readonly index: number;
  /** The sequence's length, 1 or 2. */
  readonly count: number;
}

/** One ending placeholder of a completed run, in the order of its result's `endingGaps`. */
export type EndingTransition = EndingGap & {
  /** From the counter of `RunningTransition.transitionId`. */
  readonly transitionId: number;
  /** The completion tick. */
  readonly tick: number;
  readonly index: number;
  /** The length of `endingGaps`. */
  readonly count: number;
};

export type SessionTransition = DepartureTransition | RunningTransition | EndingTransition;

/** The completed run's result: the completion tick's projection of it, frozen; the session reads Core no more. */
export type SessionResult = Extract<ResultProjection, { readonly outcome: 'success' | 'failure' }>;

/** What `start` takes: the Runtime spec, and the initial departure hold or null. */
export interface GameRunSpec extends GameRuntimeSpec {
  readonly initialTransition: DepartureTransition | null;
}

export type ClearInputReason = 'focus-loss' | 'pointer-lock-exit';

export type GameSessionControl =
  | { readonly type: 'start'; readonly spec: GameRunSpec }
  | { readonly type: 'pause' | 'resume' | 'exit' | 'dispose' }
  | { readonly type: 'complete-departure'; readonly runId: number }
  | { readonly type: 'complete-transition'; readonly runId: number; readonly transitionId: number }
  | { readonly type: 'clear-input'; readonly reason: ClearInputReason };

/**
 * Why queued commands were dropped unexecuted. `transition` belongs to a hold a running run entered at a transition
 * tick; the initial hold starts with an empty queue and cancels nothing. `mission-complete` belongs to the run's
 * completion.
 */
export type CancelReason =
  | 'user-pause' | 'hidden' | 'transition' | ClearInputReason | 'recording-capacity' | 'mission-complete' | 'exit' | 'dispose' | 'failure';

export interface GameSessionStatus {
  readonly phase: GameSessionPhase;
  /** Null exactly in idle and disposed. */
  readonly runId: number | null;
  /** Visible, and no pagehide since the last pageshow. */
  readonly environmentVisible: boolean;
  /** Set only in paused. */
  readonly pauseReason: 'user' | 'hidden' | null;
  /**
   * The departure or the current item of a running hold in transition; the current ending placeholder in completed,
   * null after the last; otherwise null.
   */
  readonly transition: SessionTransition | null;
  /** The page was hidden during a hold, so only an explicit resume runs the run; only in transition and paused. */
  readonly resumeRequired: boolean;
  /** Set only in stopped. */
  readonly stopReason: 'recording-capacity' | null;
  /** Set only in completed. */
  readonly result: SessionResult | null;
  /** Latched for the controller's life. */
  readonly cleanupFailed: boolean;
  readonly error: GameSessionError | null;
}

export interface GameSessionFrame {
  readonly runId: number;
  /**
   * `transition` is the still frame of a hold a running run entered: the initial hold starts before any run consumer
   * exists, which reads its folded tick-0 model from the run handle when it wires.
   */
  readonly phase: 'running' | 'paused' | 'transition' | 'stopped' | 'completed';
  readonly render: RenderFrame;
  readonly projection: Projection;
  /**
   * The frame's report as the Runtime returned it, its per-tick `outputs` included, after the frame's domain delivery;
   * null for the still frame on entering a pause, hold or stop.
   */
  readonly report: FrameReport | null;
}

export interface GameCommandsCancelled {
  readonly runId: number;
  /** FIFO; each command provably never ran. */
  readonly commandIds: readonly number[];
  readonly reason: CancelReason;
}

export interface GameSessionRun {
  readonly runId: number;
  setIntent(intent: GameIntent): void;
  submitCommand(command: Command): number;
  on<T extends DomainEventType>(type: T, listener: GameEventListener<Extract<DomainEvent, { type: T }>>): SessionCleanup;
  onAny(listener: GameEventListener): SessionCleanup;
  onFrame(listener: (frame: GameSessionFrame) => undefined): SessionCleanup;
  onCommandsCancelled(listener: (notice: GameCommandsCancelled) => undefined): SessionCleanup;
  ownCleanup(cleanup: SessionCleanup): SessionCleanup;
  /** The last complete read model; once faulted it may predate the fault. */
  projection(): Projection;
  renderFrame(): RenderFrame;
  /** An on-demand Core read; refused once faulted, and a Core fault it finds faults the run. */
  snapshot(): GameSnapshot;
  /** The recording so far, or null without one; as snapshot(). */
  exportRecording(): Recording | null;
}

export interface GameSession {
  control(control: GameSessionControl): void;
  status(): GameSessionStatus;
  /** The run in transition, running, paused, stopped, completed or faulted; null in idle and disposed. */
  currentRun(): GameSessionRun | null;
  onStatus(listener: (status: GameSessionStatus) => undefined): SessionCleanup;
}

interface StartControl {
  readonly type: 'start';
  readonly runtime: GameRuntimeSpec;
  readonly transition: DepartureTransition | null;
}
type Control = StartControl | Exclude<GameSessionControl, { readonly type: 'start' }>;

const CONTROL_FIELDS: Readonly<Record<Control['type'], readonly string[]>> = {
  start: ['type', 'spec'], pause: ['type'], resume: ['type'], exit: ['type'], dispose: ['type'],
  'complete-departure': ['type', 'runId'], 'complete-transition': ['type', 'runId', 'transitionId'], 'clear-input': ['type', 'reason'],
};
const CONTROL_TYPES = Object.keys(CONTROL_FIELDS) as Control['type'][];
const CLEAR_INPUT_REASONS: readonly ClearInputReason[] = ['focus-loss', 'pointer-lock-exit'];
const SPEC_FIELDS = [...CONTENT_INPUT_FIELDS, 'run', 'recording', 'initialTransition'] as const;
const TRANSITION_PATH = 'control.spec.initialTransition';
/** Core emits at most two transitions in a tick (docs/plan/p3/02/spec.md, CB-16); more breaks its contract. */
const MAX_TRANSITIONS_PER_TICK = 2;
/** A result has one or two ending placeholders (docs/plan/p3/02/spec.md, ME-05); more breaks Core's contract. */
const MAX_ENDING_PLACEHOLDERS = 2;
const RUNNING_GAPS: ReadonlySet<SessionTransition['gap']> = new Set<RunningTransition['gap']>(['G-02/3', 'G-02/4', 'G-02/5', 'G-02/6']);
export const isRunningTransition = (transition: SessionTransition | null): transition is RunningTransition =>
  transition !== null && RUNNING_GAPS.has(transition.gap);
export const isEndingTransition = (transition: SessionTransition | null): transition is EndingTransition =>
  transition !== null && transition.gap !== 'G-02/2' && !RUNNING_GAPS.has(transition.gap);
const ending = (work: Work): boolean => work.type === 'control' && (work.control.type === 'exit' || work.control.type === 'dispose');
type LivePhase = GameSessionFrame['phase'];
/** The phases of a live run: consumers may wire to it and its frames report them. */
const LIVE_PHASES: ReadonlySet<GameSessionPhase> = new Set<LivePhase>(['transition', 'running', 'paused', 'stopped', 'completed']);
const isLive = (phase: GameSessionPhase): phase is LivePhase => LIVE_PHASES.has(phase);
/** Runtime refusals that leave the run healthy, and the reason the session reports. */
const REFUSALS: Partial<Record<GameRuntimeError['kind'], string>> = {
  'command-queue-full': 'command-queue-full',
  'recording-capacity': 'recording-capacity',
  'transition-hold': 'transition-hold',
  completed: 'completed',
  'reentrant-call': 'unavailable during event delivery',
};

function invalid(path: string, reason: string): never {
  throw new GameSessionError({ kind: 'invalid-argument', path, reason });
}
function listenerRequired(listener: unknown, path: string): void {
  if (typeof listener !== 'function') invalid(path, 'must be a synchronous function');
}
function runtimeArgument(cause: GameRuntimeError, path = cause.path ?? 'runtime'): GameSessionError {
  return new GameSessionError({ kind: 'invalid-argument', path, reason: cause.reason ?? cause.message, cause });
}

/** Reads a control as Core reads its input (plain data; accessors never run); Core's refusal becomes invalid-argument. */
function readControl(value: unknown): Control {
  try {
    return parseControl(value);
  } catch (cause) {
    if (cause instanceof CoreInputError) throw new GameSessionError({ kind: 'invalid-argument', path: cause.path, reason: cause.reason, cause });
    throw cause;
  }
}

function parseControl(value: unknown): Control {
  const record = readDataRecord(value, 'control', 3);
  const type = readChoice(record.type, 'control.type', CONTROL_TYPES);
  requireExactFields(record, 'control', CONTROL_FIELDS[type]);
  switch (type) {
    case 'start': return readStart(record.spec);
    case 'complete-departure': return { type, runId: readNumber(record.runId, 'control.runId', integerIn(1, Number.MAX_SAFE_INTEGER)) };
    case 'complete-transition': return {
      type,
      runId: readNumber(record.runId, 'control.runId', integerIn(1, Number.MAX_SAFE_INTEGER)),
      transitionId: readNumber(record.transitionId, 'control.transitionId', integerIn(1, Number.MAX_SAFE_INTEGER)),
    };
    case 'clear-input': return { type, reason: readChoice(record.reason, 'control.reason', CLEAR_INPUT_REASONS) };
    default: return { type };
  }
}

/**
 * Copies the spec when the control is submitted, since a queued start applies later in the boundary: its fields, the
 * run configuration and the recording options. Core validates everything and copies the content Assets and identity
 * when it creates the world.
 */
function readStart(value: unknown): StartControl {
  const { initialTransition, run, recording, ...content } = readExactRecord(value, 'control.spec', SPEC_FIELDS);
  const runtime = { ...content, run: copyRecord(run, 'control.spec.run'), recording: copyRecord(recording, 'control.spec.recording') };
  return { type: 'start', runtime: runtime as unknown as GameRuntimeSpec, transition: readTransition(initialTransition) };
}

/** A copy of a plain data record's fields; anything else is left for Core to refuse. */
function copyRecord(value: unknown, path: string): unknown {
  return typeof value === 'object' && value !== null ? { ...readDataRecord(value, path, Infinity) } : value;
}

function readTransition(value: unknown): DepartureTransition | null {
  if (value === null) return null;
  const { gap, variant } = readExactRecord(value, TRANSITION_PATH, ['gap', 'variant']);
  return Object.freeze({
    gap: readChoice(gap, `${TRANSITION_PATH}.gap`, ['G-02/2']),
    variant: readChoice(variant, `${TRANSITION_PATH}.variant`, ['solo', 'wingman']),
  });
}

/** World creation refused the spec: its shape (Runtime), or its content or run (Core). Null for any other failure. */
function creationRejection(cause: unknown): GameSessionError | null {
  if (cause instanceof GameRuntimeError && cause.kind === 'invalid-argument') return runtimeArgument(cause, `control.${cause.path}`);
  if (cause instanceof CoreInputError || cause instanceof ContentContractError) {
    return new GameSessionError({ kind: 'invalid-argument', path: 'control.spec', reason: 'was rejected by world creation', cause });
  }
  return null;
}

function framePhase(cause: unknown): SessionFailure['phase'] {
  if (cause instanceof GameRuntimeError && cause.kind === 'listener-failed') return 'consumer';
  if (cause instanceof GameRuntimeError && cause.kind === 'invalid-argument') return 'scheduler';
  return 'runtime';
}

class Subscribers<T> {
  readonly #listeners = new Map<symbol, (value: T) => undefined>();
  get empty(): boolean { return this.#listeners.size === 0; }
  add(listener: (value: T) => undefined): SessionCleanup {
    const id = Symbol();
    this.#listeners.set(id, listener);
    const remove = this.#listeners.delete.bind(this.#listeners, id);
    return () => { remove(); };
  }
  notify(value: T, cancelFailed = false): unknown[] {
    const errors: unknown[] = [];
    for (const [id, listener] of [...this.#listeners]) {
      if (!this.#listeners.has(id)) continue;
      try { listener(value); } catch (cause) {
        errors.push(cause);
        if (cancelFailed) this.#listeners.delete(id);
      }
    }
    return errors;
  }
  clear(): void { this.#listeners.clear(); }
}

class RunData {
  readonly id: number;
  runtime: GameRuntime | null;
  readonly frames = new Subscribers<GameSessionFrame>();
  readonly cancellations = new Subscribers<GameCommandsCancelled>();
  readonly resources = new Set<OwnedCleanup>();
  accepting = true;
  readonly handle: GameSessionRun;
  constructor(owner: Session, runtime: GameRuntime, id: number) {
    this.id = id; this.runtime = runtime; this.handle = Object.freeze(new Run(owner, this));
  }
}
interface Request {
  readonly run: RunData;
  handle: number | null;
}
type Work =
  | { readonly type: 'control'; readonly control: Control }
  | { readonly type: 'lifecycle'; readonly event: SessionLifecycleEvent }
  | { readonly type: 'fault'; readonly run: RunData | null; readonly synchronous: boolean };
type CallbackMode = 'open' | 'status' | 'restricted';

class OwnedCleanup {
  #owner: Session | null;
  #run: RunData | null;
  #cleanup: SessionCleanup | null;
  constructor(owner: Session, run: RunData, cleanup: SessionCleanup) {
    this.#owner = owner; this.#run = run; this.#cleanup = cleanup;
  }
  release(): undefined {
    if (this.#owner && this.#run) this.#owner.release(this.#run, this);
  }
  take(): SessionCleanup | null {
    const cleanup = this.#cleanup;
    this.#owner = null; this.#run = null; this.#cleanup = null;
    return cleanup;
  }
}

class Run implements GameSessionRun {
  readonly runId: number;
  readonly #owner: Session;
  readonly #data: RunData;
  constructor(owner: Session, data: RunData) { this.#owner = owner; this.#data = data; this.runId = data.id; }
  setIntent(intent: GameIntent): void { this.#owner.input(this.#data, 'setIntent', (runtime) => { runtime.setIntent(intent); }); }
  submitCommand(command: Command): number { return this.#owner.input(this.#data, 'submitCommand', (runtime) => runtime.submitCommand(command)); }
  on<T extends DomainEventType>(type: T, listener: GameEventListener<Extract<DomainEvent, { type: T }>>): SessionCleanup {
    const cancel = this.#owner.subscribe(this.#data, 'on', (runtime) => runtime.on(type, listener));
    return () => { cancel(); };
  }
  onAny(listener: GameEventListener): SessionCleanup {
    const cancel = this.#owner.subscribe(this.#data, 'onAny', (runtime) => runtime.onAny(listener));
    return () => { cancel(); };
  }
  onFrame(listener: (frame: GameSessionFrame) => undefined): SessionCleanup {
    this.#owner.requireRun(this.#data, 'onFrame', true);
    listenerRequired(listener, 'onFrame.listener');
    return this.#data.frames.add(listener);
  }
  onCommandsCancelled(listener: (notice: GameCommandsCancelled) => undefined): SessionCleanup {
    this.#owner.requireRun(this.#data, 'onCommandsCancelled', true);
    listenerRequired(listener, 'onCommandsCancelled.listener');
    return this.#data.cancellations.add(listener);
  }
  ownCleanup(cleanup: SessionCleanup): SessionCleanup { return this.#owner.ownCleanup(this.#data, cleanup); }
  projection(): Projection { return this.#owner.requireRun(this.#data, 'projection').projection(); }
  renderFrame(): RenderFrame { return this.#owner.requireRun(this.#data, 'renderFrame').renderFrame(); }
  snapshot(): GameSnapshot { return this.#owner.read(this.#data, 'snapshot', (runtime) => runtime.snapshot()); }
  exportRecording(): Recording | null { return this.#owner.read(this.#data, 'exportRecording', (runtime) => runtime.exportRecording()); }
}

class Session implements GameSession {
  readonly #host: SessionHost;
  readonly #onError: SessionErrorListener;
  readonly #statuses = new Subscribers<GameSessionStatus>();
  #unsubscribe: SessionCleanup | null = null;
  #phase: GameSessionPhase = 'idle';
  #run: RunData | null = null;
  #nextId = 1;
  #visible = true;
  #pageHidden = false;
  #pauseReason: GameSessionStatus['pauseReason'] = null;
  #transition: SessionTransition | null = null;
  /** The running hold's whole sequence; empty otherwise. */
  #sequence: readonly FrameTransition[] = [];
  #result: SessionResult | null = null;
  #nextTransitionId = 1;
  #resumeRequired = false;
  #cleanupFailed = false;
  #error: GameSessionError | null = null;
  #request: Request | null = null;
  #requestSynchronous = false;
  #busy = false;
  #mode: CallbackMode = 'open';
  #synchronous = false;
  #errors: { failure: SessionFailure; synchronous: boolean }[] = [];
  #work: Work[] = [];
  #lastStatus: GameSessionStatus | null = null;

  constructor(host: SessionHost, onError: SessionErrorListener) {
    this.#host = host; this.#onError = onError;
    try {
      this.#visible = this.#readVisibility();
      this.#unsubscribe = host.subscribeLifecycle((event) => {
        if (this.#busy) this.#work.push({ type: 'lifecycle', event });
        else this.#boundary(() => { this.#lifecycle(event); }, true);
      });
      if (typeof this.#unsubscribe !== 'function') throw new TypeError('subscribeLifecycle must return a cancellation function');
    } catch (cause) {
      throw new GameSessionError({ kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }] });
    }
    this.#lastStatus = this.status();
  }
  status(): GameSessionStatus {
    return Object.freeze({
      phase: this.#phase, runId: this.#run?.id ?? null, environmentVisible: this.#environmentVisible(),
      pauseReason: this.#pauseReason, transition: this.#transition, resumeRequired: this.#resumeRequired,
      stopReason: this.#phase === 'stopped' ? 'recording-capacity' : null, result: this.#result, cleanupFailed: this.#cleanupFailed,
      error: this.#error,
    });
  }
  currentRun(): GameSessionRun | null { return this.#run?.handle ?? null; }
  onStatus(listener: (status: GameSessionStatus) => undefined): SessionCleanup {
    if (this.#phase === 'disposed') throw this.#stateError('onStatus', 'controller is disposed');
    if (this.#mode === 'restricted') throw this.#stateError('onStatus', 'notification only permits reading or cancellation');
    listenerRequired(listener, 'onStatus.listener');
    return this.#statuses.add(listener);
  }
  control(control: GameSessionControl): void {
    const parsed = readControl(control);
    if (this.#mode !== 'open') throw this.#stateError(parsed.type, 'control is forbidden in this notification');
    if (this.#busy) { this.#work.push({ type: 'control', control: parsed }); return; }
    this.#boundary(() => { this.#control(parsed); }, false);
  }
  requireRun(data: RunData, operation: string, registering = false): GameRuntime {
    if (data !== this.#run || !data.runtime) throw this.#stateError(operation, 'run has ended');
    if (registering && (!data.accepting || this.#mode === 'restricted' || !isLive(this.#phase))) {
      throw this.#stateError(operation, 'run is not accepting consumers');
    }
    return data.runtime;
  }
  input<T>(data: RunData, operation: string, action: (runtime: GameRuntime) => T): T {
    const runtime = this.requireRun(data, operation);
    if (this.#phase !== 'running' || !data.accepting || this.#mode !== 'open') throw this.#stateError(operation, 'run is not accepting input');
    return this.#call(operation, runtime, action);
  }
  read<T>(data: RunData, operation: string, action: (runtime: GameRuntime) => T): T {
    const runtime = this.requireRun(data, operation);
    if (this.#phase === 'faulted') throw this.#stateError(operation, 'a faulted run gives no new snapshot or export');
    return this.#call(operation, runtime, action);
  }
  subscribe(data: RunData, operation: string, action: (runtime: GameRuntime) => () => void): () => void {
    const runtime = this.requireRun(data, operation, true);
    try { return action(runtime); } catch (cause) {
      if (cause instanceof GameRuntimeError && cause.kind === 'invalid-argument') throw runtimeArgument(cause);
      throw cause;
    }
  }
  ownCleanup(data: RunData, cleanup: SessionCleanup): SessionCleanup {
    this.requireRun(data, 'ownCleanup', true);
    listenerRequired(cleanup, 'ownCleanup.cleanup');
    const resource = new OwnedCleanup(this, data, cleanup); data.resources.add(resource);
    return resource.release.bind(resource);
  }
  release(data: RunData, resource: OwnedCleanup): undefined {
    if (this.#mode === 'restricted') throw this.#stateError('release', 'notification only permits reading or subscription cancellation');
    const cleanup = resource.take();
    if (!cleanup) return;
    data.resources.delete(resource);
    if (!this.#busy) {
      this.#boundary(() => { this.#attemptCleanup(cleanup); }, false);
      return;
    }
    try { this.#withMode('restricted', cleanup); } catch (cause) {
      this.#cleanupFailed = true;
      this.#error = new GameSessionError({ kind: 'operation-failed', failures: [{ phase: 'cleanup', cause }] });
      throw this.#error;
    }
  }
  /** Runs a Runtime operation: its refusals become session errors, and a Runtime fault faults the run. */
  #call<T>(operation: string, runtime: GameRuntime, action: (runtime: GameRuntime) => T): T {
    try { return action(runtime); } catch (cause) {
      if (cause instanceof GameRuntimeError && cause.kind === 'invalid-argument') throw runtimeArgument(cause);
      const refusal = cause instanceof GameRuntimeError ? REFUSALS[cause.kind] : undefined;
      if (refusal !== undefined) throw this.#stateError(operation, refusal);
      if (this.#busy) {
        this.#fault('runtime', cause);
        throw new GameSessionError({ kind: 'operation-failed', failures: [{ phase: 'runtime', cause }] });
      }
      // The boundary throws the synchronous runtime failure it records.
      this.#boundary(() => { this.#fault('runtime', cause); }, false);
      throw cause;
    }
  }
  #withMode<T>(mode: CallbackMode, action: () => T): T {
    const previous = this.#mode; this.#mode = mode;
    try { return action(); } finally { this.#mode = previous; }
  }
  #stateError(operation: string, reason: string): GameSessionError {
    return new GameSessionError({ kind: 'invalid-state', operation, phase: this.#phase, runId: this.#run?.id ?? null, reason });
  }
  #environmentVisible(): boolean {
    return this.#visible && !this.#pageHidden;
  }
  #readVisibility(): boolean {
    const visibility = this.#host.readVisibility();
    if (visibility !== 'visible' && visibility !== 'hidden') throw new TypeError('readVisibility must return visible or hidden');
    return visibility === 'visible';
  }
  #boundary(action: () => void, asynchronous: boolean): void {
    this.#busy = true; this.#errors = []; this.#synchronous = !asynchronous;
    let directError: unknown;
    let directFailed = false;
    try {
      try { action(); } catch (cause) { directError = cause; directFailed = true; }
      if (this.#errors.length === 0) this.#publishStatus();
      this.#drain();
      if (!directFailed) this.#ensureRequest();
      this.#drain();
      this.#publishStatus();
      this.#drain();
      const syncFailures = this.#errors.filter((entry) => entry.synchronous).map((entry) => entry.failure);
      const asyncFailures = this.#errors.filter((entry) => !entry.synchronous).map((entry) => entry.failure);
      const syncError = syncFailures.length ? new GameSessionError({ kind: 'operation-failed', failures: syncFailures }) : null;
      if (asyncFailures.length > 0) {
        const error = new GameSessionError({ kind: 'operation-failed', failures: asyncFailures }); this.#error = error;
        try { this.#withMode('restricted', () => this.#onError(error)); } catch (cause) {
          const before = this.#errors.length;
          this.#synchronous = false;
          this.#fault('consumer', cause); this.#drain();
          const additional = this.#errors.slice(before + 1).map((entry) => entry.failure.cause);
          throw new AggregateError([error, cause, ...additional], 'Session error outlet failed', { cause });
        }
      }
      if (directFailed) throw directError;
      if (syncError) { if (asyncFailures.length === 0) this.#error = syncError; throw syncError; }
    } finally { this.#busy = false; this.#work = []; }
  }
  #drain(): void {
    for (let index = 0; index < this.#work.length; index++) {
      const work = this.#work[index];
      const previous = this.#synchronous; this.#synchronous = work.type === 'fault' && work.synchronous;
      try {
        if (work.type === 'control') {
          try { this.#control(work.control); } catch (cause) { this.#recordFailure('control', cause); }
        } else if (work.type === 'lifecycle') this.#lifecycle(work.event);
        else if (work.run === this.#run && this.#run && this.#phase !== 'faulted' && this.#phase !== 'disposed') {
          this.#settle('faulted'); this.#end('failure', false);
        }
        this.#publishStatus();
      } finally { this.#synchronous = previous; }
    }
    this.#work = [];
  }
  #control(control: Control): void {
    const { type } = control;
    if (type === 'dispose') {
      if (this.#phase === 'disposed') return;
      this.#end('dispose'); this.#run = null;
      const cancel = this.#unsubscribe; this.#unsubscribe = null;
      if (cancel) this.#attemptCleanup(cancel);
      this.#settle('disposed');
      this.#publishStatus(); this.#statuses.clear();
      return;
    }
    if (this.#phase === 'disposed') throw this.#stateError(type, 'controller is disposed');
    switch (type) {
      case 'start':
        if (this.#phase !== 'idle') throw this.#stateError(type, 'start requires idle');
        this.#start(control);
        return;
      case 'exit':
        if (this.#phase === 'idle') return;
        this.#end('exit'); this.#run = null; this.#settle('idle');
        return;
      case 'pause':
        if (this.#phase === 'paused') return;
        if (this.#phase !== 'running') throw this.#stateError(type, 'pause requires running');
        this.#pause('user');
        return;
      case 'resume':
        if (this.#phase === 'running') return;
        if (this.#phase !== 'paused') throw this.#stateError(type, 'resume requires a visible paused run');
        try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
        if (!this.#environmentVisible()) throw this.#stateError(type, 'resume requires a visible paused run');
        this.#run?.runtime?.resetClock();
        this.#enterRunning();
        return;
      case 'complete-departure':
        if (this.#phase !== 'transition' || this.#run?.id !== control.runId || this.#transition?.gap !== 'G-02/2') {
          throw this.#stateError(type, 'requires the departure hold of that run');
        }
        if (this.#faulting()) throw this.#stateError(type, 'the run is faulting');
        // The Runtime has never run a frame, so its first one only anchors.
        this.#endHold();
        return;
      case 'complete-transition': {
        const transition = this.#transition;
        // A running hold's item exists only in transition, an ending's only in completed.
        const current = isRunningTransition(transition) || isEndingTransition(transition) ? transition : null;
        if (current === null || this.#run?.id !== control.runId || current.transitionId !== control.transitionId) {
          throw this.#stateError(type, 'requires the current transition of that run');
        }
        if (this.#faulting()) throw this.#stateError(type, 'the run is faulting');
        if (isEndingTransition(current)) this.#completeEnding(current);
        else this.#completeTransition(current);
        return;
      }
      case 'clear-input':
        if (this.#phase === 'running') this.#clearIntent(control.reason);
        // Pausing, holding and stopping already cleared the input.
        else if (this.#phase !== 'paused' && this.#phase !== 'transition') throw this.#stateError(type, 'clear-input requires a live run');
        return;
    }
  }
  #start({ runtime: spec, transition }: StartControl): void {
    if (this.#cleanupFailed) throw this.#stateError('start', 'cleanup previously failed');
    if (this.#nextId === Number.MAX_SAFE_INTEGER) throw this.#stateError('start', 'runId exhausted');
    try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
    let runtime: GameRuntime;
    try { runtime = createGameRuntime(spec); } catch (cause) {
      const rejection = creationRejection(cause);
      if (rejection) throw rejection;
      this.#fault('runtime', cause); return;
    }
    // The world is dropped unexposed: nothing has subscribed to it or scheduled it yet.
    if (transition && transition.variant !== (runtime.projection().mission.wingman === null ? 'solo' : 'wingman')) {
      invalid(`${TRANSITION_PATH}.variant`, "must be 'wingman' exactly when the run selects a wingman");
    }
    this.#run = new RunData(this, runtime, this.#nextId++); this.#error = null;
    const visible = this.#environmentVisible();
    if (transition) {
      this.#phase = 'transition'; this.#transition = transition; this.#resumeRequired = !visible;
      return;
    }
    if (visible) this.#enterRunning();
    else { this.#phase = 'paused'; this.#pauseReason = 'hidden'; }
  }
  /**
   * Holds the run after a frame its transition tick cut: the sequence's first item, the queue cancelled once, the read
   * model folded and a still frame. The frame request was consumed by this frame and is not renewed.
   */
  #hold(transitions: readonly FrameTransition[]): void {
    if (this.#nextTransitionId > Number.MAX_SAFE_INTEGER - transitions.length) {
      this.#fault('runtime', new RangeError('transitionId exhausted'));
      return;
    }
    this.#phase = 'transition'; this.#sequence = transitions; this.#resumeRequired = !this.#environmentVisible();
    this.#holdItem(0);
    this.#clearIntent('transition');
    this.#run?.runtime?.foldRenderState();
    this.#notifyFrame(null);
  }
  /**
   * Completes the run after the frame its last tick cut: the queue cancelled once, then, unless a cancellation listener
   * failed, the result kept, the first ending placeholder held, the read model folded and a still frame. The frame
   * request was consumed by this frame and is not renewed. A completion without a final result, or with no or more than
   * two ending placeholders, breaks Core's contract and faults the run.
   */
  #complete(): void {
    const runtime = this.#run?.runtime;
    if (!runtime) return;
    const result = runtime.projection().result;
    if (result.outcome === 'in-progress' || result.endingGaps.length === 0 || result.endingGaps.length > MAX_ENDING_PLACEHOLDERS) {
      this.#fault('runtime', new RangeError('A completed run needs a final result with one or two ending placeholders'));
      return;
    }
    if (this.#nextTransitionId > Number.MAX_SAFE_INTEGER - result.endingGaps.length) {
      this.#fault('runtime', new RangeError('transitionId exhausted'));
      return;
    }
    this.#clearIntent('mission-complete');
    if (this.#faulting()) return;
    this.#phase = 'completed'; this.#result = result;
    this.#holdEnding(0);
    runtime.foldRenderState();
    this.#notifyFrame(null);
  }
  #holdEnding(index: number): void {
    const result = this.#result!;
    this.#transition = Object.freeze({ ...result.endingGaps[index], transitionId: this.#nextTransitionId++, tick: result.completedTick, index, count: result.endingGaps.length });
  }
  /** Moves to the next ending placeholder, or leaves the result alone after the last; the run never resumes. */
  #completeEnding(transition: EndingTransition): void {
    if (transition.index + 1 < transition.count) this.#holdEnding(transition.index + 1);
    else this.#transition = null;
  }
  /** A fault of the current run waits in this boundary; it outranks holding and ending a hold. */
  #faulting(): boolean {
    return this.#work.some((work) => work.type === 'fault' && work.run === this.#run);
  }
  #holdItem(index: number): void {
    const { gap, tick } = this.#sequence[index];
    this.#transition = Object.freeze({ gap, transitionId: this.#nextTransitionId++, tick, index, count: this.#sequence.length });
  }
  /** Moves to the sequence's next item, or ends the hold after the last: the barrier lowered, the clock re-anchored. */
  #completeTransition(transition: RunningTransition): void {
    if (transition.index + 1 < transition.count) {
      this.#holdItem(transition.index + 1);
      return;
    }
    const runtime = this.#run?.runtime;
    runtime?.releaseTransitionBarrier();
    runtime?.resetClock();
    this.#endHold();
  }
  /** Ends a hold: running when the page is visible and nothing latched `resumeRequired`, otherwise paused (hidden). */
  #endHold(): void {
    try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
    this.#transition = null; this.#sequence = [];
    if (!this.#environmentVisible()) this.#resumeRequired = true;
    if (this.#resumeRequired) {
      this.#phase = 'paused'; this.#pauseReason = 'hidden';
      this.#notifyFrame(null);
      return;
    }
    this.#enterRunning();
  }
  /** Enters running with its frame requested; a failed request faults the run instead. */
  #enterRunning(): void {
    this.#phase = 'running'; this.#pauseReason = null; this.#resumeRequired = false;
    this.#requestSynchronous = this.#synchronous;
    this.#ensureRequest();
  }
  #pause(reason: 'user' | 'hidden'): void {
    this.#phase = 'paused'; this.#pauseReason = reason;
    this.#stopRequest();
    this.#clearIntent(reason === 'user' ? 'user-pause' : 'hidden');
    this.#run?.runtime?.foldRenderState();
    this.#notifyFrame(null);
  }
  /** The recording refused a tick: the Runtime has already folded its read model and refuses further input. */
  #stop(): void {
    this.#phase = 'stopped';
    this.#clearIntent('recording-capacity');
    this.#notifyFrame(null);
  }
  /** Enters a phase without a pause, hold or stop. */
  #settle(phase: 'idle' | 'faulted' | 'disposed'): void {
    this.#phase = phase; this.#pauseReason = null; this.#transition = null; this.#sequence = []; this.#resumeRequired = false;
    this.#result = null;
  }
  #clearIntent(reason: CancelReason): void {
    const run = this.#run;
    if (!run?.runtime) return;
    const commandIds = run.runtime.clearIntent();
    if (commandIds.length === 0) return;
    const notice: GameCommandsCancelled = Object.freeze({ runId: run.id, commandIds, reason });
    const errors = this.#withMode('restricted', () => run.cancellations.notify(notice));
    for (const cause of errors) this.#fault('consumer', cause);
  }
  #end(reason: CancelReason, drop = true): void {
    this.#stopRequest();
    const run = this.#run;
    if (!run?.runtime) return;
    run.accepting = false;
    this.#clearIntent(reason); run.runtime.foldRenderState();
    this.#attemptCleanup(() => run.runtime?.clearSubscriptions());
    run.frames.clear(); run.cancellations.clear();
    const resources = [...run.resources].reverse().map((resource) => resource.take()); run.resources.clear();
    for (const cleanup of resources) if (cleanup) this.#attemptCleanup(cleanup);
    if (drop) run.runtime = null;
  }
  #attemptCleanup(cleanup: () => void): void {
    try { this.#withMode('restricted', cleanup); } catch (cause) {
      this.#cleanupFailed = true; this.#recordFailure('cleanup', cause);
    }
  }
  #stopRequest(): void {
    const request = this.#request; this.#request = null;
    const handle = request?.handle;
    if (handle !== null && handle !== undefined) {
      try { this.#host.cancelFrame(handle); } catch (cause) {
        this.#cleanupFailed = true; this.#fault('scheduler', cause);
      }
    }
  }
  #ensureRequest(): void {
    if (this.#phase !== 'running' || this.#request || !this.#run) return;
    const request: Request = { run: this.#run, handle: null };
    this.#request = request;
    const previous = this.#synchronous; this.#synchronous = this.#requestSynchronous;
    try {
      const handle = this.#host.requestFrame((now) => { this.#frame(request, now); });
      if (!Number.isSafeInteger(handle) || handle < 0) throw new TypeError('requestFrame must return a nonnegative safe integer');
      request.handle = handle;
    } catch (cause) { this.#request = null; this.#fault('scheduler', cause); }
    finally { this.#synchronous = previous; }
  }
  #frame(request: Request, nowMs: number): void {
    const runtime = request.run.runtime;
    if (request !== this.#request || request.run !== this.#run || this.#phase !== 'running' || !runtime) return;
    this.#request = null;
    this.#requestSynchronous = false;
    this.#boundary(() => {
      try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
      if (!this.#environmentVisible()) { this.#pause('hidden'); return; }
      let report: FrameReport;
      try { report = runtime.frame(nowMs); } catch (cause) { this.#fault(framePhase(cause), cause); return; }
      this.#notifyFrame(report);
      // A consumer failure in this frame outranks the stop, hold or completion: the run faults instead and nothing stays
      // exportable.
      if (this.#faulting()) return;
      if (report.stop !== null) this.#stop();
      else if (report.transitions.length > MAX_TRANSITIONS_PER_TICK) {
        this.#fault('runtime', new RangeError(`A tick produced ${report.transitions.length} transitions; Core emits at most ${MAX_TRANSITIONS_PER_TICK}`));
      // A queued exit or dispose ends the run instead of holding or completing it.
      } else if (report.cut === null || this.#work.some(ending)) return;
      else if (report.cut === 'completed') this.#complete();
      else this.#hold(report.transitions);
    }, true);
  }
  #notifyFrame(report: FrameReport | null): void {
    const run = this.#run, phase = this.#phase;
    if (!run?.runtime || run.frames.empty || !isLive(phase)) return;
    const frame: GameSessionFrame = Object.freeze({
      runId: run.id, phase, render: run.runtime.renderFrame(), projection: run.runtime.projection(), report,
    });
    for (const cause of run.frames.notify(frame)) this.#fault('consumer', cause);
  }
  #publishStatus(): void {
    const status = this.status(), previous = this.#lastStatus;
    if (previous && Object.keys(status).every((key) => status[key as keyof GameSessionStatus] === previous[key as keyof GameSessionStatus])) return;
    // Running is reported only with a frame requested: when the request failed, the fault that follows is reported instead.
    if (status.phase === 'running' && !this.#request) return;
    this.#lastStatus = status;
    const errors = this.#withMode('status', () => this.#statuses.notify(status, true));
    for (const cause of errors) this.#fault('consumer', cause);
  }
  #recordFailure(phase: SessionFailure['phase'], cause: unknown): void {
    this.#errors.push({ failure: { phase, cause }, synchronous: this.#synchronous });
    this.#error = new GameSessionError({ kind: 'operation-failed', failures: this.#errors.filter((entry) => entry.synchronous === this.#synchronous).map((entry) => entry.failure) });
  }
  #fault(phase: SessionFailure['phase'], cause: unknown): void {
    this.#recordFailure(phase, cause);
    this.#work.push({ type: 'fault', run: this.#run, synchronous: this.#synchronous });
  }
  #lifecycle(event: SessionLifecycleEvent): void {
    if (this.#phase === 'disposed') return;
    if (event.type === 'pagehide') this.#pageHidden = true;
    else if (event.type === 'pageshow') {
      this.#pageHidden = false;
      try { this.#visible = this.#readVisibility(); } catch (cause) { this.#fault('scheduler', cause); return; }
    } else this.#visible = event.visibility === 'visible';
    if (this.#environmentVisible()) return;
    if (this.#phase === 'running') this.#pause('hidden');
    else if (this.#phase === 'transition') this.#resumeRequired = true;
  }
}

/**
 * Creates an idle Session that subscribes to `host` once. `onError` receives, last in each asynchronous boundary (a
 * frame or a host notification), the failures of that boundary; synchronous operations throw theirs instead.
 */
export function createGameSession(host: SessionHost, onError: SessionErrorListener): GameSession {
  if (typeof host !== 'object' || host === null || Array.isArray(host)) invalid('host', 'must be an object');
  for (const method of ['requestFrame', 'cancelFrame', 'readVisibility', 'subscribeLifecycle'] as const) listenerRequired(host[method], `host.${method}`);
  listenerRequired(onError, 'onError');
  return new Session(host, onError);
}
