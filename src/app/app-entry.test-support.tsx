/**
 * The development test entry (P2-11 technical decision 7), served only by the development server at
 * `/e2e/entries/app.html`: the production App with synthetic ports. Only this test support reads the page query:
 *
 * - `worker`: the import Worker. A test scenario of `import-worker.test-support.ts` (default `models`), `production`
 *   for the real entry, or `missing` for an entry URL that does not exist. The expected package profile is the
 *   scenario's; `production` and `missing` keep the production profile.
 * - `cache`: `unavailable` for a cache without IndexedDB; a P2-10 failure code for the real cache whose first commit
 *   returns that failure instead; otherwise the real cache.
 * - `capacity`: `insufficient` for a space check that reports 1 KiB available.
 *
 * The profile is published as `window.osrTestEntry.profile` for tests that seed the cache.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createResourceCache } from '../platform/storage/browser-resource-cache.ts';
import { cacheFailure, RESOURCE_CACHE_FAILURE_CODES, type ResourceCacheFailureCode } from '../platform/storage/resource-cache-contract.ts';
import { browserImportWorkerFactory } from '../platform/workers/browser-import-worker.ts';
import type { ExpectedPackageProfile } from '../workers/production-package.ts';
import { SCENARIO_SOURCES, scenarioProfile, type IdentifyingScenario } from '../workers/synthetic-import.test-support.ts';
import { App } from './App.tsx';
import { createBrowserPorts } from './browser-ports.ts';
import type { AppPorts } from './ports.ts';
import type { ResourceCachePort } from './resources/resource-holder.ts';
import './app.css';

declare global {
  interface Window { osrTestEntry?: { readonly profile: ExpectedPackageProfile } }
}

const query = new URLSearchParams(location.search);
const worker = query.get('worker') ?? 'models';
const browser = createBrowserPorts();

function importPort(): AppPorts['createImportPort'] {
  if (worker === 'production') return browser.createImportPort;
  const entry = worker === 'missing' ? '/src/workers/missing-import-worker.ts' : '/src/workers/import-worker.test-support.ts';
  return browserImportWorkerFactory(() => new Worker(new URL(entry, location.href), { type: 'module', name: worker }));
}

function cache(): ResourceCachePort {
  const option = query.get('cache');
  if (option === 'unavailable') return createResourceCache({ indexedDB: null });
  const real = browser.cache;
  const failure = (RESOURCE_CACHE_FAILURE_CODES as readonly (string | null)[]).includes(option) ? option as ResourceCacheFailureCode : null;
  const insufficient = query.get('capacity') === 'insufficient';
  let failed = false;
  return Object.freeze({
    checkCapacity: async (requiredBytes: number) => (insufficient
      ? Object.freeze({ status: 'insufficient', requiredBytes, availableBytes: 1024, usage: 0, quota: 1024 } as const)
      : real.checkCapacity(requiredBytes)),
    commit: async (...args: Parameters<ResourceCachePort['commit']>) => {
      if (failure === null || failed) return real.commit(...args);
      failed = true;
      return cacheFailure(failure, 'database');
    },
    list: () => real.list(),
    restore: (...args: Parameters<ResourceCachePort['restore']>) => real.restore(...args),
  });
}

const identifying = Object.hasOwn(SCENARIO_SOURCES, worker);
const ports: AppPorts = Object.freeze({
  ...browser,
  createImportPort: importPort(),
  cache: cache(),
  profile: identifying ? scenarioProfile(worker as IdentifyingScenario) : browser.profile,
});
window.osrTestEntry = Object.freeze({ profile: ports.profile });

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');
createRoot(root).render(
  <StrictMode>
    <App ports={ports} />
  </StrictMode>,
);
