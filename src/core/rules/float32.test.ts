import { describe, expect, it } from 'vitest';
import { float32Bits, float32OfDouble, float32OfRational } from './derivation.test-support.ts';
import { FLOAT32_MAX, isFiniteFloat32 } from './float32.ts';

const ulpAtOne = 2 ** -23;

describe('float32 reference (test support)', () => {
  it('rounds hand-checked rationals both ways', () => {
    // 15/11 = 1.36363636…: 2^23 × 15 ÷ 11 = 11439010.909…, so chop keeps 11439010 and nearest takes 11439011.
    expect(float32OfRational(15n, 11n, 'toward-zero')).toBe(11439010 * 2 ** -23);
    expect(float32OfRational(15n, 11n, 'nearest')).toBe(11439011 * 2 ** -23);
    // A tie rounds to the even significand.
    expect(float32OfRational((1n << 24n) + 1n, 1n << 24n, 'nearest')).toBe(1);
    expect(float32OfRational((1n << 24n) + 3n, 1n << 24n, 'nearest')).toBe(1 + 2 * ulpAtOne);
    expect(Object.is(float32OfRational(-1n, 1n << 200n, 'toward-zero'), -0)).toBe(true);
    expect(float32Bits(1)).toBe(0x3f800000);
  });

  it('agrees with Math.fround, the f32 store of Q-11, on a sweep across every binade and both signs', () => {
    // (1 + i × 2^-27) × 2^e steps through quarter-ulp positions, so every crossing of a float32 boundary and every
    // tie is covered, down to the subnormals and the tie at 2^-150.
    const mismatches: number[] = [];
    for (let exponent = -150; exponent <= 127; exponent++) {
      for (let step = 0; step <= 40; step++) {
        const value = (1 + step * 2 ** -27) * 2 ** exponent;
        for (const signed of [value, -value]) {
          if (!Object.is(Math.fround(signed), float32OfDouble(signed, 'nearest'))) mismatches.push(signed);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('float32 values', () => {
  it('names the largest finite float32', () => {
    expect(float32Bits(FLOAT32_MAX)).toBe(0x7f7fffff);
    expect(isFiniteFloat32(FLOAT32_MAX)).toBe(true);
    expect(isFiniteFloat32(-FLOAT32_MAX)).toBe(true);
  });

  it('recognises finite float32 values', () => {
    expect(isFiniteFloat32(-0)).toBe(true);
    expect(isFiniteFloat32(4194303.5)).toBe(true);
    expect(isFiniteFloat32(2 ** -149)).toBe(true);
    expect(isFiniteFloat32(0.1)).toBe(false);
    expect(isFiniteFloat32(Number.NaN)).toBe(false);
    expect(isFiniteFloat32(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
