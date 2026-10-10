vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => capacity.wrap(original.createRecordingSession(input, options)),
  };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions, RecordingSession } from '../../core/replay/recording.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import { developmentRecording } from './mission-owner.ts';
import { openMission, toFlight } from './mission.test-support.ts';

// P3-04 AC-10 (Node), the stopped phase: a development run whose recording refuses a tick stops, and keeps its one
// leave guard, for the recording it still holds, until exit or dispose (docs/plan/p3/04/spec.md, 离页保护). The refusal
// is injected where the world is created, as in the Session's own tests; reaching the real capacity takes 131,072 ticks.

const capacity = vi.hoisted(() => ({
  /** The step that the recording refuses, counted per recording; null refuses none. */
  refuseAt: null as number | null,
  wrap(session: RecordingSession): RecordingSession {
    let steps = 0;
    const refuseAt = this.refuseAt;
    return new Proxy(session, {
      get(target, key) {
        const value = Reflect.get(target, key, target) as unknown;
        if (key !== 'step' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
        return (...args: unknown[]) => {
          steps += 1;
          if (steps === refuseAt) throw new CoreInputError('recording', 'would exceed the recorded tick limit');
          return (value as (...input: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  },
}));

afterEach(() => { capacity.refuseAt = null; });

describe('a stopped run', () => {
  it('ends the flow as stopped with its leave guard, which exit and dispose revoke', async () => {
    capacity.refuseAt = 3;
    const setup = await openMission('mission-startable', { recording: developmentRecording('osr-test') });
    const { owner, host, guard } = setup;
    toFlight(owner);
    host.deliver(0);
    host.deliver(5 * TICK_MS);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'ended', ended: 'stopped', runId: 1 }, session: { phase: 'stopped', stopReason: 'recording-capacity' } });
    expect({ guards: guard.active, frames: host.pending.size }).toEqual({ guards: 1, frames: 0 });
    expect(setup.run()!.exportRecording()!.record.ticks).toHaveLength(2);
    owner.restart();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'intro' }, session: { phase: 'idle' } });
    expect(guard.active).toBe(0);

    toFlight(owner);
    host.deliver(10 * TICK_MS);
    host.deliver(15 * TICK_MS);
    expect(owner.getSnapshot().session.phase).toBe('stopped');
    expect(guard.active).toBe(1);
    setup.slot.release();
    expect(guard.active).toBe(0);
  });
});
