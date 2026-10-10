import { describe, expect, it } from 'vitest';
import { COMMAND_QUEUE_LIMIT } from '../../app/runtime/game-runtime.ts';
import { runSpec } from '../../app/session/game-session.test-support.ts';
import type { AcceptedCommandResult, CommandResultEvent, UnacceptedCommandResult } from '../../core/contracts/domain-events.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import type { GameUiState } from './game-store.ts';
import { RECENT_RESULT_LIMIT } from './game-store.ts';
import type { GameRunBinding } from './game-session-bridge.ts';
import { frameDouble, history, projectionLog, setupFeedback, startedFeedback } from './game-ui.test-support.ts';

const launch: Command = Object.freeze({ type: 'launch' });

/** A started run with its first frame anchored at clock 0. */
function setup(ownerId = 1) {
  const context = startedFeedback({ ownerId });
  /** Delivers a typed double of a Core result Core does not produce yet to the feedback's listener of `runId`. */
  const deliverResult = (event: CommandResultEvent, commandId: number | null, runId = context.currentRun().runId) => {
    const entry = context.recorded.results.find((item) => item.runId === runId);
    if (!entry) throw new Error(`No result listener for run ${runId}`);
    entry.listener(event, Object.freeze({ commandId }));
  };
  return { ...context, deliverResult };
}

const accepted = (tick: number): AcceptedCommandResult => Object.freeze({
  type: 'command-result', tick, commandIndex: 0, commandType: 'launch', outcome: 'accepted', reason: null,
});
const ignored = (tick: number): UnacceptedCommandResult => Object.freeze({
  type: 'command-result', tick, commandIndex: 1, commandType: 'launch', outcome: 'ignored', reason: 'not-implemented',
});

const outcomes = (state: GameUiState) => state.recentResults.map(({ commandId, outcome, reason }) => [commandId, outcome, reason]);

describe('game command feedback: Core results', () => {
  it('shows a pending entry only once the run returned its ID, and settles it with the frame-end projection in one write', () => {
    const { reader, feedback, frame, currentRun, clock } = setup();
    const projection = reader.getState().projection;
    expect(feedback.submit(launch)).toBe(1);
    expect(reader.getState()).toMatchObject({
      pendingCommands: [{ ownerId: 1, runId: 1, commandId: 1, commandType: 'launch' }], recentResults: [], actionError: null,
    });
    expect(reader.getState().projection).toBe(projection);
    frame(0);
    expect(reader.getState().pendingCommands).toHaveLength(1);
    const states = history(reader);
    const log = projectionLog(reader, clock);
    frame(1, 1);
    expect(states).toHaveLength(1);
    expect(states[0].pendingCommands).toEqual([]);
    expect(states[0].recentResults).toEqual([{
      ownerId: 1, runId: 1, commandId: 1, commandType: 'launch', outcome: 'rejected', reason: 'not-implemented',
      event: expect.objectContaining({ type: 'command-result', tick: 1, commandIndex: 0, outcome: 'rejected' }),
    }]);
    expect(states[0].projection).toBe(currentRun().projection());
    expect(log).toEqual([[1, 1]]);
  });

  it('settles accepted and ignored results from typed doubles, keeping their outcome, reason and event', () => {
    const { reader, feedback, frame, deliverResult } = setup();
    feedback.submit(launch); feedback.submit(launch);
    const acceptedEvent = accepted(1), ignoredEvent = ignored(1);
    deliverResult(acceptedEvent, 1);
    deliverResult(ignoredEvent, 2);
    expect(reader.getState().pendingCommands).toHaveLength(2);
    const states = history(reader);
    frame(1);
    expect(states).toHaveLength(1);
    expect(states[0].recentResults).toEqual([
      { ownerId: 1, runId: 1, commandId: 1, commandType: 'launch', outcome: 'accepted', reason: null, event: acceptedEvent },
      { ownerId: 1, runId: 1, commandId: 2, commandType: 'launch', outcome: 'ignored', reason: 'not-implemented', event: ignoredEvent },
    ]);
    expect(states[0].projection?.clock.tick).toBe(1);
    expect(states[0].pendingCommands).toEqual([]);
  });

  it('gives no result for a null, unknown, repeated or other consumer\'s ID, and never resubmits', () => {
    const { reader, feedback, frame, deliverResult, currentRun, host } = setup();
    const other = currentRun().submitCommand(launch);
    expect(feedback.submit(launch)).toBe(other + 1);
    deliverResult(accepted(1), null);
    deliverResult(accepted(1), 99);
    frame(1);
    expect(outcomes(reader.getState())).toEqual([[2, 'rejected', 'not-implemented']]);
    deliverResult(accepted(1), 2);
    deliverResult(accepted(1), other);
    const before = reader.getState();
    frame(1);
    expect(outcomes(reader.getState())).toEqual([[2, 'rejected', 'not-implemented']]);
    expect(reader.getState().recentResults).toBe(before.recentResults);
    expect(reader.getState().pendingCommands).toEqual([]);
    frame(3);
    expect(host.pending.size).toBe(1);
    expect(currentRun().projection().clock.tick).toBe(5);
    expect(reader.getState().recentResults).toHaveLength(1);
  });

  it('settles a result delivered twice once', () => {
    const { reader, feedback, frame, deliverResult } = setup();
    feedback.submit(launch);
    deliverResult(accepted(1), 1);
    deliverResult(ignored(1), 1);
    frame(1);
    expect(outcomes(reader.getState())).toEqual([[1, 'accepted', null]]);
  });

  it(`keeps the newest ${RECENT_RESULT_LIMIT} results across frames`, () => {
    const { reader, feedback, frame } = setup();
    for (let index = 0; index < 12; index++) feedback.submit(launch);
    frame(1);
    expect(reader.getState().recentResults.map((result) => result.commandId)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    feedback.submit(launch);
    frame(1);
    expect(reader.getState().recentResults.map((result) => result.commandId)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('keeps a received result authoritative when the clock fails while publishing it', () => {
    const { reader, feedback, frame, clock, errors, currentRun } = setup();
    feedback.submit(launch);
    const cause = new Error('clock unavailable');
    clock.failure = cause;
    frame(1);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause }]);
    const state = reader.getState();
    expect(state.status?.phase).toBe('faulted');
    expect(state.pendingCommands).toEqual([]);
    expect(outcomes(state)).toEqual([[1, 'rejected', 'not-implemented']]);
    expect(state.projection).toBe(currentRun().projection());
    expect(state.projection?.clock.tick).toBe(1);
  });

  it('flushes results held when a domain receiver fails the frame, before cancelling the queue', () => {
    const { reader, feedback, frame, currentRun, errors } = setup();
    currentRun().on('command-result', () => { throw new Error('receiver'); });
    for (let index = 0; index < 70; index++) feedback.submit(launch);
    const states = history(reader);
    frame(1);
    expect(errors[0].failures).toEqual([{ phase: 'consumer', cause: expect.objectContaining({ kind: 'listener-failed' }) }]);
    // The results and the cancellation of the rest arrive in one write with the frame-end projection, then the fault,
    // then the boundary's error outlet.
    expect(states.map((state) => [state.status?.phase, state.sessionError])).toEqual([['running', null], ['faulted', null], ['faulted', errors[0]]]);
    expect(states[0].projection?.clock.tick).toBe(1);
    expect(states[0].pendingCommands).toEqual([]);
    expect(outcomes(states[0])).toEqual([
      ...[61, 62, 63, 64].map((id) => [id, 'rejected', 'not-implemented']), ...[65, 66, 67, 68, 69, 70].map((id) => [id, 'cancelled', 'failure']),
    ]);
    expect(reader.getState().recentResults.some((result) => result.outcome === 'unconfirmed')).toBe(false);
  });
});

describe('game command feedback: refusals and cancellations', () => {
  it('turns a refused submission into actionError without a pending entry or commandId', () => {
    const { reader, feedback, session, currentRun } = setup();
    expect(feedback.submit({ type: 'speed', operation: 'warp' } as unknown as Command)).toBeNull();
    expect(reader.getState()).toMatchObject({ pendingCommands: [], actionError: { operation: 'speed', cause: { kind: 'invalid-argument' } } });
    for (let index = 0; index < COMMAND_QUEUE_LIMIT; index++) currentRun().submitCommand(launch);
    expect(feedback.submit(launch)).toBeNull();
    expect(reader.getState()).toMatchObject({
      pendingCommands: [], actionError: { operation: 'launch', cause: { kind: 'invalid-state', reason: 'command-queue-full' } },
    });
    session.control({ type: 'pause' });
    expect(feedback.submit(launch)).toBeNull();
    expect(reader.getState().actionError).toMatchObject({ operation: 'launch', cause: { kind: 'invalid-state', phase: 'paused' } });
    session.control({ type: 'resume' });
    expect(feedback.submit(launch)).toBe(COMMAND_QUEUE_LIMIT + 1);
    expect(reader.getState().actionError).toBeNull();
  });

  it('reads a command\'s type without running accessors, and never throws for a malformed command', () => {
    const idle = setupFeedback();
    const trap = new Proxy({ type: 'launch' }, { getOwnPropertyDescriptor: () => { throw new Error('trap'); } });
    expect(idle.feedback.submit(trap as unknown as Command)).toBeNull();
    expect(idle.reader.getState().actionError).toMatchObject({ operation: 'command' });
    const { reader, feedback, currentRun } = setup();
    let reads = 0;
    const accessor = Object.defineProperty({}, 'type', { enumerable: true, get: () => { reads++; return 'launch'; } });
    for (const command of [accessor, null, 'launch']) {
      expect(feedback.submit(command as unknown as Command)).toBeNull();
      expect(reader.getState()).toMatchObject({ pendingCommands: [], actionError: { operation: 'command', cause: { kind: 'invalid-argument' } } });
    }
    expect(reads).toBe(0);
    expect(currentRun().submitCommand(launch)).toBe(1);
  });

  it('reports a submission before any run as actionError', () => {
    const { reader, feedback } = setupFeedback();
    expect(feedback.submit(launch)).toBeNull();
    expect(reader.getState()).toMatchObject({ pendingCommands: [], actionError: { operation: 'launch', cause: expect.any(Error) } });
  });

  it.each([
    ['user-pause', (context: ReturnType<typeof setup>) => { context.session.control({ type: 'pause' }); }],
    ['hidden', (context: ReturnType<typeof setup>) => { context.host.emit({ type: 'visibility', visibility: 'hidden' }); }],
    ['focus-loss', (context: ReturnType<typeof setup>) => { context.session.control({ type: 'clear-input', reason: 'focus-loss' }); }],
    ['pointer-lock-exit', (context: ReturnType<typeof setup>) => { context.session.control({ type: 'clear-input', reason: 'pointer-lock-exit' }); }],
  ] as const)('settles queued commands as cancelled with the session reason %s', (reason, act) => {
    const context = setup();
    context.feedback.submit(launch); context.feedback.submit(launch);
    act(context);
    expect(outcomes(context.reader.getState())).toEqual([[1, 'cancelled', reason], [2, 'cancelled', reason]]);
    expect(context.reader.getState().pendingCommands).toEqual([]);
  });

  it('settles a cancellation without publishing the projection, so the sample window is undisturbed', () => {
    const { reader, feedback, session, frame, clock } = setup();
    frame(1, 100);
    frame(1, 150);
    const log = projectionLog(reader, clock);
    feedback.submit(launch);
    clock.now = 160;
    session.control({ type: 'clear-input', reason: 'focus-loss' });
    expect(outcomes(reader.getState())).toEqual([[1, 'cancelled', 'focus-loss']]);
    expect(reader.getState().projection?.clock.tick).toBe(1);
    expect(log).toEqual([]);
    frame(1, 199);
    expect(log).toEqual([]);
    frame(1, 200);
    expect(log).toEqual([[4, 200]]);
  });

  it('shows the exit cancellation to synchronous subscribers, then clears the run', () => {
    const { reader, feedback, session } = setup();
    feedback.submit(launch);
    const states = history(reader);
    session.control({ type: 'exit' });
    expect(states.map((state) => [state.status?.phase, outcomes(state)])).toEqual([
      ['running', [[1, 'cancelled', 'exit']]],
      ['idle', []],
    ]);
    expect(reader.getState()).toMatchObject({ pendingCommands: [], recentResults: [], projection: null });
  });
});

describe('game command feedback: run and owner isolation', () => {
  it('does not settle a new run\'s command from the same ID in an earlier run', () => {
    const { reader, feedback, session, deliverResult, frame } = setup();
    feedback.submit(launch);
    session.control({ type: 'exit' });
    session.control({ type: 'start', spec: runSpec() });
    expect(feedback.submit(launch)).toBe(1);
    deliverResult(accepted(1), 1, 1);
    frame(0);
    expect(reader.getState()).toMatchObject({ status: { runId: 2 }, pendingCommands: [{ runId: 2, commandId: 1 }], recentResults: [] });
  });

  it('does not let an earlier owner\'s run 1 notifications reach a new owner\'s run 1', () => {
    const old = setup(1);
    old.feedback.submit(launch);
    old.session.control({ type: 'dispose' });
    old.bridge.unbind();
    const next = setup(2);
    next.feedback.submit(launch);
    const before = [old.reader.getState(), next.reader.getState()];
    old.deliverResult(accepted(1), 1, 1);
    for (const entry of old.recorded.cancellations) entry.listener(Object.freeze({ runId: 1, commandIds: [1], reason: 'exit' }));
    for (const entry of old.recorded.frames) entry.listener(frameDouble(next.currentRun(), next.currentRun().projection(), null));
    next.frame(0);
    expect(old.reader.getState()).toBe(before[0]);
    expect(next.reader.getState()).toBe(before[1]);
    expect(next.reader.getState()).toMatchObject({ ownerId: 2, pendingCommands: [{ ownerId: 2, runId: 1, commandId: 1 }] });
    expect(old.feedback.submit(launch)).toBeNull();
    expect(old.reader.getState().actionError?.cause).toMatchObject({ kind: 'invalid-state', reason: 'run has ended' });
    expect(next.reader.getState()).toBe(before[1]);
    expect(next.currentRun().projection().clock.tick).toBe(0);
  });

  it('refuses to attach to another owner\'s run', () => {
    const { feedback } = setupFeedback({ ownerId: 3 });
    expect(() => { feedback.attach({ ownerId: 4 } as GameRunBinding); }).toThrow('own owner');
  });
});
