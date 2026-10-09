/** Thrown when a caller violates a Core input contract. */
export class CoreInputError extends Error {
  /** Location of the offending value, e.g. `config.seed` or `tickInput.commands[2].type`. */
  readonly path: string;
  /** What the value violates, without the path. */
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`${path} ${reason}`);
    this.name = 'CoreInputError';
    this.path = path;
    this.reason = reason;
  }
}

/**
 * Stable codes of CoreFaultError (docs/plan/p3/02/spec.md, 行为与边界): an internal invariant broke, a CoreLimits
 * budget ran out while a tick was executing, or the call reached a world that had already faulted.
 */
export type CoreFaultCode = 'invariant-violated' | 'budget-exhausted' | 'world-faulted';

/**
 * Thrown when Core itself fails, not the caller: never a subclass or superclass of CoreInputError. The world that
 * throws it is latched faulted and publishes no partial result; P3-04 stops the run.
 */
export class CoreFaultError extends Error {
  readonly code: CoreFaultCode;
  /** A fixed identifier of where Core detected the fault, e.g. `step.events`; never content, names or coordinates. */
  readonly site: string;

  constructor(code: CoreFaultCode, site: string) {
    super(`${code} at ${site}`);
    this.name = 'CoreFaultError';
    this.code = code;
    this.site = site;
  }
}
