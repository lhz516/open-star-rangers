import { describe, expect, it } from 'vitest';
import type { MapRuleData } from '../world/map-rule-data.ts';
import { testState } from '../world/world.test-support.ts';
import { mapPixelToWorld, zoomBounds } from './map-frame.ts';

// docs/plan/p3/02/spec.md, MW-02 and MW-07; docs/original/formats/executable.md, cursor, destination and marker
// (0x4c4c0, 0x2bc30). The synthetic map (side 400) over the synthetic world of ±45000 gives 225 units per pixel and a
// zoom extent of 15000 × 30000 (map-rule-data.test.ts); the expectations are worked out by hand from those.

const map = (): MapRuleData => testState().ruleData.map;

describe('mapPixelToWorld (0x4c4c0)', () => {
  it('maps pixel 0 to the world minimum and the last pixel one pixel width below the maximum, z +0', () => {
    expect(mapPixelToWorld(map(), { column: 0, row: 0 })).toEqual({ x: -45000, y: -45000, z: 0 });
    expect(mapPixelToWorld(map(), { column: 399, row: 399 })).toEqual({ x: 44775, y: 44775, z: 0 });
    expect(Object.is(mapPixelToWorld(map(), { column: 0, row: 0 }).z, 0)).toBe(true);
    expect(mapPixelToWorld(map(), { column: 178, row: 154 })).toEqual({ x: -4950, y: -10350, z: 0 });
  });

  it('stores each coordinate as an f32 of the double sum', () => {
    // f32(225.1) = 225.100006103515625; 399 × it − 45000 = 44814.9024353027… in double, 11472615.02 steps of 2^−8 (the
    // f32 spacing there), so the f32 is 11472615 × 2^−8 = 44814.90234375.
    const scales = { ...map(), unitsPerPixel: { x: Math.fround(225.1), y: 225 } };
    const { x, y } = mapPixelToWorld(scales, { column: 399, row: 1 });
    expect(x).toBe(44814.90234375);
    expect(y).toBe(-44775);
  });
});

describe('zoomBounds (0x2bc30)', () => {
  it('spans half the extent to each side of the point', () => {
    expect(zoomBounds(map(), { x: -4950, y: -10350, z: 0 })).toEqual({ left: -12450, right: 2550, top: -25350, bottom: 4650 });
  });

  it('clamps each side to the world on its own, so the window shrinks near an edge', () => {
    expect(zoomBounds(map(), { x: -45000, y: -45000, z: 0 })).toEqual({ left: -45000, right: -37500, top: -45000, bottom: -30000 });
    expect(zoomBounds(map(), { x: 44775, y: 44775, z: 0 })).toEqual({ left: 37275, right: 45000, top: 29775, bottom: 45000 });
  });

  it('stores each side as an f32', () => {
    const { left } = zoomBounds(map(), { x: 0.1, y: 0, z: 0 });
    expect(left).toBe(Math.fround(0.1 - 7500));
    expect(left).not.toBe(0.1 - 7500);
  });
});
