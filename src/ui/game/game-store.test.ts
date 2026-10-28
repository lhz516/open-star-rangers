import { describe, expect, it } from 'vitest';
import type { GameSessionStatus } from '../../app/session/game-session.ts';
import { runtimeSpec } from '../../app/runtime/game-runtime.test-support.ts';
import { createGameRuntime } from '../../app/runtime/game-runtime.ts';
import { GameSessionError } from '../../app/session/session-errors.ts';
import type { UnacceptedCommandResult } from '../../core/contracts/domain-events.ts';
import {
  RECENT_RESULT_LIMIT, createGameStore, selectOwnerId, selectPhase, selectRunId, selectTick,
  type GameUiState, type UiCommandSettlement,
} from './game-store.ts';
import { history } from './game-ui.test-support.ts';

const running: GameSessionStatus = Object.freeze({
  phase: 'running', runId: 1, environmentVisible: true, pauseReason: null, transition: null, resumeRequired: false,
  stopReason: null, result: null, cleanupFailed: false, error: null,
});

const rejected = (commandId: number, runId = 1, ownerId = 7): UiCommandSettlement => {
  const event: UnacceptedCommandResult = Object.freeze({
    type: 'command-result', tick: 1, commandIndex: 0, commandType: 'launch', outcome: 'rejected', reason: 'not-implemented',
  });
  return { ownerId, runId, commandId, outcome: 'rejected', reason: 'not-implemented', event };
};

describe('game store', () => {
  it('starts empty for its owner and exposes only a frozen read-only handle', () => {
    const { reader, ownerId } = createGameStore(7);
    expect(ownerId).toBe(7);
    expect(reader.getState()).toEqual({
      ownerId: 7, status: null, projection: null, flow: null, pendingCommands: [], recentResults: [], actionError: null, sessionError: null,
      messages: null,
    });
    expect(reader.getInitialState()).toBe(reader.getState());
    expect(Object.isFrozen(reader.getState())).toBe(true);
    expect(Object.isFrozen(reader.getState().pendingCommands)).toBe(true);
    expect(Object.keys(reader).sort()).toEqual(['getInitialState', 'getState', 'subscribe']);
    expect(Object.isFrozen(reader)).toBe(true);
    // @ts-expect-error The reader handed to React has no write entry.
    expect(reader.setState).toBeUndefined();
    // @ts-expect-error State arrays are read-only.
    expect(() => reader.getState().pendingCommands.push({ ownerId: 7, runId: 1, commandId: 1, commandType: 'launch' })).toThrow(TypeError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN])('refuses ownerId %s', (ownerId) => {
    expect(() => createGameStore(ownerId)).toThrow(RangeError);
  });

  it('writes each change once, only when a field changed, and detaches stored records from caller objects', () => {
    const { reader, commit } = createGameStore(7);
    const states = history(reader);
    const status = { ...running };
    commit({ status });
    commit({ status: { ...running }, actionError: null, projection: null, settle: [], clearRun: true });
    expect(states).toHaveLength(1);
    status.phase = 'paused';
    const stored = reader.getState().status;
    expect(stored).toEqual(running);
    expect(Object.isFrozen(stored)).toBe(true);
    commit({ status: running });
    expect(states).toHaveLength(1);
    const cause = new Error('rejected control');
    const actionError = { operation: 'pause', cause };
    commit({ actionError });
    expect(reader.getState().actionError).toEqual({ operation: 'pause', cause });
    expect(reader.getState().actionError).not.toBe(actionError);
    expect(Object.isFrozen(reader.getState().actionError)).toBe(true);
    const sessionError = new GameSessionError({ kind: 'operation-failed', failures: [] });
    commit({ sessionError, actionError: null });
    expect(reader.getState()).toMatchObject({ sessionError, actionError: null });
    expect(states).toHaveLength(3);
  });

  it('keeps the owner\'s mission flow position only as a frozen value', () => {
    const { reader, commit } = createGameStore<{ readonly position: string } | 'intro'>(7);
    commit({ flow: 'intro' });
    expect(reader.getState().flow).toBe('intro');
    expect(() => commit({ flow: { position: 'config' } })).toThrow(TypeError);
    expect(reader.getState().flow).toBe('intro');
    const flow = Object.freeze({ position: 'config' });
    commit({ flow, status: running });
    expect(reader.getState()).toMatchObject({ flow, status: running });
    commit({ flow: null });
    expect(reader.getState().flow).toBeNull();
  });

  it('keeps the bridged message line only as a frozen value, writing only a new one, and leaves it across a run clear', () => {
    const { reader, commit } = createGameStore(7);
    const states = history(reader);
    expect(() => commit({ messages: { runId: 1, head: null, incoming: null } })).toThrow(TypeError);
    expect(states).toHaveLength(0);
    const messages = Object.freeze({ runId: 1, head: null, incoming: null });
    commit({ messages });
    commit({ messages, clearRun: true });
    expect(reader.getState().messages).toBe(messages);
    expect(states).toHaveLength(1);
    commit({ messages: null });
    expect(reader.getState().messages).toBeNull();
    expect(states).toHaveLength(2);
  });

  it('adds pending commands under its own owner once, and settles only matching owner, run and command keys', () => {
    const { reader, commit } = createGameStore(7);
    commit({ addPending: { runId: 1, commandId: 1, commandType: 'launch' } });
    commit({ addPending: { runId: 1, commandId: 1, commandType: 'launch' } });
    commit({ addPending: { runId: 1, commandId: 2, commandType: 'speed' } });
    expect(reader.getState().pendingCommands).toEqual([
      { ownerId: 7, runId: 1, commandId: 1, commandType: 'launch' }, { ownerId: 7, runId: 1, commandId: 2, commandType: 'speed' },
    ]);
    expect(commit({ settle: [rejected(1, 2), rejected(1, 1, 8), rejected(3)] })).toBe(0);
    expect(reader.getState().recentResults).toEqual([]);
    expect(commit({ settle: [rejected(2), rejected(2), { ownerId: 7, runId: 1, commandId: 1, outcome: 'cancelled', reason: 'hidden' }] })).toBe(2);
    expect(reader.getState().pendingCommands).toEqual([]);
    expect(reader.getState().recentResults).toEqual([
      expect.objectContaining({ commandId: 2, commandType: 'speed', outcome: 'rejected', reason: 'not-implemented' }),
      { ownerId: 7, runId: 1, commandId: 1, commandType: 'launch', outcome: 'cancelled', reason: 'hidden' },
    ]);
    expect(Object.isFrozen(reader.getState().recentResults[0])).toBe(true);
    expect(commit({ settle: [rejected(2)] })).toBe(0);
  });

  it(`keeps the newest ${RECENT_RESULT_LIMIT} results, and clears the run before applying the rest of a change`, () => {
    const { reader, commit } = createGameStore(7);
    for (let commandId = 1; commandId <= 12; commandId++) commit({ addPending: { runId: 1, commandId, commandType: 'launch' } });
    commit({ settle: Array.from({ length: 12 }, (_, index) => rejected(index + 1)) });
    expect(reader.getState().recentResults.map((result) => result.commandId)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    commit({ addPending: { runId: 1, commandId: 13, commandType: 'launch' } });
    const states = history(reader);
    commit({ clearRun: true, status: { ...running, runId: 2 }, addPending: { runId: 2, commandId: 1, commandType: 'launch' } });
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ status: { runId: 2 }, pendingCommands: [{ runId: 2, commandId: 1 }], recentResults: [] });
  });

  it('offers scalar selectors', () => {
    const { reader, commit } = createGameStore(7);
    const state: GameUiState = reader.getState();
    expect([selectOwnerId(state), selectPhase(state), selectRunId(state), selectTick(state)]).toEqual([7, null, null, null]);
    const projection = createGameRuntime(runtimeSpec()).projection();
    commit({ status: running, projection });
    expect([selectPhase(reader.getState()), selectRunId(reader.getState()), selectTick(reader.getState())]).toEqual(['running', 1, 0]);
  });
});
