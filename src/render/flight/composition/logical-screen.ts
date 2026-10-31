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
import type { Camera, ShaderMaterial } from 'three';
import { BufferAttribute, BufferGeometry, Matrix4, Vector2 } from 'three';
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

/** The vertex shader of a mesh in logical pixels, drawn with the logical camera. */
export const LOGICAL_MESH_VERTEX = 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

/**
 * The corners of a quad over the logical rectangle [x0, x1) × [y0, y1) and one logical pixel past it on every side, so
 * that it covers every device pixel `logicalPixel()` places in the rectangle, whatever the rasteriser does on its edges:
 * top-left, top-right, bottom-left, bottom-right, z 0.
 */
export const logicalQuadCorners = (x0: number, y0: number, x1: number, y1: number): number[] =>
  [x0 - 1, y0 - 1, 0, x1 + 1, y0 - 1, 0, x0 - 1, y1 + 1, 0, x1 + 1, y1 + 1, 0];

/** A quad over the logical rectangle [0, width) × [0, height) (`logicalQuadCorners`). */
export const logicalQuad = (width: number, height: number): BufferGeometry => new BufferGeometry()
  .setAttribute('position', new BufferAttribute(new Float32Array(logicalQuadCorners(0, 0, width, height)), 3))
  .setIndex([0, 1, 2, 2, 1, 3]);

/**
 * GLSL for a layer that enlarges logical pixels (AC-05, AC-16): `logicalPixel()` is the logical pixel of the fragment's
 * device pixel, the one whose [x·s, (x + 1)·s) holds the device pixel's centre, rows from the top, kept on the logical
 * screen (a device row past 480·s shows row 479). It is computed in integers, ⌊(2d + 1) · 320 ÷ bufferWidth⌋, so a
 * centre exactly on a texel edge, as at 485 ÷ 640, falls in the pixel after the edge in every layer alike; an
 * interpolated coordinate or a float division may land on either side, and two layers deciding differently show in
 * one device pixel a combination no logical pixel has. The material's `logicalBuffer` uniform holds the drawing
 * buffer's size (`logicalBufferUniform`, `setLogicalBuffer`); a layer's mesh must cover every device pixel it may
 * draw, the fragment discarding the logical pixels outside its image.
 */
export const LOGICAL_PIXEL_GLSL = `uniform ivec2 logicalBuffer;
ivec2 logicalPixel() {
  ivec2 device = ivec2(gl_FragCoord.x, float(logicalBuffer.y) - gl_FragCoord.y);
  return min((2 * device + 1) * ${LOGICAL_WIDTH / 2} / logicalBuffer.x, ivec2(${LOGICAL_WIDTH - 1}, ${LOGICAL_HEIGHT - 1}));
}`;

/** A material's `logicalBuffer` uniform for `LOGICAL_PIXEL_GLSL`. */
export const logicalBufferUniform = (): { value: Vector2 } => ({ value: new Vector2(LOGICAL_WIDTH, LOGICAL_HEIGHT) });

/** Sets `material`'s `logicalBuffer` uniform to the frame's drawing buffer. */
export function setLogicalBuffer(material: ShaderMaterial, { bufferWidth, bufferHeight }: LogicalTransform): void {
  (material.uniforms.logicalBuffer.value as Vector2).set(bufferWidth, bufferHeight);
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
