import type { SessionCleanup, SessionHost, SessionLifecycleEvent, SessionVisibility } from '../app/session-host.ts';

function readVisibility(): SessionVisibility {
  return document.visibilityState;
}

class LifecycleSubscription {
  readonly #installed: { target: EventTarget; type: string; listener: EventListener }[] = [];

  constructor(notify: (event: SessionLifecycleEvent) => undefined) {
    try {
      this.#add(document, 'visibilitychange', () => notify({ type: 'visibility', visibility: readVisibility() }));
      this.#add(window, 'pagehide', () => notify({ type: 'pagehide' }));
      this.#add(window, 'pageshow', () => notify({ type: 'pageshow', visibility: readVisibility() }));
    } catch (cause) {
      try {
        this.cancel();
      } catch (cleanup) {
        throw new AggregateError([cause, cleanup], 'Lifecycle registration and rollback failed', { cause: cleanup });
      }
      throw cause;
    }
  }

  cancel(): undefined {
    const installed = this.#installed.splice(0);
    const errors: unknown[] = [];
    for (const { target, type, listener } of installed) {
      try {
        target.removeEventListener(type, listener);
      } catch (cause) {
        errors.push(cause);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Lifecycle listener removal failed');
  }

  #add(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.#installed.push({ target, type, listener });
  }
}

export function createBrowserSessionHost(): SessionHost {
  return {
    requestFrame: callback => window.requestAnimationFrame(callback),
    cancelFrame: handle => { window.cancelAnimationFrame(handle); },
    readVisibility,
    subscribeLifecycle(listener): SessionCleanup {
      const subscription = new LifecycleSubscription(listener);
      return subscription.cancel.bind(subscription);
    },
  };
}
