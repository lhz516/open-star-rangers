import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { readSoundPayload, soundChannelData, SOUND_PAYLOAD_SCHEMA_VERSION, type SoundPayload } from '../../content/sound-payload.ts';
import {
  defaultVoiceParameters, mergeVoiceParameters, RepeatProgress, voiceNodeParameters, type VoiceNodeParameters, type VoiceParameters,
} from './voice-progress.ts';

export { AUDIO_RATE_LIMIT, type VoiceNodeParameters, type VoiceParameters } from './voice-progress.ts';

// DOM-free Web Audio playback (P2-08 S-08/S-09). The controller owns at most one context, created lazily in
// `unlock()`; its status follows the context's own state changes and the page's visibility, never awaited promises.
// `browser-audio-controller.ts` supplies the real capabilities; tests inject fakes.

/** Simultaneous voices at most; a resource guard only, not the original game's mixing channel count. */
export const AUDIO_VOICE_LIMIT = 8;

/** Ended voices whose end reason `voiceState` still reports, the most recent first; earlier ones are `unknown`. */
export const AUDIO_ENDED_HISTORY = 256;

/** Opaque buffer the capability creates and later plays; the controller never reads it. */
export type AudioBufferHandle = object;

export interface AudioVoicePort {
  /** Starts at once, or at context time `when`. */
  start(when?: number): void;
  /** Stops at once, or at context time `when`; a later call replaces a stop not yet reached. */
  stop(when?: number): void;
  disconnect(): void;
  /** Listens for the voice's natural or stopped end; returns the removal. */
  onEnded(listener: () => void): () => void;
  /** Applies new parameters from context time `when`; only voices created with parameters have it. */
  setParameters?(parameters: VoiceNodeParameters, when: number): void;
}

export interface AudioContextPort {
  /** The host context state, such as `suspended`, `running`, `interrupted` or `closed`. */
  readonly state: string;
  /** The context time in seconds, which scheduled starts and stops use. */
  readonly currentTime: number;
  /** Listens for context state changes; returns the removal. */
  onStateChange(listener: () => void): () => void;
  resume(): Promise<unknown>;
  suspend(): Promise<unknown>;
  close(): Promise<unknown>;
  /**
   * A voice playing `buffer` into the output, looping the whole buffer when asked; not yet started. Only with
   * `parameters` does it get parameter nodes, set to them before it is returned.
   */
  createVoice(buffer: AudioBufferHandle, loop: boolean, parameters?: VoiceNodeParameters): AudioVoicePort;
}

export interface AudioCapability {
  /** Creates the controller's one context; throws when the host has no usable Web Audio. */
  createContext(): AudioContextPort;
  /** Creates a buffer holding `channels` (one array per channel) at `sampleRate`; needs no context. */
  createBuffer(channels: readonly Float32Array[], sampleRate: number): AudioBufferHandle;
}

export type PageLifecycleEvent = 'visibilitychange' | 'pagehide' | 'pageshow';

export interface PageLifecycleHost {
  /** Whether the page is visible now. */
  visible(): boolean;
  /** Listens for one lifecycle event; returns the removal. */
  listen(type: PageLifecycleEvent, listener: () => void): () => void;
}

export interface AudioControllerOptions {
  readonly audio: AudioCapability;
  readonly lifecycle: PageLifecycleHost;
  /** Receives subscriber and listener or voice cleanup errors, which never change the controller's results. */
  readonly reportError: (error: unknown) => void;
}

export type AudioStatus = 'idle' | 'locked' | 'running' | 'suspended' | 'unavailable' | 'failed' | 'disposed';

export type AudioErrorCode =
  | 'audio-unavailable'
  | 'audio-locked'
  | 'audio-suspended'
  | 'audio-failed'
  | 'unknown-sound'
  | 'duplicate-sound'
  | 'invalid-sound-payload'
  | 'voice-limit'
  | 'disposed'
  | 'invalid-parameters'
  | 'unknown-voice'
  | 'fixed-parameters';

export interface AudioSnapshot {
  readonly status: AudioStatus;
  /** Registered sounds. */
  readonly loaded: number;
  /** Voices currently playing. */
  readonly voices: number;
}

/** One sound to register: the shape of a P2-01 `PayloadRecord` holding a schema 2 sound payload. */
export interface SoundRecord {
  readonly id: string;
  readonly schemaVersion: number;
  readonly bytes: Uint8Array;
}

export type LoadFailureCode = Extract<AudioErrorCode, 'invalid-sound-payload' | 'duplicate-sound' | 'audio-unavailable' | 'audio-failed' | 'disposed'>;
export type PlayFailureCode = Exclude<AudioErrorCode, 'duplicate-sound' | 'invalid-sound-payload' | 'unknown-voice' | 'fixed-parameters'>;

export type LoadResult =
  | { readonly status: 'loaded'; readonly count: number }
  /** `assetId` names the offending sound, or is null for a failure of the whole batch or an unreadable ID. */
  | { readonly status: 'failed'; readonly code: LoadFailureCode; readonly assetId: AssetId | null };

export type PlayResult =
  | { readonly status: 'started'; readonly voice: number }
  | { readonly status: 'rejected'; readonly code: PlayFailureCode };

export type UpdateResult =
  | { readonly status: 'updated' }
  | { readonly status: 'rejected'; readonly code: 'unknown-voice' | 'fixed-parameters' | 'invalid-parameters' | 'audio-failed' | 'disposed' };

/**
 * Why a voice ended: `natural` when it played out (a `repeat` voice's scheduled stop after its last pass too),
 * `stopped` by `stop` or `stopAll`, `preempted` by `stop(voice, 'preempted')`, and `released` when the controller ended
 * it itself (hiding, a browser suspension or interruption, a host close or failure, disposal).
 */
export type VoiceEnd = 'natural' | 'stopped' | 'preempted' | 'released';

export type VoiceState =
  | { readonly status: 'playing' }
  /** Kept while the context does not run. */
  | { readonly status: 'paused' }
  | { readonly status: 'ended'; readonly reason: VoiceEnd }
  /** Never started, or ended before the last `AUDIO_ENDED_HISTORY` ends. */
  | { readonly status: 'unknown' };

export interface AudioController {
  /** Call from a user gesture handler; returns the status after the call. */
  unlock(): AudioStatus;
  /** Registers the whole batch or nothing. */
  load(sounds: readonly SoundRecord[]): LoadResult;
  /**
   * Without `parameters` the voice is fixed: stored rate, full volume, both channels equal, and no parameter nodes. With
   * them, absent ones default to volume 127, pan 64 and the stored rate, applied before the voice starts.
   */
  play(id: string, parameters?: Partial<VoiceParameters>): PlayResult;
  /** Applies the given parameters to a live voice started with parameters, all or none. */
  update(voice: number, parameters: Partial<VoiceParameters>): UpdateResult;
  /** Reads a voice's state without touching the host. */
  voiceState(voice: number): VoiceState;
  /** Stops one voice, recording `reason` (`stopped` by default); false for an unknown or finished voice. */
  stop(voice: number, reason?: 'stopped' | 'preempted'): boolean;
  stopAll(): void;
  /** Frozen, and the same object until the next change. */
  getSnapshot(): AudioSnapshot;
  /** Calls `listener` after each snapshot change; returns the removal. Usable with `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

interface Sound {
  readonly buffer: AudioBufferHandle;
  readonly loop: boolean;
  readonly sampleRate: number;
  /** For a `repeat` sound, the source frames of its `plays` passes: its looping voice stops once it has played them. */
  readonly repeatFrames: number | null;
}

interface Voice {
  readonly port: AudioVoicePort;
  readonly removeEnded: () => void;
  readonly sampleRate: number;
  /** The parameters last applied, or null for a fixed voice. */
  parameters: VoiceParameters | null;
  /** A `repeat` voice's remaining passes, once scheduled. */
  progress: RepeatProgress | null;
}

const rejected = (code: PlayFailureCode): PlayResult => Object.freeze({ status: 'rejected', code });
const REJECTED_IN: Readonly<Record<Exclude<AudioStatus, 'running'>, PlayResult>> = Object.freeze({
  idle: rejected('audio-locked'),
  locked: rejected('audio-locked'),
  suspended: rejected('audio-suspended'),
  unavailable: rejected('audio-unavailable'),
  failed: rejected('audio-failed'),
  disposed: rejected('disposed'),
});
const UNKNOWN_SOUND = rejected('unknown-sound');
const VOICE_LIMIT = rejected('voice-limit');
const INVALID_PARAMETERS = rejected('invalid-parameters');

const UPDATED: UpdateResult = Object.freeze({ status: 'updated' });
const updateRejected = (code: Extract<UpdateResult, { status: 'rejected' }>['code']): UpdateResult => Object.freeze({ status: 'rejected', code });
const UPDATE_REJECTED = Object.freeze({
  unknownVoice: updateRejected('unknown-voice'),
  fixed: updateRejected('fixed-parameters'),
  invalid: updateRejected('invalid-parameters'),
  failed: updateRejected('audio-failed'),
  disposed: updateRejected('disposed'),
});

const PLAYING: VoiceState = Object.freeze({ status: 'playing' });
const PAUSED: VoiceState = Object.freeze({ status: 'paused' });
const UNKNOWN_VOICE: VoiceState = Object.freeze({ status: 'unknown' });
const ENDED: Readonly<Record<VoiceEnd, VoiceState>> = Object.freeze({
  natural: Object.freeze({ status: 'ended', reason: 'natural' }),
  stopped: Object.freeze({ status: 'ended', reason: 'stopped' }),
  preempted: Object.freeze({ status: 'ended', reason: 'preempted' }),
  released: Object.freeze({ status: 'ended', reason: 'released' }),
});

const loadFailure = (code: LoadFailureCode, assetId: AssetId | null = null): LoadResult => Object.freeze({ status: 'failed', code, assetId });

/** Ignores a host promise's rejection: status follows `statechange`, never the promise. */
const settle = (promise: Promise<unknown>): void => { promise.catch(() => undefined); };

class Controller implements AudioController {
  readonly #audio: AudioCapability;
  readonly #reportError: (error: unknown) => void;
  readonly #sounds = new Map<string, Sound>();
  readonly #voices = new Map<number, Voice>();
  /** The end reasons of the most recently ended voices, oldest first. */
  readonly #ended = new Map<number, VoiceEnd>();
  readonly #subscribers = new Set<() => void>();
  readonly #cleanups: (() => void)[] = [];
  #context: AudioContextPort | null = null;
  #status: AudioStatus = 'idle';
  #hidden = false;
  /** The controller itself suspended a running context for hiding, so showing the page resumes it. */
  #suspendedForHiding = false;
  #nextVoice = 1;
  #snapshot: AudioSnapshot = Object.freeze({ status: 'idle', loaded: 0, voices: 0 });

  constructor({ audio, lifecycle, reportError }: AudioControllerOptions) {
    this.#audio = audio;
    this.#reportError = reportError;
    try {
      // One push per registration, so a later failure still removes the earlier ones.
      this.#cleanups.push(lifecycle.listen('visibilitychange', () => (lifecycle.visible() ? this.#show() : this.#hide())));
      this.#cleanups.push(lifecycle.listen('pagehide', () => this.#hide()));
      this.#cleanups.push(lifecycle.listen('pageshow', () => { if (lifecycle.visible()) this.#show(); }));
      this.#hidden = !lifecycle.visible();
    } catch (error) {
      this.#removeListeners();
      throw error;
    }
  }

  unlock(): AudioStatus {
    if (this.#hidden || ['running', 'unavailable', 'failed', 'disposed'].includes(this.#status)) return this.#status;
    if (this.#context === null) {
      try {
        this.#context = this.#audio.createContext();
      } catch {
        this.#setStatus('unavailable');
        return this.#status;
      }
      if (!this.#host(context => { this.#cleanups.push(context.onStateChange(() => this.#follow())); })) return this.#status;
      this.#follow();
      if (this.#status !== 'locked') return this.#status;
    }
    this.#suspendedForHiding = false;
    this.#host(context => settle(context.resume()));
    return this.#status;
  }

  load(sounds: readonly SoundRecord[]): LoadResult {
    if (this.#status === 'disposed') return loadFailure('disposed');
    if (this.#status === 'unavailable') return loadFailure('audio-unavailable');
    if (this.#status === 'failed') return loadFailure('audio-failed');
    // Every record is checked before any buffer is made, so a late bad record wastes no decoding.
    const payloads = new Map<AssetId, SoundPayload>();
    for (const { id, schemaVersion, bytes } of sounds) {
      let assetId: AssetId;
      try {
        assetId = readAssetId(id);
      } catch {
        return loadFailure('invalid-sound-payload');
      }
      if (this.#sounds.has(assetId) || payloads.has(assetId)) return loadFailure('duplicate-sound', assetId);
      if (assetId.split('/')[0] !== 'sound' || schemaVersion !== SOUND_PAYLOAD_SCHEMA_VERSION) return loadFailure('invalid-sound-payload', assetId);
      try {
        payloads.set(assetId, readSoundPayload(bytes));
      } catch {
        return loadFailure('invalid-sound-payload', assetId);
      }
    }
    const batch = new Map<AssetId, Sound>();
    for (const [assetId, payload] of payloads) {
      try {
        // The float copies are the controller's own, so the caller's bytes are never kept, changed or transferred.
        batch.set(assetId, {
          buffer: this.#audio.createBuffer(soundChannelData(payload), payload.sampleRate),
          loop: payload.loop !== 'none',
          sampleRate: payload.sampleRate,
          repeatFrames: payload.loop === 'repeat' ? payload.plays * payload.frames : null,
        });
      } catch {
        this.#fail();
        return loadFailure('audio-failed', assetId);
      }
    }
    for (const [id, sound] of batch) this.#sounds.set(id, sound);
    this.#publish();
    return Object.freeze({ status: 'loaded', count: batch.size });
  }

  play(id: string, parameters?: Partial<VoiceParameters>): PlayResult {
    if (this.#status !== 'running') return REJECTED_IN[this.#status];
    const sound = this.#sounds.get(id);
    if (!sound) return UNKNOWN_SOUND;
    const initial = parameters === undefined ? null : mergeVoiceParameters(defaultVoiceParameters(sound.sampleRate), parameters);
    if (parameters !== undefined && initial === null) return INVALID_PARAMETERS;
    if (this.#voices.size >= AUDIO_VOICE_LIMIT) return VOICE_LIMIT;
    const voice = this.#nextVoice++;
    const started = this.#host(context => {
      // A fixed voice gets no parameters, so the capability creates no parameter nodes for it.
      const nodes = initial === null ? undefined : voiceNodeParameters(initial, sound.sampleRate);
      const port = context.createVoice(sound.buffer, sound.loop, nodes);
      let removeEnded: () => void;
      try {
        removeEnded = port.onEnded(() => { this.#end(voice, 'natural'); this.#publish(); });
      } catch (error) {
        // Not yet a voice the failure below releases, so its nodes are disconnected here.
        this.#attempt(() => port.disconnect());
        throw error;
      }
      const entry: Voice = { port, removeEnded, sampleRate: sound.sampleRate, parameters: initial, progress: null };
      this.#voices.set(voice, entry);
      if (sound.repeatFrames === null) {
        port.start();
      } else {
        // Start and stop from one context time, so the looping voice ends after exactly its passes when it starts on
        // time; start()'s duration argument is not used, since engines disagree on it for a looping source.
        const when = context.currentTime;
        entry.progress = new RepeatProgress(sound.repeatFrames, sound.sampleRate, when, nodes?.playbackRate ?? 1);
        port.start(when);
        port.stop(entry.progress.stopTime());
      }
    });
    if (!started) return REJECTED_IN.failed;
    this.#publish();
    return Object.freeze({ status: 'started', voice });
  }

  update(voice: number, parameters: Partial<VoiceParameters>): UpdateResult {
    if (this.#status === 'disposed') return UPDATE_REJECTED.disposed;
    const entry = this.#voices.get(voice);
    if (!entry) return UPDATE_REJECTED.unknownVoice;
    if (entry.parameters === null) return UPDATE_REJECTED.fixed;
    const next = mergeVoiceParameters(entry.parameters, parameters);
    if (next === null) return UPDATE_REJECTED.invalid;
    const { volume, pan, rate } = entry.parameters;
    // Unchanged values need no host call, so a per-frame caller adds no automation events.
    if (next.volume === volume && next.pan === pan && next.rate === rate) return UPDATED;
    const nodes = voiceNodeParameters(next, entry.sampleRate);
    const applied = this.#host(context => {
      const now = context.currentTime;
      entry.port.setParameters!(nodes, now);
      // The passes left are counted in source frames, so a new stop replaces the old one at a new rate.
      const stop = entry.progress?.retarget(now, nodes.playbackRate) ?? null;
      if (stop !== null) entry.port.stop(stop);
    });
    if (!applied) return UPDATE_REJECTED.failed;
    entry.parameters = next;
    return UPDATED;
  }

  voiceState(voice: number): VoiceState {
    if (this.#voices.has(voice)) return this.#status === 'running' ? PLAYING : PAUSED;
    const reason = this.#ended.get(voice);
    return reason === undefined ? UNKNOWN_VOICE : ENDED[reason];
  }

  stop(voice: number, reason: 'stopped' | 'preempted' = 'stopped'): boolean {
    if (!this.#voices.has(voice)) return false;
    this.#end(voice, reason);
    this.#publish();
    return true;
  }

  stopAll(): void {
    this.#endAll('stopped');
    this.#publish();
  }

  getSnapshot(): AudioSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    if (this.#status === 'disposed') return () => undefined;
    const subscription = () => listener();
    this.#subscribers.add(subscription);
    return () => { this.#subscribers.delete(subscription); };
  }

  dispose(): void {
    if (this.#status === 'disposed') return;
    // The status changes first, so nothing a subscriber or host callback does during disposal can start or re-dispose.
    this.#status = 'disposed';
    this.#endAll('released');
    this.#removeListeners();
    this.#sounds.clear();
    this.#publish();
    this.#subscribers.clear();
    // Never creates a context to dispose it, and closes an open one exactly once.
    const context = this.#context;
    if (context && context.state !== 'closed') {
      try {
        settle(context.close());
      } catch (error) {
        this.#reportError(error);
      }
    }
  }

  /** Follows the context state: `running` unless hidden, a lock before the first run, a suspension, or a failure once closed. */
  #follow(): void {
    const context = this.#context;
    if (!context || this.#status === 'disposed' || this.#status === 'failed') return;
    let state: string;
    try {
      state = context.state;
    } catch {
      this.#fail();
      return;
    }
    if (state === 'closed') {
      this.#fail();
    } else if (state === 'running') {
      if (!this.#hidden) {
        this.#setStatus('running');
        return;
      }
      // A late resume after hiding: suspend again, so no voice can start while hidden.
      this.#suspendedForHiding = true;
      this.#leaveRunning('suspended');
      this.#host(port => settle(port.suspend()));
    } else if (this.#status === 'running') {
      // Suspended or interrupted by the browser, not the controller: nothing replays afterwards.
      this.#leaveRunning('suspended');
    } else if (this.#status === 'idle') {
      this.#setStatus('locked');
    }
  }

  #hide(): void {
    this.#hidden = true;
    if (this.#status !== 'running') return;
    this.#suspendedForHiding = true;
    this.#leaveRunning('suspended');
    this.#host(context => settle(context.suspend()));
  }

  #show(): void {
    this.#hidden = false;
    if (!this.#suspendedForHiding || this.#status !== 'suspended') return;
    this.#suspendedForHiding = false;
    this.#host(context => settle(context.resume()));
  }

  /** Runs a host operation on the context, which every caller has; a synchronous throw fails the controller. */
  #host(operation: (context: AudioContextPort) => void): boolean {
    try {
      operation(this.#context!);
      return true;
    } catch {
      this.#fail();
      return false;
    }
  }

  #fail(): void {
    this.#leaveRunning('failed');
  }

  /**
   * Changes the status before stopping any voice, so a subscriber reacting to the change can no longer start one, then
   * publishes once. Voices exist only while running, so every status change away from it goes through here.
   */
  #leaveRunning(status: 'suspended' | 'failed'): void {
    this.#status = status;
    this.#endAll('released');
    this.#publish();
  }

  #endAll(reason: VoiceEnd): void {
    for (const voice of this.#voices.keys()) this.#end(voice, reason);
  }

  /**
   * Stops (unless it ended by itself) and disconnects a voice, drops it and records its first end reason; the caller
   * publishes the change.
   */
  #end(voice: number, reason: VoiceEnd): void {
    const entry = this.#voices.get(voice);
    if (!entry) return;
    this.#voices.delete(voice);
    this.#ended.set(voice, reason);
    // A handle ends once and maps keep insertion order, so the first key is the oldest end.
    if (this.#ended.size > AUDIO_ENDED_HISTORY) this.#ended.delete(this.#ended.keys().next().value!);
    if (reason !== 'natural') this.#attempt(() => entry.port.stop());
    this.#attempt(() => entry.port.disconnect());
    this.#attempt(entry.removeEnded);
  }

  #removeListeners(): void {
    for (const cleanup of this.#cleanups.splice(0)) this.#attempt(cleanup);
  }

  /** Runs a cleanup step whatever an earlier one did, reporting its failure. */
  #attempt(step: () => void): void {
    try {
      step();
    } catch (error) {
      this.#reportError(error);
    }
  }

  #setStatus(status: AudioStatus): void {
    this.#status = status;
    this.#publish();
  }

  #publish(): void {
    const { status, loaded, voices } = this.#snapshot;
    if (status === this.#status && loaded === this.#sounds.size && voices === this.#voices.size) return;
    this.#snapshot = Object.freeze({ status: this.#status, loaded: this.#sounds.size, voices: this.#voices.size });
    // A subscriber removed during the notification, including by dispose, is skipped.
    for (const subscriber of [...this.#subscribers]) {
      if (this.#subscribers.has(subscriber)) this.#attempt(subscriber);
    }
  }
}

export function createAudioController(options: AudioControllerOptions): AudioController {
  return new Controller(options);
}
