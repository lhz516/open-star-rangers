import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SceneModule from '../core/synthetic-scene.ts';
import type { SyntheticSceneConfig, TickInput } from '../core/synthetic-scene.ts';
import { replaySyntheticRecord } from '../core/synthetic-replay.ts';
import { createSyntheticRuntime } from './synthetic-runtime.ts';

const injection = vi.hoisted(() => ({ fail: false, cause: new Error('step') }));
vi.mock('../core/synthetic-scene.ts', async importOriginal => {
  const original = await importOriginal<typeof SceneModule>();
  return {
    ...original,
    createSyntheticScene(config: SyntheticSceneConfig) {
      const scene = original.createSyntheticScene(config);
      return {
        inspect: () => scene.inspect(),
        uiProjection: () => scene.uiProjection(),
        renderState: () => scene.renderState(),
        step(input: TickInput) {
          if (injection.fail) throw injection.cause;
          return scene.step(input);
        },
      };
    },
  };
});
afterEach(() => { injection.fail = false; });

function runtime() {
  return createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 }, recording: { checkpointInterval: 1 } });
}

describe('explicit Runtime lifecycle operations', () => {
  it.each([100000, -100])('folds without rollback and anchors a fresh timestamp %s', now => {
    const run = runtime();
    run.setInput({ moveX: 1 });
    for (const time of [1000, 1020, 1040, 1050]) run.frame(time);
    const old = run.renderFrame(), projection = run.uiProjection(), record = run.exportRecording();
    expect(old).toMatchObject({ previous: { tick: 1 }, current: { tick: 2 }, alpha: 0.5 });
    run.foldRenderState();
    run.resetClock();
    expect(run.renderFrame()).toMatchObject({ previous: { tick: 2 }, current: { tick: 2 }, alpha: 0 });
    expect(run.uiProjection()).toEqual(projection);
    expect(run.exportRecording()).toEqual(record);
    expect(run.frame(now)).toEqual({ ticks: 0, capped: false });
    expect(run.renderFrame()).toMatchObject({ previous: { tick: 2 }, current: { tick: 2 }, alpha: 0 });
    expect(run.frame(now + 20)).toEqual({ ticks: 1, capped: false });
    expect(run.renderFrame()).toMatchObject({ previous: { tick: 2 }, current: { tick: 3 }, alpha: 0 });
    expect(run.exportRecording()?.record.ticks).toHaveLength(3);
    expect(old).toMatchObject({ previous: { tick: 1 }, current: { tick: 2 }, alpha: 0.5 });
    expect(Object.isFrozen(old)).toBe(true);
  });

  it('cancels FIFO once without world, record, RNG or ID changes', () => {
    const run = runtime(), baseline = runtime();
    run.setInput({ moveX: 1 });
    expect(run.submitCommand({ type: 'add-marker' })).toBe(1);
    expect(run.submitCommand({ type: 'remove-marker' })).toBe(2);
    const before = run.exportRecording();
    const ids = run.clearIntent();
    expect(ids).toEqual([1, 2]);
    expect(Object.isFrozen(ids)).toBe(true);
    expect(run.clearIntent()).toEqual([]);
    expect(run.exportRecording()).toEqual(before);
    run.frame(0); baseline.frame(0);
    run.frame(20); baseline.frame(20);
    expect(run.exportRecording()).toEqual(baseline.exportRecording());
    expect(run.submitCommand({ type: 'add-marker' })).toBe(3);
    expect(baseline.submitCommand({ type: 'add-marker' })).toBe(1);
    run.frame(40); baseline.frame(40);
    expect(run.exportRecording()).toEqual(baseline.exportRecording());
  });

  it('does not cancel executed or business-rejected commands', () => {
    const run = runtime();
    run.submitCommand({ type: 'remove-marker' });
    run.frame(0); run.frame(20);
    expect(run.clearIntent()).toEqual([]);
    expect(run.exportRecording()?.result.events[0]).toMatchObject({ type: 'command-rejected' });
  });

  it('clears all subscriptions and leaves old cancellation handles idempotent', () => {
    const run = runtime();
    let calls = 0;
    const a = run.on('marker-added', () => { calls++; });
    const b = run.onAny(() => { calls++; });
    run.clearSubscriptions(); a(); a(); b(); b();
    run.onAny(() => { calls++; });
    run.submitCommand({ type: 'add-marker' });
    run.frame(0); run.frame(20);
    expect(calls).toBe(1);
  });

  it('rejects lifecycle mutation during delivery without applying it', () => {
    const run = runtime();
    let rejected = 0;
    run.onAny(() => {
      for (const action of [() => run.resetClock(), () => run.clearIntent(), () => run.foldRenderState(), () => run.clearSubscriptions()]) {
        expect(action).toThrowError(expect.objectContaining({ kind: 'reentrant-call' }));
        rejected++;
      }
    });
    run.submitCommand({ type: 'add-marker' });
    run.frame(0); run.frame(20);
    expect(rejected).toBe(4);
    expect(run.frame(40)).toEqual({ ticks: 1, capped: false });
    expect(run.renderFrame()).toMatchObject({ previous: { tick: 1 }, current: { tick: 2 } });
  });

  it('allows faulted teardown without clearing the terminal fault or successful recording', () => {
    const run = runtime();
    run.setInput({ moveX: 1 }); run.frame(0); run.frame(20); run.frame(30);
    run.submitCommand({ type: 'add-marker' });
    injection.fail = true;
    expect(() => run.frame(40)).toThrowError(expect.objectContaining({ kind: 'faulted', cause: injection.cause }));
    const record = run.exportRecording();
    expect(run.clearIntent()).toEqual([1]);
    run.resetClock(); run.foldRenderState(); run.clearSubscriptions();
    expect(run.renderFrame()).toMatchObject({ previous: { tick: 1 }, current: { tick: 1 }, alpha: 0 });
    expect(run.exportRecording()).toEqual(record);
    injection.fail = false;
    if (!record) throw new Error('expected recording');
    expect(replaySyntheticRecord(record.record)).toEqual(record.result);
    expect(() => run.frame(0)).toThrowError(expect.objectContaining({ kind: 'faulted', cause: injection.cause }));
    expect(() => run.setInput({ moveX: 0 })).toThrowError(expect.objectContaining({ kind: 'faulted' }));
  });
});
