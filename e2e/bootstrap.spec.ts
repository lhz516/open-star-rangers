import { expect, test } from '@playwright/test';

test('loads the synthetic application menu', async ({ page, browser, baseURL }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open Star Rangers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Main menu', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start synthetic demo', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  await testInfo.attach('environment', {
    body: JSON.stringify({ browser: browser.version(), origin: baseURL, project: testInfo.project.name }),
    contentType: 'application/json',
  });
});
