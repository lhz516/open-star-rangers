import { describe, expect, it, vi } from 'vitest';
import { ControlledHost } from '../session/synthetic-session.test-support.ts';
import { TestClock } from '../../ui/game/synthetic-ui.test-support.ts';
import { RecordingSurface } from '../../render/scene/render-surface.test-support.ts';
import type { SyntheticRendererOptions } from '../../render/synthetic/synthetic-renderer.ts';
import type { SyntheticPanelAction } from '../../ui/game/synthetic-game-controls.ts';
import { RollbackError } from '../session/rollback-error.ts';
import { createSyntheticDemoLifecycle } from './synthetic-demo-lifecycle.ts';
import { createSyntheticDemoOwner, type SyntheticDemoOwner } from './synthetic-demo-owner.ts';

const NO_VIEW: SyntheticRendererOptions = Object.freeze({
  unavailable: new Error('no view in this test'), reportError: (error: unknown) => { throw error; },
});

/** A lifecycle whose outlets are recorded, and a factory that counts real owners and their starts. */
function setup(host = new ControlledHost(), render: () => SyntheticRendererOptions = () => NO_VIEW) {
  const delivered: unknown[] = [], reported: unknown[] = [], trace: string[] = [];
  const lifecycle = createSyntheticDemoLifecycle({
    onCleanupFailure: cause => { trace.push('failure'); delivered.push(cause); },
    reportError: error => { reported.push(error); },
  });
  const owners: SyntheticDemoOwner[] = [];
  const starts: SyntheticDemoOwner[] = [];
  const create = vi.fn((): SyntheticDemoOwner => {
    trace.push('create');
    const owner = createSyntheticDemoOwner(host, new TestClock().read, render());
    const counted: SyntheticDemoOwner = Object.freeze({
      ...owner,
      dispatch: (action: SyntheticPanelAction) => {
        if (action === 'start') starts.push(counted);
        owner.dispatch(action);
      },
      dispose: () => {
        trace.push('dispose');
        owner.dispose();
      },
    });
    owners.push(counted);
    return counted;
  });
  return { host, lifecycle, create, owners, starts, delivered, reported, trace };
}

const phase = (owner: SyntheticDemoOwner | null) => owner?.store.getState().status?.phase;

describe('synthetic demo lifecycle keyboard cleanup latch', () => {
  it('does not start beside a failed input rollback and blocks the next owner', () => {
    const host = new ControlledHost(), surface = new RecordingSurface();
    const delivered: unknown[] = [];
    const lifecycle = createSyntheticDemoLifecycle({
      onCleanupFailure: cause => { delivered.push(cause); }, reportError: cause => { throw cause; },
    });
    const failure = new RollbackError(new Error('input registration'), [new Error('input removal')], 'input rollback');
    const create = vi.fn(() => createSyntheticDemoOwner(
      host, new TestClock().read, { surface, reportError: cause => { throw cause; } }, { unavailable: failure },
    ));
    const visit = lifecycle.visit();
    const owner = visit.open(create)!;
    expect(owner.store.getState().status).toBeNull();
    expect(delivered).toEqual([failure]);
    expect(host.pending.size + host.listeners.size).toBe(0);
    expect(surface.calls.slice(-2)).toEqual(['disconnect', 'dispose']);
    visit.close();
    expect(lifecycle.visit().open(create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('latches input disposal failure before a new visit can acquire resources', () => {
    const host = new ControlledHost();
    const delivered: unknown[] = [], reported: unknown[] = [];
    const failure = new Error('input removal');
    const lifecycle = createSyntheticDemoLifecycle({
      onCleanupFailure: cause => { delivered.push(cause); }, reportError: cause => { reported.push(cause); },
    });
    const create = vi.fn(() => createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW, {
      source: { connect: () => () => { throw failure; } },
    }));
    const owner = lifecycle.visit().open(create)!;
    expect(owner.store.getState().status?.phase).toBe('running');
    expect(lifecycle.visit().open(create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    expect(host.pending.size + host.listeners.size).toBe(0);
    expect(delivered).toHaveLength(1);
    expect(delivered).toEqual(reported);
    expect(lifecycle.cleanupFailure()).toBe(owner.cleanupFailure());
  });
});

describe('synthetic demo lifecycle: one start per owner', () => {
  it('starts the owner it opens once; reopening the visit and Exit start nothing', () => {
    const { host, lifecycle, create, starts } = setup();
    const visit = lifecycle.visit();
    const owner = visit.open(create);
    expect(starts).toEqual([owner]);
    expect(owner?.store.getState().status).toMatchObject({ phase: 'running', runId: 1 });
    expect(host.pending.size).toBe(1);
    expect(visit.open(create)).toBeNull();
    owner!.dispatch('exit');
    expect(visit.open(create)).toBeNull();
    expect(phase(owner)).toBe('idle');
    expect(starts).toEqual([owner]);
    expect(create).toHaveBeenCalledTimes(1);
    visit.close();
  });

  it('does not retry a start that failed', () => {
    const { host, lifecycle, create, starts } = setup();
    host.requestFailure = new Error('no frame');
    const visit = lifecycle.visit();
    const owner = visit.open(create);
    expect(owner?.store.getState()).toMatchObject({ status: { phase: 'faulted' }, actionError: { operation: 'start' } });
    host.requestFailure = undefined;
    expect(visit.open(create)).toBeNull();
    expect(starts).toHaveLength(1);
    expect(phase(owner)).toBe('faulted');
    expect(lifecycle.cleanupFailure()).toBeNull();
    visit.close();
  });

  it('starts a hidden page once into paused/hidden without a frame request, and only Resume schedules', () => {
    const { host, lifecycle, create, starts } = setup();
    host.visibility = 'hidden';
    const visit = lifecycle.visit();
    const owner = visit.open(create)!;
    expect(owner.store.getState().status).toMatchObject({ phase: 'paused', pauseReason: 'hidden', runId: 1 });
    expect(host.pending.size).toBe(0);
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(owner.store.getState().status).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: true });
    expect(host.pending.size).toBe(0);
    owner.dispatch('resume');
    expect(phase(owner)).toBe('running');
    expect(host.pending.size).toBe(1);
    expect(starts).toHaveLength(1);
    visit.close();
  });

  it('never starts a closed or replaced owner, and a failed initialization ignores its start', () => {
    const { host, lifecycle, create, starts } = setup();
    const closed = lifecycle.visit();
    const first = closed.open(create);
    closed.close();
    expect(closed.open(create)).toBeNull();
    const replaced = lifecycle.visit();
    const second = replaced.open(create);
    const next = lifecycle.visit();
    const live = next.open(create);
    expect(replaced.open(create)).toBeNull();
    expect(starts).toEqual([first, second, live]);
    expect([phase(first), phase(second), phase(live)]).toEqual(['disposed', 'disposed', 'running']);
    next.close();
    host.subscribeFailure = new Error('subscribe');
    const failed = lifecycle.visit();
    const owner = failed.open(create)!;
    expect(owner.store.getState()).toMatchObject({ status: null, actionError: { operation: 'initialize' } });
    expect(host.listeners.size + host.pending.size).toBe(0);
    expect(lifecycle.cleanupFailure()).toBeNull();
    failed.close();
  });
});

describe('synthetic demo lifecycle: release before create', () => {
  it('creates nothing for a visit closed before it opened', () => {
    const { lifecycle, create } = setup();
    const visit = lifecycle.visit();
    visit.close();
    expect(visit.open(create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('fully releases an owner closed right after it opened, once', () => {
    const { host, lifecycle, create, trace } = setup();
    const visit = lifecycle.visit();
    visit.open(create);
    visit.close(); visit.close();
    expect(trace).toEqual(['create', 'dispose']);
    expect(host.pending.size).toBe(0);
    expect(host.listeners.size).toBe(0);
    expect(host.unsubscribed).toBe(1);
  });

  it('releases the live owner on request, before its view unmounts, and only once', () => {
    const { host, lifecycle, create, trace, delivered } = setup();
    const visit = lifecycle.visit();
    visit.open(create);
    host.cancelFailure = new Error('cancel');
    lifecycle.release();
    expect(trace).toEqual(['create', 'dispose', 'failure']);
    expect(lifecycle.cleanupFailure()).toEqual({ cause: delivered[0] });
    visit.close();
    lifecycle.release();
    expect(trace).toEqual(['create', 'dispose', 'failure']);
    expect(host.listeners.size).toBe(0);
  });

  it('releases the live owner before creating its replacement, and opens a visit only once', () => {
    const { host, lifecycle, create, trace, owners } = setup();
    const first = lifecycle.visit();
    first.open(create);
    const second = lifecycle.visit();
    second.open(create);
    expect(trace).toEqual(['create', 'dispose', 'create']);
    expect(second.open(create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
    expect(phase(owners[0])).toBe('disposed');
    expect(owners[1].store.getState().status).toMatchObject({ phase: 'running', runId: 1 });
    expect(host.pending.size).toBe(1);
    expect(host.listeners.size).toBe(1);
    second.close();
  });

  it.each(['render failure', 'session fault'] as const)('re-enters after a %s with a new owner on run 1, unaffected by old callbacks', kind => {
    const surface = new RecordingSurface();
    const { host, lifecycle, create, owners } = setup(new ControlledHost(), () => ({ surface: kind === 'render failure' ? surface : new RecordingSurface(), reportError: () => {} }));
    const first = lifecycle.visit();
    const old = first.open(create)!;
    surface.resize();
    const [staleFrame] = host.pending.values();
    if (kind === 'render failure') {
      surface.drawFailure = new Error('draw');
      host.deliver(0);
      expect(old.renderer.getSnapshot().state).toBe('failed');
    } else {
      host.deliver(Number.NaN);
      expect(phase(old)).toBe('faulted');
    }
    first.close();
    expect(lifecycle.cleanupFailure()).toBeNull();
    const second = lifecycle.visit();
    const fresh = second.open(create)!;
    expect(fresh).not.toBe(old);
    expect(fresh.store.getState().status).toMatchObject({ phase: 'running', runId: 1 });
    const before = fresh.store.getState();
    staleFrame(100);
    expect(fresh.store.getState()).toBe(before);
    expect(owners).toHaveLength(2);
    second.close();
  });
});

describe('synthetic demo lifecycle: cleanup failure latch', () => {
  it('delivers a failed release before anything else and creates no owner afterwards', () => {
    const { host, lifecycle, create, delivered, reported, trace } = setup();
    const visit = lifecycle.visit();
    const owner = visit.open(create)!;
    host.cancelFailure = new Error('cancel');
    visit.close();
    const cause = owner.cleanupFailure()?.cause;
    expect(cause).toBeInstanceOf(AggregateError);
    expect(delivered).toEqual([cause]);
    expect(reported).toEqual([cause]);
    expect(lifecycle.cleanupFailure()).toEqual({ cause });
    expect(trace).toEqual(['create', 'dispose', 'failure']);
    // StrictMode setup again, a replaced container and a Fast Refresh all open new visits.
    for (let attempt = 0; attempt < 3; attempt++) {
      const next = lifecycle.visit();
      expect(next.open(create)).toBeNull();
      next.close();
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveLength(1);
  });

  it('latches when a live owner fails to release while being replaced, and does not create the replacement', () => {
    const { host, lifecycle, create, delivered } = setup();
    const first = lifecycle.visit();
    first.open(create);
    host.cancelFailure = new Error('cancel');
    const second = lifecycle.visit();
    expect(second.open(create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveLength(1);
  });

  it.each([false, true])('delivers an earlier session cleanup failure on release (dispose also fails: %s), reporting only the dispose error', disposeFails => {
    const surface = new RecordingSurface();
    const { host, lifecycle, create, delivered, reported } = setup(new ControlledHost(), () => ({ surface, reportError: () => {} }));
    const visit = lifecycle.visit();
    const owner = visit.open(create)!;
    host.cancelFailure = new Error('cancel');
    owner.dispatch('restart');
    expect(owner.store.getState().status).toMatchObject({ cleanupFailed: true });
    const first = owner.cleanupFailure()?.cause;
    if (disposeFails) surface.disposeFailure = new Error('surface dispose');
    visit.close();
    expect(delivered).toEqual([first]);
    expect(lifecycle.cleanupFailure()?.cause).toBe(first);
    if (!disposeFails) {
      expect(reported).toEqual([]);
      return;
    }
    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(AggregateError);
    expect(reported[0]).not.toBe(first);
  });

  it('delivers an initialization whose rollback failed when it opens, so it never starts', () => {
    const surface = new RecordingSurface();
    surface.connectFailure = new Error('connect');
    surface.disposeFailure = new Error('dispose');
    const { host, lifecycle, create, starts, delivered } = setup(new ControlledHost(), () => ({ surface, reportError: () => {} }));
    const visit = lifecycle.visit();
    const owner = visit.open(create)!;
    expect(delivered).toEqual([owner.cleanupFailure()?.cause]);
    expect(starts).toEqual([]);
    expect(host.listeners.size).toBe(0);
    visit.close();
    expect(lifecycle.visit().open(create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('delivers a surface its factory could not release when the visit opens, creating no session', () => {
    const unreleased = new RollbackError(new Error('no WebGL 2'), [new Error('canvas removal')], 'surface');
    const { host, lifecycle, create, starts, delivered } = setup(new ControlledHost(), () => ({ unavailable: unreleased, reportError: () => {} }));
    const visit = lifecycle.visit();
    visit.open(create);
    expect(delivered).toEqual([unreleased]);
    visit.close();
    expect(starts).toEqual([]);
    expect(host.listeners.size + host.pending.size).toBe(0);
    expect(lifecycle.visit().open(create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps the latch when the error outlets themselves throw', () => {
    const host = new ControlledHost();
    const lifecycle = createSyntheticDemoLifecycle({
      onCleanupFailure: () => { throw new Error('flow outlet'); },
      reportError: () => { throw new Error('report outlet'); },
    });
    const create = vi.fn(() => createSyntheticDemoOwner(host, new TestClock().read, NO_VIEW));
    const visit = lifecycle.visit();
    visit.open(create);
    host.cancelFailure = new Error('cancel');
    expect(() => visit.close()).not.toThrow();
    expect(lifecycle.cleanupFailure()).not.toBeNull();
    expect(lifecycle.visit().open(create)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
