import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { float32OfRational, rationalOfDouble } from './derivation.test-support.ts';
import {
  collectionDistanceSquared, collectionRadiusSquared, declinesEngagement, engagementDistance, isCollected, isOpposingSide,
  shotCount, targetKindFactor, targetReference, volley, type EngagementMount, type VolleyInput,
} from './parked-engagement.ts';
import { scriptedRand } from './rand.test-support.ts';
import { expectFault } from '../world/world.test-support.ts';

// docs/original/formats/executable.md, E2–E5. Expectations come from the documented rules: exact rationals with BigInt
// for the arithmetic, and preimage counts over every rand value 0–32767 for the draws, worked out from 32768 = q·n + r
// (values below r have q + 1 preimages), not from the code under test.

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** How many rand values 0–32767 map to each key. */
function histogram<Key>(keyOf: (value: number) => Key): Map<Key, number> {
  const counts = new Map<Key, number>();
  for (let value = 0; value <= 32767; value++) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The preimages of value v of rand % n: q + 1 below r, q from r on, with 32768 = q·n + r. */
const preimages = (n: number, value: number): number => Math.floor(32768 / n) + (value < 32768 % n ? 1 : 0);
/** The preimages of the values of rand % 100 from `from` to `to` inclusive. */
function preimagesOf(from: number, to: number): number {
  let count = 0;
  for (let value = from; value <= to; value++) count += preimages(100, value);
  return count;
}

/** floor(numerator ÷ denominator) for BigInt, toward −∞. */
const floorDivide = (numerator: bigint, denominator: bigint): bigint => {
  const quotient = numerator / denominator;
  return quotient * denominator > numerator ? quotient - 1n : quotient;
};
/** trunc(value × factor) exactly, for a double `factor`. */
function exactChop(value: number, factor: number): number {
  const { numerator, denominator } = rationalOfDouble(factor);
  const product = BigInt(value) * numerator;
  return Number(product < 0n ? -floorDivide(-product, denominator) : floorDivide(product, denominator));
}

const expectRuleFault = (work: () => unknown, site: string) => expectFault(work, 'invariant-violated', site);

describe('the non-engagement roll by the self\'s kind (E3.1)', () => {
  // By kind bit: 1 (0x2); 2–6 and 11 (0x87c); 15–18 (0x78000); 10, 12 and 19 (the rest of 0xf9c7c); the others never roll.
  const BELOW: Readonly<Record<number, number>> = { 1: 80, 2: 90, 3: 90, 4: 90, 5: 90, 6: 90, 11: 90, 15: 95, 16: 95, 17: 95, 18: 95, 10: 90, 12: 90, 19: 90 };

  it('rolls once for the rolling kinds and declines below the class threshold, at its boundary', () => {
    for (const [kind, below] of Object.entries(BELOW)) {
      const kindBit = Number(kind);
      for (const [value, declines] of [[below - 1, true], [below, false], [100 + below - 1, true], [99, false], [0, true]] as const) {
        const rand = scriptedRand([value]);
        expect([kindBit, declinesEngagement(kindBit, rand), rand.used]).toEqual([kindBit, declines, 1]);
      }
    }
  });

  it('never draws for kinds 1, 0x80, 0x100, 0x200, 0x2000 and 0x4000', () => {
    for (const kindBit of [0, 7, 8, 9, 13, 14]) {
      const rand = scriptedRand([]);
      expect(declinesEngagement(kindBit, rand)).toBe(false);
      expect(rand.used).toBe(0);
    }
  });

  it('engages with 20 × 327, 10 × 327 and 5 × 327 of the rand values', () => {
    for (const [kindBit, engaging] of [[1, 20 * 327], [2, 10 * 327], [15, 5 * 327], [19, 10 * 327]] as const) {
      const counts = histogram((value) => declinesEngagement(kindBit, scriptedRand([value])));
      expect(counts.get(false)).toBe(engaging);
    }
  });
});

describe('the side gate (E2, E3.2)', () => {
  // The peers of a friendly self (kind in 0x6c87f): kind bits 0–6, 14, 15, 17, 18; of any other self: 7–13, 16, 19.
  const FRIENDLY_PEERS = new Set([0, 1, 2, 3, 4, 5, 6, 14, 15, 17, 18]);
  const FRIENDLY_SELVES = new Set([0, 1, 2, 3, 4, 5, 6, 11, 14, 15, 17, 18]);

  it('opposes the other side\'s kinds for every pair of craft kinds; kind 0x800 opposes itself', () => {
    for (let self = 0; self < 20; self++) {
      for (let other = 0; other < 20; other++) {
        const friendlyPeer = FRIENDLY_PEERS.has(other);
        expect([self, other, isOpposingSide(self, other)]).toEqual([self, other, FRIENDLY_SELVES.has(self) ? !friendlyPeer : friendlyPeer]);
      }
    }
    expect(isOpposingSide(11, 11)).toBe(true);
    expect(isOpposingSide(7, 7)).toBe(false);
  });
});

describe('the target reference by the leader\'s AI mode (E3.2)', () => {
  it('reads +0x90 for 0 and 6 and above, +0x8C for 1–4, and nothing for 5', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 255].map(targetReference)).toEqual(
      ['target', 'object-target', 'object-target', 'object-target', 'object-target', null, 'target', 'target', 'target'],
    );
  });
});

describe('the multi-target collection (E2)', () => {
  it('stores the radius² as f32, rounding R × R to nearest', () => {
    expect(collectionRadiusSquared(250)).toBe(62500);
    // 4097² = 2^24 + 2^13 + 1 lies halfway between two f32 values and rounds to the even one.
    expect(collectionRadiusSquared(4097)).toBe(float32OfRational(4097n * 4097n, 1n, 'nearest'));
    expect(collectionRadiusSquared(4097)).toBe(16785408);
    expectRuleFault(() => collectionRadiusSquared(2 ** 64), 'parked-engagement.collection-radius');
  });

  it('multiplies each double difference by its f32 store: (y + x) + z', () => {
    // Δy = 1 + 2^−25 needs 26 bits; its f32 store is 1, so the y term is 1 + 2^−25 (not Δy² or 1).
    expect(collectionDistanceSquared(at(0, -(2 ** -25), 0), at(0, 1, 0))).toBe(1 + 2 ** -25);
    expect(collectionDistanceSquared(at(1, 0, 0), at(0, 0, 0))).toBe(1);
    // With x and z terms of 0.5625 (Δ = 0.75) and 2^52 on one axis: 2^52 on y gives (2^52 + 0.5625 → 2^52 + 1) + 0.5625
    // → 2^52 + 2; 2^52 on z gives (0.5625 + 0.5625) + 2^52 → 2^52 + 1.
    expect(collectionDistanceSquared(at(0, 0, 0), at(0.75, 2 ** 26, 0.75))).toBe(2 ** 52 + 2);
    expect(collectionDistanceSquared(at(0, 0, 0), at(0.75, 0.75, 2 ** 26))).toBe(2 ** 52 + 1);
  });

  it('faults when a difference\'s f32 store overflows', () => {
    const far = Math.fround(3e38);
    for (const [from, to] of [[at(-far, 0, 0), at(far, 0, 0)], [at(0, far, 0), at(0, -far, 0)], [at(0, 0, -far), at(0, 0, far)]]) {
      expectRuleFault(() => collectionDistanceSquared(from, to), 'parked-engagement.collection-distance');
    }
    expect(collectionDistanceSquared(at(0, 0, 0), at(far, 0, 0))).toBe(far * far);
  });

  it('collects strictly inside the radius² (and a NaN, as the original\'s compare does)', () => {
    expect([isCollected(62499.5, 62500), isCollected(62500, 62500), isCollected(62501, 62500), isCollected(Number.NaN, 62500)]).toEqual([true, false, false, true]);
  });
});

describe('the engagement distance (E3.3)', () => {
  it('is (L1 − r) × 3 × 0.25 stored as f32, the radius subtracted before the factors', () => {
    expect(engagementDistance(at(0, 0, 0), at(10, -20, 30.5), 4)).toBe(42.375);
    expect(engagementDistance(at(1, 2, 3), at(1, 2, 13), 4)).toBe(4.5);
    // L1 − r = 2^24 + 1: × 3 × 0.25 = 12582912.75, stored as the nearest f32.
    expect(engagementDistance(at(0, 0, 0), at(0, 2 ** 24 + 2, 0), 1)).toBe(float32OfRational(3n * (2n ** 24n + 1n), 4n, 'nearest'));
    expect(engagementDistance(at(0, 0, 0), at(0, 2 ** 24 + 2, 0), 1)).toBe(12582913);
  });

  it('is negative inside the target\'s radius and a fault when the store overflows f32', () => {
    expect(engagementDistance(at(5, 5, 5), at(5, 6, 5), 9)).toBe(-6);
    const far = Math.fround(3e38);
    expectRuleFault(() => engagementDistance(at(-far, -far, 0), at(far, far, 0), 0), 'parked-engagement.distance');
  });
});

describe('the shot count (E3.5, E5)', () => {
  it('is floor(elapsed × cooldown ÷ 64) ÷ divisor toward zero, at least 1', () => {
    const cases = [
      [640, 7, 1, 70], [640, 7, 3, 23], [63, 1, 1, 1], [64, 1, 1, 1], [128, 1, 1, 2], [129, 1, 1, 2], [640, 8, 81, 1], [640, 0, 1, 1], [6400, 32, 7, 457],
    ];
    for (const [elapsed, cooldown, divisor, shots] of cases) {
      expect([elapsed, cooldown, divisor, shotCount(elapsed, cooldown, divisor)]).toEqual([elapsed, cooldown, divisor, shots]);
    }
  });

  it('reaches 2^31 − 1 at the largest elapsed time and cooldown 32, and faults beyond i32', () => {
    expect(shotCount(2 ** 32 - 1, 32, 1)).toBe(2 ** 31 - 1);
    expectRuleFault(() => shotCount(2 ** 32 - 1, 33, 1), 'parked-engagement.shots');
  });
});

describe('the factor by the target\'s kind (E3.6 step 2, E5)', () => {
  it('is 0.88, 0.5 or 0.9 on the friendly class, 0.9 for 0x400, 0x1000 and 0x80000, none otherwise', () => {
    const expected = [0.9, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5, null, null, null, 0.9, 0.5, 0.9, null, 0.9, 0.88, null, 0.88, 0.88, 0.9];
    expect(Array.from({ length: 20 }, (_, kindBit) => targetKindFactor(kindBit))).toEqual(expected);
  });

  it('equals floor(total × 22/25), floor(total ÷ 2) and floor(total × 9/10) for positive i32 totals', () => {
    const totals = [1, 2, 9, 10, 11, 24, 25, 26, 99, 1000, 123_456_789, 2 ** 29 - 1, 2 ** 29, 2 ** 30 + 3, 2 ** 31 - 2, 2 ** 31 - 1];
    for (const total of totals) {
      const big = BigInt(total);
      const results = [15, 2, 0].map((kindBit) => volley(input([], { targetKindBit: kindBit, scale: 1, baseTotal: total }), scriptedRand([])).damage);
      expect([total, ...results]).toEqual([total, Number((big * 22n) / 25n), Number(big / 2n), Number((big * 9n) / 10n)]);
    }
  });
});

const GUN_A: EngagementMount = { type: 'gun', range: 100, cooldown: 8, damage: 5 };
const GUN_B: EngagementMount = { type: 'gun', range: 50, cooldown: 32, damage: 3 };
const missileMount = (range: number, damage: number, ammunition: number): EngagementMount => ({ type: 'missile', range, damage, ammunition });

/**
 * A volley at kind 7 (no kind factor) with S = 1, divisor 1 and d = 19.5 unless overridden. `baseTotal` adds a gun that
 * contributes exactly that total: one shot (cooldown 0) of that damage, in range.
 */
function input(mounts: readonly EngagementMount[], overrides: Partial<VolleyInput> & { readonly baseTotal?: number } = {}): VolleyInput {
  const { baseTotal, ...rest } = overrides;
  const base: EngagementMount[] = baseTotal === undefined ? [] : [{ type: 'gun', range: Infinity, cooldown: 0, damage: baseTotal }];
  return { mounts: [...base, ...mounts], distance: 19.5, elapsed: 640, divisor: 1, choosesMissile: false, targetKindBit: 7, scale: 1, ...rest };
}

describe('the volley (E3.4–E3.6)', () => {
  it('sums every gun in range, once per shot, without drawing', () => {
    // Gun A: 640 × 8 ÷ 64 = 80 shots × 5; gun B: 640 × 32 ÷ 64 = 320 shots × 3.
    const rand = scriptedRand([]);
    expect(volley(input([GUN_A, GUN_B]), rand)).toEqual({ damage: 80 * 5 + 320 * 3, missileMount: null });
    // Range equal to d is out of range; d below 0 puts any range in range.
    expect(volley(input([GUN_A, GUN_B], { distance: 50 }), rand).damage).toBe(400);
    expect(volley(input([GUN_A, GUN_B], { distance: 100 }), rand).damage).toBe(0);
    expect(volley(input([{ ...GUN_A, range: 0 }], { distance: -0.75 }), rand).damage).toBe(400);
    expect(rand.used).toBe(0);
  });

  it('shares each gun\'s shots by the divisor, at least one each', () => {
    // 80 ÷ 3 = 26 and 320 ÷ 3 = 106; with divisor 400 both are 1.
    expect(volley(input([GUN_A, GUN_B], { divisor: 3 }), scriptedRand([])).damage).toBe(26 * 5 + 106 * 3);
    expect(volley(input([GUN_A, GUN_B], { divisor: 400 }), scriptedRand([])).damage).toBe(5 + 3);
  });

  it('chooses no missile, without a draw, when +0xE0 is negative or no missile mount qualifies', () => {
    const missiles = [missileMount(200, 40, 2), missileMount(80, 70, 1)];
    const rand = scriptedRand([]);
    expect(volley(input([GUN_A, ...missiles], { choosesMissile: false }), rand)).toEqual({ damage: 400, missileMount: null });
    // Ammunition 0, range equal to d and range below d do not qualify.
    const none = [missileMount(200, 40, 0), missileMount(19.5, 70, 1), missileMount(10, 70, 1)];
    expect(volley(input([GUN_A, ...none], { choosesMissile: true }), rand)).toEqual({ damage: 400, missileMount: null });
    expect(rand.used).toBe(0);
  });

  it('chooses the (rand % c)-th qualifying missile mount in mount order, negative ammunition included', () => {
    const mounts = [GUN_A, missileMount(200, 40, 2), missileMount(10, 50, 1), missileMount(80, 70, -1), missileMount(30, 90, 0), missileMount(30, 110, 5)];
    // Qualifying: mounts 1, 3 and 5 (c = 3).
    const counts = histogram((value) => volley(input(mounts, { choosesMissile: true }), scriptedRand([value])).missileMount);
    expect(counts).toEqual(new Map([[1, preimages(3, 0)], [3, preimages(3, 1)], [5, preimages(3, 2)]]));
    expect(volley(input(mounts, { choosesMissile: true }), scriptedRand([4])).damage).toBe(400 + 70);
  });

  it('adds the chosen missile against other kinds without a second draw, and against kind 2 only below 20 of rand % 100', () => {
    const mounts = [GUN_A, missileMount(200, 40, 2)];
    const plain = scriptedRand([0]);
    expect(volley(input(mounts, { choosesMissile: true }), plain)).toEqual({ damage: 440, missileMount: 1 });
    expect(plain.used).toBe(1);
    // Against the wingman: × 0.9 afterwards.
    const wingman = { choosesMissile: true, targetKindBit: 1 } as const;
    for (const [roll, damage] of [[19, 396], [20, 360], [119, 396], [99, 360]] as const) {
      const rand = scriptedRand([0, roll]);
      expect([roll, volley(input(mounts, wingman), rand), rand.used]).toEqual([roll, { damage, missileMount: 1 }, 2]);
    }
    const counted = histogram((value) => volley(input(mounts, wingman), scriptedRand([0, value])).damage === 396);
    expect(counted.get(true)).toBe(preimagesOf(0, 19));
  });

  it('adds in i32, wrapping; a total at or below 0 stays there', () => {
    const longest = 2 ** 32 - 1;
    const wrapped = (shots: bigint, damage: bigint): number => Number(BigInt.asIntN(32, shots * damage));
    // 2^31 − 1 shots of 3 wrap to 2^31 − 3; of 2 to −2.
    expect(volley(input([{ type: 'gun', range: 100, cooldown: 32, damage: 3 }], { elapsed: longest }), scriptedRand([])).damage).toBe(wrapped(2n ** 31n - 1n, 3n));
    expect(wrapped(2n ** 31n - 1n, 3n)).toBe(2 ** 31 - 3);
    expect(volley(input([{ type: 'gun', range: 100, cooldown: 32, damage: 2 }], { elapsed: longest }), scriptedRand([])).damage).toBe(-2);
    // Two guns and a missile together: (2^31 − 1)·2 + (2^31 − 1)·1 + 5 wraps to 2^31 + 2 − 2^32 = −2^31 + 2.
    const mounts: EngagementMount[] = [
      { type: 'gun', range: 100, cooldown: 32, damage: 2 }, { type: 'gun', range: 100, cooldown: 32, damage: 1 }, missileMount(100, 5, 1),
    ];
    const total = Number(BigInt.asIntN(32, (2n ** 31n - 1n) * 3n + 5n));
    expect(volley(input(mounts, { elapsed: longest, choosesMissile: true }), scriptedRand([0])).damage).toBe(total);
    // Chopped toward zero by the kind factor: −2 × 0.5 = −1.
    expect(volley(input([{ type: 'gun', range: 100, cooldown: 32, damage: 2 }], { elapsed: longest, targetKindBit: 2 }), scriptedRand([])).damage).toBe(-1);
  });

  it('chops the total times the TABL 4003 scale, then the kind factor', () => {
    const scales = [Math.fround(0.3), 0.75, Math.fround(0.123), 1];
    for (const scale of scales) {
      for (const total of [1, 7, 1360, 99_999, 2 ** 29 - 1]) {
        const scaled = exactChop(total, scale);
        expect([scale, total, volley(input([], { baseTotal: total, scale }), scriptedRand([])).damage]).toEqual([scale, total, scaled]);
        expect([scale, total, volley(input([], { baseTotal: total, scale, targetKindBit: 2 }), scriptedRand([])).damage]).toEqual([scale, total, Math.floor(scaled / 2)]);
      }
    }
    // 1360 × 0.75 = 1020, × 0.88 (kind 15) = 897.6 → 897.
    expect(volley(input([GUN_A, GUN_B], { scale: 0.75, targetKindBit: 15 }), scriptedRand([])).damage).toBe(897);
  });

  it('faults when the scaled total leaves i32', () => {
    expectRuleFault(() => volley(input([], { baseTotal: 2 ** 31 - 1, scale: 2 }), scriptedRand([])), 'parked-engagement.scaled');
  });
});
