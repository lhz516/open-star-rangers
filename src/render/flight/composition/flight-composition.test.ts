import type { ShaderMaterial, WebGLRenderTarget } from 'three';
import { BufferAttribute, BufferGeometry, Camera, Mesh, MeshBasicMaterial, Scene, Vector4 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { computeViewportLayout, type ViewportLayout } from '../../viewport/viewport-layout.ts';
import { renderEntity, renderState } from '../presentation/presentation.test-support.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { FlightScene, type SceneCameras } from '../scene/flight-scene.ts';
import { camerasOf, PROJECTION, renderFrame, SCENE_SETTINGS } from '../scene/scene.test-support.ts';
import { COMPOSITION_GPU_PLAN, FlightComposition } from './flight-composition.ts';
import { FLIGHT_LAYER_SLOTS, LAYER_ORDER, type CompositionFrame, type FlightLayer, type FlightLayerSlot } from './flight-layers.ts';
import { deviceRect, LOGICAL_HEIGHT, logicalTransform, setLogicalCamera, viewportRect, type LogicalTransform } from './logical-screen.ts';

const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });

const layout = (width = 640, height = 480, devicePixelRatio = 1): ViewportLayout =>
  computeViewportLayout({ width, height, devicePixelRatio, maxDrawingBufferSize: 8192 })!;

function setup(current: ViewportLayout = layout()) {
  let max = current;
  const cache = new FlightGpuCache(BINDING, () => ({ width: max.bufferWidth, height: max.bufferHeight }));
  const composition = new FlightComposition(cache);
  const scene = new FlightScene(SCENE_SETTINGS.deviceValues);
  const passes = (render: RenderState, at: ViewportLayout = max, cameras?: SceneCameras) => {
    max = at;
    const frame = renderFrame(render);
    return composition.passes({ logical: logicalTransform(at), render: frame, projection: PROJECTION, scene: scene.frame({ render: frame, cameras: cameras ?? camerasOf(frame) }) });
  };
  return { cache, composition, passes };
}

/** A test layer: one pass of its own named scene, recording the frames it was given. */
function testLayer(slot: FlightLayerSlot, extra: Partial<{ clearColor: boolean; scissor: null }> = {}) {
  const scene = new Scene();
  scene.name = slot;
  const frames: CompositionFrame[] = [];
  const layer: FlightLayer = {
    slot,
    passes: (frame) => {
      frames.push(frame);
      return [{ scene, camera: slot === 'world' ? frame.world!.camera : frame.logicalCamera, ...extra }];
    },
  };
  return { layer, scene, frames };
}

const names = (passes: readonly { scene: Scene; target: WebGLRenderTarget | null }[]) => passes.map(({ scene, target }) => `${scene.name || '-'}@${target ? 'image' : 'canvas'}`);

/** A logical-camera vertex in device pixels from the buffer's top-left. */
function devicePoint(transform: LogicalTransform, x: number, y: number) {
  const camera = setLogicalCamera(new Camera(), transform);
  const clip = new Vector4(x, y, 0, 1).applyMatrix4(camera.projectionMatrix);
  return { x: ((clip.x + 1) / 2) * transform.bufferWidth, y: ((1 - clip.y) / 2) * transform.bufferHeight };
}

describe('logical screen', () => {
  it('scales the 640 × 480 screen uniformly to the buffer, within one device pixel of its height', () => {
    for (const [width, height, ratio] of [[640, 480, 1], [1280, 800, 2], [1366, 768, 1.25], [333, 999, 3], [1001, 700, 1.5]]) {
      const at = layout(width, height, ratio);
      const transform = logicalTransform(at);
      expect(transform.scale).toBe(at.bufferWidth / 640);
      expect(Math.abs(LOGICAL_HEIGHT * transform.scale - at.bufferHeight)).toBeLessThan(1);
    }
  });

  it('draws logical pixels at the scaled device position, y down', () => {
    for (const at of [layout(), layout(1280, 960, 1), layout(1366, 768, 1.25)]) {
      const transform = logicalTransform(at);
      for (const [x, y] of [[0, 0], [100, 50], [639.5, 479], [320, 316]]) {
        const point = devicePoint(transform, x, y);
        expect(point.x).toBeCloseTo(x * transform.scale, 6);
        expect(point.y).toBeCloseTo(y * transform.scale, 6);
      }
    }
  });

  it('rounds logical rectangles to whole device pixels inside the buffer', () => {
    expect(deviceRect(logicalTransform(layout(1280, 960)), viewportRect({ left: 0, top: 0, right: 639, bottom: 315 }))).toEqual({ x: 0, y: 0, width: 1280, height: 632 });
    const odd = logicalTransform(layout(1001, 700, 1));
    expect(odd.scale).toBeCloseTo(933 / 640, 12);
    expect(deviceRect(odd, { x: 0, y: 0, width: 640, height: 316 })).toEqual({ x: 0, y: 0, width: 933, height: Math.round(316 * odd.scale) });
    expect(deviceRect(odd, { x: -5, y: 470, width: 700, height: 20 })).toEqual({ x: 0, y: Math.round(470 * odd.scale), width: 933, height: odd.bufferHeight - Math.round(470 * odd.scale) });
  });
});

describe('flight composition', () => {
  const f1 = renderState(3, { observedEntityId: 1, entities: [renderEntity(1)] });

  it('draws every slot of the view in FC2 order into the game image, then the screen copy on the cleared canvas', () => {
    const { composition, passes } = setup();
    const layers = Object.fromEntries(FLIGHT_LAYER_SLOTS.map((slot) => [slot, testLayer(slot)]));
    for (const slot of FLIGHT_LAYER_SLOTS) composition.add(layers[slot].layer);
    const views: [RenderState, string[]][] = [
      [f1, ['nebula', 'stars', 'dust', 'world', 'sprites', 'cockpit']],
      [{ ...f1, viewMode: 0x11, subMode: 8 }, ['nebula', 'stars', 'dust', 'world', 'sprites', 'cockpit']],
      [{ ...f1, viewMode: 1 }, ['stars', 'world', 'dust', 'warp-effect', 'cockpit']],
      [{ ...f1, viewMode: 8 }, ['cockpit']],
    ];
    // The destruction view's camera is the presentation's; a full-screen camera at the observed pose stands in for it.
    const destruction: SceneCameras = { previous: null, current: { ...camerasOf(renderFrame(f1)).current, viewMode: 0x11, subMode: 8, viewport: { left: 0, top: 0, right: 639, bottom: 479 } } };
    for (const [render, order] of views) {
      const frame = passes(render, undefined, render.viewMode === 0x11 ? destruction : undefined);
      expect(names(frame)).toEqual(['-@image', ...order.map((slot) => `${slot}@image`), '-@canvas', '-@canvas']);
      expect(frame[0]).toMatchObject({ clearColor: true, scissor: null });
      expect(frame.at(-2)).toMatchObject({ clearColor: true, clearDepth: true, target: null });
      expect(frame.at(-1)!.scene.children[0].name).toBe('flight-screen-copy');
    }
    expect(LAYER_ORDER.flight).toEqual(LAYER_ORDER.destruction);
  });

  it('gives every layer the logical transform, view, Render State, projection and world, and limits the world to its viewport', () => {
    const { composition, passes } = setup(layout(1280, 960));
    const world = testLayer('world');
    const cockpit = testLayer('cockpit');
    composition.add(world.layer);
    composition.add(cockpit.layer);
    const frame = passes(f1);
    const given = cockpit.frames[0];
    expect(given).toMatchObject({ viewMode: 0x0c, subMode: 0, view: 'flight', projection: PROJECTION, logical: { scale: 2, bufferWidth: 1280, bufferHeight: 960 } });
    expect(given.render.current).toBe(f1);
    expect(given.world!.viewport).toEqual({ x: 0, y: 0, width: 640, height: 316 });
    expect(frame.find(({ scene }) => scene === world.scene)!.scissor).toEqual({ x: 0, y: 0, width: 1280, height: 632 });
    expect(frame.find(({ scene }) => scene === cockpit.scene)!.scissor).toBeNull();
    expect(passes({ ...f1, viewMode: 8 }) && cockpit.frames.at(-1)!.world).toBeNull();
  });

  it('clears the game image\'s depth only in views 0xC and 0x11, or when it is new or its contents were lost (RS6)', () => {
    const { composition, passes } = setup();
    const warp = { ...f1, viewMode: 1 };
    expect(passes(warp)[0].clearDepth).toBe(true);
    expect(passes(warp)[0].clearDepth).toBe(false);
    expect(passes(f1)[0].clearDepth).toBe(true);
    expect(passes(warp)[0].clearDepth).toBe(false);
    composition.contentsLost();
    expect(passes(warp)[0].clearDepth).toBe(true);
    expect(passes(warp, layout(800, 600))[0].clearDepth).toBe(true);
    // Map and base frames keep the depth the last F1 frame left for the next Warp.
    expect(passes(f1)[0].clearDepth).toBe(true);
    expect(passes({ ...f1, viewMode: 8 })[0].clearDepth).toBe(false);
    expect(passes({ ...f1, viewMode: 6 })[0].clearDepth).toBe(false);
    expect(passes(warp)[0].clearDepth).toBe(false);
  });

  it('keeps one game image of the buffer\'s size in the run\'s cache and the screen copy\'s triangle', () => {
    const { cache, passes } = setup();
    const first = passes(f1);
    const image = first[0].target!;
    expect([image.width, image.height]).toEqual([640, 480]);
    expect((first.at(-1)!.scene.children[0] as Mesh<BufferGeometry, ShaderMaterial>).material.uniforms.image.value).toBe(image.texture);
    expect(cache.counts()).toMatchObject({ renderTargets: 1, geometries: 1, materials: 1, vertices: 3 });
    const dispose = vi.spyOn(image, 'dispose');
    const resized = passes(f1, layout(1280, 960))[0].target!;
    expect([resized.width, resized.height]).toEqual([1280, 960]);
    expect(dispose).toHaveBeenCalledOnce();
    expect(cache.counts()).toMatchObject({ renderTargets: COMPOSITION_GPU_PLAN.renderTargets, vertices: COMPOSITION_GPU_PLAN.vertices });
    cache.dispose();
    expect(cache.counts()).toMatchObject({ renderTargets: 0, geometries: 0, materials: 0 });
  });

  it('draws a test layer\'s logical rectangle at its scaled device rectangle and stops calling a removed layer', () => {
    const { composition, passes } = setup(layout(1280, 960));
    const quad = new Mesh(new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([100, 50, 0, 120, 50, 0, 100, 60, 0]), 3)), new MeshBasicMaterial());
    const scene = new Scene().add(quad);
    const passesOf = vi.fn((frame: CompositionFrame) => [{ scene, camera: frame.logicalCamera }]);
    const remove = composition.add({ slot: 'cockpit', passes: passesOf });
    const pass = passes(f1).find((entry) => entry.scene === scene)!;
    const corners = [0, 1, 2].map((at) => new Vector4().fromBufferAttribute(quad.geometry.getAttribute('position') as BufferAttribute, at).setW(1).applyMatrix4(pass.camera.projectionMatrix))
      .map(({ x, y }) => [((x + 1) / 2) * 1280, ((1 - y) / 2) * 960].map((value) => Math.round(value * 1e6) / 1e6));
    expect(corners).toEqual([[200, 100], [240, 100], [200, 120]]);
    remove();
    remove();
    passes(f1);
    expect(passesOf).toHaveBeenCalledOnce();
    expect(names(passes(f1))).toEqual(['-@image', '-@canvas', '-@canvas']);
  });

  it('replaces the screen copy with one screen stage at a time, and refuses malformed layers', () => {
    const { composition, passes } = setup();
    const screenScene = new Scene();
    screenScene.name = 'flash';
    const restore = composition.setScreen({ passes: (frame, image) => [{ scene: screenScene, camera: frame.logicalCamera, scissor: { x: 0, y: 2, width: 640, height: 478 } }].filter(() => image !== null) });
    expect(() => composition.setScreen({ passes: () => [] })).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
    const frame = passes(f1);
    expect(frame.at(-1)).toMatchObject({ scene: screenScene, target: null, scissor: { x: 0, y: 2, width: 640, height: 478 } });
    restore();
    restore();
    expect(passes(f1).at(-1)!.scene.children[0].name).toBe('flight-screen-copy');
    expect(() => composition.add({ slot: 'hud' as FlightLayerSlot, passes: () => [] })).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    const layer = testLayer('stars').layer;
    composition.add(layer);
    expect(() => composition.add(layer)).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
    composition.add({ slot: 'nebula', passes: () => [{ scene: null as never, camera: null as never }] });
    expect(() => passes(f1)).toThrow(expect.objectContaining({ kind: 'invalid-input', path: 'composition.nebula' }));
  });

  it('refuses a scene that does not match the view, and views it does not draw', () => {
    const { composition } = setup();
    const at = renderFrame(f1);
    expect(() => composition.passes({ logical: logicalTransform(layout()), render: at, projection: PROJECTION, scene: null }))
      .toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    const unsupported = renderFrame({ ...f1, viewMode: 0x0d });
    expect(() => composition.passes({ logical: logicalTransform(layout()), render: unsupported, projection: PROJECTION, scene: null }))
      .toThrow(expect.objectContaining({ kind: 'unsupported-view' }));
  });
});
