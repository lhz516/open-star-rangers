vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => injection.wrap(() => original.createWorld(input)) };
});
vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => injection.wrap(() => original.createRecordingSession(input, options)),
  };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { CoreFaultError, CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions } from '../../core/replay/recording.ts';
import { replayRecord } from '../../core/replay/replay.ts';
import { contentOf } from '../../core/replay/replay.test-support.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { GameRuntimeError } from '../runtime/runtime-errors.ts';
import { NEUTRAL_AXES, recordingOptions, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { GameCommandsCancelled, GameSession, GameSessionRun } from './game-session.ts';
import { current, departure, runSpec, sessionSetup } from './game-session.test-support.ts';

// Core faults and recording refusals are injected only where the tests create the world: the mocked creation entries
// wrap the real Core world or recording session and can replace one chosen call. The Session and Runtime have no
// injection point.

const injection = vi.hoisted(() => {
  const calls = new Map<string, number>();
  let armed: { method: string; nth: number; replace: (real: () => unknown) => unknown } | null = null;
  const call = (method: string, real: () => unknown): unknown => {
    const count = (calls.get(method) ?? 0) + 1;
    calls.set(method, count);
    if (armed?.method === method && armed.nth === count) return armed.replace(real);
    return real();
  };
  return {
    createFailure: undefined as unknown,
    /** Counts calls from now on; the `nth` call of `method` runs `replace`, which may call the real method. */
    arm(method: string, nth: number, replace: (real: () => unknown) => unknown) {
      calls.clear();
      armed = { method, nth, replace };
    },
    calls: (method: string) => calls.get(method) ?? 0,
    reset() {
      calls.clear();
      armed = null;
      this.createFailure = undefined;
    },
    wrap<World extends object>(create: () => World): World {
      if (this.createFailure !== undefined) throw this.createFailure;
      const target = create() as unknown as Record<string, (...args: unknown[]) => unknown>;
      const wrapped: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ['step', 'projection', 'renderState', 'snapshot', 'exportRecording']) {
        if (typeof target[method] === 'function') wrapped[method] = (...args) => call(method, () => target[method](...args));
      }
      return wrapped as unknown as World;
    },
  };
});

afterEach(() => { injection.reset(); });

const fault = (site: string) => new CoreFaultError('invariant-violated', site);
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const stateError = (operation: string, phase: string) => expect.objectContaining({ kind: 'invalid-state', operation, phase });

/** A recording run anchored at time 0, with fire held and `queued` launch commands (IDs 1…queued), 63 taken per tick. */
function prepared(queued: number) {
  const spec = runSpec({ recording: recordingOptions(1) });
  const setup = sessionSetup();
  setup.session.control({ type: 'start', spec });
  const run = current(setup.session);
  const log: string[] = [], notices: GameCommandsCancelled[] = [];
  run.onCommandsCancelled((notice) => { notices.push(notice); log.push(`cancel:${notice.reason}`); });
  run.onFrame((frame) => { log.push(`frame:${frame.phase}:${JSON.stringify(frame.report)}`); });
  setup.session.onStatus((status) => { log.push(`status:${status.phase}`); });
  setup.host.deliver(0);
  log.length = 0;
  run.setIntent({ axes: NEUTRAL_AXES, primaryFire: true });
  for (let index = 0; index < queued; index++) run.submitCommand({ type: 'launch' });
  return { ...setup, spec, run, log, notices };
}

/** Faulted: the cached read model only; no new Core read, input or control but exit and dispose. */
function expectFaulted(session: GameSession, run: GameSessionRun, tick: number) {
  expect(session.status()).toMatchObject({ phase: 'faulted', pauseReason: null, transition: null, resumeRequired: false, stopReason: null });
  expect(run.projection().clock.tick).toBe(tick);
  expect(run.renderFrame()).toMatchObject({ alpha: 0, current: { tick } });
  expect(run.renderFrame().previous).toBe(run.renderFrame().current);
  const steps = injection.calls('step'), snapshots = injection.calls('snapshot'), exports = injection.calls('exportRecording');
  expect(() => run.snapshot()).toThrowError(stateError('snapshot', 'faulted'));
  expect(() => run.exportRecording()).toThrowError(stateError('exportRecording', 'faulted'));
  expect(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: false }); }).toThrowError(stateError('setIntent', 'faulted'));
  expect(() => run.submitCommand({ type: 'launch' })).toThrowError(stateError('submitCommand', 'faulted'));
  for (const control of [{ type: 'start', spec: runSpec() }, { type: 'pause' }, { type: 'resume' }, { type: 'complete-departure', runId: 1 }, { type: 'clear-input', reason: 'focus-loss' }] as const) {
    expect(() => { session.control(control); }).toThrowError(stateError(control.type, 'faulted'));
  }
  expect([injection.calls('step'), injection.calls('snapshot'), injection.calls('exportRecording')]).toEqual([steps, snapshots, exports]);
}

describe('session faults', () => {
  it.each<[string, number, (cause: unknown) => (real: () => unknown) => unknown, number, number]>([
    ['the first step', 1, (cause) => () => { throw cause; }, 63, 0],
    ['a later step, after it ran', 2, (cause) => (real) => { real(); throw cause; }, 126, 1],
  ])('a Core fault in %s faults the run: no frame, the queue cancelled, the unconfirmed IDs never cancelled', (_name, nth, replace, unconfirmed, tick) => {
    const { session, host, run, log, notices, errors } = prepared(150);
    const cause = fault('test.step');
    injection.arm('step', nth, replace(cause));
    host.deliver(3 * TICK_MS);
    expect(log).toEqual(['cancel:failure', 'status:faulted']);
    expect(notices).toEqual([{ runId: 1, commandIds: ids(unconfirmed + 1, 150), reason: 'failure' }]);
    expect(errors).toHaveLength(1);
    const runtimeError = errors[0].failures?.[0].cause;
    expect(errors[0].failures).toEqual([{ phase: 'runtime', cause: expect.any(GameRuntimeError) }]);
    expect(runtimeError).toMatchObject({ kind: 'faulted', cause, unconfirmed: ids(1, unconfirmed) });
    expect(session.status().error).toBe(errors[0]);
    expect(host.pending.size).toBe(0);
    expectFaulted(session, run, tick);
    session.control({ type: 'exit' });
    expect(notices).toHaveLength(1);
    session.control({ type: 'start', spec: runSpec() });
    expect(session.status()).toMatchObject({ phase: 'running', runId: 2, error: null });
  });

  it('a snapshot that finds a Core fault faults the run and throws to its caller', () => {
    const { session, host, run, notices, errors } = prepared(2);
    host.deliver(TICK_MS);
    run.submitCommand({ type: 'launch' });
    const cause = fault('test.snapshot');
    injection.arm('snapshot', 1, () => { throw cause; });
    const error = thrownBy(() => run.snapshot());
    expect(error).toMatchObject({ kind: 'operation-failed', failures: [{ phase: 'runtime', cause: expect.objectContaining({ kind: 'faulted', cause, unconfirmed: [] }) }] });
    expect(session.status().error).toBe(error);
    expect(errors).toEqual([]);
    expect(notices).toEqual([{ runId: 1, commandIds: [3], reason: 'failure' }]);
    expect(host.pending.size).toBe(0); expect(host.cancelled).toHaveLength(1);
    expectFaulted(session, run, 1);
  });

  it('an export by a frame consumer that finds a Core fault faults the run after the frame, through onError', () => {
    const { session, host, run, errors } = prepared(0);
    const cause = fault('test.exportRecording');
    let seen: unknown;
    run.onFrame(() => { seen = thrownBy(() => run.exportRecording()); });
    injection.arm('exportRecording', 1, () => { throw cause; });
    host.deliver(TICK_MS);
    expect(seen).toMatchObject({ kind: 'operation-failed', failures: [{ phase: 'runtime' }] });
    expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([{ phase: 'runtime', cause: expect.objectContaining({ kind: 'faulted', cause }) }]);
    expectFaulted(session, run, 1);
  });

  it('a snapshot during event delivery is refused without faulting', () => {
    const { session, host, run, errors } = prepared(1);
    let seen: unknown;
    run.on('command-result', () => { seen = thrownBy(() => run.snapshot()); });
    host.deliver(TICK_MS);
    expect(seen).toMatchObject({ kind: 'invalid-state', operation: 'snapshot', phase: 'running', reason: 'unavailable during event delivery' });
    expect(errors).toEqual([]); expect(session.status().phase).toBe('running');
  });

  it('a Core fault creating the world keeps idle and reports a runtime failure', () => {
    const { session, host, errors } = sessionSetup();
    const cause = fault('test.create');
    injection.createFailure = cause;
    expect(() => { session.control({ type: 'start', spec: runSpec({ initialTransition: departure() }) }); })
      .toThrowError(expect.objectContaining({ kind: 'operation-failed', failures: [{ phase: 'runtime', cause }] }));
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null, error: { failures: [{ phase: 'runtime', cause }] } });
    expect(session.currentRun()).toBeNull();
    expect([host.pending.size, host.listeners.size, errors.length]).toEqual([0, 1, 0]);
    injection.createFailure = undefined;
    session.control({ type: 'start', spec: runSpec() });
    expect(session.status()).toMatchObject({ phase: 'running', runId: 1, error: null });
  });
});

describe('recording-capacity stop', () => {
  const refusal = () => new CoreInputError('recording', 'would exceed 131072 recorded ticks');

  it('reports the frame\'s earlier ticks, then cancels once, sends a still frame and stops; the run stays exportable', () => {
    const { session, host, run, spec, log, notices, errors } = prepared(200);
    const delivered: DomainEvent[] = [];
    let refused: unknown;
    run.on('command-result', (event) => {
      delivered.push(event);
      refused ??= thrownBy(() => run.submitCommand({ type: 'launch' }));
    });
    injection.arm('step', 3, () => { throw refusal(); });
    host.deliver(5 * TICK_MS);
    expect(log).toEqual([
      `frame:running:${JSON.stringify({ ticks: 2, capped: false, stop: 'recording-capacity', cut: null, transitions: [] })}`,
      'cancel:recording-capacity', 'frame:stopped:null', 'status:stopped',
    ]);
    expect(new Set(delivered.map((event) => event.tick))).toEqual(new Set([1, 2]));
    expect(refused).toMatchObject({ kind: 'invalid-state', operation: 'submitCommand', phase: 'running', reason: 'recording-capacity' });
    expect(notices).toEqual([{ runId: 1, commandIds: ids(127, 200), reason: 'recording-capacity' }]);
    expect(session.status()).toMatchObject({ phase: 'stopped', runId: 1, stopReason: 'recording-capacity', pauseReason: null, error: null });
    expect(errors).toEqual([]);
    expect(host.pending.size).toBe(0);
    expect(run.renderFrame()).toMatchObject({ alpha: 0, current: { tick: 2 } });
    expect(run.snapshot().state.tick).toBe(2);
    const exported = run.exportRecording();
    if (!exported) throw new Error('expected a recording');
    expect(exported.record.ticks).toHaveLength(2);
    expect(replayRecord(JSON.parse(JSON.stringify(exported.record)), contentOf(spec as never))).toEqual(exported.result);
    expect(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: false }); }).toThrowError(stateError('setIntent', 'stopped'));
    expect(() => run.submitCommand({ type: 'launch' })).toThrowError(stateError('submitCommand', 'stopped'));
    for (const control of [{ type: 'start', spec: runSpec() }, { type: 'pause' }, { type: 'resume' }, { type: 'complete-departure', runId: 1 }, { type: 'clear-input', reason: 'focus-loss' }] as const) {
      expect(() => { session.control(control); }).toThrowError(stateError(control.type, 'stopped'));
    }
    host.emit({ type: 'visibility', visibility: 'hidden' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(session.status()).toMatchObject({ phase: 'stopped', environmentVisible: true });
    expect(injection.calls('step')).toBe(3);
    const text = JSON.stringify(exported);
    session.control({ type: 'exit' });
    expect(notices).toHaveLength(1);
    expect(session.status()).toMatchObject({ phase: 'idle', stopReason: null });
    expect(JSON.stringify(exported)).toBe(text);
  });

  it.each([
    ['a domain receiver', (run: GameSessionRun) => { run.on('command-result', () => { throw new Error('receiver'); }); }],
    ['a frame consumer on the report', (run: GameSessionRun) => { run.onFrame((frame) => { if (frame.report?.stop) throw new Error('frame'); }); }],
  ])('a failure of %s in the stopping frame faults the run instead of stopping it', (_name, fail) => {
    const { session, host, run, log, notices, errors } = prepared(100);
    fail(run);
    injection.arm('step', 2, () => { throw refusal(); });
    host.deliver(3 * TICK_MS);
    expect(log.filter((entry) => !entry.startsWith('frame:running'))).toEqual(['cancel:failure', 'status:faulted']);
    expect(notices).toEqual([{ runId: 1, commandIds: ids(64, 100), reason: 'failure' }]);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause: expect.anything() }]);
    expectFaulted(session, run, 1);
  });

  it('a failure in the stop\'s own notices faults the stopped run', () => {
    const { session, host, run, log, errors } = prepared(100);
    const cause = new Error('notice');
    run.onCommandsCancelled((notice) => { if (notice.reason === 'recording-capacity') throw cause; });
    injection.arm('step', 2, () => { throw refusal(); });
    host.deliver(3 * TICK_MS);
    expect(log).toEqual([
      `frame:running:${JSON.stringify({ ticks: 1, capped: false, stop: 'recording-capacity', cut: null, transitions: [] })}`,
      'cancel:recording-capacity', 'frame:stopped:null', 'status:faulted',
    ]);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause }]);
    expectFaulted(session, run, 1);
  });

  it('an exit requested in the stopping frame still ends the run after the stop', () => {
    const { session, host, run, log, notices } = prepared(100);
    run.onFrame((frame) => { if (frame.report?.stop) session.control({ type: 'exit' }); });
    injection.arm('step', 2, () => { throw refusal(); });
    host.deliver(3 * TICK_MS);
    expect(log.slice(1)).toEqual(['cancel:recording-capacity', 'frame:stopped:null', 'status:stopped', 'status:idle']);
    expect(notices).toHaveLength(1);
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null, stopReason: null });
    expect(() => run.exportRecording()).toThrowError(expect.objectContaining({ kind: 'invalid-state', reason: 'run has ended' }));
  });
});

