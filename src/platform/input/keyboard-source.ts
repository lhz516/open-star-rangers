import { RollbackError } from '../../app/session/rollback-error.ts';
import { normalizeKeyboardInput } from './keyboard-input.ts';
import type { KeyboardInput, KeyboardSignalType, KeyboardSink, KeyboardSource, KeyboardZoneBinding } from './keyboard-input.ts';

export type KeyboardZoneEventType = 'focusin' | 'focusout';
export type KeyboardPageEventType = 'focus' | 'blur' | 'visibilitychange' | 'pagehide' | 'pageshow';

export interface KeyboardFacts {
  readonly elementFocused: boolean;
  readonly windowFocused: boolean;
  readonly visible: boolean;
}

/** Registration is atomic: throwing means no unreturned registration remains owned by the host. */
export interface KeyboardHost<Zone> {
  readFacts(zone: Zone): KeyboardFacts;
  listenKey(zone: Zone, type: KeyboardInput['type'], listener: (input: KeyboardInput, preventDefault: () => void) => void): () => void;
  listenZone(zone: Zone, type: KeyboardZoneEventType, listener: () => void): () => void;
  listenPage(type: KeyboardPageEventType, listener: () => void): () => void;
}

const ZONE_SIGNALS: readonly KeyboardZoneEventType[] = ['focusin', 'focusout'];
const PAGE_SIGNALS: readonly KeyboardPageEventType[] = ['focus', 'blur', 'visibilitychange', 'pagehide', 'pageshow'];

/** A fresh token per binding, so callbacks of a replaced binding stay inert even if the same zone is bound again. */
interface Binding<Zone> {
  readonly zone: Zone;
  readonly cleanups: (() => void)[];
}

class Source<Zone> implements KeyboardSource, KeyboardZoneBinding<Zone> {
  readonly #host: KeyboardHost<Zone>;
  readonly #cleanups: (() => void)[] = [];
  #binding: Binding<Zone> | null = null;
  #sink: KeyboardSink | null = null;
  #connected = false;
  #pageHidden = false;

  constructor(host: KeyboardHost<Zone>) { this.#host = host; }

  connect(sink: KeyboardSink): () => void {
    if (this.#connected) throw new Error('A keyboard source connects exactly once');
    this.#connected = true;
    this.#sink = sink;
    try {
      if (this.#binding) this.#listenZone(this.#binding);
      for (const type of PAGE_SIGNALS) {
        this.#cleanups.push(this.#host.listenPage(type, () => {
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

  readonly bind = (zone: Zone | null): void => {
    const previous = this.#binding;
    if ((this.#connected && !this.#sink) || (previous ? previous.zone === zone : zone === null)) return;
    const next: Binding<Zone> | null = zone === null ? null : { zone, cleanups: [] };
    if (next && this.#sink) {
      try {
        this.#listenZone(next);
      } catch (cause) {
        const errors = drain(next.cleanups);
        if (errors.length) throw new RollbackError(cause, errors, 'Keyboard input zone registration and rollback failed');
        throw cause;
      }
    }
    this.#binding = next;
    const errors = previous ? drain(previous.cleanups) : [];
    try {
      this.#signal(next ? 'bind' : 'unbind');
    } catch (cause) {
      if (!errors.length) throw cause;
      errors.push(cause);
    }
    if (errors.length) throw new AggregateError(errors, 'Keyboard input zone listener removal failed');
  };

  #listenZone(binding: Binding<Zone>): void {
    const { zone, cleanups } = binding;
    for (const type of ['keydown', 'keyup'] as const) {
      cleanups.push(this.#host.listenKey(zone, type, (input, preventDefault) => {
        const sink = this.#sink;
        if (this.#binding !== binding || !sink) return;
        const intercept = sink.key(normalizeKeyboardInput(input), this.#eligible());
        if (intercept && this.#binding === binding) preventDefault();
      }));
    }
    for (const type of ZONE_SIGNALS) {
      cleanups.push(this.#host.listenZone(zone, type, () => {
        if (this.#binding === binding) this.#signal(type);
      }));
    }
  }

  #eligible(): boolean {
    if (!this.#binding || this.#pageHidden) return false;
    const facts = this.#host.readFacts(this.#binding.zone);
    return facts.visible && facts.windowFocused && facts.elementFocused;
  }

  #signal(type: KeyboardSignalType): void {
    this.#sink?.signal(Object.freeze({ type, eligible: this.#eligible() }));
  }

  #release(): void {
    const errors = this.#drain();
    if (errors.length) throw new AggregateError(errors, 'Keyboard listener removal failed');
  }

  /** Invalidates every callback, then attempts every removal: zone listeners first, as registered. */
  #drain(): unknown[] {
    this.#sink = null;
    const zoneCleanups = this.#binding?.cleanups ?? [];
    this.#binding = null;
    return [...drain(zoneCleanups), ...drain(this.#cleanups)];
  }
}

function drain(cleanups: (() => void)[]): unknown[] {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0)) {
    try { cleanup(); } catch (cause) { errors.push(cause); }
  }
  return errors;
}

export function createKeyboardSource<Zone>(host: KeyboardHost<Zone>): KeyboardSource & KeyboardZoneBinding<Zone> {
  return new Source(host);
}
