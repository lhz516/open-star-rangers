import { readAssetId, type AssetId } from '../../../content/asset-id.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { ModelPayload } from '../../../content/models/model-payload.ts';
import type { DomainEvent, HitEvent, Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import type { EntityId, Matrix3 } from '../../../core/world/entity-table.ts';
import { lightingContent, litModel, MODEL } from '../lighting/lighting.test-support.ts';
import { IDENTITY, renderState, vec } from '../presentation/presentation.test-support.ts';
import { HitShimmer, type ShimmerTick } from './hit-shimmer.ts';
import { prepareShimmerSurfaces, type ShimmerContent } from './shimmer-surfaces.ts';
import { lightingSettings } from '../lighting/lighting.test-support.ts';

// Code-generated synthetic shimmer inputs; never original data.

export { MODEL };
export const THRESHOLDS = readAssetId('image/synthetic-hit-shimmer');
export const PLAIN_MODEL = readAssetId('model/synthetic-plain');
export const OTHER_MODEL = readAssetId('model/synthetic-other');

/** The player's kind bit (0x383, turning), a wingman's (0x383), kind 0x80's (bounds) and a base's (0xf9c7c). */
export const PLAYER_KIND = 0;
export const WINGMAN_KIND = 1;
export const BOUNDS_KIND = 7;
export const BASE_KIND = 17;
/** A kind of neither family. */
export const OTHER_KIND = 13;

/** 4 × 2 thresholds, the size of the synthetic list-2 texture. */
export function thresholdsImage(overrides: Partial<ImagePayload> = {}): ImagePayload {
  return Object.freeze({
    kind: 'image', width: 4, height: 2, palette: readAssetId('palette/synthetic-unused'), display: 'direct',
    indices: Uint8Array.of(0, 2, 39, 40, 42, 43, 200, 255), mask: null, ...overrides,
  });
}

/** litModel without a list 2. */
export function plainModel(): ModelPayload {
  const model = litModel();
  return Object.freeze<ModelPayload>({ ...model, partLists: [model.partLists[0], model.partLists[1], []] });
}

export function shimmerContent(overrides: Partial<ShimmerContent> = {}): ShimmerContent {
  const base = lightingContent();
  return {
    ...base,
    models: new Map([[MODEL, litModel()], [OTHER_MODEL, litModel()], [PLAIN_MODEL, plainModel()]]),
    thresholds: thresholdsImage(),
    ...overrides,
  };
}

export const shimmerSurfaces = () => prepareShimmerSurfaces(shimmerContent(), lightingSettings());

export interface ShimmerEntityOptions {
  readonly kindBit?: number;
  readonly model?: AssetId;
  readonly display?: RenderEntity['display'];
  readonly inWarp?: boolean;
  readonly position?: Vec3;
  readonly orientation?: Matrix3;
}

export function shimmerEntity(id: number, { kindBit = WINGMAN_KIND, model = MODEL, display = 'shown', inWarp = false, position = vec(0, 0, 50), orientation = IDENTITY }: ShimmerEntityOptions = {}): RenderEntity {
  return Object.freeze({
    id: id as EntityId, kindBit, presentation: Object.freeze({ type: 'model', model }), position, orientation, placementSerial: 0,
    hitShimmerStart: null, explosionStart: null, inWarp, sourceKindBit: null, display, state: 'active', speed: 0,
  });
}

/** The player entity's ID in these tests. */
export const PLAYER = 1;
export const player = (options: ShimmerEntityOptions = {}): RenderEntity => shimmerEntity(PLAYER, { kindBit: PLAYER_KIND, display: 'hidden', ...options });

export interface StateOptions {
  readonly viewMode?: number;
  readonly subMode?: number;
  readonly observed?: number | null;
}

/** Tick `tick` (clock 2 × tick) with `entities`; the player entity is observed unless `observed` says otherwise. */
export const shimmerState = (tick: number, entities: readonly RenderEntity[], { viewMode = 0x0c, subMode = 0, observed = PLAYER }: StateOptions = {}): RenderState =>
  renderState(tick, { entities, viewMode, subMode, observedEntityId: observed });

export interface HitOptions {
  readonly cause?: HitEvent['cause'];
  readonly shieldWasEmpty?: boolean;
  readonly impact?: HitEvent['impact'];
}

export function hit(tick: number, victim: number, { cause = 'projectile', shieldWasEmpty = false, impact = null }: HitOptions = {}): HitEvent {
  return Object.freeze({
    type: 'hit', tick, victimEntityId: victim as EntityId, victimKindBit: 0, victimPosition: vec(0), cause, sourceEntityId: null,
    attacker: { type: 'none' }, damage: 1, gated: false, shield: { before: 10, after: 9 }, hull: { before: 10, after: 10 }, shieldWasEmpty, impact, projectile: null,
  }) as HitEvent;
}

export const impact = (local: Vec3, face: 0 | 1 | 2 | 3 | 4 | 5 = 5): HitEvent['impact'] => Object.freeze({ point: vec(0), local, face });

export const tickOf = (render: RenderState, events: readonly DomainEvent[] = []): ShimmerTick =>
  Object.freeze({ tick: render.tick, render, events: events.map((event) => Object.freeze({ event })) });

/** A random source returning `values` in turn, then failing. */
export function scriptedRandom(...values: number[]): RandSource & { readonly drawn: () => number } {
  let at = 0;
  return {
    next: () => {
      if (at >= values.length) throw new Error('unexpected random draw');
      return values[at++];
    },
    drawn: () => at,
  };
}

/** A HitShimmer over the synthetic shells from tick 0, and a driver that advances one tick at a time. */
export function shimmerRun(random: RandSource = scriptedRandom(0, 0, 0, 0, 0, 0, 0, 0)) {
  const surfaces = shimmerSurfaces();
  const shimmer = new HitShimmer({ models: surfaces.models, initial: shimmerState(0, []), random });
  const advance = (render: RenderState, events: readonly DomainEvent[] = []): void => shimmer.advance([tickOf(render, events)]);
  return { surfaces, shimmer, advance };
}
