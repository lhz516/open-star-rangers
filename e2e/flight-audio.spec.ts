import type { Page } from '@playwright/test';
import { button } from './support/app-entry.ts';
import { audioSources, installAudioProbe, type AudioSourceRecord } from './support/audio-playback.ts';
import { expect, test } from './support/audited-test.ts';
import {
  audible, captureOneShot, captureOutput, ENGINE_SOUND, FLIGHT_SEEDS, fitLoop, fitOneShot, fitVoice, flyWith, FULL_SPEED_ENGINE_RATE,
  integerPlacement, MISSILE_SOUND, rms, steadyCapture, strideOf, syntheticSound,
} from './support/flight-audio.ts';
import { openKeyboardMenu } from './support/keyboard-input.ts';
import { expectAdvancingTick, expectStableTick, missionEntry } from './support/mission-observations.ts';

// P3-14 subtask 22 (docs/plan/p3/14/spec.md, 验证策略; AC-06, AC-12, AC-14 with S-03, S-09, S-10): the flight sound of
// the formal mission in both builds, measured at the final output. Development imports the synthetic
// `mission-startable` package through the test entry, production restores it from an isolated synthetic cache; the run
// is driven only by trusted input on the page's own controls (a trusted click starts it, so the context may run), the
// network audit runs throughout, and the audio probe observes without changing the graph's output. Each voice's
// expected signal is derived from its buffer and the parameters its graph holds (support/flight-audio.ts): Chrome
// renders a source as its loop linearly interpolated at the stride, so with only the starting phase fitted the output
// matches it to float32 rounding (about 1e-7 of its RMS) in every 4096-frame window; any other stride or gain leaves
// tenths. A suspended context's analyser keeps its last frame, so pauses are judged by the context's state and clock.

test.describe.configure({ timeout: 240_000 });

/** The relative residual a voice's output must fit within: rounding only, with a wide margin. */
const FIT = 1e-3;

const shellSound = (page: Page) => page.getByTestId('mission-status').getByTestId('mission-sound');
const menuSound = (page: Page) => page.getByTestId('mission-menu').getByTestId('mission-sound');

/** The started source records of a run, from `from` (the record count when it started) on. */
const runSources = async (page: Page, from: number): Promise<AudioSourceRecord[]> => (await audioSources(page)).slice(from);

/** The player engine's source: the run's first looping source started at full volume, centred, at the full-speed rate. */
function engineOf(sources: readonly AudioSourceRecord[], from: number): { readonly index: number; readonly record: AudioSourceRecord } | null {
  const offset = sources.findIndex(({ loop, initial }) => loop && initial.gains.join() === '1,1,1');
  return offset < 0 ? null : { index: from + offset, record: sources[offset] };
}

/** The engine's and the missile's samples, decoded from the synthetic fixture independently of the converter. */
const ENGINE = syntheticSound(ENGINE_SOUND);
const MISSILE = syntheticSound(MISSILE_SOUND);

test('the engines, one-shots and parameter changes reach both output channels; a pause freezes the context and Continue resumes the same voices', async ({ page, audit }, testInfo) => {
  const build = audit.mode;
  await page.addInitScript(installAudioProbe);
  await openKeyboardMenu(page, build, build === 'development' ? { seeds: FLIGHT_SEEDS.join(',') } : {});
  const read = (samples?: boolean) => captureOutput(page, samples);

  // Run 1, with the first wingman: the player's engine silenced by speed 0 leaves the wingman's engine, placed off
  // centre, as the only audible voice; each channel carries its own gain.
  let from = (await audioSources(page)).length;
  await flyWith(page, 0);
  await expect(shellSound(page)).toHaveAttribute('data-sound', 'available');
  await expect(shellSound(page)).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('mission-enable-sound')).toHaveCount(0);
  await expect.poll(async () => engineOf(await runSources(page, from), from) !== null, { message: 'The player engine started' }).toBe(true);
  await page.keyboard.press('Backslash');
  const placed = await steadyCapture(read, capture => {
    const voices = audible(capture);
    return voices.length === 1 && voices[0].loop && voices[0].gains[1] !== voices[0].gains[2];
  }, 'The wingman engine alone and off centre');
  const [wingman] = audible(placed);
  // The wingman's craft plays the same engine clip; its graph holds an integer volume and pan (A-09) and rate.
  const wingmanRecord = (await audioSources(page))[wingman.index];
  expect({ rate: wingmanRecord.sampleRate, channels: wingmanRecord.channels }).toEqual({ rate: ENGINE.rate, channels: [ENGINE.samples] });
  const placement = integerPlacement(wingman.gains);
  expect(placement, `gains ${wingman.gains.join()}`).not.toBeNull();
  const wingmanRate = wingman.playbackRate * ENGINE.rate;
  expect(Math.abs(wingmanRate - Math.round(wingmanRate))).toBeLessThan(0.01);
  const wingmanFit = fitVoice(placed, wingman, ENGINE);
  expect(wingmanFit.left.residual).toBeLessThan(FIT);
  expect(wingmanFit.right.residual).toBeLessThan(FIT);
  expect(Math.min(wingmanFit.left.measured, wingmanFit.right.measured)).toBeGreaterThan(0.01);
  expect(wingmanFit.left.measured / wingmanFit.right.measured).toBeCloseTo(wingman.gains[1] / wingman.gains[2], 1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mission-menu')).toBeVisible();
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.osrAudioProbe.contexts())).at(-1)).toBe('closed');

  // Run 2, without a wingman: the player's engine is the only continuous voice.
  from = (await audioSources(page)).length;
  await flyWith(page, null);
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await expect(shellSound(page)).toHaveAttribute('data-sound', 'available');
  await expect.poll(async () => engineOf(await runSources(page, from), from) !== null, { message: 'The player engine started' }).toBe(true);
  const engine = engineOf(await runSources(page, from), from)!;
  // It plays the engine clip; its parameters were in the graph before it started: full volume, both channels full
  // (pan 64) and 19,000 Hz (A-05 at full commanded speed).
  expect({ rate: engine.record.sampleRate, channels: engine.record.channels }).toEqual({ rate: ENGINE.rate, channels: [ENGINE.samples] });
  expect(engine.record.initial).toEqual({ playbackRate: Math.fround(FULL_SPEED_ENGINE_RATE / ENGINE.rate), gains: [1, 1, 1] });
  expect(engine.record.start.when).toBeNull();
  const steadyEngine = (accept: (capture: Awaited<ReturnType<typeof read>>) => boolean, what: string) => steadyCapture(read, capture => {
    const voices = audible(capture);
    return voices.length === 1 && voices[0].index === engine.index && accept(capture);
  }, what);
  const full = await steadyEngine(() => true, 'The engine alone at full speed');
  const fullVoice = audible(full)[0];
  const fullFit = fitVoice(full, fullVoice, ENGINE);
  expect(fullFit.left.residual).toBeLessThan(FIT);
  expect(fullFit.right.residual).toBeLessThan(FIT);
  expect(full.left).toEqual(full.right);
  expect(fullFit.left.measured).toBeGreaterThan(0.1);

  // A slower commanded speed changes the rate on the same voice: the output's period follows the new stride, which the
  // old one no longer fits.
  await page.keyboard.press('Shift+Digit5');
  const slower = await steadyEngine(capture => audible(capture)[0].playbackRate !== fullVoice.playbackRate, 'The engine at a lower rate');
  const slowerVoice = audible(slower)[0];
  const slowerRate = slowerVoice.playbackRate * ENGINE.rate;
  expect(Math.abs(slowerRate - Math.round(slowerRate))).toBeLessThan(0.01);
  expect(slowerRate).toBeGreaterThan(3_000);
  expect(slowerRate).toBeLessThan(FULL_SPEED_ENGINE_RATE);
  const slowerFit = fitVoice(slower, slowerVoice, ENGINE);
  expect(slowerFit.left.residual).toBeLessThan(FIT);
  expect(fitLoop(slower.left, ENGINE.samples, strideOf(fullVoice, ENGINE.rate, slower.sampleRate), 1).residual).toBeGreaterThan(0.3);
  // Speed 0 sets the volume to 0 (A-05): the voice stays, its output is silent.
  await page.keyboard.press('Backslash');
  const silent = await steadyCapture(read, capture => capture.voices.some(({ index, gains }) => index === engine.index && gains[0] === 0), 'The engine at volume 0');
  expect(audible(silent)).toEqual([]);
  expect([rms(silent.left), rms(silent.right)]).toEqual([0, 0]);

  // With the engine silent, a missile's launch is the only sound: its one-shot plays the missile clip once at the
  // player's start values (volume 127, pan 64, stored rate) into both channels, then the output is silent again.
  const beforeShot = (await audioSources(page)).length;
  const shotCapture = page.evaluate(captureOneShot, beforeShot);
  await page.keyboard.press('Space');
  const captured = await shotCapture;
  expect(captured, 'A one-shot was captured').not.toBeNull();
  const shot = (await audioSources(page))[captured!.index];
  expect({ rate: shot.sampleRate, channels: shot.channels }).toEqual({ rate: MISSILE.rate, channels: [MISSILE.samples] });
  expect(shot.initial).toEqual({ playbackRate: 1, gains: [1, 1, 1] });
  const shotStride = MISSILE.rate / captured!.capture.sampleRate;
  const shotFits = [captured!.capture.left, captured!.capture.right].map(channel => fitOneShot(channel, MISSILE.samples, shotStride, 1));
  for (const fit of shotFits) {
    expect(fit).toMatchObject({ silentBefore: true, silentAfter: true });
    expect(fit!.residual).toBeLessThan(FIT);
    expect(fit!.peak).toBeGreaterThan(0.1);
  }
  expect(captured!.capture.left).toEqual(captured!.capture.right);
  await expect.poll(async () => (await audioSources(page))[captured!.index].end, { message: 'The one-shot ended' }).not.toBeNull();
  expect((await audioSources(page))[captured!.index].stops).toEqual([]);

  // Full speed again: the same voice is audible at 19,000 Hz.
  await page.keyboard.press('Backspace');
  const again = await steadyEngine(capture => audible(capture)[0].playbackRate === fullVoice.playbackRate, 'The engine at full speed again');
  expect(fitVoice(again, audible(again)[0], ENGINE).left.residual).toBeLessThan(FIT);

  // `p` pauses at the control boundary: the context suspends and its clock stands, every voice kept with its values.
  const beforePause = await steadyEngine(() => true, 'The engine before the pause');
  await page.keyboard.press('p');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'paused');
  await expect(shellSound(page)).toHaveAttribute('data-sound', 'paused');
  await expect.poll(async () => (await read()).state).toBe('suspended');
  const pausedAt = await read();
  await expectStableTick(page, 500);
  const pausedLater = await read();
  expect(pausedLater.time).toBe(pausedAt.time);
  expect(pausedLater.voices).toEqual(beforePause.voices);
  expect(pausedLater.started).toBe(beforePause.started);
  // `p` again continues them: the clock runs and the same engine sounds again, nothing restarted.
  await page.keyboard.press('p');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await expect(shellSound(page)).toHaveAttribute('data-sound', 'available');
  const resumed = await steadyEngine(() => true, 'The engine after the pause');
  expect(resumed.time).toBeGreaterThan(pausedLater.time);
  expect(fitVoice(resumed, audible(resumed)[0], ENGINE).left.residual).toBeLessThan(FIT);
  expect((await audioSources(page))[engine.index].end).toBeNull();

  // The menu pauses likewise and its Continue resumes; the status follows the session once it runs again.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mission-menu')).toBeVisible();
  await expect(menuSound(page)).toHaveAttribute('data-sound', 'paused');
  await expect.poll(async () => (await read()).state).toBe('suspended');
  const menuAt = await read();
  const continued = Date.now();
  await button(page, 'Continue').click();
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
  await expect(shellSound(page)).toHaveAttribute('data-sound', 'available');
  const statusDelay = Date.now() - continued;
  await expectAdvancingTick(page, 400);
  const afterMenu = await steadyEngine(() => true, 'The engine after the menu');
  expect(afterMenu.time).toBeGreaterThan(menuAt.time);
  const runStarts = (await audioSources(page)).slice(from);
  expect(runStarts.filter(({ loop }) => loop)).toHaveLength(1);

  if (build === 'development') {
    // The development sound log names what each start played: one `started` decision per source the probe saw start.
    const log = await page.getByTestId('dev-sound-log').locator('li').evaluateAll(entries => entries.map(entry => ({
      result: (entry as HTMLElement).dataset.result, sound: (entry as HTMLElement).dataset.sound ?? null, text: entry.textContent ?? '',
    })));
    expect(log.filter(({ result }) => result === 'started')).toHaveLength(runStarts.length);
    expect(log.find(({ result, sound }) => result === 'started' && sound === 'sound/model-clip/01')?.text).toMatch(/entity 1 slot 0 · class 5 · started · volume=127 rate=19000$/);
    expect(log.some(({ result, sound, text }) => result === 'started' && sound === 'sound/missile' && / · entity 1 slot \d · /.test(text))).toBe(true);
  } else {
    // Production has no diagnostics and no sound log.
    expect(await page.evaluate(() => document.querySelectorAll('[data-testid="mission-dev-panel"], [data-testid^="dev-"]').length)).toBe(0);
  }

  await page.keyboard.press('Escape');
  await button(page, 'Return to main menu').click();
  await expect(missionEntry(page)).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.osrAudioProbe.contexts())).at(-1)).toBe('closed');
  expect(await page.evaluate(() => window.osrAudioProbe.routed())).toBe(0);
  // Every parameterised voice of both runs, the off-centre wingman's included, got its initial values before its nodes
  // were connected, so no render quantum could overwrite them before start() (subtask 30).
  const allSources = await audioSources(page);
  expect(allSources.filter(({ initial }) => initial.gains.some(gain => gain !== 1)).length).toBeGreaterThan(0);
  expect(allSources.flatMap(({ setAfterConnection }, index) => setAfterConnection.map(parameter => `${index} ${parameter}`))).toEqual([]);
  const summary = (fit: { left: { residual: number; measured: number }; right: { residual: number; measured: number } }) => ({
    left: { residual: fit.left.residual, rms: fit.left.measured }, right: { residual: fit.right.residual, rms: fit.right.measured },
  });
  await testInfo.attach('flight-audio-output', {
    contentType: 'application/json',
    body: JSON.stringify({
      build, sampleRate: full.sampleRate, window: full.left.length,
      wingman: { gains: wingman.gains, playbackRate: wingman.playbackRate, fit: summary(wingmanFit) },
      engine: { initial: engine.record.initial, fit: summary(fullFit) },
      slower: { rate: slowerRate, fit: summary(slowerFit) },
      shot: { initial: shot.initial, fits: shotFits }, placement, paused: { time: pausedAt.time, voices: pausedLater.voices.length }, resumed: resumed.time, statusDelay,
    }, null, 1),
  });
});
