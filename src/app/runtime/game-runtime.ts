/**
 * Formal Runtime (docs/plan/p3/04/spec.md, Runtime; 失败帧与录制容量): one per run, created and owned by the formal
 * Session. It advances one formal Core world at the fixed step from host timestamps, turns the continuous intent and
 * the bounded command queue into each tick's batch, delivers the frame's events after simulation, and keeps the read
 * model of the last complete tick. Host time never enters Core.
 *
 * Failure frames, as the spec's table: invalid arguments and a full queue change nothing. A Core fault or any other
 * failure in a frame faults the Runtime, delivers none of the frame's events and keeps the last complete read model;
 * the fault lists as `unconfirmed` the IDs whose results it withheld, while the IDs still queued provably never ran.
 * A step the recording cannot hold stops the Runtime instead: that tick is refused, the frame's earlier ticks are
 * delivered and reported with `stop: 'recording-capacity'`, and the recording stays exportable. A faulted Runtime
 * reads nothing new from Core: projection() and renderFrame() keep the last complete read model, which may predate the
 * fault, and snapshot() and exportRecording() throw the fault.
 *
 * Running transitions (docs/plan/p3/04/spec.md, 运行中衔接（P3-10 的修订）): a successful step whose events include
 * `transition` is the frame's last tick. The frame reports the cut and that tick's transitions, raises a barrier that
 * refuses input and frames, and only then delivers its events as usual; the Session releases the barrier when its hold
 * ends. Nothing is checked per tick from outside.
 *
 * Completion (docs/plan/p3/04/spec.md, 终局与救援衔接（P3-11 的修订）): a successful step whose events include
 * `mission-completed` is the run's last tick. The frame reports the cut and the completion, raises a barrier that is
 * never lowered, and then delivers its events as usual: input, frames, the clock's re-anchoring and the transition
 * barrier's release are refused with `completed` from then on, while reads, the recording's export and the Session's
 * lifecycle clean-up stay available. A tick with both `transition` and `mission-completed` breaks Core's contract and
 * faults the Runtime.
 */
import type { DomainEvent, MissionCompletedEvent, TransitionEvent } from '../../core/contracts/domain-events.ts';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import { readTickInput, type Command, type TickAxes, type TickInput } from '../../core/contracts/tick-input.ts';
import { CLOCK_UNITS_PER_SECOND } from '../../core/contracts/time.ts';
import { readExactRecord } from '../../core/contracts/validation.ts';
import { CoreInputError } from '../../core/errors.ts';
import type { Projection } from '../../core/projections/projection.ts';
import type { RenderState } from '../../core/projections/render-state.ts';
import { createRecordingSession, type Recording, type RecordingOptions, type RecordingSession } from '../../core/replay/recording.ts';
import type { GameSnapshot } from '../../core/replay/snapshot.ts';
import { CONTENT_INPUT_FIELDS, createWorld, type CreateWorldInput } from '../../core/world/create-world.ts';
import type { RunConfig } from '../../core/world/run-config.ts';
import type { World } from '../../core/world/world.ts';
import { FixedStepClock } from './fixed-step-clock.ts';
import { GameEventBus, type DomainEventType, type GameEventListener, type PendingDelivery } from './game-event-bus.ts';
import { GameRuntimeError } from './runtime-errors.ts';

export type { EventDelivery, GameEventListener } from './game-event-bus.ts';
/** The run configuration without a step: the Runtime runs only Core's default step. */
export type GameRunConfig = Omit<RunConfig, 'clockUnitsPerTick'>;

/** What a Runtime is created from: the world creation input, and recording options or null. */
export interface GameRuntimeSpec extends Omit<CreateWorldInput, 'run'> {
  readonly run: GameRunConfig;
  readonly recording: RecordingOptions | null;
}

/** The continuous intent: steering axes under Core's axis rules, and the level of the primary fire control. */
export interface GameIntent {
  readonly axes: TickAxes;
  readonly primaryFire: boolean;
}

/** The last two complete Render States of this run and the progress between them, alpha in [0, 1). */
export interface RenderFrame {
  readonly previous: RenderState;
  readonly current: RenderState;
  readonly alpha: number;
}

/** One `transition` event of the tick that cut a frame. */
export interface FrameTransition {
  readonly gap: TransitionEvent['gap'];
  readonly tick: number;
}

/** The run's completion, from the `mission-completed` event of its last tick. */
export interface FrameCompletion {
  readonly tick: number;
  readonly outcome: MissionCompletedEvent['outcome'];
}

/** `ticks` counts successful steps only. */
export interface FrameReport {
  readonly ticks: number;
  /** The clock dropped due ticks beyond MAX_TICKS_PER_FRAME; false in a cut frame. */
  readonly capped: boolean;
  readonly stop: 'recording-capacity' | null;
  /**
   * Why a tick ended the frame early, the run healthy: `transition` for a tick with transition events, `completed` for
   * the run's last tick.
   */
  readonly cut: 'transition' | 'completed' | null;
  /** That tick's transition events in event order, as frozen copies taken from the step's output; empty unless cut at a transition. */
  readonly transitions: readonly FrameTransition[];
  /** Set exactly when cut at the completion. */
  readonly completion: FrameCompletion | null;
}

export interface GameRuntime {
  /**
   * Advances by the ticks due at `nowMs` (monotonic milliseconds; the first call only anchors), at most
   * MAX_TICKS_PER_FRAME, then delivers the frame's events. Throws invalid-argument for a non-finite, backward or
   * unconvertible time, changing nothing; reentrant-call during the frame; listener-failed after the whole delivery;
   * faulted (see the module comment), once stopped recording-capacity, completed after the run's last tick, and
   * transition-hold behind the barrier.
   */
  frame(nowMs: number): FrameReport;
  /**
   * Keeps `intent` from the next tick on, until set again or cleared. Allowed in delivery; rejected once faulted,
   * stopped or completed (from the completed frame's delivery on), and with transition-hold behind the barrier (from
   * the cut frame's delivery on), changing nothing.
   */
  setIntent(intent: GameIntent): void;
  /**
   * Queues a copy of `command` and returns its ID, from 1 up. Throws invalid-argument for a command outside Core's
   * contract and command-queue-full at COMMAND_QUEUE_LIMIT pending, changing nothing; rejected as setIntent is.
   * Running out of IDs faults the Runtime.
   */
  submitCommand(command: Command): number;
  on<T extends DomainEventType>(type: T, listener: GameEventListener<Extract<DomainEvent, { type: T }>>): () => void;
  onAny(listener: GameEventListener): () => void;
  /** The last complete tick's projection, the same object until the next successful step. */
  projection(): Projection;
  renderFrame(): RenderFrame;
  /** An on-demand Core read outside the frame; a Core fault it finds faults the Runtime. Allowed when stopped or completed. */
  snapshot(): GameSnapshot;
  /** The recording so far, or null without one; as snapshot(). */
  exportRecording(): Recording | null;
  // Lifecycle operations for the Session, outside the frame (reentrant-call otherwise) and in any state. They never
  // touch Core, its RNG, entity IDs or the recording.
  /** Discards all host time progress: the next frame only anchors. Refused with `completed` after the run's last tick. */
  resetClock(): void;
  /** Clears the intent and the short-press mark and returns the queued, never executed IDs in FIFO order. */
  clearIntent(): readonly number[];
  /** previous = current, alpha = 0. */
  foldRenderState(): void;
  clearSubscriptions(): void;
  /** Lowers the barrier a transition cut raised; input and frames are accepted again. Refused with `completed`. */
  releaseTransitionBarrier(): void;
}

export const MAX_TICKS_PER_FRAME = 5;
export const COMMAND_QUEUE_LIMIT = 256;
/** The last ID issued; the next submission after it faults instead of wrapping. */
const LAST_COMMAND_ID = Number.MAX_SAFE_INTEGER - 1;

const PRIMARY_FIRE: Command = Object.freeze({ type: 'fire', channel: 'primary' });
const NEUTRAL_AXES: TickAxes = Object.freeze({ pitch: 0, yaw: 0, roll: 0 });
const NO_INTENT: GameIntent = Object.freeze({ axes: NEUTRAL_AXES, primaryFire: false });
const SPEC_FIELDS = [...CONTENT_INPUT_FIELDS, 'run', 'recording'] as const;

function invalid(path: string, reason: string): never {
  throw new GameRuntimeError({ kind: 'invalid-argument', path, reason });
}

/** Runs Core's input reader; its CoreInputError becomes invalid-argument with `from` in the path replaced by `to`. */
function coreInput<T>(read: () => T, from: string, to: string): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof CoreInputError) {
      throw new GameRuntimeError({ kind: 'invalid-argument', path: error.path.replace(from, to), reason: error.reason, cause: error });
    }
    throw error;
  }
}

/** A detached copy of a plain object of exactly `fields`, read as Core reads its input: data fields only, accessors never run. */
function readRecord<Field extends string>(value: unknown, path: string, fields: readonly Field[]): Readonly<Record<Field, unknown>> {
  return coreInput(() => readExactRecord(value, path, fields), path, path) as Record<Field, unknown>;
}

interface QueuedCommand {
  readonly id: number;
  readonly command: Command;
}

interface Batch {
  readonly input: TickInput;
  /** commandIndex → commandId; null for automatic fire. */
  readonly ids: readonly (number | null)[];
  /** How many queued commands the batch takes from the front of the queue. */
  readonly taken: number;
}

/** The delivery ID of `event` in a tick whose batch had `ids`; a result outside the batch breaks Core's contract. */
function deliveryId(event: DomainEvent, ids: readonly (number | null)[]): number | null {
  if (event.type !== 'command-result') return null;
  const id = ids[event.commandIndex];
  if (id === undefined) throw new RangeError('command-result index outside the tick batch');
  return id;
}

const submitted = (ids: readonly (number | null)[]): number[] => ids.filter((id): id is number => id !== null);

const NO_TRANSITIONS: readonly FrameTransition[] = Object.freeze([]);

/** What ends a frame at one tick: its `transition` events in event order, or its completion; most ticks allocate nothing. */
interface TickCut {
  readonly cut: FrameReport['cut'];
  readonly transitions: readonly FrameTransition[];
  readonly completion: FrameCompletion | null;
}
const NO_CUT: TickCut = Object.freeze({ cut: null, transitions: NO_TRANSITIONS, completion: null });

function cutOf(events: readonly DomainEvent[]): TickCut {
  let found: FrameTransition[] | null = null;
  let completion: FrameCompletion | null = null;
  for (const event of events) {
    if (event.type === 'transition') (found ??= []).push(Object.freeze({ gap: event.gap, tick: event.tick }));
    else if (event.type === 'mission-completed') completion = Object.freeze({ tick: event.tick, outcome: event.outcome });
  }
  if (found && completion) throw new RangeError('A tick produced both transition and mission-completed');
  if (completion) return { cut: 'completed', transitions: NO_TRANSITIONS, completion };
  return found ? { cut: 'transition', transitions: Object.freeze(found), completion: null } : NO_CUT;
}

class Runtime implements GameRuntime {
  readonly #world: World;
  readonly #recording: RecordingSession | null;
  readonly #clock: FixedStepClock;
  readonly #bus = new GameEventBus();
  #intent = NO_INTENT;
  /** Primary fire went from released to held since the last successful step. */
  #fireLatched = false;
  #queue: QueuedCommand[] = [];
  #nextCommandId = 1;
  #projection: Projection;
  #previous: RenderState;
  #current: RenderState;
  #renderFrame: RenderFrame;
  #inFrame = false;
  /**
   * Raised by a cut frame before its delivery: a transition's until the Session lowers it, the completion's for good.
   */
  #barrier: 'transition' | 'completed' | null = null;
  #stop: GameRuntimeError | null = null;
  #fault: GameRuntimeError | null = null;

  constructor(world: World, recording: RecordingSession | null) {
    this.#world = world;
    this.#recording = recording;
    this.#projection = world.projection();
    this.#previous = this.#current = world.renderState();
    this.#renderFrame = this.#publish(0);
    this.#clock = new FixedStepClock(CLOCK_UNITS_PER_SECOND / this.#projection.clock.clockUnitsPerTick, MAX_TICKS_PER_FRAME);
  }

  frame(nowMs: number): FrameReport {
    // A receiver of a cut frame meets the barrier first.
    if (this.#inFrame) this.#requireNoBarrier();
    this.#requireOutsideFrame();
    this.#requireRunnable();
    const timing = this.#clock.advance(nowMs);
    this.#inFrame = true;
    try {
      const pending: PendingDelivery[] = [];
      const undelivered: number[] = [];
      let ticks = 0;
      let found = NO_CUT;
      while (ticks < timing.ticks) {
        const events = this.#tick(pending, undelivered);
        if (events === null) break;
        ticks++;
        try {
          found = cutOf(events);
        } catch (cause) {
          throw this.#failRun(cause, undelivered);
        }
        if (found.cut !== null) break;
      }
      const { cut, transitions, completion } = found;
      // Before the delivery, so no receiver adds input behind the cut tick.
      this.#barrier = cut;
      if (this.#stop) this.#previous = this.#current;
      this.#renderFrame = this.#publish(this.#stop || cut !== null ? 0 : timing.alpha);
      // Only running out of command IDs in a receiver can fault the Runtime during delivery; that fault outranks the
      // receiver failures it causes.
      if (pending.length > 0) {
        try {
          this.#bus.dispatch(pending);
        } catch (error) {
          throw this.#fault ?? error;
        }
      }
      if (this.#fault) throw this.#fault;
      return Object.freeze({
        ticks, capped: timing.capped && cut === null, stop: this.#stop ? 'recording-capacity' : null, cut, transitions, completion,
      });
    } finally {
      this.#inFrame = false;
    }
  }

  setIntent(intent: GameIntent): void {
    this.#requireRunnable();
    const { axes, primaryFire } = readRecord(intent, 'intent', ['axes', 'primaryFire']);
    const read = coreInput(() => readTickInput({ axes, commands: [] }), 'tickInput.axes', 'intent.axes');
    if (typeof primaryFire !== 'boolean') invalid('intent.primaryFire', 'must be a boolean');
    if (primaryFire && !this.#intent.primaryFire) this.#fireLatched = true;
    this.#intent = Object.freeze({ axes: read.axes, primaryFire });
  }

  submitCommand(command: Command): number {
    this.#requireRunnable();
    const { commands } = coreInput(() => readTickInput({ axes: NEUTRAL_AXES, commands: [command] }), 'tickInput.commands[0]', 'command');
    if (this.#queue.length >= COMMAND_QUEUE_LIMIT) throw new GameRuntimeError({ kind: 'command-queue-full' });
    if (this.#nextCommandId > LAST_COMMAND_ID) throw this.#failRun(new RangeError('commandId exhausted'), []);
    const id = this.#nextCommandId++;
    this.#queue.push({ id, command: commands[0] });
    return id;
  }

  on<T extends DomainEventType>(type: T, listener: GameEventListener<Extract<DomainEvent, { type: T }>>): () => void {
    return this.#bus.on(type, listener);
  }

  onAny(listener: GameEventListener): () => void {
    return this.#bus.onAny(listener);
  }

  projection(): Projection {
    return this.#projection;
  }

  renderFrame(): RenderFrame {
    return this.#renderFrame;
  }

  snapshot(): GameSnapshot {
    this.#requireOutsideFrame();
    if (this.#fault) throw this.#fault;
    try {
      return this.#world.snapshot();
    } catch (cause) {
      throw this.#failRun(cause, []);
    }
  }

  exportRecording(): Recording | null {
    this.#requireOutsideFrame();
    if (this.#fault) throw this.#fault;
    if (!this.#recording) return null;
    try {
      return this.#recording.exportRecording();
    } catch (cause) {
      throw this.#failRun(cause, []);
    }
  }

  resetClock(): void {
    this.#requireOutsideFrame();
    this.#requireIncomplete();
    this.#clock.reset();
  }

  clearIntent(): readonly number[] {
    this.#requireOutsideFrame();
    const ids = Object.freeze(this.#queue.map((entry) => entry.id));
    this.#queue = [];
    this.#intent = NO_INTENT;
    this.#fireLatched = false;
    return ids;
  }

  foldRenderState(): void {
    this.#requireOutsideFrame();
    this.#previous = this.#current;
    this.#renderFrame = this.#publish(0);
  }

  clearSubscriptions(): void {
    this.#requireOutsideFrame();
    this.#bus.clear();
  }

  releaseTransitionBarrier(): void {
    this.#requireOutsideFrame();
    this.#requireIncomplete();
    this.#barrier = null;
  }

  /**
   * Runs one tick and collects its deliveries; `undelivered` gathers the IDs this frame's successful ticks executed.
   * Returns the tick's events, or null when the recording refused the tick (the Runtime has stopped); throws the fault
   * otherwise.
   */
  #tick(pending: PendingDelivery[], undelivered: number[]): readonly DomainEvent[] | null {
    const batch = this.#batch();
    let events: readonly DomainEvent[];
    try {
      events = this.#world.step(batch.input);
    } catch (cause) {
      if (this.#recording && cause instanceof CoreInputError && cause.path === 'recording') {
        this.#stop = new GameRuntimeError({ kind: 'recording-capacity', cause });
        return null;
      }
      // A CoreInputError leaves the world unchanged, so its batch provably never ran and stays queued; any other
      // failure may have run part of it, so it leaves the queue as unconfirmed.
      if (cause instanceof CoreInputError) throw this.#failRun(cause, undelivered);
      this.#queue.splice(0, batch.taken);
      throw this.#failRun(cause, [...undelivered, ...submitted(batch.ids)]);
    }
    this.#queue.splice(0, batch.taken);
    this.#fireLatched = false;
    undelivered.push(...submitted(batch.ids));
    try {
      for (const event of events) pending.push({ event, commandId: deliveryId(event, batch.ids) });
      const projection = this.#world.projection();
      const render = this.#world.renderState();
      this.#projection = projection;
      this.#previous = this.#current;
      this.#current = render;
    } catch (cause) {
      throw this.#failRun(cause, undelivered);
    }
    return events;
  }

  /** Automatic primary fire first, then queued commands in FIFO order, CORE_LIMITS.commandsPerTick in all. */
  #batch(): Batch {
    const fire = this.#intent.primaryFire || this.#fireLatched;
    const queued = this.#queue.slice(0, CORE_LIMITS.commandsPerTick - (fire ? 1 : 0));
    const commands = queued.map((entry) => entry.command);
    const ids: (number | null)[] = queued.map((entry) => entry.id);
    if (fire) {
      commands.unshift(PRIMARY_FIRE);
      ids.unshift(null);
    }
    return { input: { axes: this.#intent.axes, commands }, ids, taken: queued.length };
  }

  #publish(alpha: number): RenderFrame {
    return Object.freeze({ previous: this.#previous, current: this.#current, alpha });
  }

  /** Faults the Runtime once; the read model folds to the last complete tick. */
  #failRun(cause: unknown, unconfirmed: readonly number[]): GameRuntimeError {
    if (!this.#fault) {
      this.#fault = new GameRuntimeError({ kind: 'faulted', cause, unconfirmed });
      this.#previous = this.#current;
      this.#renderFrame = this.#publish(0);
    }
    return this.#fault;
  }

  #requireOutsideFrame(): void {
    if (this.#inFrame) throw new GameRuntimeError({ kind: 'reentrant-call' });
  }

  #requireRunnable(): void {
    if (this.#fault) throw this.#fault;
    if (this.#stop) throw this.#stop;
    this.#requireNoBarrier();
  }

  #requireNoBarrier(): void {
    if (this.#barrier === 'completed') throw new GameRuntimeError({ kind: 'completed' });
    if (this.#barrier === 'transition') throw new GameRuntimeError({ kind: 'transition-hold' });
  }

  #requireIncomplete(): void {
    if (this.#barrier === 'completed') throw new GameRuntimeError({ kind: 'completed' });
  }
}

/**
 * Creates a Runtime from `spec`: a recording session when `spec.recording` is set, otherwise a plain world. Throws
 * invalid-argument for a spec that is not an object of exactly its fields or whose run sets a step; every Core creation
 * error (ContentContractError, CoreInputError, CoreFaultError) passes through unchanged, and no Runtime exists.
 */
export function createGameRuntime(spec: GameRuntimeSpec): GameRuntime {
  const { run, recording, ...content } = readRecord(spec, 'spec', SPEC_FIELDS);
  if (typeof run === 'object' && run !== null && Object.hasOwn(run, 'clockUnitsPerTick')) {
    invalid('spec.run.clockUnitsPerTick', 'is not accepted: the Runtime runs only the default step');
  }
  const input = { ...content, run } as CreateWorldInput;
  if (recording === null) return new Runtime(createWorld(input), null);
  const session = createRecordingSession(input, recording as RecordingOptions);
  return new Runtime(session, session);
}
