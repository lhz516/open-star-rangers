// ISO9660 directory records (ECMA-119 9.1), shared by the root record in the primary volume descriptor and directories.

export const MIN_RECORD_BYTES = 34;
export const MAX_DIRECTORY_BYTES = 65_536;
export const DIRECTORY_FLAG = 0x02;
export const ASSOCIATED_FLAG = 0x04;
/** Record format, protection, the two reserved bits and multi-extent: a resolved target never uses them. */
const UNSUPPORTED_FLAGS = 0x08 | 0x10 | 0x20 | 0x40 | 0x80;

/** Both-byte-order 16-bit field: little-endian then big-endian copies, undefined when they differ. */
export function bothEndian16(bytes: Uint8Array, offset: number): number | undefined {
  const little = bytes[offset] | (bytes[offset + 1] << 8);
  return little === ((bytes[offset + 2] << 8) | bytes[offset + 3]) ? little : undefined;
}

/** Both-byte-order 32-bit field: little-endian then big-endian copies, undefined when they differ. */
export function bothEndian32(bytes: Uint8Array, offset: number): number | undefined {
  const little = (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  const big = ((bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7]) >>> 0;
  return little === big ? little : undefined;
}

export interface DirectoryRecord {
  readonly recordLength: number;
  readonly extendedAttributeLength: number;
  readonly extent: number;
  readonly dataLength: number;
  readonly flags: number;
  readonly fileUnitSize: number;
  readonly interleaveGap: number;
  readonly volumeSequenceNumber: number;
  /** A view of the identifier bytes inside the record. */
  readonly identifier: Uint8Array;
}

/** The record field whose structure is broken. */
type RecordProblem = 'length' | 'extent' | 'dataLength' | 'volumeSequenceNumber' | 'identifier' | 'padding';

/**
 * Reads the non-empty record at `offset`, which must end by `end`. Fields are checked in byte order and the first
 * structural problem is returned instead of a record. System Use bytes after the identifier are not interpreted.
 */
export function readDirectoryRecord(bytes: Uint8Array, offset: number, end: number): DirectoryRecord | RecordProblem {
  if (!(offset >= 0 && offset < end && end <= bytes.length)) return 'length';
  const recordLength = bytes[offset];
  if (recordLength < MIN_RECORD_BYTES || recordLength % 2 !== 0 || recordLength > end - offset) return 'length';
  const extent = bothEndian32(bytes, offset + 2);
  if (extent === undefined) return 'extent';
  const dataLength = bothEndian32(bytes, offset + 10);
  if (dataLength === undefined) return 'dataLength';
  const volumeSequenceNumber = bothEndian16(bytes, offset + 28);
  if (volumeSequenceNumber === undefined) return 'volumeSequenceNumber';
  const nameLength = bytes[offset + 32];
  // An even-length identifier is followed by one padding byte, keeping System Use at an even offset.
  const padded = nameLength % 2 === 0;
  if (nameLength < 1 || 33 + nameLength + (padded ? 1 : 0) > recordLength) return 'identifier';
  if (padded && bytes[offset + 33 + nameLength] !== 0) return 'padding';
  return {
    recordLength,
    extendedAttributeLength: bytes[offset + 1],
    extent,
    dataLength,
    flags: bytes[offset + 25],
    fileUnitSize: bytes[offset + 26],
    interleaveGap: bytes[offset + 27],
    volumeSequenceNumber,
    identifier: bytes.subarray(offset + 33, offset + 33 + nameLength),
  };
}

/** The first feature outside the supported subset that a resolved target uses, if any. */
export function unsupportedFeature(record: DirectoryRecord): 'extendedAttributeLength' | 'flags' | 'interleave' | 'volumeSequenceNumber' | undefined {
  if (record.extendedAttributeLength !== 0) return 'extendedAttributeLength';
  if ((record.flags & UNSUPPORTED_FLAGS) !== 0) return 'flags';
  if (record.fileUnitSize !== 0 || record.interleaveGap !== 0) return 'interleave';
  if (record.volumeSequenceNumber !== 1) return 'volumeSequenceNumber';
  return undefined;
}

/** Whether `byteLength` bytes of 2,048-byte blocks from `firstSector` end inside a volume of `volumeSectors`, in safe arithmetic. */
export function extentFits(firstSector: number, byteLength: number, volumeSectors: number): boolean {
  return Math.ceil(byteLength / 2_048) <= volumeSectors - firstSector;
}
