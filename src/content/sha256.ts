import type { PayloadFingerprint } from './content-identity.ts';
import { isDetached } from './ownership.ts';

// FIPS 180-4 SHA-256, synchronous and dependency-free for pure modules.
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const INITIAL_HASH = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
const BLOCK_BYTES = 64;

/** Folds the 64-byte block at `offset` of `view` into `hash`, using `words` as the message schedule. */
function compress(hash: Uint32Array, words: Uint32Array, view: DataView, offset: number): void {
  for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4);
  for (let index = 16; index < 64; index++) {
    const low = words[index - 15], high = words[index - 2];
    const s0 = rotate(low, 7) ^ rotate(low, 18) ^ (low >>> 3);
    const s1 = rotate(high, 17) ^ rotate(high, 19) ^ (high >>> 10);
    words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
  }
  let a = hash[0], b = hash[1], c = hash[2], d = hash[3], e = hash[4], f = hash[5], g = hash[6], h = hash[7];
  for (let index = 0; index < 64; index++) {
    const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + ROUND_CONSTANTS[index] + words[index]) >>> 0;
    const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  hash[0] += a; hash[1] += b; hash[2] += c; hash[3] += d; hash[4] += e; hash[5] += f; hash[6] += g; hash[7] += h;
}

/**
 * Incremental SHA-256: `update` accepts any number of segments of any length up to a safe-integer total, keeping only
 * the unfinished tail block and never retaining, copying or modifying the caller's bytes. `digestHex` finishes the hash;
 * later updates throw and later digests return the same value.
 */
export class Sha256 {
  readonly #hash = new Uint32Array(INITIAL_HASH);
  readonly #words = new Uint32Array(64);
  readonly #tail = new Uint8Array(BLOCK_BYTES * 2);
  readonly #tailView = new DataView(this.#tail.buffer);
  /** Total input length; the unfinished tail holds its last `#byteLength % BLOCK_BYTES` bytes. */
  #byteLength = 0;
  #digest: string | undefined;

  update(bytes: Uint8Array): this {
    if (this.#digest !== undefined) throw new Error('SHA-256 input after the digest was produced');
    if (isDetached(bytes.buffer)) throw new Error('SHA-256 input was transferred away');
    if (bytes.length > Number.MAX_SAFE_INTEGER - this.#byteLength) throw new Error('SHA-256 input beyond the safe integer length');
    let tailLength = this.#byteLength % BLOCK_BYTES;
    let offset = 0;
    if (tailLength > 0) {
      offset = Math.min(BLOCK_BYTES - tailLength, bytes.length);
      this.#tail.set(bytes.subarray(0, offset), tailLength);
      tailLength += offset;
      if (tailLength === BLOCK_BYTES) {
        compress(this.#hash, this.#words, this.#tailView, 0);
        // Only the unfinished tail is ever retained.
        this.#tail.fill(0, 0, BLOCK_BYTES);
        tailLength = 0;
      }
    }
    const whole = offset + Math.floor((bytes.length - offset) / BLOCK_BYTES) * BLOCK_BYTES;
    if (whole > offset) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let at = offset; at < whole; at += BLOCK_BYTES) compress(this.#hash, this.#words, view, at);
    }
    this.#tail.set(bytes.subarray(whole), tailLength);
    this.#byteLength += bytes.length;
    return this;
  }

  /** The 64 lowercase hexadecimal digits of the digest. */
  digestHex(): string {
    if (this.#digest !== undefined) return this.#digest;
    // The tail, its 0x80 marker and the 64-bit bit length fill one or two final blocks.
    const remaining = this.#byteLength % BLOCK_BYTES;
    const end = remaining < 56 ? BLOCK_BYTES : BLOCK_BYTES * 2;
    this.#tail.fill(0, remaining, end);
    this.#tail[remaining] = 0x80;
    this.#tailView.setUint32(end - 8, Math.floor(this.#byteLength / 0x20000000));
    this.#tailView.setUint32(end - 4, (this.#byteLength * 8) >>> 0);
    for (let at = 0; at < end; at += BLOCK_BYTES) compress(this.#hash, this.#words, this.#tailView, at);
    this.#tail.fill(0);
    this.#digest = Array.from(this.#hash, value => value.toString(16).padStart(8, '0')).join('');
    return this.#digest;
  }
}

/** Returns the `sha256:` payload fingerprint of `bytes` without retaining, copying or modifying them. */
export function sha256Fingerprint(bytes: Uint8Array): PayloadFingerprint {
  return `sha256:${new Sha256().update(bytes).digestHex()}` as PayloadFingerprint;
}
