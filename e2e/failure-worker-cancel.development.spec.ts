import type { Page, TestInfo } from '@playwright/test';
import type { ProbeSnapshot } from './support/browser-probes.ts';
import type { ResourceCacheKey } from '../src/platform/storage/resource-cache-contract.ts';
import { RESOURCE_CACHE_DATABASE } from '../src/platform/storage/resource-cache-records.ts';
import { IMPORT_STAGES, type ImportStage } from '../src/workers/import-protocol.ts';
import { LATE_ERROR_RELEASE_CHANNEL } from '../src/workers/import-scenarios.test-support.ts';
import { PRODUCTION_PACKAGE, type ExpectedPackageProfile } from '../src/workers/production-package.ts';
import { MARKER } from '../src/workers/synthetic-import.test-support.ts';
import {
  button, heldCacheResults, openTestEntry, releaseCacheResults, sliceFiles, smallFile, type FilePayload, type TestEntryOptions,
} from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import { consoleText } from './support/browser-test.ts';
import { seedProductionCache } from './support/production-cache.ts';
import { expectedPackage, readCacheKeys, ResourceBalance, type ExpectedPackage } from './support/resource-balance.ts';
import { loadCacheModules, readStoredRecords, seedPackage, type StoredRecords } from './support/resource-cache.ts';
import { InputOrder, orderTokens, type OrderEntry } from './support/responsiveness.ts';
import { entryButton, expectSamples, firstEntry, modelsPackage, pictureOf, pictureSamples, viewerDiagnostics } from './support/viewer-observations.ts';

// P2-12 subtask 09 (S-04, S-05 I-7, AC-08 development part, AC-10): the failure matrix rows F-11 (Worker faults) and
// F-12 (cancellation and late results) on the development test entry, through the import page and the menu, with the
// network audit on. Each case first holds a saved package where the row must keep it, then checks the fixed outcome
// (I-1), what the holder keeps (I-2), the Workers and registrations against the menu baseline (I-3, I-4) and that no
// file name or exception text reaches the page, the console or the probes (I-6). I-5 runs in an import row (F-11) and a
// cancellation row (F-12); I-7 in the released late error (F-11) and in every cancellation (F-12). Cancelling stays on
// the test side: the hold scenarios stop in their stage, and late cache results wait for the test entry's release.
// The isolation of a terminated Worker's callbacks is replayed on controlled ports in import-job-owner.test.ts and
// resource-holder-cache.test.ts; a real Worker here only proves it was terminated.

test.describe.configure({ timeout: 120_000 });

/** Frames that must follow an ending dispatch with nothing else, so a late message would have been seen. */
const SETTLE_FRAMES = 10;

const SAVED_BY_COMMIT = /^Saved in this browser \(saved in \d+(?: ms|\.\d\d s)\)$/;
const SAVED_BY_RESTORE = /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/;
const CANCELLED = /^Import cancelled after \d+(?: ms|\.\d\d s)\. No partial result was kept\.$/;
const NONE = 'Original game data: None in this browser.';
const HELD = 'Original game data: Resources are held in this page.';
/** The menu statuses of the slice disc's package once its import was saved. */
const IMPORTED_MENU = ['Complete resources, viewable', SAVED_BY_COMMIT, 'Mission loads into Core'];

/** Files the Worker fault and progress scenarios never read; their names and content carry the file-name marker. */
const UNREAD_FILES: readonly FilePayload[] = [smallFile(`${MARKER}-disc.ccd`), smallFile(`${MARKER}-disc.img`)];

const keyOf = ({ sourceFingerprint, converterVersion }: ExpectedPackageProfile): ResourceCacheKey =>
  Object.freeze({ originType: 'original-import', originToken: sourceFingerprint, converterVersion });

const statuses = (page: Page, testId: string) => page.getByTestId(testId).locator('li');
/**
 * The texts of `testId`'s statuses, read by a plain evaluation: Playwright's main-world helpers (`allInnerTexts`,
 * `locator.evaluate`) would install its own window listeners, which the resource balance counts as test registrations.
 */
const statusTexts = (page: Page, testId: string): Promise<string[]> => page.evaluate(id =>
  [...document.querySelectorAll(`[data-testid="${id}"] li`)].map(item => (item as HTMLElement).innerText), testId);
const dataStatus = (page: Page) => page.getByTestId('original-data-status');

const workers = (page: Page): Promise<ProbeSnapshot['workers']> => page.evaluate(() => window.osrProbe.snapshot().workers);

/** A Worker's messages as `type:stage`, each run of equal entries once, such as repeated progress of one stage. */
const steps = ({ messages }: ProbeSnapshot['workers'][number]): string[] => messages
  .map(({ type, stage }) => `${type}:${stage ?? '-'}`)
  .filter((step, index, all) => step !== all[index - 1]);

/** A package seeded in the cache, restored and held at the menu, as the row finds it. */
interface Held {
  readonly expected: ExpectedPackage;
  readonly stored: StoredRecords;
  /** The menu's resource statuses, the restore duration included. */
  readonly menu: readonly string[];
}

/**
 * Seeds the cache, lists it again by a visit to the import page and restores it from the menu: `models` is the converted
 * slice package under the production profile (for scenarios that identify no disc), `synthetic` the content test
 * support's package under the entry's profile.
 */
async function holdSeeded(page: Page, seed: 'models' | 'synthetic'): Promise<Held> {
  const profile = await page.evaluate(() => window.osrTestEntry!.profile);
  const key = keyOf(profile);
  await loadCacheModules(page);
  let expected: ExpectedPackage;
  if (seed === 'models') {
    expect(profile.sourceFingerprint).toBe(PRODUCTION_PACKAGE.sourceFingerprint);
    expected = expectedPackage(key, (await seedProductionCache(page)).groups);
  } else {
    expect(await seedPackage(page)).toBe('committed');
    const { packages } = await readCacheKeys(page);
    expect(packages.map(({ recordKey }) => recordKey)).toEqual([key]);
    expected = { key, groups: packages[0].groups as ExpectedPackage['groups'] };
  }
  await button(page, 'Import original game data').click();
  await toMenu(page);
  await expect(dataStatus(page)).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
  await button(page, 'Open saved resources').click();
  await expect(statuses(page, 'resource-statuses').nth(1)).toHaveText(SAVED_BY_RESTORE);
  await expect(dataStatus(page)).toHaveText(HELD);
  return { expected, stored: await readStoredRecords(page), menu: await statusTexts(page, 'resource-statuses') };
}

/** I-2: the menu still holds the package found before the row, with the same statuses and stored records. */
async function expectKept(page: Page, held: Held): Promise<void> {
  await expect(dataStatus(page)).toHaveText(HELD);
  await expect(statuses(page, 'resource-statuses')).toHaveText([...held.menu]);
  for (const testId of ['restore-failure', 'save-failure', 'storage-failure']) await expect(page.getByTestId(testId)).toHaveCount(0);
  expect(await readStoredRecords(page)).toEqual(held.stored);
}

/**
 * Opens the viewer on the held package and reads its identity line; with `pixels`, also shows the `models` package's
 * first image and compares it with the same package converted in Node.
 */
async function viewHeld(page: Page, pixels: boolean): Promise<string> {
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expect(page.getByTestId('viewer-render-status')).not.toHaveText('Preparing the viewer…');
  await expect(page.getByTestId('viewer-audio-status')).not.toHaveText('Preparing audio…');
  const identity = await page.getByTestId('viewer-identity').innerText();
  expect(identity).toMatch(/^Package identity: manifest manifest:\S+, converter \S+$/);
  await expectPagePrivate(page);
  if (pixels) {
    const { entry, resolved } = await firstEntry('image');
    await entryButton(page, entry.id).click();
    await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${entry.id}`);
    const { state, layout, placement } = await viewerDiagnostics(page);
    expect(state).toBe('ready');
    await expectSamples(page, layout!, pictureSamples(pictureOf(resolved.item(0)!), placement!));
  }
  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  return identity;
}

/** Opens the import page and chooses `files`. */
async function openImport(page: Page, files: readonly FilePayload[]): Promise<void> {
  await button(page, 'Import original game data').click();
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
  await page.locator('#import-files').setInputFiles([...files]);
}

/** Leaves the import page for the menu, which lists the cache again. */
async function toMenu(page: Page): Promise<void> {
  await button(page, 'Return to menu').click();
  await expect(button(page, 'Import original game data')).toBeFocused();
}

/** Starts the chosen files' job and waits until its Worker is observed by the audit and the job is in `stage`. */
async function startJob(page: Page, audit: Audit, stage: ImportStage | null = null): Promise<void> {
  await button(page, 'Start import').click();
  if (stage !== null) await expect(page.getByTestId('import-progress')).toHaveAttribute('data-stage', stage, { timeout: 60_000 });
  await audit.ready();
}

/**
 * I-6 on the page as shown, collapsed technical details included: no file name, exception text or marked content. The
 * file chooser's own display of the chosen names is not in the markup.
 */
async function expectPagePrivate(page: Page): Promise<void> {
  expect(await page.evaluate(marker => ({ text: document.body.innerText.includes(marker), markup: document.documentElement.outerHTML.includes(marker) }), MARKER))
    .toEqual({ text: false, markup: false });
}

/** I-6 for the console and every resource balance snapshot of the case. */
function expectPrivate(consoled: readonly string[], snapshots: readonly unknown[]): void {
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
  expect(JSON.stringify(snapshots)).not.toContain(MARKER);
}

/** A failure notice's technical details by term, without the time, which the test does not fix; read like `statusTexts`. */
async function fixedDetails(page: Page, testId: string): Promise<Record<string, string | null>> {
  const rows = await page.evaluate(id => [...document.querySelectorAll(`[data-testid="${id}"] dl dt`)]
    .map(term => [term.textContent ?? '', term.nextElementSibling?.textContent ?? null] as const), testId);
  return Object.fromEntries(rows.filter(([term]) => term !== 'Time'));
}

/** The first entry of `event` on `target`, with its position. */
function click(entries: readonly OrderEntry[], event: 'input' | 'handled', target: string) {
  const index = entries.findIndex(entry => entry.event === event && entry.target === target);
  if (index === -1) throw new Error(`No ${event} entry for ${target}`);
  return { entry: entries[index], index };
}

/**
 * I-7 for the probe click: the job was running in `stage` before it, the trusted click was handled in one dispatch with
 * the job still running, and frames, nothing else, followed it until `until`.
 */
function expectProbeHandled(entries: readonly OrderEntry[], stage: ImportStage, until: number): void {
  const tokens = orderTokens(entries);
  const running = tokens.indexOf(`status:import:running:${stage}`);
  const input = click(entries, 'input', 'probe');
  const handled = click(entries, 'handled', 'probe');
  expect(running).toBeGreaterThan(-1);
  expect(input.index).toBeGreaterThan(running);
  expect(handled.index).toBe(input.index + 1);
  expect(input.entry).toMatchObject({ trusted: true, status: `import:running:${stage}` });
  expect(handled.entry).toMatchObject({ trusted: true, status: `import:running:${stage}` });
  expect(tokens.slice(handled.index + 1, until)).toContain('frame');
  expect(tokens.slice(handled.index + 1, until).filter(token => token !== 'frame')).toEqual([]);
}

/** After `index`, nothing but at least `SETTLE_FRAMES` frames: no late message, status or Worker. */
function expectOnlyFramesAfter(entries: readonly OrderEntry[], index: number): void {
  const after = orderTokens(entries).slice(index + 1);
  expect(after.length).toBeGreaterThanOrEqual(SETTLE_FRAMES);
  expect(after.filter(token => token !== 'frame')).toEqual([]);
}

async function attachOrder(testInfo: TestInfo, name: string, entries: readonly OrderEntry[]): Promise<void> {
  await testInfo.attach(name, { contentType: 'application/json', body: JSON.stringify(entries, null, 1) });
}

/** Records the row's precondition and expected end state with the test. */
function annotate(testInfo: TestInfo, row: 'F-11' | 'F-12', description: string): void {
  testInfo.annotations.push({ type: 'failure-row', description: `${row}: ${description}` });
}

/** Posts the release of `held-late-error` from a test-owned BroadcastChannel in the page. */
const releaseLateError = (page: Page): Promise<void> => page.evaluate(name => {
  const channel = new BroadcastChannel(name);
  channel.postMessage('release');
  channel.close();
}, LATE_ERROR_RELEASE_CHANNEL);

/** Lets two frames pass, so whatever a late result would change has been rendered. */
const twoFrames = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>(resolve => {
  requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); });
}));

declare global {
  interface Window { osrCommitBlocker?: { stop(): Promise<void> } }
}

/**
 * Opens a readonly transaction of the test on both cache stores from its own connection and keeps it alive with chained
 * `count()` requests, so a readwrite transaction the page begins later waits and its commit settles only after
 * `unblockCommits`. Property handlers only: the probes record no registration of it.
 */
const blockCommits = (page: Page): Promise<void> => page.evaluate(({ name, version, packageStore, payloadStore }) => new Promise<void>((resolve, reject) => {
  const request = indexedDB.open(name, version);
  request.onupgradeneeded = () => { request.transaction?.abort(); };
  request.onerror = () => { reject(new Error('The cache database must exist before commits are blocked')); };
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction([packageStore, payloadStore], 'readonly');
    const store = transaction.objectStore(packageStore);
    let blocking = true;
    const done = new Promise<void>(settled => { transaction.oncomplete = transaction.onabort = () => { db.close(); settled(); }; });
    const keepOpen = (): void => { if (blocking) store.count().onsuccess = keepOpen; };
    keepOpen();
    window.osrCommitBlocker = { stop: () => { blocking = false; delete window.osrCommitBlocker; return done; } };
    resolve();
  };
}), RESOURCE_CACHE_DATABASE);

const unblockCommits = (page: Page): Promise<void> => page.evaluate(() => window.osrCommitBlocker!.stop());

interface WorkerFault {
  readonly worker: 'missing' | 'top-level-throw' | 'late-error' | 'held-late-error' | 'job-throws';
  readonly code: 'worker-start-failed' | 'worker-failed' | 'internal-error';
  readonly category: string;
  readonly message: string;
  readonly location: 'worker' | 'job';
  /** The owner's or host's fixed reason, never the exception's text. */
  readonly reason: string;
  /** The Worker's script path, as the probe records it. */
  readonly entry: string;
  /** What the Worker sent, as `type:stage`: nothing before it started, or `ready` and what its job sent. */
  readonly messages: readonly string[];
}

const START_FAILED = {
  code: 'worker-start-failed', category: 'import/worker-start', message: 'The import Worker could not start.', location: 'worker',
  reason: 'the import Worker could not start', messages: [],
} as const;
const STOPPED = {
  code: 'worker-failed', category: 'import/worker-stopped', message: 'The import Worker stopped unexpectedly.', location: 'worker',
  reason: 'the import Worker failed', entry: '/src/workers/import-worker.test-support.ts', messages: ['ready:-', 'progress:identify-source'],
} as const;

/** F-11 with the P2-04 code of each fault, fixed in advance from the job owner's and host's error contract. */
const WORKER_FAULTS: readonly WorkerFault[] = [
  { worker: 'missing', ...START_FAILED, entry: '/src/workers/missing-import-worker.ts' },
  { worker: 'top-level-throw', ...START_FAILED, entry: '/src/workers/import-worker.test-support.ts' },
  { worker: 'late-error', ...STOPPED },
  { worker: 'held-late-error', ...STOPPED },
  {
    worker: 'job-throws', code: 'internal-error', category: 'import/internal', message: 'The import failed because of an internal or protocol error.',
    location: 'job', reason: 'the import job failed unexpectedly', entry: '/src/workers/import-worker.test-support.ts', messages: ['ready:-', 'failed:-'],
  },
];

/**
 * The missing Worker entry's script request: a test-only GET without data. The development server's SPA fallback answers
 * it with the app's HTML page (200, `text/html`), which the browser refuses as a module Worker script.
 */
const MISSING_WORKER = { label: 'missing Worker entry (HTML fallback)', method: 'GET', path: '/src/workers/missing-import-worker.ts', expect: 200 } as const;

/** I-1 for an F-11 row: the fixed category, sentence and details, and no package, partial note or mission result. */
async function expectFault(page: Page, fault: WorkerFault): Promise<void> {
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'failed');
  const notice = page.getByTestId('import-failure');
  await expect(notice).toHaveAttribute('data-category', fault.category);
  await expect(notice.locator('p').first()).toHaveText(fault.message);
  expect(await fixedDetails(page, 'import-failure')).toEqual({ Layer: 'import', Code: fault.code, Location: fault.location, Reason: fault.reason });
  for (const testId of ['import-progress', 'import-statuses', 'import-groups', 'import-partial', 'mission-failure', 'save-failure']) {
    await expect(page.getByTestId(testId)).toHaveCount(0);
  }
  await expect(button(page, 'Start import')).toBeEnabled();
}

/** Runs one F-11 job on the chosen files, and for the held late error the I-7 order around its release. */
async function runFault(page: Page, audit: Audit, testInfo: TestInfo, fault: WorkerFault, label: string): Promise<void> {
  const before = (await workers(page)).length;
  const held = fault.worker === 'held-late-error';
  const order = held ? await InputOrder.start(page) : null;
  await startJob(page, audit, held ? 'identify-source' : null);
  if (order) {
    // The job runs until the test releases its error: a trusted click is handled and a frame follows meanwhile.
    expect((await workers(page)).slice(before).map(worker => ({ name: worker.name, messages: steps(worker), terminations: worker.terminations })))
      .toEqual([{ name: fault.worker, messages: [...fault.messages], terminations: 0 }]);
    await order.clickProbe();
    await releaseLateError(page);
    await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'failed');
    await order.framesAfter(entry => entry.event === 'status' && entry.status === 'import:failed', SETTLE_FRAMES);
    const entries = await order.stop();
    await attachOrder(testInfo, `input-order ${label}`, entries);
    const failedAt = orderTokens(entries).indexOf('status:import:failed');
    expectProbeHandled(entries, 'identify-source', failedAt);
    const probed = click(entries, 'handled', 'probe').entry;
    expect(probed.event === 'handled' && probed.workers?.at(-1)).toEqual({ name: fault.worker, messages: 2, terminations: 0 });
    expectOnlyFramesAfter(entries, failedAt);
  }
  await expectFault(page, fault);
  await expectPagePrivate(page);
  // One new Worker, terminated once; one that never sent `ready` was never sent `start` (I-3).
  let created: ProbeSnapshot['workers'] = [];
  await expect.poll(async () => {
    created = (await workers(page)).slice(before);
    return created.map(({ entry, name, terminations }) => ({ entry, name, terminations }));
  }).toEqual([{ entry: fault.entry, name: fault.worker, terminations: 1 }]);
  const [worker] = created;
  expect(steps(worker)).toEqual([...fault.messages]);
  expect(worker.jobs).toEqual(fault.messages.length === 0 ? [] : [1]);
  expect(worker.posts).toBe(worker.jobs.length);
  expect(worker.messages.every(({ at }) => at < worker.terminatedAt!)).toBe(true);
}

for (const fault of WORKER_FAULTS) {
  test(`F-11 ${fault.worker}: the job fails with ${fault.code}, the Worker is terminated and the held package stays usable`, async ({ page, audit }, testInfo) => {
    audit.canaries({ name: 'file-name', value: MARKER });
    if (fault.worker === 'missing') audit.declare(MISSING_WORKER);
    const consoled = consoleText(page);
    await page.addInitScript(installAudioProbe);
    await openTestEntry(page, { worker: fault.worker });
    await expect(dataStatus(page)).toHaveText(NONE);

    // Before: the converted slice package, seeded under the production profile and restored (the fault identifies no disc).
    const held = await holdSeeded(page, 'models');
    const identity = await viewHeld(page, true);
    annotate(testInfo, 'F-11', `${fault.worker}: held before: the seeded models package, restored and saved; `
      + `import/${fault.code} at ${fault.location}, the Worker terminated; afterwards the package is unchanged`);
    const balance = await ResourceBalance.start(page, testInfo, { packages: [held.expected] });

    await openImport(page, UNREAD_FILES);
    await runFault(page, audit, testInfo, fault, 'the row');
    await toMenu(page);
    await expectKept(page, held);
    const after = await balance.check('after the row');

    // I-5: the same package, by identity and pixels, and a new job that runs and fails the same way.
    expect(await viewHeld(page, true)).toBe(identity);
    const viewed = await balance.check('viewed after the row');
    await openImport(page, UNREAD_FILES);
    await runFault(page, audit, testInfo, fault, 'the retry');
    await toMenu(page);
    await expectKept(page, held);
    const again = await balance.check('a new job after the row');
    expect(again.snapshot.probe.workers.map(({ terminations }) => terminations)).toEqual([1, 1]);

    await expectPagePrivate(page);
    expectPrivate(consoled, [after.snapshot, viewed.snapshot, again.snapshot]);
    await balance.attach();
  });
}

/** The Worker's steps when `hold-<stage>` holds it: identification progress, then the identity and each stage's start. */
const heldSteps = (stage: ImportStage): string[] => {
  const index = IMPORT_STAGES.indexOf(stage);
  return ['ready:-', 'progress:identify-source', ...(index === 0 ? [] : ['identified:-', ...IMPORT_STAGES.slice(1, index + 1).map(at => `progress:${at}`)])];
};

/** The job's Worker, the page's latest, as an input entry recorded it. */
const workerAt = (entry: OrderEntry) => (entry.event === 'input' || entry.event === 'handled' ? entry.workers?.at(-1) : undefined);

/**
 * I-7 and the synchronous cancel: a trusted probe click is handled while the job runs and frames follow; the trusted
 * cancel click finds the job running, and inside its own dispatch the page shows it cancelled and the Worker is
 * terminated; only frames follow. Returns the Worker's message counts at the probe click and when cancelled.
 */
function expectCancelOrder(entries: readonly OrderEntry[], stage: ImportStage, worker: string): { probed: number; cancelled: number } {
  const cancelInput = click(entries, 'input', 'Cancel import');
  const cancelHandled = click(entries, 'handled', 'Cancel import');
  expectProbeHandled(entries, stage, cancelInput.index);
  const probed = workerAt(click(entries, 'input', 'probe').entry);
  const cancelling = workerAt(cancelInput.entry);
  expect(probed).toMatchObject({ name: worker, terminations: 0 });
  expect(cancelInput.entry).toMatchObject({ trusted: true, status: `import:running:${stage}` });
  expect(cancelling).toMatchObject({ name: worker, terminations: 0 });
  expect(entries.slice(cancelInput.index + 1, cancelHandled.index)).toEqual([{ event: 'status', status: 'import:cancelled', at: expect.any(Number) }]);
  expect(cancelHandled.entry).toMatchObject({ trusted: true, status: 'import:cancelled' });
  expect(workerAt(cancelHandled.entry)).toEqual({ name: worker, messages: cancelling!.messages, terminations: 1 });
  expectOnlyFramesAfter(entries, cancelHandled.index);
  return { probed: probed!.messages, cancelled: cancelling!.messages };
}

/** The import page after a cancellation: the fixed note, no status, group or partial result, and a new start possible. */
async function expectCancelledPage(page: Page): Promise<void> {
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'cancelled');
  await expect(page.getByTestId('import-result')).toHaveText(CANCELLED);
  for (const testId of ['import-progress', 'import-statuses', 'import-groups', 'import-partial', 'import-failure', 'save-failure']) {
    await expect(page.getByTestId(testId)).toHaveCount(0);
  }
  await expect(button(page, 'Start import')).toBeEnabled();
  await expectPagePrivate(page);
}

for (const stage of IMPORT_STAGES) {
  test(`F-12 cancelling in ${stage}: synchronous, the Worker terminated, no result kept and the held package unchanged`, async ({ page, audit }, testInfo) => {
    audit.canaries({ name: 'file-name', value: MARKER });
    const consoled = consoleText(page);
    await page.addInitScript(installAudioProbe);
    const worker = `hold-${stage}`;
    await openTestEntry(page, { worker });
    await expect(dataStatus(page)).toHaveText(NONE);

    // Before: the synthetic package seeded under the slice disc's profile and restored.
    const held = await holdSeeded(page, 'synthetic');
    annotate(testInfo, 'F-12', `cancel in ${stage}: held before: the seeded synthetic package, restored and saved; the job is cancelled `
      + `in ${stage} with its Worker terminated and nothing kept; afterwards the package is unchanged`);
    const balance = await ResourceBalance.start(page, testInfo, { packages: [held.expected] });

    await openImport(page, await sliceFiles());
    const order = await InputOrder.start(page);
    await startJob(page, audit, stage);
    // The Worker stays in the stage: what it sent ends with the stage's start, and nothing more arrives meanwhile.
    const [running] = await workers(page);
    expect(steps(running)).toEqual(heldSteps(stage));
    await order.clickProbe();
    await button(page, 'Cancel import').click();
    await order.framesAfter(entry => entry.event === 'handled' && entry.target === 'Cancel import', SETTLE_FRAMES);
    const entries = await order.stop();
    await attachOrder(testInfo, 'input-order', entries);
    // Nothing arrived between the stage's start and the cancellation.
    expect(expectCancelOrder(entries, stage, worker)).toEqual({ probed: running.messages.length, cancelled: running.messages.length });
    await expectCancelledPage(page);
    const [ended] = await workers(page);
    expect(ended).toMatchObject({ name: worker, posts: 1, jobs: [1], terminations: 1 });
    expect(steps(ended)).toEqual(heldSteps(stage));
    expect(ended.messages.every(({ at }) => at < ended.terminatedAt!)).toBe(true);

    await toMenu(page);
    await expectKept(page, held);
    const after = await balance.check('after the cancellation');
    await expectPagePrivate(page);
    expectPrivate(consoled, [after.snapshot]);
    await balance.attach();
  });
}

test('F-12 continuous progress: cancelling and retrying, the retry is unaffected, leaving it running terminates it, and the package stays usable', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const consoled = consoleText(page);
  await page.addInitScript(installAudioProbe);
  await openTestEntry(page, { worker: 'progress-stream' });
  await expect(dataStatus(page)).toHaveText(NONE);
  const held = await holdSeeded(page, 'models');
  const identity = await viewHeld(page, true);
  annotate(testInfo, 'F-12', 'continuous progress: held before: the seeded models package, restored and saved; a streaming job is cancelled, '
    + 'its retry left running by returning to the menu, each Worker terminated once; afterwards the package is unchanged');
  const balance = await ResourceBalance.start(page, testInfo, { packages: [held.expected] });

  // Cancel while the Worker keeps reporting progress (I-7).
  await openImport(page, UNREAD_FILES);
  const order = await InputOrder.start(page);
  await startJob(page, audit, 'identify-source');
  await expect.poll(async () => (await workers(page))[0].messages.length).toBeGreaterThan(10);
  await order.clickProbe();
  const atProbe = workerAt(click(await order.entries(), 'input', 'probe').entry)!.messages;
  await expect.poll(async () => (await workers(page))[0].messages.length).toBeGreaterThan(atProbe);
  await button(page, 'Cancel import').click();
  await order.framesAfter(entry => entry.event === 'handled' && entry.target === 'Cancel import', SETTLE_FRAMES);
  const entries = await order.stop();
  await attachOrder(testInfo, 'input-order', entries);
  const { probed, cancelled: sent } = expectCancelOrder(entries, 'identify-source', 'progress-stream');
  // The stream went on between the two clicks.
  expect(probed).toBeLessThan(sent);
  await expectCancelledPage(page);
  const [first] = await workers(page);
  expect(first).toMatchObject({ posts: 1, jobs: [1], terminations: 1 });
  expect(first.messages).toHaveLength(sent);
  expect(steps(first)).toEqual(['ready:-', 'progress:identify-source']);

  // The retry: job 2 in a new Worker, which shows only its own progress; the cancelled one sends nothing more.
  await startJob(page, audit, 'identify-source');
  await expect(page.getByTestId('import-result')).toHaveCount(0);
  await expect.poll(async () => (await workers(page))[1]?.messages.length ?? 0).toBeGreaterThan(10);
  const retried = await workers(page);
  expect(retried.map(({ posts, jobs, terminations }) => ({ posts, jobs, terminations }))).toEqual([
    { posts: 1, jobs: [1], terminations: 1 }, { posts: 1, jobs: [2], terminations: 0 },
  ]);
  expect(retried[1].messages.every(({ jobId }) => jobId === null || jobId === 2)).toBe(true);
  expect(retried[0].messages).toHaveLength(sent);
  await expect(page.getByTestId('import-progress')).toHaveAttribute('data-stage', 'identify-source');
  await expectPagePrivate(page);

  // Returning to the menu while it runs terminates the retry's Worker; the held package is unchanged.
  await toMenu(page);
  await expect.poll(async () => (await workers(page)).map(({ terminations }) => terminations)).toEqual([1, 1]);
  await expectKept(page, held);
  const after = await balance.check('after cancelling, retrying and leaving');

  // I-5: the same package, by identity and pixels, and a new import page whose job starts afresh.
  expect(await viewHeld(page, true)).toBe(identity);
  const viewed = await balance.check('viewed after the row');
  await openImport(page, UNREAD_FILES);
  await expect(page.getByTestId('import-result')).toHaveCount(0);
  await expect(page.getByTestId('import-progress')).toHaveCount(0);
  await startJob(page, audit, 'identify-source');
  const [, , fresh] = await workers(page);
  expect(fresh).toMatchObject({ name: 'progress-stream', posts: 1, jobs: [1], terminations: 0 });
  await button(page, 'Cancel import').click();
  await expectCancelledPage(page);
  await toMenu(page);
  await expectKept(page, held);
  const again = await balance.check('a new job after the row');
  expect(again.snapshot.probe.workers.map(({ terminations }) => terminations)).toEqual([1, 1, 1]);

  await expectPagePrivate(page);
  expectPrivate(consoled, [after.snapshot, viewed.snapshot, again.snapshot]);
  await balance.attach();
});

/** Opens the `models` test entry with `options` and resolves to the package its import of the slice disc holds. */
async function openModels(page: Page, options: TestEntryOptions): Promise<ExpectedPackage> {
  await page.addInitScript(installAudioProbe);
  await openTestEntry(page, { worker: 'models', ...options });
  const profile = await page.evaluate(() => window.osrTestEntry!.profile);
  await loadCacheModules(page);
  return expectedPackage(keyOf(profile), await modelsPackage());
}

/**
 * Imports the chosen slice disc and waits for the import statuses `until`. The job's own Worker ends with it, since the
 * page may still show a previous job's result until the new one renders.
 */
async function importSlice(page: Page, audit: Audit, until: readonly (string | RegExp)[]): Promise<void> {
  const before = (await workers(page)).length;
  await startJob(page, audit);
  await expect.poll(async () => (await workers(page)).slice(before).map(({ terminations }) => terminations), { timeout: 60_000 }).toEqual([1]);
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'finished');
  await expect(statuses(page, 'import-statuses')).toHaveText([...until]);
}

test('F-12 late restore: a new import completes before a pending restore, whose late result is dropped', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const consoled = consoleText(page);
  const imported = await openModels(page, { hold: 'restore' });
  await expect(dataStatus(page)).toHaveText(NONE);
  annotate(testInfo, 'F-12', 'late restore: before: the seeded synthetic package listed, no package held; a restore is pending while the slice disc '
    + 'is imported and saved; afterwards the imported package is held and saved, and the late restore changes nothing');

  // A restore whose result has settled in the cache but waits for the test.
  expect(await seedPackage(page)).toBe('committed');
  const { packages: [seeded] } = await readCacheKeys(page);
  await button(page, 'Import original game data').click();
  await toMenu(page);
  await expect(dataStatus(page)).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
  const balance = await ResourceBalance.start(page, testInfo, { packages: [{ key: imported.key, groups: seeded.groups as ExpectedPackage['groups'] }] });
  await button(page, 'Open saved resources').click();
  await expect(page.getByRole('status').filter({ hasText: 'Restoring and verifying the saved resources…' })).toBeVisible();
  await expect.poll(() => heldCacheResults(page, 'restore')).toBe(1);

  // The new import finishes and is saved under the same key while the restore is still pending.
  await openImport(page, await sliceFiles());
  await importSlice(page, audit, ['Source identified', ...IMPORTED_MENU]);
  await expectPagePrivate(page);
  await toMenu(page);
  await expect(dataStatus(page)).toHaveText(HELD);
  await expect(statuses(page, 'resource-statuses')).toHaveText(IMPORTED_MENU);
  const menu = await statusTexts(page, 'resource-statuses');
  expect(await heldCacheResults(page, 'restore')).toBe(1);
  balance.expectPackages([imported]);
  const stored = await readStoredRecords(page);

  // The late restore result arrives and is dropped: the import's package, generation and saved state stay.
  expect(await releaseCacheResults(page, 'restore')).toBe(1);
  await twoFrames(page);
  await expect(statuses(page, 'resource-statuses')).toHaveText([...menu]);
  await expect(page.getByRole('status').filter({ hasText: 'Restoring' })).toHaveCount(0);
  for (const testId of ['restore-failure', 'save-failure', 'storage-failure']) await expect(page.getByTestId(testId)).toHaveCount(0);
  expect(await readStoredRecords(page)).toEqual(stored);
  const manifest = (await modelsPackage())[0].manifest as { identity: { manifestIdentity: string; converterVersion: string } };
  // The identity line only: the pixel helpers evaluate in the main world, whose Playwright listeners the balance would count.
  expect(await viewHeld(page, false)).toBe(`Package identity: manifest ${manifest.identity.manifestIdentity}, converter ${manifest.identity.converterVersion}`);
  const after = await balance.check('after the late restore');
  expect(after.snapshot.probe.workers.map(({ terminations, jobs }) => [terminations, jobs.length])).toEqual([[1, 1]]);
  await expectPagePrivate(page);
  expectPrivate(consoled, [after.snapshot]);
  await balance.attach();
});

test('F-12 late commit: a replaced package\'s failed commit result arrives late and leaves the new package saved', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const consoled = consoleText(page);
  const imported = await openModels(page, { cache: 'write-failed', hold: 'commit' });
  await expect(dataStatus(page)).toHaveText(NONE);
  annotate(testInfo, 'F-12', 'late commit: before: nothing held or stored; the first import\'s commit fails and waits, a second import replaces '
    + 'it while its own commit is kept from writing; the stale failure arrives alone, then the second commit; afterwards the second package '
    + 'is held and saved, without a save failure');
  const balance = await ResourceBalance.start(page, testInfo, { packages: [] });

  // The first package's commit fails at once (the entry's write-failed) and its result waits for the test.
  await openImport(page, await sliceFiles());
  const saving = ['Source identified', 'Complete resources, viewable', 'Held in memory only', 'Saving in this browser', 'Mission loads into Core'];
  await importSlice(page, audit, saving);
  await expect.poll(() => heldCacheResults(page, 'commit')).toBe(1);
  expect(await readStoredRecords(page)).toEqual({ packages: [], payloads: [] });

  // A second job replaces the package while that result waits; the test's transaction keeps its commit from writing.
  await blockCommits(page);
  await importSlice(page, audit, saving);
  await twoFrames(page);
  expect(await heldCacheResults(page, 'commit')).toBe(1);

  // The replaced package's failure arrives alone, after the replacement, and changes nothing.
  expect(await releaseCacheResults(page, 'commit')).toBe(1);
  await twoFrames(page);
  await expect(statuses(page, 'import-statuses')).toHaveText(saving);
  await expect(page.getByTestId('save-failure')).toHaveCount(0);

  // The held package's own commit then writes, and its success applies.
  await unblockCommits(page);
  await expect.poll(() => heldCacheResults(page, 'commit')).toBe(1);
  const written = await readStoredRecords(page);
  expect(written.packages).toHaveLength(1);
  expect(await releaseCacheResults(page, 'commit')).toBe(1);
  await expect(statuses(page, 'import-statuses')).toHaveText(['Source identified', ...IMPORTED_MENU]);
  await expect(page.getByTestId('save-failure')).toHaveCount(0);
  await expect(button(page, 'Save again')).toHaveCount(0);
  await expectPagePrivate(page);
  await toMenu(page);
  await expect(statuses(page, 'resource-statuses')).toHaveText(IMPORTED_MENU);
  await expect(page.getByTestId('save-failure')).toHaveCount(0);
  expect(await readStoredRecords(page)).toEqual(written);
  balance.expectPackages([imported]);
  const after = await balance.check('after the late commit');
  expect(after.snapshot.probe.workers.map(({ terminations, jobs }) => [terminations, jobs])).toEqual([[1, [1]], [1, [2]]]);
  expectPrivate(consoled, [after.snapshot]);
  await balance.attach();
});

test('F-12 late listing: listings begun before the import, one by a released holder, never mark the saved package lost', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const consoled = consoleText(page);
  const imported = await openModels(page, { hold: 'list' });
  annotate(testInfo, 'F-12', 'late listing: before: nothing held or stored, the first listings waiting; the slice disc is imported and saved; '
    + 'afterwards the empty listings of the released and the current holder arrive and the package stays saved');
  // StrictMode created a holder, released it and created the current one; each listed the empty cache and waits.
  await expect(dataStatus(page)).toHaveText('Original game data: Checking browser storage…');
  await expect.poll(() => heldCacheResults(page, 'list')).toBe(2);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [] });

  await openImport(page, await sliceFiles());
  await importSlice(page, audit, ['Source identified', ...IMPORTED_MENU]);
  await expectPagePrivate(page);

  // The released holder's listing is ignored; the current holder's, begun for no package, lists the new one afresh.
  expect(await releaseCacheResults(page, 'list')).toBe(2);
  await expect.poll(() => heldCacheResults(page, 'list')).toBe(1);
  await expect(statuses(page, 'import-statuses')).toHaveText(['Source identified', ...IMPORTED_MENU]);
  for (const testId of ['save-failure', 'storage-failure']) await expect(page.getByTestId(testId)).toHaveCount(0);
  await expect(button(page, 'Save again')).toHaveCount(0);
  expect(await releaseCacheResults(page, 'list')).toBe(1);
  await expect(statuses(page, 'import-statuses')).toHaveText(['Source identified', ...IMPORTED_MENU]);
  await expectPagePrivate(page);

  // The menu lists again on return; that listing shows the saved package.
  await toMenu(page);
  await expect.poll(() => heldCacheResults(page, 'list')).toBe(1);
  expect(await releaseCacheResults(page, 'list')).toBe(1);
  await expect(statuses(page, 'resource-statuses')).toHaveText(IMPORTED_MENU);
  for (const testId of ['save-failure', 'storage-failure']) await expect(page.getByTestId(testId)).toHaveCount(0);
  balance.expectPackages([imported]);
  const after = await balance.check('after the late listings');
  expect(after.snapshot.probe.workers.map(({ terminations, jobs }) => [terminations, jobs])).toEqual([[1, [1]]]);
  await expectPagePrivate(page);
  expectPrivate(consoled, [after.snapshot]);
  await balance.attach();
});
