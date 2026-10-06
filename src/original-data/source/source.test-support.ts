import { Sha256, sha256Fingerprint } from '../../content/sha256.ts';
import { openDiscImage } from '../disc/disc-image.ts';
import { syntheticFileDisc, type SyntheticFileContent } from '../disc/disc.test-support.ts';
import { identifySource, type VerifiedSource } from './identify-source.ts';
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


/**
 * Identifies a synthetic file disc holding `files` against a whitelist of exactly those files. Unread padding raises
 * the read budget, which equals the input size, above the rereads of verification and conversion.
 */
export async function syntheticVerifiedSource(files: Readonly<Record<string, Uint8Array>>): Promise<VerifiedSource> {
  const padding: SyntheticFileContent = { byteLength: 1 << 20, read: (_, length) => new Uint8Array(length) };
  const disc = syntheticFileDisc({ ...files, 'DEMO/PAD.DAT': padding });
  return identifySource(await openDiscImage(disc.files), catalogFor(files));
}
