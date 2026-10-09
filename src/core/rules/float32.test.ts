import { describe, expect, it } from 'vitest';
import { float32Bits, float32OfDouble, float32OfRational } from './derivation.test-support.ts';
import { FLOAT32_MAX, isFiniteFloat32, toFloat32TowardZero } from './float32.ts';

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
});

describe('toFloat32TowardZero (Q-11: every f32 store chops)', () => {
  it('keeps float32 values, including signed zeros, the extremes and subnormals', () => {
    for (const value of [0, 1, -1, 1.5, 0.1875, 45000, -44999.99609375, FLOAT32_MAX, -FLOAT32_MAX, 2 ** -126, 2 ** -149, -(2 ** -149)]) {
      expect(toFloat32TowardZero(value)).toBe(value);
    }
    expect(Object.is(toFloat32TowardZero(-0), -0)).toBe(true);
    expect(Object.is(toFloat32TowardZero(0), 0)).toBe(true);
  });

  it('rounds toward zero at the half-ulp boundaries where round-to-nearest goes up', () => {
    // Just below, at and above half an ulp past 1: chop always gives 1.
    for (const excess of [ulpAtOne / 2 - 2 ** -52, ulpAtOne / 2, ulpAtOne / 2 + 2 ** -52, ulpAtOne - 2 ** -52]) {
      expect(toFloat32TowardZero(1 + excess)).toBe(1);
      expect(toFloat32TowardZero(-1 - excess)).toBe(-1);
    }
    expect(Math.fround(1 + 0.75 * ulpAtOne)).toBe(1 + ulpAtOne);
    expect(toFloat32TowardZero(1 + 0.75 * ulpAtOne)).toBe(1);
    // Below a power of two the spacing halves: 2 − 2^-30 chops to the float32 before 2.
    expect(toFloat32TowardZero(2 - 2 ** -30)).toBe(2 - ulpAtOne);
    expect(toFloat32TowardZero(-(2 - 2 ** -30))).toBe(-(2 - ulpAtOne));
  });

  it('chops overflow to the largest finite float32 and underflow to a zero of the same sign', () => {
    expect(toFloat32TowardZero(3.5e38)).toBe(FLOAT32_MAX);
    expect(toFloat32TowardZero(-3.5e38)).toBe(-FLOAT32_MAX);
    expect(toFloat32TowardZero(1.5 * 2 ** -149)).toBe(2 ** -149);
    expect(Object.is(toFloat32TowardZero(0.75 * 2 ** -149), 0)).toBe(true);
    expect(Object.is(toFloat32TowardZero(-0.75 * 2 ** -149), -0)).toBe(true);
  });

  it('matches the BigInt reference on a sweep across every binade and both signs', () => {
    // (1 + i × 2^-27) × 2^e steps through quarter-ulp positions, so every crossing of a float32 boundary is covered.
    const mismatches: number[] = [];
    for (let exponent = -150; exponent <= 127; exponent++) {
      for (let step = 0; step <= 40; step++) {
        const value = (1 + step * 2 ** -27) * 2 ** exponent;
        for (const signed of [value, -value]) {
          if (!Object.is(toFloat32TowardZero(signed), float32OfDouble(signed, 'toward-zero'))) mismatches.push(signed);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('recognises finite float32 values', () => {
    expect(isFiniteFloat32(-0)).toBe(true);
    expect(isFiniteFloat32(4194303.5)).toBe(true);
    expect(isFiniteFloat32(0.1)).toBe(false);
    expect(isFiniteFloat32(Number.NaN)).toBe(false);
    expect(isFiniteFloat32(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
