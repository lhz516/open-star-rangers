import { describe, expect, it } from 'vitest';
import type { Matrix3 } from '../world/entity-table.ts';
import {
  accumulateFriendlyFire,
  attackerKind,
  craftUnderAttackIndex,
  destroyedIndex,
  isEnemyAttacker,
  isLowHull,
  isOnTail,
  isFriendly,
  isSuppressed,
  isWithinWingmanRange,
  lostNearWingmanLine,
  secondUnderAttackIndex,
  underAttackIndex,
} from './comm-reactions.ts';
import { assignFace } from './radio.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations written out from docs/original/formats/executable.md RX1–RX3, RX5, RX8 and RX9 and
// docs/plan/p3/02/spec.md CB-05 and CB-12, not from the code under test. Kind masks are written out bit by bit:
// 0x6887c = bits 2–6, 11, 15, 17, 18; 0x6c87f = bits 0–6, 11, 14, 15, 17, 18.

const bits = (...indexes: number[]) => indexes.reduce((mask, index) => mask + 2 ** index, 0);

describe('attacker kinds and friendlies (RX2, RX3; D2)', () => {
  it('passes the shooter\'s kind, 0x93780 for a lost shooter and 0 for none', () => {
    expect(attackerKind({ type: 'shooter', entityId: 4, kindBit: 0 })).toBe(1);
    expect(attackerKind({ type: 'shooter', entityId: 4, kindBit: 1 })).toBe(2);
    expect(attackerKind({ type: 'shooter', entityId: 4, kindBit: 19 })).toBe(0x80000);
    expect(attackerKind({ type: 'lost-shooter' })).toBe(0x93780);
    expect(attackerKind({ type: 'none' })).toBe(0);
  });

  it('takes the friendlies as kinds 0x6807c, which are 0x6887c other than 0x800', () => {
    const friendly = [2, 3, 4, 5, 6, 15, 17, 18];
    for (let kindBit = 0; kindBit < 32; kindBit++) expect(isFriendly(kindBit)).toBe(friendly.includes(kindBit));
    expect(bits(...friendly)).toBe(0x6807c);
    expect(bits(...friendly, 11)).toBe(0x6887c);
  });

  it('counts an attacker kind as an enemy\'s when non-zero and outside 0x6c87f', () => {
    const friendly = [0, 1, 2, 3, 4, 5, 6, 11, 14, 15, 17, 18];
    expect(bits(...friendly)).toBe(0x6c87f);
    for (let kindBit = 0; kindBit < 25; kindBit++) expect(isEnemyAttacker(2 ** kindBit)).toBe(!friendly.includes(kindBit));
    expect(isEnemyAttacker(0)).toBe(false);
    expect(isEnemyAttacker(0x93780)).toBe(true);
  });
});

describe('limits and the friendly-fire total (RX2, RX8)', () => {
  it('suppresses while stamp + period is at least the sample; never without a stamp', () => {
    expect(isSuppressed(null, 0x2d00, 5)).toBe(false);
    expect(isSuppressed(100, 0x2d00, 100 + 0x2d00)).toBe(true);
    expect(isSuppressed(100, 0x2d00, 101 + 0x2d00)).toBe(false);
    expect(isSuppressed(100, 0xf00, 50)).toBe(true);
  });

  it('tests the low hull as trunc(capacity × 30 ÷ 100) > hull in i32', () => {
    // 1000 × 30 ÷ 100 = 300; 7 × 30 ÷ 100 = 2.1 → 2; −7 × 30 ÷ 100 = −2.1 → −2 (toward zero).
    expect(isLowHull(1000, 299)).toBe(true);
    expect(isLowHull(1000, 300)).toBe(false);
    expect(isLowHull(7, 1)).toBe(true);
    expect(isLowHull(7, 2)).toBe(false);
    expect(isLowHull(-7, -3)).toBe(true);
    expect(isLowHull(-7, -2)).toBe(false);
    // 100,000,000 × 30 = 3,000,000,000 wraps to −1,294,967,296; ÷ 100 → −12,949,672.
    expect(isLowHull(100_000_000, -12_949_673)).toBe(true);
    expect(isLowHull(100_000_000, -12_949_672)).toBe(false);
  });

  it('restarts the window at 0 once the sample is past its end, then adds the raw damage as i32', () => {
    const total = { accumulated: 40, windowEnd: 100 };
    accumulateFriendlyFire(total, 100, 5);
    expect(total).toEqual({ accumulated: 45, windowEnd: 100 });
    accumulateFriendlyFire(total, 101, 7);
    expect(total).toEqual({ accumulated: 7, windowEnd: 101 + 0x780 });
    accumulateFriendlyFire(total, 102, -3);
    expect(total).toEqual({ accumulated: 4, windowEnd: 101 + 0x780 });
    const wrapping = { accumulated: 0x7fffffff, windowEnd: 200 };
    accumulateFriendlyFire(wrapping, 150, 1);
    expect(wrapping.accumulated).toBe(-0x80000000);
  });
});

describe('message indexes by name (RX1–RX3, RX10)', () => {
  const in2001 = { in2001: 3, in2011: null };
  const in2011 = { in2001: null, in2011: 4 };
  const neither = { in2001: null, in2011: null };

  it('offsets the 2001 position first, else the 2011 one, else none', () => {
    expect([underAttackIndex(in2001), underAttackIndex(in2011), underAttackIndex(neither)]).toEqual([0x1a + 3, 7 + 4, null]);
    expect([destroyedIndex(in2001), destroyedIndex(in2011), destroyedIndex(neither)]).toEqual([0x41 + 3, 0x2e + 4, null]);
    expect([lostNearWingmanLine(in2001), lostNearWingmanLine(in2011), lostNearWingmanLine(neither)]).toEqual([0x29 + 3, 0x16 + 4, null]);
    expect(underAttackIndex({ in2001: 0, in2011: 9 })).toBe(0x1a);
  });

  it('takes an active craft\'s 20019 index from 2011 only', () => {
    expect([craftUnderAttackIndex(in2011), craftUnderAttackIndex(in2001), craftUnderAttackIndex({ in2001: 1, in2011: 0 })]).toEqual([7, null, 3]);
  });

  it('chooses the second message by one rand % 4: 8,192 preimages each over 0–32767 (32768 = 4 × 8192)', () => {
    const counts = [0, 0, 0, 0];
    for (let value = 0; value <= 32767; value++) {
      const rand = scriptedRand([value]);
      counts[secondUnderAttackIndex(rand)]++;
      expect(rand.used).toBe(1);
    }
    expect(counts).toEqual([8192, 8192, 8192, 8192]);
  });
});

describe('the face a craft or base draws at its first speech (RQ4, RX9 row 4)', () => {
  // 32768 = 3 × 10922 + 2 and 5 × 6553 + 3: values below the remainder have one more preimage.
  it.each([
    [3, [10923, 10923, 10922]],
    [5, [6554, 6554, 6554, 6553, 6553]],
  ])('takes rand %% %i with a free pool: one draw, counted over 0–32767', (size, expected) => {
    const counts = new Array<number>(size).fill(0);
    for (let value = 0; value <= 32767; value++) {
      const rand = scriptedRand([value]);
      const face = assignFace(new Array<boolean>(size).fill(false), () => rand.next());
      counts[face]++;
      expect(rand.used).toBe(1);
    }
    expect(counts).toEqual(expected);
  });

  it('takes the first free face when the drawn one is taken, and draws again only when every face is taken', () => {
    const pool = [true, false, true, false, false];
    expect(assignFace(pool, () => 7)).toBe(1);
    expect(pool).toEqual([true, true, true, false, false]);
    const full = [true, true, true];
    const rand = scriptedRand([4, 8]);
    expect(assignFace(full, () => rand.next())).toBe(2);
    expect(rand.used).toBe(2);
  });
});

describe('distances and alignment (RX5, RX8)', () => {
  it('holds 3500 strictly: the f32 12,250,000 itself is out', () => {
    expect(isWithinWingmanRange(12_250_000)).toBe(false);
    expect(isWithinWingmanRange(12_249_999.999)).toBe(true);
  });

  it('aligns the two third rows when their dot product is strictly above 0.707', () => {
    const rows = (x: number, y: number, z: number): Matrix3 => [1, 0, 0, 0, 1, 0, x, y, z];
    expect(isOnTail(rows(0, 0, 1), rows(0, 0, 1))).toBe(true);
    expect(isOnTail(rows(0, 0, 1), rows(0, 0, 0.707))).toBe(false);
    expect(isOnTail(rows(0, 0, 1), rows(0, 0, 0.7071))).toBe(true);
    expect(isOnTail(rows(1, 0, 0), rows(0, 1, 0))).toBe(false);
    // Summed y, z, then x: (0.5 × 0.5 + 0.5 × 0.5) + 0.5 × 0.42 = 0.71.
    expect(isOnTail(rows(0.5, 0.5, 0.5), rows(0.42, 0.5, 0.5))).toBe(true);
  });
});
