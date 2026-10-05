import { RAW_SECTOR_BYTES } from './clone-cd.ts';
import { DiscReadError } from './disc-error.ts';
import type { DiscEntry } from './iso9660-directory.ts';
import { readSectors, SECTOR_DATA_BYTES } from './raw-sector.ts';
import { isCount, MAX_PORT_READ_BYTES, type SourceReader, type SourceSnapshot } from './source-reader.ts';

// File range reads (P2-02 S-06): only the sectors covering the range, in ascending segments, into an exclusive buffer.

/** The largest single range read; the largest NOB a slice may read whole fits, and larger files are read in parts. */
export const MAX_RANGE_READ_BYTES = 16_777_216;
const SEGMENT_SECTORS = MAX_PORT_READ_BYTES / RAW_SECTOR_BYTES;

/**
 * Reads `[offset, offset + length)` of a resolved file. Checks run in order: range, limit, cancellation, then a budget
 * precheck of every covered raw sector before the result is allocated. Each segment is metered and checked for
 * cancellation before and after it waits, so a cancelled final segment publishes nothing. The result owns a new
 * ArrayBuffer of exactly `length` bytes; an empty range never reads.
 */
export async function readFileRange(
  reader: SourceReader, image: SourceSnapshot, entry: DiscEntry, offset: number, length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const location = `file:/${entry.path}`;
  // Subtraction keeps the bound exact without forming offset + length.
  if (!isCount(offset) || !isCount(length) || offset > entry.byteLength - length) {
    throw new DiscReadError('invalid-range', location, 'the range must be nonnegative safe integers inside the file');
  }
  if (length > MAX_RANGE_READ_BYTES) {
    throw new DiscReadError('limit-exceeded', location, 'the range is too long for one read', {
      name: 'rangeReadBytes', limit: MAX_RANGE_READ_BYTES, observed: length,
    });
  }
  reader.throwIfCancelled(location);
  if (length === 0) return new Uint8Array(0);
  const firstIndex = Math.floor(offset / SECTOR_DATA_BYTES);
  const sectorCount = Math.floor((offset + length - 1) / SECTOR_DATA_BYTES) - firstIndex + 1;
  reader.precheck(sectorCount * RAW_SECTOR_BYTES, location);
  const bytes = new Uint8Array(length);
  for (let segment = 0; segment < sectorCount; segment += SEGMENT_SECTORS) {
    const count = Math.min(SEGMENT_SECTORS, sectorCount - segment);
    const sectors = await readSectors(reader, image, entry.firstSector + firstIndex + segment, count);
    for (let index = 0; index < count; index++) {
      // The file bytes this sector holds, clipped to the range.
      const sectorStart = (firstIndex + segment + index) * SECTOR_DATA_BYTES;
      const from = Math.max(offset, sectorStart);
      const to = Math.min(offset + length, sectorStart + SECTOR_DATA_BYTES);
      bytes.set(sectors[index].subarray(from - sectorStart, to - sectorStart), from - offset);
    }
  }
  return bytes;
}
