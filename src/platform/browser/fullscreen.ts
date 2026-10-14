import { RollbackError } from '../../app/session/rollback-error.ts';

/**
 * Codes a key lock never includes (P3-05 全屏与 Keyboard Lock): Escape keeps the browser's exit gesture, Tab leaves the
 * input zone, F12 opens the developer tools and Meta stays with the system. `OSLeft`/`OSRight` are the older names of
 * the Meta keys.
 */
export const UNLOCKABLE_KEY_CODES: ReadonlySet<string> = new Set(['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'F12']);

export type FullscreenEventType = 'fullscreenchange' | 'fullscreenerror';

/**
 * The document facts and calls the port uses; the target is always the document's root element. The three probes
 * (`fullscreenEnabled`, `isFullscreen`, `keyboardLockAvailable`) are plain reads that never throw.
 */
export interface FullscreenHost {
  /** Whether the document may show its root element fullscreen through the Fullscreen API. */
  fullscreenEnabled(): boolean;
  /** Whether the root element is the document's actual fullscreen element. */
  isFullscreen(): boolean;
  /** Throwing means no request was made. */
  requestFullscreen(): Promise<void>;
  /** Throwing means no request was made. */
  exitFullscreen(): Promise<void>;
  /** Registration is atomic: throwing means nothing remains registered. */
  listen(type: FullscreenEventType, listener: () => void): () => void;
  keyboardLockAvailable(): boolean;
  /** Throwing means no request was made. */
  lockKeys(codes: readonly string[]): Promise<void>;
  unlockKeys(): void;
}

export interface FullscreenSupport {
  readonly fullscreen: boolean;
  readonly keyboardLock: boolean;
}

export interface FullscreenState {
  /** The root element is the actual fullscreen element; a request or its resolved promise alone does not count. */
  readonly fullscreen: boolean;
  /** This port's own request entered that fullscreen and it has stayed fullscreen since, so `exitFullscreen` acts on it. */
  readonly owned: boolean;
  /** This port's latest key lock succeeded and was neither released nor replaced; browsers apply it only while fullscreen. */
  readonly keyboardLocked: boolean;
}

export interface FullscreenSignal extends FullscreenState {
  readonly type: 'change' | 'error';
}

/**
 * `rejected`: the browser refused (no user activation, permission policy, …). `not-entered`: the promise resolved but
 * the root element is not the actual fullscreen element. `failed`: the host threw. `disposed`: the port was released.
 */
export type FullscreenRequestFailure = 'unsupported' | 'rejected' | 'not-entered' | 'failed' | 'disposed';
/** `not-exited`: the promise resolved but the root element is still the actual fullscreen element. */
export type FullscreenExitFailure = 'rejected' | 'not-exited' | 'failed';
/**
 * Classified by the host error's `name`: `denied` (NotAllowedError), `unavailable` (InvalidStateError: not the active
 * top-level document), `invalid-codes` (InvalidAccessError), `superseded` (AbortError, or a later lock or unlock replaced
 * a lock that succeeded); `failed` for anything else or a host that threw.
 */
export type KeyboardLockFailure = 'unsupported' | 'denied' | 'unavailable' | 'invalid-codes' | 'superseded' | 'failed' | 'disposed';

export type FullscreenRequestResult =
  | { readonly status: 'fullscreen' }
  | { readonly status: 'failed'; readonly reason: FullscreenRequestFailure };
export type FullscreenExitResult =
  | { readonly status: 'exited' | 'not-owned' }
  | { readonly status: 'failed'; readonly reason: FullscreenExitFailure };
export type KeyboardLockResult =
  | { readonly status: 'locked' }
  | { readonly status: 'failed'; readonly reason: KeyboardLockFailure };

/**
 * Document-level fullscreen and Keyboard Lock (P3-05 全屏与 Keyboard Lock). It reports facts and request results only;
 * when to request, lock or exit, and request generations per owner and run, belong to the input owner. Results never
 * reject and carry no host error.
 */
export interface FullscreenPort {
  support(): FullscreenSupport;
  read(): FullscreenState;
  /**
   * Exactly once: listens for `fullscreenchange`/`fullscreenerror` until the returned release, which first makes every
   * callback inert, then attempts each removal. Afterwards requests and locks fail as `disposed`, while exits and unlocks
   * still act and earlier requests still settle, so a late success can be undone.
   */
  connect(sink: (signal: FullscreenSignal) => void): () => void;
  /**
   * Calls the host synchronously, so a caller's user gesture still applies; resolves by the actual fullscreen element.
   * When the root is already fullscreen it makes no request and leaves ownership unchanged.
   */
  requestFullscreen(): Promise<FullscreenRequestResult>;
  /** Exits only a fullscreen this port entered and still holds; never a browser fullscreen the user chose. */
  exitFullscreen(): Promise<FullscreenExitResult>;
  /** Throws RangeError for an empty list, an empty code or a code in `UNLOCKABLE_KEY_CODES`, without calling the host. */
  lockKeys(codes: readonly string[]): Promise<KeyboardLockResult>;
  /** Unlocks only when this port has a pending or effective lock; a host error propagates and keeps that lock recorded. */
  unlockKeys(): void;
}

const FULLSCREEN: FullscreenRequestResult = Object.freeze({ status: 'fullscreen' });
const EXITED: FullscreenExitResult = Object.freeze({ status: 'exited' });
const NOT_OWNED: FullscreenExitResult = Object.freeze({ status: 'not-owned' });
const LOCKED: KeyboardLockResult = Object.freeze({ status: 'locked' });
const failed = <Reason extends string>(reason: Reason) => Object.freeze({ status: 'failed' as const, reason });

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  try {
    const name: unknown = Reflect.get(error, 'name');
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}

function lockFailure(error: unknown): KeyboardLockFailure {
  switch (errorName(error)) {
    case 'NotAllowedError': return 'denied';
    case 'InvalidStateError': return 'unavailable';
    case 'InvalidAccessError': return 'invalid-codes';
    case 'AbortError': return 'superseded';
    default: return 'failed';
  }
}

function checkedCodes(codes: readonly string[]): readonly string[] {
  if (!Array.isArray(codes) || codes.length === 0) throw new RangeError('A key lock needs at least one key code; locking every key is not allowed');
  for (const code of codes) {
    if (typeof code !== 'string' || code === '') throw new RangeError('A locked key code must be a nonempty string');
    if (UNLOCKABLE_KEY_CODES.has(code)) throw new RangeError(`The key code ${code} cannot be locked`);
  }
  return Object.freeze([...codes]);
}

class Port implements FullscreenPort {
  readonly #host: FullscreenHost;
  readonly #cleanups: (() => void)[] = [];
  #phase: 'new' | 'connected' | 'released' = 'new';
  #sink: ((signal: FullscreenSignal) => void) | null = null;
  #owned = false;
  #exiting: Promise<FullscreenExitResult> | null = null;
  #lock: 'idle' | 'pending' | 'locked' = 'idle';
  /**
   * Advanced by each lock that reached the host and each successful unlock, so a replaced lock reports `superseded`.
   * Keyboard Lock runs lock and unlock requests in order, so an unlock also undoes an earlier lock that resolves later.
   */
  #lockGeneration = 0;

  constructor(host: FullscreenHost) { this.#host = host; }

  support(): FullscreenSupport {
    return Object.freeze({ fullscreen: this.#host.fullscreenEnabled(), keyboardLock: this.#host.keyboardLockAvailable() });
  }

  read(): FullscreenState {
    const fullscreen = this.#host.isFullscreen();
    if (!fullscreen) this.#owned = false;
    return Object.freeze({ fullscreen, owned: this.#owned, keyboardLocked: this.#lock === 'locked' });
  }

  connect(sink: (signal: FullscreenSignal) => void): () => void {
    if (this.#phase !== 'new') throw new Error('A fullscreen port connects exactly once');
    this.#phase = 'connected';
    this.#sink = sink;
    try {
      this.#cleanups.push(this.#host.listen('fullscreenchange', () => { this.#signal('change'); }));
      this.#cleanups.push(this.#host.listen('fullscreenerror', () => { this.#signal('error'); }));
    } catch (cause) {
      const errors = this.#release();
      if (errors.length) throw new RollbackError(cause, errors, 'Fullscreen registration and rollback failed');
      throw cause;
    }
    return () => {
      const errors = this.#release();
      if (errors.length) throw new AggregateError(errors, 'Fullscreen listener removal failed');
    };
  }

  requestFullscreen(): Promise<FullscreenRequestResult> {
    if (this.#phase === 'released') return Promise.resolve(failed('disposed'));
    // Already fullscreen and not on the way out: a request would change nothing, and ownership stays as it is.
    if (!this.#exiting && this.#host.isFullscreen()) return Promise.resolve(FULLSCREEN);
    if (!this.#host.fullscreenEnabled()) return Promise.resolve(failed('unsupported'));
    let pending: Promise<void>;
    try {
      pending = this.#host.requestFullscreen();
    } catch {
      return Promise.resolve(failed('failed'));
    }
    // Only this request's own success makes the fullscreen this port's; a change event may come from anyone.
    return pending.then(() => {
      if (!this.#host.isFullscreen()) return failed('not-entered');
      this.#owned = true;
      return FULLSCREEN;
    }, () => failed('rejected'));
  }

  exitFullscreen(): Promise<FullscreenExitResult> {
    if (this.#exiting) return this.#exiting;
    if (!this.read().owned) return Promise.resolve(NOT_OWNED);
    let pending: Promise<void>;
    try {
      pending = this.#host.exitFullscreen();
    } catch {
      return Promise.resolve(failed('failed'));
    }
    const exiting = pending.then(() => {
      this.#exiting = null;
      if (this.#host.isFullscreen()) return failed('not-exited');
      this.#owned = false;
      return EXITED;
    }, () => {
      this.#exiting = null;
      return failed('rejected');
    });
    this.#exiting = exiting;
    return exiting;
  }

  lockKeys(codes: readonly string[]): Promise<KeyboardLockResult> {
    const checked = checkedCodes(codes);
    if (this.#phase === 'released') return Promise.resolve(failed('disposed'));
    if (!this.#host.keyboardLockAvailable()) return Promise.resolve(failed('unsupported'));
    let pending: Promise<void>;
    try {
      pending = this.#host.lockKeys(checked);
    } catch {
      return Promise.resolve(failed('failed'));
    }
    const generation = ++this.#lockGeneration;
    this.#lock = 'pending';
    return pending.then(() => {
      if (generation !== this.#lockGeneration) return failed('superseded');
      this.#lock = 'locked';
      return LOCKED;
    }, (error: unknown) => {
      if (generation === this.#lockGeneration) this.#lock = 'idle';
      return failed(lockFailure(error));
    });
  }

  unlockKeys(): void {
    if (this.#lock === 'idle') return;
    this.#host.unlockKeys();
    this.#lockGeneration++;
    this.#lock = 'idle';
  }

  #signal(type: FullscreenSignal['type']): void {
    const sink = this.#sink;
    if (sink) sink(Object.freeze({ type, ...this.read() }));
  }

  /** Makes every callback inert, then attempts every removal. */
  #release(): unknown[] {
    this.#phase = 'released';
    this.#sink = null;
    const errors: unknown[] = [];
    for (const cleanup of this.#cleanups.splice(0)) {
      try { cleanup(); } catch (cause) { errors.push(cause); }
    }
    return errors;
  }
}

/** Nothing is registered until `connect`; every call goes to the injected host. */
export function createFullscreenPort(host: FullscreenHost): FullscreenPort {
  return new Port(host);
}
