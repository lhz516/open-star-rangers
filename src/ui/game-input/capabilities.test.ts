vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => capacity.wrap(original.createRecordingSession(input, options)),
  };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { developmentRecording, type MissionOwnerConsumer } from '../../app/mission/mission-owner.ts';
import { missionHolder, ownerSetup, sessionProbe, skip, testPorts, testSlot, toConfig } from '../../app/mission/mission.test-support.ts';
import type { ResourceHolder } from '../../app/resources/resource-holder.ts';
import { NEUTRAL_AXES, TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import type { GameSessionStatus } from '../../app/session/game-session.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions, RecordingSession } from '../../core/replay/recording.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import {
  createFullscreenPort, UNLOCKABLE_KEY_CODES, type FullscreenEventType, type FullscreenHost,
} from '../../platform/browser/fullscreen.ts';
import type { KeyboardSignal, KeyboardSink, KeyboardSource, KeyboardZoneBinding } from '../../platform/input/keyboard-input.ts';
import {
  createPointerLock, type PointerEventType, type PointerHostEvent, type PointerInput, type PointerLockHost, type PointerLockSignalType,
  type PointerLockState,
} from '../../platform/input/pointer-lock.ts';
import { CapabilityReleaseError, createInputCapabilities } from './capabilities.ts';
import { down, TEST_BINDINGS, up } from './game-input.test-support.ts';
import { createInputConsumer, type GameInputConsumer } from './input-consumer.ts';
import { createInputStatus, type CapabilityName, type CapabilityStatus } from './input-status.ts';

// P3-05 subtask 21 (Node): fullscreen, Keyboard Lock and Pointer Lock requests of the input consumer on a real mission
// owner, Session and Runtime driven by a ControlledHost, with the real platform ports over hosts whose promises and
// change/error events the tests settle and fire in each order (docs/plan/p3/05/spec.md: 全屏与 Keyboard Lock, 生命周期与
// 资源 “异步申请”, 清键与恢复; 数据模型与契约 “能力申请状态与错误”; 技术决定 7; S-10, S-12, S-14; AC-13, AC-14 and
// AC-16, the Node part).

/** Makes a recording refuse its `refuseAt`th step, which stops the run (as in mission-owner-stopped.test.ts). */
const capacity = vi.hoisted(() => ({
  refuseAt: null as number | null,
  wrap(session: RecordingSession): RecordingSession {
    let steps = 0;
    const refuseAt = this.refuseAt;
    return new Proxy(session, {
      get(target, key) {
        const value = Reflect.get(target, key, target) as unknown;
        if (key !== 'step' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
        return (...args: unknown[]) => {
          steps += 1;
          if (steps === refuseAt) throw new CoreInputError('recording', 'would exceed the recorded tick limit');
          return (value as (...input: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  },
}));

afterEach(() => { capacity.refuseAt = null; });

/** The key lock codes as subtask 19 derives them: the bound codes and the Ctrl keys, without the unlockable ones. */
const LOCK_CODES: readonly string[] = Object.freeze([...new Set([...TEST_BINDINGS.bindings.map(({ code }) => code), 'ControlLeft', 'ControlRight'])]
  .filter((code) => !UNLOCKABLE_KEY_CODES.has(code)));

/** Runs every queued microtask and promise answer. */
const flush = (): Promise<void> => new Promise((done) => { setTimeout(done, 0); });

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

const hostError = (name: string): Error => Object.assign(new Error(`host detail ${name}`), { name });

/** A document whose fullscreen and key lock requests the test settles, firing the events a browser would. */
class ScreenHost implements FullscreenHost {
  readonly calls: string[] = [];
  readonly listeners = new Map<FullscreenEventType, Set<() => void>>();
  readonly requests: Deferred[] = [];
  readonly exits: Deferred[] = [];
  readonly locks: { readonly codes: readonly string[]; readonly request: Deferred }[] = [];
  enabled = true;
  lockAvailable = true;
  fullscreen = false;
  failRequest: Error | null = null;
  failUnlock: Error | null = null;
  failListen: FullscreenEventType | null = null;
  failRemove: Error | null = null;

  fullscreenEnabled(): boolean { return this.enabled; }
  isFullscreen(): boolean { return this.fullscreen; }
  keyboardLockAvailable(): boolean { return this.lockAvailable; }

  requestFullscreen(): Promise<void> {
    this.calls.push('requestFullscreen');
    if (this.failRequest) throw this.failRequest;
    const request = deferred();
    this.requests.push(request);
    return request.promise;
  }

  exitFullscreen(): Promise<void> {
    this.calls.push('exitFullscreen');
    const exit = deferred();
    this.exits.push(exit);
    return exit.promise;
  }

  lockKeys(codes: readonly string[]): Promise<void> {
    this.calls.push('lockKeys');
    const request = deferred();
    this.locks.push({ codes, request });
    return request.promise;
  }

  unlockKeys(): void {
    this.calls.push('unlockKeys');
    if (this.failUnlock) throw this.failUnlock;
  }

  listen(type: FullscreenEventType, listener: () => void): () => void {
    if (this.failListen === type) throw new Error(`listen ${type} failed`);
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
    return () => {
      if (this.failRemove) throw this.failRemove;
      set.delete(listener);
    };
  }

  emit(type: FullscreenEventType): void {
    for (const listener of [...this.listeners.get(type) ?? []]) listener();
  }

  /** The browser's order: the element changes, the request's promise resolves, then `fullscreenchange` fires. */
  async enter(index = this.requests.length - 1): Promise<void> {
    this.fullscreen = true;
    this.requests[index]!.resolve();
    await flush();
    this.emit('fullscreenchange');
  }

  async exited(index = this.exits.length - 1): Promise<void> {
    this.fullscreen = false;
    this.exits[index]!.resolve();
    await flush();
    this.emit('fullscreenchange');
  }

  /** Anyone leaves fullscreen without the port: the user's Esc, say. */
  leave(): void {
    this.fullscreen = false;
    this.emit('fullscreenchange');
  }

  async settleLock(index = this.locks.length - 1, error?: Error): Promise<void> {
    if (error) this.locks[index]!.request.reject(error);
    else this.locks[index]!.request.resolve();
    await flush();
  }

  /** Each key lock and unlock call, in order. */
  lockLog(): string[] {
    return this.calls.filter((call) => call === 'lockKeys' || call === 'unlockKeys').map((call) => (call === 'lockKeys' ? 'lock' : 'unlock'));
  }
}

/** A promise-less Pointer Lock host on one target: change and error events answer each request. */
class PointerHost implements PointerLockHost {
  isSupported = true;
  state: PointerLockState = 'none';
  requests = 0;
  exits = 0;
  failExit: Error | null = null;
  failAdd = false;
  readonly locks = new Map<PointerLockSignalType, () => void>();
  readonly pointers = new Map<PointerEventType, (event: PointerHostEvent) => void>();
  supported = (): boolean => this.isSupported;
  readLock = (): PointerLockState => this.state;
  readRect = () => ({ left: 0, top: 0, width: 640, height: 480 });

  request(): undefined {
    this.requests += 1;
    return undefined;
  }

  exit(): void {
    this.exits += 1;
    if (this.failExit) throw this.failExit;
  }

  listenLock(type: PointerLockSignalType, listener: () => void): () => void {
    if (this.failAdd) throw new Error('listenLock failed');
    this.locks.set(type, listener);
    return () => { this.locks.delete(type); };
  }

  listenPointer(type: PointerEventType, listener: (event: PointerHostEvent) => void): () => void {
    this.pointers.set(type, listener);
    return () => { this.pointers.delete(type); };
  }

  /** The document's pointer-lock element changes to `state`. */
  change(state: PointerLockState): void {
    this.state = state;
    this.locks.get('pointerlockchange')?.();
  }

  error(): void {
    this.locks.get('pointerlockerror')?.();
  }
}

class FakeKeyboard implements KeyboardSource, KeyboardZoneBinding<string> {
  sink: KeyboardSink | null = null;
  eligible = false;
  releases = 0;
  readonly bind = (): void => undefined;

  connect(sink: KeyboardSink): () => void {
    this.sink = sink;
    sink.signal({ type: 'initial', eligible: this.eligible });
    return () => {
      this.releases += 1;
      this.sink = null;
    };
  }

  signal(type: KeyboardSignal['type'], eligible: boolean): void {
    this.eligible = eligible;
    this.sink?.signal(Object.freeze({ type, eligible }));
  }

  press(code: string): boolean {
    return this.sink!.key(down(code), this.eligible);
  }

  lift(code: string): boolean {
    return this.sink!.key(up(code), this.eligible);
  }
}

/** Connects `consumer`, logging each run port call as `<operation>[ <reason>]` and each release's result. */
function logged(consumer: GameInputConsumer<string>, calls: string[], releases: unknown[]): MissionOwnerConsumer<'input'> {
  return {
    stage: 'input',
    connect: (context) => {
      const forRun = (runId: number) => {
        const port = context.control.forRun(runId);
        return {
          clearInput: (reason: Parameters<typeof port.clearInput>[0]) => {
            calls.push(`clear-input ${reason}`);
            port.clearInput(reason);
          },
          togglePause: () => {
            calls.push('toggle-pause');
            port.togglePause();
          },
          openMenu: () => {
            calls.push('open-menu');
            port.openMenu();
          },
        };
      };
      const connection = consumer.connect({ ...context, control: { forRun } });
      return {
        ...connection,
        release: () => {
          const result = connection.release();
          releases.push(result);
          return result;
        },
      };
    },
  };
}

interface Options {
  readonly fullscreen?: boolean;
  readonly keyboardLock?: boolean;
  /** Opens the owner on this slot and holder instead of new ones. */
  readonly on?: { readonly slot: ReturnType<typeof testSlot>; readonly holder: ResourceHolder };
  /** Waits for nothing, so `previousClosed` may still be open. */
  readonly early?: boolean;
}

/**
 * An owner with a recording whose input consumer has the test bindings, the key lock codes and both capability
 * ports, on hosts the test drives; its `previousClosed` has settled unless `early`.
 */
async function setup(options: Options = {}) {
  const keyboard = new FakeKeyboard();
  const screen = new ScreenHost();
  screen.enabled = options.fullscreen ?? true;
  screen.lockAvailable = options.keyboardLock ?? true;
  const pointer = new PointerHost();
  const calls: string[] = [];
  const releases: unknown[] = [];
  const consumer = createInputConsumer<string>({
    keyboard: () => keyboard, bindings: TEST_BINDINGS, feedback: () => null, keyLockCodes: LOCK_CODES,
    fullscreen: () => createFullscreenPort(screen), pointerLock: () => createPointerLock(pointer),
  });
  const holder = options.on?.holder ?? (await missionHolder()).holder;
  const slot = options.on?.slot ?? testSlot();
  const ports = testPorts();
  const probe = sessionProbe();
  const owner = slot.slot.open(() => ownerSetup(holder, ports, {
    recording: developmentRecording('osr-test'), consumers: [logged(consumer, calls, releases), probe.consumer],
  }))!;
  if (!options.early) await flush();
  const caps = consumer.capabilities;
  let now = 0;
  const run = () => probe.session().currentRun();
  return {
    ...ports, slot, holder, owner, keyboard, screen, pointer, consumer, caps, calls, releases, run, session: probe.session,
    capability: (name: CapabilityName): CapabilityStatus => consumer.status.getState().capabilities[name],
    /** From the start page through the start gesture. */
    start(): void {
      toConfig(owner);
      caps.startWithFullscreen(() => { owner.start(); });
    },
    /** From the departure into flight, its first frame delivered and the input zone focused. */
    fly(): void {
      skip(owner);
      ports.host.deliver(now);
      keyboard.signal('focusin', true);
    },
    frame(ticks = 1): void {
      now += ticks * TICK_MS;
      ports.host.deliver(now);
    },
    lastTick: () => run()!.exportRecording()!.record.ticks.at(-1),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** In flight in this owner's fullscreen, with the keys locked. */
async function lockedFlight(s: Setup): Promise<void> {
  s.start();
  await s.screen.enter();
  s.fly();
  await s.screen.settleLock();
  expect(s.capability('keyboardLock').state).toBe('active');
}

const status = (state: CapabilityStatus['state'], patch: Partial<CapabilityStatus> = {}): CapabilityStatus =>
  ({ state, ownerId: 1, runId: null, generation: 0, failure: null, ...patch });

const PITCH_DOWN = { axes: { ...NEUTRAL_AXES, pitch: -1 }, commands: [] };
const NEUTRAL = { axes: NEUTRAL_AXES, commands: [] };

describe('fullscreen', () => {
  it('requests fullscreen in the start gesture before the start, and passes it to the run only once the start began it', async () => {
    const s = await setup();
    toConfig(s.owner);
    expect([s.capability('fullscreen'), s.capability('keyboardLock')]).toEqual([status('idle'), status('idle')]);
    const seen: { readonly calls: readonly string[]; readonly fullscreen: CapabilityStatus }[] = [];
    s.caps.startWithFullscreen(() => {
      seen.push({ calls: [...s.screen.calls], fullscreen: s.capability('fullscreen') });
      s.owner.start();
    });
    // Requested synchronously, still in the gesture and before the run existed; the run's start then took it.
    expect(seen).toEqual([{ calls: ['requestFullscreen'], fullscreen: status('pending', { generation: 1 }) }]);
    expect(s.capability('fullscreen')).toEqual(status('pending', { generation: 1, runId: 1 }));
    await s.screen.enter();
    expect(s.capability('fullscreen')).toEqual(status('active', { generation: 1, runId: 1 }));

    // The departure's end into flight does not revoke it.
    s.fly();
    s.frame();
    expect({ fullscreen: s.capability('fullscreen').state, calls: s.screen.calls.filter((call) => call !== 'lockKeys') })
      .toEqual({ fullscreen: 'active', calls: ['requestFullscreen'] });
  });

  it('revokes the request of a failed start at once, exits its late success and lends it to no later start', async () => {
    const s = await setup();
    s.seeds.failure = new Error('no seed');
    s.start();
    expect(s.owner.getSnapshot().flow).toMatchObject({ position: 'config', startFailure: { kind: 'seed' } });
    expect(s.capability('fullscreen')).toEqual(status('idle', { generation: 1 }));

    // The next start, while that request is still open, is refused rather than handed the old request.
    s.seeds.failure = undefined;
    s.caps.startWithFullscreen(() => { s.owner.start(); });
    expect(s.owner.getSnapshot().flow.position).toBe('departure');
    expect(s.capability('fullscreen')).toEqual(status('failed', { generation: 2, runId: 1, failure: { operation: 'request', reason: 'closing' } }));
    expect(s.screen.requests).toHaveLength(1);

    // The old request's late success is only exited.
    await s.screen.enter(0);
    expect(s.screen.calls).toEqual(['requestFullscreen', 'exitFullscreen']);
    await s.screen.exited();
    s.fly();
    expect(s.capability('fullscreen').state).toBe('failed');
    expect({ calls: s.calls, locks: s.screen.lockLog() }).toEqual({ calls: [], locks: [] });

    // A new gesture requests again.
    s.caps.requestFullscreen();
    expect(s.capability('fullscreen')).toEqual(status('pending', { generation: 3, runId: 1 }));
  });

  it('keeps a fullscreen entered before a start that was rolled back, and exits this owner\'s fullscreen on restart', async () => {
    const s = await setup();
    toConfig(s.owner);
    s.caps.requestFullscreen();
    await s.screen.enter();
    expect(s.capability('fullscreen')).toEqual(status('active', { generation: 1 }));

    // Already fullscreen: the start requests nothing, and its rollback after the run existed exits nothing.
    s.guard.registerFailure = new Error('guard');
    s.caps.startWithFullscreen(() => { s.owner.start(); });
    expect(s.owner.getSnapshot().flow).toMatchObject({ position: 'config', startFailure: { kind: 'assembly', stage: 'leave-guard' } });
    expect(s.screen.calls).toEqual(['requestFullscreen']);

    s.guard.registerFailure = undefined;
    s.caps.startWithFullscreen(() => { s.owner.start(); });
    s.fly();
    s.owner.restart();
    expect(s.screen.calls.filter((call) => call.endsWith('Fullscreen'))).toEqual(['requestFullscreen', 'exitFullscreen']);
    await s.screen.exited();
    expect(s.capability('fullscreen')).toEqual(status('idle', { generation: 1 }));
  });

  it('revokes on restart a request made with no run, which a late success no longer brings into the next run', async () => {
    const s = await setup();
    toConfig(s.owner);
    s.caps.requestFullscreen();
    s.caps.startWithFullscreen(() => { s.owner.start(); });
    s.fly();
    expect(s.capability('fullscreen')).toEqual(status('pending', { generation: 1 }));
    s.owner.restart();
    expect(s.capability('fullscreen')).toEqual(status('idle', { generation: 1 }));
    await s.screen.enter();
    expect({ calls: s.screen.calls, keys: s.screen.lockLog() }).toEqual({ calls: ['requestFullscreen', 'exitFullscreen'], keys: [] });
  });

  it('never exits a fullscreen this owner did not enter, and exits its own after a fault only on restart', async () => {
    const s = await setup();
    s.screen.fullscreen = true;
    s.screen.emit('fullscreenchange');
    s.start();
    s.fly();
    await s.screen.settleLock();
    s.owner.restart();
    expect(s.screen.calls).toEqual(['lockKeys', 'unlockKeys']);

    s.screen.leave();
    s.start();
    await s.screen.enter();
    s.fly();
    await s.screen.settleLock();
    s.host.requestFailure = new Error('no frame');
    s.frame();
    expect(s.session().status().phase).toBe('faulted');
    expect(s.screen.calls.slice(2)).toEqual(['requestFullscreen', 'lockKeys', 'unlockKeys']);
    s.host.requestFailure = undefined;
    s.owner.restart();
    expect(s.screen.calls.at(-1)).toBe('exitFullscreen');
  });

  it('unlocks the keys of a run that stopped, keeps its fullscreen, and exits that only on restart', async () => {
    capacity.refuseAt = 3;
    const s = await setup();
    await lockedFlight(s);
    s.frame(5);
    expect(s.session().status()).toMatchObject({ phase: 'stopped', stopReason: 'recording-capacity' });
    expect({ calls: s.screen.calls.slice(1), fullscreen: s.capability('fullscreen').state, keys: s.capability('keyboardLock').state })
      .toEqual({ calls: ['lockKeys', 'unlockKeys'], fullscreen: 'active', keys: 'idle' });
    s.owner.restart();
    expect(s.screen.calls.at(-1)).toBe('exitFullscreen');
  });

  it.each([
    ['rejected', (screen: ScreenHost) => { screen.requests[0]!.reject(hostError('TypeError')); }],
    ['not-entered', (screen: ScreenHost) => { screen.requests[0]!.resolve(); }],
  ] as const)('shows a request %s as failed and lets the mission go on', async (reason, settle) => {
    const s = await setup();
    s.start();
    settle(s.screen);
    await flush();
    s.fly();
    expect({ fullscreen: s.capability('fullscreen'), keys: s.capability('keyboardLock').state, phase: s.session().status().phase })
      .toEqual({ fullscreen: status('failed', { generation: 1, runId: 1, failure: { operation: 'request', reason } }), keys: 'idle', phase: 'running' });
  });

  it('shows a host that threw, no fullscreen and no Keyboard Lock as they are, and starts without fullscreen without both', async () => {
    const thrown = await setup();
    thrown.screen.failRequest = new Error('host threw');
    thrown.start();
    await flush();
    expect(thrown.capability('fullscreen')).toEqual(status('failed', { generation: 1, runId: 1, failure: { operation: 'request', reason: 'failed' } }));

    const none = await setup({ fullscreen: false });
    none.start();
    none.caps.requestFullscreen();
    expect({ calls: none.screen.calls, fullscreen: none.capability('fullscreen').state, phase: none.owner.getSnapshot().flow.position })
      .toEqual({ calls: [], fullscreen: 'unsupported', phase: 'departure' });

    const unlockable = await setup({ keyboardLock: false });
    unlockable.start();
    expect({ calls: unlockable.screen.calls, keys: unlockable.capability('keyboardLock').state }).toEqual({ calls: [], keys: 'unsupported' });
    // The shell's button still asks for fullscreen; no key is locked there.
    unlockable.caps.requestFullscreen();
    await unlockable.screen.enter();
    unlockable.fly();
    expect(unlockable.screen.calls).toEqual(['requestFullscreen']);
  });

  it('clears the input as a focus loss when fullscreen ends while running, and only locally while hidden', async () => {
    const s = await setup();
    await lockedFlight(s);
    s.keyboard.press('KeyI');
    s.frame();
    expect(s.lastTick()).toEqual(PITCH_DOWN);
    s.screen.leave();
    expect({ calls: s.calls, locks: s.screen.lockLog(), keys: s.capability('keyboardLock').state })
      .toEqual({ calls: ['clear-input focus-loss'], locks: ['lock', 'unlock'], keys: 'idle' });
    s.frame();
    expect(s.lastTick()).toEqual(NEUTRAL);

    // A new press holds again; a page that also went hidden pauses itself, so the clear stays local.
    s.keyboard.lift('KeyI');
    s.keyboard.press('KeyI');
    s.caps.requestFullscreen();
    await s.screen.enter();
    s.host.emit({ type: 'visibility', visibility: 'hidden' });
    s.screen.leave();
    expect(s.calls).toEqual(['clear-input focus-loss']);
    s.host.emit({ type: 'visibility', visibility: 'visible' });
    s.owner.resume();
    s.frame(0);
    s.frame();
    expect(s.lastTick()).toEqual(NEUTRAL);
  });

  it('revokes an open request on an explicit exit, exiting its late success without clearing the input', async () => {
    const s = await setup();
    s.start();
    s.screen.requests[0]!.reject(hostError('TypeError'));
    await flush();
    s.fly();
    s.keyboard.press('KeyI');
    s.caps.requestFullscreen();
    s.caps.exitFullscreen();
    expect(s.capability('fullscreen')).toEqual(status('idle', { generation: 2, runId: 1 }));
    await s.screen.enter();
    expect({ calls: s.screen.calls.slice(-2), keys: s.screen.lockLog() }).toEqual({ calls: ['requestFullscreen', 'exitFullscreen'], keys: [] });
    await s.screen.exited();
    s.frame();
    expect({ calls: s.calls, tick: s.lastTick(), fullscreen: s.capability('fullscreen').state })
      .toEqual({ calls: [], tick: PITCH_DOWN, fullscreen: 'idle' });

    // And an explicit exit of an active fullscreen exits only what this owner entered; a failed exit keeps it active.
    s.caps.requestFullscreen();
    await s.screen.enter();
    s.caps.exitFullscreen();
    s.screen.exits.at(-1)!.reject(hostError('TypeError'));
    await flush();
    expect(s.capability('fullscreen')).toEqual(status('active', { generation: 3, runId: 1, failure: { operation: 'release', reason: 'rejected' } }));
  });
});

describe('key lock', () => {
  it('locks the bound codes only in fullscreen while running with a qualified zone, and unlocks at once otherwise', async () => {
    const s = await setup();
    const { screen, keyboard, owner, host } = s;
    s.start();
    await screen.enter();
    keyboard.signal('focusin', true);
    // The departure holds the run: no lock.
    expect(screen.lockLog()).toEqual([]);
    skip(owner);
    host.deliver(0);
    expect(screen.lockLog()).toEqual(['lock']);
    expect(screen.locks[0]!.codes).toEqual(LOCK_CODES);
    expect(screen.locks[0]!.codes.filter((code) => ['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'F12'].includes(code))).toEqual([]);
    expect(s.capability('keyboardLock')).toEqual(status('pending', { generation: 1, runId: 1 }));
    await screen.settleLock();
    expect(s.capability('keyboardLock')).toEqual(status('active', { generation: 1, runId: 1 }));

    const cycle = async (leave: () => void, back: () => unknown): Promise<string[]> => {
      const before = screen.lockLog().length;
      leave();
      const left = screen.lockLog().slice(before);
      expect(s.capability('keyboardLock').state).toBe('idle');
      await back();
      await screen.settleLock();
      expect(s.capability('keyboardLock').state).toBe('active');
      return [...left, '|', ...screen.lockLog().slice(before + left.length)];
    };
    const steps = [
      await cycle(() => { owner.pause(); }, () => { owner.resume(); }),
      await cycle(() => { keyboard.signal('blur', false); }, () => { keyboard.signal('focus', true); }),
      await cycle(() => { owner.openMenu(); }, () => { owner.continueFromMenu(); }),
      await cycle(() => {
        host.emit({ type: 'visibility', visibility: 'hidden' });
        keyboard.signal('visibilitychange', false);
      }, () => {
        host.emit({ type: 'visibility', visibility: 'visible' });
        keyboard.signal('visibilitychange', true);
        owner.resume();
      }),
      await cycle(() => { screen.leave(); }, () => {
        s.caps.requestFullscreen();
        return screen.enter();
      }),
    ];
    expect(steps).toEqual(Array(5).fill(['unlock', '|', 'lock']));

    // A run that faulted, the restart, the next start page and departure lock nothing.
    host.requestFailure = new Error('no frame');
    s.frame();
    host.requestFailure = undefined;
    owner.restart();
    await screen.exited();
    toConfig(owner);
    s.caps.startWithFullscreen(() => { owner.start(); });
    await screen.enter();
    expect(screen.lockLog().slice(-2)).toEqual(['lock', 'unlock']);
    expect(s.capability('keyboardLock')).toEqual(status('idle', { generation: 6, runId: 1 }));
  });

  it('unlocks a pending lock at once and requests no other until it settled, so a late success never locks', async () => {
    const s = await setup();
    s.start();
    await s.screen.enter();
    s.fly();
    s.owner.pause();
    s.owner.resume();
    expect({ log: s.screen.lockLog(), keys: s.capability('keyboardLock') }).toEqual({ log: ['lock', 'unlock'], keys: status('idle', { generation: 1, runId: 1 }) });
    await s.screen.settleLock(0);
    expect({ log: s.screen.lockLog(), keys: s.capability('keyboardLock') }).toEqual({ log: ['lock', 'unlock', 'lock'], keys: status('pending', { generation: 2, runId: 1 }) });

    // A revoked lock that this owner's unlock replaced did not fail; another late failure is that request's own, shown
    // while it is the latest, and blocks no new lock.
    s.owner.pause();
    await s.screen.settleLock(1, hostError('AbortError'));
    expect(s.capability('keyboardLock')).toEqual(status('idle', { generation: 2, runId: 1 }));
    s.owner.resume();
    s.owner.pause();
    await s.screen.settleLock(2, hostError('NotAllowedError'));
    expect(s.capability('keyboardLock')).toEqual(status('failed', { generation: 3, runId: 1, failure: { operation: 'request', reason: 'denied' } }));
    s.owner.resume();
    expect({ log: s.screen.lockLog(), keys: s.capability('keyboardLock').state })
      .toEqual({ log: ['lock', 'unlock', 'lock', 'unlock', 'lock', 'unlock', 'lock'], keys: 'pending' });
  });

  it('locks no key while a fullscreen request is open, as for a revoked request whose change is reported first', async () => {
    const s = await setup();
    s.start();
    s.screen.requests[0]!.reject(hostError('TypeError'));
    await flush();
    s.fly();
    s.caps.requestFullscreen();
    s.caps.exitFullscreen();
    s.screen.fullscreen = true;
    s.screen.emit('fullscreenchange');
    expect(s.screen.lockLog()).toEqual([]);
    s.screen.requests[1]!.resolve();
    await flush();
    expect({ calls: s.screen.calls.slice(-1), log: s.screen.lockLog() }).toEqual({ calls: ['exitFullscreen'], log: [] });
    await s.screen.exited();
    expect({ log: s.screen.lockLog(), calls: s.calls }).toEqual({ log: [], calls: [] });
  });

  it('keeps fullscreen without locked keys after a lock failure, and tries again only after a new gesture', async () => {
    const s = await setup();
    s.start();
    await s.screen.enter();
    s.fly();
    await s.screen.settleLock(0, hostError('NotAllowedError'));
    const failed = status('failed', { generation: 1, runId: 1, failure: { operation: 'request', reason: 'denied' } });
    expect({ fullscreen: s.capability('fullscreen').state, keys: s.capability('keyboardLock') }).toEqual({ fullscreen: 'active', keys: failed });
    s.owner.pause();
    s.owner.resume();
    s.keyboard.signal('blur', false);
    s.keyboard.signal('focus', true);
    expect(s.screen.lockLog()).toEqual(['lock']);
    s.caps.retryKeyboardLock();
    expect({ log: s.screen.lockLog(), keys: s.capability('keyboardLock') }).toEqual({ log: ['lock', 'lock'], keys: status('pending', { generation: 2, runId: 1 }) });
  });

  it('keeps a lock it could not release recorded and in force, and releases it on the next change', async () => {
    const s = await setup();
    await lockedFlight(s);
    s.screen.failUnlock = new Error('unlock failed');
    s.owner.pause();
    expect(s.capability('keyboardLock')).toEqual(status('active', { generation: 1, runId: 1, failure: { operation: 'release', reason: 'failed' } }));
    s.screen.failUnlock = null;
    s.keyboard.signal('blur', false);
    expect({ log: s.screen.lockLog(), keys: s.capability('keyboardLock') }).toEqual({ log: ['lock', 'unlock', 'unlock'], keys: status('idle', { generation: 1, runId: 1 }) });
  });
});

describe('pointer lock', () => {
  it('requests for the current run with a generation, confirms the actual target, and leaves Esc to the browser', async () => {
    const s = await setup();
    s.caps.requestPointerLock();
    expect({ requests: s.pointer.requests, lock: s.capability('pointerLock') }).toEqual({ requests: 0, lock: status('idle') });
    s.start();
    s.fly();
    s.caps.requestPointerLock();
    s.caps.requestPointerLock();
    expect({ requests: s.pointer.requests, lock: s.capability('pointerLock') }).toEqual({ requests: 1, lock: status('pending', { generation: 1, runId: 1 }) });
    s.pointer.change('other');
    expect(s.capability('pointerLock')).toEqual(status('pending', { generation: 1, runId: 1 }));
    await flush();
    expect(s.capability('pointerLock')).toEqual(status('failed', { generation: 1, runId: 1, failure: { operation: 'request', reason: 'target-mismatch' } }));

    s.pointer.change('none');
    s.caps.requestPointerLock();
    s.pointer.change('target');
    expect({ lock: s.capability('pointerLock'), locked: s.caps.pointerLocked() }).toEqual({ lock: status('active', { generation: 2, runId: 1 }), locked: true });
    s.keyboard.press('Escape');
    expect({ position: s.owner.getSnapshot().flow.position, calls: s.calls }).toEqual({ position: 'flight', calls: [] });
  });

  it('reports a refused or unsupported Pointer Lock by its category', async () => {
    const s = await setup();
    s.start();
    s.fly();
    s.caps.requestPointerLock();
    s.pointer.error();
    await flush();
    expect(s.capability('pointerLock')).toEqual(status('failed', { generation: 1, runId: 1, failure: { operation: 'request', reason: 'rejected' } }));
    s.pointer.isSupported = false;
    s.caps.requestPointerLock();
    expect({ requests: s.pointer.requests, state: s.capability('pointerLock').state }).toEqual({ requests: 1, state: 'unsupported' });
  });

  it('shows a revoked request\'s late failure as its own only while no newer request is shown', async () => {
    const s = await setup();
    s.start();
    s.fly();
    s.caps.requestPointerLock();
    s.caps.exitPointerLock();
    s.caps.requestPointerLock();
    const closing = status('failed', { generation: 2, runId: 1, failure: { operation: 'request', reason: 'closing' } });
    expect(s.capability('pointerLock')).toEqual(closing);
    s.pointer.error();
    await flush();
    expect(s.capability('pointerLock')).toEqual(closing);
    s.caps.requestPointerLock();
    s.caps.exitPointerLock();
    s.pointer.error();
    await flush();
    expect(s.capability('pointerLock')).toEqual(status('failed', { generation: 3, runId: 1, failure: { operation: 'request', reason: 'rejected' } }));
  });

  it('clears the input on every end of its lock, passive or active, sending clear-input only while running', async () => {
    const s = await setup();
    s.start();
    s.fly();
    const lockAndHold = (): void => {
      s.caps.requestPointerLock();
      s.pointer.change('target');
      s.keyboard.lift('KeyI');
      s.keyboard.press('KeyI');
    };
    lockAndHold();
    s.pointer.change('none');
    s.frame();
    expect({ calls: s.calls, tick: s.lastTick(), lock: s.capability('pointerLock').state })
      .toEqual({ calls: ['clear-input pointer-lock-exit'], tick: NEUTRAL, lock: 'idle' });

    lockAndHold();
    s.caps.exitPointerLock();
    expect({ exits: s.pointer.exits, lock: s.capability('pointerLock').state }).toEqual({ exits: 1, lock: 'active' });
    s.pointer.change('none');
    expect(s.calls).toEqual(['clear-input pointer-lock-exit', 'clear-input pointer-lock-exit']);

    // Paused, the session cleared already: only the local state is cleared.
    lockAndHold();
    s.owner.pause();
    s.pointer.change('none');
    s.owner.resume();
    s.frame(0);
    s.frame();
    expect({ calls: s.calls.length, tick: s.lastTick() }).toEqual({ calls: 2, tick: NEUTRAL });
  });

  it('undoes the late lock of a revoked request with no state, clear or new request, and ends a run\'s lock with its run', async () => {
    const s = await setup();
    s.start();
    s.fly();
    s.caps.requestPointerLock();
    s.caps.exitPointerLock();
    expect(s.capability('pointerLock')).toEqual(status('idle', { generation: 1, runId: 1 }));
    s.pointer.change('target');
    expect({ exits: s.pointer.exits, locked: s.caps.pointerLocked(), lock: s.capability('pointerLock').state })
      .toEqual({ exits: 1, locked: true, lock: 'idle' });
    // While that lock is held, a new request waits for its end.
    s.caps.requestPointerLock();
    expect({ requests: s.pointer.requests, lock: s.capability('pointerLock') })
      .toEqual({ requests: 1, lock: status('failed', { generation: 2, runId: 1, failure: { operation: 'request', reason: 'closing' } }) });
    s.pointer.change('none');
    expect(s.calls).toEqual([]);

    // A restart ends the old run's lock; the faulted run's input ends its lock as well.
    s.caps.requestPointerLock();
    s.pointer.change('target');
    s.owner.restart();
    expect(s.pointer.exits).toBe(2);
    s.pointer.change('none');
    s.start();
    s.fly();
    s.caps.requestPointerLock();
    s.pointer.change('target');
    expect(s.capability('pointerLock')).toEqual(status('active', { generation: 4, runId: 2 }));
    s.host.requestFailure = new Error('no frame');
    s.frame();
    expect(s.pointer.exits).toBe(3);
    expect(s.calls).toEqual([]);
  });
});

describe('pointer input', () => {
  it('passes absolute input while unlocked and relative input only under a lock this owner is not exiting', async () => {
    const host = new PointerHost();
    const inputs: PointerInput['type'][] = [];
    const cleared: string[] = [];
    const running = { phase: 'running', runId: 1 } as GameSessionStatus;
    const capabilities = createInputCapabilities({ pointerLock: () => createPointerLock(host) });
    capabilities.connect({
      ownerId: 1, previousClosed: Promise.resolve(true), status: createInputStatus(),
      session: { status: () => running, currentRun: () => null, onStatus: () => () => undefined },
      facts: () => ({ runId: 1, running: true, eligible: true }),
      clear: (reason) => { cleared.push(reason); },
      pointer: (input) => { inputs.push(input.type); },
    });
    await flush();
    const send = (type: PointerEventType): void => { host.pointers.get(type)!({ button: 0, movementX: 1, movementY: 1, clientX: 5, clientY: 5 }); };
    send('mousemove');
    capabilities.requestPointerLock();
    host.change('target');
    send('mousedown');
    capabilities.exitPointerLock();
    send('mousemove');
    send('mouseup');
    host.change('none');
    send('mousemove');
    // A revoked request's late lock passes nothing while it is undone.
    capabilities.requestPointerLock();
    capabilities.exitPointerLock();
    host.change('target');
    send('mousemove');
    host.change('none');
    expect({ inputs, cleared, exits: host.exits }).toEqual({ inputs: ['move', 'down', 'move'], cleared: ['pointer-lock-exit'], exits: 2 });
    const { closes } = capabilities.release();
    expect(closes).toBeNull();
  });
});

describe('barriers and release', () => {
  it('lets no old run\'s late result reach the new run, which waits for the old requests to close', async () => {
    const s = await setup();
    s.start();
    await s.screen.enter();
    s.fly();
    s.caps.requestPointerLock();
    s.owner.restart();
    await s.screen.exited();
    s.start();
    s.fly();
    // Run 1's key lock and Pointer Lock requests are still open.
    expect({ log: s.screen.lockLog(), keys: s.capability('keyboardLock').state }).toEqual({ log: ['lock', 'unlock'], keys: 'idle' });
    s.caps.requestPointerLock();
    expect(s.capability('pointerLock')).toEqual(status('failed', { generation: 2, runId: 2, failure: { operation: 'request', reason: 'closing' } }));

    // Their late successes are undone and touch nothing of run 2.
    s.pointer.change('target');
    await flush();
    expect({ exits: s.pointer.exits, lock: s.capability('pointerLock').state }).toEqual({ exits: 1, lock: 'failed' });
    s.pointer.change('none');
    s.caps.requestFullscreen();
    await s.screen.enter();
    await s.screen.settleLock(0);
    expect({ log: s.screen.lockLog(), keys: s.capability('keyboardLock') }).toEqual({ log: ['lock', 'unlock', 'lock'], keys: status('pending', { generation: 2, runId: 2 }) });
    s.caps.requestPointerLock();
    s.pointer.change('target');
    expect({ calls: s.calls, lock: s.capability('pointerLock') }).toEqual({ calls: [], lock: status('active', { generation: 3, runId: 2 }) });
  });

  it('requests nothing before the earlier owner\'s close is confirmed', async () => {
    const first = await setup();
    first.start();
    first.screen.requests[0]!.reject(hostError('TypeError'));
    await flush();
    first.fly();
    first.caps.requestPointerLock();
    // Opening the next owner releases the first, whose open request makes its release an asynchronous close.
    const second = await setup({ on: { slot: first.slot, holder: first.holder }, early: true });
    expect(first.releases).toEqual([expect.any(Promise)]);
    second.start();
    await flush();
    second.fly();
    second.caps.requestFullscreen();
    second.caps.requestPointerLock();
    const closing = { operation: 'request', reason: 'closing' } as const;
    expect({ requests: second.pointer.requests, fullscreen: second.capability('fullscreen'), pointer: second.capability('pointerLock') })
      .toEqual({
        requests: 0, fullscreen: status('failed', { ownerId: 2, generation: 2, runId: 1, failure: closing }),
        pointer: status('failed', { ownerId: 2, generation: 1, runId: 1, failure: closing }),
      });
    // A fullscreen of anyone else's qualifies the keys but for the barrier: no lock is asked for yet.
    second.screen.fullscreen = true;
    second.screen.emit('fullscreenchange');
    expect(second.screen.calls).toEqual([]);

    // The first owner's late lock is exited, then its port released; only then may the second request.
    first.pointer.change('target');
    await flush();
    expect({ exits: first.pointer.exits, listeners: first.pointer.locks.size, locks: second.screen.lockLog() })
      .toEqual({ exits: 2, listeners: 0, locks: ['lock'] });
    second.screen.leave();
    second.caps.requestFullscreen();
    expect(second.capability('fullscreen')).toEqual(status('pending', { ownerId: 2, generation: 3, runId: 1 }));
    expect(first.slot.onCleanupFailure).not.toHaveBeenCalled();
  });

  it('invalidates first, then releases each capability, failing the close with everything it could not confirm', async () => {
    const s = await setup();
    await lockedFlight(s);
    s.screen.failUnlock = new Error('unlock failed');
    const statuses = s.consumer.status.getState();
    s.slot.slot.release();
    expect(s.releases).toEqual([expect.any(Promise)]);
    expect({ calls: s.screen.calls.slice(-2), listeners: s.screen.listeners.get('fullscreenchange')!.size, keyboard: s.keyboard.releases })
      .toEqual({ calls: ['unlockKeys', 'exitFullscreen'], listeners: 0, keyboard: 1 });
    s.screen.exits[0]!.reject(hostError('TypeError'));
    await flush();
    expect(s.consumer.status.getState()).toBe(statuses);
    expect(s.slot.onCleanupFailure).toHaveBeenCalledTimes(1);
    const failure = s.slot.onCleanupFailure.mock.calls[0]![0] as AggregateError;
    expect(failure.errors).toEqual([new Error('unlock failed'), new CapabilityReleaseError('fullscreen', 'rejected')]);
    expect(failure.errors[1]).toMatchObject({ capability: 'fullscreen', reason: 'rejected' });
  });

  it('makes an open key lock part of the close, unlocking again a lock whose unlock failed', async () => {
    const s = await setup();
    s.start();
    await s.screen.enter();
    s.fly();
    s.slot.slot.release();
    const next = await setup({ on: { slot: s.slot, holder: s.holder }, early: true });
    expect(s.releases).toEqual([expect.any(Promise)]);
    void s.screen.exited();
    await flush();
    // The first owner's lock is still open: the next owner's barrier waits for it.
    next.start();
    expect(next.capability('fullscreen').failure).toEqual({ operation: 'request', reason: 'closing' });
    await s.screen.settleLock(0);
    await flush();
    expect({ calls: s.screen.lockLog(), failure: s.slot.onCleanupFailure.mock.calls }).toEqual({ calls: ['lock', 'unlock'], failure: [] });
    next.caps.requestFullscreen();
    expect(next.capability('fullscreen').state).toBe('pending');

    const failed = await setup();
    failed.start();
    await failed.screen.enter();
    failed.fly();
    failed.screen.failUnlock = new Error('unlock failed');
    failed.slot.slot.release();
    failed.screen.failUnlock = null;
    await failed.screen.settleLock(0);
    void failed.screen.exited();
    await flush();
    expect({ log: failed.screen.lockLog(), failure: failed.slot.onCleanupFailure.mock.calls })
      .toEqual({ log: ['lock', 'unlock', 'unlock'], failure: [[new Error('unlock failed')]] });
  });

  it('exits a late fullscreen after release, and releases synchronously when nothing is open', async () => {
    const s = await setup();
    s.start();
    s.slot.slot.release();
    expect(s.screen.calls).toEqual(['requestFullscreen']);
    await s.screen.enter();
    expect(s.screen.calls).toEqual(['requestFullscreen', 'exitFullscreen']);
    await s.screen.exited();
    expect(s.slot.onCleanupFailure).not.toHaveBeenCalled();

    const idle = await setup();
    idle.start();
    idle.screen.requests[0]!.reject(hostError('TypeError'));
    await flush();
    idle.fly();
    idle.caps.requestPointerLock();
    idle.pointer.change('target');
    idle.slot.slot.release();
    // The port's release exits the lock it holds.
    expect({ releases: idle.releases, exits: idle.pointer.exits, listeners: idle.pointer.locks.size })
      .toEqual({ releases: [undefined], exits: 1, listeners: 0 });
  });

  it('rolls back a capability that could not connect, failing the owner\'s creation', async () => {
    const s = await setup();
    const keyboard = new FakeKeyboard();
    const screen = new ScreenHost();
    screen.failListen = 'fullscreenerror';
    const failing = createInputConsumer<string>({ keyboard: () => keyboard, bindings: TEST_BINDINGS, feedback: () => null, fullscreen: () => createFullscreenPort(screen) });
    expect(() => s.slot.slot.open(() => ownerSetup(s.holder, testPorts(), { consumers: [failing] }))).toThrowError('listen fullscreenerror failed');
    expect(keyboard.releases).toBe(1);

    const pointer = new PointerHost();
    pointer.failAdd = true;
    const other = new ScreenHost();
    other.failRemove = new Error('remove failed');
    const rolledBack = createInputConsumer<string>({
      keyboard: () => new FakeKeyboard(), bindings: TEST_BINDINGS, feedback: () => null,
      fullscreen: () => createFullscreenPort(other), pointerLock: () => createPointerLock(pointer),
    });
    const { slot, holder } = await setup();
    let thrown: unknown;
    try {
      slot.slot.open(() => ownerSetup(holder, testPorts(), { consumers: [rolledBack] }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RollbackError);
    expect((thrown as RollbackError).errors).toEqual([new Error('listenLock failed'), expect.any(AggregateError)]);
  });

  it('refuses key lock codes that are empty or unlockable when the consumer is created', () => {
    for (const keyLockCodes of [[], [''], ['KeyI', 'Escape'], ['Tab'], ['MetaLeft'], ['F12']]) {
      expect(() => createInputConsumer<string>({ keyboard: () => new FakeKeyboard(), bindings: TEST_BINDINGS, feedback: () => null, keyLockCodes }))
        .toThrowError(RangeError);
    }
  });
});
