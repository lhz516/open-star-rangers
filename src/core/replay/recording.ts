/**
 * Recording of formal Core runs (docs/plan/p3/02/spec.md, 快照、哈希与 replay; 上限). A recording session is a world
 * that also records, from tick 0, the canonical input it actually gave every successful step, every event, and a
 * checkpoint (the state hash, snapshot.ts) at tick 0, at every positive multiple of the checkpoint interval and at the
 * last tick, once each. Its export is the replay record and the run's result, deeply frozen and detached: later ticks
 * never change an earlier export.
 *
 * Capacity (CORE_LIMITS.recorded*): a step the recording could not hold is refused with CoreInputError before it runs,
 * leaving the world and the recording unchanged (requireRecordingCapacity). After a Core fault (CoreFaultError) every
 * call, export included, throws the fault: the session never exports a prefix that looks like a complete run.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { ContentIdentity } from '../../content/content-identity.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { CORE_LIMITS, fitsLimit } from '../contracts/limits.ts';
import { readTickInput, type TickInput } from '../contracts/tick-input.ts';
import { integerIn, readExactRecord, readNumber } from '../contracts/validation.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import type { Projection } from '../projections/projection.ts';
import type { RenderState } from '../projections/render-state.ts';
import { initialWorldState, type CreateWorldInput } from '../world/create-world.ts';
import type { EffectiveRunConfig } from '../world/run-config.ts';
import { constructWorld, type World } from '../world/world.ts';
import type { WorldState } from '../world/world-state.ts';
import { RULES_VERSION } from './rules-version.ts';
import { snapshotHash, type GameSnapshot } from './snapshot.ts';

export const GAME_REPLAY_FORMAT = 'osr-game-replay';
/** 3 since P3-08's `drop-transponder` changed the inputs a record may hold (docs/plan/p3/02/spec.md, CR-25). */
export const GAME_REPLAY_VERSION = 3;
/** The longest producer label. */
export const PRODUCER_MAX_LENGTH = 128;

/** Everything a replay needs besides the content: `ticks[k]` is the input of tick k + 1. */
export interface ReplayRecord {
  readonly format: typeof GAME_REPLAY_FORMAT;
  readonly version: typeof GAME_REPLAY_VERSION;
  readonly rulesVersion: number;
  /** The producing application's version label, for diagnostics only: a string of 1 to PRODUCER_MAX_LENGTH UTF-16 code units. */
  readonly producer: string;
  /** The full identity of the content the run used; compared with contentIdentityKey. */
  readonly content: ContentIdentity;
  readonly mission: AssetId;
  readonly setupHash: string;
  /** The run configuration in effect, defaults applied. */
  readonly run: EffectiveRunConfig;
  /** A positive safe integer. */
  readonly checkpointInterval: number;
  /** Dense: an idle tick is an input without commands, never a hole. */
  readonly ticks: readonly TickInput[];
}

export interface ReplayCheckpoint {
  readonly tick: number;
  /** The state hash after that tick. */
  readonly hash: string;
}

/** The observable outcome of a run. */
export interface ReplayResult {
  /** By tick, each tick's in emission order. */
  readonly events: readonly DomainEvent[];
  /** Strictly increasing by tick, from tick 0 to the final tick. */
  readonly checkpoints: readonly ReplayCheckpoint[];
  /** The number of ticks the run stepped. */
  readonly finalTick: number;
}

export interface Recording {
  readonly record: ReplayRecord;
  readonly result: ReplayResult;
}

export interface RecordingOptions {
  readonly producer: string;
  readonly checkpointInterval: number;
}

/** A world that records; its step() also refuses ticks beyond the recording capacity. */
export interface RecordingSession extends World {
  /** The record and result so far. Throws the session's CoreFaultError once Core has failed. */
  exportRecording(): Recording;
}

const HASH = /^[0-9a-f]{16}$/;

export function readProducer(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > PRODUCER_MAX_LENGTH) {
    throw new CoreInputError(path, `must be a string of 1 to ${PRODUCER_MAX_LENGTH} characters`);
  }
  return value;
}

export function readCheckpointInterval(value: unknown, path: string): number {
  return readNumber(value, path, integerIn(1, Number.MAX_SAFE_INTEGER));
}

/** Reads a setupHash or state hash: 16 lowercase hex digits. */
export function readHash(value: unknown, path: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) throw new CoreInputError(path, 'must be 16 lowercase hex digits');
  return value;
}

/** What a recording holds so far. */
export interface RecordedCounts {
  readonly ticks: number;
  readonly commands: number;
  readonly events: number;
}

/**
 * Throws CoreInputError at `recording` unless a recording holding `counts` can hold one more tick with `commands`
 * commands. A tick's events are unknown until it runs, so the tick must fit even at CORE_LIMITS.eventsPerTick events.
 * Checkpoints need no check: recordedCheckpoints covers the most a run of recordedTicks ticks can take (interval 1).
 */
export function requireRecordingCapacity(counts: RecordedCounts, commands: number): void {
  if (!fitsLimit('recordedTicks', counts.ticks, 1)) throw new CoreInputError('recording', `would exceed ${CORE_LIMITS.recordedTicks} recorded ticks`);
  if (!fitsLimit('recordedCommands', counts.commands, commands)) {
    throw new CoreInputError('recording', `would exceed ${CORE_LIMITS.recordedCommands} recorded commands`);
  }
  if (!fitsLimit('recordedEvents', counts.events, CORE_LIMITS.eventsPerTick)) {
    throw new CoreInputError('recording', `could exceed ${CORE_LIMITS.recordedEvents} recorded events`);
  }
}

type RecordHeader = Omit<ReplayRecord, 'ticks'>;

class CoreRecordingSession implements RecordingSession {
  readonly #world: World;
  readonly #header: RecordHeader;
  readonly #ticks: TickInput[] = [];
  readonly #events: DomainEvent[] = [];
  readonly #checkpoints: ReplayCheckpoint[] = [];
  #commands = 0;
  #fault: CoreFaultError | null = null;

  constructor(world: World, header: RecordHeader) {
    this.#world = world;
    this.#header = header;
    this.#checkpoints.push(this.#checkpoint(0));
  }

  step(tickInput: TickInput): readonly DomainEvent[] {
    this.#throwIfFaulted();
    // Read the caller's input once and step with that copy, so the record holds exactly what ran.
    const input = readTickInput(tickInput);
    requireRecordingCapacity({ ticks: this.#ticks.length, commands: this.#commands, events: this.#events.length }, input.commands.length);
    const events = this.#run(() => this.#world.step(input));
    this.#ticks.push(input);
    this.#commands += input.commands.length;
    for (const event of events) this.#events.push(event);
    const tick = this.#ticks.length;
    if (tick % this.#header.checkpointInterval === 0) this.#checkpoints.push(this.#checkpoint(tick));
    return events;
  }

  projection(): Projection {
    this.#throwIfFaulted();
    return this.#run(() => this.#world.projection());
  }

  renderState(): RenderState {
    this.#throwIfFaulted();
    return this.#run(() => this.#world.renderState());
  }

  snapshot(): GameSnapshot {
    this.#throwIfFaulted();
    return this.#run(() => this.#world.snapshot());
  }

  exportRecording(): Recording {
    this.#throwIfFaulted();
    const finalTick = this.#ticks.length;
    const checkpoints = [...this.#checkpoints];
    if (checkpoints[checkpoints.length - 1].tick !== finalTick) checkpoints.push(this.#checkpoint(finalTick));
    // Inputs, events and checkpoints are frozen already, so fresh frozen lists detach the export.
    return Object.freeze({
      record: Object.freeze({ ...this.#header, ticks: Object.freeze([...this.#ticks]) }),
      result: Object.freeze({ events: Object.freeze([...this.#events]), checkpoints: Object.freeze(checkpoints), finalTick }),
    });
  }

  #checkpoint(tick: number): ReplayCheckpoint {
    const snapshot = this.#run(() => this.#world.snapshot());
    try {
      return Object.freeze({ tick, hash: snapshotHash(snapshot) });
    } catch (error) {
      // Core keeps every number finite and its state far below the text limit, so this is Core's failure, not the caller's.
      const fault = new CoreFaultError('invariant-violated', 'recording.checkpoint');
      fault.cause = error;
      this.#fault = fault;
      throw fault;
    }
  }

  /** Runs a call on the world; a CoreFaultError it throws also latches the session. */
  #run<Result>(work: () => Result): Result {
    try {
      return work();
    } catch (error) {
      if (error instanceof CoreFaultError) this.#fault = error;
      throw error;
    }
  }

  #throwIfFaulted(): void {
    if (this.#fault) throw this.#fault;
  }
}

/**
 * Internal: starts recording a world around `state`, as world creation produced it, for createRecordingSession, replay
 * and Core tests; not a public entry. Throws CoreInputError at `options…` for invalid options.
 */
export function recordState(state: WorldState, options: RecordingOptions): RecordingSession {
  const { producer, checkpointInterval } = readExactRecord(options, 'options', ['producer', 'checkpointInterval']);
  const { content, mission, setupHash, rawDifficulty, wingman, seed, clockUnitsPerTick } = state.config;
  const header: RecordHeader = Object.freeze({
    format: GAME_REPLAY_FORMAT,
    version: GAME_REPLAY_VERSION,
    rulesVersion: RULES_VERSION,
    producer: readProducer(producer, 'options.producer'),
    content: Object.freeze({ ...content, origin: Object.freeze({ ...content.origin }) }),
    mission,
    setupHash,
    run: Object.freeze({ rawDifficulty, wingman, seed, clockUnitsPerTick }),
    checkpointInterval: readCheckpointInterval(checkpointInterval, 'options.checkpointInterval'),
  });
  return new CoreRecordingSession(constructWorld(state), header);
}

/**
 * Creates a world as createWorld does and records it from tick 0. Throws what createWorld throws, and CoreInputError at
 * `options…` for a producer or checkpoint interval outside the contract.
 */
export function createRecordingSession(input: CreateWorldInput, options: RecordingOptions): RecordingSession {
  return recordState(initialWorldState(input), options);
}
