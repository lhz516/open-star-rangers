/**
 * The `mission-flow` stage (`0x3266c`; docs/plan/p3/02/spec.md, ME-03, ME-05, ME-07; docs/original/formats/executable.md,
 * flow dispatch and ending, P3-11/01). It reads the previous tick's clock c′ (C3): the clock stage has not run yet. Each
 * tick takes at most one branch, by main state:
 *
 * - 3, the mission runs: by sub-state. In 0, a mission status `ended` (the all-clear, mission-events.ts) starts the
 *   settlement: the pre-settlement runs the all-clear test again excluding nothing, a success selects the summary
 *   (rules/mission-summary.ts), state 4 is due at c′ + 0x140, and `settlement-started`. That tick, and every later one,
 *   makes no wingman-loss test. In 1, the beacon wait (player-loss.ts), once c′ reaches its due: sub-state 2, the
 *   radio flush and the energy loss's handling, a rescue or the third loss (rescue.ts). Sub-states 3–5 are P3-10's
 *   docking (docking.ts); 2 does nothing.
 * - 4, the settlement wait, once c′ is past its due (strictly): in the Warp view (view mode 1 exactly) the due moves to
 *   c′ + 0x140 (`settlement-deferred`); otherwise the radio flush, the completion message, state 5 due at c′ + 0x3C0.
 * - 5, the result delay, once c′ is past its due (strictly): the radio flush, then the latch of the settlement's
 *   outcome, a success as `all-clear`, a failure as `settlement-failed` (ME-17 decision 1).
 * - 0 and 1: nothing; the teardown is its own stage (ME-11).
 *
 * In states 4 and 5 the rules run on: the player may fly, fight, be destroyed or run out of energy, but no loss rescues
 * or fails (the loss entries require state 3), and the settlement never changes. The latch also serves the third loss.
 */
import type { SettlementStartedEvent } from '../contracts/domain-events.ts';
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import { hasRemainingEnemies } from '../rules/all-clear.ts';
import { wingmanHead } from '../rules/docking.ts';
import { NO_SUMMARY_SELECTOR, selectSummary } from '../rules/mission-summary.ts';
import type { EndingGap, MissionResult, ResultReason, Settlement, WorldState } from '../world/world-state.ts';
import { checkDockingWait } from './docking.ts';
import { emit, type TickContext } from './pipeline.ts';
import { flushRadio } from './radio.ts';
import { resolvePlayerLoss } from './rescue.ts';
import { pendingSpawns } from './spawn.ts';
import { WARP_VIEW_MODE } from './view-switch.ts';

/** Clock units from the 3→4 step, or a deferral, to state 4's due (`0x18681c`). */
export const SETTLEMENT_WAIT = 0x140;
/** Clock units from the completion message to state 5's due. */
export const RESULT_DELAY = 0x3c0;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `mission-flow.${site}`);

/** `clock` + `units`; a sum past the safe integer range is a budget fault, as Core does not reproduce the u32 wrap. */
function dueAfter(clock: number, units: number): number {
  const due = clock + units;
  if (!Number.isSafeInteger(due)) throw new CoreFaultError('budget-exhausted', 'mission-flow.due');
  return due;
}

/** The `mission-flow` stage (module comment). */
export function runMissionFlow(context: TickContext): void {
  switch (context.world.flow.mainState) {
    case 3:
      runMission(context);
      return;
    case 4:
      waitForSettlement(context);
      return;
    case 5:
      delayResult(context);
      return;
    case 0:
    case 1:
      return;
  }
}

/** Main state 3: the sub-state table `0x32650`. */
function runMission(context: TickContext): void {
  const { world } = context;
  switch (world.flow.subState) {
    case 0:
      if (world.missionStatus === 'ended') startSettlement(context);
      return;
    case 1:
      if (world.clock >= world.flow.beaconDeadline) expireBeacon(context);
      return;
    case 2:
      return;
    case 3:
    case 4:
    case 5:
      checkDockingWait(context);
      return;
  }
}

/** Sub-state 1 at its due (`0x32a3c`): sub-state 2, the radio flush, then the energy loss's handling (rescue.ts). */
function expireBeacon(context: TickContext): void {
  context.world.flow.subState = 2;
  flushRadio(context, 'beacon-expired');
  resolvePlayerLoss(context, 'energy');
}

/** The pre-settlement `0x69c54(EDX = 0)` (ME-05): written once, at the 3→4 step. */
function preSettle(world: WorldState): Settlement {
  const { entities, setup, missionEvents } = world;
  if (hasRemainingEnemies(entities, pendingSpawns(world), setup, null)) return { outcome: 'failure', summary: null, summarySelector: NO_SUMMARY_SELECTOR };
  return { outcome: 'success', ...selectSummary(setup.mission, setup.eventTriggers, missionEvents.triggers) };
}

/** Sub-state 0 with the mission ended: the pre-settlement and state 4. */
function startSettlement(context: TickContext): void {
  const { world, time } = context;
  const { flow } = world;
  if (flow.settlement !== null) throw fault('settlement');
  const settlement: Settlement = Object.freeze(preSettle(world));
  flow.settlement = settlement;
  flow.settlementDeadline = dueAfter(world.clock, SETTLEMENT_WAIT);
  flow.mainState = 4;
  const event: SettlementStartedEvent = { type: 'settlement-started', tick: time.tick, ...settlement, dueClock: flow.settlementDeadline };
  emit(context, event);
}

/** The settlement of main states 4 and 5, which always have one with the mission ended (ME-03). */
function requireSettlement(world: WorldState): Settlement {
  const { settlement } = world.flow;
  if (settlement === null || world.missionStatus !== 'ended') throw fault('settlement');
  return settlement;
}

/** Main state 4 (`0x32c4b`). */
function waitForSettlement(context: TickContext): void {
  const { world, time } = context;
  const { flow } = world;
  requireSettlement(world);
  if (!isDue(world.clock, flow.settlementDeadline)) return;
  if (world.player.viewMode === WARP_VIEW_MODE) {
    flow.settlementDeadline = dueAfter(world.clock, SETTLEMENT_WAIT);
    emit(context, { type: 'settlement-deferred', tick: time.tick, dueClock: flow.settlementDeadline });
    return;
  }
  flushRadio(context, 'completion-message');
  emit(context, { type: 'flight-message', tick: time.tick, message: 'missionComplete' });
  flow.mainState = 5;
  flow.settlementDeadline = dueAfter(world.clock, RESULT_DELAY);
}

/** Main state 5 (`0x32cb9`). */
function delayResult(context: TickContext): void {
  const { world } = context;
  const settlement = requireSettlement(world);
  if (!isDue(world.clock, world.flow.settlementDeadline)) return;
  flushRadio(context, 'result-due');
  latch(context, settlement.outcome === 'success' ? { type: 'all-clear' } : { type: 'settlement-failed' });
}

/**
 * The ending placeholders (ME-05): a success's return, `wingman` when the head of the wingman's list exists in object
 * state 7 or 8 (+3, not its activity +2), then the mission's own cutscene for a positive selector; a failure's first
 * clip, of a third loss's kind or, for a failed settlement, `destroyed` (the original's p = 1).
 */
function endingGaps(world: WorldState, reason: ResultReason): readonly EndingGap[] {
  switch (reason.type) {
    case 'all-clear': {
      const head = wingmanHead(world.entities);
      const wingman = head !== null && (head.state === 'active' || head.state === 'projectile-hit');
      const { summarySelector } = requireSettlement(world);
      const gaps: EndingGap[] = [{ gap: 'G-02/8', variant: wingman ? 'wingman' : 'solo' }];
      if (summarySelector > 0) gaps.push({ gap: 'G-02/9', row: summarySelector });
      return gaps;
    }
    case 'third-loss':
      return [{ gap: 'G-02/7', variant: reason.loss }];
    case 'settlement-failed':
      return [{ gap: 'G-02/7', variant: 'destroyed' }];
  }
}

/**
 * Whether `reason` may latch now: a third loss in main state 3 with both rescues used and the mission ended (ME-10);
 * otherwise state 5's due, with the settlement's outcome.
 */
function canLatch(world: WorldState, reason: ResultReason): boolean {
  const { flow } = world;
  if (flow.result !== null) return false;
  if (reason.type === 'third-loss') return flow.mainState === 3 && flow.rescues === 2 && world.missionStatus === 'ended';
  return flow.mainState === 5 && requireSettlement(world).outcome === outcomeOf(reason);
}

const outcomeOf = (reason: ResultReason): MissionResult['outcome'] => (reason.type === 'all-clear' ? 'success' : 'failure');

/**
 * `latch(outcome, reason)` (ME-05), in main state 3 (a third loss) or at state 5's due: freezes the result summary,
 * captures and then clears the rescue count, sets main state 0 and emits `result-latched`. The outcome follows from the
 * reason: success only for `all-clear`.
 */
export function latch(context: TickContext, reason: ResultReason): void {
  const { world, time } = context;
  const { flow, player } = world;
  if (!canLatch(world, reason)) throw fault('latch');
  const outcome = outcomeOf(reason);
  const playerKills = Object.values(player.kills).reduce((sum, kills) => sum + kills, 0);
  if (!Number.isSafeInteger(playerKills) || playerKills < 0 || playerKills > 0x7fff_ffff) throw fault('player-kills');
  const result: MissionResult = {
    outcome,
    reason,
    summary: outcome === 'success' ? requireSettlement(world).summary : null,
    rescuesUsed: flow.rescues,
    endingGaps: endingGaps(world, reason),
    playerKills,
    latchTick: time.tick,
  };
  flow.result = deepFreeze(result);
  flow.rescues = 0;
  flow.mainState = 0;
  emit(context, { type: 'result-latched', tick: time.tick, result: flow.result });
}

function deepFreeze<Value extends object>(value: Value): Value {
  for (const field of Object.values(value)) if (typeof field === 'object' && field !== null) deepFreeze(field);
  return Object.freeze(value);
}
