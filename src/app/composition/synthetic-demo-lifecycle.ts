/**
 * The demo slot of one app instance: at most one synthetic demo owner at a time, each started once,
 * released before the next exists, and none created after a cleanup failure. React effects drive it
 * through visits, but it is DOM-free so the wiring can be tested with real owners and sessions.
 * Contract: docs/plan/p1/08/spec.md.
 */
import type { SyntheticDemoCleanupFailure, SyntheticDemoOwner } from './synthetic-demo-owner.ts';

export interface SyntheticDemoLifecycleOptions {
  /** Receives every cleanup failure at once, before any later visit can create an owner. */
  readonly onCleanupFailure: (cause: unknown) => void;
  /** The outlet for errors with no other one, like a failed dispose; its own failure is dropped. */
  readonly reportError: (error: unknown) => void;
}

/** One intent to show the demo, from entering it to leaving it. */
export interface SyntheticDemoVisit {
  /**
   * Releases any owner another visit still holds, then creates this visit's owner and dispatches
   * start to it, once: not if the visit already opened or closed, and nothing at all while a
   * cleanup failure is latched. A failed start is not retried; an owner whose initialization failed
   * ignores it. Returns the owner or null.
   */
  open(create: () => SyntheticDemoOwner): SyntheticDemoOwner | null;
  /** Releases the owner, if any, and ends the visit; idempotent. */
  close(): void;
}

export interface SyntheticDemoLifecycle {
  visit(): SyntheticDemoVisit;
  /**
   * Closes the visit holding the live owner, if any. Leaving the demo calls this before switching
   * screens, so the release and any failure it delivers precede the next screen.
   */
  release(): void;
  /** The first cleanup failure; once set, no visit creates an owner. */
  cleanupFailure(): SyntheticDemoCleanupFailure | null;
}

class Lifecycle implements SyntheticDemoLifecycle {
  readonly #options: SyntheticDemoLifecycleOptions;
  #failure: SyntheticDemoCleanupFailure | null = null;
  /** The visit holding the live owner. */
  current: Visit | null = null;

  constructor(options: SyntheticDemoLifecycleOptions) { this.#options = options; }

  visit(): SyntheticDemoVisit { return new Visit(this); }

  release(): void { this.current?.close(); }

  cleanupFailure(): SyntheticDemoCleanupFailure | null { return this.#failure; }

  /** Latches the owner's cleanup failure, if any, and delivers it. */
  check(owner: SyntheticDemoOwner): void {
    const record = owner.cleanupFailure();
    if (!record || this.#failure) return;
    this.#failure = record;
    try { this.#options.onCleanupFailure(record.cause); } catch (error) { this.report(error); }
  }

  report(error: unknown): void {
    try {
      this.#options.reportError(error);
    } catch {
      // The outlet itself failed and there is no other; the latch above does not depend on it.
    }
  }
}

class Visit implements SyntheticDemoVisit {
  readonly #lifecycle: Lifecycle;
  #state: 'pending' | 'open' | 'closed' = 'pending';
  #owner: SyntheticDemoOwner | null = null;

  constructor(lifecycle: Lifecycle) { this.#lifecycle = lifecycle; }

  open(create: () => SyntheticDemoOwner): SyntheticDemoOwner | null {
    if (this.#state !== 'pending') return null;
    this.#lifecycle.release();
    if (this.#lifecycle.cleanupFailure()) {
      this.#state = 'closed';
      return null;
    }
    const owner = create();
    this.#state = 'open';
    this.#owner = owner;
    this.#lifecycle.current = this;
    this.#lifecycle.check(owner);
    // A rollback that failed during initialization latched above; nothing starts beside it.
    if (!this.#lifecycle.cleanupFailure()) {
      owner.dispatch('start');
      this.#lifecycle.check(owner);
    }
    return owner;
  }

  close(): void {
    if (this.#state === 'closed') return;
    this.#state = 'closed';
    if (this.#lifecycle.current === this) this.#lifecycle.current = null;
    const owner = this.#owner;
    if (!owner) return;
    this.#owner = null;
    let failure: { readonly error: unknown } | null = null;
    try { owner.dispose(); } catch (error) { failure = { error }; }
    this.#lifecycle.check(owner);
    if (failure) this.#lifecycle.report(failure.error);
  }
}

export function createSyntheticDemoLifecycle(options: SyntheticDemoLifecycleOptions): SyntheticDemoLifecycle {
  return new Lifecycle(options);
}
