import { describe, expect, it } from 'vitest';
import { pixelsIn } from '../messages/messages.test-support.ts';
import { createIndexedSurface, type IndexedSurface } from '../raster/indexed-surface.ts';
import { clipLineStart, drawGrid, drawPanelOutline, drawPointerBox, drawRecord, inclusiveBox } from './map-drawing.ts';
import { mapImage } from './map-picture.test-support.ts';

// hud §4.9 (P3-13/06): record drawer 0x4abe4, outlines 0x4b8fc, grid 0x4ab08, pointer box 0x4c8b0, line clip 0x4c674.

const at = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * surface.width + x];

/** Every non-zero pixel of the 64 × 64 test surface as `x,y=colour`. */
const pixels = (surface: IndexedSurface): string[] => pixelsIn(surface, 0, 0, 63, 63);

const AREA = Object.freeze({ x: 20, y: 30, width: 10, height: 8 });
/** 4 × 3 record: index 0x50 + x + 4y, colour key 0 at (2, 1). */
const RECORD = mapImage(4, 3, (x, y) => (x === 2 && y === 1 ? 0 : 0x50 + x + 4 * y));

describe('drawRecord (0x4abe4)', () => {
  it('blits with colour key 0 at the area origin + the point', () => {
    const surface = createIndexedSurface(64, 64);
    drawRecord(surface, RECORD, AREA, 2, 1);
    expect(at(surface, 22, 31)).toBe(0x50);
    expect(at(surface, 25, 33)).toBe(0x50 + 3 + 8);
    expect(at(surface, 24, 32)).toBe(0); // the key hole
    expect(pixels(surface).length).toBe(11);
  });

  it('shrinks only on the right and bottom, never on the left or top', () => {
    const surface = createIndexedSurface(64, 64);
    drawRecord(surface, RECORD, AREA, 8, 6); // 2 × 2 remain
    expect([...pixels(surface)].sort()).toEqual(['28,36=80', '29,36=81', '28,37=84', '29,37=85'].sort());
    const left = createIndexedSurface(64, 64);
    drawRecord(left, RECORD, AREA, -3, -2);
    expect(at(left, 17, 28)).toBe(0x50); // left of and above the area
    expect(pixels(left).length).toBe(11);
  });

  it('outlines (w′ + 1) × (h′ + 1) after the record, over its first row and column', () => {
    const surface = createIndexedSurface(64, 64);
    drawRecord(surface, RECORD, AREA, 7, 6, 0x0d); // w′ = 3, h′ = 2
    const box = [...pixels(surface)].filter((pixel) => pixel.endsWith('=13'));
    expect(box).toHaveLength(10);
    for (const [x, y] of [[27, 36], [30, 36], [27, 38], [30, 38]]) expect(at(surface, x, y)).toBe(0x0d);
    expect(at(surface, 28, 37)).toBe(0x50 + 1 + 4); // the inside keeps the record
    // Negative control: a w′ × h′ box would have its right column at x 29 and its bottom row at y 37.
    expect(at(surface, 30, 37)).toBe(0x0d);
    expect(at(surface, 29, 37)).toBe(0); // the record's key hole
  });

  it('draws no record pixel when shrunk to nothing, but still the box', () => {
    const surface = createIndexedSurface(64, 64);
    drawRecord(surface, RECORD, AREA, 10, 2, 0x0d);
    expect([...pixels(surface)].sort()).toEqual(['30,32=13', '30,33=13', '30,34=13', '30,35=13'].sort());
  });
});

describe('outlines, grid and pointer box', () => {
  it('outlines a panel at x, x + w, y and y + h', () => {
    const surface = createIndexedSurface(64, 64);
    drawPanelOutline(surface, AREA, 8);
    expect(pixels(surface).length).toBe(2 * 11 + 2 * 7);
    expect(at(surface, 30, 38)).toBe(8);
    expect(at(surface, 29, 37)).toBe(0); // not inset by one
  });

  it('draws grid lines at the origin + i × trunc(s / n) across the inclusive side', () => {
    const surface = createIndexedSurface(64, 64);
    const main = { x: 2, y: 3, width: 30, height: 30 };
    drawGrid(surface, main, 4, 4);
    for (const offset of [7, 14, 21]) {
      expect(at(surface, 2 + offset, 3)).toBe(4);
      expect(at(surface, 2 + offset, 33)).toBe(4);
      expect(at(surface, 32, 3 + offset)).toBe(4);
    }
    // Negative control: exact division would put the lines at 9.5, 17 and 24.5 from x 2.
    expect(at(surface, 23, 5)).toBe(4);
    expect(at(surface, 24, 5)).toBe(0);
    expect(at(surface, 17, 5)).toBe(0);
    expect(pixels(surface).length).toBe(6 * 31 - 9);
  });

  it('centres the pointer box and draws only edges inside [origin, origin + s], clamped', () => {
    const main = { x: 10, y: 10, width: 40, height: 40 };
    const inside = createIndexedSurface(64, 64);
    drawPointerBox(inside, main, 20, 20, { width: 9, height: 5 }, 0x0d);
    expect(pixels(inside).length).toBe(2 * 9 + 2 * 3);
    for (const [x, y] of [[26, 28], [34, 28], [26, 32], [34, 32]]) expect(at(inside, x, y)).toBe(0x0d);

    const corner = createIndexedSurface(64, 64);
    drawPointerBox(corner, main, 1, 39, { width: 9, height: 5 }, 0x0d);
    // Left (x 7) and bottom (y 51) edges lie outside: only the top and right edges, clamped to x ≥ 10 and y ≤ 50.
    expect([...pixels(corner)].sort()).toEqual(['10,47=13', '11,47=13', '12,47=13', '13,47=13', '15,47=13', '15,48=13', '15,49=13', '15,50=13', '14,47=13'].sort());
  });
});

describe('clipLineStart (0x4c674, Δ-07)', () => {
  const box = inclusiveBox({ x: 13, y: 37, width: 301, height: 301 });
  const cursor = { x: 113, y: 157 };

  it('keeps a start inside the box', () => {
    expect(clipLineStart({ x: 50, y: 60 }, cursor, box)).toEqual({ x: 50, y: 60 });
    expect(clipLineStart({ x: 314, y: 338 }, cursor, box)).toEqual({ x: 314, y: 338 });
  });

  it('clips in x, then in y, with the f32 slope and truncation', () => {
    expect(clipLineStart({ x: 0, y: 100 }, cursor, box)).toEqual({ x: 13, y: 106 });
    expect(clipLineStart({ x: 50, y: 0 }, cursor, box)).toEqual({ x: 64, y: 37 });
    expect(clipLineStart({ x: -100, y: -100 }, cursor, box)).toEqual({ x: 13, y: 37 });
    expect(clipLineStart({ x: 400, y: 157 + 290 }, cursor, box)).toEqual({ x: 292, y: 338 });
  });

  it('clips a segment sharing the cursor\'s column or row exactly instead of dividing by zero', () => {
    expect(clipLineStart({ x: 113, y: 400 }, cursor, box)).toEqual({ x: 113, y: 338 });
    expect(clipLineStart({ x: 113, y: -5 }, cursor, box)).toEqual({ x: 113, y: 37 });
    expect(clipLineStart({ x: -50, y: 157 }, cursor, box)).toEqual({ x: 13, y: 157 });
    expect(clipLineStart({ x: 900, y: 157 }, cursor, box)).toEqual({ x: 314, y: 157 });
  });
});
