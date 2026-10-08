/**
 * The development test entry (P2-11 technical decision 7), served only by the development server at
 * `/e2e/entries/app.html`: the production App with synthetic ports. Only this test support reads the page query:
 *
 * - `worker`: the import Worker. A test scenario of `import-scenarios.test-support.ts` (default `models`), `production`
 *   for the real entry, or `missing` for an entry URL that does not exist. The expected package profile is that of the
 *   disc the scenario identifies; `production`, `missing` and scenarios that identify none keep the production profile.
 * - `cache`: `unavailable` for a cache without IndexedDB; a P2-10 failure code for the real cache whose first commit
 *   returns that failure instead; otherwise the real cache.
 * - `capacity`: `insufficient` for a space check that reports 1 KiB available.
 * - `audio`: `unavailable` for an audio capability whose context cannot be created, as without Web Audio.
 * - `hold`: comma-separated cache operations (`commit`, `list`, `restore`) whose results, once the cache has settled
 *   them, wait until the test releases them, so a result can arrive late (P2-12 F-12). Nothing else changes.
 *
 * The profile is published as `window.osrTestEntry.profile` for tests that seed the cache, and the held results as
 * `window.osrTestEntry.cache`: `held(operation)` counts the results waiting and `release(operation)` delivers them.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createResourceCache } from '../platform/storage/browser-resource-cache.ts';
import { cacheFailure, RESOURCE_CACHE_FAILURE_CODES, type ResourceCacheFailureCode } from '../platform/storage/resource-cache-contract.ts';
import { browserImportWorkerFactory } from '../platform/workers/browser-import-worker.ts';
import { scenarioEntryProfile } from '../workers/import-scenarios.test-support.ts';
import type { ExpectedPackageProfile } from '../workers/production-package.ts';
import { App } from './App.tsx';
import { createBrowserPorts } from './browser-ports.ts';
import type { AppPorts } from './ports.ts';
import type { ResourceCachePort } from './resources/resource-holder.ts';
import './app.css';

declare global {
  interface Window {
    osrTestEntry?: {
      readonly profile: ExpectedPackageProfile;
      readonly cache: {
        held(operation: 'commit' | 'list' | 'restore'): number;
        release(operation: 'commit' | 'list' | 'restore'): number;
      };
    };
  }
}

const query = new URLSearchParams(location.search);
const worker = query.get('worker') ?? 'models';
const browser = createBrowserPorts();

function importPort(): AppPorts['createImportPort'] {
  if (worker === 'production') return browser.createImportPort;
  const entry = worker === 'missing' ? '/src/workers/missing-import-worker.ts' : '/src/workers/import-worker.test-support.ts';
  return browserImportWorkerFactory(() => new Worker(new URL(entry, location.href), { type: 'module', name: worker }));
}

type HeldOperation = 'commit' | 'list' | 'restore';
const HELD_OPERATIONS: readonly HeldOperation[] = ['commit', 'list', 'restore'];
const holding = new Set((query.get('hold') ?? '').split(',').filter((name): name is HeldOperation => (HELD_OPERATIONS as readonly string[]).includes(name)));
const waiting: Record<HeldOperation, (() => void)[]> = { commit: [], list: [], restore: [] };

/** The settled result of `run`, delivered only once the test releases `operation` when the query holds it. */
function held<Result>(operation: HeldOperation, run: () => Promise<Result>): Promise<Result> {
  if (!holding.has(operation)) return run();
  const settled = run().then(value => ({ value }), (error: unknown) => ({ error }));
  return settled.then(outcome => new Promise<Result>((resolve, reject) => {
    waiting[operation].push(() => ('error' in outcome ? reject(outcome.error) : resolve(outcome.value)));
  }));
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
    commit: (...args: Parameters<ResourceCachePort['commit']>) => held('commit', async () => {
      if (failure === null || failed) return real.commit(...args);
      failed = true;
      return cacheFailure(failure, 'database');
    }),
    list: () => held('list', () => real.list()),
    restore: (...args: Parameters<ResourceCachePort['restore']>) => held('restore', () => real.restore(...args)),
  });
}

/** The browser audio, or one without Web Audio: creating its context throws as the browser capability does then. */
function audio(): AppPorts['audio'] {
  if (query.get('audio') !== 'unavailable') return browser.audio;
  return Object.freeze({
    ...browser.audio,
    capability: Object.freeze({
      createContext: () => { throw new Error('Web Audio is unavailable (test entry)'); },
      createBuffer: browser.audio.capability.createBuffer,
    }),
  });
}

const ports: AppPorts = Object.freeze({
  ...browser,
  createImportPort: importPort(),
  cache: cache(),
  audio: audio(),
  profile: scenarioEntryProfile(worker) ?? browser.profile,
});
window.osrTestEntry = Object.freeze({
  profile: ports.profile,
  cache: Object.freeze({
    held: (operation: HeldOperation) => waiting[operation].length,
    release: (operation: HeldOperation) => waiting[operation].splice(0).map(deliver => deliver()).length,
  }),
});

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');
createRoot(root).render(
  <StrictMode>
    <App ports={ports} />
  </StrictMode>,
);
