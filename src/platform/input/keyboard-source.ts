import { RollbackError } from '../../app/session/rollback-error.ts';
import { normalizeKeyboardInput } from './keyboard-input.ts';
import type { KeyboardInput, KeyboardSignalType, KeyboardSink, KeyboardSource } from './keyboard-input.ts';

export type KeyboardLifecycleType = Exclude<KeyboardSignalType, 'initial'>;

export interface KeyboardFacts {
  readonly elementFocused: boolean;
  readonly windowFocused: boolean;
  readonly visible: boolean;
}

/** Registration is atomic: throwing means no unreturned registration remains owned by the host. */
export interface KeyboardHost {
  readFacts(): KeyboardFacts;
  listenKey(type: KeyboardInput['type'], listener: (input: KeyboardInput, preventDefault: () => void) => void): () => void;
  listenSignal(type: KeyboardLifecycleType, listener: () => void): () => void;
}

const SIGNALS: readonly KeyboardLifecycleType[] = [
  'focusin', 'focusout', 'focus', 'blur', 'visibilitychange', 'pagehide', 'pageshow',
];

class Source implements KeyboardSource {
  readonly #host: KeyboardHost;
  readonly #cleanups: (() => void)[] = [];
  #sink: KeyboardSink | null = null;
  #connected = false;
  #pageHidden = false;

  constructor(host: KeyboardHost) { this.#host = host; }

  connect(sink: KeyboardSink): () => void {
    if (this.#connected) throw new Error('A keyboard source connects exactly once');
    this.#connected = true;
    this.#sink = sink;
    try {
      for (const type of ['keydown', 'keyup'] as const) {
        this.#cleanups.push(this.#host.listenKey(type, (input, preventDefault) => {
          if (!this.#sink) return;
          const intercept = this.#sink.key(normalizeKeyboardInput(input), this.#eligible());
          if (this.#sink && intercept) preventDefault();
        }));
      }
      for (const type of SIGNALS) {
        this.#cleanups.push(this.#host.listenSignal(type, () => {
          if (!this.#sink) return;
          if (type === 'pagehide') this.#pageHidden = true;
          if (type === 'pageshow') this.#pageHidden = false;
          this.#signal(type);
        }));
      }
      this.#signal('initial');
    } catch (cause) {
      const errors = this.#drain();
      if (errors.length) throw new RollbackError(cause, errors, 'Keyboard registration and rollback failed');
      throw cause;
    }
    return () => this.#release();
  }

  #eligible(): boolean {
    const facts = this.#host.readFacts();
    return !this.#pageHidden && facts.visible && facts.windowFocused && facts.elementFocused;
  }

  #signal(type: KeyboardSignalType): void {
    this.#sink?.signal(Object.freeze({ type, eligible: this.#eligible() }));
  }

  #release(): void {
    const errors = this.#drain();
    if (errors.length) throw new AggregateError(errors, 'Keyboard listener removal failed');
  }

  #drain(): unknown[] {
    this.#sink = null;
    const errors: unknown[] = [];
    for (const cleanup of this.#cleanups.splice(0)) {
      try { cleanup(); } catch (cause) { errors.push(cause); }
    }
    return errors;
  }
}

export function createKeyboardSource(host: KeyboardHost): KeyboardSource {
  return new Source(host);
}
