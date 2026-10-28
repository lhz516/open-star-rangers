/**
 * The right display's own 3D scene (docs/original/formats/hud.md §4.5; executable.md T7, PV3, PV5; textures.md,
 * TEX 11089; docs/plan/p3/13/spec.md, 右侧目标显示屏 and DC-10): a 100 × 100 indexed device separate from the world's,
 * drawn on the CPU and only copied into the cockpit's back surface by the display (target-display.ts). It never reads
 * or writes the world's or the Warp's depth, and it needs no GPU render target.
 *
 * - **Background (`0x42b04`, `0x7b8e0`):** each render clears the device to TEX 11089 stretched without shading:
 *   device pixel (u, v) takes texel (⌊96u / 100⌋, ⌊96v / 100⌋).
 * - **Model (`0x44070`):** the list-0 parts of the target's model, every face one colour (a one-shade texture under
 *   the scene's single ambient light of intensity 1.0, so lighting changes nothing). A mesh vertex (x, y, z) lies at
 *   P + x·X + y·U + z·D with the target's library rows (PV5), set from dir = R2 and up = R1.
 * - **Camera (T7):** at distance D = `targetViewDistances[kindBit]` from the target on the line to the player:
 *   C = T + (P − T) · (D / d), d the target's distance. Its orientation is dir = u = (T − P) / d with up = the player's
 *   R1, unless |R2 · u| ≤ 0.01 (R2 the player's stored row), when it looks at the target with an up built from world
 *   +y (`0x859b8` → `0x857b0`): s = F(√(1 − dy²)), up = (−dy·dx / s, s, −dy·dz / s), or (−dy, s, 0) when |s| ≤ 0.0001.
 *   A rejected orientation (PV5) keeps the frame's previous one; frames start at the identity.
 * - **Projection (PV3, this device):** half = 50, centre (50.0, 50.0): sx = F(50 + 2x·50 / z), sy = F(50 − 2y·50 / z),
 *   visible for 1 ≤ z < 900 (the front plane and the back plane 900). Triangles crossing either plane are clipped there
 *   in camera space (Likely; the library's clipper was not traced); the screen sides clip per pixel. Pixels follow
 *   silhouette-raster.ts.
 *
 * Coordinates are computed in double precision with f32 stores where the original stores them; the remaining
 * differences are within the 1-pixel silhouette edge band of the comparison criteria.
 */
import type { ModelPayload } from '../../../content/models/model-payload.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { createIndexedSurface, type IndexedSurface } from '../raster/indexed-surface.ts';
import { fillTriangle, type ScreenVertex } from './silhouette-raster.ts';

/** The device `0x42b04` creates in HI and its viewport (PV1, PV3). */
export const TARGET_DEVICE = Object.freeze({ size: 100, frontPlane: 1, backPlane: 900 });

/** The background texture's size, whose stretch over the device is ⌊96u / 100⌋ (TEX 11089). */
export const TARGET_BACKGROUND_SIZE = 96;

const HALF = TARGET_DEVICE.size >> 1;
const CENTRE = 0.5 * TARGET_DEVICE.size;
/** `0x171aab`: the |R2 · u| bound below which the camera looks at the target with world up. */
const LOOK_AT_BOUND = 0.01;
/** `0x173a64`: the |s| bound of `0x857b0`'s degenerate up. */
const LOOK_AT_EPSILON = 0.0001;

const IDENTITY: Matrix3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;

/** A frame's stored position and rows, R2 the direction and R1 the up (the game's convention). */
export interface StoredPose {
  readonly position: Vec3;
  readonly orientation: Matrix3;
}

/** One render of the target: the model's list-0 parts in `colour` at `target`, seen from the player's side. */
export interface TargetView {
  readonly model: ModelPayload;
  readonly colour: number;
  readonly target: StoredPose;
  /** The target's distance from the player (f32). */
  readonly distance: number;
  readonly viewDistance: number;
  readonly player: StoredPose;
}

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const row = (rows: Matrix3, index: number): Vec3 => vec(rows[index * 3], rows[index * 3 + 1], rows[index * 3 + 2]);

/** `0x94868`: v / |v|, or null for a vector it cannot normalise. */
function normalise(v: Vec3): Vec3 | null {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 0 && Number.isFinite(length) ? vec(v.x / length, v.y / length, v.z / length) : null;
}

/**
 * The library's orientation (`0x7abf0`, PV5): it rejects dir = up (component-wise), D = normalise(dir),
 * U = normalise(up − (up·D)·D), X = U × D, rows (X, U, D); null when it rejects.
 */
export function libraryOrientation(dir: Vec3, up: Vec3): Matrix3 | null {
  if (dir.x === up.x && dir.y === up.y && dir.z === up.z) return null;
  const d = normalise(dir);
  if (d === null) return null;
  const along = dot(up, d);
  const u = normalise(vec(up.x - along * d.x, up.y - along * d.y, up.z - along * d.z));
  if (u === null) return null;
  return Object.freeze([
    u.y * d.z - u.z * d.y, u.z * d.x - u.x * d.z, u.x * d.y - u.y * d.x,
    u.x, u.y, u.z,
    d.x, d.y, d.z,
  ]) as unknown as Matrix3;
}

/** The camera position and the orientation T7 requests for it (see the module comment); null: the request fails. */
export function cameraRequest({ target, distance, viewDistance, player }: Pick<TargetView, 'target' | 'distance' | 'viewDistance' | 'player'>): {
  readonly position: Vec3;
  readonly orientation: Matrix3 | null;
} {
  const t = target.position;
  const p = player.position;
  const [dx, dy, dz] = [p.x - t.x, p.y - t.y, p.z - t.z];
  const scale = viewDistance / distance;
  const position = vec(Math.fround(t.x + dx * scale), Math.fround(t.y + dy * scale), Math.fround(t.z + dz * scale));
  const inverse = 1 / -distance;
  const u = vec(dx * inverse, dy * inverse, dz * inverse);
  if (Math.abs(dot(row(player.orientation, 2), u)) > LOOK_AT_BOUND) return { position, orientation: libraryOrientation(u, row(player.orientation, 1)) };
  const look = normalise(vec(t.x - position.x, t.y - position.y, t.z - position.z));
  if (look === null) return { position, orientation: null };
  const s = Math.fround(Math.sqrt(1 - look.y * look.y));
  const [a, b] = Math.abs(s) > LOOK_AT_EPSILON ? [look.x / s, look.z / s] : [1, 0];
  return { position, orientation: libraryOrientation(look, vec(-look.y * a, s, -look.y * b)) };
}

type Point = readonly [x: number, y: number, z: number];

/** The part of a convex polygon on the side of z = `plane` that `keep` accepts, with the crossing points added. */
function clipDepth(polygon: readonly Point[], plane: number, keep: (z: number) => boolean): Point[] {
  const out: Point[] = [];
  polygon.forEach((current, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const [inCurrent, inPrevious] = [keep(current[2]), keep(previous[2])];
    if (inCurrent !== inPrevious) {
      const t = (plane - previous[2]) / (current[2] - previous[2]);
      out.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t, plane]);
    }
    if (inCurrent) out.push(current);
  });
  return out;
}

const inDepth = (z: number): boolean => z >= TARGET_DEVICE.frontPlane && z < TARGET_DEVICE.backPlane;

const project = ([x, y, z]: Point): ScreenVertex => ({ x: Math.fround(CENTRE + (2 * x * HALF) / z), y: Math.fround(CENTRE - (2 * y * HALF) / z) });

/** The right display's device of one run. */
export class TargetScene {
  readonly device: IndexedSurface = createIndexedSurface(TARGET_DEVICE.size, TARGET_DEVICE.size);
  readonly #background: Uint8Array;
  #camera: Matrix3 = IDENTITY;
  #target: Matrix3 = IDENTITY;

  /** `texels`: the 96 × 96 background's cockpit palette indices, row 0 at the top. */
  constructor(texels: Uint8Array) {
    const { size } = TARGET_DEVICE;
    this.#background = new Uint8Array(size * size);
    for (let v = 0; v < size; v++) {
      for (let u = 0; u < size; u++) {
        this.#background[v * size + u] = texels[Math.floor((TARGET_BACKGROUND_SIZE * v) / size) * TARGET_BACKGROUND_SIZE + Math.floor((TARGET_BACKGROUND_SIZE * u) / size)];
      }
    }
  }

  /** A device switch (`0x42b04`) makes a new device; its first pixels are taken as index 0 (Unconfirmed). */
  rebuild(): void {
    this.device.indices.fill(0);
  }

  /** Clears the device to the background and draws the target's model when `view` is given (`0x7b8e0`, `0x7c2ac`). */
  render(view: TargetView | null): void {
    this.device.indices.set(this.#background);
    if (view !== null) this.#drawModel(view);
  }

  #drawModel(view: TargetView): void {
    const { position: c, orientation } = cameraRequest(view);
    this.#camera = orientation ?? this.#camera;
    this.#target = libraryOrientation(row(view.target.orientation, 2), row(view.target.orientation, 1)) ?? this.#target;
    // Camera space of a mesh vertex v: M · v + t, M = camera rows × target rows (as columns), t = camera rows · (T − C).
    const [cr, tr] = [this.#camera, this.#target];
    const t = view.target.position;
    const offset = vec(t.x - c.x, t.y - c.y, t.z - c.z);
    const m = Array.from({ length: 9 }, (_, at) => {
      const [i, j] = [Math.floor(at / 3), at % 3];
      return cr[i * 3] * tr[j * 3] + cr[i * 3 + 1] * tr[j * 3 + 1] + cr[i * 3 + 2] * tr[j * 3 + 2];
    });
    const shift = [0, 1, 2].map((i) => dot(row(cr, i), offset));
    for (const part of view.model.partLists[0]) {
      const { positions, indices } = view.model.geometries[part.geometry];
      const points = Array.from({ length: positions.length / 3 }, (_, vertex): Point => {
        const [x, y, z] = positions.subarray(vertex * 3, vertex * 3 + 3);
        return [0, 1, 2].map((i) => m[i * 3] * x + m[i * 3 + 1] * y + m[i * 3 + 2] * z + shift[i]) as unknown as Point;
      });
      for (let corner = 0; corner < indices.length; corner += 3) {
        const triangle = [points[indices[corner]], points[indices[corner + 1]], points[indices[corner + 2]]];
        const polygon = (triangle.every(([, , z]) => inDepth(z)) ? triangle : clipDepth(
          clipDepth(triangle, TARGET_DEVICE.frontPlane, (z) => z >= TARGET_DEVICE.frontPlane), TARGET_DEVICE.backPlane, (z) => z < TARGET_DEVICE.backPlane,
        )).map(project);
        for (let fan = 1; fan + 1 < polygon.length; fan++) fillTriangle(this.device, [polygon[0], polygon[fan], polygon[fan + 1]], view.colour);
      }
    }
  }
}
