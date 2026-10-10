/**
 * Replay of formal Core records (docs/plan/p3/02/spec.md, 快照、哈希与 replay; 持久化与兼容). The whole record and its
 * input bounds are validated first; then a new world is created from the caller's content and the record's run
 * configuration and must have the record's content identity (contentIdentityKey), mission and setupHash; only then do
 * the ticks run, recorded with the record's checkpoint interval. Formats, versions and rulesVersion are gates, never
 * migrated: only the current combination runs. Any failure throws, never a partial result: CoreInputError at a
 * `record…` path for the record, or at a `content…` path for the content; a malformed content Asset or identity keeps
 * its ContentContractError, and a Core failure its CoreFaultError.
 */
import { readAssetId } from '../../content/asset-id.ts';
import { contentIdentityKey, readContentIdentity } from '../../content/content-identity.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { CORE_LIMITS, fitsLimit } from '../contracts/limits.ts';
import { readTickInput, type TickInput } from '../contracts/tick-input.ts';
import { readDataRecord, readExactRecord, readList, requireExactFields } from '../contracts/validation.ts';
import { CoreInputError } from '../errors.ts';
import { initialWorldState, type CreateWorldInput } from '../world/create-world.ts';
import type { EffectiveRunConfig } from '../world/run-config.ts';
import type { WorldState } from '../world/world-state.ts';
import {
  GAME_REPLAY_FORMAT,
  GAME_REPLAY_VERSION,
  readCheckpointInterval,
  readHash,
  readProducer,
  recordState,
  type ReplayRecord,
  type ReplayResult,
} from './recording.ts';
import { RULES_VERSION } from './rules-version.ts';

/** The content a record is replayed on: what createWorld takes besides the run configuration. */
export type ReplayContent = Omit<CreateWorldInput, 'run'>;

const RECORD_FIELDS = ['format', 'version', 'rulesVersion', 'producer', 'content', 'mission', 'setupHash', 'run', 'checkpointInterval', 'ticks'] as const;
/** Enough to read the format and version of a record with other fields before rejecting its fields. */
const MAX_RECORD_FIELDS = 32;
const RUN_FIELDS = ['rawDifficulty', 'wingman', 'seed', 'clockUnitsPerTick'] as const;
const CONTENT_FIELDS = ['mission', 'craftTypes', 'wingmanRoster', 'identity'] as const;

/** `error` again at `path`, if it is one of the input contract errors; anything else unchanged. */
function movedTo(error: unknown, path: string): unknown {
  if (error instanceof CoreInputError) return new CoreInputError(path, error.reason);
  if (error instanceof ContentContractError) return new ContentContractError(error.code, path, error.reason);
  return error;
}

/** Runs a content reader on a record field, so that a bad field is a CoreInputError like every other record error. */
function readRecordField<Value>(read: () => Value): Value {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContentContractError) throw new CoreInputError(error.path, error.reason);
    throw error;
  }
}

/** A run configuration with every field, the default included; its values are world creation's to validate. */
function readRun(value: unknown, path: string): EffectiveRunConfig {
  return readExactRecord(value, path, RUN_FIELDS) as unknown as EffectiveRunConfig;
}

/** Every tick input, bounded by the recording capacity before anything is copied. */
function readTicks(value: unknown, path: string): readonly TickInput[] {
  let commands = 0;
  return readList(value, path, CORE_LIMITS.recordedTicks, (item, at) => {
    let input: TickInput;
    try {
      input = readTickInput(item);
    } catch (error) {
      // Tick input errors are at `tickInput…`.
      throw error instanceof CoreInputError ? movedTo(error, `${at}${error.path.slice('tickInput'.length)}`) : error;
    }
    if (!fitsLimit('recordedCommands', commands, input.commands.length)) {
      throw new CoreInputError(`${at}.commands`, `would exceed ${CORE_LIMITS.recordedCommands} recorded commands`);
    }
    commands += input.commands.length;
    return input;
  });
}

/** Validates a whole record, reading every value once, and returns a detached copy. */
function readRecord(value: unknown): ReplayRecord {
  const record = readDataRecord(value, 'record', MAX_RECORD_FIELDS);
  if (record.format !== GAME_REPLAY_FORMAT) throw new CoreInputError('record.format', `must be ${GAME_REPLAY_FORMAT}`);
  if (record.version !== GAME_REPLAY_VERSION) throw new CoreInputError('record.version', `must be ${GAME_REPLAY_VERSION}`);
  if (record.rulesVersion !== RULES_VERSION) throw new CoreInputError('record.rulesVersion', `must be ${RULES_VERSION}, the rules version of this code`);
  requireExactFields(record, 'record', RECORD_FIELDS);
  return Object.freeze({
    format: GAME_REPLAY_FORMAT,
    version: GAME_REPLAY_VERSION,
    rulesVersion: RULES_VERSION,
    producer: readProducer(record.producer, 'record.producer'),
    content: readRecordField(() => readContentIdentity(record.content, 'record.content')),
    mission: readRecordField(() => readAssetId(record.mission, 'record.mission')),
    setupHash: readHash(record.setupHash, 'record.setupHash'),
    run: readRun(record.run, 'record.run'),
    checkpointInterval: readCheckpointInterval(record.checkpointInterval, 'record.checkpointInterval'),
    ticks: readTicks(record.ticks, 'record.ticks'),
  });
}

/** The initial state of the record's world on `content`, bound to the record's identity, mission and setup. */
function replayState(record: ReplayRecord, value: unknown): WorldState {
  const content = readExactRecord(value, 'content', CONTENT_FIELDS);
  const identity = readContentIdentity(content.identity, 'content.identity');
  if (contentIdentityKey(identity) !== contentIdentityKey(record.content)) {
    throw new CoreInputError('record.content', 'must be the identity of the replayed content');
  }
  let state: WorldState;
  try {
    state = initialWorldState({ ...content, identity, run: record.run } as CreateWorldInput);
  } catch (error) {
    // World creation reports at `input…`: the run is the record's, everything else the caller's content.
    const path = (error as { readonly path?: unknown }).path;
    if (typeof path !== 'string') throw error;
    throw movedTo(error, path.startsWith('input.run') ? `record.run${path.slice('input.run'.length)}` : `content${path.slice('input'.length)}`);
  }
  if (state.config.mission !== record.mission) throw new CoreInputError('record.mission', 'must be the mission of the replayed content');
  if (state.config.setupHash !== record.setupHash) throw new CoreInputError('record.setupHash', 'must be the setup hash of the replayed content');
  return state;
}

/**
 * Replays `record` on `content` in a new world and returns the result recording would: the events, the checkpoints
 * and the final tick. See the module comment for the checks and errors; a CoreInputError of a tick, such as the
 * recording capacity, is at `record.ticks[k]`.
 */
export function replayRecord(record: unknown, content: ReplayContent): ReplayResult {
  const replayed = readRecord(record);
  const session = recordState(replayState(replayed, content), { producer: replayed.producer, checkpointInterval: replayed.checkpointInterval });
  replayed.ticks.forEach((input, index) => {
    try {
      session.step(input);
    } catch (error) {
      throw movedTo(error, `record.ticks[${index}]`);
    }
  });
  return session.exportRecording().result;
}
