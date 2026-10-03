/**
 * Fixed 4:3 viewport layout: scale to fit, centre, and leave the rest of the container to its black
 * background. Pure arithmetic over CSS pixels and a device pixel ratio, so it runs unchanged in Node.
 * Contract: docs/plan/p1/07/spec.md "画面布局".
 */

/** The Classic default 4:3 picture; the camera projection uses the same aspect. */
export const VIEWPORT_ASPECT_WIDTH = 4;
export const VIEWPORT_ASPECT_HEIGHT = 3;
export const VIEWPORT_ASPECT = VIEWPORT_ASPECT_WIDTH / VIEWPORT_ASPECT_HEIGHT;

/** Synthetic P1 performance cap on the device pixel ratio; not an original-game value. */
export const MAX_PIXEL_RATIO = 2;

export interface ViewportInput {
  /** Container content box, CSS px. */
  readonly width: number;
  readonly height: number;
  /** Non-finite or non-positive values count as 1. */
  readonly devicePixelRatio: number;
  /** Largest drawing buffer side the device accepts; a finite positive integer. */
  readonly maxDrawingBufferSize: number;
}

export interface ViewportFrame {
  /** CSS px inside the container. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportLayout {
  readonly pixelRatio: number;
  /** Drawing buffer, device px. */
  readonly bufferWidth: number;
  readonly bufferHeight: number;
  readonly frame: ViewportFrame;
}

/**
 * Returns null when nothing can be drawn: a non-finite or non-positive container side, or a buffer
 * under one device pixel. Throws RangeError, producing no layout, for an invalid maximum size.
 */
export function computeViewportLayout(input: ViewportInput): ViewportLayout | null {
  const { width, height, devicePixelRatio, maxDrawingBufferSize: max } = input;
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError(`maxDrawingBufferSize must be a finite positive integer, got ${String(max)}`);
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  let pixelRatio = Math.min(Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1, MAX_PIXEL_RATIO);
  // Wide containers are filled by height, narrow ones by width; the buffer keeps 4:3 within one pixel.
  const wide = width / height >= VIEWPORT_ASPECT;
  let bufferWidth: number;
  let bufferHeight: number;
  if (wide) {
    bufferHeight = Math.floor(height * pixelRatio);
    bufferWidth = Math.floor((bufferHeight * VIEWPORT_ASPECT_WIDTH) / VIEWPORT_ASPECT_HEIGHT);
  } else {
    bufferWidth = Math.floor(width * pixelRatio);
    bufferHeight = Math.floor((bufferWidth * VIEWPORT_ASPECT_HEIGHT) / VIEWPORT_ASPECT_WIDTH);
  }
  // The longer (width) side reaches the device limit first; the limit then fills it and lowers the ratio.
  if (bufferWidth > max) {
    if (wide) {
      bufferHeight = Math.floor((max * VIEWPORT_ASPECT_HEIGHT) / VIEWPORT_ASPECT_WIDTH);
      bufferWidth = Math.floor((bufferHeight * VIEWPORT_ASPECT_WIDTH) / VIEWPORT_ASPECT_HEIGHT);
      pixelRatio = bufferHeight / height;
    } else {
      bufferWidth = max;
      bufferHeight = Math.floor((max * VIEWPORT_ASPECT_HEIGHT) / VIEWPORT_ASPECT_WIDTH);
      pixelRatio = bufferWidth / width;
    }
  }
  if (bufferWidth < 1 || bufferHeight < 1) return null;
  const frameWidth = bufferWidth / pixelRatio;
  const frameHeight = bufferHeight / pixelRatio;
  return Object.freeze({
    pixelRatio,
    bufferWidth,
    bufferHeight,
    frame: Object.freeze({
      left: Math.max(0, (width - frameWidth) / 2),
      top: Math.max(0, (height - frameHeight) / 2),
      width: frameWidth,
      height: frameHeight,
    }),
  });
}

export function sameViewportLayout(a: ViewportLayout | null, b: ViewportLayout | null): boolean {
  if (a === null || b === null) return a === b;
  return a.pixelRatio === b.pixelRatio && a.bufferWidth === b.bufferWidth && a.bufferHeight === b.bufferHeight
    && a.frame.left === b.frame.left && a.frame.top === b.frame.top
    && a.frame.width === b.frame.width && a.frame.height === b.frame.height;
}
