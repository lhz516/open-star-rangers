/**
 * Player state of formal Core (docs/plan/p3/02/spec.md, 实体与生命周期): the original player-state block `0x1b0638`
 * holds the player object (+0x8C), the view mode (+0x28), the previous view mode (+0x29) and the view sub-mode
 * (+0x2A); see docs/original/formats/executable.md#automatic-views-and-cameras-p3-0109. Building the mission and
 * instantiating the player set the view mode to 0xC (Confirmed); every other writer belongs to a rule task.
 *
 * P3-06 adds the player's target (player object +0x8C) and its control state, the counterpart of the controller at
 * player object +0x14 (docs/plan/p3/06/spec.md, 检查点 A 定稿的状态与契约; D-03). Neither keeps a throttle: the
 * original's is a value pending for one frame, and the commanded speed of the movement block persists instead.
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
}

/**
 * The player state of a new world. The previous view mode is read only when a view is restored (closing the map, the
 * launch, the end of a Warp), which needs the instantiated player, and the player's instantiation writes it too; the
 * sub-mode is read only in view mode 0x11, whose entry from another mode clears it. Neither creation value is
 * therefore observable by a rule; they are 0xC and 0.
 */
export function createPlayerState(): PlayerState {
  return { entityId: null, viewMode: COCKPIT_VIEW_MODE, previousViewMode: COCKPIT_VIEW_MODE, subMode: 0, target: null, control: null };
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
