import { describe, expect, it } from 'vitest';
import { blankCraftCombat, type CraftCombat, type SubsystemState } from '../world/entity-table.ts';
import { absorbByShield, damageHull } from './damage.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations follow docs/original/formats/executable.md D3 (`0x30c60`) and step 1 of D4 (`0x2a830`), worked out by
// hand: signed i32 compare and subtraction, and the low byte of rand against 0x54.

const I32_MIN = -(2 ** 31);
const I32_MAX = 2 ** 31 - 1;

function combat(shield: number, hull = 100, shieldField: SubsystemState = 0): CraftCombat {
  const subsystems = Array.from({ length: 19 }, (): SubsystemState => 0);
  subsystems[4] = shieldField;
  return { ...blankCraftCombat(), shield, hull, subsystems: Object.freeze(subsystems) };
}

describe('the shield 0x30c60 (D3, AC-09)', () => {
  it('takes damage below the shield off the shield and leaves nothing, without a draw', () => {
    const target = combat(50);
    const rand = scriptedRand([]);
    expect(absorbByShield(target, 20, rand).hullDamage).toBe(0);
    expect(target.shield).toBe(30);
    expect(rand.used).toBe(0);
  });

  it('empties the shield for damage equal to it and leaves 0', () => {
    const target = combat(50);
    expect(absorbByShield(target, 50, scriptedRand([])).hullDamage).toBe(0);
    expect(target.shield).toBe(0);
  });

  it('empties the shield and leaves damage − the old shield for damage above it', () => {
    const target = combat(50);
    expect(absorbByShield(target, 80, scriptedRand([])).hullDamage).toBe(30);
    expect(target.shield).toBe(0);
  });

  it('leaves 0 for no damage, with or without a shield', () => {
    const full = combat(50);
    expect(absorbByShield(full, 0, scriptedRand([])).hullDamage).toBe(0);
    expect(full.shield).toBe(50);
    const empty = combat(0);
    // An empty shield still takes the hit (`0x30c60`'s second branch).
    expect(absorbByShield(empty, 0, scriptedRand([]))).toEqual({ hullDamage: 0, taken: true });
    expect(empty.shield).toBe(0);
  });

  it('compares and subtracts as signed i32: a negative shield adds to the damage left, which wraps', () => {
    const negative = combat(-5);
    expect(absorbByShield(negative, 3, scriptedRand([])).hullDamage).toBe(8);
    expect(negative.shield).toBe(0);
    const wrapping = combat(-1);
    expect(absorbByShield(wrapping, I32_MAX, scriptedRand([])).hullDamage).toBe(I32_MIN);
    const below = combat(I32_MAX);
    expect(absorbByShield(below, -1, scriptedRand([])).hullDamage).toBe(0);
    expect(below.shield).toBe(I32_MIN);
  });

  it('draws once with subsystem 4 at state 1: a low byte below 0x54 passes the whole damage and keeps the shield', () => {
    const passed = combat(50, 100, 1);
    const rand = scriptedRand([0x153]);
    // Only the absorbing branches set the player's energy-page redraw flag (+0x44, CK-02): the bypass is not taken.
    expect(absorbByShield(passed, 20, rand)).toEqual({ hullDamage: 20, taken: false });
    expect([passed.shield, rand.used]).toEqual([50, 1]);
    const taken = combat(50, 100, 1);
    expect(absorbByShield(taken, 20, scriptedRand([0x154]))).toEqual({ hullDamage: 0, taken: true });
    expect(taken.shield).toBe(30);
  });

  it('passes the shield for 84 × 128 = 10,752 of the 32,768 rand values, low bytes 0–0x53', () => {
    let passed = 0;
    for (let value = 0; value <= 32767; value++) {
      const target = combat(50, 100, 1);
      const { hullDamage: left, taken } = absorbByShield(target, 20, scriptedRand([value]));
      expect(taken).toBe(left !== 20);
      expect(left === 20).toBe((value & 0xff) < 0x54);
      if (left === 20) passed++;
    }
    expect(passed).toBe(10752);
  });

  it('does not draw at states 0, 2 and 3: state 2 still absorbs', () => {
    for (const field of [0, 2, 3] as const) {
      const target = combat(50, 100, field);
      const rand = scriptedRand([]);
      expect(absorbByShield(target, 20, rand).hullDamage).toBe(0);
      expect([target.shield, rand.used]).toEqual([30, 0]);
    }
  });
});

describe('the hull, step 1 of 0x2a830 (D4, AC-09)', () => {
  it('takes positive damage off the hull and returns it, also below 0', () => {
    const target = combat(0, 100);
    expect(damageHull(target, 30)).toBe(70);
    expect(damageHull(target, 90)).toBe(-20);
    expect(target.hull).toBe(-20);
  });

  it('leaves the hull for zero or negative damage', () => {
    const target = combat(0, 100);
    expect(damageHull(target, 0)).toBe(100);
    expect(damageHull(target, -40)).toBe(100);
    expect(target.hull).toBe(100);
  });

  it('subtracts as i32', () => {
    const target = combat(0, I32_MIN + 5);
    expect(damageHull(target, 10)).toBe(I32_MAX - 4);
  });
});
