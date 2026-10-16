import { describe, expect, it } from 'vitest';
import { readAssetId } from '../asset-id.ts';
import { payloadTransferList } from '../ownership.ts';
import { asciiBytes } from './graphics-format.ts';
import { encodeImagePayload, isOpaque, readImagePayload, type ImagePayload } from './image-payload.ts';
import { expectContractError, packMask, set16, set8, setText } from './graphics.test-support.ts';

const PALETTE = readAssetId('palette/synthetic-a');
const TARGET = readAssetId('palette/synthetic-flight');

// A 10×3 sprite: rows differ, row 1 is fully transparent and each row ends in a padded mask byte.
const MASK_ROWS = ['1101100001', '0000000000', '0111111110'];

function maskedImage(): Omit<ImagePayload, 'kind'> {
  const indices = Uint8Array.from({ length: 30 }, (_, index) => (MASK_ROWS[Math.floor(index / 10)][index % 10] === '1' ? index + 1 : 0));
  return { width: 10, height: 3, palette: PALETTE, display: { nearest: TARGET }, indices, mask: packMask(MASK_ROWS) };
}

const opaqueImage = (): Omit<ImagePayload, 'kind'> =>
  ({ width: 3, height: 2, palette: PALETTE, display: 'direct', indices: new Uint8Array([1, 2, 3, 4, 5, 6]), mask: null });

const idAt = 8;
const maskedPixelsAt = idAt + PALETTE.length + TARGET.length;
const maskedMaskAt = maskedPixelsAt + 30;

describe('image payload schema 1', () => {
  it('lays out the header, ASCII palette ID and row-major indices of an opaque direct image', () => {
    expect([...encodeImagePayload(opaqueImage())]).toEqual([3, 0, 2, 0, 0, 0, PALETTE.length, 0, ...asciiBytes(PALETTE), 1, 2, 3, 4, 5, 6]);
  });

  it('round-trips an asymmetric opaque image into frozen data with exclusive copies', () => {
    const input = opaqueImage();
    const bytes = encodeImagePayload(input);
    expect(payloadTransferList([bytes])).toEqual([bytes.buffer]);
    const image = readImagePayload(bytes, 1);
    expect(image).toEqual({ kind: 'image', ...input });
    expect(Object.isFrozen(image)).toBe(true);
    input.indices[0] = 9;
    image.indices[1] = 9;
    expect([...readImagePayload(bytes, 1).indices]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('round-trips a masked nearest-colour image with bit 7 leftmost and 0 padding bits', () => {
    const input = maskedImage();
    const image = readImagePayload(encodeImagePayload(input), 1);
    expect(image).toEqual({ kind: 'image', ...input });
    expect(Object.isFrozen(image.display)).toBe(true);
    expect([...image.mask!]).toEqual([0b1101_1000, 0b0100_0000, 0, 0, 0b0111_1111, 0b1000_0000]);
    const opacity = MASK_ROWS.map((_, y) => Array.from({ length: 10 }, (_, x) => (isOpaque(image.mask, 10, x, y) ? '1' : '0')).join(''));
    expect(opacity).toEqual(MASK_ROWS);
    expect(isOpaque(null, 10, 3, 1)).toBe(true);
  });

  it('writes 0 for transparent indices and mask padding without changing the input', () => {
    const input = { ...maskedImage(), indices: new Uint8Array(30).fill(9), mask: packMask(MASK_ROWS).map((byte, index) => (index % 2 ? byte | 0x3f : byte)) };
    const image = readImagePayload(encodeImagePayload(input), 1);
    expect(image.mask).toEqual(packMask(MASK_ROWS));
    expect([...image.indices]).toEqual([...MASK_ROWS.join('')].map(bit => (bit === '1' ? 9 : 0)));
    expect(input.indices.every(index => index === 9)).toBe(true);
    expect(input.mask[1] & 0x3f).toBe(0x3f);
  });

  // The 640×480 case compares 300 K indices: 0.5 s alone, 7 s with two full runs at load 52.
  it.each([
    ['1×1 opaque', { width: 1, height: 1, indices: new Uint8Array([7]), mask: null }],
    ['640×480 masked', { width: 640, height: 480, indices: new Uint8Array(640 * 480), mask: new Uint8Array(80 * 480) }],
    ['a nearest target equal to its palette', { display: { nearest: PALETTE } }],
  ])('round-trips %s', { timeout: 30_000 }, (_, overrides) => {
    const input = { ...opaqueImage(), ...overrides };
    expect(readImagePayload(encodeImagePayload(input), 1)).toEqual({ kind: 'image', ...input });
  });

  it('rejects a 65535×65535 header by its fields, before sizing anything from them', () => {
    const header = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0, 0, 1, 0]);
    expectContractError(() => readImagePayload(header, 1), 'invalid-graphics-payload', 'payload.width');
  });

  it.each<[string, (bytes: Uint8Array) => unknown, string, string]>([
    ['schema 2', bytes => readImagePayload(bytes, 2), 'unsupported-payload-schema', 'payload.schemaVersion'],
    ['a truncated header', bytes => readImagePayload(bytes.subarray(0, 7), 1), 'invalid-graphics-payload', 'payload'],
    ['width 0', bytes => readImagePayload(set16(bytes, 0, 0), 1), 'invalid-graphics-payload', 'payload.width'],
    ['width 641', bytes => readImagePayload(set16(bytes, 0, 641), 1), 'invalid-graphics-payload', 'payload.width'],
    ['height 0', bytes => readImagePayload(set16(bytes, 2, 0), 1), 'invalid-graphics-payload', 'payload.height'],
    ['height 481', bytes => readImagePayload(set16(bytes, 2, 481), 1), 'invalid-graphics-payload', 'payload.height'],
    ['an unknown alpha', bytes => readImagePayload(set8(bytes, 4, 2), 1), 'invalid-graphics-payload', 'payload.alpha'],
    ['an unknown display', bytes => readImagePayload(set8(bytes, 5, 2), 1), 'invalid-graphics-payload', 'payload.display'],
    ['an empty palette ID', bytes => readImagePayload(set8(bytes, 6, 0), 1), 'invalid-graphics-payload', 'payload.palette'],
    ['a nearest image without a target', bytes => readImagePayload(set8(bytes, 7, 0), 1), 'invalid-graphics-payload', 'payload.display.nearest'],
    ['a malformed palette ID', bytes => readImagePayload(set8(bytes, idAt, 0x50), 1), 'invalid-graphics-payload', 'payload.palette'],
    ['a non-palette reference', bytes => readImagePayload(setText(bytes, idAt, 'image/synthetic-abc'), 1), 'invalid-graphics-payload', 'payload.palette'],
    ['a malformed target ID', bytes => readImagePayload(set8(bytes, idAt + PALETTE.length, 0x2f), 1), 'invalid-graphics-payload', 'payload.display.nearest'],
    ['truncated pixels', bytes => readImagePayload(bytes.subarray(0, -1), 1), 'invalid-graphics-payload', 'payload'],
    ['a trailing byte', bytes => readImagePayload(Uint8Array.of(...bytes, 0), 1), 'invalid-graphics-payload', 'payload'],
    ['an opaque image with a mask', bytes => readImagePayload(set8(bytes, 4, 0), 1), 'invalid-graphics-payload', 'payload'],
    ['a set padding bit', bytes => readImagePayload(set8(bytes, maskedMaskAt + 5, 0b1000_0001), 1), 'invalid-graphics-payload', 'payload.mask'],
    ['a transparent pixel with a nonzero index', bytes => readImagePayload(set8(bytes, maskedPixelsAt + 2, 1), 1), 'invalid-graphics-payload', 'payload.indices'],
  ])('reader rejects %s', (_, read, code, path) => expectContractError(() => read(encodeImagePayload(maskedImage())), code, path));

  it('reader rejects a target ID on a direct image', () => {
    expectContractError(() => readImagePayload(set8(encodeImagePayload(opaqueImage()), 7, 1), 1), 'invalid-graphics-payload', 'payload.display.nearest');
  });

  it.each([
    ['width 0', { width: 0 }, 'image.width'],
    ['width 641', { width: 641 }, 'image.width'],
    ['a fractional width', { width: 1.5 }, 'image.width'],
    ['height 0', { height: 0 }, 'image.height'],
    ['height 481', { height: 481 }, 'image.height'],
    ['a non-palette reference', { palette: 'image/synthetic' }, 'image.palette'],
    ['a malformed palette ID', { palette: 'Palette/A' }, 'image.palette'],
    ['an unknown display', { display: 'nearest' }, 'image.display'],
    ['a nearest display without a target', { display: {} }, 'image.display.nearest'],
    ['short indices', { indices: new Uint8Array(29) }, 'image.indices'],
    ['plain array indices', { indices: [...maskedImage().indices] }, 'image.indices'],
    ['a short mask', { mask: new Uint8Array(5) }, 'image.mask'],
  ])('encoder rejects %s', (_, overrides, path) => {
    expectContractError(() => encodeImagePayload({ ...maskedImage(), ...overrides } as Omit<ImagePayload, 'kind'>), 'invalid-graphics-payload', path);
  });
});
