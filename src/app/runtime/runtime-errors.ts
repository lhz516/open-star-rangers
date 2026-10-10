export type GameRuntimeErrorDetails =
  | { readonly kind: 'invalid-argument'; readonly path: string; readonly reason: string; readonly cause?: unknown }
  | { readonly kind: 'reentrant-call' }
  | { readonly kind: 'listener-failed'; readonly errors: readonly unknown[] }
  /** The formal Runtime's pending command queue is at its limit; nothing changed. */
  | { readonly kind: 'command-queue-full' }
  /** The formal Runtime stopped because its recording could not hold another tick; the cause is Core's refusal. */
  | { readonly kind: 'recording-capacity'; readonly cause: unknown }
  /**
   * `unconfirmed` (formal Runtime only): FIFO command IDs taken into a batch whose result was never delivered, because
   * the failing step may have run part of it or the fault withheld the frame's events.
   */
  | { readonly kind: 'faulted'; readonly cause: unknown; readonly unconfirmed?: readonly number[] };

export class GameRuntimeError extends Error {
  readonly kind: GameRuntimeErrorDetails['kind'];
  declare readonly path?: string;
  declare readonly reason?: string;
  declare readonly errors?: readonly unknown[];
  declare readonly unconfirmed?: readonly number[];

  constructor(details: GameRuntimeErrorDetails) {
    let message: string;
    switch (details.kind) {
      case 'invalid-argument': message = `${details.path} ${details.reason}`; break;
      case 'listener-failed': message = `${details.errors.length} synchronous listener failure(s)`; break;
      case 'reentrant-call': message = 'Cannot advance a frame during event delivery'; break;
      case 'command-queue-full': message = 'The pending command queue is full'; break;
      case 'recording-capacity': message = 'Runtime stopped: the recording cannot hold another tick'; break;
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
    if (details.kind === 'faulted' && details.unconfirmed) this.unconfirmed = Object.freeze([...details.unconfirmed]);
  }
}
