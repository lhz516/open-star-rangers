/**
 * Thrown by an initialization step that failed and then could not release everything it had
 * acquired. `cause` is the original failure; `errors` holds it first, then every rollback failure.
 * Callers treat it as a cleanup failure. Any other error from such a step, an AggregateError
 * included, means the rollback succeeded.
 */
export class RollbackError extends AggregateError {
  constructor(cause: unknown, rollbackErrors: readonly unknown[], message: string) {
    super([cause, ...rollbackErrors], message, { cause });
    this.name = 'RollbackError';
  }
}
