/**
 * Stable failure codes of P2-03 archive reading, version identification and source mapping verification
 * (docs/plan/p2/03/spec.md, error codes). Consumers classify failures by code only; P2-02 `DiscReadError` and P2-01
 * `ContentContractError` pass through with their own codes.
 */
export type SourceErrorCode =
  | 'invalid-archive'
  | 'invalid-entry'
  | 'limit-exceeded'
  | 'entry-not-found'
  | 'entry-type-mismatch'
  | 'invalid-request'
  | 'invalid-catalog'
  | 'unsupported-version'
  | 'path-not-covered'
  | 'alternatives-differ'
  | 'fingerprint-mismatch';

/** Names of the P2-03 structural limits a `limit-exceeded` diagnostic reports. */
export type SourceLimitName = 'archiveEntries' | 'entryBytes';

export interface SourceLimit {
  readonly name: SourceLimitName;
  readonly limit: number;
  readonly observed: number;
}

/** Plain, structured-cloneable diagnostic with the same shape as P2-02 `DiscReadErrorData`. */
export interface SourceErrorData {
  readonly code: SourceErrorCode;
  /**
   * A safe structural position: `archive[:/PATH]` with a directory index, entry ID or relocation index, `file:/PATH`,
   * `catalog…`, `request…` or a source mapping path. Never bytes, raw type tags, host names or host paths.
   */
  readonly location: string;
  /** Fixed safe text. */
  readonly reason: string;
  readonly limit: SourceLimit | null;
}

export class SourceError extends Error {
  readonly code: SourceErrorCode;
  readonly location: string;
  readonly reason: string;
  readonly limit: SourceLimit | null;

  constructor(code: SourceErrorCode, location: string, reason: string, limit: SourceLimit | null = null) {
    super(`${location}: ${reason}`);
    this.name = 'SourceError';
    this.code = code;
    this.location = location;
    this.reason = reason;
    this.limit = limit && Object.freeze({ name: limit.name, limit: limit.limit, observed: limit.observed });
  }

  toData(): SourceErrorData {
    return Object.freeze({ code: this.code, location: this.location, reason: this.reason, limit: this.limit });
  }
}
