/**
 * Seeded pseudo-random numbers for Core, using the public Mulberry32 algorithm.
 *
 * State: one uint32; the initial state is the seed. Each draw adds 0x6D2B79F5 to the state
 * (mod 2^32), mixes it into a uint32 output, and returns output / 2^32, so 0 <= value < 1.
 * Only integer operations are used. The sequence is reproducible for a given version and
 * runtime; no cross-version or cross-browser bitwise guarantee is made. Not cryptographic.
 */

export type RngState = number;

export interface RandomDraw {
  readonly value: number;
  readonly state: RngState;
}

export function nextRandom(state: RngState): RandomDraw {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}
