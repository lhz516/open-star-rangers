import type { ImportJobSnapshot } from '../import/import-job-owner.ts';
import type { PackageCacheState, PackageSummary, ResourceHolderSnapshot } from './resource-holder.ts';

/**
 * The verified statuses of the state ladder (P2-11 spec 状态阶梯), in ladder order. Each holds only under its condition;
 * a finished job alone establishes none beyond `source-identified`, and nothing here means playable.
 */
export type ResourceStatus =
  | 'source-identified'
  | 'partial-conversion'
  | 'complete-viewable'
  | 'saved'
  | 'memory-only'
  | 'saving'
  | 'mission-loadable'
  | 'mission-not-loadable';

/**
 * The statuses established by the job's snapshot and the holder's: the job's source identity while it runs or after
 * it finished; for the held package, a partial conversion or a complete, viewable package that is either saved in this
 * browser or held in memory only, while saving or after a failed or unattempted commit; and, once its logic group was
 * loaded into Core, whether the mission loads.
 */
export function resourceStatuses(holder: ResourceHolderSnapshot, job: ImportJobSnapshot | null = null): readonly ResourceStatus[] {
  const statuses: ResourceStatus[] = [];
  if ((job?.status === 'running' || job?.status === 'finished') && job.identity !== null) statuses.push('source-identified');
  const held = holder.package;
  if (held?.completeness.status === 'incomplete') statuses.push('partial-conversion');
  if (held?.completeness.status === 'complete') {
    statuses.push('complete-viewable');
    if (held.cache.status === 'saved') statuses.push('saved');
    else statuses.push('memory-only');
    if (held.cache.status === 'saving') statuses.push('saving');
  }
  if (held?.mission.status === 'loaded') statuses.push('mission-loadable');
  if (held?.mission.status === 'failed') statuses.push('mission-not-loadable');
  return Object.freeze(statuses);
}

/** The cache state of a complete package not saved in this browser, which may be saved again; null otherwise. */
export const unsavedCache = (summary: PackageSummary | null): Exclude<PackageCacheState, { readonly status: 'saved' }> | null =>
  (summary?.completeness.status === 'complete' && summary.cache.status !== 'saved' ? summary.cache : null);
