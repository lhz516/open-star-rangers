import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { complianceBuildPlugin, COMPLIANCE_OUTPUTS } from './build-plugin.ts';
import { auditPackages } from './packages.ts';
import { validateInventory } from './distribution.ts';
import { fixture, installedBuildFixture } from './test-support.ts';
import { sha256 } from './report.ts';

describe('real build licensing integration', () => {
  it('produces complete stable outputs, fingerprints notices, and invalidates old indicators on failures', async () => fixture(async (root, write) => {
    installedBuildFixture(root, write);
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    const run = (plugins: Plugin[] = []) => build({ root, configFile: false, logLevel: 'silent', plugins: [...plugins, complianceBuildPlugin()], build: { sourcemap: true } });
    await run();
    const first = COMPLIANCE_OUTPUTS.map(name => readFileSync(join(root, 'dist', name), 'utf8'));
    const inventory = validateInventory(root, JSON.parse(first[2]), auditPackages(root));
    expect(inventory.artifacts.some(artifact => artifact.path === 'LICENSE.txt')).toBe(true);
    expect(inventory.artifacts.some(artifact => artifact.path === 'THIRD-PARTY-NOTICES.txt')).toBe(true);
    expect(inventory.artifacts.some(artifact => artifact.path === 'compliance-inventory.json')).toBe(false);
    expect(first.join('\n')).not.toContain(root);
    expect(first[1]).toContain('vite@');
    const { checksum, ...recursive } = { ...inventory, artifacts: [...inventory.artifacts, { path: 'compliance-inventory.json', sha256: '0'.repeat(64), sources: ['generated:inventory'] }] };
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(() => validateInventory(root, { ...recursive, checksum: sha256(JSON.stringify(recursive)) })).toThrow(/digest itself/);
    await run();
    expect(COMPLIANCE_OUTPUTS.map(name => readFileSync(join(root, 'dist', name), 'utf8'))).toEqual(first);
    const vite = auditPackages(root).packages.find(pkg => pkg.name === 'vite');
    if (!vite) throw new Error('Fixture Vite metadata missing');
    unlinkSync(join(root, vite.instance, 'LICENSE.md'));
    await expect(run()).rejects.toThrow(/licensing text/);
    expect(COMPLIANCE_OUTPUTS.every(name => !existsSync(join(root, 'dist', name)))).toBe(true);
    const sourceLicense = resolve(import.meta.dirname, '../../node_modules/vite/LICENSE.md');
    write(`${vite.instance}/LICENSE.md`, readFileSync(sourceLicense));
    await run();
    await expect(build({ root, configFile: false, logLevel: 'silent', plugins: [complianceBuildPlugin()], build: { sourcemap: false } })).rejects.toThrow(/external source maps/);
    expect(COMPLIANCE_OUTPUTS.every(name => !existsSync(join(root, 'dist', name)))).toBe(true);
    write('local/synthetic-protected.js', 'document.body.dataset.protected = "code-owned fixture";');
    write('main.js', 'import "./local/synthetic-protected.js";');
    await expect(run()).rejects.toThrow(/local paths/);
    expect(COMPLIANCE_OUTPUTS.every(name => !existsSync(join(root, 'dist', name)))).toBe(true);
    write('main.js', 'document.body.dataset.fixture = "code-owned synthetic application";');
    await run();
    await expect(run([{
      name: 'controlled-write-failure',
      writeBundle: { order: 'pre', handler() { mkdirSync(join(root, 'dist/THIRD-PARTY-NOTICES.txt.tmp')); } },
    }])).rejects.toThrow();
    expect(COMPLIANCE_OUTPUTS.every(name => !existsSync(join(root, 'dist', name)))).toBe(true);
  }), 30_000);
  it('propagates a real failed build as nonzero without preserving inventory', async () => fixture((root, write) => {
    installedBuildFixture(root, write);
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    write('vite.config.ts', `import {complianceBuildPlugin} from ${JSON.stringify(resolve(import.meta.dirname, 'build-plugin.ts'))}; export default {plugins:[complianceBuildPlugin()],build:{sourcemap:true}};`);
    const cli = resolve(import.meta.dirname, '../../node_modules/vite/bin/vite.js');
    const success = spawnSync(process.execPath, [cli, 'build'], { cwd: root, encoding: 'utf8' });
    expect(success.status, success.stderr).toBe(0);
    write('main.js', 'import "./controlled-missing-module.js";');
    const failed = spawnSync(process.execPath, [cli, 'build'], { cwd: root, encoding: 'utf8' });
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain('controlled-missing-module');
    expect(COMPLIANCE_OUTPUTS.every(name => !existsSync(join(root, 'dist', name)))).toBe(true);
  }), 30_000);
});
