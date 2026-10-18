import type { Page } from '@playwright/test';
import { PREVIEW_CONTENT_SECURITY_POLICY } from '../tools/preview-csp.ts';
import { button } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { expectF1Background, flightPicture, flyMission, pauseFlight } from './support/flight-flow.ts';
import { expectFlightCanvas, expectStableTick, missionEntry } from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';

// P3-12/25 (docs/plan/p3/12/spec.md, 验证策略; AC-16, AC-22, AC-23): the flight picture of the production build under
// the preview's strict content security policy and the network audit. The synthetic mission package is seeded under
// the production identity in the test's own context and restored through the real menu (production-cache.ts); the
// expectation of the F1 picture is computed independently (support/flight-flow.ts).

test.describe.configure({ timeout: 180_000 });

const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

/** Records every `securitypolicyviolation` of the page's documents. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { osrViolations: string[] }).osrViolations = seen;
    document.addEventListener('securitypolicyviolation', event => { seen.push(`${event.effectiveDirective} ${event.blockedURI}`); });
  });
}

test('the production flight picture is the start nebula, stars and dust, with no policy violation, request or diagnostics', async ({ page }, testInfo) => {
  const mission = missionPackage();
  await recordViolations(page);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  await seedProductionCache(page, await mission);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });

  await flyMission(page);
  await pauseFlight(page);
  await expectStableTick(page, 300);
  await expectFlightCanvas(page);
  const background = expectF1Background(await flightPicture(page));
  expect(await page.locator('[data-testid="mission-dev-panel"], [data-testid^="dev-"]').count()).toBe(0);
  await button(page, 'Resume').click();
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { osrViolations: string[] }).osrViolations)).toEqual([]);
  await testInfo.attach('production-flight', { body: JSON.stringify(background), contentType: 'application/json' });
});
