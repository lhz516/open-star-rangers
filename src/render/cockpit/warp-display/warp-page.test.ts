import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { RenderWarp } from '../../../core/projections/render-state.ts';
import { pixelsIn, readGlyphs, syntheticFont } from '../messages/messages.test-support.ts';
import type { CockpitDrawContext, CockpitModule } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import {
  cockpitBatch, cockpitContent, cockpitTicks, createTestPresentation, FLIGHT_VIEW, isolatedDrawContext, WARP_VIEW, type TickOptions,
} from '../presentation/cockpit.test-support.ts';
import type { IndexedSurface } from '../raster/indexed-surface.ts';
import { createWarpPage, type WarpPage } from './warp-page.ts';

// hud §4.4 page 6 (`0x4dcec`, `0x4e018`) with synthetic content: the left-display record is (58, 340)–(153, 439), a
// 96-wide HI rectangle, so the trace's columns are x0 + 94 − n + i, its base line runs from 60 to 151 at row 392 and
// the bars span x = 60…151 (W = 91): the angle bar rows 399–411, the error bar rows 413–425, the completion bar rows
// 427–437.

const FONT = syntheticFont();
const RECT = { x0: 58, y0: 340, x1: 153, y1: 439 };
const CONTENT = cockpitContent((content) => {
  content.slots[0].instruments.find(({ type }) => type === 6)!.rectangle = { ...RECT };
});
const RECORD: InstrumentRecord = CONTENT.slots[0].instruments.find(({ type }) => type === 6)!;
/** A 96 × 100 background of indices 0x40 + (x + 3y) mod 0xBF: none is a page colour, and a next-row read shows. */
const BACKGROUND = Object.freeze({
  width: 96, height: 100, indices: Uint8Array.from({ length: 96 * 100 }, (_, pixel) => 0x40 + ((pixel % 96) + 3 * Math.floor(pixel / 96)) % 0xbf),
});
const HUD_TEXT = Object.freeze({ leftWarpTitle: 'Warp', leftWarpBar1Label: 'Ang', leftWarpBar2Label: 'Err', leftWarpBar3Label: 'Done' });
const TRACE = 0x13;
const TICK = 0x11;
const BASE = 0x10;

interface Readings { readonly angle?: number; readonly error?: number; readonly completion?: number; readonly centring?: number }

const page = (): WarpPage => createWarpPage({ font: FONT, background: BACKGROUND, hudText: HUD_TEXT });

/** A tick in the Warp view (or `viewMode`) with page readings (null: none) and the Render State's Warp serial. */
function warpOptions(readings: Readings | null, serial = 1, viewMode = WARP_VIEW): TickOptions {
  const values = readings === null ? null : { angle: 0, error: 0, completion: 0, centring: 0, ...readings };
  return {
    viewMode, patch: { flight: { combat: { player: { warp: { indicator: true, page: values } } } } },
    render: { warp: readings === null ? null : ({ serial } as RenderWarp) },
  } as TickOptions;
}

function drawOnce(warpPage: WarpPage, readings: Readings | null, { serial = 1, tick = 1, alwaysRedraw = false } = {}) {
  const draw = isolatedDrawContext(tick, { ...warpOptions(readings, serial), content: CONTENT });
  const context: CockpitDrawContext = alwaysRedraw ? { ...draw.context, layout: { ...draw.context.layout, slot: { ...draw.context.layout.slot!, alwaysRedraw: true } } } : draw.context;
  const drawn = warpPage.drawWarpPage(context, RECORD);
  return { ...draw, drawn };
}

/** Appends `samples` centrings in one Warp; returns the last draw. */
function drawSeries(warpPage: WarpPage, centrings: readonly number[], readings: Readings = {}) {
  let last = drawOnce(warpPage, { ...readings, centring: centrings[0] });
  for (const centring of centrings.slice(1)) last = drawOnce(warpPage, { ...readings, centring });
  return last;
}

const at = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * surface.width + x];

/** The `x,y` of every pixel of `colour` in a rectangle. */
function pixelsOf(surface: IndexedSurface, colour: number, x0: number, y0: number, x1: number, y1: number): string[] {
  return pixelsIn(surface, x0, y0, x1, y1).filter((entry) => entry.endsWith(`=${colour}`)).map((entry) => entry.split('=')[0]);
}

/** The columns of row y in `colour`. */
const columnsOf = (surface: IndexedSurface, colour: number, y: number): number[] =>
  pixelsOf(surface, colour, 0, y, 639, y).map((entry) => Number(entry.split(',')[0]));

const everySecond = (first: number, last: number): number[] => Array.from({ length: Math.floor((last - first) / 2) + 1 }, (_, index) => first + 2 * index);

describe('Warp page 6 (HI)', () => {
  it('draws the background over 97 columns, row y0 in 0, the base line, the title and publishes the rectangle', () => {
    const { surfaces: { back, screen }, published, drawn } = drawOnce(page(), { centring: 0.5 });
    expect(drawn).toBe(true);
    // Background at (x0, y0 + 1); column 96 of row r is pixel 0 of row r + 1; the last row has only 96 columns.
    expect(at(back, RECT.x0 + 1, RECT.y0 + 1)).toBe(BACKGROUND.indices[1]);
    expect(at(back, RECT.x0 + 96, RECT.y0 + 1 + 30)).toBe(BACKGROUND.indices[31 * 96]);
    expect(at(back, RECT.x0 + 96, RECT.y0 + 100)).toBe(0);
    expect(pixelsIn(back, RECT.x0, RECT.y0, RECT.x1, RECT.y0)).toEqual([]);
    // Base line x0 + 2 … x1 − 2 at y0 + 52, nothing beyond.
    expect(columnsOf(back, BASE, RECT.y0 + 52)).toEqual(Array.from({ length: 92 }, (_, index) => RECT.x0 + 2 + index));
    // Title in fonts/0 (advance 8, no upper-casing) at (x1 − 66, y0 + 2), colour 8.
    expect(readGlyphs(back, RECT.x1 - 66, RECT.y0 + 2, 4, 8, 8)).toBe('Warp');
    expect(published).toEqual([RECT]);
    expect(pixelsIn(screen, RECT.x0, RECT.y0, RECT.x1, RECT.y1)).toEqual(pixelsIn(back, RECT.x0, RECT.y0, RECT.x1, RECT.y1));
    // Column x0 + 96 lies outside the rectangle: drawn in B, not copied.
    expect(at(screen, RECT.x0 + 96, RECT.y0 + 1)).toBe(0);
  });

  it('reproduces srangers_066\'s ticks: n = 10 samples of c = 1 give 12 tick pixels at columns 84/87/90/93 and rows 51/53/54', () => {
    const { surfaces: { back } } = drawSeries(page(), Array(10).fill(1));
    const ticks = [84, 87, 90, 93].flatMap((column) => [51, 53, 54].map((row) => `${RECT.x0 + column},${RECT.y0 + row}`));
    expect(pixelsOf(back, TICK, RECT.x0, RECT.y0, RECT.x1, RECT.y1).sort()).toEqual(ticks.sort());
    // The trace lies under the base line: no trace pixel shows.
    expect(pixelsOf(back, TRACE, RECT.x0, RECT.y0, RECT.x1, RECT.y1)).toEqual([]);
  });

  it('joins each point to the previous one in 0x13 and ticks every third from y + 2 to y0 + 51', () => {
    // trunc(c × 50) = 0…6: points (x0 + 87 + i, y0 + 2 + i), one-step diagonals.
    const warpPage = page();
    const { surfaces: { back } } = drawSeries(warpPage, [0, 1, 2, 3, 4, 5, 6].map((h) => (h + 0.5) / 50));
    expect(warpPage.history()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const point = (index: number) => [RECT.x0 + 87 + index, RECT.y0 + 2 + index] as const;
    const trace = [0, 1, 2, 3, 4, 5, 6].map((index) => point(index).join(','));
    expect(pixelsOf(back, TRACE, RECT.x0, RECT.y0, RECT.x1, RECT.y0 + 51).sort()).toEqual(trace.sort());
    const ticks = [0, 3, 6].flatMap((index) => {
      const [x, y] = point(index);
      return Array.from({ length: RECT.y0 + 51 - (y + 2) + 1 }, (_, row) => `${x},${y + 2 + row}`);
    });
    expect(pixelsOf(back, TICK, RECT.x0, RECT.y0, RECT.x1, RECT.y0 + 51).sort()).toEqual(ticks.sort());
  });

  it('draws a single sample only as its tick: a point is drawn by the line from the one before or to the one after', () => {
    const { surfaces: { back } } = drawOnce(page(), { centring: 0.5 });
    // n = 1, h = 25: the point (x0 + 93, y0 + 27) keeps the background; the tick runs from y0 + 29 to y0 + 51.
    expect(pixelsOf(back, TRACE, RECT.x0, RECT.y0, RECT.x1, RECT.y1)).toEqual([]);
    expect(at(back, RECT.x0 + 93, RECT.y0 + 27)).toBe(BACKGROUND.indices[26 * 96 + 93]);
    expect(pixelsOf(back, TICK, RECT.x0, RECT.y0, RECT.x1, RECT.y1)).toEqual(Array.from({ length: 23 }, (_, row) => `${RECT.x0 + 93},${RECT.y0 + 29 + row}`));
  });

  it('keeps at most 94 samples, shifting the oldest out, with the oldest at x0', () => {
    const warpPage = page();
    const centrings = Array.from({ length: 95 }, (_, index) => ((index % 50) + 0.5) / 50);
    const { surfaces: { back } } = drawSeries(warpPage, centrings);
    const expected = centrings.slice(1).map((centring) => Math.trunc(centring * 50));
    expect(warpPage.history()).toEqual(expected);
    // Sample 1 (h = 1) is now index 0 at x0 with its tick from y0 + 5 down to y0 + 51; nothing left of x0.
    expect(at(back, RECT.x0, RECT.y0 + 5)).toBe(TICK);
    expect(pixelsIn(back, 0, RECT.y0, RECT.x0 - 1, RECT.y1)).toEqual([]);
  });

  it('appends trunc(c × 50) with the boundary values 0 and 50', () => {
    const warpPage = page();
    drawSeries(warpPage, [0, 0.0199999, 0.02, 0.999, 1]);
    expect(warpPage.history()).toEqual([0, 0, 1, 49, 50]);
  });

  it('starts a new history at another Warp serial and after a draw without readings', () => {
    const warpPage = page();
    drawSeries(warpPage, [1, 1, 1]);
    expect(warpPage.serial()).toBe(1);
    drawOnce(warpPage, { centring: 0.5 }, { serial: 2 });
    expect(warpPage.history()).toEqual([25]);
    expect(warpPage.serial()).toBe(2);
    // Without readings (no player, or not in the Warp view): nothing drawn or published, the history emptied.
    const none = drawOnce(warpPage, null);
    expect(none.drawn).toBe(false);
    expect(none.published).toEqual([]);
    expect(pixelsIn(none.surfaces.back, 0, 0, 639, 479)).toEqual([]);
    expect(warpPage.history()).toEqual([]);
    expect(warpPage.serial()).toBeNull();
    // A retry of the same Warp serial after that does not inherit the old trace either.
    drawOnce(warpPage, { centring: 1 }, { serial: 2 });
    expect(warpPage.history()).toEqual([50]);
  });

  it('draws nothing outside the Warp view and with readings but no transit', () => {
    const warpPage = page();
    drawSeries(warpPage, [1, 1]);
    const flight = isolatedDrawContext(3, { ...warpOptions(null, 1, FLIGHT_VIEW), content: CONTENT });
    expect(warpPage.drawWarpPage(flight.context, RECORD)).toBe(false);
    expect(flight.published).toEqual([]);
    const noTransit = isolatedDrawContext(4, { ...warpOptions({ centring: 1 }), render: { warp: null }, content: CONTENT });
    expect(warpPage.drawWarpPage(noTransit.context, RECORD)).toBe(false);
    expect(pixelsIn(noTransit.surfaces.back, 0, 0, 639, 479)).toEqual([]);
    expect(warpPage.history()).toEqual([]);
  });

  it('draws the angle bar from both ends: two end lines at a = 0, 46 lines at a = 1, trunc(45 a) past each end', () => {
    const top = RECT.y1 - 40;
    const bottom = RECT.y1 - 28;
    const angle = (value: number) => drawOnce(page(), { angle: value }).surfaces.back;
    for (const [value, left, right] of [[0, [60], [151]], [0.5, everySecond(60, 82), everySecond(129, 151)], [1, everySecond(60, 104), everySecond(107, 151)]] as const) {
      const back = angle(value);
      const columns = [...left, ...right];
      expect(columnsOf(back, 0x0f, top)).toEqual(columns);
      expect(columnsOf(back, 0x0f, bottom)).toEqual(columns);
      expect(pixelsOf(back, 0x0f, RECT.x0, top - 1, RECT.x1, top - 1)).toEqual([]);
      expect(pixelsOf(back, 0x0f, RECT.x0, bottom + 1, RECT.x1, bottom + 1)).toEqual([]);
    }
    expect(columnsOf(angle(1), 0x0f, top)).toHaveLength(46);
    // The label is centred: ((60 + 151) >> 1) − (3 >> 1) × 8 = 97, at row top + 1, over the lines.
    expect(readGlyphs(angle(1), 97, top + 1, 3, 8, 8)).toBe('Ang');
  });

  it('draws the error and completion bars from the left: none at 0, trunc(91 v) columns exclusive, labels right-aligned', () => {
    const values = [[0, []], [0.25, everySecond(60, 80)], [1, everySecond(60, 150)]] as const;
    for (const [value, columns] of values) {
      const { surfaces: { back } } = drawOnce(page(), { error: value, completion: value });
      expect(columnsOf(back, 0x0a, RECT.y1 - 26)).toEqual(columns);
      expect(columnsOf(back, 0x0a, RECT.y1 - 14)).toEqual(columns);
      expect(pixelsOf(back, 0x0a, RECT.x0, RECT.y1 - 13, RECT.x1, RECT.y1 - 13)).toEqual([]);
      // The completion bar shares the base line's colour; its rows are y1 − 12 … y1 − 2.
      expect(columnsOf(back, 0x10, RECT.y1 - 12)).toEqual(columns);
      expect(columnsOf(back, 0x10, RECT.y1 - 2)).toEqual(columns);
      expect(columnsOf(back, 0x10, RECT.y1 - 1)).toEqual([]);
    }
    const { surfaces: { back } } = drawOnce(page(), { error: 1, completion: 1 });
    // x = 151 − (len × 8 + 2): 'Err' at 125, 'Done' at 117.
    expect(readGlyphs(back, 125, RECT.y1 - 25, 3, 8, 8)).toBe('Err');
    expect(readGlyphs(back, 117, RECT.y1 - 11, 4, 8, 8)).toBe('Done');
    expect(columnsOf(back, 0x0a, RECT.y1 - 26)).toHaveLength(46);
  });

  it('draws but does not publish on an always-redrawn slot', () => {
    const { drawn, published, surfaces: { back } } = drawOnce(page(), { centring: 1 }, { alwaysRedraw: true });
    expect(drawn).toBe(true);
    expect(published).toEqual([]);
    expect(at(back, RECT.x0 + 2, RECT.y0 + 52)).toBe(BASE);
  });

  it('rejects a reading outside [0, 1] before any change', () => {
    const warpPage = page();
    drawSeries(warpPage, [1, 1]);
    for (const readings of [{ angle: 1.5 }, { error: -0.1 }, { completion: Number.NaN }, { centring: 2 }]) {
      const draw = isolatedDrawContext(1, { ...warpOptions(readings), content: CONTENT });
      expect(() => warpPage.drawWarpPage(draw.context, RECORD)).toThrow(PresentationError);
      expect(draw.published).toEqual([]);
      expect(pixelsIn(draw.surfaces.back, 0, 0, 639, 479)).toEqual([]);
    }
    expect(warpPage.history()).toEqual([50, 50]);
  });

  it('rejects texts with a byte outside fonts/0\'s character map before the run', () => {
    const narrow = syntheticFont([0x41, 0x42]);
    expect(() => createWarpPage({ font: narrow, background: BACKGROUND, hudText: HUD_TEXT })).toThrow(ContentContractError);
    expect(() => createWarpPage({ font: FONT, background: BACKGROUND, hudText: { ...HUD_TEXT, leftWarpBar3Label: 'D\x7fne' } })).toThrow(/leftWarpBar3Label/);
  });
});

/**
 * A stand-in for the type-6 dispatcher's page-6 refresh (hud §4.4: drawn when the sample is strictly past the next
 * refresh, then next refresh := sample + 0x10), so the page runs in the real presentation's schedule.
 */
function pageSixDispatcher(warpPage: WarpPage): CockpitModule {
  let nextRefresh = 0;
  return {
    name: 'page-6-dispatcher',
    instruments: {
      6: {
        draw: (context, record) => {
          if (!(context.clock > nextRefresh)) return;
          warpPage.drawWarpPage(context, record);
          nextRefresh = context.clock + 0x10;
        },
      },
    },
  };
}

describe('Warp page 6 in the presentation', () => {
  // c = tick / 100 at each tick, so each sample names the tick whose projection it came from.
  const ticks = (first: number, last: number, serial = 1) => cockpitTicks(first, last, (tick) => warpOptions({ centring: tick / 100 }, serial));

  function presentation() {
    const warpPage = page();
    const cockpit = createTestPresentation({ modules: [pageSixDispatcher(warpPage)], viewMode: WARP_VIEW, content: CONTENT, ...warpOptions({}) });
    return { warpPage, cockpit };
  }

  it('appends one same-tick sample per due refresh, every 9 ticks at 2 units, not at the equal sample', () => {
    const { warpPage, cockpit } = presentation();
    cockpit.advance(cockpitBatch(ticks(1, 5)));
    cockpit.advance(cockpitBatch(ticks(6, 9)));
    // Tick 1 (clock 2 > 0) appended; tick 9's clock 18 equals 2 + 0x10 and does not.
    expect(warpPage.history()).toEqual([0]);
    cockpit.advance(cockpitBatch(ticks(10, 14)));
    cockpit.advance(cockpitBatch(ticks(15, 19)));
    expect(warpPage.history()).toEqual([0, 5, 9]);
  });

  it('keeps the published page on S between refreshes while B is refilled with 0, and a 0-tick frame changes nothing', () => {
    const { warpPage, cockpit } = presentation();
    cockpit.advance(cockpitBatch(ticks(1, 1)));
    const { back, screen } = cockpit.surfaces();
    const shown = screen.indices.slice();
    expect(at(screen, RECT.x0 + 2, RECT.y0 + 52)).toBe(BASE);
    cockpit.advance(cockpitBatch(ticks(2, 3)));
    expect(at(back, RECT.x0 + 2, RECT.y0 + 52)).toBe(0);
    expect(screen.indices).toEqual(shown);
    const before = { history: warpPage.history(), schedule: cockpit.schedule(), back: back.indices.slice() };
    cockpit.advance(cockpitBatch([]));
    expect(warpPage.history()).toEqual(before.history);
    expect(cockpit.schedule()).toEqual(before.schedule);
    expect(back.indices).toEqual(before.back);
    expect(screen.indices).toEqual(shown);
  });

  it('does not carry a trace across Warps or runs', () => {
    const { warpPage, cockpit } = presentation();
    cockpit.advance(cockpitBatch(ticks(1, 5)));
    cockpit.advance(cockpitBatch(ticks(6, 10)));
    expect(warpPage.history()).toEqual([0, 5]);
    // A later Warp (serial 2) in the same run: its first refresh starts a new trace.
    cockpit.advance(cockpitBatch(ticks(11, 15, 2)));
    cockpit.advance(cockpitBatch(ticks(16, 19, 2)));
    expect(warpPage.history()).toEqual([9]);
    expect(warpPage.serial()).toBe(2);
    // A retry is a new run with new modules: nothing is shared.
    expect(presentation().warpPage.history()).toEqual([]);
  });
});
