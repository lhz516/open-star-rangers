import { mkdir, readdir } from 'node:fs/promises';
import type { CDPSession, Page, TestInfo } from '@playwright/test';
import { RESULT_PAGE } from '../src/ui/mission/slice-gaps-copy.ts';
import { button } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { expect, test, type Audit } from './support/audited-test.ts';
import { installBrowserProbes } from './support/browser-probes.ts';
import { audioReading, closedContexts } from './support/flight-audio.ts';
import { jointLoopPackage, type JointLoopVariant } from './support/joint-loop.ts';
import {
  Checkpoints, expectClearedAxis, expectNoCatchUp, flyFailure, flySuccess, frameMark, NativeBalance, nativeKey, nativePress, OWNER, ownerProbe, PROFILE,
  restoreJointVariant, stopWatchingResume, watchResume, type OwnerReading,
} from './support/joint-lifecycle.ts';
import { exportedTickInputs, readExportedTickInputs } from './support/keyboard-input.ts';
import { readBridgeView } from './support/map-warp.ts';
import type { ShownResult } from './support/mission-result.ts';
import {
  checkedWingman, chooseWingman, devState, endPlaceholder, enterMission, expectAdvancingTick, expectStableTick, missionEntry, missionFrame, waitForFrame,
} from './support/mission-observations.ts';
import { nativeBrowser, NativeTarget, until } from './support/native-lifecycle.ts';
import { seedRecords, storeSeed } from './support/production-cache.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';

// P3-15 subtask 03 (docs/plan/p3/15/spec.md, S-03 and 行为与边界 "暂停、地图、隐藏/返回、重试、返回菜单与卸载"; AC-03,
// AC-04): the joint loop's lifecycle in Chrome on the development test entry, with the joint loop's synthetic variant
// packages (e2e/support/joint-loop.ts) restored through the main menu and driven only by trusted input on the page's
// own controls, the game input zone and the map cursor. The development panel is only read: its event log, its state
// and the recording it exports. Each page case closes with the resource balance against the menu's baseline, and every
// owner reading on the way checks the owner's listeners, frames, timers, leave guard, canvas and audio at its position
// and that no two game loops ran at once since the previous reading (e2e/support/joint-lifecycle.ts). The hidden case
// switches real tabs of a headed Chrome (e2e/support/native-lifecycle.ts); nothing emulates visibility. The network
// audit runs throughout.

test.describe.configure({ timeout: 600_000 });

/** The uint32 seeds of each case's runs: the first run's and the restarted one's. */
const SEEDS = Object.freeze({ success: [0x0eed_1531, 0x0eed_1532], failure: [0x0eed_1541, 0x0eed_1542], native: [0x0eed_1551] } as const);

const zone = (page: Page) => page.getByTestId('game-input-zone');
const status = (page: Page) => page.getByTestId('mission-status');
const audio = (page: Page) => page.evaluate(audioReading);

/** The test entry's source fingerprint must not leave the browser. */
const watchCanaries = (audit: Audit): void => { audit.canaries({ name: 'source-fingerprint', value: PROFILE.sourceFingerprint }); };

/**
 * From the start page: `wingman` chosen, Start, the departure over run `run` at tick 0 (its timer and the run's leave
 * guard, no frame), its Skip, and the running run with focus in the input zone, one loop and its sound.
 */
async function takeOff(page: Page, points: Checkpoints, label: string, wingman: number | null, run: number, seed: number): Promise<OwnerReading> {
  await chooseWingman(page, wingman);
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run === run && frame.tick === 0);
  await points.check(`${label}: departure`, OWNER.departure);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(zone(page)).toBeFocused();
  await expect.poll(async () => (await audio(page)).live.length, { message: `${label}: the run sounds` }).toBeGreaterThan(0);
  const flying = await points.check(`${label}: flight`, OWNER.running);
  expect(flying).toMatchObject({ run, phase: 'running', audio: { contexts: ['running:'] } });
  // A new run from its start, with its own seed.
  const state = await devState(page);
  expect(state).toMatchObject({ run, seed, wingman });
  expect(state.tick).toBeLessThan(300);
  await zone(page).focus();
  return flying;
}

/** The result page: no frame, timer or voice; the owner keeps its listeners, its context and the run's leave guard. */
async function expectResult(page: Page, points: Checkpoints, label: string, shown: ShownResult, expected: Partial<ShownResult>): Promise<OwnerReading> {
  expect(shown).toMatchObject(expected);
  const reading = await points.check(`${label}: result page`, OWNER.result);
  expect(reading.position).toBe('result');
  expect(reading.audio, `${label}: no voice on the result page`).toMatchObject({ contexts: [expect.stringMatching(/^(?:running|suspended):$/)], live: [], routed: 0 });
  await expectStableTick(page, 400);
  return reading;
}

/**
 * Restart on the result page: the same owner shows a new introduction with its own session listeners, no run, its one
 * context still open with no voice, and the start page preselects the last run's wingman. Nothing of the ended run acts
 * on from the result page until the next Start: no frame is requested, no sound source starts, and no timer is scheduled
 * after the introduction's own, over a 1.5 s window on the start page.
 */
async function restart(page: Page, points: Checkpoints, label: string, intro: OwnerReading, result: OwnerReading, wingman: number | null): Promise<void> {
  await button(page, RESULT_PAGE.restart).click();
  await waitForFrame(page, frame => frame.owner === intro.owner && frame.position === 'intro' && frame.run === null);
  const restarted = await points.check(`${label}: Restart, introduction`, OWNER.intro);
  expect(restarted.sessionIdentity, `${label}: the owner's own session listeners`).toEqual(intro.sessionIdentity);
  expect(restarted.audio, `${label}: the ended run's voices`).toMatchObject({ contexts: result.audio.contexts, started: result.audio.started, live: [], routed: 0 });
  await endPlaceholder(page, 'G-02/1', 'button');
  const config = await points.check(`${label}: Restart, start page`, OWNER.config, 1_500);
  expect(config.audio.started, `${label}: no sound source started since the result page`).toBe(result.audio.started);
  expect(config.scheduled, `${label}: no timer scheduled since the introduction's`).toBe(restarted.scheduled);
  expect(await checkedWingman(page), `${label}: the start page preselects the last run's wingman`).toBe(wingman);
}

/** Return to main menu from the result page: the mission screen unmounts and the document is back at its baseline. */
async function returnToMenu(page: Page, points: Checkpoints, balance: ResourceBalance, label: string): Promise<void> {
  await button(page, RESULT_PAGE.return).click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  await points.menu(`${label}: main menu`);
  await balance.check(`${label}: Return to main menu from the result page`);
  expect(await audio(page), `${label}: the owner's one context closed`).toMatchObject({ contexts: closedContexts(1), live: [], routed: 0 });
}

/** Restores `variant`, takes the menu's baseline and enters the mission: its introduction and start page. */
async function openVariant(page: Page, variant: JointLoopVariant, testInfo: TestInfo) {
  await page.addInitScript(installAudioProbe);
  await restoreJointVariant(page, variant, SEEDS[variant]);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo);
  const points = new Checkpoints({ owner: duration => page.evaluate(ownerProbe, duration), mark: () => page.evaluate(frameMark) });
  return { balance, points };
}

test('success: pause and continue, the map keeps ticking, and Restart and Return on the result page release to the menu baseline', async ({ page, audit }, testInfo) => {
  watchCanaries(audit);
  const { balance, points } = await openVariant(page, 'success', testInfo);
  try {
    await enterMission(page);
    const intro = await points.check('success: introduction', OWNER.intro);
    expect(intro.audio, 'no context before a Start').toMatchObject({ contexts: [], started: 0 });
    await endPlaceholder(page, 'G-02/1', 'button');
    await points.check('success: start page', OWNER.config);
    await takeOff(page, points, 'success run 1', null, 1, SEEDS.success[0]);

    let pressed = 0;
    let pausedTick = 0;
    const result = await flySuccess(page, {
      // With ] held, p in the input zone pauses: the tick stops, nothing is requested, focus stays in the zone, and the
      // held key is cleared. A new p continues the same run without catching up; ] stays down until after it.
      pitchHeld: async () => {
        pressed = (await missionFrame(page))!.tick! - 8;
        await page.keyboard.press('p');
        await expect(status(page)).toHaveAttribute('data-phase', 'paused');
        await expect(status(page)).toHaveAttribute('data-pause', 'user');
        await expect(zone(page)).toBeFocused();
        await expect.poll(async () => (await audio(page)).contexts, { message: 'paused: the context suspended' }).toEqual(['suspended:']);
        const paused = await points.check('success run 1: paused', OWNER.paused);
        pausedTick = await expectStableTick(page, 1_500);
        expect(pausedTick).toBe(paused.tick);
        await page.evaluate(watchResume, 'keydown' as const);
        await page.keyboard.press('p');
        await waitForFrame(page, frame => (frame.tick ?? 0) >= pausedTick + 12);
        expectNoCatchUp(await page.evaluate(stopWatchingResume), pausedTick, 'success run 1: continue');
        expect(await points.check('success run 1: continued', OWNER.running)).toMatchObject({ run: 1, phase: 'running' });
      },
      // The open map is not a pause: the same loop runs on, the tick advances and the locked cursor is live.
      mapOpen: async view => {
        expect(view).toMatchObject({ phase: 'running', context: 'map' });
        const map = await points.check('success run 1: map open', OWNER.running);
        expect(map).toMatchObject({ phase: 'running', pointerLocked: true });
        const { from, to } = await expectAdvancingTick(page, 800);
        expect(to - from, 'the map ticks at the run\'s rate').toBeGreaterThanOrEqual(16);
        expect((await page.evaluate(readBridgeView))?.context).toBe('map');
      },
      hold: async () => { await points.check('success run 1: docking hold', OWNER.hold); },
    });
    const ended = await expectResult(page, points, 'success run 1', result, { outcome: 'success', reason: 'all-clear', kills: '2' });
    // The recording: ] steered until the pause and not after it, though it went up only after the continue.
    const ticks = await exportedTickInputs(page, testInfo.outputPath('success-run-1-recording.json'));
    expectClearedAxis(ticks, 'pitch', pressed, pausedTick, 'success run 1: pause');

    await restart(page, points, 'success', intro, ended, null);
    await takeOff(page, points, 'success run 2', 0, 2, SEEDS.success[1]);
    await expectResult(page, points, 'success run 2', await flySuccess(page), { outcome: 'success', reason: 'all-clear', kills: '2' });
    await returnToMenu(page, points, balance, 'success');
  } finally {
    await balance.attach();
    await points.attach(testInfo, 'joint-lifecycle-success');
  }
});

test('failure: the rescue holds, and Restart and Return on the result page release to the menu baseline', async ({ page, audit }, testInfo) => {
  watchCanaries(audit);
  const { balance, points } = await openVariant(page, 'failure', testInfo);
  try {
    await enterMission(page);
    const intro = await points.check('failure: introduction', OWNER.intro);
    expect(intro.audio, 'no context before a Start').toMatchObject({ contexts: [], started: 0 });
    await endPlaceholder(page, 'G-02/1', 'button');
    await points.check('failure: start page', OWNER.config);
    await takeOff(page, points, 'failure run 1', 0, 1, SEEDS.failure[0]);
    // A running hold's voices are not checked: the rescue's one-shot sound started in its tick plays on (P3-14 D2-13).
    const hold = async () => { await points.check('failure run 1: rescue hold', OWNER.hold); };
    const failure = { outcome: 'failure', reason: 'third-loss:energy', rescues: '2 of 2', kills: '0' } as const;
    const ended = await expectResult(page, points, 'failure run 1', await flyFailure(page, hold), failure);

    await restart(page, points, 'failure', intro, ended, 0);
    await takeOff(page, points, 'failure run 2', null, 2, SEEDS.failure[1]);
    await expectResult(page, points, 'failure run 2', await flyFailure(page), failure);
    await returnToMenu(page, points, balance, 'failure');
  } finally {
    await balance.attach();
    await points.attach(testInfo, 'joint-lifecycle-failure');
  }
});

/** Page function: the native case's observations of the page, the run and the bridge's map. */
function nativeState() {
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const status = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
  return {
    visibility: document.visibilityState,
    visibilityEvents: [...window.osrAudioProbe.visibility],
    position: screen?.dataset.position ?? null,
    run: number(screen?.dataset.run),
    tick: number(screen?.dataset.tick),
    phase: status?.dataset.phase ?? null,
    pause: status?.dataset.pause ?? null,
    zoneFocused: document.activeElement === document.querySelector('[data-testid="game-input-zone"]'),
    locked: document.pointerLockElement !== null,
    inputStatus: document.querySelector('[data-testid="input-status"]')?.textContent ?? '',
  };
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

test('real tab hiding in flight and in the open map pauses the run and clears held input; only an explicit resume continues, without catching up', async ({ audit, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('Real visibility requires a development origin');
  watchCanaries(audit);
  const downloads = testInfo.outputPath('downloads');
  await mkdir(downloads, { recursive: true });
  const browser = await nativeBrowser();
  let root: CDPSession | undefined;
  let contextId: string | undefined;
  let app: NativeTarget | undefined;
  let points: Checkpoints | undefined;
  let balance: NativeBalance | undefined;
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
    await native.command('Page.addScriptToEvaluateOnNewDocument', { source: `(${installBrowserProbes.toString()})();(${installAudioProbe.toString()})();` });
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, browserContextId: contextId });
    const url = new URL(`/e2e/entries/app.html?worker=mission-startable&seeds=${SEEDS.native[0]}`, baseURL);
    await native.command('Page.navigate', { url: url.href });
    const show = async (targetId: string) => { await cdp.send('Target.activateTarget', { targetId }); };
    await show(appId);
    const state = () => native.evaluate(nativeState);
    const bridge = async () => (await native.evaluate(readBridgeView))!;
    const dataStatus = () => native.evaluate(() => document.querySelector('[data-testid="original-data-status"]')?.textContent ?? '');
    /** Lets the visible page run three real animation frames, then 400 ms more. */
    const frames = async () => {
      await native.evaluate(async () => { for (let index = 0; index < 3; index++) await new Promise(resolve => requestAnimationFrame(resolve)); });
      await wait(400);
    };
    await until(dataStatus, text => text === 'Original game data: None in this browser.', 'Application load');
    const { records } = await seedRecords(await jointLoopPackage('success'), PROFILE);
    await native.evaluate(storeSeed, records);
    await native.command('Page.reload');
    await until(dataStatus, text => text.includes('not yet verified'), 'Saved package offered', 10_000);
    await native.press('Open saved resources');
    await until(
      () => native.evaluate(() => document.querySelector('[aria-describedby="mission-entry-description"]')?.getAttribute('data-eligibility')),
      eligibility => eligibility === 'eligible', 'Restored joint loop mission', 30_000,
    );
    balance = await NativeBalance.start(native);
    points = new Checkpoints({ owner: duration => native.evaluate(ownerProbe, duration), mark: () => native.evaluate(frameMark) });
    await native.press('Start mission');
    await until(state, current => current.position === 'intro', 'Introduction placeholder');
    await native.press('Skip');
    await until(state, current => current.position === 'config', 'Mission start page');
    await native.click('[data-testid="mission-wingmen"] input[data-wingman="none"]');
    await native.press('Start');
    await until(state, current => current.position === 'departure', 'Departure placeholder');
    await native.press('Skip');
    await until(state, current => current.position === 'flight' && current.phase === 'running', 'Running flight');
    await native.click('[data-testid="game-input-zone"]');
    await until(state, current => current.zoneFocused, 'Focus in the input zone');
    await points.check('native: flight', OWNER.running);

    // Hidden in flight with ] held: the run pauses (hidden), no tick passes and nothing sounds; visible again it stays
    // paused until an explicit p in the still focused input zone, which does not catch up, and ] is no longer held
    // though its key-up comes later. Resuming by p rather than the Resume button keeps focus in the zone, so no focusout
    // clears the key instead.
    const pressed = (await state()).tick!;
    await nativeKey(native, 'keyDown', ']');
    await until(state, current => (current.tick ?? 0) >= pressed + 8, '] held for 8 ticks');
    await show(backgroundId);
    const hidden = await until(state, current => current.visibility === 'hidden' && current.phase === 'paused' && current.pause === 'hidden', 'Hidden flight paused');
    // A hidden page throttles its timers, so the hidden window is timed here, not in the page.
    await points.mark('native: flight hidden from');
    await wait(1_500);
    const hiddenFlight = await points.check('native: flight hidden', OWNER.paused, 0);
    expect(hiddenFlight).toMatchObject({ visibility: 'hidden', tick: hidden.tick, run: 1, audio: { live: [], routed: 0 } });
    await show(appId);
    await until(state, current => current.visibility === 'visible', 'Visible flight');
    await frames();
    expect(await points.check('native: flight visible again', OWNER.paused)).toMatchObject({ visibility: 'visible', phase: 'paused', pause: 'hidden', tick: hidden.tick });
    expect((await state()).zoneFocused, 'focus stayed in the input zone').toBe(true);
    await native.evaluate(watchResume, 'keydown');
    await nativePress(native, 'p');
    await until(state, current => current.phase === 'running' && (current.tick ?? 0) >= hidden.tick! + 12, 'Explicit resume in flight');
    expectNoCatchUp(await native.evaluate(stopWatchingResume), hidden.tick!, 'native: flight resume');
    expect((await state()).zoneFocused, 'focus stayed in the input zone').toBe(true);
    await nativeKey(native, 'keyUp', ']');

    // The open map ticks on; hidden, it pauses with the map still open and the Pointer Lock released; visible again
    // it stays paused, open and unlocked until an explicit p, after which the map ticks on without catching up. No
    // held key acts in the map (its axes stay 0 and fire is flight's), so held input is checked in flight above.
    await nativePress(native, 'm');
    await until(bridge, view => view.context === 'map' && view.map?.state === 'open', 'Open map');
    // m's activation locks the pointer at once, or the map asks for a click, which only locks (as openLockedMap).
    const lockPrompt = await until(state, current => current.locked || current.inputStatus.includes('Click the map'), 'Lock or its prompt');
    if (!lockPrompt.locked) await native.click('[data-testid="game-input-zone"]');
    const mapped = await until(state, current => current.locked, 'Locked map');
    await until(state, current => (current.tick ?? 0) >= mapped.tick! + 16 && current.phase === 'running', 'The map ticks on');
    expect(await points.check('native: map', OWNER.running)).toMatchObject({ phase: 'running', pointerLocked: true });
    await show(backgroundId);
    const hiddenMap = await until(state, current => current.visibility === 'hidden' && current.phase === 'paused' && current.pause === 'hidden', 'Hidden map paused');
    await points.mark('native: map hidden from');
    await wait(1_500);
    expect(await points.check('native: map hidden', OWNER.paused, 0)).toMatchObject({ visibility: 'hidden', tick: hiddenMap.tick, pointerLocked: false });
    expect(await bridge()).toMatchObject({ context: 'map', map: { state: 'open' } });
    await show(appId);
    await until(state, current => current.visibility === 'visible', 'Visible map');
    await frames();
    expect(await points.check('native: map visible again', OWNER.paused))
      .toMatchObject({ visibility: 'visible', phase: 'paused', pause: 'hidden', tick: hiddenMap.tick, pointerLocked: false });
    expect(await bridge()).toMatchObject({ context: 'map', map: { state: 'open' } });
    await native.evaluate(watchResume, 'keydown');
    await nativePress(native, 'p');
    await until(state, current => current.phase === 'running' && (current.tick ?? 0) >= hiddenMap.tick! + 12, 'Explicit resume in the map');
    expectNoCatchUp(await native.evaluate(stopWatchingResume), hiddenMap.tick!, 'native: map resume');
    expect(await bridge()).toMatchObject({ phase: 'running', context: 'map', map: { state: 'open' } });
    const resumed = await points.check('native: map resumed', OWNER.running);
    expect(resumed.visibility).toBe('visible');

    // The resume's key press may take the Pointer Lock again; m closes the map, which ends it, so a click reaches the panel.
    await nativePress(native, 'm');
    await until(async () => ({ view: await bridge(), locked: (await state()).locked }), ({ view, locked }) => view.context === 'flight' && !locked, 'Closed map');

    // The recording: ] steered until the hide and not after it.
    await native.press('Export recording');
    const [file] = await until(async () => (await readdir(downloads)).filter(name => name.endsWith('.json')), names => names.length > 0, 'Recording export', 15_000);
    const ticks = await readExportedTickInputs(testInfo.outputPath('downloads', file));
    expectClearedAxis(ticks, 'pitch', pressed, hidden.tick!, 'native: hidden flight');
    const { visibilityEvents } = await state();
    expect(visibilityEvents.slice(-4), 'two native hide-show pairs').toEqual(['hidden', 'visible', 'hidden', 'visible']);

    // Leaving releases the owner: the mission screen unmounts and the document is back at its baseline.
    await native.press('Mission menu');
    await native.press('Return to main menu');
    await until(state, current => current.position === null, 'Main menu');
    await points.menu('native: main menu');
    await balance.check('native: Return to main menu from the mission menu');
    expect(native.errors, 'Native application errors').toEqual([]);
    await testInfo.attach('native-visibility', {
      contentType: 'application/json',
      body: JSON.stringify({ browser: browser.version(), origin: baseURL, pressed, hidden, hiddenMap, visibilityEvents, allowed: native.allowed }),
    });
    for (const targetId of [backgroundId, appId]) {
      await audit.close(targetId);
      audited.splice(audited.indexOf(targetId), 1);
    }
  } finally {
    await points?.attach(testInfo, 'joint-lifecycle-native');
    if (balance) await testInfo.attach('native-resource-balance', { contentType: 'application/json', body: JSON.stringify({ baseline: balance.baseline, reports: balance.reports }) });
    for (const targetId of audited) await audit.close(targetId).catch(() => undefined);
    app?.dispose();
    try {
      if (root && contextId) await root.send('Target.disposeBrowserContext', { browserContextId: contextId });
    } finally {
      await browser.close();
    }
  }
});
