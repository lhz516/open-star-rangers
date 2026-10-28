/**
 * The radar's geometry and projection (docs/original/formats/hud.md §4.3 and executable.md T6; P3-13 spec,
 * 前视驾驶舱与仪表 and CK-03/CK-04): the set-up `0x3ffb4` derives the centre, radius, scale, rings and per-row disc
 * spans from the record's rectangle; `0x40d44` projects a world position with the camera of the same tick.
 *
 * Arithmetic follows the recorded f32 stores; intermediate sums and products are taken in double precision where the
 * original keeps x87 extended precision, which can differ only in the last bit of a sum before its f32 store.
 */
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { InclusiveRectangle } from '../../../content/hud/instruments-payload.ts';
import type { CameraPose } from '../../flight/presentation/presentation-contract.ts';
import { chop32 } from '../gauges/gauge-bars.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';

/** One row of the disc: the clear and the copy cover columns x0–x1. */
export interface RadarSpan {
  readonly y: number;
  readonly x0: number;
  readonly x1: number;
}

export interface RadarGeometry {
  readonly cx: number;
  readonly cy: number;
  /** r = (min(w, h) >> 1) − 2. */
  readonly radius: number;
  /** f32(r − 2): the projection's scale and the noise's. */
  readonly scale: number;
  /** chop(f32(r × 0.5)), chop(f32(r × 0.1)), chop(f32(r × 0.9)). */
  readonly rings: { readonly half: number; readonly tenth: number; readonly nineTenths: number };
  /** Rows y0 … y1 − 1 within r of the centre (the last row is never cleared or copied). */
  readonly spans: readonly RadarSpan[];
}

/** The half-width added to the disc's row width, and the least half-width of a row. */
const SPAN_MARGIN = 3;
const SPAN_MINIMUM = 10;

/** `0x3ffb4` for the record's rectangle; a rectangle too small for a radius of 0 or more is `invalid-input`. */
export function radarGeometry({ x0, y0, x1, y1 }: InclusiveRectangle): RadarGeometry {
  const [width, height] = [x1 - x0 + 1, y1 - y0 + 1];
  const radius = (Math.min(width, height) >> 1) - 2;
  if (radius < 0) throw new PresentationError('invalid-input', 'cockpit.radar.rectangle', 'is too small for a radar of radius 0 or more');
  const cx = x0 + (width >> 1);
  const cy = y0 + (height >> 1);
  const spans: RadarSpan[] = [];
  for (let y = y0; y < y1; y++) {
    const distance = Math.abs(cy - y);
    if (radius < distance) continue;
    let half = Math.sqrt(Math.abs(radius * radius - distance * distance)) + SPAN_MARGIN;
    if (half <= SPAN_MINIMUM) half = SPAN_MINIMUM;
    spans.push(Object.freeze({ y, x0: cx - Math.trunc(half), x1: cx + Math.trunc(half) }));
  }
  const ring = (factor: number): number => Math.trunc(Math.fround(radius * factor));
  return Object.freeze({
    cx, cy, radius, scale: Math.fround(radius - 2),
    rings: Object.freeze({ half: ring(0.5), tenth: ring(0.1), nineTenths: ring(0.9) }),
    spans: Object.freeze(spans),
  });
}

/** A camera row k of Core's row-major rows: 0 right, 1 up, 2 forward. */
const row = ({ rows }: CameraPose, k: number): readonly [number, number, number] => [rows[3 * k], rows[3 * k + 1], rows[3 * k + 2]];

/** (v.y R_1 + v.z R_2) + v.x R_0: the original's order of a dot product, before any f32 store. */
const sum = (v: Vec3, [r0, r1, r2]: readonly [number, number, number]): number => v.y * r1 + v.z * r2 + v.x * r0;
/** The dot product stored as f32. */
const dot = (v: Vec3, r: readonly [number, number, number]): number => Math.fround(sum(v, r));

/** The plane offsets `0x40c90` writes each frame from the camera: off_k = −f32(R_k · camera position). */
export function planeOffsets(camera: CameraPose): readonly [number, number, number] {
  const { position } = camera;
  return [0, 1, 2].map((k) => -dot(position, row(camera, k))) as unknown as readonly [number, number, number];
}

/** One `0x40d44` call: `side` is always fresh; `outputs` is null when the in-plane length is within ±1e−6. */
export interface PlaneProjection {
  /** On or in front of the camera's plane k (d ≥ 0, or NaN). */
  readonly side: boolean;
  /** k = 2: (v · R1, v · R0); k = 1: (v · R0, v · R2); k = 0: (v · R2, v · R1). */
  readonly outputs: readonly [number, number] | null;
}

const DEGENERATE_LENGTH = 1e-6;

/**
 * `0x40d44`(p, k): the position's direction from the camera within the plane through the camera perpendicular to
 * row k, normalised (Euclidean length), and its components along the other rows.
 */
export function projectOnPlane(position: Vec3, k: 0 | 1 | 2, camera: CameraPose, offsets: readonly [number, number, number]): PlaneProjection {
  const normal = row(camera, k);
  // d = f32(R_k · p + off_k), with one store after the offset.
  const d = Math.fround(sum(position, normal) + offsets[k]);
  const side = !(d < 0);
  // q = f32(f32(−d · R_k) + p), v = f32(q − camera), component by component.
  const inPlane = (p: number, n: number, c: number): number => Math.fround(Math.fround(Math.fround(-d * n) + p) - c);
  const { position: eye } = camera;
  const v = { x: inPlane(position.x, normal[0], eye.x), y: inPlane(position.y, normal[1], eye.y), z: inPlane(position.z, normal[2], eye.z) };
  const length = Math.fround(Math.sqrt(v.y * v.y + v.z * v.z + v.x * v.x));
  if (length > -DEGENERATE_LENGTH && length < DEGENERATE_LENGTH) return { side, outputs: null };
  const inverse = 1 / length;
  const unit = { x: Math.fround(v.x * inverse), y: Math.fround(v.y * inverse), z: Math.fround(v.z * inverse) };
  const [r0, r1, r2] = [row(camera, 0), row(camera, 1), row(camera, 2)];
  const outputs: readonly [number, number] = k === 2 ? [dot(unit, r1), dot(unit, r0)] : k === 1 ? [dot(unit, r0), dot(unit, r2)] : [dot(unit, r2), dot(unit, r1)];
  return { side, outputs };
}

/** A contact's cached projection values (its movement block +0xB0/+0xB4, +0xC0 and +0xC8); a new block holds 0. */
export interface RadarDirection {
  /** v · R1 of the k = 2 projection (up). */
  readonly a: number;
  /** v · R0 of the k = 2 projection (right). */
  readonly b: number;
  /** v · R2 of the k = 1 projection. */
  readonly forwardOnRow1Plane: number;
  /** v · R2 of the k = 0 projection. */
  readonly forwardOnRow0Plane: number;
}

export const ZERO_DIRECTION: RadarDirection = Object.freeze({ a: 0, b: 0, forwardOnRow1Plane: 0, forwardOnRow0Plane: 0 });

/** |b| below this selects the k = 0 plane for the forward component, otherwise k = 1. */
const ROW0_PLANE_LIMIT = 0.707;

export interface RadarPoint {
  readonly x: number;
  readonly y: number;
  /** On or in front of the camera plane. */
  readonly side: boolean;
  /** The cache after this projection. */
  readonly direction: RadarDirection;
}

/**
 * The screen point of a contact at `position` (the build's use of `0x40d44`): a and b from the k = 2 projection, the
 * forward component c from the k = 0 projection when |b| < 0.707, else from k = 1, each falling back to `cached` when
 * degenerate; f = f32((1 − c) × 0.5), x = chop(cx + scale · f32(b · f)), y = chop(cy − scale · f32(a · f)).
 */
export function radarPoint(position: Vec3, camera: CameraPose, offsets: readonly [number, number, number], geometry: RadarGeometry, cached: RadarDirection): RadarPoint {
  let direction = cached;
  const planar = projectOnPlane(position, 2, camera, offsets);
  if (planar.outputs !== null) direction = { ...direction, a: planar.outputs[0], b: planar.outputs[1] };
  let forward: number;
  if (Math.abs(direction.b) >= ROW0_PLANE_LIMIT) {
    const { outputs } = projectOnPlane(position, 1, camera, offsets);
    if (outputs !== null) direction = { ...direction, forwardOnRow1Plane: outputs[1] };
    forward = direction.forwardOnRow1Plane;
  } else {
    const { outputs } = projectOnPlane(position, 0, camera, offsets);
    if (outputs !== null) direction = { ...direction, forwardOnRow0Plane: outputs[0] };
    forward = direction.forwardOnRow0Plane;
  }
  const f = Math.fround((1 - forward) * 0.5);
  const a = Math.fround(direction.a * f);
  const b = Math.fround(direction.b * f);
  const { cx, cy, scale } = geometry;
  return { x: chop32(cx + scale * b), y: chop32(cy - a * scale), side: planar.side, direction: direction === cached ? cached : Object.freeze(direction) };
}
