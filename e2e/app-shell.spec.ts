import { expectNoPlayClaim } from './support/app-entry.ts';
import { test, expect } from './support/browser-test.ts';

// P2-11 AC-01: the app shell's flow on the real entry, in the development and production projects. A fresh context
// has an empty cache, so the menu settles on no original data.


test('the menu shows the empty browser storage, and import and the demo return focus to their entries', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await expect(page.getByRole('button', { name: 'View resources', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open saved resources', exact: true })).toHaveCount(0);
  await expectNoPlayClaim(page);

  const demoEntry = page.getByRole('button', { name: 'Start synthetic demo', exact: true });
  const importEntry = page.getByRole('button', { name: 'Import original game data', exact: true });
  const back = page.getByRole('button', { name: 'Return to menu', exact: true });
  for (let round = 0; round < 2; round++) {
    await demoEntry.click();
    await expect(page.getByRole('heading', { name: 'Synthetic demo', exact: true })).toBeFocused();
    await expect(page.getByTestId('phase')).toHaveText('running');
    await expectNoPlayClaim(page);
    await back.click();
    await expect(demoEntry).toBeFocused();
    await importEntry.click();
    await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
    await expectNoPlayClaim(page);
    await back.click();
    await expect(importEntry).toBeFocused();
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  }
});
