/**
 * The hit shimmer's texture wraps (docs/original/formats/executable.md, HS2, HS4, HS8 and the wrap creation `0x82ae8`,
 * application `0x82f88` and coordinates `0x82c48` of the effect texture mappings; AC-08): the sphere wraps that replace
 * a shell's stored texture coordinates, and the seam rule its rasteriser applies to u.
 *
 * - **Families** (table `0x193b60`, by the kind's bit): kinds 1, 2, 0x100 and 0x200 turn through 32 wraps, θ accumulated
 *   in double by the code's 4.375° step and its sign flipped after wrap 16; every kind of `0xf9c7c` shares 16 wraps of
 *   the 8.75° step flipped after wrap 8, one per shared step; kind 0x80 has one wrap sized from its list-2 mesh's bounds.
 *   The original sizes it from MESH 11065, which is the list-2 mesh of every kind-0x80 model of the slice; the shell's
 *   own list-2 mesh stands for it.
 * - **Wrap frame** (`0x92c40`): D = normalise(direction), U = normalise(up − (up · D) D), R = U × D; a vertex v gives
 *   p = ((v − O) · R, (v − O) · U, (v − O) · D), then a = atan2(p_x, p_y)/2π (+1 when negative, 0 at the origin's axis),
 *   b = acos(p_z/|p|)/π (0 when |p| is 0 or |p_z/|p|| ≥ 1), u = su·a − ou and v = sv·b − ov, stored as f32.
 * - **Seam** (HS8): per triangle with u at corners a, b, c in stored order, two are near when they differ by at most 0.5;
 *   if b is far from both, it moves by 1 toward c; else if c is, toward a; else if a is, toward b. v is unchanged.
 *
 * The angles' sines, cosines and the arc functions use JavaScript's double functions where the original uses the x87:
 * a stored f32 can differ in its last place where a value lies within an x87 rounding of an f32 boundary.
 */
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import { normaliseVector } from '../lighting/lighting-math.ts';

export type WrapFamily = 'turning' | 'bounds' | 'shared';

export interface SphereWrap {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly up: Vec3;
  readonly ou: number;
  readonly ov: number;
  readonly su: number;
  readonly sv: number;
}

const OWN_KINDS = 0x383;
const SHARED_KINDS = 0xf9c7c;
const BOUNDS_KIND_BIT = 7;

/** The wrap family of kind bit `kindBit` (`0x383` own, `0xf9c7c` shared), or null for a kind whose visual gets no shimmer block (`0x41dcc`). */
export function wrapFamily(kindBit: number): WrapFamily | null {
  if (!Number.isInteger(kindBit) || kindBit < 0 || kindBit > 31) return null;
  const kind = 2 ** kindBit;
  if ((kind & OWN_KINDS) !== 0) return kindBit === BOUNDS_KIND_BIT ? 'bounds' : 'turning';
  return (kind & SHARED_KINDS) !== 0 ? 'shared' : null;
}

/** The f64 of an IEEE-754 bit pattern. */
function double(high: number, low: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, high);
  view.setUint32(4, low);
  return view.getFloat64(0);
}

/** The code's angle steps (doubles `0x3fb38c35_4662a304` and `0x3fc38c35_4662a305`, about 4.375° and 8.75°). */
const TURNING_STEP = double(0x3fb38c35, 0x4662a304);
const SHARED_STEP = double(0x3fc38c35, 0x4662a305);

const ORIGIN: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
const Y_AXIS: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });
const Z_AXIS: Vec3 = Object.freeze({ x: 0, y: 0, z: 1 });
const f = Math.fround;

/** `count` wraps turning about y by `step`, its sign flipped after wrap `flipAfter`; su = sv = 3. */
function turningWraps(count: number, step: number, flipAfter: number): readonly SphereWrap[] {
  const wraps: SphereWrap[] = [];
  let theta = 0;
  for (let k = 0; k < count; k++) {
    wraps.push(Object.freeze({
      origin: ORIGIN, direction: Object.freeze({ x: f(Math.cos(theta)), y: 0, z: f(Math.sin(theta)) }), up: Y_AXIS, ou: 0, ov: 0, su: 3, sv: 3,
    }));
    theta += k < flipAfter ? step : -step;
  }
  return Object.freeze(wraps);
}

export const TURNING_WRAPS = turningWraps(32, TURNING_STEP, 16);
export const SHARED_WRAPS = turningWraps(16, SHARED_STEP, 8);

/**
 * Kind 0x80's one wrap from its mesh's y bounds: direction y, up z, su = d, sv = −d, ov = d · min_y, d = 80/(max − min);
 * null when a scale or offset is not a finite f32 (no y extent, or one too small), whose coordinates the research does
 * not cover.
 */
export function boundsWrap(positions: Float32Array): SphereWrap | null {
  let min = Infinity;
  let max = -Infinity;
  for (let at = 1; at < positions.length; at += 3) {
    min = Math.min(min, positions[at]);
    max = Math.max(max, positions[at]);
  }
  const d = 80 / (max - min);
  const su = f(d);
  const ov = f(d * min);
  return Number.isFinite(su) && Number.isFinite(ov) ? Object.freeze({ origin: ORIGIN, direction: Y_AXIS, up: Z_AXIS, ou: 0, ov, su, sv: -su }) : null;
}

/** The wraps of `family`; `positions` (x, y, z per vertex) size the bounds wrap, null when boundsWrap refuses them. */
export function familyWraps(family: WrapFamily, positions: Float32Array): readonly SphereWrap[] | null {
  if (family === 'turning') return TURNING_WRAPS;
  if (family === 'shared') return SHARED_WRAPS;
  const wrap = boundsWrap(positions);
  return wrap === null ? null : Object.freeze([wrap]);
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The rows R, U, D of a wrap's frame. */
function wrapFrame({ direction, up }: SphereWrap): readonly [Vec3, Vec3, Vec3] {
  const d = normaliseVector(direction);
  const along = dot(up, d);
  const u = normaliseVector({ x: up.x - along * d.x, y: up.y - along * d.y, z: up.z - along * d.z });
  const r = Object.freeze({ x: f(u.y * d.z - u.z * d.y), y: f(u.z * d.x - u.x * d.z), z: f(u.x * d.y - u.y * d.x) });
  return [r, u, d];
}

const INVERSE_TWO_PI = 1 / (2 * Math.PI);
const INVERSE_PI = 1 / Math.PI;

/** The sphere wrap's (u, v) of each vertex of `positions`, as f32. */
export function sphereWrapUvs(wrap: SphereWrap, positions: Float32Array): Float32Array<ArrayBuffer> {
  const [r, u, d] = wrapFrame(wrap);
  const { origin: o, ou, ov, su, sv } = wrap;
  const vertices = positions.length / 3;
  const uvs = new Float32Array(vertices * 2);
  for (let vertex = 0; vertex < vertices; vertex++) {
    const relative = { x: positions[vertex * 3] - o.x, y: positions[vertex * 3 + 1] - o.y, z: positions[vertex * 3 + 2] - o.z };
    const px = dot(relative, r);
    const py = dot(relative, u);
    const pz = dot(relative, d);
    let a = px === 0 && py === 0 ? 0 : Math.atan2(px, py) * INVERSE_TWO_PI;
    if (a < 0) a += 1;
    const cosine = pz / Math.sqrt(px * px + py * py + pz * pz);
    // NaN at the origin fails the test too.
    const b = Math.abs(cosine) < 1 ? Math.acos(cosine) * INVERSE_PI : 0;
    uvs[vertex * 2] = su * a - ou;
    uvs[vertex * 2 + 1] = sv * b - ov;
  }
  return uvs;
}

const SEAM_NEAR = 0.5;
const near = (p: number, q: number): boolean => Math.abs(p - q) <= SEAM_NEAR;
const toward = (from: number, to: number): number => f(from < to ? from + 1 : from - 1);

/** The seam rule on one triangle's u values, in stored corner order. */
export function seamU(a: number, b: number, c: number): readonly [number, number, number] {
  if (!near(b, a) && !near(b, c)) return [a, toward(b, c), c];
  if (!near(c, a) && !near(c, b)) return [a, b, toward(c, a)];
  if (!near(a, b) && !near(a, c)) return [toward(a, b), b, c];
  return [a, b, c];
}

/** One (u, v) per triangle corner of `indices` under `wrap`, the seam rule applied to each triangle's u. */
export function wrappedCornerUvs(wrap: SphereWrap, positions: Float32Array, indices: Uint16Array): Float32Array<ArrayBuffer> {
  const vertexUvs = sphereWrapUvs(wrap, positions);
  const uvs = new Float32Array(indices.length * 2);
  for (let first = 0; first < indices.length; first += 3) {
    const u = seamU(vertexUvs[indices[first] * 2], vertexUvs[indices[first + 1] * 2], vertexUvs[indices[first + 2] * 2]);
    for (let corner = 0; corner < 3; corner++) {
      uvs[(first + corner) * 2] = u[corner];
      uvs[(first + corner) * 2 + 1] = vertexUvs[indices[first + corner] * 2 + 1];
    }
  }
  return uvs;
}
