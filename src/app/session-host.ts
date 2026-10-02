export type SessionVisibility = 'visible' | 'hidden';

export type SessionLifecycleEvent =
  | { readonly type: 'visibility'; readonly visibility: SessionVisibility }
  | { readonly type: 'pagehide' }
  | { readonly type: 'pageshow'; readonly visibility: SessionVisibility };

export type SessionCleanup = () => undefined;

export interface SessionHost {
  // Return a nonnegative safe integer handle before delivering the callback asynchronously.
  requestFrame(callback: (nowMs: number) => undefined): number;
  cancelFrame(handle: number): undefined;
  readVisibility(): SessionVisibility;
  // Roll back partial registration before throwing; cancellation is idempotent.
  subscribeLifecycle(listener: (event: SessionLifecycleEvent) => undefined): SessionCleanup;
}
