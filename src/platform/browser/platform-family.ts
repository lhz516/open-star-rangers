/** The operating system family; used only to decide the Alt+F4 tip (P3-05 Alt+F4 风险提示). */
export type PlatformFamily = 'mac' | 'windows' | 'linux' | 'other';

/** What the host reports, unvalidated: `navigator.userAgentData?.platform` and `navigator.platform`. */
export interface PlatformFacts {
  readonly userAgentDataPlatform?: unknown;
  readonly platform?: unknown;
}

function reported(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Prefers a nonempty `userAgentData.platform` (`macOS`, `Windows`, `Linux`, …) and otherwise reads `navigator.platform`
 * (`MacIntel`, `Win32`, `Linux x86_64`, …). Anything else, or nothing, is `other`.
 */
export function classifyPlatformFamily(facts: PlatformFacts): PlatformFamily {
  const value = reported(facts.userAgentDataPlatform) ?? reported(facts.platform);
  if (value === null) return 'other';
  if (/^mac/i.test(value)) return 'mac';
  if (/^win/i.test(value)) return 'windows';
  return /linux/i.test(value) ? 'linux' : 'other';
}
