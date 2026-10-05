import type { DiscPath } from '../disc/disc-path.ts';
import { matchesWhole } from '../../content/contract-validation.ts';
import { SourceError } from '../source-error.ts';

/**
 * IMFAT (`.NOB`) structure rules shared by in-memory parsing and on-demand reading (docs/plan/p2/03/spec.md, supported
 * archive format; facts in docs/original/formats/imfat.md). All integers are little-endian u32.
 *
 *   0x00  char[8]  magic "IMFAT\0\0\0"
 *   0x08  u32      version (1)
 *   0x0C  u32      entry count
 *   0x10  u32      id base
 *   0x14  u32      offset of the first data block (= 0x18 + count * 36)
 *   0x18  Entry[count], 36 bytes: flags, id, type[4], relocation count, offset, size, 3 reserved zero words
 *
 * Each data block is followed by its relocation table: `relocationCount` u32 positions of pointer fields inside the
 * block, possibly unaligned and unsorted, each storing an offset relative to the block start.
 */

export const IMFAT_HEADER_BYTES = 0x18;
export const IMFAT_ENTRY_BYTES = 36;
/** P2-03 structural limits, judged before the directory or a data block is read or allocated. */
export const MAX_ARCHIVE_ENTRIES = 4_096;
export const MAX_ENTRY_BYTES = 4_194_304;

const MAGIC = [0x49, 0x4d, 0x46, 0x41, 0x54, 0, 0, 0];

export interface ImfatEntry {
  /** Unknown flags word (U-020), kept as is. */
  readonly flags: number;
  readonly id: number;
  /** One to four characters of `[A-Z0-9]` with the NUL padding removed, such as "MESH". */
  readonly type: string;
  readonly relocationCount: number;
  /** Data block offset from the start of the archive. */
  readonly offset: number;
  /** Data block size in bytes, excluding the relocation table. */
  readonly size: number;
}

export interface ImfatHeader {
  readonly version: 1;
  readonly count: number;
  readonly idBase: number;
  readonly dataStart: number;
}

/** `archive` for in-memory bytes, or `archive:/PATH` for an archive read from a disc path. */
export const archiveLocation = (path: DiscPath | null): string => (path === null ? 'archive' : `archive:/${path}`);

/** Whether `type` is a type tag of the supported grammar, as reported in directory entries. */
export const isImfatType = (type: unknown): type is string => matchesWhole(type, /^[A-Z0-9]{1,4}$/);

/** Bytes `[offset, offset + span)` of the whole entry: its data block followed by its relocation table. */
export const entrySpan = (entry: ImfatEntry): number => entry.size + entry.relocationCount * 4;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Reads the 24-byte header of an archive of `fileLength` bytes; `header` holds its first `min(24, fileLength)` bytes. */
export function readImfatHeader(header: Uint8Array, fileLength: number, path: DiscPath | null): ImfatHeader {
  const at = archiveLocation(path);
  if (fileLength < IMFAT_HEADER_BYTES || header.length < IMFAT_HEADER_BYTES) {
    throw new SourceError('invalid-archive', at, 'the file is too small for an IMFAT header');
  }
  if (MAGIC.some((byte, index) => header[index] !== byte)) throw new SourceError('invalid-archive', at, 'the IMFAT magic is wrong');
  const fields = view(header);
  if (fields.getUint32(0x08, true) !== 1) throw new SourceError('invalid-archive', at, 'the archive version is not 1');
  const count = fields.getUint32(0x0c, true);
  if (count === 0) throw new SourceError('invalid-archive', at, 'the archive has no entries');
  if (count > MAX_ARCHIVE_ENTRIES) {
    throw new SourceError('limit-exceeded', at, 'the archive has too many entries', { name: 'archiveEntries', limit: MAX_ARCHIVE_ENTRIES, observed: count });
  }
  const dataStart = fields.getUint32(0x14, true);
  if (dataStart !== IMFAT_HEADER_BYTES + count * IMFAT_ENTRY_BYTES) {
    throw new SourceError('invalid-archive', at, 'the first data block does not follow the directory');
  }
  if (fileLength < dataStart) throw new SourceError('invalid-archive', at, 'the file is shorter than the directory');
  return Object.freeze({ version: 1, count, idBase: fields.getUint32(0x10, true), dataStart });
}

/** Reads the type tag at `offset`, or null unless it is 1–4 of `[A-Z0-9]` followed only by NUL padding. */
function readType(bytes: Uint8Array, offset: number): string | null {
  let type = '';
  for (let index = 0; index < 4; index++) {
    const byte = bytes[offset + index];
    if (byte === 0) {
      if (type === '' || bytes.subarray(offset + index, offset + 4).some(rest => rest !== 0)) return null;
      return type;
    }
    if (!((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x30 && byte <= 0x39))) return null;
    type += String.fromCharCode(byte);
  }
  return type;
}

/**
 * Reads and validates the whole directory, `header.count * 36` bytes following the header. Entries are checked in
 * directory order, each field in order; trailing bytes after the last entry are checked once every entry passed.
 */
export function readImfatDirectory(header: ImfatHeader, directory: Uint8Array, fileLength: number, path: DiscPath | null): readonly ImfatEntry[] {
  const at = archiveLocation(path);
  if (directory.length !== header.count * IMFAT_ENTRY_BYTES) throw new SourceError('invalid-archive', at, 'the directory is incomplete');
  const fields = view(directory);
  const entries: ImfatEntry[] = [];
  let expectedOffset = header.dataStart;
  let previousId = header.idBase;
  for (let index = 0; index < header.count; index++) {
    const o = index * IMFAT_ENTRY_BYTES;
    const where = `${at}[${index}]`;
    if (fields.getUint32(o + 24, true) !== 0 || fields.getUint32(o + 28, true) !== 0 || fields.getUint32(o + 32, true) !== 0) {
      throw new SourceError('invalid-archive', where, 'a reserved directory word is not zero');
    }
    const type = readType(directory, o + 8);
    if (type === null) throw new SourceError('invalid-archive', where, 'the type tag is not 1-4 upper-case letters or digits');
    const id = fields.getUint32(o + 4, true);
    if (id <= previousId) throw new SourceError('invalid-archive', where, 'the entry ID is not above the ID base and the previous ID');
    const size = fields.getUint32(o + 20, true);
    if (size === 0) throw new SourceError('invalid-archive', where, 'the data block is empty');
    if (size > MAX_ENTRY_BYTES) {
      throw new SourceError('limit-exceeded', where, 'the data block is too large', { name: 'entryBytes', limit: MAX_ENTRY_BYTES, observed: size });
    }
    const relocationCount = fields.getUint32(o + 12, true);
    if (relocationCount > Math.floor(size / 4)) throw new SourceError('invalid-archive', where, 'the block cannot hold that many relocations');
    const offset = fields.getUint32(o + 16, true);
    if (offset !== expectedOffset) throw new SourceError('invalid-archive', where, 'the data block is not contiguous with the previous one');
    const entry: ImfatEntry = Object.freeze({ flags: fields.getUint32(o, true), id, type, relocationCount, offset, size });
    if (entrySpan(entry) > fileLength - offset) throw new SourceError('invalid-archive', where, 'the entry extends past the file');
    entries.push(entry);
    expectedOffset = offset + entrySpan(entry);
    previousId = id;
  }
  if (expectedOffset !== fileLength) throw new SourceError('invalid-archive', at, 'bytes follow the last entry');
  return Object.freeze(entries);
}

/**
 * Validates the relocation table of `entry` and returns its positions in table order. `span` holds the entry's data
 * block followed by its relocation table. Positions and stored pointers are checked in table order; overlaps are checked
 * once all pass, reporting the later member of the first overlapping pair in position order (the larger table index
 * for equal positions).
 */
export function readImfatRelocations(entry: ImfatEntry, span: Uint8Array, path: DiscPath | null): readonly number[] {
  const where = `${archiveLocation(path)}#${entry.id}`;
  if (span.length !== entrySpan(entry)) throw new SourceError('invalid-entry', where, 'the entry bytes are incomplete');
  const fields = view(span);
  const positions: number[] = [];
  for (let index = 0; index < entry.relocationCount; index++) {
    const position = fields.getUint32(entry.size + index * 4, true);
    if (entry.size < 4 || position > entry.size - 4) {
      throw new SourceError('invalid-entry', `${where}.relocations[${index}]`, 'the relocation lies outside the data block');
    }
    if (fields.getUint32(position, true) > entry.size) {
      throw new SourceError('invalid-entry', `${where}.relocations[${index}]`, 'the stored pointer lies past the data block');
    }
    positions.push(position);
  }
  // Sort by position, then table index, in one native numeric sort: positions are below 2^22 and indexes below 2^20.
  const keys = Float64Array.from(positions, (position, index) => position * 0x100000 + index).sort();
  for (let rank = 1; rank < keys.length; rank++) {
    if (Math.floor(keys[rank] / 0x100000) - Math.floor(keys[rank - 1] / 0x100000) < 4) {
      throw new SourceError('invalid-entry', `${where}.relocations[${keys[rank] % 0x100000}]`, 'the relocation overlaps another one');
    }
  }
  return Object.freeze(positions);
}
