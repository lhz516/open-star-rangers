/**
 * Input recording for the synthetic scene: records the input of every tick that steps successfully,
 * with the resulting event stream and periodic state-hash checkpoints, for later replay and
 * comparison. Consistency holds only for the same code version and JS runtime. Contract:
 * docs/plan/p1/03/spec.md.
 */
import { CoreInputError } from './errors.ts';
import {
  createSyntheticScene,
  readTickInput,
  requireExactRecord,
  type DomainEvent,
  type SyntheticScene,
  type SyntheticSceneConfig,
  type SyntheticSceneState,
  type SyntheticRenderState,
  type SyntheticUiProjection,
  type TickInput,
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
  if (!Array.isArray(ticks)) throw new CoreInputError('record.ticks', 'must be an array');
  const inputs: TickInput[] = [];
  for (let index = 0; index < ticks.length; index++) {
    // A hole is not an idle tick.
    if (!Object.hasOwn(ticks, index)) throw new CoreInputError(`record.ticks[${index}]`, 'is missing');
    try {
      inputs.push(canonicalTickInput(ticks[index]));
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
