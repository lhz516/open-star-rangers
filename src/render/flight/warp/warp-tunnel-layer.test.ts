import type { DataTexture, Mesh, ShaderMaterial } from 'three';
import { Camera } from 'three';
import { describe, expect, it } from 'vitest';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { scriptedRand } from '../../../core/rules/rand.test-support.ts';
import type { CompositionFrame } from '../composition/flight-layers.ts';
import type { CameraPose } from '../presentation/presentation-contract.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { renderFrame } from '../scene/scene.test-support.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { libraryOrientation } from '../scene/drawn-pose.ts';
import { WARP_EDGE_DRAWS, WARP_IMAGE_HEIGHT, WARP_IMAGE_WIDTH, WarpTunnelImage } from './warp-tunnel-image.ts';
import { createWarpTunnelLayer, WARP_TUNNEL_GPU_PLAN } from './warp-tunnel-layer.ts';
import { cameraAt, flightState, STRAIGHT_PATH, warpState } from './warp.test-support.ts';

const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });
const PICKS = Array.from({ length: 40 }, (_, slot) => slot);
/** Every ring edge drawn. */
const PASS = Array<number>(WARP_EDGE_DRAWS).fill(0);

function setup(draws: readonly number[] = [...PICKS, ...PASS, ...PASS, ...PICKS, ...PASS]) {
  const cache = new FlightGpuCache(BINDING, () => ({ width: 640, height: 480 }));
  const random = scriptedRand(draws);
  const layer = createWarpTunnelLayer({ cache, random });
  const logicalCamera = new Camera();
  const frame = (current: RenderState, camera: CameraPose | null = cameraAt(9000), previous = current): CompositionFrame => ({
    view: 'warp', logicalCamera, render: renderFrame(current, previous),
    world: camera === null ? null : { scene: { view: 'warp', camera } },
  }) as unknown as CompositionFrame;
  return { cache, random, layer, frame, logicalCamera };
}

function image(passes: ReturnType<ReturnType<typeof setup>['layer']['passes']>) {
  expect(passes).toHaveLength(1);
  const mesh = passes[0].scene.children[0] as Mesh;
  const texture = (mesh.material as ShaderMaterial).uniforms.image.value as DataTexture;
  const data = texture.image.data as Uint8Array;
  let drawn = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] !== 0) drawn++;
  return { mesh, texture, data, drawn };
}

describe('Warp tunnel layer (AC-15)', () => {
  it('allocates its plan in the run\'s cache and draws in the warp-effect slot without depth', () => {
    const { cache, layer, frame, logicalCamera } = setup();
    expect(layer.slot).toBe('warp-effect');
    expect(cache.counts()).toEqual({
      geometries: 1, materials: 1, textures: 1, renderTargets: 0,
      vertices: WARP_TUNNEL_GPU_PLAN.vertices, indices: WARP_TUNNEL_GPU_PLAN.indices, texels: WARP_TUNNEL_GPU_PLAN.texels,
    });
    expect(WARP_TUNNEL_GPU_PLAN.texels).toBe(WARP_IMAGE_WIDTH * WARP_IMAGE_HEIGHT);
    layer.step(warpState(1, 1));
    const passes = layer.passes(frame(warpState(1, 1)));
    expect(passes[0].camera).toBe(logicalCamera);
    expect(passes[0]).not.toHaveProperty('target');
    const { mesh, texture, drawn } = image(passes);
    const material = mesh.material as ShaderMaterial;
    expect([material.depthTest, material.depthWrite]).toEqual([false, false]);
    expect([mesh.position.x, mesh.position.y]).toEqual([0, 0]);
    expect([texture.image.width, texture.image.height]).toEqual([640, 315]);
    expect(drawn).toBeGreaterThan(0);
    cache.dispose();
    expect(cache.counts().texels).toBe(0);
  });

  it('draws only in view 1 with warp, after a tick of that Warp, and only with a world', () => {
    const { layer, frame } = setup();
    expect(layer.passes(frame(warpState(1, 1)))).toEqual([]);
    layer.step(flightState(1));
    expect(layer.passes(frame(flightState(1)))).toEqual([]);
    layer.step(warpState(2, 1));
    expect(layer.passes(frame(warpState(2, 1), null))).toEqual([]);
    expect(layer.passes(frame({ ...warpState(2, 1), viewMode: 0x0c }))).toEqual([]);
    expect(layer.passes(frame(warpState(2, 1)))).toHaveLength(1);
  });

  it('redraws a frame without a tick from the same pass, without drawing randomness or refilling the image', () => {
    const { layer, frame, random } = setup();
    layer.step(warpState(1, 1));
    const state = warpState(1, 1);
    const { texture, data } = image(layer.passes(frame(state)));
    const version = texture.version;
    const pixels = data.slice();
    layer.passes(frame(state));
    layer.passes(frame(state, cameraAt(9000)));
    expect(texture.version).toBe(version);
    expect(random.used).toBe(100);
    // An interpolated camera refills the image, still without a draw.
    layer.passes(frame(state, cameraAt(9100)));
    expect(texture.version).toBe(version + 1);
    expect(data).not.toEqual(pixels);
    expect(random.used).toBe(100);
  });

  it('stops when warp becomes null and resets for the next serial', () => {
    const { layer, frame, random } = setup();
    layer.step(warpState(1, 1));
    layer.step(warpState(2, 1));
    expect(random.used).toBe(160);
    layer.step(flightState(3));
    expect(layer.passes(frame(flightState(3)))).toEqual([]);
    layer.step(warpState(4, 2));
    expect(random.used).toBe(260);
    expect(image(layer.passes(frame(warpState(4, 2)))).drawn).toBeGreaterThan(0);
  });

  it('projects with the stored rows of the tick whose camera is drawn, and with the drawn rows between ticks', () => {
    // R1 leans towards R2; the library's drawn rows are the identity.
    const stored = Object.freeze([1, 0, 0, 0, 1, Math.fround(0.01), 0, 0, 1]) as unknown as Matrix3;
    const drawnRows = libraryOrientation(stored)!;
    const pose = (z: number) => Object.freeze({ position: cameraAt(z).position, rows: stored });
    const { layer, frame } = setup();
    const previous = warpState(1, 1, STRAIGHT_PATH, pose(8900));
    const current = warpState(2, 1, STRAIGHT_PATH, pose(9000));
    layer.step(previous);
    layer.step(current);
    const at = (camera: CameraPose) => image(layer.passes(frame(current, camera, previous))).data.slice();
    const rotation = PICKS.map((_, slot) => (slot + 1) % 40);
    const reference = (camera: CameraPose) => {
      const drawn = new WarpTunnelImage();
      drawn.draw({ serial: 1, path: STRAIGHT_PATH, templates: rotation, edges: Array<boolean>(WARP_EDGE_DRAWS).fill(true), camera });
      return drawn.pixels;
    };
    expect(reference(pose(9000))).not.toEqual(reference(cameraAt(9000, drawnRows)));
    expect(at(cameraAt(9000, drawnRows))).toEqual(reference(pose(9000)));
    expect(at(cameraAt(8900, drawnRows))).toEqual(reference(pose(8900)));
    expect(at(cameraAt(8950, drawnRows))).toEqual(reference(cameraAt(8950, drawnRows)));
  });

  it('rejects drawing a Render State other than the last stepped tick\'s', () => {
    const { layer, frame } = setup();
    layer.step(warpState(1, 1));
    expect(() => layer.passes(frame(warpState(2, 1)))).toThrow(FlightRenderError);
    expect(() => layer.passes(frame(warpState(1, 2)))).toThrow(FlightRenderError);
  });
});
