import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WARP_RING_POINTS, WARP_TEMPLATE_COUNT, WARP_TEMPLATES } from './warp-templates.ts';

describe('Warp ring templates (WT2)', () => {
  it('holds 50 rings of 20 f32 points of radius 120 with z in [−15, +5)', () => {
    expect(WARP_TEMPLATES).toHaveLength(WARP_TEMPLATE_COUNT);
    for (const template of WARP_TEMPLATES) {
      expect(template).toHaveLength(WARP_RING_POINTS);
      for (const { x, y, z } of template) {
        for (const value of [x, y, z]) expect(Math.fround(value)).toBe(value);
        expect(Math.hypot(x, y)).toBeCloseTo(120, 4);
        expect(z).toBeGreaterThanOrEqual(-15);
        expect(z).toBeLessThan(5);
      }
    }
  });

  it('steps each ring\'s angle by about 2π/20, jittered by at most ±0.12 rad', () => {
    for (const template of WARP_TEMPLATES) {
      template.forEach(({ x, y }, j) => {
        const nominal = j * Math.fround(0.31415927);
        const offset = Math.atan2(Math.sin(Math.atan2(y, x) - nominal), Math.cos(Math.atan2(y, x) - nominal));
        expect(Math.abs(offset)).toBeLessThanOrEqual(0.12 + 1e-6);
      });
    }
  });

  it('equals the independent model of draws 1129–3128 of the default sequence, with no presentation draw', () => {
    // SHA-256 (first 16 hex digits) of the 50 × 20 × (x, y, z) little-endian f32 table that P3-12/06's independent model
    // (local research, built from the code facts only) printed.
    const bytes = new Float32Array(WARP_TEMPLATES.flatMap((template) => template.flatMap(({ x, y, z }) => [x, y, z])));
    expect(createHash('sha256').update(new Uint8Array(bytes.buffer)).digest('hex').slice(0, 16)).toBe('1a16c020dbb5710a');
  });
});
