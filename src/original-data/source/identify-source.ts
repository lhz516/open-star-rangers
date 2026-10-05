import type { BudgetRecord } from '../../content/budget.ts';
import type { SourceFingerprint } from '../../content/content-identity.ts';
import { Sha256 } from '../../content/sha256.ts';
import { openImfatArchive, type ImfatArchiveHandle } from '../archive/archive-reader.ts';
import { DiscReadError } from '../disc/disc-error.ts';
import type { DiscFile, DiscImage } from '../disc/disc-image.ts';
import { isDiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';
import { readSourceCatalog, sourceFingerprint, type CatalogFile } from './source-catalog.ts';

/** Largest segment hashed at once: the user data of one 2,048-sector port read. */
export const HASH_SEGMENT_BYTES = 4_194_304;

/** The identity of a verified source: frozen, structured-cloneable plain data. */
export interface SourceIdentity {
  readonly versionId: string;
  readonly fingerprint: SourceFingerprint;
  /** The covered files, as whitelisted and verified. */
  readonly files: readonly CatalogFile[];
}

/**
 * A disc whose covered files matched a version whitelist. It opens only covered files and archives, sharing the disc
 * image's budget and cancellation; it holds the image, so it is not structured-cloneable.
 */
export interface VerifiedSource {
  readonly identity: SourceIdentity;
  /** A covered file; another valid path is `path-not-covered` and a malformed one `invalid-request`, without reading. */
  openFile(path: string): Promise<DiscFile>;
  /** A covered file opened as an IMFAT archive, reading only its header and directory. */
  openArchive(path: string): Promise<ImfatArchiveHandle>;
  /** The disc image's metered usage, which identification and every later read share. */
  usage(): BudgetRecord;
}

class IdentifiedSource implements VerifiedSource {
  readonly identity: SourceIdentity;
  readonly #disc: DiscImage;
  readonly #covered: ReadonlySet<string>;

  constructor(disc: DiscImage, identity: SourceIdentity) {
    this.identity = identity;
    this.#disc = disc;
    this.#covered = new Set(identity.files.map(({ path }) => path));
  }

  async openFile(path: string): Promise<DiscFile> {
    if (!isDiscPath(path)) throw new SourceError('invalid-request', 'request.path', 'the path is not a disc path');
    if (!this.#covered.has(path)) throw new SourceError('path-not-covered', `file:/${path}`, 'the file is outside the verified whitelist');
    return this.#disc.openFile(path);
  }

  async openArchive(path: string): Promise<ImfatArchiveHandle> {
    return openImfatArchive(await this.openFile(path));
  }

  usage(): BudgetRecord {
    return this.#disc.usage();
  }
}

const unsupported = (path: string, reason: string) => new SourceError('unsupported-version', `file:/${path}`, reason);

/** Checks that a covered file exists as a file of the whitelisted size, mapping a missing path to an unsupported version. */
async function checkPresence(disc: DiscImage, { path, byteLength }: CatalogFile): Promise<void> {
  let entry;
  try {
    entry = await disc.lookup(path);
  } catch (error) {
    if (error instanceof DiscReadError && (error.code === 'path-not-found' || error.code === 'wrong-entry-kind')) {
      throw unsupported(path, 'a covered file is missing');
    }
    throw error;
  }
  if (entry.kind !== 'file') throw unsupported(path, 'a covered path is a directory');
  if (entry.byteLength !== byteLength) throw unsupported(path, 'a covered file has another size');
}

/** Hashes a covered file from offset 0 in segments of at most `HASH_SEGMENT_BYTES`, keeping only one segment at a time. */
async function checkDigest(disc: DiscImage, { path, byteLength, sha256 }: CatalogFile): Promise<void> {
  const file = await disc.openFile(path);
  const hash = new Sha256();
  for (let offset = 0; offset < byteLength; offset += HASH_SEGMENT_BYTES) {
    hash.update(await file.read(offset, Math.min(HASH_SEGMENT_BYTES, byteLength - offset)));
  }
  if (`sha256:${hash.digestHex()}` !== sha256) throw unsupported(path, 'a covered file has other contents');
}

/**
 * Identifies an opened disc against a version whitelist: first every covered file's presence and size in path order,
 * then every file's SHA-256 in path order. Files outside the whitelist are never looked up or read. The first mismatch
 * is `unsupported-version`; disc read failures pass through unchanged. A low-level capability: products use
 * `openVerifiedSource`, which always applies the production whitelist.
 */
export async function identifySource(disc: DiscImage, catalog: unknown): Promise<VerifiedSource> {
  const checked = readSourceCatalog(catalog);
  for (const file of checked.files) await checkPresence(disc, file);
  for (const file of checked.files) await checkDigest(disc, file);
  const identity = Object.freeze({ versionId: checked.versionId, fingerprint: sourceFingerprint(checked), files: checked.files });
  return Object.freeze(new IdentifiedSource(disc, identity));
}
