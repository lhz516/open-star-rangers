import { describe, expect, it } from 'vitest';
import { createMonotonicClock, createOneShotTimer } from './timer.ts';
import type { TimerHost } from './timer.ts';

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected a throw');
}

describe('monotonic clock', () => {
  it('reads the host only when called and returns finite, nondecreasing times', () => {
    const readings = [0, 0, 12.5, 1e9];
    let reads = 0;
    const clock = createMonotonicClock(() => readings[reads++]!);
    expect(reads).toBe(0);
    expect([clock(), clock(), clock(), clock()]).toEqual(readings);
  });

  it('reports a time that is not a finite number instead of returning it', () => {
    for (const value of [Number.NaN, Infinity, -Infinity, '5' as unknown as number, undefined as unknown as number]) {
      expect(() => createMonotonicClock(() => value)()).toThrow(RangeError);
    }
  });

  it('reports a backward step against the highest time returned so far', () => {
    const readings = [5, Number.NaN, 3, 4.999, 5, 6];
    let reads = 0;
    const clock = createMonotonicClock(() => readings[reads++]!);
    expect(clock()).toBe(5);
    expect(() => clock()).toThrow(RangeError);
    expect(() => clock()).toThrow(/backwards/);
    expect(() => clock()).toThrow(/backwards/);
    expect([clock(), clock()]).toEqual([5, 6]);
  });

  it('rethrows a host failure unchanged', () => {
    const failure = new Error('no clock');
    expect(thrownBy(() => createMonotonicClock(() => { throw failure; })())).toBe(failure);
  });
});

interface Scheduled {
  readonly handle: { readonly id: number };
  readonly callback: () => void;
  readonly delayMs: number;
}

/** Keeps every callback after clearing, so a test can fire one late, as a host that fires after cancelling would. */
class Host implements TimerHost<{ readonly id: number }> {
  readonly scheduled: Scheduled[] = [];
  readonly cleared: { readonly id: number }[] = [];
  failSet: Error | null = null;
  failClear: Error | null = null;
  setTimeout(callback: () => void, delayMs: number): { readonly id: number } {
    if (this.failSet) throw this.failSet;
    const handle = { id: this.scheduled.length };
    this.scheduled.push({ handle, callback, delayMs });
    return handle;
  }
  clearTimeout(handle: { readonly id: number }): void {
    this.cleared.push(handle);
    if (this.failClear) throw this.failClear;
  }
  fire(index: number): void {
    this.scheduled[index]!.callback();
  }
}

function setup() {
  const host = new Host();
  const timer = createOneShotTimer(host);
  const calls: string[] = [];
  const callback = (name: string) => (): undefined => { calls.push(name); };
  return { host, timer, calls, callback };
}

describe('one-shot timer', () => {
  it('schedules nothing until asked, then returns its own handles from 0 and calls back once, asynchronously', () => {
    const { host, timer, calls, callback } = setup();
    expect(host.scheduled).toEqual([]);
    expect(timer.schedule(callback('a'), 3000)).toBe(0);
    expect(timer.schedule(callback('b'), 0)).toBe(1);
    expect(host.scheduled.map(entry => entry.delayMs)).toEqual([3000, 0]);
    expect(calls).toEqual([]);
    host.fire(1);
    host.fire(0);
    host.fire(0);
    expect(calls).toEqual(['b', 'a']);
    expect(host.cleared).toEqual([]);
  });

  it('cancels handle 0 like any other, and a late host callback after cancelling does not run', () => {
    const { host, timer, calls, callback } = setup();
    const handle = timer.schedule(callback('a'), 10);
    expect(handle).toBe(0);
    expect(timer.cancel(handle)).toBeUndefined();
    expect(host.cleared).toEqual([host.scheduled[0]!.handle]);
    host.fire(0);
    expect(calls).toEqual([]);
  });

  it('cancels idempotently: repeated, fired, unknown and malformed handles do not reach the host', () => {
    const { host, timer, calls, callback } = setup();
    const cancelled = timer.schedule(callback('a'), 10);
    const fired = timer.schedule(callback('b'), 10);
    timer.cancel(cancelled);
    host.fire(1);
    for (const handle of [cancelled, fired, 2, 99, -1, 0.5, Number.NaN]) expect(timer.cancel(handle)).toBeUndefined();
    expect(host.cleared).toHaveLength(1);
    expect(calls).toEqual(['b']);
  });

  it('keeps other timers when one is cancelled', () => {
    const { host, timer, calls, callback } = setup();
    timer.schedule(callback('a'), 10);
    const b = timer.schedule(callback('b'), 10);
    timer.schedule(callback('c'), 10);
    timer.cancel(b);
    host.fire(0);
    host.fire(1);
    host.fire(2);
    expect(calls).toEqual(['a', 'c']);
  });

  it('rethrows a cancellation failure once, and the callback still never runs', () => {
    const { host, timer, calls, callback } = setup();
    const handle = timer.schedule(callback('a'), 10);
    host.failClear = new Error('clear failed');
    expect(thrownBy(() => timer.cancel(handle))).toBe(host.failClear);
    expect(timer.cancel(handle)).toBeUndefined();
    expect(host.cleared).toHaveLength(1);
    host.fire(0);
    expect(calls).toEqual([]);
  });

  it('rejects a delay outside 0 to 2,147,483,647 ms before reaching the host', () => {
    const { host, timer, callback } = setup();
    for (const delayMs of [-1, -Number.MIN_VALUE, 2_147_483_648, Number.NaN, Infinity, '5' as unknown as number]) {
      expect(() => timer.schedule(callback('a'), delayMs)).toThrow(RangeError);
    }
    expect(host.scheduled).toEqual([]);
    expect(timer.schedule(callback('a'), 2_147_483_647)).toBeGreaterThanOrEqual(0);
    expect(timer.schedule(callback('a'), 0.5)).toBeGreaterThanOrEqual(0);
    expect(host.scheduled.map(entry => entry.delayMs)).toEqual([2_147_483_647, 0.5]);
  });

  it('rethrows a registration failure unchanged and leaves nothing live', () => {
    const { host, timer, calls, callback } = setup();
    host.failSet = new Error('set failed');
    expect(thrownBy(() => timer.schedule(callback('a'), 10))).toBe(host.failSet);
    host.failSet = null;
    const handle = timer.schedule(callback('b'), 10);
    expect(Number.isSafeInteger(handle) && handle >= 0).toBe(true);
    host.fire(0);
    expect(calls).toEqual(['b']);
    expect(timer.cancel(handle)).toBeUndefined();
    expect(host.cleared).toEqual([]);
  });

  it('lets a callback failure reach the host after its handle is spent', () => {
    const { host, timer } = setup();
    const failure = new Error('callback failed');
    const handle = timer.schedule(() => { throw failure; }, 10);
    expect(thrownBy(() => host.fire(0))).toBe(failure);
    timer.cancel(handle);
    expect(host.cleared).toEqual([]);
  });
});
