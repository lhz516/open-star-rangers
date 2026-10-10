import type { SeedSource } from '../../app/mission/mission-ports.ts';

/** The random source a seed is drawn from; the browser passes `crypto`. */
export interface RandomValues {
  getRandomValues(array: Uint32Array<ArrayBuffer>): unknown;
}

/**
 * Draws each seed from the host's random source into a fresh one-element Uint32Array, so the value is always a uint32.
 * A host exception propagates unchanged: there is no fallback to a fixed seed or to host time.
 */
export function createSeedSource(random: RandomValues): SeedSource {
  return () => {
    const value = new Uint32Array(1);
    random.getRandomValues(value);
    return value[0]!;
  };
}
