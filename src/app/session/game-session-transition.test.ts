vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const { wrapWorld } = await import('../runtime/transition-injection.test-support.ts');
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { NEUTRAL_AXES, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { injection, type InjectedGap } from '../runtime/transition-injection.test-support.ts';
import type { GameSession, GameSessionControl, GameSessionFrame, GameSessionRun } from './game-session.ts';
import { current, departure, runSpec, sessionSetup, started } from './game-session.test-support.ts';
import type { GameSessionError } from './session-errors.ts';

// P3-10 AC-13, the Session part (docs/plan/p3/04/spec.md, 运行中衔接（P3-10 的修订）): after a frame cut at a transition
// tick the session holds the run at a safe point (unexecuted commands cancelled once, two frames folded, a still
// frame), each item of the tick's sequence ends once by its owner/run/transition credential, the last re-anchors the
// clock, and hidden pages, pauses, exits, new runs and faults keep their protections. Transitions are injected where
// the world is created (transition-injection.test-support.ts).

afterEach(() => { injection.reset(); });

type Log = string[];

/** Logs the run's frames as `frame:<phase>:<ticks|null>[:cut]`, its cancellations and the session's status phases. */
function observe(session: GameSession, run: GameSessionRun, log: Log, frames: GameSessionFrame[] = []): void {
  run.onFrame((frame) => {
    frames.push(frame);
    log.push(`frame:${frame.phase}:${frame.report === null ? 'null' : `${frame.report.ticks}${frame.report.cut ? ':cut' : ''}`}`);
  });
  run.onCommandsCancelled(({ commandIds, reason }) => { log.push(`cancel:${reason}:${commandIds.join(',')}`); });
  session.onStatus((status) => { log.push(`status:${status.phase}`); });
}

/** A running Session anchored at time 0, observed, whose first injected step is the next one. */
function running(plan: Readonly<Record<number, readonly InjectedGap[]>> = {}) {
  const setup = started();
  const log: Log = [];
  const frames: GameSessionFrame[] = [];
  observe(setup.session, setup.run, log, frames);
  setup.host.deliver(0);
  injection.plan(plan);
  log.length = 0;
  frames.length = 0;
  return { ...setup, log, frames };
}

const complete = (session: GameSession, runId: number, transitionId: number): void => {
  session.control({ type: 'complete-transition', runId, transitionId });
};
const refusal = (work: () => void) => thrownBy(work) as GameSessionError;

describe('entering the hold', () => {
  it('delivers the cut frame, then cancels only the unexecuted commands once, folds and sends a still frame', () => {
    const { session, run, host, log, frames } = running({ 1: ['G-02/3'] });
    const ids = Array.from({ length: CORE_LIMITS.commandsPerTick + 2 }, () => run.submitCommand({ type: 'launch' }));
    const results: number[] = [];
    run.on('command-result', (_, { commandId }) => { if (commandId !== null) results.push(commandId); });
    host.deliver(4 * TICK_MS);
    expect(log).toEqual([
      'frame:running:1:cut', `cancel:transition:${ids.slice(CORE_LIMITS.commandsPerTick).join(',')}`, 'frame:transition:null', 'status:transition',
    ]);
    // Executed commands kept their results and are never reported cancelled.
    expect(results).toEqual(ids.slice(0, CORE_LIMITS.commandsPerTick));
    expect(frames[0].report).toEqual({ ticks: 1, capped: false, stop: null, cut: 'transition', transitions: [{ gap: 'G-02/3', tick: 1 }], completion: null });
    const still = frames[1].render;
    expect({ same: still.previous === still.current, alpha: still.alpha, tick: still.current.tick }).toEqual({ same: true, alpha: 0, tick: 1 });
    expect(session.status()).toMatchObject({
      phase: 'transition', runId: 1, transition: { gap: 'G-02/3', transitionId: 1, tick: 1, index: 0, count: 1 }, resumeRequired: false,
    });
    expect(Object.isFrozen(session.status().transition)).toBe(true);
    // No step, no input and no frame request while held.
    expect(host.pending.size).toBe(0);
    expect(refusal(() => run.submitCommand({ type: 'launch' }))).toMatchObject({ kind: 'invalid-state', operation: 'submitCommand' });
    expect(refusal(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: true }); })).toMatchObject({ kind: 'invalid-state' });
    expect(injection.steps).toBe(1);
  });

  it('refuses input from the cut frame\'s receivers as transition-hold, without changing the queue', () => {
    const { run, host, log } = running({ 1: ['G-02/4'] });
    const refusals: unknown[] = [];
    run.on('transition', () => { refusals.push(thrownBy(() => run.submitCommand({ type: 'launch' }))); });
    run.onFrame(() => { refusals.push(thrownBy(() => { run.setIntent({ axes: NEUTRAL_AXES, primaryFire: true }); })); });
    host.deliver(TICK_MS);
    expect(refusals.slice(0, 2)).toEqual([
      expect.objectContaining({ kind: 'invalid-state', reason: 'transition-hold' }), expect.objectContaining({ kind: 'invalid-state', reason: 'transition-hold' }),
    ]);
    // Nothing was queued, so the hold cancels nothing.
    expect(log.filter((entry) => entry.startsWith('cancel'))).toEqual([]);
  });

  it('holds two transitions of a tick as a sequence, each item with its own transitionId', () => {
    const { session, run, host, log } = running({ 2: ['G-02/3', 'G-02/4'] });
    host.deliver(5 * TICK_MS);
    expect(session.status().transition).toEqual({ gap: 'G-02/3', transitionId: 1, tick: 2, index: 0, count: 2 });
    complete(session, run.runId, 1);
    expect(session.status()).toMatchObject({ phase: 'transition', transition: { gap: 'G-02/4', transitionId: 2, tick: 2, index: 1, count: 2 } });
    expect(host.pending.size).toBe(0);
    // The first item's credential is spent.
    expect(refusal(() => { complete(session, run.runId, 1); })).toMatchObject({ kind: 'invalid-state', operation: 'complete-transition' });
    complete(session, run.runId, 2);
    expect(session.status()).toMatchObject({ phase: 'running', transition: null });
    expect(log.filter((entry) => entry.startsWith('status'))).toEqual(['status:transition', 'status:transition', 'status:running']);
  });

  it('faults on more transitions in a tick than Core emits, rather than cutting them', () => {
    const { session, host, errors } = running({ 1: ['G-02/3', 'G-02/4', 'G-02/4'] });
    host.deliver(TICK_MS);
    expect(session.status()).toMatchObject({ phase: 'faulted', transition: null });
    expect(errors.at(-1)?.failures).toEqual([{ phase: 'runtime', cause: expect.any(RangeError) }]);
  });
});

describe('ending the hold', () => {
  it('re-anchors without catching up, and the run steps again', () => {
    const { session, run, host, frames } = running({ 1: ['G-02/3'] });
    host.deliver(TICK_MS);
    complete(session, run.runId, 1);
    expect(session.status().phase).toBe('running');
    host.deliver(3_600_000);
    expect(frames.at(-1)?.report).toEqual({ ticks: 0, capped: false, stop: null, cut: null, transitions: [], completion: null });
    host.deliver(3_600_000 + 2 * TICK_MS);
    expect(frames.at(-1)?.report?.ticks).toBe(2);
    expect(run.projection().clock.tick).toBe(3);
    expect(run.submitCommand({ type: 'launch' })).toBe(1);
  });

  it('accepts only the current item of the current run, and a second hold of the run refuses the first credential', () => {
    const { session, run, host } = running({ 1: ['G-02/3'], 2: ['G-02/4'] });
    host.deliver(TICK_MS);
    const invalid: GameSessionControl[] = [
      { type: 'complete-transition', runId: run.runId + 1, transitionId: 1 },
      { type: 'complete-transition', runId: run.runId, transitionId: 2 },
      { type: 'complete-departure', runId: run.runId },
    ];
    for (const control of invalid) expect(refusal(() => { session.control(control); })).toMatchObject({ kind: 'invalid-state' });
    expect(session.status().transition).toMatchObject({ transitionId: 1 });
    complete(session, run.runId, 1);
    host.deliver(10_000);
    host.deliver(10_000 + TICK_MS);
    expect(session.status().transition).toMatchObject({ gap: 'G-02/4', transitionId: 2, tick: 2 });
    expect(refusal(() => { complete(session, run.runId, 1); })).toMatchObject({ kind: 'invalid-state' });
    complete(session, run.runId, 2);
    expect(session.status().phase).toBe('running');
    // Spent and malformed credentials.
    expect(refusal(() => { complete(session, run.runId, 2); })).toMatchObject({ kind: 'invalid-state' });
    expect(refusal(() => { session.control({ type: 'complete-transition', runId: 1, transitionId: 0 }); })).toMatchObject({ kind: 'invalid-argument' });
    expect(refusal(() => { session.control({ type: 'complete-transition', runId: 1 } as never); })).toMatchObject({ kind: 'invalid-argument' });
  });

  it('keeps the departure hold to complete-departure', () => {
    const setup = sessionSetup();
    setup.session.control({ type: 'start', spec: runSpec({ initialTransition: departure() }) });
    const run = current(setup.session);
    expect(refusal(() => { complete(setup.session, run.runId, 1); })).toMatchObject({ kind: 'invalid-state', operation: 'complete-transition' });
    setup.session.control({ type: 'complete-departure', runId: run.runId });
    expect(setup.session.status().phase).toBe('running');
  });
});

describe('races with the hold', () => {
  it.each([
    ['hidden', { type: 'visibility', visibility: 'hidden' }],
    ['pagehide', { type: 'pagehide' }],
  ] as const)('a %s page during the hold requires an explicit resume, even once visible again', (_, event) => {
    const { session, run, host, log } = running({ 1: ['G-02/3'] });
    host.deliver(TICK_MS);
    host.emit(event);
    expect(session.status()).toMatchObject({ phase: 'transition', resumeRequired: true, environmentVisible: false });
    host.emit(event.type === 'pagehide' ? { type: 'pageshow', visibility: 'visible' } : { type: 'visibility', visibility: 'visible' });
    expect(session.status().environmentVisible).toBe(true);
    complete(session, run.runId, 1);
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', resumeRequired: true });
    expect({ pending: host.pending.size, last: log.at(-2) }).toEqual({ pending: 0, last: 'frame:paused:null' });
    session.control({ type: 'resume' });
    expect(session.status()).toMatchObject({ phase: 'running', resumeRequired: false });
  });

  it('ends a hold that is still hidden paused (hidden)', () => {
    const { session, run, host } = running({ 1: ['G-02/4'] });
    host.deliver(TICK_MS);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    complete(session, run.runId, 1);
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden' });
    expect(refusal(() => { session.control({ type: 'resume' }); })).toMatchObject({ kind: 'invalid-state' });
  });

  it('refuses user pause and resume during the hold, and takes clear-input as already done', () => {
    const { session, run, host, log } = running({ 1: ['G-02/3'] });
    host.deliver(TICK_MS);
    log.length = 0;
    expect(refusal(() => { session.control({ type: 'pause' }); })).toMatchObject({ kind: 'invalid-state' });
    expect(refusal(() => { session.control({ type: 'resume' }); })).toMatchObject({ kind: 'invalid-state' });
    session.control({ type: 'clear-input', reason: 'focus-loss' });
    expect({ phase: session.status().phase, log }).toEqual({ phase: 'transition', log: [] });
    complete(session, run.runId, 1);
    expect(session.status().phase).toBe('running');
  });

  it('lets exit end the whole sequence; the next run\'s holds never reuse a transitionId', () => {
    const { session, run, host } = running({ 1: ['G-02/3', 'G-02/4'] });
    host.deliver(TICK_MS);
    session.control({ type: 'exit' });
    expect(session.status()).toMatchObject({ phase: 'idle', transition: null });
    expect(refusal(() => { complete(session, run.runId, 1); })).toMatchObject({ kind: 'invalid-state' });
    session.control({ type: 'start', spec: runSpec() });
    const next = current(session);
    host.deliver(50_000);
    injection.plan({ 1: ['G-02/4'] });
    host.deliver(50_000 + TICK_MS);
    // An item gets its ID as it is shown: the exited sequence's second item never took one.
    expect(session.status()).toMatchObject({ phase: 'transition', runId: next.runId, transition: { transitionId: 2 } });
    expect(refusal(() => { complete(session, run.runId, 2); })).toMatchObject({ kind: 'invalid-state' });
    expect(refusal(() => { complete(session, next.runId, 1); })).toMatchObject({ kind: 'invalid-state' });
    complete(session, next.runId, 2);
    expect(session.status().phase).toBe('running');
  });

  it('lets dispose end a hold', () => {
    const { session, run, host } = running({ 1: ['G-02/3'] });
    host.deliver(TICK_MS);
    session.control({ type: 'dispose' });
    expect(session.status()).toMatchObject({ phase: 'disposed', transition: null });
    expect(refusal(() => { complete(session, run.runId, 1); })).toMatchObject({ kind: 'invalid-state' });
  });

  it('does not hold when a frame consumer queued an exit in the cut frame', () => {
    const { session, run, host, log } = running({ 1: ['G-02/3'] });
    run.onFrame((frame) => { if (frame.report?.cut) session.control({ type: 'exit' }); });
    const ids = Array.from({ length: CORE_LIMITS.commandsPerTick + 2 }, () => run.submitCommand({ type: 'launch' }));
    host.deliver(TICK_MS);
    // The exit's own cancellation, not the hold's.
    expect(log).toEqual(['frame:running:1:cut', `cancel:exit:${ids.slice(CORE_LIMITS.commandsPerTick).join(',')}`, 'status:idle']);
    expect(session.status()).toMatchObject({ phase: 'idle', transition: null });
  });

  it('faults on too many transitions even with an exit queued', () => {
    const { session, run, host, errors } = running({ 1: ['G-02/3', 'G-02/4', 'G-02/3'] });
    run.onFrame((frame) => { if (frame.report?.cut) session.control({ type: 'exit' }); });
    host.deliver(TICK_MS);
    expect(errors.at(-1)?.failures).toEqual([{ phase: 'runtime', cause: expect.any(RangeError) }]);
  });

  it('lets no completion a still-frame consumer queued outrun a consumer failure of the same frame', () => {
    const { session, run, host, log } = running({ 1: ['G-02/3'] });
    run.onFrame((frame) => {
      if (frame.phase === 'transition') complete(session, run.runId, 1);
    });
    run.onFrame((frame) => { if (frame.phase === 'transition') throw new Error('still frame consumer'); });
    host.deliver(TICK_MS);
    expect(session.status()).toMatchObject({ phase: 'faulted', transition: null });
    expect(log).not.toContain('status:running');
    expect(host.pending.size).toBe(0);
  });

  it('faults instead of holding when a consumer fails in the cut frame', () => {
    const { session, run, host, log } = running({ 1: ['G-02/3'] });
    run.onFrame((frame) => { if (frame.report?.cut) throw new Error('consumer'); });
    host.deliver(TICK_MS);
    expect(session.status()).toMatchObject({ phase: 'faulted', transition: null });
    expect(log).not.toContain('status:transition');
  });

  it('faults when a cancellation receiver fails on entering the hold, and nothing completes the hold afterwards', () => {
    const { session, run, host } = running({ 1: ['G-02/3'] });
    for (let index = 0; index < CORE_LIMITS.commandsPerTick + 1; index++) run.submitCommand({ type: 'launch' });
    run.onCommandsCancelled(() => { throw new Error('cancellation receiver'); });
    host.deliver(TICK_MS);
    expect(session.status()).toMatchObject({ phase: 'faulted', transition: null });
    expect(refusal(() => { complete(session, run.runId, 1); })).toMatchObject({ kind: 'invalid-state' });
    expect(refusal(() => { session.control({ type: 'resume' }); })).toMatchObject({ kind: 'invalid-state' });
  });

  it('faults when the frame request at the end of the hold fails, latching nothing else', () => {
    const { session, run, host } = running({ 1: ['G-02/3'] });
    host.deliver(TICK_MS);
    host.requestFailure = new Error('request');
    expect(refusal(() => { complete(session, run.runId, 1); })).toMatchObject({ kind: 'operation-failed' });
    expect(session.status()).toMatchObject({ phase: 'faulted', cleanupFailed: false });
  });

  it('refuses control from status receivers, so no notification ends a hold', () => {
    const { session, run, host } = running({ 1: ['G-02/3'] });
    const refusals: unknown[] = [];
    session.onStatus((status) => {
      if (status.phase === 'transition') refusals.push(thrownBy(() => { complete(session, run.runId, 1); }));
    });
    host.deliver(TICK_MS);
    expect(refusals).toEqual([expect.objectContaining({ kind: 'invalid-state', operation: 'complete-transition' })]);
    expect(session.status().phase).toBe('transition');
  });
});
