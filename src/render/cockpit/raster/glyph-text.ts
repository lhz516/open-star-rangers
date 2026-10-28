import { glyphsFor } from '../../../content/graphics/glyph-lookup.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import { plot, requireColour, toInt16, type IndexedSurface } from './indexed-surface.ts';

// Bitmap text of the cockpit (P3-13 spec, 文字与格式化; docs/original/formats/hud.md §1.1 and §4.1). The original's text
// drawer `0x59fc8` reads only the font record's advance, height, upper-case flag and glyphs: it draws the first
// `height` rows of each glyph with all 8 bit columns in the caller's colour, without clipping to a cell, so set pixels
// past the advance overlap the next glyph, then moves on by the advance. The advance and the flag are set by the code
// at load (`0x49694`), not stored in the font: fonts/0 keeps its cell width of 8, fonts/1 gets 6 and upper-casing.
// The original has no character map; the project looks every byte up in the payload's map and reports a byte outside
// it as `unmapped-character` instead of drawing the glyph of the same number (P3-13/05).

/** A font payload with the drawing properties the original's code gives it. */
export interface HudFont {
  readonly payload: FontPayload;
  /** Pixels from one glyph's origin to the next; independent of `payload.cellWidth`. */
  readonly advance: number;
  /** Replace only the bytes a–z (0x61–0x7A) by A–Z before the lookup. */
  readonly upperCase: boolean;
}

/** Bundles a font payload with its advance (1–8 pixels) and upper-case flag. */
export function hudFont(payload: FontPayload, advance: number, upperCase: boolean): HudFont {
  if (!Number.isInteger(advance) || advance < 1 || advance > 8) throw new RangeError('advance must be an integer from 1 to 8');
  return Object.freeze({ payload, advance, upperCase });
}

/** The glyph of each byte of `text` after the font's upper-casing; the first unmapped byte fails before anything is drawn. */
function glyphsOf(font: HudFont, text: string, path: string): Uint8Array {
  const codes = new Uint16Array(text.length);
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    codes[index] = font.upperCase && code >= 0x61 && code <= 0x7a ? code - 0x20 : code;
  }
  return glyphsFor(font.payload, codes, path);
}

/**
 * Draws the byte string `text` (one character code per byte) with the first glyph's top-left at (x, y) and returns
 * the x of the next glyph. Like the original, x and y are first truncated to 16 bits; glyph i is then at
 * x + i × advance. Only set bits are written, pixels outside the surface are dropped, nothing is cleared. An unmapped
 * byte is `unmapped-character` at `path[index]` and leaves the surface unchanged. A line break is unmapped too: split
 * multi-line texts with `splitLines` first.
 */
export function drawText(surface: IndexedSurface, font: HudFont, text: string, x: number, y: number, colour: number, path = 'text'): number {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new RangeError('x and y must be integers');
  requireColour(colour);
  [x, y] = [toInt16(x), toInt16(y)];
  const { advance, payload: { glyphs, glyphRows, height } } = font;
  glyphsOf(font, text, path).forEach((glyph, index) => {
    const left = x + index * advance;
    for (let row = 0; row < height; row++) {
      const bits = glyphs[glyph * glyphRows + row];
      for (let column = 0; column < 8; column++) if (bits & (0x80 >> column)) plot(surface, left + column, y + row, colour);
    }
  });
  return x + text.length * advance;
}

/** The lines of a byte string split at each line break (0x0A), as DIAG messages are (`0x4f050`); empty lines are kept. */
export const splitLines = (text: string): string[] => text.split('\n');

/**
 * The glyphs of a `length`-byte text that a scrolling line draws whole (message line, hud §4.7 step 6): text origin
 * at x0 + offset and inner width `width` = x1 − x0 − 1. The first is 0 when offset ≥ 0, else ⌈−offset / advance⌉; the
 * range ends before min(length, trunc((width − offset − 1) / advance)), so no glyph is cut on the left and the last
 * glyph cell ends by x1 − 3. Glyph i stays at x0 + offset + i × advance.
 */
export function wholeGlyphRange(length: number, offset: number, advance: number, width: number): { readonly first: number; readonly end: number } {
  const first = offset >= 0 ? 0 : Math.ceil(-offset / advance);
  const end = Math.min(length, Math.trunc((width - offset - 1) / advance));
  return { first, end: Math.max(first, end) };
}
