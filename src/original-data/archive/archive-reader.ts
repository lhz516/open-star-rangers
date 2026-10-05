import { exclusiveBytes } from '../../content/ownership.ts';
import type { DiscFile } from '../disc/disc-image.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';
import {
  archiveLocation,
  entrySpan,
  IMFAT_ENTRY_BYTES,
  IMFAT_HEADER_BYTES,
  isImfatType,
  readImfatDirectory,
  readImfatHeader,
  readImfatRelocations,
  type ImfatEntry,
} from './imfat-rules.ts';

/** One entry read on demand: its exclusive data block and validated relocation positions in table order. */
export interface ArchiveEntryRead {
  readonly entry: ImfatEntry;
  /** Exactly the data block, in a new buffer of its own that `payloadTransferList` accepts. */
  readonly bytes: Uint8Array;
  readonly relocations: readonly number[];
}

/**
 * An IMFAT archive opened on demand from a disc file. It keeps the validated directory but no entry bytes, so every
 * read issues and meters its own disc read. It holds the disc file, so it is not structured-cloneable.
 */
export interface ImfatArchiveHandle {
  readonly path: DiscPath;
  /** Frozen directory entries in ascending ID order. */
  readonly entries: readonly ImfatEntry[];
  /** The directory entry with `id`, and `type` when given. */
  entry(id: number, type?: string): ImfatEntry;
  /** Reads and validates the data block and relocation table of the entry with `id`, and `type` when given. */
  read(id: number, type?: string): Promise<ArchiveEntryRead>;
}

class OpenedArchive implements ImfatArchiveHandle {
  readonly path: DiscPath;
  readonly entries: readonly ImfatEntry[];
  readonly #file: DiscFile;
  readonly #byId: ReadonlyMap<number, ImfatEntry>;

  constructor(file: DiscFile, entries: readonly ImfatEntry[]) {
    this.path = file.entry.path;
    this.entries = entries;
    this.#file = file;
    this.#byId = new Map(entries.map(entry => [entry.id, entry]));
  }

  entry(id: number, type?: string): ImfatEntry {
    if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) throw new SourceError('invalid-request', 'request.id', 'the entry ID is not a u32');
    if (type !== undefined && !isImfatType(type)) throw new SourceError('invalid-request', 'request.type', 'the type is not a type tag');
    const entry = this.#byId.get(id);
    const at = `${archiveLocation(this.path)}#${id}`;
    if (!entry) throw new SourceError('entry-not-found', at, 'the archive has no entry with this ID');
    if (type !== undefined && entry.type !== type) throw new SourceError('entry-type-mismatch', at, 'the entry has another type');
    return entry;
  }

  async read(id: number, type?: string): Promise<ArchiveEntryRead> {
    const entry = this.entry(id, type);
    const span = await this.#file.read(entry.offset, entrySpan(entry));
    const relocations = readImfatRelocations(entry, span, this.path);
    // The disc read already returned an exclusive buffer; only a block followed by a table needs its own copy.
    const bytes = entry.relocationCount === 0 ? span : exclusiveBytes(span.subarray(0, entry.size));
    return Object.freeze({ entry, bytes, relocations });
  }
}

/**
 * Opens an IMFAT archive from any disc file, reading only its 24-byte header and then its whole directory in one range
 * read; too many entries fail before the directory is read. Disc read failures pass through unchanged.
 */
export async function openImfatArchive(file: DiscFile): Promise<ImfatArchiveHandle> {
  const { path, byteLength } = file.entry;
  const header = readImfatHeader(byteLength < IMFAT_HEADER_BYTES ? new Uint8Array(0) : await file.read(0, IMFAT_HEADER_BYTES), byteLength, path);
  const directory = await file.read(IMFAT_HEADER_BYTES, header.count * IMFAT_ENTRY_BYTES);
  return Object.freeze(new OpenedArchive(file, readImfatDirectory(header, directory, byteLength, path)));
}
