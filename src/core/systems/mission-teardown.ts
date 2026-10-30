/**
 * The `mission-teardown` stage (`0x334bc`; docs/plan/p3/02/spec.md, ME-03, ME-11, ME-13; docs/original/formats/
 * executable.md, flow dispatch and ending, P3-11/01): after the latch (mission-flow.ts), the run retires every object
 * through the existing lifecycle and then completes. By main state:
 *
 * - 0, latched in this tick (in the mission flow or, for a third destruction, in request handling): the teardown
 *   starts. The view becomes 0x13 with the true old view as the previous one, and the view switch runs from it
 *   (leaving the Warp view restores the saved left page, MW-09); main state 1; every entity becomes pending removal,
 *   whatever its activity, state, destruction flag or Warp transit, each active one reporting `object-retired` (P3-14
 *   FA-07); `teardown-started`.
 * - 1, the next tick: every entity asked to leave in its own update and was removed in request handling, which also
 *   released the player's references, AI controllers and their script uses. With the entity table and the AI parse
 *   cache empty, the run completes: `completedTick` and `mission-completed`, the last tick of the run (world.ts rejects
 *   any later step). Anything left is a Core fault, and the run never completes.
 * - 3, 4 and 5: nothing.
 *
 * Main state 1 also closes `0x339cc` (passesTeardownGate): spawn.ts and launch.ts drop their requests and destruction.ts
 * sheds no fragments. Neither tick has a `transition` (ME-13), which the stage asserts.
 */
import { CoreFaultError } from '../errors.ts';
import { ALL_KINDS } from '../world/entity-table.ts';
import type { MissionFlow, MissionResult } from '../world/world-state.ts';
import { retire } from './object-state.ts';
import { emit, type TickContext } from './pipeline.ts';
import { commitViewSwitch } from './view-switch.ts';

/** The view mode of the teardown (`0x334bc`), which has no world to present (P3-12). */
export const TEARDOWN_VIEW_MODE = 0x13;

/** Whether the result is latched: main states 0 and 1, in which every command is `mission-ended` (ME-12). */
export function isResultLatched({ mainState }: Pick<MissionFlow, 'mainState'>): boolean {
  return mainState === 0 || mainState === 1;
}

/** `0x339cc`: false in main state 1 only, which drops spawn and launch requests and fragment construction (ME-11). */
export function passesTeardownGate({ mainState }: Pick<MissionFlow, 'mainState'>): boolean {
  return mainState !== 1;
}

const fault = (detail?: string): CoreFaultError =>
  new CoreFaultError('invariant-violated', detail === undefined ? 'mission-teardown' : `mission-teardown.${detail}`);

/** The `mission-teardown` stage (module comment). */
export function runMissionTeardown(context: TickContext): void {
  switch (context.world.flow.mainState) {
    case 0:
      startTeardown(context);
      return;
    case 1:
      completeTeardown(context);
      return;
    default:
      return;
  }
}

/** The latch's or the completion's tick: the latched state ME-03 requires, and no `transition` (ME-13). Returns the result. */
function requireEnding(context: TickContext): MissionResult {
  const { world, events } = context;
  const { result, completedTick, rescues } = world.flow;
  if (result === null || completedTick !== null || world.missionStatus !== 'ended' || rescues !== 0) throw fault('state');
  if (events.some(({ type }) => type === 'transition')) throw fault('transition');
  return result;
}

/** Main state 0 (`0x334bc`): the view 0x13, main state 1, every entity pending removal, `teardown-started`. */
function startTeardown(context: TickContext): void {
  requireEnding(context);
  const { world, time } = context;
  const { player } = world;
  // `0x3f158` directly, not `0x216d4`: the shared switch emits `view-switched` and the model flag stays (P3-12, FS-03).
  const page = commitViewSwitch(context, TEARDOWN_VIEW_MODE, player.viewMode);
  if (page !== null) emit(context, { type: 'left-page-changed', tick: time.tick, ...page, commandIndex: null });
  world.flow.mainState = 1;
  // Through the shared writer, so each active entity's retirement is reported (P3-14 FA-07; the original posts a
  // removal item for each active object here, A-08).
  for (const entity of world.entities.walk(ALL_KINDS)) retire(context, entity, 'pending-removal');
  emit(context, { type: 'teardown-started', tick: time.tick, entities: world.entities.size });
}

/** Main state 1: the completion once nothing is left, otherwise a fault. */
function completeTeardown(context: TickContext): void {
  const { outcome } = requireEnding(context);
  const { world, time } = context;
  if (world.entities.size !== 0 || world.ai.parseCache.length !== 0) throw fault();
  world.flow.completedTick = time.tick;
  emit(context, { type: 'mission-completed', tick: time.tick, outcome });
}
