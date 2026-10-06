import { describe, expect, it } from 'vitest';
import { payloadTransferList } from '../ownership.ts';
import { encodePalettePayload, readPalettePayload } from './palette-payload.ts';
import { expectContractError } from './graphics.test-support.ts';

const rgb = (count: number) => Uint8Array.from({ length: count * 3 }, (_, index) => (index * 7 + 3) & 0xff);

/** A valid encoded palette with `patch` applied to a copy of its bytes. */
function patched(patch: (bytes: Uint8Array, view: DataView) => void, entries = rgb(4)): Uint8Array {
  const bytes = encodePalettePayload({ entries });
  patch(bytes, new DataView(bytes.buffer));
  return bytes;
}

describe('palette payload schema 1', () => {
  it('lays out a little-endian entry count followed by RGB triples', () => {
    expect([...encodePalettePayload({ entries: new Uint8Array([1, 2, 3, 4, 5, 6]) })]).toEqual([2, 0, 1, 2, 3, 4, 5, 6]);
  });

  it.each([1, 256])('round-trips %i entries into frozen data with an exclusive copy', count => {
    const entries = rgb(count);
    const bytes = encodePalettePayload({ entries });
    expect(payloadTransferList([bytes])).toEqual([bytes.buffer]);
    const palette = readPalettePayload(bytes, 1);
    expect(palette).toEqual({ kind: 'palette', entries });
    expect(Object.isFrozen(palette)).toBe(true);
    expect(palette.entries.buffer).not.toBe(bytes.buffer);
    entries[0] ^= 0xff;
    palette.entries[1] ^= 0xff;
    expect(readPalettePayload(bytes, 1).entries).toEqual(rgb(count));
  });

  it('reads a payload view at a nonzero offset', () => {
    const bytes = encodePalettePayload({ entries: rgb(2) });
    const framed = new Uint8Array(bytes.length + 2);
    framed.set(bytes, 1);
    expect(readPalettePayload(framed.subarray(1, -1), 1).entries).toEqual(rgb(2));
  });

  it.each([
    ['schema 2', () => readPalettePayload(encodePalettePayload({ entries: rgb(1) }), 2), 'unsupported-payload-schema', 'payload.schemaVersion'],
    ['schema 0', () => readPalettePayload(encodePalettePayload({ entries: rgb(1) }), 0), 'unsupported-payload-schema', 'payload.schemaVersion'],
    ['a non-byte value', () => readPalettePayload([2, 0], 1), 'invalid-graphics-payload', 'payload'],
    ['a truncated header', () => readPalettePayload(new Uint8Array([1]), 1), 'invalid-graphics-payload', 'payload'],
    ['zero entries', () => readPalettePayload(new Uint8Array([0, 0]), 1), 'invalid-graphics-payload', 'payload.entryCount'],
    ['257 entries', () => readPalettePayload(patched((_, view) => view.setUint16(0, 257, true)), 1), 'invalid-graphics-payload', 'payload.entryCount'],
    ['truncated entries', () => readPalettePayload(encodePalettePayload({ entries: rgb(4) }).subarray(0, -1), 1), 'invalid-graphics-payload', 'payload'],
    ['a trailing byte', () => readPalettePayload(patched((_, view) => view.setUint16(0, 3, true)), 1), 'invalid-graphics-payload', 'payload'],
  ])('reader rejects %s', (_, action, code, path) => expectContractError(action, code, path));

  it('reader rejects a transferred payload', () => {
    const bytes = encodePalettePayload({ entries: rgb(1) });
    structuredClone(bytes, { transfer: [bytes.buffer] });
    expectContractError(() => readPalettePayload(bytes, 1), 'payload-detached', 'payload');
  });

  it.each([
    ['no entries', new Uint8Array(0)],
    ['257 entries', rgb(257)],
    ['a partial triple', new Uint8Array(4)],
    ['a plain array', [1, 2, 3]],
  ])('encoder rejects %s', (_, entries) => {
    expectContractError(() => encodePalettePayload({ entries: entries as Uint8Array }), 'invalid-graphics-payload', 'palette.entries');
  });
});
