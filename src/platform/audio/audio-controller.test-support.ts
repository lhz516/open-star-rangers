import { writeSoundPayload, type SoundPayloadInput } from '../../content/sound-payload.ts';
import type {
  AudioBufferHandle, AudioCapability, AudioContextPort, AudioVoicePort, PageLifecycleEvent, PageLifecycleHost, VoiceNodeParameters,
} from './audio-controller.ts';

// Fakes of the audio controller's host capabilities, shared by the controller's tests and its app consumers' tests.

export class FakeVoice implements AudioVoicePort {
  /** `start`, `stop` and `set` (parameters), followed by the context time when one was given. */
  readonly calls: string[] = [];
  /** The parameter values applied before start, or null for a fixed voice without parameter nodes. */
  readonly initial: VoiceNodeParameters | null = null;
  readonly ended = new Set<() => void>();
  readonly buffer: AudioBufferHandle;
  readonly loop: boolean;
  failStop = false;
  failEnded = false;
  constructor(buffer: AudioBufferHandle, loop: boolean) {
    this.buffer = buffer;
    this.loop = loop;
  }
  start(when?: number): void { this.calls.push(when === undefined ? 'start' : `start ${when}`); }
  stop(when?: number): void {
    this.calls.push(when === undefined ? 'stop' : `stop ${when}`);
    if (this.failStop) throw new Error('stop failed');
  }
  disconnect(): void { this.calls.push('disconnect'); }
  onEnded(listener: () => void): () => void {
    if (this.failEnded) throw new Error('listen failed');
    this.ended.add(listener);
    return () => { this.ended.delete(listener); };
  }
  /** The host reports the end of playback. */
  end(): void { for (const listener of [...this.ended]) listener(); }
}

/** A voice created with parameters: it has parameter nodes, and records every later setting. */
export class FakeParameterVoice extends FakeVoice {
  override readonly initial: VoiceNodeParameters;
  /** Each `setParameters` call: the values and their context time. */
  readonly settings: { readonly parameters: VoiceNodeParameters; readonly when: number }[] = [];
  failSet = false;
  constructor(buffer: AudioBufferHandle, loop: boolean, initial: VoiceNodeParameters) {
    super(buffer, loop);
    this.initial = initial;
  }
  setParameters(parameters: VoiceNodeParameters, when: number): void {
    if (this.failSet) throw new Error('InvalidStateError');
    this.calls.push(`set ${when}`);
    this.settings.push({ parameters, when });
  }
}

export class FakeContext implements AudioContextPort {
  readonly calls: string[] = [];
  readonly voices: FakeVoice[] = [];
  readonly listeners = new Set<() => void>();
  failVoice = false;
  /** New voices cannot report their end. */
  failEnded = false;
  failListen = false;
  state: string;
  currentTime = 0;
  constructor(state: string) { this.state = state; }
  /** The host changes the context state and dispatches `statechange`. */
  setState(state: string): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
  onStateChange(listener: () => void): () => void {
    if (this.failListen) throw new Error('listen failed');
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  // Like a browser blocking autoplay, the promises never settle unless a test settles a suspension; tests drive the state.
  resume(): Promise<unknown> { this.calls.push('resume'); return new Promise(() => undefined); }
  /** Each `suspend()` call's settlement, in call order. */
  readonly suspensions: { readonly resolve: () => void; readonly reject: (error: unknown) => void }[] = [];
  /** `suspend()` throws synchronously. */
  failSuspend = false;
  suspend(): Promise<unknown> {
    this.calls.push('suspend');
    if (this.failSuspend) throw new DOMException('suspend threw', 'InvalidStateError');
    return new Promise((resolve, reject) => { this.suspensions.push({ resolve: () => resolve(undefined), reject }); });
  }
  /** What `close()` does: reject (the default), resolve, stay pending, or throw synchronously. */
  closing: 'reject' | 'resolve' | 'pending' | 'throw' = 'reject';
  close(): Promise<unknown> {
    this.calls.push('close');
    if (this.closing === 'throw') throw new Error('close threw');
    if (this.closing === 'pending') return new Promise(() => undefined);
    return this.closing === 'resolve' ? Promise.resolve() : Promise.reject(new Error('close rejected'));
  }
  createVoice(buffer: AudioBufferHandle, loop: boolean, parameters?: VoiceNodeParameters): AudioVoicePort {
    if (this.failVoice) throw new Error('InvalidStateError');
    const voice = parameters === undefined ? new FakeVoice(buffer, loop) : new FakeParameterVoice(buffer, loop, parameters);
    voice.failEnded = this.failEnded;
    this.voices.push(voice);
    return voice;
  }
  count(call: string): number { return this.calls.filter(item => item === call).length; }
}

export class FakeAudio implements AudioCapability {
  readonly contexts: FakeContext[] = [];
  readonly buffers: { channels: Float32Array[]; sampleRate: number }[] = [];
  initialState = 'suspended';
  failContext = false;
  failBuffer = false;
  failListen = false;
  createContext(): AudioContextPort {
    if (this.failContext) throw new Error('AudioContext is not a constructor');
    const context = new FakeContext(this.initialState);
    context.failListen = this.failListen;
    this.contexts.push(context);
    return context;
  }
  createBuffer(channels: readonly Float32Array[], sampleRate: number): AudioBufferHandle {
    if (this.failBuffer) throw new Error('NotSupportedError');
    const buffer = { channels: [...channels], sampleRate };
    this.buffers.push(buffer);
    return buffer;
  }
  get context(): FakeContext { return this.contexts[0]; }
}

export class FakeLifecycle implements PageLifecycleHost {
  readonly listeners = new Map<PageLifecycleEvent, Set<() => void>>();
  isVisible = true;
  failOn: PageLifecycleEvent | null = null;
  removed = 0;
  visible(): boolean { return this.isVisible; }
  listen(type: PageLifecycleEvent, listener: () => void): () => void {
    if (type === this.failOn) throw new Error('listen failed');
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
    return () => { this.removed++; set.delete(listener); };
  }
  fire(type: PageLifecycleEvent): void { for (const listener of [...this.listeners.get(type) ?? []]) listener(); }
  hide(): void { this.isVisible = false; this.fire('visibilitychange'); }
  show(): void { this.isVisible = true; this.fire('visibilitychange'); }
  get count(): number { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

/** A schema 2 sound payload; the bytes depend on `overrides`. */
export const sound = (overrides: Partial<SoundPayloadInput> = {}) =>
  writeSoundPayload({ sampleRate: 11_025, channels: 1, encoding: 'u8', loop: 'none', pcm: Uint8Array.of(0, 128, 255), ...overrides } as SoundPayloadInput);
