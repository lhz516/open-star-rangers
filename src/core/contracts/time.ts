/**
 * Mission clock of formal Core (docs/plan/p3/02/spec.md, 时间模型; R-01). The clock is a non-negative safe integer
 * in original clock units of 1/64 second, starting at 0 when the world is created; every successful step advances the
 * tick by 1 and the clock by `clockUnitsPerTick`. These are pure helpers; the world advances its own time (subtask 05).
 * The fixed step is a project choice, not the original's frame timing (B-006).
 */
import { CoreFaultError, CoreInputError } from '../errors.ts';
import type { NumberRule } from './validation.ts';

export const CLOCK_UNITS_PER_SECOND = 64;
/** 2 units per tick: the nominal 32 ticks per second that the Runtime schedules. */
export const DEFAULT_CLOCK_UNITS_PER_TICK = 2;

function isClockUnitsPerTick(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value % 2 === 0;
}

const isClockValue = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

export const CLOCK_UNITS_PER_TICK: NumberRule = Object.freeze([isClockUnitsPerTick, 'must be a positive even safe integer'] as const);

/**
 * Length of one step in seconds; exact, since the divisor is a power of two. `clockUnitsPerTick` comes from a
 * validated world configuration, so anything else is a CoreFaultError.
 */
export function stepSeconds(clockUnitsPerTick: number): number {
  if (!isClockUnitsPerTick(clockUnitsPerTick)) throw new CoreFaultError('invariant-violated', 'time.stepSeconds');
  return clockUnitsPerTick / CLOCK_UNITS_PER_SECOND;
}

export interface MissionTime {
  readonly tick: number;
  /** Clock units since the world was created. */
  readonly clock: number;
}

/**
 * The time after one more step. Throws CoreInputError at `path` when the tick or clock would leave the safe integer
 * range; it changes nothing, so callers run it before their first state change. A current time or step outside the
 * clock contract is world state Core should never hold, so it is a CoreFaultError.
 */
export function advanceTime({ tick, clock }: MissionTime, clockUnitsPerTick: number, path = 'tickInput'): MissionTime {
  if (!isClockValue(tick) || !isClockValue(clock) || !isClockUnitsPerTick(clockUnitsPerTick)) {
    throw new CoreFaultError('invariant-violated', 'time.advanceTime');
  }
  const next = { tick: tick + 1, clock: clock + clockUnitsPerTick };
  if (!Number.isSafeInteger(next.tick)) throw new CoreInputError(path, 'would advance the tick past the safe integer range');
  if (!Number.isSafeInteger(next.clock)) throw new CoreInputError(path, 'would advance the clock past the safe integer range');
  return Object.freeze(next);
}

/**
 * Converts whole seconds, such as a declaration's spawn time, to clock units (seconds × 64). Throws CoreInputError
 * at `path` unless `seconds` is a non-negative safe integer whose product is safe; the product of a safe integer and
 * a power of two is exact, so the check is too.
 */
export function secondsToClockUnits(seconds: number, path: string): number {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new CoreInputError(path, 'must be a non-negative safe integer');
  const units = seconds * CLOCK_UNITS_PER_SECOND;
  if (!Number.isSafeInteger(units)) throw new CoreInputError(path, 'exceeds the safe integer range in clock units');
  // `+ 0` turns -0 into 0.
  return units + 0;
}

/**
 * Whether something due at `due` clock units has expired at `clock`: the original acts on the first sample past the
 * due time, so an item due at the current clock waits for the next tick.
 */
export function isDue(clock: number, due: number): boolean {
  return clock > due;
}
