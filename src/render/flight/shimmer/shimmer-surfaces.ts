/**
 * The hit shimmer's surfaces (docs/plan/p3/12/spec.md, 模型、光照与第 2 列表, 内容输入与校验; docs/original/formats/
 * executable.md, HS2, HS6; docs/original/formats/textures.md, TEX 11069; AC-08), prepared once per run from the
 * canonical payloads, without a GPU.
 *
 * - **Thresholds:** `image/hit-shimmer`'s stored indices, kept exactly and in stored order; they are compared, never
 *   shown, so its palette and display are not read. It must be opaque, since a transparent pixel's stored value is lost.
 * - **Shell:** each model with a list 2 has one shell, list-2 part 0 (`0x42058`, `0x41f88`): its geometry, drawn unlit at
 *   its render quality (the flag byte, 1 in every list-2 part; another quality is outside the research and refused),
 *   showing its texture's colours (TEX 11073) through their nearest DATA colours (model-surfaces.ts). The texture must
 *   have the thresholds' size (`0x851cc` refuses a second image of another size), so both are read at the same texel.
 * - **Wrap tables:** per shell, the (u, v) of every triangle corner under each wrap of each family (shimmer-wraps.ts),
 *   row by row: a family's wrap w starts at row w × `rowsPerWrap`, corner c lies at column c mod `width`, row c ÷ `width`
 *   further down. Which family a model's visuals use depends on their kinds, so all three are prepared and planned; a
 *   mesh without a finite y extent, which cannot size kind 0x80's wrap, is refused.
 */
import type { AssetId } from '../../../content/asset-id.ts';
import { fail } from '../../../content/contract-validation.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import { LitPartBuilder, litPartsPlan, partQuality, type LitPart, type ModelLightingContent } from '../lighting/model-surfaces.ts';
import type { FlightGpuPlan } from '../renderer/flight-gpu-cache.ts';
import { BAND_TABLE_SIZE, SCREEN_DOOR_TABLE_SIZE } from './shimmer-band.ts';
import { familyWraps, wrappedCornerUvs, type WrapFamily } from './shimmer-wraps.ts';

const PATH = 'shimmer';

/** The widest wrap table row, within every WebGL 2 device's texture size. */
export const WRAP_TABLE_WIDTH = 1024;

export interface ShimmerContent extends ModelLightingContent {
  /** `image/hit-shimmer`, TEX 11069. */
  readonly thresholds: ImagePayload;
}

export interface ShimmerThresholds {
  readonly width: number;
  readonly height: number;
  readonly indices: Uint8Array<ArrayBuffer>;
}

export interface WrapTable {
  readonly wraps: number;
  readonly width: number;
  readonly rowsPerWrap: number;
  /** u, v per texel, `width` × `wraps` × `rowsPerWrap` texels. */
  readonly uvs: Float32Array<ArrayBuffer>;
}

export interface ShimmerShell {
  readonly model: AssetId;
  /** List-2 part 0, unlit. */
  readonly part: LitPart;
  readonly tables: Readonly<Record<WrapFamily, WrapTable>>;
}

export interface ShimmerSurfaces {
  readonly thresholds: ShimmerThresholds;
  /** Every model of the content: its shell, or null without a list 2. */
  readonly models: ReadonlyMap<AssetId, ShimmerShell | null>;
  /** One geometry per shell; its texture, ramps and wrap tables, the thresholds and the band and screen door tables. */
  readonly plan: FlightGpuPlan;
}

function thresholdsOf(image: ImagePayload): ShimmerThresholds {
  const path = `${PATH}.thresholds`;
  if (image.kind !== 'image') fail('invalid-record', path, 'must be an image payload');
  if (image.mask !== null) fail('invalid-record', path, 'must be opaque: a transparent texel loses its stored threshold');
  const indices = image.indices.buffer instanceof ArrayBuffer ? image.indices as Uint8Array<ArrayBuffer> : Uint8Array.from(image.indices);
  return Object.freeze({ width: image.width, height: image.height, indices });
}

function wrapTable(family: WrapFamily, positions: Float32Array, indices: Uint16Array, path: string): WrapTable {
  const wraps = familyWraps(family, positions) ?? fail('invalid-record', `${path}.geometry`, 'has no finite y extent to size kind 0x80\'s wrap');
  const corners = indices.length;
  const width = Math.min(corners, WRAP_TABLE_WIDTH);
  const rowsPerWrap = Math.ceil(corners / width);
  const uvs = new Float32Array(width * rowsPerWrap * wraps.length * 2);
  wraps.forEach((wrap, index) => uvs.set(wrappedCornerUvs(wrap, positions, indices), index * width * rowsPerWrap * 2));
  return Object.freeze({ wraps: wraps.length, width, rowsPerWrap, uvs });
}


/**
 * The shells of every model of `content` with a list 2, under `settings`' device quality. Refuses, before the run,
 * thresholds or shells outside the researched paths and textures or palettes the content lacks or cannot show.
 */
export function prepareShimmerSurfaces(content: ShimmerContent, settings: SceneSettings): ShimmerSurfaces {
  const thresholds = thresholdsOf(content.thresholds);
  const builder = new LitPartBuilder(content, settings);
  const models = new Map<AssetId, ShimmerShell | null>();
  for (const [id, model] of content.models) {
    if (model.partLists[2].length === 0) {
      models.set(id, null);
      continue;
    }
    const path = `${PATH}.models[${id}].partLists[2][0]`;
    const { texture, geometry } = model.partLists[2][0];
    if (texture === null) fail('invalid-record', `${path}.texture`, 'must name a texture: an untextured shell is outside the researched path');
    const quality = partQuality(model, 2, 0, settings.deviceByte, `${path}.sourceFlags`);
    if (quality !== 1) fail('invalid-record', `${path}.sourceFlags`, `has render quality ${quality}; the shimmer shell is researched unlit (1) only`);
    const part = builder.part(model, 2, 0, quality, path);
    const { width, height } = part.texture!;
    if (width !== thresholds.width || height !== thresholds.height) {
      fail('invalid-record', `${path}.texture`, `is ${width} × ${height}; the thresholds are ${thresholds.width} × ${thresholds.height}`);
    }
    const { positions, indices } = model.geometries[geometry];
    const table = (family: WrapFamily): WrapTable => wrapTable(family, positions, indices, path);
    models.set(id, Object.freeze({ model: id, part, tables: Object.freeze({ turning: table('turning'), bounds: table('bounds'), shared: table('shared') }) }));
  }
  const shells = [...models.values()].filter((shell): shell is ShimmerShell => shell !== null);
  const parts = litPartsPlan(shells.map(({ part }) => part));
  // Two floats per texel.
  const tables = shells.flatMap(({ tables }) => Object.values(tables)).reduce((sum, { uvs }) => sum + uvs.length / 2, 0);
  const fixed = thresholds.width * thresholds.height + BAND_TABLE_SIZE.width * BAND_TABLE_SIZE.height + SCREEN_DOOR_TABLE_SIZE.width * SCREEN_DOOR_TABLE_SIZE.height;
  return Object.freeze({
    thresholds,
    models,
    plan: Object.freeze({ texels: parts.texels + tables + fixed, vertices: parts.vertices, indices: 0, renderTargets: 0 }),
  });
}
