/**
 * Player state of formal Core (docs/plan/p3/02/spec.md, 实体与生命周期): the original player-state block `0x1b0638`
 * holds the player object (+0x8C), the view mode (+0x28), the previous view mode (+0x29) and the view sub-mode
 * (+0x2A); see docs/original/formats/executable.md#automatic-views-and-cameras-p3-0109. Building the mission and
 * instantiating the player set the view mode to 0xC (Confirmed); every other writer belongs to a rule task.
 *
 * P3-06 adds the player's target (player object +0x8C) and its control state, the counterpart of the controller at
 * player object +0x14 (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约; D-03). Neither keeps a throttle: the
 * original's is a value pending for one frame, and the commanded speed of the movement block persists instead. P3-07
 * adds the targeting, combat records and cockpit display state (docs/plan/p3/02/spec.md, CR-04).
 */
import type { EntityId, RotationAxis } from './entity-table.ts';

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
  /** ps +0x38, +0x3C, +0x40, +0x44; the rescue keeps them. Read by P3-11 and P4. */
  readonly shots: ShotCounts;
  /** `0x176710`: −1 initially; damage writes it at its thresholds; the rescue keeps it; P3-11's success summary reads it. */
  heavyDamage: -1 | 0 | 1;
  /** `0x1a9dc8`. P3-07 switches between pages 0 and 1; P3-09 and P3-10 add pages 2–6 and the saved page. */
  readonly leftDisplay: { page: LeftPage };
  /**
   * The status display's blink phase and timer (`0x4d0e0`) and the player object's redraw flag +0xF0, which the
   * player's subsystem damage and a view switch (`0x4cd68`) set and the frame-end status display step clears (CR-10).
   */
  readonly statusDisplay: { blink: 0 | 1; blinkDueClock: number; redraw: boolean };
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
 * therefore observable by a rule; they are 0xC and 0. P3-07's fields take their creation values (CR-04).
 */
export function createPlayerState(): PlayerState {
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
