import { expect, test } from './support/browser-test.ts';
import {
  clientPoint, cursorPixels, expectCursorAt, expectNoCursor, kStart, MapEntry, points, positionAt, selects, ZONE, type MapInputEntryState,
} from './support/map-input.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';
import type { MapInputGeometry, MapPosition } from '../src/render/map/map-input-geometry.ts';

// P3-05 subtask 27 (docs/plan/p3/05/subtasks/27-map-input-entry.md): the production map input, cursor drawer, geometry
// and Pointer Lock port in the isolated development entry, in Chrome (spec 战略地图输入; S-11; AC-12, and the browser
// parts of AC-09, AC-13 and AC-16). What the entry makes synthetic is listed in its script: the map context, the owner's
// input context, the geometry, and the Pointer Lock host's pending and refused answers. Bindings and policy are production.
// It is not the real mission's map path, and its project crosshair cursor stays only here: the production map draws the
// original pointer in its own picture (P3-13; e2e/map-picture.*.spec.ts). Pointer Lock is real Chrome Pointer Lock (it
// works headless on an http origin); Playwright's Escape does not reach Chrome's native unlock, so the browser's own
// unlock is `document.exitPointerLock()` from outside the input, observed through actual `pointerlockchange` events;
// subtask 30 checks the native Esc.

// Trace DOM snapshots evaluate in the page as user gestures, which would give it a user activation before any input.
test.use({ trace: { mode: 'retain-on-failure', snapshots: false } });

/** Three repeat intervals of clock units: long enough that a repeat still running would have selected again. */
const QUIET = 24;

test('the manual entry uses production Escape to close the unlocked map without opening a menu', async ({ page }) => {
  const entry = await MapEntry.load(page, { manual: true });
  await page.getByRole('button', { name: 'Open unlocked map', exact: true }).click();
  const zone = page.locator(ZONE);
  await expect(zone).toBeFocused();
  await entry.waitForMap('unlocked');
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await zone.press('Escape');
  await expect.poll(async () => (await entry.state()).context).toBe('flight');
  await entry.waitForMap('off');
  const state = await entry.state();
  expect(state.commands).toHaveLength(1);
  expect(state.commands[0]).toMatchObject({ type: 'toggle-map', id: expect.any(Number) });
  expect(state.portCalls).not.toContain('open-menu');
  expect(state.errors).toEqual([]);
  await page.mouse.click(400, 300);
  await entry.frames(3);
  expect((await entry.state()).commands.filter(command => command.type === 'map-point')).toEqual([]);
  await page.getByRole('button', { name: 'Refresh observations', exact: true }).click();
  await expect(page.getByLabel('Observation snapshot')).toContainText('"context": "flight"');
  await page.getByRole('button', { name: 'Close test session', exact: true }).click();
  await expect.poll(async () => (await entry.state()).open).toBe(false);
});

const near = (actual: MapPosition | null, expected: MapPosition, digits = 9): void => {
  expect(actual).not.toBeNull();
  expect(actual!.right).toBeCloseTo(expected.right, digits);
  expect(actual!.down).toBeCloseTo(expected.down, digits);
};

/** The geometry the entry reports; it has one while the zone has a size and the mode is live. */
const geometryOf = (state: MapInputEntryState): MapInputGeometry => {
  if (!state.geometry) throw new Error('The entry reports no geometry');
  return state.geometry;
};

/** CSS px per unit of position along each axis. */
const cssPerUnit = ({ screen, mainMap, frame }: MapInputGeometry) => ({
  x: (frame.width * (mainMap.right - mainMap.left)) / screen.width,
  y: (frame.height * (mainMap.bottom - mainMap.top)) / screen.height,
});

/**
 * Opens the entry in flight and shows the map. On a freshly loaded page nothing gave it a user activation, so the map
 * waits for a click to lock.
 */
async function openMap(entry: MapEntry, lock: 'native' | 'pending' | 'refuse' | 'unsupported' = 'native', fresh = true) {
  await entry.open(lock);
  await entry.focusZone();
  const flight = await entry.state();
  expect(flight).toMatchObject({ open: true, phase: 'running', context: 'flight', map: { state: 'off' } });
  if (fresh) expect(flight.userActivation).toBe(false);
  await entry.setContext('map');
  return flight;
}

test('page-delivered Escape leaves the locked map open until the browser unlocks, then a fresh Escape closes it', async ({ page }) => {
  const entry = await MapEntry.load(page);
  await openMap(entry);
  await page.mouse.click(400, 300);
  await entry.waitForMap('locked');
  // Synthesized Escape reaches the adapter, not Chrome's native Pointer Lock unlock path.
  await page.keyboard.press('Escape');
  let state = await entry.state();
  await entry.frames(3, state);
  state = await entry.state();
  expect(await entry.zoneLocked()).toBe(true);
  expect(state).toMatchObject({ context: 'map', map: { state: 'locked' }, commands: [], portCalls: [], errors: [] });
  await expect.poll(() => entry.lockChanges()).toEqual(['zone']);

  await entry.call('document.exitPointerLock()');
  await entry.waitForMap('click-to-lock');
  expect(await entry.zoneLocked()).toBe(false);
  state = await entry.state();
  expect(state).toMatchObject({ context: 'map', commands: [], portCalls: ['clear-input pointer-lock-exit'], errors: [] });
  await expect.poll(() => entry.lockChanges()).toEqual(['zone', 'none']);

  await page.keyboard.press('Escape');
  await entry.waitForMap('off');
  await expect.poll(() => entry.zoneLocked()).toBe(false);
  await expect.poll(async () => (await entry.state()).pointerLock.state).toBe('idle');
  state = await entry.state();
  expect(state.context).toBe('flight');
  expect(state.commands.filter(command => command.type === 'toggle-map')).toHaveLength(1);
  expect(state.portCalls).not.toContain('open-menu');
  await expectNoCursor(entry);
  expect(state.errors).toEqual([]);
  expect(await entry.close()).toEqual([]);
});

test.describe('map input entry at pixel ratio 1', () => {
  test('starts at the K point, locks on the first click only, follows locked movement, clamps and clears', async ({ page }, testInfo) => {
    const entry = await MapEntry.load(page);
    await openMap(entry);
    const ready = await entry.waitForMap('click-to-lock');
    const geometry = geometryOf(ready);
    // 800×600 CSS for a 320×240 screen: 2.5 CSS px per logical px, so the 240×192 main map is 600×480 CSS.
    expect(geometry.frame).toEqual({ left: 0, top: 0, width: 800, height: 600 });
    const start = kStart(geometry.mainMap);
    near(ready.cursor, start);
    expect(ready).toMatchObject({ requests: 0, map: { systemPointerHidden: false }, zoneCursor: 'auto' });
    expect(await entry.zoneLocked()).toBe(false);
    await expectCursorAt(entry, geometry, start, 1);

    // A click without a lock only locks: no hover or select for it or its release.
    const at = { x: 600, y: 400 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    const locked = await entry.waitForMap('locked');
    expect(await entry.zoneLocked()).toBe(true);
    await expect.poll(() => entry.lockChanges()).toEqual(['zone']);
    expect(locked).toMatchObject({ requests: 1, pointerLock: { state: 'active' }, map: { systemPointerHidden: true }, zoneCursor: 'none' });
    await entry.frames(3, locked);
    expect(points(await entry.state())).toEqual([]);

    // The platform's movementX unit, from the page's own record of the locked moves.
    await entry.call(`window.osrMovement = []; document.querySelector('${ZONE}').addEventListener('mousemove', event => {
      window.osrMovement.push([event.movementX, event.movementY]);
    })`);
    const unit = cssPerUnit(geometry);
    let mouse = at;
    const moveBy = async (dx: number, dy: number): Promise<void> => {
      mouse = { x: mouse.x + dx, y: mouse.y + dy };
      await page.mouse.move(mouse.x, mouse.y);
    };
    await moveBy(60, -48);
    const moved = { right: start.right + 60 / unit.x, down: start.down - 48 / unit.y };
    await expect.poll(async () => (await entry.state()).cursor?.right).toBeCloseTo(moved.right, 9);
    near((await entry.state()).cursor, moved);
    expect(await entry.call('window.osrMovement')).toEqual([[60, -48]]);
    testInfo.annotations.push({ type: 'movementX unit', description: 'devicePixelRatio 1: a 60, −48 CSS px CDP move reported movementX/Y 60, −48' });
    await expectCursorAt(entry, geometry, moved, 1);

    // Clamped at every edge and corner; each screenshot holds only the new crosshair, so the old one was cleared.
    // The mouse travels within the viewport (from 660, 352 to 1110, 792); under the lock only the movement counts.
    const corners: [string, number, number, MapPosition][] = [
      ['right edge', 350, 0, { right: 1, down: moved.down }],
      ['top-right corner', 0, -200, { right: 1, down: 0 }],
      ['top edge', -300, 0, { right: 1 - 300 / unit.x, down: 0 }],
      ['top-left corner', -400, 0, { right: 0, down: 0 }],
      ['left edge', 0, 240, { right: 0, down: 240 / unit.y }],
      ['bottom-left corner', 0, 400, { right: 0, down: 1 }],
      ['bottom edge', 400, 0, { right: 400 / unit.x, down: 1 }],
      ['bottom-right corner', 400, 0, { right: 1, down: 1 }],
    ];
    for (const [name, dx, dy, expected] of corners) {
      await moveBy(dx, dy);
      await expect.poll(async () => {
        const { cursor } = await entry.state();
        return cursor !== null && Math.abs(cursor.right - expected.right) < 1e-9 && Math.abs(cursor.down - expected.down) < 1e-9;
      }, { message: `${name}: ${JSON.stringify(await entry.call('window.osrMovement'))}` }).toBe(true);
      await expectCursorAt(entry, geometry, expected, 1);
    }
    // Back off the corner by a known distance: clamping lost the excess, as the original's clamp does.
    await moveBy(-60, -48);
    const back = { right: 1 - 60 / unit.x, down: 1 - 48 / unit.y };
    await expect.poll(async () => (await entry.state()).cursor?.right).toBeCloseTo(back.right, 9);
    near((await entry.state()).cursor, back);
    await expectCursorAt(entry, geometry, back, 1);
    // Moves alone submit only hovers, each at most once a session frame, the last at the final position.
    const state = await entry.state();
    const hovers = state.commands.filter(({ operation }) => operation === 'hover');
    expect(state.commands.every(({ operation }) => operation === 'hover')).toBe(true);
    expect(new Set(hovers.map(({ frame }) => frame)).size).toBe(hovers.length);
    near(hovers.at(-1) as MapPosition, back);
    expect(state.errors).toEqual([]);
    expect(await entry.close()).toEqual([]);
    expect(await entry.zoneLocked()).toBe(false);
  });

  test('merges moves into one hover a frame, selects in order at frozen points, repeats while held, and survives a failed hover', async ({ page }) => {
    const entry = await MapEntry.load(page);
    await openMap(entry);
    const geometry = geometryOf(await entry.waitForMap('click-to-lock'));
    const unit = cssPerUnit(geometry);
    const start = kStart(geometry.mainMap);
    let mouse = { x: 400, y: 300 };
    await page.mouse.move(mouse.x, mouse.y);
    await page.mouse.down();
    await page.mouse.up();
    await entry.waitForMap('locked');
    const moveBy = async (dx: number, dy: number, steps = 1): Promise<void> => {
      mouse = { x: mouse.x + dx, y: mouse.y + dy };
      await page.mouse.move(mouse.x, mouse.y, { steps });
    };

    /** The cursor once it is near `expected`, exactly: the points the commands should carry. */
    const cursorNear = async (expected: MapPosition): Promise<MapPosition> => {
      await expect.poll(async () => (await entry.state()).cursor?.right).toBeCloseTo(expected.right, 9);
      const { cursor } = await entry.state();
      near(cursor, expected);
      return cursor!;
    };

    // Twenty moves: never two hovers in one session frame (Chrome also aligns mousemove events with frames).
    await moveBy(40, 20, 20);
    const a = await cursorNear({ right: start.right + 40 / unit.x, down: start.down + 20 / unit.y });
    await expect.poll(async () => (await entry.state()).commands.at(-1)?.right).toBe(a.right);
    let state = await entry.state();
    const merged = state.commands.filter(({ operation }) => operation === 'hover');
    expect(merged.length).toBeGreaterThan(0);
    expect(merged.length).toBeLessThanOrEqual(20);
    expect(new Set(merged.map(({ frame }) => frame)).size).toBe(merged.length);

    // Press at A, then at B right after a move: each select carries its own frozen point, after its hover.
    const before = state.commands.length;
    await page.mouse.down();
    await page.mouse.up();
    await moveBy(-80, 30);
    await page.mouse.down();
    await page.mouse.up();
    const b = await cursorNear({ right: a.right - 80 / unit.x, down: a.down + 30 / unit.y });
    await expect.poll(async () => selects(await entry.state()).length).toBe(2);
    state = await entry.state();
    const after = state.commands.slice(before).filter(({ id }) => id !== null).map(({ operation, right, down }) => ({ operation, right, down }));
    const [selectA, selectB] = selects(state);
    expect(selectA).toMatchObject({ ...a });
    expect(selectB).toMatchObject({ ...b });
    // Each select directly follows a map-point at its own position (the hover it needed, or the one already sent).
    for (const select of [selectA, selectB]) {
      const index = state.commands.indexOf(select);
      const previous = state.commands.slice(0, index).filter(({ type, id }) => type === 'map-point' && id !== null).at(-1);
      expect(previous).toMatchObject({ right: select.right, down: select.down });
    }
    expect(after.filter(({ operation }) => operation === 'select')).toEqual([{ operation: 'select', ...a }, { operation: 'select', ...b }]);
    // A hover submitted after the first select never comes before it.
    expect(after.findIndex(({ operation }) => operation === 'select')).toBeLessThan(after.findIndex(({ right }) => right === b.right));

    // Failing hovers: no select at all, neither the press's own nor a stale point; the next press selects here.
    await entry.failHovers(1_000);
    await moveBy(20, 10);
    await page.mouse.down();
    await page.mouse.up();
    const c = await cursorNear({ right: b.right + 20 / unit.x, down: b.down + 10 / unit.y });
    await entry.frames(3);
    state = await entry.state();
    expect(selects(state)).toHaveLength(2);
    expect(state.commands.at(-1)).toMatchObject({ operation: 'hover', ...c, id: null });
    await entry.failHovers(0);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(async () => selects(await entry.state()).length).toBe(3);
    state = await entry.state();
    expect(state.commands.slice(-2).map(({ operation, right, down, id }) => ({ operation, right, down, accepted: id !== null })))
      .toEqual([{ operation: 'hover', ...c, accepted: true }, { operation: 'select', ...c, accepted: true }]);

    // Holding repeats the select at least 8 clock units apart, following the cursor; release stops it.
    const held = selects(state).length;
    await page.mouse.down();
    await entry.selects(held + 3);
    await moveBy(30, 0);
    const d = await cursorNear({ right: c.right + 30 / unit.x, down: c.down });
    await expect.poll(async () => selects(await entry.state()).at(-1)?.right).toBe(d.right);
    await page.mouse.up();
    const released = await entry.state();
    const quiet = await entry.advance(QUIET, released);
    // Release submits nothing, and no repeat follows it.
    expect(quiet.commands).toHaveLength(released.commands.length);
    const repeats = selects(quiet).slice(held);
    expect(repeats.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < repeats.length; index++) expect(repeats[index].clock - repeats[index - 1].clock).toBeGreaterThanOrEqual(8);
    expect(repeats[0]).toMatchObject({ ...c });
    expect(repeats.at(-1)).toMatchObject({ ...d });
    expect(new Set(repeats.map(({ frame }) => frame)).size).toBe(repeats.length);

    // The browser ending the lock mid-hold ends the repeat; relocking does not revive it.
    await page.mouse.down();
    await entry.selects(selects(quiet).length + 2);
    await entry.call('document.exitPointerLock()');
    const unlocked = await entry.waitForMap('click-to-lock');
    expect((await entry.advance(QUIET, unlocked)).commands).toHaveLength(unlocked.commands.length);
    await page.mouse.up();
    await page.mouse.down();
    const relocking = await entry.waitForMap('locked');
    await entry.advance(QUIET, relocking);
    await page.mouse.up();
    const relocked = await entry.state();
    expect(relocked.commands).toHaveLength(unlocked.commands.length);
    expect(relocked.errors).toEqual([]);
    expect(await entry.close()).toEqual([]);
  });

  test('ends a held repeat on pause, on leaving the map and on a failed due hover; the right button never selects', async ({ page }) => {
    const entry = await MapEntry.load(page);
    await openMap(entry);
    await entry.waitForMap('click-to-lock');
    await page.mouse.click(400, 300);
    await entry.waitForMap('locked');
    const total = async (): Promise<number> => (await entry.state()).commands.length;

    // Right button, locked: nothing, pressed, held or released.
    await page.mouse.move(430, 300);
    await expect.poll(total).toBe(1);
    await page.mouse.down({ button: 'right' });
    await entry.advance(QUIET);
    await page.mouse.up({ button: 'right' });
    expect(selects(await entry.state())).toEqual([]);
    expect(await total()).toBe(1);

    // Pause mid-hold: no repeat while paused or after resuming with the button still down.
    await page.mouse.down();
    await entry.selects(2);
    await entry.control('pause');
    await entry.waitForMap('suspended');
    const paused = await total();
    await entry.control('resume');
    let state = await entry.waitForMap('click-to-lock', 'locking', 'locked');
    if (state.map.state !== 'locked') {
      await page.mouse.up();
      await page.mouse.down();
      state = await entry.waitForMap('locked');
    }
    expect((await entry.advance(QUIET, state)).commands).toHaveLength(paused);
    await page.mouse.up();

    // Leaving the map mid-hold: no repeat, there or after reentering with the button still down.
    await page.mouse.down();
    await entry.selects(selects(await entry.state()).length + 2);
    await entry.setContext('flight');
    state = await entry.waitForMap('off');
    const left = state.commands.length;
    await entry.advance(QUIET, state);
    await entry.setContext('map');
    state = await entry.waitForMap('click-to-lock', 'locking', 'locked');
    expect((await entry.advance(QUIET, state)).commands).toHaveLength(left);
    await page.mouse.up();
    state = await entry.lock();

    // A due frame whose pending hover fails sends no select and ends the repeat; hovers working again revive nothing.
    await page.mouse.down();
    await entry.selects(selects(state).length + 2);
    await entry.failHovers(1_000);
    await page.mouse.move(470, 320);
    await expect.poll(async () => (await entry.state()).commands.at(-1)?.id).toBeNull();
    state = await entry.state();
    expect(state.commands.at(-1)).toMatchObject({ operation: 'hover' });
    await entry.failHovers(0);
    const failed = (await entry.advance(QUIET, state)).commands.length;
    expect(failed).toBe(state.commands.length);
    await page.mouse.up();
    // Only a new press selects again.
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(async () => (await entry.state()).commands.at(-1)?.operation).toBe('select');
    expect((await entry.state()).errors).toEqual([]);
    expect(await entry.close()).toEqual([]);
  });

  test('exits the lock on leaving the map, blur and pause, stays open after the browser unlocks, and relocks without selecting', async ({ page }) => {
    const entry = await MapEntry.load(page);
    await openMap(entry);
    const geometry = geometryOf(await entry.waitForMap('click-to-lock'));
    const unit = cssPerUnit(geometry);
    const start = kStart(geometry.mainMap);
    let mouse = { x: 400, y: 300 };
    const click = async (): Promise<void> => {
      await page.mouse.down();
      await page.mouse.up();
    };
    await page.mouse.move(mouse.x, mouse.y);
    await click();
    await entry.waitForMap('locked');
    mouse = { x: mouse.x + 50, y: mouse.y };
    await page.mouse.move(mouse.x, mouse.y);
    const moved = { right: start.right + 50 / unit.x, down: start.down };
    await expect.poll(async () => (await entry.state()).cursor?.right).toBeCloseTo(moved.right, 9);

    // The browser ends the lock itself: the map stays open, waiting, with the position kept and the input cleared.
    await entry.call('document.exitPointerLock()');
    let state = await entry.waitForMap('click-to-lock');
    expect(await entry.zoneLocked()).toBe(false);
    await expect.poll(() => entry.lockChanges()).toEqual(['zone', 'none']);
    expect(state).toMatchObject({ context: 'map', pointerLock: { state: 'idle' }, map: { systemPointerHidden: false }, zoneCursor: 'auto' });
    expect(state.portCalls).toContain('clear-input pointer-lock-exit');
    near(state.cursor, moved);
    await expectCursorAt(entry, geometry, moved, 1);
    // Moving without a lock does nothing; the next click only locks again.
    const count = state.commands.length;
    await page.mouse.move(mouse.x + 100, mouse.y + 50);
    await click();
    state = await entry.waitForMap('locked');
    await entry.frames(3, state);
    state = await entry.state();
    expect(state.commands).toHaveLength(count);
    near(state.cursor, moved);
    await expect.poll(() => entry.lockChanges()).toEqual(['zone', 'none', 'zone']);

    // Losing the input zone's focus exits the lock and suspends the map with the cursor still. A click focuses the zone
    // again: its press reaches the map before the focus, so it selects nothing, and its user activation remains as the
    // map qualifies, which asks for the lock once more.
    await entry.blurZone();
    state = await entry.waitForMap('suspended');
    expect(await entry.zoneLocked()).toBe(false);
    expect(state.portCalls.filter(call => call === 'clear-input focus-loss')).toHaveLength(1);
    near(state.cursor, moved);
    await expectCursorAt(entry, geometry, moved, 1);
    const requests = state.requests;
    await click();
    state = await entry.waitForMap('locked');
    expect(state.requests).toBe(requests + 1);
    expect(state.commands).toHaveLength(count);

    // Pausing exits the lock and keeps the position; resuming without activation waits for a click.
    await entry.control('pause');
    state = await entry.waitForMap('suspended');
    expect(await entry.zoneLocked()).toBe(false);
    near(state.cursor, moved);
    const ticks = state.clock;
    await page.waitForTimeout(300);
    expect((await entry.state()).clock).toBe(ticks);
    await entry.control('resume');
    await entry.waitForMap('click-to-lock', 'locking', 'locked');

    // Leaving the map ends the opening and its lock; the next opening starts again at the K point.
    await entry.setContext('flight');
    state = await entry.waitForMap('off');
    expect(await entry.zoneLocked()).toBe(false);
    expect(state.cursor).toBeNull();
    await expectNoCursor(entry);
    await entry.setContext('map');
    await entry.waitForMap('click-to-lock', 'locking', 'locked');
    near((await entry.state()).cursor, start);
    await expectCursorAt(entry, geometry, start, 1);
    expect((await entry.state()).commands).toHaveLength(count);

    // A key press of `m` (toggle-map, with its own activation) leaves and reenters through the run, which locks at once.
    await page.keyboard.press('KeyM');
    await entry.waitForMap('off');
    // A request while this owner's exit is still open would fail as `closing`; wait for the exit to finish.
    await expect.poll(async () => (await entry.state()).pointerLock.state).toBe('idle');
    await page.keyboard.press('KeyM');
    state = await entry.waitForMap('locked');
    near(state.cursor, start);
    expect(await entry.zoneLocked()).toBe(true);
    expect(state.commands.filter(({ type }) => type === 'toggle-map')).toHaveLength(2);
    expect(state.commands.filter(({ type }) => type === 'map-point')).toHaveLength(count);
    expect(state.errors).toEqual([]);
    expect(await entry.close()).toEqual([]);
    expect(await entry.zoneLocked()).toBe(false);
  });

  test('takes a late geometry\'s start once, and disables input without geometry, with an invalid one, or at zero size', async ({ page }) => {
    const entry = await MapEntry.load(page);
    // Chrome reports no movement for the page's first mouse event, so the mouse starts here.
    await page.mouse.move(400, 300);
    await entry.open('native', 'null');
    await entry.focusZone();
    await entry.setContext('map');
    let state = await entry.waitForMap('not-ready');
    expect(state).toMatchObject({ cursor: null, requests: 0, map: { systemPointerHidden: false }, zoneCursor: 'auto' });
    await expectNoCursor(entry);
    await entry.frames(3);
    expect(await entry.state()).toMatchObject({ map: { state: 'not-ready' }, requests: 0 });

    // The screenshot left a user activation, so the map may ask for the lock as it qualifies.
    await entry.setGeometry('live');
    state = await entry.waitForMap('click-to-lock', 'locking', 'locked');
    const geometry = geometryOf(state);
    const start = kStart(geometry.mainMap);
    near(state.cursor, start);
    expect(state.commands).toEqual([]);
    await expectCursorAt(entry, geometry, start, 1);
    await entry.lock();
    await page.mouse.move(460, 300);
    const moved = { right: start.right + 60 / cssPerUnit(geometry).x, down: start.down };
    await expect.poll(async () => (await entry.state()).cursor?.right).toBeCloseTo(moved.right, 9);

    // Geometry gone: not ready, unlocked, cursor and system pointer hidden state cleared; back: the position is kept.
    await entry.setGeometry('null');
    state = await entry.waitForMap('not-ready');
    expect(await entry.zoneLocked()).toBe(false);
    expect(state.map.systemPointerHidden).toBe(false);
    await expectNoCursor(entry);
    await entry.setGeometry('live');
    state = await entry.waitForMap('click-to-lock', 'locking', 'locked');
    near(state.cursor, moved);
    await expectCursorAt(entry, geometry, moved, 1);

    // An inverted main map is a contract error, not "not ready".
    await entry.setGeometry('inverted');
    state = await entry.waitForMap('invalid');
    expect(state.map.error).toMatch(/^MapInputGeometryError: Map input geometry mainMap\.right must not be less than mainMap\.left/);
    await expectNoCursor(entry);
    await entry.setGeometry('live');

    // Zero size: not ready and unlocked; the size back, the position kept.
    await entry.lock();
    await entry.resize(0, 600);
    state = await entry.waitForMap('not-ready');
    expect(state.geometry?.frame).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    expect(await entry.zoneLocked()).toBe(false);
    await expectNoCursor(entry);
    await entry.resize(800, 600);
    state = await entry.waitForMap('click-to-lock', 'locking', 'locked');
    near(state.cursor, moved);
    expect(state.commands.filter(({ operation }) => operation === 'select')).toEqual([]);
    expect(state.errors).toEqual([]);
    expect(await entry.close()).toEqual([]);
  });

  test('falls back without a lock: absolute input on the main map only, the system pointer outside it, no repeated request', async ({ page }) => {
    const entry = await MapEntry.load(page);
    // 1000×500 CSS: a 4:3 frame with black bars on either side.
    await entry.resize(1000, 500);
    await openMap(entry, 'refuse');
    await entry.waitForMap('click-to-lock');
    await page.mouse.click(500, 250);
    let state = await entry.waitForMap('unlocked');
    expect(state).toMatchObject({ requests: 1, pointerLock: { state: 'failed', failure: 'rejected' } });
    const geometry = geometryOf(state);
    // The 4:3 buffer is ⌊500 × 4 / 3⌋ = 666 px wide, centred: 167 px bars.
    expect(geometry.frame).toEqual({ left: 167, top: 0, width: 666, height: 500 });
    // The refused click selects nothing.
    expect(points(state)).toEqual([]);

    // On the main map the cursor follows the pointer, which is hidden; on the black bar it is shown and nothing selects.
    const near25 = clientPoint(geometry, { right: 0.25, down: 0.75 });
    const at = { x: Math.round(near25.x), y: Math.round(near25.y) };
    const a = positionAt(geometry, at.x, at.y);
    await page.mouse.move(at.x, at.y);
    await expect.poll(async () => (await entry.state()).cursor?.right).toBeCloseTo(a.right, 9);
    near((await entry.state()).cursor, a);
    await expect.poll(async () => (await entry.state()).zoneCursor).toBe('none');
    await expectCursorAt(entry, geometry, a, 1);
    await page.mouse.move(80, 250);
    await expect.poll(async () => (await entry.state()).zoneCursor).toBe('auto');
    await page.mouse.click(80, 250);
    // Inside the frame but right of the main map (logical x 280 of 320).
    await page.mouse.click(geometry.frame.left + geometry.frame.width * 0.875, 250);
    await entry.frames(3);
    state = await entry.state();
    expect(selects(state)).toEqual([]);
    expect(state.map.systemPointerHidden).toBe(false);
    near(state.cursor, a);

    // A click on the map selects there after its hover.
    await page.mouse.click(at.x, at.y);
    await expect.poll(async () => selects(await entry.state()).length).toBe(1);
    state = await entry.state();
    near(selects(state)[0] as MapPosition, a);
    // Holding on the map repeats; leaving the main map ends the repeat, and returning does not revive it.
    await page.mouse.down();
    await entry.selects(4);
    await page.mouse.move(80, 250);
    await expect.poll(async () => (await entry.state()).zoneCursor).toBe('auto');
    const left = await entry.advance(QUIET);
    expect(selects(left).length).toBeGreaterThanOrEqual(4);
    await page.mouse.move(at.x, at.y);
    await expect.poll(async () => (await entry.state()).zoneCursor).toBe('none');
    const back = await entry.advance(QUIET);
    await page.mouse.up();
    expect(selects(back)).toHaveLength(selects(left).length);

    // Frames, moves and clicks never asked again; only the explicit request does.
    state = await entry.state();
    expect(state.requests).toBe(1);
    await entry.retryLock();
    await expect.poll(async () => (await entry.state()).requests).toBe(2);
    expect((await entry.state()).map.state).toBe('unlocked');
    expect(state.errors).toEqual([]);
    expect(await entry.close()).toEqual([]);
  });

  test('the right button: the zone suppresses its context menu only while the map qualifies; it never selects or moves the cursor (P3-13 Δ-09)', async ({ page }) => {
    const entry = await MapEntry.load(page);
    // Whether each context menu the page saw had its default prevented, as the window's bubbling listener sees it.
    await entry.call(`window.osrContextMenus = []; window.addEventListener('contextmenu', event => { window.osrContextMenus.push(event.defaultPrevented); })`);
    const menus = () => entry.call<boolean[]>('window.osrContextMenus');
    const rightClick = async (x: number, y: number): Promise<void> => { await page.mouse.click(x, y, { button: 'right' }); };
    // In flight the map takes nothing.
    await entry.open('unsupported');
    await entry.focusZone();
    expect((await entry.state()).context).toBe('flight');
    await rightClick(400, 300);
    await expect.poll(menus).toEqual([false]);
    await entry.setContext('map');
    let state = await entry.waitForMap('unlocked');
    const geometry = geometryOf(state);
    const start = state.cursor!;
    // The unlocked fallback on the main map, and beside it in the qualified zone.
    const onMap = clientPoint(geometry, { right: 0.4, down: 0.6 });
    await rightClick(Math.round(onMap.x), Math.round(onMap.y));
    await rightClick(geometry.frame.left + geometry.frame.width * 0.875, 300);
    await expect.poll(menus).toEqual([false, true, true]);
    // Paused, the map is suspended and lets the menu through; resumed, it suppresses it again.
    await entry.control('pause');
    await entry.waitForMap('suspended');
    await rightClick(Math.round(onMap.x), Math.round(onMap.y));
    await expect.poll(menus).toEqual([false, true, true, false]);
    await entry.control('resume');
    await entry.waitForMap('unlocked');
    await rightClick(Math.round(onMap.x), Math.round(onMap.y));
    await expect.poll(menus).toEqual([false, true, true, false, true]);
    // A right press held across frames selects nothing and leaves the cursor where the pointer put it.
    await page.mouse.move(Math.round(onMap.x), Math.round(onMap.y));
    await expect.poll(async () => (await entry.state()).cursor?.right).toBeCloseTo(positionAt(geometry, Math.round(onMap.x), Math.round(onMap.y)).right, 9);
    const before = (await entry.state()).cursor;
    expect(before).not.toEqual(start);
    await page.mouse.down({ button: 'right' });
    await entry.advance(QUIET);
    await page.mouse.up({ button: 'right' });
    state = await entry.state();
    expect(selects(state)).toEqual([]);
    expect(state.cursor).toEqual(before);
    await expect.poll(menus).toEqual([false, true, true, false, true, true]);
    expect(state.errors).toEqual([]);
    expect(await entry.close()).toEqual([]);
    // Released, the zone no longer takes the menu.
    await rightClick(400, 300);
    await expect.poll(menus).toEqual([false, true, true, false, true, true, false]);
  });

  test('keeps running while a lock request is pending, selecting nothing, then follows the answer', async ({ page }) => {
    let entry = await MapEntry.load(page);
    await openMap(entry, 'pending');
    await entry.waitForMap('click-to-lock');
    await page.mouse.click(400, 300);
    let state = await entry.waitForMap('locking');
    expect(state).toMatchObject({ requests: 1, pointerLock: { state: 'pending' }, map: { systemPointerHidden: false } });
    await page.mouse.move(500, 350);
    await page.mouse.click(500, 350);
    const later = await entry.frames(10, state);
    expect(later.clock!).toBeGreaterThan(state.clock!);
    expect(later.phase).toBe('running');
    expect(later.commands).toEqual([]);
    expect(later.requests).toBe(1);
    await entry.settleLock('refuse');
    state = await entry.waitForMap('unlocked');
    expect(state.pointerLock).toEqual({ state: 'failed', failure: 'rejected' });
    expect(await entry.close()).toEqual([]);

    // Granted, on a fresh page: the browser's lock, and nothing selected for the click that asked.
    entry = await MapEntry.load(page);
    await openMap(entry, 'pending');
    await entry.waitForMap('click-to-lock');
    await page.mouse.click(400, 300);
    await entry.waitForMap('locking');
    await entry.settleLock('grant');
    state = await entry.waitForMap('locked');
    expect(await entry.zoneLocked()).toBe(true);
    expect(points(state)).toEqual([]);
    expect(await entry.close()).toEqual([]);
    expect(await entry.zoneLocked()).toBe(false);

    // Unsupported: the fallback at once, with no request.
    entry = await MapEntry.load(page);
    await openMap(entry, 'unsupported');
    state = await entry.waitForMap('unlocked');
    expect(state).toMatchObject({ requests: 0, pointerLock: { state: 'unsupported' } });
    expect(await entry.close()).toEqual([]);
  });

  test('returns the Pointer Lock, keyboard, session and drawing resources to the baseline on every close, a pending request\'s too', async ({ page }, testInfo) => {
    const entry = await MapEntry.load(page);
    await settleTooling(page);
    const balance = await ResourceBalance.start(page, testInfo, { audio: false });
    try {
      // The balance's own reads run as user gestures, so the map may ask for the lock by itself as it qualifies.
      // The third round closes while its request is still open: the held answer is a refusal.
      for (const [round, lock] of [[1, 'native'], [2, 'native'], [3, 'pending']] as const) {
        await openMap(entry, lock, false);
        if (lock === 'native') await entry.lock();
        else {
          const { map } = await entry.waitForMap('click-to-lock', 'locking');
          if (map.state === 'click-to-lock') await page.mouse.click(400, 300);
          await entry.waitForMap('locking');
        }
        const listeners = await page.evaluate(() => window.osrProbe.snapshot().listeners
          .filter(({ active, group }) => active && ['pointer-lock', 'keyboard', 'session'].includes(group))
          .map(({ group, type }) => `${group}:${type}`).sort());
        expect(listeners, `round ${round}`).toEqual([
          'keyboard:blur', 'keyboard:focus', 'keyboard:focusin', 'keyboard:focusout', 'keyboard:keydown', 'keyboard:keyup',
          'keyboard:pagehide', 'keyboard:pageshow', 'keyboard:visibilitychange',
          'pointer-lock:mousedown', 'pointer-lock:mousemove', 'pointer-lock:mouseup', 'pointer-lock:pointerlockchange', 'pointer-lock:pointerlockerror',
          'session:pagehide', 'session:pageshow', 'session:visibilitychange',
        ]);
        expect(await entry.close()).toEqual([]);
        expect(await entry.zoneLocked()).toBe(false);
        expect(await page.locator(`${ZONE} canvas`).count()).toBe(0);
        await balance.check(`after close ${round}`);
      }
    } finally {
      await balance.attach();
    }
  });
});

test.describe('map input entry at pixel ratio 2', () => {
  test.use({ deviceScaleFactor: 2 });

  test('draws at device pixels, keeps the position across a resize with black bars, and moves by CSS px', async ({ page }, testInfo) => {
    const entry = await MapEntry.load(page);
    await openMap(entry);
    let state = await entry.waitForMap('click-to-lock');
    let geometry = geometryOf(state);
    const start = kStart(geometry.mainMap);
    near(state.cursor, start);
    await expectCursorAt(entry, geometry, start, 2);
    await page.mouse.click(400, 300);
    await entry.waitForMap('locked');

    await entry.call(`window.osrMovement = []; document.querySelector('${ZONE}').addEventListener('mousemove', event => {
      window.osrMovement.push([event.movementX, event.movementY]);
    })`);
    await page.mouse.move(460, 252);
    const moved = { right: start.right + 60 / cssPerUnit(geometry).x, down: start.down - 48 / cssPerUnit(geometry).y };
    await expect.poll(async () => (await entry.state()).cursor?.right).toBeCloseTo(moved.right, 9);
    near((await entry.state()).cursor, moved);
    expect(await entry.call('window.osrMovement')).toEqual([[60, -48]]);
    testInfo.annotations.push({ type: 'movementX unit', description: 'devicePixelRatio 2: a 60, −48 CSS px CDP move reported movementX/Y 60, −48 (CSS px)' });
    await expectCursorAt(entry, geometry, moved, 2);
    const before = await cursorPixels(entry);

    // A wide host: black bars left and right, the frame scaled; the lock and the normalised position are kept.
    await entry.resize(1000, 500);
    await expect.poll(async () => geometryOf(await entry.state()).frame.height).toBe(500);
    state = await entry.state();
    geometry = geometryOf(state);
    expect(state.map.state).toBe('locked');
    expect(await entry.zoneLocked()).toBe(true);
    near(state.cursor, moved);
    const after = await expectCursorAt(entry, geometry, moved, 2);
    expect(after.box).not.toEqual(before.box);
    expect(await entry.close()).toEqual([]);
  });
});
