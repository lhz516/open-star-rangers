/**
 * Projection of formal Core (docs/plan/p3/02/spec.md, Projection 与 Render State): deeply frozen plain data, detached
 * from the world, in partitions. clock, mission and player are ready, and so are both groups of the flight partition:
 * motion (docs/plan/p3/06/spec.md, D-05; P3-06) and combat (P3-07, combat.ts), and so are map (P3-09, map.ts),
 * communications (docs/plan/p3/02/spec.md, CB-14; P3-10, communications.ts) and result (P3-11, ME-14): in progress until
 * the teardown completed, then the frozen latched result, never a victory made up from the state. The projection gives
 * only what the original shows or a rule needs, never the list of all entities.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { EntityId, Level, Matrix3, NameReference, SteeredMovementBlock, SubsystemState } from '../world/entity-table.ts';
import type { MapPixel, MapPoint, PixelRect, WorldRectangle } from '../world/map-rule-data.ts';
import {
  interactionContext,
  type CategoryValue,
  type CommandValue,
  type InteractionContext,
  type LeftPage,
  type MenuCommandTable,
  type MenuExit,
  type ObjectValue,
  type TargetMode,
} from '../world/player-state.ts';
import type {
  EndingGap,
  MessageIdentity,
  MissionFlow,
  MissionResult,
  MissionStatus,
  MissionSubState,
  ResultReason,
  SpeakerSnapshot,
  SummaryReference,
  WorldState,
} from '../world/world-state.ts';
import { craftRecord, projectCombat } from './combat.ts';
import { projectCommunications } from './communications.ts';
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
  readonly phase: MissionPhase;
}

/**
 * The mission flow's phase (ME-14): main state 3 by sub-state, 0 `normal`, 1 `beacon-wait`, 2 `destruction-sequence`,
 * 3–5 `docking`; 4 `settlement-wait`; 5 `result-delay`; 0 and 1 `teardown`; `completed` once the teardown completed.
 * The rescue count, the section-2 counters, the deadlines and the settlement are not given (the original does not show
 * them in flight; diagnostics read the snapshot).
 */
export type MissionPhase =
  | 'normal' | 'beacon-wait' | 'destruction-sequence' | 'docking' | 'settlement-wait' | 'result-delay' | 'teardown' | 'completed';

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
  /** The model Asset of a target whose presentation is a model (CK-03); null otherwise (the kind-25 marker). */
  readonly model: AssetId | null;
  /** f32: the craft record +0x08 of the target's kind (T7's readout), for kind bits 0–19; null otherwise (CK-03). */
  readonly craftAt08: number | null;
}

/** A radar contact (T6); P3-13 projects it on the screen with its own camera. */
export interface RadarContact {
  readonly entityId: EntityId;
  /** f32: the contact's position minus the player's. */
  readonly offset: Vec3;
  /** The contact's f32 world position, read with the offset; the presentation projects it with its camera (CK-03). */
  readonly position: Vec3;
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
  /**
   * The current mount's weapon record after the load (CK-03): +0x08, the f32 speed in runtime units per second (a
   * gun's own, a missile's copied from its body record's +0xB8), and +0x0C, the f32 range in runtime units; null
   * without a current mount.
   */
  readonly ballistics: { readonly speed: number; readonly range: number } | null;
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
  /** The status display's blink phase and its count of writes of fields 1, 5 and 8 (CK-01, CK-03). */
  readonly statusDisplay: { readonly blink: 0 | 1; readonly rebuilds: number };
  /** The count of the original's sets of the energy-page redraw flag +0x44 (CK-02, CK-03). */
  readonly energyPageRedraws: number;
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
  /** Runtime units per second; falls with the energy state. */
  readonly maximumSpeed: number;
  /** The player's craft record +0xB8, f32 runtime units per second: the speed gauge's full scale (CK-03). */
  readonly recordMaximumSpeed: number;
  readonly speedLimitStatus: SpeedLimitStatus;
  /** The speed assist's switch and whether it has matched, readable without the event history. */
  readonly speedAssist: { readonly enabled: boolean; readonly engaged: boolean };
  /**
   * f32 rad/s (CK-03): row 1's enabled steady pitch rate, or 0; row 3 as `0x21cf8` returns it: with C +0xC4 and the
   * yaw enabled the coupled F(D(D(yaw × speed ratio) + roll)) (the roll enabled) or F(D(yaw × speed ratio)); otherwise
   * the enabled steady roll rate, or +0. Timed rotations are not counted.
   */
  readonly indicatorRates: { readonly row1: number; readonly row3: number };
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
  /** The labelled entity has a threat stamp (+0x17C ≠ 0), so the label blinks (CK-03). */
  readonly threatened: boolean;
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
    /** n, the world grid's sectors per side (`0x186b38`, `0x186b3a`) (CK-03). */
    readonly sectors: number;
    /** Integer runtime units (`0x18648c`, `0x186490`): the cursor box's extent (CK-03). */
    readonly zoomExtent: { readonly x: number; readonly y: number };
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

/**
 * The current menu's content (docs/plan/p3/02/spec.md, CB-14): `asset` is the commMenus Asset ID and `table` the menu
 * table; the original's menus have no unavailable items, so an option has no availability.
 */
export interface MenuContentReference {
  readonly asset: AssetId;
  readonly table: 'categories' | 'objects' | MenuCommandTable;
}

/** An option at its display position, with its key byte and its value: a source item, an object or the exit. */
export interface CommunicationsOption {
  /** 1 first, the position a generated key stands for (comm §7.3). */
  readonly position: number;
  readonly key: number;
  readonly value: CategoryValue | ObjectValue | CommandValue | MenuExit;
}

/** An open menu: shown only on pages 2–4 with a menu built; a dormant menu is not shown. */
export interface CommunicationsMenuView {
  readonly menu: MenuContentReference;
  readonly level: 2 | 3 | 4;
  readonly partnerEntityId: EntityId | null;
  /** In display order. */
  readonly options: readonly CommunicationsOption[];
}

/** A playing message; `frame` follows from the elapsed time and the frame durations as CB-09 consumes them. */
export interface IncomingView {
  readonly message: MessageIdentity;
  readonly speaker: SpeakerSnapshot | null;
  readonly frame: number;
  readonly frameCount: number;
  /** Whether page 5 shows the message now. */
  readonly shown: boolean;
}

/** The base page while the committed view mode is 6; `state` is the row's service state (fields 0–3, groups 0–4). */
export interface BaseServiceView {
  /** The docking object. */
  readonly baseEntityId: EntityId | null;
  readonly rows: readonly { readonly record: number; readonly selector: number; readonly state: number }[];
  readonly cursor: number;
  readonly flags: { readonly repairsComplete: boolean; readonly energyAndMissilesFull: boolean; readonly hullFull: boolean };
}

/** The player's communications readings (CB-14); not the radio queue, docking deadlines or base timers. */
export interface CommunicationsPlayer {
  readonly entityId: EntityId;
  readonly page: LeftPage;
  /** Field 13: at 2 the menu cannot open. */
  readonly subsystem: SubsystemState;
  readonly menu: CommunicationsMenuView | null;
  /** While the channel plays. */
  readonly incoming: IncomingView | null;
  /** `docked`: the player's activity is docked. */
  readonly docking: { readonly subState: MissionSubState; readonly dockingObject: EntityId | null; readonly docked: boolean };
  readonly base: BaseServiceView | null;
  /** The two lights of the type-9 instrument (P3-13). */
  readonly warnings: { readonly attackerOnTail: boolean; readonly missileIncoming: boolean };
}

/** Communications, docking and base data (P3-10): null without a player entity; a destroyed player is still given. */
export interface CommunicationsProjection {
  readonly readiness: 'ready';
  readonly player: CommunicationsPlayer | null;
}

export type { EndingGap, ResultReason };
/** The summary a successful result shows: a range of the mission Asset's event triggers, not its text (ME-05). */
export type ResultMessageReference = SummaryReference;

/**
 * The mission result (P3-11, ME-14): `in-progress` until the teardown completed, the latch and the teardown included;
 * then the frozen latched result. Destruction or rescue is not a default failure.
 */
export type ResultProjection =
  | { readonly readiness: 'ready'; readonly outcome: 'in-progress' }
  | {
      readonly readiness: 'ready';
      readonly outcome: MissionResult['outcome'];
      readonly reason: ResultReason;
      readonly summary: ResultMessageReference | null;
      readonly rescuesUsed: MissionResult['rescuesUsed'];
      readonly endingGaps: readonly EndingGap[];
      readonly playerKills: number;
      readonly latchTick: number;
      readonly completedTick: number;
    };

export interface Projection {
  readonly clock: ClockProjection;
  readonly mission: MissionProjection;
  readonly player: PlayerProjection;
  readonly flight: FlightProjection;
  readonly map: MapPartition;
  readonly communications: NotImplementedPartition | CommunicationsProjection;
  readonly result: ResultProjection;
}

const IN_PROGRESS: ResultProjection = Object.freeze({ readiness: 'ready', outcome: 'in-progress' });

/** The flow's phase (ME-14). */
function missionPhase({ mainState, subState, completedTick }: MissionFlow): MissionPhase {
  if (completedTick !== null) return 'completed';
  switch (mainState) {
    case 3:
      return subState === 0 ? 'normal' : subState === 1 ? 'beacon-wait' : subState === 2 ? 'destruction-sequence' : 'docking';
    case 4:
      return 'settlement-wait';
    case 5:
      return 'result-delay';
    case 0:
    case 1:
      return 'teardown';
  }
}

/** The result partition (ME-14): the latched result exists whenever the teardown completed, or Core is at fault. */
function resultProjection({ result, completedTick }: MissionFlow): ResultProjection {
  if (completedTick === null) return IN_PROGRESS;
  if (result === null) throw new CoreFaultError('invariant-violated', 'projection.result');
  const { outcome, reason, summary, rescuesUsed, endingGaps, playerKills, latchTick } = result;
  return Object.freeze({
    readiness: 'ready',
    outcome,
    reason: Object.freeze({ ...reason }),
    summary: summary === null ? null : Object.freeze({ ...summary }),
    rescuesUsed,
    endingGaps: Object.freeze(endingGaps.map((gap) => Object.freeze({ ...gap }))),
    playerKills,
    latchTick,
    completedTick,
  });
}

/**
 * The rates of the cockpit's angular-rate indicator (CK-03): row 1 is the enabled steady pitch rate; row 3 what
 * `0x21cf8` returns, the steady or coupled row-3 expression of the movement integrator's step 7 without the turn factor,
 * ignoring a timed rotation, and +0 when neither the coupling nor the roll is on.
 */
function indicatorRates({ steering: { pitch, yaw, roll }, speedRatio }: SteeredMovementBlock, { atC4 }: CraftRecord): MotionPlayer['indicatorRates'] {
  const row1 = pitch.enabled ? pitch.rate : 0;
  if (atC4 !== 0 && yaw.enabled) {
    const coupled = yaw.rate * speedRatio;
    return Object.freeze({ row1, row3: Math.fround(roll.enabled ? coupled + roll.rate : coupled) });
  }
  return Object.freeze({ row1, row3: roll.enabled ? roll.rate : 0 });
}

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
  const craft = craftRecord(world, entity.kindBit);
  return Object.freeze({
    entityId,
    position: Object.freeze({ x, y, z }),
    orientation: Object.freeze([...orientation]) as unknown as Matrix3,
    speed: movement.speed,
    commandedSpeed: movement.commandedSpeed,
    maximumSpeed: entity.maximumSpeed,
    recordMaximumSpeed: craft.atB8,
    speedLimitStatus: PLAYER_SPEED_LIMIT_STATUS,
    speedAssist: Object.freeze({ enabled, engaged }),
    indicatorRates: indicatorRates(movement, craft),
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
      phase: missionPhase(world.flow),
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
    communications: projectCommunications(world),
    result: resultProjection(world.flow),
  });
}
