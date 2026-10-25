import type { TickInput } from '../contracts/tick-input.ts';
import type { CreateWorldInput } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, declaration, playerOnlyMission, ruleInputs, worldInput } from '../world/create-world.test-support.ts';
import { tickInput } from '../world/world.test-support.ts';
import { createRecordingSession, isCompletionTick, type Recording, type RecordingSession } from './recording.ts';
import { PRODUCER } from './replay.test-support.ts';

// Synthetic runs that reach the end of a mission from their inputs alone (docs/plan/p3/02/spec.md, ME-05 to ME-13), so a
// replay of their records reproduces them: code-generated content, never original data. Both use the player-only
// mission with record percentages other than full, and a player record that decelerates (the content readers' synthetic
// record has a negative +0xC0, so a locked craft would speed up past +0xB8 and its rescue throttle leave the table).

/** The synthetic craft info with the player's +0xC0 positive and, optionally, its hull +0x9C. */
function playerCraftInfo(hull?: number) {
  const info = craftInfoContent();
  info.craft[0].atC0 = 2;
  if (hull !== undefined) info.craft[0].at9C = hull;
  return info;
}

/**
 * The success: one craft of kind bit 7 at the player's stored point. The collision pass destroys it in the first
 * ticks (the player's hull is large), which is the all-clear; then the settlement wait, the completion message, the
 * result's due, the latch and the teardown. At the default step of 2 clock units the run completes in about 650 ticks.
 */
export function successInput(): CreateWorldInput {
  const mission = playerOnlyMission();
  mission.declarations[0].ruleInputs = ruleInputs({ percentC: 40, percentD: 50 });
  mission.declarations.push(declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 0 } }));
  return asCreateInput(worldInput({ mission, craftInfo: playerCraftInfo(100_000), run: { wingman: null } }));
}

/** A speed preset on even ticks, so the latch's tick answers a command (ME-12). */
export const successScript = (tick: number): TickInput => (tick % 2 === 0 ? tickInput([{ type: 'speed-preset', level: 3 }]) : tickInput());

/**
 * The failure after two rescues: the player alone with 1 % of its energy, so it runs dry, waits out the beacon and is
 * rescued with the same 1 % (no base: the world default), twice; the third loss latches the failure. At 64 clock units
 * per tick the run completes in about 300 ticks.
 */
export function thirdLossInput(): CreateWorldInput {
  const mission = playerOnlyMission();
  mission.declarations[0].ruleInputs = ruleInputs({ percentC: 40, percentD: 1 });
  return asCreateInput(worldInput({ mission, craftInfo: playerCraftInfo(), run: { wingman: null, clockUnitsPerTick: 64 } }));
}

/** Full speed every eighth tick: a rescued player at rest would spend no energy. */
export const thirdLossScript = (tick: number): TickInput => (tick % 8 === 0 ? tickInput([{ type: 'speed', operation: 'maximum' }]) : tickInput());

/**
 * Steps `session` with `script` until a tick completes the run, at most 2000 ticks, calling `afterTick` after each;
 * returns the final tick.
 */
export function stepToCompletion(session: RecordingSession, script: (tick: number) => TickInput, afterTick: (tick: number) => void = () => {}): number {
  for (let tick = 1; tick <= 2000; tick++) {
    const completes = isCompletionTick(session.step(script(tick)));
    afterTick(tick);
    if (completes) return tick;
  }
  throw new Error('the run did not complete');
}

/** A recording of `input` run with `script` to its completion. */
export function recordToCompletion(input: CreateWorldInput, script: (tick: number) => TickInput, checkpointInterval: number): Recording {
  const session = createRecordingSession(input, { producer: PRODUCER, checkpointInterval });
  stepToCompletion(session, script);
  return session.exportRecording();
}
