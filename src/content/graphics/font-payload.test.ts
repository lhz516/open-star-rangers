import { describe, expect, it } from 'vitest';
import { payloadTransferList } from '../ownership.ts';
import { encodeFontPayload, readFontPayload, type CharMapEntry, type FontPayload } from './font-payload.ts';
import { expectContractError, set8 } from './graphics.test-support.ts';

/** `count` glyphs of `rows` rows that all differ; glyph 1 sets bits beyond a 4-pixel cell in its lower rows. */
function glyphs(rows: number, count = 256): Uint8Array {
  const bytes = Uint8Array.from({ length: count * rows }, (_, index) => (index * 37 + 11) & 0xff);
  if (count > 1) bytes.set([0x80, 0x40, 0x20, 0x1f, 0x0f, 0x01, 0x81, 0x18].slice(0, rows), rows);
  return bytes;
}

const map = (...pairs: [number, number][]): CharMapEntry[] => pairs.map(([code, glyph]) => ({ code, glyph }));

const font = (overrides: Partial<Omit<FontPayload, 'kind'>> = {}): Omit<FontPayload, 'kind'> =>
  ({ cellWidth: 4, height: 6, glyphRows: 6, glyphs: glyphs(6), charMap: map([0x30, 16], [0x41, 33]), ...overrides });

describe('font payload schema 1', () => {
  it('lays out the cell, glyph rows and count, map count, glyph rows in glyph order and code/glyph pairs', () => {
    const bytes = encodeFontPayload(font());
    expect([...bytes.subarray(0, 7)]).toEqual([4, 6, 6, 0, 1, 2, 0]);
    expect([...bytes.subarray(7 + 6, 7 + 12)]).toEqual([0x80, 0x40, 0x20, 0x1f, 0x0f, 0x01]);
    expect([...bytes.subarray(7 + 256 * 6)]).toEqual([0x30, 16, 0x41, 33]);
  });

  it('stores glyphs with more rows than the cell, as in a 4×6 table of 192 eight-row glyphs', () => {
    const bytes = encodeFontPayload(font({ glyphRows: 8, glyphs: glyphs(8, 192), charMap: map([0x41, 0x41]) }));
    expect([...bytes.subarray(0, 7)]).toEqual([4, 6, 8, 192, 0, 1, 0]);
    expect([...bytes.subarray(7 + 8, 7 + 16)]).toEqual([0x80, 0x40, 0x20, 0x1f, 0x0f, 0x01, 0x81, 0x18]);
    expect(bytes.length).toBe(7 + 192 * 8 + 2);
  });

  it.each([
    ['4×6 with bits beyond the cell', font()],
    ['4×6 in 192 eight-row glyphs', font({ glyphRows: 8, glyphs: glyphs(8, 192), charMap: map([0x30, 0x30], [0xff, 191]) })],
    ['8×8', font({ cellWidth: 8, height: 8, glyphRows: 8, glyphs: glyphs(8) })],
    ['a single glyph', font({ glyphs: glyphs(6, 1), charMap: map([0x20, 0]) })],
    ['an empty map', font({ charMap: [] })],
    ['a 256-entry map', font({ charMap: Array.from({ length: 256 }, (_, code) => ({ code, glyph: 255 - code })) })],
    ['the narrowest cell', font({ cellWidth: 1, height: 1, glyphRows: 1, glyphs: glyphs(1) })],
  ])('round-trips %s bit for bit into frozen data', (_, input) => {
    const bytes = encodeFontPayload(input);
    expect(payloadTransferList([bytes])).toEqual([bytes.buffer]);
    const result = readFontPayload(bytes, 1);
    expect(result).toEqual({ kind: 'font', ...input });
    for (const container of [result, result.charMap, ...result.charMap]) expect(Object.isFrozen(container)).toBe(true);
    result.glyphs[0] ^= 0xff;
    input.glyphs[1] ^= 0xff;
    expect(readFontPayload(bytes, 1).glyphs).toEqual(glyphs(input.glyphRows, input.glyphs.length / input.glyphRows));
  });

  it.each<[string, (bytes: Uint8Array) => unknown, string, string]>([
    ['schema 2', bytes => readFontPayload(bytes, 2), 'unsupported-payload-schema', 'payload.schemaVersion'],
    ['a truncated header', bytes => readFontPayload(bytes.subarray(0, 6), 1), 'invalid-graphics-payload', 'payload'],
    ['cell width 0', bytes => readFontPayload(set8(bytes, 0, 0), 1), 'invalid-graphics-payload', 'payload.cellWidth'],
    ['cell width 9', bytes => readFontPayload(set8(bytes, 0, 9), 1), 'invalid-graphics-payload', 'payload.cellWidth'],
    ['height 0', bytes => readFontPayload(set8(bytes, 1, 0), 1), 'invalid-graphics-payload', 'payload.height'],
    ['height 9', bytes => readFontPayload(set8(bytes, 1, 9), 1), 'invalid-graphics-payload', 'payload.height'],
    ['glyph rows below the height', bytes => readFontPayload(set8(bytes, 2, 5), 1), 'invalid-graphics-payload', 'payload.glyphRows'],
    ['glyph rows 9', bytes => readFontPayload(set8(set8(bytes, 1, 8), 2, 9), 1), 'invalid-graphics-payload', 'payload.glyphRows'],
    ['0 glyphs', bytes => readFontPayload(set8(set8(bytes, 3, 0), 4, 0), 1), 'invalid-graphics-payload', 'payload.glyphCount'],
    ['257 glyphs', bytes => readFontPayload(set8(set8(bytes, 3, 1), 4, 1), 1), 'invalid-graphics-payload', 'payload.glyphCount'],
    ['257 map entries', bytes => readFontPayload(set8(set8(bytes, 5, 1), 6, 1), 1), 'invalid-graphics-payload', 'payload.charMap'],
    ['a table for other glyph rows', bytes => readFontPayload(set8(bytes, 2, 7), 1), 'invalid-graphics-payload', 'payload'],
    ['a table for another glyph count', bytes => readFontPayload(set8(set8(bytes, 3, 255), 4, 0), 1), 'invalid-graphics-payload', 'payload'],
    ['a truncated map', bytes => readFontPayload(bytes.subarray(0, -1), 1), 'invalid-graphics-payload', 'payload'],
    ['a trailing byte', bytes => readFontPayload(Uint8Array.of(...bytes, 0), 1), 'invalid-graphics-payload', 'payload'],
    ['map codes out of order', bytes => readFontPayload(set8(bytes, bytes.length - 2, 0x20), 1), 'invalid-graphics-payload', 'payload.charMap[1].code'],
    ['a repeated map code', bytes => readFontPayload(set8(bytes, bytes.length - 2, 0x30), 1), 'invalid-graphics-payload', 'payload.charMap[1].code'],
  ])('reader rejects %s', (_, read, code, path) => expectContractError(() => read(encodeFontPayload(font())), code, path));

  it('reader rejects a mapped glyph beyond the glyph count', () => {
    const bytes = encodeFontPayload(font({ glyphRows: 8, glyphs: glyphs(8, 192), charMap: map([0x41, 191]) }));
    expectContractError(() => readFontPayload(set8(bytes, bytes.length - 1, 192), 1), 'invalid-graphics-payload', 'payload.charMap[0].glyph');
  });

  it.each([
    ['cell width 0', { cellWidth: 0 }, 'font.cellWidth'],
    ['cell width 9', { cellWidth: 9 }, 'font.cellWidth'],
    ['height 0', { height: 0 }, 'font.height'],
    ['height 9', { height: 9 }, 'font.height'],
    ['glyph rows below the height', { glyphRows: 5 }, 'font.glyphRows'],
    ['glyph rows 9', { glyphRows: 9, glyphs: glyphs(9) }, 'font.glyphRows'],
    ['glyphs that are not whole rows', { glyphs: glyphs(6).subarray(1) }, 'font.glyphs'],
    ['no glyphs', { glyphs: new Uint8Array(0) }, 'font.glyphs'],
    ['257 glyphs', { glyphs: glyphs(6, 257) }, 'font.glyphs'],
    ['a glyph beyond the glyph count', { glyphs: glyphs(6, 192), charMap: map([1, 192]) }, 'font.charMap[0].glyph'],
    ['257 map entries', { charMap: Array.from({ length: 257 }, (_, code) => ({ code, glyph: 0 })) }, 'font.charMap'],
    ['code 256', { charMap: map([256, 0]) }, 'font.charMap[0].code'],
    ['glyph -1', { charMap: map([1, -1]) }, 'font.charMap[0].glyph'],
    ['codes out of order', { charMap: map([2, 0], [1, 0]) }, 'font.charMap[1].code'],
    ['a repeated code', { charMap: map([2, 0], [2, 1]) }, 'font.charMap[1].code'],
  ])('encoder rejects %s', (_, overrides, path) => {
    expectContractError(() => encodeFontPayload(font(overrides)), 'invalid-graphics-payload', path);
  });
});
