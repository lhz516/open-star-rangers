import type { CDPSession, Page } from '@playwright/test';
import type { HeldGroup } from '../src/app/resources/resource-holder.ts';
import { RESOURCE_CACHE_DATABASE } from '../src/platform/storage/resource-cache-records.ts';
import { button, openTestEntry, type TestEntryOptions } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
// The network audit allows no capability query on the test entry, so the fallback case runs without it.
import { test as plain } from './support/browser-test.ts';
import { pagePixels } from './support/flight-pictures.ts';
import { openKeyboardMenu, startKeyboardFlight } from './support/keyboard-input.ts';
import {
  canvasBox, differences, editMission, expectCoreElements, expectedMapIndices, expectMapPicture, expectMessageLine, expectNotEmptyOrFlight, fitsPeriod, hasCrosshairColour,
  labelChanges, labelColoursFree, mapContent, mapView, matchLabels, paint, pixelsOf, PREVIOUS_CONVERTER, quietly, readStoredCache, recordedLabels,
  recordLabels, restartLabelRecorder, screenPicture, tickAfter, viewModeFrame, waitForMapView, zoneLocked, zoomColoursFree, zoomInside, ZONE,
  type MapContent, type MapView,
} from './support/map-picture.ts';
import { mapWarpLog, waitForBridge } from './support/map-warp.ts';
import { missionEntry } from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';

// P3-13/28 (docs/plan/p3/13/subtasks/28-browser-map.md; spec 战略地图画面, 地图输入几何与指针, DC-09, Δ-09; AC-16, AC-17,
// AC-19, AC-20): the strategic map of the formal mission flow on the development test entry, which imports the synthetic
// `mission-startable` package through the real module Worker. Pictures are the composited page, compared with the map
// module drawing Core's confirmed `map` partition from the same synthetic content in Node, plus element checks keyed to
// Core's facts (support/map-picture.ts); Core's facts come from the UI store and the diagnostics panel. Input is real
// Chrome input and real Pointer Lock; Playwright's Escape cannot reach Chrome's native unlock, so the browser's own
// unlock is `document.exitPointerLock()` evaluated without a user gesture (as map-input.development.spec.ts does).

test.describe.configure({ timeout: 240_000 });
// Trace DOM snapshots evaluate in the page as user gestures, which would give it a user activation (map-input.ts).
test.use({ trace: { mode: 'retain-on-failure', snapshots: false } });

const MAP_VIEW = 8;
/** The uint32 seeds the test entry draws, one per world creation, so every run places the same world. */
const SEEDS = '251723777,251723778,251723779,251723780';
let content: MapContent | undefined;
const synthetic = async (): Promise<MapContent> => (content ??= mapContent(await missionPackage()));

const status = (page: Page) => page.getByTestId('mission-status');

/** The mouse's viewport position, which locked moves are relative to. */
const mouse = { x: 0, y: 0 };
async function moveTo(page: Page, x: number, y: number): Promise<void> {
  [mouse.x, mouse.y] = [x, y];
  await page.mouse.move(x, y);
}
const moveBy = (page: Page, dx: number, dy: number): Promise<void> => moveTo(page, mouse.x + dx, mouse.y + dy);

/**
 * Moves the unlocked mouse to the input zone's centre. When a lock ends, Chrome puts its pointer back where the lock
 * began, so locked moves are relative to a position set this way before each lock.
 */
async function toZoneCentre(page: Page): Promise<void> {
  const box = (await page.locator(ZONE).boundingBox())!;
  await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
}

/** Clicks at the input zone's centre. */
async function clickZone(page: Page): Promise<void> {
  await toZoneCentre(page);
  await page.mouse.down();
  await page.mouse.up();
}

/** From the menu: the run started in flight with the mouse placed (the page's first mouse event reports no movement). */
async function fly(page: Page, options: TestEntryOptions | null = {}): Promise<CDPSession> {
  if (options) await openKeyboardMenu(page, 'development', { seeds: SEEDS, ...options });
  await startKeyboardFlight(page);
  await toZoneCentre(page);
  await waitForBridge(page, candidate => candidate.map?.warpRequest === 'no-destination', 'The flight did not reach its player');
  return page.context().newCDPSession(page);
}

/**
 * The synthetic package with the player and the hostile group placed by stored positions at the map's start point (the
 * cursor's K point, main-map pixel 178, 154 of the synthetic geometry: world −4950, −10350, that is −297, −621 in the
 * mission's reference units), so the group fills the zoom window at every opening.
 */
async function groupAtStart(): Promise<HeldGroup[]> {
  const at = (x: number, y: number) => ({ x, y, z: 0 });
  return editMission(await missionPackage(), mission => ({
    ...mission,
    declarations: mission.declarations.map(declaration => (declaration.index === 0 ? { ...declaration, position: at(-297, -621) }
      : declaration.index === 3 ? { ...declaration, position: at(-285, -610), placement: { region: null, anchor: null } } : declaration)),
  }));
}

/**
 * Seeds this test's own context with `groups` under the test entry's package key (the `mission-startable` disc's), then
 * restores them through the main menu, until the mission entry admits them.
 */
async function restoreVariant(page: Page, groups: readonly HeldGroup[], options: TestEntryOptions = {}): Promise<void> {
  await openTestEntry(page, { worker: 'mission-startable', seeds: SEEDS, ...options });
  const { sourceFingerprint, converterVersion } = await page.evaluate(() => window.osrTestEntry!.profile);
  await seedProductionCache(page, groups, { sourceFingerprint, converterVersion });
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').getByText('Mission loads into Core', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
}

/** `m` in the focused input zone: Core's open map. */
async function openTheMap(page: Page): Promise<MapView> {
  await page.keyboard.press('m');
  return waitForMapView(page, view => view.viewMode === MAP_VIEW && view.map !== null, 'm did not open the map');
}

/** Pauses with `p`, which also ends the lock (the unlocked mouse goes back to the zone's centre). */
async function pause(page: Page): Promise<void> {
  await page.keyboard.press('p');
  await expect(status(page)).toHaveAttribute('data-phase', 'paused');
  await expect.poll(() => zoneLocked(page)).toBe(false);
  await toZoneCentre(page);
}

async function resume(page: Page): Promise<void> {
  await page.keyboard.press('p');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
}

/** The map pointer-locked: at once when the qualification found a user activation, otherwise by a first click. */
async function locked(page: Page): Promise<void> {
  await expect.poll(async () => (await zoneLocked(page)) || (await page.getByTestId('input-status').innerText()).includes('Click the map')).toBe(true);
  if (!await zoneLocked(page)) await clickZone(page);
  await expect.poll(() => zoneLocked(page)).toBe(true);
}

/** Moves the locked pointer by whole logical pixels until Core's cursor is at `pixel` of the main map. */
async function pointAt(page: Page, pixel: { readonly column: number; readonly row: number }): Promise<MapView> {
  const { scale, scaleY } = await canvasBox(page);
  const from = (await mapView(page)).map!.cursor.pixel;
  await moveBy(page, (pixel.column - from.column) * scale, (pixel.row - from.row) * scaleY);
  return waitForMapView(page, candidate => candidate.map?.cursor.pixel.column === pixel.column && candidate.map.cursor.pixel.row === pixel.row,
    `The cursor did not follow the locked pointer to ${JSON.stringify(pixel)}`);
}

/** Points at the hostile group (or, once none shows, the player and wingman), so its members fill the zoom window. */
async function pointAtHostiles(page: Page): Promise<MapView> {
  const { contacts } = (await mapView(page)).map!;
  const group = contacts.find(contact => contact.class === 'hostile' && contact.inWorld) ?? contacts.find(contact => contact.class === 'player')!;
  return pointAt(page, group.pixel);
}

/** The run's tick as the store shows it. */
const tickOf = async (page: Page): Promise<number> => (await mapView(page)).tick!;

/** Waits until the run's tick reaches `tick`. */
const untilTick = (page: Page, tick: number) => expect.poll(() => tickOf(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(tick);

/** The map's picture frozen by a pause, with Core's map then. */
async function frozen(page: Page): Promise<{ view: MapView; image: Awaited<ReturnType<typeof screenPicture>> }> {
  await pause(page);
  const image = await screenPicture(page);
  return { view: await mapView(page), image };
}

test('the map picture is Core\'s confirmed map in the map palette, with sprites, discs, labels, spread zoom icons, the multi-select box and no project crosshair', async ({ page }, testInfo) => {
  const map = await synthetic();
  await fly(page);
  await openTheMap(page);
  // Production geometry: the first map picture is drawn, then the input is ready and, with `m`'s activation, locks.
  await locked(page);
  await expect(page.getByTestId('input-status')).not.toContainText('Map input');
  expect(await page.locator(ZONE).evaluate(element => (element as HTMLElement).style.cursor)).toBe('none');

  await pointAtHostiles(page);
  let { view, image } = await frozen(page);
  const first = view.map!;
  expect(expectMapPicture(map, view, image, { labelsOn: false })).toBe(false);
  expectCoreElements(map, view, image);
  expectNotEmptyOrFlight(map, view, image);
  expectMessageLine(map, view, image);
  // One canvas: no project crosshair canvas, and no pixel in its colour.
  await expect(page.getByTestId('flight-area').locator('canvas')).toHaveCount(1);
  expect(hasCrosshairColour(image)).toBe(false);
  // Core gives zoom pixels whose icons overlap; the picture spreads them (`0x4b56c`, inside the full match above).
  const members = first.zoomMembers;
  expect(members.some((one, index) => members.slice(index + 1).some(other =>
    Math.abs(one.pixel.column - other.pixel.column) <= 5 && Math.abs(one.pixel.row - other.pixel.row) <= 5)), 'overlapping zoom icons').toBe(true);
  expect(first.labels.length).toBeGreaterThan(0);
  expect(first.contacts.some(contact => contact.class === 'hostile' && contact.coverage?.style === 'ring')).toBe(true);

  // A real select on the hostile group: move the locked pointer onto it and click; Core boxes the members near it.
  await resume(page);
  await locked(page);
  view = await pointAtHostiles(page);
  const target = { pixel: view.map!.cursor.pixel };
  await page.mouse.down();
  await page.mouse.up();

  await waitForMapView(page, candidate => candidate.map?.markerEntityId !== null && candidate.map?.destination !== null, 'The click selected no destination');
  ({ view, image } = await frozen(page));
  const selected = view.map!;
  expect(selected.destination!.pixel).toEqual(target.pixel);
  expect(selected.zoomMembers.filter(member => member.boxed).length, 'a multi-select box').toBeGreaterThan(1);
  expect(expectMapPicture(map, view, image, { labelsOn: false })).toBe(false);
  expectCoreElements(map, view, image);
  // The boxes' colour (0xD) inside the zoom window, when no zoom icon shown there uses it (the full match covers them anyway).
  const zoomKinds = selected.contacts.filter(contact => selected.zoomMembers.some(member => member.entityId === contact.entityId)).map(({ kindBit }) => kindBit);
  if (zoomColoursFree(map, zoomKinds, [0x0d])) {
    expect(pixelsOf(map, image, zoomInside(selected), [0x0d]).length, 'selection boxes in the zoom window').toBeGreaterThan(0);
  }
  await testInfo.attach('map-picture', {
    contentType: 'application/json',
    body: JSON.stringify({
      first: { tick: view.tick, cursor: first.cursor.pixel, members: first.zoomMembers.length, labels: first.labels.length },
      selected: { destination: selected.destination, boxed: selected.zoomMembers.filter(member => member.boxed).length },
    }),
  });
});

test('right button: held, the labels toggle at the first read and every 16 ticks; a reopened map clears them but carries the count', async ({ page }, testInfo) => {
  const map = await synthetic();
  // Labels draw beside the zoom members other than the player: here the hostile group fills the window at every opening.
  await restoreVariant(page, await groupAtStart());
  await fly(page, null);
  const view = await openTheMap(page);
  await locked(page);
  expect(view.map!.zoomMembers.filter(member => member.distance !== null).length).toBeGreaterThan(0);
  expect(labelColoursFree(map, view.map!.contacts.map(({ kindBit }) => kindBit)), 'label colours tell the labels apart').toBe(true);
  await recordLabels(page, map, view.map!);

  // Held: on at the first read after the press, then every 16 ticks (DC-09's two calls), not every 20. Each change lies
  // in a range of ticks between the store's published ticks (frameTicks).
  await page.mouse.down({ button: 'right' });
  await expect.poll(async () => labelChanges((await recordedLabels(page)).samples).length, { timeout: 15_000, intervals: [5] }).toBeGreaterThanOrEqual(4);
  await page.mouse.up({ button: 'right' });
  let { samples, presses } = await recordedLabels(page);
  const press = tickAfter(samples, presses[0]);
  const held = labelChanges(samples, presses[0]).slice(0, 4);
  expect(held.map(({ shown }) => shown)).toEqual([true, false, true, false]);
  // The first tick the press reaches is at most one after the next frame's (a frame may run no tick), and a read comes
  // every 4 ticks, so the first toggle falls within 4 ticks after that frame's; one more allows for a frame's late tick.
  expect(held[0].tick, 'not before the press').toBeGreaterThanOrEqual(press.low);
  expect(held[0].after + 1 - press.high, 'the first read after the press').toBeLessThanOrEqual(5);
  expect(fitsPeriod(held, 16), JSON.stringify(held)).toBe(true);
  expect(fitsPeriod(held, 20)).toBe(false);
  // Released: nothing more toggles.
  const released = (await mapView(page)).tick!;
  await untilTick(page, released + 40);
  ({ samples } = await recordedLabels(page));
  expect(labelChanges(samples, samples.find(sample => sample.tick !== null && sample.tick > released + 1)!.time)).toEqual([]);

  // Toggled and closed at once: the count stays (nothing counts it down outside the map). Reopened, the labels are off,
  // and a new press waits for the carried count. Few in-map ticks may pass between the toggle and the new press, or
  // the count runs out: a cycle that took more than 4 is tried again.
  const cycles: unknown[] = [];
  let carried: { tick: number; after: number; shown: boolean } | null = null;
  for (let attempt = 0; attempt < 6 && carried === null; attempt++) {
    await untilTick(page, (await tickOf(page)) + 24);
    await page.mouse.down({ button: 'right' });
    await toggledSincePress(page);
    await page.mouse.up({ button: 'right' });
    await page.keyboard.press('m');
    await waitForMapView(page, candidate => candidate.viewMode !== MAP_VIEW, 'm did not close the map');
    ({ samples, presses } = await recordedLabels(page));
    const toggled = labelChanges(samples, presses.at(-1)!)[0];
    const closed = viewModeFrame(samples, MAP_VIEW, presses.at(-1)!, true);
    await untilTick(page, closed.tick + 30);
    await page.keyboard.press('m');
    await expect.poll(() => zoneLocked(page), { timeout: 5_000, intervals: [5] }).toBe(true);
    await page.mouse.down({ button: 'right' });
    await toggledSincePress(page);
    await page.mouse.up({ button: 'right' });
    ({ samples, presses } = await recordedLabels(page));
    const reopened = viewModeFrame(samples, MAP_VIEW, closed.time);
    const pressAgain = tickAfter(samples, presses.at(-1)!);
    const change = labelChanges(samples, presses.at(-1)!)[0];
    const budget = (closed.tick - (toggled.after + 1)) + (pressAgain.high - (reopened.after + 1));
    cycles.push({ toggled, closed, reopened, pressAgain, change, budget });
    if (budget > 4) continue;
    // The opening cleared the labels: every frame read from the opening until the press's toggle shows none.
    expect(change.shown).toBe(true);
    const shownAgain = samples.find(sample => sample.time > presses.at(-1)! && sample.shown === true)!.time;
    const cleared = samples.filter(({ time, shown }) => time >= reopened.time && time < shownAgain && shown !== null);
    expect(cleared.length, 'frames read between the opening and the toggle').toBeGreaterThan(0);
    expect(cleared.map(({ shown }) => shown)).not.toContain(true);
    // A count reset at the opening would toggle at the first read, within 5 ticks after the press's frame (as above);
    // the count carried from the earlier toggle (20, less at most 1.25 a tick of the ≤ 4 in-map ticks and the closing
    // read and opening draw) holds it back about 9 ticks.
    expect(change.after + 1 - pressAgain.high, 'the carried count delays the toggle').toBeGreaterThan(5);
    carried = change;
  }
  await recordedLabels(page, true);
  expect(carried, `a close and reopen within 4 in-map ticks: ${JSON.stringify(cycles)}`).not.toBeNull();
  await testInfo.attach('right-button', { contentType: 'application/json', body: JSON.stringify({ press, held, released, cycles }) });
});

/** The Warp destinations Core logged (development panel), oldest first. */
const destinationsSet = async (page: Page) => (await mapWarpLog(page)).filter(entry => entry.type === 'warp-destination-set');

test('the first click locks without selecting, a held left button repeats selects, and m and two Escapes close the map', async ({ page }, testInfo) => {
  const cdp = await fly(page);
  await openTheMap(page);
  await locked(page);
  // The browser ends the lock (as Chrome's own Escape would): the map stays open and waits for a click.
  await quietly(cdp, 'document.exitPointerLock()');
  await expect(page.getByTestId('input-status')).toContainText('Click the map to lock the pointer.');
  expect((await mapView(page)).viewMode).toBe(MAP_VIEW);
  const tick = await tickOf(page);
  await clickZone(page);
  await expect.poll(() => zoneLocked(page)).toBe(true);
  await untilTick(page, tick + 12);
  expect(await destinationsSet(page), 'the locking click selected nothing').toEqual([]);
  expect((await mapView(page)).map!.destination).toBeNull();

  // Held, the left button selects at once and again every repeat interval (8 clock units, 4 ticks); released, it stops.
  await page.mouse.down();
  await expect.poll(async () => (await destinationsSet(page)).length, { timeout: 5_000 }).toBeGreaterThanOrEqual(4);
  await page.mouse.up();
  const released = await tickOf(page);
  const repeats = await destinationsSet(page);
  const gaps = repeats.slice(1).map((entry, index) => entry.tick - repeats[index].tick);
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(4);
  expect(Math.max(...gaps.slice(0, 3))).toBeLessThanOrEqual(5);
  await untilTick(page, released + 16);
  const after = await destinationsSet(page);
  expect(after.length - repeats.length).toBeLessThanOrEqual(1);
  await untilTick(page, (await tickOf(page)) + 16);
  expect(await destinationsSet(page)).toHaveLength(after.length);

  // m closes the map and opens it again, locked at once by its activation.
  await page.keyboard.press('m');
  await waitForMapView(page, view => view.viewMode !== MAP_VIEW, 'm did not close the map');
  await expect.poll(() => zoneLocked(page)).toBe(false);
  await openTheMap(page);
  await expect.poll(() => zoneLocked(page)).toBe(true);
  // A page-delivered Escape does not unlock or close the locked map; after the browser's unlock, a second one closes
  // it, without the mission menu.
  await page.keyboard.press('Escape');
  await untilTick(page, (await tickOf(page)) + 8);
  expect(await zoneLocked(page)).toBe(true);
  expect((await mapView(page)).viewMode).toBe(MAP_VIEW);
  await quietly(cdp, 'document.exitPointerLock()');
  await expect(page.getByTestId('input-status')).toContainText('Click the map to lock the pointer.');
  await page.keyboard.press('Escape');
  await waitForMapView(page, view => view.viewMode !== MAP_VIEW, 'The second Escape did not close the map');
  await expect(page.getByTestId('mission-menu')).toHaveCount(0);
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await testInfo.attach('left-repeat', { contentType: 'application/json', body: JSON.stringify({ ticks: repeats.map(entry => entry.tick), gaps }) });
});

/**
 * A whole CSS pixel (Chrome gives mouse events whole CSS pixels) near the centre of main-map pixel (`column`, `row`),
 * the one farthest from a pixel boundary, and the main-map pixel it lies in, computed here from the canvas's box (the
 * shown frame).
 */
async function clientOf(page: Page, map: MapView['map'], column: number, row: number) {
  const { left, top, scale, scaleY } = await canvasBox(page);
  const { main } = map!.geometry;
  // Prefer points in the pixel itself, then the most central.
  const nearest = (origin: number, logical: number, scale: number) => {
    const centre = origin + (logical + 0.5) * scale;
    const at = (css: number) => (css - origin) / scale;
    const rank = (css: number) => (Math.floor(at(css)) === logical ? 0 : 1) + Math.abs((at(css) % 1) - 0.5);
    return [Math.floor(centre) - 1, Math.floor(centre), Math.ceil(centre), Math.ceil(centre) + 1].sort((a, b) => rank(a) - rank(b))[0];
  };
  const [x, y] = [nearest(left, main.x + column, scale), nearest(top, main.y + row, scaleY)];
  return { x, y, pixel: { column: Math.floor((x - left) / scale) - main.x, row: Math.floor((y - top) / scaleY) - main.y } };
}

/**
 * Clicks near main-map pixel (`column`, `row`) in the unlocked fallback; expects Core's destination at the pixel the
 * point lies in (some pixels have no whole CSS pixel below a scale of 1), near the one asked for; resolves to it.
 */
async function selectAt(page: Page, column: number, row: number): Promise<{ column: number; row: number }> {
  const before = (await destinationsSet(page)).length;
  const { map } = await mapView(page);
  const last = map!.geometry.main.width - 1;
  const { x, y, pixel } = await clientOf(page, map, column, row);
  const { scale, scaleY } = await canvasBox(page);
  await moveTo(page, x, y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await destinationsSet(page)).length).toBeGreaterThan(before);
  const { fields } = (await destinationsSet(page)).at(-1)!;
  const selected = { column: Number(fields.column), row: Number(fields.row) };
  expect(selected, 'the pixel under the point; the right and bottom edges clamp').toEqual({ column: Math.min(pixel.column, last), row: Math.min(pixel.row, last) });
  expect(Math.max(Math.abs(selected.column - column), Math.abs(selected.row - row)), 'near the pixel asked for')
    .toBeLessThanOrEqual(Math.ceil(2 / Math.min(scale, scaleY)));
  return selected;
}

/** Clicks the client point and expects no select over 8 ticks. */
async function selectsNothingAt(page: Page, x: number, y: number): Promise<void> {
  const before = (await destinationsSet(page)).length;
  await moveTo(page, x, y);
  await page.mouse.down();
  await page.mouse.up();
  await untilTick(page, (await tickOf(page)) + 8);
  expect(await destinationsSet(page)).toHaveLength(before);
}

plain('the unlocked fallback maps the page to the main map through its edges, black bars, a container offset, full screen and a narrower window', async ({ page }, testInfo) => {
  const cdp = await fly(page, { pointerLock: 'unsupported' });
  const view = await openTheMap(page);
  await expect(page.getByTestId('input-status')).toContainText('Pointer Lock is unavailable');
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement), 'full screen since the Start click').toBe(true);
  const side = view.map!.geometry.main.width;
  const reads: unknown[] = [];

  // Inside and at the corners. The continuous right edge (the last column + 1) still belongs to the main map and clamps
  // to its last column; a point past it, or above the top row, selects nothing.
  for (const [column, row] of [[100, 50], [0, 0], [side - 1, side - 1], [side - 1, 0], [0, side - 1]]) await selectAt(page, column, row);
  const { left, top, scale, scaleY } = await canvasBox(page);
  const { main } = view.map!.geometry;
  const [edge, middle] = [left + (main.x + side) * scale, Math.round(top + (main.y + 200.5) * scaleY)];
  if (Number.isInteger(edge)) {
    await moveTo(page, edge, middle);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(async () => (await destinationsSet(page)).at(-1)?.fields.column).toBe(String(side - 1));
  }
  await selectsNothingAt(page, Math.floor(edge) + 1, middle);
  await selectsNothingAt(page, Math.round(left + (main.x + 200.5) * scale), Math.ceil(top + main.y * scaleY) - 1);
  reads.push({ layout: 'default', canvas: await canvasBox(page) });

  // Black bars and a container offset: a test style sheet widens the game view to 2:1 with uneven borders and a margin,
  // so the surface letterboxes the 4:3 picture inside the input zone.
  await page.addStyleTag({ content: '.mission-view { aspect-ratio: 2 / 1 !important; max-width: 60rem !important; margin-left: 37px !important; border-width: 9px 3px 5px 21px !important; }' });
  await expect.poll(async () => (await canvasBox(page)).left - (await page.locator(ZONE).boundingBox())!.x, { message: 'a bar on the left' }).toBeGreaterThan(10);
  const zone = (await page.locator(ZONE).boundingBox())!;
  const canvas = await canvasBox(page);
  expect(await pagePixels(page, [[zone.x + 4, zone.y + zone.height / 2], [zone.x + zone.width - 4, zone.y + zone.height / 2]])).toEqual([[0, 0, 0], [0, 0, 0]]);
  await selectsNothingAt(page, zone.x + 4, zone.y + zone.height / 2);
  await selectAt(page, 250, 300);
  await selectAt(page, side - 1, 0);
  reads.push({ layout: 'bars', zone, canvas });

  // The Start click asked for full screen of the whole document; outside it, with the bars still there, the same holds.
  await quietly(cdp, 'document.exitFullscreen()');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await selectAt(page, 310, 20);
  reads.push({ layout: 'bars, not full screen', canvas: await canvasBox(page) });

  // A narrower window scales the picture down (CSS px per logical px below 1): the same mapping holds.
  await page.setViewportSize({ width: 560, height: 800 });
  await expect.poll(async () => (await canvasBox(page)).scale).toBeLessThan(0.9);
  for (const [column, row] of [[123, 45], [side - 1, side - 1], [0, 7]]) await selectAt(page, column, row);
  reads.push({ layout: 'bars, narrow window', canvas: await canvasBox(page) });
  await page.setViewportSize({ width: 1280, height: 800 });
  await testInfo.attach('fallback-geometry', { contentType: 'application/json', body: JSON.stringify(reads) });
});

test.describe('at pixel ratio 2', () => {
  // Chrome's emulated pixel ratio change fires no `resolution` media query change, so the ratio is the context's own.
  test.use({ deviceScaleFactor: 2 });

  test('the locked map draws the same logical picture at device pixels and moves by CSS pixels', async ({ page }) => {
    const content = await synthetic();
    await fly(page);
    await openTheMap(page);
    await locked(page);
    await expect.poll(() => page.getByTestId('flight-area').locator('canvas').evaluate(element => (element as HTMLCanvasElement).width / element.getBoundingClientRect().width)).toBe(2);
    const { view: start } = { view: await mapView(page) };
    const view = await pointAtHostiles(page);
    expect(view.map!.cursor.pixel).not.toEqual(start.map!.cursor.pixel);
    const { view: still, image } = await frozen(page);
    expect(expectMapPicture(content, still, image, { labelsOn: false })).toBe(false);
    expectCoreElements(content, still, image);
    expect(hasCrosshairColour(image)).toBe(false);
  });
});

/** The page's clock, for the label recorder's times. */
const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());

/** Waits until the label recorder saw a change after the last right-button press. */
async function toggledSincePress(page: Page): Promise<void> {
  await expect.poll(async () => {
    const { samples, presses } = await recordedLabels(page);
    return labelChanges(samples, presses.at(-1)!).length;
  }, { timeout: 5_000, intervals: [5] }).toBeGreaterThanOrEqual(1);
}

test('locked, a focus loss, the browser\'s unlock or a pause ends the lock and clears the right-button level until a new press (Δ-09)', async ({ page }, testInfo) => {
  const map = await synthetic();
  await restoreVariant(page, await groupAtStart());
  const cdp = await fly(page, null);
  const view = await openTheMap(page);
  await locked(page);
  await recordLabels(page, map, view.map!);
  const outcomes: Record<string, number> = {};

  /** Holds the right button through a toggle, `lose` and `regain`, then expects no toggle for 40 ticks while held. */
  const heldThrough = async (name: string, lose: () => Promise<void>, regain: () => Promise<void>) => {
    // The group moves; pointing at it keeps members to label in the zoom window.
    await pointAtHostiles(page);
    await page.mouse.down({ button: 'right' });
    await toggledSincePress(page);
    await lose();
    await regain();
    await expect.poll(() => zoneLocked(page)).toBe(true);
    await restartLabelRecorder(page);
    const [from, tick] = [await now(page), await tickOf(page)];
    await untilTick(page, tick + 40);
    const { samples } = await recordedLabels(page);
    const read = samples.filter(sample => sample.time > from && sample.shown !== null).length;
    outcomes[name] = read;
    expect(read, `${name}: frames read`).toBeGreaterThan(20);
    expect(labelChanges(samples, from), `${name}: still held, the button no longer counts`).toEqual([]);
    await page.mouse.up({ button: 'right' });
  };

  // Focus: the zone loses it (the map is suspended and unlocks); refocused without a gesture, a click locks again.
  await heldThrough('blur', async () => {
    await quietly(cdp, `document.querySelector('${ZONE}').blur()`);
    await expect.poll(() => zoneLocked(page)).toBe(false);
  }, async () => {
    await quietly(cdp, `document.querySelector('${ZONE}').focus()`);
    await clickZone(page);
  });
  // The lock: the browser ends it; a click locks again.
  await heldThrough('unlock', async () => {
    await quietly(cdp, 'document.exitPointerLock()');
    await expect.poll(() => zoneLocked(page)).toBe(false);
  }, () => locked(page));
  // The run: paused and resumed.
  await heldThrough('pause', () => pause(page), async () => {
    await resume(page);
    await locked(page);
  });

  // A new press counts again.
  await pointAtHostiles(page);
  await page.mouse.down({ button: 'right' });
  await toggledSincePress(page);
  await page.mouse.up({ button: 'right' });
  await recordedLabels(page, true);
  await testInfo.attach('right-level', { contentType: 'application/json', body: JSON.stringify(outcomes) });
});

test('the old cost never follows an unconfirmed pointer: a picture drawn before Core confirms a move shows the pointer there and the readings at Core\'s cursor', async ({ page }, testInfo) => {
  const map = await synthetic();
  await restoreVariant(page, await groupAtStart());
  await fly(page, null);
  await openTheMap(page);
  await locked(page);
  const attempts: unknown[] = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    // 48 logical px: the cost text (6 glyphs of 6 px) at the cursor and at the pointer cannot overlap.
    const step = attempt % 2 === 0 ? 48 : -48;
    const { scale } = await canvasBox(page);
    // Move, let one frame draw (its ticks ran before the input submitted the move's hover), then pause at once.
    await moveBy(page, step * scale, 0);
    await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(resolve); }));
    await page.keyboard.press('p');
    await expect(status(page)).toHaveAttribute('data-phase', 'paused');
    await expect.poll(() => zoneLocked(page)).toBe(false);
    await toZoneCentre(page);
    const image = await screenPicture(page);
    const view = await mapView(page);
    const cursor = view.map!.cursor.pixel;
    const local = { column: cursor.column + step, row: cursor.row };
    const ahead = matchLabels(map, view, image, local).labelsOn;
    const confirmed = matchLabels(map, view, image).labelsOn;
    attempts.push({ attempt, tick: view.tick, cursor, ahead, confirmed });
    // Every frozen picture is one of the two: the pointer at Core's cursor, or a step ahead with Core's readings.
    expect(ahead !== null || confirmed !== null, `attempt ${attempt}: the picture is neither`).toBe(true);
    if (ahead !== null) {
      // Core's cost, line and zoom stayed at the confirmed cursor while the pointer box and record 26 moved. Negative
      // control: the same picture with the cost text and the line's end moved to the pointer differs from the page.
      expectCoreElements(map, view, image);
      const open = view.map!;
      const following: MapView = { ...view, map: { ...open, cursor: { ...open.cursor, pixel: local }, line: { ...open.line, to: local } } };
      expect(differences(image, paint(expectedMapIndices(map, following, { labelsOn: ahead, pointer: local }), map.mapPalette), [map.messageRect]).length,
        'readings following the pointer differ').toBeGreaterThan(0);
      break;
    }
    await resume(page);
    await locked(page);
  }
  await testInfo.attach('unconfirmed-pointer', { contentType: 'application/json', body: JSON.stringify(attempts) });
  expect(attempts.some(entry => (entry as { ahead: boolean | null }).ahead !== null), 'a picture ahead of Core was caught').toBe(true);
});

test('an old converter version\'s synthetic map package is not offered, and a new import restores the map; the old records stay', async ({ page }, testInfo) => {
  const map = await synthetic();
  await openTestEntry(page, { worker: 'mission-startable', seeds: SEEDS });
  const { sourceFingerprint } = await page.evaluate(() => window.osrTestEntry!.profile);
  await seedProductionCache(page, await missionPackage(), { sourceFingerprint, converterVersion: PREVIOUS_CONVERTER });
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await expect(button(page, 'Open saved resources')).toHaveCount(0);
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  const old = await page.evaluate(readStoredCache, RESOURCE_CACHE_DATABASE);
  expect(old.packages).toHaveLength(1);
  expect(old.packages[0].key).toContain(PREVIOUS_CONVERTER);

  // A new import of the same synthetic disc recovers: the mission starts and the map draws Core's map.
  await fly(page);
  await openTheMap(page);
  await locked(page);
  const { view, image } = await frozen(page);
  expectMapPicture(map, view, image, { labelsOn: false });
  const after = await page.evaluate(readStoredCache, RESOURCE_CACHE_DATABASE);
  expect(after.packages.find(entry => entry.key === old.packages[0].key), 'the old record is neither migrated nor deleted').toEqual(old.packages[0]);
  expect(after.packages.length).toBeGreaterThanOrEqual(1);
  await testInfo.attach('cache', { contentType: 'application/json', body: JSON.stringify({ old, after }) });
});

plain('in the unlocked fallback the right button counts only on the main map; leaving it, losing the focus or pausing clears the level (Δ-09)', async ({ page }, testInfo) => {
  const map = await synthetic();
  await restoreVariant(page, await groupAtStart(), { pointerLock: 'unsupported' });
  const cdp = await fly(page, null);
  const view = await openTheMap(page);
  const fallback = page.getByTestId('input-status');
  await expect(fallback).toContainText('Pointer Lock is unavailable');
  const side = view.map!.geometry.main.width;
  // The pointer on the cursor's start point keeps the group in the zoom window; beside the main map is the
  // information window, still in the qualified zone.
  const home = await clientOf(page, view.map, view.map!.cursor.pixel.column, view.map!.cursor.pixel.row);
  const beside = await clientOf(page, view.map, side + 60, 100);
  await moveTo(page, home.x, home.y);
  await recordLabels(page, map, view.map!);
  const outcomes: Record<string, number> = {};

  /** Waits 40 ticks from now and expects no label change in them, from frames that were read. */
  const quiet = async (name: string) => {
    await restartLabelRecorder(page);
    const [from, tick] = [await now(page), await tickOf(page)];
    await untilTick(page, tick + 40);
    const { samples } = await recordedLabels(page);
    outcomes[name] = samples.filter(sample => sample.time > from && sample.shown !== null).length;
    expect(outcomes[name], `${name}: frames read`).toBeGreaterThan(20);
    expect(labelChanges(samples, from), `${name}: no toggle`).toEqual([]);
  };
  /** Presses on the main map and waits for its toggle, after the count ran out. */
  const toggleHeld = async () => {
    await untilTick(page, (await tickOf(page)) + 24);
    await moveTo(page, home.x, home.y);
    await page.mouse.down({ button: 'right' });
    await toggledSincePress(page);
  };

  // Beside the main map a press does not count.
  await moveTo(page, beside.x, beside.y);
  await page.mouse.down({ button: 'right' });
  await quiet('beside');
  await page.mouse.up({ button: 'right' });
  // Held on the main map it does; moved off it and back, still held, it no longer does.
  await toggleHeld();
  await moveTo(page, beside.x, beside.y);
  await moveTo(page, home.x, home.y);
  await quiet('left the main map');
  await page.mouse.up({ button: 'right' });
  // Held through a focus loss: the map is suspended, focused again it qualifies without a lock.
  await toggleHeld();
  await quietly(cdp, `document.querySelector('${ZONE}').blur()`);
  await expect(fallback).not.toContainText('Pointer Lock is unavailable');
  await quietly(cdp, `document.querySelector('${ZONE}').focus()`);
  await expect(fallback).toContainText('Pointer Lock is unavailable');
  await quiet('blur');
  await page.mouse.up({ button: 'right' });
  // Held through a pause.
  await toggleHeld();
  await page.keyboard.press('p');
  await expect(status(page)).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('p');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(fallback).toContainText('Pointer Lock is unavailable');
  await quiet('pause');
  await page.mouse.up({ button: 'right' });
  // A new press on the main map counts again.
  await toggleHeld();
  await page.mouse.up({ button: 'right' });
  await recordedLabels(page, true);
  await testInfo.attach('fallback-right-level', { contentType: 'application/json', body: JSON.stringify(outcomes) });
});
