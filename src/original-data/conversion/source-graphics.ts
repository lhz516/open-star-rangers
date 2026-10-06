import { GRAPHICS_LIMITS } from '../../content/graphics/graphics-format.ts';
import { maskStride } from '../../content/graphics/image-payload.ts';
import { exclusiveBytes } from '../../content/ownership.ts';
import { SourceError, type SourceLimitName } from '../source-error.ts';

// Source structure of DATA palettes, 36-byte image records, MFDD record lists and bitmap font tables
// (docs/original/formats/textures.md, cockpit.md and hud.md). Each reader checks structure and limits before it
// allocates anything sized by the source, copies its result into new buffers the caller owns and throws a SourceError
// located at a field (`palette`, `record`, `pixels`, `glyphs`, `fonts`) under the caller's `path`.

const IMAGE_RECORD_BYTES = 36;
const DATA_PALETTE_BYTES = 768;
/** Each CCKD entry begins with exactly three fonts: two 8×8 and one 4×6 (hud §1). */
const CCKD_FONT_COUNT = 3;

export interface ImageRecordHeader {
  readonly encoding: 'raw' | 'sprite-rle';
  readonly width: number;
  readonly height: number;
  /** Block-relative offset of the embedded BGR palette; meaningful only when `paletteCount` is not 0. */
  readonly paletteOffset: number;
  readonly paletteCount: number;
  /** Block-relative offset of the pixel data. */
  readonly pixelOffset: number;
  readonly dataSize: number;
}

export interface SourceImage {
  readonly width: number;
  readonly height: number;
  /** Row-major indices in stored row order; 0 at transparent pixels. */
  readonly indices: Uint8Array<ArrayBuffer>;
  /** Null for raw images; otherwise the canonical packed mask: bit 7 leftmost, rows padded with 0 bits, 1 = opaque. */
  readonly mask: Uint8Array<ArrayBuffer> | null;
}

export interface SourceFont {
  readonly cellWidth: number;
  readonly height: number;
  /** 256 glyphs × height rows, copied bit for bit. */
  readonly glyphs: Uint8Array<ArrayBuffer>;
}

const fieldAt = (path: string, field: string): string => (path ? `${path}.${field}` : field);

/** Whether `length` bytes at `offset` lie inside the block, without overflowing. */
const fits = (block: Uint8Array, offset: number, length: number): boolean => offset <= block.length && length <= block.length - offset;

const u32 = (block: Uint8Array, offset: number): number =>
  new DataView(block.buffer, block.byteOffset + offset, 4).getUint32(0, true);

function invalid(location: string, reason: string): never {
  throw new SourceError('invalid-payload', location, reason);
}

function withinLimit(value: number, name: SourceLimitName, limit: number, location: string): number {
  if (value < 1 || value > limit) throw new SourceError('limit-exceeded', location, 'is outside the supported range', { name, limit, observed: value });
  return value;
}

/** DATA: 256 VGA colours with 6-bit components, expanded to 8 bits by bit replication. */
export function readDataPalette(block: Uint8Array, path = ''): Uint8Array<ArrayBuffer> {
  const location = fieldAt(path, 'palette');
  if (block.length !== DATA_PALETTE_BYTES) invalid(location, 'a DATA palette must be 768 bytes');
  if (block.some(component => component > 63)) invalid(location, 'a VGA palette component must be at most 63');
  return Uint8Array.from(block, component => (component << 2) | (component >> 4));
}

/** Reads and checks only the 36-byte record at `offset`, including that its palette and pixel ranges fit the block. */
export function readImageRecordHeader(block: Uint8Array, offset = 0, path = ''): ImageRecordHeader {
  const record = fieldAt(path, 'record');
  if (!fits(block, offset, IMAGE_RECORD_BYTES)) invalid(record, 'the image record extends past the block');
  const view = new DataView(block.buffer, block.byteOffset + offset, IMAGE_RECORD_BYTES);
  const field = (at: number) => view.getUint32(at, true);
  if (field(0) !== 8) invalid(record, 'an image must have 8 bits per pixel');
  if (field(16) !== 0) invalid(record, 'the reserved field must be 0');
  const encoding = field(4);
  if (encoding !== 0 && encoding !== 2) throw new SourceError('unsupported-encoding', record, 'only raw and sprite RLE images are supported');
  const header: ImageRecordHeader = Object.freeze({
    encoding: encoding === 0 ? 'raw' : 'sprite-rle',
    width: withinLimit(field(8), 'imageWidth', GRAPHICS_LIMITS.imageWidth, record),
    height: withinLimit(field(12), 'imageHeight', GRAPHICS_LIMITS.imageHeight, record),
    paletteOffset: field(20),
    paletteCount: field(24),
    pixelOffset: field(28),
    dataSize: field(32),
  });
  const palette = fieldAt(path, 'palette');
  if (header.paletteCount > GRAPHICS_LIMITS.paletteEntryCount) {
    throw new SourceError('limit-exceeded', palette, 'is outside the supported range',
      { name: 'paletteEntryCount', limit: GRAPHICS_LIMITS.paletteEntryCount, observed: header.paletteCount });
  }
  if (header.paletteCount > 0 && !fits(block, header.paletteOffset, header.paletteCount * 3)) invalid(palette, 'the embedded palette extends past the block');
  if (!fits(block, header.pixelOffset, header.dataSize)) invalid(fieldAt(path, 'pixels'), 'the pixel data extends past the block');
  return header;
}

/**
 * Sprite RLE: each row alternates u16 transparent and opaque run lengths, starting with a transparent run; each opaque
 * run is followed by its pixels, and a row ends when its runs add up to the width.
 */
function decodeSpriteRle(data: Uint8Array, width: number, height: number, location: string): SourceImage {
  const indices = new Uint8Array(width * height);
  const stride = maskStride(width);
  const mask = new Uint8Array(stride * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0, transparent = true; x < width; transparent = !transparent) {
      if (offset + 2 > data.length) invalid(location, 'a sprite row is truncated');
      const run = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      if (run > width - x) invalid(location, 'a sprite run overflows the row');
      if (!transparent) {
        if (run > data.length - offset) invalid(location, 'a sprite row is truncated');
        indices.set(data.subarray(offset, offset + run), y * width + x);
        for (let column = x; column < x + run; column++) {
          if ((column & 7) === 0 && x + run - column >= 8) {
            mask[y * stride + (column >> 3)] = 0xff;
            column += 7;
          } else {
            mask[y * stride + (column >> 3)] |= 0x80 >> (column & 7);
          }
        }
        offset += run;
      }
      x += run;
    }
  }
  if (offset !== data.length) invalid(location, 'sprite data has trailing bytes');
  return Object.freeze({ width, height, indices, mask });
}

/** Checks the record at `offset`, then decodes its pixels into new buffers; stored row order is kept. */
export function decodeImageRecord(block: Uint8Array, offset = 0, path = ''): SourceImage {
  const header = readImageRecordHeader(block, offset, path);
  const location = fieldAt(path, 'pixels');
  const { width, height } = header;
  const data = block.subarray(header.pixelOffset, header.pixelOffset + header.dataSize);
  if (header.encoding === 'sprite-rle') return decodeSpriteRle(data, width, height, location);
  if (data.length !== width * height) invalid(location, 'raw image data must be width × height bytes');
  return Object.freeze({ width, height, indices: exclusiveBytes(data), mask: null });
}

/** Checks the record at `offset`, then reads its embedded palette, stored as BGR, as new RGB triples. */
export function readEmbeddedPalette(block: Uint8Array, offset = 0, path = ''): Uint8Array<ArrayBuffer> {
  const header = readImageRecordHeader(block, offset, path);
  if (header.paletteCount === 0) throw new SourceError('subresource-not-found', fieldAt(path, 'palette'), 'the image record has no embedded palette');
  const rgb = new Uint8Array(header.paletteCount * 3);
  for (let entry = 0; entry < rgb.length; entry += 3) {
    const at = header.paletteOffset + entry;
    rgb[entry] = block[at + 2];
    rgb[entry + 1] = block[at + 1];
    rgb[entry + 2] = block[at];
  }
  return rgb;
}

/** Block offsets of the image records in MFDD lists 0 and 1; each list must fit the block. */
export function readMfdRecordOffsets(block: Uint8Array, path = ''): readonly (readonly number[])[] {
  const location = fieldAt(path, 'record');
  if (!fits(block, 0, 16)) invalid(location, 'the MFDD header extends past the block');
  return Object.freeze([0, 8].map(at => {
    const [offset, count] = [u32(block, at), u32(block, at + 4)];
    if (!fits(block, offset, count * IMAGE_RECORD_BYTES)) invalid(location, 'an MFDD image list extends past the block');
    return Object.freeze(Array.from({ length: count }, (_, index) => offset + index * IMAGE_RECORD_BYTES));
  }));
}

/** A bitmap font table: {0, unknown, cell width, height} followed by 256 glyphs of `height` bytes. */
export function readFontTable(table: Uint8Array, path = ''): SourceFont {
  const location = fieldAt(path, 'glyphs');
  if (table.length < 4) invalid(location, 'the font table header is truncated');
  if (table[0] !== 0) invalid(location, 'the font table header must start with 0');
  const cellWidth = withinLimit(table[2], 'fontCellWidth', GRAPHICS_LIMITS.fontCellWidth, location);
  const height = withinLimit(table[3], 'fontHeight', GRAPHICS_LIMITS.fontHeight, location);
  if (table.length !== 4 + GRAPHICS_LIMITS.glyphCount * height) invalid(location, 'the font table must hold 256 glyphs of its height');
  return Object.freeze({ cellWidth, height, glyphs: exclusiveBytes(table.subarray(4)) });
}

/** Views of the three font tables a CCKD entry lists at its header, in directory order. */
function cockpitFontTables(block: Uint8Array, path: string): readonly Uint8Array[] {
  const location = fieldAt(path, 'fonts');
  if (!fits(block, 0, 8)) invalid(location, 'the CCKD header extends past the block');
  const directory = u32(block, 0);
  if (u32(block, 4) !== CCKD_FONT_COUNT) invalid(location, 'a CCKD font directory must list exactly 3 fonts');
  if (!fits(block, directory, CCKD_FONT_COUNT * 8)) invalid(location, 'the CCKD font directory extends past the block');
  return Object.freeze(Array.from({ length: CCKD_FONT_COUNT }, (_, index) => {
    const [offset, size] = [u32(block, directory + index * 8), u32(block, directory + index * 8 + 4)];
    if (!fits(block, offset, size)) invalid(location, 'a CCKD font table extends past the block');
    return block.subarray(offset, offset + size);
  }));
}

/** All three fonts of a CCKD entry in directory order. */
export function readCockpitFonts(block: Uint8Array, path = ''): readonly SourceFont[] {
  return Object.freeze(cockpitFontTables(block, path).map(table => readFontTable(table, path)));
}

/** Font `index` of a CCKD entry, the `fonts/<index>` subresource; the other tables need only lie inside the block. */
export function readCockpitFont(block: Uint8Array, index: number, path = ''): SourceFont {
  const tables = cockpitFontTables(block, path);
  if (!Number.isInteger(index) || index < 0 || index >= CCKD_FONT_COUNT) {
    throw new SourceError('subresource-not-found', fieldAt(path, 'fonts'), 'the CCKD font directory has no such font');
  }
  return readFontTable(tables[index], path);
}
