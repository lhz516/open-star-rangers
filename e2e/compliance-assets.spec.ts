import { test, expect } from './support/browser-test.ts';
import { object } from '../tools/compliance/packages.ts';

test('production preview serves readable full licensing texts and distribution metadata', async ({ page, browser, baseURL }, testInfo) => {
  const inventoryResponse = await page.goto('/compliance-inventory.json');
  expect(inventoryResponse?.status()).toBe(200);
  expect(inventoryResponse?.headers()['content-type']).toContain('application/json');
  if (!inventoryResponse) throw new Error('Distribution inventory response missing');
  const inventory: unknown = await inventoryResponse.json();
  expect(inventory).toMatchObject({ format: 'osr-distribution-inventory', version: 1 });
  if (!object(inventory) || !Array.isArray(inventory.dependencies)) throw new Error('Inventory package metadata missing');
  const shipped = inventory.dependencies.flatMap((pkg: unknown) => {
    if (!object(pkg) || typeof pkg.name !== 'string' || typeof pkg.version !== 'string' || typeof pkg.distributed !== 'boolean') throw new Error('Invalid package identity');
    return pkg.distributed ? [`${pkg.name}@${pkg.version}`] : [];
  });
  expect(shipped).toHaveLength(7);
  const ownResponse = await page.goto('/LICENSE.txt');
  expect(ownResponse?.status()).toBe(200);
  expect(ownResponse?.headers()['content-type']).toContain('text/plain');
  const own = await page.locator('body').innerText();
  expect(own).toContain('MIT License');
  expect(own).toContain('Copyright (c) 2026 Hanz');
  expect(own).toContain('does not grant rights to original Star Rangers');
  const thirdPartyResponse = await page.goto('/THIRD-PARTY-NOTICES.txt');
  expect(thirdPartyResponse?.status()).toBe(200);
  expect(thirdPartyResponse?.headers()['content-type']).toContain('text/plain');
  const notices = await page.locator('body').innerText();
  for (const identity of shipped) expect(notices).toContain(identity);
  expect(notices).toContain('THIRD-PARTY-LICENSE');
  expect(notices).toContain('Selected obligations: MIT');
  await page.goto('/');
  await expect(page.getByTestId('project-rights')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Main menu', exact: true })).toBeVisible();
  await testInfo.attach('licensing-availability', {
    body: JSON.stringify({ browser: browser.version(), origin: baseURL, shipped, ownLength: own.length, noticeLength: notices.length }),
    contentType: 'application/json',
  });
});
