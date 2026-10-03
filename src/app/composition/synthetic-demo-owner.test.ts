import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSessionError } from '../session/session-errors.ts';
import { ControlledHost } from '../session/synthetic-session.test-support.ts';
import type * as BridgeModule from '../../ui/game/synthetic-session-bridge.ts';
import type { SessionCleanup } from '../session/session-host.ts';
import type { SyntheticSession } from '../session/synthetic-session.ts';
import { TestClock } from '../../ui/game/synthetic-ui.test-support.ts';
import { createSyntheticDemoOwner } from './synthetic-demo-owner.ts';

const failures = vi.hoisted(() => ({ bind: undefined as unknown, afterBind: undefined as unknown, unbind: undefined as unknown }));
vi.mock('../../ui/game/synthetic-session-bridge.ts', async importOriginal => {
  const original = await importOriginal<typeof BridgeModule>();
  return {
    ...original,
    createSyntheticSessionBridge(...args: Parameters<typeof original.createSyntheticSessionBridge>) {
      const bridge = original.createSyntheticSessionBridge(...args);
      return Object.freeze({
        onError: bridge.onError,
        bind(session: SyntheticSession) {
          if (failures.bind !== undefined) throw failures.bind;
          bridge.bind(session);
          if (failures.afterBind !== undefined) throw failures.afterBind;
        },
        unbind: () => {
          bridge.unbind();
          if (failures.unbind !== undefined) throw failures.unbind;
        },
        currentRun: () => bridge.currentRun(),
      });
    },
  };
});
afterEach(() => { failures.bind = undefined; failures.afterBind = undefined; failures.unbind = undefined; });

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

function counts(host: ControlledHost) {
  return { requests: host.pending.size, listeners: host.listeners.size };
}

describe('synthetic demo owner', () => {
  it('creates an idle owner without a frame request and starts only on dispatch', () => {
    const host = new ControlledHost();
    const owner = createSyntheticDemoOwner(host, new TestClock().read);
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
    const owner = createSyntheticDemoOwner(host, new TestClock().read);
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
    const owner = createSyntheticDemoOwner(host, new TestClock().read);
    expect(owner.store.getState()).toMatchObject({ status: null, actionError: { operation: 'initialize', cause } });
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    expect(host.unsubscribed).toBe(1);
  });

  it('unbinds a bound bridge and clears its status when a later wiring step fails', () => {
    const host = new ControlledHost();
    const cause = new Error('after bind');
    failures.afterBind = cause;
    const owner = createSyntheticDemoOwner(host, new TestClock().read);
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
    const owner = createSyntheticDemoOwner(host, new TestClock().read);
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
    const owner = createSyntheticDemoOwner(host, new TestClock().read);
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
    const owner = createSyntheticDemoOwner(host, new TestClock().read);
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
    const first = createSyntheticDemoOwner(host, new TestClock().read);
    expect(counts(host)).toEqual({ requests: 0, listeners: 1 });
    const [staleLifecycle] = host.listeners;
    first.dispatch('start');
    const [staleFrame] = host.pending.values();
    first.dispose();
    expect(counts(host)).toEqual({ requests: 0, listeners: 0 });
    const secondClock = new TestClock();
    const second = createSyntheticDemoOwner(host, secondClock.read);
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
