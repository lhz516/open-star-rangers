import type { MonotonicClock, OneShotTimer } from '../../app/mission/mission-ports.ts';
import { createMonotonicClock, createOneShotTimer } from './timer.ts';

/** Reads `performance.now()`. */
export function createBrowserClock(): MonotonicClock {
  return createMonotonicClock(() => performance.now());
}

/** One-shot timers over `setTimeout` and `clearTimeout`. */
export function createBrowserTimer(): OneShotTimer {
  return createOneShotTimer<number>({
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: handle => { clearTimeout(handle); },
  });
}
