/**
 * Flight state rules of P3-06 (docs/plan/p3/06/spec.md, 速度与油门 and 检查点 A 定稿的状态与契约;
 * docs/original/formats/executable.md, throttle, maximum speed and speed matching and numbers on the movement path,
 * P3-06/01 and 03; instantiation): the throttle table, the maximum speed and its consequence for the commanded speed,
 * the builds of a craft's movement block and the Warp timer at instantiation.
 *
 * The table and the scalar constants are code rules (spec 技术决定 11), implemented here rather than imported. f32
 * stores round to nearest (`Math.fround`) and the original's double-precision steps are JavaScript's; a product of
 * two f32 values is exact in double precision, so such a product rounds once.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import type { MovementBlock, SteeringAxis, SteeredMovementBlock } from '../world/entity-table.ts';
import type { RandSource } from './original-random.ts';
import { toInt32 } from './record-defaults.ts';
import { PLAYER_KIND_BIT, WINGMAN_KIND_BIT } from './spawn-schedule.ts';

/** Full throttle 0x80, which makes the commanded speed the maximum speed. */
export const FULL_THROTTLE = 0x80;

const THROTTLE_TABLE_MIDDLE = 64;
/** The step the start-up initialiser accumulates, f64 1/64. */
const THROTTLE_TABLE_STEP = 1 / 64;

/**
 * The throttle table `[0x1761dc]` the start-up initialiser `0x568b0` builds: 129 f32 entries, accumulated outward from
 * the middle in steps of 1/64 (every partial sum is exact) and odd about the middle, whose entry ends as +0.
 */
export const THROTTLE_TABLE: readonly number[] = (() => {
  const table = new Array<number>(2 * THROTTLE_TABLE_MIDDLE + 1);
  let sum = 0;
  for (let step = 0; step <= THROTTLE_TABLE_MIDDLE; step++) {
    table[THROTTLE_TABLE_MIDDLE - step] = -sum;
    table[THROTTLE_TABLE_MIDDLE + step] = sum;
    sum = Math.fround(sum + THROTTLE_TABLE_STEP);
  }
  return Object.freeze(table);
})();

/**
 * The table index of an integer throttle: the middle plus the throttle shifted right arithmetically, so an odd throttle
 * acts as the even value below it. An index outside the table is clamped into it, a project rule (checkpoint A): the
 * original reads outside the table there, undefined memory.
 */
export function throttleIndex(throttle: number): number {
  if (!Number.isSafeInteger(throttle)) throw new CoreFaultError('invariant-violated', 'flight-state.throttle');
  return Math.min(Math.max(THROTTLE_TABLE_MIDDLE + Math.floor(throttle / 2), 0), THROTTLE_TABLE.length - 1);
}

/** The commanded speed of a throttle (`0x21dd0`, `0x21794`): f32(table entry × maximum speed). */
export function throttleSpeed(throttle: number, maximumSpeed: number): number {
  return Math.fround(THROTTLE_TABLE[throttleIndex(throttle)] * maximumSpeed);
}

/** The code constant of the energy arithmetic of `0x3060c` and `0x30e0c`. */
export const ENERGY_SCALE = 1000;

/** The levels each of the player's two energy allocations can take (Likely the shield and gun recharge levels, P3-07). */
export type AllocationLevel = 0 | 1 | 2 | 3;
export const ALLOCATION_LEVELS: readonly AllocationLevel[] = Object.freeze([0, 1, 2, 3]);

/** The allocation levels `0x3060c` gives a new player object, fixed by code (+0x34 and +0x38). */
export const INITIAL_ALLOCATION = Object.freeze({ shield: 1, gun: 2 } as const satisfies { shield: AllocationLevel; gun: AllocationLevel });

/** A two-bit subsystem field; the allocator clears them all, so a new object's are 0. */
export type SubsystemField = 0 | 1 | 2 | 3;

/** The operands `0x3060c` computes for the player's maximum speed: the energy E (+0x3C) and the threshold T (+0x40). */
export interface EnergyOperands {
  readonly energy: number;
  readonly threshold: number;
}

/**
 * `0x3060c` for the player at a pair of allocation levels: E = +0x58 − (+0x64[shield] + +0x78[gun]) and
 * T = trunc(trunc(+0xB8) × +0x88 ÷ 1000), i32 arithmetic that world creation proved free of overflow (D-01).
 */
export function playerEnergyOperands(record: CraftRecord, shield: AllocationLevel, gun: AllocationLevel): EnergyOperands {
  return {
    energy: record.at58 - (record.at64[shield] + record.at78[gun]),
    // `+ 0` turns the −0 of a small negative quotient into the integer 0.
    threshold: Math.trunc((Math.trunc(record.atB8) * record.at88) / ENERGY_SCALE) + 0,
  };
}

/** The factors of two-bit subsystem field 2 (f64 constants `0x171018` and `0x171010`); 0 and 3 leave the maximum. */
const SPEED_SUBSYSTEM_FACTORS: Readonly<Record<SubsystemField, number>> = Object.freeze({ 0: 1, 1: 0.5, 2: 0.25, 3: 1 });

/**
 * The player's maximum speed (`0x30e0c`, kind 1): f32(trunc(E × 1000 ÷ +0x88)) while E < T (i32 multiply, signed
 * division), the craft record's base +0xB8 otherwise; then f32(maximum × factor) of subsystem field 2. Every other kind
 * takes the base +0xB8 itself.
 */
export function playerMaximumSpeed(record: CraftRecord, { energy, threshold }: EnergyOperands, speedSubsystem: SubsystemField): number {
  const maximum = energy < threshold ? Math.fround(Math.trunc((energy * ENERGY_SCALE) / record.at88) + 0) : record.atB8;
  const factor = SPEED_SUBSYSTEM_FACTORS[speedSubsystem];
  return factor === 1 ? maximum : Math.fround(maximum * factor);
}

/**
 * The maximum speed instantiation writes where `0x3060c` runs: for the player, at the code's initial allocation levels
 * with field 2 clear. It draws nothing. P3-07 recomputes it from live state; until then the value is initial only.
 */
export function initialMaximumSpeed(kindBit: number, record: CraftRecord): number {
  if (kindBit !== PLAYER_KIND_BIT) return record.atB8;
  return playerMaximumSpeed(record, playerEnergyOperands(record, INITIAL_ALLOCATION.shield, INITIAL_ALLOCATION.gun), 0);
}

/**
 * After a recompute of the maximum speed (`0x21d88`): only when the double quotient speed ÷ new maximum exceeds 1 is the
 * commanded speed set to the new maximum and the arrival flag cleared; the current speed is never clamped. A zero
 * maximum is a fault, as the original's unmasked divide exception is.
 */
export function applyRecomputedMaximum(block: SteeredMovementBlock | null, maximumSpeed: number): void {
  if (block === null) return;
  if (maximumSpeed === 0) throw new CoreFaultError('invariant-violated', 'flight-state.maximum-speed');
  if (block.speed / maximumSpeed > 1) {
    block.commandedSpeed = maximumSpeed;
    block.atCommandedSpeed = false;
  }
}

const stillAxis = (): SteeringAxis => ({ rate: 0, enabled: false });

/** The speed ratio a build or the integrator stores: f32(speed ÷ base) when the base +0xB8 is positive, otherwise 0. */
export function speedRatio(speed: number, baseMaximumSpeed: number): number {
  return baseMaximumSpeed > 0 ? Math.fround(speed / baseMaximumSpeed) : 0;
}

/**
 * A mode-0 block built at an integer `throttle` (`0x21794`): speed = commanded speed = the throttle's speed, arrived,
 * its speed ratio, and no steering, timed rotation, impulse, lock or disturbance. `baseMaximumSpeed` is the record's
 * +0xB8 (a craft record, or a missile's body record for P3-07).
 */
export function craftMovementBlock(throttle: number, maximumSpeed: number, baseMaximumSpeed: number): SteeredMovementBlock {
  const speed = throttleSpeed(throttle, maximumSpeed);
  return {
    mode: 'craft',
    speed,
    commandedSpeed: speed,
    atCommandedSpeed: true,
    speedRatio: speedRatio(speed, baseMaximumSpeed),
    steering: Object.freeze({ pitch: stillAxis(), yaw: stillAxis(), roll: stillAxis() }),
    timedRotation: { pitch: null, yaw: null, roll: null },
    impulse: null,
    locked: false,
    disturbance: null,
  };
}

/**
 * The movement block of an entity instantiated active or resuming from parking (`0x2c3b0`): full throttle, so the
 * speed and the commanded speed are exactly the maximum speed. `baseMaximumSpeed` is the craft record's +0xB8.
 */
export function initialMovementBlock(maximumSpeed: number, baseMaximumSpeed: number): SteeredMovementBlock {
  return craftMovementBlock(FULL_THROTTLE, maximumSpeed, baseMaximumSpeed);
}

/** The f64 factor `0x17004c` that turns a speed ratio into a throttle. */
const THROTTLE_PER_RATIO = 128;

/**
 * A craft block rebuilt from an old one (`0x218e8`, then `0x21794`), for P3-11's rescue: the throttle is
 * trunc(f32 old speed ratio × 128), the ratio taken afresh from the old block's speed and the base. Kind 0x4000's
 * constructor replaces this throttle with its own (X2 step 8, systems/xpon.ts). Without an old block the original's
 * cleared parameter record gives throttle 0. A throttle beyond i32 is a fault, as the original's conversion raises its
 * unmasked invalid-operation exception there.
 */
export function rebuiltMovementBlock(oldBlock: Pick<MovementBlock, 'speed'> | null, maximumSpeed: number, baseMaximumSpeed: number): SteeredMovementBlock {
  const throttle = oldBlock === null ? 0 : Math.trunc(speedRatio(oldBlock.speed, baseMaximumSpeed) * THROTTLE_PER_RATIO);
  if (toInt32(throttle) !== throttle) throw new CoreFaultError('invariant-violated', 'flight-state.rebuild-throttle');
  return craftMovementBlock(throttle, maximumSpeed, baseMaximumSpeed);
}

/** The original Warp timer range: rand % 0x2D00 clock units, under 180 seconds. */
const WARP_DELAY_RANGE = 0x2d00;

/**
 * The Warp timer +0xC8 at instantiation (step 12): the clock plus a random delay (one draw) for every kind but the
 * player and the wingman, which keep 0, the unset value. The clock is positive whenever request handling runs, so the
 * drawn time is never 0; a time past the safe integers is a budget fault.
 */
export function initialWarpClock(kindBit: number, clock: number, rand: RandSource): number {
  if (kindBit === PLAYER_KIND_BIT || kindBit === WINGMAN_KIND_BIT) return 0;
  const warpClock = clock + (rand.next() % WARP_DELAY_RANGE);
  if (!Number.isSafeInteger(warpClock)) throw new CoreFaultError('budget-exhausted', 'flight-state.warp-clock');
  return warpClock;
}
