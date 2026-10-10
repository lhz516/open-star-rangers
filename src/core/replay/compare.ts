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
  type CommandResultEvent,
  type DomainEvent,
  type EntitySource,
  type GroupMembership,
  type ObjectInstantiatedEvent,
  type ObjectLeftWorldEvent,
  type SpeedMatchedEvent,
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
import { readHash, type ReplayCheckpoint, type ReplayResult } from './recording.ts';

/** Difference data, not an error. */
export type ReplayComparison =
  | { readonly match: true }
  | { readonly match: false; readonly tick: number; readonly kind: 'events' | 'checkpoint' | 'length' };

// Keyed by every event type, and `speed-matched` by every origin, so a new DomainEvent variant does not compile until
// it is read here.
const EVENT_FIELDS = {
  'command-result': ['type', 'tick', 'commandIndex', 'commandType', 'outcome', 'reason'],
  'object-instantiated': ['type', 'tick', 'entityId', 'kindBit', 'source', 'position'],
  'speed-assist-toggled': ['type', 'tick', 'commandIndex', 'enabled'],
  'speed-assist-released': ['type', 'tick'],
  'object-left-world': ['type', 'tick', 'entityId', 'kindBit', 'source'],
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
  }
}

/**
 * The pipeline stages that emit command results and P3-06's events, in tick order (docs/plan/p3/06/spec.md, 领域事件):
 * the speed assist and then the commands in the player's update, a manual match in request handling, a world exit in
 * the parked update. Other events are not ordered against them.
 */
const STAGE = Object.freeze({ assist: 0, commands: 1, requests: 2, parked: 3 });

/**
 * The order of one tick's events, reset for each tick: the stages never go back; command results numbered 0, 1, … in
 * order; at most one speed assist event; `speed-assist-toggled` right after its command's result; a manual match's
 * `speed-matched` after its command's result; at most one such additional event per command.
 */
class TickOrder {
  #previous: DomainEvent | null = null;
  #stage: number = STAGE.assist;
  #commands = 0;
  #assisted = false;
  readonly #extended = new Set<number>();

  reset(): void {
    this.#previous = null;
    this.#stage = STAGE.assist;
    this.#commands = 0;
    this.#assisted = false;
    this.#extended.clear();
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
        this.#enter(STAGE.commands, path);
        if (previous?.type !== 'command-result' || previous.commandIndex !== event.commandIndex) {
          throw new CoreInputError(`${path}.commandIndex`, 'must be the command whose result comes right before');
        }
        this.#extend(event.commandIndex, path);
        return false;
      case 'speed-matched':
        if (event.origin === 'assist') {
          this.#assist(path);
          return false;
        }
        this.#enter(STAGE.requests, path);
        if (event.commandIndex >= this.#commands) throw new CoreInputError(`${path}.commandIndex`, 'must be a command whose result came earlier in the tick');
        this.#extend(event.commandIndex, path);
        return false;
      case 'speed-assist-released':
        this.#assist(path);
        return false;
      case 'object-left-world':
        this.#enter(STAGE.parked, path);
        return false;
      case 'object-instantiated':
        return false;
    }
  }

  #enter(stage: number, path: string): void {
    if (stage < this.#stage) throw new CoreInputError(path, 'must not follow an event of a later stage of its tick');
    this.#stage = stage;
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
