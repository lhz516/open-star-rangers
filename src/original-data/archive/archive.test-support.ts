import type { SourceErrorCode, SourceLimit } from '../source-error.ts';
import { buildImfat, type SyntheticEntry } from '../synthetic.test-support.ts';
import { IMFAT_ENTRY_BYTES, IMFAT_HEADER_BYTES, MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES, type ImfatEntry } from './imfat-rules.ts';

/** Marker planted in block bytes; it must never reach a diagnostic. */
export const BLOCK_MARKER = 'PRIVATE-BLOCK-MARKER-41c9';

export interface SampleFailure {
  readonly code: SourceErrorCode;
  /** Location after the archive location (`archive` or `archive:/PATH`), such as `[2]` or `#10001.relocations[0]`. */
  readonly at: string;
  readonly limit: SourceLimit | null;
}

export interface SampleRead {
  readonly id: number;
  readonly relocations?: readonly number[];
  readonly failure?: SampleFailure;
}

/** One archive and its expected reading result, shared by the in-memory and on-demand tests (P2-03 AC-03). */
export interface ArchiveSample {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly open: { readonly entries: readonly ImfatEntry[] } | { readonly failure: SampleFailure };
  readonly reads: readonly SampleRead[];
}

const failure = (code: SourceErrorCode, at: string, limit: SourceLimit | null = null): SampleFailure => ({ code, at, limit });
const invalidArchive = (at = '') => failure('invalid-archive', at);
const invalidRelocation = (index: number) => failure('invalid-entry', `#10001.relocations[${index}]`);

/** Directory field offsets inside one 36-byte entry. */
const FIELD = { flags: 0, id: 4, type: 8, relocationCount: 12, offset: 16, size: 20, reserved: 24 } as const;
const fieldOffset = (index: number, field: number): number => IMFAT_HEADER_BYTES + index * IMFAT_ENTRY_BYTES + field;

/** A copy of `bytes` with little-endian u32 `value` written at `offset`. */
function withU32(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = bytes.slice();
  new DataView(copy.buffer).setUint32(offset, value, true);
  return copy;
}

/** A copy of `bytes` with `values` written from `offset`. */
function withBytes(bytes: Uint8Array, offset: number, values: ArrayLike<number>): Uint8Array {
  const copy = bytes.slice();
  copy.set(Array.from(values), offset);
  return copy;
}

/** A block of `size` bytes holding `marker` text and u32 `pointers` at the given positions. */
export function block(size: number, pointers: Readonly<Record<number, number>> = {}, marker = ''): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(Array.from(marker.slice(0, size), char => char.charCodeAt(0)));
  const fields = new DataView(bytes.buffer);
  for (const [position, value] of Object.entries(pointers)) fields.setUint32(Number(position), value, true);
  return bytes;
}

/** The entries `buildImfat(idBase, entries)` lays out, as the reader must report them. */
function expectedEntries(entries: readonly SyntheticEntry[]): ImfatEntry[] {
  let offset = IMFAT_HEADER_BYTES + entries.length * IMFAT_ENTRY_BYTES;
  return entries.map(({ id, type, flags = 0, data, relocations = [] }) => {
    const entry = { flags, id, type, relocationCount: relocations.length, offset, size: data.length };
    offset += data.length + relocations.length * 4;
    return entry;
  });
}

const BASE_ID = 10_000;

/**
 * Shaped like the baseline archives: contiguous blocks, the first ID at base + 1, 1-4 character tags with digits, flags
 * kept as is, unaligned and unsorted relocations, and stored pointers of 0 and the block size.
 */
export const BASE_ENTRIES: readonly SyntheticEntry[] = [
  { id: 10_001, type: 'TEX', data: block(12, { 0: 8 }, ''), relocations: [0] },
  { id: 10_003, type: 'MESH', flags: 0x10, data: block(20, { 1: 20, 6: 0, 12: 4 }), relocations: [6, 1, 12] },
  { id: 10_006, type: 'M2ID', flags: 0x50, data: block(8) },
  { id: 10_007, type: 'A', flags: 0xdeadbeef, data: block(4) },
  { id: 10_011, type: 'B2', data: block(32, {}, BLOCK_MARKER) },
  { id: 10_013, type: '1234', data: block(9) },
];
export const BASE_ARCHIVE = buildImfat(BASE_ID, [...BASE_ENTRIES]);
const LAST = BASE_ENTRIES.length - 1;
const DATA_START = IMFAT_HEADER_BYTES + BASE_ENTRIES.length * IMFAT_ENTRY_BYTES;

const baseReads: SampleRead[] = [
  { id: 10_001, relocations: [0] },
  { id: 10_003, relocations: [6, 1, 12] },
  { id: 10_006, relocations: [] },
];

const rejectOpen = (name: string, bytes: Uint8Array, expected: SampleFailure): ArchiveSample => ({ name, bytes, open: { failure: expected }, reads: [] });

/** One 12-byte TEX entry, zeroed (pointers 0) unless `data` is given, whose read must fail. */
function rejectRead(name: string, relocations: number[], expected: SampleFailure, data = block(12)): ArchiveSample {
  const entries = [{ id: 10_001, type: 'TEX', data, relocations }];
  return { name, bytes: buildImfat(BASE_ID, entries), open: { entries: expectedEntries(entries) }, reads: [{ id: 10_001, failure: expected }] };
}
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function manyEntries(count: number): SyntheticEntry[] {
  return Array.from({ length: count }, (_, index) => ({ id: BASE_ID + 1 + index, type: 'DATA', data: Uint8Array.of(index & 0xff) }));
}

const maximumEntries = manyEntries(MAX_ARCHIVE_ENTRIES);
const largestBlock: SyntheticEntry[] = [{ id: 10_001, type: 'BITM', data: block(MAX_ENTRY_BYTES, { [MAX_ENTRY_BYTES - 4]: MAX_ENTRY_BYTES }), relocations: [MAX_ENTRY_BYTES - 4] }];

export const ARCHIVE_SAMPLES: readonly ArchiveSample[] = [
  { name: 'a baseline-shaped archive', bytes: BASE_ARCHIVE, open: { entries: expectedEntries(BASE_ENTRIES) }, reads: baseReads },
  { name: `${MAX_ARCHIVE_ENTRIES} entries`, bytes: buildImfat(BASE_ID, maximumEntries), open: { entries: expectedEntries(maximumEntries) }, reads: [{ id: BASE_ID + MAX_ARCHIVE_ENTRIES, relocations: [] }] },
  { name: 'the largest data block', bytes: buildImfat(BASE_ID, largestBlock), open: { entries: expectedEntries(largestBlock) }, reads: [{ id: 10_001, relocations: [MAX_ENTRY_BYTES - 4] }] },

  // Header, in field order.
  rejectOpen('a file shorter than the header', BASE_ARCHIVE.subarray(0, IMFAT_HEADER_BYTES - 1), invalidArchive()),
  ...Array.from({ length: 8 }, (_, index) => rejectOpen(`magic byte ${index} changed`, withBytes(BASE_ARCHIVE, index, [BASE_ARCHIVE[index] ^ 0x20]), invalidArchive())),
  rejectOpen('version 2', withU32(BASE_ARCHIVE, 0x08, 2), invalidArchive()),
  rejectOpen('no entries', withU32(BASE_ARCHIVE, 0x0c, 0), invalidArchive()),
  rejectOpen(`${MAX_ARCHIVE_ENTRIES + 1} entries`, withU32(BASE_ARCHIVE, 0x0c, MAX_ARCHIVE_ENTRIES + 1), failure('limit-exceeded', '', { name: 'archiveEntries', limit: MAX_ARCHIVE_ENTRIES, observed: MAX_ARCHIVE_ENTRIES + 1 })),
  rejectOpen('the largest u32 entry count', withU32(BASE_ARCHIVE, 0x0c, 0xffffffff), failure('limit-exceeded', '', { name: 'archiveEntries', limit: MAX_ARCHIVE_ENTRIES, observed: 0xffffffff })),
  rejectOpen('a first data block offset off by one', withU32(BASE_ARCHIVE, 0x14, DATA_START + 1), invalidArchive()),
  rejectOpen('the largest u32 first data block offset', withU32(BASE_ARCHIVE, 0x14, 0xffffffff), invalidArchive()),
  rejectOpen('a file shorter than the directory', BASE_ARCHIVE.subarray(0, DATA_START - 1), invalidArchive()),

  // Directory entries, each field in order.
  ...[0, 4, 8].map(word => rejectOpen(`reserved word at +${24 + word}`, withU32(BASE_ARCHIVE, fieldOffset(1, FIELD.reserved + word), 1), invalidArchive('[1]'))),
  rejectOpen('an empty type tag', withBytes(BASE_ARCHIVE, fieldOffset(1, FIELD.type), [0, 0, 0, 0]), invalidArchive('[1]')),
  rejectOpen('a lower-case type tag', withBytes(BASE_ARCHIVE, fieldOffset(1, FIELD.type), [0x70, 0x72, 0x69, 0x76]), invalidArchive('[1]')),
  rejectOpen('a NUL inside the type tag', withBytes(BASE_ARCHIVE, fieldOffset(1, FIELD.type), [0x41, 0, 0x42, 0]), invalidArchive('[1]')),
  rejectOpen('a character after the NUL padding', withBytes(BASE_ARCHIVE, fieldOffset(1, FIELD.type), [0x41, 0x42, 0, 0x43]), invalidArchive('[1]')),
  rejectOpen('a non-ASCII type tag', withBytes(BASE_ARCHIVE, fieldOffset(1, FIELD.type), [0x41, 0xc3, 0x89, 0]), invalidArchive('[1]')),
  rejectOpen('an ID equal to the base', withU32(BASE_ARCHIVE, fieldOffset(0, FIELD.id), BASE_ID), invalidArchive('[0]')),
  rejectOpen('an ID equal to the previous one', withU32(BASE_ARCHIVE, fieldOffset(1, FIELD.id), 10_001), invalidArchive('[1]')),
  rejectOpen('a decreasing ID', withU32(BASE_ARCHIVE, fieldOffset(2, FIELD.id), 10_002), invalidArchive('[2]')),
  rejectOpen('an empty data block', withU32(BASE_ARCHIVE, fieldOffset(2, FIELD.size), 0), invalidArchive('[2]')),
  rejectOpen('a data block one byte over the limit', withU32(BASE_ARCHIVE, fieldOffset(2, FIELD.size), MAX_ENTRY_BYTES + 1), failure('limit-exceeded', '[2]', { name: 'entryBytes', limit: MAX_ENTRY_BYTES, observed: MAX_ENTRY_BYTES + 1 })),
  rejectOpen('the largest u32 data block', withU32(BASE_ARCHIVE, fieldOffset(2, FIELD.size), 0xffffffff), failure('limit-exceeded', '[2]', { name: 'entryBytes', limit: MAX_ENTRY_BYTES, observed: 0xffffffff })),
  rejectOpen('more relocations than the block can hold', withU32(BASE_ARCHIVE, fieldOffset(0, FIELD.relocationCount), 4), invalidArchive('[0]')),
  rejectOpen('the largest u32 relocation count', withU32(BASE_ARCHIVE, fieldOffset(0, FIELD.relocationCount), 0xffffffff), invalidArchive('[0]')),
  rejectOpen('a first block after the directory gap', withU32(BASE_ARCHIVE, fieldOffset(0, FIELD.offset), DATA_START + 4), invalidArchive('[0]')),
  rejectOpen('a gap between blocks', withU32(BASE_ARCHIVE, fieldOffset(1, FIELD.offset), view(BASE_ARCHIVE).getUint32(fieldOffset(1, FIELD.offset), true) + 1), invalidArchive('[1]')),
  rejectOpen('overlapping blocks', withU32(BASE_ARCHIVE, fieldOffset(1, FIELD.offset), view(BASE_ARCHIVE).getUint32(fieldOffset(1, FIELD.offset), true) - 1), invalidArchive('[1]')),
  rejectOpen('the largest u32 block offset', withU32(BASE_ARCHIVE, fieldOffset(1, FIELD.offset), 0xffffffff), invalidArchive('[1]')),
  rejectOpen('the last entry past the file', BASE_ARCHIVE.subarray(0, BASE_ARCHIVE.length - 1), invalidArchive(`[${LAST}]`)),
  rejectOpen('one trailing byte', Uint8Array.of(...BASE_ARCHIVE, 0), invalidArchive()),

  // Several faults at once: each pair is reported differently by any other check order.
  rejectOpen('a wrong magic before too many entries', withU32(withBytes(BASE_ARCHIVE, 0, [0]), 0x0c, MAX_ARCHIVE_ENTRIES + 1), invalidArchive()),
  rejectOpen('a wrong version before too many entries', withU32(withU32(BASE_ARCHIVE, 0x08, 2), 0x0c, MAX_ARCHIVE_ENTRIES + 1), invalidArchive()),
  rejectOpen('too many entries before a wrong first block offset', withU32(withU32(BASE_ARCHIVE, 0x14, 0), 0x0c, MAX_ARCHIVE_ENTRIES + 1), failure('limit-exceeded', '', { name: 'archiveEntries', limit: MAX_ARCHIVE_ENTRIES, observed: MAX_ARCHIVE_ENTRIES + 1 })),
  rejectOpen('an earlier entry before a later one', withU32(withBytes(BASE_ARCHIVE, fieldOffset(0, FIELD.type), [0x61, 0, 0, 0]), fieldOffset(1, FIELD.reserved), 1), invalidArchive('[0]')),
  rejectOpen('a reserved word before an oversized block', withU32(withU32(BASE_ARCHIVE, fieldOffset(2, FIELD.size), MAX_ENTRY_BYTES + 1), fieldOffset(2, FIELD.reserved + 8), 1), invalidArchive('[2]')),
  rejectOpen('a type tag before an oversized block', withU32(withBytes(BASE_ARCHIVE, fieldOffset(2, FIELD.type), [0, 0, 0, 0]), fieldOffset(2, FIELD.size), MAX_ENTRY_BYTES + 1), invalidArchive('[2]')),
  rejectOpen('an oversized block before a wrong offset', withU32(withU32(BASE_ARCHIVE, fieldOffset(2, FIELD.offset), 0), fieldOffset(2, FIELD.size), MAX_ENTRY_BYTES + 1), failure('limit-exceeded', '[2]', { name: 'entryBytes', limit: MAX_ENTRY_BYTES, observed: MAX_ENTRY_BYTES + 1 })),
  rejectOpen('an entry fault before trailing bytes', withU32(Uint8Array.of(...BASE_ARCHIVE, 0), fieldOffset(3, FIELD.reserved), 1), invalidArchive('[3]')),

  // Relocations: position and stored pointer in table order, then overlaps.
  rejectRead('a relocation three bytes before the block end', [0, 9], invalidRelocation(1)),
  rejectRead('the largest u32 relocation position', [0xffffffff], invalidRelocation(0)),
  rejectRead('a stored pointer one past the block', [4], invalidRelocation(0), block(12, { 4: 13 }, BLOCK_MARKER.slice(0, 4))),
  rejectRead('a repeated relocation', [0, 4, 0], invalidRelocation(2)),
  ...[1, 2, 3].map(distance => rejectRead(`relocations ${distance} bytes apart`, [4, 0, distance], invalidRelocation(2))),
  rejectRead('a pointer error before an earlier overlap', [0, 0, 8], invalidRelocation(2), block(12, { 8: 13 })),
  rejectRead('an earlier pointer error before a later position error', [4, 9], invalidRelocation(0), block(12, { 4: 13 })),
];
