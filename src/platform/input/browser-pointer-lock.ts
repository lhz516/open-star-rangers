import { createPointerLock } from './pointer-lock.ts';
import type { PointerLockHost, PointerLockPort } from './pointer-lock.ts';

/** Separate from the port so a test entry can wrap `request` to simulate a pending or refused permission. */
export function createBrowserPointerLockHost(element: HTMLElement): PointerLockHost {
  const owner = element.ownerDocument;
  return {
    supported: () => 'pointerLockElement' in owner
      && typeof owner.exitPointerLock === 'function' && typeof element.requestPointerLock === 'function',
    readLock() {
      const locked = owner.pointerLockElement;
      if (!locked) return 'none';
      if (locked === element) return 'target';
      // Inside a shadow tree the document reports the retargeted host; the target's own root reports the target.
      const root = element.getRootNode();
      return 'pointerLockElement' in root && root.pointerLockElement === element ? 'target' : 'other';
    },
    // Default options only, never `unadjustedMovement`. Engines without the promise return undefined.
    request: () => element.requestPointerLock(),
    exit: () => owner.exitPointerLock(),
    readRect() {
      const { left, top, width, height } = element.getBoundingClientRect();
      return { left, top, width, height };
    },
    listenLock(type, listener) {
      owner.addEventListener(type, listener);
      return () => owner.removeEventListener(type, listener);
    },
    listenPointer(type, listener) {
      element.addEventListener(type, listener);
      return () => element.removeEventListener(type, listener);
    },
  };
}

export function createBrowserPointerLock(element: HTMLElement): PointerLockPort {
  return createPointerLock(createBrowserPointerLockHost(element));
}
