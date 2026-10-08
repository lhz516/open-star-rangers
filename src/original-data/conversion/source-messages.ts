import {
  STATUS_MESSAGES_COUNTS, STATUS_MESSAGES_LIMITS, statusMessagesFrom, statusMessagesLengthOf, type StatusMessagesPayload,
} from '../../content/hud/status-messages-payload.ts';
import { SourceError } from '../source-error.ts';
import { fieldAt, type RelocatedBlock } from './source-graphics.ts';

// Source structure of a DIAG entry, the status display's message texts (docs/original/formats/hud.md, DIAG 10489), and
// of the NUL-terminated format the program applies to the lower line. The reader checks the whole structure, including
// that the entry's relocations are exactly its pointer fields, and measures every text before it allocates any; it
// throws a SourceError located at `messages` or `format` under the caller's `path`.

/** The fixed header: timings, then text pointers and rating maxima, then the startup message list and its count. */
const DIAG = Object.freeze({
  headerBytes: 0x98, statusFormats: 0x10, ratings: 0x20, ratingBytes: 8, subsystemNames: 0x48, stateWords: 0x84,
  startupList: 0x90, startupCount: 0x94,
});

function invalid(location: string, reason: string): never {
  throw new SourceError('invalid-payload', location, reason);
}

/** A text's byte span; a text longer than the payload can hold is `limit-exceeded`. */
function bounded(start: number, end: number, location: string): readonly [number, number] {
  const length = end - start;
  if (length > STATUS_MESSAGES_LIMITS.textBytes) {
    throw new SourceError('limit-exceeded', location, 'is outside the supported range', { name: 'diagTextBytes', limit: STATUS_MESSAGES_LIMITS.textBytes, observed: length });
  }
  return [start, end];
}

/**
 * Reads a DIAG entry and the lower line's format into a status messages payload. The entry starts with the 0x98-byte
 * header: four u32 timings; pointers to the 4 status formats; 5 {pointer, i32 maximum} ratings; pointers to the 15
 * subsystem names and the 3 state words; a pointer to the startup message list and its u32 count, 0–16, the pointer 0
 * exactly when the count is. The entry's relocations must be exactly those pointer fields and the list's entries, and
 * every pointer must address a NUL-terminated text inside the entry. `format` is the format's bytes with its only NUL
 * last. Once everything is checked, `reserve` receives the payload's encoded length, before any text is copied.
 */
export function readStatusMessages(
  { bytes, relocations }: RelocatedBlock, format: Uint8Array, path = '', reserve: (payloadBytes: number) => void = () => undefined,
): StatusMessagesPayload {
  const location = fieldAt(path, 'messages');
  if (bytes.length < DIAG.headerBytes) invalid(location, 'the DIAG header extends past the block');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset: number) => view.getUint32(offset, true);
  const count = u32(DIAG.startupCount);
  if (count > STATUS_MESSAGES_LIMITS.startupMessages) {
    throw new SourceError('limit-exceeded', location, 'is outside the supported range', { name: 'diagStartupMessages', limit: STATUS_MESSAGES_LIMITS.startupMessages, observed: count });
  }
  const list = u32(DIAG.startupList);
  if ((count === 0) !== (list === 0) || list > bytes.length || count * 4 > bytes.length - list) {
    invalid(location, 'the startup message list must lie inside the block, and only an empty one has no pointer');
  }
  const { statusFormats, ratings, subsystemNames, stateWords } = STATUS_MESSAGES_COUNTS;
  const words = (start: number, items: number, stride = 4) => Array.from({ length: items }, (_, index) => start + index * stride);
  const fields = [
    ...words(DIAG.statusFormats, statusFormats), ...words(DIAG.ratings, ratings, DIAG.ratingBytes), ...words(DIAG.subsystemNames, subsystemNames),
    ...words(DIAG.stateWords, stateWords), ...words(list, count),
  ];
  // The relocation count is checked before the list, which comes from the source, is copied and sorted.
  const expected = [...fields, ...(count === 0 ? [] : [DIAG.startupList])].sort((left, right) => left - right);
  if (relocations.length !== expected.length) invalid(location, 'the DIAG relocations must be exactly its text pointer fields');
  const stored = [...relocations].sort((left, right) => left - right);
  if (stored.some((offset, index) => offset !== expected[index])) invalid(location, 'the DIAG relocations must be exactly its text pointer fields');
  // Every text's span in payload order, the lower line's format before the startup messages.
  const spans = fields.map(field => {
    const pointer = u32(field);
    const end = pointer < bytes.length ? bytes.indexOf(0, pointer) : -1;
    if (end < 0) invalid(location, 'a text pointer addresses no NUL-terminated text inside the block');
    return bounded(pointer, end, location);
  });
  const formatAt = fieldAt(path, 'format');
  if (format.length === 0 || format.indexOf(0) !== format.length - 1) invalid(formatAt, 'the format must be a text ending in its only NUL');
  const formatSpan = bounded(0, format.length - 1, formatAt);
  // Payload order: the fixed texts, the format, then the startup messages.
  const startupAt = spans.length - count;
  const ordered = [...spans.slice(0, startupAt).map(span => [bytes, span] as const), [format, formatSpan] as const, ...spans.slice(startupAt).map(span => [bytes, span] as const)];
  reserve(statusMessagesLengthOf(ordered.map(([, [start, end]]) => end - start)));
  return statusMessagesFrom(
    words(0, 4).map(u32), words(DIAG.ratings + 4, ratings, DIAG.ratingBytes).map(offset => view.getInt32(offset, true)),
    ordered.map(([source, [start, end]]) => String.fromCharCode(...source.subarray(start, end))),
  );
}
