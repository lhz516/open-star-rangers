import { describe, expect, it } from 'vitest';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { CockpitDrawContext, CockpitPresentation } from '../presentation/cockpit-contract.ts';
import { copyRect } from '../presentation/cockpit-layout.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import {
  cockpitBatch, cockpitContent, cockpitTicks, createTestPresentation, isolatedDrawContext, WARP_VIEW,
} from '../presentation/cockpit.test-support.ts';
import { createIndexedSurface, fillRect, type IndexedSurface, type PixelRect } from '../raster/indexed-surface.ts';
import { createIndicatorStrip, type IndicatorStripModule } from './indicator-strip.ts';
import { advanceAll, dotFont, pilot } from './overlay.test-support.ts';

// Expectations from docs/original/formats/hud.md §4.8 (Confirmed, code; P3-13/07), derived by hand for the synthetic
// type-9 record: rectangle rows 450–465, first range 230–300 (craft label, 0xF, phase 1), second range 340–410
// (missile label, 10, phase 0), redraw interval 0. Clock = 2 × tick; the blink toggles when the clock is strictly
// past its due (initially 0) and then waits 0x15 units: ticks 1, 12, 23, 34, …

const TEXT = Object.freeze({ indicatorMissileAimed: 'MSSL', indicatorCraftAimed: 'CRFT' });
const strip = (): IndicatorStripModule => createIndicatorStrip({ font: dotFont(), hudText: TEXT });
const FIRST = { x0: 230, x1: 300 };
const SECOND = { x0: 340, x1: 410 };
const [Y0, Y1] = [450, 465];
const BLINKS = [1, 12, 23, 34, 45];
const both = { attackerOnTail: true, missileIncoming: true };
const neither = { attackerOnTail: false, missileIncoming: false };

/** The colour of each label pixel (x0 + 6i, y0), i < 4. */
const label = (surface: IndexedSurface, x: number): number[] => [0, 1, 2, 3].map((index) => surface.indices[Y0 * 640 + x + 6 * index]);
/** Every non-zero index in the inclusive range of rows Y0–Y1. */
function inked(surface: IndexedSurface, { x0, x1 }: { x0: number; x1: number }): number[] {
  const values: number[] = [];
  for (let y = Y0; y <= Y1; y++) for (let x = x0; x <= x1; x++) if (surface.indices[y * 640 + x] !== 0) values.push(surface.indices[y * 640 + x]);
  return values;
}

function present(module: IndicatorStripModule, viewMode?: number): CockpitPresentation {
  return createTestPresentation({ modules: [module], viewMode });
}

describe('indicator strip (type 9)', () => {
  it('alternates the two labels on its own 0x15-unit blink: missile in phase 0, craft in phase 1', () => {
    const module = strip();
    const presentation = present(module);
    const { screen } = presentation.surfaces();
    const run = (from: number, to: number): void => advanceAll(presentation, cockpitTicks(from, to, { patch: pilot({ warnings: both }) }));
    run(1, 1);
    expect(module.state()).toEqual({ phase: 1, due: 23, missileShown: false, craftShown: true });
    expect(label(screen, FIRST.x0)).toEqual([0x0f, 0x0f, 0x0f, 0x0f]);
    expect(inked(screen, SECOND)).toEqual([]);
    run(2, 11);
    expect(module.state()).toEqual({ phase: 1, due: 23, missileShown: false, craftShown: true });
    run(12, 12);
    expect(module.state()).toEqual({ phase: 0, due: 45, missileShown: true, craftShown: false });
    expect(label(screen, SECOND.x0)).toEqual([10, 10, 10, 10]);
    expect(inked(screen, FIRST)).toEqual([]);
    // Negative controls: the missile label is not at the first range's start, the craft label not drawn in phase 0.
    expect(label(screen, FIRST.x0)).toEqual([0, 0, 0, 0]);
    run(13, 23);
    expect(module.state()).toEqual({ phase: 1, due: 67, missileShown: false, craftShown: true });
    expect(label(screen, FIRST.x0)).toEqual([0x0f, 0x0f, 0x0f, 0x0f]);
    expect(inked(screen, SECOND)).toEqual([]);
    expect(presentation.schedule().randomDraws).toBe(0);
  });

  it('keeps a cleared flag\'s range black at every blink step until an always-redraw call clears the mark', () => {
    const module = strip();
    const record = cockpitContent().slots[0].instruments.find(({ type }) => type === 9)!;
    const back = createIndexedSurface(640, 480, true);
    const screen = createIndexedSurface(640, 480);
    const published: PixelRect[] = [];
    const call = (tick: number, warnings: typeof both, always = false): void => {
      const { context } = isolatedDrawContext(tick, { patch: pilot({ warnings }) });
      const layout = { ...context.layout, slot: { ...context.layout.slot!, alwaysRedraw: always } };
      const publish = (rect: PixelRect): void => {
        published.push(rect);
        copyRect(back, screen, rect);
      };
      module.instruments![9]!.draw({ ...context, back, layout, publish } as CockpitDrawContext, record as InstrumentRecord);
    };
    // A panel of index 5 under both ranges, as the frame element would leave it.
    const panel = (): void => fillRect(back, 230, Y0, 410, Y1, 5);
    panel();
    call(1, { attackerOnTail: true, missileIncoming: false });
    expect(module.state().craftShown).toBe(true);
    // The flag clears; the next blink step fills the shown range with 0 and keeps the mark.
    call(12, neither);
    expect(module.state()).toMatchObject({ phase: 0, craftShown: true });
    expect(inked(screen, FIRST)).toEqual([]);
    expect(inked(screen, SECOND).every((value) => value === 5)).toBe(true);
    // A full redraw restores the panel; the next step blackens the range again, and only the steps copy.
    panel();
    published.length = 0;
    call(13, neither);
    expect(published).toEqual([]);
    call(23, neither);
    expect(published).toEqual([{ x0: 230, y0: Y0, x1: 300, y1: Y1 }, { x0: 340, y0: Y0, x1: 410, y1: Y1 }]);
    expect(inked(screen, FIRST)).toEqual([]);
    // An always-redraw call clears both marks and copies nothing; afterwards the range keeps the panel.
    panel();
    published.length = 0;
    call(24, neither, true);
    expect(module.state()).toMatchObject({ missileShown: false, craftShown: false });
    expect(published).toEqual([]);
    call(34, neither);
    expect(published).toEqual([]);
    expect(back.indices[Y0 * 640 + 230]).toBe(5);
  });

  it('runs its body in an always-redraw slot without a blink step', () => {
    const module = strip();
    const record = cockpitContent().slots[0].instruments.find(({ type }) => type === 9)!;
    const { context, published } = isolatedDrawContext(5, { patch: pilot({ warnings: both }) });
    const layout = { ...context.layout, slot: { ...context.layout.slot!, alwaysRedraw: true } };
    module.instruments![9]!.draw({ ...context, layout }, record);
    expect(module.state()).toEqual({ phase: 1, due: 31, missileShown: false, craftShown: true });
    module.instruments![9]!.draw({ ...context, layout }, record);
    // Not due: the body still runs, clears the marks and draws the craft label again; nothing is copied.
    expect(module.state()).toEqual({ phase: 1, due: 31, missileShown: false, craftShown: true });
    expect(published).toEqual([]);
  });

  it('draws nothing and keeps its state without a player, never filling the flags as false', () => {
    const module = strip();
    const presentation = present(module);
    presentation.advance(cockpitBatch(cockpitTicks(1, 1, { patch: pilot({ warnings: both }) })));
    const before = module.state();
    const { screen } = presentation.surfaces();
    advanceAll(presentation, cockpitTicks(2, 30));
    expect(module.state()).toEqual(before);
    expect(label(screen, FIRST.x0)).toEqual([0x0f, 0x0f, 0x0f, 0x0f]);
  });

  it('publishes black ranges with the glyphs in Warp, where B is zeroed before every display', () => {
    const module = strip();
    const presentation = present(module, WARP_VIEW);
    presentation.advance(cockpitBatch(cockpitTicks(1, 1, { viewMode: WARP_VIEW, patch: pilot({ warnings: both }) })));
    const { screen } = presentation.surfaces();
    expect(inked(screen, FIRST)).toEqual([0x0f, 0x0f, 0x0f, 0x0f]);
    expect(inked(screen, SECOND)).toEqual([]);
  });

  it('gives the same state and pictures for any split of the same ticks, and a 0-tick batch changes nothing', () => {
    const ticks = cockpitTicks(1, 50, (tick) => ({ patch: pilot({ warnings: { attackerOnTail: tick % 17 < 9, missileIncoming: tick % 13 < 7 } }) }));
    const runs = [[50], [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], [2, 3, 1, 4, 5, 5, 5, 5, 5, 5, 5, 5]].map((sizes) => {
      const module = strip();
      const presentation = present(module);
      let at = 0;
      for (const size of sizes) {
        for (let start = at; start < at + size; start += 5) presentation.advance(cockpitBatch(ticks.slice(start, Math.min(start + 5, at + size))));
        at += size;
      }
      presentation.advance(cockpitBatch([]));
      return { state: module.state(), screen: [...presentation.surfaces().screen.indices], back: [...presentation.surfaces().back.indices] };
    });
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });

  it('refuses labels other than the 4 bytes the code draws', () => {
    expect(() => createIndicatorStrip({ font: dotFont(), hudText: { ...TEXT, indicatorCraftAimed: 'CRAFT' } })).toThrow(PresentationError);
  });

  it.each(BLINKS)('toggles at tick %i only', (tick) => {
    const module = strip();
    const presentation = present(module);
    presentation.advance(cockpitBatch(cockpitTicks(1, 1, { patch: pilot({ warnings: neither }) })));
    for (let at = 2; at <= tick; at++) presentation.advance(cockpitBatch(cockpitTicks(at, at, { patch: pilot({ warnings: neither }) })));
    const toggles = BLINKS.filter((blink) => blink <= tick).length;
    expect(module.state().phase).toBe(toggles % 2);
  });
});
