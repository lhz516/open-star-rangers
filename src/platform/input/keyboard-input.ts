export interface KeyboardInput {
  readonly type: 'keydown' | 'keyup';
  readonly code: string;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  /** `getModifierState('AltGraph')` as reported by the browser. */
  readonly altGraph: boolean;
  readonly metaKey: boolean;
  /** `getModifierState('NumLock')` as reported by the browser. */
  readonly numLock: boolean;
  readonly isComposing: boolean;
}

export function normalizeKeyboardInput(event: KeyboardInput): KeyboardInput {
  const { type, code, repeat, shiftKey, ctrlKey, altKey, altGraph, metaKey, numLock, isComposing } = event;
  return Object.freeze({ type, code, repeat, shiftKey, ctrlKey, altKey, altGraph, metaKey, numLock, isComposing });
}

/** The parts of a DOM KeyboardEvent the browser connection reads; `key` and `keyCode` are deliberately absent. */
export type KeyboardEventLike = Omit<KeyboardInput, 'type' | 'altGraph' | 'numLock'> & {
  getModifierState(key: 'AltGraph' | 'NumLock'): boolean;
};

/** Extracts the agreed fields; the keyboard source normalizes and freezes them. */
export function readKeyboardEvent(type: KeyboardInput['type'], event: KeyboardEventLike): KeyboardInput {
  const { code, repeat, shiftKey, ctrlKey, altKey, metaKey, isComposing } = event;
  return {
    type, code, repeat, shiftKey, ctrlKey, altKey, metaKey, isComposing,
    altGraph: event.getModifierState('AltGraph'),
    numLock: event.getModifierState('NumLock'),
  };
}

export type KeyboardSignalType =
  | 'initial' | 'bind' | 'unbind' | 'focusin' | 'focusout' | 'focus' | 'blur'
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

/** `Zone` is the host's input zone, e.g. the focusable container element in a browser. */
export interface KeyboardZoneBinding<Zone> {
  /**
   * Binds, replaces or (with null) removes the source's input zone without changing its connection or sink. A
   * failed registration on the new zone is rolled back and keeps the previous binding. Otherwise the previous
   * zone's callbacks are inert at once, its listeners are removed, and a connected sink gets a `bind`/`unbind`
   * signal before any removal failure is thrown. Rebinding the current zone, and any call after release, does
   * nothing. Bound to its source, so it can be handed over directly as a callback, e.g. a React callback ref.
   */
  readonly bind: (zone: Zone | null) => void;
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
