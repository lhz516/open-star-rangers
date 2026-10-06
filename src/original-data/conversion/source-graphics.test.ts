import { describe, expect, it } from 'vitest';
import { encodeImagePayload, readImagePayload } from '../../content/graphics/image-payload.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { readAssetId } from '../../content/asset-id.ts';
import { ByteWriter } from '../synthetic.ts';
import {
  cockpitBlock as cockpit, expectSourceError as rejects, fontTable, hudFontTables, recordBlock as record,
} from './conversion.test-support.ts';
import {
  checkPaletteIndices, decodeImageRecord, readCockpitFont, readCockpitFonts, readDataPalette, readEmbeddedPalette, readFontTable,
  readImageRecordHeader, readMfdRecordOffsets,
} from './source-graphics.ts';

// A 5×3 sprite whose rows differ, as little-endian u16 runs and pixels. Row 0: transparent 0, opaque 2 (1, 2),
// transparent 3. Row 1: transparent 5. Row 2: transparent 1, opaque 3 (3, 4, 5), transparent 1.
const SPRITE_RUNS = [0, 0, 2, 0, 1, 2, 3, 0, 5, 0, 1, 0, 3, 0, 3, 4, 5, 1, 0];
const SPRITE_INDICES = [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 5, 0];
const SPRITE_MASK = [0b1100_0000, 0, 0b0111_0000];

const HUD_FONTS = hudFontTables();

describe('DATA palette source', () => {
  it('expands 6-bit components by bit replication into a new buffer', () => {
    const block = new Uint8Array(768);
    block.set([0, 1, 32, 63], 0);
    const rgb = readDataPalette(block);
    expect({ head: [...rgb.subarray(0, 4)], length: rgb.length }).toEqual({ head: [0, 4, 130, 255], length: 768 });
    block[0] = 63;
    expect(rgb[0]).toBe(0);
    expect(payloadTransferList([rgb])).toEqual([rgb.buffer]);
  });

  it.each([
    ['767 bytes', new Uint8Array(767)],
    ['769 bytes', new Uint8Array(769)],
    ['a component of 64', Uint8Array.from({ length: 768 }, (_, index) => (index === 700 ? 64 : 0))],
  ])('rejects %s without truncating', (_, block) => rejects(() => readDataPalette(block, 'graphics[palette/a]'), 'invalid-payload', 'graphics[palette/a].palette'));
});

describe('embedded palette source', () => {
  it('reads BGR entries as RGB for 1 and 256 entries', () => {
    const one = record({ width: 1, height: 1, paletteOffset: 36, paletteCount: 1, pixelOffset: 39, size: 1 }, [1, 2, 3], [0]);
    expect([...readEmbeddedPalette(one)]).toEqual([3, 2, 1]);
    const bgr = Array.from({ length: 768 }, (_, index) => index & 0xff);
    const full = record({ width: 1, height: 1, paletteOffset: 36, paletteCount: 256, pixelOffset: 804, size: 1 }, bgr, [0]);
    const rgb = readEmbeddedPalette(full);
    expect(rgb.length).toBe(768);
    expect([...rgb.subarray(765)]).toEqual([bgr[767], bgr[766], bgr[765]]);
  });

  it('limits the entry count to 256 when reading the record', () => {
    const block = record({ width: 1, height: 1, paletteOffset: 36, paletteCount: 257, pixelOffset: 36, size: 1 }, new Array(771).fill(0));
    rejects(() => readImageRecordHeader(block), 'limit-exceeded', 'palette', { name: 'paletteEntryCount', limit: 256, observed: 257 });
  });

  it('reports a record without an embedded palette as a missing subresource', () => {
    const block = record({ width: 1, height: 1, size: 1 }, [0]);
    rejects(() => readEmbeddedPalette(block, 0, 'graphics[palette/a]'), 'subresource-not-found', 'graphics[palette/a].palette');
  });
});

describe('image record source', () => {
  it('decodes an asymmetric raw image into a new opaque buffer', () => {
    const block = record({ width: 3, height: 2, size: 6 }, [10, 11, 12, 13, 14, 15]);
    const image = decodeImageRecord(block);
    expect({ ...image, indices: [...image.indices] }).toEqual({ width: 3, height: 2, indices: [10, 11, 12, 13, 14, 15], mask: null });
    block[36] = 99;
    expect(image.indices[0]).toBe(10);
    expect(payloadTransferList([image.indices])).toEqual([image.indices.buffer]);
  });

  it('decodes an asymmetric sprite into indices with 0 at transparent pixels and a canonical packed mask', () => {
    const block = record({ encoding: 2, width: 5, height: 3, size: SPRITE_RUNS.length }, SPRITE_RUNS);
    const image = decodeImageRecord(block);
    expect({ indices: [...image.indices], mask: [...image.mask!] }).toEqual({ indices: SPRITE_INDICES, mask: SPRITE_MASK });
    expect(payloadTransferList([image.indices, image.mask!])).toHaveLength(2);
    const palette = readAssetId('palette/synthetic');
    expect(readImagePayload(encodeImagePayload({ ...image, palette, display: 'direct' }), 1)).toEqual({ kind: 'image', ...image, palette, display: 'direct' });
  });

  it.each([
    ['an aligned 16-pixel run', 0, 16, [0xff, 0xff, 0]],
    ['an unaligned 14-pixel run', 3, 14, [0b0001_1111, 0xff, 0b1000_0000]],
  ])('packs %s into whole mask bytes and edge bits', (_, skip, run, mask) => {
    const pixels = Array.from({ length: run }, (_, index) => index + 1);
    const data = [skip, 0, run, 0, ...pixels, 20 - skip - run, 0];
    const image = decodeImageRecord(record({ encoding: 2, width: 20, height: 1, size: data.length }, data));
    expect({ mask: [...image.mask!], indices: [...image.indices] })
      .toEqual({ mask, indices: [...new Array(skip).fill(0), ...pixels, ...new Array(20 - skip - run).fill(0)] });
  });

  it('alternates runs across a zero-length opaque run', () => {
    // Transparent 1, opaque 0, transparent 2, opaque 2 (6, 7).
    const block = record({ encoding: 2, width: 5, height: 1, size: 10 }, [1, 0, 0, 0, 2, 0, 2, 0, 6, 7]);
    const image = decodeImageRecord(block);
    expect({ indices: [...image.indices], mask: [...image.mask!] }).toEqual({ indices: [0, 0, 0, 6, 7], mask: [0b0001_1000] });
  });

  it('checks the record itself before decoding or reading its palette', () => {
    const block = record({ width: 65_535, height: 65_535, paletteOffset: 36, paletteCount: 256, size: 1 });
    rejects(() => decodeImageRecord(block), 'limit-exceeded', 'record', { name: 'imageWidth', limit: 640, observed: 65_535 });
    rejects(() => readEmbeddedPalette(block), 'limit-exceeded', 'record', { name: 'imageWidth', limit: 640, observed: 65_535 });
  });

  it('reads a record at an offset inside a larger block with block-relative pointers', () => {
    const block = new ByteWriter().u32(0xdead_beef).u32(8, 0, 2, 1, 0, 0, 0, 40, 2).u8(7, 8).toBytes();
    expect([...decodeImageRecord(block, 4).indices]).toEqual([7, 8]);
  });

  it('rejects a 65535×65535 header from its fields alone', () => {
    const block = record({ width: 65_535, height: 65_535, size: 65_535 * 65_535 });
    rejects(() => decodeImageRecord(block), 'limit-exceeded', 'record', { name: 'imageWidth', limit: 640, observed: 65_535 });
  });

  it.each([
    ['a truncated record', new Uint8Array(35), 'invalid-payload', 'record', null],
    ['16 bits per pixel', record({ bitsPerPixel: 16, width: 1, height: 1, size: 1 }, [0]), 'invalid-payload', 'record', null],
    ['a nonzero reserved field', record({ reserved: 1, width: 1, height: 1, size: 1 }, [0]), 'invalid-payload', 'record', null],
    ['animation encoding 1', record({ encoding: 1, width: 1, height: 1, size: 1 }, [0]), 'unsupported-encoding', 'record', null],
    ['unknown encoding 3', record({ encoding: 3, width: 1, height: 1, size: 1 }, [0]), 'unsupported-encoding', 'record', null],
    ['width 0', record({ width: 0, height: 1, size: 0 }), 'limit-exceeded', 'record', { name: 'imageWidth', limit: 640, observed: 0 }],
    ['width 641', record({ width: 641, height: 1, size: 641 }, new Array(641).fill(0)), 'limit-exceeded', 'record', { name: 'imageWidth', limit: 640, observed: 641 }],
    ['height 0', record({ width: 1, height: 0, size: 0 }), 'limit-exceeded', 'record', { name: 'imageHeight', limit: 480, observed: 0 }],
    ['height 481', record({ width: 1, height: 481, size: 481 }, new Array(481).fill(0)), 'limit-exceeded', 'record', { name: 'imageHeight', limit: 480, observed: 481 }],
    ['a palette past the block', record({ width: 1, height: 1, paletteOffset: 36, paletteCount: 2, pixelOffset: 36, size: 1 }, [0, 0, 0, 0, 0]), 'invalid-payload', 'palette', null],
    ['a palette pointer past the block', record({ width: 1, height: 1, paletteOffset: 0xffff_ffff, paletteCount: 1, size: 1 }, [0]), 'invalid-payload', 'palette', null],
    ['pixels past the block', record({ width: 2, height: 1, size: 2 }, [0]), 'invalid-payload', 'pixels', null],
    ['a pixel pointer past the block', record({ width: 1, height: 1, pixelOffset: 0xffff_ffff, size: 0xffff_ffff }), 'invalid-payload', 'pixels', null],
    ['a raw size other than width × height', record({ width: 3, height: 2, size: 5 }, [0, 0, 0, 0, 0]), 'invalid-payload', 'pixels', null],
    ['a truncated sprite row', record({ encoding: 2, width: 5, height: 3, size: 8 }, SPRITE_RUNS.slice(0, 8)), 'invalid-payload', 'pixels', null],
    ['truncated sprite pixels', record({ encoding: 2, width: 5, height: 1, size: 5 }, [0, 0, 2, 0, 1]), 'invalid-payload', 'pixels', null],
    ['a run past the row', record({ encoding: 2, width: 5, height: 1, size: 2 }, [6, 0]), 'invalid-payload', 'pixels', null],
    ['trailing sprite bytes', record({ encoding: 2, width: 5, height: 1, size: 4 }, [5, 0, 0, 0]), 'invalid-payload', 'pixels', null],
  ] as const)('rejects %s', (_, block, code, location, limit) => rejects(() => decodeImageRecord(block), code, location, limit));

  it('places locations under the caller path', () => {
    rejects(() => readImageRecordHeader(record({ bitsPerPixel: 4, width: 1, height: 1, size: 1 }, [0]), 0, 'graphics[image/a]'), 'invalid-payload', 'graphics[image/a].record');
  });
});

describe('palette index range', () => {
  const image = (indices: number[], mask: number[] | null) =>
    ({ width: 3, height: 1, indices: Uint8Array.from(indices), mask: mask && Uint8Array.from(mask) }) as Parameters<typeof checkPaletteIndices>[0];

  it('accepts opaque indices below the entry count and ignores transparent pixels', () => {
    expect(() => checkPaletteIndices(image([0, 1, 15], null), 16)).not.toThrow();
    expect(() => checkPaletteIndices(image([0, 16, 15], [0b1010_0000]), 16)).not.toThrow();
  });

  it('rejects an opaque index at the entry count', () => {
    rejects(() => checkPaletteIndices(image([0, 16, 15], null), 16, 'graphics[image/a]'), 'palette-index-out-of-range', 'graphics[image/a].pixels');
    rejects(() => checkPaletteIndices(image([0, 1, 16], [0b1010_0000]), 16), 'palette-index-out-of-range', 'pixels');
  });
});

describe('MFDD record lists', () => {
  it('returns the block offsets of both lists', () => {
    const block = new ByteWriter().u32(16, 1, 52, 2).toBytes();
    const padded = Uint8Array.of(...block, ...new Array(36 * 3).fill(0));
    expect(readMfdRecordOffsets(padded)).toEqual([[16], [52, 88]]);
  });

  it.each([
    ['a truncated header', new Uint8Array(15)],
    ['a list past the block', Uint8Array.of(...new ByteWriter().u32(16, 2, 16, 0).toBytes(), ...new Array(36).fill(0))],
    ['a huge count', new ByteWriter().u32(16, 0xffff_ffff, 16, 0).toBytes()],
  ])('rejects %s', (_, block) => rejects(() => readMfdRecordOffsets(block), 'invalid-payload', 'record'));
});

describe('bitmap font source', () => {
  it.each([[4, 6], [8, 8]])('copies a %i×%i table bit for bit, including bits beyond the cell', (width, height) => {
    const table = fontTable(width, height);
    const font = readFontTable(table);
    expect({ cellWidth: font.cellWidth, height: font.height, glyphs: [...font.glyphs] }).toEqual({ cellWidth: width, height, glyphs: [...table.subarray(4)] });
    expect(font.glyphs.some(row => (row & (0xff >> width)) !== 0)).toBe(width < 8);
    table[4] ^= 0xff;
    expect(font.glyphs[0]).toBe(fontTable(width, height)[4]);
  });

  it.each([
    ['cell width 0', fontTable(0, 8), 'limit-exceeded', { name: 'fontCellWidth', limit: 8, observed: 0 }],
    ['cell width 9', fontTable(9, 8), 'limit-exceeded', { name: 'fontCellWidth', limit: 8, observed: 9 }],
    ['height 0', fontTable(8, 0), 'limit-exceeded', { name: 'fontHeight', limit: 8, observed: 0 }],
    ['height 9', fontTable(8, 9), 'limit-exceeded', { name: 'fontHeight', limit: 8, observed: 9 }],
    ['a table length for another height', fontTable(8, 8, 4 + 256 * 6), 'invalid-payload', null],
    ['a truncated header', new Uint8Array([0, 1, 8]), 'invalid-payload', null],
    ['a nonzero first header byte', fontTable(8, 8).map((byte, index) => (index === 0 ? 1 : byte)), 'invalid-payload', null],
  ] as const)('rejects %s', (_, table, code, limit) => rejects(() => readFontTable(table, 'graphics[font/a]'), code, 'graphics[font/a].glyphs', limit));

  it('reads the three CCKD fonts in directory order into new buffers and selects one by index', () => {
    const block = cockpit(HUD_FONTS);
    const fonts = readCockpitFonts(block);
    expect(fonts).toEqual(HUD_FONTS.map(table => readFontTable(table)));
    expect(fonts.map(({ cellWidth, height }) => [cellWidth, height])).toEqual([[8, 8], [8, 8], [4, 6]]);
    expect(readCockpitFont(block, 2)).toEqual(fonts[2]);
    block.fill(0);
    expect(fonts[0].glyphs).toEqual(HUD_FONTS[0].subarray(4));
    expect(payloadTransferList(fonts.map(font => font.glyphs))).toHaveLength(3);
  });

  it('selects one CCKD font without parsing the other tables', () => {
    expect(readCockpitFont(cockpit([new Uint8Array(3), new Uint8Array(0), HUD_FONTS[2]]), 2)).toEqual(readFontTable(HUD_FONTS[2]));
  });

  it.each([
    ['2 fonts', cockpit(HUD_FONTS.slice(0, 2))],
    ['4 fonts', cockpit([...HUD_FONTS, fontTable(8, 8)])],
    ['a directory past the block', new ByteWriter().u32(8, 3, 32, 0).toBytes()],
    ['a table past the block', cockpit(HUD_FONTS).subarray(0, -1)],
    ['a truncated header', new Uint8Array(7)],
  ])('rejects a CCKD directory with %s', (_, block) => rejects(() => readCockpitFont(block, 0, 'graphics[font/a]'), 'invalid-payload', 'graphics[font/a].fonts'));

  it.each([3, -1, 0.5])('reports fonts/%s as a missing subresource', index => {
    rejects(() => readCockpitFont(cockpit(HUD_FONTS), index), 'subresource-not-found', 'fonts');
  });
});
