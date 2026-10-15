import type { TickInput } from '../contracts/tick-input.ts';
import { CONTENT_INPUT_FIELDS, type CreateWorldInput } from '../world/create-world.ts';
import { asCreateInput, worldInput, type WorldInputParts } from '../world/create-world.test-support.ts';
import { tickInput } from '../world/world.test-support.ts';
import { createRecordingSession, type Recording } from './recording.ts';
import type { ReplayContent } from './replay.ts';

// Synthetic recordings for replay tests: code-generated content and inputs, never original data.

export const PRODUCER = 'open-star-rangers test 0.0.0';

/**
 * A slice-shaped world with the first wingman at 64 clock units per tick: one second per tick, so group 2 (due at
 * 300 s) spawns at tick 301 and a run of a few hundred ticks covers every spawn.
 */
export function longInput(parts: WorldInputParts = {}): CreateWorldInput {
  return asCreateInput(worldInput({ ...parts, run: { wingman: 0, clockUnitsPerTick: 64, ...parts.run } }));
}

/** What replay takes: the creation input without its run configuration. */
export function contentOf(input: CreateWorldInput): ReplayContent {
  return Object.fromEntries(CONTENT_INPUT_FIELDS.map((field) => [field, input[field]])) as ReplayContent;
}

/** A fixed input script: commands on some ticks (a speed preset and a digit, which has no effect in flight), steering on others, -0 included. */
export function scriptedInput(tick: number): TickInput {
  if (tick % 5 === 0) {
    const digit = (tick % 9) + 1;
    return tickInput([{ type: 'fire', channel: 'primary' }, { type: 'speed-preset', level: digit }, { type: 'select-number', value: digit }]);
  }
  if (tick % 7 === 0) return { axes: { pitch: -0, yaw: 0.5, roll: -1 }, commands: [{ type: 'map-point', operation: 'hover', right: 0.25, down: 1 }] };
  return tickInput();
}

/** Records `ticks` scripted ticks of a world created from `input`. */
export function recordScript(input: CreateWorldInput, ticks: number, checkpointInterval: number, script = scriptedInput): Recording {
  const session = createRecordingSession(input, { producer: PRODUCER, checkpointInterval });
  for (let tick = 1; tick <= ticks; tick++) session.step(script(tick));
  return session.exportRecording();
}

/** Plain data after a JSON round trip, as a record or result read back from a file. */
export const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
