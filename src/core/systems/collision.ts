/**
 * Collisions (docs/plan/p3/02/spec.md, CR-07; P3-07 subtask 19 implements their rules): the run of the `collision`
 * stage, the two passes `0x29670` and `0x29934` (H6). Until subtask 19 the stage has no run.
 */
import type { PipelineStage } from './pipeline.ts';

/** The `collision` stage's run. */
export const collisionStage: PipelineStage['run'] = null;
