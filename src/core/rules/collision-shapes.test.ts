import { describe, expect, it } from 'vitest';
import type { Matrix3 } from '../world/entity-table.ts';
import { TEST_ORIENTATION } from '../world/world.test-support.ts';
import { craftContainsPoint, debrisContainsPoint, pointInFrame, type CollisionShape, type ShapeBox } from './collision-shapes.ts';

// Expectations derived by hand from H7 and the instruction-level arithmetic in the module comment, not by the helpers.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
/** Rows (0, 1, 0), (−1, 0, 0), (0, 0, 1): local x is world y, local y is −world x. */
const QUARTER_TURN = TEST_ORIENTATION;
const ORIGIN = { x: 0, y: 0, z: 0 };
const box = (lower: [number, number, number], upper: [number, number, number]): ShapeBox => ({
  lower: { x: lower[0], y: lower[1], z: lower[2] },
  upper: { x: upper[0], y: upper[1], z: upper[2] },
});

function shape(radius: number, boxes: readonly ShapeBox[] = [], innerBox: ShapeBox | null = null): CollisionShape {
  return { radius, radiusSquared: Math.fround(radius * radius), bounds: box([-radius, -radius, -radius], [radius, radius, radius]), boxes, innerBox };
}

describe('pointInFrame, 0x56dc0', () => {
  it('dots the differences with the rows: the first with the double differences, the others with their f32 copies', () => {
    // dx = 1.5 + 2^24 = 16,777,217.5 (f32 copy 16,777,218), dy = −0.5. Rows 1 and 2 are both (1, 1, 0):
    // x = f32(−0.5 + 16,777,217.5) = f32(16,777,217) = 16,777,216 (ties to even), y = f32(16,777,217.5) = 16,777,218.
    const rows = Object.freeze([1, 1, 0, 1, 1, 0, 0, 0, 1]) as unknown as Matrix3;
    const local = pointInFrame(rows, { x: -(2 ** 24), y: 0, z: 0 }, { x: 1.5, y: -0.5, z: 7 });
    expect(local).toEqual({ x: 16_777_216, y: 16_777_218, z: 7 });
  });

  it('turns world offsets into the frame of the rows, relative to the origin', () => {
    expect(pointInFrame(QUARTER_TURN, { x: 10, y: 20, z: 30 }, { x: 13, y: 25, z: 29 })).toEqual({ x: 5, y: -3, z: -1 });
    expect(pointInFrame(IDENTITY, ORIGIN, { x: 0.25, y: -2, z: 8 })).toEqual({ x: 0.25, y: -2, z: 8 });
  });
});

describe('craftContainsPoint, 0x29bf4', () => {
  it('hits within the sphere, its surface included (d² ≤ r²), and returns d² as f32', () => {
    const sphere = shape(5);
    expect(craftContainsPoint(sphere, ORIGIN, IDENTITY, { x: 3, y: 4, z: 0 })).toEqual({ hit: true, distanceSquared: 25 });
    expect(craftContainsPoint(sphere, { x: 1, y: 1, z: 1 }, IDENTITY, { x: 1, y: 1, z: -4 })).toEqual({ hit: true, distanceSquared: 25 });
    expect(craftContainsPoint(sphere, ORIGIN, IDENTITY, { x: 3, y: 4, z: 0.125 })).toEqual({ hit: false, distanceSquared: 25.015625 });
  });

  it('rounds d² to f32 before the comparison: a point just outside a unit sphere in double hits', () => {
    // 1 + 2^−26 in double rounds to the f32 1 (half an ulp of 1 is 2^−24).
    const point = { x: 1, y: 2 ** -13, z: 0 };
    expect(craftContainsPoint(shape(1), ORIGIN, IDENTITY, point)).toEqual({ hit: true, distanceSquared: 1 });
  });

  it('with boxes, hits only strictly inside one of them, in the craft\'s frame', () => {
    const boxed = shape(10, [box([-1, -1, -1], [1, 1, 1]), box([2, -1, -1], [4, 1, 1])]);
    expect(craftContainsPoint(boxed, ORIGIN, IDENTITY, { x: 0.5, y: 0, z: 0 }).hit).toBe(true);
    expect(craftContainsPoint(boxed, ORIGIN, IDENTITY, { x: 3, y: 0.5, z: -0.5 }).hit).toBe(true);
    // On a face, between the boxes and outside the sphere.
    expect(craftContainsPoint(boxed, ORIGIN, IDENTITY, { x: 1, y: 0, z: 0 }).hit).toBe(false);
    expect(craftContainsPoint(boxed, ORIGIN, IDENTITY, { x: 1.5, y: 0, z: 0 }).hit).toBe(false);
    expect(craftContainsPoint(shape(2, boxed.boxes), ORIGIN, IDENTITY, { x: 3, y: 0, z: 0 })).toEqual({ hit: false, distanceSquared: 9 });
    // World (10, 13, 0) from a craft at (10, 10, 0) turned a quarter: local (3, 0, 0), inside the second box.
    expect(craftContainsPoint(boxed, { x: 10, y: 10, z: 0 }, QUARTER_TURN, { x: 10, y: 13, z: 0 }).hit).toBe(true);
    expect(craftContainsPoint(boxed, { x: 10, y: 10, z: 0 }, QUARTER_TURN, { x: 13, y: 10, z: 0 }).hit).toBe(false);
  });

  it('skips the boxes for a point strictly inside the inner box, but tests one on its boundary', () => {
    const inner = shape(10, [box([-4, -4, -4], [4, 4, 4])], box([-1, -1, -1], [1, 1, 1]));
    expect(craftContainsPoint(inner, ORIGIN, IDENTITY, { x: 0.5, y: 0, z: 0 }).hit).toBe(false);
    expect(craftContainsPoint(inner, ORIGIN, IDENTITY, { x: 1, y: 0, z: 0 }).hit).toBe(true);
    expect(craftContainsPoint(inner, ORIGIN, IDENTITY, { x: 2, y: 0.5, z: 0 }).hit).toBe(true);
    // Without boxes the inner box is never read.
    expect(craftContainsPoint(shape(10, [], box([-1, -1, -1], [1, 1, 1])), ORIGIN, IDENTITY, ORIGIN).hit).toBe(true);
  });
});

describe('debrisContainsPoint, 0x29d58', () => {
  it('compares d² unrounded: the point just outside the unit sphere misses here', () => {
    const point = { x: 1, y: 2 ** -13, z: 0 };
    expect(debrisContainsPoint(shape(1), ORIGIN, IDENTITY, point)).toBe(false);
    expect(debrisContainsPoint(shape(1), ORIGIN, IDENTITY, { x: 1, y: 0, z: 0 })).toBe(true);
  });

  it('applies the same strict boxes and inner box', () => {
    const inner = shape(10, [box([-4, -4, -4], [4, 4, 4])], box([-1, -1, -1], [1, 1, 1]));
    expect(debrisContainsPoint(inner, ORIGIN, IDENTITY, { x: 0.5, y: 0, z: 0 })).toBe(false);
    expect(debrisContainsPoint(inner, ORIGIN, IDENTITY, { x: 2, y: 0, z: 0 })).toBe(true);
    expect(debrisContainsPoint(inner, ORIGIN, IDENTITY, { x: 4, y: 0, z: 0 })).toBe(false);
    expect(debrisContainsPoint(inner, { x: 10, y: 10, z: 0 }, QUARTER_TURN, { x: 10, y: 13, z: 0 })).toBe(true);
  });
});
