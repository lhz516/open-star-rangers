/**
 * Energy (docs/plan/p3/02/spec.md, CR-05, CR-07; P3-07 subtask 16 implements its rules): the `energy` and
 * `damage-report` commands and the run of the `energy` stage (`0x30590`, D14). Until subtask 16, the commands keep
 * their not-implemented results and the stage has no run.
 */
import { rejectNotImplemented, type CommandOf } from './commands.ts';
import type { PipelineStage, TickContext } from './pipeline.ts';

/** Judges a level or left-page command (D10, D15). */
export function judgeEnergyCommand(context: TickContext, command: CommandOf<'energy' | 'damage-report'>, commandIndex: number): void {
  rejectNotImplemented(context, command, commandIndex);
}

/** The `energy` stage's run. */
export const energyStage: PipelineStage['run'] = null;
