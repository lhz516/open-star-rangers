import { describe, expect, it } from 'vitest';
import { CoreInputError } from '../core/errors.ts';
import { createSyntheticScene, type MoveInput } from '../core/synthetic-scene.ts';
import { createSyntheticRuntime, type SyntheticRuntimeOptions } from './synthetic-runtime.ts';

describe('Runtime creation and input', () => {
  it('starts neutral, isolated, with no public step or publish capability', () => {
    const runtime = createSyntheticRuntime({ scene: { seed: 0 } });
    expect(runtime.uiProjection()).toEqual(createSyntheticScene({ seed: 0 }).uiProjection());
    expect(runtime.renderFrame()).toMatchObject({ previous: { tick: 0 }, current: { tick: 0 }, alpha: 0 });
    expect(runtime.exportRecording()).toBeNull();
    expect('step' in runtime || 'dispatch' in runtime).toBe(false);
    runtime.frame(0); runtime.frame(20);
    expect(runtime.uiProjection().mover.position.x).toBe(0);
  });

  it.each<[unknown, string]>([
    [null, 'options'], [[], 'options'], [{}, 'options.scene'], [{ scene: { seed: -1 } }, 'options.scene.seed'],
    [{ scene: { seed: 0, tickRateHz: 0 } }, 'options.scene.tickRateHz'],
    [{ scene: { seed: 0 }, extra: 1 }, 'options.extra'],
    ...[0, 1.5, NaN, Infinity, '5', null, 2 ** 53].map<[unknown, string]>(maxTicksPerFrame => [
      { scene: { seed: 0 }, maxTicksPerFrame }, 'options.maxTicksPerFrame',
    ]),
  ])('rejects invalid options %j at %s', (options, path) => {
    expect(() => createSyntheticRuntime(options as SyntheticRuntimeOptions)).toThrowError(expect.objectContaining({
      kind: 'invalid-argument', path,
    }));
  });

  it('preserves Core configuration errors as causes', () => {
    expect(() => createSyntheticRuntime({ scene: { seed: -1 } })).toThrowError(expect.objectContaining({
      path: 'options.scene.seed', cause: expect.any(CoreInputError),
    }));
  });

  it('reads configuration once and does not freeze caller objects', () => {
    let seeds = 0, rates = 0, caps = 0, configs = 0;
    const config = { get seed() { return seeds++ === 0 ? 0 : -1; }, get tickRateHz() { return rates++ === 0 ? 50 : 0; } };
    const options = { get scene() { configs++; return config; }, get maxTicksPerFrame() { return caps++ === 0 ? 3 : 0; } };
    const runtime = createSyntheticRuntime(options);
    expect([seeds, rates, caps, configs]).toEqual([1, 1, 1, 1]);
    expect(Object.isFrozen(config) || Object.isFrozen(options)).toBe(false);
    runtime.frame(0);
    expect(runtime.frame(1000)).toEqual({ ticks: 3, capped: true });
    expect(runtime.uiProjection().tickRateHz).toBe(50);
    expect(createSyntheticRuntime({ scene: { seed: 0 }, maxTicksPerFrame: undefined }).uiProjection().tickRateHz).toBe(60);
  });

  it('uses copied input values, supports stopping, and reads getters once', () => {
    const runtime = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });
    const input = { moveX: 1 };
    runtime.setInput(input); input.moveX = -1;
    expect(Object.isFrozen(input)).toBe(false);
    runtime.frame(0); runtime.frame(40);
    expect(runtime.uiProjection().mover.position.x).toBeCloseTo(0.04, 12);
    let reads = 0;
    runtime.setInput({ get moveX() { return reads++ === 0 ? -0.5 : 2; } });
    runtime.frame(80);
    expect(reads).toBe(1);
    expect(runtime.uiProjection().mover.position.x).toBeCloseTo(0.02, 12);
    runtime.setInput({ moveX: 0 }); runtime.frame(100);
    expect(runtime.uiProjection().mover.position.x).toBeCloseTo(0.02, 12);
  });

  it.each([null, {}, { moveX: 2 }, { moveX: NaN }, { moveX: '1' }, { moveX: 0, extra: 1 }])(
    'rejects invalid input without replacing the last valid snapshot: %j', input => {
      const runtime = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });
      runtime.setInput({ moveX: 1 }); runtime.frame(0);
      expect(() => runtime.setInput(input as MoveInput)).toThrowError(expect.objectContaining({
        kind: 'invalid-argument', cause: expect.any(CoreInputError),
      }));
      runtime.frame(20);
      expect(runtime.uiProjection().mover.position.x).toBe(0.02);
    },
  );
});

describe('Runtime frames and projections', () => {
  it('matches the literal 50 Hz sequence and per-tick render states of a bare scene', () => {
    const runtime = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });
    const bare = createSyntheticScene({ seed: 0, tickRateHz: 50 });
    runtime.setInput({ moveX: 1 });
    let previous = bare.renderState(), current = previous;
    const outputs = [];
    for (const time of [1000, 1010, 1020, 1040, 1085, 1085]) {
      const report = runtime.frame(time);
      for (let i = 0; i < report.ticks; i++) {
        bare.step({ input: { moveX: 1 }, commands: [] });
        previous = current; current = bare.renderState();
      }
      expect(runtime.renderFrame()).toMatchObject({ previous, current });
      expect(runtime.uiProjection()).toEqual(bare.uiProjection());
      outputs.push([report.ticks, runtime.renderFrame().alpha]);
    }
    expect(outputs).toEqual([[0, 0], [0, 0.5], [1, 0], [1, 0], [2, 0.25], [0, 0.25]]);
    expect(runtime.uiProjection().mover.position.x).toBeCloseTo(0.08, 12);
  });

  it.each([7, 33.3, 80])('agrees with 60 bare ticks at %s ms frame spacing', spacing => {
    const runtime = createSyntheticRuntime({ scene: { seed: 0 } }), bare = createSyntheticScene({ seed: 0 });
    runtime.setInput({ moveX: 1 }); runtime.frame(0);
    for (let time = spacing; time < 1000; time += spacing) expect(runtime.frame(time).capped).toBe(false);
    runtime.frame(1000);
    for (let i = 0; i < 60; i++) bare.step({ input: { moveX: 1 }, commands: [] });
    expect(runtime.uiProjection()).toEqual(bare.uiProjection());
  });

  it('does not promise identical tick inputs for identical wall-time input changes', () => {
    const fine = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });
    const coarse = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });
    fine.frame(0); coarse.frame(0); fine.frame(20);
    fine.setInput({ moveX: 1 }); coarse.setInput({ moveX: 1 });
    fine.frame(40); coarse.frame(40);
    expect(fine.uiProjection().mover.position.x).toBe(0.02);
    expect(coarse.uiProjection().mover.position.x).toBe(0.04);
  });

  it('keeps old frozen projections across movement, removal, and re-addition', () => {
    const runtime = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });
    runtime.submitCommand({ type: 'add-marker' });
    runtime.frame(0); runtime.frame(20);
    const frame = runtime.renderFrame(), projection = runtime.uiProjection();
    const before = JSON.stringify({ frame, projection });
    runtime.submitCommand({ type: 'remove-marker' });
    runtime.submitCommand({ type: 'add-marker' });
    runtime.setInput({ moveX: 1 }); runtime.frame(80);
    expect(runtime.renderFrame().previous.tick).toBe(3);
    expect(runtime.renderFrame().current.tick).toBe(4);
    expect(JSON.stringify({ frame, projection })).toBe(before);
    expect(Object.isFrozen(frame) && Object.isFrozen(frame.current.entities[0].position)).toBe(true);
    expect(Object.isFrozen(projection.mover.position)).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity, -1, Number.MAX_VALUE])('rejects bad time %s without consuming commands or input', time => {
    const runtime = createSyntheticRuntime({ scene: { seed: 0 } });
    const control = createSyntheticRuntime({ scene: { seed: 0 } });
    for (const item of [runtime, control]) {
      item.frame(0); item.setInput({ moveX: 1 }); item.submitCommand({ type: 'add-marker' });
    }
    const before = runtime.renderFrame();
    expect(() => runtime.frame(time)).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'nowMs' }));
    expect(runtime.renderFrame()).toEqual(before);
    expect(runtime.frame(50)).toEqual(control.frame(50));
    expect(runtime.uiProjection()).toEqual(control.uiProjection());
  });
});
