import { button } from './support/app-entry.ts';
import { test, expect } from './support/browser-test.ts';
import { missionEntry } from './support/mission-observations.ts';

// P1-08 rights text, P2-11 AC-22 and P3-04 (docs/plan/p3/04/spec.md, 合成演示退役: 文字): the rights and privacy
// statements, which no longer mention the retired synthetic demo, the menu order and the import page's file input.
test('rights and privacy text is readable, and only the import page offers a file input', async ({ page }) => {
  await page.goto('/');
  const rights = page.getByTestId('project-rights');
  await expect(rights).toBeVisible();
  await expect(rights).toContainText('MIT applies only');
  await expect(rights).toContainText('not original game content');
  await expect(rights).toContainText('This is an independent project, not original gameplay or an officially authorized product.');
  await expect(rights).toContainText('no rights to original content are granted');
  await expect(rights).not.toContainText(/demo/i);
  const privacy = page.getByTestId('project-privacy');
  await expect(privacy).toContainText('read, converted and saved only in this browser');
  await expect(privacy).toContainText('never uploaded');
  await expect(page.locator('canvas, input[type="file"]')).toHaveCount(0);
  // The mission entry comes first; without a package it is disabled and says why, so Tab reaches the import entry.
  await expect(page.locator('.menu-entries button')).toHaveText(['Start mission', 'Import original game data']);
  await expect(missionEntry(page)).toBeDisabled();
  await expect(page.getByTestId('mission-entry-reason')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(button(page, 'Import original game data')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
  await expect(rights).toBeVisible();
  await expect(privacy).toBeVisible();
  await expect(page.getByTestId('import-privacy')).toContainText('never uploaded');
  const input = page.locator('input[type="file"]');
  await expect(input).toHaveCount(1);
  await expect(input).toHaveAttribute('accept', '.ccd,.img,.sub,.cue');
  await expect(input).toHaveAttribute('multiple', '');
  await expect(page.locator('canvas')).toHaveCount(0);
  await button(page, 'Return to menu').click();
  await expect(button(page, 'Import original game data')).toBeFocused();
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
});
