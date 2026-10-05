import type { Page } from '@playwright/test';
import { test, expect } from './support/browser-test.ts';
import type * as OwnerModule from '../src/app/import/import-job-owner.ts';
import type { ImportJobOwner, ImportJobSnapshot } from '../src/app/import/import-job-owner.ts';
import type * as FactoryModule from '../src/platform/workers/browser-import-worker.ts';
import type * as SyntheticImportModule from '../src/workers/synthetic-import.test-support.ts';
import { PRODUCTION_CATALOG } from '../src/original-data/source/source-catalog.ts';
import { MARKER } from '../src/original-data/disc/disc.test-support.ts';

// P2-04 AC-08 to AC-10: real module Workers in Chromium, loaded through the platform adapter by the app's job owner.
// The page imports modules from the development server, so this spec runs in the development project only. Every file
// name contains MARKER, and every failing test scenario throws text that contains it too.

/** `production` is the real entry, `missing` an entry URL that does not exist, and any other value a test scenario. */
type Entry = 'production' | 'missing' | 'synthetic' | 'busy' | 'job-throws' | 'late-error' | 'top-level-throw';

interface LogEntry {
  readonly event: 'snapshot' | 'click' | 'frame' | 'cancel' | 'dispose';
  readonly at: number;
  readonly snapshot?: ImportJobSnapshot;
  readonly trusted?: boolean;
}

interface Harness {
  owner: ImportJobOwner | null;
  files: File[];
  covered: [string, number][];
  entry: Entry;
  readonly log: LogEntry[];
  record(entry: Omit<LogEntry, 'at'>): void;
  prepare(covered: 'none' | 'production-sized'): Promise<void>;
  createOwner(): void;
  compareTaken(): { group: string; payloads: number; matches: boolean }[] | null;
  startFrames(): void;
}

declare global {
  interface Window { osrImport: Harness }
}

/** Opens the app and installs the page-side harness: an owner whose Worker factory follows `entry`, and an event log. */
async function openHarness(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    const load = <Module>(path: string): Promise<Module> => import(path) as Promise<Module>;
    const { createImportJobOwner } = await load<typeof OwnerModule>('/src/app/import/import-job-owner.ts');
    const { browserImportWorkerFactory } = await load<typeof FactoryModule>('/src/platform/workers/browser-import-worker.ts');
    const support = await load<typeof SyntheticImportModule>('/src/workers/synthetic-import.test-support.ts');
    const startedAt = performance.now();
    const harness: Harness = {
      owner: null, files: [], covered: [], entry: 'production', log: [],
      record: entry => { harness.log.push({ ...entry, at: performance.now() - startedAt }); },
      prepare: async covered => {
        // The production whitelist covers none of these files; the test entry's synthetic whitelist covers all of them.
        const contents = covered === 'none' ? { 'MAIN/OTHER.DAT': support.generatedContent(4096, 7) } : support.productionSizedFiles();
        harness.covered = Object.entries(contents).map(([path, content]) => [path, content instanceof Uint8Array ? content.length : content.byteLength]);
        harness.files = [...(await support.syntheticImport(contents)).files];
      },
      createOwner: () => {
        const createWorker = () => {
          if (harness.entry === 'missing') return new Worker(new URL('/src/workers/missing-import-worker.ts', location.href), { type: 'module' });
          return new Worker(new URL('/src/workers/import-worker.test-support.ts', location.href), { type: 'module', name: harness.entry });
        };
        const owner = createImportJobOwner({
          createPort: harness.entry === 'production' ? browserImportWorkerFactory() : browserImportWorkerFactory(createWorker),
          reportError: error => { throw error; },
        });
        owner.subscribe(() => { harness.record({ event: 'snapshot', snapshot: owner.getSnapshot() }); });
        harness.owner = owner;
      },
      compareTaken: () => {
        const final = harness.owner!.getSnapshot();
        const groups = harness.owner!.takeGroups();
        if (!groups || final.status !== 'finished') return null;
        const expected = support.boundGroups(final.identity.sourceFingerprint);
        const same = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index]);
        return groups.map((item, index) => {
          const payloads = item.payloads as { bytes: Uint8Array }[];
          const reference = expected[index][1].payloads as { bytes: Uint8Array }[];
          return {
            group: item.group, payloads: payloads.length,
            matches: item.group === expected[index][0] && payloads.length === reference.length && payloads.every((payload, at) => same(payload.bytes, reference[at].bytes)),
          };
        });
      },
      startFrames: () => {
        const frame = () => { harness.record({ event: 'frame' }); requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      },
    };
    window.osrImport = harness;
  });
}

/** Prepares files, creates the owner for `entry` and starts a job. */
async function startImport(page: Page, entry: Entry, covered: 'none' | 'production-sized' = 'none'): Promise<void> {
  await page.evaluate(async ({ entry, covered }) => {
    const harness = window.osrImport;
    harness.entry = entry;
    await harness.prepare(covered);
    if (!harness.owner) harness.createOwner();
    harness.owner!.start([...harness.files]);
  }, { entry, covered });
}

const TERMINAL = ['finished', 'failed', 'cancelled'];
const settled = (page: Page) => page.waitForFunction(terminal => terminal.includes(window.osrImport.owner!.getSnapshot().status), TERMINAL);
const snapshots = (page: Page) => page.evaluate(() => window.osrImport.log.flatMap(entry => (entry.snapshot ? [entry.snapshot] : [])));
const probe = (page: Page) => page.evaluate(() => {
  const snapshot = window.osrProbe.snapshot();
  return {
    workers: snapshot.workers.map(({ entry, viteWorker, type, name, posts, terminations }) => ({ entry, viteWorker, type, name, posts, terminations })),
    activeListeners: snapshot.listeners.filter(listener => listener.group === 'worker' && listener.active).length,
    listeners: snapshot.listeners.filter(listener => listener.group === 'worker').length,
  };
});
/** Waits for `count` frames after the last logged event of type `after`, so later notifications would have been seen. */
const framesAfter = (page: Page, after: LogEntry['event'], count = 3) => page.waitForFunction(({ after, count }) => {
  const { log } = window.osrImport;
  const index = log.findLastIndex(entry => entry.event === after);
  return index >= 0 && log.slice(index + 1).filter(entry => entry.event === 'frame').length >= count;
}, { after, count });

/** Every console message of the page and its Workers, any level, for the privacy check. */
function consoleText(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', message => { seen.push(message.text()); });
  page.on('worker', worker => { worker.on('console', message => { seen.push(message.text()); }); });
  return seen;
}

test('production entry reads the synthetic disc in one module Worker and reports the unsupported version', async ({ page }, testInfo) => {
  await openHarness(page);
  await startImport(page, 'production');
  await settled(page);
  const observed = await snapshots(page);
  expect(await probe(page)).toEqual({
    // Built by Vite's Worker transform from the default factory; the owner sent exactly one start message.
    workers: [{ entry: '/src/workers/import-worker.ts', viteWorker: true, type: 'module', name: '', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  expect(observed.some(snapshot => snapshot.status === 'running' && snapshot.stage === 'identify-source' && snapshot.readBytes > 0)).toBe(true);
  expect(observed.at(-1)).toMatchObject({
    status: 'failed', jobId: 1, stage: 'identify-source',
    error: { layer: 'source', code: 'unsupported-version', location: 'file:/MAIN/AISTUFF.NOB', limit: null },
  });
  const reads = observed.flatMap(snapshot => (snapshot.status === 'running' ? [snapshot.readBytes] : []));
  expect(reads).toEqual([...reads].sort((left, right) => left - right));
  const log = await page.evaluate(() => window.osrImport.log.filter(entry => entry.snapshot).map(entry => [entry.snapshot!.status, entry.at] as const));
  const sent = log.find(([status]) => status === 'running')!;
  testInfo.annotations.push({
    type: 'observation',
    description: `production entry: ${reads.at(-1)} bytes read, failed ${Math.round(log.at(-1)![1] - sent[1])} ms after start was sent`,
  });
});

test('test entry identifies production-sized synthetic files and transfers four complete groups', async ({ page }, testInfo) => {
  await openHarness(page);
  await startImport(page, 'synthetic', 'production-sized');
  await settled(page);
  // The generated disc holds the eight whitelisted paths at their production sizes, checked against the catalog itself.
  const covered = await page.evaluate(() => window.osrImport.covered);
  expect(covered.sort()).toEqual(PRODUCTION_CATALOG.files.map(({ path, byteLength }) => [path, byteLength]).sort());
  expect(covered).toHaveLength(8);
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'synthetic', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  const observed = await snapshots(page);
  const final = observed.at(-1)!;
  if (final.status !== 'finished') throw new Error(`expected finished, got ${JSON.stringify(final)}`);
  expect(final.identity.versionId).toBe('synthetic-browser');
  expect(final.groups.map(({ group, status, diagnostics }) => [group, status, diagnostics.length]))
    .toEqual(['logic', 'models', 'cockpit-hud-map', 'audio'].map(group => [group, 'group-complete', 0]));
  // In order: identification, then one more complete group per change, then the end; the job itself throws if a
  // payload it sent was not detached, so finishing proves every group was transferred.
  const identifiedAt = observed.findIndex(snapshot => 'identity' in snapshot && snapshot.identity !== null);
  expect(identifiedAt).toBeGreaterThan(0);
  expect(observed.slice(identifiedAt).map(snapshot => `${snapshot.status}:${'groups' in snapshot ? snapshot.groups.length : '-'}`))
    .toEqual(['running:0', 'running:1', 'running:2', 'running:3', 'running:4', 'finished:4']);
  expect(await page.evaluate(() => window.osrImport.compareTaken()))
    .toEqual(final.groups.map(({ group }) => ({ group, payloads: expect.any(Number), matches: true })));
  const reads = observed.slice(0, identifiedAt).flatMap(snapshot => (snapshot.status === 'running' ? [snapshot.readBytes] : []));
  expect(reads.at(-1)).toBe(final.usage.sourceReadBytes);
  const log = await page.evaluate(() => window.osrImport.log.filter(entry => entry.snapshot).map(entry => entry.at));
  const sentAt = log[observed.findIndex(snapshot => snapshot.status === 'running')];
  testInfo.annotations.push({
    type: 'observation',
    description: `test entry: identified ${final.usage.sourceReadBytes} bytes read in ${Math.round(log[identifiedAt] - sentAt)} ms after start was sent`,
  });
});

test('the page stays responsive while the Worker computes, and a cancelled job is replaced by a clean retry', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await page.evaluate(() => {
    const button = Object.assign(document.createElement('button'), { textContent: 'busy probe' });
    button.dataset.testid = 'busy-probe';
    button.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:1000';
    button.addEventListener('click', event => { window.osrImport.record({ event: 'click', trusted: event.isTrusted }); });
    document.body.append(button);
    window.osrImport.startFrames();
  });
  await startImport(page, 'busy');
  // The busy scenario announces its endless loop with one progress message.
  await page.waitForFunction(() => window.osrImport.owner!.getSnapshot().status === 'running'
    && (window.osrImport.owner!.getSnapshot() as { stage: string | null }).stage === 'identify-source');
  await page.getByTestId('busy-probe').click();
  await framesAfter(page, 'click', 1);
  const cancelled = await page.evaluate(() => {
    const harness = window.osrImport;
    const accepted = harness.owner!.cancel();
    const status = harness.owner!.getSnapshot().status;
    harness.record({ event: 'cancel' });
    return { accepted, status };
  });
  expect(cancelled).toEqual({ accepted: true, status: 'cancelled' });
  await framesAfter(page, 'cancel');
  const order = await page.evaluate(() => window.osrImport.log.map(entry => (entry.snapshot
    ? `snapshot:${entry.snapshot.status}:${'stage' in entry.snapshot ? entry.snapshot.stage : '-'}` : entry.event)));
  const busyAt = order.indexOf('snapshot:running:identify-source');
  const clickAt = order.indexOf('click');
  const cancelAt = order.indexOf('cancel');
  expect(busyAt).toBeGreaterThan(-1);
  expect(clickAt).toBeGreaterThan(busyAt);
  expect(order.slice(clickAt, cancelAt)).toContain('frame');
  // The cancelled snapshot was published synchronously, before the cancel entry, and nothing followed.
  expect(order[cancelAt - 1]).toBe('snapshot:cancelled:identify-source');
  expect(order.slice(cancelAt + 1).every(entry => entry === 'frame')).toBe(true);
  expect(await page.evaluate(() => window.osrImport.log.find(entry => entry.event === 'click')!.trusted)).toBe(true);
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'busy', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  // Retry with the same owner and files: a new Worker and job ID; no state of the cancelled job appears again.
  const retryFrom = await page.evaluate(() => window.osrImport.log.length);
  await startImport(page, 'synthetic', 'production-sized');
  await settled(page);
  const retry = await page.evaluate(from => window.osrImport.log.slice(from).flatMap(entry => (entry.snapshot ? [entry.snapshot] : [])), retryFrom);
  expect(retry[0]).toEqual({ status: 'starting', jobId: 2 });
  expect(retry.every(snapshot => 'jobId' in snapshot && snapshot.jobId === 2)).toBe(true);
  expect(retry.at(-1)!.status).toBe('finished');
  expect((await probe(page)).workers.map(({ name, posts, terminations }) => [name, posts, terminations])).toEqual([['busy', 1, 1], ['synthetic', 1, 1]]);
  expect(JSON.stringify(await snapshots(page))).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});

for (const [entry, code, posts] of [
  ['missing', 'worker-start-failed', 0],
  ['top-level-throw', 'worker-start-failed', 0],
  ['late-error', 'worker-failed', 1],
  ['job-throws', 'internal-error', 1],
] as const) {
  test(`${entry} ends the job with ${code}, and nothing names a file or carries the exception text`, async ({ page }) => {
    const consoled = consoleText(page);
    await openHarness(page);
    await startImport(page, entry);
    await settled(page);
    const observed = await snapshots(page);
    const reason = {
      'worker-start-failed': 'the import Worker could not start', 'worker-failed': 'the import Worker failed', 'internal-error': 'the import job failed unexpectedly',
    }[code];
    expect(observed.at(-1)).toEqual({
      status: 'failed', jobId: 1, stage: entry === 'late-error' ? 'identify-source' : null,
      error: { layer: 'import', code, location: code === 'internal-error' ? 'job' : 'worker', reason, limit: null },
    });
    // Each case loads its own entry; a Worker that never sent ready never receives start.
    expect(await probe(page)).toEqual({
      workers: [{
        entry: entry === 'missing' ? '/src/workers/missing-import-worker.ts' : '/src/workers/import-worker.test-support.ts',
        viteWorker: false, type: 'module', name: entry === 'missing' ? '' : entry, posts, terminations: 1,
      }],
      activeListeners: 0, listeners: 3,
    });
    expect(JSON.stringify(observed)).not.toContain(MARKER);
    expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
  });
}

test('disposing the owner during a job terminates the Worker, removes its listeners and stops notifications', async ({ page }) => {
  const consoled = consoleText(page);
  await openHarness(page);
  await page.evaluate(() => { window.osrImport.startFrames(); });
  await startImport(page, 'busy');
  await page.waitForFunction(() => (window.osrImport.owner!.getSnapshot() as { stage?: string | null }).stage === 'identify-source');
  await page.evaluate(() => {
    window.osrImport.owner!.dispose();
    window.osrImport.record({ event: 'dispose' });
  });
  await framesAfter(page, 'dispose');
  const order = await page.evaluate(() => window.osrImport.log.map(entry => entry.event));
  expect(order.slice(order.indexOf('dispose') + 1).every(event => event === 'frame')).toBe(true);
  expect(await probe(page)).toEqual({
    workers: [{ entry: '/src/workers/import-worker.test-support.ts', viteWorker: false, type: 'module', name: 'busy', posts: 1, terminations: 1 }],
    activeListeners: 0, listeners: 3,
  });
  expect(await page.evaluate(() => window.osrImport.owner!.start([...window.osrImport.files]))).toEqual({ status: 'disposed' });
  expect(JSON.stringify(await snapshots(page))).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
});
