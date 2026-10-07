import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileRecord, parentRecord, selfRecord, subdirectoryRecord, volumeSectors } from '../src/original-data/disc/disc.test-support.ts';
import { cloneCdSections, cloneCdText, directoryData, sectorImageSource } from '../src/original-data/synthetic.ts';
import { sha256 } from './compliance/report.ts';
import { runDiscCheck, type DiscCheckOptions } from './disc-check.ts';
import { NodeByteSource, type ClosableByteSource } from './node-byte-source.ts';

const root = resolve(import.meta.dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'osr-disc-check-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

// A synthetic disc: MAIN holds a small file, a file over the 16 MiB range-read limit and an empty file; FLICS holds one.
const FILES = [
  { path: 'MAIN/SMALL.DAT', record: 'SMALL.DAT;1', directory: 19, extent: 30, size: 5_000 },
  { path: 'MAIN/BIG.NOB', record: 'BIG.NOB;1', directory: 19, extent: 40, size: 16_777_216 + 3_000 },
  { path: 'MAIN/EMPTY.DAT', record: 'EMPTY.DAT;1', directory: 19, extent: 0, size: 0 },
  { path: 'FLICS/INTRO.FLC', record: 'INTRO.FLC;1', directory: 20, extent: 21, size: 4_096 },
];
const SECTORS = 40 + Math.ceil(FILES[1].size / 2_048) + 1;
const fileByte = (extent: number, index: number): number => ((index * 13) ^ (extent * 7) ^ Math.floor(index / 2_048)) & 0xff;
const contentOf = (extent: number, offset: number, length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) bytes[index] = fileByte(extent, offset + index);
  return bytes;
};
const descriptors = volumeSectors(SECTORS);

function userData(lba: number): Uint8Array | undefined {
  const descriptor = descriptors.get(lba);
  if (descriptor) return descriptor;
  if (lba === 18) return directoryData([selfRecord(18), parentRecord(18), subdirectoryRecord('FLICS', 20), subdirectoryRecord('MAIN', 19)]);
  if (lba === 19 || lba === 20) {
    const records = FILES.filter(file => file.directory === lba).map(file => fileRecord(file.record, file.extent, file.size));
    return directoryData([selfRecord(lba), parentRecord(18), ...records]);
  }
  const file = FILES.find(({ extent, size }) => size > 0 && lba >= extent && lba < extent + Math.ceil(size / 2_048));
  return file && contentOf(file.extent, (lba - file.extent) * 2_048, 2_048);
}

const paths = { ccd: join(directory, 'DISC.ccd'), img: join(directory, 'DISC.img'), sub: join(directory, 'DISC.sub'), cue: join(directory, 'DISC.cue') };
const inputs = [paths.ccd, paths.img, paths.sub, paths.cue];

interface Row { path: string; size: number; sha256: string }
// Digests are computed once; only the main test verifies the file over 16 MiB, the others use the small files.
const ROWS: readonly Row[] = FILES.map(({ path, extent, size }) => ({ path, size, sha256: sha256(contentOf(extent, 0, size)) }));
const SMALL_ROWS = ROWS.filter(row => row.size < 16_777_216);

/** A synthetic manifest with the real table layout; `edit` adjusts a copy of the game rows before writing. */
function writeManifest(name: string, edit: (rows: Row[]) => void = () => {}, base: readonly Row[] = SMALL_ROWS): string {
  const rows = base.map(row => ({ ...row }));
  edit(rows);
  const text = [
    '# Synthetic manifest', '', '## 光盘镜像', '', '| 文件 | SHA-256 |', '|---|---|', `| \`DISC.img\` | \`${'0'.repeat(64)}\` |`, '',
    '## 游戏文件（光盘 `MAIN/` 与 `FLICS/`）', '', '| 路径 | 大小（字节） | SHA-256 |', '|---|---:|---|',
    ...rows.map(row => `| \`${row.path}\` | ${row.size} | \`${row.sha256}\` |`), '',
  ].join('\n');
  const path = join(directory, name);
  writeFileSync(path, text);
  return path;
}

let manifest: string;
let fullManifest: string;
beforeAll(async () => {
  const image = sectorImageSource(SECTORS, userData);
  writeFileSync(paths.img, await image.read(0, image.byteLength));
  writeFileSync(paths.ccd, cloneCdText(cloneCdSections(SECTORS)));
  writeFileSync(paths.sub, new Uint8Array(96));
  writeFileSync(paths.cue, 'FILE "DISC.img" BINARY\n');
  manifest = writeManifest('manifest.md');
  fullManifest = writeManifest('full.md', () => {}, ROWS);
});

/**
 * An opener over real files that records which handles were closed. It can fail closing (asynchronously, or
 * synchronously for the first file opened) or cancel after a number of reads.
 */
function trackedOpener(options: {
  failClose?: 'async' | 'sync-first';
  abortAfterReads?: { controller: AbortController; count: number };
  /** Makes reads of this path that start at or after the offset fail. */
  failReads?: { path: string; from: number };
} = {}) {
  const closed: string[] = [];
  const opened: string[] = [];
  let reads = 0;
  const open = async (path: string): Promise<ClosableByteSource> => {
    const source = await NodeByteSource.open(path);
    opened.push(path);
    const first = opened.length === 1;
    return {
      byteLength: source.byteLength,
      read: (offset, length) => {
        if (options.abortAfterReads && ++reads === options.abortAfterReads.count) options.abortAfterReads.controller.abort();
        if (options.failReads?.path === path && offset >= options.failReads.from) return Promise.reject(new Error(`EIO ${directory}`));
        return source.read(offset, length);
      },
      close: () => {
        if (options.failClose === 'sync-first' && first) {
          // Release the real file anyway, so the simulated failure leaks no descriptor into later files of the worker.
          void source.close().catch(() => undefined);
          throw new Error(`close ${directory}`);
        }
        return source.close().then(() => {
          closed.push(path);
          if (options.failClose === 'async') throw new Error(`close ${directory}`);
        });
      },
    };
  };
  return { open, closed, opened };
}

const check = (files: readonly string[], options: Partial<DiscCheckOptions> = {}) => runDiscCheck(files, { manifestPath: manifest, ...options });

describe('local disc check', () => {
  it('verifies every manifest game file, metering exactly the requested reads and never reading .sub or .cue', async () => {
    const { open, closed } = trackedOpener();
    const report = await check(inputs, { open, manifestPath: fullManifest });
    expect(report).toMatchObject({
      format: 'osr-disc-check', version: 1, passed: true, error: null, closeFailures: 0, volume: { sectorCount: SECTORS, volumeSectors: SECTORS },
      files: { checked: 4, matched: 4, mismatched: [] },
    });
    expect(report.reads.sourceReadBytes).toBe(report.reads.requestedBytes);
    expect(report.reads.ignoredFileBytes).toBe(0);
    // The file over 16 MiB is hashed in range reads of at most 16 MiB; one oversized read would fail as limit-exceeded.
    expect(report.reads.requestedBytes).toBeGreaterThan(FILES[1].size);
    expect(closed.sort()).toEqual([...inputs].sort());
  });

  it('reports size, hash and path mismatches per file and fails', async () => {
    const edited = writeManifest('edited.md', rows => {
      rows[0].sha256 = 'f'.repeat(64);
      rows[2].size += 1;
      rows.push({ path: 'MAIN/MISSING.DAT', size: 1, sha256: 'a'.repeat(64) });
    });
    const report = await check(inputs, { manifestPath: edited });
    expect(report.passed).toBe(false);
    expect(report.error).toBeNull();
    expect(report.files).toEqual({
      checked: 4, matched: 1, mismatched: [
        { path: 'MAIN/SMALL.DAT', code: 'hash-mismatch' }, { path: 'FLICS/INTRO.FLC', code: 'size-mismatch' },
        { path: 'MAIN/MISSING.DAT', code: 'path-not-found' },
      ],
    });
  });

  it('closes what it opened when the file set is unsupported', async () => {
    const { open, closed } = trackedOpener();
    const report = await check([paths.ccd, paths.sub], { open });
    expect(report).toMatchObject({ passed: false, error: { code: 'unsupported-file-set', location: 'files' }, volume: null });
    expect(closed.sort()).toEqual([paths.ccd, paths.sub].sort());
  });

  it('closes the handles already opened when a later file fails to open', async () => {
    const { open, closed } = trackedOpener();
    const report = await check([paths.ccd, join(directory, 'missing.img')], { open });
    expect(report).toMatchObject({ passed: false, error: { code: 'read-failed', location: 'input[1]' } });
    expect(closed).toEqual([paths.ccd]);
  });

  it('stops on cancellation, counts only files with a verdict, and still closes every handle', async () => {
    const controller = new AbortController();
    // Reads: descriptor, two volume descriptors, root and MAIN directories, then the first file's data.
    const { open, closed } = trackedOpener({ abortAfterReads: { controller, count: 6 } });
    const report = await check(inputs, { open, signal: controller.signal });
    expect(report).toMatchObject({ passed: false, error: { code: 'cancelled' }, files: { checked: 0, matched: 0, mismatched: [] } });
    expect(closed).toHaveLength(4);
  });

  it('records a failed game file read as read-failed, fails, and still closes every handle', async () => {
    const { open, closed } = trackedOpener({ failReads: { path: paths.img, from: FILES[0].extent * 2_352 } });
    const report = await check(inputs, { open });
    expect(report).toMatchObject({
      passed: false, error: null, files: { checked: 3, matched: 2, mismatched: [{ path: 'MAIN/SMALL.DAT', code: 'read-failed' }] },
    });
    expect(JSON.stringify(report)).not.toContain(directory);
    expect(closed.sort()).toEqual([...inputs].sort());
  });

  it('fails a check whose handles cannot be closed as read-failed', async () => {
    const { open, closed } = trackedOpener({ failClose: 'async' });
    const report = await check(inputs, { open });
    expect(report).toMatchObject({ passed: false, error: { code: 'read-failed', location: 'input' }, closeFailures: 4, files: { matched: 3 } });
    expect(closed).toHaveLength(4);
  });

  it('reports close failures even when an earlier error ended the check', async () => {
    const controller = new AbortController();
    const { open, closed } = trackedOpener({ failClose: 'async', abortAfterReads: { controller, count: 6 } });
    const report = await check(inputs, { open, signal: controller.signal });
    expect(report).toMatchObject({ passed: false, error: { code: 'cancelled' }, closeFailures: 4 });
    expect(closed).toHaveLength(4);
  });

  it('closes the remaining handles when one close throws synchronously', async () => {
    const { open, closed, opened } = trackedOpener({ failClose: 'sync-first' });
    const report = await check(inputs, { open });
    expect(report).toMatchObject({ passed: false, error: { code: 'read-failed', location: 'input' }, closeFailures: 1 });
    expect(closed.sort()).toEqual(opened.slice(1).sort());
  });

  it('reports an unexpected failure as internal-error without its text, before opening anything', async () => {
    const { open, opened } = trackedOpener();
    const report = await check([paths.ccd, 1 as unknown as string], { open });
    expect(report).toMatchObject({ passed: false, error: { code: 'internal-error', location: 'check' } });
    expect(JSON.stringify(report)).not.toContain(directory);
    expect(opened).toEqual([paths.ccd]);
  });

  it('rejects a manifest game path that is not a canonical disc path before opening anything, without echoing it', async () => {
    const lower = writeManifest('lower.md', rows => { rows.push({ path: 'MAIN/lower name.dat', size: 1, sha256: 'a'.repeat(64) }); });
    const { open, opened } = trackedOpener();
    const report = await check(inputs, { open, manifestPath: lower });
    expect(report).toMatchObject({ passed: false, error: { code: 'manifest-path', location: 'manifest' } });
    expect(JSON.stringify(report)).not.toContain('lower name');
    expect(opened).toEqual([]);
  });

  it('reports a malformed manifest as manifest-invalid', async () => {
    const malformed = join(directory, 'malformed.md');
    writeFileSync(malformed, '# Not a manifest\n');
    expect((await check(inputs, { manifestPath: malformed })).error).toEqual({ code: 'manifest-invalid', location: 'manifest' });
  });

  it('reports an unreadable manifest with a stable code and no host path', async () => {
    const report = await check(inputs, { manifestPath: join(directory, 'missing.md') });
    expect(report).toMatchObject({ passed: false, error: { code: 'manifest-unreadable', location: 'manifest' } });
    expect(JSON.stringify(report)).not.toContain(directory);
  });
});

describe('disc check command', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [join(root, 'tools/disc-check.ts'), ...args], { cwd: root, encoding: 'utf8', timeout: 60_000 });

  it('prints a JSON report without host paths and exits 0 on a match', () => {
    const result = run(...inputs, '--manifest', manifest);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ passed: true, files: { checked: 3, matched: 3 } });
    expect(result.stdout + result.stderr).not.toContain(directory);
  });

  it('exits 1 with a stable code on bad input and 2 on bad usage', () => {
    const bad = run(paths.img, '--manifest', manifest);
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stdout).error).toEqual({ code: 'unsupported-file-set', location: 'files' });
    expect(bad.stdout + bad.stderr).not.toContain(directory);
    for (const args of [[], ['--unknown', paths.ccd]]) {
      const usage = run(...args);
      expect(usage.status).toBe(2);
      expect(JSON.parse(usage.stdout).error).toEqual({ code: 'usage', location: 'argv' });
    }
  });
});
