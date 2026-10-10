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
 *
 * Before the commands, the update drops a target that no longer resolves and runs the speed assist (`0x27f68`), whose
 * match writes the block directly and whose restoring request goes before the commands' requests (匹配速度与速度辅助).
 * A manual match (`match-target`, or `confirm-selection` in flight) is a `match-speed` request instead, applied in
 * request handling (message 0x80000), so that same-tick speed commands keep their array order.
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
import { applySpeedMatch, isAssistKind, nextAssistDue, speedDifferenceExceeded, speedMatch, withinAssistRange } from '../rules/speed-match.ts';
import { ROTATION_AXES, type Entity, type EntityId, type RotationAxis, type SteeredMovementBlock } from '../world/entity-table.ts';
import { interactionContext, type InteractionContext, type PlayerControl, type SpeedAssist } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';

/** Message 0x20000 (`0x21dd0`): the integer control path on an entity, with the values it had when posted. */
export interface ControlRequest extends IntegerControl {
  readonly type: 'control';
  readonly entityId: EntityId;
}

/** Message 0x80000 (`0x21adc`) as the player's manual match posts it: the player matches its target's speed. */
export interface MatchSpeedRequest {
  readonly type: 'match-speed';
  readonly entityId: EntityId;
  readonly targetEntityId: EntityId;
  /** The command that asked for it, which the `speed-matched` event names. */
  readonly commandIndex: number;
}

/** A request the player's update posts. */
export type PlayerRequest = ControlRequest | MatchSpeedRequest;

/**
 * Where the player's update sends what it produces, the tick's events and its requests (`control` and `match-speed`),
 * and the judgement of every command it does not handle itself (commands.ts), which emits that command's one result
 * and posts its own requests.
 */
export interface PlayerUpdateOutput {
  emit(event: DomainEvent): void;
  post(request: PlayerRequest): void;
  judge(command: Command, commandIndex: number): void;
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

/** A craft's movement block, which is steered (docs/plan/p3/02/spec.md, CR-03), or null without one. */
function craftMovement({ movement }: Entity): SteeredMovementBlock | null {
  if (movement === null || movement.mode === 'craft' || movement.mode === 'warp') return movement;
  throw new CoreFaultError('invariant-violated', 'flight-control.movement');
}

const UNCHANGED_AXES: AxisDeflections = Object.freeze({ pitch: null, yaw: null, roll: null });

/** What P3-06 does for a command in the flight context: a throttle or a step from the readback, a match or a toggle. */
type FlightAction = number | 'increase' | 'decrease' | 'match' | 'toggle-assist';

/**
 * The action of a command that P3-06 handles in the current context; `undefined` when it does not. `select-number` and
 * `confirm-selection` belong to their context's own rule in the base and map contexts (P3-10, P3-09); in flight,
 * `confirm-selection` is the manual match (Enter).
 */
function flightAction(command: Command, context: InteractionContext): FlightAction | undefined {
  const own = context !== 'base' && context !== 'map';
  if (command.type === 'select-number') return own ? presetThrottle(command.value) : undefined;
  if (command.type === 'confirm-selection') return own ? 'match' : undefined;
  if (command.type !== 'speed') return undefined;
  switch (command.operation) {
    case 'increase':
    case 'decrease':
      return command.operation;
    case 'zero':
      return 0;
    case 'maximum':
      return FULL_THROTTLE;
    case 'match-target':
      return 'match';
    case 'toggle-auto-match':
      return 'toggle-assist';
  }
}

const commandResult = (tick: number, commandIndex: number, { type }: Command, outcome: 'rejected' | 'ignored', reason: CommandResultReason): DomainEvent =>
  ({ type: 'command-result', tick, commandIndex, commandType: type, outcome, reason });
const accepted = (tick: number, commandIndex: number, { type }: Command): DomainEvent =>
  ({ type: 'command-result', tick, commandIndex, commandType: type, outcome: 'accepted', reason: null });

/** The entity of the player's target, which the invalid-target drop has left either null or resolvable. */
const targetOf = (world: WorldState): Entity | undefined => (world.player.target === null ? undefined : world.entities.get(world.player.target));

/**
 * Ctrl+Enter: flips the one speed assist switch. Switching on makes it due at once and forgets the last match;
 * switching off leaves both.
 */
function toggleAssist(assist: SpeedAssist): void {
  assist.enabled = !assist.enabled;
  if (!assist.enabled) return;
  assist.dueClock = 0;
  assist.engaged = false;
}

/**
 * Judges the commands in array order. A P3-06 command needs an available player and the flight context, the only one
 * whose key handler (`0x264a0`) takes the throttle keys, Enter and Ctrl+Enter. `+` and `−` read back the commanded
 * speed as the requests posted before them leave it, by the same rules as their application: a locked block keeps its
 * commanded speed, which a match still writes. A match needs a target with a block, else it is `no-target`. Every other
 * command goes to `judge` in its place in the order.
 */
function judgeCommands(
  world: WorldState,
  { commands }: TickInput,
  tick: number,
  player: Entity | null,
  control: PlayerControl | null,
  requests: PlayerRequest[],
  emit: PlayerUpdateOutput['emit'],
  judge: PlayerUpdateOutput['judge'],
): void {
  const context = interactionContext(world.player.viewMode);
  const record = player === null ? undefined : world.craftInfo.content.craft[player.kindBit];
  let commandedSpeed = (player && craftMovement(player))?.commandedSpeed ?? null;
  for (const [commandIndex, command] of commands.entries()) {
    const action = flightAction(command, context);
    if (action === undefined) {
      judge(command, commandIndex);
      continue;
    }
    if (player === null || control === null) {
      emit(commandResult(tick, commandIndex, command, 'ignored', 'player-unavailable'));
      continue;
    }
    if (context !== 'flight') {
      emit(commandResult(tick, commandIndex, command, 'ignored', 'wrong-context'));
      continue;
    }
    if (action === 'toggle-assist') {
      toggleAssist(control.speedAssist);
      emit(accepted(tick, commandIndex, command));
      emit({ type: 'speed-assist-toggled', tick, commandIndex, enabled: control.speedAssist.enabled });
      continue;
    }
    if (action === 'match') {
      const target = targetOf(world);
      if (target === undefined || target.movement === null) {
        emit(commandResult(tick, commandIndex, command, 'ignored', 'no-target'));
        continue;
      }
      requests.push({ type: 'match-speed', entityId: player.id, targetEntityId: target.id, commandIndex });
      const block = craftMovement(player);
      const matched = speedMatch(block, record, player.maximumSpeed, target.movement);
      if (matched !== null && block?.mode === 'craft') commandedSpeed = matched;
      emit(accepted(tick, commandIndex, command));
      continue;
    }
    const throttle = action === 'increase' ? increasedThrottle(throttleReadback(commandedSpeed, player.maximumSpeed))
      : action === 'decrease' ? decreasedThrottle(throttleReadback(commandedSpeed, player.maximumSpeed))
      : action;
    requests.push({ type: 'control', entityId: player.id, throttle, axes: UNCHANGED_AXES });
    if (controlApplies(craftMovement(player), record)) commandedSpeed = throttleSpeed(throttle, player.maximumSpeed);
    emit(accepted(tick, commandIndex, command));
  }
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
 * The speed assist (`0x27f68`) while its switch is on, whatever the view: the autopilot is always off (G-09), so it
 * always takes the autopilot-off branch. Without a target, a match before is released once: full throttle through a
 * request of its own, returned to be posted before the commands' requests. With a target of an assist kind, due and in
 * range, it matches the speed directly, re-arms the timer from this clock and counts as engaged even when the write
 * fails for a missing block; only a written match emits `speed-matched`.
 */
function runSpeedAssist(world: WorldState, player: Entity, assist: SpeedAssist, tick: number, emit: PlayerUpdateOutput['emit']): ControlRequest | null {
  if (!assist.enabled) return null;
  const target = targetOf(world);
  if (target === undefined) {
    if (!assist.engaged) return null;
    assist.engaged = false;
    emit({ type: 'speed-assist-released', tick });
    return { type: 'control', entityId: player.id, throttle: FULL_THROTTLE, axes: UNCHANGED_AXES };
  }
  if (!isAssistKind(target.kindBit) || world.clock < assist.dueClock || !withinAssistRange(player.position, target.position)) return null;
  const block = craftMovement(player);
  const speedDifference = speedDifferenceExceeded(block?.speed ?? 0, target.movement?.speed ?? 0);
  const matched = applySpeedMatch(block, world.craftInfo.content.craft[player.kindBit], player.maximumSpeed, target.movement);
  assist.engaged = true;
  assist.dueClock = nextAssistDue(world.clock);
  if (matched) emit({ type: 'speed-matched', tick, targetEntityId: target.id, origin: 'assist', speedDifferenceExceeded: speedDifference });
  return null;
}

/**
 * The player's update in the object update stage (spec D-08): the invalid-target drop, the speed assist, the commands
 * and the axes, in that order, then the requests in the order they were made, the assist's first.
 */
export function updatePlayer(world: WorldState, input: TickInput, tick: number, { emit, post, judge }: PlayerUpdateOutput): void {
  const player = availablePlayer(world);
  const control = player && world.player.control;
  if (player !== null && control === null) throw new CoreFaultError('invariant-violated', 'flight-control.player-control');
  if (player !== null && control !== null) {
    // The original drops a handle whose object is gone; a removed entity's ID never resolves again.
    if (world.player.target !== null && targetOf(world) === undefined) world.player.target = null;
    // P3-07's missile lock `0x2ddbc` goes here, between the drop and the assist.
    const restoring = runSpeedAssist(world, player, control.speedAssist, tick, emit);
    if (restoring !== null) post(restoring);
  }
  const requests: PlayerRequest[] = [];
  judgeCommands(world, input, tick, player, control, requests, emit, judge);
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
  applyIntegerControl(craftMovement(entity), world.craftInfo.content.craft[entity.kindBit], entity.maximumSpeed, request, rand);
  world.rngState = rand.state;
}

/**
 * Request handling of a `match-speed` request (`0x21adc`) on its entity, which is still in the table: nothing when the
 * target no longer resolves or either has no block; a written match emits `speed-matched` for its command. The lock does
 * not stop it.
 */
export function applyMatchRequest(world: WorldState, entity: Entity, request: MatchSpeedRequest, tick: number, emit: PlayerUpdateOutput['emit']): void {
  const target = world.entities.get(request.targetEntityId);
  if (target === undefined) return;
  if (!applySpeedMatch(craftMovement(entity), world.craftInfo.content.craft[entity.kindBit], entity.maximumSpeed, target.movement)) return;
  emit({ type: 'speed-matched', tick, targetEntityId: target.id, origin: 'command', commandIndex: request.commandIndex });
}
