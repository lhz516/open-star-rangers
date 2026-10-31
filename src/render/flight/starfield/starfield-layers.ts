/**
 * The two layers of the star field and the speed dust (docs/plan/p3/12/spec.md, 星点与速度尘埃, 画面合成与 P3-13 接口;
 * docs/original/formats/executable.md, FC2, SD3, SD5; AC-23), for `FlightRunRender.addLayer`:
 *
 * - **`stars`:** before the world in views 0xC and 0x11/8 (after the nebula) and in Warp. Each frame draws the star
 *   field (star-field.ts) with the world's drawn camera rows, the rows the 3D world of the same frame uses, and the
 *   view's viewport bottom. It draws no randomness and keeps no state between frames beyond the image it last filled.
 * - **`dust`:** before the world in views 0xC and 0x11/8 (single pixels), after the world and before the Warp effect in
 *   Warp (lines). The run's frame consumer steps it once per successful Core tick, in order, before drawing the frame
 *   (speed-dust.ts); a display frame draws the latest tick's marks, which belong to the frame's current Render State.
 *
 * Each layer rasterises its logical pixels into an RGBA image of the logical screen in the DATA palette's colours as
 * stored (direct display) and draws it opaque where it wrote, each logical pixel enlarged by the logical scale without
 * interpolation (logical-screen.ts `LOGICAL_PIXEL_GLSL`). Neither tests nor writes depth. A write past the last column continues on the next row, and one past
 * the screen's end is lost, as in the original's frame buffer; the composition starts every frame from black, which
 * stands for the original's erases (`0x3fd20`, `0x44f00`, FC3). Map, base and 0x13 frames do not call either layer.
 *
 * The run's GPU cache holds each layer's image texture, quad and material (`STAR_FIELD_GPU_PLAN`,
 * `SPEED_DUST_GPU_PLAN`), released with the run.
 */
import {
  DataTexture, DoubleSide, Mesh, NearestFilter, RGBAFormat, Scene, ShaderMaterial,
  UnsignedByteType, type Camera,
} from 'three';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import type { CompositionFrame, FlightLayer, LayerPass } from '../composition/flight-layers.ts';
import {
  LOGICAL_HEIGHT, type LogicalTransform, LOGICAL_MESH_VERTEX, LOGICAL_PIXEL_GLSL, LOGICAL_WIDTH, logicalBufferUniform, logicalQuad, setLogicalBuffer,
} from '../composition/logical-screen.ts';
import type { FlightGpuCache, FlightGpuPlan } from '../renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { drawDustLine, DUST_MOST_COLOUR, SpeedDust, type SpeedDustPass, type SpeedDustTick } from './speed-dust.ts';
import { drawStars } from './star-field.ts';

const IMAGE_PLAN: FlightGpuPlan = Object.freeze({ texels: LOGICAL_WIDTH * LOGICAL_HEIGHT, vertices: 4, indices: 6, renderTargets: 0 });

/** What each layer allocates in its run's GPU cache. */
export const STAR_FIELD_GPU_PLAN = IMAGE_PLAN;
export const SPEED_DUST_GPU_PLAN = IMAGE_PLAN;

/** The highest DATA index either layer draws: stars 1–6, dust 2–7. */
const MOST_COLOUR = DUST_MOST_COLOUR;

/** One image texel per logical pixel; texels nothing wrote are left alone. */
const FRAGMENT = `uniform sampler2D image;
${LOGICAL_PIXEL_GLSL}
void main() {
  vec4 colour = texelFetch(image, logicalPixel(), 0);
  if (colour.a < 0.5) discard;
  gl_FragColor = colour;
}`;

/**
 * The image texel of logical pixel (x, y), as the original's unclipped frame-buffer write addresses it: x = 640 is
 * column 0 of the next row; −1 past either end of the screen.
 */
export function logicalPixelIndex(x: number, y: number): number {
  const at = y * LOGICAL_WIDTH + x;
  return at >= 0 && at < LOGICAL_WIDTH * LOGICAL_HEIGHT ? at : -1;
}

/** A logical-screen RGBA image in the run's GPU cache, drawn by the logical camera. */
class LogicalImage {
  readonly #path: string;
  /** Colours 0–7 as opaque RGBA texels in the image's byte order. */
  readonly #colours: Uint32Array;
  readonly #texture: DataTexture;
  readonly #material: ShaderMaterial;
  readonly #texels: Uint32Array;
  readonly #scene = new Scene();
  /** The texels the last fill wrote. */
  #written: number[] = [];

  constructor(cache: FlightGpuCache, path: string, palette: PalettePayload) {
    if (palette?.kind !== 'palette' || !(palette.entries instanceof Uint8Array) || palette.entries.length < (MOST_COLOUR + 1) * 3) {
      throw new FlightRenderError('invalid-input', `${path}.palette`, `must be a palette with at least ${MOST_COLOUR + 1} entries`);
    }
    this.#path = path;
    const colours = new Uint8Array((MOST_COLOUR + 1) * 4);
    for (let colour = 0; colour <= MOST_COLOUR; colour++) {
      colours.set(palette.entries.subarray(colour * 3, colour * 3 + 3), colour * 4);
      colours[colour * 4 + 3] = 255;
    }
    this.#colours = new Uint32Array(colours.buffer);
    const width = LOGICAL_WIDTH;
    const height = LOGICAL_HEIGHT;
    this.#texture = cache.texture(`${path}:image`, { width, height }, () => {
      const texture = new DataTexture(new Uint8Array(width * height * 4), width, height, RGBAFormat, UnsignedByteType);
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.generateMipmaps = false;
      return texture;
    }) as DataTexture;
    const data = this.#texture.image.data as Uint8Array;
    this.#texels = new Uint32Array(data.buffer, data.byteOffset, width * height);
    const geometry = cache.geometry(`${path}:quad`, { vertices: 4, indices: 6 }, () => logicalQuad(width, height));
    this.#material = cache.material(`${path}:material`, () => new ShaderMaterial({
      name: `flight-${path}`, uniforms: { image: { value: this.#texture }, logicalBuffer: logicalBufferUniform() },
      vertexShader: LOGICAL_MESH_VERTEX, fragmentShader: FRAGMENT, side: DoubleSide, depthTest: false, depthWrite: false,
    })) as ShaderMaterial;
    const mesh = new Mesh(geometry, this.#material);
    mesh.name = `flight-${path}`;
    mesh.frustumCulled = false;
    this.#scene.add(mesh);
  }

  /** Clears what the last fill wrote, lets `draw` plot into the image, and uploads it. */
  fill(draw: (plot: (x: number, y: number, colour: number) => void) => void): void {
    const texels = this.#texels;
    for (const at of this.#written) texels[at] = 0;
    const written: number[] = [];
    draw((x, y, colour) => {
      const at = logicalPixelIndex(x, y);
      if (at < 0) return;
      if (!Number.isInteger(colour) || colour < 0 || colour > MOST_COLOUR) throw new FlightRenderError('invalid-input', `${this.#path}.colour`, `has no colour ${colour}`);
      texels[at] = this.#colours[colour];
      written.push(at);
    });
    this.#written = written;
    this.#texture.needsUpdate = true;
  }

  passes(logical: LogicalTransform, camera: Camera): readonly LayerPass[] {
    if (this.#written.length === 0) return [];
    setLogicalBuffer(this.#material, logical);
    return [{ scene: this.#scene, camera }];
  }
}

export interface StarFieldLayerInput {
  readonly cache: FlightGpuCache;
  /** The DATA palette, shown directly. */
  readonly palette: PalettePayload;
}

const sameRows = (a: Matrix3, b: Matrix3): boolean => a.every((value, index) => value === b[index]);

class StarFieldLayer implements FlightLayer {
  readonly slot = 'stars';
  readonly #image: LogicalImage;
  #drawn: { readonly rows: Matrix3; readonly bottom: number } | null = null;

  constructor({ cache, palette }: StarFieldLayerInput) {
    this.#image = new LogicalImage(cache, 'starField', palette);
  }

  passes({ world, logical, logicalCamera }: CompositionFrame): readonly LayerPass[] {
    if (world === null) return [];
    const { camera: { rows }, viewport: { bottom } } = world.scene;
    const drawn = this.#drawn;
    if (drawn === null || drawn.bottom !== bottom || !sameRows(drawn.rows, rows)) {
      this.#image.fill((plot) => drawStars(rows, bottom, plot));
      this.#drawn = { rows: Object.freeze([...rows]) as unknown as Matrix3, bottom };
    }
    return this.#image.passes(logical, logicalCamera);
  }
}

/** The run's star-field layer; its resources are acquired now from `cache`. */
export function createStarFieldLayer(input: StarFieldLayerInput): FlightLayer {
  return new StarFieldLayer(input);
}

export interface SpeedDustLayerInput extends StarFieldLayerInput {
  /** The run's presentation random source, shared with the nebula start and the Warp effect. */
  readonly random: RandSource;
}

export interface SpeedDustLayer extends FlightLayer {
  readonly slot: 'dust';
  /** One successful Core tick, with `PresentationTick.afterStep` as its camera; every tick of a frame, in order, before drawing it. */
  step(tick: SpeedDustTick): void;
}

class Layer implements SpeedDustLayer {
  readonly slot = 'dust';
  readonly #dust: SpeedDust;
  readonly #image: LogicalImage;
  #drawn: SpeedDustPass | null = null;

  constructor({ cache, palette, random }: SpeedDustLayerInput) {
    this.#image = new LogicalImage(cache, 'speedDust', palette);
    this.#dust = new SpeedDust(random);
  }

  step(tick: SpeedDustTick): void {
    this.#dust.step(tick);
  }

  passes({ render: { current }, logical, logicalCamera }: CompositionFrame): readonly LayerPass[] {
    const pass = this.#dust.pass;
    if (pass === null) return [];
    if (pass.tick !== current.tick) {
      throw new FlightRenderError('invalid-state', 'speedDust.passes', `draws the Render State of tick ${current.tick} after stepping tick ${pass.tick}`);
    }
    if (this.#drawn !== pass) {
      this.#image.fill((plot) => {
        for (const mark of pass.marks) {
          if (mark.type === 'pixel') plot(mark.x, mark.y, mark.colour);
          else drawDustLine(mark.x0, mark.y0, mark.x1, mark.y1, (x, y) => plot(x, y, mark.colour));
        }
      });
      this.#drawn = pass;
    }
    return this.#image.passes(logical, logicalCamera);
  }
}

/** The run's speed-dust layer; its resources are acquired now from `cache`. */
export function createSpeedDustLayer(input: SpeedDustLayerInput): SpeedDustLayer {
  return new Layer(input);
}
