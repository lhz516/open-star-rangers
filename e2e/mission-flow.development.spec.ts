import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { catalogFor } from '../src/original-data/source/source.test-support.ts';
import { MISSION_OBJECTIVES, SLICE_GAPS } from '../src/ui/mission/slice-gaps-copy.ts';
import type { Recording } from '../src/core/replay/recording.ts';
import { GAME_REPLAY_VERSION } from '../src/core/replay/recording.ts';
import { RULES_VERSION } from '../src/core/replay/rules-version.ts';
import { MISSION_SCENARIOS, scenarioFiles, scenarioSource, type MissionScenario } from '../src/workers/import-scenarios.test-support.ts';
import { exitCode, runReplayCheck } from '../tools/replay-check.ts';
import { button, filePayloads, importFiles, openTestEntry } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { exportedTickInputs, openKeyboardMenu, startKeyboardFlight, tabTo, waitForTickAfter } from './support/keyboard-input.ts';
import {
  checkedWingman, chooseWingman, devState, endPlaceholder, enterMission, expectAdvancingTick, expectGaps, expectStableTick, holdKey,
  leaveGuards, missionEntry, missionFrame, reloadWithoutConfirmation, requestLeave, stopWatchingPositions, submitDevCommand,
  waitForFrame, watchPositions, type DevState,
} from './support/mission-observations.ts';

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
  // A command through the run's queue: Core answers it not-implemented, with the commandId the submit returned.
  const command = await submitDevCommand(page);
  expect(command).toMatchObject({ run: 1, outcome: 'rejected', reason: 'not-implemented' });
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
