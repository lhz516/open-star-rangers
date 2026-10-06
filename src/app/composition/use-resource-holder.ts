/**
 * Holds the app shell's resource holder (P2-11 S-03, S-12). The effect creates it with the ports, which lists the
 * cache, and disposes it on unmount, a StrictMode re-run or a Fast Refresh, so no result reaches a released holder.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { AppPorts } from '../ports.ts';
import { createResourceHolder, type ResourceHolder, type ResourceHolderSnapshot } from '../resources/resource-holder.ts';

export interface ResourceHolderHandle {
  /** Null before the effect runs and between holders. */
  readonly holder: ResourceHolder | null;
  readonly snapshot: ResourceHolderSnapshot | null;
}

export function useResourceHolder({ cache, profile, reportError }: Pick<AppPorts, 'cache' | 'profile' | 'reportError'>): ResourceHolderHandle {
  const [holder, setHolder] = useState<ResourceHolder | null>(null);
  useEffect(() => {
    const created = createResourceHolder({ cache, profile, now: () => performance.now(), reportError });
    setHolder(created);
    return () => {
      setHolder(null);
      created.dispose();
    };
  }, [cache, profile, reportError]);
  const subscribe = useCallback((listener: () => void) => holder?.subscribe(listener) ?? (() => undefined), [holder]);
  const snapshot = useSyncExternalStore(subscribe, () => holder?.getSnapshot() ?? null);
  return { holder, snapshot };
}
