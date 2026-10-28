import type { Page } from '@playwright/test';
import type { HeldGroup } from '../src/app/resources/resource-holder.ts';
import { messageLabel, messageSummary, SLICE_GAPS } from '../src/ui/mission/slice-gaps-copy.ts';
import { scenarioGroups } from '../src/workers/import-scenarios.test-support.ts';
import { MARKER } from '../src/workers/synthetic-import.test-support.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from '../tools/preview-csp.ts';
import { button } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import {
  CLEAN, cockpitChecks, cockpitState, COLOUR, diagExplanations, incomingPageWrong, instrument, messageLinePixels, messageLineWrong, pauseWhen, resume,
  startableCockpit, targetDisplayRead, textPixels, upperTexts, withData,
} from './support/cockpit.ts';
import { same } from './support/flight-pictures.ts';
import { chooseWingman, endPlaceholder, enterMission, expectFlightCanvas, missionEntry, waitForFrame } from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';

// P3-13/27 (docs/plan/p3/13/spec.md, 验证策略; AC-08, AC-10, AC-11, AC-13, AC-20): the Classic cockpit in the production
// build under the preview's strict content security policy and the network audit. Each case seeds its own context's
// cache with a converted synthetic package under the production identity (production-cache.ts) and restores it through
// the real menu, so the run goes through the production composition; no test module, entry or fixture is served. The
// pictures are checked against the expectations of support/cockpit.ts, each also against a wrong expectation.

test.describe.configure({ timeout: 180_000 });

const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

/** Records every `securitypolicyviolation`, seeds `groups` under the production identity and restores them by the menu. */
async function restore(page: Page, groups: Promise<readonly HeldGroup[]>): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { osrViolations: string[] }).osrViolations = seen;
    document.addEventListener('securitypolicyviolation', event => { seen.push(`${event.effectiveDirective} ${event.blockedURI}`); });
  });
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  await seedProductionCache(page, await groups);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  // The production build has no test entry and no diagnostics.
  expect(await page.evaluate(() => 'osrTestEntry' in window)).toBe(false);
}

/** From the main menu through both placeholders into running flight, without a wingman. */
async function fly(page: Page): Promise<void> {
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await chooseWingman(page, null);
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  // The player enters the world in the run's first ticks; commands before that find no player.
  await waitForFrame(page, frame => (frame.tick ?? 0) >= 20);
}

async function expectNoViolationOrDiagnostics(page: Page): Promise<void> {
  expect(await page.locator('[data-testid="mission-dev-panel"], [data-testid^="dev-"]').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { osrViolations: string[] }).osrViolations)).toEqual([]);
}

test('the production F1 cockpit: frame, band, rings, lamp, page 0 and the right display in the one flight canvas', async ({ page }, testInfo) => {
  const fixture = await startableCockpit();
  await restore(page, missionPackage());
  await fly(page);
  const { image, state } = await pauseWhen(page, current => current.tick >= 40, 'tick 40');
  await expectFlightCanvas(page);
  expect(state.viewMode).toBe(0x0c);
  expect(cockpitChecks(image, fixture, state)).toEqual(CLEAN);
  const wrong = cockpitChecks(image, withData(fixture, fixture.map), state);
  for (const [check, pixels] of Object.entries(wrong)) expect(pixels.length, `${check} rejects the map palette`).toBeGreaterThan(0);
  // Page 0's upper DIAG line shows one typed state of its four messages.
  const rect = instrument(fixture, 6);
  const upper = image.at(...textPixels(fixture.small, 'S', rect.x0 + 4, rect.y0 + 5)[0]);
  expect(same(upper, fixture.data[0])).toBe(false);
  const texts = upperTexts(fixture, [state]);
  expect(diagExplanations(image, fixture, [0, 1, 2, 3].flatMap(texts), upper).length).toBeGreaterThan(0);
  expect(diagExplanations(image, fixture, ['S9\n42%'], upper)).toEqual([]);
  // The right display: its background, text and at most the synthetic model's pixel or two.
  const display = targetDisplayRead(image, fixture);
  expect(display.wrong).toEqual([]);
  expect(display.model).toBeLessThanOrEqual(2);
  expect(targetDisplayRead(image, fixture, 1).wrong.length).toBeGreaterThan(0);
  await expectNoViolationOrDiagnostics(page);
  await resume(page);
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  await expect(page.locator('canvas')).toHaveCount(0);
  await testInfo.attach('production-cockpit', { body: JSON.stringify({ tick: state.tick }), contentType: 'application/json' });
});

test('production incoming: page 5 shows the G-03 label, the message line the summary, and the docked base page the same summary (G-05)', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const fixture = await startableCockpit();
  await restore(page, scenarioGroups('mission-docking'));
  await fly(page);
  // `c`, 2, 2: the base category, the base's command menu and the docking request (P3-10).
  for (const key of ['c', '2', '2']) {
    const { tick } = await cockpitState(page);
    await page.keyboard.press(key);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= tick + 4);
  }
  await expect.poll(async () => (await cockpitState(page)).incoming?.shown, { timeout: 30_000, message: 'the base answers' }).toBe(true);
  // Some 20 ticks later, whole glyphs of the summary are on the line (mode 1 moves 1.5 pixels a tick).
  const { tick: answered } = await cockpitState(page);
  const { image, state } = await pauseWhen(page, current => current.tick >= answered + 20, 'the summary on the line');
  expect(state.combat!.leftPage).toBe(5);
  const { message } = state.incoming!;
  const summary = messageSummary(message)!;
  const label = messageLabel(message)!;
  expect(state.head).toEqual({ text: summary, origin: 'project' });
  expect(incomingPageWrong(image, fixture, label)).toEqual([]);
  expect(incomingPageWrong(image, fixture, messageLabel({ ...message, index: message.index + 1 })!).length).toBeGreaterThan(0);
  // The summary scrolls on the message line in colour 8 at exactly one offset of its run (no event log here).
  const line = instrument(fixture, 8);
  const width = line.x1 - line.x0 - 1;
  const offsets = Array.from({ length: width + summary.length * 8 }, (_, index) => width - index)
    .filter(offset => (messageLinePixels(fixture, line, summary, offset)?.glyphs.length ?? 0) > 0)
    .filter(offset => messageLineWrong(image, fixture, line, summary, offset, COLOUR.incoming).length === 0);
  expect(offsets).toHaveLength(1);
  expect(messageLineWrong(image, fixture, line, summary, offsets[0], COLOUR.speedAssist).length, 'another colour').toBeGreaterThan(0);
  await expectNoViolationOrDiagnostics(page);
  await resume(page);

  // Docked: the base page shows the same summary as the project's, under its G-05 note.
  await expect(page.getByTestId('mission-placeholder')).toHaveAttribute('data-gap', 'G-02/3', { timeout: 60_000 });
  await endPlaceholder(page, 'G-02/3', 'button');
  await expect(page.getByTestId('base-page')).toBeVisible();
  const g05 = page.locator('[data-testid="base-page"] .slice-gap[data-gap="G-05"]');
  await expect(g05).toBeVisible();
  await expect(g05).toContainText(SLICE_GAPS['G-05'].title);
  await expect(page.getByTestId('base-message-line')).toContainText(summary);
  await expect(page.getByTestId('base-message-line')).toHaveAttribute('data-origin', 'project');
  await expectNoViolationOrDiagnostics(page);
  await testInfo.attach('production-incoming', { body: JSON.stringify({ tick: state.tick, offset: offsets[0] }), contentType: 'application/json' });
});
