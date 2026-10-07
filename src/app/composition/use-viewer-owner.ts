/**
 * Holds the viewer owner of one mounted view container, through the app's viewer slot (P2-11 S-07, S-12). The effect
 * opens the slot with the held package, the viewer surface created in the container and the app's audio, and closes it
 * on unmount, a StrictMode re-run, a Fast Refresh or a replaced container, so the old owner is released before the next
 * exists; after a release failure no owner is created. Leaving the viewer closes the slot first, so this cleanup then
 * finds it closed. A surface that cannot be created leaves the owner with an unavailable renderer. An owner replaced
 * while the screen stays, as on a StrictMode re-run or a Fast Refresh, hands its selection and view to the next.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { VIEWER_SURFACE } from '../../render/viewer/viewer-presentation.ts';
import { RollbackError } from '../session/rollback-error.ts';
import type { ViewerRendererOptions } from '../../render/viewer/viewer-renderer.ts';
import type { AppPorts } from '../ports.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import type { ViewerLifecycle, ViewerOwner, ViewerOwnerOptions, ViewerStart } from '../viewer/viewer-owner.ts';

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
  /** What the last owner showed when it was released, kept with the screen for the owner that replaces it. */
  const resume = useRef<ViewerStart | null>(null);
  /**
   * The next owner's options. Memoized, so a Fast Refresh of this hook, which rebuilds it, re-runs the effect below and
   * replaces the owner with the edited code: under StrictMode React re-runs an effect on a refresh only through such
   * rebuilt dependencies, as `useImportJob` does with its hand-off.
   */
  const optionsFor = useCallback((element: HTMLElement, held: ResourceHolder): ViewerOwnerOptions => ({
    holder: held, render: createRender(element, ports), audio: ports.audio, reportError: ports.reportError, initial: resume.current,
  }), [ports]);
  useEffect(() => {
    if (!container || !holder) return;
    let opened: ViewerOwner | null = null;
    try {
      // The slot creates the surface only when it creates an owner, which takes it over; this effect never releases it.
      opened = lifecycle.open(() => optionsFor(container, holder));
      setOwner(opened);
    } catch (error) {
      // The slot has already latched a failed rollback; every creation failure is also reported.
      ports.reportError(error);
    }
    return () => {
      if (opened) {
        const { selected, variant, view } = opened.getSnapshot();
        resume.current = { selected, variant, view };
      }
      setOwner(null);
      lifecycle.close();
    };
  }, [container, holder, lifecycle, optionsFor, ports]);
  return { owner, containerRef, container };
}
