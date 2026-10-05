/**
 * In-memory reading of Interactive Magic "IMFAT" archives (the `.NOB` files of Star Rangers), for research tools and
 * tests. It applies the same structure rules and errors as on-demand reading; see archive/imfat-rules.ts for the
 * layout and docs/original/formats/imfat.md for the format facts.
 */
import {
  entrySpan,
  IMFAT_HEADER_BYTES,
  readImfatDirectory,
  readImfatHeader,
  readImfatRelocations,
  type ImfatEntry,
} from './archive/imfat-rules.ts';
import { SourceError } from './source-error.ts';

export type { ImfatEntry } from './archive/imfat-rules.ts';

export interface ImfatArchive {
  readonly version: number;
  readonly idBase: number;
  readonly dataStart: number;
  /** Frozen entries in directory order, which is also data order and ascending ID order. */
  readonly entries: readonly ImfatEntry[];
}

/** Entries parsed from each byte array, so helpers never accept an entry of another archive. */
const parsed = new WeakMap<Uint8Array, WeakSet<ImfatEntry>>();

/** Parses and validates the header and the whole directory; throws `SourceError` on the first violation. */
export function parseImfat(bytes: Uint8Array): ImfatArchive {
  const header = readImfatHeader(bytes.subarray(0, IMFAT_HEADER_BYTES), bytes.length, null);
  const entries = readImfatDirectory(header, bytes.subarray(IMFAT_HEADER_BYTES, header.dataStart), bytes.length, null);
  const owned = parsed.get(bytes) ?? new WeakSet();
  for (const entry of entries) owned.add(entry);
  parsed.set(bytes, owned);
  return Object.freeze({ version: header.version, idBase: header.idBase, dataStart: header.dataStart, entries });
}

function requireOwned(bytes: Uint8Array, entry: ImfatEntry): void {
  if (!parsed.get(bytes)?.has(entry)) throw new SourceError('invalid-request', 'request.entry', 'the entry was not parsed from these bytes');
}

/** The data block of an entry of `parseImfat(bytes)`, as a view of `bytes`. */
export function entryData(bytes: Uint8Array, entry: ImfatEntry): Uint8Array {
  requireOwned(bytes, entry);
  return bytes.subarray(entry.offset, entry.offset + entry.size);
}

/** Validated positions (relative to the block start) of the internal pointers of an entry of `parseImfat(bytes)`. */
export function entryRelocations(bytes: Uint8Array, entry: ImfatEntry): readonly number[] {
  requireOwned(bytes, entry);
  return readImfatRelocations(entry, bytes.subarray(entry.offset, entry.offset + entrySpan(entry)), null);
}
