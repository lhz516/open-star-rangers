import { describe, expect, it } from 'vitest';
import type { RuleInputs } from '../../content/logic/logic-content.ts';
import type { RandSource } from './original-random.ts';
import { fillRecordDefaults, missionDefault, randomAiValue, unfilledRuleInputs } from './record-defaults.ts';

// Expectations follow Q-04 (docs/original/formats/executable.md#record-defaults-p3-0203; scenario.md §3), written out
// per field: a source 0 (null) takes the default; +0x60/+0x64/+0x68/+0x70/+0x78 clamp negatives to 0, +0x0C/+0x10/+0x74
// keep them.

const NONE: RuleInputs = Object.freeze({
  percentA: null, craftCount: null, percentB: null, percentC: null, percentD: null, aiValueA: null, aiValueB: null, aiValueC: null,
});

/** A rand source that replays `values` and counts the draws. */
function scripted(values: readonly number[]): RandSource & { readonly used: number } {
  let used = 0;
  return {
    next() {
      if (used >= values.length) throw new Error('drew more rand values than scripted');
      return values[used++];
    },
    get used() {
      return used;
    },
  };
}

const D = 7;

describe('record defaults per field (P3-02 AC-07, Q-04)', () => {
  it.each([
    // [field, source value, expected]
    ['percentA', null, 100], ['percentA', 50, 50], ['percentA', 0xffffffff, -1], ['percentA', 0x80000000, -0x80000000],
    ['craftCount', null, 1], ['craftCount', 3, 3], ['craftCount', 0xfffffffe, -2],
    ['percentB', null, 100], ['percentB', 7, 7], ['percentB', -5, 0],
    ['percentC', null, 100], ['percentC', 250, 250], ['percentC', -1, 0],
    ['percentD', null, 100], ['percentD', 1, 1], ['percentD', -0x80000000, 0],
    ['aiValueA', null, D], ['aiValueA', 9, 9], ['aiValueA', -4, 0],
    ['aiValueB', null, D], ['aiValueB', 9, 9], ['aiValueB', -4, -4],
    ['aiValueC', 9, 9], ['aiValueC', -4, 0],
  ] as const)('%s: %s becomes %s', (field, value, expected) => {
    const rand = scripted([]);
    const filled = fillRecordDefaults({ ...NONE, aiValueC: 1, [field]: value }, D, rand);
    expect(filled[field]).toBe(expected);
    expect(rand.used).toBe(0);
  });

  it('treats an explicit 0 like a source 0, as the original does (world creation rejects explicit zeros)', () => {
    const zeros = Object.fromEntries(Object.keys(NONE).map((key) => [key, 0])) as unknown as RuleInputs;
    expect(fillRecordDefaults(zeros, D, scripted([0]))).toEqual(fillRecordDefaults(NONE, D, scripted([0])));
  });

  it('draws +0x78 once, rand % 60 + 20, only when it is a source 0', () => {
    const rand = scripted([125]);
    expect(fillRecordDefaults(NONE, D, rand)).toEqual({
      percentA: 100, craftCount: 1, percentB: 100, percentC: 100, percentD: 100, aiValueA: D, aiValueB: D, aiValueC: 25,
    });
    expect(rand.used).toBe(1);
  });

  it('maps rand to +0x78 with 547 preimages for 20–27 and 546 for 28–79 (32,768 = 60 × 546 + 8)', () => {
    const counts = new Map<number, number>();
    for (let value = 0; value <= 32767; value++) {
      const result = randomAiValue(scripted([value]));
      counts.set(result, (counts.get(result) ?? 0) + 1);
    }
    const expected = new Map<number, number>();
    for (let result = 20; result <= 79; result++) expected.set(result, result <= 27 ? 547 : 546);
    expect(counts).toEqual(expected);
    expect(randomAiValue(scripted([0]))).toBe(20);
    expect(randomAiValue(scripted([32767]))).toBe(27);
  });

  it('defaults +0x70/+0x74 to (group + 3) × mission number, or 100 below mission 1', () => {
    expect(missionDefault(0, 1)).toBe(3);
    expect(missionDefault(2, 17)).toBe(85);
    expect(missionDefault(1, 0)).toBe(100);
    expect(missionDefault(0, -1)).toBe(100);
  });

  it('keeps a record the build does not fill at its source values: 0 for null, the i32 view, negatives kept, no draw', () => {
    expect(unfilledRuleInputs(NONE)).toEqual({ percentA: 0, craftCount: 0, percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 });
    expect(unfilledRuleInputs({ ...NONE, percentA: 100, craftCount: 0xffffffff, percentB: -5, aiValueA: -3, aiValueC: 12 })).toEqual({
      percentA: 100, craftCount: -1, percentB: -5, percentC: 0, percentD: 0, aiValueA: -3, aiValueB: 0, aiValueC: 12,
    });
  });
});
