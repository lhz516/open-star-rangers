import type { DataTexture, Mesh, ShaderMaterial } from 'three';
import { Camera } from 'three';
import { describe, expect, it } from 'vitest';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { scriptedRand } from '../../../core/rules/rand.test-support.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import type { CompositionFrame, LayerPass } from '../composition/flight-layers.ts';
import { yaw } from '../nebula/nebula.test-support.ts';
import { renderState, vec } from '../presentation/presentation.test-support.ts';
import type { PresentationCamera } from '../presentation/presentation-contract.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { renderFrame } from '../scene/scene.test-support.ts';
import { IDENTITY_ROWS as IDENTITY } from '../scene/drawn-pose.ts';
import type { SpeedDustTick } from './speed-dust.ts';
import { drawStars } from './star-field.ts';
import {
  createSpeedDustLayer, createStarFieldLayer, logicalPixelIndex, SPEED_DUST_GPU_PLAN, STAR_FIELD_GPU_PLAN,
} from './starfield-layers.ts';

// Code-generated palette, states and rand values; never original data.

const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });
const colourOf = (index: number): [number, number, number] => [index * 30, 255 - index * 20, (index * 37) % 256];
const palette: PalettePayload = Object.freeze({ kind: 'palette', entries: new Uint8Array(Array.from({ length: 256 }, (_, index) => colourOf(index)).flat()) });
const F1 = 0x0c;
const WARP = 1;
const DESTRUCTION = 0x11;

const viewportOf = (viewMode: number) => Object.freeze({ left: 0, top: 0, right: 639, bottom: viewMode === DESTRUCTION ? 479 : 315 });

function setup(draws: readonly number[] = []) {
  const cache = new FlightGpuCache(BINDING, () => ({ width: 640, height: 480 }));
  const random = scriptedRand(draws);
  const logicalCamera = new Camera();
  const frame = (current: RenderState, rows: Matrix3 | null = IDENTITY): CompositionFrame => ({
    view: current.viewMode === WARP ? 'warp' : current.viewMode === DESTRUCTION ? 'destruction' : 'flight', logicalCamera,
    render: renderFrame(current),
    world: rows === null ? null : { scene: { camera: { position: vec(0), rows }, viewport: viewportOf(current.viewMode) } },
  }) as unknown as CompositionFrame;
  return { cache, random, logicalCamera, frame };
}

function dustTick(tick: number, { viewMode = F1, share = 100, z = 0, rows = IDENTITY }: { viewMode?: number; share?: number; z?: number; rows?: Matrix3 } = {}): SpeedDustTick {
  const subMode = viewMode === DESTRUCTION ? 8 : 0;
  const render: RenderState = Object.freeze({ ...renderState(tick, { viewMode, subMode, observedEntityId: 1 }), speedShare: share });
  const camera: PresentationCamera = Object.freeze({ tick, position: vec(0, 0, z), rows, viewMode, subMode, viewport: viewportOf(viewMode) });
  return { render, events: [], camera };
}

function image(passes: readonly LayerPass[]) {
  expect(passes).toHaveLength(1);
  const mesh = passes[0].scene.children[0] as Mesh;
  const texture = (mesh.material as ShaderMaterial).uniforms.image.value as DataTexture;
  const data = texture.image.data as Uint8Array;
  const opaque: number[] = [];
  for (let at = 0; at < data.length / 4; at++) if (data[at * 4 + 3] === 255) opaque.push(at);
  return { mesh, texture, data, opaque };
}

const rgbaAt = (data: Uint8Array, x: number, y: number): number[] => [...data.subarray((y * 640 + x) * 4, (y * 640 + x) * 4 + 4)];

describe('star-field and speed-dust layers (AC-23)', () => {
  it('allocate their plans in the run\'s cache and draw in the stars and dust slots without depth', () => {
    const { cache, frame, logicalCamera } = setup(Array<number>(150).fill(16384));
    const stars = createStarFieldLayer({ cache, palette });
    const dust = createSpeedDustLayer({ cache, palette, random: scriptedRand(Array<number>(150).fill(16384)) });
    expect([stars.slot, dust.slot]).toEqual(['stars', 'dust']);
    expect(STAR_FIELD_GPU_PLAN).toEqual({ texels: 640 * 480, vertices: 4, indices: 6, renderTargets: 0 });
    expect(cache.counts()).toEqual({
      geometries: 2, materials: 2, textures: 2, renderTargets: 0,
      vertices: STAR_FIELD_GPU_PLAN.vertices + SPEED_DUST_GPU_PLAN.vertices, indices: STAR_FIELD_GPU_PLAN.indices + SPEED_DUST_GPU_PLAN.indices,
      texels: STAR_FIELD_GPU_PLAN.texels + SPEED_DUST_GPU_PLAN.texels,
    });
    dust.step(dustTick(1));
    for (const passes of [stars.passes(frame(renderState(1))), dust.passes(frame(renderState(1)))]) {
      expect(passes[0].camera).toBe(logicalCamera);
      expect(passes[0]).not.toHaveProperty('target');
      expect(passes[0]).not.toHaveProperty('clearDepth');
      const material = image(passes).mesh.material as ShaderMaterial;
      expect([material.depthTest, material.depthWrite]).toEqual([false, false]);
    }
    cache.dispose();
    expect(cache.counts().texels).toBe(0);
  });

  it('rejects a palette without colours 0–7', () => {
    const { cache } = setup();
    const short: PalettePayload = { kind: 'palette', entries: new Uint8Array(7 * 3) };
    expect(() => createStarFieldLayer({ cache, palette: short })).toThrow(FlightRenderError);
    expect(() => createSpeedDustLayer({ cache, palette: short, random: scriptedRand([]) })).toThrow(/at least 8 entries/);
  });
});

describe('star-field layer (AC-23)', () => {
  it('draws every star of the world\'s rows in its DATA colour, opaque, and nothing else', () => {
    const { cache, frame } = setup();
    const layer = createStarFieldLayer({ cache, palette });
    for (const [viewMode, rows] of [[F1, IDENTITY], [DESTRUCTION, yaw(0.8)], [WARP, yaw(-1.3)]] as const) {
      const expected = new Map<number, number>();
      drawStars(rows, viewportOf(viewMode).bottom, (sx, sy, colour) => expected.set(sy * 640 + sx, colour));
      const { data, opaque } = image(layer.passes(frame(renderState(1, { viewMode }), rows)));
      expect(opaque).toEqual([...expected.keys()].sort((a, b) => a - b));
      for (const [at, colour] of expected) expect([...data.subarray(at * 4, at * 4 + 4)]).toEqual([...colourOf(colour), 255]);
    }
    expect(image(layer.passes(frame(renderState(1)))).opaque).toHaveLength(57);
  });

  it('draws nothing without a world, and refills only when the rows or the viewport bottom change', () => {
    const { cache, frame } = setup();
    const layer = createStarFieldLayer({ cache, palette });
    expect(layer.passes(frame(renderState(1), null))).toEqual([]);
    const { texture } = image(layer.passes(frame(renderState(1))));
    const version = texture.version;
    layer.passes(frame(renderState(2), [...IDENTITY] as unknown as Matrix3));
    expect(texture.version).toBe(version);
    expect(image(layer.passes(frame(renderState(3, { viewMode: DESTRUCTION })))).opaque).toHaveLength(68);
    expect(texture.version).toBe(version + 1);
  });

  it('writes past the last column on the next row and drops a write past the screen, as the frame buffer does', () => {
    expect(logicalPixelIndex(640, 10)).toBe(11 * 640);
    expect(logicalPixelIndex(639, 479)).toBe(640 * 480 - 1);
    expect(logicalPixelIndex(640, 479)).toBe(-1);
  });
});

describe('speed-dust layer (AC-23)', () => {
  const centred = (count = 150) => Array<number>(count).fill(16384);

  it('draws nothing before its first tick and draws the latest tick\'s marks in their DATA colours', () => {
    const { cache, frame } = setup();
    const layer = createSpeedDustLayer({ cache, palette, random: scriptedRand(centred()) });
    expect(layer.passes(frame(renderState(0)))).toEqual([]);
    layer.step(dustTick(1));
    const { data, opaque } = image(layer.passes(frame(renderState(1))));
    expect(opaque).toEqual([157 * 640 + 319]);
    expect(rgbaAt(data, 319, 157)).toEqual([...colourOf(7), 255]);
  });

  it('rejects drawing a Render State other than the last stepped tick\'s', () => {
    const { cache, frame } = setup();
    const layer = createSpeedDustLayer({ cache, palette, random: scriptedRand(centred()) });
    layer.step(dustTick(1));
    expect(() => layer.passes(frame(renderState(2)))).toThrow(/tick 2 after stepping tick 1/);
  });

  it('draws nothing for a tick whose share is at most 1', () => {
    const { cache, frame } = setup();
    const layer = createSpeedDustLayer({ cache, palette, random: scriptedRand(centred()) });
    layer.step(dustTick(1, { share: 1 }));
    expect(layer.passes(frame(renderState(1)))).toEqual([]);
  });

  it('rasterises Warp marks as lines from the previous tick\'s position', () => {
    const { cache, frame } = setup();
    const layer = createSpeedDustLayer({ cache, palette, random: scriptedRand(centred()) });
    layer.step(dustTick(1, { viewMode: WARP }));
    layer.step(dustTick(2, { viewMode: WARP, rows: yaw(0.05) }));
    const { data, opaque } = image(layer.passes(frame(renderState(2, { viewMode: WARP }))));
    expect(opaque.length).toBeGreaterThan(1);
    expect(rgbaAt(data, 319, 157)).toEqual([...colourOf(2), 255]);
    expect(opaque.every((at) => Math.floor(at / 640) === 157)).toBe(true);
  });

  it('gives the same image and draws after 0, 1 and 5 ticks a frame as when stepped tick by tick', () => {
    const draws = Array.from({ length: 2000 }, (_, at) => (at * 7919 + 13) % 32768);
    const ticks = Array.from({ length: 10 }, (_, at) => dustTick(at + 1, { z: 40 * at, rows: yaw(0.01 * at) }));
    const each = setup();
    const eachRandom = scriptedRand(draws);
    const eachLayer = createSpeedDustLayer({ cache: each.cache, palette, random: eachRandom });
    const images: number[][] = [];
    for (const tick of ticks) {
      eachLayer.step(tick);
      images.push(image(eachLayer.passes(each.frame(tick.render))).opaque);
    }
    expect(images.filter((opaque) => opaque.length > 0).length).toBeGreaterThan(5);
    const batched = setup();
    const batchedRandom = scriptedRand(draws);
    const batchedLayer = createSpeedDustLayer({ cache: batched.cache, palette, random: batchedRandom });
    batchedLayer.step(ticks[0]);
    expect(image(batchedLayer.passes(batched.frame(ticks[0].render))).opaque).toEqual(images[0]);
    // A frame without a tick redraws the same image without drawing or refilling.
    const { texture } = image(batchedLayer.passes(batched.frame(ticks[0].render)));
    const [used, version] = [batchedRandom.used, texture.version];
    expect(image(batchedLayer.passes(batched.frame(ticks[0].render))).opaque).toEqual(images[0]);
    expect([batchedRandom.used, texture.version]).toEqual([used, version]);
    for (const tick of ticks.slice(1, 6)) batchedLayer.step(tick);
    expect(image(batchedLayer.passes(batched.frame(ticks[5].render))).opaque).toEqual(images[5]);
    for (const tick of ticks.slice(6)) batchedLayer.step(tick);
    const last = image(batchedLayer.passes(batched.frame(ticks[9].render)));
    const lastEach = image(eachLayer.passes(each.frame(ticks[9].render)));
    expect(last.opaque).toEqual(images[9]);
    expect(Buffer.from(last.data).equals(Buffer.from(lastEach.data))).toBe(true);
    expect(batchedRandom.used).toBe(eachRandom.used);
  });
});
