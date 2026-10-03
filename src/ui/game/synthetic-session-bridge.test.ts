import { describe, expect, it } from 'vitest';
import { GameRuntimeError } from '../../app/runtime/runtime-errors.ts';
import { GameSessionError } from '../../app/session/session-errors.ts';
import { createSyntheticGameStore, type SyntheticGameStoreWriter } from './synthetic-game-store.ts';
import {
  PROJECTION_SAMPLE_INTERVAL_MS, createSyntheticSessionBridge, type SyntheticRunConsumer,
} from './synthetic-session-bridge.ts';
import { TestClock, projectionLog, setupBridge } from './synthetic-ui.test-support.ts';

function unboundBridge(consumers: readonly SyntheticRunConsumer[] = []) {
  const writer = createSyntheticGameStore(), clock = new TestClock();
  return { reader: writer.reader, clock, bridge: createSyntheticSessionBridge(writer, clock.read, consumers) };
}

/** Commits accepted results for pending commands, with the latest projection. */
function acceptingConsumer(writer: SyntheticGameStoreWriter): SyntheticRunConsumer {
  return {
    attach: binding => [binding.run.onAny((event, { commandId }) => {
      if (event.type === 'command-rejected') return;
      binding.commit({ settle: [{ runId: binding.runId, commandId, outcome: 'accepted', event }] }, true);
    })],
    faulted: binding => writer.reader.getState().pendingCommands
      .filter(pending => pending.runId === binding.runId)
      .map(({ runId, commandId }) => ({ runId, commandId, outcome: 'unconfirmed' as const, reason: 'session-failed' as const })),
  };
}

const throwingConsumer = (cause: unknown): SyntheticRunConsumer => ({ attach: () => { throw cause; } });

describe('synthetic session bridge: status and run attachment', () => {
  it('binds an idle session without a world or frame request, then attaches start at once', () => {
    const { host, reader, session, currentRun } = setupBridge();
    expect(reader.getState()).toMatchObject({ status: { phase: 'idle', runId: null }, projection: null, pendingCommands: [] });
    expect(host.pending.size).toBe(0);
    session.control({ type: 'start' });
    expect(reader.getState().status).toMatchObject({ phase: 'running', runId: 1 });
    expect(reader.getState().projection).toEqual(currentRun().uiProjection());
    expect(reader.getState().projection).toMatchObject({ scenario: 'synthetic', tick: 0, tickRateHz: 50, marker: null });
  });

  it.each(['running', 'paused'] as const)('reads a late-bound %s run without replaying events', phase => {
    const first = setupBridge();
    first.session.control({ type: 'start' });
    first.currentRun().submitCommand({ type: 'add-marker' });
    first.host.deliver(0); first.host.deliver(20);
    if (phase === 'paused') first.session.control({ type: 'pause' });
    const late = unboundBridge();
    late.bridge.bind(first.session);
    const marker = first.currentRun().uiProjection().marker;
    expect(marker).not.toBeNull();
    expect(late.reader.getState()).toMatchObject({ status: { phase, runId: 1 }, projection: { tick: 1, marker } });
  });

  it('detaches on exit and dispose, ignores stale run callbacks, and reattaches each new run from tick 0', () => {
    const { host, reader, session, recorded, bridge, clock, currentRun } = setupBridge();
    session.control({ type: 'start' });
    host.deliver(0); clock.now = 120; host.deliver(120);
    expect(reader.getState().projection?.tick).toBe(5);
    const staleFrame = Object.freeze({
      runId: 1, phase: 'running' as const, render: currentRun().renderFrame(),
      projection: Object.freeze({ ...currentRun().uiProjection(), tick: 99 }), report: Object.freeze({ ticks: 1, capped: false }),
    });
    session.control({ type: 'restart' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'running', runId: 2 }, projection: { tick: 0 } });
    const before = reader.getState();
    const stale = recorded.frames.find(entry => entry.runId === 1);
    if (!stale) throw new Error('Expected a recorded run 1 frame listener');
    stale.listener(staleFrame);
    expect(reader.getState()).toBe(before);
    session.control({ type: 'exit' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'idle', runId: null }, projection: null });
    expect(bridge.currentRun()).toBeNull();
    session.control({ type: 'start' });
    expect(reader.getState()).toMatchObject({ status: { runId: 3 }, projection: { tick: 0 } });
    expect(bridge.currentRun()?.runId).toBe(3);
    session.control({ type: 'dispose' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'disposed', runId: null }, projection: null });
    bridge.unbind(); bridge.unbind();
    expect(host.listeners.size).toBe(0);
    expect(host.pending.size).toBe(0);
  });

  it('writes status changes in the same notification and publishes the latest tick on pause', () => {
    const { host, reader, session, clock } = setupBridge();
    session.control({ type: 'start' });
    host.deliver(0); clock.now = 40; host.deliver(40);
    expect(reader.getState().projection?.tick).toBe(0);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(reader.getState().status).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: false });
    expect(reader.getState().projection?.tick).toBe(2);
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(reader.getState().status).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: true });
    const release = session.currentRun()?.ownCleanup(() => { throw new Error('release'); });
    expect(() => release?.()).toThrow(GameSessionError);
    expect(reader.getState().status).toMatchObject({ phase: 'paused', cleanupFailed: true });
  });

  it('rolls back a direct bind whose clock read fails', () => {
    const first = setupBridge();
    first.session.control({ type: 'start' });
    const late = unboundBridge();
    const cause = new Error('clock unavailable');
    late.clock.failure = cause;
    expect(() => late.bridge.bind(first.session)).toThrow(cause);
    const before = late.reader.getState();
    first.session.control({ type: 'pause' });
    expect(late.reader.getState()).toBe(before);
    late.clock.failure = undefined;
    late.bridge.bind(first.session);
    expect(late.reader.getState().status).toMatchObject({ phase: 'paused', runId: 1 });
  });

  it('rolls back a partial direct attachment without a success-shaped store', () => {
    const first = setupBridge();
    first.session.control({ type: 'start' });
    const cause = new Error('consumer attach');
    const late = unboundBridge([throwingConsumer(cause)]);
    expect(() => late.bridge.bind(first.session)).toThrow(cause);
    expect(late.reader.getState().status).toBeNull();
    first.session.control({ type: 'pause' });
    expect(late.reader.getState().status).toBeNull();
    expect(first.session.status()).toMatchObject({ phase: 'paused', error: null });
  });

  it('keeps observing status after a consumer fails to attach to a new run', () => {
    const cause = new Error('consumer attach');
    const { host, reader, session } = setupBridge(undefined, () => [throwingConsumer(cause)]);
    expect(() => session.control({ type: 'start' })).toThrowError(expect.objectContaining({
      kind: 'operation-failed', failures: [{ phase: 'consumer', cause }],
    }));
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted', runId: 1 }, projection: { tick: 0 } });
    expect(host.pending.size).toBe(0);
    session.control({ type: 'exit' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'idle' }, projection: null });
  });

  it('serves one session for its lifetime and ignores errors after unbinding', () => {
    const { reader, session, bridge } = setupBridge();
    session.control({ type: 'start' });
    bridge.unbind();
    const before = reader.getState();
    bridge.onError(new GameSessionError({ kind: 'operation-failed', failures: [] }));
    session.control({ type: 'pause' });
    expect(reader.getState()).toBe(before);
    expect(() => bridge.bind(session)).toThrow('exactly one session');
  });
});

describe('synthetic session bridge: clock failures', () => {
  it('does not read the clock for a hidden start, then anchors on the first resumed frame', () => {
    const { host, reader, session, clock, errors } = setupBridge();
    host.visibility = 'hidden';
    clock.failure = new Error('clock unavailable');
    session.control({ type: 'start' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'paused', pauseReason: 'hidden' }, projection: { tick: 0 }, sessionError: null });
    expect(errors).toEqual([]);
    clock.failure = undefined;
    host.emit({ type: 'visibility', visibility: 'visible' });
    session.control({ type: 'resume' });
    const log = projectionLog(reader, clock);
    clock.now = 10; host.deliver(1000);
    clock.now = 60; host.deliver(1020);
    clock.now = 115; host.deliver(1040);
    expect(log).toEqual([[2, 115]]);
  });

  it('faults on the first resumed frame when a hidden-started run has a failing clock', () => {
    const { host, reader, session, clock, errors } = setupBridge();
    host.visibility = 'hidden';
    session.control({ type: 'start' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    const cause = new Error('clock unavailable');
    clock.failure = cause;
    session.control({ type: 'resume' });
    host.deliver(1000);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause }]);
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted' }, sessionError: errors[0] });
  });

  it('keeps a received result authoritative when the clock fails while publishing it', () => {
    const { host, reader, session, clock, errors, bridge, currentRun } = setupBridge(undefined, writer => [acceptingConsumer(writer)]);
    session.control({ type: 'start' });
    const commandId = currentRun().submitCommand({ type: 'add-marker' });
    bridge.currentRun()?.commit({ addPending: { runId: 1, commandId, commandType: 'add-marker' } });
    host.deliver(0);
    const cause = new Error('clock unavailable');
    clock.failure = cause;
    host.deliver(20);
    const runtimeError = errors[0].failures?.[0].cause;
    expect(errors[0].failures?.[0].phase).toBe('consumer');
    expect(runtimeError).toBeInstanceOf(GameRuntimeError);
    expect(runtimeError).toMatchObject({ kind: 'listener-failed', errors: [cause] });
    const state = reader.getState();
    expect(state.status?.phase).toBe('faulted');
    expect(state.pendingCommands).toEqual([]);
    expect(state.recentResults).toEqual([expect.objectContaining({ commandId, outcome: 'accepted', event: expect.objectContaining({ type: 'marker-added' }) })]);
    const [result] = state.recentResults;
    if (result?.outcome !== 'accepted') throw new Error('Expected an accepted result');
    expect(state.projection?.marker?.id).toBe(result.event.entityId);
  });
});

describe('synthetic session bridge: 10 Hz projection sampling', () => {
  it('publishes due ticks only, at most every 100 ms, and never repeats a tick', () => {
    const { host, reader, session, clock, currentRun } = setupBridge();
    expect(PROJECTION_SAMPLE_INTERVAL_MS).toBe(100);
    const log = projectionLog(reader, clock);
    session.control({ type: 'start' });
    const frame = (hostMs: number, clockMs: number) => {
      clock.now = clockMs;
      host.deliver(hostMs);
      return currentRun().uiProjection().tick;
    };
    expect([frame(0, 0), frame(99, 99), frame(100, 100), frame(199, 199), frame(200, 200)]).toEqual([0, 4, 5, 9, 10]);
    expect(frame(450, 450)).toBe(15);
    expect(frame(470, 500)).toBe(16);
    expect(frame(470, 560)).toBe(16);
    expect(frame(470, 700)).toBe(16);
    expect(log).toEqual([[0, 0], [5, 100], [10, 200], [15, 450], [16, 560]]);
    expect(Object.isFrozen(reader.getState().projection)).toBe(true);
    expect(reader.getState().projection).toEqual(currentRun().uiProjection());
  });

  it('keeps paused frames still and does not backfill samples after resume', () => {
    const { host, reader, session, clock } = setupBridge();
    session.control({ type: 'start' });
    host.deliver(0); clock.now = 100; host.deliver(100);
    const log = projectionLog(reader, clock);
    session.control({ type: 'pause' });
    expect(host.pending.size).toBe(0);
    expect(log).toEqual([]);
    session.control({ type: 'resume' });
    clock.now = 5000; host.deliver(5000);
    expect(log).toEqual([]);
    clock.now = 5020; host.deliver(5020);
    expect(log).toEqual([[6, 5020]]);
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a non-number', 'late'],
    ['a backwards value', 5],
  ] as const)('faults the run as a consumer failure when the clock returns %s', (_, value) => {
    const { host, reader, session, clock, errors, currentRun } = setupBridge();
    session.control({ type: 'start' });
    host.deliver(0);
    clock.now = 10; host.deliver(20);
    clock.now = value; host.deliver(40);
    expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause: expect.any(RangeError) }]);
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted' }, sessionError: errors[0] });
    expect(reader.getState().projection).toEqual(currentRun().uiProjection());
    expect(reader.getState().projection?.tick).toBe(2);
    expect(host.pending.size).toBe(0);
  });

  it('reports a clock read failure, including one at attachment, on the next frame', () => {
    const { host, reader, session, clock, errors } = setupBridge();
    const cause = new Error('clock unavailable');
    clock.failure = cause;
    session.control({ type: 'start' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'running' }, projection: { tick: 0 }, sessionError: null });
    clock.failure = undefined;
    host.deliver(0);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause }]);
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted' }, sessionError: errors[0] });
    session.control({ type: 'restart' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'running', runId: 2 }, sessionError: null });
    host.deliver(0);
    clock.failure = cause;
    host.deliver(20);
    expect(errors).toHaveLength(2);
    expect(errors[1].failures).toEqual([{ phase: 'consumer', cause }]);
  });
});
