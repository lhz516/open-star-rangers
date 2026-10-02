import { describe, expect, it } from 'vitest';
import { CoreInputError } from '../errors.ts';
import { fnv1a64 } from './fnv1a64.ts';

/** Independent BigInt transcription of FNV-1a 64, used to cross-check the uint32-halves implementation. */
function referenceFnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index++) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

describe('fnv1a64 (AC-02)', () => {
  // Published FNV-1a 64 test vectors from Landon Curt Noll's test_fnv.c
  // (http://www.isthe.com/chongo/tech/comp/fnv/), not outputs of the module under test.
  it.each([
    ['', 'cbf29ce484222325'],
    ['a', 'af63dc4c8601ec8c'],
    ['foobar', '85944171f73967e8'],
  ])('matches the public vector for %j', (text, expected) => {
    expect(fnv1a64(text)).toBe(expected);
  });

  it('keeps leading zeros (value from the BigInt reference above)', () => {
    expect(referenceFnv1a64('k9000')).toBe('00a93efcb6745273');
    expect(fnv1a64('k9000')).toBe('00a93efcb6745273');
  });

  it('agrees with the BigInt reference on every ASCII code unit and longer text', () => {
    const inputs = [
      ...Array.from({ length: 0x80 }, (_, code) => String.fromCharCode(code)),
      '{"format":"osr-synthetic-snapshot","version":1}',
      '\u007f'.repeat(64),
    ];
    for (const text of inputs) {
      const hash = fnv1a64(text);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      expect(hash).toBe(referenceFnv1a64(text));
    }
  });

  it.each(['\u0080', 'caf\u00e9', '\u{1f680}'])('rejects non-ASCII text %j with CoreInputError', (text) => {
    expect(() => fnv1a64(text)).toThrow(CoreInputError);
  });

  it('reports the index of the first non-ASCII character', () => {
    expect(() => fnv1a64('ab\u00ffc')).toThrow(expect.objectContaining({ path: 'text[2]' }));
  });
});
