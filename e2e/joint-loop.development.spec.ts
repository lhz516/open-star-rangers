import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Page } from '@playwright/test';
import type { DomainEvent } from '../src/core/contracts/domain-events.ts';
import { RESULT_PAGE } from '../src/ui/mission/slice-gaps-copy.ts';
import { scenarioEntryProfile } from '../src/workers/import-scenarios.test-support.ts';
import { seedTestEntryPackage } from './support/ai-wingman.ts';
import { button, openTestEntry } from './support/app-entry.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import { clearLog, shownBase } from './support/base-interaction.ts';
import {
  afterTicks, awaitPlaceholder, DOCKING_COMMAND, holdGun, JOINT_KINDS, jointLoopPackage, openLockedMap, pressInZone, replayJointLoop, requestDocking,
  holdEnded, resultPage, selectContact, type JointLoopReplay, type JointLoopVariant,
} from './support/joint-loop.ts';
import { saveRecording } from './support/keyboard-input.ts';
import { bridgeView, readLog, waitForBridge, type LogEntry } from './support/map-warp.ts';
import type { ShownResult } from './support/mission-result.ts';
import {
  checkedWingman, chooseWingman, devState, endPlaceholder, enterMission, expectAdvancingTick, expectStableTick, leaveGuards, missionEntry, missionFrame,
  waitForFrame,
} from './support/mission-observations.ts';
import type { SeededPackage } from './support/production-cache.ts';

// P3-15 subtask 01 (docs/plan/p3/15/spec.md, S-01, S-02; AC-01 development, AC-02): the joint loop of the selected slice
// (group 0 / slot 1, raw difficulty 19, with and without a wingman) in Chrome on the development test entry. Each case
// seeds its isolated cache with a variant of the synthetic startable package (e2e/support/joint-loop.ts) under the
// entry's profile and restores it through the main menu. The runs advance only by trusted input on the page's own
// controls, the game input zone and the map cursor: no command editor, no forced ending, no Core state write. Each step
// is asserted from the page (mission screen, placeholders, base and result pages, the mission's UI store) and from the
// formal Core events of the development event log; the panel is only read and asked for the recording. Each run's
// recording, made by this Chromium, is replayed in this Node process on the seeded package and must match it
// (`{ match: true }`), a claim about this code version, content identity and these two runtimes only. Restart on each result page starts a new run from tick 0. The network audit runs
// throughout. Lifecycle, resource balance and production are subtasks 02 and 03.

test.describe.configure({ timeout: 600_000 });

/** The uint32 seeds of each case's runs, the first run's and the restarted one's. */
const SEEDS = Object.freeze({ success: [0x0eed_1501, 0x0eed_1502], failure: [0x0eed_1511, 0x0eed_1512] } as const);
const PROFILE = scenarioEntryProfile('mission-startable')!;
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
/** The formal Core events the steps read from the development event log. */
const STEP_EVENTS = Object.freeze([
  'command-result', 'target-changed', 'shot-fired', 'hit', 'object-destroyed', 'map-toggled', 'warp-destination-set', 'warp-started', 'warp-completed',
  'docking-requested', 'command-delivered', 'docking-cancelled', 'docked', 'departed', 'transition', 'all-clear', 'settlement-started', 'player-loss-started',
  'player-rescued', 'result-latched', 'mission-completed',
]);

const zone = (page: Page) => page.getByTestId('game-input-zone');
const status = (page: Page) => page.getByTestId('mission-status');
const placeholder = (page: Page) => page.getByTestId('mission-placeholder');
const log = (page: Page): Promise<LogEntry[]> => page.evaluate(readLog, [...STEP_EVENTS]);
const ofType = (entries: readonly LogEntry[], type: string) => entries.filter(entry => entry.type === type);
const resultsOf = (entries: readonly LogEntry[], commandType: string) => ofType(entries, 'command-result').filter(({ fields }) => fields.commandType === commandType);

/** Polls the event log until `accept` holds, and resolves to it (the log follows the panel's sampling). */
async function logUntil(page: Page, accept: (entries: readonly LogEntry[]) => boolean, what: string, timeout = 10_000): Promise<LogEntry[]> {
  let entries: LogEntry[] = [];
  await expect.poll(async () => accept(entries = await log(page)), { timeout, message: what }).toBe(true);
  return entries;
}

/** The test entry's source fingerprint must not leave the browser. */
const watchCanaries = (audit: Audit): void => { audit.canaries({ name: 'source-fingerprint', value: PROFILE.sourceFingerprint }); };

/**
 * Opens the test entry with an empty cache and `seeds`, seeds the variant under the entry's profile, reloads and
 * restores it through the main menu until the mission entry admits it; resolves to what it stored.
 */
async function restoreVariant(page: Page, variant: JointLoopVariant, seeds: readonly number[]): Promise<SeededPackage> {
  await openTestEntry(page, { worker: 'mission-startable', seeds: seeds.join(',') });
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  const seeded = await seedTestEntryPackage(page, await jointLoopPackage(variant));
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  return seeded;
}

/** One run of a case: its configuration, and the steps it asserted, in order, for the evidence. */
interface RunLog {
  readonly variant: JointLoopVariant;
  readonly wingman: number | null;
  readonly seed: number;
  readonly run: number;
  readonly steps: string[];
}

/**
 * Takeoff from the start page: `wingman` chosen, Start, the departure placeholder over the new run at tick 0, its
 * Skip, and running flight with focus in the input zone. The panel's refreshed state names the run, its seed, wingman
 * and player, and the mission's craft. Focus goes back to the input zone, where the run's keys act.
 */
async function takeOff(page: Page, run: RunLog): Promise<number> {
  await chooseWingman(page, run.wingman);
  await button(page, 'Start').click();
  const departure = await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  expect(departure).toMatchObject({ run: run.run, tick: 0 });
  await expect(placeholder(page)).toHaveAttribute('data-gap', 'G-02/2');
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(zone(page)).toBeFocused();
  await expectAdvancingTick(page);
  const state = await devState(page);
  expect(state).toMatchObject({ run: run.run, seed: run.seed, wingman: run.wingman });
  expect(state.player).not.toBeNull();
  expect(state.tick, 'A new run from its first ticks').toBeLessThan(300);
  const kinds = state.entities.map(({ kindBit }) => kindBit);
  for (const kind of [JOINT_KINDS.player, JOINT_KINDS.ahead, JOINT_KINDS.byBase, JOINT_KINDS.friendly, JOINT_KINDS.base]) expect(kinds).toContain(kind);
  expect(state.entities.filter(({ source }) => source.startsWith('wingman#')).map(({ source }) => source)).toEqual(run.wingman === null ? [] : [`wingman#${run.wingman}`]);
  await zone(page).focus();
  run.steps.push(`takeoff: G-02/2 over run ${run.run} at tick 0, then running flight; seed ${run.seed}, wingman ${run.wingman ?? 'none'}, player ${state.player}`);
  return state.player!;
}

/**
 * The success run after takeoff: flight at full speed, a friendly then the enemy targeted, the craft ahead shot down,
 * a pitch, the map with the base selected by the locked cursor, the Warp, a stop, docking through the communications
 * menu, the G-02/3 hold, the base page, the launch and its G-02/4 hold, the craft by the base shot down, the all-clear,
 * the settlement and G-02/8, to the result page.
 */
async function flySuccess(page: Page, run: RunLog, player: number): Promise<ShownResult> {
  const shooter = `shooter ${player} kind ${JOINT_KINDS.player}`;
  await clearLog(page);
  // Flight: Backspace is full speed, and the player moves.
  const before = (await bridgeView(page)).position!;
  await pressInZone(page, 'Backspace');
  let entries = await logUntil(page, current => resultsOf(current, 'speed').length === 1, 'Backspace logged');
  expect(resultsOf(entries, 'speed')[0].fields).toMatchObject({ outcome: 'accepted' });
  await afterTicks(page, 16);
  const moved = (await bridgeView(page)).position!;
  expect(moved.z, 'The player flies forward').toBeGreaterThan(before.z);
  run.steps.push(`flight: speed maximum accepted; z ${before.z.toFixed(1)} → ${moved.z.toFixed(1)}`);

  // Targets: f a friendly, t the enemy ahead, each a command's change.
  await pressInZone(page, 'f');
  await pressInZone(page, 't');
  entries = await logUntil(page, current => ofType(current, 'target-changed').filter(({ fields }) => fields.origin === 'command').length === 2, 'f and t logged');
  const [friendly, enemy] = ofType(entries, 'target-changed').filter(({ fields }) => fields.origin === 'command');
  expect(friendly.fields).toMatchObject({ mode: 'friendly' });
  expect([String(JOINT_KINDS.wingman), String(JOINT_KINDS.friendly)]).toContain(friendly.fields.targetKindBit);
  expect(enemy.fields).toMatchObject({ mode: 'enemy', targetKindBit: String(JOINT_KINDS.ahead), previousTarget: friendly.fields.target });
  run.steps.push(`targets: f → kind ${friendly.fields.targetKindBit}, t → kind ${JOINT_KINDS.ahead} (entity ${enemy.fields.target}), both origin=command`);

  // Fire: Alt held, the gun's shots hit the craft ahead and destroy it.
  await holdGun(page);
  entries = await logUntil(page, current => ofType(current, 'object-destroyed').some(({ fields }) => fields.kindBit === String(JOINT_KINDS.ahead)), 'The craft ahead destroyed');
  expect(ofType(entries, 'shot-fired').every(({ fields }) => fields.shooterKindBit === String(JOINT_KINDS.player) && fields.trigger.includes('primary'))).toBe(true);
  expect(ofType(entries, 'hit').find(({ fields }) => fields.victimEntityId === enemy.fields.target)?.fields).toMatchObject({ attacker: shooter, cause: 'projectile' });
  expect(ofType(entries, 'object-destroyed').find(({ fields }) => fields.entityId === enemy.fields.target)?.fields).toMatchObject({ attacker: shooter, kindBit: String(JOINT_KINDS.ahead) });
  expect(ofType(entries, 'all-clear'), 'The craft by the base remains').toEqual([]);
  run.steps.push(`fire: Alt shots ${ofType(entries, 'shot-fired').length}, hit and object-destroyed of entity ${enemy.fields.target} by the player`);
  // A pitch: ] held for a few ticks (its axes are checked in the recording).
  await page.keyboard.down(']');
  await afterTicks(page, 8);
  await page.keyboard.up(']');

  // The map: m opens it locked; the cursor goes to the base's contact and clicks; w starts the Warp to it.
  await clearLog(page);
  await openLockedMap(page);
  entries = await logUntil(page, current => ofType(current, 'map-toggled').length === 1, 'm logged');
  expect(ofType(entries, 'map-toggled')[0].fields).toMatchObject({ open: 'true', viewMode: '8', previousViewMode: '12' });
  await selectContact(page, JOINT_KINDS.base);
  entries = await logUntil(page, current => ofType(current, 'warp-destination-set').length === 1, 'The selected destination logged');
  const destination = ofType(entries, 'warp-destination-set')[0].fields;
  expect(destination).toMatchObject({ iconKindBit: String(JOINT_KINDS.base), playerEntityId: String(player) });
  expect((await waitForBridge(page, view => view.map?.warpRequest === 'accepted', 'The Warp gate did not accept')).context).toBe('map');
  await page.keyboard.press('w');
  entries = await logUntil(page, current => ofType(current, 'warp-started').length === 1, 'w logged');
  expect(ofType(entries, 'warp-started')[0].fields).toMatchObject({ serial: '1', fromViewMode: '8' });
  await waitForBridge(page, view => view.context === 'warp', 'The bridge did not report the Warp');
  entries = await logUntil(page, current => ofType(current, 'warp-completed').length === 1, 'The Warp completed', 30_000);
  const arrival = ofType(entries, 'warp-completed')[0].fields;
  expect(arrival).toMatchObject({ serial: '1', arrived: 'true', snapped: destination.iconEntityId, viewMode: '12' });
  await waitForBridge(page, view => view.context === 'flight' && view.map?.state === 'closed', 'The Warp did not end in flight');
  await expect(zone(page)).toBeFocused();
  run.steps.push(`map/Warp: map-toggled open, cursor select on the base (entity ${destination.iconEntityId}), warp-started, warp-completed snapped above it`);

  // Docking: \ stops the player; c, 2, 2 request docking; the base answers and the player docks into the G-02/3 hold.
  await clearLog(page);
  await pressInZone(page, 'Backslash', 40);
  await requestDocking(page);
  entries = await logUntil(page, current => ofType(current, 'docking-requested').length === 1, 'The docking request logged');
  expect(ofType(entries, 'command-delivered')[0].fields).toMatchObject({ code: String(DOCKING_COMMAND), receiverKindBit: String(JOINT_KINDS.base) });
  expect(resultsOf(entries, 'speed')[0].fields).toMatchObject({ outcome: 'accepted' });
  expect(resultsOf(entries, 'communications').map(({ fields }) => fields.outcome)).toEqual(['accepted']);
  expect(resultsOf(entries, 'select-number').map(({ fields }) => fields.outcome)).toEqual(['accepted', 'accepted']);
  await awaitPlaceholder(page, 'G-02/3', 30_000);
  entries = await logUntil(page, current => ofType(current, 'transition').length === 1, 'The docking hold logged');
  expect(ofType(entries, 'docked')[0].fields).toMatchObject({ baseEntityId: destination.iconEntityId });
  expect(ofType(entries, 'docking-cancelled')).toEqual([]);
  expect(ofType(entries, 'transition')[0].fields.gap).toBe('G-02/3');
  const held = await expectStableTick(page);
  await holdEnded(page);
  await expect(page.getByTestId('base-page')).toBeVisible();
  await expect(page.getByTestId('base-page')).toHaveAttribute('data-base', destination.iconEntityId);
  expect((await shownBase(page))!.rows).toHaveLength(11);
  await expect(zone(page)).toBeFocused();
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(held);
  run.steps.push(`docking: \\ stop, c/2/2 delivered code ${DOCKING_COMMAND}, docked at the base, G-02/3 held tick ${held}, base page`);

  // Launch: l leaves the base into the G-02/4 hold, then flight; the craft by the base is the target ahead.
  await clearLog(page);
  // The launch's hold stops the ticks at once, so nothing waits for one after l.
  await page.keyboard.press('l');
  await awaitPlaceholder(page, 'G-02/4', 15_000);
  entries = await logUntil(page, current => ofType(current, 'transition').length === 1, 'The launch hold logged');
  expect(resultsOf(entries, 'launch').map(({ fields }) => fields.outcome)).toEqual(['accepted']);
  expect(ofType(entries, 'departed')).toHaveLength(1);
  expect(ofType(entries, 'transition')[0].fields.gap).toBe('G-02/4');
  await holdEnded(page);
  await expect(page.getByTestId('base-page')).toHaveCount(0);
  await expect(zone(page)).toBeFocused();
  entries = await logUntil(page, current => ofType(current, 'target-changed').some(({ fields }) => fields.targetKindBit === String(JOINT_KINDS.byBase)), 'The craft by the base targeted');
  const target = ofType(entries, 'target-changed').find(({ fields }) => fields.targetKindBit === String(JOINT_KINDS.byBase))!.fields.target;
  run.steps.push(`launch: l accepted, departed, G-02/4, flight; target-changed to kind ${JOINT_KINDS.byBase} (entity ${target})`);

  // The last kill: the all-clear and the settlement, then the G-02/8 ending, which holds the run.
  await holdGun(page);
  entries = await logUntil(page, current => ofType(current, 'settlement-started').length === 1, 'The all-clear\'s settlement');
  expect(ofType(entries, 'object-destroyed').find(({ fields }) => fields.entityId === target)?.fields).toMatchObject({ attacker: shooter, kindBit: String(JOINT_KINDS.byBase) });
  expect(ofType(entries, 'all-clear')[0].fields).toMatchObject({ entityId: target, kindBit: String(JOINT_KINDS.byBase) });
  expect(ofType(entries, 'settlement-started')[0].fields).toMatchObject({ outcome: 'success', summary: 'mission/first-campaign 0/0', summarySelector: '0' });
  run.steps.push(`last kill: entity ${target} destroyed by the player, all-clear, settlement-started success`);
  const variant = run.wingman === null ? 'solo' : 'wingman';
  expect(await awaitPlaceholder(page, 'G-02/8')).toMatchObject({ variant, index: 0, count: 1 });
  const ending = await expectStableTick(page);
  entries = await logUntil(page, current => ofType(current, 'mission-completed').length === 1, 'The completion logged');
  expect(ofType(entries, 'result-latched')[0].fields).toMatchObject({
    outcome: 'success', reason: 'all-clear', summary: 'mission/first-campaign 0/0', rescuesUsed: '0', endingGaps: `G-02/8 ${variant}`, playerKills: '2',
  });
  expect(ofType(entries, 'mission-completed')[0]).toMatchObject({ tick: ending, fields: { outcome: 'success' } });
  const result = await resultPage(page);
  run.steps.push(`ending: result-latched success all-clear (2 kills), mission-completed at tick ${ending}, G-02/8 ${variant}, result page`);
  return result;
}

/**
 * The failure run after takeoff: the friendly on the player destroys it at once (G-02/5 after the escape pod), the
 * rescued player flies at full speed and runs dry (G-02/6), and the third loss ends the run through G-02/7.
 */
async function flyFailure(page: Page, run: RunLog): Promise<ShownResult> {
  expect((await awaitPlaceholder(page, 'G-02/5')).variant).toBeNull();
  let entries = await logUntil(page, current => ofType(current, 'transition').length === 1, 'G-02/5 logged');
  expect(ofType(entries, 'player-loss-started')[0].fields).toMatchObject({ loss: 'destroyed' });
  expect(ofType(entries, 'player-rescued')[0].fields).toMatchObject({ loss: 'destroyed', rescues: '1' });
  const destroyedHold = await expectStableTick(page);
  await holdEnded(page);
  await zone(page).click();
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(destroyedHold);
  run.steps.push(`loss 1: player-loss-started destroyed, player-rescued (1), G-02/5 held tick ${destroyedHold}, back in flight`);

  await pressInZone(page, 'Backspace');
  entries = await logUntil(page, current => ofType(current, 'player-loss-started').length === 2, 'The energy loss', 60_000);
  expect(resultsOf(entries, 'speed')[0].fields).toMatchObject({ outcome: 'accepted' });
  expect(ofType(entries, 'player-loss-started')[1].fields).toMatchObject({ loss: 'energy' });
  expect((await awaitPlaceholder(page, 'G-02/6')).variant).toBeNull();
  entries = await logUntil(page, current => ofType(current, 'player-rescued').length === 2, 'The energy rescue');
  expect(ofType(entries, 'player-rescued')[1].fields).toMatchObject({ loss: 'energy', rescues: '2' });
  const energyHold = await expectStableTick(page);
  await holdEnded(page);
  await zone(page).click();
  run.steps.push(`loss 2: Backspace accepted, player-loss-started energy, player-rescued (2), G-02/6 held tick ${energyHold}`);

  await pressInZone(page, 'Backspace');
  expect(await awaitPlaceholder(page, 'G-02/7')).toMatchObject({ variant: 'energy', index: 0, count: 1 });
  const ending = await expectStableTick(page);
  entries = await logUntil(page, current => ofType(current, 'mission-completed').length === 1, 'The completion logged');
  expect(ofType(entries, 'player-loss-started')[2].fields).toMatchObject({ loss: 'energy' });
  expect(ofType(entries, 'result-latched')[0].fields).toMatchObject({
    outcome: 'failure', reason: 'third-loss energy', summary: 'null', rescuesUsed: '2', endingGaps: 'G-02/7 energy', playerKills: '0',
  });
  expect(ofType(entries, 'mission-completed')[0]).toMatchObject({ tick: ending, fields: { outcome: 'failure' } });
  const result = await resultPage(page);
  run.steps.push(`loss 3: player-loss-started energy, result-latched failure third-loss energy, mission-completed at tick ${ending}, G-02/7, result page`);
  return result;
}

/** A replay's events of `types`, in order, with the craft, loss or gap they name. */
const replayedSteps = (events: readonly DomainEvent[], types: readonly string[]): string[] => events.filter(({ type }) => types.includes(type)).map(event => {
  switch (event.type) {
    case 'object-destroyed': return `${event.type} ${event.kindBit}`;
    case 'player-loss-started': return `${event.type} ${event.loss}`;
    case 'transition': return `${event.type} ${event.gap}`;
    default: return event.type;
  }
});

/**
 * Downloads the run's recording on its result page and replays it in Node on the seeded package: Core's comparison is
 * `{ match: true }`, the replay ends with the completion, and the record is the selected slice's configuration and the
 * run's trusted input. Resolves to the replay and attaches its evidence.
 */
async function expectReplayed(page: Page, seeded: SeededPackage, run: RunLog): Promise<JointLoopReplay> {
  const path = test.info().outputPath(`${run.variant}-run-${run.run}-recording.json`);
  await mkdir(dirname(path), { recursive: true });
  await saveRecording(page, path);
  const replay = await replayJointLoop(path, seeded);
  const { recording, comparison, summary } = replay;
  expect(comparison).toEqual({ match: true });
  expect(summary.completed).toBe(true);
  expect(summary.run).toEqual({ rawDifficulty: 19, wingman: run.wingman, seed: run.seed, clockUnitsPerTick: 2 });
  expect(summary.mission).toBe('mission/first-campaign');
  expect(recording.record.ticks).toHaveLength(recording.result.finalTick);
  run.steps.push(`replay: { match: true }, ${summary.events} events, ${summary.checkpoints} checkpoints to tick ${summary.finalTick}`);
  return replay;
}

/** The success run's recording: the trusted input of every step, a pitch, and Core's events in the loop's order. */
function expectSuccessRecording({ recording, replayed }: JointLoopReplay): void {
  const commands = recording.record.ticks.flatMap(({ commands }) => commands.map(command => command.type === 'target' ? `target ${command.operation}` : command.type));
  for (const type of ['speed', 'target friendly', 'target enemy', 'fire', 'toggle-map', 'map-point', 'request-warp', 'communications', 'select-number', 'launch']) {
    expect(commands, `the recording holds ${type}`).toContain(type);
  }
  expect(recording.record.ticks.some(({ axes }) => axes.pitch !== 0), 'the recording holds the pitch').toBe(true);
  const [ahead, byBase] = [JOINT_KINDS.ahead, JOINT_KINDS.byBase].map(kind => `object-destroyed ${kind}`);
  const types = ['object-destroyed', 'map-toggled', 'warp-started', 'warp-completed', 'docking-requested', 'docked', 'departed', 'transition', 'all-clear', 'settlement-started', 'result-latched', 'mission-completed'];
  // The explosions' debris and fragments are destroyed objects too; the loop's are the two craft.
  expect(replayedSteps(replayed.events, types).filter(step => !step.startsWith('object-destroyed') || step === ahead || step === byBase)).toEqual([
    ahead, 'map-toggled', 'warp-started', 'warp-completed', 'docking-requested', 'docked', 'transition G-02/3', 'departed', 'transition G-02/4', byBase,
    'all-clear', 'settlement-started', 'result-latched', 'mission-completed',
  ]);
}

/** The failure run's recording: the destroyed loss and two energy losses with their rescues, then the failure. */
function expectFailureRecording({ replayed }: JointLoopReplay): void {
  expect(replayedSteps(replayed.events, ['player-loss-started', 'player-rescued', 'transition', 'result-latched', 'mission-completed'])).toEqual([
    'player-loss-started destroyed', 'player-rescued', 'transition G-02/5', 'player-loss-started energy', 'player-rescued', 'transition G-02/6',
    'player-loss-started energy', 'result-latched', 'mission-completed',
  ]);
}

/** Writes the case's runs, their steps and replays, as the case's evidence attachment. */
async function attachRuns(page: Page, name: string, runs: readonly RunLog[], replays: readonly JointLoopReplay[]): Promise<void> {
  const path = test.info().outputPath(`${name}-evidence.json`);
  const recordedIn = `Chromium ${page.context().browser()?.version() ?? 'unknown'}`;
  await writeFile(path, JSON.stringify(runs.map((run, index) => ({ ...run, recordedIn, replay: replays[index]?.summary })), null, 1));
  await test.info().attach(name, { contentType: 'application/json', path });
}

/**
 * Restart on the result page: a new introduction, the start page with the last run's wingman preselected. Resolves
 * once the start page shows; the next run's takeoff checks it starts from tick 0.
 */
async function restart(page: Page, wingman: number | null): Promise<void> {
  // The event log outlives a run: cleared here, it holds only the next run's events.
  await clearLog(page);
  await button(page, RESULT_PAGE.restart).click();
  await waitForFrame(page, frame => frame.position === 'intro');
  await expect(placeholder(page)).toHaveAttribute('data-gap', 'G-02/1');
  await endPlaceholder(page, 'G-02/1', 'button');
  expect(await checkedWingman(page), 'The start page preselects the last run\'s wingman').toBe(wingman);
  expect(await missionFrame(page)).toMatchObject({ run: null, tick: null, position: 'config' });
}

/** How a case's runs end: the variant's flight after takeoff, its result page and its recording's checks. */
interface Case {
  readonly variant: JointLoopVariant;
  readonly wingmen: readonly (number | null)[];
  readonly fly: (page: Page, run: RunLog, player: number) => Promise<ShownResult>;
  readonly result: ShownResult;
  readonly recording: (replay: JointLoopReplay) => void;
}

/**
 * Restores the case's variant and flies one run per wingman choice, each from takeoff to its result page, whose values
 * it checks, then replays its recording; Restart leads from one run to the next and the last returns to the main menu.
 */
async function runCase(page: Page, { variant, wingmen, fly, result, recording }: Case): Promise<void> {
  const seeded = await restoreVariant(page, variant, SEEDS[variant]);
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  const runs: RunLog[] = [];
  const replays: JointLoopReplay[] = [];
  for (const [index, wingman] of wingmen.entries()) {
    const run: RunLog = { variant, wingman, seed: SEEDS[variant][index], run: index + 1, steps: [] };
    runs.push(run);
    expect(await fly(page, run, await takeOff(page, run))).toEqual(result);
    run.steps.push(`result page: ${result.outcome}, ${result.reason}, summary ${result.summary}, ${result.rescues} rescues, ${result.kills} kills`);
    replays.push(await expectReplayed(page, seeded, run));
    recording(replays[index]);
    if (index < wingmen.length - 1) {
      await restart(page, wingman);
      run.steps.push(`Restart: G-02/1, the start page with wingman ${wingman ?? 'none'} preselected`);
    }
  }
  await button(page, RESULT_PAGE.return).click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);
  await attachRuns(page, variant, runs, replays);
}

test('success with and without a wingman: takeoff, flight, targets, fire, map and Warp, docking and launch, the all-clear, the result, Restart and replay', async ({ page, audit }) => {
  watchCanaries(audit);
  await runCase(page, {
    variant: 'success', wingmen: [0, null], fly: flySuccess, recording: expectSuccessRecording,
    result: {
      outcome: 'success', reason: 'all-clear', heading: `${RESULT_PAGE.title}: ✓ Success`, outcomeText: '✓ Success',
      reasonText: `${RESULT_PAGE.reasonLabel}: ${RESULT_PAGE.reason['all-clear']}`, summary: 'empty', summaryText: null, rescues: '0 of 2', kills: '2',
    },
  });
});

test('failure without and with a wingman: a destroyed and an energy rescue, the third loss, the result, Restart and replay', async ({ page, audit }) => {
  watchCanaries(audit);
  await runCase(page, {
    variant: 'failure', wingmen: [null, 0], fly: flyFailure, recording: expectFailureRecording,
    result: {
      outcome: 'failure', reason: 'third-loss:energy', heading: `${RESULT_PAGE.title}: ✗ Failure`, outcomeText: '✗ Failure',
      reasonText: `${RESULT_PAGE.reasonLabel}: ${RESULT_PAGE.reason['third-loss'].energy}`, summary: 'failure', summaryText: null, rescues: '2 of 2', kills: '0',
    },
  });
});
