/**
 * The Warp effect layer (docs/plan/p3/12/spec.md, Warp 隧道效果; docs/original/formats/executable.md, WT1–WT9, FC2;
 * AC-15): the `warp-effect` slot of view 1, after the speed dust and before the cockpit. The run's frame consumer
 * steps it once per successful Core tick with that tick's Render State, in order, before drawing the frame (technical
 * decisions 1 and 7); each display frame then draws the latest tick's pass with the world's drawn camera, so the tunnel
 * moves with the interpolated camera like the world, stars and dust drawn in the same frame, and a frame without a tick
 * redraws without drawing randomness.
 *
 * - **When:** only while the frame's current Render State is in view 1 with `warp`, and only once a tick of that Warp
 *   has been stepped (a run whose first state is already in a Warp shows the effect from its first tick).
 * - **Image:** the effect's lines are rasterised into a logical-resolution RGBA image (warp-tunnel-image.ts) in the
 *   Warp palette's ramp colours as stored, and drawn opaque where a line was drawn, each logical pixel enlarged by the
 *   logical scale without interpolation. It neither tests nor writes depth.
 * - **Camera:** the original projects with the game camera's stored rows (WT4 step 1), the observed entity's pose in
 *   Warp, where the drawn camera keeps the library's orthonormal rows (drawn-pose.ts). When the drawn camera is exactly
 *   the previous or the current tick's camera, the layer projects with that tick's stored rows; between ticks it uses
 *   the interpolated drawn camera, which exists only in the project (technical decision 1).
 *
 * The run's GPU cache holds the image texture, quad and material (`WARP_TUNNEL_GPU_PLAN`), released with the run.
 */
import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, Mesh, NearestFilter, RGBAFormat, Scene, ShaderMaterial,
  UnsignedByteType,
} from 'three';
import type { RenderFrame } from '../../../app/runtime/game-runtime.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { WARP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import type { CompositionFrame, FlightLayer, LayerPass } from '../composition/flight-layers.ts';
import type { CameraPose } from '../presentation/presentation-contract.ts';
import { libraryOrientation } from '../scene/drawn-pose.ts';
import type { FlightGpuCache, FlightGpuPlan } from '../renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { WARP_IMAGE_HEIGHT, WARP_IMAGE_WIDTH, WarpTunnelImage } from './warp-tunnel-image.ts';
import { WarpTunnel, type WarpTunnelPass } from './warp-tunnel.ts';

/** What the layer allocates in its run's GPU cache. */
export const WARP_TUNNEL_GPU_PLAN: FlightGpuPlan = Object.freeze({
  texels: WARP_IMAGE_WIDTH * WARP_IMAGE_HEIGHT, vertices: 4, indices: 6, renderTargets: 0,
});

export interface WarpTunnelLayerInput {
  readonly cache: FlightGpuCache;
  /** The run's presentation random source; the effect's only randomness. */
  readonly random: RandSource;
}

export interface WarpTunnelLayer extends FlightLayer {
  readonly slot: 'warp-effect';
  /** One successful Core tick, given its Render State; call for every tick of a frame, in order, before drawing it. */
  step(state: RenderState): void;
}

const PATH = 'warpTunnel';
const TEXTURE = `${PATH}:image`;
const GEOMETRY = `${PATH}:quad`;
const MATERIAL = `${PATH}:material`;

const VERTEX = 'varying vec2 texel; void main() { texel = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
/** One image texel per logical pixel; texels no line wrote are left alone. */
const FRAGMENT = `uniform sampler2D image; varying vec2 texel;
void main() {
  vec4 colour = texelFetch(image, clamp(ivec2(floor(texel)), ivec2(0), ivec2(${WARP_IMAGE_WIDTH - 1}, ${WARP_IMAGE_HEIGHT - 1})), 0);
  if (colour.a < 0.5) discard;
  gl_FragColor = colour;
}`;

/** What the image was last drawn from. */
interface Drawn {
  readonly pass: WarpTunnelPass;
  readonly camera: CameraPose;
}

const samePosition = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
const sameRows = (a: readonly number[], b: readonly number[]): boolean => a.every((value, index) => value === b[index]);
const sameCamera = (a: CameraPose, b: CameraPose): boolean => samePosition(a.position, b.position) && sameRows(a.rows, b.rows);

/** The game camera of the tick whose camera `drawn` is exactly (its observed entity's stored pose), else `drawn`. */
function effectCamera({ previous, current }: RenderFrame, drawn: CameraPose): CameraPose {
  for (const state of [current, previous]) {
    const observed = state.entities.find(({ id }) => id === state.observedEntityId);
    if (observed === undefined || !samePosition(observed.position, drawn.position)) continue;
    const rows = libraryOrientation(observed.orientation);
    if (rows !== null && sameRows(rows, drawn.rows)) return { position: observed.position, rows: observed.orientation };
  }
  return drawn;
}

class Layer implements WarpTunnelLayer {
  readonly slot = 'warp-effect';
  readonly #tunnel: WarpTunnel;
  readonly #image: WarpTunnelImage;
  readonly #texture: DataTexture;
  readonly #scene = new Scene();
  #drawn: Drawn | null = null;

  constructor({ cache, random }: WarpTunnelLayerInput) {
    this.#tunnel = new WarpTunnel(random);
    const width = WARP_IMAGE_WIDTH;
    const height = WARP_IMAGE_HEIGHT;
    this.#texture = cache.texture(TEXTURE, { width, height }, () => {
      const texture = new DataTexture(new Uint8Array(width * height * 4), width, height, RGBAFormat, UnsignedByteType);
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.generateMipmaps = false;
      return texture;
    }) as DataTexture;
    this.#image = new WarpTunnelImage(this.#texture.image.data as Uint8Array);
    const geometry = cache.geometry(GEOMETRY, { vertices: 4, indices: 6 }, () => new BufferGeometry()
      .setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, width, 0, 0, 0, height, 0, width, height, 0]), 3))
      .setIndex([0, 1, 2, 2, 1, 3]));
    const material = cache.material(MATERIAL, () => new ShaderMaterial({
      name: 'flight-warp-tunnel', uniforms: { image: { value: this.#texture } }, vertexShader: VERTEX, fragmentShader: FRAGMENT,
      side: DoubleSide, depthTest: false, depthWrite: false,
    }));
    const mesh = new Mesh(geometry, material);
    mesh.name = 'flight-warp-tunnel';
    mesh.frustumCulled = false;
    this.#scene.add(mesh);
  }

  step(state: RenderState): void {
    this.#tunnel.step(state);
  }

  passes({ render, world, logicalCamera }: CompositionFrame): readonly LayerPass[] {
    const { current } = render;
    const warp = current.viewMode === WARP_VIEW_MODE ? current.warp : null;
    const pass = this.#tunnel.pass;
    if (warp === null || world === null || pass === null) return [];
    if (pass.tick !== current.tick || pass.serial !== warp.serial) {
      throw new FlightRenderError('invalid-state', `${PATH}.passes`, `draws the Render State of tick ${current.tick} after stepping tick ${pass.tick}`);
    }
    const camera = effectCamera(render, world.scene.camera);
    const drawn = this.#drawn;
    if (drawn === null || drawn.pass !== pass || !sameCamera(drawn.camera, camera)) {
      this.#image.draw({ serial: pass.serial, path: warp.path, templates: pass.templates, edges: pass.edges, camera });
      this.#texture.needsUpdate = true;
      this.#drawn = { pass, camera };
    }
    return [{ scene: this.#scene, camera: logicalCamera }];
  }
}

/** The run's Warp effect layer, for `FlightRunRender.addLayer`; its resources are acquired now from `cache`. */
export function createWarpTunnelLayer(input: WarpTunnelLayerInput): WarpTunnelLayer {
  return new Layer(input);
}
