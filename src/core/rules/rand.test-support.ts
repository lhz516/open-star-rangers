import { nextRandom, type RngState } from '../determinism/rng.ts';
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

/** The RNG state after `count` draws from `state`. */
export function rngStateAfter(state: RngState, count: number): RngState {
  let current = state;
  for (let index = 0; index < count; index++) current = nextRandom(current).state;
  return current;
}

/** The next `count` rand values (0–32767) a world would draw from `state`: the top 15 bits of each RNG output. */
export function randValues(state: RngState, count: number): number[] {
  const values: number[] = [];
  let current = state;
  for (let index = 0; index < count; index++) {
    const draw = nextRandom(current);
    current = draw.state;
    values.push(Math.floor((draw.value * 2 ** 32) / 2 ** 17));
  }
  return values;
}
