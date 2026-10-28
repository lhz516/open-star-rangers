import { BackSide, Matrix4, Vector3, type Mesh, type ShaderMaterial, type Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { AssetId } from '../../../content/asset-id.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { computeViewportLayout } from '../../viewport/viewport-layout.ts';
import { COMPOSITION_GPU_PLAN, FlightComposition } from '../composition/flight-composition.ts';
import { logicalTransform } from '../composition/logical-screen.ts';
import { renderEntity, renderState, vec } from '../presentation/presentation.test-support.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { FlightScene } from '../scene/flight-scene.ts';
import { camerasOf, PROJECTION, renderFrame, SCENE_SETTINGS } from '../scene/scene.test-support.ts';
import { modelLight } from './lighting-math.ts';
import { lightingContent, lightingSettings, MODEL } from './lighting.test-support.ts';
import { ModelLightingLayer } from './model-lighting-layer.ts';
import { prepareModelSurfaces } from './model-surfaces.ts';

const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });
const LAYOUT = computeViewportLayout({ width: 640, height: 480, devicePixelRatio: 1, maxDrawingBufferSize: 8192 })!;
const LOGICAL = logicalTransform(LAYOUT);
const TILTED: Matrix3 = Object.freeze([0.6, 0, -0.8, 0, 1, 0, 0.8, 0, 0.6]) as unknown as Matrix3;

const withModel = (entity: RenderEntity, model: string): RenderEntity => Object.freeze({ ...entity, presentation: Object.freeze({ type: 'model', model: model as AssetId }) });

function setup() {
  const surfaces = prepareModelSurfaces(lightingContent(), lightingSettings());
  const cache = new FlightGpuCache(BINDING, () => ({ width: LAYOUT.bufferWidth, height: LAYOUT.bufferHeight }));
  const composition = new FlightComposition(cache);
  const layer = new ModelLightingLayer(surfaces, cache);
  composition.add(layer);
  const flightScene = new FlightScene(SCENE_SETTINGS.deviceValues);
  const draw = (render: RenderState) => {
    const frame = renderFrame(render);
    const scene = flightScene.frame({ render: frame, cameras: camerasOf(frame) });
    const passes = composition.passes({ logical: LOGICAL, render: frame, projection: PROJECTION, scene });
    const pass = passes.find((candidate) => candidate.scene.name === 'lit-models');
    return { scene, pass, meshes: [...(pass?.scene.children ?? [])] as Mesh[] };
  };
  return { surfaces, cache, layer, draw };
}

const state = (entities: readonly RenderEntity[], viewMode = 0x0c) => renderState(1, { entities, viewMode });
const twoCraft = () => [
  renderEntity(3, { position: vec(0, 0, 50) }),
  renderEntity(5, { position: vec(9, 9, 90), explosion: 'large' }),
  renderEntity(7, { position: vec(-20, 5, 120), orientation: TILTED }),
];

describe('lit model layer', () => {
  it('draws the list-0 parts of every drawn model entity, in ID and part order, within the world viewport', () => {
    const { draw } = setup();
    const { pass, meshes } = draw(state(twoCraft()));
    expect(pass?.scissor).toEqual({ x: 0, y: 0, width: 640, height: 316 });
    expect(meshes.map(({ name, renderOrder }) => [name, renderOrder])).toEqual([
      [`${MODEL}:0`, 0], [`${MODEL}:1`, 1], [`${MODEL}:2`, 2], [`${MODEL}:0`, 3], [`${MODEL}:1`, 4], [`${MODEL}:2`, 5],
    ]);
  });

  it('places each part at the drawn pose and lights it with that pose’s L′', () => {
    const { draw, surfaces } = setup();
    const { scene, meshes } = draw(state(twoCraft()));
    const tilted = scene!.entities.find(({ entity }) => entity.id === 7)!;
    const mesh = meshes[3];
    const { rows, position } = tilted;
    expect(mesh.matrixWorld.elements).toEqual(new Matrix4().set(
      rows[0], rows[3], rows[6], position.x, rows[1], rows[4], rows[7], position.y, rows[2], rows[5], rows[8], position.z, 0, 0, 0, 1,
    ).elements);
    for (const [index, entity] of [[0, scene!.entities[0]], [3, tilted]] as const) {
      const material = meshes[index].material as ShaderMaterial;
      meshes[index].onBeforeRender(null as never, null as never, null as never, meshes[index].geometry, material, null as never);
      const light = modelLight(entity.rows, surfaces.lighting.scale);
      expect(material.uniforms.light.value).toEqual(new Vector3(light.x, light.y, light.z));
      expect(material.uniformsNeedUpdate).toBe(true);
    }
  });

  it('shares geometries, materials and textures between entities within the plan', () => {
    const { draw, cache, surfaces } = setup();
    const { meshes } = draw(state(twoCraft()));
    expect(meshes[0].geometry).toBe(meshes[3].geometry);
    expect(meshes[0].material).toBe(meshes[3].material);
    const counts = cache.counts();
    expect(counts.vertices).toBe(surfaces.plan.vertices + COMPOSITION_GPU_PLAN.vertices);
    expect(counts.texels).toBe(surfaces.plan.texels + COMPOSITION_GPU_PLAN.texels);
    expect([counts.geometries, counts.materials, counts.textures]).toEqual([3 + 1, 3 + 1, 4]);
    const part = surfaces.models.get(MODEL)![0];
    expect(meshes[0].geometry.getAttribute('position').array).toBe(part.positions);
    expect(meshes[0].geometry.getAttribute('uv').array).toBe(part.uvs);
    expect(meshes[0].geometry.getAttribute('litNormal').array).toBe(part.normals);
  });

  it('selects the flat, textured and culling variants of each part', () => {
    const { draw } = setup();
    const materials = draw(state(twoCraft())).meshes.slice(0, 3).map((mesh) => mesh.material as ShaderMaterial);
    expect(materials.map(({ defines }) => Object.keys(defines).sort())).toEqual([['FLAT', 'TEXTURED'], [], ['FLAT', 'TEXTURED']]);
    expect(materials.every(({ side, depthTest, depthWrite }) => side === BackSide && depthTest && depthWrite)).toBe(true);
    const texels = materials[0].uniforms.texels.value;
    expect(texels).toBe(materials[2].uniforms.texels.value);
    expect([...texels.image.data]).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(materials[0].uniforms.ramps.value.image).toMatchObject({ width: 4, height: 4 });
    expect(materials[2].uniforms.ramps.value.image).toMatchObject({ width: 4, height: 1 });
  });

  it('keeps the triangles the original keeps: clockwise on screen, WebGL’s back faces', () => {
    const { draw } = setup();
    const { pass, meshes } = draw(state([renderEntity(3, { position: vec(0, 0, 50) })]));
    const camera = pass!.camera;
    const part = meshes[0];
    const toScreen = (corner: number) => {
      const p = new Vector3().fromArray(part.geometry.getAttribute('position').array, corner * 3)
        .applyMatrix4(part.matrixWorld).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      return { x: p.x, y: p.y, logicalX: (p.x + 1) * 320, logicalY: (1 - p.y) * LOGICAL.bufferHeight / 2 };
    };
    for (const [first, faces] of [[0, 'away'], [3, 'towards']] as const) {
      const [a, b, c] = [0, 1, 2].map((offset) => toScreen(first + offset));
      const ndcArea = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
      // RS4 on rows that grow downwards: drawn when (xB − xA)(rC − rA) − (xC − xA)(rB − rA) ≥ 0.
      const rs4 = (b.logicalX - a.logicalX) * (c.logicalY - a.logicalY) - (c.logicalX - a.logicalX) * (b.logicalY - a.logicalY);
      expect(rs4 > 0, faces).toBe(faces === 'towards');
      expect(ndcArea < 0, faces).toBe(faces === 'towards');
    }
  });

  it('forgets entities no longer drawn and refuses a model without surfaces', () => {
    const { draw } = setup();
    const first = draw(state(twoCraft())).meshes;
    const second = draw(state(twoCraft().slice(0, 2))).meshes;
    expect(second).toEqual(first.slice(0, 3));
    expect(second[0]).toBe(first[0]);
    const again = draw(state(twoCraft())).meshes;
    expect(again[3]).not.toBe(first[3]);
    expect(again[3].geometry).toBe(first[3].geometry);
    expect(() => draw(state([withModel(renderEntity(3), 'model/unknown')]))).toThrow(ContentContractError);
  });

  it('draws nothing in views without a world', () => {
    const { layer, draw } = setup();
    expect(draw(state(twoCraft(), 8)).pass).toBeUndefined();
    expect(layer.passes({ world: null } as never)).toEqual([]);
    expect((draw(state([], 0x0c)).pass?.scene as Scene).children).toEqual([]);
  });
});
