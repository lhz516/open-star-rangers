import { readAssetId } from '../../../content/asset-id.ts';
import { DEBRIS_TEXTURE, MISSILE_TEXTURE, syntheticDebris, syntheticMissile, syntheticProjectile } from '../../../content/effects/effects.test-support.ts';
import type { ModelPart, ModelPayload } from '../../../content/models/model-payload.ts';
import { lightingContent, MODEL, squareGeometry, TEXTURE, textureImage } from '../lighting/lighting.test-support.ts';
import type { ObjectContent } from './object-surfaces.ts';

// Code-generated synthetic object inputs; never original data.

export { MODEL };
export const PROJECTILE_VISUALS = readAssetId('data/synthetic-projectile-visuals');
/** A craft model with four list-1 parts, so a pod of it draws parts 0–2. */
export const CRAFT = readAssetId('model/synthetic-craft');
export const DEBRIS_MODEL = readAssetId('model/synthetic-debris');

const part = (sourceFlags: number, colour: readonly [number, number, number], texture: ModelPart['texture'] = null): ModelPart =>
  Object.freeze({ sourceFlags, colour, geometry: 0, texture });

/** List 1 holds parts whose flags (1, 3, 0) are not their quality; part 2 is textured. */
function craftModel(): ModelPayload {
  return Object.freeze<ModelPayload>({
    kind: 'model',
    geometries: [squareGeometry()],
    partLists: [[part(2, [9, 9, 9])], [part(1, [40, 80, 120]), part(3, [200, 10, 10]), part(0, [0, 0, 0], TEXTURE), part(1, [7, 7, 7])], []],
    soundSlots: [null, null, null, null, null],
  });
}

/** MODL 10383's stand-in: three textured list-1 parts and no list 0. */
function debrisModel(): ModelPayload {
  return Object.freeze<ModelPayload>({
    kind: 'model',
    geometries: [squareGeometry()],
    partLists: [[], [part(3, [1, 2, 3], TEXTURE), part(3, [4, 5, 6], TEXTURE), part(3, [7, 8, 9], TEXTURE)], []],
    soundSlots: [null, null, null, null, null],
  });
}

export function objectContent(overrides: Partial<ObjectContent> = {}): ObjectContent {
  const base = lightingContent();
  return {
    ...base,
    models: new Map([...base.models, [CRAFT, craftModel()], [DEBRIS_MODEL, debrisModel()]]),
    images: new Map([...base.images, [MISSILE_TEXTURE, textureImage()], [DEBRIS_TEXTURE, textureImage()]]),
    projectiles: { id: PROJECTILE_VISUALS, visuals: syntheticProjectile() },
    missiles: syntheticMissile(),
    debris: syntheticDebris(),
    debrisModel: DEBRIS_MODEL,
    podModels: new Set([CRAFT]),
    ...overrides,
  };
}
