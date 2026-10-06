import type { CacheCatalogState, PackageCacheState } from '../../app/resources/resource-holder.ts';
import type { ResourceStatus } from '../../app/resources/resource-status.ts';

// Page copy of the verified resource states (P2-11 spec 状态阶梯). Nothing here claims the content is playable.

export const STATUS_TEXT: Readonly<Record<ResourceStatus, string>> = Object.freeze({
  'source-identified': 'Source identified',
  'partial-conversion': 'Partial conversion: not a usable resource package',
  'complete-viewable': 'Complete resources, viewable',
  saved: 'Saved in this browser',
  'memory-only': 'Held in memory only',
  saving: 'Saving in this browser',
  'mission-loadable': 'Mission loads into Core',
  'mission-not-loadable': 'Mission does not load into Core',
});

/** A page-clock duration for display: whole milliseconds below a second, seconds with two decimals above. */
export const formatDuration = (milliseconds: number): string =>
  (milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(2)} s`);

/** The status text, with the time of the commit or restore that saved the package. */
export function statusText(status: ResourceStatus, cache: PackageCacheState): string {
  if (status !== 'saved' || cache.status !== 'saved') return STATUS_TEXT[status];
  return `${STATUS_TEXT.saved} (${cache.via === 'commit' ? 'saved' : 'restored and verified'} in ${formatDuration(cache.durationMs)})`;
}

/** What the browser storage holds while no package is held. */
export function catalogText(catalog: CacheCatalogState | null): string {
  if (catalog === null || catalog.status === 'checking') return 'Checking browser storage…';
  if (catalog.status === 'unavailable') return 'Browser storage is unavailable.';
  return catalog.restorable === null ? 'None in this browser.' : 'Saved resources found in this browser, not yet verified.';
}
