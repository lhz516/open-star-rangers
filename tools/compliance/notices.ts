import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { object, type PackageAudit } from './packages.ts';
import { licensePolicy } from './license-policy.ts';
import { ComplianceError, compare, relativePath, sha256, type DependencyEvidence, type Fingerprint } from './report.ts';
import { safeFile } from './scan.ts';

export const ORIGINAL_RIGHTS_BOUNDARY = 'MIT covers only this project\'s own code, documentation and synthetic resources. It does not grant rights to original Star Rangers programs or game content. This independent synthetic engineering demo is not original gameplay or an officially authorized product. Original data must be obtained legally by its user. Local checks are not legal advice, a clean-room certification, or approval for public release.';

interface LicenseText extends Fingerprint { readonly name: string; readonly text: string }
const licensingName = (name: string): boolean => /(?:^|[-_.])(?:licen[cs]es?|copying|notices?|copyright)(?:[-_.]|$)/i.test(name);
function licensingFiles(root: string, path: string, insideLicenseDirectory = false): string[] {
  const filename = safeFile(root, path);
  const stat = lstatSync(filename);
  const name = basename(path);
  if (stat.isDirectory()) {
    if (name === 'node_modules') return [];
    const licenseDirectory = insideLicenseDirectory || /^licen[cs]es$/i.test(name);
    return readdirSync(filename).sort().flatMap(child => licensingFiles(root, `${path}/${child}`, licenseDirectory));
  }
  if (!stat.isFile()) throw new ComplianceError('license-file', 'Package licensing entries must be ordinary files', path);
  const isText = !/\.(?:js|cjs|mjs|map|json|png|jpg|svg|wasm|node)$/i.test(name);
  return isText && (insideLicenseDirectory || licensingName(name)) ? [path] : [];
}
function readText(root: string, path: string, prefix: string): LicenseText {
  const bytes = readFileSync(safeFile(root, path));
  const text = bytes.toString('utf8');
  if (!text.trim() || text.includes('\0') || !Buffer.from(text).equals(bytes)) throw new ComplianceError('license-text', 'Licensing text is empty, binary or invalid UTF-8', path);
  if (text.includes(root) || /\/(?:Users|home|private)\//.test(text)) throw new ComplianceError('notice-private-path', 'License text contains a private host path requiring review', path);
  return { name: prefix ? path.slice(prefix.length + 1) : path, path, sha256: sha256(bytes), text };
}
function completeLicense(license: string, texts: readonly LicenseText[]): boolean {
  const body = texts.map(text => text.text).join('\n').toLowerCase().replace(/\s+/g, ' ');
  const markers: Record<string, readonly string[]> = {
    MIT: ['permission is hereby granted, free of charge', 'subject to the following conditions', 'copies or substantial portions', 'without warranty of any kind', 'arising from, out of or in connection'],
    'Apache-2.0': ['apache license', 'version 2.0', '1. definitions', '9. accepting warranty', 'end of terms and conditions'],
    'BSD-2-Clause': ['redistribution and use in source and binary forms', 'redistributions of source code', 'redistributions in binary form', 'this software is provided'],
    'BSD-3-Clause': ['redistribution and use in source and binary forms', 'redistributions of source code', 'redistributions in binary form', 'neither the name', 'this software is provided'],
    ISC: ['permission to use, copy, modify', 'the software is provided', 'disclaims all warranties'],
    '0BSD': ['permission to use, copy, modify', 'the software is provided', 'disclaims all warranties'],
    'BlueOak-1.0.0': ['blue oak model license', '1.0.0', 'purpose', 'reliability'],
    'CC0-1.0': ['cc0', 'waiver', 'public license fallback', 'limitations and disclaimers'],
    Unlicense: ['public domain', 'anyone is free to copy', 'the software is provided'],
    Zlib: ['provided', 'as-is', 'origin of this software', 'altered source versions', 'this notice may not be removed'],
    'BSL-1.0': ['boost software license', 'permission is hereby granted', 'the software is provided'],
    'PSF-2.0': ['python software foundation license', 'royalty-free', 'as is'],
  };
  return markers[license]?.every(marker => body.includes(marker)) === true;
}

export function ownLicense(root: string): { text: string; fingerprints: Fingerprint[] } {
  const source = readText(root, 'LICENSE', '');
  if (!completeLicense('MIT', [source]) || !/^copyright.*$/im.test(source.text)) throw new ComplianceError('project-license', 'Project requires complete MIT text and its copyright notice', 'LICENSE');
  return { text: `${source.text.endsWith('\n') ? source.text : `${source.text}\n`}\nRights boundary\n${ORIGINAL_RIGHTS_BOUNDARY}\n`, fingerprints: [{ path: 'LICENSE', sha256: source.sha256 }] };
}

export function thirdPartyNotices(root: string, audit: PackageAudit, dependencies: readonly DependencyEvidence[]): { text: string; fingerprints: Fingerprint[] } {
  const fingerprints: Fingerprint[] = [];
  const sections: string[] = [];
  for (const dependency of [...dependencies].filter(pkg => pkg.distributed).sort((a, b) => compare(a.identity, b.identity))) {
    const pkg = audit.packages.find(pkg => pkg.identity === dependency.identity);
    if (!pkg || pkg.license !== dependency.license) throw new ComplianceError('notice-package', 'Every distributed package needs current audited metadata');
    const selected = licensePolicy(pkg.license, true).selectedLicenses;
    const files = licensingFiles(root, pkg.instance);
    const texts = files.map(path => readText(root, path, pkg.instance));
    const metadataBytes = readFileSync(safeFile(root, `${pkg.instance}/package.json`));
    if (sha256(metadataBytes) !== pkg.metadataSHA256) throw new ComplianceError('changed-license-metadata', 'Package metadata changed after dependency audit', `${pkg.instance}/package.json`);
    let metadata: unknown;
    try { metadata = JSON.parse(metadataBytes.toString('utf8')); } catch { throw new ComplianceError('license-metadata', 'Package metadata JSON is invalid'); }
    if (!object(metadata) || (metadata.files !== undefined && (!Array.isArray(metadata.files) || !metadata.files.every(file => typeof file === 'string')))) {
      throw new ComplianceError('license-metadata', 'Package publication file declarations are invalid');
    }
    if (Array.isArray(metadata.files)) for (const file of metadata.files) {
      if (/[*?{}]/.test(file) || !licensingName(basename(file))) continue;
      const expected = `${pkg.instance}/${relativePath(file)}`;
      if (!texts.some(text => text.path === expected || text.path.startsWith(`${expected}/`))) throw new ComplianceError('missing-declared-notice', 'Declared licensing or NOTICE text is missing', expected);
    }
    if (!texts.length || selected.some(license => !completeLicense(license, texts))) {
      throw new ComplianceError('missing-license-text', 'Distributed package lacks applicable complete licensing text', `${pkg.instance}/package.json`);
    }
    if (!texts.some(text => /(?:^|\n)\s*[#*> -]*copyright\s+(?:\(c\)\s+\S+|©\s+\S+|\d{4})/im.test(text.text))) {
      throw new ComplianceError('missing-copyright', 'Distributed licensing text requires the applicable copyright statement', `${pkg.instance}/package.json`);
    }
    sections.push(`${pkg.name}@${pkg.version}\nInstance: ${pkg.instance}\nDeclared SPDX: ${pkg.license}\nSelected obligations: ${selected.join(' AND ')}\n`
      + texts.map(text => `\n--- ${text.name} ---\n${text.text.endsWith('\n') ? text.text : `${text.text}\n`}`).join(''));
    fingerprints.push(...texts.map(({ path, sha256 }) => ({ path, sha256 })));
  }
  if (!sections.length) throw new ComplianceError('empty-notices', 'Build needs explicit distributed third-party licensing coverage');
  return { text: `Third-party software notices\nBased on actual website modules, embedded source maps and copied assets.\n${ORIGINAL_RIGHTS_BOUNDARY}\n\n${sections.join('\n========================================\n\n')}`, fingerprints };
}
