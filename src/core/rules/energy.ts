/**
 * Energy rules of craft (docs/plan/p3/02/spec.md, CR-02, CR-05 and CR-09; docs/original/formats/executable.md, D10, D14
 * and D17): the arithmetic of one energy update (`0x3071c` for the player, `0x30994` for every other craft), the
 * movement lock of a depleted update (`0x21ba0`) and the allocation level change of the level keys (`0x30b20`,
 * `0x30bc0`). The stage that schedules the updates and the commands are systems/energy.ts's.
 *
 * Integer arithmetic is the original's i32 (D17): `ADD`/`SUB`/`IMUL` wrap, signed `IDIV` truncates toward zero and
 * faults on a zero divisor or an overflowing quotient, as the original's divide exception does; ÷ 64 truncates toward
 * zero. Rates are energy per 64 clock units (a nominal second); a charge or shield point costs 1/1000 or c60/1000
 * energy. Remainders are dropped: the next update starts afresh.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import type { CraftCombat, Level, SteeredMovementBlock } from '../world/entity-table.ts';
import { ENERGY_SCALE } from './flight-state.ts';
import { toInt32 } from './record-defaults.ts';

/** Clock units between two of the player's energy updates. */
export const PLAYER_ENERGY_INTERVAL = 0x40;
/** Clock units between two updates of another craft that the stage passes its movement block (active ones). */
export const BLOCK_ENERGY_INTERVAL = 0x80;
/** Clock units between two updates of another craft without one (parked ones). */
export const BLOCKLESS_ENERGY_INTERVAL = 0x100;

/** The clock units a rate is per. */
const RATE_PERIOD = 64;
/** Two-bit field 0 (Likely the generator): drains energy at states 1–3 (D14 step 5). */
const GENERATOR_FIELD = 0;
/** Two-bit field 4 (Likely the shield generator): at state 2 the shield no longer recharges. */
const SHIELD_FIELD = 4;
/** Field 0's drain per RATE_PERIOD at each state. */
const GENERATOR_DRAINS: readonly [number, number, number, number] = Object.freeze([0, 10, 100, 100]);
/** The factors of the speed cost at the speeds c8C and c90 and above. */
const DOUBLED_SPEED_COST = 2;
const TRIPLED_SPEED_COST = 3;
/** The number of allocation levels. */
const LEVELS = 4;
const INT32_MIN = -(2 ** 31);

const add = (left: number, right: number): number => toInt32(left + right);
const subtract = (left: number, right: number): number => toInt32(left - right);

/** Signed i32 division (`IDIV`): the quotient truncated toward zero; a zero divisor or the one overflow is a Core fault. */
export function quotient(dividend: number, divisor: number, site: string): number {
  if (divisor === 0 || (dividend === INT32_MIN && divisor === -1)) throw new CoreFaultError('invariant-violated', site);
  return Math.trunc(dividend / divisor) + 0;
}

/** An i32 amount per RATE_PERIOD over `dt` clock units: trunc(rate × dt ÷ 64), the product wrapping. */
const overInterval = (rate: number, dt: number): number => Math.trunc(Math.imul(rate, dt) / RATE_PERIOD) + 0;

/**
 * An f32 speed chopped to i32 (`0x74518` and `FISTP`); a speed beyond i32 is a fault, as the original's conversion
 * raises its unmasked invalid-operation exception there.
 */
function chop(speed: number): number {
  const chopped = Math.trunc(speed) + 0;
  if (toInt32(chopped) !== chopped) throw new CoreFaultError('invariant-violated', 'energy.speed');
  return chopped;
}

/**
 * Step 2, the shield recharge, while the shield is below c5C and field 4 is not 2: r = min(trunc(c64[L1] × dt ÷ 64),
 * energy), need = min(c60 × (c5C − shield), 1000 r) and gain = need ÷ c60; a positive gain adds to the shield and costs
 * need ÷ 1000 energy.
 */
function rechargeShield(combat: CraftCombat, craft: CraftRecord, dt: number): void {
  if (!(combat.shield < craft.at5C) || combat.subsystems[SHIELD_FIELD] === 2) return;
  const recharge = Math.min(overInterval(craft.at64[combat.shieldLevel], dt), combat.energy);
  const need = Math.min(Math.imul(craft.at60, subtract(craft.at5C, combat.shield)), Math.imul(ENERGY_SCALE, recharge));
  const gain = quotient(need, craft.at60, 'energy.shield-divisor');
  if (gain <= 0) return;
  combat.shield = add(combat.shield, gain);
  combat.energy = subtract(combat.energy, quotient(need, ENERGY_SCALE, 'energy.shield-cost'));
}

/**
 * Step 3, the player's charge recharge, while the charge is below c74: r = min(trunc(c78[L2] × dt ÷ 64), energy) and
 * d = min(c74 − charge, 1000 r); the charge gains d and the energy loses d ÷ 1000, without a positivity test.
 */
function rechargeCharge(combat: CraftCombat, craft: CraftRecord, dt: number): void {
  if (!(combat.charge < craft.at74)) return;
  const recharge = Math.min(overInterval(craft.at78[combat.chargeLevel], dt), combat.energy);
  const gain = Math.min(subtract(craft.at74, combat.charge), Math.imul(ENERGY_SCALE, recharge));
  combat.charge = add(combat.charge, gain);
  combat.energy = subtract(combat.energy, quotient(gain, ENERGY_SCALE, 'energy.charge-cost'));
}

/**
 * Step 4, the player's speed cost over `dt`: v = chop(the commanded speed), or chop(c B8) without a movement block;
 * doubled from c8C on when c8C ≠ 0, otherwise tripled from c90 on when c90 ≠ 0; then trunc((v × c88 ÷ 1000) × dt ÷ 64).
 * It reads the commanded speed, not the current one.
 */
export function speedCost(craft: CraftRecord, commandedSpeed: number | null, dt: number): number {
  let speed = chop(commandedSpeed ?? craft.atB8);
  if (craft.at8C !== 0 && speed >= craft.at8C) speed = Math.imul(speed, DOUBLED_SPEED_COST);
  else if (craft.at90 !== 0 && speed >= craft.at90) speed = Math.imul(speed, TRIPLED_SPEED_COST);
  return overInterval(quotient(Math.imul(speed, craft.at88), ENERGY_SCALE, 'energy.speed-cost'), dt);
}

/** The player's part of an update: the commanded speed of its movement block, or null without one. */
export interface PlayerEnergyUpdate {
  readonly commandedSpeed: number | null;
}

/**
 * Steps 2–6 of one energy update over `dt` clock units, on the levels the craft holds: the shield recharge; for the
 * player (`player` non-null, `0x3071c`) the charge recharge and the speed cost, which no other craft has (`0x30994`);
 * field 0's drain; then the depletion test. Returns whether the update depleted the energy, which it then clamps to 0;
 * the caller applies the rest of the depleted branch.
 */
export function applyEnergyUpdate(combat: CraftCombat, craft: CraftRecord, dt: number, player: PlayerEnergyUpdate | null): boolean {
  rechargeShield(combat, craft, dt);
  if (player !== null) {
    rechargeCharge(combat, craft, dt);
    combat.energy = subtract(combat.energy, speedCost(craft, player.commandedSpeed, dt));
  }
  const drain = GENERATOR_DRAINS[combat.subsystems[GENERATOR_FIELD]];
  if (drain !== 0) combat.energy = subtract(combat.energy, overInterval(drain, dt));
  if (combat.energy > 0) return false;
  combat.energy = 0;
  return true;
}

/**
 * The lock `0x21ba0`(h, 1) of a depleted update, which acts only on a mode-0 block: both control paths drop their
 * requests, and the craft slows to a stop at commanded speed 0. It writes again at every depleted update, so it
 * re-zeroes a commanded speed raised in between.
 */
export function lockMovement(block: SteeredMovementBlock): void {
  if (block.mode !== 'craft') return;
  block.locked = true;
  block.atCommandedSpeed = false;
  block.commandedSpeed = 0;
}

/** Which allocation a level key changes: the shield's L1 (`s`/`S`, `0x30b20`) or the charge's L2 (`g`/`G`, `0x30bc0`). */
export type Allocation = 'shield' | 'charge';

/** E = c58 − (c78[L2] + c64[L1]). */
const sparePower = (craft: CraftRecord, shieldLevel: Level, chargeLevel: Level): number =>
  subtract(craft.at58, add(craft.at78[chargeLevel], craft.at64[shieldLevel]));

/**
 * Steps 1–3 of `0x30b20`/`0x30bc0`: the changed level moves by `delta`; a level outside 0–3 changes nothing and returns
 * false. Otherwise, while E is negative, the other level drops by one; if it would drop below 0, the changed level is
 * restored and the other one set to 0 (not to its previous value), and E is recomputed, possibly still negative.
 * Writes both levels and E and returns true; the caller recomputes the maximum speed (step 4).
 */
export function changeAllocation(combat: CraftCombat, craft: CraftRecord, allocation: Allocation, delta: 1 | -1): boolean {
  const levels = { shield: combat.shieldLevel as number, charge: combat.chargeLevel as number };
  const other: Allocation = allocation === 'shield' ? 'charge' : 'shield';
  const previous = levels[allocation];
  levels[allocation] = previous + delta;
  if (levels[allocation] < 0 || levels[allocation] >= LEVELS) return false;
  let spare = sparePower(craft, levels.shield as Level, levels.charge as Level);
  while (spare < 0) {
    levels[other] -= 1;
    if (levels[other] < 0) break;
    spare = sparePower(craft, levels.shield as Level, levels.charge as Level);
  }
  if (levels[other] < 0) {
    levels[allocation] = previous;
    levels[other] = 0;
    spare = sparePower(craft, levels.shield as Level, levels.charge as Level);
  }
  combat.shieldLevel = levels.shield as Level;
  combat.chargeLevel = levels.charge as Level;
  combat.sparePower = spare;
  return true;
}
