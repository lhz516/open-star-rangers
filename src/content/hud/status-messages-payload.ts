import type { AssetDescriptor } from '../asset-contract.ts';
import { ContentContractError, fail, readArray, readRecord, requireFields } from '../contract-validation.ts';
import { isDetached } from '../ownership.ts';

// The status display messages payload (docs/plan/p2/07/spec.md, status display messages), schema 1, little-endian:
//   0   u32       upper line: ticks per typed character
//   4   u32       upper line: ticks the finished message stays
//   8   u32       lower line: ticks per typed character
//   12  u32       lower line: ticks the finished message stays
//   16  5 × i32   rating maxima, in stored order
//   36  u8        startup message count S, 0–16
//   37  texts, each a u8 length L (0–255) then L nonzero bytes, in this order: 4 status formats, 5 rating texts,
//       15 subsystem names, 3 state words, the subsystem format, S startup messages
// A text keeps its source bytes exactly, without the terminating NUL: line breaks and printf-style conversions stay as
// stored. Consumers format and draw them; this module does not interpret them.

/** Schema version of the status display messages payload; a byte layout or meaning change needs a new version. */
export const STATUS_MESSAGES_SCHEMA_VERSION = 1;

/** The role of the status display messages `data` Asset; consumers choose this payload's reader by it. */
export const STATUS_MESSAGES_ROLE = 'status-messages';

/** List lengths fixed by the program that reads the messages (docs/original/formats/hud.md, DIAG 10489). */
export const STATUS_MESSAGES_COUNTS = Object.freeze({ statusFormats: 4, ratings: 5, subsystemNames: 15, stateWords: 3 });

/** Approved bounds: a text's stored bytes and the startup message count (P2-07 spec, limits and budgets). */
export const STATUS_MESSAGES_LIMITS = Object.freeze({ textBytes: 255, startupMessages: 16 });

/** How one display line types a message out: ticks per character, then ticks the finished message stays. */
export interface MessageTiming {
  readonly characterTicks: number;
  readonly holdTicks: number;
}

/** A systems rating: its text, shown while the summed subsystem states do not exceed `maximum`. */
export interface StatusRating {
  readonly text: string;
  readonly maximum: number;
}

/** The status display's message texts; each text is a byte string whose every character code is one stored byte, 1–255. */
export interface StatusMessagesPayload {
  readonly upper: MessageTiming;
  readonly lower: MessageTiming;
  /** The upper line's formats, in the order the display cycles them. */
  readonly statusFormats: readonly string[];
  /** In stored order. */
  readonly ratings: readonly StatusRating[];
  /** The lower line's subsystem names, in the order the display cycles them. */
  readonly subsystemNames: readonly string[];
  /** One word per subsystem state, by state. */
  readonly stateWords: readonly string[];
  /** The lower line's format, applied to a subsystem name and its state word. */
  readonly subsystemFormat: string;
  /** May be empty. */
  readonly startupMessages: readonly string[];
}

const HEADER_BYTES = 37;
/** Texts before the startup messages. */
const FIXED_TEXTS = STATUS_MESSAGES_COUNTS.statusFormats + STATUS_MESSAGES_COUNTS.ratings + STATUS_MESSAGES_COUNTS.subsystemNames
  + STATUS_MESSAGES_COUNTS.stateWords + 1;

function invalid(path: string, reason: string): never {
  fail('invalid-status-messages-payload', path, reason);
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > STATUS_MESSAGES_LIMITS.textBytes) invalid(path, 'must be a string of at most 255 bytes');
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 1 || code > 255) invalid(path, 'must hold only byte values 1 to 255');
  }
  return value;
}

function requireInteger(value: unknown, minimum: number, maximum: number, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(path, `must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

/** A plain data record with exactly `fields`, by the shared contract rules, reported under this payload's code. */
function readFields(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  try {
    const record = readRecord(value, path);
    requireFields(record, path, fields);
    return record;
  } catch (error) {
    if (error instanceof ContentContractError) invalid(error.path, error.reason);
    throw error;
  }
}

/** A dense plain array of `minimum` to `maximum` items. */
function readList<T>(value: unknown, minimum: number, maximum: number, path: string, read: (item: unknown, at: string) => T): readonly T[] {
  const items = readArray(value, path, 'invalid-status-messages-payload', read);
  if (items.length < minimum || items.length > maximum) invalid(path, minimum === maximum ? `must list ${minimum} items` : `must list ${minimum} to ${maximum} items`);
  return items;
}

function readTiming(value: unknown, path: string): MessageTiming {
  const record = readFields(value, path, ['characterTicks', 'holdTicks']);
  return Object.freeze({
    characterTicks: requireInteger(record.characterTicks, 0, 0xffff_ffff, `${path}.characterTicks`),
    holdTicks: requireInteger(record.holdTicks, 0, 0xffff_ffff, `${path}.holdTicks`),
  });
}

const FIELDS = ['upper', 'lower', 'statusFormats', 'ratings', 'subsystemNames', 'stateWords', 'subsystemFormat', 'startupMessages'];

/** Checks a payload against the schema and returns a frozen copy. */
function checkPayload(payload: unknown, path: string): StatusMessagesPayload {
  const { statusFormats, ratings, subsystemNames, stateWords } = STATUS_MESSAGES_COUNTS;
  const record = readFields(payload, path, FIELDS);
  const texts = (name: string, minimum: number, maximum = minimum) => readList(record[name], minimum, maximum, `${path}.${name}`, requireText);
  return Object.freeze({
    upper: readTiming(record.upper, `${path}.upper`),
    lower: readTiming(record.lower, `${path}.lower`),
    statusFormats: texts('statusFormats', statusFormats),
    ratings: readList(record.ratings, ratings, ratings, `${path}.ratings`, (item, at) => {
      const rating = readFields(item, at, ['text', 'maximum']);
      return Object.freeze({ text: requireText(rating.text, `${at}.text`), maximum: requireInteger(rating.maximum, -0x8000_0000, 0x7fff_ffff, `${at}.maximum`) });
    }),
    subsystemNames: texts('subsystemNames', subsystemNames),
    stateWords: texts('stateWords', stateWords),
    subsystemFormat: requireText(record.subsystemFormat, `${path}.subsystemFormat`),
    startupMessages: texts('startupMessages', 0, STATUS_MESSAGES_LIMITS.startupMessages),
  });
}

/**
 * A payload from its four timing words (upper character, upper hold, lower character, lower hold), its five rating
 * maxima and its texts in payload order, the startup messages last. The values are not checked; a reader of stored
 * bytes checks them before calling this.
 */
export function statusMessagesFrom(timings: readonly number[], maxima: readonly number[], texts: readonly string[]): StatusMessagesPayload {
  const { statusFormats, ratings, subsystemNames, stateWords } = STATUS_MESSAGES_COUNTS;
  let next = 0;
  const take = (count: number) => Object.freeze(texts.slice(next, next += count));
  return Object.freeze({
    upper: Object.freeze({ characterTicks: timings[0], holdTicks: timings[1] }),
    lower: Object.freeze({ characterTicks: timings[2], holdTicks: timings[3] }),
    statusFormats: take(statusFormats),
    ratings: Object.freeze(take(ratings).map((text, index) => Object.freeze({ text, maximum: maxima[index] }))),
    subsystemNames: take(subsystemNames),
    stateWords: take(stateWords),
    subsystemFormat: take(1)[0],
    startupMessages: take(texts.length - next),
  });
}

/** Every text in payload order. */
const textsOf = (payload: StatusMessagesPayload): readonly string[] => [
  ...payload.statusFormats, ...payload.ratings.map(({ text }) => text), ...payload.subsystemNames, ...payload.stateWords,
  payload.subsystemFormat, ...payload.startupMessages,
];

/** Encoded length of a payload whose texts, in payload order, have these byte lengths; the lengths are not checked. */
export const statusMessagesLengthOf = (textLengths: readonly number[]): number =>
  textLengths.reduce((total, length) => total + 1 + length, HEADER_BYTES);

/** Encoded length of a payload with these texts; the texts are not checked. */
export const statusMessagesPayloadLength = (payload: StatusMessagesPayload): number =>
  statusMessagesLengthOf(textsOf(payload).map(text => text.length));

/** Encodes a checked payload into a new buffer that the result owns entirely. */
export function encodeStatusMessagesPayload(payload: StatusMessagesPayload, path = 'messages'): Uint8Array<ArrayBuffer> {
  const checked = checkPayload(payload, path);
  const bytes = new Uint8Array(statusMessagesPayloadLength(checked));
  const view = new DataView(bytes.buffer);
  [checked.upper, checked.lower].forEach(({ characterTicks, holdTicks }, line) => {
    view.setUint32(line * 8, characterTicks, true);
    view.setUint32(line * 8 + 4, holdTicks, true);
  });
  checked.ratings.forEach(({ maximum }, index) => view.setInt32(16 + index * 4, maximum, true));
  view.setUint8(36, checked.startupMessages.length);
  let at = HEADER_BYTES;
  for (const text of textsOf(checked)) {
    bytes[at++] = text.length;
    for (let index = 0; index < text.length; index++) bytes[at++] = text.charCodeAt(index);
  }
  return bytes;
}

/** Strictly reads a status display messages payload into frozen data. */
export function readStatusMessagesPayload(bytes: unknown, schemaVersion: unknown, path = 'payload'): StatusMessagesPayload {
  if (schemaVersion !== STATUS_MESSAGES_SCHEMA_VERSION) {
    fail('unsupported-payload-schema', `${path}.schemaVersion`, 'must be status messages payload schema 1');
  }
  if (!(bytes instanceof Uint8Array)) invalid(path, 'must be a Uint8Array');
  if (isDetached(bytes.buffer)) fail('payload-detached', path, 'was transferred away and can no longer be used');
  if (bytes.length < HEADER_BYTES) invalid(path, 'is truncated');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const startup = view.getUint8(36);
  if (startup > STATUS_MESSAGES_LIMITS.startupMessages) invalid(`${path}.startupMessages`, 'must list 0 to 16 items');
  let at = HEADER_BYTES;
  const texts = Array.from({ length: FIXED_TEXTS + startup }, (_, index) => {
    if (at >= bytes.length) invalid(path, 'is truncated');
    const start = at + 1;
    at = start + bytes[start - 1];
    if (at > bytes.length) invalid(path, 'is truncated');
    const text = bytes.subarray(start, at);
    if (text.includes(0)) invalid(`${path}.texts[${index}]`, 'must hold only byte values 1 to 255');
    return String.fromCharCode(...text);
  });
  if (at !== bytes.length) invalid(path, 'has trailing bytes');
  const words = (count: number, read: (offset: number) => number, start: number) => Array.from({ length: count }, (_, index) => read(start + index * 4));
  return statusMessagesFrom(
    words(4, offset => view.getUint32(offset, true), 0), words(STATUS_MESSAGES_COUNTS.ratings, offset => view.getInt32(offset, true), 16), texts,
  );
}

/** Checks that the descriptor is a `data` Asset of the status messages role without dependencies. */
export function checkStatusMessagesBinding(descriptor: AssetDescriptor, path = 'asset'): void {
  if (descriptor.kind !== 'data') fail('binding-mismatch', `${path}.kind`, 'must be data');
  if (descriptor.role !== STATUS_MESSAGES_ROLE) fail('binding-mismatch', `${path}.role`, 'must be the status messages role');
  if (descriptor.dependencies.length !== 0) fail('binding-mismatch', `${path}.dependencies`, 'must be empty');
}
