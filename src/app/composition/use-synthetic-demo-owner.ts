/**
 * Holds one synthetic demo owner for the life of a React component. The effect creates it with
 * the browser host and `performance.now`, and disposes it on unmount, a StrictMode re-run or a
 * Fast Refresh before the next one exists. A cleanup failure is reported, never swallowed.
 */
import { useEffect, useState } from 'react';
import { createBrowserSessionHost } from '../../platform/browser/browser-session-host.ts';
import { createSyntheticDemoOwner, type SyntheticDemoOwner } from './synthetic-demo-owner.ts';

export function useSyntheticDemoOwner(): SyntheticDemoOwner | null {
  const [owner, setOwner] = useState<SyntheticDemoOwner | null>(null);
  useEffect(() => {
    const created = createSyntheticDemoOwner(createBrowserSessionHost(), () => performance.now());
    setOwner(created);
    return () => {
      try {
        created.dispose();
      } catch (error) {
        reportError(error);
      }
    };
  }, []);
  return owner;
}
