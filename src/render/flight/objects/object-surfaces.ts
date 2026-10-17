/**
 * The surfaces of projectiles, missiles and fragments (docs/plan/p3/12/spec.md, 弹丸、导弹与碎片; docs/original/formats/
 * executable.md, HS7, HS8, HS9, LS5, LS6, LS8 and the effect geometry data; S-07, AC-10), prepared once per run from the
 * canonical payloads, without a GPU, as lit parts (model-surfaces.ts) grouped into *looks*: the parts one visual attaches,
 * under an ID the lit model layer reads where it reads a model's.
 *
 * - **Projectile:** the RENS record's procedural geometry (`expandProjectiles`), quality 1: unlit flat.
 * - **Missile:** the type's body and fins (quality 2, flat lit), its extra element when present (quality 1) and its
 *   textured element (quality 1, TEX 10377 with rotation 0's coordinates), in the order `0x4457c` attaches them.
 * - **Fragments:** discriminator 1, one of the two textured debris shapes (quality 2, TEX 10151); discriminators 2 and 3,
 *   list-1 part p of MODL 10383 or of the source model (quality 2, the part's colour and texture), and for the pods of
 *   kinds 1 and 2 parts 0–2. Every list-1 part of every model is prepared, and the three-part look of every model that
 *   has three, since which models are pods is the Core's to say.
 * - **Quality** is the builder's, capped by RENS +0x18 (LS5); 0 (Likely wireframe) is refused as for models.
 * - **Colour** (`0x7a698`): each f32 component clamped to [0, 1], times 255 and rounded half to even; the byte triple is
 *   an untextured shape's part colour, whose ramp it is drawn with (LS4). A textured shape's ramps are its texture's.
 * - **Faces** (HS8, `0x97b14`, `0x7db10`): a face of n corners is drawn as the fan (c₀, c_{k−1}, c_k), k = 2 … n − 1, in
 *   stored order, and every triangle of it takes the face's normal, normalise(normalise(c_{n−2} − c₀) ×
 *   normalise(c_{n−1} − c₀)): the library computes it once per face when the mesh is created and copies it to each of
 *   the face's triangles. Textured shapes carry the cylinder wrap's seam flag on u, so each triangle's u values get the
 *   seam rule.
 * - **References** beyond the payload's records or types, or beyond a model's list-1 parts, are contract errors when
 *   drawn (`binding-mismatch`); the original's clamp of an out-of-range missile type to the last type is not reproduced.
 */
import type { AssetId } from '../../../content/asset-id.ts';
import { fail } from '../../../content/contract-validation.ts';
import { expandDebris, expandMissiles, expandProjectiles, type EffectShape } from '../../../content/effects/expand-effects.ts';
import type { DebrisVisuals, EffectColour, MissileVisuals, ProjectileVisuals } from '../../../content/effects/effect-payload.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import type { ModelColour, ModelPayload } from '../../../content/models/model-payload.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { EntityPresentation } from '../../../core/world/entity-table.ts';
import { faceNormal, roundHalfEven } from '../lighting/lighting-math.ts';
import {
  LitPartBuilder, litPartsPlan, partQuality, type LitPart, type ModelLightingContent, type ModelSurfaces, type PartQuality,
} from '../lighting/model-surfaces.ts';
import type { PresentationFragment } from '../presentation/effects/presentation-effects.ts';
import { seamU } from '../shimmer/shimmer-wraps.ts';

const PATH = 'objects';

/** The builders' qualities (HS7, HS9). */
const UNLIT = 1;
const LIT = 2;

/** A pod (kind 1 or 2, part 0) draws list-1 parts 0, 1 and 2. */
const POD_PARTS = 3;

/** The payloads the object surfaces read, from the run's package. */
export interface ObjectContent extends ModelLightingContent {
  /** `data/projectile-visuals`: the ID projectile presentations name, and its payload. */
  readonly projectiles: { readonly id: AssetId; readonly visuals: ProjectileVisuals };
  readonly missiles: MissileVisuals;
  readonly debris: DebrisVisuals;
  /** `model/debris`, MODL 10383: discriminator 2's parts. Must be one of `models`. */
  readonly debrisModel: AssetId;
}

export interface ObjectSurfaces {
  /** Every look's parts by look ID, for the lit model layer. */
  readonly looks: ModelSurfaces;
  readonly projectileVisuals: AssetId;
  readonly projectileRecords: number;
  readonly missileTypes: number;
  readonly debrisModel: AssetId;
  /** The list-1 part count of every model. */
  readonly listOneParts: ReadonlyMap<AssetId, number>;
}

// Look IDs stand where the lit model layer reads model Asset IDs; none begins with a real model's `model/`.
const lookId = (key: string): AssetId => `object/${key}` as AssetId;
export const projectileLook = (record: number): AssetId => lookId(`projectile/${record}`);
export const missileLook = (type: number): AssetId => lookId(`missile/${type}`);
export const debrisShapeLook = (shape: number): AssetId => lookId(`debris-shape/${shape}`);
export const partLook = (model: AssetId, part: number): AssetId => lookId(`part/${model}/${part}`);
export const podLook = (model: AssetId): AssetId => lookId(`pod/${model}`);

/** `0x7a698`'s byte of one colour component: clamped to [0, 1], times 255, rounded half to even. */
export const colourByte = (component: number): number => roundHalfEven(Math.min(1, Math.max(0, component)) * 255);

const colourBytes = ([r, g, b]: EffectColour): ModelColour => Object.freeze([colourByte(r), colourByte(g), colourByte(b)] as const);

/** The builder's quality capped by the device's RENS +0x18. */
function effectQuality(builder: typeof UNLIT | typeof LIT, deviceByte: number): PartQuality {
  const quality = Math.min(deviceByte, builder);
  if (quality !== 1 && quality !== 2) fail('invalid-record', `${PATH}.settings.deviceByte`, `gives render quality ${quality}; only 1, 2 and 3 are supported`);
  return quality;
}

const vertexAt = (positions: Float32Array, vertex: number): Vec3 =>
  Object.freeze({ x: positions[vertex * 3], y: positions[vertex * 3 + 1], z: positions[vertex * 3 + 2] });

/**
 * The lit part of an effect shape: its fan triangles, one vertex per corner, drawn as the one part of a model with the
 * shape's colour, texture and quality, so its ramps and texture follow the models' rules; the face normals replace the
 * per-triangle ones a model part gets.
 */
function shapePart(builder: LitPartBuilder, shape: EffectShape, quality: PartQuality, path: string): LitPart {
  const vertices: number[] = [];
  const triangleNormals: Vec3[] = [];
  for (const face of shape.faces) {
    const n = face.length;
    const normal = faceNormal(vertexAt(shape.positions, face[0]), vertexAt(shape.positions, face[n - 2]), vertexAt(shape.positions, face[n - 1]));
    for (let k = 2; k < n; k++) {
      vertices.push(face[0], face[k - 1], face[k]);
      triangleNormals.push(normal);
    }
  }
  const corners = vertices.length;
  const positions = new Float32Array(corners * 3);
  vertices.forEach((vertex, corner) => positions.set(shape.positions.subarray(vertex * 3, vertex * 3 + 3), corner * 3));
  const uvs = new Float32Array(corners * 2);
  if (shape.uvs) {
    const source = shape.uvs;
    for (let first = 0; first < corners; first += 3) {
      const u = seamU(source[vertices[first] * 2], source[vertices[first + 1] * 2], source[vertices[first + 2] * 2]);
      for (let corner = 0; corner < 3; corner++) {
        uvs[(first + corner) * 2] = u[corner];
        uvs[(first + corner) * 2 + 1] = source[vertices[first + corner] * 2 + 1];
      }
    }
  }
  const model: ModelPayload = {
    kind: 'model',
    geometries: [{
      positions, uvs, normals: new Float32Array(0), indices: Uint16Array.from(vertices, (_, corner) => corner),
      cornerShading: new Uint16Array(corners), shadingSlotCount: 0,
    }],
    partLists: [[{ sourceFlags: quality, colour: shape.colour ? colourBytes(shape.colour) : [0, 0, 0], geometry: 0, texture: shape.texture }], [], []],
    soundSlots: [null, null, null, null, null],
  };
  const part = builder.part(model, 0, 0, quality, path);
  if (quality === UNLIT) return part;
  const normals = new Float32Array(corners * 3);
  triangleNormals.forEach(({ x, y, z }, triangle) => {
    for (let at = triangle * 9; at < triangle * 9 + 9; at += 3) {
      normals[at] = x;
      normals[at + 1] = y;
      normals[at + 2] = z;
    }
  });
  return Object.freeze({ ...part, normals });
}

/**
 * The looks of every projectile record, missile type, textured debris shape and list-1 part of `content`, under
 * `settings`' lights and device quality. Refuses, before the run, what the lit parts refuse (model-surfaces.ts), a
 * debris model the content lacks or without list-1 parts, and a device quality below 1.
 */
export function prepareObjectSurfaces(content: ObjectContent, settings: SceneSettings): ObjectSurfaces {
  const builder = new LitPartBuilder(content, settings);
  const { deviceByte } = settings;
  const unlit = effectQuality(UNLIT, deviceByte);
  const lit = effectQuality(LIT, deviceByte);
  const looks = new Map<AssetId, readonly LitPart[]>();
  const add = (id: AssetId, parts: readonly LitPart[]): void => {
    looks.set(id, Object.freeze(parts));
  };

  expandProjectiles(content.projectiles.visuals, `${PATH}.projectiles`).forEach((shape, record) =>
    add(projectileLook(record), [shapePart(builder, shape, unlit, `${PATH}.projectiles.records[${record}]`)]));
  expandMissiles(content.missiles, `${PATH}.missiles`).forEach(({ parts, element, extra }, type) => {
    const at = `${PATH}.missiles.types[${type}]`;
    add(missileLook(type), [
      ...parts.map((shape, index) => shapePart(builder, shape, lit, `${at}.parts[${index}]`)),
      ...(extra ? [shapePart(builder, extra, unlit, `${at}.extra`)] : []),
      shapePart(builder, element, unlit, `${at}.element`),
    ]);
  });
  expandDebris(content.debris, `${PATH}.debris`).textured.forEach((shape, index) =>
    add(debrisShapeLook(index), [shapePart(builder, shape, lit, `${PATH}.debris.textured[${index}]`)]));

  const listOneParts = new Map<AssetId, number>();
  for (const [id, model] of content.models) {
    const parts = model.partLists[1].map((_, part) => {
      const path = `${PATH}.models[${id}].partLists[1][${part}]`;
      return builder.part(model, 1, part, partQuality(model, 1, part, deviceByte, path), path);
    });
    listOneParts.set(id, parts.length);
    parts.forEach((part, index) => add(partLook(id, index), [part]));
    if (parts.length >= POD_PARTS) add(podLook(id), parts.slice(0, POD_PARTS));
  }
  if ((listOneParts.get(content.debrisModel) ?? 0) === 0) {
    fail('binding-mismatch', `${PATH}.debrisModel`, `names ${content.debrisModel}, which the content lacks or which has no list-1 parts`);
  }
  return Object.freeze({
    looks: Object.freeze({ lighting: builder.lighting, models: looks, plan: litPartsPlan([...looks.values()].flat()) }),
    projectileVisuals: content.projectiles.id,
    projectileRecords: content.projectiles.visuals.records.length,
    missileTypes: content.missiles.types.length,
    debrisModel: content.debrisModel,
    listOneParts,
  });
}

const isIndex = (value: number, count: number): boolean => Number.isInteger(value) && value >= 0 && value < count;

function unbound(path: string, reason: string): never {
  fail('binding-mismatch', `${PATH}.${path}`, reason);
}

/** The look of a model's list-1 part `part`, or of its parts 0–2. */
function fragmentLook(surfaces: ObjectSurfaces, model: AssetId, part: number, pod: boolean): AssetId {
  const count = surfaces.listOneParts.get(model) ?? unbound('fragment', `names model ${model}, which the content lacks`);
  if (pod) {
    if (part !== 0) unbound('fragment', `draws parts 0–2 for part ${part}; only a part-0 fragment does`);
    return count >= POD_PARTS ? podLook(model) : unbound('fragment', `draws parts 0–2 of model ${model}, which has ${count} list-1 parts`);
  }
  return isIndex(part, count) ? partLook(model, part) : unbound('fragment', `names list-1 part ${part} of model ${model}, which has ${count}`);
}

/** The look of a Core entity's presentation, or null for one this module does not draw. */
export function entityLook(surfaces: ObjectSurfaces, presentation: EntityPresentation): AssetId | null {
  switch (presentation.type) {
    case 'projectile': {
      const { visuals, record } = presentation;
      if (visuals !== surfaces.projectileVisuals) unbound('projectile', `names visuals ${visuals}, not the run's ${surfaces.projectileVisuals}`);
      return isIndex(record, surfaces.projectileRecords) ? projectileLook(record) : unbound('projectile', `names record ${record} of ${surfaces.projectileRecords}`);
    }
    case 'missile':
      return isIndex(presentation.missile, surfaces.missileTypes)
        ? missileLook(presentation.missile)
        : unbound('missile', `names type ${presentation.missile} of ${surfaces.missileTypes}`);
    case 'fragment':
      return fragmentLook(surfaces, presentation.model, presentation.part, presentation.display === 'parts-0-2');
    default:
      return null;
  }
}

/** The look of a discriminator-1/2 fragment: its textured debris shape, or MODL 10383's list-1 part i mod the count. */
export function presentationFragmentLook(surfaces: ObjectSurfaces, { discriminator, shape, part }: Pick<PresentationFragment, 'discriminator' | 'shape' | 'part'>): AssetId {
  if (discriminator === 1) return shape === 0 || shape === 1 ? debrisShapeLook(shape) : unbound('presentationFragment.shape', `is ${shape}, not 0 or 1`);
  if (part === null || !Number.isInteger(part) || part < 0) return unbound('presentationFragment.part', `is ${part}, not a part index`);
  return partLook(surfaces.debrisModel, part % surfaces.listOneParts.get(surfaces.debrisModel)!);
}
