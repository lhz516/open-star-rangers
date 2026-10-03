/** Best-effort cleanup shared by the render layer's lifecycle code. */

/** Runs every step in order, whatever fails, and returns the failures. */
export function attemptAll(steps: readonly (() => unknown)[]): unknown[] {
  const errors: unknown[] = [];
  for (const step of steps) {
    try { step(); } catch (cause) { errors.push(cause); }
  }
  return errors;
}

/** Runs every step and throws one AggregateError of the failures, if any. */
export function runCleanup(steps: readonly (() => unknown)[], message: string): void {
  const errors = attemptAll(steps);
  if (errors.length > 0) throw new AggregateError(errors, message, { cause: errors[0] });
}
