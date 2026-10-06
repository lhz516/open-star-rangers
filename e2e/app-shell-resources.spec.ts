import type { Page } from '@playwright/test';
import { expectNoPlayClaim, openTestEntry } from './support/app-entry.ts';
import { test, expect } from './support/browser-test.ts';
import { loadCacheModules } from './support/resource-cache.ts';

// P2-11 AC-01 and AC-08 (menu): the production App on the development test entry, with the default `models` Worker
// scenario's expected profile. The cache is seeded with synthetic packages in the test's own context.

const STATUS = 'original-data-status';

/** Commits a synthetic package whose key takes the expected profile's fingerprint and version unless overridden. */
async function seed(page: Page, overrides: { readonly converterVersion?: string; readonly fingerprint?: string } = {}): Promise<string> {
  return page.evaluate(async ({ converterVersion, fingerprint }) => {
    const profile = window.osrTestEntry!.profile;
    const cache = window.osrCache.cache.createResourceCache();
    const groups = window.osrCache.buildPackage({
      origin: (fingerprint ?? profile.sourceFingerprint) as `source:${string}`, converterVersion: converterVersion ?? profile.converterVersion,
    });
    const result = await cache.commit(groups, profile.limits);
    cache.close();
    return window.osrCache.statusOf(result);
  }, overrides);
}

/** Leaves the menu for the import screen and comes back, which lists the cache again. */
async function revisitMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Import original game data', exact: true }).click();
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
}

test('the menu offers only the saved package the expected profile accepts, restores it and opens the viewer', async ({ page }) => {
  await openTestEntry(page);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: None in this browser.');
  await loadCacheModules(page);
  expect(await seed(page, { converterVersion: 'synthetic-converter.2' })).toBe('committed');
  expect(await seed(page, { fingerprint: `source:sha256:${'cd'.repeat(32)}` })).toBe('committed');
  await revisitMenu(page);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: None in this browser.');
  await expect(page.getByRole('button', { name: 'Open saved resources', exact: true })).toHaveCount(0);

  expect(await seed(page)).toBe('committed');
  await revisitMenu(page);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
  const restore = page.getByRole('button', { name: 'Open saved resources', exact: true });
  await expectNoPlayClaim(page);
  await restore.click();

  const viewerEntry = page.getByRole('button', { name: 'View resources', exact: true });
  await expect(viewerEntry).toBeFocused();
  await expect(restore).toHaveCount(0);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Resources are held in this page.');
  // The synthetic package is complete, but its logic payload is a placeholder that the mission load rejects.
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText([
    'Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission does not load into Core',
  ]);
  expect(await page.getByTestId('resource-statuses').locator('li').evaluateAll(items => items.map(item => item.getAttribute('data-status'))))
    .toEqual(['complete-viewable', 'saved', 'mission-not-loadable']);
  await expectNoPlayClaim(page);

  await viewerEntry.click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expectNoPlayClaim(page);
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  await expect(viewerEntry).toBeFocused();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Resources are held in this page.');
});

test('unavailable browser storage is explained, and import and the demo stay available', async ({ page }) => {
  await openTestEntry(page, { cache: 'unavailable' });
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Browser storage is unavailable.');
  await expect(page.getByTestId('storage-failure')).toHaveAttribute('data-category', 'cache/storage-unavailable');
  await expect(page.getByTestId('storage-failure')).toContainText('kept only in this page');
  await expectNoPlayClaim(page);
  await page.getByRole('button', { name: 'Start synthetic demo', exact: true }).click();
  await expect(page.getByTestId('phase')).toHaveText('running');
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  await page.getByRole('button', { name: 'Import original game data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
});
