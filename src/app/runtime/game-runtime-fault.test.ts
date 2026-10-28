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
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import { CoreFaultError, CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions } from '../../core/replay/recording.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { createGameRuntime, type GameRuntime } from './game-runtime.ts';
import { deliveriesOf, expectSameDeliveries, NEUTRAL_AXES, recordingOptions, runtimeSpec, TICK_MS } from './game-runtime.test-support.ts';
import { GameRuntimeError } from './runtime-errors.ts';

// Faults are injected only where tests create the world: the mocked creation entries wrap the real Core world or
// recording session and can replace one chosen call. The production Runtime has no injection point.

const METHODS = ['step', 'projection', 'renderState', 'snapshot', 'exportRecording'] as const;

const injection = vi.hoisted(() => {
  const calls = new Map<string, number>();
  let armed: { method: string; nth: number; replace: (real: () => unknown) => unknown } | null = null;
  const call = (method: string, real: () => unknown): unknown => {
    const count = (calls.get(method) ?? 0) + 1;
    calls.set(method, count);
    if (armed?.method === method && armed.nth === count) return armed.replace(real);
    return real();
  };
  return {
    /** Counts calls from now on; the `nth` call of `method` runs `replace`, which may call the real method. */
    arm(method: string, nth: number, replace: (real: () => unknown) => unknown) {
      calls.clear();
      armed = { method, nth, replace };
    },
    calls: (method: string) => calls.get(method) ?? 0,
    reset() {
      calls.clear();
      armed = null;
    },
    wrap<World extends object>(world: World): World {
      const target = world as unknown as Record<string, (...args: unknown[]) => unknown>;
      const wrapped: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ['step', 'projection', 'renderState', 'snapshot', 'exportRecording']) {
        if (typeof target[method] === 'function') wrapped[method] = (...args) => call(method, () => target[method](...args));
      }
      return wrapped as unknown as World;
    },
  };
});

afterEach(() => { injection.reset(); });

const fault = (site: string) => new CoreFaultError('invariant-violated', site);
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * A recording Runtime anchored at time 0, with fire held and `queued` launch commands (IDs 1…queued), so every tick
 * takes the fire and 63 commands; and a receiver of every delivery.
 */
function prepared(queued: number, recording: RecordingOptions | null = recordingOptions(1)) {
  const runtime = createGameRuntime(runtimeSpec({ recording }));
  const delivered: DomainEvent[] = [];
  runtime.onAny((event) => { delivered.push(event); });
  runtime.frame(0);
  runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: true });
  for (let index = 0; index < queued; index++) runtime.submitCommand({ type: 'launch' });
  return { runtime, delivered };
}

/** The render frame shows only the last complete tick: previous and current are the same state, alpha 0. */
function expectFolded(runtime: GameRuntime, tick: number) {
  const { previous, current, alpha } = runtime.renderFrame();
  expect([current.tick, alpha]).toEqual([tick, 0]);
  expect(previous).toBe(current);
}

/** After a fault: input and frames throw it, reads keep the cache, Core is never called again. */
function expectFaulted(runtime: GameRuntime, error: unknown) {
  const projection = runtime.projection(), render = runtime.renderFrame();
  const calls = () => METHODS.map((method) => injection.calls(method));
  const before = calls();
  for (const action of [
    () => runtime.frame(10_000),
    () => runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: false }),
    () => runtime.submitCommand({ type: 'launch' }),
    () => runtime.snapshot(),
    () => runtime.exportRecording(),
  ]) expect(thrownBy(action)).toBe(error);
  expect(calls()).toEqual(before);
  expect(runtime.projection()).toBe(projection);
  expect(runtime.renderFrame()).toBe(render);
  expect(() => { runtime.onAny(() => undefined)(); runtime.resetClock(); runtime.foldRenderState(); runtime.clearSubscriptions(); }).not.toThrow();
}

describe('GameRuntime failure frames', () => {
  it('a Core fault in the first tick delivers nothing, keeps the initial read model and leaves its batch unconfirmed', () => {
    const { runtime, delivered } = prepared(70);
    const projection = runtime.projection(), render = runtime.renderFrame().current;
    const cause = fault('test.step');
    injection.arm('step', 1, () => { throw cause; });
    const error = thrownBy(() => runtime.frame(3 * TICK_MS));
    expect(error).toBeInstanceOf(GameRuntimeError);
    expect(error).toMatchObject({ kind: 'faulted', cause, unconfirmed: ids(1, 63) });
    expect(Object.isFrozen((error as GameRuntimeError).unconfirmed)).toBe(true);
    expect(delivered).toEqual([]);
    expect(runtime.projection()).toBe(projection);
    expect(runtime.renderFrame()).toEqual({ previous: render, current: render, alpha: 0 });
    expect(injection.calls('step')).toBe(1);
    expectFaulted(runtime, error);
    expect(runtime.clearIntent()).toEqual(ids(64, 70));
    expect(runtime.clearIntent()).toEqual([]);
  });

  it.each([
    ['a later step', 'world.step'],
    ['a recording checkpoint', 'recording.checkpoint'],
  ])('a Core fault in %s withholds the earlier ticks\' events and leaves every batch of the frame unconfirmed', (_name, site) => {
    const { runtime, delivered } = prepared(200);
    const cause = fault(site);
    // The faulting step may have run: the real step runs before the fault.
    injection.arm('step', 3, (real) => { real(); throw cause; });
    const error = thrownBy(() => runtime.frame(5 * TICK_MS));
    expect(error).toMatchObject({ kind: 'faulted', cause, unconfirmed: ids(1, 189) });
    expect(delivered).toEqual([]);
    expect(runtime.projection().clock.tick).toBe(2);
    expectFolded(runtime, 2);
    expectFaulted(runtime, error);
    expect(runtime.clearIntent()).toEqual(ids(190, 200));
  });

  it.each(['projection', 'renderState'] as const)('a Core fault reading %s after a step keeps the previous tick\'s complete read model', (method) => {
    const { runtime, delivered } = prepared(150);
    const cause = fault(`world.${method}`);
    injection.arm(method, 2, () => { throw cause; });
    const error = thrownBy(() => runtime.frame(3 * TICK_MS));
    // The second step ran and its results were never delivered.
    expect(error).toMatchObject({ kind: 'faulted', cause, unconfirmed: ids(1, 126) });
    expect(injection.calls('step')).toBe(2);
    expect(delivered).toEqual([]);
    expect(runtime.projection().clock.tick).toBe(1);
    expectFolded(runtime, 1);
    expectFaulted(runtime, error);
    expect(runtime.clearIntent()).toEqual(ids(127, 150));
  });

  it.each(['snapshot', 'exportRecording'] as const)('a Core fault found by %s faults the Runtime with nothing unconfirmed', (method) => {
    const { runtime } = prepared(10);
    runtime.frame(TICK_MS);
    runtime.submitCommand({ type: 'launch' });
    runtime.submitCommand({ type: 'launch' });
    const cause = fault(`test.${method}`);
    injection.arm(method, 1, () => { throw cause; });
    const error = thrownBy(() => runtime[method]());
    expect(error).toMatchObject({ kind: 'faulted', cause, unconfirmed: [] });
    expectFolded(runtime, 1);
    expectFaulted(runtime, error);
    expect(runtime.clearIntent()).toEqual([11, 12]);
  });

  it.each([
    ['an overflowing tick', recordingOptions(1), new CoreInputError('tickInput', 'would advance the tick past the safe integer range')],
    ['a recording refusal without a recording', null, new CoreInputError('recording', 'would exceed 1 recorded ticks')],
  ])('a step CoreInputError for %s faults the Runtime, and its batch, which never ran, stays queued', (_name, recording, cause) => {
    const { runtime, delivered } = prepared(150, recording);
    injection.arm('step', 2, () => { throw cause; });
    const error = thrownBy(() => runtime.frame(3 * TICK_MS));
    expect(error).toMatchObject({ kind: 'faulted', cause, unconfirmed: ids(1, 63) });
    expect(delivered).toEqual([]);
    expect(runtime.projection().clock.tick).toBe(1);
    expectFaulted(runtime, error);
    expect(runtime.clearIntent()).toEqual(ids(64, 150));
  });

  it('a Runtime failure after a successful step faults with the executed batch unconfirmed', () => {
    const { runtime, delivered } = prepared(5);
    injection.arm('step', 1, (real) => {
      const events = real() as readonly DomainEvent[];
      return [...events, { ...events[0], commandIndex: 64 }];
    });
    const error = thrownBy(() => runtime.frame(2 * TICK_MS));
    expect(error).toMatchObject({ kind: 'faulted', cause: expect.any(RangeError), unconfirmed: ids(1, 5) });
    expect(delivered).toEqual([]);
    expect(runtime.projection().clock.tick).toBe(0);
    expectFaulted(runtime, error);
  });

  it('a receiver failure keeps the committed ticks, still delivers to the others and leaves the Runtime running', () => {
    const { runtime, delivered } = prepared(100);
    const first = new Error('receiver');
    runtime.onAny(() => { throw first; });
    let after = 0;
    runtime.onAny(() => { after++; });
    const error = thrownBy(() => runtime.frame(TICK_MS));
    expect(error).toMatchObject({ kind: 'listener-failed' });
    expect((error as GameRuntimeError).errors).toEqual(delivered.map(() => first));
    expect(after).toBe(delivered.length);
    expect(delivered.filter((event) => event.type === 'command-result')).toHaveLength(64);
    expect(runtime.projection().clock.tick).toBe(1);
    expect(runtime.exportRecording()?.record.ticks).toHaveLength(1);
    // Nothing was executed for the queued rest; the Runtime itself has not faulted.
    expect(runtime.clearIntent()).toEqual(ids(64, 100));
    runtime.clearSubscriptions();
    expect(runtime.frame(2 * TICK_MS)).toEqual({ ticks: 1, capped: false, stop: null, cut: null, transitions: [], completion: null, outputs: [expect.objectContaining({ tick: 2 })] });
  });

  it.each([['renderState', 'render'], ['projection', 'projection']] as const)('reports each tick\'s %s as the read model extracted it, once, intermediate ticks included', (method, field) => {
    const { runtime } = prepared(0, null);
    let extracted: unknown;
    injection.arm(method, 3, (real) => (extracted = real()));
    const report = runtime.frame(5 * TICK_MS);
    expect(report.outputs.map((output) => output.tick)).toEqual([1, 2, 3, 4, 5]);
    expect(extracted).toBeDefined();
    expect(report.outputs[2][field]).toBe(extracted);
    // One extraction per successful step; reading the report or the read model extracts nothing more.
    expect(runtime.projection()).toBe(report.outputs[4].projection);
    expect(injection.calls(method)).toBe(5);
  });

  it('a recording refusal stops after delivering the earlier ticks: the refused tick changes nothing and the recording exports', () => {
    const { runtime, delivered } = prepared(200);
    const deliveries = deliveriesOf(runtime);
    let refused: unknown;
    runtime.on('command-result', () => { refused ??= thrownBy(() => runtime.setIntent({ axes: NEUTRAL_AXES, primaryFire: false })); });
    const cause = new CoreInputError('recording', 'would exceed 131072 recorded ticks');
    injection.arm('step', 3, () => { throw cause; });
    const report = runtime.frame(5 * TICK_MS);
    expect(report).toEqual({ ticks: 2, capped: false, stop: 'recording-capacity', cut: null, transitions: [], completion: null, outputs: [expect.objectContaining({ tick: 1 }), expect.objectContaining({ tick: 2 })] });
    expectSameDeliveries(report, deliveries);
    expect(report.outputs.map((output) => output.projection.clock.tick)).toEqual([1, 2]);
    expect(report.outputs[1].projection).toBe(runtime.projection());
    expect(new Set(delivered.map((event) => event.tick))).toEqual(new Set([1, 2]));
    expect(delivered.filter((event) => event.type === 'command-result')).toHaveLength(128);
    expect(refused).toMatchObject({ kind: 'recording-capacity', cause });
    expect(runtime.projection().clock.tick).toBe(2);
    expectFolded(runtime, 2);
    expect(runtime.snapshot().state.tick).toBe(2);
    expect(runtime.exportRecording()?.record.ticks).toHaveLength(2);
    for (const action of [() => runtime.frame(10_000), () => runtime.submitCommand({ type: 'launch' })]) {
      expect(thrownBy(action)).toMatchObject({ kind: 'recording-capacity', cause });
    }
    expect(injection.calls('step')).toBe(3);
    expect(runtime.clearIntent()).toEqual(ids(127, 200));
  });

  it('a receiver failure while stopping reports the failure, and the Runtime stays stopped', () => {
    const { runtime } = prepared(10);
    runtime.onAny(() => { throw new Error('receiver'); });
    injection.arm('step', 2, () => { throw new CoreInputError('recording', 'would exceed 262144 recorded commands'); });
    expect(thrownBy(() => runtime.frame(2 * TICK_MS))).toMatchObject({ kind: 'listener-failed' });
    expect(thrownBy(() => runtime.frame(10_000))).toMatchObject({ kind: 'recording-capacity' });
    expect(runtime.exportRecording()?.record.ticks).toHaveLength(1);
  });
});
