/**
 * Targeting (docs/plan/p3/02/spec.md, CR-05, CR-06, CR-07 and CR-10; docs/original/formats/executable.md, T1–T5 and
 * T7): the `target` command, the `select-target` request (message 2), the automatic selection at the end of the
 * player's update, the right display's target clearing at the end of the frame, and the reference target the target and
 * weapon commands share. The candidates and their arithmetic are rules/targeting.ts's.
 *
 * Timing (T3): the command and the automatic selection judge their candidates at once, on the positions the previous
 * movement left, and write the mode at once (`enemy`, `friendly`, `forward` and the automatic selection; `next` and
 * `previous` never). The target changes only when request handling applies their `select-target` request, in posting
 * order and without checking it again, emitting `target-changed` for each. A command judges against the reference
 * target, so that several target commands in one tick behave as the original's keys in successive frames; the automatic
 * selection looks at the actual target instead. A command that finds no candidate, or only the reference target, writes
 * nothing, the mode included (T4).
 *
 * Clearing a target emits `target-changed` never. The right display's clearing emits `target-cleared`; the player's
 * update (P3-06) drops an invalid target and parking or removal clear it without an event, and the Warp start, the base
 * view and the destruction view clear it in their own tasks (CR-09).
 */
import { CoreFaultError } from '../errors.ts';
import {
  ENEMY_KINDS, FORWARD_KINDS, fartherCandidate, forwardCandidate, forwardMode, modeKinds, nearerCandidate,
} from '../rules/targeting.ts';
import type { Entity, EntityId } from '../world/entity-table.ts';
import type { PlayerState, PlayerTargeting } from '../world/player-state.ts';
import type { WorldState } from '../world/world-state.ts';
import { combatCommandPlayer, emitCommandResult, type CommandOf } from './commands.ts';
import { emit, type Request, type RequestOf, type TickContext } from './pipeline.ts';

/** Controller +0x1A8: the automatic selection runs again only once the clock is strictly past the check plus this. */
export const AUTOMATIC_TARGET_INTERVAL = 0x40;
/** The base interior's view mode, in which the right display clears the target. */
const BASE_VIEW_MODE = 6;

const ACCEPTED = Object.freeze({ outcome: 'accepted', reason: null } as const);

/** The player's targeting state, which exists exactly while a player entity does (CR-04). */
function playerTargeting({ player }: WorldState): PlayerTargeting {
  if (player.targeting === null) throw new CoreFaultError('invariant-violated', 'targeting.player-targeting');
  return player.targeting;
}

/** A candidate craft's r², its craft record +0x14 after the load (craft §3.8). */
function craftRadiusSquared(world: WorldState, candidate: Entity): number {
  const craft = world.ruleData.craft[candidate.kindBit];
  if (craft === null || craft === undefined) throw new CoreFaultError('invariant-violated', 'targeting.craft-shape');
  return craft.shape.radiusSquared;
}

/**
 * The candidate a target operation chooses (T2): `enemy` and `friendly` the nearest of their mode (`0x2799c`); `next`
 * the next nearer one of the current mode, wrapping to the farthest (`0x27910`, `r`); `previous` the next farther one,
 * wrapping to the nearest (`0x27884`, `y`); `forward` the nearest in front of any model kind (`0x27a04`). The cycles
 * count from the reference only while it resolves.
 */
function chooseTarget(world: WorldState, player: Entity, operation: CommandOf<'target'>['operation'], reference: EntityId | null): Entity | null {
  const { entities } = world;
  switch (operation) {
    case 'enemy':
    case 'friendly':
      return fartherCandidate(entities, player, null, modeKinds(operation));
    case 'next':
    case 'previous': {
      const kinds = modeKinds(playerTargeting(world).mode);
      const current = reference === null ? null : entities.get(reference) ?? null;
      const search = operation === 'next' ? nearerCandidate : fartherCandidate;
      return search(entities, player, current, kinds) ?? search(entities, player, null, kinds);
    }
    case 'forward':
      return forwardCandidate(entities, player, FORWARD_KINDS, (candidate) => craftRadiusSquared(world, candidate));
  }
}

/**
 * Judges a `target` command (T2–T4) after the common pre-judgement: `no-candidate` without a choice, `no-change` when
 * the choice is the reference target; otherwise it writes the mode of `enemy`, `friendly` and `forward`, posts the
 * selection and is accepted.
 */
export function judgeTargetCommand(context: TickContext, command: CommandOf<'target'>, commandIndex: number): void {
  const { world } = context;
  const player = combatCommandPlayer(world);
  if (typeof player === 'string') {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: player });
    return;
  }
  const targeting = playerTargeting(world);
  const reference = referenceTarget(context);
  const { operation } = command;
  const choice = chooseTarget(world, player, operation, reference);
  if (choice === null || choice.id === reference) {
    emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: choice === null ? 'no-candidate' : 'no-change' });
    return;
  }
  if (operation === 'enemy' || operation === 'friendly') targeting.mode = operation;
  else if (operation === 'forward') targeting.mode = forwardMode(choice.kindBit);
  context.requests.post({
    type: 'select-target', entityId: player.id, target: choice.id, targetKindBit: choice.kindBit, origin: 'command', commandIndex,
  });
  emitCommandResult(context, command, commandIndex, ACCEPTED);
}

/**
 * Applies a `select-target` request in request handling (`0x213fc`): the player's target becomes the request's without
 * checking it again, and `target-changed` reports the change with the mode as it is now. The subject is the player's
 * entity; any other is a Core fault.
 */
export function applySelectTarget(context: TickContext, player: Entity, request: RequestOf<'select-target'>): void {
  const { world } = context;
  const { targeting } = world.player;
  if (world.player.entityId !== player.id || targeting === null) throw new CoreFaultError('invariant-violated', 'targeting.select-target');
  const previousTarget = world.player.target;
  world.player.target = request.target;
  const fields = {
    type: 'target-changed', tick: context.time.tick, playerEntityId: player.id, previousTarget, target: request.target,
    targetKindBit: request.targetKindBit, mode: targeting.mode,
  } as const;
  emit(context, request.origin === 'command'
    ? { ...fields, origin: 'command', commandIndex: request.commandIndex }
    : { ...fields, origin: 'automatic', commandIndex: null });
}

/** Whether the automatic selection may choose in the player's view: not in modes 0, 1 and 6, nor the destruction view 0x11/8. */
function allowsAutomaticTarget({ viewMode, subMode }: PlayerState): boolean {
  return viewMode !== 0 && viewMode !== 1 && viewMode !== BASE_VIEW_MODE && !(viewMode === 0x11 && subMode === 8);
}

/**
 * The automatic selection (T3, `0x261f1`–`0x26251`) at the end of the available player's update, after the command batch
 * and P3-06's axis change detection (CR-07). Once the clock is strictly past its due clock, it is due again 0x40 units
 * after this clock; then, in an allowing view and while the player's actual target is null (a selection pending this
 * tick does not count), it posts the nearest enemy and writes the enemy mode.
 */
export function selectAutomaticTarget(context: TickContext, player: Entity): void {
  const { world } = context;
  const { clock } = context.time;
  const targeting = playerTargeting(world);
  if (!(clock > targeting.autoTargetDueClock)) return;
  const due = clock + AUTOMATIC_TARGET_INTERVAL;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'targeting.due-clock');
  targeting.autoTargetDueClock = due;
  if (!allowsAutomaticTarget(world.player) || world.player.target !== null) return;
  const choice = fartherCandidate(world.entities, player, null, ENEMY_KINDS);
  if (choice === null) return;
  targeting.mode = 'enemy';
  context.requests.post({
    type: 'select-target', entityId: player.id, target: choice.id, targetKindBit: choice.kindBit, origin: 'automatic', commandIndex: null,
  });
}

/**
 * The right display's target clearing (T7, CR-10), which the frame-end cockpit display step (displays.ts) calls in the
 * views and order of its gauges. With a player entity and a target, it clears the target and emits `target-cleared` when
 * the target no longer resolves (`invalid`), in the base view (`base-view`) or when the target is in Warp (`warp`), in
 * that order of precedence; otherwise it changes nothing.
 */
export function clearRightDisplayTarget(context: TickContext): void {
  const { player, entities } = context.world;
  const { entityId, target } = player;
  if (entityId === null || target === null) return;
  const entity = entities.get(target);
  const cause = entity === undefined ? 'invalid' : player.viewMode === BASE_VIEW_MODE ? 'base-view' : entity.inWarp ? 'warp' : null;
  if (cause === null) return;
  player.target = null;
  emit(context, { type: 'target-cleared', tick: context.time.tick, playerEntityId: entityId, previousTarget: target, cause });
}

/**
 * The reference target (CR-05): the target of the last `select-target` request a command posted this tick that request
 * handling has not applied yet, otherwise the player's target, resolvable or not. Reading it changes nothing.
 */
export function referenceTarget(context: TickContext): EntityId | null {
  return context.requests.findLastPending(isCommandSelection)?.target ?? context.world.player.target;
}

const isCommandSelection = (request: Request): request is RequestOf<'select-target'> => request.type === 'select-target' && request.origin === 'command';
