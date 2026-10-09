import { describe, expect, it, vi } from 'vitest';
import { fnv1a64 } from '../determinism/fnv1a64.ts';
import { CoreInputError } from '../errors.ts';
import { canonicalHash, canonicalObject, canonicalText, type CanonicalValue } from './canonical-text.ts';
import { CORE_LIMITS } from './limits.ts';

const LIMIT = CORE_LIMITS.canonicalTextLength;

function expectInputError(write: () => unknown, path: string, reason: string): void {
  let thrown: unknown;
  try {
    write();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CoreInputError);
  expect(thrown).toMatchObject({ path, reason });
}

/** A sample record writer: the canonical order comes from this code, never from the record's keys. */
const sample = (record: { readonly id: number; readonly name: string; readonly position: { readonly x: number; readonly y: number } }) =>
  canonicalObject([
    ['id', record.id],
    ['name', record.name],
    ['position', canonicalObject([['x', record.position.x], ['y', record.position.y]])],
  ]);

describe('canonical text (P3-02 AC-11 rules, 快照、哈希与 replay)', () => {
  it('writes compact JSON with members in the listed order and lists in their order', () => {
    const value = canonicalObject([
      ['z', 1],
      ['a', [3, 1, 2]],
      ['m', canonicalObject([['b', true], ['a', null], ['c', 'text']])],
      ['empty', canonicalObject([])],
      ['none', []],
    ]);
    expect(canonicalText(value)).toBe('{"z":1,"a":[3,1,2],"m":{"b":true,"a":null,"c":"text"},"empty":{},"none":[]}');
  });

  it('does not depend on the insertion order of the source objects', () => {
    const first = sample({ id: 7, name: 'alpha', position: { x: 1, y: 2 } });
    const second = sample({ position: { y: 2, x: 1 }, name: 'alpha', id: 7 });
    expect(canonicalText(first)).toBe('{"id":7,"name":"alpha","position":{"x":1,"y":2}}');
    expect(canonicalText(second)).toBe(canonicalText(first));
    expect(canonicalHash(second)).toBe(canonicalHash(first));
  });

  it('rejects plain objects, so key order cannot reach the text', () => {
    expectInputError(() => canonicalText({ a: 1 } as unknown as CanonicalValue), 'value', 'must be null, a boolean, a finite number, a string, an array or a canonicalObject');
  });

  it('writes -0 as 0 everywhere and numbers in their shortest round-trip form', () => {
    expect(canonicalText(-0)).toBe('0');
    expect(canonicalText(canonicalObject([['x', -0], ['list', [-0, 0]]]))).toBe('{"x":0,"list":[0,0]}');
    expect(canonicalText([1e21, 0.1, 5e-324, -1.5, 2 ** 53, 1 / 3])).toBe('[1e+21,0.1,5e-324,-1.5,9007199254740992,0.3333333333333333]');
  });

  it.each([Number.NaN, Infinity, -Infinity])('rejects the non-finite number %s with its path', (bad) => {
    const value = canonicalObject([['state', canonicalObject([['entities', [canonicalObject([['x', 0]]), canonicalObject([['x', bad]])]]])]]);
    expectInputError(() => canonicalText(value, 'snapshot'), 'snapshot.state.entities[1].x', 'must be a finite number');
    expectInputError(() => canonicalHash([bad]), 'value[0]', 'must be a finite number');
  });

  it('escapes every non-ASCII code unit as lowercase \\uXXXX, so the text is ASCII and hashable', () => {
    const text = 'caf\u00e9 \u4e2d \u{1f680} \ud800 \u2028 \u007f\n"\\\u0001';
    const written = canonicalText(canonicalObject([['caf\u00e9', text]]));
    expect(written).toBe('{"caf\\u00e9":"caf\\u00e9 \\u4e2d \\ud83d\\ude80 \\ud800 \\u2028 \u007f\\n\\"\\\\\\u0001"}');
    expect(/[\u0080-\uffff]/.test(written)).toBe(false);
    expect(JSON.parse(written)).toEqual({ 'caf\u00e9': text });
    expect(canonicalHash(text)).toBe(fnv1a64(canonicalText(text)));
  });

  it('writes booleans and null', () => {
    expect(canonicalText([true, false, null])).toBe('[true,false,null]');
  });

  it.each([
    ['undefined', undefined],
    ['a function', () => 1],
    ['a symbol', Symbol('s')],
    ['a bigint', 1n],
    ['a date', new Date(0)],
    ['a map', new Map()],
  ])('rejects %s', (_, bad) => {
    expectInputError(() => canonicalText([bad] as unknown as CanonicalValue), 'value[0]', 'must be null, a boolean, a finite number, a string, an array or a canonicalObject');
  });

  it('rejects an array hole and a duplicate member name', () => {
    // eslint-disable-next-line no-sparse-arrays
    expectInputError(() => canonicalText([1, , 3] as unknown as CanonicalValue), 'value[1]', 'must be null, a boolean, a finite number, a string, an array or a canonicalObject');
    expectInputError(() => canonicalText(canonicalObject([['a', 1], ['b', 2], ['a', 3]])), 'value.a', 'is a duplicate member');
  });

  it('keeps its own frozen copy of the member list and of each member', () => {
    const pair: [string, CanonicalValue] = ['a', 1];
    const members: [string, CanonicalValue][] = [pair];
    const value = canonicalObject(members);
    members.push(['b', 2]);
    pair[0] = 'renamed';
    pair[1] = 2;
    expect(canonicalText(value)).toBe('{"a":1}');
    expect(Object.isFrozen(value)).toBe(true);
  });

  it(`accepts a text of exactly ${LIMIT} characters and rejects one more`, () => {
    expect(canonicalText('a'.repeat(LIMIT - 2))).toHaveLength(LIMIT);
    expect(canonicalText(['a'.repeat(LIMIT - 4)])).toHaveLength(LIMIT);
    const reason = `makes the canonical text longer than ${LIMIT} characters`;
    expectInputError(() => canonicalText('a'.repeat(LIMIT - 1)), 'value', reason);
    expectInputError(() => canonicalText(['a'.repeat(LIMIT - 3)]), 'value', reason);
  });

  it('counts every escape exactly at the limit', () => {
    // Written widths: é 6, " 2, newline 2, U+0001 6, lone surrogate 6, surrogate pair 12, DEL 1, U+2028 6; 41 in all.
    const special = '\u00e9"\n\u0001\ud800\u{1f680}\u007f\u2028';
    const filler = LIMIT - 2 - 41;
    expect(canonicalText(special + 'a'.repeat(filler))).toHaveLength(LIMIT);
    expectInputError(() => canonicalText(special + 'a'.repeat(filler + 1)), 'value', `makes the canonical text longer than ${LIMIT} characters`);
  });

  it('rejects a string whose escapes exceed the limit before encoding it', () => {
    const stringify = vi.spyOn(JSON, 'stringify');
    // Fits as raw code units; written as \u00e9 each, it is 6 times longer.
    expectInputError(() => canonicalText('\u00e9'.repeat(LIMIT / 4)), 'value', `makes the canonical text longer than ${LIMIT} characters`);
    expectInputError(() => canonicalText('\u0001'.repeat(LIMIT / 4)), 'value', `makes the canonical text longer than ${LIMIT} characters`);
    expect(stringify).not.toHaveBeenCalled();
  });

  it('stops writing at the first piece past the limit, without visiting the rest', () => {
    const piece = 'x'.repeat(2 ** 20);
    let visited = 0;
    const endless = new Proxy(new Array<string>(2 ** 31), {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          visited++;
          return piece;
        }
        return Reflect.get(target, key, receiver);
      },
    });
    expectInputError(() => canonicalText(endless), 'value[15]', `makes the canonical text longer than ${LIMIT} characters`);
    expect(visited).toBe(16);
  });

  it('hashes to 16 lowercase hex digits of FNV-1a 64 over the text', () => {
    const value = sample({ id: 1, name: 'n', position: { x: 0.5, y: -2 } });
    const hash = canonicalHash(value);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash).toBe(fnv1a64('{"id":1,"name":"n","position":{"x":0.5,"y":-2}}'));
    expect(canonicalHash(sample({ id: 1, name: 'n', position: { x: 0.5, y: -1 } }))).not.toBe(hash);
    expect(canonicalHash(canonicalObject([]))).toBe(fnv1a64('{}'));
  });
});
