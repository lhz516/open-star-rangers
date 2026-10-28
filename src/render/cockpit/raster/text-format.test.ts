import { describe, expect, it } from 'vitest';
import { TextFormatError, formatText, textFormatConversions, type TextFormatErrorCode } from './text-format.ts';

// Synthetic format strings only; none is an original text.

function errorOf(action: () => unknown): TextFormatError {
  try {
    action();
  } catch (error) {
    if (error instanceof TextFormatError) return error;
    throw error;
  }
  throw new Error('expected a TextFormatError');
}

const expectError = (action: () => unknown, code: TextFormatErrorCode, path: string): void => {
  expect(errorOf(action)).toMatchObject({ code, path });
};

describe('%.0f', () => {
  it('rounds half to even, not half up or half away from zero', () => {
    const fixed = (value: number): string => formatText('%.0f', [value], 32);
    expect([0.5, 1.5, 2.5, 3.5, 4.5].map(fixed)).toEqual(['0', '2', '2', '4', '4']);
    // Negative control: Math.round and toFixed give 1, 3 and 3 for 0.5, 2.5 and 2.5 + 0.
    expect(fixed(0.5)).not.toBe(String(Math.round(0.5)));
    expect(fixed(2.5)).not.toBe((2.5).toFixed(0));
    expect([0.49999999999999994, 0.5000000000000001, 1234.4999, 99999.5, 2 ** 52 + 1].map(fixed))
      .toEqual(['0', '1', '1234', '100000', '4503599627370497']);
  });

  it('prints the sign of negatives, including those that round to 0', () => {
    const fixed = (value: number): string => formatText('%.0f', [value], 32);
    expect([-2.5, -3.5, -0.4, -0.5, -0, 0, -1234.6].map(fixed)).toEqual(['-2', '-4', '-0', '-0', '-0', '0', '-1235']);
  });

  it('formats up to 16 digits and rejects larger or non-finite values', () => {
    expect(formatText('%.0f', [9_999_999_999_999_998], 32)).toBe('9999999999999998');
    expectError(() => formatText('%.0f', [1e16], 32), 'argument-range', 'format.args[0]');
    expectError(() => formatText('%.0f', [-1e16], 32), 'argument-range', 'format.args[0]');
    expectError(() => formatText('%.0f', [Number.NaN], 32), 'argument-range', 'format.args[0]');
    expectError(() => formatText('%.0f', [Infinity], 32), 'argument-range', 'format.args[0]');
    expectError(() => formatText('%.0f', ['1'], 32), 'argument-type', 'format.args[0]');
  });
});

describe('%d, %s and %%', () => {
  it('prints i32 decimals with a leading minus and rejects anything else', () => {
    expect(formatText('%d|%d|%d|%d', [-12, 0, -2_147_483_648, 2_147_483_647], 64)).toBe('-12|0|-2147483648|2147483647');
    expectError(() => formatText('%d', [2_147_483_648], 32), 'argument-range', 'format.args[0]');
    expectError(() => formatText('%d', [-2_147_483_649], 32), 'argument-range', 'format.args[0]');
    expectError(() => formatText('%d', [1.5], 32), 'argument-range', 'format.args[0]');
    expectError(() => formatText('%d', ['7'], 32), 'argument-type', 'format.args[0]');
  });

  it('copies %s bytes and ordinary bytes as they are and turns %% into one %', () => {
    expect(formatText('V%d%%', [42], 32)).toBe('V42%');
    expect(formatText('%%%s%%', ['x\u00ff\u0001'], 32)).toBe('%x\u00ff\u0001%');
    expect(formatText('%s\n%s', ['ab', 'cd'], 32)).toBe('ab\ncd');
    expect(formatText('', [], 0)).toBe('');
    expectError(() => formatText('%s', [7], 32), 'argument-type', 'format.args[0]');
    expectError(() => formatText('%s', ['a\u0100'], 32), 'invalid-byte', 'format.args[0]');
    expectError(() => formatText('%s', ['a\u0000'], 32), 'invalid-byte', 'format.args[0]');
    expectError(() => formatText('a\u0100', [], 32), 'invalid-byte', 'format');
  });
});

describe('closed conversions and bounds', () => {
  it('rejects every other conversion, width or precision at its byte position', () => {
    for (const [format, index] of [['%x', 0], ['ab%5d', 2], ['%15s', 0], ['%.1f', 0], ['%f', 0], ['%i', 0], ['%c', 0], ['x%', 1], ['%d%', 2]] as const) {
      expectError(() => formatText(format, [1], 32), 'unknown-conversion', `format[${index}]`);
      expectError(() => textFormatConversions(format, 'diag'), 'unknown-conversion', `diag[${index}]`);
    }
  });

  it('lists conversions in order and requires exactly one argument per non-%% conversion', () => {
    expect(textFormatConversions('a%d%%b%s%.0f%%')).toEqual(['%d', '%%', '%s', '%.0f', '%%']);
    expect(textFormatConversions('plain')).toEqual([]);
    expectError(() => formatText('%d%%', [], 32), 'argument-count', 'format.args');
    expectError(() => formatText('%d%%', [1, 2], 32), 'argument-count', 'format.args');
    expectError(() => formatText('%%', ['x'], 32), 'argument-count', 'format.args');
  });

  it('accepts a result of exactly maxBytes and rejects one byte more', () => {
    const args = Object.freeze([-2_147_483_648, 'n'.repeat(67)]);
    const format = '%d%s%%';
    expect(formatText(format, args, 79)).toHaveLength(79);
    expectError(() => formatText(format, args, 78), 'result-too-long', 'format');
    expect(args).toEqual([-2_147_483_648, 'n'.repeat(67)]);
    expect(() => formatText(format, args, -1)).toThrow(RangeError);
  });
});
