import { describe, expect, it } from 'vitest';
import type { ObjectLeftWorldEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import { activeAreaCentre } from '../rules/active-area.ts';
import { randomDirection } from '../rules/random-direction.ts';
import { randValues, rngStateAfter, scriptedRand } from '../rules/rand.test-support.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, playerOnlyMission, worldInput, type CraftInfoDraft, type WorldInputParts } from '../world/create-world.test-support.ts';
import type { Entity, EntityInit } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, entityInit, stillEntityInit, tickInput, withEveryKindBound } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { checkActiveArea, checkWarpTransit, isHeldInWarpTransit, switchParking, updateParked } from './area.ts';
import { registerTick, type TickContext } from './pipeline.ts';

// Expectations are written out from docs/original/formats/executable.md, world boundary, active area, parking and
// autopilot (P3-06/04) and docs/plan/p3/06/spec.md, 活动区域、停放与世界边界: radius 7500 and the inset world rectangle
// (a 6 × 6 sector world: X = 45000, exit bounds ±44900), the cadence 64 + rand % 64, the jitter spans 20 and 1000,
// the craft records' +0xB8 = 64 (one unit per clock unit) and +0x0C = 250 (a jump needs more than 500 units). Rand
// values are predicted from the world RNG state directly (rand.test-support.ts), not with area.ts.

/** A drained world, by default player-only (6 × 6 sectors), whose craft records `change` may adjust first. */
function worldWith(change: (info: CraftInfoDraft) => void = () => {}, parts: WorldInputParts = { mission: playerOnlyMission() }): WorldState {
  const info = craftInfoContent();
  change(info);
  const state = withEveryKindBound(initialWorldState(asCreateInput(worldInput({ ...parts, craftInfo: info }))));
  state.spawn.queue.length = 0;
  return state;
}

/** A standing, active player entity with its control state, at `position`. */
function addPlayer(state: WorldState, position: Vec3 = { x: 0, y: 0, z: 0 }): Entity {
  const player = addPlayerEntity(state, { position });
  player.state = 'active';
  return player;
}

/** A parked entity in state 7, last updated at clock 0, in AI mode 4 with its goal at its own position. */
function parked(state: WorldState, kindBit: number, overrides: Partial<EntityInit> = {}): Entity {
  const position = overrides.position ?? { x: 0, y: 0, z: 0 };
  const entity = state.entities.allocate(entityInit(kindBit, { activity: 'parked', position, ...overrides }));
  entity.state = 'active';
  entity.ai = { ...entity.ai, mode: 4, goal: position };
  return entity;
}

/** The next `count` rand values of the world RNG, without drawing them. */
const predicted = (state: WorldState, count: number): number[] => randValues(state.rngState, count);

/** The world RNG state after `count` more draws. */
const stateAfter = (state: WorldState, count: number) => rngStateAfter(state.rngState, count);

/** A context for the tick at `clock` (tick clock ÷ 2) after its clock stage, the world's tick and clock set to it. */
function contextAt(state: WorldState, clock: number): TickContext {
  state.clock = clock - 2;
  state.tick = Math.floor(clock / 2) - 1;
  const context = registerTick(state, readTickInput(tickInput()));
  state.clock = clock;
  state.tick = context.time.tick;
  return context;
}

/** Runs the parked update stage at `clock`, without P3-07's engagement, and returns its events. */
function parkedUpdate(state: WorldState, clock: number): ObjectLeftWorldEvent[] {
  const context = contextAt(state, clock);
  updateParked(context, () => {});
  return context.events.filter((event): event is ObjectLeftWorldEvent => event.type === 'object-left-world');
}

/** One parked update at clock 200, when every entity last updated at 0 is due. */
const due = (state: WorldState): ObjectLeftWorldEvent[] => parkedUpdate(state, 200);

/** The jitter of six draws, sign then magnitude for x, y and z: odd signs add, even ones subtract. */
const jitter = (draws: readonly number[], span: number): Vec3 => {
  const axis = (sign: number, magnitude: number): number => (sign % 2 !== 0 ? 1 : -1) * (magnitude % span) + 0;
  return { x: axis(draws[0], draws[1]), y: axis(draws[2], draws[3]), z: axis(draws[4], draws[5]) };
};

/** Facing +x in the sector plane: right +y, up +z, forward +x. */
const FACING_X = [0, 1, 0, 0, 0, 1, 1, 0, 0];

describe('area check 0x3a468 (P3-06 AC-06, M-08)', () => {
  it('parks active entities outside, resumes parked ones inside and leaves the rest, writing only states', () => {
    const state = worldWith();
    addPlayer(state);
    const make = (kindBit: number, x: number, y: number, activity: EntityInit['activity'] | 'docked' = 'active', objectState: Entity['state'] = 'active') => {
      const entity = state.entities.allocate(entityInit(kindBit, { position: { x, y, z: 9e5 }, activity: activity === 'docked' ? 'active' : activity }));
      entity.activity = activity;
      entity.state = objectState;
      return entity;
    };
    const inside = make(7, 7499.5, 0);
    const onCircle = make(7, 4500, 6000);
    const outside = make(7, 7500, 0);
    const hit = make(7, 7500, 0, 'active', 'projectile-hit');
    const projectile = make(20, 0, 9000);
    const resuming = make(7, 100, 0, 'parked');
    const inWarp = make(7, 100, 0, 'parked');
    inWarp.inWarp = true;
    const parkedOutside = make(7, 9000, 0, 'parked');
    const dockedOutside = make(7, 9000, 0, 'docked');
    const dockedInside = make(7, 0, 0, 'docked');
    const notYet = make(7, 9000, 0, 'active', 'presentation-ready');
    const playerKind = make(0, 9000, 0);
    const rng = state.rngState;
    const blocks = [outside, hit, dockedOutside].map(({ movement }) => movement);
    checkActiveArea(state);
    expect([inside, onCircle, outside, hit, projectile, resuming, inWarp, parkedOutside, dockedOutside, dockedInside, notYet, playerKind].map((entity) => entity.state)).toEqual([
      'active', 'area-switch', 'area-switch', 'area-switch', 'pending-removal', 'area-switch', 'active', 'active', 'active', 'active', 'presentation-ready', 'active',
    ]);
    expect([outside, hit, dockedOutside].map(({ movement }) => movement)).toEqual(blocks);
    expect([outside.activity, resuming.activity, dockedOutside.activity]).toEqual(['active', 'parked', 'docked']);
    expect(state.rngState).toBe(rng);
  });

  it('puts every entity outside without a player entity', () => {
    const state = worldWith();
    const active = state.entities.allocate(entityInit(7, { position: { x: 0, y: 0, z: 0 } }));
    active.state = 'active';
    const resting = parked(state, 7);
    expect(activeAreaCentre(state)).toBeNull();
    checkActiveArea(state);
    expect([active.state, resting.state]).toEqual(['area-switch', 'active']);
  });

  it('centres on the player entity', () => {
    const state = worldWith();
    const player = addPlayer(state, { x: -30000, y: 20000, z: 5 });
    expect(activeAreaCentre(state)).toBe(player.position);
    const near = state.entities.allocate(entityInit(7, { position: { x: -30000 + 7000, y: 20000, z: 0 } }));
    near.state = 'active';
    checkActiveArea(state);
    expect(near.state).toBe('active');
  });
});

describe('parking switch, message 0x20 (P3-06 AC-06, D-02, D-03)', () => {
  it('parks an active or docked entity: releases its block, keeps its timers, clears only a player target that is this entity', () => {
    for (const from of ['active', 'docked'] as const) {
      const state = worldWith();
      addPlayer(state);
      const entity = state.entities.allocate(entityInit(7, { lastParkedUpdateClock: 6, warpClock: 900, inWarp: true }));
      entity.activity = from;
      const other = state.entities.allocate(entityInit(8));
      other.ai = { ...other.ai, target: entity.id, objectTarget: entity.id };
      other.formation = { leader: entity.id, offset: { x: 1, y: 0, z: 0 } };
      state.player.target = entity.id;
      state.player.control!.speedAssist.engaged = true;
      entity.state = 'area-switch';
      expect(switchParking(state, entity)).toBe(true);
      expect(entity).toMatchObject({ activity: 'parked', state: 'new', movement: null, lastParkedUpdateClock: 6, warpClock: 900, inWarp: true });
      expect(state.player.target).toBeNull();
      expect(state.player.control!.speedAssist.engaged).toBe(true);
      expect(other.ai).toMatchObject({ target: entity.id, objectTarget: entity.id });
      expect(other.formation!.leader).toBe(entity.id);
    }
  });

  it("keeps the player's target when another entity parks", () => {
    const state = worldWith();
    addPlayer(state);
    const [entity, target] = [state.entities.allocate(entityInit(7)), state.entities.allocate(entityInit(8))];
    state.player.target = target.id;
    entity.state = 'area-switch';
    expect(switchParking(state, entity)).toBe(true);
    expect(state.player.target).toBe(target.id);
  });

  it('switches nothing for an entity not in area-switch or of the kinds removed on leaving, which removal handles', () => {
    const state = worldWith();
    const active = state.entities.allocate(entityInit(7));
    active.state = 'pending-removal';
    const projectile = state.entities.allocate(entityInit(20));
    projectile.state = 'area-switch';
    expect([switchParking(state, active), switchParking(state, projectile)]).toEqual([false, false]);
    expect([active.activity, active.movement !== null, projectile.activity, projectile.movement !== null]).toEqual(['active', true, 'active', true]);
  });

  it('resumes a parked entity with a new block at full throttle, at its pose, keeping its timers', () => {
    const state = worldWith();
    const entity = parked(state, 7, { position: { x: 5, y: 6, z: 7 }, lastParkedUpdateClock: 6, warpClock: 900 });
    const orientation = entity.orientation;
    entity.state = 'area-switch';
    expect(switchParking(state, entity)).toBe(true);
    expect(entity).toMatchObject({ activity: 'active', state: 'presentation-ready', position: { x: 5, y: 6, z: 7 }, lastParkedUpdateClock: 6, warpClock: 900 });
    expect(entity.orientation).toBe(orientation);
    // Maximum speed 48 against the record's base 64: speed and commanded speed 48, ratio 0.75.
    const still = { rate: 0, enabled: false };
    expect(entity.movement).toEqual({
      mode: 'craft', speed: 48, commandedSpeed: 48, atCommandedSpeed: true, speedRatio: 0.75,
      steering: { pitch: still, yaw: still, roll: still }, timedRotation: { pitch: null, yaw: null, roll: null },
      impulse: null, locked: false, disturbance: null,
    });
  });

  it('removes an entity of the kinds 0x1f00000 in area-switch instead of parking it, without an event', () => {
    const state = worldWith();
    const world = constructWorld(state);
    const projectile = state.entities.allocate(entityInit(20));
    projectile.state = 'area-switch';
    expect(world.step(tickInput())).toEqual([]);
    expect(state.entities.get(projectile.id)).toBeUndefined();
  });

  it('switches at the Q-08 times in a running world', () => {
    const state = worldWith();
    const world = constructWorld(state);
    const player = addPlayer(state);
    const craft = state.entities.allocate(stillEntityInit(7, { position: { x: 1000, y: 0, z: 0 } }));
    craft.state = 'active';
    state.player.target = craft.id;
    world.step(tickInput());
    player.position = { x: 20000, y: 0, z: 0 };
    // Tick N: the area check marks them.
    expect(world.step(tickInput())).toEqual([]);
    expect([craft.activity, craft.state, craft.movement !== null]).toEqual(['active', 'area-switch', true]);
    // N + 1: request handling parks it; no parked update yet, so no draw.
    const rng = state.rngState;
    expect(world.step(tickInput())).toEqual([]);
    expect([craft.activity, craft.state, craft.movement, state.player.target]).toEqual(['parked', 'new', null, null]);
    expect(state.rngState).toEqual(rng);
    // N + 2: active again as a parked entity; the parked update draws for it once.
    const expected = stateAfter(state, 1);
    world.step(tickInput());
    expect([craft.activity, craft.state]).toEqual(['parked', 'active']);
    expect(state.rngState).toEqual(expected);
    // Back near the player: area-switch, then resumed with a block, then active and moving.
    player.position = { x: 0, y: 0, z: 0 };
    world.step(tickInput());
    expect([craft.activity, craft.state]).toEqual(['parked', 'area-switch']);
    world.step(tickInput());
    expect([craft.activity, craft.state, craft.movement?.speed]).toEqual(['active', 'presentation-ready', 48]);
    const resumedAt = craft.position.z;
    // Active from its next update, before that tick's movement.
    world.step(tickInput());
    expect(craft.state).toBe('active');
    expect(craft.position.z).toBeGreaterThan(resumedAt);
  });
});

describe('Warp transit 0x2f298 (P3-06 AC-06)', () => {
  it('holds a new or presentation-ready entity in transit, then clears the flag and lets it become active', () => {
    const state = worldWith((info) => void (info.craft[7].atA8 = 3));
    const world = constructWorld(state);
    // Timer 2: the transit lasts until clock 2 + 192.
    const entity = state.entities.allocate(entityInit(7, { activity: 'parked', warpClock: 2, inWarp: true, position: { x: 30000, y: 0, z: 0 } }));
    while (state.clock + 2 < 194) {
      world.step(tickInput());
      expect([entity.state, entity.inWarp]).toEqual(['new', true]);
    }
    world.step(tickInput());
    expect([entity.state, entity.inWarp]).toEqual(['active', false]);
  });

  it("times a follower's transit by its valid leader's record, its own otherwise, and never holds the player", () => {
    const state = worldWith((info) => {
      info.craft[7].atA8 = 10;
      info.craft[8].atA8 = 0;
    });
    const leader = state.entities.allocate(entityInit(7));
    const follower = state.entities.allocate(entityInit(8, { activity: 'parked', warpClock: 100, inWarp: true, formation: { leader: leader.id, offset: { x: 0, y: 0, z: 0 } } }));
    state.clock = 101;
    expect(checkWarpTransit(state, follower)).toBe(true);
    follower.formation = { leader: 99, offset: { x: 0, y: 0, z: 0 } };
    expect(checkWarpTransit(state, follower)).toBe(false);
    expect(follower.inWarp).toBe(false);
    const world = constructWorld(state);
    const player = state.entities.allocate(entityInit(0, { warpClock: state.clock, inWarp: true }));
    world.step(tickInput());
    expect([player.state, player.inWarp]).toEqual(['active', true]);
  });

  it('holds the generic update only in states 0–3', () => {
    const state = worldWith((info) => void (info.craft[7].atA8 = 3));
    const entity = state.entities.allocate(entityInit(7, { warpClock: 2, inWarp: true }));
    state.clock = 4;
    const held = (['new', 'presentation-ready', 'awaiting-presentation', 'active', 'area-switch'] as const).map((objectState) => {
      entity.state = objectState;
      return isHeldInWarpTransit(state, entity);
    });
    expect(held).toEqual([true, true, true, false, false]);
  });

  it('does not hold an entity without a timer or not in Warp', () => {
    const state = worldWith((info) => void (info.craft[7].atA8 = 3));
    const entity = state.entities.allocate(entityInit(7, { warpClock: 0, inWarp: true }));
    state.clock = 2;
    expect(checkWarpTransit(state, entity)).toBe(false);
    expect(entity.inWarp).toBe(true);
  });
});

describe('parked update 0x2f1b0: selection and cadence (P3-06 AC-06)', () => {
  it('draws once per selected entity every tick, whether due or not; it selects parked craft in state 7+ not destroyed', () => {
    const state = worldWith();
    const selected = [parked(state, 7), parked(state, 8)];
    const fresh = parked(state, 7);
    fresh.state = 'new';
    const destroyed = parked(state, 7);
    destroyed.destroyed = true;
    const leaving = parked(state, 7);
    leaving.state = 'pending-removal';
    // No kind outside the craft kinds can be parked: allocation keeps P3-07's runtime kinds active (CR-02).
    state.entities.allocate(entityInit(20)).state = 'active';
    state.entities.allocate(entityInit(7)).state = 'active';
    const expected = stateAfter(state, selected.length);
    expect(parkedUpdate(state, 10)).toEqual([]);
    expect(state.rngState).toEqual(expected);
    expect(selected.map(({ lastParkedUpdateClock }) => lastParkedUpdateClock)).toEqual([0, 0]);
  });

  it('is due at last + 64 + rand % 64, taking the elapsed time and the clock before travelling', () => {
    const state = worldWith();
    const entity = parked(state, 7, { lastParkedUpdateClock: 1000 });
    entity.ai.goal = { x: 400, y: 0, z: 0 };
    const [first] = predicted(state, 1);
    parkedUpdate(state, 1000 + 64 + (first % 64) - 1);
    expect([entity.lastParkedUpdateClock, entity.placementSerial]).toEqual([1000, 0]);
    const draws = predicted(state, 7);
    const clock = 1000 + 64 + (draws[0] % 64);
    parkedUpdate(state, clock);
    expect(entity.lastParkedUpdateClock).toBe(clock);
    // The travel takes the elapsed time: one unit per clock unit.
    const shake = jitter(draws.slice(1), 20);
    expect(entity.position).toEqual({ x: clock - 1000 + shake.x, y: shake.y, z: shake.z });
    expect(entity.placementSerial).toBe(1);
  });

  it('engages each object it updates after its travel, with its elapsed time, between its draws and the next object\'s (P3-07 CR-09, E1, E4)', () => {
    const state = worldWith((info) => void (info.craft[7].atA8 = 100));
    const [first, second] = [parked(state, 7), parked(state, 8, { lastParkedUpdateClock: 40 })];
    for (const entity of [first, second]) entity.ai = { ...entity.ai, mode: 5 };
    // Due as well, but in Warp transit: no travel and no engagement.
    parked(state, 7, { warpClock: 50, inWarp: true });
    const start = state.rngState;
    const calls: [number, number, typeof start][] = [];
    updateParked(contextAt(state, 200), (entity, elapsed) => {
      calls.push([entity.id, elapsed, state.rngState]);
      // A stand-in engagement that draws once from the world RNG.
      state.rngState = rngStateAfter(state.rngState, 1);
    });
    // The walk takes kind 7 before kind 8: the first's due check and its engagement's draw, the transit's due check,
    // then the second's due check and its engagement's draw.
    expect(calls).toEqual([[first.id, 200, rngStateAfter(start, 1)], [second.id, 160, rngStateAfter(start, 4)]]);
    expect(state.rngState).toEqual(rngStateAfter(start, 5));
  });

  it('skips the rest of a due entity in Warp transit', () => {
    const state = worldWith((info) => void (info.craft[7].atA8 = 100));
    const entity = parked(state, 7, { warpClock: 50, inWarp: true });
    entity.ai.goal = { x: 400, y: 0, z: 0 };
    const expected = stateAfter(state, 1);
    parkedUpdate(state, 200);
    expect([entity.lastParkedUpdateClock, entity.position.x, entity.inWarp]).toEqual([200, 0, true]);
    expect(state.rngState).toEqual(expected);
  });
});

describe('parked travel 0x2f314 (P3-06 AC-06)', () => {
  it('travels toward its goal by elapsed × +0xB8, facing it, with a jitter of up to 19, and counts the placement', () => {
    const state = worldWith((info) => void (info.craft[7].atA4 = 0));
    const entity = parked(state, 7, { position: { x: -1000, y: 50, z: 7 } });
    entity.ai.goal = { x: 4000, y: 50, z: 7 };
    const draws = predicted(state, 7);
    const expected = stateAfter(state, 7);
    expect(due(state)).toEqual([]);
    const shake = jitter(draws.slice(1), 20);
    expect(entity.position).toEqual({ x: -800 + shake.x, y: 50 + shake.y, z: 7 + shake.z });
    expect(entity.orientation).toEqual(FACING_X);
    expect([entity.placementSerial, entity.inWarp, entity.warpClock, entity.state]).toEqual([1, false, 0, 'active']);
    expect(state.rngState).toEqual(expected);
  });

  it('does not move in AI modes 1 and 5', () => {
    for (const mode of [1, 5] as const) {
      const state = worldWith();
      const entity = parked(state, 7);
      entity.ai = { ...entity.ai, mode, goal: { x: 400, y: 0, z: 0 } };
      const expected = stateAfter(state, 1);
      due(state);
      expect([entity.position.x, entity.placementSerial, entity.lastParkedUpdateClock]).toEqual([0, 0, 200]);
      expect(state.rngState).toEqual(expected);
    }
  });

  it('jumps toward a goal beyond twice +0x0C when a Warp is allowed, by +0xA0 or the distance, with a jitter of up to 999', () => {
    const state = worldWith((info) => {
      info.craft[7].atA0 = 1000;
      info.craft[8].atA0 = 0;
    });
    const capped = parked(state, 7);
    capped.ai.goal = { x: 16000, y: 0, z: 0 };
    const whole = parked(state, 8, { position: { x: 0, y: 1000, z: 0 } });
    whole.ai.goal = { x: 600, y: 1000, z: 0 };
    const draws = predicted(state, 14);
    due(state);
    const first = jitter(draws.slice(1, 7), 1000);
    const second = jitter(draws.slice(8, 14), 1000);
    expect(capped).toMatchObject({ inWarp: true, warpClock: 200, placementSerial: 1, position: { x: 1000 + first.x, y: first.y, z: first.z } });
    expect(whole).toMatchObject({ inWarp: true, warpClock: 200, position: { x: 600 + second.x, y: 1000 + second.y, z: second.z } });
    expect(capped.orientation).toEqual(FACING_X);
  });

  it('travels instead while the Warp timer forbids a jump, and jumps when a Warp-out was requested', () => {
    const state = worldWith((info) => {
      info.craft[7].atA8 = 3;
      info.craft[7].atA4 = 2;
      info.craft[8].atA4 = 0;
      info.craft[8].atA0 = 0;
    });
    // Timer 100: no Warp before clock 100 + 320.
    const waiting = parked(state, 7, { warpClock: 100 });
    waiting.ai.goal = { x: 16000, y: 0, z: 0 };
    // In Warp with the timer 0 (message 0x800000): a jump although the goal is near and +0xA4 forbids Warps.
    const requested = parked(state, 8, { position: { x: 0, y: 5000, z: 0 }, inWarp: true });
    requested.ai.goal = { x: 300, y: 5000, z: 0 };
    const draws = predicted(state, 14);
    due(state);
    const travel = jitter(draws.slice(1, 7), 20);
    const jump = jitter(draws.slice(8, 14), 1000);
    expect(waiting).toMatchObject({ inWarp: false, warpClock: 100, position: { x: 200 + travel.x, y: travel.y, z: travel.z } });
    expect(requested).toMatchObject({ inWarp: true, warpClock: 200, position: { x: 300 + jump.x, y: 5000 + jump.y, z: jump.z } });
  });

  it('snaps a follower to its leader: pose, and position plus the offset along the leader rows; a leader in Warp makes it jump', () => {
    const state = worldWith();
    const leader = state.entities.allocate(entityInit(7, { position: { x: 100, y: 200, z: 300 } }));
    const offset = { x: 2, y: 3, z: 4 };
    const follower = parked(state, 8, { formation: { leader: leader.id, offset } });
    follower.ai = { ...follower.ai, mode: 1 };
    // The subject is the leader: its mode 4 and goal choose the motion; the follower's own mode 1 does not count.
    leader.ai = { ...leader.ai, mode: 4, goal: { x: 5000, y: 0, z: 0 } };
    const expected = stateAfter(state, 1);
    due(state);
    // TEST_ORIENTATION rows (0, 1, 0), (−1, 0, 0), (0, 0, 1): 2 × row 1 + 3 × row 2 + 4 × row 3 = (−3, 2, 4).
    expect(follower).toMatchObject({ position: { x: 97, y: 202, z: 304 }, placementSerial: 1, inWarp: false });
    expect(follower.orientation).toBe(leader.orientation);
    expect(state.rngState).toEqual(expected);

    Object.assign(leader, { inWarp: true, warpClock: 77, position: { x: 0, y: 0, z: 0 } });
    follower.lastParkedUpdateClock = 0;
    due(state);
    expect(follower).toMatchObject({ position: { x: -3, y: 2, z: 4 }, placementSerial: 2, inWarp: true, warpClock: 77 });
  });

  it('clears a leader that no longer resolves and does not move', () => {
    const state = worldWith();
    const follower = parked(state, 8, { formation: { leader: 999, offset: { x: 1, y: 0, z: 0 } } });
    follower.ai.goal = { x: 5000, y: 0, z: 0 };
    const expected = stateAfter(state, 1);
    due(state);
    expect([follower.formation, follower.position.x, follower.placementSerial]).toEqual([null, 0, 0]);
    expect(state.rngState).toEqual(expected);
  });

  it('aims at a target plus the offset, replacing a zero offset with a random one stored in the subject', () => {
    const state = worldWith((info) => void (info.craft[7].atA4 = 0));
    const target = state.entities.allocate(entityInit(8, { position: { x: 3000, y: 0, z: 0 } }));
    const entity = parked(state, 7);
    entity.ai = { ...entity.ai, mode: 0, target: target.id };
    const draws = predicted(state, 10);
    const expected = stateAfter(state, 10);
    due(state);
    // rand % 500 + 800 times the random direction of the next two draws; then a travel (six jitter draws).
    const length = (draws[1] % 500) + 800;
    const direction = randomDirection(scriptedRand(draws.slice(2, 4)));
    expect(entity.ai.targetOffset).toEqual({ x: Math.fround(direction.x * length), y: Math.fround(direction.y * length), z: Math.fround(direction.z * length) });
    expect(entity.placementSerial).toBe(1);
    expect(state.rngState).toEqual(expected);
  });

  it('prefers a valid object target in AI mode 2, else takes the AI target with a length from its record (at least 800)', () => {
    const state = worldWith((info) => {
      info.craft[7].atA4 = 0;
      info.craft[8].at0C = 2000.5;
    });
    const objectTarget = state.entities.allocate(entityInit(9, { position: { x: 0, y: 3000, z: 0 } }));
    const aiTarget = state.entities.allocate(entityInit(8, { position: { x: 3000, y: 0, z: 0 } }));
    const offset = { x: 10, y: 0, z: 0 };
    const preferring = parked(state, 7);
    preferring.ai = { ...preferring.ai, mode: 2, target: aiTarget.id, objectTarget: objectTarget.id, targetOffset: offset };
    const falling = parked(state, 7, { position: { x: 0, y: 0, z: 100 } });
    falling.ai = { ...falling.ai, mode: 2, target: aiTarget.id, objectTarget: 999 };
    const draws = predicted(state, 7 + 10);
    due(state);
    // Toward (10, 3000, 0): mostly along +y.
    expect(preferring.position.y).toBeGreaterThan(100);
    expect(Math.abs(preferring.position.x)).toBeLessThan(30);
    // rand % trunc(2000.5), at least 800.
    const length = Math.max(draws[8] % 2000, 800);
    const direction = randomDirection(scriptedRand(draws.slice(9, 11)));
    expect(falling.ai.targetOffset).toEqual({ x: Math.fround(direction.x * length), y: Math.fround(direction.y * length), z: Math.fround(direction.z * length) });
  });

  it('does not move toward a target in Warp or one that no longer resolves', () => {
    const state = worldWith();
    const target = state.entities.allocate(entityInit(8, { position: { x: 3000, y: 0, z: 0 }, inWarp: true }));
    const waiting = parked(state, 7);
    waiting.ai = { ...waiting.ai, mode: 0, target: target.id };
    const lost = parked(state, 7);
    lost.ai = { ...lost.ai, mode: 0, target: 999 };
    const expected = stateAfter(state, 2);
    due(state);
    expect([waiting, lost].map(({ position, placementSerial, ai }) => [position.x, placementSerial, ai.targetOffset])).toEqual([
      [0, 0, { x: 0, y: 0, z: 0 }],
      [0, 0, { x: 0, y: 0, z: 0 }],
    ]);
    expect(state.rngState).toEqual(expected);
  });
});

describe('arrival and leaving the world (P3-06 AC-06, M-07, D-06)', () => {
  it('takes a new goal in AI mode 4 from the record, the group template for a member, writes no position and leaves Warp', () => {
    const state = worldWith(() => {}, { mission: undefined, run: { wingman: 0 } });
    const at = { x: 0, y: 0, z: 0 };
    const member = parked(state, 7, { source: { collection: 'mission', index: 4, group: { index: 0, request: 0, member: 0 } }, inWarp: true, warpClock: 0 });
    member.ai.goal = { x: 50, y: 0, z: 0 };
    const record = parked(state, 17, { source: { collection: 'mission', index: 7, group: null }, position: at });
    const wingman = parked(state, 1, { source: { collection: 'wingman', index: 0, group: null }, position: at });
    // Walk order: the wingman (kind bit 1), the member (7), the record (17); each a cadence draw, then two.
    const draws = predicted(state, 9);
    const expected = stateAfter(state, 9);
    expect(due(state)).toEqual([]);
    const scale = 32769 / 2 ** 30;
    // The wingman's record has no rectangle: the whole-world default over 6 sectors, 90000 wide.
    expect(wingman.ai.goal).toEqual({ x: Math.fround(90000 * draws[1] * scale - 45000), y: Math.fround(90000 * draws[2] * scale - 45000), z: 0 });
    // Template 1's rectangle, 16000–20000 × 1.875: 30000 up by 7500.
    expect(member.ai.goal).toEqual({ x: Math.fround(30000 + 7500 * draws[4] * scale), y: Math.fround(30000 + 7500 * draws[5] * scale), z: 0 });
    // Record 7's rectangle, −4000–4000 × 1.875.
    expect(record.ai.goal).toEqual({ x: Math.fround(-7500 + 15000 * draws[7] * scale), y: Math.fround(-7500 + 15000 * draws[8] * scale), z: 0 });
    expect([member, record, wingman].map(({ position, placementSerial, state: objectState }) => [position, placementSerial, objectState])).toEqual(
      [[{ x: 0, y: 0, z: 0 }, 0, 'active'], [at, 0, 'active'], [at, 0, 'active']],
    );
    expect(member.inWarp).toBe(false);
    expect(state.rngState).toEqual(expected);
  });

  it("clears the entity's own target offset on arrival, not the leader's, and keeps a goal in other modes", () => {
    const state = worldWith();
    const target = state.entities.allocate(entityInit(8, { position: { x: 1000, y: 0, z: 0 } }));
    const leader = state.entities.allocate(entityInit(7, { position: { x: 1000, y: 30, z: 0 } }));
    leader.ai = { ...leader.ai, mode: 0, target: target.id, targetOffset: { x: 0, y: 50, z: 0 } };
    const follower = parked(state, 8, { formation: { leader: leader.id, offset: { x: 0, y: 0, z: 0 } } });
    follower.ai = { ...follower.ai, mode: 0, targetOffset: { x: 5, y: 5, z: 5 } };
    const goal = follower.ai.goal;
    const expected = stateAfter(state, 1);
    due(state);
    expect(follower.ai.targetOffset).toEqual({ x: 0, y: 0, z: 0 });
    expect(follower.ai.goal).toBe(goal);
    expect(leader.ai.targetOffset).toEqual({ x: 0, y: 50, z: 0 });
    expect(state.rngState).toEqual(expected);
  });

  it('leaves the world once, by the subject outside the inset rectangle, except the wingman; removal follows at the next tick', () => {
    const state = worldWith();
    const world = constructWorld(state);
    const source = { collection: 'mission', index: 0, group: null } as const;
    const outside = { x: 44900.25, y: 0, z: -1e6 };
    const leaving = parked(state, 7, { position: outside, source });
    leaving.ai = { ...leaving.ai, mode: 0, goal: outside };
    const leader = state.entities.allocate(entityInit(7, { position: { x: 0, y: -44950, z: 0 } }));
    leader.ai = { ...leader.ai, mode: 0, goal: { x: 0, y: -44950, z: 0 } };
    const follower = parked(state, 8, { formation: { leader: leader.id, offset: { x: 0, y: 0, z: 0 } } });
    const wingman = parked(state, 1, { position: outside });
    wingman.ai = { ...wingman.ai, mode: 0, goal: outside };
    const onBounds = parked(state, 7, { position: { x: -44900, y: 44900, z: 0 } });
    onBounds.ai = { ...onBounds.ai, mode: 0, goal: onBounds.position };
    const events = due(state);
    expect(events).toEqual([
      { type: 'object-left-world', tick: 100, entityId: leaving.id, kindBit: 7, source },
      { type: 'object-left-world', tick: 100, entityId: follower.id, kindBit: 8, source: null },
    ]);
    expect([leaving, follower, wingman, onBounds].map(({ state: objectState, placementSerial }) => [objectState, placementSerial])).toEqual([
      ['pending-removal', 0], ['pending-removal', 0], ['active', 0], ['active', 0],
    ]);
    expect(leader.state).toBe('presentation-ready');
    // Pending removal: no longer selected, so no second event and no draw for them.
    const expected = stateAfter(state, 2);
    expect(parkedUpdate(state, 400)).toEqual([]);
    expect(state.rngState).toEqual(expected);
    world.step(tickInput());
    expect([leaving.id, follower.id, wingman.id].map((id) => state.entities.get(id) !== undefined)).toEqual([false, false, true]);
  });

  it('never counts a re-placement beyond the world as leaving it', () => {
    const state = worldWith((info) => void (info.craft[7].atA0 = 0));
    const jumper = parked(state, 7, { position: { x: 40000, y: 0, z: 0 } });
    jumper.ai.goal = { x: 60000, y: 0, z: 0 };
    expect(due(state)).toEqual([]);
    expect(jumper.position.x).toBeGreaterThan(55000);
    expect([jumper.state, jumper.inWarp, jumper.placementSerial]).toEqual(['active', true, 1]);
  });
});

describe('active objects and the world rectangle (P3-06 AC-06, M-07)', () => {
  it('leaves an active object beyond the world rectangle as it is: no clamp, removal or event', () => {
    const state = worldWith();
    const world = constructWorld(state);
    addPlayer(state, { x: 60000, y: 0, z: 0 });
    // P3-07's automatic target selection would select the craft; it is not due here.
    state.player.targeting = { ...state.player.targeting!, autoTargetDueClock: 1e9 };
    const craft = state.entities.allocate(entityInit(7, { position: { x: 60010, y: 0, z: 0 } }));
    craft.state = 'active';
    const before = craft.position;
    for (let tick = 0; tick < 5; tick++) expect(world.step(tickInput())).toEqual([]);
    expect([craft.activity, craft.state, craft.placementSerial]).toEqual(['active', 'active', 0]);
    expect(craft.position).not.toEqual(before);
    expect(Math.abs(craft.position.x)).toBeGreaterThan(45000);
  });
});

describe('the parked enemy report 0x3c3b0 after the travel (P3-10 CB-12, RX6)', () => {
  // A hostile of kind 7 travels from x −1000 toward x 4000: its due check and six jitter draws, landing near x −800,
  // where an active base (kind 17, radius 250) stands. The base's first speech draws its face (rand % 5).
  function travelScene(kindBit: number, withPlayer: boolean) {
    const state = worldWith((info) => void (info.craft[kindBit].atA4 = 0));
    if (withPlayer) addPlayer(state);
    const mover = parked(state, kindBit, { position: { x: -1000, y: 50, z: 7 } });
    mover.ai.goal = { x: 4000, y: 50, z: 7 };
    const base = state.entities.allocate(entityInit(17, { position: { x: -800, y: 50, z: 7 } }));
    base.state = 'active';
    return { state, base };
  }

  it('reports a hostile that moved inside the active area before its engagement: the base stamps and draws its face', () => {
    const { state, base } = travelScene(7, true);
    const draws = predicted(state, 8);
    const start = state.rngState;
    const engaged: (typeof start)[] = [];
    const context = contextAt(state, 200);
    updateParked(context, () => void engaged.push(state.rngState));
    expect(base.communications).toEqual({ face: draws[7] % 5, threatStamp: 200 });
    expect(engaged).toEqual([rngStateAfter(start, 8)]);
    expect(state.rngState).toEqual(rngStateAfter(start, 8));
  });

  it('does not report outside the active area (no player) or for a mover outside the hostile set', () => {
    for (const [kindBit, withPlayer] of [[7, false], [2, true]] as const) {
      const { state, base } = travelScene(kindBit, withPlayer);
      const expected = stateAfter(state, 7);
      due(state);
      expect(base.communications).toEqual({ face: null, threatStamp: null });
      expect(state.rngState).toEqual(expected);
    }
  });
});

describe('the wingman\'s arrival repair at a base (P3-10 CB-12, RX6; BS9)', () => {
  // The mover stands on its goal, its target's position plus its own offset, so its parked update arrives; the only
  // draw is the update's cadence. The kind-bit-1 and 7 records have c9C 12 and c54 1000.
  function arrival(kindBit: number, targetKindBit: number) {
    const state = worldWith();
    const target = state.entities.allocate(entityInit(targetKindBit, { position: { x: 500, y: 0, z: 0 } }));
    target.state = 'active';
    const mover = parked(state, kindBit, { position: { x: 510, y: 0, z: 0 } });
    mover.ai = { ...mover.ai, mode: 0, target: target.id, targetOffset: { x: 10, y: 0, z: 0 } };
    return { state, mover };
  }

  /** Damages the mover and puts its offset back, which each arrival clears. */
  function damage(mover: Entity): void {
    if (mover.combat.type !== 'craft') throw new Error('not a craft');
    mover.ai.targetOffset = { x: 10, y: 0, z: 0 };
    Object.assign(mover.combat, { hull: 3, energy: 7, subsystems: Object.freeze(mover.combat.subsystems.map(() => 2)) });
  }

  const resources = (mover: Entity) => (mover.combat.type === 'craft' ? [mover.combat.hull, mover.combat.energy, mover.combat.subsystems[0]] : null);

  it('fully repairs the wingman once the sample is strictly past the shared limit, then waits 0x780, with no message or draw', () => {
    const { state, mover } = arrival(1, 17);
    damage(mover);
    const expected = stateAfter(state, 1);
    const context = contextAt(state, 200);
    updateParked(context, () => {});
    expect(resources(mover)).toEqual([12, 1000, 0]);
    expect(state.communications.limits.wingmanArrivalRepair).toBe(200 + 0x780);
    expect([context.events, state.communications.queue, state.rngState]).toEqual([[], [], expected]);
    damage(mover);
    parkedUpdate(state, 200 + 0x780);
    expect(resources(mover)).toEqual([3, 7, 2]);
    mover.ai.targetOffset = { x: 10, y: 0, z: 0 };
    parkedUpdate(state, 2400);
    expect(resources(mover)).toEqual([12, 1000, 0]);
    expect(state.communications.limits.wingmanArrivalRepair).toBe(2400 + 0x780);
  });

  it('does not repair another kind arriving at a base, or the wingman arriving at another kind', () => {
    for (const [kindBit, targetKindBit] of [[7, 17], [1, 7]] as const) {
      const { state, mover } = arrival(kindBit, targetKindBit);
      damage(mover);
      due(state);
      expect(resources(mover)).toEqual([3, 7, 2]);
      expect(state.communications.limits.wingmanArrivalRepair).toBe(0);
    }
  });
});
