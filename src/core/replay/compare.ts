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

// Keyed by every event type, so a new DomainEvent variant does not compile until it is read here.
const EVENT_FIELDS = {
  'command-result': ['type', 'tick', 'commandIndex', 'commandType', 'outcome', 'reason'],
  'object-instantiated': ['type', 'tick', 'entityId', 'kindBit', 'source', 'position'],
} as const satisfies { readonly [Type in DomainEvent['type']]: readonly (keyof Extract<DomainEvent, { type: Type }>)[] };
const EVENT_TYPES = Object.keys(EVENT_FIELDS) as DomainEvent['type'][];
const MAX_EVENT_FIELDS = Math.max(...Object.values(EVENT_FIELDS).map((fields) => fields.length));

const INDEX = integerIn(0, Number.MAX_SAFE_INTEGER);
const COORDINATE: NumberRule = [Number.isFinite, 'must be a finite number'];

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
  const commandIndex = readNumber(event.commandIndex, `${path}.commandIndex`, integerIn(0, CORE_LIMITS.commandsPerTick - 1));
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
    entityId: readNumber(event.entityId, `${path}.entityId`, integerIn(1, Number.MAX_SAFE_INTEGER)),
    kindBit: readNumber(event.kindBit, `${path}.kindBit`, integerIn(0, 31)),
    source: readSource(event.source, `${path}.source`),
    position: readVector(event.position, `${path}.position`),
  };
}

/** Validates one event against the DomainEvent union, reading each field once, and returns a detached, unfrozen copy. */
function readEvent(value: unknown, path: string, tickRule: NumberRule): DomainEvent {
  const event = readDataRecord(value, path, MAX_EVENT_FIELDS);
  if (!Object.hasOwn(event, 'type')) throw new CoreInputError(`${path}.type`, 'is required');
  const type = readChoice(event.type, `${path}.type`, EVENT_TYPES);
  requireExactFields(event, path, EVENT_FIELDS[type]);
  const tick = readNumber(event.tick, `${path}.tick`, tickRule);
  return type === 'command-result' ? readCommandResult(event, path, tick) : readObjectInstantiated(event, path, tick);
}

function readCheckpoint(value: unknown, path: string): ReplayCheckpoint {
  const { tick, hash } = readExactRecord(value, path, ['tick', 'hash']);
  return { tick: readNumber(tick, `${path}.tick`, integerIn(0, CORE_LIMITS.recordedTicks)), hash: readHash(hash, `${path}.hash`) };
}

/**
 * Validates a result's structure, bounds and invariants at `root…` paths and returns a detached copy to compare:
 * checkpoints strictly increasing from tick 0 to the final tick; events with ticks from 1 to the final tick, never
 * decreasing, at most CORE_LIMITS.eventsPerTick per tick, and each tick's command results numbered 0, 1, … in order,
 * at most CORE_LIMITS.recordedCommands in all. It does not infer the checkpoint interval or replay anything.
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
  let tickCommands = 0;
  let commands = 0;
  events.forEach((event, index) => {
    const path = `${root}.events[${index}]`;
    if (event.tick < tick) throw new CoreInputError(`${path}.tick`, 'must not be below the previous event tick');
    if (event.tick > tick) {
      tick = event.tick;
      tickEvents = 0;
      tickCommands = 0;
    }
    if (!fitsLimit('eventsPerTick', tickEvents, 1)) throw new CoreInputError(path, `must not be one of more than ${CORE_LIMITS.eventsPerTick} events of a tick`);
    tickEvents++;
    if (event.type !== 'command-result') return;
    if (event.commandIndex !== tickCommands) throw new CoreInputError(`${path}.commandIndex`, `must be ${tickCommands}`);
    if (!fitsLimit('recordedCommands', commands, 1)) throw new CoreInputError(path, `must not be one of more than ${CORE_LIMITS.recordedCommands} command results`);
    tickCommands++;
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
