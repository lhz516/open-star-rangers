import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFixtureFiles, fixture, installedBuildFixture, syntheticBytes, syntheticManifest } from './test-support.ts';
import { object } from './packages.ts';
import { COMPLIANCE_OUTPUTS } from './outputs.ts';

const directory = resolve(import.meta.dirname);
type Write = (path: string, content: string | Uint8Array) => void;
function setup(root: string, write: Write, install: boolean): void {
  if (install) installedBuildFixture(root, write);
  else buildFixtureFiles(write);
  const metadata: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!object(metadata) || !object(metadata.scripts)) throw new Error('Fixture scripts missing');
  // Node loads these TypeScript tools directly; avoid rebundling the fixture config.
  write('package.json', JSON.stringify({ ...metadata, scripts: { ...metadata.scripts, build: 'vite build --configLoader native' } }));
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

// Scope coverage of the original scan and inventory validation lives in scan.test.ts and distribution.test.ts; these
// cases cover the real commands: a fresh aggregate build, standalone reports and nonzero exits.
describe('real compliance commands and nonzero failure propagation', () => {
  it('runs a fresh aggregate and standalone reports, and fails original hits, missing inventories and unknown obligations', async () => fixture((root, write) => {
    setup(root, write, true);
    let result = run(root, 'compliance');
    expect(result.status, result.output).toBe(0);
    expect(result.data).toMatchObject({ kind: 'compliance', passed: true, findings: [] });
    const inventoryPath = 'dist/compliance-inventory.json';
    const inventory = readFileSync(join(root, inventoryPath), 'utf8');
    expect(run(root, 'original').data).toMatchObject({ kind: 'original', passed: true });
    expect(run(root, 'licenses').data).toMatchObject({ kind: 'licenses', passed: true });
    expect(readFileSync(join(root, inventoryPath), 'utf8')).toBe(inventory);
    write('renamed.css', syntheticBytes);
    result = run(root, 'original');
    expect(result.status).toBe(1);
    expect(result.data.passed).toBe(false);
    expect(result.data.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'original-hash', scope: 'untracked', path: 'renamed.css' })]));
    unlinkSync(join(root, 'renamed.css'));
    unlinkSync(join(root, inventoryPath));
    result = run(root, 'licenses');
    expect(result.status).toBe(1);
    expect(result.codes).toContain('inventory-read');
    write(inventoryPath, inventory);
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
    // Instead of an installation, link only the packages the commands load before these failures.
    setup(root, write, false);
    for (const name of ['yaml', 'spdx-expression-parse']) {
      mkdirSync(join(root, 'node_modules'), { recursive: true });
      symlinkSync(realpathSync(join(directory, '../../node_modules', name)), join(root, 'node_modules', name), 'junction');
    }
    write('dist/index.html', '<main>Code-owned stale build</main>');
    for (const name of COMPLIANCE_OUTPUTS) write(`dist/${name}`, 'synthetic stale indicator');
    write('docs/original/manifest.md', 'bad synthetic manifest');
    expect(run(root, 'original').codes).toContain('manifest-table');
    unlinkSync(join(root, 'docs/original/manifest.md'));
    expect(run(root, 'original').codes).toContain('ENOENT');
    const metadata: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (!object(metadata) || !object(metadata.scripts)) throw new Error('Fixture scripts missing');
    write('package.json', JSON.stringify({ ...metadata, scripts: { ...metadata.scripts, build: 'node -e "console.error(\'synthetic-test-secret\');process.exit(9)"' } }));
    const failure = run(root, 'compliance');
    expect(failure.status).toBe(1);
    expect(failure.data).toMatchObject({ kind: 'compliance', passed: false });
    expect(failure.codes).toContain('pnpm-failed');
    expect(COMPLIANCE_OUTPUTS.some(name => existsSync(join(root, 'dist', name)))).toBe(false);
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
