import { describe, expect, it } from 'vitest';
import { drawWarpLine } from './warp-line.ts';

const CENTRE = 1;
const EDGE = 2;

/** The plotted pixels in order, as [x, y, colour]. */
function plotted(x0: number, y0: number, x1: number, y1: number): [number, number, number][] {
  const pixels: [number, number, number][] = [];
  drawWarpLine(x0, y0, x1, y1, CENTRE, EDGE, (x, y, colour) => pixels.push([x, y, colour]));
  return pixels;
}

const centres = (pixels: readonly [number, number, number][]): [number, number][] =>
  pixels.filter(([, , colour]) => colour === CENTRE).map(([x, y]) => [x, y]);

describe('Warp line drawer (WT6)', () => {
  it('draws an x-major line as an edge, centre, edge column per step, ends included', () => {
    const pixels = plotted(10, 10, 14, 10);
    expect(pixels.slice(0, 3)).toEqual([[10, 9, EDGE], [10, 10, CENTRE], [10, 11, EDGE]]);
    expect(centres(pixels)).toEqual([[10, 10], [11, 10], [12, 10], [13, 10], [14, 10]]);
    expect(pixels).toHaveLength(15);
  });

  it('draws a y-major line as an edge, centre, edge row per step', () => {
    const pixels = plotted(10, 13, 10, 10);
    expect(pixels.slice(0, 3)).toEqual([[9, 13, EDGE], [10, 13, CENTRE], [11, 13, EDGE]]);
    expect(centres(pixels)).toEqual([[10, 13], [10, 12], [10, 11], [10, 10]]);
  });

  it('steps the minor axis by the original\'s error term, x-major only when 2|dx| > 2|dy|', () => {
    expect(centres(plotted(10, 10, 13, 12))).toEqual([[10, 10], [11, 11], [12, 11], [13, 12]]);
    // |dx| = |dy|: y-major.
    expect(plotted(10, 10, 12, 12).slice(0, 3)).toEqual([[9, 10, EDGE], [10, 10, CENTRE], [11, 10, EDGE]]);
  });

  it('rejects equal endpoints, a coordinate beyond ±1200 and a line with neither endpoint inside', () => {
    expect(plotted(10, 10, 10, 10)).toEqual([]);
    expect(plotted(1201, 10, 10, 10)).toEqual([]);
    expect(plotted(10, 10, 10, -1201)).toEqual([]);
    expect(plotted(1, 100, 1, 200)).toEqual([]);
    expect(plotted(100, 1, 200, 314)).toEqual([]);
    // (2, 2) and (637, 313) are inside.
    expect(plotted(2, 2, 1, 1).length).toBeGreaterThan(0);
    expect(plotted(637, 313, 638, 314).length).toBeGreaterThan(0);
  });

  it('clips only the outside endpoint, by truncating integer division, x first and then y', () => {
    // From (11, 20) towards (0, 0): at x = 2 the exact y is 3.6; the original truncates −4189.09 ÷ 256 towards zero.
    expect(centres(plotted(0, 0, 11, 20))[0]).toEqual([2, 4]);
    expect(centres(plotted(11, 20, 0, 0)).at(-1)).toEqual([2, 4]);
    // Right edge: y := 300 + trunc(100 × 7 × 256 ÷ 70 ÷ 256) = 310.
    expect(centres(plotted(630, 300, 700, 400)).at(-1)).toEqual([637, 310]);
    // Bottom edge: x := 600 + trunc(trunc(13 × 10 × 256 ÷ 100) ÷ 256) = 601.
    expect(centres(plotted(600, 300, 610, 400)).at(-1)).toEqual([601, 313]);
    // A horizontal line keeps its y.
    expect(centres(plotted(-10, 100, 5, 100))[0]).toEqual([2, 100]);
  });

  it('keeps every pixel within columns 1–638 and rows 1–314', () => {
    const lines: [number, number, number, number][] = [[-1200, -1200, 320, 158], [320, 158, 1200, 1200], [2, 2, 637, 313], [637, 2, 2, 313], [320, 158, 330, 900]];
    for (const line of lines) {
      for (const [x, y] of plotted(...line)) {
        expect(x).toBeGreaterThanOrEqual(1);
        expect(x).toBeLessThanOrEqual(638);
        expect(y).toBeGreaterThanOrEqual(1);
        expect(y).toBeLessThanOrEqual(314);
      }
    }
  });
});
