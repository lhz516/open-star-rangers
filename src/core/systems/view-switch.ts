/**
 * The view switch (docs/plan/p3/02/spec.md, MW-09): the rule effects of `0x3f158(new, old)`, which the original calls
 * after a writer has stored the new view mode and the previous one (docs/original/formats/executable.md, map mode and
 * its commands). Every rule that changes the view calls switchView after writing the two modes rather than copying the
 * page rules: P3-09's map toggle, Warp start and Warp completion, P3-10's docking and launch, P3-11's destruction,
 * rescue and teardown. It writes no view mode and emits nothing; a caller emits the returned page change where its
 * contract orders `left-page-changed`.
 *
 * - The map (8) has no rule effect: opening or closing it from or to a flight view sets no redraw and keeps the page.
 * - Entering the Warp view (1) saves the left page and shows page 6; leaving it restores the saved page, 5 (the
 *   incoming-message page) as 0.
 * - A switch from or to the base interior (6) also runs `0x4cd68`, which sets `statusDisplay.redraw`; the page stays
 *   (P3-10, CB-10; comm §7.6).
 *
 * commitViewSwitch is the shared switch every such rule goes through (P3-12, docs/plan/p3/02/spec.md, FS-03): it writes
 * the modes, runs switchView and emits `view-switched`. switchPlayerView is the original's `0x216d4` on top of it, which
 * also writes whether the player's model is shown (FS-02); the map toggle, the Warp start and completion and the
 * teardown do not go through `0x216d4` and leave that flag. P3-11's destruction entry is `0x216d4` with the previous
 * view also 0x11, and its rescue hides the model itself (`0x67b98`), so both call commitViewSwitch and set the flag.
 */
import type { LeftPage } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { emit, type TickContext } from './pipeline.ts';

/** The Warp view. */
export const WARP_VIEW_MODE = 1;
/** The base interior. */
export const BASE_VIEW_MODE = 6;
/** The strategic map. */
export const MAP_VIEW_MODE = 8;
/** The view mode in which the player's model is shown (`0x216d4`; FS-02). */
const MODEL_VIEW_MODE = 0x11;

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
  if (newMode === BASE_VIEW_MODE || oldMode === BASE_VIEW_MODE) player.statusDisplay.redraw = true;
  return leftDisplay.page === previousPage ? null : { page: leftDisplay.page, previousPage };
}

/**
 * A rule's view switch: stores `viewMode`, `previousViewMode` and `subMode` (unchanged by default: only P3-11's switches
 * write it), runs switchView from the old mode and emits `view-switched` with the old and new modes, the stage and the
 * player entity's pose at the write (FS-03). Returns switchView's page change, which the caller emits after its own
 * events.
 */
export function commitViewSwitch(context: TickContext, viewMode: number, previousViewMode: number, subMode = context.world.player.subMode): LeftPageChange | null {
  const { world } = context;
  const { player } = world;
  const fromViewMode = player.viewMode;
  const fromSubMode = player.subMode;
  player.viewMode = viewMode;
  player.previousViewMode = previousViewMode;
  player.subMode = subMode;
  const page = switchView(world, viewMode, fromViewMode);
  const entity = player.entityId === null ? undefined : world.entities.get(player.entityId);
  emit(context, {
    type: 'view-switched',
    tick: context.time.tick,
    fromViewMode,
    fromSubMode,
    viewMode,
    subMode,
    stage: context.stage,
    player: entity === undefined ? null : { entityId: entity.id, position: entity.position, orientation: entity.orientation },
  });
  return page;
}

/**
 * `0x216d4`: the previous view is the old one, then the shared switch; the player's model is shown only in the new view
 * 0x11 (FS-02). P3-10's docking and launch use it.
 */
export function switchPlayerView(context: TickContext, viewMode: number, subMode?: number): LeftPageChange | null {
  const { player } = context.world;
  const page = commitViewSwitch(context, viewMode, player.viewMode, subMode);
  player.modelShown = viewMode === MODEL_VIEW_MODE;
  return page;
}
