import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Sha256, sha256Fingerprint } from './sha256.ts';

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

describe('Sha256', () => {
  const node = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const pattern = (length: number) => new Uint8Array(length).map((_, index) => (index * 131 + 17) & 0xff);
  const segmented = (bytes: Uint8Array, cuts: readonly number[]) => {
    const hash = new Sha256();
    let start = 0;
    for (const cut of [...cuts, bytes.length]) {
      hash.update(bytes.subarray(start, cut));
      start = cut;
    }
    return hash.digestHex();
  };

  it.each(['', 'abc'])('matches Node for %j', (input) => {
    expect(new Sha256().update(text(input)).digestHex()).toBe(node(text(input)));
  });

  it.each([55, 56, 63, 64, 65, 119, 120])('gives the same digest for every two-way split of %i bytes', (length) => {
    const bytes = pattern(length);
    const expected = node(bytes);
    for (let cut = 0; cut <= length; cut++) expect(segmented(bytes, [cut]), `cut ${cut}`).toBe(expected);
  });

  it('accepts byte-by-byte input, empty segments and cuts across block boundaries', () => {
    const bytes = pattern(200);
    const expected = node(bytes);
    expect(segmented(bytes, Array.from({ length: 199 }, (_, index) => index + 1))).toBe(expected);
    expect(segmented(bytes, [0, 0, 63, 63, 64, 127, 129, 129, 192])).toBe(expected);
  });

  it('hashes 1,000,000 bytes of "a" in uneven segments', () => {
    const bytes = new Uint8Array(1_000_000).fill(0x61);
    const expected = 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0';
    expect(node(bytes)).toBe(expected);
    expect(sha256Fingerprint(bytes)).toBe(`sha256:${expected}`);
    expect(segmented(bytes, [1, 65, 4_160, 333_333, 999_999])).toBe(expected);
  });

  it('reads segments without modifying them and finishes once', () => {
    const backing = pattern(300);
    const before = backing.slice();
    const hash = new Sha256().update(backing.subarray(7, 77)).update(backing.subarray(77, 290));
    const digest = hash.digestHex();
    expect(digest).toBe(node(backing.subarray(7, 290)));
    expect(backing).toEqual(before);
    expect(hash.digestHex()).toBe(digest);
    expect(() => hash.update(new Uint8Array(1))).toThrow();
    expect(() => hash.update(new Uint8Array(0))).toThrow();
  });

  it('rejects a detached segment without changing the hash state', () => {
    const detached = (length: number) => {
      const bytes = pattern(length);
      structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
      return bytes;
    };
    expect(() => sha256Fingerprint(detached(10))).toThrow();
    const bytes = pattern(150);
    const hash = new Sha256().update(bytes.subarray(0, 30));
    expect(() => hash.update(detached(10))).toThrow();
    expect(() => new Sha256().update(detached(0))).toThrow();
    expect(hash.update(bytes.subarray(30)).digestHex()).toBe(node(bytes));
  });
});
