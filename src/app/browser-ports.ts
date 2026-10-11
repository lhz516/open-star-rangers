import { BROWSER_AUDIO, BROWSER_PAGE_LIFECYCLE } from '../platform/audio/browser-audio-controller.ts';
import { createBrowserFullscreen } from '../platform/browser/browser-fullscreen.ts';
import { readBrowserPlatformFamily } from '../platform/browser/browser-platform-family.ts';
import { createBrowserSeedSource } from '../platform/browser/browser-seed.ts';
import { createBrowserSessionHost } from '../platform/browser/browser-session-host.ts';
import { createBrowserClock, createBrowserTimer } from '../platform/browser/browser-timer.ts';
import { createLeaveGuard } from '../platform/browser/leave-guard.ts';
import { createBrowserKeyboardSource } from '../platform/input/browser-keyboard-source.ts';
import { createBrowserPointerLock } from '../platform/input/browser-pointer-lock.ts';
import { createResourceCache } from '../platform/storage/browser-resource-cache.ts';
import { browserImportWorkerFactory } from '../platform/workers/browser-import-worker.ts';
import { createBrowserWebGLSurface } from '../render/webgl/browser-webgl-surface.ts';
import { PRODUCTION_PACKAGE } from '../workers/production-package.ts';
import type { AppPorts } from './ports.ts';

/**
 * The development file save, loaded before this module finishes evaluating. Production builds fold the branch away
 * with the dynamic import, so they contain no part of the adapter.
 */
const createFileSave = import.meta.env.DEV ? (await import('../platform/files/browser-file-save.ts')).createBrowserFileSave : null;

/**
 * The production ports: the real import Worker, IndexedDB cache, Web Audio and WebGL 2, the production profile, and the
 * mission's crypto seeds, `performance.now`, `setTimeout`, `beforeunload` guard and animation frames, with the file save
 * in development builds only.
 */
export function createBrowserPorts(): AppPorts {
  return Object.freeze({
    createImportPort: browserImportWorkerFactory(),
    cache: createResourceCache(),
    audio: Object.freeze({ capability: BROWSER_AUDIO, lifecycle: BROWSER_PAGE_LIFECYCLE }),
    createSurface: createBrowserWebGLSurface,
    profile: PRODUCTION_PACKAGE,
    mission: Object.freeze({
      seed: createBrowserSeedSource(),
      clock: createBrowserClock(),
      timer: createBrowserTimer(),
      leaveGuard: createLeaveGuard(window),
      createSessionHost: createBrowserSessionHost,
      createFileSave,
      createKeyboardSource: createBrowserKeyboardSource,
      createFullscreen: createBrowserFullscreen,
      createPointerLock: createBrowserPointerLock,
      platformFamily: readBrowserPlatformFamily,
    }),
    reportError: (error: unknown) => { reportError(error); },
  });
}
