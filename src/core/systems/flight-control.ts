/**
 * Flight controls in the player's update and in request handling (docs/plan/p3/06/spec.md, 操纵, 速度与油门 and 行为与边界;
 * D-04, D-08; docs/original/formats/executable.md, flight controls and rotation and throttle, maximum speed and speed
 * matching, P3-06/02 and 03).
 *
 * The player's update (`0x25f90` in state 7 with the dead flag clear) runs at the start of the object update, where the
 * player comes first in the walk. It judges every command of the tick in array order, each with exactly one result,
 * and consumes the tick's axes as a digital stick: only an axis whose deflection differs from its last read is applied.
 * The throttle is not state: each throttle command posts a `control` request carrying its own throttle, read back from
 * the commanded speed as the requests posted before it will leave it. The axes' changes join the last command request
 * when it is a `control` request, or go in a request of their own, so a tick with at most one speed command posts as
 * many requests as the original posts messages. Request handling applies them in posting order (`0x21dd0`).
 *
 * The map and base contexts read no stick in the original, which keeps the steering applied before; Core takes their
 * manual axes as 0 instead, a deliberate difference (spec 技术决定 10). Core keeps no key or command across ticks.
 */
import type { CommandResultReason, DomainEvent } from '../contracts/domain-events.ts';
import type { Command, TickAxes, TickInput } from '../contracts/tick-input.ts';
import { CoreFaultError } from '../errors.ts';
import {
  applyIntegerControl,
  axisDeflection,
  controlApplies,
  decreasedThrottle,
  increasedThrottle,
  presetThrottle,
  throttleReadback,
  type AxisDeflections,
  type IntegerControl,
} from '../rules/flight-control.ts';
import { FULL_THROTTLE, throttleSpeed } from '../rules/flight-state.ts';
import { RandStream } from '../rules/original-random.ts';
import { ROTATION_AXES, type Entity, type EntityId, type RotationAxis } from '../world/entity-table.ts';
import { interactionContext, type InteractionContext, type PlayerControl } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';

/** Message 0x20000 (`0x21dd0`): the integer control path on an entity, with the values it had when posted. */
export interface ControlRequest extends IntegerControl {
  readonly type: 'control';
  readonly entityId: EntityId;
}

/** Where the player's update sends what it produces: the tick's events and its requests. */
export interface PlayerUpdateOutput {
  emit(event: DomainEvent): void;
  post(request: ControlRequest): void;
}

/**
 * The player entity whose update runs its controls: present, not destroyed and in state 7. Without one (none yet, not
 * yet active, destroyed, or in area-switch or pending removal) the player's commands are `player-unavailable`.
 */
export function availablePlayer(world: WorldState): Entity | null {
  const { entityId } = world.player;
  const entity = entityId === null ? undefined : world.entities.get(entityId);
  return entity !== undefined && !entity.destroyed && entity.state === 'active' ? entity : null;
}

const UNCHANGED_AXES: AxisDeflections = Object.freeze({ pitch: null, yaw: null, roll: null });

/**
 * What a command writes when P3-06 handles it in the flight context: a throttle, or a step up or down from the
 * readback; `undefined` when P3-06 does not handle the command there. `select-number` belongs to its context's own rule
 * in the base and map contexts (P3-10, P3-09); `match-target`, `toggle-auto-match` and `confirm-selection` to the speed
 * match (P3-06/13).
 */
function throttleCommand(command: Command, context: InteractionContext): number | 'increase' | 'decrease' | undefined {
  if (command.type === 'select-number') return context === 'base' || context === 'map' ? undefined : presetThrottle(command.value);
  if (command.type !== 'speed') return undefined;
  switch (command.operation) {
    case 'increase':
    case 'decrease':
      return command.operation;
    case 'zero':
      return 0;
    case 'maximum':
      return FULL_THROTTLE;
    default:
      return undefined;
  }
}

const commandResult = (tick: number, commandIndex: number, { type }: Command, outcome: 'rejected' | 'ignored', reason: CommandResultReason): DomainEvent =>
  ({ type: 'command-result', tick, commandIndex, commandType: type, outcome, reason });

/**
 * Judges the commands in array order. A throttle command needs an available player and the flight context, the only
 * one whose key handler (`0x264a0`) takes the throttle keys; `+` and `−` read back the commanded speed as the requests
 * posted before them leave it (the same rule as their application: a locked block keeps its commanded speed). Every
 * other command is not implemented yet.
 */
function judgeCommands(world: WorldState, { commands }: TickInput, tick: number, player: Entity | null, requests: ControlRequest[], emit: PlayerUpdateOutput['emit']): void {
  const context = interactionContext(world.player.viewMode);
  const record = player === null ? undefined : world.craftInfo.content.craft[player.kindBit];
  let commandedSpeed = player?.movement?.commandedSpeed ?? null;
  commands.forEach((command, commandIndex) => {
    const write = throttleCommand(command, context);
    if (write === undefined) return emit(commandResult(tick, commandIndex, command, 'rejected', 'not-implemented'));
    if (player === null) return emit(commandResult(tick, commandIndex, command, 'ignored', 'player-unavailable'));
    if (context !== 'flight') return emit(commandResult(tick, commandIndex, command, 'ignored', 'wrong-context'));
    const throttle = write === 'increase' ? increasedThrottle(throttleReadback(commandedSpeed, player.maximumSpeed))
      : write === 'decrease' ? decreasedThrottle(throttleReadback(commandedSpeed, player.maximumSpeed))
      : write;
    requests.push({ type: 'control', entityId: player.id, throttle, axes: UNCHANGED_AXES });
    if (controlApplies(player.movement, record)) commandedSpeed = throttleSpeed(throttle, player.maximumSpeed);
    emit({ type: 'command-result', tick, commandIndex, commandType: command.type, outcome: 'accepted', reason: null });
  });
}

/**
 * The deflections of the axes that changed since their last read, which they become; null when none changed. The map
 * and base contexts take every manual axis as 0, so entering them switches a held turn off and leaving them with neutral
 * input restores nothing. The flight and Warp contexts take the tick's axes.
 */
function changedAxes(world: WorldState, control: PlayerControl, axes: TickAxes): AxisDeflections | null {
  const context = interactionContext(world.player.viewMode);
  const manual = context !== 'map' && context !== 'base';
  const changes: Record<RotationAxis, number | null> = { pitch: null, yaw: null, roll: null };
  let changed = false;
  for (const axis of ROTATION_AXES) {
    const deflection = manual ? axisDeflection(axes[axis]) : 0;
    if (deflection === control.lastAxes[axis]) continue;
    control.lastAxes[axis] = deflection;
    changes[axis] = deflection;
    changed = true;
  }
  return changed ? Object.freeze(changes) : null;
}

/**
 * The player's update in the object update stage (spec D-08): the invalid-target drop, the speed assist, the commands
 * and the axes, in that order, then the requests in the order they were made.
 */
export function updatePlayer(world: WorldState, input: TickInput, tick: number, { emit, post }: PlayerUpdateOutput): void {
  const player = availablePlayer(world);
  const control = player && world.player.control;
  if (player !== null && control === null) throw new CoreFaultError('invariant-violated', 'flight-control.player-control');
  // The invalid-target drop (P3-06/13) comes first; then P3-07's missile lock `0x2ddbc`; then the speed assist (P3-06/13),
  // whose direct match the readback below sees and whose restoring request is posted before the commands' requests.
  const requests: ControlRequest[] = [];
  judgeCommands(world, input, tick, player, requests, emit);
  const axes = control && changedAxes(world, control, input.axes);
  if (player !== null && axes !== null) {
    const last = requests.at(-1);
    if (last?.type === 'control') requests[requests.length - 1] = { ...last, axes };
    else requests.push({ type: 'control', entityId: player.id, throttle: null, axes });
  }
  for (const request of requests) post(request);
  // P3-07's automatic target selection (`0x2799c`) ends the player's update.
}

/**
 * Request handling of a `control` request (`0x21dd0`) on its entity, which is still in the table: its draws come from
 * the world's RNG.
 */
export function applyControlRequest(world: WorldState, entity: Entity, request: ControlRequest): void {
  const rand = new RandStream(world.rngState);
  applyIntegerControl(entity.movement, world.craftInfo.content.craft[entity.kindBit], entity.maximumSpeed, request, rand);
  world.rngState = rand.state;
}
