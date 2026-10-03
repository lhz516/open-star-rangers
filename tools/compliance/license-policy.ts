import parse from 'spdx-expression-parse';
import { ComplianceError } from './report.ts';

const permissive = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Unlicense', 'CC0-1.0', 'Zlib', 'BSL-1.0', 'BlueOak-1.0.0', 'PSF-2.0']);
const localCopyleft = new Set(['MPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later']);
const localAttribution = new Set(['CC-BY-3.0']);

export function licensePolicy(expression: string, distributed: boolean): { classification: string; selectedLicenses: string[] } {
  let tree: parse.Info;
  try { tree = parse(expression); } catch {
    throw new ComplianceError('license-expression', 'Missing, unknown or invalid SPDX expression');
  }
  function select(node: parse.Info): string[] | null {
    if ('license' in node) {
      if (node.exception || node.plus) return null;
      return permissive.has(node.license) || (!distributed && (localCopyleft.has(node.license) || localAttribution.has(node.license))) ? [node.license] : null;
    }
    const left = select(node.left);
    const right = select(node.right);
    if (node.conjunction === 'or') return left ?? right;
    return left && right ? [...left, ...right] : null;
  }
  const selected = select(tree);
  if (!selected) throw new ComplianceError('license-policy', distributed
    ? 'Website license obligations are unsupported; GPL/AGPL forbidden, LGPL needs concrete independent-loading/source/notice review'
    : 'Local package license is unknown or not supported by the recorded policy');
  return {
    classification: selected.every(license => permissive.has(license)) ? 'permissive'
      : selected.some(license => localCopyleft.has(license)) ? 'not-distributed-known-copyleft' : 'not-distributed-known-attribution',
    selectedLicenses: [...new Set(selected)].sort(),
  };
}
