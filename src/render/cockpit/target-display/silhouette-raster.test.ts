import { describe, expect, it } from 'vitest';
import { createIndexedSurface, type IndexedSurface } from '../raster/indexed-surface.ts';
import { fillTriangle, roundHalfEven, type ScreenVertex } from './silhouette-raster.ts';

// The library's one-colour triangle fill (executable.md RS1, RS2, RS4). Expected pixel sets are written out from the
// recorded rules: rows round half to even, columns ⌊xl⌋ ≤ x < ⌊xr⌋ of 16.16 edges stepped by a chopped f32 slope.

const SIZE = 100;
const COLOUR = 0x10;

const v = (x: number, y: number): ScreenVertex => ({ x, y });

function fill(...vertices: [ScreenVertex, ScreenVertex, ScreenVertex]): IndexedSurface {
  const surface = createIndexedSurface(SIZE, SIZE);
  fillTriangle(surface, vertices, COLOUR);
  return surface;
}

/** The set pixels as `row: [first, last]` spans (rows with none omitted). */
function spans(surface: IndexedSurface): Record<number, [number, number]> {
  const out: Record<number, [number, number]> = {};
  for (let y = 0; y < SIZE; y++) {
    const row = [...surface.indices.subarray(y * SIZE, (y + 1) * SIZE)];
    const first = row.indexOf(COLOUR);
    if (first < 0) continue;
    const last = row.lastIndexOf(COLOUR);
    expect(row.slice(first, last + 1).every((index) => index === COLOUR), `row ${y} is one span`).toBe(true);
    out[y] = [first, last];
  }
  return out;
}

const rowsOf = (from: number, to: number, span: (row: number) => [number, number]): Record<number, [number, number]> =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, at) => [from + at, span(from + at)]));

describe('fillTriangle', () => {
  it('rounds half to even', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4999, 2.5001].map(roundHalfEven)).toEqual([0, 2, 2, 0, -2, 2, 3]);
  });

  it('fills a clockwise flat-top triangle from its top row to the row before its bottom, right edge exclusive', () => {
    // Left edge x = 10, right edge from 20 to 10 over 10 rows (step −65536): row r covers 10 … 29 − r.
    expect(spans(fill(v(10, 10), v(20, 10), v(10, 20)))).toEqual(rowsOf(10, 19, (row) => [10, 29 - row]));
  });

  it('culls the same triangle wound the other way, and every rotation keeps the same pixels', () => {
    expect(spans(fill(v(10, 10), v(10, 20), v(20, 10)))).toEqual({});
    const expected = spans(fill(v(10, 10), v(20, 10), v(10, 20)));
    expect(spans(fill(v(20, 10), v(10, 20), v(10, 10)))).toEqual(expected);
    expect(spans(fill(v(10, 20), v(10, 10), v(20, 10)))).toEqual(expected);
  });

  it('applies the flat-bottom and the flat-top-with-C tests strictly', () => {
    // Flat bottom (r_B = r_C): drawn when x_B > x_C.
    expect(spans(fill(v(30, 10), v(40, 20), v(20, 20)))).not.toEqual({});
    expect(spans(fill(v(30, 10), v(20, 20), v(40, 20)))).toEqual({});
    // Flat top with r_C = r_A: drawn when x_A > x_C.
    expect(spans(fill(v(40, 10), v(30, 20), v(20, 10)))).not.toEqual({});
    expect(spans(fill(v(20, 10), v(30, 20), v(40, 10)))).toEqual({});
    // Equal x on a flat top is culled; three equal rows draw nothing.
    expect(spans(fill(v(20, 10), v(30, 20), v(20, 10)))).toEqual({});
    expect(spans(fill(v(10, 10), v(30, 10), v(50, 10)))).toEqual({});
  });

  it('keeps a general triangle when the cross product of rounded rows is ≥ 0', () => {
    // Row 10 is empty (both edges start at 50); rows 11–49 hold pixels, e.g. row 11 from ⌊49.5⌋ to 50, row 49 30–31.
    const kept = spans(fill(v(50, 10), v(70, 30), v(30, 50)));
    expect(Object.keys(kept).map(Number)).toEqual(Array.from({ length: 39 }, (_, at) => 11 + at));
    expect([kept[11], kept[30], kept[49]]).toEqual([[49, 50], [40, 69], [30, 31]]);
    expect(spans(fill(v(50, 10), v(30, 50), v(70, 30)))).toEqual({});
  });

  it('takes rows by round-half-even of sy and columns by flooring 16.16 edges without a prestep', () => {
    // Rows: 10.5 → 10 and 13.5 → 14; columns: 10.5 → 10 (inclusive) and 14.5 → 14 (exclusive).
    expect(spans(fill(v(10.5, 10.5), v(14.5, 10.5), v(14.5, 13.5)))).toEqual({ 10: [10, 13], 11: [11, 13], 12: [12, 13], 13: [13, 13] });
    expect(Object.keys(spans(fill(v(10, 11.5), v(14, 11.5), v(14, 14.5)))).map(Number)).toEqual([12, 13]);
  });

  it('steps an edge by chop((x₂ − x₁) · F(1/Δrow) · 65536)', () => {
    // F(1/25) is below 1/25, so the right edge from (0, 0) to (25, 25) steps 65535 a row: row r ends at
    // ⌊65535 r / 65536⌋ = r − 1 (exclusive) where exact stepping would end at r.
    const surface = fill(v(0, 0), v(25, 25), v(-10, 25));
    expect(spans(surface)).toEqual(rowsOf(2, 24, (row) => [0, row - 2]));
  });

  it('drops pixels outside the surface and draws nothing for a non-finite vertex', () => {
    expect(spans(fill(v(-50, -10), v(150, -10), v(-50, 50)))[0]).toEqual([0, 99]);
    expect(spans(fill(v(90, 95), v(130, 95), v(90, 140)))).toEqual(rowsOf(95, 99, () => [90, 99]));
    expect(spans(fill(v(10, 10), v(Number.NaN, 10), v(10, 20)))).toEqual({});
    expect(spans(fill(v(10, 10), v(Number.POSITIVE_INFINITY, 10), v(10, 20)))).toEqual({});
  });
});
