/**
 * The mission slot of one app instance (docs/plan/p3/04/spec.md: 应用流程, 消费者接线与释放): at most one mission owner
 * at a time, each released before the next exists, with ownerIds increasing from 1 and never reused. A cleanup failure
 * of any owner latches the slot for the life of the app instance, so no owner is created again until the page reloads;
 * import and the viewer, whose latch is its own, are unaffected. The slot also keeps the wingman selection a run last
 * started with, across owners, and the close barrier of their asynchronously closed resources. DOM-free: React drives
 * it, and Node tests drive it with real owners and sessions.
 */
import type { ResourceHolder } from '../resources/resource-holder.ts';
import type { ConfirmedSelection } from '../mission/mission-flow.ts';
import { createMissionOwner, type MissionOwner, type MissionOwnerSetup } from '../mission/mission-owner.ts';
import { RollbackError } from '../session/rollback-error.ts';

export interface MissionSlotOptions {
  /** Receives the first cleanup failure, once; the slot is latched from then on. */
  readonly onCleanupFailure: (cause: unknown) => void;
  /** The outlet for errors with no other one; its own failure is dropped. */
  readonly reportError: (error: unknown) => void;
  /**
   * The holder is replacing the package the open owner bound: the slot has released that owner (latching any failure
   * first), and the app returns to the main menu saying why.
   */
  readonly onPackageReplaced: (ownerId: number) => void;
}

export interface MissionSlot {
  /**
   * Releases any open owner, then, unless the slot is latched, creates the next: `create` runs only then, so nothing is
   * made for an owner that will not exist. Returns null when latched. Throws what a failed creation throws, such as a
   * `MissionUnavailableError`, after latching a RollbackError, whose cleanup failed.
   */
  open(create: () => MissionOwnerSetup): MissionOwner | null;
  /** Releases the open owner, if any; a failed release latches. Leaving the mission screen calls it before switching. */
  release(): void;
  current(): MissionOwner | null;
  /** The latched cleanup failure, or null. */
  cleanupFailure(): { readonly cause: unknown } | null;
}

class Slot implements MissionSlot {
  readonly #options: MissionSlotOptions;
  #owner: MissionOwner | null = null;
  #serial = 0;
  #failure: { readonly cause: unknown } | null = null;
  #confirmed: ConfirmedSelection | null = null;
  /** True once every asynchronous close so far is confirmed; false once one failed. */
  #closed: Promise<boolean> = Promise.resolve(true);

  constructor(options: MissionSlotOptions) {
    this.#options = options;
  }

  open(create: () => MissionOwnerSetup): MissionOwner | null {
    this.release();
    if (this.#failure) return null;
    if (this.#serial >= Number.MAX_SAFE_INTEGER) throw new RangeError('Mission ownerIds are exhausted');
    const ownerId = ++this.#serial;
    let owner: MissionOwner | null = null;
    try {
      owner = createMissionOwner(create(), {
        ownerId,
        previousClosed: this.#closed,
        confirmed: () => this.#confirmed,
        confirm: (selection) => { this.#confirmed = selection; },
        onCleanupFailure: (cause) => { this.#latch(cause); },
        onReplace: () => { this.#replaced(owner); },
        onClosing: (closed) => {
          this.#closed = Promise.all([this.#closed, closed]).then(([earlier, now]) => earlier && now);
        },
      });
    } catch (error) {
      if (error instanceof RollbackError) this.#latch(error);
      throw error;
    }
    this.#owner = owner;
    return owner;
  }

  release(): void {
    const owner = this.#owner;
    if (!owner) return;
    this.#owner = null;
    // The owner latches its own failures through the link; this only covers an owner that throws instead.
    try {
      owner.release();
    } catch (error) {
      this.#latch(error);
    }
  }

  current(): MissionOwner | null {
    return this.#owner;
  }

  cleanupFailure(): { readonly cause: unknown } | null {
    return this.#failure;
  }

  /** The holder's beforeReplace reached `owner`: release it, latching first, then let the app return to the menu. */
  #replaced(owner: MissionOwner | null): void {
    if (!owner || owner !== this.#owner) return;
    this.release();
    try {
      this.#options.onPackageReplaced(owner.ownerId);
    } catch (error) {
      this.#report(error);
    }
  }

  #latch(cause: unknown): void {
    if (this.#failure) return;
    this.#failure = Object.freeze({ cause });
    try {
      this.#options.onCleanupFailure(cause);
    } catch (error) {
      this.#report(error);
    }
  }

  #report(error: unknown): void {
    try {
      this.#options.reportError(error);
    } catch {
      // The outlet itself failed and there is no other; the latch does not depend on it.
    }
  }
}

export function createMissionSlot(options: MissionSlotOptions): MissionSlot {
  return new Slot(options);
}

/**
 * The app shell's teardown order, for unmounting, replacing the holder and Fast Refresh: the mission slot first, then the
 * holder. `ResourceHolder.dispose()` notifies no listener, so the mission's consumers must be released while the
 * package they read is still held; the holder is disposed even when the slot's release throws.
 */
export function teardownMissionAndHolder(slot: Pick<MissionSlot, 'release'>, holder: Pick<ResourceHolder, 'dispose'>): void {
  try {
    slot.release();
  } finally {
    holder.dispose();
  }
}
