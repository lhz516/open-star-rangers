import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Blacklist } from './manifest.ts';
import { ComplianceError, diagnostic, relativePath, report, sha256, type Count, type Finding } from './report.ts';

export type ScanScope = 'worktree' | 'index' | 'untracked' | 'build';
export interface ScanOptions {
  readonly onRead?: (scope: ScanScope, path: string) => void;
  readonly git?: (args: readonly string[]) => Buffer;
}

export function runGit(root: string, args: readonly string[]): Buffer {
  try {
    return execFileSync('git', [...args], { cwd: root, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (cause) {
    const status = typeof cause === 'object' && cause !== null && 'status' in cause ? String(cause.status) : diagnostic(cause).code;
    throw new ComplianceError('git-failed', `Git ${args[0]} failed (exit ${status}); required range not completed`);
  }
}

export function nulPaths(bytes: Buffer): string[] {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes) || (bytes.length > 0 && !text.endsWith('\0'))) {
    throw new ComplianceError('git-path-encoding', 'Git enumeration must be complete UTF-8 NUL records');
  }
  return text ? text.slice(0, -1).split('\0') : [];
}

export function safeFile(root: string, path: string): string {
  relativePath(path);
  if (path.split('/')[0].toLowerCase() === 'local') throw new ComplianceError('forbidden-local', 'Tracked or candidate local paths are not readable', path);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new ComplianceError('unsafe-root', 'Scan root must be an ordinary directory');
  let current = root;
  const parts = path.split('/');
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new ComplianceError('symlink', 'Symbolic links are not followed', path);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new ComplianceError('not-directory', 'A path component is not an ordinary directory', path);
  }
  return current;
}

function hashFile(root: string, path: string, beforeRead: () => void): string {
  const filename = safeFile(root, path);
  const before = lstatSync(filename);
  if (!before.isFile()) throw new ComplianceError('not-file', 'Expected an ordinary file', path);
  const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new ComplianceError('file-changed', 'Candidate changed before reading', path);
    beforeRead();
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let length: number;
    while ((length = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, length));
    const after = fstatSync(fd);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw new ComplianceError('file-changed', 'Candidate changed while hashing', path);
    return hash.digest('hex');
  } finally { closeSync(fd); }
}

function buildFiles(root: string, path = 'dist'): string[] {
  const filename = safeFile(root, path);
  const stat = lstatSync(filename);
  if (path === 'dist' && !stat.isDirectory()) throw new ComplianceError('build-root', 'dist must be an ordinary directory', path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) throw new ComplianceError('not-file', 'Build entries must be ordinary files or directories', path);
  return readdirSync(filename).sort().flatMap(name => buildFiles(root, `${path}/${name}`));
}

export function scanOriginal(directory: string, blacklist: Blacklist, options: ScanOptions = {}) {
  const root = resolve(directory);
  const git = options.git ?? ((args: readonly string[]) => runGit(root, args));
  const counts: Record<ScanScope, Count> = {
    worktree: { checked: 0, completed: false }, index: { checked: 0, completed: false },
    untracked: { checked: 0, completed: false }, build: { checked: 0, completed: false },
  };
  const findings: Finding[] = [];
  const finish = () => report('original', {
    counts, findings, fingerprints: [{ path: 'docs/original/manifest.md', sha256: blacklist.fingerprint }],
  });
  try {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ComplianceError('unsafe-root', 'Repository root must be an ordinary directory');
    const top = git(['rev-parse', '--show-toplevel']).toString('utf8').replace(/\n$/, '');
    if (realpathSync(root) !== realpathSync(top)) throw new ComplianceError('repository-root', 'Scan must start at the complete Git repository root');
  } catch (cause) {
    findings.push(diagnostic(cause));
    return finish();
  }
  function check(scope: ScanScope, path: string, digest: string): void {
    counts[scope] = { ...counts[scope], checked: counts[scope].checked + 1 };
    const matches = blacklist.entries.filter(entry => entry.sha256 === digest);
    if (matches.length) findings.push({
      code: 'original-hash', reason: 'Complete file SHA-256 matches authoritative metadata', scope, path,
      sha256: digest, sources: matches.map(entry => `${entry.table}/${entry.source}`),
    });
  }
  function readDigest(path: string, read: () => string): string {
    try { return read(); } catch (cause) {
      const finding = diagnostic(cause);
      throw new ComplianceError(finding.code, finding.reason, path);
    }
  }
  for (const scope of ['worktree', 'index', 'untracked', 'build'] as const) {
    try {
      if (scope === 'index') {
        for (const record of nulPaths(git(['ls-files', '--stage', '-z']))) {
          const tab = record.indexOf('\t');
          const header = /^(\d{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([0-3])$/.exec(record.slice(0, tab));
          const path = relativePath(record.slice(tab + 1));
          if (!header || tab < 0 || header[3] !== '0' || !['100644', '100755'].includes(header[1])) {
            throw new ComplianceError('index-entry', 'Index requires merged regular-file entries', path);
          }
          if (path.split('/')[0].toLowerCase() === 'local') throw new ComplianceError('forbidden-local', 'Index local paths are not read', path);
          options.onRead?.(scope, path);
          check(scope, path, readDigest(path, () => sha256(git(['cat-file', 'blob', header[2]]))));
        }
      } else {
        const files = scope === 'build' ? buildFiles(root) : [...new Set(nulPaths(git(scope === 'worktree'
          ? ['ls-files', '--cached', '-z'] : ['ls-files', '--others', '--exclude-standard', '-z'])))].sort();
        if (scope === 'build' && files.length === 0) throw new ComplianceError('empty-build', 'dist must contain ordinary files', 'dist');
        for (const path of files) check(scope, path, readDigest(path, () => hashFile(root, path, () => options.onRead?.(scope, path))));
      }
      counts[scope] = { ...counts[scope], completed: true };
    } catch (cause) {
      findings.push({ ...diagnostic(cause), scope });
    }
  }
  return finish();
}
