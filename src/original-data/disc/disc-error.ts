/** Stable failure codes of disc image reading (P2-02 spec, error codes). Consumers classify failures by code only. */
export type DiscReadErrorCode =
  | 'unsupported-file-set'
  | 'invalid-descriptor'
  | 'unsupported-layout'
  | 'image-size-mismatch'
  | 'invalid-sector'
  | 'invalid-volume'
  | 'invalid-directory'
  | 'directory-loop'
  | 'invalid-path'
  | 'path-not-found'
  | 'wrong-entry-kind'
  | 'invalid-range'
  | 'limit-exceeded'
  | 'budget-exceeded'
  | 'read-failed'
  | 'cancelled';

/** P2-01 budget record codes, kept unchanged when open options carry a malformed limits record. */
export const BUDGET_SHAPE_CODES = Object.freeze(['invalid-record', 'missing-budget-dimension', 'unknown-budget-dimension', 'invalid-budget-value'] as const);
export type BudgetShapeCode = typeof BUDGET_SHAPE_CODES[number];

/** Names of the P2-02 limits a `limit-exceeded` or `budget-exceeded` diagnostic reports (spec, limits and budget). */
export type DiscLimitName =
  | 'descriptorBytes'
  | 'imageSectors'
  | 'volumeDescriptors'
  | 'directoryBytes'
  | 'directoryRecords'
  | 'rangeReadBytes'
  | 'portReadBytes'
  | 'sourceReadBytes';

export interface DiscLimit {
  readonly name: DiscLimitName;
  readonly limit: number;
  /** The rejected amount; null when it is beyond the safe integer range. */
  readonly observed: number | null;
}

/** Plain, structured-cloneable diagnostic shared by Node tools and later Workers. */
export interface DiscReadErrorData {
  readonly code: DiscReadErrorCode | BudgetShapeCode;
  /**
   * A safe structural position: input role, allow-listed descriptor section and key or a line number, LBA, resolved
   * disc path prefix, or record index. Never bytes, host file names, host paths or raw record names.
   */
  readonly location: string;
  /** Fixed safe text; host error text never enters it. */
  readonly reason: string;
  readonly limit: DiscLimit | null;
}

export class DiscReadError extends Error {
  readonly code: DiscReadErrorData['code'];
  readonly location: string;
  readonly reason: string;
  readonly limit: DiscLimit | null;

  constructor(code: DiscReadErrorData['code'], location: string, reason: string, limit: DiscLimit | null = null) {
    super(`${location}: ${reason}`);
    this.name = 'DiscReadError';
    this.code = code;
    this.location = location;
    this.reason = reason;
    this.limit = limit && Object.freeze({ name: limit.name, limit: limit.limit, observed: limit.observed });
  }

  toData(): DiscReadErrorData {
    return Object.freeze({ code: this.code, location: this.location, reason: this.reason, limit: this.limit });
  }
}
