import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_CATALOG } from '../src/original-data/source/source-catalog.ts';
import { readManifest } from './compliance/manifest.ts';

// P2-03 AC-04: the production version whitelist must equal the authoritative manifest rows, which hold only paths,
// sizes and hashes, never original content.
describe('PRODUCTION_CATALOG and docs/original/manifest.md', () => {
  it('lists every covered file with the manifest size and SHA-256', () => {
    const manifest = readManifest(fileURLToPath(new URL('../docs/original/manifest.md', import.meta.url)));
    for (const { path, byteLength, sha256 } of PRODUCTION_CATALOG.files) {
      const row = manifest.entries.find(entry => entry.table === 'game' && entry.source === path);
      expect(row, path).toBeDefined();
      expect([row!.size, `sha256:${row!.sha256}`], path).toEqual([byteLength, sha256]);
    }
  });
});
