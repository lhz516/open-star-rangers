import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseManifest } from './manifest.ts';
import { runGit, scanOriginal, type ScanScope } from './scan.ts';
import { fixture, syntheticBytes, syntheticManifest } from './test-support.ts';

function git(root: string, ...args: string[]): void { execFileSync('git', args, { cwd: root, stdio: 'ignore' }); }
function setup(root: string, write: (path: string, content: string | Uint8Array) => void): void {
  git(root, 'init', '-q');
  write('.gitignore', 'local/\ndist/\nignored/\n');
  write('tracked.txt', 'self-authored');
  write('dist/index.html', 'self-authored build');
  git(root, 'add', '.gitignore', 'tracked.txt');
}
const blacklist = parseManifest(syntheticManifest());

describe('complete four-scope original isolation', () => {
  it('completes clean scopes and never opens ignored data', async () => fixture((root, write) => {
    setup(root, write);
    write('local/not-opened.dat', syntheticBytes);
    write('ignored/renamed.txt', syntheticBytes);
    write('space and\nnewline.txt', 'synthetic safe file');
    write('dist/nested/main.js.map', 'synthetic map');
    write('dist/THIRD-PARTY-NOTICES.txt', 'synthetic notice');
    const reads: string[] = [];
    const result = scanOriginal(root, blacklist, { onRead: (_scope, path) => { reads.push(path); } });
    expect(result.passed).toBe(true);
    expect(result.counts.build).toEqual({ checked: 3, completed: true });
    expect(reads).toContain('space and\nnewline.txt');
    expect(reads.some(path => /^(local|ignored)\//.test(path))).toBe(false);
  }));
  it.each(['worktree', 'index', 'untracked', 'build'] satisfies ScanScope[])('detects renamed complete bytes in %s', async scope => fixture((root, write) => {
    setup(root, write);
    const path = scope === 'build' ? 'dist/nested/unrelated.css' : scope === 'untracked' ? 'renamed.xyz' : 'tracked.txt';
    write(path, syntheticBytes);
    if (scope === 'index') { git(root, 'add', path); write(path, 'safe current worktree'); }
    const result = scanOriginal(root, blacklist);
    expect(result.passed).toBe(false);
    expect(result.findings.some(finding => finding.code === 'original-hash' && finding.scope === scope && finding.path === path)).toBe(true);
    if (scope === 'index') expect(result.findings.some(finding => finding.code === 'original-hash' && finding.scope === 'worktree')).toBe(false);
  }));
  it('rejects tracked local before reading worktree or index bytes', async () => fixture((root, write) => {
    setup(root, write);
    write('local/forbidden.dat', syntheticBytes);
    git(root, 'add', '-f', 'local/forbidden.dat');
    const reads: string[] = [];
    const result = scanOriginal(root, blacklist, { onRead: (_scope, path) => { reads.push(path); } });
    expect(result.passed).toBe(false);
    expect(result.findings.filter(finding => finding.code === 'forbidden-local')).toHaveLength(2);
    expect(reads).not.toContain('local/forbidden.dat');
  }));
  it('rejects links including ancestor directories without opening targets', async () => fixture((root, write) => {
    setup(root, write);
    write('local/target.dat', syntheticBytes);
    symlinkSync(join(root, 'local/target.dat'), join(root, 'link.txt'));
    git(root, 'add', 'link.txt');
    symlinkSync(join(root, 'local'), join(root, 'dist/linked-directory'));
    const reads: string[] = [];
    const result = scanOriginal(root, blacklist, { onRead: (_scope, path) => { reads.push(path); } });
    expect(result.passed).toBe(false);
    expect(result.findings.some(finding => finding.code === 'symlink')).toBe(true);
    expect(result.findings.some(finding => finding.code === 'index-entry')).toBe(true);
    expect(reads.some(path => path.includes('target.dat') || path === 'link.txt')).toBe(false);
  }));
  it('fails missing candidates, missing/empty dist and failed Git explicitly', async () => fixture((root, write) => {
    setup(root, write);
    unlinkSync(join(root, 'tracked.txt'));
    unlinkSync(join(root, 'dist/index.html'));
    let result = scanOriginal(root, blacklist);
    expect(result.counts.worktree.completed).toBe(false);
    expect(result.counts.build.completed).toBe(false);
    expect(result.findings.some(finding => finding.code === 'empty-build')).toBe(true);
    expect(result.findings.some(finding => finding.path === 'tracked.txt' && finding.code === 'ENOENT')).toBe(true);
    expect(JSON.stringify(result)).not.toContain(root);
    result = scanOriginal(root, blacklist, { git: () => { throw Object.assign(new Error('private fixture reason'), { code: 'EIO' }); } });
    expect(result.passed).toBe(false);
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain('private fixture reason');
  }));
  it('fails a non-Git root and absent dist rather than treating ranges as empty', async () => fixture(root => {
    const result = scanOriginal(root, blacklist);
    expect(result.passed).toBe(false);
    expect(Object.values(result.counts).every(count => !count.completed)).toBe(true);
  }));
  it('rejects traversal enumeration before reading', async () => fixture((root, write) => {
    setup(root, write);
    const result = scanOriginal(root, blacklist, { git: args => args[0] === 'rev-parse' ? runGit(root, args)
      : args.includes('--stage') ? Buffer.from(`100644 ${'0'.repeat(40)} 0\t../local/secret\0`) : Buffer.from('../local/secret\0') });
    expect(result.passed).toBe(false);
    expect(result.findings.some(finding => finding.code === 'unsafe-path')).toBe(true);
    expect(result.findings.some(finding => finding.code === 'unsafe-path' && finding.scope === 'index')).toBe(true);
  }));
  it('rejects missing build directory and read failures', async () => fixture((root, write) => {
    setup(root, write);
    rmSync(join(root, 'dist'), { recursive: true });
    const result = scanOriginal(root, blacklist, { onRead: () => { throw Object.assign(new Error('fixture'), { code: 'EACCES' }); } });
    expect(result.passed).toBe(false);
    expect(result.counts.build.completed).toBe(false);
    expect(result.findings.some(finding => finding.code === 'EACCES')).toBe(true);
    expect(result.findings.some(finding => finding.code === 'ENOENT')).toBe(true);
  }));
  it('rejects actual unmerged index and a repository subdirectory', async () => fixture((root, write) => {
    setup(root, write);
    const blob = runGit(root, ['rev-parse', ':tracked.txt']).toString().trim();
    git(root, 'update-index', '--force-remove', 'tracked.txt');
    execFileSync('git', ['update-index', '--index-info'], { cwd: root, input: `100644 ${blob} 1\ttracked.txt\n` });
    const result = scanOriginal(root, blacklist);
    expect(result.findings.some(finding => finding.code === 'index-entry')).toBe(true);
    mkdirSync(join(root, 'subdirectory'));
    expect(scanOriginal(join(root, 'subdirectory'), blacklist).findings[0].code).toBe('repository-root');
  }));
});
