/**
 * The combat group `flight.combat` of the flight partition (docs/plan/p3/02/spec.md, CR-12; docs/plan/p3/07/spec.md,
 * 目标与传感 and 能量与显示状态): the player's combat readings for the HUD (P3-13), read from the world without changing it
 * or drawing a random number, deeply frozen and detached from it. The group is ready: without a player entity its player
 * is null, never made-up zero resources; a destroyed player (the destruction view until the rescue) keeps its readings
 * with `destroyed` set. The motion group is P3-06's, and neither group overwrites the other.
 *
 * - **Target:** what the right display reads (T7), for the player's target while its ID resolves: its kind, name, pose,
 *   distance, movement block speed (null without a block) and, for a craft, its shield over c5C (null otherwise). The
 *   right display's damage (subsystem 14), the marker's crosshair and the text formats are the presentation's.
 * - **Radar:** rules/radar.ts's reading for the player's target (T6).
 * - **Resources:** raw values with their full scales (D16): energy / c54, shield / c5C, charge / c74, hull (raw, may be
 *   negative) / c9C and the spare power E / T; clamping and ratios are the presentation's.
 * - **Weapons:** for lists 0 and 1, the selection index (−1 for an empty list), the current mount and its weapon record
 *   in the world's craft info, the ammunition of a missile mount's alternate chain (`0x2dd04`; null for a gun), the
 *   current mount's damage and the list's status (`0x2e438`, `0x2e264`).
 * - **Lock:** the level, the losing flag and the HUD progress `0x2e080` (W8), at the world clock the tick's lock update
 *   read: −1 without a current list-1 mount, while losing and at levels 0 and 1; 0 at level 4; at levels 2 and 3, with
 *   r = the stage due clock − the clock (i32), 50 and 0 when r < 0, otherwise 100 × r ÷ c34 + 50 and 100 × r ÷ c34, c34
 *   being the current list-1 mount's missile record +0x34 (`IMUL` wrapping, `IDIV` truncating; a zero c34 is a fault, as
 *   the original's divide exception is). A gun record has no +0x34 (the original reads past its 48 bytes); no craft of
 *   the slice has a gun in list 1 (W2), so reading one is a fault (project choice).
 * - **Warp** (docs/plan/p3/02/spec.md, MW-11; P3-09): the type-12 indicator, lit while +0xC8 = 0 or +0xC8 + 64 × +0xA4 <
 *   clock, strictly, unlike the start's interval check (`0x4f2a0`, `0x4f3e4`; the campaign gate `0x33504` always holds
 *   in the slice); and in view mode 1 page 6's values a, s, p, c (`0x4dcec`), p = warp-path.ts's warpProgress. View 1
 *   without a transit is unreachable (warp.ts); it reads null as every other view does. A marker as the target reads as
 *   any target: kind 25, its `map-marker` name, speed 0 and a null shield.
 *
 * The distance (T7) is f32(√((dy × f32(dy) + dz × f32(dz)) + dx × f32(dx))) of the double differences of the f32
 * positions, at 53-bit precision and round to nearest, as `0x42d80` forms it; an f32 store that overflows is a fault, as
 * the original's unmasked overflow exception is.
 */
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { quotient } from '../rules/energy.ts';
import { chainAmmunition, isMissileMount, listStatus, mountState } from '../rules/mounts.ts';
import { readRadar } from '../rules/radar.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import type { Entity, Matrix3, WeaponBlock } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import { warpProgress } from '../rules/warp-path.ts';
import { WARP_VIEW_MODE } from '../systems/view-switch.ts';
import type {
  CombatPlayer, CombatReady, CombatTarget, CombatWarpReading, ResourceReading, WeaponListReading, WeaponRecordReference,
} from './projection.ts';

/** `0x2e080`'s scale and level 2's offset: level 2 reads 100 down to 50, level 3 50 down to 0. */
const PERCENT = 100;
const LEVEL_2_OFFSET = 50;

const NO_PLAYER: CombatReady = Object.freeze({ readiness: 'ready', player: null });

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `combat.${site}`);
export const reading = (current: number, maximum: number): ResourceReading => Object.freeze({ current, maximum });

/** The craft record of `kindBit`; world creation binds every instantiable kind to one. */
export function craftRecord(world: WorldState, kindBit: number): CraftRecord {
  const craft = world.craftInfo.content.craft[kindBit];
  if (craft === undefined) throw fault('record');
  return craft;
}

/** The right display's distance from `from` to `to` (T7); see the module comment. */
export function displayDistance(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const distance = Math.fround(Math.sqrt(dy * Math.fround(dy) + dz * Math.fround(dz) + dx * Math.fround(dx)));
  if (!Number.isFinite(distance)) throw fault('distance');
  return distance;
}

function readTarget(world: WorldState, player: Entity): CombatTarget | null {
  const id = world.player.target;
  const target = id === null ? undefined : world.entities.get(id);
  if (target === undefined) return null;
  const { combat, movement, position: { x, y, z } } = target;
  return Object.freeze({
    entityId: target.id,
    kindBit: target.kindBit,
    // Frozen at allocation and never replaced.
    name: target.name,
    position: Object.freeze({ x, y, z }),
    orientation: Object.freeze([...target.orientation]) as unknown as Matrix3,
    distance: displayDistance(player.position, target.position),
    speed: movement === null ? null : movement.speed,
    shield: combat.type === 'craft' ? reading(combat.shield, craftRecord(world, target.kindBit).at5C) : null,
  });
}

function readList(world: WorldState, weapons: WeaponBlock, craft: CraftRecord, list: 0 | 1): WeaponListReading {
  const { index, mount } = weapons.selections[list];
  const status = listStatus(weapons, craft, list);
  if (mount === null) return Object.freeze({ index, mount, weapon: null, ammunition: null, damage: null, status });
  const record = craft.mounts[mount];
  const missile = isMissileMount(record);
  const weapon: WeaponRecordReference = Object.freeze({ asset: world.craftInfo.id, family: missile ? 'missile' : 'gun', index: record.weapon });
  return Object.freeze({
    index,
    mount,
    weapon,
    ammunition: missile ? chainAmmunition(weapons, craft, mount) : null,
    damage: mountState(weapons, mount).damage,
    status,
  });
}

/** `0x2e080`: the HUD's lock progress; see the module comment. */
function lockProgress(world: WorldState, weapons: WeaponBlock, craft: CraftRecord): number {
  const { lock } = weapons;
  const mount = weapons.selections[1].mount;
  if (mount === null || lock.losing || lock.level < 2) return -1;
  if (lock.level === 4) return 0;
  const remaining = toInt32(lock.stageDueClock - world.clock);
  if (remaining < 0) return lock.level === 2 ? LEVEL_2_OFFSET : 0;
  const record = craft.mounts[mount];
  if (!isMissileMount(record)) throw fault('lock-record');
  const progress = quotient(Math.imul(PERCENT, remaining), world.craftInfo.content.missiles[record.weapon].at34, 'combat.lock-progress');
  return lock.level === 2 ? toInt32(progress + LEVEL_2_OFFSET) : progress;
}

/** The clock units per second of the Warp interval: craft +0xA4 `SHL` 6. */
const INTERVAL_UNITS_PER_SECOND = 64;

/** The cockpit's Warp readings; see the module comment. */
function readWarp(world: WorldState, player: Entity, craft: CraftRecord): CombatWarpReading {
  const { warpClock } = player;
  const indicator = warpClock === 0 || warpClock + INTERVAL_UNITS_PER_SECOND * craft.atA4 < world.clock;
  const transit = world.player.viewMode === WARP_VIEW_MODE ? world.player.warp : null;
  const page = transit === null
    ? null
    : Object.freeze({ angle: transit.angle, error: transit.error, completion: warpProgress(transit), centring: transit.centring });
  return Object.freeze({ indicator, page });
}

/** The combat group: ready, with the player's readings or null without a player entity. */
export function projectCombat(world: WorldState): CombatReady {
  const { player: state } = world;
  if (state.entityId === null) return NO_PLAYER;
  const player = world.entities.get(state.entityId);
  if (player === undefined || player.combat.type !== 'craft') throw fault('player');
  // Targeting exists exactly while a player entity does (CR-04).
  if (state.targeting === null) throw fault('targeting');
  const { combat } = player;
  const { weapons } = combat;
  const craft = craftRecord(world, player.kindBit);
  const readings: CombatPlayer = Object.freeze({
    entityId: player.id,
    destroyed: player.destroyed,
    targetMode: state.targeting.mode,
    target: readTarget(world, player),
    radar: readRadar(world.entities, player, state.target),
    resources: Object.freeze({
      energy: reading(combat.energy, craft.at54),
      shield: reading(combat.shield, craft.at5C),
      charge: reading(combat.charge, craft.at74),
      hull: reading(combat.hull, craft.at9C),
      'spare-power': reading(combat.sparePower, combat.fullSpeedPower),
    }),
    allocation: Object.freeze({ shieldLevel: combat.shieldLevel, chargeLevel: combat.chargeLevel }),
    weapons: Object.freeze([readList(world, weapons, craft, 0), readList(world, weapons, craft, 1)] as const),
    lock: Object.freeze({ level: weapons.lock.level, losing: weapons.lock.losing, progress: lockProgress(world, weapons, craft) }),
    subsystems: Object.freeze([...combat.subsystems]),
    leftPage: state.leftDisplay.page,
    warp: readWarp(world, player, craft),
  });
  return Object.freeze({ readiness: 'ready', player: readings });
}
