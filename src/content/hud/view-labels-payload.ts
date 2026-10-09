import { readAssetDescriptor, type AssetDescriptor } from '../asset-contract.ts';
import {
  decodeCanonicalJson, encodeCanonicalJson, requireCanonicalJsonBytes, type CanonicalJsonFormat,
} from '../canonical-json.ts';
import { ContentContractError, fail, readArray, readRecord, requireFields } from '../contract-validation.ts';

// The view labels payload of the `cockpit-hud-map` group (P3-03 spec, S-08 and 规范 payload): canonical JSON
// (canonical-json.ts) of `{ labels: [{ subMode: 8, text }] }`. The label is TABL 10399 item 8, drawn while the player's
// sub-mode is 8, the destruction view (docs/original/formats/hud.md, TABL 10399). Items 0–7 belong to G-08 and items
// 9–12 have no confirmed use, so neither is imported. The text is a byte string: every character code is one stored
// byte, 1–255, without the terminating NUL; the game draws each byte as its glyph and nothing here interprets it.

/** The role of the view labels `data` Asset; consumers choose this payload's reader by it. */
export const VIEW_LABELS_ROLE = 'view-labels';

/** Payload schema version of the view labels role; a shape or meaning change increments it. */
export const VIEW_LABELS_SCHEMA_VERSION = 1;

/**
 * Structural limits, shared by the reader and the source parser. `textBytes`: twice the slice's observed label of 16
 * bytes, a power of two (P3-03 spec, 限值与预算). `payloadBytes` bounds the bytes read before parsing; every payload
 * within `textBytes` encodes within it.
 */
export const VIEW_LABELS_LIMITS = Object.freeze({ payloadBytes: 256, textBytes: 32 });

/** Format rules: the payload holds exactly one label, that of sub-mode 8. */
export const VIEW_LABELS_FORMAT = Object.freeze({ labels: 1, subMode: 8 } as const);

export interface ViewLabel {
  /** The player-state sub-mode (+0x2A) that indexes the label table. */
  readonly subMode: typeof VIEW_LABELS_FORMAT.subMode;
  /** Byte string of 0 to `VIEW_LABELS_LIMITS.textBytes` bytes. */
  readonly text: string;
}

export interface ViewLabels {
  readonly labels: readonly [ViewLabel];
}

const FORMAT: CanonicalJsonFormat = Object.freeze({
  name: 'view labels payload', byteLimit: VIEW_LABELS_LIMITS.payloadBytes, invalid: 'invalid-flight-data-payload',
});

function invalid(path: string, reason: string): never {
  return fail('invalid-flight-data-payload', path, reason);
}

function readFields(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  const record = readRecord(value, path);
  requireFields(record, path, fields);
  return record;
}

function readText(value: unknown, path: string): string {
  const { textBytes } = VIEW_LABELS_LIMITS;
  if (typeof value !== 'string' || value.length > textBytes) invalid(path, `must be a string of at most ${textBytes} bytes`);
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 1 || code > 255) invalid(path, 'must hold only byte values 1 to 255');
  }
  return value;
}

function readLabel(value: unknown, path: string): ViewLabel {
  const record = readFields(value, path, ['subMode', 'text']);
  if (record.subMode !== VIEW_LABELS_FORMAT.subMode) invalid(`${path}.subMode`, `must be ${VIEW_LABELS_FORMAT.subMode}`);
  return Object.freeze({ subMode: VIEW_LABELS_FORMAT.subMode, text: readText(record.text, `${path}.text`) });
}

/** Strictly reads already decoded view labels content into a frozen copy isolated from its input. */
export function readViewLabels(value: unknown, path = 'viewLabels'): ViewLabels {
  try {
    const record = readFields(value, path, ['labels']);
    const at = `${path}.labels`;
    const { labels } = VIEW_LABELS_FORMAT;
    if (Array.isArray(record.labels) && record.labels.length > labels) invalid(at, `must contain exactly ${labels} item`);
    const items = readArray(record.labels, at, 'invalid-flight-data-payload', readLabel);
    if (items.length !== labels) invalid(at, `must contain exactly ${labels} item`);
    return Object.freeze({ labels: items as ViewLabels['labels'] });
  } catch (error) {
    if (error instanceof ContentContractError && error.code !== 'invalid-flight-data-payload') {
      throw new ContentContractError('invalid-flight-data-payload', error.path, error.reason);
    }
    throw error;
  }
}

/**
 * Reads `content` strictly and returns its canonical bytes, within the byte limit, in a new buffer of their exact length.
 * `reserve` receives the byte length before the limit is checked and the bytes are allocated.
 */
export function encodeViewLabelsPayload(content: ViewLabels, reserve?: (byteLength: number) => void): Uint8Array {
  return encodeCanonicalJson(readViewLabels(content), FORMAT, reserve);
}

/**
 * Decodes the payload bytes of the view labels Asset `descriptor` describes: the byte length limit first, then a `data`
 * descriptor of the view labels role and schema without dependencies, then canonical JSON that the strict reader accepts.
 */
export function decodeViewLabelsPayload(bytes: Uint8Array, descriptor: AssetDescriptor): ViewLabels {
  requireCanonicalJsonBytes(bytes, FORMAT);
  const asset = readAssetDescriptor(descriptor, 'descriptor');
  if (asset.role !== VIEW_LABELS_ROLE) invalid('descriptor.role', 'must be the view labels role');
  if (asset.kind !== 'data') invalid('descriptor.kind', 'must be data');
  if (asset.payloadIdentity.schemaVersion !== VIEW_LABELS_SCHEMA_VERSION) {
    fail('unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion', 'must be view labels payload schema 1');
  }
  const content = decodeCanonicalJson(bytes, FORMAT, value => readViewLabels(value));
  if (asset.dependencies.length !== 0) {
    fail('flight-data-reference-mismatch', 'descriptor.dependencies', 'must be exactly the Asset references of the payload');
  }
  return content;
}
