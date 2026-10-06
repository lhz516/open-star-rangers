import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, version, rolldownVersion, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { collectDistribution, makeInventory, validateInventory, type DistributionInventory, type DistributionOptions } from './distribution.ts';
import { fixture } from './test-support.ts';
import { sha256 } from './report.ts';
import { object, type PackageAudit } from './packages.ts';

async function syntheticBuild(root: string, options: DistributionOptions = {}, plugins: Plugin[] = []): Promise<DistributionInventory> {
  const packages = ['fixture-dev-package', 'vite', 'rolldown', ...(existsSync(join(root, 'node_modules/fixture-unused-package')) ? ['fixture-unused-package'] : [])].map(name => {
    const instance = `node_modules/${name}`;
    const bytes = readFileSync(join(root, instance, 'package.json'));
    const metadata: unknown = JSON.parse(bytes.toString());
    if (!object(metadata) || typeof metadata.license !== 'string' || typeof metadata.version !== 'string') throw new Error('Synthetic package metadata missing');
    return { name, version: metadata.version, identity: `${name}@${metadata.version}#${instance}`, instance, license: metadata.license, direct: name === 'fixture-dev-package', metadataSHA256: sha256(bytes) };
  });
  const audit: PackageAudit = {
    packages,
    fingerprints: ['package.json', ...packages.map(pkg => `${pkg.instance}/package.json`)].map(path => ({ path, sha256: sha256(readFileSync(join(root, path))) })),
    skippedOptional: [], platform: process.platform, arch: process.arch,
  };
  let inventory: DistributionInventory | undefined;
  const capture: Plugin = {
    name: 'synthetic-actual-distribution', enforce: 'post',
    writeBundle(_options, bundle) { inventory = makeInventory(root, audit, collectDistribution(root, audit, bundle, options)); },
  };
  await build({ root, configFile: false, logLevel: 'silent', plugins: [...plugins, capture], build: { sourcemap: true }, worker: { format: 'es' } });
  if (!inventory) throw new Error('Actual build capture did not run');
  return inventory;
}
function setup(write: (path: string, content: string | Uint8Array) => void): void {
  write('package.json', JSON.stringify({ type: 'module', devDependencies: { 'fixture-dev-package': '1.0.0' } }));
  write('node_modules/fixture-dev-package/package.json', JSON.stringify({ name: 'fixture-dev-package', version: '1.0.0', type: 'module', exports: './index.js', license: 'MIT' }));
  write('node_modules/fixture-dev-package/index.js', 'export const value = "code-owned synthetic development package";');
  write('index.html', '<main>Synthetic distribution test</main><script type="module" src="/main.js"></script>');
  write('main.js', 'import {value} from "fixture-dev-package"; document.body.dataset.value = value;');
  write('node_modules/vite/package.json', JSON.stringify({ name: 'vite', version, license: 'MIT' }));
  write('node_modules/rolldown/package.json', JSON.stringify({ name: 'rolldown', version: rolldownVersion, license: 'MIT' }));
}
describe('actual Vite distribution ownership', () => {
  it('counts a devDependency bundled into code and source maps as shipped', async () => fixture(async (root, write) => {
    setup(write);
    const inventory = await syntheticBuild(root);
    expect(inventory.dependencies[0].distributed).toBe(true);
    expect(inventory.artifacts.some(artifact => artifact.path.endsWith('.map') && artifact.sources.some(source => source.startsWith('package:fixture-dev-package')))).toBe(true);
    expect(inventory.inputs.some(input => input.path === 'main.js')).toBe(true);
    expect(JSON.stringify(inventory)).not.toContain(root);
    expect(validateInventory(root, inventory)).toEqual(inventory);
    expect(await syntheticBuild(root)).toEqual(inventory);
  }));
  it('requires explicit copied-public ownership and rejects unknown origins', async () => fixture(async (root, write) => {
    setup(write);
    write('public/synthetic-resource.txt', 'code-owned synthetic resource');
    await expect(syntheticBuild(root)).rejects.toThrow(/explicit project\/package ownership/);
    const inventory = await syntheticBuild(root, { publicSources: { 'synthetic-resource.txt': ['project:public/synthetic-resource.txt'] } });
    expect(inventory.artifacts.some(artifact => artifact.path === 'synthetic-resource.txt')).toBe(true);
    write('public/new-resource.txt', 'new synthetic resource');
    expect(() => validateInventory(root, inventory)).toThrow(/Public input/);
  }));
  it('rejects changed inputs/artifacts, omitted ownership, unknown final files and checksum tampering', async () => fixture(async (root, write) => {
    setup(write);
    const inventory = await syntheticBuild(root);
    expect(() => validateInventory(root, { ...inventory, version: 0 })).toThrow(/format/);
    expect(() => validateInventory(root, { ...inventory, dependencies: [] })).toThrow(/altered/);
    const { checksum, ...changed } = { ...inventory, dependencies: inventory.dependencies.map(pkg => ({ ...pkg, distributed: false })) };
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(() => validateInventory(root, { ...changed, checksum: sha256(JSON.stringify(changed)) })).toThrow(/distribution flags disagree/);
    write('main.js', 'document.body.dataset.changed = "synthetic";');
    expect(() => validateInventory(root, inventory)).toThrow(/input changed/);
    setup(write);
    const rebuilt = await syntheticBuild(root);
    write('dist/unknown.bin', 'synthetic unknown artifact');
    expect(() => validateInventory(root, rebuilt)).toThrow(/file set/);
    writeFileSync(join(root, 'dist', rebuilt.artifacts[0].path), 'changed synthetic artifact');
    expect(() => validateInventory(root, rebuilt)).toThrow(/artifact changed/);
  }));
  it('attributes a module Worker, emitted as an asset, through its own source map', async () => fixture(async (root, write) => {
    setup(write);
    write('main.js', 'new Worker(new URL("./worker.js", import.meta.url), { type: "module" });');
    write('worker.js', 'import {value} from "fixture-dev-package"; self.postMessage(value);');
    // Vite writes a Worker's map sources relative to the process directory's dist, as in a real build run from the root.
    const directory = process.cwd();
    process.chdir(root);
    const inventory = await syntheticBuild(root).finally(() => { process.chdir(directory); });
    const worker = inventory.artifacts.find(artifact => /^assets\/worker-[^/]+\.js$/.test(artifact.path));
    expect(worker?.sources).toEqual(expect.arrayContaining(['project:worker.js', expect.stringMatching(/^package:fixture-dev-package@/)]));
    expect(inventory.dependencies.find(pkg => pkg.name === 'fixture-dev-package')?.distributed).toBe(true);
    expect(inventory.inputs.some(input => input.path === 'worker.js')).toBe(true);
    expect(validateInventory(root, inventory)).toEqual(inventory);
  }));
  it('rejects a generated script with a source map that no chunk loads', async () => fixture(async (root, write) => {
    setup(write);
    await expect(syntheticBuild(root, {}, [{
      name: 'unreferenced-synthetic-script',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'assets/unknown.js', source: 'self.postMessage(1);\n//# sourceMappingURL=unknown.js.map\n' });
        this.emitFile({ type: 'asset', fileName: 'assets/unknown.js.map', source: JSON.stringify({ version: 3, file: 'unknown.js', sources: ['../../main.js'], mappings: '' }) });
      },
    }])).rejects.toThrow(/Generated asset/);
  }));
  it('rejects actual unknown virtual modules and generated assets', async () => fixture(async (root, write) => {
    setup(write);
    write('main.js', 'import "unknown-synthetic-module";');
    await expect(syntheticBuild(root, {}, [{
      name: 'unknown-synthetic-origin',
      resolveId(source) { if (source === 'unknown-synthetic-module') return '\0unknown-synthetic-module'; },
      load(id) { if (id === '\0unknown-synthetic-module') return 'document.body.dataset.unknown = "synthetic";'; },
    }])).rejects.toThrow(/Virtual module/);
    setup(write);
    await expect(syntheticBuild(root, {}, [{
      name: 'unknown-synthetic-asset',
      generateBundle() { this.emitFile({ type: 'asset', fileName: 'unknown.bin', source: 'code-owned synthetic bytes' }); },
    }])).rejects.toThrow(/Generated asset/);
  }));
  it('rejects a real bundled forbidden license rather than applying dev exemptions', async () => fixture(async (root, write) => {
    setup(write);
    write('node_modules/fixture-dev-package/package.json', JSON.stringify({ name: 'fixture-dev-package', version: '1.0.0', type: 'module', exports: './index.js', license: 'GPL-3.0-only' }));
    await expect(syntheticBuild(root)).rejects.toThrow(/Website license obligations/);
  }));
  it('attributes real dynamic preload and CJS runtime helpers and excludes unused copyleft', async () => fixture(async (root, write) => {
    setup(write);
    write('node_modules/fixture-dev-package/package.json', JSON.stringify({ name: 'fixture-dev-package', version: '1.0.0', type: 'commonjs', exports: './index.js', license: 'MIT' }));
    write('node_modules/fixture-dev-package/index.js', 'module.exports = "code-owned synthetic CJS";');
    write('main.js', 'import value from "fixture-dev-package"; document.body.dataset.value=value; import("./lazy.js").then(m=>document.body.dataset.lazy=m.value);');
    write('lazy.js', 'export const value="code-owned dynamic module";');
    write('node_modules/fixture-unused-package/package.json', JSON.stringify({ name: 'fixture-unused-package', version: '1.0.0', license: 'MPL-2.0' }));
    const inventory = await syntheticBuild(root);
    expect(inventory.dependencies.find(pkg => pkg.name === 'vite')?.distributed).toBe(true);
    expect(inventory.dependencies.find(pkg => pkg.name === 'rolldown')?.distributed).toBe(true);
    expect(inventory.dependencies.find(pkg => pkg.name === 'fixture-unused-package')).toMatchObject({ distributed: false, classification: 'not-distributed-known-copyleft' });
    expect(inventory.artifacts.filter(artifact => artifact.path.endsWith('.js')).length).toBeGreaterThan(1);
    expect(validateInventory(root, inventory)).toEqual(inventory);
  }));
});
