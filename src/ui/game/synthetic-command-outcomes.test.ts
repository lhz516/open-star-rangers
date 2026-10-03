import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SceneModule from '../../core/synthetic/synthetic-scene.ts';
import type { SyntheticSceneConfig, TickInput } from '../../core/synthetic/synthetic-scene.ts';
import type { SyntheticGameState } from './synthetic-game-store.ts';
import { setupCommandFeedback } from './synthetic-ui.test-support.ts';

const injection = vi.hoisted(() => ({ failOn: 0, calls: 0, cause: new Error('Core injection') }));
vi.mock('../../core/synthetic/synthetic-scene.ts', async importOriginal => {
  const original = await importOriginal<typeof SceneModule>();
  return {
    ...original,
    createSyntheticScene(config: SyntheticSceneConfig) {
      const scene = original.createSyntheticScene(config);
      return {
        inspect: () => scene.inspect(), uiProjection: () => scene.uiProjection(), renderState: () => scene.renderState(),
        step(input: TickInput) {
          injection.calls++;
          if (injection.calls === injection.failOn) throw injection.cause;
          return scene.step(input);
        },
      };
    },
  };
});
beforeEach(() => { injection.calls = 0; });
afterEach(() => { injection.failOn = 0; });

function setup() {
  const context = setupCommandFeedback();
  context.session.control({ type: 'start' });
  context.host.deliver(0);
  const history: SyntheticGameState[] = [];
  context.reader.subscribe(state => { history.push(state); });
  return { ...context, history };
}

type Context = ReturnType<typeof setup>;

/** Submits add then remove, applies `trigger`, and returns the first snapshot showing their results. */
function cancelBoth(context: Context, trigger: (context: Context) => void): SyntheticGameState {
  context.feedback.submit('add-marker');
  context.feedback.submit('remove-marker');
  context.history.length = 0;
  trigger(context);
  const cancelled = context.history.find(state => state.recentResults.length > 0);
  if (!cancelled) throw new Error('Expected a cancellation snapshot');
  expect(cancelled.pendingCommands).toEqual([]);
  return cancelled;
}

const outcomes = (state: SyntheticGameState) => state.recentResults.map(result => [
  result.runId, result.commandId, result.outcome, 'reason' in result ? result.reason : result.event.type,
]);

describe('synthetic command outcomes: cancellation', () => {
  it.each([
    ['user-pause', (context: Context) => { context.session.control({ type: 'pause' }); }],
    ['hidden', (context: Context) => { context.host.emit({ type: 'visibility', visibility: 'hidden' }); }],
  ] as const)('cancels queued commands in FIFO order with reason %s and keeps them cancelled after resume', (reason, trigger) => {
    const context = setup();
    const cancelled = cancelBoth(context, trigger);
    expect(outcomes(cancelled)).toEqual([[1, 1, 'cancelled', reason], [1, 2, 'cancelled', reason]]);
    expect(outcomes(context.reader.getState())).toEqual(outcomes(cancelled));
    if (reason === 'hidden') context.host.emit({ type: 'visibility', visibility: 'visible' });
    context.session.control({ type: 'resume' });
    context.host.deliver(1000); context.host.deliver(1020);
    expect(context.currentRun().uiProjection().marker).toBeNull();
    expect(outcomes(context.reader.getState())).toEqual(outcomes(cancelled));
  });

  it.each([
    ['restart', (context: Context) => { context.session.control({ type: 'restart' }); }],
    ['exit', (context: Context) => { context.session.control({ type: 'exit' }); }],
    ['dispose', (context: Context) => { context.session.control({ type: 'dispose' }); }],
  ] as const)('shows %s cancellations before the run ends, then clears run feedback', (reason, trigger) => {
    const context = setup();
    const cancelled = cancelBoth(context, trigger);
    expect(outcomes(cancelled)).toEqual([[1, 1, 'cancelled', reason], [1, 2, 'cancelled', reason]]);
    expect(context.reader.getState()).toMatchObject({ pendingCommands: [], recentResults: [] });
  });

  it('cancels queued commands with reason failure when a frame consumer faults the run', () => {
    const context = setup();
    context.feedback.submit('add-marker');
    context.currentRun().onFrame(() => { throw new Error('frame consumer'); });
    context.host.deliver(5);
    expect(context.reader.getState()).toMatchObject({ status: { phase: 'faulted' }, pendingCommands: [] });
    expect(outcomes(context.reader.getState())).toEqual([[1, 1, 'cancelled', 'failure']]);
  });

  it('isolates reused command and run IDs across runs and owners', () => {
    const first = setup();
    first.feedback.submit('add-marker');
    first.session.control({ type: 'restart' });
    first.host.deliver(0);
    first.feedback.submit('add-marker');
    expect(first.reader.getState().pendingCommands).toEqual([{ runId: 2, commandId: 1, commandType: 'add-marker' }]);
    const before = first.reader.getState();
    for (const { runId, listener } of first.recorded.cancellations) {
      if (runId === 1) listener(Object.freeze({ runId: 1, commandIds: Object.freeze([1]), reason: 'exit' }));
    }
    expect(first.reader.getState()).toBe(before);
    const second = setup();
    second.feedback.submit('add-marker');
    first.host.deliver(20);
    expect(outcomes(first.reader.getState())).toEqual([[2, 1, 'accepted', 'marker-added']]);
    expect(second.reader.getState()).toMatchObject({ pendingCommands: [{ runId: 1, commandId: 1 }], recentResults: [] });
  });
});

describe('synthetic command outcomes: faults', () => {
  it('marks commands whose tick ran before a later tick failed as unconfirmed, keeping the committed projection', () => {
    const context = setup();
    context.feedback.submit('add-marker');
    injection.failOn = injection.calls + 2;
    context.host.deliver(40);
    const state = context.reader.getState();
    expect(context.errors[0].failures).toEqual([{ phase: 'runtime', cause: expect.objectContaining({ kind: 'faulted', cause: injection.cause }) }]);
    expect(state).toMatchObject({ status: { phase: 'faulted' }, pendingCommands: [], sessionError: context.errors[0] });
    expect(outcomes(state)).toEqual([[1, 1, 'unconfirmed', 'session-failed']]);
    expect(state.projection?.tick).toBe(1);
    expect(state.projection?.marker).not.toBeNull();
    expect(state.projection).toEqual(context.currentRun().uiProjection());
    const recording = context.history.filter(snapshot => snapshot.status?.phase === 'faulted');
    expect(recording.length).toBeGreaterThan(0);
    expect(recording.every(snapshot => snapshot.pendingCommands.length === 0)).toBe(true);
    context.session.control({ type: 'restart' });
    context.host.deliver(0); context.host.deliver(20);
    expect(context.reader.getState()).toMatchObject({ pendingCommands: [], recentResults: [] });
    expect(context.currentRun().uiProjection()).toMatchObject({ tick: 1, marker: null });
  });

  it('cancels unconsumed commands when the first tick of a frame fails', () => {
    const context = setup();
    context.feedback.submit('add-marker');
    injection.failOn = injection.calls + 1;
    context.host.deliver(20);
    expect(outcomes(context.reader.getState())).toEqual([[1, 1, 'cancelled', 'failure']]);
    expect(context.reader.getState().projection).toMatchObject({ tick: 0, marker: null });
  });

  it('keeps a result received before a consumer failure instead of marking it unconfirmed', () => {
    const context = setup();
    context.feedback.submit('add-marker');
    context.currentRun().onAny(() => { throw new Error('later domain listener'); });
    context.host.deliver(20);
    expect(context.reader.getState()).toMatchObject({ status: { phase: 'faulted' }, pendingCommands: [] });
    expect(outcomes(context.reader.getState())).toEqual([[1, 1, 'accepted', 'marker-added']]);
    expect(context.errors[0].failures?.[0].phase).toBe('consumer');
  });
});
