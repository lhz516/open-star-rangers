import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleDataInputs, runModelInputs, type PackageGroup } from '../src/app/resources/mission-input.ts';
import type { AssetDescriptor } from '../src/content/asset-contract.ts';
import type { AssetId } from '../src/content/asset-id.ts';
import { contentIdentityKey, readContentIdentity, readSourceFingerprint, type ContentIdentity } from '../src/content/content-identity.ts';
import type { GroupInput } from '../src/content/completeness.ts';
import { ContentContractError } from '../src/content/contract-validation.ts';
import type { MissionContent } from '../src/content/logic/logic-content.ts';
import { decodeLogicPayload } from '../src/content/logic/logic-payload.ts';
import { readGroupManifest } from '../src/content/manifest.ts';
import { readPayloadRecords } from '../src/content/payload.ts';
import { decodeRuleDataPayload } from '../src/content/rule-data/rule-data-payload.ts';
import { COMMAND_OUTCOMES, COMMAND_RESULT_REASONS, type CommandOutcome, type DomainEvent } from '../src/core/contracts/domain-events.ts';
import { CORE_LIMITS } from '../src/core/contracts/limits.ts';
import { COMMAND_TYPES, type Command, type CommandType, type TickInput } from '../src/core/contracts/tick-input.ts';
import { CoreFaultError, CoreInputError } from '../src/core/errors.ts';
import { compareReplayResults, type ReplayComparison } from '../src/core/replay/compare.ts';
import {
  completedRun, GAME_REPLAY_FORMAT, GAME_REPLAY_VERSION, PRODUCER_MAX_LENGTH, type ReplayCheckpoint, type ReplayRecord, type ReplayResult,
} from '../src/core/replay/recording.ts';
import { replayRecord, type ReplayContent } from '../src/core/replay/replay.ts';
import { RULES_VERSION } from '../src/core/replay/rules-version.ts';
import { COMM_MESSAGES_LIMITS } from '../src/content/rule-data/comm-messages.ts';
import type { Matrix3 } from '../src/core/world/entity-table.ts';
import { productionIdentityBasis } from '../src/original-data/conversion/converter-version.ts';
import { DiscReadError } from '../src/original-data/disc/disc-error.ts';
import { SourceError } from '../src/original-data/source-error.ts';
import { importPackage, InputReadError, type ImportedPackage, type PackageCheckOptions } from './package-check.ts';

// Local replay check (P3-04 S-08, AC-16): replays a Core Recording that the development build exported, as compact
// JSON, on the content the production import job converts from a CloneCD file set, and compares the results. Output
// holds only the error code and structural location, the content identity key, the mission Asset ID, the setup hash,
// counts, Core's comparison and whether the replayed run completed: never names, coordinates, events, host paths or
// host error text.

/** The closed set of failure codes. */
export const REPLAY_CHECK_ERROR_CODES = Object.freeze([
  'usage', 'read-failed', 'file-too-large', 'invalid-recording', 'content-failed', 'replay-failed', 'replay-mismatch', 'internal-error',
] as const);
export type ReplayCheckErrorCode = (typeof REPLAY_CHECK_ERROR_CODES)[number];

/**
 * What ended a check. `location` is a fixed stage (`argv`, `recording`, `recording.changed`, `recording.json`, an
 * import stage, `replay`, `comparison`, or the phase of an internal error) or a structural path from a validator
 * (`record…`, `result…`, `disc[i]`, `groups…`, `content…`).
 */
export interface ReplayCheckFailure {
  readonly code: ReplayCheckErrorCode;
  readonly location: string;
}

/** Every report has every field; a field the check did not reach is null. */
export interface ReplayCheckReport {
  readonly format: 'osr-replay-check';
  /** 2 since P3-11 added `completed` (docs/plan/p3/04/spec.md, 终局与救援衔接). */
  readonly version: 2;
  /** True only when the replay's result matches the recording's in full. */
  readonly passed: boolean;
  readonly error: ReplayCheckFailure | null;
  /** The content identity key of the package the file set converts to, once it validates as a whole. */
  readonly identity: string | null;
  /**
   * The recording's mission and setup hash, once Core validates its record before replay. World creation validates the
   * values of its run configuration only against the content, so an invalid run is reported after the import.
   */
  readonly mission: AssetId | null;
  readonly setupHash: string | null;
  /** The recording's final tick and its numbers of events and checkpoints, once Core validates its result. */
  readonly finalTick: number | null;
  readonly events: number | null;
  readonly checkpoints: number | null;
  /** Core's comparison of the recording's result with the replay's, once the replay runs. */
  readonly comparison: ReplayComparison | null;
  /**
   * Once the replay runs, whether its final tick holds `mission-completed`: false for a prefix that stopped before the
   * run's completion, which can still pass but is no complete run (docs/plan/p3/02/spec.md, ME-12).
   */
  readonly completed: boolean | null;
}

/**
 * The import job of a check: production unless a test passes a whitelist or a job; never chosen by the recording. An
 * injected job must convert as the production job does: RECORDING_MAX_BYTES assumes the content identity it gives.
 */
export type ReplayCheckOptions = PackageCheckOptions;

/*
 * The recording file limit: an upper bound on the UTF-8 bytes of `JSON.stringify(recording)` for any Recording Core
 * accepts whose content identity the production import job can give. It is the bytes of the record header, the empty
 * lists and the result's final tick, plus, for each list, its Core capacity times its longest item and a separator
 * (`recordingSizeBound`). Every value takes its longest JSON: a finite number at most 25 characters (a sign, `0.`, five
 * zeros and 17 significant digits; 24 without the sign), a safe integer 16 digits, a tick 6, each producer UTF-16 code
 * unit 6 bytes (a `\u` escape), the mission the longest Asset ID, and the content identity the production converter
 * version with SHA-256 manifest and source fingerprints. The test pins this value to the derivation, so a change to a
 * Core capacity or format changes it on purpose, together with the tool guide.
 */
export const RECORDING_MAX_BYTES = 534_251_135;

/** The longest JSON text of a finite number in [-1, 1]: the longest of any finite number. */
const LONGEST_NUMBER = -0.0000012345678901234567;
/** The same without the sign, in [0, 1]. */
const LONGEST_FRACTION = 0.0000012345678901234567;
/** An f32 whose JSON text is as long as LONGEST_NUMBER's, 25 characters. */
const LONGEST_F32 = Math.fround(-0.0000011822337455669185);
const SAFE = Number.MAX_SAFE_INTEGER;
const LAST_TICK = CORE_LIMITS.recordedTicks;
const HASH = 'f'.repeat(16);
const longestOf = <const Value extends string>(values: readonly Value[]): Value => values.reduce((longest, value) => (value.length > longest.length ? value : longest));

/** The longest i32 text, and the longest list index (−1 to the largest i32). */
const LONGEST_I32 = -(2 ** 31);
const LONGEST_LIST_INDEX = 2 ** 31 - 1;
const LONGEST_VECTOR = { x: LONGEST_NUMBER, y: LONGEST_NUMBER, z: LONGEST_NUMBER } as const;
const LONGEST_F32_VECTOR = { x: LONGEST_F32, y: LONGEST_F32, z: LONGEST_F32 } as const;
const LONGEST_ATTACKER = { type: 'shooter', entityId: SAFE, kindBit: 31 } as const;

/** The longest entity source: a wingman group member with safe-integer indexes. */
const LONGEST_SOURCE = { collection: 'wingman', index: SAFE, group: { index: SAFE, request: SAFE, member: SAFE } } as const;

/**
 * P3-10's longest message and speaker: a direct-list message (its `null` portrait is longer than any portrait number the
 * comm-messages reader admits, its index as long), and a candidate-named wingman with safe-integer identities.
 */
const LONGEST_MESSAGE = { table: 20983, face: null, index: COMM_MESSAGES_LIMITS.directMessages - 1 } as const;
const LONGEST_SPEAKER = {
  entityId: SAFE, kindBit: 31, name: { type: 'candidate', declaration: { collection: 'wingman', index: SAFE }, candidate: SAFE },
} as const;
const LONGEST_VIEW_MODE = 0xff;
const LAST_COMMAND = CORE_LIMITS.commandsPerTick - 1;

/** The longest form of every command variant, so a new variant does not compile until it is added here. */
const LONGEST_COMMANDS: { readonly [Type in CommandType]: Extract<Command, { readonly type: Type }> } = {
  fire: { type: 'fire', channel: 'secondary' },
  speed: { type: 'speed', operation: 'toggle-auto-match' },
  'speed-preset': { type: 'speed-preset', level: 9 },
  'select-number': { type: 'select-number', value: 9 },
  'navigate-selection': { type: 'navigate-selection', direction: 'previous' },
  'confirm-selection': { type: 'confirm-selection' },
  target: { type: 'target', operation: 'friendly' },
  'cycle-main-weapon': { type: 'cycle-main-weapon' },
  'select-missile': { type: 'select-missile', direction: 'previous' },
  'toggle-map': { type: 'toggle-map' },
  'map-point': { type: 'map-point', operation: 'select', right: LONGEST_FRACTION, down: LONGEST_FRACTION },
  'request-warp': { type: 'request-warp' },
  communications: { type: 'communications', operation: 'close' },
  launch: { type: 'launch' },
  energy: { type: 'energy', operation: 'shield-increase' },
  'damage-report': { type: 'damage-report' },
  'cockpit-front': { type: 'cockpit-front' },
  'drop-transponder': { type: 'drop-transponder' },
};

/** The longest Asset ID, a mission's (ASSET_ID_LIMITS.totalLength). */
const LONGEST_MISSION = `mission/${'a'.repeat(32)}/${'b'.repeat(32)}/${'c'.repeat(32)}/${'d'.repeat(21)}` as AssetId;
/** A summary of the longest mission, the last trigger and range (P3-11, ME-05). */
const LONGEST_SUMMARY = { mission: LONGEST_MISSION, trigger: 1, range: 7 } as const;

/** The longest form of every event variant, likewise. */
const LONGEST_EVENTS: { readonly [Type in DomainEvent['type']]: Extract<DomainEvent, { readonly type: Type }> } = {
  'command-result': {
    type: 'command-result',
    tick: LAST_TICK,
    commandIndex: CORE_LIMITS.commandsPerTick - 1,
    commandType: longestOf(COMMAND_TYPES),
    outcome: longestOf(COMMAND_OUTCOMES.filter((outcome): outcome is Exclude<CommandOutcome, 'accepted'> => outcome !== 'accepted')),
    reason: longestOf(COMMAND_RESULT_REASONS),
  },
  'object-instantiated': {
    type: 'object-instantiated',
    tick: LAST_TICK,
    entityId: SAFE,
    kindBit: 31,
    source: LONGEST_SOURCE,
    position: { x: LONGEST_NUMBER, y: LONGEST_NUMBER, z: LONGEST_NUMBER },
  },
  'speed-assist-toggled': { type: 'speed-assist-toggled', tick: LAST_TICK, commandIndex: CORE_LIMITS.commandsPerTick - 1, enabled: false },
  // The assist variant is the longer of the two.
  'speed-matched': { type: 'speed-matched', tick: LAST_TICK, targetEntityId: SAFE, origin: 'assist', speedDifferenceExceeded: false },
  'speed-assist-released': { type: 'speed-assist-released', tick: LAST_TICK },
  'object-left-world': { type: 'object-left-world', tick: LAST_TICK, entityId: SAFE, kindBit: 31, source: LONGEST_SOURCE },
  // P3-07's events: an automatic target change, a list index of i32, a mount of a safe integer and a null command index
  // are each the longer of their forms.
  'target-changed': {
    type: 'target-changed', tick: LAST_TICK, playerEntityId: SAFE, previousTarget: SAFE, target: SAFE, targetKindBit: 31, mode: 'friendly',
    origin: 'automatic', commandIndex: null,
  },
  'target-cleared': { type: 'target-cleared', tick: LAST_TICK, playerEntityId: SAFE, previousTarget: SAFE, cause: 'base-view' },
  'weapon-selected': { type: 'weapon-selected', tick: LAST_TICK, entityId: SAFE, list: 1, index: LONGEST_LIST_INDEX, mount: SAFE, changed: false, commandIndex: null },
  // P3-14's forward rows and speeds (FA-05) are f32.
  'shot-fired': {
    type: 'shot-fired', tick: LAST_TICK, shooterEntityId: SAFE, shooterKindBit: 31, shooterPosition: LONGEST_VECTOR, shooterForward: LONGEST_F32_VECTOR,
    shooterSpeed: LONGEST_F32, entityId: SAFE, family: 'missile', weapon: SAFE, mount: SAFE, position: LONGEST_VECTOR,
    trigger: { type: 'command', channel: 'secondary', commandIndex: CORE_LIMITS.commandsPerTick - 1 },
  },
  hit: {
    type: 'hit', tick: LAST_TICK, victimEntityId: SAFE, victimKindBit: 31, victimPosition: LONGEST_VECTOR, victimForward: LONGEST_F32_VECTOR,
    victimSpeed: LONGEST_F32, cause: 'projectile', sourceEntityId: SAFE,
    attacker: LONGEST_ATTACKER, damage: LONGEST_I32, gated: false, shield: { before: LONGEST_I32, after: LONGEST_I32 },
    hull: { before: LONGEST_I32, after: LONGEST_I32 }, shieldWasEmpty: false, impact: { point: LONGEST_VECTOR, local: LONGEST_VECTOR, face: 5 },
    projectile: 'ricochet',
  },
  'object-destroyed': {
    type: 'object-destroyed', tick: LAST_TICK, entityId: SAFE, kindBit: 31, source: LONGEST_SOURCE, position: LONGEST_VECTOR, activity: 'parked',
    attacker: LONGEST_ATTACKER, eventClass: 1, outcome: 'explodes',
  },
  'explosion-started': {
    type: 'explosion-started', tick: LAST_TICK, entityId: SAFE, sourceEntityId: SAFE, sourceKindBit: 31, variant: 'missile', position: LONGEST_VECTOR,
    activationClock: SAFE,
  },
  'missile-ended': {
    type: 'missile-ended', tick: LAST_TICK, entityId: SAFE, shooterEntityId: SAFE, outcome: 'detonated', position: LONGEST_VECTOR,
    orientation: Array.from({ length: 9 }, () => LONGEST_NUMBER) as unknown as Matrix3,
  },
  'fragment-expired': { type: 'fragment-expired', tick: LAST_TICK, entityId: SAFE, sourceKindBit: 31, part: SAFE, position: LONGEST_VECTOR, outcome: 'wingman-pod' },
  'source-released': { type: 'source-released', tick: LAST_TICK, entityId: SAFE, kindBit: 31, fragmentEntityId: SAFE, removed: false },
  'energy-depleted': { type: 'energy-depleted', tick: LAST_TICK, entityId: SAFE, kindBit: 31, position: LONGEST_VECTOR },
  'energy-allocation-changed': {
    type: 'energy-allocation-changed', tick: LAST_TICK, entityId: SAFE, shieldLevel: 3, chargeLevel: 3, commandIndex: CORE_LIMITS.commandsPerTick - 1,
  },
  'left-page-changed': { type: 'left-page-changed', tick: LAST_TICK, page: 6, previousPage: 6, commandIndex: null },
  // P3-09's events (docs/plan/p3/02/spec.md, MW-05): a three-digit view mode, a three-digit pixel, a created marker and
  // an arrival are each the longer of their forms.
  'map-toggled': {
    type: 'map-toggled', tick: LAST_TICK, open: false, viewMode: 0xff, previousViewMode: 0xff, commandIndex: CORE_LIMITS.commandsPerTick - 1,
  },
  'warp-destination-set': {
    type: 'warp-destination-set', tick: LAST_TICK, playerEntityId: SAFE, destination: LONGEST_VECTOR, pixel: { column: 479, row: 479 },
    icon: { entityId: SAFE, kindBit: 31 }, marker: { type: 'created', entityId: SAFE }, commandIndex: CORE_LIMITS.commandsPerTick - 1,
  },
  'warp-started': {
    type: 'warp-started', tick: LAST_TICK, playerEntityId: SAFE, serial: SAFE, origin: LONGEST_VECTOR, destination: LONGEST_VECTOR,
    distance: LONGEST_NUMBER, check: { cost: LONGEST_I32, energy: LONGEST_I32 }, transitLength: LONGEST_NUMBER, fromViewMode: 0xff,
    commandIndex: CORE_LIMITS.commandsPerTick - 1,
  },
  'warp-completed': {
    type: 'warp-completed', tick: LAST_TICK, serial: SAFE, viewMode: 0xff, previousViewMode: 1,
    arrival: {
      playerEntityId: SAFE, origin: LONGEST_VECTOR, destination: LONGEST_VECTOR, position: LONGEST_VECTOR,
      orientation: Array.from({ length: 9 }, () => LONGEST_NUMBER) as unknown as Matrix3, error: LONGEST_NUMBER, snapped: SAFE,
      charge: { distance: LONGEST_I32, cost: LONGEST_I32, energyBefore: LONGEST_I32, energyAfter: LONGEST_I32 }, warpClock: SAFE, hostileNear: false,
    },
  },
  // P3-10's events (CB-13): a null where a number of at most 3 digits is the alternative, a docking reply at the head
  // (as long as a music callback in due order), the comparator's 32 frames of the largest i32 duration.
  'command-delivered': {
    type: 'command-delivered', tick: LAST_TICK, receiverEntityId: SAFE, receiverKindBit: 31, code: 0xffffffff, senderEntityId: SAFE, commandIndex: LAST_COMMAND,
  },
  'radio-queued': {
    type: 'radio-queued', tick: LAST_TICK, message: LONGEST_MESSAGE, callback: 'docking-reply', speaker: LONGEST_SPEAKER, position: 'head',
    length: CORE_LIMITS.radioQueueItems,
  },
  'radio-taken': { type: 'radio-taken', tick: LAST_TICK, message: LONGEST_MESSAGE, speaker: LONGEST_SPEAKER },
  'incoming-started': {
    type: 'incoming-started', tick: LAST_TICK, message: LONGEST_MESSAGE, speaker: LONGEST_SPEAKER, frameDurations: Array.from({ length: 32 }, () => 2 ** 31 - 1),
    shown: false,
  },
  'incoming-ended': {
    type: 'incoming-ended', tick: LAST_TICK, message: LONGEST_MESSAGE, speaker: LONGEST_SPEAKER, callback: 'docking-reply', countdownStarted: false,
  },
  'radio-flushed': { type: 'radio-flushed', tick: LAST_TICK, cause: 'completion-message', removed: CORE_LIMITS.radioQueueItems, interrupted: 'loading' },
  'docking-requested': {
    type: 'docking-requested', tick: LAST_TICK, playerEntityId: SAFE, dockingObject: SAFE, previousSubState: 0, deadlineClock: SAFE, commandIndex: LAST_COMMAND,
  },
  'docking-cancelled': { type: 'docking-cancelled', tick: LAST_TICK, playerEntityId: SAFE, dockingObject: SAFE, cause: 'invalid-object' },
  docked: { type: 'docked', tick: LAST_TICK, playerEntityId: SAFE, baseEntityId: SAFE, wingmanEntityId: SAFE, previousViewMode: LONGEST_VIEW_MODE },
  departed: {
    type: 'departed', tick: LAST_TICK, playerEntityId: SAFE, origin: 'automatic', commandIndex: null, viewMode: LONGEST_VIEW_MODE,
    previousViewMode: LONGEST_VIEW_MODE, position: LONGEST_VECTOR, orientation: Array.from({ length: 9 }, () => LONGEST_NUMBER) as unknown as Matrix3,
    wingmanEntityId: SAFE,
  },
  transition: { type: 'transition', tick: LAST_TICK, gap: 'G-02/3' },
  'base-navigated': { type: 'base-navigated', tick: LAST_TICK, direction: 'previous', row: null, moved: false, commandIndex: LAST_COMMAND },
  'base-confirmed': { type: 'base-confirmed', tick: LAST_TICK, row: null, record: null, moved: false, commandIndex: LAST_COMMAND },
  // P3-08's events (CR-22): the largest code is an unknown one, whose outcome is the longest and whose reply line is 3;
  // a command is consumed after the tick that delivered it.
  'wingman-command-consumed': {
    type: 'wingman-command-consumed', tick: LAST_TICK, wingmanEntityId: SAFE, code: 0xffffffff, issuedTick: LAST_TICK - 1, path: 'parked',
    outcome: 'unknown-code', replyLine: 3,
  },
  // Its pose is f32 (CR-22), whose longest text is as long as a double's.
  'transponder-deployed': {
    type: 'transponder-deployed', tick: LAST_TICK, entityId: SAFE, creatorEntityId: SAFE, position: { x: LONGEST_F32, y: LONGEST_F32, z: LONGEST_F32 },
    orientation: Array.from({ length: 9 }, () => LONGEST_F32) as unknown as Matrix3,
  },
  // P3-11's events (ME-13): a two-digit kind of the entry set, a selector of −128 with a summary, a destruction loss
  // from view 0xFF, a success with both ending gaps, and the entity limit as a count.
  'all-clear': { type: 'all-clear', tick: LAST_TICK, entityId: SAFE, kindBit: 19, eventClass: 2 },
  'settlement-started': { type: 'settlement-started', tick: LAST_TICK, outcome: 'success', summary: LONGEST_SUMMARY, summarySelector: -128, dueClock: SAFE },
  'settlement-deferred': { type: 'settlement-deferred', tick: LAST_TICK, dueClock: SAFE },
  'flight-message': { type: 'flight-message', tick: LAST_TICK, message: 'missionComplete' },
  'player-loss-started': {
    type: 'player-loss-started', tick: LAST_TICK, playerEntityId: SAFE, loss: 'destroyed', previousSubState: 0, previousViewMode: LONGEST_VIEW_MODE,
    viewSwitched: true,
  },
  'player-rescued': {
    type: 'player-rescued', tick: LAST_TICK, playerEntityId: SAFE, loss: 'destroyed', rescues: 2, baseEntityId: SAFE, candidates: CORE_LIMITS.entities,
    position: LONGEST_VECTOR, orientation: Array.from({ length: 9 }, () => LONGEST_NUMBER) as unknown as Matrix3,
  },
  'result-latched': {
    type: 'result-latched', tick: LAST_TICK, result: {
      outcome: 'success', reason: { type: 'all-clear' }, summary: LONGEST_SUMMARY, rescuesUsed: 2,
      endingGaps: [{ gap: 'G-02/8', variant: 'wingman' }, { gap: 'G-02/9', row: 19 }], playerKills: 0x7fffffff, latchTick: LAST_TICK,
    },
  },
  'teardown-started': { type: 'teardown-started', tick: LAST_TICK, entities: CORE_LIMITS.entities },
  'mission-completed': { type: 'mission-completed', tick: LAST_TICK, outcome: 'success' },
  'wingman-loss-timer-started': { type: 'wingman-loss-timer-started', tick: LAST_TICK, wingmanEntityId: SAFE, dueClock: SAFE },
  'wingman-loss-timer-expired': { type: 'wingman-loss-timer-expired', tick: LAST_TICK, queued: false },
  // P3-14's (FA-07): the longer of the two states.
  'object-retired': { type: 'object-retired', tick: LAST_TICK, entityId: SAFE, kindBit: 31, state: 'pending-removal' },
};

/** The content identity of every package the production import job converts. */
const PRODUCTION_IDENTITY: ContentIdentity = readContentIdentity({
  ...productionIdentityBasis(readSourceFingerprint(`source:sha256:${'f'.repeat(64)}`)),
  manifestIdentity: `manifest:sha256:${'f'.repeat(64)}`,
});

/** The longest value of each part of a recording, as `recordingSizeBound` measures them. */
export const LONGEST_RECORDING_PARTS = Object.freeze({
  header: {
    format: GAME_REPLAY_FORMAT,
    version: GAME_REPLAY_VERSION,
    rulesVersion: RULES_VERSION,
    // A control character is written as a six-character escape, the most any UTF-16 code unit takes.
    producer: '\u0000'.repeat(PRODUCER_MAX_LENGTH),
    content: PRODUCTION_IDENTITY,
    mission: LONGEST_MISSION,
    setupHash: HASH,
    // World creation admits a raw difficulty of 0 to 100, null or a roster index below 16, a uint32 seed and a positive even safe step.
    run: { rawDifficulty: 100, wingman: null, seed: 0xffffffff, clockUnitsPerTick: SAFE - 1 },
    checkpointInterval: SAFE,
    ticks: [],
  } satisfies ReplayRecord,
  tick: { axes: { pitch: LONGEST_NUMBER, yaw: LONGEST_NUMBER, roll: LONGEST_NUMBER }, commands: [] } satisfies TickInput,
  commands: LONGEST_COMMANDS,
  events: LONGEST_EVENTS,
  checkpoint: { tick: LAST_TICK, hash: HASH } satisfies ReplayCheckpoint,
});

export interface RecordingSizeBound {
  /** A recording of no ticks: the record header, the empty lists and the result's final tick. */
  readonly envelope: number;
  /** Each list's Core capacity and its longest item with a separator. */
  readonly lists: readonly { readonly name: 'ticks' | 'commands' | 'events' | 'checkpoints'; readonly count: number; readonly bytes: number }[];
  readonly total: number;
}

const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
const longestBytes = (values: readonly unknown[]): number => Math.max(...values.map(jsonBytes));

/** The derivation of RECORDING_MAX_BYTES from the current Core contracts; see there. */
export function recordingSizeBound(): RecordingSizeBound {
  const { header, tick, commands, events, checkpoint } = LONGEST_RECORDING_PARTS;
  const envelope = jsonBytes({ record: header, result: { events: [], checkpoints: [], finalTick: LAST_TICK } });
  const lists = [
    { name: 'ticks', count: CORE_LIMITS.recordedTicks, bytes: jsonBytes(tick) + 1 },
    { name: 'commands', count: CORE_LIMITS.recordedCommands, bytes: longestBytes(Object.values(commands)) + 1 },
    { name: 'events', count: CORE_LIMITS.recordedEvents, bytes: longestBytes(Object.values(events)) + 1 },
    { name: 'checkpoints', count: CORE_LIMITS.recordedCheckpoints, bytes: jsonBytes(checkpoint) + 1 },
  ] as const;
  return { envelope, lists, total: lists.reduce((total, { count, bytes }) => total + count * bytes, envelope) };
}

class CheckStop extends Error {
  readonly failure: ReplayCheckFailure;

  constructor(code: ReplayCheckErrorCode, location: string) {
    super(`${location}: ${code}`);
    this.failure = { code, location };
  }
}

/**
 * Reads the recording file through one handle: its size is checked before anything is read, at most one byte more
 * than that size is read, and a file whose size, modification or status change time changed meanwhile is rejected.
 * Opening does not wait for a FIFO's writer; anything but a regular file is rejected unread.
 */
async function readRecording(path: string): Promise<Uint8Array> {
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch {
    throw new CheckStop('read-failed', 'recording');
  }
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new CheckStop('read-failed', 'recording');
    if (before.size > BigInt(RECORDING_MAX_BYTES)) throw new CheckStop('file-too-large', 'recording');
    const size = Number(before.size);
    const bytes = new Uint8Array(size + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (length !== size || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) {
      throw new CheckStop('read-failed', 'recording.changed');
    }
    return bytes.subarray(0, length);
  } catch (error) {
    throw error instanceof CheckStop ? error : new CheckStop('read-failed', 'recording');
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** The file's JSON value, which must be an object of exactly a record and a result; neither is examined yet. */
function parseRecording(bytes: Uint8Array): { readonly record: unknown; readonly result: unknown } {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CheckStop('invalid-recording', 'recording.json');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CheckStop('invalid-recording', 'recording');
  const keys = Object.keys(value);
  if (keys.length !== 2 || !Object.hasOwn(value, 'record') || !Object.hasOwn(value, 'result')) throw new CheckStop('invalid-recording', 'recording');
  return value as { readonly record: unknown; readonly result: unknown };
}

const inside = (path: string, root: string): boolean => path === root || path.startsWith(`${root}.`) || path.startsWith(`${root}[`);

/**
 * Validates the record with Core's replay entry before any content exists. `replayRecord` validates the whole record,
 * bounds included, before it reads its content argument, so a record that passes reaches the content check, which a
 * missing content always fails at `content`.
 */
function validateRecord(record: unknown): { readonly mission: AssetId; readonly setupHash: string } {
  try {
    replayRecord(record, null as unknown as ReplayContent);
  } catch (error) {
    if (error instanceof CoreInputError && error.path === 'content') {
      const { mission, setupHash } = record as ReplayRecord;
      return { mission, setupHash };
    }
    if (error instanceof CoreInputError && inside(error.path, 'record')) throw new CheckStop('invalid-recording', error.path);
    throw error;
  }
  throw new Error('replayRecord accepted a missing content');
}

/** Validates the expected result with Core's comparison, which validates both sides before it compares them. */
function validateResult(result: unknown): Pick<ReplayCheckReport, 'finalTick' | 'events' | 'checkpoints'> {
  let comparison: ReplayComparison;
  try {
    comparison = compareReplayResults(result, result);
  } catch (error) {
    if (error instanceof CoreInputError && inside(error.path, 'expected')) throw new CheckStop('invalid-recording', `result${error.path.slice('expected'.length)}`);
    throw error;
  }
  if (!comparison.match) throw new Error('a result differs from itself');
  const { finalTick, events, checkpoints } = result as { readonly finalTick: number; readonly events: readonly unknown[]; readonly checkpoints: readonly unknown[] };
  return { finalTick, events: events.length, checkpoints: checkpoints.length };
}

/**
 * The replay content of a validated package for the record's run: the mission, the only Asset of its role in the logic
 * group, and the craft type table and wingman roster it references by Asset ID, decoded with the logic payload reader;
 * the craft info (P3-06 D-01), the only Asset of its role, decoded with the rule-data payload reader; the rule-data
 * inputs, and the models of the craft the run instantiates as Core names them, decoded as the mission owner decodes
 * them (src/app/resources/mission-input.ts; P3-07 CR-01), a decoding error at `content.<group>[<Asset ID>].<path>`; and
 * the package's identity. When Core refuses the run with this content it names no models, and the replay reports the
 * refusal at its record or content path.
 */
function replayContent(groups: readonly GroupInput[], identity: ContentIdentity, run: unknown): ReplayContent {
  // Validation read every manifest and payload strictly, so reading them again cannot fail.
  const logic = groups.map(({ manifest, payloads }) => ({ manifest: readGroupManifest(manifest), payloads })).find(({ manifest }) => manifest.group === 'logic');
  if (!logic) throw new CheckStop('content-failed', 'content');
  const payloads = new Map(readPayloadRecords(logic.payloads).map(({ id, bytes }) => [id as string, bytes]));
  const decode = (
    field: 'mission' | 'craftTypes' | 'wingmanRoster' | 'craftInfo',
    descriptor: AssetDescriptor | undefined,
    decoder: typeof decodeLogicPayload | typeof decodeRuleDataPayload = decodeLogicPayload,
  ) => {
    const bytes = descriptor && payloads.get(descriptor.id);
    if (!descriptor || !bytes) throw new CheckStop('content-failed', `content.${field}`);
    try {
      return { id: descriptor.id, content: decoder(bytes, descriptor).content };
    } catch (error) {
      if (error instanceof ContentContractError) throw new CheckStop('content-failed', `content.${field}.${error.path}`);
      throw error;
    }
  };
  const only = (role: string) => {
    const found = logic.manifest.assets.filter(descriptor => descriptor.role === role);
    return found.length === 1 ? found[0] : undefined;
  };
  const mission = decode('mission', only('mission'));
  const { references } = mission.content as MissionContent;
  const referenced = (id: AssetId) => logic.manifest.assets.find(descriptor => descriptor.id === id);
  const craftTypes = decode('craftTypes', referenced(references.craftTypes));
  const wingmanRoster = decode('wingmanRoster', referenced(references.wingmanRoster));
  const packageGroups: PackageGroup[] = groups.map(({ manifest, payloads }) => ({ group: readGroupManifest(manifest).group, manifest, payloads }));
  const fromPackage = <Value>(read: () => Value): Value => {
    try {
      return read();
    } catch (error) {
      if (error instanceof ContentContractError) throw new CheckStop('content-failed', `content.${error.path}`);
      throw error;
    }
  };
  return {
    mission,
    craftTypes,
    wingmanRoster,
    craftInfo: decode('craftInfo', only('craft-info'), decodeRuleDataPayload),
    ...fromPackage(() => ruleDataInputs(packageGroups)),
    models: fromPackage(() => runModelInputs(packageGroups, { mission, craftTypes, wingmanRoster, identity, run } as Parameters<typeof runModelInputs>[1])),
    identity,
  } as ReplayContent;
}

/**
 * Core's replay of the record on the content. World creation rejects an invalid run configuration of the record, which
 * only the content can validate; any other failure at a record path is a record the content cannot replay (another
 * identity, mission or setup hash, or a tick beyond the recording capacity), a content path the content's own failure,
 * and a Core fault the replay's.
 */
function replay(record: unknown, content: ReplayContent): ReplayResult {
  try {
    return replayRecord(record, content);
  } catch (error) {
    if (error instanceof CoreFaultError) throw new CheckStop('replay-failed', 'replay');
    if (error instanceof CoreInputError || error instanceof ContentContractError) {
      if (inside(error.path, 'record.run')) throw new CheckStop('invalid-recording', error.path);
      if (inside(error.path, 'record')) throw new CheckStop('replay-failed', error.path);
      if (inside(error.path, 'content')) throw new CheckStop('content-failed', error.path);
    }
    throw error;
  }
}

/**
 * Converts the file set with the import job and validates the whole package. A file that cannot be opened, or that
 * the disc reader cannot read, is a read failure; any other failure of the disc, source identification or conversion
 * is a content failure in the import stage it ended, and an incomplete package one at its first diagnostic's path.
 */
async function importContent(discPaths: readonly string[], options: ReplayCheckOptions): Promise<{ readonly groups: readonly GroupInput[]; readonly identity: ContentIdentity }> {
  let stage = 'import';
  let imported: ImportedPackage;
  try {
    imported = await importPackage(discPaths, options, { progress: current => { stage = current; }, identified: () => undefined });
  } catch (error) {
    if (error instanceof InputReadError) throw new CheckStop('read-failed', `disc[${error.index}]`);
    if (error instanceof DiscReadError && error.code === 'read-failed') throw new CheckStop('read-failed', 'disc');
    if (error instanceof DiscReadError || error instanceof SourceError || error instanceof ContentContractError) throw new CheckStop('content-failed', stage);
    throw error;
  }
  const { groups, validation } = imported;
  if (validation.status !== 'complete') throw new CheckStop('content-failed', validation.diagnostics[0].path);
  return { groups, identity: validation.identity };
}

type Phase = 'recording' | 'record' | 'result' | 'import' | 'content' | 'replay' | 'comparison';

/** What a check gathers; the rest of the report follows from it. */
type ReportFields = { -readonly [Field in keyof Omit<ReplayCheckReport, 'format' | 'version' | 'passed'>]?: ReplayCheckReport[Field] };

const report = (fields: ReportFields): ReplayCheckReport => {
  const {
    error = null, identity = null, mission = null, setupHash = null, finalTick = null, events = null, checkpoints = null, comparison = null, completed = null,
  } = fields;
  return {
    format: 'osr-replay-check', version: 2, passed: error === null && comparison?.match === true,
    error, identity, mission, setupHash, finalTick, events, checkpoints, comparison, completed,
  };
};

/**
 * Checks the recording at `recordingPath` against the CloneCD file set at `discPaths`: it reads the file within
 * RECORDING_MAX_BYTES, validates the record and then the expected result with Core's public entries, converts the file
 * set with the import job `options` configure (the production job and whitelist by default) and validates the whole
 * package, decodes its logic Assets, replays the record on them and compares the results. The first failure ends the
 * check; the report keeps what was validated before it. Never throws, and never writes the recording.
 */
export async function runReplayCheck(recordingPath: string, discPaths: readonly string[], options: ReplayCheckOptions = {}): Promise<ReplayCheckReport> {
  const fields: ReportFields = {};
  let phase: Phase = 'recording';
  try {
    const { record, result } = parseRecording(await readRecording(recordingPath));
    phase = 'record';
    Object.assign(fields, validateRecord(record));
    phase = 'result';
    Object.assign(fields, validateResult(result));
    phase = 'import';
    const { groups, identity } = await importContent(discPaths, options);
    fields.identity = contentIdentityKey(identity);
    phase = 'content';
    const content = replayContent(groups, identity, (record as ReplayRecord).run);
    phase = 'replay';
    const actual = replay(record, content);
    fields.completed = completedRun(actual);
    phase = 'comparison';
    fields.comparison = compareReplayResults(result, actual);
    if (!fields.comparison.match) throw new CheckStop('replay-mismatch', 'comparison');
  } catch (cause) {
    // Anything else may carry host paths or content in its text.
    fields.error = cause instanceof CheckStop ? cause.failure : { code: 'internal-error', location: phase };
  }
  return report(fields);
}

/** The process exit status of a report: 0 when it passed, 2 for bad usage, 1 for any other failure. */
export const exitCode = ({ passed, error }: ReplayCheckReport): number => (passed ? 0 : error?.code === 'usage' ? 2 : 1);

const bound = recordingSizeBound();
const USAGE = [
  'usage: node tools/replay-check.ts <recording.json> <file.ccd> <file.img> [<file.sub>] [<file.cue>]',
  '',
  'Replays a recording the development build exported on the content the production import job converts from the',
  'CloneCD file set, identified with the production whitelist, and prints one JSON report. Exit status: 0 when the',
  'replay matches, 1 when the check fails, 2 for bad usage. Error codes: ' + `${REPLAY_CHECK_ERROR_CODES.join(', ')}.`,
  '',
  `The recording is read through one file handle and may hold at most ${RECORDING_MAX_BYTES} bytes, an upper bound`,
  'on the UTF-8 bytes of JSON.stringify(recording) for any recording Core accepts with the production content identity:',
  `  ${bound.envelope} for the record header, the empty lists and the result's final tick`,
  ...bound.lists.map(({ name, count, bytes }) => `  + ${count} ${name} (Core capacity) x ${bytes} (longest item and a separator)`),
  'where a number takes at most 25 characters, a safe integer 16 digits, a producer code unit 6 bytes (a \\u escape),',
  'the mission the longest Asset ID, and the content identity the production converter version and SHA-256 fingerprints.',
].join('\n');

/** Runs the CLI: always with the production import job and whitelist. Prints one JSON report and returns the exit status. */
export async function main(argv: readonly string[]): Promise<number> {
  let result: ReplayCheckReport;
  if (argv.length < 2 || argv.some(argument => argument.startsWith('-'))) {
    console.error(USAGE);
    result = report({ error: { code: 'usage', location: 'argv' } });
  } else {
    const [recording, ...disc] = argv.map(path => resolve(path));
    result = await runReplayCheck(recording, disc);
  }
  console.log(JSON.stringify(result, null, 2));
  return exitCode(result);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
