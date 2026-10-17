/** The phases of the P1 synthetic session (docs/plan/p1/05/spec.md). */
export type SessionPhase = 'idle' | 'running' | 'paused' | 'faulted' | 'disposed';
/** The formal session adds the transition holds and the recording-capacity stop (docs/plan/p3/04/spec.md, 会话, 运行中衔接). */
export type GameSessionPhase = SessionPhase | 'transition' | 'stopped';
export type SessionFailurePhase = 'runtime' | 'scheduler' | 'consumer' | 'cleanup' | 'control';

export interface SessionFailure {
  readonly phase: SessionFailurePhase;
  readonly cause: unknown;
}

export type GameSessionErrorDetails =
  | { readonly kind: 'invalid-argument'; readonly path: string; readonly reason: string; readonly cause?: unknown }
  | { readonly kind: 'invalid-state'; readonly operation: string; readonly phase: GameSessionPhase; readonly runId: number | null; readonly reason: string }
  | { readonly kind: 'operation-failed'; readonly failures: readonly SessionFailure[] };

export type SessionErrorListener = (error: GameSessionError) => undefined;

export class GameSessionError extends Error {
  readonly kind: GameSessionErrorDetails['kind'];
  declare readonly path?: string;
  declare readonly reason?: string;
  declare readonly operation?: string;
  declare readonly phase?: GameSessionPhase;
  declare readonly runId?: number | null;
  declare readonly failures?: readonly SessionFailure[];

  constructor(details: GameSessionErrorDetails) {
    let message: string;
    switch (details.kind) {
      case 'invalid-argument': message = `${details.path} ${details.reason}`; break;
      case 'invalid-state': message = `${details.operation} is invalid in ${details.phase}: ${details.reason}`; break;
      case 'operation-failed': message = `${details.failures.length} session operation failure(s)`; break;
    }
    super(message, 'cause' in details ? { cause: details.cause } : undefined);
    this.name = 'GameSessionError';
    this.kind = details.kind;
    if (details.kind === 'invalid-argument') {
      this.path = details.path;
      this.reason = details.reason;
    }
    if (details.kind === 'invalid-state') {
      this.operation = details.operation;
      this.phase = details.phase;
      this.runId = details.runId;
      this.reason = details.reason;
    }
    if (details.kind === 'operation-failed') {
      this.failures = Object.freeze(details.failures.map(({ phase, cause }) => Object.freeze({ phase, cause })));
    }
  }
}
