import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { CDPSession, Page, TestInfo } from '@playwright/test';
import type { CommMenus } from '../src/content/rule-data/comm-menus.ts';
import type { AiPrograms } from '../src/content/rule-data/ai-programs.ts';
import type { Recording } from '../src/core/replay/recording.ts';
import { PRODUCTION_CONVERTER_VERSION } from '../src/original-data/conversion/converter-version.ts';
import { MARKER } from '../src/original-data/disc/disc.test-support.ts';
import { catalogFor } from '../src/original-data/source/source.test-support.ts';
import { scenarioFiles, scenarioSource } from '../src/workers/import-scenarios.test-support.ts';
import { runReplayCheck } from '../tools/replay-check.ts';
import {
  AI_PROGRAMS_ASSET, AI_PROGRAMS_SCHEMA, COMM_MENUS_ASSET, COMM_MENUS_SCHEMA, duplicateKeywordPrograms, isAiCraftKind, missionRuleData, replayedSnapshot, schemaOnePrograms,
  seedTestEntryPackage, selfBranchingPrograms, wingmanCategoryMenus, WINGMAN_KIND_BIT, withRuleData,
} from './support/ai-wingman.ts';
import { button, filePayloads, importFiles, openTestEntry } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { devOrigin } from './support/environment.ts';
import { quietly, zoneLocked } from './support/map-picture.ts';
import { readLog, stopWatchingResume, submitEditorCommand, watchResume, type LogEntry } from './support/map-warp.ts';
import {
  chooseWingman, devState, endPlaceholder, enterMission, expectAdvancingTick, expectStableTick, leaveGuards, missionEntry, missionFrame,
  skipPlaceholder, stopWatchingPositions, waitForFrame, watchedPositions, watchPositions,
} from './support/mission-observations.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';
import { deleteCacheDatabase, loadCacheModules, readStoredRecords } from './support/resource-cache.ts';

// P3-08 subtask 24 (docs/plan/p3/08/spec.md, 验证策略: 浏览器验证; AC-10, AC-14 and AC-17 browser parts): the AI and
// wingman on the development test entry with the synthetic `mission-startable` disc, imported through the real module
// Worker or seeded, as a converted variant, into the test's isolated cache. Core facts come from the diagnostics
// panel's refreshed state and event log, and from the browser's exported recording replayed in Node; the page is driven
// by trusted input. The network audit runs throughout; nothing fakes visibility. The AI has no picture yet (P3-12/13).

test.describe.configure({ timeout: 240_000 });

const SEEDS = Object.freeze([0x0eed_0240, 0x0eed_0241]);
const WINGMAN_SEED = 0x0eed_0242;
const NATIVE_SEED = 0x0eed_0243;
/** The converter version before P3-08/13 added the keyword tables (`ai-programs` payload schema 1). */
const PREVIOUS_CONVERTER = 'osr-import.graphics-5.logic-3.audio-2.models-4';
const MISSION_LOADS = /Mission (?:loads|does not load) into Core/;
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
/** The run's events the AI and `b` cause, besides the per-tick ones. */
const AI_EVENTS = Object.freeze(['command-result', 'transponder-deployed', 'command-delivered', 'wingman-command-consumed', 'radio-queued', 'map-toggled']);

let disc: Promise<readonly File[]> | undefined;
/** The startable scenario's CloneCD file set, generated once per worker process. */
const missionDisc = (): Promise<readonly File[]> => (disc ??= scenarioFiles('mission-startable'));

const status = (page: Page) => page.getByTestId('mission-status');
const zone = (page: Page) => page.getByTestId('game-input-zone');
const log = (page: Page): Promise<LogEntry[]> => page.evaluate(readLog, [...AI_EVENTS]);
const resultsOf = (entries: readonly LogEntry[], commandType: string) =>
  entries.filter(({ type, fields }) => type === 'command-result' && fields.commandType === commandType);

/** Polls the event log until `accept` holds, and resolves to it (the log follows the panel's sampling). */
async function logUntil(page: Page, accept: (entries: readonly LogEntry[]) => boolean, what: string, timeout = 10_000): Promise<LogEntry[]> {
  let entries: LogEntry[] = [];
  await expect.poll(async () => accept(entries = await log(page)), { timeout, message: what }).toBe(true);
  return entries;
}

/** One refreshed entity row of the diagnostics panel, every cell as shown. */
interface EntityRow {
  readonly id: number;
  readonly kindBit: number;
  readonly source: string;
  readonly position: string;
  readonly state: string;
  readonly activity: string;
}

/** Page function: the refreshed panel's entity rows, every cell as shown. */
function readEntityRows(): EntityRow[] {
  return [...document.querySelectorAll<HTMLTableRowElement>('[data-testid="dev-entity"]')].map(row => ({
    id: Number(row.dataset.entityId), kindBit: Number(row.dataset.kindBit), source: row.dataset.source ?? '',
    position: row.cells[4]?.textContent ?? '', state: row.cells[5]?.textContent ?? '', activity: row.cells[6]?.textContent ?? '',
  }));
}

/** Refreshes the panel's state and reads its tick and entity rows; focus moves to the refresh button. */
async function entityRows(page: Page): Promise<{ readonly tick: number; readonly rows: EntityRow[] }> {
  const { tick } = await devState(page);
  return { tick, rows: await page.evaluate(readEntityRows) };
}

/** The rows of the AI-controlled craft: every active entity of a craft kind other than the player's. */
const aiCraft = (rows: readonly EntityRow[], player: number) =>
  rows.filter(({ id, kindBit, activity }) => id !== player && activity === 'active' && isAiCraftKind(kindBit));

/** Starts the mission with wingman option 0 into running flight, focus on the input zone, after `ticks` ticks. */
async function startFlight(page: Page, ticks = 40): Promise<void> {
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await chooseWingman(page, 0);
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(zone(page)).toBeFocused();
  await waitForFrame(page, frame => (frame.tick ?? 0) >= ticks);
}

/** Leaves the run by the mission menu; nothing of it remains. */
async function returnToMenu(page: Page): Promise<void> {
  await button(page, 'Mission menu').click();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);
}

/** Waits until the shown tick is `count` past the current one: room for anything a key would still cause. */
async function afterTicks(page: Page, count: number): Promise<void> {
  const { tick } = (await missionFrame(page))!;
  await waitForFrame(page, frame => (frame.tick ?? 0) >= tick! + count);
}

/** Writes the startable scenario's CloneCD file set under the test's output directory and returns the paths. */
async function writeDisc(testInfo: TestInfo, name = 'disc'): Promise<string[]> {
  const directory = testInfo.outputPath(name);
  await mkdir(directory, { recursive: true });
  return Promise.all((await missionDisc()).map(async file => {
    const path = `${directory}/disc${extname(file.name)}`;
    await writeFile(path, new Uint8Array(await file.arrayBuffer()));
    return path;
  }));
}

/** Opens the test entry with an empty cache, seeds `groups` under its profile (or `converterVersion`) and reloads. */
async function seedAndReload(page: Page, groups: Parameters<typeof seedTestEntryPackage>[1], seeds: readonly number[] = [], converterVersion?: string): Promise<void> {
  await openTestEntry(page, { worker: 'mission-startable', ...(seeds.length > 0 ? { seeds: seeds.join(',') } : {}) });
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await seedTestEntryPackage(page, groups, converterVersion);
  await page.reload();
}

/** After a reload, restores the saved package through the main menu until the mission entry admits it. */
async function restoreSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
}

test('the AI package imports and restores; in a real run the AI advances, b deploys a player transponder, pause holds the AI, and exit and re-entry start clean (AC-10, AC-14, AC-17)', async ({ page, audit, browser }, testInfo) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const files = await filePayloads([...await missionDisc()]);
  await importFiles(page, files, { worker: 'mission-startable', seeds: SEEDS.join(',') }, MISSION_LOADS);
  await audit.ready();
  await expect(page.getByTestId('import-statuses')).toContainText(/Saved in this browser \(saved in /, { timeout: 30_000 });

  // The import saved one package under the current converter version, its AI programs as payload schema 2.
  expect(PRODUCTION_CONVERTER_VERSION).toBe('osr-import.graphics-6.logic-4.audio-2.models-4');
  expect(AI_PROGRAMS_SCHEMA).toBe(2);
  await loadCacheModules(page);
  const stored = await readStoredRecords(page);
  expect(stored.packages.map(({ key }) => key[2])).toEqual([PRODUCTION_CONVERTER_VERSION]);
  const aiPayload = stored.payloads.filter(({ key }) => key.at(-1) === AI_PROGRAMS_ASSET);
  expect(aiPayload.map(({ key, schemaVersion }) => [key[2], schemaVersion])).toEqual([[PRODUCTION_CONVERTER_VERSION, AI_PROGRAMS_SCHEMA]]);

  // A reload offers it, and it restores verified with the mission loading.
  await page.reload();
  await restoreSaved(page);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });

  await startFlight(page);
  const { player } = await devState(page);
  if (player === null) throw new Error('The run has no player');
  const first = await entityRows(page);
  expect(first.rows.filter(({ source }) => source === 'rules')).toEqual([]);
  await afterTicks(page, 32);
  const second = await entityRows(page);
  // The AI moves its craft: every hostile and the wingman changed position over 32 ticks.
  const moved = aiCraft(second.rows, player);
  expect(moved.map(({ kindBit }) => kindBit)).toContain(WINGMAN_KIND_BIT);
  expect(moved.length).toBeGreaterThan(1);
  for (const row of moved) expect(row.position, `entity ${row.id} at ticks ${first.tick} and ${second.tick}`).not.toBe(first.rows.find(({ id }) => id === row.id)!.position);

  // b in flight: one accepted drop-transponder and a kind-14 entity the rules created, deployed by the player.
  await zone(page).click();
  await expect(zone(page)).toBeFocused();
  await page.keyboard.press('b');
  await logUntil(page, current => current.some(({ type }) => type === 'transponder-deployed'), 'transponder-deployed logged');
  // A second command or entity from the one press would show by now.
  await afterTicks(page, 4);
  let entries = await log(page);
  expect(resultsOf(entries, 'drop-transponder').map(({ fields }) => [fields.outcome, fields.reason])).toEqual([['accepted', 'null']]);
  const deployed = entries.filter(({ type }) => type === 'transponder-deployed');
  expect(deployed).toHaveLength(1);
  const transponder = Number(deployed[0].fields.entityId);
  expect(Number(deployed[0].fields.creatorEntityId)).toBe(player);
  expect(deployed[0].tick).toBe(resultsOf(entries, 'drop-transponder')[0].tick);
  const withTransponder = await entityRows(page);
  expect(withTransponder.rows.filter(({ source }) => source === 'rules').map(({ id, kindBit }) => [id, kindBit])).toEqual([[transponder, 14]]);

  // Outside flight b is refused: in the map the key binds nothing, and the command itself is ignored as out of context.
  // The map input is ready after the map's first picture and m's own activation takes real Pointer Lock (P3-13), which
  // sends every mouse event to the input zone; the browser's unlock (`document.exitPointerLock()` without a user gesture,
  // standing for Chrome's native Escape, which Playwright cannot press) frees the mouse for the panel.
  const cdp = await page.context().newCDPSession(page);
  const inputStatus = page.getByTestId('input-status');
  await zone(page).click();
  await page.keyboard.press('m');
  await logUntil(page, current => current.some(({ type, fields }) => type === 'map-toggled' && fields.open === 'true'), 'map opened');
  await expect.poll(() => zoneLocked(page)).toBe(true);
  await expect(zone(page)).toBeFocused();
  await page.keyboard.press('b');
  await afterTicks(page, 8);
  expect(resultsOf(await log(page), 'drop-transponder'), 'b in the map').toHaveLength(1);
  await quietly(cdp, 'document.exitPointerLock()');
  await expect(inputStatus).toContainText('Click the map to lock the pointer.');
  const refused = await submitEditorCommand(page, 'drop-transponder');
  expect(refused).toMatchObject({ outcome: 'ignored', reason: 'wrong-context' });
  await afterTicks(page, 4);
  entries = await log(page);
  expect(entries.filter(({ type }) => type === 'transponder-deployed'), 'no transponder from the refused command').toHaveLength(1);
  expect(resultsOf(entries, 'map-point'), 'the panel\'s clicks select nothing in the map').toEqual([]);
  // Focused again with the submit click's activation, the map may ask for the lock at once; after the browser's unlock,
  // Esc closes it.
  await zone(page).focus();
  await expect.poll(async () => (await zoneLocked(page)) || (await inputStatus.innerText()).includes('Click the map')).toBe(true);
  await quietly(cdp, 'document.exitPointerLock()');
  await expect(inputStatus).toContainText('Click the map to lock the pointer.');
  await page.keyboard.press('Escape');
  await logUntil(page, current => current.some(({ type, fields }) => type === 'map-toggled' && fields.open === 'false'), 'map closed');
  await expect(page.getByTestId('mission-menu')).toHaveCount(0);
  await cdp.detach();

  // Pause holds every entity, the event log and the tick; resume continues from the held tick without catching up.
  await button(page, 'Pause').click();
  await expect(status(page)).toHaveAttribute('data-phase', 'paused');
  const pausedTick = await expectStableTick(page, 400);
  const logCount = await page.getByTestId('dev-log-count').textContent();
  const held = await entityRows(page);
  expect(held.tick).toBe(pausedTick);
  expect(await expectStableTick(page, 1_000)).toBe(pausedTick);
  expect(await entityRows(page)).toEqual(held);
  expect(await page.getByTestId('dev-log-count').textContent()).toBe(logCount);
  await page.evaluate(watchResume);
  await button(page, 'Resume').click();
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await waitForFrame(page, frame => (frame.tick ?? 0) >= pausedTick + 16);
  const timing = await page.evaluate(stopWatchingResume);
  if (timing.click === null || timing.frame === null) throw new Error(`The resume click or its frame was not recorded: ${JSON.stringify(timing)}`);
  for (const { tick, time } of timing.ticks.filter(({ tick }) => tick > pausedTick)) {
    expect(tick - pausedTick, `ticks shown ${(time - timing.frame).toFixed(1)} ms after the resume's first frame`)
      .toBeLessThanOrEqual(Math.floor((time - timing.frame) / (1000 / 32)) + 1);
  }
  const resumed = await entityRows(page);
  for (const row of aiCraft(held.rows, player)) {
    expect(resumed.rows.find(({ id }) => id === row.id)?.position, `entity ${row.id} after resume`).not.toBe(row.position);
  }

  // The run's recording replays in Node with identical events and checkpoints; its final Core state holds the player's
  // transponder and AI controllers that ran.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('dev-recording-export').click()]);
  const recordingPath = testInfo.outputPath('ai-recording.json');
  await download.saveAs(recordingPath);
  expect(await download.failure()).toBeNull();
  const recording = JSON.parse(await readFile(recordingPath, 'utf8')) as Recording;
  expect(recording.record.run).toMatchObject({ seed: SEEDS[0], wingman: 0 });
  const source = scenarioSource('mission-startable')!;
  const report = await runReplayCheck(recordingPath, await writeDisc(testInfo), { catalog: catalogFor(source.covered, source.versionId) });
  expect(report).toMatchObject({ passed: true, error: null, finalTick: recording.result.finalTick, comparison: { match: true } });
  const recorded = recording.result.events.filter(({ type }) => type === 'transponder-deployed');
  expect(recorded).toEqual([expect.objectContaining({ entityId: transponder, creatorEntityId: player, tick: deployed[0].tick })]);
  const snapshot = await replayedSnapshot(recording);
  const entity = snapshot.state.entities.find(({ id }) => id === transponder)!;
  expect(entity).toMatchObject({ kindBit: 14, source: null, transponder: { creator: 'player' } });
  const handlers = new Set(snapshot.state.entities.flatMap(({ ai: { program } }) => (program.type === 'none' || program.controller === null ? [] : [program.controller.handler])));
  expect([...handlers].sort()).toEqual(['interpreter', 'parked', 'wingman']);
  expect(snapshot.state.ai.parseCache.length).toBeGreaterThan(0);

  // Exit and re-entry: the next run starts at its own declarations, with no transponder, and its AI advances again.
  await returnToMenu(page);
  await balance.check('after the AI run');
  await startFlight(page, 8);
  const again = await entityRows(page);
  expect((await devState(page)).seed).toBe(SEEDS[1]);
  expect(again.rows.map(({ id, kindBit, source }) => [id, kindBit, source])).toEqual(first.rows.map(({ id, kindBit, source }) => [id, kindBit, source]));
  expect((await log(page)).filter(({ type }) => type === 'transponder-deployed'), 'the old run\'s events').toEqual([]);
  await afterTicks(page, 32);
  const later = await entityRows(page);
  const craft = aiCraft(again.rows, player).map(({ id }) => id);
  expect(craft).toEqual(aiCraft(first.rows, player).map(({ id }) => id));
  for (const id of craft) {
    expect(later.rows.find(row => row.id === id)?.position, `entity ${id} after re-entry`).not.toBe(again.rows.find(row => row.id === id)!.position);
  }
  await returnToMenu(page);
  await balance.check('after re-entry');
  await balance.attach();
  await testInfo.attach('ai-run', {
    contentType: 'application/json',
    body: JSON.stringify({
      chrome: browser.version(), seed: SEEDS[0], player, transponder, pausedTick, timing,
      replay: { finalTick: report.finalTick, events: report.events, checkpoints: report.checkpoints }, handlers: [...handlers].sort(),
    }, null, 1),
  });
});

test('the wingman consumes a P3-10 order through its AI handler and answers on the radio (AC-17 AI progress)', async ({ page, audit }) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const menus = await missionRuleData<CommMenus>(COMM_MENUS_ASSET);
  await seedAndReload(page, await withRuleData({ [COMM_MENUS_ASSET]: { content: wingmanCategoryMenus(menus), schemaVersion: COMM_MENUS_SCHEMA } }), [WINGMAN_SEED]);
  await restoreSaved(page);
  await startFlight(page);
  const state = await devState(page);
  const wingman = state.entities.find(({ kindBit }) => kindBit === WINGMAN_KIND_BIT)!.id;

  // c, 1 (the wingman's category, one object: its command menu) and 2, the status order (code 7).
  await zone(page).click();
  for (const key of ['c', '1', '2']) {
    await page.keyboard.press(key);
    await afterTicks(page, 2);
  }
  const entries = await logUntil(page, current => current.some(({ type }) => type === 'wingman-command-consumed'), 'wingman-command-consumed logged');
  expect(resultsOf(entries, 'communications').map(({ fields }) => fields.outcome)).toEqual(['accepted']);
  expect(resultsOf(entries, 'select-number').map(({ fields }) => fields.outcome)).toEqual(['accepted', 'accepted']);
  const delivered = entries.filter(({ type }) => type === 'command-delivered');
  expect(delivered.map(({ fields }) => [Number(fields.receiverEntityId), Number(fields.code)])).toEqual([[wingman, 7]]);
  const consumed = entries.filter(({ type }) => type === 'wingman-command-consumed');
  expect(consumed).toHaveLength(1);
  expect(consumed[0].fields).toMatchObject({ wingmanEntityId: String(wingman), code: '7', issuedTick: String(delivered[0].tick), path: 'active', outcome: 'status' });
  expect(consumed[0].tick, 'consumed by the AI after delivery').toBeGreaterThanOrEqual(delivered[0].tick);
  expect(['11', '12', '13']).toContain(consumed[0].fields.replyLine);
  await logUntil(page, current => current.some(({ type, tick }) => type === 'radio-queued' && tick === consumed[0].tick), 'the reply queued');
  await returnToMenu(page);
});

test('an AI fault shows through the Runtime, the run stops at its tick, and after it a package that runs starts clean (AC-17)', async ({ page, audit }) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  const programs = await missionRuleData<AiPrograms>(AI_PROGRAMS_ASSET);
  await seedAndReload(page, await withRuleData({ [AI_PROGRAMS_ASSET]: { content: selfBranchingPrograms(programs), schemaVersion: AI_PROGRAMS_SCHEMA } }));
  await restoreSaved(page);
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await chooseWingman(page, 0);
  await watchPositions(page);
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  // The run faults a few ticks into its flight, which can end between two polls under load (the first flight frame
  // binds and draws the flight picture); the page's own position log records it however briefly it showed.
  await skipPlaceholder(page, 'G-02/2', 'button');

  const ended = page.getByTestId('mission-ended');
  await expect(ended).toHaveAttribute('data-ended', 'faulted');
  expect(await watchedPositions(page)).toEqual(['config', 'departure', 'flight', 'ended']);
  await stopWatchingPositions(page);
  await expect(status(page)).toHaveAttribute('data-phase', 'faulted');
  const alert = ended.getByRole('alert');
  await expect(alert).toContainText('The run stopped on a fault and cannot continue.');
  await expect(alert).toContainText('GameRuntimeError (kind faulted)');
  await expect(alert).toContainText('CoreFaultError (code budget-exhausted, site ai.dispatches-per-run)');
  // No frame of the faulting tick: the run shows the tick before it and holds it.
  expect(await expectStableTick(page, 600)).toBe(1);
  await expect(button(page, 'Refresh state')).toBeDisabled();
  await expect(page.getByTestId('dev-recording-export')).toBeDisabled();
  await ended.getByRole('button', { name: 'Return to main menu', exact: true }).click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);

  // Importing the converted package replaces the faulting one; its run starts, and its AI runs.
  const files = await filePayloads([...await missionDisc()]);
  await button(page, 'Import original game data').click();
  await page.locator('#import-files').setInputFiles(files);
  await button(page, 'Start import').click();
  await audit.ready();
  await expect(page.getByTestId('import-statuses')).toContainText('Mission loads into Core', { timeout: 60_000 });
  await button(page, 'Return to menu').click();
  await startFlight(page);
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expectAdvancingTick(page);
  await returnToMenu(page);
});

test('an earlier converter\'s schema-1 cache is not offered and stays unchanged beside a new import; an old-schema or bad AI payload under the current key is refused with feedback and starts nothing (AC-14)', async ({ page, audit }) => {
  audit.canaries({ name: 'file-name', value: MARKER });
  // A package as the converter before the keyword tables saved it, its AI programs of payload schema 1 under that
  // converter's key: nothing offers it.
  const programs = await missionRuleData<AiPrograms>(AI_PROGRAMS_ASSET);
  await seedAndReload(page, await withRuleData({ [AI_PROGRAMS_ASSET]: { content: schemaOnePrograms(programs), schemaVersion: 1 } }), [], PREVIOUS_CONVERTER);
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await expect(button(page, 'Open saved resources')).toHaveCount(0);
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'no-package');
  await loadCacheModules(page);
  const before = await readStoredRecords(page);
  expect(before.packages.map(({ key }) => key[2])).toEqual([PREVIOUS_CONVERTER]);
  expect(before.payloads.filter(({ key }) => key.at(-1) === AI_PROGRAMS_ASSET).map(({ schemaVersion }) => schemaVersion)).toEqual([1]);

  // Importing again saves the current package beside it; the earlier one is neither migrated nor deleted, and after a
  // reload only the current one is offered, restoring verified.
  await button(page, 'Import original game data').click();
  await page.locator('#import-files').setInputFiles(await filePayloads([...await missionDisc()]));
  await button(page, 'Start import').click();
  await audit.ready();
  await expect(page.getByTestId('import-statuses')).toContainText(/Saved in this browser \(saved in /, { timeout: 60_000 });
  const after = await readStoredRecords(page);
  const ofKey = (records: typeof before, converterVersion: string) => ({
    packages: records.packages.filter(({ key }) => key[2] === converterVersion), payloads: records.payloads.filter(({ key }) => key[2] === converterVersion),
  });
  expect(ofKey(after, PREVIOUS_CONVERTER)).toEqual(ofKey(before, PREVIOUS_CONVERTER));
  expect(after.packages.map(({ key }) => key[2]).sort()).toEqual([PREVIOUS_CONVERTER, PRODUCTION_CONVERTER_VERSION].sort());
  await page.reload();
  await restoreSaved(page);

  // A payload of schema 1, or one whose keyword table repeats a name, under the current key (a package no release
  // writes): the cache restores its records, and world creation refuses the mission with the payload's own diagnostic,
  // for every choice, and no run starts.
  const refusals = [
    [{ content: schemaOnePrograms(programs), schemaVersion: 1 }, `logic[${AI_PROGRAMS_ASSET}].descriptor.payloadIdentity.schemaVersion: must be the supported payload schema of the role`],
    [{ content: duplicateKeywordPrograms(programs), schemaVersion: AI_PROGRAMS_SCHEMA }, `logic[${AI_PROGRAMS_ASSET}].aiPrograms.keywordTables[0][`],
  ] as const;
  for (const [change, diagnostic] of refusals) {
    await page.goto('/e2e/entries/blank.html');
    await deleteCacheDatabase(page, devOrigin);
    await seedAndReload(page, await withRuleData({ [AI_PROGRAMS_ASSET]: change }));
    await restoreSaved(page);
    await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'button');
    for (const wingman of [0, null]) {
      await chooseWingman(page, wingman);
      await button(page, 'Start').click();
      const failure = page.getByTestId('mission-start-failure');
      await expect(failure).toHaveAttribute('data-kind', 'rejected');
      await expect(failure).toHaveAttribute('role', 'alert');
      await expect(failure).toContainText(`World creation refused the mission: content contract error at ${diagnostic}`);
      expect(await missionFrame(page)).toMatchObject({ run: null, tick: null, position: 'config' });
      expect(await leaveGuards(page)).toBe(0);
    }
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeFocused();
  }
});

/** Page function for the native page: the run's frame and status, and the document's visibility history. */
function nativeState() {
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const bar = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
  return {
    visibility: document.visibilityState,
    position: screen?.dataset.position ?? null,
    tick: number(screen?.dataset.tick),
    phase: bar?.dataset.phase ?? null,
    pause: bar?.dataset.pause ?? null,
    logCount: document.querySelector('[data-testid="dev-log-count"]')?.textContent ?? null,
    visibilityEvents: [...(window.osrVisibilityEvents ?? [])],
  };
}

function installNativeVisibilityObserver(): void {
  window.osrVisibilityEvents = [document.visibilityState];
  document.addEventListener('visibilitychange', () => { window.osrVisibilityEvents!.push(document.visibilityState); });
}

/** Page function: the refreshed state's tick and entity rows, once the panel shows a tick of at least `tick`. */
function refreshedRows(tick: number) {
  const shown = Number(document.querySelector('[data-testid="dev-state-tick"]')?.textContent ?? NaN);
  if (!(shown >= tick)) return null;
  return {
    tick: shown,
    rows: [...document.querySelectorAll<HTMLTableRowElement>('[data-testid="dev-entity"]')].map(row => [
      Number(row.dataset.entityId), row.dataset.kindBit, row.cells[4]?.textContent ?? '', row.cells[6]?.textContent ?? '',
    ]),
  };
}

test('a real hidden page pauses the AI; after visible it holds every entity until an explicit resume, which continues it (AC-17)', async ({ audit, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Native visibility requires a development origin');
  const paths = await writeDisc(testInfo, 'native-disc');
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
    const url = new URL(`/e2e/entries/app.html?worker=mission-startable&seeds=${NATIVE_SEED}`, baseURL);
    await native.command('Page.navigate', { url: url.href });
    await cdp.send('Target.activateTarget', { targetId: appId });
    const state = () => native.evaluate(nativeState);
    /** Refreshes the panel by a trusted click and reads it at or after `tick`. */
    const rows = async (tick: number) => {
      await native.press('Refresh state');
      return (await until(() => native.evaluate(refreshedRows, tick), value => value !== null, 'Refreshed state'))!;
    };
    await until(() => native.evaluate(() => document.querySelector('[data-testid="original-data-status"]')?.textContent ?? ''), text => text === 'Original game data: None in this browser.', 'Application load');
    await native.press('Import original game data');
    await until(() => native.evaluate(() => document.querySelector('#import-files') !== null), Boolean, 'Import page');
    await native.setInputFiles('#import-files', paths);
    await native.press('Start import');
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
    await until(state, current => current.phase === 'running' && (current.tick ?? 0) >= 40, 'Running flight');
    const running = await rows(40);
    // Visible ticks after that state, so the hidden tick is a later one.
    await until(state, current => (current.tick ?? 0) >= running.tick + 16, 'Ticks after the running state');

    // Really hidden: the run pauses at once and holds its tick.
    await cdp.send('Target.activateTarget', { targetId: backgroundId });
    const hidden = await until(state, current => current.visibility === 'hidden' && current.phase === 'paused' && current.pause === 'hidden', 'Native hidden and automatic pause');
    expect(hidden.tick!).toBeGreaterThan(running.tick);
    await new Promise(resolve => setTimeout(resolve, 1_500));
    expect(await state()).toMatchObject({ phase: 'paused', pause: 'hidden', tick: hidden.tick });
    await cdp.send('Target.activateTarget', { targetId: appId });
    const visible = await until(state, current => current.visibility === 'visible' && current.phase === 'paused', 'Native visible return');
    expect(visible.tick).toBe(hidden.tick);
    expect(visible.visibilityEvents).toEqual(expect.arrayContaining(['hidden', 'visible']));

    // Still paused when visible: the Core state is the hidden tick's, the AI craft as they were, twice over.
    const held = await rows(hidden.tick!);
    expect(held.tick).toBe(hidden.tick);
    const moving = held.rows.filter(([, kindBit, , activity]) => isAiCraftKind(Number(kindBit)) && activity === 'active');
    expect(moving.length).toBeGreaterThan(1);
    for (const row of moving) expect(row[2], `entity ${row[0]} between ticks ${running.tick} and ${held.tick}`).not.toBe(running.rows.find(([id]) => id === row[0])![2]);
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(await rows(hidden.tick!)).toEqual(held);
    expect(await state()).toMatchObject({ phase: 'paused', tick: hidden.tick, logCount: visible.logCount });

    // The explicit resume continues: the tick and the AI craft move on.
    await native.press('Resume');
    const resumed = await until(state, current => current.phase === 'running' && (current.tick ?? 0) >= hidden.tick! + 16, 'Explicit resume');
    const after = await rows(resumed.tick!);
    for (const [id, , position] of moving) expect(after.rows.find(row => row[0] === id)?.[2], `entity ${id} after resume`).not.toBe(position);
    await native.press('Mission menu');
    await native.press('Return to main menu');
    await until(state, current => current.position === null, 'Main menu');
    expect(native.errors, 'Native page errors').toEqual([]);
    await testInfo.attach('native-ai-visibility', {
      contentType: 'application/json',
      body: JSON.stringify({ browser: browser.version(), origin: baseURL, running: running.tick, hidden, visible, resumed: resumed.tick, allowed: native.allowed }, null, 1),
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
