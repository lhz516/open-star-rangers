/**
 * The strategic map's mode (docs/plan/p3/02/spec.md, MW-04, MW-05, MW-09; docs/original/formats/executable.md, map
 * mode and its commands): the judgement of `toggle-map` in the command batch and its `map-toggle` request in request
 * handling. The cursor's selection and the marker (`map-point`) are added by P3-09/14.
 *
 * An accepted `toggle-map` moves the command view (pipeline.ts) at once, so that the commands after it are judged in
 * the context it leaves, and posts a request that commits the switch in request handling, in posting order with the
 * other requests (dispatcher message 0x400, sub-commands 8 and 9). The original's opening also requires the campaign
 * flag (`0x33504`); Core runs only the campaign slice, so that check always passes and has no reason code.
 */
import { CoreFaultError } from '../errors.ts';
import { interactionContext } from '../world/player-state.ts';
import { emitCommandResult, type CommandOf } from './commands.ts';
import { availablePlayer } from './flight-control.ts';
import { emit, type CommandView, type TickContext } from './pipeline.ts';
import { MAP_VIEW_MODE, switchView } from './view-switch.ts';

/** Message 0x400 sub-command 8 (opening) or 9 (closing), whichever the committed view calls for when it is applied. */
export interface MapToggleRequest {
  readonly type: 'map-toggle';
  readonly commandIndex: number;
}

/**
 * The view after a toggle from `view`: closing swaps the map with the previous view mode, which returns from a map
 * opened in the base to the base; opening saves the view mode as the previous one.
 */
function toggledView({ viewMode, previousViewMode }: CommandView): CommandView {
  return viewMode === MAP_VIEW_MODE
    ? { viewMode: previousViewMode, previousViewMode: MAP_VIEW_MODE }
    : { viewMode: MAP_VIEW_MODE, previousViewMode: viewMode };
}

/**
 * Judges `toggle-map` in the command view, in this order (MW-04): in the map it is accepted, closing it, without
 * checking the player, so that a map can always be closed (an approved difference, MW-12 difference 8: the original
 * never has an unavailable player in the map); otherwise an unavailable player gives `player-unavailable`,
 * the Warp context (whose keys have no `m`) `wrong-context`, and flight or the base accept it, opening the map.
 */
export function judgeToggleMap(context: TickContext, command: CommandOf<'toggle-map'>, commandIndex: number): void {
  const view = context.commandView;
  const current = interactionContext(view.viewMode);
  const reason = current === 'map' ? null : availablePlayer(context.world) === null ? 'player-unavailable' : current === 'warp' ? 'wrong-context' : null;
  if (reason !== null) {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason });
    return;
  }
  Object.assign(view, toggledView(view));
  context.requests.post({ type: 'map-toggle', commandIndex });
  emitCommandResult(context, command, commandIndex, { outcome: 'accepted', reason: null });
}

/**
 * Request handling of a `map-toggle`, without judging it again: closes the map when the committed view mode is 8,
 * otherwise opens it and puts the cursor at its start pixel. Neither writes the left display, the status display's
 * redraw or the player's target, so closing into the base keeps the target. The switch has no rule effect of its own
 * (view-switch.ts); emits `map-toggled`.
 */
export function applyMapToggle(context: TickContext, { commandIndex }: MapToggleRequest): void {
  const { world } = context;
  const { player } = world;
  const oldMode = player.viewMode;
  const next = toggledView(player);
  Object.assign(player, next);
  const open = next.viewMode === MAP_VIEW_MODE;
  if (open) player.map.cursor = world.ruleData.map.startPixel;
  // A map toggle never enters or leaves the Warp view, the only switch that changes the page.
  if (switchView(world, next.viewMode, oldMode) !== null) throw new CoreFaultError('invariant-violated', 'map.view-switch');
  emit(context, { type: 'map-toggled', tick: context.time.tick, open, viewMode: next.viewMode, previousViewMode: next.previousViewMode, commandIndex });
}
