import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { sha256Fingerprint as sha256 } from '../../content/sha256.ts';
import {
  directoryData, primaryVolumeDescriptor, sectorImageSource, SYNTHETIC_RAW_SECTOR_BYTES as RAW, SyntheticByteSource, volumeDescriptor,
} from '../synthetic.test-support.ts';
import type { CancellationProbe } from './source-reader.ts';
import { openDiscImage } from './disc-image.ts';
import {
  failure, failureOf, fileRecord, parentRecord, requestedLbas, ROOT_LBA, rootRecord, selfRecord, subdirectoryRecord, syntheticDisc,
} from './disc.test-support.ts';

const DIR = 19;
const SMALL = 20;
const SMALL_BYTES = 5_000;
const BIG = 30;
const BIG_BYTES = 16_777_216 + 4_096 + 5;
const SECTORS = BIG + Math.ceil(BIG_BYTES / 2_048) + 2;
const TWO_SEGMENTS = 2_049 * 2_048;

/** File content that differs per file, offset and sector, so misplaced or misordered sectors are caught. */
const fileByte = (firstSector: number, index: number): number => ((index * 7) ^ (firstSector * 31) ^ (Math.floor(index / 2_048) * 13)) & 0xff;
function fileBytes(firstSector: number, offset: number, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) bytes[index] = fileByte(firstSector, offset + index);
  return bytes;
}

const directories = new Map([
  [ROOT_LBA, directoryData([
    selfRecord(ROOT_LBA), parentRecord(ROOT_LBA), subdirectoryRecord('DIR', DIR), fileRecord('SMALL.DAT;1', SMALL, SMALL_BYTES),
    fileRecord('BIG.DAT;1', BIG, BIG_BYTES), fileRecord('EMPTY.DAT;1', 0, 0),
  ])],
  [DIR, directoryData([selfRecord(DIR), parentRecord(ROOT_LBA)])],
]);

function userData(lba: number): Uint8Array | undefined {
  if (lba === 16) return primaryVolumeDescriptor(SECTORS, rootRecord());
  if (lba === 17) return volumeDescriptor(255);
  const directory = directories.get(lba);
  if (directory) return directory;
  for (const [first, bytes] of [[SMALL, SMALL_BYTES], [BIG, BIG_BYTES]]) {
    if (lba >= first && lba < first + Math.ceil(bytes / 2_048)) return fileBytes(first, (lba - first) * 2_048, 2_048);
  }
  return undefined;
}

interface DiscOptions {
  readonly limits?: number;
  readonly cancellation?: CancellationProbe;
  /** Image requests at or after this byte offset wait until released. */
  readonly holdFrom?: number;
  readonly edit?: (lba: number, raw: Uint8Array) => void;
}

async function openSmallAndBig(options: DiscOptions = {}) {
  const inner = sectorImageSource(SECTORS, userData, options.edit);
  const held: (() => void)[] = [];
  const image = new SyntheticByteSource(inner.byteLength, (offset, length) => (offset >= (options.holdFrom ?? Infinity)
    ? new Promise(resolve => { held.push(() => resolve(inner.read(offset, length))); })
    : inner.read(offset, length)));
  const disc = syntheticDisc(SECTORS, new Map());
  const files = [disc.files[0], { name: disc.files[1].name, source: image }];
  const limits = options.limits === undefined ? undefined : { ...EMPTY_BUDGET_USAGE, sourceReadBytes: options.limits };
  const opened = await openDiscImage(files, { limits, cancellation: options.cancellation });
  return { image, held, opened };
}

/** The LBAs a read requested, after those already in the log. */
const newLbas = (image: SyntheticByteSource, before: number): number[] => requestedLbas(image).slice(before);
const span = (first: number, count: number): number[] => Array.from({ length: count }, (_, index) => first + index);
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

describe('file range reads', () => {
  it.each([
    ['inside one sector', 10, 100],
    ['across a sector boundary', 2_000, 100],
    ['the partial last sector', 4_096, 904],
    ['the whole file', 0, SMALL_BYTES],
    ['the last byte', 4_999, 1],
  ])('reads %s byte for byte, requesting only the covering sectors', async (_case, offset, length) => {
    const { image, opened } = await openSmallAndBig();
    const file = await opened.openFile('SMALL.DAT');
    const before = requestedLbas(image).length;
    expect(await file.read(offset, length)).toEqual(fileBytes(SMALL, offset, length));
    const first = SMALL + Math.floor(offset / 2_048);
    expect(newLbas(image, before)).toEqual(span(first, SMALL + Math.floor((offset + length - 1) / 2_048) - first + 1));
  });

  it.each([
    ['SMALL.DAT', 0],
    ['SMALL.DAT', SMALL_BYTES],
    ['EMPTY.DAT', 0],
  ])('reads an empty range of %s at %s without calling the port', async (path, offset) => {
    const { image, opened } = await openSmallAndBig();
    const file = await opened.openFile(path);
    const before = image.requests.length;
    expect(await file.read(offset, 0)).toEqual(new Uint8Array(0));
    expect(image.requests).toHaveLength(before);
  });

  it('returns exclusive buffers that callers may change or transfer without affecting later reads', async () => {
    const { opened } = await openSmallAndBig();
    const file = await opened.openFile('SMALL.DAT');
    const first = await file.read(2_000, 100);
    const second = await file.read(2_000, 100);
    expect(first.byteOffset === 0 && first.buffer.byteLength === 100 && first.buffer instanceof ArrayBuffer).toBe(true);
    expect(payloadTransferList([first, second])).toEqual([first.buffer, second.buffer]);
    first.fill(0);
    structuredClone(second.buffer, { transfer: [second.buffer] });
    expect(await file.read(2_000, 100)).toEqual(fileBytes(SMALL, 2_000, 100));
  });

  it('caches nothing: the same read twice gives the same bytes and is read and metered twice', async () => {
    const { image, opened } = await openSmallAndBig();
    const file = await opened.openFile('SMALL.DAT');
    const before = requestedLbas(image).length;
    const used = opened.usage().sourceReadBytes;
    expect(await file.read(0, SMALL_BYTES)).toEqual(await file.read(0, SMALL_BYTES));
    expect(newLbas(image, before)).toEqual([...span(SMALL, 3), ...span(SMALL, 3)]);
    expect(opened.usage().sourceReadBytes - used).toBe(6 * RAW);
  });

  it.each([
    ['past the end', 4_999, 2],
    ['starting past the end', SMALL_BYTES + 1, 0],
    ['a negative offset', -1, 1],
    ['a fractional offset', 0.5, 1],
    ['a NaN length', 0, Number.NaN],
    ['an unsafe offset', Number.MAX_SAFE_INTEGER + 1, 1],
  ])('rejects a range %s before reading', async (_case, offset, length) => {
    const { image, opened } = await openSmallAndBig();
    const file = await opened.openFile('SMALL.DAT');
    const before = image.requests.length;
    expect(await failure(() => file.read(offset, length))).toEqual(failureOf('invalid-range', 'file:/SMALL.DAT'));
    expect(image.requests).toHaveLength(before);
  });

  it('reads 16 MiB in segments of at most 2,048 sectors and rejects one byte more before reading', async () => {
    const { image, opened } = await openSmallAndBig();
    const file = await opened.openFile('BIG.DAT');
    const before = image.requests.length;
    expect(sha256(await file.read(1_000, 16_777_216))).toBe(sha256(fileBytes(BIG, 1_000, 16_777_216)));
    expect(image.requests.slice(before).map(({ length }) => length / RAW)).toEqual([2_048, 2_048, 2_048, 2_048, 1]);
    expect(requestedLbas(image).slice(-8_193)).toEqual(span(BIG, 8_193));
    const after = image.requests.length;
    expect(await failure(() => file.read(0, 16_777_217)))
      .toEqual(failureOf('limit-exceeded', 'file:/BIG.DAT', { name: 'rangeReadBytes', limit: 16_777_216, observed: 16_777_217 }));
    expect(await failure(() => file.read(BIG_BYTES - 1, 16_777_217))).toEqual(failureOf('invalid-range', 'file:/BIG.DAT'));
    expect(image.requests).toHaveLength(after);
  });

  it('opens only files, through a path it resolves itself', async () => {
    const { opened } = await openSmallAndBig();
    expect(await failure(() => opened.openFile('DIR'))).toEqual(failureOf('wrong-entry-kind', 'dir:/DIR'));
    expect(await failure(() => opened.openFile('MISSING'))).toEqual(failureOf('path-not-found', 'dir:/'));
    const forged = { path: 'SMALL.DAT', kind: 'file', byteLength: SMALL_BYTES, firstSector: 16, sectorCount: 3 };
    expect(await failure(() => opened.openFile(forged as unknown as string))).toEqual(failureOf('invalid-path', 'path'));
    const file = await opened.openFile('SMALL.DAT');
    expect(Object.isFrozen(file) && Object.isFrozen(file.entry)).toBe(true);
  });
});

describe('file read budget and cancellation', () => {
  async function usedByOpening(): Promise<number> {
    const { opened } = await openSmallAndBig();
    await opened.openFile('SMALL.DAT');
    return opened.usage().sourceReadBytes;
  }

  it('reads within a budget of exactly the covering raw sectors and rejects one byte less before reading', async () => {
    const limit = await usedByOpening() + 2 * RAW;
    const exact = await openSmallAndBig({ limits: limit });
    expect(await (await exact.opened.openFile('SMALL.DAT')).read(2_000, 100)).toEqual(fileBytes(SMALL, 2_000, 100));
    const short = await openSmallAndBig({ limits: limit - 1 });
    const file = await short.opened.openFile('SMALL.DAT');
    const before = short.image.requests.length;
    expect(await failure(() => file.read(2_000, 100)))
      .toEqual(failureOf('budget-exceeded', 'file:/SMALL.DAT', { name: 'sourceReadBytes', limit: limit - 1, observed: limit }));
    expect(short.image.requests).toHaveLength(before);
    expect(short.opened.usage().sourceReadBytes).toBe(limit - 2 * RAW);
  });

  it('keeps a failed read metered and the image usable', async () => {
    const { opened } = await openSmallAndBig({ edit: (lba, raw) => { if (lba === SMALL + 1) raw[15] = 2; } });
    const file = await opened.openFile('SMALL.DAT');
    const used = opened.usage().sourceReadBytes;
    expect(await failure(() => file.read(0, SMALL_BYTES))).toEqual(failureOf('invalid-sector', `image:lba ${SMALL + 1}`));
    expect(opened.usage().sourceReadBytes - used).toBe(3 * RAW);
    expect(await failure(() => opened.lookup('MISSING'))).toEqual(failureOf('path-not-found', 'dir:/'));
    expect(await file.read(0, 100)).toEqual(fileBytes(SMALL, 0, 100));
    expect(await (await opened.openFile('BIG.DAT')).read(0, 10)).toEqual(fileBytes(BIG, 0, 10));
  });

  it('stops between segments once cancelled, without publishing or issuing the next segment', async () => {
    // Armed after opening, the probe reports aborted from its fourth check: the read's own check and the first
    // segment's checks before and after its wait pass, then the second segment's check cancels.
    const probe = { armed: false, checks: 0, get aborted(): boolean { return this.armed && ++this.checks > 3; } };
    const { image, opened } = await openSmallAndBig({ cancellation: probe });
    const file = await opened.openFile('BIG.DAT');
    const before = image.requests.length;
    probe.armed = true;
    expect(await failure(() => file.read(0, TWO_SEGMENTS))).toEqual(failureOf('cancelled', `image:lba ${BIG + 2_048}`));
    expect(image.requests.slice(before).map(({ length }) => length / RAW)).toEqual([2_048]);
  });

  it('publishes nothing when cancelled while the last segment waits, keeping both segments metered', async () => {
    const probe = { aborted: false };
    const { held, opened } = await openSmallAndBig({ cancellation: probe, holdFrom: (BIG + 2_048) * RAW });
    const file = await opened.openFile('BIG.DAT');
    const used = opened.usage().sourceReadBytes;
    const reading = failure(() => file.read(0, TWO_SEGMENTS));
    while (held.length === 0) await settle();
    probe.aborted = true;
    held[0]();
    expect(await reading).toEqual(failureOf('cancelled', `image:lba ${BIG + 2_048}`));
    expect(opened.usage().sourceReadBytes - used).toBe(2_049 * RAW);
  });

  it('cancels an empty read without calling the port, and every later read', async () => {
    const probe = { aborted: false };
    const { image, opened } = await openSmallAndBig({ cancellation: probe });
    const file = await opened.openFile('SMALL.DAT');
    const before = image.requests.length;
    probe.aborted = true;
    expect(await failure(() => file.read(0, 0))).toEqual(failureOf('cancelled', 'file:/SMALL.DAT'));
    probe.aborted = false;
    expect(await failure(() => file.read(0, 10))).toEqual(failureOf('cancelled', 'file:/SMALL.DAT'));
    expect(image.requests).toHaveLength(before);
  });
});
