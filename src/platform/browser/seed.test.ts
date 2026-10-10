import { describe, expect, it } from 'vitest';
import { createSeedSource } from './seed.ts';
import type { RandomValues } from './seed.ts';

class Random implements RandomValues {
  readonly arrays: Uint32Array[] = [];
  values: number[] = [];
  failure: Error | null = null;
  getRandomValues(array: Uint32Array<ArrayBuffer>): Uint32Array {
    this.arrays.push(array);
    if (this.failure) throw this.failure;
    array[0] = this.values.shift()!;
    // A different array than the one passed in, which the source must ignore.
    return new Uint32Array([7]);
  }
}

describe('seed source', () => {
  it('draws nothing until asked, then one uint32 per draw from a fresh array', () => {
    const random = new Random();
    const draw = createSeedSource(random);
    expect(random.arrays).toEqual([]);
    random.values = [0, 0xffff_ffff, 0xffff_ffff];
    expect([draw(), draw(), draw()]).toEqual([0, 4_294_967_295, 4_294_967_295]);
    expect(random.arrays).toHaveLength(3);
    expect(new Set(random.arrays).size).toBe(3);
    expect(random.arrays.every(array => array.length === 1)).toBe(true);
  });

  it('rethrows the host failure unchanged, with no fallback seed', () => {
    const random = new Random();
    const draw = createSeedSource(random);
    random.failure = new Error('no entropy');
    expect(() => draw()).toThrow(random.failure);
    let thrown: unknown;
    try { draw(); } catch (error) { thrown = error; }
    expect(thrown).toBe(random.failure);
    random.failure = null;
    random.values = [42];
    expect(draw()).toBe(42);
  });

  it('accepts a real Web Crypto source', () => {
    const draw = createSeedSource(crypto);
    for (let index = 0; index < 64; index++) {
      const seed = draw();
      expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff).toBe(true);
    }
  });
});
