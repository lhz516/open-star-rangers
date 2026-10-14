import { RollbackError } from '../../app/session/rollback-error.ts';

/** The document's pointer-lock element, relative to the host's one target element. */
export type PointerLockState = 'target' | 'other' | 'none';
export type PointerLockSignalType = 'pointerlockchange' | 'pointerlockerror';
export type PointerEventType = 'mousemove' | 'mousedown' | 'mouseup';

/** Mouse-event fields as the host reported them. */
export interface PointerHostEvent {
  readonly button: number;
  readonly movementX: number;
  readonly movementY: number;
  readonly clientX: number;
  readonly clientY: number;
}

/** The target's bounding rectangle in CSS pixels of the client (viewport) coordinate space. */
export interface PointerClientRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Bound to one target element. Registration is atomic: throwing means no unreturned registration remains owned by the
 * host. Fact reads (`supported`, `readLock`, `readRect`) do not throw.
 */
export interface PointerLockHost {
  supported(): boolean;
  readLock(): PointerLockState;
  /** Requests the lock on the target with default (adjusted) movement; returns the host's promise when it has one. */
  request(): PromiseLike<void> | undefined;
  /** Exits the document's pointer lock, whichever element holds it; the port calls it only for its own lock. */
  exit(): void;
  readRect(): PointerClientRect;
  listenLock(type: PointerLockSignalType, listener: () => void): () => void;
  listenPointer(type: PointerEventType, listener: (event: PointerHostEvent) => void): () => void;
}

/** While the target is locked: `movementX/Y` unchanged, in the platform's unit (CSS or device pixels, by engine). */
export interface RelativePointerSample {
  readonly mode: 'relative';
  readonly unit: 'host-reported';
  readonly movementX: number;
  readonly movementY: number;
}

/** While the target is not locked: `clientX/Y` and the target's bounding rect, all CSS pixels of the viewport. */
export interface AbsolutePointerSample {
  readonly mode: 'absolute';
  readonly unit: 'css-client';
  readonly clientX: number;
  readonly clientY: number;
  readonly rect: PointerClientRect;
}

export type PointerSample = RelativePointerSample | AbsolutePointerSample;

/** Raw pointer facts with no game meaning; `button` is the host's button number. */
export type PointerInput =
  | { readonly type: 'move'; readonly sample: PointerSample }
  | { readonly type: 'down' | 'up'; readonly button: number; readonly sample: PointerSample };

export type PointerLockFailure = 'unsupported' | 'rejected' | 'target-mismatch';

/**
 * `disconnected`: the port was released before the host answered, so whether the target locked is unknown and a late
 * lock can no longer be observed or exited here.
 */
export type PointerLockOutcome =
  | { readonly status: 'locked' }
  | { readonly status: 'failed'; readonly reason: PointerLockFailure }
  | { readonly status: 'disconnected' };

export interface PointerLockSink {
  /** This port's own confirmed lock started (true) or ended (false), once per transition; true precedes promise observers. */
  lock(locked: boolean): void;
  pointer(input: PointerInput): void;
}

export interface PointerLockPort {
  supported(): boolean;
  /** Whether this port's confirmed lock is still in force. */
  locked(): boolean;
  /**
   * One owner, one connection. Throws on registration failure. Release invalidates first, then exits this port's lock;
   * an owner that must close a pending request keeps the port connected until its outcome, exits, then releases.
   */
  connect(sink: PointerLockSink): () => void;
  /**
   * Only while connected, at most one pending; settles once. When the host returns a promise, only that promise
   * answers: rejection is `rejected`, resolution checks the actual target (`locked` or `target-mismatch`). Otherwise the
   * first event answers: a change to the target (`locked`) or to another element (`target-mismatch`), or an error event
   * (`rejected`); a change to no lock does not. A synchronous host throw is `rejected`. Later answers are ignored.
   */
  request(): Promise<PointerLockOutcome>;
  /** Exits only this port's confirmed lock, and only while the host still reports it; the change event reports the end. */
  exit(): void;
}

const POINTER_TYPES: readonly PointerEventType[] = ['mousemove', 'mousedown', 'mouseup'];
const LOCKED: PointerLockOutcome = Object.freeze({ status: 'locked' });
const DISCONNECTED: PointerLockOutcome = Object.freeze({ status: 'disconnected' });
const failed = (reason: PointerLockFailure): PointerLockOutcome => Object.freeze({ status: 'failed', reason });

interface Pending {
  readonly resolve: (outcome: PointerLockOutcome) => void;
  /** Host events answer only a request whose host returned no promise; a promise host's events may outlive it. */
  byEvents: boolean;
}

class Port implements PointerLockPort {
  readonly #host: PointerLockHost;
  readonly #cleanups: (() => void)[] = [];
  #sink: PointerLockSink | null = null;
  #connected = false;
  #held = false;
  #pending: Pending | null = null;

  constructor(host: PointerLockHost) { this.#host = host; }

  supported(): boolean { return this.#host.supported(); }

  locked(): boolean { return this.#held; }

  connect(sink: PointerLockSink): () => void {
    if (this.#connected) throw new Error('A pointer lock port connects exactly once');
    this.#connected = true;
    this.#sink = sink;
    try {
      this.#cleanups.push(this.#host.listenLock('pointerlockchange', () => { if (this.#sink) this.#changed(); }));
      this.#cleanups.push(this.#host.listenLock('pointerlockerror', () => {
        if (this.#pending?.byEvents) this.#settle(this.#pending, failed('rejected'));
      }));
      for (const type of POINTER_TYPES) {
        this.#cleanups.push(this.#host.listenPointer(type, event => { if (this.#sink) this.#pointer(type, event); }));
      }
    } catch (cause) {
      const errors = this.#drain();
      if (errors.length) throw new RollbackError(cause, errors, 'Pointer lock registration and rollback failed');
      throw cause;
    }
    return () => this.#release();
  }

  request(): Promise<PointerLockOutcome> {
    if (!this.#sink) throw new Error('A pointer lock port requests only while connected');
    if (this.#pending) throw new Error('A pointer lock request is already pending');
    if (!this.#host.supported()) return Promise.resolve(failed('unsupported'));
    if (this.#held && this.#host.readLock() === 'target') return Promise.resolve(LOCKED);
    let resolve!: (outcome: PointerLockOutcome) => void;
    const promise = new Promise<PointerLockOutcome>(settle => { resolve = settle; });
    const pending: Pending = { resolve, byEvents: true };
    this.#pending = pending;
    try {
      const answer = this.#host.request();
      if (answer) {
        pending.byEvents = false;
        answer.then(() => this.#confirm(pending), () => this.#settle(pending, failed('rejected')));
      }
    } catch {
      this.#settle(pending, failed('rejected'));
    }
    return promise;
  }

  exit(): void {
    if (this.#held && this.#host.readLock() === 'target') this.#host.exit();
  }

  /** The host's promise resolved: only the actual target confirms the lock. */
  #confirm(pending: Pending): void {
    if (this.#pending === pending) this.#settle(pending, this.#host.readLock() === 'target' ? LOCKED : failed('target-mismatch'));
  }

  #changed(): void {
    const state = this.#host.readLock();
    const pending = this.#pending;
    if (this.#held && state !== 'target') {
      this.#held = false;
      this.#sink?.lock(false);
    }
    if (pending?.byEvents && state !== 'none') this.#settle(pending, state === 'target' ? LOCKED : failed('target-mismatch'));
  }

  /** Ignores answers for a request that already settled or was disconnected. */
  #settle(pending: Pending, outcome: PointerLockOutcome): void {
    if (this.#pending !== pending) return;
    this.#pending = null;
    pending.resolve(outcome);
    if (outcome === LOCKED && !this.#held) {
      this.#held = true;
      this.#sink?.lock(true);
    }
  }

  #pointer(type: PointerEventType, event: PointerHostEvent): void {
    let sample: PointerSample;
    if (this.#host.readLock() === 'target') {
      sample = Object.freeze({ mode: 'relative', unit: 'host-reported', movementX: event.movementX, movementY: event.movementY });
    } else {
      const { left, top, width, height } = this.#host.readRect();
      const rect = Object.freeze({ left, top, width, height });
      sample = Object.freeze({ mode: 'absolute', unit: 'css-client', clientX: event.clientX, clientY: event.clientY, rect });
    }
    this.#sink?.pointer(type === 'mousemove'
      ? Object.freeze({ type: 'move', sample })
      : Object.freeze({ type: type === 'mousedown' ? 'down' : 'up', button: event.button, sample }));
  }

  #release(): void {
    const errors = this.#drain();
    if (errors.length) throw new AggregateError(errors, 'Pointer lock release failed');
  }

  #drain(): unknown[] {
    this.#sink = null;
    const errors: unknown[] = [];
    const pending = this.#pending;
    this.#pending = null;
    pending?.resolve(DISCONNECTED);
    if (this.#held) {
      this.#held = false;
      try { if (this.#host.readLock() === 'target') this.#host.exit(); } catch (cause) { errors.push(cause); }
    }
    for (const cleanup of this.#cleanups.splice(0)) {
      try { cleanup(); } catch (cause) { errors.push(cause); }
    }
    return errors;
  }
}

export function createPointerLock(host: PointerLockHost): PointerLockPort {
  return new Port(host);
}
