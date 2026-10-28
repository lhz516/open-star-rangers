/**
 * Browser factory for the WebGL drawing port: creates the canvas and a WebGL 2 `WebGLRenderer`,
 * named and colour-managed as the caller's options say, then hands them with ResizeObserver and
 * resolution media-query watchers to the DOM-free surface.
 * Throws, leaving no canvas in the container, when WebGL 2 is unavailable, as a GraphicsUnavailableError when the
 * canvas provides no WebGL 2 context at all; it never falls back. A RollbackError means the canvas or context it had
 * acquired could not be released.
 */
import { WebGLRenderer } from 'three';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { GraphicsUnavailableError, type RenderSurface, type RenderSurfaceOptions } from '../scene/render-surface.ts';
import { attemptAll } from '../scene/cleanup.ts';
import { createWebGLSurface } from './webgl-surface.ts';

export function createBrowserWebGLSurface(container: HTMLElement, options: RenderSurfaceOptions): RenderSurface {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', options.label);
  Object.assign(canvas.style, { position: 'absolute', display: 'none' });
  let renderer: WebGLRenderer | null = null;
  let loseContext: (() => void) | null = null;
  try {
    // Constructed before any application listener, so Three.js restores its resources first.
    renderer = new WebGLRenderer({ canvas, antialias: false });
    renderer.outputColorSpace = options.outputColorSpace;
    const gl = renderer.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const maxDrawingBufferSize = Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
    const extension = gl.getExtension('WEBGL_lose_context');
    loseContext = extension && (() => { extension.loseContext(); });
    container.append(canvas);
    return createWebGLSurface({
      renderer,
      canvas,
      maxDrawingBufferSize,
      loseContext,
      isContextLost: () => gl.isContextLost(),
      placeCanvas(frame) {
        if (!frame) {
          canvas.style.display = 'none';
          return;
        }
        Object.assign(canvas.style, {
          display: 'block', left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px`,
        });
      },
      removeCanvas() {
        canvas.remove();
      },
      observeSize(listener) {
        const observer = new ResizeObserver(entries => {
          const { width, height } = entries[entries.length - 1].contentRect;
          listener(width, height);
        });
        observer.observe(container);
        return () => { observer.disconnect(); };
      },
      readDevicePixelRatio: () => window.devicePixelRatio,
      watchDevicePixelRatio(ratio, listener) {
        const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
        query.addEventListener('change', listener);
        return () => { query.removeEventListener('change', listener); };
      },
    });
  } catch (cause) {
    // A renderer that failed after acquiring a context leaves it on the canvas, where it can be dropped; a canvas that
    // still yields none after the renderer failed provides no WebGL 2 at all.
    const context = renderer ? null : canvas.getContext('webgl2');
    const dropContext = (): void => {
      if (loseContext) loseContext();
      else context?.getExtension('WEBGL_lose_context')?.loseContext();
    };
    const errors = attemptAll([() => { renderer?.dispose(); }, dropContext, () => { canvas.remove(); }]);
    const error = !renderer && context === null ? new GraphicsUnavailableError({ cause }) : cause;
    if (errors.length === 0) throw error;
    throw new RollbackError(error, errors, 'WebGL surface creation and cleanup failed');
  }
}
