import type { Command } from '../../core/synthetic/synthetic-scene.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import type { SessionStatus, SyntheticSession } from '../../app/session/synthetic-session.ts';
import {
  classifyKeyboardInput, HeldKeyboardAxis,
  type KeyboardInput, type KeyboardSignal, type KeyboardSource,
} from '../../platform/input/keyboard-input.ts';
import type { SyntheticCommandFeedback } from './synthetic-command-feedback.ts';
import { syntheticControlAvailability, type SyntheticGameControls } from './synthetic-game-controls.ts';
import type { SyntheticGameStoreWriter } from './synthetic-game-store.ts';
import type { SyntheticRunBinding, SyntheticSessionBridge } from './synthetic-session-bridge.ts';

type KeyboardAction =
  | { readonly type: 'axis'; readonly axis: 'moveX'; readonly value: -1 | 1 }
  | { readonly type: 'command'; readonly command: Command['type'] }
  | { readonly type: 'control'; readonly control: 'toggle-pause' };

export const SYNTHETIC_KEYBOARD_BINDINGS: Readonly<Record<string, KeyboardAction>> = Object.freeze({
  ArrowLeft: Object.freeze({ type: 'axis', axis: 'moveX', value: -1 }),
  ArrowRight: Object.freeze({ type: 'axis', axis: 'moveX', value: 1 }),
  KeyN: Object.freeze({ type: 'command', command: 'add-marker' }),
  KeyX: Object.freeze({ type: 'command', command: 'remove-marker' }),
  KeyP: Object.freeze({ type: 'control', control: 'toggle-pause' }),
});

const AXES: Record<string, -1 | 1> = {};
for (const [code, action] of Object.entries(SYNTHETIC_KEYBOARD_BINDINGS)) {
  if (action.type === 'axis') AXES[code] = action.value;
}

export type SyntheticKeyboardStatus =
  | { readonly state: 'active' | 'inactive' }
  | { readonly state: 'unavailable'; readonly error: unknown };

export interface SyntheticKeyboardReader {
  /** Stable frozen reference until eligibility or availability changes; never changes on ticks. */
  getSnapshot(): SyntheticKeyboardStatus;
  subscribe(listener: () => void): () => void;
}

export interface SyntheticKeyboardInput {
  readonly reader: SyntheticKeyboardReader;
  /** Invalidates callbacks and clears local axes, then releases source before status observation. */
  dispose(): void;
}

export interface SyntheticKeyboardDependencies {
  readonly store: SyntheticGameStoreWriter;
  readonly session: SyntheticSession;
  readonly bridge: SyntheticSessionBridge;
  readonly feedback: SyntheticCommandFeedback;
  readonly controls: SyntheticGameControls;
}

export type SyntheticKeyboardOptions = { readonly source: KeyboardSource } | { readonly unavailable: unknown };

const ACTIVE: SyntheticKeyboardStatus = Object.freeze({ state: 'active' });
const INACTIVE: SyntheticKeyboardStatus = Object.freeze({ state: 'inactive' });

class KeyboardConsumer implements SyntheticKeyboardInput {
  readonly #dependencies: SyntheticKeyboardDependencies;
  readonly #held = new HeldKeyboardAxis(AXES);
  readonly #listeners = new Set<() => void>();
  #snapshot = INACTIVE;
  #state: 'connecting' | 'connected' | 'unavailable' | 'disposed' = 'connecting';
  #runId: number | null = null;
  #releaseSource: (() => void) | null = null;
  #stopStatus: (() => void) | null = null;

  readonly reader: SyntheticKeyboardReader = Object.freeze({
    getSnapshot: (): SyntheticKeyboardStatus => this.#snapshot,
    subscribe: (listener: () => void): (() => void) => {
      if (this.#state === 'disposed') return () => {};
      this.#listeners.add(listener);
      return () => { this.#listeners.delete(listener); };
    },
  });

  constructor(dependencies: SyntheticKeyboardDependencies, options: SyntheticKeyboardOptions) {
    this.#dependencies = dependencies;
    try {
      if ('unavailable' in options) {
        this.#unavailable(options.unavailable);
        return;
      }
      this.#syncLocal();
      this.#stopStatus = dependencies.session.onStatus(() => {
        if (this.#state !== 'disposed') this.#syncLocal();
      });
      try {
        this.#releaseSource = options.source.connect({
          key: (event, eligible) => this.#key(event, eligible),
          signal: signal => { this.#signal(signal); },
        });
        this.#state = 'connected';
      } catch (cause) {
        this.#unavailable(cause);
      }
    } catch (cause) {
      try { this.dispose(); } catch (cleanup) {
        throw new RollbackError(cause, [cleanup], 'Keyboard consumer initialization and rollback failed');
      }
      throw cause;
    }
  }

  dispose(): void {
    if (this.#state === 'disposed') return;
    this.#state = 'disposed';
    this.#held.clear();
    this.#snapshot = INACTIVE;
    this.#listeners.clear();
    const releaseSource = this.#releaseSource, stopStatus = this.#stopStatus;
    this.#releaseSource = null;
    this.#stopStatus = null;
    const errors: unknown[] = [];
    try { releaseSource?.(); } catch (cause) { errors.push(cause); }
    try { stopStatus?.(); } catch (cause) { errors.push(cause); }
    if (errors.length) throw new AggregateError(errors, 'Keyboard consumer cleanup failed');
  }

  #unavailable(error: unknown): void {
    if (error instanceof RollbackError) throw error;
    this.#state = 'unavailable';
    this.#held.clear();
    this.#publish(Object.freeze({ state: 'unavailable', error }));
  }

  #publish(snapshot: SyntheticKeyboardStatus): void {
    if (snapshot === this.#snapshot) return;
    this.#snapshot = snapshot;
    for (const listener of [...this.#listeners]) if (this.#listeners.has(listener)) listener();
  }

  #syncLocal(): SessionStatus {
    const status = this.#dependencies.session.status();
    if (status.phase !== 'running' || status.runId !== this.#runId) this.#held.clear();
    this.#runId = status.runId;
    return status;
  }

  #binding(status: SessionStatus): SyntheticRunBinding | null {
    const binding = this.#dependencies.bridge.currentRun();
    return binding && binding.runId === status.runId && binding.run === this.#dependencies.session.currentRun()
      ? binding : null;
  }

  #key(event: KeyboardInput, eligible: boolean): boolean {
    if (this.#state !== 'connected') return false;
    const status = this.#syncLocal();
    const bound = Object.hasOwn(SYNTHETIC_KEYBOARD_BINDINGS, event.code);
    const classification = classifyKeyboardInput(event, bound, eligible);
    if (!bound) return classification.preventDefault;
    const action = SYNTHETIC_KEYBOARD_BINDINGS[event.code];
    const binding = this.#binding(status);
    const running = status.phase === 'running' && status.environmentVisible && binding !== null;
    if (action.type === 'axis') {
      if (this.#held.apply(event, eligible, running) && running && binding) this.#sendAxis(binding, this.#held.value());
    } else if (classification.activate && binding) {
      const availability = syntheticControlAvailability(status);
      if (action.type === 'command') {
        if (availability[action.command]) this.#dependencies.feedback.submit(action.command);
      } else if (availability.pause) this.#dependencies.controls.control('pause');
      else if (availability.resume) this.#dependencies.controls.control('resume');
    }
    return classification.preventDefault;
  }

  #signal(signal: KeyboardSignal): void {
    if (this.#state !== 'connecting' && this.#state !== 'connected') return;
    const status = this.#syncLocal();
    const clear = !signal.eligible || ['initial', 'focusout', 'blur', 'pagehide'].includes(signal.type);
    const changed = clear && this.#held.clear();
    if (changed && this.#state === 'connected' && status.phase === 'running' && status.environmentVisible) {
      const binding = this.#binding(status);
      if (binding) this.#sendAxis(binding, 0);
    }
    if (this.#state === 'connecting' || this.#state === 'connected') this.#publish(signal.eligible ? ACTIVE : INACTIVE);
  }

  #sendAxis(binding: SyntheticRunBinding, moveX: -1 | 0 | 1): void {
    const { store } = this.#dependencies;
    try { binding.setInput({ moveX }); } catch (cause) {
      if (this.#state === 'connected') store.commit({ actionError: { operation: 'input', cause } });
      return;
    }
    if (this.#state === 'connected' && store.reader.getState().actionError?.operation === 'input') {
      store.commit({ actionError: null });
    }
  }
}

/** Create after bridge binding; registration failures degrade unless rollback also failed. */
export function createSyntheticKeyboardInput(
  dependencies: SyntheticKeyboardDependencies, options: SyntheticKeyboardOptions,
): SyntheticKeyboardInput {
  return new KeyboardConsumer(dependencies, options);
}
