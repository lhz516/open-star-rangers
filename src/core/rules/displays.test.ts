import { describe, expect, it } from 'vitest';
import { SUBSYSTEM_COUNT, type SubsystemState } from '../world/entity-table.ts';
import type { LeftPage, PlayerState } from '../world/player-state.ts';
import { expectFault } from '../world/world.test-support.ts';
import { advanceBlink, COCKPIT_DISPLAY_VIEW_MODES, hullField, pageChange, showsStatusPage, withStatusFields } from './displays.ts';

// Expectations from D9 and D15 (docs/original/formats/executable.md) and cockpit.md's instrument types per slot.

const fields = (entries: Record<number, SubsystemState> = {}): readonly SubsystemState[] =>
  Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => entries[index] ?? 0));

describe('the left display pages (D15)', () => {
  it.each([
    [0, 'open', 1],
    [1, 'open', 'no-change'],
    [1, 'damage-report', 0],
    [0, 'damage-report', 'no-change'],
    ...([2, 3, 4, 5, 6] as const).flatMap((page) => [[page, 'open', 'wrong-context'], [page, 'damage-report', 'wrong-context']] as const),
  ] as const)('page %i with %s gives %s', (page, command, result) => {
    expect(pageChange(page as LeftPage, command)).toBe(result);
  });

  it('shows the status page on page 0 unless field 10 is 2', () => {
    expect([0, 1, 2, 3].map((state) => showsStatusPage(0, fields({ 10: state as SubsystemState })))).toEqual([true, true, false, true]);
    expect(showsStatusPage(1, fields())).toBe(false);
    expect(showsStatusPage(5, fields())).toBe(false);
  });

  it('runs the cockpit gauges in view modes 0xC, 0xD, 1 and 6 only (layouts 0 and 5)', () => {
    expect([...COCKPIT_DISPLAY_VIEW_MODES].sort((left, right) => left - right)).toEqual([1, 6, 0x0c, 0x0d]);
  });
});

describe('the status display (D9)', () => {
  it('flips the blink phase once the clock is strictly past its due clock, due again 0x20 units later', () => {
    const display: PlayerState['statusDisplay'] = { blink: 0, blinkDueClock: 10, redraw: false };
    expect(advanceBlink(display, 10)).toBe(false);
    expect(display).toEqual({ blink: 0, blinkDueClock: 10, redraw: false });
    expect(advanceBlink(display, 12)).toBe(true);
    expect(display).toEqual({ blink: 1, blinkDueClock: 44, redraw: false });
    expect(advanceBlink(display, 44)).toBe(false);
    expect(advanceBlink(display, 46)).toBe(true);
    expect(display).toEqual({ blink: 0, blinkDueClock: 78, redraw: false });
  });

  it('faults on a due clock past the safe integers', () => {
    expectFault(() => advanceBlink({ blink: 0, blinkDueClock: 0, redraw: false }, Number.MAX_SAFE_INTEGER), 'budget-exhausted', 'displays.blink-clock');
  });

  it.each([
    // q = (hull << 8) ÷ c9C with c9C = 1,000.
    [1000, 0, 0],
    [750, 1, 0],
    [749, 0, 0],
    [749, 1, 1],
    [297, 1, 1],
    [296, 1, 2],
    [0, 0, 2],
    [-5, 1, 2],
  ] as const)('writes field 1 for hull %i at blink %i as %i', (hull, blink, expected) => {
    expect(hullField(hull, 1000, blink)).toBe(expected);
  });

  it('shifts the hull as i32 and faults on a zero capacity', () => {
    // 0x01000000 << 8 wraps to 0.
    expect(hullField(0x01000000, 1, 0)).toBe(2);
    expectFault(() => hullField(5, 0, 0), 'invariant-violated', 'displays.hull-capacity');
  });

  it('writes fields 1, 5 and 8 into a new frozen array, or keeps the array when none changes', () => {
    const before = fields({ 0: 1, 1: 2, 4: 3, 5: 0, 8: 1, 18: 2 });
    const written = withStatusFields(before, { hull: 1, missileMounts: 2, gunMounts: 0 });
    expect(written).toEqual(fields({ 0: 1, 1: 1, 4: 3, 5: 2, 8: 0, 18: 2 }));
    expect(Object.isFrozen(written)).toBe(true);
    expect(before).toEqual(fields({ 0: 1, 1: 2, 4: 3, 5: 0, 8: 1, 18: 2 }));
    expect(withStatusFields(written, { hull: 1, missileMounts: 2, gunMounts: 0 })).toBe(written);
  });
});
