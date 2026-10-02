import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreInputError } from '../core/errors.ts';
import type { SyntheticSceneConfig, TickInput } from '../core/synthetic-scene.ts';
import type * as SceneModule from '../core/synthetic-scene.ts';
import { createSyntheticRuntime } from './synthetic-runtime.ts';

const injection = vi.hoisted(() => ({ failOn: 0, calls: 0, cause: undefined as unknown }));
vi.mock('../core/synthetic-scene.ts', async importOriginal => {
  const original = await importOriginal<typeof SceneModule>();
  return {
    ...original,
    createSyntheticScene(config: SyntheticSceneConfig) {
      const scene = original.createSyntheticScene(config);
      return {
        step(input: TickInput) {
          injection.calls++;
          if (injection.calls === injection.failOn) throw injection.cause;
          return scene.step(input);
        },
        inspect: () => scene.inspect(),
        uiProjection: () => scene.uiProjection(),
        renderState: () => scene.renderState(),
      };
    },
  };
});

beforeEach(() => {
  injection.calls = 0;
  injection.cause = new CoreInputError('tickInput', 'injected before commit');
});
afterEach(() => { injection.failOn = 0; });

describe('Runtime terminal Core faults', () => {
  it.each([1, 2])('retains successful state only when step %s fails', failOn => {
    injection.failOn = failOn;
    const runtime = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 } });
    let events = 0;
    const off = runtime.onAny(() => { events++; });
    runtime.submitCommand({ type: 'add-marker' }); runtime.setInput({ moveX: 1 });
    runtime.frame(0);
    runtime.frame(10);
    expect(runtime.renderFrame().alpha).toBe(0.5);
    expect(() => runtime.frame(60)).toThrowError(expect.objectContaining({ kind: 'faulted', cause: injection.cause }));
    expect(events).toBe(0);
    expect(runtime.uiProjection().tick).toBe(failOn - 1);
    expect(runtime.renderFrame()).toMatchObject({ previous: { tick: 0 }, current: { tick: failOn - 1 }, alpha: 0 });
    expect(runtime.uiProjection().mover.position.x).toBe((failOn - 1) * 0.02);
    expect(runtime.exportRecording()).toBeNull();
    injection.failOn = 0;
    for (const action of [
      () => runtime.frame(NaN),
      () => runtime.submitCommand({ type: 'remove-marker' }),
      () => runtime.setInput({ moveX: NaN }),
    ]) expect(action).toThrowError(expect.objectContaining({ kind: 'faulted', cause: injection.cause }));
    expect(injection.calls).toBe(failOn);
    expect(() => { off(); off(); runtime.onAny(() => {}); }).not.toThrow();
  });
});
