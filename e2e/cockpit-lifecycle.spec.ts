import type { Page, TestInfo } from '@playwright/test';
import { button } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { test as plain } from './support/browser-test.ts';
import {
  armGlFault, cockpitCounts, glRecord, installGlRecorder, liveContexts, renderDiagnostics, scaledMismatches, seededMenu, type GlFrame,
} from './support/cockpit-lifecycle.ts';
import {
  after, clockAt, cockpitState, collisionPackage, COLOUR, flashFits, instrument, messageLineWrong, messageOffset, pause, pauseWhen, resume, startableCockpit,
} from './support/cockpit.ts';
import { nextFrames, pagePixels } from './support/flight-pictures.ts';
import { startKeyboardFlight } from './support/keyboard-input.ts';
import { canvasBox, editMapGeometryOnly, mapView, screenPicture, waitForMapView, zoneLocked, ZONE } from './support/map-picture.ts';
import { FLIGHT_VIEW, MAP_VIEW, mapWarpLog, readLog, waitForBridge, waitForMapWarpLog } from './support/map-warp.ts';
import { endPlaceholder, enterMission, expectStableTick, frameWindow, missionEntry, missionFrame, waitForFrame } from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';

// P3-13/29 (docs/plan/p3/13/subtasks/29-browser-lifecycle.md; spec 接线与生命周期, 地图输入几何与指针, 右侧目标显示屏;
// AC-18, AC-19, AC-25): the cockpit's run composition through the real application's lifecycle, on the synthetic
// `mission-startable` package seeded into each case's isolated context and restored through the menu (the development
// test entry's profile, or the production identity in the production build). The run is driven only by trusted keys in
// the game input zone, real Pointer Lock and, for a Warp destination, the diagnostics panel's command editor. GPU facts
// come from a recorder of the page's WebGL 2 calls (support/cockpit-lifecycle.ts), which also injects the cases' single
// GPU call failures; runtime facts from the development diagnostics panel, the UI store and the browser probes. The
// application's code is unchanged. The network audit runs throughout.
//
// The right display draws its target on a CPU 100 × 100 device (spec D-01 revision, 20), so "its own depth leaves the
// world's untouched" is checked here as: the run has its one render target and its one depth attachment, the cockpit
// layer neither tests nor writes depth, and the world's depth survives the map into the Warp.

test.describe.configure({ timeout: 240_000 });
// Trace DOM snapshots evaluate in the page as user gestures, which would give it a user activation (map-input.ts).
test.use({ trace: { mode: 'retain-on-failure', snapshots: false } });

/** The uint32 seeds the test entry draws, one per world creation, so every run of a case places the same world. */
const SEEDS = Array.from({ length: 8 }, () => '251723777').join(',');
const status = (page: Page) => page.getByTestId('mission-status');
const zone = (page: Page) => page.locator(ZONE);

function only(build: 'development' | 'production'): void {
  test.beforeEach(({ page }, testInfo: TestInfo) => {
    void page;
    test.skip(testInfo.project.name !== build, `${build} build only`);
  });
}

/** The recorder installed, the package seeded and restored: the development menu with the mission eligible. */
async function developmentMenu(page: Page): Promise<void> {
  await page.addInitScript(installGlRecorder);
  await seededMenu(page, await missionPackage(), { worker: 'mission-startable', seeds: SEEDS });
}

/** From the mission menu: a restart, the introduction (after `between`, run there) and departure skipped, until the new run runs. */
async function restart(page: Page, between?: () => Promise<void>): Promise<void> {
  await button(page, 'Mission menu').click();
  await button(page, 'Restart mission').click();
  await expect(page.getByTestId('mission-placeholder')).toHaveAttribute('data-gap', 'G-02/1');
  await between?.();
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
}

/** The first frame that drew the cockpit with its game-image work begun after `after`. */
function firstPicture(frames: readonly GlFrame[], after: number): GlFrame {
  const picture = frames.find(frame => frame.cockpitDraws > 0 && frame.opened !== null && frame.opened > after);
  expect(picture, 'a picture drawn after the recovery').toBeDefined();
  return picture!;
}

/** Every recorded frame drew the cockpit exactly once, without testing or writing depth. */
function expectCockpitPass(frames: readonly GlFrame[], what: string): void {
  expect(frames.length, `${what}: recorded frames`).toBeGreaterThan(3);
  expect(frames.filter(frame => frame.cockpitDraws !== 1 || frame.cockpitDepth !== 0), `${what}: one depth-free cockpit draw per frame`).toEqual([]);
}

/** The losing or restoring of the flight canvas's context through `WEBGL_lose_context`, kept on the canvas for the restore. */
const loseContext = (page: Page, restore: boolean) => page.getByTestId('flight-area').locator('canvas').evaluate((element, again) => {
  const canvas = element as HTMLCanvasElement & { osrLoseContext?: WEBGL_lose_context };
  canvas.osrLoseContext ??= canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
  if (again) canvas.osrLoseContext.restoreContext();
  else canvas.osrLoseContext.loseContext();
}, restore);

const cursorStyle = (page: Page) => zone(page).evaluate(element => getComputedStyle(element).cursor);

test.describe('development build', () => {
  only('development');

  test('one canvas, context and frame loop through StrictMode, restarts and returns; each run returns its resources and warm runs hold the same counts', async ({ page }, testInfo) => {
    await developmentMenu(page);
    await settleTooling(page);
    const balance = await ResourceBalance.start(page, testInfo, { audio: false });
    const reads: Record<string, unknown> = {};
    // One run at tick 40 or later: one connected canvas whose context is live, every other context lost with its
    // canvas gone, at most one frame in flight, one cockpit pass per frame, and the run's resources with one render target.
    const check = async (label: string) => {
      await waitForFrame(page, frame => (frame.tick ?? 0) >= 40, 30_000);
      const record = await glRecord(page);
      expectCockpitPass(record.frames, label);
      expect(liveContexts(record), `${label}: live contexts`).toEqual({ live: 1, stale: record.contexts.length - 1 });
      const probe = await frameWindow(page);
      expect(probe.canvases.filter(canvas => canvas.connected), `${label}: connected canvases`).toHaveLength(1);
      expect(probe.frames.maximum, `${label}: frames in flight`).toBeLessThanOrEqual(1);
      expect(probe.frames.delivered, `${label}: delivered frames`).toBeGreaterThan(0);
      await expect(page.locator('canvas')).toHaveCount(1);
      const diagnostics = await renderDiagnostics(page);
      expect(diagnostics).toMatchObject({ state: 'ready', buffer: '640 × 480 at 1×' });
      expect(diagnostics.resources).toMatch(/ 1 render targets$/);
      // The run's cache and the renderer's GPU objects, as numbers, for the warm comparison.
      balance.warm('flight run', [...`${diagnostics.resources} ${diagnostics.gpu}`.matchAll(/\d+/g)].map(([value]) => Number(value)));
      reads[label] = { diagnostics, frames: record.frames.length, contexts: record.contexts, framebuffers: record.framebuffers, depth: record.depthAllocations };
    };
    for (const visit of [1, 2]) {
      await startKeyboardFlight(page);
      await check(`visit ${visit} run 1`);
      // The old run queued a message; the restarted run's cockpit starts empty, its old frames reach nothing.
      await page.keyboard.press('Control+Enter');
      await expect.poll(async () => (await cockpitCounts(page))?.messages).toBe(1);
      await restart(page);
      const fresh = await cockpitCounts(page);
      expect(fresh, `visit ${visit}: the restarted run's cockpit`).toMatchObject({ messages: 0, messageDrops: 0 });
      await check(`visit ${visit} run 2`);
      // Between runs (the next introduction) the run's resources are gone; a third run holds the same counts again.
      await restart(page, async () => {
        expect(await renderDiagnostics(page), `visit ${visit}: between runs`).toMatchObject({ run: 'none', resources: 'none' });
        expect(await cockpitCounts(page)).toBeNull();
      });
      await check(`visit ${visit} run 3`);
      await button(page, 'Mission menu').click();
      await button(page, 'Return to main menu').click();
      await expect(missionEntry(page)).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      await balance.check(`visit ${visit} back at the menu`);
    }
    const { contexts } = await glRecord(page);
    expect(contexts.filter(context => context.connected || !context.lost), 'every context released').toEqual([]);
    await balance.attach('cockpit-resources');
    await testInfo.attach('cockpit-lifecycle-runs', { body: JSON.stringify(reads), contentType: 'application/json' });
    console.info(`Cockpit lifecycle runs: ${JSON.stringify(Object.fromEntries(Object.entries(reads).map(([label, read]) => [label, (read as { diagnostics: unknown }).diagnostics])))}`);
  });

  test('a lost context: the message line goes on from its first display, not replayed; in the map the ready credential, lock and hidden pointer go at once, and restored the picture comes before any lock', async ({ page }, testInfo) => {
    const fixture = await startableCockpit();
    await developmentMenu(page);
    await startKeyboardFlight(page);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= 20, 30_000);

    // F1: the speed-assist message (mode 2, colour 0xF) starts scrolling at its toggle's draw; the context is lost at
    // once and restored about 12 ticks later, while the run and the cockpit go on.
    await page.keyboard.press('Control+Enter');
    await expect.poll(async () => (await page.evaluate(readLog, ['speed-assist-toggled'])).length).toBe(1);
    const [{ tick: toggled }] = await page.evaluate(readLog, ['speed-assist-toggled']);
    await loseContext(page, false);
    await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'context-lost');
    const lost = await renderDiagnostics(page);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= toggled + 12, 30_000);
    expect(await renderDiagnostics(page), 'nothing drawn while lost').toMatchObject({ state: 'context-lost', draws: lost.draws });
    await glRecord(page);
    await loseContext(page, true);
    await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'ready');
    const restoredAt = (await cockpitState(page)).tick;
    const line = instrument(fixture, 8);
    const width = line.x1 - line.x0 - 1;
    const text = fixture.flightMessages.speedAssistOn;
    const { image, state } = await pauseWhen(page, current => current.tick >= toggled + 25, 'the message 25 ticks on');
    const offset = (start: number) => messageOffset(2, state.clock - clockAt(state, start), width);
    expect(messageLineWrong(image, fixture, line, text, offset(toggled), COLOUR.speedAssist), 'scrolled from its first display').toEqual([]);
    expect(messageLineWrong(image, fixture, line, text, offset(restoredAt), COLOUR.speedAssist).length, 'not restarted at the restoration').toBeGreaterThan(0);
    expect(await cockpitCounts(page), 'queued once').toMatchObject({ messages: 1, messageDrops: 0 });
    const afterLoss = await glRecord(page);
    expectCockpitPass(afterLoss.frames, 'restored F1');
    // No sound consumer exists in this build (P3-14), so there is no sound to replay.
    await expect(page.getByTestId('mission-screen')).toContainText('Sound effects are not implemented yet (P3-14).');
    await resume(page);

    // The map, ready after its first picture and locked by `m`'s activation.
    await page.keyboard.press('m');
    await waitForMapView(page, view => view.viewMode === MAP_VIEW && view.map !== null, 'm did not open the map');
    await expect.poll(() => zoneLocked(page)).toBe(true);
    await expect(page.getByTestId('input-status')).not.toContainText('Map input');
    expect(await cursorStyle(page)).toBe('none');
    await loseContext(page, false);
    await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'context-lost');
    await expect.poll(() => zoneLocked(page), { message: 'the lock ends with the context' }).toBe(false);
    await expect(page.getByTestId('input-status')).toContainText('Map input is not ready.');
    expect(await cursorStyle(page), 'the system pointer is back').not.toBe('none');
    const lostTick = (await cockpitState(page)).tick;
    await waitForFrame(page, frame => (frame.tick ?? 0) >= lostTick + 20, 30_000);
    const whileLost = await glRecord(page);
    expect(whileLost.locks.at(-1), 'unlocked while lost').toMatchObject({ locked: false });
    const unlocked = whileLost.locks.at(-1)!.time;
    expect(whileLost.frames.filter(frame => frame.closed > unlocked), 'no picture while lost').toEqual([]);
    await loseContext(page, true);
    await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'ready');
    // Restored, the map is drawn first; then the input qualifies again and asks for the lock as P3-05 does. Chrome grants
    // it at once while the page holds a user activation (here, the test's own evaluations), otherwise a click is needed,
    // which locks without selecting.
    await expect(page.getByTestId('input-status')).not.toContainText('Map input', { timeout: 5_000 });
    if (!await zoneLocked(page)) {
      const box = (await zone(page).boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect.poll(() => zoneLocked(page)).toBe(true);
    const restored = await glRecord(page);
    const relocked = restored.locks.slice(whileLost.locks.length);
    expect(relocked.map(({ locked }) => locked), 'one lock after the restoration').toEqual([true]);
    const picture = firstPicture(restored.frames, unlocked);
    expect(relocked[0].time, 'locked after the restored picture was submitted').toBeGreaterThan(picture.closed);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= lostTick + 40, 30_000);
    expect((await mapWarpLog(page)).filter(entry => entry.type === 'warp-destination-set'), 'no selection').toEqual([]);
    expect(await mapView(page)).toMatchObject({ viewMode: MAP_VIEW });
    await testInfo.attach('context-loss', {
      body: JSON.stringify({ toggled, restoredAt, paused: state.tick, lostTick, firstPicture: picture, relocked: relocked[0] }), contentType: 'application/json',
    });
  });

  test('a lost layout in the map revokes the credential, lock and hidden pointer, and back it draws before the lock; a resize changes only the scale of the same picture', async ({ page }, testInfo) => {
    await developmentMenu(page);
    await startKeyboardFlight(page);
    await waitForBridge(page, view => view.map?.warpRequest === 'no-destination', 'The flight did not reach its player');
    await page.keyboard.press('m');
    await waitForMapView(page, view => view.viewMode === MAP_VIEW && view.map !== null, 'm did not open the map');
    await expect.poll(() => zoneLocked(page)).toBe(true);
    // The flight area out of the layout: the surface has no size, so no picture is submitted and the input has no geometry.
    const hidden = await page.addStyleTag({ content: '[data-testid="flight-area"] { display: none !important; }' });
    await expect.poll(async () => (await renderDiagnostics(page)).buffer).toBe('none');
    await expect.poll(() => zoneLocked(page), { message: 'the lock ends with the layout' }).toBe(false);
    await expect(page.getByTestId('input-status')).toContainText('Map input is not ready.');
    expect(await cursorStyle(page), 'the system pointer is back').not.toBe('none');
    const draws = (await renderDiagnostics(page)).draws;
    const lostTick = (await cockpitState(page)).tick;
    await waitForFrame(page, frame => (frame.tick ?? 0) >= lostTick + 20, 30_000);
    expect((await renderDiagnostics(page)).draws, 'nothing drawn without a layout').toBe(draws);
    const whileHidden = await glRecord(page);
    const unlocked = whileHidden.locks.at(-1)!.time;
    expect(whileHidden.frames.filter(frame => frame.closed > unlocked), 'no picture without a layout').toEqual([]);
    await hidden.evaluate(element => { (element as HTMLElement).remove(); });
    await expect(page.getByTestId('input-status')).not.toContainText('Map input', { timeout: 5_000 });
    if (!await zoneLocked(page)) {
      const box = (await zone(page).boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect.poll(() => zoneLocked(page)).toBe(true);
    const shown = await glRecord(page);
    const relocked = shown.locks.slice(whileHidden.locks.length);
    expect(relocked.map(({ locked }) => locked), 'one lock after the layout returned').toEqual([true]);
    const picture = firstPicture(shown.frames, unlocked);
    expect(relocked[0].time, 'locked after the first picture was submitted').toBeGreaterThan(picture.closed);
    expect((await mapWarpLog(page)).filter(entry => entry.type === 'warp-destination-set'), 'no selection').toEqual([]);

    // Paused, the map picture at a narrower window is the same logical picture at the smaller scale: each device pixel
    // shows the logical pixel its centre falls in (AC-19); the run keeps its one render target, re-acquired at the new size.
    await pause(page);
    await nextFrames(page);
    const pausedTick = (await cockpitState(page)).tick;
    const before = await screenPicture(page);
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: 520, height: 800 });
    await expect.poll(async () => (await renderDiagnostics(page)).buffer).not.toBe('640 × 480 at 1×');
    const narrow = await renderDiagnostics(page);
    expect(narrow.resources).toMatch(/ 1 render targets$/);
    await nextFrames(page);
    const resized = await screenPicture(page);
    const scale = Number(/^(\d+) ×/.exec(narrow.buffer)![1]) / 640;
    expect(scaledMismatches(before, resized, scale), `the same picture at scale ${scale}`).toEqual([]);
    expect((await cockpitState(page)).tick, 'the resize advanced nothing').toBe(pausedTick);
    await page.setViewportSize(size);
    await expect.poll(async () => (await renderDiagnostics(page)).buffer).toBe('640 × 480 at 1×');
    await nextFrames(page);
    expect(scaledMismatches(before, await screenPicture(page), 1)).toEqual([]);
    await testInfo.attach('layout-loss', { body: JSON.stringify({ lostTick, relocked: relocked[0], firstPicture: picture, narrow }), contentType: 'application/json' });
  });

  test('budgets and faults: a full message queue drops new items and runs on; a failing cockpit draw faults the run as the consumer\'s, releases its resources, and a new owner draws again', async ({ page }, testInfo) => {
    await developmentMenu(page);
    await settleTooling(page);
    const balance = await ResourceBalance.start(page, testInfo, { audio: false });
    await startKeyboardFlight(page);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= 10, 30_000);
    // Every Ctrl+Enter queues a speed-assist message: past 64 queued items the new ones are dropped and counted (Δ-05),
    // without a fault.
    const toggles = 90;
    for (let press = 0; press < toggles; press++) await page.keyboard.press('Control+Enter');
    await expect.poll(async () => (await page.evaluate(readLog, ['speed-assist-toggled'])).length, { timeout: 10_000 }).toBe(toggles);
    const counts = await cockpitCounts(page);
    expect(counts!.messages, 'the queue at its bound').toBe(64);
    expect(counts!.messageDrops, 'dropped new items').toBeGreaterThan(0);
    expect(counts!.messages + counts!.messageDrops, 'every message queued or dropped, at most a few shown and gone').toBeGreaterThan(toggles - 5);
    await expect(status(page)).toHaveAttribute('data-phase', 'running');
    expect(await renderDiagnostics(page)).toMatchObject({ state: 'ready' });

    // A failure of the cockpit layer's draw that is not the device's: the renderer fails, the run faults with the
    // consumer's failure and the run's resources are released (P3-12's classification); a lost context is the device's
    // and only suspends the picture (the context-loss case above).
    await armGlFault(page, 'draw-cockpit');
    await expect(status(page)).toHaveAttribute('data-phase', 'faulted');
    await expect(page.getByTestId('flight-notice')).toContainText('The flight picture failed, so the run cannot continue.');
    await expect(page.getByTestId('mission-screen')).toContainText('consumer failure');
    const failed = await renderDiagnostics(page);
    expect(failed).toMatchObject({ state: 'failed', run: 'none', resources: 'none' });
    expect((await glRecord(page)).injected).toEqual(['draw-cockpit']);
    await expectStableTick(page);
    // Back at the menu everything is released; a new owner, with a new surface, draws the same counts as warm runs do.
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await balance.check('after the fault');
    await startKeyboardFlight(page);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= 20, 30_000);
    expect(await renderDiagnostics(page)).toMatchObject({ state: 'ready', run: '1' });
    expectCockpitPass((await glRecord(page)).frames, 'the new owner');
    await button(page, 'Mission menu').click();
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeVisible();
    await balance.check('after the new owner');
    await balance.attach('fault-resources');
    await testInfo.attach('budgets-and-faults', { body: JSON.stringify({ counts, failed }), contentType: 'application/json' });
    console.info(`Cockpit budgets and faults: ${JSON.stringify({ counts, failed })}`);
  });

  test('a screen flash in a letterboxed view changes only the game image: the black bars and the controls stay as they were', async ({ page }, testInfo) => {
    const fixture = await startableCockpit();
    // The collision variant's first collisions (ticks 2–4, run seed 23) start a flash (support/cockpit.ts).
    await seededMenu(page, await collisionPackage(), { worker: 'mission-startable', seeds: '23,79' });
    // A wider view than 4:3, as 28's geometry case does: the game image keeps 4:3 between black bars.
    await page.addStyleTag({ content: '.mission-view { aspect-ratio: 2 / 1 !important; max-width: 60rem !important; }' });
    await startKeyboardFlight(page);
    let flash = await pauseWhen(page, state => state.tick >= 4, 'the first collisions');
    if (flashFits(flash.image, fixture).length === 0 && flash.state.tick < 12) {
      await resume(page);
      flash = await after(page, 1);
    }
    expect(flashFits(flash.image, fixture), `a flash picture at tick ${flash.state.tick}`).toHaveLength(1);
    const { left, top, width, height } = await canvasBox(page);
    const view = await page.getByTestId('flight-view').evaluate(element => element.getBoundingClientRect().toJSON() as DOMRect);
    expect(left - view.left, 'a bar on the left').toBeGreaterThan(10);
    const bars: [number, number][] = [[view.left + 2, top + height / 2], [left - 2, top + 2], [left + width + 2, top + height - 2], [view.right - 2, top + height / 2]];
    expect(await pagePixels(page, bars), 'black bars during the flash').toEqual(bars.map(() => [0, 0, 0]));
    const controls = await page.getByTestId('mission-status').screenshot();
    await resume(page);
    const calm = await after(page, 40);
    expect(flashFits(calm.image, fixture), 'the flash is over').toEqual([]);
    expect(await pagePixels(page, bars), 'black bars after it').toEqual(bars.map(() => [0, 0, 0]));
    expect(await page.getByTestId('mission-status').screenshot(), 'the controls look the same').toEqual(controls);
    await testInfo.attach('letterboxed-flash', { body: JSON.stringify({ tick: flash.state.tick, fits: flashFits(flash.image, fixture), bar: left - view.left }), contentType: 'application/json' });
  });

  // That the refusal comes before `beginRun` and so before any GPU allocation is the Node half's
  // (src/render/cockpit/composition/cockpit-lifecycle.test.ts); three.js creates GL objects only at a first draw.
  test('content a cockpit module refuses is the run\'s contract failure: the start is refused with its structured reason, and nothing is drawn or kept', async ({ page }) => {
    await page.addInitScript(installGlRecorder);
    // The map geometry's rectangle moved one pixel; the slot-2 type-10 record keeps the old one (DC-02).
    await seededMenu(page, editMapGeometryOnly(await missionPackage(), { x0: 22, y0: 45, x1: 611, y1: 444 }), { worker: 'mission-startable', seeds: SEEDS });
    await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'button');
    // The owner's surface exists before any run (P3-12); the run's own allocations would come with the start.
    const before = await glRecord(page);
    await button(page, 'Start').click();
    await expect(page.getByText('Starting the run failed while connecting the run\'s consumers.', { exact: false })).toBeVisible();
    await expect(page.getByText('ContentContractError', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('flight-area')).toHaveCount(0);
    expect(await missionFrame(page)).toMatchObject({ run: null });
    const after = await glRecord(page);
    expect(after.frames, 'no picture').toEqual([]);
    expect(after.framebuffers, 'no render target').toBe(before.framebuffers);
    expect(after.depthAllocations, 'no depth attachment').toEqual(before.depthAllocations);
    expect(liveContexts(after).live, 'no live context').toBe(0);
  });
});

test.describe('production build', () => {
  only('production');

  /** The recorder and a CSP violation log installed, the package seeded under the production identity and restored. */
  async function productionMenu(page: Page): Promise<void> {
    await page.addInitScript(installGlRecorder);
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { osrViolations: string[] }).osrViolations = seen;
      document.addEventListener('securitypolicyviolation', event => { seen.push(`${event.effectiveDirective} ${event.blockedURI}`); });
    });
    await page.goto('/');
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
    await seedProductionCache(page, await missionPackage());
    await page.reload();
    await button(page, 'Open saved resources').click();
    await expect(page.getByTestId('resource-statuses').getByText('Mission loads into Core', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  }
  const violations = (page: Page) => page.evaluate(() => (window as unknown as { osrViolations: string[] }).osrViolations);

  test('one canvas, context and cockpit pass per frame without diagnostics; a lost context in the map revokes and restores it; restarts and the return release everything', async ({ page }, testInfo) => {
    await productionMenu(page);
    await settleTooling(page);
    const balance = await ResourceBalance.start(page, testInfo, { audio: false });
    await startKeyboardFlight(page);
    await waitForBridge(page, view => view.context === 'flight' && view.map?.warpRequest === 'no-destination', 'The flight did not reach its player');
    await expect(page.getByTestId('mission-dev-panel')).toHaveCount(0);
    for (const run of [1, 2]) {
      await waitForFrame(page, frame => frame.run === run && (frame.tick ?? 0) >= 30, 30_000);
      const record = await glRecord(page);
      expectCockpitPass(record.frames, `run ${run}`);
      expect(liveContexts(record), `run ${run}: live contexts`).toEqual({ live: 1, stale: record.contexts.length - 1 });
      await expect(page.locator('canvas')).toHaveCount(1);
      const probe = await frameWindow(page);
      expect(probe.frames.maximum, `run ${run}: frames in flight`).toBeLessThanOrEqual(1);
      if (run === 1) {
        await page.keyboard.press('m');
        await waitForMapView(page, view => view.viewMode === MAP_VIEW && view.map !== null, 'm did not open the map');
        await expect.poll(() => zoneLocked(page)).toBe(true);
        await loseContext(page, false);
        await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'context-lost');
        await expect.poll(() => zoneLocked(page)).toBe(false);
        await expect(page.getByTestId('input-status')).toContainText('Map input is not ready.');
        expect(await cursorStyle(page)).not.toBe('none');
        await loseContext(page, true);
        await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'ready');
        await expect(page.getByTestId('input-status')).not.toContainText('Map input', { timeout: 5_000 });
        // Paused, the lock ends, so the controls take the mouse again.
        await pause(page);
        await expect.poll(() => zoneLocked(page)).toBe(false);
        await restart(page);
      }
    }
    await button(page, 'Mission menu').click();
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await balance.check('back at the menu');
    expect((await glRecord(page)).contexts.filter(context => context.connected || !context.lost), 'every context released').toEqual([]);
    expect(await violations(page)).toEqual([]);
    await balance.attach('production-resources');
  });

  test('a cockpit resource that cannot be released latches the cleanup failure with its structured reason; only a reload starts missions again', async ({ page }) => {
    await productionMenu(page);
    await startKeyboardFlight(page);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= 20, 30_000);
    await armGlFault(page, 'delete-cockpit-texture');
    await button(page, 'Mission menu').click();
    await button(page, 'Restart mission').click();
    await expect(page.getByTestId('cleanup-failure')).toContainText('Releasing the mission\'s resources could not be confirmed. No new mission can be started until the page is reloaded');
    await expect(page.getByTestId('cleanup-failure')).toContainText('Synthetic failure releasing the cockpit picture (P3-13/29)');
    expect((await glRecord(page)).injected).toEqual(['delete-cockpit-texture']);
    await expect(status(page)).toHaveAttribute('data-phase', 'idle');
    await expect(button(page, 'Start')).toHaveCount(0);
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'cleanup-failed');
    await expect(missionEntry(page)).toBeDisabled();
    await expect(page.getByText('An earlier mission cleanup failed, so no mission can be started until the page is reloaded.')).toBeVisible();
    // A reload is a new document: the saved package restores and the mission flies again.
    await page.reload();
    await button(page, 'Open saved resources').click();
    await expect(page.getByTestId('resource-statuses').getByText('Mission loads into Core', { exact: true })).toBeVisible({ timeout: 30_000 });
    await startKeyboardFlight(page);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= 20, 30_000);
    expectCockpitPass((await glRecord(page)).frames, 'after the reload');
    expect(await violations(page)).toEqual([]);
  });
});

// The network audit allows no capability query on the test entry, so the Pointer Lock fallback case runs without it
// (as map-picture.development.spec.ts does); every other case is audited.
plain.describe('development build without Pointer Lock', () => {
  plain.beforeEach(({ page }, testInfo: TestInfo) => {
    void page;
    plain.skip(testInfo.project.name !== 'development', 'development build only');
  });

  plain('depth: F1 clears the world\'s depth; the map\'s frames and then the Warp\'s neither clear nor write it, with the one depth attachment of the run\'s one render target throughout', async ({ page }, testInfo) => {
    await page.addInitScript(installGlRecorder);
    // Without Pointer Lock (the P3-05 fallback), a click in the main map selects the Warp destination.
    await seededMenu(page, await missionPackage(), { worker: 'mission-startable', seeds: SEEDS, pointerLock: 'unsupported' });
    await startKeyboardFlight(page);
    await waitForBridge(page, view => view.map?.warpRequest === 'no-destination', 'The flight did not reach its player');
    await waitForFrame(page, frame => (frame.tick ?? 0) >= 20, 30_000);
    const frames: GlFrame[] = [];
    const collect = async () => {
      const record = await glRecord(page);
      frames.push(...record.frames);
      return record;
    };
    const start = await collect();
    frames.length = 0;
    const { tick } = await cockpitState(page);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= tick + 3, 30_000);
    await page.keyboard.press('m');
    const { map } = await waitForMapView(page, view => view.viewMode === MAP_VIEW && view.map !== null, 'm did not open the map');
    const { left, top, scale, scaleY } = await canvasBox(page);
    const { main } = map!.geometry;
    await page.mouse.click(left + (main.x + 230.5) * scale, top + (main.y + 127.5) * scaleY);
    await waitForBridge(page, view => view.map?.warpRequest === 'accepted', 'No accepted Warp destination');
    await collect();
    await page.keyboard.press('w');
    await waitForBridge(page, view => view.context === 'warp', 'The Warp did not start');
    const completion = (await waitForMapWarpLog(page, 4, 120_000)).find(entry => entry.type === 'warp-completed');
    expect(completion, 'the Warp completed').toBeDefined();
    await waitForBridge(page, view => view.viewMode === FLIGHT_VIEW, 'F1 after the Warp', 30_000);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= completion!.tick + 10, 30_000);
    const end = await collect();

    // Frames by kind: F1 draws the world and clears depth; the map draws only the cockpit; the Warp draws stars, its
    // effect and the world without a depth clear (RS6).
    const kind = (frame: GlFrame) => (frame.otherGameDraws === 0 ? 'map' : frame.gameDepthClears > 0 ? 'f1' : 'warp');
    const runs: { kind: string; count: number }[] = [];
    for (const frame of frames) {
      if (runs.at(-1)?.kind === kind(frame)) runs.at(-1)!.count += 1;
      else runs.push({ kind: kind(frame), count: 1 });
    }
    expect(runs.map(({ kind: name }) => name), 'F1, the map, the Warp, F1').toEqual(['f1', 'map', 'warp', 'f1']);
    expect(runs[1].count).toBeGreaterThan(3);
    expect(runs[2].count).toBeGreaterThan(30);
    const kept = frames.slice(runs[0].count, runs[0].count + runs[1].count + runs[2].count);
    expect(kept.reduce((sum, frame) => sum + frame.gameDepthClears, 0), 'no depth clear from the map through the Warp').toBe(0);
    expectCockpitPass(frames, 'F1, map and Warp');
    expect(new Set(frames.map(frame => frame.depthTexture)), 'one depth attachment').toEqual(new Set([frames[0].depthTexture]));
    expect(frames[0].depthTexture).toBeGreaterThan(0);
    expect(end.depthAllocations, 'no depth allocation since the run began').toEqual(start.depthAllocations);
    expect(end.framebuffers, 'no framebuffer created since').toBe(start.framebuffers);
    expect((await renderDiagnostics(page)).resources).toMatch(/ 1 render targets$/);
    await testInfo.attach('depth', { body: JSON.stringify({ runs, depthAllocations: end.depthAllocations, framebuffers: end.framebuffers }), contentType: 'application/json' });
    console.info(`Cockpit depth: ${JSON.stringify({ runs, depthTexture: frames[0].depthTexture, depthAllocations: end.depthAllocations })}`);
  });
});
