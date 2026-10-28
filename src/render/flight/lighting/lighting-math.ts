/**
 * The arithmetic of the original's ramp lighting (docs/original/formats/executable.md, LS2, LS3, LS6, LS7; mesh.md,
 * native normal slots), with the baseline's rounding (executable.md, baseline emulator arithmetic): double arithmetic
 * and f32 stores, F(·) below, round to nearest even, and so do the magic-number conversions. Pure numbers, so every
 * step can be compared with an independent computation.
 *
 * - **Intensity** of a light colour C: F(((C0·77 + C1·150) + C2·29) · (1/256)); the hue is not used (LS2).
 * - **Ambient byte:** min(255, round-half-even(256·I_amb)); the ramps use a = byte / 256 (LS3).
 * - **Light in model space:** the light frame points along world +x, so the vector towards it is L = (−1, 0, 0); in a
 *   frame with axes X, U, D it is (−X.x, −U.x, −D.x) of the f32 axes the library stores, normalised by `0x948a4`
 *   (LS2). The single-light path scales it once: L′ = F(L·k) per component, k = F((N − 1)·I_d) (LS6).
 * - **Lit value** of a normal n: d = F((L′y·ny + L′x·nx) + L′z·nz); round-half-even(256·d) when d > 0, else 0, an 8.8
 *   fixed-point value (LS6). A triangle's or pixel's shade is (value + 0x80) >> 8 (LS7).
 * - **Normals:** `0x948a4` divides by the f32 length; `0x94938` first divides by the largest |component| and leaves a
 *   vector whose largest |component| is below 1e-4 unchanged; both store f32. The face normal `0x97b14` is
 *   normalise(normalise(b − a) × normalise(c − a)) with `0x94938`, the differences and the cross product stored f32,
 *   corners in stored order (LS6).
 */
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';

const F = Math.fround;

/** `0x94938` leaves a vector whose largest |component| is below this unchanged. */
const SCALED_NORMALISE_MINIMUM = 1e-4;

/** The shade count of lit primitives: the device's and every texture's (LS4). */
export const LIT_SHADES = 4;

const vec = (x: number, y: number, z: number): Vec3 => Object.freeze({ x, y, z });

/** Rounds to the nearest integer, ties to even, as the magic-number conversions do. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction !== 0.5) return fraction < 0.5 ? floor : floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** The mono intensity of a light colour (`0x7b074`). */
export function lightIntensity([c0, c1, c2]: readonly [number, number, number]): number {
  return F(((c0 * 77 + c1 * 150) + c2 * 29) * (1 / 256));
}

/** The ambient byte `0x7f444` sends: round-half-even(256·I), at most 255. */
export function ambientByte(intensity: number): number {
  return Math.min(255, roundHalfEven(256 * intensity));
}

/** `0x948a4`: (1, 0, 0) for a zero vector, otherwise each component times 1/√F((x² + y²) + z²), stored f32. */
export function normaliseVector({ x, y, z }: Vec3): Vec3 {
  if (x === 0 && y === 0 && z === 0) return vec(1, 0, 0);
  const r = 1 / Math.sqrt(F((x * x + y * y) + z * z));
  return vec(F(x * r), F(y * r), F(z * r));
}

/** `0x94938`: scaled by 1 / the largest |component| and stored f32, then by 1/√F((x² + y²) + z²) and stored f32. */
export function normaliseScaled(v: Vec3): Vec3 {
  const largest = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
  if (!(largest >= SCALED_NORMALISE_MINIMUM)) return v;
  const scale = 1 / largest;
  // Never zero once scaled, so 0x948a4's tail is the same.
  return normaliseVector(vec(F(v.x * scale), F(v.y * scale), F(v.z * scale)));
}

const difference = (a: Vec3, b: Vec3): Vec3 => vec(F(a.x - b.x), F(a.y - b.y), F(a.z - b.z));

/** The library's face normal `0x97b14` of corners a, b, c in stored order. */
export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const e = normaliseScaled(difference(b, a));
  const f = normaliseScaled(difference(c, a));
  return normaliseScaled(vec(F(e.y * f.z - e.z * f.y), F(e.z * f.x - e.x * f.z), F(e.x * f.y - e.y * f.x)));
}

/** k = F((N − 1)·I_d) of the single-light path, with the lit primitives' N shades. */
export const lightScale = (directional: number): number => F((LIT_SHADES - 1) * directional);

/** L′: the vector towards the light in the model space of a frame drawn with rows (X, U, D), times `scale`. */
export function modelLight(rows: Matrix3, scale: number): Vec3 {
  const { x, y, z } = normaliseVector(vec(-F(rows[0]), -F(rows[3]), -F(rows[6])));
  return vec(F(x * scale), F(y * scale), F(z * scale));
}

/** The 8.8 lit value of normal `n` under L′ (`0x6e3b8`). */
export function litValue(light: Vec3, n: Vec3): number {
  const d = F((light.y * n.y + light.x * n.x) + light.z * n.z);
  return d > 0 ? roundHalfEven(256 * d) : 0;
}

/** The shade of an 8.8 value: (value + 0x80) >> 8, per triangle (flat) or per interpolated pixel (Gouraud). */
export const shadeOf = (value: number): number => Math.floor((value + 0x80) / 256);
