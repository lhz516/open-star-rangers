/**
 * The player's Warp start (docs/plan/p3/02/spec.md, MW-04, MW-05, MW-09 and MW-12; docs/original/formats/executable.md,
 * Warp cost and Warp start, and the Warp set-up): the judgement of `request-warp` in the command batch and its
 * `warp-start` request in request handling, which commits `0x2be00`, the dispatcher's view write, `0x3f158(1, old)` and
 * the set-up `0x50188`. The original refuses silently, with no sound, text or page: a refusal here is `ignored` and
 * changes nothing (MW-12 difference 7: the original's refusal for energy also overwrites the Warp origin, which has no
 * reader before the next accepted start). The start writes no energy, no `warpClock` and no status-display redraw; the
 * Warp's charge and interval are the completion's.
 */
import type { CommandResultReason } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { RandStream } from '../rules/original-random.ts';
import { warpStartCheck, type WarpCheck } from '../rules/warp-energy.ts';
import { evaluateWarpPath, setUpWarpPath, transitLength } from '../rules/warp-path.ts';
import type { Entity, SteeredMovementBlock } from '../world/entity-table.ts';
import { interactionContext } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { emitCommandResult, type CommandOf } from './commands.ts';
import { availablePlayer } from './flight-control.ts';
import { emit, type CommandView, type TickContext } from './pipeline.ts';
import { BASE_VIEW_MODE, switchView, WARP_VIEW_MODE } from './view-switch.ts';

/** Message 0x400 sub-command 0, posted by an accepted `request-warp` (MW-04). */
export interface WarpStartRequest {
  readonly type: 'warp-start';
  readonly commandIndex: number;
}

/** The reasons a Warp request is refused, in the gate table's order. */
export type WarpRefusal = Extract<CommandResultReason, 'player-unavailable' | 'wrong-context' | 'no-destination' | 'cooldown' | 'insufficient-energy'>;

/** The clock units per second of the interval check: craft +0xA4 `SHL` 6. */
const INTERVAL_UNITS_PER_SECOND = 64;

/** The player's craft-record fields the start reads. */
const playerRecord = (world: WorldState, player: Entity) => {
  const record = world.craftInfo.content.craft[player.kindBit];
  if (record === undefined) throw new CoreFaultError('invariant-violated', 'warp.record');
  return record;
};

/** The player's `combat.energy` (i32), E of the energy gate. */
function playerEnergy(player: Entity): number {
  if (player.combat.type !== 'craft') throw new CoreFaultError('invariant-violated', 'warp.combat');
  return player.combat.energy;
}

/** `0x2be00` step 1: refused while +0xC8 ≠ 0 and +0xC8 + 64 × +0xA4 > clock; equality passes. */
const coolingDown = (warpClock: number, intervalSeconds: number, clock: number): boolean =>
  warpClock !== 0 && warpClock + INTERVAL_UNITS_PER_SECOND * intervalSeconds > clock;

/**
 * The gate table of `request-warp` (MW-04), in order, judged in `view` at `clock`: an unavailable player; the Warp and
 * base contexts, whose keys have no `w`; a map opened from the base (previous view 6); no destination; the interval;
 * then the energy check c ≤ E, an exactly affordable cost passing. Returns the refusal, or the check of an accepted
 * request. A zero distance (c = 0) passes, and the marker is never read. The command batch judges it in the command
 * view; a reader may judge it in the committed view without changing anything.
 */
export function judgeWarpRequest(world: WorldState, view: Readonly<CommandView>, clock: number): WarpRefusal | WarpCheck {
  const player = availablePlayer(world);
  if (player === null) return 'player-unavailable';
  const context = interactionContext(view.viewMode);
  if (context === 'warp' || context === 'base') return 'wrong-context';
  if (context === 'map' && view.previousViewMode === BASE_VIEW_MODE) return 'wrong-context';
  if (view.destination === null) return 'no-destination';
  const record = playerRecord(world, player);
  if (coolingDown(player.warpClock, record.atA4, clock)) return 'cooldown';
  const check = warpStartCheck(record.pairs, player.position, view.destination, playerEnergy(player));
  return check.affordable ? check : 'insufficient-energy';
}

/**
 * Judges `request-warp` in the command view (MW-04): a refusal is `ignored` with its reason; an accepted request moves
 * the command view into the Warp view, so that the commands after it, a second `request-warp` included, are judged in
 * the Warp context, and holds the `warp-start` request. Its release follows P3-06's `control` and `match-speed` requests
 * and the player's launches judged before it, before the automatic target selection (pipeline.ts): the effects of the
 * batch's earlier commands apply before the Warp set-up overwrites speed and pose (MW-12 difference 9; in the original
 * one key per poll puts them in earlier frames).
 */
export function judgeRequestWarp(context: TickContext, command: CommandOf<'request-warp'>, commandIndex: number): void {
  const view = context.commandView;
  const judgement = judgeWarpRequest(context.world, view, context.time.clock);
  if (typeof judgement === 'string') {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: judgement });
    return;
  }
  view.previousViewMode = view.viewMode;
  view.viewMode = WARP_VIEW_MODE;
  context.requests.defer({ type: 'warp-start', commandIndex });
  emitCommandResult(context, command, commandIndex, { outcome: 'accepted', reason: null });
}

/** The player's movement block, which a craft in flight always has and which is steered. */
function steeredBlock({ movement }: Entity): SteeredMovementBlock {
  if (movement === null || (movement.mode !== 'craft' && movement.mode !== 'warp')) throw new CoreFaultError('invariant-violated', 'warp.movement');
  return movement;
}

/**
 * Request handling of a `warp-start`, without judging it again (MW-04): nothing applied before it in the tick changes
 * the gate's inputs (a throttle, match or launch leaves the position, energy and destination), so the check it
 * recomputes for `warp-started` still passes. In order:
 *
 * 1. `0x2be00`: the origin is the player's position; `inWarp`; the player's target cleared without `target-changed`
 *    (CR-09); the block in mode 3; the transit length.
 * 2. The view write and `0x3f158(1, old)`: the previous view mode is the view mode, which becomes 1; the left page is
 *    saved and page 6 shown (view-switch.ts).
 * 3. `0x50188`: the tunnel path with 20 world draws; the player at the path's pose at segment 1, parameter 0, a
 *    constant identity pose at (0, 0, 10000) in the path's frame, with a new placement; the block not at its
 *    commanded speed, speed 0, commanded speed craft +0xB8; the previous path frame G at the same pose; s, a, c := 0,
 *    n := 1, u := 0; the next serial.
 * 4. `warp-started`, then the page's `left-page-changed` without a command.
 */
export function applyWarpStart(context: TickContext, { commandIndex }: WarpStartRequest): void {
  const { world } = context;
  const { player: state } = world;
  const player = state.entityId === null ? undefined : world.entities.get(state.entityId);
  const destination = state.map.destination;
  // The player's own update posted the request, and nothing posted before it in the tick removes the player.
  if (player === undefined || destination === null) throw new CoreFaultError('invariant-violated', 'warp.start');
  const record = playerRecord(world, player);
  const check = warpStartCheck(record.pairs, player.position, destination, playerEnergy(player));
  if (!check.affordable) throw new CoreFaultError('invariant-violated', 'warp.start-check');
  const block = steeredBlock(player);

  const origin = player.position;
  player.inWarp = true;
  state.target = null;
  block.mode = 'warp';
  const length = transitLength(check.distance, record.atA8);

  const fromViewMode = state.viewMode;
  state.previousViewMode = fromViewMode;
  state.viewMode = WARP_VIEW_MODE;
  const page = switchView(world, WARP_VIEW_MODE, fromViewMode);

  const rand = new RandStream(world.rngState);
  const path = setUpWarpPath(rand);
  world.rngState = rand.state;
  const pose = evaluateWarpPath(path, 0);
  player.position = pose.position;
  player.orientation = pose.orientation;
  player.placementSerial++;
  block.atCommandedSpeed = false;
  block.speed = 0;
  block.commandedSpeed = record.atB8;
  const serial = (state.warp?.serial ?? 0) + 1;
  state.warp = { serial, origin, length, segments: 1, fraction: 0, error: 0, angle: 0, centring: 0, frame: pose, path };

  const { tick } = context.time;
  emit(context, {
    type: 'warp-started',
    tick,
    playerEntityId: player.id,
    serial,
    origin,
    destination,
    distance: check.distance,
    check: { cost: check.cost, energy: check.energy },
    transitLength: length,
    fromViewMode,
    commandIndex,
  });
  if (page !== null) emit(context, { type: 'left-page-changed', tick, ...page, commandIndex: null });
}
