import { test, expect } from './support/browser-test.ts';

test('rights text is readable without adding controls or claiming original authorization', async ({ page }) => {
  await page.goto('/');
  const rights = page.getByTestId('project-rights');
  await expect(rights).toBeVisible();
  await expect(rights).toContainText('MIT applies only');
  await expect(rights).toContainText('not original game content');
  await expect(rights).toContainText('not original gameplay or an officially authorized product');
  await expect(rights).toContainText('no rights to original content are granted');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Start synthetic demo', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Import original game data', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
  await expect(rights).toBeVisible();
  await expect(page.getByText('Importing original game data is not implemented', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start synthetic demo', exact: true })).toBeEnabled();
  await expect(page.locator('canvas, input[type="file"]')).toHaveCount(0);
});
