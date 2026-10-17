/**
 * The lit surfaces of model parts (docs/original/formats/executable.md, LS4–LS8; mesh.md, native normal slots;
 * docs/plan/p3/12/spec.md, 模型、光照与第 2 列表; AC-07), prepared once per run from the canonical payloads, without a
 * GPU. A part keeps its geometry's stored triangles, winding and UVs (one vertex per triangle corner), and adds per
 * corner the normal its lighting reads, and its ramps.
 *
 * - **Quality** (LS5, LS8): the part's render quality is min(RENS +0x18, the part's), where a list-0 part's is the low
 *   byte of its flag word, a list-1 part's is 2 and a list-2 part's is the first list-2 part's flag byte: 1 unlit (one
 *   shade, the source colour), 2 flat lit with the library's face normal, 3 Gouraud lit with the corner normals.
 *   Qualities 0 (Likely wireframe) and 4 are not used by the shipped data and are refused.
 * - **Corner normals** (mesh.md): a quality-3 corner reads normal [slot], normalised by `0x94938`; the original copies
 *   as many normals as there are slots, so a slot at or beyond the stored normal count reads the face data after them,
 *   which lights nothing: such a corner gets the zero normal, whose lit value is 0.
 * - **Colours** (LS4, LS8): an untextured part's ramp is its part colour's; a textured part has one ramp per entry of
 *   its texture's own palette, the part colour unused, and the texels keep their source indices. Textures are those of
 *   the models group: opaque, shown through their nearest DATA colours, which must be `data`'s. The `TEXTURE` option is
 *   on in the baseline (LS8), so textures are always attached.
 */
import type { AssetId } from '../../../content/asset-id.ts';
import { fail } from '../../../content/contract-validation.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { ModelPart, ModelPayload } from '../../../content/models/model-payload.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { FlightGpuPlan } from '../renderer/flight-gpu-cache.ts';
import { faceNormal, LIT_SHADES, normaliseScaled } from './lighting-math.ts';
import { sceneLighting, shadeRamps, type SceneLighting, type ShadeRamps } from './shade-ramps.ts';

const PATH = 'lighting';

/** The payloads the model surfaces read, from the run's package. */
export interface ModelLightingContent {
  /** The DATA palette: every ramp's target and every texture's nearest-colour target. */
  readonly data: AssetId;
  readonly models: ReadonlyMap<AssetId, ModelPayload>;
  /** At least every texture a model part names. */
  readonly images: ReadonlyMap<AssetId, ImagePayload>;
  /** At least `data` and every palette those textures index. */
  readonly palettes: ReadonlyMap<AssetId, PalettePayload>;
}

export type PartQuality = 1 | 2 | 3;

/** A texture's source indices, row 0 first. */
export interface SurfaceTexture {
  readonly id: AssetId;
  readonly width: number;
  readonly height: number;
  readonly indices: Uint8Array<ArrayBuffer>;
}

export interface SurfaceRamps {
  /** Shared by every part with the same colours and shade count. */
  readonly key: string;
  readonly ramps: ShadeRamps;
}

export interface LitPart {
  readonly quality: PartQuality;
  /** Three per stored triangle. */
  readonly corners: number;
  /** x, y, z per corner, in model space. */
  readonly positions: Float32Array<ArrayBuffer>;
  /** u, v per corner, as stored. */
  readonly uvs: Float32Array<ArrayBuffer>;
  /** The normal the corner's lighting reads: the face normal (quality 2), the slot's normal (3), or zero. */
  readonly normals: Float32Array<ArrayBuffer>;
  readonly ramps: SurfaceRamps;
  readonly texture: SurfaceTexture | null;
}

export interface ModelSurfaces {
  readonly lighting: SceneLighting;
  /** The lit list-0 parts of every model, in stored order. */
  readonly models: ReadonlyMap<AssetId, readonly LitPart[]>;
  /** What drawing them allocates: one geometry per part, one texture per texture and per ramp set. */
  readonly plan: FlightGpuPlan;
}

const qualityByte = (part: ModelPart): number => part.sourceFlags & 0xff;

/** The render quality of part `part` of list `list` with the device's maximum `deviceByte` (RENS +0x18). */
export function partQuality(model: ModelPayload, list: 0 | 1 | 2, part: number, deviceByte: number, path = `${PATH}.part`): PartQuality {
  const own = list === 0 ? qualityByte(model.partLists[0][part]) : list === 1 ? 2 : qualityByte(model.partLists[2][0]);
  const quality = Math.min(deviceByte, own);
  if (quality !== 1 && quality !== 2 && quality !== 3) fail('invalid-record', path, `has render quality ${quality}; only 1, 2 and 3 are supported`);
  return quality;
}

const vertexAt = (positions: Float32Array, vertex: number): Vec3 =>
  Object.freeze({ x: positions[vertex * 3], y: positions[vertex * 3 + 1], z: positions[vertex * 3 + 2] });

/** The texture of `id`, checked: opaque, indices within its own palette, shown through `data`. */
function surfaceTexture(id: AssetId, content: ModelLightingContent, path: string): { readonly texture: SurfaceTexture; readonly palette: PalettePayload } {
  const image = content.images.get(id) ?? fail('binding-mismatch', path, `names texture ${id}, which the content lacks`);
  const palette = content.palettes.get(image.palette) ?? fail('binding-mismatch', path, `names palette ${image.palette}, which the content lacks`);
  if (image.display === 'direct' || image.display.nearest !== content.data) fail('invalid-record', path, `must be shown through the nearest colours of ${content.data}`);
  if (image.mask !== null) fail('invalid-record', path, 'must be opaque');
  const entries = palette.entries.length / 3;
  if (image.indices.some((index) => index >= entries)) fail('palette-index-out-of-range', path, 'must address entries of its own palette');
  // Shared unchanged, unless the payload's buffer is not a plain ArrayBuffer, which a texture upload needs.
  const indices = image.indices.buffer instanceof ArrayBuffer ? image.indices as Uint8Array<ArrayBuffer> : Uint8Array.from(image.indices);
  return { texture: Object.freeze({ id, width: image.width, height: image.height, indices }), palette };
}

/** Builds the lit parts of models, sharing ramps by key. */
export class LitPartBuilder {
  readonly lighting: SceneLighting;
  readonly #content: ModelLightingContent;
  readonly #data: PalettePayload;
  readonly #ramps = new Map<string, SurfaceRamps>();

  constructor(content: ModelLightingContent, settings: SceneSettings) {
    this.lighting = sceneLighting(settings);
    this.#content = content;
    this.#data = content.palettes.get(content.data) ?? fail('binding-mismatch', `${PATH}.data`, `names palette ${content.data}, which the content lacks`);
  }

  /** Every ramp set built so far. */
  get ramps(): readonly SurfaceRamps[] {
    return [...this.#ramps.values()];
  }

  /** Part `part` of list `list` of `model`, drawn at `quality`. */
  part(model: ModelPayload, list: 0 | 1 | 2, part: number, quality: PartQuality, path: string): LitPart {
    const { colour, geometry, texture: textureId } = model.partLists[list][part];
    const { positions, uvs, normals, indices, cornerShading } = model.geometries[geometry];
    const shades = quality === 1 ? 1 : LIT_SHADES;
    const bound = textureId === null ? null : surfaceTexture(textureId, this.#content, `${path}.texture`);
    const rampKey = bound ? `ramps:${bound.texture.id}:${shades}` : `ramps:colour:${colour.join(',')}:${shades}`;
    let ramps = this.#ramps.get(rampKey);
    if (!ramps) {
      const source = bound ? bound.palette.entries : Uint8Array.from(colour);
      ramps = Object.freeze({ key: rampKey, ramps: shadeRamps(source, shades, this.lighting.ambient, this.#data) });
      this.#ramps.set(rampKey, ramps);
    }
    const corners = indices.length;
    const vertexCount = positions.length / 3;
    const cornerPositions = new Float32Array(corners * 3);
    const cornerUvs = new Float32Array(corners * 2);
    const cornerNormals = new Float32Array(corners * 3);
    const setNormal = (corner: number, { x, y, z }: Vec3): void => {
      cornerNormals[corner * 3] = x;
      cornerNormals[corner * 3 + 1] = y;
      cornerNormals[corner * 3 + 2] = z;
    };
    for (let corner = 0; corner < corners; corner++) {
      const vertex = indices[corner];
      for (let axis = 0; axis < 3; axis++) cornerPositions[corner * 3 + axis] = positions[vertex * 3 + axis];
      cornerUvs[corner * 2] = uvs[vertex * 2];
      cornerUvs[corner * 2 + 1] = uvs[vertex * 2 + 1];
    }
    for (let first = 0; first < corners; first += 3) {
      if (quality === 2) {
        const normal = faceNormal(vertexAt(cornerPositions, first), vertexAt(cornerPositions, first + 1), vertexAt(cornerPositions, first + 2));
        for (let corner = first; corner < first + 3; corner++) setNormal(corner, normal);
      } else if (quality === 3) {
        // A slot beyond the stored normals keeps the zero normal.
        for (let corner = first; corner < first + 3; corner++) {
          if (cornerShading[corner] < vertexCount) setNormal(corner, normaliseScaled(vertexAt(normals, cornerShading[corner])));
        }
      }
    }
    return Object.freeze({
      quality, corners, positions: cornerPositions, uvs: cornerUvs, normals: cornerNormals, ramps, texture: bound?.texture ?? null,
    });
  }
}

/** The GPU allocation of drawing `parts` with their textures and ramps, each counted once. */
export function litPartsPlan(parts: Iterable<LitPart>): FlightGpuPlan {
  let vertices = 0;
  const texels = new Map<string, number>();
  for (const { corners, ramps, texture } of parts) {
    vertices += corners;
    texels.set(ramps.key, ramps.ramps.colours * ramps.ramps.shades);
    if (texture) texels.set(`texture:${texture.id}`, texture.width * texture.height);
  }
  return Object.freeze({ texels: [...texels.values()].reduce((sum, count) => sum + count, 0), vertices, indices: 0, renderTargets: 0 });
}

/**
 * The lit list-0 parts of every model of `content`, under `settings`' lights and device quality. Refuses, before the
 * run, lights or qualities outside the researched paths and textures or palettes the content lacks or cannot show.
 */
export function prepareModelSurfaces(content: ModelLightingContent, settings: SceneSettings): ModelSurfaces {
  const builder = new LitPartBuilder(content, settings);
  const models = new Map<AssetId, readonly LitPart[]>();
  for (const [id, model] of content.models) {
    models.set(id, Object.freeze(model.partLists[0].map((_, part) => {
      const path = `${PATH}.models[${id}].partLists[0][${part}]`;
      return builder.part(model, 0, part, partQuality(model, 0, part, settings.deviceByte, `${path}.sourceFlags`), path);
    })));
  }
  return Object.freeze({ lighting: builder.lighting, models, plan: litPartsPlan([...models.values()].flat()) });
}
