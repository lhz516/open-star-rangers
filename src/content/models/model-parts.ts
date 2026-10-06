import type { AssetId } from '../asset-id.ts';
import { fail } from '../contract-validation.ts';
import { expandImage, type ExpandedImage } from '../graphics/expand-image.ts';
import { imagePalettes } from '../graphics/graphics-binding.ts';
import type { ImagePayload } from '../graphics/image-payload.ts';
import type { PalettePayload } from '../graphics/palette-payload.ts';
import { MODEL_LIMITS, modelReferences, type ModelColour, type ModelGeometry, type ModelPayload } from './model-payload.ts';

/** A part's base colour, plus its texture when it has one. Textures address UVs with repeat (tiling) on both axes. */
export type PartMaterial =
  | { readonly colour: ModelColour }
  | { readonly colour: ModelColour; readonly texture: AssetId; readonly wrap: 'repeat' };

/** One part's geometry, in stored triangle order, winding and UVs, and its material. */
export interface ModelPartItem extends ModelGeometry {
  readonly material: PartMaterial;
}

/**
 * The parts of source part list `list` (0–2), in stored order. Each call returns new frozen items whose arrays are fresh
 * copies, so changing them never affects the payload or a later call. Triangles are neither culled nor reordered.
 */
export function modelPartItems(model: ModelPayload, list: number, path = 'list'): readonly ModelPartItem[] {
  if (!Number.isInteger(list) || list < 0 || list >= MODEL_LIMITS.partLists) fail('invalid-model-payload', path, 'must be part list 0, 1 or 2');
  return Object.freeze(model.partLists[list].map(({ colour, geometry, texture }): ModelPartItem => {
    const { positions, uvs, normals, indices, cornerShading, shadingSlotCount } = model.geometries[geometry];
    return Object.freeze({
      positions: new Float32Array(positions),
      uvs: new Float32Array(uvs),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices),
      cornerShading: new Uint16Array(cornerShading),
      shadingSlotCount,
      material: Object.freeze(texture === null ? { colour } : { colour, texture, wrap: 'repeat' as const }),
    });
  }));
}

/**
 * Expands every texture the model references through `expandImage`, the project's only palette lookup. `images` must
 * hold exactly those textures and `palettes` exactly the palettes the images reference, keyed by Asset ID; otherwise
 * `binding-mismatch`. Returns a new map from texture ID to RGBA the caller owns.
 */
export function expandModelTextures(
  model: ModelPayload,
  images: ReadonlyMap<AssetId, ImagePayload>,
  palettes: ReadonlyMap<AssetId, PalettePayload>,
): ReadonlyMap<AssetId, ExpandedImage> {
  const textures = modelReferences(model).filter(reference => reference.kind === 'image').map(reference => reference.id);
  if (images.size !== textures.length || textures.some(id => !images.has(id))) {
    fail('binding-mismatch', 'images', 'must be exactly the textures the model references');
  }
  const bound = textures.map(id => ({ id, image: images.get(id)!, palettes: imagePalettes(images.get(id)!) }));
  const needed = new Set(bound.flatMap(texture => texture.palettes));
  if (palettes.size !== needed.size || [...needed].some(id => !palettes.has(id))) {
    fail('binding-mismatch', 'palettes', 'must be exactly the palettes the textures reference');
  }
  return new Map(bound.map(({ id, image, palettes: ids }) =>
    [id, expandImage(image, new Map(ids.map(palette => [palette, palettes.get(palette)!])), `images[${id}]`)]));
}
