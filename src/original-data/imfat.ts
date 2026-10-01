/**
 * Parser for Interactive Magic "IMFAT" archives (the `.NOB` files of Star Rangers).
 *
 * Layout (little-endian, see docs/original/formats/imfat.md):
 *   0x00  char[8]  magic "IMFAT\0\0\0"
 *   0x08  u32      version (1)
 *   0x0C  u32      entry count
 *   0x10  u32      id base (e.g. 10000 for SR.NOB)
 *   0x14  u32      offset of the first data block (= 0x18 + count * 36)
 *   0x18  Entry[count], 36 bytes each
 *
 * Each data block is a serialized struct whose internal pointers are stored as
 * offsets relative to the block start. It is followed by `relocationCount` u32
 * values, each the (unaligned) position of such a pointer inside the block.
 */

export const IMFAT_MAGIC = 'IMFAT';
const HEADER_SIZE = 0x18;
const ENTRY_SIZE = 36;

export interface ImfatEntry {
  /** Unknown flags word; observed values 0, 0x10, 0x50. */
  flags: number;
  id: number;
  /** Four-character type tag with trailing NULs removed, e.g. "MESH". */
  type: string;
  relocationCount: number;
  offset: number;
  size: number;
}

export interface ImfatArchive {
  version: number;
  idBase: number;
  dataStart: number;
  entries: ImfatEntry[];
}

export class ImfatError extends Error {}

export function parseImfat(bytes: Uint8Array): ImfatArchive {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < HEADER_SIZE) throw new ImfatError('file too small for IMFAT header');

  const magic = String.fromCharCode(...bytes.subarray(0, 5));
  if (magic !== IMFAT_MAGIC) throw new ImfatError('missing IMFAT magic');

  const version = view.getUint32(0x08, true);
  const count = view.getUint32(0x0c, true);
  const idBase = view.getUint32(0x10, true);
  const dataStart = view.getUint32(0x14, true);

  const tableEnd = HEADER_SIZE + count * ENTRY_SIZE;
  if (tableEnd > bytes.byteLength) throw new ImfatError('entry table exceeds file size');
  if (dataStart !== tableEnd) throw new ImfatError(`unexpected data start ${dataStart}, expected ${tableEnd}`);

  const entries: ImfatEntry[] = [];
  for (let i = 0; i < count; i++) {
    const o = HEADER_SIZE + i * ENTRY_SIZE;
    const entry: ImfatEntry = {
      flags: view.getUint32(o, true),
      id: view.getUint32(o + 4, true),
      type: String.fromCharCode(...bytes.subarray(o + 8, o + 12)).replace(/\0+$/, ''),
      relocationCount: view.getUint32(o + 12, true),
      offset: view.getUint32(o + 16, true),
      size: view.getUint32(o + 20, true),
    };
    const end = entry.offset + entry.size + entry.relocationCount * 4;
    if (entry.offset < dataStart || end > bytes.byteLength) {
      throw new ImfatError(`entry ${entry.id} (${entry.type}) is out of bounds`);
    }
    entries.push(entry);
  }
  return { version, idBase, dataStart, entries };
}

export function entryData(bytes: Uint8Array, entry: ImfatEntry): Uint8Array {
  return bytes.subarray(entry.offset, entry.offset + entry.size);
}

/** Positions (relative to the block start) of internal pointers in an entry. */
export function entryRelocations(bytes: Uint8Array, entry: ImfatEntry): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = entry.offset + entry.size;
  const result: number[] = [];
  for (let i = 0; i < entry.relocationCount; i++) {
    const position = view.getUint32(base + i * 4, true);
    if (position + 4 > entry.size) {
      throw new ImfatError(`entry ${entry.id} relocation ${i} points outside the block`);
    }
    result.push(position);
  }
  return result;
}
