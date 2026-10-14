import { describe, expect, it } from 'vitest';
import type { Pair } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { expectFault } from '../world/world.test-support.ts';
import { vectorDistance } from './steering.ts';
import { costPercent, warpCharge, warpCost, warpCostReading, warpDistance, warpStartCheck } from './warp-energy.ts';

// Expectations worked out by hand from docs/original/formats/executable.md (Warp cost and Warp start; completion step 8)
// and MW-04/MW-08/MW-11 of docs/plan/p3/02/spec.md, not from the helpers; the i32 wraps were checked with BigInt.

const pairs = (...entries: readonly (readonly [number, number])[]): readonly Pair[] =>
  entries.map(([at00, at04]) => ({ at00, at04 }));

/** The slice player's structure (05): three pairs, first values strictly increasing and non-negative, coefficients rising. */
const SLICE_SHAPE = pairs([5, 300], [20, 400], [60, 500]);

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const ORIGIN = vec(0, 0, 0);

describe('the cost 0x30d2c', () => {
  it.each([
    // q = n ÷ 1000; the first pair with q ≤ f in table order.
    ['n 0 costs nothing', 0, 0],
    ['n 999: q 0, first pair', 999, 299], // 300 × 999 = 299,700 → 299
    ['n 5999: q 5 = f₀, still the first pair (q ≤ f)', 5999, 1799], // 1,799,700 → 1799
    ['n 6000: q 6, second pair', 6000, 2400],
    ['n 20999: q 20 = f₁, second pair', 20_999, 8399], // 8,399,600 → 8399
    ['n 21000: q 21, third pair', 21_000, 10_500],
    ['n 60999: q 60 = f₂, third pair', 60_999, 30_499], // 30,499,500 → 30,499
    ['n 61000: q 61 beyond every pair, the last pair', 61_000, 30_500],
  ] as const)('%s', (_, n, expected) => {
    expect(warpCost(SLICE_SHAPE, n)).toBe(expected);
  });

  it('takes the first matching pair in table order, not the closest or the smallest', () => {
    const table = pairs([10, 100], [2, 700]);
    expect(warpCost(table, 1000)).toBe(100); // q 1 ≤ 10 already at the first pair, though 1 ≤ 2 too
    expect(warpCost(table, 3000)).toBe(300); // q 3 ≤ 10
    expect(warpCost(table, 11_000)).toBe(7700); // q 11 matches neither: the last pair's 700
  });

  it('compares q and the first value signed, so a negative first value is only reached as the last pair', () => {
    expect(warpCost(pairs([-1, 900], [5, 100]), 500)).toBe(50); // q 0 > −1: the second pair
    expect(warpCost(pairs([-1, 900]), 2000)).toBe(1800); // no match: the last (only) pair
  });

  it('charges nothing at a zero coefficient, and nothing for n below 1000 ÷ coefficient', () => {
    expect(warpCost(pairs([0, 0]), 50_000)).toBe(0);
    expect(warpCost(pairs([9, 3]), 333)).toBe(0); // 999 ÷ 1000 → 0
    expect(warpCost(pairs([9, 3]), 334)).toBe(1); // 1002 ÷ 1000 → 1
  });

  it('wraps the IMUL in i32 and divides toward zero', () => {
    expect(warpCost(pairs([0, 0x7fff_ffff]), 1000)).toBe(-1); // (2³¹ − 1) × 1000 ≡ −1000
    expect(warpCost(pairs([0, 0x20_0000]), 1024)).toBe(-2_147_483); // 2²¹ × 2¹⁰ ≡ −2³¹; −2,147,483.648 → −2,147,483
    expect(warpCost(pairs([0, 0x20_0000]), 2048)).toBe(0); // 2³² ≡ 0
  });

  it('faults without a pair (the original reads the word before the array)', () => {
    expectFault(() => warpCost([], 1000), 'invariant-violated', 'warp-energy.pairs');
  });

  it('rises with the distance for the slice structure, without wrapping at the slice scale', () => {
    let previous = -1;
    const falls: number[] = [];
    for (let n = 0; n <= 120_000; n += 37) {
      const cost = warpCost(SLICE_SHAPE, n);
      if (cost < previous) falls.push(n);
      previous = cost;
    }
    expect(falls).toEqual([]);
    expect(previous).toBe(59_995); // the last n, 119,991 = 3243 × 37: 500 × 119,991 = 59,995,500 → 59,995
  });
});

describe('the distance 0x56b14 and the cost parameter', () => {
  it('is the unrounded root of the f32-factored squares', () => {
    expect(warpDistance(vec(0, 0, 0), vec(3000, 4000, 0))).toBe(5000);
    expect(warpDistance(vec(0, 0, 0), vec(3000, 0, 4000))).toBe(5000);
    expect(warpDistance(vec(1, 1, 1), vec(0, 0, 0))).toBe(Math.sqrt(3));
  });

  // x = 7000 − 2⁻¹¹ (an f32), y = 2: d = √(x² + 4) ≈ 6999.99979743, whose nearest f32 is 7000.
  const NEAR = vec(6999.99951171875, 2, 0);
  const STRADDLE = pairs([6, 100], [99, 200]);

  it('truncates the unrounded distance for the check and the readouts, but the f32 store D for the charge', () => {
    expect(vectorDistance(ORIGIN, NEAR)).toBe(7000);
    // trunc(d) = 6999 (q 6, first pair): 100 × 6999 ÷ 1000 → 699; the start reports R(d) = 7000.
    expect(warpStartCheck(STRADDLE, ORIGIN, NEAR, 699)).toEqual({ distance: 7000, cost: 699, energy: 699, affordable: true });
    expect(warpCostReading(STRADDLE, ORIGIN, NEAR, 699).cost).toBe(699);
    // trunc(D) = 7000 (q 7, second pair): 200 × 7000 ÷ 1000 = 1400.
    expect(warpCharge(STRADDLE, 7000, 5000, 0)).toEqual({ distance: 7000, cost: 1400, energyBefore: 5000, energyAfter: 3600 });
  });

  it('accepts the largest truncated distance i32 holds and faults beyond it, as FISTP does', () => {
    // z = 2³¹ − 128, an f32: d = z exactly; 500 × z ≡ −64,000 in i32 → −64.
    expect(warpStartCheck(pairs([0, 500]), ORIGIN, vec(0, 0, 2_147_483_520), 0).cost).toBe(-64);
    expectFault(() => warpStartCheck(pairs([0, 500]), ORIGIN, vec(0, 0, 2 ** 31), 0), 'invariant-violated', 'warp-energy.parameter');
    expectFault(() => warpCostReading(pairs([0, 500]), ORIGIN, vec(0, 0, 2 ** 31), 1), 'invariant-violated', 'warp-energy.parameter');
    expectFault(() => warpCharge(pairs([0, 500]), 2 ** 31, 1, 0), 'invariant-violated', 'warp-energy.charge-distance');
  });
});

describe('the start check (MW-04 step 6)', () => {
  // ORIGIN → (6000, 0, 0): trunc(d) 6000, q 6, second pair: 2400.
  const DESTINATION = vec(6000, 0, 0);

  it.each([
    ['passes with energy to spare', 2401, true],
    ['passes when exactly enough (c = E)', 2400, true],
    ['refuses one unit short (c > E)', 2399, false],
  ] as const)('%s', (_, energy, affordable) => {
    expect(warpStartCheck(SLICE_SHAPE, ORIGIN, DESTINATION, energy)).toEqual({ distance: 6000, cost: 2400, energy, affordable });
  });

  it('accepts a zero-distance Warp at zero energy, as 0 ≤ 0', () => {
    expect(warpStartCheck(SLICE_SHAPE, DESTINATION, DESTINATION, 0)).toEqual({ distance: 0, cost: 0, energy: 0, affordable: true });
  });

  it('compares signed: a negative energy refuses even a free Warp, and a wrapped negative cost always passes', () => {
    expect(warpStartCheck(SLICE_SHAPE, DESTINATION, DESTINATION, -1).affordable).toBe(false);
    expect(warpStartCheck(pairs([0, 0x7fff_ffff]), ORIGIN, vec(1000, 0, 0), -1)).toMatchObject({ cost: -1, affordable: true });
  });
});

describe('the readout percentage', () => {
  it.each([
    ['exactly enough shows 100', 2400, 2400, 100],
    ['one unit over shows 100', 2401, 2400, 100],
    ['three times the energy shows 300', 3000, 1000, 300],
    ['one unit short shows 99', 99, 100, 99],
    ['the lowest 67–99 value', 67, 100, 67],
    ['2 of 3 shows 66, the low band', 2, 3, 66], // 66.67 truncated
    ['a cost below 1 % shows the minimum 1', 1, 1000, 1],
    ['a zero cost shows the minimum 1', 0, 5000, 1],
    ['a wrapped negative cost shows the minimum 1', -1, 5000, 1],
    // 29 ÷ 100 in double is just below 0.29; × 100 gives 28.999999999999996, truncated to 28 as the x87 does.
    ['keeps the double quotient: 29 of 100 shows 28', 29, 100, 28],
  ] as const)('%s', (_, cost, energy, percent) => {
    expect(costPercent(cost, energy)).toBe(percent);
  });

  it('is null at E = 0, where the original raises an x87 exception (MW-12 difference 4)', () => {
    expect(costPercent(0, 0)).toBeNull();
    expect(costPercent(2400, 0)).toBeNull();
  });

  it('reaches 100 exactly when c ≥ E, so the top colour band covers an exactly affordable Warp', () => {
    const mismatches: (readonly [number, number])[] = [];
    for (let energy = 1; energy <= 400; energy += 1) {
      for (let cost = 0; cost <= 2 * energy; cost += 1) if (costPercent(cost, energy)! >= 100 !== cost >= energy) mismatches.push([cost, energy]);
    }
    expect(mismatches).toEqual([]);
    for (const energy of [99_999, 1_000_003, 0x7fff_ffff]) {
      expect(costPercent(energy - 1, energy)).toBe(99);
      expect(costPercent(energy, energy)).toBe(100);
    }
  });
});

describe('the map readouts', () => {
  it('measure from the given icon position to the cursor point (z 0) or to the destination with its z', () => {
    const icon = vec(1000, 1000, 0);
    // Cursor (4000, 5000, 0): d = 5000, q 5, first pair: 1500.
    expect(warpCostReading(SLICE_SHAPE, icon, vec(4000, 5000, 0), 3000)).toEqual({ cost: 1500, energy: 3000, percent: 50 });
    // Destination (1000, 4000, 4000): d = 5000 through z as well.
    expect(warpCostReading(SLICE_SHAPE, icon, vec(1000, 4000, 4000), 1500)).toEqual({ cost: 1500, energy: 1500, percent: 100 });
    // The same destination without its z: d = 3000 → 900.
    expect(warpCostReading(SLICE_SHAPE, icon, vec(1000, 4000, 0), 1500)).toEqual({ cost: 900, energy: 1500, percent: 60 });
    expect(warpCostReading(SLICE_SHAPE, icon, vec(1000, 4000, 0), 0)).toEqual({ cost: 900, energy: 0, percent: null });
  });
});

describe('the completion charge (MW-08 step 4)', () => {
  // D 5999 → c = 1799 (odd, so s = 1 has a half-unit to round).
  it.each([
    ['charges c at s 0', 10_000, 0, 8201],
    ['charges ⌈1.5 c⌉ = 2699 at s 1', 10_000, 1, 7301], // 10,000 − 2698.5 = 7301.5 → 7301
    ['charges ⌈1.125 c⌉ = 2024 at s 0.25', 10_000, 0.25, 7976], // 1799 + 224.875 = 2023.875
    ['empties exactly-enough energy', 2699, 1, 0], // 0.5 → 0
    ['clamps a charge beyond the energy at 0', 2000, 1, 0], // −698.5 → −698 → 0
    ['clamps from zero energy', 0, 0, 0],
  ] as const)('%s', (_, energy, error, energyAfter) => {
    expect(warpCharge(SLICE_SHAPE, 5999, energy, error)).toEqual({ distance: 5999, cost: 1799, energyBefore: energy, energyAfter });
  });

  it('ends at +0 when the remainder truncates to −0', () => {
    expect(Object.is(warpCharge(SLICE_SHAPE, 5999, 2698, 1).energyAfter, 0)).toBe(true); // −0.5 → −0 → 0
  });

  it('truncates the stored distance D, and a zero distance charges nothing', () => {
    expect(warpCharge(SLICE_SHAPE, 6000.5, 10_000, 0)).toMatchObject({ distance: 6000, cost: 2400, energyAfter: 7600 });
    expect(warpCharge(SLICE_SHAPE, 0, 10_000, 1)).toEqual({ distance: 0, cost: 0, energyBefore: 10_000, energyAfter: 10_000 });
  });

  it('can exceed the start check: the same distance affordable at the start empties the energy at s 1', () => {
    expect(warpStartCheck(SLICE_SHAPE, ORIGIN, vec(5999, 0, 0), 1799).affordable).toBe(true);
    expect(warpCharge(SLICE_SHAPE, 5999, 1799, 1).energyAfter).toBe(0);
  });

  it('adds energy for a wrapped negative cost and faults when the result leaves i32', () => {
    expect(warpCharge(pairs([0, 0x7fff_ffff]), 1000, 100, 1).energyAfter).toBe(101); // 100 + 1.5 → 101
    expectFault(() => warpCharge(pairs([0, 0x20_0000]), 1024, 0x7fff_ffff, 0), 'invariant-violated', 'warp-energy.charge');
  });
});
