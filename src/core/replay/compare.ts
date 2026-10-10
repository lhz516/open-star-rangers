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
import {
  COMMAND_OUTCOMES,
  COMMAND_RESULT_REASONS,
  type Attacker,
  type CommandResultEvent,
  type DomainEvent,
  type EntitySource,
  type GroupMembership,
  type HitEvent,
  type ObjectInstantiatedEvent,
  type ObjectLeftWorldEvent,
  type ShotTrigger,
  type SpeedAssistReleasedEvent,
  type SpeedAssistToggledEvent,
  type SpeedMatchedEvent,
  type TargetChangedEvent,
  type Vec3,
} from '../contracts/domain-events.ts';
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
import type { Level, Matrix3 } from '../world/entity-table.ts';
import type { LeftPage } from '../world/player-state.ts';
import { readHash, type ReplayCheckpoint, type ReplayResult } from './recording.ts';

/** P3-07's events (docs/plan/p3/02/spec.md, CR-06). */
type CombatEvent = Exclude<
  DomainEvent,
  CommandResultEvent | ObjectInstantiatedEvent | SpeedAssistToggledEvent | SpeedMatchedEvent | SpeedAssistReleasedEvent | ObjectLeftWorldEvent
>;

/** Difference data, not an error. */
export type ReplayComparison =
  | { readonly match: true }
  | { readonly match: false; readonly tick: number; readonly kind: 'events' | 'checkpoint' | 'length' };

// Keyed by every event type, and `speed-matched` by every origin, so a new DomainEvent variant does not compile until
// it is read here. `target-changed` has the same fields for both origins.
const EVENT_FIELDS = {
  'command-result': ['type', 'tick', 'commandIndex', 'commandType', 'outcome', 'reason'],
  'object-instantiated': ['type', 'tick', 'entityId', 'kindBit', 'source', 'position'],
  'speed-assist-toggled': ['type', 'tick', 'commandIndex', 'enabled'],
  'speed-assist-released': ['type', 'tick'],
  'object-left-world': ['type', 'tick', 'entityId', 'kindBit', 'source'],
  'target-changed': ['type', 'tick', 'playerEntityId', 'previousTarget', 'target', 'targetKindBit', 'mode', 'origin', 'commandIndex'],
  'target-cleared': ['type', 'tick', 'playerEntityId', 'previousTarget', 'cause'],
  'weapon-selected': ['type', 'tick', 'entityId', 'list', 'index', 'mount', 'changed', 'commandIndex'],
  'shot-fired': ['type', 'tick', 'shooterEntityId', 'shooterKindBit', 'shooterPosition', 'entityId', 'family', 'weapon', 'mount', 'position', 'trigger'],
  hit: [
    'type', 'tick', 'victimEntityId', 'victimKindBit', 'victimPosition', 'cause', 'sourceEntityId', 'attacker', 'damage', 'gated', 'shield', 'hull',
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
} as const satisfies { readonly [Type in Exclude<DomainEvent['type'], 'speed-matched'>]: readonly (keyof Extract<DomainEvent, { type: Type }>)[] };
const SPEED_MATCHED_FIELDS = {
  command: ['type', 'tick', 'targetEntityId', 'origin', 'commandIndex'],
  assist: ['type', 'tick', 'targetEntityId', 'origin', 'speedDifferenceExceeded'],
} as const satisfies { readonly [Origin in SpeedMatchedEvent['origin']]: readonly (keyof Extract<SpeedMatchedEvent, { origin: Origin }>)[] };
const EVENT_TYPES = [...Object.keys(EVENT_FIELDS), 'speed-matched'] as DomainEvent['type'][];
const SPEED_MATCH_ORIGINS = Object.keys(SPEED_MATCHED_FIELDS) as SpeedMatchedEvent['origin'][];
const MAX_EVENT_FIELDS = Math.max(...[...Object.values(EVENT_FIELDS), ...Object.values(SPEED_MATCHED_FIELDS)].map((fields) => fields.length));

const INDEX = integerIn(0, Number.MAX_SAFE_INTEGER);
const ENTITY_ID = integerIn(1, Number.MAX_SAFE_INTEGER);
const KIND_BIT = integerIn(0, 31);
const COMMAND_INDEX = integerIn(0, CORE_LIMITS.commandsPerTick - 1);
const COORDINATE: NumberRule = [Number.isFinite, 'must be a finite number'];
const INT32 = integerIn(-0x80000000, 0x7fffffff);
const LEVEL = integerIn(0, 3);
const LEFT_PAGE = integerIn(0, 6);
const BIT = integerIn(0, 1);
const AI_CHANNEL = integerIn(0, 2);
const FACE = integerIn(0, 5);
/** A list's index: −1 for an empty list. */
const LIST_INDEX = integerIn(-1, 0x7fffffff);

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new CoreInputError(path, 'must be a boolean');
  return value;
}

function readVector(value: unknown, path: string): Vec3 {
  const { x, y, z } = readExactRecord(value, path, ['x', 'y', 'z']);
  return { x: readNumber(x, `${path}.x`, COORDINATE), y: readNumber(y, `${path}.y`, COORDINATE), z: readNumber(z, `${path}.z`, COORDINATE) };
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

function readMatrix(value: unknown, path: string): Matrix3 {
  const rows = readList(value, path, 9, (item, at) => readNumber(item, at, COORDINATE));
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
        variant: readChoice(event.variant, at('variant'), ['large', 'other', 'missile']),
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
    default:
      return readCombatEvent(event, path, tick, type);
  }
}

/**
 * The pipeline stages that emit command results, P3-06's events and P3-07's fixed-stage events, in tick order
 * (docs/plan/p3/06/spec.md, 领域事件; docs/plan/p3/02/spec.md, CR-06): the speed assist and then the commands in the
 * player's update; the other objects' updates, the first place damage can happen; a manual match, an applied
 * selection, a shot, an explosion's activation, a missile's or fragment's expiry and a source's release in request
 * handling; an energy depletion in the energy stage; a world exit in the parked update; the right display's clearing
 * at the end of the frame. `hit` and `object-destroyed` happen from the object updates on, in several stages;
 * `object-instantiated` and a selection or page change without a command are not ordered against the stages.
 */
const STAGE = Object.freeze({ assist: 0, commands: 1, objects: 2, requests: 3, energy: 4, parked: 5, frameEnd: 6 });

/**
 * The order of one tick's events, reset for each tick: the stages never go back; command results numbered 0, 1, … in
 * order; at most one speed assist event; `speed-assist-toggled`, a command's `weapon-selected`,
 * `energy-allocation-changed` and `left-page-changed` right after their command's result; a manual match's
 * `speed-matched`, a command's `target-changed` and a command's shots after their command's result; at most one
 * additional event per command, shots aside; a missile's hits after its detonation; an `object-destroyed` after a
 * `hit` of the same entity; at most one `target-cleared`.
 */
class TickOrder {
  #previous: DomainEvent | null = null;
  #stage: number = STAGE.assist;
  #commands = 0;
  #assisted = false;
  #cleared = false;
  readonly #extended = new Set<number>();
  readonly #detonated = new Set<number>();
  readonly #hit = new Set<number>();

  reset(): void {
    this.#previous = null;
    this.#stage = STAGE.assist;
    this.#commands = 0;
    this.#assisted = false;
    this.#cleared = false;
    this.#extended.clear();
    this.#detonated.clear();
    this.#hit.clear();
  }

  /** Checks `event`, the next of the tick, and returns whether it is a command result. */
  read(event: DomainEvent, path: string): boolean {
    const previous = this.#previous;
    this.#previous = event;
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
        this.#hit.add(event.victimEntityId);
        return false;
      case 'object-destroyed':
        this.#reach(STAGE.objects);
        if (!this.#hit.has(event.entityId)) throw new CoreInputError(`${path}.entityId`, 'must be an entity hit earlier in the tick');
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
      case 'object-instantiated':
        return false;
    }
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
