import { BROWSER_AUDIO, BROWSER_PAGE_LIFECYCLE } from '../platform/audio/browser-audio-controller.ts';
import { createResourceCache } from '../platform/storage/browser-resource-cache.ts';
import { browserImportWorkerFactory } from '../platform/workers/browser-import-worker.ts';
import { createBrowserWebGLSurface } from '../render/webgl/browser-webgl-surface.ts';
import { PRODUCTION_PACKAGE } from '../workers/production-package.ts';
import type { AppPorts } from './ports.ts';

/** The production ports: the real import Worker, IndexedDB cache, Web Audio and WebGL 2, and the production profile. */
export function createBrowserPorts(): AppPorts {
  return Object.freeze({
    createImportPort: browserImportWorkerFactory(),
    cache: createResourceCache(),
    audio: Object.freeze({ capability: BROWSER_AUDIO, lifecycle: BROWSER_PAGE_LIFECYCLE }),
    createSurface: createBrowserWebGLSurface,
    profile: PRODUCTION_PACKAGE,
    reportError: (error: unknown) => { reportError(error); },
  });
}
