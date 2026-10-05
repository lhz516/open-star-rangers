import { expect } from 'vitest';

/** Asserts that `action` throws a contract error with exactly this code and path. */
export const expectContractError = (action: () => unknown, code: string, path: string): void => {
  expect(action).toThrowError(expect.objectContaining({ code, path }));
};

/** Sets one byte of `bytes` and returns it, for patching encoded payloads inline. */
export function set8(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  bytes[offset] = value;
  return bytes;
}
