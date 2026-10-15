import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DIRECTION_TABLE, ONE_180TH_CONSTANT, PI_CONSTANT, randomDirection } from './random-direction.ts';
import { scriptedRand } from './rand.test-support.ts';

// docs/original/formats/executable.md, numbers on the movement path (P3-06/01): 19 × 19 first-octant unit directions at
// 5° steps, entry 19a + b for azimuth a and polar angle b; the draw picks rand % 361, then the octant rand % 8.
// P3-09/28 and 30: the angles use the image's constants, not Math.PI and 1/180.

const degrees = (value: number): number => (value * Math.PI) / 180;
const f64Bits = (value: number): bigint => new BigUint64Array(new Float64Array([value]).buffer)[0];
const signBit = (value: number): boolean => Object.is(value, -0) || value < 0;

describe('direction table of 0x568b0 (P3-06; spec 技术决定 11; P3-09/30)', () => {
  it('uses the image constants 0x17210c and 0x172114 as f64 bit patterns', () => {
    expect(f64Bits(PI_CONSTANT)).toBe(0x400921fb5a7ed197n); // the decimal 3.1415927, above π
    expect(f64Bits(ONE_180TH_CONSTANT)).toBe(0x3f76c16c16c16c16n); // one ulp below the double nearest 1/180
  });

  it('matches the hash of P3-09/28\'s independent x87 and V8 models of the original table', () => {
    // SHA-256 over the 361 × 3 components as little-endian f32 in entry order; the values themselves are not recorded.
    const bytes = new DataView(new ArrayBuffer(DIRECTION_TABLE.length * 12));
    DIRECTION_TABLE.forEach(({ x, y, z }, index) => [x, y, z].forEach((component, axis) => bytes.setFloat32(12 * index + 4 * axis, component, true)));
    expect(createHash('sha256').update(new Uint8Array(bytes.buffer)).digest('hex'))
      .toBe('5060c87d4eb78f56c6ac5e680dc5cd0358e12e68908f66088bb30b741e9c001b');
  });

  it('holds 361 frozen f32 unit directions, negative only where a 90° angle\'s cosine is', () => {
    expect(DIRECTION_TABLE).toHaveLength(361);
    expect(Object.isFrozen(DIRECTION_TABLE)).toBe(true);
    let negative = 0;
    DIRECTION_TABLE.forEach(({ x, y, z }, index) => {
      const [a, b] = [Math.floor(index / 19), index % 19];
      for (const component of [x, y, z]) expect(Math.fround(component)).toBe(component);
      // The image's 90° lies just beyond π/2: x carries cos a (−0 at polar angle 0) and z is cos b.
      expect([signBit(x), signBit(y), signBit(z)]).toEqual([a === 18, false, b === 18]);
      negative += [x, y, z].filter(signBit).length;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    });
    expect(negative).toBe(38);
  });

  it('puts azimuth a and polar angle b at 19a + b: (cos a sin b, sin a sin b, cos b)', () => {
    for (let a = 0; a < 19; a++) {
      // Polar angle 0 is the z axis exactly (x is −0 at azimuth 90°); azimuth 0 has no y.
      expect(DIRECTION_TABLE[19 * a]).toEqual({ x: a === 18 ? -0 : 0, y: 0, z: 1 });
      expect(DIRECTION_TABLE[a].y).toBe(0);
      for (let b = 0; b < 19; b++) {
        const { x, y, z } = DIRECTION_TABLE[19 * a + b];
        expect(x).toBeCloseTo(Math.cos(degrees(5 * a)) * Math.sin(degrees(5 * b)), 7);
        expect(y).toBeCloseTo(Math.sin(degrees(5 * a)) * Math.sin(degrees(5 * b)), 7);
        expect(z).toBeCloseTo(Math.cos(degrees(5 * b)), 7);
      }
    }
  });
});

describe('random direction 0x56b8c (P3-06)', () => {
  const entry = DIRECTION_TABLE[20]; // azimuth 5°, polar angle 5°: every component positive

  it.each([
    [0, [1, 1, 1]], [1, [-1, 1, 1]], [2, [1, -1, 1]], [3, [1, 1, -1]],
    [4, [-1, -1, 1]], [5, [-1, 1, -1]], [6, [1, -1, -1]], [7, [-1, -1, -1]],
  ])('negates by octant %i', (octant, [sx, sy, sz]) => {
    const rand = scriptedRand([20, octant]);
    expect(randomDirection(rand)).toEqual({ x: sx * entry.x, y: sy * entry.y, z: sz * entry.z });
    expect(rand.used).toBe(2);
  });

  it('takes the entry from the first draw mod 361 and the octant from the second mod 8', () => {
    expect(randomDirection(scriptedRand([361 + 20, 8]))).toEqual(entry);
    const last = DIRECTION_TABLE[32767 % 361];
    expect(randomDirection(scriptedRand([32767, 32767]))).toEqual({ x: -last.x, y: -last.y, z: -last.z });
    expect(Object.isFrozen(randomDirection(scriptedRand([0, 0])))).toBe(true);
  });
});
