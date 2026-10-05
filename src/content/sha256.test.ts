import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Fingerprint } from './sha256.ts';

const text = (value: string) => new TextEncoder().encode(value);

describe('sha256Fingerprint', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ])('matches the FIPS 180-4 vector for %j', (input, digest) => {
    expect(sha256Fingerprint(text(input))).toBe(`sha256:${digest}`);
  });

  it('matches Node across block-boundary lengths and subarray views without mutating input', () => {
    const backing = new Uint8Array(70_000).map((_, index) => (index * 31 + 7) & 0xff);
    for (const length of [1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 4095, 65_536]) {
      const bytes = backing.subarray(3, 3 + length);
      const before = bytes.slice();
      expect(sha256Fingerprint(bytes), `length ${length}`).toBe(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);
      expect(bytes).toEqual(before);
    }
  });
});
