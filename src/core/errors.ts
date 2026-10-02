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
