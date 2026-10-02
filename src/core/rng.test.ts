import { describe, expect, it } from 'vitest';
import { nextRandom } from './rng.ts';

// Independent transcription of the published Mulberry32 reference, kept separate from the module under test.
function referenceMulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawSequence(seed: number, count: number): number[] {
  const values: number[] = [];
  let state = seed;
  for (let i = 0; i < count; i++) {
    const draw = nextRandom(state);
    values.push(draw.value);
    state = draw.state;
  }
  return values;
}

const seeds = [0, 123456789, 4294967295];

describe('nextRandom', () => {
  it('matches fixed known-answer values from the reference algorithm', () => {
    expect(drawSequence(0, 3)).toEqual([0.26642920868471265, 0.0003297457005828619, 0.2232720274478197]);
    expect(drawSequence(123456789, 3)).toEqual([0.2577907438389957, 0.9707721115555614, 0.7853280142880976]);
    expect(drawSequence(4294967295, 3)).toEqual([0.8964226141106337, 0.189478256739676, 0.7156526781618595]);
  });

  it.each(seeds)('matches an independent reference for 1000 draws from seed %i', (seed) => {
    const reference = referenceMulberry32(seed);
    const expected = Array.from({ length: 1000 }, reference);
    expect(drawSequence(seed, 1000)).toEqual(expected);
  });

  it.each(seeds)('keeps a uint32 state and values in [0, 1) for seed %i', (seed) => {
    let state = seed;
    for (let i = 0; i < 1000; i++) {
      const draw = nextRandom(state);
      expect(Number.isInteger(draw.state) && draw.state >= 0 && draw.state <= 0xffffffff).toBe(true);
      expect(draw.value >= 0 && draw.value < 1).toBe(true);
      state = draw.state;
    }
  });

  it('is pure: the same state gives the same draw', () => {
    for (const seed of seeds) {
      expect(nextRandom(seed)).toEqual(nextRandom(seed));
    }
  });
});
