import { describe, expect, it, vi } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { ViewSwitchedEvent } from '../../../core/contracts/domain-events.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import { RandStream } from '../../../core/rules/original-random.ts';
import { BASE_VIEW_MODE, MAP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import { RecordingSurface, type PassRecord } from '../../scene/render-surface.test-support.ts';
import { COMPOSITION_GPU_PLAN } from '../composition/flight-composition.ts';
import { FLASH_SCREEN_GPU_PLAN } from '../flash/flash-screen-stage.ts';
import { NEBULA_GPU_PLAN } from '../nebula/nebula-layer.ts';
import { MODEL, PROJECTILE_VISUALS } from '../objects/objects.test-support.ts';
import { explosionStarted, renderEntity, renderState, tickInput, vec } from '../presentation/presentation.test-support.ts';
import { hit, player, PLAYER, shimmerEntity } from '../shimmer/shimmer.test-support.ts';
import { explosionSpritesGpuPlan } from '../sprites/explosion-sprites.ts';
import { SPEED_DUST_GPU_PLAN, STAR_FIELD_GPU_PLAN } from '../starfield/starfield-layers.ts';
import { WARP_TUNNEL_GPU_PLAN } from '../warp/warp-tunnel-layer.ts';
import { cameraAt, STRAIGHT_PATH, warpState } from '../warp/warp.test-support.ts';
import type { FlightGpuCounts, FlightGpuPlan } from './flight-gpu-cache.ts';
import { prepareFlightContent } from './flight-passes.ts';
import { FlightRenderError } from './flight-render-error.ts';
import { createFlightRenderer } from './flight-renderer.ts';
import { wireFlightRun } from './flight-run.ts';
import { BINDING, fakeRun, flightRunContent, preparedContent, RUN_SETTINGS } from './flight-run.test-support.ts';

// P3-12/23 (Node, recording surface): every pass wired into a run's composition, in the layer order of FC2 and the
// view's selection, with the run's GPU resources within its plan and released to zero.

/** A pass by what it draws: its scene's name, else its objects' names, else the clear it is. */
const label = (pass: PassRecord): string =>
  pass.scene.name || pass.objects.map(({ name }) => name).join('+') || (pass.target ? 'clear-image' : 'clear-canvas');

const SHIP = 2;
const PROJECTILE = 3;
const EXPLOSION = 4;

const projectile = (): RenderEntity => Object.freeze({
  ...renderEntity(PROJECTILE, { position: vec(0, 0, 60) }), kindBit: 21,
  presentation: Object.freeze({ type: 'projectile', visuals: PROJECTILE_VISUALS, record: 0 }),
}) as RenderEntity;

/** The player (observed), a ship ahead with a hit shimmer shell, a projectile and, from tick 1, a missile's explosion. */
function flightState(tick: number, { viewMode = 0x0c, subMode = 0 } = {}): RenderState {
  const entities = [
    player(), shimmerEntity(SHIP, { position: vec(0, 0, 100) }), projectile(),
    ...(tick >= 1 ? [renderEntity(EXPLOSION, { explosion: 'large', position: vec(5, 0, 120) })] : []),
  ];
  return Object.freeze({ ...renderState(tick, { viewMode, subMode, observedEntityId: PLAYER, entities }), speedShare: 50 });
}

/** Tick 1: the explosion starts (a missile's, to which the presentation effects add nothing), the ship and the player are hit. */
const firstTick = () => tickInput(flightState(1), [{ ...explosionStarted(1, EXPLOSION, 'large', vec(5, 0, 120)), sourceKindBit: 20 }, hit(1, SHIP), hit(1, PLAYER)]);

const F1_LAYERS = [
  'clear-image', 'flight-nebula', 'flight-starField', 'flight-speedDust', 'lit-models', 'hit-shimmer', 'lit-models',
  'explosion-sprite-0', 'explosion-sprite-copy', 'clear-canvas', 'flight-screen-flash',
];

function setup() {
  const surface = new RecordingSurface();
  const renderer = createFlightRenderer({ ownerId: 1, surface, reportError: () => undefined });
  surface.resize();
  return { surface, renderer };
}

function wired(content = preparedContent(), runId = 1) {
  const parts = setup();
  const fake = fakeRun(runId);
  const wiring = wireFlightRun(fake.run, { renderer: parts.renderer, binding: { ...BINDING, runId }, content, seed: 7 });
  return { ...parts, ...wiring, fake, content };
}

const plus = (a: FlightGpuPlan, b: FlightGpuPlan): FlightGpuPlan => ({
  texels: a.texels + b.texels, vertices: a.vertices + b.vertices, indices: a.indices + b.indices, renderTargets: a.renderTargets + b.renderTargets,
});

function expectWithin(counts: FlightGpuCounts, plan: FlightGpuPlan): void {
  expect(counts.texels).toBeLessThanOrEqual(plan.texels);
  expect(counts.vertices).toBeLessThanOrEqual(plan.vertices);
  expect(counts.indices).toBeLessThanOrEqual(plan.indices);
  expect(counts.renderTargets).toBeLessThanOrEqual(plan.renderTargets);
}

const lastFrame = (surface: RecordingSurface) => surface.frames.at(-1)!;
const flashUniforms = (surface: RecordingSurface) =>
  (lastFrame(surface).at(-1)!.objects[0].material as unknown as { uniforms: Record<string, { value: number }> }).uniforms;

describe('flight passes', () => {
  it('prepares once: the passes\' surfaces and frames, and a plan of every pass\'s own', () => {
    const content = preparedContent();
    const { presentation } = content;
    const expected = [
      content.models.plan, content.shimmer.plan, content.objects.looks.plan, NEBULA_GPU_PLAN, STAR_FIELD_GPU_PLAN, SPEED_DUST_GPU_PLAN,
      WARP_TUNNEL_GPU_PLAN, explosionSpritesGpuPlan({ explosions: presentation.explosions, animations: content.animations }), FLASH_SCREEN_GPU_PLAN,
    ].reduce(plus);
    expect(content.plan).toEqual(expected);
    expect(content.plan.renderTargets + COMPOSITION_GPU_PLAN.renderTargets).toBe(2);
    expect([...content.animations.keys()]).toEqual([...presentation.animations.keys()]);
    for (const [id, frames] of content.animations) {
      expect(frames).toEqual(presentation.animations.get(id)!.frames.map(({ id: frame }) => content.passes.images.get(frame)));
    }
  });

  it('refuses, before the run, content and settings the passes cannot draw', () => {
    const base = flightRunContent();
    const without = (id: string) => {
      const images = new Map(base.passes.images);
      images.delete(id as never);
      return { ...base, passes: { ...base.passes, images } };
    };
    const [frame] = [...base.presentation.animations.values()][0].frames;
    expect(() => prepareFlightContent(without(frame.id))).toThrow(ContentContractError);
    expect(() => prepareFlightContent(without(base.presentation.nebula.images[0].id))).toThrow(ContentContractError);
    const replaced = (id: string, change: Partial<ImagePayload>) => {
      const images = new Map(base.passes.images);
      images.set(id as never, { ...images.get(id as never)!, ...change });
      return { ...base, passes: { ...base.passes, images } };
    };
    const second = [...base.presentation.animations.values()][0].frames[1];
    expect(() => prepareFlightContent(replaced(second.id, { width: 4 }))).toThrow(expect.objectContaining({ reason: 'must have the size of the first frame' }));
    expect(() => prepareFlightContent(replaced(frame.id, { display: { nearest: base.passes.data } }))).toThrow(ContentContractError);
    const nebula = base.presentation.nebula.images[0].id;
    expect(() => prepareFlightContent(replaced(nebula, { width: 64, indices: new Uint8Array(64 * 128) }))).toThrow(ContentContractError);
    expect(() => prepareFlightContent(replaced(nebula, { mask: new Uint8Array(16 * 128) }))).toThrow(ContentContractError);
    const palettes = new Map(base.passes.palettes);
    palettes.delete(base.passes.data);
    expect(() => prepareFlightContent({ ...base, passes: { ...base.passes, palettes } })).toThrow(ContentContractError);
    const flashes = RUN_SETTINGS.screenFlashes.map((flash, at) => (at === 1 ? { ...flash, level: 64 } : flash)) as unknown as typeof RUN_SETTINGS.screenFlashes;
    expect(() => prepareFlightContent({ ...base, settings: { ...RUN_SETTINGS, screenFlashes: flashes } })).toThrow(expect.objectContaining({ path: 'flash.screenFlashes[1].level' }));
    expect(() => prepareFlightContent({ ...base, settings: { ...RUN_SETTINGS, lightType3Colour: [0, 0, 0] } })).toThrow(ContentContractError);
    // A player or wingman model whose pod could not draw parts 0–2 (AC-03, AC-10).
    expect(() => prepareFlightContent({ ...base, passes: { ...base.passes, podModels: new Set([MODEL]) } })).toThrow(expect.objectContaining({ path: `objects.podModels[${MODEL}]` }));
  });

  it('draws an F1 frame in FC2 order, the world in its viewport, and flashes the whole picture after a hit on the player', () => {
    const { surface, render, content, fake } = wired();
    fake.deliver([firstTick()]);
    fake.deliver([tickInput(flightState(2)), tickInput(flightState(3))], 0.5);
    expect(surface.frames).toHaveLength(2);
    const frame = lastFrame(surface);
    expect(frame.map(label)).toEqual(F1_LAYERS);
    // The game image is cleared, colour and depth; only the world's passes are limited to the F1 viewport.
    expect(frame[0]).toMatchObject({ clearColor: true, clearDepth: true, scissor: null });
    const world = frame.filter(({ scissor }) => scissor !== null);
    expect(world.map(label)).toEqual(['lit-models', 'hit-shimmer', 'lit-models']);
    expect(world[0].scissor).toEqual({ x: 0, y: 0, width: 640, height: 316 });
    expect(world[0].objects.map(({ name }) => name)).toEqual(['model/synthetic:0', 'model/synthetic:1', 'model/synthetic:2']);
    expect(world[1].objects).toHaveLength(1);
    expect(world[2].objects.map(({ name }) => name)).toEqual(['object/projectile/0:0']);
    // The screen flash draws the game image onto the canvas, after the canvas is cleared.
    expect(frame.at(-1)!.target).toBeNull();
    expect(flashUniforms(surface).add.value).toBeGreaterThan(0);
    expectWithin(render.resources.counts(), plus(content.plan, COMPOSITION_GPU_PLAN));
    expect(render.resources.counts().renderTargets).toBe(2);
  });

  it('draws a Warp frame without nebula or sprites, the speed dust after the world, then the Warp effect', () => {
    const { surface, fake } = wired();
    fake.deliver([firstTick()]);
    const observed = cameraAt(9000);
    const state = (tick: number): RenderState => Object.freeze({ ...warpState(tick, 1, STRAIGHT_PATH, observed), speedShare: 50 });
    fake.deliver([tickInput(state(2)), tickInput(state(3))]);
    const frame = lastFrame(surface);
    expect(frame.map(label)).toEqual(['clear-image', 'flight-starField', 'lit-models', 'lit-models', 'flight-speedDust', 'flight-warp-tunnel', 'clear-canvas', 'flight-screen-flash']);
    // Warp keeps the world's depth (RS6): the game image is cleared in colour only.
    expect(frame[0]).toMatchObject({ clearColor: true, clearDepth: false });
  });

  it('draws the destruction view with the player\'s model and the sprites, from the destruction camera', () => {
    const { surface, fake, presentation } = wired();
    fake.deliver([firstTick()]);
    const before = flightState(1);
    const ship = before.entities.find(({ id }) => id === PLAYER)!;
    const shown = { ...ship, display: 'shown' as const };
    const switched: ViewSwitchedEvent = Object.freeze({
      type: 'view-switched', tick: 2, fromViewMode: 0x0c, fromSubMode: 0, viewMode: 0x11, subMode: 8, stage: 'collision',
      player: Object.freeze({ entityId: ship.id, position: ship.position, orientation: ship.orientation }),
    });
    const destruction = (tick: number, explosion = vec(5, 0, 120)): RenderState => {
      const state = flightState(tick, { viewMode: 0x11, subMode: 8 });
      const moved = (entity: RenderEntity): RenderEntity => (entity.id === EXPLOSION ? { ...entity, position: explosion } : entity);
      return Object.freeze({ ...state, entities: state.entities.map((entity) => (entity.id === PLAYER ? shown : moved(entity))) });
    };
    fake.deliver([tickInput(destruction(2), [switched])]);
    // The explosion has moved 70 ahead of the destruction camera; a frame of two ticks draws it at its current position.
    const { position, rows } = presentation.camera();
    const ahead = vec(position.x + 70 * rows[6], position.y + 70 * rows[7], position.z + 70 * rows[8]);
    fake.deliver([tickInput(destruction(3, ahead)), tickInput(destruction(4, ahead))]);
    expect(presentation.camera()).toMatchObject({ tick: 4, viewMode: 0x11, subMode: 8 });
    const frame = lastFrame(surface);
    expect(frame.map(label)).toEqual(F1_LAYERS);
    expect(frame[0]).toMatchObject({ clearDepth: true });
    // The whole screen is the destruction view's viewport, and the player's model is drawn in it.
    expect(frame[4].scissor).toEqual({ x: 0, y: 0, width: 640, height: 480 });
    expect(frame[4].objects).toHaveLength(6);
  });

  it('draws no world in the map, base and 0x13 views, and faults a view P3 does not draw', () => {
    const { surface, fake } = wired();
    fake.deliver([firstTick()]);
    [MAP_VIEW_MODE, BASE_VIEW_MODE, 0x13].forEach((viewMode, at) => {
      fake.deliver([tickInput(flightState(2 + at, { viewMode }))]);
      expect(lastFrame(surface).map(label)).toEqual(['clear-image', 'clear-canvas', 'flight-screen-flash']);
    });
    expect(() => { fake.deliver([tickInput(flightState(5, { viewMode: 2 }))]); }).toThrow(expect.objectContaining({ kind: 'unsupported-view' }));
    expect(() => { fake.deliver(null); }).toThrow(FlightRenderError);
  });

  it('steps the passes once per tick before drawing, and never on a frame without a tick', () => {
    const { surface, fake } = wired();
    fake.deliver([firstTick(), tickInput(flightState(2))]);
    const draws = vi.spyOn(RandStream.prototype, 'next');
    try {
      const passes = lastFrame(surface).map(label);
      const flash = { ...flashUniforms(surface) };
      fake.deliver(null);
      fake.deliver([]);
      expect(draws).not.toHaveBeenCalled();
      expect(surface.frames).toHaveLength(3);
      expect(lastFrame(surface).map(label)).toEqual(passes);
      expect(flashUniforms(surface).add.value).toBe(flash.add.value);
      // Five ticks in one frame: every pass is stepped through each, so the speed dust draws the last.
      fake.deliver([3, 4, 5, 6, 7].map((tick) => tickInput(flightState(tick))));
      expect(draws).toHaveBeenCalled();
      expect(lastFrame(surface).map(label)).toEqual(passes);
    } finally {
      draws.mockRestore();
    }
  });

  it('gives every pass the same draws and state however the ticks are grouped into frames (AC-17)', () => {
    const inputs = () => [
      tickInput(flightState(1), [hit(1, SHIP)]),
      tickInput(flightState(2), [{ ...explosionStarted(2, EXPLOSION, 'large', vec(5, 0, 120)), sourceKindBit: 20 }]),
      tickInput(flightState(3), [hit(3, PLAYER)]),
      tickInput(flightState(4)),
      tickInput(flightState(5), [hit(5, SHIP)]),
    ];
    const run = (groups: readonly number[]) => {
      const draws = vi.spyOn(RandStream.prototype, 'next');
      try {
        const { surface, fake, presentation } = wired();
        const all = inputs();
        let at = 0;
        for (const size of groups) {
          fake.deliver(all.slice(at, at + size));
          at += size;
        }
        const dust = lastFrame(surface).find((pass) => label(pass) === 'flight-speedDust')!;
        const image = (dust.objects[0].material as unknown as { uniforms: { image: { value: { image: { data: Uint8Array } } } } }).uniforms.image.value.image.data;
        return {
          draws: draws.mock.calls.length,
          explosions: presentation.explosions().map(({ key, selection }) => ({ key, selection })),
          flash: [flashUniforms(surface).add.value, flashUniforms(surface).shift.value],
          shimmer: lastFrame(surface).find((pass) => label(pass) === 'hit-shimmer')?.objects.map(({ name }) => name),
          dust: [...image].reduce((sum, value, index) => (sum + value * (index % 251 + 1)) % 1_000_003, 0),
        };
      } finally {
        draws.mockRestore();
      }
    };
    const single = run([1, 1, 1, 1, 1]);
    expect(single.draws).toBeGreaterThan(0);
    expect(single.explosions).toHaveLength(1);
    expect(run([5])).toEqual(single);
    expect(run([2, 0, 3])).toEqual(single);
  });

  it('releases every pass\'s resources with the run, and a retry of the same frames has the same warm counts', () => {
    const { surface, renderer } = setup();
    const content = preparedContent();
    const runOnce = (runId: number) => {
      const fake = fakeRun(runId);
      const { render } = wireFlightRun(fake.run, { renderer, binding: { ...BINDING, runId }, content, seed: 7 });
      fake.deliver([firstTick()]);
      fake.deliver([tickInput(flightState(2)), tickInput(flightState(3))]);
      const warm = { resources: render.resources.counts(), gpu: surface.gpuStats(), passes: lastFrame(surface).map(label) };
      expect(fake.end()).toEqual([]);
      expect(render.resources.counts()).toEqual({ geometries: 0, materials: 0, textures: 0, renderTargets: 0, vertices: 0, indices: 0, texels: 0 });
      expect(renderer.diagnostics()).toMatchObject({ runId: null, resources: null });
      return { warm, cold: surface.gpuStats() };
    };
    const first = runOnce(1);
    const second = runOnce(2);
    expect(second).toEqual(first);
    expect(first.warm.resources.geometries).toBeGreaterThan(0);
    expect(first.cold).toEqual({ geometries: 0, textures: 0, programs: 0 });
  });
});
