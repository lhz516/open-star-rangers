import type { Page } from '@playwright/test';
import { SLICE_GAPS } from '../src/ui/mission/slice-gaps-copy.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from '../tools/preview-csp.ts';
import { button } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { tabTo } from './support/keyboard-input.ts';
import {
  checkedWingman, chooseWingman, endPlaceholder, enterMission, expectAdvancingTick, expectGaps, expectStableTick, holdKey, leaveGuards,
  missionEntry, missionFrame, stopWatchingPositions, waitForFrame, watchPositions,
} from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';

// P3-04 subtask 10 (docs/plan/p3/04/spec.md, 合成任务包 and 验证策略; AC-12 and AC-19 in production builds): the mission
// flow on the local production preview under its Content Security Policy, with the network audit on. Production has no
// test entry, so the test seeds its own isolated context with the startable synthetic mission package under the
// production identity and budget (`seedProductionCache`), then restores, verifies and starts it through the real main
// menu. Run evidence comes only from the mission screen's read-only attributes; the build has no diagnostics panel.

test.describe.configure({ timeout: 240_000 });

const STATUS = 'original-data-status';
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

const status = (page: Page) => page.getByTestId('mission-status');
const startHeading = (page: Page) => page.getByRole('heading', { name: 'Mission start', exact: true });

/** Records every `securitypolicyviolation` the document reports, before any page script runs. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { osrViolations: string[] }).osrViolations = seen;
    document.addEventListener('securitypolicyviolation', event => { seen.push(`${event.effectiveDirective} ${event.blockedURI}`); });
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { osrViolations: string[] }).osrViolations);

/** The production build shows no development diagnostics anywhere in the mission screen. */
async function expectNoDiagnostics(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.querySelectorAll('[data-testid="mission-dev-panel"], [data-testid^="dev-"]').length)).toBe(0);
}

test('the whole production flow from a restored cache, with and without a wingman: placeholders, departure at tick 0, pause, menu, restart and return', async ({ page }) => {
  // Converted in Node while the page loads.
  const mission = missionPackage();
  await recordViolations(page);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: None in this browser.');
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  await seedProductionCache(page, await mission);
  await page.reload();
  await expect(page.getByTestId(STATUS)).toHaveText('Original game data: Saved resources found in this browser, not yet verified.');
  // Saved resources are not yet a startable package: only their restore and verification are.
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await expect(page.getByTestId('mission-entry-reason')).toHaveCount(0);
  await expectGaps(page, ['G-07']);

  // Run 1 with the first wingman option, preselected: the introduction ends by Esc, the departure by its skip button.
  let frame = await enterMission(page);
  const { owner } = frame;
  expect(frame).toEqual({ owner, run: null, tick: null, position: 'intro' });
  await expectGaps(page, ['G-02/1']);
  await expectNoDiagnostics(page);
  frame = await endPlaceholder(page, 'G-02/1', 'Escape');
  await expect(startHeading(page)).toBeFocused();
  expect(frame).toEqual({ owner, run: null, tick: null, position: 'config' });
  await expectGaps(page, ['G-04', 'G-07', 'G-01', 'G-02/1', 'G-02/2']);
  await expect(page.getByTestId('mission-config-difficulty')).toHaveText('19 (fixed, G-07)');
  await expect(page.getByTestId('mission-wingmen').locator('input[type="radio"]')).toHaveCount(6);
  expect(await checkedWingman(page)).toBe(0);
  expect(await leaveGuards(page)).toBe(0);
  await button(page, 'Start').click();
  frame = await waitForFrame(page, candidate => candidate.position === 'departure');
  expect(frame).toEqual({ owner, run: 1, tick: 0, position: 'departure' });
  await expect(page.getByTestId('mission-placeholder-variant')).toHaveAttribute('data-variant', 'wingman');
  await expectGaps(page, ['G-02/2']);
  expect(await leaveGuards(page)).toBe(1);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
  expect(await leaveGuards(page)).toBe(1);
  await expectGaps(page, ['G-01', 'G-02/1', 'G-02/2']);
  await expect(status(page).locator('[data-gap="G-01"]')).toHaveText(`${SLICE_GAPS['G-01'].title} (G-01)`);
  await expectNoDiagnostics(page);

  // Pause holds the tick; resume continues it.
  await button(page, 'Pause').click();
  await expect(status(page)).toHaveAttribute('data-phase', 'paused');
  await expect(status(page)).toHaveAttribute('data-pause', 'user');
  const paused = await expectStableTick(page, 800);
  await expect(button(page, 'Resume')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(paused);

  // The mission menu: no key resumes the run while it shows; Continue does.
  await button(page, 'Mission menu').click();
  await expect(page.getByRole('heading', { name: 'Mission menu', exact: true })).toBeFocused();
  await expectGaps(page, ['G-07', 'G-06']);
  await waitForFrame(page, candidate => candidate.position === 'menu');
  const held = await expectStableTick(page);
  for (const key of ['Escape', 'p', 'P', 'Enter', ' ']) await page.keyboard.press(key);
  expect(await expectStableTick(page)).toBe(held);
  expect(await missionFrame(page)).toEqual({ owner, run: 1, tick: held, position: 'menu' });
  expect(await leaveGuards(page)).toBe(1);
  await tabTo(page, button(page, 'Continue'));
  await page.keyboard.press('Space');
  await waitForFrame(page, candidate => candidate.position === 'flight');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(held);

  // Restart: a new introduction ended by a held Enter whose repeats and keyup start nothing, the remembered choice
  // preselected, then a new run without a wingman whose departure a held Space ends without pausing the flight.
  await button(page, 'Mission menu').click();
  await tabTo(page, button(page, 'Restart mission'));
  await page.keyboard.press('Enter');
  frame = await waitForFrame(page, candidate => candidate.position === 'intro');
  expect(frame).toEqual({ owner, run: null, tick: null, position: 'intro' });
  expect(await leaveGuards(page)).toBe(0);
  await expect(button(page, 'Skip')).toBeFocused();
  await holdKey(page, 'Enter', async () => {
    await waitForFrame(page, candidate => candidate.position === 'config');
    await expect(startHeading(page)).toBeFocused();
  });
  expect(await missionFrame(page)).toEqual({ owner, run: null, tick: null, position: 'config' });
  expect(await checkedWingman(page)).toBe(0);
  await chooseWingman(page, null);
  await button(page, 'Start').click();
  frame = await waitForFrame(page, candidate => candidate.position === 'departure');
  expect(frame).toEqual({ owner, run: 2, tick: 0, position: 'departure' });
  await expect(page.getByTestId('mission-placeholder-variant')).toHaveAttribute('data-variant', 'solo');
  await expect(button(page, 'Skip')).toBeFocused();
  await holdKey(page, ' ', async () => {
    await waitForFrame(page, candidate => candidate.position === 'flight');
    await expect(page.getByTestId('game-input-zone')).toBeFocused();
  });
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
  expect(await missionFrame(page)).toMatchObject({ owner, run: 2, position: 'flight' });

  // Return: focus on the mission entry, no run or leave guard left.
  await button(page, 'Mission menu').click();
  await tabTo(page, button(page, 'Return to main menu'));
  await page.keyboard.press('Space');
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);

  // A new owner: both placeholders end by themselves; the departure holds tick 0; no wingman is preselected again.
  await watchPositions(page);
  frame = await enterMission(page);
  const next = frame.owner!;
  expect(next).toBeGreaterThan(owner!);
  await endPlaceholder(page, 'G-02/1', 'natural');
  expect(await checkedWingman(page)).toBeNull();
  await chooseWingman(page, 4);
  await button(page, 'Start').click();
  frame = await waitForFrame(page, candidate => candidate.position === 'departure');
  expect(frame).toEqual({ owner: next, run: 1, tick: 0, position: 'departure' });
  await expect(page.getByTestId('mission-placeholder-variant')).toHaveAttribute('data-variant', 'wingman');
  expect(await expectStableTick(page, 800)).toBe(0);
  await endPlaceholder(page, 'G-02/2', 'natural');
  await stopWatchingPositions(page);
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
  await expectNoDiagnostics(page);
  await button(page, 'Mission menu').click();
  await tabTo(page, button(page, 'Return to main menu'));
  await page.keyboard.press('Space');
  await expect(missionEntry(page)).toBeFocused();
  expect(await violations(page)).toEqual([]);
});
