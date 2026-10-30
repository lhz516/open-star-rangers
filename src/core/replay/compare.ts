/**
 * Comparison of formal Core replay results (docs/plan/p3/02/spec.md, 快照、哈希与 replay), for instance a recording's
 * and its replay's, possibly after a JSON round trip. Both results are validated first; a malformed one throws
 * CoreInputError at an `expected…` or `actual…` path. The comparison reports the earliest observable difference:
 * - over the ticks both runs stepped, in tick order, a tick whose events differ (`events`, which wins over a
 *   checkpoint of the same tick) or whose checkpoint is missing on one side or has another hash (`checkpoint`); the
 *   shorter run's own final checkpoint is not a difference where the longer run took no sample;
 * - if those agree but the runs have different lengths, the shorter run's first missing tick (`length`).
 * It is not the first internal divergence: with an interval above 1, a state difference that is gone by the next
 * checkpoint is never observed, and an input change without an observable effect is no difference.
 */
import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { LOGIC_LIMITS } from '../../content/logic/logic-content.ts';
import {
  COMMAND_OUTCOMES,
  COMMAND_RESULT_REASONS,
  type AllClearEvent,
  type Attacker,
  type BaseConfirmedEvent,
  type BaseNavigatedEvent,
  type CommandDeliveredEvent,
  type CommandResultEvent,
  type DepartedEvent,
  type DockedEvent,
  type DockingCancelledEvent,
  type DockingRequestedEvent,
  type DomainEvent,
  type EntitySource,
  EXPLOSION_CONSTRUCTION_STAGES,
  type ExplosionCreatedEvent,
  type FlightMessageEvent,
  type GroupMembership,
  type HitEvent,
  type IncomingEndedEvent,
  type IncomingStartedEvent,
  type MapToggledEvent,
  type MissionCompletedEvent,
  type ObjectInstantiatedEvent,
  type ObjectLeftWorldEvent,
  type ObjectRetiredEvent,
  PIPELINE_STAGE_NAMES,
  type PipelineStageName,
  type PlayerLossStartedEvent,
  type PlayerRescuedEvent,
  type RadioFlushedEvent,
  type RadioQueuedEvent,
  type RadioTakenEvent,
  type ResultLatchedEvent,
  type RetiredState,
  type SettlementDeferredEvent,
  type SettlementStartedEvent,
  type ShotTrigger,
  type SpeedAssistReleasedEvent,
  type SpeedAssistToggledEvent,
  type SpeedMatchedEvent,
  type TargetChangedEvent,
  type TeardownStartedEvent,
  type TransitionEvent,
  type TransponderDeployedEvent,
  type Vec3,
  type ViewSwitchedEvent,
  type WarpArrival,
  type WarpCompletedEvent,
  type WarpDestinationSetEvent,
  type WarpMarkerChange,
  type WarpStartedEvent,
  type WarpWallContactEvent,
  isWingmanCommandReply,
  type WingmanCommandConsumedEvent,
  WINGMAN_COMMAND_OUTCOMES,
  type WingmanLossTimerExpiredEvent,
  type WingmanLossTimerStartedEvent,
} from '../contracts/domain-events.ts';
import { COMM_MESSAGES_LIMITS } from '../../content/rule-data/comm-messages.ts';
import { CORE_LIMITS, fitsLimit } from '../contracts/limits.ts';
import { COMMAND_TYPES } from '../contracts/tick-input.ts';
import {
  integerIn,
  readChoice,
  readDataRecord,
  readExactRecord,
  readList,
  readNumber,
  requireExactFields,
  type NumberRule,
} from '../contracts/validation.ts';
import { CoreInputError } from '../errors.ts';
import { isFiniteFloat32 } from '../rules/float32.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import { ENEMY_KINDS } from '../rules/targeting.ts';
import { EXPLOSION_VARIANTS, type Level, type Matrix3, type NameReference } from '../world/entity-table.ts';
import { MAP_SIDE_LIMIT, type MapPixel } from '../world/map-rule-data.ts';
import type { LeftPage } from '../world/player-state.ts';
import type {
  EndingGap,
  MessageIdentity,
  MissionResult,
  MissionSubState,
  PlayerLoss,
  ResultReason,
  SpeakerSnapshot,
  SummaryReference,
} from '../world/world-state.ts';
import { readHash, type ReplayCheckpoint, type ReplayResult } from './recording.ts';

/** P3-09's events (docs/plan/p3/02/spec.md, MW-05). */
type MapWarpEvent = MapToggledEvent | WarpDestinationSetEvent | WarpStartedEvent | WarpCompletedEvent;

/** P3-10's events (docs/plan/p3/02/spec.md, CB-13). */
type CommunicationsEvent =
  | CommandDeliveredEvent | RadioQueuedEvent | RadioTakenEvent | IncomingStartedEvent | IncomingEndedEvent | RadioFlushedEvent
  | DockingRequestedEvent | DockingCancelledEvent | DockedEvent | DepartedEvent | TransitionEvent | BaseNavigatedEvent | BaseConfirmedEvent;

/** P3-08's events (docs/plan/p3/02/spec.md, CR-22). */
type AiEvent = WingmanCommandConsumedEvent | TransponderDeployedEvent;

/** P3-11's events (docs/plan/p3/02/spec.md, ME-13). */
type MissionEvent =
  | AllClearEvent | SettlementStartedEvent | SettlementDeferredEvent | FlightMessageEvent | PlayerLossStartedEvent | PlayerRescuedEvent
  | ResultLatchedEvent | TeardownStartedEvent | MissionCompletedEvent | WingmanLossTimerStartedEvent | WingmanLossTimerExpiredEvent;
/** P3-12's presentation facts (docs/plan/p3/02/spec.md, FS-03). */
type PresentationEvent = ExplosionCreatedEvent | ViewSwitchedEvent | WarpWallContactEvent;

/** P3-07's events (docs/plan/p3/02/spec.md, CR-06). */
type CombatEvent = Exclude<
  DomainEvent,
  | CommandResultEvent | ObjectInstantiatedEvent | SpeedAssistToggledEvent | SpeedMatchedEvent | SpeedAssistReleasedEvent | ObjectLeftWorldEvent
  | MapWarpEvent
  | CommunicationsEvent
  | AiEvent
  | ObjectRetiredEvent
  | MissionEvent
  | PresentationEvent
>;

/** Difference data, not an error. */
export type ReplayComparison =
  | { readonly match: true }
  | { readonly match: false; readonly tick: number; readonly kind: 'events' | 'checkpoint' | 'length' };

// Keyed by every event type, `speed-matched` by every origin and `player-loss-started` by every loss, so a new
// DomainEvent variant does not compile until it is read here. `target-changed` and `departed` have the same fields for
// both origins.
const EVENT_FIELDS = {
  'command-result': ['type', 'tick', 'commandIndex', 'commandType', 'outcome', 'reason'],
  'object-instantiated': ['type', 'tick', 'entityId', 'kindBit', 'source', 'position'],
  'speed-assist-toggled': ['type', 'tick', 'commandIndex', 'enabled'],
  'speed-assist-released': ['type', 'tick'],
  'object-left-world': ['type', 'tick', 'entityId', 'kindBit', 'source'],
  'target-changed': ['type', 'tick', 'playerEntityId', 'previousTarget', 'target', 'targetKindBit', 'mode', 'origin', 'commandIndex'],
  'target-cleared': ['type', 'tick', 'playerEntityId', 'previousTarget', 'cause'],
  'weapon-selected': ['type', 'tick', 'entityId', 'list', 'index', 'mount', 'changed', 'commandIndex'],
  'shot-fired': [
    'type', 'tick', 'shooterEntityId', 'shooterKindBit', 'shooterPosition', 'shooterForward', 'shooterSpeed', 'entityId', 'family', 'weapon', 'mount',
    'position', 'trigger',
  ],
  hit: [
    'type', 'tick', 'victimEntityId', 'victimKindBit', 'victimPosition', 'victimForward', 'victimSpeed', 'cause', 'sourceEntityId', 'attacker', 'damage', 'gated', 'shield', 'hull',
    'shieldWasEmpty', 'impact', 'projectile',
  ],
  'object-destroyed': ['type', 'tick', 'entityId', 'kindBit', 'source', 'position', 'activity', 'attacker', 'eventClass', 'outcome'],
  'explosion-started': ['type', 'tick', 'entityId', 'sourceEntityId', 'sourceKindBit', 'variant', 'position', 'activationClock'],
  'missile-ended': ['type', 'tick', 'entityId', 'shooterEntityId', 'outcome', 'position', 'orientation'],
  'fragment-expired': ['type', 'tick', 'entityId', 'sourceKindBit', 'part', 'position', 'outcome'],
  'source-released': ['type', 'tick', 'entityId', 'kindBit', 'fragmentEntityId', 'removed'],
  'energy-depleted': ['type', 'tick', 'entityId', 'kindBit', 'position'],
  'energy-allocation-changed': ['type', 'tick', 'entityId', 'shieldLevel', 'chargeLevel', 'commandIndex'],
  'left-page-changed': ['type', 'tick', 'page', 'previousPage', 'commandIndex'],
  'map-toggled': ['type', 'tick', 'open', 'viewMode', 'previousViewMode', 'commandIndex'],
  'warp-destination-set': ['type', 'tick', 'playerEntityId', 'destination', 'pixel', 'icon', 'marker', 'commandIndex'],
  'warp-started': [
    'type', 'tick', 'playerEntityId', 'serial', 'origin', 'destination', 'distance', 'check', 'transitLength', 'fromViewMode', 'commandIndex',
  ],
  'warp-completed': ['type', 'tick', 'serial', 'viewMode', 'previousViewMode', 'arrival'],
  'command-delivered': ['type', 'tick', 'receiverEntityId', 'receiverKindBit', 'code', 'senderEntityId', 'commandIndex'],
  'radio-queued': ['type', 'tick', 'message', 'callback', 'speaker', 'position', 'length'],
  'radio-taken': ['type', 'tick', 'message', 'speaker'],
  'incoming-started': ['type', 'tick', 'message', 'speaker', 'frameDurations', 'shown'],
  'incoming-ended': ['type', 'tick', 'message', 'speaker', 'callback', 'countdownStarted'],
  'radio-flushed': ['type', 'tick', 'cause', 'removed', 'interrupted'],
  'docking-requested': ['type', 'tick', 'playerEntityId', 'dockingObject', 'previousSubState', 'deadlineClock', 'commandIndex'],
  'docking-cancelled': ['type', 'tick', 'playerEntityId', 'dockingObject', 'cause'],
  docked: ['type', 'tick', 'playerEntityId', 'baseEntityId', 'wingmanEntityId', 'previousViewMode'],
  departed: ['type', 'tick', 'playerEntityId', 'origin', 'commandIndex', 'viewMode', 'previousViewMode', 'position', 'orientation', 'wingmanEntityId'],
  transition: ['type', 'tick', 'gap'],
  'base-navigated': ['type', 'tick', 'direction', 'row', 'moved', 'commandIndex'],
  'base-confirmed': ['type', 'tick', 'row', 'record', 'moved', 'commandIndex'],
  'wingman-command-consumed': ['type', 'tick', 'wingmanEntityId', 'code', 'issuedTick', 'path', 'outcome', 'replyLine'],
  'transponder-deployed': ['type', 'tick', 'entityId', 'creatorEntityId', 'position', 'orientation'],
  'all-clear': ['type', 'tick', 'entityId', 'kindBit', 'eventClass'],
  'settlement-started': ['type', 'tick', 'outcome', 'summary', 'summarySelector', 'dueClock'],
  'settlement-deferred': ['type', 'tick', 'dueClock'],
  'flight-message': ['type', 'tick', 'message'],
  'player-rescued': ['type', 'tick', 'playerEntityId', 'loss', 'rescues', 'baseEntityId', 'candidates', 'position', 'orientation'],
  'result-latched': ['type', 'tick', 'result'],
  'teardown-started': ['type', 'tick', 'entities'],
  'mission-completed': ['type', 'tick', 'outcome'],
  'wingman-loss-timer-started': ['type', 'tick', 'wingmanEntityId', 'dueClock'],
  'wingman-loss-timer-expired': ['type', 'tick', 'queued'],
  'explosion-created': ['type', 'tick', 'entityId', 'sourceEntityId', 'sourceKindBit', 'variant', 'stage', 'position', 'velocity'],
  'view-switched': ['type', 'tick', 'fromViewMode', 'fromSubMode', 'viewMode', 'subMode', 'stage', 'player'],
  'warp-wall-contact': ['type', 'tick', 'serial'],
  'object-retired': ['type', 'tick', 'entityId', 'kindBit', 'state'],
} as const satisfies {
  readonly [Type in Exclude<DomainEvent['type'], 'speed-matched' | 'player-loss-started'>]: readonly (keyof Extract<DomainEvent, { type: Type }>)[];
};
const SPEED_MATCHED_FIELDS = {
  command: ['type', 'tick', 'targetEntityId', 'origin', 'commandIndex'],
  assist: ['type', 'tick', 'targetEntityId', 'origin', 'speedDifferenceExceeded'],
} as const satisfies { readonly [Origin in SpeedMatchedEvent['origin']]: readonly (keyof Extract<SpeedMatchedEvent, { origin: Origin }>)[] };
const PLAYER_LOSS_FIELDS = {
  destroyed: ['type', 'tick', 'playerEntityId', 'loss', 'previousSubState', 'previousViewMode', 'viewSwitched'],
  energy: ['type', 'tick', 'playerEntityId', 'loss', 'previousSubState', 'deadlineClock'],
} as const satisfies { readonly [Loss in PlayerLoss]: readonly (keyof Extract<PlayerLossStartedEvent, { loss: Loss }>)[] };
const EVENT_TYPES = [...Object.keys(EVENT_FIELDS), 'speed-matched', 'player-loss-started'] as DomainEvent['type'][];
const SPEED_MATCH_ORIGINS = Object.keys(SPEED_MATCHED_FIELDS) as SpeedMatchedEvent['origin'][];
const PLAYER_LOSSES = Object.keys(PLAYER_LOSS_FIELDS) as PlayerLoss[];
const MAX_EVENT_FIELDS = Math.max(
  ...[...Object.values(EVENT_FIELDS), ...Object.values(SPEED_MATCHED_FIELDS), ...Object.values(PLAYER_LOSS_FIELDS)].map((fields) => fields.length),
);

const INDEX = integerIn(0, Number.MAX_SAFE_INTEGER);
const ENTITY_ID = integerIn(1, Number.MAX_SAFE_INTEGER);
const KIND_BIT = integerIn(0, 31);
const COMMAND_INDEX = integerIn(0, CORE_LIMITS.commandsPerTick - 1);
const COORDINATE: NumberRule = [Number.isFinite, 'must be a finite number'];
/** P3-08's transponder pose (CR-22), P3-12's construction and switch poses (FS-03) and P3-14's forward rows and speeds of shots and hits (FA-05) are f32. */
const F32: NumberRule = [isFiniteFloat32, 'must be a finite f32'];
const INT32 = integerIn(-0x80000000, 0x7fffffff);
const LEVEL = integerIn(0, 3);
const LEFT_PAGE = integerIn(0, 6);
const BIT = integerIn(0, 1);
const AI_CHANNEL = integerIn(0, 2);
const FACE = integerIn(0, 5);
/** A list's index: −1 for an empty list. */
const LIST_INDEX = integerIn(-1, 0x7fffffff);
/** View modes are the original's byte ps +0x28, sub-modes its byte ps +0x2A. */
const VIEW_MODE = integerIn(0, 0xff);
const SUB_MODE = integerIn(0, 0xff);
/** A cursor pixel lies in the main map. */
const MAP_PIXEL = integerIn(0, MAP_SIDE_LIMIT - 1);
const SERIAL = integerIn(1, Number.MAX_SAFE_INTEGER);
// P3-10's (CB-13).
const COMMAND_CODE = integerIn(1, 0xffffffff);
const SERVICE_ROW = integerIn(0, 10);
const FRAME_DURATION = integerIn(0, 0x7fffffff);
/**
 * The most frames of a message an event may carry: eight times the 3 or 4 of every message (RQ9), and few enough that
 * `incoming-started` is never the longest event of a recording. The comm-messages reader admits fewer
 * (COMM_MESSAGES_LIMITS.frames).
 */
const MESSAGE_FRAMES = 32;
const MESSAGE_TABLES: readonly number[] = [20011, 20019, 20985, 20983];
const FACE_INDEX = integerIn(0, COMM_MESSAGES_LIMITS.faces - 1);
const FACE_MESSAGE_INDEX = integerIn(0, COMM_MESSAGES_LIMITS.faceMessages - 1);
const DIRECT_INDEX = integerIn(0, COMM_MESSAGES_LIMITS.directMessages - 1);
/**
 * The sub-states a docking request or a destruction entry can leave: every one but 2, in which the player is destroyed,
 * so unavailable for a command, and the destruction entry returns (ME-09).
 */
const SUB_STATES: readonly number[] = [0, 1, 3, 4, 5];
const RADIO_CALLBACKS = ['none', 'docking-reply', 'music-step', 'music-reset'] as const;
const RADIO_FLUSH_CAUSES = ['docking-cancel', 'player-destroyed', 'beacon-expired', 'completion-message', 'result-due'] as const;
// P3-11's (ME-02, ME-05, ME-13).
const OUTCOMES = ['success', 'failure'] as const;
const REASON_TYPES = ['all-clear', 'third-loss', 'settlement-failed'] as const;
const ENDING_GAP_TYPES = ['G-02/7', 'G-02/8', 'G-02/9'] as const;
const RETURN_VARIANTS = ['solo', 'wingman'] as const;
const FLIGHT_MESSAGES = ['missionComplete', 'beacon'] as const;
/** The destruction view (ME-09). */
const DESTRUCTION_VIEW = 0x11;
/** The destruction camera's sub-mode of view 0x11 (ME-09). */
const DESTRUCTION_SUB_MODE = 8;
/** An i8 summary selector: −1 without a matched range, otherwise one world creation admits (≤ 0 or 13–19). */
const SUMMARY_SELECTOR: NumberRule = [(value) => Number.isInteger(value) && ((value >= -0x80 && value <= 0) || (value >= 13 && value <= 19)), 'must be an i8 of at most 0 or within 13–19'];
const CINC_ROW = integerIn(13, 19);
const TRIGGER_INDEX = integerIn(0, LOGIC_LIMITS.eventTriggers - 1);
const RANGE_INDEX = integerIn(0, LOGIC_LIMITS.eventRanges - 1);
const RESCUES = integerIn(0, 2);
/** A result has one ending gap on a failure and one or two on a success (ME-05). */
const ENDING_GAPS = 2;
// P3-14's (FA-07).
const RETIRED_STATES: readonly RetiredState[] = ['pending-removal', 'area-switch'];

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new CoreInputError(path, 'must be a boolean');
  return value;
}

function readVector(value: unknown, path: string, rule = COORDINATE): Vec3 {
  const { x, y, z } = readExactRecord(value, path, ['x', 'y', 'z']);
  return { x: readNumber(x, `${path}.x`, rule), y: readNumber(y, `${path}.y`, rule), z: readNumber(z, `${path}.z`, rule) };
}

function readGroup(value: unknown, path: string): GroupMembership | null {
  if (value === null) return null;
  const { index, request, member } = readExactRecord(value, path, ['index', 'request', 'member']);
  return {
    index: readNumber(index, `${path}.index`, INDEX),
    request: readNumber(request, `${path}.request`, INDEX),
    member: readNumber(member, `${path}.member`, INDEX),
  };
}

function readSource(value: unknown, path: string): EntitySource {
  const { collection, index, group } = readExactRecord(value, path, ['collection', 'index', 'group']);
  return {
    collection: readChoice(collection, `${path}.collection`, ['mission', 'wingman']),
    index: readNumber(index, `${path}.index`, INDEX),
    group: readGroup(group, `${path}.group`),
  };
}

function readCommandResult(event: Record<string, unknown>, path: string, tick: number): CommandResultEvent {
  const commandIndex = readNumber(event.commandIndex, `${path}.commandIndex`, COMMAND_INDEX);
  const commandType = readChoice(event.commandType, `${path}.commandType`, COMMAND_TYPES);
  const outcome = readChoice(event.outcome, `${path}.outcome`, COMMAND_OUTCOMES);
  if (outcome === 'accepted') {
    if (event.reason !== null) throw new CoreInputError(`${path}.reason`, 'must be null for an accepted command');
    return { type: 'command-result', tick, commandIndex, commandType, outcome, reason: null };
  }
  const reason = readChoice(event.reason, `${path}.reason`, COMMAND_RESULT_REASONS);
  return { type: 'command-result', tick, commandIndex, commandType, outcome, reason };
}

function readObjectInstantiated(event: Record<string, unknown>, path: string, tick: number): ObjectInstantiatedEvent {
  return {
    type: 'object-instantiated',
    tick,
    entityId: readNumber(event.entityId, `${path}.entityId`, ENTITY_ID),
    kindBit: readNumber(event.kindBit, `${path}.kindBit`, KIND_BIT),
    source: readSource(event.source, `${path}.source`),
    position: readVector(event.position, `${path}.position`),
  };
}

function readSpeedMatched(event: Record<string, unknown>, path: string, tick: number, origin: SpeedMatchedEvent['origin']): SpeedMatchedEvent {
  const targetEntityId = readNumber(event.targetEntityId, `${path}.targetEntityId`, ENTITY_ID);
  return origin === 'command'
    ? { type: 'speed-matched', tick, targetEntityId, origin, commandIndex: readNumber(event.commandIndex, `${path}.commandIndex`, COMMAND_INDEX) }
    : { type: 'speed-matched', tick, targetEntityId, origin, speedDifferenceExceeded: readBoolean(event.speedDifferenceExceeded, `${path}.speedDifferenceExceeded`) };
}

function readObjectLeftWorld(event: Record<string, unknown>, path: string, tick: number): ObjectLeftWorldEvent {
  return {
    type: 'object-left-world',
    tick,
    entityId: readNumber(event.entityId, `${path}.entityId`, ENTITY_ID),
    kindBit: readNumber(event.kindBit, `${path}.kindBit`, KIND_BIT),
    source: event.source === null ? null : readSource(event.source, `${path}.source`),
  };
}

const readEntityId = (value: unknown, path: string): number => readNumber(value, path, ENTITY_ID);
const readKindBit = (value: unknown, path: string): number => readNumber(value, path, KIND_BIT);
const readNullableEntityId = (value: unknown, path: string): number | null => (value === null ? null : readEntityId(value, path));
const readNullableCommandIndex = (value: unknown, path: string): number | null => (value === null ? null : readNumber(value, path, COMMAND_INDEX));
/** A movement block speed snapshot (FA-05): f32, null without a block. */
const readNullableSpeed = (value: unknown, path: string): number | null => (value === null ? null : readNumber(value, path, F32));

function readMatrix(value: unknown, path: string, rule = COORDINATE): Matrix3 {
  const rows = readList(value, path, 9, (item, at) => readNumber(item, at, rule));
  if (rows.length !== 9) throw new CoreInputError(path, 'must have 9 items');
  return rows as unknown as Matrix3;
}

function readAttacker(value: unknown, path: string): Attacker {
  const attacker = readDataRecord(value, path, 3);
  const type = readChoice(attacker.type, `${path}.type`, ['shooter', 'lost-shooter', 'none']);
  if (type !== 'shooter') {
    requireExactFields(attacker, path, ['type']);
    return { type };
  }
  requireExactFields(attacker, path, ['type', 'entityId', 'kindBit']);
  return { type, entityId: readEntityId(attacker.entityId, `${path}.entityId`), kindBit: readKindBit(attacker.kindBit, `${path}.kindBit`) };
}

function readShotTrigger(value: unknown, path: string): ShotTrigger {
  const trigger = readDataRecord(value, path, 3);
  const type = readChoice(trigger.type, `${path}.type`, ['command', 'ai', 'automatic']);
  switch (type) {
    case 'command':
      requireExactFields(trigger, path, ['type', 'channel', 'commandIndex']);
      return {
        type,
        channel: readChoice(trigger.channel, `${path}.channel`, ['primary', 'secondary']),
        commandIndex: readNumber(trigger.commandIndex, `${path}.commandIndex`, COMMAND_INDEX),
      };
    case 'ai':
      requireExactFields(trigger, path, ['type', 'channel']);
      return { type, channel: readNumber(trigger.channel, `${path}.channel`, AI_CHANNEL) as 0 | 1 | 2 };
    case 'automatic':
      requireExactFields(trigger, path, ['type']);
      return { type };
  }
}

function readBeforeAfter(value: unknown, path: string): HitEvent['shield'] {
  const { before, after } = readExactRecord(value, path, ['before', 'after']);
  return { before: readNumber(before, `${path}.before`, INT32), after: readNumber(after, `${path}.after`, INT32) };
}

function readImpact(value: unknown, path: string): HitEvent['impact'] {
  if (value === null) return null;
  const { point, local, face } = readExactRecord(value, path, ['point', 'local', 'face']);
  return {
    point: readVector(point, `${path}.point`),
    local: readVector(local, `${path}.local`),
    face: readNumber(face, `${path}.face`, FACE) as 0 | 1 | 2 | 3 | 4 | 5,
  };
}

function readTargetChanged(event: Record<string, unknown>, path: string, tick: number): TargetChangedEvent {
  const fields = {
    type: 'target-changed',
    tick,
    playerEntityId: readEntityId(event.playerEntityId, `${path}.playerEntityId`),
    previousTarget: readNullableEntityId(event.previousTarget, `${path}.previousTarget`),
    target: readEntityId(event.target, `${path}.target`),
    targetKindBit: readKindBit(event.targetKindBit, `${path}.targetKindBit`),
    mode: readChoice(event.mode, `${path}.mode`, ['enemy', 'friendly']),
  } as const;
  const origin = readChoice(event.origin, `${path}.origin`, ['command', 'automatic']);
  if (origin === 'command') return { ...fields, origin, commandIndex: readNumber(event.commandIndex, `${path}.commandIndex`, COMMAND_INDEX) };
  if (event.commandIndex !== null) throw new CoreInputError(`${path}.commandIndex`, 'must be null for an automatic selection');
  return { ...fields, origin, commandIndex: null };
}

function readHit(event: Record<string, unknown>, path: string, tick: number): HitEvent {
  return {
    type: 'hit',
    tick,
    victimEntityId: readEntityId(event.victimEntityId, `${path}.victimEntityId`),
    victimKindBit: readKindBit(event.victimKindBit, `${path}.victimKindBit`),
    victimPosition: readVector(event.victimPosition, `${path}.victimPosition`),
    victimForward: readVector(event.victimForward, `${path}.victimForward`, F32),
    victimSpeed: readNullableSpeed(event.victimSpeed, `${path}.victimSpeed`),
    cause: readChoice(event.cause, `${path}.cause`, ['projectile', 'missile', 'collision', 'area', 'parked']),
    sourceEntityId: readNullableEntityId(event.sourceEntityId, `${path}.sourceEntityId`),
    attacker: readAttacker(event.attacker, `${path}.attacker`),
    damage: readNumber(event.damage, `${path}.damage`, INT32),
    gated: readBoolean(event.gated, `${path}.gated`),
    shield: readBeforeAfter(event.shield, `${path}.shield`),
    hull: readBeforeAfter(event.hull, `${path}.hull`),
    shieldWasEmpty: readBoolean(event.shieldWasEmpty, `${path}.shieldWasEmpty`),
    impact: readImpact(event.impact, `${path}.impact`),
    projectile: event.projectile === null ? null : readChoice(event.projectile, `${path}.projectile`, ['ricochet', 'removed']),
  };
}

function readMapPixel(value: unknown, path: string): MapPixel {
  const { column, row } = readExactRecord(value, path, ['column', 'row']);
  return { column: readNumber(column, `${path}.column`, MAP_PIXEL), row: readNumber(row, `${path}.row`, MAP_PIXEL) };
}

function readMarkerChange(value: unknown, path: string): WarpMarkerChange {
  const marker = readDataRecord(value, path, 2);
  const type = readChoice(marker.type, `${path}.type`, ['created', 'moved', 'missing']);
  if (type === 'missing') {
    requireExactFields(marker, path, ['type']);
    return { type };
  }
  requireExactFields(marker, path, ['type', 'entityId']);
  return { type, entityId: readEntityId(marker.entityId, `${path}.entityId`) };
}

function readIcon(value: unknown, path: string): WarpDestinationSetEvent['icon'] {
  if (value === null) return null;
  const { entityId, kindBit } = readExactRecord(value, path, ['entityId', 'kindBit']);
  return { entityId: readEntityId(entityId, `${path}.entityId`), kindBit: readKindBit(kindBit, `${path}.kindBit`) };
}

function readArrival(value: unknown, path: string): WarpArrival | null {
  if (value === null) return null;
  const arrival = readExactRecord(value, path, [
    'playerEntityId', 'origin', 'destination', 'position', 'orientation', 'error', 'snapped', 'charge', 'warpClock', 'hostileNear',
  ]);
  const at = (field: string): string => `${path}.${field}`;
  const charge = readExactRecord(arrival.charge, at('charge'), ['distance', 'cost', 'energyBefore', 'energyAfter']);
  return {
    playerEntityId: readEntityId(arrival.playerEntityId, at('playerEntityId')),
    origin: readVector(arrival.origin, at('origin')),
    destination: readVector(arrival.destination, at('destination')),
    position: readVector(arrival.position, at('position')),
    orientation: readMatrix(arrival.orientation, at('orientation')),
    error: readNumber(arrival.error, at('error'), COORDINATE),
    snapped: readNullableEntityId(arrival.snapped, at('snapped')),
    charge: {
      distance: readNumber(charge.distance, at('charge.distance'), INT32),
      cost: readNumber(charge.cost, at('charge.cost'), INT32),
      energyBefore: readNumber(charge.energyBefore, at('charge.energyBefore'), INT32),
      energyAfter: readNumber(charge.energyAfter, at('charge.energyAfter'), INT32),
    },
    warpClock: readNumber(arrival.warpClock, at('warpClock'), INDEX),
    hostileNear: readBoolean(arrival.hostileNear, at('hostileNear')),
  };
}

/** Reads the fields of a P3-09 event (docs/plan/p3/02/spec.md, MW-05) after its type and field list. */
function readMapWarpEvent(event: Record<string, unknown>, path: string, tick: number, type: MapWarpEvent['type']): MapWarpEvent {
  const at = (field: string): string => `${path}.${field}`;
  switch (type) {
    case 'map-toggled':
      return {
        type,
        tick,
        open: readBoolean(event.open, at('open')),
        viewMode: readNumber(event.viewMode, at('viewMode'), VIEW_MODE),
        previousViewMode: readNumber(event.previousViewMode, at('previousViewMode'), VIEW_MODE),
        commandIndex: readNumber(event.commandIndex, at('commandIndex'), COMMAND_INDEX),
      };
    case 'warp-destination-set':
      return {
        type,
        tick,
        playerEntityId: readEntityId(event.playerEntityId, at('playerEntityId')),
        destination: readVector(event.destination, at('destination')),
        pixel: readMapPixel(event.pixel, at('pixel')),
        icon: readIcon(event.icon, at('icon')),
        marker: readMarkerChange(event.marker, at('marker')),
        commandIndex: readNumber(event.commandIndex, at('commandIndex'), COMMAND_INDEX),
      };
    case 'warp-started': {
      const check = readExactRecord(event.check, at('check'), ['cost', 'energy']);
      return {
        type,
        tick,
        playerEntityId: readEntityId(event.playerEntityId, at('playerEntityId')),
        serial: readNumber(event.serial, at('serial'), SERIAL),
        origin: readVector(event.origin, at('origin')),
        destination: readVector(event.destination, at('destination')),
        distance: readNumber(event.distance, at('distance'), COORDINATE),
        check: { cost: readNumber(check.cost, at('check.cost'), INT32), energy: readNumber(check.energy, at('check.energy'), INT32) },
        transitLength: readNumber(event.transitLength, at('transitLength'), COORDINATE),
        fromViewMode: readNumber(event.fromViewMode, at('fromViewMode'), VIEW_MODE),
        commandIndex: readNumber(event.commandIndex, at('commandIndex'), COMMAND_INDEX),
      };
    }
    case 'warp-completed':
      if (event.previousViewMode !== 1) throw new CoreInputError(at('previousViewMode'), 'must be 1');
      return {
        type,
        tick,
        serial: readNumber(event.serial, at('serial'), SERIAL),
        viewMode: readNumber(event.viewMode, at('viewMode'), VIEW_MODE),
        previousViewMode: 1,
        arrival: readArrival(event.arrival, at('arrival')),
      };
  }
}

/** Reads the fields of a P3-07 event (docs/plan/p3/02/spec.md, CR-06) after its type and field list. */
function readCombatEvent(event: Record<string, unknown>, path: string, tick: number, type: CombatEvent['type']): CombatEvent {
  const at = (field: string): string => `${path}.${field}`;
  switch (type) {
    case 'target-changed':
      return readTargetChanged(event, path, tick);
    case 'target-cleared':
      return {
        type,
        tick,
        playerEntityId: readEntityId(event.playerEntityId, at('playerEntityId')),
        previousTarget: readEntityId(event.previousTarget, at('previousTarget')),
        cause: readChoice(event.cause, at('cause'), ['invalid', 'base-view', 'warp']),
      };
    case 'weapon-selected':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        list: readNumber(event.list, at('list'), BIT) as 0 | 1,
        index: readNumber(event.index, at('index'), LIST_INDEX),
        mount: event.mount === null ? null : readNumber(event.mount, at('mount'), INDEX),
        changed: readBoolean(event.changed, at('changed')),
        commandIndex: readNullableCommandIndex(event.commandIndex, at('commandIndex')),
      };
    case 'shot-fired':
      return {
        type,
        tick,
        shooterEntityId: readEntityId(event.shooterEntityId, at('shooterEntityId')),
        shooterKindBit: readKindBit(event.shooterKindBit, at('shooterKindBit')),
        shooterPosition: readVector(event.shooterPosition, at('shooterPosition')),
        shooterForward: readVector(event.shooterForward, at('shooterForward'), F32),
        shooterSpeed: readNullableSpeed(event.shooterSpeed, at('shooterSpeed')),
        entityId: readEntityId(event.entityId, at('entityId')),
        family: readChoice(event.family, at('family'), ['gun', 'missile']),
        weapon: readNumber(event.weapon, at('weapon'), INDEX),
        mount: readNumber(event.mount, at('mount'), INDEX),
        position: readVector(event.position, at('position')),
        trigger: readShotTrigger(event.trigger, at('trigger')),
      };
    case 'hit':
      return readHit(event, path, tick);
    case 'object-destroyed':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        kindBit: readKindBit(event.kindBit, at('kindBit')),
        source: event.source === null ? null : readSource(event.source, at('source')),
        position: readVector(event.position, at('position')),
        activity: readChoice(event.activity, at('activity'), ['parked', 'active', 'docked']),
        attacker: readAttacker(event.attacker, at('attacker')),
        eventClass: readNumber(event.eventClass, at('eventClass'), BIT) as 0 | 1,
        outcome: readChoice(event.outcome, at('outcome'), ['explodes', 'delayed', 'removed']),
      };
    case 'explosion-started':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        sourceEntityId: readEntityId(event.sourceEntityId, at('sourceEntityId')),
        sourceKindBit: readKindBit(event.sourceKindBit, at('sourceKindBit')),
        variant: readChoice(event.variant, at('variant'), EXPLOSION_VARIANTS),
        position: readVector(event.position, at('position')),
        activationClock: readNumber(event.activationClock, at('activationClock'), INDEX),
      };
    case 'missile-ended':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        shooterEntityId: readNullableEntityId(event.shooterEntityId, at('shooterEntityId')),
        outcome: readChoice(event.outcome, at('outcome'), ['detonated', 'fizzled']),
        position: readVector(event.position, at('position')),
        orientation: readMatrix(event.orientation, at('orientation')),
      };
    case 'fragment-expired':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        sourceKindBit: readKindBit(event.sourceKindBit, at('sourceKindBit')),
        part: readNumber(event.part, at('part'), INDEX),
        position: readVector(event.position, at('position')),
        outcome: readChoice(event.outcome, at('outcome'), ['explodes', 'escape-pod', 'wingman-pod', 'removed']),
      };
    case 'source-released':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        kindBit: readKindBit(event.kindBit, at('kindBit')),
        fragmentEntityId: readEntityId(event.fragmentEntityId, at('fragmentEntityId')),
        removed: readBoolean(event.removed, at('removed')),
      };
    case 'energy-depleted':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        kindBit: readKindBit(event.kindBit, at('kindBit')),
        position: readVector(event.position, at('position')),
      };
    case 'energy-allocation-changed':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        shieldLevel: readNumber(event.shieldLevel, at('shieldLevel'), LEVEL) as Level,
        chargeLevel: readNumber(event.chargeLevel, at('chargeLevel'), LEVEL) as Level,
        commandIndex: readNumber(event.commandIndex, at('commandIndex'), COMMAND_INDEX),
      };
    case 'left-page-changed':
      return {
        type,
        tick,
        page: readNumber(event.page, at('page'), LEFT_PAGE) as LeftPage,
        previousPage: readNumber(event.previousPage, at('previousPage'), LEFT_PAGE) as LeftPage,
        commandIndex: readNullableCommandIndex(event.commandIndex, at('commandIndex')),
      };
  }
}

function readName(value: unknown, path: string): NameReference {
  const name = readDataRecord(value, path, 3);
  const type = readChoice(name.type, `${path}.type`, ['none', 'candidate', 'pool', 'craft-type']);
  switch (type) {
    case 'none':
      requireExactFields(name, path, ['type']);
      return { type };
    case 'candidate': {
      requireExactFields(name, path, ['type', 'declaration', 'candidate']);
      const { collection, index } = readExactRecord(name.declaration, `${path}.declaration`, ['collection', 'index']);
      return {
        type,
        declaration: {
          collection: readChoice(collection, `${path}.declaration.collection`, ['mission', 'wingman']),
          index: readNumber(index, `${path}.declaration.index`, INDEX),
        },
        candidate: readNumber(name.candidate, `${path}.candidate`, INDEX),
      };
    }
    case 'pool':
      requireExactFields(name, path, ['type', 'index']);
      return { type, index: readNumber(name.index, `${path}.index`, INDEX) };
    case 'craft-type':
      requireExactFields(name, path, ['type', 'kindBit']);
      return { type, kindBit: readKindBit(name.kindBit, `${path}.kindBit`) };
  }
}

/** A message inside the bounds the comm-messages reader admits; queued messages were all found in the content (CB-05). */
function readMessage(value: unknown, path: string): MessageIdentity {
  const { table, face, index } = readExactRecord(value, path, ['table', 'face', 'index']);
  const read = readNumber(table, `${path}.table`, [(item) => MESSAGE_TABLES.includes(item), `must be one of ${MESSAGE_TABLES.join(', ')}`]);
  if (read === 20983) {
    if (face !== null) throw new CoreInputError(`${path}.face`, 'must be null for the direct list');
    return { table: read, face: null, index: readNumber(index, `${path}.index`, DIRECT_INDEX) };
  }
  return { table: read as 20011 | 20019 | 20985, face: readNumber(face, `${path}.face`, FACE_INDEX), index: readNumber(index, `${path}.index`, FACE_MESSAGE_INDEX) };
}

function readSpeaker(value: unknown, path: string): SpeakerSnapshot | null {
  if (value === null) return null;
  const { entityId, kindBit, name } = readExactRecord(value, path, ['entityId', 'kindBit', 'name']);
  return { entityId: readEntityId(entityId, `${path}.entityId`), kindBit: readKindBit(kindBit, `${path}.kindBit`), name: readName(name, `${path}.name`) };
}

function readFrameDurations(value: unknown, path: string): readonly number[] {
  const durations = readList(value, path, MESSAGE_FRAMES, (item, at) => readNumber(item, at, FRAME_DURATION));
  if (durations.length === 0) throw new CoreInputError(path, 'must not be empty');
  return durations;
}

function readDeparted(event: Record<string, unknown>, path: string, tick: number): DepartedEvent {
  const at = (field: string): string => `${path}.${field}`;
  const fields = {
    type: 'departed',
    tick,
    playerEntityId: readEntityId(event.playerEntityId, at('playerEntityId')),
    viewMode: readNumber(event.viewMode, at('viewMode'), VIEW_MODE),
    previousViewMode: readNumber(event.previousViewMode, at('previousViewMode'), VIEW_MODE),
    position: readVector(event.position, at('position')),
    orientation: readMatrix(event.orientation, at('orientation')),
    wingmanEntityId: readNullableEntityId(event.wingmanEntityId, at('wingmanEntityId')),
  } as const;
  const origin = readChoice(event.origin, at('origin'), ['command', 'automatic']);
  if (origin === 'command') return { ...fields, origin, commandIndex: readNumber(event.commandIndex, at('commandIndex'), COMMAND_INDEX) };
  if (event.commandIndex !== null) throw new CoreInputError(at('commandIndex'), 'must be null for an automatic launch');
  return { ...fields, origin, commandIndex: null };
}

const readSubState = (value: unknown, path: string): MissionSubState =>
  readNumber(value, path, [(item) => SUB_STATES.includes(item), `must be one of ${SUB_STATES.join(', ')}`]) as MissionSubState;

const readNullableRow = (value: unknown, path: string): number | null => (value === null ? null : readNumber(value, path, SERVICE_ROW));

function readBaseConfirmed(event: Record<string, unknown>, path: string, tick: number): BaseConfirmedEvent {
  const row = readNullableRow(event.row, `${path}.row`);
  const record = readNullableRow(event.record, `${path}.record`);
  if ((row === null) !== (record === null)) throw new CoreInputError(`${path}.record`, 'must be null exactly when the row is');
  return {
    type: 'base-confirmed',
    tick,
    row,
    record,
    moved: readBoolean(event.moved, `${path}.moved`),
    commandIndex: readNumber(event.commandIndex, `${path}.commandIndex`, COMMAND_INDEX),
  };
}

/** Reads the fields of a P3-10 event (docs/plan/p3/02/spec.md, CB-13) after its type and field list. */
function readCommunicationsEvent(event: Record<string, unknown>, path: string, tick: number, type: CommunicationsEvent['type']): CommunicationsEvent {
  const at = (field: string): string => `${path}.${field}`;
  switch (type) {
    case 'command-delivered':
      return {
        type,
        tick,
        receiverEntityId: readEntityId(event.receiverEntityId, at('receiverEntityId')),
        receiverKindBit: readKindBit(event.receiverKindBit, at('receiverKindBit')),
        code: readNumber(event.code, at('code'), COMMAND_CODE),
        senderEntityId: readEntityId(event.senderEntityId, at('senderEntityId')),
        commandIndex: readNumber(event.commandIndex, at('commandIndex'), COMMAND_INDEX),
      };
    case 'radio-queued': {
      const callback = readChoice(event.callback, at('callback'), RADIO_CALLBACKS);
      const position = readChoice(event.position, at('position'), ['head', 'sorted']);
      // A docking reply goes to the head, every other item in due order (CB-05).
      if ((position === 'head') !== (callback === 'docking-reply')) throw new CoreInputError(at('position'), 'must be head exactly for a docking reply');
      return {
        type,
        tick,
        message: readMessage(event.message, at('message')),
        callback,
        speaker: readSpeaker(event.speaker, at('speaker')),
        position,
        length: readNumber(event.length, at('length'), integerIn(1, CORE_LIMITS.radioQueueItems)),
      };
    }
    case 'radio-taken':
      return { type, tick, message: readMessage(event.message, at('message')), speaker: readSpeaker(event.speaker, at('speaker')) };
    case 'incoming-started':
      return {
        type,
        tick,
        message: readMessage(event.message, at('message')),
        speaker: readSpeaker(event.speaker, at('speaker')),
        frameDurations: readFrameDurations(event.frameDurations, at('frameDurations')),
        shown: readBoolean(event.shown, at('shown')),
      };
    case 'incoming-ended': {
      const callback = readChoice(event.callback, at('callback'), RADIO_CALLBACKS);
      const countdownStarted = readBoolean(event.countdownStarted, at('countdownStarted'));
      if (countdownStarted && callback !== 'docking-reply') throw new CoreInputError(at('countdownStarted'), 'must be false without a docking reply');
      return { type, tick, message: readMessage(event.message, at('message')), speaker: readSpeaker(event.speaker, at('speaker')), callback, countdownStarted };
    }
    case 'radio-flushed':
      return {
        type,
        tick,
        cause: readChoice(event.cause, at('cause'), RADIO_FLUSH_CAUSES),
        removed: readNumber(event.removed, at('removed'), integerIn(0, CORE_LIMITS.radioQueueItems)),
        interrupted: readChoice(event.interrupted, at('interrupted'), ['none', 'loading', 'playing']),
      };
    case 'docking-requested':
      return {
        type,
        tick,
        playerEntityId: readEntityId(event.playerEntityId, at('playerEntityId')),
        dockingObject: readEntityId(event.dockingObject, at('dockingObject')),
        previousSubState: readSubState(event.previousSubState, at('previousSubState')),
        deadlineClock: readNumber(event.deadlineClock, at('deadlineClock'), INDEX),
        commandIndex: readNumber(event.commandIndex, at('commandIndex'), COMMAND_INDEX),
      };
    case 'docking-cancelled':
      return {
        type,
        tick,
        playerEntityId: readEntityId(event.playerEntityId, at('playerEntityId')),
        dockingObject: readEntityId(event.dockingObject, at('dockingObject')),
        cause: readChoice(event.cause, at('cause'), ['timeout', 'invalid-object', 'gate']),
      };
    case 'docked':
      return {
        type,
        tick,
        playerEntityId: readEntityId(event.playerEntityId, at('playerEntityId')),
        baseEntityId: readEntityId(event.baseEntityId, at('baseEntityId')),
        wingmanEntityId: readNullableEntityId(event.wingmanEntityId, at('wingmanEntityId')),
        previousViewMode: readNumber(event.previousViewMode, at('previousViewMode'), VIEW_MODE),
      };
    case 'departed':
      return readDeparted(event, path, tick);
    case 'transition':
      return { type, tick, gap: readChoice(event.gap, at('gap'), ['G-02/3', 'G-02/4', 'G-02/5', 'G-02/6']) };
    case 'base-navigated':
      return {
        type,
        tick,
        direction: readChoice(event.direction, at('direction'), ['previous', 'next']),
        row: readNullableRow(event.row, at('row')),
        moved: readBoolean(event.moved, at('moved')),
        commandIndex: readNumber(event.commandIndex, at('commandIndex'), COMMAND_INDEX),
      };
    case 'base-confirmed':
      return readBaseConfirmed(event, path, tick);
  }
}

/** Reads the fields of a P3-08 event (docs/plan/p3/02/spec.md, CR-22) after its type and field list. */
function readAiEvent(event: Record<string, unknown>, path: string, tick: number, type: AiEvent['type']): AiEvent {
  const at = (field: string): string => `${path}.${field}`;
  switch (type) {
    case 'wingman-command-consumed': {
      const code = readNumber(event.code, at('code'), COMMAND_CODE);
      const route = readChoice(event.path, at('path'), ['active', 'parked']);
      const outcome = readChoice(event.outcome, at('outcome'), WINGMAN_COMMAND_OUTCOMES);
      const replyLine = event.replyLine === null ? null : readNumber(event.replyLine, at('replyLine'), integerIn(0, 0xff));
      if (!isWingmanCommandReply(route, code, outcome, replyLine)) throw new CoreInputError(at('outcome'), 'must be an outcome and reply line of the code on its path');
      return {
        type,
        tick,
        wingmanEntityId: readEntityId(event.wingmanEntityId, at('wingmanEntityId')),
        code,
        // The delivery is handled after the object updates, where commands are consumed: always in an earlier tick.
        issuedTick: readNumber(event.issuedTick, at('issuedTick'), integerIn(1, tick - 1)),
        path: route,
        outcome,
        replyLine,
      };
    }
    case 'transponder-deployed':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        creatorEntityId: readEntityId(event.creatorEntityId, at('creatorEntityId')),
        position: readVector(event.position, at('position'), F32),
        orientation: readMatrix(event.orientation, at('orientation'), F32),
      };
  }
}

/** A mission Asset ID; the content reader's error becomes a CoreInputError at the same path. */
function readMissionId(value: unknown, path: string): AssetId {
  let id: AssetId;
  try {
    id = readAssetId(value, path);
  } catch (error) {
    if (error instanceof ContentContractError) throw new CoreInputError(path, 'must be an Asset ID');
    throw error;
  }
  if (!id.startsWith('mission/')) throw new CoreInputError(path, 'must be a mission Asset ID');
  return id;
}

function readSummary(value: unknown, path: string): SummaryReference | null {
  if (value === null) return null;
  const { mission, trigger, range } = readExactRecord(value, path, ['mission', 'trigger', 'range']);
  return {
    mission: readMissionId(mission, `${path}.mission`),
    trigger: readNumber(trigger, `${path}.trigger`, TRIGGER_INDEX),
    range: readNumber(range, `${path}.range`, RANGE_INDEX),
  };
}

function readReason(value: unknown, path: string): ResultReason {
  const reason = readDataRecord(value, path, 2);
  const type = readChoice(reason.type, `${path}.type`, REASON_TYPES);
  if (type !== 'third-loss') {
    requireExactFields(reason, path, ['type']);
    return { type };
  }
  requireExactFields(reason, path, ['type', 'loss']);
  return { type, loss: readChoice(reason.loss, `${path}.loss`, PLAYER_LOSSES) };
}

function readEndingGap(value: unknown, path: string): EndingGap {
  const gap = readDataRecord(value, path, 2);
  const type = readChoice(gap.gap, `${path}.gap`, ENDING_GAP_TYPES);
  if (type === 'G-02/9') {
    requireExactFields(gap, path, ['gap', 'row']);
    return { gap: type, row: readNumber(gap.row, `${path}.row`, CINC_ROW) };
  }
  requireExactFields(gap, path, ['gap', 'variant']);
  return type === 'G-02/7'
    ? { gap: type, variant: readChoice(gap.variant, `${path}.variant`, PLAYER_LOSSES) }
    : { gap: type, variant: readChoice(gap.variant, `${path}.variant`, RETURN_VARIANTS) };
}

/**
 * A latched result (ME-05) with its invariants: the reason agrees with the outcome; a success has its summary (or
 * none), `G-02/8` and, with a summary, possibly `G-02/9`; a failure has no summary and exactly the `G-02/7` of its
 * loss, `destroyed` for a failed settlement; a third loss used both rescues; latched in the event's tick.
 */
function readMissionResult(value: unknown, path: string, tick: number): MissionResult {
  const at = (field: string): string => `${path}.${field}`;
  const result = readExactRecord(value, path, ['outcome', 'reason', 'summary', 'rescuesUsed', 'endingGaps', 'playerKills', 'latchTick']);
  const outcome = readChoice(result.outcome, at('outcome'), OUTCOMES);
  const reason = readReason(result.reason, at('reason'));
  if ((reason.type === 'all-clear') !== (outcome === 'success')) throw new CoreInputError(at('reason.type'), 'must be all-clear exactly for a success');
  const summary = readSummary(result.summary, at('summary'));
  if (outcome === 'failure' && summary !== null) throw new CoreInputError(at('summary'), 'must be null for a failure');
  const rescuesUsed = readNumber(result.rescuesUsed, at('rescuesUsed'), RESCUES) as MissionResult['rescuesUsed'];
  if (reason.type === 'third-loss' && rescuesUsed !== 2) throw new CoreInputError(at('rescuesUsed'), 'must be 2 for a third loss');
  const endingGaps = readList(result.endingGaps, at('endingGaps'), ENDING_GAPS, readEndingGap);
  const [first, second] = endingGaps;
  if (outcome === 'success') {
    if (first?.gap !== 'G-02/8') throw new CoreInputError(at('endingGaps'), 'must start with G-02/8 for a success');
    if (second !== undefined && (second.gap !== 'G-02/9' || summary === null)) {
      throw new CoreInputError(at('endingGaps[1]'), 'must be a G-02/9 with a summary');
    }
  } else {
    const variant = reason.type === 'third-loss' ? reason.loss : 'destroyed';
    if (endingGaps.length !== 1 || first.gap !== 'G-02/7' || first.variant !== variant) {
      throw new CoreInputError(at('endingGaps'), `must be the one G-02/7 of variant ${variant}`);
    }
  }
  const playerKills = readNumber(result.playerKills, at('playerKills'), integerIn(0, 0x7fffffff));
  const latchTick = readNumber(result.latchTick, at('latchTick'), integerIn(tick, tick));
  return { outcome, reason, summary, rescuesUsed, endingGaps, playerKills, latchTick };
}

function readSettlementStarted(event: Record<string, unknown>, path: string, tick: number): SettlementStartedEvent {
  const outcome = readChoice(event.outcome, `${path}.outcome`, OUTCOMES);
  const summary = readSummary(event.summary, `${path}.summary`);
  const summarySelector = readNumber(event.summarySelector, `${path}.summarySelector`, SUMMARY_SELECTOR);
  if (outcome === 'failure' && summary !== null) throw new CoreInputError(`${path}.summary`, 'must be null for a failure');
  if (summary === null && summarySelector !== -1) throw new CoreInputError(`${path}.summarySelector`, 'must be -1 without a summary');
  return { type: 'settlement-started', tick, outcome, summary, summarySelector, dueClock: readNumber(event.dueClock, `${path}.dueClock`, INDEX) };
}

function readPlayerLossStarted(event: Record<string, unknown>, path: string, tick: number, loss: PlayerLoss): PlayerLossStartedEvent {
  const at = (field: string): string => `${path}.${field}`;
  const playerEntityId = readEntityId(event.playerEntityId, at('playerEntityId'));
  if (loss === 'energy') {
    return {
      type: 'player-loss-started',
      tick,
      playerEntityId,
      loss,
      previousSubState: readNumber(event.previousSubState, at('previousSubState'), integerIn(0, 0)) as 0,
      deadlineClock: readNumber(event.deadlineClock, at('deadlineClock'), INDEX),
    };
  }
  const previousViewMode = readNumber(event.previousViewMode, at('previousViewMode'), VIEW_MODE);
  const viewSwitched = readBoolean(event.viewSwitched, at('viewSwitched'));
  // The switch is skipped only in the destruction view 0x11 with sub-mode 8 (ME-09 step 3).
  if (!viewSwitched && previousViewMode !== DESTRUCTION_VIEW) throw new CoreInputError(at('viewSwitched'), 'must be true outside view mode 0x11');
  return { type: 'player-loss-started', tick, playerEntityId, loss, previousSubState: readSubState(event.previousSubState, at('previousSubState')), previousViewMode, viewSwitched };
}

function readPlayerRescued(event: Record<string, unknown>, path: string, tick: number): PlayerRescuedEvent {
  const at = (field: string): string => `${path}.${field}`;
  const baseEntityId = readNullableEntityId(event.baseEntityId, at('baseEntityId'));
  const candidates = readNumber(event.candidates, at('candidates'), integerIn(0, CORE_LIMITS.entities));
  if ((baseEntityId === null) !== (candidates === 0)) throw new CoreInputError(at('baseEntityId'), 'must be null exactly without candidates');
  return {
    type: 'player-rescued',
    tick,
    playerEntityId: readEntityId(event.playerEntityId, at('playerEntityId')),
    loss: readChoice(event.loss, at('loss'), PLAYER_LOSSES),
    rescues: readNumber(event.rescues, at('rescues'), integerIn(1, 2)) as 1 | 2,
    baseEntityId,
    candidates,
    position: readVector(event.position, at('position')),
    orientation: readMatrix(event.orientation, at('orientation')),
  };
}

/** Reads the fields of a P3-11 event (docs/plan/p3/02/spec.md, ME-13) after its type and field list. */
function readMissionEvent(event: Record<string, unknown>, path: string, tick: number, type: Exclude<MissionEvent['type'], 'player-loss-started'>): MissionEvent {
  const at = (field: string): string => `${path}.${field}`;
  switch (type) {
    case 'all-clear': {
      const kindBit = readNumber(event.kindBit, at('kindBit'), [
        (bit) => Number.isInteger(bit) && bit >= 0 && bit <= 31 && ((ENEMY_KINDS >>> bit) & 1) === 1, 'must be a kind of the enemy entry set 0x93780',
      ]);
      return { type, tick, entityId: readEntityId(event.entityId, at('entityId')), kindBit, eventClass: readNumber(event.eventClass, at('eventClass'), integerIn(0, 2)) as 0 | 1 | 2 };
    }
    case 'settlement-started':
      return readSettlementStarted(event, path, tick);
    case 'settlement-deferred':
      return { type, tick, dueClock: readNumber(event.dueClock, at('dueClock'), INDEX) };
    case 'flight-message':
      return { type, tick, message: readChoice(event.message, at('message'), FLIGHT_MESSAGES) };
    case 'player-rescued':
      return readPlayerRescued(event, path, tick);
    case 'result-latched':
      return { type, tick, result: readMissionResult(event.result, at('result'), tick) };
    case 'teardown-started':
      return { type, tick, entities: readNumber(event.entities, at('entities'), integerIn(0, CORE_LIMITS.entities)) };
    case 'mission-completed':
      return { type, tick, outcome: readChoice(event.outcome, at('outcome'), OUTCOMES) };
    case 'wingman-loss-timer-started':
      return { type, tick, wingmanEntityId: readEntityId(event.wingmanEntityId, at('wingmanEntityId')), dueClock: readNumber(event.dueClock, at('dueClock'), INDEX) };
    case 'wingman-loss-timer-expired':
      return { type, tick, queued: readBoolean(event.queued, at('queued')) };
  }
}

/** Reads the fields of a P3-12 event (docs/plan/p3/02/spec.md, FS-03) after its type and field list. */
function readPresentationEvent(event: Record<string, unknown>, path: string, tick: number, type: PresentationEvent['type']): PresentationEvent {
  const at = (field: string): string => `${path}.${field}`;
  switch (type) {
    case 'explosion-created':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, at('entityId')),
        sourceEntityId: readEntityId(event.sourceEntityId, at('sourceEntityId')),
        sourceKindBit: readKindBit(event.sourceKindBit, at('sourceKindBit')),
        variant: readChoice(event.variant, at('variant'), EXPLOSION_VARIANTS),
        stage: readChoice(event.stage, at('stage'), EXPLOSION_CONSTRUCTION_STAGES),
        position: readVector(event.position, at('position'), F32),
        velocity: readVector(event.velocity, at('velocity'), F32),
      };
    case 'view-switched': {
      let player: ViewSwitchedEvent['player'] = null;
      if (event.player !== null) {
        const fields = readExactRecord(event.player, at('player'), ['entityId', 'position', 'orientation']);
        player = {
          entityId: readEntityId(fields.entityId, at('player.entityId')),
          position: readVector(fields.position, at('player.position'), F32),
          orientation: readMatrix(fields.orientation, at('player.orientation'), F32),
        };
      }
      return {
        type,
        tick,
        fromViewMode: readNumber(event.fromViewMode, at('fromViewMode'), VIEW_MODE),
        fromSubMode: readNumber(event.fromSubMode, at('fromSubMode'), SUB_MODE),
        viewMode: readNumber(event.viewMode, at('viewMode'), VIEW_MODE),
        subMode: readNumber(event.subMode, at('subMode'), SUB_MODE),
        stage: readChoice(event.stage, at('stage'), PIPELINE_STAGE_NAMES),
        player,
      };
    }
    case 'warp-wall-contact':
      return { type, tick, serial: readNumber(event.serial, at('serial'), SERIAL) };
  }
}

/** Validates one event against the DomainEvent union, reading each field once, and returns a detached, unfrozen copy. */
function readEvent(value: unknown, path: string, tickRule: NumberRule): DomainEvent {
  const event = readDataRecord(value, path, MAX_EVENT_FIELDS);
  if (!Object.hasOwn(event, 'type')) throw new CoreInputError(`${path}.type`, 'is required');
  const type = readChoice(event.type, `${path}.type`, EVENT_TYPES);
  if (type === 'speed-matched') {
    const origin = readChoice(event.origin, `${path}.origin`, SPEED_MATCH_ORIGINS);
    requireExactFields(event, path, SPEED_MATCHED_FIELDS[origin]);
    return readSpeedMatched(event, path, readNumber(event.tick, `${path}.tick`, tickRule), origin);
  }
  if (type === 'player-loss-started') {
    const loss = readChoice(event.loss, `${path}.loss`, PLAYER_LOSSES);
    requireExactFields(event, path, PLAYER_LOSS_FIELDS[loss]);
    return readPlayerLossStarted(event, path, readNumber(event.tick, `${path}.tick`, tickRule), loss);
  }
  requireExactFields(event, path, EVENT_FIELDS[type]);
  const tick = readNumber(event.tick, `${path}.tick`, tickRule);
  switch (type) {
    case 'command-result':
      return readCommandResult(event, path, tick);
    case 'object-instantiated':
      return readObjectInstantiated(event, path, tick);
    case 'speed-assist-toggled':
      return { type, tick, commandIndex: readNumber(event.commandIndex, `${path}.commandIndex`, COMMAND_INDEX), enabled: readBoolean(event.enabled, `${path}.enabled`) };
    case 'speed-assist-released':
      return { type, tick };
    case 'object-left-world':
      return readObjectLeftWorld(event, path, tick);
    case 'map-toggled':
    case 'warp-destination-set':
    case 'warp-started':
    case 'warp-completed':
      return readMapWarpEvent(event, path, tick, type);
    case 'command-delivered':
    case 'radio-queued':
    case 'radio-taken':
    case 'incoming-started':
    case 'incoming-ended':
    case 'radio-flushed':
    case 'docking-requested':
    case 'docking-cancelled':
    case 'docked':
    case 'departed':
    case 'transition':
    case 'base-navigated':
    case 'base-confirmed':
      return readCommunicationsEvent(event, path, tick, type);
    case 'wingman-command-consumed':
    case 'transponder-deployed':
      return readAiEvent(event, path, tick, type);
    case 'object-retired':
      return {
        type,
        tick,
        entityId: readEntityId(event.entityId, `${path}.entityId`),
        kindBit: readKindBit(event.kindBit, `${path}.kindBit`),
        state: readChoice(event.state, `${path}.state`, RETIRED_STATES),
      };
    case 'all-clear':
    case 'settlement-started':
    case 'settlement-deferred':
    case 'flight-message':
    case 'player-rescued':
    case 'result-latched':
    case 'teardown-started':
    case 'mission-completed':
    case 'wingman-loss-timer-started':
    case 'wingman-loss-timer-expired':
      return readMissionEvent(event, path, tick, type);
    case 'explosion-created':
    case 'view-switched':
    case 'warp-wall-contact':
      return readPresentationEvent(event, path, tick, type);
    default:
      return readCombatEvent(event, path, tick, type);
  }
}

/**
 * The pipeline stages that emit command results, P3-06's events and the fixed-stage events of P3-07, P3-09, P3-10 and
 * P3-08, in tick order (docs/plan/p3/06/spec.md, 领域事件; docs/plan/p3/02/spec.md, CR-06, MW-05, CB-13, CR-22): P3-10's
 * docking checks in the mission flow; the speed assist and then the commands in the player's update; the other objects'
 * updates, the first place damage can happen and where a wingman consumes its command; the radio's take in the
 * communications reply; a manual match, an applied selection, a shot, an explosion's activation, a missile's or
 * fragment's expiry, a source's release, P3-09's map toggle, destination and Warp start, a delivery, a docking, a
 * launch, a base key and a transponder's deployment in request handling; an energy
 * depletion in the energy stage; a world exit in the parked update; a Warp's completion in its stage; the right
 * display's clearing at the end of the frame, and last the incoming message's presentation sub-step. P3-11's (ME-13):
 * the settlement, the completion message, the wingman loss message, the beacon's expiry and the result's due in the
 * mission flow, the escape pod's rescue or third loss in request handling, the beacon in the energy stage, and the
 * teardown and its completion in the teardown stage. P3-12's (FS-03) `explosion-created` and `view-switched` report
 * their pipeline stage (STAGE_OF) and `warp-wall-contact` comes at the frame end. `hit`, `object-destroyed` and P3-11's
 * destruction entries happen from the object updates on, in several stages; `object-instantiated`, `radio-queued` and a
 * selection or page change without a command are not ordered against the stages.
 */
const STAGE = Object.freeze({
  missionFlow: 0, assist: 1, commands: 2, objects: 3, reply: 4, requests: 5, energy: 6, parked: 7, warpCompletion: 8, teardown: 9, frameEnd: 10,
  presentation: 11,
});

/** What TickOrder counts: P3-10's and P3-11's event types, the two places a docking is cancelled, and P3-12's wall contact. */
type CountedEvent = CommunicationsEvent['type'] | MissionEvent['type'] | 'gate' | 'flow-cancellation' | 'warp-wall-contact';

/**
 * The STAGE a P3-12 event reports by its pipeline stage (FS-03): the order checks of the stages it falls between. The
 * stages of request handling to the delayed player explosion share `requests`, as `hit` does.
 */
const STAGE_OF: { readonly [Stage in PipelineStageName]: number } = Object.freeze({
  'input-registration': STAGE.missionFlow,
  'mission-flow': STAGE.missionFlow,
  clock: STAGE.missionFlow,
  'object-update': STAGE.objects,
  'communications-reply': STAGE.reply,
  'spawn-queue-check': STAGE.reply,
  'request-handling': STAGE.requests,
  movement: STAGE.requests,
  collision: STAGE.requests,
  'delayed-player-explosion': STAGE.requests,
  energy: STAGE.energy,
  'object-sets': STAGE.energy,
  'parked-update': STAGE.parked,
  'warp-completion': STAGE.warpCompletion,
  'base-interior': STAGE.warpCompletion,
  'mission-teardown': STAGE.teardown,
  'area-check': STAGE.teardown,
  'frame-end': STAGE.frameEnd,
  commit: STAGE.presentation,
});

/** A docking, launch or rescue whose `transition` must come next. */
interface PendingTransition {
  readonly gap: TransitionEvent['gap'];
  readonly path: string;
}


/**
 * The order of one tick's events, reset for each tick: the stages never go back; command results numbered 0, 1, … in
 * order; at most one speed assist event; `speed-assist-toggled`, a command's `weapon-selected`,
 * `energy-allocation-changed` and `left-page-changed` right after their command's result; a manual match's
 * `speed-matched`, a command's `target-changed` and a command's shots after their command's result; at most one
 * additional event per command, shots aside; a missile's hits after its detonation; an `object-destroyed` after a
 * `hit` of the same entity, once, and no `hit` of it after (a destroyed victim takes no hit, CR-06); at most one
 * `target-cleared`; `map-toggled`, `warp-destination-set` and `warp-started` after their command's result, as its one
 * additional event; at most one `warp-completed`. P3-10's (CB-13, CB-16): `docking-requested` right after its command's
 * `left-page-changed`; at most one delivery or base key event per command, after its result; at most one docking, two
 * launches and two transitions, each `docked` and `departed` followed at once by its `transition`; at most one take, and
 * then no incoming message starts or ends in the tick; at most one start and one end, the start not after the end, and a
 * message that starts and ends in one tick has frames of no time; the invalid-object cancellation right after a flush,
 * of which there are at most two; at most one cancellation in the mission flow and one at the docking gate. P3-08's
 * (CR-22): at most one consumed command per wingman, and no more transponder deployments than command results before.
 * P3-14's (FA-07): `object-retired` in any stage, at most once per entity and state, and an area switch never after the
 * entity's pending removal.
 * P3-11's (ME-11, ME-13): at most one of each of its events but two `player-loss-started`; `all-clear` right after the
 * destruction or world exit of its object; the player's destruction, its page change and flush right before its
 * `player-loss-started`, the beacon right before its, the completion message right after its flush, a queued wingman
 * loss message right before its expiry, a wingman's timer right after the wingman's destruction; each
 * `player-rescued` followed at once by its `transition` (G-02/5 or G-02/6); once a run, a result latched right after
 * its cause (#latch) and followed by `teardown-started` in its tick, and `mission-completed` with the latched outcome
 * in the next tick, last.
 * P3-12's (FS-03): `explosion-created` and `view-switched` in the order of the stage they report, and at most one
 * `warp-wall-contact`, at the frame end.
 */
class TickOrder {
  #previous: DomainEvent | null = null;
  /** The event before #previous, kept for the next read. */
  #prior: DomainEvent | null = null;
  /** For the event being read, the one before its previous: the destruction entry's flush when its switch sits between. */
  #beforePrevious: DomainEvent | null = null;
  #stage: number = STAGE.missionFlow;
  #commands = 0;
  #assisted = false;
  #cleared = false;
  #completed = false;
  #pendingTransition: PendingTransition | null = null;
  #started: IncomingStartedEvent | null = null;
  #missionCompleted = false;
  /** The player destroyed by the latest `object-destroyed`, while only its page change and flush follow it. */
  #playerDestruction: number | null = null;
  // The run's latch, teardown and completion (ME-11), kept across ticks.
  #latched: MissionResult['outcome'] | null = null;
  #latchPath: string | null = null;
  #teardownTick: number | null = null;
  /** The tick of `mission-completed`, which must be the run's final tick. */
  completedTick: number | null = null;
  readonly #extended = new Set<number>();
  readonly #requested = new Set<number>();
  readonly #detonated = new Set<number>();
  readonly #hit = new Set<number>();
  readonly #destroyed = new Set<number>();
  readonly #consumed = new Set<number>();
  readonly #retired = new Map<number, RetiredState>();
  #deployed = 0;
  /** Event types or causes of which a tick has at most a given number, counted. */
  readonly #counts = new Map<CountedEvent, number>();

  /** Ends the tick: a docking or launch still waiting for its transition is an error. */
  finish(): void {
    if (this.#pendingTransition !== null) throw new CoreInputError(this.#pendingTransition.path, 'must be followed by its transition');
    // The teardown starts in the latch's tick (ME-11).
    if (this.#latchPath !== null) throw new CoreInputError(this.#latchPath, 'must be followed by teardown-started in its tick');
  }

  reset(): void {
    this.#previous = null;
    this.#prior = null;
    this.#beforePrevious = null;
    this.#stage = STAGE.missionFlow;
    this.#commands = 0;
    this.#assisted = false;
    this.#cleared = false;
    this.#completed = false;
    this.#pendingTransition = null;
    this.#started = null;
    this.#missionCompleted = false;
    this.#playerDestruction = null;
    this.#latchPath = null;
    this.#extended.clear();
    this.#requested.clear();
    this.#detonated.clear();
    this.#hit.clear();
    this.#destroyed.clear();
    this.#consumed.clear();
    this.#retired.clear();
    this.#deployed = 0;
    this.#counts.clear();
  }

  /** Checks `event`, the next of the tick, and returns whether it is a command result. */
  read(event: DomainEvent, path: string): boolean {
    const previous = this.#previous;
    this.#beforePrevious = this.#prior;
    this.#prior = previous;
    this.#previous = event;
    const pending = this.#pendingTransition;
    if (pending !== null && (event.type !== 'transition' || event.gap !== pending.gap)) {
      throw new CoreInputError(path, `must be the ${pending.gap} transition of the event before`);
    }
    if (this.#missionCompleted) throw new CoreInputError(path, 'must not follow mission-completed');
    const playerDestruction = this.#trackPlayerDestruction(event);
    switch (event.type) {
      case 'command-result':
        this.#enter(STAGE.commands, path);
        if (event.commandIndex !== this.#commands) throw new CoreInputError(`${path}.commandIndex`, `must be ${this.#commands}`);
        this.#commands++;
        return true;
      case 'speed-assist-toggled':
      case 'energy-allocation-changed':
        this.#followResult(previous, event.commandIndex, path);
        return false;
      case 'weapon-selected':
      case 'left-page-changed':
        if (event.commandIndex !== null) this.#followResult(previous, event.commandIndex, path);
        return false;
      case 'speed-matched':
        if (event.origin === 'assist') {
          this.#assist(path);
          return false;
        }
        this.#followCommand(event.commandIndex, path);
        this.#extend(event.commandIndex, path);
        return false;
      case 'target-changed':
        if (event.origin === 'automatic') {
          this.#enter(STAGE.requests, path);
          return false;
        }
        this.#followCommand(event.commandIndex, path);
        this.#extend(event.commandIndex, path);
        return false;
      case 'shot-fired':
        if (event.trigger.type === 'command') this.#followCommand(event.trigger.commandIndex, `${path}.trigger`);
        else this.#enter(STAGE.requests, path);
        return false;
      case 'missile-ended':
        this.#enter(STAGE.requests, path);
        if (event.outcome === 'detonated') this.#detonated.add(event.entityId);
        return false;
      case 'explosion-started':
      case 'fragment-expired':
      case 'source-released':
        this.#enter(STAGE.requests, path);
        return false;
      case 'hit':
        this.#reach(STAGE.objects);
        if (event.cause === 'missile' && (event.sourceEntityId === null || !this.#detonated.has(event.sourceEntityId))) {
          throw new CoreInputError(`${path}.sourceEntityId`, 'must be a missile whose detonation came earlier in the tick');
        }
        if (this.#destroyed.has(event.victimEntityId)) throw new CoreInputError(`${path}.victimEntityId`, 'must not be an entity destroyed earlier in the tick');
        this.#hit.add(event.victimEntityId);
        return false;
      case 'object-destroyed':
        this.#reach(STAGE.objects);
        if (!this.#hit.has(event.entityId)) throw new CoreInputError(`${path}.entityId`, 'must be an entity hit earlier in the tick');
        if (this.#destroyed.has(event.entityId)) throw new CoreInputError(`${path}.entityId`, 'must not be an entity destroyed earlier in the tick');
        this.#destroyed.add(event.entityId);
        return false;
      case 'energy-depleted':
        this.#enter(STAGE.energy, path);
        return false;
      case 'speed-assist-released':
        this.#assist(path);
        return false;
      case 'object-left-world':
        this.#enter(STAGE.parked, path);
        return false;
      case 'target-cleared':
        this.#enter(STAGE.frameEnd, path);
        if (this.#cleared) throw new CoreInputError(path, 'must not be a second target-cleared of the tick');
        this.#cleared = true;
        return false;
      case 'map-toggled':
      case 'warp-destination-set':
      case 'warp-started':
        this.#followCommand(event.commandIndex, path);
        this.#extend(event.commandIndex, path);
        return false;
      case 'warp-completed':
        this.#enter(STAGE.warpCompletion, path);
        if (this.#completed) throw new CoreInputError(path, 'must not be a second warp-completed of the tick');
        this.#completed = true;
        return false;
      case 'object-instantiated':
      case 'radio-queued':
        return false;
      case 'wingman-command-consumed':
        this.#enter(STAGE.objects, path);
        if (this.#consumed.has(event.wingmanEntityId)) throw new CoreInputError(`${path}.wingmanEntityId`, 'must not consume a second command in the tick');
        this.#consumed.add(event.wingmanEntityId);
        return false;
      case 'transponder-deployed':
        this.#enter(STAGE.requests, path);
        // Each comes from an accepted drop-transponder command of the tick, so no more than its command results.
        if (++this.#deployed > this.#commands) throw new CoreInputError(path, 'must not outnumber the command results before it');
        return false;
      case 'object-retired': {
        // Only an area switch may come before a pending removal of the same entity (FA-07).
        const earlier = this.#retired.get(event.entityId);
        if (earlier !== undefined && (earlier !== 'area-switch' || event.state !== 'pending-removal')) {
          throw new CoreInputError(`${path}.state`, 'must be a pending removal after the entity\'s area switch, or its first retirement of the tick');
        }
        this.#retired.set(event.entityId, event.state);
        return false;
      }
      case 'all-clear':
      case 'settlement-started':
      case 'settlement-deferred':
      case 'flight-message':
      case 'player-loss-started':
      case 'player-rescued':
      case 'result-latched':
      case 'teardown-started':
      case 'mission-completed':
      case 'wingman-loss-timer-started':
      case 'wingman-loss-timer-expired':
        this.#readMission(event, previous, playerDestruction, path);
        return false;
      case 'explosion-created':
      case 'view-switched':
        this.#enter(STAGE_OF[event.stage], `${path}.stage`);
        return false;
      case 'warp-wall-contact':
        this.#enter(STAGE.frameEnd, path);
        this.#count(event.type, 1, path);
        return false;
      default:
        this.#readCommunications(event, previous, path);
        return false;
    }
  }

  /** P3-11's events (ME-13). */
  #readMission(event: MissionEvent, previous: DomainEvent | null, playerDestruction: number | null, path: string): void {
    // At most one of each a tick, but the destruction's and the energy's losses (ME-13).
    this.#count(event.type, event.type === 'player-loss-started' ? 2 : 1, path);
    switch (event.type) {
      case 'all-clear': {
        const source = previous?.type === 'object-destroyed' || previous?.type === 'object-left-world' ? previous : null;
        const eventClass = source?.type === 'object-destroyed' ? source.eventClass : 2;
        if (source === null || eventClass !== event.eventClass || source.entityId !== event.entityId || source.kindBit !== event.kindBit) {
          throw new CoreInputError(path, 'must come right after the destruction or world exit of its object');
        }
        return;
      }
      case 'settlement-started':
      case 'settlement-deferred':
      case 'wingman-loss-timer-expired':
        this.#enter(STAGE.missionFlow, path);
        if (event.type === 'wingman-loss-timer-expired' && event.queued && previous?.type !== 'radio-queued') {
          throw new CoreInputError(path, 'must come right after the radio-queued of its message');
        }
        return;
      case 'flight-message':
        if (event.message === 'beacon') {
          this.#enter(STAGE.energy, path);
          return;
        }
        this.#enter(STAGE.missionFlow, path);
        if (previous?.type !== 'radio-flushed' || previous.cause !== 'completion-message') {
          throw new CoreInputError(path, 'must come right after its completion-message flush');
        }
        return;
      case 'player-loss-started': {
        if (event.loss === 'energy') {
          this.#enter(STAGE.energy, path);
          if (previous?.type !== 'flight-message' || previous.message !== 'beacon') throw new CoreInputError(path, 'must come right after its beacon message');
          return;
        }
        this.#reach(STAGE.objects);
        // A switch to the destruction view emits its `view-switched` between the flush and the loss (FS-03 with ME-09):
        // the loss then comes right after that switch, and the switch right after the flush.
        if (event.viewSwitched) {
          if (previous?.type !== 'view-switched' || previous.viewMode !== DESTRUCTION_VIEW || previous.subMode !== DESTRUCTION_SUB_MODE
            || previous.fromViewMode !== event.previousViewMode) {
            throw new CoreInputError(path, 'must come right after its switch to the destruction view 0x11/8');
          }
        }
        const flush = event.viewSwitched ? this.#beforePrevious : previous;
        if (flush?.type !== 'radio-flushed' || flush.cause !== 'player-destroyed' || playerDestruction !== event.playerEntityId) {
          throw new CoreInputError(path, 'must come right after its player-destroyed flush, which follows the player\'s destruction');
        }
        return;
      }
      case 'player-rescued':
        // The energy loss's rescue comes in the mission flow, the destruction's at the escape pod's expiry (ME-10).
        this.#enter(event.loss === 'energy' ? STAGE.missionFlow : STAGE.requests, path);
        this.#pendingTransition = { gap: event.loss === 'energy' ? 'G-02/6' : 'G-02/5', path };
        return;
      case 'result-latched':
        this.#latch(event, previous, path);
        return;
      case 'teardown-started':
        this.#enter(STAGE.teardown, path);
        if (this.#latchPath === null) throw new CoreInputError(path, 'must follow result-latched in its tick');
        this.#latchPath = null;
        this.#teardownTick = event.tick;
        return;
      case 'mission-completed':
        this.#enter(STAGE.teardown, path);
        if (this.#teardownTick !== event.tick - 1) throw new CoreInputError(path, 'must come in the tick after teardown-started');
        if (event.outcome !== this.#latched) throw new CoreInputError(`${path}.outcome`, 'must be the latched outcome');
        this.#missionCompleted = true;
        this.completedTick = event.tick;
        return;
      case 'wingman-loss-timer-started':
        this.#reach(STAGE.objects);
        if (previous?.type !== 'object-destroyed' || previous.entityId !== event.wingmanEntityId || previous.kindBit !== WINGMAN_KIND_BIT) {
          throw new CoreInputError(path, 'must come right after the destruction of its wingman');
        }
        return;
    }
  }

  /**
   * Keeps the player destroyed by an `object-destroyed` while only the destruction entry's page change and flush follow
   * it (ME-13), and returns the value before `event`.
   */
  #trackPlayerDestruction(event: DomainEvent): number | null {
    const before = this.#playerDestruction;
    if (event.type === 'object-destroyed') this.#playerDestruction = event.kindBit === PLAYER_KIND_BIT ? event.entityId : null;
    else if (
      !(event.type === 'left-page-changed' && event.commandIndex === null) && !(event.type === 'radio-flushed' && event.cause === 'player-destroyed')
      // The destruction entry's own switch (FS-03) sits between its flush and its loss.
      && !(event.type === 'view-switched' && event.viewMode === DESTRUCTION_VIEW && event.subMode === DESTRUCTION_SUB_MODE)
    ) {
      this.#playerDestruction = null;
    }
    return before;
  }

  /**
   * The latch (ME-05, ME-10, ME-13), once a run: the result's due or a failed settlement after its flush in the mission
   * flow; a third energy loss after the beacon's flush there; a third destruction at the escape pod's expiry in request
   * handling.
   */
  #latch(event: ResultLatchedEvent, previous: DomainEvent | null, path: string): void {
    if (this.#latched !== null) throw new CoreInputError(path, 'must not be a second result-latched of the run');
    const { reason } = event.result;
    if (reason.type === 'third-loss' && reason.loss === 'destroyed') {
      this.#enter(STAGE.requests, path);
      if (previous?.type !== 'fragment-expired' || previous.outcome !== 'escape-pod') throw new CoreInputError(path, 'must come right after the escape pod\'s expiry');
    } else {
      this.#enter(STAGE.missionFlow, path);
      const cause = reason.type === 'third-loss' ? 'beacon-expired' : 'result-due';
      if (previous?.type !== 'radio-flushed' || previous.cause !== cause) throw new CoreInputError(path, `must come right after its ${cause} flush`);
    }
    this.#latched = event.result.outcome;
    this.#latchPath = path;
  }

  /** P3-10's events but `radio-queued` (CB-13). */
  #readCommunications(event: Exclude<CommunicationsEvent, RadioQueuedEvent>, previous: DomainEvent | null, path: string): void {
    switch (event.type) {
      case 'radio-flushed':
        // A destruction's flush comes where the damage is; every other in the mission flow (CB-06, ME-13).
        if (event.cause === 'player-destroyed') this.#reach(STAGE.objects);
        else this.#enter(STAGE.missionFlow, path);
        this.#count(event.type, 2, path);
        return;
      case 'docking-cancelled':
        if (event.cause === 'gate') {
          this.#enter(STAGE.requests, path);
          this.#count('gate', 1, path);
          return;
        }
        this.#enter(STAGE.missionFlow, path);
        this.#count('flow-cancellation', 1, path);
        if (event.cause === 'invalid-object' && previous?.type !== 'radio-flushed') {
          throw new CoreInputError(path, 'must come right after its radio-flushed');
        }
        return;
      case 'docking-requested':
        this.#enter(STAGE.commands, path);
        if (previous?.type !== 'left-page-changed' || previous.commandIndex !== event.commandIndex) {
          throw new CoreInputError(`${path}.commandIndex`, 'must be the command whose left-page-changed comes right before');
        }
        return;
      case 'radio-taken':
        this.#enter(STAGE.reply, path);
        this.#count(event.type, 1, path);
        return;
      case 'command-delivered':
      case 'base-navigated':
      case 'base-confirmed':
        this.#request(event.commandIndex, path);
        return;
      case 'docked':
        this.#enter(STAGE.requests, path);
        this.#count(event.type, 1, path);
        this.#pendingTransition = { gap: 'G-02/3', path };
        return;
      case 'departed':
        if (event.origin === 'command') this.#request(event.commandIndex, path);
        else this.#enter(STAGE.requests, path);
        this.#count(event.type, 2, path);
        this.#pendingTransition = { gap: 'G-02/4', path };
        return;
      case 'transition':
        if (this.#pendingTransition === null) throw new CoreInputError(path, 'must come right after a docked, departed or player-rescued');
        this.#pendingTransition = null;
        this.#count(event.type, 2, path);
        return;
      case 'incoming-started':
        this.#incoming(path);
        if (this.#counts.has('incoming-ended')) throw new CoreInputError(path, 'must not follow the end of an incoming message');
        this.#count(event.type, 1, path);
        this.#started = event;
        return;
      case 'incoming-ended': {
        this.#incoming(path);
        this.#count(event.type, 1, path);
        // A message started in this tick ends at once only when its frames take no time (CB-09).
        const started = this.#started;
        if (started !== null && (!same(started.message, event.message) || !same(started.speaker, event.speaker) || started.frameDurations.some((frame) => frame !== 0))) {
          throw new CoreInputError(path, 'must end the message started in this tick, whose frames take no time');
        }
        return;
      }
    }
  }

  /** The presentation sub-step: a message taken in this tick is still loading, so none starts or ends (CB-06, CB-09). */
  #incoming(path: string): void {
    this.#enter(STAGE.presentation, path);
    if (this.#counts.has('radio-taken')) throw new CoreInputError(path, 'must not share its tick with a radio-taken');
  }

  #enter(stage: number, path: string): void {
    if (stage < this.#stage) throw new CoreInputError(path, 'must not follow an event of a later stage of its tick');
    this.#stage = stage;
  }

  /** An event of `stage` or any later one: it closes the earlier stages. */
  #reach(stage: number): void {
    this.#stage = Math.max(this.#stage, stage);
  }

  /** An additional event of a command in the player's update: right after that command's result. */
  #followResult(previous: DomainEvent | null, commandIndex: number, path: string): void {
    this.#enter(STAGE.commands, path);
    if (previous?.type !== 'command-result' || previous.commandIndex !== commandIndex) {
      throw new CoreInputError(`${path}.commandIndex`, 'must be the command whose result comes right before');
    }
    this.#extend(commandIndex, path);
  }

  /** An event of a command's request in request handling: after that command's result. */
  #followCommand(commandIndex: number, path: string): void {
    this.#enter(STAGE.requests, path);
    if (commandIndex >= this.#commands) throw new CoreInputError(`${path}.commandIndex`, 'must be a command whose result came earlier in the tick');
  }

  #extend(commandIndex: number, path: string): void {
    if (this.#extended.has(commandIndex)) throw new CoreInputError(`${path}.commandIndex`, 'must not have a second additional event');
    this.#extended.add(commandIndex);
  }

  /** A P3-10 event of a command's request (a delivery, a base key, a launch): at most one per command. */
  #request(commandIndex: number, path: string): void {
    this.#followCommand(commandIndex, path);
    if (this.#requested.has(commandIndex)) throw new CoreInputError(`${path}.commandIndex`, 'must not have a second request event');
    this.#requested.add(commandIndex);
  }

  #count(name: CountedEvent, most: number, path: string): void {
    const count = (this.#counts.get(name) ?? 0) + 1;
    if (count > most) throw new CoreInputError(path, `must not be one of more than ${most} such events of the tick`);
    this.#counts.set(name, count);
  }

  #assist(path: string): void {
    this.#enter(STAGE.assist, path);
    if (this.#assisted) throw new CoreInputError(path, 'must not be a second speed assist event of the tick');
    this.#assisted = true;
  }
}

function readCheckpoint(value: unknown, path: string): ReplayCheckpoint {
  const { tick, hash } = readExactRecord(value, path, ['tick', 'hash']);
  return { tick: readNumber(tick, `${path}.tick`, integerIn(0, CORE_LIMITS.recordedTicks)), hash: readHash(hash, `${path}.hash`) };
}

/**
 * Validates a result's structure, bounds and invariants at `root…` paths and returns a detached copy to compare:
 * checkpoints strictly increasing from tick 0 to the final tick; events with ticks from 1 to the final tick, never
 * decreasing, at most CORE_LIMITS.eventsPerTick per tick in the order TickOrder checks, and at most
 * CORE_LIMITS.recordedCommands command results in all. It does not infer the checkpoint interval or replay anything.
 */
function readResult(value: unknown, root: string): ReplayResult {
  const result = readExactRecord(value, root, ['events', 'checkpoints', 'finalTick']);
  const finalTick = readNumber(result.finalTick, `${root}.finalTick`, integerIn(0, CORE_LIMITS.recordedTicks));
  const checkpoints = readList(result.checkpoints, `${root}.checkpoints`, CORE_LIMITS.recordedCheckpoints, readCheckpoint);
  if (checkpoints.length === 0) throw new CoreInputError(`${root}.checkpoints`, 'must not be empty');
  checkpoints.forEach(({ tick }, index) => {
    const path = `${root}.checkpoints[${index}].tick`;
    if (index === 0 && tick !== 0) throw new CoreInputError(path, 'must be 0');
    if (index > 0 && tick <= checkpoints[index - 1].tick) throw new CoreInputError(path, 'must be greater than the previous checkpoint tick');
  });
  if (checkpoints[checkpoints.length - 1].tick !== finalTick) {
    throw new CoreInputError(`${root}.checkpoints[${checkpoints.length - 1}].tick`, 'must be the final tick');
  }

  const tickRule = integerIn(1, finalTick);
  const events = readList(result.events, `${root}.events`, CORE_LIMITS.recordedEvents, (item, path) => readEvent(item, path, tickRule));
  let tick = 0;
  let tickEvents = 0;
  const order = new TickOrder();
  let commands = 0;
  events.forEach((event, index) => {
    const path = `${root}.events[${index}]`;
    if (event.tick < tick) throw new CoreInputError(`${path}.tick`, 'must not be below the previous event tick');
    if (event.tick > tick) {
      order.finish();
      tick = event.tick;
      tickEvents = 0;
      order.reset();
    }
    if (!fitsLimit('eventsPerTick', tickEvents, 1)) throw new CoreInputError(path, `must not be one of more than ${CORE_LIMITS.eventsPerTick} events of a tick`);
    tickEvents++;
    if (!order.read(event, path)) return;
    if (!fitsLimit('recordedCommands', commands, 1)) throw new CoreInputError(path, `must not be one of more than ${CORE_LIMITS.recordedCommands} command results`);
    commands++;
  });
  order.finish();
  // The completion is the run's last tick (ME-11).
  if (order.completedTick !== null && order.completedTick !== finalTick) throw new CoreInputError(`${root}.finalTick`, 'must be the tick of mission-completed');
  return { events, checkpoints, finalTick };
}

/** Equality of validated plain data; `===` also treats -0 and 0 as equal. */
function same(left: unknown, right: unknown): boolean {
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return left === right;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

const tickAt = (list: readonly { readonly tick: number }[], index: number): number => list[index]?.tick ?? Infinity;

/** Compares two results; see the module comment. */
export function compareReplayResults(expected: unknown, actual: unknown): ReplayComparison {
  const left = readResult(expected, 'expected');
  const right = readResult(actual, 'actual');
  const common = Math.min(left.finalTick, right.finalTick);
  // Every list is sorted by tick, so cursors visit every tick with events or a checkpoint in order.
  let leftEvent = 0;
  let rightEvent = 0;
  let leftCheckpoint = 0;
  let rightCheckpoint = 0;
  for (;;) {
    const tick = Math.min(
      tickAt(left.events, leftEvent),
      tickAt(right.events, rightEvent),
      tickAt(left.checkpoints, leftCheckpoint),
      tickAt(right.checkpoints, rightCheckpoint),
    );
    if (tick > common) break;
    let eventsDiffer = false;
    while (tickAt(left.events, leftEvent) === tick || tickAt(right.events, rightEvent) === tick) {
      const a = tickAt(left.events, leftEvent) === tick ? left.events[leftEvent++] : undefined;
      const b = tickAt(right.events, rightEvent) === tick ? right.events[rightEvent++] : undefined;
      if (!same(a, b)) eventsDiffer = true;
    }
    if (eventsDiffer) return Object.freeze({ match: false, tick, kind: 'events' });
    const leftHash = tickAt(left.checkpoints, leftCheckpoint) === tick ? left.checkpoints[leftCheckpoint++].hash : undefined;
    const rightHash = tickAt(right.checkpoints, rightCheckpoint) === tick ? right.checkpoints[rightCheckpoint++].hash : undefined;
    // The shorter run always samples its final tick; the longer one samples there only on its interval.
    const shorterTail = tick === common && left.finalTick !== right.finalTick && (left.finalTick === common ? rightHash : leftHash) === undefined;
    if (leftHash !== rightHash && !shorterTail) return Object.freeze({ match: false, tick, kind: 'checkpoint' });
  }
  if (left.finalTick !== right.finalTick) return Object.freeze({ match: false, tick: common + 1, kind: 'length' });
  return Object.freeze({ match: true });
}
