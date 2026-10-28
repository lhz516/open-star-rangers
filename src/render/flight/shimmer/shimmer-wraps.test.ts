import { describe, expect, it } from 'vitest';
import {
  boundsWrap, familyWraps, SHARED_WRAPS, seamU, sphereWrapUvs, TURNING_WRAPS, wrapFamily, wrappedCornerUvs, type SphereWrap,
} from './shimmer-wraps.ts';

const degrees = ({ direction: { x, z } }: SphereWrap): number => (Math.atan2(z, x) * 180) / Math.PI;

describe('wrap families', () => {
  it('gives kinds 1, 2, 0x100 and 0x200 the turning wraps, 0x80 the bounds wrap, 0xf9c7c the shared ones, others none', () => {
    const families = Array.from({ length: 32 }, (_, bit) => wrapFamily(bit));
    expect(families.flatMap((family, bit) => (family === 'turning' ? [bit] : []))).toEqual([0, 1, 8, 9]);
    expect(families.flatMap((family, bit) => (family === 'bounds' ? [bit] : []))).toEqual([7]);
    expect(families.flatMap((family, bit) => (family === 'shared' ? [bit] : []))).toEqual([2, 3, 4, 5, 6, 10, 11, 12, 15, 16, 17, 18, 19]);
    expect(families.flatMap((family, bit) => (family === null ? [bit] : []))).toEqual([13, 14, ...Array.from({ length: 12 }, (_, at) => 20 + at)]);
    expect([-1, 32, 1.5].map(wrapFamily)).toEqual([null, null, null]);
  });

  it('turns 32 wraps by 4.375° up to 70° and back, flipped after wrap 16, about y with su = sv = 3', () => {
    expect(TURNING_WRAPS).toHaveLength(32);
    expect(TURNING_WRAPS.map((wrap) => Math.round(degrees(wrap) / 4.375))).toEqual([...Array.from({ length: 17 }, (_, k) => k), ...Array.from({ length: 15 }, (_, k) => 15 - k)]);
    expect(degrees(TURNING_WRAPS[16])).toBeCloseTo(70, 4);
    for (const wrap of TURNING_WRAPS) {
      expect(wrap).toMatchObject({ origin: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, ou: 0, ov: 0, su: 3, sv: 3 });
      expect(wrap.direction.y).toBe(0);
      expect(Math.fround(wrap.direction.x)).toBe(wrap.direction.x);
    }
    expect(TURNING_WRAPS[0].direction).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('shares 16 wraps by 8.75° up to 70° and back, flipped after wrap 8', () => {
    expect(SHARED_WRAPS).toHaveLength(16);
    expect(SHARED_WRAPS.map((wrap) => Math.round(degrees(wrap) / 8.75))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(degrees(SHARED_WRAPS[8])).toBeCloseTo(70, 4);
  });

  it('sizes the bounds wrap from the y range: su = d, sv = −d, ov = d · min_y with d = 80 / (max − min)', () => {
    const wrap = boundsWrap(Float32Array.of(5, -2, 9, 0, 6, -9, 1, 1, 1))!;
    expect(wrap).toEqual({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 }, ou: 0, su: 10, sv: -10, ov: -20 });
    expect(familyWraps('bounds', Float32Array.of(0, 0, 0, 0, 3, 0))).toEqual([expect.objectContaining({ su: Math.fround(80 / 3) })]);
    expect(boundsWrap(Float32Array.of(0, 3, 0, 1, 3, 0))).toBeNull();
    expect(boundsWrap(Float32Array.of(0, 0, 0, 0, 2 ** -140, 0))).toBeNull();
    expect(familyWraps('bounds', Float32Array.of(0, 3, 0))).toBeNull();
    expect(familyWraps('turning', new Float32Array(3))).toBe(TURNING_WRAPS);
    expect(familyWraps('shared', new Float32Array(3))).toBe(SHARED_WRAPS);
  });
});

describe('sphere wrap coordinates', () => {
  it('maps a vertex by its longitude atan2(p_x, p_y)/2π and colatitude acos(p_z/|p|)/π in the wrap frame', () => {
    // Wrap 0: D = x, U = y, R = U × D = −z, so p = (−z, y, x).
    const uvs = sphereWrapUvs(TURNING_WRAPS[0], Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, -1, 0));
    expect([...uvs]).toEqual([0, 0, 0, 1.5, 0.75, 1.5, 2.25, 1.5, 0, 0, 1.5, 1.5]);
  });

  it('applies the bounds wrap’s scale and offset', () => {
    const wrap = boundsWrap(Float32Array.of(0, -2, 0, 0, 6, 0))!;
    // D = y, U = z, R = U × D = −x: p = (−x, z, y). (0, 0, 1): a = 0, b = 0.5 → v = −10 · 0.5 + 20.
    expect([...sphereWrapUvs(wrap, Float32Array.of(0, 0, 1, -1, 0, 0))]).toEqual([0, 15, 2.5, 15]);
  });
});

describe('seam rule', () => {
  it('moves the one corner far from both others by 1 toward its neighbour, b before c before a', () => {
    expect(seamU(0.1, 2.9, 0.2).map(Math.fround)).toEqual([0.1, 1.9, 0.2].map(Math.fround));
    expect(seamU(0.1, 0.2, 2.9).map(Math.fround)).toEqual([0.1, 0.2, 1.9].map(Math.fround));
    expect(seamU(2.9, 0.1, 0.2).map(Math.fround)).toEqual([1.9, 0.1, 0.2].map(Math.fround));
    expect(seamU(0.9, 0.1, 0.2).map(Math.fround)).toEqual([-0.1, 0.1, 0.2].map(Math.fround));
  });

  it('counts a difference of exactly 0.5 as near and leaves near triangles alone', () => {
    expect(seamU(0, 0.5, 1)).toEqual([0, 0.5, 1]);
    expect(seamU(0, 0.25, 0.5)).toEqual([0, 0.25, 0.5]);
    // Every pair far: b is far from both and moves first.
    expect(seamU(0, 1, 2)).toEqual([0, 2, 2]);
  });

  it('gives one (u, v) per stored corner, the rule applied per triangle in stored order and v unchanged', () => {
    // Vertex 0 at longitude ≈ 0.99, 1 and 2 near 0: triangle (0, 1, 2) moves corner a toward b; (1, 2, 0) moves c.
    const longitude = (a: number): [number, number, number] => [Math.sin(2 * Math.PI * a), Math.cos(2 * Math.PI * a), 0];
    const positions = Float32Array.from([...longitude(0.99), ...longitude(0.02), ...longitude(0.03)]);
    const wrap: SphereWrap = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, ou: 0, ov: 0, su: 1, sv: 1 };
    const vertex = sphereWrapUvs(wrap, positions);
    const corners = wrappedCornerUvs(wrap, positions, Uint16Array.of(0, 1, 2, 1, 2, 0));
    expect(corners[0]).toBe(Math.fround(vertex[0] - 1));
    expect([corners[2], corners[4]]).toEqual([vertex[2], vertex[4]]);
    expect([corners[6], corners[8], corners[10]]).toEqual([vertex[2], vertex[4], Math.fround(vertex[0] - 1)]);
    for (const [corner, source] of [0, 1, 2, 1, 2, 0].entries()) expect(corners[corner * 2 + 1]).toBe(vertex[source * 2 + 1]);
  });
});
