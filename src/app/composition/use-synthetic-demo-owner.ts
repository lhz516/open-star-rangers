/**
 * Holds the synthetic demo owner of one mounted view container, through a visit of the app's demo
 * lifecycle. The effect opens the visit, which creates the WebGL surface in the container, hands it
 * to a new owner with the browser host and `performance.now`, and starts that owner once. It
 * closes the visit on unmount, a StrictMode re-run, a Fast Refresh or a replaced container, so the
 * old owner is released before the next exists; after a cleanup failure no owner is created.
 * Leaving the demo calls `lifecycle.release()` first, so this cleanup then finds the visit closed.
 * Without a container there is no owner. A surface that cannot be created leaves the owner with an
 * unavailable renderer, or a failed initialization when its rollback failed too.
 */
import { useEffect, useState } from 'react';
import { createBrowserSessionHost } from '../../platform/browser/browser-session-host.ts';
import { createBrowserKeyboardSource } from '../../platform/input/browser-keyboard-source.ts';
import { createBrowserWebGLSurface } from '../../render/webgl/browser-webgl-surface.ts';
import { SYNTHETIC_SURFACE } from '../../render/synthetic/synthetic-appearance.ts';
import type { SyntheticRendererOptions } from '../../render/synthetic/synthetic-renderer.ts';
import type { SyntheticDemoLifecycle } from './synthetic-demo-lifecycle.ts';
import { createSyntheticDemoOwner, type SyntheticDemoOwner } from './synthetic-demo-owner.ts';

function createRender(container: HTMLElement): SyntheticRendererOptions {
  const report = (error: unknown): void => { reportError(error); };
  try {
    return { surface: createBrowserWebGLSurface(container, SYNTHETIC_SURFACE), reportError: report };
  } catch (error) {
    return { unavailable: error, reportError: report };
  }
}

export interface SyntheticDemoOwnerHandle {
  /** Null until the container is mounted, between owners, and when none may be created. */
  readonly owner: SyntheticDemoOwner | null;
  /** Callback ref for the view container; a remounted container gets a new owner. */
  readonly containerRef: (element: HTMLElement | null) => void;
}

export function useSyntheticDemoOwner(lifecycle: SyntheticDemoLifecycle): SyntheticDemoOwnerHandle {
  // The element itself, not a ref object, is the effect dependency, so a replaced container re-runs it.
  const [container, containerRef] = useState<HTMLElement | null>(null);
  const [owner, setOwner] = useState<SyntheticDemoOwner | null>(null);
  useEffect(() => {
    if (!container) return;
    const visit = lifecycle.visit();
    // The surface's ownership passes to the owner here; this effect never releases it separately.
    setOwner(visit.open(() => {
      const source = createBrowserKeyboardSource(container);
      return createSyntheticDemoOwner(createBrowserSessionHost(), () => performance.now(), createRender(container), { source });
    }));
    return () => {
      setOwner(null);
      visit.close();
    };
  }, [container, lifecycle]);
  return { owner, containerRef };
}
