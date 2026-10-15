import type { BrowserContext, Page } from '@playwright/test';
import { test as pure } from '@playwright/test';
import { PRODUCTION_PACKAGE } from '../src/workers/production-package.ts';
import { productionSizedFiles } from '../src/workers/synthetic-import.test-support.ts';
import { button, chooserInput, discFiles, type FilePayload } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test } from './support/browser-test.ts';
import type { ProbeSnapshot } from './support/browser-probes.ts';
import { endPlaceholder, enterMission, expectAdvancingTick, missionEntry, waitForFrame } from './support/mission-observations.ts';
import { seedProductionCache } from './support/production-cache.ts';
import {
  cacheProblems, compareBalance, expectedPackage, ResourceBalance, warmProblems, type BalanceKind, type BalanceSnapshot, type StoredCacheKeys,
} from './support/resource-balance.ts';
import { entryButton, firstEntry, modelsPackage, viewerDiagnostics } from './support/viewer-observations.ts';
import { RESOURCE_CACHE_DATABASE } from '../src/platform/storage/resource-cache-records.ts';

// P2-12 subtask 04 (S-03, AC-04) and P3-04 subtask 11 (AC-14): controls for the resource balance helper, in both
// projects on the production entry. Deliberate leaks come from a same-origin module under /assets/, so the probes
// attribute them to the application as they would an application leak; a timer that fires is not one. A clean path
// through import, cached restore, viewer, audio and a mission run stays balanced.

test.describe.configure({ timeout: 120_000 });

declare global {
  interface Window { osrBalanceUndo?: () => unknown }
}

const LEAKS = '/assets/osr-balance-leak.js';
const IDLE_WORKER = '/__probe/balance-idle.js';
const PRODUCTION_KEY = Object.freeze({
  originType: 'original-import', originToken: PRODUCTION_PACKAGE.sourceFingerprint, converterVersion: PRODUCTION_PACKAGE.converterVersion,
} as const);

/** Each leak returns its undo; served by a route, so neither build contains it. */
const LEAK_MODULE = `
export function listener() {
  const callback = () => {};
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}
export function observer() {
  const observer = new ResizeObserver(() => {});
  observer.observe(document.body);
  return () => observer.disconnect();
}
export function frame() {
  let handle = requestAnimationFrame(function loop() { handle = requestAnimationFrame(loop); });
  return () => cancelAnimationFrame(handle);
}
export function worker(url) {
  const worker = new Worker(url, { type: 'module' });
  return () => worker.terminate();
}
export function audio() {
  const context = new AudioContext();
  return () => context.close();
}
export function timer() {
  const handle = setTimeout(() => {}, 600000);
  return () => clearTimeout(handle);
}
export function firedTimer() {
  setTimeout(() => {}, 0);
  return () => {};
}
export function beforeunload() {
  const callback = event => { event.preventDefault(); };
  window.addEventListener('beforeunload', callback);
  return () => window.removeEventListener('beforeunload', callback);
}
export function input() {
  const element = document.querySelector('#import-files');
  const callback = () => {};
  element.addEventListener('invalid', callback);
  window.osrRetained = element;
  return () => { element.removeEventListener('invalid', callback); delete window.osrRetained; };
}
`;

async function serveLeaks(context: BrowserContext): Promise<void> {
  await context.route(`**${LEAKS}`, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: LEAK_MODULE }));
  await context.route(`**${IDLE_WORKER}`, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'self.onmessage = () => {};' }));
}

async function openMenu(page: Page): Promise<void> {
  await page.addInitScript(installAudioProbe);
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
}

/** Runs one leak of the route-served module, keeping its undo on the page. */
async function runLeak(page: Page, leak: string): Promise<void> {
  await page.evaluate(async ({ path, leak, url }) => {
    const leaks = await import(path) as Record<string, (url: string) => () => unknown>;
    window.osrBalanceUndo = leaks[leak](url);
  }, { path: LEAKS, leak, url: IDLE_WORKER });
}

const kinds = (problems: readonly { kind: BalanceKind }[]): BalanceKind[] => [...new Set(problems.map(({ kind }) => kind))];

test('reports each deliberate leak of a listener, observer, frame loop, Worker, AudioContext, timer and leave guard, and passes once it is undone', async ({ page, context }, testInfo) => {
  await serveLeaks(context);
  await openMenu(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [] });
  const leaks = [
    ['listener', 'listener'], ['observer', 'observer'], ['frame', 'frame'], ['worker', 'worker'], ['audio', 'audio'], ['timer', 'timer'], ['beforeunload', 'listener'],
  ] as const;
  for (const [leak, kind] of leaks) {
    await runLeak(page, leak);
    const leaked = await balance.measure(`${leak} leaked`, 1_500);
    expect(kinds(leaked.problems), `${leak}: ${JSON.stringify(leaked.problems)}`).toEqual([kind]);
    console.info(`${testInfo.project.name} ${leak} leak: ${leaked.problems.map(({ detail }) => detail).join('; ')}`);
    if (leak === 'timer') expect(leaked.problems.map(({ detail }) => detail)).toEqual([expect.stringMatching(/^pending timer added since the baseline: \d+ \(600000 ms\)$/)]);
    if (leak === 'beforeunload') expect(leaked.problems.map(({ detail }) => detail)).toEqual([expect.stringMatching(/^other listener added since the baseline: \d+:beforeunload:\d+:false$/)]);
    await page.evaluate(async () => { await window.osrBalanceUndo?.(); });
    const undone = await balance.check(`${leak} undone`);
    if (leak === 'timer') {
      const [{ id }] = leaked.snapshot.probe.timers.pending;
      expect(undone.snapshot.probe.timers).toMatchObject({ pending: [], cleared: [id] });
    }
  }
  // A timer that fired is no longer pending: nothing to report.
  const { scheduled, fired } = (await balance.check('before a fired timer')).snapshot.probe.timers;
  await runLeak(page, 'firedTimer');
  const afterFired = await balance.check('timer fired');
  expect(afterFired.snapshot.probe.timers).toMatchObject({ pending: [], scheduled: scheduled + 1 });
  expect(afterFired.snapshot.probe.timers.fired).toHaveLength(fired.length + 1);
  // An application listener on an element React rendered is still the application's once React removes the element.
  await button(page, 'Import original game data').click();
  await runLeak(page, 'input');
  await button(page, 'Return to menu').click();
  const retained = await balance.measure('input listener leaked', 1_500);
  expect(retained.problems.map(({ detail }) => detail)).toEqual([expect.stringMatching(/^other listener added since the baseline: \d+:invalid:\d+:false$/)]);
  await page.evaluate(async () => { await window.osrBalanceUndo?.(); });
  await balance.check('input listener undone');
  // The leaked listener and frame loop were the application's, not the test's; React's own resize listener is on the root.
  const { listeners } = (await balance.measure('final')).snapshot.probe;
  expect(listeners.filter(({ type, group }) => type === 'resize' && group !== 'react').map(({ group, active }) => [group, active])).toEqual([['other', false]]);
  await balance.attach();
});

let productionSized: Promise<FilePayload[]> | undefined;

/** Imports synthetic files at the production whitelist's paths and sizes; the real Worker identifies none. */
async function failIdentification(page: Page): Promise<void> {
  const files = await (productionSized ??= discFiles(productionSizedFiles()));
  await button(page, 'Import original game data').click();
  await page.locator('#import-files').setInputFiles(await chooserInput(files));
  await button(page, 'Start import').click();
  await expect(page.getByTestId('import-failure').locator('dd').nth(1)).toHaveText('unsupported-version');
  await button(page, 'Return to menu').click();
}

/** Opens the viewer on the held package, shows `item` and auditions the first sound, then returns to the menu. */
async function viewRound(page: Page, balance: ResourceBalance, item: string, round: number): Promise<void> {
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await entryButton(page, item).click();
  await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${item}`);
  const diagnostics = await viewerDiagnostics(page);
  expect(diagnostics.state).toBe('ready');
  balance.warm(item, diagnostics.gpu);
  await expect(page.getByTestId('viewer-audio-status')).not.toHaveText('Preparing audio…');
  await page.getByTestId('viewer-sounds').getByRole('button', { name: /^Play / }).first().click();
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.started())).toBe(round);
  await button(page, 'Stop all sounds').click();
  await expect(page.getByTestId('viewer-voices')).toHaveText('0');
  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
}

test('a clean path through import, cached restore, three viewer and audio rounds and a mission run stays balanced, with release kept before each reload', async ({ page }, testInfo) => {
  await openMenu(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [] });

  // The real Worker's job: identified as an unsupported version, its Worker terminated once, with its messages' types only.
  await failIdentification(page);
  const failed = await balance.check('identification failure');
  // The import page's file input left with its element the `invalid` listener React DOM never removes.
  expect(failed.snapshot.probe.listeners.filter(({ element, detached }) => element === 'react' && detached).map(({ type }) => type)).toContain('invalid');
  const [worker, ...others] = failed.snapshot.probe.workers;
  expect(others).toEqual([]);
  expect(worker.jobs).toHaveLength(1);
  expect(worker.posts).toBe(1);
  const types = worker.messages.map(({ type }) => type);
  expect(types[0]).toBe('ready');
  expect(types.at(-1)).toBe('failed');
  expect(worker.messages.filter(({ type }) => type === 'progress').map(({ stage }) => stage)).toContain('identify-source');
  expect(worker.messages.slice(1).every(({ jobId }) => jobId === worker.jobs[0])).toBe(true);
  expect(worker.messages.every(message => Object.keys(message).sort().join() === 'at,jobId,stage,type')).toBe(true);
  expect(worker.messages.every(({ at }) => at < worker.terminatedAt!)).toBe(true);
  const steps = worker.messages.map(({ type, stage }) => (stage ? `${type}/${stage}` : type));
  const runs = steps.reduce<[string | null, number][]>((all, step) => {
    if (all.at(-1)?.[0] === step) all.at(-1)![1]++;
    else all.push([step, 1]);
    return all;
  }, []);
  console.info(`${testInfo.project.name} identification Worker messages: ${runs.map(([step, count]) => (count > 1 ? `${step} ×${count}` : step)).join(', ')}`);
  // A new import screen has a new owner, whose job IDs start again: two Workers with job 1 are two jobs.
  await failIdentification(page);
  const again = await balance.check('second identification failure');
  expect(again.snapshot.probe.workers.map(({ jobs, terminations }) => [jobs, terminations])).toEqual([[[1], 1], [[1], 1]]);

  // A reload before the release evidence is kept is refused; the stale baseline only reports the replaced document.
  await seedProductionCache(page);
  balance.expectPackages([expectedPackage(PRODUCTION_KEY, await modelsPackage())]);
  const released = await balance.beforeReload();
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  expect((await balance.measure('stale baseline', 0)).problems.map(({ kind }) => kind)).toEqual(['document']);
  await balance.rebaseline();
  expect(balance.document).not.toBe(released.snapshot.probe.document);

  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText([
    'Complete resources, viewable', /^Saved in this browser \(restored and verified in /, 'Mission loads into Core',
  ]);
  await balance.check('restored');
  const item = (await firstEntry('model', 'enemy-ship')).entry.id;
  for (let round = 1; round <= 3; round++) {
    await viewRound(page, balance, item, round);
    const report = await balance.check(`viewer round ${round}`);
    expect(report.snapshot.audio?.contexts.map(({ state, closes }) => [state, closes])).toEqual(Array(round).fill(['closed', ['resolved']]));
    expect(report.snapshot.probe.canvases.length).toBe(round);
    expect(report.snapshot.probe.workers).toEqual([]);
  }
  // A mission run: the owner's session listeners, placeholder timers, leave guard and frame loop all end with it.
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure');
  await endPlaceholder(page, 'G-02/2', 'button');
  await expectAdvancingTick(page);
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  await balance.check('mission');

  // A missing payload and an orphan in the test's own cache are both reported against the complete package.
  await page.evaluate(async ({ name, payloadStore }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { reject(request.error); };
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(payloadStore, 'readwrite');
        const store = transaction.objectStore(payloadStore);
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          const [first] = keys.result as string[][];
          store.delete(first);
          store.put({ schemaVersion: 1, bytes: new ArrayBuffer(1) }, [...first.slice(0, 3), 'image/orphan']);
        };
        transaction.oncomplete = () => { resolve(); };
        transaction.onabort = () => { reject(transaction.error); };
      });
    } finally {
      db.close();
    }
  }, RESOURCE_CACHE_DATABASE);
  const damaged = await balance.measure('damaged cache', 1_000);
  expect(kinds(damaged.problems)).toEqual(['cache']);
  expect(damaged.problems.map(({ detail }) => detail.replace(/ .*/, ''))).toEqual(['package', 'orphan']);

  // Without `beforeReload`, the next baseline is refused.
  await page.reload();
  await expect(balance.rebaseline()).rejects.toThrow(/release evidence of document [0-9a-f]{32} was not kept/);
  await balance.attach();
});

const listener = (id: number, group: ProbeSnapshot['listeners'][number]['group'], active = true, more: Partial<ProbeSnapshot['listeners'][number]> = {}): ProbeSnapshot['listeners'][number] => ({
  id, target: 1, type: 'resize', capture: false, group, active, addedAt: id, removedAt: active ? null : id + 1, element: null, detached: false, ...more,
});
const workerRecord = (id: number, jobs: number[], terminations: number): ProbeSnapshot['workers'][number] => ({
  id, entry: '/assets/import-worker.js', viteWorker: false, type: 'module', name: '', posts: jobs.length, terminations, jobs, messages: [], terminatedAt: null,
});
function snapshot(changes: Partial<ProbeSnapshot> = {}, rest: Partial<Omit<BalanceSnapshot, 'probe'>> = {}): BalanceSnapshot {
  return {
    label: 'synthetic', audio: null, cache: null, ...rest,
    probe: {
      document: 'a', listeners: [], observers: [], canvases: [], workers: [], sequence: 0,
      frames: { pending: 0, maximum: 0, requested: 0, delivered: 0, cancelled: 0 }, timers: { pending: [], scheduled: 0, fired: [], cleared: [] }, ...changes,
    },
  };
}
const details = (baseline: BalanceSnapshot, current: BalanceSnapshot, audio = false) => compareBalance(baseline, current, { audio }).problems.map(({ kind, detail }) => `${kind}: ${detail}`);

pure('compares listener groups, Workers, pending timers, audio, canvases, cache keys and warm GPU counts by their rules', () => {
  const base = snapshot({ listeners: [listener(1, 'react'), listener(2, 'vite'), listener(3, 'test')] });
  expect(details(base, base)).toEqual([]);
  // React, Vite, test and unknown groups are all held to the baseline, never ignored.
  for (const group of ['react', 'vite', 'test', 'other'] as const) {
    expect(details(base, snapshot({ listeners: [...base.probe.listeners, listener(9, group)] })), group).toEqual([`listener: ${group} listener added since the baseline: 1:resize:9:false`]);
  }
  expect(details(base, snapshot({ listeners: [listener(1, 'react', false), listener(2, 'vite'), listener(3, 'test')] }))).toEqual(['listener: react listener gone since the baseline: 1:resize:1:false']);
  expect(details(base, snapshot({ ...base.probe, document: 'b' }))).toEqual(['document: document b replaced the baseline\'s a']);
  expect(details(base, snapshot({ ...base.probe, observers: [{ id: 4, targets: [2, 1] }, { id: 5, targets: [] }] }))).toEqual(['observer: observer added since the baseline: 4 on 1,2']);

  // React DOM's element listeners leave with their element; an application listener on a removed element does not.
  const invalid = (id: number, detached: boolean, element: 'react' | null = 'react') => listener(id, 'other', true, { target: id, type: 'invalid', element, detached });
  const withInput = snapshot({ listeners: [...base.probe.listeners, invalid(20, false)] });
  expect(details(withInput, snapshot({ listeners: [...base.probe.listeners, invalid(20, true), invalid(21, false)] }))).toEqual([]);
  expect(details(withInput, snapshot({ listeners: [...base.probe.listeners, invalid(20, true), invalid(21, true)] })))
    .toEqual(['listener: attached React element listeners gone since the baseline: invalid ×1']);
  expect(details(base, snapshot({ listeners: [...base.probe.listeners, invalid(22, false), invalid(23, true, null)] }))).toEqual([
    'listener: other listener added since the baseline: 23:invalid:23:false', 'listener: attached React element listeners added since the baseline: invalid ×1',
  ]);

  // Each Worker terminated exactly once with at most one job; job IDs are the owner's, so two Workers may both have job 1.
  const workers = (...records: ProbeSnapshot['workers']) => details(base, snapshot({ ...base.probe, workers: records }));
  expect(workers(workerRecord(4, [1], 1), workerRecord(5, [], 1), workerRecord(6, [1], 1))).toEqual([]);
  expect(workers(workerRecord(4, [1], 0), workerRecord(5, [2], 2))).toEqual([
    'worker: Worker 4 (/assets/import-worker.js) was terminated 0 times, not once', 'worker: Worker 5 (/assets/import-worker.js) was terminated 2 times, not once',
  ]);
  expect(workers(workerRecord(4, [1, 2], 1))).toEqual(['worker: Worker 4 (/assets/import-worker.js) started jobs 1, 2']);

  // Closed means close() resolved; the audio probe is required unless a test opts out.
  const audio = (contexts: BalanceSnapshot['audio']) => details(base, snapshot(base.probe, { audio: contexts }), true);
  expect(audio({ contexts: [{ id: 1, state: 'closed', closes: ['resolved'] }], routed: 0 })).toEqual([]);
  expect(audio({ contexts: [{ id: 1, state: 'closed', closes: ['pending'] }, { id: 2, state: 'closed', closes: ['rejected'] }, { id: 3, state: 'running', closes: [] }], routed: 1 })).toEqual([
    'audio: AudioContext 1 is closed; close(): pending', 'audio: AudioContext 2 is closed; close(): rejected',
    'audio: AudioContext 3 is running; close(): never called', 'audio: 1 application audio nodes are still connected to a destination',
  ]);
  expect(audio(null)).toEqual(['audio: the page has no audio probe']);
  expect(compareBalance(base, snapshot(base.probe)).problems.map(({ detail }) => detail)).toEqual(['the page has no audio probe']);
  expect(details(base, snapshot(base.probe))).toEqual([]);

  // A released canvas must have lost its context; only one without the extension is left unverified.
  const canvases = compareBalance(base, snapshot({ ...base.probe, canvases: [
    { id: 6, connected: true, extension: true, lost: false }, { id: 7, connected: false, extension: true, lost: false },
    { id: 8, connected: false, extension: false, lost: false }, { id: 9, connected: false, extension: true, lost: true },
  ] }), { audio: false });
  expect(canvases.problems.map(({ detail }) => detail)).toEqual(['connected added since the baseline: canvas 6', 'canvas 7 is released but its context is not lost']);
  expect(canvases.unverifiedContextLoss).toEqual([8]);
  // A frame pending when the window starts and delivered during it leaves nothing pending or requested, yet is not idle.
  const frames = (pending: number, maximum: number, requested: number) => details(base, snapshot({ ...base.probe, frames: { pending, maximum, requested, delivered: 0, cancelled: 0 } }));
  expect(frames(0, 1, 0)).toEqual(['frame: up to 1 owned frames pending, 0 at the end, and 0 requested in the idle window']);
  expect(frames(1, 1, 3)).toEqual(['frame: up to 1 owned frames pending, 1 at the end, and 3 requested in the idle window']);
  // Only pending timers count: one scheduled since the baseline and still pending is a leak, whatever fired or was cleared.
  const timers = (pending: ProbeSnapshot['timers']['pending'], fired: number[] = [], cleared: number[] = []) => ({ pending, scheduled: pending.length + fired.length + cleared.length, fired, cleared });
  const withTimer = snapshot({ ...base.probe, timers: timers([{ id: 7, delay: 3000 }]) });
  expect(details(base, snapshot({ ...base.probe, timers: timers([], [1, 2], [3]) }))).toEqual([]);
  expect(details(base, withTimer)).toEqual(['timer: pending timer added since the baseline: 7 (3000 ms)']);
  expect(details(withTimer, snapshot({ ...base.probe, timers: timers([{ id: 7, delay: 3000 }], [8]) }))).toEqual([]);
  expect(details(withTimer, snapshot({ ...base.probe, timers: timers([{ id: 9, delay: null }], [], [7]) }))).toEqual([
    'timer: pending timer added since the baseline: 9 (non-numeric delay)', 'timer: pending timer gone since the baseline: 7 (3000 ms)',
  ]);

  // Exactly the expected packages with the expected manifests and payloads: no truncated record, orphan or foreign key.
  const key = ['original-import', PRODUCTION_KEY.originToken, PRODUCTION_KEY.converterVersion];
  const expected = { key: PRODUCTION_KEY, groups: [{ group: 'logic', assets: ['a'] }, { group: 'models', assets: ['b', 'c'] }] };
  const stored = (groups: StoredCacheKeys['packages'][number]['groups'], payloads: unknown[], recordKey: unknown = PRODUCTION_KEY, payloadCount: unknown = 3): StoredCacheKeys => ({
    packages: [{ key, recordKey, payloadCount, groups }], payloads,
  });
  const cache = (keys: StoredCacheKeys, packages = [expected]) => cacheProblems(keys, packages).map(({ detail }) => detail.replace(key.join('","'), 'K'));
  const all = ['a', 'b', 'c'].map(id => [...key, id]);
  expect(cache(stored(expected.groups, all))).toEqual([]);
  expect(cache(stored(expected.groups, [all[0], all[2], [...key, 'd'], ['x']]))).toEqual([
    'package ["K"] misses the payload of b', 'orphan payload ["K","d"]', 'orphan payload ["x"]',
  ]);
  // A self-consistent but truncated record is still incomplete against the independent expectation.
  expect(cache(stored([{ group: 'logic', assets: ['a'] }], [all[0]], PRODUCTION_KEY, 1))).toEqual([
    'package ["K"] holds groups [{"group":"logic","assets":["a"]}], not the expected manifests', 'package ["K"] declares 1 payloads, not 3',
    'package ["K"] misses the payload of b', 'package ["K"] misses the payload of c',
  ]);
  expect(cache(stored(expected.groups, all, { ...PRODUCTION_KEY, converterVersion: 'other' }))).toEqual([
    'package ["K"] holds the record key {"originType":"original-import","originToken":"' + PRODUCTION_KEY.originToken + '","converterVersion":"other"}',
  ]);
  expect(cache(stored(expected.groups, all), [])).toEqual(['unexpected package ["K"]', ...all.map(id => `orphan payload ${JSON.stringify(id).replace(key.join('","'), 'K')}`)]);
  expect(cache({ packages: [], payloads: [] })).toEqual(['missing package ["K"]']);
  expect(() => expectedPackage(PRODUCTION_KEY, [])).toThrow(/^groups\.logic /);

  expect(warmProblems(undefined, 'model/a', [1, 2, 3])).toEqual([]);
  expect(warmProblems([1, 2, 3], 'model/a', [1, 2, 3])).toEqual([]);
  expect(warmProblems([1, 2, 3], 'model/a', [1, 3, 3]).map(({ kind }) => kind)).toEqual(['gpu']);
  expect(warmProblems(undefined, 'model/a', null).map(({ kind }) => kind)).toEqual(['gpu']);
});
