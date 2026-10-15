import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import type { DomainEvent } from '../contracts/domain-events.ts';
import { CORE_LIMITS } from '../contracts/limits.ts';
import { readTickInput, type Command, type TickInput } from '../contracts/tick-input.ts';
import { registerTick, RequestQueue, runTick, type Request } from '../systems/pipeline.ts';
import { AI_PROGRAMS_LIMITS } from '../../content/rule-data/ai-programs.ts';
import {
  clearedControllerCommon, RETURN_STACK_DEPTH, type Entity, type EntityInit, type Matrix3, type SteeredMovementBlock, type TableController,
} from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, entityInit, expectFault, stillEntityInit, testState, thrownBy, tickInput } from '../world/world.test-support.ts';
import type { ParsedArgument, ParsedScript, RadioItem, WorldState } from '../world/world-state.ts';
import { recordState } from './recording.ts';
import { PRODUCER } from './replay.test-support.ts';
import { snapshotText, takeSnapshot, type GameSnapshot } from './snapshot.ts';

// The capacity accounting of docs/plan/p3/06/spec.md (容量核算; D-08) tested on actual ticks and snapshots at the
// entity limit, with synthetic states: CORE_LIMITS stays as it is.

const { commandsPerTick: K, entities: ENTITIES, spawnExpansion, eventsPerTick, canonicalTextLength, radioQueueItems } = CORE_LIMITS;
/** The derived bounds of one tick at the limits: P3-02's terms with P3-06's. */
const EVENT_BOUND = K + K + 1 + spawnExpansion + ENTITIES;
const REQUEST_BOUND = ENTITIES + spawnExpansion + K + 2;

/** Runs one tick through the real pipeline and returns its events and every request posted or deferred in it. */
function countedTick(state: WorldState, input: TickInput): { readonly events: readonly DomainEvent[]; readonly requests: readonly Request[] } {
  const context = registerTick(state, readTickInput(input));
  const requests: Request[] = [];
  const post = context.requests.post.bind(context.requests);
  const defer = context.requests.defer.bind(context.requests);
  context.requests.post = (request) => {
    requests.push(request);
    post(request);
  };
  context.requests.defer = (request) => {
    requests.push(request);
    defer(request);
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

const FLIGHT = 0x0c;
const MAP = 8;
const commandsOf = (count: number, command: (index: number) => Command): Command[] => Array.from({ length: count }, (_, index) => command(index));
const select = (index: number): Command => ({ type: 'map-point', operation: 'select', right: index / K, down: 0.5 });

/**
 * An available player in `viewMode` whose record's Warp costs nothing, has no interval and lasts L = F(0.5 × 1) ≤ 1, so
 * that a Warp completes in the tick it starts (MW-08), the automatic selection not due.
 */
function mapState(viewMode: number): WorldState {
  const base = testState();
  const { content } = base.craftInfo;
  const craft = content.craft.map((record, kindBit) => (kindBit === 0 ? { ...record, pairs: [{ at00: 1000, at04: 0 }], atA4: 0, atA8: 1, atB8: 64 } : record));
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: { ...content, craft } } };
  addPlayerEntity(state).state = 'active';
  state.player.control = initialPlayerControl(1);
  state.player.targeting!.autoTargetDueClock = 1e9;
  state.player.viewMode = viewMode;
  state.player.previousViewMode = FLIGHT;
  return state;
}

describe('per-tick budget of the map and the Warp (P3-09 AC-11; docs/plan/p3/02/spec.md, MW-14)', () => {
  // MW-14's terms: map-toggled and warp-destination-set at most K together, warp-started, warp-completed and two page
  // changes; requests K + 1, a bound: each command posts at most one request, the deferred warp-start included.
  it(`fans out at most ${K} map events, 4 Warp events and ${K} requests at ${K} commands, within MW-14's terms`, () => {
    // Every command but the last a select (the first creates the marker, the others move it), then a Warp request that
    // starts and completes in the tick, each with its page change.
    const warp = countedTick(mapState(MAP), { axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [...commandsOf(K - 1, select), { type: 'request-warp' }] });
    expect(countOf(warp.events)).toEqual({ 'command-result': K, 'warp-destination-set': K - 1, 'warp-started': 1, 'left-page-changed': 2, 'warp-completed': 1 });
    expect(countOf(warp.requests)).toEqual({ 'map-point': K - 1, 'warp-start': 1 });
    // Every command a toggle, opening and closing in turn.
    const toggles = countedTick(mapState(FLIGHT), { axes: { pitch: 0, yaw: 0, roll: 0 }, commands: commandsOf(K, () => ({ type: 'toggle-map' })) });
    expect(countOf(toggles.events)).toEqual({ 'command-result': K, 'map-toggled': K });
    expect(countOf(toggles.requests)).toEqual({ 'map-toggle': K });
  });

  it(`refuses ${K + 1} map commands in a tick as input, before anything runs`, () => {
    const state = mapState(MAP);
    const before = snapshotText(takeSnapshot(state));
    const error = thrownBy(() => constructWorld(state).step(tickInput(commandsOf(K + 1, select))));
    expect(error).toMatchObject({ path: 'tickInput.commands' });
    expect(snapshotText(takeSnapshot(state))).toBe(before);
  });

  it('counts a deferred warp-start against requestsPerTick like a posted request', () => {
    const queue = new RequestQueue();
    for (let count = 0; count < CORE_LIMITS.requestsPerTick - 1; count++) queue.post({ type: 'map-toggle', commandIndex: 0 });
    queue.defer({ type: 'warp-start', commandIndex: 0 });
    expectFault(() => queue.defer({ type: 'warp-start', commandIndex: 1 }), 'budget-exhausted', 'pipeline.requests');
  });
});

/**
 * A world in the map with `count` entities: the player and still friendly craft of kind 1 on a grid of distinct map
 * pixels (64 columns 1300 apart, rows 2700 apart), every one inside some friendly's coverage, so every one is revealed.
 */
function crowdedMap(count: number): WorldState {
  const state = mapState(MAP);
  for (let index = 1; index < count; index++) {
    const position = { x: -44_000 + (index % 64) * 1300, y: -44_000 + Math.floor(index / 64) * 2700, z: 0 };
    state.entities.allocate(stillEntityInit(1, { position })).state = 'active';
  }
  return state;
}

function expectLatched(world: World, fault: unknown): void {
  for (const call of [() => world.step(tickInput()), () => world.snapshot(), () => world.projection(), () => world.renderState()]) expect(thrownBy(call)).toBe(fault);
}

describe('the map lists and the marker at the entity limit (P3-09 AC-11; MW-02, MW-03, MW-14)', { timeout: 30_000 }, () => {
  it(`lists ${ENTITIES} icons and object-set members at the limit, and creates the marker as the ${ENTITIES}th entity`, () => {
    const state = crowdedMap(ENTITIES - 1);
    const world = constructWorld(state);
    world.step(tickInput());
    expect(state.mapIcons).toHaveLength(ENTITIES - 1);
    world.step(tickInput([select(1)]));
    expect(state.entities.size).toBe(ENTITIES);
    expect([...state.entities.walk(1 << 25)]).toHaveLength(1);
    // The marker is no craft: the lists stay at the craft.
    expect([state.mapIcons.length, state.objectSets.friendly.length, state.objectSets.hostile.length]).toEqual([ENTITIES - 1, ENTITIES - 1, 0]);
    expect(snapshotText(world.snapshot()).length).toBeLessThanOrEqual(canonicalTextLength);

    const full = crowdedMap(ENTITIES);
    constructWorld(full).step(tickInput());
    expect([full.mapIcons.length, full.objectSets.friendly.length]).toEqual([ENTITIES, ENTITIES]);
    expect(new Set(full.mapIcons.map(({ entityId }) => entityId)).size).toBe(ENTITIES);
    expect([...full.entities.byId()].every(({ mapVisible }) => mapVisible)).toBe(true);
  });

  it('faults at a marker beyond the limit, latching the recording and its world', () => {
    const session = recordState(crowdedMap(ENTITIES), { producer: PRODUCER, checkpointInterval: 1 });
    session.step(tickInput());
    const fault = expectFault(() => session.step(tickInput([select(1)])), 'budget-exhausted', 'entities.count');
    expectLatched(session, fault);
    expect(thrownBy(() => session.exportRecording())).toBe(fault);
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
    ai: {
      mode: 5, target: LONG_ID, goal: longVector(LONG_F32), targetOffset: longVector(LONG_F32), objectTarget: LONG_ID, pendingCommand: null,
      program: { type: 'none' },
    },
    formation: { leader: LONG_ID, offset: longVector(LONG_F32) },
  };
  const entity = state.entities.allocate(init);
  // P3-10's (CB-04): a u32 command code, an i32 portrait (a wingman's is its rule input − 1) and a clock.
  entity.ai.pendingCommand = { code: 0xffffffff, issuedTick: LONG_ID };
  Object.assign(entity.communications, { face: LONG_I32, threatStamp: LONG_ID });
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

/** P3-08's longest controller (CR-16, CR-17): an interpreter with every number at its longest and a full return stack. */
function longestController(): TableController {
  const common = clearedControllerCommon();
  const axis = { clear: false, set: false, value: LONG_F32 };
  const trigger = { pressed: false, holdDeadline: LONG_ID };
  return {
    nextUpdateClock: LONG_ID,
    period: 2 ** 31 - 1,
    limits: { turn: LONG_F32, speed: LONG_F32, saturation: LONG_F32, rollMatchThreshold: LONG_F32 },
    triggers: [trigger, trigger, trigger],
    aiLock: false,
    missileReady: false,
    automaticMounts: false,
    engagement: { dueClock: LONG_ID, period: 2 ** 31 - 1, mask: 0xffffffff },
    attackPass: { phase: 0, deadline: LONG_ID, savedSizeClass: 255, savedLeadMode: 255 },
    steering: {
      ...common.steering,
      targetValid: false, target: LONG_ID, targetSample: LONG_ID, relativeSample: LONG_ID, point: longVector(LONG_F32), distance: LONG_F32,
      targetSpeed: LONG_F32, offset: { enabled: false, frame: 0, vector: longVector(LONG_F32) }, sizeClass: 255, approachRadius: LONG_F32,
      speedLimit: LONG_F32, halfSpeedLimit: LONG_F32, turnRates: [LONG_F32, LONG_F32, LONG_F32], leadMode: 255, leadConstant: LONG_F32,
      relativeFlags: 7, relative: longVector(LONG_F32), reverseFlags: 7, reverse: longVector(LONG_F32), angles: [LONG_F32, LONG_F32],
      control: { scale: LONG_F32, axes: [axis, axis, axis], speedFactor: LONG_F32 }, coneBits: 3, speedFraction: LONG_F32, turnFraction: LONG_F32,
      rollMatch: false, throttleNoise: { enabled: false, low: LONG_F32, high: LONG_F32 }, steeringNoise: { enabled: false, low: LONG_F32, high: LONG_F32 },
    },
    handler: 'interpreter',
    interpreter: {
      state: 6,
      execution: {
        script: LONG_ID, item: LONG_ID, variables: [LONG_I32, LONG_I32, LONG_I32, LONG_I32], timers: [LONG_ID, LONG_ID, LONG_ID, LONG_ID],
        returnStack: Array.from({ length: RETURN_STACK_DEPTH }, () => LONG_ID), wait: { active: false, until: LONG_ID }, hold: { active: false, until: LONG_ID },
      },
      lastRunEnded: false,
      steadyClock: LONG_ID,
      stateDeadline: LONG_ID,
      state4Deadline: LONG_ID,
    },
  };
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
    // P3-07's combat state rests on its own basis (docs/plan/p3/02/spec.md, CR-14: about 8.5 KiB a craft with 18
    // mounts), which P3-07 accounts for; P3-06's terms are the fields before it. P3-10's communications fields close the
    // entity but for P3-08's transponder state, null for this kind: CB-16 counts about 60 characters, 69 at their longest.
    const combatStart = entityText.indexOf(',"combat":');
    const combatEnd = entityText.lastIndexOf(',"communications":');
    const transponderStart = entityText.lastIndexOf(',"transponder":');
    expect(transponderStart - combatEnd).toBeLessThanOrEqual(72);
    expect(entityText.slice(transponderStart)).toBe(',"transponder":null}');
    const flightText = entityText.slice(entityText.indexOf('"maximumSpeed"'), combatStart);
    expect(flightText.startsWith('"maximumSpeed"') && flightText.endsWith('}}')).toBe(true);
    // P3-10's pending command in the AI state is P3-10's term (CB-16), P3-08's program slot P3-08's (CR-25), not P3-06's.
    const pendingCommand = `,"pendingCommand":{"code":4294967295,"issuedTick":${LONG_ID}}`;
    const noProgram = ',"program":{"type":"none"}';
    expect(flightText).toContain(pendingCommand + noProgram);
    expect(flightText.length - pendingCommand.length - noProgram.length).toBeLessThanOrEqual(1536);
    expect(perEntity - (combatEnd - combatStart)).toBeLessThanOrEqual(4096);

    while (state.entities.size < ENTITIES) longestEntity(state);
    const full = snapshotText(withLongIds(takeSnapshot(state)));
    expect(full.length).toBe(empty + (ENTITIES - 1) * perEntity);
    expect(full.length).toBeLessThanOrEqual(canonicalTextLength);
    // Half the text limit is the 4 KiB an entity it rests on.
    expect(ENTITIES * 4096).toBeLessThanOrEqual(canonicalTextLength / 2);

    // P3-09's state at its bounds (docs/plan/p3/02/spec.md, MW-14): an icon for every entity, every entity in the
    // object sets, and the longest destination and Warp transit.
    const icon = { entityId: LONG_ID, kindBit: 19, position: longVector(LONG_F32), pixel: { column: -32768, row: -32768 }, inWorld: false };
    state.mapIcons = Array.from({ length: ENTITIES }, () => icon);
    state.objectSets = { friendly: Array.from({ length: ENTITIES / 2 }, () => LONG_ID), hostile: Array.from({ length: ENTITIES / 2 }, () => LONG_ID) };
    const rows = Array.from({ length: 9 }, () => LONG_F32) as unknown as Matrix3;
    Object.assign(state.player, {
      map: { cursor: { column: 399, row: 399 }, destination: longVector(LONG_F32) },
      savedLeftPage: 5,
      warp: {
        serial: LONG_ID, origin: longVector(LONG_F32), length: LONG_F32, segments: LONG_F32, fraction: LONG_F32, error: LONG_F32, angle: LONG_F32,
        centring: LONG_F32, frame: { position: longVector(LONG_F32), orientation: rows }, path: Array.from({ length: 15 }, () => longVector(LONG_F32)),
      },
    });
    const mapped = snapshotText(withLongIds(takeSnapshot(state)));
    // The canonical text writes an icon's members in this order, as JSON does.
    const iconText = JSON.stringify(icon);
    expect(mapped).toContain(`"mapIcons":[${iconText},${iconText},`);
    // The transit is the player state's last P3-09 field; P3-10's docking object follows it.
    const warpText = mapped.slice(mapped.indexOf('"warp":{'), mapped.indexOf(',"dockingObject"'));
    // At the longest numbers 200 characters an icon (MW-14's 170 is a typical one), 17 an object-set member with its
    // comma, and about 2 KiB the transit: about 0.43 MiB in all.
    expect(iconText.length).toBe(200);
    expect(warpText.length).toBeLessThanOrEqual(2176);
    expect(mapped.length - full.length).toBeLessThanOrEqual(ENTITIES * (iconText.length + 1 + 17) + 2176 + 256);
    expect(mapped.length).toBeLessThanOrEqual(canonicalTextLength);

    // A full radio queue (CB-16: about 0.8 MiB), here with every number at its longest, on top of P3-09's state at its
    // bounds, still within the text limit.
    const item: RadioItem = {
      message: { table: 20985, face: LONG_ID, index: LONG_ID }, due: LONG_ID, callback: 'docking-reply',
      speaker: { entityId: LONG_ID, kindBit: 31, name: { type: 'candidate', declaration: { collection: 'wingman', index: LONG_ID }, candidate: LONG_ID } },
    };
    state.communications.queue.push(...Array.from({ length: radioQueueItems }, () => item));
    const queued = snapshotText(withLongIds(takeSnapshot(state)));
    expect(queued.length - mapped.length).toBeLessThanOrEqual(radioQueueItems * 320);
    expect(queued.length).toBeLessThanOrEqual(canonicalTextLength);

    // P3-08's state at its bounds (docs/plan/p3/02/spec.md, CR-25), on top of all the above: as many craft as
    // instantiation can make (spawnExpansion; the player and constructed transponders have no program) with the longest
    // controller, an interpreter with a full return stack (CR-25 counts about 2 KiB a controller, 2.9 KiB at the longest numbers), and
    // a parse cache of AI_PROGRAMS_LIMITS.entries scripts (every entry) of AI_PROGRAMS_LIMITS.scriptItems items, each the longest
    // argument (CR-25 counts at most about 0.5 MiB for real content; 2 MiB at these bounds).
    const controller = longestController();
    for (const entity of [...state.entities.walk(1 << 19)].slice(0, spawnExpansion)) entity.ai.program = { type: 'table', record: LONG_ID, controller };
    const controlled = snapshotText(withLongIds(takeSnapshot(state)));
    const controllerText = (controlled.length - queued.length) / spawnExpansion;
    expect(Number.isInteger(controllerText)).toBe(true);
    expect(controllerText).toBeLessThanOrEqual(3072);
    const absent = { present: false, value: LONG_F32 };
    const argument: ParsedArgument = { type: 'optional-floats', values: [absent, absent, absent, absent] };
    state.ai.parseCache.push(...Array.from({ length: AI_PROGRAMS_LIMITS.entries }, (_, script): ParsedScript => ({
      script, uses: LONG_ID, items: Array.from({ length: AI_PROGRAMS_LIMITS.scriptItems }, () => argument),
    })));
    const cached = snapshotText(withLongIds(takeSnapshot(state)));
    expect(cached.length - controlled.length).toBeLessThanOrEqual(AI_PROGRAMS_LIMITS.entries * (AI_PROGRAMS_LIMITS.scriptItems * 256 + 64));
    expect(cached.length).toBeLessThanOrEqual(canonicalTextLength);
  });
});
