/**
 * The strategic map (docs/plan/p3/02/spec.md, MW-03 to MW-05, MW-07, MW-09; docs/original/formats/executable.md, map
 * mode and its commands; cursor, destination and marker): the judgement of `toggle-map` and `map-point` in the command
 * batch, their `map-toggle` and `map-point` requests in request handling (the cursor, the Warp destination and the
 * kind-25 marker), and the frame end's map step, which builds the icon list the next tick's selects pick from.
 *
 * An accepted `toggle-map` moves the command view (pipeline.ts) at once, so that the commands after it are judged in
 * the context it leaves, and posts a request that commits the switch in request handling, in posting order with the
 * other requests (dispatcher message 0x400, sub-commands 8 and 9). The original's opening also requires the campaign
 * flag (`0x33504`); Core runs only the campaign slice, so that check always passes and has no reason code.
 */
import type { Vec3, WarpMarkerChange } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { quantiseMapPoint } from '../rules/map-frame.ts';
import { buildMapIcons, selectDestination } from '../rules/map-icons.ts';
import { RandStream } from '../rules/original-random.ts';
import { drawStartupRotation } from '../rules/startup-rotations.ts';
import { MARKER_KIND_BIT, markerInit, type Entity } from '../world/entity-table.ts';
import type { MapPixel } from '../world/map-rule-data.ts';
import { interactionContext } from '../world/player-state.ts';
import type { MapIcon, WorldState } from '../world/world-state.ts';
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
type ViewModes = Pick<CommandView, 'viewMode' | 'previousViewMode'>;

function toggledView({ viewMode, previousViewMode }: ViewModes): ViewModes {
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

/** Message 0x1000 with the left button (select) or without (hover), at a quantised cursor pixel (MW-04). */
export interface MapPointRequest {
  readonly type: 'map-point';
  readonly operation: 'hover' | 'select';
  readonly pixel: MapPixel;
  readonly commandIndex: number;
}

/**
 * A select's destination at `pixel` from the last map frame's icon list (map-icons.ts). The list changes only at the
 * frame end, so a command's judgement and its request see the same result.
 */
const selectedDestination = ({ ruleData, mapIcons }: WorldState, pixel: MapPixel) => selectDestination(ruleData.map, mapIcons, pixel);

/**
 * Judges `map-point` in the command view (MW-04): an unavailable player gives `player-unavailable`, a context other than
 * the map `wrong-context`; otherwise it is accepted at its quantised pixel and posts a `map-point` request. An accepted
 * select also becomes the command view's destination, which a later `request-warp` in the batch reads.
 */
export function judgeMapPoint(context: TickContext, command: CommandOf<'map-point'>, commandIndex: number): void {
  const { world, commandView } = context;
  const reason = availablePlayer(world) === null ? 'player-unavailable' : interactionContext(commandView.viewMode) !== 'map' ? 'wrong-context' : null;
  if (reason !== null) {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason });
    return;
  }
  const pixel = quantiseMapPoint(world.ruleData.map.side, command.right, command.down);
  if (command.operation === 'select') commandView.destination = selectedDestination(world, pixel).destination;
  context.requests.post({ type: 'map-point', operation: command.operation, pixel, commandIndex });
  emitCommandResult(context, command, commandIndex, { outcome: 'accepted', reason: null });
}

/** The kind mask of the map marker, kind bit 25. */
const MARKER_KINDS = 1 << MARKER_KIND_BIT;

/** The first entity of the marker's kind, `0x5261c`'s first visit. */
function firstMarker(world: WorldState): Entity | undefined {
  for (const marker of world.entities.walk(MARKER_KINDS)) return marker;
  return undefined;
}

/**
 * `0x3cb80`: allocates the marker at the destination with one world draw, its attitude startup rotation rand % 64
 * (`0x56cd4`). A world holds at most one marker, created by its first select.
 */
function createMarker(world: WorldState, destination: Vec3): WarpMarkerChange {
  if (firstMarker(world) !== undefined) throw new CoreFaultError('invariant-violated', 'map.marker');
  const rand = new RandStream(world.rngState);
  const orientation = drawStartupRotation(world.ruleData.startupRotations, rand);
  world.rngState = rand.state;
  return { type: 'created', entityId: world.entities.allocate(markerInit(destination, orientation)).id };
}

/**
 * A later select moves the first kind-25 entity to the destination whatever its state or activity, a discontinuous
 * move; without one (Likely unreachable: only the teardown removes it) the marker is missing and is not created again.
 */
function moveMarker(world: WorldState, destination: Vec3): WarpMarkerChange {
  const marker = firstMarker(world);
  if (marker === undefined) return { type: 'missing' };
  marker.position = destination;
  marker.placementSerial++;
  return { type: 'moved', entityId: marker.id };
}

/**
 * Request handling of a `map-point`, without judging it again (`0x2b9bc` from message 0x1000): the cursor takes the
 * pixel, which is all a hover does. A select then sets the destination (selectedDestination), creates the marker when
 * there was no destination before or moves it otherwise, and emits `warp-destination-set`, at an unchanged point too
 * (the click sound of every left-button read).
 */
export function applyMapPoint(context: TickContext, { operation, pixel, commandIndex }: MapPointRequest): void {
  const { world } = context;
  const { player } = world;
  player.map.cursor = pixel;
  if (operation === 'hover') return;
  // The player's own update posted the request, and nothing posted before it in the tick removes the player.
  if (player.entityId === null) throw new CoreFaultError('invariant-violated', 'map.player');
  const { destination, icon } = selectedDestination(world, pixel);
  const hadDestination = player.map.destination !== null;
  player.map.destination = destination;
  const marker = hadDestination ? moveMarker(world, destination) : createMarker(world, destination);
  emit(context, {
    type: 'warp-destination-set',
    tick: context.time.tick,
    playerEntityId: player.entityId,
    destination,
    pixel,
    icon: icon === null ? null : { entityId: icon.entityId, kindBit: icon.kindBit },
    marker,
    commandIndex,
  });
}

const NO_ICONS: readonly MapIcon[] = Object.freeze([]);

/**
 * The map step of the frame end (MW-07), before the cockpit display step: with the committed view in the map, the icon
 * list of this tick's map contacts (map-icons.ts), which the next tick's selects read; in any other view, no icons.
 */
export function runMapStep({ world }: TickContext): void {
  world.mapIcons = world.player.viewMode === MAP_VIEW_MODE ? buildMapIcons(world) : NO_ICONS;
}
