import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { scriptedRand } from './rand.test-support.ts';
import { evaluateWarpPath, setUpWarpPath, transitLength, WARP_PATH_POINTS } from './warp-path.ts';

// The tunnel path of MW-02/MW-04 (docs/plan/p3/02/spec.md; R-B, P3-09/28): expectations worked out by hand from the
// set-up `0x51618` and the evaluation `0x513e0`/`0x517f4` as P3-09/28 read them, not from the module.

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const isPositiveZero = (value: number) => Object.is(value, 0);
const isFloat32 = (value: number) => Math.fround(value) === value;

/** A path whose remaining points do not matter at segment 1: points 0–3 and copies of point 3. */
const pathOf = (...points: readonly Vec3[]): readonly Vec3[] =>
  [...points, ...Array.from({ length: WARP_PATH_POINTS - points.length }, () => points[points.length - 1])];

describe('the path set-up 0x51618 (0.8, 2000, 300)', () => {
  it('puts points 0 and 1 at (+0, +0, 10000), raises z by 2000 from point 2 on and keeps points 1–4 on the axis', () => {
    const path = setUpWarpPath(scriptedRand(Array.from({ length: 20 }, () => 10000)));
    expect(path).toHaveLength(15);
    expect(path.map(({ z }) => z)).toEqual([10000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000, 32000, 34000, 36000]);
    for (const point of path.slice(0, 5)) expect([point.x, point.y].every(isPositiveZero)).toBe(true);
  });

  it('draws 20 times, x before y in point order, each step (r % 20000 × 1e-4 − 1) × 600 − 300 on the previous point', () => {
    // x: r = 10000 → (1 − 1) × 600 − 300 = −300 per point; y: r = 0 → −900 per point.
    const rand = scriptedRand(Array.from({ length: 20 }, (_, draw) => (draw % 2 === 0 ? 10000 : 0)));
    const path = setUpWarpPath(rand);
    expect(rand.used).toBe(20);
    expect(path.slice(5).map(({ x, y }) => [x, y])).toEqual(Array.from({ length: 10 }, (_, index) => [-300 * (index + 1), -900 * (index + 1)]));
  });

  it('takes the draw modulo 20000, so a step lies in [−900, 299.94]: a biased walk, not a uniform value', () => {
    // 30000 % 20000 = 10000 (−300); 20000 % 20000 = 0 (−900); 19999 → 0.9999 × 600 − 300 = 299.94, stored as f32.
    const values = [30000, 20000, 19999, 32767, ...Array.from({ length: 16 }, () => 10000)];
    const path = setUpWarpPath(scriptedRand(values));
    expect([path[5].x, path[5].y, path[6].x]).toEqual([-300, -900, Math.fround(299.94 - 300)]);
    // 32767 % 20000 = 12767 → 0.2767 × 600 − 300 = −133.98 on −900.
    expect(path[6].y).toBe(Math.fround(-900 - 133.98));
  });

  it('stores every component as an f32 after the double steps', () => {
    // r = 12345: (1.2345 − 1) × 600 − 300 = −159.3, not an f32; the next point adds the same step to that f32.
    const path = setUpWarpPath(scriptedRand(Array.from({ length: 20 }, () => 12345)));
    expect(path[5].x).toBe(Math.fround(-159.3));
    expect(path[6].x).toBe(Math.fround(Math.fround(-159.3) - 159.3));
    expect(path.every(({ x, y, z }) => [x, y, z].every(isFloat32))).toBe(true);
  });
});

describe('the path evaluation 0x513e0 at segment 1', () => {
  it('gives the constant start pose: (0, 0, 10000) and the identity rows with +0 zeros, whatever the draws', () => {
    for (const value of [0, 10000, 19999, 32767]) {
      const { position, orientation } = evaluateWarpPath(setUpWarpPath(scriptedRand(Array.from({ length: 20 }, () => value))), 0);
      expect(position).toEqual({ x: 0, y: 0, z: 10000 });
      expect(orientation).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      expect([position.x, position.y, ...orientation.filter((value) => value !== 1)].every(isPositiveZero)).toBe(true);
    }
  });

  it('runs from point 1 at u = 0 to point 2 at u = 1, whatever points 0 and 3', () => {
    const path = pathOf(vec(-50, 70, 9000), vec(10, 20, 10000), vec(-30, 40, 12000), vec(500, -600, 15000));
    expect(evaluateWarpPath(path, 0).position).toEqual(path[1]);
    expect(evaluateWarpPath(path, 1).position).toEqual(path[2]);
  });

  it('blends with the cardinal tangents k = 0.8: midway on a straight path, 11000 − 2000 × F(0.8 ÷ 8)', () => {
    // u = 0.5: weights ½ and ½, k·a = k·b = F(0.8)/8; position z = 11000 + F(0.8)/8 × (2000 − 4000) = 10799.999997 → 10800.
    // Tangent z: 1.5 × 2000 − F(0.2) × (2000 + 4000) = 1799.99998 → 1800, so the rows stay the identity.
    const path = pathOf(vec(0, 0, 10000), vec(0, 0, 10000), vec(0, 0, 12000), vec(0, 0, 14000));
    expect(evaluateWarpPath(path, 0.5)).toEqual({ position: { x: 0, y: 0, z: 10800 }, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
  });

  it('takes N from the tangent, V = normalise((0, 1, 0) × N) and W = N × V, with the IEEE signed zeros of its products', () => {
    // At u = 0 the tangent is F(0.8) × (p2 − p0) = 0.8 × (1500, 0, 2000): N = (0.6, +0, 0.8), V = (0.8, +0, −0.6),
    // W = (0 × −0.6 − 0.8 × 0, 0.8² + 0.6², 0.6 × 0 − 0 × 0.8) = (−0, 1, +0).
    const path = pathOf(vec(0, 0, 10000), vec(0, 0, 11000), vec(1500, 0, 12000), vec(0, 0, 13000));
    const { position, orientation } = evaluateWarpPath(path, 0);
    expect(position).toEqual(path[1]);
    const expected = [0.8, 0, -0.6, 0, 1, 0, 0.6, 0, 0.8];
    orientation.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
    expect(orientation.every(isFloat32)).toBe(true);
    expect([orientation[1], orientation[5], orientation[7]].every(isPositiveZero)).toBe(true);
    expect(Object.is(orientation[3], -0)).toBe(true);
  });
});

describe('the transit length 0x50068', () => {
  // S × 8 × 1.414 = 15000 × 8 × 1.414 = 169680; L = f × F(14), f = min(d ÷ 169680, 1) above 0.5, else 0.5.
  it.each([
    ['zero distance: the 0.5 floor', 0, 7],
    ['50000 (ratio 0.295)', 50000, 7],
    ['84840 (ratio exactly 0.5, not above it)', 84840, 7],
    ['120000 (ratio 0.7072…): F(9.90099…)', 120000, 9.90099048614502],
    ['169680 (ratio exactly 1)', 169680, 14],
    ['beyond: capped at 1', 1e6, 14],
  ] as const)('%s', (_, distance, expected) => {
    expect(transitLength(distance, 14)).toBe(expected);
  });

  it('just above the floor takes the ratio itself', () => {
    expect(transitLength(84841, 14)).toBe(Math.fround((84841 / 169680) * 14));
    expect(transitLength(84841, 14)).toBeGreaterThan(7);
  });
});
