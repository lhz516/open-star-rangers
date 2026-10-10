import { chromium, type Browser, type CDPSession } from '@playwright/test';
import type { AudioController } from '../../src/platform/audio/audio-controller.ts';
import type * as SoundPayloadModule from '../../src/content/sound-payload.ts';
import type * as BrowserAudioModule from '../../src/platform/audio/browser-audio-controller.ts';
import { installBrowserProbes } from './browser-probes.ts';
import { installedBrowser } from './environment.ts';
import { nativeBrowser, NativeTarget, until } from './native-lifecycle.ts';

// P2-08 audio playback in real Chrome with code-generated synthetic samples only. Every page interaction goes through
// raw CDP `Runtime.evaluate`, which, unlike Playwright's evaluate, grants no user activation; clicks are trusted CDP input.

/** The autoplay policy that blocks Web Audio until a user activation; `user-gesture-required` does not (goal record). */
const AUTOPLAY_REQUIRES_ACTIVATION = '--autoplay-policy=document-user-activation-required';

/** One AudioContext in construction order, and the outcome of each `close()` call on it, in call order. */
export interface AudioContextRecord {
  readonly id: number;
  readonly state: string;
  readonly closes: readonly ('pending' | 'resolved' | 'rejected')[];
}

interface AudioProbe {
  /** States of every AudioContext the page constructed, in order. */
  contexts(): string[];
  /**
   * Every AudioContext with its `close()` outcomes. Chrome reports `closed` as soon as `close()` is called, so only a
   * resolved `close()` shows that closing finished.
   */
  records(): AudioContextRecord[];
  /** Every AudioBuffer constructed of at most `maxLength` frames: rate, length and exact channel samples. */
  buffers(maxLength: number): { sampleRate: number; length: number; channels: number[][] }[];
  /**
   * The largest absolute sample the destination tap of the newest context currently sees. A closed context renders
   * nothing, so its tap keeps the last frame; after closing, `routed()` and the context state are the evidence instead.
   */
  peak(): number;
  /** Application nodes still connected to a recorded destination. */
  routed(): number;
  /** Source nodes started so far, as each voice starts one; a short sound may already have ended. */
  started(): number;
  /** Native `visibilitychange` states in order, starting with the state at load. */
  visibility: string[];
}

declare global {
  interface Window {
    osrAudioProbe: AudioProbe;
    osrAudioTest: { controller: AudioController; unlocks: string[]; reported: string[]; listenersFrom: number };
  }
}

/**
 * Serialized before navigation. Records constructed contexts and buffers through constructor Proxies, and taps every
 * connection into a recorded destination with an analyser that plays nothing itself, so the output is observed unchanged.
 */
export function installAudioProbe(): void {
  const OriginalContext = window.AudioContext;
  const OriginalBuffer = window.AudioBuffer;
  const originalConnect = AudioNode.prototype.connect;
  const originalDisconnect = AudioNode.prototype.disconnect;
  const connectNode = originalConnect as (this: AudioNode, destination: AudioNode) => AudioNode;
  const originalClose = OriginalContext.prototype.close;
  const contexts: {
    context: AudioContext; analyser: AnalyserNode; data: Float32Array<ArrayBuffer>; closes: ('pending' | 'resolved' | 'rejected')[];
  }[] = [];
  const buffers: AudioBuffer[] = [];
  const routed = new Set<AudioNode>();
  let started = 0;
  // AudioBufferSourceNode has its own start (with offset and duration), so each prototype that owns one is wrapped.
  for (const prototype of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
    if (!Object.hasOwn(prototype, 'start')) continue;
    const originalStart = prototype.start as (...args: unknown[]) => void;
    prototype.start = function (this: AudioScheduledSourceNode, ...args: unknown[]): void {
      originalStart.apply(this, args);
      started++;
    };
  }
  window.AudioContext = new Proxy(OriginalContext, {
    construct(target, args: ConstructorParameters<typeof AudioContext>, newTarget: NewableFunction): object {
      const context = Reflect.construct(target, args, newTarget) as AudioContext;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      const mute = context.createGain();
      mute.gain.value = 0;
      connectNode.call(analyser, mute);
      connectNode.call(mute, context.destination);
      contexts.push({ context, analyser, data: new Float32Array(analyser.fftSize), closes: [] });
      return context;
    },
  });
  // Returns the same promise. Observing it also handles a rejection, which is recorded here instead of surfacing as
  // unhandled; the application settles every close itself.
  OriginalContext.prototype.close = function (this: AudioContext): Promise<void> {
    const promise = originalClose.call(this);
    const closes = contexts.find(({ context }) => context === this)?.closes;
    if (closes) {
      const call = closes.push('pending') - 1;
      promise.then(() => { closes[call] = 'resolved'; }, () => { closes[call] = 'rejected'; });
    }
    return promise;
  };
  window.AudioBuffer = new Proxy(OriginalBuffer, {
    construct(target, args: ConstructorParameters<typeof AudioBuffer>, newTarget: NewableFunction): object {
      const buffer = Reflect.construct(target, args, newTarget) as AudioBuffer;
      buffers.push(buffer);
      return buffer;
    },
  });
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]): unknown {
    const result: unknown = (originalConnect as (...values: unknown[]) => unknown).apply(this, args);
    const tap = contexts.find(({ context }) => args[0] === context.destination);
    if (tap) {
      connectNode.call(this, tap.analyser);
      routed.add(this);
    }
    return result;
  } as typeof AudioNode.prototype.connect;
  AudioNode.prototype.disconnect = function (this: AudioNode, ...args: unknown[]): void {
    (originalDisconnect as (...values: unknown[]) => void).apply(this, args);
    if (args.length === 0 || contexts.some(({ context }) => args[0] === context.destination)) routed.delete(this);
  } as typeof AudioNode.prototype.disconnect;
  const visibility = [document.visibilityState as string];
  document.addEventListener('visibilitychange', () => { visibility.push(document.visibilityState); });
  window.osrAudioProbe = {
    contexts: () => contexts.map(({ context }) => context.state),
    records: () => contexts.map(({ context, closes }, index) => ({ id: index + 1, state: context.state, closes: [...closes] })),
    buffers: maxLength => buffers.filter(buffer => buffer.length <= maxLength).map(buffer => ({
      sampleRate: buffer.sampleRate, length: buffer.length,
      channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) => [...buffer.getChannelData(channel)]),
    })),
    peak: () => {
      const newest = contexts.at(-1);
      if (!newest) return 0;
      newest.analyser.getFloatTimeDomainData(newest.data);
      return newest.data.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
    },
    routed: () => routed.size,
    started: () => started,
    visibility,
  };
}

/** Removes the AudioContext constructor before any module loads, as a browser without Web Audio. */
function removeAudioContext(): void {
  Reflect.deleteProperty(window, 'AudioContext');
}

/** Synthetic samples checked sample by sample: u8 mono, and s16le stereo frames (-32768, 32767), (16384, -16384), (0, 1). */
export const EXACT_SAMPLES = Object.freeze({ u8: [0, 64, 128, 192, 255], s16: [-32_768, 32_767, 16_384, -16_384, 0, 1] });
export const expectedU8 = EXACT_SAMPLES.u8.map(value => Math.fround((value - 128) / 128));
export const expectedS16 = [0, 1].map(channel => EXACT_SAMPLES.s16.filter((_, index) => index % 2 === channel).map(value => Math.fround(value / 32_768)));

/**
 * In the page: loads the production factory, creates the controller, loads the exact samples and two audible square
 * waves, and adds a button whose trusted click unlocks audio. Returns the load result and whether the page has had a
 * user activation. Serialized into the page, so it uses nothing from this module.
 */
export async function setUpAudioPage(exact: typeof EXACT_SAMPLES): Promise<{ loaded: unknown; activated: boolean }> {
  const load = <T>(path: string): Promise<T> => import(path) as Promise<T>;
  const [{ createBrowserAudioController }, { writeSoundPayload, SOUND_PAYLOAD_SCHEMA_VERSION: schemaVersion }] = await Promise.all([
    load<typeof BrowserAudioModule>('/src/platform/audio/browser-audio-controller.ts'),
    load<typeof SoundPayloadModule>('/src/content/sound-payload.ts'),
  ]);
  const listenersFrom = window.osrProbe.snapshot().sequence;
  const reported: string[] = [];
  const controller = createBrowserAudioController({ reportError: error => { reported.push(String(error)); } });
  const s16 = (values: readonly number[]) => {
    const bytes = new Uint8Array(values.length * 2);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setInt16(index * 2, value, true));
    return bytes;
  };
  // A square wave of amplitude 0.5: 25 frames low, 25 high, at 11025 Hz.
  const square = (frames: number) => Uint8Array.from({ length: frames }, (_, index) => (Math.floor(index / 25) % 2 ? 192 : 64));
  const loaded = controller.load([
    { id: 'sound/blip', schemaVersion, bytes: writeSoundPayload({ sampleRate: 11_025, channels: 1, encoding: 'u8', loop: 'none', pcm: square(5_500) }) },
    { id: 'sound/exact-s16', schemaVersion, bytes: writeSoundPayload({ sampleRate: 22_050, channels: 2, encoding: 's16le', loop: 'none', pcm: s16(exact.s16) }) },
    { id: 'sound/exact-u8', schemaVersion, bytes: writeSoundPayload({ sampleRate: 8_000, channels: 1, encoding: 'u8', loop: 'none', pcm: Uint8Array.from(exact.u8) }) },
    { id: 'sound/loop', schemaVersion, bytes: writeSoundPayload({ sampleRate: 11_025, channels: 1, encoding: 'u8', loop: 'whole', pcm: square(2_000) }) },
  ]);
  const unlocks: string[] = [];
  window.osrAudioTest = { controller, unlocks, reported, listenersFrom };
  const button = document.createElement('button');
  button.id = 'osr-audio-unlock';
  button.textContent = 'Unlock audio';
  button.style.cssText = 'position: fixed; left: 8px; top: 8px; z-index: 2147483647; width: 160px; height: 48px;';
  button.addEventListener('click', () => { unlocks.push(controller.unlock()); });
  document.body.append(button);
  return { loaded, activated: navigator.userActivation.hasBeenActive };
}

/** In the page: the controller snapshot, the probe's observations and the audio listeners the controller added. */
export function audioState() {
  const { controller, unlocks, reported, listenersFrom } = window.osrAudioTest;
  const listeners = window.osrProbe.snapshot().listeners.filter(entry => entry.addedAt > listenersFrom && entry.group !== 'test'
    && ['visibilitychange', 'pagehide', 'pageshow', 'statechange', 'ended'].includes(entry.type));
  return {
    ...controller.getSnapshot(), unlocks, reported, contexts: window.osrAudioProbe.contexts(), peak: window.osrAudioProbe.peak(),
    routed: window.osrAudioProbe.routed(),
    visibility: document.visibilityState, visibilityEvents: window.osrAudioProbe.visibility,
    activated: navigator.userActivation.hasBeenActive,
    activeListeners: listeners.filter(entry => entry.active).map(entry => entry.type), listenerTypes: listeners.map(entry => entry.type),
  };
}

interface AudioTargets {
  readonly browser: Browser;
  readonly root: CDPSession;
  readonly app: NativeTarget;
  readonly appId: string;
  /** A second tab in the same owned context, for real hiding; only in headed runs. */
  readonly alternateId: string | null;
}

/**
 * Launches an owned Chrome with the activation-requiring autoplay policy (headed for real page hiding), creates an
 * owned CDP context and tabs, loads the development origin with the probes, and disposes everything afterwards.
 */
export async function withAudioTargets(
  baseURL: string,
  options: { readonly headed?: boolean; readonly withoutAudioContext?: boolean },
  run: (targets: AudioTargets) => Promise<void>,
): Promise<void> {
  const browser = options.headed
    ? await nativeBrowser([AUTOPLAY_REQUIRES_ACTIVATION])
    : await chromium.launch({ ...installedBrowser(), args: [AUTOPLAY_REQUIRES_ACTIVATION] });
  let root: CDPSession | undefined;
  let contextId: string | undefined;
  let app: NativeTarget | undefined;
  try {
    root = await browser.newBrowserCDPSession();
    contextId = (await root.send('Target.createBrowserContext')).browserContextId;
    const appId = (await root.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId;
    const alternateId = options.headed ? (await root.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })).targetId : null;
    const session = await root.send('Target.attachToTarget', { targetId: appId, flatten: false });
    app = new NativeTarget(root, session.sessionId);
    for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await app.command(`${domain}.enable`);
    const scripts = [installBrowserProbes, installAudioProbe, ...(options.withoutAudioContext ? [removeAudioContext] : [])];
    await app.command('Page.addScriptToEvaluateOnNewDocument', { source: scripts.map(script => `(${script.toString()})();`).join('') });
    await app.command('Page.navigate', { url: baseURL });
    await root.send('Target.activateTarget', { targetId: appId });
    const target = app;
    await until(() => target.evaluate(() => document.readyState === 'complete' && 'osrAudioProbe' in window), ready => ready, 'Application load');
    await run({ browser, root, app, appId, alternateId });
  } finally {
    app?.dispose();
    try {
      if (root && contextId) await root.send('Target.disposeBrowserContext', { browserContextId: contextId });
    } finally {
      await browser.close();
    }
  }
}
