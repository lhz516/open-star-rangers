/**
 * Holds one synthetic demo owner for a mounted view container. The effect first creates the WebGL
 * surface in the container and hands it to a new owner with the browser host and `performance.now`;
 * it disposes the owner on unmount, a StrictMode re-run, a Fast Refresh or a replaced container
 * before the next one exists. Without a container there is no owner. A surface that cannot be
 * created leaves the owner with an unavailable renderer. Cleanup failures are reported, never swallowed.
 */
import { useEffect, useState } from 'react';
import { createBrowserSessionHost } from '../../platform/browser/browser-session-host.ts';
import { createBrowserWebGLSurface } from '../../render/webgl/browser-webgl-surface.ts';
import type { SyntheticRendererOptions } from '../../render/synthetic/synthetic-renderer.ts';
import { createSyntheticDemoOwner, type SyntheticDemoOwner } from './synthetic-demo-owner.ts';

function createRender(container: HTMLElement): SyntheticRendererOptions {
  const report = (error: unknown): void => { reportError(error); };
  try {
    return { surface: createBrowserWebGLSurface(container), reportError: report };
  } catch (error) {
    return { unavailable: error, reportError: report };
  }
}

export interface SyntheticDemoOwnerHandle {
  /** Null until the container is mounted and between owners. */
  readonly owner: SyntheticDemoOwner | null;
  /** Callback ref for the view container; a remounted container gets a new owner. */
  readonly containerRef: (element: HTMLElement | null) => void;
}

export function useSyntheticDemoOwner(): SyntheticDemoOwnerHandle {
  // The element itself, not a ref object, is the effect dependency, so a replaced container re-runs it.
  const [container, containerRef] = useState<HTMLElement | null>(null);
  const [owner, setOwner] = useState<SyntheticDemoOwner | null>(null);
  useEffect(() => {
    if (!container) return;
    // The surface's ownership passes to the owner here; this effect never releases it separately.
    const created = createSyntheticDemoOwner(createBrowserSessionHost(), () => performance.now(), createRender(container));
    setOwner(created);
    return () => {
      setOwner(null);
      try {
        created.dispose();
      } catch (error) {
        reportError(error);
      }
    };
  }, [container]);
  return { owner, containerRef };
}
