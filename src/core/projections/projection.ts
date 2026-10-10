/**
 * Projection of formal Core (docs/plan/p3/02/spec.md, Projection 与 Render State): deeply frozen plain data, detached
 * from the world, in partitions. clock, mission and player are ready. flight (in two groups, motion and combat:
 * docs/plan/p3/06/spec.md, D-05), map, communications and result fix the boundary their owners fill; until a rule makes
 * one ready it is `not-implemented`, never an empty list, a zero value, a fully visible map or a victory. The
 * projection gives only what the original shows or a rule needs, never the list of all entities. Fields the spec leaves
 * to an owner's research are `never` here: the owner defines them by revising the spec (扩展规则) before its partition
 * can become ready.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { MapAxis } from '../../content/logic/logic-content.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { EntityId, Level, Matrix3, NameReference, SubsystemState } from '../world/entity-table.ts';
import { interactionContext, type InteractionContext, type LeftPage, type TargetMode } from '../world/player-state.ts';
import type { MissionStatus, WorldState } from '../world/world-state.ts';

export interface ClockProjection {
  readonly tick: number;
  /** Mission clock units, 1/64 s each. */
  readonly clock: number;
  readonly clockUnitsPerTick: number;
}

export interface MissionProjection {
  readonly mission: AssetId;
  readonly group: number;
  readonly slot: number;
  readonly rawDifficulty: number;
  /** Null, or the index of the selected wingman option. */
  readonly wingman: number | null;
  readonly status: MissionStatus;
}

export interface PlayerProjection {
  /** Null before the player is instantiated and after its entity is removed. */
  readonly entityId: EntityId | null;
  readonly viewMode: number;
  readonly previousViewMode: number;
  readonly subMode: number;
  readonly interactionContext: InteractionContext;
}

/** A partition whose rules are not implemented yet. */
export interface NotImplementedPartition {
  readonly readiness: 'not-implemented';
}

/** A gauge reading; its rule states the unit, never mixing a percentage with an absolute amount. */
export interface ResourceReading {
  readonly current: number;
  readonly maximum: number;
}

/**
 * The player's combat resources and their full scales (D16): energy / c54, shield / c5C, charge / c74, hull (raw, may
 * be negative) / c9C, spare power E / T.
 */
export type FlightResourceName = 'energy' | 'shield' | 'charge' | 'hull' | 'spare-power';
/** A gun or missile record of the world's craft info (`asset` is its Asset ID). */
export interface WeaponRecordReference {
  readonly asset: AssetId;
  readonly family: 'gun' | 'missile';
  readonly index: number;
}

/** The target information the right display reads (T7). */
export interface CombatTarget {
  readonly entityId: EntityId;
  readonly kindBit: number;
  readonly name: NameReference;
  readonly position: Vec3;
  readonly orientation: Matrix3;
  /** f32: the Euclidean distance of the f32 coordinate differences, square root in double precision. */
  readonly distance: number;
  /** The target's movement block speed; null without a block. */
  readonly speed: number | null;
  /** A craft's shield and its full scale c5C; null for every other kind. */
  readonly shield: ResourceReading | null;
}

/** A radar contact (T6); P3-13 projects it on the screen with its own camera. */
export interface RadarContact {
  readonly entityId: EntityId;
  /** f32: the contact's position minus the player's. */
  readonly offset: Vec3;
  /** A missile by its shooter when that resolves, otherwise hostile; a marker is P3-09's kind 0x2000000. */
  readonly class: 'friendly' | 'hostile' | 'marker';
  /** Blinks. */
  readonly missile: boolean;
  /** The Manhattan distance truncated to i32 is below 600. */
  readonly near: boolean;
  /** The player's target, drawn with the target box. */
  readonly target: boolean;
}

/** One weapon list's reading. */
export interface WeaponListReading {
  readonly index: number;
  readonly mount: number | null;
  readonly weapon: WeaponRecordReference | null;
  /** A missile list's ammunition summed over the alternation chain from the current mount (`0x2dd04`); null for guns. */
  readonly ammunition: number | null;
  /** The current mount's damage. */
  readonly damage: 0 | 1 | 2 | null;
  /** The list's mount status (`0x2e438`, `0x2e264`). */
  readonly status: 0 | 1 | 2;
}

/** The player's combat readings (docs/plan/p3/02/spec.md, CR-12). */
export interface CombatPlayer {
  readonly entityId: EntityId;
  /** The destroyed flag: the destruction view until the rescue. */
  readonly destroyed: boolean;
  readonly targetMode: TargetMode;
  readonly target: CombatTarget | null;
  /** `status` is subsystem 12; at 2 there are no real contacts. */
  readonly radar: { readonly status: 0 | 1 | 2; readonly contacts: readonly RadarContact[] };
  readonly resources: Readonly<Record<FlightResourceName, ResourceReading>>;
  readonly allocation: { readonly shieldLevel: Level; readonly chargeLevel: Level };
  /** Lists 0 (main weapons) and 1 (missiles). */
  readonly weapons: readonly [WeaponListReading, WeaponListReading];
  /** `progress` as `0x2e080` gives it (W8). */
  readonly lock: { readonly level: 0 | 1 | 2 | 3 | 4; readonly losing: boolean; readonly progress: number };
  /** The SUBSYSTEM_COUNT two-bit fields. */
  readonly subsystems: readonly SubsystemState[];
  readonly leftPage: LeftPage;
}

/**
 * Whether a maximum speed is the instantiation value only (`initial-only`, until P3-07 recomputes it from the live
 * energy state) or the live rule's (`live`).
 */
export type SpeedLimitStatus = 'initial-only' | 'live';

/** The player's motion. */
export interface MotionPlayer {
  readonly entityId: EntityId;
  readonly position: Vec3;
  readonly orientation: Matrix3;
  /** Runtime units per second. */
  readonly speed: number;
  /** Runtime units per second. */
  readonly commandedSpeed: number;
  /** Runtime units per second. */
  readonly maximumSpeed: number;
  readonly speedLimitStatus: SpeedLimitStatus;
  /** The speed assist's switch and whether it has matched, readable without the event history. */
  readonly speedAssist: { readonly enabled: boolean; readonly engaged: boolean };
}

/** The flight partition's motion group (P3-06). */
export interface MotionReady {
  readonly readiness: 'ready';
  /** Null without a player entity, never a made-up zero speed. */
  readonly player: MotionPlayer | null;
}

/** The flight partition's combat group (P3-07): null without a player entity, never made-up zero resources. */
export interface CombatReady {
  readonly readiness: 'ready';
  readonly player: CombatPlayer | null;
}

/** The combat group, not implemented until P3-07's combat readings are ready (P3-07 subtask 23). */
export type FlightCombat = NotImplementedPartition | CombatReady;

/** Flight HUD data in two groups, each ready on its own; neither overwrites the other. */
export interface FlightProjection {
  readonly motion: NotImplementedPartition | MotionReady;
  readonly combat: FlightCombat;
}

/** The strategic map frame converted to runtime units. */
export interface MapFrameProjection {
  readonly rightAxis: MapAxis;
  readonly upAxis: MapAxis;
  readonly center: { readonly right: number; readonly up: number };
  readonly halfExtent: number;
}

/** A contact's marker class: P3-09. */
export type MapMarkerClass = never;
/** Explored and currently visible areas with their spatial unit and indexing; not presumed to be a grid: P3-09. */
export type MapVisibility = never;

export interface MapContact {
  readonly id: EntityId;
  readonly position: Vec3;
  readonly name: NameReference;
  readonly marker: MapMarkerClass;
}

export interface MapDestination {
  readonly position: Vec3;
  readonly energyRequired: number;
  readonly executable: boolean;
}

/** Strategic map data (P3-09): only contacts that pass the visibility rules. */
export interface MapReady {
  readonly readiness: 'ready';
  readonly frame: MapFrameProjection;
  readonly contacts: readonly MapContact[];
  readonly visibility: MapVisibility;
  readonly destination: MapDestination | null;
}

/** The current menu's content: P3-03 imports menus, P3-10 fixes the reference. */
export type MenuContentReference = never;
/** Why an option is unavailable: P3-10. */
export type OptionUnavailableReason = never;

export type CommunicationsOption =
  | { readonly index: number; readonly available: true }
  | { readonly index: number; readonly available: false; readonly reason: OptionUnavailableReason };

/** Communications menu data (P3-10); no portraits or GPU objects. */
export interface CommunicationsReady {
  readonly readiness: 'ready';
  readonly partnerEntityId: EntityId | null;
  readonly menu: MenuContentReference;
  readonly level: number;
  readonly options: readonly CommunicationsOption[];
}

/** A final result's rule reason and its content message: P3-11. */
export type ResultReason = never;
export type ResultMessageReference = never;

/** The mission result (P3-11); destruction or rescue is not a default failure. */
export type ResultReady =
  | { readonly readiness: 'ready'; readonly outcome: 'in-progress' }
  | {
      readonly readiness: 'ready';
      readonly outcome: 'success' | 'failure';
      readonly reason: ResultReason;
      readonly message: ResultMessageReference;
    };

export interface Projection {
  readonly clock: ClockProjection;
  readonly mission: MissionProjection;
  readonly player: PlayerProjection;
  readonly flight: FlightProjection;
  readonly map: NotImplementedPartition | MapReady;
  readonly communications: NotImplementedPartition | CommunicationsReady;
  readonly result: NotImplementedPartition | ResultReady;
}

const NOT_IMPLEMENTED: NotImplementedPartition = Object.freeze({ readiness: 'not-implemented' });
const FLIGHT_NOT_IMPLEMENTED: FlightProjection = Object.freeze({ motion: NOT_IMPLEMENTED, combat: NOT_IMPLEMENTED });

export function projectWorld(world: WorldState): Projection {
  const { config, player } = world;
  return Object.freeze({
    clock: Object.freeze({ tick: world.tick, clock: world.clock, clockUnitsPerTick: config.clockUnitsPerTick }),
    mission: Object.freeze({
      mission: config.mission,
      group: config.group,
      slot: config.slot,
      rawDifficulty: config.rawDifficulty,
      wingman: config.wingman,
      status: world.missionStatus,
    }),
    player: Object.freeze({
      entityId: player.entityId,
      viewMode: player.viewMode,
      previousViewMode: player.previousViewMode,
      subMode: player.subMode,
      interactionContext: interactionContext(player.viewMode),
    }),
    flight: FLIGHT_NOT_IMPLEMENTED,
    map: NOT_IMPLEMENTED,
    communications: NOT_IMPLEMENTED,
    result: NOT_IMPLEMENTED,
  });
}
