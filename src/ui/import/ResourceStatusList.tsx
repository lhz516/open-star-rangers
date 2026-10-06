import type { ImportJobSnapshot } from '../../app/import/import-job-owner.ts';
import type { ResourceHolderSnapshot } from '../../app/resources/resource-holder.ts';
import { resourceStatuses } from '../../app/resources/resource-status.ts';
import { statusText } from './resource-copy.ts';

export interface ResourceStatusListProps {
  readonly resources: ResourceHolderSnapshot;
  /** The import job, whose identified source is a status of its own. */
  readonly job?: ImportJobSnapshot | null;
  readonly testId: string;
}

/** The verified statuses of the state ladder, each with its `data-status`; nothing when none holds. */
export function ResourceStatusList({ resources, job = null, testId }: ResourceStatusListProps) {
  const statuses = resourceStatuses(resources, job);
  if (statuses.length === 0) return null;
  const cache = resources.package?.cache ?? null;
  return (
    <ul data-testid={testId} className="resource-statuses">
      {statuses.map(status => <li key={status} data-status={status}>{statusText(status, cache)}</li>)}
    </ul>
  );
}
