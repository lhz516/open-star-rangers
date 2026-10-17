import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openImfatArchive, type ImfatArchiveHandle } from '../src/original-data/archive/archive-reader.ts';
import { DiscReadError, type DiscReadErrorData } from '../src/original-data/disc/disc-error.ts';
import { openDiscImage, type DiscInputFile } from '../src/original-data/disc/disc-image.ts';
import { SourceError, type SourceErrorCode } from '../src/original-data/source-error.ts';
import { identifySource, type VerifiedSource } from '../src/original-data/source/identify-source.ts';
import { openVerifiedSource } from '../src/original-data/source/open-verified-source.ts';
import { NodeByteSource, type ClosableByteSource } from './node-byte-source.ts';

// Local source check (P2-03 S-13, AC-12): identifies a CloneCD file set against the version whitelist, then opens every
// covered archive and the research-only archives and validates each entry. Output holds only canonical disc paths,
// the version ID, the fingerprint, counts and verdicts, never host paths or file contents.

/**
 * Archives outside the whitelist checked through the low-level opener: the LO communication faces of P4. The HI face
 * archive is whitelisted since P3-03 revision 2, so it is checked once, as a covered archive.
 */
export const RESEARCH_ARCHIVES: readonly string[] = Object.freeze(['MAIN/COMMFAC2.NOB']);

export interface SourceCheckOptions {
  readonly signal?: AbortSignal;
  /** Opens one input file; defaults to a read-only Node file handle. */
  readonly open?: (path: string) => Promise<ClosableByteSource>;
  /** A synthetic whitelist for tests; otherwise the product entry `openVerifiedSource` identifies the source. */
  readonly catalog?: unknown;
  /** Archives checked without whitelist coverage; `RESEARCH_ARCHIVES` otherwise. */
  readonly researchArchives?: readonly string[];
}

export type SourceCheckCode = DiscReadErrorData['code'] | SourceErrorCode | 'usage' | 'internal-error';

export interface SourceCheckFailure {
  readonly code: SourceCheckCode;
  readonly location: string;
}

export interface ArchiveCheck {
  readonly path: string;
  readonly coverage: 'verified' | 'research';
  readonly entries: number;
  /** Entry count per type tag, in ASCII tag order. */
  readonly types: Readonly<Record<string, number>>;
  /** Entries read and validated, equal to `entries` when the archive passed. */
  readonly entriesRead: number;
  readonly maxBlockBytes: number;
  readonly maxRelocations: number;
}

export interface SourceCheckReport {
  readonly format: 'osr-source-check';
  readonly version: 1;
  readonly passed: boolean;
  /** The first failure that ended the check, if any. */
  readonly error: SourceCheckFailure | null;
  /** Handles whose close failed; reported separately so an earlier error never hides one. */
  readonly closeFailures: number;
  readonly identity: { readonly versionId: string; readonly fingerprint: string; readonly files: number } | null;
  readonly archives: readonly ArchiveCheck[];
  readonly reads: { readonly sourceReadBytes: number };
}

/** Ends the whole check with a safe failure. */
class CheckStop extends Error {
  readonly failure: SourceCheckFailure;

  constructor(code: SourceCheckCode, location: string) {
    super(`${location}: ${code}`);
    this.failure = { code, location };
  }
}

/** Reads and validates every entry of an archive, recording its counts as it goes. */
async function checkArchive(archive: ImfatArchiveHandle, coverage: ArchiveCheck['coverage'], checks: ArchiveCheck[]): Promise<void> {
  const types: Record<string, number> = {};
  for (const entry of archive.entries) types[entry.type] = (types[entry.type] ?? 0) + 1;
  const check = {
    path: archive.path,
    coverage,
    entries: archive.entries.length,
    types: Object.fromEntries(Object.entries(types).sort(([left], [right]) => (left < right ? -1 : 1))),
    entriesRead: 0,
    maxBlockBytes: Math.max(...archive.entries.map(({ size }) => size)),
    maxRelocations: Math.max(...archive.entries.map(({ relocationCount }) => relocationCount)),
  };
  checks.push(check);
  for (const entry of archive.entries) {
    await archive.read(entry.id, entry.type);
    check.entriesRead++;
  }
}

/**
 * Checks a CloneCD file set. Handles opened here are closed on every path, including failures and cancellation; a
 * failed close fails the check. Any identification, archive or entry failure ends the check with its first error.
 */
export async function runSourceCheck(paths: readonly string[], options: SourceCheckOptions = {}): Promise<SourceCheckReport> {
  const handles: ClosableByteSource[] = [];
  const archives: ArchiveCheck[] = [];
  /** Every disc handle opened, so the reported reads cover identification, archives and research archives. */
  const usages: { usage(): { readonly sourceReadBytes: number } }[] = [];
  let error: SourceCheckFailure | null = null;
  let identity: SourceCheckReport['identity'] = null;
  let closeFailures: number;
  try {
    const inputs: DiscInputFile[] = [];
    for (const [index, path] of paths.entries()) {
      let handle: ClosableByteSource;
      try {
        handle = await (options.open ?? NodeByteSource.open)(path);
      } catch {
        throw new CheckStop('read-failed', `input[${index}]`);
      }
      handles.push(handle);
      inputs.push({ name: basename(path), source: handle });
    }
    const opening = { cancellation: options.signal };
    let source: VerifiedSource;
    if (options.catalog === undefined) {
      source = await openVerifiedSource(inputs, opening);
      usages.push(source);
    } else {
      // Synthetic whitelists for tests use the low-level identification the product entry wraps.
      const disc = await openDiscImage(inputs, opening);
      usages.push(disc);
      source = await identifySource(disc, options.catalog);
    }
    identity = { versionId: source.identity.versionId, fingerprint: source.identity.fingerprint, files: source.identity.files.length };
    for (const { path } of source.identity.files.filter(({ path }) => path.endsWith('.NOB'))) {
      await checkArchive(await source.openArchive(path), 'verified', archives);
    }
    const research = options.researchArchives ?? RESEARCH_ARCHIVES;
    if (research.length > 0) {
      // No product reads these, so they go through a separate low-level handle on the same inputs.
      const disc = await openDiscImage(inputs, opening);
      usages.push(disc);
      for (const path of research) await checkArchive(await openImfatArchive(await disc.openFile(path)), 'research', archives);
    }
  } catch (cause) {
    if (cause instanceof CheckStop) error = cause.failure;
    else if (cause instanceof DiscReadError || cause instanceof SourceError) error = { code: cause.code, location: cause.location };
    // Unexpected failures are reported by code only; their text may hold host paths.
    else error = { code: 'internal-error', location: 'check' };
  } finally {
    // async callbacks turn a synchronous throw into a rejection, so every handle still gets its close.
    const closes = await Promise.allSettled(handles.map(async handle => handle.close()));
    closeFailures = closes.filter(result => result.status === 'rejected').length;
    if (closeFailures > 0) error ??= { code: 'read-failed', location: 'input' };
  }
  return {
    format: 'osr-source-check',
    version: 1,
    passed: error === null,
    error,
    closeFailures,
    identity,
    archives,
    reads: { sourceReadBytes: usages.reduce((total, disc) => total + disc.usage().sourceReadBytes, 0) },
  };
}

const USAGE = 'usage: node tools/source-check.ts <file.ccd> <file.img> [<file.sub>] [<file.cue>]';

/**
 * Runs the CLI: prints one JSON report and returns 0 when the check passed, 1 when it failed, 2 on bad usage. Tests may
 * pass check options; the command line always uses the product entry and the default research archives.
 */
export async function main(argv: readonly string[], options: Omit<SourceCheckOptions, 'signal'> = {}): Promise<number> {
  if (argv.length === 0 || argv.some(argument => argument.startsWith('-'))) {
    console.error(USAGE);
    console.log(JSON.stringify({ format: 'osr-source-check', version: 1, passed: false, error: { code: 'usage', location: 'argv' } }));
    return 2;
  }
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  process.once('SIGINT', cancel);
  try {
    const report = await runSourceCheck(argv.map(file => resolve(file)), { ...options, signal: controller.signal });
    console.log(JSON.stringify(report, null, 2));
    return report.passed ? 0 : 1;
  } catch {
    console.log(JSON.stringify({ format: 'osr-source-check', version: 1, passed: false, error: { code: 'internal-error', location: 'cli' } }));
    return 1;
  } finally {
    process.off('SIGINT', cancel);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
