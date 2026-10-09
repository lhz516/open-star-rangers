/**
 * Float32 stores on the original's conversion and placement paths (docs/original/formats/executable.md, x87 precision,
 * rounding and trigonometry, P3-02/02). The original keeps the runtime scale factor, positions and attitudes as f32,
 * and once its renderer has run, every arithmetic result and f32 store rounds toward zero (chop).
 *
 * Coordinator decision Q-11 (docs/plan/p3/02/goal.md, 执行记录): every f32 store in Core rounds toward zero. The
 * double-precision intermediates before a store use JavaScript's round-to-nearest, where the original chops each
 * step; a value rounded more than once (the world check) can therefore differ from the original by one f32 ulp. Values
 * that are exact in double precision, which the supported coordinate range guarantees for the conversion and the
 * random placement routines, are rounded once and match exactly.
 */

/** The largest finite float32, (2 − 2^−23) × 2^127. */
export const FLOAT32_MAX = (2 - 2 ** -23) * 2 ** 127;

// Scratch views for stepping one float32 toward zero; every call writes before it reads, so nothing is kept.
const scratch = new Float32Array(1);
const scratchBits = new Uint32Array(scratch.buffer);

/**
 * Rounds `value` to float32 toward zero. ±0 keeps its sign; a finite magnitude above the float32 range gives
 * ±FLOAT32_MAX, as chop does.
 */
export function toFloat32TowardZero(value: number): number {
  const nearest = Math.fround(value);
  if (!(Math.abs(nearest) > Math.abs(value))) return nearest;
  // Round-to-nearest went one step away from zero; the next float32 toward zero has the bit pattern one lower.
  scratch[0] = nearest;
  scratchBits[0] -= 1;
  return scratch[0];
}

/** Whether `value` is a finite float32 value (−0 included). */
export function isFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Math.fround(value) === value;
}
