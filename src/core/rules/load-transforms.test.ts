import { describe, expect, it } from 'vitest';
import { box, craft, debrisRecord, gun, missile, missileBody, mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { CraftRecord, GunRecord, MissileBodyRecord, MissileRecord } from '../../content/rule-data/craft-info.ts';
import type { DebrisRecord } from '../../content/rule-data/debris-parameters.ts';
import { float32OfRational } from './derivation.test-support.ts';
import {
  craftShape, debrisRuleData, gunRuleData, missileRuleData, mountOffsets, normalise, OWN_PROJECTILE_LENGTH_FACTOR, SECONDS_PER_CLOCK_UNIT, weaponRange,
} from './load-transforms.ts';

// Expectations derived from craft.md §3.8 and §4.4 and the instruction-level arithmetic in the module comment: exact
// rationals rounded once where every intermediate is exact, and hand-checked values elsewhere.

const asGun = (overrides: Record<string, unknown>) => gun(overrides) as unknown as GunRecord;
const asMissile = (overrides: Record<string, unknown>) => missile(overrides) as unknown as MissileRecord;
const asBody = (overrides: Record<string, unknown>) => missileBody(overrides) as unknown as MissileBodyRecord;
const asCraft = (overrides: Record<string, unknown>) => craft(overrides) as unknown as CraftRecord;
const asDebris = (overrides: Record<string, unknown>) => debrisRecord(overrides) as unknown as DebrisRecord;

describe('code constants (craft.md §5)', () => {
  it('are the clock unit in seconds and the half projectile length', () => {
    expect([SECONDS_PER_CLOCK_UNIT, OWN_PROJECTILE_LENGTH_FACTOR]).toEqual([0.015625, 0.5]);
  });
});

describe('weapon ranges (0x2cf38 steps 1 and 2)', () => {
  it('is f32(lifetime × 1/64 × speed) and its f32 square', () => {
    expect(gunRuleData(asGun({ at24: 40, at08: 2.5 }))).toEqual({ range: 1.5625, rangeSquared: 2.44140625 });
    // 3 × f32(0.1) ÷ 64 is exact in double: one rounding to f32.
    const tenth = Math.fround(0.1);
    expect(weaponRange(3, tenth)).toBe(float32OfRational(3n * 13421773n, 64n * 134217728n, 'nearest'));
    expect(gunRuleData(asGun({ at24: -64, at08: 3 }))).toEqual({ range: -3, rangeSquared: 9 });
  });

  it('takes a missile\'s speed from its body\'s +0xB8 and squares its fuse radius', () => {
    const data = missileRuleData(asMissile({ at44: 128, at4C: 1.75 }), asBody({ atB8: 300 }));
    expect(data).toEqual({ range: 600, rangeSquared: 360_000, fuseRadiusSquared: 3.0625 });
  });

  it('rounds the square to f32', () => {
    // range = f32(1 × 1/64 × f32(1.1) × 64) is f32(1.1); its square rounds once.
    const speed = Math.fround(1.1) * 64;
    const { range, rangeSquared } = gunRuleData(asGun({ at24: 1, at08: speed }));
    expect(range).toBe(Math.fround(1.1));
    expect(rangeSquared).toBe(1.2100000381469727);
  });
});

describe('craft shapes (0x2cf38 step 3)', () => {
  it('keeps the stored radius and bounds without boxes, squaring the radius', () => {
    const shape = craftShape(asCraft({}));
    expect(shape).toEqual({
      radius: 4,
      radiusSquared: 16,
      bounds: { lower: { x: -4, y: -4, z: -4 }, upper: { x: 4, y: 4, z: 4 } },
      boxes: [],
      innerBox: null,
    });
  });

  it('with boxes takes r, the largest f32 corner length, as radius, ±r as bounds and r² as square', () => {
    const shape = craftShape(asCraft({
      collision: { at00: null, at08: null, boxes: [box([1, 2, 2], [2, 3, 6]), box([-1, -1, 0], [0, 0, 0])], at28: 3, at2C: [-1, -2, -3, 1, 2, 3] },
    }));
    expect(shape.radius).toBe(7);
    expect(shape.radiusSquared).toBe(49);
    expect(shape.bounds).toEqual({ lower: { x: -7, y: -7, z: -7 }, upper: { x: 7, y: 7, z: 7 } });
    expect(shape.boxes).toEqual([
      { lower: { x: 1, y: 2, z: 2 }, upper: { x: 2, y: 3, z: 6 } },
      { lower: { x: -1, y: -1, z: 0 }, upper: { x: 0, y: 0, z: 0 } },
    ]);
    expect(shape.innerBox).toEqual({ lower: { x: -1, y: -2, z: -3 }, upper: { x: 1, y: 2, z: 3 } });
  });

  it('rounds each corner length to f32: √2 for a unit diagonal', () => {
    const shape = craftShape(asCraft({ collision: { at00: null, at08: null, boxes: [box([0, 0, 0], [1, 1, 0])], at28: 0, at2C: [0, 0, 0, 0, 0, 0] } }));
    expect(shape.radius).toBe(1.4142135381698608);
    expect(shape.radiusSquared).toBe(Math.fround(1.4142135381698608 ** 2));
  });
});

describe('mount offsets (0x2cf38 step 3)', () => {
  const guns = [asGun({ at28: 0 }), asGun({ at28: 1 }), asGun({ at28: 2 })];
  const lengths = [1.5, 6, 100];
  const mounts = [
    mount({ at00: [0.5, -1, 2], at10: 0, weapon: 0 }),
    mount({ at00: [0, 0, Math.fround(0.1)], at10: 0, weapon: 1 }),
    mount({ at00: [1, 1, 1], at10: 0, weapon: 2 }),
    mount({ at00: [3, 2, 1], at10: 1, weapon: 0, at0C: 4 }),
  ];

  it('lengthens +0x08 of every non-automatic gun mount by its gun\'s projectile length', () => {
    expect(mountOffsets(7, asCraft({ mounts }), guns, lengths)).toEqual([
      { x: 0.5, y: -1, z: 3.5 },
      { x: 0, y: 0, z: Math.fround(6 + Math.fround(0.1)) },
      { x: 1, y: 1, z: 1 },
      { x: 3, y: 2, z: 1 },
    ]);
  });

  it('by half of it for kind bits 0 and 1', () => {
    for (const kindBit of [0, 1]) {
      expect(mountOffsets(kindBit, asCraft({ mounts }), guns, lengths).map(({ z }) => z)).toEqual([2.75, Math.fround(3 + Math.fround(0.1)), 1, 1]);
    }
  });
});

describe('normalise, 0x56aa8', () => {
  it('multiplies each component by 1 ÷ its f32 length, rounding to f32', () => {
    expect(normalise({ x: 3, y: 4, z: 0 })).toEqual({ x: 0.6000000238418579, y: 0.800000011920929, z: 0 });
    expect(normalise({ x: 0, y: 0, z: -2 })).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('leaves a zero vector as it is', () => {
    const zero = { x: 0, y: -0, z: 0 };
    expect(normalise(zero)).toBe(zero);
  });
});

describe('DEBRIS records (0x246a0)', () => {
  it('negates the weights and keeps a normalised copy of the stored vector', () => {
    const data = debrisRuleData(asDebris({ at00: [3, 0, -4] }));
    expect(data.weights).toEqual({ x: -3, y: -0, z: 4 });
    expect(Object.is(data.weights.y, -0)).toBe(true);
    expect(data.direction).toEqual({ x: 0.6000000238418579, y: 0, z: -0.800000011920929 });
  });

  it('moves every box corner out by 3.5 twice, an f32 store after each step, then derives r, ±r and r²', () => {
    const data = debrisRuleData(asDebris({ collision: { boxes: [box([-1, -2, -3], [1, 2, 3])], at28: 0, at2C: [0, 0, 0, 0, 0, 0] } }));
    expect(data.shape.boxes).toEqual([{ lower: { x: -8, y: -9, z: -10 }, upper: { x: 8, y: 9, z: 10 } }]);
    // √(64 + 81 + 100) = √245.
    expect(data.shape.radius).toBe(Math.fround(Math.sqrt(245)));
    expect(data.shape.bounds.upper).toEqual({ x: data.shape.radius, y: data.shape.radius, z: data.shape.radius });
    expect(data.shape.radiusSquared).toBe(Math.fround(Math.fround(Math.sqrt(245)) ** 2));
    // 10^8 − 3.5 rounds back to 10^8 (f32 spacing 8), and so does the second step; one step of 7 would give 99,999,992.
    const far = debrisRuleData(asDebris({ collision: { boxes: [box([1e8, 0, 0], [0, 0, 0])], at28: 0, at2C: [0, 0, 0, 0, 0, 0] } }));
    expect(far.shape.boxes[0].lower.x).toBe(1e8);
  });

  it('marks a record small when r − 3.5 is below 20, and keeps the inner box of a non-zero flag', () => {
    const widened = (upperX: number) => debrisRuleData(asDebris({
      collision: { boxes: [box([-1, -8, -8], [upperX, -7, -7])], at28: 1, at2C: [-1, -1, -1, 1, 1, 1] },
    }));
    // The upper corner becomes (23.5, 0, 0): r = 23.5 and r − 3.5 = 20 is not below 20.
    expect(widened(16.5)).toMatchObject({ small: false, shape: { radius: 23.5 } });
    expect(widened(Math.fround(16.49)).small).toBe(true);
    expect(widened(16.5).shape.innerBox).toEqual({ lower: { x: -1, y: -1, z: -1 }, upper: { x: 1, y: 1, z: 1 } });
  });
});
