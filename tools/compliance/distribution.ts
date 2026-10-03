import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { Rolldown } from 'vite';
import { licensePolicy } from './license-policy.ts';
import { object, type PackageAudit } from './packages.ts';
import { ComplianceError, compare, packageIdentity, relativePath, sha256, sourceIdentity, type ArtifactEvidence, type DependencyEvidence, type Fingerprint } from './report.ts';
import { safeFile } from './scan.ts';

export interface DistributionOptions {
  readonly publicSources?: Readonly<Record<string, readonly string[]>>;
  readonly additionalInputs?: readonly string[];
}
export interface CollectedDistribution {
  readonly sources: Readonly<Record<string, readonly string[]>>;
  readonly inputs: readonly Fingerprint[];
  readonly dependencies: readonly DependencyEvidence[];
  readonly publicFiles: readonly string[];
}
export interface DistributionInventory {
  readonly format: 'osr-distribution-inventory';
  readonly version: 1;
  readonly inputs: readonly Fingerprint[];
  readonly artifacts: readonly ArtifactEvidence[];
  readonly dependencies: readonly DependencyEvidence[];
  readonly publicFiles: readonly string[];
  readonly coverage: { readonly platform: string; readonly arch: string; readonly skippedOptional: readonly string[] };
  readonly checksum: string;
}

export function ordinaryFiles(root: string, path: string): string[] {
  const filename = safeFile(root, path);
  const stat = lstatSync(filename);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) throw new ComplianceError('distribution-file', 'Distribution inputs must be ordinary files or directories', path);
  return readdirSync(filename).sort().flatMap(name => ordinaryFiles(root, `${path}/${name}`));
}

export function collectDistribution(directory: string, audit: PackageAudit, bundle: Rolldown.OutputBundle, options: DistributionOptions = {}): CollectedDistribution {
  const root = realpathSync(directory);
  const inputs = new Map(audit.fingerprints.map(input => [input.path, input.sha256]));
  const sources: Record<string, readonly string[]> = {};
  const addInput = (path: string): void => { inputs.set(relativePath(path), sha256(readFileSync(safeFile(root, path)))); };
  function owner(id: string): string {
    if (id.startsWith('\0')) {
      const generator = ['\0vite/modulepreload-polyfill.js', '\0vite/preload-helper.js'].includes(id) ? 'vite'
        : id === '\0rolldown/runtime.js' ? 'rolldown' : null;
      const candidates = audit.packages.filter(pkg => pkg.name === generator);
      if (!generator || candidates.length !== 1) throw new ComplianceError('virtual-ownership', 'Virtual module requires an unambiguous generating package');
      return `package:${candidates[0].identity}`;
    }
    const filename = realpathSync(resolve(root, id.split('?')[0]));
    const path = relativePath(relative(root, filename).split('\\').join('/'));
    const pkg = audit.packages.find(pkg => path.startsWith(`${pkg.instance}/`));
    if (path.startsWith('node_modules/') && !pkg) throw new ComplianceError('module-ownership', 'Module has no audited exact package instance');
    if (path.startsWith('public/')) throw new ComplianceError('public-ownership', 'Public sources need explicit ownership declarations', path);
    addInput(path);
    return pkg ? `package:${pkg.identity}` : `project:${path}`;
  }
  const cssOwners = new Set<string>();
  for (const asset of Object.values(bundle)) {
    if (asset.type !== 'chunk') continue;
    const owners = new Set<string>();
    for (const [id, metadata] of Object.entries(asset.modules)) {
      if (id.startsWith('\0') && metadata.renderedLength === 0) continue;
      const source = owner(id);
      if (metadata.renderedLength > 0) owners.add(source);
      if (/\.css(?:\?|$)/.test(id)) cssOwners.add(source);
    }
    if (owners.size === 0) throw new ComplianceError('chunk-ownership', 'Emitted chunk has no attributable module sources', asset.fileName);
    sources[relativePath(asset.fileName)] = [...owners].sort(compare);
  }
  for (const asset of Object.values(bundle)) {
    if (asset.type !== 'asset') continue;
    const path = relativePath(asset.fileName);
    if (path.endsWith('.map')) {
      let map: unknown;
      try { map = JSON.parse(typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8')); } catch {
        throw new ComplianceError('map-format', 'Source map JSON is invalid', path);
      }
      if (!object(map) || !Array.isArray(map.sources) || !map.sources.length || !map.sources.every(source => typeof source === 'string')
        || (map.sourceRoot !== undefined && typeof map.sourceRoot !== 'string')) {
        throw new ComplianceError('map-ownership', 'Source map must expose complete source attribution', path);
      }
      sources[path] = [...new Set(map.sources.map(source => owner(resolve(root, 'dist', dirname(path), typeof map.sourceRoot === 'string' ? map.sourceRoot : '', source))))].sort(compare);
    } else {
      const owners = new Set<string>(path.endsWith('.css') ? cssOwners : []);
      for (const original of asset.originalFileNames) owners.add(owner(original));
      if (owners.size === 0) throw new ComplianceError('asset-ownership', 'Generated asset has no attributable original source', path);
      sources[path] = [...owners].sort(compare);
    }
  }
  const publicFiles = existsSync(join(root, 'public')) ? ordinaryFiles(root, 'public') : [];
  for (const path of publicFiles) {
    const output = path.slice('public/'.length);
    const declared = options.publicSources?.[output];
    if (!declared?.length) throw new ComplianceError('public-ownership', 'Copied public files require explicit project/package ownership', path);
    for (const source of declared) {
      sourceIdentity(source);
      if (source.startsWith('package:') && !audit.packages.some(pkg => source === `package:${pkg.identity}`)) throw new ComplianceError('public-package', 'Public attribution names an unaudited package', path);
      if (source.startsWith('project:') && source !== `project:${path}`) throw new ComplianceError('public-project', 'Self-authored public attribution must name its actual source', path);
      if (source.startsWith('generated:')) throw new ComplianceError('public-generated', 'Copied files cannot claim generated provenance', path);
    }
    addInput(path);
    sources[relativePath(output)] = [...declared].sort(compare);
  }
  for (const path of options.additionalInputs ?? []) addInput(path);
  const shipped = new Set(Object.values(sources).flat().filter(source => source.startsWith('package:')).map(source => source.slice(8)));
  const dependencies = audit.packages.map(pkg => ({
    identity: pkg.identity, name: pkg.name, version: pkg.version, instance: pkg.instance, license: pkg.license, direct: pkg.direct,
    distributed: shipped.has(pkg.identity), ...licensePolicy(pkg.license, shipped.has(pkg.identity)),
  }));
  return { sources, dependencies, publicFiles, inputs: [...inputs].map(([path, sha256]) => ({ path, sha256 })).sort((a, b) => compare(a.path, b.path)) };
}

export function makeInventory(root: string, audit: PackageAudit, collected: CollectedDistribution, generated: Readonly<Record<string, readonly string[]>> = {}): DistributionInventory {
  const attribution = { ...collected.sources, ...generated };
  const files = ordinaryFiles(root, 'dist').map(path => path.slice(5)).filter(path => path !== 'compliance-inventory.json');
  if (!files.length || files.sort().join('\0') !== Object.keys(attribution).sort().join('\0')) throw new ComplianceError('artifact-coverage', 'Final dist and actual build attribution must contain identical file sets');
  const artifacts = files.map(path => ({
    path: relativePath(path), sha256: sha256(readFileSync(safeFile(root, `dist/${path}`))),
    sources: attribution[path].map(sourceIdentity).sort(compare),
  })).sort((a, b) => compare(a.path, b.path));
  const data = {
    format: 'osr-distribution-inventory' as const, version: 1 as const,
    inputs: collected.inputs, artifacts, dependencies: collected.dependencies,
    publicFiles: collected.publicFiles,
    coverage: { platform: audit.platform, arch: audit.arch, skippedOptional: [...audit.skippedOptional].sort(compare) },
  };
  return { ...data, checksum: sha256(JSON.stringify(data)) };
}

export function validateInventory(root: string, value: unknown, audit?: PackageAudit): DistributionInventory {
  if (!object(value) || value.format !== 'osr-distribution-inventory' || value.version !== 1 || typeof value.checksum !== 'string') {
    throw new ComplianceError('inventory-format', 'Expected current distribution inventory format/version');
  }
  const { checksum, ...data } = value;
  if (checksum !== sha256(JSON.stringify(data))) throw new ComplianceError('inventory-checksum', 'Distribution inventory metadata was altered');
  if (!Array.isArray(value.inputs) || !value.inputs.length || !Array.isArray(value.artifacts) || !value.artifacts.length || !Array.isArray(value.dependencies) || !Array.isArray(value.publicFiles) || !object(value.coverage)) {
    throw new ComplianceError('inventory-fields', 'Inventory requires nonempty inputs/artifacts and explicit dependencies/public/coverage');
  }
  const inputs = value.inputs.map(input => {
    if (!object(input) || typeof input.path !== 'string' || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new ComplianceError('inventory-input', 'Invalid input fingerprint');
    const path = relativePath(input.path);
    if (sha256(readFileSync(safeFile(root, path))) !== input.sha256) throw new ComplianceError('stale-input', 'Build input changed; rebuild current code', path);
    return { path, sha256: input.sha256 };
  });
  const artifacts = value.artifacts.map(artifact => {
    if (!object(artifact) || typeof artifact.path !== 'string' || typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256)
      || !Array.isArray(artifact.sources) || !artifact.sources.length || !artifact.sources.every(source => typeof source === 'string')) {
      throw new ComplianceError('inventory-artifact', 'Invalid artifact fingerprint/ownership');
    }
    const path = relativePath(artifact.path);
    if (path === 'compliance-inventory.json') throw new ComplianceError('recursive-inventory', 'Inventory does not digest itself');
    if (sha256(readFileSync(safeFile(root, `dist/${path}`))) !== artifact.sha256) throw new ComplianceError('changed-artifact', 'Distribution artifact changed', `dist/${path}`);
    return { path, sha256: artifact.sha256, sources: artifact.sources.map(sourceIdentity) };
  });
  const files = ordinaryFiles(root, 'dist').map(path => path.slice(5)).filter(path => path !== 'compliance-inventory.json').sort();
  if (files.join('\0') !== artifacts.map(artifact => artifact.path).sort().join('\0')) throw new ComplianceError('artifact-coverage', 'Current dist file set differs from inventory');
  const publicFiles = existsSync(join(root, 'public')) ? ordinaryFiles(root, 'public') : [];
  if (publicFiles.join('\0') !== value.publicFiles.join('\0')) throw new ComplianceError('public-changed', 'Public input file set changed');
  if (typeof value.coverage.platform !== 'string' || typeof value.coverage.arch !== 'string'
    || !Array.isArray(value.coverage.skippedOptional) || !value.coverage.skippedOptional.every(item => typeof item === 'string')) throw new ComplianceError('inventory-platform', 'Explicit platform coverage is required');
  const dependencies = value.dependencies.map(dependency => {
    if (!object(dependency) || typeof dependency.identity !== 'string' || typeof dependency.name !== 'string'
      || typeof dependency.version !== 'string' || typeof dependency.instance !== 'string' || typeof dependency.license !== 'string'
      || typeof dependency.direct !== 'boolean' || typeof dependency.distributed !== 'boolean' || typeof dependency.classification !== 'string'
      || !Array.isArray(dependency.selectedLicenses) || !dependency.selectedLicenses.every(license => typeof license === 'string')) throw new ComplianceError('inventory-package', 'Complete exact package evidence is required');
    const identity = packageIdentity(dependency.identity);
    const instance = relativePath(dependency.instance);
    if (identity !== `${dependency.name}@${dependency.version}#${instance}`) throw new ComplianceError('inventory-package', 'Package identity fields disagree');
    const policy = licensePolicy(dependency.license, dependency.distributed);
    if (policy.classification !== dependency.classification || JSON.stringify(policy.selectedLicenses) !== JSON.stringify(dependency.selectedLicenses)) throw new ComplianceError('inventory-policy', 'Recorded obligations differ from current license policy');
    return { identity, name: dependency.name, version: dependency.version, instance, license: dependency.license, direct: dependency.direct, distributed: dependency.distributed, ...policy };
  });
  const shipped = new Set(artifacts.flatMap(artifact => artifact.sources).filter(source => source.startsWith('package:')).map(source => source.slice(8)));
  if (new Set(dependencies.map(pkg => pkg.identity)).size !== dependencies.length
    || dependencies.some(pkg => pkg.distributed !== shipped.has(pkg.identity))
    || [...shipped].some(identity => !dependencies.some(pkg => pkg.identity === identity))) {
    throw new ComplianceError('inventory-ownership', 'Actual artifact owners and exact package distribution flags disagree');
  }
  if (new Set(inputs.map(input => input.path)).size !== inputs.length) throw new ComplianceError('inventory-input', 'Duplicate input fingerprints');
  if (audit) {
    const current = audit.packages.map(pkg => `${pkg.identity}:${pkg.license}:${pkg.direct}`).sort();
    const recorded = dependencies.map(pkg => `${pkg.identity}:${pkg.license}:${pkg.direct}`).sort();
    if (JSON.stringify(current) !== JSON.stringify(recorded)) throw new ComplianceError('stale-dependencies', 'Inventory and current installed metadata differ');
    for (const fingerprint of audit.fingerprints) {
      if (!inputs.some(input => input.path === fingerprint.path && input.sha256 === fingerprint.sha256)) throw new ComplianceError('inventory-input', 'Current dependency fingerprint is missing or changed', fingerprint.path);
    }
    if (value.coverage.platform !== audit.platform || value.coverage.arch !== audit.arch
      || JSON.stringify([...value.coverage.skippedOptional].sort()) !== JSON.stringify([...audit.skippedOptional].sort())) throw new ComplianceError('stale-platform', 'Inventory platform/optional coverage changed');
  }
  return {
    format: 'osr-distribution-inventory', version: 1, checksum, inputs, artifacts, dependencies, publicFiles,
    coverage: { platform: value.coverage.platform, arch: value.coverage.arch, skippedOptional: value.coverage.skippedOptional.map(packageIdentity) },
  };
}
