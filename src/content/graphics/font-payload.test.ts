import { describe, expect, it } from 'vitest';
import { payloadTransferList } from '../ownership.ts';
import { encodeFontPayload, readFontPayload, type CharMapEntry, type FontPayload } from './font-payload.ts';
import { expectContractError, set8 } from './graphics.test-support.ts';

/** 256 glyphs whose rows all differ; glyph 1 sets bits beyond a 4-pixel cell in its lower rows. */
function glyphs(height: number): Uint8Array {
  const rows = Uint8Array.from({ length: 256 * height }, (_, index) => (index * 37 + 11) & 0xff);
  rows.set([0x80, 0x40, 0x20, 0x1f, 0x0f, 0x01].slice(0, height), height);
  return rows;
}

const map = (...pairs: [number, number][]): CharMapEntry[] => pairs.map(([code, glyph]) => ({ code, glyph }));

const font = (overrides: Partial<Omit<FontPayload, 'kind'>> = {}): Omit<FontPayload, 'kind'> =>
  ({ cellWidth: 4, height: 6, glyphs: glyphs(6), charMap: map([0x30, 16], [0x41, 33]), ...overrides });

describe('font payload schema 1', () => {
  it('lays out the cell, map count, glyph rows in glyph order and code/glyph pairs', () => {
    const bytes = encodeFontPayload(font());
    expect([...bytes.subarray(0, 4)]).toEqual([4, 6, 2, 0]);
    expect([...bytes.subarray(4 + 6, 4 + 12)]).toEqual([0x80, 0x40, 0x20, 0x1f, 0x0f, 0x01]);
    expect([...bytes.subarray(4 + 256 * 6)]).toEqual([0x30, 16, 0x41, 33]);
  });

  it.each([
    ['4×6 with bits beyond the cell', font()],
    ['8×8', font({ cellWidth: 8, height: 8, glyphs: glyphs(8) })],
    ['an empty map', font({ charMap: [] })],
    ['a 256-entry map', font({ charMap: Array.from({ length: 256 }, (_, code) => ({ code, glyph: 255 - code })) })],
    ['the narrowest cell', font({ cellWidth: 1, height: 1, glyphs: glyphs(1) })],
  ])('round-trips %s bit for bit into frozen data', (_, input) => {
    const bytes = encodeFontPayload(input);
    expect(payloadTransferList([bytes])).toEqual([bytes.buffer]);
    const result = readFontPayload(bytes, 1);
    expect(result).toEqual({ kind: 'font', ...input });
    for (const container of [result, result.charMap, ...result.charMap]) expect(Object.isFrozen(container)).toBe(true);
    result.glyphs[0] ^= 0xff;
    input.glyphs[1] ^= 0xff;
    expect(readFontPayload(bytes, 1).glyphs).toEqual(glyphs(input.height));
  });

  it.each<[string, (bytes: Uint8Array) => unknown, string, string]>([
    ['schema 2', bytes => readFontPayload(bytes, 2), 'unsupported-payload-schema', 'payload.schemaVersion'],
    ['a truncated header', bytes => readFontPayload(bytes.subarray(0, 3), 1), 'invalid-graphics-payload', 'payload'],
    ['cell width 0', bytes => readFontPayload(set8(bytes, 0, 0), 1), 'invalid-graphics-payload', 'payload.cellWidth'],
    ['cell width 9', bytes => readFontPayload(set8(bytes, 0, 9), 1), 'invalid-graphics-payload', 'payload.cellWidth'],
    ['height 0', bytes => readFontPayload(set8(bytes, 1, 0), 1), 'invalid-graphics-payload', 'payload.height'],
    ['height 9', bytes => readFontPayload(set8(bytes, 1, 9), 1), 'invalid-graphics-payload', 'payload.height'],
    ['257 map entries', bytes => readFontPayload(set8(set8(bytes, 2, 1), 3, 1), 1), 'invalid-graphics-payload', 'payload.charMap'],
    ['a table for another height', bytes => readFontPayload(set8(bytes, 1, 5), 1), 'invalid-graphics-payload', 'payload'],
    ['a truncated map', bytes => readFontPayload(bytes.subarray(0, -1), 1), 'invalid-graphics-payload', 'payload'],
    ['a trailing byte', bytes => readFontPayload(Uint8Array.of(...bytes, 0), 1), 'invalid-graphics-payload', 'payload'],
    ['map codes out of order', bytes => readFontPayload(set8(bytes, bytes.length - 2, 0x20), 1), 'invalid-graphics-payload', 'payload.charMap[1].code'],
    ['a repeated map code', bytes => readFontPayload(set8(bytes, bytes.length - 2, 0x30), 1), 'invalid-graphics-payload', 'payload.charMap[1].code'],
  ])('reader rejects %s', (_, read, code, path) => expectContractError(() => read(encodeFontPayload(font())), code, path));

  it.each([
    ['cell width 0', { cellWidth: 0 }, 'font.cellWidth'],
    ['cell width 9', { cellWidth: 9 }, 'font.cellWidth'],
    ['height 0', { height: 0 }, 'font.height'],
    ['height 9', { height: 9 }, 'font.height'],
    ['a table for another height', { height: 5 }, 'font.glyphs'],
    ['257 map entries', { charMap: Array.from({ length: 257 }, (_, code) => ({ code, glyph: 0 })) }, 'font.charMap'],
    ['code 256', { charMap: map([256, 0]) }, 'font.charMap[0].code'],
    ['glyph -1', { charMap: map([1, -1]) }, 'font.charMap[0].glyph'],
    ['codes out of order', { charMap: map([2, 0], [1, 0]) }, 'font.charMap[1].code'],
    ['a repeated code', { charMap: map([2, 0], [2, 1]) }, 'font.charMap[1].code'],
  ])('encoder rejects %s', (_, overrides, path) => {
    expectContractError(() => encodeFontPayload(font(overrides)), 'invalid-graphics-payload', path);
  });
});
