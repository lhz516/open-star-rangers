import { fail } from '../contract-validation.ts';
import type { FontPayload } from './font-payload.ts';

const UNMAPPED = 'has no glyph in the character map';

/** Binary search of the ascending character map; undefined when the code is not mapped. */
function mappedGlyph(font: FontPayload, code: number): number | undefined {
  const { charMap } = font;
  let [low, high] = [0, charMap.length - 1];
  while (low <= high) {
    const middle = (low + high) >> 1;
    const entry = charMap[middle];
    if (entry.code === code) return entry.glyph;
    if (entry.code < code) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

/** The glyph mapped to text byte `code`; a code outside the map has no glyph, even when a glyph with its number exists. */
export function glyphFor(font: FontPayload, code: number, path = 'code'): number {
  return mappedGlyph(font, code) ?? fail('unmapped-character', path, UNMAPPED);
}

/** The glyphs of a text byte sequence in order; the first unmapped code is reported at its position. */
export function glyphsFor(font: FontPayload, text: ArrayLike<number>, path = 'text'): Uint8Array<ArrayBuffer> {
  const glyphs = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    glyphs[index] = mappedGlyph(font, text[index]) ?? fail('unmapped-character', `${path}[${index}]`, UNMAPPED);
  }
  return glyphs;
}
