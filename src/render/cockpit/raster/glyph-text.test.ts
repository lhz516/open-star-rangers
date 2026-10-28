import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { CharMapEntry, FontPayload } from '../../../content/graphics/font-payload.ts';
import { createIndexedSurface, type IndexedSurface } from './indexed-surface.ts';
import { drawText, hudFont, splitLines, wholeGlyphRange } from './glyph-text.ts';

// Synthetic 8-row fonts only: glyph c has a marker pixel pattern chosen per test, never an original glyph.

const GLYPH_ROWS = 8;

/** A font of 128 empty glyphs with `rows` set for the given glyph numbers, and an identity map over `codes`. */
function fontOf(glyphRows: Record<number, readonly number[]>, codes: readonly number[], height = 8, cellWidth = 8): FontPayload {
  const glyphs = new Uint8Array(128 * GLYPH_ROWS);
  for (const [glyph, rows] of Object.entries(glyphRows)) glyphs.set(rows, Number(glyph) * GLYPH_ROWS);
  const charMap: CharMapEntry[] = [...codes].sort((a, b) => a - b).map(code => Object.freeze({ code, glyph: code }));
  return Object.freeze({ kind: 'font', cellWidth, height, glyphRows: GLYPH_ROWS, glyphs, charMap: Object.freeze(charMap) });
}

function pixelsOf(surface: IndexedSurface): string[] {
  const out: string[] = [];
  surface.indices.forEach((index, pixel) => {
    if (index !== 0) out.push(`${pixel % surface.width},${Math.floor(pixel / surface.width)}=${index}`);
  });
  return out.sort();
}

const A = 0x41;
const a = 0x61;
// 'A': the leftmost and rightmost of the 8 bit columns in row 0, and bit column 3 in row 7.
const A_ROWS = [0b1000_0001, 0, 0, 0, 0, 0, 0, 0b0001_0000];
// 'a', distinct from 'A': bit column 1 in row 1.
const LOWER_ROWS = [0, 0b0100_0000, 0, 0, 0, 0, 0, 0];

describe('glyph text', () => {
  const font = fontOf({ [A]: A_ROWS, [a]: LOWER_ROWS }, [0x20, A, a]);

  it('draws all 8 bit columns of every glyph and moves on by the advance, not the cell width', () => {
    const surface = createIndexedSurface(32, 12);
    const end = drawText(surface, hudFont(font, 6, false), 'AA', 2, 1, 7);
    expect(end).toBe(14);
    expect(pixelsOf(surface)).toEqual(['2,1=7', '9,1=7', '8,1=7', '15,1=7', '5,8=7', '11,8=7'].sort());
    // The first glyph's column 7 (x 9) lies inside the second glyph's cell, which starts at x 8: no cell clipping.
    const byCell = createIndexedSurface(32, 12);
    drawText(byCell, hudFont(font, 8, false), 'AA', 2, 1, 7);
    // Negative control: a cell-width advance moves the second glyph from x 8 to x 10.
    expect(pixelsOf(byCell)).toEqual(['2,1=7', '9,1=7', '10,1=7', '17,1=7', '5,8=7', '13,8=7'].sort());
    expect(pixelsOf(byCell)).not.toEqual(pixelsOf(surface));
  });

  it('draws only the first height rows of each stored glyph', () => {
    const short = createIndexedSurface(16, 12);
    drawText(short, hudFont(fontOf({ [A]: A_ROWS }, [A], 6), 6, false), 'A', 0, 0, 3);
    expect(pixelsOf(short)).toEqual(['0,0=3', '7,0=3']);
    const tall = createIndexedSurface(16, 12);
    drawText(tall, hudFont(fontOf({ [A]: A_ROWS }, [A], 8), 6, false), 'A', 0, 0, 3);
    expect(pixelsOf(tall)).toEqual(['0,0=3', '3,7=3', '7,0=3']);
  });

  it('upper-cases only a–z when the flag is set; without it the lowercase glyph is drawn', () => {
    const upper = createIndexedSurface(16, 12);
    drawText(upper, hudFont(font, 6, true), 'a', 0, 0, 2);
    const lower = createIndexedSurface(16, 12);
    drawText(lower, hudFont(font, 6, false), 'a', 0, 0, 2);
    expect(pixelsOf(upper)).toEqual(['0,0=2', '3,7=2', '7,0=2']);
    expect(pixelsOf(lower)).toEqual(['1,1=2']);
    // 0x7B and 0xE1 are not letters a–z: upper-casing leaves them unmapped instead of turning them into 0x5B or 0xC1.
    const mapped = fontOf({ 0x5b: A_ROWS, 0x41: A_ROWS }, [0x41, 0x5b]);
    for (const text of ['{', '\u00e1']) {
      expect(() => drawText(createIndexedSurface(8, 8), hudFont(mapped, 6, true), text, 0, 0, 1)).toThrow(ContentContractError);
    }
  });

  it('reports the first unmapped byte with its position before drawing anything', () => {
    const surface = createIndexedSurface(32, 12);
    const unmapped = (text: string, upperCase: boolean): ContentContractError => {
      try {
        drawText(surface, hudFont(fontOf({ [A]: A_ROWS }, [A]), 6, upperCase), text, 0, 0, 1, 'label');
      } catch (error) {
        return error as ContentContractError;
      }
      throw new Error('expected an unmapped character');
    };
    expect(unmapped('AAa', false)).toMatchObject({ code: 'unmapped-character', path: 'label[2]' });
    expect(unmapped('A\nA', true)).toMatchObject({ code: 'unmapped-character', path: 'label[1]' });
    expect(unmapped('A\u0141', true)).toMatchObject({ code: 'unmapped-character', path: 'label[1]' });
    expect(pixelsOf(surface)).toEqual([]);
    expect(drawText(surface, hudFont(fontOf({}, [A]), 6, true), 'aA', 0, 0, 1)).toBe(12);
  });

  it('splits line breaks before the glyph lookup and keeps empty lines', () => {
    expect(splitLines('Aa\nA')).toEqual(['Aa', 'A']);
    expect(splitLines('A\n\nA\n')).toEqual(['A', '', 'A', '']);
    const surface = createIndexedSurface(16, 24);
    splitLines('A\nA').forEach((line, index) => drawText(surface, hudFont(font, 6, true), line, 0, index * 8, 4));
    expect(pixelsOf(surface)).toEqual(['0,0=4', '7,0=4', '3,7=4', '0,8=4', '7,8=4', '3,15=4'].sort());
  });

  it('drops glyph pixels past the screen edge and leaves the font unchanged', () => {
    const glyphs = font.glyphs.slice();
    const screen = createIndexedSurface(640, 480);
    drawText(screen, hudFont(font, 6, false), 'A', 636, 472, 5);
    // Column 7 of row 0 falls at x 643: dropped, not wrapped to (3, 473).
    expect(pixelsOf(screen)).toEqual(['636,472=5', '639,479=5']);
    drawText(screen, hudFont(font, 6, false), 'A', 0, 476, 5);
    expect(pixelsOf(screen)).toEqual(['0,476=5', '636,472=5', '639,479=5', '7,476=5']);
    // The original truncates the origin to 16 bits: 65536 + 2 draws at x 2, and 32767 lies off the surface.
    const wrapped = createIndexedSurface(16, 12);
    expect(drawText(wrapped, hudFont(font, 6, false), 'A', 65538, 65536, 5)).toBe(8);
    drawText(wrapped, hudFont(font, 6, false), 'AA', 32767, 0, 6);
    expect(pixelsOf(wrapped)).toEqual(['2,0=5', '5,7=5', '9,0=5']);
    expect(font.glyphs).toEqual(glyphs);
    expect(() => hudFont(font, 0, false)).toThrow(RangeError);
    expect(() => hudFont(font, 9, false)).toThrow(RangeError);
  });
});

describe('whole-glyph windows', () => {
  // The slot-0 message line: x0 229, x1 411, W = x1 − x0 − 1 = 181, fonts/0 advance 8.
  const W = 181;

  it('starts at the first glyph wholly right of the origin and ends with the last cell at x1 − 3', () => {
    expect(wholeGlyphRange(10, 0, 8, W)).toEqual({ first: 0, end: 10 });
    expect(wholeGlyphRange(30, 0, 8, W)).toEqual({ first: 0, end: 22 });
    expect(wholeGlyphRange(30, -9, 8, W)).toEqual({ first: 2, end: 23 });
    expect(wholeGlyphRange(30, -8, 8, W)).toEqual({ first: 1, end: 23 });
    for (const offset of [-17, -9, 0, 4, 5, 100]) {
      const { first, end } = wholeGlyphRange(40, offset, 8, W);
      expect(offset + first * 8).toBeGreaterThanOrEqual(0);
      expect(offset + end * 8 - 1).toBeLessThanOrEqual(W - 2);
      expect(offset + (end + 1) * 8 - 1).toBeGreaterThan(W - 2);
    }
  });

  it('is empty when the text starts at or past the right edge or has scrolled out on the left', () => {
    expect(wholeGlyphRange(10, W, 8, W)).toEqual({ first: 0, end: 0 });
    expect(wholeGlyphRange(10, W + 50, 8, W)).toEqual({ first: 0, end: 0 });
    expect(wholeGlyphRange(3, -24, 8, W)).toEqual({ first: 3, end: 3 });
  });
});
