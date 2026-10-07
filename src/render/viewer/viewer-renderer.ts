/**
 * The resource viewer's renderer (P2-11 S-07): shows one item at a time on a RenderSurface and draws once, synchronously,
 * only when the item, the drawing-buffer layout or a restored context changes the picture. It has no loop and requests
 * no frame. Each shown item gets its own display (viewer-display.ts), which owns every GPU resource it uses, so nothing
 * outlives the item. 2D items are pictures: images, fonts and palettes at a whole scale, centred, and layouts over the
 * whole 4:3 buffer. Rendering failures stay in the renderer's own state. Presentation conventions live in
 * viewer-presentation.ts.
 */
import { Color, OrthographicCamera, Scene } from 'three';
import type { AssetId } from '../../content/asset-id.ts';
import type { ExpandedImage } from '../../content/graphics/expand-image.ts';
import type { FontPayload } from '../../content/graphics/font-payload.ts';
import type { PalettePayload } from '../../content/graphics/palette-payload.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { attemptAll } from '../scene/cleanup.ts';
import type { RenderGpuStats, RenderSurface, RenderSurfaceSize } from '../scene/render-surface.ts';
import { computeViewportLayout, sameViewportLayout, type ViewportLayout } from '../viewport/viewport-layout.ts';
import { createPictureDisplay, type ViewerDisplay } from './viewer-display.ts';
import { glyphSheet, paletteSheet, type PicturePlacement } from './viewer-pictures.ts';

/** One displayable item, holding what the content consumers produced for it. */
export type ViewerItem =
  /** `expandImage` output. */
  | { readonly kind: 'image'; readonly id: AssetId; readonly picture: ExpandedImage }
  /** `composeLayout` output. */
  | { readonly kind: 'layout'; readonly id: AssetId; readonly picture: ExpandedImage }
  | { readonly kind: 'palette'; readonly id: AssetId; readonly palette: PalettePayload }
  | { readonly kind: 'font'; readonly id: AssetId; readonly font: FontPayload };

export type ViewerRendererState = 'ready' | 'context-lost' | 'failed' | 'unavailable' | 'disposed';

/** Only failed and unavailable carry the original error. */
export interface ViewerRendererStatus {
  readonly state: ViewerRendererState;
  readonly error: unknown;
}

export interface ViewerRenderDiagnostics {
  readonly state: ViewerRendererState;
  /** The item shown, or null. */
  readonly item: { readonly kind: ViewerItem['kind']; readonly id: AssetId } | null;
  /** Successful draws so far. */
  readonly draws: number;
  /** The renderer's current counters, or null without a live surface. */
  readonly gpu: RenderGpuStats | null;
  readonly layout: ViewportLayout | null;
  /** Where the item's picture is in the drawing buffer; null without an item or a layout. */
  readonly placement: PicturePlacement | null;
}

export interface ViewerRenderer {
  /** Same object until the next state change; usable with useSyncExternalStore. */
  getSnapshot(): ViewerRendererStatus;
  /** Notified on state changes only, never for draws or layouts, and never after disposal begins. */
  subscribe(listener: () => void): () => void;
  diagnostics(): ViewerRenderDiagnostics;
  /**
   * Shows an item, or nothing for null, releasing what the previous item used first. Showing the item already shown,
   * or one of the same kind, ID and content, changes nothing. Never throws: a failure makes the renderer failed. Does
   * nothing once failed, unavailable or disposed.
   */
  show(item: ViewerItem | null): void;
  /**
   * Stops observation, disposes every geometry, material and texture, then the surface; attempts every step, throws an
   * AggregateError of the failures, and is idempotent.
   */
  dispose(): void;
}

export type ViewerRendererOptions =
  | { readonly surface: RenderSurface; readonly reportError: (error: unknown) => void }
  /** The surface could not be created; the renderer only reports the cause. */
  | { readonly unavailable: unknown; readonly reportError: (error: unknown) => void };

function itemContent(item: ViewerItem): object {
  switch (item.kind) {
    case 'image': case 'layout': return item.picture;
    case 'palette': return item.palette;
    case 'font': return item.font;
  }
}

const sameItem = (a: ViewerItem | null, b: ViewerItem | null): boolean =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id && itemContent(a) === itemContent(b));

/** Builds the item's display in the scene; a picture that fails validation adds nothing. */
function createDisplay(scene: Scene, item: ViewerItem): ViewerDisplay {
  const name = `${item.kind}:${item.id}`;
  switch (item.kind) {
    case 'image': return createPictureDisplay(scene, item.picture, 'integer', name);
    case 'layout': return createPictureDisplay(scene, item.picture, 'cover', name);
    case 'palette': return createPictureDisplay(scene, paletteSheet(item.palette), 'integer', name);
    case 'font': return createPictureDisplay(scene, glyphSheet(item.font), 'integer', name);
  }
}

/** The renderer when no surface could be created: it only reports why. */
class UnavailableRenderer implements ViewerRenderer {
  #status: ViewerRendererStatus;
  constructor(error: unknown) { this.#status = Object.freeze({ state: 'unavailable', error }); }
  readonly getSnapshot = (): ViewerRendererStatus => this.#status;
  // Its only change, to disposed, is never notified.
  readonly subscribe = (): (() => void) => () => {};
  readonly diagnostics = (): ViewerRenderDiagnostics => Object.freeze({
    state: this.#status.state, item: null, draws: 0, gpu: null, layout: null, placement: null,
  });
  show(): void {}
  dispose(): void { this.#status = Object.freeze({ state: 'disposed', error: null }); }
}

class Renderer implements ViewerRenderer {
  readonly #surface: RenderSurface;
  readonly #reportError: (error: unknown) => void;
  readonly #listeners = new Set<() => void>();
  readonly #scene = new Scene();
  /** Draws the background alone when nothing is shown. */
  readonly #emptyCamera = new OrthographicCamera();
  #status: ViewerRendererStatus = Object.freeze({ state: 'ready', error: null });
  #layout: ViewportLayout | null = null;
  #shown: { readonly item: ViewerItem; readonly display: ViewerDisplay } | null = null;
  #placement: PicturePlacement | null = null;
  #draws = 0;

  constructor(surface: RenderSurface, reportError: (error: unknown) => void) {
    this.#surface = surface;
    this.#reportError = reportError;
    this.#scene.background = new Color(0, 0, 0);
  }

  readonly getSnapshot = (): ViewerRendererStatus => this.#status;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#status.state === 'disposed') return () => {};
    // A wrapper keeps repeated subscriptions of one function independent.
    const entry = (): void => { listener(); };
    this.#listeners.add(entry);
    return () => { this.#listeners.delete(entry); };
  };

  readonly diagnostics = (): ViewerRenderDiagnostics => {
    const item = this.#shown?.item;
    return Object.freeze({
      state: this.#status.state,
      item: item ? Object.freeze({ kind: item.kind, id: item.id }) : null,
      draws: this.#draws,
      gpu: this.#status.state === 'disposed' ? null : Object.freeze({ ...this.#surface.gpuStats() }),
      layout: this.#layout,
      placement: this.#placement,
    });
  };

  connect(): void {
    this.#surface.connect({
      resize: size => { this.#resize(size); },
      contextLost: () => { if (this.#status.state === 'ready') this.#setStatus('context-lost', null); },
      contextRestored: () => {
        if (this.#status.state !== 'context-lost') return;
        this.#setStatus('ready', null);
        this.#draw();
      },
    });
  }

  show(item: ViewerItem | null): void {
    if (!this.#drawable() || sameItem(item, this.#shown?.item ?? null)) return;
    try {
      // The next display exists before the previous one is released, so a failed build leaves the scene unchanged.
      const next = item ? { item, display: createDisplay(this.#scene, item) } : null;
      const errors = this.#release();
      this.#shown = next;
      if (errors.length > 0) throw new AggregateError(errors, 'Viewer item release failed', { cause: errors[0] });
      this.#place();
    } catch (cause) {
      this.#fail(cause);
      return;
    }
    this.#draw();
  }

  dispose(): void {
    if (this.#status.state === 'disposed') return;
    // No notification from here on, including a context loss caused by the release itself.
    this.#listeners.clear();
    this.#status = Object.freeze({ state: 'disposed', error: null });
    const errors = [
      ...attemptAll([() => { this.#surface.disconnect(); }]),
      ...this.#release(),
      ...attemptAll([() => { this.#surface.dispose(); }]),
    ];
    if (errors.length > 0) throw new AggregateError(errors, 'Viewer renderer cleanup failed', { cause: errors[0] });
  }

  #drawable(): boolean {
    const { state } = this.#status;
    return state === 'ready' || state === 'context-lost';
  }

  /** Releases the shown item's display; returns its failures. */
  #release(): unknown[] {
    const shown = this.#shown;
    this.#shown = null;
    return shown ? shown.display.dispose() : [];
  }

  #place(): void {
    this.#placement = this.#layout && this.#shown ? this.#shown.display.place(this.#layout) : null;
  }

  #resize(size: RenderSurfaceSize): void {
    if (!this.#drawable()) return;
    try {
      const layout = computeViewportLayout({ ...size, maxDrawingBufferSize: this.#surface.maxDrawingBufferSize });
      if (sameViewportLayout(layout, this.#layout)) return;
      this.#surface.setLayout(layout);
      this.#layout = layout;
      this.#place();
    } catch (cause) {
      this.#fail(cause);
      return;
    }
    this.#draw();
  }

  /** Draws the current scene when ready with a layout; a failure makes the renderer failed. */
  #draw(): void {
    if (this.#status.state !== 'ready' || this.#layout === null) return;
    try {
      this.#surface.draw(this.#scene, this.#shown?.display.camera ?? this.#emptyCamera);
    } catch (cause) {
      this.#fail(cause);
      return;
    }
    this.#draws++;
  }

  #fail(error: unknown): void {
    if (this.#drawable()) this.#setStatus('failed', error);
  }

  #setStatus(state: ViewerRendererState, error: unknown): void {
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

/**
 * Creates the renderer and connects a supplied surface, taking ownership of it: if creation fails, the surface is
 * disconnected and disposed before the error is thrown, as a RollbackError if that cleanup also failed.
 */
export function createViewerRenderer(options: ViewerRendererOptions): ViewerRenderer {
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
    throw new RollbackError(cause, errors, 'Viewer renderer creation and cleanup failed');
  }
}
