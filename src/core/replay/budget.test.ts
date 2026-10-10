import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { readTickInput, type Command, type TickInput } from '../contracts/tick-input.ts';
import { registerTick, runTick, type Request } from '../systems/pipeline.ts';
import type { Entity, EntityInit, SteeredMovementBlock } from '../world/entity-table.ts';
import { addPlayerEntity, entityInit, stillEntityInit, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { snapshotText, takeSnapshot, type GameSnapshot } from './snapshot.ts';

// The capacity accounting of docs/plan/p3/06/spec.md (容量核算; D-08) tested on actual ticks and snapshots at the
// entity limit, with synthetic states: CORE_LIMITS stays as it is.

const { commandsPerTick: K, entities: ENTITIES, spawnExpansion, eventsPerTick, canonicalTextLength } = CORE_LIMITS;
/** The derived bounds of one tick at the limits: P3-02's terms with P3-06's. */
const EVENT_BOUND = K + K + 1 + spawnExpansion + ENTITIES;
const REQUEST_BOUND = ENTITIES + spawnExpansion + K + 2;

/** Runs one tick through the real pipeline and returns its events and every request posted in it. */
function countedTick(state: WorldState, input: TickInput): { readonly events: readonly DomainEvent[]; readonly requests: readonly Request[] } {
  const context = registerTick(state, readTickInput(input));
  const requests: Request[] = [];
  const post = context.requests.post.bind(context.requests);
  context.requests.post = (request) => {
    requests.push(request);
    post(request);
  };
  return { events: runTick(context), requests };
}

const countOf = <Item extends { readonly type: string }>(items: readonly Item[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const { type } of items) counts[type] = (counts[type] ?? 0) + 1;
  return counts;
};

/** P3-06's own terms of a tick: the events other than command results and instantiations, and the player's requests. */
const flightEvents = (events: readonly DomainEvent[]) => events.filter(({ type }) => type !== 'command-result' && type !== 'object-instantiated');
const playerRequests = (requests: readonly Request[]) => requests.filter(({ type }) => type === 'control' || type === 'match-speed');

/**
 * A world at the entity limit at tick 100: an available player (group 0, the assist on and due) whose target is a craft
 * of assist kind 7 beside it, and every other entity a parked craft beyond the inset world rectangle (x = 45000, the
 * world being ±45000) that is due for its parked update and arrives: AI mode 2 on itself at a 1-unit offset.
 */
function fullState(): WorldState {
  const state = testState();
  Object.assign(state, { tick: 100, clock: 200 });
  addPlayerEntity(state).state = 'active';
  const target = state.entities.allocate(stillEntityInit(7, { position: { x: 100, y: 2, z: 3 } }));
  target.state = 'active';
  state.player.target = target.id;
  while (state.entities.size < ENTITIES) {
    const parked = state.entities.allocate(entityInit(14, { activity: 'parked', position: { x: 45_000, y: 0, z: 0 } }));
    parked.state = 'active';
    Object.assign(parked.ai, { mode: 2, target: parked.id, targetOffset: { x: 1, y: 0, z: 0 } });
  }
  return state;
}

const commands = (command: Command): Command[] => Array.from({ length: K }, () => command);

describe('per-tick budget (P3-06 AC-08, 容量核算)', () => {
  it('derives bounds of 3,201 events and 3,138 requests, both within eventsPerTick', () => {
    expect([EVENT_BOUND, REQUEST_BOUND]).toEqual([3201, 3138]);
    expect(Math.max(EVENT_BOUND, REQUEST_BOUND)).toBeLessThanOrEqual(eventsPerTick);
  });

  it('keeps ticks at the entity limit, with the flight terms at their most, within the accounting', () => {
    const state = fullState();
    const exits = ENTITIES - 2;

    // Every command a manual match (a result, a request and an event each), the assist's match, the axes in a request
    // of their own after the last match request, and every parked craft leaving the world.
    const first = countedTick(state, { axes: { pitch: 0, yaw: 1, roll: 0 }, commands: commands({ type: 'speed', operation: 'match-target' }) });
    expect(countOf(first.events)).toEqual({ 'command-result': K, 'speed-matched': K + 1, 'object-left-world': exits });
    expect(countOf(first.requests)).toEqual({ 'match-speed': K, control: 1 });
    expect(new Set(first.events.flatMap((event) => (event.type === 'object-left-world' ? [event.entityId] : []))).size).toBe(exits);

    // The target lost (an ID no entity has had): the assist's release and its restoring request, every command a
    // throttle request carrying the axes last, and every craft that left asking for its removal.
    state.player.target = state.entities.nextId;
    const second = countedTick(state, { axes: { pitch: 0, yaw: 0, roll: 0 }, commands: commands({ type: 'speed', operation: 'increase' }) });
    expect(countOf(second.events)).toEqual({ 'command-result': K, 'speed-assist-released': 1 });
    expect(countOf(second.requests)).toEqual({ control: K + 1, leave: exits });
    expect(state.entities.size).toBe(2);

    for (const { events, requests } of [first, second]) {
      const left = events.filter(({ type }) => type === 'object-left-world').length;
      expect(flightEvents(events).length).toBeLessThanOrEqual(K + 1 + left);
      expect(playerRequests(requests).length).toBeLessThanOrEqual(K + 2);
      expect(events.length).toBeLessThanOrEqual(EVENT_BOUND);
      expect(requests.length).toBeLessThanOrEqual(REQUEST_BOUND);
    }
  });
});

/**
 * The longest JSON numbers each field can hold: a double and an f32 of 25 characters (17 significant digits after
 * `-0.00000`; the exponent form is shorter), a safe integer and an i32.
 */
const LONG_DOUBLE = -0.0000012345678901234567;
const LONG_F32 = Math.fround(-0.0000011822337455669185);
const LONG_ID = Number.MAX_SAFE_INTEGER;
const LONG_I32 = -(2 ** 31);
const longVector = (value: number) => ({ x: value, y: value, z: value });
/** The longest model Asset ID: 128 characters. */
const LONG_MODEL = readAssetId(`model/${'a'.repeat(32)}/${'b'.repeat(32)}/${'c'.repeat(32)}/${'d'.repeat(23)}`);

/** An entity whose every field writes its longest canonical text, every optional part of its flight state present. */
function longestEntity(state: WorldState): Entity {
  const init: EntityInit = {
    ...entityInit(19),
    source: { collection: 'mission', index: LONG_ID, group: { index: LONG_ID, request: LONG_ID, member: LONG_ID } },
    name: { type: 'candidate', declaration: { collection: 'mission', index: LONG_ID }, candidate: LONG_ID },
    presentation: { type: 'model', model: LONG_MODEL },
    position: longVector(LONG_DOUBLE),
    orientation: Array.from({ length: 9 }, () => LONG_DOUBLE) as unknown as EntityInit['orientation'],
    ruleInputs: { percentB: LONG_I32, percentC: LONG_I32, percentD: LONG_I32, aiValueA: LONG_I32, aiValueB: LONG_I32, aiValueC: LONG_I32 },
    maximumSpeed: LONG_F32,
    lastParkedUpdateClock: LONG_ID,
    warpClock: LONG_ID,
    ai: { mode: 5, target: LONG_ID, goal: longVector(LONG_F32), targetOffset: longVector(LONG_F32), objectTarget: LONG_ID },
    formation: { leader: LONG_ID, offset: longVector(LONG_F32) },
  };
  const entity = state.entities.allocate(init);
  const block = entity.movement as SteeredMovementBlock;
  const timed = () => ({ rate: LONG_F32, decay: LONG_F32, end: LONG_F32 });
  Object.assign(block, { speed: LONG_F32, commandedSpeed: LONG_F32, speedRatio: LONG_F32, atCommandedSpeed: false, locked: false });
  for (const axis of ['pitch', 'yaw', 'roll'] as const) {
    Object.assign(block.steering[axis], { rate: LONG_F32, enabled: false });
    block.timedRotation[axis] = timed();
  }
  block.impulse = { direction: longVector(LONG_F32), magnitude: LONG_F32 };
  block.disturbance = { level: 2, biases: [-LONG_ID, -LONG_ID, -LONG_ID] };
  Object.assign(entity, { state: 'awaiting-presentation', activity: 'docked', placementSerial: LONG_ID });
  return entity;
}

/**
 * A mutable copy of `snapshot` whose entity IDs (the next one, the entities', the walk order's and the player's) are
 * 16-digit numbers; the longest entity's references already are.
 */
function withLongIds(snapshot: GameSnapshot): GameSnapshot {
  type Ids = { state: { nextEntityId: number; entities: { id: number }[]; kindOrder: number[]; player: { entityId: number } } };
  const copy = structuredClone(snapshot) as unknown as Ids;
  const longId = (id: number) => LONG_ID - ENTITIES - 1 + id;
  copy.state.nextEntityId = longId(copy.state.nextEntityId);
  copy.state.player.entityId = longId(copy.state.player.entityId);
  for (const entity of copy.state.entities) entity.id = longId(entity.id);
  copy.state.kindOrder = copy.state.kindOrder.map(longId);
  return copy as unknown as GameSnapshot;
}

describe('snapshot text budget (P3-06 AC-08, 容量核算)', () => {
  it('keeps the canonical text at the entity limit within canonicalTextLength, at most 4 KiB an entity before its combat state, of which the flight state takes at most 1.5 KiB', () => {
    expect([LONG_DOUBLE, LONG_F32, LONG_ID, LONG_I32].map((value) => JSON.stringify(value).length)).toEqual([25, 25, 16, 11]);
    const state = testState();
    addPlayerEntity(state);
    Object.assign(state.player, { target: LONG_ID });
    Object.assign(state.player.control!.lastAxes, { pitch: -128, yaw: -128, roll: -128 });
    Object.assign(state.player.control!.speedAssist, { enabled: false, dueClock: LONG_ID, engaged: false });
    const empty = snapshotText(withLongIds(takeSnapshot(state))).length;
    longestEntity(state);
    const one = snapshotText(withLongIds(takeSnapshot(state)));
    // The entity's object in the entity list, its ID in the walk order and the two separating commas.
    const perEntity = one.length - empty;
    const entityText = one.slice(one.lastIndexOf('{"id":'), one.indexOf('],"kindOrder"'));
    // P3-07's combat state closes the entity and rests on its own basis (docs/plan/p3/02/spec.md, CR-14: about 8.5 KiB
    // a craft with 18 mounts), which P3-07 accounts for; P3-06's terms are the fields before it.
    const combatStart = entityText.indexOf(',"combat":');
    const flightText = entityText.slice(entityText.indexOf('"maximumSpeed"'), combatStart);
    expect(flightText.startsWith('"maximumSpeed"') && flightText.endsWith('}}')).toBe(true);
    expect(flightText.length).toBeLessThanOrEqual(1536);
    expect(perEntity - (entityText.length - 1 - combatStart)).toBeLessThanOrEqual(4096);

    while (state.entities.size < ENTITIES) longestEntity(state);
    const full = snapshotText(withLongIds(takeSnapshot(state)));
    expect(full.length).toBe(empty + (ENTITIES - 1) * perEntity);
    expect(full.length).toBeLessThanOrEqual(canonicalTextLength);
    // Half the text limit is the 4 KiB an entity it rests on.
    expect(ENTITIES * 4096).toBeLessThanOrEqual(canonicalTextLength / 2);
  });
});
