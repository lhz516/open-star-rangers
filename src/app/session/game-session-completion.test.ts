vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const { wrapWorld } = await import('../runtime/transition-injection.test-support.ts');
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import type { EndingGap } from '../../core/projections/projection.ts';
import { completedRun } from '../../core/replay/recording.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { NEUTRAL_AXES, recordingOptions, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { SUCCESS_COMPLETION_TICK, successSpec, thirdLossSpec } from '../runtime/mission-end.test-support.ts';
import { injectedResult, injection, type InjectedGap, type InjectedResult } from '../runtime/transition-injection.test-support.ts';
import type { GameSession, GameSessionControl, GameSessionFrame, GameSessionRun } from './game-session.ts';
import { current, runSpec, sessionSetup, started } from './game-session.test-support.ts';
import type { GameSessionError } from './session-errors.ts';

// P3-11 AC-11, the Session part (docs/plan/p3/04/spec.md, 终局与救援衔接（P3-11 的修订）): the rescue holds G-02/5 and
// G-02/6 reuse the running hold; a frame cut at the run's last tick enters `completed` at a safe point (unexecuted
// commands cancelled once for `mission-complete`, two frames folded, the result frozen, a still frame), whose ending
// placeholders end one by one by their own credentials and never resume the run. Faults and exits queued before the
// completion outrank it. Real synthetic runs reach the completion and the rescues from their inputs; injected ones
// (transition-injection.test-support.ts) cover the rest.

afterEach(() => { injection.reset(); });

type Log = string[];

/** Logs the run's frames as `frame:<phase>:<ticks|null>[:<cut>]`, its cancellations and the session's status phases. */
function observe(session: GameSession, run: GameSessionRun, log: Log, frames: GameSessionFrame[] = []): void {
  run.onFrame((frame) => {
    frames.push(frame);
    log.push(`frame:${frame.phase}:${frame.report === null ? 'null' : `${frame.report.ticks}${frame.report.cut ? `:${frame.report.cut}` : ''}`}`);
  });
  run.onCommandsCancelled(({ commandIds, reason }) => { log.push(`cancel:${reason}:${commandIds.join(',')}`); });
  session.onStatus((status) => { log.push(`status:${status.phase}`); });
}

/** A running Session anchored at time 0, observed; the next step completes with `result` after `plan`'s transitions. */
function completing(step: number, result: InjectedResult, plan: Readonly<Record<number, readonly InjectedGap[]>> = {}) {
  const setup = started();
  const log: Log = [];
  const frames: GameSessionFrame[] = [];
  observe(setup.session, setup.run, log, frames);
  setup.host.deliver(0);
  injection.plan(plan);
  injection.complete(step, result);
  log.length = 0;
  frames.length = 0;
  return { ...setup, log, frames };
}

const SOLO: EndingGap = { gap: 'G-02/8', variant: 'solo' };
const CUTSCENE: EndingGap = { gap: 'G-02/9', row: 13 };
const complete = (session: GameSession, runId: number, transitionId: number): void => {
  session.control({ type: 'complete-transition', runId, transitionId });
};
const refusal = (work: () => void) => thrownBy(work) as GameSessionError;

/** Delivers frames of 5 ticks from `now` until the session leaves running; returns the time of the last frame. */
function deliverUntilStill(setup: { session: GameSession; host: { deliver(now: number): void } }, now: number, onFrame?: () => void): number {
  while (setup.session.status().phase === 'running') {
    now += 5 * TICK_MS;
    setup.host.deliver(now);
    onFrame?.();
  }
  return now;
}

describe('a real run\'s completion', () => {
  it('enters completed with the frozen result, the first ending placeholder and a still frame, and requests no frame', () => {
    const setup = sessionSetup();
    const { session, host } = setup;
    session.control({ type: 'start', spec: { ...successSpec(recordingOptions(32)), initialTransition: null } });
    const run = current(session);
    const log: Log = [];
    const frames: GameSessionFrame[] = [];
    observe(session, run, log, frames);
    host.deliver(0);
    deliverUntilStill(setup, 0);
    expect(log.slice(-3)).toEqual([`frame:running:${SUCCESS_COMPLETION_TICK % 5}:completed`, 'frame:completed:null', 'status:completed']);
    expect(frames.at(-2)!.report!.completion).toEqual({ tick: SUCCESS_COMPLETION_TICK, outcome: 'success' });
    const status = session.status();
    expect(status).toMatchObject({
      phase: 'completed', runId: 1, pauseReason: null, resumeRequired: false, stopReason: null, error: null,
      transition: { ...SOLO, transitionId: 1, tick: SUCCESS_COMPLETION_TICK, index: 0, count: 1 },
    });
    // The result is the completion tick's, frozen; the session reads Core no more for it.
    expect(status.result).toBe(run.projection().result);
    expect(status.result).toMatchObject({ outcome: 'success', reason: { type: 'all-clear' }, rescuesUsed: 0, endingGaps: [SOLO], completedTick: SUCCESS_COMPLETION_TICK });
    expect(Object.isFrozen(status.result) && Object.isFrozen(status.result!.endingGaps) && Object.isFrozen(status.transition)).toBe(true);
    const still = frames.at(-1)!.render;
    expect({ same: still.previous === still.current, alpha: still.alpha, tick: still.current.tick }).toEqual({ same: true, alpha: 0, tick: SUCCESS_COMPLETION_TICK });
    expect(host.pending.size).toBe(0);
    // A healthy ending: reads and the recording's export stay available, and the recording ends at the completion.
    expect(run.snapshot().state.tick).toBe(SUCCESS_COMPLETION_TICK);
    const recording = run.exportRecording()!;
    expect([recording.result.finalTick, completedRun(recording.result)]).toEqual([SUCCESS_COMPLETION_TICK, true]);
    complete(session, 1, 1);
    expect(session.status()).toMatchObject({ phase: 'completed', transition: null, result: status.result });
    expect(host.pending.size).toBe(0);
    expect(run.projection().clock.tick).toBe(SUCCESS_COMPLETION_TICK);
  });

  it('holds both real energy rescues (G-02/6) of a failing run, then completes it with G-02/7 and the next transitionId', () => {
    const setup = sessionSetup();
    const { session, host } = setup;
    session.control({ type: 'start', spec: { ...thirdLossSpec(), initialTransition: null } });
    const run = current(session);
    const log: Log = [];
    observe(session, run, log);
    // The player keeps spending energy; the frames cut at a hold or the completion take no input.
    run.onFrame(({ phase, report }) => { if (phase === 'running' && report?.cut === null) run.submitCommand({ type: 'speed', operation: 'maximum' }); });
    host.deliver(0);
    let now = 0;
    const holds: unknown[] = [];
    for (;;) {
      now = deliverUntilStill(setup, now);
      const { phase, transition } = session.status();
      if (phase !== 'transition') break;
      holds.push(transition);
      complete(session, run.runId, (transition as { transitionId: number }).transitionId);
      expect(session.status().phase).toBe('running');
    }
    expect(holds).toEqual([
      expect.objectContaining({ gap: 'G-02/6', transitionId: 1, index: 0, count: 1 }), expect.objectContaining({ gap: 'G-02/6', transitionId: 2, index: 0, count: 1 }),
    ]);
    expect(log.filter((entry) => entry.startsWith('cancel'))).toEqual([]);
    const { phase, result, transition } = session.status();
    expect(phase).toBe('completed');
    expect(result).toMatchObject({ outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, rescuesUsed: 2, endingGaps: [{ gap: 'G-02/7', variant: 'energy' }] });
    expect(transition).toEqual({ gap: 'G-02/7', variant: 'energy', transitionId: 3, tick: result!.completedTick, index: 0, count: 1 });
  });
});

describe('entering completed', () => {
  it('cancels only the unexecuted commands, once, for mission-complete, and an exit later cancels nothing', () => {
    const { session, run, host, log } = completing(1, injectedResult([SOLO]));
    const ids = Array.from({ length: CORE_LIMITS.commandsPerTick + 2 }, () => run.submitCommand({ type: 'launch' }));
    host.deliver(4 * TICK_MS);
    expect(log).toEqual([
      'frame:running:1:completed', `cancel:mission-complete:${ids.slice(CORE_LIMITS.commandsPerTick).join(',')}`, 'frame:completed:null', 'status:completed',
    ]);
    session.control({ type: 'exit' });
    expect(log.slice(4)).toEqual(['status:idle']);
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null, result: null, transition: null });
  });

  it('faults instead when a cancellation listener of the completion fails: no completed state, result or still frame', () => {
    const { session, run, host, log, errors } = completing(1, injectedResult([SOLO]));
    Array.from({ length: CORE_LIMITS.commandsPerTick + 1 }, () => run.submitCommand({ type: 'launch' }));
    run.onCommandsCancelled(() => { throw new Error('cancellation'); });
    host.deliver(TICK_MS);
    expect(session.status()).toMatchObject({ phase: 'faulted', result: null, transition: null });
    expect(log).not.toContain('frame:completed:null');
    expect(log).not.toContain('status:completed');
    expect(errors.at(-1)?.failures?.[0].phase).toBe('consumer');
  });

  it('refuses input from the completion frame\'s receivers as completed, without faulting the run', () => {
    const { session, run, host } = completing(1, injectedResult([SOLO]));
    const refusals: unknown[] = [];
    run.on('mission-completed', () => { refusals.push(thrownBy(() => run.submitCommand({ type: 'launch' }))); });
    run.onFrame(() => { refusals.push(thrownBy(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: true }); })); });
    host.deliver(TICK_MS);
    expect(refusals.slice(0, 2)).toEqual([
      expect.objectContaining({ kind: 'invalid-state', reason: 'completed' }), expect.objectContaining({ kind: 'invalid-state', reason: 'completed' }),
    ]);
    expect(session.status()).toMatchObject({ phase: 'completed', error: null });
  });

  it('holds two ending placeholders one by one, from the transitionIds a running hold used before', () => {
    const { session, run, host } = completing(3, injectedResult([SOLO, CUTSCENE]), { 1: ['G-02/5'] });
    host.deliver(TICK_MS);
    expect(session.status().transition).toMatchObject({ gap: 'G-02/5', transitionId: 1 });
    complete(session, run.runId, 1);
    host.deliver(1_000);
    host.deliver(1_000 + 5 * TICK_MS);
    expect(session.status()).toMatchObject({ phase: 'completed', transition: { ...SOLO, transitionId: 2, tick: 3, index: 0, count: 2 } });
    // A stale or foreign credential changes nothing.
    for (const [runId, transitionId] of [[run.runId, 1], [run.runId, 3], [run.runId + 1, 2]]) {
      expect(refusal(() => { complete(session, runId, transitionId); })).toMatchObject({ kind: 'invalid-state', operation: 'complete-transition' });
    }
    complete(session, run.runId, 2);
    expect(session.status().transition).toEqual({ ...CUTSCENE, transitionId: 3, tick: 3, index: 1, count: 2 });
    expect(refusal(() => { complete(session, run.runId, 2); })).toMatchObject({ kind: 'invalid-state' });
    complete(session, run.runId, 3);
    expect(session.status()).toMatchObject({ phase: 'completed', transition: null, result: { endingGaps: [SOLO, CUTSCENE] } });
    expect(refusal(() => { complete(session, run.runId, 3); })).toMatchObject({ kind: 'invalid-state' });
    // The run never resumed: no frame, no re-anchoring and no further tick.
    expect(host.pending.size).toBe(0);
    expect(run.projection().clock.tick).toBe(3);
  });
});

describe('a completed run', () => {
  it('refuses pause, resume, start, input, clear-input and the departure, and keeps no resume requirement when hidden', () => {
    const { session, run, host } = completing(1, injectedResult([SOLO]));
    host.deliver(TICK_MS);
    const controls: GameSessionControl[] = [
      { type: 'pause' }, { type: 'resume' }, { type: 'start', spec: runSpec() }, { type: 'clear-input', reason: 'focus-loss' },
      { type: 'complete-departure', runId: run.runId },
    ];
    for (const control of controls) {
      expect(refusal(() => { session.control(control); }), control.type).toMatchObject({ kind: 'invalid-state', phase: 'completed' });
    }
    expect(refusal(() => run.submitCommand({ type: 'launch' }))).toMatchObject({ kind: 'invalid-state', operation: 'submitCommand' });
    expect(refusal(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: false }); })).toMatchObject({ kind: 'invalid-state' });
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(session.status()).toMatchObject({ phase: 'completed', environmentVisible: false, resumeRequired: false, pauseReason: null });
    host.emit({ type: 'pagehide' });
    host.emit({ type: 'pageshow', visibility: 'visible' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(session.status()).toMatchObject({ phase: 'completed', environmentVisible: true, resumeRequired: false, transition: { transitionId: 1 } });
    expect(host.pending.size).toBe(0);
    // Consumers may still wire to it, and reads stay available.
    const stop = run.onFrame(() => undefined);
    stop();
    expect(run.snapshot().state.tick).toBe(1);
  });

  it('ends by exit or dispose, releasing the run\'s resources once', () => {
    for (const type of ['exit', 'dispose'] as const) {
      const { session, run, host } = completing(1, injectedResult([SOLO]));
      const released: string[] = [];
      run.ownCleanup(() => { released.push('resource'); });
      host.deliver(TICK_MS);
      session.control({ type });
      expect(released).toEqual(['resource']);
      expect(session.status()).toMatchObject({ phase: type === 'exit' ? 'idle' : 'disposed', result: null, transition: null });
      expect(session.currentRun()).toBeNull();
      injection.reset();
    }
  });
});

describe('what outranks the completion', () => {
  it('an exit queued in the completion frame ends the run instead', () => {
    const { session, run, host, log } = completing(1, injectedResult([SOLO]));
    run.submitCommand({ type: 'launch' });
    run.onFrame((frame) => { if (frame.report?.cut === 'completed') session.control({ type: 'exit' }); });
    host.deliver(TICK_MS);
    expect(session.status()).toMatchObject({ phase: 'idle', result: null });
    expect(log).not.toContain('status:completed');
  });

  it('a failing frame consumer or event listener of the completion frame faults the run, with no result', () => {
    for (const fail of [
      (run: GameSessionRun) => run.onFrame((frame) => { if (frame.report?.cut) throw new Error('consumer'); }),
      (run: GameSessionRun) => run.on('mission-completed', () => { throw new Error('listener'); }),
    ]) {
      const { session, run, host, errors } = completing(1, injectedResult([SOLO]));
      fail(run);
      host.deliver(TICK_MS);
      expect(session.status()).toMatchObject({ phase: 'faulted', result: null, transition: null });
      expect(errors.at(-1)?.failures?.[0].phase).toBe('consumer');
      expect(refusal(() => run.exportRecording())).toMatchObject({ kind: 'invalid-state' });
      injection.reset();
    }
  });

  it('a completion that breaks Core\'s contract faults the run: no final result, too many endings, or a transition in its tick', () => {
    const cases: [InjectedResult, boolean, Readonly<Record<number, readonly InjectedGap[]>>][] = [
      [injectedResult([SOLO]), false, {}],
      [injectedResult([SOLO, CUTSCENE, CUTSCENE]), true, {}],
      [injectedResult([]), true, {}],
      [injectedResult([SOLO]), true, { 1: ['G-02/6'] }],
    ];
    for (const [result, projected, plan] of cases) {
      const setup = started();
      setup.host.deliver(0);
      injection.plan(plan);
      injection.complete(1, result, projected);
      setup.host.deliver(TICK_MS);
      expect(setup.session.status()).toMatchObject({ phase: 'faulted', result: null, transition: null });
      expect(setup.errors.at(-1)?.failures?.[0].phase).toBe('runtime');
      injection.reset();
    }
  });
});

describe('the rescue holds (G-02/5, G-02/6)', () => {
  it('reuse the running hold: cancel once, fold, hold by credential, and re-anchor without catching up', () => {
    const setup = started();
    const { session, run, host } = setup;
    const log: Log = [];
    observe(session, run, log);
    host.deliver(0);
    injection.plan({ 2: ['G-02/5'] });
    const ids = Array.from({ length: CORE_LIMITS.commandsPerTick * 2 + 1 }, () => run.submitCommand({ type: 'launch' }));
    log.length = 0;
    host.deliver(5 * TICK_MS);
    expect(log).toEqual(['frame:running:2:transition', `cancel:transition:${ids.at(-1)}`, 'frame:transition:null', 'status:transition']);
    expect(session.status().transition).toEqual({ gap: 'G-02/5', transitionId: 1, tick: 2, index: 0, count: 1 });
    complete(session, run.runId, 1);
    host.deliver(3_600_000);
    host.deliver(3_600_000 + TICK_MS);
    expect(run.projection().clock.tick).toBe(3);
  });

  it('a G-02/6 hold the page hid during ends paused (hidden) for an explicit resume', () => {
    const setup = started();
    const { session, run, host } = setup;
    host.deliver(0);
    injection.plan({ 1: ['G-02/6'] });
    host.deliver(TICK_MS);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    complete(session, run.runId, 1);
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', resumeRequired: true });
    session.control({ type: 'resume' });
    expect(session.status().phase).toBe('running');
  });
});
