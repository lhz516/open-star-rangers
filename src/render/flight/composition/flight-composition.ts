/**
 * One run's composition (flight-layers.ts; docs/plan/p3/12/spec.md, 画面合成与 P3-13 接口; AC-16): its layers and
 * screen stage, and the passes of each frame. The game image is a render target of the drawing buffer's size from the
 * run's GPU cache, acquired again after a layout change, whose depth is a texture (24-bit, like the renderbuffer it
 * replaced) the frame gives the sprites; the screen stage's geometry and material come from the same
 * cache, so the run's end releases everything. Adding a layer returns its idempotent removal; a removed layer is never
 * called again and leaves nothing behind.
 */
import {
  BufferAttribute, BufferGeometry, Camera, DepthTexture, Mesh, NearestFilter, Scene, ShaderMaterial, UnsignedIntType, WebGLRenderTarget, type Texture,
} from 'three';
import type { RenderFrame } from '../../../app/runtime/game-runtime.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import type { RenderPass } from '../../scene/render-surface.ts';
import { flightViewKind, type FlightSceneFrame } from '../scene/flight-scene.ts';
import type { FlightGpuCache, FlightGpuPlan } from '../renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import {
  FLIGHT_LAYER_SLOTS, LAYER_ORDER, type CompositionFrame, type FlightLayer, type FlightLayerSlot, type FlightScreen, type LayerPass,
} from './flight-layers.ts';
import { deviceRect, setLogicalCamera, setWorldCamera, viewportRect, type LogicalRect, type LogicalTransform } from './logical-screen.ts';

/** What the composition itself allocates: the game image and the screen stage's triangle. */
export const COMPOSITION_GPU_PLAN: FlightGpuPlan = Object.freeze({ texels: 0, vertices: 3, indices: 0, renderTargets: 1 });

export interface CompositionInput {
  readonly logical: LogicalTransform;
  readonly render: RenderFrame;
  readonly projection: Projection;
  /** The scene's frame, null in views that draw no world. */
  readonly scene: FlightSceneFrame | null;
}

const PATH = 'composition';

interface PassDefaults {
  readonly target: WebGLRenderTarget | null;
  readonly scissor: LogicalRect | null;
}

const CANVAS: PassDefaults = Object.freeze({ target: null, scissor: null });
const SCREEN_GEOMETRY = `${PATH}:screen-geometry`;
const SCREEN_MATERIAL = `${PATH}:screen-material`;

/** Copies the game image texel for texel: both have the drawing buffer's size. */
const COPY_VERTEX = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COPY_FRAGMENT = 'uniform sampler2D image; void main() { gl_FragColor = texelFetch(image, ivec2(gl_FragCoord.xy), 0); }';

export class FlightComposition {
  readonly #cache: FlightGpuCache;
  readonly #layers = new Map<FlightLayerSlot, FlightLayer[]>(FLIGHT_LAYER_SLOTS.map((slot) => [slot, []]));
  readonly #empty = new Scene();
  readonly #logicalCamera = new Camera();
  readonly #worldCamera = new Camera();
  readonly #screenScene = new Scene();
  #screen: FlightScreen | null = null;
  #copyMaterial: ShaderMaterial | null = null;
  #imageKey: string | null = null;
  /** The transform the logical camera was last set for. */
  #logical: LogicalTransform | null = null;
  /** The game image's depth is undefined: it is new, or the context was lost. */
  #depthLost = true;

  constructor(cache: FlightGpuCache) {
    this.#cache = cache;
  }

  /** Adds `layer` after the slot's earlier layers; the returned removal is idempotent. */
  add(layer: FlightLayer): () => void {
    const layers = this.#layers.get(layer?.slot);
    if (!layers || typeof layer.passes !== 'function') throw new FlightRenderError('invalid-input', `${PATH}.add`, 'needs a layer of a known slot');
    if (layers.includes(layer)) throw new FlightRenderError('invalid-state', `${PATH}.add`, 'is not allowed for a layer already added');
    layers.push(layer);
    return () => {
      const at = layers.indexOf(layer);
      if (at >= 0) layers.splice(at, 1);
    };
  }

  /** Replaces the default copy until the returned removal, which is idempotent; one screen stage at a time. */
  setScreen(screen: FlightScreen): () => void {
    if (typeof screen?.passes !== 'function') throw new FlightRenderError('invalid-input', `${PATH}.setScreen`, 'needs a screen stage');
    if (this.#screen) throw new FlightRenderError('invalid-state', `${PATH}.setScreen`, 'is not allowed while another screen stage is set');
    this.#screen = screen;
    return () => {
      if (this.#screen === screen) this.#screen = null;
    };
  }

  /** The game image's contents were lost with the context: its depth is cleared again before the next use. */
  contentsLost(): void {
    this.#depthLost = true;
  }

  /** The frame's passes: clear the game image, every layer of the view in order, clear the canvas, the screen stage. */
  passes({ logical, render, projection, scene }: CompositionInput): RenderPass[] {
    const { viewMode, subMode } = render.current;
    const view = flightViewKind(viewMode, subMode);
    if ((scene === null) !== (view === 'no-world')) throw new FlightRenderError('invalid-input', `${PATH}.scene`, `does not match view ${viewMode}`);
    const image = this.#image(logical);
    const world = scene && Object.freeze({ scene, camera: setWorldCamera(this.#worldCamera, scene, logical), viewport: viewportRect(scene.viewport) });
    if (this.#logical?.scale !== logical.scale || this.#logical.bufferHeight !== logical.bufferHeight) {
      setLogicalCamera(this.#logicalCamera, logical);
      this.#logical = logical;
    }
    const frame: CompositionFrame = Object.freeze({
      logical, viewMode, subMode, view, render, projection, world, logicalCamera: this.#logicalCamera, depth: image.depthTexture!,
    });
    // Only the paths of views 0xC and 0x11 clear the world's depth (FC2, RS6); Warp, map and base keep it.
    const clearDepth = view === 'flight' || view === 'destruction' || this.#depthLost;
    this.#depthLost = false;
    const passes: RenderPass[] = [{ scene: this.#empty, camera: frame.logicalCamera, target: image, clearColor: true, clearDepth, scissor: null }];
    for (const slot of LAYER_ORDER[view]) {
      for (const layer of [...this.#layers.get(slot)!]) {
        const defaults = { target: image, scissor: slot === 'world' ? world!.viewport : null };
        for (const pass of layer.passes(frame)) passes.push(this.#pass(pass, defaults, logical, slot));
      }
    }
    passes.push({ scene: this.#empty, camera: frame.logicalCamera, target: null, clearColor: true, clearDepth: true, scissor: null });
    const screen = this.#screen ? this.#screen.passes(frame, image.texture) : this.#copyPasses(image.texture);
    for (const pass of screen) passes.push(this.#pass(pass, CANVAS, logical, 'screen'));
    return passes;
  }

  /** `pass` with `defaults` for the target and scissor it leaves undefined. */
  #pass({ scene, camera, target, clearColor, clearDepth, scissor }: LayerPass, defaults: PassDefaults, logical: LogicalTransform, slot: string): RenderPass {
    if (!(scene instanceof Scene) || !(camera instanceof Camera)) throw new FlightRenderError('invalid-input', `${PATH}.${slot}`, 'gave a pass without a scene and a camera');
    const rect = scissor === undefined ? defaults.scissor : scissor;
    return Object.freeze({
      scene, camera, target: target === undefined ? defaults.target : target, clearColor: clearColor === true, clearDepth: clearDepth === true,
      scissor: rect === null ? null : deviceRect(logical, rect),
    });
  }

  /** The game image at the drawing buffer's size; the previous size's is released. */
  #image({ bufferWidth: width, bufferHeight: height }: LogicalTransform): WebGLRenderTarget {
    const key = `${PATH}:image:${width}x${height}`;
    if (this.#imageKey !== key) {
      if (this.#imageKey !== null) this.#cache.release(this.#imageKey);
      this.#imageKey = null;
      this.#depthLost = true;
    }
    const image = this.#cache.renderTarget(key, { width, height }, () => new WebGLRenderTarget(width, height, {
      minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false, depthBuffer: true,
      depthTexture: new DepthTexture(width, height, UnsignedIntType),
    }));
    this.#imageKey = key;
    return image;
  }

  #copyPasses(image: Texture): readonly LayerPass[] {
    if (!this.#copyMaterial) {
      const geometry = this.#cache.geometry(SCREEN_GEOMETRY, { vertices: 3, indices: 0 }, () =>
        new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)));
      const material = this.#cache.material(SCREEN_MATERIAL, () => new ShaderMaterial({
        name: 'flight-screen-copy', uniforms: { image: { value: null } }, vertexShader: COPY_VERTEX, fragmentShader: COPY_FRAGMENT,
        depthTest: false, depthWrite: false,
      })) as ShaderMaterial;
      const mesh = new Mesh(geometry, material);
      mesh.name = 'flight-screen-copy';
      mesh.frustumCulled = false;
      this.#screenScene.add(mesh);
      this.#copyMaterial = material;
    }
    this.#copyMaterial.uniforms.image.value = image;
    return [{ scene: this.#screenScene, camera: this.#logicalCamera }];
  }
}
