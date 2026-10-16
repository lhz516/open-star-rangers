import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { ControlBlock } from '../systems/pipeline.ts';
import {
  clearedControllerCommon, EntityTable, type ControllerLimits, type Entity, type EntityId, type HomingState, type Matrix3, type SteeredMovementBlock,
  type SteeringBlock,
} from '../world/entity-table.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import { RAND_SCALE } from './original-random.ts';
import { scriptedRand } from './rand.test-support.ts';
import {
  approachRadius, clearTargetOffset, computeSteering, homingDeadline, installHoming, isAhead, isHomingUpdateDue, leadTargetPoint, programRecord,
  rateControl, runHomingProgram, setLeadMode, setSizeClass, setSteeringFractions, setSteeringNoise, setTargetOffset, steerAtPoint, steerAtTarget,
  steeringControl, steeringFractions, steeringLimits, steeringNoise, throttleControl, throttleNoise, updateTargetPoint, vectorDistance,
  type AiSteeringScene, type HomingCall, type SteeringLimits,
} from './steering.ts';

// Expectations derived by hand from H5 (docs/original/formats/executable.md) and the native arithmetic recorded in
// P3-07/32's evidence (the f64 degree constants 3.1415927 and 0.005555555555555555, the f32 lead offset, the compare
// precision of the fractions, the words of each control block), not by the functions under test.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
/** Rows 1 and 3 negated: its row 3 points along −z. */
const REVERSED = Object.freeze([-1, 0, 0, 0, 1, 0, 0, 0, -1]) as unknown as Matrix3;
/** Rows (0, 1, 0), (−1, 0, 0), (0, 0, 1). */
const TURNED = Object.freeze([0, 1, 0, -1, 0, 0, 0, 0, 1]) as unknown as Matrix3;
const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const f32 = Math.fround;

/** An entity of `kindBit` at `position` with `orientation`; `speed` is its block's speed, or null for no block. */
function body(table: EntityTable, kindBit: number, position: Vec3, speed: number | null, orientation: Matrix3 = IDENTITY): Entity {
  const entity = table.allocate(entityInit(kindBit, { position, orientation }));
  if (speed === null) entity.movement = null;
  else (entity.movement as SteeredMovementBlock).speed = speed;
  return entity;
}

const unchanged = { clear: false, set: false, value: 0 };
const steering = (scale: number, pitch: number, yaw: number) => ({
  scale, axes: [{ clear: true, set: true, value: pitch }, { clear: true, set: true, value: yaw }, { clear: true, set: false, value: 0 }], speedFactor: null,
});
const throttleOnly = (speedFactor: number) => ({ scale: 0, axes: [unchanged, unchanged, unchanged], speedFactor });
const lockBreak = (scale: number) => ({
  scale, axes: [{ clear: false, set: true, value: 0.5 }, { clear: false, set: true, value: 0 }, { clear: false, set: true, value: 0.5 }], speedFactor: 1,
});

describe('the program record and the controller install (0x2ab00, 0x5dc0c)', () => {
  it('installs record 1 for the heat seeker and record 2 for the other homing program', () => {
    expect([programRecord('heat-seeker'), programRecord('homing')]).toEqual([1, 2]);
  });

  it('keeps the period of +0x14 and zeroes the rest but the fractions 0x5c768(1, 1, 0) sets', () => {
    expect(installHoming({ at14: 21, at24: 30, at2C: 0.5 })).toEqual({
      period: 21, nextUpdateClock: 0, turnFraction: 1, speedFraction: 1, targetValid: false, targetDistance: 0,
    });
    expectFault(() => installHoming({ at14: -1, at24: 30, at2C: 0.5 }), 'invariant-violated', 'steering.period');
  });

  it('derives the angle limits with the image\'s f64 constants, not with π and 1/180', () => {
    // 5° is the first whole degree where the two differ.
    const upper = f32(5 * 3.1415927 * 0.005555555555555555);
    expect(upper).not.toBe(f32((5 * Math.PI) / 180));
    expect(steeringLimits({ at14: 0, at24: 5, at2C: 0.75 })).toEqual({ lower: -upper, upper, low: -0.75, high: 0.75 });
  });
});

describe('the distance 0x56b14', () => {
  it('is the f32 square root of the squared distance, in either order', () => {
    expect(vectorDistance(at(0, 0, 0), at(3, 4, 12))).toBe(13);
    expect(vectorDistance(at(3, 4, 12), at(0, 0, 0))).toBe(13);
    expect(vectorDistance(at(1, 1, 0), at(0, 0, 0))).toBe(f32(Math.SQRT2));
  });
});

describe('the target point 0x5c8b0 in lead mode 3', () => {
  it('aims at a still target\'s position, the distance measured to it', () => {
    const table = new EntityTable();
    const missile = body(table, 20, at(0, 0, 0), 50);
    const target = body(table, 7, at(0, 30, 40), null);
    expect(leadTargetPoint(missile, target)).toEqual({ point: at(0, 30, 40), distance: 50, local: at(0, 30, 40) });
  });

  it('leads a moving target along its row 3 by (d ÷ v) × w and keeps the distance to its position', () => {
    const table = new EntityTable();
    const missile = body(table, 20, at(0, 0, 0), 50, TURNED);
    // Row 3 along +x; the lead is (100 ÷ 50) × 20 = 40.
    const target = body(table, 7, at(0, 0, 100), 20, Object.freeze([0, 0, -1, 0, 1, 0, 1, 0, 0]) as unknown as Matrix3);
    // In the missile's frame: row 1 (0, 1, 0) gives 0, row 2 (−1, 0, 0) gives −40, row 3 gives 100.
    expect(leadTargetPoint(missile, target)).toEqual({ point: at(40, 0, 100), distance: 100, local: at(0, -40, 100) });
  });

  it('does not lead when the missile\'s speed is ±0, or without a block', () => {
    const table = new EntityTable();
    const target = body(table, 7, at(0, 0, 100), 20, Object.freeze([0, 0, -1, 0, 1, 0, 1, 0, 0]) as unknown as Matrix3);
    for (const speed of [0, -0, null]) {
      expect(leadTargetPoint(body(table, 20, at(0, 0, 0), speed), target).point).toEqual(at(0, 0, 100));
    }
  });

  it('stores the offset R3 × lead as f32 before adding it to the position', () => {
    const table = new EntityTable();
    const r = 1 + 2 ** -23;
    // d = 8, v = 8, w = r: the lead is r, and r × r = 1 + 2^−22 + 2^−46 stores as 1 + 2^−22. Then 3 + (1 + 2^−22) is
    // halfway between the f32 neighbours 4 and 4 + 2^−21 and rounds to even, 4; without the store it would round up.
    const missile = body(table, 20, at(3, 0, -8), 8);
    const target = body(table, 7, at(3, 0, 0), r, Object.freeze([0, 1, 0, 0, 0, 1, r, 0, 0]) as unknown as Matrix3);
    expect(f32(3 + r * r)).toBe(4 + 2 ** -21);
    expect(leadTargetPoint(missile, target).point).toEqual(at(4, 0, 0));
  });

  it('flags a point ahead when its local z is above 0 or unordered', () => {
    expect([1, 0, -0, -1, Number.NaN].map((z) => isAhead(at(0, 0, z)))).toEqual([true, false, false, false, true]);
  });
});

describe('the fractions of 0x5cd1c', () => {
  const limits = steeringLimits({ at14: 0, at24: 60, at2C: 0.5 });

  it('gives 0 straight ahead and angle ÷ 2a inside the limits, row 1 from y and row 2 from x', () => {
    expect(steeringFractions(at(0, 0, 10), limits)).toEqual([0, 0]);
    // atan2(1, 1) = π/4 is inside a ≈ π/3.
    const quarter = f32(f32(Math.PI / 4) / (limits.upper - limits.lower));
    expect(steeringFractions(at(0, 1, 1), limits)).toEqual([quarter, 0]);
    expect(steeringFractions(at(-1, 0, 1), limits)).toEqual([0, -quarter]);
  });

  it('saturates beyond the limits and behind, by the sign of the other component', () => {
    expect(steeringFractions(at(10, 10, 1), limits)).toEqual([0.5, 0.5]);
    expect(steeringFractions(at(-10, -10, 1), limits)).toEqual([-0.5, -0.5]);
    // atan2(±0, −1) = ±π.
    expect(steeringFractions(at(0, 0, -1), limits)).toEqual([0.5, 0.5]);
    expect(steeringFractions(at(-0, -0, -1), limits)).toEqual([-0.5, -0.5]);
  });

  it('gives +s for row 1 and −s for row 2 when the local z is ±0', () => {
    for (const z of [0, -0]) expect(steeringFractions(at(-3, -3, z), limits)).toEqual([0.5, -0.5]);
  });

  it('compares the double angle with −a but its f32 store with +a', () => {
    // θ = atan2(3, 1) stores below its double value; with a = f32(θ), +θ is not beyond a, while −θ is beyond −a.
    const theta = Math.atan2(3, 1);
    expect(f32(theta)).toBeLessThan(theta);
    const edge: SteeringLimits = { lower: -f32(theta), upper: f32(theta), low: -0.25, high: 0.25 };
    expect(steeringFractions(at(0, 3, 1), edge)).toEqual([0.5, 0]);
    expect(steeringFractions(at(0, -3, 1), edge)).toEqual([-0.25, 0]);
  });

  it('faults on 0 ÷ 0 when the limit angle is 0', () => {
    expectFault(() => steeringFractions(at(0, 0, 1), steeringLimits({ at14: 0, at24: 0, at2C: 0.5 })), 'invariant-violated', 'steering.result');
  });
});

describe('the control blocks', () => {
  it('steers rows 1 and 2, clears row 3 and leaves the speed (0x5cd1c, 0x5d014)', () => {
    expect(steeringControl(f32(0.65), [0.25, -0.5])).toEqual(steering(f32(0.65), 0.25, -0.5));
  });

  it('sets only the speed in the throttle block, scale 0 (0x5d41c)', () => {
    expect(throttleControl(1, 1)).toEqual(throttleOnly(1));
    expect(throttleControl(0.5, f32(0.65))).toEqual(throttleOnly(f32(0.5 * f32(0.65))));
  });

  it('sets the three rows without clearing them in 0x5d0ec, and the speed unless the throttle is negative', () => {
    expect(rateControl(1, 1, [0.5, 0, 0.5], 1)).toEqual(lockBreak(1));
    expect(rateControl(1, 1, [0.5, 0, 0.5], -1).speedFactor).toBeNull();
    expect(rateControl(1, 1, [0.5, 0, 0.5], 0).speedFactor).toBe(0);
  });
});

describe('the schedule (0x5dcd4) and the deadline of 0x60b84', () => {
  const state = (nextUpdateClock: number): HomingState => ({ ...installHoming({ at14: 4, at24: 30, at2C: 0.5 }), nextUpdateClock });

  it('runs an update only once the clock is strictly past the deadline', () => {
    expect([99, 100, 101].map((clock) => isHomingUpdateDue(state(100), clock))).toEqual([false, false, true]);
  });

  it('waits a period from 250 on, and shifts the sum clock + period right by 1 below 250 and by 2 below 150', () => {
    expect(homingDeadline(101, 10, 1000)).toBe(111);
    expect(homingDeadline(101, 10, 250)).toBe(111);
    expect(homingDeadline(101, 10, f32(249.99))).toBe(55);
    expect(homingDeadline(101, 10, 150)).toBe(55);
    expect(homingDeadline(101, 10, f32(149.99))).toBe(27);
    expect(homingDeadline(101, 10, 0)).toBe(27);
    expect(homingDeadline(101, 10, Number.NaN)).toBe(27);
  });
});

describe('the missile programs 0x60b84 and 0x60aa0', () => {
  const RECORD = { at14: 10, at24: 60, at2C: 0.5 };
  const CLOCK = 1000;

  function setup(targetPosition: Vec3 | null, targetOrientation: Matrix3 = IDENTITY) {
    const table = new EntityTable();
    const missile = body(table, 20, at(0, 0, 0), 0);
    const target = targetPosition === null ? null : body(table, 7, targetPosition, null, targetOrientation);
    return { missile, target };
  }
  const call = (overrides: Partial<HomingCall> & Pick<HomingCall, 'missile' | 'target'>): HomingCall =>
    ({ program: 'homing', launchByte: 4, mode: 0, clock: CLOCK, ...overrides });

  it('does nothing without a target: no block, no draw, the controller as it was', () => {
    const state = installHoming(RECORD);
    const before = { ...state };
    for (const mode of [0, 1, 2] as const) {
      expect(runHomingProgram(state, RECORD, call({ ...setup(null), program: 'heat-seeker', mode }), scriptedRand([]))).toEqual([]);
    }
    expect(state).toEqual(before);
  });

  it('acquires the target at install, posts the throttle block then the steering block and sets the deadline', () => {
    const state = installHoming(RECORD);
    const controls = runHomingProgram(state, RECORD, call(setup(at(0, 0, 200))), scriptedRand([]));
    expect(controls).toEqual([throttleOnly(1), steering(1, 0, 0)]);
    // 200 is below 250: (1000 + 10) shifted right by 1.
    expect(state).toEqual({ period: 10, nextUpdateClock: 505, turnFraction: 1, speedFraction: 1, targetValid: true, targetDistance: 200 });
  });

  it.each([
    [4, 1, 10],
    [3, f32(0.65), 20],
    [2, f32(0.2), 50],
    [1, f32(0.2), 50],
    [0, f32(0.2), 50],
  ] as const)('gives launch byte %i the turn fraction %f and the period %i', (launchByte, turnFraction, period) => {
    const state = installHoming(RECORD);
    const controls = runHomingProgram(state, RECORD, call({ ...setup(at(0, 0, 300)), launchByte }), scriptedRand([]));
    expect(controls).toEqual([throttleOnly(1), steering(turnFraction, 0, 0)]);
    expect(state).toMatchObject({ period, turnFraction, nextUpdateClock: CLOCK + period });
  });

  it('only steers in an update and at release, with the period as installed', () => {
    for (const mode of [1, 2] as const) {
      const state = installHoming(RECORD);
      runHomingProgram(state, RECORD, call({ ...setup(at(0, 0, 300)), launchByte: 3 }), scriptedRand([]));
      const { missile, target } = setup(at(0, 0, 100));
      expect(runHomingProgram(state, RECORD, call({ missile, target, mode, clock: 2000 }), scriptedRand([]))).toEqual([steering(f32(0.65), 0, 0)]);
      expect(state).toMatchObject({ period: 20, targetDistance: 100, nextUpdateClock: (2000 + 20) / 4 });
    }
  });

  it('faults on an update whose install found no target', () => {
    expectFault(() => runHomingProgram(installHoming(RECORD), RECORD, call({ ...setup(at(0, 0, 100)), mode: 1 }), scriptedRand([])), 'invariant-violated', 'steering.target');
  });

  it('lets the heat seeker break its lock on an even draw when the target is far and behind', () => {
    const state = installHoming(RECORD);
    // Behind: local (+0, +0, −200) gives atan2(+0, −200) = π on both rows.
    const controls = runHomingProgram(state, RECORD, call({ ...setup(at(0, 0, -200)), program: 'heat-seeker' }), scriptedRand([4]));
    expect(controls).toEqual([throttleOnly(1), steering(1, 0.5, 0.5), lockBreak(1)]);
    expect(state.nextUpdateClock).toBe(CLOCK + 4 * 10);
  });

  it('keeps the lock on an odd draw, with the deadline from the distance', () => {
    const state = installHoming(RECORD);
    const controls = runHomingProgram(state, RECORD, call({ ...setup(at(0, 0, -200)), program: 'heat-seeker' }), scriptedRand([1]));
    expect(controls).toEqual([throttleOnly(1), steering(1, 0.5, 0.5)]);
    expect(state.nextUpdateClock).toBe(505);
  });

  it('draws when the two row-3 vectors point apart even with the target ahead, and in updates too', () => {
    const state = installHoming(RECORD);
    const draws = scriptedRand([7, 6]);
    runHomingProgram(state, RECORD, call({ ...setup(at(0, 0, 200), REVERSED), program: 'heat-seeker' }), draws);
    const controls = runHomingProgram(state, RECORD, call({ ...setup(at(0, 0, 200), REVERSED), program: 'heat-seeker', mode: 1, clock: 2000 }), draws);
    expect(draws.used).toBe(2);
    expect(controls).toEqual([steering(1, 0, 0), lockBreak(1)]);
    expect(state.nextUpdateClock).toBe(2040);
  });

  it.each([
    ['at distance 120 or nearer', at(0, 0, -120), IDENTITY, 'heat-seeker', 0],
    ['ahead with the row-3 vectors aligned', at(0, 0, 200), IDENTITY, 'heat-seeker', 0],
    ['at release', at(0, 0, -200), IDENTITY, 'heat-seeker', 2],
    ['for the other homing program', at(0, 0, -200), REVERSED, 'homing', 0],
  ] as const)('does not draw %s', (_, position, orientation, program, mode) => {
    const state = installHoming(RECORD);
    if (mode !== 0) runHomingProgram(state, RECORD, call({ ...setup(at(0, 0, 300)) }), scriptedRand([]));
    expect(() => runHomingProgram(state, RECORD, call({ ...setup(position, orientation), program, mode }), scriptedRand([]))).not.toThrow();
  });
});

// The AI library (P3-08/17): expectations from executable A1–A7 and the native instruction order recorded in subtask 17's
// evidence (the per-class radii of 0x5dab0, the store points of 0x5c8b0, the operand order of the roll-match value).

/** The AI's craft record: turn rates +0xAC 0.75 (pitch), +0xB4 0.25 (yaw), +0xB0 0.5 (roll); maximum +0xB8 48. */
const CRAFT = Object.freeze({ atAC: 0.75, atB0: 0.5, atB4: 0.25, atB8: 48 });
/** a = 1.0 rad, the cone b = 0.5 rad, saturation 0.75, roll-match threshold 0.9. */
const LIMITS: ControllerLimits = Object.freeze({ turn: 1, speed: 0.5, saturation: 0.75, rollMatchThreshold: f32(0.9) });
const SAMPLE = 320;
/** Every target's record +0x10. */
const TARGET_RADIUS = 2.5;
/** The gun of the subject's current list-0 mount. */
const GUN_SPEED = 200;

interface Pilot {
  readonly table: EntityTable;
  readonly subject: Entity;
  readonly block: SteeringBlock;
  readonly scene: AiSteeringScene;
}

/** An AI craft at the origin, unturned, with a fresh block (0x5c530: size class 2, 0x5c768(1.0, 1.0, 0)) at SAMPLE. */
function pilot(overrides: Partial<AiSteeringScene> = {}): Pilot {
  const table = new EntityTable();
  const subject = body(table, 2, at(0, 0, 0), 10);
  const block = clearedControllerCommon().steering;
  block.sizeClass = 2;
  setSteeringFractions(block, CRAFT, 1, 1, false);
  const scene: AiSteeringScene = {
    subject, craft: CRAFT, limits: LIMITS, clock: SAMPLE, resolve: (id: EntityId) => table.get(id), targetRadius: () => TARGET_RADIUS,
    mainWeaponSpeed: () => GUN_SPEED, ...overrides,
  };
  return { table, subject, block, scene };
}

/** `subject` aims at a new craft at `position` through 0x5c584 and the cache is clear. */
function aimed({ table, block, scene }: Pilot, position: Vec3, speed: number | null = 20, orientation: Matrix3 = IDENTITY): Entity {
  const target = body(table, 7, position, speed, orientation);
  expect(steerAtTarget(block, scene, target.id)).toBe(true);
  return target;
}

describe('the AI setters (0x5c768, 0x5c7e8, 0x5c878)', () => {
  it('sets both fractions, roll matching and the limits they scale', () => {
    const { block } = pilot();
    setSteeringFractions(block, CRAFT, f32(0.65), 0.5, true);
    const speed = 48 * f32(0.65);
    expect(block).toMatchObject({
      speedFraction: f32(0.65), turnFraction: 0.5, rollMatch: true, speedLimit: f32(speed), halfSpeedLimit: f32(speed * 0.5),
      turnRates: [0.375, 0.125, 0.25],
    });
    setSteeringFractions(block, CRAFT, 1, 1, false);
    expect(block).toMatchObject({ rollMatch: false, speedLimit: 48, halfSpeedLimit: 24, turnRates: [0.75, 0.25, 0.5] });
    expectFault(() => setSteeringFractions(block, CRAFT, 0.1, 1, false), 'invariant-violated', 'steering.argument');
  });

  it('enables a noise routine with bounds −v and v above 0 and otherwise disables it, leaving its bounds', () => {
    const { block } = pilot();
    setSteeringNoise(block, 0.25, 0);
    expect([block.throttleNoise, block.steeringNoise]).toEqual([{ enabled: true, low: -0.25, high: 0.25 }, { enabled: false, low: 0, high: 0 }]);
    setSteeringNoise(block, -1, 0.5);
    expect([block.throttleNoise, block.steeringNoise]).toEqual([{ enabled: false, low: -0.25, high: 0.25 }, { enabled: true, low: -0.5, high: 0.5 }]);
  });

  it('takes the lead constant as given for modes 1 and 3, as the period ÷ 64 for 2 and 5, and keeps it otherwise', () => {
    const { block } = pilot();
    setLeadMode(block, 1, f32(0.3), 7);
    expect([block.leadMode, block.leadConstant]).toEqual([1, f32(0.3)]);
    setLeadMode(block, 2, 9, 32);
    expect([block.leadMode, block.leadConstant]).toEqual([2, 0.5]);
    setLeadMode(block, 4, 9, 64);
    expect([block.leadMode, block.leadConstant]).toEqual([4, 0.5]);
    setLeadMode(block, 5, 0, 0);
    expect([block.leadMode, block.leadConstant]).toEqual([5, 0]);
    setLeadMode(block, 0, 9, 9);
    expect([block.leadMode, block.leadConstant]).toEqual([0, 0]);
    expectFault(() => setLeadMode(block, 256, 0, 0), 'invariant-violated', 'steering.lead-mode');
  });
});

describe('the approach radius (0x5dab0, 0x5c73c)', () => {
  it('is fixed per class without a target and the target record\'s +0x10 plus a margin with one; class 3 is the default', () => {
    expect([0, 1, 2, 3, 4, 5, 255].map((sizeClass) => approachRadius(sizeClass, null))).toEqual([1, 10, 30, 60, 375, 60, 60]);
    expect([0, 1, 2, 3, 4, 9].map((sizeClass) => approachRadius(sizeClass, TARGET_RADIUS))).toEqual([12.5, 32.5, 82.5, 152.5, 277.5, 152.5]);
    expect(approachRadius(2, f32(0.1))).toBe(f32(f32(0.1) + 80));
  });

  it('re-derives the radius for S+0x10 only while it resolves', () => {
    const scene = pilot();
    const target = aimed(scene, at(0, 0, 50));
    setSizeClass(scene.block, scene.scene, 4);
    expect([scene.block.sizeClass, scene.block.approachRadius]).toEqual([4, 277.5]);
    scene.table.remove(target);
    setSizeClass(scene.block, scene.scene, 1);
    expect([scene.block.sizeClass, scene.block.approachRadius]).toEqual([1, 10]);
  });
});

describe('aiming (0x5c584, 0x5c658)', () => {
  it('aims at a valid target: S+0x10, the subject\'s +0x8C, the point, the offset off, the distance, the radius and lock level 0', () => {
    const { table, subject, block, scene } = pilot();
    if (subject.combat.type !== 'craft') throw new Error('craft');
    subject.combat.weapons.lock.level = 3;
    setTargetOffset(block, 1, at(1, 2, 3));
    const target = body(table, 7, at(3, 4, 0), 20);
    expect(steerAtTarget(block, scene, target.id)).toBe(true);
    expect(block).toMatchObject({
      targetValid: true, target: target.id, point: at(3, 4, 0), offset: { enabled: false, frame: 1, vector: at(1, 2, 3) }, distance: 5, approachRadius: 82.5,
    });
    expect([subject.ai.objectTarget, subject.combat.weapons.lock.level]).toEqual([target.id, 0]);
  });

  it('does nothing for the handle S+0x10 already holds, even when the subject\'s +0x8C moved on', () => {
    const scene = pilot();
    const target = aimed(scene, at(0, 0, 10));
    scene.subject.ai.objectTarget = null;
    scene.block.distance = 99;
    expect(steerAtTarget(scene.block, scene.scene, target.id)).toBe(true);
    expect([scene.block.distance, scene.subject.ai.objectTarget]).toEqual([99, null]);
  });

  it('marks an invalid target invalid and writes nothing else; a null one clears +0x8C and S+0x0C but keeps S+0x10', () => {
    const scene = pilot();
    const target = aimed(scene, at(0, 0, 10));
    expect(steerAtTarget(scene.block, scene.scene, 99)).toBe(false);
    expect([scene.block.targetValid, scene.block.target, scene.subject.ai.objectTarget]).toEqual([false, target.id, target.id]);
    expect(steerAtTarget(scene.block, scene.scene, null)).toBe(true);
    expect([scene.block.targetValid, scene.block.target, scene.subject.ai.objectTarget]).toEqual([false, target.id, null]);
  });

  it('steers at a point without a target', () => {
    const scene = pilot();
    aimed(scene, at(0, 0, 10));
    steerAtPoint(scene.block, scene.scene, at(0, 6, 8));
    expect(scene.block).toMatchObject({ targetValid: true, target: null, point: at(0, 6, 8), distance: 10, approachRadius: 30 });
    expect(scene.subject.ai.objectTarget).toBe(null);
  });
});

describe('the target point (0x5c8b0)', () => {
  it('runs once per sample', () => {
    const scene = pilot();
    const target = aimed(scene, at(0, 0, 10));
    scene.block.targetSample = SAMPLE;
    target.position = at(0, 0, 20);
    expect(updateTargetPoint(scene.block, scene.scene)).toBe(true);
    expect(scene.block.point).toEqual(at(0, 0, 10));
  });

  it('follows the subject\'s +0x8C, and without a valid one clears S+0x10 and +0x8C', () => {
    const scene = pilot();
    aimed(scene, at(0, 0, 10));
    const other = body(scene.table, 8, at(-3, 0, 4), 0);
    scene.subject.ai.objectTarget = other.id;
    expect(updateTargetPoint(scene.block, scene.scene)).toBe(true);
    expect(scene.block).toMatchObject({ target: other.id, point: at(-3, 0, 4), distance: 5, relative: at(-3, 0, 4), relativeFlags: 4, targetSample: SAMPLE });
    scene.table.remove(other);
    const block = { ...scene.block, targetSample: 0 };
    expect(updateTargetPoint(block, scene.scene)).toBe(false);
    expect([block.targetValid, block.target, scene.subject.ai.objectTarget]).toEqual([false, null, null]);
  });

  it('leads modes 1 and 2 by the target speed times the constant along the target\'s row 3', () => {
    const scene = pilot();
    aimed(scene, at(0, 0, 100), 20, TURNED);
    setLeadMode(scene.block, 1, f32(0.3), 0);
    updateTargetPoint(scene.block, scene.scene);
    // Row 3 of TURNED is (0, 0, 1); the lead F(20 × F(0.3)).
    expect(scene.block.point).toEqual(at(0, 0, f32(100 + f32(20 * f32(0.3)))));
    expect([scene.block.distance, scene.block.targetSpeed]).toEqual([100, 0]);
  });

  it('leads modes 3, 4 and 5 by F(((d ÷ v) + c) × w) with v the own speed, the craft maximum or the gun speed', () => {
    for (const [mode, own] of [[3, 10], [4, 48], [5, GUN_SPEED], [9, 48]] as const) {
      const scene = pilot();
      aimed(scene, at(0, 0, 100), 20, REVERSED);
      setLeadMode(scene.block, mode, 0.5, 0);
      updateTargetPoint(scene.block, scene.scene);
      const lead = f32((100 / own + (mode === 3 ? 0.5 : 0)) * 20);
      expect(scene.block.point).toEqual(at(0, 0, f32(100 - lead)));
      expect([scene.block.distance, scene.block.targetSpeed]).toEqual([100, 20]);
    }
  });

  it('gives no lead when the own speed is ±0', () => {
    const scene = pilot();
    (scene.subject.movement as SteeredMovementBlock).speed = -0;
    aimed(scene, at(0, 0, 100), 20, REVERSED);
    setLeadMode(scene.block, 3, 0, 0);
    updateTargetPoint(scene.block, scene.scene);
    expect(scene.block.point).toEqual(at(0, 0, 100));
  });

  it('adds the offset along the target\'s rows in frame 0 and in world axes in frame 1, then measures to the moved point', () => {
    const scene = pilot();
    aimed(scene, at(0, 0, 10), 0, TURNED);
    setTargetOffset(scene.block, 0, at(1, 2, 3));
    updateTargetPoint(scene.block, scene.scene);
    // 1 × (0, 1, 0) + 2 × (−1, 0, 0) + 3 × (0, 0, 1).
    expect(scene.block.point).toEqual(at(-2, 1, 13));
    expect(scene.block.distance).toBe(f32(Math.sqrt(4 + 1 + 169)));
    setTargetOffset(scene.block, 1, at(1, 2, 3));
    const block = { ...scene.block, targetSample: 0 };
    updateTargetPoint(block, scene.scene);
    expect(block.point).toEqual(at(1, 2, 13));
    expect(block.relativeFlags).toBe(7);
  });

  it('adds the offset to a steered point again at every sample', () => {
    const scene = pilot();
    steerAtPoint(scene.block, scene.scene, at(0, 0, 10));
    setTargetOffset(scene.block, 0, at(1, 0, 0));
    updateTargetPoint(scene.block, scene.scene);
    const later = pilot({ clock: SAMPLE + 1 });
    updateTargetPoint(scene.block, { ...later.scene, subject: scene.subject });
    expect(scene.block.point).toEqual(at(2, 0, 10));
  });
});

describe('the steering block (0x5cd1c)', () => {
  /** A pilot whose point lies at `local` in its frame. */
  function viewing(local: Vec3): Pilot {
    const scene = pilot();
    aimed(scene, local);
    updateTargetPoint(scene.block, scene.scene);
    return scene;
  }

  it('changes nothing without S+0x0C', () => {
    const { block, scene } = pilot();
    const before = structuredClone(block);
    computeSteering(block, scene);
    expect(block).toEqual(before);
  });

  it('sets rows 1 and 2 to the fractions, clears all three, keeps row 3\'s value and sets the cone bit within ±b', () => {
    const scene = viewing(at(0, 1, 1));
    scene.block.control = { scale: 0, axes: [UNSET, UNSET, { clear: false, set: true, value: 0.25 }], speedFactor: 1 };
    computeSteering(scene.block, scene.scene);
    // A = π/4 is outside the cone b = 0.5, B = 0 inside it; fraction = F(F(angle) ÷ (a − (−a))).
    const a = f32(Math.PI / 4);
    expect(scene.block.angles).toEqual([a, 0]);
    expect(scene.block.coneBits).toBe(2);
    expect(scene.block.control).toEqual({
      scale: 1, axes: [{ clear: true, set: true, value: f32(a / 2) }, { clear: true, set: true, value: 0 }, { clear: true, set: false, value: 0.25 }], speedFactor: null,
    });
  });

  it('saturates beyond ±a without a cone bit, and turns +sat, −sat at L.z = ±0 with both angles π/2', () => {
    const behind = viewing(at(-2, 3, 1));
    computeSteering(behind.block, behind.scene);
    expect(behind.block.control.axes.slice(0, 2).map(({ value }) => value)).toEqual([0.75, -0.75]);
    expect(behind.block.coneBits).toBe(0);
    const level = viewing(at(1, 1, 0));
    computeSteering(level.block, level.scene);
    expect(level.block.angles).toEqual([f32(Math.PI / 2), f32(Math.PI / 2)]);
    expect(level.block.control.axes.slice(0, 2).map(({ value }) => value)).toEqual([0.75, -0.75]);
  });

  /** A target ahead whose row 2 is (0.6, 0.8, 0): dot 0.8 with the subject's (0, 1, 0). */
  const ROLLED = Object.freeze([f32(0.8), f32(-0.6), 0, f32(0.6), f32(0.8), 0, 0, 0, 1]) as unknown as Matrix3;

  function rolling(rollMatch: boolean, position = at(0, 0, 50)): Pilot {
    const scene = pilot();
    aimed(scene, position, 0, ROLLED);
    scene.block.rollMatch = rollMatch;
    updateTargetPoint(scene.block, scene.scene);
    return scene;
  }

  it('matches the roll in the cone when the rows 2 are apart: row 3 := F(((t × o)·f)), unsaturated', () => {
    const scene = rolling(true);
    computeSteering(scene.block, scene.scene);
    expect(scene.block.coneBits).toBe(3);
    // t × o = (0, 0, F(0.6)) and f = (0, 0, 1).
    expect(scene.block.control.axes[2]).toEqual({ clear: true, set: true, value: f32(0.6) });
  });

  it('does not match the roll when it is off, the rows are close enough or the target is outside the cone and far', () => {
    const off = rolling(false);
    computeSteering(off.block, off.scene);
    expect(off.block.control.axes[2].set).toBe(false);
    const close = rolling(true);
    computeSteering(close.block, { ...close.scene, limits: { ...LIMITS, rollMatchThreshold: f32(0.8) } });
    expect(close.block.control.axes[2].set).toBe(false);
    const aside = rolling(true, at(0, 50, 1));
    computeSteering(aside.block, aside.scene);
    expect(aside.block.control.axes[2].set).toBe(false);
  });

  it('matches the roll outside the cone on an offset approach strictly nearer than 100', () => {
    for (const [z, matched] of [[99, true], [100, false]] as const) {
      const scene = pilot();
      aimed(scene, at(0, 0, 0), 0, ROLLED);
      scene.block.rollMatch = true;
      setTargetOffset(scene.block, 1, at(0, z, 1));
      updateTargetPoint(scene.block, scene.scene);
      computeSteering(scene.block, scene.scene);
      expect(scene.block.coneBits).not.toBe(3);
      expect(scene.block.control.axes[2].set).toBe(matched);
    }
  });
});

const UNSET = { clear: false, set: false, value: 0 };
const NOISE = Object.freeze({ enabled: true, low: -0.25, high: 0.25 });
/** One draw over [−0.25, 0.25]: D(D(r × C) × 0.5) − 0.25. */
const draw = (rand: number): number => rand * RAND_SCALE * 0.5 - 0.25;

describe('the noise routines (0x5d490, 0x5d6a8)', () => {
  it('adds a draw to each set row up to 1.0 and clamps it, makes an unset row a set draw, and leaves a row above 1.0', () => {
    const rand = scriptedRand([32767, 0, 16384, 1000]);
    const control: ControlBlock = {
      scale: 0.5, axes: [{ clear: true, set: true, value: 1 }, { clear: true, set: true, value: -1 }, { clear: true, set: false, value: 7 }], speedFactor: 0.5,
    };
    expect(steeringNoise(NOISE, control, rand)).toEqual({
      scale: 0.5, axes: [{ clear: true, set: true, value: 1 }, { clear: true, set: true, value: -1 }, { clear: true, set: true, value: f32(draw(16384)) }],
      speedFactor: 0.5,
    });
    expect(rand.used).toBe(3);
    const within = scriptedRand([1000]);
    const above: ControlBlock = {
      scale: 1, axes: [{ clear: false, set: true, value: f32(0.1) }, { clear: false, set: true, value: 1.5 }, { ...UNSET, set: true, value: 2 }], speedFactor: null,
    };
    const noisy = steeringNoise({ ...NOISE }, above, within);
    expect(noisy.axes.map(({ value }) => value)).toEqual([f32(draw(1000) + f32(0.1)), 1.5, 2]);
    expect(within.used).toBe(1);
  });

  it('draws nothing while the steering noise is off', () => {
    const control: ControlBlock = { scale: 1, axes: [UNSET, UNSET, UNSET], speedFactor: null };
    expect(steeringNoise({ ...NOISE, enabled: false }, control, scriptedRand([]))).toBe(control);
  });

  it('adds a draw to a speed factor up to 1.0, clamped to [0, 1.0]; without the flag or above 1.0 nothing', () => {
    const axes: ControlBlock['axes'] = [UNSET, UNSET, UNSET];
    expect(throttleNoise(NOISE, { scale: 0, axes, speedFactor: 0.5 }, scriptedRand([1000])).speedFactor).toBe(f32(draw(1000) + 0.5));
    expect(throttleNoise(NOISE, { scale: 0, axes, speedFactor: 1 }, scriptedRand([32767])).speedFactor).toBe(1);
    expect(throttleNoise(NOISE, { scale: 0, axes, speedFactor: 0 }, scriptedRand([0])).speedFactor).toBe(0);
    for (const speedFactor of [null, 1.5]) {
      const control: ControlBlock = { scale: 0, axes, speedFactor };
      expect(throttleNoise(NOISE, control, scriptedRand([]))).toBe(control);
    }
    const control: ControlBlock = { scale: 0, axes, speedFactor: 0.5 };
    expect(throttleNoise({ ...NOISE, enabled: false }, control, scriptedRand([]))).toBe(control);
  });
});

describe('clearing the offset (0x5c72c)', () => {
  it('switches it off and keeps the frame and vector', () => {
    const { block } = pilot();
    setTargetOffset(block, 0, at(1, 2, 3));
    clearTargetOffset(block);
    expect(block.offset).toEqual({ enabled: false, frame: 0, vector: at(1, 2, 3) });
  });
});
