vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => injection.wrap(original.createRecordingSession(input, options)),
  };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { toFlight } from '../../app/mission/mission.test-support.ts';
import { TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import { CoreFaultError, CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions, RecordingSession } from '../../core/replay/recording.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { openDiagnostics } from './dev-diagnostics.test-support.ts';
import { selectCanRead } from './mission-diagnostics.ts';

// P3-04 S-07 (Node) with Core's own refusals and faults, injected only where the owner creates the recording session:
// a stopped run still exports its successful prefix, and a Core fault that a snapshot or export finds faults the run and
// is shown, while a copy kept from before stays retryable.

const injection = vi.hoisted(() => {
  const calls = new Map<string, number>();
  let armed: { method: 'step' | 'snapshot' | 'exportRecording'; nth: number; error: () => Error } | null = null;
  return {
    arm(method: 'step' | 'snapshot' | 'exportRecording', nth: number, error: () => Error) { calls.clear(); armed = { method, nth, error }; },
    reset() { calls.clear(); armed = null; },
    wrap(session: RecordingSession): RecordingSession {
      return new Proxy(session, {
        get(target, key) {
          const value = Reflect.get(target, key, target) as unknown;
          if (typeof value !== 'function') return value;
          return (...args: unknown[]) => {
            const count = (calls.get(String(key)) ?? 0) + 1;
            calls.set(String(key), count);
            if (armed?.method === key && armed.nth === count) throw armed.error();
            return (value as (...input: unknown[]) => unknown).apply(target, args);
          };
        },
      });
    },
  };
});

afterEach(() => { injection.reset(); });

async function flying() {
  const setup = await openDiagnostics();
  toFlight(setup.owner);
  setup.timingClock.time = 10;
  setup.host.deliver(0);
  return setup;
}

describe('mission diagnostics with Core refusals and faults', () => {
  it('exports and inspects a run stopped by the recording capacity', async () => {
    const setup = await flying();
    injection.arm('step', 3, () => new CoreInputError('recording', 'would exceed the recorded tick limit'));
    setup.timingClock.time += 16;
    setup.host.deliver(5 * TICK_MS);
    expect(setup.state()).toMatchObject({ phase: 'stopped', frames: { samples: 2, totalTicks: 2 } });
    expect(selectCanRead(setup.state())).toBe(true);
    setup.diagnostics.refreshSnapshot();
    setup.diagnostics.exportRecording();
    expect(setup.state()).toMatchObject({ inspection: { view: { tick: 2 }, error: null }, recording: { last: { status: 'requested', finalTick: 2 } } });
    expect((JSON.parse(await setup.saves.text()) as { record: { ticks: unknown[] } }).record.ticks).toHaveLength(2);
  });

  it('shows the Core fault a snapshot finds, which faults the run', async () => {
    const setup = await flying();
    setup.diagnostics.refreshSnapshot();
    const view = setup.state().inspection.view;
    const fault = new CoreFaultError('invariant-violated', 'test.snapshot');
    injection.arm('snapshot', 1, () => fault);
    setup.diagnostics.refreshSnapshot();
    expect(setup.state()).toMatchObject({ phase: 'faulted', inspection: { view } });
    expect(setup.state().inspection.error).not.toBeNull();
    expect(setup.owner.getSnapshot()).toMatchObject({ flow: { position: 'ended', ended: 'faulted' }, session: { phase: 'faulted' } });
    expect(setup.host.pending.size).toBe(0);
  });

  it('shows the Core fault an export finds, and still retries the copy kept before', async () => {
    const setup = await flying();
    setup.saves.clickFailure = new Error('click');
    setup.diagnostics.exportRecording();
    setup.saves.clickFailure = undefined;
    injection.arm('exportRecording', 1, () => new CoreFaultError('invariant-violated', 'test.export'));
    setup.diagnostics.exportRecording();
    expect(setup.state()).toMatchObject({ phase: 'faulted', recording: { last: { status: 'failed', stage: 'export' }, retained: { finalTick: 0 } } });
    setup.diagnostics.retrySave();
    expect(setup.state().recording).toMatchObject({ last: { status: 'requested', finalTick: 0 }, retained: null });
  });
});
