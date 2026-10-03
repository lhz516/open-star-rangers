import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { auditPackages, expandLicenses, frozenValidation, projectLock, queryPnpm, type PnpmQuery } from './packages.ts';
import { fixture } from './test-support.ts';

const root = resolve(import.meta.dirname, '../..');
const packageText = readFileSync(join(root, 'package.json'), 'utf8');
const lockText = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');

describe('current resolved package inventory', () => {
  it('audits actual current resolutions and explicit platform-optional coverage offline', () => {
    const audit = auditPackages(root);
    expect(audit.packages.length).toBeGreaterThan(0);
    expect(new Set(audit.packages.map(pkg => pkg.identity)).size).toBe(audit.packages.length);
    expect(audit.packages.some(pkg => pkg.direct)).toBe(true);
    expect(audit.packages.some(pkg => !pkg.direct)).toBe(true);
    expect(audit.platform).toBe(process.platform);
    expect(audit.arch).toBe(process.arch);
    expect(audit.packages.every(pkg => !audit.skippedOptional.includes(`${pkg.name}@${pkg.version}`))).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(root);
  }, 15_000);
  it('rejects missing/malformed and environment-only lock documents', () => {
    expect(() => projectLock('bad: [')).toThrow();
    expect(() => projectLock('')).toThrow();
    expect(() => projectLock(stringify({
      lockfileVersion: '9.0', importers: { '.': { packageManagerDependencies: { pnpm: '12.8.1' } } }, packages: {}, snapshots: {},
    }))).toThrow(/environment-only/);
    expect(projectLock(lockText)).toHaveProperty('importers');
  });
  it('uses real frozen validation and refuses a changed manifest without installation', () => {
    const changed = JSON.parse(packageText) as { dependencies: Record<string, string> };
    changed.dependencies.react = '1.0.0';
    expect(() => frozenValidation(JSON.stringify(changed), lockText)).toThrow(/pnpm install failed/);
    expect(() => frozenValidation(packageText, lockText)).not.toThrow();
  }, 15_000);
  it('does not convert pnpm errors into empty dependency lists', () => {
    const failed: PnpmQuery = () => { throw new Error('Controlled pnpm failure'); };
    expect(() => auditPackages(root, failed)).toThrow('Controlled pnpm failure');
    expect(() => queryPnpm(['osr-controlled-unknown-command'], root)).toThrow(/pnpm.*failed/);
  });
  it('rejects installed graph divergence even with a valid tracked lock', () => {
    const changed: PnpmQuery = (args, cwd) => {
      if (args[0] !== 'list' || args.includes('--lockfile-only')) return queryPnpm(args, cwd);
      const rows = JSON.parse(queryPnpm(args, cwd)) as { dependencies: Record<string, { version: string }> }[];
      rows[0].dependencies.react.version = '0.0.0';
      return JSON.stringify(rows);
    };
    expect(() => auditPackages(root, changed)).toThrow(/differ|conflicting/);
  }, 15_000);
  it('expands exact versions and peer paths rather than zipping arrays', async () => fixture((directory, write) => {
    const paths = ['node_modules/.pnpm/pkg@1.0.0_peer@2.0.0/node_modules/pkg',
      'node_modules/.pnpm/pkg@1.0.0_peer@3.0.0/node_modules/pkg', 'node_modules/.pnpm/pkg@2.0.0/node_modules/pkg'];
    for (const [index, path] of paths.entries()) write(`${path}/package.json`, JSON.stringify({ name: 'pkg', version: index === 2 ? '2.0.0' : '1.0.0', license: 'MIT' }));
    const input = { MIT: [{ name: 'pkg', license: 'MIT', versions: ['2.0.0', '1.0.0'], paths: paths.map(path => join(directory, path)) }] };
    const packages = expandLicenses(directory, input, new Set(['pkg']));
    expect(packages).toHaveLength(3);
    expect(new Set(packages.map(pkg => pkg.identity)).size).toBe(3);
    expect(packages.filter(pkg => pkg.version === '1.0.0')).toHaveLength(2);
    expect(packages.every(pkg => pkg.direct && !pkg.instance.startsWith('/'))).toBe(true);
    expect(() => expandLicenses(directory, { MIT: [{ ...input.MIT[0], versions: ['1.0.0', '9.0.0'] }] }, new Set())).toThrow();
    expect(() => expandLicenses(directory, { UNKNOWN: [{ ...input.MIT[0], license: 'UNKNOWN' }] }, new Set())).toThrow();
    expect(() => expandLicenses(directory, { MIT: [{ name: 'pkg' }] }, new Set())).toThrow();
  }));
  it('rejects wrong installed lock snapshots and supported optional omissions in a synthetic repository', async () => fixture((directory, write) => {
    execFileSync('git', ['init', '-q'], { cwd: directory });
    const lock = projectLock(lockText);
    write('package.json', packageText);
    write('pnpm-lock.yaml', lockText);
    write('node_modules/.pnpm/lock.yaml', stringify({ ...lock, snapshots: {} }));
    execFileSync('git', ['add', 'package.json', 'pnpm-lock.yaml'], { cwd: directory });
    const fake: PnpmQuery = () => '';
    expect(() => auditPackages(directory, fake)).toThrow(/Installed snapshots/);
    write('node_modules/.pnpm/lock.yaml', stringify(lock));
    write('node_modules/.modules.yaml', 'skipped: []\n');
    const missing: PnpmQuery = args => args[0] === 'install' ? '' : JSON.stringify([{
      dependencies: { react: { version: '19.3.0', path: join(directory, 'node_modules/react') } },
    }]);
    expect(() => auditPackages(directory, missing)).toThrow(/missing|unproven/);
  }));
});
