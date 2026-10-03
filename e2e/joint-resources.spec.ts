import { test, expect } from './support/browser-test.ts';
import type { ProbeSnapshot } from './support/browser-probes.ts';
import { diagnostics, enterDemo, focusView, frameWindow, projection } from './support/demo-observations.ts';

function owned(snapshot: ProbeSnapshot) {
  return snapshot.listeners.filter(entry => ['keyboard', 'session', 'render'].includes(entry.group));
}

function activeIdentity(snapshot: ProbeSnapshot): string[] {
  return owned(snapshot).filter(entry => entry.active)
    .map(entry => `${entry.group}:${entry.target}:${entry.type}:${entry.id}:${entry.capture}`).sort();
}

function checkLive(snapshot: ProbeSnapshot): void {
  const keyboard = snapshot.listeners.filter(entry => entry.active && entry.group === 'keyboard');
  expect(keyboard.map(entry => entry.type).sort())
    .toEqual(['blur', 'focus', 'focusin', 'focusout', 'keydown', 'keyup', 'pagehide', 'pageshow', 'visibilitychange']);
  const session = snapshot.listeners.filter(entry => entry.active && entry.group === 'session');
  expect(session.map(entry => entry.type).sort()).toEqual(['pagehide', 'pageshow', 'visibilitychange']);
  expect(new Set(keyboard.filter(entry => ['keydown', 'keyup'].includes(entry.type)).map(entry => entry.target)).size).toBe(1);
  expect(snapshot.observers.filter(observer => observer.targets.length > 0)).toHaveLength(1);
  expect(snapshot.listeners.filter(entry => entry.active && entry.group === 'render').map(entry => entry.type).sort())
    .toEqual(['change', 'webglcontextcreationerror', 'webglcontextlost', 'webglcontextlost', 'webglcontextrestored', 'webglcontextrestored']);
  expect(snapshot.frames.maximum).toBeLessThanOrEqual(1);
  expect(snapshot.frames.delivered).toBeGreaterThan(0);
}

test('three keyboard/menu round trips jointly balance owner, rAF, rendering and GPU resources', async ({ page }, testInfo) => {
  await page.goto('/');
  const baseline = await page.evaluate(() => window.osrProbe.snapshot());
  const unknownBaseline = baseline.listeners.filter(entry => entry.active && entry.group === 'other').map(entry => entry.id);
  const visits = [];
  let gpuBaseline: number[] | null = null;
  let previousRelease = 0;
  for (let visit = 1; visit <= 3; visit++) {
    await enterDemo(page);
    await expect(page.getByTestId('render-status')).toHaveAttribute('data-state', 'ready');
    const beforeMove = await projection(page);
    await focusView(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => (await projection(page)).x).toBeGreaterThan(beforeMove.x);
    await page.keyboard.press('n');
    await expect(page.getByTestId('results').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('results').locator('li')).toHaveAttribute('data-outcome', 'accepted');
    const warm = await diagnostics(page);
    expect(warm.entities).toBe(2);
    expect(warm.gpu).not.toBeNull();
    if (gpuBaseline === null) gpuBaseline = warm.gpu;
    else expect(warm.gpu).toEqual(gpuBaseline);
    const live = await frameWindow(page);
    checkLive(live);
    const currentListeners = owned(live).filter(entry => entry.active);
    expect(Math.min(...currentListeners.map(entry => entry.addedAt))).toBeGreaterThan(previousRelease);
    const identity = activeIdentity(live);
    const runChanges = [];
    for (const operation of ['restart', 'exit-start'] as const) {
      const oldRun = (await projection(page)).run;
      if (operation === 'restart') await page.getByRole('button', { name: 'Restart', exact: true }).click();
      else {
        await page.getByRole('button', { name: 'Exit', exact: true }).click();
        await expect(page.getByTestId('phase')).toHaveText('idle');
        await page.getByRole('button', { name: 'Start', exact: true }).click();
      }
      await expect(page.getByTestId('run-id')).not.toHaveText(oldRun);
      await focusView(page);
      await page.keyboard.press('n');
      await expect(page.getByTestId('results').locator('li')).toHaveCount(1);
      await expect(page.getByTestId('results').locator('li')).toHaveAttribute('data-outcome', 'accepted');
      const warmedAgain = await diagnostics(page);
      expect(warmedAgain.entities).toBe(2);
      expect(warmedAgain.gpu).toEqual(gpuBaseline);
      const resources = await frameWindow(page);
      checkLive(resources);
      expect(activeIdentity(resources)).toEqual(identity);
      runChanges.push({ operation, warmedAgain, resources });
    }
    const oldCanvas = await page.locator('canvas').elementHandle();
    await page.getByRole('button', { name: 'Return to menu', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await oldCanvas!.evaluate(canvas => canvas.isConnected)).toBe(false);
    const menu = await frameWindow(page);
    expect(owned(menu).every(entry => !entry.active && entry.removedAt !== null)).toBe(true);
    expect(menu.frames).toEqual({ pending: 0, maximum: 0, requested: 0, delivered: 0, cancelled: 0 });
    expect(menu.observers.every(observer => observer.targets.length === 0)).toBe(true);
    expect(menu.canvases.every(canvas => !canvas.connected)).toBe(true);
    const supported = menu.canvases.filter(canvas => canvas.extension);
    const unavailable = menu.canvases.length - supported.length;
    if (unavailable > 0) testInfo.annotations.push({
      type: 'context-loss-capability',
      description: `${unavailable} context(s) lack WEBGL_lose_context; their context-loss outcome is not verified.`,
    });
    for (const canvas of supported) expect(canvas.lost, `Canvas ${canvas.id} context loss`).toBe(true);
    console.info(`${testInfo.project.name} visit ${visit}: keyboard9/session3/render6, rAF<=1, GPU ${warm.gpu}, context lost ${supported.length}/${menu.canvases.length} (unavailable ${unavailable})`);
    expect(menu.listeners.filter(entry => entry.active && entry.group === 'other').map(entry => entry.id)).toEqual(unknownBaseline);
    previousRelease = Math.max(...owned(menu).map(entry => entry.removedAt!));
    visits.push({ visit, warm, live, runChanges, menu });
  }
  await testInfo.attach('joint-resource-round-trips', { body: JSON.stringify({ baseline, gpuBaseline, visits }), contentType: 'application/json' });
});
