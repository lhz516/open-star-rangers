import { classifyPlatformFamily } from './platform-family.ts';
import type { PlatformFamily } from './platform-family.ts';

/** User-Agent Client Hints are not in the DOM library; Chromium exposes them in secure contexts. */
type ClientHintsNavigator = Navigator & { readonly userAgentData?: { readonly platform?: unknown } };

/** Reads the platform family from the browser's own report; nothing is cached or stored. */
export function readBrowserPlatformFamily(): PlatformFamily {
  const { userAgentData, platform } = navigator as ClientHintsNavigator;
  return classifyPlatformFamily({ userAgentDataPlatform: userAgentData?.platform, platform });
}
