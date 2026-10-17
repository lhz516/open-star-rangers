/**
 * Drawn poses (docs/original/formats/executable.md, PV5, PV8; docs/plan/p3/12/spec.md, Render State 的消费).
 *
 * - **Orientation:** the 3D library sets a frame's orientation from the game's rows with dir = R2 and up = R1: it
 *   rejects dir = up (component-wise), D = normalise(dir), U = normalise(up − (up·D)·D), X = U × D, rows (X, U, D); a
 *   rejected orientation (equal rows, or a vector it cannot normalise) leaves the frame's previous orientation. Rule
 *   readers keep the stored rows; only drawing uses these. Rows (X, U, D) satisfy U × D = X, as the game's rows do, so
 *   with X, U, D as its columns the frame is a proper rotation of the game world, which the renderer uses without an
 *   axis change: a mesh vertex (x, y, z) lies at P + x·X + y·U + z·D.
 * - **Interpolation:** positions are mixed linearly; orientations are rotated along the shorter arc between the two
 *   drawn frames (quaternion slerp of those proper rotations), never by mixing matrix elements. alpha 0 gives the
 *   previous pose exactly.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { INITIAL_CAMERA_POSE } from '../presentation/presentation-camera.ts';

/** A pose as the renderer draws it: rows (X, U, D) are orthonormal. */
export interface DrawnPose {
  readonly position: Vec3;
  readonly rows: Matrix3;
}

/** A new library frame's orientation. */
export const IDENTITY_ROWS: Matrix3 = INITIAL_CAMERA_POSE.rows;

const frozenRows = (values: number[]): Matrix3 => Object.freeze(values) as unknown as Matrix3;

/** The library's orientation of `stored` (dir = R2, up = R1), or null when the library rejects it. */
export function libraryOrientation(stored: Matrix3): Matrix3 | null {
  const [, , , ux, uy, uz, dx, dy, dz] = stored;
  if (ux === dx && uy === dy && uz === dz) return null;
  const dirLength = Math.hypot(dx, dy, dz);
  if (!(dirLength > 0) || !Number.isFinite(dirLength)) return null;
  const d = [dx / dirLength, dy / dirLength, dz / dirLength];
  const along = ux * d[0] + uy * d[1] + uz * d[2];
  const u = [ux - along * d[0], uy - along * d[1], uz - along * d[2]];
  const upLength = Math.hypot(u[0], u[1], u[2]);
  if (!(upLength > 0) || !Number.isFinite(upLength)) return null;
  const [x, y, z] = u.map((value) => value / upLength);
  return frozenRows([
    y * d[2] - z * d[1], z * d[0] - x * d[2], x * d[1] - y * d[0],
    x, y, z,
    d[0], d[1], d[2],
  ]);
}

/** The library's frames by key, each keeping its last accepted orientation, from the identity of a new frame. */
export class DrawnOrientations {
  readonly #last = new Map<string, Matrix3>();

  /** The orientation the library draws after setting `stored` on frame `key`. */
  set(key: string, stored: Matrix3): Matrix3 {
    const accepted = libraryOrientation(stored);
    if (accepted === null) return this.#last.get(key) ?? IDENTITY_ROWS;
    this.#last.set(key, accepted);
    return accepted;
  }

  /** Forgets every frame `keep` rejects, as a frame goes with its visual. */
  retain(keep: (key: string) => boolean): void {
    for (const key of this.#last.keys()) if (!keep(key)) this.#last.delete(key);
  }
}

const scratch = { x: new Vector3(), u: new Vector3(), d: new Vector3(), basis: new Matrix4(), from: new Quaternion(), to: new Quaternion() };

/** The rotation whose columns are rows X, U and D. */
function rotationOf(rows: Matrix3, into: Quaternion): Quaternion {
  const { x, u, d, basis } = scratch;
  basis.makeBasis(x.set(rows[0], rows[1], rows[2]), u.set(rows[3], rows[4], rows[5]), d.set(rows[6], rows[7], rows[8]));
  return into.setFromRotationMatrix(basis);
}

/** Mixes two drawn poses; alpha 0 is `from`, 1 is `to`. */
export function interpolatePose(from: DrawnPose, to: DrawnPose, alpha: number): DrawnPose {
  if (alpha === 0) return from;
  const mix = (a: number, b: number): number => a + (b - a) * alpha;
  const position = Object.freeze({ x: mix(from.position.x, to.position.x), y: mix(from.position.y, to.position.y), z: mix(from.position.z, to.position.z) });
  const rotation = rotationOf(from.rows, scratch.from).slerp(rotationOf(to.rows, scratch.to), alpha);
  const e = scratch.basis.makeRotationFromQuaternion(rotation).elements;
  // Column-major: columns 0, 1 and 2 are X, U and D.
  return Object.freeze({ position, rows: frozenRows([e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]]) });
}
