/**
 * Player state of formal Core (docs/plan/p3/02/spec.md, 实体与生命周期): the original player-state block `0x1b0638`
 * holds the player object (+0x8C), the view mode (+0x28), the previous view mode (+0x29) and the view sub-mode
 * (+0x2A); see docs/original/formats/executable.md#automatic-views-and-cameras-p3-0109. Building the mission and
 * instantiating the player set the view mode to 0xC (Confirmed); every other writer belongs to a rule task.
 */
import type { EntityId } from './entity-table.ts';

/** The forward cockpit view (F1). */
export const COCKPIT_VIEW_MODE = 0x0c;

export interface PlayerState {
  /** The player's entity: null until the player is instantiated and again once its entity is removed. */
  entityId: EntityId | null;
  viewMode: number;
  previousViewMode: number;
  subMode: number;
}

/**
 * The player state of a new world. The previous view mode is read only when a view is restored (closing the map, the
 * launch, the end of a Warp), which needs the instantiated player, and the player's instantiation writes it too; the
 * sub-mode is read only in view mode 0x11, whose entry from another mode clears it. Neither creation value is
 * therefore observable by a rule; they are 0xC and 0.
 */
export function createPlayerState(): PlayerState {
  return { entityId: null, viewMode: COCKPIT_VIEW_MODE, previousViewMode: COCKPIT_VIEW_MODE, subMode: 0 };
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
