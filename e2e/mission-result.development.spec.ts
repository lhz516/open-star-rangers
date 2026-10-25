import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CDPSession, Page } from '@playwright/test';
import type { TickInput } from '../src/core/contracts/tick-input.ts';
import type { DomainEvent } from '../src/core/contracts/domain-events.ts';
import { completedRun } from '../src/core/replay/recording.ts';
import { RESULT_PAGE, SLICE_GAPS, type SliceGapId } from '../src/ui/mission/slice-gaps-copy.ts';
import { scenarioEntryProfile } from '../src/workers/import-scenarios.test-support.ts';
import { seedTestEntryPackage } from './support/ai-wingman.ts';
import { button, openTestEntry } from './support/app-entry.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import { clearLog } from './support/base-interaction.ts';
import { saveRecording, tabTo } from './support/keyboard-input.ts';
import { readLog, type LogEntry } from './support/map-warp.ts';
import {
  CUTSCENE_ROW, endingPackage, expectClassicBox, replayedEnding, shownBefore, shownPlaceholder, shownResult,
  stopWatchingPages, SUMMARY_MESSAGES, SUMMARY_TEXT, watchPages, type EndingVariant, type ShownPlaceholder,
} from './support/mission-result.ts';
import {
  checkedWingman, chooseWingman, devState, endPlaceholder, enterMission, expectAdvancingTick, expectStableTick, holdKey, leaveGuards,
  missionEntry, missionFrame, waitForFrame,
} from './support/mission-observations.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';
import { seedRecords, storeSeed, type SeededPackage } from './support/production-cache.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';

// P3-11 subtask 18 (docs/plan/p3/11/spec.md, AC-12; 验证策略, 浏览器验证): rescues, endings, the G-06 result page, restart
// and return in Chrome on the development test entry. Each case seeds its isolated cache with a short synthetic variant
// of the startable mission (e2e/support/mission-result.ts) under the entry's profile and restores it through the main
// menu; the run then reaches its ending by its own rules. The page is driven only by trusted input on its own controls
// and the game input zone, whose keys submit formal input. Core's facts come from the development event log and from a
// Node replay of the recording the browser exported, which must reproduce the browser's result exactly. The network
// audit runs throughout and the resource balance closes each page case; the hidden-page case switches real tabs.
// Rescue and loss pictures and the message line are P3-12/P3-13's, not checked here.

test.describe.configure({ timeout: 300_000 });

/** The uint32 seeds of each case's runs: the first run and the restarted one. */
const SEEDS = Object.freeze({
  failure: [0x0eed_1101, 0x0eed_1102],
  cutscene: [0x0eed_1103, 0x0eed_1104],
  success: [0x0eed_1105],
  native: [0x0eed_1106],
} as const);
const PROFILE = scenarioEntryProfile('mission-startable')!;
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
/** The P3-11 events the cases read from the event log. */
const ENDING_EVENTS = Object.freeze([
  'all-clear', 'settlement-started', 'flight-message', 'player-loss-started', 'player-rescued', 'transition', 'result-latched', 'teardown-started',
  'mission-completed', 'command-result',
]);
/** Visible time a placeholder needs before it ends by itself, less the observation's slack (the boundary is a Node test). */
const NATURAL_MS = 2_900;

const zone = (page: Page) => page.getByTestId('game-input-zone');
const status = (page: Page) => page.getByTestId('mission-status');
const placeholder = (page: Page) => page.getByTestId('mission-placeholder');
const log = (page: Page): Promise<LogEntry[]> => page.evaluate(readLog, [...ENDING_EVENTS]);

/** The variant's summary and the test entry's source fingerprint must not leave the browser. */
function watchCanaries(audit: Audit): void {
  audit.canaries({ name: 'summary', value: SUMMARY_MESSAGES[0] }, { name: 'source-fingerprint', value: PROFILE.sourceFingerprint });
}

/** Polls the event log until `accept` holds, and resolves to it (the log follows the panel's sampling). */
async function logUntil(page: Page, accept: (entries: readonly LogEntry[]) => boolean, what: string, timeout = 10_000): Promise<LogEntry[]> {
  let entries: LogEntry[] = [];
  await expect.poll(async () => accept(entries = await log(page)), { timeout, message: what }).toBe(true);
  return entries;
}

const ofType = (entries: readonly LogEntry[], type: string) => entries.filter(entry => entry.type === type);

/**
 * Opens the test entry with an empty cache and `seeds`, seeds the variant's package under the entry's profile, reloads,
 * and restores it through the main menu until the mission entry admits it; resolves to what it stored.
 */
async function seedEnding(page: Page, variant: EndingVariant, seeds: readonly number[]): Promise<SeededPackage> {
  await openTestEntry(page, { worker: 'mission-startable', seeds: seeds.join(',') });
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  const seeded = await seedTestEntryPackage(page, await endingPackage(variant));
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  return seeded;
}

/** From the start page with `wingman` (an option index or null), through the departure ended by `departure`, into flight. */
async function startFromConfig(page: Page, wingman: number | null, departure: 'button' | 'Enter' | 'Space' | 'Escape'): Promise<void> {
  await chooseWingman(page, wingman);
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  await endPlaceholder(page, 'G-02/2', departure);
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(zone(page)).toBeFocused();
}

/** Waits for the placeholder of `gap` and resolves to it; a rescue's appears after up to tens of seconds of flight. */
async function awaitPlaceholder(page: Page, gap: string, timeout = 60_000): Promise<ShownPlaceholder> {
  await expect(placeholder(page)).toHaveAttribute('data-gap', gap, { timeout });
  await expect(placeholder(page)).toHaveAttribute('data-status', 'timing');
  return (await shownPlaceholder(page))!;
}

/** The note of `id`, with its copy from the one place that holds it, is visible within `scope`. */
async function expectNote(page: Page, scope: string, id: SliceGapId): Promise<void> {
  const note = page.locator(`${scope} .slice-gap[data-gap="${id}"]`);
  await expect(note).toBeVisible();
  await expect(note).toHaveText(`${SLICE_GAPS[id].title} (${id}). ${SLICE_GAPS[id].text}`);
}

/** Ends the shown placeholder by its button or a new key press. */
async function skip(page: Page, end: 'button' | 'Enter' | 'Space' | 'Escape'): Promise<void> {
  await expect(button(page, 'Skip')).toBeFocused();
  if (end === 'button') await button(page, 'Skip').click();
  else await page.keyboard.press(end === 'Space' ? ' ' : end);
}

/**
 * The result page as it opens: its heading has focus, the frozen result shows in the 4:3 view with its G-06 and
 * G-02/10 disclosures, and Tab and Shift+Tab move between Restart and Return; focus ends on the heading's next stop,
 * Restart. Resolves to what the page shows.
 */
async function expectResultPage(page: Page) {
  await expect(page.getByTestId('mission-result')).toBeVisible();
  const heading = page.locator('#mission-result-heading');
  await expect(heading).toBeFocused();
  await expectClassicBox(page, 'mission-result-view');
  await expectNote(page, '[data-testid="mission-result"]', 'G-06');
  await expectNote(page, '[data-testid="mission-result"]', 'G-02/10');
  await expect(page.getByTestId('mission-placeholder')).toHaveCount(0);
  await expect(page.getByTestId('game-input-zone')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(button(page, RESULT_PAGE.restart)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, RESULT_PAGE.return)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(button(page, RESULT_PAGE.restart)).toBeFocused();
  return (await shownResult(page))!;
}

/**
 * Exports the run's recording on the result page and replays its record in Node on the seeded package: the replay
 * reproduces the browser's result exactly and ends with the completion. Resolves to the record's inputs and the events.
 */
async function expectReplayed(page: Page, seeded: SeededPackage, name: string): Promise<{ ticks: readonly TickInput[]; events: readonly DomainEvent[] }> {
  const path = test.info().outputPath(`${name}-recording.json`);
  await mkdir(dirname(path), { recursive: true });
  await saveRecording(page, path);
  const { recording, replayed } = await replayedEnding(path, seeded);
  expect(replayed, 'The Node replay reproduces the browser run').toEqual(recording.result);
  expect(completedRun(replayed), 'The recording ends with the completion').toBe(true);
  return { ticks: recording.record.ticks, events: replayed.events };
}

/** Leaves the run by the mission menu; nothing of it remains. */
async function returnByMenu(page: Page): Promise<void> {
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);
}

/**
 * The restarted run's flight is a new run with nothing of the ended one: the next runId, a tick from the start, the
 * seed drawn anew, no result page or ending, and the wingman the start page preselected from the previous run.
 */
async function expectNewRun(page: Page, previousRun: number, seed: number, wingman: number | null): Promise<void> {
  const frame = await waitForFrame(page, current => current.position === 'flight' && (current.tick ?? 0) >= 1);
  expect(frame.run).toBe(previousRun + 1);
  const state = await devState(page);
  expect(state).toMatchObject({ run: previousRun + 1, seed, wingman });
  expect(state.tick).toBeLessThan(200);
  expect(state.entities.length).toBeGreaterThan(0);
  await expect(page.getByTestId('mission-result')).toHaveCount(0);
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
}

test('failure: a destroyed and an energy rescue continue the run, the third loss ends it through G-02/7, and Restart reaches a new run\'s flight', async ({ page, audit }, testInfo) => {
  watchCanaries(audit);
  const seeded = await seedEnding(page, 'failure', SEEDS.failure);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });
  try {
    await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'button');
    await startFromConfig(page, 0, 'Enter');
    // Refreshing the panel puts focus on its button: the rescue hold leaves focus the user put there alone.
    const first = await devState(page);
    expect(first).toMatchObject({ seed: SEEDS.failure[0], wingman: 0 });
    const refresh = button(page, 'Refresh state');
    await expect(refresh).toBeFocused();

    // G-02/5: the collision destroys the player at once; after the escape pod, the first rescue holds the run.
    await watchPages(page);
    expect(await awaitPlaceholder(page, 'G-02/5')).toEqual({ gap: 'G-02/5', status: 'timing', transition: 1, variant: null, index: null, count: null });
    await expect(refresh).toBeFocused();
    await expectNote(page, '[data-testid="mission-placeholder"]', 'G-02/5');
    let entries = await logUntil(page, current => ofType(current, 'transition').length === 1, 'G-02/5 logged');
    expect(ofType(entries, 'player-loss-started')[0].fields).toMatchObject({ loss: 'destroyed', previousSubState: '0', viewSwitched: 'true' });
    expect(ofType(entries, 'player-rescued')[0].fields).toMatchObject({ loss: 'destroyed', rescues: '1' });
    expect(ofType(entries, 'transition')[0].fields.gap).toBe('G-02/5');
    const destroyedHold = await expectStableTick(page, 600);
    expect((await missionFrame(page))!.position).toBe('transition');
    // It ends by itself after its visible time, into the same run.
    await waitForFrame(page, frame => frame.position === 'flight', 15_000);
    expect(shownBefore(await stopWatchingPages(page), 'transition G-02/5', 'flight')).toBeGreaterThanOrEqual(NATURAL_MS);
    await expect(refresh).toBeFocused();
    const continued = await expectAdvancingTick(page);
    expect(continued.from).toBeGreaterThanOrEqual(destroyedHold);
    expect((await missionFrame(page))!.run).toBe(first.run);

    // Back in the zone, Backspace (full speed) is a formal command the run accepts.
    await zone(page).click();
    await expect(zone(page)).toBeFocused();
    await page.keyboard.press('Backspace');
    entries = await logUntil(page, current => ofType(current, 'command-result').some(({ fields }) => fields.commandType === 'speed'), 'speed logged');
    expect(ofType(entries, 'command-result').filter(({ fields }) => fields.commandType === 'speed').map(({ fields }) => fields.outcome)).toEqual(['accepted']);

    // G-02/6: the player runs dry; during the beacon wait ] (pitch) and Enter go down and stay held into the hold.
    entries = await logUntil(page, current => ofType(current, 'player-loss-started').length === 2, 'energy loss logged', 30_000);
    expect(ofType(entries, 'player-loss-started')[1].fields).toMatchObject({ loss: 'energy', previousSubState: '0' });
    await page.keyboard.down(']');
    await page.keyboard.down('Enter');
    const pressed = (await missionFrame(page))!.tick!;
    const energyHold = await awaitPlaceholder(page, 'G-02/6', 30_000);
    expect(energyHold).toEqual({ gap: 'G-02/6', status: 'timing', transition: 2, variant: null, index: null, count: null });
    // Focus left with the input zone, so the hold's placeholder takes it; the held Enter's repeats do not skip it.
    await expect(button(page, 'Skip')).toBeFocused();
    for (let repeat = 0; repeat < 3; repeat++) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    const energyHeld = await expectStableTick(page, 500);
    expect(await shownPlaceholder(page)).toEqual(energyHold);
    entries = await log(page);
    expect(ofType(entries, 'player-rescued')[1].fields).toMatchObject({ loss: 'energy', rescues: '2' });
    expect(ofType(entries, 'transition').map(({ fields }) => fields.gap)).toEqual(['G-02/5', 'G-02/6']);
    // A new Esc press ends it into the same run, the input zone focused again; ] is still physically held.
    await skip(page, 'Escape');
    await waitForFrame(page, frame => frame.position === 'flight');
    await expect(zone(page)).toBeFocused();
    expect((await expectAdvancingTick(page, 800)).from).toBeGreaterThanOrEqual(energyHeld);
    const released = (await missionFrame(page))!.tick!;
    await page.keyboard.up(']');

    // G-02/7: the third loss ends the run; the ending placeholder holds no simulation and ends by itself.
    await watchPages(page);
    expect(await awaitPlaceholder(page, 'G-02/7')).toEqual({ gap: 'G-02/7', status: 'timing', transition: 3, variant: 'energy', index: 0, count: 1 });
    await expect(button(page, 'Skip')).toBeFocused();
    await expectNote(page, '[data-testid="mission-placeholder"]', 'G-02/7');
    await expect(page.getByTestId('mission-placeholder-variant')).not.toBeEmpty();
    const endingTick = await expectStableTick(page, 600);
    entries = await logUntil(page, current => ofType(current, 'mission-completed').length === 1, 'completion logged');
    expect(ofType(entries, 'result-latched')[0].fields).toMatchObject({
      outcome: 'failure', reason: 'third-loss energy', summary: 'null', rescuesUsed: '2', endingGaps: 'G-02/7 energy', playerKills: '0',
    });
    expect(ofType(entries, 'mission-completed')[0]).toMatchObject({ tick: endingTick, fields: { outcome: 'failure' } });
    expect(ofType(entries, 'transition')).toHaveLength(2);
    await waitForFrame(page, frame => frame.position === 'result', 15_000);
    expect(shownBefore(await stopWatchingPages(page), 'ending G-02/7', 'result')).toBeGreaterThanOrEqual(NATURAL_MS);

    const result = await expectResultPage(page);
    expect(result).toEqual({
      outcome: 'failure', reason: 'third-loss:energy', heading: `${RESULT_PAGE.title}: ✗ Failure`, outcomeText: '✗ Failure',
      reasonText: `${RESULT_PAGE.reasonLabel}: ${RESULT_PAGE.reason['third-loss'].energy}`, summary: 'failure', summaryText: null,
      rescues: '2 of 2', kills: '0',
    });
    await expect(page.getByTestId('mission-result-summary')).toContainText(RESULT_PAGE.summary.failure);
    expect((await missionFrame(page))!).toMatchObject({ run: first.run, tick: endingTick });

    // The recording: its replay is the browser's run, two rescues and the failure, and the held ] was cleared at the
    // G-02/6 hold: it steered before the hold and not after it, until its key-up.
    const { ticks, events } = await expectReplayed(page, seeded, 'failure');
    const transitions = events.filter((event): event is Extract<DomainEvent, { type: 'transition' }> => event.type === 'transition');
    expect(transitions.map(({ gap }) => gap)).toEqual(['G-02/5', 'G-02/6']);
    const holdTick = transitions[1].tick;
    expect(holdTick).toBeGreaterThan(pressed);
    expect(ticks.slice(pressed, holdTick).some(({ axes }) => axes.pitch !== 0), '] steered before the hold').toBe(true);
    expect(ticks.slice(holdTick, released).map(({ axes }) => axes.pitch).filter(pitch => pitch !== 0), 'the held ] after the hold').toEqual([]);

    // Restart by a held Enter on Restart, which Shift+Tab reaches from the panel's export button: one press restarts,
    // its repeats do not end G-02/1.
    await expect(page.getByTestId('dev-recording-export')).toBeFocused();
    await tabTo(page, button(page, RESULT_PAGE.restart), 'Shift+Tab');
    await holdKey(page, 'Enter', () => waitForFrame(page, frame => frame.position === 'intro'));
    await expect(placeholder(page)).toHaveAttribute('data-gap', 'G-02/1');
    await expect(placeholder(page)).toHaveAttribute('data-status', 'timing');
    await endPlaceholder(page, 'G-02/1', 'Space');
    expect(await checkedWingman(page), 'The start page preselects the last run\'s wingman').toBe(0);
    await startFromConfig(page, 0, 'Escape');
    await expectNewRun(page, first.run, SEEDS.failure[1], 0);
    // Nothing of the ended run's rescues carries over: the new run's first loss is its first rescue.
    await clearLog(page);
    await awaitPlaceholder(page, 'G-02/5');
    entries = await logUntil(page, current => ofType(current, 'player-rescued').length === 1, 'the new run\'s rescue logged');
    expect(ofType(entries, 'player-rescued')[0].fields).toMatchObject({ loss: 'destroyed', rescues: '1' });
    await skip(page, 'button');
    await waitForFrame(page, frame => frame.position === 'flight');
    await returnByMenu(page);
    await balance.check('after a failure, its result page and a restarted run');
  } finally {
    await balance.attach();
  }
});

test('success: the all-clear\'s settlement ends through G-02/8 and G-02/9 to the result with its summary, and Restart reaches a new run\'s flight', async ({ page, audit }, testInfo) => {
  watchCanaries(audit);
  const seeded = await seedEnding(page, 'success-cutscene', SEEDS.cutscene);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });
  try {
    await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'Enter');
    await startFromConfig(page, 0, 'button');
    const { run } = (await missionFrame(page))!;

    // The all-clear, the settlement with the cutscene's summary, the completion message, the latch and the completion.
    await watchPages(page);
    expect(await awaitPlaceholder(page, 'G-02/8')).toEqual({ gap: 'G-02/8', status: 'timing', transition: 1, variant: 'wingman', index: 0, count: 2 });
    await expect(button(page, 'Skip')).toBeFocused();
    await expectNote(page, '[data-testid="mission-placeholder"]', 'G-02/8');
    const endingTick = await expectStableTick(page, 600);
    const entries = await logUntil(page, current => ofType(current, 'mission-completed').length === 1, 'completion logged');
    expect(entries.filter(({ type }) => type !== 'command-result').map(({ type }) => type)).toEqual(['all-clear', 'settlement-started', 'flight-message', 'result-latched', 'teardown-started', 'mission-completed']);
    expect(ofType(entries, 'settlement-started')[0].fields).toMatchObject({ outcome: 'success', summary: 'mission/first-campaign 0/0', summarySelector: String(CUTSCENE_ROW) });
    expect(ofType(entries, 'flight-message')[0].fields).toEqual({ message: 'missionComplete' });
    expect(ofType(entries, 'result-latched')[0].fields).toMatchObject({
      outcome: 'success', reason: 'all-clear', summary: 'mission/first-campaign 0/0', rescuesUsed: '0', endingGaps: `G-02/8 wingman, G-02/9 ${CUTSCENE_ROW}`,
    });
    expect(ofType(entries, 'mission-completed')[0]).toMatchObject({ tick: endingTick, fields: { outcome: 'success' } });
    expect(ofType(entries, 'transition')).toEqual([]);

    // Skip, then G-02/9 takes focus and a new Space ends it into the result page.
    await skip(page, 'button');
    expect(await awaitPlaceholder(page, 'G-02/9')).toEqual({ gap: 'G-02/9', status: 'timing', transition: 2, variant: String(CUTSCENE_ROW), index: 1, count: 2 });
    await expect(button(page, 'Skip')).toBeFocused();
    await expectNote(page, '[data-testid="mission-placeholder"]', 'G-02/9');
    expect(await expectStableTick(page, 400)).toBe(endingTick);
    await skip(page, 'Space');
    await waitForFrame(page, frame => frame.position === 'result');
    expect((await stopWatchingPages(page)).map(entry => entry.page)).toEqual(['flight', 'ending G-02/8', 'ending G-02/9', 'result']);

    const result = await expectResultPage(page);
    expect(result).toEqual({
      outcome: 'success', reason: 'all-clear', heading: `${RESULT_PAGE.title}: ✓ Success`, outcomeText: '✓ Success',
      reasonText: `${RESULT_PAGE.reasonLabel}: ${RESULT_PAGE.reason['all-clear']}`, summary: 'text', summaryText: SUMMARY_TEXT,
      rescues: '0 of 2', kills: '0',
    });
    await expect(page.getByTestId('mission-result-summary')).toContainText(RESULT_PAGE.summary.source);
    const { events } = await expectReplayed(page, seeded, 'success-cutscene');
    // The all-clear follows the collision kills of the hostiles of both kinds, which no input caused; nothing else dies.
    const decisive = events.filter(({ type }) => type === 'object-destroyed' || type === 'all-clear' || type === 'mission-completed');
    const clear = decisive.findIndex(({ type }) => type === 'all-clear');
    const kills = decisive.slice(0, clear).map(event => (event.type === 'object-destroyed' ? `${event.kindBit} ${event.attacker.type}` : event.type));
    expect(new Set(kills)).toEqual(new Set(['7 none', '8 none']));
    expect(decisive.slice(clear).map(({ type }) => type)).toEqual(['all-clear', 'mission-completed']);

    // Restart by click; the introduction ends by itself and the start page preselects the wingman.
    await watchPages(page);
    await button(page, RESULT_PAGE.restart).click();
    await waitForFrame(page, frame => frame.position === 'config', 15_000);
    expect(shownBefore(await stopWatchingPages(page), 'intro G-02/1', 'config')).toBeGreaterThanOrEqual(NATURAL_MS);
    expect(await checkedWingman(page)).toBe(0);
    await startFromConfig(page, 0, 'Space');
    await expectNewRun(page, run!, SEEDS.cutscene[1], 0);
    await returnByMenu(page);
    await balance.check('after a success, its endings and a restarted run');
  } finally {
    await balance.attach();
  }
});

test('success without a cutscene: G-02/8 alone, an empty summary, and Return to main menu from the result page', async ({ page, audit }, testInfo) => {
  watchCanaries(audit);
  await seedEnding(page, 'success', SEEDS.success);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });
  try {
    await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'Escape');
    await startFromConfig(page, null, 'Space');
    await watchPages(page);
    expect(await awaitPlaceholder(page, 'G-02/8')).toEqual({ gap: 'G-02/8', status: 'timing', transition: 1, variant: 'solo', index: 0, count: 1 });
    await skip(page, 'Enter');
    await waitForFrame(page, frame => frame.position === 'result');
    expect((await stopWatchingPages(page)).map(entry => entry.page)).toEqual(['flight', 'ending G-02/8', 'result']);
    const result = await expectResultPage(page);
    expect(result).toMatchObject({ outcome: 'success', reason: 'all-clear', summary: 'empty', summaryText: null, rescues: '0 of 2', kills: '0' });
    await expect(page.getByTestId('mission-result-summary')).toContainText(RESULT_PAGE.summary.empty);
    // Game keys on the result page act on nothing: the run is over and its tick stays.
    const { tick } = (await missionFrame(page))!;
    for (const key of ['p', 'Backspace', 'm']) await page.keyboard.press(key);
    expect(await expectStableTick(page, 400)).toBe(tick);
    await expect(page.getByTestId('mission-result')).toBeVisible();

    await button(page, RESULT_PAGE.return).click();
    await expect(missionEntry(page)).toBeFocused();
    expect(await missionFrame(page)).toBeNull();
    expect(await leaveGuards(page)).toBe(0);
    await balance.check('after a success and the result page\'s return');
  } finally {
    await balance.attach();
  }
});

/** What the native case reads of the page: visibility, the run, its pause, the placeholder and the result. */
function nativeState() {
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const status = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const placeholder = document.querySelector<HTMLElement>('[data-testid="mission-placeholder"]');
  const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
  return {
    visibility: document.visibilityState,
    position: screen?.dataset.position ?? null,
    run: number(screen?.dataset.run),
    tick: number(screen?.dataset.tick),
    phase: status?.dataset.phase ?? null,
    pause: status?.dataset.pause ?? null,
    placeholder: placeholder ? { gap: placeholder.dataset.gap ?? null, status: placeholder.dataset.status ?? null } : null,
    result: document.querySelector<HTMLElement>('[data-testid="mission-result"]')?.dataset.outcome ?? null,
    focus: document.activeElement?.id || document.activeElement?.textContent || document.activeElement?.tagName || null,
    time: performance.now(),
  };
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

test('a real hidden page holds a rescue placeholder and an ending placeholder\'s visible time, and the rescue needs an explicit resume', async ({ audit, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Real visibility requires a development origin');
  watchCanaries(audit);
  const browser = await nativeBrowser();
  let root: CDPSession | undefined;
  let contextId: string | undefined;
  let app: NativeTarget | undefined;
  const audited: string[] = [];
  try {
    root = await browser.newBrowserCDPSession();
    const cdp = root;
    contextId = (await cdp.send('Target.createBrowserContext')).browserContextId;
    const appId = (await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    const backgroundId = (await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    for (const targetId of [appId, backgroundId]) {
      await audit.attachTarget(browser, targetId);
      audited.push(targetId);
    }
    const session = await cdp.send('Target.attachToTarget', { targetId: appId, flatten: false });
    const native = app = new NativeTarget(cdp, session.sessionId);
    for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await native.command(`${domain}.enable`);
    const url = new URL(`/e2e/entries/app.html?worker=mission-startable&seeds=${SEEDS.native[0]}`, baseURL);
    await native.command('Page.navigate', { url: url.href });
    await cdp.send('Target.activateTarget', { targetId: appId });
    const show = async (targetId: string) => { await cdp.send('Target.activateTarget', { targetId }); };
    const state = () => native.evaluate(nativeState);
    const dataStatus = () => native.evaluate(() => document.querySelector('[data-testid="original-data-status"]')?.textContent ?? '');
    await until(dataStatus, text => text === 'Original game data: None in this browser.', 'Application load');
    const { records } = await seedRecords(await endingPackage('failure'), PROFILE);
    await native.evaluate(storeSeed, records);
    await native.command('Page.reload');
    await until(dataStatus, text => text.includes('not yet verified'), 'Saved package offered', 10_000);
    await native.press('Open saved resources');
    await until(
      () => native.evaluate(() => document.querySelector('[aria-describedby="mission-entry-description"]')?.getAttribute('data-eligibility')),
      eligibility => eligibility === 'eligible',
      'Restored ending mission',
      30_000,
    );
    await native.press('Start mission');
    await until(state, current => current.position === 'intro', 'Introduction placeholder');
    await native.press('Skip');
    await until(state, current => current.position === 'config', 'Mission start page');
    await native.click('[data-testid="mission-wingmen"] input[data-wingman="none"]');
    await native.press('Start');
    await until(state, current => current.position === 'departure', 'Departure placeholder');
    await native.press('Skip');
    await until(state, current => current.position === 'flight' && current.phase === 'running', 'Running flight');

    // Hidden during the destroyed rescue's hold: the placeholder waits, no tick passes, and no hidden time counts.
    const holding = await until(state, current => current.placeholder?.gap === 'G-02/5' && current.placeholder.status === 'timing', 'G-02/5 placeholder', 30_000);
    await show(backgroundId);
    const waiting = await until(state, current => current.visibility === 'hidden' && current.placeholder?.status === 'waiting', 'Hidden G-02/5 placeholder');
    expect(waiting.tick).toBe(holding.tick);
    await wait(3_500);
    expect(await state()).toMatchObject({ visibility: 'hidden', position: 'transition', tick: holding.tick, placeholder: { gap: 'G-02/5', status: 'waiting' } });
    await show(appId);
    await until(state, current => current.visibility === 'visible' && current.placeholder?.status === 'timing', 'Visible G-02/5 placeholder');
    await native.press('Skip');
    // A hold the page was hidden in ends paused: only an explicit resume runs the same run on.
    const rescued = await until(state, current => current.position === 'flight' && current.phase !== null, 'Flight after the rescue hold');
    expect(rescued).toMatchObject({ phase: 'paused', pause: 'hidden', tick: holding.tick, run: holding.run });
    await wait(400);
    expect(await state()).toMatchObject({ phase: 'paused', tick: holding.tick });
    await native.click('[data-testid="game-input-zone"]');
    await native.command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p', windowsVirtualKeyCode: 80 });
    await native.command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p', windowsVirtualKeyCode: 80 });
    await until(state, current => current.phase === 'running' && (current.tick ?? 0) > holding.tick!, 'Explicit resume');

    // G-02/6 is skipped while visible; then hidden during the failure's G-02/7, its visible time stops.
    await until(state, current => current.placeholder?.gap === 'G-02/6' && current.placeholder.status === 'timing', 'G-02/6 placeholder', 60_000);
    await native.press('Skip');
    const ending = await until(state, current => current.placeholder?.gap === 'G-02/7' && current.placeholder.status === 'timing', 'G-02/7 placeholder', 60_000);
    await show(backgroundId);
    const hiddenEnding = await until(state, current => current.visibility === 'hidden' && current.placeholder?.status === 'waiting', 'Hidden G-02/7 placeholder');
    await wait(3_500);
    expect(await state()).toMatchObject({ visibility: 'hidden', position: 'ending', tick: ending.tick, placeholder: { gap: 'G-02/7', status: 'waiting' } });
    await show(appId);
    const visibleAgain = await until(state, current => current.visibility === 'visible' && current.placeholder?.status === 'timing', 'Visible G-02/7 placeholder');
    // It ends by itself only after its own visible time, onto the result page, whose heading takes focus. By the page's
    // clock, the time it showed before the hide (at most until the hidden reading, plus one poll for its appearance)
    // and after it together reach the 3 s, less the readings' slack: the 3.5 s hidden counted for nothing.
    const result = await until(state, current => current.position === 'result', 'Result page', 15_000);
    const before = hiddenEnding.time - ending.time + 100;
    expect(before + (result.time - visibleAgain.time), 'G-02/7 counted hidden time').toBeGreaterThanOrEqual(NATURAL_MS - 200);
    expect(result).toMatchObject({ visibility: 'visible', run: holding.run, tick: ending.tick, result: 'failure', focus: 'mission-result-heading' });
    expect(native.errors, 'Native application errors').toEqual([]);
    await testInfo.attach('native-visibility', {
      contentType: 'application/json',
      body: JSON.stringify({ browser: browser.version(), origin: baseURL, holding, waiting, rescued, ending, result, allowed: native.allowed }),
    });
    for (const targetId of [backgroundId, appId]) {
      await audit.close(targetId);
      audited.splice(audited.indexOf(targetId), 1);
    }
  } finally {
    for (const targetId of audited) await audit.close(targetId).catch(() => undefined);
    app?.dispose();
    try {
      if (root && contextId) await root.send('Target.disposeBrowserContext', { browserContextId: contextId });
    } finally {
      await browser.close();
    }
  }
});
