vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => injection.wrap(original.createWorld(input)) };
});
vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => injection.wrap(original.createRecordingSession(input, options)),
  };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TICK_MS, recordingOptions } from '../../app/runtime/game-runtime.test-support.ts';
import { GameRuntimeError } from '../../app/runtime/runtime-errors.ts';
import { CoreFaultError, CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions } from '../../core/replay/recording.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import type { GameUiState } from './game-store.ts';
import { history, startedFeedback } from './game-ui.test-support.ts';

// Real Core faults and recording refusals, injected only where the test creates the world (as the Session's fault
// tests do): the `nth` step from arming runs `replace`, which may call the real step.

const injection = vi.hoisted(() => {
  let steps = 0;
  let armed: { nth: number; replace: (real: () => unknown) => unknown } | null = null;
  return {
    arm(nth: number, replace: (real: () => unknown) => unknown) { steps = 0; armed = { nth, replace }; },
    reset() { steps = 0; armed = null; },
    wrap<World extends { step(...args: unknown[]): unknown }>(world: World): World {
      return new Proxy(world, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (key !== 'step' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
          return (...args: unknown[]) => {
            const real = () => (value as (...a: unknown[]) => unknown).apply(target, args);
            return armed && ++steps === armed.nth ? armed.replace(real) : real();
          };
        },
      });
    },
  };
});

afterEach(() => { injection.reset(); });

const launch = Object.freeze({ type: 'launch' as const });
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const settled = (state: GameUiState, outcome: string) => state.recentResults.filter((result) => result.outcome === outcome).map((result) => result.commandId);

/** A run anchored at 0 with `queued` commands submitted through the feedback (IDs 1…queued), 64 taken per tick. */
function prepared(queued: number, recording = false) {
  const context = startedFeedback({}, { recording: recording ? recordingOptions(1) : null });
  for (let index = 0; index < queued; index++) context.feedback.submit(launch);
  return context;
}

describe('game command feedback with real Core faults', () => {
  it('marks a faulted frame\'s batches unconfirmed in the faulted write, after cancelling the commands never taken', () => {
    const { reader, host, errors, currentRun } = prepared(150);
    injection.arm(2, (real) => { real(); throw new CoreFaultError('invariant-violated', 'test.step'); });
    const states = history(reader);
    host.deliver(3 * TICK_MS);
    const runtimeError = errors[0].failures?.[0].cause;
    expect(runtimeError).toBeInstanceOf(GameRuntimeError);
    expect(runtimeError).toMatchObject({ kind: 'faulted', unconfirmed: ids(1, 128) });
    expect(states.map((state) => state.status?.phase)).toEqual(['running', 'faulted', 'faulted']);
    expect(settled(states[0], 'cancelled')).toEqual(ids(141, 150));
    expect(states[0].pendingCommands.map((pending) => pending.commandId)).toEqual(ids(1, 128));
    expect(states[1].pendingCommands).toEqual([]);
    expect(states[1].recentResults).toHaveLength(10);
    expect(states[1].recentResults.map(({ commandId, outcome, reason }) => [commandId, outcome, reason]))
      .toEqual(ids(119, 128).map((id) => [id, 'unconfirmed', 'session-failed']));
    expect(states[1].projection).toBe(currentRun().projection());
    expect(states[1].projection?.clock.tick).toBe(1);
    expect(states[2].sessionError).toBe(errors[0]);
  });

  it('marks the batch of a failing first step unconfirmed, since it may have partly run, and cancels only the rest', () => {
    const { reader, host, errors } = prepared(70);
    injection.arm(1, () => { throw new CoreFaultError('invariant-violated', 'test.step'); });
    const states = history(reader);
    host.deliver(TICK_MS);
    expect(errors[0].failures?.[0].cause).toMatchObject({ kind: 'faulted', unconfirmed: ids(1, 64) });
    expect(settled(states[0], 'cancelled')).toEqual(ids(65, 70));
    expect(states[0].pendingCommands.map((pending) => pending.commandId)).toEqual(ids(1, 64));
    expect(reader.getState()).toMatchObject({ status: { phase: 'faulted' }, pendingCommands: [], projection: { clock: { tick: 0 } } });
    expect(settled(reader.getState(), 'unconfirmed')).toEqual(ids(55, 64));
  });

  it('settles a recording-capacity stop: results of the earlier ticks, the rest cancelled, then the still frame and stop', () => {
    const { reader, host, currentRun, errors } = prepared(100, true);
    injection.arm(2, () => { throw new CoreInputError('recording', 'would exceed 131072 recorded ticks'); });
    const states = history(reader);
    host.deliver(3 * TICK_MS);
    expect(errors).toEqual([]);
    expect(states.map((state) => [state.status?.phase, state.projection?.clock.tick])).toEqual([['running', 1], ['running', 1], ['stopped', 1]]);
    expect(settled(states[0], 'rejected')).toEqual(ids(55, 64));
    expect(states[0].pendingCommands.map((pending) => pending.commandId)).toEqual(ids(65, 100));
    expect(states[1].recentResults.map(({ commandId, outcome, reason }) => [commandId, outcome, reason]))
      .toEqual(ids(91, 100).map((id) => [id, 'cancelled', 'recording-capacity']));
    expect(states[2]).toMatchObject({ status: { phase: 'stopped', stopReason: 'recording-capacity' }, pendingCommands: [] });
    expect(reader.getState().projection).toBe(currentRun().projection());
    expect(host.pending.size).toBe(0);
  });
});
