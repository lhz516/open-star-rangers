import { describe, expect, it } from 'vitest';
import { GameSessionError } from '../../app/session/session-errors.ts';
import type { SessionStatus } from '../../app/session/synthetic-session.ts';
import { createSyntheticGameControls, syntheticControlAvailability } from './synthetic-game-controls.ts';
import { setupCommandFeedback } from './synthetic-ui.test-support.ts';

const base: SessionStatus = Object.freeze({
  phase: 'running', runId: 1, environmentVisible: true, pauseReason: null, cleanupFailed: false, error: null,
});
const status = (patch: Partial<SessionStatus>): SessionStatus => Object.freeze({ ...base, ...patch });

function setup() {
  const context = setupCommandFeedback();
  return { ...context, controls: createSyntheticGameControls(context.writer, context.session) };
}

const enabled = (current: SessionStatus | null) => Object.entries(syntheticControlAvailability(current))
  .filter(([, value]) => value).map(([key]) => key).sort();

describe('synthetic game controls: availability', () => {
  it.each([
    ['no controller', null, []],
    ['idle', status({ phase: 'idle', runId: null }), ['start']],
    ['idle after a cleanup failure', status({ phase: 'idle', runId: null, cleanupFailed: true }), []],
    ['running', base, ['add-marker', 'exit', 'pause', 'remove-marker', 'restart']],
    ['paused and visible', status({ phase: 'paused', pauseReason: 'user' }), ['exit', 'restart', 'resume']],
    ['paused while hidden', status({ phase: 'paused', pauseReason: 'hidden', environmentVisible: false }), ['exit', 'restart']],
    ['faulted', status({ phase: 'faulted' }), ['exit', 'restart']],
    ['faulted after a cleanup failure', status({ phase: 'faulted', cleanupFailed: true }), ['exit']],
    ['disposed', status({ phase: 'disposed', runId: null }), []],
  ] as const)('enables exactly the allowed controls when %s', (_, current, expected) => {
    expect(enabled(current)).toEqual([...expected].sort());
    expect(Object.isFrozen(syntheticControlAvailability(current))).toBe(true);
    expect(syntheticControlAvailability(current && { ...current })).toBe(syntheticControlAvailability(current));
  });
});

describe('synthetic game controls: actions', () => {
  it('keeps a rejected control as actionError and clears it on the next successful attempt', () => {
    const { reader, controls } = setup();
    controls.control('pause');
    expect(reader.getState().actionError).toEqual({
      operation: 'pause', cause: expect.objectContaining({ kind: 'invalid-state', operation: 'pause', phase: 'idle' }),
    });
    expect(reader.getState().actionError?.cause).toBeInstanceOf(GameSessionError);
    expect(reader.getState().sessionError).toBeNull();
    const snapshots: { phase: string | undefined; actionError: unknown }[] = [];
    reader.subscribe(state => { snapshots.push({ phase: state.status?.phase, actionError: state.actionError }); });
    controls.control('start');
    expect(reader.getState()).toMatchObject({ actionError: null, status: { phase: 'running', runId: 1 } });
    expect(snapshots[0]).toEqual({ phase: 'idle', actionError: null });
    expect(snapshots.filter(snapshot => snapshot.phase === 'running').every(snapshot => snapshot.actionError === null)).toBe(true);
  });

  it('disables resume while hidden, keeps paused after returning visible, and cancels pending intent', () => {
    const { reader, controls, feedback, host } = setup();
    controls.control('start');
    host.deliver(0);
    feedback.submit('add-marker');
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(syntheticControlAvailability(reader.getState().status).resume).toBe(false);
    expect(reader.getState().recentResults).toEqual([
      { runId: 1, commandId: 1, commandType: 'add-marker', outcome: 'cancelled', reason: 'hidden' },
    ]);
    controls.control('resume');
    expect(reader.getState().actionError).toEqual({ operation: 'resume', cause: expect.objectContaining({ kind: 'invalid-state' }) });
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(reader.getState().status).toMatchObject({ phase: 'paused', environmentVisible: true });
    expect(syntheticControlAvailability(reader.getState().status)).toMatchObject({ resume: true, 'add-marker': false });
    controls.control('resume');
    expect(reader.getState()).toMatchObject({ actionError: null, status: { phase: 'running' } });
  });

  it('keeps start and restart blocked by cleanupFailed after a later error replaces the session error', () => {
    const { reader, controls, host, session, errors } = setup();
    controls.control('start');
    const run = session.currentRun();
    if (!run) throw new Error('Expected run');
    const release = run.ownCleanup(() => { throw new Error('cleanup'); });
    expect(() => release()).toThrow(GameSessionError);
    run.onFrame(() => { session.control({ type: 'restart' }); });
    host.deliver(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].failures?.[0].phase).toBe('control');
    expect(reader.getState()).toMatchObject({ sessionError: errors[0], status: { phase: 'running', cleanupFailed: true } });
    expect(syntheticControlAvailability(reader.getState().status)).toMatchObject({ start: false, restart: false, exit: true });
    controls.control('restart');
    expect(reader.getState().actionError).toMatchObject({ operation: 'restart', cause: { kind: 'invalid-state', reason: 'cleanup previously failed' } });
    expect(reader.getState().sessionError).toBe(errors[0]);
    controls.control('exit');
    expect(reader.getState()).toMatchObject({ actionError: null, status: { phase: 'idle', cleanupFailed: true }, projection: null });
    expect(syntheticControlAvailability(reader.getState().status).start).toBe(false);
    controls.control('start');
    expect(reader.getState().actionError).toMatchObject({ operation: 'start', cause: { kind: 'invalid-state' } });
  });
});
