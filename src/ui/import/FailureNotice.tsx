import type { FailureCopy } from './failure-copy.ts';
import { formatDuration } from './resource-copy.ts';

export interface FailureNoticeProps {
  readonly copy: FailureCopy;
  readonly testId?: string;
  /** Page-clock time the failed operation took, when it was timed. */
  readonly durationMs?: number | null;
}

/** A failure's fixed sentence with its technical details: layer, code, location, fixed reason and limit. */
export function FailureNotice({ copy: { category, message, details }, testId, durationMs = null }: FailureNoticeProps) {
  const { layer, code, location, reason, limit } = details;
  return (
    <div role="alert" className="failure-notice" data-testid={testId} data-category={category}>
      <p>{message}</p>
      <details>
        <summary>Technical details</summary>
        <dl>
          <dt>Layer</dt>
          <dd>{layer}</dd>
          <dt>Code</dt>
          <dd>{code}</dd>
          {location !== null && <><dt>Location</dt><dd>{location}</dd></>}
          {reason !== null && <><dt>Reason</dt><dd>{reason}</dd></>}
          {limit !== null && (
            <><dt>Limit</dt><dd>{`${limit.name}: ${limit.observed ?? 'beyond the safe integer range'} of at most ${limit.limit}`}</dd></>
          )}
          {durationMs !== null && <><dt>Time</dt><dd>{formatDuration(durationMs)}</dd></>}
        </dl>
      </details>
    </div>
  );
}
