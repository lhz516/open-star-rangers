import type { Page } from '@playwright/test';
import { discFiles, expectNoPlayClaim, openTestEntry, sliceFiles, smallFile as small, type FilePayload as Payload, type TestEntryOptions } from './support/app-entry.ts';
import { consoleText, test, expect } from './support/browser-test.ts';
import { loadCacheModules, readStoredRecords } from './support/resource-cache.ts';
import { MARKER } from '../src/original-data/disc/disc.test-support.ts';
import { generatedContent, sliceCoveredFiles } from '../src/workers/synthetic-import.test-support.ts';

// P2-11 AC-02 to AC-04 and AC-07 (browser): the import page of the production App on the development test entry, with
// synthetic CloneCD files generated here. Every generated file name contains MARKER, which must reach neither the page
// nor the console.


async function openImport(page: Page, options: TestEntryOptions = {}): Promise<void> {
  await openTestEntry(page, options);
  await expect(page.getByTestId('original-data-status')).not.toContainText('Checking');
  await page.getByRole('button', { name: 'Import original game data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
}

async function startImport(page: Page, files: readonly Payload[]): Promise<void> {
  await page.locator('#import-files').setInputFiles([...files]);
  await page.getByRole('button', { name: 'Start import', exact: true }).click();
}

const workers = (page: Page) => page.evaluate(() => window.osrProbe.snapshot().workers.map(({ entry, name, terminations }) => ({ entry, name, terminations })));

/** The registrations the app holds: active listeners outside Vite's client and the test tooling, and observers that observe something. */
const registrations = (page: Page) => page.evaluate(() => {
  const snapshot = window.osrProbe.snapshot();
  return {
    listeners: snapshot.listeners.filter(entry => entry.active && entry.group !== 'vite' && entry.group !== 'test')
      .map(entry => `${entry.group}:${entry.type}`).sort(),
    observers: snapshot.observers.filter(observer => observer.targets.length > 0).length,
  };
});

const start = (page: Page) => page.getByRole('button', { name: 'Start import', exact: true });
const back = (page: Page) => page.getByRole('button', { name: 'Return to menu', exact: true });

test('refuses file sets outside the start rules without a Worker, and runs one Worker per accepted job with growing progress', async ({ page }) => {
  await openImport(page);
  const refusals: Payload[][] = [
    [],
    ['a.ccd', 'a.img', 'a.sub', 'a.cue', 'b.ccd'].map(small),
    [small(`${'n'.repeat(252)}.ccd`)],
  ];
  for (const files of refusals) {
    await startImport(page, files);
    await expect(page.getByTestId('start-failure')).toHaveAttribute('data-category', 'start/file-rules');
    await expect(page.getByTestId('start-failure')).toContainText('at most 4 files');
  }
  expect(await workers(page)).toEqual([]);

  // Record the progress and the start button as the page renders them.
  await page.evaluate(() => {
    const log: { read: number; text: string; startDisabled: boolean }[] = [];
    (window as unknown as { osrProgress: typeof log }).osrProgress = log;
    new MutationObserver(() => {
      const progress = document.querySelector('[data-testid="import-progress"]');
      const button = [...document.querySelectorAll('button')].find(node => node.textContent === 'Start import');
      if (progress) log.push({ read: Number(progress.getAttribute('data-read-bytes')), text: progress.textContent ?? '', startDisabled: button?.disabled ?? false });
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await startImport(page, await sliceFiles());
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'finished');
  await expect(page.getByTestId('start-failure')).toHaveCount(0);
  expect(await workers(page)).toEqual([{ entry: '/src/workers/import-worker.test-support.ts', name: 'models', terminations: 1 }]);
  const progress = await page.evaluate(() => (window as unknown as { osrProgress: { read: number; text: string; startDisabled: boolean }[] }).osrProgress);
  expect(progress.length).toBeGreaterThan(1);
  expect(progress.every(({ startDisabled }) => startDisabled)).toBe(true);
  // The visible progress names a stage and the bytes read, never a percentage.
  const texts = new Set(progress.map(({ text }) => text.split(' · ')[0]));
  expect([...texts].filter(text => text !== 'Starting')).toEqual(expect.arrayContaining(['Identifying the disc', 'Converting models and effects']));
  expect(progress.every(({ text }) => /· read \d+\.\d MiB/.test(text) && !text.includes('%'))).toBe(true);
  expect(progress.some(({ text }) => text.includes('· identified synthetic-models'))).toBe(true);
  const reads = progress.map(({ read }) => read);
  expect(reads).toEqual([...reads].sort((left, right) => left - right));
  expect(reads.at(-1)).toBeGreaterThan(0);
  await expect(start(page)).toBeEnabled();
});

test('a complete import is committed to IndexedDB and its mission loads into Core', async ({ page }) => {
  const consoled = consoleText(page);
  await openImport(page);
  await startImport(page, await sliceFiles());
  await expect(page.getByTestId('import-result')).toContainText(/Import finished in \d+(?: ms|\.\d\d s): identified synthetic-models/);
  const statuses = page.getByTestId('import-statuses').locator('li');
  await expect(statuses).toHaveText([
    'Source identified', 'Complete resources, viewable', /^Saved in this browser \(saved in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core',
  ]);
  await expect(page.getByTestId('import-groups').locator('li')).toHaveText([/^logic: complete/, /^models: complete/, /^cockpit-hud-map: complete/, /^audio: complete/]);
  await loadCacheModules(page);
  const profile = await page.evaluate(() => window.osrTestEntry!.profile);
  const records = await readStoredRecords(page);
  expect(records.packages.map(({ key }) => key)).toEqual([['original-import', profile.sourceFingerprint, profile.converterVersion]]);
  await expectNoPlayClaim(page);
  expect(await page.locator('body').innerText()).not.toContain(MARKER);
  expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
  await back(page).click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText([
    'Complete resources, viewable', /^Saved in this browser/, 'Mission loads into Core',
  ]);
});

test('a failed commit keeps the package in memory with its code until saving again succeeds', async ({ page }) => {
  await openImport(page, { cache: 'quota-exceeded' });
  await startImport(page, await sliceFiles());
  await expect(page.getByTestId('save-failure')).toHaveAttribute('data-category', 'cache/quota-exceeded');
  await expect(page.getByTestId('save-failure')).toContainText('Free some space');
  await expect(page.getByTestId('import-statuses').locator('li')).toHaveText(['Source identified', 'Complete resources, viewable', 'Held in memory only', 'Mission loads into Core']);
  await page.getByRole('button', { name: 'Save again', exact: true }).click();
  await expect(page.getByTestId('import-statuses').locator('li')).toHaveText(['Source identified', 'Complete resources, viewable', /^Saved in this browser/, 'Mission loads into Core']);
  await expect(page.getByTestId('save-failure')).toHaveCount(0);
  await loadCacheModules(page);
  expect((await readStoredRecords(page)).packages).toHaveLength(1);
});

test('a later failed job never shows the package an earlier job produced as its result', async ({ page }) => {
  await openImport(page);
  await startImport(page, await sliceFiles());
  await expect(page.getByTestId('import-statuses').locator('li')).toHaveText([
    'Source identified', 'Complete resources, viewable', /^Saved in this browser/, 'Mission loads into Core',
  ]);
  await startImport(page, await discFiles({ 'MAIN/OTHER.DAT': generatedContent(4096, 7) }));
  await expect(page.getByTestId('import-failure')).toHaveAttribute('data-category', 'source/version');
  await expect(page.getByTestId('import-statuses')).toHaveCount(0);
  await expect(page.getByTestId('import-groups')).toHaveCount(0);
  await back(page).click();
  // The earlier package is still held, and the menu shows it.
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(['Complete resources, viewable', /^Saved in this browser/, 'Mission loads into Core']);
});

test('an insufficient space estimate is shown first, and the player may import anyway or not', async ({ page }) => {
  await openImport(page, { capacity: 'insufficient' });
  const files = await sliceFiles();
  await startImport(page, files);
  const warning = page.getByTestId('space-warning');
  await expect(warning).toContainText('11.4 MiB may be needed and 0.0 MiB is available');
  // While the warning awaits a choice, no other start or file selection can slip in.
  await expect(start(page)).toBeDisabled();
  await expect(page.locator('#import-files')).toBeDisabled();
  await page.getByRole('button', { name: 'Do not import', exact: true }).click();
  await expect(warning).toHaveCount(0);
  expect(await workers(page)).toEqual([]);
  await start(page).click();
  await page.getByRole('button', { name: 'Import anyway', exact: true }).click();
  await expect(page.getByTestId('import-result')).toHaveAttribute('data-result', 'finished');
  expect(await workers(page)).toHaveLength(1);
});

test('cancelling, leaving and re-entering a running job three times leaves no Worker or registration behind', async ({ page }) => {
  await openTestEntry(page, { worker: 'busy' });
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  const baseline = await registrations(page);
  const files = ['disc.ccd', 'disc.img'].map(small);
  const importEntry = page.getByRole('button', { name: 'Import original game data', exact: true });
  const terminations = async () => (await workers(page)).map(({ terminations: count }) => count);
  for (let round = 1; round <= 3; round++) {
    await importEntry.click();
    await expect(start(page)).toBeEnabled();
    const idle = await registrations(page);
    await startImport(page, files);
    await expect(page.getByTestId('import-progress')).toHaveAttribute('data-stage', 'identify-source');
    await expect(page.getByTestId('import-progress')).toContainText('Identifying the disc');
    await expect(start(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
    await expect(page.getByTestId('import-result')).toContainText(/^Import cancelled after \d+(?: ms|\.\d\d s)\. No partial result was kept\.$/);
    // Cancelling terminates the Worker at once, before the page is left.
    await expect.poll(terminations).toEqual(Array(2 * round - 1).fill(1));
    expect(await registrations(page)).toEqual(idle);
    await expect(page.getByTestId('import-statuses')).toHaveCount(0);
    await startImport(page, files);
    await expect(page.getByTestId('import-progress')).toHaveAttribute('data-stage', 'identify-source');
    await back(page).click();
    await expect(importEntry).toBeFocused();
    await expect.poll(async () => (await workers(page)).map(({ terminations }) => terminations)).toEqual(Array(2 * round).fill(1));
    expect(await registrations(page)).toEqual(baseline);
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  }
  expect(await workers(page)).toHaveLength(6);
  await loadCacheModules(page);
  expect(await readStoredRecords(page)).toEqual({ packages: [], payloads: [] });
});

for (const [name, options, files, category, code] of [
  ['a disc whose image name differs', { worker: 'models' }, async () => [small(`${MARKER}-a.ccd`), small(`${MARKER}-b.img`)], 'disc/file-set', 'unsupported-file-set'],
  ['an uncovered disc', { worker: 'models' }, () => discFiles({ 'MAIN/OTHER.DAT': generatedContent(4096, 7) }), 'source/version', 'unsupported-version'],
  ['a corrupt mesh', { worker: 'models-corrupt' }, () => discFiles(sliceCoveredFiles({ corruptMesh: true })), 'source/checks', 'invalid-payload'],
  ['invalid converted content', { worker: 'content-invalid' }, sliceFiles, 'content/default', 'invalid-record'],
  ['a throwing job', { worker: 'job-throws' }, sliceFiles, 'import/internal', 'internal-error'],
  ['a missing Worker entry', { worker: 'missing' }, sliceFiles, 'import/worker-start', 'worker-start-failed'],
] as const) {
  test(`shows ${name} as ${category} with its technical details, keeping no package`, async ({ page }) => {
    const consoled = consoleText(page);
    await openImport(page, options);
    await startImport(page, await files());
    const failure = page.getByTestId('import-failure');
    await expect(failure).toHaveAttribute('data-category', category);
    await expect(failure.locator('dd').first()).toHaveText(category.split('/')[0]);
    await expect(failure.locator('dd').nth(1)).toHaveText(code);
    await expect(failure.locator('dt', { hasText: 'Location' })).toHaveCount(1);
    await expect(page.getByTestId('import-statuses')).toHaveCount(0);
    await expect(page.getByTestId('import-groups')).toHaveCount(0);
    expect((await workers(page)).every(({ terminations }) => terminations === 1)).toBe(true);
    expect(await page.locator('body').innerText()).not.toContain(MARKER);
    expect(await page.content()).not.toContain(MARKER);
    expect(consoled.filter(text => text.includes(MARKER))).toEqual([]);
    await back(page).click();
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  });
}
