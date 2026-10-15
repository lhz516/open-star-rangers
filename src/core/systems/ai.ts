/**
 * The AI controller in an object's own update (docs/plan/p3/02/spec.md, CR-16, CR-23; docs/original/formats/ai.md §1):
 * the part of the generic callback `0x20c18` that installs, steps and removes the controller of the program
 * instantiation selected (`0x20990`, spawn.ts and rules/ai-selection.ts). pipeline.ts calls updateController for a
 * craft after the Warp-transit check and before the generic part `0x20ae4`; by the object's state:
 * - 0–3 (new, presentation ready, awaiting presentation): install when a program is selected and no controller is
 *   installed: `0x5dc0c` (installedController), then by the activity at that moment the parked handler `0x62250` or the
 *   record's handler, in mode 0, which runs one update body with its draws in the same call;
 * - 5 and 6 (area switch, pending removal): remove an installed controller through the handler that installed it, in
 *   mode 2 (`0x5ddd4`), then the slot keeps its record for the next state 0–3 callback, with no reselection;
 * - 7 (active): the AI step `0x5dcd4`, the handler in mode 1 when the sample is past its deadline.
 * State 4 gets no callback, so a destroyed active object's controller is neither stepped nor removed until its
 * explosion sets state 6; the rescue reaches none of this (ai §1).
 *
 * The handlers are static calls into their rule modules (CR-07), wired by the subtasks that implement them: the
 * interpreter `0x64cb8` (P3-08/16), the base `0x62c10` (P3-08/18), the wingman `0x610c8` (P3-08/19) and the parked
 * handler `0x62250` (P3-08/21). Until a handler is wired, nothing installs it: the controller stays unset, no handler
 * runs and nothing draws, as before the AI existed; no stand-in handler pretends to run a program.
 */
import { CoreFaultError } from '../errors.ts';
import { installedController, isControllerDue, type ControllerRecord } from '../rules/ai-selection.ts';
import type { BuiltInHandler } from '../rules/ai-support.ts';
import { isValidAiProgram, type Activity, type AiController, type AiControllerCommon, type AiHandler, type AiProgramSlot, type Entity, type ObjectState } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import type { TickContext } from './pipeline.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai.${site}`);

/** A selected program: a table or built-in record. */
type SelectedProgram = Exclude<AiProgramSlot, { readonly type: 'none' }>;

/** One handler's three call modes (`0x5dc0c`, `0x5dcd4` and `0x5ddd4` call the record's handler with 0, 1 and 2). */
interface HandlerModes {
  /** Mode 0 on the installed common controller, with the update body it runs in the same call: the full controller. */
  readonly install: (context: TickContext, entity: Entity, common: AiControllerCommon) => AiController;
  /** Mode 1, from the AI step when the controller is due. */
  readonly update: (context: TickContext, entity: Entity, controller: AiController) => void;
  /** Mode 2, at the removal: releases the handler's private state. */
  readonly remove: (context: TickContext, entity: Entity, controller: AiController) => void;
}

/** The wired handlers; each handler subtask adds its own (module comment). */
const HANDLERS: { readonly [Handler in AiHandler]?: HandlerModes } = Object.freeze({});

/** The states in which `0x20c18` installs (0–3), removes (5, 6) and steps (7). */
const INSTALL_STATES: ReadonlySet<ObjectState> = new Set(['new', 'presentation-ready', 'awaiting-presentation']);
const REMOVAL_STATES: ReadonlySet<ObjectState> = new Set(['area-switch', 'pending-removal']);

/** What `0x20c18` does with an entity's controller in its current state: install, step, remove, or nothing. */
export type ControllerCall =
  | { readonly call: 'install'; readonly handler: AiHandler }
  | { readonly call: 'step'; readonly handler: AiHandler }
  | { readonly call: 'remove'; readonly handler: AiHandler };

/**
 * The handler an install calls (`0x5dc0c`): the parked handler `0x62250` while parked; otherwise the interpreter for a
 * table record and the built-in record's own handler (CR-15 rejects a reachable record without one at creation).
 */
export function installedHandler(program: SelectedProgram, activity: Activity, builtInHandlers: readonly (BuiltInHandler | null)[]): AiHandler {
  if (activity === 'parked') return 'parked';
  if (program.type === 'table') return 'interpreter';
  const handler = builtInHandlers[program.record];
  if (handler === undefined || handler === null) throw fault('handler');
  return handler;
}

/**
 * The call `0x20c18` makes in `entity`'s state, after the Warp-transit check: in states 0–3 an install when a program is
 * selected and none is installed; in states 5 and 6 the removal of an installed controller, through the handler that
 * installed it; in state 7 the AI step of an installed controller. Null otherwise: no program, nothing to install or
 * remove, or a state without a controller call (4 and 8).
 */
export function controllerCall(entity: Entity, builtInHandlers: readonly (BuiltInHandler | null)[]): ControllerCall | null {
  const { program } = entity.ai;
  if (program.type === 'none') return null;
  const { controller } = program;
  if (INSTALL_STATES.has(entity.state)) {
    return controller === null ? { call: 'install', handler: installedHandler(program, entity.activity, builtInHandlers) } : null;
  }
  if (controller === null) return null;
  if (REMOVAL_STATES.has(entity.state)) return { call: 'remove', handler: controller.handler };
  return entity.state === 'active' ? { call: 'step', handler: controller.handler } : null;
}

/** The record a selected program names: a table record after the load transforms, or a built-in record. */
function recordOf(world: WorldState, program: SelectedProgram): ControllerRecord {
  const record = program.type === 'table' ? world.ruleData.ai.tablePrograms[program.record] : world.ruleData.inputs.aiPrograms.content.builtInPrograms[program.record];
  if (record === undefined) throw fault('record');
  return record;
}

/** Writes `controller` (or null) into `entity`'s selected program, which must stay a valid slot (CR-16). */
function setController(entity: Entity, program: SelectedProgram, controller: AiController | null): void {
  const slot = { ...program, controller } as SelectedProgram;
  if (!isValidAiProgram(entity.kindBit, slot)) throw fault('slot');
  entity.ai.program = slot;
}

/** The selected program of `entity`, which a controller call requires. */
function selectedProgram(entity: Entity): SelectedProgram {
  const { program } = entity.ai;
  if (program.type === 'none') throw fault('program');
  return program;
}

/**
 * The install (`0x20c18` in states 0–3, and the Warp departure's immediate one, P3-08/21): `0x5dc0c` on the selected
 * record and the craft's record, then the handler's mode 0. Nothing happens while the handler is not wired.
 */
export function installController(context: TickContext, entity: Entity, handler: AiHandler): void {
  const modes = HANDLERS[handler];
  if (modes === undefined) return;
  const { world } = context;
  const program = selectedProgram(entity);
  const craft = world.craftInfo.content.craft[entity.kindBit];
  if (craft === undefined) throw fault('craft');
  const controller = modes.install(context, entity, installedController(recordOf(world, program), craft));
  if (controller.handler !== handler) throw fault('installed-handler');
  setController(entity, program, controller);
}

/**
 * The removal `0x5ddd4` (`0x20c18` in states 5 and 6, and the Warp departure's, P3-08/21): the installing handler's mode
 * 2, then no controller; the slot keeps its record.
 */
export function removeController(context: TickContext, entity: Entity): void {
  const program = selectedProgram(entity);
  const { controller } = program;
  if (controller === null) return;
  const modes = HANDLERS[controller.handler];
  if (modes === undefined) throw fault('unwired');
  modes.remove(context, entity, controller);
  setController(entity, program, null);
}

/**
 * The AI step `0x5dcd4` of an installed controller. Parked, only the parked handler's mode 1 when due. Active or docked:
 * P3-08/18 adds the trigger channels 0, 1 and 2 and the automatic mounts before the handler, and P3-08/17 the AI lock
 * update after it, whether or not the handler was due.
 */
function stepController(context: TickContext, entity: Entity, controller: AiController): void {
  // Install and removal use the same dispatch, and the activity changes between parked and not only after a removal.
  if ((controller.handler === 'parked') !== (entity.activity === 'parked')) throw fault('dispatch');
  const modes = HANDLERS[controller.handler];
  if (modes === undefined) throw fault('unwired');
  if (isControllerDue(controller, context.time.clock)) modes.update(context, entity, controller);
}

/** The controller part of `0x20c18` for a craft (module comment); pipeline.ts calls it after the Warp-transit check. */
export function updateController(context: TickContext, entity: Entity): void {
  const call = controllerCall(entity, context.world.ruleData.ai.builtInHandlers);
  switch (call?.call) {
    case undefined:
      return;
    case 'install':
      installController(context, entity, call.handler);
      return;
    case 'remove':
      removeController(context, entity);
      return;
    case 'step':
      stepController(context, entity, selectedProgram(entity).controller as AiController);
      return;
  }
}
