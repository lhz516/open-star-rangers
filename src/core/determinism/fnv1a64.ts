/**
 * FNV-1a 64-bit hash of an ASCII string (offset basis 0xcbf29ce484222325, prime 0x100000001b3),
 * used only for state-consistency checks; not cryptographic. Contract: docs/plan/p1/03/spec.md.
 */
import { CoreInputError } from '../errors.ts';

const ASCII_MAX = 0x7f;
const UINT32_RANGE = 0x1_0000_0000;
// The prime is 2^40 + 0x1b3, so a multiply is `hash * 0x1b3 + (hash << 40)` on two uint32 halves.
const PRIME_LOW = 0x1b3;

/** Returns the hash as 16 lowercase hex digits, keeping leading zeros. Throws CoreInputError on non-ASCII text. */
export function fnv1a64(text: string): string {
  let high = 0xcbf29ce4;
  let low = 0x84222325;
  for (let index = 0; index < text.length; index++) {
    const byte = text.charCodeAt(index);
    if (byte > ASCII_MAX) throw new CoreInputError(`text[${index}]`, 'must be an ASCII character');
    low ^= byte;
    // low * 0x1b3 < 2^41, so the product and its carry are exact in a double.
    const lowProduct = (low >>> 0) * PRIME_LOW;
    high = (Math.imul(high, PRIME_LOW) + Math.floor(lowProduct / UINT32_RANGE) + (low << 8)) >>> 0;
    low = lowProduct >>> 0;
  }
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}
