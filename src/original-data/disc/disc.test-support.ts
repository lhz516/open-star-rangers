// Shared helpers for disc reader tests. Pure like the layer itself; assertions stay in the test files.

import { DiscReadError, type DiscReadErrorData } from './disc-error.ts';

/** Planted in host names, host error text and unknown descriptor names; no diagnostic may contain it. */
export const MARKER = 'PRIVATE-MARKER-7f3a';

export type Diagnostic = Omit<DiscReadErrorData, 'reason'>;

export const failureOf = (code: Diagnostic['code'], location: string, limit: Diagnostic['limit'] = null): Diagnostic => ({ code, location, limit });

/** Primitives and plain objects of them only, which structured cloning always copies faithfully. */
function isPlainData(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && isPlainData((value as Record<string, unknown>)[key]));
}

export async function rejection(action: () => unknown): Promise<DiscReadError> {
  try {
    await action();
  } catch (error) {
    if (error instanceof DiscReadError) return error;
    throw error;
  }
  throw new Error('expected a DiscReadError');
}

/**
 * Awaits a failure and returns its diagnostic without the fixed reason text, after checking the DTO is frozen plain data
 * (so it survives structured cloning), and that neither it, the message nor the error's own values carry the marker, bytes or a host error.
 */
export async function failure(action: () => unknown): Promise<Diagnostic> {
  const error = await rejection(action);
  const data = error.toData();
  if (!Object.isFrozen(data) || `${JSON.stringify(data)} ${error.message}`.includes(MARKER)
    || Object.values(error).some(value => value instanceof Uint8Array || value instanceof Error)) {
    throw new Error('the diagnostic leaks private input or is mutable');
  }
  if (!isPlainData(data)) throw new Error('the diagnostic is not structured-cloneable plain data');
  return { code: data.code, location: data.location, limit: data.limit };
}
