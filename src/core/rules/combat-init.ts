/**
 * A craft's combat state at instantiation (docs/plan/p3/02/spec.md, CR-02 and CR-07; docs/original/formats/executable.md,
 * W1, D13 and instantiation): the weapon block `0x2d400`, the hull, the resources `0x3060c` and the cleared two-bit
 * fields, written in the extension point's order. P3-11's rescue reuses `0x2d400` and `0x3060c` (CR-13): each writes
 * only its own fields. Also the non-craft branch of `0x3060c` and the allocator's fields of the runtime kinds, for the
 * constructors of P3-07/14 and 18.
 *
 * Integer arithmetic is the original's i32 (signed `IDIV` truncating toward zero); world creation proves that no step
 * overflows for the records the run can instantiate (rule-data.ts), so a step that does is a Core fault.
 */
import type { CraftRecord, Mount, MissileBodyRecord } from '../../content/rule-data/craft-info.ts';
import { CoreFaultError } from '../errors.ts';
import {
  allocatorFlightState, SUBSYSTEM_COUNT,
  type CraftCombat, type Entity, type EntityInit, type Level, type ListSelection, type Matrix3, type MountState, type SubsystemState, type WeaponBlock,
} from '../world/entity-table.ts';
import { ENERGY_SCALE, INITIAL_ALLOCATION, playerMaximumSpeed } from './flight-state.ts';
import type { RandSource } from './original-random.ts';
import { toInt32 } from './record-defaults.ts';
import { PLAYER_KIND_BIT } from './spawn-schedule.ts';

/** A craft entity: kind bits 0–19, whose combat state is a craft's. */
export type CraftEntity = Entity & { readonly combat: CraftCombat };

/** The divisor of the record percentages in `0x3060c`. */
const PERCENT = 100;
/** The charge percentage `0x3060c` always receives. */
const CHARGE_PERCENT = 100;
/** f64 `0x1725c4`: instantiation scales the record's +0x60 by it into a fraction of craft +0x9C. */
export const HULL_PERCENT_SCALE = 0.01;
/** The first energy update comes 0x80 + rand % 64 clock units after the clock. */
const FIRST_ENERGY_DELAY = 0x80;
const ENERGY_DELAY_RANGE = 64;

const ZERO_AIM: Matrix3 = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0]) as unknown as Matrix3;
const CLEARED_SUBSYSTEMS: readonly SubsystemState[] = Object.freeze(Array.from({ length: SUBSYSTEM_COUNT }, (): SubsystemState => 0));

/** Signed i32 division as `IDIV` does it, with an integer 0 for a zero quotient. */
const divide = (dividend: number, divisor: number): number => Math.trunc(dividend / divisor) + 0;
const isInt32 = (value: number): boolean => toInt32(value) === value;

function initialMount({ at0C }: Mount): MountState {
  return { lastShotClock: null, ammunition: at0C, damage: 0, burst: 0, aim: ZERO_AIM, autoTarget: null, retargetClock: 0 };
}

const initialSelection = (list: readonly number[]): ListSelection => ({ index: 0, mount: list.length === 0 ? null : list[0] });

/**
 * `0x2d400`: a fresh weapon block for `craft`: one zeroed mount state per mount with the mount's ammunition, the
 * cooldown clock unset; each list's selection at entry 0, its first mount or none for an empty list; the lock cleared.
 */
export function buildWeaponBlock(craft: CraftRecord): WeaponBlock {
  const [list0, list1, list2] = craft.mountLists;
  return {
    selections: Object.freeze([initialSelection(list0), initialSelection(list1), initialSelection(list2)] as const),
    lock: { level: 0, stageDueClock: 0, losing: false, graceDueClock: 0, nextUpdateClock: 0 },
    mounts: Object.freeze(craft.mounts.map(initialMount)),
  };
}

/** The hull +0xD0 instantiation writes: chop((the record's +0x60 × 0.01) × craft +0x9C), each product in double. */
export const initialHull = (craft: CraftRecord, percent: number): number => Math.trunc(percent * HULL_PERCENT_SCALE * craft.at9C) + 0;

/** The values `0x3060c` writes for a craft, before the maximum speed and the energy clocks. */
export interface InitialResources {
  readonly energy: number;
  readonly shield: number;
  readonly charge: number;
  readonly shieldLevel: Level;
  readonly chargeLevel: Level;
  readonly sparePower: number;
  readonly fullSpeedPower: number;
}

/**
 * `0x3060c`'s craft arithmetic at the levels the object holds then (the player's fixed 1 and 2 at instantiation and
 * rescue): energy = (c54 ÷ 100) × the record's +0x68, shield = c5C × +0x64 ÷ 100, charge = c74 × 100 ÷ 100, the spare
 * power E = c58 − (c64[L1] + c78[L2]) and the full-speed power T = chop(c B8) × c88 ÷ 1000. `steps` lists every i32
 * step in order, unwrapped, for world creation's overflow check.
 */
export function resourceArithmetic(
  craft: CraftRecord,
  energyPercent: number,
  shieldPercent: number,
  shieldLevel: Level,
  chargeLevel: Level,
): { readonly resources: InitialResources; readonly steps: readonly number[] } {
  const energy = divide(craft.at54, PERCENT) * energyPercent;
  const shieldProduct = craft.at5C * shieldPercent;
  const chargeProduct = craft.at74 * CHARGE_PERCENT;
  const allocated = craft.at64[shieldLevel] + craft.at78[chargeLevel];
  const sparePower = craft.at58 - allocated;
  const chopped = Math.trunc(craft.atB8) + 0;
  const thresholdProduct = chopped * craft.at88;
  const resources = Object.freeze({
    energy: energy + 0,
    shield: divide(shieldProduct, PERCENT),
    charge: divide(chargeProduct, PERCENT),
    shieldLevel,
    chargeLevel,
    sparePower,
    fullSpeedPower: divide(thresholdProduct, ENERGY_SCALE),
  });
  return { resources, steps: Object.freeze([energy, shieldProduct, chargeProduct, allocated, sparePower, chopped, thresholdProduct]) };
}

/**
 * `0x30e0c` on a craft's live state: for the player the energy branch with the spare power E, the full-speed power T and
 * subsystem field 2 (P3-06's playerMaximumSpeed); every other kind the record's base +0xB8. For the level keys of
 * P3-07/16 as well.
 */
export function craftMaximumSpeed(kindBit: number, craft: CraftRecord, combat: CraftCombat): number {
  if (kindBit !== PLAYER_KIND_BIT) return craft.atB8;
  return playerMaximumSpeed(craft, { energy: combat.sparePower, threshold: combat.fullSpeedPower }, combat.subsystems[2]);
}

/**
 * `0x3060c` for a craft (instantiation and P3-11's rescue): the resources from the entity's record percentages (+0x68
 * energy, +0x64 shield), the levels (the player's fixed 1 and 2), E and T; then the maximum speed from them and the
 * live field 2; then the last energy update at `clock` and the next at `clock` + 0x80 + rand % 64, one draw (a time past
 * the safe integers is a budget fault). It clears the depletion latch, which only the energy updates set. Writes
 * nothing else.
 */
export function initialiseResources(entity: CraftEntity, craft: CraftRecord, clock: number, rand: RandSource): void {
  const { combat, ruleInputs } = entity;
  const player = entity.kindBit === PLAYER_KIND_BIT;
  const shieldLevel = player ? INITIAL_ALLOCATION.shield : combat.shieldLevel;
  const chargeLevel = player ? INITIAL_ALLOCATION.gun : combat.chargeLevel;
  const { resources, steps } = resourceArithmetic(craft, ruleInputs.percentD, ruleInputs.percentC, shieldLevel, chargeLevel);
  if (!steps.every(isInt32)) throw new CoreFaultError('invariant-violated', 'combat-init.resources');
  Object.assign(combat, resources);
  entity.maximumSpeed = craftMaximumSpeed(entity.kindBit, craft, combat);
  const nextEnergyClock = clock + FIRST_ENERGY_DELAY + (rand.next() % ENERGY_DELAY_RANGE);
  if (!Number.isSafeInteger(nextEnergyClock)) throw new CoreFaultError('budget-exhausted', 'combat-init.energy-clock');
  combat.lastEnergyClock = clock;
  combat.nextEnergyClock = nextEnergyClock;
  combat.depleted = false;
}

/** `0x2d400` on an existing craft (instantiation and P3-11's rescue): replaces its weapon block and nothing else. */
export function rebuildWeaponBlock(entity: CraftEntity, craft: CraftRecord): void {
  entity.combat.weapons = buildWeaponBlock(craft);
}

/**
 * Instantiation's P3-07 steps for a craft just allocated with the allocator's state (CR-07), in order: the weapon block
 * and the hull, without a draw; `0x3060c` with its draw; the two-bit fields 0–18 cleared. The player state's step
 * belongs to the caller.
 */
export function initialiseCraftCombat(entity: CraftEntity, craft: CraftRecord, clock: number, rand: RandSource): void {
  rebuildWeaponBlock(entity, craft);
  const hull = initialHull(craft, entity.ruleInputs.percentB);
  if (!isInt32(hull)) throw new CoreFaultError('invariant-violated', 'combat-init.hull');
  entity.combat.hull = hull;
  initialiseResources(entity, craft, clock, rand);
  entity.combat.subsystems = CLEARED_SUBSYSTEMS;
}

/**
 * The non-craft branch of `0x3060c` (D13), for the missile constructor of P3-07/14: only `0x30e0c`, so the maximum
 * speed is the body record's +0xB8; no resource, level or energy clock, and no draw.
 */
export const missileMaximumSpeed = (body: MissileBodyRecord): number => body.atB8;

const NO_RULE_INPUTS = Object.freeze({ percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 });

/** The fields a runtime kind (bits 20–24) takes from the allocator (CR-02); the maximum speed is 0 but for a missile. */
export type RuntimeKindDefaults = Pick<
  EntityInit,
  'source' | 'name' | 'side' | 'baseInteraction' | 'activity' | 'ruleInputs' | 'lastParkedUpdateClock' | 'warpClock' | 'inWarp' | 'ai' | 'formation'
>;

/**
 * The allocator's fields of a runtime kind, for the constructors of P3-07/14 and 18: created active, no source, name,
 * side or interaction, zero rule inputs, no parked update, Warp or formation, and the allocator's AI state (mode 5, no
 * targets, zero vectors), as these kinds never run `0x68050`.
 */
export function runtimeKindDefaults(): RuntimeKindDefaults {
  return {
    source: null,
    name: { type: 'none' },
    side: null,
    baseInteraction: false,
    activity: 'active',
    ruleInputs: NO_RULE_INPUTS,
    lastParkedUpdateClock: 0,
    ...allocatorFlightState(),
  };
}
