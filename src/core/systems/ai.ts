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
 * interpreter `0x64cb8` (rules/ai-interpreter.ts), the base `0x62c10` (rules/ai-firing.ts), the wingman `0x610c8`
 * (P3-08/19) and the parked handler `0x62250` (P3-08/21). Until a handler is wired, nothing installs it: the controller
 * stays unset, no handler runs and nothing draws, as before the AI existed; no stand-in handler pretends to run a
 * program.
 *
 * The interpreter's item dispatches are counted per tick (CORE_LIMITS.aiDispatchesPerTick, CR-25) in a count this module
 * keeps for each tick context; a Warp departure an AI rule asks for goes through requestWarpDeparture (`0x5e6cc`).
 *
 * A handler draws from the world's RNG through one RandStream per call, which the world continues after; its requests
 * are posted at once, as the original posts its messages in the subject's own update.
 */
import { CoreFaultError } from '../errors.ts';
import { firingDataOf, installBase, runTriggerLoop, updateAiLock, updateBase } from '../rules/ai-firing.ts';
import { installInterpreter, removeInterpreter, updateInterpreter, type DispatchCount, type InterpreterCall } from '../rules/ai-interpreter.ts';
import { installedController, isControllerDue, type ControllerRecord } from '../rules/ai-selection.ts';
import type { BuiltInHandler } from '../rules/ai-support.ts';
import type { CraftEntity } from '../rules/combat-init.ts';
import { activeAreaCentre, isWithinActiveArea } from '../rules/active-area.ts';
import { RandStream } from '../rules/original-random.ts';
import { isWarpAllowed } from '../rules/parked-travel.ts';
import { isActiveState, isValidAiProgram, type Activity, type AiController, type AiControllerCommon, type AiHandler, type AiProgramSlot, type Entity, type ObjectState } from '../world/entity-table.ts';
import type { WorldState } from '../world/world-state.ts';
import type { TickContext } from './pipeline.ts';
import { fireAiChannel, fireAutomatic } from './weapons.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai.${site}`);

/** An AI subject: kind bits 0–19 carry the craft combat state the handlers read. */
function asCraft(entity: Entity): CraftEntity {
  if (entity.combat.type !== 'craft') throw fault('subject');
  return entity as CraftEntity;
}

/** Runs `work` with draws from the world's RNG, which then continues after them. */
function withRand<Result>(world: WorldState, work: (rand: RandStream) => Result): Result {
  const rand = new RandStream(world.rngState);
  const result = work(rand);
  world.rngState = rand.state;
  return result;
}

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

/** The base `0x62c10` (A14): mode 0 installs and runs the update body; mode 2 returns at once. */
const BASE_HANDLER: HandlerModes = Object.freeze({
  install: (context: TickContext, entity: Entity, common: AiControllerCommon) =>
    withRand(context.world, (rand) => installBase(context.world, asCraft(entity), common, rand, (request) => context.requests.post(request))),
  update: (context: TickContext, entity: Entity, controller: AiController) => {
    if (controller.handler !== 'base') throw fault('base');
    updateBase(context.world, asCraft(entity), controller);
  },
  remove: () => {},
});

/**
 * `0x2fef8`: whether `entity` may leave by Warp (D6): active, not in Warp, its reference point (the AI target +0x90's
 * position, the goal without one; an AI target that no longer resolves refuses) outside the active area (everything is
 * without a player), and `0x2ff98`. No draw. The departure's handling checks it again (CR-21, P3-08/21).
 */
export function mayDepartByWarp(world: WorldState, entity: Entity): boolean {
  if (entity.activity !== 'active' || entity.inWarp) return false;
  const aiTarget = entity.ai.target === null ? null : world.entities.get(entity.ai.target);
  if (aiTarget === undefined) return false;
  const reference = aiTarget === null ? entity.ai.goal : aiTarget.position;
  if (isWithinActiveArea(activeAreaCentre(world), reference)) return false;
  const craft = world.craftInfo.content.craft[entity.kindBit];
  if (craft === undefined) throw fault('craft');
  return isWarpAllowed(entity.warpClock, craft, world.clock);
}

/**
 * `0x5e6cc`(C): `entity`'s Warp departure request, from the AI rules in its object update: for an object in state 7 or
 * above that mayDepartByWarp allows, `warp-departure` for request handling. Returns whether it posted.
 */
export function requestWarpDeparture(context: TickContext, entity: Entity): boolean {
  if (!isActiveState(entity.state) || !mayDepartByWarp(context.world, entity)) return false;
  context.requests.post({ type: 'warp-departure', entityId: entity.id });
  return true;
}

/**
 * The interpreter's dispatches in each tick so far, by tick context (CR-25): a stand-in for a per-tick count on the
 * TickContext itself, which the pipeline creates afresh for every tick.
 */
const DISPATCHES = new WeakMap<TickContext, DispatchCount>();

function dispatchesOf(context: TickContext): DispatchCount {
  let count = DISPATCHES.get(context);
  if (count === undefined) {
    count = { dispatches: 0 };
    DISPATCHES.set(context, count);
  }
  return count;
}

/** An interpreter call on `entity` in its object update, drawing from `rand`. */
const interpreterCall = (context: TickContext, entity: Entity, rand: RandStream): InterpreterCall => ({
  world: context.world,
  subject: asCraft(entity),
  rand,
  post: (request) => context.requests.post(request),
  depart: () => requestWarpDeparture(context, entity),
  tick: dispatchesOf(context),
});

/** The table-program interpreter `0x64cb8` (rules/ai-interpreter.ts). */
const INTERPRETER_HANDLER: HandlerModes = Object.freeze({
  install: (context: TickContext, entity: Entity, common: AiControllerCommon) =>
    withRand(context.world, (rand) => installInterpreter(interpreterCall(context, entity, rand), common)),
  update: (context: TickContext, entity: Entity, controller: AiController) => {
    if (controller.handler !== 'interpreter') throw fault('interpreter');
    withRand(context.world, (rand) => updateInterpreter(interpreterCall(context, entity, rand), controller));
  },
  remove: (context: TickContext, _entity: Entity, controller: AiController) => {
    if (controller.handler !== 'interpreter') throw fault('interpreter');
    removeInterpreter(context.world, controller);
  },
});

/** The wired handlers; each handler subtask adds its own (module comment). */
const HANDLERS: { readonly [Handler in AiHandler]?: HandlerModes } = Object.freeze({ base: BASE_HANDLER, interpreter: INTERPRETER_HANDLER });

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
 * The AI step `0x5dcd4` of an installed controller (A12). Parked, only the parked handler's mode 1 when due. Active or
 * docked: the trigger loop (channels 0, 1 and 2 through P3-07's `0x2d578`), the automatic mounts `0x2dad0` while they
 * are on, then, only when the controller is due, the handler's mode 1 followed by the AI lock update `0x5dfec` while
 * the AI lock is on, whose result becomes the missile-ready flag. A handler's press therefore fires in the next step.
 */
function stepController(context: TickContext, entity: Entity, controller: AiController): void {
  // Install and removal use the same dispatch, and the activity changes between parked and not only after a removal.
  if ((controller.handler === 'parked') !== (entity.activity === 'parked')) throw fault('dispatch');
  const modes = HANDLERS[controller.handler];
  if (modes === undefined) throw fault('unwired');
  const { world, time: { clock } } = context;
  if (controller.handler !== 'parked') {
    runTriggerLoop(controller, clock, (channel) => fireAiChannel(context, entity, channel));
    if (controller.automaticMounts) fireAutomatic(context, entity);
  }
  if (!isControllerDue(controller, clock)) return;
  modes.update(context, entity, controller);
  if (controller.handler !== 'parked' && controller.aiLock) {
    controller.missileReady = updateAiLock(firingDataOf(world), asCraft(entity), controller, (id) => world.entities.get(id), clock);
  }
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
