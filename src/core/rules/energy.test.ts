import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { craft } from '../../content/rule-data/rule-data.test-support.ts';
import { blankCraftCombat, SUBSYSTEM_COUNT, type CraftCombat, type Level, type SubsystemState } from '../world/entity-table.ts';
import { expectFault } from '../world/world.test-support.ts';
import { applyEnergyUpdate, changeAllocation, lockMovement, quotient, speedCost } from './energy.ts';
import { craftMovementBlock } from './flight-state.ts';

// Expectations worked out by hand from D10, D14 and D17 (docs/original/formats/executable.md), not from the helpers.

/** A craft record: shield 300 recharged at c64 per 64 units with c60 = 7, charge 40, speed cost c88 = 500. */
const record = (overrides: Record<string, unknown> = {}): CraftRecord => craft({
  at54: 1000, at58: 340, at5C: 300, at60: 7, at64: [0, 64, 128, 640], at74: 40, at78: [0, 32, 64, 128], at88: 500, at8C: 0, at90: 0,
  at9C: 1000, atB8: 100.75, ...overrides,
}) as unknown as CraftRecord;

const fields = (entries: Record<number, SubsystemState> = {}): readonly SubsystemState[] =>
  Array.from({ length: SUBSYSTEM_COUNT }, (_, index): SubsystemState => entries[index] ?? 0);

function combat(overrides: Partial<CraftCombat> = {}): CraftCombat {
  return { ...blankCraftCombat(), energy: 1000, shield: 300, charge: 40, shieldLevel: 1, chargeLevel: 2, ...overrides };
}

const resources = ({ energy, shield, charge }: CraftCombat) => ({ energy, shield, charge });

describe('the shield recharge (D14 step 2)', () => {
  it.each([
    // r = trunc(64 × 64 ÷ 64) = 64, need = min(7 × 200, 64,000) = 1,400, gain 200, cost 1,400 ÷ 1,000 = 1.
    ['refills a deficit the rate covers', { shield: 100 }, 64, { energy: 999, shield: 300, charge: 40 }],
    // r = trunc(64 × 2 ÷ 64) = 2, need = min(7 × 300, 2,000) = 2,000, gain trunc(2,000 ÷ 7) = 285, cost 2.
    ['is limited by the rate over dt', { shield: 0 }, 2, { energy: 998, shield: 285, charge: 40 }],
    // r = min(2, 1) = 1, need = min(2,100, 1,000) = 1,000, gain 142, cost 1: the energy runs out.
    ['is limited by the energy', { shield: 0, energy: 1 }, 2, { energy: 0, shield: 142, charge: 40 }],
    // Level 0's rate c64[0] is 0: r = 0, need = 0, no gain and nothing spent.
    ['gains nothing at a zero rate', { shield: 0, shieldLevel: 0 as Level }, 64, { energy: 1000, shield: 0, charge: 40 }],
    ['gains nothing over dt 0', { shield: 0 }, 0, { energy: 1000, shield: 0, charge: 40 }],
    ['stops at c5C', { shield: 300 }, 64, { energy: 1000, shield: 300, charge: 40 }],
    ['still runs at field 4 = 1', { shield: 100, subsystems: fields({ 4: 1 }) }, 64, { energy: 999, shield: 300, charge: 40 }],
    ['does not run at field 4 = 2', { shield: 100, subsystems: fields({ 4: 2 }) }, 64, { energy: 1000, shield: 100, charge: 40 }],
  ] as const)('%s', (_, overrides, dt, expected) => {
    const state = combat(overrides);
    applyEnergyUpdate(state, record(), dt, null);
    expect(resources(state)).toEqual(expected);
  });

  it('keeps the sign rules of i32 division with a negative c60: gain = need ÷ c60 can be positive and refund energy', () => {
    // need = min(−400 × 300, 2,000) = −120,000, gain = −120,000 ÷ −400 = 300, cost −120,000 ÷ 1,000 = −120.
    const state = combat({ shield: 0 });
    applyEnergyUpdate(state, record({ at60: -400 }), 2, null);
    expect(resources(state)).toEqual({ energy: 1120, shield: 300, charge: 40 });
  });

  it('faults on a zero c60 instead of producing NaN, as the original\'s divide exception', () => {
    expectFault(() => applyEnergyUpdate(combat({ shield: -20 }), record({ at5C: -10, at60: 0 }), 64, null), 'invariant-violated', 'energy.shield-divisor');
  });
});

describe('the player\'s charge recharge and speed cost (D14 steps 3 and 4)', () => {
  it('recharges the charge at c78[L2] per 64 units, a point costing 1/1,000 energy, only for the player', () => {
    // r = trunc(64 × 64 ÷ 64) = 64, d = min(100,000, 64,000) = 64,000, cost 64.
    const player = combat({ charge: 0 });
    applyEnergyUpdate(player, record({ at74: 100_000 }), 64, { commandedSpeed: 0 });
    expect(resources(player)).toEqual({ energy: 936, shield: 300, charge: 64_000 });
    // d = min(40 − 30, 64,000) = 10, cost trunc(10 ÷ 1,000) = 0.
    const topped = combat({ charge: 30 });
    applyEnergyUpdate(topped, record(), 64, { commandedSpeed: 0 });
    expect(resources(topped)).toEqual({ energy: 1000, shield: 300, charge: 40 });
    const other = combat({ charge: 0 });
    applyEnergyUpdate(other, record({ at74: 100_000 }), 64, null);
    expect(resources(other)).toEqual({ energy: 1000, shield: 300, charge: 0 });
  });

  it('has no positivity test: a negative energy takes charge back', () => {
    // r = min(64, −3) = −3, d = min(40, −3,000) = −3,000, energy −3 − (−3) = 0, which depletes.
    const state = combat({ charge: 0, energy: -3 });
    expect(applyEnergyUpdate(state, record(), 64, { commandedSpeed: 0 })).toBe(true);
    expect(resources(state)).toEqual({ energy: 0, shield: 300, charge: -3000 });
  });

  it.each([
    // chop(100.9) = 100, 100 × 500 ÷ 1,000 = 50 per 64 units.
    ['the commanded speed', {}, 100.9, 64, 50],
    ['over a short interval, truncated', {}, 100.9, 2, 1],
    ['c B8 without a movement block', {}, null, 64, 50],
    ['a negative commanded speed, chopped toward zero', {}, -10.9, 64, -5],
    ['doubled at c8C', { at8C: 100 }, 100.9, 64, 100],
    ['not doubled just below c8C', { at8C: 101 }, 100.9, 64, 50],
    ['tripled at c90 when c8C is 0', { at90: 100 }, 100.9, 64, 150],
    ['not tripled just below c90', { at90: 101 }, 100.9, 64, 50],
    ['doubled rather than tripled when both apply', { at8C: 100, at90: 50 }, 100.9, 64, 100],
  ] as const)('costs the speed of %s', (_, overrides, commandedSpeed, dt, cost) => {
    expect(speedCost(record(overrides), commandedSpeed, dt)).toBe(cost);
  });

  it('subtracts the speed cost from the player\'s energy only', () => {
    const player = combat();
    applyEnergyUpdate(player, record(), 64, { commandedSpeed: 100.9 });
    expect(player.energy).toBe(950);
    const other = combat();
    applyEnergyUpdate(other, record(), 64, null);
    expect(other.energy).toBe(1000);
  });

  it('faults on a commanded speed beyond i32, as the original\'s conversion', () => {
    expectFault(() => speedCost(record(), 2 ** 31, 64), 'invariant-violated', 'energy.speed');
  });
});

describe('field 0, depletion and the movement lock (D14 steps 5 and 6)', () => {
  it.each([
    [0, 64, 1000],
    [1, 64, 990],
    [1, 32, 995],
    [1, 2, 1000],
    [2, 64, 900],
    [3, 2, 997],
  ] as const)('drains at field 0 state %i over dt %i to %i', (state, dt, energy) => {
    const subject = combat({ subsystems: fields({ 0: state }) });
    applyEnergyUpdate(subject, record(), dt, null);
    expect(subject.energy).toBe(energy);
  });

  it('depletes at energy 0 or below, clamping it to 0, and not above', () => {
    const empty = combat({ energy: 0 });
    expect(applyEnergyUpdate(empty, record(), 64, null)).toBe(true);
    expect(empty.energy).toBe(0);
    // 3 − 50 = −47.
    const spent = combat({ energy: 3 });
    expect(applyEnergyUpdate(spent, record(), 64, { commandedSpeed: 100.9 })).toBe(true);
    expect(spent.energy).toBe(0);
    const left = combat({ energy: 51 });
    expect(applyEnergyUpdate(left, record(), 64, { commandedSpeed: 100.9 })).toBe(false);
    expect(left.energy).toBe(1);
  });

  it('keeps every value an integer with zero energy and zero capacities', () => {
    const state = combat({ energy: 0, shield: 0, charge: 0 });
    expect(applyEnergyUpdate(state, record({ at5C: 0, at60: 0, at74: 0, at88: 0 }), 64, { commandedSpeed: 0 })).toBe(true);
    expect(resources(state)).toEqual({ energy: 0, shield: 0, charge: 0 });
  });

  it('wraps i32 products as IMUL does', () => {
    // 0x40000000 × 4 wraps to 0, so the recharge rate is 0.
    const state = combat({ shield: 0 });
    applyEnergyUpdate(state, record({ at64: [0, 0x40000000, 0, 0] }), 4, null);
    expect(resources(state)).toEqual({ energy: 1000, shield: 0, charge: 40 });
  });

  it('locks a craft block (mode 0) at commanded speed 0 and leaves a Warp block alone (0x21ba0)', () => {
    const block = { ...craftMovementBlock(0x80, 48, 96), speed: 30 };
    lockMovement(block);
    expect(block).toMatchObject({ locked: true, commandedSpeed: 0, atCommandedSpeed: false, speed: 30 });
    const warp = { ...craftMovementBlock(0x80, 48, 96), mode: 'warp' as const };
    lockMovement(warp);
    expect(warp).toMatchObject({ locked: false, commandedSpeed: 48, atCommandedSpeed: true });
  });

  it('divides as signed IDIV, faulting on a zero divisor and on the one overflowing quotient', () => {
    expect([quotient(7, 2, 'test'), quotient(-7, 2, 'test'), quotient(7, -2, 'test'), quotient(-1, 3, 'test')]).toEqual([3, -3, -3, 0]);
    expect(Object.is(quotient(-1, 3, 'test'), 0)).toBe(true);
    expectFault(() => quotient(5, 0, 'test.zero'), 'invariant-violated', 'test.zero');
    expectFault(() => quotient(-(2 ** 31), -1, 'test.overflow'), 'invariant-violated', 'test.overflow');
  });
});

describe('the allocation levels (D10: 0x30b20, 0x30bc0)', () => {
  // E = c58 − (c78[L2] + c64[L1]) with c64 = c78 = [0, 100, 200, 300].
  const levels = (at58: number, at64: readonly number[] = [0, 100, 200, 300]) => record({ at58, at64, at78: [0, 100, 200, 300] });
  const allocation = ({ shieldLevel, chargeLevel, sparePower }: CraftCombat) => ({ shieldLevel, chargeLevel, sparePower });

  it.each([
    ['shield', 1, 1000, [1, 2], { shieldLevel: 2, chargeLevel: 2, sparePower: 600 }],
    ['shield', -1, 1000, [1, 2], { shieldLevel: 0, chargeLevel: 2, sparePower: 800 }],
    ['charge', 1, 1000, [1, 2], { shieldLevel: 1, chargeLevel: 3, sparePower: 600 }],
    ['charge', -1, 1000, [1, 2], { shieldLevel: 1, chargeLevel: 1, sparePower: 800 }],
    // (2, 2): 340 − 400 < 0, so L2 drops to 1: 340 − 300 = 40.
    ['shield', 1, 340, [1, 2], { shieldLevel: 2, chargeLevel: 1, sparePower: 40 }],
    // (1, 3): 340 − 400 < 0, so L1 drops to 0: 340 − 300 = 40.
    ['charge', 1, 340, [1, 2], { shieldLevel: 0, chargeLevel: 3, sparePower: 40 }],
    // (2, 2), (2, 1), (2, 0) all below 0 at c58 = 150: L1 is restored to 1 and L2 set to 0, not back to 2: E = 50.
    ['shield', 1, 150, [1, 2], { shieldLevel: 1, chargeLevel: 0, sparePower: 50 }],
  ] as const)('changes %s by %i at c58 %i from levels %j', (which, delta, at58, [shieldLevel, chargeLevel], expected) => {
    const state = combat({ shieldLevel, chargeLevel, sparePower: 12345 });
    expect(changeAllocation(state, levels(at58), which, delta)).toBe(true);
    expect(allocation(state)).toEqual(expected);
  });

  it('can leave E negative after the failure branch', () => {
    // c64 = 30 at every level: (0, 1) is 25 − 31 < 0 and L1 cannot drop, so L2 is restored to 0 and E = 25 − 30 = −5.
    const state = combat({ shieldLevel: 0, chargeLevel: 0, sparePower: -5 });
    expect(changeAllocation(state, record({ at58: 25, at64: [30, 30, 30, 30], at78: [0, 1, 2, 3] }), 'charge', 1)).toBe(true);
    expect(allocation(state)).toEqual({ shieldLevel: 0, chargeLevel: 0, sparePower: -5 });
  });

  it.each([
    ['shield', 1, 3, 0],
    ['shield', -1, 0, 2],
    ['charge', 1, 1, 3],
    ['charge', -1, 2, 0],
  ] as const)('changes nothing when %s %i would leave 0–3', (which, delta, shieldLevel, chargeLevel) => {
    const state = combat({ shieldLevel, chargeLevel, sparePower: 7 });
    expect(changeAllocation(state, levels(1000), which, delta)).toBe(false);
    expect(allocation(state)).toEqual({ shieldLevel, chargeLevel, sparePower: 7 });
  });
});
