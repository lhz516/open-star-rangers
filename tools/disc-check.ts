import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiscReadError, type DiscReadErrorData } from '../src/original-data/disc/disc-error.ts';
import { isDiscPath } from '../src/original-data/disc/disc-path.ts';
import { openDiscImage, type DiscImage } from '../src/original-data/disc/disc-image.ts';
import { MAX_RANGE_READ_BYTES } from '../src/original-data/disc/file-range.ts';
import type { ByteSource } from '../src/original-data/io/byte-source.ts';
import { readManifest, type BlacklistEntry } from './compliance/manifest.ts';
import { ComplianceError } from './compliance/report.ts';
import { NodeByteSource, type ClosableByteSource } from './node-byte-source.ts';

// Local disc check (P2-02 S-09, AC-12): reads every manifest game file through the disc reader and compares size and
// SHA-256. Output holds only canonical disc paths, counts and verdicts, never host paths or file contents.

export interface DiscCheckOptions {
  readonly manifestPath: string;
  readonly signal?: AbortSignal;
  /** Opens one input file; defaults to a read-only Node file handle. */
  readonly open?: (path: string) => Promise<ClosableByteSource>;
}

/**
 * Stable codes: disc read codes (opening, closing and reading host files are `read-failed`), file verdicts, manifest
 * problems, accounting, bad usage, and `internal-error` for anything unexpected, which is never serialized.
 */
export type DiscCheckCode =
  | DiscReadErrorData['code']
  | 'size-mismatch' | 'hash-mismatch'
  | 'manifest-unreadable' | 'manifest-invalid' | 'manifest-path'
  | 'read-accounting' | 'usage' | 'internal-error';

export interface DiscCheckFailure {
  readonly code: DiscCheckCode;
  readonly location: string;
}

export interface DiscCheckReport {
  readonly format: 'osr-disc-check';
  readonly version: 1;
  readonly passed: boolean;
  readonly error: DiscCheckFailure | null;
  readonly volume: { readonly sectorCount: number; readonly volumeSectors: number } | null;
  readonly files: {
    readonly checked: number;
    readonly matched: number;
    readonly mismatched: readonly { readonly path: string; readonly code: DiscCheckCode }[];
  };
  readonly reads: {
    /** The disc reader's metered `sourceReadBytes`. */
    readonly sourceReadBytes: number;
    /** The sum of every request the input ports actually received. */
    readonly requestedBytes: number;
    /** Bytes requested from the `.sub` and `.cue`, which must stay 0. */
    readonly ignoredFileBytes: number;
  };
}

/**
 * Records every request a port receives, so reads can be totalled independently of the reader's metering. Creating
 * one never touches the port, so it cannot fail between opening a handle and recording it for closing.
 */
class CountingSource implements ByteSource {
  requestedBytes = 0;
  readonly #source: ByteSource;

  constructor(source: ByteSource) {
    this.#source = source;
  }

  get byteLength(): number {
    return this.#source.byteLength;
  }

  read(offset: number, length: number): Promise<Uint8Array> {
    this.requestedBytes += length;
    return this.#source.read(offset, length);
  }
}

/** Ends the whole check with a safe failure. */
class CheckStop extends Error {
  readonly failure: DiscCheckFailure;

  constructor(code: DiscCheckCode, location: string) {
    super(`${location}: ${code}`);
    this.failure = { code, location };
  }
}

/** The manifest game rows; every path must be a canonical disc path, so only those ever reach the output. */
function readGameTable(manifestPath: string): readonly BlacklistEntry[] {
  let entries: readonly BlacklistEntry[];
  try {
    entries = readManifest(manifestPath).entries;
  } catch (cause) {
    throw new CheckStop(cause instanceof ComplianceError ? 'manifest-invalid' : 'manifest-unreadable', 'manifest');
  }
  const game = entries.filter(entry => entry.table === 'game');
  if (!game.every(entry => isDiscPath(entry.source))) throw new CheckStop('manifest-path', 'manifest');
  return game;
}

async function sha256Of(file: { read(offset: number, length: number): Promise<Uint8Array> }, byteLength: number): Promise<string> {
  const hash = createHash('sha256');
  for (let offset = 0; offset < byteLength; offset += MAX_RANGE_READ_BYTES) {
    hash.update(await file.read(offset, Math.min(MAX_RANGE_READ_BYTES, byteLength - offset)));
  }
  return hash.digest('hex');
}

interface Tally {
  checked: number;
  readonly mismatched: { readonly path: string; readonly code: DiscCheckCode }[];
}

/**
 * Checks each game file, counting a row only once it has a verdict. Cancellation and an exhausted budget end the
 * check; other read failures belong to one file.
 */
async function checkFiles(disc: DiscImage, game: readonly BlacklistEntry[], tally: Tally): Promise<void> {
  for (const { source: path, size, sha256 } of game) {
    let code: DiscCheckCode | undefined;
    try {
      const file = await disc.openFile(path);
      if (file.entry.byteLength !== size) code = 'size-mismatch';
      else if (await sha256Of(file, size) !== sha256) code = 'hash-mismatch';
    } catch (cause) {
      if (!(cause instanceof DiscReadError) || cause.code === 'cancelled' || cause.code === 'budget-exceeded') throw cause;
      code = cause.code;
    }
    tally.checked++;
    if (code) tally.mismatched.push({ path, code });
  }
}

/**
 * Checks a CloneCD file set against the manifest game table. Handles opened here are closed on every path, including
 * failures and cancellation; a failed close fails the check. The check also requires the metered `sourceReadBytes` to
 * equal the requests the ports received and the `.sub` and `.cue` to be read 0 bytes.
 */
export async function runDiscCheck(paths: readonly string[], options: DiscCheckOptions): Promise<DiscCheckReport> {
  const inputs: { readonly name: string; readonly handle: ClosableByteSource; readonly source: CountingSource }[] = [];
  const tally: Tally = { checked: 0, mismatched: [] };
  let error: DiscCheckFailure | null = null;
  let disc: DiscImage | undefined;
  try {
    const game = readGameTable(options.manifestPath);
    for (const [index, path] of paths.entries()) {
      const name = basename(path);
      let handle: ClosableByteSource;
      try {
        handle = await (options.open ?? NodeByteSource.open)(path);
      } catch {
        throw new CheckStop('read-failed', `input[${index}]`);
      }
      // Nothing can throw between opening and recording, so every opened handle is closed.
      inputs.push({ name, handle, source: new CountingSource(handle) });
    }
    disc = await openDiscImage(inputs.map(({ name, source }) => ({ name, source })), { cancellation: options.signal });
    await checkFiles(disc, game, tally);
  } catch (cause) {
    if (cause instanceof CheckStop) error = cause.failure;
    else if (cause instanceof DiscReadError) error = { code: cause.code, location: cause.location };
    // Unexpected failures are reported by code only; their text may hold host paths.
    else error = { code: 'internal-error', location: 'check' };
  } finally {
    // async callbacks turn a synchronous throw into a rejection, so every handle still gets its close.
    const closes = await Promise.allSettled(inputs.map(async ({ handle }) => handle.close()));
    if (closes.some(result => result.status === 'rejected')) error ??= { code: 'read-failed', location: 'input' };
  }
  const requestedBytes = inputs.reduce((total, { source }) => total + source.requestedBytes, 0);
  const ignoredFileBytes = inputs.filter(({ name }) => /\.(?:sub|cue)$/i.test(name)).reduce((total, { source }) => total + source.requestedBytes, 0);
  const sourceReadBytes = disc?.usage().sourceReadBytes ?? 0;
  if (disc && (sourceReadBytes !== requestedBytes || ignoredFileBytes !== 0)) error ??= { code: 'read-accounting', location: 'reads' };
  return {
    format: 'osr-disc-check',
    version: 1,
    passed: error === null && tally.mismatched.length === 0,
    error,
    volume: disc ? { sectorCount: disc.volume.sectorCount, volumeSectors: disc.volume.volumeSectors } : null,
    files: { checked: tally.checked, matched: tally.checked - tally.mismatched.length, mismatched: tally.mismatched },
    reads: { sourceReadBytes, requestedBytes, ignoredFileBytes },
  };
}

const USAGE = 'usage: node tools/disc-check.ts <file>... [--manifest <manifest.md>]';

/** Runs the CLI: prints one JSON report and returns 0 when every file matches, 1 on a failed check, 2 on bad usage. */
export async function main(argv: readonly string[]): Promise<number> {
  const files: string[] = [];
  let manifestPath = 'docs/original/manifest.md';
  let usable = true;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--manifest' && index + 1 < argv.length) manifestPath = argv[++index];
    else if (argv[index].startsWith('-')) usable = false;
    else files.push(argv[index]);
  }
  if (!usable || files.length === 0) {
    console.error(USAGE);
    console.log(JSON.stringify({ format: 'osr-disc-check', version: 1, passed: false, error: { code: 'usage', location: 'argv' } }));
    return 2;
  }
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  process.once('SIGINT', cancel);
  try {
    const report = await runDiscCheck(files.map(file => resolve(file)), { manifestPath: resolve(manifestPath), signal: controller.signal });
    console.log(JSON.stringify(report, null, 2));
    return report.passed ? 0 : 1;
  } catch {
    console.log(JSON.stringify({ format: 'osr-disc-check', version: 1, passed: false, error: { code: 'internal-error', location: 'cli' } }));
    return 1;
  } finally {
    process.off('SIGINT', cancel);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
