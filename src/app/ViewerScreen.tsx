/**
 * The viewer screen: the viewer page with its owner (P2-11 S-07, S-12). A module of its own, so a Fast Refresh of the
 * owner hook re-runs this screen's effects only, and the app shell keeps its resource holder; the replaced owner
 * resumes the selection and view.
 */
import { ViewerPage } from '../ui/viewer/ViewerPage.tsx';
import { useViewerOwner } from './composition/use-viewer-owner.ts';
import type { AppPorts } from './ports.ts';
import type { ResourceHolder, ResourceHolderSnapshot } from './resources/resource-holder.ts';
import type { ViewerLifecycle } from './viewer/viewer-owner.ts';

/** Creates and releases the viewer owner with the screen's picture area. */
export function ViewerScreen({ lifecycle, ports, holder, resources, onReturn }: {
  readonly lifecycle: ViewerLifecycle;
  readonly ports: AppPorts;
  readonly holder: ResourceHolder | null;
  readonly resources: ResourceHolderSnapshot | null;
  readonly onReturn: () => void;
}) {
  const { owner, containerRef, container } = useViewerOwner(lifecycle, ports, holder);
  return <ViewerPage viewer={owner} viewRef={containerRef} view={container} resources={resources} onReturn={onReturn} />;
}
