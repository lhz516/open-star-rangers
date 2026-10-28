/**
 * The left display's Warp page 6 in HI (`0x4dcec` and its bar routine `0x4e018`; docs/original/formats/hud.md §4.4;
 * executable.md T8 and "Warp progress, completion and interruptions"; docs/plan/p3/13/spec.md, 左显示屏 and DC-08).
 * The left display's type-6 dispatcher calls `drawWarpPage` with its record when page 6 is due (period 0x10, strict)
 * and not in interference; the page, its refresh and the SNIP gate stay the dispatcher's. Every call is one refresh
 * and appends one sample, so the trace advances only with the dispatcher's due calls of successful ticks: a frame
 * without a tick, a repeated draw of the surfaces or a query changes nothing. Nothing here writes Core state.
 *
 * - **Gate:** the readings are the tick's `flight.combat.player.warp.page` (a, s, p, c in [0, 1]) and the Warp transit
 *   of the same tick's Render State. Without both (any view but 1, no player) nothing is drawn and the history is
 *   emptied, as the original does outside view 1; the page number is Core's and is not changed here.
 * - **History (`+0x4C` = 94 entries of trunc(c × 50), 0–50):** emptied when the Render State's `warp.serial` differs
 *   from the one of the last append, in place of the original's Warp-start flag `0x175d64`: a new Warp, or another
 *   one in the same run, never inherits the previous trace. A full history shifts left by one before the append.
 * - **Drawing:** BITM 10467 opaque at (x0, y0 + 1) over 97 columns and row y0 in index 0; point i of n at
 *   (x0 + 94 − n + i, y0 + 2 + h[i]), joined to the previous point in 0x13, every third (i mod 3 = 0) with a vertical
 *   line from y + 2 to y0 + 51 in 0x11; the base line (x0 + 2 … x1 − 2, y0 + 52) in 0x10 over the trace; the title in
 *   fonts/0, colour 8, at (x1 − 66, y0 + 2); then the bars a, s and p from x0 + 2 to x1 − 2 with their labels in
 *   fonts/0, colour 8. The rectangle is copied when the slot is not always redrawn.
 */
import { glyphsFor } from '../../../content/graphics/glyph-lookup.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { HudTextEntries } from '../../../content/hud/hud-text-payload.ts';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { CombatWarpReading } from '../../../core/projections/projection.ts';
import type { CockpitDrawContext } from '../presentation/cockpit-contract.ts';
import { COCKPIT_LIMITS, PresentationError } from '../presentation/cockpit-limits.ts';
import { drawText, hudFont, type HudFont } from '../raster/glyph-text.ts';
import { blit, drawLine, type IndexedSource, type IndexedSurface } from '../raster/indexed-surface.ts';

export type WarpPageText = Pick<HudTextEntries, 'leftWarpTitle' | 'leftWarpBar1Label' | 'leftWarpBar2Label' | 'leftWarpBar3Label'>;

export interface WarpPageInput {
  /** fonts/0 (`font/hud/8x8-1`), drawn with its cell width as advance. */
  readonly font: FontPayload;
  /** BITM 10467, `image/hud/display-page/background`. */
  readonly background: IndexedSource;
  readonly hudText: WarpPageText;
}

export interface WarpPage {
  /**
   * One refresh of page 6 with the type-6 record: appends a sample, draws and copies the page. False, with nothing
   * drawn and the history emptied, without the tick's Warp readings. Bound, so it can be the dispatcher's page-6 drawer.
   */
  readonly drawWarpPage: (context: CockpitDrawContext, record: InstrumentRecord) => boolean;
  /** The history, oldest first. */
  history(): readonly number[];
  /** The Warp serial of the last append; null before the first one and after an emptying without readings. */
  serial(): number | null;
}

type WarpReadings = NonNullable<CombatWarpReading['page']>;

const PATH = 'warpPage';
const TEXT_KEYS: readonly (keyof WarpPageText)[] = ['leftWarpTitle', 'leftWarpBar1Label', 'leftWarpBar2Label', 'leftWarpBar3Label'];
/** HI parameter block `0x175e88`: the trace's height scale (+0x50) and the offsets from the rectangle (+0x54–+0x80). */
const TRACE_SCALE = 50;
const TRACE_TOP = 2;
const TICK_BOTTOM = 51;
const BASE_LINE = 52;
const BASE_INSET = 2;
const TITLE_LEFT = 66;
const BAR_INSET = 2;
const ANGLE_TOP = 40;
const ERROR_TOP = 26;
const COMPLETION_TOP = 12;
const BAR_HEIGHT = 12;
/** `0x4e018` places its labels at 8 pixels a character, whatever the font's advance. */
const LABEL_CELL = 8;
const TICK_PITCH = 3;
const BLANK = 0;
const TRACE_COLOUR = 0x13;
const TICK_COLOUR = 0x11;
const BASE_COLOUR = 0x10;
const TEXT_COLOUR = 8;
const ANGLE_COLOUR = 0x0f;
const ERROR_COLOUR = 0x0a;
const COMPLETION_COLOUR = 0x10;

/** Core's contract: every reading lies in [0, 1]. */
function reading(readings: WarpReadings, name: keyof WarpReadings): number {
  const value = readings[name];
  if (!(value >= 0 && value <= 1)) throw new PresentationError('invariant-violated', `${PATH}.readings.${name}`, 'must be from 0 to 1');
  return value;
}

/**
 * The page background as `0x59608` copies it for every left-display page: rows 0…h − 1 of columns 0…w at (x, y), the
 * extra column of a row read as the next row's first pixel; the last row's extra column would read past the image and
 * is not reproduced (the frame covers that column).
 */
function drawBackground(back: IndexedSurface, image: IndexedSource, x: number, y: number): void {
  const { width, height } = image;
  if (height > 1) blit(back, image, x, y, 'opaque', { x0: 0, y0: 0, x1: width, y1: height - 2 });
  blit(back, image, x, y + height - 1, 'opaque', { x0: 0, y0: height - 1, x1: width - 1, y1: height - 1 });
}

/**
 * `0x4e018`: vertical lines from row `top` to `bottom` every second column. From both ends: trunc(((x1 − x0) >> 1) × v)
 * columns past each end, both ends included (v = 0 still draws the two end lines), the label centred. Otherwise
 * trunc((x1 − x0) × v) columns from x0, the end excluded (v = 0 draws none), the label right-aligned. Labels at row
 * top + 1.
 */
function drawBar(back: IndexedSurface, font: HudFont, x0: number, top: number, x1: number, bottom: number, value: number, fromBothEnds: boolean, colour: number, label: string, path: string): void {
  let labelX: number;
  if (fromBothEnds) {
    const length = Math.trunc(((x1 - x0) >> 1) * value);
    for (let x = x0; x <= x0 + length; x += 2) drawLine(back, x, top, x, bottom, colour);
    for (let x = x1; x >= x1 - length; x -= 2) drawLine(back, x, top, x, bottom, colour);
    labelX = ((x0 + x1) >> 1) - (label.length >> 1) * LABEL_CELL;
  } else {
    const length = Math.trunc((x1 - x0) * value);
    for (let x = x0; x < x0 + length; x += 2) drawLine(back, x, top, x, bottom, colour);
    labelX = x1 - (label.length * LABEL_CELL + 2);
  }
  drawText(back, font, label, labelX, top + 1, TEXT_COLOUR, path);
}

/** The Warp page of one run; its history starts empty (Δ-04: nothing carries over between runs). */
export function createWarpPage({ font, background, hudText }: WarpPageInput): WarpPage {
  const regular = hudFont(font, font.cellWidth, false);
  for (const key of TEXT_KEYS) glyphsFor(font, Array.from(hudText[key], (character) => character.charCodeAt(0)), `${PATH}.hudText.${key}`);
  const { leftWarpTitle: title, leftWarpBar1Label: angleLabel, leftWarpBar2Label: errorLabel, leftWarpBar3Label: completionLabel } = hudText;
  const history: number[] = [];
  let lastSerial: number | null = null;

  function append(serial: number, centring: number): void {
    if (serial !== lastSerial) history.length = 0;
    lastSerial = serial;
    if (history.length === COCKPIT_LIMITS.warpTrail) history.shift();
    history.push(Math.trunc(centring * TRACE_SCALE));
  }

  function drawTrace(back: IndexedSurface, x0: number, y0: number): void {
    const start = x0 + COCKPIT_LIMITS.warpTrail - history.length;
    let previousX = -1;
    let previousY = 0;
    history.forEach((sample, index) => {
      const x = start + index;
      const y = y0 + TRACE_TOP + sample;
      if (previousX > 0) drawLine(back, previousX, previousY, x, y, TRACE_COLOUR);
      if (index % TICK_PITCH === 0) drawLine(back, x, y + TRACE_TOP, x, y0 + TICK_BOTTOM, TICK_COLOUR);
      [previousX, previousY] = [x, y];
    });
  }

  const drawWarpPage = (context: CockpitDrawContext, { rectangle }: InstrumentRecord): boolean => {
    const readings = context.projection.flight.combat.player?.warp.page ?? null;
    const transit = context.render.warp;
    if (readings === null || transit === null) {
      history.length = 0;
      lastSerial = null;
      return false;
    }
    const [angle, error, completion, centring] = (['angle', 'error', 'completion', 'centring'] as const).map((name) => reading(readings, name));
    append(transit.serial, centring);

    const { back } = context;
    const { x0, y0, x1, y1 } = rectangle;
    drawBackground(back, background, x0, y0 + 1);
    drawLine(back, x0, y0, x1, y0, BLANK);
    drawTrace(back, x0, y0);
    drawLine(back, x0 + BASE_INSET, y0 + BASE_LINE, x1 - BASE_INSET, y0 + BASE_LINE, BASE_COLOUR);
    drawText(back, regular, title, x1 - TITLE_LEFT, y0 + TRACE_TOP, TEXT_COLOUR, `${PATH}.title`);
    const [left, right] = [x0 + BAR_INSET, x1 - BAR_INSET];
    drawBar(back, regular, left, y1 - ANGLE_TOP, right, y1 - ANGLE_TOP + BAR_HEIGHT, angle, true, ANGLE_COLOUR, angleLabel, `${PATH}.angleLabel`);
    drawBar(back, regular, left, y1 - ERROR_TOP, right, y1 - ERROR_TOP + BAR_HEIGHT, error, false, ERROR_COLOUR, errorLabel, `${PATH}.errorLabel`);
    drawBar(back, regular, left, y1 - COMPLETION_TOP, right, y1 - BAR_INSET, completion, false, COMPLETION_COLOUR, completionLabel, `${PATH}.completionLabel`);
    if (!(context.layout.slot?.alwaysRedraw ?? false)) context.publish(rectangle);
    return true;
  };

  return Object.freeze({
    drawWarpPage,
    history: () => Object.freeze([...history]),
    serial: () => lastSerial,
  });
}
