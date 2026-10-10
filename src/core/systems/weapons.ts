/**
 * Weapons (docs/plan/p3/02/spec.md, CR-05, CR-07; P3-07 subtask 14 implements its rules): the `fire`,
 * `cycle-main-weapon` and `select-missile` commands, the missile lock in the player's update and the `launch` request
 * (message 8). Until subtask 14, the commands keep their not-implemented results, the lock changes nothing, and nothing
 * posts the request.
 */
import { CoreFaultError } from '../errors.ts';
import type { Entity } from '../world/entity-table.ts';
import { rejectNotImplemented, type CommandOf } from './commands.ts';
import type { RequestOf, TickContext } from './pipeline.ts';

/** Judges a fire or weapon selection command (W3, W5–W8). */
export function judgeWeaponCommand(context: TickContext, command: CommandOf<'fire' | 'cycle-main-weapon' | 'select-missile'>, commandIndex: number): void {
  rejectNotImplemented(context, command, commandIndex);
}

/**
 * The missile lock `0x2ddbc` (W8) in the player's update, after P3-06's clearing of an invalid target and before the
 * speed assist (CR-07). P3-06's player update calls it there; until subtask 14 it changes nothing.
 */
export function updateMissileLock(_context: TickContext, _player: Entity): void {}

/** Builds a projectile or missile in request handling (W11); no rule posts the request yet. */
export function applyLaunch(_context: TickContext, _request: RequestOf<'launch'>): void {
  throw new CoreFaultError('invariant-violated', 'weapons.launch');
}
