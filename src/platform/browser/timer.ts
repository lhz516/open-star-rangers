import type { MonotonicClock, OneShotTimer } from '../../app/mission/mission-ports.ts';

/** Browsers fire a timeout at once when its delay exceeds a signed 32-bit millisecond count. */
const MAX_DELAY_MS = 2_147_483_647;

/** Wraps a host time source; the browser passes `performance.now`. */
export function createMonotonicClock(now: () => number): MonotonicClock {
  let last = -Infinity;
  return () => {
    const value = now();
    if (!Number.isFinite(value)) throw new RangeError('The host clock returned a time that is not a finite number');
    if (value < last) throw new RangeError('The host clock went backwards');
    last = value;
    return value;
  };
}

/** Host timeouts with an opaque handle type; registration is atomic: throwing means nothing was scheduled. */
export interface TimerHost<H> {
  setTimeout(callback: () => void, delayMs: number): H;
  clearTimeout(handle: H): void;
}

/**
 * One-shot timers over host timeouts. Handles are the adapter's own, counted from 0, so they are nonnegative safe
 * integers whatever the host returns. The live entry holds the callback, so neither a cancelled timer nor a host that
 * fires after cancelling can call it, and cancelling drops it even if the host keeps its own closure.
 */
export function createOneShotTimer<H>(host: TimerHost<H>): OneShotTimer {
  const live = new Map<number, { readonly hostHandle: H; readonly callback: () => undefined }>();
  let next = 0;
  return {
    schedule(callback, delayMs) {
      if (!(Number.isFinite(delayMs) && delayMs >= 0 && delayMs <= MAX_DELAY_MS)) {
        throw new RangeError(`A timer delay must be from 0 to ${MAX_DELAY_MS} ms`);
      }
      if (!Number.isSafeInteger(next)) throw new RangeError('Timer handles are exhausted');
      const handle = next++;
      const hostHandle = host.setTimeout(() => {
        const entry = live.get(handle);
        if (!entry) return;
        live.delete(handle);
        entry.callback();
      }, delayMs);
      live.set(handle, { hostHandle, callback });
      return handle;
    },
    cancel(handle) {
      const entry = live.get(handle);
      if (!entry) return undefined;
      live.delete(handle);
      host.clearTimeout(entry.hostHandle);
      return undefined;
    },
  };
}
