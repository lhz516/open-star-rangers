import { GRAPHICS_LIMITS, copyBytes, invalid, payloadView, requireBytes, requireInteger, requireLength } from './graphics-format.ts';

// Font payload schema 1, little-endian:
//   0  u8   cell width, 1–8
//   1  u8   cell height, 1–8
//   2  u8   glyph rows: rows stored per glyph, from the cell height to 8
//   3  u16  glyph count, 1–256
//   5  u16  character map entry count, 0–256
//   7  glyph count × glyph rows bytes: row r of glyph g at 7 + g × glyph rows + r; bit 7 is the leftmost pixel, row 0 the top
//   …  count × (code u8, glyph u8), codes strictly ascending, glyphs below the glyph count

export interface CharMapEntry {
  /** Original text byte. */
  readonly code: number;
  readonly glyph: number;
}

export interface FontPayload {
  readonly kind: 'font';
  readonly cellWidth: number;
  readonly height: number;
  /** Rows stored per glyph; rows beyond the cell height are kept like bits beyond the cell width. */
  readonly glyphRows: number;
  /** 1–256 glyphs of `glyphRows` rows, one byte per row, bit 7 leftmost and row 0 at the top; every bit is kept. */
  readonly glyphs: Uint8Array;
  /** Text byte to glyph in ascending unique code order; codes it omits have no glyph. */
  readonly charMap: readonly CharMapEntry[];
}

const HEADER_BYTES = 7;

/** Encoded length of a font of `glyphCount` glyphs of `glyphRows` rows with `charMapEntries` map entries. */
export const fontPayloadLength = (glyphCount: number, glyphRows: number, charMapEntries: number): number =>
  HEADER_BYTES + glyphCount * glyphRows + charMapEntries * 2;

const cellWidthOf = (value: unknown, path: string): number => requireInteger(value, 1, GRAPHICS_LIMITS.fontCellWidth, path);
const heightOf = (value: unknown, path: string): number => requireInteger(value, 1, GRAPHICS_LIMITS.fontHeight, path);
const glyphRowsOf = (value: unknown, height: number, path: string): number => requireInteger(value, height, GRAPHICS_LIMITS.fontHeight, path);

/** Checks one map entry after the entry with code `previous` (-1 for the first) and returns its code. */
function charMapCode(code: unknown, glyph: unknown, glyphCount: number, previous: number, path: string): number {
  const value = requireInteger(code, 0, 255, `${path}.code`);
  requireInteger(glyph, 0, glyphCount - 1, `${path}.glyph`);
  if (value <= previous) invalid(`${path}.code`, 'must be in strictly ascending code order');
  return value;
}

/** Encodes a font into a new buffer that the result owns entirely. */
export function encodeFontPayload(font: Omit<FontPayload, 'kind'>, path = 'font'): Uint8Array<ArrayBuffer> {
  const cellWidth = cellWidthOf(font.cellWidth, `${path}.cellWidth`);
  const height = heightOf(font.height, `${path}.height`);
  const glyphRows = glyphRowsOf(font.glyphRows, height, `${path}.glyphRows`);
  const glyphs = requireBytes(font.glyphs, `${path}.glyphs`);
  const glyphCount = glyphs.length / glyphRows;
  if (!Number.isInteger(glyphCount) || glyphCount < 1 || glyphCount > GRAPHICS_LIMITS.glyphCount) {
    invalid(`${path}.glyphs`, 'must hold 1 to 256 glyphs of glyphRows bytes');
  }
  const { charMap } = font;
  if (!Array.isArray(charMap) || charMap.length > GRAPHICS_LIMITS.charMapEntries) invalid(`${path}.charMap`, 'must be at most 256 entries');
  const mapAt = HEADER_BYTES + glyphs.length;
  const bytes = new Uint8Array(fontPayloadLength(glyphCount, glyphRows, charMap.length));
  const view = new DataView(bytes.buffer);
  bytes.set([cellWidth, height, glyphRows], 0);
  view.setUint16(3, glyphCount, true);
  view.setUint16(5, charMap.length, true);
  bytes.set(glyphs, HEADER_BYTES);
  let previous = -1;
  charMap.forEach(({ code, glyph }, index) => {
    previous = charMapCode(code, glyph, glyphCount, previous, `${path}.charMap[${index}]`);
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
  const glyphRows = glyphRowsOf(view.getUint8(2), height, `${path}.glyphRows`);
  const glyphCount = requireInteger(view.getUint16(3, true), 1, GRAPHICS_LIMITS.glyphCount, `${path}.glyphCount`);
  const count = requireInteger(view.getUint16(5, true), 0, GRAPHICS_LIMITS.charMapEntries, `${path}.charMap`);
  const mapAt = HEADER_BYTES + glyphCount * glyphRows;
  requireLength(view, fontPayloadLength(glyphCount, glyphRows, count), path);
  const charMap: CharMapEntry[] = [];
  for (let index = 0, previous = -1; index < count; index++) {
    const [code, glyph] = [view.getUint8(mapAt + index * 2), view.getUint8(mapAt + index * 2 + 1)];
    previous = charMapCode(code, glyph, glyphCount, previous, `${path}.charMap[${index}]`);
    charMap.push(Object.freeze({ code, glyph }));
  }
  return Object.freeze({
    kind: 'font', cellWidth, height, glyphRows, glyphs: copyBytes(view, HEADER_BYTES, mapAt - HEADER_BYTES), charMap: Object.freeze(charMap),
  });
}
