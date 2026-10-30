import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { HUD_CUE_SOUNDS } from '../src/app/flight-audio/hud-cues.ts';
import type { ThreatWarnings } from '../src/core/projections/projection.ts';
import { scenarioEntryProfile } from '../src/workers/import-scenarios.test-support.ts';
import { seedTestEntryPackage } from './support/ai-wingman.ts';
import { button, openTestEntry } from './support/app-entry.ts';
import { audioSources, installAudioProbe, type AudioVoiceReading } from './support/audio-playback.ts';
import { expect, test } from './support/audited-test.ts';
import { pauseWhen, resume, startableCockpit } from './support/cockpit.ts';
import { captureOutput, soundView, syntheticSound } from './support/flight-audio.ts';
import {
  cueDecisions, jointWarningPackage, readWarnings, stripRead, warningSpans, warningTimeline, WARNING_KINDS, type CueDecision, type StripRead,
  type WarningSpan, type WarningTick,
} from './support/joint-warning.ts';
import { saveRecording } from './support/keyboard-input.ts';
import { FLIGHT_VIEW } from './support/map-warp.ts';
import { chooseWingman, endPlaceholder, enterMission, missionEntry, waitForFrame } from './support/mission-observations.ts';
import type { SeededPackage } from './support/production-cache.ts';

// P3-15 subtask 04 (docs/plan/p3/15/spec.md, S-06; AC-06): the type-9 warning end to end in Chrome on the development
// test entry. The case seeds its isolated cache with the warning variant of the synthetic startable package
// (e2e/support/joint-warning.ts), in which Core's own AI lock, missile and tail-check rules raise and clear
// `attackerOnTail`, then `missileIncoming`, of the partition-level `communications.warnings`; the test writes no
// warning, lock level or other Core state. It flies the same seeded run twice, with Web Audio and without
// (`audio=unavailable`), in the cockpit view 0xC with the player's fields 9 and 12 intact (P3-14 AC-08, DW-10), driven
// only by trusted clicks and `p`. At paused ticks it reads three things of the same tick: the warnings the mission's UI
// store holds, the cockpit's type-9 strip in the composited picture (instrument(fixture, 9)'s ranges) and the sound
// consumer's instrument-9 voices (the audio probe) and decisions (the development sound log). The run's recording is
// replayed in Node for Core's warnings at every tick. This proves the signal and state path only; the listening verdict
// stays P3-14 V-06's (its subtask 26). The network audit runs throughout.

test.describe.configure({ timeout: 600_000 });

const SEED = 0x0eed_1541;
const PROFILE = scenarioEntryProfile('mission-startable')!;
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
/** Ticks between two paused samples, and the tick after which the run stops, well past both warnings' end. */
const SAMPLE_GAP = 5;
const LAST_TICK = 440;
/**
 * The ticks a strip picture may lag its flags: the strip draws only at its blink steps, the first drawn clock strictly
 * past the last step's + 0x15 units (11 ticks of 2 units), and a frame may carry one more tick.
 */
const BLINK_LAG = 12;
/**
 * The ticks after a resume by `p` in which a start may still be refused as `audio-paused`: the controller reports its
 * context running only at the context's `statechange`, after the session has resumed (audio-controller.ts `resume`).
 */
const RESUME_TICKS = 4;
const INSTRUMENT_9 = syntheticSound(HUD_CUE_SOUNDS.instrument9);

type Audio = 'available' | 'unavailable';

/** One paused tick: the store's view, gates (fields 9 and 12) and warnings, the strip and, with Web Audio, the voices. */
interface Sample {
  readonly tick: number;
  readonly viewMode: number;
  readonly gates: readonly number[] | null;
  readonly warnings: ThreatWarnings;
  readonly strip: StripRead;
  readonly voices: readonly AudioVoiceReading[] | null;
}

const zone = (page: Page) => page.getByTestId('game-input-zone');
const status = (page: Page) => page.getByTestId('mission-status');

/**
 * Opens the test entry with `audio` and the seed, stores the variant under the entry's profile unless the context's
 * cache already holds it, reloads, restores it through the main menu, and flies a run without a wingman from Start
 * (a trusted click) through the departure's Skip; resolves to what it stored.
 */
async function flyVariant(page: Page, audio: Audio, stored: SeededPackage | null): Promise<SeededPackage> {
  await openTestEntry(page, { worker: 'mission-startable', seeds: String(SEED), ...(audio === 'unavailable' && { audio }) });
  const seeded = stored ?? await seedTestEntryPackage(page, await jointWarningPackage());
  if (!stored) await page.reload();
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await chooseWingman(page, null);
  await button(page, 'Start').click();
  expect(await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null)).toMatchObject({ tick: 0 });
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(zone(page)).toBeFocused();
  await expect(status(page).getByTestId('mission-sound')).toHaveAttribute('data-sound', audio);
  return seeded;
}

/**
 * Samples the run every SAMPLE_GAP ticks until LAST_TICK, each at a paused tick by `p` (the run holds it): the store's
 * warnings and gates of that tick, its picture's strip, and the instrument-9 cue lines the sound log has shown so far
 * (read at each pause, so its window of 500 never drops one unseen). The run stays paused at the last sample.
 */
async function sampleRun(page: Page, audio: Audio): Promise<{ readonly samples: Sample[]; readonly decisions: CueDecision[] }> {
  const fixture = await startableCockpit();
  const samples: Sample[] = [];
  const decisions = new Map<string, CueDecision>();
  for (let target = SAMPLE_GAP; ; target += SAMPLE_GAP) {
    const { image, state } = await pauseWhen(page, current => current.tick >= target, `tick ${target}`);
    const [reading, sound, capture] = await Promise.all([
      page.evaluate(readWarnings), page.evaluate(soundView), audio === 'available' ? captureOutput(page, false) : null,
    ]);
    expect(reading?.tick, 'The store holds the pictured tick').toBe(state.tick);
    for (const decision of cueDecisions(sound.log)) decisions.set(decision.text, decision);
    const gates = state.combat && [state.combat.subsystems[9], state.combat.subsystems[12]];
    samples.push({ tick: state.tick, viewMode: state.viewMode, gates, warnings: reading!.warnings, strip: stripRead(image, fixture), voices: capture?.voices ?? null });
    if (state.tick >= LAST_TICK) break;
    await resume(page);
  }
  return { samples, decisions: [...decisions.values()].sort((a, b) => a.tick - b.tick) };
}

/**
 * Checks one range of the strip against Core's `key` flag at each sample: it shows its label only while the flag was set
 * within the ticks a picture may lag, and colour 0 otherwise (before the first label, between blinks and after).
 */
function expectStripRange(samples: readonly Sample[], timeline: readonly WarningTick[], key: keyof ThreatWarnings, range: 'craft' | 'missile'): void {
  for (const { tick, strip } of samples) {
    const lit = timeline.slice(Math.max(0, tick - 1 - BLINK_LAG), tick).some(({ warnings }) => warnings[key]);
    expect(lit ? ['label', 'clear'] : ['clear'], `${range} range at tick ${tick}`).toContain(strip[range]);
  }
}

/**
 * Checks the sound log's lines of `cue` with Web Audio and resolves to the tick its voice started: Core's first tick of
 * `span`, or the tick after `audio-paused` refusals at consecutive ticks from it, each within RESUME_TICKS of a resume
 * from a paused tick in `resumed`. Exactly one start, and no other line.
 */
function startedAt(decisions: readonly CueDecision[], cue: CueDecision['cue'], span: WarningSpan, resumed: readonly number[]): number {
  const lines = decisions.filter(decision => decision.cue === cue);
  const started = lines.at(-1);
  expect(started?.result, `${cue} started`).toBe('started');
  expect(lines.map(({ tick }) => tick), `${cue} from tick ${span.from}`).toEqual(Array.from({ length: started!.tick - span.from + 1 }, (_, index) => span.from + index));
  for (const { tick, result, code } of lines.slice(0, -1)) {
    expect({ tick, result, code }).toEqual({ tick, result: 'failed', code: 'audio-paused' });
    expect(resumed.some(paused => tick > paused && tick - paused <= RESUME_TICKS), `${cue} refused at tick ${tick} after a resume`).toBe(true);
  }
  return started!.tick;
}

/**
 * Flies the variant with `audio`, samples it, exports its recording and replays it in Node; checks Core's timeline,
 * the store against it at each sample, and the strip against it. Resolves to everything read, for the sound checks.
 */
async function runCase(page: Page, testInfo: TestInfo, audio: Audio, stored: SeededPackage | null) {
  const seeded = await flyVariant(page, audio, stored);
  const { samples, decisions } = await sampleRun(page, audio);
  const path = testInfo.outputPath(`warning-${audio}.json`);
  await saveRecording(page, path);
  const { recording, timeline, comparison } = await warningTimeline(path, seeded);

  // Core: the browser's own record replays to its own result; it holds no command and no steering, so only the rules
  // moved the run. The hostile's lock rises 0 → 2 → 3 → 4 on the player and drops at its launch; the tail check lights
  // `attackerOnTail` once, then `missileIncoming` once while its missile homes on the player, and both clear again.
  expect(comparison).toEqual({ match: true });
  expect(recording.record.run).toMatchObject({ seed: SEED, wingman: null });
  expect(recording.record.ticks.every(({ commands, axes }) => commands.length === 0 && Object.values(axes).every(value => value === 0))).toBe(true);
  const player = timeline.map(({ hostile }) => hostile.target).find(target => target !== null)!;
  const locks = timeline.map(({ hostile }) => hostile.lock).filter((lock, index, all) => index === 0 || lock !== all[index - 1]);
  expect(locks).toEqual([0, 2, 3, 4, 0]);
  const spans = warningSpans(timeline);
  expect(spans.attackerOnTail).toHaveLength(1);
  expect(spans.missileIncoming).toHaveLength(1);
  const [attacker] = spans.attackerOnTail;
  const [missile] = spans.missileIncoming;
  const at = (tick: number) => timeline[tick - 1];
  expect(at(attacker.from).hostile).toMatchObject({ target: player });
  expect(at(attacker.from).hostile.lock).toBeGreaterThanOrEqual(3);
  expect(at(attacker.from - 1).warnings.attackerOnTail).toBe(false);
  const launch = recording.result.events.find(event => event.type === 'shot-fired' && event.family === 'missile');
  expect(launch).toMatchObject({ shooterKindBit: WARNING_KINDS.hostile, family: 'missile' });
  expect(launch!.tick).toBeLessThan(missile.from);
  expect(at(missile.from).missiles).toEqual([player]);
  expect(at(missile.to).missiles).toEqual([]);
  expect(missile.to).toBeLessThan(LAST_TICK - BLINK_LAG);
  expect(timeline.every(({ gates }) => gates.join() === '0,0'), 'Fields 9 and 12 stay intact').toBe(true);

  // The store: each paused tick holds Core's warnings of that very tick, in the cockpit view.
  for (const { tick, viewMode, gates, warnings } of samples) {
    expect({ viewMode, gates, warnings }, `tick ${tick}`).toEqual({ viewMode: FLIGHT_VIEW, gates: [0, 0], warnings: at(tick).warnings });
  }
  const sampled = (span: WarningSpan) => samples.filter(({ tick }) => tick >= span.from && tick < span.to);
  expect(sampled(attacker).length, 'samples while the attacker warning holds').toBeGreaterThanOrEqual(10);
  expect(sampled(missile).length, 'samples while the missile warning holds').toBeGreaterThanOrEqual(10);

  // The strip: each range shows its label only for its set flag and blinks while the flag holds.
  expectStripRange(samples, timeline, 'attackerOnTail', 'craft');
  expectStripRange(samples, timeline, 'missileIncoming', 'missile');
  for (const [key, span, range] of [['attackerOnTail', attacker, 'craft'], ['missileIncoming', missile, 'missile']] as const) {
    const shown = sampled(span).map(({ strip }) => strip[range]);
    expect(shown, `the ${key} label blinks`).toContain('label');
    expect(shown, `the ${key} range clears between labels`).toContain('clear');
  }
  expect(samples.at(-1)!.strip).toEqual({ craft: 'clear', missile: 'clear' });

  const evidence = {
    audio, seed: SEED, view: FLIGHT_VIEW, player, finalTick: recording.result.finalTick,
    lock: Object.fromEntries([2, 3, 4].map(level => [level, timeline.find(({ hostile }) => hostile.lock === level)!.tick])),
    launch: launch!.tick, attackerOnTail: attacker, missileIncoming: missile,
    samples: samples.map(({ tick, warnings, strip, voices }) => ({ tick, warnings, strip, voices })),
    decisions: decisions.map(({ tick, cue, result, code }) => ({ tick, cue, result, code })),
  };
  const evidencePath = testInfo.outputPath(`evidence-${audio}.json`);
  await writeFile(evidencePath, JSON.stringify(evidence, null, 1));
  await testInfo.attach(`evidence-${audio}`, { contentType: 'application/json', path: evidencePath });
  return { seeded, samples, decisions, timeline, attacker, missile };
}

test('Core\'s tail attacker and incoming missile light and clear the type-9 warning; the store, the cockpit strip and the sound consumer read it each in its own way, with Web Audio or without', async ({ page, audit }, testInfo) => {
  audit.canaries({ name: 'source-fingerprint', value: PROFILE.sourceFingerprint });
  await page.addInitScript(installAudioProbe);

  // With Web Audio, after the trusted Start: the consumer starts the craft voice (volume 50 at the stored rate) at the
  // tick Core lights `attackerOnTail`, replaces it with the missile voice (22,000 Hz at full volume) at the tick it
  // lights `missileIncoming`, and stops it at the tick that clears; at every paused tick the voices sounding are those
  // the tick's flags call for. A start refused in the first ticks after a resume is retried at the next tick.
  const sounding = await runCase(page, testInfo, 'available', null);
  const { attacker, missile } = sounding;
  const resumed = sounding.samples.map(({ tick }) => tick);
  const craftFrom = startedAt(sounding.decisions, 'instrument-9-craft', attacker, resumed);
  const missileFrom = startedAt(sounding.decisions, 'instrument-9-missile', missile, resumed);
  const sources = await audioSources(page);
  const samples9 = JSON.stringify([INSTRUMENT_9.samples]);
  const instrument9 = ({ index }: AudioVoiceReading) => sources[index].sampleRate === INSTRUMENT_9.rate && JSON.stringify(sources[index].channels) === samples9;
  const craftVoice = { playbackRate: 1, volume: Math.fround(50 / 127) };
  const missileVoice = { playbackRate: Math.fround(22_000 / INSTRUMENT_9.rate), volume: 1 };
  for (const { tick, warnings, voices } of sounding.samples) {
    const expected = warnings.missileIncoming ? (tick >= missileFrom ? [missileVoice] : [])
      : warnings.attackerOnTail && tick >= craftFrom ? [craftVoice] : [];
    const actual = voices!.filter(instrument9).map(({ playbackRate, gains }) => ({ playbackRate, volume: gains[0] }));
    expect(actual, `instrument-9 voices at tick ${tick}`).toEqual(expected);
  }

  // Without Web Audio, the same seeded run: Core's warnings are the same tick for tick and the strip follows them by the
  // same rule (runCase), while every instrument-9 start fails, so the consumer retries it at each tick of its flag and
  // only then. Neither consumer moves the other: the cockpit draws without a sound voice, the sound without the strip.
  const silent = await runCase(page, testInfo, 'unavailable', sounding.seeded);
  const common = Math.min(sounding.timeline.length, silent.timeline.length);
  expect(silent.timeline.slice(0, common)).toEqual(sounding.timeline.slice(0, common));
  expect(await page.evaluate(() => window.osrAudioProbe.contexts()), 'no audio context without Web Audio').toEqual([]);
  for (const [cue, span] of [['instrument-9-craft', silent.attacker], ['instrument-9-missile', silent.missile]] as const) {
    const tried = silent.decisions.filter(decision => decision.cue === cue);
    expect(tried.map(({ tick }) => tick), `${cue} tried at each tick of its flag`).toEqual(Array.from({ length: span.to - span.from }, (_, index) => span.from + index));
    expect(tried.every(({ result, code }) => result === 'failed' && code === 'audio-unavailable')).toBe(true);
  }
});
