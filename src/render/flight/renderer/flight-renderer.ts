/**
 * The flight renderer (docs/plan/p3/12/spec.md: 渲染器生命周期, 行为与边界; S-02, AC-02, AC-03): one per mission owner, on
 * the owner's one flight surface, drawing each frame of the owner's current run. It has no loop and requests no frame:
 * the run's frame consumer calls `draw` with the session frame's Render States and projection and the presentation
 * module's cameras, and the renderer reads nothing else.
 *
 * - **Runs:** `beginRun` checks the run's whole GPU plan, then binds one run at a time to its owner, run, package
 *   generation and content identity, with a GPU cache of its own (flight-gpu-cache.ts); the run's end releases it.
 *   Nothing GPU-side outlives the run.
 * - **Frames (S-03, S-12):** the run's scene (scene/flight-scene.ts) gives the frame's visible set and camera, and its
 *   composition (composition/flight-composition.ts) the frame's passes: the layers into the game image, then the screen
 *   stage onto the canvas, submitted together with `RenderSurface.drawPasses`.
 * - **Redraws:** the last frame of the bound run is drawn again, without advancing anything, when the context is
 *   restored and when the layout changes, which both clear the drawing buffer, so a paused or held run, which gets no
 *   frames, keeps its picture.
 * - **States:** `ready`; `context-lost` between the context's loss and its restoration, when nothing is submitted and the
 *   restored renderer draws from the current state, rebuilding only GPU mappings; `unavailable` without a surface;
 *   `failed`; `disposed`. Only the graphics device's own failures leave the session running: the surface could not be
 *   created (`unavailable`), or a draw the surface recognized as the device's (`GraphicsDeviceError`) after the run's
 *   resources were released (`failed`). Any other failure also makes the renderer `failed` at once and is thrown from
 *   `draw`, or, when it happened outside a frame (a layout or a redraw), from the next `draw` or `beginRun`, which
 *   faults the session or blocks the start: nothing falls back silently.
 * - **Diagnostics:** state, successful draws, the last drawn tick and GPU counts, for development diagnostics and E2E.
 */
import { LinearSRGBColorSpace } from 'three';
import type { RenderFrame } from '../../../app/runtime/game-runtime.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import { attemptAll } from '../../scene/cleanup.ts';
import {
  GraphicsDeviceError, type RenderGpuStats, type RenderSurface, type RenderSurfaceOptions, type RenderSurfaceSize,
} from '../../scene/render-surface.ts';
import { computeViewportLayout, sameViewportLayout, type ViewportLayout } from '../../viewport/viewport-layout.ts';
import { COMPOSITION_GPU_PLAN, FlightComposition } from '../composition/flight-composition.ts';
import type { FlightLayer, FlightScreen } from '../composition/flight-layers.ts';
import { logicalTransform } from '../composition/logical-screen.ts';
import { FlightScene, type SceneCameras } from '../scene/flight-scene.ts';
import { checkGpuPlan, EMPTY_GPU_PLAN, FlightGpuCache, isCount, type FlightGpuCounts, type FlightGpuPlan, type FlightRunBinding, type PixelSize } from './flight-gpu-cache.ts';
import { FlightRenderError } from './flight-render-error.ts';

/**
 * The flight surface: its canvas's accessible name, and output without colour-space encoding, so the DATA palette's
 * colours reach the canvas as they are (技术决定 4).
 */
export const FLIGHT_SURFACE: RenderSurfaceOptions = Object.freeze({
  label: 'Flight view',
  outputColorSpace: LinearSRGBColorSpace,
});

export type FlightRendererState = 'ready' | 'context-lost' | 'failed' | 'unavailable' | 'disposed';

/** Only failed and unavailable carry the error. */
export interface FlightRendererStatus {
  readonly state: FlightRendererState;
  readonly error: unknown;
}

export interface FlightRenderDiagnostics {
  readonly state: FlightRendererState;
  /** The bound run, or null. */
  readonly runId: number | null;
  /** Successful draws so far. */
  readonly draws: number;
  /** The Render State tick of the last successful draw, or null. */
  readonly lastTick: number | null;
  /** The surface's counters, or null without a live surface. */
  readonly gpu: RenderGpuStats | null;
  /** The bound run's cache, or null without one. */
  readonly resources: FlightGpuCounts | null;
  readonly layout: ViewportLayout | null;
}

/** What `draw` reads of a session frame, with the presentation module's cameras of its current tick. */
export interface FlightFrame {
  readonly runId: number;
  readonly render: RenderFrame;
  readonly projection: Projection;
  readonly cameras: SceneCameras;
}

/** One run's drawing on the renderer. */
export interface FlightRunRender {
  readonly binding: FlightRunBinding;
  /** The run's GPU cache; released with the run. */
  readonly resources: FlightGpuCache;
  /**
   * Draws the frame when the renderer is ready with a layout: the scene of its Render States and cameras, through the
   * composition's layers (flight-layers.ts); otherwise submits nothing. Throws every failure that is not the graphics
   * device's, and what made the renderer fail before.
   */
  draw(frame: FlightFrame): void;
  /** Adds a layer to the run's composition until the returned, idempotent removal (P3-13 and the passes of 17–22). */
  addLayer(layer: FlightLayer): () => void;
  /** Replaces the default screen stage (the screen flash, 21) until the returned, idempotent removal. */
  setScreen(screen: FlightScreen): () => void;
  /** Releases the run's GPU resources; idempotent. Throws an AggregateError of the failures, after which no run begins. */
  release(): void;
}

export interface FlightRenderer {
  readonly ownerId: number;
  /** Same object until the next state change; usable with useSyncExternalStore. */
  getSnapshot(): FlightRendererStatus;
  /** Notified on state changes only, never after disposal begins. */
  subscribe(listener: () => void): () => void;
  diagnostics(): FlightRenderDiagnostics;
  /**
   * Binds the next run, drawn with its package's `settings`, whose passes will allocate `plan` in all besides the
   * composition's own. Throws `render-capacity` for a plan over budget before anything is allocated, `invalid-input`
   * for unusable settings, and throws while another run is bound, once a run's release failed, once a failure that is
   * not the device's made the renderer fail, and once disposed.
   */
  beginRun(binding: FlightRunBinding, settings: SceneSettings, plan?: FlightGpuPlan): FlightRunRender;
  /** Releases the bound run, then the surface; attempts every step, throws an AggregateError of the failures; idempotent. */
  dispose(): void;
}

export type FlightRendererOptions =
  | { readonly ownerId: number; readonly surface: RenderSurface; readonly reportError: (error: unknown) => void }
  /** The surface could not be created: WebGL 2 is unavailable, and the renderer only reports it. */
  | { readonly ownerId: number; readonly unavailable: unknown; readonly reportError: (error: unknown) => void };

const PATH = 'flightRenderer';
const DRAW = `${PATH}.draw`;

const withComposition = (plan: FlightGpuPlan): FlightGpuPlan => ({
  texels: plan.texels + COMPOSITION_GPU_PLAN.texels,
  vertices: plan.vertices + COMPOSITION_GPU_PLAN.vertices,
  indices: plan.indices + COMPOSITION_GPU_PLAN.indices,
  renderTargets: plan.renderTargets + COMPOSITION_GPU_PLAN.renderTargets,
});

function checkBinding(binding: FlightRunBinding): void {
  const { ownerId, runId, generation, identity } = binding ?? {};
  if (!isCount(ownerId) || !isCount(runId) || !isCount(generation) || typeof identity !== 'string' || identity.length === 0) {
    throw new FlightRenderError('invalid-input', `${PATH}.beginRun`, 'needs non-negative integer owner, run and generation and a content identity');
  }
}

class Renderer implements FlightRenderer {
  readonly ownerId: number;
  readonly #surface: RenderSurface | null;
  readonly #reportError: (error: unknown) => void;
  readonly #listeners = new Set<() => void>();
  #status: FlightRendererStatus;
  /** A failure that is not the device's: thrown by every later draw and start. */
  #fault: { readonly cause: unknown } | null = null;
  #releaseFailed = false;
  #layout: ViewportLayout | null = null;
  #run: RunRender | null = null;
  /** The bound run's last frame, drawn again by a redraw. */
  #last: FlightFrame | null = null;
  #draws = 0;
  #lastTick: number | null = null;

  constructor(ownerId: number, surface: RenderSurface | null, unavailable: unknown, reportError: (error: unknown) => void) {
    this.ownerId = ownerId;
    this.#surface = surface;
    this.#reportError = reportError;
    this.#status = Object.freeze(surface ? { state: 'ready', error: null } : { state: 'unavailable', error: unavailable });
  }

  readonly getSnapshot = (): FlightRendererStatus => this.#status;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#status.state === 'disposed') return () => undefined;
    const entry = (): void => { listener(); };
    this.#listeners.add(entry);
    return () => { this.#listeners.delete(entry); };
  };

  readonly diagnostics = (): FlightRenderDiagnostics => {
    const { state } = this.#status;
    return Object.freeze({
      state,
      runId: this.#run?.binding.runId ?? null,
      draws: this.#draws,
      lastTick: this.#lastTick,
      gpu: this.#surface && state !== 'disposed' ? Object.freeze({ ...this.#surface.gpuStats() }) : null,
      resources: this.#run?.resources.counts() ?? null,
      layout: this.#layout,
    });
  };

  connect(): void {
    this.#surface?.connect({
      resize: (size) => { this.#resize(size); },
      contextLost: () => { if (this.#status.state === 'ready') this.#setStatus('context-lost', null); },
      contextRestored: () => {
        if (this.#status.state !== 'context-lost') return;
        // Three.js restored its own state first; drawing re-uploads the run's resources.
        this.#run?.composition.contentsLost();
        this.#setStatus('ready', null);
        this.#redraw();
      },
    });
  }

  beginRun(binding: FlightRunBinding, settings: SceneSettings, plan: FlightGpuPlan = EMPTY_GPU_PLAN): FlightRunRender {
    const path = `${PATH}.beginRun`;
    this.#requireLive(path);
    checkBinding(binding);
    checkGpuPlan(plan);
    checkGpuPlan(withComposition(plan));
    const scene = new FlightScene(settings?.deviceValues);
    if (binding.ownerId !== this.ownerId) throw new FlightRenderError('invalid-input', path, `binds owner ${binding.ownerId} to the renderer of owner ${this.ownerId}`);
    if (this.#run) throw new FlightRenderError('invalid-state', path, `is not allowed while run ${this.#run.binding.runId} is bound`);
    if (this.#releaseFailed) throw new FlightRenderError('invalid-state', path, 'is not allowed once a run\'s resources could not be released');
    const run = new RunRender(this, new FlightGpuCache(binding, () => this.#maxRenderTarget()), scene);
    this.#run = run;
    this.#last = null;
    return run;
  }

  dispose(): void {
    if (this.#status.state === 'disposed') return;
    // No notification from here on, including a context loss the release itself causes.
    this.#listeners.clear();
    this.#status = Object.freeze({ state: 'disposed', error: null });
    const run = this.#run;
    const surface = this.#surface;
    const errors = attemptAll([
      () => { run?.release(); },
      () => { surface?.disconnect(); },
      () => { surface?.dispose(); },
    ]).flatMap((error) => (error instanceof AggregateError ? error.errors : [error]));
    if (errors.length > 0) throw new AggregateError(errors, 'Flight renderer cleanup failed', { cause: errors[0] });
  }

  /** For the bound run's `draw`. */
  draw(run: RunRender, frame: FlightFrame): void {
    this.#requireLive(DRAW);
    if (this.#run !== run) throw new FlightRenderError('invalid-state', DRAW, 'is not allowed for a run that is no longer bound');
    if (frame.runId !== run.binding.runId) throw new FlightRenderError('invalid-input', DRAW, `got a frame of run ${frame.runId} for run ${run.binding.runId}`);
    this.#last = frame;
    this.#submit(run, frame);
  }

  /** For the bound run's `release`. */
  release(run: RunRender): void {
    if (this.#run === run) {
      this.#run = null;
      this.#last = null;
    }
    try {
      run.resources.dispose();
    } catch (error) {
      this.#releaseFailed = true;
      throw error;
    }
  }

  /** Throws once disposed, and the failure that made the renderer fail, if it was not the device's. */
  #requireLive(path: string): void {
    if (this.#status.state === 'disposed') throw new FlightRenderError('invalid-state', path, 'is not allowed once the renderer is disposed');
    if (this.#fault) throw new FlightRenderError('invalid-state', path, 'is not allowed once the renderer failed', { cause: this.#fault.cause });
  }

  /**
   * Draws `frame` when ready with a layout; otherwise submits nothing. A device failure is handled; any other failure
   * makes the renderer fail and is thrown.
   */
  #submit(run: RunRender, { render, projection, cameras }: FlightFrame): void {
    if (this.#status.state !== 'ready' || this.#layout === null || !this.#surface) return;
    try {
      const scene = run.scene.frame({ render, cameras });
      this.#surface.drawPasses(run.composition.passes({ logical: logicalTransform(this.#layout), render, projection, scene }));
    } catch (cause) {
      if (cause instanceof GraphicsDeviceError) return this.#deviceFailed(run, cause);
      this.#fail(cause);
      throw cause;
    }
    this.#draws += 1;
    this.#lastTick = render.current.tick;
  }

  /** Draws the bound run's last frame again outside a frame; a failure stays in the state for the next draw to throw. */
  #redraw(): void {
    const run = this.#run;
    const last = this.#last;
    if (!run || !last || this.#fault) return;
    try {
      this.#submit(run, last);
    } catch {
      // #submit made the renderer fail with it, or with the RollbackError of a failed device's release.
    }
  }

  /** The device failed a draw: the run's resources are released, so the session continues without the picture. */
  #deviceFailed(run: RunRender, cause: GraphicsDeviceError): void {
    const errors = attemptAll([() => { run.resources.dispose(); }]);
    if (errors.length > 0) {
      this.#releaseFailed = true;
      const error = new RollbackError(cause, errors, 'The flight renderer could not release a failed device\'s resources');
      this.#fail(error);
      throw error;
    }
    this.#setStatus('failed', cause);
  }

  #maxRenderTarget(): PixelSize {
    return this.#layout ? { width: this.#layout.bufferWidth, height: this.#layout.bufferHeight } : { width: 0, height: 0 };
  }

  #resize(size: RenderSurfaceSize): void {
    const { state } = this.#status;
    if (this.#fault || (state !== 'ready' && state !== 'context-lost')) return;
    try {
      const layout = computeViewportLayout({ ...size, maxDrawingBufferSize: this.#surface!.maxDrawingBufferSize });
      if (sameViewportLayout(layout, this.#layout)) return;
      this.#surface!.setLayout(layout);
      this.#layout = layout;
    } catch (cause) {
      // Outside a frame: the next draw or start throws it.
      this.#fail(cause);
      return;
    }
    this.#redraw();
  }

  #fail(cause: unknown): void {
    if (this.#fault) return;
    this.#fault = Object.freeze({ cause });
    this.#setStatus('failed', cause);
  }

  #setStatus(state: FlightRendererState, error: unknown): void {
    if (this.#status.state === 'disposed') return;
    this.#status = Object.freeze({ state, error });
    for (const listener of [...this.#listeners]) {
      if (!this.#listeners.has(listener)) continue;
      try {
        listener();
      } catch (cause) {
        try { this.#reportError(cause); } catch { /* The error outlet itself failed and there is no other one. */ }
      }
    }
  }
}

class RunRender implements FlightRunRender {
  readonly binding: FlightRunBinding;
  readonly resources: FlightGpuCache;
  readonly scene: FlightScene;
  readonly composition: FlightComposition;
  readonly #renderer: Renderer;

  constructor(renderer: Renderer, resources: FlightGpuCache, scene: FlightScene) {
    this.#renderer = renderer;
    this.resources = resources;
    this.binding = resources.binding;
    this.scene = scene;
    this.composition = new FlightComposition(resources);
  }

  draw(frame: FlightFrame): void {
    this.#renderer.draw(this, frame);
  }

  addLayer(layer: FlightLayer): () => void {
    return this.composition.add(layer);
  }

  setScreen(screen: FlightScreen): () => void {
    return this.composition.setScreen(screen);
  }

  release(): void {
    this.#renderer.release(this);
  }
}

/**
 * Creates the renderer of owner `ownerId` and connects a supplied surface, taking ownership of it: if creation fails,
 * the surface is disconnected and disposed before the error is thrown, as a RollbackError if that cleanup also failed.
 */
export function createFlightRenderer(options: FlightRendererOptions): FlightRenderer {
  const { ownerId, reportError } = options;
  if (!isCount(ownerId)) throw new FlightRenderError('invalid-input', `${PATH}.ownerId`, 'must be a non-negative safe integer');
  if (!('surface' in options)) return new Renderer(ownerId, null, options.unavailable, reportError);
  const { surface } = options;
  try {
    const renderer = new Renderer(ownerId, surface, null, reportError);
    renderer.connect();
    return renderer;
  } catch (cause) {
    const errors = attemptAll([() => { surface.disconnect(); }, () => { surface.dispose(); }]);
    if (errors.length === 0) throw cause;
    throw new RollbackError(cause, errors, 'Flight renderer creation and cleanup failed');
  }
}
