import { describe, expect, it } from 'vitest';
import { encodeFontPayload, readFontPayload, type CharMapEntry } from './font-payload.ts';
import { glyphFor, glyphsFor } from './glyph-lookup.ts';
import { expectContractError } from './graphics.test-support.ts';

const font = (charMap: CharMapEntry[]) =>
  readFontPayload(encodeFontPayload({ cellWidth: 4, height: 6, glyphs: new Uint8Array(256 * 6).fill(0x60), charMap }), 1);

const HUD = font([{ code: 0x20, glyph: 0 }, { code: 0x41, glyph: 3 }, { code: 0x42, glyph: 200 }]);

describe('character lookup', () => {
  it('returns the glyph each mapped code declares', () => {
    expect([0x20, 0x41, 0x42].map(code => glyphFor(HUD, code))).toEqual([0, 3, 200]);
    const full = font(Array.from({ length: 256 }, (_, code) => ({ code, glyph: 255 - code })));
    expect(Array.from({ length: 256 }, (_, code) => glyphFor(full, code))).toEqual(Array.from({ length: 256 }, (_, code) => 255 - code));
  });

  it.each([0xc7, 0x00, 0xff, -1, 256, 65.5])('reports unmapped-character for code %s without falling back to a same-numbered glyph', code => {
    expectContractError(() => glyphFor(HUD, code), 'unmapped-character', 'code', [String(code), code.toString(16)]);
  });

  it('has no glyph at all for an empty map', () => {
    expectContractError(() => glyphFor(font([]), 0x41, 'label'), 'unmapped-character', 'label');
  });

  it('looks up a text byte sequence in order and reports the first unmapped position', () => {
    expect([...glyphsFor(HUD, new Uint8Array([0x41, 0x42, 0x20, 0x41]))]).toEqual([3, 200, 0, 3]);
    expect(glyphsFor(HUD, [])).toEqual(new Uint8Array(0));
    expectContractError(() => glyphsFor(HUD, [0x41, 0xc7, 0x44]), 'unmapped-character', 'text[1]', ['199', 'c7']);
  });
});
