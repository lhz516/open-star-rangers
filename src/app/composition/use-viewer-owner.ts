/**
 * Holds the viewer owner of one mounted view container, through the app's viewer slot (P2-11 S-07, S-12). The effect
 * opens the slot with the held package, the viewer surface created in the container and the app's audio, and closes it
 * on unmount, a StrictMode re-run, a Fast Refresh or a replaced container, so the old owner is released before the next
 * exists; after a release failure no owner is created. Leaving the viewer closes the slot first, so this cleanup then
 * finds it closed. A surface that cannot be created leaves the owner with an unavailable renderer.
 */
import { useEffect, useState } from 'react';
import { VIEWER_SURFACE } from '../../render/viewer/viewer-presentation.ts';
import { RollbackError } from '../session/rollback-error.ts';
import type { ViewerRendererOptions } from '../../render/viewer/viewer-renderer.ts';
import type { AppPorts } from '../ports.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import type { ViewerLifecycle, ViewerOwner } from '../viewer/viewer-owner.ts';

/** The viewer surface, or why none exists; a surface whose failed creation could not be undone is thrown, so the slot latches. */
function createRender(container: HTMLElement, { createSurface, reportError }: AppPorts): ViewerRendererOptions {
  try {
    return { surface: createSurface(container, VIEWER_SURFACE), reportError };
  } catch (error) {
    if (error instanceof RollbackError) throw error;
    return { unavailable: error, reportError };
  }
}

export interface ViewerOwnerHandle {
  /** Null until the container is mounted, between owners, without a holder and when none may be created. */
  readonly owner: ViewerOwner | null;
  /** Callback ref for the view container; a remounted container gets a new owner. */
  readonly containerRef: (element: HTMLElement | null) => void;
  /** The mounted view container, or null. */
  readonly container: HTMLElement | null;
}

export function useViewerOwner(lifecycle: ViewerLifecycle, ports: AppPorts, holder: ResourceHolder | null): ViewerOwnerHandle {
  // The element itself, not a ref object, is the effect dependency, so a replaced container re-runs it.
  const [container, containerRef] = useState<HTMLElement | null>(null);
  const [owner, setOwner] = useState<ViewerOwner | null>(null);
  useEffect(() => {
    if (!container || !holder) return;
    try {
      // The slot creates the surface only when it creates an owner, which takes it over; this effect never releases it.
      setOwner(lifecycle.open(() => ({ holder, render: createRender(container, ports), audio: ports.audio, reportError: ports.reportError })));
    } catch (error) {
      // The slot has already latched a failed rollback; every creation failure is also reported.
      ports.reportError(error);
    }
    return () => {
      setOwner(null);
      lifecycle.close();
    };
  }, [container, holder, lifecycle, ports]);
  return { owner, containerRef, container };
}
