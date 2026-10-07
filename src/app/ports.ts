import type { AudioCapability, PageLifecycleHost } from '../platform/audio/audio-controller.ts';
import type { RenderSurface, RenderSurfaceOptions } from '../render/scene/render-surface.ts';
import type { ExpectedPackageProfile } from '../workers/production-package.ts';
import type { ImportWorkerPortFactory } from './import/import-worker-port.ts';
import type { ResourceCachePort } from './resources/resource-holder.ts';

/**
 * What the app shell is built from (P2-11 S-01): the production entry passes the browser implementations and the
 * production package profile; only the development test entry passes synthetic ones. No URL parameter or global switch
 * chooses between them.
 */
export interface AppPorts {
  /** Creates the import Worker port of each job. */
  readonly createImportPort: ImportWorkerPortFactory;
  readonly cache: ResourceCachePort;
  /** The viewer's audio: the capability its controller uses and the page lifecycle it follows. */
  readonly audio: { readonly capability: AudioCapability; readonly lifecycle: PageLifecycleHost };
  /** Creates the viewer's WebGL 2 surface in a container with the viewer's options; throws when WebGL 2 is unavailable. */
  readonly createSurface: (container: HTMLElement, options: RenderSurfaceOptions) => RenderSurface;
  /** Which cached package may be restored, and the budget of commits and restores. */
  readonly profile: ExpectedPackageProfile;
  /** Receives errors no screen reports itself. */
  readonly reportError: (error: unknown) => void;
}
