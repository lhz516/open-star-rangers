import { DiscReadError } from './disc-error.ts';
import {
  ASSOCIATED_FLAG, bothEndian16, bothEndian32, DIRECTORY_FLAG, extentFits, MAX_DIRECTORY_BYTES, MIN_RECORD_BYTES, readDirectoryRecord,
  unsupportedFeature,
} from './iso9660-record.ts';
import { lbaAt, readSectors, SECTOR_DATA_BYTES } from './raw-sector.ts';
import type { SourceReader, SourceSnapshot } from './source-reader.ts';

// ISO9660 volume (P2-02 S-04): the volume descriptor sequence from LBA 16 and its single primary volume descriptor.

const FIRST_DESCRIPTOR_LBA = 16;
const MAX_DESCRIPTORS = 16;
const STANDARD_IDENTIFIER = [0x43, 0x44, 0x30, 0x30, 0x31]; // "CD001"
const PRIMARY = 1;
const PARTITION = 3;
const TERMINATOR = 255;
const ROOT_RECORD_OFFSET = 156;

/** The root directory's extent as stated by the primary volume descriptor. */
export interface RootDirectory {
  readonly firstSector: number;
  readonly byteLength: number;
}

export interface Volume {
  readonly volumeSectors: number;
  readonly root: RootDirectory;
}

const invalid = (location: string, reason: string): DiscReadError => new DiscReadError('invalid-volume', location, reason);

/**
 * Reads volume descriptors one sector at a time from LBA 16 up to the terminator, so only descriptor sectors are read.
 * Boot (0), supplementary (2) and partition (3) descriptors are skipped; exactly one primary descriptor must precede
 * the terminator.
 */
export async function readVolume(reader: SourceReader, image: SourceSnapshot, sectorCount: number): Promise<Volume> {
  let primary: { readonly lba: number; readonly descriptor: Uint8Array } | undefined;
  const lastLba = Math.min(FIRST_DESCRIPTOR_LBA + MAX_DESCRIPTORS, sectorCount) - 1;
  for (let lba = FIRST_DESCRIPTOR_LBA; lba <= lastLba; lba++) {
    const [descriptor] = await readSectors(reader, image, lba, 1);
    if (STANDARD_IDENTIFIER.some((byte, index) => descriptor[1 + index] !== byte)) throw invalid(`${lbaAt(lba)}/identifier`, 'is not CD001');
    if (descriptor[6] !== 1) throw invalid(`${lbaAt(lba)}/version`, 'must be 1');
    const type = descriptor[0];
    if (type === TERMINATOR) {
      if (!primary) throw invalid(lbaAt(lba), 'no primary volume descriptor precedes the terminator');
      return checkPrimary(primary.descriptor, primary.lba, lba, sectorCount);
    }
    if (type === PRIMARY) {
      if (primary) throw invalid(`${lbaAt(lba)}/type`, 'repeats the primary volume descriptor');
      // A copy: the port may reuse its buffer for the next read.
      primary = { lba, descriptor: descriptor.slice() };
    } else if (type > PARTITION) {
      throw invalid(`${lbaAt(lba)}/type`, 'is not a supported volume descriptor type');
    }
  }
  throw invalid(lbaAt(lastLba), 'the volume descriptor sequence has no terminator within its limit');
}

function checkPrimary(descriptor: Uint8Array, lba: number, terminatorLba: number, sectorCount: number): Volume {
  const at = (field: string): string => `${lbaAt(lba)}/${field}`;
  const volumeSectors = bothEndian32(descriptor, 80);
  if (volumeSectors === undefined) throw invalid(at('volumeSpaceSize'), 'has differing byte-order copies');
  if (volumeSectors <= terminatorLba || volumeSectors > sectorCount) {
    throw invalid(at('volumeSpaceSize'), 'must cover the descriptor sequence and fit the image');
  }
  const fields = [['volumeSetSize', 120, 1], ['volumeSequenceNumber', 124, 1], ['logicalBlockSize', 128, SECTOR_DATA_BYTES]] as const;
  for (const [field, offset, expected] of fields) {
    const value = bothEndian16(descriptor, offset);
    if (value === undefined) throw invalid(at(field), 'has differing byte-order copies');
    if (value !== expected) throw invalid(at(field), 'is outside the supported layout');
  }
  // Only the field is checked; the path table itself is never read.
  if (bothEndian32(descriptor, 132) === undefined) throw invalid(at('pathTableSize'), 'has differing byte-order copies');
  if (descriptor[881] !== 1) throw invalid(at('fileStructureVersion'), 'must be 1');
  const root = checkRoot(descriptor, at, volumeSectors);
  if (root.byteLength > MAX_DIRECTORY_BYTES) {
    throw new DiscReadError('limit-exceeded', at('rootDirectory'), 'the root directory is too long', {
      name: 'directoryBytes', limit: MAX_DIRECTORY_BYTES, observed: root.byteLength,
    });
  }
  return Object.freeze({ volumeSectors, root });
}

function checkRoot(descriptor: Uint8Array, at: (field: string) => string, volumeSectors: number): RootDirectory {
  const rootAt = (field: string): string => at(`rootDirectory.${field}`);
  const record = readDirectoryRecord(descriptor, ROOT_RECORD_OFFSET, ROOT_RECORD_OFFSET + MIN_RECORD_BYTES);
  if (typeof record === 'string') throw invalid(rootAt(record), 'is not a valid directory record');
  if (record.recordLength !== MIN_RECORD_BYTES) throw invalid(rootAt('length'), 'must be 34');
  if (record.identifier.length !== 1 || record.identifier[0] !== 0) throw invalid(rootAt('identifier'), 'must be the single byte 0');
  if ((record.flags & DIRECTORY_FLAG) === 0 || (record.flags & ASSOCIATED_FLAG) !== 0) throw invalid(rootAt('flags'), 'must mark a directory');
  const unsupported = unsupportedFeature(record);
  if (unsupported) throw invalid(rootAt(unsupported), 'uses a feature outside the supported layout');
  if (record.dataLength < SECTOR_DATA_BYTES || record.dataLength % SECTOR_DATA_BYTES !== 0) {
    throw invalid(rootAt('dataLength'), 'must be a positive multiple of 2,048');
  }
  if (!extentFits(record.extent, record.dataLength, volumeSectors)) throw invalid(rootAt('extent'), 'must lie inside the volume');
  return Object.freeze({ firstSector: record.extent, byteLength: record.dataLength });
}
