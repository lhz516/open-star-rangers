import { describe, expect, it } from 'vitest';
import { GameRuntimeError } from '../runtime/runtime-errors.ts';
import { NEUTRAL_AXES, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { createGameSession, type GameCommandsCancelled, type GameSessionFrame, type GameSessionRun } from './game-session.ts';
import { current, departure, runSpec, sessionSetup, started } from './game-session.test-support.ts';
import { ControlledHost } from './session-host.test-support.ts';

const tickOf = (run: GameSessionRun) => run.projection().clock.tick;
const LAUNCH = { type: 'launch' } as const;

describe('session notification boundary', () => {
  it('completes the old domain and frame batch before a requested exit', () => {
    const { host, session, run } = started(), log: string[] = [];
    run.on('command-result', (_event, { commandId }) => {
      log.push(`first:${commandId}`);
      if (commandId === 1) session.control({ type: 'exit' });
      expect(session.currentRun()).toBe(run);
    });
    run.on('command-result', () => { log.push(`second:${tickOf(run)}`); });
    run.onFrame((frame) => { log.push(`frame:${frame.runId}:${frame.projection.clock.tick}`); });
    run.ownCleanup(() => { log.push('cleanup'); });
    session.onStatus((status) => { log.push(`status:${status.phase}`); });
    host.deliver(0); log.length = 0;
    for (let index = 0; index < 3; index++) run.submitCommand(LAUNCH);
    host.deliver(3 * TICK_MS);
    expect(log).toEqual(['first:1', 'second:3', 'first:2', 'second:3', 'first:3', 'second:3', 'frame:1:3', 'cleanup', 'status:idle']);
    expect(host.pending.size).toBe(0); expect(session.currentRun()).toBeNull();
  });

  it('applies an exit and a new start queued in a frame after the batch, from a fresh request', () => {
    const { host, session, run } = started(), log: string[] = [];
    run.onFrame(() => {
      session.control({ type: 'exit' });
      session.control({ type: 'start', spec: runSpec({ initialTransition: departure() }) });
      log.push(`frame:${session.status().phase}`);
    });
    session.onStatus((status) => { log.push(`status:${status.phase}:${status.runId}`); });
    host.deliver(0);
    expect(log).toEqual(['frame:running', 'status:idle:null', 'status:transition:2']);
    expect(host.pending.size).toBe(0);
    session.control({ type: 'complete-departure', runId: 2 });
    expect(host.pending.size).toBe(1); expect(tickOf(current(session))).toBe(0);
  });

  it('queues pause and resume from a frame without recursive world changes', () => {
    const { host, session, run } = started(), log: string[] = [];
    run.onFrame((frame) => {
      log.push(frame.phase);
      if (frame.phase === 'running') { session.control({ type: 'pause' }); session.control({ type: 'resume' }); }
      else expect(session.status().phase).toBe('paused');
    });
    host.deliver(0);
    expect(log).toEqual(['running', 'paused']);
    expect(session.status().phase).toBe('running'); expect(host.pending.size).toBe(1);
    const off = run.onFrame((frame) => { if (frame.phase === 'paused') session.control({ type: 'exit' }); });
    session.control({ type: 'pause' });
    expect(session.status().phase).toBe('idle'); expect(host.pending.size).toBe(0); off(); off();
  });

  it('defers host notifications until the domain and frame batch completes', () => {
    const { host, session, run } = started(), log: string[] = [];
    run.on('command-result', () => { host.emit({ type: 'pagehide' }); log.push(session.status().phase); });
    run.onFrame((frame) => { log.push(`${frame.phase}:${frame.projection.clock.tick}`); });
    host.deliver(0); log.length = 0;
    run.submitCommand(LAUNCH); host.deliver(TICK_MS);
    expect(log).toEqual(['running', 'running:1', 'paused:1']);
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: false }); expect(host.pending.size).toBe(0);
  });

  it('reports an illegal queued control once, then continues FIFO without faulting', () => {
    const { host, session, run, errors } = started();
    run.onFrame(() => {
      session.control({ type: 'exit' }); session.control({ type: 'pause' }); session.control({ type: 'start', spec: runSpec() });
    });
    host.deliver(0);
    expect(session.status()).toMatchObject({ phase: 'running', runId: 2 });
    expect(host.pending.size).toBe(1); expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([{ phase: 'control', cause: expect.objectContaining({ kind: 'invalid-state', operation: 'pause', phase: 'idle' }) }]);
  });

  it('reports a queued start the world refuses as a control failure', () => {
    const { host, session, run, errors } = started();
    run.onFrame(() => {
      session.control({ type: 'exit' });
      session.control({ type: 'start', spec: runSpec({ run: { wingman: 9 } }) });
    });
    host.deliver(0);
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null });
    expect(errors[0].failures).toEqual([{ phase: 'control', cause: expect.objectContaining({ kind: 'invalid-argument', path: 'control.spec' }) }]);
  });

  it('reports queued errors from a synchronous pause through onError, not to its caller', () => {
    const { session, run, errors } = started();
    run.onFrame((frame) => {
      if (frame.phase === 'paused') { session.control({ type: 'exit' }); session.control({ type: 'pause' }); }
    });
    expect(() => { session.control({ type: 'pause' }); }).not.toThrow();
    expect(errors).toHaveLength(1); expect(session.status().phase).toBe('idle');
  });

  it('freezes frame views and defers additions while honoring cancellation immediately', () => {
    const { host, session, run } = started(), log: string[] = [], frames: GameSessionFrame[] = [];
    let added = false;
    run.onFrame((frame) => {
      frames.push(frame); log.push('A');
      if (!added) { added = true; run.onFrame(() => { log.push('C'); }); offB(); }
    });
    const offB = run.onFrame(() => { log.push('B'); });
    host.deliver(0); expect(log).toEqual(['A']);
    host.deliver(TICK_MS); expect(log).toEqual(['A', 'A', 'C']);
    session.control({ type: 'pause' }); expect(log).toEqual(['A', 'A', 'C', 'A', 'C']);
    expect(frames[0]).toMatchObject({ report: { ticks: 0, capped: false, stop: null }, projection: { clock: { tick: 0 } } });
    expect(frames[1].report).toEqual({ ticks: 1, capped: false, stop: null });
    expect(frames.at(-1)).toMatchObject({ report: null, phase: 'paused', render: { previous: { tick: 1 }, current: { tick: 1 }, alpha: 0 } });
    expect(frames.every(Object.isFrozen)).toBe(true);
    expect(frames[1].projection).toBe(run.projection());
  });

  it('lets status observers wire a new run, including one on hold, but not control it', () => {
    const { session } = sessionSetup();
    const log: string[] = [], wired = new Set<number | null>();
    const off = session.onStatus((status) => {
      expect(() => { session.control({ type: 'exit' }); }).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
      if ((status.phase === 'transition' || status.phase === 'running') && !wired.has(status.runId)) {
        wired.add(status.runId);
        const run = current(session);
        run.onFrame(() => undefined); run.onAny(() => undefined);
        run.ownCleanup(() => { log.push(`cleanup:${run.runId}`); });
        expect(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: false }); }).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
      }
    });
    session.control({ type: 'start', spec: runSpec({ initialTransition: departure() }) });
    const run = current(session);
    session.control({ type: 'complete-departure', runId: 1 });
    session.control({ type: 'exit' });
    expect(() => run.ownCleanup(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    session.control({ type: 'start', spec: runSpec() });
    session.control({ type: 'dispose' });
    expect(log).toEqual(['cleanup:1', 'cleanup:2']); off(); off();
    expect(session.status()).toMatchObject({ phase: 'disposed', runId: null });
  });

  it('finishes all frame consumers before failure cancellation, cleanup, status and onError', () => {
    const host = new ControlledHost(), log: string[] = [], cause = new Error('consumer');
    const session = createGameSession(host, () => { log.push('error'); });
    session.control({ type: 'start', spec: runSpec() });
    const run = current(session);
    run.onFrame(() => { run.submitCommand(LAUNCH); log.push('first'); throw cause; });
    run.onFrame(() => { log.push('second'); });
    run.onCommandsCancelled((notice) => { log.push(`cancel:${notice.reason}:${notice.commandIds.join(',')}`); });
    run.ownCleanup(() => { log.push('cleanup'); });
    session.onStatus((status) => { log.push(`status:${status.phase}`); });
    host.deliver(0);
    expect(log).toEqual(['first', 'second', 'cancel:failure:1', 'cleanup', 'status:faulted', 'error']);
    expect(host.pending.size).toBe(0); expect(session.status().error?.failures).toEqual([{ phase: 'consumer', cause }]);
    expect(() => run.onAny(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    expect(() => run.exportRecording()).toThrowError(expect.objectContaining({ kind: 'invalid-state', phase: 'faulted' }));
  });

  it('treats a Runtime receiver failure as a consumer fault without a frame', () => {
    const { host, session, run, errors } = started(), cause = new Error('domain'), log: string[] = [];
    run.on('command-result', () => { log.push('first'); throw cause; });
    run.on('command-result', () => { log.push('second'); });
    run.onFrame(() => { log.push('frame'); });
    host.deliver(0); log.length = 0;
    run.submitCommand(LAUNCH); host.deliver(TICK_MS);
    expect(log).toEqual(['first', 'second']); expect(tickOf(run)).toBe(1);
    expect(session.status().phase).toBe('faulted');
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause: expect.any(GameRuntimeError) }]);
    expect(errors[0].failures?.[0].cause).toMatchObject({ kind: 'listener-failed', errors: [cause] });
  });

  it('honors an exit requested by a receiver that then throws', () => {
    const { host, session, run, errors } = started(), cause = new Error('domain');
    let cleaned = 0; run.ownCleanup(() => { cleaned++; });
    run.on('command-result', () => { session.control({ type: 'exit' }); throw cause; });
    host.deliver(0); run.submitCommand(LAUNCH); host.deliver(TICK_MS);
    expect(cleaned).toBe(1); expect(errors).toHaveLength(1);
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null }); expect(host.pending.size).toBe(0);
  });

  it('defers status additions and applies status cancellation immediately', () => {
    const { session } = started(), log: string[] = [];
    let added = false;
    session.onStatus(() => {
      log.push('A');
      if (!added) { added = true; session.onStatus(() => { log.push('C'); }); offB(); }
    });
    const offB = session.onStatus(() => { log.push('B'); });
    session.control({ type: 'pause' }); expect(log).toEqual(['A']);
    session.control({ type: 'resume' }); expect(log).toEqual(['A', 'A', 'C']);
  });

  it('rejects shape errors at submission and forbids control or registration in cleanup', () => {
    const { host, session, run, errors } = started();
    run.onFrame(() => {
      expect(() => { session.control({ type: 'resume', extra: 1 } as never); }).toThrowError(expect.objectContaining({ kind: 'invalid-argument' }));
    });
    const release = run.ownCleanup(() => {
      expect(() => { session.control({ type: 'exit' }); }).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
      expect(() => run.ownCleanup(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    });
    host.deliver(0); release(); expect(errors).toEqual([]); expect(session.status().phase).toBe('running');
  });
});

describe('cancellation and owned resources', () => {
  it.each(['user-pause', 'hidden', 'exit', 'dispose'] as const)('cancels the unexecuted commands once, FIFO, with reason %s', (reason) => {
    const { host, session, run } = started(), notices: GameCommandsCancelled[] = [];
    run.onCommandsCancelled((notice) => {
      notices.push(notice);
      expect(() => { session.control({ type: 'resume' }); }).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
      expect(() => run.onFrame(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    });
    run.submitCommand(LAUNCH); host.deliver(0); host.deliver(TICK_MS);
    run.setIntent({ axes: { pitch: 1, yaw: 0, roll: 0 }, primaryFire: true });
    expect(run.submitCommand(LAUNCH)).toBe(2); expect(run.submitCommand({ type: 'damage-report' })).toBe(3);
    if (reason === 'hidden') host.emit({ type: 'visibility', visibility: 'hidden' });
    else session.control({ type: reason === 'user-pause' ? 'pause' : reason });
    expect(notices).toEqual([{ runId: 1, commandIds: [2, 3], reason }]);
    expect(Object.isFrozen(notices[0])).toBe(true); expect(Object.isFrozen(notices[0].commandIds)).toBe(true);
    if (reason === 'hidden' || reason === 'user-pause') {
      session.control({ type: 'pause' }); session.control({ type: 'exit' });
      expect(notices).toHaveLength(1);
    }
  });

  it('notifies cancellation, the still frame and status in order', () => {
    const { session, run } = started(), log: string[] = [];
    run.onCommandsCancelled(() => { log.push('cancel'); });
    run.onFrame(() => { log.push('still'); });
    session.onStatus(() => { log.push('status'); });
    run.ownCleanup(() => { log.push('cleanup'); });
    run.submitCommand(LAUNCH);
    session.control({ type: 'pause' }); expect(log).toEqual(['cancel', 'still', 'status']);
    session.control({ type: 'exit' }); expect(log).toEqual(['cancel', 'still', 'status', 'cleanup', 'status']);
  });

  it('releases at once, tears down the rest in reverse order and never repeats', () => {
    const { session, run, host } = started(), log: string[] = [];
    const a = run.ownCleanup(() => { log.push('A'); });
    const b = run.ownCleanup(() => { log.push('B'); });
    const c = run.ownCleanup(() => { log.push('C'); });
    b(); b(); expect(log).toEqual(['B']);
    session.control({ type: 'exit' }); expect(log).toEqual(['B', 'C', 'A']);
    a(); c(); expect(log).toEqual(['B', 'C', 'A']);
    session.control({ type: 'start', spec: runSpec() });
    let events = 0; current(session).onAny(() => { events++; });
    session.control({ type: 'dispose' }); session.control({ type: 'dispose' });
    expect([host.listeners.size, host.pending.size, events]).toEqual([0, 0, 0]);
  });

  it('attempts C, B and A despite a cleanup failure, and latches it against new starts', () => {
    const { session, run, host } = started(), log: string[] = [], cause = new Error('C');
    run.ownCleanup(() => { log.push('A'); });
    run.ownCleanup(() => { log.push('B'); });
    run.ownCleanup(() => { log.push('C'); throw cause; });
    expect(() => { session.control({ type: 'exit' }); }).toThrowError(expect.objectContaining({ failures: [{ phase: 'cleanup', cause }] }));
    expect(log).toEqual(['C', 'B', 'A']);
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null, cleanupFailed: true, error: { failures: [{ phase: 'cleanup', cause }] } });
    expect(host.pending.size).toBe(0);
    expect(() => { session.control({ type: 'start', spec: runSpec() }); }).toThrowError(expect.objectContaining({ kind: 'invalid-state', reason: 'cleanup previously failed' }));
    session.control({ type: 'dispose' }); expect(log).toEqual(['C', 'B', 'A']);
    expect(session.status()).toMatchObject({ phase: 'disposed', cleanupFailed: true });
  });

  it('makes a failed release observable without faulting the run', () => {
    const { session, run, host } = started(), cause = new Error('release');
    let calls = 0;
    const release = run.ownCleanup(() => { calls++; throw cause; });
    expect(release).toThrowError(expect.objectContaining({ kind: 'operation-failed', failures: [{ phase: 'cleanup', cause }] }));
    expect(session.status()).toMatchObject({ phase: 'running', cleanupFailed: true }); expect(host.pending.size).toBe(1);
    release(); session.control({ type: 'exit' }); expect(calls).toBe(1);
    expect(() => { session.control({ type: 'start', spec: runSpec() }); }).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('keeps cleanupFailed after a later control error replaces the error', () => {
    const { session, run, host, errors } = started(), cause = new Error('cleanup');
    const release = run.ownCleanup(() => { throw cause; });
    expect(release).toThrow();
    run.onFrame(() => { session.control({ type: 'start', spec: runSpec() }); });
    host.deliver(0);
    expect(errors[0].failures?.[0].phase).toBe('control');
    expect(session.status()).toMatchObject({ phase: 'running', cleanupFailed: true });
  });

  it('keeps a release failure inside a consumer synchronous, without a duplicate onError', () => {
    const { session, run, host, errors } = started(), cleanupCause = new Error('release'), consumerCause = new Error('consumer');
    const release = run.ownCleanup(() => { throw cleanupCause; });
    let released = false;
    run.onFrame(() => {
      if (!released) {
        released = true;
        expect(release).toThrowError(expect.objectContaining({ failures: [{ phase: 'cleanup', cause: cleanupCause }] }));
      }
    });
    host.deliver(0);
    expect(errors).toEqual([]); expect(session.status()).toMatchObject({ phase: 'running', cleanupFailed: true });
    run.onFrame(() => { throw consumerCause; }); host.deliver(TICK_MS);
    expect(errors).toHaveLength(1);
    expect(session.status().error?.failures).toEqual([{ phase: 'consumer', cause: consumerCause }]);
    expect(session.status().cleanupFailed).toBe(true);
  });

  it('keeps a direct pause consumer failure apart from queued control failures', () => {
    const { session, run, errors } = started(), cause = new Error('still consumer');
    run.onFrame(() => { throw cause; });
    run.onFrame(() => { session.control({ type: 'exit' }); session.control({ type: 'pause' }); });
    expect(() => { session.control({ type: 'pause' }); }).toThrowError(expect.objectContaining({ failures: [{ phase: 'consumer', cause }] }));
    expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([{ phase: 'control', cause: expect.objectContaining({ operation: 'pause', phase: 'idle' }) }]);
    expect(session.status().phase).toBe('idle');
  });
});

describe('failure aggregation and final cleanup', () => {
  it('keeps consumer, cancellation, cleanup and status causes in one ordered outlet', () => {
    const log: string[] = [], consumer = new Error('frame'), cancel = new Error('notice'), cleanup = new Error('cleanup'), observer = new Error('status');
    const { host, session, run, errors } = started({}, 'visible', () => { log.push('error'); });
    run.onFrame(() => { run.submitCommand(LAUNCH); log.push('frame'); throw consumer; });
    run.onCommandsCancelled(() => { log.push('cancel'); throw cancel; });
    run.ownCleanup(() => { log.push('A'); }); run.ownCleanup(() => { log.push('B'); throw cleanup; });
    session.onStatus(() => { log.push('failed-status'); throw observer; });
    session.onStatus(() => { log.push('healthy-status'); });
    host.deliver(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([
      { phase: 'consumer', cause: consumer }, { phase: 'consumer', cause: cancel },
      { phase: 'cleanup', cause: cleanup }, { phase: 'consumer', cause: observer },
    ]);
    expect(log).toEqual(['frame', 'cancel', 'B', 'A', 'failed-status', 'healthy-status', 'healthy-status', 'error']);
    expect(session.status()).toMatchObject({ phase: 'faulted', cleanupFailed: true });
    session.control({ type: 'dispose' }); expect(log.filter((value) => value === 'B')).toHaveLength(1);
  });

  it('faults the run when a status observer throws, and stops notifying that observer', () => {
    const { session, run, errors } = started(), cause = new Error('observer'), seen: string[] = [];
    session.onStatus((status) => { seen.push(status.phase); throw cause; });
    let cancelled: unknown;
    run.onCommandsCancelled((notice) => { cancelled = notice; });
    run.submitCommand(LAUNCH);
    expect(() => { session.control({ type: 'pause' }); }).toThrowError(expect.objectContaining({ failures: [{ phase: 'consumer', cause }] }));
    expect(seen).toEqual(['paused']); expect(errors).toEqual([]);
    expect(session.status().phase).toBe('faulted');
    expect(cancelled).toEqual({ runId: 1, commandIds: [1], reason: 'user-pause' });
  });

  it('ends disposed and tries both run and host cleanup despite failures', () => {
    const a = new Error('run'), b = new Error('host'), host = new ControlledHost(), log: string[] = [];
    host.subscribeLifecycle = (listener) => {
      host.listeners.add(listener);
      return () => { host.listeners.delete(listener); log.push('host'); throw b; };
    };
    const session = createGameSession(host, () => undefined);
    session.control({ type: 'start', spec: runSpec({ initialTransition: departure() }) });
    current(session).ownCleanup(() => { log.push('run'); throw a; });
    expect(() => { session.control({ type: 'dispose' }); }).toThrowError(expect.objectContaining({ failures: [{ phase: 'cleanup', cause: a }, { phase: 'cleanup', cause: b }] }));
    expect(log).toEqual(['run', 'host']);
    expect(session.status()).toMatchObject({ phase: 'disposed', runId: null, transition: null, cleanupFailed: true });
    session.control({ type: 'dispose' }); expect(log).toEqual(['run', 'host']);
  });

  it.each([false, true])('throws both original causes when onError fails (control failures only: %s)', (controlOnly) => {
    const outletCause = new Error('outlet'), consumer = new Error('frame');
    const { host, session, run, errors } = started({}, 'visible', () => { throw outletCause; });
    run.onFrame((frame) => {
      if (frame.phase !== 'running') return;
      if (controlOnly) { session.control({ type: 'pause' }); session.control({ type: 'exit' }); session.control({ type: 'resume' }); }
      else throw consumer;
    });
    let thrown: unknown;
    try { host.deliver(0); } catch (cause) { thrown = cause; }
    expect(errors).toHaveLength(1); expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([errors[0], outletCause]);
    expect(host.pending.size).toBe(0);
    expect(session.status().phase).toBe(controlOnly ? 'idle' : 'faulted');
  });

  it('stops a healthy run when the outlet fails on control failures alone', () => {
    const cause = new Error('outlet'), { host, session, run, errors } = started({}, 'visible', () => { throw cause; });
    run.onFrame((frame) => {
      if (frame.phase === 'running') { session.control({ type: 'pause' }); session.control({ type: 'start', spec: runSpec() }); session.control({ type: 'resume' }); }
    });
    expect(() => { host.deliver(0); }).toThrowError(AggregateError);
    expect(errors).toHaveLength(1); expect(session.status().phase).toBe('faulted'); expect(host.pending.size).toBe(0);
  });

  it('keeps later cleanup causes when a failing outlet stops a healthy run', () => {
    const outlet = new Error('outlet'), later = new Error('later cleanup');
    const { host, session, run, errors } = started({}, 'visible', () => { throw outlet; });
    run.ownCleanup(() => { throw later; });
    run.onFrame(() => { session.control({ type: 'start', spec: runSpec() }); });
    let thrown: unknown;
    try { host.deliver(0); } catch (cause) { thrown = cause; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([errors[0], outlet, later]);
    expect(errors).toHaveLength(1); expect(session.status()).toMatchObject({ phase: 'faulted', cleanupFailed: true });
    expect(host.pending.size).toBe(0);
  });

  it('routes a queued resume request failure through onError, not the direct pause caller', () => {
    const { host, session, run, errors } = started(), cause = new Error('queued request'), phases: string[] = [];
    run.onFrame((frame) => { if (frame.phase === 'paused') session.control({ type: 'resume' }); });
    session.onStatus((status) => { phases.push(status.phase); });
    host.requestFailure = cause;
    expect(() => { session.control({ type: 'pause' }); }).not.toThrow();
    expect(errors[0].failures).toEqual([{ phase: 'scheduler', cause }]); expect(session.status().phase).toBe('faulted');
    expect(phases).toEqual(['paused', 'faulted']);
  });

  it.each<[string, (setup: ReturnType<typeof started>) => void]>([
    ['a start', ({ session }) => { session.control({ type: 'start', spec: runSpec() }); }],
    ['a resume', ({ session }) => { session.control({ type: 'resume' }); }],
    ['a departure completion', ({ session }) => { session.control({ type: 'complete-departure', runId: 1 }); }],
  ])('never reports a run as running when the frame request for %s fails', (name, act) => {
    const setup = started({ initialTransition: name === 'a departure completion' ? departure() : null });
    const { host, session, errors } = setup, cause = new Error('request'), phases: string[] = [];
    if (name === 'a resume') session.control({ type: 'pause' });
    if (name === 'a start') session.control({ type: 'exit' });
    session.onStatus((status) => { phases.push(status.phase); });
    host.requestFailure = cause;
    expect(() => { act(setup); }).toThrowError(expect.objectContaining({ kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }] }));
    expect(phases).toEqual(['faulted']);
    expect(session.status()).toMatchObject({ phase: 'faulted', transition: null, error: { failures: [{ phase: 'scheduler', cause }] } });
    expect(errors).toEqual([]); expect(host.pending.size).toBe(0);
  });

  it('reports a departure request failure to the direct caller', () => {
    const { host, session, errors } = started({ initialTransition: departure() }), cause = new Error('request');
    host.requestFailure = cause;
    expect(() => { session.control({ type: 'complete-departure', runId: 1 }); }).toThrowError(expect.objectContaining({ failures: [{ phase: 'scheduler', cause }] }));
    expect(session.status()).toMatchObject({ phase: 'faulted', transition: null }); expect(errors).toEqual([]);
  });
});

function checkTypes(run: GameSessionRun) {
  // @ts-expect-error Cleanup must be synchronous.
  run.ownCleanup(async () => undefined);
  // @ts-expect-error Cancellation feedback must be synchronous.
  run.onCommandsCancelled(() => Promise.resolve(undefined));
}
void checkTypes;
