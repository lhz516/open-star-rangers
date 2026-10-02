import { GameRuntimeError } from './runtime-errors.ts';

export interface FrameTiming {
  readonly ticks: number;
  readonly capped: boolean;
  readonly alpha: number;
}

/** Internal clock; configuration has already been validated by the Runtime factory. */
export class FixedStepClock {
  readonly #tickRateHz: number;
  readonly #maxTicksPerFrame: number;
  #base: number | undefined;
  #last: number | undefined;
  #ran = 0;

  constructor(tickRateHz: number, maxTicksPerFrame: number) {
    this.#tickRateHz = tickRateHz;
    this.#maxTicksPerFrame = maxTicksPerFrame;
  }

  advance(nowMs: number): FrameTiming {
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) this.#invalid('must be a finite number');
    if (this.#last !== undefined && nowMs < this.#last) this.#invalid('must not move backwards');
    if (this.#base === undefined) {
      this.#base = this.#last = nowMs;
      return Object.freeze({ ticks: 0, capped: false, alpha: 0 });
    }
    const elapsed = nowMs - this.#base;
    const scaled = elapsed * this.#tickRateHz;
    if (!Number.isFinite(elapsed) || !Number.isFinite(scaled)) this.#invalid('time conversion exceeds the finite number range');
    const exactTicks = scaled / 1000;
    const wholeTicks = Math.floor(exactTicks);
    const due = wholeTicks - this.#ran;
    const capped = due > this.#maxTicksPerFrame;
    const ticks = capped ? this.#maxTicksPerFrame : due;
    this.#last = nowMs;
    if (capped) {
      this.#base = nowMs;
      this.#ran = 0;
    } else {
      this.#ran = wholeTicks;
    }
    return Object.freeze({ ticks, capped, alpha: capped ? 0 : exactTicks - wholeTicks });
  }

  #invalid(reason: string): never {
    throw new GameRuntimeError({ kind: 'invalid-argument', path: 'nowMs', reason });
  }
}
