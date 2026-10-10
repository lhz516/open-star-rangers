/**
 * Capability requests of one mission owner's game input (docs/plan/p3/05/spec.md: 全屏与 Keyboard Lock, 生命周期与资源
 * “异步申请”, 清键与恢复; 数据模型与契约 “能力申请状态与错误”; 技术决定 7). The input consumer keeps one for its
 * owner's life and connects the platform ports through it. Their states go to the input status, never to Core or a
 * recording.
 *
 * - **Requests:** each fullscreen, key lock and Pointer Lock request carries the owner, a run (none for fullscreen asked
 *   for outside a run, or by a start that has not succeeded yet) and a generation. At most one per capability is open at
 *   its port. Revoking a request invalidates it at once: a late success is only undone, on a target this owner still
 *   holds, with no focus, mode or action. A late failure stays the request's own: shown while no newer request exists.
 * - **Barriers:** nothing is requested before `previousClosed` settles, nor while an earlier request or exit of the same
 *   capability is still open. A fullscreen or Pointer Lock request refused so fails as `closing`; a key lock waits.
 * - **Fullscreen:** a start's request reaches the host synchronously in the start's gesture, only where Keyboard Lock is
 *   supported too. It belongs to that start, and to the start's run only once the start began one; otherwise it is
 *   revoked. When a run that began leaves the session (a restart), on an explicit exit and on release, open requests are
 *   revoked and fullscreen this owner entered is exited; never for a failed start or a run that stopped or faulted.
 *   Leaving fullscreen invalidates the key lock and clears the input as a focus loss.
 * - **Key lock:** in force exactly while the document is in API fullscreen that no open request or exit of this owner
 *   may still change, the run is running and the input zone qualifies; unlocked at once otherwise. After a failure,
 *   fullscreen stays and no lock is tried again until a new gesture: `retryKeyboardLock`, a start or a fullscreen
 *   request.
 * - **Pointer Lock**, the generic part (subtask 22 decides when): requested for the current run; a confirmed lock is
 *   active until the port reports its end, which clears the input as `pointer-lock-exit`. The end of the run's input,
 *   or of its run, exits it.
 * - **Release:** invalidates first, then attempts each removal, unlock and exit. Open requests are awaited so that a
 *   late success can be undone, which makes the release an asynchronous close. Failures are collected, and a release
 *   that cannot be confirmed fails rather than reporting success.
 */
import type { MissionSessionView } from '../../app/mission/mission-owner.ts';
import type { ClearInputReason, GameSessionStatus } from '../../app/session/game-session.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import {
  UNLOCKABLE_KEY_CODES, type FullscreenExitResult, type FullscreenPort, type FullscreenRequestResult, type FullscreenSignal,
  type KeyboardLockResult,
} from '../../platform/browser/fullscreen.ts';
import type { PointerInput, PointerLockOutcome, PointerLockPort, PointerLockSink } from '../../platform/input/pointer-lock.ts';
import { attemptAll } from '../../render/scene/cleanup.ts';
import type { CapabilityFailure, CapabilityName, CapabilityState, CapabilityStatus, InputStatusWriter } from './input-status.ts';

export interface CapabilityPorts {
  /** Created once, as the owner connects the input consumer; omitted or null where the host has none. */
  readonly fullscreen?: () => FullscreenPort | null;
  /** Created once, as `fullscreen` is. */
  readonly pointerLock?: () => PointerLockPort | null;
  /**
   * The codes a key lock covers, derived from the binding table (subtask 19): nonempty, each a nonempty string outside
   * `UNLOCKABLE_KEY_CODES`. Without them no key is locked.
   */
  readonly keyLockCodes?: readonly string[];
}

/** What the input consumer knows now. */
export interface CapabilityFacts {
  /** The consumer's wired run while it is the session's run; null otherwise. */
  readonly runId: number | null;
  /** That run is running. */
  readonly running: boolean;
  /** The input zone qualifies. */
  readonly eligible: boolean;
}

export interface CapabilityContext {
  readonly ownerId: number;
  readonly session: MissionSessionView;
  readonly previousClosed: Promise<boolean>;
  readonly facts: () => CapabilityFacts;
  /** The consumer's clear: the local input, and while running one `clear-input`. */
  readonly clear: (reason: ClearInputReason) => void;
  readonly status: InputStatusWriter;
  /** Receives the port's pointer input, except while a lock being undone holds the pointer (subtask 22). */
  readonly pointer?: (input: PointerInput) => void;
}

/** What the mission UI and the map input (subtask 22) ask for; inert before the owner connects and after release. */
export interface InputCapabilities {
  /**
   * For the start button's gesture: where fullscreen and Keyboard Lock are both supported and the document is not
   * fullscreen, requests fullscreen synchronously, then calls `start`. The request passes to the run `start` began;
   * without one it is revoked, and a late success is exited.
   */
  startWithFullscreen(start: () => void): void;
  /** For the shell's fullscreen button: requests fullscreen synchronously, for the current run if any. */
  requestFullscreen(): void;
  /** Revokes an open fullscreen request and exits the fullscreen this owner entered; a user's own fullscreen stays. */
  exitFullscreen(): void;
  /** After a failed key lock: allows a new attempt once fullscreen, running and a qualified input zone hold. */
  retryKeyboardLock(): void;
  /** Requests Pointer Lock for the current run; nothing without one, or while a request is open or a lock held. */
  requestPointerLock(): void;
  /** Revokes an open Pointer Lock request and exits this owner's lock; the port's report of its end clears the input. */
  exitPointerLock(): void;
  /** Whether this owner's port holds the pointer, a lock being undone included: Esc then only releases it. */
  pointerLocked(): boolean;
}

/** What one release leaves: its synchronous failures, and the failures of its asynchronous closes once they settle. */
export interface CapabilityRelease {
  readonly errors: readonly unknown[];
  /** Null when nothing remained open; otherwise never rejects. */
  readonly closes: Promise<readonly unknown[]> | null;
}

/** The input consumer's side. */
export interface InputCapabilityController extends InputCapabilities {
  /** Once; throws when a port cannot connect, after disconnecting the others (a RollbackError when that failed too). */
  connect(context: CapabilityContext): void;
  /** Re-evaluates the key lock after the consumer's facts changed, and publishes the statuses. */
  update(): void;
  /** The consumer's wiring of run `runId` ended: that run's Pointer Lock ends with it. */
  detached(runId: number): void;
  release(): CapabilityRelease;
}

/** A release the owner could not confirm: the input consumer's close fails with it, and the owner latches. */
export class CapabilityReleaseError extends Error {
  readonly capability: CapabilityName;
  /** `disconnected`: a Pointer Lock request's outcome is unknown, so whether the pointer is still locked is too. */
  readonly reason: string;

  constructor(capability: CapabilityName, reason: string) {
    super(`The ${capability} release could not be confirmed: ${reason}`);
    this.name = 'CapabilityReleaseError';
    this.capability = capability;
    this.reason = reason;
  }
}

/** The session's run as last reported, with its phase then. */
interface SeenRun {
  readonly runId: number;
  readonly phase: GameSessionStatus['phase'];
}

interface Request {
  readonly generation: number;
  /** Set once a start's fullscreen request passes to the run the start began. */
  runId: number | null;
  /** Logically invalid: a late success is only undone. */
  revoked: boolean;
}

const NO_FACTS: CapabilityFacts = Object.freeze({ runId: null, running: false, eligible: false });
const CLOSING: CapabilityFailure = Object.freeze({ operation: 'request', reason: 'closing' });
const RELEASE_FAILED: CapabilityFailure = Object.freeze({ operation: 'release', reason: 'failed' });
const STALE = 'stale';

function checkedCodes(codes: readonly string[]): readonly string[] {
  if (!Array.isArray(codes) || codes.length === 0) throw new RangeError('A key lock needs at least one key code');
  for (const code of codes) {
    if (typeof code !== 'string' || code === '') throw new RangeError('A locked key code must be a nonempty string');
    if (UNLOCKABLE_KEY_CODES.has(code)) throw new RangeError(`The key code ${code} cannot be locked`);
  }
  return Object.freeze([...codes]);
}

const runOf = ({ runId, phase }: GameSessionStatus): SeenRun | null => (runId === null ? null : { runId, phase });

/** One capability's requests and failure. */
class Track {
  /** The latest request, whose run and generation the status shows. */
  latest: Request | null = null;
  /** The request still open at the port, revoked or not, and when its result will have been handled. */
  open: { readonly request: Request; readonly settled: Promise<void> } | null = null;
  failure: CapabilityFailure | null = null;

  get generation(): number {
    return this.latest?.generation ?? 0;
  }

  next(runId: number | null): Request {
    const request: Request = { generation: this.generation + 1, runId, revoked: false };
    this.latest = request;
    return request;
  }

  /** The open request, unless it was revoked. */
  get pending(): Request | null {
    const request = this.open?.request;
    return request && !request.revoked ? request : null;
  }

  begin<T>(request: Request, result: Promise<T>, settle: (request: Request, value: T) => void): void {
    this.failure = null;
    this.open = {
      request,
      settled: result.then((value) => {
        this.answered(request);
        settle(request, value);
      }),
    };
  }

  /**
   * Revokes the open request when it belongs to run `runId`, or to any run when null. Returns when the open request's
   * result will have been handled, or null when none is open.
   */
  revoke(runId: number | null): Promise<void> | null {
    const open = this.open;
    if (!open) return null;
    if (runId === null || open.request.runId === runId) open.request.revoked = true;
    return open.settled;
  }

  /** A request's failure, revoked or not, shows only while that request is still the latest. */
  failedAt(request: Request, failure: CapabilityFailure): void {
    if (request === this.latest) this.failure = failure;
  }

  /** The port answered `request`, perhaps before its result is handled. */
  answered(request: Request): void {
    if (this.open?.request === request) this.open = null;
  }

  released(): void {
    if (this.failure?.operation === 'release') this.failure = null;
  }
}

class Capabilities implements InputCapabilityController {
  readonly #ports: CapabilityPorts;
  readonly #codes: readonly string[] | null;
  #context: CapabilityContext | null = null;
  #live = false;
  /** `previousClosed` settled. */
  #barrierOpen = false;
  #fullscreenPort: FullscreenPort | null = null;
  #pointerPort: PointerLockPort | null = null;
  #disconnectFullscreen: (() => void) | null = null;
  #disconnectPointer: (() => void) | null = null;
  #stopStatus: (() => void) | null = null;
  #seen: SeenRun | null = null;

  readonly #fullscreen = new Track();
  /** The root element was fullscreen at the last signal. */
  #wasFullscreen = false;
  /** This owner's exit, until it settles. */
  #exiting: Promise<FullscreenExitResult> | null = null;
  /** A revoked request's late fullscreen is being exited: its end is no focus loss. */
  #undoing = false;

  readonly #keys = new Track();
  /** The current key lock, once it succeeded. */
  #locked: Request | null = null;
  /** A key lock failed: none is tried again before a new gesture. */
  #keysBlocked = false;

  readonly #pointer = new Track();
  /**
   * The lock the port holds: a confirmed request's, revoked once this owner asked for its exit; `stale` while a late
   * success is undone; or none.
   */
  #held: Request | typeof STALE | null = null;
  /** A request's outcome was `disconnected`. */
  #pointerUnknown = false;

  constructor(ports: CapabilityPorts) {
    this.#ports = ports;
    this.#codes = ports.keyLockCodes === undefined ? null : checkedCodes(ports.keyLockCodes);
  }

  readonly #pointerSink: PointerLockSink = Object.freeze({
    lock: (locked: boolean) => {
      if (locked) this.#pointerLocked();
      else this.#pointerUnlocked();
    },
    // Absolute input while unlocked, relative input only under a lock this owner is not exiting.
    pointer: (input: PointerInput) => {
      const held = this.#held;
      if (this.#live && (held === null || (held !== STALE && !held.revoked))) this.#context!.pointer?.(input);
    },
  });

  connect(context: CapabilityContext): void {
    if (this.#context) throw new Error('Input capabilities connect to one owner, once');
    this.#context = context;
    const { fullscreen, pointerLock } = this.#ports;
    try {
      const fullscreenPort = fullscreen?.() ?? null;
      if (fullscreenPort) {
        this.#disconnectFullscreen = fullscreenPort.connect((signal) => { this.#fullscreenSignal(signal); });
        this.#fullscreenPort = fullscreenPort;
      }
      const pointerPort = pointerLock?.() ?? null;
      if (pointerPort) {
        this.#disconnectPointer = pointerPort.connect(this.#pointerSink);
        this.#pointerPort = pointerPort;
      }
      if (fullscreenPort || pointerPort) this.#stopStatus = context.session.onStatus(this.#onStatus);
    } catch (cause) {
      const errors = this.#disconnect();
      if (errors.length > 0) throw new RollbackError(cause, errors, 'Input capability registration and rollback failed');
      throw cause;
    }
    this.#live = true;
    this.#wasFullscreen = this.#fullscreenPort?.read().fullscreen ?? false;
    this.#seen = runOf(context.session.status());
    const open = (): void => {
      this.#barrierOpen = true;
      this.update();
    };
    void context.previousClosed.then(open, open);
    this.#publish();
  }

  update(): void {
    if (!this.#live) return;
    this.#updateKeys();
    this.#publish();
  }

  detached(runId: number): void {
    if (!this.#live) return;
    this.#endPointer(runId);
    this.update();
  }

  startWithFullscreen(start: () => void): void {
    const port = this.#fullscreenPort;
    let request: Request | null = null;
    if (this.#live && port) {
      this.#keysBlocked = false;
      const { fullscreen, keyboardLock } = port.support();
      if (fullscreen && keyboardLock && !port.read().fullscreen) request = this.#requestFullscreen(port, null);
    }
    const before = this.#facts().runId;
    let began = false;
    try {
      start();
      const after = this.#facts().runId;
      began = after !== null && after !== before;
      if (began && request) request.runId = after;
    } finally {
      if (request && !began) request.revoked = true;
      this.update();
    }
  }

  requestFullscreen(): void {
    const port = this.#fullscreenPort;
    if (!this.#live || !port) return;
    this.#keysBlocked = false;
    this.#requestFullscreen(port, this.#facts().runId);
    this.update();
  }

  exitFullscreen(): void {
    if (!this.#live) return;
    this.#fullscreen.revoke(null);
    void this.#exitFullscreen();
    this.update();
  }

  retryKeyboardLock(): void {
    if (!this.#live) return;
    this.#keysBlocked = false;
    if (this.#keys.failure?.operation === 'request') this.#keys.failure = null;
    this.update();
  }

  requestPointerLock(): void {
    const port = this.#pointerPort;
    const held = this.#held;
    if (!this.#live || !port) return;
    if (!port.supported()) {
      this.#publish();
      return;
    }
    if (this.#pointer.pending || (held !== null && held !== STALE)) return;
    const { runId } = this.#facts();
    if (runId === null) return;
    const request = this.#pointer.next(runId);
    if (!this.#barrierOpen || this.#pointer.open || port.locked()) this.#pointer.failure = CLOSING;
    else this.#pointer.begin(request, port.request(), (settled, outcome) => { this.#pointerSettled(settled, outcome); });
    this.#publish();
  }

  exitPointerLock(): void {
    if (!this.#live) return;
    this.#endPointer(null);
    this.#publish();
  }

  pointerLocked(): boolean {
    return this.#pointerPort?.locked() ?? false;
  }

  release(): CapabilityRelease {
    this.#live = false;
    // Every open request is revoked first, so that a late success is only undone.
    const lock = this.#keys.revoke(null);
    const request = this.#fullscreen.revoke(null);
    const pointer = this.#pointer.revoke(null);
    const fullscreen = this.#fullscreenPort;
    const errors = attemptAll([
      () => this.#stopStatus?.(),
      // The port unlocks only a lock of its own, pending or in force.
      () => fullscreen?.unlockKeys(),
      () => this.#disconnectFullscreen?.(),
      // While a request is open the port stays connected, so that a late lock is seen and exited; its release exits a
      // lock it holds.
      () => { if (!pointer) this.#disconnectPointer?.(); },
    ]);
    const closes: Promise<void>[] = [];
    if (fullscreen && lock) closes.push(this.#closeKeys(fullscreen, lock));
    const exiting = this.#exitFullscreen();
    if (exiting || request) closes.push(this.#closeFullscreen(exiting, request));
    if (pointer) {
      closes.push(pointer.then(() => {
        this.#disconnectPointer?.();
        if (this.#pointerUnknown) throw new CapabilityReleaseError('pointerLock', 'disconnected');
      }));
    }
    const pending = closes.length === 0 ? null : Promise.allSettled(closes).then((results) =>
      results.flatMap((result) => (result.status === 'rejected' ? [result.reason as unknown] : [])));
    return Object.freeze({ errors: Object.freeze(errors), closes: pending });
  }

  #facts(): CapabilityFacts {
    return this.#context?.facts() ?? NO_FACTS;
  }

  /** Session notifications only read, revoke and release host capabilities; they never control the session. */
  readonly #onStatus = (status: GameSessionStatus): undefined => {
    if (!this.#live) return;
    const seen = this.#seen;
    if (seen && status.runId !== seen.runId) {
      // A run that left its departure hold began, so this is a restart; one that left from it was a start rolled back.
      const restart = seen.phase !== 'transition';
      this.#fullscreen.revoke(restart ? null : seen.runId);
      if (restart) void this.#exitFullscreen();
      this.#endPointer(seen.runId);
    }
    this.#seen = runOf(status);
    this.update();
  };

  /**
   * Synchronously, so that the caller's gesture applies. Returns the new request, also one refused as `closing`; null
   * when none was made.
   */
  #requestFullscreen(port: FullscreenPort, runId: number | null): Request | null {
    if (!port.support().fullscreen || this.#fullscreen.pending) return null;
    const blocked = !this.#barrierOpen || this.#fullscreen.open !== null || this.#exiting !== null;
    if (!blocked && port.read().fullscreen) return null;
    const request = this.#fullscreen.next(runId);
    if (blocked) this.#fullscreen.failure = CLOSING;
    else this.#fullscreen.begin(request, port.requestFullscreen(), (settled, result) => { this.#fullscreenSettled(settled, result); });
    this.#publish();
    return request;
  }

  #fullscreenSettled(request: Request, result: FullscreenRequestResult): void {
    if (result.status === 'failed') {
      this.#fullscreen.failedAt(request, Object.freeze({ operation: 'request', reason: result.reason }));
    } else if (request.revoked) {
      // Set first, in case the exit's change report comes at once.
      this.#undoing = true;
      if (!this.#exitFullscreen()) this.#undoing = false;
    }
    this.update();
  }

  /**
   * Waits for an open key lock: the unlock already sent replaces it, unless that unlock failed and the lock took hold,
   * which is unlocked once more.
   */
  async #closeKeys(port: FullscreenPort, settled: Promise<void>): Promise<void> {
    await settled;
    if (port.read().keyboardLocked) port.unlockKeys();
  }

  /** A released port's requests still settle and its exits still act: a late success is exited too. */
  async #closeFullscreen(exiting: Promise<FullscreenExitResult> | null, settled: Promise<void> | null): Promise<void> {
    const exits = [exiting];
    if (settled) {
      await settled;
      exits.push(this.#exitFullscreen());
    }
    for (const result of await Promise.all(exits)) {
      if (result?.status === 'failed') throw new CapabilityReleaseError('fullscreen', result.reason);
    }
  }

  /** Exits the fullscreen this owner's port entered and still holds; null when there is none. */
  #exitFullscreen(): Promise<FullscreenExitResult> | null {
    const port = this.#fullscreenPort;
    if (this.#exiting || !port?.read().owned) return this.#exiting;
    const exiting = port.exitFullscreen().then((result) => {
      this.#exiting = null;
      if (result.status === 'failed') {
        this.#undoing = false;
        this.#fullscreen.failure = Object.freeze({ operation: 'release', reason: result.reason });
      } else {
        this.#fullscreen.released();
      }
      this.update();
      return result;
    });
    this.#exiting = exiting;
    return exiting;
  }

  #fullscreenSignal({ fullscreen }: FullscreenSignal): void {
    if (!this.#live) return;
    const left = this.#wasFullscreen && !fullscreen;
    const undone = left && this.#undoing;
    this.#wasFullscreen = fullscreen;
    if (left) this.#undoing = false;
    this.update();
    if (left && !undone) this.#context!.clear('focus-loss');
  }

  #updateKeys(): void {
    const port = this.#fullscreenPort;
    const codes = this.#codes;
    if (!port || !codes || !port.support().keyboardLock) return;
    const { runId, running, eligible } = this.#facts();
    // An open fullscreen request, a revoked one's late success included, is not settled fullscreen yet.
    const qualified = this.#barrierOpen && running && eligible && !this.#keysBlocked && !this.#exiting && !this.#fullscreen.open
      && port.read().fullscreen;
    if (!qualified) {
      if (this.#locked || this.#keys.pending) this.#unlockKeys(port);
      return;
    }
    // Locked, pending, or an unlocked request has yet to settle: one open request at a time.
    if (this.#locked || this.#keys.open) return;
    const request = this.#keys.next(runId);
    this.#keys.begin(request, port.lockKeys(codes), (settled, result) => { this.#keysSettled(settled, result); });
  }

  /** A failed unlock keeps the lock recorded, in force as far as anyone can tell, and is tried again on the next update. */
  #unlockKeys(port: FullscreenPort): void {
    try {
      port.unlockKeys();
    } catch {
      this.#keys.failure = RELEASE_FAILED;
      return;
    }
    this.#keys.revoke(null);
    this.#locked = null;
    this.#keys.released();
  }

  #keysSettled(request: Request, result: KeyboardLockResult): void {
    if (result.status === 'locked') {
      if (!request.revoked) this.#locked = request;
    } else if (!request.revoked) {
      this.#keys.failure = Object.freeze({ operation: 'request', reason: result.reason });
      this.#keysBlocked = true;
    } else if (result.reason !== 'superseded') {
      // A revoked lock this owner's own unlock replaced is no failure; any other is its own, and blocks nothing.
      this.#keys.failedAt(request, Object.freeze({ operation: 'request', reason: result.reason }));
    }
    this.update();
  }

  /** The port confirmed the open request's lock, before that request's outcome is handled. */
  #pointerLocked(): void {
    const request = this.#pointer.open?.request;
    if (request) this.#pointer.answered(request);
    if (this.#live && request && !request.revoked) {
      this.#held = request;
      this.#publish();
      return;
    }
    this.#held = STALE;
    this.#exitPointer();
  }

  #pointerUnlocked(): void {
    const held = this.#held;
    this.#held = null;
    if (!this.#live) return;
    if (held !== null && held !== STALE) {
      this.#pointer.released();
      this.#context!.clear('pointer-lock-exit');
    }
    this.#publish();
  }

  #pointerSettled(request: Request, outcome: PointerLockOutcome): void {
    if (outcome.status === 'disconnected') this.#pointerUnknown = true;
    else if (outcome.status === 'failed') this.#pointer.failedAt(request, Object.freeze({ operation: 'request', reason: outcome.reason }));
    this.#publish();
  }

  /**
   * Revokes the open request and exits the held lock of run `runId`, or of any run when null, once: revoked first, so
   * no pointer input passes meanwhile; a failed exit leaves it as it was, to be tried again.
   */
  #endPointer(runId: number | null): void {
    this.#pointer.revoke(runId);
    const held = this.#held;
    if (!held || held === STALE || held.revoked || (runId !== null && held.runId !== runId)) return;
    held.revoked = true;
    if (!this.#exitPointer()) held.revoked = false;
  }

  /**
   * The port exits only its own lock, while the host still reports it; the port's report of the change ends it here.
   * Returns whether the exit was asked for.
   */
  #exitPointer(): boolean {
    try {
      this.#pointerPort!.exit();
      return true;
    } catch {
      this.#pointer.failure = RELEASE_FAILED;
      return false;
    }
  }

  /** Disconnects every connected port; returns the failures. */
  #disconnect(): unknown[] {
    return attemptAll([() => this.#disconnectFullscreen?.(), () => this.#disconnectPointer?.()]);
  }

  #publish(): void {
    const context = this.#context;
    if (!this.#live || !context) return;
    const fullscreen = this.#fullscreenPort;
    const support = fullscreen?.support();
    const show = (track: Track, supported: boolean, active: boolean): CapabilityStatus => {
      const { failure } = track;
      let state: CapabilityState = 'idle';
      if (!supported) state = 'unsupported';
      // A Pointer Lock is confirmed before its request's outcome is handled.
      else if (active) state = 'active';
      else if (track.pending) state = 'pending';
      else if (failure?.operation === 'request') state = 'failed';
      return { state, ownerId: context.ownerId, runId: track.latest?.runId ?? null, generation: track.generation, failure };
    };
    context.status.setCapabilities({
      fullscreen: show(this.#fullscreen, support?.fullscreen ?? false, fullscreen?.read().fullscreen ?? false),
      keyboardLock: show(this.#keys, (support?.keyboardLock ?? false) && this.#codes !== null, this.#locked !== null),
      pointerLock: show(this.#pointer, this.#pointerPort?.supported() ?? false, this.#held !== null && this.#held !== STALE),
    });
  }
}

/** Validates the key lock codes at once; nothing is connected until the input consumer connects. */
export function createInputCapabilities(ports: CapabilityPorts): InputCapabilityController {
  return new Capabilities(ports);
}
