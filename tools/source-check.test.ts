import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASE_ARCHIVE } from '../src/original-data/archive/archive.test-support.ts';
import { syntheticFileDisc, type SyntheticFileContent } from '../src/original-data/disc/disc.test-support.ts';
import { catalogFor } from '../src/original-data/source/source.test-support.ts';
import { sourceFingerprint } from '../src/original-data/source/source-catalog.ts';
import { buildImfat } from '../src/original-data/synthetic.test-support.ts';
import { NodeByteSource, type ClosableByteSource } from './node-byte-source.ts';
import { main, RESEARCH_ARCHIVES, runSourceCheck, type SourceCheckOptions } from './source-check.ts';

const MARKER = 'PRIVATE-MARKER-c1';
const root = resolve(import.meta.dirname, '..');
const directory = mkdtempSync(join(tmpdir(), `osr-source-check-${MARKER}-`));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const face = (base: number) => buildImfat(base, [
  { id: base + 1, type: 'CMOV', data: Uint8Array.of(8, 0, 0, 0, 1, 2, 3, 4), relocations: [0] },
  { id: base + 3, type: 'TABL', data: Uint8Array.of(9, 9, 9, 9, 9) },
]);
const COVERED: Record<string, SyntheticFileContent> = { 'MAIN/A.NOB': BASE_ARCHIVE, 'MAIN/B.EXE': Uint8Array.from({ length: 3_000 }, (_, index) => index & 0xff) };
const RESEARCH: Record<string, SyntheticFileContent> = { 'MAIN/COMMFACE.NOB': face(40_000), 'MAIN/COMMFAC2.NOB': face(50_000) };
const CATALOG = catalogFor(COVERED);
/** A covered archive whose only relocation stores a pointer past its 8-byte block. */
const BROKEN_FILES: Record<string, SyntheticFileContent> = { ...COVERED, 'MAIN/R.NOB': buildImfat(30_000, [{ id: 30_001, type: 'TEX', data: Uint8Array.of(13, 0, 0, 0, 0, 0, 0, 0), relocations: [0] }]) };
const BROKEN_CATALOG = catalogFor(BROKEN_FILES);

/**
 * Writes a disc of `files` as a CloneCD file set and returns its paths. An unread padding file raises the default read
 * budget, which equals the input size, above this small disc's rereads.
 */
async function writeDisc(name: string, files: Record<string, SyntheticFileContent>): Promise<{ paths: string[]; extents: ReadonlyMap<string, number> }> {
  const disc = syntheticFileDisc({ ...files, 'PAD/PAD.DAT': { byteLength: 1 << 20, read: (_, length) => new Uint8Array(length) } });
  const ccd = join(directory, `${name}.ccd`);
  const img = join(directory, `${name}.img`);
  writeFileSync(ccd, await disc.descriptor.read(0, disc.descriptor.byteLength));
  writeFileSync(img, await disc.image.read(0, disc.image.byteLength));
  return { paths: [ccd, img], extents: disc.extents };
}

/**
 * An opener over real files that records closes; it can fail opening or closing the file at `failAt`, and `onRead`
 * may act on (or fail) a read of the file at an index before it is served.
 */
function opener(failAt?: { index: number; on: 'open' | 'close' }, onRead?: (index: number, offset: number) => void) {
  const opened: string[] = [];
  const closed: string[] = [];
  const open: SourceCheckOptions['open'] = async path => {
    const index = opened.length;
    opened.push(path);
    if (failAt?.on === 'open' && failAt.index === index) throw new Error(`${path} ${MARKER}`);
    const source = await NodeByteSource.open(path);
    const handle: ClosableByteSource = {
      byteLength: source.byteLength,
      read: async (offset, length) => {
        onRead?.(index, offset);
        return source.read(offset, length);
      },
      close: async () => {
        await source.close();
        closed.push(path);
        if (failAt?.on === 'close' && failAt.index === index) throw new Error(`${path} ${MARKER}`);
      },
    };
    return handle;
  };
  return { open, opened, closed };
}

let good: string[];
let goodExtents: ReadonlyMap<string, number>;
let broken: string[];
beforeAll(async () => {
  ({ paths: good, extents: goodExtents } = await writeDisc('good', { ...COVERED, ...RESEARCH }));
  ({ paths: broken } = await writeDisc('broken', { ...BROKEN_FILES, ...RESEARCH }));
});

/** Calls `act` on the second read of the first sector of MAIN/A.NOB: identification hashes it first, then the archive opens. */
function onArchiveOpen(act: () => void): (index: number, offset: number) => void {
  let seen = 0;
  return (index, offset) => {
    if (index === 1 && offset === goodExtents.get('MAIN/A.NOB')! * 2_352 && ++seen === 2) act();
  };
}

function expectPrivate(report: unknown): void {
  const text = JSON.stringify(report);
  expect(text).not.toContain(MARKER);
  expect(text).not.toContain(directory);
}

/** Every opened handle was closed exactly once; concurrent closes may complete in any order. */
function expectEveryInputClosed({ opened, closed }: { opened: readonly string[]; closed: readonly string[] }): void {
  expect([...closed].sort()).toEqual([...opened].sort());
}

describe('runSourceCheck', () => {
  it('identifies the source and validates every entry of the covered and research archives', async () => {
    const { open, opened, closed } = opener();
    const report = await runSourceCheck(good, { open, catalog: CATALOG });
    expect(report).toMatchObject({
      format: 'osr-source-check', version: 1, passed: true, error: null, closeFailures: 0,
      identity: { versionId: 'synthetic-test', fingerprint: sourceFingerprint(CATALOG), files: 2 },
    });
    expect(report.archives).toEqual([
      { path: 'MAIN/A.NOB', coverage: 'verified', entries: 6, types: { 1234: 1, A: 1, B2: 1, M2ID: 1, MESH: 1, TEX: 1 }, entriesRead: 6, maxBlockBytes: 32, maxRelocations: 3 },
      { path: 'MAIN/COMMFACE.NOB', coverage: 'research', entries: 2, types: { CMOV: 1, TABL: 1 }, entriesRead: 2, maxBlockBytes: 8, maxRelocations: 1 },
      { path: 'MAIN/COMMFAC2.NOB', coverage: 'research', entries: 2, types: { CMOV: 1, TABL: 1 }, entriesRead: 2, maxBlockBytes: 8, maxRelocations: 1 },
    ]);
    expect(report.reads.sourceReadBytes).toBeGreaterThan(0);
    expectEveryInputClosed({ opened, closed });
    expectPrivate(report);
  });

  it('identifies through the product entry and its production whitelist by default, closing every input', async () => {
    expect(RESEARCH_ARCHIVES).toEqual(['MAIN/COMMFACE.NOB', 'MAIN/COMMFAC2.NOB']);
    const { open, opened, closed } = opener();
    const report = await runSourceCheck(good, { open });
    expect(report).toMatchObject({ passed: false, identity: null, archives: [], error: { code: 'unsupported-version', location: 'file:/MAIN/AISTUFF.NOB' } });
    expectEveryInputClosed({ opened, closed });
  });

  it('stops at the first invalid entry and reports how far the archive got', async () => {
    const { open, opened, closed } = opener();
    const report = await runSourceCheck(broken, { open, catalog: BROKEN_CATALOG });
    expect(report.error).toEqual({ code: 'invalid-entry', location: 'archive:/MAIN/R.NOB#30001.relocations[0]' });
    expect(report.archives.at(-1)).toMatchObject({ path: 'MAIN/R.NOB', entries: 1, entriesRead: 0 });
    expect(report.passed).toBe(false);
    expectEveryInputClosed({ opened, closed });
  });

  it('fails when a research archive is missing', async () => {
    const report = await runSourceCheck(good, { open: opener().open, catalog: CATALOG, researchArchives: ['MAIN/NONE.NOB'] });
    expect(report.error?.code).toBe('path-not-found');
    expect(report.passed).toBe(false);
  });

  it('reports an input that cannot open and closes the inputs already opened', async () => {
    const { open, closed } = opener({ index: 1, on: 'open' });
    const report = await runSourceCheck(good, { open, catalog: CATALOG });
    expect(report).toMatchObject({ passed: false, error: { code: 'read-failed', location: 'input[1]' }, identity: null });
    expect(closed).toEqual([good[0]]);
    expectPrivate(report);
  });

  it('fails a passing check when closing an input fails, counting the failure', async () => {
    const report = await runSourceCheck(good, { open: opener({ index: 0, on: 'close' }).open, catalog: CATALOG });
    expect(report).toMatchObject({ passed: false, closeFailures: 1, error: { code: 'read-failed', location: 'input' } });
    expect(report.archives).toHaveLength(3);
    expectPrivate(report);
  });

  it('stops when cancelled before or during the archive reads', async () => {
    const before = new AbortController();
    before.abort();
    const first = opener();
    expect((await runSourceCheck(good, { open: first.open, catalog: CATALOG, signal: before.signal })).error?.code).toBe('cancelled');
    expectEveryInputClosed(first);

    const during = new AbortController();
    const second = opener(undefined, onArchiveOpen(() => during.abort()));
    const report = await runSourceCheck(good, { open: second.open, catalog: CATALOG, signal: during.signal });
    expect(report).toMatchObject({ passed: false, error: { code: 'cancelled' }, identity: { files: 2 } });
    expectEveryInputClosed(second);
  });

  it('keeps the first error when closing also fails, and hides host read errors', async () => {
    const report = await runSourceCheck(broken, {
      open: opener({ index: 0, on: 'close' }).open,
      catalog: BROKEN_CATALOG,
    });
    expect(report).toMatchObject({ closeFailures: 1, error: { code: 'invalid-entry' } });

    const failing = opener(undefined, onArchiveOpen(() => { throw new Error(`${directory} ${MARKER}`); }));
    const failed = await runSourceCheck(good, { open: failing.open, catalog: CATALOG });
    expect(failed.error?.code).toBe('read-failed');
    expectEveryInputClosed(failing);
    expectPrivate(failed);
  });
});

describe('main', () => {
  it('returns 0 for a passing check, 1 for a failing one and 2 for bad usage', async () => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      expect(await main(good, { catalog: CATALOG })).toBe(0);
      expect(await main(good)).toBe(1);
      expect(await main([])).toBe(2);
      expect(await main(['--manifest', 'x'])).toBe(2);
    } finally {
      console.log = log;
      console.error = error;
    }
  });

  it('sets the process exit status when run as a command', () => {
    const run = (...args: string[]) => spawnSync(process.execPath, [join(root, 'tools/source-check.ts'), ...args], { cwd: root, encoding: 'utf8' });
    const usage = run();
    expect(usage.status).toBe(2);
    const failed = run(...good);
    expect(failed.status).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({ format: 'osr-source-check', passed: false, error: { code: 'unsupported-version' } });
    expect(failed.stdout).not.toContain(directory);
  });
});
