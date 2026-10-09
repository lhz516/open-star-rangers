/**
 * Float32 values on the original's conversion and placement paths (docs/original/formats/executable.md, x87 precision,
 * rounding and trigonometry, P3-02/02). The original computes in double precision and keeps the runtime scale factor,
 * positions and attitudes as f32.
 *
 * Q-11 (docs/plan/p3/02/goal.md, 执行记录, "Q-11 舍入方向改为就近（用户批准）"): every f32 store in Core rounds to
 * nearest with ties to even, which is `Math.fround`; the original runs matched that rounding at every placement where
 * the two directions differ. JavaScript's double-precision steps round to nearest as well, so a value rounded more than
 * once (the world check) follows the same steps.
 */

/** The largest finite float32, (2 − 2^−23) × 2^127. */
export const FLOAT32_MAX = (2 - 2 ** -23) * 2 ** 127;

/** Whether `value` is a finite float32 value (−0 included). */
export function isFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Math.fround(value) === value;
}
