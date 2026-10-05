import { RAW_SECTOR_BYTES } from './clone-cd.ts';
import { DiscReadError } from './disc-error.ts';
import type { SourceReader, SourceSnapshot } from './source-reader.ts';

// Raw MODE1 sectors (P2-02 S-03): image sector n is LBA n, and its 2,048 user data bytes are at [16, 2064).

export const SECTOR_DATA_BYTES = 2_048;
const USER_DATA_OFFSET = 16;
const SYNC = Uint8Array.of(0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00);
const MSF_OFFSET = 150;

export const lbaAt = (lba: number): string => `image:lba ${lba}`;

/** A BCD byte's value, or -1 when either nibble is not a decimal digit. */
const bcd = (byte: number): number => ((byte >> 4) <= 9 && (byte & 0x0f) <= 9 ? (byte >> 4) * 10 + (byte & 0x0f) : -1);

/** The reason a raw sector header is invalid, or undefined when it is a MODE1 header for `lba`. */
function headerProblem(raw: Uint8Array, start: number, lba: number): string | undefined {
  for (let index = 0; index < SYNC.length; index++) {
    if (raw[start + index] !== SYNC[index]) return 'the sector sync pattern is wrong';
  }
  const minute = bcd(raw[start + 12]);
  const second = bcd(raw[start + 13]);
  const frame = bcd(raw[start + 14]);
  if (minute < 0 || second < 0 || frame < 0 || second >= 60 || frame >= 75 || (minute * 60 + second) * 75 + frame !== lba + MSF_OFFSET) {
    return 'the sector header address does not match its position';
  }
  return raw[start + 15] === 1 ? undefined : 'the sector is not MODE1';
}

/**
 * Reads `count` consecutive raw sectors from `lba` in one port request and checks every header before returning their
 * user data. The views share the request's buffer, which the port may reuse after the next read, so callers copy
 * whatever they keep across an await.
 */
export async function readSectors(reader: SourceReader, image: SourceSnapshot, lba: number, count: number): Promise<Uint8Array[]> {
  if (!Number.isSafeInteger(lba) || lba < 0 || !Number.isSafeInteger(count) || count < 1) {
    throw new DiscReadError('invalid-range', 'image', 'a sector read needs a nonnegative LBA and a positive sector count');
  }
  const raw = await reader.read(image, lba * RAW_SECTOR_BYTES, count * RAW_SECTOR_BYTES, lbaAt(lba));
  const sectors = new Array<Uint8Array>(count);
  for (let index = 0, start = 0; index < count; index++, start += RAW_SECTOR_BYTES) {
    const problem = headerProblem(raw, start, lba + index);
    if (problem) throw new DiscReadError('invalid-sector', lbaAt(lba + index), problem);
    sectors[index] = raw.subarray(start + USER_DATA_OFFSET, start + USER_DATA_OFFSET + SECTOR_DATA_BYTES);
  }
  return sectors;
}
