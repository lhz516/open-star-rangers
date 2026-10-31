/**
 * The browser harness of the scaled explosion sprite regression (P3-16/19; docs/plan/p3/12/spec.md AC-05, AC-13,
 * AC-16), loaded by `e2e/flight-sprite-scaling.development.spec.ts` from the development server only: the real
 * `ExplosionSprites` layer on a real WebGL 2 context, drawing a code-generated animation of three distinct frames at its
 * middle frame into a black game image. Every opaque frame pixel has its own palette index, which is its red, so a
 * device pixel's red names the frame and frame pixel it shows. Nothing here is part of a production build.
 */
import { Camera, DepthTexture, NearestFilter, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { AssetId } from '../../../content/asset-id.ts';
import { readExplosionTable } from '../../../content/flight/flight-data-readers.ts';
import { syntheticExplosionTable } from '../../../content/flight/flight-data.test-support.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import { explosionFrame } from '../../../core/rules/explosions.ts';
import type { CompositionFrame } from '../composition/flight-layers.ts';
import { setLogicalCamera } from '../composition/logical-screen.ts';
import type { PresentationListener } from '../presentation/flight-presentation.ts';
import type { PresentationCamera, PresentationExplosion, PresentationTick } from '../presentation/presentation-contract.ts';
import { IDENTITY, renderState, vec } from '../presentation/presentation.test-support.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { renderFrame } from '../scene/scene.test-support.ts';
import { ExplosionSprites } from './explosion-sprites.ts';
import { projectSprite, spriteVariant } from './sprite-rules.ts';

/** The synthetic animation: `frames` frames of `width` × `height`, drawn at frame `shown`. */
export const SCALING_ANIMATION = Object.freeze({ width: 9, height: 9, frames: 3, shown: 1 });

/** Whether frame pixel (i, j) is opaque; the same in every frame. */
export const scalingOpaque = (i: number, j: number): boolean => (i * 7 + j * 3 + ((i * j) % 4)) % 5 !== 0;

/** The palette index, and so the red, of frame pixel (i, j) of `frame`: unique over the stacked frames, never 0. */
export const scalingIndex = (frame: number, i: number, j: number): number => {
  const { width, height } = SCALING_ANIMATION;
  return 1 + frame * width * height + j * width + i;
};

/** A sprite to draw: scale s and its block (0, 0) at logical (left, top). */
export interface SpritePlacement {
  readonly s: number;
  readonly left: number;
  readonly top: number;
}

/** A drawn sprite's device pixels: the red of `region` (rows from the top), base64, row by row. */
export interface SpriteReadout extends SpritePlacement {
  readonly region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly red: string;
}

const PALETTE_ID = 'palette/synthetic-sprite-scaling' as AssetId;
const PALETTE: PalettePayload = { kind: 'palette', entries: Uint8Array.from({ length: 768 }, (_, at) => (at % 3 === 0 ? at / 3 : 0)) };
const EXPLOSIONS = readExplosionTable(syntheticExplosionTable());
const SELECTION = Object.freeze({ list: 1, item: 0 });
const VIEWPORT = Object.freeze({ left: 0, top: 0, right: 639, bottom: 315 });
const CAMERA = Object.freeze({ position: vec(0), rows: IDENTITY });
const BACK_PLANE = 600;
const ACTIVATION = { tick: 10, clock: 20 };

function frameImage(frame: number): ImagePayload {
  const { width, height } = SCALING_ANIMATION;
  const stride = (width + 7) >> 3;
  const indices = new Uint8Array(width * height);
  const mask = new Uint8Array(stride * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      indices[j * width + i] = scalingIndex(frame, i, j);
      if (scalingOpaque(i, j)) mask[j * stride + (i >> 3)] |= 0x80 >> (i & 7);
    }
  }
  return { kind: 'image', width, height, palette: PALETTE_ID, display: 'direct', indices, mask };
}

/** A world position whose sprite has block (0, 0) at (left, top) and scale s. */
function positionOf({ s, left, top }: SpritePlacement) {
  const half = (SCALING_ANIMATION.width * s) >> 1;
  const sx = left + half;
  const sy = top + ((SCALING_ANIMATION.height * s) >> 1);
  const z = [1.2, 2, 5][s - 1];
  const variant = spriteVariant('other', SELECTION);
  const offset = (delta: number): number => delta + (delta >= 0 ? 0.5 : -0.5);
  const at = vec((offset(sx - (VIEWPORT.right >> 1)) * z) / VIEWPORT.right, (-offset(sy - (VIEWPORT.bottom >> 1)) * z) / VIEWPORT.right, z);
  const projected = projectSprite(at, CAMERA, VIEWPORT, BACK_PLANE, variant);
  if (projected?.sx !== sx || projected.sy !== sy || projected.s !== s) throw new Error(`no position draws block (0, 0) at (${left}, ${top}) with s = ${s}`);
  return at;
}

/** The sprite layer with one explosion activated and stepped to the shown frame; `show` moves it. */
function spriteLayer(cache: FlightGpuCache) {
  let listener: PresentationListener | null = null;
  let live: PresentationExplosion[] = [];
  let tick = 0;
  const presentation = {
    explosions: () => live,
    camera: () => ({ tick }) as PresentationCamera,
    subscribe: (next: PresentationListener) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };
  const animations = new Map([...new Set(EXPLOSIONS.lists.flat().map(({ animation }) => animation.id))]
    .map((id) => [id, Array.from({ length: SCALING_ANIMATION.frames }, (_, frame) => frameImage(frame))]));
  const sprites = new ExplosionSprites({ presentation, explosions: EXPLOSIONS, animations, palette: { id: PALETTE_ID, payload: PALETTE }, resources: cache });
  const notify = (at: number, clock: number, activations: readonly unknown[]) => {
    tick = at;
    const camera = { tick: at, position: vec(0), rows: IDENTITY, viewMode: 0x0c, subMode: 0, viewport: VIEWPORT };
    listener?.({ ownerId: 1, runId: 1, tick: at, clock, beforeStep: camera, afterStep: camera, activations } as unknown as PresentationTick);
  };
  const origin = { type: 'core', entityId: 0, eventIndex: 0 };
  notify(ACTIVATION.tick, ACTIVATION.clock, [{ key: 'core:1', origin, sourceKindBit: 7, variant: 'other', selection: SELECTION, ...ACTIVATION, position: vec(0) }]);
  let clock = ACTIVATION.clock;
  while (explosionFrame(clock, ACTIVATION.clock) < SCALING_ANIMATION.shown) clock++;
  if (explosionFrame(clock, ACTIVATION.clock) !== SCALING_ANIMATION.shown) throw new Error('no clock shows the middle frame');
  // No explosion is listed at either tick, so the drawn position is the shown one, unmixed.
  notify(ACTIVATION.tick + 1, clock, []);
  return {
    sprites,
    show: (placement: SpritePlacement) => {
      live = [{
        key: 'core:1', origin, sourceKindBit: 7, variant: 'other', selection: SELECTION, activationTick: ACTIVATION.tick,
        activationClock: ACTIVATION.clock, position: positionOf(placement), forward: vec(0, 0, 1), speed: 0,
      } as unknown as PresentationExplosion];
    },
  };
}

const base64 = (bytes: Uint8Array): string => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

/**
 * Draws each placement alone into a black `width` × `height` game image through the layer's passes and reads the red
 * of its blocks' device pixels and `margin` device pixels around them. Returns the GPU's name and the readouts.
 */
export function drawScaledSprites(width: number, height: number, placements: readonly SpritePlacement[], margin: number): { gpu: string; readouts: SpriteReadout[] } {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const cache = new FlightGpuCache({ ownerId: 1, runId: 1, generation: 1, identity: 'sprite-scaling' }, () => ({ width, height }));
  const depthTarget = new WebGLRenderTarget(width, height, { depthTexture: new DepthTexture(width, height) });
  const game = new WebGLRenderTarget(width, height, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
  try {
    const logical = Object.freeze({ scale: width / 640, bufferWidth: width, bufferHeight: height });
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(depthTarget);
    renderer.clear(true, true, false);
    const frame = {
      logical, logicalCamera: setLogicalCamera(new Camera(), logical), depth: depthTarget.depthTexture,
      render: renderFrame(renderState(ACTIVATION.tick + 1), renderState(ACTIVATION.tick), 0),
      world: { scene: { camera: CAMERA, viewport: VIEWPORT, backPlane: BACK_PLANE } },
    } as unknown as CompositionFrame;
    const { sprites, show } = spriteLayer(cache);
    const readouts = placements.map((placement) => {
      show(placement);
      const passes = sprites.passes(frame);
      if (passes.length === 0) throw new Error(`sprite at (${placement.left}, ${placement.top}) not drawn`);
      renderer.setRenderTarget(game);
      renderer.clear(true, false, false);
      for (const pass of passes) {
        renderer.setRenderTarget(pass.target ?? game);
        if (pass.clearColor) renderer.clear(true, false, false);
        renderer.render(pass.scene, pass.camera);
      }
      const { s, left, top } = placement;
      const clampTo = (value: number, size: number): number => Math.min(size, Math.max(0, value));
      const x = clampTo(Math.floor(left * logical.scale) - margin, width);
      const y = clampTo(Math.floor(top * logical.scale) - margin, height);
      const right = clampTo(Math.ceil((left + SCALING_ANIMATION.width * s) * logical.scale) + margin, width);
      const bottom = clampTo(Math.ceil((top + SCALING_ANIMATION.height * s) * logical.scale) + margin, height);
      const region = { x, y, width: right - x, height: bottom - y };
      const pixels = new Uint8Array(region.width * region.height * 4);
      renderer.readRenderTargetPixels(game, x, height - bottom, region.width, region.height, pixels);
      const red = new Uint8Array(region.width * region.height);
      // Read rows are bottom up.
      for (let row = 0; row < region.height; row++) {
        for (let column = 0; column < region.width; column++) red[row * region.width + column] = pixels[((region.height - 1 - row) * region.width + column) * 4];
      }
      return { ...placement, region, red: base64(red) };
    });
    sprites.dispose();
    return { gpu, readouts };
  } finally {
    cache.dispose();
    depthTarget.dispose();
    game.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
