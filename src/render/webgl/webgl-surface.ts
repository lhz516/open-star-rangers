/**
 * WebGL implementation of the drawing port over the few parts it needs, so its lifecycle runs in
 * Node tests as well as in the browser. The browser factory supplies a Three.js WebGLRenderer, its
 * canvas and the size/pixel-ratio observers; this module wires their events, sizes the drawing
 * buffer and releases everything in the contract's order. Contract: docs/plan/p1/07/spec.md.
 */
import type { Camera, Scene } from 'three';
import { runCleanup } from '../scene/cleanup.ts';
import { GraphicsDeviceError, type RenderGpuStats, type RenderSurface, type RenderSurfaceEvents } from '../scene/render-surface.ts';
import type { ViewportFrame, ViewportLayout } from '../viewport/viewport-layout.ts';

/** The WebGLRenderer members the surface uses. */
export interface WebGLSurfaceRenderer {
  setDrawingBufferSize(width: number, height: number, pixelRatio: number): void;
  render(scene: Scene, camera: Camera): void;
  readonly info: {
    readonly memory: { readonly geometries: number; readonly textures: number };
    readonly programs: readonly unknown[] | null;
  };
  dispose(): void;
}

export type WebGLContextEventType = 'webglcontextlost' | 'webglcontextrestored';

/** The canvas the renderer draws to. */
export interface WebGLSurfaceCanvas {
  addEventListener(type: WebGLContextEventType, listener: () => void): void;
  removeEventListener(type: WebGLContextEventType, listener: () => void): void;
}

export interface WebGLSurfaceParts {
  /** Created before the surface, so its own context handlers run before the surface's. */
  readonly renderer: WebGLSurfaceRenderer;
  readonly canvas: WebGLSurfaceCanvas;
  readonly maxDrawingBufferSize: number;
  /** `WEBGL_lose_context.loseContext`, or null when the device lacks the extension. */
  readonly loseContext: (() => void) | null;
  /** The context's `isContextLost()`, which tells a draw that failed on a lost context from any other failure. */
  readonly isContextLost: () => boolean;
  /** Shows the canvas over a frame inside the container, or hides it for null. */
  placeCanvas(frame: ViewportFrame | null): void;
  removeCanvas(): void;
  /** Reports the container content box (CSS px) now and on every change; returns its cancellation. */
  observeSize(listener: (width: number, height: number) => void): () => void;
  readDevicePixelRatio(): number;
  /** Notifies once the device pixel ratio stops matching `ratio`; returns its cancellation. */
  watchDevicePixelRatio(ratio: number, listener: () => void): () => void;
}

class WebGLSurface implements RenderSurface {
  readonly maxDrawingBufferSize: number;
  readonly #parts: WebGLSurfaceParts;
  #events: RenderSurfaceEvents | null = null;
  #size: { width: number; height: number } | null = null;
  #ratio = 1;
  /** Cancellations of the current observers and listeners, in registration order. */
  #observers: (() => void)[] = [];
  /** Cancels the query for the current pixel ratio; replaced on every change. */
  #stopRatio: (() => void) | null = null;
  #disposed = false;

  constructor(parts: WebGLSurfaceParts) {
    this.#parts = parts;
    this.maxDrawingBufferSize = parts.maxDrawingBufferSize;
  }

  connect(events: RenderSurfaceEvents): void {
    if (this.#events || this.#disposed) throw new Error('A WebGL surface connects once');
    this.#events = events;
    const { canvas } = this.#parts;
    const lost = (): void => { this.#events?.contextLost(); };
    const restored = (): void => { this.#events?.contextRestored(); };
    canvas.addEventListener('webglcontextlost', lost);
    this.#observers.push(() => { canvas.removeEventListener('webglcontextlost', lost); });
    canvas.addEventListener('webglcontextrestored', restored);
    this.#observers.push(() => { canvas.removeEventListener('webglcontextrestored', restored); });
    this.#ratio = this.#parts.readDevicePixelRatio();
    this.#watchRatio();
    this.#observers.push(() => {
      const stop = this.#stopRatio;
      this.#stopRatio = null;
      stop?.();
    });
    this.#observers.push(this.#parts.observeSize((width, height) => {
      this.#size = { width, height };
      this.#emitSize();
    }));
  }

  setLayout(layout: ViewportLayout | null): void {
    if (layout) this.#parts.renderer.setDrawingBufferSize(layout.bufferWidth, layout.bufferHeight, 1);
    this.#parts.placeCanvas(layout?.frame ?? null);
  }

  draw(scene: Scene, camera: Camera): void {
    try {
      this.#parts.renderer.render(scene, camera);
    } catch (cause) {
      if (this.#parts.isContextLost()) throw new GraphicsDeviceError('The WebGL context was lost during a draw', { cause });
      throw cause;
    }
  }

  gpuStats(): RenderGpuStats {
    // The renderer replaces `info` when it restores a lost context, so it is read anew every time.
    const { memory, programs } = this.#parts.renderer.info;
    return { geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0 };
  }

  disconnect(): void {
    this.#events = null;
    const cancellations = this.#observers;
    this.#observers = [];
    runCleanup(cancellations, 'WebGL surface observation cleanup failed');
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const { renderer, loseContext } = this.#parts;
    runCleanup([
      () => { this.disconnect(); },
      () => { renderer.dispose(); },
      ...(loseContext ? [loseContext] : []),
      () => { this.#parts.removeCanvas(); },
    ], 'WebGL surface release failed');
  }

  #watchRatio(): void {
    this.#stopRatio = this.#parts.watchDevicePixelRatio(this.#ratio, () => {
      // The query matched the old ratio only, so it is replaced by one for the new ratio.
      const stop = this.#stopRatio;
      this.#stopRatio = null;
      stop?.();
      if (!this.#events) return;
      this.#ratio = this.#parts.readDevicePixelRatio();
      this.#watchRatio();
      this.#emitSize();
    });
  }

  #emitSize(): void {
    if (this.#events && this.#size) this.#events.resize({ ...this.#size, devicePixelRatio: this.#ratio });
  }
}

/** Takes ownership of the parts; `dispose` releases the renderer, the context and the canvas. */
export function createWebGLSurface(parts: WebGLSurfaceParts): RenderSurface {
  return new WebGLSurface(parts);
}
