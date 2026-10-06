import type { Page } from '@playwright/test';
import { test, expect } from './support/browser-test.ts';
import { diagnostics, focusView, projection, stableAxis } from './support/demo-observations.ts';
import { image, verifyLayout } from './support/image-observations.ts';

async function isolatedKeys(page: Page): Promise<void> {
  for (const key of ['n', 'x', 'p', 'ArrowLeft']) await page.keyboard.press(key);
}

test('native controls, trusted movement, Core results and same-owner resize', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Start synthetic demo', exact: true })).toBeFocused();
  await isolatedKeys(page);
  await expect(page.getByRole('heading', { name: 'Main menu', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Synthetic demo', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Return to menu', exact: true })).toBeFocused();
  await isolatedKeys(page);
  await expect(page.getByTestId('phase')).toHaveText('running');
  await expect(page.getByTestId('results')).toHaveText('None.');
  await page.keyboard.press('Tab');
  const view = page.getByRole('region', { name: 'Synthetic view and game key input', exact: true });
  await expect(view).toBeFocused();
  await expect(view).toHaveAttribute('aria-describedby', 'synthetic-keyboard-help');
  await expect(page.locator('#synthetic-keyboard-help')).toContainText('ArrowLeft / ArrowRight');
  await expect(page.getByTestId('keyboard-status')).toHaveAttribute('data-state', 'active');

  const movements = [];
  for (const [key, direction] of [['ArrowRight', 1], ['ArrowLeft', -1]] as const) {
    const before = await projection(page);
    const beforeImage = await image(page);
    const started = Date.now();
    await page.keyboard.down(key);
    await page.waitForTimeout(1100);
    const after = await projection(page);
    const afterImage = await image(page);
    await page.keyboard.up(key);
    const duration = Date.now() - started;
    expect(duration).toBeGreaterThanOrEqual(1000);
    expect((after.x - before.x) * direction).toBeGreaterThan(0.8);
    expect(beforeImage.mover.count).toBeGreaterThanOrEqual(9);
    expect(afterImage.mover.count).toBeGreaterThanOrEqual(9);
    expect(beforeImage.mover.x).not.toBeNull();
    expect(afterImage.mover.x).not.toBeNull();
    expect((afterImage.mover.x! - beforeImage.mover.x!) * direction).toBeGreaterThan(0);
    const samples = await stableAxis(page);
    movements.push({ key, duration, before, after, beforeImage, afterImage, samples });
  }
  const commandRun = (await projection(page)).run;
  await page.keyboard.press('n');
  const results = page.getByTestId('results').locator('li');
  await expect(results).toHaveCount(1);
  await expect(results.nth(0)).toHaveAttribute('data-outcome', 'accepted');
  await expect(page.getByTestId('marker')).not.toHaveText('none');
  const markerImage = await image(page);
  expect(markerImage.marker.count).toBeGreaterThanOrEqual(9);
  expect((await diagnostics(page)).entities).toBe(2);
  await focusView(page);
  await page.keyboard.press('x');
  await expect(results).toHaveCount(2);
  await expect(results.nth(1)).toHaveAttribute('data-outcome', 'accepted');
  await expect(page.getByTestId('marker')).toHaveText('none');
  expect((await image(page)).marker.count).toBe(0);
  await page.keyboard.press('x');
  await expect(results).toHaveCount(3);
  await expect(results.nth(2)).toHaveAttribute('data-outcome', 'rejected');
  const identities = (await results.allTextContents()).map(text => {
    const identity = /^run (\d+) · #(\d+)/.exec(text);
    if (!identity) throw new Error(`Missing result identity: ${text}`);
    return { run: identity[1], command: Number(identity[2]) };
  });
  expect(identities.every(identity => identity.run === commandRun)).toBe(true);
  expect(new Set(identities.map(identity => identity.command)).size).toBe(3);
  expect(identities[1].command).toBeGreaterThan(identities[0].command);
  expect(identities[2].command).toBeGreaterThan(identities[1].command);
  await expect(page.getByTestId('pending')).toHaveText('None.');

  const canvas = await page.locator('canvas').elementHandle();
  const run = (await projection(page)).run;
  const wide = await verifyLayout(page);
  await page.setViewportSize({ width: 480, height: 900 });
  await page.waitForTimeout(150);
  const narrow = await verifyLayout(page);
  expect((await projection(page)).run).toBe(run);
  expect(await canvas!.evaluate(node => node.isConnected)).toBe(true);
  await focusView(page);
  await page.keyboard.press('n');
  await expect(results).toHaveCount(4);
  await expect(results.nth(3)).toHaveAttribute('data-outcome', 'accepted');
  const narrowImage = await image(page);
  expect(narrowImage.mover.count).toBeGreaterThan(0);
  expect(narrowImage.marker.count).toBeGreaterThan(0);
  expect((await diagnostics(page)).entities).toBe(2);

  await page.getByRole('button', { name: 'Pause', exact: true }).focus();
  await isolatedKeys(page);
  await expect(page.getByTestId('phase')).toHaveText('running');
  await expect(results).toHaveCount(4);
  await page.getByRole('button', { name: 'Return to menu', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Start synthetic demo', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Import original game data', exact: true })).toBeFocused();
  await isolatedKeys(page);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Return to menu', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Import original game data', exact: true })).toBeFocused();
  await testInfo.attach('interaction-render', { body: JSON.stringify({ movements, identities, markerImage, wide, narrow, narrowImage }), contentType: 'application/json' });
});

test('pause, focus loss and run changes clear held movement without stale repeat', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start synthetic demo', exact: true }).click();
  await expect(page.getByTestId('phase')).toHaveText('running');
  await focusView(page);
  await page.evaluate(() => {
    const view = document.querySelector('[data-testid="synthetic-view"]');
    if (!view) throw new Error('Missing input view');
    const log: { code: string; repeat: boolean; trusted: boolean }[] = [];
    view.addEventListener('keydown', event => {
      if (!(event instanceof KeyboardEvent)) throw new Error('Expected keyboard event');
      log.push({ code: event.code, repeat: event.repeat, trusted: event.isTrusted });
      view.setAttribute('data-test-keys', JSON.stringify(log));
    });
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.press('p');
  await expect(page.getByTestId('phase')).toHaveText('paused');
  const paused = await diagnostics(page);
  const pausedProjection = await projection(page);
  await page.waitForTimeout(400);
  expect((await diagnostics(page)).draws).toBe(paused.draws);
  expect((await projection(page)).tick).toBe(pausedProjection.tick);
  await focusView(page);
  await page.keyboard.press('p');
  // A second down without up produces a trusted repeat, not a fresh press.
  await page.keyboard.down('ArrowRight');
  const resumedSamples = await stableAxis(page);
  await page.keyboard.up('ArrowRight');
  const beforeFresh = await projection(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Return to menu', exact: true }).focus();
  const blurred = await stableAxis(page);
  expect(Number(blurred[0].x) - beforeFresh.x).toBeGreaterThan(0.1);
  await expect(page.getByTestId('phase')).toHaveText('running');
  await focusView(page);
  await page.keyboard.down('ArrowRight');
  const repeated = await stableAxis(page);
  await page.keyboard.up('ArrowRight');
  const keys = JSON.parse(await page.getByTestId('synthetic-view').getAttribute('data-test-keys') ?? 'null') as { code: string; repeat: boolean; trusted: boolean }[];
  expect(keys.every(key => key.trusted)).toBe(true);
  expect(keys.filter(key => key.code === 'ArrowRight' && key.repeat)).toHaveLength(2);

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByTestId('phase')).toHaveText('paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const buttonSamples = await stableAxis(page);
  const oldRun = (await projection(page)).run;
  await focusView(page);
  await page.keyboard.down('ArrowLeft');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByTestId('run-id')).not.toHaveText(oldRun);
  await focusView(page);
  await page.keyboard.down('ArrowLeft');
  const restartSamples = await stableAxis(page);
  expect(restartSamples.every(sample => Number(sample.x) === 0)).toBe(true);
  await page.keyboard.up('ArrowLeft');
  await expect(page.getByTestId('marker')).toHaveText('none');
  await expect(page.getByTestId('results')).toHaveText('None.');
  const restartRun = (await projection(page)).run;
  await focusView(page);
  await page.keyboard.down('ArrowLeft');
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(page.getByTestId('phase')).toHaveText('idle');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('run-id')).not.toHaveText(restartRun);
  await focusView(page);
  await page.keyboard.down('ArrowLeft');
  const startSamples = await stableAxis(page);
  expect(startSamples.every(sample => Number(sample.x) === 0)).toBe(true);
  await page.keyboard.up('ArrowLeft');
  const oldCanvas = await page.locator('canvas').elementHandle();
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  expect(await oldCanvas!.evaluate(canvas => canvas.isConnected)).toBe(false);
  await page.getByRole('button', { name: 'Start synthetic demo', exact: true }).click();
  await expect(page.getByTestId('run-id')).toHaveText('1');
  const ownerSamples = await stableAxis(page);
  expect(ownerSamples.every(sample => Number(sample.x) === 0)).toBe(true);
  await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
  await testInfo.attach('clear-axis', {
    body: JSON.stringify({ paused, pausedProjection, resumedSamples, blurred, repeated, keys, buttonSamples, restartSamples, startSamples, ownerSamples }),
    contentType: 'application/json',
  });
});
