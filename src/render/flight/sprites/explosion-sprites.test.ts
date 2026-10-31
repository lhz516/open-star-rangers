import { Camera, DepthTexture, WebGLRenderTarget, type BufferAttribute, type DataTexture, type Mesh, type BufferGeometry, type ShaderMaterial, type Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import type { AssetId } from '../../../content/asset-id.ts';
import { readExplosionTable } from '../../../content/flight/flight-data-readers.ts';
import { syntheticExplosionTable } from '../../../content/flight/flight-data.test-support.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { ExplosionVariant } from '../../../core/world/entity-table.ts';
import type { CompositionFrame } from '../composition/flight-layers.ts';
import { LOGICAL_PIXEL_GLSL } from '../composition/logical-screen.ts';
import type { PresentationListener } from '../presentation/flight-presentation.ts';
import type { ExplosionKey, ExplosionSelection, PresentationCamera, PresentationExplosion, PresentationTick } from '../presentation/presentation-contract.ts';
import { IDENTITY, renderState, vec } from '../presentation/presentation.test-support.ts';
import { renderFrame } from '../scene/scene.test-support.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { blockDepthPixel, explosionSpritesGpuPlan, ExplosionSprites, MAX_SPRITES } from './explosion-sprites.ts';
import { projectSprite } from './sprite-rules.ts';

// Code-generated synthetic frames, palette and explosions; never original data.

const PALETTE_ID = 'palette/synthetic-data' as AssetId;
const PALETTE: PalettePayload = { kind: 'palette', entries: Uint8Array.from({ length: 768 }, (_, at) => [at / 3, 255 - at / 3, (at / 3) * 7][at % 3] & 0xff) };
const EXPLOSIONS = readExplosionTable(syntheticExplosionTable());
const F1_VIEWPORT = Object.freeze({ left: 0, top: 0, right: 639, bottom: 315 });
const CAMERA = Object.freeze({ position: vec(0), rows: IDENTITY });
const BACK_PLANE = 600;
const LOGICAL = Object.freeze({ scale: 2, bufferWidth: 1280, bufferHeight: 960 });
const LIST_1: ExplosionSelection = { list: 1, item: 0 };

/** A 3 × 2 frame whose pixel (1, 0) is transparent; the other pixels' indices are 10 × frame + pixel. */
function frameImage(frame: number, { width = 3, height = 2, display = 'direct' as ImagePayload['display'], palette = PALETTE_ID } = {}): ImagePayload {
  const indices = Uint8Array.from({ length: width * height }, (_, at) => (at === 1 ? 0 : 10 * frame + at));
  const mask = Uint8Array.from({ length: height }, (_, row) => (row === 0 ? 0xa0 : 0xe0));
  return { kind: 'image', width, height, palette, display, indices, mask };
}

const animationIds = (): AssetId[] => [...new Set(EXPLOSIONS.lists.flat().map(({ animation }) => animation.id))];
const animations = (change: Partial<Record<string, ImagePayload[]>> = {}) =>
  new Map(animationIds().map((id) => [id, change[id] ?? [0, 1, 2].map((frame) => frameImage(frame))]));

function setup(input: { animations?: ReturnType<typeof animations> } = {}) {
  let listener: PresentationListener | null = null;
  let live: PresentationExplosion[] = [];
  let advanced = 0;
  const presentation = {
    explosions: () => live,
    camera: () => ({ tick: advanced }) as PresentationCamera,
    subscribe: (next: PresentationListener) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };
  const cache = new FlightGpuCache({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' }, () => ({ width: 1280, height: 960 }));
  const sprites = new ExplosionSprites({ presentation, explosions: EXPLOSIONS, animations: input.animations ?? animations(), palette: { id: PALETTE_ID, payload: PALETTE }, resources: cache });
  const logicalCamera = new Camera();
  /** The frame drawn at `tick`, mixed from `previous` (the tick before by default) by `alpha`. */
  const depth = new DepthTexture(1280, 960);
  const frameAt = (tick: number, { alpha = 0, previous = renderState(Math.max(0, tick - 1)) } = {}) => ({
    logicalCamera, logical: LOGICAL, depth, render: renderFrame(renderState(tick), previous, alpha),
    world: { scene: { camera: CAMERA, viewport: F1_VIEWPORT, backPlane: BACK_PLANE } },
  }) as unknown as CompositionFrame;
  const frame = frameAt(10);
  return {
    sprites, cache, frame, frameAt, logicalCamera, depth,
    show: (...explosions: PresentationExplosion[]) => {
      live = explosions;
    },
    /** Notifies `tick` with the module advanced to `advancedTo`. */
    tick: (tick: number, viewMode: number, keys: readonly ExplosionKey[] = [], advancedTo = tick) => {
      const camera = { tick, position: vec(0), rows: IDENTITY, viewMode, subMode: 0, viewport: F1_VIEWPORT };
      const activations = keys.map((key) => ({ key, origin: { type: 'core', entityId: 0, eventIndex: 0 }, sourceKindBit: 7, variant: 'other', selection: LIST_1, tick, clock: 2 * tick, position: vec(0) }));
      advanced = advancedTo;
      listener?.({ ownerId: 1, runId: 1, tick, clock: 2 * tick, beforeStep: camera, afterStep: camera, activations } as unknown as PresentationTick);
    },
  };
}

function explosion(key: ExplosionKey, z: number, { variant = 'other' as ExplosionVariant, selection = LIST_1, activationTick = 10 } = {}): PresentationExplosion {
  return { key, origin: { type: 'core', entityId: 0 as never, eventIndex: 0 }, sourceKindBit: 7, variant, selection, activationTick, activationClock: 2 * activationTick, position: vec(0, 0, z), forward: vec(0, 0, 1), speed: 0 };
}

type Quad = Mesh<BufferGeometry, ShaderMaterial>;
const visibleQuads = (passes: readonly { scene: { children: unknown[] } }[]): Quad[] =>
  (passes[0]?.scene.children as Quad[] ?? []).filter(({ visible }) => visible).sort((a, b) => a.renderOrder - b.renderOrder);
const corners = (quad: Quad) => Array.from((quad.geometry.getAttribute('position') as BufferAttribute).array);
const attribute = (quad: Quad, name: string) => Array.from((quad.geometry.getAttribute(name) as BufferAttribute).array);
const keyOf = (quad: Quad) => attribute(quad, 'key')[0];
const keyAt = (z: number) => Math.fround(projectSprite(vec(0, 0, z), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)!.d / 65535);

describe('explosion sprite layer', () => {
  it('draws each recorded explosion as one quad of its blocks into its own image, nearest first, then copies it', () => {
    const { sprites, cache, frame, logicalCamera, depth, show, tick } = setup();
    tick(10, 0x0c, ['core:1', 'core:2']);
    show(explosion('core:1', 200), explosion('core:2', 100));
    const passes = sprites.passes(frame);
    expect(sprites.slot).toBe('sprites');
    expect(passes).toHaveLength(2);
    const [draw, copy] = passes;
    expect(draw.target).toBeInstanceOf(WebGLRenderTarget);
    expect([draw.target!.width, draw.target!.height, draw.target!.depthBuffer]).toEqual([1280, 960, false]);
    expect(draw).toMatchObject({ camera: logicalCamera, clearColor: true });
    expect(copy.target).toBeUndefined();
    expect(copy.camera).toBe(logicalCamera);
    const copyMaterial = (copy.scene.children[0] as Quad).material;
    expect(copyMaterial.uniforms.sprites.value).toBe(draw.target!.texture);
    expect([copyMaterial.depthTest, copyMaterial.depthWrite]).toEqual([false, false]);
    const [near, far] = visibleQuads(passes);
    expect(projectSprite(vec(0, 0, 100), CAMERA, F1_VIEWPORT, BACK_PLANE, 1)!.s).toBe(3);
    // Centre (319, 157); left = 319 − (9 SAR 1), top = 157 − (6 SAR 1); the quad is one logical pixel past the blocks.
    expect(corners(near)).toEqual([314, 153, 0, 325, 153, 0, 314, 161, 0, 325, 161, 0]);
    expect(attribute(near, 'blocks')).toEqual(Array.from({ length: 4 }, () => [315, 154, 324, 160]).flat());
    expect(attribute(near, 'place')).toEqual(Array.from({ length: 4 }, () => [315, 154, 3, 0]).flat());
    expect(attribute(near, 'key')).toEqual(Array(4).fill(keyAt(100)));
    expect(keyOf(far)).toBe(keyAt(200));
    const { uniforms } = near.material;
    expect(uniforms.depth.value).toBe(depth);
    expect([uniforms.scale.value, (uniforms.logicalBuffer.value as Vector2).toArray()]).toEqual([2, [1280, 960]]);
    expect([near.material.depthTest, near.material.depthWrite]).toEqual([false, false]);
    expect(cache.counts()).toMatchObject({ renderTargets: 1 });
  });

  it('tests each block at the device pixel holding its top-left logical pixel, rows bottom up, inside the buffer', () => {
    expect(blockDepthPixel(0, 0, { scale: 1, bufferWidth: 640, bufferHeight: 480 })).toEqual({ column: 0, row: 479 });
    expect(blockDepthPixel(315, 154, LOGICAL)).toEqual({ column: 631, row: 960 - 1 - 309 });
    expect(blockDepthPixel(10, 20, { scale: 1.5, bufferWidth: 960, bufferHeight: 720 })).toEqual({ column: 15, row: 720 - 1 - 30 });
    expect(blockDepthPixel(639, 479, { scale: 1.5, bufferWidth: 960, bufferHeight: 719 })).toEqual({ column: 959, row: 0 });
  });

  it('gives a clipped sprite its kept blocks and their first frame pixel\'s place', () => {
    const { sprites, frame, show, tick } = setup();
    tick(10, 0x0c, ['core:1']);
    // Centre (2, 157): left = −2, so block column 0 is clipped and the blocks start at logical x 1.
    show({ ...explosion('core:1', 100), position: vec((-317.5 * 100) / 639, 0, 100) });
    const [quad] = visibleQuads(sprites.passes(frame));
    expect(attribute(quad, 'place')).toEqual(Array.from({ length: 4 }, () => [-2, 154, 3, 0]).flat());
    expect(attribute(quad, 'blocks')).toEqual(Array.from({ length: 4 }, () => [1, 154, 7, 160]).flat());
    expect(corners(quad)).toEqual([0, 153, 0, 8, 153, 0, 0, 161, 0, 8, 161, 0]);
  });

  it('shows in each device pixel the frame pixel of its logical pixel\'s block by the shared rule, never another frame\'s', () => {
    const { sprites, frame, show, tick } = setup();
    tick(10, 0x0c, ['core:1']);
    show(explosion('core:1', 100));
    const { fragmentShader } = visibleQuads(sprites.passes(frame))[0].material;
    // The fragment's integer arithmetic, which shaderTexel below evaluates.
    expect(fragmentShader).toContain(LOGICAL_PIXEL_GLSL);
    expect(fragmentShader).toContain('ivec2 pixel = logicalPixel();');
    expect(fragmentShader).toContain('if (any(lessThan(pixel, blocks.xy)) || any(greaterThanEqual(pixel, blocks.zw))) discard;');
    expect(fragmentShader).toContain('ivec2 source = (pixel - origin) / s;');
    expect(fragmentShader).toContain('texelFetch(frames, ivec2(source.x, int(vPlace.w) + source.y), 0)');
    expect(fragmentShader).toContain('ivec2 at = ivec2(floor((vec2(origin + s * source) + 0.5) * scale));');
    /** The stacked-frame texel device pixel (column, row) reads, or null when it is discarded. */
    const shaderTexel = (column: number, row: number, width: number, [left, top, s, first]: number[], [x0, y0, x1, y1]: number[]) => {
      const x = Math.min(639, Math.trunc(((2 * column + 1) * 320) / width));
      const y = Math.min(479, Math.trunc(((2 * row + 1) * 320) / width));
      if (x < x0 || y < y0 || x >= x1 || y >= y1) return null;
      return [Math.trunc((x - left) / s), first + Math.trunc((y - top) / s)];
    };
    // A 3 × 2 frame, shown as frame 1 of 3, with block edges on logical edges where device pixel centres lie exactly
    // (from logical 12, so that every block stays on the screen).
    const [w, h, frameRow] = [3, 2, 2];
    let edgeChecks = 0;
    for (const width of [485, 576, 800, 960, 1066]) {
      const edges = Array.from({ length: 300 }, (_, b) => b + 12).filter((b) => (b * width) % 320 === 0 && ((b * width) / 320) % 2 === 1);
      expect(edges.length, `${width}`).toBeGreaterThan(0);
      for (const s of [1, 2, 3]) for (const edge of edges.slice(0, 2)) for (const k of [0, 1, 2, w]) {
        const left = edge - s * k;
        const top = edge - s * Math.min(k, h);
        const place = [left, top, s, frameRow];
        const blocks = [left, top, left + w * s, top + h * s];
        const device = (logical: number) => Math.floor((logical * width) / 640);
        for (let row = device(top - 2); row <= device(top + h * s + 2); row++) {
          for (let column = device(left - 2); column <= device(left + w * s + 2); column++) {
            const centre = { x: ((2 * column + 1) * 320) / width, y: ((2 * row + 1) * 320) / width };
            // The logical pixel whose [x, x + 1) holds the centre: on an edge, the later one.
            const [x, y] = [Math.floor(centre.x), Math.floor(centre.y)];
            const inside = x >= blocks[0] && x < blocks[2] && y >= blocks[1] && y < blocks[3];
            const texel = shaderTexel(column, row, width, place, blocks);
            expect(texel, `${width} s ${s} at ${left},${top}: ${column},${row}`)
              .toEqual(inside ? [Math.floor((x - left) / s), frameRow + Math.floor((y - top) / s)] : null);
            if (texel !== null) {
              expect(texel[1] >= frameRow && texel[1] < frameRow + h).toBe(true);
              // The quad, one logical pixel past the blocks, covers the centre.
              expect(centre.x > blocks[0] - 1 && centre.x < blocks[2] + 1 && centre.y > blocks[1] - 1 && centre.y < blocks[3] + 1).toBe(true);
            }
            if (Number.isInteger(centre.x) || Number.isInteger(centre.y)) edgeChecks++;
          }
        }
      }
    }
    expect(edgeChecks).toBeGreaterThan(0);
  });

  it('keeps one sprite image of the buffer\'s size, acquired again after a layout change', () => {
    const { sprites, cache, frameAt, show, tick } = setup();
    tick(10, 0x0c, ['core:1']);
    show(explosion('core:1', 100));
    const first = sprites.passes(frameAt(10))[0].target!;
    const resized = sprites.passes({ ...frameAt(10), logical: { scale: 1, bufferWidth: 640, bufferHeight: 480 } })[0].target!;
    expect([resized.width, resized.height]).toEqual([640, 480]);
    expect(resized).not.toBe(first);
    expect(cache.counts().renderTargets).toBe(1);
  });

  it('shows the recorded frame of the stacked texture, transparent pixels with alpha 0, under the DATA palette', () => {
    const { sprites, frame, show, tick } = setup();
    tick(10, 0x0c, ['core:1']);
    show(explosion('core:1', 100));
    for (let at = 11; at <= 13; at++) tick(at, 0x0c);
    const [quad] = visibleQuads(sprites.passes(frame));
    // Frame 1 from tick 13: its first row is row 2 of the stacked frames.
    expect(attribute(quad, 'place')).toEqual(Array.from({ length: 4 }, () => [315, 154, 3, 2]).flat());
    const texture = quad.material.uniforms.frames.value as DataTexture;
    expect([texture.image.width, texture.image.height]).toEqual([3, 6]);
    const data = texture.image.data as Uint8Array;
    const pixel = (x: number, y: number) => Array.from(data.subarray((y * 3 + x) * 4, (y * 3 + x) * 4 + 4));
    const colour = (index: number) => [...PALETTE.entries.subarray(index * 3, index * 3 + 3), 255];
    expect(pixel(0, 0)).toEqual(colour(0));
    expect(pixel(1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(2, 3)).toEqual(colour(15));
    expect(pixel(1, 5)).toEqual(colour(24));
  });

  it('draws nothing for an explosion hidden, never recorded, off the queue or clipped away, nor without a world', () => {
    const { sprites, frame, show, tick } = setup();
    tick(10, 8, ['core:1']);
    tick(11, 0x0c, ['core:2', 'core:3']);
    show(explosion('core:1', 100), explosion('core:2', 0.5), explosion('core:3', 100, { activationTick: 11 }));
    expect(visibleQuads(sprites.passes(frame))).toHaveLength(1);
    for (let at = 12; at <= 18; at++) tick(at, 0x0c);
    expect(sprites.passes(frame)).toEqual([]);
    expect(sprites.passes({ ...frame, world: null })).toEqual([]);
  });

  it('reuses its quads from the run cache and hides the unused ones', () => {
    const { sprites, cache, frame, show, tick } = setup();
    tick(10, 0x0c, ['core:1', 'core:2']);
    show(explosion('core:1', 100), explosion('core:2', 200, { variant: 'large' }));
    const first = sprites.passes(frame);
    expect(cache.counts()).toMatchObject({ geometries: 3, materials: 2, textures: 1, texels: 18, vertices: 11, indices: 12, renderTargets: 1 });
    show(explosion('core:2', 200, { variant: 'large' }));
    const second = sprites.passes(frame);
    expect(second[0].scene).toBe(first[0].scene);
    expect(visibleQuads(second)).toHaveLength(1);
    expect(second[0].scene.children).toHaveLength(2);
    expect(cache.counts().geometries).toBe(3);
  });

  it('mixes positions from those after the previous tick, however ticks are grouped into frames, unless the frame folds or the explosion is new', () => {
    const { sprites, frameAt, show, tick } = setup();
    const quadAt = keyAt;
    const depth = (passes: ReturnType<typeof sprites.passes>) => keyOf(visibleQuads(passes)[0]);
    // The presentation module shows each tick's positions when it notifies that tick.
    show(explosion('core:1', 100));
    tick(10, 0x0c, ['core:1']);
    show(explosion('core:1', 200));
    tick(11, 0x0c);
    expect(depth(sprites.passes(frameAt(11, { alpha: 0.5 })))).toBe(quadAt(150));
    // A redraw of the same tick still mixes from tick 10.
    expect(depth(sprites.passes(frameAt(11, { alpha: 0.25 })))).toBe(quadAt(125));
    // A view change folds the frame.
    expect(depth(sprites.passes(frameAt(11, { alpha: 0.5, previous: renderState(10, { viewMode: 8 }) })))).toBe(quadAt(200));
    // Ticks 12 to 14 advance in one frame: tick 14 mixes from tick 13's positions, which no frame drew.
    for (const [at, z] of [[12, 300], [13, 100], [14, 300]]) {
      show(explosion('core:1', z));
      tick(at, 0x0c);
    }
    expect(depth(sprites.passes(frameAt(14, { alpha: 0.5 })))).toBe(quadAt(200));
    expect(depth(sprites.passes(frameAt(14)))).toBe(quadAt(100));
    // An explosion activated at the current tick is not mixed with an earlier one of the same key.
    show(explosion('core:1', 200, { activationTick: 15 }));
    tick(15, 0x0c, ['core:1']);
    expect(depth(sprites.passes(frameAt(15, { alpha: 0.5 })))).toBe(quadAt(200));
  });

  it('refuses a tick notified after the module advanced past it, whose positions it no longer shows', () => {
    const { tick } = setup();
    tick(10, 0x0c, ['core:1']);
    expect(() => tick(11, 0x0c, [], 12)).toThrow(expect.objectContaining({ kind: 'invalid-state', path: 'sprites.presentation' }));
  });

  it('must be created before the run has an explosion', () => {
    const presentation = { explosions: () => [explosion('core:1', 100)], subscribe: () => () => undefined, camera: () => ({ tick: 0 }) as PresentationCamera };
    const cache = new FlightGpuCache({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' }, () => ({ width: 640, height: 480 }));
    expect(() => new ExplosionSprites({ presentation, explosions: EXPLOSIONS, animations: animations(), palette: { id: PALETTE_ID, payload: PALETTE }, resources: cache }))
      .toThrow(expect.objectContaining({ kind: 'invalid-state', path: 'sprites' }));
  });

  it('stops following the ticks once disposed', () => {
    const { sprites, frame, show, tick } = setup();
    sprites.dispose();
    sprites.dispose();
    tick(10, 0x0c, ['core:1']);
    show(explosion('core:1', 100));
    expect(sprites.passes(frame)).toEqual([]);
  });

  it('plans every animation of the table and a quad per possible sprite', () => {
    expect(explosionSpritesGpuPlan({ explosions: EXPLOSIONS, animations: animations() })).toEqual({
      texels: animationIds().length * 18, vertices: 4 * MAX_SPRITES + 3, indices: 6 * MAX_SPRITES, renderTargets: 1,
    });
  });

  it.each([
    ['a missing animation', () => animations({ 'data/synthetic-animation/04': [] }), 'sprites.animations[data/synthetic-animation/04]'],
    ['a frame of another palette', () => animations({ 'data/synthetic-animation/01': [frameImage(0, { palette: 'palette/other' as AssetId })] }), 'sprites.animations[data/synthetic-animation/01][0]'],
    ['a nearest-colour frame', () => animations({ 'data/synthetic-animation/01': [frameImage(0, { display: { nearest: PALETTE_ID } })] }), 'sprites.animations[data/synthetic-animation/01][0]'],
    ['frames of two sizes', () => animations({ 'data/synthetic-animation/02': [frameImage(0), frameImage(1, { width: 4 })] }), 'sprites.animations[data/synthetic-animation/02][1]'],
  ])('refuses %s', (_name, make, path) => {
    expect(() => setup({ animations: make() })).toThrow(expect.objectContaining({ kind: 'invalid-input', path }));
  });
});
