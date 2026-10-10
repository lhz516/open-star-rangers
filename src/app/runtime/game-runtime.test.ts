import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { CoreInputError } from '../../core/errors.ts';
import { createWorld } from '../../core/world/create-world.ts';
import { asCreateInput, playerOnlyMission, worldInput } from '../../core/world/create-world.test-support.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { createGameRuntime, MAX_TICKS_PER_FRAME, type GameRuntime, type GameRuntimeSpec } from './game-runtime.ts';
import { recordingOptions, runtimeSpec, TICK_MS } from './game-runtime.test-support.ts';
import { GameRuntimeError } from './runtime-errors.ts';

/** The tick of the cached projection and render frame, which must agree. */
function cachedTick(runtime: GameRuntime): number {
  const { previous, current } = runtime.renderFrame();
  expect(runtime.projection().clock.tick).toBe(current.tick);
  expect(previous.tick).toBeLessThanOrEqual(current.tick);
  return current.tick;
}

describe('createGameRuntime', () => {
  it('creates a plain world or a recording session at tick 0 with the initial read model', () => {
    const plain = createGameRuntime(runtimeSpec());
    const projection = plain.projection();
    expect(projection.clock).toEqual({ tick: 0, clock: 0, clockUnitsPerTick: 2 });
    expect(projection.mission.wingman).toBeNull();
    const { previous, current, alpha } = plain.renderFrame();
    expect([previous, alpha]).toEqual([current, 0]);
    expect(previous).toBe(current);
    expect(current.entities).toEqual([]);
    expect(plain.exportRecording()).toBeNull();
    expect(plain.snapshot().state.tick).toBe(0);

    const recorded = createGameRuntime(runtimeSpec({ recording: recordingOptions(32), run: { wingman: 4 } }));
    expect(recorded.projection().mission.wingman).toBe(4);
    const { record, result } = recorded.exportRecording() ?? {};
    expect(record).toMatchObject({ producer: 'osr-test', checkpointInterval: 32, run: { rawDifficulty: 19, wingman: 4, clockUnitsPerTick: 2 }, ticks: [] });
    expect(result).toMatchObject({ events: [], finalTick: 0, checkpoints: [{ tick: 0 }] });
  });

  it('copies nothing it keeps from the caller', () => {
    const spec = runtimeSpec({ recording: recordingOptions(8) });
    const runtime = createGameRuntime(spec);
    Object.assign(spec.run, { rawDifficulty: 0, wingman: 7, seed: -1 });
    (spec.recording as { producer: string }).producer = 'changed';
    (spec.mission.content as { declarations: unknown[] }).declarations.length = 0;
    runtime.frame(0);
    runtime.frame(TICK_MS);
    expect(runtime.renderFrame().current.entities.length).toBeGreaterThan(1);
    expect(runtime.exportRecording()?.record).toMatchObject({ producer: 'osr-test', run: { rawDifficulty: 19, wingman: null } });
  });

  it.each([
    ['a non-object', null, 'spec', 'must be a plain object'],
    ['an array', [], 'spec', 'must be a plain object'],
    ['an existing world', createWorld(asCreateInput(worldInput())), 'spec', 'must be a plain object'],
    ['a world-shaped object', { step: () => [], projection: (): null => null }, 'spec.mission', 'is required'],
    ['a handler', { ...runtimeSpec(), handlers: [] }, 'spec', 'contains unknown fields'],
    ['a hidden handler', Object.defineProperty(runtimeSpec(), 'handler', { value: () => undefined }), 'spec', 'contains unknown fields'],
    ['a symbol field', { ...runtimeSpec(), [Symbol('handler')]: () => undefined }, 'spec', 'contains unknown fields'],
    ['an accessor', Object.defineProperty(runtimeSpec(), 'run', { get: () => { throw new Error('ran'); }, enumerable: true }), 'spec', 'must contain only enumerable data fields'],
    ['no recording field', (({ recording: _, ...rest }) => rest)(runtimeSpec()), 'spec.recording', 'is required'],
    ['a step, even the default', runtimeSpec({ run: { clockUnitsPerTick: 2 } as never }), 'spec.run.clockUnitsPerTick', 'is not accepted: the Runtime runs only the default step'],
  ])('rejects %s as an invalid argument', (_name, spec, path, reason) => {
    const error = thrownBy(() => createGameRuntime(spec as GameRuntimeSpec));
    expect(error).toBeInstanceOf(GameRuntimeError);
    expect(error).toMatchObject({ kind: 'invalid-argument', path, reason });
  });

  it('passes every Core creation error through unchanged', () => {
    const seed = thrownBy(() => createGameRuntime(runtimeSpec({ run: { seed: 2 ** 32 } })));
    expect(seed).toBeInstanceOf(CoreInputError);
    expect(seed).toMatchObject({ path: 'input.run.seed' });
    const group = thrownBy(() => createGameRuntime(runtimeSpec({ run: { rawDifficulty: 50 } })));
    expect(group).toMatchObject({ path: 'input.run.rawDifficulty', reason: 'must select the campaign group of the mission' });
    const wingman = thrownBy(() => createGameRuntime(runtimeSpec({ run: { wingman: 5 } })));
    expect(wingman).toMatchObject({ path: 'input.run.wingman' });
    const producer = thrownBy(() => createGameRuntime(runtimeSpec({ recording: { producer: '', checkpointInterval: 1 } })));
    expect(producer).toBeInstanceOf(CoreInputError);
    expect(producer).toMatchObject({ path: 'options.producer' });
    const interval = thrownBy(() => createGameRuntime(runtimeSpec({ recording: { producer: 'p', checkpointInterval: 0 } })));
    expect(interval).toMatchObject({ path: 'options.checkpointInterval' });
    const spec = runtimeSpec();
    (spec.identity as { schemaVersion: unknown }).schemaVersion = 'one';
    expect(thrownBy(() => createGameRuntime(spec))).toBeInstanceOf(ContentContractError);
  });
});

describe('GameRuntime time', () => {
  it('anchors, steps at 32 Hz, caps at 5 ticks with alpha 0 and drops the remainder', () => {
    const runtime = createGameRuntime(runtimeSpec());
    const report = (ticks: number, capped = false) => ({ ticks, capped, stop: null });
    expect(runtime.frame(0)).toEqual(report(0));
    expect(cachedTick(runtime)).toBe(0);
    expect(runtime.frame(31.25)).toEqual(report(1));
    expect([cachedTick(runtime), runtime.renderFrame().alpha]).toEqual([1, 0]);
    expect(runtime.frame(31.25)).toEqual(report(0));
    expect(runtime.frame(46.875)).toEqual(report(0));
    expect([cachedTick(runtime), runtime.renderFrame().alpha]).toEqual([1, 0.5]);
    // 156.25 ms after the last tick: exactly the cap, not over it.
    expect(runtime.frame(31.25 + 156.25)).toEqual(report(MAX_TICKS_PER_FRAME));
    expect([cachedTick(runtime), runtime.renderFrame().alpha]).toEqual([6, 0]);
    expect(runtime.frame(187.5 + 187.5)).toEqual(report(MAX_TICKS_PER_FRAME, true));
    expect([cachedTick(runtime), runtime.renderFrame().alpha]).toEqual([11, 0]);
    // The capped frame's sixth tick is never run: the clock restarts from the capped frame.
    expect(runtime.frame(375 + 7.8125)).toEqual(report(0));
    expect([cachedTick(runtime), runtime.renderFrame().alpha]).toEqual([11, 0.25]);
    expect(runtime.frame(375 + 31.25)).toEqual(report(1));
    expect(cachedTick(runtime)).toBe(12);
    for (let now = 406.25; now < 1000; now += 3.3) {
      runtime.frame(now);
      const { alpha } = runtime.renderFrame();
      expect(alpha >= 0 && alpha < 1).toBe(true);
    }
  });

  it.each([
    ['NaN', NaN, 'must be a finite number'],
    ['Infinity', Infinity, 'must be a finite number'],
    ['a string', '40', 'must be a finite number'],
    ['an earlier time', 9, 'must not move backwards'],
    ['an unconvertible span', Number.MAX_VALUE, 'time conversion exceeds the finite number range'],
  ])('rejects %s without changing anything', (_name, nowMs, reason) => {
    const runtime = createGameRuntime(runtimeSpec({ recording: recordingOptions(1) }));
    runtime.frame(10);
    runtime.frame(10 + TICK_MS);
    const projection = runtime.projection(), render = runtime.renderFrame();
    const error = thrownBy(() => runtime.frame(nowMs as number));
    expect(error).toBeInstanceOf(GameRuntimeError);
    expect(error).toMatchObject({ kind: 'invalid-argument', path: 'nowMs', reason });
    expect(runtime.projection()).toBe(projection);
    expect(runtime.renderFrame()).toBe(render);
    expect(runtime.frame(10 + 2 * TICK_MS).ticks).toBe(1);
    expect(runtime.exportRecording()?.record.ticks).toHaveLength(2);
  });
});

describe('GameRuntime read model', () => {
  it('caches one tick atomically: the same projection object between steps, the last two Render States', () => {
    const runtime = createGameRuntime(runtimeSpec({ run: { wingman: 0 } }));
    runtime.frame(0);
    const initial = runtime.projection();
    runtime.frame(TICK_MS / 2);
    expect(runtime.projection()).toBe(initial);
    runtime.frame(3 * TICK_MS);
    const projection = runtime.projection(), frame = runtime.renderFrame();
    expect(projection).not.toBe(initial);
    expect(projection.clock.tick).toBe(3);
    expect([frame.previous.tick, frame.current.tick]).toEqual([2, 3]);
    expect(runtime.projection()).toBe(projection);
    expect(runtime.renderFrame()).toBe(frame);
    const kept = JSON.stringify([projection, frame]);
    runtime.frame(8 * TICK_MS);
    expect(runtime.renderFrame().current.tick).toBe(8);
    expect(JSON.stringify([projection, frame])).toBe(kept);
    expect(Object.isFrozen(projection) && Object.isFrozen(frame) && Object.isFrozen(frame.current.entities)).toBe(true);
  });

  it('shows the frame just stepped to the frame\'s receivers', () => {
    const runtime = createGameRuntime(runtimeSpec());
    const seen: [number, number, number][] = [];
    runtime.onAny(() => {
      const { previous, current, alpha } = runtime.renderFrame();
      seen.push([previous.tick, current.tick, alpha]);
      expect(runtime.projection().clock.tick).toBe(current.tick);
    });
    runtime.frame(0);
    runtime.frame(2.5 * TICK_MS);
    expect(new Set(seen.map((entry) => entry.join()))).toEqual(new Set(['1,2,0.5']));
  });

  it('folds to the last complete pair, and a re-anchored frame keeps it', () => {
    const runtime = createGameRuntime(runtimeSpec());
    runtime.frame(100);
    runtime.frame(100 + 2.5 * TICK_MS);
    const { current } = runtime.renderFrame();
    runtime.foldRenderState();
    expect(runtime.renderFrame()).toEqual({ previous: current, current, alpha: 0 });
    expect(runtime.renderFrame().previous).toBe(current);
    runtime.resetClock();
    // Re-anchoring accepts any time, even an earlier one, and runs nothing.
    expect(runtime.frame(5).ticks).toBe(0);
    expect(runtime.renderFrame()).toEqual({ previous: current, current, alpha: 0 });
    expect(runtime.frame(5 + TICK_MS).ticks).toBe(1);
    expect(runtime.renderFrame().previous).toBe(current);
    expect(runtime.renderFrame().current.tick).toBe(3);
  });
});

describe('GameRuntime lifecycle operations', () => {
  it('change neither Core nor the recording', () => {
    const runtime = createGameRuntime(runtimeSpec({ recording: recordingOptions(1) }));
    runtime.frame(0);
    runtime.setIntent({ axes: { pitch: 1, yaw: 0, roll: 0 }, primaryFire: true });
    runtime.submitCommand({ type: 'launch' });
    runtime.frame(2 * TICK_MS);
    runtime.submitCommand({ type: 'toggle-map' });
    const snapshot = runtime.snapshot(), recording = runtime.exportRecording();
    runtime.resetClock();
    expect(runtime.clearIntent()).toEqual([2]);
    runtime.foldRenderState();
    runtime.clearSubscriptions();
    expect(runtime.snapshot()).toEqual(snapshot);
    expect(runtime.exportRecording()).toEqual(recording);
    expect(runtime.projection().clock.tick).toBe(2);
  });

  it('are rejected during the frame, while input and subscriptions are not', () => {
    const runtime = createGameRuntime(runtimeSpec({ recording: recordingOptions(1) }));
    const outcomes = new Map<string, unknown>();
    let done = false;
    runtime.onAny(() => {
      if (done) return;
      done = true;
      for (const [name, action] of Object.entries({
        frame: () => runtime.frame(1000),
        resetClock: () => runtime.resetClock(),
        clearIntent: () => runtime.clearIntent(),
        foldRenderState: () => runtime.foldRenderState(),
        clearSubscriptions: () => runtime.clearSubscriptions(),
        snapshot: () => runtime.snapshot(),
        exportRecording: () => runtime.exportRecording(),
        setIntent: () => runtime.setIntent({ axes: { pitch: 0, yaw: 0, roll: 0 }, primaryFire: true }),
        submitCommand: () => runtime.submitCommand({ type: 'launch' }),
        onAny: () => runtime.onAny(() => undefined),
      })) outcomes.set(name, thrownBy(action));
    });
    runtime.frame(0);
    runtime.frame(TICK_MS);
    const reentrant = expect.objectContaining({ kind: 'reentrant-call' });
    expect(Object.fromEntries(outcomes)).toEqual({
      frame: reentrant, resetClock: reentrant, clearIntent: reentrant, foldRenderState: reentrant, clearSubscriptions: reentrant,
      snapshot: reentrant, exportRecording: reentrant,
      setIntent: undefined, submitCommand: undefined, onAny: undefined,
    });
    expect(runtime.renderFrame().current.tick).toBe(1);
    expect(runtime.clearIntent()).toEqual([1]);
  });

  it('clear subscriptions so that no later frame delivers to them', () => {
    const runtime = createGameRuntime(runtimeSpec());
    let calls = 0;
    runtime.onAny(() => { calls++; });
    runtime.on('object-instantiated', () => { calls++; });
    runtime.clearSubscriptions();
    runtime.frame(0);
    runtime.frame(TICK_MS);
    expect(runtime.renderFrame().current.entities.length).toBeGreaterThan(0);
    expect(calls).toBe(0);
  });

  it('run on the player-only mission too, where nothing but the player spawns', () => {
    const runtime = createGameRuntime(runtimeSpec({ mission: playerOnlyMission() }));
    runtime.frame(0);
    runtime.frame(TICK_MS);
    expect(runtime.renderFrame().current.entities.map((entity) => entity.kindBit)).toEqual([0]);
  });
});
