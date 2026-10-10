import { describe, expect, it } from 'vitest';
import { isOutsideExitBounds, isRemovedOnLeaving, isWithinActiveArea } from './active-area.ts';
import { worldHalfExtent } from './coordinates.ts';

// Expectations are written out from docs/original/formats/executable.md, world boundary, active area, parking and
// autopilot (P3-06/04): radius 7500, strict; the world rectangle ±7500 × n inset by 100, bounds inside.

const at = (x: number, y: number, z = 0) => ({ x, y, z });

describe('active area 0x3a540 (P3-06 AC-06, M-08)', () => {
  it('is strictly within x/y radius 7500 of the centre, z ignored', () => {
    const centre = at(1000, -2000, 5);
    expect(isWithinActiveArea(centre, at(1000 + 7499.5, -2000, -90000))).toBe(true);
    expect(isWithinActiveArea(centre, at(1000 + 7500, -2000))).toBe(false);
    // 4500² + 6000² = 7500² exactly: on the circle, so outside.
    expect(isWithinActiveArea(centre, at(1000 + 4500, -2000 - 6000))).toBe(false);
    expect(isWithinActiveArea(centre, at(1000 + 4500, -2000 - 5999.5))).toBe(true);
    expect(isWithinActiveArea(centre, centre)).toBe(true);
  });

  it('puts everything outside without a centre (no player entity)', () => {
    expect(isWithinActiveArea(null, at(0, 0))).toBe(false);
  });
});

describe('kinds removed on leaving the area (0x1f00000)', () => {
  it('are kind bits 20–24 only', () => {
    const removed = Array.from({ length: 32 }, (_, kindBit) => kindBit).filter(isRemovedOnLeaving);
    expect(removed).toEqual([20, 21, 22, 23, 24]);
  });
});

describe('world rectangle 0x3a41c and the parked exit bounds (P3-06 AC-06, M-07)', () => {
  it('spans ±7500 × n', () => {
    expect(worldHalfExtent({ sectors: 6 })).toBe(45000);
    expect(worldHalfExtent({ sectors: 1 })).toBe(7500);
  });

  it('is outside the rectangle inset by 100 only strictly beyond its bounds, on x or y, z ignored', () => {
    const frame = { sectors: 6 };
    const beyond = Math.fround(44900 + 0.01);
    expect(beyond).toBeGreaterThan(44900);
    for (const [x, y] of [[44900, 44900], [-44900, -44900], [0, 0], [44900, -44900]]) expect(isOutsideExitBounds(frame, at(x, y, 1e6))).toBe(false);
    for (const [x, y] of [[beyond, 0], [-beyond, 0], [0, beyond], [0, -beyond], [50000, 50000]]) expect(isOutsideExitBounds(frame, at(x, y))).toBe(true);
  });
});
