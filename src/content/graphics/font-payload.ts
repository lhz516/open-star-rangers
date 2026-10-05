import { GRAPHICS_LIMITS, copyBytes, invalid, payloadView, requireBytes, requireInteger, requireLength } from './graphics-format.ts';

// Font payload schema 1, little-endian:
//   0  u8   cell width, 1–8
//   1  u8   height, 1–8
//   2  u16  character map entry count, 0–256
//   4  256 × height glyph rows: row r of glyph g at 4 + g × height + r; bit 7 is the leftmost pixel, row 0 the top
//   …  count × (code u8, glyph u8), codes strictly ascending

export interface CharMapEntry {
  /** Original text byte. */
  readonly code: number;
  readonly glyph: number;
}

export interface FontPayload {
  readonly kind: 'font';
  readonly cellWidth: number;
  readonly height: number;
  /** 256 glyphs of `height` rows, one byte per row, bit 7 leftmost and row 0 at the top; bits beyond the cell are kept. */
  readonly glyphs: Uint8Array;
  /** Text byte to glyph in ascending unique code order; codes it omits have no glyph. */
  readonly charMap: readonly CharMapEntry[];
}

const HEADER_BYTES = 4;

const cellWidthOf = (value: unknown, path: string): number => requireInteger(value, 1, GRAPHICS_LIMITS.fontCellWidth, path);
const heightOf = (value: unknown, path: string): number => requireInteger(value, 1, GRAPHICS_LIMITS.fontHeight, path);

/** Checks one map entry after the entry with code `previous` (-1 for the first) and returns its code. */
function charMapCode(code: unknown, glyph: unknown, previous: number, path: string): number {
  const value = requireInteger(code, 0, 255, `${path}.code`);
  requireInteger(glyph, 0, 255, `${path}.glyph`);
  if (value <= previous) invalid(`${path}.code`, 'must be in strictly ascending code order');
  return value;
}

/** Encodes a font into a new buffer that the result owns entirely. */
export function encodeFontPayload(font: Omit<FontPayload, 'kind'>, path = 'font'): Uint8Array<ArrayBuffer> {
  const cellWidth = cellWidthOf(font.cellWidth, `${path}.cellWidth`);
  const height = heightOf(font.height, `${path}.height`);
  const glyphs = requireBytes(font.glyphs, `${path}.glyphs`, GRAPHICS_LIMITS.glyphCount * height);
  const { charMap } = font;
  if (!Array.isArray(charMap) || charMap.length > GRAPHICS_LIMITS.charMapEntries) invalid(`${path}.charMap`, 'must be at most 256 entries');
  const mapAt = HEADER_BYTES + glyphs.length;
  const bytes = new Uint8Array(mapAt + charMap.length * 2);
  bytes.set([cellWidth, height], 0);
  new DataView(bytes.buffer).setUint16(2, charMap.length, true);
  bytes.set(glyphs, HEADER_BYTES);
  let previous = -1;
  charMap.forEach(({ code, glyph }, index) => {
    previous = charMapCode(code, glyph, previous, `${path}.charMap[${index}]`);
    bytes[mapAt + index * 2] = code;
    bytes[mapAt + index * 2 + 1] = glyph;
  });
  return bytes;
}

/** Strictly reads a font payload into frozen data whose glyphs are the caller's own copy. */
export function readFontPayload(bytes: unknown, schemaVersion: unknown, path = 'payload'): FontPayload {
  const view = payloadView(bytes, schemaVersion, path);
  if (view.byteLength < HEADER_BYTES) invalid(path, 'is truncated');
  const cellWidth = cellWidthOf(view.getUint8(0), `${path}.cellWidth`);
  const height = heightOf(view.getUint8(1), `${path}.height`);
  const count = requireInteger(view.getUint16(2, true), 0, GRAPHICS_LIMITS.charMapEntries, `${path}.charMap`);
  const mapAt = HEADER_BYTES + GRAPHICS_LIMITS.glyphCount * height;
  requireLength(view, mapAt + count * 2, path);
  const charMap: CharMapEntry[] = [];
  for (let index = 0, previous = -1; index < count; index++) {
    const [code, glyph] = [view.getUint8(mapAt + index * 2), view.getUint8(mapAt + index * 2 + 1)];
    previous = charMapCode(code, glyph, previous, `${path}.charMap[${index}]`);
    charMap.push(Object.freeze({ code, glyph }));
  }
  return Object.freeze({ kind: 'font', cellWidth, height, glyphs: copyBytes(view, HEADER_BYTES, mapAt - HEADER_BYTES), charMap: Object.freeze(charMap) });
}
