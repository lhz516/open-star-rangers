/**
 * The star field (docs/plan/p3/12/spec.md, 星点与速度尘埃, S-15, Q-14; docs/original/formats/executable.md, SD2, SD3,
 * FC2 step 12): 500 fixed directions, each drawn as one logical pixel in its DATA colour wherever the camera's rows turn
 * it into the view. It reads only the camera rows and the viewport bottom: the camera position, the clock and every
 * random source play no part.
 *
 * - **Table (`0x3fbc0`, SD2):** the original builds it before the C library's generator is seeded, from draws 1–1000 of
 *   the default sequence, so it is the same in every run and mission. This module reproduces that sequence with a
 *   generator of its own (`WatcomRand`); it never uses or advances the run's presentation random source.
 * - **Projection (`0x3fd60`, SD3):** rotated by the rows only, kept when z′ ≥ K and −S < x′ < S, scaled about
 *   (320, 320) and moved up by hd′ = 81 rows, rows 0 to `bottom` inclusive. The pixel is written without clipping, so
 *   sx = 640 lands at column 0 of the next row, as the original's frame-buffer write does.
 *
 * Arithmetic: double operations with `Math.fround` where the original stores f32, in its order; V8's `Math.sin` and
 * `Math.cos` give the original's table bit for bit (SD2).
 */
import { RAND_SCALE } from '../../../core/rules/original-random.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';

/** The C library's `rand()` from its unseeded default state: state × 0x41C64E6D + 0x3039 mod 2³², bits 16–30. */
export class WatcomRand {
  #state = 1;

  next(): number {
    this.#state = (Math.imul(this.#state, 0x41c64e6d) + 0x3039) >>> 0;
    return (this.#state >>> 16) & 0x7fff;
  }
}

export interface StarDirection {
  /** f32, unit length up to rounding. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The DATA palette index, i % 6 + 1. */
  readonly colour: number;
}

export const STAR_COUNT = 500;

/** The f64 constants `0x171908` and `0x171910`: 3.1415927 and 6.2831854, not the doubles nearest π and 2π. */
const PI_PRIME = 3.1415927;
const TWO_PI_PRIME = 6.2831854;

const HALF_ANGLE = Math.atan2(0.5, 1);
/** S = F(sin(atan 0.5)): the half-width of the accepted x′. */
export const STAR_S = Math.fround(Math.sin((2 * HALF_ANGLE) * 0.5));
/** K = F(cos(√2 · atan 0.5)): the least accepted z′ and the projection's plane. */
export const STAR_K = Math.fround(Math.cos(((2 * HALF_ANGLE) * Math.SQRT2) * 0.5));

function buildStarTable(): readonly StarDirection[] {
  const rand = new WatcomRand();
  const raw: [number, number, number][] = [];
  for (let index = 0; index < STAR_COUNT; index++) {
    const theta = Math.fround(rand.next() * RAND_SCALE) * PI_PRIME;
    const phi = (rand.next() * RAND_SCALE) * TWO_PI_PRIME;
    const sinTheta = Math.sin(theta);
    raw.push([Math.fround(Math.cos(phi) * sinTheta), Math.fround(Math.sin(phi) * sinTheta), Math.fround(Math.cos(theta))]);
  }
  return Object.freeze(raw.map(([x, y, z], index) => {
    const inverse = 1 / Math.sqrt((y * y + x * x) + z * z);
    return Object.freeze({ x: Math.fround(x * inverse), y: Math.fround(y * inverse), z: Math.fround(z * inverse), colour: (index % 6) + 1 });
  }));
}

let table: readonly StarDirection[] | null = null;

/** The original's star table; the same object on every call. */
export function starTable(): readonly StarDirection[] {
  table ??= buildStarTable();
  return table;
}

/** HI: hd′ = (639 − 479 + 2) >> 1 and hw = (639 + 1) >> 1. */
const ROW_SHIFT = 81;
const HALF_WIDTH = 320;
const SCALE = HALF_WIDTH * (1 / STAR_S);

/** Receives each drawn star in table order; a later star overwrites an earlier one. */
export type StarPlot = (sx: number, sy: number, colour: number) => void;

/** The screen position of x′ and y′ (SD3 steps 4 and 5), or null when it is skipped for rows 0 to `bottom`. */
export function starScreen(xPrime: number, yPrime: number, bottom: number): { readonly sx: number; readonly sy: number } | null {
  const sxf = Math.fround(SCALE * xPrime + HALF_WIDTH);
  const syf = Math.fround(-SCALE * yPrime + HALF_WIDTH);
  if (!(ROW_SHIFT <= syf && syf < bottom + ROW_SHIFT)) return null;
  return { sx: Math.trunc(sxf + 0.5), sy: Math.trunc(syf + 0.5) - ROW_SHIFT };
}

/** `0x3fd60(bottom)`: plots every star the camera `rows` show, in table order. */
export function drawStars(rows: Matrix3, bottom: number, plot: StarPlot): void {
  const [r0x, r0y, r0z, r1x, r1y, r1z, r2x, r2y, r2z] = rows;
  for (const { x, y, z, colour } of starTable()) {
    const depth = (y * r2y + x * r2x) + z * r2z;
    if (!(depth >= STAR_K)) continue;
    const ratio = STAR_K / Math.fround(depth);
    const xPrime = Math.fround(((y * r0y + x * r0x) + z * r0z) * ratio);
    const yPrime = Math.fround(((y * r1y + x * r1x) + z * r1z) * ratio);
    if (!(-STAR_S < xPrime && xPrime < STAR_S)) continue;
    const screen = starScreen(xPrime, yPrime, bottom);
    if (screen !== null) plot(screen.sx, screen.sy, colour);
  }
}
