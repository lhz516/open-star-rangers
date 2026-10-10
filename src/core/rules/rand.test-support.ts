import type { RandSource } from './original-random.ts';

/** A rand source for rules tests that replays `values` (0–32767) and fails on any draw beyond them. */
export function scriptedRand(values: readonly number[]): RandSource & { readonly used: number } {
  let used = 0;
  return {
    next() {
      if (used >= values.length) throw new Error('drew more rand values than scripted');
      return values[used++];
    },
    get used() {
      return used;
    },
  };
}
