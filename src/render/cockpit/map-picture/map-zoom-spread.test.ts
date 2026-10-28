import { describe, expect, it } from 'vitest';
import { spreadZoomIcons, type ZoomEntry } from './map-zoom-spread.ts';

// hud §4.9 zoom de-overlap 0x4b56c (P3-13/06): record-sized steps, touching boxes overlap, entry 0 fixed, bounds,
// counter exhaustion and the comparison limit; a different algorithm from the main map's ±3 steps.

const member = (x: number, y: number, width = 5, height = 3): ZoomEntry => ({ member: true, width, height, x, y });
const other = (x: number, y: number): ZoomEntry => ({ member: false, width: 0, height: 0, x, y });
const places = (entries: readonly ZoomEntry[]): [number, number][] => entries.map(({ x, y }) => [x, y]);

describe('spreadZoomIcons (0x4b56c)', () => {
  it('never moves entry 0 and moves a later overlapping member by (+sx, +sy) of its own record', () => {
    const entries = [member(50, 50), member(50, 50)];
    spreadZoomIcons(entries, 189, 150);
    expect(places(entries)).toEqual([[50, 50], [57, 55]]);
  });

  it('treats touching boxes as overlapping and separate boxes as not', () => {
    // Boxes x ± 2: centres 4 apart touch at one column.
    const touching = [member(50, 50), member(54, 50)];
    spreadZoomIcons(touching, 189, 150);
    expect(places(touching)).toEqual([[50, 50], [61, 55]]);
    const apart = [member(50, 50), member(55, 50)];
    spreadZoomIcons(apart, 189, 150);
    expect(places(apart)).toEqual([[50, 50], [55, 50]]);
  });

  it('fixes icon list entry 0 even when it is no member, and ignores non-members', () => {
    const entries = [other(50, 50), member(60, 60), member(60, 60), other(67, 65)];
    spreadZoomIcons(entries, 189, 150);
    expect(places(entries)).toEqual([[50, 50], [67, 65], [60, 60], [67, 65]]);
  });

  it('uses each record\'s own size for the step and box', () => {
    const entries = [member(50, 50, 9, 9), member(55, 50, 3, 1)];
    spreadZoomIcons(entries, 189, 150);
    // Box of entry 0: 46–54; entry 1 (box 54–56) touches it; step (5, 3).
    expect(places(entries)).toEqual([[50, 50], [60, 53]]);
  });

  it('tries the next step at once when a step leaves [0, width] × [0, height]', () => {
    // From (186, 148): (+7, +5) leaves the window, (−7, +5) too, (−7, −5) stays.
    const entries = [member(186, 148), member(186, 148)];
    spreadZoomIcons(entries, 189, 150);
    expect(places(entries)).toEqual([[186, 148], [179, 143]]);
    // The edges themselves are inside.
    const edge = [member(182, 145), member(182, 145)];
    spreadZoomIcons(edge, 189, 150);
    expect(places(edge)).toEqual([[182, 145], [189, 150]]);
  });

  it('returns to the original place after the eighth step, which ends the scan', () => {
    const entries = [member(50, 50, 101, 101), member(50, 50), member(50, 50)];
    spreadZoomIcons(entries, 189, 150);
    // Every step of entry 1 still overlaps entry 0's box; entry 2 likewise.
    expect(places(entries)).toEqual([[50, 50], [50, 50], [50, 50]]);
  });

  it('restores an original place outside the window once the counter has run out', () => {
    const entries = [member(5, 1), member(5, 1)];
    spreadZoomIcons(entries, 4, 2);
    expect(places(entries)).toEqual([[5, 1], [5, 1]]);
  });

  it('ends a scan after 10,000 visits, members or not', () => {
    // Entry 1 meets the big last entry once per pass of 4,000 visits: two moves, then the limit stops the third pass.
    const entries = [other(0, 0), member(50, 50), ...Array.from({ length: 3997 }, () => other(50, 50)), member(50, 50, 101, 101)];
    spreadZoomIcons(entries, 189, 150);
    expect(entries[1]).toMatchObject({ x: 43, y: 55 });
    // The big entry then steps from (50, 50) by (103, 103) multiples until it is inside and clear: (+sx, 0).
    expect(entries[3999]).toMatchObject({ x: 153, y: 50 });
  });
});
