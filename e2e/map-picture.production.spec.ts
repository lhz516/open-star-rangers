import type { Page } from '@playwright/test';
import type { HeldGroup } from '../src/app/resources/resource-holder.ts';
import { RESOURCE_CACHE_DATABASE } from '../src/platform/storage/resource-cache-records.ts';
import { PRODUCTION_PACKAGE } from '../src/workers/production-package.ts';
import { button } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { startKeyboardFlight } from './support/keyboard-input.ts';
import { waitForBridge } from './support/map-warp.ts';
import {
  editCraftInfo, editMapGeometryOnly, editMapRectangle, editMission, expectCoreElements, expectMapPicture, expectMessageLine, expectNotEmptyOrFlight,
  hasCrosshairColour, mapContent, mapView, PREVIOUS_CONVERTER, readMapView, readStoredCache, screenPicture, waitForMapView, zoneLocked, ZONE,
  type MapContent, type MapView,
} from './support/map-picture.ts';
import { endPlaceholder, enterMission, missionEntry, missionFrame } from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';

// P3-13/28 (docs/plan/p3/13/subtasks/28-browser-map.md; spec 战略地图画面, DC-09, Δ-06; AC-02, AC-16, AC-20): the strategic
// map picture in the production build under its Content Security Policy, with the network audit on. Production has no
// test entry, so each case seeds its own isolated context with a synthetic mission package under the production identity
// (support/production-cache.ts), then restores and starts it through the real menu. Variants edit that package's payloads
// in Node (support/map-picture.ts): a player whose energy the flight drains to 0 (E = 0, `MAP_COST_UNAVAILABLE`, and the
// beacon message on the map's message line), and a smaller map whose information window overflows. Core's facts come from
// the mission's UI store, which the build keeps; the build has no diagnostics panel.

test.describe.configure({ timeout: 240_000 });
// Trace DOM snapshots evaluate in the page as user gestures (map-input.ts).
test.use({ trace: { mode: 'retain-on-failure', snapshots: false } });

const MAP_VIEW = 8;
const RESTORED = 'Mission loads into Core';

/** Records every `securitypolicyviolation` the document reports, before any page script runs. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { osrViolations: string[] }).osrViolations = seen;
    document.addEventListener('securitypolicyviolation', event => { seen.push(`${event.effectiveDirective} ${event.blockedURI}`); });
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { osrViolations: string[] }).osrViolations);

/** Seeds `groups` under the production key, restores them through the menu and starts the flight. */
async function flyPackage(page: Page, groups: readonly HeldGroup[]): Promise<void> {
  await recordViolations(page);
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await seedProductionCache(page, groups);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').getByText(RESTORED, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await startKeyboardFlight(page);
  await waitForBridge(page, view => view.context === 'flight' && view.map?.warpRequest === 'no-destination', 'The flight did not reach its player');
}

/** `m`, the map ready after its first picture and locked by `m`'s activation, then paused: Core's map and the picture. */
async function frozenMap(page: Page, accept: (view: MapView) => boolean = () => true) {
  await page.keyboard.press('m');
  await waitForMapView(page, view => view.viewMode === MAP_VIEW && view.map !== null && accept(view), 'The map did not open as expected');
  await expect.poll(() => zoneLocked(page)).toBe(true);
  await expect(page.getByTestId('input-status')).not.toContainText('Map input');
  await page.keyboard.press('p');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'paused');
  const image = await screenPicture(page);
  return { view: await mapView(page), image };
}

/** The picture checks every case shares: exactly Core's map, its elements, not empty, the message line, no crosshair. */
async function expectPicture(page: Page, content: MapContent, { view, image }: { view: MapView; image: Awaited<ReturnType<typeof screenPicture>> }, crowded = false) {
  expect(expectMapPicture(content, view, image, { labelsOn: false })).toBe(false);
  expectCoreElements(content, view, image, { crowded });
  expectNotEmptyOrFlight(content, view, image);
  expectMessageLine(content, view, image);
  expect(hasCrosshairColour(image)).toBe(false);
  await expect(page.getByTestId('flight-area').locator('canvas')).toHaveCount(1);
  expect(await page.locator(ZONE).evaluate(element => getComputedStyle(element).cursor)).not.toBe('crosshair');
}

test('the production map picture is Core\'s confirmed map in the map palette, ready after its first picture, with no project crosshair', async ({ page }) => {
  const groups = await missionPackage();
  await flyPackage(page, groups);
  const frozen = await frozenMap(page);
  await expectPicture(page, mapContent(groups), frozen);
  expect(frozen.view.map!.cursorCost.percent).not.toBeNull();
  expect(await violations(page)).toEqual([]);
});

test('E = 0: the cost reads as the project marker in the top band, and the beacon message shows on the map\'s message line (Δ-06)', async ({ page }, testInfo) => {
  // The player's speed costs energy (c88) quickly and its spare power (c58) allows full speed, so a few speed-up keys
  // drain the energy to 0, which starts the beacon message.
  const groups = editCraftInfo(await missionPackage(), info => ({
    ...info, craft: info.craft.map((craft, index) => (index === 0 ? { ...craft, at58: 2_000_000, at88: 2_000_000 } : craft)),
  }));
  await flyPackage(page, groups);
  for (let press = 0; press < 6; press++) await page.keyboard.press('Equal');
  await waitForBridge(page, view => view.energy === 0, 'The energy did not run out', 30_000);
  const frozen = await frozenMap(page, view => view.messageHead !== null);
  const { map, messageHead } = frozen.view;
  expect(map!.cursorCost).toMatchObject({ energy: 0, percent: null });
  expect(messageHead).not.toBeNull();
  await expectPicture(page, mapContent(groups), frozen);
  expect(await violations(page)).toEqual([]);
  await testInfo.attach('zero-energy', { contentType: 'application/json', body: JSON.stringify({ cost: map!.cursorCost, messageHead }) });
});

test('a smaller map\'s information window overflows: unit rows stop at its capacity, count rows draw past it', async ({ page }, testInfo) => {
  // The player, the hostile group and the bases placed by stored positions at the cursor's start point of an 80-pixel
  // map, whose 40-pixel information window holds 5 rows of the 8-pixel font: two units' 4 rows, then 2 count rows.
  const at = (x: number, y: number) => ({ x, y, z: 0 });
  const groups = editMapRectangle(editMission(await missionPackage(), mission => ({
    ...mission,
    declarations: mission.declarations.map(declaration => (declaration.index === 0 ? { ...declaration, position: at(-1400, -1400) }
      : declaration.index === 3 ? { ...declaration, position: at(-1400, -1385), placement: { region: null, anchor: null } }
      : declaration.index === 7 ? { ...declaration, position: at(2000, 2000) }
      : declaration.index === 8 ? { ...declaration, position: at(-1380, -1400) } : declaration)),
  })), { x0: 20, y0: 20, x1: 290, y1: 99 });
  await flyPackage(page, groups);
  const frozen = await frozenMap(page, view => (view.map?.information.rows.length ?? 0) > (view.map?.information.capacity ?? Infinity));
  const { information, geometry } = frozen.view.map!;
  expect(information.capacity).toBe(5);
  expect(information.rows.slice(0, 4).every(row => row.type !== 'count')).toBe(true);
  expect(information.rows.slice(information.capacity).every(row => row.type === 'count')).toBe(true);
  // The last row starts below the window (its outline at y + h), over the zoom window.
  expect(geometry.information.y + 4 + 8 * (information.rows.length - 1)).toBeGreaterThanOrEqual(geometry.information.y + geometry.information.height);
  await expectPicture(page, mapContent(groups), frozen, true);
  expect(await violations(page)).toEqual([]);
  await testInfo.attach('overflow', { contentType: 'application/json', body: JSON.stringify({ capacity: information.capacity, rows: information.rows.map(row => row.type) }) });
});

test('a saved package of the previous converter version is not offered; a current one restores and draws the map; the old record stays', async ({ page }) => {
  const groups = await missionPackage();
  await recordViolations(page);
  await page.goto('/');
  await seedProductionCache(page, groups, { sourceFingerprint: PRODUCTION_PACKAGE.sourceFingerprint, converterVersion: PREVIOUS_CONVERTER });
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await expect(button(page, 'Open saved resources')).toHaveCount(0);
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  const old = await page.evaluate(readStoredCache, RESOURCE_CACHE_DATABASE);
  expect(old.packages).toHaveLength(1);

  // The current version's package, saved beside it (as a new import would save it), restores and starts.
  await seedProductionCache(page, groups);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').getByText(RESTORED, { exact: true })).toBeVisible({ timeout: 30_000 });
  await startKeyboardFlight(page);
  await waitForBridge(page, view => view.context === 'flight' && view.map?.warpRequest === 'no-destination', 'The flight did not reach its player');
  const frozen = await frozenMap(page);
  expectMapPicture(mapContent(groups), frozen.view, frozen.image, { labelsOn: false });
  const after = await page.evaluate(readStoredCache, RESOURCE_CACHE_DATABASE);
  expect(after.packages).toHaveLength(2);
  expect(after.packages).toContainEqual(old.packages[0]);
  expect(await violations(page)).toEqual([]);
});

test('a map geometry that disagrees with the map record is refused before a run: no picture, and the structured reason shows (DC-02)', async ({ page }) => {
  // The geometry's rectangle moved one pixel; the slot-2 type-10 record keeps the old one. Core still loads the mission.
  const groups = editMapGeometryOnly(await missionPackage(), { x0: 22, y0: 45, x1: 611, y1: 444 });
  await recordViolations(page);
  await page.goto('/');
  await seedProductionCache(page, groups);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').getByText(RESTORED, { exact: true })).toBeVisible({ timeout: 30_000 });
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await expect(page.getByText('Starting the run failed while connecting the run\'s consumers.', { exact: false })).toBeVisible();
  await expect(page.getByText('path cockpitInstruments.slots[1].instruments[0].rectangle, reason must equal the map geometry rectangle', { exact: false })).toBeVisible();
  expect(await missionFrame(page)).toMatchObject({ run: null });
  await expect(page.getByTestId('flight-area')).toHaveCount(0);
  expect(await page.evaluate(readMapView)).toMatchObject({ map: null });
  expect(await violations(page)).toEqual([]);
});
