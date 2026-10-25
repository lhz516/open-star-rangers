/**
 * Player state of formal Core (docs/plan/p3/02/spec.md, 实体与生命周期): the original player-state block `0x1b0638`
 * holds the player object (+0x8C), the view mode (+0x28), the previous view mode (+0x29) and the view sub-mode
 * (+0x2A); see docs/original/formats/executable.md#automatic-views-and-cameras-p3-0109. Building the mission and
 * instantiating the player set the view mode to 0xC (Confirmed); every other writer belongs to a rule task.
 *
 * P3-06 adds the player's target (player object +0x8C) and its control state, the counterpart of the controller at
 * player object +0x14 (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约; D-03). Neither keeps a throttle: the
 * original's is a value pending for one frame, and the commanded speed of the movement block persists instead. P3-07
 * adds the targeting, combat records and cockpit display state (docs/plan/p3/02/spec.md, CR-04). P3-09 adds the map
 * cursor and destination, the saved left page and the Warp transit (docs/plan/p3/02/spec.md, MW-02); P3-10 the docking
 * object, the communications state and the saved docking pose (CB-02, CB-03).
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { EntityId, Matrix3, NameReference, RotationAxis } from './entity-table.ts';
import type { MapPixel } from './map-rule-data.ts';

/** The forward cockpit view (F1). */
export const COCKPIT_VIEW_MODE = 0x0c;

/** The speed assist (controller +0x1B4–+0x1BC): the Ctrl+Enter switch and the difficulty assist are one switch. */
export interface SpeedAssist {
  enabled: boolean;
  /** Clock units; the assist matches again only from this clock on. */
  dueClock: number;
  /** Set by an assisted match; a later loss of the target restores full throttle once. */
  engaged: boolean;
}

/** The player's control state: present exactly while a player entity exists; the rescue keeps it. */
export interface PlayerControl {
  /** The last integer deflection read per axis, the counterpart of `0x1b2470`: only a change is applied. */
  readonly lastAxes: { [Axis in RotationAxis]: number };
  readonly speedAssist: SpeedAssist;
}

export interface PlayerState {
  /** The player's entity: null until the player is instantiated and again once its entity is removed. */
  entityId: EntityId | null;
  viewMode: number;
  previousViewMode: number;
  subMode: number;
  /**
   * The player's target (player object +0x8C): null at instantiation (`0x68050` writes the AI target +0x90, not this);
   * P3-07 selects it, P3-06 clears it when it is invalid, parks or the player entity goes, P3-09 at a Warp start.
   */
  target: EntityId | null;
  control: PlayerControl | null;
  /**
   * P3-07's player state (docs/plan/p3/02/spec.md, CR-04), from here on. Targeting (controller +0x198, +0x1A8) has the
   * lifetime of `control`: present while a player entity exists (instantiation writes it), cleared when the entity is
   * removed, kept by the rescue. The commands t/f/u and the automatic selection write its mode, the automatic selection
   * its due clock.
   */
  targeting: PlayerTargeting | null;
  /** ps +0x90: the player's escape pod (its part-0 fragment) from its construction until it expires; the damage gate reads it. */
  followedEntity: EntityId | null;
  /** `0x174ae4`: the clock + 0xC0 at the player's destruction, until the delayed-explosion stage consumes it. */
  delayedExplosionClock: number | null;
  /** ps +0x30…+0x5C: the player's kills of non-player, non-wingman objects by kind bit; the rescue keeps them. */
  kills: KillCounts;
  /** ps +0x38, +0x3C, +0x40, +0x44; the rescue and the latch keep them. Read only by P4's statistics, not by P3-11. */
  readonly shots: ShotCounts;
  /**
   * `0x176710`: −1 initially; damage writes it at its thresholds; the rescue and the latch keep it. Only for P4's medals
   * (`0x69e1c` → `0x3b8dc`); P3-11 does not read it (docs/plan/p3/02/spec.md, ME-18).
   */
  heavyDamage: -1 | 0 | 1;
  /**
   * `0x1a9dc8`. P3-07 switches between pages 0 and 1; P3-10 writes pages 2–5 (CB-03), P3-09 page 6. The saved pages
   * are the menu's and the incoming message's in `communications` and P3-09's Warp page, three apart.
   */
  readonly leftDisplay: { page: LeftPage };
  /**
   * The status display's blink phase and timer (`0x4d0e0`) and the player object's redraw flag +0xF0, which the
   * player's subsystem damage and a view switch (`0x4cd68`) set and the frame-end status display step clears (CR-10).
   */
  readonly statusDisplay: { blink: 0 | 1; blinkDueClock: number; redraw: boolean };
  /** The strategic map's cursor and the Warp destination (MW-02). */
  readonly map: PlayerMap;
  /** `0x187020`: a Warp start saves the current page and leaving view mode 1 restores it (MW-09). 0 until first saved. */
  savedLeftPage: LeftPage;
  /**
   * The Warp transit's globals (MW-02): null until the world's first Warp start; every start resets it whole; neither
   * the completion nor an abandoned Warp clears it, as the original keeps the old values, read only in view mode 1.
   */
  warp: WarpTransit | null;
  /**
   * P3-10's player state (docs/plan/p3/02/spec.md, CB-02, CB-03), from here on. Player object +0x194: the object a
   * docking request named, written only by the writers of `0x52914` (CB-02) and cleared when the player entity goes.
   */
  dockingObject: EntityId | null;
  readonly communications: PlayerCommunications;
  /** `0x186af0`–`0x186b1c`: written at docking and launch (CB-10), null before the first docking. */
  readonly docking: { savedPose: Pose | null };
}

/** The map part of the player state (MW-02). */
export interface PlayerMap {
  /**
   * The point of `0x1a98ec` less the main map's origin, 0 ≤ column, row < side: the start pixel at creation and at every
   * opening of the map; hover and select write it. The cursor's world point (ps +0x04) and the zoom bounds derive from it.
   */
  cursor: MapPixel;
  /**
   * ps +0x10–+0x18 (f32); null ⇔ ps +0x00 = 0, the selection flag, which is not kept apart. Null at creation and at the
   * player's instantiation; only a select writes it.
   */
  destination: Vec3 | null;
}

/** The Warp transit's global table (MW-02; docs/original/formats/executable.md, Warp progress and completion). */
export interface WarpTransit {
  /** The world's Warp start number, from 1: relates `warp-started` to `warp-completed`. */
  readonly serial: number;
  /** `0x1864c8`, f32: the player's position at the start, the departure point the completion's charge measures from. */
  readonly origin: Vec3;
  /** L (`0x175fcc`), f32 > 0. */
  readonly length: number;
  /** n (`0x175fd0`), f32: 1.0 at the start, plus 1 per completed segment. */
  segments: number;
  /** u (`0x175fc8`), f32 in [0, 1). */
  fraction: number;
  /** s (`0x175fdc`), f32 in [0, 1]. */
  error: number;
  /** a (`0x175fd8`), f32 in [0, 1]. */
  angle: number;
  /** c (`0x175fd4`), f32 in [0, 1]. */
  centring: number;
  /** G: the last path pose, f32. */
  frame: { readonly position: Vec3; readonly orientation: Matrix3 };
  /** The tunnel path (`0x1a9f70`): exactly 15 control points in a private frame, f32 components. */
  path: readonly Vec3[];
}

/** A pose copied bit for bit (f32). */
export interface Pose {
  readonly position: Vec3;
  readonly orientation: Matrix3;
}

/** The communications menu's command tables: TABL 2003, 2005 and 2013 (comm §7.3). */
export type MenuCommandTable = 'gated' | 'other' | 'kind2';

/** A category of TABL 2007; `source` is its item number there. */
export interface CategoryValue {
  readonly type: 'category';
  readonly source: number;
  readonly kindMask: number;
}

/**
 * An object of a category, with the kind, name and colour taken when the list was built; only P3-13 draws them, no rule
 * reads them, and the item stays displayable after the object is removed.
 */
export interface ObjectValue {
  readonly type: 'object';
  readonly entityId: EntityId;
  readonly kindBit: number;
  readonly name: NameReference;
  /** Active → `active`; otherwise a threat stamp (+0x17C) → `threatened`; otherwise `other`. */
  readonly tone: 'active' | 'threatened' | 'other';
}

/** A command item of a command table; `code` is a non-zero u32. */
export interface CommandValue {
  readonly type: 'command';
  readonly source: number;
  readonly code: number;
}

export interface MenuExit {
  readonly type: 'exit';
}

/** A menu item: `key` is the raw key byte (a generated key is an ASCII digit); the exit item comes last. */
export interface MenuItem<Value> {
  readonly key: number;
  readonly value: Value | MenuExit;
}

/** The one built menu (controller +0x19C): levels 2–4, never refreshed after it is built (comm §7.5). */
export type CommunicationsMenu =
  | { readonly level: 2; readonly table: 'categories'; readonly items: readonly MenuItem<CategoryValue>[] }
  | { readonly level: 3; readonly table: 'objects'; readonly items: readonly MenuItem<ObjectValue>[] }
  | { readonly level: 4; readonly table: MenuCommandTable; readonly items: readonly MenuItem<CommandValue>[] };

/** The player's communications state (CB-03). */
export interface PlayerCommunications {
  /** Controller +0x19C: null once closed; a dormant menu stays until the next `c` replaces it. */
  menu: CommunicationsMenu | null;
  /** Controller +0x1A0: the object whose command menu is or was last built; only the next `c` clears it. */
  partner: EntityId | null;
  /** Controller +0x1A4: the page `c` opened the menu on (only 0, 1 or 5). */
  menuSavedPage: LeftPage;
  /** `0x175efc`: the page an incoming message replaced, apart from the menu's and P3-09's Warp page (RQ8). */
  incomingSavedPage: LeftPage;
  /** ps +0x78, +0x7C: clocks, null when unstamped; P3-11's rescue clears them through clearCommunicationLimits. */
  readonly limits: { friendlyHit: number | null; friendlyKill: number | null };
  /** ps +0x60: the thanks counter, a non-negative i32; P3-11's statistics reset clears it. */
  thanks: number;
}

/** Which kinds the player's target commands and automatic selection look at. */
export type TargetMode = 'enemy' | 'friendly';

export interface PlayerTargeting {
  mode: TargetMode;
  /** Clock units; the automatic selection runs again once the clock is strictly greater. */
  autoTargetDueClock: number;
}

/** The left display's pages (D15). */
export type LeftPage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The kind bits the player's kill counters count (D8), in counter order. */
export const KILL_KIND_BITS = Object.freeze([7, 8, 9, 10, 11, 12, 16, 19] as const);
export type KillKindBit = (typeof KILL_KIND_BITS)[number];
export type KillCounts = Readonly<Record<KillKindBit, number>>;

export interface ShotCounts {
  projectilesFired: number;
  projectileHits: number;
  missilesFired: number;
  missileHits: number;
}

/**
 * The player state of a new world. The previous view mode is read only when a view is restored (closing the map, the
 * launch, the end of a Warp), which needs the instantiated player, and the player's instantiation writes it too; the
 * sub-mode is read only in view mode 0x11, whose entry from another mode clears it. Neither creation value is
 * therefore observable by a rule; they are 0xC and 0. P3-07's and P3-10's fields take their creation values (CR-04,
 * CB-02, CB-03), and P3-09's (MW-02): the cursor at `startPixel`, no destination, saved page 0 and no Warp transit.
 */
export function createPlayerState(startPixel: MapPixel): PlayerState {
  return {
    entityId: null,
    viewMode: COCKPIT_VIEW_MODE,
    previousViewMode: COCKPIT_VIEW_MODE,
    subMode: 0,
    target: null,
    control: null,
    targeting: null,
    followedEntity: null,
    delayedExplosionClock: null,
    kills: Object.freeze({ 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 16: 0, 19: 0 }),
    shots: { projectilesFired: 0, projectileHits: 0, missilesFired: 0, missileHits: 0 },
    heavyDamage: -1,
    leftDisplay: { page: 0 },
    statusDisplay: { blink: 0, blinkDueClock: 0, redraw: true },
    map: { cursor: Object.freeze({ column: startPixel.column, row: startPixel.row }), destination: null },
    savedLeftPage: 0,
    warp: null,
    dockingObject: null,
    communications: {
      menu: null,
      partner: null,
      menuSavedPage: 0,
      incomingSavedPage: 0,
      limits: { friendlyHit: null, friendlyKill: null },
      thanks: 0,
    },
    docking: { savedPose: null },
  };
}

/** The targeting state instantiation gives a new player entity (CR-07): the enemy mode, the automatic selection due at once. */
export function initialPlayerTargeting(): PlayerTargeting {
  return { mode: 'enemy', autoTargetDueClock: 0 };
}

/**
 * The control state of a new player entity. The original builds its controller at the player's first update and has no
 * reader before the first controllable update, so Core builds it at instantiation (project mapping, Likely): every axis
 * last read 0; the speed assist on in campaign group 0 (difficulty path 8), due at once and not engaged.
 */
export function initialPlayerControl(group: number): PlayerControl {
  return { lastAxes: { pitch: 0, yaw: 0, roll: 0 }, speedAssist: { enabled: group === 0, dueClock: 0, engaged: false } };
}

/** Which game actions the current view interprets; UI does not duplicate this choice. */
export type InteractionContext = 'warp' | 'base' | 'map' | 'flight';

/** The original key context of a view mode (`0x26284`): Warp 0–3, base interior 6, map 8, flight every other mode. */
export function interactionContext(viewMode: number): InteractionContext {
  if (viewMode >= 0 && viewMode <= 3) return 'warp';
  if (viewMode === 6) return 'base';
  if (viewMode === 8) return 'map';
  return 'flight';
}
