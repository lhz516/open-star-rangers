import { describe, expect, it } from 'vitest';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { craft } from '../../content/rule-data/rule-data.test-support.ts';
import { CoreFaultError } from '../errors.ts';
import type { MovementBlock } from '../world/entity-table.ts';
import { expectFault } from '../world/world.test-support.ts';
import { float32OfDouble, float32OfRational } from './derivation.test-support.ts';
import {
  applyRecomputedMaximum, craftMovementBlock, FULL_THROTTLE, INITIAL_ALLOCATION, initialMaximumSpeed, initialMovementBlock, initialWarpClock,
  playerEnergyOperands, playerMaximumSpeed, rebuiltMovementBlock, speedRatio, THROTTLE_TABLE, throttleIndex, throttleSpeed,
} from './flight-state.ts';
import { scriptedRand } from './rand.test-support.ts';

// Expectations follow docs/original/formats/executable.md (throttle, maximum speed and speed matching; numbers on the
// movement path, P3-06/01 and 03) and the checkpoint-A contract (docs/plan/p3/06/spec.md), derived independently: table
// entries as (i − 64) ÷ 64, f32 roundings through exact rationals.

const record = (overrides: Record<string, unknown> = {}): CraftRecord => craft(overrides) as unknown as CraftRecord;

/** A player record whose initial levels (1, 2) leave E = 50 − (10 + 5) = 35 below T = trunc(100 × 500 ÷ 1000) = 50. */
const energyLimited = (overrides: Record<string, unknown> = {}): CraftRecord =>
  record({ at58: 50, at64: [99, 10, 99, 99], at78: [99, 99, 5, 99], atB8: 100, at88: 500, ...overrides });

const still = { rate: 0, enabled: false };
const quietBlock = { steering: { pitch: still, yaw: still, roll: still }, timedRotation: { pitch: null, yaw: null, roll: null }, impulse: null, locked: false, disturbance: null };

describe('throttle table (P3-06 S-05, M-04; executable.md numbers on the movement path)', () => {
  it('holds the 129 entries (i − 64) ÷ 64, the middle one +0, frozen', () => {
    expect(THROTTLE_TABLE).toHaveLength(129);
    THROTTLE_TABLE.forEach((entry, index) => expect(entry).toBe((index - 64) / 64));
    expect(Object.is(THROTTLE_TABLE[64], 0)).toBe(true);
    expect(Object.isFrozen(THROTTLE_TABLE)).toBe(true);
  });

  it.each([
    [0, 64], [1, 64], [2, 65], [14, 71], [127, 127], [FULL_THROTTLE, 128], [129, 128], [130, 128], [10_000, 128],
    [-1, 63], [-2, 63], [-128, 0], [-129, 0], [-10_000, 0],
  ])('indexes throttle %i at %i: an arithmetic shift, clamped into the table (checkpoint A)', (throttle, index) => {
    expect(throttleIndex(throttle)).toBe(index);
  });

  it.each([0.5, Number.NaN, 2 ** 53])('faults on throttle %d, which no rule produces', (throttle) => {
    expectFault(() => throttleIndex(throttle), 'invariant-violated', 'flight-state.throttle');
  });

  it('gives f32(entry × maximum): the maximum itself at full throttle, one rounding otherwise', () => {
    const maximum = Math.fround(0.1); // 13421773 × 2^−27
    expect(Object.is(throttleSpeed(FULL_THROTTLE, maximum), maximum)).toBe(true);
    // Shift+2's 14: entry 7/64, so 93952411 × 2^−33 rounded once.
    expect(throttleSpeed(14, maximum)).toBe(float32OfRational(93952411n, 2n ** 33n, 'nearest'));
    expect(throttleSpeed(0, 100)).toBe(0);
  });
});

describe('maximum speed 0x30e0c and its operands (P3-06 S-05, AC-04)', () => {
  it('computes E and T of 0x3060c at a pair of allocation levels', () => {
    // E = 200 − (+0x64[1] 2 + +0x78[2] 8); T = trunc(trunc(100.75) × 333 ÷ 1000) = trunc(33.3).
    expect(playerEnergyOperands(record({ atB8: 100.75, at88: 333 }), 1, 2)).toEqual({ energy: 190, threshold: 33 });
    expect(playerEnergyOperands(record(), 3, 0)).toEqual({ energy: 200 - (4 + 6), threshold: 0 });
    // A negative product truncates toward zero, to 0 and not −0.
    expect(Object.is(playerEnergyOperands(record({ atB8: 100, at88: -7 }), 0, 0).threshold, 0)).toBe(true);
  });

  it('takes the base +0xB8 unless E < T, then f32(trunc(E × 1000 ÷ +0x88)), with field 2\'s factor after either', () => {
    const limited = energyLimited();
    expect(playerMaximumSpeed(limited, { energy: 35, threshold: 50 }, 0)).toBe(70);
    expect(playerMaximumSpeed(limited, { energy: 50, threshold: 50 }, 0)).toBe(100);
    expect(playerMaximumSpeed(limited, { energy: 51, threshold: 50 }, 0)).toBe(100);
    // Signed division truncating toward zero: −35 000 ÷ 500, 1000 ÷ −3 and −1000 ÷ 2000 (+0, not −0).
    expect(playerMaximumSpeed(limited, { energy: -35, threshold: 50 }, 0)).toBe(-70);
    expect(playerMaximumSpeed(energyLimited({ at88: -3 }), { energy: 1, threshold: 50 }, 0)).toBe(-333);
    expect(Object.is(playerMaximumSpeed(energyLimited({ at88: 2000 }), { energy: -1, threshold: 50 }, 0), 0)).toBe(true);
    // The integer 2,000,001,000 ÷ 2 = 1,000,000,500 needs a rounding to f32: spacing 64, nearest 1,000,000,512.
    expect(playerMaximumSpeed(energyLimited({ at88: 2 }), { energy: 2_000_001, threshold: 2_000_002 }, 0)).toBe(1_000_000_512);
    expect(playerMaximumSpeed(limited, { energy: 35, threshold: 50 }, 1)).toBe(35);
    expect(playerMaximumSpeed(limited, { energy: 35, threshold: 50 }, 2)).toBe(17.5);
    expect(playerMaximumSpeed(limited, { energy: 35, threshold: 50 }, 3)).toBe(70);
    expect(playerMaximumSpeed(limited, { energy: 50, threshold: 50 }, 2)).toBe(25);
    // The factors' products are rounded: 3 × 2^−149 halves to a tie, which goes to the even 2 × 2^−149.
    expect(playerMaximumSpeed(record({ atB8: 3 * 2 ** -149 }), { energy: 0, threshold: 0 }, 1)).toBe(2 * 2 ** -149);
  });

  it('gives every other kind the base, whatever its energy fields', () => {
    expect(initialMaximumSpeed(1, energyLimited({ atB8: 100.5 }))).toBe(100.5);
    expect(initialMaximumSpeed(7, energyLimited({ atB8: 100.5 }))).toBe(100.5);
  });

  it('writes the player\'s at instantiation at the initial levels 1 and 2 with field 2 clear', () => {
    expect(INITIAL_ALLOCATION).toEqual({ shield: 1, gun: 2 });
    expect(initialMaximumSpeed(0, energyLimited())).toBe(70);
    // Only levels 1 and 2 count: with +0x58 = 65, E = 65 − 15 = T (the base), though levels 0 and 0 would give 65 − 198.
    expect(initialMaximumSpeed(0, energyLimited({ at58: 65 }))).toBe(100);
    // With +0x64[1] = 40, E = 50 − 45 = 5: trunc(5000 ÷ 500) = 10.
    expect(initialMaximumSpeed(0, energyLimited({ at64: [0, 40, 0, 0] }))).toBe(10);
  });
});

describe('after a recompute of the maximum, 0x21d88 (P3-06 S-05, AC-04)', () => {
  const block = (speed: number, commandedSpeed: number): MovementBlock => ({ ...initialMovementBlock(100, 100), speed, commandedSpeed });

  it('lowers the commanded speed only when speed ÷ new maximum exceeds 1, never the speed', () => {
    const above = block(100, 100);
    applyRecomputedMaximum(above, 80);
    expect(above).toMatchObject({ speed: 100, commandedSpeed: 80, atCommandedSpeed: false });
    for (const [speed, maximum] of [[100, 100], [100, 120], [79, 80], [-5, 80], [10, -80]]) {
      const unchanged = block(speed, 150);
      applyRecomputedMaximum(unchanged, maximum);
      expect(unchanged).toMatchObject({ speed, commandedSpeed: 150, atCommandedSpeed: true });
    }
  });

  it('does nothing without a block and faults on a zero maximum', () => {
    expect(() => applyRecomputedMaximum(null, 0)).not.toThrow();
    const error = expectFault(() => applyRecomputedMaximum(block(0, 0), 0), 'invariant-violated', 'flight-state.maximum-speed');
    expect(error).toBeInstanceOf(CoreFaultError);
  });
});

describe('movement block builds, 0x2c3b0 and 0x218e8 (P3-06 S-05, S-07, AC-04, AC-07)', () => {
  it('stores f32(speed ÷ base) as the ratio while the base is positive, otherwise 0', () => {
    expect(speedRatio(48, 64)).toBe(0.75);
    expect(speedRatio(1, 3)).toBe(float32OfDouble(1 / 3, 'nearest'));
    expect(speedRatio(64, 0)).toBe(0);
    expect(speedRatio(64, -64)).toBe(0);
  });

  it('builds the initial block at full throttle: speed = commanded speed = the maximum exactly, arrived, otherwise quiet', () => {
    const maximum = Math.fround(0.1);
    expect(initialMovementBlock(maximum, 0.25)).toEqual({
      mode: 'craft', speed: maximum, commandedSpeed: maximum, atCommandedSpeed: true, speedRatio: float32OfDouble(maximum / 0.25, 'nearest'), ...quietBlock,
    });
    expect(initialMovementBlock(70, 100).speedRatio).toBe(float32OfDouble(0.7, 'nearest'));
    expect(initialMovementBlock(64, 64).speedRatio).toBe(1);
    expect(initialMovementBlock(64, 0).speedRatio).toBe(0);
    // Each build is its own data.
    expect(initialMovementBlock(64, 64).steering.pitch).not.toBe(initialMovementBlock(64, 64).steering.pitch);
  });

  it('builds a mode-0 block at any integer throttle, its speed from the table', () => {
    expect(craftMovementBlock(14, 64, 128)).toEqual({ mode: 'craft', speed: 7, commandedSpeed: 7, atCommandedSpeed: true, speedRatio: 7 / 128, ...quietBlock });
    expect(craftMovementBlock(0, 64, 64)).toMatchObject({ speed: 0, commandedSpeed: 0, speedRatio: 0 });
    expect(craftMovementBlock(FULL_THROTTLE, 64, 64)).toEqual(initialMovementBlock(64, 64));
  });

  it('rebuilds from the old block at throttle trunc(f32(speed ÷ base) × 128), quiet again', () => {
    const old = (speed: number): MovementBlock => ({
      ...initialMovementBlock(64, 64), speed, locked: true, impulse: { direction: { x: 1, y: 0, z: 0 }, magnitude: 3 },
      steering: { pitch: { rate: 1, enabled: true }, yaw: still, roll: still }, disturbance: { level: 1 },
    });
    // Ratio 0.75 → throttle 96 → entry 48/64.
    expect(rebuiltMovementBlock(old(48), 40, 64)).toEqual({ mode: 'craft', speed: 30, commandedSpeed: 30, atCommandedSpeed: true, speedRatio: speedRatio(30, 64), ...quietBlock });
    // 47.5 ÷ 64 × 128 = 95, odd, which acts as 94: entry 47/64.
    expect(rebuiltMovementBlock(old(47.5), 64, 64).speed).toBe(47);
    // Above the base the throttle leaves the table and is clamped to its last entry (checkpoint A).
    expect(rebuiltMovementBlock(old(200), 40, 64).speed).toBe(40);
    // A negative speed gives a negative throttle: −10 ÷ 64 × 128 = −20 → entry −10/64.
    expect(rebuiltMovementBlock(old(-10), 64, 64).speed).toBe(-10);
    // No old block, or a base that is not positive: throttle 0, speed +0.
    for (const block of [rebuiltMovementBlock(null, 40, 64), rebuiltMovementBlock(old(48), 40, 0)]) {
      expect(Object.is(block.speed, 0)).toBe(true);
      expect(block).toMatchObject({ commandedSpeed: 0, atCommandedSpeed: true });
    }
  });

  it('faults where the throttle leaves i32, as the original\'s conversion does', () => {
    expectFault(() => rebuiltMovementBlock({ ...initialMovementBlock(64, 64), speed: 2 ** 30 }, 64, 1), 'invariant-violated', 'flight-state.rebuild-throttle');
    expectFault(() => rebuiltMovementBlock({ ...initialMovementBlock(64, 64), speed: 3e38 }, 64, 1e-38), 'invariant-violated', 'flight-state.rebuild-throttle');
  });
});

describe('Warp timer at instantiation, step 12 (P3-06 AC-06)', () => {
  it('keeps 0 for the player and the wingman without a draw', () => {
    for (const kindBit of [0, 1]) expect(initialWarpClock(kindBit, 66, scriptedRand([]))).toBe(0);
  });

  it.each([[0, 66], [11_519, 66 + 11_519], [11_520, 66], [32_767, 66 + (32_767 - 2 * 11_520)]])('adds rand %i mod 0x2D00 to the clock for other kinds', (draw, clock) => {
    const rand = scriptedRand([draw]);
    expect(initialWarpClock(7, 66, rand)).toBe(clock);
    expect(rand.used).toBe(1);
  });

  it('faults past the safe integers', () => {
    expectFault(() => initialWarpClock(2, Number.MAX_SAFE_INTEGER, scriptedRand([1])), 'budget-exhausted', 'flight-state.warp-clock');
    expect(initialWarpClock(2, Number.MAX_SAFE_INTEGER, scriptedRand([0]))).toBe(Number.MAX_SAFE_INTEGER);
  });
});
