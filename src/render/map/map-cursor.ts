/**
 * The project's map cursor (docs/plan/p3/05/spec.md 战略地图输入 可见光标): a crosshair over the main map at the input
 * position, redrawn from the existing session frame. It is a project cursor, not the original's selection box or
 * pointer, and draws only: it owns no map rule, timer or frame loop. This module computes which buffer pixels to clear
 * and fill and reports readiness; the browser module supplies the canvas.
 */
import { MAX_PIXEL_RATIO, type ViewportFrame } from '../viewport/viewport-layout.ts';
import { checkMapInputGeometry, clampMapPosition, type MapInputGeometry, type MapInputGeometryPort, type MapPosition } from './map-input-geometry.ts';

/** Whole drawing-buffer pixels. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Drawing buffer of a canvas covering the frame, device px. */
export interface BufferSize {
  readonly width: number;
  readonly height: number;
}

/** Project appearance: crosshair arm and bar thickness in logical screen px, and the fill colour. */
export const MAP_CURSOR_STYLE = Object.freeze({ arm: 6, thickness: 1, colour: '#ffe14d' });

export interface MapCursorShape {
  /** Holds every filled pixel; the next change clears it. */
  readonly bounds: PixelRect;
  readonly fills: readonly PixelRect[];
}

const rect = (x: number, y: number, width: number, height: number): PixelRect => Object.freeze({ x, y, width, height });

function intersect(a: PixelRect, b: PixelRect): PixelRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return rect(x, y, Math.min(a.x + a.width, b.x + b.width) - x, Math.min(a.y + a.height, b.y + b.height) - y);
}

function union(a: PixelRect, b: PixelRect): PixelRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x + a.width, b.x + b.width) - x, Math.max(a.y + a.height, b.y + b.height) - y);
}

const sameRect = (a: PixelRect, b: PixelRect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** The main map's whole buffer pixels, or null when it covers none. */
export function mapBufferArea({ screen, mainMap }: MapInputGeometry, buffer: BufferSize): PixelRect | null {
  const scaleX = buffer.width / screen.width;
  const scaleY = buffer.height / screen.height;
  const left = Math.round(mainMap.left * scaleX);
  const top = Math.round(mainMap.top * scaleY);
  const width = Math.round(mainMap.right * scaleX) - left;
  const height = Math.round(mainMap.bottom * scaleY) - top;
  return width > 0 && height > 0 ? rect(left, top, width, height) : null;
}

/**
 * The crosshair at a position, or null when the main map covers no buffer pixel. Both bars have an odd width centred
 * on the centre pixel, which is clamped onto the main map; the bars are clipped to it, so every edge and corner cuts
 * the crosshair alike and only the arms over the map remain. Throws RangeError for a non-finite position.
 */
export function mapCursorShape(geometry: MapInputGeometry, position: MapPosition, buffer: BufferSize): MapCursorShape | null {
  const { right, down } = clampMapPosition(position);
  const area = mapBufferArea(geometry, buffer);
  if (!area) return null;
  const { screen, mainMap } = geometry;
  const scaleX = buffer.width / screen.width;
  const scaleY = buffer.height / screen.height;
  const scale = Math.min(scaleX, scaleY);
  const half = Math.floor((MAP_CURSOR_STYLE.thickness * scale) / 2);
  const arm = Math.max(half + 1, Math.round(MAP_CURSOR_STYLE.arm * scale));
  const x = Math.floor((mainMap.left + right * (mainMap.right - mainMap.left)) * scaleX);
  const y = Math.floor((mainMap.top + down * (mainMap.bottom - mainMap.top)) * scaleY);
  const centreX = Math.min(area.x + area.width - 1, Math.max(area.x, x));
  const centreY = Math.min(area.y + area.height - 1, Math.max(area.y, y));
  const horizontal = intersect(rect(centreX - arm, centreY - half, 2 * arm + 1, 2 * half + 1), area);
  const vertical = intersect(rect(centreX - half, centreY - arm, 2 * half + 1, 2 * arm + 1), area);
  return Object.freeze({ bounds: union(horizontal, vertical), fills: Object.freeze([horizontal, vertical]) });
}

/** The canvas the drawer paints on, positioned over the frame inside the container. */
export interface MapCursorCanvas {
  /** Shows the canvas over `frame`, CSS px inside the container. */
  show(frame: ViewportFrame): void;
  hide(): void;
  /** Sets the drawing buffer, device px, which also clears it. */
  resize(width: number, height: number): void;
  clear(area: PixelRect): void;
  fill(area: PixelRect, colour: string): void;
  readDevicePixelRatio(): number;
  /** Takes the canvas off the page. */
  remove(): void;
}

/** The input owner's read-only cursor position; null hides the cursor. */
export interface MapCursorPositionPort {
  read(): MapPosition | null;
}

export interface MapCursorDrawer {
  /**
   * Paints for one session frame and returns `ready`. Hides the canvas when not ready. Throws MapInputGeometryError for
   * an invalid geometry, RangeError for a non-finite position and any canvas failure, after hiding the canvas and
   * leaving `ready` false; the next draw then resizes the buffer, which clears a partial paint, and repaints.
   */
  draw(): boolean;
  /**
   * Whether the latest draw could show the cursor: a presentable geometry whose main map covers buffer pixels. Callers
   * hide the system pointer only while it is true. False before the first draw and after dispose.
   */
  readonly ready: boolean;
  dispose(): void;
}

const sameFrame = (a: ViewportFrame | null, b: ViewportFrame): boolean =>
  a !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

const sameShape = (a: MapCursorShape | null, b: MapCursorShape | null): boolean =>
  a === null || b === null ? a === b : a.fills.length === b.fills.length && a.fills.every((fill, index) => sameRect(fill, b.fills[index]));

class Drawer implements MapCursorDrawer {
  readonly #canvas: MapCursorCanvas;
  readonly #geometry: MapInputGeometryPort;
  readonly #position: MapCursorPositionPort;
  /** Where the canvas is shown; null while hidden, which is exactly while not ready. */
  #frame: ViewportFrame | null = null;
  #buffer: BufferSize | null = null;
  /** What the buffer holds now. */
  #drawn: MapCursorShape | null = null;
  #disposed = false;

  constructor(canvas: MapCursorCanvas, geometry: MapInputGeometryPort, position: MapCursorPositionPort) {
    this.#canvas = canvas;
    this.#geometry = geometry;
    this.#position = position;
  }

  get ready(): boolean { return !this.#disposed && this.#frame !== null; }

  draw(): boolean {
    if (this.#disposed) return false;
    let painted = false;
    try {
      painted = this.#paint();
    } catch (error) {
      this.#buffer = null;
      this.#drawn = null;
      throw error;
    } finally {
      if (!painted && this.#frame) {
        this.#frame = null;
        this.#canvas.hide();
      }
    }
    return painted;
  }

  /** Reads and checks everything before touching the canvas. */
  #paint(): boolean {
    const geometry = checkMapInputGeometry(this.#geometry.read());
    if (!geometry) return false;
    const reported = this.#canvas.readDevicePixelRatio();
    const ratio = Math.min(Number.isFinite(reported) && reported > 0 ? reported : 1, MAX_PIXEL_RATIO);
    const buffer: BufferSize = { width: Math.round(geometry.frame.width * ratio), height: Math.round(geometry.frame.height * ratio) };
    if (!mapBufferArea(geometry, buffer)) return false;
    const position = this.#position.read();
    const shape = position && mapCursorShape(geometry, position, buffer);
    if (!sameFrame(this.#frame, geometry.frame)) {
      this.#canvas.show(geometry.frame);
      this.#frame = geometry.frame;
    }
    if (this.#buffer?.width !== buffer.width || this.#buffer.height !== buffer.height) {
      this.#canvas.resize(buffer.width, buffer.height);
      this.#buffer = buffer;
      this.#drawn = null;
    }
    if (!sameShape(this.#drawn, shape)) {
      if (this.#drawn) this.#canvas.clear(this.#drawn.bounds);
      for (const fill of shape?.fills ?? []) this.#canvas.fill(fill, MAP_CURSOR_STYLE.colour);
      this.#drawn = shape;
    }
    return true;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#canvas.remove();
  }
}

/** A drawer whose `draw` the caller runs from its existing session frame listener; it schedules nothing itself. */
export function createMapCursorDrawer(canvas: MapCursorCanvas, geometry: MapInputGeometryPort, position: MapCursorPositionPort): MapCursorDrawer {
  return new Drawer(canvas, geometry, position);
}
