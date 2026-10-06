import type { AssetDescriptor, AssetReference } from '../asset-contract.ts';
import { ASSET_ID_LIMITS, readAssetId, type AssetId } from '../asset-id.ts';
import { ContentContractError, compareText, fail, readArray } from '../contract-validation.ts';
import { asciiBytes, asciiText, bytesAt } from '../graphics/graphics-format.ts';
import { isDetached } from '../ownership.ts';

// Model payload schema 1 (P2-06 S-01), little-endian without padding:
//   0   u8       part list count, 3
//   1   u8       sound slot count, 5
//   2   u16      reference count N
//   4   u16      geometry count G, 1 to the part count
//   6   u16 × 3  part counts of lists 0, 1 and 2, 1–256 in total
//   12  u16 × 5  sound slots: 0 empty, otherwise 1 + the index of a sound reference
//   22  N references: u8 length L (1–128), then L ASCII bytes of an Asset ID. They are exactly the distinct IDs the
//       parts and slots use, in strictly ascending order, so they equal the descriptor's dependencies.
//   …   the parts of lists 0, 1 and 2 in stored order, 11 bytes each: u32 source flags; u8 R, G, B; u16 geometry index;
//       u16 texture, 0 for none, otherwise 1 + the index of an image reference
//   …   G geometries in order of first use by those parts, each: u16 vertex count V (1–4,096), u16 triangle count T
//       (1–4,096), u16 shading slot count S (1 to 3T); V × 3 f32 positions, V × 2 f32 UVs, V × 3 f32 normals;
//       T × 3 u16 vertex indices (< V) and T × 3 u16 corner shading slots (< S)
// Floats are finite and kept bit for bit. Any change to the layout or its meaning needs a new schema version.

export const MODEL_PAYLOAD_SCHEMA_VERSION = 1;

/**
 * Structural limits shared by the payload reader and the original-data model readers and converter. The vertex,
 * triangle and part counts are approved safety caps (limit names `meshVertices`, `meshTriangles`, `modelParts`); the
 * part list and sound slot counts are format rules.
 */
export const MODEL_LIMITS = Object.freeze({
  meshVertices: 4_096,
  meshTriangles: 4_096,
  modelParts: 256,
  partLists: 3,
  soundSlots: 5,
});

/** Encoded sizes in bytes, for payload lengths and their bounds. A reference takes its length byte plus its ID. */
export const MODEL_PAYLOAD_LAYOUT = Object.freeze({
  headerBytes: 22,
  referenceLengthBytes: 1,
  partBytes: 11,
  geometryHeaderBytes: 6,
  vertexBytes: 32,
  triangleBytes: 12,
});

export type ModelColour = readonly [red: number, green: number, blue: number];

/** One geometry, in the original model space: no unit, axis, handedness, winding or UV origin is converted. */
export interface ModelGeometry {
  /** x, y, z per vertex. */
  readonly positions: Float32Array;
  /** u, v per vertex, as stored. */
  readonly uvs: Float32Array;
  /** x, y, z per vertex. */
  readonly normals: Float32Array;
  /** Three vertex indices per triangle, in stored order and winding. */
  readonly indices: Uint16Array;
  /** One shading slot per triangle corner, parallel to `indices`. */
  readonly cornerShading: Uint16Array;
  readonly shadingSlotCount: number;
}

/** One source part. The payload gives part lists, flags and sound slots no meaning; see docs/original/. */
export interface ModelPart {
  /** The source flag word, unchanged. */
  readonly sourceFlags: number;
  readonly colour: ModelColour;
  /** Index into the model's geometries. */
  readonly geometry: number;
  /** Image Asset ID, or null for an untextured part. */
  readonly texture: AssetId | null;
}

type PartList = readonly ModelPart[];
type SoundSlot = AssetId | null;

export interface ModelPayload {
  readonly kind: 'model';
  readonly geometries: readonly ModelGeometry[];
  /** Source part lists 0, 1 and 2. */
  readonly partLists: readonly [PartList, PartList, PartList];
  /** Source sound slots 0–4, each a sound Asset ID or null. */
  readonly soundSlots: readonly [SoundSlot, SoundSlot, SoundSlot, SoundSlot, SoundSlot];
}

/** The sizes that determine a payload's length, known before any geometry is read or allocated. */
export interface ModelPayloadShape {
  readonly geometries: readonly { readonly vertices: number; readonly triangles: number }[];
  readonly parts: number;
  /** The distinct texture and sound Asset IDs. */
  readonly references: readonly string[];
}

const L = MODEL_PAYLOAD_LAYOUT;
const MAX_REFERENCES = MODEL_LIMITS.modelParts + MODEL_LIMITS.soundSlots;

/** Encoded length of a payload with this shape. */
export const modelPayloadLength = ({ geometries, parts, references }: ModelPayloadShape): number =>
  L.headerBytes + references.reduce((sum, id) => sum + L.referenceLengthBytes + id.length, 0) + parts * L.partBytes
  + geometries.reduce((sum, { vertices, triangles }) => sum + L.geometryHeaderBytes + vertices * L.vertexBytes + triangles * L.triangleBytes, 0);

function invalid(path: string, reason: string): never {
  fail('invalid-model-payload', path, reason);
}

function requireInteger(value: unknown, minimum: number, maximum: number, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(path, `must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

/** A dense plain array of data elements (no holes or accessors), of exactly `length` items when given. */
function requireArray(value: unknown, path: string, length?: number): readonly unknown[] {
  const items = readArray(value, path, 'invalid-model-payload', item => item);
  if (length !== undefined && items.length !== length) invalid(path, `must hold exactly ${length} items`);
  return items;
}

function requireTyped<T extends Float32Array | Uint16Array>(value: unknown, type: abstract new (...args: never[]) => T, path: string, length?: number): T {
  if (!(value instanceof type)) invalid(path, `must be a ${type.name}`);
  if (isDetached(value.buffer)) fail('payload-detached', path, 'was transferred away and can no longer be used');
  if (length !== undefined && value.length !== length) invalid(path, `must hold ${length} values`);
  return value;
}

function requireReference(value: unknown, kind: 'image' | 'sound', path: string): void {
  if (value === null) return;
  try {
    if (readAssetId(value, path).startsWith(`${kind}/`)) return;
  } catch (error) {
    if (!(error instanceof ContentContractError)) throw error;
  }
  invalid(path, `must be null or ${kind === 'image' ? 'an image' : 'a sound'} Asset ID`);
}

/** Checks one geometry's arrays and ranges, returning its vertex and triangle counts. */
function checkGeometry(value: unknown, path: string): ModelPayloadShape['geometries'][number] {
  if (typeof value !== 'object' || value === null) invalid(path, 'must be a geometry record');
  const geometry = value as Partial<Record<keyof ModelGeometry, unknown>>;
  const positions = requireTyped(geometry.positions, Float32Array, `${path}.positions`);
  const indices = requireTyped(geometry.indices, Uint16Array, `${path}.indices`);
  const vertices = positions.length / 3;
  if (!Number.isInteger(vertices) || vertices < 1 || vertices > MODEL_LIMITS.meshVertices) {
    invalid(`${path}.positions`, `must hold 1 to ${MODEL_LIMITS.meshVertices} vertices of 3 values`);
  }
  const triangles = indices.length / 3;
  if (!Number.isInteger(triangles) || triangles < 1 || triangles > MODEL_LIMITS.meshTriangles) {
    invalid(`${path}.indices`, `must hold 1 to ${MODEL_LIMITS.meshTriangles} triangles of 3 indices`);
  }
  const slots = requireInteger(geometry.shadingSlotCount, 1, triangles * 3, `${path}.shadingSlotCount`);
  const floats = [
    ['positions', positions],
    ['uvs', requireTyped(geometry.uvs, Float32Array, `${path}.uvs`, vertices * 2)],
    ['normals', requireTyped(geometry.normals, Float32Array, `${path}.normals`, vertices * 3)],
  ] as const;
  for (const [field, values] of floats) if (!values.every(Number.isFinite)) invalid(`${path}.${field}`, 'must hold only finite values');
  if (indices.some(index => index >= vertices)) invalid(`${path}.indices`, 'must address vertices of the geometry');
  const shading = requireTyped(geometry.cornerShading, Uint16Array, `${path}.cornerShading`, triangles * 3);
  if (shading.some(slot => slot >= slots)) invalid(`${path}.cornerShading`, 'must be less than the shading slot count');
  return { vertices, triangles };
}

/** The distinct textures and sounds a model references, in ascending ID order: exactly its descriptor's dependencies. */
export function modelReferences(model: Pick<ModelPayload, 'partLists' | 'soundSlots'>): readonly AssetReference[] {
  const references = new Map<AssetId, AssetReference>();
  for (const list of model.partLists) {
    for (const { texture } of list) if (texture !== null) references.set(texture, { id: texture, kind: 'image' });
  }
  for (const sound of model.soundSlots) if (sound !== null) references.set(sound, { id: sound, kind: 'sound' });
  return Object.freeze([...references.values()].sort((left, right) => compareText(left.id, right.id)).map(reference => Object.freeze(reference)));
}

/**
 * Checks a model by the rules the encoder and reader share: counts and ranges, finite floats, geometries each used by a
 * part in order of first use, and textures and slots of the right kind. Returns its shape.
 */
function checkModel(model: Omit<ModelPayload, 'kind'>, path: string): ModelPayloadShape {
  const lists = requireArray(model.partLists, `${path}.partLists`, MODEL_LIMITS.partLists).map((list, index) => requireArray(list, `${path}.partLists[${index}]`));
  const parts = requireInteger(lists.reduce((sum, list) => sum + list.length, 0), 1, MODEL_LIMITS.modelParts, `${path}.partLists`);
  const geometryValues = requireArray(model.geometries, `${path}.geometries`);
  requireInteger(geometryValues.length, 1, parts, `${path}.geometries`);
  const geometries = geometryValues.map((geometry, index) => checkGeometry(geometry, `${path}.geometries[${index}]`));
  let used = 0;
  lists.forEach((list, listIndex) => list.forEach((value, partIndex) => {
    const at = `${path}.partLists[${listIndex}][${partIndex}]`;
    if (typeof value !== 'object' || value === null) invalid(at, 'must be a part record');
    const part = value as Partial<Record<keyof ModelPart, unknown>>;
    requireInteger(part.sourceFlags, 0, 0xffff_ffff, `${at}.sourceFlags`);
    requireArray(part.colour, `${at}.colour`, 3).forEach((channel, index) => requireInteger(channel, 0, 255, `${at}.colour[${index}]`));
    const geometry = requireInteger(part.geometry, 0, geometries.length - 1, `${at}.geometry`);
    if (geometry > used) invalid(`${at}.geometry`, 'must be a geometry already used or the next one in order of first use');
    if (geometry === used) used++;
    requireReference(part.texture, 'image', `${at}.texture`);
  }));
  if (used !== geometries.length) invalid(`${path}.geometries`, 'must each be used by a part');
  requireArray(model.soundSlots, `${path}.soundSlots`, MODEL_LIMITS.soundSlots)
    .forEach((slot, index) => requireReference(slot, 'sound', `${path}.soundSlots[${index}]`));
  return { geometries, parts, references: modelReferences(model).map(reference => reference.id) };
}

/** Checks that the descriptor is a model whose dependencies are exactly the textures and sounds the payload references. */
export function checkModelBinding(descriptor: AssetDescriptor, payload: ModelPayload, path = 'asset'): void {
  if (descriptor.kind !== 'model') fail('binding-mismatch', `${path}.kind`, 'must be model');
  const expected = modelReferences(payload);
  const { dependencies } = descriptor;
  if (dependencies.length !== expected.length
    || dependencies.some((dependency, index) => dependency.id !== expected[index].id || dependency.kind !== expected[index].kind)) {
    fail('binding-mismatch', `${path}.dependencies`, 'must be exactly the textures and sounds the model references');
  }
}

/** Encodes a model into a new buffer that the result owns entirely; the same model always gives the same bytes. */
export function encodeModelPayload(model: Omit<ModelPayload, 'kind'>, path = 'model'): Uint8Array<ArrayBuffer> {
  const shape = checkModel(model, path);
  const index = new Map(shape.references.map((id, at) => [id, at + 1]));
  const bytes = new Uint8Array(modelPayloadLength(shape));
  const view = new DataView(bytes.buffer);
  bytes.set([MODEL_LIMITS.partLists, MODEL_LIMITS.soundSlots]);
  view.setUint16(2, shape.references.length, true);
  view.setUint16(4, shape.geometries.length, true);
  model.partLists.forEach((list, at) => view.setUint16(6 + at * 2, list.length, true));
  model.soundSlots.forEach((slot, at) => view.setUint16(12 + at * 2, slot === null ? 0 : index.get(slot)!, true));
  let at = L.headerBytes;
  for (const id of shape.references) {
    bytes[at] = id.length;
    bytes.set(asciiBytes(id), at + L.referenceLengthBytes);
    at += L.referenceLengthBytes + id.length;
  }
  for (const part of model.partLists.flat()) {
    view.setUint32(at, part.sourceFlags, true);
    bytes.set(part.colour, at + 4);
    view.setUint16(at + 7, part.geometry, true);
    view.setUint16(at + 9, part.texture === null ? 0 : index.get(part.texture)!, true);
    at += L.partBytes;
  }
  shape.geometries.forEach(({ vertices, triangles }, geometry) => {
    const { positions, uvs, normals, indices, cornerShading, shadingSlotCount } = model.geometries[geometry];
    [vertices, triangles, shadingSlotCount].forEach((count, offset) => view.setUint16(at + offset * 2, count, true));
    at += L.geometryHeaderBytes;
    for (const floats of [positions, uvs, normals]) {
      for (const value of floats) {
        view.setFloat32(at, value, true);
        at += 4;
      }
    }
    for (const integers of [indices, cornerShading]) {
      for (const value of integers) {
        view.setUint16(at, value, true);
        at += 2;
      }
    }
  });
  return bytes;
}

/**
 * Strictly reads a schema 1 model payload into frozen data whose arrays are the caller's own copies. Every count is
 * range-checked and its bytes found present before anything is sized from it; diagnostics name only structural paths.
 */
export function readModelPayload(bytes: unknown, schemaVersion: unknown, path = 'payload'): ModelPayload {
  if (schemaVersion !== MODEL_PAYLOAD_SCHEMA_VERSION) fail('unsupported-payload-schema', `${path}.schemaVersion`, 'must be model payload schema 1');
  if (!(bytes instanceof Uint8Array)) invalid(path, 'must be a Uint8Array');
  if (isDetached(bytes.buffer)) fail('payload-detached', path, 'was transferred away and can no longer be used');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  /** Claims the next `length` bytes, returning their offset. */
  const take = (length: number): number => {
    if (view.byteLength - at < length) invalid(path, 'is truncated');
    at += length;
    return at - length;
  };
  const u16 = (offset: number): number => view.getUint16(offset, true);

  take(L.headerBytes);
  if (view.getUint8(0) !== MODEL_LIMITS.partLists) invalid(`${path}.partLists`, 'must be exactly 3 lists');
  if (view.getUint8(1) !== MODEL_LIMITS.soundSlots) invalid(`${path}.soundSlots`, 'must be exactly 5 slots');
  const referenceCount = requireInteger(u16(2), 0, MAX_REFERENCES, `${path}.references`);
  const parts = requireInteger(u16(6) + u16(8) + u16(10), 1, MODEL_LIMITS.modelParts, `${path}.partLists`);
  const geometryCount = requireInteger(u16(4), 1, parts, `${path}.geometries`);

  const references = Array.from({ length: referenceCount }, (_, index) => {
    const referencePath = `${path}.references[${index}]`;
    const length = requireInteger(view.getUint8(take(L.referenceLengthBytes)), 1, ASSET_ID_LIMITS.totalLength, referencePath);
    try {
      return readAssetId(asciiText(bytesAt(view, take(length), length)), referencePath);
    } catch (error) {
      if (!(error instanceof ContentContractError)) throw error;
      return invalid(referencePath, 'must be an Asset ID');
    }
  });
  /** The reference a stored 1-based index names, or null for 0. */
  const resolve = (stored: number, referencePath: string): AssetId | null => {
    if (stored > references.length) invalid(referencePath, 'must address a reference of the payload');
    return stored === 0 ? null : references[stored - 1];
  };
  const slot = (index: number): SoundSlot => resolve(u16(12 + index * 2), `${path}.soundSlots[${index}]`);
  const list = (index: number): PartList => Object.freeze(Array.from({ length: u16(6 + index * 2) }, (_, part) => {
    const start = take(L.partBytes);
    const colour: ModelColour = Object.freeze([view.getUint8(start + 4), view.getUint8(start + 5), view.getUint8(start + 6)]);
    const texture = resolve(u16(start + 9), `${path}.partLists[${index}][${part}].texture`);
    return Object.freeze({ sourceFlags: view.getUint32(start, true), colour, geometry: u16(start + 7), texture });
  }));
  const soundSlots = Object.freeze([slot(0), slot(1), slot(2), slot(3), slot(4)] as const);
  const partLists = Object.freeze([list(0), list(1), list(2)] as const);
  const geometries = Object.freeze(Array.from({ length: geometryCount }, (_, index): ModelGeometry => {
    const geometryPath = `${path}.geometries[${index}]`;
    const header = take(L.geometryHeaderBytes);
    const vertices = requireInteger(u16(header), 1, MODEL_LIMITS.meshVertices, `${geometryPath}.vertexCount`);
    const triangles = requireInteger(u16(header + 2), 1, MODEL_LIMITS.meshTriangles, `${geometryPath}.triangleCount`);
    const shadingSlotCount = requireInteger(u16(header + 4), 1, triangles * 3, `${geometryPath}.shadingSlotCount`);
    let next = take(vertices * L.vertexBytes + triangles * L.triangleBytes);
    const floats = (count: number): Float32Array => {
      const values = new Float32Array(count);
      for (let value = 0; value < count; value++, next += 4) values[value] = view.getFloat32(next, true);
      return values;
    };
    const integers = (count: number): Uint16Array => {
      const values = new Uint16Array(count);
      for (let value = 0; value < count; value++, next += 2) values[value] = u16(next);
      return values;
    };
    // Property order is the layout order.
    return Object.freeze({
      positions: floats(vertices * 3),
      uvs: floats(vertices * 2),
      normals: floats(vertices * 3),
      indices: integers(triangles * 3),
      cornerShading: integers(triangles * 3),
      shadingSlotCount,
    });
  }));
  if (at !== view.byteLength) invalid(path, 'has trailing bytes');

  const model: ModelPayload = Object.freeze({ kind: 'model', geometries, partLists, soundSlots });
  const { references: used } = checkModel(model, path);
  if (used.length !== references.length || used.some((id, index) => id !== references[index])) {
    invalid(`${path}.references`, 'must be exactly the distinct IDs the parts and sound slots use, in ascending order');
  }
  return model;
}
