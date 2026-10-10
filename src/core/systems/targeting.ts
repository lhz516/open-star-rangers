/**
 * Targeting (docs/plan/p3/02/spec.md, CR-05, CR-07; P3-07 subtask 13 implements its rules): the `target` command, the
 * `select-target` request (message 2), the automatic selection in the player's update and the reference target the
 * target and weapon commands share. Until subtask 13, the command keeps its not-implemented result, the automatic
 * selection changes nothing, and nothing posts the request.
 */
import { CoreFaultError } from '../errors.ts';
import type { Entity, EntityId } from '../world/entity-table.ts';
import { rejectNotImplemented, type CommandOf } from './commands.ts';
import type { Request, RequestOf, TickContext } from './pipeline.ts';

/** Judges a `target` command (T2–T4). */
export function judgeTargetCommand(context: TickContext, command: CommandOf<'target'>, commandIndex: number): void {
  rejectNotImplemented(context, command, commandIndex);
}

/** Applies a `select-target` request to the player in request handling (T1); no rule posts one yet. */
export function applySelectTarget(_context: TickContext, _player: Entity, _request: RequestOf<'select-target'>): void {
  throw new CoreFaultError('invariant-violated', 'targeting.select-target');
}

/**
 * The automatic selection (T3) at the end of the player's update, after the command batch and P3-06's axis change
 * detection (CR-07). P3-06's player update calls it there; until subtask 13 it changes nothing.
 */
export function selectAutomaticTarget(_context: TickContext, _player: Entity): void {}

/**
 * The reference target (CR-05): the target of the last `select-target` request a command posted this tick that request
 * handling has not applied yet, otherwise the player's target, resolvable or not. Reading it changes nothing.
 */
export function referenceTarget(context: TickContext): EntityId | null {
  return context.requests.findLastPending(isCommandSelection)?.target ?? context.world.player.target;
}

const isCommandSelection = (request: Request): request is RequestOf<'select-target'> => request.type === 'select-target' && request.origin === 'command';
