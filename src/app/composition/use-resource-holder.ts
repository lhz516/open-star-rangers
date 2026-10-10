/**
 * Holds the app shell's resource holder (P2-11 S-03, S-12). The effect creates it with the ports, which lists the
 * cache. On unmount, a StrictMode re-run or a Fast Refresh of the shell it releases the mission slot first and then
 * disposes the holder (docs/plan/p3/04/spec.md, 应用流程: 替换与外壳释放): `dispose()` notifies no listener, so the
 * mission's consumers are released while the package they read is still held, whatever order React runs the screens'
 * effects in. No result reaches a released holder.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { teardownMissionAndHolder, type MissionSlot } from './mission-slot.ts';
import type { AppPorts } from '../ports.ts';
import { createResourceHolder, type ResourceHolder, type ResourceHolderSnapshot } from '../resources/resource-holder.ts';

export interface ResourceHolderHandle {
  /** Null before the effect runs and between holders. */
  readonly holder: ResourceHolder | null;
  readonly snapshot: ResourceHolderSnapshot | null;
}

export function useResourceHolder(
  { cache, profile, reportError }: Pick<AppPorts, 'cache' | 'profile' | 'reportError'>,
  slot: Pick<MissionSlot, 'release'>,
): ResourceHolderHandle {
  const [holder, setHolder] = useState<ResourceHolder | null>(null);
  /**
   * Memoized, so a Fast Refresh of the shell or of this hook, which rebuilds it, re-runs the effect below: the refreshed
   * shell drops its package, after releasing the mission, and returns to the menu (P3-04 应用流程). Under StrictMode an
   * effect whose dependencies are all props and state is not re-run by a refresh.
   */
  const create = useCallback(
    () => createResourceHolder({ cache, profile, now: () => performance.now(), reportError }),
    [cache, profile, reportError],
  );
  useEffect(() => {
    const created = create();
    setHolder(created);
    return () => {
      setHolder(null);
      teardownMissionAndHolder(slot, created);
    };
  }, [create, slot]);
  const subscribe = useCallback((listener: () => void) => holder?.subscribe(listener) ?? (() => undefined), [holder]);
  const snapshot = useSyncExternalStore(subscribe, () => holder?.getSnapshot() ?? null);
  return { holder, snapshot };
}
