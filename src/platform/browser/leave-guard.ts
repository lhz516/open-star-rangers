import type { LeaveGuard } from '../../app/mission/mission-ports.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';

/** The part of a `beforeunload` event the guard uses. */
export interface LeaveEvent {
  preventDefault(): void;
}

/** Where the guard listens; the browser passes `window`. */
export interface LeaveTarget {
  addEventListener(type: 'beforeunload', listener: (event: LeaveEvent) => void): void;
  removeEventListener(type: 'beforeunload', listener: (event: LeaveEvent) => void): void;
}

/**
 * The leave-page guard (P3-04 离页保护). Each registration installs one `beforeunload` listener whose handler only calls
 * `preventDefault()`, the standard request for the browser's own confirmation. Nothing is installed until a registration.
 */
export function createLeaveGuard(target: LeaveTarget): LeaveGuard {
  return () => {
    let active = true;
    const listener = (event: LeaveEvent): void => {
      if (active) event.preventDefault();
    };
    try {
      target.addEventListener('beforeunload', listener);
    } catch (cause) {
      active = false;
      // The host may have added the listener before throwing; removing one that is absent does nothing.
      try {
        target.removeEventListener('beforeunload', listener);
      } catch (rollback) {
        throw new RollbackError(cause, [rollback], 'Leave guard registration and rollback failed');
      }
      throw cause;
    }
    return () => {
      if (!active) return undefined;
      // Inert first, so a listener whose removal throws no longer asks for confirmation.
      active = false;
      target.removeEventListener('beforeunload', listener);
      return undefined;
    };
  };
}
