import { readAssetDescriptor, type AssetDescriptor } from '../asset-contract.ts';
import { readAssetId, type AssetId } from '../asset-id.ts';
import {
  decodeCanonicalJson, encodeCanonicalJson, requireCanonicalJsonBytes, type CanonicalJsonFormat,
} from '../canonical-json.ts';
import { ContentContractError, fail, readArray, readRecord, requireFields } from '../contract-validation.ts';
import { GRAPHICS_LIMITS } from '../graphics/graphics-format.ts';
import type { LayoutPayload } from '../graphics/layout-payload.ts';
import type { MapGeometry } from './map-geometry-payload.ts';

// The cockpit instruments payload of the `cockpit-hud-map` group (P3-13 spec, DC-02; P3-03 spec, 修订 4): canonical JSON
// (canonical-json.ts) of the three CCKD 10103 directory slots the slice draws (layouts 0, 6 and 8) and the right
// display's target view distance table (EXE data 0x175424). Per slot it keeps the always-redraw flag (directory +0x0C),
// the elements' draw pass and every-frame flag (+44/+48, linked to the slot's layout by element index) and the
// instrument records in source order: type, inclusive rectangle, redraw interval, +0x14 and the +0x24 parameter table
// (docs/original/formats/cockpit.md, instrument records). Pointers, the last draw time (+0x1C) and +0x20/+0x2C are never
// part of it: the presentation model owns every run-time timer.

/** The role of the cockpit instruments `data` Asset; consumers choose this payload's reader by it. */
export const COCKPIT_INSTRUMENTS_ROLE = 'cockpit-instruments';

/** Payload schema version of the cockpit instruments role; a shape or meaning change increments it. */
export const COCKPIT_INSTRUMENTS_SCHEMA_VERSION = 1;

/**
 * Structural limits (P3-13 spec, DC-02). `payloadBytes` bounds the bytes read before parsing; `recordsPerSlot` is the
 * per-slot record limit of P3-03 修订 2 and `params` the longest parameter table, checked before items are read.
 */
export const COCKPIT_INSTRUMENTS_LIMITS = Object.freeze({ payloadBytes: 8_192, recordsPerSlot: 32, params: 4 });

export type InstrumentType = 0 | 1 | 2 | 3 | 5 | 6 | 7 | 8 | 9 | 10 | 12;

/**
 * Format rules of schema 1: the screen the rectangles lie in (640×480), the length of the target view distance table,
 * and the slots in payload order with their identity and the instrument types each holds exactly once
 * (docs/original/formats/cockpit.md, instrument types per slot). The types are listed in ascending order; the payload
 * keeps the source order.
 */
export const COCKPIT_INSTRUMENTS_FORMAT = Object.freeze({
  width: 640,
  height: 480,
  targetViewDistances: 20,
  slots: Object.freeze([
    Object.freeze({ slot: 0, layoutNumber: 0, alwaysRedraw: false, layout: 'layout/cockpit/front', types: Object.freeze([0, 1, 2, 3, 5, 6, 7, 8, 9, 12]) }),
    Object.freeze({ slot: 2, layoutNumber: 6, alwaysRedraw: false, layout: 'layout/map/frame', types: Object.freeze([8, 10]) }),
    Object.freeze({ slot: 7, layoutNumber: 8, alwaysRedraw: true, layout: null, types: Object.freeze([8]) }),
  ] as const),
} as const);

/** Inclusive screen rectangle in pixels: x0 ≤ x ≤ x1 and y0 ≤ y ≤ y1. */
export interface InclusiveRectangle {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface InstrumentRecord {
  /** Record +0x00. */
  readonly type: InstrumentType;
  /** Record +0x04–+0x10, logical pixels. */
  readonly rectangle: InclusiveRectangle;
  /** Record +0x18, u32 clock units; 0 draws on every scheduler call. */
  readonly redrawInterval: number;
  /** Record +0x14 as stored: the bar colour index (0–255) of types 0–3, 0 for every other type. */
  readonly drawParam: number;
  /**
   * The i32 table at +0x24 with +0x28 entries. Types 0–3: none or the shaped-bar mode; type 9: two inclusive x ranges
   * [p0, p1] and [p2, p3] inside the rectangle; every other type: none.
   */
  readonly params: readonly number[];
}

export interface ElementSchedule {
  /** The image of the slot layout's element with the same index. */
  readonly image: AssetId;
  /** Element +44. */
  readonly pass: 0 | 1;
  /** Element +48 ≠ 0; false draws the element only in a full redraw, which schema 1 allows only in pass 0. */
  readonly everyFrame: boolean;
}

export interface InstrumentSlot {
  /** Index of the slot in the CCKD 10103 directory. */
  readonly slot: 0 | 2 | 7;
  /** Directory +0x00. */
  readonly layoutNumber: 0 | 6 | 8;
  /** Directory +0x0C ≠ 0. */
  readonly alwaysRedraw: boolean;
  /** `layout/cockpit/front`, `layout/map/frame` or none. */
  readonly layout: AssetId | null;
  /** One schedule per layout element; empty without a layout. */
  readonly elements: readonly ElementSchedule[];
  /** Records in source order, each type of the slot exactly once. */
  readonly instruments: readonly InstrumentRecord[];
}

export interface CockpitInstruments {
  /** Slots 0, 2 and 7, in this order. */
  readonly slots: readonly [InstrumentSlot, InstrumentSlot, InstrumentSlot];
  /** The right display's 20 finite f32 view distances, indexed by kind bit, as stored. */
  readonly targetViewDistances: readonly number[];
}

/** The read Assets the cockpit instruments are checked against. */
export interface CockpitInstrumentAssets {
  /** `layout/cockpit/front`, slot 0's layout. */
  readonly front: LayoutPayload;
  /** `layout/map/frame`, slot 2's layout. */
  readonly mapFrame: LayoutPayload;
  /** `data/hud/map-geometry`, from the same type-10 record as slot 2's. */
  readonly mapGeometry: MapGeometry;
}

type SlotFormat = typeof COCKPIT_INSTRUMENTS_FORMAT.slots[number];

const CODE = 'invalid-flight-data-payload';

const FORMAT: CanonicalJsonFormat = Object.freeze({
  name: 'cockpit instruments payload', byteLimit: COCKPIT_INSTRUMENTS_LIMITS.payloadBytes, invalid: CODE,
});

const U32_MAX = 0xffff_ffff;
const I32_MIN = -0x8000_0000;
const I32_MAX = 0x7fff_ffff;
const BAR_TYPE_MAX = 3;
const INDICATOR_STRIP_TYPE = 9;
const MAP_TYPE = 10;

function invalid(path: string, reason: string): never {
  return fail(CODE, path, reason);
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

/** A dense plain array whose length is checked before any item is read. */
function readList<T>(
  value: unknown, minimum: number, maximum: number, path: string, readItem: (item: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    invalid(path, minimum === maximum ? `must be a list of exactly ${minimum} items` : `must be a list of ${minimum} to ${maximum} items`);
  }
  return readArray(value, path, CODE, readItem);
}

/** A finite value an f32 holds exactly. The canonical form has no -0, so -0 reads as 0. */
function readF32(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.fround(value) !== value) invalid(path, 'must be a finite f32 value');
  return value + 0;
}

// Bounds that depend on other fields have fixed reasons: a converter reports them for source values, which diagnostics
// never echo.
function readRectangle(value: unknown, path: string): InclusiveRectangle {
  const record = readFields(value, path, ['x0', 'y0', 'x1', 'y1']);
  const { width, height } = COCKPIT_INSTRUMENTS_FORMAT;
  const x0 = integer(record.x0, 0, width - 1, `${path}.x0`);
  const y0 = integer(record.y0, 0, height - 1, `${path}.y0`);
  const x1 = integer(record.x1, 0, width - 1, `${path}.x1`);
  const y1 = integer(record.y1, 0, height - 1, `${path}.y1`);
  if (x1 < x0) invalid(`${path}.x1`, 'must not be left of x0');
  if (y1 < y0) invalid(`${path}.y1`, 'must not be above y0');
  return Object.freeze({ x0, y0, x1, y1 });
}

function readParams(value: unknown, type: InstrumentType, rectangle: InclusiveRectangle, path: string): readonly number[] {
  if (type === INDICATOR_STRIP_TYPE) {
    const { params: count } = COCKPIT_INSTRUMENTS_LIMITS;
    const params = readList(value, count, count, path, (item, at) => integer(item, I32_MIN, I32_MAX, at));
    params.forEach((param, index) => {
      if (param < rectangle.x0 || param > rectangle.x1) invalid(`${path}[${index}]`, 'must lie in the rectangle\'s x range');
      if (index % 2 === 1 && param < params[index - 1]!) invalid(`${path}[${index}]`, 'must not be left of the range start');
    });
    return params;
  }
  return readList(value, 0, type <= BAR_TYPE_MAX ? 1 : 0, path, (item, at) => integer(item, I32_MIN, I32_MAX, at));
}

function readInstrument(value: unknown, path: string, slot: SlotFormat, seen: Set<number>): InstrumentRecord {
  const record = readFields(value, path, ['type', 'rectangle', 'redrawInterval', 'drawParam', 'params']);
  const type = record.type;
  const types: readonly number[] = slot.types;
  if (typeof type !== 'number' || !types.includes(type)) invalid(`${path}.type`, 'must be an instrument type of the slot');
  if (seen.has(type)) invalid(`${path}.type`, 'must differ from the type of every other record of the slot');
  seen.add(type);
  const rectangle = readRectangle(record.rectangle, `${path}.rectangle`);
  const isBar = type <= BAR_TYPE_MAX;
  return Object.freeze({
    type: type as InstrumentType,
    rectangle,
    redrawInterval: integer(record.redrawInterval, 0, U32_MAX, `${path}.redrawInterval`),
    drawParam: integer(record.drawParam, 0, isBar ? 0xff : 0, `${path}.drawParam`),
    params: readParams(record.params, type as InstrumentType, rectangle, `${path}.params`),
  });
}

function readImage(value: unknown, path: string): AssetId {
  try {
    const id = readAssetId(value, path);
    if (id.startsWith('image/')) return id;
  } catch (error) {
    if (!(error instanceof ContentContractError)) throw error;
  }
  return invalid(path, 'must be an image Asset ID');
}

function readElement(value: unknown, path: string, seen: Set<AssetId>): ElementSchedule {
  const record = readFields(value, path, ['image', 'pass', 'everyFrame']);
  const image = readImage(record.image, `${path}.image`);
  if (seen.has(image)) invalid(`${path}.image`, 'must differ from the image of every other element');
  seen.add(image);
  const pass = integer(record.pass, 0, 1, `${path}.pass`) as 0 | 1;
  const { everyFrame } = record;
  if (typeof everyFrame !== 'boolean') invalid(`${path}.everyFrame`, 'must be a boolean');
  // Outside a full redraw the original copies a pass-1 element's region to the screen without drawing it.
  if (pass === 1 && !everyFrame) invalid(`${path}.everyFrame`, 'must be true for a pass-1 element');
  return Object.freeze({ image, pass, everyFrame });
}

function readSlot(value: unknown, path: string, format: SlotFormat): InstrumentSlot {
  const record = readFields(value, path, ['slot', 'layoutNumber', 'alwaysRedraw', 'layout', 'elements', 'instruments']);
  for (const field of ['slot', 'layoutNumber', 'alwaysRedraw', 'layout'] as const) {
    if (record[field] !== format[field]) invalid(`${path}.${field}`, `must be ${JSON.stringify(format[field])} in this slot`);
  }
  const images = new Set<AssetId>();
  const [fewest, most] = format.layout === null ? [0, 0] : [1, GRAPHICS_LIMITS.layoutElements];
  const elements = readList(record.elements, fewest, most, `${path}.elements`, (item, at) => readElement(item, at, images));
  const types = new Set<number>();
  const instruments = readList(record.instruments, 0, COCKPIT_INSTRUMENTS_LIMITS.recordsPerSlot, `${path}.instruments`,
    (item, at) => readInstrument(item, at, format, types));
  if (instruments.length !== format.types.length) invalid(`${path}.instruments`, 'must hold every instrument type of the slot');
  return Object.freeze({
    slot: format.slot, layoutNumber: format.layoutNumber, alwaysRedraw: format.alwaysRedraw, layout: format.layout as AssetId | null,
    elements, instruments,
  });
}

/** Strictly reads already decoded cockpit instruments content into a frozen copy isolated from its input. */
export function readCockpitInstruments(value: unknown, path = 'cockpitInstruments'): CockpitInstruments {
  const record = readFields(value, path, ['slots', 'targetViewDistances']);
  const { slots: formats, targetViewDistances: distanceCount } = COCKPIT_INSTRUMENTS_FORMAT;
  let index = 0;
  const slots = readList(record.slots, formats.length, formats.length, `${path}.slots`,
    (item, at) => readSlot(item, at, formats[index++]!));
  return Object.freeze({
    slots: slots as CockpitInstruments['slots'],
    targetViewDistances: readList(record.targetViewDistances, distanceCount, distanceCount, `${path}.targetViewDistances`, readF32),
  });
}

function checkElements(slot: InstrumentSlot, layout: LayoutPayload, path: string): void {
  if (slot.elements.length !== layout.elements.length) invalid(path, 'must have as many items as the slot layout\'s elements');
  slot.elements.forEach(({ image }, index) => {
    if (image !== layout.elements[index]!.image) invalid(`${path}[${index}].image`, 'must be the image of the layout element with the same index');
  });
}

/**
 * Checks read cockpit instruments against the read Assets they share facts with (P3-13 spec, DC-02): each laid-out slot's
 * elements name the images of its layout's elements, index for index, and slot 2's type-10 record has the rectangle and
 * redraw interval of the map geometry. Problems are payload errors at the instruments' structural path.
 */
export function checkCockpitInstruments(
  instruments: CockpitInstruments, assets: CockpitInstrumentAssets, path = 'cockpitInstruments',
): void {
  const [front, map] = instruments.slots;
  checkElements(front, assets.front, `${path}.slots[0].elements`);
  checkElements(map, assets.mapFrame, `${path}.slots[1].elements`);
  const index = map.instruments.findIndex(({ type }) => type === MAP_TYPE);
  const { rectangle, redrawInterval } = map.instruments[index]!;
  const at = `${path}.slots[1].instruments[${index}]`;
  const geometry = assets.mapGeometry;
  if ((['x0', 'y0', 'x1', 'y1'] as const).some(field => rectangle[field] !== geometry.rectangle[field])) {
    invalid(`${at}.rectangle`, 'must equal the map geometry rectangle');
  }
  if (redrawInterval !== geometry.redrawInterval) invalid(`${at}.redrawInterval`, 'must equal the map geometry redraw interval');
}

/**
 * Reads `content` strictly and returns its canonical bytes, within the byte limit, in a new buffer of their exact length.
 * `reserve` receives the byte length before the limit is checked and the bytes are allocated.
 */
export function encodeCockpitInstrumentsPayload(content: CockpitInstruments, reserve?: (byteLength: number) => void): Uint8Array {
  return encodeCanonicalJson(readCockpitInstruments(content), FORMAT, reserve);
}

/**
 * Decodes the payload bytes of the cockpit instruments Asset `descriptor` describes: the byte length limit first, then a
 * `data` descriptor of the cockpit instruments role and schema without dependencies, then canonical JSON that the strict
 * reader accepts. The images it names are the layouts' (checkCockpitInstruments), so it declares no dependencies of its
 * own (P3-03 spec, 修订 4).
 */
export function decodeCockpitInstrumentsPayload(bytes: Uint8Array, descriptor: AssetDescriptor): CockpitInstruments {
  requireCanonicalJsonBytes(bytes, FORMAT);
  const asset = readAssetDescriptor(descriptor, 'descriptor');
  if (asset.role !== COCKPIT_INSTRUMENTS_ROLE) invalid('descriptor.role', 'must be the cockpit instruments role');
  if (asset.kind !== 'data') invalid('descriptor.kind', 'must be data');
  if (asset.payloadIdentity.schemaVersion !== COCKPIT_INSTRUMENTS_SCHEMA_VERSION) {
    fail('unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion', 'must be cockpit instruments payload schema 1');
  }
  const content = decodeCanonicalJson(bytes, FORMAT, value => readCockpitInstruments(value));
  if (asset.dependencies.length !== 0) {
    fail('flight-data-reference-mismatch', 'descriptor.dependencies', 'must be empty, as the images are the layouts\' Asset references');
  }
  return content;
}
