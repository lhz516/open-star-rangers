import type { AssetId } from '../../content/asset-id.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { readPayloadRecords, type PayloadRecord } from '../../content/payload.ts';
import {
  createAudioController, type AudioCapability, type AudioContextPort, type AudioController, type AudioStatus, type AudioVoicePort,
  type LoadResult, type PageLifecycleHost, type PlayFailureCode,
} from '../../platform/audio/audio-controller.ts';
import type { HeldGroup } from '../resources/resource-holder.ts';

// The viewer's audition (P2-11 S-08, S-12): the held package's sounds behind the P2-08 controller, which does not queue
// playback. A trusted click unlocks the controller and keeps one pending audition, played once when the controller runs;
// stopping, hiding the page, cancelling and disposal drop it. Closing the audio context is observed through the
// capability the viewer wraps, never inferred from the controller's own snapshot.

/** How the audio context ended when the viewer audio was disposed. */
export type AudioCloseOutcome =
  | { readonly status: 'no-context' }
  | { readonly status: 'closed' }
  | { readonly status: 'close-failed'; readonly cause: unknown };

/** One sound of the held `audio` group: its Asset ID and slice role. */
export interface ViewerSound {
  readonly id: AssetId;
  readonly role: string;
}

export type AuditionResult =
  | { readonly status: 'started' }
  /** The controller is unlocking; the sound plays once when it runs, unless the audition is dropped first. */
  | { readonly status: 'pending' }
  | { readonly status: 'rejected'; readonly code: PlayFailureCode };

export interface ViewerAudioSnapshot {
  readonly status: AudioStatus;
  /** Every sound of the held `audio` group in Asset ID order; empty without one. */
  readonly sounds: readonly ViewerSound[];
  /** The result of loading the sounds; null without an `audio` group. */
  readonly load: LoadResult | null;
  /** The sound awaiting a running controller, or null. */
  readonly pending: AssetId | null;
  /** Voices playing now. */
  readonly voices: number;
}

export interface ViewerAudio {
  /** Call from a trusted click: unlocks, then plays `id` now or once the controller runs. */
  audition(id: string): AuditionResult;
  /** Stops the voices this viewer started for `id` and drops the pending audition. */
  stop(id: string): void;
  /** Stops every voice and drops the pending audition. */
  stopAll(): void;
  /** Drops the pending audition, as when the viewer is left or the package is replaced. */
  cancelPending(): void;
  /** Frozen, and the same object until the next change; bound, as `subscribe` is. */
  getSnapshot(): ViewerAudioSnapshot;
  subscribe(listener: () => void): () => void;
  /** Releases the controller and resolves with how the audio context closed. Repeatable; the same promise each time. */
  dispose(): Promise<AudioCloseOutcome>;
}

export interface ViewerAudioOptions {
  readonly capability: AudioCapability;
  readonly lifecycle: PageLifecycleHost;
  readonly reportError: (error: unknown) => void;
}

const NO_CONTEXT: AudioCloseOutcome = Object.freeze({ status: 'no-context' });
const CLOSED: AudioCloseOutcome = Object.freeze({ status: 'closed' });
const closeFailed = (cause: unknown): AudioCloseOutcome => Object.freeze({ status: 'close-failed', cause });
const STARTED: AuditionResult = Object.freeze({ status: 'started' });
const PENDING: AuditionResult = Object.freeze({ status: 'pending' });
const rejected = (code: PlayFailureCode): AuditionResult => Object.freeze({ status: 'rejected', code });
/** Statuses from which the controller may still reach `running` after an unlock. */
const UNLOCKING = new Set<AudioStatus>(['idle', 'locked', 'suspended']);

interface ObservedCapability {
  readonly capability: AudioCapability;
  /** How the context closed, once the controller was disposed. */
  readonly outcome: () => Promise<AudioCloseOutcome>;
  /** The voice port the controller created last, taken once; the controller creates one per started `play()`. */
  readonly takeVoice: () => AudioVoicePort | null;
}

/**
 * Wraps a capability so the outcome of its context's `close()` is recorded (settled, rejected or thrown) and each new
 * voice port can be observed. A context the host had already closed, which the controller does not close again,
 * counts as closed.
 */
function observeCapability(capability: AudioCapability): ObservedCapability {
  let context: AudioContextPort | null = null;
  let closing: Promise<AudioCloseOutcome> | null = null;
  let voice: AudioVoicePort | null = null;
  const observed: AudioCapability = {
    createBuffer: (channels, sampleRate) => capability.createBuffer(channels, sampleRate),
    createContext: () => {
      const inner = capability.createContext();
      context = inner;
      return {
        get state() { return inner.state; },
        onStateChange: listener => inner.onStateChange(listener),
        resume: () => inner.resume(),
        suspend: () => inner.suspend(),
        createVoice: (buffer, loop) => (voice = inner.createVoice(buffer, loop)),
        close: () => {
          try {
            const result = inner.close();
            closing = result.then(() => CLOSED, closeFailed);
            return result;
          } catch (cause) {
            closing = Promise.resolve(closeFailed(cause));
            throw cause;
          }
        },
      };
    },
  };
  const outcome = (): Promise<AudioCloseOutcome> => {
    if (closing) return closing;
    if (context === null) return Promise.resolve(NO_CONTEXT);
    return Promise.resolve(context.state === 'closed' ? CLOSED : closeFailed(new Error('the audio context was not closed')));
  };
  const takeVoice = (): AudioVoicePort | null => {
    const taken = voice;
    voice = null;
    return taken;
  };
  return { capability: observed, outcome, takeVoice };
}

/** The sounds of a complete `audio` group, in its manifest's Asset ID order, with their payload records. */
function audioSounds(group: HeldGroup | null): { readonly sounds: readonly ViewerSound[]; readonly records: readonly PayloadRecord[] } {
  if (group === null) return { sounds: Object.freeze([]), records: [] };
  const assets = readGroupManifest(group.manifest, 'groups.audio.manifest').assets.filter(({ kind }) => kind === 'sound');
  const payloads = new Map(readPayloadRecords(group.payloads, 'groups.audio.payloads').map(record => [record.id, record]));
  return {
    sounds: Object.freeze(assets.map(({ id, role }) => Object.freeze({ id, role }))),
    // A complete group holds a payload for every Asset.
    records: assets.map(({ id }) => payloads.get(id)!),
  };
}

class Audio implements ViewerAudio {
  readonly #controller: AudioController;
  readonly #lifecycle: PageLifecycleHost;
  readonly #reportError: (error: unknown) => void;
  readonly #outcome: () => Promise<AudioCloseOutcome>;
  readonly #takeVoice: () => AudioVoicePort | null;
  readonly #sounds: readonly ViewerSound[];
  readonly #known: ReadonlySet<string>;
  readonly #load: LoadResult | null;
  readonly #listeners = new Set<{ readonly listener: () => void }>();
  readonly #cleanups: (() => void)[] = [];
  /** Voices this viewer started: their sound and the removal of the end listener that drops them when they end. */
  readonly #voices = new Map<number, { readonly id: string; readonly removeEnded: () => void }>();
  #pending: AssetId | null = null;
  /** While the controller plays, its own notification must not publish a voice this viewer has not recorded yet. */
  #playing = false;
  #snapshot: ViewerAudioSnapshot;
  #disposed: Promise<AudioCloseOutcome> | null = null;

  constructor({ capability, lifecycle, reportError }: ViewerAudioOptions, group: HeldGroup | null) {
    this.#lifecycle = lifecycle;
    this.#reportError = reportError;
    const observed = observeCapability(capability);
    this.#outcome = observed.outcome;
    this.#takeVoice = observed.takeVoice;
    this.#controller = createAudioController({ audio: observed.capability, lifecycle, reportError });
    const { sounds, records } = audioSounds(group);
    this.#sounds = sounds;
    this.#known = new Set(sounds.map(({ id }) => id));
    this.#load = group === null ? null : this.#controller.load(records);
    this.#snapshot = this.#build();
    try {
      this.#cleanups.push(this.#controller.subscribe(() => this.#changed()));
      this.#cleanups.push(lifecycle.listen('visibilitychange', () => { if (!lifecycle.visible()) this.cancelPending(); }));
      this.#cleanups.push(lifecycle.listen('pagehide', () => this.cancelPending()));
    } catch (error) {
      this.#release();
      this.#controller.dispose();
      throw error;
    }
  }

  audition(id: string): AuditionResult {
    if (this.#disposed) return rejected('disposed');
    if (!this.#known.has(id)) return rejected('unknown-sound');
    this.#pending = null;
    const status = this.#controller.unlock();
    if (status === 'running') return this.#play(id as AssetId);
    if (!UNLOCKING.has(status) || !this.#lifecycle.visible()) {
      this.#publish();
      const refusal = this.#controller.play(id);
      return refusal.status === 'rejected' ? refusal : rejected('audio-suspended');
    }
    this.#pending = id as AssetId;
    this.#publish();
    return PENDING;
  }

  stop(id: string): void {
    if (this.#disposed) return;
    this.#pending = null;
    for (const [voice, entry] of [...this.#voices]) {
      if (entry.id !== id) continue;
      this.#forget(voice);
      this.#controller.stop(voice);
    }
    this.#publish();
  }

  stopAll(): void {
    if (this.#disposed) return;
    this.#pending = null;
    this.#forgetAll();
    this.#controller.stopAll();
    this.#publish();
  }

  cancelPending(): void {
    if (this.#disposed || this.#pending === null) return;
    this.#pending = null;
    this.#publish();
  }

  // Bound, so React's useSyncExternalStore can take them as they are.
  readonly getSnapshot = (): ViewerAudioSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    const entry = { listener };
    this.#listeners.add(entry);
    return () => { this.#listeners.delete(entry); };
  };

  dispose(): Promise<AudioCloseOutcome> {
    if (!this.#disposed) {
      this.#pending = null;
      this.#forgetAll();
      this.#listeners.clear();
      this.#release();
      this.#controller.dispose();
      this.#disposed = this.#outcome();
      this.#snapshot = this.#build();
    }
    return this.#disposed;
  }

  /** Plays `id` now and records its voice before anyone hears of it, or reports the controller's refusal. */
  #play(id: AssetId): AuditionResult {
    this.#playing = true;
    let result: ReturnType<AudioController['play']>;
    try {
      result = this.#controller.play(id);
    } finally {
      this.#playing = false;
    }
    const port = this.#takeVoice();
    if (result.status === 'started' && port !== null) {
      const { voice } = result;
      let removeEnded = (): void => undefined;
      try {
        removeEnded = port.onEnded(() => {
          this.#forget(voice);
          this.#publish();
        });
      } catch (error) {
        this.#report(error);
      }
      this.#voices.set(voice, { id, removeEnded });
    }
    this.#publish();
    return result.status === 'started' ? STARTED : result;
  }

  /** Drops a voice's record and its end listener. */
  #forget(voice: number): void {
    const entry = this.#voices.get(voice);
    if (!entry) return;
    this.#voices.delete(voice);
    try {
      entry.removeEnded();
    } catch (error) {
      this.#report(error);
    }
  }

  #forgetAll(): void {
    for (const voice of [...this.#voices.keys()]) this.#forget(voice);
  }

  /** Follows the controller: a pending audition plays once it runs and is dropped if it never can. */
  #changed(): void {
    if (this.#disposed || this.#playing) return;
    const { status, voices } = this.#controller.getSnapshot();
    // Voices the controller released without an end event, as on hiding or failure, are no longer playing.
    if (voices === 0) this.#forgetAll();
    const pending = this.#pending;
    if (pending !== null && status === 'running') {
      this.#pending = null;
      this.#play(pending);
      return;
    }
    if (pending !== null && !UNLOCKING.has(status)) this.#pending = null;
    this.#publish();
  }

  #release(): void {
    for (const cleanup of this.#cleanups.splice(0)) {
      try {
        cleanup();
      } catch (error) {
        this.#report(error);
      }
    }
  }

  #build(): ViewerAudioSnapshot {
    const { status, voices } = this.#controller.getSnapshot();
    return Object.freeze({ status, sounds: this.#sounds, load: this.#load, pending: this.#pending, voices });
  }

  /** Publishes a changed snapshot; listeners are notified synchronously, and what they throw goes to `reportError`. */
  #publish(): void {
    const { status, voices } = this.#controller.getSnapshot();
    const current = this.#snapshot;
    if (status === current.status && this.#pending === current.pending && voices === current.voices) return;
    this.#snapshot = this.#build();
    for (const entry of [...this.#listeners]) {
      if (!this.#listeners.has(entry)) continue;
      try {
        entry.listener();
      } catch (error) {
        this.#report(error);
      }
    }
  }

  #report(error: unknown): void {
    try {
      this.#reportError(error);
    } catch {
      // A failing outlet must not break the audio or the other listeners either.
    }
  }
}

/** The audition of one held package: `group` is its complete `audio` group, or null without one. */
export function createViewerAudio(options: ViewerAudioOptions, group: HeldGroup | null): ViewerAudio {
  return new Audio(options, group);
}
