/**
 * The wingman-loss timer (docs/plan/p3/02/spec.md, ME-03, ME-07, ME-09, ME-13; docs/original/formats/executable.md,
 * wingman-loss timer, P3-11/02, and C3). It only queues one radio message: it is no ending and no time limit.
 *
 * - startWingmanLossTimer, `0x32dec`, from damage.ts at a wingman's destruction (after its object event, before the
 *   parked test and the explosion), in any main and sub-state: only while no timer is pending, due WINGMAN_LOSS_DELAY
 *   after the sample. A later loss while it is pending neither re-arms nor moves it.
 * - checkWingmanLossTimer, `0x3266c` sub-state 0 after the status test, from mission-flow.ts only while the mission
 *   status is `built`: once the previous tick's clock c′ reaches the due (non-strict), the flag clears and 20983's
 *   item 6 is queued when it resolves (no face, speaker or draw; `0x3c4bc`). Sub-states 1–5 postpone it; the all-clear
 *   reached first drops it, as the flow never runs the test again.
 *
 * Nothing else writes the timer: a rescue, docking or the latch keeps it, and a new world starts without one.
 */
import { CoreFaultError } from '../errors.ts';
import type { Entity } from '../world/entity-table.ts';
import { emit, type TickContext } from './pipeline.ts';
import { queueMessage } from './radio.ts';

/** Clock units from a wingman's destruction to its loss message (`0x186818`). */
export const WINGMAN_LOSS_DELAY = 0x780;

/** `0x3c618(20983, 0, 6)`: the direct list's item 6, looked up with face 0. */
const WINGMAN_LOSS_MESSAGE = { table: 20983, face: 0, index: 6 } as const;

/** `0x32dec` for the destroyed `wingman` (module comment). */
export function startWingmanLossTimer(context: TickContext, wingman: Entity): void {
  const { world, time } = context;
  const timer = world.flow.wingmanLoss;
  if (timer.pending) return;
  // The sample at the call: the damage stages run after the clock stage.
  const dueClock = time.clock + WINGMAN_LOSS_DELAY;
  if (!Number.isSafeInteger(dueClock)) throw new CoreFaultError('budget-exhausted', 'wingman-loss.due');
  timer.pending = true;
  timer.dueClock = dueClock;
  emit(context, { type: 'wingman-loss-timer-started', tick: time.tick, wingmanEntityId: wingman.id, dueClock });
}

/** Sub-state 0's wingman-loss test with the mission not ended (module comment); `radio-queued`, then the expiry. */
export function checkWingmanLossTimer(context: TickContext): void {
  const { world, time } = context;
  const timer = world.flow.wingmanLoss;
  // c′: in `mission-flow` the world's clock is still the previous tick's (C3).
  if (!timer.pending || world.clock < timer.dueClock) return;
  timer.pending = false;
  const queued = queueMessage(context, WINGMAN_LOSS_MESSAGE, 'none', null);
  emit(context, { type: 'wingman-loss-timer-expired', tick: time.tick, queued });
}
