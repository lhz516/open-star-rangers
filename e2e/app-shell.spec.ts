import { button, expectNoPlayClaim } from './support/app-entry.ts';
import { test, expect } from './support/browser-test.ts';
import { missionEntry } from './support/mission-observations.ts';

// P2-11 AC-01, migrated by P3-04 (docs/plan/p3/04/spec.md, 合成演示退役 and 开始资格): the app shell's flow on the real
// entry, in the development and production projects. A fresh context has an empty cache, so the menu settles on no
// original data and the mission entry stays disabled with its reason; keyboard focus passes over it, and import returns
// focus to its own entry. The eligible entry's flow and focus are in mission-flow.*.spec.ts and interaction-render.spec.ts.

const NONE = 'Original game data: None in this browser.';
const NO_PACKAGE = 'Not available now. No resource package is held. Import your original game data or open saved resources first.';

test('the menu shows the empty browser storage and why the mission cannot start, and import returns focus to its entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText(NONE);
  await expect(button(page, 'View resources')).toHaveCount(0);
  await expect(button(page, 'Open saved resources')).toHaveCount(0);
  const entry = missionEntry(page);
  await expect(entry).toBeDisabled();
  await expect(entry).toHaveAttribute('data-eligibility', 'no-package');
  await expect(page.getByTestId('mission-entry-reason')).toHaveText(NO_PACKAGE);
  await expect(entry).toHaveAccessibleDescription(/^Opens the project start page .* not yet a playable slice.* Not available now\. No resource package is held\./);
  await expectNoPlayClaim(page);
  // A pointer on the disabled entry opens nothing.
  await entry.click({ force: true });
  await expect(page.getByRole('heading', { name: 'Main menu', exact: true })).toBeVisible();
  await expect(page.getByTestId('mission-screen')).toHaveCount(0);

  const importEntry = button(page, 'Import original game data');
  const back = button(page, 'Return to menu');
  for (const via of ['keyboard', 'pointer'] as const) {
    if (via === 'keyboard') {
      // The first Tab stop of the page is the import entry: the disabled mission entry takes no focus.
      await page.keyboard.press('Tab');
      await expect(importEntry).toBeFocused();
      await page.keyboard.press('Enter');
    } else {
      await importEntry.click();
    }
    await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
    await expectNoPlayClaim(page);
    await back.click();
    await expect(importEntry).toBeFocused();
    await expect(page.getByTestId('original-data-status')).toHaveText(NONE);
    await expect(entry).toHaveAttribute('data-eligibility', 'no-package');
    await expectNoPlayClaim(page);
  }
});
