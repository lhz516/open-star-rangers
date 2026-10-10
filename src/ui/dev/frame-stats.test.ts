import { describe, expect, it } from 'vitest';
import { FRAME_SAMPLE_LIMIT, FrameStats } from './frame-stats.ts';

// P3-04 AC-22, the frame window (docs/plan/p3/04/spec.md: 开发诊断, 帧耗时): the latest 120 samples, their processing
// and tick statistics and capped frames; a failed timing is counted, never recorded as 0 ms.

const sample = (processingMs: number, ticks = 1, capped = false) => Object.freeze({ processingMs, ticks, capped });

describe('frame statistics', () => {
  it('summarizes the samples it holds', () => {
    const stats = new FrameStats();
    expect(stats.view()).toEqual({
      samples: 0, meanProcessingMs: null, maxProcessingMs: null, totalTicks: 0, meanTicks: null, maxTicks: null, cappedFrames: 0,
      failedFrames: 0, lastFailure: null,
    });
    stats.add(sample(2, 0));
    stats.add(sample(6, 5, true));
    stats.add(sample(1, 1));
    expect(stats.view()).toEqual({
      samples: 3, meanProcessingMs: 3, maxProcessingMs: 6, totalTicks: 6, meanTicks: 2, maxTicks: 5, cappedFrames: 1,
      failedFrames: 0, lastFailure: null,
    });
  });

  it('keeps 120 samples and drops the oldest of 121', () => {
    const stats = new FrameStats();
    expect(FRAME_SAMPLE_LIMIT).toBe(120);
    // The first sample is the slowest and the only capped one; it leaves with the 121st.
    stats.add(sample(1_000, 5, true));
    for (let index = 1; index < 120; index++) stats.add(sample(1));
    expect(stats.view()).toMatchObject({ samples: 120, maxProcessingMs: 1_000, cappedFrames: 1, totalTicks: 124 });
    stats.add(sample(2));
    expect(stats.view()).toMatchObject({ samples: 120, maxProcessingMs: 2, cappedFrames: 0, totalTicks: 120 });
    expect(stats.view().meanProcessingMs).toBeCloseTo(121 / 120);
  });

  it('counts a failed timing without a sample, and refuses a malformed sample', () => {
    const stats = new FrameStats();
    stats.add(sample(4));
    const cause = new RangeError('clock');
    stats.fail(cause);
    stats.fail(cause);
    expect(stats.view()).toMatchObject({ samples: 1, meanProcessingMs: 4, failedFrames: 2, lastFailure: { cause } });
    for (const bad of [sample(Number.NaN), sample(-1), sample(1, 1.5), sample(Infinity)]) {
      expect(() => { stats.add(bad); }).toThrow(RangeError);
    }
    expect(stats.view().samples).toBe(1);
  });

  it('returns one frozen view until it changes, and clears to empty', () => {
    const stats = new FrameStats();
    stats.add(sample(3));
    const view = stats.view();
    expect(stats.view()).toBe(view);
    expect(Object.isFrozen(view)).toBe(true);
    stats.fail(new Error('clock'));
    stats.clear();
    expect(stats.view()).toMatchObject({ samples: 0, failedFrames: 0, lastFailure: null });
  });
});
