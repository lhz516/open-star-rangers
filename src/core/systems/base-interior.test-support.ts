/**
 * Base-service state for tests of other rules in the base view (docs/plan/p3/02/spec.md, CB-11): view 6 always has a
 * base service, as only docking enters it.
 */
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

/** Puts the player in the base view with an idle base service, for tests whose subject is not the service. */
export function enterBaseView(state: WorldState): void {
  state.player.viewMode = 6;
  state.baseService = idleBaseService();
}
