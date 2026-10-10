/**
 * The shield and the hull of the damage rule (docs/plan/p3/02/spec.md, CR-02; docs/original/formats/executable.md, D3
 * and step 1 of D4): `0x30c60` and the hull subtraction that opens `0x2a830`. Neither scales the damage: the TABL 4003
 * scale and the per-kind factors reach the rule only from the parked engagement, and the collision division by
 * (3 − group) from the collisions (D2), both before the damage comes here.
 *
 * Integers are i32 as in the original (D17); rand values are 0–32767.
 */
import type { CraftCombat } from '../world/entity-table.ts';
import type { RandSource } from './original-random.ts';
import { toInt32 } from './record-defaults.ts';

/** Subsystem 4 (Likely the shield generator): at state 1 a hit may pass the shield (D3). */
const SHIELD_SUBSYSTEM = 4;
/** A low byte (rand & 0xFF) below it passes the shield: 84 of the 256 low bytes, 21/64. */
const SHIELD_BYPASS_BELOW = 0x54;

/**
 * `0x30c60`: what is left of `damage` for the hull. With subsystem 4 at state 1, one draw: a low byte below 0x54
 * returns the damage whole and leaves the shield as it is (no draw at states 0, 2 and 3; state 2 only stops the
 * recharge). Otherwise damage below the shield (signed) comes off the shield and nothing is left; any other damage
 * empties the shield and leaves damage − the old shield, 0 when they are equal. The energy-page redraw flag the
 * original also sets for the player is display only (CR-02).
 */
export function absorbByShield(combat: CraftCombat, damage: number, rand: RandSource): number {
  if (combat.subsystems[SHIELD_SUBSYSTEM] === 1 && (rand.next() & 0xff) < SHIELD_BYPASS_BELOW) return damage;
  const shield = combat.shield;
  if (damage < shield) {
    combat.shield = toInt32(shield - damage);
    return 0;
  }
  combat.shield = 0;
  return toInt32(damage - shield);
}

/** Step 1 of `0x2a830`: positive hull damage comes off the hull; zero or negative leaves it. Returns the hull, which may be negative. */
export function damageHull(combat: CraftCombat, hullDamage: number): number {
  if (hullDamage > 0) combat.hull = toInt32(combat.hull - hullDamage);
  return combat.hull;
}
