import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import { pixelsIn, range, readGlyphs, syntheticFont } from '../messages/messages.test-support.ts';
import type { CockpitDrawContext } from '../presentation/cockpit-contract.ts';
import {
  cockpitBatch, cockpitContent, cockpitTicks, createTestPresentation, FLIGHT_VIEW, isolatedDrawContext, WARP_VIEW, type TickOptions,
} from '../presentation/cockpit.test-support.ts';
import { fillRect } from '../raster/indexed-surface.ts';
import { createWarpLamp, type WarpLampModule } from './warp-lamp.ts';

// hud §4.8 type 12 (`0x4f2a0`, `0x4f268`, `0x4f3e4`) with synthetic content: the lamp record is (300, 466)–(340, 476);
// the text is drawn in fonts/1 (advance 6, upper case) in 0x10 at (x0, y0); six glyphs stay inside the copied columns.

const FONT = syntheticFont();
const CONTENT = cockpitContent();
const RECORD: InstrumentRecord = CONTENT.slots[0].instruments.find(({ type }) => type === 12)!;
const { x0, y0, x1, y1 } = RECORD.rectangle;
const TEXT = 'Warp g';
const LAMP = 0x10;
const JUNK = 0x55;

const lamp = (): WarpLampModule => createWarpLamp({ font: FONT, hudText: { indicatorWarpInterval: TEXT } });
const handler = (module: WarpLampModule) => module.instruments![12]!;

/** A tick with a player whose lamp reading is `indicator`, or without a player (null). */
const lampOptions = (indicator: boolean | null, viewMode = FLIGHT_VIEW): TickOptions =>
  ({ viewMode, patch: { flight: { combat: { player: indicator === null ? null : { warp: { indicator, page: null } } } } } }) as TickOptions;

function context(indicator: boolean | null, { alwaysRedraw = false } = {}) {
  const draw = isolatedDrawContext(1, { ...lampOptions(indicator), content: CONTENT });
  // A panel under the rectangle, so a fill and a draw without a clear can be told apart.
  fillRect(draw.surfaces.back, x0, y0, x1, y1, JUNK);
  const drawContext: CockpitDrawContext = alwaysRedraw
    ? { ...draw.context, layout: { ...draw.context.layout, slot: { ...draw.context.layout.slot!, alwaysRedraw: true } } }
    : draw.context;
  return { ...draw, context: drawContext };
}

/** One logical display of the lamp alone: its global update, then its draw. */
function display(module: WarpLampModule, indicator: boolean | null, options: { readonly alwaysRedraw?: boolean } = {}) {
  const draw = context(indicator, options);
  module.global!(draw.context);
  handler(module).draw(draw.context, RECORD);
  return draw;
}

const text = (surface: Parameters<typeof readGlyphs>[0]): string => readGlyphs(surface, x0, y0, TEXT.length, 6, LAMP);

describe('Warp lamp, type 12 (HI)', () => {
  it('does nothing before the activation while the lamp has not changed', () => {
    const module = lamp();
    const { published, surfaces: { back } } = display(module, false);
    expect(published).toEqual([]);
    expect(new Set(pixelsIn(back, x0, y0, x1, y1).map((entry) => entry.split('=')[1]))).toEqual(new Set([String(JUNK)]));
    expect(module.state()).toEqual({ lit: false, forced: false });
  });

  it('after the activation fills the rectangle with 0 while off and copies it, on every call', () => {
    const module = lamp();
    handler(module).activate!(context(false).context, RECORD);
    for (let call = 0; call < 2; call++) {
      const { published, surfaces: { back, screen } } = display(module, false);
      expect(pixelsIn(back, x0, y0, x1, y1)).toEqual([]);
      expect(published).toEqual([RECORD.rectangle]);
      expect(pixelsIn(screen, 0, 0, 639, 479)).toEqual([]);
    }
    expect(module.state()).toEqual({ lit: false, forced: true });
  });

  it('a change of the lamp forces the draw: lit, the text in fonts/1 upper case, 0x10, at (x0, y0) without a clear', () => {
    const module = lamp();
    const { published, surfaces: { back, screen } } = display(module, true);
    expect(module.state()).toEqual({ lit: true, forced: true });
    expect(text(back)).toBe('WARP G');
    // Pixels the glyphs do not set keep the panel.
    expect(back.indices[(y0 + 7) * 640 + x0]).toBe(JUNK);
    expect(published).toEqual([RECORD.rectangle]);
    expect(text(screen)).toBe('WARP G');
    // Back off: the change keeps the flag, the rectangle is filled.
    const off = display(module, false);
    expect(pixelsIn(off.surfaces.back, x0, y0, x1, y1)).toEqual([]);
  });

  it('keeps the lamp without a player, as the original returns before writing it', () => {
    const module = lamp();
    display(module, true);
    const { surfaces: { back } } = display(module, null);
    expect(module.state()).toEqual({ lit: true, forced: true });
    expect(text(back)).toBe('WARP G');
  });

  it('on an always-redrawn slot draws only the lit text, never fills, never copies, forced or not', () => {
    const module = lamp();
    const off = display(module, false, { alwaysRedraw: true });
    expect(off.published).toEqual([]);
    expect(off.surfaces.back.indices[y0 * 640 + x0]).toBe(JUNK);
    const lit = display(module, true, { alwaysRedraw: true });
    expect(text(lit.surfaces.back)).toBe('WARP G');
    expect(lit.published).toEqual([]);
  });

  it('checks the text against fonts/1 after upper-casing before the run', () => {
    const upper = syntheticFont([0x20, ...range(0x41, 0x5a)]);
    expect(() => createWarpLamp({ font: upper, hudText: { indicatorWarpInterval: TEXT } })).not.toThrow();
    expect(() => createWarpLamp({ font: upper, hudText: { indicatorWarpInterval: 'Warp!' } })).toThrow(ContentContractError);
  });
});

describe('Warp lamp in the presentation', () => {
  it('is activated by the layout select and draws in the tick its global update changes the lamp', () => {
    const module = lamp();
    const cockpit = createTestPresentation({ modules: [module], content: CONTENT, ...lampOptions(false) });
    expect(module.state()).toEqual({ lit: false, forced: true });
    cockpit.advance(cockpitBatch(cockpitTicks(1, 2, (tick) => lampOptions(tick === 2))));
    expect(module.state()).toEqual({ lit: true, forced: true });
    expect(text(cockpit.surfaces().screen)).toBe('WARP G');
  });

  it('in the Warp view publishes the text on index 0 every display, and a 0-tick frame changes nothing', () => {
    const module = lamp();
    const cockpit = createTestPresentation({ modules: [module], content: CONTENT, viewMode: WARP_VIEW, ...lampOptions(true, WARP_VIEW) });
    cockpit.advance(cockpitBatch(cockpitTicks(1, 3, lampOptions(true, WARP_VIEW))));
    const { back, screen } = cockpit.surfaces();
    expect(text(screen)).toBe('WARP G');
    expect(new Set(pixelsIn(screen, x0, y0, x1, y1).map((entry) => entry.split('=')[1]))).toEqual(new Set([String(LAMP)]));
    const before = { state: module.state(), back: back.indices.slice(), screen: screen.indices.slice() };
    cockpit.advance(cockpitBatch([]));
    expect(module.state()).toEqual(before.state);
    expect(back.indices).toEqual(before.back);
    expect(screen.indices).toEqual(before.screen);
  });
});
