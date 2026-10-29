import { audioSources, installAudioProbe, withAudioTargets } from './support/audio-playback.ts';
import { expect, test } from './support/audited-test.ts';
import {
  audible, captureOutput, FLIGHT_SEEDS, flyWith, missionFilePaths, pressKey, rms, scriptedClick, soundView, steadyCapture, untilSound,
  type SoundView,
} from './support/flight-audio.ts';
import { openKeyboardMenu } from './support/keyboard-input.ts';
import { expectAdvancingTick } from './support/mission-observations.ts';
import { until, type NativeTarget } from './support/native-lifecycle.ts';

// P3-14 subtask 22 (docs/plan/p3/14/spec.md, 模式与生命周期 and 声音状态与开发诊断; AC-11, AC-12): the flight sound's
// activation, its status and the enable-sound control, `p`, the menu and focus, and the silent continuation without
// Web Audio, in development builds. The locked cases own a Chrome whose autoplay policy needs a user activation, drive
// it by raw CDP (whose evaluation grants none) and click by script until a trusted CDP mouse or key input is the step
// under test (support/flight-audio.ts); `audio=unavailable` is the test entry's capability without Web Audio. The
// network audit observes every page.

test.describe.configure({ timeout: 240_000 });

const ENTRY = `/e2e/entries/app.html?worker=mission-startable&seeds=${FLIGHT_SEEDS.join(',')}`;

/** Imports the package and starts a run without a wingman by untrusted clicks only, and waits until it flies. */
async function lockedFlight(app: NativeTarget, paths: readonly string[]): Promise<SoundView> {
  const text = (selector: string) => app.evaluate(query => document.querySelector(query)?.textContent ?? '', selector);
  await until(() => text('[data-testid="original-data-status"]'), value => value === 'Original game data: None in this browser.', 'Application load');
  await scriptedClick(app, 'Import original game data');
  await until(() => app.evaluate(() => document.querySelector('#import-files') !== null), Boolean, 'Import page');
  await app.setInputFiles('#import-files', paths);
  await scriptedClick(app, 'Start import');
  await until(() => text('[data-testid="import-statuses"]'), value => value.includes('Mission loads into Core'), 'Synthetic mission import', 60_000);
  await scriptedClick(app, 'Return to menu');
  await until(() => app.evaluate(() => document.querySelector('[aria-describedby="mission-entry-description"]')?.getAttribute('data-eligibility')),
    eligibility => eligibility === 'eligible', 'Startable mission');
  await scriptedClick(app, 'Start mission');
  await untilSound(app, view => view.position === 'intro', 'Introduction placeholder');
  await scriptedClick(app, 'Skip');
  await untilSound(app, view => view.position === 'config', 'Mission start page');
  await app.evaluate(() => { document.querySelector<HTMLInputElement>('[data-testid="mission-wingmen"] input[data-wingman="none"]')!.click(); });
  await scriptedClick(app, 'Start');
  await untilSound(app, view => view.position === 'departure', 'Departure placeholder');
  await scriptedClick(app, 'Skip');
  return untilSound(app, view => view.position === 'flight' && view.phase === 'running' && (view.tick ?? 0) >= 40, 'Running flight', 15_000);
}

/** The probe's sources and contexts in the native target. */
const probe = (app: NativeTarget) => app.evaluate(() => ({
  contexts: window.osrAudioProbe.contexts(), started: window.osrAudioProbe.started(), routed: window.osrAudioProbe.routed(),
}));

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

test('locked: the mission runs silently with Enable sound offered; in the paused menu it only takes the capability; a trusted Continue plays and p pauses', async ({ audit, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('The locked audio case needs the development origin');
  const paths = await missionFilePaths(testInfo.outputPath('mission'));
  await withAudioTargets(baseURL, { path: ENTRY, audit }, async ({ app }) => {
    const locked = await lockedFlight(app, paths);
    // Nothing gave the page an activation: the context cannot run, the game does, and the status says so.
    expect(locked).toMatchObject({ activated: false, sound: 'needs-activation', text: 'Sound: off until you enable it.', soundRole: 'status', enable: 'Enable sound' });
    await wait(500);
    const silent = await app.evaluate(soundView);
    expect(silent.tick!).toBeGreaterThan(locked.tick!);
    const lockedProbe = await probe(app);
    expect(lockedProbe.started).toBe(0);
    expect(lockedProbe.routed).toBe(0);
    expect(lockedProbe.contexts.every(state => state === 'suspended')).toBe(true);
    // Spec 模式与生命周期: each start while locked is attempted and recorded as refused by the lock, not queued; the
    // engine's slot retries at its next unthrottled update (A-02), a by-ID one-shot does not.
    const refused = silent.log.filter(({ result }) => result === 'failed');
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every(({ text }) => text.includes('failed (audio-locked)'))).toBe(true);
    expect(refused.filter(({ sound }) => sound === 'sound/event/target-select')).toHaveLength(1);
    expect(refused.filter(({ sound }) => sound === 'sound/model-clip/01').length).toBeGreaterThan(1);
    expect(silent.log.some(({ result }) => result === 'started')).toBe(false);
    const lockedLog = silent.log.length;

    // Esc (no activation) opens the menu: the run pauses, the menu shows the same status and control.
    await pressKey(app, 'Escape');
    const menu = await untilSound(app, view => view.menu && view.position === 'menu', 'The mission menu');
    expect(menu).toMatchObject({ activated: false, sound: 'needs-activation', enable: 'Enable sound' });
    // A trusted click on Enable sound there only tries to take the capability: no Continue, no play, focus kept.
    await app.click('[data-testid="mission-menu"] [data-testid="mission-enable-sound"]');
    await wait(500);
    const tried = await app.evaluate(soundView);
    expect(tried).toMatchObject({ activated: true, menu: true, position: 'menu', tick: menu.tick, sound: 'needs-activation', enable: 'Enable sound', focus: 'enable-sound' });
    expect((await probe(app)).started).toBe(0);

    // A trusted Continue unlocks within its activation and continues: the engine sounds in both channels.
    const continued = Date.now();
    await app.press('Continue');
    const playing = await untilSound(app, view => !view.menu && view.phase === 'running' && view.sound === 'available', 'Sound after Continue');
    const statusDelay = Date.now() - continued;
    expect(playing).toMatchObject({ enable: null, focus: 'game-input-zone' });
    const output = await steadyCapture(samples => captureOutput(app, samples), capture => audible(capture).length === 1 && audible(capture)[0].loop, 'The engine after Continue');
    expect(Math.min(rms(output.left), rms(output.right))).toBeGreaterThan(0.1);

    // p pauses the run and its sound: the context suspends and its clock stands; p again resumes both.
    await pressKey(app, 'p');
    await untilSound(app, view => view.phase === 'paused' && view.sound === 'paused', 'Paused by p');
    await until(() => captureOutput(app), capture => capture.state === 'suspended', 'Suspended context');
    const pausedAt = await captureOutput(app);
    await wait(400);
    expect((await captureOutput(app)).time).toBe(pausedAt.time);
    await pressKey(app, 'p');
    const resumed = await untilSound(app, view => view.phase === 'running' && view.sound === 'available', 'Resumed by p');
    const after = await steadyCapture(samples => captureOutput(app, samples), capture => audible(capture).length === 1, 'The engine after p');
    expect(after.time).toBeGreaterThan(pausedAt.time);
    expect(after.voices).toEqual(output.voices);
    expect(app.errors, 'Browser errors').toEqual([]);
    await testInfo.attach('locked-audio', {
      contentType: 'application/json',
      body: JSON.stringify({
        locked: { ...locked, log: undefined }, lockedProbe, lockedLog, refused: refused.slice(0, 5), tried: { ...tried, log: undefined },
        statusDelay, resumed: { ...resumed, log: undefined }, output: { left: rms(output.left), right: rms(output.right) },
      }, null, 1),
    });
  });
});

test('locked: Tab reaches Enable sound in the status bar and Enter enables it, returning focus to the input zone', async ({ audit, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('The locked audio case needs the development origin');
  const paths = await missionFilePaths(testInfo.outputPath('mission'));
  await withAudioTargets(baseURL, { path: ENTRY, audit }, async ({ app }) => {
    const locked = await lockedFlight(app, paths);
    expect(locked).toMatchObject({ activated: false, sound: 'needs-activation', focus: 'game-input-zone' });
    const visited: (string | null)[] = [];
    for (let press = 0; press < 20 && visited.at(-1) !== 'enable-sound'; press++) {
      await pressKey(app, 'Tab');
      visited.push((await app.evaluate(soundView)).focus);
    }
    expect(visited.at(-1)).toBe('enable-sound');
    await pressKey(app, 'Enter');
    const enabled = await untilSound(app, view => view.sound === 'available', 'Sound enabled by Enter');
    expect(enabled).toMatchObject({ phase: 'running', enable: null, focus: 'game-input-zone', activated: true });
    const output = await steadyCapture(samples => captureOutput(app, samples), capture => audible(capture).length === 1, 'The engine after Enter');
    expect(rms(output.left)).toBeGreaterThan(0.1);
    expect(app.errors, 'Browser errors').toEqual([]);
    await testInfo.attach('keyboard-enable', { contentType: 'application/json', body: JSON.stringify({ visited, enabled: { ...enabled, log: undefined } }) });
  });
});

test('without Web Audio the mission runs silently: the status says so, nothing is offered or focused, and the log records each failed start', async ({ page }) => {
  await page.addInitScript(installAudioProbe);
  await openKeyboardMenu(page, 'development', { audio: 'unavailable', seeds: FLIGHT_SEEDS.join(',') });
  await flyWith(page, 0);
  const status = page.getByTestId('mission-status').getByTestId('mission-sound');
  await expect(status).toHaveAttribute('data-sound', 'unavailable');
  await expect(status).toHaveText('Sound: unavailable in this browser; the mission continues without sound.');
  await expect(page.getByTestId('mission-enable-sound')).toHaveCount(0);
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await expectAdvancingTick(page);
  expect(await page.evaluate(() => window.osrAudioProbe.contexts())).toEqual([]);
  expect(await audioSources(page)).toEqual([]);
  const log = page.getByTestId('dev-sound-log').locator('li[data-result="failed"]');
  await expect(log.first()).toContainText('failed (audio-unavailable)');
  await expect(page.getByTestId('dev-sound-log').locator('li[data-result="started"]')).toHaveCount(0);
  // p and the menu work as ever; the menu says the same and offers nothing.
  await page.keyboard.press('p');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.press('p');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mission-menu').getByTestId('mission-sound')).toHaveAttribute('data-sound', 'unavailable');
  await expect(page.getByTestId('mission-enable-sound')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await expectAdvancingTick(page);
});
