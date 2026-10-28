/**
 * The flight-view overlay's constants and arithmetic (docs/original/formats/hud.md §4.6; P3-13 spec, F1 叠加 and DC-10):
 * the HI parameter block `0x17599c`, the camera transform `0x56dc0`, the screen projection of `0x45de0`, the rate
 * indicator `0x46fe0` and the two distances. f32 stores are reproduced with `Math.fround`; x87 extended intermediates
 * are taken in double precision, which can differ only where a value lies within the last bits of an integer boundary.
 */
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { CameraPose } from '../../flight/presentation/presentation-contract.ts';
import { chop32 } from '../gauges/gauge-bars.ts';

const { fround } = Math;

/** `0x45420`: f = width − 1 and the centre (width − 1) >> 1, (viewport bottom 315) >> 1, not the renderer's (320,158). */
export const OVERLAY_CENTRE = Object.freeze({ x: 319, y: 157 });
const FOCAL = 639;
/** `0x1751f8`, `0x1751fc`: the exclusive bounds every mark test uses (width − 1, height − 1). */
export const MARK_LIMIT = Object.freeze({ x: 639, y: 479 });
/** Parameter block +0x34: the aim box half-size, strict on both sides. */
const AIM_HALF = 50;

/** A screen point of the overlay. */
export interface OverlayPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * `0x56dc0`: the point in the camera's frame, row k of the result = row k · (point − camera). Row 0 uses the exact
 * differences, rows 1 and 2 the differences stored as f32; each sum is (dy·r1 + dx·r0) + dz·r2, stored as f32.
 */
export function cameraSpace({ position: origin, rows }: CameraPose, point: Vec3): Vec3 {
  const [dx, dy, dz] = [point.x - origin.x, point.y - origin.y, point.z - origin.z];
  const [fx, fy, fz] = [fround(dx), fround(dy), fround(dz)];
  return {
    x: fround(dy * rows[1] + dx * rows[0] + dz * rows[2]),
    y: fround(fy * rows[4] + fx * rows[3] + fz * rows[5]),
    z: fround(fy * rows[7] + fx * rows[6] + fz * rows[8]),
  };
}

/** x = chop(639x × (1/z)) + 319, y = chop(−639y × (1/z)) + 157. */
export function screenPoint({ x, y, z }: Vec3): OverlayPoint {
  const inverse = 1 / z;
  return { x: chop32(FOCAL * x * inverse) + OVERLAY_CENTRE.x, y: chop32(-FOCAL * y * inverse) + OVERLAY_CENTRE.y };
}

/** The aim flag: the point lies strictly within ±50 of the centre on both axes. */
export const inAimBox = ({ x, y }: OverlayPoint): boolean =>
  OVERLAY_CENTRE.x - AIM_HALF < x && x < OVERLAY_CENTRE.x + AIM_HALF && OVERLAY_CENTRE.y - AIM_HALF < y && y < OVERLAY_CENTRE.y + AIM_HALF;

/** `0x482fc`: the point lies in [0, 639) × [0, 479). */
export const onScreen = (x: number, y: number): boolean => x >= 0 && x < MARK_LIMIT.x && y >= 0 && y < MARK_LIMIT.y;

/** `0x483ac` and the inline tests: the square of half-size r around (x, y) lies in [0, 639) × [0, 479). */
export const fitsOnScreen = (x: number, y: number, r: number): boolean =>
  x - r >= 0 && x + r < MARK_LIMIT.x && y - r >= 0 && y + r < MARK_LIMIT.y;

/** `0x45de0`: f32 √(dz² + dx² + dy²) of the f32 differences (weapon ranges and lead distance). */
export function weaponDistance(from: Vec3, to: Vec3): number {
  const [dx, dy, dz] = [fround(to.x - from.x), fround(to.y - from.y), fround(to.z - from.z)];
  return fround(Math.sqrt(dz * dz + dx * dx + dy * dy));
}

/** `0x56b14`: √((dy·R(dy) + dx·R(dx)) + dz·R(dz)) of the exact differences, R rounding to f32; not stored (time to target). */
export function readoutDistance(from: Vec3, to: Vec3): number {
  const [dx, dy, dz] = [from.x - to.x, from.y - to.y, from.z - to.z];
  return Math.sqrt(dy * fround(dy) + dx * fround(dx) + dz * fround(dz));
}

/** Row k of a row-major 3 × 3 matrix. */
export const matrixRow = (rows: readonly number[], k: number): Vec3 => ({ x: rows[3 * k], y: rows[3 * k + 1], z: rows[3 * k + 2] });

// The rate indicator `0x46fe0`.

/** The double `0x171c4e`: the smoothing rate in rad/s per second (55° in radians). */
export const RATE_ACCELERATION = 0.9599311027777778;
/** The double `0x171c56` and parameter +0x48: the stem's scale. */
const STEM_PI = 3.1415927;
const STEM_SCALE = 4;
/** `0x45420`: f32 cos and sin of the double 10° `0x171c27`. */
const COS_10 = fround(Math.cos(0.1745329277777778));
const SIN_10 = fround(Math.sin(0.1745329277777778));
/** Parameter block +0x4C, +0x50 and +0x54: the bar's, the chevron bases' and the chevron tips' radii. */
const BAR_RADIUS = 48;
const BASE_RADIUS = 30;
const TIP_RADIUS = 34;

/**
 * One smoothing step towards `target` by `step` seconds × 0.9599: up while below the target (or unordered), down
 * otherwise; the unrounded result is compared, and the target replaces a step that passes it.
 */
export function smoothRate(current: number, target: number, step: number): number {
  const delta = step * RATE_ACCELERATION;
  if (!(current >= target)) {
    const next = delta + current;
    return next > target ? target : fround(next);
  }
  const next = current - delta;
  return next >= target ? fround(next) : target;
}

/** The figure's stored points: the stem end y and X0–X7 (bar X0–X1, chevrons X2–X4, X2–X6, X3–X5, X3–X7). */
export interface RateFigure {
  readonly stemY: number;
  readonly points: readonly OverlayPoint[];
}

/** The stem end and the points around (319, stem end) for the smoothed rates s1 and θ (f32). */
export function rateFigure(s1: number, theta: number): RateFigure {
  const { x: cx, y: cy } = OVERLAY_CENTRE;
  const stemY = chop32(s1 * STEM_PI * STEM_SCALE + cy);
  const [cos, sin] = [Math.cos(theta), Math.sin(theta)];
  const sinF = fround(sin);
  const p = cos * COS_10;
  const [pF, qF] = [fround(p), fround(SIN_10 * sin)];
  const r = COS_10 * sinF;
  const [rF, sF] = [fround(r), fround(cos * SIN_10)];
  const pair = (a: number, b: number): OverlayPoint[] => [{ x: cx + a, y: stemY - b }, { x: cx - a, y: stemY + b }];
  return Object.freeze({
    stemY,
    points: Object.freeze([
      ...pair(chop32(BAR_RADIUS * cos), chop32(BAR_RADIUS * sinF)),
      ...pair(chop32(BASE_RADIUS * cos), chop32(BASE_RADIUS * sinF)),
      ...pair(chop32(TIP_RADIUS * (p - qF)), chop32(TIP_RADIUS * (r + sF))),
      ...pair(chop32(TIP_RADIUS * (pF + qF)), chop32(TIP_RADIUS * (rF - sF))),
    ]),
  });
}
