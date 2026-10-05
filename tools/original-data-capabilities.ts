// P2-03 S-07/AC-14: the low-level original-data capability families, shared by the ESLint rule in eslint.config.js and
// the dependency graph check in tools/engineering-boundaries.test.ts so both classify modules the same way.

export type CapabilityFamily = 'disc' | 'archive' | 'source';

/** What a restricted module gives an importer outside its family: a capability family, or test and tool support. */
export type RestrictedModule = CapabilityFamily | 'support';

/** The product entry: a source module that uses raw capabilities but exports only the verified-source opening. */
const PRODUCT_ENTRY = /^src\/original-data\/source\/open-verified-source\.tsx?$/;

/** Source modules product code may use besides the entry; they hold no capability and are checked like any importer. */
const PUBLIC_SOURCE = /^src\/original-data\/source\/(?:verify-source-mappings|source-catalog)\.tsx?$/;

/**
 * How a repository-relative module path is restricted, or null when anyone may import it.
 * - support: tests, test support and every repository file outside src/ (tools, E2E support, configuration). They may
 *   use every capability, so production code must not import them and receive one second-hand. Packages are free.
 * - disc: any depth under src/original-data/disc/ except the top-level disc-error and disc-path modules.
 * - archive: any depth under src/original-data/archive/, and imfat.
 * - source: every source module except the product entry and the public ones, so custom-whitelist identification and
 *   any future source module stay inside the source family by default.
 */
export function capabilityOf(path: string): RestrictedModule | null {
  if (/(?:^|\/)node_modules\//.test(path)) return null;
  if (!path.startsWith('src/') || /\.test(?:-support)?\.tsx?$/.test(path)) return 'support';
  if (/^src\/original-data\/disc\/.+\.tsx?$/.test(path) && !/^src\/original-data\/disc\/disc-(?:error|path)\.tsx?$/.test(path)) return 'disc';
  if (/^src\/original-data\/(?:archive\/.+|imfat)\.tsx?$/.test(path)) return 'archive';
  return /^src\/original-data\/source\/.+\.tsx?$/.test(path) && !PRODUCT_ENTRY.test(path) && !PUBLIC_SOURCE.test(path) ? 'source' : null;
}

/** The family an importer belongs to; the source family may use every capability, and others only their own. */
export function familyOf(path: string): CapabilityFamily | null {
  if (path.startsWith('src/original-data/source/')) return PUBLIC_SOURCE.test(path) ? null : 'source';
  if (path.startsWith('src/original-data/disc/')) return 'disc';
  return /^src\/original-data\/(?:archive\/|imfat\.tsx?$)/.test(path) ? 'archive' : null;
}

/** Whether a module is the product entry, which uses raw capabilities but exports no value except its opening. */
export const isProductEntry = (path: string): boolean => PRODUCT_ENTRY.test(path);

/** The product entry's only runtime export, a function declared in the entry; every other export is type-only. */
export const PRODUCT_ENTRY_EXPORT = 'openVerifiedSource';
