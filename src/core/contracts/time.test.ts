import { describe, expect, it } from 'vitest';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import {
  advanceTime,
  CLOCK_UNITS_PER_SECOND,
  CLOCK_UNITS_PER_TICK,
  DEFAULT_CLOCK_UNITS_PER_TICK,
  isDue,
  secondsToClockUnits,
  stepSeconds,
  type MissionTime,
} from './time.ts';
import { readNumber } from './validation.ts';

const MAX = Number.MAX_SAFE_INTEGER;

/** Steps from the creation time until `isDue` first holds; the expectations below are worked out by hand. */
function firstDueTick(dueSeconds: number, clockUnitsPerTick: number): MissionTime {
  const due = secondsToClockUnits(dueSeconds, 'due');
  let time: MissionTime = { tick: 0, clock: 0 };
  while (!isDue(time.clock, due)) time = advanceTime(time, clockUnitsPerTick);
  return time;
}

describe('mission clock (P3-02 AC-03, R-01 units)', () => {
  it('uses 1/64 s units and 2 units per tick by default', () => {
    expect(CLOCK_UNITS_PER_SECOND).toBe(64);
    expect(DEFAULT_CLOCK_UNITS_PER_TICK).toBe(2);
    expect(stepSeconds(2)).toBe(1 / 32);
    expect(stepSeconds(4)).toBe(1 / 16);
  });

  it.each([2, 4])('advances one tick and %i units per step without changing its input', (units) => {
    const start = Object.freeze({ tick: 7, clock: 7 * units });
    const next = advanceTime(start, units);
    expect(next).toEqual({ tick: 8, clock: 8 * units });
    expect(Object.isFrozen(next)).toBe(true);
    expect(start).toEqual({ tick: 7, clock: 7 * units });
  });

  it('converts whole seconds to units, keeping 0 and normalising -0', () => {
    expect(secondsToClockUnits(0, 'due')).toBe(0);
    expect(Object.is(secondsToClockUnits(-0, 'due'), 0)).toBe(true);
    expect(secondsToClockUnits(3, 'due')).toBe(192);
    expect(secondsToClockUnits(0xffffffff, 'due')).toBe(0xffffffff * 64);
  });

  it('expires only once the clock is past the due time', () => {
    expect(isDue(64, 64)).toBe(false);
    expect(isDue(65, 64)).toBe(true);
    expect(isDue(0, 0)).toBe(false);
    expect(isDue(2, 0)).toBe(true);
  });

  it.each([
    // 1 s = 64 units: at 2 units/tick, tick 32 reaches 64 (not past), tick 33 is at 66.
    [1, 2, { tick: 33, clock: 66 }],
    // At 4 units/tick, tick 16 reaches 64, tick 17 is at 68.
    [1, 4, { tick: 17, clock: 68 }],
    // A due time of 0 expires on the first tick.
    [0, 2, { tick: 1, clock: 2 }],
    [0, 4, { tick: 1, clock: 4 }],
    // 3 s = 192 units: tick 97 (194) at 2 units/tick, tick 49 (196) at 4.
    [3, 2, { tick: 97, clock: 194 }],
    [3, 4, { tick: 49, clock: 196 }],
  ])('makes an item due at %i s expire at the expected tick with %i units per tick', (seconds, units, expected) => {
    expect(firstDueTick(seconds, units)).toEqual(expected);
  });

  it('rejects a tick or clock past the safe integer range before producing a time', () => {
    expect(advanceTime({ tick: MAX - 1, clock: 0 }, 2)).toEqual({ tick: MAX, clock: 2 });
    expect(advanceTime({ tick: 0, clock: MAX - 3 }, 2)).toEqual({ tick: 1, clock: MAX - 1 });
    expect(() => advanceTime({ tick: MAX, clock: 0 }, 2)).toThrow(new CoreInputError('tickInput', 'would advance the tick past the safe integer range'));
    expect(() => advanceTime({ tick: 0, clock: MAX - 1 }, 2)).toThrow(new CoreInputError('tickInput', 'would advance the clock past the safe integer range'));
    expect(() => advanceTime({ tick: 0, clock: MAX - 3 }, 4, 'record.ticks[0]')).toThrow(expect.objectContaining({ path: 'record.ticks[0]' }));
  });

  it('rejects a step or current time outside the clock contract as an internal fault', () => {
    for (const units of [0, -2, 3, 2.5, Number.NaN, MAX + 1]) {
      expect(() => stepSeconds(units), String(units)).toThrow(new CoreFaultError('invariant-violated', 'time.stepSeconds'));
      expect(() => advanceTime({ tick: 0, clock: 0 }, units), String(units)).toThrow(new CoreFaultError('invariant-violated', 'time.advanceTime'));
    }
    for (const time of [{ tick: -1, clock: -2 }, { tick: 0, clock: -2 }, { tick: 0.5, clock: 0 }, { tick: 0, clock: Number.NaN }, { tick: MAX + 1, clock: 0 }]) {
      expect(() => advanceTime(time, 2), JSON.stringify(time)).toThrow(CoreFaultError);
    }
  });

  it('rejects seconds that are not non-negative safe integers or overflow in units', () => {
    const limit = Math.floor(MAX / 64);
    expect(secondsToClockUnits(limit, 'due')).toBe(limit * 64);
    expect(() => secondsToClockUnits(limit + 1, 'due')).toThrow(new CoreInputError('due', 'exceeds the safe integer range in clock units'));
    for (const bad of [-1, 0.5, Number.NaN, Infinity, MAX + 1]) {
      expect(() => secondsToClockUnits(bad, 'due'), String(bad)).toThrow(new CoreInputError('due', 'must be a non-negative safe integer'));
    }
  });

  it('accepts only positive even safe integers as units per tick', () => {
    for (const valid of [2, 4, 64, MAX - 1]) expect(readNumber(valid, 'config.clockUnitsPerTick', CLOCK_UNITS_PER_TICK)).toBe(valid);
    for (const invalid of [0, -0, -2, 1, 3, 2.5, Number.NaN, Infinity, MAX + 1, 2 ** 54, '2', null]) {
      expect(() => readNumber(invalid, 'config.clockUnitsPerTick', CLOCK_UNITS_PER_TICK), String(invalid))
        .toThrow(new CoreInputError('config.clockUnitsPerTick', 'must be a positive even safe integer'));
    }
  });
});
