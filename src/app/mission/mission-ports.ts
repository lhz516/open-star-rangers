// The host capabilities the mission flow and owner need (P3-04 S-05, the "应用端口" row of the spec's data model).
// Types only: app/mission stays DOM-free, platform implements these, and AppPorts assembles them. No implementation
// installs anything when imported.

/**
 * Draws one seed for each world creation attempt. Returns a uint32; the caller reports a throw or any other value as a
 * failed start and never falls back to a fixed seed or host time. Successive draws may repeat a value.
 */
export type SeedSource = () => number;

/** Reads host time in milliseconds. The value is finite and never smaller than an earlier one; otherwise it throws. */
export type MonotonicClock = () => number;

/** A cancellable one-shot host timer. */
export interface OneShotTimer {
  /**
   * Returns a nonnegative safe integer handle (0 included), then calls `callback` once, asynchronously, after about
   * `delayMs` (0 to 2,147,483,647). The host may call back slightly early, so callers check elapsed time with a
   * {@link MonotonicClock}. Throws when registration fails, leaving nothing registered.
   */
  schedule(callback: () => undefined, delayMs: number): number;
  /** Idempotent. A cancelled callback never runs, even when the host's cancellation throws. */
  cancel(handle: number): undefined;
}

/** Undoes one registration. Idempotent; throws when removal fails, so the caller can latch the failure. */
export type Revoke = () => undefined;

/**
 * Registers one native leave-page confirmation (`beforeunload`) and returns its revoke. The handler only asks for the
 * browser's own confirmation: no custom text, and no exit, cleanup or export. A registration that fails rolls back what
 * it acquired before throwing.
 */
export type LeaveGuard = () => Revoke;

/**
 * How a development file save ended. `requested` means the browser accepted a download request, not that a file was
 * written. `failed` means no request was made and everything acquired was released. `cleanup-failed` means releasing
 * something threw, whether or not the request was made.
 */
export type FileSaveResult =
  | { readonly status: 'requested' }
  | { readonly status: 'failed'; readonly reason: 'disposed' }
  | { readonly status: 'failed'; readonly reason: 'failed' | 'cleanup-failed'; readonly error: unknown };

/**
 * Saves text under a file name (development diagnostics only). The adapter owns the Blob, object URL and temporary
 * download element of each save and releases them on success, on failure and when its owner disposes it.
 */
export interface FileSave {
  save(name: string, text: string): FileSaveResult;
  /** Idempotent. Later saves fail with `disposed` without acquiring anything. */
  dispose(): undefined;
}
