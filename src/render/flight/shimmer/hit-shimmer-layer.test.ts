import { BackSide, Matrix4, Vector2, type Mesh, type ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { computeViewportLayout } from '../../viewport/viewport-layout.ts';
import { COMPOSITION_GPU_PLAN, FlightComposition } from '../composition/flight-composition.ts';
import { logicalTransform } from '../composition/logical-screen.ts';
import { vec } from '../presentation/presentation.test-support.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { FlightScene } from '../scene/flight-scene.ts';
import type { SceneCameras } from '../scene/flight-scene.ts';
import { cameraOf, camerasOf, PROJECTION, renderFrame, SCENE_SETTINGS } from '../scene/scene.test-support.ts';
import { HitShimmerLayer } from './hit-shimmer-layer.ts';
import { bandTable, screenDoorTable } from './shimmer-band.ts';
import { BASE_KIND, hit, impact, MODEL, OTHER_MODEL, player, shimmerEntity, shimmerRun, shimmerState, thresholdsImage } from './shimmer.test-support.ts';

const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });
const LAYOUT = computeViewportLayout({ width: 1280, height: 960, devicePixelRatio: 1, maxDrawingBufferSize: 8192 })!;
const TILTED: Matrix3 = Object.freeze([0.6, 0, -0.8, 0, 1, 0, 0.8, 0, 0.6]) as unknown as Matrix3;

function setup(layout = LAYOUT) {
  const run = shimmerRun();
  const logical = logicalTransform(layout);
  const cache = new FlightGpuCache(BINDING, () => ({ width: layout.bufferWidth, height: layout.bufferHeight }));
  const composition = new FlightComposition(cache);
  const layer = new HitShimmerLayer(run.surfaces, run.shimmer, cache);
  composition.add(layer);
  const flightScene = new FlightScene(SCENE_SETTINGS.deviceValues);
  const draw = (render: RenderState) => {
    const frame = renderFrame(render);
    const scene = flightScene.frame({ render: frame, cameras: render.viewMode === 0x11 ? destructionCameras(render) : camerasOf(frame) });
    const passes = composition.passes({ logical, render: frame, projection: PROJECTION, scene });
    const pass = passes.find((candidate) => candidate.scene.name === 'hit-shimmer');
    return { scene, pass, meshes: [...(pass?.scene.children ?? [])] as Mesh[] };
  };
  return { ...run, cache, layer, draw };
}

/** A destruction camera at the origin looking along z over the whole screen (the presentation's is not under test). */
function destructionCameras(render: RenderState): SceneCameras {
  const f1 = cameraOf({ ...render, viewMode: 0x0c, subMode: 0 });
  return Object.freeze({ previous: null, current: Object.freeze({ ...f1, viewMode: 0x11, subMode: 8, viewport: Object.freeze({ left: 0, top: 0, right: 639, bottom: 479 }) }) });
}

/** Uploads `mesh`'s per-draw uniforms as the renderer would, and returns its material. */
function beforeRender(mesh: Mesh): ShaderMaterial {
  const material = mesh.material as ShaderMaterial;
  mesh.onBeforeRender(null as never, null as never, null as never, mesh.geometry, material, null as never);
  return material;
}

const poseMatrix = (rows: Matrix3, { x, y, z }: { x: number; y: number; z: number }) => new Matrix4().set(
  rows[0], rows[3], rows[6], x, rows[1], rows[4], rows[7], y, rows[2], rows[5], rows[8], z, 0, 0, 0, 1,
);

describe('hit shimmer layer', () => {
  it('draws an own shell at its entity’s drawn pose with its wrap’s rows and its band', () => {
    const { advance, draw } = setup();
    const entities = [player(), shimmerEntity(3, { position: vec(5, 0, 80), orientation: TILTED })];
    advance(shimmerState(1, entities), [hit(1, 3)]);
    advance(shimmerState(2, entities));
    const { scene, meshes } = draw(shimmerState(2, entities));
    expect(meshes).toHaveLength(1);
    const drawn = scene!.entities.find(({ entity }) => entity.id === 3)!;
    expect(meshes[0].matrixWorld.elements).toEqual(poseMatrix(drawn.rows, drawn.position).elements);
    const material = beforeRender(meshes[0]);
    // Wrap 0 + start + two poses; one row per wrap; t = 3 one tick after the start.
    expect([material.uniforms.wrapRow.value, material.uniforms.bandRow.value]).toEqual([3, 3]);
    expect(material.uniforms.logical.value).toEqual(new Vector2(2, LAYOUT.bufferHeight));
    expect(material.uniformsNeedUpdate).toBe(true);
  });

  it('takes device pixels as the screen-door grid when the drawing buffer is narrower than 640', () => {
    const small = computeViewportLayout({ width: 320, height: 240, devicePixelRatio: 1, maxDrawingBufferSize: 8192 })!;
    const { advance, draw } = setup(small);
    const entities = [player(), shimmerEntity(3)];
    advance(shimmerState(1, entities), [hit(1, 3)]);
    expect(beforeRender(draw(shimmerState(1, entities)).meshes[0]).uniforms.logical.value).toEqual(new Vector2(1, small.bufferHeight));
  });

  it('draws a shared shell at its record’s place and orientation in its entity’s frame, at its step’s wrap and band', () => {
    const { advance, draw } = setup();
    const entities = [player(), shimmerEntity(4, { kindBit: BASE_KIND, model: OTHER_MODEL, position: vec(0, 0, 200), orientation: TILTED })];
    advance(shimmerState(1, entities), [hit(1, 4, { impact: impact(vec(1, 2, 3), 3) })]);
    for (let tick = 2; tick <= 5; tick++) advance(shimmerState(tick, entities));
    const { scene, meshes } = draw(shimmerState(5, entities));
    const drawn = scene!.entities.find(({ entity }) => entity.id === 4)!;
    const child = poseMatrix([0, 0, 1, 0, -1, 0, 1, 0, 0] as unknown as Matrix3, vec(1, 2, 3));
    expect(meshes[0].matrixWorld.elements).toEqual(poseMatrix(drawn.rows, drawn.position).multiply(child).elements);
    const material = beforeRender(meshes[0]);
    expect([material.uniforms.wrapRow.value, material.uniforms.bandRow.value]).toEqual([1, 15]);
    expect(meshes[0].name).toContain(OTHER_MODEL);
  });

  it('draws only shells of drawn entities, and nothing in views without a world', () => {
    const { advance, draw, layer } = setup();
    const entities = [player({ display: 'shown' }), shimmerEntity(3)];
    advance(shimmerState(1, entities, { viewMode: 0x11, subMode: 8 }), [hit(1, 1), hit(1, 3)]);
    expect(draw(shimmerState(1, entities, { viewMode: 0x11, subMode: 8 })).meshes).toHaveLength(2);
    // F1 does not draw the observed entity, nor its shell.
    expect(draw(shimmerState(1, entities)).meshes.map(({ name }) => name)).toEqual([`shimmer:3:0:${MODEL}:turning`]);
    expect(draw(shimmerState(1, entities, { viewMode: 8 })).pass).toBeUndefined();
    expect(layer.passes({ world: null } as never)).toEqual([]);
  });

  it('reads the colour, threshold, band and screen door textures and the family’s wrap table within the plan', () => {
    const { advance, draw, cache, surfaces } = setup();
    const entities = [player(), shimmerEntity(3), shimmerEntity(4), shimmerEntity(5, { kindBit: 7 })];
    advance(shimmerState(1, entities), [hit(1, 3), hit(1, 4), hit(1, 5)]);
    const { meshes } = draw(shimmerState(1, entities));
    expect(meshes[0].material).toBe(meshes[1].material);
    expect(meshes[0].geometry).toBe(meshes[2].geometry);
    expect(meshes[0].material).not.toBe(meshes[2].material);
    const material = meshes[0].material as ShaderMaterial;
    expect(material).toMatchObject({ side: BackSide, depthTest: true, depthWrite: true });
    const { uniforms } = material;
    expect([...uniforms.thresholds.value.image.data]).toEqual([...thresholdsImage().indices]);
    expect([...uniforms.texels.value.image.data]).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(uniforms.band.value.image.data).toEqual(bandTable());
    expect(uniforms.door.value.image.data).toEqual(screenDoorTable());
    expect(uniforms.ramps.value.image).toMatchObject({ width: 4, height: 1 });
    expect(uniforms.wrapUvs.value.image).toMatchObject({ width: 6, height: 32 });
    expect(uniforms.wrapUvs.value.image.data).toBe(surfaces.models.get(MODEL)!.tables.turning.uvs);
    expect((meshes[2].material as ShaderMaterial).uniforms.wrapUvs.value.image).toMatchObject({ width: 6, height: 1 });
    expect(meshes[0].geometry.getAttribute('position').array).toBe(surfaces.models.get(MODEL)!.part.positions);
    const counts = cache.counts();
    expect(counts.vertices).toBe(6 + COMPOSITION_GPU_PLAN.vertices);
    expect(counts.vertices - COMPOSITION_GPU_PLAN.vertices).toBeLessThanOrEqual(surfaces.plan.vertices);
    expect(counts.texels - COMPOSITION_GPU_PLAN.texels).toBeLessThanOrEqual(surfaces.plan.texels);
  });

  it('keeps a shell’s mesh while drawn and forgets it once it ends', () => {
    const { advance, draw } = setup();
    const entities = [player(), shimmerEntity(3)];
    advance(shimmerState(1, entities), [hit(1, 3)]);
    const first = draw(shimmerState(1, entities)).meshes[0];
    advance(shimmerState(2, entities));
    expect(draw(shimmerState(2, entities)).meshes[0]).toBe(first);
    for (let tick = 3; tick <= 64; tick++) advance(shimmerState(tick, entities));
    expect(draw(shimmerState(64, entities)).pass).toBeUndefined();
  });
});
