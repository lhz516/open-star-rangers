import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, installedBuildFixture, syntheticBytes, syntheticManifest } from './test-support.ts';
import { object } from './packages.ts';

const directory = resolve(import.meta.dirname);
function setup(root: string, write: (path: string, content: string | Uint8Array) => void): void {
  installedBuildFixture(root, write);
  for (const name of readdirSync(directory).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'test-support.ts')) {
    write(`tools/compliance/${name}`, readFileSync(join(directory, name)));
  }
  write('vite.config.ts', 'import {complianceBuildPlugin} from "./tools/compliance/build-plugin.ts"; export default {plugins:[complianceBuildPlugin()],build:{sourcemap:true}};');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
}
function run(root: string, kind: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [join(root, 'tools/compliance/cli.ts'), kind, ...args], {
    cwd: root, encoding: 'utf8', timeout: 45_000, maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.error).toBeUndefined();
  expect(result.stdout.trim().length, result.stderr).toBeGreaterThan(0);
  const data: unknown = JSON.parse(result.stdout);
  if (!object(data) || !Array.isArray(data.findings)) throw new Error('Expected structured CLI report');
  expect(data.format).toBe('osr-local-compliance');
  expect(data.version).toBe(1);
  expect(result.stdout).not.toContain(root);
  expect(result.stdout).not.toContain('synthetic-test-secret');
  return { status: result.status, data, output: result.stdout, codes: data.findings.map(finding => object(finding) ? finding.code : null) };
}

describe('real compliance commands and nonzero failure propagation', () => {
  it('runs a fresh aggregate and standalone reports, catches all scopes and stale/unknown obligations', async () => fixture((root, write) => {
    setup(root, write);
    let result = run(root, 'compliance');
    expect(result.status, result.output).toBe(0);
    expect(result.data).toMatchObject({ kind: 'compliance', passed: true, findings: [] });
    const inventoryBefore = readFileSync(join(root, 'dist/compliance-inventory.json'), 'utf8');
    expect(run(root, 'original').data).toMatchObject({ kind: 'original', passed: true });
    expect(run(root, 'licenses').data).toMatchObject({ kind: 'licenses', passed: true });
    expect(readFileSync(join(root, 'dist/compliance-inventory.json'), 'utf8')).toBe(inventoryBefore);
    for (const [scope, path] of [['untracked', 'renamed.css'], ['build', 'dist/nested/renamed.js.map'], ['worktree', 'tracked.dat'], ['index', 'tracked.dat']] as const) {
      write(path, scope === 'worktree' ? 'safe initial bytes' : syntheticBytes);
      if (scope === 'worktree' || scope === 'index') {
        execFileSync('git', ['add', path], { cwd: root });
        write(path, scope === 'worktree' ? syntheticBytes : 'safe worktree after staged hit');
      }
      result = run(root, 'original');
      expect(result.status).toBe(1);
      expect(result.data.passed).toBe(false);
      expect(result.data.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'original-hash', scope, path })]));
      if (scope === 'index') execFileSync('git', ['rm', '--cached', '-f', path], { cwd: root });
      else if (scope === 'worktree') { write(path, 'safe again'); execFileSync('git', ['add', path], { cwd: root }); }
      else unlinkSync(join(root, path));
    }
    write('dist/THIRD-PARTY-NOTICES.txt', 'synthetic corrupted statement');
    expect(run(root, 'licenses').codes).toContain('changed-artifact');
    expect(run(root, 'compliance').status).toBe(0);
    write('main.js', 'document.body.dataset.changed = "new source";');
    expect(run(root, 'licenses').codes).toContain('stale-input');
    expect(run(root, 'compliance').status).toBe(0);
    unlinkSync(join(root, 'dist/compliance-inventory.json'));
    expect(run(root, 'licenses').codes).toContain('inventory-read');
    expect(run(root, 'compliance').status).toBe(0);
    const packagePath = readdirSync(join(root, 'node_modules/.pnpm')).find(name => name.startsWith('react@19.3.0'));
    if (!packagePath) throw new Error('Fixture React instance missing');
    const relative = `node_modules/.pnpm/${packagePath}/node_modules/react/package.json`;
    const metadata: unknown = JSON.parse(readFileSync(join(root, relative), 'utf8'));
    if (!object(metadata)) throw new Error('Fixture package metadata invalid');
    write(relative, JSON.stringify({ ...metadata, license: 'LicenseRef-Unproven' }));
    result = run(root, 'licenses');
    expect(result.status).toBe(1);
    expect(result.codes).toContain('license-policy');
    expect(result.data.findings).toEqual(expect.arrayContaining([expect.objectContaining({ package: 'react@19.3.0' })]));
  }), 45_000);
  it('reports missing inputs, non-Git/unknown CLI and a genuine failed build without stale success', async () => fixture((root, write) => {
    setup(root, write);
    expect(run(root, 'compliance').status).toBe(0);
    write('docs/original/manifest.md', 'bad synthetic manifest');
    expect(run(root, 'original').codes).toContain('manifest-table');
    const missing = join(root, 'docs/original/manifest.md');
    unlinkSync(missing);
    expect(run(root, 'original').codes).toContain('ENOENT');
    const metadata: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (!object(metadata) || !object(metadata.scripts)) throw new Error('Fixture scripts missing');
    write('package.json', JSON.stringify({ ...metadata, scripts: { ...metadata.scripts, build: 'node -e "console.error(\'synthetic-test-secret\');process.exit(9)"' } }));
    const failure = run(root, 'compliance');
    expect(failure.status).toBe(1);
    expect(failure.data).toMatchObject({ kind: 'compliance', passed: false });
    expect(failure.codes).toContain('pnpm-failed');
    expect(existsSync(join(root, 'dist/compliance-inventory.json'))).toBe(false);
    expect(run(root, 'original', '--unexpected', 'synthetic-test-secret').codes).toContain('cli-arguments');
    expect(run(root, 'licenses', '--root', '').codes).toContain('cli-arguments');
    expect(run(root, 'original', '--root', join(root, 'non-git')).data.passed).toBe(false);
    unlinkSync(join(root, 'node_modules/yaml'));
    expect(run(root, 'licenses').codes).toContain('ERR_MODULE_NOT_FOUND');
    write('docs/original/manifest.md', syntheticManifest());
    expect(run(root, 'original').data.passed).toBe(true);
    renameSync(join(root, '.git'), join(root, 'fixture-git-backup'));
    expect(run(root, 'original').codes).toContain('git-failed');
  }), 45_000);
});
