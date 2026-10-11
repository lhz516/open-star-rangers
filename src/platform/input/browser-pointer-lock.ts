import { createPointerLock } from './pointer-lock.ts';
import type { PointerLockHost, PointerLockPort } from './pointer-lock.ts';

type PointerLockTarget = HTMLElement | (() => HTMLElement | null);

/** Separate from the port so a test entry can wrap `request` to simulate a pending or refused permission. */
export function createBrowserPointerLockHost(target: PointerLockTarget): PointerLockHost {
  const dynamic = typeof target === 'function';
  const readTarget = typeof target === 'function' ? target : () => target;
  let lockedTarget: HTMLElement | null = null;
  return {
    supported() {
      const element = readTarget();
      return element !== null && 'pointerLockElement' in element.ownerDocument
        && typeof element.ownerDocument.exitPointerLock === 'function' && typeof element.requestPointerLock === 'function';
    },
    readLock() {
      const element = lockedTarget ?? readTarget();
      const owner = element?.ownerDocument ?? globalThis.document;
      const locked = owner.pointerLockElement;
      if (!locked) {
        lockedTarget = null;
        return 'none';
      }
      if (element && locked === element) {
        lockedTarget = element;
        return 'target';
      }
      // Inside a shadow tree the document reports the retargeted host; the target's own root reports the target.
      const root = element?.getRootNode();
      if (element && root && 'pointerLockElement' in root && root.pointerLockElement === element) {
        lockedTarget = element;
        return 'target';
      }
      return 'other';
    },
    // Default options only, never `unadjustedMovement`. Engines without the promise return undefined.
    request() {
      const element = readTarget();
      if (!element) throw new Error('The game input zone is not mounted');
      lockedTarget = element;
      const request = element.requestPointerLock();
      if (!request) return undefined;
      return request.then(
        () => { if (element.ownerDocument.pointerLockElement !== element) lockedTarget = null; },
        error => {
          if (element.ownerDocument.pointerLockElement !== element) lockedTarget = null;
          throw error;
        },
      );
    },
    exit() {
      const element = lockedTarget ?? readTarget();
      if (element && element.ownerDocument.pointerLockElement === element) void element.ownerDocument.exitPointerLock();
    },
    readRect() {
      const element = readTarget() ?? lockedTarget;
      if (!element) return { left: 0, top: 0, width: 0, height: 0 };
      const { left, top, width, height } = element.getBoundingClientRect();
      return { left, top, width, height };
    },
    listenLock(type, listener) {
      const owner = readTarget()?.ownerDocument ?? globalThis.document;
      owner.addEventListener(type, listener);
      return () => owner.removeEventListener(type, listener);
    },
    listenPointer(type, listener) {
      const owner = readTarget()?.ownerDocument ?? globalThis.document;
      const callback: EventListener = rawEvent => {
        if (!(rawEvent instanceof MouseEvent)) return;
        const event = rawEvent;
        const element = lockedTarget ?? readTarget();
        const eventTarget = event.target;
        if (!element || !(eventTarget instanceof Node)) return;
        if (dynamic && eventTarget !== element && !element.contains(eventTarget) && !event.composedPath().includes(element)) return;
        listener({
          button: event.button,
          movementX: event.movementX,
          movementY: event.movementY,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      };
      if (dynamic) {
        owner.addEventListener(type, callback);
        return () => owner.removeEventListener(type, callback);
      }
      const element = readTarget();
      if (!element) return () => undefined;
      element.addEventListener(type, callback);
      return () => element.removeEventListener(type, callback);
    },
  };
}

export function createBrowserPointerLock(target: PointerLockTarget): PointerLockPort {
  return createPointerLock(createBrowserPointerLockHost(target));
}
