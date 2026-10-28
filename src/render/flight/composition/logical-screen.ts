/**
 * The logical screen (docs/plan/p3/12/spec.md, 画面合成与 P3-13 接口, 技术决定 3; AC-05, AC-16): the original's HI
 * 640 × 480 screen, origin at the top-left, y down, in which every screen-space rule is computed. It maps to the drawing
 * buffer by one uniform scale, buffer width ÷ 640; the 4:3 layout keeps the buffer within one device pixel of 480 times
 * that scale, so the bottom of the logical screen may fall up to one device pixel outside or inside the buffer. Window
 * size, aspect and pixel ratio change only the scale, never a logical position, the field of view or what is visible.
 *
 * The world camera maps camera space (x right, y up, z away) to the game image with the original's projection
 * (projection.ts), half a logical pixel to the left: the original's rasteriser covers columns ⌊xl⌋ ≤ x < ⌊xr⌋ of a span
 * from xl to xr and rows round(y_top) ≤ y < round(y_bottom) (RS1, RS2), which WebGL's pixel-centre sampling at one
 * device pixel per logical pixel reproduces, up to exact ties, when x is shifted by −0.5 and y is not. Depth is the
 * library's z_p = B(z − f)/((B − f)·z) from the front plane f to the back plane B (FC4), as WebGL's [−1, 1].
 */
import type { Camera} from 'three';
import { Matrix4 } from 'three';
import type { PixelRect } from '../../scene/render-surface.ts';
import type { ViewportLayout } from '../../viewport/viewport-layout.ts';
import type { PresentationViewport } from '../presentation/presentation-contract.ts';
import { FRONT_PLANE, viewportProjection } from '../scene/projection.ts';
import type { FlightSceneFrame } from '../scene/flight-scene.ts';

export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 480;

/** The horizontal shift of drawn 3D geometry, logical pixels (see above). */
export const RASTER_OFFSET_X = -0.5;

/** Logical pixels to the drawing buffer's device pixels. */
export interface LogicalTransform {
  /** Device pixels per logical pixel, on both axes: bufferWidth ÷ 640. */
  readonly scale: number;
  readonly bufferWidth: number;
  readonly bufferHeight: number;
}

/** A rectangle of logical pixels: [x, x + width) × [y, y + height). */
export interface LogicalRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function logicalTransform({ bufferWidth, bufferHeight }: ViewportLayout): LogicalTransform {
  return Object.freeze({ scale: bufferWidth / LOGICAL_WIDTH, bufferWidth, bufferHeight });
}

/** The pixels of a viewport, ends included. */
export function viewportRect(viewport: PresentationViewport): LogicalRect {
  const { width, height } = viewportProjection(viewport);
  return Object.freeze({ x: viewport.left, y: viewport.top, width, height });
}

/** A logical rectangle as whole device pixels, each edge rounded to the nearest and kept inside the buffer. */
export function deviceRect({ scale, bufferWidth, bufferHeight }: LogicalTransform, { x, y, width, height }: LogicalRect): PixelRect {
  const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, Math.round(value * scale)));
  const left = clamp(x, bufferWidth);
  const top = clamp(y, bufferHeight);
  return Object.freeze({ x: left, y: top, width: clamp(x + width, bufferWidth) - left, height: clamp(y + height, bufferHeight) - top });
}

/** Sets a camera's matrices once, for the renderer not to recompute them. */
function fixedCamera(camera: Camera, world: Matrix4, projection: Matrix4): Camera {
  camera.matrixAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;
  camera.matrix.copy(world);
  camera.matrixWorld.copy(world);
  camera.matrixWorldInverse.copy(world).invert();
  camera.projectionMatrix.copy(projection);
  camera.projectionMatrixInverse.copy(projection).invert();
  return camera;
}

/**
 * Sets `camera` to draw logical pixels into the game image: a vertex (x, y, z) at logical (x, y), with z passed through
 * as WebGL's normalised depth. Logical y grows downwards, so a triangle clockwise on the logical screen is front-facing.
 */
export function setLogicalCamera(camera: Camera, { scale, bufferHeight }: LogicalTransform): Camera {
  const sy = (2 * scale) / bufferHeight;
  return fixedCamera(camera, new Matrix4(), new Matrix4().set(
    2 / LOGICAL_WIDTH, 0, 0, -1,
    0, -sy, 0, 1,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ));
}

/** The world camera's projection: camera space to the game image's clip space (see above). */
export function worldProjectionMatrix(viewport: PresentationViewport, backPlane: number, { scale, bufferHeight }: LogicalTransform): Matrix4 {
  const { half, cx, cy } = viewportProjection(viewport);
  const sy = (2 * scale) / bufferHeight;
  const f = FRONT_PLANE;
  const b = backPlane;
  return new Matrix4().set(
    (4 * half) / LOGICAL_WIDTH, 0, (2 * (cx + RASTER_OFFSET_X)) / LOGICAL_WIDTH - 1, 0,
    0, sy * 2 * half, 1 - sy * cy, 0,
    0, 0, (b + f) / (b - f), (-2 * b * f) / (b - f),
    0, 0, 1, 0,
  );
}

/** Sets `camera` to the scene's drawn camera and the original's projection into the game image. */
export function setWorldCamera(camera: Camera, { camera: { position: p, rows: r }, viewport, backPlane }: FlightSceneFrame, logical: LogicalTransform): Camera {
  // Columns R0, R1, R2: camera space is (R0·d, R1·d, R2·d).
  const world = new Matrix4().set(
    r[0], r[3], r[6], p.x,
    r[1], r[4], r[7], p.y,
    r[2], r[5], r[8], p.z,
    0, 0, 0, 1,
  );
  return fixedCamera(camera, world, worldProjectionMatrix(viewport, backPlane, logical));
}
