import { readAssetId } from '../../../content/asset-id.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { ModelGeometry, ModelPart, ModelPayload } from '../../../content/models/model-payload.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import type { EntityId, EntityPresentation, Matrix3 } from '../../../core/world/entity-table.ts';
import { TEXTURE, textureImage } from '../lighting/lighting.test-support.ts';
import { IDENTITY, renderState, vec } from '../presentation/presentation.test-support.ts';
import { thresholdsImage } from '../shimmer/shimmer.test-support.ts';
import type { FlightRunContent } from './flight-passes.ts';
import { flightRunContent } from './flight-run.test-support.ts';

// Code-generated synthetic scenes for the browser regression of the flight renderer (P3-12/25): the run content of the
// pass integration tests with a few models whose pictures a test can predict, and Render State builders for them. The
// browser entry (flight-scenes-entry.test-support.ts) draws them through the real renderer on a real WebGL 2 surface;
// the E2E tests compute the expected pixels independently. Never original data.

/** A flat-shaded untextured quad (quality 2). */
export const FLAT_MODEL = readAssetId('model/e2e-flat');
/** A flat-shaded quad textured with the lighting tests' 4 × 2 texture (quality 2). */
export const TEXTURED_MODEL = readAssetId('model/e2e-textured');
/** An unlit quad textured with the same texture (quality 1). */
export const UNLIT_MODEL = readAssetId('model/e2e-unlit');
/** A flat untextured quad whose list-2 shell is the same quad, textured with one colour. */
export const SHIMMER_MODEL = readAssetId('model/e2e-shimmer');
/** The shell texture: every texel is entry 1 of the lighting texture palette, (40, 200, 40). */
export const SHIMMER_TEXTURE = readAssetId('image/e2e-shimmer');

/** Every model's list-0 colour, as bytes. */
export const FLAT_COLOUR = Object.freeze([200, 120, 40] as const);
export const SHIMMER_BASE_COLOUR = Object.freeze([60, 60, 200] as const);
/** The shell texture's palette entry, an index into TEXTURE_COLOURS. */
export const SHIMMER_TEXEL = 1;
/** Every threshold of the run's hit-shimmer image, so a band shows on all of a shell at once. */
export const SHIMMER_THRESHOLD = 20;

/**
 * The quad −1…1 on the model's xy plane, uv (0, 0) at (−1, −1) and (1, 1) at (1, 1); both triangles face −z, the side a
 * camera with the identity rows sees of a model in front of it with the identity rows.
 */
export function quadGeometry(): ModelGeometry {
  return {
    positions: Float32Array.of(-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0),
    uvs: Float32Array.of(0, 0, 1, 0, 1, 1, 0, 1),
    normals: Float32Array.of(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1),
    indices: Uint16Array.of(0, 2, 1, 0, 3, 2),
    cornerShading: Uint16Array.of(0, 2, 1, 0, 3, 2),
    shadingSlotCount: 4,
  };
}

const part = (quality: number, colour: readonly [number, number, number], texture: ModelPart['texture'] = null): ModelPart =>
  Object.freeze({ sourceFlags: quality, colour, geometry: 0, texture });

const quadModel = (lists: readonly (readonly ModelPart[])[]): ModelPayload => Object.freeze<ModelPayload>({
  kind: 'model',
  geometries: [quadGeometry()],
  partLists: [lists[0] ?? [], lists[1] ?? [], lists[2] ?? []],
  soundSlots: [null, null, null, null, null],
});

/** The 4 × 2 shell texture of one colour. */
const shimmerTexture = (): ImagePayload => textureImage({ indices: new Uint8Array(8).fill(SHIMMER_TEXEL) });

/**
 * The pass integration content (flightRunContent) with the scene models, the shell texture and thresholds of one value.
 * Everything else, the nebula list, the explosion animations, the projectile, missile and debris records and the
 * scene settings (RUN_SETTINGS), is as there.
 */
export function flightSceneContent(): FlightRunContent {
  const base = flightRunContent();
  const models = new Map(base.passes.models);
  models.set(FLAT_MODEL, quadModel([[part(2, [...FLAT_COLOUR])]]));
  models.set(TEXTURED_MODEL, quadModel([[part(2, [0, 0, 0], TEXTURE)]]));
  models.set(UNLIT_MODEL, quadModel([[part(1, [0, 0, 0], TEXTURE)]]));
  models.set(SHIMMER_MODEL, quadModel([[part(2, [...SHIMMER_BASE_COLOUR])], [], [part(1, [255, 255, 255], SHIMMER_TEXTURE)]]));
  const images = new Map(base.passes.images);
  images.set(SHIMMER_TEXTURE, shimmerTexture());
  return {
    ...base,
    passes: { ...base.passes, models, images, thresholds: thresholdsImage({ indices: new Uint8Array(8).fill(SHIMMER_THRESHOLD) }) },
  };
}

/** The observed player's entity ID in every scene. */
export const SCENE_PLAYER = 1;

export interface SceneEntityOptions {
  readonly kindBit?: number;
  readonly orientation?: Matrix3;
  readonly display?: RenderEntity['display'];
  readonly hitShimmerStart?: number | null;
  readonly explosionStart?: number | null;
}

export interface ObjectEntityOptions extends SceneEntityOptions {
  readonly sourceKindBit?: number | null;
}

/** An entity of any presentation at `position`; a wingman's kind (1) unless `kindBit` says otherwise. */
export function sceneEntity(id: number, presentation: EntityPresentation, position: Vec3, { kindBit = 1, orientation = IDENTITY, display = 'shown', hitShimmerStart = null, explosionStart = null, sourceKindBit = null }: ObjectEntityOptions = {}): RenderEntity {
  return Object.freeze({
    id: id as EntityId, kindBit, presentation: Object.freeze(presentation), position, orientation,
    placementSerial: 0, hitShimmerStart, explosionStart, inWarp: false, sourceKindBit, display, state: 'active', speed: 0,
  });
}

/** A model entity of `model` at `position`. */
export const modelEntity = (id: number, model: string, position: Vec3, options: SceneEntityOptions = {}): RenderEntity =>
  sceneEntity(id, { type: 'model', model: readAssetId(model) }, position, options);

/** The observed player, kind 0, at `position` with `orientation`; F1 never draws it, so it is hidden unless `display`. */
export const scenePlayer = (position: Vec3 = vec(0), orientation: Matrix3 = IDENTITY, display: RenderEntity['display'] = 'hidden'): RenderEntity =>
  modelEntity(SCENE_PLAYER, FLAT_MODEL, position, { kindBit: 0, orientation, display });

export interface SceneStateOptions {
  readonly viewMode?: number;
  readonly subMode?: number;
  readonly speedShare?: number;
  readonly warp?: RenderState['warp'];
}

/** Tick `tick` (clock 2 × tick) of a scene observed from the player, which must be among `entities`. */
export function sceneState(tick: number, entities: readonly RenderEntity[], { viewMode = 0x0c, subMode = 0, speedShare = 0, warp = null }: SceneStateOptions = {}): RenderState {
  return Object.freeze({ ...renderState(tick, { viewMode, subMode, observedEntityId: SCENE_PLAYER, entities }), speedShare, warp });
}
