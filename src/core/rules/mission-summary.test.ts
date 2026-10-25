import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import type { EventRange, EventTrigger } from '../../content/logic/logic-content.ts';
import type { MissionEventCounts } from '../world/world-state.ts';
import { NO_SUMMARY_SELECTOR, selectSummary, summaryRatio } from './mission-summary.ts';

// docs/plan/p3/02/spec.md, ME-05 and ME-17 decision 6; docs/original/formats/scenario.md, summary selection: rule meaning
// (P3-11). Every expectation is worked out by hand from the counts and ranges below.

const MISSION = readAssetId('mission/test-mission');

const counts = (instantiated: number, destroyed: number, left = 0): MissionEventCounts => ({ instantiated, destroyed, left });
const range = (lower: number, upper: number, summarySelector = 0, messages: readonly string[] = ['text']): EventRange => ({ lower, upper, messages, summarySelector });
const trigger = (...ranges: EventRange[]): EventTrigger => ({ ranges });
const match = (triggerIndex: number, rangeIndex: number, summarySelector: number) => ({
  summary: { mission: MISSION, trigger: triggerIndex, range: rangeIndex },
  summarySelector,
});
const NONE = { summary: null, summarySelector: NO_SUMMARY_SELECTOR };

describe('summary ratio (ME-05, ME-17 decision 6)', () => {
  it('is destroyed ÷ instantiated × 100, truncated toward zero, without the world exits', () => {
    expect(summaryRatio(counts(4, 0))).toBe(0);
    expect(summaryRatio(counts(4, 1))).toBe(25);
    expect(summaryRatio(counts(4, 3, 1))).toBe(75);
    expect(summaryRatio(counts(4, 4, 9))).toBe(100);
    expect(summaryRatio(counts(3, 1))).toBe(33);
    expect(summaryRatio(counts(3, 2))).toBe(66);
  });

  it('divides before it multiplies, in f64: 29 of 100 gives 28 and 57 of 100 gives 56', () => {
    // 29 / 100 = 0.29 is 0.28999999999999998 in f64, times 100 is 28.999999999999996; likewise 0.57 × 100 = 56.99999999999999.
    expect(summaryRatio(counts(100, 29))).toBe(28);
    expect(summaryRatio(counts(100, 57))).toBe(56);
    expect(summaryRatio(counts(100, 7))).toBe(7);
  });

  it('is 0 without instantiations, whatever the destructions', () => {
    expect(summaryRatio(counts(0, 0))).toBe(0);
    expect(summaryRatio(counts(0, 5))).toBe(0);
  });
});

describe('summary selection (ME-05)', () => {
  it('takes the first range in array order that holds the ratio, both bounds included', () => {
    const ranges = trigger(range(76, 100, 16), range(50, 75, -3), range(50, 100, 13), range(0, 49));
    expect(selectSummary(MISSION, [ranges], [counts(4, 4)])).toEqual(match(0, 0, 16));
    expect(selectSummary(MISSION, [ranges], [counts(4, 3)])).toEqual(match(0, 1, -3));
    expect(selectSummary(MISSION, [ranges], [counts(100, 76)])).toEqual(match(0, 0, 16));
    expect(selectSummary(MISSION, [ranges], [counts(100, 50)])).toEqual(match(0, 1, -3));
    expect(selectSummary(MISSION, [ranges], [counts(100, 49)])).toEqual(match(0, 3, 0));
    expect(selectSummary(MISSION, [ranges], [counts(4, 0)])).toEqual(match(0, 3, 0));
  });

  it('compares signed bounds, and a range whose lower bound exceeds its upper never matches', () => {
    expect(selectSummary(MISSION, [trigger(range(5, -5, 19), range(-0x80000000, 0, -2))], [counts(4, 0)])).toEqual(match(0, 1, -2));
    expect(selectSummary(MISSION, [trigger(range(-10, -1, 19), range(0, 0x7fffffff, 14))], [counts(1, 1)])).toEqual(match(0, 1, 14));
  });

  it('skips a trigger whose instantiations and destructions are both 0, even with world exits', () => {
    const triggers = [trigger(range(0, 100, 19)), trigger(range(0, 100, 14))];
    expect(selectSummary(MISSION, triggers, [counts(0, 0, 3), counts(2, 1)])).toEqual(match(1, 0, 14));
  });

  it('takes a trigger with destructions and no instantiations at ratio 0', () => {
    const triggers = [trigger(range(1, 100, 19), range(0, 0, 15)), trigger(range(0, 100, 14))];
    expect(selectSummary(MISSION, triggers, [counts(0, 2), counts(2, 1)])).toEqual(match(0, 1, 15));
  });

  it('tries the next trigger when no range holds the ratio, as in a gap between ranges', () => {
    const triggers = [trigger(range(60, 100, 16), range(0, 40)), trigger(range(0, 100, 17))];
    expect(selectSummary(MISSION, triggers, [counts(2, 1), counts(1, 0)])).toEqual(match(1, 0, 17));
    expect(selectSummary(MISSION, triggers, [counts(10, 4), counts(1, 0)])).toEqual(match(0, 1, 0));
    expect(selectSummary(MISSION, triggers, [counts(10, 6), counts(1, 0)])).toEqual(match(0, 0, 16));
    expect(selectSummary(MISSION, triggers, [counts(100, 41), counts(1, 0)])).toEqual(match(1, 0, 17));
  });

  it('stops at the first trigger with a match, even when a later one would match too', () => {
    const triggers = [trigger(range(0, 100, -1)), trigger(range(0, 100, 19))];
    expect(selectSummary(MISSION, triggers, [counts(1, 1), counts(1, 1)])).toEqual(match(0, 0, -1));
  });

  it('refers to a range without messages or with several, never copying the text', () => {
    const triggers = [trigger(range(0, 100, 0, [])), trigger(range(0, 100, 13, ['one ', 'two']))];
    const empty = selectSummary(MISSION, triggers, [counts(1, 0), counts(0, 0)]);
    expect(empty).toEqual(match(0, 0, 0));
    const several = selectSummary(MISSION, triggers, [counts(0, 0), counts(1, 0)]);
    expect(several).toEqual(match(1, 0, 13));
    expect(JSON.stringify([empty, several])).not.toMatch(/one|two/);
  });

  it('is no summary with the selector −1 when nothing matches, every count is 0 or there is no trigger', () => {
    const triggers = [trigger(range(50, 100, 16)), trigger(range(1, 100, 19))];
    expect(selectSummary(MISSION, triggers, [counts(4, 1), counts(3, 0)])).toEqual(NONE);
    expect(selectSummary(MISSION, triggers, [counts(0, 0, 4), counts(0, 0)])).toEqual(NONE);
    expect(selectSummary(MISSION, [], [])).toEqual(NONE);
    expect(NO_SUMMARY_SELECTOR).toBe(-1);
  });

  it('only reads its arguments', () => {
    const triggers = [trigger(range(0, 100, 16))];
    const state = [counts(4, 2, 1)];
    const before = JSON.stringify([triggers, state]);
    selectSummary(MISSION, triggers, state);
    expect(JSON.stringify([triggers, state])).toBe(before);
  });
});
