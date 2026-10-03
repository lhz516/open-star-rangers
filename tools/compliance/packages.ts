import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { ComplianceError, compare, packageIdentity, relativePath, sha256, type Fingerprint } from './report.ts';
import { runGit, safeFile } from './scan.ts';
import { licensePolicy } from './license-policy.ts';

export interface PackageInstance {
  readonly identity: string; readonly name: string; readonly version: string; readonly instance: string;
  readonly license: string; readonly direct: boolean; readonly metadataSHA256: string;
}
export interface PackageAudit {
  readonly packages: readonly PackageInstance[]; readonly skippedOptional: readonly string[];
  readonly platform: string; readonly arch: string; readonly fingerprints: readonly Fingerprint[];
}
export type PnpmQuery = (args: readonly string[], directory: string) => string;

export function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }

export function queryPnpm(args: readonly string[], directory: string): string {
  try {
    return execFileSync('pnpm', [...args], {
      cwd: directory, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, npm_config_offline: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    const status = object(cause) && 'status' in cause ? String(cause.status) : 'unavailable';
    throw new ComplianceError('pnpm-failed', `pnpm ${args[0]} failed (exit ${status}); dependency range not completed`);
  }
}

export function projectLock(text: string): Record<string, unknown> {
  const docs = parseAllDocuments(text);
  if (docs.some(doc => doc.errors.length > 0)) throw new ComplianceError('lock-format', 'Lock YAML is invalid');
  const candidates = docs.map(doc => doc.toJS() as unknown).filter(value => {
    if (!object(value) || !object(value.importers) || !object(value.importers['.'])) return false;
    const importer = value.importers['.'];
    return ['dependencies', 'devDependencies', 'optionalDependencies'].some(key => key in importer)
      && object(value.packages) && object(value.snapshots);
  });
  if (candidates.length !== 1 || !object(candidates[0])) throw new ComplianceError('project-lock', 'Expected exactly one application lock document; environment-only locks are insufficient');
  return candidates[0];
}

export function frozenValidation(packageText: string, lockText: string, query: PnpmQuery = queryPnpm): void {
  projectLock(lockText);
  const directory = mkdtempSync(join(tmpdir(), 'osr-frozen-'));
  try {
    writeFileSync(join(directory, 'package.json'), packageText);
    writeFileSync(join(directory, 'pnpm-lock.yaml'), lockText);
    query(['install', '--offline', '--frozen-lockfile', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile', '--ignore-workspace', '--reporter=silent'], directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function json(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { throw new ComplianceError('package-json', 'Required dependency JSON is invalid'); }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function containedPackage(root: string, filename: string): string {
  const actual = realpathSync(filename);
  const path = relativePath(relative(root, actual).split('\\').join('/'));
  if (!path.startsWith('node_modules/')) throw new ComplianceError('package-path', 'Package metadata must remain inside project node_modules');
  return actual;
}

export function expandLicenses(root: string, data: unknown, directNames: ReadonlySet<string>): PackageInstance[] {
  const directory = realpathSync(root);
  if (!object(data) || Object.keys(data).length === 0) throw new ComplianceError('license-query', 'pnpm license query must contain package groups');
  const instances = new Map<string, PackageInstance>();
  for (const [license, rows] of Object.entries(data)) {
    if (!Array.isArray(rows) || rows.length === 0) throw new ComplianceError('license-query', 'License groups require nonempty package arrays');
    for (const row of rows) {
      if (!object(row) || typeof row.name !== 'string' || row.license !== license || !strings(row.versions) || !row.versions.length || !strings(row.paths) || !row.paths.length) {
        throw new ComplianceError('license-query', 'Name, exact versions, paths and license metadata are required');
      }
      licensePolicy(license, false);
      const foundVersions = new Set<string>();
      for (const location of row.paths) {
        const actual = containedPackage(directory, location);
        const filename = join(actual, 'package.json');
        const stat = lstatSync(filename);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new ComplianceError('package-json', 'Package metadata must be an ordinary file');
        const bytes = readFileSync(filename);
        const metadata = json(bytes.toString());
        if (!object(metadata) || metadata.name !== row.name || typeof metadata.version !== 'string'
          || !row.versions.includes(metadata.version) || metadata.license !== license) {
          throw new ComplianceError('package-metadata', 'pnpm license records and installed metadata disagree');
        }
        foundVersions.add(metadata.version);
        const instance = relativePath(relative(directory, actual).split('\\').join('/'));
        const identity = packageIdentity(`${row.name}@${metadata.version}#${instance}`);
        if (instances.has(identity)) throw new ComplianceError('package-duplicate', 'Duplicate exact package instance');
        instances.set(identity, {
          identity, name: row.name, version: metadata.version, instance, license, direct: directNames.has(row.name),
          metadataSHA256: sha256(bytes),
        });
      }
      if (row.versions.some(version => !foundVersions.has(version))) throw new ComplianceError('package-version', 'A reported version has no installed instance');
    }
  }
  return [...instances.values()].sort((a, b) => compare(a.identity, b.identity));
}

function platformExcludes(metadata: Record<string, unknown>, platform: string, arch: string): boolean {
  function excluded(value: unknown, actual: string): boolean {
    if (value === undefined) return false;
    if (!strings(value) || !value.length) throw new ComplianceError('optional-platform', 'Platform constraints must be nonempty string arrays');
    return value.includes(`!${actual}`) || (value.some(item => !item.startsWith('!')) && !value.includes(actual));
  }
  return excluded(metadata.os, platform) || excluded(metadata.cpu, arch);
}

function graphInstances(root: string, value: unknown, lock: Record<string, unknown>, skipped: ReadonlySet<string>) {
  if (!Array.isArray(value) || value.length !== 1 || !object(value[0])) throw new ComplianceError('dependency-query', 'Expected one complete project dependency graph');
  const versions = new Map<string, string>();
  const omitted = new Set<string>();
  function walk(node: Record<string, unknown>): void {
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (node[group] === undefined) continue;
      if (!object(node[group])) throw new ComplianceError('dependency-query', 'Invalid dependency graph section');
      for (const [name, child] of Object.entries(node[group])) {
        if (!object(child) || typeof child.version !== 'string' || typeof child.path !== 'string') throw new ComplianceError('dependency-query', 'Dependency graph lacks exact version or path');
        const identity = packageIdentity(`${name}@${child.version}`);
        if (!existsSync(child.path)) {
          const metadata = object(lock.packages) ? lock.packages[identity] : undefined;
          const snapshot = object(lock.snapshots) ? lock.snapshots[identity] : undefined;
          if (!skipped.has(identity) || !object(metadata) || !object(snapshot) || snapshot.optional !== true || !platformExcludes(metadata, process.platform, process.arch)) {
            throw new ComplianceError('missing-installed-package', 'Necessary package instance is missing or optional exclusion is unproven');
          }
          omitted.add(identity);
          continue;
        }
        const actual = containedPackage(root, child.path);
        if (versions.has(actual) && versions.get(actual) !== child.version) throw new ComplianceError('resolution-mismatch', 'One installed instance has conflicting graph versions');
        versions.set(actual, child.version);
        walk(child);
      }
    }
  }
  walk(value[0]);
  return { instances: [...versions].sort(([a], [b]) => compare(a, b)).map(([root, version]) => ({ root, version })), omitted: [...omitted].sort() };
}

export function auditPackages(directory: string, query: PnpmQuery = queryPnpm): PackageAudit {
  const root = realpathSync(resolve(directory));
  runGit(root, ['ls-files', '--error-unmatch', '--', 'package.json', 'pnpm-lock.yaml']);
  const packageText = readFileSync(safeFile(root, 'package.json'), 'utf8');
  const lockText = readFileSync(safeFile(root, 'pnpm-lock.yaml'), 'utf8');
  const manifest = json(packageText);
  if (!object(manifest)) throw new ComplianceError('package-json', 'Project package metadata must be an object');
  const directNames = new Set<string>();
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (manifest[group] !== undefined && !object(manifest[group])) throw new ComplianceError('package-json', 'Project dependency sections must be objects');
    for (const name of Object.keys(manifest[group] ?? {})) directNames.add(name);
  }
  const lock = projectLock(lockText);
  frozenValidation(packageText, lockText, query);
  const installedText = readFileSync(safeFile(root, 'node_modules/.pnpm/lock.yaml'), 'utf8');
  const installed = projectLock(installedText);
  for (const section of ['importers', 'packages', 'snapshots']) {
    if (canonical(lock[section]) !== canonical(installed[section])) throw new ComplianceError('installed-lock-mismatch', `Installed ${section} differs from the tracked project lock`);
  }
  const moduleDocuments = parseAllDocuments(readFileSync(safeFile(root, 'node_modules/.modules.yaml'), 'utf8'));
  if (moduleDocuments.length !== 1 || moduleDocuments[0].errors.length) throw new ComplianceError('module-metadata', 'Installed module metadata is invalid');
  const modules: unknown = moduleDocuments[0].toJS();
  if (!object(modules) || !strings(modules.skipped)) throw new ComplianceError('module-metadata', 'Explicit optional coverage metadata is required');
  const actual = graphInstances(root, json(query(['list', '--depth', '1000', '--json'], root)), lock, new Set(modules.skipped));
  const expected = graphInstances(root, json(query(['list', '--depth', '1000', '--json', '--lockfile-only'], root)), lock, new Set(modules.skipped));
  if (canonical(actual) !== canonical(expected)) throw new ComplianceError('resolution-mismatch', 'Installed and locked dependency instances differ');
  const packages = expandLicenses(root, json(query(['licenses', 'list', '--json'], root)), directNames);
  if (canonical(packages.map(pkg => ({ root: join(root, pkg.instance), version: pkg.version })).sort((a, b) => compare(a.root, b.root))) !== canonical(actual.instances)) {
    throw new ComplianceError('license-coverage', 'License query and metadata must cover every installed graph instance at its locked exact version');
  }
  return {
    packages, skippedOptional: actual.omitted, platform: process.platform, arch: process.arch,
    fingerprints: [
      { path: 'package.json', sha256: sha256(packageText) }, { path: 'pnpm-lock.yaml', sha256: sha256(lockText) },
      { path: 'node_modules/.pnpm/lock.yaml', sha256: sha256(installedText) },
      ...packages.map(pkg => ({ path: `${pkg.instance}/package.json`, sha256: pkg.metadataSHA256 })),
    ],
  };
}
