import type { SeedSource } from '../../app/mission/mission-ports.ts';
import { createSeedSource } from './seed.ts';

/** Seeds from `crypto.getRandomValues`. */
export function createBrowserSeedSource(): SeedSource {
  return createSeedSource(crypto);
}
