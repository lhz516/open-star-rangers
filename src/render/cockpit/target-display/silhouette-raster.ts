/**
 * The 3D library's triangle fill in one colour (docs/original/formats/executable.md, rasterisation rules RS1, RS2 and
 * RS4, P3-12/07), for the right display's silhouette, where every face has the same colour (hud.md §4.5). Pure and on
 * the CPU, at the device's own pixels.
 *
 * - **Rows (RS1):** a vertex's row is round-half-even(sy); the vertices are rotated, keeping their cyclic order, so that
 *   the first has the smallest row; the triangle covers rows from the top row up to, not including, the bottom row, and
 *   nothing when all three rows are equal.
 * - **Columns (RS2):** an edge starts at its upper vertex's round-half-even(sx · 65536) in 16.16 fixed point, without a
 *   prestep, and advances per row by chop((x₂ − x₁) · F(1/Δrow) · 65536); a row covers ⌊xl / 65536⌋ ≤ x < ⌊xr / 65536⌋.
 * - **Cull (RS4):** with integer rows r and the f32 x of the rotated vertices A, B, C: three different rows are drawn
 *   when (x_B − x_A)(r_C − r_A) − (x_C − x_A)(r_B − r_A) ≥ 0; a flat top (r_A = r_B) when x_B > x_A, a flat top with
 *   r_C = r_A when x_A > x_C, a flat bottom (r_B = r_C) when x_B > x_C. The kept triangles run clockwise on screen.
 * - **Depth:** none. All faces share one colour and the cleared depth is the farthest value, so the library's depth
 *   test (RS5) cannot change a pixel of this device.
 *
 * Pixels outside the surface are dropped; a vertex that is not finite draws nothing. The original's 32-bit fixed-point
 * edges would overflow for |sx| ≥ 32768, far off the 100-pixel device; that is not reproduced.
 */
import type { IndexedSurface } from '../raster/indexed-surface.ts';

/** A projected vertex: the f32 screen position the library stores at +0x08 (sx) and +0x0C (sy). */
export interface ScreenVertex {
  readonly x: number;
  readonly y: number;
}

const FIXED = 65_536;

/** The baseline's FPU rounding: to the nearest integer, ties to even. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction !== 0.5) return fraction < 0.5 ? floor : floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** The f32 entry n of the reciprocal table `0x17918c`: 1/n, and 0 for n = 0. */
const reciprocal = (rows: number): number => (rows === 0 ? 0 : Math.fround(1 / rows));

interface Corner {
  readonly x: number;
  readonly row: number;
}

/** One edge from its upper corner's row (inclusive) to its lower corner's row (exclusive), in 16.16 fixed point. */
interface Edge {
  readonly top: number;
  readonly bottom: number;
  readonly start: number;
  readonly step: number;
}

function edge(upper: Corner, lower: Corner): Edge {
  return {
    top: upper.row,
    bottom: lower.row,
    start: roundHalfEven(upper.x * FIXED),
    step: Math.trunc((lower.x - upper.x) * reciprocal(lower.row - upper.row) * FIXED),
  };
}

/** The fixed-point x at `row` of the side made of `edges`, top to bottom. */
function sideAt(edges: readonly Edge[], row: number): number {
  const current = edges.find(({ bottom }) => row < bottom) ?? edges[edges.length - 1];
  return current.start + (row - current.top) * current.step;
}

interface Sides {
  readonly left: readonly Edge[];
  readonly right: readonly Edge[];
}

/** The sides of a triangle whose corners are rotated so that `a` has the smallest row; null when RS4 culls it. */
function sides(a: Corner, b: Corner, c: Corner): Sides | null {
  if (a.row === b.row && b.row === c.row) return null;
  if (a.row === b.row) return b.x > a.x ? { left: [edge(a, c)], right: [edge(b, c)] } : null;
  if (a.row === c.row) return a.x > c.x ? { left: [edge(c, b)], right: [edge(a, b)] } : null;
  if (b.row === c.row) return b.x > c.x ? { left: [edge(a, c)], right: [edge(a, b)] } : null;
  if (!((b.x - a.x) * (c.row - a.row) - (c.x - a.x) * (b.row - a.row) >= 0)) return null;
  return b.row < c.row ? { left: [edge(a, c)], right: [edge(a, b), edge(b, c)] } : { left: [edge(a, c), edge(c, b)], right: [edge(a, b)] };
}

/** Fills the triangle, given in stored order, with `colour` by the library's rules unless RS4 culls it. */
export function fillTriangle(surface: IndexedSurface, vertices: readonly [ScreenVertex, ScreenVertex, ScreenVertex], colour: number): void {
  if (!vertices.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))) return;
  const corners = vertices.map(({ x, y }) => ({ x, row: roundHalfEven(y) }));
  let first = 0;
  if (corners[1].row < corners[first].row) first = 1;
  if (corners[2].row < corners[first].row) first = 2;
  const [a, b, c] = [0, 1, 2].map((offset) => corners[(first + offset) % 3]);
  const kept = sides(a, b, c);
  if (kept === null) return;
  const { width, height, indices } = surface;
  const bottom = Math.min(Math.max(b.row, c.row), height);
  for (let row = Math.max(a.row, 0); row < bottom; row++) {
    const left = Math.max(Math.floor(sideAt(kept.left, row) / FIXED), 0);
    const right = Math.min(Math.floor(sideAt(kept.right, row) / FIXED), width);
    if (left < right) indices.fill(colour, row * width + left, row * width + right);
  }
}
