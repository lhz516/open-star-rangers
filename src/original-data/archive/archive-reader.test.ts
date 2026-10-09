import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import { DiscReadError } from '../disc/disc-error.ts';
import { openDiscImage, type DiscFile, type OpenDiscOptions } from '../disc/disc-image.ts';
import { rangeLbas, rejection, requestedLbas, syntheticFileDisc, type SyntheticFileDisc } from '../disc/disc.test-support.ts';
import { entryData, entryRelocations, parseImfat } from '../imfat.ts';
import { SourceError, type SourceErrorData } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import { SyntheticByteSource } from '../synthetic.test-support.ts';
import { ARCHIVE_SAMPLES, BASE_ARCHIVE, BASE_ENTRIES, type SampleFailure } from './archive.test-support.ts';
import { openImfatArchive } from './archive-reader.ts';
import { entrySpan, IMFAT_ENTRY_BYTES, MAX_ARCHIVE_ENTRIES } from './imfat-rules.ts';

const PATH = 'MAIN/TEST.NOB';
const AT = `archive:/${PATH}`;

type Diagnostic = Omit<SourceErrorData, 'reason'>;

async function sourceFailure(action: () => unknown): Promise<Diagnostic> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    expect(inLocationGrammar(error), error.location).toBe(true);
    const { code, location, limit } = error.toData();
    return { code, location, limit };
  }
  throw new Error('expected a SourceError');
}

const discFailure = async (action: () => unknown): Promise<string> => (await rejection(action)).code;

async function thrown(action: () => unknown): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

const inMemory = ({ code, at, limit }: SampleFailure, prefix: string): Diagnostic => ({ code, location: `${prefix}${at}`, limit });

async function openTestFile(bytes: Uint8Array, options?: OpenDiscOptions, disc: SyntheticFileDisc = syntheticFileDisc({ [PATH]: bytes, 'MAIN/OTHER.DAT': Uint8Array.of(1) })) {
  const image = await openDiscImage(disc.files, options);
  const file = await image.openFile(PATH);
  return { disc, image, file, first: disc.extents.get(PATH)! };
}


/** The disc file with every `read(offset, length)` call recorded, and calls answered by `override` when it returns a value. */
function recorded(file: DiscFile, override?: (offset: number, length: number) => Promise<Uint8Array<ArrayBuffer>> | undefined) {
  const calls: [number, number][] = [];
  const wrapped: DiscFile = {
    entry: file.entry,
    read(offset, length) {
      calls.push([offset, length]);
      return override?.(offset, length) ?? file.read(offset, length);
    },
  };
  return { file: wrapped, calls };
}

describe('openImfatArchive', () => {
  it.each(ARCHIVE_SAMPLES.map(sample => [sample.name, sample] as const))('agrees with in-memory parsing: %s', async (_, sample) => {
    const { file } = await openTestFile(sample.bytes);
    if ('failure' in sample.open) {
      expect(() => parseImfat(sample.bytes)).toThrow(SourceError);
      expect(await sourceFailure(() => openImfatArchive(file))).toEqual(inMemory(sample.open.failure, AT));
      return;
    }
    const archive = await openImfatArchive(file);
    const memory = parseImfat(sample.bytes);
    expect(archive.entries).toEqual(sample.open.entries);
    expect(archive.entries).toEqual(memory.entries);
    for (const read of sample.reads) {
      const entry = memory.entries.find(({ id }) => id === read.id)!;
      if (read.failure) {
        expect(await sourceFailure(() => archive.read(read.id))).toEqual(inMemory(read.failure, AT));
        expect(() => entryRelocations(sample.bytes, entry)).toThrow(SourceError);
      } else {
        const result = await archive.read(read.id);
        expect(result.relocations).toEqual(read.relocations);
        expect(result.relocations).toEqual(entryRelocations(sample.bytes, entry));
        // Digests keep the 4 MiB sample fast; element-wise equality is too slow for it.
        expect(sha256Fingerprint(result.bytes)).toBe(sha256Fingerprint(entryData(sample.bytes, entry)));
        expect(result.bytes.length).toBe(entry.size);
      }
    }
  });

  it('reads only the header and directory, then only the requested entry, every time', async () => {
    const opened = await openTestFile(BASE_ARCHIVE);
    const { disc, first } = opened;
    const { file, calls } = recorded(opened.file);
    let before = requestedLbas(disc.image).length;
    const archive = await openImfatArchive(file);
    const directoryBytes = BASE_ENTRIES.length * IMFAT_ENTRY_BYTES;
    expect(calls).toEqual([[0, 24], [24, directoryBytes]]);
    expect(requestedLbas(disc.image).slice(before)).toEqual([...rangeLbas(first, 0, 24), ...rangeLbas(first, 24, directoryBytes)]);
    const mesh = archive.entry(10_003, 'MESH');
    before = requestedLbas(disc.image).length;
    const once = await archive.read(10_003);
    expect(requestedLbas(disc.image).slice(before)).toEqual(rangeLbas(first, mesh.offset, entrySpan(mesh)));
    const twice = await archive.read(10_003, 'MESH');
    expect(calls.slice(2)).toEqual([[mesh.offset, entrySpan(mesh)], [mesh.offset, entrySpan(mesh)]]);
    expect(twice).toEqual(once);
  });

  it('rejects too many entries before reading the directory', async () => {
    const bytes = BASE_ARCHIVE.slice();
    new DataView(bytes.buffer).setUint32(0x0c, MAX_ARCHIVE_ENTRIES + 1, true);
    const opened = await openTestFile(bytes);
    const { file, calls } = recorded(opened.file);
    expect((await sourceFailure(() => openImfatArchive(file))).code).toBe('limit-exceeded');
    expect(calls).toEqual([[0, 24]]);
  });

  it('reports lookups by ID and type without reading', async () => {
    const { disc, file } = await openTestFile(BASE_ARCHIVE);
    const archive = await openImfatArchive(file);
    const before = disc.image.requests.length;
    expect(archive.entry(10_001)).toBe(archive.entries[0]);
    expect(archive.entry(10_001, 'TEX')).toBe(archive.entries[0]);
    expect(await sourceFailure(() => archive.read(10_002))).toEqual({ code: 'entry-not-found', location: `${AT}#10002`, limit: null });
    expect(await sourceFailure(() => archive.read(10_001, 'MESH'))).toEqual({ code: 'entry-type-mismatch', location: `${AT}#10001`, limit: null });
    for (const id of [-1, 1.5, 0x100000000, Number.NaN, '10001' as unknown as number]) {
      expect(await sourceFailure(() => archive.read(id))).toEqual({ code: 'invalid-request', location: 'request.id', limit: null });
    }
    for (const type of ['tex', '', 'ABCDE', 'TE X', 7 as unknown as string]) {
      expect(await sourceFailure(() => archive.read(10_001, type))).toEqual({ code: 'invalid-request', location: 'request.type', limit: null });
    }
    expect(disc.image.requests.length).toBe(before);
  });

  it('returns frozen results with exclusive, transferable bytes that later reads never share', async () => {
    const { file } = await openTestFile(BASE_ARCHIVE);
    const archive = await openImfatArchive(file);
    expect(Object.isFrozen(archive) && Object.isFrozen(archive.entries)).toBe(true);
    for (const id of [10_001, 10_006]) {
      const first = await archive.read(id);
      const original = first.bytes.slice();
      expect(Object.isFrozen(first) && Object.isFrozen(first.relocations)).toBe(true);
      expect([first.bytes.byteOffset, first.bytes.byteLength]).toEqual([0, first.bytes.buffer.byteLength]);
      first.bytes.fill(0xee);
      structuredClone(first.bytes.buffer, { transfer: [...payloadTransferList([first.bytes])] });
      expect((await archive.read(id)).bytes).toEqual(original);
    }
  });

  it('passes disc read failures through as the same instance', async () => {
    const files = { [PATH]: BASE_ARCHIVE };
    const target = syntheticFileDisc(files).extents.get(PATH)!;
    const corrupt = syntheticFileDisc(files, { edit: (lba, raw) => { if (lba === target) raw[1] = 0; } });
    expect(await discFailure(async () => openImfatArchive((await openTestFile(BASE_ARCHIVE, undefined, corrupt)).file))).toBe('invalid-sector');

    const failed = new DiscReadError('read-failed', 'image', 'the port rejected the read');
    const opened = await openTestFile(BASE_ARCHIVE);
    const header = recorded(opened.file, offset => (offset === 0 ? Promise.reject(failed) : undefined));
    expect(await thrown(() => openImfatArchive(header.file))).toBe(failed);
    const mesh = (await openImfatArchive(opened.file)).entry(10_003);
    const entry = recorded(opened.file, offset => (offset === mesh.offset ? Promise.reject(failed) : undefined));
    const archive = await openImfatArchive(entry.file);
    expect(await thrown(() => archive.read(10_003))).toBe(failed);
  });
});

describe('openImfatArchive budget and cancellation', () => {
  const limits = (sourceReadBytes: number) => ({ limits: { ...EMPTY_BUDGET_USAGE, sourceReadBytes } });

  async function usageAfterEachStep(): Promise<[number, number, number]> {
    const { image, file } = await openTestFile(BASE_ARCHIVE);
    const opened = image.usage().sourceReadBytes;
    const archive = await openImfatArchive(file);
    const directory = image.usage().sourceReadBytes;
    await archive.read(10_003);
    return [opened, directory, image.usage().sourceReadBytes];
  }

  it('meters every read and rejects one byte short before the read that would exceed it', async () => {
    const [, directory, entry] = await usageAfterEachStep();
    const exact = await openTestFile(BASE_ARCHIVE, limits(entry));
    await (await openImfatArchive(exact.file)).read(10_003);
    expect(exact.image.usage().sourceReadBytes).toBe(entry);

    const shortOpen = await openTestFile(BASE_ARCHIVE, limits(directory - 1));
    expect(await discFailure(() => openImfatArchive(shortOpen.file))).toBe('budget-exceeded');
    const shortRead = await openTestFile(BASE_ARCHIVE, limits(entry - 1));
    const archive = await openImfatArchive(shortRead.file);
    const before = shortRead.image.usage();
    expect(await discFailure(() => archive.read(10_003))).toBe('budget-exceeded');
    expect(shortRead.image.usage()).toEqual(before);
  });

  /** A file set whose image holds request number `at()` (1-based); `reached` resolves to its release once it is held. */
  function holdingDisc(at: () => number): { disc: SyntheticFileDisc; reached: Promise<() => void> } {
    const disc = syntheticFileDisc({ [PATH]: BASE_ARCHIVE });
    let hold!: (release: () => void) => void;
    const reached = new Promise<() => void>(resolve => { hold = resolve; });
    const image = new SyntheticByteSource(disc.image.byteLength, (offset, length) => {
      const result = disc.image.read(offset, length);
      if (image.requests.length !== at()) return result;
      return new Promise(resolve => { hold(() => resolve(result)); });
    });
    return { disc: { ...disc, image, files: [disc.files[0], { name: disc.files[1].name, source: image }] }, reached };
  }

  it('stops before the first read when already cancelled', async () => {
    const probe = { aborted: false };
    const { disc, file } = await openTestFile(BASE_ARCHIVE, { cancellation: probe });
    probe.aborted = true;
    const before = disc.image.requests.length;
    expect(await discFailure(() => openImfatArchive(file))).toBe('cancelled');
    expect(disc.image.requests.length).toBe(before);
  });

  it('publishes nothing when cancelled while the last read of an operation is pending', async () => {
    for (const operation of ['open', 'read'] as const) {
      const probe = { aborted: false };
      let holdAt = Number.POSITIVE_INFINITY;
      const { disc, reached } = holdingDisc(() => holdAt);
      const { image, file } = await openTestFile(BASE_ARCHIVE, { cancellation: probe }, disc);
      const archive = operation === 'read' ? await openImfatArchive(file) : undefined;
      const before = disc.image.requests.length;
      const used = image.usage().sourceReadBytes;
      holdAt = before + (operation === 'open' ? 2 : 1);
      const pending = discFailure(() => (archive ? archive.read(10_003) : openImfatArchive(file)));
      const release = await reached;
      probe.aborted = true;
      release();
      expect(await pending, operation).toBe('cancelled');
      const issued = disc.image.requests.slice(before);
      expect(issued, operation).toHaveLength(operation === 'open' ? 2 : 1);
      expect(image.usage().sourceReadBytes - used, operation).toBe(issued.reduce((sum, { length }) => sum + length, 0));
      expect(await discFailure(() => (archive ? archive.read(10_001) : openImfatArchive(file))), operation).toBe('cancelled');
      expect(disc.image.requests, operation).toHaveLength(before + issued.length);
    }
  });
});
