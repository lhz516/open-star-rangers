import { expect } from 'vitest';

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
