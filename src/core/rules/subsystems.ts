/**
 * Subsystem damage (docs/plan/p3/02/spec.md, CR-02, CR-04 and CR-09; docs/original/formats/executable.md, steps 2–10
 * of D4, D6, D11 and D12): after the hull, `0x2a830` may damage one two-bit subsystem field. A forced roll (collisions,
 * AI area damage and missiles) and a damage roll by the share of the hull taken decide whether it does; one draw picks
 * the field, and a forced-only roll moves on to the next undamaged one. The field goes up by one state, with these
 * exceptions: 5 and 8 damage a mount of list 1 or 0 instead (`0x2e150`, `0x2e310`; rules/mounts.ts); 10 and 13 never
 * pass state 1; 7 also raises the steering disturbance of the movement block (`0x21bd4`). For the player, the count of
 * damaged fields then gives the heavy-damage note `0x69e5c` (D11).
 *
 * Integers are i32 as in the original (D17); rand values are 0–32767, so `rand % n` is never negative. Draws, in order
 * (D12): the forced roll, the damage roll, the field, the field again when a forced-only search finds none undamaged,
 * then those of the mount damage or the disturbance.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { MISSILE_KIND_BIT, SUBSYSTEM_COUNT, type Disturbance, type MovementBlock, type SubsystemState } from '../world/entity-table.ts';
import type { CraftEntity } from './combat-init.ts';
import { damageListMount } from './mounts.ts';
import type { RandSource } from './original-random.ts';
import { PLAYER_KIND_BIT } from './spawn-schedule.ts';

/** The fields a damage roll picks from: all 19 for the player, the first 9 for any other craft (the wingman's too). */
const PLAYER_ROLL_FIELDS = SUBSYSTEM_COUNT;
const OTHER_ROLL_FIELDS = 9;
/** A low byte below it makes the forced roll: 50 of 256. */
const FORCED_ROLL_BELOW = 0x32;
/** The damage roll's threshold is trunc(768 × hull damage ÷ the hull after it), against a low byte. */
const DAMAGE_ROLL_SCALE = 768;
/** The field whose damage also disturbs the steering (`0x21bd4`). */
const STEERING_SUBSYSTEM = 7;
/** The fields whose damage goes to a mount of list 1 (`0x2e150`) and of list 0 (`0x2e310`) instead. */
const MISSILE_MOUNT_SUBSYSTEM = 5;
const GUN_MOUNT_SUBSYSTEM = 8;
/** Fields that damage never takes past state 1. */
const SINGLE_STEP_SUBSYSTEMS: readonly number[] = Object.freeze([10, 13]);
/** The player's damaged-field counts from which `0x69e5c` notes heavy damage (1) or damage (0). */
const HEAVY_DAMAGE_FIELDS = 14;
const DAMAGE_NOTE_FIELDS = 9;
/** A disturbance bias is rand % 193 − 96, so −96…96. */
const BIAS_RANGE = 193;
const BIAS_OFFSET = 96;

const LEVEL_ONE: Disturbance = Object.freeze({ level: 1 });

const bias = (rand: RandSource): number => (rand.next() % BIAS_RANGE) - BIAS_OFFSET;

/**
 * `0x21bd4(object, level)`, the steering disturbance: only a mode-0 block (`craft`) takes it, so nothing happens, and
 * nothing is drawn, for a parked craft or one in Warp. Level 2 draws its three integer biases, rand % 193 − 96 each, in
 * the block's order; P3-06's control paths consume them (flight-control.ts). Level 1 keeps none, as no reader uses them
 * at that level.
 */
export function disturb(movement: MovementBlock | null, level: 1 | 2, rand: RandSource): void {
  if (movement === null || movement.mode !== 'craft') return;
  if (level === 1) {
    movement.disturbance = LEVEL_ONE;
    return;
  }
  const biases = [bias(rand), bias(rand), bias(rand)] as const;
  movement.disturbance = Object.freeze({ level: 2, biases: Object.freeze(biases) });
}

/** What the damage rule hands the subsystem part of `0x2a830`. */
export interface SubsystemHit {
  /** What the shield left (i32), including a passed shield's whole damage; the hull has already taken it. */
  readonly hullDamage: number;
  /** The damage entry's attacker kind was 0: a collision or AI area damage. */
  readonly noAttacker: boolean;
  /** The kind bit of the damage's source object; null without one. */
  readonly sourceKindBit: number | null;
}

/** The outcome of a subsystem roll. */
export interface SubsystemRoll {
  /** The field picked; null when neither roll succeeded. */
  readonly field: number | null;
  /** The field's state was below 2, so the damage applied and the craft's status-display redraw flag (+0xF0) was set. */
  readonly applied: boolean;
  /** The player's `0x69e5c` argument: 1 from 14 damaged fields, 0 from 9, null without a call. Other craft: null. */
  readonly heavyDamage: 0 | 1 | null;
}

const NO_ROLL: SubsystemRoll = Object.freeze({ field: null, applied: false, heavyDamage: null });

/** The first undamaged field from `from` up, then from 0 up to `from`; null when every one of `count` is damaged. */
function firstUndamaged(subsystems: readonly SubsystemState[], from: number, count: number): number | null {
  for (let index = from; index < count; index++) if (subsystems[index] === 0) return index;
  for (let index = 0; index < from; index++) if (subsystems[index] === 0) return index;
  return null;
}

/**
 * Steps 2–10 of `0x2a830` on `entity`, whose hull already took `hit.hullDamage` (rules/damage.ts):
 * 1. the forced roll, drawn only without an attacker or from a missile: a low byte below 0x32;
 * 2. no hull damage and no forced roll: nothing more;
 * 3. the damage roll: certain when the hull is at most 0 (no draw); otherwise t = trunc(768 × hull damage ÷ hull)
 *    (i32) beats a low byte (signed), drawn also when t is 0;
 * 4. neither roll: nothing more;
 * 5. the field rand % n; a forced-only roll takes the first undamaged field from it instead, or draws the field once
 *    more when all n are damaged;
 * 6. below state 2 the damage applies (5, 8, 10, 13 and 7 as the module says);
 * 7. the player's count of damaged fields among 0–18, after the damage, also when the field was already at state 2.
 */
export function damageSubsystems(entity: CraftEntity, craft: CraftRecord, hit: SubsystemHit, rand: RandSource): SubsystemRoll {
  const { hullDamage, noAttacker, sourceKindBit } = hit;
  const { combat } = entity;
  const { hull } = combat;
  const forced = (noAttacker || sourceKindBit === MISSILE_KIND_BIT) && (rand.next() & 0xff) < FORCED_ROLL_BELOW;
  if (hullDamage === 0 && !forced) return NO_ROLL;
  const rolled = hull <= 0 || Math.trunc(Math.imul(hullDamage, DAMAGE_ROLL_SCALE) / hull) > (rand.next() & 0xff);
  if (!forced && !rolled) return NO_ROLL;

  const player = entity.kindBit === PLAYER_KIND_BIT;
  const count = player ? PLAYER_ROLL_FIELDS : OTHER_ROLL_FIELDS;
  let field = rand.next() % count;
  if (!rolled) field = firstUndamaged(combat.subsystems, field, count) ?? rand.next() % count;
  const state = combat.subsystems[field];
  const applied = state < 2;
  if (applied) {
    if (field === MISSILE_MOUNT_SUBSYSTEM) damageListMount(combat.weapons, craft, 1, rand);
    else if (field === GUN_MOUNT_SUBSYSTEM) damageListMount(combat.weapons, craft, 0, rand);
    else {
      const subsystems = [...combat.subsystems];
      subsystems[field] = SINGLE_STEP_SUBSYSTEMS.includes(field) && state === 1 ? 1 : ((state + 1) as 1 | 2);
      combat.subsystems = Object.freeze(subsystems);
      if (field === STEERING_SUBSYSTEM) disturb(entity.movement, (state + 1) as 1 | 2, rand);
    }
  }
  if (!player) return { field, applied, heavyDamage: null };
  let damaged = 0;
  for (const value of combat.subsystems) if (value !== 0) damaged++;
  const heavyDamage = damaged >= HEAVY_DAMAGE_FIELDS ? 1 : damaged >= DAMAGE_NOTE_FIELDS ? 0 : null;
  return { field, applied, heavyDamage };
}
