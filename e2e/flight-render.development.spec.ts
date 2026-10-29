import type { Page } from '@playwright/test';
import { scenarioFiles } from '../src/workers/import-scenarios.test-support.ts';
import { button, filePayloads, importFiles } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { imageMismatches, mapFramePixels } from './support/cockpit.ts';
import {
  classifyWarp, expectF1Background, flightDiagnostics, flightPicture, flyMission, pauseFlight, type FlightDiagnosticsRead,
} from './support/flight-flow.ts';
import { pagePixels } from './support/flight-pictures.ts';
import { startKeyboardFlight } from './support/keyboard-input.ts';
import {
  bridgeView, FLIGHT_VIEW, submitEditorCommand, waitForBridge, waitForMapWarpLog, WARP_VIEW, type BridgeView,
} from './support/map-warp.ts';
import { endPlaceholder, expectAdvancingTick, expectStableTick, missionEntry, missionFrame, waitForFrame } from './support/mission-observations.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';

// P3-12/25 (docs/plan/p3/12/spec.md, 验证策略; AC-02 to AC-05, AC-15, AC-16, AC-22, AC-23): the flight picture of the
// formal mission flow in a development build. The development test entry imports the synthetic `mission-startable`
// package through the real module Worker; the run is driven only by trusted input on the page's controls and, for the
// Warp destination, by the diagnostics panel's own command editor (P3-09). Pixels are the composited page and their
// expectation is computed independently (support/flight-flow.ts); runtime facts come from the screen's attributes and
// the panel. The network audit runs throughout. The isolated scenes are flight-scenes.development.spec.ts; the cockpit
// drawn over the picture since P3-13 is set aside here by its rectangles and colours and checked in cockpit.*.spec.ts.

test.describe.configure({ timeout: 240_000 });

const SEEDS = Object.freeze([0x0eed_0040, 0x0eed_0041, 0x0eed_0042, 0x0eed_0043]);
const MISSION_LOADS = /Mission (?:loads|does not load) into Core/;

let disc: Promise<readonly File[]> | undefined;

/** Imports `mission-startable` through the test entry's import page and returns to the main menu. */
async function importMission(page: Page, open = true): Promise<void> {
  const files = await filePayloads([...await (disc ??= scenarioFiles('mission-startable'))]);
  if (open) {
    await importFiles(page, files, { worker: 'mission-startable', seeds: SEEDS.join(',') }, MISSION_LOADS);
  } else {
    await button(page, 'Import original game data').click();
    await page.locator('#import-files').setInputFiles([...files]);
    await button(page, 'Start import').click();
    await expect(page.getByTestId('import-statuses')).toContainText(MISSION_LOADS, { timeout: 60_000 });
  }
  await button(page, 'Return to menu').click();
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: Resources are held in this page.');
}

/** Every animation frame interval over `milliseconds`, in the page. */
const frameIntervals = (page: Page, milliseconds: number) => page.evaluate(async duration => {
  const times: number[] = [];
  await new Promise<void>(resolve => {
    const step = (time: number) => {
      times.push(time);
      if (time - times[0] < duration) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  return times.slice(1).map((time, index) => time - times[index]);
}, milliseconds);

const quantile = (values: readonly number[], q: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(q * values.length))];

test('the F1 picture is the start nebula, stars and dust in black borders; pause holds it; a resize redraws it; a lost context stops drawing and its restoration draws on', async ({ page }, testInfo) => {
  await importMission(page);
  await flyMission(page);
  await pauseFlight(page);
  const paused = await expectStableTick(page);
  const first = await flightPicture(page);
  const background = expectF1Background(first);
  await expect(page.getByTestId('mission-status').getByTestId('mission-sound')).toHaveText(/^Sound: /);
  await expect(page.getByTestId('flight-area').locator('canvas')).toHaveAttribute('aria-label', 'Flight view');

  // Paused, nothing draws: the draw count and last tick hold across real frames (AC-04).
  const held = await flightDiagnostics(page);
  expect(held).toMatchObject({ state: 'ready', run: '1' });
  expect(held.lastTick).toBeLessThanOrEqual(paused);
  await expectStableTick(page, 400);
  expect(await flightDiagnostics(page)).toEqual(held);

  // A narrower window: the game view shrinks below its 640-pixel width, the buffer follows at 4:3, and the redrawn
  // picture, still without a tick, is the same logical picture at the smaller scale: each device pixel shows the logical
  // pixel its centre falls in (AC-05, AC-16).
  const before = await page.viewportSize();
  await page.setViewportSize({ width: 520, height: 800 });
  await expect.poll(async () => (await flightDiagnostics(page)).buffer).not.toBe(held.buffer);
  const narrow = await flightDiagnostics(page);
  expect(narrow.lastTick).toBe(held.lastTick);
  const resized = await flightPicture(page);
  const width = Number(/^(\d+) ×/.exec(narrow.buffer)![1]);
  const scale = width / 640;
  // The logical pixels a device pixel's centre may show: two where the centre falls exactly on a texel edge.
  const sources = (logical: number, size: number) => {
    const at = (Math.floor((logical + 0.5) * scale) + 0.5) / scale;
    const below = Math.min(size - 1, Math.floor(at));
    return Number.isInteger(at) ? [below - 1, below] : [below];
  };
  const wrongScaled: { x: number; y: number }[] = [];
  for (let y = 0; y < 480; y++) {
    for (let x = 0; x < 640; x++) {
      const actual = resized.image.at(x, y).join();
      if (!sources(y, 480).some(sy => sources(x, 640).some(sx => first.image.at(sx, sy).join() === actual))) wrongScaled.push({ x, y });
    }
  }
  expect(wrongScaled.slice(0, 10), `${wrongScaled.length} pixels at scale ${scale}`).toEqual([]);
  const area = await page.getByTestId('flight-view').evaluate(element => element.getBoundingClientRect().toJSON() as { left: number; top: number; width: number; height: number });
  const canvas = await page.getByTestId('flight-area').locator('canvas').evaluate(element => element.getBoundingClientRect().toJSON() as { left: number; top: number; width: number; height: number });
  const borders: [number, number][] = [];
  if (canvas.top - area.top >= 2) borders.push([area.left + area.width / 2, area.top + 1]);
  if (canvas.left - area.left >= 2) borders.push([area.left + 1, area.top + area.height / 2]);
  if (borders.length > 0) expect(await pagePixels(page, borders)).toEqual(borders.map(() => [0, 0, 0]));
  await page.setViewportSize(before!);
  await expect.poll(async () => (await flightDiagnostics(page)).buffer).toBe(held.buffer);

  // Running: the local frame intervals, recorded without a threshold (AC-22).
  await button(page, 'Resume').click();
  await expectAdvancingTick(page);
  const intervals = await frameIntervals(page, 3000);
  const timing = { frames: intervals.length, median: quantile(intervals, 0.5), p95: quantile(intervals, 0.95), max: Math.max(...intervals) };
  const running = await flightDiagnostics(page);
  expect(running.draws).toBeGreaterThan(held.draws);

  // A lost context: the notice says so, nothing draws while the run goes on; restored, it draws from the current state
  // (AC-03), and the paused picture is again the background of the same start.
  // The extension object is kept on the canvas for the restoration: a lost context returns no extensions.
  const lose = (restore: boolean) => page.getByTestId('flight-area').locator('canvas').evaluate((element, again) => {
    const canvas = element as HTMLCanvasElement & { osrLoseContext?: WEBGL_lose_context };
    canvas.osrLoseContext ??= canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    if (again) canvas.osrLoseContext.restoreContext();
    else canvas.osrLoseContext.loseContext();
  }, restore);
  await lose(false);
  await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'context-lost');
  await expect(page.getByTestId('flight-notice')).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('flight-notice')).toContainText('graphics context was lost');
  const lost = await flightDiagnostics(page);
  expect(lost.state).toBe('context-lost');
  await expectAdvancingTick(page);
  expect(await flightDiagnostics(page)).toMatchObject({ draws: lost.draws, lastTick: lost.lastTick, state: 'context-lost' });
  await lose(true);
  await expect(page.getByTestId('flight-area')).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId('flight-notice')).toHaveCount(0);
  await expect.poll(async () => (await flightDiagnostics(page)).draws).toBeGreaterThan(lost.draws);
  await pauseFlight(page);
  const restored = await flightDiagnostics(page);
  expect(restored.lastTick).toBeGreaterThan(lost.lastTick!);
  const again = expectF1Background(await flightPicture(page));
  expect(again.start).toBe(background.start);
  await testInfo.attach('flight-flow', { body: JSON.stringify({ background, again, held, narrow, running, lost, restored, timing }), contentType: 'application/json' });
  const summary = `${timing.frames} frames over 3 s: median ${timing.median.toFixed(1)} ms, p95 ${timing.p95.toFixed(1)} ms, max ${timing.max.toFixed(1)} ms (no threshold)`;
  testInfo.annotations.push({ type: 'frame-intervals', description: summary });
  console.info(`Flight frame intervals, ${page.context().browser()?.version()}: ${summary}; nebula start ${background.start}, dust ${background.dust}`);
});

// The run's GPU cache allocates a model's resources when it first draws it, so counts compare only at the same tick of
// the same world: flight-scenes.development.spec.ts compares them there; here each run binds its own and returns them.
test('a restart and a replaced package draw again, each run with its own resources, and every return leaves the menu balanced', async ({ page }, testInfo) => {
  await importMission(page);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });
  const reads: Record<string, FlightDiagnosticsRead> = {};
  const fly = async (label: string, run: string) => {
    await waitForFrame(page, frame => frame.position === 'flight' && frame.run === Number(run));
    await expectAdvancingTick(page);
    await pauseFlight(page);
    expectF1Background(await flightPicture(page));
    reads[label] = await flightDiagnostics(page);
    expect(reads[label]).toMatchObject({ state: 'ready', run, buffer: '640 × 480 at 1×' });
    expect(reads[label].resources).toMatch(/^\d+ geometries .* 1 render targets$/);
  };

  const { owner: firstOwner } = await flyMission(page);
  await fly('first run', '1');
  // A restart: the next run of the same owner binds its own resources, the same counts.
  await button(page, 'Mission menu').click();
  await button(page, 'Restart mission').click();
  await endPlaceholder(page, 'G-02/1', 'button');
  await button(page, 'Start').click();
  await endPlaceholder(page, 'G-02/2', 'button');
  await fly('restart', '2');
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  await expect(page.locator('canvas')).toHaveCount(0);
  await balance.check('after the restart');

  // The same disc imported again replaces the held package; a new owner, with a surface of its own, draws it, and every
  // earlier flight canvas stays released. (The contents are equal, so stale content would not show in the picture; the
  // package binding is the renderer's Node-tested owner, run, generation and identity check, P3-12/15.)
  await importMission(page, false);
  const earlier = await page.evaluate(() => window.osrProbe.snapshot().canvases.length);
  const { owner: replacedOwner } = await flyMission(page);
  expect(replacedOwner).not.toBe(firstOwner);
  expect(await page.evaluate(at => window.osrProbe.snapshot().canvases.slice(0, at).filter(canvas => canvas.connected || !canvas.lost).length, earlier)).toBe(0);
  await fly('replaced package', '1');
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  await expect(page.locator('canvas')).toHaveCount(0);
  await balance.check('after the replaced package');
  await balance.attach('flight-resources');
  await testInfo.attach('flight-diagnostics', { body: JSON.stringify(reads), contentType: 'application/json' });
});

/** The centre of main-map pixel column 230, row 127 (of 400 × 400), clear of the synthetic mission's icons (P3-09). */
const DESTINATION = Object.freeze({ operation: 'select', right: String(230.5 / 400), down: String(127.5 / 400) });

/** Pauses, reads and resumes; resolves to the read once its static cockpit band is in index 0, that is, outside a flash. */
async function warpRead(page: Page, accept: (view: BridgeView) => boolean, what: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await waitForBridge(page, accept, what, 90_000);
    await pauseFlight(page);
    const view = await bridgeView(page);
    const read = classifyWarp(await flightPicture(page));
    await button(page, 'Resume').click();
    await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
    if (accept(view) && read.band === 0) return { view, read };
    await waitForFrame(page, frame => (frame.tick ?? 0) >= (view.tick ?? 0) + 4);
  }
  throw new Error(`No flash-free picture: ${what}`);
}

test('a real Warp through the map and the panel\'s editor draws the tunnel and dust lines over the stars, and F1 again after it', async ({ page }, testInfo) => {
  await importMission(page);
  await startKeyboardFlight(page);
  await waitForBridge(page, candidate => candidate.map?.warpRequest === 'no-destination', 'The flight did not reach its player');
  await page.keyboard.press('m');
  await waitForBridge(page, candidate => candidate.context === 'map', 'm did not open the map');
  expect(await submitEditorCommand(page, 'map-point', DESTINATION)).toMatchObject({ outcome: 'accepted' });
  await waitForBridge(page, candidate => candidate.map?.warpRequest === 'accepted', 'No accepted Warp destination');
  // In the map no world draws (AC-23): the cockpit's map picture fills the screen instead (P3-13), its frame elements in
  // the map palette and no tunnel colour (the map picture's own browser regression is P3-13/28's).
  await pauseFlight(page);
  const mapRead = await flightPicture(page);
  expect(imageMismatches(mapRead.image, mapFramePixels(mapRead.cockpit))).toEqual([]);
  const map = classifyWarp(mapRead);
  expect(map.tunnel).toBe(0);
  await button(page, 'Resume').click();
  // Refocused by a click, which in the map selects nothing (P3-09).
  await page.getByTestId('game-input-zone').click();
  await page.keyboard.press('w');
  const view = await waitForBridge(page, candidate => candidate.context === 'warp', 'The Warp did not start');
  expect(view.viewMode).toBe(WARP_VIEW);
  const started = (await waitForMapWarpLog(page, 3)).find(entry => entry.type === 'warp-started')!;
  expect(started).toBeDefined();

  // In the Warp, after the start's flash: outside the cockpit's rectangles the tunnel's green and grey lines, palette
  // colours for stars and dust, nothing else, and the static cockpit band in index 0; the dust draws lines while the
  // share exceeds 1.
  const inWarp = await warpRead(page, candidate => candidate.viewMode === WARP_VIEW && (candidate.tick ?? 0) >= started.tick + 60, 'A Warp picture after its start flash');
  expect(inWarp.read).toMatchObject({ other: 0, band: 0 });
  expect(inWarp.read.tunnel).toBeGreaterThan(200);
  // Dust lines: palette pixels joined into runs (the stars are single pixels).
  expect(inWarp.read.joined).toBeGreaterThan(10);
  // After it: F1, no tunnel colour left.
  const completion = (await waitForMapWarpLog(page, 4, 90_000)).find(entry => entry.type === 'warp-completed')!;
  expect(completion.fields).toMatchObject({ arrived: 'true' });
  const after = await warpRead(page, candidate => candidate.viewMode === FLIGHT_VIEW && (candidate.tick ?? 0) >= completion.tick + 60, 'An F1 picture after the Warp');
  // F1 again: no tunnel colour; the world viewport shows the stars and backgrounds of the arrival's rows.
  expect(after.read).toMatchObject({ tunnel: 0, band: 0 });
  expect(after.read.palette + after.read.other).toBeGreaterThan(30);
  expect(await missionFrame(page)).toMatchObject({ position: 'flight' });
  await testInfo.attach('warp-picture', { body: JSON.stringify({ map, started: started.tick, inWarp, completion: completion.tick, after }), contentType: 'application/json' });
});
