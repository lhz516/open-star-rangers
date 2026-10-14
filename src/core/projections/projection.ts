/**
 * Projection of formal Core (docs/plan/p3/02/spec.md, Projection 与 Render State): deeply frozen plain data, detached
 * from the world, in partitions. clock, mission and player are ready, and so are both groups of the flight partition:
 * motion (docs/plan/p3/06/spec.md, D-05; P3-06) and combat (P3-07, combat.ts), and so is map (P3-09, map.ts).
 * communications and result fix the boundary their owners fill; until a rule makes one ready it is `not-implemented`,
 * never an empty list, a zero value or a victory. The projection gives only what the original shows or a rule needs, never the list of
 * all entities. Fields the spec leaves to an owner's research are `never` here: the owner defines them by revising the
 * spec (扩展规则) before its partition can become ready.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { EntityId, Level, Matrix3, NameReference, SubsystemState } from '../world/entity-table.ts';
import type { MapPixel, MapPoint, PixelRect, WorldRectangle } from '../world/map-rule-data.ts';
import { interactionContext, type InteractionContext, type LeftPage, type TargetMode } from '../world/player-state.ts';
import type { MissionStatus, WorldState } from '../world/world-state.ts';
import { projectCombat } from './combat.ts';
import { projectMap } from './map.ts';

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
  readonly warp: CombatWarpReading;
}

/**
 * The cockpit's Warp readings (MW-11): the type-12 Warp indicator and, in view mode 1, the values of left page 6's three
 * labelled readouts and trace (`0x4dcec`); the trace's history and refresh period are P3-13's.
 */
export interface CombatWarpReading {
  /** `0x4f2a0`, `0x4f3e4`: +0xC8 = 0, or +0xC8 + 64 × +0xA4 < clock (strict); the campaign gate always holds. */
  readonly indicator: boolean;
  /** f32 a, s, p, c in [0, 1] in view mode 1; null in every other view. */
  readonly page: { readonly angle: number; readonly error: number; readonly completion: number; readonly centring: number } | null;
}

/**
 * Whether a maximum speed is the instantiation value only (`initial-only`, until P3-07 recomputes it from the live
 * energy state) or the live rule's (`live`).
 */
export type SpeedLimitStatus = 'initial-only' | 'live';

/**
 * The status of the player's maximum speed, which the motion group reports: `live`, as P3-07 recomputes it from the
 * live E, T and field 2 at instantiation and at every allocation level change (docs/plan/p3/02/spec.md, CR-09;
 * systems/energy.ts). It never falls back to `initial-only`.
 */
export const PLAYER_SPEED_LIMIT_STATUS: SpeedLimitStatus = 'live';

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

/** The combat group: `not-implemented` until P3-07's readings were ready; combat.ts now always makes it ready (CR-12). */
export type FlightCombat = NotImplementedPartition | CombatReady;

/** Flight HUD data in two groups, each ready on its own; neither overwrites the other. */
export interface FlightProjection {
  readonly motion: NotImplementedPartition | MotionReady;
  readonly combat: FlightCombat;
}

// The strategic map partition (docs/plan/p3/02/spec.md, MW-11), ready since P3-09 (map.ts).

/** A Warp request's gate (MW-04) judged on the committed state: the reading never changes the state. */
export type WarpRequestReading =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: 'player-unavailable' | 'wrong-context' | 'no-destination' | 'cooldown' | 'insufficient-energy' };

/** A cost readout: c and E (i32); percent = max(trunc(c ÷ E × 100), 1), null when E = 0. */
export interface MapCostReading {
  readonly cost: number;
  readonly energy: number;
  readonly percent: number | null;
}

export interface MapContact {
  readonly entityId: EntityId;
  readonly kindBit: number;
  readonly name: NameReference;
  readonly position: Vec3;
  readonly pixel: MapPoint;
  readonly inWorld: boolean;
  /** Bit 0; a kind in `0x6c87f`; the rest (that is, `0x93780`). */
  readonly class: 'player' | 'friendly' | 'hostile';
  /** The player's target, which the original draws on top. */
  readonly target: boolean;
  /** trunc(D(F(+0x0C) × F(ppX))); null for 0; a disc for the player and friendly craft. */
  readonly coverage: { readonly radius: number; readonly style: 'disc' | 'ring' } | null;
}

export interface MapZoomMember {
  readonly entityId: EntityId;
  /** Relative to the zoom window's origin: `0x4c5ec`'s pixel; the spacing `0x4b56c` is P3-13's drawing (MW-11). */
  readonly pixel: MapPoint;
  /** The selection box: a destination exists and |trunc(D(position − destination))| < 1000 on all three axes. */
  readonly boxed: boolean;
  /** `0x4b98c`'s number: the truncated 3D distance to the player; null for the player itself. */
  readonly distance: number | null;
}

/** The information window's rows, in the original's order. */
export type MapInformationRow =
  | { readonly type: 'unit-name'; readonly entityId: EntityId; readonly kindBit: number; readonly name: NameReference }
  | { readonly type: 'unit-values'; readonly entityId: EntityId; readonly shield: ResourceReading; readonly hull: ResourceReading; readonly energy: ResourceReading }
  | { readonly type: 'count'; readonly kindBit: 7 | 8 | 9 | 10 | 19 | 13 | 14 | 16 | 12; readonly count: number };

export interface MapLabel {
  readonly entityId: EntityId;
  readonly name: NameReference;
  readonly pixel: MapPoint;
  readonly playerOrWingman: boolean;
}

/** The open map: everything the map view shows. */
export interface MapOpen {
  readonly state: 'open';
  /** The previous view mode is 6. */
  readonly openedFromBase: boolean;
  readonly geometry: {
    readonly main: PixelRect;
    readonly information: PixelRect;
    readonly zoom: PixelRect;
    readonly pixelsPerUnit: { readonly x: number; readonly y: number };
    readonly unitsPerPixel: { readonly x: number; readonly y: number };
    readonly zoomPixelsPerUnit: { readonly x: number; readonly y: number };
    readonly world: WorldRectangle;
  };
  /** f32; the world point's z is 0. */
  readonly cursor: {
    readonly pixel: MapPixel;
    readonly world: Vec3;
    readonly zoomBounds: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  };
  /** In map icon list order. */
  readonly contacts: readonly MapContact[];
  /** The entries `0x4c5ec` puts in the zoom window, in the same order. */
  readonly zoomMembers: readonly MapZoomMember[];
  /** Count rows at or past the capacity are drawn outside the window by the original. */
  readonly information: { readonly capacity: number; readonly rows: readonly MapInformationRow[] };
  readonly labels: readonly MapLabel[];
  /**
   * The player's projected pixel (possibly outside the main map; drawing clips it) to the cursor pixel (`0x4c674`); from
   * the player's live position when it has no icon (MW-11, a project rule unreachable before P3-11).
   */
  readonly line: { readonly from: MapPoint; readonly to: MapPixel };
  readonly destination: { readonly position: Vec3; readonly pixel: MapPoint; readonly inWorld: boolean; readonly cost: MapCostReading } | null;
  readonly cursorCost: MapCostReading;
  readonly markerEntityId: EntityId | null;
  readonly warpRequest: WarpRequestReading;
}

/** Open while the committed view mode is 8; closed, it gives only the destination, the marker and the Warp gate. */
export type MapPlayer =
  | { readonly state: 'closed'; readonly destination: Vec3 | null; readonly markerEntityId: EntityId | null; readonly warpRequest: WarpRequestReading }
  | MapOpen;

/** Null without a player entity. */
export interface MapReady {
  readonly readiness: 'ready';
  readonly player: MapPlayer | null;
}

export type MapPartition = NotImplementedPartition | MapReady;

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
  readonly map: MapPartition;
  readonly communications: NotImplementedPartition | CommunicationsReady;
  readonly result: NotImplementedPartition | ResultReady;
}

const NOT_IMPLEMENTED: NotImplementedPartition = Object.freeze({ readiness: 'not-implemented' });

/**
 * The player's motion, or null without a player entity. A player entity always has its control state, and its steered
 * movement block (CR-03), which only parking releases and the area check never parks the player's kind; missing either
 * is Core's fault.
 */
function motionPlayer(world: WorldState): MotionPlayer | null {
  const { entityId, control } = world.player;
  if (entityId === null) return null;
  const entity = world.entities.get(entityId);
  const movement = entity?.movement;
  if (!entity || !movement || !control || (movement.mode !== 'craft' && movement.mode !== 'warp')) {
    throw new CoreFaultError('invariant-violated', 'projection.motion');
  }
  const { position: { x, y, z }, orientation } = entity;
  const { enabled, engaged } = control.speedAssist;
  return Object.freeze({
    entityId,
    position: Object.freeze({ x, y, z }),
    orientation: Object.freeze([...orientation]) as unknown as Matrix3,
    speed: movement.speed,
    commandedSpeed: movement.commandedSpeed,
    maximumSpeed: entity.maximumSpeed,
    speedLimitStatus: PLAYER_SPEED_LIMIT_STATUS,
    speedAssist: Object.freeze({ enabled, engaged }),
  });
}

/** The flight partition: the motion group (P3-06) and the combat group (P3-07), each ready on its own. */
function flightProjection(world: WorldState): FlightProjection {
  const motion: MotionReady = Object.freeze({ readiness: 'ready', player: motionPlayer(world) });
  return Object.freeze({ motion, combat: projectCombat(world) });
}

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
    flight: flightProjection(world),
    map: projectMap(world),
    communications: NOT_IMPLEMENTED,
    result: NOT_IMPLEMENTED,
  });
}
