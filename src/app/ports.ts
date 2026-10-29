import type { AudioCapability, PageLifecycleHost } from '../platform/audio/audio-controller.ts';
import type { RenderSurface, RenderSurfaceOptions } from '../render/scene/render-surface.ts';
import type { ExpectedPackageProfile } from '../workers/production-package.ts';
import type { ImportWorkerPortFactory } from './import/import-worker-port.ts';
import type { FileSave, LeaveGuard, MonotonicClock, OneShotTimer, SeedSource } from './mission/mission-ports.ts';
import type { PlatformFamily } from '../platform/browser/platform-family.ts';
import type { FullscreenPort } from '../platform/browser/fullscreen.ts';
import type { KeyboardSource, KeyboardZoneBinding } from '../platform/input/keyboard-input.ts';
import type { PointerLockPort } from '../platform/input/pointer-lock.ts';
import type { ResourceCachePort } from './resources/resource-holder.ts';
import type { SessionHost } from './session/session-host.ts';

/** What every mission owner is given from the host (P3-04 S-05, the "应用端口" row of the spec's data model). */
export interface MissionPorts {
  /** Draws the uint32 seed of each world creation attempt. */
  readonly seed: SeedSource;
  /**
   * Draws the uint32 seed of each run's flight presentation random source (P3-12), apart from the world seeds, so a
   * test's world seeds keep their order.
   */
  readonly presentationSeed: SeedSource;
  /** Times placeholders, UI sampling and development frame timing. */
  readonly clock: MonotonicClock;
  /** Schedules the placeholders' one-shot timers. */
  readonly timer: OneShotTimer;
  /** Registers the leave-page confirmation while a run exists. */
  readonly leaveGuard: LeaveGuard;
  /** Creates the session host of each mission owner. */
  readonly createSessionHost: () => SessionHost;
  /** Creates the file save of each owner's development diagnostics; null in production builds, which have none. */
  readonly createFileSave: (() => FileSave) | null;
  /** Creates the browser keyboard source shared by all runs of this owner. */
  readonly createKeyboardSource: () => KeyboardSource & KeyboardZoneBinding<HTMLElement>;
  /** Creates the owner's document fullscreen and keyboard-lock port, or null when unavailable. */
  readonly createFullscreen: () => FullscreenPort | null;
  /** Creates a pointer-lock port whose target follows the input zone as it mounts and unmounts. */
  readonly createPointerLock: (target: () => HTMLElement | null) => PointerLockPort;
  /** The host's platform family, used only for the Alt+F4 notice. */
  readonly platformFamily: () => PlatformFamily;
}

/**
 * What the app shell is built from (P2-11 S-01): the production entry passes the browser implementations and the
 * production package profile; only the development test entry passes synthetic ones. No URL parameter or global switch
 * chooses between them.
 */
export interface AppPorts {
  /** Creates the import Worker port of each job. */
  readonly createImportPort: ImportWorkerPortFactory;
  readonly cache: ResourceCachePort;
  /**
   * The audio of the viewer and of each mission owner's flight sound (P3-14): the capability their controllers use and
   * the page lifecycle they follow. Each creates at most one context and closes it on release.
   */
  readonly audio: { readonly capability: AudioCapability; readonly lifecycle: PageLifecycleHost };
  /**
   * Creates a WebGL 2 surface in a container with its user's options: the viewer's, and each mission owner's flight
   * surface. Throws when WebGL 2 is unavailable, a GraphicsUnavailableError when the device provides none at all; a
   * RollbackError when its failed creation could not be undone.
   */
  readonly createSurface: (container: HTMLElement, options: RenderSurfaceOptions) => RenderSurface;
  /** Which cached package may be restored, and the budget of commits and restores. */
  readonly profile: ExpectedPackageProfile;
  readonly mission: MissionPorts;
  /** Receives errors no screen reports itself. */
  readonly reportError: (error: unknown) => void;
}
