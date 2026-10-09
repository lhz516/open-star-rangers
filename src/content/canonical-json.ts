import { fail, type ContentContractErrorCode } from './contract-validation.ts';
import { isDetached } from './ownership.ts';

// Canonical byte form of structured data payloads (P2-09 logic payloads; P3-03 spec, canonical payloads): printable
// ASCII JSON without whitespace, objects in the field order their strict reader builds, numbers in ECMAScript's
// shortest round-trip form and -0 as 0. Strings are escaped as JSON.stringify does, and every other code unit outside
// printable ASCII is written as a lower-case \u escape, so a byte string of code points 1-255 stays ASCII. Pure modules
// have no TextEncoder or TextDecoder, so bytes map to characters one to one, which printable ASCII makes exact. A finite
// f32 value converts to a double exactly, so the shortest form also round-trips it bit for bit, denormals included.

/** A payload family that uses canonical JSON: its byte limit and the wording and code of its diagnostics. */
export interface CanonicalJsonFormat {
  /** Fixed name of the family in diagnostics, such as `logic payload`. */
  readonly name: string;
  /** Largest encoding, in bytes. */
  readonly byteLimit: number;
  /** The family's code for bytes that are no Uint8Array, exceed the byte limit or are not printable ASCII JSON text. */
  readonly invalid: ContentContractErrorCode;
}

const PATH = 'payload';
const OUTSIDE_PRINTABLE_ASCII = /[^\x20-\x7e]/g;

const escapeUnit = (unit: string): string => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`;

const exceedsLimit = (format: CanonicalJsonFormat): never =>
  fail(format.invalid, PATH, `must not exceed the ${format.name} byte limit`);

/**
 * The canonical text of a strict read result: plain data records built in contract field order, finite numbers and
 * strings. Only the reader guarantees these; the text of anything else is not canonical.
 */
function canonicalJsonText(value: unknown): string {
  // JSON.stringify already escapes control characters and lone surrogates, so only code units of 0x7F and above remain.
  return JSON.stringify(value).replace(OUTSIDE_PRINTABLE_ASCII, escapeUnit);
}

/**
 * Returns the canonical bytes of the strict read result `value` in a new buffer of their exact length. `reserve`
 * receives the byte length before the limit is checked and the bytes are allocated, so a converter can charge it to its
 * budget first.
 */
export function encodeCanonicalJson(value: unknown, format: CanonicalJsonFormat, reserve?: (byteLength: number) => void): Uint8Array {
  const text = canonicalJsonText(value);
  reserve?.(text.length);
  if (text.length > format.byteLimit) exceedsLimit(format);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return bytes;
}

/**
 * Checks payload bytes before anything reads them: a Uint8Array that was not transferred away and is within the byte
 * limit. A decoder that checks its descriptor first calls this before the descriptor, so the limit comes first.
 */
export function requireCanonicalJsonBytes(bytes: unknown, format: CanonicalJsonFormat): asserts bytes is Uint8Array {
  if (!(bytes instanceof Uint8Array)) fail(format.invalid, PATH, 'must be a Uint8Array');
  if (isDetached(bytes.buffer)) fail('payload-detached', PATH, 'was transferred away and can no longer be used');
  if (bytes.length > format.byteLimit) exceedsLimit(format);
}

function asciiText(bytes: Uint8Array, format: CanonicalJsonFormat): string {
  const chunk = 4096;
  let text = '';
  for (let start = 0; start < bytes.length; start += chunk) {
    const part = bytes.subarray(start, start + chunk);
    if (part.some(byte => byte < 0x20 || byte > 0x7e)) fail(format.invalid, PATH, 'must be printable ASCII');
    text += String.fromCharCode(...part);
  }
  return text;
}

/**
 * Decodes canonical JSON bytes: the checks of `requireCanonicalJsonBytes` come first, then the bytes must be printable
 * ASCII JSON text, `read` must accept the parsed value, and the canonical text of `encoded(result)` must equal the input
 * byte for byte. Returns the read result; diagnostics carry the path `payload` and never echo the bytes.
 */
export function decodeCanonicalJson<T>(
  bytes: Uint8Array,
  format: CanonicalJsonFormat,
  read: (value: unknown) => T,
  encoded: (result: T) => unknown = result => result,
): T {
  requireCanonicalJsonBytes(bytes, format);
  const text = asciiText(bytes, format);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) fail(format.invalid, PATH, 'must be JSON text');
    throw error;
  }
  const result = read(parsed);
  // Bytes and characters correspond one to one, so comparing the texts compares the bytes.
  if (canonicalJsonText(encoded(result)) !== text) fail('non-canonical-payload', PATH, 'must be the canonical encoding of its content');
  return result;
}
