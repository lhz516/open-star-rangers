/**
 * Synthetic demo scene for the P1 engineering skeleton: one entity moving along X and at most
 * one marker placed at a seeded random position. The rules, units, and numbers are invented to
 * exercise the architecture and are not original-game behaviour. Contract: docs/plan/p1/02/spec.md.
 */
import { CoreInputError } from './errors.ts';
import { nextRandom, type RngState } from './rng.ts';
import { SYNTHETIC_SNAPSHOT_FORMAT, SYNTHETIC_SNAPSHOT_VERSION } from './synthetic-snapshot.ts';

export const SYNTHETIC_DEFAULT_TICK_RATE_HZ = 60;
export const SYNTHETIC_MOVER_ID = 1;
/** Demo units per second at full axis input. */
export const SYNTHETIC_MOVE_SPEED = 1;
/** Marker coordinates lie in [SYNTHETIC_MARKER_MIN, SYNTHETIC_MARKER_MAX) on every axis. */
export const SYNTHETIC_MARKER_MIN = -5;
export const SYNTHETIC_MARKER_MAX = 5;
const SEED_MAX = 0xffffffff;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Positive safe integer, unique for the lifetime of a scene. */
export type EntityId = number;

export interface SyntheticSceneConfig {
  /** uint32 seed. */
  readonly seed: number;
  /** Fixed for the scene's lifetime; defaults to SYNTHETIC_DEFAULT_TICK_RATE_HZ. */
  readonly tickRateHz?: number;
}

export interface MoveInput {
  /** Normalised axis in [-1, 1]. */
  readonly moveX: number;
}

export type Command = { readonly type: 'add-marker' } | { readonly type: 'remove-marker' };

export interface TickInput {
  readonly input: MoveInput;
  /** Processed in array order. */
  readonly commands: readonly Command[];
}

interface CommandResult {
  readonly tick: number;
  readonly commandIndex: number;
}

export interface MarkerAddedEvent extends CommandResult {
  readonly type: 'marker-added';
  readonly entityId: EntityId;
  readonly position: Vec3;
}

export interface MarkerRemovedEvent extends CommandResult {
  readonly type: 'marker-removed';
  readonly entityId: EntityId;
  readonly position: Vec3;
}

export interface CommandRejectedEvent extends CommandResult {
  readonly type: 'command-rejected';
  readonly commandType: Command['type'];
  readonly reason: 'marker-already-exists' | 'marker-not-found';
}

/** Every event in this scene is the result of one command. */
export type DomainEvent = MarkerAddedEvent | MarkerRemovedEvent | CommandRejectedEvent;

export interface SyntheticEntity {
  readonly id: EntityId;
  readonly position: Vec3;
}

/** Complete authoritative state as detached plain data; the basis for later snapshots. */
export interface SyntheticSceneState {
  readonly scenario: 'synthetic';
  readonly tick: number;
  readonly tickRateHz: number;
  readonly seed: number;
  readonly rngState: RngState;
  readonly nextEntityId: EntityId;
  readonly mover: SyntheticEntity;
  readonly marker: SyntheticEntity | null;
}

export type SyntheticUiProjection = Pick<SyntheticSceneState, 'scenario' | 'tick' | 'tickRateHz' | 'mover' | 'marker'>;

export interface SyntheticRenderEntity extends SyntheticEntity {
  readonly kind: 'mover' | 'marker';
}

export interface SyntheticRenderState {
  readonly tick: number;
  /** Sorted by ID. */
  readonly entities: readonly SyntheticRenderEntity[];
}

/** Every read returns deeply frozen plain data, detached from internal state, that later ticks never change. */
export interface SyntheticScene {
  /**
   * Advances exactly one tick: commands in array order, then movement. Returns that tick's events.
   * Throws CoreInputError, leaving the scene unchanged, if the input breaks the contract or the
   * tick would leave the safe numeric range.
   */
  step(tickInput: TickInput): readonly DomainEvent[];
  inspect(): SyntheticSceneState;
  uiProjection(): SyntheticUiProjection;
  renderState(): SyntheticRenderState;
}

interface MutableEntity {
  readonly id: EntityId;
  readonly position: { x: number; y: number; z: number };
}

function mutableEntity({ id, position: { x, y, z } }: SyntheticEntity): MutableEntity {
  return { id, position: { x, y, z } };
}

function freezeVec({ x, y, z }: Vec3): Vec3 {
  return Object.freeze({ x, y, z });
}

function freezeEntity({ id, position }: MutableEntity): SyntheticEntity {
  return Object.freeze({ id, position: freezeVec(position) });
}

function freezeRenderEntity({ id, position }: MutableEntity, kind: SyntheticRenderEntity['kind']): SyntheticRenderEntity {
  return Object.freeze({ id, kind, position: freezeVec(position) });
}

function rejected(
  commandType: Command['type'],
  reason: CommandRejectedEvent['reason'],
  tick: number,
  commandIndex: number,
): CommandRejectedEvent {
  return Object.freeze({ type: 'command-rejected', tick, commandIndex, commandType, reason });
}

/** Checks that `value` is a non-array object whose own keys are all in `allowed`. */
function requireRecord(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CoreInputError(path, 'must be an object');
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new CoreInputError(`${path}.${key}`, 'is not a known field');
  }
  return value as Record<string, unknown>;
}

/** Like requireRecord, but every field must also be present as an own property. */
function requireExactRecord(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  const record = requireRecord(value, path, fields);
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) throw new CoreInputError(`${path}.${field}`, 'is required');
  }
  return record;
}

function isCommandType(value: unknown): value is Command['type'] {
  return value === 'add-marker' || value === 'remove-marker';
}

/**
 * Validates the whole tick input and returns a detached copy, so the caller's objects are never read again.
 * Exported for Core modules that must record exactly what a step executed; not part of SyntheticScene.
 */
export function readTickInput(value: unknown): { moveX: number; commandTypes: Command['type'][] } {
  const { input, commands } = requireRecord(value, 'tickInput', ['input', 'commands']);
  const { moveX } = requireRecord(input, 'tickInput.input', ['moveX']);
  // The range check also rejects NaN and ±Infinity.
  if (typeof moveX !== 'number' || !(moveX >= -1 && moveX <= 1)) {
    throw new CoreInputError('tickInput.input.moveX', 'must be a number from -1 to 1');
  }
  if (!Array.isArray(commands)) throw new CoreInputError('tickInput.commands', 'must be an array');
  const commandTypes: Command['type'][] = [];
  // An index loop, unlike forEach, also visits holes in sparse arrays.
  for (let index = 0; index < commands.length; index++) {
    const path = `tickInput.commands[${index}]`;
    const { type } = requireRecord(commands[index], path, ['type']);
    if (!isCommandType(type)) throw new CoreInputError(`${path}.type`, 'must be add-marker or remove-marker');
    commandTypes.push(type);
  }
  return { moveX, commandTypes };
}

/** What a command will do once committed. */
type CommandOutcome = 'add' | 'remove' | CommandRejectedEvent['reason'];

/**
 * Decides each command's outcome in order from marker presence alone. This is the only place the
 * marker rules live; deciding before any draw lets step() check every outcome before changing state.
 */
function planCommands(commandTypes: readonly Command['type'][], hasMarker: boolean): CommandOutcome[] {
  const outcomes: CommandOutcome[] = [];
  for (const type of commandTypes) {
    if (type === 'add-marker') {
      outcomes.push(hasMarker ? 'marker-already-exists' : 'add');
      hasMarker = true;
    } else {
      outcomes.push(hasMarker ? 'remove' : 'marker-not-found');
      hasMarker = false;
    }
  }
  return outcomes;
}

class Scene implements SyntheticScene {
  readonly #seed: number;
  readonly #tickRateHz: number;
  #tick: number;
  #rngState: RngState;
  #nextEntityId: EntityId;
  readonly #mover: MutableEntity;
  #marker: MutableEntity | null;

  /** `state` must already satisfy every invariant; the scene keeps its own copy. */
  constructor(state: SyntheticSceneState) {
    this.#seed = state.seed;
    this.#tickRateHz = state.tickRateHz;
    this.#tick = state.tick;
    this.#rngState = state.rngState;
    this.#nextEntityId = state.nextEntityId;
    this.#mover = mutableEntity(state.mover);
    this.#marker = state.marker && mutableEntity(state.marker);
  }

  step(tickInput: TickInput): readonly DomainEvent[] {
    // Everything that can fail is checked before the first state change.
    const { moveX, commandTypes } = readTickInput(tickInput);
    const outcomes = planCommands(commandTypes, this.#marker !== null);
    const tick = this.#tick + 1;
    if (!Number.isSafeInteger(tick)) throw new CoreInputError('tickInput', 'would advance the tick past the safe integer range');
    const adds = outcomes.filter((outcome) => outcome === 'add').length;
    if (!Number.isSafeInteger(this.#nextEntityId + adds)) {
      throw new CoreInputError('tickInput.commands', 'would allocate entity IDs past the safe integer range');
    }
    // Commands never move the mover, so its new position can be computed up front.
    const x = this.#mover.position.x + (moveX * SYNTHETIC_MOVE_SPEED) / this.#tickRateHz;
    if (!Number.isFinite(x)) throw new CoreInputError('tickInput.input.moveX', 'would move the mover to a non-finite position');

    const events: DomainEvent[] = [];
    for (let commandIndex = 0; commandIndex < outcomes.length; commandIndex++) {
      events.push(this.#commit(outcomes[commandIndex], commandTypes[commandIndex], tick, commandIndex));
    }
    this.#mover.position.x = x;
    this.#tick = tick;
    return Object.freeze(events);
  }

  #commit(outcome: CommandOutcome, commandType: Command['type'], tick: number, commandIndex: number): DomainEvent {
    switch (outcome) {
      case 'add': {
        // Property initialisers run in source order, so the draws are X, then Y, then Z.
        const marker = { id: this.#nextEntityId++, position: { x: this.#drawCoordinate(), y: this.#drawCoordinate(), z: this.#drawCoordinate() } };
        this.#marker = marker;
        return Object.freeze({ type: 'marker-added', tick, commandIndex, entityId: marker.id, position: freezeVec(marker.position) });
      }
      case 'remove': {
        // planCommands only removes when a marker exists.
        const { id, position } = this.#marker!;
        this.#marker = null;
        return Object.freeze({ type: 'marker-removed', tick, commandIndex, entityId: id, position: freezeVec(position) });
      }
      default:
        return rejected(commandType, outcome, tick, commandIndex);
    }
  }

  #drawCoordinate(): number {
    const { value, state } = nextRandom(this.#rngState);
    this.#rngState = state;
    return SYNTHETIC_MARKER_MIN + (SYNTHETIC_MARKER_MAX - SYNTHETIC_MARKER_MIN) * value;
  }

  inspect(): SyntheticSceneState {
    return Object.freeze({
      scenario: 'synthetic',
      tick: this.#tick,
      tickRateHz: this.#tickRateHz,
      seed: this.#seed,
      rngState: this.#rngState,
      nextEntityId: this.#nextEntityId,
      mover: freezeEntity(this.#mover),
      marker: this.#marker && freezeEntity(this.#marker),
    });
  }

  uiProjection(): SyntheticUiProjection {
    return Object.freeze({
      scenario: 'synthetic',
      tick: this.#tick,
      tickRateHz: this.#tickRateHz,
      mover: freezeEntity(this.#mover),
      marker: this.#marker && freezeEntity(this.#marker),
    });
  }

  renderState(): SyntheticRenderState {
    // The mover has the lowest ID, so this order is already sorted by ID.
    const entities = [freezeRenderEntity(this.#mover, 'mover')];
    if (this.#marker) entities.push(freezeRenderEntity(this.#marker, 'marker'));
    return Object.freeze({ tick: this.#tick, entities: Object.freeze(entities) });
  }
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= SEED_MAX;
}

function isTickRate(value: number): boolean {
  return value > 0 && Number.isFinite(value) && Number.isFinite(1 / value);
}

const UINT32_RULE = `must be an integer from 0 to ${SEED_MAX}`;
const TICK_RATE_RULE = 'must be a finite positive number with a finite reciprocal';

export function createSyntheticScene(config: SyntheticSceneConfig): SyntheticScene {
  const { seed, tickRateHz = SYNTHETIC_DEFAULT_TICK_RATE_HZ } = requireRecord(config, 'config', ['seed', 'tickRateHz']);
  if (typeof seed !== 'number' || !isUint32(seed)) throw new CoreInputError('config.seed', UINT32_RULE);
  if (typeof tickRateHz !== 'number' || !isTickRate(tickRateHz)) throw new CoreInputError('config.tickRateHz', TICK_RATE_RULE);
  // `>>> 0` keeps a uint32 and turns -0 into 0, the same seed.
  const uint32Seed = seed >>> 0;
  return new Scene({
    scenario: 'synthetic',
    tick: 0,
    tickRateHz,
    seed: uint32Seed,
    rngState: uint32Seed,
    nextEntityId: SYNTHETIC_MOVER_ID + 1,
    mover: { id: SYNTHETIC_MOVER_ID, position: { x: 0, y: 0, z: 0 } },
    marker: null,
  });
}

/** A validity check on a number and the message used when it fails. */
type NumberRule = readonly [valid: (value: number) => boolean, rule: string];

const FINITE: NumberRule = [Number.isFinite, 'must be a finite number'];
const ZERO: NumberRule = [(value) => value === 0, 'must be 0'];
const MARKER_COORDINATE: NumberRule = [
  (value) => value >= SYNTHETIC_MARKER_MIN && value < SYNTHETIC_MARKER_MAX,
  `must be a number in [${SYNTHETIC_MARKER_MIN}, ${SYNTHETIC_MARKER_MAX})`,
];

/** Returns `value` with -0 normalised to +0 (`-0 + 0` is `+0`), or throws if it is not a number passing `rule`. */
function readNumber(value: unknown, path: string, [valid, rule]: NumberRule): number {
  if (typeof value !== 'number' || !valid(value)) throw new CoreInputError(path, rule);
  return value + 0;
}

function readVec(value: unknown, path: string, x: NumberRule, y: NumberRule, z: NumberRule): Vec3 {
  const position = requireExactRecord(value, path, ['x', 'y', 'z']);
  return { x: readNumber(position.x, `${path}.x`, x), y: readNumber(position.y, `${path}.y`, y), z: readNumber(position.z, `${path}.z`, z) };
}

function readMover(value: unknown, path: string): SyntheticEntity {
  const { id, position } = requireExactRecord(value, path, ['id', 'position']);
  if (id !== SYNTHETIC_MOVER_ID) throw new CoreInputError(`${path}.id`, `must be ${SYNTHETIC_MOVER_ID}`);
  return { id: SYNTHETIC_MOVER_ID, position: readVec(position, `${path}.position`, FINITE, ZERO, ZERO) };
}

function readMarker(value: unknown, path: string, nextEntityId: EntityId): SyntheticEntity | null {
  if (value === null) return null;
  const { id, position } = requireExactRecord(value, path, ['id', 'position']);
  const markerId = readNumber(id, `${path}.id`, [
    (n) => Number.isSafeInteger(n) && n > SYNTHETIC_MOVER_ID && n < nextEntityId,
    `must be a safe integer from ${SYNTHETIC_MOVER_ID + 1} to below nextEntityId`,
  ]);
  return { id: markerId, position: readVec(position, `${path}.position`, MARKER_COORDINATE, MARKER_COORDINATE, MARKER_COORDINATE) };
}

const TICK: NumberRule = [(value) => Number.isSafeInteger(value) && value >= 0, 'must be a non-negative safe integer'];
const NEXT_ENTITY_ID: NumberRule = [
  (value) => Number.isSafeInteger(value) && value > SYNTHETIC_MOVER_ID,
  `must be a safe integer of at least ${SYNTHETIC_MOVER_ID + 1}`,
];
const STATE_FIELDS = ['scenario', 'tick', 'tickRateHz', 'seed', 'rngState', 'nextEntityId', 'mover', 'marker'] as const;

function readSnapshotState(value: unknown): SyntheticSceneState {
  const path = 'snapshot.state';
  const state = requireExactRecord(value, path, STATE_FIELDS);
  if (state.scenario !== 'synthetic') throw new CoreInputError(`${path}.scenario`, 'must be synthetic');
  const tick = readNumber(state.tick, `${path}.tick`, TICK);
  const tickRateHz = readNumber(state.tickRateHz, `${path}.tickRateHz`, [isTickRate, TICK_RATE_RULE]);
  const seed = readNumber(state.seed, `${path}.seed`, [isUint32, UINT32_RULE]);
  const rngState = readNumber(state.rngState, `${path}.rngState`, [isUint32, UINT32_RULE]);
  const nextEntityId = readNumber(state.nextEntityId, `${path}.nextEntityId`, NEXT_ENTITY_ID);
  const mover = readMover(state.mover, `${path}.mover`);
  const marker = readMarker(state.marker, `${path}.marker`, nextEntityId);
  return { scenario: 'synthetic', tick, tickRateHz, seed, rngState, nextEntityId, mover, marker };
}

/**
 * Restores an independent scene from snapshot data, e.g. after a JSON round trip. Validates
 * structure and invariants only, not whether some history could reach the state; throws
 * CoreInputError at a `snapshot…` path without building a scene if anything is invalid.
 */
export function restoreSyntheticScene(snapshot: unknown): SyntheticScene {
  const { format, version, state } = requireExactRecord(snapshot, 'snapshot', ['format', 'version', 'state']);
  if (format !== SYNTHETIC_SNAPSHOT_FORMAT) throw new CoreInputError('snapshot.format', `must be ${SYNTHETIC_SNAPSHOT_FORMAT}`);
  if (version !== SYNTHETIC_SNAPSHOT_VERSION) throw new CoreInputError('snapshot.version', `must be ${SYNTHETIC_SNAPSHOT_VERSION}`);
  return new Scene(readSnapshotState(state));
}
