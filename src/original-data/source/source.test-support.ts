import { Sha256, sha256Fingerprint } from '../../content/sha256.ts';
import { openImfatArchive } from '../archive/archive-reader.ts';
import { IMFAT_HEADER_BYTES } from '../archive/imfat-rules.ts';
import { openDiscImage, type DiscFile } from '../disc/disc-image.ts';
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
 * the read budget, which equals the input size, above the reads of verification and conversion.
 */
export async function syntheticVerifiedSource(files: Readonly<Record<string, Uint8Array>>): Promise<VerifiedSource> {
  const padding: SyntheticFileContent = { byteLength: 1 << 20, read: (_, length) => new Uint8Array(length) };
  const disc = syntheticFileDisc({ ...files, 'DEMO/PAD.DAT': padding });
  return identifySource(await openDiscImage(disc.files), catalogFor(files));
}

export interface LoggedReads {
  /** The identified source with every later file read recorded. */
  readonly source: VerifiedSource;
  /** Read counts keyed `PATH header`, `PATH directory` or `PATH TYPE#ID`, labelled from each archive's own directory. */
  counts(): Promise<Record<string, number>>;
}

/** Records the file reads made through `identified` from now on, as a test port for read-range assertions. */
export function loggedReads(identified: VerifiedSource): LoggedReads {
  const log: { readonly path: string; readonly offset: number }[] = [];
  const openFile = async (path: string): Promise<DiscFile> => {
    const file = await identified.openFile(path);
    return { entry: file.entry, read: (offset, length) => (log.push({ path, offset }), file.read(offset, length)) };
  };
  return {
    source: { identity: identified.identity, usage: () => identified.usage(), openFile, openArchive: async path => openImfatArchive(await openFile(path)) },
    async counts() {
      const labels = new Map<string, ReadonlyMap<number, string>>();
      const counts: Record<string, number> = {};
      for (const { path, offset } of log) {
        if (!labels.has(path)) {
          const { entries } = await identified.openArchive(path);
          labels.set(path, new Map([[0, 'header'], [IMFAT_HEADER_BYTES, 'directory'], ...entries.map(({ offset: at, id, type }) => [at, `${type}#${id}`] as const)]));
        }
        const label = `${path} ${labels.get(path)!.get(offset) ?? `@${offset}`}`;
        counts[label] = (counts[label] ?? 0) + 1;
      }
      return counts;
    },
  };
}
