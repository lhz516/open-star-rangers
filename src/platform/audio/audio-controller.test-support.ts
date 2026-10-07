import { writeSoundPayload, type SoundPayloadInput } from '../../content/sound-payload.ts';
import type {
  AudioBufferHandle, AudioCapability, AudioContextPort, AudioVoicePort, PageLifecycleEvent, PageLifecycleHost,
} from './audio-controller.ts';

// Fakes of the audio controller's host capabilities, shared by the controller's tests and its app consumers' tests.

export class FakeVoice implements AudioVoicePort {
  readonly calls: string[] = [];
  readonly ended = new Set<() => void>();
  readonly buffer: AudioBufferHandle;
  readonly loop: boolean;
  failStop = false;
  constructor(buffer: AudioBufferHandle, loop: boolean) {
    this.buffer = buffer;
    this.loop = loop;
  }
  start(): void { this.calls.push('start'); }
  stop(): void {
    this.calls.push('stop');
    if (this.failStop) throw new Error('stop failed');
  }
  disconnect(): void { this.calls.push('disconnect'); }
  onEnded(listener: () => void): () => void {
    this.ended.add(listener);
    return () => { this.ended.delete(listener); };
  }
  /** The host reports the end of playback. */
  end(): void { for (const listener of [...this.ended]) listener(); }
}

export class FakeContext implements AudioContextPort {
  readonly calls: string[] = [];
  readonly voices: FakeVoice[] = [];
  readonly listeners = new Set<() => void>();
  failVoice = false;
  failListen = false;
  state: string;
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
  // Like a browser blocking autoplay, the promises never settle; tests drive the state instead.
  resume(): Promise<unknown> { this.calls.push('resume'); return new Promise(() => undefined); }
  suspend(): Promise<unknown> { this.calls.push('suspend'); return new Promise(() => undefined); }
  /** What `close()` does: reject (the default), resolve, stay pending, or throw synchronously. */
  closing: 'reject' | 'resolve' | 'pending' | 'throw' = 'reject';
  close(): Promise<unknown> {
    this.calls.push('close');
    if (this.closing === 'throw') throw new Error('close threw');
    if (this.closing === 'pending') return new Promise(() => undefined);
    return this.closing === 'resolve' ? Promise.resolve() : Promise.reject(new Error('close rejected'));
  }
  createVoice(buffer: AudioBufferHandle, loop: boolean): AudioVoicePort {
    if (this.failVoice) throw new Error('InvalidStateError');
    const voice = new FakeVoice(buffer, loop);
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

/** A schema 1 sound payload; the bytes depend on `overrides`. */
export const sound = (overrides: Partial<SoundPayloadInput> = {}) =>
  writeSoundPayload({ sampleRate: 11_025, channels: 1, encoding: 'u8', loop: 'none', pcm: Uint8Array.of(0, 128, 255), ...overrides });
