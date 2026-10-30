/**
 * The world layer of projectiles, missiles and fragments (docs/plan/p3/12/spec.md, 弹丸、导弹与碎片, Render State 的消费;
 * docs/original/formats/executable.md, HS7, HS9, PV5, PV6; S-07, AC-10): every drawn entity whose presentation is a
 * projectile, a missile or a discriminator-3 fragment, and every shown discriminator-1/2 fragment of the presentation
 * effects, each drawn as its look (object-surfaces.ts) by a lit model layer of its own (model-lighting-layer.ts), so
 * lights, shades, texels, culling and depth follow the models' rules. P3-12/23 adds it to a run with
 * `FlightRunRender.addLayer`; its resources come from the run's GPU cache within `ObjectSurfaces.looks.plan`.
 *
 * - **Placement** (HS7, HS9): a visual's frame takes its object's pose, with no offset, scale or rotation of its own; a
 *   discriminator-3 part is drawn about the fragment's position, which already holds the DEBRIS offset.
 * - **Core entities:** the scene's visible set at their drawn poses (flight-scene.ts), in ascending ID order.
 * - **Discriminator-1/2 fragments:** those whose display is `shown`, after the Core entities in creation order, each at
 *   the library's orientation of its rows (drawn-pose.ts), mixed like the world's: from the previous tick's end to the
 *   current tick's by the frame's alpha, for a fragment shown at both, unless the frame folds; the previous poses are
 *   those of the last frame drawn at the previous tick, so after a frame that advanced several ticks the current ones are
 *   used. They are drawn under IDs below every Core ID.
 * - **Limit:** the composition calls no world layer in views without a world (map, base), so a fragment's frame keeps
 *   the orientation of the last world frame drawn rather than of the last tick; this differs only where the library
 *   rejects the rows a fragment then has (equal R1 and R2, or one that cannot be normalised), which the spin of proper
 *   rotation rows does not produce.
 * - **Order:** it only matters for equal depths; the order among the original's visuals was not researched.
 */
import type { AssetId } from '../../../content/asset-id.ts';
import type { RenderEntity } from '../../../core/projections/render-state.ts';
import { FRAGMENT_KIND_BIT, type EntityId } from '../../../core/world/entity-table.ts';
import type { CompositionFrame, FlightLayer, LayerPass } from '../composition/flight-layers.ts';
import { ModelLightingLayer } from '../lighting/model-lighting-layer.ts';
import type { FlightPresentationEffects, PresentationFragment } from '../presentation/effects/presentation-effects.ts';
import type { FragmentKey } from '../presentation/presentation-contract.ts';
import type { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { DrawnOrientations, interpolatePose, type DrawnPose } from '../scene/drawn-pose.ts';
import { foldsFrame, type SceneEntity } from '../scene/flight-scene.ts';
import { entityLook, presentationFragmentLook, type ObjectSurfaces } from './object-surfaces.ts';

export interface EffectObjectsInput {
  readonly surfaces: ObjectSurfaces;
  readonly resources: FlightGpuCache;
  /** The run's presentation effects. */
  readonly effects: Pick<FlightPresentationEffects, 'fragments'>;
}

/** The shown discriminator-1/2 fragments' drawn poses at the end of one tick. */
interface FragmentSnapshot {
  readonly tick: number;
  readonly poses: ReadonlyMap<FragmentKey, DrawnPose>;
}

/** A presentation fragment's ID in the drawn set: −1 − its key's number, below every Core ID. */
const fragmentId = (key: FragmentKey): EntityId => -1 - Number(key.slice('fragment:'.length)) as EntityId;

export class EffectObjectsLayer implements FlightLayer {
  readonly slot = 'world' as const;
  readonly #surfaces: ObjectSurfaces;
  readonly #effects: Pick<FlightPresentationEffects, 'fragments'>;
  readonly #models: ModelLightingLayer;
  readonly #orientations = new DrawnOrientations();
  #latest: FragmentSnapshot | null = null;
  #earlier: FragmentSnapshot | null = null;

  constructor({ surfaces, resources, effects }: EffectObjectsInput) {
    this.#surfaces = surfaces;
    this.#effects = effects;
    this.#models = new ModelLightingLayer(surfaces.looks, resources);
  }

  passes(frame: CompositionFrame): readonly LayerPass[] {
    const world = frame.world;
    if (!world) return [];
    const drawn: SceneEntity[] = [];
    for (const scene of world.scene.entities) {
      const look = entityLook(this.#surfaces, scene.entity.presentation);
      if (look !== null) drawn.push({ ...scene, entity: { ...scene.entity, presentation: { type: 'model', model: look } } });
    }
    const { previous, current, alpha } = frame.render;
    const shown = this.#effects.fragments().filter(({ display }) => display === 'shown');
    const latest = this.#remember(current.tick, shown);
    const before = !foldsFrame(previous, current) && this.#earlier?.tick === previous.tick ? this.#earlier.poses : null;
    for (const fragment of shown) {
      const to = latest.get(fragment.key)!;
      const from = before?.get(fragment.key);
      const pose = from === undefined ? to : interpolatePose(from, to, alpha);
      drawn.push({ ...pose, entity: fragmentEntity(fragment.key, presentationFragmentLook(this.#surfaces, fragment), fragment.sourceKindBit, pose) });
    }
    return this.#models.passes({ ...frame, world: { ...world, scene: { ...world.scene, entities: drawn } } });
  }

  /** Keeps the drawn poses of the last two ticks drawn and returns this tick's; a fragment's frame goes once it is not shown. */
  #remember(tick: number, shown: readonly PresentationFragment[]): ReadonlyMap<FragmentKey, DrawnPose> {
    if (this.#latest?.tick === tick) return this.#latest.poses;
    const poses = new Map<FragmentKey, DrawnPose>();
    for (const { key, position, rows } of shown) poses.set(key, Object.freeze({ position, rows: this.#orientations.set(key, rows) }));
    this.#orientations.retain((key) => poses.has(key as FragmentKey));
    this.#earlier = this.#latest;
    this.#latest = { tick, poses };
    return poses;
  }
}

/** A presentation fragment as the lit model layer reads a drawn entity. */
function fragmentEntity(key: FragmentKey, look: AssetId, sourceKindBit: number, { position, rows }: DrawnPose): RenderEntity {
  return {
    id: fragmentId(key), kindBit: FRAGMENT_KIND_BIT, presentation: { type: 'model', model: look }, position, orientation: rows,
    placementSerial: 0, hitShimmerStart: null, explosionStart: null, inWarp: false, sourceKindBit, display: 'shown',
    // Not a Core entity and never in Render State: FA-04's state and speed are placeholders the model layer ignores.
    state: 'active', speed: 0,
  };
}
