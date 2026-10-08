import type { CDPSession, Page, TestInfo } from '@playwright/test';
import type { HeldGroup } from '../src/app/resources/resource-holder.ts';
import type { GroupInput } from '../src/content/completeness.ts';
import { readConverterVersion, type ContentIdentity } from '../src/content/content-identity.ts';
import { applyManifestIdentity } from '../src/content/manifest-identity.ts';
import { asciiBytes } from '../src/content/graphics/graphics-format.ts';
import { sha256Fingerprint } from '../src/content/sha256.ts';
import { packageRecordKey, type ResourceCacheKey } from '../src/platform/storage/resource-cache-contract.ts';
import { sound } from '../src/platform/audio/audio-controller.test-support.ts';
import { measureStorageRequirement, readGroupInputs } from '../src/platform/storage/resource-cache-records.ts';
import { PRODUCTION_PACKAGE, type ExpectedPackageProfile } from '../src/workers/production-package.ts';
import { MARKER } from '../src/workers/synthetic-import.test-support.ts';
import { button, openTestEntry, sliceFiles, smallFile, type FilePayload } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import { installBrowserProbes } from './support/browser-probes.ts';
import { consoleText } from './support/browser-test.ts';
import { expectCacheArrival, type CanaryMarker, type CanarySet } from './support/canaries.ts';
import { connectedCanvases, documentMark, jobOwners, markDocument, viewerOwner, withEdits } from './support/fast-refresh.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';
import { seedProductionCache } from './support/production-cache.ts';
import { expectedPackage, ResourceBalance, type BalanceProblem, type BalanceReport, type ExpectedPackage } from './support/resource-balance.ts';
import {
  armHold, comparableRecords, damageStoredPackage, expectedRecords, installIdbProbe, loadCacheModules, readStoredRecords, seedPackage,
  withQuotaOverride, type ProbeEvent, type StoredDamage, type StoredRecords,
} from './support/resource-cache.ts';
import { entryButton, expectSamples, firstEntry, modelsPackage, pictureOf, pictureSamples, viewerDiagnostics } from './support/viewer-observations.ts';

// P2-12 subtask 10 (S-04, S-03 lifecycle, AC-09, AC-10): the failure matrix rows F-13 (storage failures and isolation)
// and F-14 (re-entry and lifecycle) through the production App on the development entries, with the network audit on.
// Commit faults the test entry injects prove only the page's feedback; rollback and interruption are proven in real
// IndexedDB: Chrome's own quota error, a commit aborted by its owner and one cut off by a reload, each after its
// transaction issued every write. Restore failures are compared with the store as damaged before the restore. Each
// case checks the fixed outcome (I-1), what the holder keeps (I-2), Workers and registrations against the same
// document's menu baseline (I-3, I-4) and, where files are imported, that no file name reaches the page, the console or
// the probes (I-6). I-5 for the cache class is the re-import after a failed restore. Every saved package is restored
// after a reload, and the audit watches its identity and payload canaries, proven to reach the cache.
// F-14 checks StrictMode's first mounts (one live job owner, one viewer owner with one canvas) and unmounts by leaving
// a screen: a running job, an audition, and a pending audition whose late resume then changes nothing. The resource
// holder lives as long as the App, which no in-document step unmounts: under StrictMode a Fast Refresh does not re-run
// its effect. Real hiding uses the native headed browser of native-lifecycle.ts, which the audit attaches like any page.

test.describe.configure({ timeout: 120_000 });

declare global {
  interface Window {
    /** Holds `AudioContext.prototype.resume()` calls until released, as a slow audio device would; see `installResumeGate`. */
    osrResumeGate?: { hold(): void; held(): number; release(): number; resumed(): number; refused(): number };
    /** DOM mutations of the page since the test began counting them. */
    osrMutations?: number;
  }
}

const SAVED_BY_COMMIT = /^Saved in this browser \(saved in \d+(?: ms|\.\d\d s)\)$/;
const SAVED_BY_RESTORE = /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/;
const NONE = 'Original game data: None in this browser.';
const FOUND = 'Original game data: Saved resources found in this browser, not yet verified.';
const HELD = 'Original game data: Resources are held in this page.';
/** The slice disc's package on the menu: saved, held in memory only, or while its commit runs. */
const SAVED_MENU = ['Complete resources, viewable', SAVED_BY_COMMIT, 'Mission loads into Core'];
const MEMORY_MENU = ['Complete resources, viewable', 'Held in memory only', 'Mission loads into Core'];
const SAVING_MENU = ['Complete resources, viewable', 'Held in memory only', 'Saving in this browser', 'Mission loads into Core'];
const imported = (menu: readonly (string | RegExp)[]): (string | RegExp)[] => ['Source identified', ...menu];

/** Files the busy Worker scenario never reads; their names and content carry the file-name marker. */
const UNREAD_FILES: readonly FilePayload[] = [smallFile(`${MARKER}-disc.ccd`), smallFile(`${MARKER}-disc.img`)];

type CacheCode = 'quota-exceeded' | 'storage-unavailable' | 'write-failed' | 'not-found' | 'cache-corrupt' | 'cache-incompatible';

/** P2-11's fixed sentence and P2-10's fixed reason of each cache failure these rows cause, fixed here in advance. */
const CACHE_COPY: Readonly<Record<CacheCode, { readonly message: string; readonly reason: string }>> = {
  'quota-exceeded': { message: 'Browser storage is full. Free some space for this site, then save again.', reason: 'browser storage quota was exceeded' },
  'storage-unavailable': { message: 'Browser storage is unavailable, so the resources are kept only in this page.', reason: 'browser storage is unavailable' },
  'write-failed': { message: 'The browser could not finish writing the cache.', reason: 'the cache write did not complete' },
  'not-found': {
    message: 'No saved resources were found; the browser may have cleared them. Import your disc files again.', reason: 'no cached package exists for the key',
  },
  'cache-corrupt': { message: 'The saved resources are damaged and cannot be used. Importing again replaces them.', reason: 'the cached package is damaged' },
  'cache-incompatible': {
    message: 'The saved resources belong to another version and cannot be used. Importing again replaces them.',
    reason: 'the cached package belongs to an incompatible format or content version',
  },
};

const keyOf = ({ sourceFingerprint, converterVersion }: Pick<ExpectedPackageProfile, 'sourceFingerprint' | 'converterVersion'>): ResourceCacheKey =>
  Object.freeze({ originType: 'original-import', originToken: sourceFingerprint, converterVersion });
const PRODUCTION_KEY = keyOf(PRODUCTION_PACKAGE);

const statuses = (page: Page, testId: string) => page.getByTestId(testId).locator('li');
/** The texts of `testId`'s statuses, read by a plain evaluation rather than Playwright's main-world helpers. */
const statusTexts = (page: Page, testId: string): Promise<string[]> => page.evaluate(id =>
  [...document.querySelectorAll(`[data-testid="${id}"] li`)].map(item => (item as HTMLElement).innerText), testId);
const dataStatus = (page: Page) => page.getByTestId('original-data-status');
const identityLine = ({ manifestIdentity, converterVersion }: Pick<ContentIdentity, 'manifestIdentity' | 'converterVersion'>): string =>
  `Package identity: manifest ${manifestIdentity}, converter ${converterVersion}`;
const entryKey = async (page: Page): Promise<ResourceCacheKey> => keyOf(await page.evaluate(() => window.osrTestEntry!.profile));

/**
 * Lets Playwright set up its own listeners in the page's current document before a menu baseline: its main-world
 * script, created on first use and kept for the document, registers capture listeners on `window` that the probes
 * count as test registrations.
 */
const settleTooling = (page: Page) => page.locator('body').evaluate(() => undefined);

const workers = (page: Page) => page.evaluate(() => window.osrProbe.snapshot().workers);

/** Leaves the import page for the menu, which lists the cache again. */
async function toMenu(page: Page): Promise<void> {
  await button(page, 'Return to menu').click();
  await expect(button(page, 'Import original game data')).toBeFocused();
}

/** Lists the cache again by a visit to the import page. */
async function relist(page: Page): Promise<void> {
  await button(page, 'Import original game data').click();
  await toMenu(page);
}

/** Opens the import page and chooses `files`. */
async function openImport(page: Page, files: readonly FilePayload[]): Promise<void> {
  await button(page, 'Import original game data').click();
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
  await page.locator('#import-files').setInputFiles([...files]);
}

/**
 * Starts a job on the chosen files and waits until its own Worker has ended and the page shows a finished result; the
 * page may still show an earlier job's result until then.
 */
async function runImport(page: Page, audit: Audit): Promise<void> {
  const before = (await workers(page)).length;
  await button(page, 'Start import').click();
  await audit.ready();
  await expect.poll(async () => (await workers(page)).slice(before).map(({ terminations }) => terminations), { timeout: 60_000 }).toEqual([1]);
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'finished');
}

/** A failure notice's technical details by term, without the time, which the test does not fix. */
async function fixedDetails(page: Page, testId: string): Promise<Record<string, string | null>> {
  const rows = await page.evaluate(id => [...document.querySelectorAll(`[data-testid="${id}"] dl dt`)]
    .map(term => [term.textContent ?? '', term.nextElementSibling?.textContent ?? null] as const), testId);
  return Object.fromEntries(rows.filter(([term]) => term !== 'Time'));
}

/** I-1 for a cache failure: its category, P2-11 sentence and P2-10 details, as fixed in `CACHE_COPY`. */
async function expectCacheFailure(page: Page, testId: string, code: CacheCode, location: string): Promise<void> {
  const notice = page.getByTestId(testId);
  await expect(notice).toHaveAttribute('data-category', `cache/${code}`);
  await expect(notice.locator('p').first()).toHaveText(CACHE_COPY[code].message);
  expect(await fixedDetails(page, testId)).toEqual({ Layer: 'cache', Code: code, Location: location, Reason: CACHE_COPY[code].reason });
}

/** I-6 on the page as shown, collapsed details included: no file name. The file chooser's own display is not markup. */
async function expectPagePrivate(page: Page): Promise<void> {
  expect(await page.evaluate(marker => ({ text: document.body.innerText.includes(marker), markup: document.documentElement.outerHTML.includes(marker) }), MARKER))
    .toEqual({ text: false, markup: false });
}

/** I-6 for the console and the case's resource balance snapshots. */
function expectPrivate(consoled: readonly string[], snapshots: readonly unknown[]): void {
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
  expect(JSON.stringify(snapshots)).not.toContain(MARKER);
}

/** A balance difference without the probe's target and callback numbers, as `<group> listener added …: <type>`. */
const differenceOf = ({ detail }: BalanceProblem): string => detail.replace(/: \d+:([^:]+):\d+:(?:true|false)$/, ': $1');

/** A failure notice the menu shows: React DOM listens to its `<details>` element's `toggle` itself. */
const NOTICE = 'attached React element listeners added since the baseline: toggle ×1';

/**
 * Checks the balance where the page legitimately differs from its menu baseline by exactly `expected` differences, as
 * `differenceOf` writes them, such as a failure notice on the menu; any other difference, or a missing one, fails.
 */
async function checkExpecting(balance: ResourceBalance, label: string, expected: readonly string[]): Promise<BalanceReport> {
  let report: BalanceReport | undefined;
  await expect.poll(async () => {
    report = await balance.measure(label, 0);
    return report.problems.map(differenceOf).sort();
  }, { message: `${label}: resource balance`, timeout: 10_000 }).toEqual([...expected].sort());
  return report!;
}

/**
 * Opens the viewer on the held package and reads its identity line; with `pixels`, also shows the `models` package's
 * first image and compares it with the same package converted in Node. Returns to the menu.
 */
async function viewHeld(page: Page, pixels: boolean): Promise<string> {
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expect(page.getByTestId('viewer-render-status')).not.toHaveText('Preparing the viewer…');
  await expect(page.getByTestId('viewer-audio-status')).not.toHaveText('Preparing audio…');
  const identity = await page.getByTestId('viewer-identity').innerText();
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

/** Records the row's precondition and expected end state with the test. */
function annotate(testInfo: TestInfo, row: 'F-13' | 'F-14', description: string): void {
  testInfo.annotations.push({ type: 'failure-row', description: `${row}: ${description}` });
}

/** A stored package as the test knows it: its expected keys and the viewer's identity line. */
interface Stored {
  readonly expected: ExpectedPackage;
  readonly identity: string;
}

/** The package stored under `key`, read back from the page's cache. */
async function storedPackage(page: Page, key: ResourceCacheKey): Promise<Stored> {
  const recordKey = JSON.stringify(packageRecordKey(key));
  const found = (await readStoredRecords(page)).packages.find(entry => JSON.stringify(entry.key) === recordKey);
  if (!found) throw new Error(`No package is stored under ${recordKey}`);
  const record = JSON.parse(found.value) as { groups: { manifest: { group: string; identity: ContentIdentity; assets: { id: string }[] } }[] };
  return {
    expected: { key, groups: record.groups.map(({ manifest }) => ({ group: manifest.group, assets: manifest.assets.map(({ id }) => id) })) },
    identity: identityLine(record.groups[0].manifest.identity),
  };
}

/** Commits the content test support's synthetic package under `key`, or under the overridden fingerprint or version. */
async function seedSynthetic(page: Page, key: ResourceCacheKey, overrides: { converterVersion?: string; fingerprint?: string } = {}): Promise<Stored> {
  expect(await seedPackage(page, overrides)).toBe('committed');
  const { fingerprint = key.originToken, converterVersion } = overrides;
  return storedPackage(page, { ...key, originToken: fingerprint, converterVersion: converterVersion === undefined ? key.converterVersion : readConverterVersion(converterVersion) });
}

/** The slice disc's package as the `models` scenario converts it in Node: its expected keys, records and identity line. */
async function slicePackage(key: ResourceCacheKey) {
  const groups = await modelsPackage();
  const [{ manifest }] = readGroupInputs(groups, 'invalid-request');
  return { groups, expected: expectedPackage(key, groups), records: expectedRecords(groups), identity: identityLine(manifest.identity) };
}

/**
 * The network canaries of a package a case stores (spec, network audit): its source fingerprint and manifest identity,
 * its largest payload's bare SHA-256 digest and 16 of that payload's bytes with at least 12 distinct values. Each is in
 * the package by construction; `expectCacheArrival` proves it reached the cache.
 */
function packageCanaries(groups: readonly GroupInput[]): CanarySet {
  const inputs = readGroupInputs(groups, 'invalid-request');
  const { identity } = inputs[0].manifest;
  if (identity.origin.type !== 'original-import') throw new Error('The package must be an original import');
  const { payload, fingerprint } = inputs
    .flatMap(({ manifest, payloads }) => payloads.map(entry => ({ payload: entry.bytes, fingerprint: manifest.assets.find(({ id }) => id === entry.id)!.payloadIdentity.fingerprint })))
    .reduce((largest, entry) => (entry.payload.byteLength > largest.payload.byteLength ? entry : largest));
  const start = payload.findIndex((_, index) => index + 16 <= payload.length && new Set(payload.subarray(index, index + 16)).size >= 12);
  if (start === -1) throw new Error('The largest payload has no distinctive 16-byte window');
  const stages = Object.freeze(['payload', 'cache'] as const);
  const text = (name: CanaryMarker['name'], value: string): CanaryMarker => ({ name, bytes: asciiBytes(value), text: value, stages });
  return Object.freeze({
    markers: Object.freeze([
      text('source-fingerprint', identity.origin.sourceFingerprint),
      text('manifest-identity', identity.manifestIdentity),
      text('payload-sha256', fingerprint.slice('sha256:'.length)),
      { name: 'payload-bytes', bytes: payload.slice(start, start + 16), text: null, stages } satisfies CanaryMarker,
    ]),
  });
}

/** Watches the case's outbound traffic for every marker of `set`. */
const watchCanaries = (audit: Audit, set: CanarySet): void => { audit.canaries(...set.markers.map(({ name, bytes }) => ({ name, value: bytes }))); };

/**
 * Proves the stored package restores: in a reloaded document it is listed, restored and verified, and shows `identity`
 * (with `pixels`, also the slice disc's first image). The balance keeps the replaced document's release evidence first.
 */
async function expectRestores(page: Page, balance: ResourceBalance, identity: string, pixels: boolean): Promise<BalanceReport> {
  await balance.beforeReload('before the reload that restores the saved package');
  await page.reload();
  await expect(dataStatus(page)).toHaveText(FOUND);
  await settleTooling(page);
  await balance.rebaseline();
  await button(page, 'Open saved resources').click();
  await expect(statuses(page, 'resource-statuses').nth(1)).toHaveText(SAVED_BY_RESTORE);
  expect(await viewHeld(page, pixels)).toBe(identity);
  return balance.check('the saved package restored after a reload');
}

/**
 * From the menu: imports the slice disc, which is saved; the store then holds exactly its records, and the audit's
 * `canaries` are in the cache. Stays on the import page.
 */
async function importSaved(page: Page, audit: Audit, slice: Awaited<ReturnType<typeof slicePackage>>, canaries: CanarySet): Promise<void> {
  await openImport(page, await sliceFiles());
  await runImport(page, audit);
  await expect(statuses(page, 'import-statuses')).toHaveText(imported(SAVED_MENU));
  await expectPagePrivate(page);
  expect(comparableRecords(await readStoredRecords(page))).toEqual(slice.records);
  await expectCacheArrival(page, canaries);
}

/** The stored records of `key` alone, in key order. */
function recordsOf(records: StoredRecords, key: ResourceCacheKey): StoredRecords {
  const prefix = JSON.stringify(packageRecordKey(key));
  const ofKey = ({ key: stored }: { key: unknown[] }) => JSON.stringify(stored.slice(0, 3)) === prefix;
  return { packages: records.packages.filter(ofKey), payloads: records.payloads.filter(ofKey) };
}

const probeEvents = (page: Page): Promise<ProbeEvent[]> => page.evaluate(() => window.osrIdbProbe.events.map(event => ({ ...event })));

/** The IndexedDB probe's events without reads, as `kind:mode:error` tokens with each run of writes once. */
const writeSteps = (events: readonly ProbeEvent[]): string[] => events
  .filter(({ kind, mode }) => kind !== 'read' && !(kind === 'transaction' && mode === 'readonly') && !(kind === 'complete' && mode === 'readonly'))
  .map(({ kind, mode, error, threw }) => [kind, mode, error, threw].filter(Boolean).join(':'))
  .filter((step, index, all) => step !== 'write' || all[index - 1] !== 'write');

// F-13: storage failures and isolation

for (const code of ['quota-exceeded', 'storage-unavailable', 'write-failed'] as const) {
  test(`F-13 commit ${code} (page feedback): the new package stays in memory, the old records are unchanged, and saving again succeeds`, async ({ page, audit }, testInfo) => {
    audit.canaries({ name: 'file-name', value: MARKER });
    const consoled = consoleText(page);
    await page.addInitScript(installAudioProbe);
    await openTestEntry(page, { cache: code });
    await expect(dataStatus(page)).toHaveText(NONE);
    const key = await entryKey(page);
    await loadCacheModules(page);
    const old = await seedSynthetic(page, key);
    await relist(page);
    await expect(dataStatus(page)).toHaveText(FOUND);
    const before = await readStoredRecords(page, true);
    const slice = await slicePackage(key);
    const canaries = packageCanaries(slice.groups);
    watchCanaries(audit, canaries);
    annotate(testInfo, 'F-13', `commit ${code}, injected by the test entry for the page's feedback only: before: the synthetic package stored under `
      + 'the key and listed, none held; the import is held in memory only with the code, the stored records unchanged; saving again stores it');
    await settleTooling(page);
    const balance = await ResourceBalance.start(page, testInfo, { packages: [old.expected] });

    await openImport(page, await sliceFiles());
    await runImport(page, audit);
    await expect(statuses(page, 'import-statuses')).toHaveText(imported(MEMORY_MENU));
    await expectCacheFailure(page, 'save-failure', code, 'database');
    await expectPagePrivate(page);
    expect(await readStoredRecords(page, true)).toEqual(before);
    await toMenu(page);
    await expect(dataStatus(page)).toHaveText(HELD);
    await expect(statuses(page, 'resource-statuses')).toHaveText(MEMORY_MENU);
    await expectCacheFailure(page, 'save-failure', code, 'database');
    expect(await viewHeld(page, true)).toBe(slice.identity);
    const failed = await checkExpecting(balance, 'the commit failed, its notice shown', [NOTICE]);

    // I-5: saving again stores the held package under its key, replacing the old one as a whole.
    await button(page, 'Save again').click();
    await expect(statuses(page, 'resource-statuses')).toHaveText(SAVED_MENU);
    await expect(page.getByTestId('save-failure')).toHaveCount(0);
    await expect(button(page, 'Save again')).toHaveCount(0);
    expect(comparableRecords(await readStoredRecords(page))).toEqual(slice.records);
    await expectCacheArrival(page, canaries);
    balance.expectPackages([slice.expected]);
    const saved = await balance.check('saved again');
    expect(saved.snapshot.probe.workers.map(({ terminations, jobs }) => [terminations, jobs.length])).toEqual([[1, 1]]);
    await expectPagePrivate(page);
    const restored = await expectRestores(page, balance, slice.identity, true);
    expectPrivate(consoled, [failed.snapshot, saved.snapshot, restored.snapshot]);
    await balance.attach();
  });
}

/**
 * The quota of the real quota case: above what the old package uses, below that plus the new one's requirement. Chrome
 * enforces an override only when it is set before the context's first IndexedDB use (resource-cache.ts).
 */
const QUOTA_BYTES = 128 << 10;

test('F-13 real quota: Chrome rejects the commit, its transaction rolls back to the old package, which restores, and the package is saved once space is free', async ({ page, audit, baseURL }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const consoled = consoleText(page);
  await page.addInitScript(installAudioProbe);
  const origin = new URL(baseURL!).origin;
  const cdp = await page.context().newCDPSession(page);
  const usage = async () => (await cdp.send('Storage.getUsageAndQuota', { origin })).usage;
  annotate(testInfo, 'F-13', 'real quota: before: the synthetic package stored under the key and listed, none held, the origin\'s quota overridden '
    + 'before its first IndexedDB use; the commit and a second attempt abort with QuotaExceededError, the stored records unchanged and the old package '
    + 'restorable; with the quota reset, a new import is saved');
  const required = measureStorageRequirement(await modelsPackage());
  if ('status' in required) throw new Error(required.code);

  const evidence: Record<string, unknown> = { quotaBytes: QUOTA_BYTES, requiredBytes: required.requiredBytes };
  const snapshots: unknown[] = [];
  let balance: ResourceBalance | undefined;
  let slice: Awaited<ReturnType<typeof slicePackage>> | undefined;
  const { overridden } = await withQuotaOverride(page, origin, QUOTA_BYTES, async () => {
    await openTestEntry(page);
    await expect(dataStatus(page)).toHaveText(NONE);
    const key = await entryKey(page);
    slice = await slicePackage(key);
    watchCanaries(audit, packageCanaries(slice.groups));
    await loadCacheModules(page);
    const old = await seedSynthetic(page, key);
    evidence.usageWithOldPackage = await usage();
    await relist(page);
    await expect(dataStatus(page)).toHaveText(FOUND);
    const before = await readStoredRecords(page, true);
    await installIdbProbe(page);
    await settleTooling(page);
    const rejecting = await ResourceBalance.start(page, testInfo, { packages: [old.expected] });

    // The commit exceeds the real quota: Chrome aborts its transaction, which had issued every write, and nothing is kept.
    await page.evaluate(() => { window.osrIdbProbe.reset(); });
    await openImport(page, await sliceFiles());
    await runImport(page, audit);
    await expect(statuses(page, 'import-statuses')).toHaveText(imported(MEMORY_MENU));
    await expectCacheFailure(page, 'save-failure', 'quota-exceeded', 'transaction');
    await expectPagePrivate(page);
    const rejected = writeSteps(await probeEvents(page));
    expect(rejected).toEqual(['transaction:readwrite', 'write', 'abort:readwrite:QuotaExceededError']);
    expect(await readStoredRecords(page, true)).toEqual(before);
    evidence.usageAfterRejection = await usage();
    await toMenu(page);
    await expect(statuses(page, 'resource-statuses')).toHaveText(MEMORY_MENU);
    expect(await viewHeld(page, true)).toBe(slice.identity);

    // Saving again under the same quota fails the same way and changes nothing.
    await button(page, 'Save again').click();
    await expect.poll(async () => writeSteps(await probeEvents(page))).toEqual([...rejected, ...rejected]);
    await expect(statuses(page, 'resource-statuses')).toHaveText(MEMORY_MENU);
    await expectCacheFailure(page, 'save-failure', 'quota-exceeded', 'transaction');
    expect(await readStoredRecords(page, true)).toEqual(before);
    // The release evidence of this document, which the reload replaces; the menu shows the save failure's notice.
    snapshots.push((await checkExpecting(rejecting, 'the commit and its retry rejected', [NOTICE])).snapshot);
    await rejecting.attach('resource-balance before the reload');

    // The old package is intact: after a reload it is listed again and restores, verified, with its own identity.
    await page.reload();
    await expect(dataStatus(page)).toHaveText(FOUND);
    await settleTooling(page);
    balance = await ResourceBalance.start(page, testInfo, { packages: [old.expected] });
    await button(page, 'Open saved resources').click();
    await expect(statuses(page, 'resource-statuses').nth(1)).toHaveText(SAVED_BY_RESTORE);
    expect(await viewHeld(page, false)).toBe(old.identity);
    await loadCacheModules(page);
    expect(await readStoredRecords(page, true)).toEqual(before);
    snapshots.push((await balance.check('the old package restored')).snapshot);
  });
  evidence.cdp = overridden;
  await testInfo.attach('quota-evidence', { contentType: 'application/json', body: JSON.stringify(evidence) });
  expect(overridden).toMatchObject({ quota: QUOTA_BYTES, overrideActive: true, usage: 0 });
  expect(evidence.usageWithOldPackage).toBeLessThan(QUOTA_BYTES);
  expect(QUOTA_BYTES - (evidence.usageWithOldPackage as number)).toBeLessThan(required.requiredBytes);

  // With the override reset, a new import of the disc replaces the restored package and is saved.
  await importSaved(page, audit, slice!, packageCanaries(slice!.groups));
  await toMenu(page);
  balance!.expectPackages([slice!.expected]);
  const saved = await balance!.check('saved once space is free');
  await expectPagePrivate(page);
  const restored = await expectRestores(page, balance!, slice!.identity, true);
  expectPrivate(consoled, [...snapshots, saved.snapshot, restored.snapshot]);
  await balance!.attach();
  await cdp.detach();
});

test('F-13 abort and interruption: a commit aborted by a newer import and one cut off by a reload, each after issuing its writes, leave the old package to restore', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const consoled = consoleText(page);
  await page.addInitScript(installAudioProbe);
  await openTestEntry(page);
  await expect(dataStatus(page)).toHaveText(NONE);
  const key = await entryKey(page);
  await loadCacheModules(page);
  const old = await seedSynthetic(page, key);
  await relist(page);
  await expect(dataStatus(page)).toHaveText(FOUND);
  const before = await readStoredRecords(page, true);
  const slice = await slicePackage(key);
  const canaries = packageCanaries(slice.groups);
  watchCanaries(audit, canaries);
  await installIdbProbe(page);
  annotate(testInfo, 'F-13', 'abort and interruption: before: the synthetic package stored under the key and listed, none held; the first import\'s '
    + 'commit is held open after issuing its writes and aborted when a second import replaces the package; the second commit, also held, is cut '
    + 'off by a reload; afterwards the stored records are unchanged and the old package restores; a new import is then saved');
  await settleTooling(page);
  // While a write transaction is held open, a cache reader would wait for it, so this document's cache is not read.
  const holding = await ResourceBalance.start(page, testInfo);

  // Each write transaction is kept open after its requests were issued, so neither commit can complete by itself.
  await openImport(page, await sliceFiles());
  const { issued } = await armHold(page, 'write');
  await runImport(page, audit);
  await issued;
  await expect(statuses(page, 'import-statuses')).toHaveText(imported(SAVING_MENU));

  // The second job on the same files replaces the package, which aborts the first commit; the second commit is held too.
  await runImport(page, audit);
  const aborted = ['transaction:readwrite', 'write', 'abort-call', 'transaction:readwrite', 'write', 'abort:readwrite'];
  await expect.poll(async () => writeSteps(await probeEvents(page))).toEqual(aborted);
  await expect(statuses(page, 'import-statuses')).toHaveText(imported(SAVING_MENU));
  await expectPagePrivate(page);
  await toMenu(page);
  await expect(statuses(page, 'resource-statuses')).toHaveText(SAVING_MENU);
  // The release evidence of this document: both Workers ended, and only the App's second commit is still in flight, with
  // its abort signal's listener, and the menu's listing waits behind its open transaction; the IndexedDB probe listens
  // to each of the two open transactions.
  const held = await checkExpecting(holding, 'the first commit aborted, the second held open', [
    ...Array(3).fill('other listener added since the baseline: abort'), ...Array(2).fill('other listener added since the baseline: complete'),
  ]);
  expect(held.snapshot.probe.workers.map(({ terminations, jobs }) => [terminations, jobs.length])).toEqual([[1, 1], [1, 1]]);
  await holding.attach('resource-balance before the reload');
  await testInfo.attach('write-steps', { contentType: 'application/json', body: JSON.stringify(await probeEvents(page)) });

  // The reload ends the document while the second transaction is open: neither commit left a record.
  await page.reload();
  await expect(dataStatus(page)).toHaveText(FOUND);
  await loadCacheModules(page);
  expect(await readStoredRecords(page, true)).toEqual(before);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [old.expected] });
  await button(page, 'Open saved resources').click();
  await expect(statuses(page, 'resource-statuses').nth(1)).toHaveText(SAVED_BY_RESTORE);
  expect(await viewHeld(page, false)).toBe(old.identity);
  const restored = await balance.check('the old package restored');

  // A new import is saved and replaces it.
  await importSaved(page, audit, slice, canaries);
  await toMenu(page);
  balance.expectPackages([slice.expected]);
  const saved = await balance.check('a new import saved');
  await expectPagePrivate(page);
  const again = await expectRestores(page, balance, slice.identity, true);
  expectPrivate(consoled, [held.snapshot, restored.snapshot, saved.snapshot, again.snapshot]);
  await balance.attach();
});

/** F-13 restore failures: how the store is damaged after the listing, the failure's location, and the next listing. */
const RESTORE_FAILURES: readonly { readonly code: StoredDamage; readonly location: string; readonly relisted: string; readonly damage: string }[] = [
  { code: 'not-found', location: 'key', relisted: NONE, damage: 'its package and payload records deleted' },
  { code: 'cache-corrupt', location: 'groups', relisted: FOUND, damage: 'the first byte of one payload flipped' },
  { code: 'cache-incompatible', location: 'record.formatVersion', relisted: NONE, damage: 'its package record rewritten as format version 2' },
];

for (const failure of RESTORE_FAILURES) {
  test(`F-13 restore ${failure.code}: refused with a re-import prompt and nothing held, the store unchanged, and a new import is saved (I-5)`, async ({ page, audit }, testInfo) => {
    audit.canaries({ name: 'file-name', value: MARKER });
    const consoled = consoleText(page);
    await page.addInitScript(installAudioProbe);
    await openTestEntry(page);
    await expect(dataStatus(page)).toHaveText(NONE);
    const key = await entryKey(page);
    await loadCacheModules(page);
    await seedSynthetic(page, key);
    await relist(page);
    await expect(dataStatus(page)).toHaveText(FOUND);
    const listed = await readStoredRecords(page, true);
    const slice = await slicePackage(key);
    const canaries = packageCanaries(slice.groups);
    watchCanaries(audit, canaries);
    annotate(testInfo, 'F-13', `restore ${failure.code}: before: the synthetic package listed as restorable, none held, then ${failure.damage}; `
      + `the restore fails at ${failure.location}, nothing is held and the damaged store is unchanged; with no package, a new import is saved`);
    await settleTooling(page);
    // The damaged store holds no valid package, so the cache is compared with its own state rather than an expectation.
    const balance = await ResourceBalance.start(page, testInfo);

    // The comparison base is the store as damaged, after the listing that offered the package.
    await damageStoredPackage(page, key, failure.code);
    const damaged = await readStoredRecords(page, true);
    expect(damaged).not.toEqual(listed);
    if (failure.code === 'not-found') expect(damaged).toEqual({ packages: [], payloads: [] });
    await button(page, 'Open saved resources').click();
    await expectCacheFailure(page, 'restore-failure', failure.code, failure.location);
    await expect(dataStatus(page)).toHaveText(FOUND);
    await expect(button(page, 'View resources')).toHaveCount(0);
    await expect(page.getByTestId('resource-statuses')).toHaveCount(0);
    expect(await readStoredRecords(page, true)).toEqual(damaged);
    const refused = await checkExpecting(balance, 'the restore refused, its notice shown', [NOTICE]);
    expect(refused.snapshot.probe.workers).toEqual([]);

    // The next listing: a missing or incompatible package is no longer offered; a damaged one still is, and fails again.
    await relist(page);
    await expect(dataStatus(page)).toHaveText(failure.relisted);
    if (failure.code === 'cache-corrupt') {
      await button(page, 'Open saved resources').click();
      await expect(page.getByRole('status').filter({ hasText: 'Restoring' })).toHaveCount(0);
      await expectCacheFailure(page, 'restore-failure', failure.code, failure.location);
      await expect(button(page, 'View resources')).toHaveCount(0);
    } else {
      await expect(button(page, 'Open saved resources')).toHaveCount(0);
    }
    expect(await readStoredRecords(page, true)).toEqual(damaged);

    // I-5: with no package held, a new import is saved and replaces whatever the key held.
    await importSaved(page, audit, slice, canaries);
    await toMenu(page);
    await expect(statuses(page, 'resource-statuses')).toHaveText(SAVED_MENU);
    await expect(page.getByTestId('restore-failure')).toHaveCount(0);
    expect(await viewHeld(page, true)).toBe(slice.identity);
    balance.expectPackages([slice.expected]);
    const saved = await balance.check('a new import saved');
    await expectPagePrivate(page);
    const restored = await expectRestores(page, balance, slice.identity, true);
    expectPrivate(consoled, [refused.snapshot, saved.snapshot, restored.snapshot]);
    await balance.attach();
  });
}

/** An older converter version of the slice disc's package, and another disc's fingerprint. */
const OLDER_CONVERTER = 'osr-import.graphics-2.logic-1.audio-1.models-1';
const OTHER_FINGERPRINT = `source:sha256:${'cd'.repeat(32)}`;

test('F-13 isolation: other converter versions and fingerprints stay untouched, an incompatible entry is filtered at the menu, and an import replaces only its own key', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const consoled = consoleText(page);
  await page.addInitScript(installAudioProbe);
  await openTestEntry(page);
  await expect(dataStatus(page)).toHaveText(NONE);
  const key = await entryKey(page);
  const older = { ...key, converterVersion: readConverterVersion(OLDER_CONVERTER) };
  const other = { ...key, originToken: OTHER_FINGERPRINT };
  await loadCacheModules(page);
  const kept = [await seedSynthetic(page, key, { converterVersion: OLDER_CONVERTER }), await seedSynthetic(page, key, { fingerprint: OTHER_FINGERPRINT })];
  await seedSynthetic(page, key);
  await damageStoredPackage(page, key, 'cache-incompatible');
  const slice = await slicePackage(key);
  const canaries = packageCanaries(slice.groups);
  watchCanaries(audit, canaries);
  annotate(testInfo, 'F-13', 'isolation: before: synthetic packages under an older converter version and another fingerprint, and one under the '
    + 'expected key rewritten as format version 2, none held; the menu offers none; the import replaces only the expected key, the others unchanged; '
    + 'after a reload only the new package is offered and restores');

  // The adapter lists all three; the menu offers none: two belong to other profiles and one is incompatible.
  const listing = await page.evaluate(async () => {
    const subject = window.osrCache.cache.createResourceCache();
    const result = await subject.list();
    subject.close();
    return result.status === 'listed' ? result.entries.map(({ key: entry, status }) => [entry?.originToken, entry?.converterVersion, status]) : result.code;
  });
  expect(listing).toEqual([
    [key.originToken, OLDER_CONVERTER, 'compatible'], [key.originToken, key.converterVersion, 'incompatible'], [OTHER_FINGERPRINT, key.converterVersion, 'compatible'],
  ]);
  await relist(page);
  await expect(dataStatus(page)).toHaveText(NONE);
  await expect(button(page, 'Open saved resources')).toHaveCount(0);
  const before = await readStoredRecords(page, true);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo);

  await openImport(page, await sliceFiles());
  await runImport(page, audit);
  await expect(statuses(page, 'import-statuses')).toHaveText(imported(SAVED_MENU));
  await toMenu(page);
  // Only the expected key changed; the other version and fingerprint keep every record, field by field.
  const after = await readStoredRecords(page, true);
  for (const entry of [older, other]) expect(recordsOf(after, entry)).toEqual(recordsOf(before, entry));
  expect(comparableRecords(recordsOf(after, key))).toEqual(slice.records);
  expect(after.packages).toHaveLength(3);
  await expectCacheArrival(page, canaries);
  balance.expectPackages([...kept.map(({ expected }) => expected), slice.expected]);
  await balance.beforeReload('imported beside the other entries');

  // After a reload only the new package is offered; it restores with the import's identity.
  await page.reload();
  await expect(dataStatus(page)).toHaveText(FOUND);
  await settleTooling(page);
  await balance.rebaseline();
  await button(page, 'Open saved resources').click();
  await expect(statuses(page, 'resource-statuses').nth(1)).toHaveText(SAVED_BY_RESTORE);
  expect(await viewHeld(page, true)).toBe(slice.identity);
  await loadCacheModules(page);
  expect(await readStoredRecords(page, true)).toEqual(after);
  const restored = await balance.check('the new package restored');
  await expectPagePrivate(page);
  expectPrivate(consoled, [restored.snapshot]);
  await balance.attach();
});

// F-14: re-entry and lifecycle

/** The sound the looping package replaces, and its Play button. */
const LOOP_SOUND = 'sound/warp';
const PLAY_LOOP = `Play ${LOOP_SOUND}`;

let looping: Promise<readonly HeldGroup[]> | undefined;
/**
 * The `models` package with `LOOP_SOUND` replaced by an audible synthetic loop (a square wave of amplitude 0.5, 25
 * frames low and 25 high at 11025 Hz), so a sound is still playing when the page is hidden or left; the converted
 * sounds last milliseconds. Its manifest declares the new payload's identity.
 */
function loopingPackage(): Promise<readonly HeldGroup[]> {
  return looping ??= modelsPackage().then(groups => {
    const bytes = sound({ loop: 'whole', pcm: Uint8Array.from({ length: 2_000 }, (_, index) => (Math.floor(index / 25) % 2 ? 192 : 64)) });
    const inputs = readGroupInputs(groups, 'invalid-request');
    // The package identity is derived anew from the same basis, since it covers every payload identity.
    const { schemaVersion, sliceId, sliceDefinitionVersion, converterVersion, origin } = inputs[0].manifest.identity;
    return Object.freeze(applyManifestIdentity({ schemaVersion, sliceId, sliceDefinitionVersion, converterVersion, origin }, inputs.map(({ manifest, payloads, sources }) => ({
      group: manifest.group,
      assets: manifest.assets.map(asset => (asset.id !== LOOP_SOUND ? asset
        : { ...asset, payloadIdentity: { ...asset.payloadIdentity, byteLength: bytes.byteLength, fingerprint: sha256Fingerprint(bytes) } })),
      payloads: payloads.map(payload => (payload.id === LOOP_SOUND ? { ...payload, bytes } : payload)),
      sources,
    }))).map((group): HeldGroup => ({ group: group.manifest.group, ...group })));
  });
}

interface HeldLoop {
  readonly expected: ExpectedPackage;
  readonly menu: readonly string[];
}

/**
 * Seeds the looping package under the production profile, with the audit watching its canaries, which it then finds in
 * the cache; lists it again and restores it from the menu.
 */
async function holdLooping(page: Page, audit: Audit): Promise<HeldLoop> {
  expect(await entryKey(page)).toEqual(PRODUCTION_KEY);
  const { groups } = await seedProductionCache(page, await loopingPackage());
  const canaries = packageCanaries(groups);
  watchCanaries(audit, canaries);
  await expectCacheArrival(page, canaries);
  await relist(page);
  await expect(dataStatus(page)).toHaveText(FOUND);
  await button(page, 'Open saved resources').click();
  await expect(statuses(page, 'resource-statuses').nth(1)).toHaveText(SAVED_BY_RESTORE);
  await expect(dataStatus(page)).toHaveText(HELD);
  return { expected: expectedPackage(PRODUCTION_KEY, groups), menu: await statusTexts(page, 'resource-statuses') };
}

/** Opens the viewer from the menu and waits until it and its audio are prepared. */
async function openViewerScreen(page: Page): Promise<void> {
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expect(page.getByTestId('viewer-render-status')).not.toHaveText('Preparing the viewer…');
  await expect(page.getByTestId('viewer-audio-status')).toHaveAttribute('data-status', /./);
}

const audioRecords = (page: Page) => page.evaluate(() => window.osrAudioProbe.records());

/** Plays the loop with a trusted click and waits until it plays: one more source started, one voice running. */
async function playLoop(page: Page): Promise<void> {
  const started = await page.evaluate(() => window.osrAudioProbe.started());
  await button(page, PLAY_LOOP).click();
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.started())).toBe(started + 1);
  await expect(page.getByTestId('viewer-audio-status')).toHaveAttribute('data-status', 'running');
  await expect(page.getByTestId('viewer-voices')).toHaveText('1');
  expect(await page.evaluate(() => window.osrAudioProbe.routed())).toBe(1);
}


test('F-14 re-entry: leaving a running job and returning during an audition release their owners, and a new job and view start', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const consoled = consoleText(page);
  await page.addInitScript(installAudioProbe);
  await openTestEntry(page, { worker: 'busy' });
  await expect(dataStatus(page)).toHaveText(NONE);
  await loadCacheModules(page);
  const held = await holdLooping(page, audit);
  const stored = await readStoredRecords(page);
  annotate(testInfo, 'F-14', 're-entry: before: the looping package seeded and restored; a running job is left and the import page entered again, '
    + 'whose new owner starts a job that is cancelled; the viewer is left twice while its loop plays; afterwards the menu baseline, with the package unchanged');
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [held.expected] });
  const expectHeld = async () => {
    await expect(dataStatus(page)).toHaveText(HELD);
    expect(await statusTexts(page, 'resource-statuses')).toEqual(held.menu);
    expect(await readStoredRecords(page)).toEqual(stored);
  };

  // A job left while it runs: its owner ends it, and the Worker is terminated once.
  await openImport(page, UNREAD_FILES);
  const first = await jobOwners(page);
  expect(first.live).toBe('1');
  await button(page, 'Start import').click();
  await expect(page.getByTestId('import-progress')).toHaveAttribute('data-stage', 'identify-source');
  await audit.ready();
  await toMenu(page);
  await expect.poll(async () => (await workers(page)).map(({ terminations }) => terminations)).toEqual([1]);
  await expectHeld();
  const left = await balance.check('left a running job');

  // Entering again makes a new owner with no result of the old job, and its own job starts.
  await openImport(page, UNREAD_FILES);
  const second = await jobOwners(page);
  expect(Number(second.serial)).toBeGreaterThan(Number(first.serial));
  expect(second.live).toBe('1');
  for (const testId of ['import-progress', 'import-result', 'import-failure']) await expect(page.getByTestId(testId)).toHaveCount(0);
  await button(page, 'Start import').click();
  await expect(page.getByTestId('import-progress')).toHaveAttribute('data-stage', 'identify-source');
  await audit.ready();
  expect((await workers(page)).map(({ name, jobs, terminations }) => ({ name, jobs, terminations })))
    .toEqual([{ name: 'busy', jobs: [1], terminations: 1 }, { name: 'busy', jobs: [1], terminations: 0 }]);
  await button(page, 'Cancel import').click();
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'cancelled');
  await expectPagePrivate(page);
  await toMenu(page);
  await expectHeld();
  const entered = await balance.check('a new job after entering again');

  // The viewer left while its loop plays: the voice stops and the audio context closes; a new view plays again.
  const snapshots: unknown[] = [left.snapshot, entered.snapshot];
  for (const visit of [1, 2]) {
    await openViewerScreen(page);
    await playLoop(page);
    await button(page, 'Return to menu').click();
    await expect(button(page, 'View resources')).toBeFocused();
    await expectHeld();
    snapshots.push((await balance.check(`left the viewer during audition ${visit}`)).snapshot);
  }
  expect(await audioRecords(page)).toEqual([1, 2].map(id => ({ id, state: 'closed', closes: ['resolved'] })));
  await expectPagePrivate(page);
  expectPrivate(consoled, snapshots);
  await balance.attach();
});

/**
 * The registrations a shown viewer holds, without identities: active listeners by group, target kind, type and phase
 * (React DOM's per-element ones only on elements in the document), observing observers, connected canvases, live
 * Workers, audio contexts not closed, and nodes routed to a destination.
 */
const activeState = (page: Page) => page.evaluate(() => {
  const { listeners, observers, canvases, workers: started } = window.osrProbe.snapshot();
  const counts: Record<string, number> = {};
  for (const entry of listeners) {
    if (!entry.active || entry.group === 'test' || (entry.element === 'react' && entry.detached)) continue;
    const name = `${entry.group}:${entry.element ?? 'direct'}:${entry.type}:${entry.capture}`;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return {
    listeners: counts,
    observers: observers.filter(({ targets }) => targets.length > 0).length,
    canvases: canvases.filter(({ connected }) => connected).length,
    workers: started.filter(({ terminations }) => terminations === 0).length,
    audio: window.osrAudioProbe.records().filter(({ state }) => state !== 'closed').length,
    routed: window.osrAudioProbe.routed(),
  };
});


/** What a Fast Refresh replaces: the viewer owner, its canvas and its last audio context. */
async function ownerState(page: Page) {
  const [canvas] = await connectedCanvases(page);
  return { owner: Number(await viewerOwner(page)), canvas, audio: (await audioRecords(page)).length };
}

/**
 * After a Fast Refresh of the viewer owner hook: a new owner in the same document holds a fresh viewer's active
 * registrations, showing the same item, and the old owner's canvas and audio context are released.
 */
async function expectReplaced(page: Page, before: Awaited<ReturnType<typeof ownerState>>, fresh: unknown, mark: string, item: string, label: string): Promise<void> {
  await expect.poll(async () => {
    const connected = await connectedCanvases(page);
    return { owner: Number(await viewerOwner(page)), replaced: connected.length === 1 && connected[0] !== before.canvas };
  }, { timeout: 15_000, message: `${label}: a new owner with a new canvas` }).toEqual({ owner: before.owner + 1, replaced: true });
  expect(await documentMark(page), `${label}: the same document`).toBe(mark);
  expect(await page.evaluate(id => window.osrProbe.snapshot().canvases.find(entry => entry.id === id), before.canvas), `${label}: the old canvas`)
    .toMatchObject({ connected: false, lost: true });
  await expect.poll(async () => (await audioRecords(page)).slice(0, before.audio).map(({ state, closes }) => [state, closes]), { message: `${label}: the old audio contexts` })
    .toEqual(Array(before.audio).fill(['closed', ['resolved']]));
  await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${item}`);
  await expect.poll(() => activeState(page), { message: `${label}: the active baseline of a fresh viewer` }).toEqual(fresh);
}

test('F-14 viewer Fast Refresh: every new owner holds a fresh viewer\'s active baseline, the old one is released, and leaving reaches the menu baseline', async ({ page, audit }, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript(installAudioProbe);
  await openTestEntry(page, { worker: 'busy' });
  await expect(dataStatus(page)).toHaveText(NONE);
  const held = await holdLooping(page, audit);
  annotate(testInfo, 'F-14', 'viewer Fast Refresh: before: the looping package seeded and restored, the viewer open with a model shown and the loop '
    + 'playing; three edits of the viewer owner hook and its restoration each replace the owner; afterwards the menu baseline');
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { packages: [held.expected] });
  const mark = await markDocument(page);

  await openViewerScreen(page);
  // StrictMode's first mount: one owner and one connected viewer canvas.
  expect(await viewerOwner(page)).toBe('1');
  const { entry } = await firstEntry('model');
  await entryButton(page, entry.id).click();
  await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${entry.id}`);
  const fresh = await activeState(page);
  expect(fresh).toMatchObject({ canvases: 1, workers: 0, audio: 0, routed: 0 });
  await playLoop(page);

  let restoring: Awaited<ReturnType<typeof ownerState>> | undefined;
  await withEdits('src/app/composition/use-viewer-owner.ts', async edit => {
    for (let n = 1; n <= 3; n++) {
      const before = await ownerState(page);
      await edit(n);
      await expectReplaced(page, before, fresh, mark, entry.id, `edit ${n}`);
      // A new view of the new owner plays.
      await playLoop(page);
    }
    restoring = await ownerState(page);
  });
  // Restoring the file is one more refresh.
  await expectReplaced(page, restoring!, fresh, mark, entry.id, 'the restored file');
  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  const left = await balance.check('left the viewer after Fast Refresh');
  expect(left.snapshot.audio?.contexts).toHaveLength(4);
  expect(left.snapshot.probe.canvases.map(({ connected, lost }) => [connected, lost])).toEqual(Array(5).fill([false, true]));
  await balance.attach();
});

/**
 * Serialized before navigation: holds every `AudioContext.prototype.resume()` call while holding, until released, as
 * a slow audio device would. The real call then runs with the caller's own promise settled by it; nothing else of the
 * context changes, and it adds no listener.
 */
function installResumeGate(): void {
  const resume = AudioContext.prototype.resume;
  const waiting: (() => void)[] = [];
  let holding = false;
  let resumed = 0;
  let refused = 0;
  AudioContext.prototype.resume = function (this: AudioContext): Promise<void> {
    const run = (): Promise<void> => resume.call(this).then(() => { resumed++; }, (error: unknown) => {
      refused++;
      throw error;
    });
    if (!holding) return run();
    return new Promise<void>((resolve, reject) => { waiting.push(() => { run().then(resolve, reject); }); });
  };
  window.osrResumeGate = {
    hold: () => { holding = true; },
    held: () => waiting.length,
    release: () => {
      holding = false;
      return waiting.splice(0).map(start => start()).length;
    },
    resumed: () => resumed,
    refused: () => refused,
  };
}

/** In the page: the viewer's audio as shown and as the probes observe it. */
function audioView() {
  const text = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;
  const gate = window.osrResumeGate!;
  return {
    visibility: document.visibilityState,
    status: document.querySelector('[data-testid="viewer-audio-status"]')?.getAttribute('data-status') ?? null,
    voices: text('viewer-voices'),
    failure: text('viewer-audition-failure'),
    contexts: window.osrAudioProbe.records(),
    started: window.osrAudioProbe.started(),
    routed: window.osrAudioProbe.routed(),
    peak: window.osrAudioProbe.peak(),
    held: gate.held(),
    resumed: gate.resumed(),
    refused: gate.refused(),
    visibilityEvents: [...window.osrAudioProbe.visibility],
  };
}

/** The native page as `ResourceBalance`, `frameWindow`, `readCacheKeys` and `seedProductionCache` use a page: by `evaluate` alone. */
const evaluator = (target: NativeTarget): Page =>
  ({ evaluate: (read: (argument: unknown) => unknown, argument?: unknown) => target.evaluate(read, argument) }) as unknown as Page;

/** A trusted CDP click on the enabled button with this accessible name (its label, else its text). */
async function press(target: NativeTarget, name: string): Promise<void> {
  const point = await target.evaluate(label => {
    const element = [...document.querySelectorAll('button')].find(candidate => (candidate.getAttribute('aria-label') ?? candidate.textContent) === label);
    if (!element || element.disabled) throw new Error(`No enabled button named ${label}`);
    element.scrollIntoView({ block: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, name);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await target.command('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
}

const pageText = (target: NativeTarget, testId: string) => target.evaluate(id => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null, testId);
const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

test('F-14 real hidden and visible: hiding stops the playing loop and drops a pending audition, and nothing replays on return', async ({ audit, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Real visibility requires a development origin');
  test.setTimeout(180_000);
  annotate(testInfo, 'F-14', 'real hidden and visible, in a native headed browser with two tabs: before: the looping package seeded and restored in '
    + 'the app, the viewer open; a playing loop and, separately, a pending audition are hidden and shown again, and a pending audition is left; '
    + 'nothing plays afterwards, and the menu baseline is reached');
  const loop = await loopingPackage();
  const browser = await nativeBrowser();
  let root: CDPSession | undefined;
  let contextId: string | undefined;
  let app: NativeTarget | undefined;
  const attached: string[] = [];
  try {
    root = await browser.newBrowserCDPSession();
    const cdp = root;
    contextId = (await cdp.send('Target.createBrowserContext')).browserContextId;
    const appId = (await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    const alternateId = (await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    for (const targetId of [appId, alternateId]) {
      await audit.attachTarget(browser, targetId);
      attached.push(targetId);
    }
    const session = await cdp.send('Target.attachToTarget', { targetId: appId, flatten: false });
    const native = app = new NativeTarget(cdp, session.sessionId);
    for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await native.command(`${domain}.enable`);
    await native.command('Page.addScriptToEvaluateOnNewDocument', {
      source: [installBrowserProbes, installAudioProbe, installResumeGate].map(script => `(${script.toString()})();`).join(''),
    });
    await native.command('Page.navigate', { url: baseURL });
    await cdp.send('Target.activateTarget', { targetId: appId });
    const view = () => native.evaluate(audioView);
    const show = async (targetId: string) => { await cdp.send('Target.activateTarget', { targetId }); };
    await until(() => pageText(native, 'original-data-status'), text => text === NONE, 'Application load');

    // The looping package, seeded under the production profile of the app's own entry and restored from the menu.
    const page = evaluator(native);
    const { groups } = await seedProductionCache(page, loop);
    const canaries = packageCanaries(groups);
    watchCanaries(audit, canaries);
    await expectCacheArrival(page, canaries);
    await press(native, 'Import original game data');
    await until(() => native.evaluate(() => document.querySelector('#import-heading') !== null), Boolean, 'Import page');
    await press(native, 'Return to menu');
    await until(() => pageText(native, 'original-data-status'), text => text === FOUND, 'Listed');
    await press(native, 'Open saved resources');
    await until(() => pageText(native, 'original-data-status'), text => text === HELD, 'Restored');
    const balance = await ResourceBalance.start(page, testInfo, { packages: [expectedPackage(PRODUCTION_KEY, groups)] });
    await press(native, 'View resources');
    await until(view, state => state.status === 'idle', 'Viewer audio prepared');

    // A loop playing when the tab is really hidden: it stops and is not replayed on return.
    await press(native, PLAY_LOOP);
    const playing = await until(view, state => state.status === 'running' && state.voices === '1' && state.peak > 0.25, 'Audible loop');
    await show(alternateId);
    const hidden = await until(view, state => state.visibility === 'hidden' && state.status === 'suspended' && state.contexts.at(-1)?.state === 'suspended', 'Native hidden');
    expect(hidden).toMatchObject({ voices: '0', routed: 0, started: playing.started, failure: null });
    await show(appId);
    await until(view, state => state.visibility === 'visible' && state.status === 'running', 'Native visible and resumed');
    await pause(300);
    const returned = await view();
    // A suspended context's tap keeps its last frame, so the evidence of silence is that no source started or is routed.
    expect(returned).toMatchObject({ status: 'running', voices: '0', routed: 0, started: playing.started });

    /** Hides and shows the tab with the context's resume held, so it is visible with its audio still suspended. */
    const visibleSuspended = async (label: string) => {
      await native.evaluate(() => { window.osrResumeGate!.hold(); });
      await show(alternateId);
      await until(view, state => state.visibility === 'hidden' && state.status === 'suspended', `${label}: hidden`);
      await show(appId);
      return until(view, state => state.visibility === 'visible' && state.status === 'suspended' && state.held === 1, `${label}: visible, still suspended`);
    };
    /** Clicks Play while suspended: the audition waits for the running context, and its unlock is one more held resume. */
    const pendingAudition = async (label: string) => {
      const before = await view();
      await press(native, PLAY_LOOP);
      const pending = await until(view, state => state.held === before.held + 1, `${label}: pending audition`);
      expect(pending).toMatchObject({ status: 'suspended', voices: '0', started: before.started, failure: null });
      return pending;
    };

    // Control: a pending audition that is kept plays once the context runs.
    await visibleSuspended('control');
    const kept = await pendingAudition('control');
    expect(await native.evaluate(() => window.osrResumeGate!.release())).toBe(2);
    const played = await until(view, state => state.status === 'running' && state.voices === '1' && state.started === kept.started + 1, 'The kept audition plays');
    await press(native, 'Stop all sounds');
    await until(view, state => state.voices === '0' && state.routed === 0, 'Stopped');

    // Hidden with a pending audition: it is dropped. The held resume, released while hidden, runs the context, which the
    // controller suspends again; on return the context resumes and nothing plays.
    await visibleSuspended('hidden while pending');
    const dropped = await pendingAudition('hidden while pending');
    await show(alternateId);
    await until(view, state => state.visibility === 'hidden', 'Hidden while pending');
    expect(await native.evaluate(() => window.osrResumeGate!.release())).toBe(2);
    await until(view, state => state.resumed > dropped.resumed && state.contexts.at(-1)?.state === 'suspended' && state.status === 'suspended', 'Resumed and suspended again while hidden');
    await show(appId);
    await until(view, state => state.visibility === 'visible' && state.status === 'running', 'Visible and resumed');
    await pause(300);
    const afterDrop = await view();
    expect(afterDrop).toMatchObject({ status: 'running', voices: '0', routed: 0, started: played.started, failure: null });

    // Leaving the viewer with a pending audition releases it. The held resumes then settle against the closed context,
    // and nothing of the released viewer reaches the page: no source starts and the page does not change.
    await visibleSuspended('left while pending');
    const leaving = await pendingAudition('left while pending');
    await press(native, 'Return to menu');
    await until(() => pageText(native, 'original-data-status'), text => text === HELD, 'Back at the menu');
    const left = await balance.check('left the viewer with a pending audition');
    await native.evaluate(() => {
      window.osrMutations = 0;
      new MutationObserver(records => { window.osrMutations! += records.length; })
        .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    expect(await native.evaluate(() => window.osrResumeGate!.release())).toBe(2);
    const settled = await until(view, state => state.resumed + state.refused === leaving.resumed + leaving.refused + 2, 'The released resumes settled');
    await native.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
    const records = await native.evaluate(() => ({
      started: window.osrAudioProbe.started(), routed: window.osrAudioProbe.routed(), contexts: window.osrAudioProbe.records(), mutations: window.osrMutations,
    }));
    expect(settled.refused).toBe(leaving.refused + 2);
    expect(records).toEqual({ started: leaving.started, routed: 0, contexts: [{ id: 1, state: 'closed', closes: ['resolved'] }], mutations: 0 });
    const quiet = await balance.check('the released resumes settled');
    expect(afterDrop.visibilityEvents.slice(-8)).toEqual(Array(4).fill(['hidden', 'visible']).flat());
    expect(native.errors, 'Native page errors').toEqual([]);
    await testInfo.attach('native-visibility', {
      contentType: 'application/json',
      body: JSON.stringify({
        browser: browser.version(), origin: baseURL, playing, hidden, returned, kept, played, dropped, afterDrop, leaving, settled, records, allowed: native.allowed,
      }),
    });
    expect(JSON.stringify([left.snapshot, quiet.snapshot])).not.toContain(MARKER);
    await balance.attach();
    for (const targetId of [alternateId, appId]) {
      await audit.close(targetId);
      attached.splice(attached.indexOf(targetId), 1);
    }
  } finally {
    for (const targetId of attached) await audit.close(targetId).catch(() => undefined);
    app?.dispose();
    try {
      if (root && contextId) await root.send('Target.disposeBrowserContext', { browserContextId: contextId });
    } finally {
      await browser.close();
    }
  }
});
