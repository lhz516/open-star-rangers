import { chromium, type Page } from '@playwright/test';
import { button } from './support/app-entry.ts';
import type { ProbeSnapshot } from './support/browser-probes.ts';
import { test as observed, expect } from './support/browser-test.ts';
import { installedBrowser } from './support/environment.ts';
import {
  endPlaceholder, enterMission, expectAdvancingTick, expectFlightCursorWithoutWebGL, expectStableTick, frameWindow, leaveGuards, missionEntry, missionFrame,
} from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';
import { settleTooling } from './support/resource-balance.ts';
import { openHeldViewer } from './support/version-4.ts';
import { viewerDiagnostics } from './support/viewer-observations.ts';

// A real Chromium with WebGL disabled, in the development and production projects. P3-04 (docs/plan/p3/04/spec.md,
// 合成演示退役) moves the WebGL-unavailable fallback from the retired synthetic demo to the resource viewer, the one
// screen with a WebGL surface: its explanation, its lists and its release on two visits, in both builds (viewer-page.spec.ts
// covers one development visit with sounds and the mission summary). The mission flow, which has no WebGL surface, stays
// usable. The startable mission package is seeded into the test's own context and restored through the real menu.

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
test.describe.configure({ timeout: 120_000 });

const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

/** The last probe sequence number a listener of `snapshot` was added at. */
const lastAdded = ({ listeners }: ProbeSnapshot): number => Math.max(0, ...listeners.map(({ addedAt }) => addedAt));

/**
 * Back on the menu after a screen: no frame is pending, no observer watches, and no application listener added since
 * `baseline` is still active on a connected target.
 */
async function expectReleased(page: Page, baseline: number) {
  const menu = await frameWindow(page);
  expect(menu.frames.pending).toBe(0);
  expect(menu.observers.filter(({ targets }) => targets.length > 0)).toEqual([]);
  expect(menu.listeners.filter(({ active, detached, addedAt, group }) => active && !detached && addedAt > baseline && !['test', 'vite'].includes(group))).toEqual([]);
  return menu;
}

test('without WebGL the viewer explains it and releases on each visit, and the mission flow creates no WebGL surface', async ({ page }, testInfo) => {
  const mission = missionPackage();
  await page.goto('/');
  const browser = page.context().browser();
  if (!browser) throw new Error('Missing owned WebGL-off browser');
  expect(await page.evaluate(() => document.createElement('canvas').getContext('webgl2') === null)).toBe(true);
  await seedProductionCache(page, await mission);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await settleTooling(page);
  const baseline = lastAdded(await frameWindow(page));

  // The viewer, twice: each visit explains the fallback, keeps its list usable and releases everything on return.
  const visits = [];
  for (let visit = 1; visit <= 2; visit++) {
    await openHeldViewer(page);
    const status = page.getByTestId('viewer-render-status');
    await expect(status).toHaveAttribute('role', 'alert');
    await expect(status).toContainText('WebGL 2 is unavailable');
    await expect(page.getByTestId('viewer-view').locator('canvas')).toHaveCount(0);
    const entries = page.getByTestId('viewer-entries').getByRole('button');
    expect(await entries.count()).toBeGreaterThan(0);
    await entries.first().click();
    await expect(entries.first()).toHaveAttribute('aria-pressed', 'true');
    const viewer = await viewerDiagnostics(page);
    expect(viewer).toMatchObject({ state: 'unavailable', gpu: null, layout: null, placement: null });
    await button(page, 'Return to menu').click();
    await expect(button(page, 'View resources')).toBeFocused();
    visits.push({ visit, viewer, released: (await expectReleased(page, baseline)).frames });
  }

  // The mission flow runs, pauses and resumes with only its 2D cursor, then releases on return.
  const { owner } = await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await endPlaceholder(page, 'G-02/2', 'button');
  const running = await expectAdvancingTick(page);
  await button(page, 'Pause').click();
  const paused = await expectStableTick(page, 400);
  await button(page, 'Resume').click();
  const resumed = await expectAdvancingTick(page);
  expect(await missionFrame(page)).toMatchObject({ owner, run: 1, position: 'flight' });
  await expectFlightCursorWithoutWebGL(page);
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await leaveGuards(page)).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  const afterMission = await expectReleased(page, baseline);
  // Neither screen ever got a WebGL context.
  expect(afterMission.canvases).toEqual([]);
  await testInfo.attach('webgl-unavailable', {
    body: JSON.stringify({ browser: browser.version(), origin: page.url(), visits, mission: { running, paused, resumed, released: afterMission.frames } }),
    contentType: 'application/json',
  });
});
