/**
 * The browser harness of the scaled hit shimmer screen door regression (P3-16/24; docs/plan/p3/12/spec.md AC-05, AC-08,
 * AC-16, 技术决定 3, 4), loaded by `e2e/flight-shimmer-scaling.development.spec.ts` from the development server only: the
 * real `HitShimmerLayer` on a real WebGL 2 context, drawing one synthetic shell over the whole game image with one
 * opacity everywhere (a uniform threshold image), through the logical camera so that its triangle covers every device
 * pixel whatever the rasteriser does. Which device pixels the screen door draws then shows the cell each one took.
 * Nothing here is part of a production build.
 */
import { Camera, NearestFilter, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { lightingSettings } from '../lighting/lighting.test-support.ts';
import type { CompositionFrame } from '../composition/flight-layers.ts';
import { setLogicalCamera } from '../composition/logical-screen.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import type { HitShimmer, ShimmerDrawing } from './hit-shimmer.ts';
import { HitShimmerLayer } from './hit-shimmer-layer.ts';
import { bandOpacity } from './shimmer-band.ts';
import { prepareShimmerSurfaces } from './shimmer-surfaces.ts';
import { MODEL, shimmerContent, thresholdsImage } from './shimmer.test-support.ts';

/** Every texel's threshold. */
const THRESHOLD = 4;
/** Band positions at which THRESHOLD gives opacity 0xFF (always drawn) and 0x7F (drawn where x + y is even, HS6). */
const BANDS = [0, 3];
const ENTITY = 3;

/**
 * The shell's pose: its stored square's triangle 0-1-2 at logical (−5000, −1000), (5000, −1000) and (5000, 9000), which
 * holds the game image and more than one logical pixel past it on every side. The logical camera mirrors y, so it is a
 * back face, drawn (`BackSide`); the pose's determinant is positive, so three.js keeps the winding.
 */
const ROWS = Object.freeze([10_000, 0, 0, 0, 10_000, 0, 0, 0, 1]) as unknown as Matrix3;
const POSITION: Vec3 = Object.freeze({ x: -5000, y: -1000, z: 0 });

/** `bytes` as a binary string for `btoa`, in chunks that fit an argument list. */
const binary = (bytes: Uint8Array): string => Array.from({ length: Math.ceil(bytes.length / 0x8000) }, (_, at) =>
  String.fromCharCode(...bytes.subarray(at * 0x8000, (at + 1) * 0x8000))).join('');

/** A drawn game image: per device pixel, rows from the top, 1 where the shell was drawn, 0 where not; base64. */
export interface ShimmerReadout {
  readonly opacity: number;
  readonly drawn: string;
}

/**
 * Draws the shell at each band of BANDS into a cleared `width` × `height` game image through the layer's passes
 * and reads which device pixels it drew. Returns the GPU's name and the readouts.
 */
export function drawScaledShimmer(width: number, height: number): { gpu: string; readouts: ShimmerReadout[] } {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const cache = new FlightGpuCache({ ownerId: 1, runId: 1, generation: 1, identity: 'shimmer-scaling' }, () => ({ width, height }));
  const game = new WebGLRenderTarget(width, height, { minFilter: NearestFilter, magFilter: NearestFilter });
  try {
    const thresholds = thresholdsImage({ indices: new Uint8Array(8).fill(THRESHOLD) });
    const surfaces = prepareShimmerSurfaces(shimmerContent({ thresholds }), lightingSettings());
    let drawings: ShimmerDrawing[] = [];
    const shimmer = { drawings: () => drawings } as unknown as HitShimmer;
    const layer = new HitShimmerLayer(surfaces, shimmer, cache);
    const logical = Object.freeze({ scale: width / 640, bufferWidth: width, bufferHeight: height });
    const camera = setLogicalCamera(new Camera(), logical);
    const frame = {
      logical,
      world: { scene: { entities: [{ entity: { id: ENTITY }, rows: ROWS, position: POSITION }] }, camera },
    } as unknown as CompositionFrame;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    const readouts = BANDS.map((band) => {
      drawings = [{ type: 'own', entityId: ENTITY, model: MODEL, family: 'turning', wrap: 0, band } as unknown as ShimmerDrawing];
      renderer.setRenderTarget(game);
      renderer.clear(true, true, false);
      for (const pass of layer.passes(frame)) renderer.render(pass.scene, pass.camera);
      const pixels = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(game, 0, 0, width, height, pixels);
      const drawn = new Uint8Array(width * height);
      // Read rows are bottom up; the clear colour is (0, 0, 0, 0).
      for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
          const at = ((height - 1 - row) * width + column) * 4;
          drawn[row * width + column] = pixels[at] | pixels[at + 1] | pixels[at + 2] | pixels[at + 3] ? 1 : 0;
        }
      }
      return { opacity: bandOpacity(THRESHOLD, band), drawn: btoa(binary(drawn)) };
    });
    return { gpu, readouts };
  } finally {
    cache.dispose();
    game.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
