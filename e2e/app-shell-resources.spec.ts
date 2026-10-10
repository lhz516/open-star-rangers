import type { Page } from '@playwright/test';
import { scenarioFiles } from '../src/workers/import-scenarios.test-support.ts';
import { button, expectNoPlayClaim, filePayloads, importFiles, openTestEntry } from './support/app-entry.ts';
import { test, expect } from './support/browser-test.ts';
import { endPlaceholder, enterMission, expectAdvancingTick, missionEntry, missionFrame } from './support/mission-observations.ts';
import { loadCacheModules, seedPackage as seed } from './support/resource-cache.ts';

// P2-11 AC-01 and AC-08 (menu), migrated by P3-04 (docs/plan/p3/04/spec.md, 合成演示退役 and 开始资格; AC-08): the
// production App on the development test entry. The first case seeds the cache with synthetic packages in the test's
// own context under the default `models` Worker scenario's expected profile; the second imports the startable mission
// package while browser storage is unavailable.

const STATUS = 'original-data-status';
const HELD = 'Original game data: Resources are held in this page.';

/** Leaves the menu for the import screen and comes back, which lists the cache again. */
async function revisitMenu(page: Page): Promise<void> {
  await button(page, 'Import original game data').click();
  await button(page, 'Return to menu').click();
}

test('the menu offers only the saved package the expected profile accepts, restores it and opens the viewer; its mission keeps the entry disabled', async ({ page }) => {
  await openTestEntry(page);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: None in this browser.');
  await loadCacheModules(page);
  expect(await seed(page, { converterVersion: 'synthetic-converter.2' })).toBe('committed');
  expect(await seed(page, { fingerprint: `source:sha256:${'cd'.repeat(32)}` })).toBe('committed');
  await revisitMenu(page);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: None in this browser.');
  await expect(button(page, 'Open saved resources')).toHaveCount(0);

  expect(await seed(page)).toBe('committed');
  await revisitMenu(page);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
  // Saved resources are not a held package: only their restore and verification can make the mission eligible.
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  const restore = button(page, 'Open saved resources');
  await expectNoPlayClaim(page);
  await restore.click();

  const viewerEntry = button(page, 'View resources');
  await expect(viewerEntry).toBeFocused();
  await expect(restore).toHaveCount(0);
  await expect(page.getByTestId(STATUS)).toHaveText(HELD);
  // The synthetic package is complete, but its logic payload is a placeholder that the mission load rejects.
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText([
    'Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission does not load into Core',
  ]);
  expect(await page.getByTestId('resource-statuses').locator('li').evaluateAll(items => items.map(item => item.getAttribute('data-status'))))
    .toEqual(['complete-viewable', 'saved', 'mission-not-loadable']);
  await expect(missionEntry(page)).toBeDisabled();
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'mission-failed');
  await expect(page.getByTestId('mission-entry-reason')).toContainText(/^Not available now\. The mission does not load: \w[\w ]* error at \S+: /);
  await expectNoPlayClaim(page);

  await viewerEntry.click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expectNoPlayClaim(page);
  await button(page, 'Return to menu').click();
  await expect(viewerEntry).toBeFocused();
  await expect(page.getByTestId(STATUS)).toHaveText(HELD);
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'mission-failed');
});

test('unavailable browser storage is explained; a complete package that could not be saved still starts the mission, and import stays available', async ({ page }) => {
  // Generated in Node while the page loads.
  const files = scenarioFiles('mission-startable').then(disc => filePayloads([...disc]));
  await openTestEntry(page, { cache: 'unavailable' });
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Browser storage is unavailable.');
  await expect(page.getByTestId('storage-failure')).toHaveAttribute('data-category', 'cache/storage-unavailable');
  await expect(page.getByTestId('storage-failure')).toContainText('kept only in this page');
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  await expectNoPlayClaim(page);

  await importFiles(page, await files, { worker: 'mission-startable', cache: 'unavailable' }, 'Mission loads into Core');
  await button(page, 'Return to menu').click();
  await expect(page.getByTestId(STATUS)).toHaveText(HELD);
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(['Complete resources, viewable', 'Held in memory only', 'Mission loads into Core']);
  await expect(missionEntry(page)).toBeEnabled();
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await expect(page.getByTestId('mission-entry-reason')).toHaveCount(0);
  await expectNoPlayClaim(page);

  const { owner } = await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await endPlaceholder(page, 'G-02/2', 'button');
  await expectAdvancingTick(page);
  expect(await missionFrame(page)).toMatchObject({ owner, run: 1, position: 'flight' });
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  await expect(page.getByTestId(STATUS)).toHaveText(HELD);

  await button(page, 'Import original game data').click();
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
});
