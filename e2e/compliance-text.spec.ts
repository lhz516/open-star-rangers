import { test, expect } from './support/browser-test.ts';

// P1-08 rights text and P2-11 AC-22: the rights and privacy statements, the menu order and the import page's file input.
test('rights and privacy text is readable, and only the import page offers a file input', async ({ page }) => {
  await page.goto('/');
  const rights = page.getByTestId('project-rights');
  await expect(rights).toBeVisible();
  await expect(rights).toContainText('MIT applies only');
  await expect(rights).toContainText('not original game content');
  await expect(rights).toContainText('not original gameplay or an officially authorized product');
  await expect(rights).toContainText('no rights to original content are granted');
  const privacy = page.getByTestId('project-privacy');
  await expect(privacy).toContainText('read, converted and saved only in this browser');
  await expect(privacy).toContainText('never uploaded');
  await expect(page.locator('canvas, input[type="file"]')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Start synthetic demo', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Import original game data', exact: true })).toBeFocused();
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
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Import original game data', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Start synthetic demo', exact: true })).toBeEnabled();
});
