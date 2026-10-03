/**
 * Holds one synthetic demo owner for the life of a React component. The effect first creates the
 * WebGL surface in the supplied container and hands it to a new owner with the browser host and
 * `performance.now`; it disposes the owner on unmount, a StrictMode re-run or a Fast Refresh before
 * the next one exists. A surface that cannot be created leaves the owner with an unavailable
 * renderer. Cleanup failures are reported, never swallowed.
 */
import { useEffect, useState, type RefObject } from 'react';
import { createBrowserSessionHost } from '../../platform/browser/browser-session-host.ts';
import { createBrowserWebGLSurface } from '../../render/webgl/browser-webgl-surface.ts';
import type { SyntheticRendererOptions } from '../../render/synthetic/synthetic-renderer.ts';
import { createSyntheticDemoOwner, type SyntheticDemoOwner } from './synthetic-demo-owner.ts';

function createRender(container: HTMLElement | null): SyntheticRendererOptions {
  const report = (error: unknown): void => { reportError(error); };
  if (!container) return { unavailable: new Error('The synthetic view has no container'), reportError: report };
  try {
    return { surface: createBrowserWebGLSurface(container), reportError: report };
  } catch (error) {
    return { unavailable: error, reportError: report };
  }
}

export function useSyntheticDemoOwner(container: RefObject<HTMLElement | null>): SyntheticDemoOwner | null {
  const [owner, setOwner] = useState<SyntheticDemoOwner | null>(null);
  useEffect(() => {
    // The surface's ownership passes to the owner here; this effect never releases it separately.
    const created = createSyntheticDemoOwner(createBrowserSessionHost(), () => performance.now(), createRender(container.current));
    setOwner(created);
    return () => {
      try {
        created.dispose();
      } catch (error) {
        reportError(error);
      }
    };
  }, [container]);
  return owner;
}
