import { describe, expect, it } from 'vitest';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { createFullscreenPort, UNLOCKABLE_KEY_CODES } from './fullscreen.ts';
import type { FullscreenEventType, FullscreenHost, FullscreenSignal } from './fullscreen.ts';

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const hostError = (name: string): Error => Object.assign(new Error(`secret host detail ${name}`), { name });

/** A controllable document: tests settle each request themselves and fire the events a browser would. */
class Host implements FullscreenHost {
  readonly calls: string[] = [];
  readonly listeners = new Map<FullscreenEventType, Set<() => void>>();
  readonly requests: Deferred[] = [];
  readonly exits: Deferred[] = [];
  readonly locks: { readonly codes: readonly string[]; readonly request: Deferred }[] = [];
  enabled = true;
  lockAvailable = true;
  fullscreen = false;
  failListen: { readonly type: FullscreenEventType; readonly error: Error } | null = null;
  failRemove: Error | null = null;
  failCall: Error | null = null;

  fullscreenEnabled(): boolean { return this.enabled; }
  isFullscreen(): boolean { return this.fullscreen; }
  keyboardLockAvailable(): boolean { return this.lockAvailable; }

  requestFullscreen(): Promise<void> {
    this.calls.push('requestFullscreen');
    if (this.failCall) throw this.failCall;
    const request = deferred();
    this.requests.push(request);
    return request.promise;
  }

  exitFullscreen(): Promise<void> {
    this.calls.push('exitFullscreen');
    if (this.failCall) throw this.failCall;
    const request = deferred();
    this.exits.push(request);
    return request.promise;
  }

  lockKeys(codes: readonly string[]): Promise<void> {
    this.calls.push(`lockKeys ${codes.join(',')}`);
    if (this.failCall) throw this.failCall;
    const request = deferred();
    this.locks.push({ codes, request });
    return request.promise;
  }

  unlockKeys(): void {
    this.calls.push('unlockKeys');
    if (this.failCall) throw this.failCall;
  }

  listen(type: FullscreenEventType, listener: () => void): () => void {
    this.calls.push(`listen ${type}`);
    if (this.failListen?.type === type) throw this.failListen.error;
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
    return () => {
      this.calls.push(`remove ${type}`);
      if (this.failRemove) throw this.failRemove;
      set.delete(listener);
    };
  }

  emit(type: FullscreenEventType): void {
    for (const listener of [...this.listeners.get(type) ?? []]) listener();
  }

  /** The browser's order: the element changes, the promise resolves, then `fullscreenchange` fires. */
  async enter(index = this.requests.length - 1): Promise<void> {
    this.fullscreen = true;
    this.requests[index]!.resolve();
    await flush();
    this.emit('fullscreenchange');
  }

  /** The user (or anything else) leaves fullscreen without the port. */
  leave(): void {
    this.fullscreen = false;
    this.emit('fullscreenchange');
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

const flush = (): Promise<void> => new Promise(done => { setTimeout(done, 0); });

function connected(host = new Host()) {
  const port = createFullscreenPort(host);
  const signals: FullscreenSignal[] = [];
  const release = port.connect(signal => { signals.push(signal); });
  return { host, port, signals, release };
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected a throw');
}

describe('fullscreen port: support', () => {
  it.each([
    [true, true], [true, false], [false, true], [false, false],
  ])('reports fullscreen %s and keyboard lock %s separately', (fullscreen, keyboardLock) => {
    const host = new Host();
    host.enabled = fullscreen;
    host.lockAvailable = keyboardLock;
    const support = createFullscreenPort(host).support();
    expect(support).toEqual({ fullscreen, keyboardLock });
    expect(Object.isFrozen(support)).toBe(true);
    expect(host.calls).toEqual([]);
  });

  it('does not request or lock what is unsupported', async () => {
    const { host, port } = connected();
    host.enabled = false;
    host.lockAvailable = false;
    await expect(port.requestFullscreen()).resolves.toEqual({ status: 'failed', reason: 'unsupported' });
    await expect(port.lockKeys(['KeyA'])).resolves.toEqual({ status: 'failed', reason: 'unsupported' });
    expect(host.calls).toEqual(['listen fullscreenchange', 'listen fullscreenerror']);
  });
});

describe('fullscreen port: requests', () => {
  it('calls the host synchronously and resolves by the actual fullscreen element', async () => {
    const { host, port, signals } = connected();
    const result = port.requestFullscreen();
    expect(host.calls.at(-1)).toBe('requestFullscreen');
    expect(port.read()).toEqual({ fullscreen: false, owned: false, keyboardLocked: false });
    await host.enter();
    await expect(result).resolves.toEqual({ status: 'fullscreen' });
    expect(port.read()).toEqual({ fullscreen: true, owned: true, keyboardLocked: false });
    expect(signals).toEqual([{ type: 'change', fullscreen: true, owned: true, keyboardLocked: false }]);
    expect(Object.isFrozen(signals[0])).toBe(true);
  });

  it('owns the fullscreen only once its own request resolves, even when the change arrives first', async () => {
    const { host, port, signals } = connected();
    const result = port.requestFullscreen();
    host.fullscreen = true;
    host.emit('fullscreenchange');
    expect(signals).toEqual([{ type: 'change', fullscreen: true, owned: false, keyboardLocked: false }]);
    host.requests[0]!.resolve();
    await expect(result).resolves.toEqual({ status: 'fullscreen' });
    expect(port.read()).toEqual({ fullscreen: true, owned: true, keyboardLocked: false });
  });

  it('does not count a resolved promise without the actual element', async () => {
    const { host, port } = connected();
    const result = port.requestFullscreen();
    host.requests[0]!.resolve();
    await expect(result).resolves.toEqual({ status: 'failed', reason: 'not-entered' });
    expect(port.read()).toEqual({ fullscreen: false, owned: false, keyboardLocked: false });
  });

  it('reports a rejection or a throwing host by category, never the host error', async () => {
    const { host, port, signals } = connected();
    const rejected = port.requestFullscreen();
    host.requests[0]!.reject(hostError('TypeError'));
    host.emit('fullscreenerror');
    await expect(rejected).resolves.toEqual({ status: 'failed', reason: 'rejected' });
    expect(signals).toEqual([{ type: 'error', fullscreen: false, owned: false, keyboardLocked: false }]);
    host.failCall = hostError('Error');
    await expect(port.requestFullscreen()).resolves.toEqual({ status: 'failed', reason: 'failed' });
  });

  it('never claims a fullscreen that was already there, or one another caller entered meanwhile', async () => {
    const { host, port, signals } = connected();
    host.fullscreen = true;
    host.enabled = false;
    await expect(port.requestFullscreen()).resolves.toEqual({ status: 'fullscreen' });
    expect(host.calls).not.toContain('requestFullscreen');
    expect(port.read().owned).toBe(false);
    host.fullscreen = false;
    host.enabled = true;
    const request = port.requestFullscreen();
    // Another caller shows the root fullscreen while this request is pending; this request then fails.
    host.fullscreen = true;
    host.emit('fullscreenchange');
    host.emit('fullscreenerror');
    expect(signals).toEqual([
      { type: 'change', fullscreen: true, owned: false, keyboardLocked: false },
      { type: 'error', fullscreen: true, owned: false, keyboardLocked: false },
    ]);
    host.requests[0]!.reject(hostError('TypeError'));
    await expect(request).resolves.toEqual({ status: 'failed', reason: 'rejected' });
    expect(port.read().owned).toBe(false);
    await expect(port.exitFullscreen()).resolves.toEqual({ status: 'not-owned' });
    expect(host.calls).not.toContain('exitFullscreen');
  });

  it('keeps the window when fullscreen succeeds but the key lock fails', async () => {
    const { host, port } = connected();
    const request = port.requestFullscreen();
    await host.enter();
    await expect(request).resolves.toEqual({ status: 'fullscreen' });
    const lock = port.lockKeys(['KeyI', 'ControlLeft']);
    host.locks[0]!.request.reject(hostError('NotAllowedError'));
    await expect(lock).resolves.toEqual({ status: 'failed', reason: 'denied' });
    expect(port.read()).toEqual({ fullscreen: true, owned: true, keyboardLocked: false });
  });
});

describe('fullscreen port: exit', () => {
  it('exits a fullscreen it entered and confirms by the actual element', async () => {
    const { host, port } = connected();
    const request = port.requestFullscreen();
    await host.enter();
    await request;
    const first = port.exitFullscreen();
    const second = port.exitFullscreen();
    expect(second).toBe(first);
    expect(host.calls.filter(call => call === 'exitFullscreen')).toHaveLength(1);
    host.fullscreen = false;
    host.exits[0]!.resolve();
    await expect(first).resolves.toEqual({ status: 'exited' });
    expect(port.read()).toEqual({ fullscreen: false, owned: false, keyboardLocked: false });
    await expect(port.exitFullscreen()).resolves.toEqual({ status: 'not-owned' });
  });

  it('reports an exit that did not leave fullscreen, or failed, and still owns it', async () => {
    const { host, port } = connected();
    const request = port.requestFullscreen();
    await host.enter();
    await request;
    const unconfirmed = port.exitFullscreen();
    host.exits[0]!.resolve();
    await expect(unconfirmed).resolves.toEqual({ status: 'failed', reason: 'not-exited' });
    const rejected = port.exitFullscreen();
    host.exits[1]!.reject(hostError('TypeError'));
    await expect(rejected).resolves.toEqual({ status: 'failed', reason: 'rejected' });
    host.failCall = hostError('Error');
    await expect(port.exitFullscreen()).resolves.toEqual({ status: 'failed', reason: 'failed' });
    expect(port.read()).toEqual({ fullscreen: true, owned: true, keyboardLocked: false });
  });

  it('never exits a fullscreen it does not hold', async () => {
    const { host, port, signals } = connected();
    await expect(port.exitFullscreen()).resolves.toEqual({ status: 'not-owned' });
    const request = port.requestFullscreen();
    await host.enter();
    await request;
    // The user leaves fullscreen; something else then shows the same element fullscreen.
    host.leave();
    host.fullscreen = true;
    host.emit('fullscreenchange');
    expect(signals.map(signal => [signal.fullscreen, signal.owned])).toEqual([[true, true], [false, false], [true, false]]);
    await expect(port.exitFullscreen()).resolves.toEqual({ status: 'not-owned' });
    expect(host.calls).not.toContain('exitFullscreen');
  });

  it('gives up ownership once the root is no longer the fullscreen element, even unobserved', async () => {
    const host = new Host();
    const port = createFullscreenPort(host);
    const request = port.requestFullscreen();
    host.fullscreen = true;
    host.requests[0]!.resolve();
    await request;
    expect(port.read().owned).toBe(true);
    host.fullscreen = false;
    expect(port.read().owned).toBe(false);
    host.fullscreen = true;
    await expect(port.exitFullscreen()).resolves.toEqual({ status: 'not-owned' });
  });

  it('requests again while its exit is still pending', async () => {
    const { host, port } = connected();
    const first = port.requestFullscreen();
    await host.enter();
    await first;
    const exit = port.exitFullscreen();
    const again = port.requestFullscreen();
    expect(host.calls.filter(call => call === 'requestFullscreen')).toHaveLength(2);
    host.fullscreen = false;
    host.exits[0]!.resolve();
    await expect(exit).resolves.toEqual({ status: 'exited' });
    await host.enter(1);
    await expect(again).resolves.toEqual({ status: 'fullscreen' });
    expect(port.read().owned).toBe(true);
  });
});

describe('fullscreen port: key lock', () => {
  it.each<[string, readonly string[]]>([
    ['no codes', []],
    ['an empty code', ['KeyA', '']],
    ...[...UNLOCKABLE_KEY_CODES].map((code): [string, readonly string[]] => [code, ['KeyA', code]]),
  ])('rejects %s without calling the host', (_label, codes) => {
    const { host, port } = connected();
    expect(() => port.lockKeys(codes)).toThrow(RangeError);
    expect(host.calls).toEqual(['listen fullscreenchange', 'listen fullscreenerror']);
  });

  it('rejects a lock of every key', () => {
    const { host, port } = connected();
    expect(() => Reflect.apply(port.lockKeys, port, [])).toThrow(RangeError);
    expect(host.locks).toEqual([]);
  });

  it('excludes Escape, Tab, Meta and F12', () => {
    expect([...UNLOCKABLE_KEY_CODES].sort()).toEqual(['Escape', 'F12', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'Tab']);
  });

  it('locks a frozen copy of the codes and unlocks only its own lock', async () => {
    const { host, port } = connected();
    port.unlockKeys();
    expect(host.calls).not.toContain('unlockKeys');
    const codes = ['KeyI', 'AltLeft'];
    const lock = port.lockKeys(codes);
    codes.push('KeyX');
    expect(host.locks[0]!.codes).toEqual(['KeyI', 'AltLeft']);
    expect(Object.isFrozen(host.locks[0]!.codes)).toBe(true);
    host.locks[0]!.request.resolve();
    await expect(lock).resolves.toEqual({ status: 'locked' });
    expect(port.read().keyboardLocked).toBe(true);
    port.unlockKeys();
    port.unlockKeys();
    expect(host.calls.filter(call => call === 'unlockKeys')).toHaveLength(1);
    expect(port.read().keyboardLocked).toBe(false);
  });

  it('reports a lock replaced by a later lock or unlock as superseded', async () => {
    const { host, port } = connected();
    const first = port.lockKeys(['KeyA']);
    const second = port.lockKeys(['KeyB']);
    host.locks[0]!.request.resolve();
    host.locks[1]!.request.resolve();
    await expect(first).resolves.toEqual({ status: 'failed', reason: 'superseded' });
    await expect(second).resolves.toEqual({ status: 'locked' });
    const third = port.lockKeys(['KeyC']);
    port.unlockKeys();
    host.locks[2]!.request.resolve();
    await expect(third).resolves.toEqual({ status: 'failed', reason: 'superseded' });
    expect(port.read().keyboardLocked).toBe(false);
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['InvalidStateError', 'unavailable'],
    ['InvalidAccessError', 'invalid-codes'],
    ['AbortError', 'superseded'],
    ['TypeError', 'failed'],
    ['toString', 'failed'],
  ])('classifies a %s rejection as %s', async (name, reason) => {
    const { host, port } = connected();
    const lock = port.lockKeys(['KeyA']);
    host.locks[0]!.request.reject(hostError(name));
    await expect(lock).resolves.toEqual({ status: 'failed', reason });
    expect(port.read().keyboardLocked).toBe(false);
    port.unlockKeys();
    expect(host.calls).not.toContain('unlockKeys');
  });

  it('classifies a non-error rejection, an unreadable name or a throwing host as failed', async () => {
    const { host, port } = connected();
    const lock = port.lockKeys(['KeyA']);
    host.locks[0]!.request.reject('NotAllowedError');
    await expect(lock).resolves.toEqual({ status: 'failed', reason: 'failed' });
    const unreadable = port.lockKeys(['KeyA']);
    host.locks[1]!.request.reject({ get name(): string { throw new Error('secret'); } });
    await expect(unreadable).resolves.toEqual({ status: 'failed', reason: 'failed' });
    host.failCall = hostError('NotAllowedError');
    await expect(port.lockKeys(['KeyA'])).resolves.toEqual({ status: 'failed', reason: 'failed' });
  });

  it('keeps a lock recorded when the host unlock throws', async () => {
    const { host, port } = connected();
    const lock = port.lockKeys(['KeyA']);
    host.locks[0]!.request.resolve();
    await lock;
    const failure = hostError('Error');
    host.failCall = failure;
    expect(thrownBy(() => { port.unlockKeys(); })).toBe(failure);
    expect(port.read().keyboardLocked).toBe(true);
    host.failCall = null;
    port.unlockKeys();
    expect(port.read().keyboardLocked).toBe(false);
  });
});

describe('fullscreen port: registration', () => {
  it('registers nothing until connect and connects exactly once', () => {
    const host = new Host();
    const port = createFullscreenPort(host);
    expect(host.calls).toEqual([]);
    const release = port.connect(() => undefined);
    expect(host.listenerCount()).toBe(2);
    expect(() => port.connect(() => undefined)).toThrow('exactly once');
    release();
    release();
    expect(host.listenerCount()).toBe(0);
    expect(host.calls).toEqual(['listen fullscreenchange', 'listen fullscreenerror', 'remove fullscreenchange', 'remove fullscreenerror']);
  });

  it('rolls back a partial registration and rethrows the cause', () => {
    const host = new Host();
    const failure = new Error('listen failed');
    host.failListen = { type: 'fullscreenerror', error: failure };
    const port = createFullscreenPort(host);
    expect(thrownBy(() => port.connect(() => undefined))).toBe(failure);
    expect(host.listenerCount()).toBe(0);
    expect(() => port.connect(() => undefined)).toThrow('exactly once');
  });

  it('reports a failed rollback as a RollbackError holding every cause', () => {
    const host = new Host();
    const failure = new Error('listen failed');
    const removal = new Error('remove failed');
    host.failListen = { type: 'fullscreenerror', error: failure };
    host.failRemove = removal;
    const error = thrownBy(() => createFullscreenPort(host).connect(() => undefined));
    expect(error).toBeInstanceOf(RollbackError);
    expect((error as RollbackError).errors).toEqual([failure, removal]);
  });

  it('is silent after release even when a removal throws, and aggregates removal failures', async () => {
    const { host, port, signals, release } = connected();
    const removal = new Error('remove failed');
    host.failRemove = removal;
    const error = thrownBy(release);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([removal, removal]);
    host.fullscreen = true;
    host.emit('fullscreenchange');
    host.emit('fullscreenerror');
    expect(signals).toEqual([]);
    expect(host.listenerCount()).toBe(2);
    await expect(port.requestFullscreen()).resolves.toEqual({ status: 'failed', reason: 'disposed' });
    await expect(port.lockKeys(['KeyA'])).resolves.toEqual({ status: 'failed', reason: 'disposed' });
    expect(host.calls.filter(call => call === 'requestFullscreen' || call.startsWith('lockKeys'))).toEqual([]);
  });

  it('still settles earlier requests after release, so a late success can be undone', async () => {
    const { host, port, signals, release } = connected();
    const request = port.requestFullscreen();
    const lock = port.lockKeys(['KeyA']);
    release();
    host.locks[0]!.request.resolve();
    await host.enter();
    await expect(request).resolves.toEqual({ status: 'fullscreen' });
    await expect(lock).resolves.toEqual({ status: 'locked' });
    expect(signals).toEqual([]);
    port.unlockKeys();
    const exit = port.exitFullscreen();
    host.fullscreen = false;
    host.exits[0]!.resolve();
    await expect(exit).resolves.toEqual({ status: 'exited' });
    expect(port.read()).toEqual({ fullscreen: false, owned: false, keyboardLocked: false });
  });
});
