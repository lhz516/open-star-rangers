import { describe, expect, it } from 'vitest';
import { CoreInputError } from '../core/errors.ts';
import { compareSyntheticReplayResults, replaySyntheticRecord } from '../core/synthetic-replay.ts';
import type { Command, DomainEvent } from '../core/synthetic-scene.ts';
import { createSyntheticRuntime, type SyntheticRuntimeOptions } from './synthetic-runtime.ts';

describe('Runtime optional recording', () => {
  it.each([1, 4])('records exactly the executed inputs and replays with interval %s', checkpointInterval => {
    const config = { seed: 0, tickRateHz: 50 };
    const recorded = createSyntheticRuntime({ scene: config, recording: { checkpointInterval } });
    const plain = createSyntheticRuntime({ scene: config });
    const events: DomainEvent[] = [], controlEvents: DomainEvent[] = [];
    recorded.onAny(event => { events.push(event); });
    plain.onAny(event => { controlEvents.push(event); });
    const expectedTicks: { input: { moveX: number }; commands: readonly Command[] }[] = [];
    const rows: { now: number; moveX: number; commands: Command[] }[] = [
      { now: 0, moveX: 0, commands: [{ type: 'remove-marker' }] },
      { now: 10, moveX: 0, commands: [] },
      { now: 20, moveX: 1, commands: [{ type: 'add-marker' }, { type: 'add-marker' }] },
      { now: 80, moveX: -1, commands: [{ type: 'remove-marker' }] },
      { now: 90, moveX: 0.5, commands: [{ type: 'add-marker' }] },
      { now: 1000, moveX: 0.5, commands: [{ type: 'remove-marker' }, { type: 'add-marker' }] },
      { now: 1040, moveX: 0, commands: [] },
    ];
    const queued: Command[] = [];
    for (const row of rows) {
      for (const runtime of [recorded, plain]) {
        runtime.setInput({ moveX: row.moveX });
        for (const command of row.commands) runtime.submitCommand(command);
      }
      queued.push(...row.commands);
      const report = recorded.frame(row.now);
      expect(report).toEqual(plain.frame(row.now));
      for (let i = 0; i < report.ticks; i++) {
        expectedTicks.push({ input: { moveX: row.moveX }, commands: i === 0 ? queued.splice(0) : [] });
      }
      expect(recorded.uiProjection()).toEqual(plain.uiProjection());
      expect(recorded.renderFrame()).toEqual(plain.renderFrame());
    }
    const exported = recorded.exportRecording();
    if (!exported) throw new Error('expected recording');
    expect(exported.record.ticks).toEqual(expectedTicks);
    expect(exported.result.events).toEqual(events);
    expect(events).toEqual(controlEvents);
    expect(exported.result.events.filter(event => event.type === 'command-rejected').map(event => event.reason)).toEqual([
      'marker-not-found', 'marker-already-exists',
    ]);
    const replay = replaySyntheticRecord(JSON.parse(JSON.stringify(exported.record)));
    expect(replay).toEqual(exported.result);
    expect(compareSyntheticReplayResults(exported.result, replay)).toEqual({ match: true });
    expect(exported.result.checkpoints.map(c => c.tick)).toEqual(
      checkpointInterval === 1 ? Array.from({ length: 12 }, (_, i) => i) : [0, 4, 8, 11],
    );
    expect(JSON.stringify(exported)).not.toMatch(/commandId|nowMs|capped/);
    const before = JSON.stringify(exported);
    recorded.renderFrame(); recorded.uiProjection();
    expect(recorded.exportRecording()).toEqual(exported);
    expect(Object.isFrozen(exported.record.ticks[0].commands)).toBe(true);
    recorded.frame(1060);
    expect(recorded.exportRecording()?.record.ticks).toHaveLength(12);
    expect(JSON.stringify(exported)).toBe(before);
    expect(plain.exportRecording()).toBeNull();
  });

  it.each<[unknown, string]>([
    [null, 'options.recording'],
    [{}, 'options.recording.checkpointInterval'],
    [{ checkpointInterval: 0 }, 'options.recording.checkpointInterval'],
    [{ checkpointInterval: NaN }, 'options.recording.checkpointInterval'],
    [{ checkpointInterval: '1' }, 'options.recording.checkpointInterval'],
    [{ checkpointInterval: 1, extra: 1 }, 'options.recording.extra'],
  ])(
    'rejects invalid recording options %j at %s', (recording, path) => {
      expect(() => createSyntheticRuntime({ scene: { seed: 0 }, recording } as SyntheticRuntimeOptions))
        .toThrowError(expect.objectContaining({ kind: 'invalid-argument', path }));
    },
  );

  it('preserves the original Core cause when recorded creation fails', () => {
    expect(() => createSyntheticRuntime({ scene: { seed: -1 }, recording: { checkpointInterval: 1 } }))
      .toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'options.scene.seed', cause: expect.any(CoreInputError) }));
  });

  it('reads configuration and recording getters once', () => {
    let seedReads = 0, rateReads = 0, intervalReads = 0;
    const runtime = createSyntheticRuntime({
      scene: { get seed() { return seedReads++ === 0 ? 0 : -1; }, get tickRateHz() { return rateReads++ === 0 ? 50 : 0; } },
      recording: { get checkpointInterval() { return intervalReads++ === 0 ? 4 : 0; } },
    });
    expect([seedReads, rateReads, intervalReads]).toEqual([1, 1, 1]);
    expect(runtime.exportRecording()?.record).toMatchObject({ config: { seed: 0, tickRateHz: 50 }, checkpointInterval: 4 });
    expect(createSyntheticRuntime({ scene: { seed: 0 }, recording: undefined }).exportRecording()).toBeNull();
  });

  it('does not record rejected timestamps or invalid input/commands', () => {
    const runtime = createSyntheticRuntime({ scene: { seed: 0 }, recording: { checkpointInterval: 1 } });
    const control = createSyntheticRuntime({ scene: { seed: 0 }, recording: { checkpointInterval: 1 } });
    for (const instance of [runtime, control]) {
      instance.frame(0); instance.frame(50);
      instance.submitCommand({ type: 'add-marker' }); instance.setInput({ moveX: 1 });
    }
    const before = runtime.exportRecording();
    for (const action of [
      () => runtime.frame(NaN), () => runtime.frame(Number.MAX_VALUE), () => runtime.frame(10),
      () => runtime.setInput({ moveX: 2 }),
    ]) { expect(action).toThrow(); expect(runtime.exportRecording()).toEqual(before); }
    runtime.frame(100);
    control.frame(100);
    const after = runtime.exportRecording();
    expect(after).toEqual(control.exportRecording());
    if (!after) throw new Error('expected recording');
    expect(after.result).toEqual(replaySyntheticRecord(after.record));
    expect(after.result.events).toHaveLength(1);
  });

  it('commits the recording before reporting listener failures and never repeats that frame', () => {
    const runtime = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 }, recording: { checkpointInterval: 1 } });
    runtime.frame(0); runtime.submitCommand({ type: 'add-marker' });
    const off = runtime.onAny(() => {
      runtime.submitCommand({ type: 'remove-marker' }); runtime.setInput({ moveX: 1 });
      throw new Error('consumer');
    });
    expect(() => runtime.frame(60)).toThrowError(expect.objectContaining({ kind: 'listener-failed' }));
    const before = runtime.exportRecording();
    expect(before?.record.ticks).toHaveLength(3);
    off(); runtime.frame(60);
    expect(runtime.exportRecording()).toEqual(before);
    runtime.frame(80);
    const after = runtime.exportRecording();
    if (!after) throw new Error('expected recording');
    expect(after.result.events.map(event => event.type)).toEqual(['marker-added', 'marker-removed']);
    expect(after.result).toEqual(replaySyntheticRecord(after.record));
  });
});
