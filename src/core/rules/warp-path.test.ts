import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { scriptedRand } from './rand.test-support.ts';
import type { Matrix3 } from '../world/entity-table.ts';
import type { WarpTransit } from '../world/player-state.ts';
import { evaluateWarpPath, setUpWarpPath, shiftWarpPath, steerInTunnel, stepWarp, transitLength, WARP_PATH_POINTS, warpProgress, type WarpPathPose } from './warp-path.ts';

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

describe('the segment shift 0x5172c', () => {
  it('moves points 1–14 down and builds point 14 from point 13 by the set-up rule, 2 draws, x then y', () => {
    const path = setUpWarpPath(scriptedRand(Array.from({ length: 20 }, () => 10000)));
    const rand = scriptedRand([10000, 0]);
    const shifted = shiftWarpPath(path, rand);
    expect(rand.used).toBe(2);
    expect(shifted).toHaveLength(15);
    expect(shifted.slice(0, 14)).toEqual(path.slice(1));
    // Point 13 of the shifted path is the old point 14: (−3000, −3000, 36000); x steps −300, y −900, z +2000.
    expect(shifted[14]).toEqual({ x: -3300, y: -3900, z: 38000 });
  });
});

describe('the progress 0x509c0', () => {
  it.each([
    ['the start, L = 7', 1, 0, 7, Math.fround(Math.fround(1 / 7))],
    ['just short of the end', 6, 0.9921875, 7, Math.fround(6.9921875 * Math.fround(1 / 7))],
    // 7 × F(1/7) = 1.0000000447… rounds to the f32 1.
    ['n = L', 7, 0, 7, 1],
    ['beyond the end', 8, 0.5, 7, 1],
    ['L = 0.5 ≤ 1: complete at the start', 1, 0, 0.5, 1],
    ['L = 0: unordered, taken as 1', 1, 0, 0, 1],
  ] as const)('%s', (_, segments, fraction, length, expected) => {
    expect(warpProgress({ segments, fraction, length })).toBe(expected);
  });
});

/** K = F(cos 30°) from the image's angle, as the hand-worked expectations below use it. */
const K = Math.fround(Math.cos(0.5235987833333333));
const IDENTITY_ROWS = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as Matrix3;
const pose = (position: Vec3, orientation: Matrix3 = IDENTITY_ROWS): WarpPathPose => ({ position, orientation });
/** The angle of a player aligned with the tunnel: |1 − K| × (1 ÷ (1 − K)), at most 1. */
const ALIGNED_ANGLE = Math.fround(Math.min(1, (1 - K) * (1 / (1 - K))));

describe('the Warp pose 0x50a28 (steerInTunnel)', () => {
  const centre = pose(vec(0, 0, 11000));
  const previous = pose(vec(0, 0, 10000));

  it('keeps an aligned player on the centre line: c = 1, the largest increment in the window', () => {
    const result = steerInTunnel(pose(vec(0, 0, 10500)), centre, previous, 0, true, 0);
    expect(result).toEqual({
      position: { x: 0, y: 0, z: 11000 }, orientation: IDENTITY_ROWS, angle: ALIGNED_ANGLE, centring: 1, error: Math.fround(1e-4), wallContact: false,
    });
    expect(steerInTunnel(pose(vec(0, 0, 10500)), centre, previous, 0, false, 0).error).toBe(0);
  });

  it('carries the lateral offset from G onto the new path frame and drops the forward component', () => {
    // Offset (30, −40) from G, 500 ahead: the new position is N + (30, −40), d² = 2500, so c = 1 − 2500 × 4e-4 = 0 and
    // no increment; 2500 is not beyond the wall.
    const result = steerInTunnel(pose(vec(30, -40, 10500)), centre, previous, 0, true, 0.25);
    expect(result).toMatchObject({ position: { x: 30, y: -40, z: 11000 }, centring: 0, error: 0.25, wallContact: false });
  });

  it.each([
    ['c > 0.9 (d² = 100)', 10, Math.fround(1 - 100 * 4e-4), Math.fround(0.5 + 1e-4)],
    ['0.8 < c ≤ 0.9 (d² = 400)', 20, Math.fround(1 - 400 * 4e-4), Math.fround(0.5 + 5e-5)],
    ['0.7 < c ≤ 0.8 (d² = 625)', 25, Math.fround(1 - 625 * 4e-4), Math.fround(0.5 + 2e-5)],
    ['c ≤ 0.7 (d² = 900): nothing', 30, Math.fround(1 - 900 * 4e-4), 0.5],
  ])('adds the error band of %s in the window', (_, offset, centring, error) => {
    const result = steerInTunnel(pose(vec(0, offset, 10000)), centre, previous, 0, true, 0.5);
    expect([result.centring, result.error]).toEqual([centring, error]);
  });

  it('pulls a player beyond radius 50 back onto the wall, adding 0.01 in the window only', () => {
    // d² = 3600: e × (50 ÷ 60) = (30, 40); c = 0.
    const inside = steerInTunnel(pose(vec(36, 48, 10000)), centre, previous, 0, true, 0.5);
    expect(inside).toMatchObject({ position: { x: 30, y: 40, z: 11000 }, centring: 0, error: Math.fround(0.5 + 0.01), wallContact: true });
    // P3-12 FS-03: the contact `warp-wall-contact` reports is that branch: outside the window it is no contact.
    expect(steerInTunnel(pose(vec(36, 48, 10000)), centre, previous, 0, false, 0.5)).toMatchObject({ error: 0.5, wallContact: false });
  });

  it('clamps s to 1', () => {
    expect(steerInTunnel(pose(vec(0, 0, 10000)), centre, previous, 0, true, 1).error).toBe(1);
    expect(steerInTunnel(pose(vec(36, 48, 10000)), centre, previous, 0, true, 0.995).error).toBe(1);
  });

  it('turns a forward row beyond 30° back onto the cone: R2 = K·N2 + (sin 30° ÷ sin θ)(R2 − cos θ·N2), then R0 and R1', () => {
    // Forward along +x (90° off the tunnel): R2 = (0.5, 0, K), R0 = normalise(R1 × R2) = (K, 0, −0.5), R1 = R2 × R0 = (0, 1, 0).
    // The original forms R2 from f32 points about Q′ (z = 11000, an ulp of 2⁻¹⁰), so it is within about 5e-5 of that.
    const turned = [0, 0, -1, 0, 1, 0, 1, 0, 0] as unknown as Matrix3;
    const result = steerInTunnel(pose(vec(0, 0, 10000), turned), centre, previous, 0, false, 0);
    const expected = [K, 0, -0.5, 0, 1, 0, 0.5, 0, K];
    result.orientation.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-4));
    expect(result.angle).toBe(1);
    expect(result.position).toEqual({ x: 0, y: 0, z: 11000 });
  });

  it('leaves the rows within the cone and moves the player by 1.15 × v along the forward row, less its tunnel component', () => {
    // 10° off about y: forward (sin 10°, 0, cos 10°); w = 20 × 1.15 = 23 sideways by 23 × sin 10° ≈ 3.994.
    const angle = (10 * Math.PI) / 180;
    const rows = [Math.fround(Math.cos(angle)), 0, Math.fround(-Math.sin(angle)), 0, 1, 0, Math.fround(Math.sin(angle)), 0, Math.fround(Math.cos(angle))] as unknown as Matrix3;
    const result = steerInTunnel(pose(vec(0, 0, 10000), rows), centre, previous, 20, false, 0);
    expect(result.orientation).toEqual(rows);
    expect(result.position.x).toBeCloseTo(23 * Math.sin(angle), 4);
    expect(result.position.z).toBeCloseTo(11000, 3);
    expect(result.angle).toBe(Math.fround(Math.min(1, Math.abs(Math.fround(Math.cos(angle)) - K) * (1 / (1 - K)))));
  });
});

describe('the Warp step 0x50508 (stepWarp)', () => {
  const path = setUpWarpPath(scriptedRand(Array.from({ length: 20 }, () => 10000)));
  const start = evaluateWarpPath(path, 0);
  const transit = (fields: Partial<WarpTransit> = {}): WarpTransit => ({
    serial: 1, origin: vec(0, 0, 0), length: 7, segments: 1, fraction: 0, error: 0, angle: 0, centring: 0, frame: start, path, ...fields,
  });

  it('advances u by speed × step ÷ +0xB8 without drawing, evaluates the path there and makes it G', () => {
    // δ = 32 × 0.5 = 16; u = 0.25 + 16 ÷ 64 = 0.5.
    const rand = scriptedRand([]);
    const result = stepWarp(transit({ fraction: 0.25 }), start, 32, 0.5, 64, rand);
    const frame = evaluateWarpPath(path, 0.5);
    expect(result.transit).toMatchObject({ segments: 1, fraction: 0.5, frame, path });
    expect(result.pose.position).toEqual(frame.position);
    expect(rand.used).toBe(0);
  });

  it('completes a segment when u reaches 1: the overshoot discarded, the path shifted with 2 draws, n + 1', () => {
    const rand = scriptedRand([10000, 0]);
    const result = stepWarp(transit({ fraction: 0.875, segments: 3 }), start, 32, 0.5, 64, rand);
    expect(rand.used).toBe(2);
    const shifted = shiftWarpPath(path, scriptedRand([10000, 0]));
    expect(result.transit).toMatchObject({ segments: 4, fraction: 0, path: shifted, frame: evaluateWarpPath(shifted, 0) });
  });

  it.each([
    // speed 0 keeps u: (n + u) ÷ L exactly 0.05 and 0.95 are outside the strict window.
    ['(n + u) ÷ L = 0.05', 1, 20, 0],
    ['just above 0.05', 1, 19.5, Math.fround(1e-4)],
    ['(n + u) ÷ L = 0.95', 19, 20, 0],
    ['just below 0.95', 18.75, 20, Math.fround(1e-4)],
  ])('runs the error window strictly: %s', (_, segments, length, error) => {
    expect(stepWarp(transit({ segments, length }), start, 0, 0.5, 64, scriptedRand([])).transit.error).toBe(error);
  });
});
