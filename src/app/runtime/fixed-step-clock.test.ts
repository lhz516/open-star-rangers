import { describe, expect, it } from 'vitest';
import { FixedStepClock } from './fixed-step-clock.ts';
import { GameRuntimeError } from './runtime-errors.ts';

describe('FixedStepClock', () => {
  it('anchors the first frame and follows exact 50 Hz boundaries', () => {
    const clock = new FixedStepClock(50, 5);
    const reports = [1000, 1010, 1020, 1040, 1085, 1085].map(time => clock.advance(time));
    expect(reports.map(r => r.ticks)).toEqual([0, 0, 1, 1, 2, 0]);
    expect(reports.map(r => r.alpha)).toEqual([0, 0.5, 0, 0, 0.25, 0.25]);
    expect(reports.every(r => !r.capped && Object.isFrozen(r))).toBe(true);
  });

  it('does not advance early using an epsilon', () => {
    const clock = new FixedStepClock(50, 5);
    clock.advance(1000);
    expect(clock.advance(1019.999).ticks).toBe(0);
    expect(clock.advance(1020).ticks).toBe(1);
  });

  it.each([7, 33.3, 80])('reaches 60 ticks with frame spacing %s ms', (spacing) => {
    const clock = new FixedStepClock(60, 5);
    let ticks = clock.advance(0).ticks;
    for (let time = spacing; time < 1000; time += spacing) {
      const result = clock.advance(time);
      ticks += result.ticks;
      expect(result.capped).toBe(false);
      expect(result.alpha).toBeGreaterThanOrEqual(0);
      expect(result.alpha).toBeLessThan(1);
    }
    ticks += clock.advance(1000).ticks;
    expect(ticks).toBe(60);
  });

  it.each([1000, 1001])('drops backlog and remainder at %s ms, without replaying it', (end) => {
    const clock = new FixedStepClock(60, 5);
    clock.advance(0);
    expect(clock.advance(end)).toEqual({ ticks: 5, capped: true, alpha: 0 });
    expect(clock.advance(end)).toEqual({ ticks: 0, capped: false, alpha: 0 });
    const fraction = clock.advance(end + 10);
    expect(fraction.ticks).toBe(0);
    expect(Math.abs(fraction.alpha - 0.6)).toBeLessThanOrEqual(Number.EPSILON);
    expect(clock.advance(end + 20).ticks).toBe(1);
  });

  it.each([1, 3, 5])('does not cap exactly %s due ticks but caps a finite long frame', (cap) => {
    const clock = new FixedStepClock(50, cap);
    clock.advance(0);
    expect(clock.advance(cap * 20)).toEqual({ ticks: cap, capped: false, alpha: 0 });
    expect(clock.advance((2 * cap + 1) * 20)).toEqual({ ticks: cap, capped: true, alpha: 0 });
    expect(clock.advance(1e9)).toEqual({ ticks: cap, capped: true, alpha: 0 });
  });

  it.each([NaN, Infinity, -Infinity, '10', undefined, null])('rejects invalid timestamp %s before and after anchoring', (bad) => {
    for (const anchored of [false, true]) {
      const clock = new FixedStepClock(50, 5);
      const control = new FixedStepClock(50, 5);
      if (anchored) {
        clock.advance(100); control.advance(100);
        clock.advance(160); control.advance(160);
      }
      expect(() => clock.advance(bad as number)).toThrowError(GameRuntimeError);
      try { clock.advance(bad as number); } catch (error) {
        expect(error).toMatchObject({ kind: 'invalid-argument', path: 'nowMs', reason: 'must be a finite number' });
      }
      for (const time of [170, 200, 220]) expect(clock.advance(time)).toEqual(control.advance(time));
    }
  });

  it('rejects reversal relative to the last accepted frame, not just the anchor', () => {
    const clock = new FixedStepClock(50, 5);
    clock.advance(100);
    clock.advance(150);
    expect(() => clock.advance(140)).toThrowError('backwards');
    expect(clock.advance(160)).toEqual({ ticks: 1, capped: false, alpha: 0 });
  });

  it.each([
    [-Number.MAX_VALUE, Number.MAX_VALUE, 60],
    [-Number.MAX_VALUE, Number.MAX_VALUE, 1e-308],
    [0, Number.MAX_VALUE, 60],
  ])('rejects conversion overflow without changing the anchor (%s, %s, %s)', (base, now, rate) => {
    const clock = new FixedStepClock(rate, 5);
    const control = new FixedStepClock(rate, 5);
    clock.advance(base); control.advance(base);
    expect(() => clock.advance(now)).toThrowError('time conversion');
    expect(clock.advance(base)).toEqual(control.advance(base));
    if (base === 0) {
      for (const time of [50, 1000]) expect(clock.advance(time)).toEqual(control.advance(time));
    }
  });
});
