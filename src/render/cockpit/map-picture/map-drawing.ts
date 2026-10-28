/**
 * The strategic map's own drawing helpers (docs/original/formats/hud.md §4.9; P3-13 spec, 战略地图画面 and D-01 定稿
 * DC-09/DC-11): the record drawer `0x4abe4`, the panel outlines `0x4b8fc`, the grid `0x4ab08`, the pointer box
 * `0x4c8b0` and the line clipping of `0x4c674`, over the raster primitives of hud §4.1. Coordinates are logical screen
 * pixels; a map rectangle is the projection's `{ x, y, width, height }` (half-open), whose outlines, disc clip and
 * pointer-box clamp reach one column and row past it, as the original's do.
 */
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PixelRect as MapRect } from '../../../core/world/map-rule-data.ts';
import { blit, drawLine, outlineRect, type IndexedSurface, type PixelRect } from '../raster/indexed-surface.ts';

export type { MapRect };

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** The inclusive box [x, x + width] × [y, y + height]: the disc clip and the pointer-box and line clamp. */
export const inclusiveBox = ({ x, y, width, height }: MapRect): PixelRect => ({ x0: x, y0: y, x1: x + width, y1: y + height });

/**
 * `0x4abe4`: an image record with colour key 0 and its top-left at the area origin + (column, row). The record shrinks
 * only on the right and bottom, to w′ = width − column when column + w > width (h′ likewise); nothing clips it on the
 * left or top. With a box colour, four lines then outline (w′ + 1) × (h′ + 1) pixels from the top-left, over the
 * record's first row and column. A record shrunk to no column or row draws no pixel (the original passes the blitter an
 * empty or reversed range; reachable only for an in-world pixel equal to the side); its box is still drawn.
 */
export function drawRecord(back: IndexedSurface, image: ImagePayload, area: MapRect, column: number, row: number, box: number | null = null): void {
  const width = column + image.width > area.width ? area.width - column : image.width;
  const height = row + image.height > area.height ? area.height - row : image.height;
  const [x, y] = [area.x + column, area.y + row];
  if (width > 0 && height > 0) blit(back, image, x, y, 'key', { x0: 0, y0: 0, x1: width - 1, y1: height - 1 });
  if (box === null) return;
  drawLine(back, x, y, x + width, y, box);
  drawLine(back, x, y + height, x + width, y + height, box);
  drawLine(back, x, y, x, y + height, box);
  drawLine(back, x + width, y, x + width, y + height, box);
}

/** `0x4b8fc`: lines at x, x + width, y and y + height (one pixel past the half-open rectangle). */
export const drawPanelOutline = (back: IndexedSurface, { x, y, width, height }: MapRect, colour: number): void =>
  outlineRect(back, x, y, width + 1, height + 1, colour);

/** `0x4ab08`: for i = 1 … n − 1, lines at the main map's origin + i × trunc(s ÷ n) across the inclusive side. */
export function drawGrid(back: IndexedSurface, main: MapRect, sectors: number, colour: number): void {
  const { x, y, height: side } = main;
  for (let index = 1; index < sectors; index++) {
    const offset = index * Math.trunc(side / sectors);
    drawLine(back, x + offset, y, x + offset, y + side, colour);
    drawLine(back, x, y + offset, x + side, y + offset, colour);
  }
}

/**
 * `0x4c8b0`: a box of `size` (halves truncated toward zero) centred on the main map's pixel; each edge is drawn only
 * when it lies inside [origin, origin + s], with its end points clamped to that range.
 */
export function drawPointerBox(back: IndexedSurface, main: MapRect, column: number, row: number, size: { readonly width: number; readonly height: number }, colour: number): void {
  const { x0, y0, x1, y1 } = inclusiveBox(main);
  const [cx, cy] = [main.x + column, main.y + row];
  const [halfWidth, halfHeight] = [Math.trunc(size.width / 2), Math.trunc(size.height / 2)];
  const [left, right, top, bottom] = [cx - halfWidth, cx + halfWidth, cy - halfHeight, cy + halfHeight];
  const [spanLeft, spanRight, spanTop, spanBottom] = [Math.max(left, x0), Math.min(right, x1), Math.max(top, y0), Math.min(bottom, y1)];
  if (top >= y0) drawLine(back, spanLeft, top, spanRight, top, colour);
  if (bottom <= y1) drawLine(back, spanLeft, bottom, spanRight, bottom, colour);
  if (left >= x0) drawLine(back, left, spanTop, left, spanBottom, colour);
  if (right <= x1) drawLine(back, right, spanTop, right, spanBottom, colour);
}

/**
 * `0x4c674`'s clipping of the player's end, for a player outside the world: first in x, then in y, to the inclusive
 * main-map box, with the f32 slope k = (Py − Cy) ÷ (Px − Cx) and its reciprocal, results truncated toward zero. When the
 * player and the cursor share a column or row the original divides by zero (consequence Unconfirmed); the project
 * clips that segment exactly instead (Δ-07), which for such an axis-parallel segment clamps the player's end to the
 * box. A start inside the box comes back unchanged.
 */
export function clipLineStart(from: ScreenPoint, to: ScreenPoint, box: PixelRect): ScreenPoint {
  const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);
  if (from.x === to.x || from.y === to.y) return { x: clamp(from.x, box.x0, box.x1), y: clamp(from.y, box.y0, box.y1) };
  const slope = Math.fround((from.y - to.y) / (from.x - to.x));
  const inverse = Math.fround(1 / slope);
  let { x, y } = from;
  if (box.x0 > x) [x, y] = [box.x0, Math.trunc((box.x0 - from.x) * slope + from.y)];
  else if (box.x1 < x) [x, y] = [box.x1, Math.trunc((box.x1 - from.x) * slope + from.y)];
  if (box.y0 > y) [x, y] = [Math.trunc((box.y0 - to.y) * inverse + to.x), box.y0];
  else if (box.y1 < y) [x, y] = [Math.trunc((box.y1 - to.y) * inverse + to.x), box.y1];
  return { x, y };
}
