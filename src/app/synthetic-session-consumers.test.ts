import { describe, expect, it } from 'vitest';
import type { GameSessionError } from './session-errors.ts';
import { createSyntheticSession, type SessionCommandsCancelled, type SessionFrame, type SessionRun } from './synthetic-session.ts';
import { ControlledHost } from './synthetic-session.test-support.ts';

function setup() {
  const host = new ControlledHost(), errors: GameSessionError[] = [];
  const session = createSyntheticSession({ scene: { seed: 0, tickRateHz: 50 } }, host, error => { errors.push(error); });
  session.control({ type: 'start' });
  const run = session.currentRun();
  if (!run) throw new Error('Expected run');
  return { host, session, run, errors };
}

describe('session consumer boundaries', () => {
  it.each(['restart', 'exit'] as const)('completes the old domain/frame batch before %s', type => {
    const { host, session, run } = setup(), log: string[] = [];
    run.onAny((event, delivery) => {
      log.push(`first:${event.type}:${run.runId}:${delivery.commandId}`);
      if (delivery.commandId === 1) session.control({ type });
      expect(session.currentRun()).toBe(run);
    });
    run.onAny(event => { log.push(`second:${event.type}:${run.uiProjection().tick}`); });
    run.onFrame(frame => { log.push(`frame:${frame.runId}:${frame.projection.tick}`); });
    run.ownCleanup(() => { log.push('cleanup'); });
    session.onStatus(status => { log.push(`status:${status.phase}`); });
    run.submitCommand({ type: 'add-marker' }); run.submitCommand({ type: 'add-marker' }); run.submitCommand({ type: 'remove-marker' });
    host.deliver(0); log.length = 0; host.deliver(60);
    expect(log).toEqual([
      'first:marker-added:1:1', 'second:marker-added:3',
      'first:command-rejected:1:2', 'second:command-rejected:3',
      'first:marker-removed:1:3', 'second:marker-removed:3',
      'frame:1:3', 'cleanup', `status:${type === 'restart' ? 'running' : 'idle'}`,
    ]);
    expect(host.pending.size).toBe(type === 'restart' ? 1 : 0);
    if (type === 'restart') expect(session.currentRun()?.uiProjection().tick).toBe(0);
  });

  it('queues pause/resume and a static-frame control without recursive world changes', () => {
    const { host, session, run } = setup(), log: string[] = [];
    run.onFrame(frame => {
      log.push(frame.phase);
      if (frame.phase === 'running') { session.control({ type: 'pause' }); session.control({ type: 'resume' }); }
      else {
        session.control({ type: 'start' });
        expect(session.status().phase).toBe('paused');
      }
    });
    host.deliver(0);
    expect(log).toEqual(['running', 'paused']);
    expect(session.status().phase).toBe('running'); expect(host.pending.size).toBe(1);
    const off = run.onFrame(frame => { if (frame.phase === 'paused') session.control({ type: 'exit' }); });
    session.control({ type: 'pause' });
    expect(session.status().phase).toBe('idle'); expect(host.pending.size).toBe(0); off(); off();
  });

  it('defers host notifications until the domain and frame batch completes', () => {
    const { host, session, run } = setup(), log: string[] = [];
    run.onAny(() => {
      host.emit({ type: 'pagehide' }); log.push(session.status().phase);
    });
    run.onFrame(frame => { log.push(`${frame.phase}:${frame.projection.tick}`); });
    run.submitCommand({ type: 'add-marker' }); host.deliver(0); log.length = 0; host.deliver(20);
    expect(log).toEqual(['running', 'running:1', 'paused:1']);
    expect(session.status().environmentVisible).toBe(false); expect(host.pending.size).toBe(0);
  });

  it('reports illegal queued control once, then continues FIFO without faulting', () => {
    const { host, session, run, errors } = setup();
    run.onFrame(() => {
      session.control({ type: 'exit' }); session.control({ type: 'pause' }); session.control({ type: 'start' });
    });
    host.deliver(0);
    expect(session.status()).toMatchObject({ phase: 'running', runId: 2 });
    expect(host.pending.size).toBe(1); expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([{ phase: 'control', cause: expect.objectContaining({ kind: 'invalid-state', operation: 'pause', phase: 'idle' }) }]);
  });

  it('reports queued errors from a synchronous pause via onError, not to its caller', () => {
    const { session, run, errors } = setup();
    run.onFrame(frame => {
      if (frame.phase === 'paused') { session.control({ type: 'exit' }); session.control({ type: 'pause' }); }
    });
    expect(() => session.control({ type: 'pause' })).not.toThrow();
    expect(errors).toHaveLength(1); expect(session.status().phase).toBe('idle');
  });

  it('freezes frame views and defers additions while honoring cancellation immediately', () => {
    const { host, session, run } = setup(), log: string[] = [], frames: SessionFrame[] = [];
    let added = false;
    run.onFrame(frame => {
      frames.push(frame); log.push('A');
      if (!added) { added = true; run.onFrame(() => { log.push('C'); }); offB(); }
    });
    const offB = run.onFrame(() => { log.push('B'); });
    host.deliver(0); expect(log).toEqual(['A']);
    host.deliver(20); expect(log).toEqual(['A', 'A', 'C']);
    session.control({ type: 'pause' }); expect(log).toEqual(['A', 'A', 'C', 'A', 'C']);
    expect(frames[0]).toMatchObject({ report: { ticks: 0, capped: false }, projection: { tick: 0 } });
    expect(frames.at(-1)).toMatchObject({ report: null, phase: 'paused', render: { previous: { tick: 1 }, current: { tick: 1 }, alpha: 0 } });
    expect(frames.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(frames[0].projection.mover.position)).toBe(true);
  });

  it('permits new run wiring from status but forbids notification control recursion', () => {
    const { session, run } = setup();
    const log: number[] = [];
    const off = session.onStatus(status => {
      expect(() => session.control({ type: 'exit' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
      if (status.phase === 'running') {
        const current = session.currentRun();
        if (!current) throw new Error('Expected run');
        current.onFrame(() => undefined); current.ownCleanup(() => { log.push(current.runId); });
      }
    });
    session.control({ type: 'restart' });
    expect(() => run.ownCleanup(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    session.control({ type: 'dispose' }); expect(log).toEqual([2]); off(); off();
    expect(session.status()).toMatchObject({ phase: 'disposed', runId: null });
  });

  it('finishes all frame consumers before failure cancellation, cleanup, status and onError', () => {
    const host = new ControlledHost(), log: string[] = [], cause = new Error('consumer');
    const session = createSyntheticSession({ scene: { seed: 0, tickRateHz: 50 } }, host, () => { log.push('error'); });
    session.control({ type: 'start' }); const run = session.currentRun();
    if (!run) throw new Error('Expected run');
    run.onFrame(() => { run.submitCommand({ type: 'add-marker' }); log.push('first'); throw cause; });
    run.onFrame(() => { log.push('second'); });
    run.onCommandsCancelled(notice => { log.push(`cancel:${notice.reason}:${notice.commandIds.join(',')}`); });
    run.ownCleanup(() => { log.push('cleanup'); });
    session.onStatus(status => { log.push(`status:${status.phase}`); });
    host.deliver(0);
    expect(log).toEqual(['first', 'second', 'cancel:failure:1', 'cleanup', 'status:faulted', 'error']);
    expect(host.pending.size).toBe(0); expect(session.status().error?.failures).toEqual([{ phase: 'consumer', cause }]);
    expect(() => run.onAny(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('defers status additions and applies status cancellation immediately', () => {
    const { session } = setup(), log: string[] = [];
    let added = false;
    session.onStatus(() => {
      log.push('A');
      if (!added) { added = true; session.onStatus(() => { log.push('C'); }); offB(); }
    });
    const offB = session.onStatus(() => { log.push('B'); });
    expect(log).toEqual([]);
    session.control({ type: 'pause' }); expect(log).toEqual(['A']);
    session.control({ type: 'resume' }); expect(log).toEqual(['A', 'A', 'C']);
  });

  it('rejects shape errors at submission and forbids cleanup registration/control', () => {
    const { host, session, run, errors } = setup();
    run.onFrame(() => {
      expect(() => session.control({ type: 'resume', extra: 1 } as never)).toThrowError(expect.objectContaining({ kind: 'invalid-argument' }));
    });
    const release = run.ownCleanup(() => {
      expect(() => session.control({ type: 'exit' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
      expect(() => run.ownCleanup(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    });
    host.deliver(0); release(); expect(errors).toEqual([]); expect(session.status().phase).toBe('running');
  });
});

describe('intent cancellation and owned resources', () => {
  it.each(['user-pause', 'hidden', 'restart', 'exit', 'dispose'] as const)('cancels FIFO once with reason %s and no empty callbacks', reason => {
    const { host, session, run } = setup(), notices: SessionCommandsCancelled[] = [];
    run.onCommandsCancelled(notice => {
      notices.push(notice);
      expect(() => session.control({ type: 'resume' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
      expect(() => run.onFrame(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    });
    run.submitCommand({ type: 'remove-marker' }); host.deliver(0); host.deliver(20);
    run.setInput({ moveX: 1 }); expect(run.submitCommand({ type: 'add-marker' })).toBe(2); expect(run.submitCommand({ type: 'remove-marker' })).toBe(3);
    if (reason === 'hidden') host.emit({ type: 'visibility', visibility: 'hidden' });
    else session.control({ type: reason === 'user-pause' ? 'pause' : reason });
    expect(notices).toEqual([{ runId: 1, commandIds: [2, 3], reason }]);
    expect(Object.isFrozen(notices[0])).toBe(true); expect(Object.isFrozen(notices[0].commandIds)).toBe(true);
    if (reason === 'hidden' || reason === 'user-pause') {
      session.control({ type: 'pause' }); session.control({ type: 'exit' });
      expect(notices).toHaveLength(1);
    }
  });

  it('notifies cancellation, static view and status in order', () => {
    const { session, run } = setup(), log: string[] = [];
    run.onCommandsCancelled(() => { log.push('cancel'); });
    run.onFrame(() => { log.push('still'); });
    session.onStatus(() => { log.push('status'); });
    run.ownCleanup(() => { log.push('cleanup'); });
    run.submitCommand({ type: 'add-marker' });
    session.control({ type: 'pause' }); expect(log).toEqual(['cancel', 'still', 'status']);
    session.control({ type: 'exit' }); expect(log).toEqual(['cancel', 'still', 'status', 'cleanup', 'status']);
  });

  it('releases immediately, tears down remaining resources in reverse order, and never repeats', () => {
    const { session, run, host } = setup(), log: string[] = [];
    const a = run.ownCleanup(() => { log.push('A'); });
    const b = run.ownCleanup(() => { log.push('B'); });
    const c = run.ownCleanup(() => { log.push('C'); });
    b(); b(); expect(log).toEqual(['B']);
    session.control({ type: 'restart' }); expect(log).toEqual(['B', 'C', 'A']);
    a(); c(); expect(log).toEqual(['B', 'C', 'A']);
    let events = 0; session.currentRun()?.onAny(() => { events++; });
    session.control({ type: 'dispose' }); session.control({ type: 'dispose' });
    expect(host.listeners.size).toBe(0); expect(host.pending.size).toBe(0); expect(events).toBe(0);
  });

  it('attempts C/B/A despite cleanup failure and prevents restart from hiding it', () => {
    const { session, run, host } = setup(), log: string[] = [], cause = new Error('C');
    run.ownCleanup(() => { log.push('A'); });
    run.ownCleanup(() => { log.push('B'); });
    run.ownCleanup(() => { log.push('C'); throw cause; });
    expect(() => session.control({ type: 'restart' })).toThrowError(expect.objectContaining({ failures: [{ phase: 'cleanup', cause }] }));
    expect(log).toEqual(['C', 'B', 'A']);
    expect(session.status()).toMatchObject({ phase: 'faulted', runId: 1, cleanupFailed: true });
    expect(run.uiProjection().tick).toBe(0); expect(host.pending.size).toBe(0);
    expect(() => session.control({ type: 'restart' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    session.control({ type: 'exit' });
    expect(() => session.control({ type: 'start' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    session.control({ type: 'dispose' }); expect(log).toEqual(['C', 'B', 'A']);
  });

  it('makes failed release observable without itself faulting the run', () => {
    const { session, run, host } = setup(), cause = new Error('release');
    let calls = 0;
    const release = run.ownCleanup(() => { calls++; throw cause; });
    expect(() => release()).toThrowError(expect.objectContaining({ kind: 'operation-failed', failures: [{ phase: 'cleanup', cause }] }));
    expect(session.status()).toMatchObject({ phase: 'running', cleanupFailed: true }); expect(host.pending.size).toBe(1);
    expect(() => session.control({ type: 'restart' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    release(); session.control({ type: 'exit' }); expect(calls).toBe(1);
  });

  it('keeps cleanupFailed after a later control error replaces error', () => {
    const { session, run, host, errors } = setup(), cause = new Error('cleanup');
    const release = run.ownCleanup(() => { throw cause; });
    expect(() => release()).toThrow();
    run.onFrame(() => { session.control({ type: 'restart' }); });
    host.deliver(0);
    expect(errors[0].failures?.[0].phase).toBe('control');
    expect(session.status()).toMatchObject({ phase: 'running', cleanupFailed: true });
    expect(() => session.control({ type: 'restart' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('preserves synchronous release feedback inside a consumer without duplicate onError', () => {
    const { session, run, host, errors } = setup(), cleanupCause = new Error('release'), consumerCause = new Error('consumer');
    const release = run.ownCleanup(() => { throw cleanupCause; });
    let released = false;
    run.onFrame(() => {
      if (!released) {
        released = true;
        expect(() => release()).toThrowError(expect.objectContaining({ failures: [{ phase: 'cleanup', cause: cleanupCause }] }));
      }
    });
    host.deliver(0);
    expect(errors).toEqual([]); expect(session.status()).toMatchObject({ phase: 'running', cleanupFailed: true });
    run.onFrame(() => { throw consumerCause; }); host.deliver(20);
    expect(errors).toHaveLength(1);
    expect(session.status().error?.failures).toEqual([{ phase: 'consumer', cause: consumerCause }]);
    expect(session.status().cleanupFailed).toBe(true); release();
  });

  it('keeps a direct pause consumer failure separate from queued control failures', () => {
    const { session, run, errors } = setup(), cause = new Error('static consumer');
    run.onFrame(() => { throw cause; });
    run.onFrame(() => { session.control({ type: 'exit' }); session.control({ type: 'pause' }); });
    expect(() => session.control({ type: 'pause' })).toThrowError(expect.objectContaining({ failures: [{ phase: 'consumer', cause }] }));
    expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([{ phase: 'control', cause: expect.objectContaining({ operation: 'pause', phase: 'idle' }) }]);
    expect(session.status().phase).toBe('idle');
  });
});

function checkTypes(run: SessionRun) {
  // @ts-expect-error Cleanup must be synchronous.
  run.ownCleanup(async () => undefined);
  // @ts-expect-error Cancellation feedback must be synchronous.
  run.onCommandsCancelled(() => Promise.resolve(undefined));
}
void checkTypes;
