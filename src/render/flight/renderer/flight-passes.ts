/**
 * The drawing passes of a run (docs/plan/p3/12/spec.md: 画面合成与 P3-13 接口, 渲染器生命周期, Render State 的消费, 技术决定
 * 1, 5 and 7; docs/original/formats/executable.md, FC2): the layers of P3-12/17–22 and 31 and the screen flash's stage,
 * added to one run's composition in the slots of FC2, and the per-tick state they draw from.
 *
 * - **Preparation:** once per package (`prepareFlightContent`), without a GPU: the lit model surfaces, the hit shimmer's
 *   shells and the object looks under the package's scene settings, every explosion animation's frames (images shown
 *   directly under DATA, all of the first frame's size) and the nebula images (128 × 128, opaque, shown directly under
 *   a palette of the content), and the run's whole GPU plan. Content the passes cannot draw, a flash record outside the
 *   researched domain or a plan over budget refuses the start before anything is allocated.
 * - **Slots (FC2):** nebula; star field; speed dust; world: lit models, then the hit shimmer's shells, then projectiles,
 *   missiles and fragments; explosion sprites; Warp effect. The cockpit slot is P3-13's. The screen flash replaces the
 *   composition's copy, so it changes the whole 4:3 picture. Which slots a view draws is the composition's (map, base
 *   and 0x13 draw no world; a view P3 does not draw is the scene's `unsupported-view`).
 * - **Randomness:** one presentation random source per run, the presentation module's: its EXPL subset and choices, the
 *   nebula start, the shimmer's wrap draws, the flash draws, the speed dust and the Warp effect all draw from it, so no
 *   second stream of the same seed exists. Only the support and mapping of each draw follow the original, not its
 *   order (技术决定 5). The star table uses no run randomness (31).
 * - **Ticks:** each successful Core tick steps the shimmer, the flash, the speed dust and the Warp effect, in that order,
 *   right after the presentation module advanced by the same tick and before the next tick and the frame's drawing, so
 *   the draws do not depend on how ticks are grouped into frames (AC-17); a frame without a tick steps nothing and
 *   draws the latest state again.
 *
 * Every GPU resource comes from the run's cache within the plan, so the run's end releases it; `dispose` removes the
 * layers and the screen stage and stops the sprites' tick tracking.
 */
import type { TickOutput } from '../../../app/runtime/game-runtime.ts';
import type { AssetId } from '../../../content/asset-id.ts';
import { fail } from '../../../content/contract-validation.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import { attemptAll, runCleanup } from '../../scene/cleanup.ts';
import { FLASH_SCREEN_GPU_PLAN, FlashScreenStage } from '../flash/flash-screen-stage.ts';
import { checkFlashRecords, createScreenFlashes } from '../flash/screen-flash.ts';
import { prepareModelSurfaces, type ModelSurfaces } from '../lighting/model-surfaces.ts';
import { ModelLightingLayer } from '../lighting/model-lighting-layer.ts';
import { NEBULA_IMAGE_SIZE } from '../nebula/nebula-blit.ts';
import { createNebulaLayer, NEBULA_GPU_PLAN } from '../nebula/nebula-layer.ts';
import { selectNebulaImages } from '../nebula/nebula-selection.ts';
import { EffectObjectsLayer } from '../objects/effect-objects-layer.ts';
import { prepareObjectSurfaces, type ObjectContent, type ObjectSurfaces } from '../objects/object-surfaces.ts';
import type { FlightPresentationEffects } from '../presentation/effects/presentation-effects.ts';
import type { PresentationContent } from '../presentation/explosion-selection.ts';
import type { FlightPresentation } from '../presentation/flight-presentation.ts';
import type { PresentationCamera } from '../presentation/presentation-contract.ts';
import { HitShimmer } from '../shimmer/hit-shimmer.ts';
import { HitShimmerLayer } from '../shimmer/hit-shimmer-layer.ts';
import { prepareShimmerSurfaces, type ShimmerSurfaces } from '../shimmer/shimmer-surfaces.ts';
import { ExplosionSprites, explosionSpritesGpuPlan } from '../sprites/explosion-sprites.ts';
import { createSpeedDustLayer, createStarFieldLayer, SPEED_DUST_GPU_PLAN, STAR_FIELD_GPU_PLAN } from '../starfield/starfield-layers.ts';
import { createWarpTunnelLayer, WARP_TUNNEL_GPU_PLAN } from '../warp/warp-tunnel-layer.ts';
import { addGpuPlans, checkGpuPlan, type FlightGpuPlan } from './flight-gpu-cache.ts';
import type { FlightRunRender } from './flight-renderer.ts';

const PATH = 'flightPasses';

/** The decoded payloads the passes draw, from the run's package. */
export interface FlightPassContent extends ObjectContent {
  /** `image/hit-shimmer`, TEX 11069. */
  readonly thresholds: ImagePayload;
}

/** What a run of one package is drawn from. */
export interface FlightRunContent {
  readonly presentation: PresentationContent;
  /** `data/scene-settings`. */
  readonly settings: SceneSettings;
  /**
   * The payloads of the passes; `images` holds at least every texture, explosion frame and nebula image the content
   * names, `palettes` every palette they index and `data`.
   */
  readonly passes: FlightPassContent;
}

/** `FlightRunContent` checked and prepared for drawing, once per package. */
export interface PreparedFlightContent extends FlightRunContent {
  readonly models: ModelSurfaces;
  readonly shimmer: ShimmerSurfaces;
  readonly objects: ObjectSurfaces;
  /** The DATA palette, `passes.palettes`' entry of `passes.data`. */
  readonly palette: PalettePayload;
  /** Every explosion animation's frames in display order, by the animation's Asset ID. */
  readonly animations: ReadonlyMap<AssetId, readonly ImagePayload[]>;
  /** What a run's passes allocate in all, besides the composition's own. */
  readonly plan: FlightGpuPlan;
}

function imageOf(images: ReadonlyMap<AssetId, ImagePayload>, id: AssetId, path: string): ImagePayload {
  return images.get(id) ?? fail('binding-mismatch', path, `names image ${id}, which the content lacks`);
}

/** An animation's frames: shown directly under DATA, each of the first frame's size, as explosion-sprites.ts draws them. */
function animationFrames({ images, data }: FlightPassContent, id: AssetId, frames: readonly { readonly id: AssetId }[]): readonly ImagePayload[] {
  const path = `${PATH}.animations[${id}]`;
  if (frames.length === 0) fail('invalid-record', `${path}.frames`, 'must hold at least one frame');
  const checked = frames.map(({ id: frame }, at) => imageOf(images, frame, `${path}.frames[${at}]`));
  const [{ width, height }] = checked;
  checked.forEach((image, at) => {
    if (image.display !== 'direct' || image.palette !== data) fail('invalid-record', `${path}.frames[${at}]`, 'must be shown directly under the DATA palette');
    if (image.width !== width || image.height !== height) fail('invalid-record', `${path}.frames[${at}]`, 'must have the size of the first frame');
  });
  return Object.freeze(checked);
}

/** A nebula image: 128 × 128, opaque and shown directly under a palette of the content, as nebula-layer.ts draws it. */
function checkNebulaImage({ images, palettes }: FlightPassContent, id: AssetId, path: string): void {
  const image = imageOf(images, id, path);
  if (image.width !== NEBULA_IMAGE_SIZE || image.height !== NEBULA_IMAGE_SIZE) fail('invalid-record', path, `must be ${NEBULA_IMAGE_SIZE} × ${NEBULA_IMAGE_SIZE}`);
  if (image.display !== 'direct' || image.mask !== null) fail('invalid-record', path, 'must be opaque and shown directly');
  if (!palettes.has(image.palette)) fail('binding-mismatch', `${path}.palette`, `names palette ${image.palette}, which the content lacks`);
}

/**
 * Prepares `content` for drawing. Throws, before any allocation, what a pass refuses of the content or the settings
 * (a ContentContractError or a FlightRenderError) and `render-capacity` for a plan over budget.
 */
export function prepareFlightContent(content: FlightRunContent): PreparedFlightContent {
  const { presentation, settings, passes } = content;
  checkFlashRecords(settings.screenFlashes);
  const models = prepareModelSurfaces(passes, settings);
  const shimmer = prepareShimmerSurfaces(passes, settings);
  const objects = prepareObjectSurfaces(passes, settings);
  const animations = new Map<AssetId, readonly ImagePayload[]>();
  for (const [id, { frames }] of presentation.animations) animations.set(id, animationFrames(passes, id, frames));
  presentation.nebula.images.forEach(({ id }, at) => { checkNebulaImage(passes, id, `${PATH}.nebula.images[${at}]`); });
  const palette = passes.palettes.get(passes.data) ?? fail('binding-mismatch', `${PATH}.data`, `names palette ${passes.data}, which the content lacks`);
  const plan = addGpuPlans(
    models.plan, shimmer.plan, objects.looks.plan, NEBULA_GPU_PLAN, STAR_FIELD_GPU_PLAN, SPEED_DUST_GPU_PLAN, WARP_TUNNEL_GPU_PLAN,
    explosionSpritesGpuPlan({ explosions: presentation.explosions, animations }), FLASH_SCREEN_GPU_PLAN,
  );
  checkGpuPlan(plan);
  return Object.freeze({ ...content, models, shimmer, objects, palette, animations, plan });
}

export interface FlightPassesInput {
  readonly content: PreparedFlightContent;
  readonly render: FlightRunRender;
  readonly presentation: FlightPresentation;
  readonly effects: FlightPresentationEffects;
  /** The run's presentation random source, the presentation module's own. */
  readonly random: RandSource;
  /** The run's tick-0 Render State. */
  readonly initial: RenderState;
}

/** A run's passes on its composition. */
export interface FlightPasses {
  /** Steps every pass by one successful tick, right after the presentation module advanced by it to `camera`. */
  step(output: TickOutput, camera: PresentationCamera): void;
  /** Removes the layers and the screen stage; attempts every step, throws an AggregateError of the failures; idempotent. */
  dispose(): void;
}

/** Adds the run's passes to `render`'s composition; the resources of a layer are acquired as it is created. */
export function attachFlightPasses({ content, render, presentation, effects, random, initial }: FlightPassesInput): FlightPasses {
  const { resources: cache } = render;
  const { passes, settings, palette } = content;
  const removals: (() => void)[] = [];
  const add = <Layer extends Parameters<FlightRunRender['addLayer']>[0]>(layer: Layer): Layer => {
    removals.push(render.addLayer(layer));
    return layer;
  };
  const dispose = (): void => { runCleanup(removals.splice(0).reverse(), 'Flight passes cleanup failed'); };
  try {
    const images = selectNebulaImages(content.presentation.nebula, random).map(({ id }) => passes.images.get(id)!);
    add(createNebulaLayer({ cache, images, palettes: passes.palettes }));
    add(createStarFieldLayer({ cache, palette }));
    const dust = add(createSpeedDustLayer({ cache, palette, random }));
    add(new ModelLightingLayer(content.models, cache));
    const shimmer = new HitShimmer({ models: content.shimmer.models, initial, random });
    add(new HitShimmerLayer(content.shimmer, shimmer, cache));
    add(new EffectObjectsLayer({ surfaces: content.objects, resources: cache, effects }));
    const sprites = add(new ExplosionSprites({
      presentation, explosions: content.presentation.explosions, animations: content.animations, palette: { id: passes.data, payload: palette }, resources: cache,
    }));
    removals.push(() => { sprites.dispose(); });
    const warp = add(createWarpTunnelLayer({ cache, random }));
    const flash = createScreenFlashes({ records: settings.screenFlashes, random });
    removals.push(render.setScreen(new FlashScreenStage({ resources: cache, flash })));
    const step = (output: TickOutput, camera: PresentationCamera): void => {
      const { tick, clock, render: state, events } = output;
      shimmer.advance([output]);
      flash.step({ tick, clock, render: state, events: events.map(({ event }) => event), explosionFlashes: effects.flashRequests(tick) });
      dust.step({ render: state, events, camera });
      warp.step(state);
    };
    return Object.freeze({ step, dispose });
  } catch (cause) {
    const errors = attemptAll(removals.splice(0).reverse());
    if (errors.length > 0) throw new RollbackError(cause, errors, 'Flight passes creation and cleanup failed');
    throw cause;
  }
}
