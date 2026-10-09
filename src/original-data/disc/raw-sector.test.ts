import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { sectorImageSource, SYNTHETIC_RAW_SECTOR_BYTES as RAW, SYNTHETIC_SECTOR_DATA_BYTES } from '../synthetic.test-support.ts';
import { failure, failureOf } from './disc.test-support.ts';
import { readSectors } from './raw-sector.ts';
import { snapshotSource, SourceReader } from './source-reader.ts';

const SECTORS = 4_600;
const dataOf = (lba: number): Uint8Array => Uint8Array.from({ length: SYNTHETIC_SECTOR_DATA_BYTES }, (_, index) => (lba * 7 + index) % 251);

function read(lba: number, count: number, edit?: (lba: number, raw: Uint8Array) => void) {
  const image = sectorImageSource(SECTORS, dataOf, edit);
  const reader = new SourceReader(Object.freeze({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: Number.MAX_SAFE_INTEGER }));
  return { image, sectors: () => readSectors(reader, snapshotSource(image, 'image'), lba, count) };
}

/** Rewrites the BCD minute, second and frame bytes of one raw sector. */
const address = (target: number, bytes: readonly [number, number, number]) => (lba: number, raw: Uint8Array): void => {
  if (lba === target) raw.set(bytes, 12);
};

describe('raw sectors', () => {
  it('returns the user data of each sector from one port request', async () => {
    const { image, sectors } = read(16, 3);
    expect(await sectors()).toEqual([dataOf(16), dataOf(17), dataOf(18)]);
    expect(image.requests).toEqual([{ offset: 16 * RAW, length: 3 * RAW }]);
  });

  it.each([
    ['a fractional count', 16, 0.5],
    ['an empty count', 16, 0],
    ['a fractional LBA', 16.5, 1],
    ['a negative LBA', -1, 1],
    ['an unsafe LBA', Number.MAX_SAFE_INTEGER + 1, 1],
  ])('rejects %s before reading', async (_case, lba, count) => {
    const { image, sectors } = read(lba, count);
    expect(await failure(sectors)).toEqual(failureOf('invalid-range', 'image'));
    expect(image.requests).toEqual([]);
  });

  it('checks only the sectors it reads', async () => {
    const { sectors } = read(16, 2, (lba, raw) => { if (lba === 18) raw.fill(0); });
    expect(await sectors()).toHaveLength(2);
  });

  it.each([
    ['a first sync byte', (raw: Uint8Array) => { raw[0] = 1; }],
    ['a middle sync byte', (raw: Uint8Array) => { raw[5] = 0; }],
    ['a last sync byte', (raw: Uint8Array) => { raw[11] = 0xff; }],
    ['mode 2', (raw: Uint8Array) => { raw[15] = 2; }],
    ['mode 0', (raw: Uint8Array) => { raw[15] = 0; }],
    ['the address of another sector', (raw: Uint8Array) => { raw[14] = 0x18; }],
    ['a non-BCD minute', (raw: Uint8Array) => { raw[12] = 0x0a; }],
  ])('rejects %s with the LBA of the bad sector', async (_case, corrupt) => {
    const { sectors } = read(16, 3, (lba, raw) => { if (lba === 17) corrupt(raw); });
    expect(await failure(sectors)).toEqual(failureOf('invalid-sector', 'image:lba 17'));
  });

  it.each([
    // LBA 600 is 00:10:00; 0x0a reads as 10 in binary but is not BCD.
    ['a non-BCD second whose binary value matches', 600, [0x00, 0x0a, 0x00]],
    // LBA 16 is 00:02:16; 00:01:91 is the same frame count with an out-of-range frame.
    ['a frame of 75 or more with a matching frame count', 16, [0x00, 0x01, 0x91]],
    // LBA 4500 is 01:02:00; 00:62:00 is the same frame count with an out-of-range second.
    ['a second of 60 or more with a matching frame count', 4_500, [0x00, 0x62, 0x00]],
  ] as const)('rejects %s', async (_case, lba, bytes) => {
    expect(await failure(read(lba, 1, address(lba, bytes)).sectors)).toEqual(failureOf('invalid-sector', `image:lba ${lba}`));
  });
});
