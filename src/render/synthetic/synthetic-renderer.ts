/**
 * The P1 synthetic renderer: maps each run's Render State to Three.js objects by entity ID, draws
 * only when the session delivers a frame or a layout, run boundary or context restore asks for it,
 * and keeps render failures in its own state so the session never faults because of the picture.
 * It holds the last frame, the scene objects and minimal per-run validation memory, never game
 * facts. Contract: docs/plan/p1/07/spec.md.
 */
import { Color, Mesh, Scene, type PerspectiveCamera } from 'three';
import type { RenderFrame } from '../../app/runtime/synthetic-runtime.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import type { SessionCleanup } from '../../app/session/session-host.ts';
import type { SessionFrame, SessionRun } from '../../app/session/synthetic-session.ts';
import { attemptAll } from '../scene/cleanup.ts';
import type { RenderGpuStats, RenderSurface, RenderSurfaceSize } from '../scene/render-surface.ts';
import { computeViewportLayout, sameViewportLayout, type ViewportLayout } from '../viewport/viewport-layout.ts';
import {
  createSyntheticAppearance, disposeSyntheticAppearance, SYNTHETIC_BACKGROUND_COLOR, type SyntheticAppearance,
} from './synthetic-appearance.ts';
import { createSyntheticCamera } from './synthetic-camera.ts';
import { SyntheticFrameHistory, type SyntheticFramePlan } from './synthetic-render-frame.ts';

export type SyntheticRendererState = 'ready' | 'context-lost' | 'failed' | 'unavailable' | 'disposed';

/** Only failed and unavailable carry the original error. */
export interface SyntheticRendererStatus {
  readonly state: SyntheticRendererState;
  readonly error: unknown;
}

export interface SyntheticRenderDiagnostics {
  readonly state: SyntheticRendererState;
  readonly runId: number | null;
  /** current.tick of the last drawn frame; null for an empty frame or before any draw. */
  readonly drawnTick: number | null;
  /** Successful draws so far. */
  readonly draws: number;
  /** Entity objects in the scene. */
  readonly entities: number;
  /** The renderer's current counters, or null without a live surface. */
  readonly gpu: RenderGpuStats | null;
  readonly layout: ViewportLayout | null;
}

/** Read-only view for React and diagnostics; it cannot draw, attach or dispose. */
export interface SyntheticRendererReader {
  /** Same object until the next state change; usable with useSyncExternalStore. */
  getSnapshot(): SyntheticRendererStatus;
  /** Notified on state changes only, never for draws or layouts, and never after disposal begins. */
  subscribe(listener: () => void): () => void;
  diagnostics(): SyntheticRenderDiagnostics;
}

/**
 * The run access the renderer needs: a P1-06 run binding satisfies it. It cannot submit commands,
 * set input or control the session.
 */
export interface SyntheticRenderBinding {
  readonly run: Pick<SessionRun, 'runId' | 'renderFrame' | 'onFrame' | 'ownCleanup'>;
  isCurrent(): boolean;
  own(cleanup: SessionCleanup): void;
}

export interface SyntheticRenderer extends SyntheticRendererReader {
  /**
   * Draws the run's current frame and then every frame it delivers until it ends. Transactional:
   * on a registration failure it cancels what it registered, newest first, and throws the failure,
   * or a RollbackError when a cancellation also failed. Handles already passed to `own`
   * become harmless no-ops. Does nothing once failed, unavailable or disposed.
   */
  attach(binding: SyntheticRenderBinding): void;
  /**
   * Stops observation, disposes the shared geometries and materials, then the surface; attempts
   * every step, throws an AggregateError of the failures, and is idempotent.
   */
  dispose(): void;
}

export type SyntheticRendererOptions =
  | { readonly surface: RenderSurface; readonly reportError: (error: unknown) => void }
  /** The surface could not be created; the renderer only reports the cause. */
  | { readonly unavailable: unknown; readonly reportError: (error: unknown) => void };

class RunScene {
  readonly runId: number;
  readonly history = new SyntheticFrameHistory();
  readonly meshes = new Map<number, Mesh>();
  /** The run's latest frame. */
  frame: RenderFrame;
  constructor(runId: number, frame: RenderFrame) {
    this.runId = runId;
    this.frame = frame;
  }
}

/** Calls `cleanup` at most once; later calls do nothing. */
function once(cleanup: () => unknown): SessionCleanup {
  let pending = true;
  return () => {
    if (!pending) return;
    pending = false;
    cleanup();
  };
}

/** The renderer when no surface could be created: it only reports why. */
class UnavailableRenderer implements SyntheticRenderer {
  #status: SyntheticRendererStatus;
  constructor(error: unknown) { this.#status = Object.freeze({ state: 'unavailable', error }); }
  readonly getSnapshot = (): SyntheticRendererStatus => this.#status;
  // Its only change, to disposed, is never notified.
  readonly subscribe = (): (() => void) => () => {};
  readonly diagnostics = (): SyntheticRenderDiagnostics => Object.freeze({
    state: this.#status.state, runId: null, drawnTick: null, draws: 0, entities: 0, gpu: null, layout: null,
  });
  attach(): void {}
  dispose(): void { this.#status = Object.freeze({ state: 'disposed', error: null }); }
}

class Renderer implements SyntheticRenderer {
  readonly #surface: RenderSurface;
  readonly #reportError: (error: unknown) => void;
  readonly #listeners = new Set<() => void>();
  readonly #appearance: SyntheticAppearance;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera = createSyntheticCamera();
  #status: SyntheticRendererStatus = Object.freeze({ state: 'ready', error: null });
  #layout: ViewportLayout | null = null;
  /** The attached run; without one the empty frame is drawn. */
  #run: RunScene | null = null;
  #draws = 0;
  #drawnTick: number | null = null;

  constructor(surface: RenderSurface, reportError: (error: unknown) => void) {
    this.#surface = surface;
    this.#reportError = reportError;
    this.#appearance = createSyntheticAppearance();
    this.#scene.background = new Color(SYNTHETIC_BACKGROUND_COLOR);
  }

  readonly getSnapshot = (): SyntheticRendererStatus => this.#status;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#status.state === 'disposed') return () => {};
    // A wrapper keeps repeated subscriptions of one function independent.
    const entry = (): void => { listener(); };
    this.#listeners.add(entry);
    return () => { this.#listeners.delete(entry); };
  };

  readonly diagnostics = (): SyntheticRenderDiagnostics => Object.freeze({
    state: this.#status.state,
    runId: this.#run?.runId ?? null,
    drawnTick: this.#drawnTick,
    draws: this.#draws,
    entities: this.#run?.meshes.size ?? 0,
    gpu: this.#status.state === 'disposed' ? null : Object.freeze({ ...this.#surface.gpuStats() }),
    layout: this.#layout,
  });

  connect(): void {
    this.#surface.connect({
      resize: size => { this.#resize(size); },
      contextLost: () => { this.#contextLost(); },
      contextRestored: () => { this.#contextRestored(); },
    });
  }

  attach(binding: SyntheticRenderBinding): void {
    if (!this.#drawable()) return;
    const registered: SessionCleanup[] = [];
    const register = (cleanup: SessionCleanup): void => {
      const handle = once(cleanup);
      registered.push(handle);
      binding.own(handle);
    };
    let run: RunScene | null = null;
    try {
      register(binding.run.onFrame(notice => { this.#onFrame(run, binding, notice); }));
      register(binding.run.ownCleanup(() => { this.#endRun(run); }));
      run = new RunScene(binding.run.runId, binding.run.renderFrame());
    } catch (cause) {
      const errors = attemptAll(registered.reverse());
      if (errors.length === 0) throw cause;
      throw new RollbackError(cause, errors, 'Renderer attachment and rollback failed');
    }
    if (this.#run) this.#clearRun();
    this.#run = run;
    this.#draw();
  }

  dispose(): void {
    if (this.#status.state === 'disposed') return;
    // No notification from here on, including a context loss caused by the release itself.
    this.#listeners.clear();
    this.#status = Object.freeze({ state: 'disposed', error: null });
    const errors = [
      ...attemptAll([() => { this.#surface.disconnect(); }, () => { if (this.#run) this.#clearRun(); }]),
      ...disposeSyntheticAppearance(this.#appearance),
      ...attemptAll([() => { this.#surface.dispose(); }]),
    ];
    if (errors.length > 0) throw new AggregateError(errors, 'Synthetic renderer cleanup failed', { cause: errors[0] });
  }

  #drawable(): boolean {
    const { state } = this.#status;
    return state === 'ready' || state === 'context-lost';
  }

  #onFrame(run: RunScene | null, binding: SyntheticRenderBinding, notice: SessionFrame): void {
    if (!run || run !== this.#run || !binding.isCurrent()) return;
    run.frame = notice.render;
    this.#draw();
  }

  #endRun(run: RunScene | null): void {
    if (!run || run !== this.#run) return;
    this.#clearRun();
    this.#draw();
  }

  #clearRun(): void {
    for (const mesh of this.#run!.meshes.values()) this.#scene.remove(mesh);
    this.#run = null;
  }

  #resize(size: RenderSurfaceSize): void {
    if (!this.#drawable()) return;
    try {
      const layout = computeViewportLayout({ ...size, maxDrawingBufferSize: this.#surface.maxDrawingBufferSize });
      if (sameViewportLayout(layout, this.#layout)) return;
      this.#surface.setLayout(layout);
      this.#layout = layout;
    } catch (cause) {
      this.#fail(cause);
      return;
    }
    this.#draw();
  }

  #contextLost(): void {
    if (this.#status.state === 'ready') this.#setStatus('context-lost', null);
  }

  #contextRestored(): void {
    if (this.#status.state !== 'context-lost') return;
    this.#setStatus('ready', null);
    this.#draw();
  }

  /**
   * Draws the current frame when ready with a layout. Validates the whole frame before changing
   * the scene and restores the scene if the surface then fails, so any failure leaves the last
   * drawn frame in place and makes the renderer failed.
   */
  #draw(): void {
    if (this.#status.state !== 'ready' || this.#layout === null) return;
    const run = this.#run;
    let plan: SyntheticFramePlan | null = null;
    let undo: (() => void) | null = null;
    try {
      if (run) {
        plan = run.history.plan(run.frame);
        undo = this.#show(run, plan);
      }
      this.#surface.draw(this.#scene, this.#camera);
    } catch (cause) {
      undo?.();
      this.#fail(cause);
      return;
    }
    plan?.commit();
    this.#draws++;
    this.#drawnTick = plan?.tick ?? null;
  }

  /** Makes the run's objects match a validated plan; returns how to put the previous scene back. */
  #show(run: RunScene, plan: SyntheticFramePlan): () => void {
    const before = new Map([...run.meshes].map(([id, mesh]) => [id, { mesh, position: mesh.position.clone() }]));
    const shown = new Set<number>();
    for (const { id, kind, position } of plan.entities) {
      let mesh = run.meshes.get(id);
      if (!mesh) {
        const { geometry, material } = this.#appearance[kind];
        mesh = new Mesh(geometry, material);
        mesh.name = `run-${run.runId}-entity-${id}`;
        run.meshes.set(id, mesh);
        this.#scene.add(mesh);
      }
      mesh.position.set(position.x, position.y, position.z);
      shown.add(id);
    }
    for (const [id, mesh] of run.meshes) {
      if (!shown.has(id)) {
        this.#scene.remove(mesh);
        run.meshes.delete(id);
      }
    }
    return () => {
      for (const mesh of run.meshes.values()) this.#scene.remove(mesh);
      run.meshes.clear();
      for (const [id, { mesh, position }] of before) {
        mesh.position.copy(position);
        run.meshes.set(id, mesh);
        this.#scene.add(mesh);
      }
    };
  }

  #fail(error: unknown): void {
    if (this.#drawable()) this.#setStatus('failed', error);
  }

  /** Never throws: these calls run inside session callbacks, which must not fail because of rendering. */
  #report(error: unknown): void {
    try {
      this.#reportError(error);
    } catch {
      // The error outlet itself failed and there is no other one; dropping it keeps the session healthy.
    }
  }

  #setStatus(state: SyntheticRendererState, error: unknown): void {
    this.#status = Object.freeze({ state, error });
    for (const listener of [...this.#listeners]) {
      if (!this.#listeners.has(listener)) continue;
      try { listener(); } catch (cause) { this.#report(cause); }
    }
  }
}

/**
 * Creates the renderer and connects a supplied surface, taking ownership of it: if creation fails,
 * the surface is disconnected and disposed before the error is thrown, as a RollbackError if that
 * cleanup also failed.
 */
export function createSyntheticRenderer(options: SyntheticRendererOptions): SyntheticRenderer {
  if (!('surface' in options)) return new UnavailableRenderer(options.unavailable);
  const { surface, reportError } = options;
  let renderer: Renderer | null = null;
  try {
    renderer = new Renderer(surface, reportError);
    renderer.connect();
    return renderer;
  } catch (cause) {
    const created = renderer;
    const errors = created
      ? attemptAll([() => { created.dispose(); }]).flatMap(error => (error as AggregateError).errors)
      : attemptAll([() => { surface.disconnect(); }, () => { surface.dispose(); }]);
    if (errors.length === 0) throw cause;
    throw new RollbackError(cause, errors, 'Synthetic renderer creation and cleanup failed');
  }
}
