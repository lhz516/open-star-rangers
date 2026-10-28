/**
 * The presentation module's errors and budgets (docs/plan/p3/02/spec.md, FS-07). Every budget is checked before the
 * allocation it bounds; exceeding one is a `presentation-capacity` error, which faults the module's consumer.
 */
import { CORE_LIMITS } from '../../../core/contracts/limits.ts';

export type PresentationErrorKind =
  /** A budget below would be exceeded. */
  | 'presentation-capacity'
  /** A frame of another owner or run, a tick out of order, or a malformed input; the module is unchanged. */
  | 'invalid-input'
  /** A view the presentation has no camera for. */
  | 'unsupported-view'
  /** A Core fact or a seam request contradicts the contract. */
  | 'invariant-violated'
  /** The module was disposed or has failed. */
  | 'invalid-state';

export class PresentationError extends Error {
  readonly kind: PresentationErrorKind;
  readonly path: string;
  readonly reason: string;

  constructor(kind: PresentationErrorKind, path: string, reason: string) {
    super(`${kind}: ${path} ${reason}`);
    this.name = 'PresentationError';
    this.kind = kind;
    this.path = path;
    this.reason = reason;
  }
}

/**
 * `objects`: extra explosions, discriminator-1/2 fragments and fragment explosions alive or waiting, about 4.9 times
 * the slice's worst window. `selections`: the explosions whose choice is kept, Core's and the presentation's.
 */
export const PRESENTATION_LIMITS = Object.freeze({
  objects: 4096,
  selections: CORE_LIMITS.entities + 4096,
});

/** Before one more of `count` items is allocated: `presentation-capacity` when `limit` are already held. */
export function checkCapacity(count: number, limit: number, path: string): void {
  if (count >= limit) throw new PresentationError('presentation-capacity', path, `must not exceed ${limit}`);
}
