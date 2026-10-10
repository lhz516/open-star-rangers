import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { EntityTable, type Entity, type HomingState, type Matrix3, type SteeredMovementBlock } from '../world/entity-table.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import { scriptedRand } from './rand.test-support.ts';
import {
  homingDeadline, installHoming, isAhead, isHomingUpdateDue, leadTargetPoint, programRecord, rateControl, runHomingProgram, steeringControl,
  steeringFractions, steeringLimits, throttleControl, vectorDistance, type HomingCall, type SteeringLimits,
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
