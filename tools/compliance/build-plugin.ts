import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { auditPackages, type PackageAudit } from './packages.ts';
import { collectDistribution, makeInventory, ordinaryFiles, validateInventory, type DistributionOptions } from './distribution.ts';
import { ownLicense, thirdPartyNotices } from './notices.ts';
import { ComplianceError, diagnostic, sha256 } from './report.ts';
import { safeFile } from './scan.ts';

export const COMPLIANCE_OUTPUTS = ['LICENSE.txt', 'THIRD-PARTY-NOTICES.txt', 'compliance-inventory.json'] as const;
export function clearComplianceOutputs(root: string): void {
  if (!existsSync(join(root, 'dist'))) return;
  safeFile(root, 'dist');
  const failures: unknown[] = [];
  for (const name of COMPLIANCE_OUTPUTS) {
    for (const suffix of ['', '.tmp']) {
      const path = `dist/${name}${suffix}`;
      if (!existsSync(join(root, path))) continue;
      try { unlinkSync(safeFile(root, path)); } catch (cause) { failures.push(cause); }
    }
  }
  if (failures.length) throw new ComplianceError('cleanup-outputs', 'Previous compliance outputs could not all be invalidated');
}

export function complianceBuildPlugin(options: DistributionOptions & { readonly audit?: (root: string) => PackageAudit } = {}): Plugin {
  let root = '';
  let audit: PackageAudit | undefined;
  const observed = new Map<string, string>();
  function observe(path: string): void {
    const digest = sha256(readFileSync(safeFile(root, path)));
    if (observed.has(path) && observed.get(path) !== digest) throw new ComplianceError('changed-build-input', 'Input changed during the build', path);
    observed.set(path, digest);
  }
  function publish(name: typeof COMPLIANCE_OUTPUTS[number], text: string): void {
    const destination = safeFile(root, 'dist');
    const temporary = join(destination, `${name}.tmp`);
    if (existsSync(temporary)) throw new ComplianceError('temporary-output', 'Unexpected temporary output; refusing to overwrite it', `dist/${name}.tmp`);
    writeFileSync(temporary, text, { flag: 'wx' });
    renameSync(temporary, join(destination, name));
  }
  return {
    name: 'osr-local-compliance', apply: 'build', enforce: 'post',
    configResolved(config) {
      root = resolve(config.root);
      clearComplianceOutputs(root);
      if (resolve(root, config.build.outDir) !== join(root, 'dist') || config.build.sourcemap !== true) {
        throw new ComplianceError('build-configuration', 'Compliance requires project dist and external source maps');
      }
    },
    buildStart() {
      clearComplianceOutputs(root);
      audit = (options.audit ?? auditPackages)(root);
      observed.clear();
      for (const input of audit.fingerprints) observe(input.path);
      ownLicense(root);
      observe('LICENSE');
      if (existsSync(join(root, 'public'))) {
        for (const path of ordinaryFiles(root, 'public')) {
          if (!options.publicSources?.[path.slice(7)]?.length) throw new ComplianceError('public-ownership', 'Public files require explicit attribution before copying', path);
          observe(path);
        }
      }
    },
    load: {
      order: 'pre',
      handler(id) {
        if (!isAbsolute(id)) return null;
        const path = relative(root, id.split('?')[0]).split('\\').join('/');
        observe(path);
        return null;
      },
    },
    writeBundle: {
      order: 'post',
      handler(_output, bundle) {
        if (!audit) throw new ComplianceError('missing-build-audit', 'Build dependency audit did not complete');
        try {
          for (const path of observed.keys()) observe(path);
          const additional = [...(options.additionalInputs ?? []), 'LICENSE'];
          for (const path of ['vite.config.ts', 'docs/original/manifest.md']) if (existsSync(join(root, path))) additional.push(path);
          if (existsSync(join(root, 'tools/compliance'))) {
            additional.push(...ordinaryFiles(root, 'tools/compliance').filter(path => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('/test-support.ts')));
          }
          const collected = collectDistribution(root, audit, bundle, { ...options, additionalInputs: additional });
          const own = ownLicense(root);
          const thirdParty = thirdPartyNotices(root, audit, collected.dependencies);
          const inputs = new Map([...collected.inputs, ...own.fingerprints, ...thirdParty.fingerprints].map(input => [input.path, input.sha256]));
          publish('LICENSE.txt', own.text);
          publish('THIRD-PARTY-NOTICES.txt', thirdParty.text);
          const inventory = makeInventory(root, audit, {
            ...collected, inputs: [...inputs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, sha256]) => ({ path, sha256 })),
          }, {
            'LICENSE.txt': ['project:LICENSE'],
            'THIRD-PARTY-NOTICES.txt': collected.dependencies.filter(pkg => pkg.distributed).map(pkg => `package:${pkg.identity}`),
          });
          validateInventory(root, inventory, audit);
          publish('compliance-inventory.json', `${JSON.stringify(inventory, null, 2)}\n`);
        } catch (cause) {
          const finding = diagnostic(cause);
          try { clearComplianceOutputs(root); } catch (cleanup) {
            throw new ComplianceError(finding.code, `${finding.reason}; invalidating indicators also failed (${diagnostic(cleanup).code})`, finding.path);
          }
          throw new ComplianceError(finding.code, finding.reason, finding.path);
        }
      },
    },
    buildEnd(error) { if (error) clearComplianceOutputs(root); },
    renderError() { clearComplianceOutputs(root); },
  };
}
