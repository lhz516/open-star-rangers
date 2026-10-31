/**
 * The player's Warp (docs/plan/p3/02/spec.md, MW-04, MW-05, MW-07 to MW-10 and MW-12; docs/original/formats/executable.md,
 * Warp cost and Warp start, Warp progress, completion and interruptions):
 *
 * - **Start:** the judgement of `request-warp` in the command batch and its `warp-start` request in request handling,
 *   which commits `0x2be00`, the dispatcher's view write, `0x3f158(1, old)` and the set-up `0x50188`. The original
 *   refuses silently, with no sound, text or page: a refusal here is `ignored` and changes nothing (MW-12 difference 7:
 *   the original's refusal for energy also overwrites the Warp origin, which has no reader before the next accepted
 *   start). The start writes no energy, no `warpClock` and no status-display redraw.
 * - **Step** (`frame-end`, `0x50508` with `0x50a28`): once per tick in view 1 with a player entity, before the cockpit
 *   display step; the original's per-frame increments run once per tick (MW-12 difference 3).
 * - **Completion** (`warp-completion`, `0x2bf08`): in view 1, on the progress the previous `frame-end` left (or the
 *   start's reset, so a transit length ≤ 1 completes in the start's tick); it restores the view and page and, with a
 *   player entity, places the arrival, charges and emits `warp-completed` once.
 *
 * No rule cancels a Warp. P3-11's destruction and rescue leave view 1 through view-switch.ts: the step and the
 * completion then no longer run, so the Warp is abandoned with no arrival, no charge and `warpClock` unchanged, and
 * `inWarp` stays set until the next completed Warp (MW-09, reproduced), which keeps the active area on the destination
 * (MW-10). The dispatcher's sub-command 2, which would end a Warp from view 2, has no sender and no entry here.
 * View 1 without a transit is unreachable (only a start enters it); the step and the completion leave it alone.
 */
import type { CommandResultReason, WarpArrival } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import { motionStep } from '../rules/flight-motion.ts';
import { RandStream } from '../rules/original-random.ts';
import { drawStartupRotation } from '../rules/startup-rotations.ts';
import { ENEMY_KINDS } from '../rules/targeting.ts';
import { arrivalPoint, isHostileNear, snapToNearest, SNAP_KINDS, warpInterval } from '../rules/warp-arrival.ts';
import { warpCharge, warpDistance, warpStartCheck, type WarpCheck } from '../rules/warp-energy.ts';
import { evaluateWarpPath, setUpWarpPath, stepWarp, transitLength, warpProgress } from '../rules/warp-path.ts';
import type { CraftCombat, Entity, SteeredMovementBlock } from '../world/entity-table.ts';
import { COCKPIT_VIEW_MODE, interactionContext, type WarpTransit } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { emitCommandResult, type CommandOf } from './commands.ts';
import { availablePlayer } from './flight-control.ts';
import { emit, type CommandView, type Request, type RequestOf, type TickContext } from './pipeline.ts';
import { BASE_VIEW_MODE, commitViewSwitch, MAP_VIEW_MODE, WARP_VIEW_MODE } from './view-switch.ts';

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

/** The player's craft combat, whose `energy` (i32) is E of the energy gate and of the charge. */
function craftCombat({ combat }: Entity): CraftCombat {
  if (combat.type !== 'craft') throw new CoreFaultError('invariant-violated', 'warp.combat');
  return combat;
}

/** `0x2be00` step 1: refused while +0xC8 ≠ 0 and +0xC8 + 64 × +0xA4 > clock; equality passes. */
const coolingDown = (warpClock: number, intervalSeconds: number, clock: number): boolean =>
  warpClock !== 0 && warpClock + INTERVAL_UNITS_PER_SECOND * intervalSeconds > clock;

/**
 * The gate table of `request-warp` (MW-04), in order, judged in `view` at `clock`: an unavailable player; a player
 * `dock` or `depart` still pending in the tick (`transitionPending`, step 1a); the Warp and base contexts, whose keys
 * have no `w`; a map opened from the base (previous view 6); no destination; the interval; then the energy check
 * c ≤ E, an exactly affordable cost passing. Returns the refusal, or the check of an accepted request. A zero distance
 * (c = 0) passes, and the marker is never read. The command batch judges it in the command view; a reader may judge
 * it in the committed view without changing anything, outside a tick, where nothing is pending.
 */
export function judgeWarpRequest(world: WorldState, view: Readonly<CommandView>, clock: number, transitionPending: boolean): WarpRefusal | WarpCheck {
  const player = availablePlayer(world);
  if (player === null) return 'player-unavailable';
  if (transitionPending) return 'wrong-context';
  const context = interactionContext(view.viewMode);
  if (context === 'warp' || context === 'base') return 'wrong-context';
  if (context === 'map' && view.previousViewMode === BASE_VIEW_MODE) return 'wrong-context';
  if (view.destination === null) return 'no-destination';
  const record = playerRecord(world, player);
  if (coolingDown(player.warpClock, record.atA4, clock)) return 'cooldown';
  const check = warpStartCheck(record.pairs, player.position, view.destination, craftCombat(player).energy);
  return check.affordable ? check : 'insufficient-energy';
}

/**
 * The player's docking or launch that request handling has not applied yet (CB-08): sub-state 4's `dock`, sub-state 5's
 * automatic `depart` and an accepted launch key's. Only the player is ever their subject. Either changes the view, the
 * activity or the position the Warp would be judged on, so a `request-warp` judged with one pending is refused (MW-04
 * step 1a). The queue, not the sub-state, is read: a code 9 in the batch sets sub-state 3 with the docking still
 * pending, and the automatic launch has already set 0.
 */
const isPlayerTransition = (request: Request): request is RequestOf<'dock' | 'depart'> => request.type === 'dock' || request.type === 'depart';

/**
 * Judges `request-warp` in the command view (MW-04): a refusal is `ignored` with its reason; an accepted request moves
 * the command view into the Warp view, so that the commands after it, a second `request-warp` included, are judged in
 * the Warp context, and holds the `warp-start` request. Its release follows P3-06's `control` and `match-speed` requests
 * and the player's launches judged before it, before the automatic target selection (pipeline.ts): the effects of the
 * batch's earlier commands apply before the Warp set-up overwrites speed and pose (MW-12 difference 9; in the original
 * one key per poll puts them in earlier frames). A refusal for a pending docking or launch (step 1a) is a project
 * difference, not the original's same-frame order (MW-04): the transition applies as it would without the request.
 */
export function judgeRequestWarp(context: TickContext, command: CommandOf<'request-warp'>, commandIndex: number): void {
  const view = context.commandView;
  const transitionPending = context.requests.findLastPending(isPlayerTransition) !== undefined;
  const judgement = judgeWarpRequest(context.world, view, context.time.clock, transitionPending);
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
 * the gate's inputs (a throttle, match or launch leaves the position, energy and destination; a pending player `dock`
 * or `depart`, which would, refuses the request at step 1a), so the check it recomputes for `warp-started` still
 * passes. In order:
 *
 * 1. `0x2be00`: the origin is the player's position; `inWarp`; the player's target cleared without `target-changed`
 *    (CR-09); the block in mode 3; the transit length.
 * 2. The view write and `0x3f158(1, old)`: the previous view mode is the view mode, which becomes 1; the left page is
 *    saved and page 6 shown; `view-switched` at the pose before the set-up (view-switch.ts).
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
  const check = warpStartCheck(record.pairs, player.position, destination, craftCombat(player).energy);
  if (!check.affordable) throw new CoreFaultError('invariant-violated', 'warp.start-check');
  const block = steeredBlock(player);

  const origin = player.position;
  player.inWarp = true;
  state.target = null;
  block.mode = 'warp';
  const length = transitLength(check.distance, record.atA8);

  const fromViewMode = state.viewMode;
  const page = commitViewSwitch(context, WARP_VIEW_MODE, fromViewMode);

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

/** The player entity, when it exists. */
const playerEntity = ({ player, entities }: WorldState): Entity | undefined => (player.entityId === null ? undefined : entities.get(player.entityId));

/** The transit the step and the completion act on: view 1 committed and a Warp started. */
function transitInView(world: WorldState): WarpTransit | null {
  return world.player.viewMode === WARP_VIEW_MODE ? world.player.warp : null;
}

/**
 * The Warp step of `frame-end` (MW-07): in view 1 with a player entity, one `0x50508`/`0x50a28` pass (warp-path.ts's
 * stepWarp) at the block's speed after this tick's movement and this tick's step: the transit's u, n, path (2 world
 * draws per completed segment), a, c, s and G, and the player's position and rows. The placement is unchanged: the
 * pose is continuous. A wall contact inside the error's window emits `warp-wall-contact` (FS-03), before the cockpit
 * display step's events.
 */
export function runWarpStep(context: TickContext): void {
  const { world } = context;
  const transit = transitInView(world);
  const player = playerEntity(world);
  if (transit === null || player === undefined) return;
  const record = playerRecord(world, player);
  const { seconds } = motionStep(world.config.clockUnitsPerTick, world.clock);
  const rand = new RandStream(world.rngState);
  const step = stepWarp(transit, player, steeredBlock(player).speed, seconds, record.atB8, rand);
  world.rngState = rand.state;
  player.position = step.pose.position;
  player.orientation = step.pose.orientation;
  Object.assign(transit, step.transit);
  if (step.wallContact) emit(context, { type: 'warp-wall-contact', tick: context.time.tick, serial: transit.serial });
}

/**
 * Completion steps 3–9 for an existing player entity (MW-08): the position at the destination (so the player is a snap
 * candidate there); the arrival point with draw 1; the snap; the position with a new placement; draw 2, the start-up
 * rotation; D from the arrival to the origin; the interval base; the block back in mode 0 at the maximum speed; the
 * charge, without the depletion handler; `inWarp` cleared; `0x3c040`.
 */
function arrive(world: WorldState, player: Entity, transit: WarpTransit): WarpArrival {
  const destination = world.player.map.destination;
  // A start needs a destination, and only the player's instantiation clears it.
  if (destination === null) throw new CoreFaultError('invariant-violated', 'warp.arrival-destination');
  const record = playerRecord(world, player);
  const { error, origin } = transit;
  player.position = destination;
  const rand = new RandStream(world.rngState);
  const { position, snapped } = snapToNearest(arrivalPoint(destination, error, world.config.group, rand), world.entities.walk(SNAP_KINDS));
  player.position = position;
  player.placementSerial++;
  player.orientation = drawStartupRotation(world.ruleData.startupRotations, rand);
  world.rngState = rand.state;

  const distance = Math.fround(warpDistance(position, origin));
  player.warpClock = world.clock + warpInterval(distance, record.atA4);
  const block = steeredBlock(player);
  block.mode = 'craft';
  block.atCommandedSpeed = true;
  block.speed = player.maximumSpeed;
  block.commandedSpeed = player.maximumSpeed;
  const combat = craftCombat(player);
  const charge = warpCharge(record.pairs, distance, combat.energy, error);
  combat.energy = charge.energyAfter;
  player.inWarp = false;
  return {
    playerEntityId: player.id,
    origin,
    destination,
    position,
    orientation: player.orientation,
    error,
    snapped: snapped?.id ?? null,
    charge,
    warpClock: player.warpClock,
    hostileNear: isHostileNear(position, record.at0C, world.entities.walk(ENEMY_KINDS)),
  };
}

/**
 * The `warp-completion` stage (`0x2bf08`; MW-08): in view 1 when the progress is 1.0. The view returns to the previous
 * one (the map as 0xC), the previous view becomes 1 and view-switch.ts restores the saved page; with a player entity
 * the arrival follows. `warp-completed` comes once per Warp, after the switch's `view-switched` (at the pose before
 * the arrival) and before the page's `left-page-changed`. Nothing of the transit, the destination, the marker or the target is written: the next start resets the transit.
 */
export function completeWarp(context: TickContext): void {
  const { world } = context;
  const transit = transitInView(world);
  if (transit === null || warpProgress(transit) !== 1) return;
  const { player: state } = world;
  const viewMode = state.previousViewMode === MAP_VIEW_MODE ? COCKPIT_VIEW_MODE : state.previousViewMode;
  const page = commitViewSwitch(context, viewMode, WARP_VIEW_MODE);
  const player = playerEntity(world);
  const arrival = player === undefined ? null : arrive(world, player, transit);
  const { tick } = context.time;
  emit(context, { type: 'warp-completed', tick, serial: transit.serial, viewMode, previousViewMode: WARP_VIEW_MODE, arrival });
  if (page !== null) emit(context, { type: 'left-page-changed', tick, ...page, commandIndex: null });
}
