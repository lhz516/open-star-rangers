import { describe, expect, it } from 'vitest';
import type { CharMapEntry, FontPayload } from '../../../content/graphics/font-payload.ts';
import type { InclusiveRectangle } from '../../../content/hud/instruments-payload.ts';
import { isolatedDrawContext } from '../presentation/cockpit.test-support.ts';
import { hudFont } from '../raster/glyph-text.ts';
import type { IndexedSurface } from '../raster/indexed-surface.ts';
import { barRows, chop32, drawFlatBar, drawShapedBar, SHAPED_BAR_ENTRIES, shapedBarHalfWidth } from './gauge-bars.ts';

// Expectations from docs/original/formats/hud.md §4.2 (Confirmed, code; P3-13/02), derived by hand per case. Synthetic
// rectangles and an 8 × 8 font whose glyphs are single marker pixels; never original data.

const COLOUR = 21;
const LABEL = 'Gq';
/** 'G' sets bit column 0 of row 0, 'q' bit column 7 of row 7. */
function markerFont(): FontPayload {
  const glyphs = new Uint8Array(128 * 8);
  glyphs[0x47 * 8] = 0b1000_0000;
  glyphs[0x71 * 8 + 7] = 0b0000_0001;
  const charMap: CharMapEntry[] = [{ code: 0x47, glyph: 0x47 }, { code: 0x71, glyph: 0x71 }];
  return Object.freeze({ kind: 'font', cellWidth: 8, height: 8, glyphRows: 8, glyphs, charMap: Object.freeze(charMap) });
}
const FONT = hudFont(markerFont(), 8, false);
/** The label's two marker pixels for its first glyph at (x, y): (x, y) and (x + 8 + 7, y + 7). */
const labelPixels = (x: number, y: number): string[] => [`${x},${y}`, `${x + 15},${y + 7}`];

const at = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * surface.width + x];

/** Every pixel of `surface` with index `colour`, as "x,y". */
function pixelsOf(surface: IndexedSurface, colour: number): string[] {
  const found: string[] = [];
  surface.indices.forEach((index, pixel) => {
    if (index === colour) found.push(`${pixel % surface.width},${Math.floor(pixel / surface.width)}`);
  });
  return found.sort();
}

/** The pixels of rows `rows`, each spanning columns from–to. */
const rowPixels = (rows: readonly number[], from: number, to: number): string[] =>
  rows.flatMap((y) => Array.from({ length: to - from + 1 }, (_, i) => `${from + i},${y}`)).sort();

/** 22 rows (k = 0–21), where every half-width is 10. */
const SHORT: InclusiveRectangle = { x0: 100, y0: 380, x1: 129, y1: 401 };

describe('shaped-bar half-widths', () => {
  it('follow T[i] = chop(min(f32((0.5 · max(i/56 − 0.25, 0))²) · 200 + 10, 29)) and continue at 29 past the table', () => {
    // By hand: 10 until 200 · (t/2)² reaches 1 (t ≥ 0.1414, i ≥ 21.92); i = 48 gives 28.43; 29 from i ≥ 48.52.
    expect(Array.from({ length: 22 }, (_, i) => shapedBarHalfWidth(i))).toEqual(Array(22).fill(10));
    expect(shapedBarHalfWidth(22)).toBe(11);
    expect(shapedBarHalfWidth(48)).toBe(28);
    expect(Array.from({ length: 7 }, (_, i) => shapedBarHalfWidth(49 + i))).toEqual(Array(7).fill(29));
    expect(SHAPED_BAR_ENTRIES).toBe(56);
    expect([56, 57, 200, 479].map(shapedBarHalfWidth)).toEqual([29, 29, 29, 29]);
    for (let i = 1; i < 60; i++) expect(shapedBarHalfWidth(i)).toBeGreaterThanOrEqual(shapedBarHalfWidth(i - 1));
  });

  it('count rows as chop((y1 − y0) × value), with the integer indefinite beyond i32', () => {
    expect(barRows(SHORT, 0.5)).toBe(10);
    expect(barRows(SHORT, 0.52)).toBe(10);
    expect(barRows(SHORT, -0.5)).toBe(-10);
    expect([Number.NaN, Infinity, 1e12].map((value) => barRows(SHORT, value))).toEqual([-(2 ** 31), -(2 ** 31), -(2 ** 31)]);
    expect(chop32(-0.75)).toBe(0);
    expect(Object.is(chop32(-0.75), -0)).toBe(false);
  });
});

describe('shaped bar 0x417a4', () => {
  it('mode 0: clears each row to its own T, draws every second row up from y1 and one closing row, labels and copies the shape', () => {
    const { context, surfaces: { back, screen }, published } = isolatedDrawContext(1);
    back.indices.fill(3);
    drawShapedBar(context, SHORT, 0, 0.5, COLOUR, FONT, LABEL, true);
    // n = 10, so J = 5 lines at y1, y1 − 2, …, y1 − 8 and the closing row y1 − 9, every one x0 … x0 + 10.
    const lines = [401, 399, 397, 395, 393, 392];
    expect(pixelsOf(back, COLOUR)).toEqual(rowPixels(lines, 100, 110));
    expect(pixelsOf(back, 8)).toEqual(labelPixels(102, 382).sort());
    const cleared = Array.from({ length: 22 }, (_, k) => 380 + k).filter((y) => !lines.includes(y));
    expect(pixelsOf(back, 0)).toEqual(rowPixels(cleared, 100, 110).filter((pixel) => !labelPixels(102, 382).includes(pixel)));
    // The copy is each row's shape segment, bottom row first.
    expect(published).toEqual(Array.from({ length: 22 }, (_, k) => ({ x0: 100, y0: 401 - k, x1: 110, y1: 401 - k })));
    expect(pixelsOf(screen, COLOUR)).toEqual(pixelsOf(back, COLOUR));
    // Negative control: nothing on the mirrored, right-anchored side.
    expect(at(back, 129, 401)).toBe(3);
  });

  it('gives n = 2k − 1 and n = 2k the same picture', () => {
    const odd = isolatedDrawContext(1);
    drawShapedBar(odd.context, SHORT, 0, 0.45, COLOUR, FONT, LABEL, true);
    const even = isolatedDrawContext(1);
    drawShapedBar(even.context, SHORT, 0, 0.5, COLOUR, FONT, LABEL, true);
    expect(barRows(SHORT, 0.45)).toBe(9);
    expect(barRows(SHORT, 0.5)).toBe(10);
    expect(odd.surfaces.back.indices).toEqual(even.surfaces.back.indices);
  });

  it('draws the closing row at the next table index in B but copies the row’s own width', () => {
    // 31 rows; n = 21, J = 11: the closing row y1 − 21 (k = 21, T = 10) uses T[22] = 11 in B.
    const rect = { x0: 200, y0: 370, x1: 229, y1: 400 };
    const { context, surfaces: { back, screen } } = isolatedDrawContext(1);
    drawShapedBar(context, rect, 0, 0.71, COLOUR, FONT, LABEL, true);
    expect(barRows(rect, 0.71)).toBe(21);
    expect([at(back, 210, 379), at(back, 211, 379)]).toEqual([COLOUR, COLOUR]);
    expect([at(screen, 210, 379), at(screen, 211, 379)]).toEqual([COLOUR, 0]);
    expect(at(back, 211, 380)).toBe(0);
  });

  it('modes 2 and 3 grow down from y0, anchored left and right, labelled near the bottom; other modes act as 3', () => {
    const left = isolatedDrawContext(1);
    drawShapedBar(left.context, SHORT, 2, 0.25, COLOUR, FONT, LABEL, true);
    // n = 5, J = 3: y0, y0 + 2, y0 + 4 and the closing row y0 + 5.
    expect(pixelsOf(left.surfaces.back, COLOUR)).toEqual(rowPixels([380, 382, 384, 385], 100, 110));
    expect(pixelsOf(left.surfaces.back, 8)).toEqual(labelPixels(102, 392).sort());
    const right = isolatedDrawContext(1);
    drawShapedBar(right.context, SHORT, 3, 0.25, COLOUR, FONT, LABEL, true);
    expect(pixelsOf(right.surfaces.back, COLOUR)).toEqual(rowPixels([380, 382, 384, 385], 119, 129));
    expect(pixelsOf(right.surfaces.back, 8)).toEqual(labelPixels(121, 392).sort());
    expect(right.published[0]).toEqual({ x0: 119, y0: 380, x1: 129, y1: 380 });
    for (const mode of [-5, 4, 7]) {
      const other = isolatedDrawContext(1);
      drawShapedBar(other.context, SHORT, mode, 0.25, COLOUR, FONT, LABEL, true);
      expect(other.surfaces.back.indices).toEqual(right.surfaces.back.indices);
    }
    const up = isolatedDrawContext(1);
    drawShapedBar(up.context, SHORT, 1, 0.25, COLOUR, FONT, LABEL, true);
    expect(pixelsOf(up.surfaces.back, COLOUR)).toEqual(rowPixels([401, 399, 397, 396], 119, 129));
    expect(pixelsOf(up.surfaces.back, 8)).toEqual(labelPixels(121, 382).sort());
  });

  it('leaves values above 1 outside the rectangle in B only, and draws no line for 0 or below', () => {
    const over = isolatedDrawContext(1);
    drawShapedBar(over.context, SHORT, 0, 2, COLOUR, FONT, LABEL, true);
    // n = 42, J = 21: lines up to y1 − 40 = 361, closing row 360, all at T = 10 or more past the rectangle.
    expect(at(over.surfaces.back, 100, 361)).toBe(COLOUR);
    expect(at(over.surfaces.back, 100, 360)).toBe(COLOUR);
    expect(at(over.surfaces.back, 100, 359)).toBe(0);
    expect(at(over.surfaces.screen, 100, 361)).toBe(0);
    expect(over.published.every(({ y0 }) => y0 >= 380 && y0 <= 401)).toBe(true);
    for (const value of [0, -0.5]) {
      const none = isolatedDrawContext(1);
      none.surfaces.back.indices.fill(3);
      drawShapedBar(none.context, SHORT, 0, value, COLOUR, FONT, LABEL, true);
      expect(pixelsOf(none.surfaces.back, COLOUR)).toEqual([]);
      expect(pixelsOf(none.surfaces.back, 0).length).toBe(22 * 11 - 1);
    }
  });

  it('stops a walk past the surface edge, as for an unrepresentable reading', () => {
    const { context, surfaces: { back } } = isolatedDrawContext(1);
    drawShapedBar(context, SHORT, 0, Infinity, COLOUR, FONT, LABEL, true);
    // n is the indefinite −2³¹, so y1 − n wraps below every row: lines on every second row up to row 1.
    expect(at(back, 100, 1)).toBe(COLOUR);
    expect(at(back, 100, 0)).toBe(0);
    expect(at(back, 100, 402)).toBe(0);
  });

  it('copies nothing when the slot redraws its records itself', () => {
    const { context, surfaces: { back }, published } = isolatedDrawContext(1);
    drawShapedBar(context, SHORT, 0, 0.5, COLOUR, FONT, LABEL, false);
    expect(published).toEqual([]);
    expect(pixelsOf(back, COLOUR).length).toBe(6 * 11);
  });
});

describe('flat bar 0x41680', () => {
  const rect = { x0: 300, y0: 400, x1: 309, y1: 420 };

  it('fills the rectangle with 0, draws full-width lines up from y1 and a closing row, labels at the centre and copies the rectangle', () => {
    const { context, surfaces: { back, screen }, published } = isolatedDrawContext(1);
    back.indices.fill(3);
    drawFlatBar(context, rect, 0.31, COLOUR, FONT, LABEL, true);
    // n = chop(20 × 0.31) = 6, J = 3: rows 420, 418, 416 and the closing row 415.
    expect(pixelsOf(back, COLOUR)).toEqual(rowPixels([420, 418, 416, 415], 300, 309));
    expect(pixelsOf(back, 8)).toEqual(labelPixels(((300 + 309) >> 1) - 3, 402).sort());
    expect(published).toEqual([rect]);
    expect(at(back, 300, 400)).toBe(0);
    expect(at(back, 299, 400)).toBe(3);
    expect(pixelsOf(screen, COLOUR)).toEqual(pixelsOf(back, COLOUR));
  });

  it('neither fills nor copies when the slot redraws its records itself', () => {
    const { context, surfaces: { back }, published } = isolatedDrawContext(1);
    back.indices.fill(3);
    drawFlatBar(context, rect, 0.31, COLOUR, FONT, LABEL, false);
    expect(published).toEqual([]);
    expect(at(back, 300, 400)).toBe(3);
  });
});
