import { describe, expect, it } from 'vitest';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { createPointerLock } from './pointer-lock.ts';
import type {
  PointerClientRect, PointerEventType, PointerHostEvent, PointerInput, PointerLockHost, PointerLockOutcome,
  PointerLockSignalType, PointerLockSink, PointerLockState,
} from './pointer-lock.ts';

class Host implements PointerLockHost {
  isSupported = true;
  state: PointerLockState = 'none';
  rect: PointerClientRect = { left: 10, top: 20, width: 320, height: 200 };
  answer: 'promise' | 'none' | 'throw' = 'none';
  requests = 0;
  exits = 0;
  failExit = false;
  deferred: { resolve: () => void; reject: (cause: unknown) => void } | null = null;
  readonly locks = new Map<PointerLockSignalType, () => void>();
  readonly pointers = new Map<PointerEventType, (event: PointerHostEvent) => void>();
  readonly removals: number[] = [];
  failAdd = -1;
  failRemove = new Set<number>();
  adds = 0;
  readonly failure = new Error('injected host detail');
  supported = () => this.isSupported;
  readLock = () => this.state;
  readRect = () => this.rect;
  request(): PromiseLike<void> | undefined {
    this.requests++;
    if (this.answer === 'throw') throw this.failure;
    if (this.answer === 'none') return undefined;
    return new Promise<void>((resolve, reject) => { this.deferred = { resolve, reject }; });
  }
  exit(): void {
    this.exits++;
    if (this.failExit) throw this.failure;
  }
  listenLock(type: PointerLockSignalType, listener: () => void) {
    return this.add(() => this.locks.set(type, listener));
  }
  listenPointer(type: PointerEventType, listener: (event: PointerHostEvent) => void) {
    return this.add(() => this.pointers.set(type, listener));
  }
  add(save: () => void): () => void {
    const id = this.adds++;
    if (id === this.failAdd) throw this.failure;
    save();
    return () => {
      this.removals.push(id);
      if (this.failRemove.has(id)) throw this.failure;
    };
  }
  fire(type: PointerLockSignalType, state?: PointerLockState): void {
    if (state) this.state = state;
    this.locks.get(type)?.();
  }
  pointer(type: PointerEventType, patch: Partial<PointerHostEvent> = {}): void {
    this.pointers.get(type)?.({ button: 0, movementX: 3, movementY: -4, clientX: 50, clientY: 60, ...patch });
  }
}

/** A host that also reports context menu requests, whose answer it keeps. */
class MenuHost extends Host {
  menu: (() => boolean) | null = null;
  prevented: boolean[] = [];
  listenContextMenu(listener: () => boolean) {
    return this.add(() => { this.menu = listener; });
  }
  contextMenu(): void {
    if (this.menu) this.prevented.push(this.menu());
  }
}

function setup(host = new Host()) {
  const locks: boolean[] = [];
  const inputs: PointerInput[] = [];
  const sink: PointerLockSink = {
    lock: locked => { locks.push(locked); },
    pointer: input => { inputs.push(input); },
  };
  return { host, port: createPointerLock(host), sink, locks, inputs };
}

/** Runs every queued microtask, including late host promise answers. */
const flush = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

/** The outcome, or 'pending' once every queued microtask has run without settling it. */
function peek(promise: Promise<PointerLockOutcome>): Promise<PointerLockOutcome | 'pending'> {
  return Promise.race([promise, flush().then(() => 'pending' as const)]);
}

/** Connects and acquires a confirmed lock through a promise-less host. */
async function acquired(s = setup()) {
  const release = s.port.connect(s.sink);
  const outcome = s.port.request();
  s.host.fire('pointerlockchange', 'target');
  expect(await outcome).toEqual({ status: 'locked' });
  return { ...s, release };
}

describe('pointer lock port', () => {
  it('owns exactly five registrations, delivers frozen samples by actual lock, and invalidates before removal', () => {
    const s = setup();
    const release = s.port.connect(s.sink);
    expect(s.host.adds).toBe(5);
    s.host.pointer('mousemove');
    s.host.pointer('mousedown', { button: 2 });
    s.host.state = 'target';
    s.host.pointer('mousemove');
    s.host.pointer('mouseup', { button: 2, movementX: 0, movementY: 0 });
    const absolute = { mode: 'absolute', unit: 'css-client', clientX: 50, clientY: 60, rect: s.host.rect };
    expect(s.inputs).toEqual([
      { type: 'move', sample: absolute },
      { type: 'down', button: 2, sample: absolute },
      { type: 'move', sample: { mode: 'relative', unit: 'host-reported', movementX: 3, movementY: -4 } },
      { type: 'up', button: 2, sample: { mode: 'relative', unit: 'host-reported', movementX: 0, movementY: 0 } },
    ]);
    const first = s.inputs[0]!;
    expect(Object.isFrozen(first) && Object.isFrozen(first.sample)).toBe(true);
    if (first.sample.mode !== 'absolute') throw new Error('Expected an absolute sample');
    expect(first.sample.rect).not.toBe(s.host.rect);
    expect(Object.isFrozen(first.sample.rect)).toBe(true);
    release();
    release();
    expect(s.host.removals).toEqual([0, 1, 2, 3, 4]);
    s.host.pointer('mousemove');
    s.host.fire('pointerlockchange', 'none');
    s.host.fire('pointerlockerror');
    expect(s.inputs).toHaveLength(4);
    expect(s.locks).toEqual([]);
    expect(() => s.port.connect(s.sink)).toThrow('exactly once');
    expect(() => s.port.request()).toThrow('only while connected');
  });

  it('confirms a promise-less request only by a change to the target and ignores later answers', async () => {
    const s = setup();
    s.port.connect(s.sink);
    const outcome = s.port.request();
    expect(s.host.requests).toBe(1);
    s.host.fire('pointerlockchange', 'none');
    expect(await peek(outcome)).toBe('pending');
    expect(s.port.locked()).toBe(false);
    s.host.fire('pointerlockchange', 'target');
    expect(s.locks).toEqual([true]);
    expect(await outcome).toEqual({ status: 'locked' });
    expect(s.port.locked()).toBe(true);
    s.host.fire('pointerlockerror');
    s.host.fire('pointerlockchange', 'target');
    expect(s.locks).toEqual([true]);
    expect(s.port.locked()).toBe(true);
  });

  it.each(['none', 'other'] as const)('fails with target-mismatch when the host promise resolves with %s locked', async state => {
    const s = setup();
    s.host.answer = 'promise';
    s.port.connect(s.sink);
    const outcome = s.port.request();
    s.host.state = state;
    s.host.deferred?.resolve();
    expect(await outcome).toEqual({ status: 'failed', reason: 'target-mismatch' });
    expect(s.locks).toEqual([]);
    expect(s.port.locked()).toBe(false);
    s.port.exit();
    expect(s.host.exits).toBe(0);
  });

  it.each([
    ['unsupported', 'unsupported', (host: Host) => { host.isSupported = false; }, () => {}],
    ['a synchronous host throw', 'rejected', (host: Host) => { host.answer = 'throw'; }, () => {}],
    ['a promise rejection', 'rejected', (host: Host) => { host.answer = 'promise'; }, (host: Host) => host.deferred?.reject(host.failure)],
    ['an error event', 'rejected', () => {}, (host: Host) => host.fire('pointerlockerror')],
    ['a change to another element', 'target-mismatch', () => {}, (host: Host) => host.fire('pointerlockchange', 'other')],
  ] as const)('reports %s as a stable category without host details', async (_, reason, arrange, answer) => {
    const s = setup();
    arrange(s.host);
    s.port.connect(s.sink);
    const outcome = s.port.request();
    answer(s.host);
    const result = await outcome;
    expect(result).toStrictEqual({ status: 'failed', reason });
    expect(Object.isFrozen(result)).toBe(true);
    expect(s.host.requests).toBe(reason === 'unsupported' ? 0 : 1);
    expect(s.locks).toEqual([]);
  });

  it('lets only the promise answer a promise request and ignores answers after settlement', async () => {
    const s = setup();
    s.host.answer = 'promise';
    s.port.connect(s.sink);
    const locked = s.port.request();
    s.host.fire('pointerlockerror');
    s.host.fire('pointerlockchange', 'other');
    expect(await peek(locked)).toBe('pending');
    s.host.state = 'target';
    s.host.deferred?.resolve();
    expect(await locked).toEqual({ status: 'locked' });
    s.host.fire('pointerlockerror');
    s.host.fire('pointerlockchange');
    expect(s.port.locked()).toBe(true);
    expect(s.locks).toEqual([true]);

    const t = setup();
    t.port.connect(t.sink);
    const rejected = t.port.request();
    t.host.fire('pointerlockerror');
    t.host.fire('pointerlockchange', 'target');
    expect(await rejected).toEqual({ status: 'failed', reason: 'rejected' });
    expect(t.locks).toEqual([]);
    expect(t.port.locked()).toBe(false);
    t.port.exit();
    expect(t.host.exits).toBe(0);
  });

  it('never lets the late error event of a rejected promise request settle the next request', async () => {
    const s = setup();
    s.host.answer = 'promise';
    s.port.connect(s.sink);
    const first = s.port.request();
    s.host.deferred?.reject(s.host.failure);
    expect(await first).toEqual({ status: 'failed', reason: 'rejected' });
    const second = s.port.request();
    s.host.fire('pointerlockerror');
    s.host.fire('pointerlockchange', 'other');
    expect(await peek(second)).toBe('pending');
    s.host.state = 'target';
    s.host.deferred?.resolve();
    expect(await second).toEqual({ status: 'locked' });
    expect(s.locks).toEqual([true]);
  });

  it('allows one pending request and reuses a confirmed lock without asking again', async () => {
    const s = setup();
    s.port.connect(s.sink);
    const outcome = s.port.request();
    expect(() => s.port.request()).toThrow('already pending');
    s.host.fire('pointerlockchange', 'target');
    expect(await outcome).toEqual({ status: 'locked' });
    expect(await s.port.request()).toEqual({ status: 'locked' });
    expect(s.host.requests).toBe(1);
    expect(s.locks).toEqual([true]);
  });

  it('never adopts or exits a lock it did not confirm', () => {
    const s = setup();
    s.port.connect(s.sink);
    s.host.fire('pointerlockchange', 'target');
    s.port.exit();
    s.host.fire('pointerlockchange', 'none');
    expect(s.host.exits).toBe(0);
    expect(s.locks).toEqual([]);
    expect(s.port.locked()).toBe(false);
  });

  it('reports the end of its own lock once and exits only while the host still reports it', async () => {
    const s = await acquired();
    s.host.state = 'other';
    s.port.exit();
    expect(s.host.exits).toBe(0);
    s.host.fire('pointerlockchange');
    expect(s.locks).toEqual([true, false]);
    expect(s.port.locked()).toBe(false);

    s.host.state = 'none';
    const again = s.port.request();
    s.host.fire('pointerlockchange', 'target');
    expect(await again).toEqual({ status: 'locked' });
    s.port.exit();
    expect(s.host.exits).toBe(1);
    s.host.fire('pointerlockchange', 'none');
    s.host.fire('pointerlockchange', 'none');
    s.port.exit();
    expect(s.host.exits).toBe(1);
    expect(s.locks).toEqual([true, false, true, false]);
  });

  it('release exits its own lock silently and disconnects a pending request', async () => {
    const s = await acquired();
    s.release();
    expect(s.host.exits).toBe(1);
    expect(s.port.locked()).toBe(false);
    s.host.fire('pointerlockchange', 'none');
    expect(s.locks).toEqual([true]);

    const other = await acquired();
    other.host.state = 'other';
    other.release();
    expect(other.host.exits).toBe(0);

    const t = setup();
    t.host.answer = 'promise';
    const release = t.port.connect(t.sink);
    const outcome = t.port.request();
    release();
    expect(await outcome).toEqual({ status: 'disconnected' });
    t.host.state = 'target';
    t.host.deferred?.resolve();
    await flush();
    t.host.fire('pointerlockchange');
    t.host.pointer('mousemove');
    expect(t.locks).toEqual([]);
    expect(t.inputs).toEqual([]);
    expect(t.port.locked()).toBe(false);
    expect(t.host.exits).toBe(0);
  });

  it('keeps a sink that releases the port during its unlock notification silent afterwards', async () => {
    const s = await acquired();
    s.sink.lock = locked => {
      s.locks.push(locked);
      s.release();
    };
    s.host.fire('pointerlockchange', 'none');
    expect(s.locks).toEqual([true, false]);
    expect(s.host.removals).toEqual([0, 1, 2, 3, 4]);
    expect(s.host.exits).toBe(0);
  });

  it('lets a sink release the port while its lock starts and still exits that lock', async () => {
    const s = setup();
    const release = s.port.connect(s.sink);
    s.sink.lock = locked => {
      s.locks.push(locked);
      release();
    };
    const outcome = s.port.request();
    s.host.fire('pointerlockchange', 'target');
    expect(await outcome).toEqual({ status: 'locked' });
    expect(s.locks).toEqual([true]);
    expect(s.host.exits).toBe(1);
    expect(s.host.removals).toEqual([0, 1, 2, 3, 4]);
    expect(s.port.locked()).toBe(false);
  });

  it.each(Array.from({ length: 5 }, (_, i) => i))('rolls back actual registration failure at index %i', index => {
    const s = setup();
    s.host.failAdd = index;
    expect(() => s.port.connect(s.sink)).toThrow(s.host.failure);
    expect(s.host.removals).toEqual(Array.from({ length: index }, (_, i) => i));
    for (const callback of s.host.locks.values()) callback();
    s.host.pointer('mousemove');
    expect(s.inputs).toEqual([]);
    expect(s.locks).toEqual([]);
    expect(() => s.port.request()).toThrow('only while connected');
  });

  it('preserves the registration cause and every removal failure after failed rollback', () => {
    const s = setup();
    s.host.failAdd = 4;
    s.host.failRemove = new Set([0, 3]);
    let failure: unknown;
    try { s.port.connect(s.sink); } catch (cause) { failure = cause; }
    expect(failure).toBeInstanceOf(RollbackError);
    if (!(failure instanceof RollbackError)) throw new Error('Expected rollback error');
    expect(failure.cause).toBe(s.host.failure);
    expect(failure.errors).toEqual([s.host.failure, s.host.failure, s.host.failure]);
    expect(s.host.removals).toEqual([0, 1, 2, 3]);
  });

  it('attempts the exit and every removal once when release throws, and stays silent', async () => {
    const s = await acquired();
    s.host.failExit = true;
    s.host.failRemove = new Set([1, 4]);
    let failure: unknown;
    try { s.release(); } catch (cause) { failure = cause; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([s.host.failure, s.host.failure, s.host.failure]);
    expect(s.host.exits).toBe(1);
    expect(s.host.removals).toEqual([0, 1, 2, 3, 4]);
    s.host.fire('pointerlockchange', 'none');
    s.host.pointer('mousedown');
    expect(s.locks).toEqual([true]);
    expect(s.inputs).toEqual([]);
    expect(() => s.release()).not.toThrow();
    expect(s.host.exits).toBe(1);
    expect(s.host.removals).toHaveLength(5);
  });

  // P3-13 subtask 23: context menu requests reach the sink, which decides suppression (P3-13 spec 地图输入几何与指针).
  it('passes context menu requests to the sink while connected, locked or not, and suppresses none otherwise', async () => {
    const host = new MenuHost();
    let suppress = true;
    const s = setup(host);
    const sink = { ...s.sink, contextMenu: () => suppress };
    const release = s.port.connect(sink);
    expect(host.adds).toBe(6);
    host.contextMenu();
    suppress = false;
    host.contextMenu();
    suppress = true;
    const outcome = s.port.request();
    host.fire('pointerlockchange', 'target');
    expect(await outcome).toEqual({ status: 'locked' });
    host.contextMenu();
    release();
    host.contextMenu();
    expect(host.prevented).toEqual([true, false, true, false]);
    expect(host.removals).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s.inputs).toEqual([]);

    // A sink without a decision suppresses nothing.
    const t = setup(new MenuHost());
    t.port.connect(t.sink);
    (t.host as MenuHost).contextMenu();
    expect((t.host as MenuHost).prevented).toEqual([false]);
  });

  it('rolls back the pointer registrations when the context menu registration fails', () => {
    const s = setup(new MenuHost());
    s.host.failAdd = 5;
    expect(() => s.port.connect(s.sink)).toThrow(s.host.failure);
    expect(s.host.removals).toEqual([0, 1, 2, 3, 4]);
  });
});
