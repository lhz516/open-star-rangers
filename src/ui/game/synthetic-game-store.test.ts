import { describe, expect, it } from 'vitest';
import { createSyntheticScene } from '../../core/synthetic/synthetic-scene.ts';
import type { SessionStatus } from '../../app/session/synthetic-session.ts';
import {
  RECENT_RESULT_LIMIT, createSyntheticGameStore, selectMarkerId, selectPhase, selectRunId, selectTick,
  type SyntheticGameState, type SyntheticGameStoreReader,
} from './synthetic-game-store.ts';

const running: SessionStatus = Object.freeze({
  phase: 'running', runId: 1, environmentVisible: true, pauseReason: null, cleanupFailed: false, error: null,
});

function countChanges<T>(reader: SyntheticGameStoreReader, selector: (state: SyntheticGameState) => T): () => number {
  let changes = 0;
  reader.subscribe((state, previous) => { if (!Object.is(selector(state), selector(previous))) changes++; });
  return () => changes;
}

function history(reader: SyntheticGameStoreReader): SyntheticGameState[] {
  const states: SyntheticGameState[] = [];
  reader.subscribe(state => { states.push(state); });
  return states;
}

describe('synthetic game store', () => {
  it('starts empty and exposes only a frozen read-only handle', () => {
    const { reader } = createSyntheticGameStore();
    expect(reader.getState()).toEqual({
      status: null, projection: null, pendingCommands: [], recentResults: [], actionError: null, sessionError: null,
    });
    expect(reader.getInitialState()).toBe(reader.getState());
    expect(Object.isFrozen(reader.getState())).toBe(true);
    expect(Object.isFrozen(reader.getState().pendingCommands)).toBe(true);
    expect(Object.keys(reader).sort()).toEqual(['getInitialState', 'getState', 'subscribe']);
    expect(Object.isFrozen(reader)).toBe(true);
    // @ts-expect-error The reader handed to React has no write entry.
    expect(reader.setState).toBeUndefined();
    // @ts-expect-error State arrays are read-only.
    expect(() => reader.getState().pendingCommands.push({ runId: 1, commandId: 1, commandType: 'add-marker' })).toThrow(TypeError);
  });

  it('notifies only for changed fields and detaches stored records from caller objects', () => {
    const { reader, commit } = createSyntheticGameStore();
    const states = history(reader);
    const status = { ...running };
    commit({ status });
    commit({ status: reader.getState().status, actionError: null, projection: null, settle: [], clearRun: true });
    expect(states).toHaveLength(1);
    status.phase = 'paused';
    const stored = reader.getState().status;
    expect(stored).toEqual(running);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(() => { (stored as { phase: string }).phase = 'idle'; }).toThrow(TypeError);
    const cause = new Error('rejected control');
    const actionError = { operation: 'start' as const, cause };
    commit({ actionError });
    expect(reader.getState().actionError).toEqual({ operation: 'start', cause });
    expect(reader.getState().actionError).not.toBe(actionError);
    expect(Object.isFrozen(reader.getState().actionError)).toBe(true);
    expect(reader.getState().actionError?.cause).toBe(cause);
    expect(Object.keys(reader.getState()).sort()).toEqual(
      ['actionError', 'pendingCommands', 'projection', 'recentResults', 'sessionError', 'status'],
    );
  });

  it('keeps marker, phase and list selectors quiet across tick and coordinate updates', () => {
    const { reader, commit } = createSyntheticGameStore();
    const scene = createSyntheticScene({ seed: 0, tickRateHz: 50 });
    commit({ status: running, projection: scene.uiProjection(), addPending: { runId: 1, commandId: 1, commandType: 'add-marker' } });
    const pending = reader.getState().pendingCommands;
    const counts = {
      tick: countChanges(reader, selectTick), marker: countChanges(reader, selectMarkerId),
      phase: countChanges(reader, selectPhase), runId: countChanges(reader, selectRunId),
      pending: countChanges(reader, state => state.pendingCommands),
    };
    for (let tick = 0; tick < 3; tick++) {
      scene.step({ input: { moveX: 1 }, commands: [] });
      commit({ projection: scene.uiProjection() });
    }
    expect([counts.tick(), counts.marker(), counts.phase(), counts.runId(), counts.pending()]).toEqual([3, 0, 0, 0, 0]);
    expect(reader.getState().pendingCommands).toBe(pending);
    scene.step({ input: { moveX: 1 }, commands: [{ type: 'add-marker' }] });
    commit({ projection: scene.uiProjection() });
    expect(counts.marker()).toBe(1);
    expect(selectMarkerId(reader.getState())).toBe(scene.uiProjection().marker?.id);
    commit({ status: { ...running, phase: 'paused', pauseReason: 'user' } });
    expect([counts.phase(), counts.runId(), counts.marker()]).toEqual([1, 0, 1]);
  });

  it('keeps the raw input action cause in a frozen error record, separately from session errors', () => {
    const { reader, commit } = createSyntheticGameStore();
    const cause = new Error('input failed');
    commit({ actionError: { operation: 'input', cause } });
    expect(reader.getState().actionError).toEqual({ operation: 'input', cause });
    expect(reader.getState().actionError?.cause).toBe(cause);
    expect(Object.isFrozen(reader.getState().actionError)).toBe(true);
    expect(reader.getState().sessionError).toBeNull();
    const before = reader.getState();
    commit({ actionError: before.actionError });
    expect(reader.getState()).toBe(before);
  });

  it('settles each pending command once in order and ignores unknown or repeated IDs', () => {
    const { reader, commit } = createSyntheticGameStore();
    commit({ addPending: { runId: 1, commandId: 1, commandType: 'add-marker' } });
    commit({ addPending: { runId: 1, commandId: 2, commandType: 'remove-marker' } });
    commit({ addPending: { runId: 2, commandId: 1, commandType: 'remove-marker' } });
    expect(commit({ settle: [
      { runId: 1, commandId: 9, outcome: 'cancelled', reason: 'user-pause' },
      { runId: 1, commandId: 2, outcome: 'cancelled', reason: 'user-pause' },
      { runId: 1, commandId: 1, outcome: 'unconfirmed', reason: 'session-failed' },
      { runId: 1, commandId: 1, outcome: 'cancelled', reason: 'failure' },
    ] })).toBe(2);
    expect(reader.getState().pendingCommands).toEqual([{ runId: 2, commandId: 1, commandType: 'remove-marker' }]);
    expect(reader.getState().recentResults).toEqual([
      { runId: 1, commandId: 2, commandType: 'remove-marker', outcome: 'cancelled', reason: 'user-pause' },
      { runId: 1, commandId: 1, commandType: 'add-marker', outcome: 'unconfirmed', reason: 'session-failed' },
    ]);
    expect(reader.getState().recentResults.every(Object.isFrozen)).toBe(true);
    const states = history(reader);
    expect(commit({ settle: [{ runId: 1, commandId: 1, outcome: 'cancelled', reason: 'exit' }] })).toBe(0);
    expect(states).toHaveLength(0);
  });

  it('applies run transitions as one coherent snapshot', () => {
    const { reader, commit } = createSyntheticGameStore();
    const scene = createSyntheticScene({ seed: 0, tickRateHz: 50 });
    commit({ status: running, projection: scene.uiProjection() });
    commit({ addPending: { runId: 1, commandId: 1, commandType: 'add-marker' } });
    commit({ addPending: { runId: 1, commandId: 2, commandType: 'remove-marker' } });
    const states = history(reader);
    const faulted: SessionStatus = Object.freeze({ ...running, phase: 'faulted' });
    commit({ settle: [{ runId: 1, commandId: 2, outcome: 'cancelled', reason: 'failure' }] });
    commit({ status: faulted, settle: [{ runId: 1, commandId: 1, outcome: 'unconfirmed', reason: 'session-failed' }] });
    expect(states).toHaveLength(2);
    expect(states[1]).toMatchObject({ status: faulted, pendingCommands: [] });
    expect(states[1].recentResults.map(result => result.outcome)).toEqual(['cancelled', 'unconfirmed']);
    const next = createSyntheticScene({ seed: 0, tickRateHz: 50 }).uiProjection();
    commit({ status: { ...running, runId: 2 }, projection: next, sessionError: null, clearRun: true });
    expect(states).toHaveLength(3);
    expect(states[2]).toMatchObject({ status: { phase: 'running', runId: 2 }, projection: next, pendingCommands: [], recentResults: [] });
    commit({ addPending: { runId: 2, commandId: 1, commandType: 'add-marker' } });
    commit({ status: { ...running, phase: 'idle', runId: null }, projection: null, clearRun: true });
    expect(states).toHaveLength(5);
    expect(states[4]).toMatchObject({ status: { phase: 'idle', runId: null }, projection: null, pendingCommands: [], recentResults: [] });
  });

  it('keeps at most the newest results and clears run-scoped feedback', () => {
    const { reader, commit } = createSyntheticGameStore();
    const total = RECENT_RESULT_LIMIT + 2;
    for (let commandId = 1; commandId <= total; commandId++) commit({ addPending: { runId: 3, commandId, commandType: 'add-marker' } });
    for (let commandId = 1; commandId <= total; commandId++) commit({ settle: [{ runId: 3, commandId, outcome: 'cancelled', reason: 'hidden' }] });
    expect(reader.getState().recentResults.map(result => result.commandId)).toEqual(
      Array.from({ length: RECENT_RESULT_LIMIT }, (_, index) => index + 3),
    );
    commit({ addPending: { runId: 3, commandId: 99, commandType: 'remove-marker' } });
    commit({ clearRun: true });
    expect(reader.getState()).toMatchObject({ pendingCommands: [], recentResults: [] });
    const states = history(reader);
    commit({ clearRun: true });
    expect(states).toHaveLength(0);
  });
});
