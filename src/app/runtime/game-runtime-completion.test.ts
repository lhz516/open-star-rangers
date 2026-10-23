vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const { wrapWorld } = await import('./transition-injection.test-support.ts');
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import { completedRun } from '../../core/replay/recording.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { createGameRuntime, MAX_TICKS_PER_FRAME, type FrameReport, type GameRuntime } from './game-runtime.ts';
import { NEUTRAL_AXES, recordingOptions, runtimeSpec, TICK_MS } from './game-runtime.test-support.ts';
import { SUCCESS_COMPLETION_TICK, successSpec } from './mission-end.test-support.ts';
import { GameRuntimeError } from './runtime-errors.ts';
import { injectedResult, injection } from './transition-injection.test-support.ts';

// P3-11 AC-11, the Runtime part (docs/plan/p3/04/spec.md, 终局与救援衔接（P3-11 的修订）, Runtime 的完成截断): a step
// whose events include `mission-completed` is the run's last. The frame reports the cut and the completion, raises a
// barrier that is never lowered before its delivery, and delivers that tick in full; afterwards no tick, input or
// re-anchoring is accepted, while reads, the recording's export and the Session's clean-up stay available. A real
// synthetic run reaches its completion from its input; injected completions (transition-injection.test-support.ts)
// cover queues, receivers and the contract violation.

afterEach(() => { injection.reset(); });

const REFUSED = { kind: 'completed' };

/** Frames of `frameMs` from time 0 until a frame is cut at the completion; returns that frame's report. */
function runToCompletion(runtime: GameRuntime, frameMs: number): FrameReport {
  runtime.frame(0);
  for (let now = frameMs; now < 3_600_000; now += frameMs) {
    const report = runtime.frame(now);
    if (report.cut !== null) return report;
    expect(report.capped).toBe(frameMs > MAX_TICKS_PER_FRAME * TICK_MS);
  }
  throw new Error('the run did not complete');
}

/** A Runtime anchored at time 0 that logs every delivery as `<type>@<tick>` with its command ID. */
function anchored() {
  const runtime = createGameRuntime(runtimeSpec());
  const log: string[] = [];
  runtime.onAny((event, { commandId }) => { log.push(`${event.type}@${event.tick}${commandId === null ? '' : `#${commandId}`}`); });
  runtime.frame(0);
  return { runtime, log };
}

describe('the completion cut of a real run', () => {
  it('cuts a capped frame at the run\'s last tick, which then is not capped, and runs no tick after it', () => {
    const runtime = createGameRuntime(successSpec(recordingOptions(32)));
    const log: string[] = [];
    runtime.onAny((event) => { log.push(`${event.type}@${event.tick}`); });
    const report = runToCompletion(runtime, 20 * TICK_MS);
    const ticks = SUCCESS_COMPLETION_TICK % MAX_TICKS_PER_FRAME || MAX_TICKS_PER_FRAME;
    expect(report).toEqual({
      ticks, capped: false, stop: null, cut: 'completed', transitions: [], completion: { tick: SUCCESS_COMPLETION_TICK, outcome: 'success' },
    });
    expect(Object.isFrozen(report) && Object.isFrozen(report.completion)).toBe(true);
    // The completion tick is delivered in full, `mission-completed` last; its read model is the final one.
    expect(log.at(-1)).toBe(`mission-completed@${SUCCESS_COMPLETION_TICK}`);
    expect(runtime.projection()).toMatchObject({
      clock: { tick: SUCCESS_COMPLETION_TICK }, mission: { phase: 'completed' },
      result: { outcome: 'success', completedTick: SUCCESS_COMPLETION_TICK, endingGaps: [{ gap: 'G-02/8', variant: 'solo' }] },
    });
    const frame = runtime.renderFrame();
    expect({ current: frame.current.tick, alpha: frame.alpha }).toEqual({ current: SUCCESS_COMPLETION_TICK, alpha: 0 });
    // The recording ends at the completion and exports, as does a snapshot.
    const recording = runtime.exportRecording()!;
    expect(recording.result.finalTick).toBe(SUCCESS_COMPLETION_TICK);
    expect(completedRun(recording.result)).toBe(true);
    expect(runtime.snapshot().state.tick).toBe(SUCCESS_COMPLETION_TICK);
    // No further tick, ever: the barrier refuses frames and input, and the clock cannot be re-anchored to run on.
    for (const work of [
      () => runtime.frame(3_600_000), () => { runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: true }); },
      () => runtime.submitCommand({ type: 'launch' }), () => { runtime.resetClock(); }, () => { runtime.releaseTransitionBarrier(); },
    ]) {
      const error = thrownBy(work);
      expect(error).toBeInstanceOf(GameRuntimeError);
      expect(error).toMatchObject(REFUSED);
    }
    expect(runtime.projection().clock.tick).toBe(SUCCESS_COMPLETION_TICK);
    expect(runtime.exportRecording()!.result.finalTick).toBe(SUCCESS_COMPLETION_TICK);
  });

  it('cuts an uncapped frame the same way', () => {
    const runtime = createGameRuntime(successSpec());
    const report = runToCompletion(runtime, TICK_MS);
    expect(report).toMatchObject({ ticks: 1, capped: false, cut: 'completed', completion: { tick: SUCCESS_COMPLETION_TICK } });
  });
});

describe('the completion barrier', () => {
  it('leaves the queue\'s unexecuted commands for the Session to clear, and refuses new ones without issuing IDs', () => {
    const { runtime, log } = anchored();
    const ids = Array.from({ length: CORE_LIMITS.commandsPerTick + 3 }, () => runtime.submitCommand({ type: 'launch' }));
    injection.plan({});
    injection.complete(1, injectedResult([{ gap: 'G-02/8', variant: 'solo' }]));
    expect(runtime.frame(MAX_TICKS_PER_FRAME * TICK_MS)).toEqual({
      ticks: 1, capped: false, stop: null, cut: 'completed', transitions: [], completion: { tick: 1, outcome: 'success' },
    });
    // The executed commands' results keep their IDs; the rest never ran.
    expect(log.filter((entry) => entry.startsWith('command-result')).map((entry) => Number(entry.split('#')[1])))
      .toEqual(ids.slice(0, CORE_LIMITS.commandsPerTick));
    expect(log.at(-1)).toBe('mission-completed@1');
    expect(thrownBy(() => runtime.submitCommand({ type: 'launch' }))).toMatchObject(REFUSED);
    expect(thrownBy(() => runtime.submitCommand({ type: 'nonsense' } as never))).toMatchObject(REFUSED);
    expect(runtime.clearIntent()).toEqual(ids.slice(CORE_LIMITS.commandsPerTick));
    expect(runtime.clearIntent()).toEqual([]);
    // Lifecycle clean-up stays available, and nothing steps again.
    runtime.foldRenderState();
    runtime.clearSubscriptions();
    expect(thrownBy(() => runtime.frame(10_000))).toMatchObject(REFUSED);
    expect(injection.steps).toBe(1);
  });

  it('is up before the delivery: receivers meet it, cannot re-enter the lifecycle, and do not fail the frame by it', () => {
    const { runtime } = anchored();
    const seen: unknown[] = [];
    runtime.on('mission-completed', () => {
      seen.push(thrownBy(() => runtime.submitCommand({ type: 'launch' })));
      seen.push(thrownBy(() => { runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: false }); }));
      seen.push(thrownBy(() => runtime.frame(99 * TICK_MS)));
      seen.push(thrownBy(() => runtime.clearIntent()));
      seen.push(thrownBy(() => { runtime.resetClock(); }));
    });
    injection.plan({});
    injection.complete(2, injectedResult([{ gap: 'G-02/7', variant: 'destroyed' }]));
    expect(runtime.frame(3 * TICK_MS)).toMatchObject({ ticks: 2, cut: 'completed', completion: { tick: 2, outcome: 'failure' } });
    expect(seen).toEqual([
      expect.objectContaining(REFUSED), expect.objectContaining(REFUSED), expect.objectContaining(REFUSED),
      expect.objectContaining({ kind: 'reentrant-call' }), expect.objectContaining({ kind: 'reentrant-call' }),
    ]);
    expect(runtime.projection().clock.tick).toBe(2);
  });

  it('faults on a tick with both a transition and the completion, delivering nothing of the frame', () => {
    const { runtime, log } = anchored();
    const id = runtime.submitCommand({ type: 'launch' });
    injection.plan({ 2: ['G-02/5'] });
    injection.complete(2, injectedResult([{ gap: 'G-02/8', variant: 'solo' }]));
    const error = thrownBy(() => runtime.frame(4 * TICK_MS));
    expect(error).toMatchObject({ kind: 'faulted', unconfirmed: [id] });
    expect((error as GameRuntimeError).cause).toBeInstanceOf(RangeError);
    expect(log).toEqual([]);
    expect(thrownBy(() => runtime.snapshot())).toBe(error);
  });
});
