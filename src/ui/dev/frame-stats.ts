/**
 * Frame statistics of the development diagnostics (docs/plan/p3/04/spec.md: 开发诊断, 帧耗时): the latest
 * FRAME_SAMPLE_LIMIT `{ processingMs, ticks, capped }` samples with their mean and maximum processing time, tick counts
 * and the number of frames that hit the per-frame tick cap. A frame whose timing failed adds no sample: it is counted and
 * its cause kept, never recorded as 0 ms. These are development measurements without a pass threshold.
 */
import type { FrameTimingSample } from '../../app/mission/dev-frame-timing.ts';

export const FRAME_SAMPLE_LIMIT = 120;

export interface FrameStatsView {
  readonly samples: number;
  /** Null without samples. */
  readonly meanProcessingMs: number | null;
  readonly maxProcessingMs: number | null;
  readonly totalTicks: number;
  readonly meanTicks: number | null;
  readonly maxTicks: number | null;
  readonly cappedFrames: number;
  /** Frames whose clock reads failed since the statistics began; none of them is a sample. */
  readonly failedFrames: number;
  readonly lastFailure: { readonly cause: unknown } | null;
}

function validSample({ processingMs, ticks, capped }: FrameTimingSample): boolean {
  return Number.isFinite(processingMs) && processingMs >= 0 && Number.isSafeInteger(ticks) && ticks >= 0 && typeof capped === 'boolean';
}

const EMPTY_VIEW: FrameStatsView = Object.freeze({
  samples: 0, meanProcessingMs: null, maxProcessingMs: null, totalTicks: 0, meanTicks: null, maxTicks: null, cappedFrames: 0,
  failedFrames: 0, lastFailure: null,
});

/** The sample window; `view()` returns the same frozen object until it changes. */
export class FrameStats {
  #samples: FrameTimingSample[] = [];
  #failedFrames = 0;
  #lastFailure: { readonly cause: unknown } | null = null;
  #view: FrameStatsView | null = EMPTY_VIEW;

  /** Adds a sample, dropping the oldest beyond FRAME_SAMPLE_LIMIT; throws a RangeError for a malformed one. */
  add(sample: FrameTimingSample): void {
    if (!validSample(sample)) throw new RangeError('A frame sample needs finite nonnegative milliseconds, a tick count and a capped flag');
    this.#samples.push(sample);
    if (this.#samples.length > FRAME_SAMPLE_LIMIT) this.#samples.shift();
    this.#view = null;
  }

  /** Counts a frame whose timing failed. */
  fail(cause: unknown): void {
    this.#failedFrames += 1;
    this.#lastFailure = Object.freeze({ cause });
    this.#view = null;
  }

  clear(): void {
    this.#samples = [];
    this.#failedFrames = 0;
    this.#lastFailure = null;
    this.#view = EMPTY_VIEW;
  }

  view(): FrameStatsView {
    if (this.#view) return this.#view;
    const samples = this.#samples;
    let totalMs = 0, maxMs = 0, totalTicks = 0, maxTicks = 0, cappedFrames = 0;
    for (const { processingMs, ticks, capped } of samples) {
      totalMs += processingMs;
      maxMs = Math.max(maxMs, processingMs);
      totalTicks += ticks;
      maxTicks = Math.max(maxTicks, ticks);
      if (capped) cappedFrames += 1;
    }
    const count = samples.length;
    this.#view = Object.freeze({
      samples: count,
      meanProcessingMs: count === 0 ? null : totalMs / count,
      maxProcessingMs: count === 0 ? null : maxMs,
      totalTicks,
      meanTicks: count === 0 ? null : totalTicks / count,
      maxTicks: count === 0 ? null : maxTicks,
      cappedFrames,
      failedFrames: this.#failedFrames,
      lastFailure: this.#lastFailure,
    });
    return this.#view;
  }
}
