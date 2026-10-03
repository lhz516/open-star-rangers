export interface KeyboardInput {
  readonly type: 'keydown' | 'keyup';
  readonly code: string;
  readonly repeat: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly isComposing: boolean;
}

export function normalizeKeyboardInput(event: KeyboardInput): KeyboardInput {
  const { type, code, repeat, ctrlKey, altKey, metaKey, isComposing } = event;
  return Object.freeze({ type, code, repeat, ctrlKey, altKey, metaKey, isComposing });
}

export type KeyboardSignalType =
  | 'initial' | 'focusin' | 'focusout' | 'focus' | 'blur'
  | 'visibilitychange' | 'pagehide' | 'pageshow';

export interface KeyboardSignal {
  readonly type: KeyboardSignalType;
  readonly eligible: boolean;
}

export interface KeyboardSink {
  /** Returns only the default-interception decision, not whether local state was released. */
  key(event: KeyboardInput, eligible: boolean): boolean;
  signal(signal: KeyboardSignal): void;
}

export interface KeyboardSource {
  /** One owner, one connection. Throws on registration failure; release invalidates first. */
  connect(sink: KeyboardSink): () => void;
}

export interface KeyboardClassification {
  /** Key release regardless of qualification; callers check axis binding membership. */
  readonly release: boolean;
  readonly activate: boolean;
  readonly preventDefault: boolean;
}

export function classifyKeyboardInput(event: KeyboardInput, bound: boolean, eligible: boolean): KeyboardClassification {
  const permitted = bound && eligible && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing;
  return Object.freeze({
    release: event.type === 'keyup',
    activate: permitted && event.type === 'keydown' && !event.repeat,
    preventDefault: permitted,
  });
}

/** Local axis intent, never authoritative world state. */
export class HeldKeyboardAxis {
  readonly #bindings: Readonly<Record<string, -1 | 1>>;
  readonly #held = new Set<string>();

  constructor(bindings: Readonly<Record<string, -1 | 1>>) {
    this.#bindings = Object.freeze({ ...bindings });
  }

  value(): -1 | 0 | 1 {
    let negative = false;
    let positive = false;
    for (const code of this.#held) {
      negative ||= this.#bindings[code] === -1;
      positive ||= this.#bindings[code] === 1;
    }
    return negative === positive ? 0 : positive ? 1 : -1;
  }

  /** Returns whether the numeric axis changed, not whether the held set changed. */
  apply(event: KeyboardInput, eligible: boolean, running: boolean): boolean {
    const before = this.value();
    const bound = Object.hasOwn(this.#bindings, event.code);
    const classified = classifyKeyboardInput(event, bound, eligible);
    if (bound && classified.release) this.#held.delete(event.code);
    else if (running && classified.activate) this.#held.add(event.code);
    return before !== this.value();
  }

  clear(): boolean {
    const changed = this.value() !== 0;
    this.#held.clear();
    return changed;
  }
}
