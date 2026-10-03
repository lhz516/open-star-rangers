import { afterEach, describe, expect, it, vi } from 'vitest';
import { RollbackError } from '../session/rollback-error.ts';
import { GameSessionError } from '../session/session-errors.ts';
import { ControlledHost } from '../session/synthetic-session.test-support.ts';
import type * as BridgeModule from '../../ui/game/synthetic-session-bridge.ts';
import type { SessionCleanup } from '../session/session-host.ts';
import type { SyntheticSession } from '../session/synthetic-session.ts';
import { TestClock } from '../../ui/game/synthetic-ui.test-support.ts';
import { RecordingSurface } from '../../render/scene/render-surface.test-support.ts';
import { createSyntheticDemoOwner } from './synthetic-demo-owner.ts';
import { createKeyboardSource } from '../../platform/input/keyboard-source.ts';
import type { KeyboardHost, KeyboardLifecycleType } from '../../platform/input/keyboard-source.ts';
import { normalizeKeyboardInput } from '../../platform/input/keyboard-input.ts';
import type { KeyboardInput } from '../../platform/input/keyboard-input.ts';

const failures = vi.hoisted(() => ({
  bind: undefined as unknown, afterBind: undefined as unknown, unbind: undefined as unknown, trace: null as string[] | null,
  /**
   * Makes an extra run consumer own a cleanup that throws this, through the session unless
   * `consumerOwnsDirectly`, then fail to attach with `consumerAttach`.
   */
  consumerRollback: undefined as unknown, consumerAttach: undefined as unknown, consumerOwnsDirectly: false,
  bridge: null as BridgeModule.SyntheticSessionBridge | null,
}));
vi.mock('../../ui/game/synthetic-session-bridge.ts', async importOriginal => {
  const original = await importOriginal<typeof BridgeModule>();
  return {
    ...original,
    createSyntheticSessionBridge(...[store, clock, consumers = []]: Parameters<typeof original.createSyntheticSessionBridge>) {
      const failing: BridgeModule.SyntheticRunConsumer = {
        attach: binding => {
          const cleanup = (): undefined => { throw failures.consumerRollback; };
          binding.own(failures.consumerOwnsDirectly ? cleanup : binding.run.ownCleanup(cleanup));
          throw failures.consumerAttach;
        },
      };
      const bridge = original.createSyntheticSessionBridge(store, clock, failures.consumerAttach === undefined ? consumers : [...consumers, failing]);
      failures.bridge = bridge;
      return Object.freeze({
        onError: bridge.onError,
        bind(session: SyntheticSession) {
          if (failures.bind !== undefined) throw failures.bind;
          bridge.bind(session);
          if (failures.afterBind !== undefined) throw failures.afterBind;
        },
        unbind: () => {
          failures.trace?.push('bridge');
          bridge.unbind();
          if (failures.unbind !== undefined) throw failures.unbind;
        },
        currentRun: () => bridge.currentRun(),
      });
    },
  };
});
afterEach(() => {
  Object.assign(failures, {
    bind: undefined, afterBind: undefined, unbind: undefined, trace: null, consumerRollback: undefined, consumerAttach: undefined, consumerOwnsDirectly: false, bridge: null,
  });
});

/** A controlled host whose lifecycle cancellation can be made to fail. */
class FailingCancelHost extends ControlledHost {
  lifecycleCancelFailure: unknown;
  override subscribeLifecycle(listener: Parameters<ControlledHost['subscribeLifecycle']>[0]): SessionCleanup {
    const cancel = super.subscribeLifecycle(listener);
    return (): undefined => {
      cancel();
      if (this.lifecycleCancelFailure !== undefined) throw this.lifecycleCancelFailure;
    };
  }
}

/** Owners for the P1-06 behaviour run without a picture. */
const NO_VIEW = Object.freeze({ unavailable: new Error('no view in this test'), reportError: (error: unknown) => { throw error; } });

function counts(host: ControlledHost) {
  return { requests: host.pending.size, listeners: host.listeners.size };
}

describe('synthetic demo owner', () => {
  it('creates an idle owner without a frame request and starts only on dispatch', () => {
    const host = new ControlledHost();
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    expect(owner.store.getState()).toEqual({
      status: expect.objectContaining({ phase: 'idle', runId: null }), projection: null,
      pendingCommands: [], recentResults: [], actionError: null, sessionError: null,
    });
    expect(counts(host)).toEqual({ requests: 0, listeners: 1 });
    owner.dispatch('start');
    expect(counts(host)).toEqual({ requests: 1, listeners: 1 });
    expect(owner.store.getState().projection).toMatchObject({ scenario: 'synthetic', tick: 0, tickRateHz: 60, marker: null });
    owner.dispatch('add-marker');
    expect(owner.store.getState().pendingCommands).toEqual([{ runId: 1, commandId: 1, commandType: 'add-marker' }]);
    host.deliver(0); host.deliver(1000 / 60);
    expect(owner.store.getState().recentResults).toEqual([expect.objectContaining({ commandId: 1, outcome: 'accepted' })]);
    owner.dispose();
  });

  it('reports a failed session creation as initialize without leaving host resources', () => {
    const host = new ControlledHost();
    const cause = new Error('subscribe');
    host.subscribeFailure = cause;
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    const state = owner.store.getState();
    expect(state).toMatchObject({ status: null, projection: null, actionError: { operation: 'initialize' } });
    expect(state.actionError?.cause).toBeInstanceOf(GameSessionError);
    expect(state.actionError?.cause).toMatchObject({ failures: [{ phase: 'scheduler', cause }] });
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    owner.dispatch('start');
    expect(owner.store.getState()).toBe(state);
    expect(() => owner.dispose()).not.toThrow();
  });

  it('disposes the created session when wiring the bridge fails', () => {
    const host = new ControlledHost();
    const cause = new Error('bind');
    failures.bind = cause;
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    expect(owner.store.getState()).toMatchObject({ status: null, actionError: { operation: 'initialize', cause } });
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    expect(host.unsubscribed).toBe(1);
  });

  it('unbinds a bound bridge and clears its status when a later wiring step fails', () => {
    const host = new ControlledHost();
    const cause = new Error('after bind');
    failures.afterBind = cause;
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    expect(owner.store.getState()).toEqual({
      status: null, projection: null, pendingCommands: [], recentResults: [],
      actionError: { operation: 'initialize', cause }, sessionError: null,
    });
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    expect(host.unsubscribed).toBe(1);
  });

  it('attempts every rollback step and keeps all failures when they also fail', () => {
    const host = new FailingCancelHost();
    const cause = new Error('after bind'), disposeFailure = new Error('lifecycle cancel'), unbindFailure = new Error('unbind');
    failures.afterBind = cause;
    failures.unbind = unbindFailure;
    host.lifecycleCancelFailure = disposeFailure;
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    const error = owner.store.getState().actionError;
    expect(error?.operation).toBe('initialize');
    expect(error?.cause).toBeInstanceOf(AggregateError);
    const [first, sessionFailure, last] = (error?.cause as AggregateError).errors;
    expect(first).toBe(cause);
    expect(sessionFailure).toMatchObject({ kind: 'operation-failed', failures: [{ phase: 'cleanup', cause: disposeFailure }] });
    expect(last).toBe(unbindFailure);
    expect(owner.store.getState().status).toBeNull();
    expect(host.listeners.size).toBe(0);
  });

  it('releases every host resource on dispose, once, and ignores later actions', () => {
    const host = new ControlledHost();
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    owner.dispatch('start');
    host.deliver(0);
    owner.dispose();
    const state = owner.store.getState();
    expect(state).toMatchObject({ status: { phase: 'disposed', runId: null }, projection: null, pendingCommands: [], recentResults: [] });
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    expect(host.unsubscribed).toBe(1);
    owner.dispose();
    owner.dispatch('start');
    owner.dispatch('add-marker');
    expect(owner.store.getState()).toBe(state);
    expect(host.unsubscribed).toBe(1);
  });

  it('attempts every cleanup and reports a failed one when disposing', () => {
    const host = new ControlledHost();
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    owner.dispatch('start');
    const cause = new Error('cancel');
    host.cancelFailure = cause;
    let thrown: unknown;
    try { owner.dispose(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    const [sessionFailure] = (thrown as AggregateError).errors;
    expect(sessionFailure).toMatchObject({ kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }] });
    expect(owner.store.getState()).toMatchObject({ status: { phase: 'disposed', cleanupFailed: true }, actionError: { operation: 'cleanup' } });
    expect(owner.store.getState().actionError?.cause).toBe(thrown);
    expect(host.listeners.size).toBe(0);
    expect(() => owner.dispose()).not.toThrow();
  });

  it('keeps at most one live owner across a StrictMode-style create, dispose, create sequence', () => {
    const host = new ControlledHost();
    const first = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    expect(counts(host)).toEqual({ requests: 0, listeners: 1 });
    const [staleLifecycle] = host.listeners;
    first.dispatch('start');
    const [staleFrame] = host.pending.values();
    first.dispose();
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    const secondClock = new TestClock();
    const second = createSyntheticDemoOwner(host, secondClock.read, NO_VIEW);
    second.dispatch('start');
    expect(counts(host)).toEqual({ requests: 1, listeners: 1 });
    const firstState = first.store.getState();
    const secondState = second.store.getState();
    staleFrame(100);
    staleLifecycle({ type: 'visibility', visibility: 'hidden' });
    first.dispatch('add-marker');
    first.dispatch('restart');
    expect(first.store.getState()).toBe(firstState);
    expect(second.store.getState()).toBe(secondState);
    expect(counts(host)).toEqual({ requests: 1, listeners: 1 });
    secondClock.now = 200;
    host.deliver(0); host.deliver(1000 / 60);
    expect(second.store.getState()).toMatchObject({ status: { phase: 'running', runId: 1 }, projection: { tick: 1 } });
    expect(first.store.getState()).toBe(firstState);
    second.dispose();
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
  });
});

/** A controlled host whose lifecycle cancellation is written to a shared trace. */
class TracingHost extends ControlledHost {
  readonly trace: string[];
  constructor(trace: string[]) { super(); this.trace = trace; }
  override subscribeLifecycle(listener: Parameters<ControlledHost['subscribeLifecycle']>[0]): SessionCleanup {
    const cancel = super.subscribeLifecycle(listener);
    return (): undefined => { this.trace.push('session'); cancel(); };
  }
}

describe('synthetic demo owner with a renderer', () => {
  const reportError = (error: unknown): void => { throw error; };
  const entityNames = (surface: RecordingSurface): string[] => (surface.lastDraw?.objects ?? []).map(object => object.name);

  it('draws every run it starts, including a restarted one', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    surface.resize();
    expect(surface.draws).toHaveLength(1);
    owner.dispatch('start');
    expect(entityNames(surface)).toEqual(['run-1-entity-1']);
    owner.dispatch('add-marker');
    host.deliver(0); host.deliver(1000 / 60);
    expect(entityNames(surface)).toEqual(['run-1-entity-1', 'run-1-entity-2']);
    expect(owner.renderer.diagnostics()).toMatchObject({ state: 'ready', runId: 1, drawnTick: 1, entities: 2 });
    owner.dispatch('restart');
    expect(entityNames(surface)).toEqual(['run-2-entity-1']);
    expect(owner.renderer.getSnapshot()).toEqual({ state: 'ready', error: null });
    owner.dispose();
  });

  it('releases the session, then the bridge, then the renderer, and nothing draws or notifies afterwards', () => {
    const surface = new RecordingSurface();
    failures.trace = surface.calls;
    const host = new TracingHost(surface.calls);
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    surface.resize();
    owner.dispatch('start');
    const { events } = surface;
    let notifications = 0;
    owner.renderer.subscribe(() => { notifications++; });
    owner.dispose();
    const tail = surface.calls.slice(surface.calls.indexOf('session'));
    expect(tail).toEqual(['session', 'bridge', 'disconnect', 'dispose']);
    expect(surface.calls.at(-5)).toBe('draw');
    const draws = surface.draws.length;
    events!.resize({ width: 320, height: 240, devicePixelRatio: 1 });
    events!.contextLost();
    expect(surface.draws).toHaveLength(draws);
    expect(notifications).toBe(0);
    expect(owner.renderer.getSnapshot().state).toBe('disposed');
    owner.dispose();
    expect(surface.calls.filter(call => call === 'dispose')).toHaveLength(1);
  });

  it('releases a transferred surface when the session cannot be created', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    host.subscribeFailure = new Error('subscribe');
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    expect(owner.store.getState().actionError?.operation).toBe('initialize');
    expect(surface.calls).toEqual(['connect', 'disconnect', 'dispose']);
    expect(owner.renderer.getSnapshot().state).toBe('disposed');
    expect(() => owner.dispose()).not.toThrow();
  });

  it('releases a transferred surface when binding fails, after the created session', () => {
    const surface = new RecordingSurface();
    failures.trace = surface.calls;
    failures.bind = new Error('bind');
    const owner = createSyntheticDemoOwner(new TracingHost(surface.calls), new TestClock().read, { surface, reportError });
    expect(owner.store.getState().actionError).toEqual({ operation: 'initialize', cause: failures.bind });
    expect(surface.calls).toEqual(['connect', 'session', 'bridge', 'disconnect', 'dispose']);
  });

  it('releases a surface that cannot connect and runs the demo with an unavailable renderer', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    const cause = new Error('connect');
    surface.connectFailure = cause;
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    expect(surface.calls).toEqual(['connect', 'disconnect', 'dispose']);
    expect(owner.renderer.getSnapshot()).toEqual({ state: 'unavailable', error: cause });
    expect(owner.store.getState()).toMatchObject({ status: { phase: 'idle' }, actionError: null });
    owner.dispatch('start');
    expect(owner.store.getState().status?.phase).toBe('running');
    owner.dispose();
    expect(host.listeners.size).toBe(0);
  });

  it('gathers a renderer cleanup failure with the others after attempting every step', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    owner.dispatch('start');
    const cause = new Error('surface dispose'), unbind = new Error('unbind');
    surface.disposeFailure = cause;
    failures.unbind = unbind;
    let thrown: unknown;
    try { owner.dispose(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    const [bridgeFailure, rendererFailure] = (thrown as AggregateError).errors;
    expect(bridgeFailure).toBe(unbind);
    expect((rendererFailure as AggregateError).errors).toEqual([cause]);
    expect(owner.store.getState().actionError).toEqual({ operation: 'cleanup', cause: thrown });
    expect(host.listeners.size).toBe(0);
  });

  it('runs the demo with an unavailable renderer', () => {
    const host = new ControlledHost();
    const cause = new Error('no WebGL 2');
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { unavailable: cause, reportError });
    expect(owner.renderer.getSnapshot()).toEqual({ state: 'unavailable', error: cause });
    owner.dispatch('start');
    owner.dispatch('add-marker');
    host.deliver(0); host.deliver(1000 / 60);
    owner.dispatch('remove-marker');
    host.deliver(2000 / 60);
    expect(owner.store.getState().recentResults.map(result => [result.commandType, result.outcome])).toEqual([
      ['add-marker', 'accepted'], ['remove-marker', 'accepted'],
    ]);
    expect(owner.renderer.diagnostics()).toMatchObject({ state: 'unavailable', draws: 0, gpu: null });
    owner.dispose();
  });

  it('keeps the session and command results going after the renderer fails to draw', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    surface.resize();
    owner.dispatch('start');
    surface.drawFailure = new Error('draw');
    host.deliver(0);
    expect(owner.renderer.getSnapshot()).toEqual({ state: 'failed', error: surface.drawFailure });
    owner.dispatch('add-marker');
    host.deliver(1000 / 60);
    expect(owner.store.getState()).toMatchObject({
      status: { phase: 'running', error: null }, sessionError: null, recentResults: [{ commandType: 'add-marker', outcome: 'accepted' }],
    });
    expect(() => owner.dispose()).not.toThrow();
  });
});

describe('synthetic demo owner cleanup failure record', () => {
  const reportError = (error: unknown): void => { throw error; };

  it('stays null for a faulted session, a failed or unavailable renderer and a released connect failure', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    const faulted = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    surface.resize();
    faulted.dispatch('start');
    surface.drawFailure = new Error('draw');
    host.deliver(0);
    expect(faulted.renderer.getSnapshot().state).toBe('failed');
    host.deliver(Number.NaN);
    expect(faulted.store.getState().status).toMatchObject({ phase: 'faulted', cleanupFailed: false });
    faulted.dispose();
    expect(faulted.cleanupFailure()).toBeNull();

    const unavailable = createSyntheticDemoOwner(new ControlledHost(), new TestClock().read, NO_VIEW);
    unavailable.dispatch('start');
    unavailable.dispose();
    expect(unavailable.cleanupFailure()).toBeNull();

    // A business failure that is itself an AggregateError is not a cleanup failure.
    const connectSurface = new RecordingSurface(), connectHost = new ControlledHost();
    const business = new AggregateError([new Error('connect')], 'connect');
    connectSurface.connectFailure = business;
    const released = createSyntheticDemoOwner(connectHost, new TestClock().read, { surface: connectSurface, reportError });
    expect(released.renderer.getSnapshot()).toEqual({ state: 'unavailable', error: business });
    released.dispatch('start');
    expect(released.store.getState().status?.phase).toBe('running');
    expect(released.cleanupFailure()).toBeNull();
    released.dispose();
  });

  class InputHost implements KeyboardHost {
    readonly keys = new Map<string, (input: KeyboardInput, prevent: () => void) => void>();
    readonly signals = new Map<string, () => void>();
    readonly removed: number[] = [];
    registrations = 0;
    failAdd = -1;
    readonly failRemove = new Set<number>();
    readonly cause = new Error('keyboard registration');
    readonly removalCause = new Error('keyboard removal');
    readonly trace: string[];
    constructor(trace: string[] = []) { this.trace = trace; }
    readFacts = () => ({ elementFocused: true, windowFocused: true, visible: true });
    listenKey(type: KeyboardInput['type'], listener: (input: KeyboardInput, prevent: () => void) => void) {
      return this.add(() => this.keys.set(type, listener));
    }
    listenSignal(type: KeyboardLifecycleType, listener: () => void) {
      return this.add(() => this.signals.set(type, listener));
    }
    add(save: () => void) {
      const id = this.registrations++;
      if (id === this.failAdd) throw this.cause;
      save();
      return () => {
        this.trace.push(`keyboard-${id}`);
        this.removed.push(id);
        if (this.failRemove.has(id)) throw this.removalCause;
      };
    }
    key(code: string, repeat = false): number {
      let prevented = 0;
      this.keys.get('keydown')?.(normalizeKeyboardInput({
        type: 'keydown', code, repeat, ctrlKey: false, altKey: false, metaKey: false, isComposing: false,
      }), () => { prevented++; });
      return prevented;
    }
  }

  describe('synthetic demo keyboard ownership', () => {
    const reportError = (error: unknown): void => { throw error; };

    it('drives an unavailable renderer and retains one source through Restart and Exit/Start', () => {
      const host = new ControlledHost(), input = new InputHost(), clock = new TestClock();
      const owner = createSyntheticDemoOwner(host, clock.read, NO_VIEW, { source: createKeyboardSource(input) });
      expect(owner.keyboard.getSnapshot()).toEqual({ state: 'active' });
      owner.dispatch('start');
      host.deliver(0);
      input.key('ArrowRight');
      clock.now = 100;
      host.deliver(100);
      expect(owner.store.getState().projection!.mover.position.x).toBeGreaterThan(0);
      input.key('KeyN');
      host.deliver(120);
      expect(owner.store.getState().recentResults.at(-1)?.outcome).toBe('accepted');
      owner.dispatch('restart');
      input.key('ArrowRight', true);
      host.deliver(140); clock.now = 240; host.deliver(240);
      expect(owner.store.getState().projection!.mover.position.x).toBe(0);
      owner.dispatch('exit');
      owner.dispatch('start');
      input.key('ArrowRight', true);
      host.deliver(260); clock.now = 360; host.deliver(360);
      expect(owner.store.getState().projection!.mover.position.x).toBe(0);
      expect(input.registrations).toBe(9);
      expect(input.removed).toHaveLength(0);
      owner.dispose();
      expect(owner.keyboard.getSnapshot()).toEqual({ state: 'inactive' });
      expect(input.removed).toHaveLength(9);
    });

    it('releases all source listeners before Session, bridge and surface even when removals fail', () => {
      const surface = new RecordingSurface(), input = new InputHost(surface.calls);
      const host = new TracingHost(surface.calls);
      failures.trace = surface.calls;
      const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError }, { source: createKeyboardSource(input) });
      owner.dispatch('start');
      input.failRemove.add(0); input.failRemove.add(8);
      surface.disposeFailure = new Error('surface removal');
      expect(() => owner.dispose()).toThrow(AggregateError);
      const cleanup = owner.cleanupFailure()?.cause;
      expect(cleanup).toBe(owner.store.getState().actionError?.cause);
      expect(cleanup).toBeInstanceOf(AggregateError);
      if (!(cleanup instanceof AggregateError)) throw new Error('Expected aggregate');
      expect(cleanup.errors).toHaveLength(2);
      expect(input.removed).toHaveLength(9);
      expect(surface.calls.indexOf('keyboard-8')).toBeLessThan(surface.calls.indexOf('session'));
      expect(surface.calls.slice(-4)).toEqual(['session', 'bridge', 'disconnect', 'dispose']);
      expect(host.listeners.size + host.pending.size).toBe(0);
      const state = owner.store.getState();
      expect(input.key('KeyN')).toBe(0);
      for (const signal of input.signals.values()) signal();
      expect(owner.store.getState()).toBe(state);
      expect(owner.keyboard.getSnapshot()).toEqual({ state: 'inactive' });
      owner.dispose();
      expect(input.removed).toHaveLength(9);
    });

    it('registration failure with successful rollback only disables keyboard, not the panel', () => {
      const host = new ControlledHost(), input = new InputHost();
      input.failAdd = 4;
      const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW, { source: createKeyboardSource(input) });
      expect(owner.keyboard.getSnapshot()).toEqual({ state: 'unavailable', error: input.cause });
      expect(input.removed).toEqual([0, 1, 2, 3]);
      expect(owner.cleanupFailure()).toBeNull();
      owner.dispatch('start');
      owner.dispatch('add-marker');
      host.deliver(0); host.deliver(20);
      expect(owner.store.getState().recentResults[0]?.outcome).toBe('accepted');
      owner.dispose();
    });

    it('failed keyboard rollback prevents start, keeps all causes and releases previously acquired surface/session', () => {
      const host = new ControlledHost(), surface = new RecordingSurface(), input = new InputHost();
      input.failAdd = 8;
      input.failRemove.add(0); input.failRemove.add(7);
      surface.disposeFailure = new Error('surface removal');
      const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError }, { source: createKeyboardSource(input) });
      expect(owner.store.getState().status).toBeNull();
      expect(owner.cleanupFailure()?.cause).toBeInstanceOf(RollbackError);
      expect(owner.store.getState().actionError?.operation).toBe('initialize');
      expect(input.removed).toHaveLength(8);
      expect(surface.calls.slice(-2)).toEqual(['disconnect', 'dispose']);
      expect(host.listeners.size + host.pending.size).toBe(0);
      const state = owner.store.getState();
      owner.dispatch('start');
      expect(input.key('KeyN')).toBe(0);
      expect(owner.store.getState()).toBe(state);
      expect(owner.keyboard.getSnapshot().state).toBe('unavailable');
    });

    it('does not acquire source listeners when earlier Session initialization fails', () => {
      const host = new ControlledHost(), surface = new RecordingSurface(), input = new InputHost();
      host.subscribeFailure = new Error('session registration');
      const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError }, { source: createKeyboardSource(input) });
      expect(input.registrations).toBe(0);
      expect(surface.calls).toEqual(['connect', 'disconnect', 'dispose']);
      expect(owner.keyboard.getSnapshot().state).toBe('unavailable');
      expect(owner.cleanupFailure()).toBeNull();
    });
  });

  it('keeps the session error when a restart cannot cancel a frame, whatever the store shows later', () => {
    const host = new ControlledHost();
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    owner.dispatch('start');
    const cause = new Error('cancel');
    host.cancelFailure = cause;
    owner.dispatch('restart');
    const status = owner.store.getState().status;
    expect(status).toMatchObject({ phase: 'faulted', cleanupFailed: true });
    const record = owner.cleanupFailure();
    expect(record?.cause).toBe(status?.error);
    expect(record?.cause).toMatchObject({ failures: [{ phase: 'scheduler', cause }] });
    expect(Object.isFrozen(record)).toBe(true);
    owner.dispatch('restart');
    expect(owner.store.getState().actionError?.operation).toBe('restart');
    host.cancelFailure = undefined;
    owner.dispose();
    expect(owner.cleanupFailure()).toBe(record);
  });

  it('keeps the session error when a run resource fails to clean up on restart', () => {
    const owner = createSyntheticDemoOwner(new ControlledHost(), new TestClock().read, NO_VIEW);
    owner.dispatch('start');
    const cause = new Error('resource');
    failures.bridge!.currentRun()!.run.ownCleanup(() => { throw cause; });
    owner.dispatch('restart');
    expect(owner.store.getState().status).toMatchObject({ phase: 'faulted', cleanupFailed: true });
    expect(owner.cleanupFailure()?.cause).toMatchObject({ failures: [{ phase: 'cleanup', cause }] });
    owner.dispose();
  });

  it('records a failed dispose as the error it throws, after attempting every cleanup, and keeps the first', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    owner.dispatch('start');
    host.cancelFailure = new Error('cancel');
    let thrown: unknown;
    try { owner.dispose(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect(owner.cleanupFailure()).toEqual({ cause: thrown });
    expect(owner.store.getState().actionError).toEqual({ operation: 'cleanup', cause: thrown });
    expect(host.listeners.size).toBe(0);
    expect(surface.calls.slice(-2)).toEqual(['disconnect', 'dispose']);
    owner.dispose();
    expect(owner.cleanupFailure()?.cause).toBe(thrown);

    const earlier = createSyntheticDemoOwner(new ControlledHost(), new TestClock().read, NO_VIEW);
    earlier.dispatch('start');
    failures.bridge!.currentRun()!.run.ownCleanup(() => { throw new Error('resource'); });
    earlier.dispatch('restart');
    const first = earlier.cleanupFailure();
    failures.unbind = new Error('unbind');
    expect(() => earlier.dispose()).toThrow(AggregateError);
    expect(earlier.cleanupFailure()).toBe(first);
  });

  it('records a failed initialization only when its rollback also failed', () => {
    failures.bind = new Error('bind');
    const rolledBack = createSyntheticDemoOwner(new ControlledHost(), new TestClock().read, NO_VIEW);
    expect(rolledBack.store.getState().actionError?.operation).toBe('initialize');
    expect(rolledBack.cleanupFailure()).toBeNull();
    failures.bind = undefined;

    const host = new FailingCancelHost();
    failures.afterBind = new Error('after bind');
    host.lifecycleCancelFailure = new Error('lifecycle cancel');
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    const cause = owner.store.getState().actionError?.cause;
    expect(cause).toBeInstanceOf(RollbackError);
    expect((cause as RollbackError).cause).toBe(failures.afterBind);
    expect(owner.cleanupFailure()).toEqual({ cause });
  });

  it('creates no session beside a surface it could not release', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    surface.connectFailure = new Error('connect');
    surface.disposeFailure = new Error('dispose');
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { surface, reportError });
    const cause = owner.store.getState().actionError?.cause;
    expect(owner.store.getState()).toMatchObject({ status: null, actionError: { operation: 'initialize' } });
    expect(cause).toBeInstanceOf(RollbackError);
    expect((cause as RollbackError).errors).toEqual([surface.connectFailure, surface.disposeFailure]);
    expect(owner.cleanupFailure()).toEqual({ cause });
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    owner.dispatch('start');
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    expect(() => owner.dispose()).not.toThrow();
  });

  it('records a run consumer whose own cancellation failed, though the session saw no cleanup failure', () => {
    failures.consumerAttach = new Error('attach');
    failures.consumerRollback = new Error('rollback');
    failures.consumerOwnsDirectly = true;
    const owner = createSyntheticDemoOwner(new ControlledHost(), new TestClock().read, NO_VIEW);
    owner.dispatch('start');
    expect(owner.store.getState().status).toMatchObject({ phase: 'faulted', cleanupFailed: false });
    const [consumer] = (owner.cleanupFailure()?.cause as GameSessionError).failures!;
    expect(consumer.cause).toMatchObject({ cause: failures.consumerAttach, errors: [failures.consumerAttach, failures.consumerRollback] });
    expect(consumer.cause).toBeInstanceOf(RollbackError);
    owner.dispose();
  });

  it('creates no session beside a surface its factory could not release', () => {
    const host = new ControlledHost();
    const unreleased = new RollbackError(new Error('no WebGL 2'), [new Error('canvas removal')], 'surface');
    const owner = createSyntheticDemoOwner(host, new TestClock().read, { unavailable: unreleased, reportError });
    expect(owner.store.getState()).toMatchObject({ status: null, actionError: { operation: 'initialize', cause: unreleased } });
    expect(owner.cleanupFailure()).toEqual({ cause: unreleased });
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
  });

  it('records a run consumer whose attachment rollback failed, with the cleanup cause', () => {
    const host = new ControlledHost();
    failures.consumerAttach = new Error('attach');
    failures.consumerRollback = new Error('rollback');
    const owner = createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW);
    owner.dispatch('start');
    expect(owner.store.getState()).toMatchObject({ status: { phase: 'faulted', cleanupFailed: true }, actionError: { operation: 'start' } });
    const error = owner.cleanupFailure()?.cause as GameSessionError;
    const [consumer] = error.failures!;
    expect(consumer.phase).toBe('consumer');
    expect(consumer.cause).toBeInstanceOf(RollbackError);
    const rollback = consumer.cause as RollbackError;
    expect(rollback.cause).toBe(failures.consumerAttach);
    expect(rollback.errors.slice(1)).toEqual([expect.objectContaining({ failures: [{ phase: 'cleanup', cause: failures.consumerRollback }] })]);
    owner.dispose();
    expect(host.listeners.size).toBe(0);
  });
});
