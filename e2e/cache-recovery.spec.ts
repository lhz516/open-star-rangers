import type { Page } from '@playwright/test';
import { readConverterVersion } from '../src/content/content-identity.ts';
import { MARKER } from '../src/original-data/disc/disc.test-support.ts';
import type { ResourceCacheKey } from '../src/platform/storage/resource-cache-contract.ts';
import { RESOURCE_CACHE_DATABASE } from '../src/platform/storage/resource-cache-records.ts';
import { button, importFiles, openTestEntry, sliceFiles } from './support/app-entry.ts';
import { test as audited } from './support/audited-test.ts';
import { expect, test } from './support/browser-test.ts';
import { devOrigin } from './support/environment.ts';
import { expectedPackage, ResourceBalance, settleTooling, type ExpectedPackage } from './support/resource-balance.ts';
import { damageStoredPackage, deleteCacheDatabase, loadCacheModules, readStoredRecords, seedPackage, type StoredRecords } from './support/resource-cache.ts';
import { modelsPackage } from './support/viewer-observations.ts';

// P2-11 subtask 12 (AC-08, browser): the cache round trip of the production App on the development test entry, in the
// test's own isolated context: reload and restore, a rewritten payload, and a database deleted while the page is open.
// Filtering entries by converter version and fingerprint is covered by app-shell-resources.spec.ts. P3-03/20 (AC-15)
// adds the package of the previous converter version, which is offered by no menu and kept beside a new import.

test.describe.configure({ timeout: 120_000 });

const STATUS = 'original-data-status';

/** Imports the synthetic `models` scenario, waits until the commit saved it and returns to the menu. */
async function importAndSave(page: Page): Promise<void> {
  await importFiles(page, await sliceFiles(), {}, 'Saved in this browser');
  await button(page, 'Return to menu').click();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Resources are held in this page.');
}

/** The held package's identity and mission summary, as the viewer shows them. */
async function viewedPackage(page: Page): Promise<{ readonly identity: string; readonly mission: string }> {
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  const identity = (await page.getByTestId('viewer-identity').textContent()) ?? '';
  const mission = (await page.getByTestId('viewer-mission-summary').textContent()) ?? '';
  await button(page, 'Return to menu').click();
  return { identity, mission };
}

test('restores the saved package after a reload, verified, with the same identity and a loaded mission', async ({ page }) => {
  await importAndSave(page);
  const before = await viewedPackage(page);
  expect(before.identity).toMatch(/^Package identity: manifest \S+, converter \S+$/);
  expect(before.mission).not.toBe('');

  await page.reload();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
  await expect(button(page, 'View resources')).toHaveCount(0);
  await button(page, 'Open saved resources').click();
  await expect(button(page, 'View resources')).toBeFocused();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText([
    'Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core',
  ]);
  expect(await viewedPackage(page)).toEqual(before);
});

test('refuses a saved package with a rewritten payload as damaged, holding nothing', async ({ page }) => {
  await importAndSave(page);
  // Flip the first byte of one stored payload, keeping its length, in this test's own context; resolve once committed.
  const rewritten = await page.evaluate(async ({ name, payloadStore }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction(payloadStore, 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      const change = await new Promise<{ key: IDBValidKey; before: number[]; length: number }>((resolve, reject) => {
        const request = transaction.objectStore(payloadStore).openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return reject(new Error('No stored payload'));
          const value = cursor.value as { bytes: ArrayBuffer };
          const bytes = new Uint8Array(value.bytes.slice(0));
          const before = [...bytes.subarray(0, 4)];
          bytes[0] ^= 1;
          cursor.update({ ...value, bytes: bytes.buffer }).onerror = () => reject(transaction.error);
          resolve({ key: cursor.primaryKey, before, length: bytes.length });
        };
      });
      await done;
      // Read back: same length, first byte changed.
      const stored = await new Promise<{ bytes: ArrayBuffer }>((resolve, reject) => {
        const request = db.transaction(payloadStore).objectStore(payloadStore).get(change.key);
        request.onsuccess = () => resolve(request.result as { bytes: ArrayBuffer });
        request.onerror = () => reject(request.error);
      });
      const after = [...new Uint8Array(stored.bytes).subarray(0, 4)];
      return { length: change.length, storedLength: stored.bytes.byteLength, changed: after[0] === (change.before[0] ^ 1), rest: after.slice(1).join() === change.before.slice(1).join() };
    } finally {
      db.close();
    }
  }, RESOURCE_CACHE_DATABASE);
  expect(rewritten).toEqual({ length: rewritten.length, storedLength: rewritten.length, changed: true, rest: true });
  expect(rewritten.length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
  await button(page, 'Open saved resources').click();
  const failure = page.getByTestId('restore-failure');
  await expect(failure).toHaveAttribute('data-category', /^cache\//);
  await expect(failure).toContainText('The saved resources are damaged and cannot be used. Importing again replaces them.');
  await failure.getByText('Technical details').click();
  await expect(failure).toContainText('cache-corrupt');
  await expect(button(page, 'View resources')).toHaveCount(0);
  await expect(page.getByTestId('resource-statuses')).toHaveCount(0);
  await expect(page.getByTestId(STATUS)).not.toContainText('held in this page');
});

test('keeps the package in memory when the database is deleted, saves it again, and finds nothing after a reload once deleted', async ({ page }) => {
  await importAndSave(page);
  // Deleted while the viewer is open, where nothing lists the cache, so no listing races the deletion.
  await button(page, 'View resources').click();
  const before = (await page.getByTestId('viewer-identity').textContent()) ?? '';
  await deleteCacheDatabase(page, devOrigin);
  await button(page, 'Return to menu').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(['Complete resources, viewable', /^Held in memory only/, 'Mission loads into Core']);
  await expect(page.getByTestId('save-failure')).toHaveAttribute('data-category', 'cache/not-found');
  // The resources stay viewable.
  expect((await viewedPackage(page)).identity).toBe(before);

  await button(page, 'Save again').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(['Complete resources, viewable', /^Saved in this browser/, 'Mission loads into Core']);
  await loadCacheModules(page);
  expect((await readStoredRecords(page)).packages).toHaveLength(1);

  await deleteCacheDatabase(page, devOrigin);
  await page.reload();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: None in this browser.');
  await expect(button(page, 'Open saved resources')).toHaveCount(0);
});

/** The converter version of the P3-02 slice package, whose records name slice definition version 3. */
const PREVIOUS_CONVERTER = 'osr-import.graphics-3.logic-1.audio-1.models-3';

/** The records of one package key: its package record and its payload records. */
const recordsOf = (records: StoredRecords, key: ResourceCacheKey): StoredRecords => {
  const ofKey = ({ key: stored }: { key: unknown[] }) => stored[0] === key.originType && stored[1] === key.originToken && stored[2] === key.converterVersion;
  return { packages: records.packages.filter(ofKey), payloads: records.payloads.filter(ofKey) };
};

/** The package stored under `key` as the balance expects it, read from its record. */
function storedPackage(records: StoredRecords, key: ResourceCacheKey): ExpectedPackage {
  const [found] = recordsOf(records, key).packages;
  const record = JSON.parse(found.value) as { groups: { manifest: { group: string; assets: { id: string }[] } }[] };
  return { key, groups: record.groups.map(({ manifest }) => ({ group: manifest.group, assets: manifest.assets.map(({ id }) => id) })) };
}

audited('offers no restore of the previous converter version\'s package, which reads as incompatible and stays unchanged beside a new import (P3-03 AC-15)', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  await openTestEntry(page);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: None in this browser.');
  const { sourceFingerprint, converterVersion } = await page.evaluate(() => window.osrTestEntry!.profile);
  const current: ResourceCacheKey = { originType: 'original-import', originToken: sourceFingerprint, converterVersion };
  const previous: ResourceCacheKey = { ...current, converterVersion: readConverterVersion(PREVIOUS_CONVERTER) };
  expect(previous.converterVersion).not.toBe(current.converterVersion);

  // A synthetic package of the same disc as the previous release saved it: its converter version and definition 3.
  await loadCacheModules(page);
  expect(await seedPackage(page, { converterVersion: PREVIOUS_CONVERTER })).toBe('committed');
  await damageStoredPackage(page, previous, 'cache-incompatible', 3);
  const before = await readStoredRecords(page);
  const read = await page.evaluate(async key => {
    const cache = window.osrCache.cache.createResourceCache();
    try {
      const restored = await cache.restore(key, window.osrCache.limits());
      const listed = await cache.list();
      return {
        restored: window.osrCache.statusOf(restored),
        listed: listed.status === 'listed' ? listed.entries.map(({ key: entry, status }) => [entry?.converterVersion, status]) : listed.code,
      };
    } finally {
      cache.close();
    }
  }, previous);
  expect(read).toEqual({ restored: 'cache-incompatible', listed: [[PREVIOUS_CONVERTER, 'incompatible']] });
  expect(await readStoredRecords(page), 'reading changes nothing').toEqual(before);

  // The menu lists the cache again and offers nothing to restore.
  await button(page, 'Import original game data').click();
  await button(page, 'Return to menu').click();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: None in this browser.');
  await expect(button(page, 'Open saved resources')).toHaveCount(0);
  const kept = storedPackage(before, previous);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false, packages: [kept] });

  // A new import is saved under its own key; the previous package's records stay as they were, neither migrated nor deleted.
  await button(page, 'Import original game data').click();
  await page.locator('#import-files').setInputFiles(await sliceFiles());
  await button(page, 'Start import').click();
  await audit.ready();
  await expect(page.getByTestId('import-statuses').locator('li')).toHaveText([
    'Source identified', 'Complete resources, viewable', /^Saved in this browser \(saved in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core',
  ], { timeout: 60_000 });
  await button(page, 'Return to menu').click();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Resources are held in this page.');
  const after = await readStoredRecords(page);
  expect(recordsOf(after, previous)).toEqual(recordsOf(before, previous));
  balance.expectPackages([kept, expectedPackage(current, await modelsPackage())]);
  await balance.check('imported beside the previous version');

  // After a reload only the new package is offered, and it restores verified; the previous one is still unchanged.
  await balance.beforeReload();
  await page.reload();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
  await settleTooling(page);
  await balance.rebaseline();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText([
    'Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core',
  ]);
  await expect(page.getByTestId('viewer-identity')).toHaveCount(0);
  await loadCacheModules(page);
  expect(await readStoredRecords(page)).toEqual(after);
  await balance.check('the new package restored');
  await balance.attach();
});
