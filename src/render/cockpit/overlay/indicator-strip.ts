/**
 * Instrument type 9, the two warning labels (`0x4eb3c`; docs/original/formats/hud.md §4.8; P3-13 spec, 消息行、指示条与
 * Warp 灯, DC-11 Δ-04 and D-02 定稿 DD-02/DD-03), as one run's module.
 *
 * - **Inputs:** the two flags Core sampled for the same tick (FA-01's partition-level `communications.warnings`: the
 *   missile flag `0x175f14` is `missileIncoming`, the craft flag `0x175f10` `attackerOnTail`). Without a player the
 *   strip is not drawn and keeps its state, and nothing is filled in as false. No random numbers.
 * - **Blink:** its own clock, separate from the warning update's: when the clock is strictly past the due the phase
 *   toggles and the due becomes clock + 0x15; the body runs only then or in an always-redraw slot.
 * - **Labels:** the missile text in colour 10 at (second range start, y0), shown in phase 0; the craft text in 0xF at
 *   (first range start, y0), shown in phase 1; fonts/1, 4 bytes each. A set flag draws its label in its phase when not
 *   shown and marks it shown, and fills its range (rows y0–y1) with 0 in the other phase when shown and clears the mark.
 *   A clear flag fills a shown label's range with 0 without clearing the mark, at every blink step, so the range stays
 *   black; only an always-redraw call clears the marks (F2), and each run starts with them clear (Δ-04).
 * - **Copy:** when the slot is not always-redraw and anything was drawn or filled, both ranges are copied to S.
 */
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { HudTextEntries } from '../../../content/hud/hud-text-payload.ts';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { CockpitDrawContext, CockpitModule } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { drawText, hudFont, type HudFont } from '../raster/glyph-text.ts';
import { createIndexedSurface, fillRect } from '../raster/indexed-surface.ts';

export interface IndicatorStripInput {
  /** fonts/1 (`font/hud/8x8-2`), advance 6 and upper-casing in HI. */
  readonly font: FontPayload;
  readonly hudText: Pick<HudTextEntries, 'indicatorMissileAimed' | 'indicatorCraftAimed'>;
}

export interface IndicatorStripState {
  readonly phase: 0 | 1;
  readonly due: number;
  readonly missileShown: boolean;
  readonly craftShown: boolean;
}

export interface IndicatorStripModule extends CockpitModule {
  state(): IndicatorStripState;
}

const PATH = 'cockpit.indicatorStrip';
const ADVANCE = 6;
/** The length `0x4eb3c` passes for both labels. */
const LABEL_BYTES = 4;
const BLINK_PERIOD = 0x15;
const MISSILE_COLOUR = 10;
const CRAFT_COLOUR = 0x0f;

/** The strip of one run. */
export function createIndicatorStrip({ font: payload, hudText }: IndicatorStripInput): IndicatorStripModule {
  const font: HudFont = hudFont(payload, ADVANCE, true);
  const probe = createIndexedSurface(1, 1);
  for (const key of ['indicatorMissileAimed', 'indicatorCraftAimed'] as const) {
    if (hudText[key].length !== LABEL_BYTES) throw new PresentationError('invalid-input', `${PATH}.hudText.${key}`, `must be the ${LABEL_BYTES} bytes the code draws`);
    drawText(probe, font, hudText[key], -0x4000, -0x4000, 0, `${PATH}.hudText.${key}`);
  }
  let phase: 0 | 1 = 0;
  let due = 0;
  let missileShown = false;
  let craftShown = false;

  function draw(context: CockpitDrawContext, { rectangle: { y0, y1 }, params }: InstrumentRecord): void {
    const { communications } = context.projection;
    if (communications.player === null) return;
    const { warnings } = communications;
    const { back, clock } = context;
    const always = context.layout.slot?.alwaysRedraw ?? false;
    const blink = due >>> 0 < clock >>> 0;
    if (!blink && !always) return;
    if (blink) {
      phase = phase === 0 ? 1 : 0;
      due = (clock + BLINK_PERIOD) >>> 0;
    }
    if (always) missileShown = craftShown = false;
    const [first, firstEnd, second, secondEnd] = params;
    let changed = false;
    const clear = (x0: number, x1: number): void => {
      fillRect(back, x0, y0, x1, y1, 0);
      changed = true;
    };
    const label = (text: string, x: number, colour: number): void => {
      drawText(back, font, text, x, y0, colour, `${PATH}.label`);
      changed = true;
    };
    if (!warnings.missileIncoming) {
      if (missileShown) clear(second, secondEnd);
    } else if (phase === 0) {
      if (!missileShown) label(hudText.indicatorMissileAimed, second, MISSILE_COLOUR);
      missileShown = true;
    } else if (missileShown) {
      clear(second, secondEnd);
      missileShown = false;
    }
    if (!warnings.attackerOnTail) {
      if (craftShown) clear(first, firstEnd);
    } else if (phase === 0) {
      if (craftShown) clear(first, firstEnd);
      craftShown = false;
    } else {
      if (!craftShown) label(hudText.indicatorCraftAimed, first, CRAFT_COLOUR);
      craftShown = true;
    }
    if (always || !changed) return;
    context.publish({ x0: first, y0, x1: firstEnd, y1 });
    context.publish({ x0: second, y0, x1: secondEnd, y1 });
  }

  return {
    name: 'indicator-strip',
    instruments: { 9: { draw } },
    state: () => Object.freeze({ phase, due, missileShown, craftShown }),
  };
}
