import type { SessionCleanup, SessionHost, SessionLifecycleEvent, SessionVisibility } from './session-host.ts';

/**
 * A SessionHost that tests drive by hand: frame callbacks wait in `pending` until `deliver(now)`, lifecycle events go
 * out through `emit`, and each port operation can be made to fail.
 */
export class ControlledHost implements SessionHost {
  readonly pending = new Map<number, (now: number) => undefined>();
  readonly callbacks: ((now: number) => undefined)[] = [];
  readonly listeners = new Set<(event: SessionLifecycleEvent) => undefined>();
  readonly cancelled: number[] = [];
  visibility: SessionVisibility = 'visible';
  nextHandle = 0;
  reusedHandle: number | null = null;
  requestFailure: unknown;
  cancelFailure: unknown;
  readFailure: unknown;
  subscribeFailure: unknown;
  unsubscribed = 0;

  requestFrame(callback: (now: number) => undefined): number {
    if (this.requestFailure !== undefined) throw this.requestFailure;
    const handle = this.reusedHandle ?? this.nextHandle++;
    this.pending.set(handle, callback); this.callbacks.push(callback);
    return handle;
  }
  cancelFrame(handle: number): undefined {
    this.cancelled.push(handle);
    if (this.cancelFailure !== undefined) throw this.cancelFailure;
    this.pending.delete(handle);
  }
  readVisibility(): SessionVisibility {
    if (this.readFailure !== undefined) throw this.readFailure;
    return this.visibility;
  }
  subscribeLifecycle(listener: (event: SessionLifecycleEvent) => undefined): SessionCleanup {
    if (this.subscribeFailure !== undefined) throw this.subscribeFailure;
    this.listeners.add(listener);
    return () => { if (this.listeners.delete(listener)) this.unsubscribed++; };
  }
  deliver(now: number): void {
    const entry = this.pending.entries().next().value;
    if (!entry) throw new Error('No pending request');
    const [handle, callback] = entry; this.pending.delete(handle); callback(now);
  }
  emit(event: SessionLifecycleEvent): void {
    if (event.type !== 'pagehide') this.visibility = event.visibility;
    for (const listener of [...this.listeners]) if (this.listeners.has(listener)) listener(event);
  }
}
