import type { AssetDescriptor, AssetReference } from '../asset-contract.ts';
import { ASSET_ID_LIMITS, readAssetId, type AssetId } from '../asset-id.ts';
import { ContentContractError, fail, readArray } from '../contract-validation.ts';
import { asciiBytes, asciiText, bytesAt } from '../graphics/graphics-format.ts';
import { isDetached } from '../ownership.ts';

// Effect payloads schema 1 (P2-06 spec, effect geometry data): the source data of the procedural projectile, missile
// and debris geometry, kept bit for bit. Little-endian without padding. A face list is a u16 word count W, then W u32
// words: {corner count, vertex indices…} per face, ending with 0. A texture is a u8 length L (1–128), then L ASCII
// bytes of an image Asset ID.
//   projectile  u16 record count R (1–64); 2 templates, each: face list, 12 f32 vertices (4 × x, y, z), 6 u32 width
//               markers (2 per axis x, y, z), u32 length marker, f64 length constant. Then R records of 24 bytes: u32
//               selector, f32 width, f32 length, f32 × 3 colour
//   missile     texture; u16 type count T (1–32); face lists fin, element, flagged element, extra; 7 f64 constants in
//               MISSILE_CONSTANTS order; f64 rotation scale; f32 × 3 extra colour. Then T types: u32 parts P (1–4);
//               body f32 r0, r1, length, i32 segments (3–64), u32 colour (24 bits); P − 1 fins of f32 × 4 and u32
//               colour; f32 × 3 element; f32 flag
//   debris      texture; 2 templates (untextured, textured), each: face list, 18 f32 vertices (6 × x, y, z), 18 u32
//               per-vertex words. Then f32 × 3 untextured scales, f32 × 2 textured scales, f32 × 3 untextured colour,
//               f32 × 3 textured colour
// Floats are finite. Any change to a layout or its meaning needs a new schema version.

export const EFFECT_PAYLOAD_SCHEMA_VERSION = 1;

/** Approved structural limits (limit names `effectRecords`, `missileTypes`, `ringSegments`) and format rules. */
export const EFFECT_LIMITS = Object.freeze({
  effectRecords: 64,
  missileTypes: 32,
  minRingSegments: 3,
  ringSegments: 64,
  missileParts: 4,
  packedColour: 0xff_ffff,
});

/** Fixed counts of the source structures. */
export const EFFECT_SHAPES = Object.freeze({
  projectileVertices: 4,
  widthMarkers: 6,
  finVertices: 9,
  elementVertices: 6,
  extraVertices: 3,
  debrisVertices: 6,
  untexturedScales: 3,
  texturedScales: 2,
});

/** The missile constants in source order. */
export const MISSILE_CONSTANTS = Object.freeze([
  'finColourScale', 'bodyAngle', 'bodyColourScale', 'elementStep', 'extraOffset', 'extraStep', 'rotationStep',
] as const);

/** Three floats in the builder's argument order; their range and channel meaning are unconfirmed. */
export type EffectColour = readonly [number, number, number];

export interface ProjectileTemplate {
  /** The face list words as stored, ending with 0. */
  readonly faces: Uint32Array;
  /** x, y, z of 4 vertices. */
  readonly vertices: Float32Array;
  /** Bit patterns, two per axis x, y, z, that mark a component scaled by the width. */
  readonly widthMarkers: Uint32Array;
  /** The bit pattern that marks a z component scaled by the length. */
  readonly lengthMarker: number;
  readonly lengthConstant: number;
}

export interface ProjectileRecord {
  /** 0 selects template 0, anything else template 1 (`projectileTemplate`). */
  readonly selector: number;
  readonly width: number;
  readonly length: number;
  readonly colour: EffectColour;
}

export interface ProjectileVisuals {
  readonly kind: 'projectile';
  readonly templates: readonly [ProjectileTemplate, ProjectileTemplate];
  /** In source order: a record's index is the original selection index. */
  readonly records: readonly ProjectileRecord[];
}

export interface MissileBody {
  readonly r0: number;
  readonly r1: number;
  readonly length: number;
  readonly segments: number;
  /** Packed 24-bit colour. */
  readonly colour: number;
}

export interface MissileFin {
  readonly params: readonly [number, number, number, number];
  /** Packed 24-bit colour. */
  readonly colour: number;
}

export interface MissileType {
  /** The body and `parts - 1` fins. */
  readonly parts: number;
  readonly body: MissileBody;
  readonly fins: readonly MissileFin[];
  readonly element: readonly [number, number, number];
  readonly flag: number;
}

export type MissileConstants = Readonly<Record<typeof MISSILE_CONSTANTS[number], number>>;

export interface MissileFaces {
  readonly fin: Uint32Array;
  readonly element: Uint32Array;
  readonly flaggedElement: Uint32Array;
  readonly extra: Uint32Array;
}

export interface MissileVisuals {
  readonly kind: 'missile';
  /** The image of the textured element. */
  readonly texture: AssetId;
  readonly types: readonly MissileType[];
  readonly faces: MissileFaces;
  readonly constants: MissileConstants;
  readonly rotationScale: number;
  readonly extraColour: EffectColour;
}

export interface DebrisTemplate {
  readonly faces: Uint32Array;
  /** x, y, z of 6 vertices. */
  readonly vertices: Float32Array;
  /** 3 words per vertex, unchanged; that they are normals is likely, not confirmed. */
  readonly perVertex: Uint32Array;
}

export interface DebrisVisuals {
  readonly kind: 'debris';
  /** The image of the textured shapes. */
  readonly texture: AssetId;
  readonly templates: readonly [untextured: DebrisTemplate, textured: DebrisTemplate];
  readonly untexturedScales: readonly [number, number, number];
  readonly texturedScales: readonly [number, number];
  readonly untexturedColour: EffectColour;
  readonly texturedColour: EffectColour;
}

export type EffectPayload = ProjectileVisuals | MissileVisuals | DebrisVisuals;
/** The payload kind, equal to the Asset's role. */
export type EffectKind = EffectPayload['kind'];
export type EffectOf<K extends EffectKind> = Extract<EffectPayload, { readonly kind: K }>;

const EFFECT_KINDS: readonly string[] = ['projectile', 'missile', 'debris'];
const MISSILE_FACES = ['fin', 'element', 'flaggedElement', 'extra'] as const;
const S = EFFECT_SHAPES;

/** The template a projectile record's selector chooses. */
export const projectileTemplate = (selector: number): 0 | 1 => (selector === 0 ? 0 : 1);

export function invalid(path: string, reason: string): never {
  fail('invalid-effect-payload', path, reason);
}

function requireInteger(value: unknown, minimum: number, maximum: number, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(path, `must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

const requireU32 = (value: unknown, path: string): number => requireInteger(value, 0, 0xffff_ffff, path);

function requireF32(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Object.is(Math.fround(value), value)) invalid(path, 'must be a finite 32-bit float');
  return value;
}

function requireF64(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path, 'must be a finite number');
  return value;
}

/** A dense plain array of exactly `length` items when given, each read by `readItem`. */
function requireArray<T = unknown>(value: unknown, path: string, length?: number, readItem = (item: unknown, _path: string) => item as T): readonly T[] {
  const items = readArray(value, path, 'invalid-effect-payload', readItem);
  if (length !== undefined && items.length !== length) invalid(path, `must hold exactly ${length} items`);
  return items;
}

function requireRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) invalid(path, 'must be a record');
  return value as Readonly<Record<string, unknown>>;
}

function requireTyped<T extends Float32Array | Uint32Array>(value: unknown, type: abstract new (...args: never[]) => T, path: string, length?: number): T {
  if (!(value instanceof type)) invalid(path, `must be a ${type.name}`);
  if (isDetached(value.buffer)) fail('payload-detached', path, 'was transferred away and can no longer be used');
  if (length !== undefined && value.length !== length) invalid(path, `must hold ${length} values`);
  return value;
}

function requireFloats(value: unknown, length: number, path: string): void {
  if (!requireTyped(value, Float32Array, path, length).every(Number.isFinite)) invalid(path, 'must hold only finite values');
}

function requireTexture(value: unknown, path: string): AssetId {
  try {
    const id = readAssetId(value, path);
    if (id.startsWith('image/')) return id;
  } catch (error) {
    if (!(error instanceof ContentContractError)) throw error;
  }
  return invalid(path, 'must be an image Asset ID');
}

/** The most face list words a payload stores: the u16 word count. */
export const MAX_FACE_WORDS = 0xffff;

/**
 * Checks face list words without allocating: at most `MAX_FACE_WORDS`, every face of 3 to `vertices` corners
 * addressing the shape's vertices, at least one face, and 0 at the last word. Returns the triangle count, corners − 2
 * per face.
 */
export function faceTriangles(words: Uint32Array, vertices: number, path: string): number {
  if (words.length > MAX_FACE_WORDS) invalid(path, `must hold at most ${MAX_FACE_WORDS} words`);
  let triangles = 0;
  let at = 0;
  while (at < words.length && words[at] !== 0) {
    const corners = words[at];
    if (corners < 3 || corners > vertices) invalid(path, 'must give each face 3 corners up to the vertex count');
    if (at + 1 + corners >= words.length) invalid(path, 'must end with 0');
    for (let corner = 1; corner <= corners; corner++) if (words[at + corner] >= vertices) invalid(path, 'must address vertices of the shape');
    triangles += corners - 2;
    at += 1 + corners;
  }
  if (at !== words.length - 1) invalid(path, 'must end with 0 at its last word');
  if (triangles === 0) invalid(path, 'must hold at least one face');
  return triangles;
}

/** The faces of checked face list words, as frozen arrays of vertex indices in source order. */
export function faceList(words: Uint32Array, vertices: number, path: string): readonly (readonly number[])[] {
  faceTriangles(words, vertices, path);
  const faces: (readonly number[])[] = [];
  for (let at = 0; words[at] !== 0; at += 1 + words[at]) faces.push(Object.freeze(Array.from(words.subarray(at + 1, at + 1 + words[at]))));
  return Object.freeze(faces);
}

function requireFaces(value: unknown, vertices: number, path: string): void {
  faceTriangles(requireTyped(value, Uint32Array, path), vertices, path);
}

function checkProjectile(payload: Readonly<Record<string, unknown>>, path: string): void {
  requireArray(payload.templates, `${path}.templates`, 2).forEach((value, index) => {
    const at = `${path}.templates[${index}]`;
    const template = requireRecord(value, at);
    requireFaces(template.faces, S.projectileVertices, `${at}.faces`);
    requireFloats(template.vertices, S.projectileVertices * 3, `${at}.vertices`);
    requireTyped(template.widthMarkers, Uint32Array, `${at}.widthMarkers`, S.widthMarkers);
    requireU32(template.lengthMarker, `${at}.lengthMarker`);
    requireF64(template.lengthConstant, `${at}.lengthConstant`);
  });
  const records = requireArray(payload.records, `${path}.records`);
  requireInteger(records.length, 1, EFFECT_LIMITS.effectRecords, `${path}.records`);
  records.forEach((value, index) => {
    const at = `${path}.records[${index}]`;
    const record = requireRecord(value, at);
    requireU32(record.selector, `${at}.selector`);
    requireF32(record.width, `${at}.width`);
    requireF32(record.length, `${at}.length`);
    requireArray(record.colour, `${at}.colour`, 3, requireF32);
  });
}

function checkMissile(payload: Readonly<Record<string, unknown>>, path: string): void {
  requireTexture(payload.texture, `${path}.texture`);
  const faces = requireRecord(payload.faces, `${path}.faces`);
  const vertices = { fin: S.finVertices, element: S.elementVertices, flaggedElement: S.elementVertices, extra: S.extraVertices };
  for (const name of MISSILE_FACES) requireFaces(faces[name], vertices[name], `${path}.faces.${name}`);
  const constants = requireRecord(payload.constants, `${path}.constants`);
  for (const name of MISSILE_CONSTANTS) requireF64(constants[name], `${path}.constants.${name}`);
  requireF64(payload.rotationScale, `${path}.rotationScale`);
  requireArray(payload.extraColour, `${path}.extraColour`, 3, requireF32);
  const types = requireArray(payload.types, `${path}.types`);
  requireInteger(types.length, 1, EFFECT_LIMITS.missileTypes, `${path}.types`);
  types.forEach((value, index) => {
    const at = `${path}.types[${index}]`;
    const type = requireRecord(value, at);
    const parts = requireInteger(type.parts, 1, EFFECT_LIMITS.missileParts, `${at}.parts`);
    const body = requireRecord(type.body, `${at}.body`);
    for (const field of ['r0', 'r1', 'length']) requireF32(body[field], `${at}.body.${field}`);
    requireInteger(body.segments, EFFECT_LIMITS.minRingSegments, EFFECT_LIMITS.ringSegments, `${at}.body.segments`);
    requireInteger(body.colour, 0, EFFECT_LIMITS.packedColour, `${at}.body.colour`);
    requireArray(type.fins, `${at}.fins`, parts - 1).forEach((value, fin) => {
      const finAt = `${at}.fins[${fin}]`;
      const record = requireRecord(value, finAt);
      requireArray(record.params, `${finAt}.params`, 4, requireF32);
      requireInteger(record.colour, 0, EFFECT_LIMITS.packedColour, `${finAt}.colour`);
    });
    requireArray(type.element, `${at}.element`, 3, requireF32);
    requireF32(type.flag, `${at}.flag`);
  });
}

function checkDebris(payload: Readonly<Record<string, unknown>>, path: string): void {
  requireTexture(payload.texture, `${path}.texture`);
  requireArray(payload.templates, `${path}.templates`, 2).forEach((value, index) => {
    const at = `${path}.templates[${index}]`;
    const template = requireRecord(value, at);
    requireFaces(template.faces, S.debrisVertices, `${at}.faces`);
    requireFloats(template.vertices, S.debrisVertices * 3, `${at}.vertices`);
    requireTyped(template.perVertex, Uint32Array, `${at}.perVertex`, S.debrisVertices * 3);
  });
  requireArray(payload.untexturedScales, `${path}.untexturedScales`, S.untexturedScales, requireF32);
  requireArray(payload.texturedScales, `${path}.texturedScales`, S.texturedScales, requireF32);
  requireArray(payload.untexturedColour, `${path}.untexturedColour`, 3, requireF32);
  requireArray(payload.texturedColour, `${path}.texturedColour`, 3, requireF32);
}

/** Checks an effect payload by the rules the encoder and reader share. */
function checkEffect(payload: unknown, path: string): void {
  const record = requireRecord(payload, path);
  switch (record.kind) {
    case 'projectile': return checkProjectile(record, path);
    case 'missile': return checkMissile(record, path);
    case 'debris': return checkDebris(record, path);
    default: invalid(`${path}.kind`, 'must be projectile, missile or debris');
  }
}

// Encoded sizes in bytes of the layout's parts.
const COUNT = 2;
const WORD = 4;
const DOUBLE = 8;
const COLOUR = 3 * WORD;
const faceListBytes = (words: Uint32Array): number => COUNT + words.length * WORD;
const textureBytes = (id: string): number => 1 + id.length;
/** Vertices, width markers, length marker and length constant. */
const PROJECTILE_TEMPLATE = (S.projectileVertices * 3 + S.widthMarkers + 1) * WORD + DOUBLE;
/** Selector, width, length and colour. */
const PROJECTILE_RECORD = 3 * WORD + COLOUR;
/** Parameters and packed colour; the body has the same size. */
const MISSILE_PART = 5 * WORD;
/** Parts, then the element and flag besides the body and fins. */
const MISSILE_TYPE = WORD + 4 * WORD;
const MISSILE_SHARED = MISSILE_CONSTANTS.length * DOUBLE + DOUBLE + COLOUR;
/** Vertices and per-vertex words. */
const DEBRIS_TEMPLATE = 2 * S.debrisVertices * 3 * WORD;
const DEBRIS_SHARED = (S.untexturedScales + S.texturedScales) * WORD + 2 * COLOUR;

/** Encoded length of a checked payload, from its counts alone. */
export function effectPayloadLength(payload: EffectPayload): number {
  switch (payload.kind) {
    case 'projectile':
      return COUNT + payload.templates.reduce((sum, { faces }) => sum + faceListBytes(faces) + PROJECTILE_TEMPLATE, 0)
        + payload.records.length * PROJECTILE_RECORD;
    case 'missile':
      return textureBytes(payload.texture) + COUNT + MISSILE_FACES.reduce((sum, name) => sum + faceListBytes(payload.faces[name]), 0)
        + MISSILE_SHARED + payload.types.reduce((sum, { parts }) => sum + MISSILE_TYPE + parts * MISSILE_PART, 0);
    case 'debris':
      return textureBytes(payload.texture) + payload.templates.reduce((sum, { faces }) => sum + faceListBytes(faces) + DEBRIS_TEMPLATE, 0)
        + DEBRIS_SHARED;
  }
}

class Writer {
  readonly bytes: Uint8Array<ArrayBuffer>;
  private readonly view: DataView;
  private at = 0;

  constructor(length: number) {
    this.bytes = new Uint8Array(length);
    this.view = new DataView(this.bytes.buffer);
  }

  private next(length: number): number {
    this.at += length;
    return this.at - length;
  }

  u16(value: number): void { this.view.setUint16(this.next(2), value, true); }
  i32(value: number): void { this.view.setInt32(this.next(4), value, true); }
  f64(value: number): void { this.view.setFloat64(this.next(8), value, true); }
  u32(values: ArrayLike<number>): void { for (let index = 0; index < values.length; index++) this.view.setUint32(this.next(4), values[index], true); }
  f32(values: ArrayLike<number>): void { for (let index = 0; index < values.length; index++) this.view.setFloat32(this.next(4), values[index], true); }

  faces(words: Uint32Array): void {
    this.u16(words.length);
    this.u32(words);
  }

  texture(id: string): void {
    this.bytes[this.next(1)] = id.length;
    this.bytes.set(asciiBytes(id), this.next(id.length));
  }
}

/** Encodes an effect payload into a new buffer the result owns entirely; the same payload always gives the same bytes. */
export function encodeEffectPayload(payload: EffectPayload, path = 'effect'): Uint8Array<ArrayBuffer> {
  checkEffect(payload, path);
  const w = new Writer(effectPayloadLength(payload));
  switch (payload.kind) {
    case 'projectile':
      w.u16(payload.records.length);
      for (const template of payload.templates) {
        w.faces(template.faces);
        w.f32(template.vertices);
        w.u32([...template.widthMarkers, template.lengthMarker]);
        w.f64(template.lengthConstant);
      }
      for (const record of payload.records) {
        w.u32([record.selector]);
        w.f32([record.width, record.length, ...record.colour]);
      }
      break;
    case 'missile':
      w.texture(payload.texture);
      w.u16(payload.types.length);
      for (const name of MISSILE_FACES) w.faces(payload.faces[name]);
      for (const name of MISSILE_CONSTANTS) w.f64(payload.constants[name]);
      w.f64(payload.rotationScale);
      w.f32(payload.extraColour);
      for (const { parts, body, fins, element, flag } of payload.types) {
        w.u32([parts]);
        w.f32([body.r0, body.r1, body.length]);
        w.i32(body.segments);
        w.u32([body.colour]);
        for (const fin of fins) {
          w.f32(fin.params);
          w.u32([fin.colour]);
        }
        w.f32([...element, flag]);
      }
      break;
    case 'debris':
      w.texture(payload.texture);
      for (const template of payload.templates) {
        w.faces(template.faces);
        w.f32(template.vertices);
        w.u32(template.perVertex);
      }
      w.f32([...payload.untexturedScales, ...payload.texturedScales, ...payload.untexturedColour, ...payload.texturedColour]);
      break;
  }
  return w.bytes;
}

class Reader {
  private at = 0;
  private readonly view: DataView;
  private readonly path: string;

  constructor(view: DataView, path: string) {
    this.view = view;
    this.path = path;
  }

  /** Claims the next `length` bytes, returning their offset. */
  private take(length: number): number {
    if (this.view.byteLength - this.at < length) invalid(this.path, 'is truncated');
    this.at += length;
    return this.at - length;
  }

  u8(): number { return this.view.getUint8(this.take(1)); }
  u16(): number { return this.view.getUint16(this.take(2), true); }
  u32(): number { return this.view.getUint32(this.take(4), true); }
  i32(): number { return this.view.getInt32(this.take(4), true); }
  f32(): number { return this.view.getFloat32(this.take(4), true); }
  f64(): number { return this.view.getFloat64(this.take(8), true); }

  floats(count: number): Float32Array {
    const start = this.take(count * 4);
    return Float32Array.from({ length: count }, (_, index) => this.view.getFloat32(start + index * 4, true));
  }

  words(count: number): Uint32Array {
    const start = this.take(count * 4);
    return Uint32Array.from({ length: count }, (_, index) => this.view.getUint32(start + index * 4, true));
  }

  colour(): EffectColour {
    return Object.freeze([this.f32(), this.f32(), this.f32()] as const);
  }

  faces(): Uint32Array {
    return this.words(this.u16());
  }

  texture(path: string): AssetId {
    const length = requireInteger(this.u8(), 1, ASSET_ID_LIMITS.totalLength, path);
    return requireTexture(asciiText(bytesAt(this.view, this.take(length), length)), path);
  }

  end(): void {
    if (this.at !== this.view.byteLength) invalid(this.path, 'has trailing bytes');
  }
}

function readProjectile(r: Reader, path: string): ProjectileVisuals {
  const count = requireInteger(r.u16(), 1, EFFECT_LIMITS.effectRecords, `${path}.records`);
  // Property order is the layout order.
  const template = (): ProjectileTemplate => Object.freeze({
    faces: r.faces(),
    vertices: r.floats(S.projectileVertices * 3),
    widthMarkers: r.words(S.widthMarkers),
    lengthMarker: r.u32(),
    lengthConstant: r.f64(),
  });
  const templates = Object.freeze([template(), template()] as const);
  const records = Object.freeze(Array.from({ length: count }, (): ProjectileRecord =>
    Object.freeze({ selector: r.u32(), width: r.f32(), length: r.f32(), colour: r.colour() })));
  return Object.freeze({ kind: 'projectile', templates, records });
}

function readMissile(r: Reader, path: string): MissileVisuals {
  const texture = r.texture(`${path}.texture`);
  const count = requireInteger(r.u16(), 1, EFFECT_LIMITS.missileTypes, `${path}.types`);
  // Property order is the layout order.
  const faces: MissileFaces = Object.freeze({ fin: r.faces(), element: r.faces(), flaggedElement: r.faces(), extra: r.faces() });
  const constants = Object.freeze(Object.fromEntries(MISSILE_CONSTANTS.map(name => [name, r.f64()])) as MissileConstants);
  const rotationScale = r.f64();
  const extraColour = r.colour();
  const types = Object.freeze(Array.from({ length: count }, (_, index): MissileType => {
    const parts = requireInteger(r.u32(), 1, EFFECT_LIMITS.missileParts, `${path}.types[${index}].parts`);
    const body = Object.freeze({ r0: r.f32(), r1: r.f32(), length: r.f32(), segments: r.i32(), colour: r.u32() });
    const fins = Object.freeze(Array.from({ length: parts - 1 }, (): MissileFin =>
      Object.freeze({ params: Object.freeze([r.f32(), r.f32(), r.f32(), r.f32()] as const), colour: r.u32() })));
    const element = Object.freeze([r.f32(), r.f32(), r.f32()] as const);
    return Object.freeze({ parts, body, fins, element, flag: r.f32() });
  }));
  return Object.freeze({ kind: 'missile', texture, types, faces, constants, rotationScale, extraColour });
}

function readDebris(r: Reader, path: string): DebrisVisuals {
  const texture = r.texture(`${path}.texture`);
  const template = (): DebrisTemplate => Object.freeze({
    faces: r.faces(),
    vertices: r.floats(S.debrisVertices * 3),
    perVertex: r.words(S.debrisVertices * 3),
  });
  const templates = Object.freeze([template(), template()] as const);
  const untexturedScales = Object.freeze([r.f32(), r.f32(), r.f32()] as const);
  const texturedScales = Object.freeze([r.f32(), r.f32()] as const);
  return Object.freeze({ kind: 'debris', texture, templates, untexturedScales, texturedScales, untexturedColour: r.colour(), texturedColour: r.colour() });
}

/**
 * Strictly reads a schema 1 effect payload of the given kind into frozen data whose arrays are the caller's own copies.
 * Counts are range-checked and their bytes found present before anything is sized from them; diagnostics name only
 * structural paths.
 */
export function readEffectPayload<K extends EffectKind>(bytes: unknown, schemaVersion: unknown, kind: K, path = 'payload'): EffectOf<K> {
  if (schemaVersion !== EFFECT_PAYLOAD_SCHEMA_VERSION) fail('unsupported-payload-schema', `${path}.schemaVersion`, 'must be effect payload schema 1');
  if (!EFFECT_KINDS.includes(kind)) invalid(`${path}.kind`, 'must be projectile, missile or debris');
  if (!(bytes instanceof Uint8Array)) invalid(path, 'must be a Uint8Array');
  if (isDetached(bytes.buffer)) fail('payload-detached', path, 'was transferred away and can no longer be used');
  const r = new Reader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), path);
  const payload = kind === 'projectile' ? readProjectile(r, path) : kind === 'missile' ? readMissile(r, path) : readDebris(r, path);
  r.end();
  checkEffect(payload, path);
  return payload as EffectOf<K>;
}

/** The images a payload references: exactly its descriptor's dependencies. */
export function effectReferences(payload: EffectPayload): readonly AssetReference[] {
  return Object.freeze(payload.kind === 'projectile' ? [] : [Object.freeze({ id: payload.texture, kind: 'image' as const })]);
}

/** Checks that the descriptor is a `data` Asset of the payload's role whose dependencies are exactly its images. */
export function checkEffectBinding(descriptor: AssetDescriptor, payload: EffectPayload, path = 'asset'): void {
  if (descriptor.kind !== 'data') fail('binding-mismatch', `${path}.kind`, 'must be data');
  if (descriptor.role !== payload.kind) fail('binding-mismatch', `${path}.role`, 'must be the role of the effect payload');
  const expected = effectReferences(payload);
  const { dependencies } = descriptor;
  if (dependencies.length !== expected.length
    || dependencies.some((dependency, index) => dependency.id !== expected[index].id || dependency.kind !== expected[index].kind)) {
    fail('binding-mismatch', `${path}.dependencies`, 'must be exactly the images the effect payload references');
  }
}
