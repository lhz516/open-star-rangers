import type { SessionFailure } from '../../app/session/session-errors.ts';

/** Readable error text for developers, including session failure phases and aggregated causes. */
export function describeError(cause: unknown, indent = ''): string {
  if (!(cause instanceof Error)) return `${indent}${String(cause)}`;
  const lines = [`${indent}${cause.name}: ${cause.message}`];
  const { failures } = cause as { readonly failures?: readonly SessionFailure[] };
  for (const failure of failures ?? []) lines.push(`${indent}  ${failure.phase}:`, describeError(failure.cause, `${indent}    `));
  if (cause instanceof AggregateError) for (const error of cause.errors) lines.push(describeError(error, `${indent}  `));
  return lines.join('\n');
}
