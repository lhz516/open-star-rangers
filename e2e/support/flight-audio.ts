import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { PRODUCTION_SOUND_TABLE } from '../../src/original-data/conversion/production-sounds.ts';
import { productionSoundEntries } from '../../src/original-data/conversion/production-sounds.test-support.ts';
import { archiveLocator } from '../../src/original-data/source-mapping.ts';
import { scenarioFiles } from '../../src/workers/import-scenarios.test-support.ts';
import { button, filePayloads } from './app-entry.ts';
import type { AudioOutputCapture, AudioVoiceReading } from './audio-playback.ts';
import { chooseWingman, endPlaceholder, enterMission, waitForFrame } from './mission-observations.ts';
import { until, type NativeTarget } from './native-lifecycle.ts';

// P3-14 subtask 22: the mission's flight sound in a real browser with the synthetic `mission-startable` package. The
// scenario steps use only the page's own controls; the audio evidence is the probe's (audio-playback.ts
// `installAudioProbe`): what reached the destination, per output channel, and each source's parameters as set. The
// expected output of a voice is derived here from its buffer and the parameters the graph holds, independently of the
// application's parameter laws: a looping source plays its samples linearly interpolated at `stride` buffer frames per
// output frame (playbackRate × buffer rate ÷ context rate), scaled by the voice's volume gain and the channel's gain.

/** Seeds the mission's Core RNG the same way in every run (P3-04 S-09), so the scene is repeatable. */
export const FLIGHT_SEEDS = Object.freeze([0x0eed_0022, 0x0eed_0023, 0x0eed_0024, 0x0eed_0025]);

/** The engine rate at full commanded speed (audio A-05): 3000 + 16000 × speed ÷ maximum, the maximum's own share 1. */
export const FULL_SPEED_ENGINE_RATE = 19_000;

/** A mono sound of the synthetic package: its stored rate and its samples as Web Audio plays them. */
export interface SyntheticSound {
  readonly rate: number;
  readonly samples: readonly number[];
}

/**
 * The synthetic SND entry (production-sounds.test-support.ts) the production sound table maps `asset` to, decoded here
 * from its header by the documented layout (docs/original/formats/audio.md: u32 sample offset, byte count, rate, bits;
 * 8-bit unsigned, 16-bit signed little-endian) without the converter, as Web Audio gets it: 8-bit (v − 128) ÷ 128 and
 * 16-bit v ÷ 32768, rounded to float32.
 */
export function syntheticSound(asset: string): SyntheticSound {
  const row = PRODUCTION_SOUND_TABLE.find(({ mapping }) => mapping.asset.id === asset);
  if (!row) throw new Error(`No production sound row for ${asset}`);
  const { id } = archiveLocator(row.mapping.parts[0].alternatives[0]).entry;
  const entry = productionSoundEntries().find(candidate => candidate.id === id);
  if (!entry) throw new Error(`No synthetic SND entry ${id}`);
  const view = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
  const [offset, bytes, rate, bits] = [0, 4, 8, 12].map(at => view.getUint32(at, true));
  const samples = bits === 8
    ? Array.from({ length: bytes }, (_, index) => (view.getUint8(offset + index) - 128) / 128)
    : Array.from({ length: bytes / 2 }, (_, index) => view.getInt16(offset + index * 2, true) / 32_768);
  return { rate, samples: samples.map(Math.fround) };
}

/** The player's (and every craft's) engine, model sound slot 0 of the synthetic craft types, and the missile's launch. */
export const ENGINE_SOUND = 'sound/model-clip/01';
export const MISSILE_SOUND = 'sound/missile';

/** Audio A-09's balance table T[i] ÷ 128: 2i for i ≤ 62, 128 from 63 on. */
const balance = (index: number): number => (index <= 62 ? 2 * index : 128) / 128;

/**
 * Whether gains are those of some integer volume and pan (A-09): volume ÷ 127, then T[127 − pan] and T[pan], each
 * rounded to float32 as an AudioParam holds it. The placement laws that choose them are Node tests'.
 */
export function integerPlacement(gains: readonly number[]): { readonly volume: number; readonly pan: number } | null {
  const [volume, left, right] = gains;
  const level = Math.round(volume * 127);
  if (Math.fround(level / 127) !== volume) return null;
  for (let pan = 0; pan <= 127; pan++) {
    if (Math.fround(balance(127 - pan)) === left && Math.fround(balance(pan)) === right) return { volume: level, pan };
  }
  return null;
}

/** From the main menu: the start page with `wingman` (an option index, or null for none), the run started and in flight. */
export async function flyWith(page: Page, wingman: number | null): Promise<void> {
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  await chooseWingman(page, wingman);
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(page.getByTestId('mission-status')).toHaveAttribute('data-phase', 'running');
}

/** The probe's capture of the final output now, in a Playwright page or a native target; without `samples`, no channels. */
export async function captureOutput(target: Pick<NativeTarget, 'evaluate'>, samples = true): Promise<AudioOutputCapture> {
  const capture = await target.evaluate(withSamples => window.osrAudioProbe.capture(withSamples), samples);
  if (!capture) throw new Error('No audio context to capture');
  return capture;
}

/**
 * Page function (subtask 23): the page's audio contexts in creation order as `state:close outcomes`, the newest one's
 * clock (null before any), the sources started, the indices of those still connected, and the application nodes still
 * connected to a destination (each sounding voice's last node). Silence is judged by these, never by an analyser, which
 * keeps its last frame once a context stops rendering.
 */
export function audioReading() {
  const sources = window.osrAudioProbe.sources();
  return {
    contexts: window.osrAudioProbe.records().map(({ state, closes }) => `${state}:${closes.join(',')}`),
    time: window.osrAudioProbe.capture(false)?.time ?? null,
    started: sources.length,
    live: sources.flatMap(({ end }, index) => (end === null ? [index] : [])),
    routed: window.osrAudioProbe.routed(),
  };
}

export type AudioReading = ReturnType<typeof audioReading>;

/** `count` contexts as `audioReading` shows them once each was closed with its `close()` resolved. */
export const closedContexts = (count: number): string[] => Array<string>(count).fill('closed:resolved');

/** The probe's analyser window per output channel. */
const WINDOW_FRAMES = 4096;

const sameVoices = (a: readonly AudioVoiceReading[], b: readonly AudioVoiceReading[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A capture whose whole window is steady: read twice at least a window apart, with the context running, no source
 * started or ended and every live voice's parameters unchanged in between, so the second window holds one fixed
 * mixture; and `accept` holds for it. Retries for `timeout` ms.
 */
export async function steadyCapture(
  read: (samples?: boolean) => Promise<AudioOutputCapture>, accept: (capture: AudioOutputCapture) => boolean, what: string, timeout = 15_000,
): Promise<AudioOutputCapture> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const first = await read(false);
    const span = WINDOW_FRAMES / first.sampleRate;
    await new Promise(resolve => setTimeout(resolve, span * 1000 + 30));
    const last = await read();
    if (last.state === 'running' && first.state === 'running' && last.time - first.time >= span && last.started === first.started
      && sameVoices(first.voices, last.voices) && accept(last)) return last;
    if (Date.now() >= deadline) {
      const { left, right, ...rest } = last;
      throw new Error(`${what}: no steady capture; last ${JSON.stringify({ ...rest, left: rms(left), right: rms(right) })}`);
    }
  }
}

export const rms = (samples: readonly number[]): number => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);

/** One looping buffer channel at a fractional frame, linearly interpolated, wrapping from the last frame to the first. */
function looped(samples: readonly number[], position: number): number {
  const length = samples.length;
  const wrapped = ((position % length) + length) % length;
  const frame = Math.floor(wrapped);
  const fraction = wrapped - frame;
  return samples[frame] * (1 - fraction) + samples[(frame + 1) % length] * fraction;
}

/** How a channel's output matches a looping voice at a known stride and gain, at the best starting phase. */
export interface VoiceFit {
  /** The starting buffer frame of the window that matches best. */
  readonly phase: number;
  /** The root mean square of output minus expectation, relative to the expectation's. */
  readonly residual: number;
  /** The output's and the expectation's root mean square. */
  readonly measured: number;
  readonly expected: number;
}

/**
 * Fits `output` to `samples` looping at `stride` buffer frames per output frame, scaled by `gain`: only the starting
 * phase is searched (a coarse scan, then refined), so stride and amplitude stay what the parameters say.
 */
export function fitLoop(output: readonly number[], samples: readonly number[], stride: number, gain: number): VoiceFit {
  const error = (phase: number) => {
    let sum = 0;
    for (let index = 0; index < output.length; index++) {
      const difference = output[index] - gain * looped(samples, phase + index * stride);
      sum += difference * difference;
    }
    return sum;
  };
  const steps = samples.length * 64;
  let best = 0;
  let bestError = Number.POSITIVE_INFINITY;
  for (let step = 0; step < steps; step++) {
    const value = error((step / steps) * samples.length);
    if (value < bestError) [best, bestError] = [(step / steps) * samples.length, value];
  }
  for (let width = samples.length / steps; width > 1e-7; width /= 2) {
    for (const candidate of [best - width, best + width]) {
      const value = error(candidate);
      if (value < bestError) [best, bestError] = [candidate, value];
    }
  }
  const expectedSamples = output.map((_, index) => gain * looped(samples, best + index * stride));
  const expected = rms(expectedSamples);
  return { phase: best, residual: Math.sqrt(bestError / output.length) / (expected || 1), measured: rms(output), expected };
}

/** The buffer frames per output frame of a live voice of a sound stored at `rate`, in a context at `sampleRate`. */
export const strideOf = (voice: AudioVoiceReading, rate: number, sampleRate: number): number => (voice.playbackRate * rate) / sampleRate;

/**
 * Both channels of a steady capture fitted to its one audible voice, playing `sound` looped through the parameterised
 * graph: channel c carries volume gain × channel gain c of the source.
 */
export function fitVoice(capture: AudioOutputCapture, voice: AudioVoiceReading, sound: SyntheticSound): { left: VoiceFit; right: VoiceFit } {
  const [volume, left, right] = voice.gains;
  const stride = strideOf(voice, sound.rate, capture.sampleRate);
  return { left: fitLoop(capture.left, sound.samples, stride, volume * left), right: fitLoop(capture.right, sound.samples, stride, volume * right) };
}

/**
 * The live voices of a capture that reach the output: a fixed voice, or a parameterised one whose volume and at least
 * one channel gain are not zero.
 */
export const audible = (capture: AudioOutputCapture): AudioVoiceReading[] => capture.voices.filter(({ gains }) => {
  if (gains.some(gain => !Number.isFinite(gain))) throw new Error(`A voice gain is not finite: ${gains.join()}`);
  return gains.length === 0 || (gains[0] !== 0 && gains.slice(1).some(gain => gain !== 0));
});

/**
 * Page function: waits for the next one-shot (non-looping) source after the first `from` sources, then until the
 * context has rendered it out and a little more, and captures the output; null after 5 s without one. The capture's
 * window (4096 frames) holds the whole one-shot as long as it is under about 80 ms.
 */
export async function captureOneShot(from: number): Promise<{ readonly index: number; readonly capture: AudioOutputCapture } | null> {
  const end = performance.now() + 5_000;
  const pause = () => new Promise(resolve => { setTimeout(resolve, 2); });
  for (;;) {
    const sources = window.osrAudioProbe.sources();
    const index = sources.findIndex((source, at) => at >= from && !source.loop);
    if (index >= 0) {
      const { start, length, sampleRate } = sources[index];
      const done = start.at + length / sampleRate + 0.01;
      while ((window.osrAudioProbe.capture()?.time ?? 0) < done) {
        if (performance.now() > end) return null;
        await pause();
      }
      return { index, capture: window.osrAudioProbe.capture()! };
    }
    if (performance.now() > end) return null;
    await pause();
  }
}

/**
 * How a channel's output matches a one-shot at `stride` and `gain`: the silent frames before and after it, and the fit
 * over the frames whose position lies within the buffer, its start frame and phase searched. Chrome starts a source on
 * a render frame, so the first played frame is at phase 0 of the buffer.
 */
export function fitOneShot(output: readonly number[], samples: readonly number[], stride: number, gain: number) {
  const first = output.findIndex(value => value !== 0);
  if (first < 0) return null;
  let best = { start: first, residual: Number.POSITIVE_INFINITY, frames: 0 };
  for (let start = Math.max(0, first - 2); start <= first; start++) {
    let sum = 0;
    let energy = 0;
    let frames = 0;
    for (let position = 0; position <= samples.length - 1; position += stride, frames++) {
      const expected = gain * looped(samples, position);
      const difference = output[start + frames] - expected;
      sum += difference * difference;
      energy += expected * expected;
    }
    const residual = Math.sqrt(sum / (energy || 1));
    if (residual < best.residual) best = { start, residual, frames };
  }
  const after = best.start + best.frames + Math.ceil(1 / stride) + 1;
  return {
    ...best,
    silentBefore: output.slice(0, best.start).every(value => value === 0),
    silentAfter: output.slice(after).every(value => value === 0),
    peak: Math.max(...output.map(Math.abs)),
  };
}

// The development-only locked-audio browser: a Chrome whose autoplay policy needs a user activation, driven by raw CDP,
// whose evaluation grants none (audio-playback.ts `withAudioTargets`). Scripted clicks below are untrusted, so the page
// has no activation until a CDP mouse or key input gives it one.

/** The mission package files on disk for the file chooser, under `directory`. */
export async function missionFilePaths(directory: string): Promise<string[]> {
  await mkdir(directory, { recursive: true });
  return Promise.all((await filePayloads([...await scenarioFiles('mission-startable')])).map(async ({ name, buffer }) => {
    const path = join(directory, name);
    await writeFile(path, buffer);
    return path;
  }));
}

/** An untrusted click on the enabled button with this text, which grants no user activation. */
export const scriptedClick = (target: NativeTarget, name: string): Promise<void> => target.evaluate(label => {
  const element = [...document.querySelectorAll('button')].find(candidate => (candidate.getAttribute('aria-label') ?? candidate.textContent) === label);
  if (!element || element.disabled) throw new Error(`No enabled button named ${label}`);
  element.click();
}, name);

/** The keys the locked-audio test presses: code, key, Windows virtual key code and the text a key press types. */
const KEYS = Object.freeze({
  p: ['KeyP', 'p', 80, 'p'], Escape: ['Escape', 'Escape', 27, ''], Tab: ['Tab', 'Tab', 9, ''], Enter: ['Enter', 'Enter', 13, '\r'],
} as const);

/** A trusted key press (down, then up) by CDP input. */
export async function pressKey(target: NativeTarget, key: keyof typeof KEYS): Promise<void> {
  const [code, name, windowsVirtualKeyCode, text] = KEYS[key];
  await target.command('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', code, key: name, windowsVirtualKeyCode, ...(text ? { text } : {}) });
  await target.command('Input.dispatchKeyEvent', { type: 'keyUp', code, key: name, windowsVirtualKeyCode });
}

/** Page function: what the mission screen shows of the run and its sound, focus, activation and the development sound log. */
export function soundView() {
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const status = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const menu = document.querySelector('[data-testid="mission-menu"]');
  const place = menu ?? status;
  const sound = place?.querySelector<HTMLElement>('[data-testid="mission-sound"]') ?? null;
  const enable = place?.querySelector<HTMLButtonElement>('[data-testid="mission-enable-sound"]') ?? null;
  const active = document.activeElement;
  const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
  return {
    position: screen?.dataset.position ?? null,
    tick: number(screen?.dataset.tick),
    phase: status?.dataset.phase ?? null,
    menu: menu !== null,
    sound: sound?.dataset.sound ?? null,
    text: sound?.textContent ?? null,
    soundRole: sound?.getAttribute('role') ?? null,
    enable: enable?.textContent ?? null,
    focus: active === enable && enable !== null ? 'enable-sound'
      : active?.getAttribute('data-testid') ?? (active instanceof HTMLButtonElement ? `button:${active.textContent}` : active?.tagName.toLowerCase() ?? null),
    activated: navigator.userActivation.hasBeenActive,
    log: [...document.querySelectorAll<HTMLElement>('[data-testid="dev-sound-log"] li')].map(entry => ({
      result: entry.dataset.result ?? null, sound: entry.dataset.sound ?? null, text: entry.textContent ?? '',
    })),
  };
}

export type SoundView = ReturnType<typeof soundView>;

/** Polls `soundView` in the native target until `accept` holds. */
export const untilSound = (target: NativeTarget, accept: (view: SoundView) => boolean, what: string, timeout = 10_000): Promise<SoundView> =>
  until(() => target.evaluate(soundView), accept, what, timeout);
