import { describe, expect, it } from 'vitest';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { createLeaveGuard } from './leave-guard.ts';
import type { LeaveEvent, LeaveTarget } from './leave-guard.ts';

class Target implements LeaveTarget {
  readonly listeners = new Set<(event: LeaveEvent) => void>();
  readonly calls: string[] = [];
  failAdd: 'before' | 'after' | null = null;
  failRemove: Error | null = null;
  readonly failure = new Error('add failed');
  addEventListener(type: 'beforeunload', listener: (event: LeaveEvent) => void): void {
    this.calls.push(`add ${type}`);
    if (this.failAdd === 'before') throw this.failure;
    this.listeners.add(listener);
    if (this.failAdd === 'after') throw this.failure;
  }
  removeEventListener(type: 'beforeunload', listener: (event: LeaveEvent) => void): void {
    this.calls.push(`remove ${type}`);
    if (this.failRemove) throw this.failRemove;
    this.listeners.delete(listener);
  }
  /** Dispatches to every listener and records each property the handlers read or write on the event. */
  dispatch(): string[] {
    const touched: string[] = [];
    const event = new Proxy({ preventDefault: () => { touched.push('preventDefault()'); }, returnValue: '' }, {
      get(subject, property, receiver) {
        touched.push(`get ${String(property)}`);
        return Reflect.get(subject, property, receiver);
      },
      set(subject, property, value, receiver) {
        touched.push(`set ${String(property)}`);
        return Reflect.set(subject, property, value, receiver);
      },
    });
    for (const listener of [...this.listeners]) listener(event);
    return touched;
  }
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected a throw');
}

describe('leave guard', () => {
  it('installs nothing until a registration', () => {
    const target = new Target();
    createLeaveGuard(target);
    expect(target.calls).toEqual([]);
  });

  it('installs one listener per registration whose handler only calls preventDefault', () => {
    const target = new Target();
    const revoke = createLeaveGuard(target)();
    expect(target.calls).toEqual(['add beforeunload']);
    expect(target.listeners.size).toBe(1);
    expect(target.dispatch()).toEqual(['get preventDefault', 'preventDefault()']);
    expect(revoke()).toBeUndefined();
  });

  it('revokes its own listener once; later revokes do nothing', () => {
    const target = new Target();
    const guard = createLeaveGuard(target);
    const first = guard();
    const second = guard();
    expect(target.listeners.size).toBe(2);
    first();
    first();
    expect(target.calls).toEqual(['add beforeunload', 'add beforeunload', 'remove beforeunload']);
    expect(target.listeners.size).toBe(1);
    expect(target.dispatch()).toEqual(['get preventDefault', 'preventDefault()']);
    second();
    expect(target.listeners.size).toBe(0);
    expect(target.dispatch()).toEqual([]);
  });

  it('rolls back a failed registration, whether or not the host added the listener, and rethrows', () => {
    for (const failAdd of ['before', 'after'] as const) {
      const target = new Target();
      target.failAdd = failAdd;
      expect(thrownBy(() => createLeaveGuard(target)())).toBe(target.failure);
      expect(target.calls).toEqual(['add beforeunload', 'remove beforeunload']);
      expect(target.listeners.size).toBe(0);
    }
  });

  it('reports a failed rollback with both causes', () => {
    const target = new Target();
    target.failAdd = 'after';
    target.failRemove = new Error('remove failed');
    const error = thrownBy(() => createLeaveGuard(target)());
    expect(error).toBeInstanceOf(RollbackError);
    expect((error as RollbackError).cause).toBe(target.failure);
    expect((error as RollbackError).errors).toEqual([target.failure, target.failRemove]);
    // The listener that could not be removed no longer asks for confirmation.
    expect(target.dispatch()).toEqual([]);
  });

  it('throws a removal failure once for latching, and the stuck listener goes inert', () => {
    const target = new Target();
    const revoke = createLeaveGuard(target)();
    target.failRemove = new Error('remove failed');
    expect(thrownBy(revoke)).toBe(target.failRemove);
    expect(revoke()).toBeUndefined();
    expect(target.calls).toEqual(['add beforeunload', 'remove beforeunload']);
    expect(target.listeners.size).toBe(1);
    expect(target.dispatch()).toEqual([]);
  });
});
