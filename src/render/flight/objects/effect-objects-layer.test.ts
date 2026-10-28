import { Matrix4, Vector3, type Mesh, type ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { AssetId } from '../../../content/asset-id.ts';
import type { RenderEntity, RenderState } from '../../../core/projections/render-state.ts';
import type { EntityPresentation, Matrix3 } from '../../../core/world/entity-table.ts';
import { computeViewportLayout } from '../../viewport/viewport-layout.ts';
import { FlightComposition } from '../composition/flight-composition.ts';
import { logicalTransform } from '../composition/logical-screen.ts';
import { modelLight } from '../lighting/lighting-math.ts';
import { lightingSettings } from '../lighting/lighting.test-support.ts';
import type { PresentationFragment } from '../presentation/effects/presentation-effects.ts';
import type { FragmentKey } from '../presentation/presentation-contract.ts';
import { IDENTITY, renderEntity, renderState, vec } from '../presentation/presentation.test-support.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { libraryOrientation } from '../scene/drawn-pose.ts';
import { FlightScene } from '../scene/flight-scene.ts';
import { camerasOf, PROJECTION, renderFrame, SCENE_SETTINGS } from '../scene/scene.test-support.ts';
import { EffectObjectsLayer } from './effect-objects-layer.ts';
import { debrisShapeLook, missileLook, partLook, podLook, prepareObjectSurfaces, projectileLook } from './object-surfaces.ts';
import { CRAFT, DEBRIS_MODEL, objectContent, PROJECTILE_VISUALS } from './objects.test-support.ts';

const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });
const LAYOUT = computeViewportLayout({ width: 640, height: 480, devicePixelRatio: 1, maxDrawingBufferSize: 8192 })!;
const LOGICAL = logicalTransform(LAYOUT);
const TILTED: Matrix3 = Object.freeze([0.6, 0, -0.8, 0, 1, 0, 0.8, 0, 0.6]) as unknown as Matrix3;
/** A quarter turn about y. */
const TURNED: Matrix3 = Object.freeze([0, 0, -1, 0, 1, 0, 1, 0, 0]) as unknown as Matrix3;

const entity = (id: number, presentation: EntityPresentation, position = vec(0, 0, 50), orientation = IDENTITY): RenderEntity =>
  Object.freeze({ ...renderEntity(id, { position, orientation }), presentation: Object.freeze(presentation) });

const objects = (): RenderEntity[] => [
  entity(2, { type: 'model', model: 'model/synthetic' as AssetId }),
  entity(3, { type: 'projectile', visuals: PROJECTILE_VISUALS, record: 1 }, vec(1, 2, 40), TILTED),
  entity(4, { type: 'explosion', variant: 'large' }),
  entity(5, { type: 'missile', missile: 1 }),
  entity(6, { type: 'fragment', model: CRAFT, part: 0, display: 'parts-0-2' }),
  entity(8, { type: 'fragment', model: CRAFT, part: 3, display: 'part' }),
];

const fragment = (n: number, discriminator: 1 | 2, overrides: Partial<PresentationFragment> = {}): PresentationFragment => Object.freeze({
  key: `fragment:${n}` as FragmentKey, discriminator, part: discriminator === 2 ? 4 : null, shape: discriminator === 1 ? 1 : null,
  explodesOnExpiry: false, parentExplosionKey: 'core:9' as PresentationFragment['parentExplosionKey'], sourceKindBit: 7, display: 'shown', position: vec(0, 0, 60), rows: IDENTITY,
  createdTick: 0, activeTick: 1, explosionKey: null, releasedTick: null, ...overrides,
});

function setup() {
  const surfaces = prepareObjectSurfaces(objectContent(), lightingSettings());
  const cache = new FlightGpuCache(BINDING, () => ({ width: LAYOUT.bufferWidth, height: LAYOUT.bufferHeight }));
  const composition = new FlightComposition(cache);
  let fragments: readonly PresentationFragment[] = [];
  const layer = new EffectObjectsLayer({ surfaces, resources: cache, effects: { fragments: () => fragments } });
  composition.add(layer);
  const flightScene = new FlightScene(SCENE_SETTINGS.deviceValues);
  const draw = (current: RenderState, { previous = current, alpha = 0, shown = [] as readonly PresentationFragment[] } = {}) => {
    fragments = shown;
    const frame = renderFrame(current, previous, alpha);
    const scene = flightScene.frame({ render: frame, cameras: camerasOf(frame) });
    const passes = composition.passes({ logical: LOGICAL, render: frame, projection: PROJECTION, scene });
    const pass = passes.find((candidate) => candidate.scene.name === 'lit-models');
    return { scene, pass, meshes: [...(pass?.scene.children ?? [])] as Mesh[] };
  };
  return { surfaces, cache, layer, draw };
}

const state = (tick: number, entities: readonly RenderEntity[], viewMode = 0x0c) => renderState(tick, { entities, viewMode });
const names = (meshes: readonly Mesh[]): string[] => meshes.map(({ name }) => name);
const poseMatrix = (rows: Matrix3, { x, y, z }: { x: number; y: number; z: number }) =>
  new Matrix4().set(rows[0], rows[3], rows[6], x, rows[1], rows[4], rows[7], y, rows[2], rows[5], rows[8], z, 0, 0, 0, 1);

describe('effect objects layer', () => {
  it('draws the projectile, missile and fragment entities as their looks, in ID order, then the shown presentation fragments', () => {
    const { draw } = setup();
    const shown = [fragment(0, 2), fragment(1, 1, { display: 'pending' }), fragment(2, 1), fragment(3, 2, { display: 'released' })];
    const { meshes } = draw(state(1, objects()), { shown });
    expect(names(meshes)).toEqual([
      `${projectileLook(1)}:0`,
      ...[0, 1, 2, 3, 4].map((part) => `${missileLook(1)}:${part}`),
      ...[0, 1, 2].map((part) => `${podLook(CRAFT)}:${part}`),
      `${partLook(CRAFT, 3)}:0`,
      `${partLook(DEBRIS_MODEL, 1)}:0`,
      `${debrisShapeLook(1)}:0`,
    ]);
    expect(meshes.map(({ renderOrder }) => renderOrder)).toEqual(meshes.map((_, order) => order));
  });

  it('places each look at its object’s drawn pose, without an offset, and lights it in the object’s axes', () => {
    const { draw, surfaces } = setup();
    const { scene, meshes } = draw(state(1, objects()));
    const projectile = scene!.entities.find(({ entity: { id } }) => id === 3)!;
    expect(meshes[0].matrixWorld.elements).toEqual(poseMatrix(projectile.rows, projectile.position).elements);
    const body = meshes[1];
    const material = body.material as ShaderMaterial;
    body.onBeforeRender(null as never, null as never, null as never, body.geometry, material, null as never);
    const light = modelLight(scene!.entities.find(({ entity: { id } }) => id === 5)!.rows, surfaces.looks.lighting.scale);
    expect(material.uniforms.light.value).toEqual(new Vector3(light.x, light.y, light.z));
  });

  it('mixes a presentation fragment’s pose from the previous tick drawn, unless the frame folds or it was not shown', () => {
    const { draw } = setup();
    const at = (z: number, rows = IDENTITY) => fragment(0, 1, { position: vec(0, 0, z), rows });
    const matrix = (meshes: readonly Mesh[]) => meshes.at(-1)!.matrixWorld;
    draw(state(1, []), { shown: [at(100)] });
    const mixed = matrix(draw(state(2, []), { previous: state(1, []), alpha: 0.5, shown: [at(200, TURNED)] }).meshes);
    const position = new Vector3().setFromMatrixPosition(mixed);
    expect(position.z).toBeCloseTo(150, 10);
    // Half of a quarter turn about y: the drawn x axis is (cos 45°, 0, −sin 45°).
    expect(new Vector3().setFromMatrixColumn(mixed, 0).toArray().map((value) => Number(value.toFixed(12))))
      .toEqual([Math.SQRT1_2, 0, -Math.SQRT1_2].map((value) => Number(value.toFixed(12))));
    // The same tick drawn again keeps both snapshots.
    expect(new Vector3().setFromMatrixPosition(matrix(draw(state(2, []), { previous: state(1, []), alpha: 0.25, shown: [at(200, TURNED)] }).meshes)).z).toBeCloseTo(125, 10);
    // A folded frame and a fragment new at this tick are drawn at their current pose.
    expect(matrix(draw(state(2, []), { previous: state(1, [], 8), alpha: 0.5, shown: [at(200, TURNED)] }).meshes).elements)
      .toEqual(poseMatrix(libraryOrientation(TURNED)!, vec(0, 0, 200)).elements);
    const added = draw(state(3, []), { previous: state(2, []), alpha: 0.5, shown: [at(300), fragment(5, 2, { position: vec(0, 0, 80) })] }).meshes;
    expect(new Vector3().setFromMatrixPosition(added.at(-1)!.matrixWorld).z).toBe(80);
    expect(new Vector3().setFromMatrixPosition(added.at(-2)!.matrixWorld).z).toBeCloseTo(250, 10);
    // After a frame that advanced several ticks, the current poses are used.
    expect(new Vector3().setFromMatrixPosition(matrix(draw(state(6, []), { previous: state(5, []), alpha: 0.5, shown: [at(600)] }).meshes)).z).toBe(600);
  });

  it('keeps the last accepted orientation of a fragment whose rows the library rejects', () => {
    const { draw } = setup();
    const rejected: Matrix3 = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 1]) as unknown as Matrix3;
    draw(state(1, []), { shown: [fragment(0, 1, { rows: TURNED })] });
    const { meshes } = draw(state(2, []), { shown: [fragment(0, 1, { rows: rejected })] });
    expect(meshes[0].matrixWorld.elements).toEqual(poseMatrix(libraryOrientation(TURNED)!, vec(0, 0, 60)).elements);
  });

  it('faults on references beyond the content and draws nothing without a world', () => {
    const { draw, layer } = setup();
    const unbound = expect.objectContaining({ code: 'binding-mismatch' });
    expect(() => draw(state(1, [entity(3, { type: 'missile', missile: 3 })]))).toThrow(unbound);
    expect(() => draw(state(1, [entity(3, { type: 'projectile', visuals: PROJECTILE_VISUALS, record: 9 })]))).toThrow(unbound);
    expect(() => draw(state(1, []), { shown: [fragment(0, 1, { shape: null })] })).toThrow(unbound);
    expect(draw(state(1, objects(), 8)).pass).toBeUndefined();
    expect(layer.passes({ world: null } as never)).toEqual([]);
  });

  it('allocates within its plan and shares a look’s geometry between objects', () => {
    const { draw, cache, surfaces } = setup();
    const { meshes } = draw(state(1, [...objects(), entity(9, { type: 'projectile', visuals: PROJECTILE_VISUALS, record: 1 })]));
    expect(meshes.at(-1)!.geometry).toBe(meshes[0].geometry);
    expect(cache.counts().vertices).toBeLessThanOrEqual(surfaces.looks.plan.vertices + 3);
    expect(cache.counts().texels).toBeLessThanOrEqual(surfaces.looks.plan.texels);
  });
});
