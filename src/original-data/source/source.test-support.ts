import { Sha256, sha256Fingerprint } from '../../content/sha256.ts';
import type { SyntheticFileContent } from '../disc/disc.test-support.ts';
import { readSourceCatalog, type SourceCatalog } from './source-catalog.ts';

const CHUNK = 1 << 20;

/** The `sha256:` digest of file content, hashing generated content in chunks. */
function contentDigest(content: SyntheticFileContent): string {
  if (content instanceof Uint8Array) return sha256Fingerprint(content);
  const hash = new Sha256();
  for (let offset = 0; offset < content.byteLength; offset += CHUNK) {
    hash.update(content.read(offset, Math.min(CHUNK, content.byteLength - offset)));
  }
  return `sha256:${hash.digestHex()}`;
}

/** A whitelist covering exactly `files` (by disc path), with their real lengths and digests. */
export function catalogFor(files: Readonly<Record<string, SyntheticFileContent>>, versionId = 'synthetic-test'): SourceCatalog {
  return readSourceCatalog({
    versionId,
    files: Object.keys(files).sort().map(path => {
      const content = files[path];
      return { path, byteLength: content instanceof Uint8Array ? content.length : content.byteLength, sha256: contentDigest(content) };
    }),
  });
}

