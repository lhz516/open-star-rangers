// P2-03 S-07/AC-14: the low-level original-data capability families, shared by the ESLint rule in eslint.config.js and
// the dependency graph check in tools/engineering-boundaries.test.ts so both classify modules the same way.

export type CapabilityFamily = 'disc' | 'archive' | 'identify';

/**
 * The capability family of a repository-relative module path, or null. Disc covers any depth under
 * src/original-data/disc/ except the top-level disc-error and disc-path modules; archive covers any depth under
 * src/original-data/archive/ and imfat; identify is the custom-whitelist identification. Tests and test support are free.
 */
export function capabilityOf(path: string): CapabilityFamily | null {
  if (/\.test(?:-support)?\.tsx?$/.test(path)) return null;
  if (/^src\/original-data\/disc\/.+\.tsx?$/.test(path) && !/^src\/original-data\/disc\/disc-(?:error|path)\.tsx?$/.test(path)) return 'disc';
  if (/^src\/original-data\/(?:archive\/.+|imfat)\.tsx?$/.test(path)) return 'archive';
  return /^src\/original-data\/source\/identify-source\.tsx?$/.test(path) ? 'identify' : null;
}

/** The family an importer belongs to; the source family may use every capability, and others only their own. */
export function familyOf(path: string): CapabilityFamily | 'source' | null {
  if (path.startsWith('src/original-data/source/')) return 'source';
  if (path.startsWith('src/original-data/disc/')) return 'disc';
  return /^src\/original-data\/(?:archive\/|imfat\.tsx?$)/.test(path) ? 'archive' : null;
}
