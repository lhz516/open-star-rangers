import { describe, expect, it } from 'vitest';
import { nextRandom } from '../determinism/rng.ts';
import { CoreFaultError } from '../errors.ts';
import { expectedRectangle, expectedWorld } from './derivation.test-support.ts';
import { anchorOffset, RAND_MAX, RAND_SCALE, randOfUint32, RandStream, rectangleCoordinate, worldCoordinate } from './original-random.ts';

// Expectations follow the Q-02 derivation (02 完成证据, items 2–4): D = {0, …, 32767}, C = 32769 ÷ 2^30, and every
// f32 result is the exact value rounded toward zero (goal 执行记录, Q-11). Exact values are formed with BigInt.

const RANDS = Array.from({ length: 32768 }, (_, rand) => rand);

function counts(values: Iterable<number>): Map<number, number> {
  const result = new Map<number, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function fault(run: () => unknown): CoreFaultError {
  try {
    run();
  } catch (error) {
    if (error instanceof CoreFaultError) return error;
    throw error;
  }
  throw new Error('expected a CoreFaultError');
}

describe('rand() domain from the world RNG', () => {
  it('gives every value of D exactly 2^17 consecutive uint32 preimages', () => {
    expect(RAND_MAX).toBe(32767);
    // The interval [k × 2^17, (k + 1) × 2^17 − 1] maps to k at both ends, and the value before it to k − 1.
    expect(RANDS.map(rand => randOfUint32(rand * 2 ** 17))).toEqual(RANDS);
    expect(RANDS.map(rand => randOfUint32((rand + 1) * 2 ** 17 - 1))).toEqual(RANDS);
    expect(RANDS.slice(1).map(rand => randOfUint32(rand * 2 ** 17 - 1))).toEqual(RANDS.slice(0, -1));
    expect(randOfUint32(0)).toBe(0);
    expect(randOfUint32(0xffffffff)).toBe(RAND_MAX);
  });

  it.each([-1, 2 ** 32, 0.5, Number.NaN])('rejects the non-uint32 %d as an invariant violation', (value) => {
    expect(fault(() => randOfUint32(value)).site).toBe('original-random.uint32');
  });

  it.each([0, 1, 0x12345678, 0xffffffff])('takes one world RNG step per value from seed %i', (seed) => {
    const stream = new RandStream(seed);
    expect(stream.state).toBe(seed);
    let state = seed;
    for (let index = 0; index < 64; index++) {
      const draw = nextRandom(state);
      state = draw.state;
      expect(stream.next()).toBe(randOfUint32(draw.value * 2 ** 32));
      expect(stream.state).toBe(state);
    }
  });
});

describe('rectangle placement 0x6883c', () => {
  it.each([
    ['a span around the origin', -5625, 5625],
    ['an upper end of 0', -15000, 0],
    ['a negative upper end', -1000, -200],
    ['reversed ends', 100, -100],
    ['a small span far from the origin', 4_000_000, 4_000_001],
    ['reversed ends reaching the edge of the coordinate range', 2 ** 21, 1],
    ['a zero span', 7, 7],
  ])('maps every rand value to the exact value rounded toward zero: %s', (_, from, to) => {
    expect(RANDS.map(rand => rectangleCoordinate(from, to, rand))).toEqual(RANDS.map(rand => expectedRectangle(from, to, rand)));
  });

  it('attains the lower end exactly and stops below the upper end', () => {
    expect(rectangleCoordinate(-5625, 5625, 0)).toBe(-5625);
    // 5625 − 11250 × 2^-30 is less than one spacing (2^-11) below 5625: chop gives the float32 before it.
    expect(rectangleCoordinate(-5625, 5625, RAND_MAX)).toBe(5625 - 2 ** -11);
    // Upper end 0: the deficit 15000 × 2^-30 is exactly representable, so the result is that tiny negative value.
    const nearZero = rectangleCoordinate(-15000, 0, RAND_MAX);
    expect(nearZero).toBe(-15000 * 2 ** -30);
    expect(nearZero).toBeLessThan(0);
    // A negative upper end: chopping the value just beyond it gives the end itself.
    expect(rectangleCoordinate(-1000, -200, RAND_MAX)).toBe(-200);
    // The span runs from x0 upwards whatever the order: 100 to 300 here.
    expect(rectangleCoordinate(100, -100, 0)).toBe(100);
    expect(rectangleCoordinate(100, -100, RAND_MAX)).toBe(300 - 2 ** -15);
  });

  it('gives one preimage per result when the step exceeds the float32 spacing', () => {
    // Consecutive exact values differ by 11250 × 32769 × 2^-30 ≈ 0.34, far above the spacing 2^-11 below 8192.
    const results = RANDS.map(rand => rectangleCoordinate(-5625, 5625, rand));
    expect(new Set(results).size).toBe(32768);
    expect(results.every((result, rand) => rand === 0 || result > results[rand - 1])).toBe(true);
  });

  it('shares results among several rand values for a small span far from the origin', () => {
    // Spacing 0.25 at 4,000,000: x0 + k/4 takes r with r × 32769 in [k × 2^28, (k + 1) × 2^28), 8192 values each:
    // 2^28 ÷ 32769 = 8191.75…, 2 × 2^28 ÷ 32769 = 16383.5…, 3 × 2^28 ÷ 32769 = 24575.25….
    const results = RANDS.map(rand => rectangleCoordinate(4_000_000, 4_000_001, rand));
    expect([...counts(results)]).toEqual([[4_000_000, 8192], [4_000_000.25, 8192], [4_000_000.5, 8192], [4_000_000.75, 8192]]);
    expect([results[8191], results[8192], results[16383], results[16384], results[24575], results[24576]]).toEqual([
      4_000_000, 4_000_000.25, 4_000_000.25, 4_000_000.5, 4_000_000.5, 4_000_000.75,
    ]);
    expect(new Set(RANDS.map(rand => rectangleCoordinate(7, 7, rand)))).toEqual(new Set([7]));
  });

  it('rejects a value outside D as an invariant violation', () => {
    for (const rand of [-1, 32768, 1.5]) expect(fault(() => rectangleCoordinate(0, 10, rand)).site).toBe('original-random.rand');
    expect(RAND_SCALE).toBe(Math.fround(1 / 32767));
  });
});

describe('whole-world default placement 0x68c98', () => {
  it.each([1, 3, 6, 14, 559])('maps every rand value one to one in a world of %i sectors', (sectors) => {
    const results = RANDS.map(rand => worldCoordinate(15000 * sectors, rand));
    expect(results).toEqual(RANDS.map(rand => expectedWorld(sectors, rand)));
    // The step W × 32769 × 2^-30 ≥ 0.45 exceeds the spacing below h, so the results are distinct and increasing.
    expect(new Set(results).size).toBe(32768);
    expect(results[0]).toBe(-7500 * sectors);
  });

  it('stops one float32 below h', () => {
    // h − W × 2^-30 is less than one spacing below h: 2^-8 below 45,000, 2^-7 below 105,000, 0.25 below 4,192,500.
    expect(worldCoordinate(90000, RAND_MAX)).toBe(45000 - 2 ** -8);
    expect(worldCoordinate(210_000, RAND_MAX)).toBe(105000 - 2 ** -7);
    expect(worldCoordinate(8_385_000, RAND_MAX)).toBe(4_192_500 - 0.25);
  });
});

describe('anchor offset 0x68708', () => {
  it('takes the sign from the parity of the first draw: 16,384 preimages each', () => {
    const offsets = counts(RANDS.map(rand => anchorOffset(rand, 0)));
    expect([...offsets].sort(([a], [b]) => a - b)).toEqual([[-400, 16384], [400, 16384]]);
    expect(anchorOffset(0, 0)).toBe(400);
    expect(anchorOffset(1, 0)).toBe(-400);
    expect(anchorOffset(RAND_MAX, 0)).toBe(-400);
  });

  it('takes the size 400 + (r mod 200) from the second draw: 164 preimages for 400–567, 163 for 568–599', () => {
    const sizes = counts(RANDS.map(rand => anchorOffset(0, rand)));
    const expected = new Map<number, number>();
    for (let size = 400; size <= 599; size++) expected.set(size, size <= 567 ? 164 : 163);
    expect(new Map([...sizes].sort(([a], [b]) => a - b))).toEqual(expected);
    expect(anchorOffset(0, 199)).toBe(599);
    expect(anchorOffset(0, 200)).toBe(400);
    expect(anchorOffset(0, RAND_MAX)).toBe(567);
  });

  it('combines sign and size independently, so an offset o has 16,384 × count(|o|) preimage pairs and is never 0', () => {
    const positive = RANDS.map(size => anchorOffset(0, size));
    for (const sign of [0, 1, 2, 3, 32766, RAND_MAX]) {
      expect(RANDS.map(size => anchorOffset(sign, size))).toEqual(positive.map(offset => (sign % 2 === 0 ? offset : -offset)));
    }
  });

  it('rejects draws outside D', () => {
    expect(fault(() => anchorOffset(32768, 0)).site).toBe('original-random.rand');
    expect(fault(() => anchorOffset(0, -1)).site).toBe('original-random.rand');
  });
});
