import { describe, expect, it } from 'vitest';
import type { MapRuleData } from '../world/map-rule-data.ts';
import { testState } from '../world/world.test-support.ts';
import { mapPixelToWorld, quantiseMapPoint, worldToMapPixel, zoomBounds } from './map-frame.ts';

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

describe('worldToMapPixel (0x4c524)', () => {
  // f32(400 ÷ 90000) = 0.004444444552…, just above 1/225, so a pixel's world span starts on or just before its own edge.
  const at = (x: number, y: number) => worldToMapPixel(map(), { x, y, z: 99 });

  it('truncates the offset times the f32 scale on each axis', () => {
    expect(at(-4950 + 100, -10350 + 224)).toEqual({ pixel: { column: 178, row: 154 }, inWorld: true });
    expect(at(-45000, -45000)).toEqual({ pixel: { column: 0, row: 0 }, inWorld: true });
  });

  it('puts the world maximum one beyond the last cursor pixel, still in the world', () => {
    // 90000 × 0.004444444552… = 400.0000097: pixel s = 400.
    expect(at(45000, 45000)).toEqual({ pixel: { column: 400, row: 400 }, inWorld: true });
  });

  it('counts the bounds in, and anything beyond them or unordered out', () => {
    const above = Math.fround(45000 + 0.004);
    expect(above).toBeGreaterThan(45000);
    expect(at(above, 0).inWorld).toBe(false);
    expect(at(0, -45000.0039).inWorld).toBe(false);
    expect(at(Number.NaN, 0).inWorld).toBe(false);
    expect(at(0, Number.NaN).inWorld).toBe(false);
  });

  it('truncates toward zero outside the world', () => {
    // −500 × 0.00444… = −2.22…: −2, not −3.
    expect(at(-45500, -45000 - 100)).toEqual({ pixel: { column: -2, row: 0 }, inWorld: false });
    expect(Object.is(at(-45100, 0).pixel.column, 0)).toBe(true);
  });

  it('keeps the low 16 bits of the i32, signed, and 0 for the integer indefinite', () => {
    // 9000100 × 0.00444… = 40000.44…: 40000 − 65536 = −25536.
    expect(at(8955100, 0).pixel.column).toBe(-25536);
    // Beyond i32 and NaN store 0x80000000, whose low 16 bits are 0.
    expect(at(1e12, 0).pixel.column).toBe(0);
    expect(at(-1e12, Number.NaN).pixel).toEqual({ column: 0, row: 0 });
  });
});

describe('quantiseMapPoint (MW-04)', () => {
  it('takes ⌊fraction × s⌋, clamped to the last pixel', () => {
    expect(quantiseMapPoint(400, 0, 0)).toEqual({ column: 0, row: 0 });
    expect(quantiseMapPoint(400, 1, 1)).toEqual({ column: 399, row: 399 });
    expect(quantiseMapPoint(400, 178.5 / 400, 154 / 400)).toEqual({ column: 178, row: 154 });
    expect(quantiseMapPoint(400, 0.0025 - 1e-12, 0.0025)).toEqual({ column: 0, row: 1 });
    expect(quantiseMapPoint(45, 0.999, 0.5)).toEqual({ column: 44, row: 22 });
  });
});
