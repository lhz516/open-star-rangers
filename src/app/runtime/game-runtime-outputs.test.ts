import { describe, expect, it } from 'vitest';
import { createGameRuntime, MAX_TICKS_PER_FRAME, type FrameReport, type GameRuntime, type TickEvent } from './game-runtime.ts';
import { deliveriesOf, expectSameDeliveries, NEUTRAL_AXES, runtimeSpec, TICK_MS } from './game-runtime.test-support.ts';

// P3-12/11 (docs/plan/p3/04/spec.md, 帧后逐 tick 输出（P3-12 的修订）): each frame report carries every successful
// tick's Render State and events, the same objects the read model and the Event Bus received, in order and once.
// Cuts, stops and failures are covered with their injections in the transition and fault test files.

/** A Runtime anchored at time 0 that keeps the current frame's deliveries. */
function anchored() {
  const runtime = createGameRuntime(runtimeSpec({ run: { wingman: 0 } }));
  const deliveries = deliveriesOf(runtime);
  const anchor = runtime.frame(0);
  expect(anchor.outputs).toEqual([]);
  return { runtime, deliveries };
}

/** The report's outputs against the read model and the frame's deliveries: same objects, same order, nothing twice. */
function expectOutputs(runtime: GameRuntime, report: FrameReport, deliveries: readonly TickEvent[], firstTick: number) {
  const { outputs } = report;
  expect(outputs).toHaveLength(report.ticks);
  expect(outputs.map((output) => output.tick)).toEqual(Array.from({ length: report.ticks }, (_, index) => firstTick + index));
  expect(Object.isFrozen(outputs)).toBe(true);
  for (const output of outputs) {
    expect([output.tick, output.clock]).toEqual([output.render.tick, output.render.clock]);
    expect(Object.isFrozen(output) && Object.isFrozen(output.render) && Object.isFrozen(output.events)).toBe(true);
    for (const item of output.events) {
      expect(Object.isFrozen(item) && Object.isFrozen(item.event)).toBe(true);
      expect(item.event.tick).toBe(output.tick);
    }
  }
  const frame = runtime.renderFrame();
  if (outputs.length > 0) expect(outputs.at(-1)?.render).toBe(frame.current);
  if (outputs.length > 1) expect(outputs.at(-2)?.render).toBe(frame.previous);
  expectSameDeliveries(report, deliveries);
}

describe('GameRuntime per-tick outputs', () => {
  it('reports 0, 1 and 5 tick frames and a capped frame tick by tick, as the read model and the Event Bus received them', () => {
    const { runtime, deliveries } = anchored();
    runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: true });
    const launches = [runtime.submitCommand({ type: 'launch' }), runtime.submitCommand({ type: 'launch' })];
    const ids: (number | null)[] = [];
    let tick = 0;
    for (const [now, ticks, capped] of [[TICK_MS, 1, false], [1.5 * TICK_MS, 0, false], [6 * TICK_MS, MAX_TICKS_PER_FRAME, false], [20 * TICK_MS, MAX_TICKS_PER_FRAME, true]] as const) {
      deliveries.length = 0;
      const report = runtime.frame(now);
      expect([report.ticks, report.capped]).toEqual([ticks, capped]);
      expectOutputs(runtime, report, deliveries, tick + 1);
      ids.push(...report.outputs.flatMap((output) => output.events.map(({ commandId }) => commandId)));
      tick += ticks;
    }
    expect(tick).toBe(11);
    expect(ids.filter((id) => id !== null)).toEqual(launches);
  });

  it('keeps each submitted command\'s ID and null for automatic fire and other events', () => {
    const { runtime, deliveries } = anchored();
    runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: true });
    const launch = runtime.submitCommand({ type: 'launch' });
    const report = runtime.frame(TICK_MS);
    expectOutputs(runtime, report, deliveries, 1);
    const results = report.outputs[0].events.filter(({ event }) => event.type === 'command-result');
    expect(results.map(({ commandId }) => commandId)).toEqual([null, launch]);
    expect(report.outputs[0].events.filter(({ event }) => event.type !== 'command-result').every(({ commandId }) => commandId === null)).toBe(true);
  });

  it('gives every frame its own outputs: an earlier report is neither changed nor repeated', () => {
    const { runtime, deliveries } = anchored();
    const first = runtime.frame(2 * TICK_MS);
    const kept = first.outputs.map((output) => output.render);
    deliveries.length = 0;
    const second = runtime.frame(3 * TICK_MS);
    expectOutputs(runtime, second, deliveries, 3);
    expect(first.outputs.map((output) => output.render)).toEqual(kept);
    expect(first.outputs.map((output) => output.tick)).toEqual([1, 2]);
    deliveries.length = 0;
    const still = runtime.frame(3 * TICK_MS);
    expect([still.ticks, still.outputs, deliveries]).toEqual([0, [], []]);
  });

  it('keeps the outputs of a frame whose receivers read the read model unchanged', () => {
    const runtime = createGameRuntime(runtimeSpec());
    const seen: number[] = [];
    runtime.onAny(() => { seen.push(runtime.renderFrame().current.tick); });
    runtime.frame(0);
    const report = runtime.frame(3 * TICK_MS);
    // Receivers run after all simulation: they see the frame's last tick, whichever tick their event belongs to.
    expect(new Set(seen)).toEqual(new Set([3]));
    expect(report.outputs.map((output) => output.tick)).toEqual([1, 2, 3]);
  });
});
