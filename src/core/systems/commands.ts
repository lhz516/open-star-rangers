/**
 * Command judgement of formal Core (docs/plan/p3/02/spec.md, 输入与命令; CR-05): every command of a tick gets exactly one
 * `command-result`, in command order, from the rule module of its type. The player's update (flight-control.ts) is the
 * one command loop (CR-07): it judges P3-06's throttle, speed match and speed assist commands itself and hands every
 * other command to judgeCommand in its place in the order. P3-07's six command types go to targeting.ts (`target`),
 * weapons.ts (`fire`, `cycle-main-weapon`, `select-missile`) and energy.ts (`energy`, `damage-report`), P3-09's
 * `toggle-map` to map.ts; every other type is rejected/not-implemented until its rule task routes it. A module emits a
 * command's additional events right after its result.
 *
 * Every command is judged in the interaction context of the tick's command view (pipeline.ts; MW-04), which the
 * accepted view commands before it have moved on, never in the context the batch started with.
 */
import type { CommandResultReason } from '../contracts/domain-events.ts';
import type { Command, CommandType } from '../contracts/tick-input.ts';
import type { Entity } from '../world/entity-table.ts';
import { interactionContext } from '../world/player-state.ts';
import { judgeEnergyCommand } from './energy.ts';
import { judgeToggleMap } from './map.ts';
import { emit, type TickContext } from './pipeline.ts';
import { judgeTargetCommand } from './targeting.ts';
import { judgeWeaponCommand } from './weapons.ts';

/** The command variants of one or more types. */
export type CommandOf<Type extends CommandType> = Extract<Command, { readonly type: Type }>;

/** A command's outcome: accepted without a reason, or rejected or ignored with one. */
export type CommandOutcome =
  | { readonly outcome: 'accepted'; readonly reason: null }
  | { readonly outcome: 'rejected' | 'ignored'; readonly reason: CommandResultReason };

const NOT_IMPLEMENTED: CommandOutcome = Object.freeze({ outcome: 'rejected', reason: 'not-implemented' });

/** Emits the one result of the command at `commandIndex`. */
export function emitCommandResult(context: TickContext, command: Command, commandIndex: number, result: CommandOutcome): void {
  emit(context, { type: 'command-result', tick: context.time.tick, commandIndex, commandType: command.type, ...result });
}

/** The result of a command no rule handles yet; it changes nothing. */
export function rejectNotImplemented(context: TickContext, command: Command, commandIndex: number): void {
  emitCommandResult(context, command, commandIndex, NOT_IMPLEMENTED);
}

/**
 * The common pre-judgement of P3-07's commands (CR-05), in order: without a player entity, or with one that is
 * destroyed or not active (state 7), `player-unavailable`, as the original polls no keys then; in an interaction
 * context of the command view other than flight, `wrong-context`, as only the flight key context `0x264a0` handles
 * these keys. Otherwise the player's entity, which the rule modules judge the command on.
 */
export function combatCommandPlayer({ world, commandView }: TickContext): Entity | 'player-unavailable' | 'wrong-context' {
  const { entityId } = world.player;
  const player = entityId === null ? undefined : world.entities.get(entityId);
  if (player === undefined || player.destroyed || player.state !== 'active') return 'player-unavailable';
  return interactionContext(commandView.viewMode) === 'flight' ? player : 'wrong-context';
}

/**
 * The selection commands in the map context (MW-04): after the common pre-judgement's `player-unavailable`, ignored as
 * `wrong-context`, as the map's keys have no digits, Enter or menu navigation. Elsewhere they belong to the base and
 * communications menus (P3-10) and stay not implemented; P3-06 judges `select-number` and `confirm-selection` in
 * flight and in the Warp context itself (flight-control.ts).
 */
function judgeSelectionCommand(context: TickContext, command: CommandOf<'select-number' | 'confirm-selection' | 'navigate-selection'>, commandIndex: number): void {
  if (interactionContext(context.commandView.viewMode) !== 'map') {
    rejectNotImplemented(context, command, commandIndex);
    return;
  }
  const player = combatCommandPlayer(context);
  emitCommandResult(context, command, commandIndex, { outcome: 'ignored', reason: player === 'player-unavailable' ? player : 'wrong-context' });
}

/** Judges the command at `commandIndex` by its type; the player's update calls it for every command it does not judge. */
export function judgeCommand(context: TickContext, command: Command, commandIndex: number): void {
  switch (command.type) {
    case 'toggle-map':
      judgeToggleMap(context, command, commandIndex);
      return;
    case 'select-number':
    case 'confirm-selection':
    case 'navigate-selection':
      judgeSelectionCommand(context, command, commandIndex);
      return;
    case 'target':
      judgeTargetCommand(context, command, commandIndex);
      return;
    case 'fire':
    case 'cycle-main-weapon':
    case 'select-missile':
      judgeWeaponCommand(context, command, commandIndex);
      return;
    case 'energy':
    case 'damage-report':
      judgeEnergyCommand(context, command, commandIndex);
      return;
    default:
      rejectNotImplemented(context, command, commandIndex);
  }
}
