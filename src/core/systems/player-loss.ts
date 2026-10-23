/**
 * The player's losses (docs/plan/p3/02/spec.md, ME-09, ME-13; docs/original/formats/executable.md, destruction entry
 * `0x32d74` and energy loss and the beacon wait, P3-11/02): the two entries that start a loss. Both take effect only
 * while the mission runs (main state 3), so a loss in states 4 and 5 neither rescues nor fails; the loss handling and
 * the rescue that end the loss are rescue.ts's, at the escape pod's expiry (destruction.ts) and the beacon's due.
 *
 * - destroyPlayer, `0x32d74`, from damage.ts at the player's destruction (after its object event and kill counters,
 *   before the delayed explosion): in any sub-state but 2, sub-state 2 and the radio flush; the destruction view 0x11
 *   with sub-mode 8, written twice so that the previous view is 0x11 too, the player's target cleared without
 *   `target-changed`, and the view switch from the true old view (leaving the Warp abandons it, MW-09); the docking
 *   object released. It writes no activity (a docked player stays docked), no Warp, map, docking, beacon or wingman
 *   state, nor the rescue count or the status.
 * - startBeaconWait, `0x33464`, from energy.ts at every depleted player update, after the clamp and the lock (not at
 *   the one-off `energy-depleted`): in sub-state 0 only, the beacon message and sub-state 1, due BEACON_WAIT after the
 *   sample. The mission flow ends the wait (mission-flow.ts); a destruction during it overrides the sub-state and the
 *   old due is never read again; a sub-state 0 regained with the energy still depleted re-arms it at the next update.
 */
import { CoreFaultError } from '../errors.ts';
import type { Entity } from '../world/entity-table.ts';
import { emit, type TickContext } from './pipeline.ts';
import { flushRadio } from './radio.ts';
import { switchView } from './view-switch.ts';

/** The destruction view (0x11) and its sub-mode. */
const DESTRUCTION_VIEW_MODE = 0x11;
const DESTRUCTION_SUB_MODE = 8;
/** Clock units from the beacon message to its due (`0x186854`). */
export const BEACON_WAIT = 0x3c0;

/**
 * `0x32d74` for the destroyed `player` (module comment), with its events: the flush's page change and `radio-flushed`,
 * `player-loss-started`, then the page change of leaving the Warp view, as `warp-completed` precedes its own (MW-05).
 */
export function destroyPlayer(context: TickContext, player: Entity): void {
  const { world, time } = context;
  const { flow, player: state } = world;
  if (flow.mainState !== 3 || flow.subState === 2) return;
  const previousSubState = flow.subState;
  flow.subState = 2;
  flushRadio(context, 'player-destroyed');
  const previousViewMode = state.viewMode;
  // Unreachable in normal play: no key selects sub-mode 8, and the rescue resets the view.
  const viewSwitched = previousViewMode !== DESTRUCTION_VIEW_MODE || state.subMode !== DESTRUCTION_SUB_MODE;
  let page = null;
  if (viewSwitched) {
    state.viewMode = DESTRUCTION_VIEW_MODE;
    state.previousViewMode = DESTRUCTION_VIEW_MODE;
    state.subMode = DESTRUCTION_SUB_MODE;
    state.target = null;
    page = switchView(world, DESTRUCTION_VIEW_MODE, previousViewMode);
  }
  state.dockingObject = null;
  emit(context, { type: 'player-loss-started', tick: time.tick, playerEntityId: player.id, loss: 'destroyed', previousSubState, previousViewMode, viewSwitched });
  if (page !== null) emit(context, { type: 'left-page-changed', tick: time.tick, ...page, commandIndex: null });
}

/** `0x33464` after a depleted energy update of `player` (module comment): the beacon message, then `player-loss-started`. */
export function startBeaconWait(context: TickContext, player: Entity): void {
  const { world, time } = context;
  const { flow } = world;
  if (flow.mainState !== 3 || flow.subState !== 0) return;
  const deadlineClock = time.clock + BEACON_WAIT;
  if (!Number.isSafeInteger(deadlineClock)) throw new CoreFaultError('budget-exhausted', 'player-loss.beacon-due');
  emit(context, { type: 'flight-message', tick: time.tick, message: 'beacon' });
  flow.subState = 1;
  flow.beaconDeadline = deadlineClock;
  emit(context, { type: 'player-loss-started', tick: time.tick, playerEntityId: player.id, loss: 'energy', previousSubState: 0, deadlineClock });
}
