import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import {
  EntityTable, type Entity, type EntityInit, type HomingState, type Matrix3, type MissileCombat, type MissileGuidance, type SteeredMovementBlock,
} from '../world/entity-table.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import type { CollisionShape, ShapeBox } from './collision-shapes.ts';
import {
  advanceGuidance, blastDamage, blastHits, blastShake, checkFuse, initialGuidance, initialHoming, invalidGuidanceField, isBlastVictim, isOwnerSide,
  type FuseScene, type MissileEntity, type UnguidedCheckInterval,
} from './guidance.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations derived by hand from H5 (docs/original/formats/executable.md) and the native arithmetic of 0x2b628
// recorded in P3-07/32's evidence, not by the functions under test.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const f32 = Math.fround;
const bitsOf = (mask: number): number[] => Array.from({ length: 32 }, (_, bit) => bit).filter((bit) => ((mask >>> bit) & 1) === 1);

const cube = (half: number): ShapeBox => ({ lower: at(-half, -half, -half), upper: at(half, half, half) });
function shapeOf(radiusSquared: number, boxes: readonly ShapeBox[], innerBox: ShapeBox | null = null): CollisionShape {
  return { radius: f32(Math.sqrt(radiusSquared)), radiusSquared, bounds: cube(100), boxes, innerBox };
}
/** r² 100 with one box, half-size 5. */
const BOXED = shapeOf(100, [cube(5)]);
/** r² 100, the sphere alone. */
const SPHERE = shapeOf(100, []);

function guidanceOf(overrides: Partial<MissileGuidance> = {}): MissileGuidance {
  return { phase: 2, lifetimeClock: 1000, armClock: 0, fuseRadiusSquared: 0, detonationClock: 30, checkInterval: 8, nextCheckClock: 0, ...overrides };
}

function missileIn(table: EntityTable, position: Vec3, combat: Partial<MissileCombat> = {}): MissileEntity {
  const full: MissileCombat = {
    type: 'missile', missile: 0, shooter: null, target: null, launchByte: 0, program: 'unguided', detonate: false, contact: null,
    guidance: guidanceOf(), homing: null, ...combat,
  };
  return table.allocate(entityInit(20, { position, orientation: IDENTITY, combat: full })) as MissileEntity;
}

/** A craft of `kindBit` at `position`, in state 7 unless parked. */
function craftIn(table: EntityTable, kindBit: number, position: Vec3, activity: EntityInit['activity'] = 'active'): Entity {
  const entity = table.allocate(entityInit(kindBit, { position, orientation: IDENTITY, activity }));
  if (activity !== 'parked') entity.state = 'active';
  return entity;
}

const scene = (entities: EntityTable, shape: CollisionShape = BOXED): FuseScene => ({ entities, shape: () => shape });
const homingState = (targetDistance: number): HomingState =>
  ({ period: 10, nextUpdateClock: 0, turnFraction: 1, speedFraction: 1, targetValid: true, targetDistance });

describe('the guidance block of the first callback', () => {
  it('copies +0x44, +0x48, +0x50, +0x54 and +0x58 as relative times, phase 0 and the next check 0', () => {
    expect(initialGuidance({ at44: 640, at48: 32, at54: 6, at58: -9 }, 2500)).toEqual({
      phase: 0, lifetimeClock: 640, armClock: 32, fuseRadiusSquared: 2500, detonationClock: 6, checkInterval: -9, nextCheckClock: 0,
    });
  });

  it.each([
    ['a negative lifetime', { at44: -1, at48: 0, at54: 0, at58: 0 }, 'at44'],
    ['a negative arming delay', { at44: 0, at48: -1, at54: 0, at58: 0 }, 'at48'],
    ['a negative detonation delay', { at44: 0, at48: 0, at54: -1, at58: 0 }, 'at54'],
    ['a fractional lifetime', { at44: 0.5, at48: 0, at54: 0, at58: 0 }, 'at44'],
    ['an interval beyond i32', { at44: 0, at48: 0, at54: 0, at58: 2 ** 31 }, 'at58'],
  ] as const)('faults on %s, the field world creation rejects (P3-07/24)', (_, record, field) => {
    expect(invalidGuidanceField(record)).toBe(field);
    expectFault(() => initialGuidance(record, 1), 'invariant-violated', 'guidance.record');
  });

  it('takes every record invalidGuidanceField accepts: zero times, the u32 and i32 bounds', () => {
    for (const record of [{ at44: 0, at48: 0, at54: 0, at58: -(2 ** 31) }, { at44: 2 ** 31 - 1, at48: 2 ** 31 - 1, at54: 2 ** 32 - 1, at58: 2 ** 31 - 1 }]) {
      expect(invalidGuidanceField(record)).toBeNull();
      expect(initialGuidance(record, 0)).toMatchObject({ lifetimeClock: record.at44, armClock: record.at48, detonationClock: record.at54, checkInterval: record.at58 });
    }
    // The fuse radius squared is the load transform's, which world creation checks on its own (CR-01 check 5).
    expectFault(() => initialGuidance({ at44: 0, at48: 0, at54: 0, at58: 0 }, Infinity), 'invariant-violated', 'guidance.record');
  });

  it('installs the controller and runs the program in mode 0, which posts nothing without a target', () => {
    const table = new EntityTable();
    const missile = missileIn(table, at(0, 0, 0), { program: 'homing' });
    const record = { at14: 12, at24: 30, at2C: 0.5 };
    const base = { program: 'homing', launchByte: 2, missile, clock: 100 } as const;
    expect(initialHoming(record, { ...base, target: null }, scriptedRand([]))).toEqual({
      homing: { period: 12, nextUpdateClock: 0, turnFraction: 1, speedFraction: 1, targetValid: false, targetDistance: 0 }, controls: [],
    });
    const target = craftIn(table, 7, at(0, 0, 400));
    const { homing, controls } = initialHoming(record, { ...base, target }, scriptedRand([]));
    expect(homing).toEqual({ period: 60, nextUpdateClock: 160, turnFraction: f32(0.2), speedFraction: 1, targetValid: true, targetDistance: 400 });
    expect(controls).toHaveLength(2);
  });
});

describe('the phases of 0x2ac10', () => {
  const advance = (missile: MissileEntity, table: EntityTable, clock: number, unguided: UnguidedCheckInterval = 'full') =>
    advanceGuidance(missile, scene(table), clock, unguided);

  it('turns the times into clocks in phase 0 and gives an unguided missile full throttle without a turn', () => {
    const table = new EntityTable();
    const missile = missileIn(table, at(0, 0, 0), { guidance: guidanceOf({ phase: 0, lifetimeClock: 100, armClock: 20, detonationClock: 6 }) });
    const unchanged = { clear: false, set: false, value: 0 };
    expect(advance(missile, table, 10)).toEqual({ type: 'control', control: { scale: 1, axes: [unchanged, unchanged, unchanged], speedFactor: 1 } });
    expect(missile.combat.guidance).toMatchObject({ phase: 1, lifetimeClock: 110, armClock: 30, detonationClock: 6 });
  });

  it('gives a homing missile no control in phase 0', () => {
    const table = new EntityTable();
    const missile = missileIn(table, at(0, 0, 0), { program: 'homing', homing: homingState(0), guidance: guidanceOf({ phase: 0 }) });
    expect(advance(missile, table, 10)).toEqual({ type: 'none' });
    expect(missile.combat.guidance?.phase).toBe(1);
  });

  it('arms strictly after the arming time, without checking the fuse in that call', () => {
    const table = new EntityTable();
    const missile = missileIn(table, at(0, 0, 0), { guidance: guidanceOf({ phase: 1, armClock: 50 }) });
    craftIn(table, 7, at(1, 1, 1));
    expect(advance(missile, table, 50)).toEqual({ type: 'none' });
    expect(missile.combat.guidance?.phase).toBe(1);
    expect(advance(missile, table, 52)).toEqual({ type: 'none' });
    expect(missile.combat.guidance).toMatchObject({ phase: 2, detonationClock: 30, nextCheckClock: 0 });
  });

  it('fizzles strictly after the lifetime, staying in phase 2 and skipping the fuse', () => {
    const table = new EntityTable();
    const missile = missileIn(table, at(0, 0, 0), { detonate: true, guidance: guidanceOf({ lifetimeClock: 100, nextCheckClock: 0 }) });
    craftIn(table, 7, at(1, 1, 1));
    expect(advance(missile, table, 102)).toEqual({ type: 'expire' });
    expect(missile.combat.detonate).toBe(false);
    expect(missile.combat.guidance).toMatchObject({ phase: 2, nextCheckClock: 0 });
    expect(missile.combat.contact).toBeNull();
  });

  it('checks the fuse strictly after the next check time and schedules the next by the interval', () => {
    const table = new EntityTable();
    const missile = missileIn(table, at(0, 0, 0), { guidance: guidanceOf({ lifetimeClock: 100, nextCheckClock: 40 }) });
    expect(advance(missile, table, 40)).toEqual({ type: 'none' });
    expect(missile.combat.guidance?.nextCheckClock).toBe(40);
    // At the lifetime itself the missile has not yet fizzled.
    expect(advance(missile, table, 100)).toEqual({ type: 'none' });
    expect(missile.combat.guidance?.nextCheckClock).toBe(108);
  });

  it.each([
    ['full', 8, 108],
    ['halved', 8, 104],
    ['full', 7, 107],
    ['halved', 7, 103],
    ['halved', -5, 97],
  ] as const)('gives an unguided missile with conflict 29 at %s and interval %i its next check at %i', (unguided, checkInterval, next) => {
    const table = new EntityTable();
    const missile = missileIn(table, at(0, 0, 0), { guidance: guidanceOf({ checkInterval }) });
    advance(missile, table, 100, unguided);
    expect(missile.combat.guidance?.nextCheckClock).toBe(next);
  });

  it.each([
    [150, 108],
    [f32(149.99), 104],
    [Number.NaN, 104],
  ])('halves a homing missile\'s interval by its controller distance %f, whatever conflict 29 says', (distance, next) => {
    for (const unguided of ['full', 'halved'] as const) {
      const table = new EntityTable();
      const missile = missileIn(table, at(0, 0, 0), { program: 'homing', homing: homingState(0), guidance: guidanceOf() });
      if (missile.combat.homing !== null) missile.combat.homing.targetDistance = distance;
      advance(missile, table, 100, unguided);
      expect(missile.combat.guidance?.nextCheckClock).toBe(next);
    }
  });

  it('detonates strictly after the detonation time and ends in phase 4', () => {
    const table = new EntityTable();
    const missile = missileIn(table, at(0, 0, 0), { guidance: guidanceOf({ phase: 3, detonationClock: 60 }) });
    expect(advance(missile, table, 60)).toEqual({ type: 'none' });
    expect(advance(missile, table, 62)).toEqual({ type: 'expire' });
    expect(missile.combat.detonate).toBe(true);
    expect(missile.combat.guidance?.phase).toBe(4);
    expect(advance(missile, table, 64)).toEqual({ type: 'none' });
  });

  it('faults without a guidance block, or on a homing program without its controller', () => {
    const table = new EntityTable();
    expectFault(() => advance(missileIn(table, at(0, 0, 0), { guidance: null }), table, 10), 'invariant-violated', 'guidance.guidance');
    expectFault(() => advance(missileIn(table, at(0, 0, 0), { program: 'homing' }), table, 10), 'invariant-violated', 'guidance.homing');
  });
});

describe('the contact fuse of 0x2adac', () => {
  it('fires on a point strictly inside a box within the radius: phase 3, detonation at once, the contact recorded', () => {
    const table = new EntityTable();
    const craft = craftIn(table, 7, at(10, 0, 0));
    const missile = missileIn(table, at(11, 1, 1));
    expect(checkFuse(missile, scene(table), 100)).toEqual({ type: 'contact', craft: craft.id });
    expect(missile.combat.guidance).toMatchObject({ phase: 3, detonationClock: 0 });
    expect(missile.combat.contact).toBe(craft.id);
  });

  it('needs the squared distance strictly below r²', () => {
    const table = new EntityTable();
    craftIn(table, 7, at(0, 0, 0));
    const missile = missileIn(table, at(1, 1, 1));
    expect(checkFuse(missile, scene(table, shapeOf(3, [cube(5)])), 100)).toBeNull();
    expect(checkFuse(missile, scene(table, shapeOf(f32(3 + 2 ** -22), [cube(5)])), 100)?.type).toBe('contact');
  });

  it('needs boxes, and a point strictly inside one', () => {
    const table = new EntityTable();
    craftIn(table, 7, at(0, 0, 0));
    expect(checkFuse(missileIn(table, at(1, 1, 1)), scene(table, SPHERE), 100)).toBeNull();
    expect(checkFuse(missileIn(table, at(5, 0, 0)), scene(table), 100)).toBeNull();
    expect(checkFuse(missileIn(table, at(6, 0, 0)), scene(table), 100)).toBeNull();
  });

  it('turns a point strictly inside the inner box over to the proximity fuse', () => {
    const table = new EntityTable();
    craftIn(table, 7, at(0, 0, 0));
    const missile = missileIn(table, at(1, 1, 1), { guidance: guidanceOf({ fuseRadiusSquared: 4 }) });
    expect(checkFuse(missile, scene(table, shapeOf(100, [cube(5)], cube(2))), 100)?.type).toBe('proximity');
    expect(missile.combat.contact).toBeNull();
  });

  it('does not exclude the launcher', () => {
    const table = new EntityTable();
    const launcher = craftIn(table, 0, at(0, 0, 0));
    const missile = missileIn(table, at(1, 0, 0), { shooter: launcher.id });
    expect(checkFuse(missile, scene(table), 100)).toEqual({ type: 'contact', craft: launcher.id });
  });
});

describe('the proximity fuse of 0x2adac', () => {
  it('fires strictly within the fuse radius: phase 3, the detonation delay counted from now, no contact', () => {
    const table = new EntityTable();
    const craft = craftIn(table, 7, at(0, 0, 0));
    const missile = missileIn(table, at(0, 0, 20), { guidance: guidanceOf({ fuseRadiusSquared: 400, detonationClock: 30 }) });
    expect(checkFuse(missile, scene(table, SPHERE), 100)).toBeNull();
    missile.combat.guidance = guidanceOf({ fuseRadiusSquared: f32(400.0001), detonationClock: 30 });
    expect(checkFuse(missile, scene(table, SPHERE), 100)).toEqual({ type: 'proximity', craft: craft.id });
    expect(missile.combat.guidance).toMatchObject({ phase: 3, detonationClock: 130 });
    expect(missile.combat.contact).toBeNull();
  });

  it('compares the squared distance after its f32 store', () => {
    // dx² = 1.0006881943814392 in double stores up to the f32 1.0006881952285767.
    const dx = 1 + 2886 * 2 ** -23;
    const stored = f32(dx * dx);
    expect(stored).toBeGreaterThan(dx * dx);
    const table = new EntityTable();
    craftIn(table, 7, at(0, 0, 0));
    const missile = missileIn(table, at(dx, 0, 0), { guidance: guidanceOf({ fuseRadiusSquared: stored }) });
    expect(checkFuse(missile, scene(table, SPHERE), 100)).toBeNull();
  });

  it('skips the owner\'s side by the kind masks, except the target', () => {
    const table = new EntityTable();
    const player = craftIn(table, 0, at(500, 0, 0));
    const wingman = craftIn(table, 2, at(0, 0, 3));
    const enemy = craftIn(table, 7, at(0, 0, 4));
    const missile = missileIn(table, at(0, 0, 0), { shooter: player.id, guidance: guidanceOf({ fuseRadiusSquared: 100 }) });
    expect(checkFuse(missile, scene(table, SPHERE), 100)).toEqual({ type: 'proximity', craft: enemy.id });
    missile.combat.guidance = guidanceOf({ fuseRadiusSquared: 100 });
    missile.combat.target = wingman.id;
    expect(checkFuse(missile, scene(table, SPHERE), 100)).toEqual({ type: 'proximity', craft: wingman.id });
  });

  it('takes the side masks 0x6c07f for a friendly owner (0x6c87f) and 0x93f80 for any other', () => {
    for (let owner = 0; owner < 20; owner++) {
      const friendly = [0, 1, 2, 3, 4, 5, 6, 11, 14, 15, 17, 18].includes(owner);
      const side = friendly ? [0, 1, 2, 3, 4, 5, 6, 14, 15, 17, 18] : [7, 8, 9, 10, 11, 12, 13, 16, 19];
      for (let craft = 0; craft < 20; craft++) expect(isOwnerSide(owner, craft)).toBe(side.includes(craft));
    }
    // So a launcher of kind 11 is not on its own side.
    expect(isOwnerSide(11, 11)).toBe(false);
  });

  it('does not skip any craft once the owner no longer resolves, and skips the whole side once the target is gone', () => {
    const table = new EntityTable();
    const wingman = craftIn(table, 2, at(0, 0, 3));
    const missile = missileIn(table, at(0, 0, 0), { shooter: 999, guidance: guidanceOf({ fuseRadiusSquared: 100 }) });
    expect(checkFuse(missile, scene(table, SPHERE), 100)).toEqual({ type: 'proximity', craft: wingman.id });
    const player = craftIn(table, 0, at(500, 0, 0));
    const other = missileIn(table, at(0, 0, 0), { shooter: player.id, target: 999, guidance: guidanceOf({ fuseRadiusSquared: 100 }) });
    expect(checkFuse(other, scene(table, SPHERE), 100)).toBeNull();
  });

  it.each([
    ['parked', (craft: Entity) => void (craft.activity = 'parked')],
    ['docked', (craft: Entity) => void (craft.activity = 'docked')],
    ['new', (craft: Entity) => void (craft.state = 'new')],
    ['destroyed', (craft: Entity) => void (craft.destroyed = true)],
    ['in Warp', (craft: Entity) => void (craft.inWarp = true)],
  ])('fires on a %s craft, as it filters nothing', (_, change) => {
    for (const shape of [BOXED, SPHERE]) {
      const table = new EntityTable();
      const craft = craftIn(table, 7, at(0, 0, 0));
      change(craft);
      const missile = missileIn(table, at(1, 0, 0), { guidance: guidanceOf({ fuseRadiusSquared: 100 }) });
      expect(checkFuse(missile, scene(table, shape), 100)).toEqual({ type: shape === BOXED ? 'contact' : 'proximity', craft: craft.id });
    }
  });

  it('stops at the first craft in walk order: kind bit, then allocation, not the nearest', () => {
    const table = new EntityTable();
    const far = craftIn(table, 9, at(0, 0, 9));
    craftIn(table, 9, at(0, 0, 1));
    craftIn(table, 12, at(0, 0, 0.5));
    const missile = missileIn(table, at(0, 0, 0), { guidance: guidanceOf({ fuseRadiusSquared: 100 }) });
    expect(checkFuse(missile, scene(table, SPHERE), 100)).toEqual({ type: 'proximity', craft: far.id });
  });

  it('faults outside phase 2', () => {
    const table = new EntityTable();
    expectFault(() => checkFuse(missileIn(table, at(0, 0, 0), { guidance: guidanceOf({ phase: 3 }) }), scene(table), 100), 'invariant-violated', 'guidance.fuse-phase');
  });
});

describe('the blast of 0x2b408', () => {
  const RECORD = { at5C: 100, at60: 10, at64: 50 };

  it('takes docked craft in state 7 or 8 that are neither destroyed nor in Warp', () => {
    const table = new EntityTable();
    const craft = craftIn(table, 7, at(0, 0, 0));
    expect(isBlastVictim(craft)).toBe(true);
    craft.state = 'projectile-hit';
    expect(isBlastVictim(craft)).toBe(true);
    craft.activity = 'docked';
    expect(isBlastVictim(craft)).toBe(true);
    for (const change of [
      (entity: Entity) => void (entity.activity = 'parked'),
      (entity: Entity) => void (entity.state = 'destroyed-source'),
      (entity: Entity) => void (entity.destroyed = true),
      (entity: Entity) => void (entity.inWarp = true),
    ]) {
      const other = craftIn(table, 7, at(0, 0, 0));
      change(other);
      expect(isBlastVictim(other)).toBe(false);
    }
  });

  it.each([
    [51, 0],
    [50, 0],
    [31, 47],
    [30, 50],
    [10, 100],
    [9, 100],
    [0, 100],
    [Number.NaN, 100],
  ])('deals D = 100 between r0 = 10 and r1 = 50 linearly, truncated: at %f, %i', (distance, damage) => {
    expect(blastDamage(RECORD, distance)).toBe(damage);
  });

  it('truncates toward zero and faults on 0 ÷ 0', () => {
    expect(blastDamage({ at5C: -100, at60: 10, at64: 50 }, 31)).toBe(-47);
    expectFault(() => blastDamage({ at5C: 100, at60: 10, at64: 10 }, 10), 'invariant-violated', 'guidance.blast');
  });

  it('damages every victim in range in walk order, the launcher included, and the contact craft at distance 0', () => {
    const table = new EntityTable();
    const launcher = craftIn(table, 0, at(0, 0, 30));
    const contact = craftIn(table, 7, at(0, 0, 1000));
    craftIn(table, 7, at(0, 0, 50));
    craftIn(table, 8, at(0, 0, 20), 'parked');
    const near = craftIn(table, 9, at(0, 0, 5));
    const missile = missileIn(table, at(0, 0, 0), { shooter: launcher.id, contact: contact.id });
    expect([...blastHits(missile, table, RECORD)].map(({ victim, damage }) => [victim.id, damage]))
      .toEqual([[launcher.id, 50], [contact.id, 100], [near.id, 100]]);
  });

  it('tests each victim when the walk reaches it, after the caller has applied the earlier hits', () => {
    const table = new EntityTable();
    craftIn(table, 7, at(0, 0, 1));
    const second = craftIn(table, 7, at(0, 0, 2));
    const missile = missileIn(table, at(0, 0, 0));
    const hit: number[] = [];
    for (const { victim } of blastHits(missile, table, RECORD)) {
      hit.push(victim.id);
      second.destroyed = true;
    }
    expect(hit).toHaveLength(1);
  });
});

describe('the blast shake 0x2b628', () => {
  /** Row 3 along +y. */
  const UPWARD = Object.freeze([1, 0, 0, 0, 0, -1, 0, 1, 0]) as unknown as Matrix3;
  const DECAY = f32(Math.PI / 8);

  function setup(kindBit = 7) {
    const table = new EntityTable();
    const victim = craftIn(table, kindBit, at(0, 0, 0));
    const missile = missileIn(table, at(0, 0, 1));
    missile.orientation = UPWARD;
    (missile.movement as SteeredMovementBlock).speed = 48;
    return { victim, block: victim.movement as SteeredMovementBlock, missile };
  }

  it('pushes the victim along the missile\'s row 3 and spins it on three rows with random signs (6 draws)', () => {
    const { victim, block, missile } = setup();
    const time = 10;
    // D = 700: the upper bound is 700 × 1/700 = 1 exactly, the lower f32(5/7).
    const lower = f32(0.7142857142857143);
    const draws = scriptedRand([0, 0, 32767, 2, 16384, 3]);
    blastShake(victim, block, missile, 700, time, draws);
    expect(draws.used).toBe(6);
    expect(block.impulse).toEqual({ direction: at(0, 1, 0), magnitude: f32(48 * 0.0125) });
    // 32767 × C = 1 − 2^−30, which stores at the upper bound; 16384 × C = 32769 / 65536.
    const rates = [lower, -1, -f32((32769 / 65536) * (1 - lower) + lower)];
    const decays = [DECAY, -DECAY, -DECAY];
    expect(block.timedRotation).toEqual({
      pitch: { rate: rates[0], decay: decays[0], end: f32(rates[0] / decays[0] + time - 0.5) },
      yaw: { rate: rates[1], decay: decays[1], end: f32(rates[1] / decays[1] + time - 0.5) },
      roll: { rate: rates[2], decay: decays[2], end: f32(rates[2] / decays[2] + time - 0.5) },
    });
  });

  it('still draws 6 times for a small blast, whose rates (at most about 5°/s, the floor) end before t: every rotation inactive', () => {
    const { victim, block, missile } = setup();
    block.timedRotation.yaw = { rate: 1, decay: 1, end: 100 };
    // D = 50: the lower bound 50/700 × 5/7 ≈ 0.051 is raised to f32(0.0872664638888889); rate ÷ (π/8) − 0.5 < 0.
    const floor = f32(0.0872664638888889);
    expect(floor).toBe(0.0872664675116539);
    const draws = scriptedRand([0, 0, 0, 2, 32767, 0]);
    blastShake(victim, block, missile, 50, 10, draws);
    expect(draws.used).toBe(6);
    expect(block.timedRotation).toEqual({ pitch: null, yaw: null, roll: null });
    expect(f32(floor / DECAY + 10 - 0.5)).toBeLessThan(10);
    expect(block.impulse?.magnitude).toBe(f32(0.6));
  });

  it('leaves the kinds of 0xf9c7c alone without drawing', () => {
    expect(bitsOf(0xf9c7c)).toEqual([2, 3, 4, 5, 6, 10, 11, 12, 15, 16, 17, 18, 19]);
    for (let kindBit = 0; kindBit < 20; kindBit++) {
      const { victim, block, missile } = setup(kindBit);
      const exempt = bitsOf(0xf9c7c).includes(kindBit);
      const draws = scriptedRand([1, 1, 1, 1, 1, 1]);
      blastShake(victim, block, missile, 700, 10, draws);
      expect(draws.used).toBe(exempt ? 0 : 6);
      expect(block.impulse === null).toBe(exempt);
    }
  });
});
