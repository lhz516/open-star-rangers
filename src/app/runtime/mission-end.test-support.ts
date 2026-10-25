import type { RecordingOptions } from '../../core/replay/recording.ts';
import { successInput, thirdLossInput } from '../../core/replay/mission-end.test-support.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import type { GameRuntimeSpec } from './game-runtime.ts';

// Runtime specs of Core's synthetic runs that end the mission from their inputs alone (code-generated content, never
// original data), at the Runtime's default step: a success through the all-clear, whose run completes at
// SUCCESS_COMPLETION_TICK, and a failure through two real energy rescues (G-02/6) and a third loss, if the player keeps
// spending energy (`speed` `maximum` now and then).

export const SUCCESS_COMPLETION_TICK = 647;

function spec(input: CreateWorldInput, recording: RecordingOptions | null): GameRuntimeSpec {
  const run: Record<string, unknown> = { ...input.run };
  delete run.clockUnitsPerTick;
  return { ...input, run, recording } as unknown as GameRuntimeSpec;
}

export const successSpec = (recording: RecordingOptions | null = null): GameRuntimeSpec => spec(successInput(), recording);
export const thirdLossSpec = (recording: RecordingOptions | null = null): GameRuntimeSpec => spec(thirdLossInput(), recording);
