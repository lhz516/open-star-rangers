/**
 * The drawing port between DOM-free render logic and a concrete surface. The browser implements it
 * with a WebGL renderer and canvas; Node tests use a recording double from the test support. The
 * port owns observation of container size, device pixel ratio and context loss; the render logic
 * owns layout decisions, scene contents and when to draw. Contract: docs/plan/p1/07/spec.md.
 */
import type { Camera, ColorSpace, Scene } from 'three';
import type { ViewportLayout } from '../viewport/viewport-layout.ts';

/** What the render logic that will draw on a surface chooses when it is created. */
export interface RenderSurfaceOptions {
  /** Accessible name of the canvas. */
  readonly label: string;
  /** The renderer's output colour space; linear shader output is encoded to it before it reaches the canvas. */
  readonly outputColorSpace: ColorSpace;
}

export interface RenderSurfaceSize {
  /** Container content box, CSS px. */
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

export interface RenderGpuStats {
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

/** Surface notifications; none is delivered after `disconnect`. */
export interface RenderSurfaceEvents {
  /** The container size or device pixel ratio changed, or was measured for the first time. */
  resize(size: RenderSurfaceSize): void;
  contextLost(): void;
  /** Delivered after the WebGL renderer restored its own resources. */
  contextRestored(): void;
}

export interface RenderSurface {
  /** Largest drawing buffer side the device accepts. */
  readonly maxDrawingBufferSize: number;
  /** Starts observing and delivering events; called at most once. */
  connect(events: RenderSurfaceEvents): void;
  /** Sizes the drawing buffer and places it in the container; null hides it. */
  setLayout(layout: ViewportLayout | null): void;
  /** Throws a {@link GraphicsDeviceError} when the draw failed because the context is lost. */
  draw(scene: Scene, camera: Camera): void;
  /** Read from the renderer each time, never cached. */
  gpuStats(): RenderGpuStats;
  /** Stops size, pixel-ratio and application context observation; idempotent. */
  disconnect(): void;
  /**
   * Releases the WebGL renderer, then best-effort drops the context if the device supports it,
   * then removes the canvas; attempts every step and is idempotent.
   */
  dispose(): void;
}

/**
 * A failure the surface recognizes as the graphics device being unavailable, such as a draw that threw on a lost
 * context, rather than a defect of what was drawn; `cause` is what the device threw.
 */
export class GraphicsDeviceError extends Error {
  constructor(message: string, options: { readonly cause: unknown }) {
    super(message, options);
    this.name = 'GraphicsDeviceError';
  }
}

/**
 * The surface could not be created because the device provides no WebGL 2 context; nothing was left behind unless a
 * RollbackError carries this as its cause. `cause` is what the renderer threw.
 */
export class GraphicsUnavailableError extends Error {
  constructor(options: { readonly cause: unknown }) {
    super(options.cause instanceof Error ? options.cause.message : 'WebGL 2 is unavailable', options);
    this.name = 'GraphicsUnavailableError';
  }
}
