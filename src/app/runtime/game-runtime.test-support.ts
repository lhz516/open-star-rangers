import type { TickAxes } from '../../core/contracts/tick-input.ts';
import { DEFAULT_CLOCK_UNITS_PER_TICK, stepSeconds } from '../../core/contracts/time.ts';
import type { RecordingOptions } from '../../core/replay/recording.ts';
import { worldInput, type WorldInputParts } from '../../core/world/create-world.test-support.ts';
import type { GameRunConfig, GameRuntimeSpec } from './game-runtime.ts';

// Synthetic Runtime specs for Node tests: the Core test support's code-generated logic content, never original data.

/** One tick at the default step: 31.25 ms, exact in binary floating point. */
export const TICK_MS = stepSeconds(DEFAULT_CLOCK_UNITS_PER_TICK) * 1000;

export const NEUTRAL_AXES: TickAxes = Object.freeze({ pitch: 0, yaw: 0, roll: 0 });

export interface RuntimeSpecParts extends Pick<WorldInputParts, 'mission' | 'roster'> {
  readonly run?: Partial<GameRunConfig>;
  readonly recording?: RecordingOptions | null;
}

/** A fresh mutable spec, by default the slice-shaped mission without a wingman or recording. */
export function runtimeSpec(parts: RuntimeSpecParts = {}): GameRuntimeSpec {
  const { mission, craftTypes, wingmanRoster, identity, run } = worldInput({ mission: parts.mission, roster: parts.roster, run: parts.run });
  return { mission, craftTypes, wingmanRoster, identity, run, recording: parts.recording ?? null } as GameRuntimeSpec;
}

export const recordingOptions = (checkpointInterval: number): RecordingOptions => ({ producer: 'osr-test', checkpointInterval });
