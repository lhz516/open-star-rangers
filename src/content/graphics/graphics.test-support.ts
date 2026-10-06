import { expect } from 'vitest';
import { maskStride } from './image-payload.ts';

/** Asserts that `action` throws a contract error with exactly this code and path whose message contains none of `secrets`. */
export function expectContractError(action: () => unknown, code: string, path: string, secrets: readonly string[] = []): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toEqual(expect.objectContaining({ code, path }));
  for (const secret of secrets) expect((thrown as Error).message).not.toContain(secret);
}

/** Sets one byte of `bytes` and returns it, for patching encoded payloads inline. */
export function set8(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  bytes[offset] = value;
  return bytes;
}

/** Sets a little-endian u16 of `bytes` and returns it. */
export function set16(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  new DataView(bytes.buffer, bytes.byteOffset).setUint16(offset, value, true);
  return bytes;
}

/** Sets a little-endian u32 of `bytes` and returns it. */
export function set32(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(offset, value, true);
  return bytes;
}

/** Overwrites `bytes` with ASCII `text` at `offset` and returns it. */
export function setText(bytes: Uint8Array, offset: number, text: string): Uint8Array {
  bytes.set(Uint8Array.from(text, character => character.charCodeAt(0)), offset);
  return bytes;
}

/** Packs per-pixel opacity rows ('1' opaque) into an image mask with bit 7 leftmost and 0 padding bits. */
export function packMask(rows: readonly string[]): Uint8Array {
  const width = rows[0].length;
  const mask = new Uint8Array(maskStride(width) * rows.length);
  rows.forEach((row, y) => [...row].forEach((bit, x) => {
    if (bit === '1') mask[y * maskStride(width) + (x >> 3)] |= 0x80 >> (x & 7);
  }));
  return mask;
}
