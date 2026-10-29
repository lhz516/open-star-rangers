import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import { readPayloadRecords, type PayloadRecord } from '../../content/payload.ts';
import {
  createAudioController, type AudioCapability, type AudioController, type AudioContextPort, type AudioSnapshot, type AudioStatus,
  type LoadFailureCode, type LoadResult, type PageLifecycleHost, type PlayResult, type UpdateResult, type VoiceParameters, type VoiceState,
} from '../../platform/audio/audio-controller.ts';
import type {
  MissionConsumerConnection, MissionOwnerConsumer, MissionOwnerContext, MissionRunContext, MissionSoundStatus,
} from '../mission/mission-owner.ts';
import type { HeldPackage, ResourceHolder } from '../resources/resource-holder.ts';
import type { GameSessionRun, GameSessionStatus } from '../session/game-session.ts';
import { attachRunAudio, type AudioPresentation, type FlightSoundDecision, type RunAudio } from './consumer.ts';
import { bindFlightSounds, FlightSoundPackageError, type FlightSoundContent } from './content.ts';

// The mission owner's flight sound (P3-04 spec, 任务音频接线（P3-14 的修订）and its D-02 supplement; P3-14 S-08, D2-01,
// D2-14; subtask 17): a `media` consumer holding the owner's one audio controller, created only once the slot's close
// barrier confirms every earlier owner's audio closed, with every sound of the bound package's `audio` group loaded once.
// Connecting binds the package's flight sounds and creates nothing; a continuation that finds the connection released
// or the package replaced creates nothing either. Each run gets its run-level consumer (`attachRunAudio`) with the
// current run's presentation module, which the flight consumer wired before it; the run's end, or the session's
// `completed`, `stopped` or `faulted` status, ends that run's sound. A paused session closes the controller's task
// pause gate in its status notification; only the owner's trusted activations unlock the controller and open the gate.
// Releasing disposes the controller and resolves once its context's close is confirmed, which the slot's barrier joins.
//
// Failures: a package whose sounds cannot be bound or loaded, a barrier that failed, a controller that cannot be created
// and an activation that threw show the sound as `failed`, are reported and leave the game running silently; a wrong
// presentation module is an assembly error that fails the start; a run's sound that could not be ended in a status
// notification fails that run's cleanup, and a failed or missing close rejects the release, both latching the slot.

export interface FlightAudioOptions {
  /** The owner's holder; the package it holds while the owner is created is the one the owner binds. */
  readonly holder: Pick<ResourceHolder, 'current'>;
  /** The host's audio, whose context `close()` the consumer observes. */
  readonly audio: AudioCapability;
  readonly lifecycle: PageLifecycleHost;
  /** The current run's presentation module: the flight consumer's `presentation()`, which `attachRun` checks. */
  readonly presentation: () => AudioPresentation | null;
  readonly reportError: (error: unknown) => void;
  /** Receives each sound decision, for the development sound log only. */
  readonly record?: (decision: FlightSoundDecision) => void;
}

/** The bound package's sounds could not be loaded: the controller's code and the offending Asset, never the bytes. */
export class FlightSoundLoadError extends Error {
  readonly code: LoadFailureCode;
  readonly assetId: AssetId | null;

  constructor(code: LoadFailureCode, assetId: AssetId | null) {
    super(`The flight sounds could not be loaded (${code}${assetId === null ? '' : ` at ${assetId}`})`);
    this.name = 'FlightSoundLoadError';
    this.code = code;
    this.assetId = assetId;
  }
}

/** The owner's audio context was not confirmed closed. */
export class FlightSoundCloseError extends Error {
  constructor(options?: ErrorOptions) {
    super('The flight sound context was not confirmed closed', options);
    this.name = 'FlightSoundCloseError';
  }
}

const STATUS: Readonly<Record<AudioStatus, MissionSoundStatus>> = Object.freeze({
  idle: 'needs-activation',
  locked: 'needs-activation',
  running: 'available',
  paused: 'paused',
  suspended: 'host-suspended',
  unavailable: 'unavailable',
  failed: 'failed',
  disposed: 'unavailable',
});

/** Phases that end a run's sound at once, before its exit (DW-11). */
const ENDING: ReadonlySet<GameSessionStatus['phase']> = new Set(['completed', 'stopped', 'faulted']);
/** Phases in which an activation opens the task pause gate: the run is neither paused nor ended. */
const OPEN: ReadonlySet<GameSessionStatus['phase']> = new Set(['transition', 'running']);

type CloseOutcome = { readonly closed: true } | { readonly closed: false; readonly cause: unknown };

interface ObservedAudio {
  readonly capability: AudioCapability;
  /** How the context's close ended, once the controller was disposed; closed at once when none was created. */
  readonly outcome: () => Promise<CloseOutcome>;
}

/**
 * Wraps the capability so the outcome of its one context's `close()` is recorded: settled, rejected or thrown. A context
 * the host had already closed, which the controller does not close again, counts as closed.
 */
function observeClose(audio: AudioCapability): ObservedAudio {
  let context: AudioContextPort | null = null;
  let closing: Promise<CloseOutcome> | null = null;
  const capability: AudioCapability = {
    createBuffer: (channels, sampleRate) => audio.createBuffer(channels, sampleRate),
    createContext: () => {
      const inner = audio.createContext();
      context = inner;
      return {
        get state() { return inner.state; },
        get currentTime() { return inner.currentTime; },
        onStateChange: listener => inner.onStateChange(listener),
        resume: () => inner.resume(),
        suspend: () => inner.suspend(),
        createVoice: (buffer, loop, parameters) => inner.createVoice(buffer, loop, parameters),
        close: () => {
          try {
            const result = inner.close();
            closing = result.then(() => ({ closed: true }), (cause: unknown) => ({ closed: false, cause }));
            return result;
          } catch (cause) {
            closing = Promise.resolve({ closed: false, cause });
            throw cause;
          }
        },
      };
    },
  };
  const outcome = (): Promise<CloseOutcome> => {
    if (closing) return closing;
    if (context === null) return Promise.resolve({ closed: true });
    return Promise.resolve(context.state === 'closed' ? { closed: true } : { closed: false, cause: new Error('the audio context was not closed') });
  };
  return { capability, outcome };
}

const IDLE: AudioSnapshot = Object.freeze({ status: 'idle', loaded: 0, voices: 0 });
const FAILED: AudioSnapshot = Object.freeze({ status: 'failed', loaded: 0, voices: 0 });
const LOCKED_PLAY: PlayResult = Object.freeze({ status: 'rejected', code: 'audio-locked' });
const FAILED_PLAY: PlayResult = Object.freeze({ status: 'rejected', code: 'audio-failed' });
const UNKNOWN_VOICE: UpdateResult = Object.freeze({ status: 'rejected', code: 'unknown-voice' });
const UNKNOWN_STATE: VoiceState = Object.freeze({ status: 'unknown' });

/**
 * The owner's controller as each run's sound uses it, from the connection on: before the barrier lets the real one be
 * created it behaves as an idle controller (every play `audio-locked`), after a failure as a failed one, and from then
 * on it is the real controller, whose notifications it forwards. So a run wired before the barrier passes gets its
 * sound once the controller exists and is activated.
 */
class DeferredController implements AudioController {
  readonly #listeners = new Set<{ readonly listener: () => void }>();
  #real: AudioController | null = null;
  #failed = false;

  /** Uses `real` from now on; returns the removal of the forwarding. */
  attach(real: AudioController): () => void {
    this.#real = real;
    const stop = real.subscribe(() => { this.#notify(); });
    this.#notify();
    return stop;
  }

  fail(): void {
    this.#real = null;
    this.#failed = true;
    this.#notify();
  }

  unlock(): AudioStatus { return this.#real?.unlock() ?? this.getSnapshot().status; }
  load(): LoadResult { return Object.freeze({ status: 'failed', code: 'audio-unavailable', assetId: null }); }
  play(id: string, parameters?: Partial<VoiceParameters>): PlayResult {
    if (this.#real) return this.#real.play(id, parameters);
    return this.#failed ? FAILED_PLAY : LOCKED_PLAY;
  }
  update(voice: number, parameters: Partial<VoiceParameters>): UpdateResult { return this.#real?.update(voice, parameters) ?? UNKNOWN_VOICE; }
  voiceState(voice: number): VoiceState { return this.#real?.voiceState(voice) ?? UNKNOWN_STATE; }
  stop(voice: number, reason?: 'stopped' | 'preempted'): boolean { return this.#real?.stop(voice, reason) ?? false; }
  stopAll(): void { this.#real?.stopAll(); }
  pause(): AudioStatus { return this.#real?.pause() ?? this.getSnapshot().status; }
  resume(): AudioStatus { return this.#real?.resume() ?? this.getSnapshot().status; }
  getSnapshot(): AudioSnapshot { return this.#real?.getSnapshot() ?? (this.#failed ? FAILED : IDLE); }
  subscribe(listener: () => void): () => void {
    const entry = { listener };
    this.#listeners.add(entry);
    return () => { this.#listeners.delete(entry); };
  }
  /** The connection disposes the real controller itself. */
  dispose(): void { this.#listeners.clear(); }

  #notify(): void {
    for (const entry of [...this.#listeners]) if (this.#listeners.has(entry)) entry.listener();
  }
}

/** Every sound of the package's `audio` group, in manifest order, as payload records. */
function soundRecords(held: HeldPackage): readonly PayloadRecord[] {
  const group = held.groups.find(({ group: name }) => name === 'audio');
  if (!group) return [];
  const payloads = new Map(readPayloadRecords(group.payloads, 'groups.audio.payloads').map(record => [record.id, record]));
  return readGroupManifest(group.manifest, 'groups.audio.manifest').assets
    .filter(({ kind }) => kind === 'sound')
    // A complete group holds a payload for every Asset.
    .map(({ id }) => payloads.get(id)!);
}

/** One run's sound: its consumer, and a failure to end it in a status notification, rethrown by the run's cleanup. */
interface RunEntry {
  readonly runId: number;
  readonly audio: RunAudio;
  failure: { readonly cause: unknown } | null;
}

class OwnerSound implements MissionConsumerConnection {
  readonly #options: FlightAudioOptions;
  readonly #context: MissionOwnerContext;
  readonly #held: HeldPackage;
  /** Null when the package's sounds could not be bound: the owner's sound has failed. */
  readonly #content: FlightSoundContent | null = null;
  readonly #observed: ObservedAudio;
  readonly #port = new DeferredController();
  readonly #cleanups: (() => unknown)[] = [];
  #controller: AudioController | null = null;
  /** The liveness token of the barrier's continuation: false once released. */
  #live = true;
  #shown: MissionSoundStatus;
  #run: RunEntry | null = null;

  constructor(options: FlightAudioOptions, context: MissionOwnerContext) {
    this.#options = options;
    this.#context = context;
    const held = options.holder.current();
    if (held?.completeness.status !== 'complete') throw new TypeError('The flight sound needs the complete package the owner binds');
    this.#held = held;
    this.#observed = observeClose(options.audio);
    try {
      this.#content = bindFlightSounds(held, { generation: held.generation, identity: held.completeness.identity });
    } catch (error) {
      if (!(error instanceof ContentContractError || error instanceof FlightSoundPackageError)) throw error;
      this.#port.fail();
      this.#report(error);
    }
    this.#shown = this.sound();
    this.#cleanups.push(this.#port.subscribe(() => { this.#changed(); }));
    this.#cleanups.push(context.session.onStatus(status => this.#onStatus(status)));
    if (this.#content) {
      void context.previousClosed.then(closed => { this.#create(closed); }, (cause: unknown) => { this.#create(false, cause); });
    }
  }

  sound(): MissionSoundStatus {
    const { status } = this.#port.getSnapshot();
    return this.#controller || status === 'failed' ? STATUS[status] : 'waiting-close';
  }

  attachRun(run: GameSessionRun, { ownerId, runId }: MissionRunContext): void {
    const content = this.#content;
    if (!this.#live || !content) return;
    const audio = attachRunAudio(run, {
      ownerId, content, controller: this.#port, presentation: this.#options.presentation(), record: this.#options.record,
    });
    const entry: RunEntry = { runId, audio, failure: null };
    run.ownCleanup(() => {
      if (this.#run === entry) this.#run = null;
      if (entry.failure) throw entry.failure.cause;
      return undefined;
    });
    this.#run = entry;
  }

  onActivation(): void {
    const controller = this.#controller;
    if (!this.#live || !controller) return;
    controller.unlock();
    if (OPEN.has(this.#context.session.status().phase)) controller.resume();
  }

  release(): Promise<void> {
    this.#live = false;
    const failures: unknown[] = [];
    const attempt = (step: () => unknown): void => {
      try {
        step();
      } catch (error) {
        failures.push(error);
      }
    };
    for (const cleanup of this.#cleanups.splice(0)) attempt(cleanup);
    const run = this.#run;
    this.#run = null;
    // The session ended the run before the `media` stage; this only covers a run it could not end.
    if (run) attempt(() => { run.audio.invalidate(); });
    attempt(() => { this.#port.dispose(); });
    attempt(() => { this.#controller?.dispose(); });
    return this.#observed.outcome().then((result) => {
      if (failures.length > 1) throw new AggregateError(failures, 'The flight sound release failed', { cause: failures[0] });
      if (failures.length === 1) throw failures[0];
      if (!result.closed) throw new FlightSoundCloseError({ cause: result.cause });
    });
  }

  /** The barrier's continuation: creates and loads the controller unless released, replaced or latched. */
  #create(closed: boolean, cause?: unknown): void {
    if (!this.#live || this.#options.holder.current() !== this.#held) return;
    if (!closed) return this.#fail(cause);
    let controller: AudioController;
    try {
      controller = this.#loadedController();
    } catch (error) {
      return this.#fail(error);
    }
    this.#controller = controller;
    if (this.#context.session.status().phase === 'paused') controller.pause();
    // The port notifies the change, and forwards the controller's notifications from now on.
    this.#cleanups.push(this.#port.attach(controller));
  }

  /** A new controller with every sound of the bound package's `audio` group loaded; a load failure disposes it. */
  #loadedController(): AudioController {
    const { capability: audio } = this.#observed;
    const controller = createAudioController({ audio, lifecycle: this.#options.lifecycle, reportError: this.#options.reportError });
    try {
      const loaded = controller.load(soundRecords(this.#held));
      if (loaded.status !== 'loaded') throw new FlightSoundLoadError(loaded.code, loaded.assetId);
    } catch (error) {
      // Loading creates no context, so nothing is left to close.
      controller.dispose();
      throw error;
    }
    return controller;
  }

  #fail(cause: unknown): void {
    // A latched barrier was reported where it latched.
    if (cause !== undefined) this.#report(cause);
    this.#port.fail();
  }

  /** The session's status: the pause gate closes with a paused run, and the run's sound ends with it (DW-11). */
  #onStatus(status: GameSessionStatus): undefined {
    if (!this.#live) return;
    if (status.phase === 'paused') this.#controller?.pause();
    const run = this.#run;
    if (run && status.runId === run.runId && ENDING.has(status.phase)) {
      try {
        run.audio.invalidate();
      } catch (cause) {
        run.failure ??= { cause };
      }
    }
    return undefined;
  }

  /** Tells the owner when the status it shows changed; voice counts alone do not. */
  #changed(): void {
    const status = this.sound();
    if (!this.#live || status === this.#shown) return;
    this.#shown = status;
    this.#context.soundChanged?.();
  }

  #report(error: unknown): void {
    try {
      this.#options.reportError(error);
    } catch {
      // A failing outlet must not change the sound; there is no other.
    }
  }
}

/**
 * The flight sound's `media` consumer. Each connection is one owner's; the app wires it after the flight consumer, so
 * `presentation` gives the run's module when `attachRun` reads it.
 */
export function createFlightAudioConsumer(options: FlightAudioOptions): MissionOwnerConsumer<'media'> {
  return Object.freeze({ stage: 'media', connect: (context: MissionOwnerContext) => new OwnerSound(options, context) });
}
