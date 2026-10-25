import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { compareReplayResults } from '../replay/compare.ts';
import { longInput } from '../replay/replay.test-support.ts';
import { snapshotText, takeSnapshot } from '../replay/snapshot.ts';
import { buildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { initialMaximumSpeed, THROTTLE_TABLE } from '../rules/flight-state.ts';
import { RUNTIME_SCALE } from '../rules/coordinates.ts';
import { RAND_SCALE, RandStream } from '../rules/original-random.ts';
import { INITIAL_DIAGONAL } from '../rules/placement.ts';
import { initialWorldState } from '../world/create-world.ts';
import type { Entity } from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE } from '../world/player-state.ts';
import { constructWorld, type World } from '../world/world.ts';
import { addPlayerEntity, expectFault, stillEntityInit, TEST_RULE_INPUTS, testState, tickInput } from '../world/world.test-support.ts';
import type { MissionResult, PlayerLoss, WorldState } from '../world/world-state.ts';
import { applyContactDamage } from './damage.ts';
import { PIPELINE, registerTick, type TickContext } from './pipeline.ts';
import { resolvePlayerLoss } from './rescue.ts';

// docs/plan/p3/02/spec.md, ME-03, ME-05, ME-06, ME-07, ME-10, ME-13 and ME-17 decisions 7 and 8; docs/plan/p3/11/spec.md,
// 救援 and 失败 (S-05, S-06, AC-06, AC-07); docs/original/formats/executable.md, rescue 0x32e14 and 0x67b98 (P3-11/02).
// Expectations are worked out from those records, not from the implementation: the draws are one for the resources
// (0x80 + rand % 64 after the sample) and then one for the base (rand % count) or two for the world default; the point
// is the base's with z := F(z + 2000), facing away from the centre along its quadrant's diagonal; the throttle is
// chop(F(speed ÷ +0xB8) × 128). A tick is 2 clock units; the mission flow reads the previous tick's clock c′. From a
// destruction in tick N, the delayed explosion comes at N + 97, the pod's first callback at N + 98 and its expiry
// 0x140 later, at N + 258 (destruction.test.ts); the beacon set at sample s ends when c′ ≥ s + 0x3C0, 481 ticks on.

const DESTRUCTION_VIEW = 0x11;
const MAP_VIEW = 8;
const WARP_VIEW = 1;
const WARP_PAGE = 6;
const ENERGY_PAGE = 1;
const POD_KIND = 1 << 24;
const POD_EXPIRY_AFTER_DESTRUCTION = 258;
const BEACON_TICKS = 481;
const PLAYER_SOURCE = Object.freeze({ collection: 'mission', index: 0, group: null } as const);
/** Record percentages other than full, so that a later full repair could not hide the resources `0x3060c` writes. */
const RULE_INPUTS = Object.freeze({ ...TEST_RULE_INPUTS, percentC: 40, percentD: 50 });
const D = INITIAL_DIAGONAL;
/** The quadrant pose of a point with x ≥ 0 and y ≥ 0: rows (−d, d, 0), (0, 0, 1), (d, d, 0). */
const FIRST_QUADRANT = [-D, D, 0, 0, 0, 1, D, D, 0];

/**
 * The whole-world default `0x68c98` from the next two draws of `rand`: over W = 15000 × sectors, f32(W × r × C − W ÷ 2)
 * for x, then y, with C = 32769 ÷ 2^30, and z = 0; checked to lie inside the world check's band (±7500 × sectors − 200),
 * so the point stays as drawn; then the quadrant pose.
 */
function worldDefault(state: WorldState, rand: RandStream): { readonly point: Vec3; readonly orientation: number[] } {
  const { sectors } = state.spawn.frame;
  const extent = RUNTIME_SCALE * sectors;
  const coordinate = (r: number): number => Math.fround(extent * r * RAND_SCALE - extent / 2);
  const point = { x: coordinate(rand.next()), y: coordinate(rand.next()), z: 0 };
  const limit = (RUNTIME_SCALE / 2) * sectors - 200;
  expect(Math.abs(point.x) <= limit && Math.abs(point.y) <= limit).toBe(true);
  const forwardX = point.x >= 0 ? D : -D;
  const forwardY = point.y >= 0 ? D : -D;
  return { point, orientation: [-forwardY, forwardX, 0, 0, 0, 1, forwardX, forwardY, 0] };
}

interface Scene {
  readonly state: WorldState;
  readonly player: CraftEntity;
  readonly craft: CraftRecord;
}

/** A drained world with the player of declaration 0 at the origin, active, whose automatic target selection waits. */
function scene(): Scene {
  const state = testState();
  const player = addPlayerEntity(state, { source: PLAYER_SOURCE, position: { x: 0, y: 0, z: 0 }, ruleInputs: RULE_INPUTS }) as CraftEntity;
  player.state = 'active';
  state.player.targeting!.autoTargetDueClock = 1e9;
  const craft = state.craftInfo.content.craft[0];
  if (craft === undefined) throw new Error('no player record');
  return { state, player, craft };
}

const addAt = (state: WorldState, kindBit: number, x: number, y: number, z: number): Entity =>
  state.entities.allocate(stillEntityInit(kindBit, { position: { x, y, z } }));

/** A registered tick's context with the mission flow's clock c′ (the clock stage has not run). */
const flowContext = (state: WorldState): TickContext => registerTick(state, readTickInput(tickInput()));

/** A registered tick's context in request handling, the clock stored. */
function requestContext(state: WorldState): TickContext {
  const context = flowContext(state);
  state.clock = context.time.clock;
  return context;
}

/** One formal tick in which `player` takes a deadly collision. */
function destroyInTick(state: WorldState, player: Entity): readonly DomainEvent[] {
  Object.assign((player as CraftEntity).combat, { shield: 0, hull: 1 });
  const context = registerTick(state, readTickInput(tickInput()));
  for (const stage of PIPELINE) {
    if (stage.id === 'collision') applyContactDamage(context, player, 5, 'collision');
    stage.run?.(context);
  }
  return context.events;
}

/** Steps `world` until a tick has an event `found` accepts, at most `limit` ticks, logging every event. */
function stepUntil(world: World, log: DomainEvent[], found: (event: DomainEvent) => boolean, limit = 600): readonly DomainEvent[] {
  for (let step = 0; step < limit; step++) {
    const events = world.step(tickInput());
    log.push(...events);
    if (events.some(found)) return events;
  }
  throw new Error('not reached');
}

const isPodExpiry = (event: DomainEvent): boolean => event.type === 'fragment-expired' && event.outcome === 'escape-pod';
const ofType = <Type extends DomainEvent['type']>(events: readonly DomainEvent[], type: Type) =>
  events.filter((event): event is Extract<DomainEvent, { type: Type }> => event.type === type);
const after = (events: readonly DomainEvent[], found: (event: DomainEvent) => boolean): readonly DomainEvent[] => events.slice(events.findIndex(found) + 1);

function expectContractOrder(events: readonly DomainEvent[], finalTick: number): void {
  const result = { events, checkpoints: [{ tick: 0, hash: '0'.repeat(16) }, { tick: finalTick, hash: '1'.repeat(16) }], finalTick };
  expect(compareReplayResults(result, result)).toEqual({ match: true });
}

/**
 * The rescue's events: the full repair's selection advances, which both callers' message loops handle (ME-18), then
 * `player-rescued` and its transition. The synthetic player record has lists [0, 1], [2] and []: the walk advances list 0
 * from entry 0 to 1 and back to 0, then list 1 from its only entry to itself (rules/full-repair.ts; BS9).
 */
function expectRescueEvents(events: readonly DomainEvent[], tick: number, loss: PlayerLoss, rescued: Partial<Extract<DomainEvent, { type: 'player-rescued' }>>): void {
  const entityId = rescued.playerEntityId;
  expect(events.slice(0, 3)).toEqual([
    { type: 'weapon-selected', tick, entityId, list: 0, index: 1, mount: 1, changed: true, commandIndex: null },
    { type: 'weapon-selected', tick, entityId, list: 0, index: 0, mount: 0, changed: true, commandIndex: null },
    { type: 'weapon-selected', tick, entityId, list: 1, index: 0, mount: 2, changed: false, commandIndex: null },
  ]);
  expect(events.slice(3)).toEqual([
    { type: 'player-rescued', tick, loss, ...rescued },
    { type: 'transition', tick, gap: loss === 'destroyed' ? 'G-02/5' : 'G-02/6' },
  ]);
}

describe('the rescue 0x32e14/0x67b98 at its entry (ME-10; AC-06)', () => {
  it('restores the player in the original\'s order, places it above the drawn base and keeps everything else', () => {
    const { state, player, craft } = scene();
    state.clock = 1000;
    // Kind 15 walks before kind 17, so the candidates are [base15, base17]; kind 16 is no base.
    const base17 = addAt(state, 17, 3000, 5000, Math.fround(0.1));
    const base15 = addAt(state, 15, 1000, 2000, -40);
    const hostile = addAt(state, 7, 100, 0, 0);
    addAt(state, 16, 50, 50, 50);
    Object.assign(state.flow, { subState: 2, beaconDeadline: 900, dockingDeadline: 77, wingmanLoss: { pending: true, dueClock: 5000 } });
    Object.assign(player.combat, { hull: 1, energy: 0, shield: 0, depleted: true, subsystems: player.combat.subsystems.map((_, field) => (field === 2 ? 1 : 0)) });
    player.combat.weapons.lock.level = 2;
    Object.assign(player.movement!, { speed: craft.atB8 / 4, locked: true });
    Object.assign(player, { inWarp: true, warpClock: 321 });
    Object.assign(state.player, { viewMode: MAP_VIEW, previousViewMode: COCKPIT_VIEW_MODE, subMode: 3, target: hostile.id, heavyDamage: 1 });
    state.player.kills = Object.freeze({ ...state.player.kills, 7: 2 });
    Object.assign(state.player.communications.limits, { friendlyHit: 10, friendlyKill: 20 });
    state.player.communications.thanks = 4;
    state.communications.queue.length = 0;
    const playerBefore = structuredClone(state.player);
    const others = [base17, base15, hostile].map((entity) => structuredClone(entity));
    const worldBefore = structuredClone({ ai: state.ai, communications: state.communications, missionEvents: state.missionEvents, spawn: state.spawn, setup: state.setup });
    const record = state.spawn.records[0];
    const recordBefore = structuredClone(record);
    const { placementSerial, id } = player;

    const rand = new RandStream(state.rngState);
    const resourceDraw = rand.next();
    const base = [base15, base17][rand.next() % 2];
    const context = flowContext(state);
    resolvePlayerLoss(context, 'energy');

    const point = { x: base.position.x, y: base.position.y, z: Math.fround(base.position.z + 2000) };
    expect(state.rngState).toBe(rand.state);
    // 0x67b98: the dead flag, the repair (hull, fields), the weapon block, then 0x3060c at the record's 50 % and 40 %.
    expect([player.id, player.destroyed, player.state, player.activity, player.inWarp, player.warpClock]).toEqual([id, false, 'active', 'active', true, 321]);
    expect(player.combat).toMatchObject({
      hull: craft.at9C,
      subsystems: player.combat.subsystems.map(() => 0),
      weapons: buildWeaponBlock(craft),
      energy: Math.trunc(craft.at54 / 100) * 50,
      shield: Math.trunc((craft.at5C * 40) / 100),
      charge: craft.at74,
      shieldLevel: 1,
      chargeLevel: 2,
      lastEnergyClock: 1000,
      nextEnergyClock: 1000 + 0x80 + (resourceDraw % 64),
      depleted: false,
    });
    expect(player.maximumSpeed).toBe(initialMaximumSpeed(0, craft));
    // The record rewritten in place; the placement from its stored point (no draw), the world check leaving it.
    expect(state.spawn.records[0]).toBe(record);
    expect(record).toEqual({ ...recordBefore, position: point, region: null, anchor: null });
    expect([player.position, [...player.orientation], player.placementSerial]).toEqual([point, FIRST_QUADRANT, placementSerial + 1]);
    // The block in mode 0: F(speed ÷ +0xB8) = 0.25 → throttle 32 → entry 80 (0.25), at the new maximum.
    expect(player.movement).toMatchObject({ mode: 'craft', speed: Math.fround(THROTTLE_TABLE[80] * player.maximumSpeed), locked: false, disturbance: null });
    expect(THROTTLE_TABLE[80]).toBe(0.25);
    // 0x32e14: views 0xC (the sub-mode kept), the limits cleared, the count; the rest of the player state kept.
    const { communications } = playerBefore;
    expect(state.player).toEqual({
      ...playerBefore, viewMode: COCKPIT_VIEW_MODE, previousViewMode: COCKPIT_VIEW_MODE,
      communications: { ...communications, limits: { friendlyHit: null, friendlyKill: null } },
    });
    expect(state.flow).toMatchObject({ mainState: 3, subState: 0, rescues: 1, beaconDeadline: 900, dockingDeadline: 77, wingmanLoss: { pending: true, dueClock: 5000 }, result: null });
    expect(state.missionStatus).toBe('built');
    expect([base17, base15, hostile]).toEqual(others);
    expect({ ai: state.ai, communications: state.communications, missionEvents: state.missionEvents, spawn: state.spawn, setup: state.setup }).toEqual({
      ...worldBefore, spawn: { ...worldBefore.spawn, records: worldBefore.spawn.records.map((each, index) => (index === 0 ? record : each)) },
    });
    // The map view gives no page change.
    expectRescueEvents(context.events, 1, 'energy', {
      playerEntityId: id, rescues: 1, baseEntityId: base.id, candidates: 2, position: point, orientation: player.orientation,
    });
    // The record reaches the snapshot; the frozen setup does not change.
    expect(takeSnapshot(state).state.spawn.records[0]).toEqual(record);
    expect(() => snapshotText(takeSnapshot(state))).not.toThrow();
    expect(Object.isFrozen(state.setup)).toBe(true);
  });

  it('without a base takes the whole-world default: two draws after the resources\' one, and no base in the event', () => {
    const { state, player } = scene();
    addAt(state, 16, 10, 10, 10);
    const rand = new RandStream(state.rngState);
    rand.next();
    const { point, orientation } = worldDefault(state, rand);
    const context = requestContext(state);
    resolvePlayerLoss(context, 'destroyed');
    expect(state.rngState).toBe(rand.state);
    expect([player.position, [...player.orientation]]).toEqual([point, orientation]);
    expect(state.spawn.records[0]).toMatchObject({ position: { x: 0, y: 0, z: 0 }, region: null, anchor: null });
    expect(ofType(context.events, 'player-rescued')).toEqual([expect.objectContaining({ baseEntityId: null, candidates: 0, position: point })]);
  });

  it('with one base draws once and places above it; a base exactly 2000 below the origin falls back to the world default', () => {
    const { state, player } = scene();
    const base = addAt(state, 18, 700, -300, 25);
    const rand = new RandStream(state.rngState);
    rand.next();
    rand.next();
    const context = requestContext(state);
    resolvePlayerLoss(context, 'destroyed');
    expect([state.rngState, player.position]).toEqual([rand.state, { x: 700, y: -300, z: 2025 }]);
    expect(ofType(context.events, 'player-rescued')).toEqual([expect.objectContaining({ baseEntityId: base.id, candidates: 1 })]);
    // x ≥ 0, y < 0: rows (d, d, 0), (0, 0, 1), (d, −d, 0).
    expect([...player.orientation]).toEqual([D, D, 0, 0, 0, 1, D, -D, 0]);

    const other = scene();
    addAt(other.state, 18, 0, 0, -2000);
    const draws = new RandStream(other.state.rngState);
    draws.next();
    draws.next();
    const fallback = worldDefault(other.state, draws);
    resolvePlayerLoss(requestContext(other.state), 'destroyed');
    expect([other.state.rngState, other.player.position]).toEqual([draws.state, fallback.point]);
  });

  it('keeps a docked player docked (DK4) and restores the saved page when leaving the Warp view (MW-09)', () => {
    const docked = scene();
    docked.player.activity = 'docked';
    resolvePlayerLoss(requestContext(docked.state), 'destroyed');
    expect([docked.player.activity, docked.state.flow.subState]).toEqual(['docked', 0]);

    const { state, player } = scene();
    Object.assign(state.player, { viewMode: WARP_VIEW, previousViewMode: COCKPIT_VIEW_MODE, savedLeftPage: ENERGY_PAGE });
    state.player.leftDisplay.page = WARP_PAGE;
    player.inWarp = true;
    const context = flowContext(state);
    resolvePlayerLoss(context, 'energy');
    // The page change comes before player-rescued, which its transition must follow at once (ME-13).
    expect(context.events.filter(({ type }) => type !== 'weapon-selected')).toEqual([
      { type: 'left-page-changed', tick: 1, page: ENERGY_PAGE, previousPage: WARP_PAGE, commandIndex: null },
      expect.objectContaining({ type: 'player-rescued', loss: 'energy' }),
      { type: 'transition', tick: 1, gap: 'G-02/6' },
    ]);
    expect([state.player.viewMode, player.inWarp]).toEqual([COCKPIT_VIEW_MODE, true]);
  });

  it('faults an energy rescue in a Warp whose speed takes the throttle beyond the table (ME-17 decision 7, gap G-2)', () => {
    const { state, player, craft } = scene();
    Object.assign(state.flow, { subState: 1, beaconDeadline: 0 });
    Object.assign(state.player, { viewMode: WARP_VIEW });
    // 2 × +0xB8 → throttle 256 → entry 192, past the 129 entries.
    Object.assign(player.movement!, { mode: 'warp', speed: 2 * craft.atB8 });
    const world = constructWorld(state);
    expectFault(() => world.step(tickInput()), 'invariant-violated', 'rescue.throttle');
  });

  it('faults without a player entity or without its runtime record', () => {
    const missing = scene();
    missing.state.player.entityId = null;
    expectFault(() => resolvePlayerLoss(requestContext(missing.state), 'destroyed'), 'invariant-violated', 'rescue.player');
    const state = testState();
    addPlayerEntity(state);
    expectFault(() => resolvePlayerLoss(requestContext(state), 'destroyed'), 'invariant-violated', 'rescue.record');
  });

  it('leaves the AI controllers and the communications of P3-08 and P3-10 as they were (joint regression)', () => {
    // The slice-shaped world: the player of declaration 0 (rectangle 0), the wingman's and the hostiles' controllers
    // installed after their first callbacks, and four kind-17 bases.
    const state = initialWorldState(longInput());
    const world = constructWorld(state);
    for (let tick = 1; tick <= 3; tick++) world.step(tickInput());
    const playerId = state.player.entityId;
    const others = [...state.entities.walk(0xffffffff)].filter(({ id }) => id !== playerId);
    expect(others.filter(({ ai: { program } }) => program.type !== 'none' && program.controller !== null).length).toBeGreaterThan(4);
    const record = state.spawn.records[0];
    expect(record.region).not.toBeNull();
    state.flow.subState = 2;
    state.player.target = null;
    const before = structuredClone({ others, ai: state.ai, communications: state.communications, queue: state.spawn.queue, events: state.missionEvents });
    const rand = new RandStream(state.rngState);
    rand.next();
    const bases = [...state.entities.walk(1 << 17)];
    const base = bases[rand.next() % bases.length];
    const context = requestContext(state);
    resolvePlayerLoss(context, 'destroyed');
    expect(ofType(context.events, 'player-rescued')).toEqual([expect.objectContaining({ baseEntityId: base.id, candidates: 4 })]);
    expect(record).toMatchObject({ position: { x: base.position.x, y: base.position.y, z: Math.fround(base.position.z + 2000) }, region: null, anchor: null });
    expect({ others, ai: state.ai, communications: state.communications, queue: state.spawn.queue, events: state.missionEvents }).toEqual(before);
    // The rescued player flies on with the rest of the world.
    expect(() => { for (let tick = 0; tick < 20; tick++) world.step(tickInput()); }).not.toThrow();
  });
});

describe('the loss handling 0x32e14 at its callers (ME-07, ME-10, ME-13; AC-06, AC-07)', () => {
  it('shares one count between destruction and energy: rescue, rescue, then the third loss latches the failure once', () => {
    const { state, player } = scene();
    const base = addAt(state, 17, 1000, 1000, 0);
    const world = constructWorld(state);
    const log: DomainEvent[] = [];

    // 1. Destroyed at tick 1; the pod expires at 1 + 258 and the request handling rescues there (G-02/5).
    log.push(...destroyInTick(state, player));
    const firstPod = stepUntil(world, log, isPodExpiry);
    expect(state.tick).toBe(1 + POD_EXPIRY_AFTER_DESTRUCTION);
    expectRescueEvents(after(firstPod, isPodExpiry), state.tick, 'destroyed', {
      playerEntityId: player.id, rescues: 1, baseEntityId: base.id, candidates: 1, position: { x: 1000, y: 1000, z: 2000 }, orientation: player.orientation,
    });
    // The pod ended the follow before the rescue and is removed in the next tick; the destruction view's sub-mode stays.
    expect([state.player.followedEntity, state.player.viewMode, state.player.previousViewMode, state.player.subMode]).toEqual([null, COCKPIT_VIEW_MODE, COCKPIT_VIEW_MODE, 8]);
    expect([player.destroyed, player.state, state.flow.subState, state.flow.rescues, state.entities.get(player.id)]).toEqual([false, 'active', 0, 1, player]);
    log.push(...world.step(tickInput()));
    expect([...state.entities.walk(POD_KIND)].filter(({ combat }) => combat.type === 'fragment' && combat.part === 0)).toEqual([]);

    // 2. The energy runs out at the next update (far enough below 0 that no recharge lifts it); the beacon's due ends it
    // 481 ticks later in the mission flow (G-02/6).
    Object.assign(player.combat, { energy: -1_000_000, nextEnergyClock: state.clock + 2 });
    const beacon = stepUntil(world, log, (event) => event.type === 'player-loss-started');
    expect(ofType(beacon, 'player-loss-started')).toEqual([expect.objectContaining({ loss: 'energy' })]);
    const beaconTick = state.tick;
    const rescued = stepUntil(world, log, (event) => event.type === 'player-rescued');
    expect(state.tick - beaconTick).toBe(BEACON_TICKS);
    expect(rescued[0]).toMatchObject({ type: 'radio-flushed', cause: 'beacon-expired' });
    expectRescueEvents(after(rescued, (event) => event.type === 'radio-flushed'), state.tick, 'energy', {
      playerEntityId: player.id, rescues: 2, baseEntityId: base.id, candidates: 1, position: { x: 1000, y: 1000, z: 2000 }, orientation: player.orientation,
    });
    expect([state.flow.rescues, player.combat.energy > 0]).toEqual([2, true]);
    expectContractOrder(log, state.tick);

    // 3. The same entity is destroyed again; its pod's expiry is the third loss: status ended, spawning off, the latch.
    const destroyed = destroyInTick(state, player);
    expect(ofType(destroyed, 'object-destroyed')).toEqual([expect.objectContaining({ entityId: player.id })]);
    expect(ofType(destroyed, 'player-loss-started')).toEqual([expect.objectContaining({ playerEntityId: player.id, loss: 'destroyed' })]);
    const destroyedTick = state.tick;
    const latched = stepUntil(world, [], isPodExpiry);
    expect(state.tick - destroyedTick).toBe(POD_EXPIRY_AFTER_DESTRUCTION);
    const result: MissionResult = {
      outcome: 'failure', reason: { type: 'third-loss', loss: 'destroyed' }, summary: null, rescuesUsed: 2,
      endingGaps: [{ gap: 'G-02/7', variant: 'destroyed' }], playerKills: 0, latchTick: state.tick,
    };
    expect(after(latched, isPodExpiry)).toEqual([
      { type: 'result-latched', tick: state.tick, result },
      { type: 'teardown-started', tick: state.tick, entities: state.entities.size },
    ]);
    // The teardown starts in the latch's tick (P3-11/14): main state 1, the view 0x13 and every entity pending removal.
    expect([state.missionStatus, state.spawn.enabled, state.flow.mainState, state.flow.rescues, state.flow.result]).toEqual(['ended', false, 1, 0, result]);
    expect([player.destroyed, player.state, state.player.viewMode, state.player.previousViewMode]).toEqual([true, 'pending-removal', 0x13, DESTRUCTION_VIEW]);
    // The ended run takes no further loss: no second latch, no rescue.
    const context = requestContext(state);
    resolvePlayerLoss(context, 'energy');
    expect(context.events).toEqual([]);
  });

  it('latches a third energy loss in the mission flow, right after the beacon\'s flush, with the energy variant', () => {
    const { state, player } = scene();
    Object.assign(state.flow, { subState: 1, beaconDeadline: 0, rescues: 2 });
    state.player.kills = Object.freeze({ ...state.player.kills, 7: 3, 8: 1 });
    const world = constructWorld(state);
    const events = world.step(tickInput());
    expect(events.filter(({ type }) => type === 'radio-flushed' || type === 'result-latched' || type === 'player-rescued' || type === 'transition')).toEqual([
      { type: 'radio-flushed', tick: 1, cause: 'beacon-expired', removed: 0, interrupted: 'none' },
      {
        type: 'result-latched', tick: 1, result: {
          outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, rescuesUsed: 2,
          endingGaps: [{ gap: 'G-02/7', variant: 'energy' }], playerKills: 4, latchTick: 1,
        },
      },
    ]);
    // The teardown follows in the same tick (P3-11/14).
    expect([state.flow.mainState, state.flow.subState, state.flow.rescues, state.missionStatus, state.spawn.enabled, player.state]).toEqual([1, 2, 0, 'ended', false, 'pending-removal']);
  });

  it('after an all-clear during the destruction sequence: the rescue returns to sub-state 0 and the next tick settles; a third loss fails instead', () => {
    const { state } = scene();
    Object.assign(state, { missionStatus: 'ended' });
    state.spawn.enabled = false;
    state.flow.subState = 2;
    const world = constructWorld(state);
    resolvePlayerLoss(requestContext(state), 'destroyed');
    expect(state.flow).toMatchObject({ mainState: 3, subState: 0, rescues: 1 });
    expect(ofType(world.step(tickInput()), 'settlement-started')).toEqual([expect.objectContaining({ outcome: 'success' })]);
    expect(state.flow.mainState).toBe(4);

    const third = scene();
    Object.assign(third.state, { missionStatus: 'ended' });
    Object.assign(third.state.flow, { subState: 2, rescues: 2 });
    const context = requestContext(third.state);
    resolvePlayerLoss(context, 'destroyed');
    expect(context.events).toEqual([expect.objectContaining({ type: 'result-latched', result: expect.objectContaining({ outcome: 'failure', reason: { type: 'third-loss', loss: 'destroyed' } }) })]);
    expect([third.state.flow.mainState, third.state.flow.settlement]).toEqual([0, null]);
  });
});

describe('losses that are no failure (ME-10 step 1; AC-07)', () => {
  it('does nothing in main states 4, 5, 0 and 1, whatever the count: the entry returns before any write', () => {
    for (const mainState of [4, 5, 0, 1] as const) {
      const { state, player } = scene();
      Object.assign(state, { missionStatus: 'ended' });
      Object.assign(state.flow, { mainState, subState: 2, rescues: mainState >= 4 ? 2 : 0 });
      if (mainState >= 4) state.flow.settlement = { outcome: 'success', summary: null, summarySelector: -1 };
      player.destroyed = true;
      const { clock } = state;
      const before = snapshotText(takeSnapshot(state));
      for (const loss of ['destroyed', 'energy'] as const) {
        const context = requestContext(state);
        resolvePlayerLoss(context, loss);
        expect(context.events).toEqual([]);
        state.clock = clock;
      }
      expect(snapshotText(takeSnapshot(state))).toBe(before);
    }
  });

  it('in main state 4 the destroyed player\'s pod expires without a rescue or a failure, and the flow goes on', () => {
    const { state, player } = scene();
    Object.assign(state, { missionStatus: 'ended' });
    state.spawn.enabled = false;
    Object.assign(state.flow, { mainState: 4, rescues: 2, settlement: { outcome: 'success', summary: null, summarySelector: -1 }, settlementDeadline: 1e9 });
    const world = constructWorld(state);
    const log = [...destroyInTick(state, player)];
    const expired = stepUntil(world, log, isPodExpiry);
    expect(after(expired, isPodExpiry)).toEqual([]);
    expect(log.filter(({ type }) => type === 'player-loss-started' || type === 'player-rescued' || type === 'result-latched' || type === 'transition')).toEqual([]);
    expect([state.flow.mainState, state.flow.subState, state.flow.rescues, state.flow.result, player.destroyed, player.state]).toEqual([4, 0, 2, null, true, 'destroyed-source']);
  });

  it('bases and the wingman lost, and a long run, never latch a result', () => {
    const { state } = scene();
    const base = addAt(state, 17, 300, 0, 0);
    const wingman = addAt(state, 1, -300, 0, 0);
    const world = constructWorld(state);
    for (const victim of [base, wingman]) {
      Object.assign((victim as CraftEntity).combat, { shield: 0, hull: 1 });
      const context = registerTick(state, readTickInput(tickInput()));
      for (const stage of PIPELINE) {
        if (stage.id === 'collision') applyContactDamage(context, victim, 5, 'collision');
        stage.run?.(context);
      }
      expect(ofType(context.events, 'object-destroyed')).toEqual([expect.objectContaining({ entityId: victim.id })]);
    }
    const log: DomainEvent[] = [];
    for (let tick = 0; tick < 3000; tick++) log.push(...world.step(tickInput()));
    expect(log.filter(({ type }) => type === 'player-loss-started' || type === 'result-latched')).toEqual([]);
    expect([state.flow.mainState, state.flow.subState, state.flow.rescues, state.flow.result, state.missionStatus]).toEqual([3, 0, 0, null, 'built']);
  });
});
