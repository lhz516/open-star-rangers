import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { missile, missileBody } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import type { CollisionShape, ShapeBox } from '../rules/collision-shapes.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { craftMovementBlock } from '../rules/flight-state.ts';
import type { MissileEntity } from '../rules/guidance.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { craftInfoContent } from '../world/create-world.test-support.ts';
import type { EntityInit, HomingState, Matrix3, MissileCombat, MissileGuidance, SteeredMovementBlock } from '../world/entity-table.ts';
import type { CraftRuleData } from '../world/rule-data.ts';
import {
  addPlayerEntity, entityInit, expectFault, stillEntityInit, TEST_BASE_MAXIMUM_SPEED, TEST_MAXIMUM_SPEED, testState, tickInput,
} from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { applySteer, expireMissile, UNGUIDED_CHECK_INTERVAL, updateMissile } from './missiles.ts';
import { registerTick, type ControlBlock, type Request, type RequestOf, type TickContext } from './pipeline.ts';

// docs/plan/p3/02/spec.md, CR-02 and CR-05 to CR-11; docs/original/formats/executable.md, H5 and the float path of
// `0x21fd8`. Every expectation is worked out by hand from H5 and the records below; rules/guidance.test.ts and
// rules/steering.test.ts cover the rules' arithmetic, systems/damage.test.ts the damage entry. These tests call the
// callback and the request handlers directly; missile-wiring.test.ts runs missiles through the formal step (P3-07/22).

const CLOCK = 640;
const f32 = Math.fround;
const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/** Missile records: 0 unguided (+0x18 = 0), 1 homing (+0x18 = 2, program record 2), 2 the heat seeker (+0x18 = 1, record 1). */
const UNGUIDED = 0;
const HOMING = 1;
const HEAT_SEEKER = 2;
/** Their shared fields: lifetime +0x44, arming +0x48, fuse radius +0x4C, detonation delay +0x54, check interval +0x58 (odd). */
const LIFETIME = 320;
const ARMING = 32;
const FUSE_RADIUS_SQUARED = 16;
const DETONATION_DELAY = 6;
const CHECK_INTERVAL = 9;
/** The blast: damage +0x5C, full-damage radius +0x60, zero-damage radius +0x64. */
const DAMAGE = 700;
const INNER = 2;
const OUTER = 12;
/** The body record's craft rates: +0xAC about row 1 (pitch), +0xB4 about row 2 (yaw), +0xB0 about row 3 (roll). */
const PITCH_RATE = 1;
const YAW_RATE = 3;
const ROLL_RATE = 2;
/** The missile's speed: the shake's impulse is f32(80 × 0.0125) = 1. */
const SPEED = 80;
/** Built-in records 1 and 2: period +0x14, angle limit +0x24 (degrees), saturation +0x2C. */
const PROGRAMS = Object.freeze({ 1: Object.freeze({ at14: 16, at24: 30, at2C: 0.75 }), 2: Object.freeze({ at14: 8, at24: 45, at2C: 1 }) });

/** Craft kinds: BOXED has a box (half-size 2, r² 100), every other kind the sphere alone with r² 0; EXEMPT is in `0xf9c7c`. */
const BOXED = 7;
const PLAIN = 8;
const EXEMPT = 3;

const cube = (half: number): ShapeBox => ({ lower: at(-half, -half, -half), upper: at(half, half, half) });
const shape = (radiusSquared: number, boxes: readonly ShapeBox[]): CollisionShape =>
  ({ radius: f32(Math.sqrt(radiusSquared)), radiusSquared, bounds: cube(10), boxes, innerBox: null });

/** The scene's world at CLOCK, without entities. */
function world(): WorldState {
  const base = testState();
  const info = craftInfoContent();
  const record = { body: 0, at20: 0, at44: LIFETIME, at48: ARMING, at4C: 4, at54: DETONATION_DELAY, at58: CHECK_INTERVAL, at5C: DAMAGE, at60: INNER, at64: OUTER };
  info.missiles = [missile({ ...record, at18: 0 }), missile({ ...record, at18: 2 }), missile({ ...record, at18: 1 })];
  info.missileBodies = [missileBody({ atAC: PITCH_RATE, atB0: ROLL_RATE, atB4: YAW_RATE, atB8: 64 })];
  const craft = Array.from({ length: 20 }, (_, kindBit): CraftRuleData =>
    ({ shape: kindBit === BOXED ? shape(100, [cube(2)]) : shape(0, []), mountOffsets: [], parts: 0, debris: [] }));
  const rules = { range: 0, rangeSquared: 0, fuseRadiusSquared: FUSE_RADIUS_SQUARED };
  const state: WorldState = {
    ...base,
    craftInfo: { ...base.craftInfo, content: readCraftInfo(info) },
    ruleData: { ...base.ruleData, craft, missiles: [rules, rules, rules], homingPrograms: PROGRAMS },
  };
  state.clock = CLOCK;
  return state;
}

const contextOf = (state: WorldState): TickContext => registerTick(state, readTickInput(tickInput()));

/** The requests `work` posts in a fresh context, taken by handling them without effect. */
function posted(state: WorldState, work: (context: TickContext) => void): Request[] {
  const context = contextOf(state);
  work(context);
  const requests: Request[] = [];
  context.requests.handle((request) => requests.push(request));
  return requests;
}

/** The events `work` emits in a fresh context. */
function emitted(state: WorldState, work: (context: TickContext) => void): readonly DomainEvent[] {
  const context = contextOf(state);
  work(context);
  return context.events;
}

/** A missile of `record` at `position`, unturned, at SPEED with commanded speed 0, in its first-callback state. */
function missileAt(state: WorldState, record: number, position: Vec3, combat: Partial<MissileCombat> = {}): MissileEntity {
  const program = record === UNGUIDED ? 'unguided' : record === HOMING ? 'homing' : 'heat-seeker';
  return state.entities.allocate(entityInit(20, {
    position,
    orientation: IDENTITY,
    movement: { ...craftMovementBlock(0, TEST_MAXIMUM_SPEED, TEST_BASE_MAXIMUM_SPEED), speed: SPEED },
    presentation: { type: 'missile', missile: record },
    combat: {
      type: 'missile', missile: record, shooter: null, target: null, launchByte: 4, program, detonate: false, contact: null, guidance: null,
      homing: null, ...combat,
    },
  })) as MissileEntity;
}

/** A standing, unturned craft of `kindBit`; in state 7 unless parked; shield 1000 and hull 100, recharged by nothing. */
function craftAt(state: WorldState, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}): CraftEntity {
  const craft = state.entities.allocate(stillEntityInit(kindBit, { position, orientation: IDENTITY, ...overrides })) as CraftEntity;
  if (craft.activity !== 'parked') craft.state = 'active';
  Object.assign(craft.combat, { shield: 1000, hull: 100, nextEnergyClock: 1e9 });
  return craft;
}

const guidanceOf = (overrides: Partial<MissileGuidance>): MissileGuidance => ({
  phase: 2, lifetimeClock: 1e6, armClock: 0, fuseRadiusSquared: FUSE_RADIUS_SQUARED, detonationClock: DETONATION_DELAY,
  checkInterval: CHECK_INTERVAL, nextCheckClock: 0, ...overrides,
});
const homingOf = (overrides: Partial<HomingState>): HomingState =>
  ({ period: 16, nextUpdateClock: 0, turnFraction: 1, speedFraction: 1, targetValid: true, targetDistance: 400, ...overrides });
const blockOf = (entity: { readonly movement: unknown }): SteeredMovementBlock => entity.movement as SteeredMovementBlock;

/** An axis word triple: neither cleared nor set; cleared and set to `value`; cleared only; set only. */
const UNCHANGED = { clear: false, set: false, value: 0 };
const turned = (value: number) => ({ clear: true, set: true, value });
const CLEARED = { clear: true, set: false, value: 0 };
const setTo = (value: number) => ({ clear: false, set: true, value });
/** `0x5cd1c`'s block for fractions (a, b) at the turn fraction `scale`. */
const steering = (scale: number, a: number, b: number): ControlBlock => ({ scale, axes: [turned(a), turned(b), CLEARED], speedFactor: null });
const steer = (entityId: number, control: ControlBlock): RequestOf<'steer'> => ({ type: 'steer', entityId, control });

/** The first RNG state from 1 whose next `count` rand values satisfy `predicate`: a fixed seed that makes the draws below known. */
function seedWhere(count: number, predicate: (values: readonly number[]) => boolean): number {
  for (let seed = 1; seed < 10_000; seed++) if (predicate(randValues(seed, count))) return seed;
  throw new Error('no seed');
}

describe('the first callback (0x2aa40, 0x2ab00)', () => {
  it('gives an unguided missile G with relative times and no contact, and asks for state 7 without a draw', () => {
    const state = world();
    const entity = missileAt(state, UNGUIDED, at(0, 0, 0), { contact: 5 });
    const rng = state.rngState;
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([{ type: 'set-state', entityId: entity.id, state: 'active' }]);
    expect(entity.combat.guidance).toEqual({
      phase: 0, lifetimeClock: LIFETIME, armClock: ARMING, fuseRadiusSquared: FUSE_RADIUS_SQUARED, detonationClock: DETONATION_DELAY,
      checkInterval: CHECK_INTERVAL, nextCheckClock: 0,
    });
    expect(entity.combat).toMatchObject({ contact: null, homing: null });
    expect(state.rngState).toBe(rng);
  });

  it('installs a homing missile\'s program and posts its mode-0 blocks as steer before asking for state 7', () => {
    const state = world();
    const target = craftAt(state, PLAIN, at(0, 0, 400));
    const entity = missileAt(state, HOMING, at(0, 0, 0), { target: target.id, launchByte: 2, contact: 5 });
    const rng = state.rngState;
    // Record 2, launch byte 2: turn fraction F(0.2), period 8 × 5. The still target dead ahead at 400 gives no lead and
    // fractions 0; 400 ≥ 250 puts the deadline at the clock + 40.
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([
      steer(entity.id, { scale: 0, axes: [UNCHANGED, UNCHANGED, UNCHANGED], speedFactor: 1 }),
      steer(entity.id, steering(f32(0.2), 0, 0)),
      { type: 'set-state', entityId: entity.id, state: 'active' },
    ]);
    expect(entity.combat.homing).toEqual({ period: 40, nextUpdateClock: CLOCK + 40, turnFraction: f32(0.2), speedFraction: 1, targetValid: true, targetDistance: 400 });
    expect(entity.combat.guidance?.phase).toBe(0);
    // CR-11 difference 6: a homing missile's contact starts empty as well.
    expect(entity.combat.contact).toBeNull();
    expect(state.rngState).toBe(rng);
  });

  it('installs the program without a control when the target no longer resolves', () => {
    const state = world();
    const target = craftAt(state, PLAIN, at(0, 0, 400));
    const entity = missileAt(state, HOMING, at(0, 0, 0), { target: target.id });
    state.entities.remove(target);
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([{ type: 'set-state', entityId: entity.id, state: 'active' }]);
    expect(entity.combat.homing).toEqual({ period: 8, nextUpdateClock: 0, turnFraction: 1, speedFraction: 1, targetValid: false, targetDistance: 0 });
  });

  it('draws the heat seeker\'s lock break in mode 0 from the world\'s RNG', () => {
    const state = world();
    state.rngState = seedWhere(1, ([value]) => value % 2 === 0);
    const seed = state.rngState;
    const target = craftAt(state, PLAIN, at(0, 0, -400));
    const entity = missileAt(state, HEAT_SEEKER, at(0, 0, 0), { target: target.id, launchByte: 4 });
    // Record 1, launch byte 4: turn fraction 1, period 16. The target behind gives angles π, so both fractions saturate
    // at 0.75; beyond 120 and not ahead, an even draw breaks the lock: rows 0.5, 0, 0.5 at full throttle, and the
    // deadline the clock + 4 periods.
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([
      steer(entity.id, { scale: 0, axes: [UNCHANGED, UNCHANGED, UNCHANGED], speedFactor: 1 }),
      steer(entity.id, steering(1, 0.75, 0.75)),
      steer(entity.id, { scale: 1, axes: [setTo(0.5), setTo(0), setTo(0.5)], speedFactor: 1 }),
      { type: 'set-state', entityId: entity.id, state: 'active' },
    ]);
    expect(entity.combat.homing?.nextUpdateClock).toBe(CLOCK + 64);
    expect(state.rngState).toBe(rngStateAfter(seed, 1));
  });

  it('makes G once: a repeated first callback only asks for state 7 again', () => {
    const state = world();
    const target = craftAt(state, PLAIN, at(0, 0, 400));
    const entity = missileAt(state, HOMING, at(0, 0, 0), { target: target.id });
    posted(state, (context) => updateMissile(context, entity, entity.combat));
    const { guidance, homing } = entity.combat;
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([{ type: 'set-state', entityId: entity.id, state: 'active' }]);
    expect(entity.combat.guidance).toBe(guidance);
    expect(entity.combat.homing).toBe(homing);
  });

  it('faults on a missile in state new, which only parked entities have', () => {
    const state = world();
    const entity = missileAt(state, UNGUIDED, at(0, 0, 0));
    entity.state = 'new';
    expectFault(() => updateMissile(contextOf(state), entity, entity.combat), 'invariant-violated', 'missiles.state');
  });
});

describe('the state-7 callback', () => {
  /** A missile in state 7 with `guidance`. */
  function flying(state: WorldState, record: number, position: Vec3, guidance: Partial<MissileGuidance>, combat: Partial<MissileCombat> = {}): MissileEntity {
    const entity = missileAt(state, record, position, { guidance: guidanceOf(guidance), ...combat });
    entity.state = 'active';
    return entity;
  }

  it('turns G\'s times into clocks in phase 0 and gives an unguided missile full throttle through 0x21fd8 at once', () => {
    const state = world();
    const entity = flying(state, UNGUIDED, at(0, 0, 0), { phase: 0, lifetimeClock: LIFETIME, armClock: ARMING });
    const rng = state.rngState;
    const before = structuredClone(blockOf(entity));
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([]);
    expect(entity.combat.guidance).toMatchObject({ phase: 1, lifetimeClock: CLOCK + LIFETIME, armClock: CLOCK + ARMING });
    // Scale 1, no axis, speed factor 1: the commanded speed is the maximum speed (+0x78) and the arrival flag clears.
    expect(blockOf(entity)).toEqual({ ...before, commandedSpeed: TEST_MAXIMUM_SPEED, atCommandedSpeed: false });
    expect(state.rngState).toBe(rng);
  });

  it('runs a due homing program in mode 1 and posts its steering, then advances the phase', () => {
    const state = world();
    const target = craftAt(state, PLAIN, at(0, 0, 200));
    const entity = flying(state, HOMING, at(0, 0, 0), { phase: 1, armClock: CLOCK - 1 }, { target: target.id, homing: homingOf({ period: 8, nextUpdateClock: CLOCK - 1 }) });
    // Mode 1 posts only the steering block. 150 ≤ 200 < 250: the deadline is (clock + period) SHR 1, behind the clock.
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([steer(entity.id, steering(1, 0, 0))]);
    expect(entity.combat.homing).toEqual(homingOf({ period: 8, nextUpdateClock: (CLOCK + 8) >> 1, targetDistance: 200 }));
    expect(entity.combat.guidance?.phase).toBe(2);
  });

  it('leaves a homing program that is not strictly due alone', () => {
    const state = world();
    const target = craftAt(state, PLAIN, at(0, 0, 200));
    const homing = homingOf({ nextUpdateClock: CLOCK });
    const entity = flying(state, HOMING, at(0, 0, 0), { phase: 1, armClock: CLOCK }, { target: target.id, homing: { ...homing } });
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([]);
    expect(entity.combat.homing).toEqual(homing);
  });

  it('posts nothing and keeps the deadline when a due program\'s target no longer resolves', () => {
    const state = world();
    const homing = homingOf({ nextUpdateClock: 0 });
    const entity = flying(state, HOMING, at(0, 0, 0), { phase: 1, armClock: CLOCK }, { target: 999, homing: { ...homing } });
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([]);
    expect(entity.combat.homing).toEqual(homing);
  });

  it('asks to fizzle once the lifetime is strictly over, before any fuse check, and stays in phase 2', () => {
    const state = world();
    craftAt(state, PLAIN, at(0, 0, 1));
    const entity = flying(state, UNGUIDED, at(0, 0, 0), { lifetimeClock: CLOCK - 1 }, { detonate: true });
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([{ type: 'expire', entityId: entity.id }]);
    expect(entity.combat.detonate).toBe(false);
    expect(entity.combat.guidance).toMatchObject({ phase: 2, nextCheckClock: 0 });
  });

  it('runs the proximity fuse on the positions as they are and re-arms it at half the interval in production', () => {
    expect(UNGUIDED_CHECK_INTERVAL).toBe('halved');
    const state = world();
    craftAt(state, PLAIN, at(0, 0, 3));
    const entity = flying(state, UNGUIDED, at(0, 0, 0), { nextCheckClock: CLOCK - 1 });
    // d² 9 < 16: detonation at the clock + 6; the next check at the clock + (9 SAR 1).
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([]);
    expect(entity.combat.guidance).toMatchObject({ phase: 3, detonationClock: CLOCK + DETONATION_DELAY, nextCheckClock: CLOCK + 4 });
  });

  it('re-arms an unguided missile\'s fuse at the whole interval with conflict 29\'s other value', () => {
    const state = world();
    const entity = flying(state, UNGUIDED, at(0, 0, 0), { nextCheckClock: CLOCK - 1 });
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat, 'full'))).toEqual([]);
    expect(entity.combat.guidance).toMatchObject({ phase: 2, nextCheckClock: CLOCK + CHECK_INTERVAL });
  });

  it('detonates at the callback after a contact', () => {
    const state = world();
    const craft = craftAt(state, BOXED, at(0, 0, 0));
    const entity = flying(state, UNGUIDED, at(0, 0, 1), { nextCheckClock: CLOCK - 1 });
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([]);
    expect(entity.combat.contact).toBe(craft.id);
    expect(entity.combat.guidance).toMatchObject({ phase: 3, detonationClock: 0 });
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([{ type: 'expire', entityId: entity.id }]);
    expect(entity.combat.detonate).toBe(true);
    expect(entity.combat.guidance?.phase).toBe(4);
  });
});

describe('the state-6 callback', () => {
  it('releases a homing program in mode 2, which posts its steering without a draw, then asks to leave', () => {
    const state = world();
    const target = craftAt(state, PLAIN, at(0, 0, -400));
    const entity = missileAt(state, HEAT_SEEKER, at(0, 0, 0), { target: target.id, guidance: guidanceOf({}), homing: homingOf({ nextUpdateClock: 1e6 }) });
    entity.state = 'pending-removal';
    const rng = state.rngState;
    // Far behind, the heat seeker would draw in modes 0 and 1; the deadline is the clock + 16 at 400.
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([
      steer(entity.id, steering(1, 0.75, 0.75)),
      { type: 'leave', entityId: entity.id },
    ]);
    expect(entity.combat.homing?.nextUpdateClock).toBe(CLOCK + 16);
    expect(state.rngState).toBe(rng);
  });

  it('only asks an unguided missile to leave', () => {
    const state = world();
    const entity = missileAt(state, UNGUIDED, at(0, 0, 0), { guidance: guidanceOf({}) });
    entity.state = 'pending-removal';
    expect(posted(state, (context) => updateMissile(context, entity, entity.combat))).toEqual([{ type: 'leave', entityId: entity.id }]);
  });
});

describe('the steer request', () => {
  it('sets the rows a block sets and clears the rows it only clears, through 0x21fd8 with the body record\'s rates', () => {
    const state = world();
    const entity = missileAt(state, HOMING, at(0, 0, 0));
    const block = blockOf(entity);
    Object.assign(block.steering.roll, { rate: 0.3, enabled: true });
    applySteer(contextOf(state), entity, steer(entity.id, steering(0.5, 0.25, -0.5)));
    // rate = F(craft rate × (−s) × value); roll is cleared: its flag goes, its rate stays; no speed change.
    expect(block.steering).toEqual({ pitch: { rate: -0.125, enabled: true }, yaw: { rate: 0.75, enabled: true }, roll: { rate: 0.3, enabled: false } });
    expect(block).toMatchObject({ commandedSpeed: 0, atCommandedSpeed: true });
  });

  it('sets the commanded speed from the speed factor and leaves rows without words alone', () => {
    const state = world();
    const entity = missileAt(state, HOMING, at(0, 0, 0));
    applySteer(contextOf(state), entity, steer(entity.id, { scale: 0, axes: [UNCHANGED, UNCHANGED, UNCHANGED], speedFactor: f32(0.65) }));
    expect(blockOf(entity)).toMatchObject({ commandedSpeed: f32(TEST_MAXIMUM_SPEED * f32(0.65)), atCommandedSpeed: false });
    expect(blockOf(entity).steering).toEqual({ pitch: { rate: 0, enabled: false }, yaw: { rate: 0, enabled: false }, roll: { rate: 0, enabled: false } });
  });

  it('changes nothing on a locked block', () => {
    const state = world();
    const entity = missileAt(state, HOMING, at(0, 0, 0));
    blockOf(entity).locked = true;
    const before = structuredClone(blockOf(entity));
    applySteer(contextOf(state), entity, steer(entity.id, { scale: 1, axes: [setTo(0.5), setTo(0), setTo(0.5)], speedFactor: 1 }));
    expect(blockOf(entity)).toEqual(before);
  });

  it('applies a block on an AI craft through 0x21fd8 with its craft record\'s rates and its maximum speed (CR-21)', () => {
    const state = world();
    const craft = craftAt(state, PLAIN, at(0, 0, 0));
    applySteer(contextOf(state), craft, steer(craft.id, { ...steering(0.5, 0.25, -0.5), speedFactor: 0.5 }));
    // The synthetic craft record's rates: +0xAC 0.75 (pitch), +0xB4 0.25 (yaw); the maximum TEST_MAXIMUM_SPEED.
    expect(blockOf(craft).steering).toEqual({ pitch: { rate: f32(-0.09375), enabled: true }, yaw: { rate: 0.0625, enabled: true }, roll: { rate: 0, enabled: false } });
    expect(blockOf(craft)).toMatchObject({ commandedSpeed: TEST_MAXIMUM_SPEED / 2, atCommandedSpeed: false });
  });

  it('changes nothing on a craft without a block or with a locked one', () => {
    const state = world();
    const parked = craftAt(state, PLAIN, at(0, 0, 0), { activity: 'parked', movement: null });
    applySteer(contextOf(state), parked, steer(parked.id, steering(1, 1, 1)));
    expect(parked.movement).toBe(null);
    const locked = craftAt(state, PLAIN, at(0, 0, 0));
    blockOf(locked).locked = true;
    const before = structuredClone(blockOf(locked));
    applySteer(contextOf(state), locked, steer(locked.id, { scale: 1, axes: [setTo(0.5), setTo(0), setTo(0.5)], speedFactor: 1 }));
    expect(blockOf(locked)).toEqual(before);
  });

  it('faults for an entity that is neither a missile nor a craft', () => {
    const state = world();
    const marker = state.entities.allocate(entityInit(25));
    expectFault(() => applySteer(contextOf(state), marker, steer(marker.id, steering(1, 0, 0))), 'invariant-violated', 'missiles.steer');
  });
});

describe('the expire request (0x2b408)', () => {
  const expire = (entity: MissileEntity) => (context: TickContext) => expireMissile(context, entity, entity.combat, { type: 'expire', entityId: entity.id });
  const ended = (context: TickContext, entity: MissileEntity, shooter: number | null, outcome: 'detonated' | 'fizzled') => ({
    type: 'missile-ended', tick: context.time.tick, entityId: entity.id, shooterEntityId: shooter, outcome, position: entity.position, orientation: IDENTITY,
  });

  it('fizzles: missile-ended, then pending removal with the shooter and the target let go, and no blast', () => {
    const state = world();
    const shooter = craftAt(state, PLAIN, at(1, 0, 0));
    const target = craftAt(state, PLAIN, at(0, 1, 0));
    const entity = missileAt(state, HOMING, at(0, 0, 0), { shooter: shooter.id, target: target.id, guidance: guidanceOf({}) });
    entity.state = 'active';
    const count = state.entities.size;
    const rng = state.rngState;
    const context = contextOf(state);
    expire(entity)(context);
    expect(context.events).toEqual([ended(context, entity, shooter.id, 'fizzled')]);
    expect(entity.state).toBe('pending-removal');
    expect(entity.combat).toMatchObject({ shooter: null, target: null });
    expect(state.entities.size).toBe(count);
    expect([shooter.combat.shield, target.combat.shield]).toEqual([1000, 1000]);
    expect(state.rngState).toBe(rng);
  });

  it('reports no shooter once the shooter no longer resolves', () => {
    const state = world();
    const shooter = craftAt(state, PLAIN, at(1, 0, 0));
    const entity = missileAt(state, UNGUIDED, at(0, 0, 0), { shooter: shooter.id, guidance: guidanceOf({}) });
    state.entities.remove(shooter);
    const context = contextOf(state);
    expire(entity)(context);
    expect(context.events).toEqual([ended(context, entity, null, 'fizzled')]);
  });

  it('detonates: missile-ended, the explosion, then every blast victim in walk order, the docked, the shooter and the player included', () => {
    const state = world();
    const player = addPlayerEntity(state, { position: at(0, 0, 7), orientation: IDENTITY }) as CraftEntity;
    player.state = 'active';
    Object.assign(player.combat, { shield: 1000, hull: 100, nextEnergyClock: 1e9 });
    const warping = craftAt(state, 1, at(0, 0, -1));
    warping.inWarp = true;
    const exempt = craftAt(state, EXEMPT, at(0, 9, 0));
    const contact = craftAt(state, BOXED, at(0, 0, 10));
    Object.assign(contact.combat, { shield: 0, hull: 10 });
    const shooter = craftAt(state, PLAIN, at(4, 0, 0));
    craftAt(state, PLAIN, at(-1, 0, 0)).state = 'presentation-ready';
    craftAt(state, PLAIN, at(0, 0, 20));
    const docked = craftAt(state, 9, at(0, -7, 0));
    docked.activity = 'docked';
    craftAt(state, 13, at(1, 0, 0), { activity: 'parked', movement: null });
    craftAt(state, 14, at(0, 1, 0)).destroyed = true;
    const entity = missileAt(state, UNGUIDED, at(0, 0, 0), { shooter: shooter.id, detonate: true, contact: contact.id, guidance: guidanceOf({ phase: 4 }) });
    entity.state = 'active';
    const context = contextOf(state);
    expire(entity)(context);

    // Damage 700 × (1 − (d − 2) ÷ 10), truncated: 350 at 7, 210 at 9, 560 at 4; the contact craft at 10 counts as 0, so 700.
    const attacker = { type: 'shooter', entityId: shooter.id, kindBit: PLAIN };
    const hit = (victim: CraftEntity, damage: number) => ({ type: 'hit', victimEntityId: victim.id, cause: 'missile', sourceEntityId: entity.id, attacker, damage, impact: null, projectile: null });
    expect(context.events).toMatchObject([
      ended(context, entity, shooter.id, 'detonated'),
      hit(player, 350),
      hit(exempt, 210),
      hit(contact, 700),
      { type: 'object-destroyed', entityId: contact.id, attacker },
      hit(shooter, 560),
      hit(docked, 350),
    ]);
    expect(context.events).toHaveLength(7);
    // The missile is the held source of its explosion; the destroyed contact craft, without parts, holds its own.
    const explosions = [...state.entities.walk(1 << 22)].map(({ combat }) => combat);
    expect(explosions).toMatchObject([{ source: entity.id, sourceKindBit: 20, heldSource: entity.id }, { source: contact.id, heldSource: contact.id }]);
    expect(entity.state).toBe('destroyed-source');
    expect(contact).toMatchObject({ state: 'destroyed-source', destroyed: true });
    // The shake's impulse along the missile's row 3, f32(80 × 0.0125), on every victim outside 0xf9c7c.
    const impulse = { direction: at(0, 0, 1), magnitude: 1 };
    expect([player, contact, shooter, docked].map((victim) => blockOf(victim).impulse)).toEqual([impulse, impulse, impulse, impulse]);
    expect(blockOf(exempt).impulse).toBeNull();
  });

  it('shakes a victim with six draws at this tick\'s mission time before 0x2a40c draws', () => {
    const state = world();
    // The seventh value is the damage entry's forced roll, which fails (low byte ≥ 0x32) and draws nothing more.
    state.rngState = seedWhere(7, (values) => (values[6] & 0xff) >= 0x32);
    const seed = state.rngState;
    const victim = craftAt(state, PLAIN, at(0, 0, 1));
    const entity = missileAt(state, UNGUIDED, at(0, 0, 0), { detonate: true, guidance: guidanceOf({ phase: 4 }) });
    expect(emitted(state, expire(entity))).toMatchObject([
      { type: 'missile-ended' },
      { type: 'hit', victimEntityId: victim.id, damage: DAMAGE, shield: { before: 1000, after: 300 }, hull: { before: 100, after: 100 } },
    ]);
    // u = 700 × 1/700 (f64 0x170f20): A = F(u), B = F(u × 5/7) (above the floor); per row two draws, rate F(r × C × (A
    // − B) + B) with C = F(1/32767), its sign and the decay's flipped by bit 1 of the second; end F(rate ÷ decay + t −
    // 0.5) with t = F(640 ÷ 64) = 10, active as it is after t.
    const u = DAMAGE * 0.0014285714285714286;
    const upper = f32(u);
    const lower = f32(u * 0.7142857142857143);
    const values = randValues(seed, 6);
    const rotation = (index: number) => {
      const sign = (values[2 * index + 1] & 2) === 0 ? 1 : -1;
      const rate = sign * f32(values[2 * index] * f32(1 / 32767) * (upper - lower) + lower);
      const decay = sign * f32(Math.PI / 8);
      return { rate, decay, end: f32(rate / decay + 10 - 0.5) };
    };
    expect(blockOf(victim).timedRotation).toEqual({ pitch: rotation(0), yaw: rotation(1), roll: rotation(2) });
    expect(blockOf(victim).impulse).toEqual({ direction: at(0, 0, 1), magnitude: 1 });
    expect(state.rngState).toBe(rngStateAfter(seed, 7));
  });

  it('leaves a victim of a kind in 0xf9c7c unshaken and draws only for its damage', () => {
    const state = world();
    // Without a shooter the attacker is the hostile mask 0x93780, so P3-10's 0x3c208 first draws the active kind-3
    // (0x87c) victim's face at its first speech (rand % 3, executable RX9 row 4), and stamps it; the missile's forced
    // roll then takes the second draw.
    state.rngState = seedWhere(2, ([, forced]) => (forced & 0xff) >= 0x32);
    const seed = state.rngState;
    const victim = craftAt(state, EXEMPT, at(0, 0, 1));
    const before = structuredClone(blockOf(victim));
    const entity = missileAt(state, UNGUIDED, at(0, 0, 0), { detonate: true, guidance: guidanceOf({ phase: 4 }) });
    expect(emitted(state, expire(entity))).toMatchObject([{ type: 'missile-ended' }, { type: 'hit', victimEntityId: victim.id, damage: DAMAGE }]);
    expect(blockOf(victim)).toEqual(before);
    expect(victim.communications.face).toBe(randValues(seed, 1)[0] % 3);
    expect(state.rngState).toBe(rngStateAfter(seed, 2));
  });
});
