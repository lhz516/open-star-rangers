import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { readSourceFingerprint } from '../../content/content-identity.ts';
import { BASE_ARCHIVE } from '../archive/archive.test-support.ts';
import { DiscReadError } from '../disc/disc-error.ts';
import { openDiscImage, type DiscImage, type OpenDiscOptions } from '../disc/disc-image.ts';
import {
  MARKER, rangeLbas, rejection, requestedLbas, syntheticFileDisc, type SyntheticFileContent, type SyntheticFileDisc, type SyntheticFileDiscOptions,
} from '../disc/disc.test-support.ts';
import { SourceError } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import { SYNTHETIC_RAW_SECTOR_BYTES as RAW, SYNTHETIC_SECTOR_DATA_BYTES as SECTOR, SyntheticByteSource } from '../synthetic.test-support.ts';
import { HASH_SEGMENT_BYTES, identifySource } from './identify-source.ts';
import { openVerifiedSource } from './open-verified-source.ts';
import { PRODUCTION_CATALOG, readSourceCatalog, sourceFingerprint, type SourceCatalog } from './source-catalog.ts';
import { catalogFor } from './source.test-support.ts';

const PATTERN_BYTES = 65_521;

/** Generated content, distinct per seed and offset (a prime-length pattern), never allocated whole and copied natively. */
function generated(byteLength: number, seed: number): SyntheticFileContent {
  const pattern = Uint8Array.from({ length: PATTERN_BYTES * 2 }, (_, index) => {
    const at = index % PATTERN_BYTES;
    return (at * seed + (at >>> 11)) & 0xff;
  });
  return {
    byteLength,
    read(offset, length) {
      const bytes = new Uint8Array(length);
      for (let done = 0; done < length;) {
        const start = (offset + done) % PATTERN_BYTES;
        const take = Math.min(length - done, PATTERN_BYTES);
        bytes.set(pattern.subarray(start, start + take), done);
        done += take;
      }
      return bytes;
    },
  };
}

/** `content` with the byte at `at` replaced by its complement. */
function flipped(content: SyntheticFileContent, at: number): SyntheticFileContent {
  const read = (offset: number, length: number) => {
    const bytes = content instanceof Uint8Array ? content.slice(offset, offset + length) : content.read(offset, length);
    if (at >= offset && at < offset + length) bytes[at - offset] ^= 0xff;
    return bytes;
  };
  return { byteLength: content instanceof Uint8Array ? content.length : content.byteLength, read };
}

const BIG = 2 * HASH_SEGMENT_BYTES + 611_392;
const PROGRAM = generated(5_000, 3);
const FILES: Record<string, SyntheticFileContent> = {
  'MAIN/A.NOB': BASE_ARCHIVE,
  'MAIN/B.EXE': PROGRAM,
  'MAIN/C.DAT': generated(BIG, 7),
};
const CATALOG = catalogFor(FILES);
const UNRELATED: Record<string, SyntheticFileContent> = {
  'MAIN/SRANGER.CFG': generated(300, 11),
  'MAIN/SRHISCOR.RAW': generated(700, 13),
  'MAIN/ABCDEFGH.SWP': new Uint8Array(0),
  'DEMO/DEMO.EXE': generated(9_000, 17),
};

async function open(files: Record<string, SyntheticFileContent>, options?: OpenDiscOptions, layout?: SyntheticFileDiscOptions) {
  const disc = syntheticFileDisc(files, layout);
  return { disc, image: await openDiscImage(disc.files, options) };
}

/** The data sectors of `paths` on `disc`. */
function dataSectors(disc: SyntheticFileDisc, files: Record<string, SyntheticFileContent>, paths: readonly string[]): Set<number> {
  return new Set(paths.flatMap(path => {
    const content = files[path];
    return rangeLbas(disc.extents.get(path)!, 0, content instanceof Uint8Array ? content.length : content.byteLength);
  }));
}

const readSectors = (disc: SyntheticFileDisc, sectors: Set<number>) => requestedLbas(disc.image).filter(lba => sectors.has(lba));

interface Faults {
  readonly lookup?: (path: string) => Error | undefined;
  readonly openFile?: (path: string) => Error | undefined;
  readonly read?: (path: string, offset: number) => Error | undefined;
}

/** The image with lookups, opened files and file reads recorded in order, optionally failing some calls. */
function recordedImage(image: DiscImage, { onRead, faults = {} }: { onRead?: (path: string, offset: number) => void; faults?: Faults } = {}) {
  const reads: [string, number, number][] = [];
  const lookups: string[] = [];
  const opened: string[] = [];
  const wrapped: DiscImage = {
    volume: image.volume,
    async lookup(path) {
      lookups.push(path);
      const fault = faults.lookup?.(path);
      if (fault) throw fault;
      return image.lookup(path);
    },
    async openFile(path) {
      opened.push(path);
      const fault = faults.openFile?.(path);
      if (fault) throw fault;
      const file = await image.openFile(path);
      return {
        entry: file.entry,
        async read(offset, length) {
          reads.push([path, offset, length]);
          const readFault = faults.read?.(path, offset);
          if (readFault) throw readFault;
          const bytes = await file.read(offset, length);
          onRead?.(path, offset);
          return bytes;
        },
      };
    },
    usage: () => image.usage(),
  };
  return { image: wrapped, reads, lookups, opened };
}

async function sourceFailure(action: () => unknown): Promise<{ code: string; location: string }> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    const data = error.toData();
    expect(inLocationGrammar(data), data.location).toBe(true);
    expect(structuredClone(data)).toEqual(data);
    expect(Object.isFrozen(data)).toBe(true);
    expect(`${JSON.stringify(data)} ${error.message}`).not.toContain(MARKER);
    return { code: data.code, location: data.location };
  }
  throw new Error('expected a SourceError');
}

const withFiles = (catalog: SourceCatalog, change: (files: { path: string; byteLength: number; sha256: string }[]) => unknown[]) =>
  readSourceCatalog({ versionId: catalog.versionId, files: change(catalog.files.map(file => ({ ...file }))) });

/** The fingerprint recomputed independently with Node from the specified canonical text. */
function nodeFingerprint({ files }: SourceCatalog): string {
  const lines = files.map(({ path, byteLength, sha256 }) => `${path}\t${byteLength}\t${sha256.slice('sha256:'.length)}\n`);
  return `source:sha256:${createHash('sha256').update(`open-star-rangers/source-fingerprint/1\n${lines.join('')}`, 'ascii').digest('hex')}`;
}

describe('identifySource', () => {
  it('returns a frozen, cloneable identity with the content-addressed fingerprint', async () => {
    const { image } = await open(FILES);
    const { identity } = await identifySource(image, CATALOG);
    expect(identity).toEqual({ versionId: 'synthetic-test', fingerprint: nodeFingerprint(CATALOG), files: CATALOG.files });
    expect(readSourceFingerprint(identity.fingerprint)).toBe(sourceFingerprint(CATALOG));
    expect(Object.isFrozen(identity) && Object.isFrozen(identity.files)).toBe(true);
    expect(structuredClone(identity)).toEqual(identity);
  });

  it('hashes each covered file from its start in segments of at most 4 MiB, after checking every size', async () => {
    const opened = await open(FILES);
    const { image, reads } = recordedImage(opened.image);
    await identifySource(image, CATALOG);
    expect(reads).toEqual([
      ['MAIN/A.NOB', 0, BASE_ARCHIVE.length],
      ['MAIN/B.EXE', 0, 5_000],
      ['MAIN/C.DAT', 0, HASH_SEGMENT_BYTES],
      ['MAIN/C.DAT', HASH_SEGMENT_BYTES, HASH_SEGMENT_BYTES],
      ['MAIN/C.DAT', 2 * HASH_SEGMENT_BYTES, 611_392],
    ]);
  });

  it('never looks at files outside the whitelist and ignores them in the identity', async () => {
    const files = { ...FILES, ...UNRELATED };
    const { disc, image: raw } = await open(files);
    const { image, lookups, opened } = recordedImage(raw);
    const { identity } = await identifySource(image, CATALOG);
    expect([lookups, opened]).toEqual([Object.keys(FILES), Object.keys(FILES)]);
    expect(identity.fingerprint).toBe(sourceFingerprint(CATALOG));
    expect(readSectors(disc, dataSectors(disc, files, Object.keys(UNRELATED)))).toEqual([]);
    const covered = dataSectors(disc, files, Object.keys(FILES));
    const firstData = Math.min(...[...disc.extents.values()].filter(extent => extent > 0));
    expect(requestedLbas(disc.image).filter(lba => lba >= firstData && !covered.has(lba))).toEqual([]);
  });

  it('gives the same identity for the same covered files in another layout and descriptor', async () => {
    const first = await identifySource((await open(FILES)).image, CATALOG);
    const moved = await open({ ...FILES, ...UNRELATED }, undefined, { gapSectors: 7, reverse: true, lineEnd: '\n' });
    expect((await identifySource(moved.image, CATALOG)).identity).toEqual(first.identity);
  });

  it.each([
    ['a missing file', (catalog: SourceCatalog) => withFiles(catalog, files => [...files, { path: 'MAIN/D.DAT', byteLength: 1, sha256: files[0].sha256 }]), 'file:/MAIN/D.DAT'],
    ['a path through a file', (catalog: SourceCatalog) => withFiles(catalog, files => [...files, { path: 'MAIN/C.DAT/X', byteLength: 1, sha256: files[0].sha256 }]), 'file:/MAIN/C.DAT/X'],
    ['a directory', (catalog: SourceCatalog) => withFiles(catalog, files => [{ path: 'MAIN', byteLength: 2_048, sha256: files[0].sha256 }, ...files]), 'file:/MAIN'],
    ['the last file one byte longer', (catalog: SourceCatalog) => withFiles(catalog, files => files.map((file, index) => (index === 2 ? { ...file, byteLength: file.byteLength + 1 } : file))), 'file:/MAIN/C.DAT'],
    ['the last file one byte shorter', (catalog: SourceCatalog) => withFiles(catalog, files => files.map((file, index) => (index === 2 ? { ...file, byteLength: file.byteLength - 1 } : file))), 'file:/MAIN/C.DAT'],
  ])('rejects %s before reading any covered file data', async (_, change, location) => {
    const { disc, image } = await open(FILES);
    expect(await sourceFailure(() => identifySource(image, change(CATALOG)))).toEqual({ code: 'unsupported-version', location });
    expect(readSectors(disc, dataSectors(disc, FILES, Object.keys(FILES)))).toEqual([]);
  });

  it('reports the first presence failure in path order', async () => {
    const twoMissing = withFiles(CATALOG, files => [{ ...files[0], path: 'MAIN/0.DAT' }, ...files, { ...files[0], path: 'MAIN/Z.DAT' }]);
    const sizeThenMissing = withFiles(CATALOG, files => [...files.map((file, index) => (index === 1 ? { ...file, byteLength: 1 } : file)), { ...files[0], path: 'MAIN/Z.DAT' }]);
    expect(await sourceFailure(async () => identifySource((await open(FILES)).image, twoMissing))).toEqual({ code: 'unsupported-version', location: 'file:/MAIN/0.DAT' });
    expect(await sourceFailure(async () => identifySource((await open(FILES)).image, sizeThenMissing))).toEqual({ code: 'unsupported-version', location: 'file:/MAIN/B.EXE' });
  });

  const failed = new DiscReadError('read-failed', 'image', 'injected');
  const missing = new DiscReadError('path-not-found', 'dir:/MAIN', 'injected');
  it.each([
    ['a lookup', { lookup: () => failed }, failed],
    ['opening a file', { openFile: () => failed }, failed],
    ['a segment read', { read: (path: string) => (path === 'MAIN/C.DAT' ? failed : undefined) }, failed],
    ['a missing path while hashing', { openFile: () => missing }, missing],
  ] as const)('passes a disc error from %s through as the same instance', async (_, faults, expected) => {
    const { image } = recordedImage((await open(FILES)).image, { faults });
    expect(await rejection(() => identifySource(image, CATALOG))).toBe(expected);
  });

  it.each([
    ['the first byte of the first file', 'MAIN/A.NOB', 0],
    ['a byte in the last segment', 'MAIN/C.DAT', BIG - 3],
  ])('rejects other contents in %s and reads no later file', async (_, path, at) => {
    const files = { ...FILES, [path]: flipped(FILES[path], at) };
    const { disc, image } = await open(files);
    expect(await sourceFailure(() => identifySource(image, CATALOG))).toEqual({ code: 'unsupported-version', location: `file:/${path}` });
    const later = Object.keys(FILES).filter(other => other > path);
    expect(readSectors(disc, dataSectors(disc, files, later))).toEqual([]);
  });

  it('reports the smallest mismatching path, the same way every time, despite equal names and sizes', async () => {
    const files = { ...FILES, 'MAIN/B.EXE': flipped(FILES['MAIN/B.EXE'], 10), 'MAIN/C.DAT': flipped(FILES['MAIN/C.DAT'], 10) };
    for (let run = 0; run < 2; run++) {
      const { image } = await open(files);
      expect(await sourceFailure(() => identifySource(image, CATALOG))).toEqual({ code: 'unsupported-version', location: 'file:/MAIN/B.EXE' });
    }
  });

  it('passes a damaged covered sector through as the disc error', async () => {
    const target = syntheticFileDisc(FILES).extents.get('MAIN/C.DAT')! + 2_100;
    const { image } = await open(FILES, undefined, { edit: (lba, raw) => { if (lba === target) raw[1] = 0; } });
    expect((await rejection(() => identifySource(image, CATALOG))).code).toBe('invalid-sector');
  });

  it('meters every read and fails one byte short of the identification', async () => {
    const full = await open(FILES);
    await identifySource(full.image, CATALOG);
    const used = full.image.usage().sourceReadBytes;
    const limits = (sourceReadBytes: number) => ({ limits: { ...EMPTY_BUDGET_USAGE, sourceReadBytes } });
    await identifySource((await open(FILES, limits(used))).image, CATALOG);
    expect((await rejection(async () => identifySource((await open(FILES, limits(used - 1))).image, CATALOG))).code).toBe('budget-exceeded');
  });

  it('stops between segments once cancelled, without the next segment', async () => {
    const probe = { aborted: false };
    const opened = await open(FILES, { cancellation: probe });
    const { image, reads } = recordedImage(opened.image, { onRead: path => { if (path === 'MAIN/C.DAT') probe.aborted = true; } });
    expect((await rejection(() => identifySource(image, CATALOG))).code).toBe('cancelled');
    expect(reads.filter(([path]) => path === 'MAIN/C.DAT')).toHaveLength(2);
    expect(reads.at(-1)).toEqual(['MAIN/C.DAT', HASH_SEGMENT_BYTES, HASH_SEGMENT_BYTES]);
  });

  it('publishes nothing when cancelled while the last segment waits', async () => {
    const probe = { aborted: false };
    const disc = syntheticFileDisc(FILES);
    const lastSegment = (disc.extents.get('MAIN/C.DAT')! + (2 * HASH_SEGMENT_BYTES) / SECTOR) * RAW;
    let hold!: (release: () => void) => void;
    const reached = new Promise<() => void>(resolve => { hold = resolve; });
    const port = new SyntheticByteSource(disc.image.byteLength, (offset, length) => {
      const result = disc.image.read(offset, length);
      return offset === lastSegment ? new Promise(resolve => { hold(() => resolve(result)); }) : result;
    });
    const image = await openDiscImage([disc.files[0], { name: disc.files[1].name, source: port }], { cancellation: probe });
    const identifying = rejection(() => identifySource(image, CATALOG));
    const release = await reached;
    probe.aborted = true;
    release();
    expect((await identifying).code).toBe('cancelled');
  });
});

describe('VerifiedSource', () => {
  it('opens only covered files and archives, sharing the image usage and cancellation', async () => {
    // Small covered files leave room in the default budget, which only covers the input size once.
    const covered = { 'MAIN/A.NOB': BASE_ARCHIVE, 'MAIN/B.EXE': PROGRAM };
    const catalog = catalogFor(covered);
    const probe = { aborted: false };
    const { disc, image } = await open({ ...covered, 'MAIN/D.DAT': Uint8Array.of(1) }, { cancellation: probe });
    const input = { versionId: catalog.versionId, files: catalog.files.map(file => ({ ...file })) };
    const source = await identifySource(image, input);
    input.files[0].byteLength = 0;
    expect(source.identity.files).toEqual(catalog.files);
    expect(Object.isFrozen(source)).toBe(true);
    expect(source.usage()).toEqual(image.usage());

    const before = disc.image.requests.length;
    expect(await sourceFailure(() => source.openFile('MAIN/D.DAT'))).toEqual({ code: 'path-not-covered', location: 'file:/MAIN/D.DAT' });
    expect(await sourceFailure(() => source.openArchive('MAIN/D.DAT'))).toEqual({ code: 'path-not-covered', location: 'file:/MAIN/D.DAT' });
    for (const path of ['main/a.nob', 'MAIN/A.NOB;1', '', 7 as unknown as string]) {
      expect(await sourceFailure(() => source.openFile(path))).toEqual({ code: 'invalid-request', location: 'request.path' });
    }
    expect(disc.image.requests).toHaveLength(before);

    expect(await (await source.openFile('MAIN/B.EXE')).read(0, 4)).toEqual((PROGRAM as Exclude<SyntheticFileContent, Uint8Array>).read(0, 4));
    const archive = await source.openArchive('MAIN/A.NOB');
    expect((await archive.read(10_001)).relocations).toEqual([0]);
    expect(await sourceFailure(() => source.openArchive('MAIN/B.EXE'))).toEqual({ code: 'invalid-archive', location: 'archive:/MAIN/B.EXE' });
    expect(source.usage()).toEqual(image.usage());

    probe.aborted = true;
    expect((await rejection(() => source.openArchive('MAIN/A.NOB'))).code).toBe('cancelled');
  });
});

describe('openVerifiedSource', () => {
  const production = (content: (path: string, byteLength: number) => SyntheticFileContent) =>
    Object.fromEntries(PRODUCTION_CATALOG.files.map(({ path, byteLength }) => [path, content(path, byteLength)]));

  it('applies the production whitelist: missing covered files fail before any data read', async () => {
    const disc = syntheticFileDisc(FILES);
    expect(await sourceFailure(() => openVerifiedSource(disc.files))).toEqual({ code: 'unsupported-version', location: 'file:/MAIN/AISTUFF.NOB' });
  });

  it('rejects production-size files with other contents in the hash phase', async () => {
    const files = production((_, byteLength) => generated(byteLength, 5));
    const disc = syntheticFileDisc(files);
    expect(await sourceFailure(() => openVerifiedSource(disc.files))).toEqual({ code: 'unsupported-version', location: 'file:/MAIN/AISTUFF.NOB' });
    expect(readSectors(disc, dataSectors(disc, files, ['MAIN/AISTUFF.NOB'])).length).toBeGreaterThan(0);
    expect(readSectors(disc, dataSectors(disc, files, Object.keys(files).filter(path => path !== 'MAIN/AISTUFF.NOB')))).toEqual([]);
  });

  it('passes disc opening failures through and forwards the budget and cancellation options', async () => {
    const disc = syntheticFileDisc(FILES);
    const direct = await rejection(() => openDiscImage([disc.files[1]]));
    const entry = await rejection(() => openVerifiedSource([disc.files[1]]));
    expect(entry.toData()).toEqual(direct.toData());
    expect((await rejection(() => openVerifiedSource(disc.files, { cancellation: { aborted: true } }))).code).toBe('cancelled');
    expect((await rejection(() => openVerifiedSource(disc.files, { limits: { ...EMPTY_BUDGET_USAGE, sourceReadBytes: 1 } }))).code).toBe('budget-exceeded');
  });
});
