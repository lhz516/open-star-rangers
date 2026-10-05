import { fail } from './contract-validation.ts';

// Binary payload ownership (S-10). TypedArrays cannot be frozen, so a payload view is never shared between consumers:
// each consumer gets an exclusive copy, or the sender transfers the whole buffer, which detaches the sender's views.

/** Whether a transfer detached `buffer`. ES2023 has no `ArrayBuffer#detached`, but a view over a detached buffer throws. */
export function isDetached(buffer: ArrayBufferLike): boolean {
  try {
    new Uint8Array(buffer, 0, 0);
    return false;
  } catch (error) {
    if (error instanceof TypeError) return true;
    throw error;
  }
}

/** Copies bytes into a new ArrayBuffer of exactly their length, unaliased with the source or any other view. */
export function exclusiveBytes(bytes: Uint8Array, path = 'bytes'): Uint8Array {
  if (isDetached(bytes.buffer)) fail('payload-detached', path, 'was transferred away and can no longer be used');
  // Not `bytes.slice()`: Node's Buffer#slice returns a view of the same memory.
  return new Uint8Array(bytes);
}

/**
 * Returns the ArrayBuffers to transfer with payload views. Each view must cover its whole non-shared, not yet transferred
 * ArrayBuffer and no two views may share one, so the transfer moves every payload and never detaches bytes another
 * consumer still reads.
 */
export function payloadTransferList(views: readonly Uint8Array[], path = 'payloads'): readonly ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  return Object.freeze(views.map((view, index) => {
    const { buffer } = view;
    const at = `${path}[${index}]`;
    if (isDetached(buffer)) fail('payload-detached', at, 'was already transferred');
    if (!(buffer instanceof ArrayBuffer) || view.byteOffset !== 0 || view.byteLength !== buffer.byteLength) {
      fail('payload-not-exclusive', at, 'must own its whole non-shared ArrayBuffer; transfer an exclusive copy');
    }
    if (seen.has(buffer)) fail('payload-aliased', at, 'shares an ArrayBuffer with another payload');
    seen.add(buffer);
    return buffer;
  }));
}
