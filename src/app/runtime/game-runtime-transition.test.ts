vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const { wrapWorld } = await import('./transition-injection.test-support.ts');
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
});
vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const { wrapWorld } = await import('./transition-injection.test-support.ts');
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => wrapWorld(original.createRecordingSession(input, options)),
  };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CORE_LIMITS } from '../../core/contracts/limits.ts';
import { CoreFaultError, CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions } from '../../core/replay/recording.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { createGameRuntime, MAX_TICKS_PER_FRAME, type GameRuntime } from './game-runtime.ts';
import { deliveriesOf, expectSameDeliveries, NEUTRAL_AXES, recordingOptions, runtimeSpec, TICK_MS } from './game-runtime.test-support.ts';
import { GameRuntimeError } from './runtime-errors.ts';
import { injection as transitions, type InjectedGap } from './transition-injection.test-support.ts';

// P3-10 AC-13, the Runtime part (docs/plan/p3/04/spec.md, 运行中衔接（P3-10 的修订）): a tick whose events include
// `transition` is the frame's last; its output is delivered in full, the report shows the cut, and a barrier refuses
// input and frames until the Session lowers it. The synthetic mission cannot dock, so the creation entries wrap the
// real world and append `transition` events to chosen steps (transition-injection.test-support.ts); steps can also be
// made to fail or be refused.

type Gap = InjectedGap;

afterEach(() => { transitions.reset(); });

const transition = (gap: Gap, tick: number) => ({ gap, tick });
const cut = (ticks: number, ...items: { gap: Gap; tick: number }[]) => ({ ticks, capped: false, stop: null, cut: 'transition', transitions: items, completion: null, outputs: expect.objectContaining({ length: ticks }) as unknown });

/** A Runtime anchored at time 0 that logs every delivery as `<type>@<tick>` with its command ID. */
function anchored(recording: RecordingOptions | null = null) {
  const runtime = createGameRuntime(runtimeSpec({ recording }));
  const log: string[] = [];
  runtime.onAny((event, { commandId }) => { log.push(`${event.type}@${event.tick}${commandId === null ? '' : `#${commandId}`}`); });
  runtime.frame(0);
  return { runtime, log };
}

const tickOf = (runtime: GameRuntime) => runtime.projection().clock.tick;

describe('the transition cut', () => {
  it('runs no step after the transition tick, delivers that tick in full and reports the cut and its transitions', () => {
    const { runtime, log } = anchored();
    const first = runtime.submitCommand({ type: 'launch' });
    transitions.plan({ 2: ['G-02/3'] });
    const report = runtime.frame(MAX_TICKS_PER_FRAME * TICK_MS);
    expect(report).toEqual(cut(2, transition('G-02/3', 2)));
    expect(Object.isFrozen(report.transitions) && report.transitions.every((item) => Object.isFrozen(item))).toBe(true);
    expect({ steps: transitions.steps, tick: tickOf(runtime) }).toEqual({ steps: 2, tick: 2 });
    // The tick-1 command's result keeps its ID, and the transition tick's events all arrive, the transition included.
    expect(log).toContain(`command-result@1#${first}`);
    expect(log.at(-1)).toBe('transition@2');
    // The read model is that of the transition tick; the frame shows its previous tick until the Session folds.
    const frame = runtime.renderFrame();
    expect({ previous: frame.previous.tick, current: frame.current.tick, alpha: frame.alpha }).toEqual({ previous: 1, current: 2, alpha: 0 });
  });

  it('cuts at the first tick of a capped frame, which then is not capped, and keeps two transitions of a tick in event order', () => {
    const { runtime } = anchored();
    transitions.plan({ 1: ['G-02/3', 'G-02/4'] });
    expect(runtime.frame(20 * TICK_MS)).toEqual(cut(1, transition('G-02/3', 1), transition('G-02/4', 1)));
    expect(transitions.steps).toBe(1);
  });

  it('reports the transitions from the step output, without any receiver', () => {
    const runtime = createGameRuntime(runtimeSpec());
    runtime.frame(0);
    transitions.plan({ 1: ['G-02/4'] });
    expect(runtime.frame(TICK_MS)).toEqual(cut(1, transition('G-02/4', 1)));
  });

  it('reports outputs up to the transition tick, whose events end with its transition, and none behind the barrier', () => {
    const { runtime } = anchored();
    const deliveries = deliveriesOf(runtime);
    runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: true });
    runtime.submitCommand({ type: 'launch' });
    transitions.plan({ 3: ['G-02/3'] });
    const report = runtime.frame(MAX_TICKS_PER_FRAME * TICK_MS);
    expect(report.outputs.map((output) => output.tick)).toEqual([1, 2, 3]);
    expectSameDeliveries(report, deliveries);
    expect(deliveries.some(({ commandId }) => commandId === 1)).toBe(true);
    expect(report.outputs[2].events.at(-1)?.event).toMatchObject({ type: 'transition', gap: 'G-02/3', tick: 3 });
    expect(report.outputs[2].render).toBe(runtime.renderFrame().current);
    runtime.releaseTransitionBarrier();
    runtime.resetClock();
    expect(runtime.frame(100 * TICK_MS).outputs).toEqual([]);
    expect(runtime.frame(101 * TICK_MS).outputs.map((output) => output.tick)).toEqual([4]);
  });

  it('reports no cut for frames without transitions', () => {
    const { runtime } = anchored();
    expect(runtime.frame(3 * TICK_MS)).toEqual({ ticks: 3, capped: false, stop: null, cut: null, transitions: [], completion: null, outputs: expect.objectContaining({ length: 3 }) });
  });
});

describe('the transition barrier', () => {
  it('refuses input in the cut frame\'s delivery and afterwards, changing nothing, and refuses frames', () => {
    const { runtime } = anchored();
    // Two ticks' batches: the transition tick takes the first 64, the rest stay queued and never ran.
    const ids = Array.from({ length: CORE_LIMITS.commandsPerTick + 3 }, () => runtime.submitCommand({ type: 'launch' }));
    runtime.setIntent({ axes: { pitch: 1, yaw: 0, roll: 0 }, primaryFire: false });
    const refusals: unknown[] = [];
    runtime.on('transition', () => {
      refusals.push(thrownBy(() => runtime.frame(10 * TICK_MS)));
      refusals.push(thrownBy(() => runtime.submitCommand({ type: 'launch' })));
      refusals.push(thrownBy(() => { runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: true }); }));
    });
    transitions.plan({ 1: ['G-02/3'] });
    expect(runtime.frame(4 * TICK_MS)).toMatchObject({ ticks: 1, cut: 'transition' });
    expect(refusals).toHaveLength(3);
    for (const refusal of refusals) expect(refusal).toMatchObject({ kind: 'transition-hold' });
    expect(thrownBy(() => runtime.submitCommand({ type: 'launch' }))).toMatchObject({ kind: 'transition-hold' });
    expect(thrownBy(() => runtime.submitCommand({ type: 'nonsense' } as never))).toMatchObject({ kind: 'transition-hold' });
    expect(thrownBy(() => runtime.frame(5 * TICK_MS))).toBeInstanceOf(GameRuntimeError);
    expect(thrownBy(() => runtime.frame(5 * TICK_MS))).toMatchObject({ kind: 'transition-hold' });
    expect(transitions.steps).toBe(1);
    // The Session's clear still works behind the barrier: only the never executed IDs, in FIFO order.
    expect(runtime.clearIntent()).toEqual(ids.slice(CORE_LIMITS.commandsPerTick));
  });

  it('lets no receiver reenter the lifecycle operations', () => {
    const { runtime } = anchored();
    const refusals: unknown[] = [];
    runtime.on('transition', () => {
      refusals.push(thrownBy(() => runtime.clearIntent()));
      refusals.push(thrownBy(() => { runtime.resetClock(); }));
      refusals.push(thrownBy(() => { runtime.releaseTransitionBarrier(); }));
      refusals.push(thrownBy(() => { runtime.foldRenderState(); }));
    });
    transitions.plan({ 1: ['G-02/3'] });
    runtime.frame(TICK_MS);
    expect(refusals).toHaveLength(4);
    for (const refusal of refusals) expect(refusal).toMatchObject({ kind: 'reentrant-call' });
    expect(thrownBy(() => runtime.submitCommand({ type: 'launch' }))).toMatchObject({ kind: 'transition-hold' });
  });

  it('allows reads behind the barrier, and once lowered with a re-anchored clock runs on without catching up', () => {
    const { runtime } = anchored(recordingOptions(1));
    transitions.plan({ 1: ['G-02/4'] });
    runtime.frame(TICK_MS);
    expect(runtime.snapshot().state.tick).toBe(1);
    expect(runtime.exportRecording()!.record.ticks).toHaveLength(1);
    runtime.releaseTransitionBarrier();
    runtime.resetClock();
    runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: false });
    const id = runtime.submitCommand({ type: 'launch' });
    // An hour of hold: the first frame only anchors.
    expect(runtime.frame(3_600_000)).toEqual({ ticks: 0, capped: false, stop: null, cut: null, transitions: [], completion: null, outputs: [] });
    expect(runtime.frame(3_600_000 + 2 * TICK_MS)).toMatchObject({ ticks: 2, cut: null });
    expect({ tick: tickOf(runtime), id }).toEqual({ tick: 3, id: 1 });
  });

  it('cuts again at the next transition of the same run', () => {
    const { runtime } = anchored();
    transitions.plan({ 1: ['G-02/3'], 3: ['G-02/4'] });
    expect(runtime.frame(TICK_MS)).toEqual(cut(1, transition('G-02/3', 1)));
    runtime.releaseTransitionBarrier();
    runtime.resetClock();
    runtime.frame(10_000);
    expect(runtime.frame(10_000 + 4 * TICK_MS)).toEqual(cut(2, transition('G-02/4', 3)));
  });
});

describe('cuts with failures and stops', () => {
  it('has no cut when an earlier tick of the frame faults', () => {
    const { runtime, log } = anchored();
    transitions.plan({ 2: ['G-02/3'] });
    transitions.fail(1, () => new CoreFaultError('invariant-violated', 'test'));
    expect(thrownBy(() => runtime.frame(3 * TICK_MS))).toMatchObject({ kind: 'faulted' });
    expect({ steps: transitions.steps, log }).toEqual({ steps: 1, log: [] });
  });

  it('never stops for the recording in a cut frame: the tick after the transition is never stepped', () => {
    const { runtime } = anchored(recordingOptions(1));
    transitions.plan({ 1: ['G-02/3'] });
    transitions.fail(2, () => new CoreInputError('recording', 'would exceed the recorded tick limit'));
    expect(runtime.frame(3 * TICK_MS)).toEqual(cut(1, transition('G-02/3', 1)));
    expect(transitions.steps).toBe(1);
  });

  it('stops for the recording before a later transition tick without a cut', () => {
    const { runtime } = anchored(recordingOptions(1));
    transitions.plan({ 2: ['G-02/3'] });
    transitions.fail(2, () => new CoreInputError('recording', 'would exceed the recorded tick limit'));
    expect(runtime.frame(3 * TICK_MS)).toEqual({ ticks: 1, capped: false, stop: 'recording-capacity', cut: null, transitions: [], completion: null, outputs: [expect.objectContaining({ tick: 1 })] });
  });
});
