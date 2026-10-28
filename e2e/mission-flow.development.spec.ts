import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { CDPSession, Page, TestInfo } from '@playwright/test';
import { catalogFor } from '../src/original-data/source/source.test-support.ts';
import { MISSION_OBJECTIVES, SLICE_GAPS } from '../src/ui/mission/slice-gaps-copy.ts';
import type { Recording } from '../src/core/replay/recording.ts';
import { GAME_REPLAY_VERSION } from '../src/core/replay/recording.ts';
import { RULES_VERSION } from '../src/core/replay/rules-version.ts';
import { MISSION_SCENARIOS, scenarioFiles, scenarioSource, type MissionScenario } from '../src/workers/import-scenarios.test-support.ts';
import { exitCode, runReplayCheck } from '../tools/replay-check.ts';
import { button, filePayloads, importFiles, openTestEntry } from './support/app-entry.ts';
import {
  bridgeView, countPointerLockChanges, expectedCharge, FLIGHT_VIEW, MAP_VIEW, WARP_VIEW, loggedPosition, MAP_WARP_EVENTS, mapWarpLog, pointerLockChanges, readBridgeView, readDevEntity,
  readLog, stopWatchingResume, stopWatchingStore, submitEditorCommand, waitForBridge, waitForMapWarpLog, watchResume, watchStore,
  expectCompletionPublished, type BridgeView,
} from './support/map-warp.ts';
import { expect, test } from './support/audited-test.ts';
import { exportedTickInputs, openKeyboardMenu, startKeyboardFlight, tabTo, waitForTickAfter } from './support/keyboard-input.ts';
import {
  checkedWingman, chooseWingman, devState, endPlaceholder, enterMission, expectAdvancingTick, expectGaps, expectStableTick, holdKey,
  leaveGuards, missionEntry, missionFrame, reloadWithoutConfirmation, requestLeave, stopWatchingPositions, submitDevCommand,
  waitForFrame, watchPositions, type DevState,
} from './support/mission-observations.ts';
import { quietly, zoneLocked } from './support/map-picture.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';

// P3-04 subtask 10 (docs/plan/p3/04/spec.md, 验证策略; AC-08, AC-10, AC-12, AC-16, AC-19 and AC-22 in development
// builds): the mission flow on the development test entry, which imports the synthetic mission scenarios of
// import-scenarios.test-support.ts through the real module Worker and draws the seeds its `seeds` query lists. Run
// evidence comes from the mission screen's read-only attributes and the development diagnostics panel; the page is
// driven only through trusted input. The network audit runs throughout; nothing fakes visibility.

test.describe.configure({ timeout: 240_000 });

/** The uint32 seeds the test entry draws, one per world creation, so the panel and the recording name them. */
const SEEDS = Object.freeze([0x0eed_0001, 0x0eed_0002, 0x0eed_0003]);
const LEAVE_SEED = 0x0eed_0010;
const KEYBOARD_REPLAY_SEED = 0x0eed_0020;
const MISSION_LOADS = /Mission (?:loads|does not load) into Core/;
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

/**
 * The start page's wingman labels for the five-option roster of `FIVE_WINGMAN_NAMES`, in roster order: one name, two
 * candidates, none, one, and three with markup-like text that plain-text rendering shows as written.
 */
const WINGMAN_LABELS = Object.freeze([
  'Synthetic wingman A',
  'Wingman option 2: one of “Synthetic wingman B1”, “Synthetic wingman B2”',
  'Wingman option 3 (no name in the roster)',
  'Synthetic wingman D',
  'Wingman option 5: one of “Synthetic wingman E1”, “Synthetic wingman E2”, “<b>Synthetic wingman E3</b> & co”',
  'No wingman',
]);

const discs = new Map<MissionScenario, Promise<readonly File[]>>();
/** A scenario's CloneCD file set, generated once per worker process. */
function discOf(scenario: MissionScenario): Promise<readonly File[]> {
  let files = discs.get(scenario);
  if (!files) {
    files = scenarioFiles(scenario);
    discs.set(scenario, files);
  }
  return files;
}

/** Imports `scenario` through the test entry's import page and returns to the main menu. */
async function importScenario(page: Page, scenario: MissionScenario, seeds: readonly number[] = []): Promise<void> {
  const files = await filePayloads([...await discOf(scenario)]);
  await importFiles(page, files, { worker: scenario, ...(seeds.length > 0 ? { seeds: seeds.join(',') } : {}) }, MISSION_LOADS);
  await button(page, 'Return to menu').click();
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: Resources are held in this page.');
}

/** After a reload, restores the package the import saved through the main menu, until the mission entry admits it. */
async function restoreSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
}

/** Expects the shown slice-gap notes to be exactly `ids`, each once, with its whole copy from the one place that holds it. */
async function expectGapCopy(page: Page, ids: Parameters<typeof expectGaps>[1]): Promise<void> {
  for (const { id, text } of await expectGaps(page, ids)) expect(text).toBe(`${SLICE_GAPS[id].title} (${id}). ${SLICE_GAPS[id].text}`);
}

/** The diagnostics show the run's player, and exactly the chosen wingman, as entities of the world Core created. */
function expectEntities(state: DevState, wingman: number | null): void {
  expect(state.wingman).toBe(wingman);
  expect(state.player).not.toBeNull();
  expect(state.entities.filter(entity => entity.id === state.player)).toHaveLength(1);
  expect(state.entities.filter(entity => entity.source.startsWith('wingman#')).map(entity => entity.source)).toEqual(wingman === null ? [] : [`wingman#${wingman}`]);
}

const status = (page: Page) => page.getByTestId('mission-status');
const startHeading = (page: Page) => page.getByRole('heading', { name: 'Mission start', exact: true });

test.describe('start eligibility', () => {
  test('without a resource package the mission entry is disabled and says why', async ({ page }) => {
    await openTestEntry(page, { worker: 'mission-startable' });
    await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
    await expect(missionEntry(page)).toBeDisabled();
    await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
    await expect(page.getByTestId('mission-entry-reason')).toHaveText(
      'Not available now. No resource package is held. Import your original game data or open saved resources first.',
    );
    await expectGapCopy(page, ['G-07']);
  });

  test('a partial package keeps the mission entry disabled and names the incomplete group', async ({ page }) => {
    const outcome = MISSION_SCENARIOS['mission-partial'];
    await importScenario(page, 'mission-partial');
    await expect(page.getByTestId('resource-statuses').locator('li')).toContainText(['Partial conversion: not a usable resource package']);
    await expect(missionEntry(page)).toBeDisabled();
    await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'package-incomplete');
    await expect(page.getByTestId('mission-entry-reason')).toContainText('Not available now. The resource package is incomplete');
    await expect(page.getByTestId('mission-entry-reason')).toContainText(outcome.group);
  });

  test('a mission that fails to load keeps the mission entry disabled and gives the structural failure', async ({ page }) => {
    const { failure } = MISSION_SCENARIOS['mission-load-failed'];
    await importScenario(page, 'mission-load-failed');
    await expect(page.getByTestId('resource-statuses').locator('li')).toContainText(['Mission does not load into Core']);
    await expect(missionEntry(page)).toBeDisabled();
    await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'mission-failed');
    await expect(page.getByTestId('mission-entry-reason')).toHaveText(
      `Not available now. The mission does not load: Core input error at ${failure.path}: ${failure.reason}.`,
    );
  });

  test('world creation refusing the mission leaves the start page with the reason, for every choice, and starts nothing', async ({ page }) => {
    const { failure } = MISSION_SCENARIOS['mission-create-rejected'];
    await importScenario(page, 'mission-create-rejected');
    // The mission loads, so the entry admits it: only confirming the start runs world creation.
    await expect(page.getByTestId('mission-entry-reason')).toHaveCount(0);
    const { owner } = await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'button');
    for (const wingman of [0, null]) {
      await chooseWingman(page, wingman);
      await button(page, 'Start').click();
      const alert = page.getByTestId('mission-start-failure');
      await expect(alert).toHaveAttribute('data-kind', 'rejected');
      await expect(alert).toHaveAttribute('role', 'alert');
      await expect(alert).toContainText(`World creation refused the mission: Core input error at ${failure.path}: ${failure.reason}.`);
      expect(await missionFrame(page)).toEqual({ owner, run: null, tick: null, position: 'config' });
      expect(await leaveGuards(page)).toBe(0);
      await expect(button(page, 'Start')).toBeEnabled();
    }
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeFocused();
    expect(await missionFrame(page)).toBeNull();
  });
});

test('the whole development flow with and without a wingman: placeholders, departure at tick 0, pause, menu, restart, return and diagnostics', async ({ page }) => {
  await importScenario(page, 'mission-startable', SEEDS);
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await expect(page.getByTestId('mission-entry-reason')).toHaveCount(0);
  await expectGapCopy(page, ['G-07']);
  expect(await leaveGuards(page)).toBe(0);

  // Run 1, with the second wingman option. The introduction ends by its skip button.
  let frame = await enterMission(page);
  const { owner } = frame;
  expect(frame).toEqual({ owner, run: null, tick: null, position: 'intro' });
  await expectGapCopy(page, ['G-02/1']);
  await expect(page.getByTestId('mission-dev-panel')).toBeVisible();
  expect(await leaveGuards(page)).toBe(0);
  frame = await endPlaceholder(page, 'G-02/1', 'button');
  await expect(startHeading(page)).toBeFocused();
  expect(frame).toEqual({ owner, run: null, tick: null, position: 'config' });
  await expectGapCopy(page, ['G-04', 'G-07', 'G-01', 'G-02/1', 'G-02/2']);
  await expect(page.getByTestId('mission-config-difficulty')).toHaveText('19 (fixed, G-07)');
  await expect(page.getByTestId('mission-objectives')).toHaveAttribute('data-gap', 'G-04');
  // The objectives and limits: project text naming its sources with their confidence, and that no rule decides them yet.
  const objectives = page.getByTestId('mission-objectives');
  await expect(objectives.getByRole('heading')).toHaveText(`${MISSION_OBJECTIVES.title} (G-04)`);
  await expect(objectives.locator('p')).toHaveText([MISSION_OBJECTIVES.objective, MISSION_OBJECTIVES.limits, MISSION_OBJECTIVES.status]);
  await expect(objectives.locator('li')).toHaveText([...MISSION_OBJECTIVES.sources]);
  await expect(objectives).toContainText('Confirmed');
  await expect(objectives).toContainText('Likely');
  await expect(page.getByTestId('mission-wingmen').locator('label')).toHaveText([...WINGMAN_LABELS]);
  expect(await page.getByTestId('mission-wingmen').locator('b').count(), 'Wingman names render as markup').toBe(0);
  // The first visit preselects the roster's first option.
  expect(await checkedWingman(page)).toBe(0);
  expect(await leaveGuards(page)).toBe(0);
  await chooseWingman(page, 1);
  // Enter held on Start: its first press starts the run; its repeats on the departure and its keyup end nothing.
  await button(page, 'Start').focus();
  frame = await holdKey(page, 'Enter', async () => {
    const departure = await waitForFrame(page, candidate => candidate.position === 'departure');
    await expect(button(page, 'Skip')).toBeFocused();
    return departure;
  });
  expect(frame).toEqual({ owner, run: 1, tick: 0, position: 'departure' });
  // Still the departure after the repeats and the keyup.
  expect(await missionFrame(page)).toEqual(frame);
  await expect(page.getByTestId('mission-placeholder')).toHaveAttribute('data-gap', 'G-02/2');
  await expect(page.getByTestId('mission-placeholder-variant')).toHaveAttribute('data-variant', 'wingman');
  expect(await leaveGuards(page)).toBe(1);
  frame = await endPlaceholder(page, 'G-02/2', 'Enter');
  expect(frame.run).toBe(1);
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
  expect(await leaveGuards(page)).toBe(1);
  await expectGapCopy(page, ['G-01', 'G-02/1', 'G-02/2']);
  await expect(status(page).locator('[data-gap="G-01"]')).toHaveText(`${SLICE_GAPS['G-01'].title} (G-01)`);
  const first = await devState(page);
  expect(first).toMatchObject({ run: 1, seed: SEEDS[0] });
  expectEntities(first, 1);
  // A command through the run's queue, the panel's default primary fire: Core ignores it as the player's gun starts
  // without charge (P3-07), with the commandId the submit returned.
  const command = await submitDevCommand(page);
  expect(command).toMatchObject({ run: 1, outcome: 'ignored', reason: 'insufficient-charge' });
  expect(Number.isSafeInteger(command.commandId)).toBe(true);

  // Pause holds the tick; resume continues it.
  await button(page, 'Pause').click();
  await expect(status(page)).toHaveAttribute('data-phase', 'paused');
  await expect(status(page)).toHaveAttribute('data-pause', 'user');
  await expect(button(page, 'Resume')).toBeFocused();
  const paused = await expectStableTick(page, 800);
  expect((await devState(page)).tick, 'The paused screen shows the run\'s last tick').toBe(paused);
  expect(await expectStableTick(page, 400)).toBe(paused);
  expect(await leaveGuards(page)).toBe(1);
  await button(page, 'Resume').click();
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(paused);
  expect(await leaveGuards(page)).toBe(1);

  // The mission menu pauses the run; no key resumes it while it shows, and only Continue closes it.
  await button(page, 'Mission menu').click();
  await expect(page.getByTestId('mission-menu')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mission menu', exact: true })).toBeFocused();
  await expectGapCopy(page, ['G-07', 'G-06']);
  await waitForFrame(page, candidate => candidate.position === 'menu');
  const held = await expectStableTick(page);
  for (const key of ['Escape', 'p', 'P', 'Enter', ' ']) await page.keyboard.press(key);
  await expect(page.getByTestId('dev-command-submit')).toBeDisabled();
  expect(await expectStableTick(page)).toBe(held);
  expect(await missionFrame(page)).toEqual({ owner, run: 1, tick: held, position: 'menu' });
  expect(await leaveGuards(page)).toBe(1);
  await button(page, 'Continue').click();
  await waitForFrame(page, candidate => candidate.position === 'flight');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(held);
  expect(await leaveGuards(page)).toBe(1);

  // Restart from the menu: a new introduction, the remembered wingman preselected, then a new run without one.
  await button(page, 'Mission menu').click();
  await expect(page.getByTestId('mission-menu')).toBeVisible();
  await button(page, 'Restart mission').click();
  frame = await waitForFrame(page, candidate => candidate.position === 'intro');
  expect(frame).toEqual({ owner, run: null, tick: null, position: 'intro' });
  expect(await leaveGuards(page)).toBe(0);
  await expect(button(page, 'Skip')).toBeFocused();
  // Space held on Skip: its first press ends the introduction; its repeats and keyup on the start page start nothing.
  await holdKey(page, ' ', async () => {
    await waitForFrame(page, candidate => candidate.position === 'config');
    await expect(startHeading(page)).toBeFocused();
  });
  expect(await missionFrame(page)).toEqual({ owner, run: null, tick: null, position: 'config' });
  expect(await checkedWingman(page)).toBe(1);
  await chooseWingman(page, null);
  await button(page, 'Start').click();
  frame = await waitForFrame(page, candidate => candidate.position === 'departure');
  expect(frame).toEqual({ owner, run: 2, tick: 0, position: 'departure' });
  await expect(page.getByTestId('mission-placeholder-variant')).toHaveAttribute('data-variant', 'solo');
  await endPlaceholder(page, 'G-02/2', 'Escape');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
  const second = await devState(page);
  expect(second).toMatchObject({ run: 2, seed: SEEDS[1] });
  expectEntities(second, null);

  // Return to the main menu from the mission menu: focus on the mission entry, no run and no leave guard remain.
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);

  // A new owner: both placeholders end by themselves after 3 s of visible time; the departure holds tick 0.
  await watchPositions(page);
  frame = await enterMission(page);
  const next = frame.owner!;
  expect(next).toBeGreaterThan(owner!);
  await endPlaceholder(page, 'G-02/1', 'natural');
  // The choice confirmed last, no wingman, is preselected across the return.
  expect(await checkedWingman(page)).toBeNull();
  await button(page, 'Start').click();
  frame = await waitForFrame(page, candidate => candidate.position === 'departure');
  expect(frame).toEqual({ owner: next, run: 1, tick: 0, position: 'departure' });
  await expectGapCopy(page, ['G-02/2']);
  expect(await expectStableTick(page, 800)).toBe(0);
  await endPlaceholder(page, 'G-02/2', 'natural');
  await stopWatchingPositions(page);
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
  expect(await devState(page)).toMatchObject({ run: 1, seed: SEEDS[2], wingman: null });
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
});

/** Writes the startable scenario's CloneCD file set under the test's output directory and returns the paths. */
async function writeDisc(testInfo: TestInfo): Promise<string[]> {
  const directory = testInfo.outputPath('disc');
  await mkdir(directory, { recursive: true });
  // One base name for the whole CloneCD set, as the set's own files have.
  return Promise.all((await discOf('mission-startable')).map(async file => {
    const path = `${directory}/disc${extname(file.name)}`;
    await writeFile(path, new Uint8Array(await file.arrayBuffer()));
    return path;
  }));
}

declare global {
  interface Window {
    osrObjectUrls?: { readonly created: string[]; readonly revoked: string[] };
  }
}

/**
 * Serialized before navigation: records every object URL the page creates and revokes, so the test can tell that a
 * download released its Blob URL. It only counts; both calls go on to the browser's own functions.
 */
function installObjectUrlProbe(): void {
  const created: string[] = [];
  const revoked: string[] = [];
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (object: Blob | MediaSource): string => {
    const url = create(object);
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    revoked.push(url);
    revoke(url);
  };
  window.osrObjectUrls = { created, revoked };
}

/** The object URLs created and revoked so far, and the temporary download links still in the document. */
const downloadResources = (page: Page) => page.evaluate(() => ({
  created: [...window.osrObjectUrls!.created], revoked: [...window.osrObjectUrls!.revoked],
  links: document.querySelectorAll('a[download]').length,
}));

test('the native leave confirmation shows only while a run exists; dismissing it keeps the run, whose downloaded recording replays in Node', async ({ page, browser }, testInfo) => {
  await page.addInitScript(installObjectUrlProbe);
  await importScenario(page, 'mission-startable', [LEAVE_SEED]);
  // The reloads below restore this save, so it must have finished first.
  await expect(page.getByTestId('resource-statuses')).toContainText(/Saved in this browser \(saved in /);
  expect(await leaveGuards(page)).toBe(0);

  // The introduction and the start page hold no run: a real reload asks nothing, after a trusted click on the entry.
  await enterMission(page);
  expect(await leaveGuards(page)).toBe(0);
  await reloadWithoutConfirmation(page);
  expect(await missionFrame(page)).toBeNull();
  await restoreSaved(page);
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'Escape');
  expect(await leaveGuards(page)).toBe(0);
  await reloadWithoutConfirmation(page);
  await restoreSaved(page);

  // A run started by a trusted click.
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await chooseWingman(page, 2);
  await button(page, 'Start').click();
  await waitForFrame(page, candidate => candidate.position === 'departure');
  expect(await leaveGuards(page)).toBe(1);
  await endPlaceholder(page, 'G-02/2', 'button');
  const before = await waitForFrame(page, candidate => (candidate.tick ?? 0) >= 10);

  // Closing the page, through Playwright's runBeforeUnload path, asks; dismissing keeps the same run going.
  expect(await requestLeave(page, 'close', 'dismiss')).toBe('beforeunload');
  expect(page.isClosed()).toBe(false);
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(before.tick!);
  expect(await missionFrame(page)).toMatchObject({ owner: before.owner, run: before.run, position: 'flight' });
  // So does a real reload.
  expect(await requestLeave(page, 'reload', 'dismiss')).toBe('beforeunload');
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(before.tick!);
  expect(await missionFrame(page)).toMatchObject({ owner: before.owner, run: before.run, position: 'flight' });
  // A paused run still asks.
  await button(page, 'Pause').click();
  await expect(status(page)).toHaveAttribute('data-phase', 'paused');
  const paused = await expectStableTick(page);
  expect(await requestLeave(page, 'reload', 'dismiss')).toBe('beforeunload');
  expect(await expectStableTick(page)).toBe(paused);
  expect(await leaveGuards(page)).toBe(1);
  // And so does the mission menu, which stays open.
  await button(page, 'Mission menu').click();
  await waitForFrame(page, candidate => candidate.position === 'menu');
  expect(await requestLeave(page, 'reload', 'dismiss')).toBe('beforeunload');
  expect(await missionFrame(page)).toEqual({ owner: before.owner, run: before.run, tick: paused, position: 'menu' });
  expect(await leaveGuards(page)).toBe(1);

  // The recording survived: the panel exports it, the download releases its object URL and link, and the file the
  // browser wrote replays in Node, unchanged, with the replay check's own function on the same synthetic disc.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('dev-recording-export').click()]);
  await expect(page.getByTestId('dev-recording-status')).toHaveAttribute('data-status', 'requested');
  const name = download.suggestedFilename();
  const parts = /^osr-recording-([0-9a-f]{16})-(\d+)-(\d+)\.json$/.exec(name);
  expect(parts, `Unexpected recording file name ${name}`).not.toBeNull();
  expect(Number(parts![2])).toBe(LEAVE_SEED);
  expect(Number(parts![3])).toBe(paused);
  const recordingPath = testInfo.outputPath(name);
  await download.saveAs(recordingPath);
  expect(await download.failure()).toBeNull();
  const objectUrls = await downloadResources(page);
  expect(objectUrls.created).toContain(download.url());
  expect(objectUrls.revoked).toContain(download.url());
  expect(objectUrls.links, 'A temporary download link remains').toBe(0);
  const recording = JSON.parse(await readFile(recordingPath, 'utf8')) as { record: { run: { seed: number; wingman: number | null }; setupHash: string } };
  expect(recording.record.run).toMatchObject({ seed: LEAVE_SEED, wingman: 2 });
  const source = scenarioSource('mission-startable')!;
  const report = await runReplayCheck(recordingPath, await writeDisc(testInfo), { catalog: catalogFor(source.covered, source.versionId) });
  await testInfo.attach('replay-check', {
    contentType: 'application/json',
    body: JSON.stringify({ chrome: browser.version(), node: process.version, v8: process.versions.v8, file: name, report }, null, 1),
  });
  expect(report).toMatchObject({ passed: true, error: null, setupHash: parts![1], finalTick: paused, comparison: { match: true } });
  expect(exitCode(report)).toBe(0);
  expect(report.finalTick!).toBeGreaterThanOrEqual(before.tick!);

  // After exit nothing asks.
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await leaveGuards(page)).toBe(0);
  await reloadWithoutConfirmation(page);
  await restoreSaved(page);

  // Accepting the confirmation leaves: the reload goes on, and the run is gone with the document.
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'Enter');
  await button(page, 'Start').click();
  await endPlaceholder(page, 'G-02/2', 'Space');
  await waitForFrame(page, candidate => (candidate.tick ?? 0) > 0);
  expect(await requestLeave(page, 'reload', 'accept')).toBe('beforeunload');
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);
});

test('exports a keyboard-driven recording that Node replays with identical events and checkpoints', async ({ page, browser }, testInfo) => {
  await openKeyboardMenu(page, 'development', { seeds: String(KEYBOARD_REPLAY_SEED) });
  await startKeyboardFlight(page);
  let tick = (await waitForFrame(page, frame => frame.position === 'flight' && (frame.tick ?? 0) >= 8)).tick!;

  await page.keyboard.down('BracketRight');
  tick = await waitForTickAfter(page, tick);
  await page.keyboard.up('BracketRight');
  tick = await waitForTickAfter(page, tick);

  await page.keyboard.down('Alt');
  await page.keyboard.up('Alt');
  tick = await waitForTickAfter(page, tick);
  await page.keyboard.down('Alt');
  tick = (await waitForFrame(page, frame => (frame.tick ?? 0) > tick + 4, 5_000)).tick!;
  await page.keyboard.up('Alt');

  await page.keyboard.press(' ');
  tick = await waitForTickAfter(page, tick);
  await page.keyboard.down('Shift');
  await page.keyboard.press('5');
  await page.keyboard.up('Shift');
  tick = await waitForTickAfter(page, tick);

  const repeatStart = tick;
  await page.keyboard.down('=');
  tick = (await waitForFrame(page, frame => (frame.tick ?? 0) >= repeatStart + 64, 5_000)).tick!;
  await page.keyboard.up('=');

  await page.keyboard.down('Backquote');
  await waitForTickAfter(page, tick);
  await tabTo(page, button(page, 'Pause'));
  await page.keyboard.up('Backquote');
  await page.keyboard.press(' ');
  await expect(status(page)).toHaveAttribute('data-phase', 'paused');
  const pausedTick = await expectStableTick(page);
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await page.getByTestId('game-input-zone').click();
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  tick = await waitForTickAfter(page, pausedTick);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Mission menu', exact: true })).toBeFocused();
  await tabTo(page, button(page, 'Continue'));
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  tick = await waitForTickAfter(page, tick);
  await waitForFrame(page, frame => (frame.tick ?? 0) >= tick + 4, 5_000);

  const recordingPath = testInfo.outputPath('keyboard-recording.json');
  const ticks = await exportedTickInputs(page, recordingPath);
  const recording = JSON.parse(await readFile(recordingPath, 'utf8')) as Recording;
  expect(recording.record.version).toBe(GAME_REPLAY_VERSION);
  expect(recording.record.rulesVersion).toBe(RULES_VERSION);
  expect(recording.record.run.seed).toBe(KEYBOARD_REPLAY_SEED);
  expect(recording.record.ticks).toEqual(ticks);
  expect(recording.result.finalTick).toBe(ticks.length);

  expect(ticks.some(input => input.axes.pitch === -1), 'keyboard pitch reached the recording').toBe(true);
  expect(ticks.some(input => input.axes.pitch === 0), 'pitch returned to neutral').toBe(true);
  const lastYawTick = ticks.findLastIndex(input => input.axes.yaw === -1);
  expect(lastYawTick, 'the held yaw reached the recording').toBeGreaterThanOrEqual(0);
  expect(lastYawTick, 'focus loss cleared the held yaw').toBeLessThan(ticks.length - 1);
  expect(ticks.slice(lastYawTick + 1).every(input => input.axes.yaw === 0), 'the yaw stayed neutral after focus loss').toBe(true);
  const commands = ticks.flatMap(input => input.commands);
  expect(commands).toContainEqual({ type: 'fire', channel: 'primary' });
  expect(commands).toContainEqual({ type: 'fire', channel: 'secondary' });
  expect(commands).toContainEqual({ type: 'speed-preset', level: 5 });
  const speedIncreaseTicks = ticks.flatMap((input, index) =>
    input.commands.some(command => command.type === 'speed' && command.operation === 'increase') ? [index + 1] : []);
  expect(speedIncreaseTicks.length, 'the held speed key produced repeats').toBeGreaterThan(1);
  expect(speedIncreaseTicks[0], 'the speed command was consumed after keydown').toBeGreaterThan(repeatStart);
  expect(speedIncreaseTicks[1], 'the first repeat waited for the 32-clock-unit delay')
    .toBeGreaterThanOrEqual(repeatStart + 16);
  for (let index = 2; index < speedIncreaseTicks.length; index += 1) {
    expect(speedIncreaseTicks[index]! - speedIncreaseTicks[index - 1]!, 'repeats respect the 16-clock-unit interval')
      .toBeGreaterThanOrEqual(8);
  }

  const source = scenarioSource('mission-startable')!;
  const disc = await writeDisc(testInfo);
  const report = await runReplayCheck(recordingPath, disc, { catalog: catalogFor(source.covered, source.versionId) });
  expect(report).toMatchObject({
    passed: true, error: null, finalTick: recording.result.finalTick, comparison: { match: true },
  });
  expect(report.events).toBeGreaterThan(0);
  expect(report.checkpoints).toBeGreaterThan(1);

  const oldVersionPath = testInfo.outputPath('keyboard-recording-old-version.json');
  const oldRulesPath = testInfo.outputPath('keyboard-recording-old-rules.json');
  await Promise.all([
    writeFile(oldVersionPath, JSON.stringify({
      ...recording, record: { ...recording.record, version: GAME_REPLAY_VERSION - 1 },
    })),
    writeFile(oldRulesPath, JSON.stringify({
      ...recording, record: { ...recording.record, rulesVersion: RULES_VERSION - 1 },
    })),
  ]);
  const [oldVersion, oldRules] = await Promise.all([
    runReplayCheck(oldVersionPath, []),
    runReplayCheck(oldRulesPath, []),
  ]);
  expect(oldVersion).toMatchObject({
    passed: false, error: { code: 'invalid-recording', location: 'record.version' }, identity: null, comparison: null,
  });
  expect(oldRules).toMatchObject({
    passed: false, error: { code: 'invalid-recording', location: 'record.rulesVersion' }, identity: null, comparison: null,
  });

  await testInfo.attach('keyboard-recording-replay', {
    contentType: 'application/json',
    body: JSON.stringify({
      chrome: browser.version(), node: process.version, v8: process.versions.v8,
      file: 'keyboard-recording.json', seed: KEYBOARD_REPLAY_SEED, finalTick: recording.result.finalTick,
      commands: commands.length, events: report.events, checkpoints: report.checkpoints,
      comparison: report.comparison, rejected: [oldVersion.error, oldRules.error],
    }),
  });
});

// P3-09 subtask 22 (docs/plan/p3/09/spec.md, AC-12): the strategic map and a Warp in the real mission, in development
// builds. Core's facts come from the panel's refreshed state and event log, the session bridge's from the mission's UI
// store (e2e/support/map-warp.ts); the destination is drafted in the panel's own command editor (real map selection in
// the production build is mission-flow.production.spec.ts's, the map picture map-picture.*.spec.ts's). With the production
// map geometry (P3-13) the map input is ready after the map's first picture and takes real Pointer Lock; the browser's
// own unlock is `document.exitPointerLock()` evaluated without a user gesture, as Playwright cannot press Chrome's native
// Escape. Nothing writes the world or a projection.

/** The seeds of the Warp run and of the run after reopening. */
const WARP_SEEDS = Object.freeze([0x0eed_0030, 0x0eed_0031]);
/**
 * The centre of main-map pixel column 230, row 127 (of 400 × 400), clear of every icon of the synthetic mission, so the
 * select creates a marker; the Warp of about 37,000 units to it costs about 373 of the player's 100,000 energy.
 */
const DESTINATION = Object.freeze({ operation: 'select', right: String(230.5 / 400), down: String(127.5 / 400) });

/** Waits until the bridge's results hold a new result of `type` after `afterId`, and resolves to it. */
async function nextResult(page: Page, type: string, afterId: number) {
  const next = (view: BridgeView) => view.results.find(result => result.commandId > afterId && result.commandType === type);
  return next(await waitForBridge(page, view => next(view) !== undefined, `No ${type} result after #${afterId}`))!;
}

const lastId = (view: BridgeView): number => view.results.at(-1)?.commandId ?? 0;

test.describe('strategic map and Warp (P3-09 AC-12)', () => {
  test('m, p, the lock, unlocked Esc and context filtering in the Core map; an editor destination; w starts a Warp the menu holds, which completes once; exit and reopen leave nothing', async ({ page, browser }, testInfo) => {
    await page.addInitScript(countPointerLockChanges);
    await importScenario(page, 'mission-startable', WARP_SEEDS);
    // Playwright's main-world script, which locator evaluations below create, registers its listeners before the baseline.
    await settleTooling(page);
    const balance = await ResourceBalance.start(page, testInfo, { audio: false });
    const cdp = await page.context().newCDPSession(page);
    const zone = page.getByTestId('game-input-zone');
    const inputStatus = page.getByTestId('input-status');

    await startKeyboardFlight(page);
    let view = await waitForBridge(page, candidate => candidate.map?.warpRequest === 'no-destination', 'The flight did not reach its player');
    expect(view).toMatchObject({ phase: 'running', runId: 1, context: 'flight', viewMode: FLIGHT_VIEW, map: { state: 'closed', destination: null, markerEntityId: null } });
    expect(view.energy, 'The synthetic player starts with energy').toBeGreaterThan(0);

    // m in the input zone: Core's view mode 8 and its map-toggled event, the bridge's map context, and the input, ready
    // once the map's first picture is drawn (production geometry, P3-13), locked at once by m's own activation.
    await page.keyboard.press('m');
    expect(await nextResult(page, 'toggle-map', lastId(view))).toMatchObject({ outcome: 'accepted', reason: null });
    view = await waitForBridge(page, candidate => candidate.context === 'map', 'The bridge did not report the map');
    expect(view).toMatchObject({ viewMode: MAP_VIEW, map: { state: 'open', destination: null, warpRequest: 'no-destination' } });
    expect(await waitForMapWarpLog(page, 1)).toEqual([expect.objectContaining({ type: 'map-toggled', fields: expect.objectContaining({ open: 'true', viewMode: '8', previousViewMode: '12' }) })]);
    await expect.poll(() => zoneLocked(page)).toBe(true);
    await expect(inputStatus).not.toContainText('Map input');
    await expect(zone).toBeFocused();
    expect(await zone.evaluate(element => (element as HTMLElement).style.cursor)).toBe('none');

    // p pauses and resumes in the map, which stays open; the pause ends the lock.
    await page.keyboard.press('p');
    await expect(status(page)).toHaveAttribute('data-phase', 'paused');
    await expect(status(page)).toHaveAttribute('data-pause', 'user');
    await expect.poll(() => zoneLocked(page)).toBe(false);
    const paused = await expectStableTick(page);
    expect(await bridgeView(page)).toMatchObject({ phase: 'paused', context: 'map', tick: paused });
    await page.keyboard.press('p');
    await expect(status(page)).toHaveAttribute('data-phase', 'running');
    expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(paused);

    // The browser ends any lock (standing for Chrome's own Escape, which Playwright cannot press); the map waits for a
    // click. Flight keys are filtered by the map context, the unlocked mouse moves nothing, and the first click only locks.
    await quietly(cdp, 'document.exitPointerLock()');
    await expect(inputStatus).toContainText('Click the map to lock the pointer.');
    // The panel is usable once the pointer is free. Its click takes the focus: the map is suspended, and focused again
    // with the click's activation it may ask for the lock at once, which the browser ends again.
    const player = await devState(page);
    expect(player).toMatchObject({ viewMode: MAP_VIEW, previousViewMode: FLIGHT_VIEW });
    await zone.focus();
    await expect.poll(async () => (await zoneLocked(page)) || (await inputStatus.innerText()).includes('Click the map')).toBe(true);
    await quietly(cdp, 'document.exitPointerLock()');
    await expect(inputStatus).toContainText('Click the map to lock the pointer.');
    const filtered = lastId(await bridgeView(page));
    for (const key of ['Equal', 'Space', 'KeyT', 'Digit1', 'Shift+Digit5', 'KeyE', 'Backslash']) await page.keyboard.press(key);
    await page.keyboard.down('BracketRight');
    let tick = (await missionFrame(page))!.tick!;
    tick = (await waitForFrame(page, frame => (frame.tick ?? 0) >= tick + 8)).tick!;
    await page.keyboard.up('BracketRight');
    const box = (await zone.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3, { steps: 5 });
    await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3);
    await expect.poll(() => zoneLocked(page)).toBe(true);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= tick + 8);
    view = await bridgeView(page);
    expect(view.results.filter(result => result.commandId > filtered), 'A flight key, the unlocked mouse or the locking click submitted a command in the map').toEqual([]);
    expect(view).toMatchObject({ context: 'map', map: { state: 'open', destination: null, markerEntityId: null } });
    await expect(page.getByTestId('dev-pending')).toHaveText('No pending commands.');
    await expect(inputStatus).not.toContainText('Map input');

    // A page-delivered Esc leaves the locked map open; after the browser's unlock, Esc closes it without the mission menu.
    await page.keyboard.press('Escape');
    await waitForFrame(page, frame => (frame.tick ?? 0) >= tick + 16);
    expect(await bridgeView(page)).toMatchObject({ context: 'map' });
    expect(lastId(await bridgeView(page))).toBe(filtered);
    await quietly(cdp, 'document.exitPointerLock()');
    await expect(inputStatus).toContainText('Click the map to lock the pointer.');
    await page.keyboard.press('Escape');
    expect(await nextResult(page, 'toggle-map', filtered)).toMatchObject({ outcome: 'accepted' });
    view = await waitForBridge(page, candidate => candidate.context === 'flight', 'Esc did not close the map');
    expect(view).toMatchObject({ phase: 'running', viewMode: FLIGHT_VIEW, map: { state: 'closed' } });
    expect(await missionFrame(page)).toMatchObject({ position: 'flight' });
    await expect(page.getByTestId('mission-menu')).toHaveCount(0);
    await expect(inputStatus).not.toContainText('Map input');
    expect((await waitForMapWarpLog(page, 2)).at(-1)).toMatchObject({ type: 'map-toggled', fields: { open: 'false', viewMode: '12', previousViewMode: '8' } });

    // The panel's command editor selects a destination in the reopened map: Core logs it with a new marker, and the
    // bridge reports the same destination, the marker and an accepted Warp gate.
    await page.keyboard.press('m');
    view = await waitForBridge(page, candidate => candidate.context === 'map', 'm did not reopen the map');
    // Locked again by m's activation; the browser's unlock frees the mouse for the panel.
    await expect.poll(() => zoneLocked(page)).toBe(true);
    await quietly(cdp, 'document.exitPointerLock()');
    await expect(inputStatus).toContainText('Click the map to lock the pointer.');
    const select = await submitEditorCommand(page, 'map-point', DESTINATION);
    expect(select).toMatchObject({ outcome: 'accepted', reason: null });
    const set = (await waitForMapWarpLog(page, 4)).filter(entry => entry.type === 'warp-destination-set');
    expect(set).toHaveLength(1);
    expect(set[0].fields).toMatchObject({ iconEntityId: 'null', marker: 'created', column: '230', row: '127' });
    const destination = loggedPosition(set[0].fields);
    const marker = Number(set[0].fields.markerEntityId);
    expect(destination.z).toBe(0);
    view = await waitForBridge(page, candidate => candidate.map?.markerEntityId === marker, 'The bridge did not report the marker');
    expect(view.map).toMatchObject({ state: 'open', destination, warpRequest: 'accepted' });
    const reading = view.map!.destinationCost!;
    expect(reading.cost).toBeGreaterThan(0);
    expect(reading.cost).toBeLessThanOrEqual(reading.energy);
    expect(reading.percent).toBe(Math.max(Math.trunc((reading.cost / reading.energy) * 100), 1));
    expect(await devState(page)).toMatchObject({ viewMode: MAP_VIEW });
    expect(await page.evaluate(readDevEntity, marker)).toEqual({ kindBit: 25, name: 'map-marker' });

    // Refocused by a click, which in the waiting map only locks, w starts the Warp.
    await zone.click();
    await expect(zone).toBeFocused();
    await expect.poll(() => zoneLocked(page)).toBe(true);
    const beforeWarp = lastId(await bridgeView(page));
    await page.keyboard.press('w');
    expect(await nextResult(page, 'request-warp', beforeWarp)).toMatchObject({ outcome: 'accepted', reason: null });
    expect(lastId(await bridgeView(page)), 'The click submitted a command').toBe(beforeWarp + 1);
    view = await waitForBridge(page, candidate => candidate.context === 'warp', 'The bridge did not report the Warp');
    expect(view).toMatchObject({ viewMode: WARP_VIEW, phase: 'running' });
    const started = (await waitForMapWarpLog(page, 5)).filter(entry => entry.type === 'warp-started');
    expect(started).toHaveLength(1);
    expect(started[0].fields).toMatchObject({ serial: '1', fromViewMode: '8', playerEntityId: String(player.player) });
    expect(loggedPosition(started[0].fields, 'destination')).toEqual(destination);
    expect(Number(started[0].fields.cost)).toBeLessThanOrEqual(Number(started[0].fields.energy));
    await expect(inputStatus).not.toContainText('Map input');

    // In the Warp context m and w do nothing; the mission menu holds the Warp, and Continue resumes it.
    await zone.click();
    for (const key of ['m', 'w', 'Equal']) await page.keyboard.press(key);
    await waitForFrame(page, frame => (frame.tick ?? 0) >= (view.tick ?? 0) + 8);
    expect(lastId(await bridgeView(page)), 'A key submitted a command in the Warp').toBe(beforeWarp + 1);
    expect(await devState(page)).toMatchObject({ viewMode: WARP_VIEW, previousViewMode: MAP_VIEW });
    await button(page, 'Mission menu').click();
    await waitForFrame(page, frame => frame.position === 'menu');
    const held = await expectStableTick(page);
    const heldView = await bridgeView(page);
    expect(heldView).toMatchObject({ context: 'warp', tick: held });
    expect(await expectStableTick(page)).toBe(held);
    expect(await bridgeView(page)).toEqual(heldView);
    // From here every state the bridge publishes is recorded, so the completion's own frame can be read.
    await page.evaluate(watchStore);
    await button(page, 'Continue').click();
    await waitForFrame(page, frame => frame.position === 'flight');
    await expect(status(page)).toHaveAttribute('data-phase', 'running');
    expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(held);

    // The Warp completes once: one charge by the completion's rule, at the arrival Core logs.
    const completion = (await waitForMapWarpLog(page, 6, 90_000)).find(entry => entry.type === 'warp-completed')!;
    expect(completion).toBeDefined();
    // The bridge published the completion's frame with Core's charged energy and the arrival position.
    expectCompletionPublished(await page.evaluate(stopWatchingStore), completion);
    expect(completion.fields).toMatchObject({ serial: '1', viewMode: '12', previousViewMode: '1', arrived: 'true' });
    expect(Number(completion.fields.energyAfter)).toBe(expectedCharge(completion.fields));
    expect(Number(completion.fields.energyAfter)).toBeLessThan(Number(completion.fields.energyBefore));
    expect(loggedPosition(completion.fields, 'origin')).toEqual(loggedPosition(started[0].fields, 'origin'));
    expect(loggedPosition(completion.fields, 'destination')).toEqual(destination);
    // The charge's distance is the one from the origin to the arrival Core logs (the f32 store, truncated).
    const [arrival, origin] = [loggedPosition(completion.fields), loggedPosition(completion.fields, 'origin')];
    const travelled = Math.hypot(arrival.x - origin.x, arrival.y - origin.y, arrival.z - origin.z);
    expect(Math.abs(Number(completion.fields.chargeDistance) - Math.trunc(travelled))).toBeLessThanOrEqual(1);
    view = await waitForBridge(page, candidate => candidate.context === 'flight', 'The bridge did not report the end of the Warp');
    expect(view).toMatchObject({ viewMode: FLIGHT_VIEW, warpCompletion: null, map: { state: 'closed' } });
    await waitForFrame(page, frame => (frame.tick ?? 0) >= completion.tick + 16);
    expect((await mapWarpLog(page)).map(entry => entry.type)).toEqual(['map-toggled', 'map-toggled', 'map-toggled', 'warp-destination-set', 'warp-started', 'warp-completed']);
    expect(await devState(page)).toMatchObject({ viewMode: FLIGHT_VIEW, previousViewMode: WARP_VIEW });

    // The recording holds exactly the map and Warp commands, no steering from the key held in the map, and replays in
    // Node with the same events and checkpoints.
    const recordingPath = testInfo.outputPath('warp-recording.json');
    const ticks = await exportedTickInputs(page, recordingPath);
    expect(ticks.flatMap(input => input.commands)).toEqual([
      { type: 'toggle-map' }, { type: 'toggle-map' }, { type: 'toggle-map' },
      { type: 'map-point', operation: 'select', right: Number(DESTINATION.right), down: Number(DESTINATION.down) }, { type: 'request-warp' },
    ]);
    expect(ticks.every(({ axes }) => axes.pitch === 0 && axes.yaw === 0 && axes.roll === 0), 'A steering key acted in the map').toBe(true);
    const source = scenarioSource('mission-startable')!;
    const report = await runReplayCheck(recordingPath, await writeDisc(testInfo), { catalog: catalogFor(source.covered, source.versionId) });
    expect(report).toMatchObject({ passed: true, error: null, finalTick: ticks.length, comparison: { match: true } });

    // Exit and reopen: the new run starts without the old destination, marker or Warp, and nothing is left behind.
    await button(page, 'Mission menu').click();
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeFocused();
    expect(await leaveGuards(page)).toBe(0);
    await balance.check('after the Warp run');
    await startKeyboardFlight(page);
    view = await waitForBridge(page, candidate => candidate.map?.warpRequest === 'no-destination', 'The reopened flight did not reach its player');
    expect(view).toMatchObject({ runId: 1, context: 'flight', viewMode: FLIGHT_VIEW, map: { state: 'closed', destination: null, markerEntityId: null }, results: [] });
    expect(await devState(page)).toMatchObject({ seed: WARP_SEEDS[1], viewMode: FLIGHT_VIEW });
        await button(page, 'Mission menu').click();
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeFocused();
    await balance.check('after reopening');
    // Every lock the map took ended: each change locked or unlocked the zone, and nothing holds it now.
    const { changes, locked } = await pointerLockChanges(page);
    expect(locked).toBe(false);
    expect(changes! % 2).toBe(0);
    expect(changes).toBeGreaterThanOrEqual(6);
    await balance.attach();
    await testInfo.attach('warp-run', {
      contentType: 'application/json',
      body: JSON.stringify({ chrome: browser.version(), destination, set: set[0], started: started[0], completed: completion, reading, report }, null, 1),
    });
  });
});

/** Page function for the native page: the run's frame and status, and the document's visibility history. */
function nativeWarpState() {
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const status = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
  return {
    visibility: document.visibilityState,
    position: screen?.dataset.position ?? null,
    tick: number(screen?.dataset.tick),
    phase: status?.dataset.phase ?? null,
    pause: status?.dataset.pause ?? null,
    visibilityEvents: [...(window.osrVisibilityEvents ?? [])],
  };
}

function installNativeVisibilityObserver(): void {
  window.osrVisibilityEvents = [document.visibilityState];
  document.addEventListener('visibilitychange', () => { window.osrVisibilityEvents!.push(document.visibilityState); });
}

/** A trusted key press through CDP; `text` makes it type a character, as a select's type-ahead needs. */
async function nativePress(target: NativeTarget, code: string, key: string, keyCode: number, text?: string): Promise<void> {
  await target.command('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: keyCode, ...(text ? { text } : {}) });
  await target.command('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: keyCode });
}

test('a real hidden page during a Warp pauses it; after visible and an explicit resume it continues without catching up and charges once', async ({ audit, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Native visibility requires a development origin');
  const directory = testInfo.outputPath('native-warp');
  await mkdir(directory, { recursive: true });
  const paths = await Promise.all((await discOf('mission-startable')).map(async file => {
    const path = `${directory}/${file.name}`;
    await writeFile(path, new Uint8Array(await file.arrayBuffer()));
    return path;
  }));
  const browser = await nativeBrowser();
  let root: CDPSession | undefined;
  let contextId: string | undefined;
  let app: NativeTarget | undefined;
  const attached: string[] = [];
  try {
    root = await browser.newBrowserCDPSession();
    const cdp = root;
    contextId = (await cdp.send('Target.createBrowserContext')).browserContextId;
    const appId = (await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    const backgroundId = (await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    for (const targetId of [appId, backgroundId]) {
      await audit.attachTarget(browser, targetId);
      attached.push(targetId);
    }
    const session = await cdp.send('Target.attachToTarget', { targetId: appId, flatten: false });
    const native = app = new NativeTarget(cdp, session.sessionId);
    for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await native.command(`${domain}.enable`);
    await native.command('Page.addScriptToEvaluateOnNewDocument', { source: `(${installNativeVisibilityObserver.toString()})();` });
    const url = new URL(`/e2e/entries/app.html?worker=mission-startable&seeds=${WARP_SEEDS[0]}`, baseURL);
    await native.command('Page.navigate', { url: url.href });
    await cdp.send('Target.activateTarget', { targetId: appId });
    const state = () => native.evaluate(nativeWarpState);
    const log = () => native.evaluate(readLog, MAP_WARP_EVENTS);
    const bridge = async () => {
      const view = await native.evaluate(readBridgeView);
      if (!view) throw new Error('No mission UI store to read');
      return view;
    };
    await until(() => native.evaluate(() => document.querySelector('[data-testid="original-data-status"]')?.textContent ?? ''), text => text === 'Original game data: None in this browser.', 'Application load');
    await native.press('Import original game data');
    await until(() => native.evaluate(() => document.querySelector('#import-files') !== null), Boolean, 'Import page');
    await native.setInputFiles('#import-files', paths);
    await native.press('Start import');
    // Until the save finishes, a disabled "Save again" sits above "Return to menu"; its removal would move the button
    // between the press's settled position and its click.
    await until(() => native.evaluate(() => document.querySelector('[data-testid="import-statuses"]')?.textContent ?? ''),
      text => text.includes('Mission loads into Core') && text.includes('Saved in this browser'), 'Synthetic mission import', 60_000);
    await native.press('Return to menu');
    await until(() => native.evaluate(() => document.querySelector('button[data-eligibility]')?.getAttribute('data-eligibility')),
      eligibility => eligibility === 'eligible', 'Startable mission');
    await native.press('Start mission');
    await until(state, current => current.position === 'intro', 'Introduction');
    await native.press('Skip');
    await until(state, current => current.position === 'config', 'Mission start page');
    await native.press('Start');
    await until(state, current => current.position === 'departure', 'Departure');
    await native.press('Skip');
    await until(bridge, view => view.map?.warpRequest === 'no-destination' && view.phase === 'running', 'Running flight');

    // The map by m, a destination from the editor's own controls, and w from the refocused input zone.
    await nativePress(native, 'KeyM', 'm', 77, 'm');
    await until(bridge, view => view.context === 'map', 'Map');
    await native.evaluate(() => { document.querySelector<HTMLSelectElement>('[data-testid="dev-command-type"]')!.focus(); });
    for (const character of 'map-') await nativePress(native, '', character, 0, character);
    await until(() => native.evaluate(() => document.querySelector<HTMLSelectElement>('[data-testid="dev-command-type"]')!.value), value => value === 'map-point', 'Editor type');
    await native.evaluate(() => { document.querySelector<HTMLSelectElement>('[data-field="operation"]')!.focus(); });
    await nativePress(native, 'KeyS', 's', 83, 's');
    for (const field of ['right', 'down'] as const) {
      await native.evaluate(name => { document.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!.select(); }, field);
      await native.command('Input.insertText', { text: DESTINATION[field] });
    }
    await until(() => native.evaluate(() => ['operation', 'right', 'down'].map(name => document.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!.value)),
      values => values.join() === [DESTINATION.operation, DESTINATION.right, DESTINATION.down].join(), 'Editor fields');
    await native.press('Submit command');
    await until(bridge, current => current.map?.markerEntityId !== null && current.map?.warpRequest === 'accepted', 'Destination');
    await native.click('[data-testid="game-input-zone"]');
    await nativePress(native, 'KeyW', 'w', 87, 'w');
    await until(bridge, current => current.context === 'warp', 'Warp started');
    const started = await until(log, entries => entries.some(entry => entry.type === 'warp-started'), 'warp-started logged');
    const startTick = started.find(entry => entry.type === 'warp-started')!.tick;
    await until(state, current => (current.tick ?? 0) >= startTick + 16, 'Warp under way');

    // Really hidden: Core pauses at once and holds its tick, energy, position and the Warp's progress.
    await cdp.send('Target.activateTarget', { targetId: backgroundId });
    const hidden = await until(state, current => current.visibility === 'hidden' && current.phase === 'paused' && current.pause === 'hidden', 'Native hidden and automatic pause');
    const hiddenView = await bridge();
    expect(hiddenView).toMatchObject({ context: 'warp', phase: 'paused', tick: hidden.tick });
    await new Promise(resolve => setTimeout(resolve, 1_500));
    expect(await state()).toMatchObject({ phase: 'paused', pause: 'hidden', tick: hidden.tick });
    await cdp.send('Target.activateTarget', { targetId: appId });
    const visible = await until(state, current => current.visibility === 'visible' && current.phase === 'paused', 'Native visible return');
    expect(visible.tick).toBe(hidden.tick);
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(await state()).toMatchObject({ phase: 'paused', tick: hidden.tick });
    expect(await bridge()).toEqual(hiddenView);

    // The explicit resume continues the same Warp from the held tick. Its first frame only anchors, so each tick shown
    // afterwards is within the time since that frame; catching up the hidden time would add up to 5 ticks at once.
    await native.evaluate(watchStore);
    await native.evaluate(watchResume);
    await native.press('Resume');
    const resumed = await until(state, current => current.phase === 'running' && (current.tick ?? 0) > hidden.tick!, 'Explicit resume');
    const timing = await native.evaluate(stopWatchingResume);
    if (timing.click === null || timing.frame === null) throw new Error(`The resume click or its frame was not recorded: ${JSON.stringify(timing)}`);
    const shown = timing.ticks.filter(({ tick }) => tick > hidden.tick!);
    expect(shown.length, 'ticks shown after the resume').toBeGreaterThan(0);
    for (const { tick, time } of shown) {
      expect(tick - hidden.tick!, `ticks shown ${(time - timing.frame).toFixed(1)} ms after the resume's first frame`)
        .toBeLessThanOrEqual(Math.floor((time - timing.frame) / (1000 / 32)) + 1);
    }
    expect((await bridge()).context).toBe('warp');

    const entries = await until(log, current => current.some(entry => entry.type === 'warp-completed'), 'warp-completed logged', 90_000);
    await until(state, current => (current.tick ?? 0) >= entries.at(-1)!.tick + 16, 'Ticks after the completion');
    const final = await log();
    expect(final.map(entry => entry.type)).toEqual(['map-toggled', 'warp-destination-set', 'warp-started', 'warp-completed']);
    const completion = final[3];
    expect(completion.fields).toMatchObject({ serial: '1', arrived: 'true' });
    expect(Number(completion.fields.energyAfter)).toBe(expectedCharge(completion.fields));
    expectCompletionPublished(await native.evaluate(stopWatchingStore), completion);
    expect(await bridge()).toMatchObject({ context: 'flight', viewMode: FLIGHT_VIEW });
    expect(native.errors, 'Native page errors').toEqual([]);
    await testInfo.attach('native-warp-visibility', {
      contentType: 'application/json',
      body: JSON.stringify({ browser: browser.version(), origin: baseURL, hidden, visible, resumed, timing, started: final[2], completed: completion, allowed: native.allowed }, null, 1),
    });
    for (const targetId of [backgroundId, appId]) {
      await audit.close(targetId);
      attached.splice(attached.indexOf(targetId), 1);
    }
  } finally {
    for (const targetId of attached) await audit.close(targetId).catch(() => undefined);
    app?.dispose();
    try {
      if (root && contextId) await root.send('Target.disposeBrowserContext', { browserContextId: contextId });
    } finally {
      await browser.close();
    }
  }
});
