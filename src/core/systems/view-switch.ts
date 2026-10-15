/**
 * The view switch (docs/plan/p3/02/spec.md, MW-09): the rule effects of `0x3f158(new, old)`, which the original calls
 * after a writer has stored the new view mode and the previous one (docs/original/formats/executable.md, map mode and
 * its commands). Every rule that changes the view calls switchView after writing the two modes rather than copying the
 * page rules: P3-09's map toggle, Warp start and Warp completion, P3-10's docking and launch, P3-11's destruction and
 * rescue. It writes no view mode and emits nothing; a caller emits the returned page change where its contract orders
 * `left-page-changed`.
 *
 * - The map (8) has no rule effect: opening or closing it from or to a flight view sets no redraw and keeps the page.
 * - Entering the Warp view (1) saves the left page and shows page 6; leaving it restores the saved page, 5 (the
 *   incoming-message page) as 0.
 * - A switch from or to the base interior (6) also runs `0x4cd68`, which sets `statusDisplay.redraw` and re-applies the
 *   page. That part is P3-10's and is not implemented here: Core has no writer of view 6 before P3-10.
 */
import type { LeftPage } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';

/** The Warp view. */
export const WARP_VIEW_MODE = 1;
/** The base interior. */
export const BASE_VIEW_MODE = 6;
/** The strategic map. */
export const MAP_VIEW_MODE = 8;

/** The page the Warp view shows. */
const WARP_PAGE: LeftPage = 6;
/** The incoming-message page, which leaving the Warp view does not restore. */
const MESSAGE_PAGE: LeftPage = 5;

/** A change of the left page by a view switch, for its caller's `left-page-changed`. */
export interface LeftPageChange {
  readonly page: LeftPage;
  readonly previousPage: LeftPage;
}

/**
 * The rule effects of a switch from `oldMode` to `newMode`, both already stored in the player state; see the module
 * comment. Returns the change of the left page, or null when the page is unchanged.
 */
export function switchView(world: WorldState, newMode: number, oldMode: number): LeftPageChange | null {
  const { player } = world;
  const { leftDisplay } = player;
  const previousPage = leftDisplay.page;
  if (newMode === WARP_VIEW_MODE && oldMode !== WARP_VIEW_MODE) {
    player.savedLeftPage = previousPage;
    leftDisplay.page = WARP_PAGE;
  } else if (oldMode === WARP_VIEW_MODE && newMode !== WARP_VIEW_MODE) {
    leftDisplay.page = player.savedLeftPage === MESSAGE_PAGE ? 0 : player.savedLeftPage;
  }
  // P3-10 adds 0x4cd68 here for a switch from or to BASE_VIEW_MODE.
  return leftDisplay.page === previousPage ? null : { page: leftDisplay.page, previousPage };
}
