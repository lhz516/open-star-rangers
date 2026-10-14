import { createFullscreenPort } from './fullscreen.ts';
import type { FullscreenHost, FullscreenPort } from './fullscreen.ts';

/** Keyboard Lock is not in the DOM library; Chromium exposes it as `navigator.keyboard` in secure contexts. */
interface KeyboardLockApi {
  lock(codes: string[]): Promise<void>;
  unlock(): void;
}

function keyboardLock(): KeyboardLockApi | null {
  const keyboard = (navigator as Navigator & { readonly keyboard?: Partial<KeyboardLockApi> }).keyboard;
  return typeof keyboard?.lock === 'function' && typeof keyboard.unlock === 'function' ? keyboard as KeyboardLockApi : null;
}

function requireKeyboardLock(): KeyboardLockApi {
  const api = keyboardLock();
  if (!api) throw new Error('Keyboard Lock is not available');
  return api;
}

const host: FullscreenHost = {
  fullscreenEnabled: () => document.fullscreenEnabled === true
    && typeof document.documentElement.requestFullscreen === 'function'
    && typeof document.exitFullscreen === 'function',
  isFullscreen: () => document.fullscreenElement === document.documentElement,
  requestFullscreen: () => document.documentElement.requestFullscreen(),
  exitFullscreen: () => document.exitFullscreen(),
  listen(type, listener) {
    document.addEventListener(type, listener);
    return () => document.removeEventListener(type, listener);
  },
  keyboardLockAvailable: () => keyboardLock() !== null,
  lockKeys: codes => requireKeyboardLock().lock([...codes]),
  unlockKeys: () => { requireKeyboardLock().unlock(); },
};

/**
 * Fullscreen of `document.documentElement`, so the mission page's status, errors and exit controls stay visible, and
 * Keyboard Lock through `navigator.keyboard`. Each call returns an independent port.
 */
export function createBrowserFullscreen(): FullscreenPort {
  return createFullscreenPort(host);
}
