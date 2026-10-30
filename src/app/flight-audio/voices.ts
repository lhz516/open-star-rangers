import type { AssetId } from '../../content/asset-id.ts';
import type { AudioController, PlayFailureCode, UpdateResult, VoiceEnd, VoiceParameters } from '../../platform/audio/audio-controller.ts';

// The flight sounds' voice allocation ledger (P3-14 S-04, AC-04; subtask 12): one run's model of the original's voice
// pool over the platform audio controller, with the classes, caps, reaping and preemption order of
// docs/original/formats/audio.md, "Voice pool and classes (A-03)". A voice holds its record, and counts in its class,
// from its start until a request reaps it after its end (one per request, the lowest record first), a query or stop of
// its handle finds it, or a preemption takes its record. Only a started voice takes a record and gets a handle.
//
// The original's class slot outlives its voice, so a preemption could take an idle record and run its class over its
// cap (the A-03 drift edge). It needs a count above the class's held records: allocation fills the lowest idle record
// and preemption takes the lowest record of its class, so from consistent counts every record holding the class's slot
// below its held records is held too, and a reap, stop or stop-all lowers the count with the record. Each ledger starts
// empty, so the counts here are the held records, and the lowest held record of the class is the record the original
// takes.
//
// Handles belong to this ledger, its owner and run: a handle whose voice has left its record, or another ledger's,
// never reaches a later voice. The ledger records each end reason when the controller notifies the end, so a release
// is told apart by the status that caused it. Its operations run one at a time: calling it from a controller
// subscriber while one runs throws. It keeps sources, classes and end reasons only: no samples, text or log.

/** The original's voice classes (A-03): 1 shots, 2 hits and explosions, 3 the timed list, 4 sounds by ID and HUD cues, 5 continuous sounds. */
export type VoiceClass = 1 | 2 | 3 | 4 | 5;

/** Each class's cap in flight (A-03); the caps sum to the pool. */
export const VOICE_CLASS_CAPS: Readonly<Record<VoiceClass, number>> = Object.freeze({ 1: 2, 2: 1, 3: 1, 4: 2, 5: 2 });

/** The original's voice records in flight (A-03); within the platform's `AUDIO_VOICE_LIMIT`. */
export const VOICE_POOL_SIZE = 8;

/** What a voice sounds for. Core entity IDs and presentation effect keys are separate namespaces. */
export type VoiceSource =
  /** A Core entity's model sound slot: 0 continuous, 1 gun and 2 missile (the shooter's), 3 and 4 hits (the victim's). */
  | { readonly namespace: 'entity'; readonly id: number; readonly slot: 0 | 1 | 2 | 3 | 4 }
  /** An explosion effect's EXPL sound, keyed by the presentation effect rather than a Core entity. */
  | { readonly namespace: 'effect'; readonly id: string }
  /** A HUD cue's voice: the lock tone's loop or pulse, or the instrument-9 warning's missile or craft voice. */
  | { readonly namespace: 'cue'; readonly cue: 'lock-loop' | 'lock-pulse' | 'instrument-9-missile' | 'instrument-9-craft' }
  /** A sound played by ID, whose voice nobody keeps. */
  | { readonly namespace: 'by-id' };

/**
 * Why a voice ended: `natural` when it played out, `preempted` by a request of its class, `stopped` by its handle, a
 * stop of every voice or disposal, `interrupted` when the controller released it but lives on (hiding, a browser
 * suspension or interruption), and `failed` when the controller released it on failing or being disposed.
 */
export type VoiceEndReason = 'natural' | 'preempted' | 'stopped' | 'interrupted' | 'failed';

/** A started voice's handle: its owner, run and the ledger's serial, never reused. The ledger knows it by identity. */
export interface VoiceHandle {
  readonly ownerId: number;
  readonly runId: number;
  readonly serial: number;
}

export interface VoiceRequest {
  readonly source: VoiceSource;
  readonly sound: AssetId;
  readonly voiceClass: VoiceClass;
  /** Whether a request finding its class at its cap takes the class's lowest record (A-03 step 4). */
  readonly preempt: boolean;
  /** As the controller's `play`: without them the voice is fixed and cannot be updated. */
  readonly parameters?: Partial<VoiceParameters>;
}

/** A voice a request took out of its record, with how it ended. */
export interface ReleasedVoice {
  readonly handle: VoiceHandle;
  readonly source: VoiceSource;
  readonly voiceClass: VoiceClass;
  readonly record: number;
  readonly reason: VoiceEndReason;
}

export type VoicePlayResult =
  | { readonly status: 'started'; readonly handle: VoiceHandle; readonly record: number; readonly reaped: ReleasedVoice | null; readonly preempted: ReleasedVoice | null }
  /** The pool's policy refused: the class is at its cap and the request does not preempt. Not a failure. */
  | { readonly status: 'refused'; readonly code: 'voice-limit'; readonly reaped: ReleasedVoice | null }
  /** The controller did not start the voice, or the ledger was disposed; a preempted voice stays released. */
  | { readonly status: 'failed'; readonly code: PlayFailureCode; readonly reaped: ReleasedVoice | null; readonly preempted: ReleasedVoice | null };

export type VoiceHandleState =
  | { readonly status: 'playing' }
  /** Kept while the controller does not run. */
  | { readonly status: 'paused' }
  | { readonly status: 'ended'; readonly reason: VoiceEndReason }
  /** Not a handle this ledger gave. */
  | { readonly status: 'unknown' };

export interface VoiceLedgerOptions {
  readonly controller: AudioController;
  readonly ownerId: number;
  readonly runId: number;
}

export interface VoiceLedger {
  /** Allocates a record by A-03 and starts the sound in it. */
  play(request: VoiceRequest): VoicePlayResult;
  /** The handle's state (A-03 `0x53b54`): a voice found ended leaves its record; later queries repeat its end reason. */
  query(handle: VoiceHandle): VoiceHandleState;
  /** Applies parameters to the handle's voice while it sounds; `unknown-voice` once it has ended. */
  update(handle: VoiceHandle, parameters: Partial<VoiceParameters>): UpdateResult;
  /** Stops the handle's voice and frees its record (A-03 `0x53dbc`); false when the handle holds no record. */
  stop(handle: VoiceHandle): boolean;
  /** Stops every voice and frees every record (A-03 `0x53978`). */
  stopAll(): void;
  /** The records each class holds, ended voices not yet reaped included. */
  counts(): Readonly<Record<VoiceClass, number>>;
  /** Stops every voice and stops listening; afterwards requests fail with `disposed` and handles keep their end reasons. */
  dispose(): void;
}

interface Voice {
  readonly handle: VoiceHandle;
  readonly source: VoiceSource;
  readonly voiceClass: VoiceClass;
  readonly record: number;
  /** The controller's voice. */
  readonly id: number;
  /** Set once: when the voice is first seen ended, or when the ledger ends it. */
  reason: VoiceEndReason | null;
}

const PLAYING: VoiceHandleState = Object.freeze({ status: 'playing' });
const PAUSED: VoiceHandleState = Object.freeze({ status: 'paused' });
const UNKNOWN: VoiceHandleState = Object.freeze({ status: 'unknown' });
const ENDED: Readonly<Record<VoiceEndReason, VoiceHandleState>> = Object.freeze({
  natural: Object.freeze({ status: 'ended', reason: 'natural' }),
  preempted: Object.freeze({ status: 'ended', reason: 'preempted' }),
  stopped: Object.freeze({ status: 'ended', reason: 'stopped' }),
  interrupted: Object.freeze({ status: 'ended', reason: 'interrupted' }),
  failed: Object.freeze({ status: 'ended', reason: 'failed' }),
});
const UNKNOWN_VOICE: UpdateResult = Object.freeze({ status: 'rejected', code: 'unknown-voice' });

class Ledger implements VoiceLedger {
  readonly #controller: AudioController;
  readonly #ownerId: number;
  readonly #runId: number;
  /** The voice holding each record, or null for an idle one. */
  readonly #records: (Voice | null)[] = Array<Voice | null>(VOICE_POOL_SIZE).fill(null);
  readonly #handles = new WeakMap<VoiceHandle, Voice>();
  readonly #unsubscribe: () => void;
  #serial = 0;
  #disposed = false;
  /** An operation is running; the controller's synchronous notifications must not start another. */
  #busy = false;

  constructor({ controller, ownerId, runId }: VoiceLedgerOptions) {
    this.#controller = controller;
    this.#ownerId = ownerId;
    this.#runId = runId;
    // The controller notifies every end as it happens, with the status that caused a release.
    this.#unsubscribe = controller.subscribe(() => this.#observeEnds());
  }

  play(request: VoiceRequest): VoicePlayResult {
    return this.#exclusive(() => this.#play(request));
  }

  query(handle: VoiceHandle): VoiceHandleState {
    return this.#exclusive(() => this.#query(handle));
  }

  update(handle: VoiceHandle, parameters: Partial<VoiceParameters>): UpdateResult {
    return this.#exclusive(() => this.#update(handle, parameters));
  }

  stop(handle: VoiceHandle): boolean {
    return this.#exclusive(() => this.#stop(handle));
  }

  stopAll(): void {
    this.#exclusive(() => this.#stopAll());
  }

  counts(): Readonly<Record<VoiceClass, number>> {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const voice of this.#records) if (voice) counts[voice.voiceClass] += 1;
    return Object.freeze(counts);
  }

  dispose(): void {
    this.#exclusive(() => {
      if (this.#disposed) return;
      this.#disposed = true;
      this.#stopAll();
      this.#unsubscribe();
    });
  }

  /** Runs one operation; a call from a controller subscriber during another is a wiring error, not a sound result. */
  #exclusive<T>(operation: () => T): T {
    if (this.#busy) throw new Error('The voice ledger was called again from within one of its own operations');
    this.#busy = true;
    try {
      return operation();
    } finally {
      this.#busy = false;
    }
  }

  #play({ source, sound, voiceClass, preempt, parameters }: VoiceRequest): VoicePlayResult {
    if (this.#disposed) return Object.freeze({ status: 'failed', code: 'disposed', reaped: null, preempted: null });
    this.#observeEnds();
    const reaped = this.#reapOne();
    let preempted: ReleasedVoice | null = null;
    let record: number;
    if (this.#count(voiceClass) < VOICE_CLASS_CAPS[voiceClass]) {
      // The caps sum to the pool, so a class below its cap always finds an idle record.
      record = this.#records.indexOf(null);
    } else {
      if (!preempt) return Object.freeze({ status: 'refused', code: 'voice-limit', reaped });
      record = this.#records.findIndex(voice => voice?.voiceClass === voiceClass);
      preempted = this.#release(this.#records[record]!, 'preempted');
    }
    const result = this.#controller.play(sound, parameters);
    if (result.status !== 'started') return Object.freeze({ status: 'failed', code: result.code, reaped, preempted });
    const handle: VoiceHandle = Object.freeze({ ownerId: this.#ownerId, runId: this.#runId, serial: ++this.#serial });
    const voice: Voice = { handle, source, voiceClass, record, id: result.voice, reason: null };
    this.#handles.set(handle, voice);
    this.#records[record] = voice;
    return Object.freeze({ status: 'started', handle, record, reaped, preempted });
  }

  #query(handle: VoiceHandle): VoiceHandleState {
    const voice = this.#handles.get(handle);
    if (!voice) return UNKNOWN;
    this.#observeEnds();
    if (voice.reason === null) return this.#controller.voiceState(voice.id).status === 'paused' ? PAUSED : PLAYING;
    if (this.#holds(voice)) this.#release(voice);
    return ENDED[voice.reason];
  }

  #update(handle: VoiceHandle, parameters: Partial<VoiceParameters>): UpdateResult {
    const voice = this.#handles.get(handle);
    if (!voice) return UNKNOWN_VOICE;
    this.#observeEnds();
    return voice.reason === null ? this.#controller.update(voice.id, parameters) : UNKNOWN_VOICE;
  }

  #stop(handle: VoiceHandle): boolean {
    const voice = this.#handles.get(handle);
    this.#observeEnds();
    if (!voice || !this.#holds(voice)) return false;
    this.#release(voice);
    return true;
  }

  #stopAll(): void {
    this.#observeEnds();
    for (const voice of this.#records) if (voice) this.#release(voice);
  }

  #count(voiceClass: VoiceClass): number {
    let count = 0;
    for (const voice of this.#records) if (voice?.voiceClass === voiceClass) count += 1;
    return count;
  }

  #holds(voice: Voice): boolean {
    return this.#records[voice.record] === voice;
  }

  /**
   * Records the end reason of each held voice the controller has ended: on its notification, while the status that
   * released a voice still holds, and again before each operation. Never calls the controller back.
   */
  #observeEnds(): void {
    for (const voice of this.#records) {
      if (!voice || voice.reason !== null) continue;
      const state = this.#controller.voiceState(voice.id);
      if (state.status === 'ended') voice.reason = this.#endReason(state.reason);
      // Every end is notified as it happens, so a voice the controller has already forgotten was lost to it.
      else if (state.status === 'unknown') voice.reason = 'failed';
    }
  }

  #endReason(end: VoiceEnd): VoiceEndReason {
    if (end !== 'released') return end;
    const { status } = this.#controller.getSnapshot();
    return status === 'failed' || status === 'disposed' ? 'failed' : 'interrupted';
  }

  /** Frees the lowest record whose voice has ended (A-03 step 1); a paused voice has not ended. */
  #reapOne(): ReleasedVoice | null {
    const voice = this.#records.find(voice => voice !== null && voice.reason !== null);
    return voice ? this.#release(voice) : null;
  }

  /** Frees the voice's record; a voice still sounding is ended with `reason`, an ended one keeps its own. */
  #release(voice: Voice, reason: 'preempted' | 'stopped' = 'stopped'): ReleasedVoice {
    this.#records[voice.record] = null;
    if (voice.reason === null) {
      voice.reason = reason;
      this.#controller.stop(voice.id, reason);
    }
    const { handle, source, voiceClass, record } = voice;
    return Object.freeze({ handle, source, voiceClass, record, reason: voice.reason });
  }
}

export function createVoiceLedger(options: VoiceLedgerOptions): VoiceLedger {
  return new Ledger(options);
}
