/**
 * The original's rotated 128 × 128 blit of a nebula background and its rotation table (docs/original/formats/
 * executable.md, NB4; docs/plan/p3/12/spec.md, 星云背景; AC-09), on the logical screen.
 *
 * - **Table:** 45 rows of 128 steps; row r maps a step count along an edge to a source coordinate, for an edge of
 *   L = chop(min(128 · cos((44 − r) · F(1/44) · π/4), 127)) steps.
 * - **Angle:** θ is folded into [−π/2, 0] with two flip flags and a transpose flag (the quadrant table of NB4); the
 *   destination square of half-diagonal F(64√2) around (sx, sy) is scanned by two nested Bresenham lines, the outer
 *   step reading source coordinate u, the inner step v, so that every quadrant gives a proper rotation of the stored
 *   image: its row axis along the screen direction θ (y up), its column axis along θ + 90°. A diagonal Bresenham step
 *   writes the same source pixel at both positions, so no holes appear.
 * - **Clipping:** a pixel is written only when 0 ≤ x < 640 and 1 ≤ y ≤ `bottom`, the current view's viewport bottom:
 *   row 0 is never written.
 *
 * Arithmetic follows the original's: values it stores as f32 are rounded with Math.fround, other operations are done
 * in double precision, and chop truncates toward zero. The constants are the executable's own, not exact π multiples.
 */

import { LOGICAL_WIDTH } from '../composition/logical-screen.ts';

/** Source images are 128 × 128 indices, row-major (textures §4). */
export const NEBULA_IMAGE_SIZE = 128;

/** The furthest any written pixel lies from (sx, sy) on either axis (NB4). */
export const NEBULA_REACH = 91;

const TABLE_ROWS = 45;
const LAST_TABLE_ROW = TABLE_ROWS - 1;
const LAST_SOURCE = NEBULA_IMAGE_SIZE - 1;

const f32 = Math.fround;
const chop = Math.trunc;

/** f32 1/44, the table's angle step. */
const ONE_44TH = f32(1 / 44);
/** The executable's f64 π/4 (the table, and negated, the angle), π/2 and π (the angle normalisation, both signs). */
const QUARTER_PI = 0.785398175;
const HALF_PI = 1.57079635;
const PI = 3.1415927;
/** The f32 π the normalisation's clamps store. */
const F32_PI = f32(Math.PI);
/** f32 64√2, the destination square's half-diagonal. */
const HALF_DIAGONAL = f32(90.50967);
/** The executable's f64 4/π of the table-row choice. */
const FOUR_OVER_PI = 1.2732395259258147;

function buildRotationTable(): Uint8Array {
  const table = new Uint8Array(TABLE_ROWS * NEBULA_IMAGE_SIZE);
  for (let row = 0; row < TABLE_ROWS; row++) {
    const length = chop(Math.min(Math.cos((LAST_TABLE_ROW - row) * ONE_44TH * QUARTER_PI) * 128, 127));
    for (let step = 0; step < NEBULA_IMAGE_SIZE; step++) {
      table[row * NEBULA_IMAGE_SIZE + step] = chop(Math.min(f32(f32(step / length) * 128), 127));
    }
  }
  return table;
}

/** The rotation table: row r, step i at r · 128 + i. */
export const ROTATION_TABLE: Readonly<Uint8Array> = buildRotationTable();

/** θ folded into [−π/2, 0]; `flipOuter` and `flipInner` read 127 − u and 127 − v, `transpose` reads row v, column u. */
export interface NebulaAngle {
  readonly angle: number;
  readonly flipOuter: boolean;
  readonly flipInner: boolean;
  readonly transpose: boolean;
}

/** The angle normalisation of NB4, from θ as f32. */
export function normaliseNebulaAngle(theta: number): NebulaAngle {
  let angle = f32(theta);
  if (angle < 0 && !(angle < -HALF_PI)) return { angle, flipOuter: false, flipInner: false, transpose: false };
  if (angle < -HALF_PI) {
    if (angle < -PI) angle = -F32_PI;
    return { angle: f32(angle + HALF_PI), flipOuter: false, flipInner: true, transpose: true };
  }
  if (angle <= HALF_PI) return { angle: f32(angle - HALF_PI), flipOuter: true, flipInner: false, transpose: true };
  if (angle > PI) angle = F32_PI;
  return { angle: f32(angle - PI), flipOuter: true, flipInner: true, transpose: false };
}

/** Receives one written pixel: logical (x, y) and the source offset row · 128 + column. */
export type NebulaWrite = (x: number, y: number, source: number) => void;

/**
 * Blits a 128 × 128 image rotated by `theta` around logical (sx, sy), calling `write` for every pixel the original
 * writes, in its order; a later write to the same pixel replaces the earlier one.
 */
export function blitNebula(theta: number, sx: number, sy: number, bottom: number, write: NebulaWrite): void {
  const { angle, flipOuter, flipInner, transpose } = normaliseNebulaAngle(theta);
  const b = -QUARTER_PI - angle;
  const s = chop(HALF_DIAGONAL * Math.sin(b));
  const c = chop(HALF_DIAGONAL * Math.cos(b));
  const base = chop(Math.abs(b) * FOUR_OVER_PI * 44) * NEBULA_IMAGE_SIZE;
  const sample = (step: number, flip: boolean): number => {
    const value = ROTATION_TABLE[base + step];
    return flip ? LAST_SOURCE - value : value;
  };
  const put = (x: number, y: number, u: number, v: number): void => {
    if (x < 0 || x >= LOGICAL_WIDTH || y < 1 || y > bottom) return;
    write(x, y, transpose ? v * NEBULA_IMAGE_SIZE + u : u * NEBULA_IMAGE_SIZE + v);
  };
  // The square's corners: (sx − c, sy − s), (sx − s, sy + c), (sx + s, sy − c); its edges span c − s and c + s steps.
  const narrow = c - s;
  const wide = c + s;
  let outerX = sx - c;
  let outerY = sy - s;
  let outerStep = 0;
  if (s < 0) {
    // The outer line runs right to column sx − s; each inner line runs up, until the row that started at sy − c.
    let outerError = 2 * wide - narrow;
    let innerEndY = sy - c;
    for (const endX = sx - s; outerX <= endX; outerX++) {
      const u = sample(outerStep++, flipOuter);
      let innerError = 2 * wide - narrow;
      let x = outerX;
      for (let y = outerY, innerStep = 0; y >= innerEndY;) {
        const v = sample(innerStep++, flipInner);
        put(x, y, u, v);
        y--;
        if (innerError <= 0) innerError += 2 * wide;
        else {
          put(x, y, u, v);
          innerError += 2 * (wide - narrow);
          x++;
        }
      }
      if (outerError <= 0) outerError += 2 * wide;
      else {
        outerError += 2 * (wide - narrow);
        outerY++;
        innerEndY++;
      }
    }
  } else {
    // The outer line runs down to row sy + c; each inner line runs right, until the column that started at sx + s.
    let outerError = 2 * narrow - wide;
    let innerEndX = sx + s;
    for (const endY = sy + c; outerY <= endY; outerY++) {
      const u = sample(outerStep++, flipOuter);
      let innerError = 2 * narrow - wide;
      let y = outerY;
      for (let x = outerX, innerStep = 0; x <= innerEndX;) {
        const v = sample(innerStep++, flipInner);
        put(x, y, u, v);
        x++;
        if (innerError <= 0) innerError += 2 * narrow;
        else {
          put(x, y, u, v);
          y--;
          innerError += 2 * (narrow - wide);
        }
      }
      if (outerError <= 0) outerError += 2 * narrow;
      else {
        outerX++;
        outerError += 2 * (narrow - wide);
        innerEndX++;
      }
    }
  }
}
