import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { CoreInputError } from '../../core/errors.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { COMMAND_QUEUE_LIMIT } from '../runtime/game-runtime.ts';
import { NEUTRAL_AXES, recordingOptions, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { createGameSession, type GameCommandsCancelled, type GameSession, type GameSessionControl, type GameSessionFrame, type GameSessionRun } from './game-session.ts';
import { current, departure, runSpec, sessionSetup, started } from './game-session.test-support.ts';
import type { SessionHost } from './session-host.ts';
import { ControlledHost } from './session-host.test-support.ts';

const tickOf = (run: GameSessionRun) => run.projection().clock.tick;
const stateError = (operation: string, phase: string) => expect.objectContaining({ kind: 'invalid-state', operation, phase });
const TRANSITION = 'control.spec.initialTransition';

function expectNoRunInputs(run: GameSessionRun, phase: string) {
  expect(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: true }); }).toThrowError(stateError('setIntent', phase));
  expect(() => run.submitCommand({ type: 'launch' })).toThrowError(stateError('submitCommand', phase));
}

describe('session creation and start', () => {
  it('is idle with one host subscription, no world or request, and a frozen status', () => {
    const { host, session } = sessionSetup();
    expect(session.status()).toEqual({
      phase: 'idle', runId: null, environmentVisible: true, pauseReason: null, transition: null,
      resumeRequired: false, stopReason: null, result: null, cleanupFailed: false, error: null,
    });
    expect(Object.isFrozen(session.status())).toBe(true);
    expect(session.currentRun()).toBeNull();
    expect([host.listeners.size, host.pending.size]).toEqual([1, 0]);
    session.control({ type: 'dispose' }); session.control({ type: 'dispose' });
    expect([host.listeners.size, host.unsubscribed]).toEqual([0, 1]);
    expect(session.status().phase).toBe('disposed');
    expect(() => { session.control({ type: 'start', spec: runSpec() }); }).toThrowError(stateError('start', 'disposed'));
  });

  it('validates the host and the error outlet, and reports a failed subscription without a listener', () => {
    expect(() => createGameSession(null!, () => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'host' }));
    expect(() => createGameSession({} as SessionHost, () => undefined)).toThrowError(expect.objectContaining({ path: 'host.requestFrame' }));
    expect(() => createGameSession(new ControlledHost(), undefined!)).toThrowError(expect.objectContaining({ path: 'onError' }));
    const host = new ControlledHost(), cause = new Error('subscribe');
    host.subscribeFailure = cause;
    expect(() => createGameSession(host, () => undefined)).toThrowError(expect.objectContaining({ kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }] }));
    expect([host.listeners.size, host.pending.size]).toEqual([0, 0]);
  });

  it.each<[unknown, string]>([
    [null, 'control'], [[], 'control'], ['start', 'control'], [{}, 'control.type'], [{ type: 'restart' }, 'control.type'],
    [{ type: 'pause', extra: 1 }, 'control'], [{ type: 'start' }, 'control.spec'], [{ type: 'start', spec: null }, 'control.spec'],
    [{ type: 'complete-departure' }, 'control.runId'], [{ type: 'complete-departure', runId: 0 }, 'control.runId'],
    [{ type: 'complete-departure', runId: 1.5 }, 'control.runId'], [{ type: 'complete-departure', runId: '1' }, 'control.runId'],
    [{ type: 'clear-input' }, 'control.reason'], [{ type: 'clear-input', reason: 'blur' }, 'control.reason'],
  ])('rejects the control %j at %s', (value, path) => {
    const { session, host } = sessionSetup();
    expect(() => { session.control(value as GameSessionControl); }).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path }));
    expect(session.status().phase).toBe('idle'); expect(host.pending.size).toBe(0);
  });

  it.each<[string, (spec: Record<string, unknown>) => void, string]>([
    ['an extra field', (spec) => { spec.extra = 1; }, 'control.spec'],
    ['no departure field', (spec) => { delete spec.initialTransition; }, `${TRANSITION}`],
    ['another gap', (spec) => { spec.initialTransition = { gap: 'G-02/1', variant: 'solo' }; }, `${TRANSITION}.gap`],
    ['an unknown variant', (spec) => { spec.initialTransition = { gap: 'G-02/2', variant: 'both' }; }, `${TRANSITION}.variant`],
    ['a departure with extra fields', (spec) => { spec.initialTransition = { ...departure(), at: 0 }; }, TRANSITION],
    ['a step', (spec) => { spec.run = { ...(spec.run as object), clockUnitsPerTick: 2 }; }, 'control.spec.run.clockUnitsPerTick'],
    ['an accessor run', (spec) => { Object.defineProperty(spec, 'run', { enumerable: true, get: () => { throw new Error('read'); } }); }, 'control.spec'],
    ['an accessor in the run', (spec) => {
      Object.defineProperty(spec.run, 'seed', { enumerable: true, get: () => { throw new Error('read'); } });
    }, 'control.spec.run'],
  ])('rejects a spec with %s before any world exists', (_name, change, path) => {
    const { session, host } = sessionSetup();
    const spec = runSpec() as unknown as Record<string, unknown>;
    change(spec);
    expect(() => { session.control({ type: 'start', spec: spec as never }); }).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path }));
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null, error: null });
    expect(host.pending.size).toBe(0);
    session.control({ type: 'start', spec: runSpec() });
    expect(session.status()).toMatchObject({ phase: 'running', runId: 1 });
  });

  it.each<[string, (spec: Record<string, unknown>) => void, new (...args: never[]) => Error]>([
    ['a wingman outside the roster', (spec) => { spec.run = { ...(spec.run as object), wingman: 5 }; }, CoreInputError],
    ['a step-less but invalid seed', (spec) => { spec.run = { ...(spec.run as object), seed: -1 }; }, CoreInputError],
    ['malformed recording options', (spec) => { spec.recording = { producer: '', checkpointInterval: 1 }; }, CoreInputError],
    ['malformed mission content', (spec) => { spec.mission = { ...(spec.mission as object), content: {} }; }, ContentContractError],
  ])('keeps idle when world creation refuses %s, reporting Core\'s error as the cause', (_name, change, type) => {
    const { session, host, errors } = sessionSetup();
    const spec = runSpec() as unknown as Record<string, unknown>;
    change(spec);
    const error = thrownBy(() => { session.control({ type: 'start', spec: spec as never }); });
    expect(error).toMatchObject({ kind: 'invalid-argument', path: 'control.spec', cause: expect.any(type) });
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null, error: null });
    expect([host.pending.size, errors.length]).toEqual([0, 0]);
    session.control({ type: 'start', spec: runSpec() });
    expect(session.status().runId).toBe(1);
  });

  it.each([[null, 'wingman'], [2, 'solo']] as const)('refuses a departure whose variant does not match wingman %s', (wingman, variant) => {
    const { session, host } = sessionSetup();
    expect(() => { session.control({ type: 'start', spec: runSpec({ run: { wingman }, initialTransition: departure(variant) }) }); })
      .toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: `${TRANSITION}.variant` }));
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null }); expect(host.pending.size).toBe(0);
  });

  it('accepts start only in idle: a second start never creates another world', () => {
    const { session, host, run } = started({ initialTransition: departure() });
    const attempt = () => thrownBy(() => { session.control({ type: 'start', spec: runSpec() }); });
    expect(attempt()).toMatchObject({ kind: 'invalid-state', operation: 'start', phase: 'transition', runId: 1 });
    session.control({ type: 'complete-departure', runId: 1 }); host.deliver(0); host.deliver(2 * TICK_MS);
    expect(attempt()).toMatchObject({ phase: 'running', runId: 1 });
    session.control({ type: 'pause' });
    expect(attempt()).toMatchObject({ phase: 'paused', runId: 1 });
    expect(current(session)).toBe(run); expect(tickOf(run)).toBe(2); expect(host.pending.size).toBe(0);
  });

  it('gives each run a new ID and a fresh world, and retires the old handle', () => {
    const { session, host, run: old } = started();
    expect(old.runId).toBe(1); expect(Object.isFrozen(old)).toBe(true);
    expect(old.submitCommand({ type: 'launch' })).toBe(1);
    host.deliver(0); host.deliver(3 * TICK_MS);
    expect(tickOf(old)).toBe(3);
    session.control({ type: 'exit' }); session.control({ type: 'start', spec: runSpec() });
    const next = current(session);
    expect(next.runId).toBe(2); expect(tickOf(next)).toBe(0);
    expect(next.submitCommand({ type: 'launch' })).toBe(1);
    for (const action of [
      () => old.projection(), () => old.renderFrame(), () => old.snapshot(), () => old.exportRecording(),
      () => { old.setIntent({ axes: NEUTRAL_AXES, primaryFire: false }); }, () => old.submitCommand({ type: 'launch' }),
      () => old.onAny(() => undefined), () => old.on('command-result', () => undefined), () => old.onFrame(() => undefined),
      () => old.onCommandsCancelled(() => undefined), () => old.ownCleanup(() => undefined),
    ]) expect(action).toThrowError(expect.objectContaining({ kind: 'invalid-state', reason: 'run has ended' }));
    session.control({ type: 'exit' }); session.control({ type: 'start', spec: runSpec() });
    expect(current(session).runId).toBe(3);
  });

  it.each(['pause', 'resume'] as const)('rejects %s in idle', (type) => {
    const { session } = sessionSetup();
    expect(() => { session.control({ type }); }).toThrowError(expect.objectContaining({ kind: 'invalid-state', operation: type, phase: 'idle', runId: null }));
  });

  it('rejects departure completion and input clearing without a run', () => {
    const { session } = sessionSetup();
    expect(() => { session.control({ type: 'complete-departure', runId: 1 }); }).toThrowError(stateError('complete-departure', 'idle'));
    expect(() => { session.control({ type: 'clear-input', reason: 'focus-loss' }); }).toThrowError(stateError('clear-input', 'idle'));
  });

  it('applies idempotent controls without extra requests or statuses', () => {
    const { host, session } = sessionSetup(), phases: string[] = [];
    session.onStatus((status) => { phases.push(status.phase); });
    session.control({ type: 'exit' }); session.control({ type: 'start', spec: runSpec() });
    session.control({ type: 'resume' });
    expect(host.pending.size).toBe(1);
    session.control({ type: 'pause' }); session.control({ type: 'pause' });
    expect(host.pending.size).toBe(0);
    session.control({ type: 'resume' }); session.control({ type: 'exit' }); session.control({ type: 'exit' });
    session.control({ type: 'dispose' }); session.control({ type: 'dispose' });
    expect(phases).toEqual(['running', 'paused', 'running', 'idle', 'disposed']);
    expect(() => session.onStatus(() => undefined)).toThrowError(stateError('onStatus', 'disposed'));
  });

  it('copies a queued start\'s spec when it is submitted', () => {
    const { session, host, run } = started();
    run.onFrame(() => {
      const spec = runSpec({ initialTransition: departure() });
      const runConfig = spec.run as { wingman: number | null; seed: number };
      session.control({ type: 'exit' });
      session.control({ type: 'start', spec });
      (spec as { initialTransition: unknown }).initialTransition = null;
      runConfig.wingman = 2; runConfig.seed = 7;
    });
    host.deliver(0);
    expect(session.status()).toMatchObject({ phase: 'transition', runId: 2, transition: departure() });
    const next = current(session);
    expect(next.projection().mission.wingman).toBeNull();
    expect(next.snapshot().state.config.seed).toBe(runSpec().run.seed);
  });
});

describe('initial departure hold', () => {
  it('exposes only the contracted run handle: no per-tick hook, Core or Runtime access', () => {
    const { run } = started({ initialTransition: departure() });
    expect(Object.keys(run)).toEqual(['runId']);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(run)).sort()).toEqual([
      'constructor', 'exportRecording', 'on', 'onAny', 'onCommandsCancelled', 'onFrame', 'ownCleanup', 'projection',
      'renderFrame', 'setIntent', 'snapshot', 'submitCommand',
    ]);
  });

  it('holds a new run at tick 0 without frames or input, and lets the owner wire consumers', () => {
    const { session, host, run } = started({ initialTransition: departure() });
    expect(session.status()).toMatchObject({ phase: 'transition', runId: 1, transition: departure(), resumeRequired: false, pauseReason: null });
    expect(Object.isFrozen(session.status().transition)).toBe(true);
    expect(host.pending.size).toBe(0);
    expect(run.renderFrame()).toMatchObject({ alpha: 0, current: { tick: 0 } });
    expect(run.renderFrame().previous).toBe(run.renderFrame().current);
    expect(tickOf(run)).toBe(0); expect(run.snapshot().state.tick).toBe(0);
    expectNoRunInputs(run, 'transition');
    for (const type of ['pause', 'resume'] as const) expect(() => { session.control({ type }); }).toThrowError(stateError(type, 'transition'));
    const frames: GameSessionFrame[] = [], events: DomainEvent[] = [];
    run.onFrame((frame) => { frames.push(frame); });
    run.onAny((event) => { events.push(event); });
    run.ownCleanup(() => undefined);
    session.control({ type: 'clear-input', reason: 'focus-loss' });
    expect(frames).toEqual([]);
    session.control({ type: 'complete-departure', runId: 1 });
    expect(session.status()).toMatchObject({ phase: 'running', transition: null, resumeRequired: false });
    expect(host.pending.size).toBe(1);
    host.deliver(5000);
    expect(frames).toEqual([expect.objectContaining({ runId: 1, phase: 'running', report: { ticks: 0, capped: false, stop: null, cut: null, transitions: [], completion: null } })]);
    expect(tickOf(run)).toBe(0);
    host.deliver(5000 + TICK_MS);
    expect(tickOf(run)).toBe(1); expect(events.length).toBeGreaterThan(0);
  });

  it('completes only the current hold, once', () => {
    const { session, host } = started({ initialTransition: departure() });
    expect(() => { session.control({ type: 'complete-departure', runId: 2 }); }).toThrowError(stateError('complete-departure', 'transition'));
    expect(session.status().phase).toBe('transition');
    session.control({ type: 'complete-departure', runId: 1 });
    expect(() => { session.control({ type: 'complete-departure', runId: 1 }); }).toThrowError(stateError('complete-departure', 'running'));
    expect(host.pending.size).toBe(1);
    session.control({ type: 'exit' });
    session.control({ type: 'start', spec: runSpec({ initialTransition: departure() }) });
    expect(() => { session.control({ type: 'complete-departure', runId: 1 }); }).toThrowError(expect.objectContaining({ phase: 'transition', runId: 2 }));
    session.control({ type: 'exit' });
    expect(() => { session.control({ type: 'complete-departure', runId: 2 }); }).toThrowError(stateError('complete-departure', 'idle'));
    expect(host.pending.size).toBe(0);
  });

  it.each(['solo', 'wingman'] as const)('accepts the %s departure for the matching selection', (variant) => {
    const { session, run } = started({ run: { wingman: variant === 'solo' ? null : 4 }, initialTransition: departure(variant) });
    expect(session.status().transition).toEqual({ gap: 'G-02/2', variant });
    expect(run.projection().mission.wingman).toBe(variant === 'solo' ? null : 4);
  });

  it.each<[string, (host: ControlledHost) => void]>([
    ['a hidden page', (host) => { host.emit({ type: 'visibility', visibility: 'hidden' }); host.emit({ type: 'visibility', visibility: 'visible' }); }],
    ['a pagehide and pageshow', (host) => { host.emit({ type: 'pagehide' }); host.emit({ type: 'pageshow', visibility: 'visible' }); }],
  ])('after %s during the hold, a visible completion still waits for an explicit resume', (_name, hide) => {
    const { session, host, run } = started({ initialTransition: departure() });
    const frames: GameSessionFrame[] = [], statuses: unknown[] = [];
    run.onFrame((frame) => { frames.push(frame); });
    session.onStatus((status) => { statuses.push(status); });
    hide(host);
    expect(session.status()).toMatchObject({ phase: 'transition', environmentVisible: true, resumeRequired: true });
    session.control({ type: 'complete-departure', runId: 1 });
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', transition: null, resumeRequired: true, environmentVisible: true });
    expect(host.pending.size).toBe(0);
    expect(frames).toEqual([expect.objectContaining({ phase: 'paused', report: null, render: expect.objectContaining({ alpha: 0 }) })]);
    expectNoRunInputs(run, 'paused');
    session.control({ type: 'pause' });
    expect(session.status()).toMatchObject({ pauseReason: 'hidden', resumeRequired: true });
    session.control({ type: 'resume' });
    expect(session.status()).toMatchObject({ phase: 'running', pauseReason: null, resumeRequired: false });
    host.deliver(100); host.deliver(100 + TICK_MS);
    expect(tickOf(run)).toBe(1);
    expect(statuses.at(-1)).toMatchObject({ phase: 'running', resumeRequired: false });
  });

  it('latches the requirement when the run is created hidden, and when the page is hidden at completion', () => {
    const hidden = started({ initialTransition: departure() }, 'hidden');
    expect(hidden.session.status()).toMatchObject({ phase: 'transition', environmentVisible: false, resumeRequired: true });
    hidden.host.emit({ type: 'visibility', visibility: 'visible' });
    hidden.session.control({ type: 'complete-departure', runId: 1 });
    expect(hidden.session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', resumeRequired: true });
    const late = started({ initialTransition: departure() });
    late.host.visibility = 'hidden';
    late.session.control({ type: 'complete-departure', runId: 1 });
    expect(late.session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', resumeRequired: true, environmentVisible: false });
    expect(() => { late.session.control({ type: 'resume' }); }).toThrowError(stateError('resume', 'paused'));
    late.host.visibility = 'visible';
    late.session.control({ type: 'resume' });
    expect(late.session.status()).toMatchObject({ phase: 'running', resumeRequired: false });
  });

  it('ends the hold on exit, releasing its consumers, and clears the requirement', () => {
    const { session, host, run } = started({ initialTransition: departure() });
    const log: string[] = [];
    run.ownCleanup(() => { log.push('cleanup'); });
    run.onCommandsCancelled(() => { log.push('cancel'); });
    host.emit({ type: 'visibility', visibility: 'hidden' });
    session.control({ type: 'exit' });
    expect(log).toEqual(['cleanup']);
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null, transition: null, resumeRequired: false });
    expect(host.pending.size).toBe(0);
  });
});

describe('input and clearing input', () => {
  it('rejects malformed input and a full queue, keeping the run healthy', () => {
    const { session, host, run } = started();
    expect(() => { run.setIntent({ axes: { ...NEUTRAL_AXES, pitch: 2 }, primaryFire: false }); })
      .toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'intent.axes.pitch', cause: expect.any(Error) }));
    expect(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: 1 } as never); }).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'intent.primaryFire' }));
    expect(() => run.submitCommand({ type: 'launch', extra: 1 } as never)).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'command' }));
    expect(() => run.onAny(undefined!)).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'onAny.listener' }));
    expect(() => run.on('bad' as never, () => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'on.type' }));
    expect(() => run.onFrame(undefined!)).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'onFrame.listener' }));
    for (let index = 0; index < COMMAND_QUEUE_LIMIT; index++) run.submitCommand({ type: 'launch' });
    expect(() => run.submitCommand({ type: 'launch' })).toThrowError(expect.objectContaining({ kind: 'invalid-state', operation: 'submitCommand', reason: 'command-queue-full' }));
    expect(session.status()).toMatchObject({ phase: 'running', error: null }); expect(host.pending.size).toBe(1);
  });

  it.each(['focus-loss', 'pointer-lock-exit'] as const)('clears the intent and queue for %s without pausing or re-anchoring', (reason) => {
    const { session, host, run } = started({ recording: recordingOptions(1) });
    const notices: GameCommandsCancelled[] = [], frames: GameSessionFrame[] = [];
    run.onCommandsCancelled((notice) => { notices.push(notice); });
    run.onFrame((frame) => { frames.push(frame); });
    host.deliver(0);
    run.setIntent({ axes: { pitch: 1, yaw: 0, roll: 0 }, primaryFire: true });
    for (let index = 0; index < 70; index++) run.submitCommand({ type: 'target', operation: 'next' });
    host.deliver(TICK_MS);
    const snapshot = run.snapshot();
    session.control({ type: 'clear-input', reason });
    expect(notices).toEqual([{ runId: 1, commandIds: Array.from({ length: 7 }, (_, index) => 64 + index), reason }]);
    expect(Object.isFrozen(notices[0])).toBe(true); expect(Object.isFrozen(notices[0].commandIds)).toBe(true);
    expect(run.snapshot()).toEqual(snapshot);
    session.control({ type: 'clear-input', reason });
    expect(notices).toHaveLength(1);
    expect(session.status()).toMatchObject({ phase: 'running', pauseReason: null }); expect(host.pending.size).toBe(1);
    expect(frames).toHaveLength(2);
    // Not re-anchored: the next frame runs the time since the last one.
    host.deliver(3 * TICK_MS);
    expect(frames.at(-1)?.report?.ticks).toBe(2);
    const ticks = run.exportRecording()?.record.ticks ?? [];
    expect(ticks.map((input) => input.commands.length)).toEqual([64, 0, 0]);
    expect(ticks.slice(1).map((input) => input.axes)).toEqual([NEUTRAL_AXES, NEUTRAL_AXES]);
    expect(run.submitCommand({ type: 'launch' })).toBe(71);
  });

  it('treats clearing input as done while paused or holding, and refuses it once faulted or ended', () => {
    const { session, host, run, errors } = started({ initialTransition: departure() });
    const notices: unknown[] = [];
    run.onCommandsCancelled((notice) => { notices.push(notice); });
    session.control({ type: 'clear-input', reason: 'focus-loss' });
    session.control({ type: 'complete-departure', runId: 1 });
    run.submitCommand({ type: 'launch' });
    session.control({ type: 'pause' });
    session.control({ type: 'clear-input', reason: 'pointer-lock-exit' });
    expect(notices).toEqual([{ runId: 1, commandIds: [1], reason: 'user-pause' }]);
    session.control({ type: 'resume' });
    host.readFailure = new Error('read');
    host.deliver(0);
    expect(session.status().phase).toBe('faulted'); expect(errors).toHaveLength(1);
    expect(() => { session.control({ type: 'clear-input', reason: 'focus-loss' }); }).toThrowError(stateError('clear-input', 'faulted'));
  });

  it('never pauses on its own because of Core state: map, communications and launch requests keep ticks running', () => {
    const { session, host, run } = started();
    host.deliver(0);
    let now = 0;
    for (const command of [{ type: 'toggle-map' }, { type: 'communications', operation: 'open' }, { type: 'launch' }, { type: 'request-warp' }, { type: 'damage-report' }] as const) {
      run.submitCommand(command);
      now += 2 * TICK_MS;
      host.deliver(now);
    }
    expect(session.status()).toMatchObject({ phase: 'running', pauseReason: null });
    expect(tickOf(run)).toBe(10); expect(host.pending.size).toBe(1);
  });
});

describe('unique frame request and visibility', () => {
  it('rejects zero-handle stale, duplicate and reused request callbacks', () => {
    const { host, session, run } = started();
    host.reusedHandle = 0;
    // The first request already took handle 0; later ones reuse it.
    const first = host.callbacks[0];
    host.deliver(0); first(TICK_MS);
    expect(tickOf(run)).toBe(0); expect(host.pending.size).toBe(1);
    session.control({ type: 'pause' }); expect(host.cancelled).toEqual([0]);
    session.control({ type: 'resume' }); first(1000);
    host.deliver(1000); host.deliver(1000 + TICK_MS);
    expect(tickOf(run)).toBe(1);
    const old = host.callbacks.at(-1)!;
    session.control({ type: 'exit' }); session.control({ type: 'start', spec: runSpec() }); old(2000);
    expect(tickOf(current(session))).toBe(0); expect(host.pending.size).toBe(1);
    session.control({ type: 'dispose' }); old(4000); expect(host.pending.size).toBe(0);
  });

  it('pauses when hidden, also when found hidden at a frame, and never resumes on its own', () => {
    const { host, session, run } = started();
    host.deliver(0); host.visibility = 'hidden'; host.deliver(TICK_MS);
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: false, resumeRequired: false });
    expect(tickOf(run)).toBe(0);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(() => { session.control({ type: 'resume' }); }).toThrowError(stateError('resume', 'paused'));
    host.emit({ type: 'visibility', visibility: 'visible' }); expect(host.pending.size).toBe(0);
    session.control({ type: 'resume' }); expect(host.pending.size).toBe(1);
    host.emit({ type: 'pagehide' }); expect(session.status()).toMatchObject({ phase: 'paused', environmentVisible: false });
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(() => { session.control({ type: 'resume' }); }).toThrowError(stateError('resume', 'paused'));
    host.emit({ type: 'pageshow', visibility: 'visible' }); expect(host.pending.size).toBe(0);
    session.control({ type: 'resume' }); session.control({ type: 'pause' });
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(session.status().pauseReason).toBe('user');
  });

  it('starts paused (hidden) without a request when the page is hidden', () => {
    const { host, session } = started({}, 'hidden');
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', resumeRequired: false });
    expect(host.pending.size).toBe(0);
  });

  it('faults on a failed first request, keeping the read model but no new snapshot or export', () => {
    const host = new ControlledHost(), cause = new Error('request'), errors: unknown[] = [];
    const session = createGameSession(host, (error) => { errors.push(error); });
    host.requestFailure = cause;
    expect(() => { session.control({ type: 'start', spec: runSpec({ recording: recordingOptions(1) }) }); })
      .toThrowError(expect.objectContaining({ kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }] }));
    const run = current(session);
    expect(session.status()).toMatchObject({ phase: 'faulted', runId: 1, cleanupFailed: false });
    expect(tickOf(run)).toBe(0);
    expect(() => run.snapshot()).toThrowError(stateError('snapshot', 'faulted'));
    expect(() => run.exportRecording()).toThrowError(stateError('exportRecording', 'faulted'));
    expect(() => { session.control({ type: 'start', spec: runSpec() }); }).toThrowError(stateError('start', 'faulted'));
    for (const type of ['pause', 'resume'] as const) expect(() => { session.control({ type }); }).toThrowError(stateError(type, 'faulted'));
    expect([host.listeners.size, host.pending.size, errors.length]).toEqual([1, 0, 0]);
    host.requestFailure = undefined;
    session.control({ type: 'exit' }); session.control({ type: 'start', spec: runSpec() });
    expect(session.status()).toMatchObject({ phase: 'running', runId: 2, error: null }); expect(host.pending.size).toBe(1);
  });

  it.each([NaN, Infinity, -Infinity, 'bad'])('treats the host timestamp %s as a scheduler failure', (timestamp) => {
    const { host, session, run, errors } = started();
    host.deliver(timestamp as number);
    expect(errors[0].failures).toEqual([{ phase: 'scheduler', cause: expect.objectContaining({ kind: 'invalid-argument', path: 'nowMs' }) }]);
    expect(session.status().phase).toBe('faulted'); expect(tickOf(run)).toBe(0); expect(host.pending.size).toBe(0);
  });

  it('treats a backward timestamp as a scheduler failure', () => {
    const { host, session, errors } = started();
    host.deliver(1000); host.deliver(999);
    expect(errors[0].failures?.[0]).toMatchObject({ phase: 'scheduler', cause: { kind: 'invalid-argument' } });
    expect(session.status().phase).toBe('faulted');
  });

  it.each(['request', 'read'] as const)('stops rather than retrying when %s fails in a frame', (operation) => {
    const { host, session, run, errors } = started(), cause = new Error(operation);
    if (operation === 'request') host.requestFailure = cause; else host.readFailure = cause;
    host.deliver(0);
    expect(errors[0].failures).toEqual([{ phase: 'scheduler', cause }]);
    expect(session.status().phase).toBe('faulted'); expect(tickOf(run)).toBe(0); expect(host.pending.size).toBe(0);
  });

  it('rejects an invalid visibility instead of assuming visible', () => {
    const { host, session, errors } = started();
    host.readVisibility = () => 'invalid' as never;
    host.deliver(0);
    expect(errors[0].failures?.[0]).toMatchObject({ phase: 'scheduler', cause: expect.any(TypeError) });
    expect(session.status().phase).toBe('faulted');
  });

  it('invalidates the physical callback even if cancelling it throws, and blocks further starts', () => {
    const { host, session, run, errors } = started(), cause = new Error('cancel'), late = host.callbacks[0];
    host.cancelFailure = cause;
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(errors).toHaveLength(1); expect(errors[0].failures).toEqual([{ phase: 'scheduler', cause }]);
    expect(session.status()).toMatchObject({ phase: 'faulted', cleanupFailed: true });
    expect(host.pending.size).toBe(1);
    late(1000); host.deliver(1000 + TICK_MS);
    expect(tickOf(run)).toBe(0); expect(host.pending.size).toBe(0);
    session.control({ type: 'exit' });
    expect(session.status()).toMatchObject({ phase: 'idle', cleanupFailed: true });
    expect(() => { session.control({ type: 'start', spec: runSpec() }); }).toThrowError(expect.objectContaining({ kind: 'invalid-state', reason: 'cleanup previously failed' }));
    host.cancelFailure = undefined; session.control({ type: 'dispose' });
    expect(host.listeners.size).toBe(0); expect(host.cancelled).toHaveLength(1);
  });
});

function checkTypes(run: GameSessionRun, session: GameSession) {
  // @ts-expect-error No manual simulation capability escapes.
  run.frame(0);
  // @ts-expect-error Neither Core nor the Runtime is public.
  void run.world; void run.runtime;
  // @ts-expect-error There is no per-tick detector.
  run.onTick(() => undefined);
  // @ts-expect-error Consumers cannot publish events.
  run.dispatch([]);
  // @ts-expect-error Frame notifications are synchronous.
  run.onFrame(async () => undefined);
  // @ts-expect-error There is no restart: exit, configure and start again.
  session.control({ type: 'restart' });
  // @ts-expect-error start carries its spec.
  session.control({ type: 'start' });
  // @ts-expect-error Only focus loss and a Pointer Lock exit clear input.
  session.control({ type: 'clear-input', reason: 'user' });
  // @ts-expect-error The initial hold is G-02/2 only.
  session.control({ type: 'start', spec: { ...runSpec(), initialTransition: { gap: 'G-02/1', variant: 'solo' } } });
}
void checkTypes;
