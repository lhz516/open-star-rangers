/**
 * The nebula layer (docs/plan/p3/12/spec.md, 星云背景; docs/original/formats/executable.md, NB1–NB5, FC2; AC-09): the
 * `nebula` slot of views 0xC and 0x11/8, drawn before the world. Each frame it places the run's six images with the
 * world's drawn camera rows (nebula-placement.ts), blits the visible one into the logical screen exactly as the
 * original's frame buffer receives it (nebula-blit.ts), clipped to the view's viewport bottom, and draws those logical
 * pixels into the game image: opaque, in the DATA colours as stored (direct display), each logical pixel enlarged by
 * the logical scale without interpolation (logical-screen.ts `LOGICAL_PIXEL_GLSL`). It neither tests nor writes depth.
 *
 * - **One at a time:** with the drawn camera's orthonormal rows at most one slot is visible (NB3); were two visible,
 *   the later slot's blit would cover the earlier one's, so the layer draws the last visible slot.
 * - **Erase (NB5):** the original fills index 0 within ±100 of the last drawn centre before the frame's layers; every
 *   pixel a blit writes lies within ±91 of its centre, so that erase covers the whole previous blit, and the game image
 *   each frame starts from black (flight-layers.ts) shows the same.
 * - **Always drawn:** there is no setting for the original's BACKGROUND DETAIL option (user decision of 2026-10-17).
 *
 * The run's GPU cache holds the layer's footprint texture, quad and material (`NEBULA_GPU_PLAN`), released with the run.
 */
import {
  DataTexture, DoubleSide, Mesh, NearestFilter, RGBAFormat, Scene, ShaderMaterial,
  UnsignedByteType, Vector2,
} from 'three';
import type { AssetId } from '../../../content/asset-id.ts';
import { expandImage } from '../../../content/graphics/expand-image.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { CompositionFrame, FlightLayer, LayerPass } from '../composition/flight-layers.ts';
import { LOGICAL_MESH_VERTEX, LOGICAL_PIXEL_GLSL, logicalBufferUniform, logicalQuad, setLogicalBuffer } from '../composition/logical-screen.ts';
import type { FlightGpuCache, FlightGpuPlan } from '../renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { blitNebula, NEBULA_IMAGE_SIZE, NEBULA_REACH } from './nebula-blit.ts';
import { nebulaPlacement, type NebulaPlacement } from './nebula-placement.ts';
import { NEBULA_SLOT_COUNT } from './nebula-selection.ts';

/** The side of the logical square any blit writes in: (sx, sy) ± NEBULA_REACH. */
export const NEBULA_FOOTPRINT = 2 * NEBULA_REACH + 1;

/** What the layer allocates in its run's GPU cache. */
export const NEBULA_GPU_PLAN: FlightGpuPlan = Object.freeze({
  texels: NEBULA_FOOTPRINT * NEBULA_FOOTPRINT, vertices: 4, indices: 6, renderTargets: 0,
});

export interface NebulaLayerInput {
  readonly cache: FlightGpuCache;
  /** The decoded images of slots 0–5 in slot order (nebula-selection.ts), repeats included. */
  readonly images: readonly ImagePayload[];
  /** The palettes the images reference, by Asset ID. */
  readonly palettes: ReadonlyMap<AssetId, PalettePayload>;
}

const PATH = 'nebula';
const TEXTURE = `${PATH}:footprint`;
const GEOMETRY = `${PATH}:quad`;
const MATERIAL = `${PATH}:material`;

/** One footprint texel per logical pixel; texels no blit wrote are left alone. */
const FRAGMENT = `uniform sampler2D footprint; uniform ivec2 origin;
${LOGICAL_PIXEL_GLSL}
void main() {
  ivec2 texel = logicalPixel() - origin;
  if (any(lessThan(texel, ivec2(0))) || any(greaterThan(texel, ivec2(${NEBULA_FOOTPRINT - 1})))) discard;
  vec4 colour = texelFetch(footprint, texel, 0);
  if (colour.a < 0.5) discard;
  gl_FragColor = colour;
}`;

function invalid(path: string, reason: string): never {
  throw new FlightRenderError('invalid-input', `${PATH}.${path}`, reason);
}

/** Image `slot` as 128 × 128 RGBA in its own palette, which must be shown directly and opaque. */
function slotColours(image: ImagePayload, palettes: ReadonlyMap<AssetId, PalettePayload>, slot: number): Uint8Array {
  const path = `images[${slot}]`;
  if (image?.kind !== 'image' || image.width !== NEBULA_IMAGE_SIZE || image.height !== NEBULA_IMAGE_SIZE) invalid(path, 'must be a 128 × 128 image');
  if (image.display !== 'direct' || image.mask !== null) invalid(path, 'must be opaque and shown directly');
  const palette = palettes.get(image.palette) ?? invalid(`${path}.palette`, 'names a palette the layer was not given');
  return expandImage(image, new Map([[image.palette, palette]]), path).rgba;
}

class NebulaLayer implements FlightLayer {
  readonly slot = 'nebula';
  readonly #colours: readonly Uint8Array[];
  readonly #texture: DataTexture;
  readonly #material: ShaderMaterial;
  readonly #mesh: Mesh;
  readonly #scene = new Scene();
  /** The slot, centre, angle and viewport bottom the footprint was last filled for. */
  #drawnKey: string | null = null;

  constructor({ cache, images, palettes }: NebulaLayerInput) {
    if (!Array.isArray(images) || images.length !== NEBULA_SLOT_COUNT) invalid('images', `must hold the ${NEBULA_SLOT_COUNT} slots' images`);
    this.#colours = Object.freeze(images.map((image, slot) => slotColours(image, palettes, slot)));
    const size = NEBULA_FOOTPRINT;
    this.#texture = cache.texture(TEXTURE, { width: size, height: size }, () => {
      const texture = new DataTexture(new Uint8Array(size * size * 4), size, size, RGBAFormat, UnsignedByteType);
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.generateMipmaps = false;
      return texture;
    }) as DataTexture;
    const geometry = cache.geometry(GEOMETRY, { vertices: 4, indices: 6 }, () => logicalQuad(size, size));
    this.#material = cache.material(MATERIAL, () => new ShaderMaterial({
      name: 'flight-nebula', uniforms: { footprint: { value: this.#texture }, origin: { value: new Vector2() }, logicalBuffer: logicalBufferUniform() },
      vertexShader: LOGICAL_MESH_VERTEX, fragmentShader: FRAGMENT, side: DoubleSide, depthTest: false, depthWrite: false,
    })) as ShaderMaterial;
    this.#mesh = new Mesh(geometry, this.#material);
    this.#mesh.name = 'flight-nebula';
    this.#mesh.frustumCulled = false;
    this.#scene.add(this.#mesh);
  }

  passes({ world, logical, logicalCamera }: CompositionFrame): readonly LayerPass[] {
    if (!world) return [];
    const { camera: { rows }, viewport: { bottom } } = world.scene;
    let placement: NebulaPlacement | null = null;
    for (let slot = 0; slot < NEBULA_SLOT_COUNT; slot++) placement = nebulaPlacement(rows, slot) ?? placement;
    if (!placement) return [];
    const key = `${placement.slot},${placement.sx},${placement.sy},${placement.angle},${bottom}`;
    if (key !== this.#drawnKey) {
      this.#fill(placement, bottom);
      this.#drawnKey = key;
    }
    setLogicalBuffer(this.#material, logical);
    return [{ scene: this.#scene, camera: logicalCamera }];
  }

  /** Blits the placement into the footprint, whose texel (i, j) is logical pixel (sx − 91 + i, sy − 91 + j). */
  #fill({ slot, sx, sy, angle }: NebulaPlacement, bottom: number): void {
    const footprint = this.#texture.image.data as Uint8Array;
    const colours = this.#colours[slot];
    footprint.fill(0);
    const left = sx - NEBULA_REACH;
    const top = sy - NEBULA_REACH;
    blitNebula(angle, sx, sy, bottom, (x, y, source) => {
      const to = ((y - top) * NEBULA_FOOTPRINT + (x - left)) * 4;
      const from = source * 4;
      footprint[to] = colours[from];
      footprint[to + 1] = colours[from + 1];
      footprint[to + 2] = colours[from + 2];
      footprint[to + 3] = colours[from + 3];
    });
    this.#texture.needsUpdate = true;
    this.#mesh.position.set(left, top, 0);
    (this.#material.uniforms.origin.value as Vector2).set(left, top);
  }
}

/** The run's nebula layer, for `FlightRunRender.addLayer`; its resources are acquired now from `cache`. */
export function createNebulaLayer(input: NebulaLayerInput): FlightLayer {
  return new NebulaLayer(input);
}
