import { GRAPHICS_LIMITS } from '../../content/graphics/graphics-format.ts';
import { isOpaque, maskStride } from '../../content/graphics/image-payload.ts';
import { exclusiveBytes } from '../../content/ownership.ts';
import { SourceError, type SourceLimitName } from '../source-error.ts';

// Source structure of DATA palettes, 36-byte image records, MFDD record lists, bitmap font tables, CCKD group
// directories and TABL image lists (docs/original/formats/textures.md, cockpit.md and hud.md). Each reader checks structure and limits before
// it allocates anything sized by the source, copies its result into new buffers the caller owns and throws a
// SourceError located at a field (`palette`, `record`, `pixels`, `glyphs`, `fonts`, `groups`, `elements`) under the
// caller's `path`. Records inside containers are read at their block offset with the same rules as a whole-entry record.

const IMAGE_RECORD_BYTES = 36;
const DATA_PALETTE_BYTES = 768;
/** Each CCKD entry begins with exactly three fonts: two 8×8 and one 4×6 (hud §1). */
const CCKD_FONT_COUNT = 3;
/** CCKD directory records and elements (cockpit §1): an element is an image record, i32 x and y, and two u32 flags. */
const COCKPIT_GROUP_BYTES = 32;
const COCKPIT_ELEMENT_BYTES = 52;

/**
 * Approved safety caps on container counts above the largest baseline counts (docs/plan/p2/07/spec.md, limits): CCKD
 * directory slots (1–8), elements per slot (0–16, the layout element cap), records per MFDD list (0–16) and records per
 * TABL image list (1–64).
 */
export const CONTAINER_LIMITS = Object.freeze({
  cockpitSlots: 8, cockpitElements: GRAPHICS_LIMITS.layoutElements, mfdRecords: 16, tableRecords: 64,
});

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

/** One CCKD element in stored order. */
export interface CockpitElement {
  /** Block offset of the element's image record. */
  readonly recordOffset: number;
  /** Signed screen position of the image's top-left corner. */
  readonly x: number;
  readonly y: number;
  /** The two fields after the position, each 0 or 1; their meaning is unconfirmed (U-029) and never enters a payload. */
  readonly flags: readonly [number, number];
}

export interface SourceFont {
  readonly cellWidth: number;
  readonly height: number;
  /** The 256 × height glyph bytes after the header, copied bit for bit. */
  readonly glyphs: Uint8Array<ArrayBuffer>;
}

const fieldAt = (path: string, field: string): string => (path ? `${path}.${field}` : field);

/** Whether `length` bytes at `offset` lie inside the block, without overflowing. */
const fits = (block: Uint8Array, offset: number, length: number): boolean => offset <= block.length && length <= block.length - offset;

const u32 = (block: Uint8Array, offset: number): number =>
  new DataView(block.buffer, block.byteOffset + offset, 4).getUint32(0, true);

const i32 = (block: Uint8Array, offset: number): number =>
  new DataView(block.buffer, block.byteOffset + offset, 4).getInt32(0, true);

function invalid(location: string, reason: string): never {
  throw new SourceError('invalid-payload', location, reason);
}

function withinLimit(value: number, name: SourceLimitName, limit: number, location: string, minimum = 1): number {
  if (value < minimum || value > limit) throw new SourceError('limit-exceeded', location, 'is outside the supported range', { name, limit, observed: value });
  return value;
}

const notFound = (location: string, reason: string): never => {
  throw new SourceError('subresource-not-found', location, reason);
};

/** Whether `index` is an integer index into a list of `length` items. */
const isIndex = (index: number, length: number): boolean => Number.isInteger(index) && index >= 0 && index < length;

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

/** Rejects a raw record whose pixel data is not exactly width × height bytes. */
function requireRawSize({ width, height, dataSize }: ImageRecordHeader, path: string): void {
  if (dataSize !== width * height) invalid(fieldAt(path, 'pixels'), 'raw image data must be width * height bytes');
}

/** Checks the record at `offset`, then decodes its pixels into new buffers; stored row order is kept. */
export function decodeImageRecord(block: Uint8Array, offset = 0, path = ''): SourceImage {
  const header = readImageRecordHeader(block, offset, path);
  const location = fieldAt(path, 'pixels');
  const { width, height } = header;
  const data = block.subarray(header.pixelOffset, header.pixelOffset + header.dataSize);
  if (header.encoding === 'sprite-rle') return decodeSpriteRle(data, width, height, location);
  requireRawSize(header, path);
  return Object.freeze({ width, height, indices: exclusiveBytes(data), mask: null });
}

/** Rejects an opaque pixel whose index addresses no entry of a palette with `entryCount` entries; transparent pixels are ignored. */
export function checkPaletteIndices({ width, height, indices, mask }: SourceImage, entryCount: number, path = ''): void {
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (indices[pixel] >= entryCount && isOpaque(mask, width, pixel % width, Math.floor(pixel / width))) {
      throw new SourceError('palette-index-out-of-range', fieldAt(path, 'pixels'), 'an opaque pixel addresses no entry of the image palette');
    }
  }
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

/** Block offsets of the image records in MFDD lists 0 and 1; each list must fit the block and hold at most 16 records. */
export function readMfdRecordOffsets(block: Uint8Array, path = ''): readonly (readonly number[])[] {
  const location = fieldAt(path, 'record');
  if (!fits(block, 0, 16)) invalid(location, 'the MFDD header extends past the block');
  return Object.freeze([0, 8].map(at => {
    const [offset, count] = [u32(block, at), u32(block, at + 4)];
    if (!fits(block, offset, count * IMAGE_RECORD_BYTES)) invalid(location, 'an MFDD image list extends past the block');
    withinLimit(count, 'mfdRecords', CONTAINER_LIMITS.mfdRecords, location, 0);
    return Object.freeze(Array.from({ length: count }, (_, index) => offset + index * IMAGE_RECORD_BYTES));
  }));
}

/** Block offset of record `index` in MFDD list `list`, the `lists/<list>/records/<index>` subresource. */
export function mfdRecordOffset(block: Uint8Array, list: number, index: number, path = ''): number {
  const lists = readMfdRecordOffsets(block, path);
  const records = list === 0 || list === 1 ? lists[list] : [];
  if (!isIndex(index, records.length)) notFound(fieldAt(path, 'record'), 'the MFDD has no such list or record');
  return records[index];
}

/**
 * Block offsets of the records of a TABL image list (hud §2), the only TABL structure supported: no header; raw image
 * records without embedded palettes packed from offset 0; their count, 1–64, is record 0's pixel offset divided by 36
 * and is checked before the other records are read; and the records' pixel data follows in record order and fills the
 * rest of the block exactly. Anything else is `invalid-payload`.
 */
export function readTableRecordOffsets(block: Uint8Array, path = ''): readonly number[] {
  const location = fieldAt(path, 'record');
  const arrayEnd = readImageRecordHeader(block, 0, path).pixelOffset;
  if (arrayEnd < IMAGE_RECORD_BYTES || arrayEnd % IMAGE_RECORD_BYTES !== 0) invalid(location, 'a TABL image list must hold whole records before its data');
  const count = withinLimit(arrayEnd / IMAGE_RECORD_BYTES, 'tableRecords', CONTAINER_LIMITS.tableRecords, location);
  let dataEnd = arrayEnd;
  const offsets = Array.from({ length: count }, (_, index) => {
    const offset = index * IMAGE_RECORD_BYTES;
    const header = readImageRecordHeader(block, offset, path);
    if (header.encoding !== 'raw' || header.paletteCount !== 0) invalid(location, 'a TABL image list holds only raw records without embedded palettes');
    requireRawSize(header, path);
    if (header.pixelOffset !== dataEnd) invalid(location, 'TABL image list data must follow record order without gaps');
    dataEnd += header.dataSize;
    return offset;
  });
  if (dataEnd !== block.length) invalid(location, 'TABL image list data must fill the rest of the block');
  return Object.freeze(offsets);
}

/** Block offset of record `index` in a TABL image list, the `records/<index>` subresource. */
export function tableRecordOffset(block: Uint8Array, index: number, path = ''): number {
  const offsets = readTableRecordOffsets(block, path);
  if (!isIndex(index, offsets.length)) notFound(fieldAt(path, 'record'), 'the TABL image list has no such record');
  return offsets[index];
}

/**
 * Every CCKD directory slot's elements in stored order. An empty slot has no elements and its pointer addresses
 * nothing; every other element array must lie inside the block, and each element's two flag fields must be 0 or 1
 * (their meaning is unconfirmed, U-029). Counts are checked before anything they size is read.
 */
export function readCockpitGroups(block: Uint8Array, path = ''): readonly (readonly CockpitElement[])[] {
  const [groups, elements] = [fieldAt(path, 'groups'), fieldAt(path, 'elements')];
  if (!fits(block, 0, 16)) invalid(groups, 'the CCKD header extends past the block');
  const [directory, count] = [u32(block, 8), u32(block, 12)];
  withinLimit(count, 'cockpitSlots', CONTAINER_LIMITS.cockpitSlots, groups);
  if (!fits(block, directory, count * COCKPIT_GROUP_BYTES)) invalid(groups, 'the CCKD group directory extends past the block');
  return Object.freeze(Array.from({ length: count }, (_, slot) => {
    const at = directory + slot * COCKPIT_GROUP_BYTES;
    const [array, length] = [u32(block, at + 16), u32(block, at + 20)];
    withinLimit(length, 'cockpitElements', CONTAINER_LIMITS.cockpitElements, elements, 0);
    if (length > 0 && !fits(block, array, length * COCKPIT_ELEMENT_BYTES)) invalid(elements, 'a CCKD element array extends past the block');
    return Object.freeze(Array.from({ length }, (_, index) => {
      const element = array + index * COCKPIT_ELEMENT_BYTES;
      const flags = Object.freeze([u32(block, element + 44), u32(block, element + 48)] as const);
      if (flags[0] > 1 || flags[1] > 1) invalid(elements, 'a CCKD element flag must be 0 or 1');
      return Object.freeze({ recordOffset: element, x: i32(block, element + 36), y: i32(block, element + 40), flags });
    }));
  }));
}

/** The elements of CCKD directory slot `slot`, the `groups/<slot>` subresource; an empty slot has no layout. */
export function readCockpitGroup(block: Uint8Array, slot: number, path = ''): readonly CockpitElement[] {
  const groups = readCockpitGroups(block, path);
  const elements = isIndex(slot, groups.length) ? groups[slot] : [];
  if (elements.length === 0) notFound(fieldAt(path, 'groups'), 'the CCKD directory has no such non-empty slot');
  return elements;
}

/**
 * The palette of CCKD directory slot `slot`, the `groups/<slot>/palette` subresource (cockpit §1): directory +0x04
 * points to 768 bytes in the DATA format, read as a DATA palette, and +0x08 must hold 768 (an invariant of every
 * baseline slot). A slot past the directory or with a null pointer has no palette.
 */
export function readCockpitGroupPalette(block: Uint8Array, slot: number, path = ''): Uint8Array<ArrayBuffer> {
  const groups = readCockpitGroups(block, path);
  if (!isIndex(slot, groups.length)) notFound(fieldAt(path, 'groups'), 'the CCKD directory has no such slot');
  const at = u32(block, 8) + slot * COCKPIT_GROUP_BYTES;
  const [pointer, size] = [u32(block, at + 4), u32(block, at + 8)];
  const palette = fieldAt(path, 'palette');
  if (pointer === 0) notFound(palette, 'the CCKD group has no palette');
  if (size !== DATA_PALETTE_BYTES) invalid(palette, 'a CCKD group palette must be 768 bytes');
  if (!fits(block, pointer, DATA_PALETTE_BYTES)) invalid(palette, 'the CCKD group palette extends past the block');
  return readDataPalette(block.subarray(pointer, pointer + DATA_PALETTE_BYTES), path);
}

/** Block offset of the image record of element `index` in slot `slot`, the `groups/<slot>/elements/<index>` subresource. */
export function cockpitElementRecordOffset(block: Uint8Array, slot: number, index: number, path = ''): number {
  const elements = readCockpitGroup(block, slot, path);
  if (!isIndex(index, elements.length)) notFound(fieldAt(path, 'elements'), 'the CCKD group has no such element');
  return elements[index].recordOffset;
}

/**
 * A bitmap font table: {0, unknown, cell width, height} followed by 256 × `height` glyph bytes. How many rows each glyph
 * stores is the conversion declaration's choice (hud §1.1), so the bytes are returned unsplit.
 */
export function readFontTable(table: Uint8Array, path = ''): SourceFont {
  const location = fieldAt(path, 'glyphs');
  if (table.length < 4) invalid(location, 'the font table header is truncated');
  if (table[0] !== 0) invalid(location, 'the font table header must start with 0');
  const cellWidth = withinLimit(table[2], 'fontCellWidth', GRAPHICS_LIMITS.fontCellWidth, location);
  const height = withinLimit(table[3], 'fontHeight', GRAPHICS_LIMITS.fontHeight, location);
  if (table.length !== 4 + GRAPHICS_LIMITS.glyphCount * height) invalid(location, 'the font table length must be 4 + 256 * height');
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
  if (!isIndex(index, CCKD_FONT_COUNT)) notFound(fieldAt(path, 'fonts'), 'the CCKD font directory has no such font');
  return readFontTable(tables[index], path);
}
