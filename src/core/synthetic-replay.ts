/**
 * Input recording, replay and result comparison for the synthetic scene. A recording holds the input
 * of every tick that stepped successfully; its result is the event stream and periodic state-hash
 * checkpoints. Consistency holds only for the same code version and JS runtime. Contract:
 * docs/plan/p1/03/spec.md.
 */
import { CoreInputError } from './errors.ts';
import {
  createSyntheticScene,
  ENTITY_ID,
  MARKER_COORDINATE,
  NON_NEGATIVE_SAFE_INTEGER,
  readNumber,
  readTickInput,
  readVec,
  requireExactRecord,
  type CommandRejectedEvent,
  type DomainEvent,
  type MarkerAddedEvent,
  type MarkerRemovedEvent,
  type NumberRule,
  type SyntheticScene,
  type SyntheticSceneConfig,
  type SyntheticSceneState,
  type SyntheticRenderState,
  type SyntheticUiProjection,
  type TickInput,
  type Vec3,
} from './synthetic-scene.ts';
import { hashSyntheticScene } from './synthetic-snapshot.ts';

export const SYNTHETIC_REPLAY_FORMAT = 'osr-synthetic-replay';
export const SYNTHETIC_REPLAY_VERSION = 1;

/** The effective scene config; unlike SyntheticSceneConfig, tickRateHz is always present. */
export interface SyntheticReplayConfig {
  readonly seed: number;
  readonly tickRateHz: number;
}

/** Everything needed to replay a run from its creation config. */
export interface SyntheticReplayRecord {
  readonly format: typeof SYNTHETIC_REPLAY_FORMAT;
  readonly version: typeof SYNTHETIC_REPLAY_VERSION;
  readonly config: SyntheticReplayConfig;
  /** Positive safe integer. */
  readonly checkpointInterval: number;
  /** Inputs of the successfully stepped ticks in order; ticks[0] is simulation tick 1. */
  readonly ticks: readonly TickInput[];
}

export interface SyntheticReplayCheckpoint {
  readonly tick: number;
  /** State hash after that tick, as from hashSyntheticScene. */
  readonly hash: string;
}

/**
 * The observable outcome of a run. Checkpoints are at tick 0, every positive multiple of the
 * interval, and the final tick; the last checkpoint's tick is the final tick.
 */
export interface SyntheticReplayResult {
  /** Sorted by tick, then commandIndex. */
  readonly events: readonly DomainEvent[];
  /** Strictly increasing by tick. */
  readonly checkpoints: readonly SyntheticReplayCheckpoint[];
}

export interface SyntheticRecording {
  readonly record: SyntheticReplayRecord;
  readonly result: SyntheticReplayResult;
}

/** Behaves exactly like a SyntheticScene and can also export what it has recorded so far. */
export interface SyntheticRecordingSession extends SyntheticScene {
  /** Deeply frozen data that later recording never changes; exporting does not change the scene. */
  exportRecording(): SyntheticRecording;
}

/** Validates tick input like SyntheticScene.step and returns a deeply frozen copy with only the contract fields. */
function canonicalTickInput(value: unknown): TickInput {
  const { moveX, commandTypes } = readTickInput(value);
  return Object.freeze({
    // `+ 0` records -0 as 0, which moves the mover identically.
    input: Object.freeze({ moveX: moveX + 0 }),
    commands: Object.freeze(commandTypes.map((type) => Object.freeze({ type }))),
  });
}

function checkpointOf(scene: SyntheticScene, tick: number): SyntheticReplayCheckpoint {
  return Object.freeze({ tick, hash: hashSyntheticScene(scene) });
}

class RecordingSession implements SyntheticRecordingSession {
  readonly #scene: SyntheticScene;
  readonly #config: SyntheticReplayConfig;
  readonly #checkpointInterval: number;
  readonly #ticks: TickInput[] = [];
  readonly #events: DomainEvent[] = [];
  readonly #checkpoints: SyntheticReplayCheckpoint[];

  constructor(scene: SyntheticScene, checkpointInterval: number) {
    const { seed, tickRateHz } = scene.inspect();
    this.#scene = scene;
    this.#config = Object.freeze({ seed, tickRateHz });
    this.#checkpointInterval = checkpointInterval;
    this.#checkpoints = [checkpointOf(scene, 0)];
  }

  step(tickInput: TickInput): readonly DomainEvent[] {
    // Read the caller's objects once and step with that copy, so the record is exactly what ran.
    const executed = canonicalTickInput(tickInput);
    const events = this.#scene.step(executed);
    this.#ticks.push(executed);
    for (const event of events) this.#events.push(event);
    // The scene starts at tick 0 and advances one tick per successful step.
    const tick = this.#ticks.length;
    if (tick % this.#checkpointInterval === 0) this.#checkpoints.push(checkpointOf(this.#scene, tick));
    return events;
  }

  inspect(): SyntheticSceneState {
    return this.#scene.inspect();
  }

  uiProjection(): SyntheticUiProjection {
    return this.#scene.uiProjection();
  }

  renderState(): SyntheticRenderState {
    return this.#scene.renderState();
  }

  exportRecording(): SyntheticRecording {
    const finalTick = this.#ticks.length;
    const checkpoints = [...this.#checkpoints];
    if (checkpoints[checkpoints.length - 1].tick !== finalTick) checkpoints.push(checkpointOf(this.#scene, finalTick));
    // Elements are already frozen, so fresh frozen arrays are enough to detach the export.
    return Object.freeze({
      record: Object.freeze({
        format: SYNTHETIC_REPLAY_FORMAT,
        version: SYNTHETIC_REPLAY_VERSION,
        config: this.#config,
        checkpointInterval: this.#checkpointInterval,
        ticks: Object.freeze([...this.#ticks]),
      }),
      result: Object.freeze({ events: Object.freeze([...this.#events]), checkpoints: Object.freeze(checkpoints) }),
    });
  }
}

/**
 * Starts recording on a new scene that the session owns, so the record always begins at the
 * creation config. Config errors are those of createSyntheticScene; the interval must be a
 * positive safe integer.
 */
export function createSyntheticRecordingSession(config: SyntheticSceneConfig, checkpointInterval: number): SyntheticRecordingSession {
  const scene = createSyntheticScene(config);
  if (!Number.isSafeInteger(checkpointInterval) || checkpointInterval < 1) {
    throw new CoreInputError('checkpointInterval', 'must be a positive safe integer');
  }
  return new RecordingSession(scene, checkpointInterval);
}

/** For rethrowing: a CoreInputError moved to the path `rewrite` gives; any other error unchanged. */
function repathed(error: unknown, rewrite: (path: string) => string): unknown {
  return error instanceof CoreInputError ? new CoreInputError(rewrite(error.path), error.reason) : error;
}

const TICK_INPUT_PATH = 'tickInput';

/** Moves a scene input error path, rooted at `tickInput`, under `record.ticks[index]`. */
function tickPath(index: number, path: string): string {
  const field = path.startsWith(TICK_INPUT_PATH) ? path.slice(TICK_INPUT_PATH.length) : `.${path}`;
  return `record.ticks[${index}]${field}`;
}

/** Checks that `value` is an array without holes. */
function requireDenseArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new CoreInputError(path, 'must be an array');
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) throw new CoreInputError(`${path}[${index}]`, 'is missing');
  }
  return value;
}

const RECORD_FIELDS = ['format', 'version', 'config', 'checkpointInterval', 'ticks'];

/**
 * Replays a record on a new scene and returns the same result shape as recording. The whole record
 * structure is validated before the first step; any invalid content, including a tick that a Core
 * guard rejects, throws CoreInputError at a `record…` path, e.g. `record.ticks[12].commands[0].type`,
 * and no partial result is returned.
 */
export function replaySyntheticRecord(record: unknown): SyntheticReplayResult {
  const { format, version, config, checkpointInterval, ticks } = requireExactRecord(record, 'record', RECORD_FIELDS);
  if (format !== SYNTHETIC_REPLAY_FORMAT) throw new CoreInputError('record.format', `must be ${SYNTHETIC_REPLAY_FORMAT}`);
  if (version !== SYNTHETIC_REPLAY_VERSION) throw new CoreInputError('record.version', `must be ${SYNTHETIC_REPLAY_VERSION}`);
  const { seed, tickRateHz } = requireExactRecord(config, 'record.config', ['seed', 'tickRateHz']);
  // Required here, although createSyntheticScene would default it.
  if (tickRateHz === undefined) throw new CoreInputError('record.config.tickRateHz', 'is required');
  let session: SyntheticRecordingSession;
  try {
    session = createSyntheticRecordingSession({ seed, tickRateHz } as SyntheticSceneConfig, checkpointInterval as number);
  } catch (error) {
    // Session errors are at `config.*` or `checkpointInterval`.
    throw repathed(error, (path) => `record.${path}`);
  }
  // A hole is not an idle tick.
  const tickList = requireDenseArray(ticks, 'record.ticks');
  const inputs: TickInput[] = [];
  for (let index = 0; index < tickList.length; index++) {
    try {
      inputs.push(canonicalTickInput(tickList[index]));
    } catch (error) {
      throw repathed(error, (path) => tickPath(index, path));
    }
  }
  // Every tick is structurally valid now; only state-dependent guards can still fail.
  for (let index = 0; index < inputs.length; index++) {
    try {
      session.step(inputs[index]);
    } catch (error) {
      throw repathed(error, (path) => tickPath(index, path));
    }
  }
  return session.exportRecording().result;
}

/** Difference data, not an error: the earliest tick whose events or checkpoint differ. */
export type SyntheticReplayComparison =
  | { readonly match: true }
  | { readonly match: false; readonly tick: number; readonly kind: 'events' | 'checkpoint' };

const HASH_PATTERN = /^[0-9a-f]{16}$/;
const REJECTION_REASONS: Readonly<Record<CommandRejectedEvent['commandType'], CommandRejectedEvent['reason']>> = {
  'add-marker': 'marker-already-exists',
  'remove-marker': 'marker-not-found',
};
// `satisfies` makes a new DomainEvent variant a compile error here until it is validated.
const EVENT_FIELDS = {
  'marker-added': ['type', 'tick', 'commandIndex', 'entityId', 'position'],
  'marker-removed': ['type', 'tick', 'commandIndex', 'entityId', 'position'],
  'command-rejected': ['type', 'tick', 'commandIndex', 'commandType', 'reason'],
} as const satisfies { readonly [Type in DomainEvent['type']]: readonly (keyof Extract<DomainEvent, { type: Type }>)[] };

function isEventType(value: unknown): value is DomainEvent['type'] {
  return typeof value === 'string' && Object.hasOwn(EVENT_FIELDS, value);
}

/** Validates one event against the DomainEvent union, reading each field once, and returns a detached copy. */
function readEvent(value: unknown, path: string, tickRule: NumberRule): DomainEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CoreInputError(path, 'must be an object');
  const { type } = value as { readonly type?: unknown };
  if (!isEventType(type)) throw new CoreInputError(`${path}.type`, 'must be marker-added, marker-removed or command-rejected');
  const event = requireExactRecord(value, path, EVENT_FIELDS[type]);
  const tick = readNumber(event.tick, `${path}.tick`, tickRule);
  const commandIndex = readNumber(event.commandIndex, `${path}.commandIndex`, NON_NEGATIVE_SAFE_INTEGER);
  if (type === 'command-rejected') {
    const { commandType, reason } = event;
    if (commandType !== 'add-marker' && commandType !== 'remove-marker') {
      throw new CoreInputError(`${path}.commandType`, 'must be add-marker or remove-marker');
    }
    const expectedReason = REJECTION_REASONS[commandType];
    if (reason !== expectedReason) throw new CoreInputError(`${path}.reason`, `must be ${expectedReason}`);
    return { type, tick, commandIndex, commandType, reason: expectedReason };
  }
  const entityId = readNumber(event.entityId, `${path}.entityId`, ENTITY_ID);
  const position = readVec(event.position, `${path}.position`, MARKER_COORDINATE, MARKER_COORDINATE, MARKER_COORDINATE);
  return { type, tick, commandIndex, entityId, position };
}

/**
 * Validates a result's structure and invariants (technical decision 10) at `root…` paths and returns
 * a detached copy. It does not replay event history or infer the checkpoint interval; replaying the
 * record guarantees those.
 */
function readResult(value: unknown, root: string): SyntheticReplayResult {
  const { events, checkpoints } = requireExactRecord(value, root, ['events', 'checkpoints']);
  const checkpointList = requireDenseArray(checkpoints, `${root}.checkpoints`);
  const eventList = requireDenseArray(events, `${root}.events`);
  if (checkpointList.length === 0) throw new CoreInputError(`${root}.checkpoints`, 'must not be empty');

  const readCheckpoints: SyntheticReplayCheckpoint[] = [];
  let previousTick = -1;
  checkpointList.forEach((item, index) => {
    const path = `${root}.checkpoints[${index}]`;
    // Each field is read once, so what is stored is what was validated.
    const { tick: tickValue, hash } = requireExactRecord(item, path, ['tick', 'hash']);
    const tick = readNumber(tickValue, `${path}.tick`, NON_NEGATIVE_SAFE_INTEGER);
    if (index === 0 && tick !== 0) throw new CoreInputError(`${path}.tick`, 'must be 0');
    if (tick <= previousTick) throw new CoreInputError(`${path}.tick`, 'must be greater than the previous checkpoint tick');
    if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) throw new CoreInputError(`${path}.hash`, 'must be 16 lowercase hex digits');
    readCheckpoints.push({ tick, hash });
    previousTick = tick;
  });

  // The last checkpoint is the final tick.
  const finalTick = previousTick;
  const tickRule: NumberRule = [(tick) => Number.isSafeInteger(tick) && tick >= 1 && tick <= finalTick, `must be a safe integer from 1 to ${finalTick}`];
  const readEvents: DomainEvent[] = [];
  eventList.forEach((item, index) => {
    const path = `${root}.events[${index}]`;
    const event = readEvent(item, path, tickRule);
    const previous = readEvents[readEvents.length - 1];
    if (previous && event.tick < previous.tick) throw new CoreInputError(`${path}.tick`, 'must not be below the previous event tick');
    const expectedIndex = previous?.tick === event.tick ? previous.commandIndex + 1 : 0;
    if (event.commandIndex !== expectedIndex) throw new CoreInputError(`${path}.commandIndex`, `must be ${expectedIndex}`);
    readEvents.push(event);
  });
  return { events: readEvents, checkpoints: readCheckpoints };
}

function sameVec(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Field-by-field equality; `===` also treats -0 and 0 as equal. */
function sameEvent(a: DomainEvent, b: DomainEvent): boolean {
  if (a.type !== b.type || a.tick !== b.tick || a.commandIndex !== b.commandIndex) return false;
  if (a.type === 'command-rejected') {
    const other = b as CommandRejectedEvent;
    return a.commandType === other.commandType && a.reason === other.reason;
  }
  const other = b as MarkerAddedEvent | MarkerRemovedEvent;
  return a.entityId === other.entityId && sameVec(a.position, other.position);
}

/**
 * Compares two results, e.g. a recording's and its replay's, possibly after a JSON round trip. Both
 * are validated first; invalid structure throws CoreInputError at an `expected…` or `actual…` path.
 * Reports the earliest observable difference: a tick whose events differ (`events`, which wins when
 * the checkpoint also differs) or whose checkpoint presence or hash differs (`checkpoint`). With an
 * interval above 1, a state deviation that is gone by the next checkpoint may go unreported.
 */
export function compareSyntheticReplayResults(expected: unknown, actual: unknown): SyntheticReplayComparison {
  const left = readResult(expected, 'expected');
  const right = readResult(actual, 'actual');
  // Both sequences are sorted by tick, so cursors visit every tick with events or a checkpoint in order.
  let leftEvent = 0;
  let rightEvent = 0;
  let leftCheckpoint = 0;
  let rightCheckpoint = 0;
  const tickOf = (list: readonly { readonly tick: number }[], index: number) => list[index]?.tick ?? Infinity;
  for (;;) {
    const tick = Math.min(
      tickOf(left.events, leftEvent),
      tickOf(right.events, rightEvent),
      tickOf(left.checkpoints, leftCheckpoint),
      tickOf(right.checkpoints, rightCheckpoint),
    );
    if (tick === Infinity) return Object.freeze({ match: true });
    let eventsDiffer = false;
    while (tickOf(left.events, leftEvent) === tick || tickOf(right.events, rightEvent) === tick) {
      const a = tickOf(left.events, leftEvent) === tick ? left.events[leftEvent++] : undefined;
      const b = tickOf(right.events, rightEvent) === tick ? right.events[rightEvent++] : undefined;
      if (!a || !b || !sameEvent(a, b)) eventsDiffer = true;
    }
    if (eventsDiffer) return Object.freeze({ match: false, tick, kind: 'events' });
    const leftHash = tickOf(left.checkpoints, leftCheckpoint) === tick ? left.checkpoints[leftCheckpoint++].hash : undefined;
    const rightHash = tickOf(right.checkpoints, rightCheckpoint) === tick ? right.checkpoints[rightCheckpoint++].hash : undefined;
    if (leftHash !== rightHash) return Object.freeze({ match: false, tick, kind: 'checkpoint' });
  }
}
