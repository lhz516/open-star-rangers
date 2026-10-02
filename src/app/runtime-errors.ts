export type GameRuntimeErrorDetails =
  | { readonly kind: 'invalid-argument'; readonly path: string; readonly reason: string; readonly cause?: unknown }
  | { readonly kind: 'reentrant-call' }
  | { readonly kind: 'listener-failed'; readonly errors: readonly unknown[] }
  | { readonly kind: 'faulted'; readonly cause: unknown };

export class GameRuntimeError extends Error {
  readonly kind: GameRuntimeErrorDetails['kind'];
  declare readonly path?: string;
  declare readonly reason?: string;
  declare readonly errors?: readonly unknown[];

  constructor(details: GameRuntimeErrorDetails) {
    let message: string;
    switch (details.kind) {
      case 'invalid-argument': message = `${details.path} ${details.reason}`; break;
      case 'listener-failed': message = `${details.errors.length} synchronous listener failure(s)`; break;
      case 'reentrant-call': message = 'Cannot advance a frame during event delivery'; break;
      case 'faulted': message = 'Runtime is faulted; create a new session to recover'; break;
    }
    super(message, 'cause' in details ? { cause: details.cause } : undefined);
    this.name = 'GameRuntimeError';
    this.kind = details.kind;
    if (details.kind === 'invalid-argument') {
      this.path = details.path;
      this.reason = details.reason;
    }
    if (details.kind === 'listener-failed') this.errors = Object.freeze([...details.errors]);
  }
}
