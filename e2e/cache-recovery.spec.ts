import type { Page } from '@playwright/test';
import { RESOURCE_CACHE_DATABASE } from '../src/platform/storage/resource-cache-records.ts';
import { button, importFiles, sliceFiles } from './support/app-entry.ts';
import { expect, test } from './support/browser-test.ts';
import { devOrigin } from './support/environment.ts';
import { deleteCacheDatabase, loadCacheModules, readStoredRecords } from './support/resource-cache.ts';

// P2-11 subtask 12 (AC-08, browser): the cache round trip of the production App on the development test entry, in the
// test's own isolated context: reload and restore, a rewritten payload, and a database deleted while the page is open.
// Filtering entries by converter version and fingerprint is covered by app-shell-resources.spec.ts.

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
