/**
 * Base-service state for tests of other rules in the base view (docs/plan/p3/02/spec.md, CB-10, CB-11): view 6 always
 * has a base service and a saved pose, as only docking enters it.
 */
import type { Pose } from '../world/player-state.ts';
import type { BaseService, WorldState } from '../world/world-state.ts';

/** A base service as docking leaves it, rows in record order, whose steps are not due before `dueClock`. */
export function idleBaseService(dueClock = 1e9): BaseService {
  return {
    rows: Array.from({ length: 11 }, (_, record) => record),
    cursor: 0,
    dues: { repair: dueClock, hull: dueClock, energy: dueClock },
    rates: { hull: 0, energy: 0 },
    flags: { repairsComplete: false, energyAndMissilesFull: false, hullFull: false },
  };
}

/** The saved pose enterBaseView leaves: a base at the origin with the identity rows. */
export const BASE_VIEW_SAVED_POSE: Pose = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  orientation: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Pose['orientation'],
});

/**
 * Puts the player in the base view with an idle base service and a saved pose, for tests whose subject is not the
 * service; its previous view is the cockpit's (0xC) unless set otherwise.
 */
export function enterBaseView(state: WorldState): void {
  state.player.viewMode = 6;
  state.baseService = idleBaseService();
  state.player.docking.savedPose = BASE_VIEW_SAVED_POSE;
}
