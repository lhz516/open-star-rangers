import { readAssetDescriptor, type AssetDescriptor } from '../asset-contract.ts';
import {
  decodeCanonicalJson, encodeCanonicalJson, requireCanonicalJsonBytes, type CanonicalJsonFormat,
} from '../canonical-json.ts';
import { ContentContractError, fail, readRecord, requireFields } from '../contract-validation.ts';

// The map geometry payload of the `cockpit-hud-map` group (P3-03 spec, P3-09 的修订：地图几何（修订 2）): canonical JSON
// (canonical-json.ts) of the strategic map instrument's inclusive screen rectangle and redraw interval (CCKD 10103, the
// type-10 record of the layout-6 slot, +0x04–+0x10 and +0x18) and the glyph height of HUD font 1 (header +3), the line
// height of the map's information window (docs/original/formats/cockpit.md, instrument types per slot; hud.md §1). Core
// derives the main map, information and zoom rectangles, the scales, the cursor start and the information capacity from
// these three fields (P3-02 MW-01); the checks across inputs belong there.

/** The role of the map geometry `data` Asset; consumers choose this payload's reader by it. */
export const MAP_GEOMETRY_ROLE = 'map-geometry';

/** Payload schema version of the map geometry role; a shape or meaning change increments it. */
export const MAP_GEOMETRY_SCHEMA_VERSION = 1;

/** `payloadBytes` bounds the bytes read before parsing; the canonical encoding of any valid content is far below it. */
export const MAP_GEOMETRY_LIMITS = Object.freeze({ payloadBytes: 256 });

/**
 * Format rules of schema 1: the screen the rectangle lies in, in pixels (640×480), and the largest line height, that of
 * the tallest font the font reader accepts (8). Changing either is a schema change.
 */
export const MAP_GEOMETRY_FORMAT = Object.freeze({ width: 640, height: 480, lineHeight: 8 });

/** Inclusive screen rectangle in pixels: x0 ≤ x ≤ x1 and y0 ≤ y ≤ y1. */
export interface MapRectangle {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface MapGeometry {
  /** The instrument record's rectangle (+0x04–+0x10, i32). */
  readonly rectangle: MapRectangle;
  /** The record's redraw interval in clock units (+0x18, u32). */
  readonly redrawInterval: number;
  /** Glyph height of HUD font 1 in pixels (font table header +3). */
  readonly informationLineHeight: number;
}

const FORMAT: CanonicalJsonFormat = Object.freeze({
  name: 'map geometry payload', byteLimit: MAP_GEOMETRY_LIMITS.payloadBytes, invalid: 'invalid-flight-data-payload',
});

const U32_MAX = 0xffff_ffff;

function invalid(path: string, reason: string): never {
  return fail('invalid-flight-data-payload', path, reason);
}

/** A record of exactly `fields`; its problems are payload errors like every other problem of this payload. */
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

function integer(value: unknown, minimum: number, maximum: number, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(path, `must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

/**
 * The rectangle inside the screen with a main map side s = y1 − y0 + 1 of at least 2, so that the information and zoom
 * windows are each at least 1 pixel tall, and a strip right of the main map at least 1 pixel wide: x0 + s < x1.
 */
function readRectangle(value: unknown, path: string): MapRectangle {
  const record = readFields(value, path, ['x0', 'y0', 'x1', 'y1']);
  const { width, height } = MAP_GEOMETRY_FORMAT;
  const x0 = integer(record.x0, 0, width - 1, `${path}.x0`);
  const y0 = integer(record.y0, 0, height - 1, `${path}.y0`);
  const x1 = integer(record.x1, 0, width - 1, `${path}.x1`);
  const y1 = integer(record.y1, 0, height - 1, `${path}.y1`);
  // The bounds that depend on other fields have fixed reasons: a converter reports them for source values, which
  // diagnostics never echo. They also reject y1 < y0 and x1 < x0.
  const side = y1 - y0 + 1;
  if (side < 2) invalid(`${path}.y1`, 'must give a main map side of at least 2 pixels');
  if (x0 + side >= x1) invalid(`${path}.x1`, 'must leave a strip at least 1 pixel wide right of the main map');
  return Object.freeze({ x0, y0, x1, y1 });
}

/** Strictly reads already decoded map geometry content into a frozen copy isolated from its input. */
export function readMapGeometry(value: unknown, path = 'mapGeometry'): MapGeometry {
  const record = readFields(value, path, ['rectangle', 'redrawInterval', 'informationLineHeight']);
  return Object.freeze({
    rectangle: readRectangle(record.rectangle, `${path}.rectangle`),
    redrawInterval: integer(record.redrawInterval, 0, U32_MAX, `${path}.redrawInterval`),
    informationLineHeight: integer(record.informationLineHeight, 1, MAP_GEOMETRY_FORMAT.lineHeight, `${path}.informationLineHeight`),
  });
}

/**
 * Reads `content` strictly and returns its canonical bytes, within the byte limit, in a new buffer of their exact length.
 * `reserve` receives the byte length before the limit is checked and the bytes are allocated.
 */
export function encodeMapGeometryPayload(content: MapGeometry, reserve?: (byteLength: number) => void): Uint8Array {
  return encodeCanonicalJson(readMapGeometry(content), FORMAT, reserve);
}

/**
 * Decodes the payload bytes of the map geometry Asset `descriptor` describes: the byte length limit first, then a `data`
 * descriptor of the map geometry role and schema without dependencies, then canonical JSON that the strict reader accepts.
 */
export function decodeMapGeometryPayload(bytes: Uint8Array, descriptor: AssetDescriptor): MapGeometry {
  requireCanonicalJsonBytes(bytes, FORMAT);
  const asset = readAssetDescriptor(descriptor, 'descriptor');
  if (asset.role !== MAP_GEOMETRY_ROLE) invalid('descriptor.role', 'must be the map geometry role');
  if (asset.kind !== 'data') invalid('descriptor.kind', 'must be data');
  if (asset.payloadIdentity.schemaVersion !== MAP_GEOMETRY_SCHEMA_VERSION) {
    fail('unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion', 'must be map geometry payload schema 1');
  }
  const content = decodeCanonicalJson(bytes, FORMAT, value => readMapGeometry(value));
  if (asset.dependencies.length !== 0) {
    fail('flight-data-reference-mismatch', 'descriptor.dependencies', 'must be exactly the Asset references of the payload');
  }
  return content;
}
