/**
 * Left page 1, the energy page `0x4d800` (docs/plan/p3/13/spec.md, 左显示屏 页 1 and D-01 定稿 DC-06/DC-09;
 * docs/original/formats/hud.md §4.4).
 *
 * - **When:** with a player, when Core's `energyPageRedraws` differs from the value of the last draw (the original's
 *   flag +0x44, cleared by the draw), when forced, or when the view mode differs from the last draw's (none at first,
 *   the original's −1). Otherwise the previous pixels stay, up to the next count.
 * - **Picture:** BITM 10467 opaque at (x0, y0 + 1), row y0 in index 0, the TABL 10479 records of the levels L1 and L2
 *   with colour key 0 at (x0 + 18, y0 + 12) and (x1 − 18 − w, y0 + 12), rows 0 … h − 2; then three bars of height
 *   h = y1 − y0 − 6 with their bottom at y1 − 3: E / T centred at x0 + (x1 − x0) / 2 (colour 0xF), shield / c5C at
 *   x0 + 8 (colour 0x14, 5 on its outer side) and charge / c74 at x1 − 8 (colour 0xA, 5 on its outer side), each
 *   labelled in fonts/0 colour 8 at (cx − advance / 2, bottom − h). Published unless forced.
 * - **Bars (`0x4d6f0`):** a line every second row from the bottom up to bottom − length, length h when value ≥ scale
 *   (signed), else h × value ÷ scale (i32 `IMUL`, truncating `IDIV`); row i uses entry i of the half-width tables. A
 *   full scale of 0 with a negative value is the original's division fault and a consumer fault here (DC-09).
 * - **Half-widths (`0x4ca80`):** 50 entries clamp(trunc(45 t³), 5, 45), t accumulated in f32 by 0.016 from the last
 *   entry down, so entry 0, the bottom row, is the widest.
 */
import type { InclusiveRectangle } from '../../../content/hud/instruments-payload.ts';
import type { ResourceReading } from '../../../core/projections/projection.ts';
import type { CockpitDrawContext } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { drawText } from '../raster/glyph-text.ts';
import { drawLine, type IndexedSurface } from '../raster/indexed-surface.ts';
import type { LeftDisplayAssets } from './left-display-content.ts';
import { blitColumns, idiv } from './left-display-raster.ts';

/** Bar and label palette indices of `0x4d800` (hud §4.4). */
export const ENERGY_COLOURS = Object.freeze({ middle: 0x0f, left: 0x14, right: 0x0a, label: 0x08 });

const HALF_WIDTH = Object.freeze({ entries: 50, fixed: 5, minimum: 5, maximum: 45, step: Math.fround(0.016) });

/** The half-width table of `0x4ca80`; 45 t³ is evaluated exactly from the f32 t, then truncated. */
export const ENERGY_HALF_WIDTHS: readonly number[] = (() => {
  const table: number[] = [];
  let t = 0;
  for (let index = HALF_WIDTH.entries - 1; index >= 0; index--) {
    table[index] = Math.min(Math.max(truncatedCube45(t), HALF_WIDTH.minimum), HALF_WIDTH.maximum);
    t = Math.fround(t + HALF_WIDTH.step);
  }
  return Object.freeze(table);
})();

const FIXED_HALF_WIDTHS: readonly number[] = Object.freeze(Array<number>(HALF_WIDTH.entries).fill(HALF_WIDTH.fixed));

/** trunc(45 t³) for a non-negative f32 t, exactly (t = m / 2^k with integers m and k). */
function truncatedCube45(t: number): number {
  let [m, k] = [t, 0];
  while (!Number.isInteger(m)) [m, k] = [m * 2, k + 1];
  return Number((45n * BigInt(m) ** 3n) >> BigInt(3 * k));
}

/** From the HI parameter block (hud §4.4). */
const LAYOUT = Object.freeze({ gaugeX: 18, gaugeY: 12, gaugeRowCut: 2, barHeightCut: 6, barBottom: 3, sideBarX: 8 });

export interface EnergyPageState {
  readonly lastView: number | null;
  readonly seenRedraws: number | null;
}

export class EnergyPage {
  readonly #assets: LeftDisplayAssets;
  #lastView: number | null = null;
  #seenRedraws: number | null = null;

  constructor(assets: LeftDisplayAssets) {
    this.#assets = assets;
  }

  draw(context: CockpitDrawContext, rect: InclusiveRectangle, forced: boolean): void {
    const player = context.projection.flight.combat.player;
    if (player === null) return;
    const { viewMode } = context.render;
    if (player.energyPageRedraws === this.#seenRedraws && !forced && viewMode === this.#lastView) return;
    const { back } = context;
    const { pageBackground, levelImages, energyLabels } = this.#assets;
    const { x0, y0, x1, y1 } = rect;
    blitColumns(back, pageBackground, x0, y0 + 1, 'opaque');
    drawLine(back, x0, y0, x1, y0, 0);
    const [left, right] = [levelImages[player.allocation.shieldLevel], levelImages[player.allocation.chargeLevel]];
    blitColumns(back, left, x0 + LAYOUT.gaugeX, y0 + LAYOUT.gaugeY, 'key', left.height - LAYOUT.gaugeRowCut);
    blitColumns(back, right, x1 - LAYOUT.gaugeX - right.width, y0 + LAYOUT.gaugeY, 'key', right.height - LAYOUT.gaugeRowCut);
    const bar = { bottom: y1 - LAYOUT.barBottom, height: y1 - y0 - LAYOUT.barHeightCut };
    const { resources } = player;
    this.#bar(back, resources['spare-power'], x0 + idiv(x1 - x0, 2), bar, ENERGY_COLOURS.middle, ENERGY_HALF_WIDTHS, ENERGY_HALF_WIDTHS, energyLabels[0], 'spare-power');
    this.#bar(back, resources.shield, x0 + LAYOUT.sideBarX, bar, ENERGY_COLOURS.left, FIXED_HALF_WIDTHS, ENERGY_HALF_WIDTHS, energyLabels[1], 'shield');
    this.#bar(back, resources.charge, x1 - LAYOUT.sideBarX, bar, ENERGY_COLOURS.right, ENERGY_HALF_WIDTHS, FIXED_HALF_WIDTHS, energyLabels[2], 'charge');
    if (!forced) context.publish(rect);
    this.#lastView = viewMode;
    this.#seenRedraws = player.energyPageRedraws;
  }

  state(): EnergyPageState {
    return Object.freeze({ lastView: this.#lastView, seenRedraws: this.#seenRedraws });
  }

  /** `0x4d6f0`. */
  #bar(
    back: IndexedSurface, { current, maximum }: ResourceReading, cx: number, { bottom, height }: { readonly bottom: number; readonly height: number },
    colour: number, leftHalf: readonly number[], rightHalf: readonly number[], label: string, name: string,
  ): void {
    let length = height;
    if (current < maximum) {
      if (maximum === 0) throw new PresentationError('invariant-violated', `leftDisplay.energy.${name}`, 'needs a non-zero full scale for a negative value');
      length = idiv(Math.imul(height, current), maximum);
    }
    for (let [y, row] = [bottom, 0]; y >= bottom - length; y -= 2, row++) {
      if (row >= HALF_WIDTH.entries) throw new PresentationError('invariant-violated', `leftDisplay.energy.${name}`, `must fit ${HALF_WIDTH.entries} lines`);
      drawLine(back, cx - leftHalf[row], y, cx + rightHalf[row], y, colour);
    }
    const { regular } = this.#assets;
    drawText(back, regular, label, cx - Math.trunc(regular.advance / 2), bottom - height, ENERGY_COLOURS.label, `leftDisplay.energy.${name}.label`);
  }
}
