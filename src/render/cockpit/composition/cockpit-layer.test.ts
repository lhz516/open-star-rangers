import { Camera, Vector2, type DataTexture, type Mesh, type ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { CompositionFrame } from '../../flight/composition/flight-layers.ts';
import { LOGICAL_PIXEL_GLSL } from '../../flight/composition/logical-screen.ts';
import { FlightGpuCache } from '../../flight/renderer/flight-gpu-cache.ts';
import type { CockpitDrawContext, CockpitModule, CockpitPresentation } from '../presentation/cockpit-contract.ts';
import {
  BASE_VIEW, cockpitBatch, cockpitTick, createTestPresentation, DESTRUCTION_SUB_MODE, EXTERNAL_VIEW, FLIGHT_VIEW, MAP_VIEW, viewSwitched,
} from '../presentation/cockpit.test-support.ts';
import { fillRect } from '../raster/indexed-surface.ts';
import { COCKPIT_GPU_PLAN, createCockpitLayer } from './cockpit-layer.ts';
import { syntheticPalette } from './cockpit-run.test-support.ts';

// P3-13/24 (docs/plan/p3/13/spec.md, 二维绘制语义与调色板; DC-05, DC-08): the cockpit layer's picture of the two
// surfaces under the layout's palette.

const FLIGHT = syntheticPalette(1);
const MAP = syntheticPalette(2);

/** Paints index 7 at (10, 100) in the world rows and index 9 at (10, 400) in the band, published, every display. */
const painter: CockpitModule = {
  name: 'painter',
  global(context: CockpitDrawContext) {
    fillRect(context.back, 10, 100, 10, 100, 7);
    fillRect(context.back, 10, 400, 10, 400, 9);
    context.publish({ x0: 10, y0: 400, x1: 10, y1: 400 });
  },
};

function setup(viewMode = FLIGHT_VIEW, subMode = 0) {
  const presentation = createTestPresentation({ modules: [painter], viewMode, subMode });
  const cache = new FlightGpuCache({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' }, () => ({ width: 1280, height: 960 }));
  const layer = createCockpitLayer({ cache, presentation, palettes: { flight: FLIGHT, map: MAP } });
  const frame = { logical: { scale: 2, bufferWidth: 1280, bufferHeight: 960 }, logicalCamera: new Camera() } as unknown as CompositionFrame;
  const draw = () => layer.passes(frame);
  const texture = () => (((draw()[0]?.scene.children[0] as Mesh | undefined)?.material as ShaderMaterial | undefined)?.uniforms.picture.value as DataTexture | undefined);
  const rgba = (x: number, y: number): number[] => {
    const data = texture()!.image.data as Uint8Array;
    return [...data.subarray((y * 640 + x) * 4, (y * 640 + x) * 4 + 4)];
  };
  return { presentation, cache, layer, draw, texture, rgba };
}

const colour = (palette: typeof FLIGHT, index: number): number[] => [...palette.entries.subarray(index * 3, index * 3 + 3), 255];
const TRANSPARENT = [0, 0, 0, 0];

function advance(presentation: CockpitPresentation, tick: number, viewMode: number, from = viewMode, subMode = 0): void {
  presentation.advance(cockpitBatch([cockpitTick(tick, { viewMode, subMode, events: from === viewMode ? [] : [viewSwitched(tick, from, viewMode, subMode)] })]));
}

describe('cockpit layer', () => {
  it('acquires one 640 × 480 picture, a material and a geometry without vertices from the run\'s cache, as planned', () => {
    const { cache } = setup();
    expect(cache.counts()).toMatchObject({ textures: 1, materials: 1, geometries: 1, renderTargets: 0, vertices: 0, indices: 0, texels: COCKPIT_GPU_PLAN.texels });
  });

  it('shows S opaque in the F1 band and only B\'s covered pixels in the world rows, in the flight palette', () => {
    const { presentation, layer, draw, rgba } = setup();
    // Tick 0: S is all 0, B covers nothing.
    expect(draw()).toHaveLength(1);
    expect(rgba(10, 400)).toEqual(colour(FLIGHT, 0));
    expect(rgba(10, 100)).toEqual(TRANSPARENT);
    advance(presentation, 1, FLIGHT_VIEW);
    layer.changed();
    expect(rgba(10, 400)).toEqual(colour(FLIGHT, 9));
    expect(rgba(10, 100)).toEqual(colour(FLIGHT, 7));
    expect(rgba(11, 100)).toEqual(TRANSPARENT);
    expect(rgba(11, 400)).toEqual(colour(FLIGHT, 0));
  });

  it('resolves the surfaces again only after `changed`, so frames without ticks show the same picture', () => {
    const { presentation, layer, texture, rgba } = setup();
    const version = texture()!.version;
    expect(texture()!.version).toBe(version);
    advance(presentation, 1, FLIGHT_VIEW);
    expect(rgba(10, 100)).toEqual(TRANSPARENT);
    layer.changed();
    expect(rgba(10, 100)).toEqual(colour(FLIGHT, 7));
    expect(texture()!.version).toBe(version + 1);
  });

  it('shows the whole map screen opaque in the map palette, and only covered pixels in the destruction view', () => {
    const map = setup(FLIGHT_VIEW);
    advance(map.presentation, 1, MAP_VIEW, FLIGHT_VIEW);
    map.layer.changed();
    expect(map.rgba(10, 100)).toEqual(colour(MAP, 7));
    expect(map.rgba(11, 100)).toEqual(colour(MAP, 0));
    expect(map.rgba(10, 400)).toEqual(colour(MAP, 9));

    const external = setup(EXTERNAL_VIEW, DESTRUCTION_SUB_MODE);
    advance(external.presentation, 1, EXTERNAL_VIEW, EXTERNAL_VIEW, DESTRUCTION_SUB_MODE);
    external.layer.changed();
    expect(external.rgba(10, 100)).toEqual(colour(FLIGHT, 7));
    expect(external.rgba(10, 400)).toEqual(colour(FLIGHT, 9));
    expect(external.rgba(11, 400)).toEqual(TRANSPARENT);
  });

  it('draws nothing in the base view, in views without a cockpit, and once the presentation is gone', () => {
    expect(setup(BASE_VIEW).draw()).toEqual([]);
    expect(setup(0x13).draw()).toEqual([]);
    const { presentation, draw } = setup();
    presentation.dispose();
    expect(draw()).toEqual([]);
  });

  it('samples each device pixel\'s logical pixel at the frame\'s scale, without testing or writing depth', () => {
    const { draw } = setup();
    const [pass] = draw();
    const { material } = pass.scene.children[0] as Mesh;
    expect((material as ShaderMaterial).fragmentShader).toContain(LOGICAL_PIXEL_GLSL);
    expect((material as ShaderMaterial).uniforms.logicalBuffer.value).toEqual(new Vector2(1280, 960));
    expect(material).toMatchObject({ depthTest: false, depthWrite: false });
    expect(pass).toEqual({ scene: pass.scene, camera: expect.any(Camera) });
  });
});
