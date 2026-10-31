/**
 * The explosion sprite layer (docs/plan/p3/12/spec.md, 爆炸精灵与屏幕闪光, 画面合成与 P3-13 接口; docs/original/formats/
 * executable.md, FC2, FC5–FC8; textures.md §6; S-09, AC-13): the `sprites` slot of views 0xC and 0x11, after the 3D
 * world. Each frame it queues the drawable explosions of the presentation module with the frame's drawn camera, sorts
 * them and draws each as one quad of its clipped blocks (sprite-rules.ts), in queue order.
 *
 * - **Frames:** every ANIM frame is an `image` payload displayed directly under the run's DATA palette; each animation
 *   is one texture of its frames stacked top to bottom, expanded when first drawn, transparent pixels with alpha 0.
 * - **Pixels (AC-05, AC-16):** a device pixel shows the frame pixel of the block its logical pixel lies in, by the rule
 *   every layer that enlarges logical pixels shares (logical-screen.ts `logicalPixel()`); the quad extends one logical
 *   pixel past the blocks and discards the device pixels outside them, so it never reads another frame's rows.
 * - **Depth (FC8):** each opaque source pixel's s × s block is drawn whole when its key d ÷ 65535 is not greater than the
 *   world's depth at the block's top-left logical pixel (the device pixel holding that pixel's centre), and not at all
 *   otherwise; no depth is written, so a farther sprite drawn later covers a nearer one, and a key above 65535 is never
 *   drawn. Since a pass cannot sample the depth of the target it draws into, the quads are drawn into a sprite image of
 *   the layer's own, cleared to opaque black, where a drawn pixel has alpha 0; a second pass copies those pixels into
 *   the game image.
 * - **Positions:** mixed like the world's (scene/flight-scene.ts): from the previous tick's end to the current tick's
 *   by the frame's alpha, for an explosion active at both, unless the frame folds. Both are recorded as the presentation
 *   module advances each tick, so a frame that advanced several ticks mixes from the tick before its last, as a frame
 *   of one tick does, and the drawing does not depend on how ticks are grouped into frames (AC-17).
 * - **Lifetime:** created before the run's first tick, as its frame records follow every tick from there.
 *
 * The run's GPU cache holds every texture, material, quad and the sprite image, so the run's end releases them; `dispose`
 * only stops the frame tracking.
 */
import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, Mesh, NearestFilter, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, WebGLRenderTarget,
} from 'three';
import type { AssetId } from '../../../content/asset-id.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { ExplosionTable } from '../../../content/flight/flight-data-content.ts';
import { expandImage } from '../../../content/graphics/expand-image.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { CompositionFrame, FlightLayer, LayerPass } from '../composition/flight-layers.ts';
import { LOGICAL_PIXEL_GLSL, logicalBufferUniform, logicalQuadCorners, setLogicalBuffer, type LogicalTransform } from '../composition/logical-screen.ts';
import type { FlightPresentation } from '../presentation/flight-presentation.ts';
import { PRESENTATION_LIMITS } from '../presentation/presentation-budget.ts';
import type { ExplosionKey, ExplosionSelection } from '../presentation/presentation-contract.ts';
import { foldsFrame } from '../scene/flight-scene.ts';
import type { FlightGpuCache, FlightGpuPlan } from '../renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import {
  compareRanks, DEPTH_KEY_SCALE, projectSprite, sortSprites, spriteBlocks, SpriteFrames, spriteVariant, type CreationRank, type SpriteBlocks,
  type SpriteProjection,
} from './sprite-rules.ts';

const PATH = 'sprites';

/** Sprites drawn at once: at most one per explosion whose choice is kept. */
export const MAX_SPRITES = PRESENTATION_LIMITS.selections;

// `place` (left, top, s, the frame's first row), `blocks` (the drawn blocks' logical rectangle, ends excluded) and `key`
// are the same at the four corners.
const VERTEX = `
attribute vec4 place;
attribute vec4 blocks;
attribute float key;
flat varying vec4 vPlace;
flat varying vec4 vBlocks;
flat varying float vKey;
void main() {
  vPlace = place;
  vBlocks = blocks;
  vKey = key;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// The device pixel shows the frame pixel of its logical pixel's block (logical-screen.ts `logicalPixel()`), never one of
// another frame; the block's top-left logical pixel goes to its device pixel as `blockDepthPixel` maps it.
const FRAGMENT = `
uniform sampler2D frames;
uniform sampler2D depth;
uniform float scale;
${LOGICAL_PIXEL_GLSL}
flat varying vec4 vPlace;
flat varying vec4 vBlocks;
flat varying float vKey;
void main() {
  ivec2 pixel = logicalPixel();
  ivec4 blocks = ivec4(vBlocks);
  if (any(lessThan(pixel, blocks.xy)) || any(greaterThanEqual(pixel, blocks.zw))) discard;
  ivec2 origin = ivec2(vPlace.xy);
  int s = int(vPlace.z);
  ivec2 source = (pixel - origin) / s;
  vec4 texel = texelFetch(frames, ivec2(source.x, int(vPlace.w) + source.y), 0);
  if (texel.a < 0.5) discard;
  ivec2 at = ivec2(floor((vec2(origin + s * source) + 0.5) * scale));
  at = clamp(ivec2(at.x, logicalBuffer.y - 1 - at.y), ivec2(0), textureSize(depth, 0) - 1);
  if (vKey > texelFetch(depth, at, 0).r) discard;
  gl_FragColor = vec4(texel.rgb, 0.0);
}`;
const COPY_VERTEX = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COPY_FRAGMENT = `
uniform sampler2D sprites;
void main() {
  vec4 texel = texelFetch(sprites, ivec2(gl_FragCoord.xy), 0);
  if (texel.a > 0.5) discard;
  gl_FragColor = vec4(texel.rgb, 1.0);
}`;

/**
 * The device pixel, columns left to right and rows bottom up as the depth texture stores them, whose depth a block with
 * top-left logical pixel (x, y) is tested against: the one holding that pixel's centre, kept inside the buffer.
 */
export function blockDepthPixel(x: number, y: number, { scale, bufferWidth, bufferHeight }: LogicalTransform): { readonly column: number; readonly row: number } {
  const clamp = (value: number, size: number): number => Math.min(size - 1, Math.max(0, value));
  return { column: clamp(Math.floor((x + 0.5) * scale), bufferWidth), row: clamp(bufferHeight - 1 - Math.floor((y + 0.5) * scale), bufferHeight) };
}

/** The run's DATA palette, which every explosion frame is displayed directly under. */
export interface SpritePalette {
  readonly id: AssetId;
  readonly payload: PalettePayload;
}

export interface ExplosionSpritesInput {
  /**
   * The run's presentation module: its explosions, and its ticks for the frame changes and positions. It must notify
   * each tick before advancing by the next, as wireFlightRun advances it one tick at a time, so that its explosions are
   * those after the tick notified; its camera's tick says which tick that is.
   */
  readonly presentation: Pick<FlightPresentation, 'explosions' | 'subscribe' | 'camera'>;
  readonly explosions: ExplosionTable;
  /** The frames of every animation the table names, in display order, by the animation's Asset ID. */
  readonly animations: ReadonlyMap<AssetId, readonly ImagePayload[]>;
  readonly palette: SpritePalette;
  /** The run's GPU cache (`FlightRunRender.resources`). */
  readonly resources: FlightGpuCache;
}

/** One animation's checked frames, expanded and stacked when first drawn. */
interface Animation {
  readonly id: AssetId;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly images: readonly ImagePayload[];
}

/** A queued sprite with what drawing it needs. */
interface QueuedSprite extends SpriteProjection {
  readonly rank: CreationRank;
  readonly animation: Animation;
  readonly frame: number;
}

/** The explosions' positions at the end of one tick. */
interface PositionSnapshot {
  readonly tick: number;
  readonly positions: ReadonlyMap<ExplosionKey, Vec3>;
}

const mix = (from: Vec3, to: Vec3, alpha: number): Vec3 => ({
  x: from.x + (to.x - from.x) * alpha, y: from.y + (to.y - from.y) * alpha, z: from.z + (to.z - from.z) * alpha,
});

const animationOf = (explosions: ExplosionTable, { list, item }: ExplosionSelection): AssetId => explosions.lists[list - 1][item].animation.id;

const tableAnimations = (explosions: ExplosionTable): ReadonlySet<AssetId> => new Set(explosions.lists.flat().map(({ animation }) => animation.id));

/** Checks the frames of every animation the table names. */
function checkAnimations({ explosions, animations, palette }: Pick<ExplosionSpritesInput, 'explosions' | 'animations' | 'palette'>): ReadonlyMap<AssetId, Animation> {
  const checked = new Map<AssetId, Animation>();
  for (const id of tableAnimations(explosions)) {
    const path = `${PATH}.animations[${id}]`;
    const images = animations.get(id);
    if (!images || images.length === 0) throw new FlightRenderError('invalid-input', path, 'must hold the frames of every animation the explosion table names');
    const [{ width, height }] = images;
    images.forEach((image, at) => {
      if (image.kind !== 'image' || image.display !== 'direct' || image.palette !== palette.id) {
        throw new FlightRenderError('invalid-input', `${path}[${at}]`, 'must be an image displayed directly under the DATA palette');
      }
      if (image.width !== width || image.height !== height) throw new FlightRenderError('invalid-input', `${path}[${at}]`, 'must have the size of the first frame');
    });
    checked.set(id, Object.freeze({ id, width, height, frames: images.length, images }));
  }
  return checked;
}

/** An animation's frames under the DATA palette, stacked top to bottom. */
function stackFrames({ id, width, height, frames, images }: Animation, palette: SpritePalette): Uint8Array<ArrayBuffer> {
  const palettes = new Map([[palette.id, palette.payload]]);
  const rgba = new Uint8Array(width * height * 4 * frames);
  images.forEach((image, at) => rgba.set(expandImage(image, palettes, `${PATH}.animations[${id}][${at}]`).rgba, at * width * height * 4));
  return rgba;
}

/** What the layer allocates at most: every animation's texture, a quad per sprite, the copy's triangle and the sprite image. */
export function explosionSpritesGpuPlan({ explosions, animations }: Pick<ExplosionSpritesInput, 'explosions' | 'animations'>): FlightGpuPlan {
  let texels = 0;
  for (const id of tableAnimations(explosions)) {
    const frames = animations.get(id) ?? [];
    texels += frames.length === 0 ? 0 : frames[0].width * frames[0].height * frames.length;
  }
  return Object.freeze({ texels, vertices: 4 * MAX_SPRITES + 3, indices: 6 * MAX_SPRITES, renderTargets: 1 });
}

export class ExplosionSprites implements FlightLayer {
  readonly slot = 'sprites' as const;
  readonly #presentation: Pick<FlightPresentation, 'explosions' | 'camera'>;
  readonly #explosions: ExplosionTable;
  readonly #animations: ReadonlyMap<AssetId, Animation>;
  readonly #palette: SpritePalette;
  readonly #resources: FlightGpuCache;
  readonly #frames: SpriteFrames;
  readonly #scene = new Scene();
  readonly #copyScene = new Scene();
  #copyMaterial: ShaderMaterial | null = null;
  #imageKey: string | null = null;
  readonly #quads: Mesh<BufferGeometry, ShaderMaterial>[] = [];
  #unsubscribe: (() => void) | null;
  #latest: PositionSnapshot | null = null;
  #earlier: PositionSnapshot | null = null;

  constructor(input: ExplosionSpritesInput) {
    if (input.presentation.explosions().length > 0) throw new FlightRenderError('invalid-state', PATH, 'must be created before the run\'s first explosion');
    this.#presentation = input.presentation;
    this.#explosions = input.explosions;
    this.#animations = checkAnimations(input);
    this.#palette = input.palette;
    this.#resources = input.resources;
    this.#frames = new SpriteFrames((selection) => this.#animation(selection).frames);
    this.#unsubscribe = input.presentation.subscribe((tick) => {
      this.#frames.step(tick);
      this.#remember(tick.tick);
    });
  }

  passes(frame: CompositionFrame): readonly LayerPass[] {
    const world = frame.world;
    if (world === null) return [];
    const { camera, viewport, backPlane } = world.scene;
    const { previous, current, alpha } = frame.render;
    const live = this.#presentation.explosions();
    const before = !foldsFrame(previous, current) && this.#earlier?.tick === previous.tick ? this.#earlier.positions : null;
    const queue: QueuedSprite[] = [];
    for (const { key, variant, selection, position, activationTick } of live) {
      const sprite = this.#frames.sprite(key);
      if (sprite === null) continue;
      const from = activationTick < current.tick ? before?.get(key) : undefined;
      const at = from === undefined ? position : mix(from, position, alpha);
      const projected = projectSprite(at, camera, viewport, backPlane, spriteVariant(variant, selection));
      if (projected !== null) queue.push({ ...projected, ...sprite, animation: this.#animation(selection) });
    }
    queue.sort((a, b) => compareRanks(a.rank, b.rank));
    let drawn = 0;
    for (const sprite of sortSprites(queue)) {
      const blocks = spriteBlocks(sprite, sprite.animation.width, sprite.animation.height, viewport.bottom);
      if (blocks !== null) this.#place(drawn++, sprite, blocks);
    }
    for (let at = drawn; at < this.#quads.length; at++) this.#quads[at].visible = false;
    if (drawn === 0) return [];
    const image = this.#image(frame.logical);
    for (const quad of this.#quads.slice(0, drawn)) {
      const { uniforms } = quad.material;
      uniforms.depth.value = frame.depth;
      uniforms.scale.value = frame.logical.scale;
      setLogicalBuffer(quad.material, frame.logical);
    }
    this.#copy().uniforms.sprites.value = image.texture;
    return [
      { scene: this.#scene, camera: frame.logicalCamera, target: image, clearColor: true },
      { scene: this.#copyScene, camera: frame.logicalCamera },
    ];
  }

  /** Stops following the presentation's ticks; idempotent. */
  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  /** The sprite image at the drawing buffer's size; the previous size's is released. */
  #image({ bufferWidth: width, bufferHeight: height }: LogicalTransform): WebGLRenderTarget {
    const key = `${PATH}:image:${width}x${height}`;
    if (this.#imageKey !== null && this.#imageKey !== key) this.#resources.release(this.#imageKey);
    this.#imageKey = key;
    return this.#resources.renderTarget(key, { width, height }, () => new WebGLRenderTarget(width, height, {
      minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false, depthBuffer: false,
    }));
  }

  #copy(): ShaderMaterial {
    if (this.#copyMaterial) return this.#copyMaterial;
    const geometry = this.#resources.geometry(`${PATH}:copy-geometry`, { vertices: 3, indices: 0 }, () =>
      new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)));
    const material = this.#resources.material(`${PATH}:copy-material`, () => new ShaderMaterial({
      name: 'explosion-sprite-copy', uniforms: { sprites: { value: null } }, vertexShader: COPY_VERTEX, fragmentShader: COPY_FRAGMENT,
      depthTest: false, depthWrite: false,
    })) as ShaderMaterial;
    const mesh = new Mesh(geometry, material);
    mesh.name = 'explosion-sprite-copy';
    mesh.frustumCulled = false;
    this.#copyScene.add(mesh);
    this.#copyMaterial = material;
    return material;
  }

  /** Keeps the positions after the last two ticks the presentation module advanced by. */
  #remember(tick: number): void {
    const after = this.#presentation.camera().tick;
    if (after !== tick) throw new FlightRenderError('invalid-state', `${PATH}.presentation`, `notified tick ${tick} after advancing to tick ${after}`);
    this.#earlier = this.#latest;
    this.#latest = { tick, positions: new Map(this.#presentation.explosions().map(({ key, position }) => [key, position])) };
  }

  #animation(selection: ExplosionSelection): Animation {
    const id = animationOf(this.#explosions, selection);
    return this.#animations.get(id) ?? (() => {
      throw new FlightRenderError('invalid-input', `${PATH}.selection`, `names animation ${id}, which the explosion table does not`);
    })();
  }

  /** Sets quad `at` to the clipped blocks of `sprite` (`logicalQuadCorners`), drawn after the quads before it. */
  #place(at: number, { d, frame, animation }: QueuedSprite, { left, top, s, i0, i1, j0, j1 }: SpriteBlocks): void {
    const material = this.#material(animation);
    const quad = this.#quads[at] ?? this.#quad(at, material);
    quad.material = material;
    const x0 = left + s * i0;
    const x1 = left + s * (i1 + 1);
    const y0 = top + s * j0;
    const y1 = top + s * (j1 + 1);
    const row = frame * animation.height;
    /** Writes `values` to attribute `name`, repeated `times` (once per corner for a value the four corners share). */
    const write = (name: string, values: readonly number[], times = 1): void => {
      const attribute = quad.geometry.getAttribute(name) as BufferAttribute;
      for (let at = 0; at < times; at++) (attribute.array as Float32Array).set(values, at * values.length);
      attribute.needsUpdate = true;
    };
    write('position', logicalQuadCorners(x0, y0, x1, y1));
    write('place', [left, top, s, row], 4);
    write('blocks', [x0, y0, x1, y1], 4);
    write('key', [d / DEPTH_KEY_SCALE], 4);
    quad.renderOrder = at;
    quad.visible = true;
  }

  #quad(at: number, material: ShaderMaterial): Mesh<BufferGeometry, ShaderMaterial> {
    const geometry = this.#resources.geometry(`${PATH}:quad:${at}`, { vertices: 4, indices: 6 }, () => new BufferGeometry()
      .setAttribute('position', new BufferAttribute(new Float32Array(12), 3))
      .setAttribute('place', new BufferAttribute(new Float32Array(16), 4))
      .setAttribute('blocks', new BufferAttribute(new Float32Array(16), 4))
      .setAttribute('key', new BufferAttribute(new Float32Array(4), 1))
      .setIndex([0, 1, 2, 2, 1, 3]));
    const quad = new Mesh(geometry, material);
    quad.name = `explosion-sprite-${at}`;
    quad.frustumCulled = false;
    this.#quads[at] = quad;
    this.#scene.add(quad);
    return quad;
  }

  #material(animation: Animation): ShaderMaterial {
    const { id, width, height, frames } = animation;
    return this.#resources.material(`${PATH}:material:${id}`, () => {
      const texture = this.#resources.texture(`${PATH}:frames:${id}`, { width, height: height * frames }, () => {
        const created = new DataTexture(stackFrames(animation, this.#palette), width, height * frames, RGBAFormat, UnsignedByteType);
        created.magFilter = NearestFilter;
        created.minFilter = NearestFilter;
        created.generateMipmaps = false;
        created.needsUpdate = true;
        return created;
      });
      return new ShaderMaterial({
        name: 'explosion-sprite',
        uniforms: { frames: { value: texture }, depth: { value: null }, scale: { value: 1 }, logicalBuffer: logicalBufferUniform() },
        vertexShader: VERTEX, fragmentShader: FRAGMENT, side: DoubleSide, depthTest: false, depthWrite: false,
      });
    }) as ShaderMaterial;
  }
}
