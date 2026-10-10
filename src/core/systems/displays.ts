/**
 * The cockpit display step (docs/plan/p3/02/spec.md, CR-07, CR-10; P3-07 subtask 16 implements it): the run of the
 * `frame-end` stage, where Core reproduces the rule state the original's cockpit gauges write, the right display's
 * target clearing (T7, from subtask 13's targeting.ts) and the status display's subsystem fields 1, 5 and 8 (D9).
 * Until subtask 16 the stage has no run.
 */
import type { PipelineStage } from './pipeline.ts';

/** The `frame-end` stage's run. */
export const frameEndStage: PipelineStage['run'] = null;
