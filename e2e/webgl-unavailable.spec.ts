import { chromium } from '@playwright/test';
import { test as observed, expect } from './support/browser-test.ts';
import { installedBrowser } from './support/environment.ts';
import { diagnostics, enterDemo, focusView, frameWindow, stableAxis } from './support/demo-observations.ts';

const test = observed.extend({
  page: async ({ baseURL, viewport }, use) => {
    const browser = await chromium.launch({
      ...installedBrowser(), args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'],
    });
    try {
      const context = await browser.newContext({ baseURL, viewport: viewport ?? undefined, deviceScaleFactor: 1 });
      try { await use(await context.newPage()); } finally { await context.close(); }
    } finally {
      await browser.close();
    }
  },
});
test.use({ webglUnavailable: true });

test('real WebGL-off browser retains Core input, controls and clean re-entry', async ({ page }, testInfo) => {
  await page.goto('/');
  const browser = page.context().browser();
  if (!browser) throw new Error('Missing owned WebGL-off browser');
  expect(await page.evaluate(() => document.createElement('canvas').getContext('webgl2') === null)).toBe(true);
  const visits = [];
  for (let visit = 1; visit <= 2; visit++) {
    await enterDemo(page);
    await expect(page.getByTestId('render-status')).toHaveAttribute('data-state', 'unavailable');
    await expect(page.getByTestId('render-status')).toContainText('Error creating WebGL context');
    await expect(page.getByTestId('render-status')).toContainText('The session is not affected.');
    await expect(page.locator('canvas')).toHaveCount(0);
    await focusView(page);
    await page.keyboard.press('n');
    await expect(page.getByTestId('results').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('results').locator('li')).toHaveAttribute('data-outcome', 'accepted');
    await expect(page.getByTestId('marker')).not.toHaveText('none');
    await page.keyboard.press('p');
    await expect(page.getByTestId('phase')).toHaveText('paused');
    const pausedTick = await page.getByTestId('tick').textContent();
    await page.waitForTimeout(350);
    await expect(page.getByTestId('tick')).toHaveText(pausedTick!);
    await page.keyboard.press('p');
    const resumed = await stableAxis(page);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByTestId('phase')).toHaveText('paused');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    const buttonResume = await stableAxis(page);
    const renderer = await diagnostics(page);
    expect(renderer.state).toBe('unavailable');
    expect(renderer.gpu).toBeNull();
    await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start synthetic demo', exact: true })).toBeEnabled();
    const menu = await frameWindow(page);
    expect(menu.frames.pending).toBe(0);
    expect(menu.listeners.filter(entry => entry.active && ['keyboard', 'session', 'render'].includes(entry.group))).toEqual([]);
    visits.push({ visit, pausedTick, resumed, buttonResume, renderer, menu });
  }
  await testInfo.attach('webgl-unavailable', { body: JSON.stringify({ browser: browser.version(), origin: page.url(), visits }), contentType: 'application/json' });
});
