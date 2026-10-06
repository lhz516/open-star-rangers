import { describe, expect, it } from 'vitest';
import { readAssetId, type AssetId } from '../asset-id.ts';
import { payloadTransferList } from '../ownership.ts';
import { expandImage, nearestColourMap } from './expand-image.ts';
import { expectContractError } from './graphics.test-support.ts';
import { encodeImagePayload, readImagePayload, type ImageDisplay, type ImagePayload } from './image-payload.ts';
import { encodePalettePayload, readPalettePayload, type PalettePayload } from './palette-payload.ts';

const SOURCE = readAssetId('palette/synthetic-texture');
const FLIGHT = readAssetId('palette/synthetic-flight');

const palette = (...colours: [number, number, number][]): PalettePayload =>
  readPalettePayload(encodePalettePayload({ entries: Uint8Array.from(colours.flat()) }), 1);

const SOURCE_PALETTE = palette([0, 0, 0], [10, 20, 30], [40, 50, 60], [70, 80, 90], [100, 110, 120], [130, 140, 150]);

// Source entries 0–3 against this target: exact match of 2, unique nearest 1, equidistant from 0 and 3, exact match of 3.
// Target entry 4 repeats entry 2, so the exact match also ties and must keep the lower index.
const NEAREST_SOURCE = palette([200, 0, 0], [90, 95, 110], [0, 0, 10], [0, 0, 20]);
const TARGET = palette([0, 0, 0], [100, 100, 100], [200, 0, 0], [0, 0, 20], [200, 0, 0]);

function image(display: ImageDisplay, overrides: Partial<Omit<ImagePayload, 'kind'>> = {}): ImagePayload {
  return readImagePayload(encodeImagePayload({
    width: 3, height: 2, palette: SOURCE, display, indices: new Uint8Array([1, 0, 2, 3, 4, 5]), mask: new Uint8Array([0b1010_0000, 0b1110_0000]), ...overrides,
  }), 1);
}

const palettes = (...entries: [AssetId, PalettePayload][]) => new Map(entries);

describe('nearest colour mapping (textures §3, confirmed by EXE code)', () => {
  it('maps exact matches, a unique nearest entry and equal distances to the lower index', () => {
    expect([...nearestColourMap(NEAREST_SOURCE, TARGET)]).toEqual([2, 1, 0, 3]);
  });

  it('compares the 8-bit source with each target component with its two low bits cleared', () => {
    // Masked, target 1 is (4, 4, 4), an exact match; unmasked, target 0 would be nearer.
    expect([...nearestColourMap(palette([4, 4, 4]), palette([2, 2, 2], [7, 7, 7]))]).toEqual([1]);
    // Masked, both targets are (0, 0, 0), so the tie keeps the lower index; unmasked, target 1 would be nearer.
    expect([...nearestColourMap(palette([2, 2, 2]), palette([0, 0, 0], [3, 3, 3]))]).toEqual([0]);
    // A 6-bit VGA palette expanded with bit replication searches its value times 4: white (63) as 255 is searched as 252.
    const vga = (value: number) => (value << 2) | (value >> 4);
    expect([...nearestColourMap(palette([253, 253, 253]), palette([vga(62), vga(62), vga(62)], [vga(63), vga(63), vga(63)]))]).toEqual([1]);
  });

  it('maps a palette onto itself as the identity', () => {
    expect([...nearestColourMap(SOURCE_PALETTE, SOURCE_PALETTE)]).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('image expansion', () => {
  it('expands a direct image pixel by pixel into non-premultiplied RGBA with transparent (0, 0, 0, 0)', () => {
    expect([...expandImage(image('direct'), palettes([SOURCE, SOURCE_PALETTE])).rgba]).toEqual([
      10, 20, 30, 255, 0, 0, 0, 0, 40, 50, 60, 255,
      70, 80, 90, 255, 100, 110, 120, 255, 130, 140, 150, 255,
    ]);
  });

  it('expands a nearest image as the nearest mapping followed by a lookup in the target palette', () => {
    const input = image({ nearest: FLIGHT }, { width: 2, height: 2, indices: new Uint8Array([0, 1, 2, 3]), mask: null });
    const result = expandImage(input, palettes([SOURCE, NEAREST_SOURCE], [FLIGHT, TARGET]));
    expect([...result.rgba]).toEqual([200, 0, 0, 255, 100, 100, 100, 255, 0, 0, 0, 255, 0, 0, 20, 255]);
    const targetColours = new Set(Array.from({ length: 5 }, (_, entry) => [...TARGET.entries.subarray(entry * 3, entry * 3 + 3)].join()));
    for (let pixel = 0; pixel < 4; pixel++) expect(targetColours.has([...result.rgba.subarray(pixel * 4, pixel * 4 + 3)].join())).toBe(true);
  });

  it('returns the same bytes in a new buffer the caller owns on every call', () => {
    const input = image('direct');
    const [first, second] = [expandImage(input, palettes([SOURCE, SOURCE_PALETTE])), expandImage(input, palettes([SOURCE, SOURCE_PALETTE]))];
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(payloadTransferList([first.rgba, second.rgba])).toEqual([first.rgba.buffer, second.rgba.buffer]);
    expect({ width: first.width, height: first.height, length: first.rgba.length }).toEqual({ width: 3, height: 2, length: 24 });
  });

  it.each([
    ['no palettes', image('direct'), palettes()],
    ['an extra palette', image('direct'), palettes([SOURCE, SOURCE_PALETTE], [FLIGHT, TARGET])],
    ['a missing nearest target', image({ nearest: FLIGHT }), palettes([SOURCE, SOURCE_PALETTE])],
    ['another palette ID', image('direct'), palettes([FLIGHT, SOURCE_PALETTE])],
  ])('reports binding-mismatch for %s', (_, input, given) => {
    expectContractError(() => expandImage(input, given), 'binding-mismatch', 'palettes', ['synthetic', 'palette/']);
  });

  it('rejects an opaque index beyond the image palette but ignores the index of a transparent pixel', () => {
    const sixteen = palette(...Array.from({ length: 16 }, (_, entry): [number, number, number] => [entry, entry, entry]));
    const outOfRange = image('direct', { indices: new Uint8Array([199, 0, 1, 2, 3, 4]) });
    expectContractError(() => expandImage(outOfRange, palettes([SOURCE, sixteen])), 'palette-index-out-of-range', 'image.indices', ['199', '16']);
    const hidden: ImagePayload = { ...image('direct'), indices: new Uint8Array([1, 16, 2, 3, 4, 5]) };
    expect(expandImage(hidden, palettes([SOURCE, sixteen])).rgba.subarray(4, 8)).toEqual(new Uint8Array(4));
  });
});
