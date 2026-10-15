import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CDPSession, Page } from '@playwright/test';
import { SLICE_GAPS, type SliceGapId } from '../src/ui/mission/slice-gaps-copy.ts';
import { scenarioEntryProfile, scenarioFiles } from '../src/workers/import-scenarios.test-support.ts';
import { DOCKING_BASE_KIND_MASK, DOCKING_COMMAND_CODES, MARKER } from '../src/workers/synthetic-import.test-support.ts';
import { button, filePayloads, importFiles } from './support/app-entry.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import {
  clearLog, eventsOf, loggedEvents, replayedRun, serviceLog, shownBase, watchService, type LoggedEvent, type ShownBase,
} from './support/base-interaction.ts';
import { tabTo } from './support/keyboard-input.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';
import {
  chooseWingman, endPlaceholder, enterMission, expectAdvancingTick, expectStableTick, missionEntry, missionFrame, stopWatchingPositions,
  waitForFrame, watchPositions, type PlaceholderEnd,
} from './support/mission-observations.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';

// P3-10 subtask 23 (docs/plan/p3/10/spec.md, AC-14; 验证策略, 浏览器验证): the communications, docking, base service and
// launch flow in Chrome on the development test entry, which imports the synthetic `mission-docking` disc
// (src/workers/synthetic-import.test-support.ts) through the real module Worker. Every game action is a trusted key in
// the game input zone: `c`, 2 (the base category, whose one base opens its command menu) and 2 (the docking request),
// the base keys and L. The formal communications MFD is not in this build (P3-13), so the menu protocol is checked only
// through the development event log, a test read model, never as a production communications screen. The base page is
// compared with the projection of a Node world replaying the exported recording. Synthesized keys are no evidence of
// system shortcut interception. The network audit runs throughout and the resource balance closes the flow.

test.describe.configure({ timeout: 240_000 });

/** The uint32 seeds of the two runs; the base answers a docking request under any seed (src/workers/mission-scenarios.test.ts). */
const SEEDS = Object.freeze([0x0eed_0001, 0x0eed_0002]);

const zone = (page: Page) => page.getByTestId('game-input-zone');
const status = (page: Page) => page.getByTestId('mission-status');

/** The synthetic disc's file-name marker and its source fingerprint must not leave the browser. */
function watchCanaries(audit: Audit): void {
  audit.canaries({ name: 'file-name', value: MARKER }, { name: 'source-fingerprint', value: scenarioEntryProfile('mission-docking')!.sourceFingerprint });
}

let disc: ReturnType<typeof filePayloads> | undefined;
/** The docking disc's CloneCD files, generated once per worker process. */
const dockingDisc = () => disc ??= scenarioFiles('mission-docking').then(files => filePayloads([...files]));

/** Imports the docking disc through the test entry with `seeds` and returns to the main menu. */
async function importDocking(page: Page, seeds: readonly number[]): Promise<void> {
  await importFiles(page, await dockingDisc(), { worker: 'mission-docking', seeds: seeds.join(',') }, /Mission (?:loads|does not load) into Core/);
  await button(page, 'Return to menu').click();
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
}

/** From the start page, without a wingman, through the departure into running flight with focus on the input zone. */
async function startFlight(page: Page): Promise<void> {
  await chooseWingman(page, null);
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(zone(page)).toBeFocused();
  // The player enters the world in the run's first ticks; commands before that find no player.
  await waitForFrame(page, frame => (frame.tick ?? 0) >= 20);
}

/** Waits until the run is `count` ticks past the tick it shows now: room for anything a key would still cause. */
async function afterTicks(page: Page, count: number): Promise<void> {
  const { tick } = (await missionFrame(page))!;
  await waitForFrame(page, frame => (frame.tick ?? 0) >= tick! + count);
}

/** Polls the event log until `accept` holds for it, and resolves to it. */
async function logUntil(page: Page, accept: (events: readonly LoggedEvent[]) => boolean, timeout = 5_000): Promise<LoggedEvent[]> {
  let events: LoggedEvent[] = [];
  await expect.poll(async () => accept(events = await loggedEvents(page)), { timeout }).toBe(true);
  return events;
}

/** The logged command results of `commandType`. */
const resultsOf = (events: readonly LoggedEvent[], commandType: string) =>
  eventsOf(events, 'command-result').filter(({ text }) => text.includes(`commandType=${commandType} `));

/**
 * Presses `key` once in the input zone and expects exactly one new command result of `commandType` with `outcome`
 * since the log was last cleared, and resolves to the log then.
 */
async function pressOnce(page: Page, key: string, commandType: string, outcome: string): Promise<LoggedEvent[]> {
  const before = resultsOf(await loggedEvents(page), commandType).length;
  await page.keyboard.press(key);
  const events = await logUntil(page, current => resultsOf(current, commandType).length > before);
  // A second submission of the same press would show by now.
  await afterTicks(page, 4);
  const results = resultsOf(await loggedEvents(page), commandType);
  expect(results, `${key}: one ${commandType}`).toHaveLength(before + 1);
  expect(results.at(-1)!.text).toContain(`outcome=${outcome} `);
  return events;
}

/** The communications menu by keys: `c`, 2, 2 opens the menu, chooses the base category and requests docking. */
async function requestDocking(page: Page): Promise<void> {
  await clearLog(page);
  await pressOnce(page, 'c', 'communications', 'accepted');
  expect(eventsOf(await loggedEvents(page), 'left-page-changed').at(-1)!.text).toContain('page=2 ');
  await pressOnce(page, '2', 'select-number', 'accepted');
  expect(eventsOf(await loggedEvents(page), 'left-page-changed').at(-1)!.text).toContain('page=4 ');
  await pressOnce(page, '2', 'select-number', 'accepted');
  const events = await logUntil(page, current => eventsOf(current, 'docking-requested').length === 1 && eventsOf(current, 'command-delivered').length === 1);
  expect(eventsOf(events, 'command-delivered')[0].text).toContain('code=9 ');
  expect(eventsOf(events, 'docking-requested')[0].text).toContain('previousSubState=0 ');
}

/** The note of `id`, with its copy from the one place that holds it, is visible within `scope`. */
async function expectNote(page: Page, scope: string, id: SliceGapId): Promise<void> {
  const note = page.locator(`${scope} .slice-gap[data-gap="${id}"]`);
  await expect(note).toBeVisible();
  await expect(note).toHaveText(`${SLICE_GAPS[id].title} (${id}). ${SLICE_GAPS[id].text}`);
}

/**
 * Waits for the hold's placeholder of `gap` after `event` and its `transition` event, checks its note and that it holds
 * the tick, runs `beforeEnd`, and ends it by `end` into running flight with focus on the input zone; resolves to the
 * held tick.
 */
async function throughHold(page: Page, gap: 'G-02/3' | 'G-02/4', event: 'docked' | 'departed', end: PlaceholderEnd, beforeEnd?: () => Promise<void>): Promise<number> {
  const placeholder = page.getByTestId('mission-placeholder');
  await expect(placeholder).toHaveAttribute('data-gap', gap, { timeout: 30_000 });
  await expect(placeholder).toHaveAttribute('data-transition', /^\d+$/);
  await expect(page.getByTestId('mission-placeholder-sequence')).toHaveCount(0);
  await expectNote(page, '[data-testid="mission-placeholder"]', gap);
  const events = await logUntil(page, current => eventsOf(current, event).length === 1 && eventsOf(current, 'transition').length === 1);
  expect(eventsOf(events, 'transition')[0].text).toContain(`gap=${gap}`);
  // The hold: the run's tick stays put while the placeholder shows.
  const held = await expectStableTick(page, 600);
  expect((await missionFrame(page))!.position).toBe('transition');
  await beforeEnd?.();
  if (end !== 'natural') await expect(button(page, 'Skip')).toBeFocused();
  await endPlaceholder(page, gap, end);
  await stopWatchingPositions(page);
  await expect(zone(page)).toBeFocused();
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(held);
  return held;
}

/** Ends the docking hold's G-02/3 placeholder by `end` onto the base page, watching its service readings from the start. */
async function dock(page: Page, end: PlaceholderEnd): Promise<ShownBase> {
  await watchPositions(page);
  await throughHold(page, 'G-02/3', 'docked', end, () => watchService(page));
  await expect(page.getByTestId('base-page')).toBeVisible();
  return (await shownBase(page))!;
}

/** Launches with L from the base page and ends the G-02/4 placeholder by `end` into flight without the base page. */
async function launch(page: Page, end: PlaceholderEnd): Promise<void> {
  await clearLog(page);
  await watchPositions(page);
  await page.keyboard.press('l');
  await throughHold(page, 'G-02/4', 'departed', end);
  await expect(page.getByTestId('base-page')).toHaveCount(0);
  await expect(page.getByTestId('mission-view')).toContainText('Game view: the flight view, cockpit and HUD are not implemented yet.');
  expect(resultsOf(await loggedEvents(page), 'launch'), 'L submitted once').toHaveLength(1);
}

/** The game view keeps its 4:3 box with the base page, and the input zone fills it. */
async function expectLayout(page: Page): Promise<void> {
  const view = (await page.getByTestId('mission-view').boundingBox())!;
  const area = (await zone(page).boundingBox())!;
  expect(Math.abs(view.width / view.height - 4 / 3)).toBeLessThan(0.01);
  for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(area[side] - view[side])).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('base-page')).toBeVisible();
}

test('docks and launches twice through the input zone, with real service, single key submissions, holds, pause, Tab and the read model', async ({ page, audit }, testInfo) => {
  watchCanaries(audit);
  await importDocking(page, SEEDS);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });
  try {
    // Run 1: docking placeholder ends by itself, launch placeholder by Enter.
    await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'button');
    await startFlight(page);
    await clearLog(page);
    // One missile from the player's mount, so the base has ammunition to restore.
    await pressOnce(page, ' ', 'fire', 'accepted');
    await requestDocking(page);
    const first = await dock(page, 'natural');
    expect(first.cursor).toBe(0);
    expect(first.rows).toHaveLength(11);
    expect(first.rows.filter(({ selected }) => selected).map(({ row }) => row)).toEqual([0]);
    await expectLayout(page);
    await expectNote(page, '[data-testid="base-page"]', 'G-05');

    // Real service: the missile fired before docking comes back and the base marks energy and missiles full.
    await expect.poll(async () => (await shownBase(page))!.flags.energyAndMissilesFull).toBe(true);
    const service = await serviceLog(page);
    expect(service[0], 'The base page opens on the docking tick, before any service').toMatchObject({ missiles: '3', full: 'false' });
    expect(service.at(-1)).toMatchObject({ missiles: '4', full: 'true' });

    // Up, Down and Enter each submit once; the selection follows Core.
    await clearLog(page);
    let events = await pressOnce(page, 'ArrowDown', 'navigate-selection', 'accepted');
    await expect(page.getByTestId('base-page')).toHaveAttribute('data-cursor', '1');
    expect(eventsOf(await loggedEvents(page), 'base-navigated')).toHaveLength(1);
    await pressOnce(page, 'ArrowDown', 'navigate-selection', 'accepted');
    await expect(page.getByTestId('base-page')).toHaveAttribute('data-cursor', '2');
    await pressOnce(page, 'ArrowUp', 'navigate-selection', 'accepted');
    await expect(page.getByTestId('base-page')).toHaveAttribute('data-cursor', '1');
    events = await loggedEvents(page);
    expect(eventsOf(events, 'base-navigated').map(({ text }) => /row=(\d+)/.exec(text)![1])).toEqual(['1', '2', '1']);
    await expect(page.getByTestId('base-last-command')).toHaveText('Last base command: navigate-selection: accepted');
    // Enter held: its first press confirms once; its repeats and keyup submit nothing.
    await page.keyboard.down('Enter');
    for (let repeat = 0; repeat < 3; repeat++) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await logUntil(page, current => eventsOf(current, 'base-confirmed').length > 0);
    await afterTicks(page, 4);
    events = await loggedEvents(page);
    expect(resultsOf(events, 'confirm-selection')).toHaveLength(1);
    expect(eventsOf(events, 'base-confirmed')).toHaveLength(1);
    expect(eventsOf(events, 'base-confirmed')[0].text).toContain('row=1 ');
    await expect(page.getByTestId('base-last-command')).toHaveText('Last base command: confirm-selection: accepted');

    // A refusal is visible: M asks for the strategic map, which this build does not have.
    await pressOnce(page, 'm', 'toggle-map', 'rejected');
    await expect(page.getByTestId('base-last-command')).toHaveText('Last base command: toggle-map: rejected (not-implemented)');
    await expect(page.getByTestId('base-command-error')).toHaveCount(0);

    // Tab leaves the zone: base keys then submit nothing and the page stays.
    await clearLog(page);
    await page.keyboard.press('Tab');
    expect(await zone(page).evaluate(element => element.contains(document.activeElement)), 'Tab left the zone').toBe(false);
    for (const key of ['ArrowDown', 'ArrowUp', 'l', 'm', 'c']) await page.keyboard.press(key);
    await afterTicks(page, 8);
    expect(eventsOf(await loggedEvents(page), 'command-result'), 'Keys outside the zone submitted commands').toEqual([]);
    await expect(page.getByTestId('base-page')).toHaveAttribute('data-cursor', '1');
    await tabTo(page, zone(page), 'Shift+Tab');

    // Pause: no tick, no key acts while paused, and resuming submits no stale key.
    await page.keyboard.press('p');
    await expect(status(page)).toHaveAttribute('data-phase', 'paused');
    await expect(status(page)).toHaveAttribute('data-pause', 'user');
    const paused = await expectStableTick(page, 600);
    await zone(page).focus();
    await clearLog(page);
    for (const key of ['ArrowDown', 'Enter', 'l']) await page.keyboard.press(key);
    expect(await expectStableTick(page, 400)).toBe(paused);

    // The read model: the page at the paused tick equals the base view of a Node world replaying the run's recording.
    const shown = (await shownBase(page))!;
    const recordingPath = testInfo.outputPath('docking-recording.json');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('dev-recording-export').click()]);
    await download.saveAs(recordingPath);
    const replayed = await replayedRun(recordingPath);
    expect(replayed.finalTick).toBe(paused);
    // The menu protocol in the test read model: c opens the categories (the player's kind, the base kind, the exit), 2
    // opens the one base's gated command menu (status, docking, exit), 2 requests docking, closing the menu.
    const [opened, category, requested] = replayed.menuSteps;
    expect(replayed.menuSteps).toHaveLength(3);
    expect(opened.menu).toMatchObject({ level: 2, menu: { table: 'categories' }, partnerEntityId: null });
    expect(opened.menu!.options.map(({ value }) => (value.type === 'category' ? value.kindMask : value.type))).toEqual([1, DOCKING_BASE_KIND_MASK, 'exit']);
    expect(category.menu).toMatchObject({ level: 4, menu: { table: 'gated' } });
    expect(category.menu!.options.map(({ value }) => (value.type === 'command' ? value.code : value.type)))
      .toEqual([DOCKING_COMMAND_CODES.status, DOCKING_COMMAND_CODES.docking, 'exit']);
    const baseId = category.menu!.partnerEntityId;
    expect(requested.menu).toBeNull();
    expect(requested.docking).toEqual({ subState: 3, dockingObject: baseId, docked: false });
    expect(replayed.events.find(event => event.type === 'docked')).toMatchObject({ baseEntityId: baseId });
    expect(replayed.events.filter(({ type }) => type === 'docked')).toHaveLength(1);
    const view = replayed.view!;
    expect(shown.cursor).toBe(view.cursor);
    expect(shown.rows).toEqual(view.rows.map(({ row, record, selector, state, inService, selected }) => ({ row, record, selector, state, inService, selected })));
    expect(shown.flags).toEqual(view.flags);
    expect(shown.readings).toEqual({
      energy: `${view.energy!.current} / ${view.energy!.maximum}`, hull: `${view.hull!.current} / ${view.hull!.maximum}`, missiles: String(view.missiles),
    });

    await zone(page).focus();
    await page.keyboard.press('p');
    await expect(status(page)).toHaveAttribute('data-phase', 'running');
    expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(paused);
    expect(eventsOf(await loggedEvents(page), 'command-result'), 'A key pressed while paused acted after resume').toEqual([]);
    await expect(page.getByTestId('base-page')).toHaveAttribute('data-cursor', '1');

    // A submission failure is visible on the base page: a burst of 257 Down presses in one task overflows the run's
    // command queue through the input zone (the queue-full technique of keyboard-input.development.spec.ts). Focus stays
    // in the zone and the run keeps running.
    await page.evaluate(() => {
      const target = document.activeElement;
      if (!(target instanceof HTMLElement) || target.dataset.testid !== 'game-input-zone') throw new Error('The game input zone is not focused');
      for (let index = 0; index < 257; index += 1) {
        for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, { code: 'ArrowDown', key: 'ArrowDown', bubbles: true, cancelable: true }));
      }
    });
    const failure = page.getByTestId('base-command-error');
    await expect(failure).toBeVisible();
    await expect(failure).toHaveAttribute('role', 'alert');
    await expect(failure).toContainText('command-queue-full');
    await expect(zone(page)).toBeFocused();
    await expect(status(page)).toHaveAttribute('data-phase', 'running');
    // The queued presses still move the selection to the last row, and no further.
    await expect(page.getByTestId('base-page')).toHaveAttribute('data-cursor', '10');

    await launch(page, 'Enter');

    // Run 2: restart; docking placeholder ends by its skip key, launch placeholder by itself.
    await button(page, 'Mission menu').click();
    await button(page, 'Restart mission').click();
    await waitForFrame(page, frame => frame.position === 'intro');
    await endPlaceholder(page, 'G-02/1', 'button');
    await startFlight(page);
    await requestDocking(page);
    const second = await dock(page, 'Escape');
    expect(second.cursor).toBe(0);
    await serviceLog(page);
    await expectLayout(page);
    await launch(page, 'natural');

    await button(page, 'Mission menu').click();
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeFocused();
    expect(await missionFrame(page)).toBeNull();
    // Only synthetic content: the page shows no marker text of the synthetic disc.
    expect(await page.locator('body').innerText()).not.toContain(MARKER);
    await balance.check('after two dockings and launches');
  } finally {
    await balance.attach();
  }
});

/** What the native test reads of the page: visibility, the run, its pause, the placeholder and the base page. */
function nativeState() {
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const status = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const placeholder = document.querySelector<HTMLElement>('[data-testid="mission-placeholder"]');
  const base = document.querySelector<HTMLElement>('[data-testid="base-page"]');
  const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
  return {
    visibility: document.visibilityState,
    position: screen?.dataset.position ?? null,
    tick: number(screen?.dataset.tick),
    phase: status?.dataset.phase ?? null,
    pause: status?.dataset.pause ?? null,
    placeholder: placeholder ? { gap: placeholder.dataset.gap ?? null, status: placeholder.dataset.status ?? null } : null,
    cursor: number(base?.dataset.cursor),
    navigated: document.querySelectorAll('[data-testid="dev-log"] li[data-type="base-navigated"]').length,
    zoneFocused: document.activeElement === document.querySelector('[data-testid="game-input-zone"]'),
  };
}

/** Windows virtual key codes of the keys the native test presses. */
const KEYS = Object.freeze({ c: ['KeyC', 'c', 67], 2: ['Digit2', '2', 50], p: ['KeyP', 'p', 80], down: ['ArrowDown', 'ArrowDown', 40] } as const);

async function nativeKey(target: NativeTarget, type: 'keyDown' | 'keyUp', key: keyof typeof KEYS): Promise<void> {
  const [code, name, windowsVirtualKeyCode] = KEYS[key];
  await target.command('Input.dispatchKeyEvent', { type, code, key: name, windowsVirtualKeyCode });
}

const tap = async (target: NativeTarget, key: keyof typeof KEYS): Promise<void> => {
  await nativeKey(target, 'keyDown', key);
  await nativeKey(target, 'keyUp', key);
};

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

test('a real hidden page holds the docking placeholder and the base, needs an explicit resume and leaves no held base key', async ({ audit, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Real visibility requires a development origin');
  watchCanaries(audit);
  const directory = testInfo.outputPath('native-docking');
  await mkdir(directory, { recursive: true });
  const paths = await Promise.all((await dockingDisc()).map(async ({ name, buffer }) => {
    const path = join(directory, name);
    await writeFile(path, buffer);
    return path;
  }));
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
    const url = new URL(`/e2e/entries/app.html?worker=mission-docking&seeds=${SEEDS[0]}`, baseURL);
    await native.command('Page.navigate', { url: url.href });
    await cdp.send('Target.activateTarget', { targetId: appId });
    const show = async (targetId: string) => { await cdp.send('Target.activateTarget', { targetId }); };
    const state = () => native.evaluate(nativeState);
    await until(
      () => native.evaluate(() => document.querySelector('[data-testid="original-data-status"]')?.textContent ?? ''),
      text => text === 'Original game data: None in this browser.',
      'Application load',
    );
    await native.press('Import original game data');
    await until(() => native.evaluate(() => document.querySelector('#import-files') !== null), Boolean, 'Import page');
    await native.setInputFiles('#import-files', paths);
    await native.press('Start import');
    await until(
      () => native.evaluate(() => document.querySelector('[data-testid="import-statuses"]')?.textContent ?? ''),
      text => text.includes('Mission loads into Core'),
      'Synthetic docking mission import',
      60_000,
    );
    await native.press('Return to menu');
    await until(
      () => native.evaluate(() => document.querySelector('[aria-describedby="mission-entry-description"]')?.getAttribute('data-eligibility')),
      eligibility => eligibility === 'eligible',
      'Startable docking mission',
    );
    await native.press('Start mission');
    await until(state, current => current.position === 'intro', 'Introduction placeholder');
    await native.press('Skip');
    await until(state, current => current.position === 'config', 'Mission start page');
    await native.click('[data-testid="mission-wingmen"] input[data-wingman="none"]');
    await native.press('Start');
    await until(state, current => current.position === 'departure', 'Departure placeholder');
    await native.press('Skip');
    await until(state, current => current.position === 'flight' && current.phase === 'running' && (current.tick ?? 0) >= 20 && current.zoneFocused, 'Running flight');
    for (const key of ['c', 2, 2] as const) await tap(native, key);

    // Hidden during the docking hold: the placeholder waits and no tick passes.
    const holding = await until(state, current => current.placeholder?.gap === 'G-02/3' && current.placeholder.status === 'timing', 'Docking placeholder', 30_000);
    await show(backgroundId);
    const waiting = await until(state, current => current.visibility === 'hidden' && current.placeholder?.status === 'waiting', 'Hidden docking placeholder');
    expect(waiting.tick).toBe(holding.tick);
    await wait(3_500);
    expect(await state()).toMatchObject({ visibility: 'hidden', position: 'transition', tick: holding.tick, placeholder: { gap: 'G-02/3', status: 'waiting' } });
    await show(appId);
    await until(state, current => current.visibility === 'visible' && current.placeholder?.status === 'timing', 'Visible docking placeholder');
    await native.press('Skip');
    // A hold the page was hidden in ends paused: the base shows, and only an explicit resume runs it.
    const based = await until(state, current => current.position === 'flight' && current.cursor !== null, 'Base page after the hold');
    expect(based).toMatchObject({ phase: 'paused', tick: holding.tick, cursor: 0 });
    await wait(400);
    expect(await state()).toMatchObject({ phase: 'paused', tick: holding.tick });
    await native.click('[data-testid="game-input-zone"]');
    await tap(native, 'p');
    await until(state, current => current.phase === 'running' && (current.tick ?? 0) > holding.tick!, 'Explicit resume');

    // ArrowDown held at the base, then the page hidden: the run pauses with the key cleared; after visible and resume no
    // stale repeat moves the selection.
    await nativeKey(native, 'keyDown', 'down');
    await until(state, current => (current.cursor ?? 0) >= 1, 'Held Down moved the selection');
    await show(backgroundId);
    const hidden = await until(state, current => current.visibility === 'hidden' && current.phase === 'paused' && current.pause === 'hidden', 'Hidden base');
    await wait(400);
    expect(await state()).toMatchObject({ phase: 'paused', tick: hidden.tick, cursor: hidden.cursor });
    await show(appId);
    await until(state, current => current.visibility === 'visible', 'Visible base');
    await wait(400);
    expect(await state()).toMatchObject({ phase: 'paused', pause: 'hidden', tick: hidden.tick, cursor: hidden.cursor });
    await tap(native, 'p');
    const resumed = await until(state, current => current.phase === 'running' && (current.tick ?? 0) > hidden.tick! + 20, 'Resume after hidden');
    expect(resumed).toMatchObject({ cursor: hidden.cursor, navigated: hidden.navigated });
    await nativeKey(native, 'keyUp', 'down');
    await wait(300);
    expect(await state()).toMatchObject({ cursor: hidden.cursor, navigated: hidden.navigated });
    expect(native.errors, 'Native application errors').toEqual([]);
    await testInfo.attach('native-visibility', {
      contentType: 'application/json',
      body: JSON.stringify({ browser: browser.version(), origin: baseURL, holding, waiting, based, hidden, resumed, allowed: native.allowed }),
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
