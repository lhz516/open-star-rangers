/**
 * The corner gauges' bars (docs/original/formats/hud.md §4.2; P3-13 spec, 前视驾驶舱与仪表): the flat bar `0x41680`
 * for a record without a parameter table and the shaped bar `0x417a4` in mode m otherwise. Both draw into B and, with
 * the slot's +0x0C clear (`alwaysRedraw` false, as in slot 0), copy their own area to S: the flat bar its rectangle,
 * the shaped bar each row's shape segment at that row's own half-width, so the closing row's wider buffer pixels stay
 * in B. Neither clips to the rectangle: lines for values above 1 fall outside it and stay in B.
 *
 * Project limits (unreachable with the slice's readings, which stay within a small multiple of 1): the half-width past
 * the original's 56-entry table, which the original reads from the memory that follows it, continues the table's
 * formula (29); rows outside the 480-row surface are dropped and the line walk stops at the surface instead of
 * reproducing the 16-bit row wrap-around beyond ±32767; a reading whose row count does not fit an i32 takes the integer
 * indefinite like `FISTP`.
 */
import type { InclusiveRectangle } from '../../../content/hud/instruments-payload.ts';
import type { CockpitDrawContext } from '../presentation/cockpit-contract.ts';
import { drawText, type HudFont } from '../raster/glyph-text.ts';
import { fillRect } from '../raster/indexed-surface.ts';

/** HI entries of the half-width table `0x41000` builds. */
export const SHAPED_BAR_ENTRIES = 56;
/** The label colour of both bars. */
export const BAR_LABEL_COLOUR = 8;
const MAX_HALF_WIDTH = 29;

/** `FISTP` dword under the chop mode `0x74518` sets: truncation, and −2³¹ (integer indefinite) beyond i32. */
export function chop32(value: number): number {
  const chopped = Math.trunc(value);
  return chopped >= -0x8000_0000 && chopped <= 0x7fff_ffff ? chopped + 0 : -0x8000_0000;
}

/**
 * Half-width T[i] of the shaped bar: chop(min(f32((0.5 · max(i/56 − 0.25, 0))²) · 200 + 10, 29)). Indices past the
 * 56 entries keep the formula, which is 29 there.
 */
export function shapedBarHalfWidth(index: number): number {
  const t = index / SHAPED_BAR_ENTRIES - 0.25;
  const half = 0.5 * (t > 0 ? t : 0);
  const width = Math.fround(half * half) * 200 + 10;
  return Math.trunc(width >= MAX_HALF_WIDTH ? MAX_HALF_WIDTH : width);
}

const HALF_WIDTHS: readonly number[] = Object.freeze(Array.from({ length: SHAPED_BAR_ENTRIES }, (_, index) => shapedBarHalfWidth(index)));
const halfWidth = (index: number): number => HALF_WIDTHS[index] ?? MAX_HALF_WIDTH;

/** n = chop(D(y1 − y0) × f32 value): the bar's row count, both bars. */
export const barRows = ({ y0, y1 }: InclusiveRectangle, value: number): number => chop32((y1 - y0) * value);

/**
 * Lines j = 0, 1, … of a bar from `start` in steps of `step` (±2) while the row is short of `limit` (exclusive), with
 * table index 2j, then the closing line one row back from the first row that failed, with the next index. Lines whose
 * rows lie past the surface edge are not visited.
 */
function walkLines(start: number, limit: number, step: 2 | -2, height: number, line: (row: number, index: number) => void): void {
  const count = Math.max(0, Math.ceil((step < 0 ? start - limit : limit - start) / 2));
  if (count === 0) return;
  const onSurface = (step < 0 ? Math.floor(start / 2) : Math.floor((height - 1 - start) / 2)) + 1;
  for (let j = 0; j < Math.min(count, onSurface); j++) line(start + step * j, 2 * j);
  line(start + step * count - step / 2, 2 * count);
}

/** The flat bar `0x41680`: full-width lines every second row up from y1, the label centred at the top. */
export function drawFlatBar(context: CockpitDrawContext, rect: InclusiveRectangle, value: number, colour: number, font: HudFont, label: string, local: boolean): void {
  const { back } = context;
  const { x0, y0, x1, y1 } = rect;
  if (local) fillRect(back, x0, y0, x1, y1, 0);
  walkLines(y1, (y1 - barRows(rect, value)) | 0, -2, back.height, (row) => fillRect(back, x0, row, x1, row, colour));
  drawText(back, font, label, ((x0 + x1) >> 1) - 3, y0 + 2, BAR_LABEL_COLOUR);
  if (local) context.publish(rect);
}

/**
 * The shaped bar `0x417a4` in `mode`: 0 and 1 grow up from y1, the others down from y0; 0 and 2 are anchored left, the
 * others right (a mode other than 0–2 acts as 3). Row k from the anchor row spans T[k] + 1 pixels from the anchored
 * edge. It clears every row's segment to 0, draws, labels, and copies each row's own segment when `local`.
 */
export function drawShapedBar(
  context: CockpitDrawContext, rect: InclusiveRectangle, mode: number, value: number, colour: number, font: HudFont, label: string, local: boolean,
): void {
  const { back } = context;
  const { x0, y0, x1, y1 } = rect;
  const up = mode === 0 || mode === 1;
  const left = mode === 0 || mode === 2;
  const span = (index: number): readonly [number, number] => (left ? [x0, x0 + halfWidth(index)] : [x1 - halfWidth(index), x1]);
  const segment = (row: number, index: number, segmentColour: number): void => {
    const [from, to] = span(index);
    fillRect(back, from, row, to, row, segmentColour);
  };
  /** Row k from the anchor row. */
  const rowAt = (k: number): number => (up ? y1 - k : y0 + k);
  for (let k = 0; k <= y1 - y0; k++) segment(rowAt(k), k, 0);
  const rows = barRows(rect, value);
  if (up) walkLines(y1, (y1 - rows) | 0, -2, back.height, (row, index) => segment(row, index, colour));
  else walkLines(y0, (y0 + rows) | 0, 2, back.height, (row, index) => segment(row, index, colour));
  drawText(back, font, label, left ? x0 + 2 : x1 - 8, up ? y0 + 2 : y1 - 9, BAR_LABEL_COLOUR);
  if (!local) return;
  for (let k = 0; k <= y1 - y0; k++) context.publishRow(rowAt(k), ...span(k));
}
