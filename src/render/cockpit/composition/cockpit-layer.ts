/**
 * The cockpit layer (docs/plan/p3/13/spec.md, 二维绘制语义与调色板, 接线与生命周期; D-01 定稿 DC-05, DC-08): the `cockpit`
 * slot of one run's composition, the one picture of the cockpit, HUD and map above P3-12's world. It shows the
 * presentation's two indexed surfaces (cockpit-contract.ts) as the selected layout says: the screen surface S opaque in
 * its rows (the band 316–479 in F1 and Warp, the whole map screen), and the back surface B only where its coverage marks
 * a 2-D pixel in the world rows, so the world shows through everywhere else. Indices are resolved with the layout's
 * palette exactly as imported (`resolveRows`): F1, Warp and the destruction view use `palette/flight/cockpit-hud-map`,
 * the map `palette/map/screen`; base and the views without a cockpit draw nothing.
 *
 * - **Pixels:** each logical pixel is enlarged by the logical scale without interpolation, by the rule the P3-12 layers
 *   share (logical-screen.ts `LOGICAL_PIXEL_GLSL`). The pass
 *   neither tests nor writes depth, so the world's depth, which Warp keeps across frames, is untouched; P3-12's screen
 *   stage then applies the screen flash once to the whole game image, the cockpit included.
 * - **Upload:** the surfaces change only when the presentation processes ticks; `changed()` marks the picture for one
 *   resolve and upload at the next draw, so a frame without ticks, a redraw and a restored context show it again as it
 *   is. The resolved picture stays in the texture's data, from which a restored context uploads it again.
 * - **GPU:** one 640 × 480 RGBA texture, a material and a geometry without vertices (the pass's triangle comes from the
 *   vertex index), all from the run's cache within `COCKPIT_GPU_PLAN`; no render target and so no depth attachment.
 */
import { BufferGeometry, DataTexture, Mesh, NearestFilter, RGBAFormat, Scene, ShaderMaterial, Sphere, UnsignedByteType } from 'three';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { CompositionFrame, FlightLayer, LayerPass } from '../../flight/composition/flight-layers.ts';
import { LOGICAL_PIXEL_GLSL, logicalBufferUniform, setLogicalBuffer } from '../../flight/composition/logical-screen.ts';
import type { FlightGpuCache, FlightGpuPlan } from '../../flight/renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../../flight/renderer/flight-render-error.ts';
import type { CockpitPresentation } from '../presentation/cockpit-contract.ts';
import { COCKPIT_LIMITS } from '../presentation/cockpit-limits.ts';
import { resolveRows } from '../raster/indexed-surface.ts';

const { width: WIDTH, height: HEIGHT } = COCKPIT_LIMITS.surface;

/** What the layer allocates in its run's GPU cache (DC-08): the resolved picture only. */
export const COCKPIT_GPU_PLAN: FlightGpuPlan = Object.freeze({ texels: WIDTH * HEIGHT, vertices: 0, indices: 0, renderTargets: 0 });

const PATH = 'cockpitLayer';
const TEXTURE = `${PATH}:picture`;
const GEOMETRY = `${PATH}:triangle`;
const MATERIAL = `${PATH}:material`;

/** One triangle over the whole target from the vertex index alone, so the geometry holds no vertex. */
const VERTEX = 'void main() { gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0); }';
/** The logical pixel of the device pixel; uncovered pixels let the world through. */
const FRAGMENT = `uniform sampler2D picture;
${LOGICAL_PIXEL_GLSL}
void main() {
  vec4 colour = texelFetch(picture, logicalPixel(), 0);
  if (colour.a < 0.5) discard;
  gl_FragColor = vec4(colour.rgb, 1.0);
}`;

export interface CockpitLayerInput {
  readonly cache: FlightGpuCache;
  readonly presentation: CockpitPresentation;
  /** The layouts' palettes: `flight` for F1, Warp and the destruction view, `map` for the map screen. */
  readonly palettes: { readonly flight: PalettePayload; readonly map: PalettePayload };
}

export interface CockpitLayer extends FlightLayer {
  /** The presentation processed ticks: resolve and upload the surfaces at the next draw. */
  changed(): void;
}

class Layer implements CockpitLayer {
  readonly slot = 'cockpit';
  readonly #presentation: CockpitPresentation;
  readonly #palettes: CockpitLayerInput['palettes'];
  readonly #texture: DataTexture;
  readonly #material: ShaderMaterial;
  readonly #scene = new Scene();
  #stale = true;

  constructor({ cache, presentation, palettes }: CockpitLayerInput) {
    for (const name of ['flight', 'map'] as const) {
      if (!(palettes?.[name]?.entries instanceof Uint8Array)) throw new FlightRenderError('invalid-input', `${PATH}.palettes.${name}`, 'must be a palette payload');
    }
    this.#presentation = presentation;
    this.#palettes = palettes;
    this.#texture = cache.texture(TEXTURE, { width: WIDTH, height: HEIGHT }, () => {
      const texture = new DataTexture(new Uint8Array(WIDTH * HEIGHT * 4), WIDTH, HEIGHT, RGBAFormat, UnsignedByteType);
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.generateMipmaps = false;
      return texture;
    }) as DataTexture;
    const geometry = cache.geometry(GEOMETRY, { vertices: 0, indices: 0 }, () => {
      const triangle = new BufferGeometry();
      triangle.setDrawRange(0, 3);
      // No positions to bound: the triangle covers the target whatever the camera.
      triangle.boundingSphere = new Sphere();
      return triangle;
    });
    this.#material = cache.material(MATERIAL, () => new ShaderMaterial({
      name: 'cockpit-layer',
      uniforms: { picture: { value: this.#texture }, logicalBuffer: logicalBufferUniform() },
      vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false,
    })) as ShaderMaterial;
    const mesh = new Mesh(geometry, this.#material);
    mesh.name = 'cockpit-layer';
    mesh.frustumCulled = false;
    this.#scene.add(mesh);
  }

  changed(): void {
    this.#stale = true;
  }

  passes({ logical, logicalCamera }: CompositionFrame): readonly LayerPass[] {
    if (this.#presentation.status() !== 'ready') return [];
    const { palette, screenRows, worldRows } = this.#presentation.layout();
    if (palette === null) return [];
    if (this.#stale) {
      this.#resolve(this.#palettes[palette], screenRows, worldRows);
      this.#stale = false;
    }
    setLogicalBuffer(this.#material, logical);
    return [{ scene: this.#scene, camera: logicalCamera }];
  }

  /** S's rows opaque, B's covered pixels in the world rows, every other pixel transparent. */
  #resolve(palette: PalettePayload, screenRows: { readonly top: number; readonly bottom: number } | null, worldRows: typeof screenRows): void {
    const rgba = this.#texture.image.data as Uint8Array;
    rgba.fill(0);
    const { back, screen } = this.#presentation.surfaces();
    if (worldRows) resolveRows(back, palette, rgba, worldRows.top, worldRows.bottom);
    if (screenRows) resolveRows(screen, palette, rgba, screenRows.top, screenRows.bottom);
    this.#texture.needsUpdate = true;
  }
}

/** The run's cockpit layer, for `FlightRunRender.addLayer`; its resources are acquired now from `cache`. */
export function createCockpitLayer(input: CockpitLayerInput): CockpitLayer {
  return new Layer(input);
}
