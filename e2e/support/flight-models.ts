import type { Vec3 } from '../../src/core/contracts/domain-events.ts';
import { F, nearestEntry, project, SCENE_DATA, type Rgb, type Rows } from './flight-pictures.ts';

// Independent expectations of the flight scenes' 3D models (P3-12/25): the original's lighting and ramps as
// docs/original/formats/executable.md records them (LS2–LS7), its frames (PV5) and projection (PV3), and the screen
// geometry the tests sample with. Nothing here uses the renderer's modules.

// Screen geometry

export type Point = readonly [number, number];

/** Every pixel of the bounding box of `points`, widened by `pad` pixels. */
export function* pixelsAround(points: readonly Point[], pad: number): Generator<Point> {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  for (let y = Math.floor(Math.min(...ys)) - pad; y <= Math.ceil(Math.max(...ys)) + pad; y++) {
    for (let x = Math.floor(Math.min(...xs)) - pad; x <= Math.ceil(Math.max(...xs)) + pad; x++) yield [x, y];
  }
}

/**
 * Whether the centre (x + 0.5, y + 0.5) of a pixel lies at least `margin` inside every edge of the convex polygon, of
 * either winding; a negative margin admits centres up to −margin outside.
 */
export function insideConvex(polygon: readonly Point[], x: number, y: number, margin: number): boolean {
  const [[ax, ay], [bx, by], [cx, cy]] = polygon;
  const winding = Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  return polygon.every(([px, py], index) => {
    const [qx, qy] = polygon[(index + 1) % polygon.length];
    return (((qx - px) * (y + 0.5 - py) - (qy - py) * (x + 0.5 - px)) / Math.hypot(qx - px, qy - py)) * winding >= margin;
  });
}

/** The convex hull of screen points (monotone chain). */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: readonly Point[]) => {
    const chain: Point[] = [];
    for (const point of list) {
      while (chain.length >= 2 && cross(chain.at(-2)!, chain.at(-1)!, point) <= 0) chain.pop();
      chain.push(point);
    }
    return chain.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** A logical pixel as one number, for sets of pixels. */
export const pixelKey = (x: number, y: number): number => y * 640 + x;

// Lighting (LS2–LS7)

/** The scene settings' ambient byte, 32 (RUN_SETTINGS: ambient 0.125), as the ramp builder's a. */
const AMBIENT = 32 / 256;
/** k = F((N − 1) × I): 4 shades and the directional intensity 0.5 (LS6). */
const LIGHT_K = F(3 * 0.5);
/** The vector towards the light in the world (LS2). */
const TOWARDS_LIGHT = Object.freeze([-1, 0, 0]);

const roundHalfEven = (value: number): number => {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
};

/** The flat shade of a face with model-space normal `normal` on a model of `rows` (LS2 L_model, LS6, LS7 flat shade). */
export function flatShade(rows: Rows, normal: readonly [number, number, number]): number {
  const towards = [0, 1, 2].map(row => rows[row * 3] * TOWARDS_LIGHT[0] + rows[row * 3 + 1] * TOWARDS_LIGHT[1] + rows[row * 3 + 2] * TOWARDS_LIGHT[2]);
  const length = 1 / Math.sqrt(F((towards[0] ** 2 + towards[1] ** 2) + towards[2] ** 2));
  const scaled = towards.map(component => F(F(component * length) * LIGHT_K));
  const d = F((scaled[1] * normal[1] + scaled[0] * normal[0]) + scaled[2] * normal[2]);
  const fixed = d <= 0 ? 0 : roundHalfEven(256 * d);
  return ((fixed + 0x80) >> 8) & 0xffff;
}

/** Ramp entry `shade` of colour `colour` with `shades` entries (LS4: entry N − 1 is c, one shade is c itself). */
export function rampEntry(colour: Rgb, shade: number, shades = 4): Rgb {
  if (shades === 1) return colour;
  return colour.map(c => Math.min(255, Math.trunc(c * AMBIENT + c * ((shade / (shades - 1)) * F(1 - AMBIENT))))) as unknown as Rgb;
}

/** The DATA colour of the scene content a ramp entry is drawn in (LS4: the nearest entry). */
export const shown = (colour: Rgb): Rgb => SCENE_DATA[nearestEntry(SCENE_DATA, colour)];

/** A colour component as a byte: round half to even of the clamped value × 255 (HS7). */
export const colourByte = (component: number): number => roundHalfEven(Math.min(Math.max(component, 0), 1) * 255);

// Models

/** Rows turned about R1 so that R2 = (sin, 0, cos): yaw by asin(`sin`). */
export const yaw = (sin: number): Rows => {
  const cos = Math.sqrt(1 - sin * sin);
  return [cos, 0, -sin, 0, 1, 0, sin, 0, cos];
};

/** Both triangles of the scene quad face model −z (normalise((b − a) × (c − a)) of its stored corners). */
export const QUAD_NORMAL = Object.freeze([0, 0, -1] as const);

/** A model point (x, y, z) of a model at `position` with `rows`, placed at P + x·R0 + y·R1 + z·R2 (PV5) and projected. */
export const placed = (position: Vec3, rows: Rows, [x, y, z]: readonly number[], cy = 158): Point => project(
  position.x + x * rows[0] + y * rows[3] + z * rows[6], position.y + x * rows[1] + y * rows[4] + z * rows[7], position.z + x * rows[2] + y * rows[5] + z * rows[8], cy,
);

/** The scene quad (−1…1 on the model's xy plane) of a model at `position` relative to the identity camera. */
export class QuadView {
  readonly position: Vec3;
  readonly rows: Rows;
  readonly cy: number;
  readonly corners: readonly Point[];

  constructor(position: Vec3, rows: Rows, cy = 158) {
    this.position = position;
    this.rows = rows;
    this.cy = cy;
    this.corners = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]].map(corner => placed(position, rows, corner, cy));
  }

  /**
   * The texture coordinate at pixel centre (x + 0.5, y + 0.5) interpolated affinely in screen space over the stored
   * triangle that covers it (LS7: no per-pixel division), or null outside both.
   */
  uvAffine(x: number, y: number): readonly [number, number] | null {
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const [px, py] = [x + 0.5, y + 0.5];
    for (const corners of [[0, 2, 1], [0, 3, 2]]) {
      const [a, b, c] = corners.map(index => this.corners[index]);
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const wb = ((px - a[0]) * (c[1] - a[1]) - (py - a[1]) * (c[0] - a[0])) / area;
      const wc = ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) / area;
      const wa = 1 - wb - wc;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const [ua, ub, uc] = corners.map(index => uvs[index]);
      return [wa * ua[0] + wb * ub[0] + wc * uc[0], wa * ua[1] + wb * ub[1] + wc * uc[1]];
    }
    return null;
  }

  /** The model-plane point (u, v in 0–1) the pixel centre (x + 0.5, y + 0.5) shows, by casting its ray onto the plane. */
  uvAt(x: number, y: number): readonly [number, number] {
    const direction = [(x + 0.5 - 320) / 640, (this.cy - (y + 0.5)) / 640, 1];
    const { x: px, y: py, z: pz } = this.position;
    const normal = [this.rows[6], this.rows[7], this.rows[8]];
    const t = (normal[0] * px + normal[1] * py + normal[2] * pz) / (normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2]);
    const offset = [t * direction[0] - px, t * direction[1] - py, t * direction[2] - pz];
    const local = (row: number) => offset[0] * this.rows[row * 3] + offset[1] * this.rows[row * 3 + 1] + offset[2] * this.rows[row * 3 + 2];
    return [(local(0) + 1) / 2, (local(1) + 1) / 2];
  }

  /** Whether the pixel's centre lies at least `margin` pixels inside every edge (−margin: up to that far outside). */
  inside(x: number, y: number, margin: number): boolean {
    return insideConvex(this.corners, x, y, margin);
  }

  /** Pixels whose centre lies at least `margin` pixels inside every edge. */
  interior(margin = 2): Point[] {
    return [...pixelsAround(this.corners, Math.max(0, Math.ceil(-margin)) + 1)].filter(([x, y]) => this.inside(x, y, margin));
  }

  /** `interior(margin)` as pixel keys. */
  interiorKeys(margin = 2): Set<number> {
    return new Set(this.interior(margin).map(([x, y]) => pixelKey(x, y)));
  }

  /** Pixels at least `margin` pixels outside some edge, within `ring` pixels of the quad. */
  outside(margin = 2, ring = 6): Point[] {
    return [...pixelsAround(this.corners, ring)].filter(([x, y]) => !this.inside(x, y, -margin));
  }
}

/** The lighting texture's 4 × 2 indices, row 0 first, into TEXTURE_COLOURS. */
const TEXTURE_INDICES = Object.freeze([0, 1, 2, 3, 3, 2, 1, 0]);

/** The texel a texture coordinate reads (LS7: nearest, repeat), or null within `margin` texels of a texel edge. */
export function texelAt([u, v]: readonly [number, number], margin = 0.2): number | null {
  const [s, t] = [u * 4, v * 2];
  const near = (value: number) => value - Math.floor(value) < margin || Math.ceil(value) - value < margin;
  if (near(s) || near(t)) return null;
  return TEXTURE_INDICES[(Math.floor(t) & 1) * 4 + (Math.floor(s) & 3)];
}
