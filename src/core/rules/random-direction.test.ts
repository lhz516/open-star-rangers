import { describe, expect, it } from 'vitest';
import { DIRECTION_TABLE, randomDirection } from './random-direction.ts';
import { scriptedRand } from './rand.test-support.ts';

// docs/original/formats/executable.md, numbers on the movement path (P3-06/01): 19 × 19 first-octant unit directions at
// 5° steps, entry 19a + b for azimuth a and polar angle b; the draw picks rand % 361, then the octant rand % 8.

const degrees = (value: number): number => (value * Math.PI) / 180;

describe('direction table of 0x568b0 (P3-06; spec 技术决定 11)', () => {
  it('holds 361 frozen first-octant unit directions', () => {
    expect(DIRECTION_TABLE).toHaveLength(361);
    expect(Object.isFrozen(DIRECTION_TABLE)).toBe(true);
    for (const { x, y, z } of DIRECTION_TABLE) {
      for (const component of [x, y, z]) {
        expect(component).toBeGreaterThanOrEqual(0);
        expect(Math.fround(component)).toBe(component);
      }
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    }
  });

  it('puts azimuth a and polar angle b at 19a + b: (cos a sin b, sin a sin b, cos b)', () => {
    for (let a = 0; a < 19; a++) {
      // Polar angle 0 is the z axis exactly; azimuth 0 has no y.
      expect(DIRECTION_TABLE[19 * a]).toEqual({ x: 0, y: 0, z: 1 });
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
