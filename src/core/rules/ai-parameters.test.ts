import { describe, expect, it } from 'vitest';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { keyword } from '../../content/rule-data/rule-data.test-support.ts';
import type { KeywordTables } from '../../content/rule-data/ai-programs.ts';
import { CoreInputError } from '../errors.ts';
import { thrownBy } from '../world/world.test-support.ts';
import {
  degreeSlot, planArgument, SUPPORTED_OPCODES, type ArgumentPlan,
} from './ai-parameters.ts';

// Creation-time argument checks and parse plans (docs/plan/p3/02/spec.md, CR-15, CR-26; ai.md §5.3). Expectations
// follow the parser's description in ai.md §5.3 and CR-15's reasons, written out case by case; synthetic text only.

const ITEM = 'input.aiPrograms.content.entries[2].items[4]';

/** Keyword tables in address order: 231 reads the first, 300 the second, 301 the third, 403 the fourth. */
const TABLES: KeywordTables = [
  [keyword('Alpha', 7), keyword('beta', -1), keyword('G\xc4', 0x7fffffff)],
  [keyword('Near', 1), keyword('far', 2)],
  [keyword('small', 0), keyword('LARGE', 5)],
  [keyword('alpha', 99)],
];

const plan = (opcode: number, argument: string | null): ArgumentPlan => planArgument(opcode, argument, TABLES, ITEM);
const value = (number: number) => ({ type: 'value', value: number });
const range = (lo: number, hi: number, signed = false) => ({ type: 'range', lo, hi, signed });
const integer = (number: number) => ({ type: 'integer', term: value(number) });
const float = (number: number, degrees = false) => ({ type: 'float', term: value(number), degrees });

/** Asserts that `argument` of `opcode` is rejected with `reason` at the argument's path (the opcode's for an unsupported one), without repeating the text. */
function expectRejected(opcode: number, argument: string | null, reason: string): void {
  const PATH = `${ITEM}.${reason === 'unsupported-opcode' ? 'opcode' : 'argument'}`;
  const error = thrownBy(() => plan(opcode, argument));
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject({ path: PATH, reason });
  expect((error as Error).message).toBe(`${PATH} ${reason}`);
}

describe('supported opcodes (CR-15; ai.md §5, §10.2)', () => {
  it('are the 25 opcodes of the slice, each with its parser class', () => {
    expect([...SUPPORTED_OPCODES.keys()].sort((a, b) => a - b)).toEqual([
      100, 104, 106, 107, 111, 200, 210, 211, 222, 231, 232, 240, 300, 301, 400, 401, 402, 1000, 1001, 1002, 1003, 1101, 9500, 9999, 10000,
    ]);
    const byClass = (name: string) => [...SUPPORTED_OPCODES].filter(([, value]) => value === name).map(([opcode]) => opcode).sort((a, b) => a - b);
    expect(byClass('none')).toEqual([106, 107, 9500]);
    expect(byClass('integer')).toEqual([240, 400, 401, 402, 1000, 9999, 10000]);
    // 210 and 211 are float opcodes (P3-08/02's correction).
    expect(byClass('float')).toEqual([104, 210, 211]);
    expect(byClass('degrees')).toEqual([1001, 1002, 1003]);
    expect(byClass('boolean')).toEqual([200, 222, 232, 1101]);
    expect(byClass('keyword')).toEqual([231, 300, 301]);
    expect(byClass('optional-floats')).toEqual([100]);
    expect(byClass('floats')).toEqual([111]);
  });

  it('rejects any other opcode, the unreachable ones of group 0 included', () => {
    for (const opcode of [0, 101, 109, 203, 305, 403, 1102, 2000, 9000, 9001, 9002]) expectRejected(opcode, null, 'unsupported-opcode');
  });
});

describe('arguments without draws', () => {
  it('reads no text for the no-argument class', () => {
    expect(plan(106, null)).toEqual({ type: 'none' });
    expect(plan(9500, 'anything [')).toEqual({ type: 'none' });
  });

  it('reads integers as atoi would read them completely: optional sign, digits, i32', () => {
    expect(plan(240, '42')).toEqual(integer(42));
    expect(plan(400, '+7')).toEqual(integer(7));
    expect(plan(401, '-3')).toEqual(integer(-3));
    // The integer parser skips spaces before looking for a range.
    expect(plan(402, '  12')).toEqual(integer(12));
    expect(plan(9999, '-2147483648')).toEqual(integer(-0x8000_0000));
    expect(plan(10000, '2147483647')).toEqual(integer(0x7fff_ffff));
    expect(plan(240, '-0')).toEqual(integer(0));
    // No text leaves the slot at its stored 0.
    expect(plan(10000, null)).toEqual(integer(0));
    for (const text of ['', ' ', '1.5', '12a', '12 ', '2147483648', '-2147483649', '0x10', '+', '1e3']) expectRejected(240, text, 'invalid-number');
  });

  it('reads floats within the exact strtod domain, as F of the correctly rounded double', () => {
    expect(plan(104, '0.75')).toEqual(float(0.75));
    expect(plan(104, '0.1')).toEqual(float(Math.fround(0.1)));
    expect(plan(210, '-.5')).toEqual(float(-0.5));
    expect(plan(211, '5.')).toEqual(float(5));
    expect(plan(104, '1e2')).toEqual(float(100));
    expect(plan(104, '1D2')).toEqual(float(100));
    expect(plan(104, '25E-1')).toEqual(float(2.5));
    expect(plan(104, '  3')).toEqual(float(3));
    expect(plan(104, '123456789012345')).toEqual(float(Math.fround(123456789012345)));
    expect(plan(104, '1e22')).toEqual(float(Math.fround(1e22)));
    expect(plan(104, '0.0000000000000000000001')).toEqual(float(Math.fround(1e-22)));
    // No text gives 0.0, and so does an empty text, which strtod reads as 0.
    expect(plan(104, null)).toEqual(float(0));
    expect(plan(104, '')).toEqual(float(0));
    // 16 significant digits, a scale past 10^22, or text strtod would leave unread.
    // The scale bound holds for a zero mantissa too.
    expect(plan(104, '0e22')).toEqual(float(0));
    for (const text of ['1234567890123456', '1e23', '0.00000000000000000000001', '0e23', '-0D-23', '.', '1.5x', '1e', '1.2.3', ' ', 'inf', '1,5', ' [1 2]', '1 ']) {
      expectRejected(104, text, 'invalid-number');
    }
  });

  it('keeps -0 as -0, which is not negative', () => {
    expect(Object.is((plan(104, '-0') as { term: { value: number } }).term.value, -0)).toBe(true);
    expect(plan(1001, '-0')).toEqual(float(-0, true));
  });

  it('scales degrees at parse time: F(D(D(v × 3.1415927) × 0.005555555555555555))', () => {
    expect(plan(1001, '45')).toEqual(float(Math.fround(45 * 3.1415927 * 0.005555555555555555), true));
    expect(plan(1002, '0.5')).toEqual(float(Math.fround(0.5 * 3.1415927 * 0.005555555555555555), true));
    expect(degreeSlot(180)).toBe(Math.fround(3.1415927));
    expect(plan(1003, null)).toEqual(float(0, true));
  });

  it('reads booleans by the first letter after spaces, either case', () => {
    for (const [text, result] of [['Y', 1], ['yes', 1], ['T', 1], ['true', 1], ['  n', 0], ['No', 0], ['f', 0], ['F', 0]] as const) {
      expect(plan(200, text)).toEqual(integer(result));
    }
    for (const text of ['', ' ', 'x', '1', 'Ja']) expectRejected(222, text, 'invalid-boolean');
    expectRejected(1101, null, 'missing-argument');
  });

  it('looks keywords up in the opcode\'s table, trailing spaces removed, A–Z folded, the first match', () => {
    expect(plan(231, 'ALPHA')).toEqual(integer(7));
    expect(plan(231, 'Beta   ')).toEqual(integer(-1));
    expect(plan(231, 'g\xc4')).toEqual(integer(0x7fffffff));
    expect(plan(300, 'NEAR')).toEqual(integer(1));
    expect(plan(301, 'large')).toEqual(integer(5));
    // Only A–Z fold; a leading space is not removed; each opcode reads its own table.
    for (const [opcode, text] of [[231, 'g\xe4'], [231, ' alpha'], [300, 'alpha'], [301, 'far'], [231, '']] as const) expectRejected(opcode, text, 'unknown-keyword');
    expectRejected(300, null, 'missing-argument');
  });
});

describe('ranges and multi-value arguments', () => {
  it('reads [lo hi sign] with space-separated tokens and a sign token that is empty or starts with + or -', () => {
    expect(plan(240, '[1 4]')).toEqual({ type: 'integer', term: range(1, 4) });
    expect(plan(240, '  [ -1  4 ]')).toEqual({ type: 'integer', term: range(-1, 4) });
    // A second draw when byte 0 or byte 1 of the sign token is '-'.
    expect(plan(401, '[1 4 -]')).toEqual({ type: 'integer', term: range(1, 4, true) });
    expect(plan(401, '[1 4 +-]')).toEqual({ type: 'integer', term: range(1, 4, true) });
    expect(plan(401, '[1 4 +]')).toEqual({ type: 'integer', term: range(1, 4) });
    expect(plan(401, '[1 4 +x]')).toEqual({ type: 'integer', term: range(1, 4) });
    // Reversed bounds are a negative divisor, not an error.
    expect(plan(240, '[4 1]')).toEqual({ type: 'integer', term: range(4, 1) });
    expect(plan(104, '[0.5 1.5 -]')).toEqual({ type: 'float', term: range(0.5, 1.5, true), degrees: false });
    expect(plan(1002, '[10 20]')).toEqual({ type: 'float', term: range(10, 20), degrees: true });
  });

  it('rejects a range without ], a zero divisor hi − lo + 1 in i32, and anything the tokens leave unread', () => {
    expectRejected(240, '[1 4', 'unterminated-range');
    expectRejected(104, '[1 4 -', 'unterminated-range');
    expectRejected(240, '[5 4]', 'zero-range');
    expectRejected(240, '[-2147483648 2147483647]', 'zero-range');
    // A range token holds at most 0x30 characters.
    expect(plan(240, `[1 ${'0'.repeat(47)}4]`)).toEqual({ type: 'integer', term: range(1, 4) });
    for (const text of ['[1]', '[]', '[1 4 x]', '[1 4 - -]', '[1 4]x', '[1 4] ', '[1,4]', '[1 [4]]', '[1.5 4]', `[1 ${'0'.repeat(48)}4]`]) {
      expectRejected(240, text, 'invalid-number');
    }
    expectRejected(104, '[1 2x]', 'invalid-number');
  });

  it('splits opcode 100 into four tokens at commas and spaces outside brackets: x absent, an empty token 0.0', () => {
    expect(plan(100, '1 x [0.5 1.5 -] 2')).toEqual({ type: 'optional-floats', terms: [value(1), null, range(0.5, 1.5, true), value(2)] });
    expect(plan(100, '1')).toEqual({ type: 'optional-floats', terms: [value(1), value(0), value(0), value(0)] });
    // Delimiters after a token are skipped together; a leading comma gives an empty first token.
    expect(plan(100, '1,, 2')).toEqual({ type: 'optional-floats', terms: [value(1), value(2), value(0), value(0)] });
    expect(plan(100, ',1')).toEqual({ type: 'optional-floats', terms: [value(0), value(1), value(0), value(0)] });
    expect(plan(100, 'X xyz 0.25 -1')).toEqual({ type: 'optional-floats', terms: [null, null, value(0.25), value(-1)] });
    expectRejected(100, '1 2 3 4 5', 'invalid-number');
    expectRejected(100, '1] 2', 'invalid-number');
    expectRejected(100, '[1 2', 'unterminated-range');
    expectRejected(100, '1a', 'invalid-number');
    // The tokenizer copies at most 32 characters; leading zeros keep the digits significant within 15.
    expect(plan(100, `${'0'.repeat(31)}1`)).toEqual({ type: 'optional-floats', terms: [value(1), value(0), value(0), value(0)] });
    expectRejected(100, `${'0'.repeat(32)}1`, 'invalid-number');
    expect(plan(100, '1'.repeat(15))).toEqual({ type: 'optional-floats', terms: [value(Math.fround(111111111111111)), value(0), value(0), value(0)] });
    expectRejected(100, null, 'missing-argument');
  });

  it('splits opcode 111 into three float tokens', () => {
    expect(plan(111, '1, 2, 3')).toEqual({ type: 'floats', terms: [value(1), value(2), value(3)] });
    expect(plan(111, '[0 1] 2')).toEqual({ type: 'floats', terms: [range(0, 1), value(2), value(0)] });
    expectRejected(111, '1 2 3 4', 'invalid-number');
    expectRejected(111, 'x 2 3', 'invalid-number');
    expectRejected(111, null, 'missing-argument');
  });

  it('returns frozen plans', () => {
    expect(deepFrozen(plan(100, '1 x [0.5 1.5 -] 2'))).toBe(true);
    expect(deepFrozen(plan(240, '[1 4]'))).toBe(true);
  });
});

describe('negative delays of opcodes 1000–1003 (CR-24 decision 16)', () => {
  it('accepts them: a negative wait acts as 0 at run time', () => {
    expect(plan(1000, '-1')).toEqual(integer(-1));
    expect(plan(1000, '[-1 5 -]')).toEqual({ type: 'integer', term: range(-1, 5, true) });
    expect(plan(1001, '-1')).toEqual(float(degreeSlot(-1), true));
    expect(plan(1003, '[2 -1 -]')).toEqual({ type: 'float', term: range(2, -1, true), degrees: true });
  });
});
