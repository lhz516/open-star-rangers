/**
 * The type-12 Warp lamp in HI (draw `0x4f2a0`, activate `0x4f268`, global update `0x4f3e4`; docs/original/formats/
 * hud.md §4.8; docs/plan/p3/13/spec.md, 消息行、指示条与 Warp 灯 and DC-04). Register it after the type-9 module so
 * the global callbacks keep the original's order 8, 6, 9, 12.
 *
 * - **Global update (③, every logical display, before the records):** with a player, the lamp takes Core's
 *   `flight.combat.player.warp.indicator`, which already applies `0x4f3e4`'s rule and campaign gate; a change sets the
 *   force flag. Without a player the lamp keeps its state, as the original returns before writing it.
 * - **Force flag:** set by the activation and by every lamp change, never cleared, so after the first activation the
 *   draw acts on every call.
 * - **Draw:** not always redrawn: nothing until the flag is set; lamp on → `indicatorWarpInterval` in fonts/1 (advance
 *   6, upper case), colour 0x10, at (x0, y0) over the buffer without a clear; lamp off → the rectangle filled with 0;
 *   then the rectangle is copied. Always redrawn: the text only while lit, no copy. No random draws.
 *
 * Lamp and flag start at the original's static values (off, clear) in every run (Δ-04).
 */
import { glyphsFor } from '../../../content/graphics/glyph-lookup.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { HudTextEntries } from '../../../content/hud/hud-text-payload.ts';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { CockpitDrawContext, CockpitModule } from '../presentation/cockpit-contract.ts';
import { drawText, hudFont } from '../raster/glyph-text.ts';
import { fillRect } from '../raster/indexed-surface.ts';

export interface WarpLampInput {
  /** fonts/1 (`font/hud/8x8-2`), drawn with advance 6 and upper-casing in HI. */
  readonly font: FontPayload;
  readonly hudText: Pick<HudTextEntries, 'indicatorWarpInterval'>;
}

export interface WarpLampState {
  /** `0x175f38`. */
  readonly lit: boolean;
  /** `0x175f3c`. */
  readonly forced: boolean;
}

export interface WarpLampModule extends CockpitModule {
  state(): WarpLampState;
}

const PATH = 'warpLamp';
/** fonts/1's advance in HI (`0x49694`). */
const LAMP_ADVANCE = 6;
const LAMP_COLOUR = 0x10;
const BLANK = 0;

const upperCased = (code: number): number => (code >= 0x61 && code <= 0x7a ? code - 0x20 : code);

/** The Warp lamp of one run. */
export function createWarpLamp({ font, hudText: { indicatorWarpInterval: text } }: WarpLampInput): WarpLampModule {
  const lampFont = hudFont(font, LAMP_ADVANCE, true);
  glyphsFor(font, Array.from(text, (character) => upperCased(character.charCodeAt(0))), `${PATH}.hudText.indicatorWarpInterval`);
  let lit = false;
  let forced = false;

  function draw(context: CockpitDrawContext, { rectangle }: InstrumentRecord): void {
    const { back } = context;
    const { x0, y0, x1, y1 } = rectangle;
    if (context.layout.slot?.alwaysRedraw ?? false) {
      if (lit) drawText(back, lampFont, text, x0, y0, LAMP_COLOUR, `${PATH}.text`);
      return;
    }
    if (!forced) return;
    if (lit) drawText(back, lampFont, text, x0, y0, LAMP_COLOUR, `${PATH}.text`);
    else fillRect(back, x0, y0, x1, y1, BLANK);
    context.publish(rectangle);
  }

  return Object.freeze({
    name: PATH,
    instruments: Object.freeze({ 12: Object.freeze({ activate: () => void (forced = true), draw }) }),
    global(context: CockpitDrawContext): void {
      const player = context.projection.flight.combat.player;
      if (player === null) return;
      if (player.warp.indicator !== lit) forced = true;
      lit = player.warp.indicator;
    },
    state: () => Object.freeze({ lit, forced }),
  });
}
