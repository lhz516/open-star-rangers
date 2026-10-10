import { expect, test } from '@playwright/test';

// The application menu loads without a page error in each project; a fresh context holds no package, so the mission
// entry is disabled and says why (P3-04 开始资格).
test('loads the application menu', async ({ page, browser, baseURL }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => { errors.push(error.message); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open Star Rangers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Main menu', exact: true })).toBeVisible();
  const entry = page.getByRole('button', { name: 'Start mission', exact: true });
  await expect(entry).toBeDisabled();
  await expect(entry).toHaveAttribute('data-eligibility', 'no-package');
  await expect(page.getByTestId('mission-entry-reason')).toContainText('No resource package is held.');
  await expect(page.getByRole('button', { name: 'Import original game data', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  await testInfo.attach('environment', {
    body: JSON.stringify({ browser: browser.version(), origin: baseURL, project: testInfo.project.name }),
    contentType: 'application/json',
  });
});
