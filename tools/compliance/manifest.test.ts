import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseManifest, readManifest } from './manifest.ts';
import { fixture, syntheticManifest } from './test-support.ts';

describe('authoritative blacklist tables', () => {
  it('reads every real metadata table row without opening original files', () => {
    const text = readFileSync(new URL('../../docs/original/manifest.md', import.meta.url), 'utf8');
    const parsed = parseManifest(text);
    expect(parsed.entries.length).toBe(text.split('\n').filter(line => /^\| `.+\| `[a-f0-9]{64}` \|$/.test(line)).length);
    expect(new Set(parsed.entries.map(entry => entry.table))).toEqual(new Set(['images', 'game']));
    expect(parsed.entries.every(entry => entry.source.length > 0)).toBe(true);
  });
  it('retains repeated digests with separate provenance', () => {
    const parsed = parseManifest(syntheticManifest());
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].sha256).toBe(parsed.entries[1].sha256);
    expect(parsed.entries[0].source).not.toBe(parsed.entries[1].source);
  });
  it.each([
    (text: string) => text.replace('## 光盘镜像', '## Missing'),
    (text: string) => text.replace('| 文件 | SHA-256 |', '| Bad | SHA-256 |'),
    (text: string) => text.replace('|---|---|', '|bad|bad|'),
    (text: string) => text.replace(/\| `synthetic.img`.*\n/, ''),
    (text: string) => text.replace(/`[a-f0-9]{64}`/, '`abc`'),
    (text: string) => text.replace('| `synthetic.img`', '`synthetic.img`'),
    (text: string) => text.replace('| `MAIN/SYNTHETIC.DAT`', '| `OTHER/SYNTHETIC.DAT`'),
    (text: string) => text.replace(/ \| \d+ \| /, ' | -1 | '),
    (text: string) => text + text,
    (text: string) => text.replace(/\| `synthetic.img`.*\n/, row => row + row),
  ])('rejects malformed, empty and duplicate required tables', mutate => {
    expect(() => parseManifest(mutate(syntheticManifest()))).toThrow();
  });
  it('rejects missing input explicitly', async () => fixture(root => {
    expect(() => readManifest(`${root}/missing.md`)).toThrow(/ENOENT/);
  }));
});
