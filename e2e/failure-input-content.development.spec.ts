import type { Page, TestInfo } from '@playwright/test';
import type { HeldGroup } from '../src/app/resources/resource-holder.ts';
import type { GroupInput } from '../src/content/completeness.ts';
import { CLASSIC_P2_SLICE } from '../src/content/slice-definition.ts';
import { packageRecordKey, payloadRecordKey, type ResourceCacheKey } from '../src/platform/storage/resource-cache-contract.ts';
import { buildPackageRecord, buildStoredPayload, inDefinitionOrder, readGroupInputs } from '../src/platform/storage/resource-cache-records.ts';
import {
  FAILURE_MATRIX, type ExpectedError, type ExpectedFinish, type ExpectedMission, type FailureCase,
} from '../src/workers/failure-matrix.test-support.ts';
import { IMPORT_SCENARIOS } from '../src/workers/import-scenarios.test-support.ts';
import { PRODUCTION_PACKAGE, type ExpectedPackageProfile } from '../src/workers/production-package.ts';
import { MARKER } from '../src/workers/synthetic-import.test-support.ts';
import { button, filePayloads, openTestEntry, sliceFiles, type FilePayload } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import { consoleText } from './support/browser-test.ts';
import { seedProductionCache } from './support/production-cache.ts';
import { expectedPackage, readCacheKeys, ResourceBalance, type ExpectedPackage } from './support/resource-balance.ts';
import { loadCacheModules, readStoredRecords, seedPackage, type StoredRecords } from './support/resource-cache.ts';
import { entryButton, expectSamples, firstEntry, modelsPackage, pictureOf, pictureSamples, viewerDiagnostics } from './support/viewer-observations.ts';

// P2-12 subtask 08 (S-04, AC-06, AC-07, AC-10): the failure matrix F-01 to F-10 on the development test entry, through
// the import page's file chooser, with the network audit on. Each case first holds a package, triggers its row and
// checks the outcome the table in src/workers/failure-matrix.test-support.ts fixes in advance (I-1), what the holder
// keeps (I-2), the Workers and registrations against the menu baseline (I-3, I-4) and that no file name or marked text
// reaches the page, the console or the probes (I-6). Where the held package must stay, its identity and pixels are
// compared and a new job started (I-5).

test.describe.configure({ timeout: 120_000 });

/**
 * How a case holds its package before the row: the `models` scenario imports the slice disc; `content-invalid`, which
 * identifies no disc and so keeps the production profile, restores the seeded `models` package; every other scenario
 * restores the content test support's synthetic package seeded under its profile.
 */
type Precondition = 'imported' | 'seeded-models' | 'seeded-synthetic';

const preconditionOf = ({ worker }: FailureCase): Precondition =>
  (worker === 'models' ? 'imported' : worker === 'content-invalid' ? 'seeded-models' : 'seeded-synthetic');

interface Held {
  readonly expected: ExpectedPackage;
  /** The stored records with each payload's digest, as the row finds them. */
  readonly stored: Records;
  /** The menu's resource statuses, durations included. */
  readonly menu: readonly string[];
  /** The viewer's identity line. */
  readonly identity: string;
}

/** The page category and its sentence for each fixed error, from the P2-11 failure copy contract. */
const STRUCTURE = ['disc/structure', 'The disc image layout or structure is not supported.'] as const;
const CHECKS = ['source/checks', 'The original data did not pass a structure or conversion check.'] as const;
const INTERNAL = ['import/internal', 'The import failed because of an internal or protocol error.'] as const;
const COPY: Readonly<Record<string, readonly [category: string, message: string]>> = Object.freeze({
  'disc/unsupported-file-set': ['disc/file-set', 'The selected files are not a supported CloneCD set: a .ccd file and the .img file with the same name, optionally with .sub and .cue.'],
  'disc/image-size-mismatch': STRUCTURE,
  'disc/invalid-directory': STRUCTURE,
  'disc/limit-exceeded': ['disc/limits', 'The disc image exceeds a reading limit or budget.'],
  'source/budget-exceeded': ['source/limits', 'The original data exceeds a conversion limit or budget.'],
  'source/unsupported-version': ['source/version', 'This disc is not a supported version of Star Rangers.'],
  'source/invalid-payload': CHECKS,
  'source/entry-not-found': CHECKS,
  'content/invalid-record': ['content/default', 'The converted resources did not pass content validation.'],
  'import/invalid-result': INTERNAL,
  'import/protocol-error': INTERNAL,
});

const SAVED_BY_COMMIT = /^Saved in this browser \(saved in \d+(?: ms|\.\d\d s)\)$/;
const SAVED_BY_RESTORE = /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/;
const PARTIAL = 'Partial conversion: not a usable resource package';
/** The import statuses of the slice disc's complete package, once saved. */
const COMPLETE_IMPORT = ['Source identified', 'Complete resources, viewable', SAVED_BY_COMMIT, 'Mission loads into Core'];

const keyOf = ({ sourceFingerprint, converterVersion }: ExpectedPackageProfile): ResourceCacheKey =>
  Object.freeze({ originType: 'original-import', originToken: sourceFingerprint, converterVersion });

const statuses = (page: Page, testId: string) => page.getByTestId(testId).locator('li');

/**
 * The Workers from one probe snapshot, and its active registrations outside Vite, the test tooling and React DOM's
 * per-element listeners, with the observers that observe something.
 */
const observe = (page: Page) => page.evaluate(() => {
  const { workers, listeners, observers } = window.osrProbe.snapshot();
  return {
    workers,
    registrations: {
      listeners: listeners.filter(entry => entry.active && entry.element !== 'react' && entry.group !== 'vite' && entry.group !== 'test')
        .map(entry => `${entry.group}:${entry.target}:${entry.type}:${entry.id}`).sort(),
      observers: observers.filter(observer => observer.targets.length > 0).map(({ id }) => id).sort(),
    },
  };
});

const missionStatus = (mission: ExpectedMission): string[] =>
  (mission.status === 'loaded' ? ['Mission loads into Core'] : mission.status === 'failed' ? ['Mission does not load into Core'] : []);

/** The held package's statuses on the menu after a finished case. */
const finishedMenu = ({ package: pkg, mission }: ExpectedFinish): (string | RegExp)[] =>
  [...(pkg.status === 'complete' ? ['Complete resources, viewable', SAVED_BY_COMMIT] : [PARTIAL]), ...missionStatus(mission)];

/** Every slice group as the page lists it: received complete or incomplete, or missing. */
const groupStates = ({ groups }: ExpectedFinish): string[] => CLASSIC_P2_SLICE.groups.map(group => {
  const received = groups.find(entry => entry.group === group);
  return `${group}: ${received === undefined ? 'missing' : received.status === 'group-complete' ? 'complete' : 'incomplete'}`;
});

/** A failure notice's technical details by term, without the reason text and time, which the table does not fix. */
async function fixedDetails(page: Page, testId: string): Promise<Record<string, string | null>> {
  const rows = await page.getByTestId(testId).locator('dl').evaluate(list => [...list.querySelectorAll('dt')]
    .map(term => [term.textContent ?? '', term.nextElementSibling?.textContent ?? null] as const));
  return Object.fromEntries(rows.filter(([term]) => term !== 'Reason' && term !== 'Time'));
}

const errorDetails = ({ layer, code, location, limit }: ExpectedError) => ({
  Layer: layer, Code: code, Location: location,
  ...(limit ? { Limit: `${limit.name}: ${limit.observed} of at most ${limit.limit}` } : {}),
});

/** FNV-1a of `bytes`, as `readStoredRecords` digests each stored payload. */
function digest(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16);
}

/**
 * Stored records in key order, each package record parsed: a built expectation is in another order, and a seeded
 * record may order its fields otherwise than the adapter.
 */
const comparable = ({ packages, payloads }: StoredRecords) => {
  const byKey = (left: { key: unknown[] }, right: { key: unknown[] }) => {
    const [a, b] = [JSON.stringify(left.key), JSON.stringify(right.key)];
    return a < b ? -1 : a > b ? 1 : 0;
  };
  return { packages: [...packages].sort(byKey).map(({ key, value }) => ({ key, value: JSON.parse(value) as unknown })), payloads: [...payloads].sort(byKey) };
};

type Records = ReturnType<typeof comparable>;

/** The page's stored records, comparable with `expectedRecords`. */
const storedRecords = async (page: Page): Promise<Records> => comparable(await readStoredRecords(page));

/** The records the cache stores for `groups`, built by the adapter's own record builders: the package record and each payload's digest. */
function expectedRecords(groups: readonly GroupInput[]): Records {
  const ordered = inDefinitionOrder(readGroupInputs(groups, 'invalid-request'), 'invalid-request');
  const record = buildPackageRecord(ordered);
  return comparable({
    packages: [{ key: packageRecordKey(record.key), value: JSON.stringify(record) }],
    payloads: ordered.flatMap(({ payloads }) => payloads.map(payload => {
      const { schemaVersion, bytes } = buildStoredPayload(payload);
      return { key: payloadRecordKey(record.key, payload.id), schemaVersion, byteLength: bytes.byteLength, digest: digest(new Uint8Array(bytes)) };
    })),
  });
}

/** The groups a scenario's job sends for `files`, converted in Node by the same job. */
async function convertedGroups(worker: string, files: readonly File[]): Promise<HeldGroup[]> {
  const groups: HeldGroup[] = [];
  await IMPORT_SCENARIOS[worker]()(files.map(file => ({ name: file.name, blob: file })), {
    progress: () => undefined,
    identified: () => undefined,
    group: (group, input) => { groups.push(Object.freeze({ group, ...input })); },
  });
  return groups;
}

/** Opens the import page, chooses `files` and starts a job, then waits for its result. */
async function runJob(page: Page, audit: Audit, files: readonly FilePayload[]): Promise<void> {
  await button(page, 'Import original game data').click();
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
  await page.locator('#import-files').setInputFiles([...files]);
  await button(page, 'Start import').click();
  await audit.ready();
  await expect(page.getByTestId('import-result')).toBeVisible({ timeout: 60_000 });
}

/** Leaves the import page for the menu, which lists the cache again. */
async function toMenu(page: Page): Promise<void> {
  await button(page, 'Return to menu').click();
  await expect(button(page, 'Import original game data')).toBeFocused();
}

/**
 * Opens the viewer on the held package and reads its identity line, or the partial package's note; with `pixels`, also
 * shows the `models` package's first image and compares it byte for byte with the same package converted in Node.
 */
async function viewHeld(page: Page, pixels: boolean): Promise<string> {
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expect(page.getByTestId('viewer-render-status')).not.toHaveText('Preparing the viewer…');
  await expect(page.getByTestId('viewer-audio-status')).not.toHaveText('Preparing audio…');
  const identity = await page.getByTestId('viewer-identity').or(page.getByTestId('viewer-partial')).innerText();
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

/** Restores the package seeded in the cache from the menu, after listing it again by a visit to the import page. */
async function restoreSeeded(page: Page): Promise<void> {
  await button(page, 'Import original game data').click();
  await toMenu(page);
  await button(page, 'Open saved resources').click();
  await expect(statuses(page, 'resource-statuses').nth(1)).toHaveText(SAVED_BY_RESTORE);
}

/** Holds the case's package before its row: imported, or seeded and restored. */
async function hold(page: Page, audit: Audit, precondition: Precondition, profile: ExpectedPackageProfile): Promise<Held> {
  const key = keyOf(profile);
  let expected: ExpectedPackage;
  let records: Records | null = null;
  if (precondition === 'imported') {
    await runJob(page, audit, await sliceFiles());
    await expect(statuses(page, 'import-statuses')).toHaveText(COMPLETE_IMPORT);
    await toMenu(page);
    const groups = await modelsPackage();
    expected = expectedPackage(key, groups);
    records = expectedRecords(groups);
  } else if (precondition === 'seeded-models') {
    expect(profile.sourceFingerprint).toBe(PRODUCTION_PACKAGE.sourceFingerprint);
    const { groups } = await seedProductionCache(page);
    expected = expectedPackage(key, groups);
    records = expectedRecords(groups);
    await restoreSeeded(page);
  } else {
    expect(await seedPackage(page)).toBe('committed');
    const { packages } = await readCacheKeys(page);
    expect(packages.map(({ recordKey }) => recordKey)).toEqual([key]);
    expected = { key, groups: packages[0].groups as ExpectedPackage['groups'] };
    await restoreSeeded(page);
  }
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: Resources are held in this page.');
  const stored = await storedRecords(page);
  if (records) expect(stored).toEqual(records);
  const menu = await statuses(page, 'resource-statuses').allInnerTexts();
  const identity = await viewHeld(page, precondition !== 'seeded-synthetic');
  expect(identity).toMatch(/^Package identity: manifest manifest:\S+, converter \S+$/);
  return { expected, stored, menu, identity };
}

/** I-1 for a failed row: the fixed category, sentence and details, and no package, partial note or mission result. */
async function expectFailedPage(page: Page, error: ExpectedError): Promise<void> {
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'failed');
  const notice = page.getByTestId('import-failure');
  const [category, message] = COPY[`${error.layer}/${error.code}`];
  await expect(notice).toHaveAttribute('data-category', category);
  await expect(notice.locator('p').first()).toHaveText(message);
  expect(await fixedDetails(page, 'import-failure')).toEqual(errorDetails(error));
  for (const testId of ['import-statuses', 'import-groups', 'import-partial', 'mission-failure', 'save-failure']) await expect(page.getByTestId(testId)).toHaveCount(0);
}

/** I-1 for a finished row: the statuses and group states, the partial note, and a mission failure as Core's diagnosis. */
async function expectFinishedPage(page: Page, expected: ExpectedFinish): Promise<void> {
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'finished');
  await expect(page.getByTestId('import-failure')).toHaveCount(0);
  await expect(statuses(page, 'import-statuses')).toHaveText(['Source identified', ...finishedMenu(expected)]);
  expect(await statuses(page, 'import-groups').evaluateAll(items => items.map(item => `${item.dataset.group}: ${item.dataset.status}`))).toEqual(groupStates(expected));
  const partial = expected.package.status === 'incomplete';
  await expect(page.getByTestId('import-partial')).toHaveCount(partial ? 1 : 0);
  // Only a complete package is saved; a partial one is held for diagnosis only, with nothing to save again.
  await expect(button(page, 'Save again')).toHaveCount(0);
  await expect(page.getByTestId('save-failure')).toHaveCount(0);
  const { mission } = expected;
  await expect(page.getByTestId('mission-failure')).toHaveCount(mission.status === 'failed' ? 1 : 0);
  if (mission.status === 'failed') {
    await expect(page.getByTestId('mission-failure')).toHaveAttribute('data-category', `mission/${mission.kind}`);
    expect(await fixedDetails(page, 'mission-failure')).toEqual({ Layer: 'mission', Code: mission.kind, Location: mission.path });
  }
}

/**
 * I-6 on the page as shown, collapsed technical details included: no file name, exception text or marked content. The
 * file chooser's own display of the chosen names is not in the markup.
 */
async function expectPagePrivate(page: Page): Promise<void> {
  expect(await page.evaluate(marker => ({ text: document.body.innerText.includes(marker), markup: document.documentElement.outerHTML.includes(marker) }), MARKER))
    .toEqual({ text: false, markup: false });
}

/** Records the row's precondition and expected end state with the test. */
function annotate(testInfo: TestInfo, failure: FailureCase, precondition: Precondition): void {
  const outcome = failure.expected.status === 'failed'
    ? `${failure.expected.error.layer}/${failure.expected.error.code} at ${failure.expected.error.location}`
    : `finished, ${failure.expected.package.status} package, mission ${failure.expected.mission.status}`;
  testInfo.annotations.push({
    type: 'failure-row',
    description: `${failure.row} (${failure.worker}): held before: the ${precondition} package, saved; ${outcome}; afterwards the holder is ${failure.holder}`,
  });
}

for (const failure of FAILURE_MATRIX) {
  test(`${failure.id}: ${failure.holder}`, async ({ page, audit }, testInfo) => {
    audit.canaries({ name: 'file-name', value: MARKER });
    const consoled = consoleText(page);
    await page.addInitScript(installAudioProbe);
    await openTestEntry(page, { worker: failure.worker });
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
    const profile = await page.evaluate(() => window.osrTestEntry!.profile);
    const key = keyOf(profile);
    await loadCacheModules(page);

    // Before: a held, saved package and the menu baseline with exactly its stored records.
    const precondition = preconditionOf(failure);
    const held = await hold(page, audit, precondition, profile);
    annotate(testInfo, failure, precondition);
    const balance = await ResourceBalance.start(page, testInfo, { packages: [held.expected] });
    await balance.check('held before the row');

    // The row: one new Worker with one job, terminated once before the page is left (I-3, I-4).
    const files = await failure.files();
    await button(page, 'Import original game data').click();
    await page.locator('#import-files').setInputFiles(await filePayloads(files));
    const { workers: before, registrations: idle } = await observe(page);
    await button(page, 'Start import').click();
    await audit.ready();
    await expect(page.getByTestId('import-result')).toBeVisible({ timeout: 60_000 });
    const { expected } = failure;
    if (expected.status === 'failed') await expectFailedPage(page, expected.error);
    else await expectFinishedPage(page, expected);
    await expectPagePrivate(page);
    let ended = await observe(page);
    await expect.poll(async () => {
      ended = await observe(page);
      return ended.workers.slice(before.length).map(({ jobs, terminations }) => [jobs.length, terminations]);
    }).toEqual([[1, 1]]);
    expect(ended.registrations).toEqual(idle);
    const [worker] = ended.workers.slice(before.length);
    const types = worker.messages.map(({ type }) => type);
    expect(types[0]).toBe('ready');
    // A result the job reports itself is its one last message, for its job. A bad payload, reference, budget or content
    // is found only after the disc was identified; disc failures and an unsupported version end before. Import-layer
    // results are the owner's verdict on what the Worker sent.
    if (expected.status === 'finished' || expected.error.layer !== 'import') {
      expect(types.filter(type => type === 'finished' || type === 'failed'), types.join(',')).toEqual([expected.status]);
      expect(types.at(-1)).toBe(expected.status);
      expect(worker.messages.slice(1).every(({ jobId }) => jobId === worker.jobs[0])).toBe(true);
      const identified = expected.status === 'finished' || (expected.error.layer !== 'disc' && expected.error.code !== 'unsupported-version');
      expect(types.filter(type => type === 'identified'), types.join(',')).toHaveLength(identified ? 1 : 0);
    }
    await toMenu(page);

    // What the holder keeps (I-2), against the same document's menu baseline (I-3, I-4).
    if (failure.holder === 'unchanged') {
      await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: Resources are held in this page.');
      await expect(statuses(page, 'resource-statuses')).toHaveText([...held.menu]);
    } else {
      if (expected.status !== 'finished') throw new Error(`${failure.id}: a ${failure.holder} row must finish`);
      await expect(statuses(page, 'resource-statuses')).toHaveText(finishedMenu(expected));
      await expect(button(page, 'Save again')).toHaveCount(0);
    }
    // Exactly the records found before the row, or those of the package the row's job converts on the same files.
    if (failure.holder === 'complete-saved') {
      const converted = await convertedGroups(failure.worker, files);
      balance.expectPackages([expectedPackage(key, converted)]);
      expect(await storedRecords(page)).toEqual(expectedRecords(converted));
    } else {
      expect(await storedRecords(page)).toEqual(held.stored);
    }
    const after = await balance.check('after the row');

    // The held package stays viewable: the same identity and pixels where it is kept, or the partial package's groups.
    const kept = failure.holder === 'unchanged';
    const shown = await viewHeld(page, kept && precondition !== 'seeded-synthetic');
    if (kept) expect(shown).toBe(held.identity);
    else if (failure.holder === 'partial-unsaved' && expected.status === 'finished') expect(shown).toContain(groupStates(expected).join('; '));
    const viewed = await balance.check('viewed after the row');

    // I-5: a new job starts and runs; on the slice disc it replaces the package, otherwise the content fails again.
    const snapshots: unknown[] = [after.snapshot, viewed.snapshot];
    if (kept && precondition !== 'seeded-synthetic') {
      await runJob(page, audit, await sliceFiles());
      if (precondition === 'imported') {
        await expect(statuses(page, 'import-statuses')).toHaveText(COMPLETE_IMPORT);
      } else if (expected.status === 'failed') {
        await expectFailedPage(page, expected.error);
      }
      await expectPagePrivate(page);
      await toMenu(page);
      if (precondition === 'seeded-models') await expect(statuses(page, 'resource-statuses')).toHaveText([...held.menu]);
      // The slice disc's package again, or the same package kept.
      expect(await storedRecords(page)).toEqual(held.stored);
      const again = await balance.check('a new job after the row');
      snapshots.push(again.snapshot);
      expect(again.snapshot.probe.workers.slice(before.length).map(({ jobs, terminations }) => [jobs.length, terminations])).toEqual([[1, 1], [1, 1]]);
    }

    await expectPagePrivate(page);
    expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
    expect(JSON.stringify(snapshots)).not.toContain(MARKER);
    await balance.attach();
  });
}
