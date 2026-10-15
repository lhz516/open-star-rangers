/**
 * Command judgement of formal Core (docs/plan/p3/02/spec.md, 输入与命令; CR-05): every command of a tick gets exactly one
 * `command-result`, in command order, from the rule module of its type. The player's update (flight-control.ts) is the
 * one command loop (CR-07): it judges P3-06's throttle, speed match and speed assist commands itself and hands every
 * other command to judgeCommand in its place in the order. P3-07's six command types go to targeting.ts (`target`),
 * weapons.ts (`fire`, `cycle-main-weapon`, `select-missile`) and energy.ts (`energy`, `damage-report`), P3-09's
 * `toggle-map` and `map-point` to map.ts and `request-warp` to warp.ts, P3-10's base keys (`navigate-selection`,
 * `confirm-selection`, `launch`) of an available player in the base context of the command view to judgeBaseKey here
 * and the rest of P3-10's to communications.ts (`communications`, `select-number`, and the other contexts'
 * `navigate-selection`, `confirm-selection` and `launch`; CB-07), which also gives the map context's selection keys
 * their `wrong-context` (MW-04); every other type is rejected/not-implemented until its rule task routes it. A module
 * emits a command's additional events right after its result.
 *
 * Every command is judged in the interaction context of the tick's command view, the batch's effective view (pipeline.ts;
 * MW-04, CB-07), which the accepted view commands before it have moved on, never in the context the batch started with.
 */
import type { CommandResultReason } from '../contracts/domain-events.ts';
import type { Command, CommandType } from '../contracts/tick-input.ts';
import { launchViewMode } from '../rules/docking.ts';
import type { Entity } from '../world/entity-table.ts';
import { interactionContext } from '../world/player-state.ts';
import { judgeCommunicationsCommand } from './communications.ts';
import { judgeEnergyCommand } from './energy.ts';
import { availablePlayer, type EffectiveView } from './flight-control.ts';
import { judgeMapPoint, judgeToggleMap } from './map.ts';
import { emit, type TickContext } from './pipeline.ts';
import { judgeTargetCommand } from './targeting.ts';
import { judgeRequestWarp } from './warp.ts';
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
 * Judges a base key (`0x271e0`) when an available player is in the base context of the effective view: accepted, with
 * its request posted at once (CB-08). An accepted `launch` also leaves the base for the rest of the batch: the
 * effective previous view becomes the effective view, and that the old previous view raised to 0xC (CB-07 §3), what
 * request handling's `depart` will commit. Returns false, judging nothing, otherwise: communications.ts then judges it
 * by its other contexts and never sees it in the base.
 */
export function judgeBaseKey(context: TickContext, command: CommandOf<'navigate-selection' | 'confirm-selection' | 'launch'>, commandIndex: number, view: EffectiveView): boolean {
  const { world, requests } = context;
  const player = availablePlayer(world);
  if (player === null || interactionContext(view.viewMode) !== 'base') return false;
  emitCommandResult(context, command, commandIndex, { outcome: 'accepted', reason: null });
  switch (command.type) {
    case 'navigate-selection':
      requests.post({ type: 'base-navigate', entityId: player.id, direction: command.direction, commandIndex });
      return true;
    case 'confirm-selection':
      requests.post({ type: 'base-confirm', entityId: player.id, commandIndex });
      return true;
    case 'launch': {
      requests.post({ type: 'depart', entityId: player.id, origin: 'command', commandIndex });
      const viewMode = launchViewMode(view.previousViewMode);
      view.previousViewMode = view.viewMode;
      view.viewMode = viewMode;
      return true;
    }
  }
}

/**
 * Judges the command at `commandIndex` by its type in the batch's effective `view`; the player's update calls it for
 * every command it does not judge.
 */
export function judgeCommand(context: TickContext, command: Command, commandIndex: number, view: EffectiveView): void {
  switch (command.type) {
    case 'toggle-map':
      judgeToggleMap(context, command, commandIndex);
      return;
    case 'map-point':
      judgeMapPoint(context, command, commandIndex);
      return;
    case 'request-warp':
      judgeRequestWarp(context, command, commandIndex);
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
    case 'navigate-selection':
    case 'confirm-selection':
    case 'launch':
      if (!judgeBaseKey(context, command, commandIndex, view)) judgeCommunicationsCommand(context, command, commandIndex, view);
      return;
    case 'communications':
    case 'select-number':
      judgeCommunicationsCommand(context, command, commandIndex, view);
      return;
    default:
      rejectNotImplemented(context, command, commandIndex);
  }
}
