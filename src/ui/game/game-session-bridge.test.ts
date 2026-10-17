import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import { departure, runSpec } from '../../app/session/game-session.test-support.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { GameSessionError } from '../../app/session/session-errors.ts';
import type { MapPlayer, Projection } from '../../core/projections/projection.ts';
import type { RenderWarp } from '../../core/projections/render-state.ts';
import type { MissionStatus } from '../../core/world/world-state.ts';
import { PROJECTION_SAMPLE_INTERVAL_MS, createGameSessionBridge, type GameRunBinding, type GameRunConsumer } from './game-session-bridge.ts';
import { createGameStore } from './game-store.ts';
import { TestClock, frameDouble, history, projectionDouble, projectionLog, recordingSession, setupBridge } from './game-ui.test-support.ts';

function unboundBridge(consumers: readonly GameRunConsumer[] = [], ownerId = 2) {
  const store = createGameStore(ownerId), clock = new TestClock();
  return { reader: store.reader, clock, bridge: createGameSessionBridge({ store, clock: clock.read, consumers }) };
}

const throwingConsumer = (cause: unknown): GameRunConsumer => ({ attach: () => { throw cause; } });

/** A started bridge with its first frame anchored at clock 0. */
function running() {
  const context = setupBridge();
  context.session.control({ type: 'start', spec: runSpec() });
  context.host.deliver(0);
  let hostMs = 0;
  /** Delivers a frame `ticks` later on the host, at sampling clock `clockMs`; returns the run's tick. */
  const frame = (ticks: number, clockMs: number) => {
    hostMs += ticks * TICK_MS;
    context.clock.now = clockMs;
    context.host.deliver(hostMs);
    return context.currentRun().projection().clock.tick;
  };
  return { ...context, frame };
}

describe('game session bridge: status and run attachment', () => {
  it('binds an idle session without a world or frame request, then attaches a start in one write', () => {
    const { host, reader, session, currentRun, clock } = setupBridge();
    expect(reader.getState()).toMatchObject({ ownerId: 1, status: { phase: 'idle', runId: null }, projection: null, pendingCommands: [] });
    expect(host.pending.size).toBe(0);
    const states = history(reader);
    session.control({ type: 'start', spec: runSpec() });
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ status: { phase: 'running', runId: 1 }, projection: { clock: { tick: 0 } } });
    expect(states[0].projection).toBe(currentRun().projection());
    expect(clock.reads).toBe(1);
  });

  it('attaches the initial departure hold at tick 0 without a clock read, and anchors on the first running frame', () => {
    const { host, reader, session, clock } = setupBridge();
    const log = projectionLog(reader, clock);
    session.control({ type: 'start', spec: runSpec({ initialTransition: departure() }) });
    expect(reader.getState()).toMatchObject({ status: { phase: 'transition', runId: 1, transition: departure() }, projection: { clock: { tick: 0 } } });
    expect([host.pending.size, clock.reads]).toEqual([0, 0]);
    session.control({ type: 'complete-departure', runId: 1 });
    expect(reader.getState().status).toMatchObject({ phase: 'running', transition: null });
    clock.now = 500; host.deliver(1000);
    expect(clock.reads).toBe(1);
    clock.now = 599; host.deliver(1000 + TICK_MS);
    // Tick 1 instantiates the player, whose map key facts are published at once.
    expect(log).toEqual([[0, 0], [1, 599]]);
    clock.now = 698; host.deliver(1000 + 2 * TICK_MS);
    expect(log).toEqual([[0, 0], [1, 599], [2, 698]]);
    clock.now = 797; host.deliver(1000 + 3 * TICK_MS);
    clock.now = 798; host.deliver(1000 + 4 * TICK_MS);
    expect(log).toEqual([[0, 0], [1, 599], [2, 698], [4, 798]]);
  });

  it('keeps a hold hidden during the departure paused (hidden) for an explicit resume', () => {
    const { host, reader, session } = setupBridge();
    session.control({ type: 'start', spec: runSpec({ initialTransition: departure() }) });
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(reader.getState().status).toMatchObject({ phase: 'transition', resumeRequired: true, environmentVisible: false });
    host.emit({ type: 'visibility', visibility: 'visible' });
    session.control({ type: 'complete-departure', runId: 1 });
    expect(reader.getState().status).toMatchObject({ phase: 'paused', pauseReason: 'hidden', resumeRequired: true, environmentVisible: true });
  });

  it.each(['running', 'paused'] as const)('reads a late-bound %s run without replaying events', (phase) => {
    const first = running();
    first.frame(2, 10);
    if (phase === 'paused') first.session.control({ type: 'pause' });
    const late = unboundBridge();
    late.bridge.bind(first.session);
    expect(late.reader.getState()).toMatchObject({ ownerId: 2, status: { phase, runId: 1 }, projection: { clock: { tick: 2 } } });
    expect(late.reader.getState().projection).toBe(first.currentRun().projection());
  });

  it('starts a late-bound running run\'s sample at the bind, so its next ticks wait for the window', () => {
    const first = running();
    first.frame(2, 10);
    const late = unboundBridge();
    late.clock.now = 1000;
    late.bridge.bind(first.session);
    const log = projectionLog(late.reader, late.clock);
    late.clock.now = 1050; first.frame(1, 1050);
    late.clock.now = 1099; first.frame(1, 1099);
    expect(log).toEqual([]);
    late.clock.now = 1100; first.frame(1, 1100);
    expect(log).toEqual([[5, 1100]]);
  });

  it('starts the sample on the first frame after a late-bound paused run resumes, instead of publishing at once', () => {
    const first = running();
    first.frame(2, 10);
    first.session.control({ type: 'pause' });
    const late = unboundBridge();
    const view = recordingSession(first.session);
    late.bridge.bind(view.session);
    const run = first.currentRun();
    const log = projectionLog(late.reader, late.clock);
    const deliver = (tick: number, clockMs: number) => {
      late.clock.now = clockMs;
      view.recorded.frames[0].listener(frameDouble(run, projectionDouble(run.projection(), tick)));
    };
    deliver(3, 400);
    deliver(4, 499);
    expect(log).toEqual([]);
    deliver(5, 500);
    expect(log).toEqual([[5, 500]]);
  });

  it('reads a late-bound faulted run for diagnosis only, without registering run resources', () => {
    const first = running();
    first.clock.failure = new Error('clock');
    first.frame(1, 0);
    expect(first.session.status().phase).toBe('faulted');
    const late = unboundBridge();
    late.bridge.bind(first.session);
    expect(late.reader.getState()).toMatchObject({ status: { phase: 'faulted', runId: 1 }, projection: { clock: { tick: 1 } } });
    expect(late.bridge.currentRun()).toBeNull();
  });

  it('detaches on exit and dispose, ignores stale run frames, and reattaches each new run from tick 0', () => {
    const { host, reader, session, recorded, bridge, frame, currentRun } = running();
    frame(5, 200);
    expect(reader.getState().projection?.clock.tick).toBe(5);
    const old = currentRun();
    const stale = frameDouble(old, projectionDouble(old.projection(), 99));
    session.control({ type: 'exit' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'idle', runId: null }, projection: null });
    expect(bridge.currentRun()).toBeNull();
    session.control({ type: 'start', spec: runSpec() });
    expect(reader.getState()).toMatchObject({ status: { phase: 'running', runId: 2 }, projection: { clock: { tick: 0 } } });
    const before = reader.getState();
    for (const entry of recorded.frames.filter((item) => item.runId === 1)) entry.listener(stale);
    expect(reader.getState()).toBe(before);
    expect(bridge.currentRun()?.runId).toBe(2);
    session.control({ type: 'dispose' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'disposed', runId: null }, projection: null });
    bridge.unbind(); bridge.unbind();
    expect([host.listeners.size, host.pending.size]).toEqual([0, 0]);
  });

  it('writes status changes in their notification and publishes the latest tick on the pause still frame', () => {
    const { host, reader, session, frame } = running();
    // Ticks 1 and 2 change the map's key facts, published at once; tick 3 waits for the sample.
    frame(2, 40);
    frame(1, 50);
    expect(reader.getState().projection?.clock.tick).toBe(2);
    const states = history(reader);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(states.map((state) => [state.status?.phase, state.projection?.clock.tick])).toEqual([['running', 3], ['paused', 3]]);
    expect(reader.getState().status).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: false });
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(reader.getState().status).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: true });
    const release = session.currentRun()?.ownCleanup(() => { throw new Error('release'); });
    expect(() => release?.()).toThrow(GameSessionError);
    expect(reader.getState().status).toMatchObject({ phase: 'paused', cleanupFailed: true });
  });

  it('serves one session for its lifetime, guards a retired binding and ignores errors after unbinding', () => {
    const { reader, session, bridge, host, currentRun } = running();
    const binding = bridge.currentRun();
    if (!binding) throw new Error('Expected a binding');
    bridge.unbind();
    expect(() => binding.submitCommand({ type: 'launch' })).toThrow('no longer controls');
    expect(() => { binding.setIntent({ axes: { pitch: 1, yaw: 0, roll: 0 }, primaryFire: false }); }).toThrow('no longer controls');
    const before = reader.getState();
    bridge.onError(new GameSessionError({ kind: 'operation-failed', failures: [] }));
    session.control({ type: 'pause' });
    expect(reader.getState()).toBe(before);
    expect(() => { bridge.bind(session); }).toThrow('exactly one session');
    session.control({ type: 'resume' });
    host.deliver(5000); host.deliver(5000 + TICK_MS);
    expect(currentRun().projection().clock.tick).toBe(1);
    expect(reader.getState()).toBe(before);
  });

  it('lets an owner attach the run as a run-level consumer from its own status listener', () => {
    const store = createGameStore(3), clock = new TestClock();
    const bridge = createGameSessionBridge({ store, clock: clock.read });
    const base = setupBridge();
    base.bridge.unbind();
    const { session } = base;
    const attached: number[] = [];
    session.onStatus((status) => {
      const run = session.currentRun();
      if (run && status.phase === 'running' && attached.length === 0) { bridge.attach(run); attached.push(run.runId); }
    });
    bridge.bind(session);
    const states = history(store.reader);
    session.control({ type: 'start', spec: runSpec() });
    expect(attached).toEqual([1]);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ status: { phase: 'running', runId: 1 }, projection: { clock: { tick: 0 } } });
    bridge.attach(session.currentRun()!);
    expect(states).toHaveLength(1);
    expect(bridge.currentRun()?.runId).toBe(1);
    const unbound = unboundBridge();
    expect(() => { unbound.bridge.attach(session.currentRun()!); }).toThrow('not bound');
    session.control({ type: 'exit' });
    session.control({ type: 'start', spec: runSpec() });
    const stale = { ...session.currentRun()!, runId: 1 };
    expect(() => { bridge.attach(stale); }).toThrow('current run');
  });
  it('defers a clock failure of an owner\'s attach to the run\'s next frame', () => {
    const base = setupBridge();
    base.bridge.unbind();
    const { session, host, errors } = base;
    const store = createGameStore(3), clock = new TestClock();
    const bridge = createGameSessionBridge({ store, clock: clock.read });
    const cause = new Error('clock unavailable');
    session.onStatus(() => {
      const run = session.currentRun();
      if (run && bridge.currentRun() === null) bridge.attach(run);
    });
    bridge.bind(session);
    clock.failure = cause;
    session.control({ type: 'start', spec: runSpec() });
    expect(store.reader.getState().status).toMatchObject({ phase: 'running', runId: 1 });
    expect(session.status().error).toBeNull();
    clock.failure = undefined;
    host.deliver(0);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause }]);
  });
});

describe('game session bridge: transactional attachment', () => {
  it('rolls back a partial direct attachment without a success-shaped store', () => {
    const first = running();
    const cause = new Error('consumer attach');
    let calls = 0, failures = 1;
    const late = unboundBridge([{
      attach: (binding) => {
        binding.own(binding.run.on('command-result', () => { calls++; }));
        if (failures-- > 0) throw cause;
      },
    }]);
    expect(() => { late.bridge.bind(first.session); }).toThrow(cause);
    expect(late.reader.getState().status).toBeNull();
    first.currentRun().submitCommand({ type: 'launch' });
    first.frame(1, 10);
    expect(calls).toBe(0);
    first.session.control({ type: 'pause' });
    expect(late.reader.getState().status).toBeNull();
    expect(first.session.status()).toMatchObject({ phase: 'paused', error: null });
    late.bridge.bind(first.session);
    expect(late.reader.getState().status).toMatchObject({ phase: 'paused', runId: 1 });
  });

  it('writes nothing a consumer commits before every consumer attached, so a later failure leaves the store unchanged', () => {
    const first = running();
    const writes: number[] = [];
    const committing: GameRunConsumer = {
      attach: (binding) => {
        writes.push(binding.commit({ actionError: { operation: 'attach', cause: null }, addPending: { runId: 1, commandId: 9, commandType: 'launch' } }));
      },
    };
    const late = unboundBridge([committing, throwingConsumer(new Error('second consumer'))]);
    expect(() => { late.bridge.bind(first.session); }).toThrow('second consumer');
    expect(late.reader.getState()).toBe(late.reader.getInitialState());
    const success = unboundBridge([committing]);
    success.bridge.bind(first.session);
    expect(writes).toEqual([0, 0]);
    expect(success.reader.getState()).toMatchObject({ status: { phase: 'running' }, pendingCommands: [], actionError: null });
  });

  it('rolls back a direct bind to a running run whose clock read fails, and may bind again', () => {
    const first = running();
    const late = unboundBridge();
    const cause = new Error('clock unavailable');
    late.clock.failure = cause;
    expect(() => { late.bridge.bind(first.session); }).toThrow(cause);
    first.session.control({ type: 'pause' });
    expect(late.reader.getState()).toBe(late.reader.getInitialState());
    late.clock.failure = undefined;
    late.bridge.bind(first.session);
    expect(late.reader.getState().status).toMatchObject({ phase: 'paused', runId: 1 });
  });

  it('defers a clock failure while attaching from a status notification to the run\'s next frame', () => {
    const { host, reader, session, clock, errors } = setupBridge();
    const cause = new Error('clock unavailable');
    clock.failure = cause;
    session.control({ type: 'start', spec: runSpec() });
    expect(reader.getState()).toMatchObject({ status: { phase: 'running' }, projection: { clock: { tick: 0 } }, sessionError: null });
    clock.failure = undefined;
    host.deliver(0);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause }]);
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted' }, sessionError: errors[0] });
  });

  it('guards input from a binding retired by attachment rollback while its Session still runs', () => {
    const first = running();
    const retired: GameRunBinding[] = [];
    const late = unboundBridge([{ attach: (binding) => { retired.push(binding); throw new Error('attach'); } }]);
    expect(() => { late.bridge.bind(first.session); }).toThrow('attach');
    expect(() => retired[0].submitCommand({ type: 'launch' })).toThrow('no longer controls');
    expect(first.session.status().phase).toBe('running');
  });

  it('throws a RollbackError, and the session reports cleanupFailed, when an attachment cannot be rolled back', () => {
    const cause = new Error('consumer attach'), rollback = new Error('rollback');
    const consumer: GameRunConsumer = {
      attach: (binding) => {
        binding.own(binding.run.ownCleanup(() => { throw rollback; }));
        throw cause;
      },
    };
    const { reader, session } = setupBridge({ consumers: () => [consumer] });
    let thrown: unknown;
    try { session.control({ type: 'start', spec: runSpec() }); } catch (error) { thrown = error; }
    const [failure] = (thrown as GameSessionError).failures!;
    expect(failure.phase).toBe('consumer');
    expect(failure.cause).toBeInstanceOf(RollbackError);
    expect(failure.cause).toMatchObject({ cause, errors: [cause, { failures: [{ phase: 'cleanup', cause: rollback }] }] });
    expect(reader.getState().status).toMatchObject({ phase: 'faulted', cleanupFailed: true });
  });

  it('keeps observing status after a consumer fails to attach to a new run, which faults that run unreported as started', () => {
    const cause = new Error('consumer attach');
    const { host, reader, session } = setupBridge({ consumers: () => [throwingConsumer(cause)] });
    const states = history(reader);
    expect(() => { session.control({ type: 'start', spec: runSpec() }); }).toThrowError(expect.objectContaining({
      kind: 'operation-failed', failures: [{ phase: 'consumer', cause }],
    }));
    expect(states.map((state) => state.status?.phase)).toEqual(['faulted']);
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted', runId: 1 }, projection: { clock: { tick: 0 } } });
    expect(host.pending.size).toBe(0);
    session.control({ type: 'exit' });
    expect(reader.getState()).toMatchObject({ status: { phase: 'idle' }, projection: null });
  });
});

describe('game session bridge: 10 Hz projection sampling', () => {
  it('samples on the 99/100 ms boundary, at most every 100 ms, and never repeats an owner, run and tick', () => {
    const { reader, clock, frame, recorded, currentRun } = running();
    expect(PROJECTION_SAMPLE_INTERVAL_MS).toBe(100);
    // Ticks 1 and 2 change the map's key facts (the player appears, then its Warp gate reason), published at once.
    expect(frame(2, 0)).toBe(2);
    const log = projectionLog(reader, clock);
    expect([frame(1, 99), frame(1, 100), frame(0, 150), frame(1, 199), frame(1, 200)]).toEqual([3, 4, 4, 5, 6]);
    expect([frame(5, 450), frame(1, 500), frame(0, 560), frame(0, 700)]).toEqual([11, 12, 12, 12]);
    // A due frame publishes the latest unpublished tick even when it ran no tick itself.
    expect(log).toEqual([[4, 100], [6, 200], [11, 450], [12, 560]]);
    const sameTick = projectionDouble(currentRun().projection(), 12);
    clock.now = 900;
    recorded.frames[0].listener(frameDouble(currentRun(), sameTick));
    expect(log).toHaveLength(4);
    expect(frame(1, 900)).toBe(13);
    expect(log).toEqual([[4, 100], [6, 200], [11, 450], [12, 560], [13, 900]]);
    expect(Object.isFrozen(reader.getState())).toBe(true);
    expect(reader.getState().projection).toBe(currentRun().projection());
  });

  it('keeps paused frames still and does not backfill samples after resume', () => {
    const { host, reader, session, clock, frame } = running();
    frame(3, 100);
    const log = projectionLog(reader, clock);
    session.control({ type: 'pause' });
    expect(host.pending.size).toBe(0);
    expect(log).toEqual([]);
    session.control({ type: 'resume' });
    clock.now = 5000; host.deliver(5000);
    expect(log).toEqual([]);
    clock.now = 5020; host.deliver(5000 + TICK_MS);
    expect(log).toEqual([[4, 5020]]);
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a non-number', 'late'],
    ['a backwards value', 5],
  ] as const)('faults the run as a consumer failure when the clock returns %s', (_, value) => {
    const { host, reader, errors, frame, currentRun } = running();
    frame(1, 10);
    frame(1, value as number);
    expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause: expect.any(RangeError) }]);
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted' }, sessionError: errors[0] });
    expect(reader.getState().projection).toBe(currentRun().projection());
    expect(reader.getState().projection?.clock.tick).toBe(2);
    expect(host.pending.size).toBe(0);
  });

  it('reports a clock read failure, including the first anchoring read, as a consumer fault on that frame', () => {
    const { host, reader, session, clock, errors } = setupBridge();
    const cause = new Error('clock unavailable');
    clock.failure = cause;
    session.control({ type: 'start', spec: runSpec() });
    expect(reader.getState()).toMatchObject({ status: { phase: 'running' }, projection: { clock: { tick: 0 } }, sessionError: null });
    host.deliver(0);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause }]);
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted' }, sessionError: errors[0] });
    session.control({ type: 'exit' });
    clock.failure = undefined;
    session.control({ type: 'start', spec: runSpec() });
    expect(reader.getState()).toMatchObject({ status: { phase: 'running', runId: 2 }, sessionError: null });
    host.deliver(1000);
    clock.failure = cause;
    host.deliver(1000 + TICK_MS);
    expect(errors).toHaveLength(2);
    expect(errors[1].failures).toEqual([{ phase: 'consumer', cause }]);
  });
});

describe('game session bridge: key facts published at the end of their frame', () => {
  /** A running bridge whose next frames are typed doubles of later Core read models, delivered to the bridge alone. */
  function doubles() {
    const context = running();
    context.frame(1, 1000);
    const run = context.currentRun();
    const base = run.projection();
    const log = projectionLog(context.reader, context.clock);
    let tick = base.clock.tick;
    const deliver = (clockMs: number, parts: Partial<Omit<Projection, 'clock'>> = {}) => {
      context.clock.now = clockMs;
      context.recorded.frames[0].listener(frameDouble(run, projectionDouble(base, ++tick, parts)));
    };
    return { ...context, base, log, deliver };
  }

  it('does not publish a new projection object early when its key facts are unchanged', () => {
    const { log, deliver, base } = doubles();
    expect(base.flight).toMatchObject({ motion: { readiness: 'ready' }, combat: { readiness: 'ready' } });
    deliver(1010);
    deliver(1020, {
      player: Object.freeze({ ...base.player }),
      // New motion and combat readings within their ready groups are sampled, not published at once.
      flight: Object.freeze({ motion: Object.freeze({ readiness: 'ready' as const, player: null }), combat: Object.freeze({ readiness: 'ready' as const, player: null }) }),
      result: Object.freeze({ readiness: 'not-implemented' as const }),
    });
    expect(log).toEqual([]);
    deliver(1100);
    expect(log).toEqual([[4, 1100]]);
  });

  it.each<[string, (base: Projection) => Partial<Omit<Projection, 'clock'>>]>([
    ['the interaction context', (base) => ({ player: Object.freeze({ ...base.player, interactionContext: 'map' as const }) })],
    // P3-11 adds mission statuses; the double stands for one.
    ['the mission status', (base) => ({ mission: Object.freeze({ ...base.mission, status: 'running' as unknown as MissionStatus }) })],
    ['the result readiness', () => ({ result: Object.freeze({ readiness: 'ready' as const, outcome: 'in-progress' as const }) })],
    // A partition readiness: P3-06 splits the flight partition into groups, each ready on its own (P3-06 motion, P3-07 combat).
    ['the flight motion group readiness', (base) => ({
      flight: Object.freeze({ motion: Object.freeze({ readiness: 'not-implemented' as const }), combat: base.flight.combat }),
    })],
    ['the flight combat group readiness', (base) => ({
      flight: Object.freeze({
        motion: base.flight.motion,
        combat: Object.freeze({ readiness: 'not-implemented' as const }),
      }),
    })],
  ])('publishes a change of %s at once, then samples again from it', (_, change) => {
    const { log, deliver, base } = doubles();
    const parts = change(base);
    deliver(1010, parts);
    expect(log).toEqual([[2, 1010]]);
    deliver(1020, Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, Object.freeze({ ...value })])));
    deliver(1109, parts);
    expect(log).toEqual([[2, 1010]]);
    deliver(1110, parts);
    expect(log).toEqual([[2, 1010], [5, 1110]]);
  });

  it('publishes a change of the base page\'s selection or order at once, and samples its other readings (P3-10, G-05)', () => {
    const { log, deliver, base } = doubles();
    const flags = Object.freeze({ repairsComplete: false, energyAndMissilesFull: false, hullFull: false });
    const row = (record: number, state: number) => Object.freeze({ record, selector: record, state });
    // A double of the base view: only the fields the bridge reads are typed.
    const atBase = (cursor: number, rows: readonly ReturnType<typeof row>[]): Partial<Omit<Projection, 'clock'>> => ({
      communications: Object.freeze({
        readiness: 'ready' as const,
        player: Object.freeze({ base: Object.freeze({ baseEntityId: 7, rows: Object.freeze(rows), cursor, flags }) }),
      }) as unknown as Projection['communications'],
    });
    deliver(1010, atBase(0, [row(0, 2), row(1, 1)]));
    // The same selection and order, a new state: sampled.
    deliver(1020, atBase(0, [row(0, 1), row(1, 1)]));
    deliver(1030, atBase(1, [row(0, 1), row(1, 1)]));
    deliver(1040, atBase(1, [row(1, 1), row(0, 1)]));
    deliver(1050, atBase(1, [row(1, 0), row(0, 1)]));
    deliver(1060, { communications: base.communications });
    expect(log).toEqual([[2, 1010], [4, 1030], [5, 1040], [7, 1060]]);
  });

  it('publishes a change of result content inside a ready result', () => {
    const { log, deliver } = doubles();
    const inProgress = Object.freeze({ readiness: 'ready' as const, outcome: 'in-progress' as const });
    deliver(1010, { result: inProgress });
    deliver(1020, { result: Object.freeze({ ...inProgress }) });
    // P3-11 defines the reason and message references; the double stands for a final result.
    deliver(1030, { result: Object.freeze({ readiness: 'ready', outcome: 'failure', reason: 'r', message: 'm' }) as unknown as Projection['result'] });
    expect(log).toEqual([[2, 1010], [4, 1030]]);
  });
});

describe('game session bridge: the map\'s and Warp\'s key facts (P3-09)', () => {
  it('publishes the real map opening, selection and Warp start and completion at once, and samples a hover', () => {
    const { reader, clock, frame, currentRun } = running();
    frame(2, 0);
    const log = projectionLog(reader, clock);
    const run = currentRun();
    const mapOf = () => {
      const { map } = reader.getState().projection!;
      return map.readiness === 'ready' ? map.player : null;
    };
    run.submitCommand({ type: 'toggle-map' });
    expect(frame(1, 10)).toBe(3);
    expect(log).toEqual([[3, 10]]);
    expect(mapOf()).toMatchObject({ state: 'open', destination: null, warpRequest: { accepted: false, reason: 'no-destination' } });
    // A hover moves only the cursor and its readings: sampled, not published at once.
    run.submitCommand({ type: 'map-point', operation: 'hover', right: 0.3, down: 0.3 });
    frame(1, 20);
    expect(log).toEqual([[3, 10]]);
    run.submitCommand({ type: 'map-point', operation: 'select', right: 0.52, down: 0.5 });
    frame(1, 30);
    expect(log).toEqual([[3, 10], [5, 30]]);
    expect(mapOf()).toMatchObject({ state: 'open', destination: { position: { x: 1800, y: 0, z: 0 } }, warpRequest: { accepted: true } });
    expect(mapOf()?.markerEntityId).not.toBeNull();
    run.submitCommand({ type: 'request-warp' });
    frame(1, 40);
    expect(log).toEqual([[3, 10], [5, 30], [6, 40]]);
    expect(reader.getState().projection?.player).toMatchObject({ viewMode: 1, interactionContext: 'warp' });
    // The transit is sampled until the completion, which is published in its own frame.
    let clockMs = 40;
    let completed = false;
    run.on('warp-completed', () => { completed = true; return undefined; });
    while (!completed) frame(5, ++clockMs);
    expect(reader.getState().projection?.clock.tick).toBe(run.projection().clock.tick);
    expect(reader.getState().projection?.player.interactionContext).toBe('flight');
    expect(log.at(-1)).toEqual([run.projection().clock.tick, clockMs]);
  });

  /** A running bridge past the player's appearance with the map open on a destination, and typed doubles of later frames. */
  function mapDoubles() {
    const context = running();
    context.frame(2, 0);
    const run = context.currentRun();
    run.submitCommand({ type: 'toggle-map' });
    run.submitCommand({ type: 'map-point', operation: 'select', right: 0.52, down: 0.5 });
    context.frame(1, 1000);
    const base = run.projection();
    if (base.map.readiness !== 'ready' || base.map.player?.state !== 'open') throw new Error('The map is not open');
    const open = base.map.player;
    const log = projectionLog(context.reader, context.clock);
    let tick = base.clock.tick;
    const deliver = (clockMs: number, player: MapPlayer | null, warpSerial: number | null = null, view: Projection['player'] = base.player) => {
      context.clock.now = clockMs;
      const projection = projectionDouble(base, ++tick, { map: Object.freeze({ readiness: 'ready' as const, player }), player: Object.freeze({ ...view }) });
      const render = run.renderFrame();
      const current = Object.freeze({ ...render.current, warp: warpSerial === null ? null : { ...WARP, serial: warpSerial } });
      context.recorded.frames[0].listener(Object.freeze({ ...frameDouble(run, projection), render: Object.freeze({ ...render, current }) }));
    };
    const closed = Object.freeze({ state: 'closed' as const, destination: open.destination!.position, markerEntityId: open.markerEntityId, warpRequest: open.warpRequest });
    return { ...context, base, open, closed, log, deliver };
  }

  const WARP: RenderWarp = Object.freeze({ serial: 1, progress: 0, segments: 1, fraction: 0, length: 1, path: Object.freeze([]) });

  it('samples an open map whose cursor, costs and contacts change, and the same destination in a new object', () => {
    const { open, log, deliver } = mapDoubles();
    const position = open.destination!.position;
    deliver(1010, Object.freeze({
      ...open,
      cursor: Object.freeze({ ...open.cursor, pixel: Object.freeze({ column: 1, row: 1 }) }),
      cursorCost: Object.freeze({ cost: 9, energy: 9, percent: 100 }),
      contacts: Object.freeze([]),
      destination: Object.freeze({ ...open.destination!, position: Object.freeze({ ...position }), cost: Object.freeze({ cost: 1, energy: 9, percent: 11 }) }),
    }));
    expect(log).toEqual([]);
    deliver(1100, open);
    expect(log).toHaveLength(1);
  });

  it.each<[string, (parts: ReturnType<typeof mapDoubles>) => readonly [MapPlayer | null, number | null]]>([
    ['the map closing', ({ closed }) => [closed, null]],
    ['the map losing its player', () => [null, null]],
    ['a new destination', ({ open }) => [{ ...open, destination: { ...open.destination!, position: { ...open.destination!.position, z: 1 } } }, null]],
    ['a cleared destination', ({ closed }) => [{ ...closed, destination: null }, null]],
    ['the marker', ({ open }) => [{ ...open, markerEntityId: null }, null]],
    ['the Warp gate\'s result', ({ open }) => [{ ...open, warpRequest: { accepted: false, reason: 'cooldown' } }, null]],
    ['the Warp gate\'s reason', ({ open }) => [{ ...open, warpRequest: { accepted: false, reason: 'insufficient-energy' } }, null]],
    ['the Warp view\'s transit', ({ open }) => [open, 1]],
  ])('publishes %s at once, then samples again from it', (_, change) => {
    const parts = mapDoubles();
    const [player, serial] = change(parts);
    parts.deliver(1010, player, serial);
    expect(parts.log).toEqual([[4, 1010]]);
    parts.deliver(1109, player, serial);
    expect(parts.log).toEqual([[4, 1010]]);
    parts.deliver(1110, player, serial);
    expect(parts.log).toEqual([[4, 1010], [6, 1110]]);
  });

  it('publishes view mode 1 at once, though the interaction context and the serial stay', () => {
    const { open, log, deliver, base } = mapDoubles();
    deliver(1010, open, null, { ...base.player, viewMode: 0, interactionContext: 'warp' });
    deliver(1020, open, null, { ...base.player, viewMode: 1, interactionContext: 'warp' });
    deliver(1030, open, null, { ...base.player, viewMode: 1, interactionContext: 'warp' });
    expect(log).toEqual([[4, 1010], [5, 1020]]);
  });

  it('publishes a new Warp transit\'s serial at once, though the view stays in the Warp', () => {
    const { open, log, deliver } = mapDoubles();
    deliver(1010, open, 1);
    deliver(1020, open, 2);
    deliver(1030, open, 2);
    expect(log).toEqual([[4, 1010], [5, 1020]]);
  });
});
