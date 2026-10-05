import type { BudgetDimension } from '../../content/budget.ts';

/**
 * Stable failure codes of converting verified original entries into canonical content (P2-08 `conversion` layer).
 * Later converters may add codes; the layer and data shape stay the same.
 */
export type ConversionErrorCode = 'invalid-sound' | 'unsupported-sound-format' | 'limit-exceeded';

/** A conversion budget a `limit-exceeded` diagnostic reports, by its P2-01 budget dimension. */
export interface ConversionLimit {
  readonly name: BudgetDimension;
  readonly limit: number;
  /** The total the rejected increment would reach; null when that total is beyond the safe integer range. */
  readonly observed: number | null;
}

/** Plain, structured-cloneable diagnostic with the same shape as P2-03 `SourceErrorData`. */
export interface ConversionErrorData {
  readonly code: ConversionErrorCode;
  /**
   * A safe structural position: a source mapping path or a P2-03 archive position, plus a field name. Never bytes,
   * host paths or host error text.
   */
  readonly location: string;
  /** Fixed safe text. */
  readonly reason: string;
  readonly limit: ConversionLimit | null;
}

export class ConversionError extends Error {
  readonly code: ConversionErrorCode;
  readonly location: string;
  readonly reason: string;
  readonly limit: ConversionLimit | null;

  constructor(code: ConversionErrorCode, location: string, reason: string, limit: ConversionLimit | null = null) {
    super(`${location}: ${reason}`);
    this.name = 'ConversionError';
    this.code = code;
    this.location = location;
    this.reason = reason;
    this.limit = limit && Object.freeze({ name: limit.name, limit: limit.limit, observed: limit.observed });
  }

  toData(): ConversionErrorData {
    return Object.freeze({ code: this.code, location: this.location, reason: this.reason, limit: this.limit });
  }
}
