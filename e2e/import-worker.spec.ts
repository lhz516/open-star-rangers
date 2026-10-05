import type { Page } from '@playwright/test';
import { test, expect } from './support/browser-test.ts';
import type * as OwnerModule from '../src/app/import/import-job-owner.ts';
import type { ImportJobSnapshot } from '../src/app/import/import-job-owner.ts';
import type * as FactoryModule from '../src/platform/workers/browser-import-worker.ts';
import type * as SyntheticImportModule from '../src/workers/synthetic-import.test-support.ts';
import { PRODUCTION_CATALOG } from '../src/original-data/source/source-catalog.ts';

// P2-04 AC-08: real module Workers in Chromium, loaded through the platform adapter by the app's job owner. The page
// imports modules from the development server, so this spec runs in the development project only.

type Entry = 'production' | 'synthetic';

interface Observed {
  readonly snapshots: readonly { status: string; stage: string | null; readBytes: number | null; identified: boolean; groups: string[]; at: number }[];
  readonly final: ImportJobSnapshot;
  readonly taken: readonly { group: string; payloads: number; matches: boolean }[] | null;
  readonly workers: { entry: string; viteWorker: boolean; type: string; name: string; posts: number; terminations: number }[];
  /** Disc path and size of every covered file in the generated disc. */
  readonly covered: [string, number][];
  readonly workerListeners: { type: string; active: boolean }[];
  readonly fileNames: string[];
}

/** Runs one import of code-generated CloneCD files to its terminal state and reports what the page observed. */
async function runImport(page: Page, entry: Entry): Promise<Observed> {
  await page.goto('/');
  return page.evaluate(async (entry: Entry) => {
    const load = <Module>(path: string): Promise<Module> => import(path) as Promise<Module>;
    const { createImportJobOwner } = await load<typeof OwnerModule>('/src/app/import/import-job-owner.ts');
    const { browserImportWorkerFactory } = await load<typeof FactoryModule>('/src/platform/workers/browser-import-worker.ts');
    const support = await load<typeof SyntheticImportModule>('/src/workers/synthetic-import.test-support.ts');
    // The production whitelist covers none of these files; the test entry's synthetic whitelist covers all of them.
    const covered = entry === 'production' ? { 'MAIN/OTHER.DAT': support.generatedContent(4096, 7) } : support.productionSizedFiles();
    const { files } = await support.syntheticImport(covered);
    const coveredSizes = Object.entries(covered).map(([path, content]): [string, number] => [path, content instanceof Uint8Array ? content.length : content.byteLength]);
    const createPort = entry === 'production'
      ? browserImportWorkerFactory()
      : browserImportWorkerFactory(() => new Worker(new URL('/src/workers/import-worker.test-support.ts', location.href), { type: 'module', name: 'synthetic' }));
    const owner = createImportJobOwner({ createPort, reportError: error => { throw error; } });
    const snapshots: Observed['snapshots'][number][] = [];
    const startedAt = performance.now();
    await new Promise<void>(resolve => {
      owner.subscribe(() => {
        const snapshot = owner.getSnapshot();
        snapshots.push({
          status: snapshot.status,
          stage: 'stage' in snapshot ? snapshot.stage : null,
          readBytes: snapshot.status === 'running' ? snapshot.readBytes : null,
          identified: 'identity' in snapshot && snapshot.identity !== null,
          groups: 'groups' in snapshot ? snapshot.groups.map(({ group, status }) => `${group}:${status}`) : [],
          at: performance.now() - startedAt,
        });
        if (['finished', 'failed', 'cancelled'].includes(snapshot.status)) resolve();
      });
      owner.start([...files]);
    });
    const final = owner.getSnapshot();
    const groups = owner.takeGroups();
    let taken: Observed['taken'] = null;
    if (groups && final.status === 'finished') {
      const expected = support.boundGroups(final.identity.sourceFingerprint);
      const same = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index]);
      taken = groups.map((item, index) => {
        const payloads = item.payloads as { bytes: Uint8Array }[];
        const reference = expected[index][1].payloads as { bytes: Uint8Array }[];
        return {
          group: item.group,
          payloads: payloads.length,
          matches: item.group === expected[index][0] && payloads.length === reference.length && payloads.every((payload, at) => same(payload.bytes, reference[at].bytes)),
        };
      });
    }
    owner.dispose();
    const probe = window.osrProbe.snapshot();
    return {
      snapshots, final, taken,
      workers: probe.workers.map(({ entry, viteWorker, type, name, posts, terminations }) => ({ entry, viteWorker, type, name, posts, terminations })),
      covered: coveredSizes,
      workerListeners: probe.listeners.filter(listener => listener.group === 'worker').map(({ type, active }) => ({ type, active })),
      fileNames: files.map(file => file.name),
    };
  }, entry);
}

const NATIVE_LISTENERS = [
  { type: 'message', active: false }, { type: 'messageerror', active: false }, { type: 'error', active: false },
];

test('production entry reads the synthetic disc in one module Worker and reports the unsupported version', async ({ page }, testInfo) => {
  const observed = await runImport(page, 'production');
  // Built by Vite's Worker transform from the default factory; the owner sent exactly one start message.
  expect(observed.workers).toEqual([{ entry: '/src/workers/import-worker.ts', viteWorker: true, type: 'module', name: '', posts: 1, terminations: 1 }]);
  expect(observed.workerListeners).toEqual(NATIVE_LISTENERS);
  expect(observed.fileNames.every(name => name.includes('PRIVATE-MARKER'))).toBe(true);
  expect(observed.snapshots.some(({ status, stage, readBytes }) => status === 'running' && stage === 'identify-source' && (readBytes ?? 0) > 0)).toBe(true);
  expect(observed.final).toMatchObject({
    status: 'failed', jobId: 1, stage: 'identify-source',
    error: { layer: 'source', code: 'unsupported-version', location: 'file:/MAIN/AISTUFF.NOB', limit: null },
  });
  const reads = observed.snapshots.flatMap(({ readBytes }) => (readBytes === null ? [] : [readBytes]));
  expect(reads).toEqual([...reads].sort((left, right) => left - right));
  const sent = observed.snapshots.find(({ status }) => status === 'running')!;
  testInfo.annotations.push({
    type: 'observation',
    description: `production entry: ${reads.at(-1)} bytes read, failed ${Math.round(observed.snapshots.at(-1)!.at - sent.at)} ms after start was sent`,
  });
});

test('test entry identifies production-sized synthetic files and transfers four complete groups', async ({ page }, testInfo) => {
  const observed = await runImport(page, 'synthetic');
  // The generated disc holds the eight whitelisted paths at their production sizes, checked against the catalog itself.
  expect(observed.covered.sort()).toEqual(PRODUCTION_CATALOG.files.map(({ path, byteLength }) => [path, byteLength]).sort());
  expect(observed.covered).toHaveLength(8);
  expect(observed.workers).toEqual([{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'synthetic', posts: 1, terminations: 1 }]);
  expect(observed.workerListeners).toEqual(NATIVE_LISTENERS);
  const { final, snapshots } = observed;
  if (final.status !== 'finished') throw new Error(`expected finished, got ${JSON.stringify(final)}`);
  expect(final.identity.versionId).toBe('synthetic-browser');
  expect(final.groups.map(({ group, status, diagnostics }) => [group, status, diagnostics.length]))
    .toEqual(['logic', 'models', 'cockpit-hud-map', 'audio'].map(group => [group, 'group-complete', 0]));
  // In order: identification, then one more complete group per change, then the end; the job itself throws if a
  // payload it sent was not detached, so finishing proves every group was transferred.
  const identifiedAt = snapshots.findIndex(({ identified }) => identified);
  expect(identifiedAt).toBeGreaterThan(0);
  expect(snapshots.slice(identifiedAt).map(({ status, groups }) => `${status}:${groups.length}`))
    .toEqual(['running:0', 'running:1', 'running:2', 'running:3', 'running:4', 'finished:4']);
  expect(observed.taken).toEqual(final.groups.map(({ group }) => ({ group, payloads: expect.any(Number), matches: true })));
  const firstRunning = snapshots.find(({ status }) => status === 'running')!;
  const lastRead = snapshots.slice(0, identifiedAt).flatMap(({ readBytes }) => (readBytes === null ? [] : [readBytes])).at(-1);
  expect(lastRead).toBe(final.usage.sourceReadBytes);
  testInfo.annotations.push({
    type: 'observation',
    description: `test entry: identified ${final.usage.sourceReadBytes} bytes read in ${Math.round(snapshots[identifiedAt].at - firstRunning.at)} ms after start was sent`,
  });
});
