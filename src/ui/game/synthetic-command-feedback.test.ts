import { describe, expect, it } from 'vitest';
import { GameSessionError } from '../../app/session/session-errors.ts';
import type { DomainEvent } from '../../core/synthetic/synthetic-scene.ts';
import type { SyntheticGameState } from './synthetic-game-store.ts';
import { createSyntheticGameStore } from './synthetic-game-store.ts';
import { createSyntheticCommandFeedback, type SyntheticCommandFeedback } from './synthetic-command-feedback.ts';
import { createSyntheticSessionBridge } from './synthetic-session-bridge.ts';
import { TestClock, projectionLog, setupBridge, setupCommandFeedback } from './synthetic-ui.test-support.ts';

function setup() {
  const context = setupCommandFeedback();
  context.session.control({ type: 'start' });
  context.host.deliver(0);
  let now = 0;
  const tick = () => { now += 20; context.host.deliver(now); };
  return { ...context, tick, zeroTickFrame: () => { context.host.deliver(now + 5); } };
}

function lastResult(state: SyntheticGameState) {
  return state.recentResults.at(-1);
}

describe('synthetic command feedback: Core results', () => {
  it('shows only a pending entry until Core accepts the command, then settles it from the event', () => {
    const { reader, feedback, tick, zeroTickFrame } = setup();
    const projection = reader.getState().projection;
    feedback.submit('add-marker');
    expect(reader.getState()).toMatchObject({
      pendingCommands: [{ runId: 1, commandId: 1, commandType: 'add-marker' }], recentResults: [], actionError: null,
    });
    expect(reader.getState().projection).toBe(projection);
    zeroTickFrame();
    expect(reader.getState().pendingCommands).toHaveLength(1);
    expect(reader.getState().projection?.marker).toBeNull();
    tick();
    const state = reader.getState();
    expect(state.pendingCommands).toEqual([]);
    const result = lastResult(state);
    if (result?.outcome !== 'accepted' || result.event.type !== 'marker-added') throw new Error('Expected marker-added');
    expect(result).toMatchObject({ runId: 1, commandId: 1, commandType: 'add-marker', event: { tick: 1, commandIndex: 0 } });
    expect(state.projection?.tick).toBe(1);
    expect(state.projection?.marker).toEqual({ id: result.event.entityId, position: result.event.position });
  });

  it('reports both Core rejection reasons without changing the authoritative marker', () => {
    const { reader, feedback, tick } = setup();
    feedback.submit('add-marker'); tick();
    const marker = reader.getState().projection?.marker;
    feedback.submit('add-marker'); tick();
    expect(lastResult(reader.getState())).toMatchObject({
      commandId: 2, outcome: 'rejected', event: { type: 'command-rejected', commandType: 'add-marker', reason: 'marker-already-exists' },
    });
    expect(reader.getState().projection?.marker).toEqual(marker);
    feedback.submit('remove-marker'); tick();
    expect(lastResult(reader.getState())).toMatchObject({ commandId: 3, outcome: 'accepted', event: { type: 'marker-removed' } });
    feedback.submit('remove-marker'); tick();
    expect(lastResult(reader.getState())).toMatchObject({
      commandId: 4, outcome: 'rejected', event: { type: 'command-rejected', commandType: 'remove-marker', reason: 'marker-not-found' },
    });
    expect(reader.getState().projection?.marker).toBeNull();
    expect(reader.getState().recentResults.map(result => result.outcome)).toEqual(['accepted', 'rejected', 'accepted', 'rejected']);
  });

  it('settles a same-tick add and remove in FIFO order against the frame-end projection', () => {
    const { reader, feedback, tick, clock } = setup();
    const states: SyntheticGameState[] = [];
    reader.subscribe(state => { states.push(state); });
    const log = projectionLog(reader, clock);
    feedback.submit('add-marker');
    feedback.submit('remove-marker');
    states.length = 0;
    tick();
    expect(reader.getState().recentResults.map(result => [
      result.commandId, result.outcome, result.outcome === 'accepted' || result.outcome === 'rejected' ? result.event.type : null,
    ])).toEqual([[1, 'accepted', 'marker-added'], [2, 'accepted', 'marker-removed']]);
    expect(reader.getState().pendingCommands).toEqual([]);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every(state => state.projection?.marker === null)).toBe(true);
    expect(log).toEqual([[1, 0]]);
  });

  it('ignores external commands and repeated deliveries while refreshing the projection', () => {
    const { reader, feedback, tick, currentRun, recorded } = setup();
    feedback.submit('add-marker'); tick();
    const results = reader.getState().recentResults;
    currentRun().submitCommand({ type: 'remove-marker' });
    tick();
    expect(reader.getState().recentResults).toBe(results);
    expect(reader.getState().pendingCommands).toEqual([]);
    expect(reader.getState().projection?.marker).toBeNull();
    const accepted = results[0];
    if (accepted.outcome !== 'accepted') throw new Error('Expected accepted');
    const before = reader.getState();
    for (const { listener } of recorded.domain) listener(accepted.event as DomainEvent, Object.freeze({ commandId: accepted.commandId }));
    expect(reader.getState()).toBe(before);
  });

  it('writes results at the notification boundary without waiting for the sampling window', () => {
    const { reader, feedback, tick, clock } = setup();
    clock.now = 10;
    feedback.submit('add-marker');
    tick();
    expect(lastResult(reader.getState())?.outcome).toBe('accepted');
    expect(reader.getState().projection?.tick).toBe(1);
    const log = projectionLog(reader, clock);
    clock.now = 20; tick();
    clock.now = 30; tick();
    expect(log).toEqual([]);
  });
});

describe('synthetic command feedback: synchronous failures', () => {
  it('records a paused or malformed submission as actionError without an ID or pending entry', () => {
    const { reader, feedback, session, currentRun } = setup();
    session.control({ type: 'pause' });
    feedback.submit('add-marker');
    expect(reader.getState().actionError).toEqual({
      operation: 'add-marker', cause: expect.objectContaining({ kind: 'invalid-state', operation: 'input' }),
    });
    expect(reader.getState().actionError?.cause).toBeInstanceOf(GameSessionError);
    expect(reader.getState().pendingCommands).toEqual([]);
    session.control({ type: 'resume' });
    feedback.submit('bogus' as never);
    expect(reader.getState().actionError).toEqual({
      operation: 'bogus', cause: expect.objectContaining({ kind: 'invalid-argument', path: 'command.type' }),
    });
    expect(reader.getState().pendingCommands).toEqual([]);
    feedback.submit('add-marker');
    expect(reader.getState()).toMatchObject({
      actionError: null, pendingCommands: [{ runId: 1, commandId: 1, commandType: 'add-marker' }],
    });
    expect(currentRun().submitCommand({ type: 'remove-marker' })).toBe(2);
  });

  it('reports a submission before any run or after the run ended', () => {
    const { reader, feedback, session } = setup();
    session.control({ type: 'exit' });
    feedback.submit('remove-marker');
    expect(reader.getState().actionError).toEqual({
      operation: 'remove-marker', cause: expect.objectContaining({ kind: 'invalid-state', reason: 'run has ended' }),
    });
    let noRun: SyntheticCommandFeedback | undefined;
    const idle = setupBridge(undefined, writer => [noRun = createSyntheticCommandFeedback(writer)]);
    noRun?.submit('add-marker');
    expect(idle.reader.getState().actionError).toEqual({ operation: 'add-marker', cause: expect.any(Error) });
    expect(idle.reader.getState().pendingCommands).toEqual([]);
  });

  it('cannot reach a live run through a binding retired by rollback or unbind', () => {
    const live = setupBridge();
    live.session.control({ type: 'start' });
    live.host.deliver(0);
    const writer = createSyntheticGameStore();
    const feedback = createSyntheticCommandFeedback(writer);
    const cause = new Error('later consumer');
    const bridge = createSyntheticSessionBridge(writer, new TestClock().read, [feedback, { attach: () => { throw cause; } }]);
    expect(() => bridge.bind(live.session)).toThrow(cause);
    feedback.submit('add-marker');
    expect(writer.reader.getState()).toMatchObject({ pendingCommands: [], actionError: { operation: 'add-marker', cause: expect.any(Error) } });
    live.host.deliver(20);
    expect(live.currentRun().uiProjection().marker).toBeNull();

    let ownerFeedback: SyntheticCommandFeedback | undefined;
    const owner = setupBridge(undefined, store => [ownerFeedback = createSyntheticCommandFeedback(store)]);
    owner.session.control({ type: 'start' });
    owner.host.deliver(0);
    owner.bridge.unbind();
    ownerFeedback?.submit('add-marker');
    owner.host.deliver(20);
    expect(owner.currentRun().uiProjection().marker).toBeNull();
    expect(owner.reader.getState().pendingCommands).toEqual([]);
  });
});
