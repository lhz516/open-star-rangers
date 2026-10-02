import { describe, expect, it } from 'vitest';
import { compareSyntheticReplayResults, replaySyntheticRecord } from '../core/synthetic-replay.ts';
import type { SyntheticRecording } from '../core/synthetic-replay.ts';
import { createSyntheticSession } from './synthetic-session.ts';
import { createSyntheticRuntime } from './synthetic-runtime.ts';
import { ControlledHost } from './synthetic-session.test-support.ts';

describe('session lifecycle recording', () => {
  it.each([1, 4])('records only the exact successful inputs across pause/hidden with interval %s', checkpointInterval => {
    const host = new ControlledHost(), session = createSyntheticSession({
      scene: { seed: 0, tickRateHz: 50 }, recording: { checkpointInterval },
    }, host, error => { throw error; });
    session.control({ type: 'start' }); const run = session.currentRun();
    if (!run) throw new Error('Expected run');
    run.setInput({ moveX: 1 }); run.submitCommand({ type: 'add-marker' });
    for (const now of [1000, 1020, 1040, 1050]) host.deliver(now);
    run.submitCommand({ type: 'remove-marker' }); session.control({ type: 'pause' });
    session.control({ type: 'resume' }); host.deliver(100000); host.deliver(100020);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    host.emit({ type: 'visibility', visibility: 'visible' }); session.control({ type: 'resume' });
    run.setInput({ moveX: -0.5 }); run.submitCommand({ type: 'remove-marker' }); host.deliver(-100); host.deliver(-80);
    const exported = run.exportRecording(); if (!exported) throw new Error('Expected record');
    expect(exported.record.ticks).toEqual([
      { input: { moveX: 1 }, commands: [{ type: 'add-marker' }] },
      { input: { moveX: 1 }, commands: [] },
      { input: { moveX: 0 }, commands: [] },
      { input: { moveX: -0.5 }, commands: [{ type: 'remove-marker' }] },
    ]);
    const replay = replaySyntheticRecord(JSON.parse(JSON.stringify(exported.record)));
    expect(compareSyntheticReplayResults(exported.result, replay)).toEqual({ match: true });
    const bare = createSyntheticRuntime({ scene: { seed: 0, tickRateHz: 50 }, recording: { checkpointInterval } });
    bare.setInput({ moveX: 1 }); bare.submitCommand({ type: 'add-marker' }); bare.frame(0); bare.frame(40);
    bare.setInput({ moveX: 0 }); bare.frame(60); bare.setInput({ moveX: -0.5 }); bare.submitCommand({ type: 'remove-marker' }); bare.frame(80);
    expect(exported).toEqual(bare.exportRecording());
    const oldJson = JSON.stringify(exported); session.control({ type: 'restart' });
    const next = session.currentRun(); if (!next) throw new Error('Expected new run');
    expect(next.runId).toBe(2); expect(next.uiProjection().tick).toBe(0);
    expect(next.exportRecording()?.record.ticks).toEqual([]); expect(JSON.stringify(exported)).toBe(oldJson);
  });

  it('matches recording-disabled state with the same actual tick inputs', () => {
    const outcomes: { projection: unknown; render: unknown; record: SyntheticRecording | null }[] = [];
    for (const recording of [undefined, { checkpointInterval: 4 }]) {
      const host = new ControlledHost(), session = createSyntheticSession({ scene: { seed: 0, tickRateHz: 50 }, recording }, host, error => { throw error; });
      session.control({ type: 'start' }); const run = session.currentRun(); if (!run) throw new Error('Expected run');
      run.setInput({ moveX: 1 }); run.submitCommand({ type: 'add-marker' }); host.deliver(0); host.deliver(40);
      run.submitCommand({ type: 'remove-marker' }); session.control({ type: 'pause' }); session.control({ type: 'resume' }); host.deliver(1000); host.deliver(1020);
      outcomes.push({ projection: run.uiProjection(), render: run.renderFrame(), record: run.exportRecording() });
    }
    expect(outcomes[0].projection).toEqual(outcomes[1].projection); expect(outcomes[0].render).toEqual(outcomes[1].render);
    expect(outcomes[0].record).toBeNull(); expect(outcomes[1].record?.record.ticks).toHaveLength(3);
  });
});
