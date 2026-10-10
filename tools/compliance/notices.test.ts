import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORIGINAL_RIGHTS_BOUNDARY, ownLicense, thirdPartyNotices } from './notices.ts';
import { fixture } from './test-support.ts';
import { sha256, type DependencyEvidence } from './report.ts';
import type { PackageAudit } from './packages.ts';
import { licensePolicy } from './license-policy.ts';

const mit = readFileSync(new URL('../../LICENSE', import.meta.url), 'utf8').replace('Hanz', 'Fixture Authors');
const apache = readFileSync(resolve(import.meta.dirname, '../../node_modules/@playwright/test/LICENSE'), 'utf8');
const metadata = (license: string, files: readonly string[] = []) => JSON.stringify({ name: 'fixture-package', version: '1.0.0', license, files });
function audit(license: string, files: readonly string[] = []): PackageAudit {
  const instance = 'node_modules/fixture-package';
  return { packages: [{ identity: `fixture-package@1.0.0#${instance}`, name: 'fixture-package', version: '1.0.0', instance, license, direct: false, metadataSHA256: sha256(metadata(license, files)) }], skippedOptional: [], platform: process.platform, arch: process.arch, fingerprints: [] };
}
function evidence(a: PackageAudit): DependencyEvidence[] {
  return a.packages.map(pkg => ({ identity: pkg.identity, name: pkg.name, version: pkg.version, instance: pkg.instance, license: pkg.license, direct: pkg.direct, distributed: true, ...licensePolicy(pkg.license, true) }));
}
describe('complete local licensing texts', () => {
  it('retains all full license, copyright and NOTICE bodies with stable exact package identities', async () => fixture((root, write) => {
    write('LICENSE', mit);
    write('node_modules/fixture-package/LICENSE-MIT.txt', mit);
    write('node_modules/fixture-package/LICENSE-APACHE.txt', apache);
    write('node_modules/fixture-package/THIRD-PARTY-NOTICES.txt', 'Copyright (c) 2026 Fixture Authors\nCode-owned attribution notice.\n');
    const a = audit('MIT AND Apache-2.0');
    write('node_modules/fixture-package/package.json', metadata('MIT AND Apache-2.0'));
    const notice = thirdPartyNotices(root, a, evidence(a));
    expect(notice.text).toContain('fixture-package@1.0.0');
    expect(notice.text).toContain(mit);
    expect(notice.text).toContain(apache);
    expect(notice.text).toContain('Code-owned attribution notice.');
    expect(notice.fingerprints).toHaveLength(3);
    expect(notice.text).not.toContain(root);
    expect(thirdPartyNotices(root, a, evidence(a))).toEqual(notice);
    expect(ownLicense(root).text).toContain('does not grant rights to original Star Rangers');
  }));
  it('states the rights boundary as an independent project without the retired synthetic demo (P3-04)', async () => fixture((root, write) => {
    write('LICENSE', mit);
    write('node_modules/fixture-package/LICENSE', mit);
    const a = audit('MIT');
    write('node_modules/fixture-package/package.json', metadata('MIT'));
    for (const { text } of [ownLicense(root), thirdPartyNotices(root, a, evidence(a))]) {
      expect(text).toContain(`\n${ORIGINAL_RIGHTS_BOUNDARY}\n`);
      expect(text).toContain('This independent project is not original gameplay or an officially authorized product.');
      expect(text).not.toMatch(/demo/i);
    }
  }));
  it('rejects empty/truncated/missing text and missing package evidence', async () => fixture((root, write) => {
    const a = audit('MIT');
    write('node_modules/fixture-package/package.json', metadata('MIT'));
    write('node_modules/fixture-package/README.md', 'No licence text supplied');
    expect(() => thirdPartyNotices(root, a, evidence(a))).toThrow(/complete licensing text/);
    write('node_modules/fixture-package/LICENSE', ' \n');
    expect(() => thirdPartyNotices(root, a, evidence(a))).toThrow(/empty/);
    write('node_modules/fixture-package/LICENSE', 'MIT License\nCopyright (c) 2026 Fixture Authors\nPermission is hereby granted.');
    expect(() => thirdPartyNotices(root, a, evidence(a))).toThrow(/complete licensing text/);
    write('node_modules/fixture-package/LICENSE', mit);
    expect(() => thirdPartyNotices(root, { ...a, packages: [] }, evidence(a))).toThrow(/audited metadata/);
    expect(() => thirdPartyNotices(root, a, [])).toThrow(/explicit distributed/);
  }));
  it('requires both AND texts and does not drop empty NOTICE obligations', async () => fixture((root, write) => {
    const a = audit('MIT AND Apache-2.0');
    write('node_modules/fixture-package/package.json', metadata('MIT AND Apache-2.0'));
    write('node_modules/fixture-package/LICENSE', mit);
    expect(() => thirdPartyNotices(root, a, evidence(a))).toThrow(/complete licensing text/);
    write('node_modules/fixture-package/LICENSE-APACHE', apache);
    write('node_modules/fixture-package/NOTICE', '');
    expect(() => thirdPartyNotices(root, a, evidence(a))).toThrow(/empty/);
  }));
  it('rejects missing copyright and host paths rather than altering mandatory text', async () => fixture((root, write) => {
    const a = audit('MIT');
    write('node_modules/fixture-package/package.json', metadata('MIT'));
    write('node_modules/fixture-package/LICENSE', mit.replace(/^Copyright.*\n/m, ''));
    expect(() => thirdPartyNotices(root, a, evidence(a))).toThrow(/copyright statement/);
    write('node_modules/fixture-package/LICENSE', `${mit}\n/private/synthetic-person/fixture\n`);
    expect(() => thirdPartyNotices(root, a, evidence(a))).toThrow(/private host path/);
    write('LICENSE', 'MIT');
    expect(() => ownLicense(root)).toThrow(/complete MIT/);
  }));
  it('rejects a missing explicitly declared NOTICE even if the license is otherwise complete', async () => fixture((root, write) => {
    const a = audit('MIT', ['LICENSE', 'NOTICE']);
    write('node_modules/fixture-package/package.json', metadata('MIT', ['LICENSE', 'NOTICE']));
    write('node_modules/fixture-package/LICENSE', mit);
    expect(() => thirdPartyNotices(root, a, evidence(a))).toThrow(/NOTICE text is missing/);
  }));
});
