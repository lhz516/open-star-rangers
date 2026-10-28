import { fail } from '../../../content/contract-validation.ts';
import type { ImageDisplay } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';

// 8-bit indexed drawing surfaces of the cockpit and the original's 2-D primitives (P3-13 spec, 二维绘制语义与调色板,
// DC-05; docs/original/formats/hud.md §4.1). A surface is the back buffer B with its coverage mask, the screen copy S, or
// an off-screen buffer such as the 96 × 100 status picture. Indices mean nothing until a palette resolves them; only
// `resolveRows` reads a palette, and it uses the imported 8-bit entries as they are. No primitive clips to an
// instrument rectangle; every pixel outside the surface is dropped instead of reproducing the original's unguarded
// writes past 640 × 480, whatever the coordinate. Colour 0 is an ordinary opaque index except in the `key` blit.
//
// Arguments are integers. Line end points and radii are 16-bit values in the original (its callers truncate them to
// `short`), so they must lie in the i16 range, which also bounds the loops; `toInt16` is that truncation. Within it
// the pixel sets are the recorded ones, except that lines with |dx| or |dy| ≥ 16384, whose 16-bit error terms
// overflow in the original, are drawn with exact arithmetic (not reproduced; unreachable from on-screen callers).

/** The largest surface (DC-08: B and S are 640 × 480). */
export const RASTER_LIMITS = Object.freeze({ width: 640, height: 480 });

export interface IndexedSurface {
  readonly width: number;
  readonly height: number;
  /** width × height palette indices, row-major, row 0 at the top. */
  readonly indices: Uint8Array;
  /**
   * Null for a surface without coverage. Otherwise one bit per pixel in the image mask layout (bit 7 leftmost, rows
   * padded to whole bytes): 1 where a 2-D write covers the world, 0 where the world shows through (DC-05).
   */
  readonly coverage: Uint8Array | null;
}

/** An inclusive pixel rectangle. */
export interface PixelRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * Indexed pixels a blit reads. An `ImagePayload` and an `IndexedSurface` both fit: `mask` is the image's opacity mask
 * (null when fully opaque), and an image with a `display` must be `direct`, because its indices are then the target's.
 */
export interface IndexedSource {
  readonly width: number;
  readonly height: number;
  readonly indices: Uint8Array;
  readonly mask?: Uint8Array | null;
  readonly display?: ImageDisplay;
}

/**
 * How a blit writes: `opaque` writes every source pixel including index 0 (`0x59608`, `0x59cbc`); `key` skips source
 * index 0, the colour key every original caller passes (`0x59774`, `0x59d38`); `mask` writes only the pixels the
 * source mask marks opaque, every pixel when it has none. Opacity is never inferred from colours.
 */
export type BlitMode = 'opaque' | 'key' | 'mask';

const I16 = Object.freeze({ min: -0x8000, max: 0x7fff });

const maskStride = (width: number): number => (width + 7) >> 3;

/** The original's truncation of a coordinate to a signed 16-bit value. */
export const toInt16 = (value: number): number => (value << 16) >> 16;

function requireInteger(value: number, name: string, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

const requireShort = (value: number, name: string, min: number = I16.min): number => requireInteger(value, name, min, I16.max);

/** Checks a palette index. */
export const requireColour = (value: number): number => requireInteger(value, 'colour', 0, 255);

/** A zero-filled surface of at most 640 × 480; with `coverage` every pixel starts uncovered. */
export function createIndexedSurface(width: number, height: number, coverage = false): IndexedSurface {
  requireInteger(width, 'width', 1, RASTER_LIMITS.width);
  requireInteger(height, 'height', 1, RASTER_LIMITS.height);
  return Object.freeze({
    width, height, indices: new Uint8Array(width * height), coverage: coverage ? new Uint8Array(maskStride(width) * height) : null,
  });
}

/** Whether (x, y) is inside the surface and covered; a surface without coverage covers every pixel. */
export function isCovered(surface: IndexedSurface, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return false;
  const { coverage } = surface;
  return coverage === null || (coverage[y * maskStride(surface.width) + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
}

/** Sets (or clears) the coverage bits of columns left–right of row y, both already inside the surface. */
function setCoverage(surface: IndexedSurface, y: number, left: number, right: number, on: boolean): void {
  const { coverage } = surface;
  if (coverage === null) return;
  const row = y * maskStride(surface.width);
  for (let byte = left >> 3; byte <= right >> 3; byte++) {
    const low = byte === left >> 3 ? left & 7 : 0;
    const high = byte === right >> 3 ? right & 7 : 7;
    const bits = (0xff >> low) & (0xff << (7 - high));
    if (on) coverage[row + byte] |= bits;
    else coverage[row + byte] &= ~bits;
  }
}

/** Writes `colour` over columns x0–x1 of row y, clipped to the surface, covering them, or uncovering them when not `cover`. */
function span(surface: IndexedSurface, y: number, x0: number, x1: number, colour: number, cover = true): void {
  const { width, height, indices } = surface;
  if (y < 0 || y >= height) return;
  const [left, right] = [Math.max(x0, 0), Math.min(x1, width - 1)];
  if (left > right) return;
  indices.fill(colour, y * width + left, y * width + right + 1);
  setCoverage(surface, y, left, right, cover);
}

/** One pixel (`0x5afe0`); a pixel outside the surface is dropped. */
export function plot(surface: IndexedSurface, x: number, y: number, colour: number): void {
  requireInteger(x, 'x');
  requireInteger(y, 'y');
  requireColour(colour);
  span(surface, y, x, x, colour);
}

function requireRect(x0: number, y0: number, x1: number, y1: number, check: (value: number, name: string) => number = requireInteger): void {
  check(x0, 'x0');
  check(y0, 'y0');
  check(x1, 'x1');
  check(y1, 'y1');
}

/**
 * Fills the inclusive rectangle (x0, y0)–(x1, y1) with `colour` and covers it (`0x5aad0`). Reversed corners fill
 * nothing (the original's unsigned row count would run past the buffer; not reproduced).
 */
export function fillRect(surface: IndexedSurface, x0: number, y0: number, x1: number, y1: number, colour: number): void {
  requireRect(x0, y0, x1, y1);
  requireColour(colour);
  for (let y = Math.max(y0, 0); y <= Math.min(y1, surface.height - 1); y++) span(surface, y, x0, x1, colour);
}

/**
 * Sets the inclusive rectangle to index 0 and uncovers it: the original's fills with 0 before the world layers (the
 * whole-buffer clears, the overlay erase `0x456e4`, the view-label box), after which the world shows through.
 */
export function clearRect(surface: IndexedSurface, x0: number, y0: number, x1: number, y1: number): void {
  requireRect(x0, y0, x1, y1);
  for (let y = Math.max(y0, 0); y <= Math.min(y1, surface.height - 1); y++) span(surface, y, x0, x1, 0, false);
}

/**
 * A one-pixel outline `width` columns by `height` rows from (x, y) (`0x5a170`): rows y and y + height − 1 and columns
 * x and x + width − 1. Nothing is drawn unless both sizes exceed 1. Callers pass the original's sizes: the message
 * line's map outline is (x1 − x0 − 1) × (y1 − y0 − 1), a record box (w′ + 1) × (h′ + 1).
 */
export function outlineRect(surface: IndexedSurface, x: number, y: number, width: number, height: number, colour: number): void {
  requireInteger(x, 'x');
  requireInteger(y, 'y');
  requireInteger(width, 'width', 0);
  requireInteger(height, 'height', 0);
  requireColour(colour);
  if (width < 2 || height < 2) return;
  const [right, bottom] = [x + width - 1, y + height - 1];
  span(surface, y, x, right, colour);
  span(surface, bottom, x, right, colour);
  for (let row = Math.max(y + 1, 0); row < Math.min(bottom, surface.height); row++) {
    span(surface, row, x, x, colour);
    span(surface, row, right, right, colour);
  }
}

/**
 * A line with both end points (`0x5ad00`): x is the major axis only when 2|dx| > 2|dy| (ties are y-major); the error
 * starts at 2|minor| − |major| and the minor coordinate steps when it is ≥ 0, so the pixel set depends on direction.
 */
export function drawLine(surface: IndexedSurface, x0: number, y0: number, x1: number, y1: number, colour: number): void {
  requireRect(x0, y0, x1, y1, requireShort);
  requireColour(colour);
  const [dx, dy] = [Math.abs(x1 - x0), Math.abs(y1 - y0)];
  const [sx, sy] = [x1 < x0 ? -1 : 1, y1 < y0 ? -1 : 1];
  const xMajor = dy < dx;
  const [major, minor] = xMajor ? [dx, dy] : [dy, dx];
  let [x, y] = [x0, y0];
  let error = 2 * minor - major;
  for (let step = 0; ; step++) {
    span(surface, y, x, x, colour);
    if (step === major) return;
    if (error >= 0) {
      error -= 2 * major;
      if (xMajor) y += sy;
      else x += sx;
    }
    error += 2 * minor;
    if (xMajor) x += sx;
    else y += sy;
  }
}

/** Calls `visit` with each midpoint step (x, y) of radius r, at most `steps` of them, in the original's order. */
function midpointSteps(radius: number, steps: number, visit: (x: number, y: number) => void): void {
  let [x, y, d, deltaE, deltaSE] = [0, radius, 1 - radius, 3, 5 - 2 * radius];
  for (let step = 0; x < y && step < steps; step++) {
    if (d < 0) {
      d += deltaE;
      deltaSE += 2;
    } else {
      y--;
      d += deltaSE;
      deltaSE += 4;
    }
    deltaE += 2;
    x++;
    visit(x, y);
  }
}

/**
 * A midpoint circle (`0x5a390`): after each step the eight symmetric points, then the four axis points. With `steps`
 * only the first `steps` steps per octant from the axes are drawn, plus the four axis points (`0x5a4d4`); 0 steps
 * draws only the axis points. Radius 0 is the centre pixel.
 */
export function drawCircle(surface: IndexedSurface, cx: number, cy: number, radius: number, colour: number, steps?: number): void {
  requireInteger(cx, 'cx');
  requireInteger(cy, 'cy');
  requireShort(radius, 'radius', 0);
  requireColour(colour);
  const point = (x: number, y: number): void => span(surface, y, x, x, colour);
  midpointSteps(radius, steps === undefined ? Infinity : requireInteger(steps, 'steps', 0), (x, y) => {
    for (const [a, b] of [[x, y], [y, x]]) {
      point(cx + a, cy + b);
      point(cx - a, cy + b);
      point(cx + a, cy - b);
      point(cx - a, cy - b);
    }
  });
  point(cx + radius, cy);
  point(cx - radius, cy);
  point(cx, cy + radius);
  point(cx, cy - radius);
}

/**
 * A filled disc (`0x5a930`): after each midpoint step the spans of rows cy ∓ y over cx ± x and rows cy ∓ x over
 * cx ± y, then the centre row over cx ± r. With `clip` every span is first limited to that inclusive box (`0x5bca0`).
 */
export function fillDisc(surface: IndexedSurface, cx: number, cy: number, radius: number, colour: number, clip?: PixelRect): void {
  requireInteger(cx, 'cx');
  requireInteger(cy, 'cy');
  requireShort(radius, 'radius', 0);
  requireColour(colour);
  if (clip) requireRect(clip.x0, clip.y0, clip.x1, clip.y1);
  const row = (y: number, x0: number, x1: number): void => {
    if (!clip) span(surface, y, x0, x1, colour);
    else if (y >= clip.y0 && y <= clip.y1) span(surface, y, Math.max(x0, clip.x0), Math.min(x1, clip.x1), colour);
  };
  midpointSteps(radius, Infinity, (x, y) => {
    row(cy - y, cx - x, cx + x);
    row(cy + y, cx - x, cx + x);
    row(cy - x, cx - y, cx + y);
    row(cy + x, cx - y, cx + y);
  });
  row(cy, cx - radius, cx + radius);
}

/**
 * Copies the inclusive source rectangle `from` (default: all of it) with its top-left at (x, y), clipped to the
 * surface; written pixels are covered. Like the original blitters, each source row is read as x1 − x0 + 1 consecutive
 * bytes from (x0, row): columns past the row end continue into the next row's first pixels (the energy page's
 * `0x59774` call and the status copy read one such column). Neither input is modified.
 */
export function blit(surface: IndexedSurface, source: IndexedSource, x: number, y: number, mode: BlitMode, from?: PixelRect): void {
  requireInteger(x, 'x');
  requireInteger(y, 'y');
  if (source.display !== undefined && source.display !== 'direct') throw new RangeError('source must use direct display');
  const { width, height, indices } = source;
  const { x0, y0, x1, y1 } = from ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  requireInteger(y0, 'from.y0', 0, height - 1);
  requireInteger(y1, 'from.y1', y0, height - 1);
  requireInteger(x0, 'from.x0', 0, width - 1);
  // The last byte read, (x1, y1) as a linear offset, must lie inside the source.
  requireInteger(x1, 'from.x1', x0, width * (height - y1) - 1);
  const mask = mode === 'mask' ? source.mask ?? null : null;
  const { indices: target, coverage } = surface;
  const targetStride = maskStride(surface.width);
  // Source columns whose target column lies inside the surface.
  const [first, last] = [Math.max(x0, x0 - x), Math.min(x1, x0 - x + surface.width - 1)];
  if (first > last) return;
  for (let row = Math.max(y0, y0 - y); row <= Math.min(y1, y0 - y + surface.height - 1); row++) {
    const ty = y + row - y0;
    const into = ty * surface.width + x - x0;
    const rowStart = row * width;
    if (mode === 'opaque') {
      target.set(indices.subarray(rowStart + first, rowStart + last + 1), into + first);
      setCoverage(surface, ty, x + first - x0, x + last - x0, true);
      continue;
    }
    for (let column = first; column <= last; column++) {
      const pixel = rowStart + column;
      const index = indices[pixel];
      if (mode === 'key' && index === 0) continue;
      if (mask !== null) {
        const [mx, my] = [pixel % width, Math.floor(pixel / width)];
        if (!(mask[my * maskStride(width) + (mx >> 3)] & (0x80 >> (mx & 7)))) continue;
      }
      target[into + column] = index;
      if (coverage !== null) {
        const tx = x + column - x0;
        coverage[ty * targetStride + (tx >> 3)] |= 0x80 >> (tx & 7);
      }
    }
  }
}

/**
 * Resolves rows `top`–`bottom` (inclusive) of the surface into `rgba` (width × height × 4 bytes, the surface's layout)
 * with the palette's 8-bit entries exactly as imported, never expanded again. Uncovered pixels become (0, 0, 0, 0) so
 * the world shows through; other rows of `rgba` are left as they are. An index past the palette is
 * `palette-index-out-of-range`.
 */
export function resolveRows(surface: IndexedSurface, palette: PalettePayload, rgba: Uint8Array, top = 0, bottom = surface.height - 1): void {
  const { width, height, indices, coverage } = surface;
  if (rgba.length !== width * height * 4) throw new RangeError('rgba must hold 4 bytes per surface pixel');
  requireInteger(top, 'top', 0, height - 1);
  requireInteger(bottom, 'bottom', top, height - 1);
  const { entries } = palette;
  const count = entries.length / 3;
  const stride = maskStride(width);
  for (let y = top; y <= bottom; y++) {
    for (let x = 0, pixel = y * width, out = pixel * 4; x < width; x++, pixel++, out += 4) {
      if (coverage !== null && !(coverage[y * stride + (x >> 3)] & (0x80 >> (x & 7)))) {
        rgba[out] = rgba[out + 1] = rgba[out + 2] = rgba[out + 3] = 0;
        continue;
      }
      const index = indices[pixel];
      if (index >= count) fail('palette-index-out-of-range', `surface.indices[${pixel}]`, 'must address an entry of the palette');
      rgba[out] = entries[index * 3];
      rgba[out + 1] = entries[index * 3 + 1];
      rgba[out + 2] = entries[index * 3 + 2];
      rgba[out + 3] = 255;
    }
  }
}
