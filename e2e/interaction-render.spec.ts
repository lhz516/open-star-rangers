import type { Locator, Page } from '@playwright/test';
import { button } from './support/app-entry.ts';
import { test, expect } from './support/browser-test.ts';
import {
  checkedWingman, expectAdvancingTick, expectStableTick, leaveGuards, missionEntry, missionFrame, waitForFrame,
} from './support/mission-observations.ts';
import { verifyLayout } from './support/image-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';
import { openHeldViewer } from './support/version-4.ts';
import { viewerDiagnostics } from './support/viewer-observations.ts';

// Native controls and same-owner resize, in the development and production projects. P3-04 (docs/plan/p3/04/spec.md,
// 合成演示退役) retires the synthetic demo's mover and marker picture/commands with it: P3-05 supplies production input
// bindings, but no flight view exists yet (P3-12). The mission flow runs by keyboard on its native controls and game
// input zone, unbound keys act on nothing, and a window resize keeps the same mission owner and run; the resize of a
// WebGL picture moves to the resource viewer, the one screen that draws one. The startable mission package is seeded
// into the test's own context and restored first.

const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
/** Keys that are not in P3-05's production binding table. */
const UNBOUND = ['b', 'h', 'i', 'n', 'o', 'v'];

/** Moves focus with Tab (or Shift+Tab) until `target` has it; fails after `limit` presses. */
async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab', limit = 20): Promise<void> {
  for (let press = 0; press < limit; press++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

async function activeInputListenerCounts(page: Page): Promise<{ readonly keyboard: number; readonly pointerLock: number }> {
  return page.evaluate(() => {
    const active = window.osrProbe.snapshot().listeners.filter(listener => listener.active);
    return {
      keyboard: active.filter(listener => listener.group === 'keyboard').length,
      pointerLock: active.filter(listener => listener.group === 'pointer-lock').length,
    };
  });
}

/** Seeds the startable mission package, restores it through the real menu and waits until it is held. */
async function restoreMission(page: Page): Promise<void> {
  const mission = missionPackage();
  await page.goto('/');
  await seedProductionCache(page, await mission);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(button(page, 'View resources')).toBeFocused();
}

test('native controls run the mission flow by keyboard alone, unbound keys act on nothing, and a resize keeps the same owner and run', async ({ page }, testInfo) => {
  await restoreMission(page);
  const inputListenersAtMenu = await activeInputListenerCounts(page);

  // The menu: the mission entry is the first entry; keys on it other than activation do nothing.
  await tabTo(page, missionEntry(page), 'Shift+Tab');
  for (const key of UNBOUND) await page.keyboard.press(key);
  expect(await missionFrame(page)).toBeNull();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mission-placeholder')).toHaveAttribute('data-gap', 'G-02/1');
  await expect(button(page, 'Skip')).toBeFocused();
  const { owner } = await waitForFrame(page, frame => frame.position === 'intro');
  await page.keyboard.press('Space');

  // The start page: arrow keys choose a wingman on the native radio group; Enter on Start starts the run.
  await expect(page.getByRole('heading', { name: 'Mission start', exact: true })).toBeFocused();
  expect(await checkedWingman(page)).toBe(0);
  await tabTo(page, page.locator('[data-testid="mission-wingmen"] input:checked'));
  await page.keyboard.press('ArrowDown');
  expect(await checkedWingman(page)).toBe(1);
  await tabTo(page, button(page, 'Start'));
  await page.keyboard.press('Enter');
  await waitForFrame(page, frame => frame.position === 'departure');
  await expect(button(page, 'Skip')).toBeFocused();
  await page.keyboard.press('Escape');

  // Flight: no key outside a control is bound; the run keeps running.
  await waitForFrame(page, frame => frame.position === 'flight');
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await page.keyboard.press('F2');
  await expect(page.getByTestId('input-gap-notice')).toHaveAttribute('data-gap', 'G-08');
  const status = page.getByTestId('mission-status');
  for (const key of UNBOUND) await page.keyboard.press(key);
  await expect(status).toHaveAttribute('data-phase', 'running');
  const unbound = await expectAdvancingTick(page);
  expect(await missionFrame(page)).toMatchObject({ owner, run: 1, position: 'flight' });

  // A resize changes no owner or run, and the game view area stays the same element.
  const view = await page.getByTestId('mission-view').elementHandle();
  const resized = [];
  for (const size of [{ width: 480, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    const ticks = await expectAdvancingTick(page);
    expect(await missionFrame(page)).toMatchObject({ owner, run: 1, position: 'flight' });
    expect(await view!.evaluate(element => element.isConnected)).toBe(true);
    resized.push({ size, ticks });
  }
  expect(await leaveGuards(page)).toBe(1);

  // Pause and resume on the one toggle, which keeps focus; the mission menu and the way back by keyboard.
  await tabTo(page, button(page, 'Pause'));
  await page.keyboard.press('Space');
  await expect(status).toHaveAttribute('data-phase', 'paused');
  await expect(button(page, 'Resume')).toBeFocused();
  const paused = await expectStableTick(page, 400);
  await page.keyboard.press('Enter');
  await expect(status).toHaveAttribute('data-phase', 'running');
  await expect(button(page, 'Pause')).toBeFocused();
  await tabTo(page, button(page, 'Mission menu'));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mission menu', exact: true })).toBeFocused();
  await tabTo(page, button(page, 'Return to main menu'));
  await page.keyboard.press('Space');
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);
  expect(await activeInputListenerCounts(page)).toEqual(inputListenersAtMenu);
  for (const key of UNBOUND) await page.keyboard.press(key);
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  await testInfo.attach('interaction', { body: JSON.stringify({ owner, unbound, resized, paused }), contentType: 'application/json' });
});

test('a window resize keeps the viewer\'s canvas and renderer, redraws the picture and lays it out by the 4:3 rule', async ({ page }, testInfo) => {
  await restoreMission(page);
  await openHeldViewer(page);
  const entry = page.getByTestId('viewer-entries').getByRole('button').first();
  await entry.click();
  await expect(entry).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await viewerDiagnostics(page)).state).toBe('ready');
  const canvas = await page.getByTestId('viewer-view').locator('canvas').elementHandle();
  const first = { diagnostics: await viewerDiagnostics(page), layout: await verifyLayout(page) };
  let previous = first;
  const resized = [];
  for (const size of [{ width: 480, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    // Each resize changes the layout, which the canvas follows by the rule.
    let layout = previous.layout;
    await expect(async () => {
      layout = await verifyLayout(page);
      expect(layout.expected).not.toEqual(previous.layout.expected);
    }).toPass({ timeout: 5_000 });
    // The same renderer, holding as much, draws the same item again at the new size.
    let diagnostics = previous.diagnostics;
    await expect.poll(async () => (diagnostics = await viewerDiagnostics(page)).layout).toEqual(layout.expected);
    expect(diagnostics).toMatchObject({ state: 'ready', item: first.diagnostics.item, gpu: first.diagnostics.gpu });
    expect(diagnostics.draws).toBeGreaterThan(previous.diagnostics.draws);
    expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
    previous = { diagnostics, layout };
    resized.push({ size, ...previous });
  }
  await button(page, 'Return to menu').click();
  await expect(button(page, 'View resources')).toBeFocused();
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(false);
  await testInfo.attach('viewer-resize', { body: JSON.stringify({ first, resized }), contentType: 'application/json' });
});
