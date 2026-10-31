/**
 * The hit shimmer's world layer (docs/plan/p3/12/spec.md, 模型、光照与第 2 列表, 技术决定 4; docs/original/formats/
 * executable.md, HS2–HS6, HS8; AC-08): the shells of HitShimmer's drawings, each at its entity's drawn pose (a shared
 * shell at its record's place in that entity's frame), for the drawn entities of the frame (flight-scene.ts). P3-12/23
 * adds it to a run with `FlightRunRender.addLayer`, after the lit models, and advances the HitShimmer it reads with each
 * frame's ticks before drawing; its resources come from the run's GPU cache within `ShimmerSurfaces.plan`.
 *
 * - **Texels:** u and v come from the shell's wrap table row for its wrap (a shared shell's step), interpolated affinely,
 *   repeated by their fractional part and taken at the nearest texel (LS7), as for models. The colour and the threshold
 *   are read at that same texel of the shell's texture and of the thresholds (one offset into both images).
 * - **Opacity and screen door:** the opacity is the band table's entry for the threshold at the shell's band (a shared
 *   shell's 15 × step), the screen door table's entry for it at the logical pixel (x & 3, y & 3) decides the pixel, both
 *   built on the CPU (shimmer-band.ts). Logical pixels are the 640 × 480 grid's, each device pixel's taken by the rule
 *   every layer that enlarges logical pixels shares (logical-screen.ts `logicalPixel()`), so every logical pixel's
 *   device pixels share its decision. A drawing buffer narrower than 640 cannot resolve that grid; there the device
 *   pixels take its place, which keeps each opacity's coverage but not the original's phase. A skipped pixel is
 *   discarded: no colour, no depth.
 * - **Colour:** the texel's index through the shell's one-shade ramp, its nearest DATA colour (unlit).
 * - **Faces and depth:** as for models (model-lighting-layer.ts): `BackSide`, depth tested new ≤ stored and written.
 * - **Limits:** those of the lit models (continuous rasterisation at device pixels, ADR-0009); in addition the wrap's
 *   seam rule is applied per stored triangle before WebGL clips it, where the original applies it in its own set-up.
 */
import {
  BackSide, BufferAttribute, BufferGeometry, DataTexture, FloatType, Matrix4, Mesh, NearestFilter, RedFormat, RGBAFormat, RGFormat, Scene,
  ShaderMaterial, Vector2,
  type Texture,
} from 'three';
import type { AssetId } from '../../../content/asset-id.ts';
import { fail } from '../../../content/contract-validation.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import type { CompositionFrame, FlightLayer, LayerPass } from '../composition/flight-layers.ts';
import { LOGICAL_PIXEL_GLSL, LOGICAL_WIDTH, logicalBufferUniform } from '../composition/logical-screen.ts';
import type { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import type { HitShimmer } from './hit-shimmer.ts';
import { BAND_TABLE_SIZE, bandTable, SCREEN_DOOR_TABLE_SIZE, screenDoorTable } from './shimmer-band.ts';
import type { ShimmerShell, ShimmerSurfaces } from './shimmer-surfaces.ts';
import type { WrapFamily } from './shimmer-wraps.ts';

const PATH = 'shimmer';

const VERTEX = `
uniform highp sampler2D wrapUvs;
uniform int wrapRow;
out vec2 affine;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  int width = textureSize(wrapUvs, 0).x;
  vec2 uv = texelFetch(wrapUvs, ivec2(gl_VertexID % width, wrapRow + gl_VertexID / width), 0).rg;
  // Multiplied by w here and by 1/w (gl_FragCoord.w) per pixel: interpolated linearly in screen space.
  affine = uv * gl_Position.w;
}`;

const FRAGMENT = `
uniform highp sampler2D texels;
uniform highp sampler2D thresholds;
uniform highp sampler2D band;
uniform highp sampler2D door;
uniform highp sampler2D ramps;
uniform int bandRow;
${LOGICAL_PIXEL_GLSL}
in vec2 affine;
int byteAt(highp sampler2D image, ivec2 at) {
  return int(texelFetch(image, at, 0).r * 255.0 + 0.5);
}
void main() {
  vec2 uv = affine * gl_FragCoord.w;
  ivec2 size = textureSize(texels, 0);
  ivec2 at = min(ivec2(floor(fract(uv) * vec2(size))), size - 1);
  int opacity = byteAt(band, ivec2(byteAt(thresholds, at), bandRow));
  // A drawing buffer narrower than 640 cannot resolve the logical grid: its device pixels, rows from the top, stand for it.
  ivec2 pixel = logicalBuffer.x < ${LOGICAL_WIDTH} ? ivec2(gl_FragCoord.x, float(logicalBuffer.y) - gl_FragCoord.y) : logicalPixel();
  if (byteAt(door, ivec2(opacity, (pixel.y & 3) * 4 + (pixel.x & 3))) == 0) discard;
  gl_FragColor = texelFetch(ramps, ivec2(byteAt(texels, at), 0), 0);
}`;

type Format = typeof RedFormat | typeof RGBAFormat | typeof RGFormat;

function dataTexture(data: Uint8Array<ArrayBuffer> | Float32Array<ArrayBuffer>, width: number, height: number, format: Format): DataTexture {
  const texture = new DataTexture(data, width, height, format, data instanceof Float32Array ? FloatType : undefined);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** Sets `matrix` to columns X, U, D and the translation P: a vertex (x, y, z) lies at P + x·X + y·U + z·D (drawn-pose.ts). */
const setFrame = (matrix: Matrix4, rows: Matrix3, { x, y, z }: Vec3): Matrix4 => matrix.set(
  rows[0], rows[3], rows[6], x,
  rows[1], rows[4], rows[7], y,
  rows[2], rows[5], rows[8], z,
  0, 0, 0, 1,
);

/** A shell's mesh and the per-draw uniforms its onBeforeRender uploads. */
interface ShellMesh {
  readonly mesh: Mesh;
  wrapRow: number;
  bandRow: number;
}

export class HitShimmerLayer implements FlightLayer {
  readonly slot = 'world';
  readonly #surfaces: ShimmerSurfaces;
  readonly #shimmer: HitShimmer;
  readonly #cache: FlightGpuCache;
  readonly #scene = new Scene();
  readonly #meshes = new Map<string, ShellMesh>();
  readonly #buffer = new Vector2();
  readonly #pose = new Matrix4();
  readonly #child = new Matrix4();

  constructor(surfaces: ShimmerSurfaces, shimmer: HitShimmer, cache: FlightGpuCache) {
    this.#surfaces = surfaces;
    this.#shimmer = shimmer;
    this.#cache = cache;
    this.#scene.name = 'hit-shimmer';
  }

  passes(frame: CompositionFrame): readonly LayerPass[] {
    this.#scene.clear();
    const drawings = this.#shimmer.drawings();
    if (!frame.world || drawings.length === 0) {
      this.#meshes.clear();
      return [];
    }
    this.#buffer.set(frame.logical.bufferWidth, frame.logical.bufferHeight);
    const poses = new Map(frame.world.scene.entities.map((entity) => [entity.entity.id, entity]));
    const used = new Set<string>();
    let index = 0;
    for (const [at, drawing] of drawings.entries()) {
      // Drawings come grouped by entity: index counts an entity's shells.
      index = at > 0 && drawings[at - 1].entityId === drawing.entityId ? index + 1 : 0;
      const pose = poses.get(drawing.entityId);
      if (pose === undefined || drawing.band < 0) continue;
      const key = `${drawing.entityId}:${index}:${drawing.model}:${drawing.family}`;
      used.add(key);
      const shell = this.#shell(drawing.model);
      const entry = this.#meshes.get(key) ?? this.#mesh(key, shell, drawing.family);
      entry.wrapRow = drawing.wrap * shell.tables[drawing.family].rowsPerWrap;
      entry.bandRow = drawing.band;
      setFrame(this.#pose, pose.rows, pose.position);
      if (drawing.type === 'shared') this.#pose.multiply(setFrame(this.#child, drawing.rows, drawing.local));
      entry.mesh.matrix.copy(this.#pose);
      entry.mesh.matrixWorld.copy(this.#pose);
      entry.mesh.renderOrder = this.#scene.children.length;
      this.#scene.add(entry.mesh);
    }
    for (const key of this.#meshes.keys()) if (!used.has(key)) this.#meshes.delete(key);
    return this.#scene.children.length === 0 ? [] : [{ scene: this.#scene, camera: frame.world.camera }];
  }

  #shell(model: AssetId): ShimmerShell {
    return this.#surfaces.models.get(model) ?? fail('binding-mismatch', `${PATH}.models[${model}]`, 'has a shimmer drawn but no prepared shell');
  }

  #mesh(key: string, shell: ShimmerShell, family: WrapFamily): ShellMesh {
    const mesh = new Mesh(this.#geometry(shell), this.#material(shell, family));
    mesh.name = `${PATH}:${key}`;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.frustumCulled = false;
    const entry: ShellMesh = { mesh, wrapRow: 0, bandRow: 0 };
    // Shells share materials: each draw uploads its own rows and the frame's drawing buffer.
    mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
      const shader = material as ShaderMaterial;
      shader.uniforms.wrapRow.value = entry.wrapRow;
      shader.uniforms.bandRow.value = entry.bandRow;
      shader.uniforms.logicalBuffer.value.copy(this.#buffer);
      shader.uniformsNeedUpdate = true;
    };
    this.#meshes.set(key, entry);
    return entry;
  }

  #geometry({ model, part: { corners, positions } }: ShimmerShell): BufferGeometry {
    return this.#cache.geometry(`${PATH}:geometry:${model}`, { vertices: corners, indices: 0 }, () => new BufferGeometry()
      .setAttribute('position', new BufferAttribute(positions, 3)));
  }

  #material({ model, part: { ramps: { key, ramps }, texture }, tables }: ShimmerShell, family: WrapFamily): ShaderMaterial {
    return this.#cache.material(`${PATH}:material:${model}:${family}`, () => {
      const { thresholds } = this.#surfaces;
      const table = tables[family];
      return new ShaderMaterial({
        name: 'flight-hit-shimmer',
        uniforms: {
          wrapUvs: { value: this.#texture(`${PATH}:wrap-uvs:${model}:${family}`, table.width, table.wraps * table.rowsPerWrap, RGFormat, () => table.uvs) },
          texels: { value: this.#texture(`${PATH}:texture:${texture!.id}`, texture!.width, texture!.height, RedFormat, () => texture!.indices) },
          thresholds: { value: this.#texture(`${PATH}:thresholds`, thresholds.width, thresholds.height, RedFormat, () => thresholds.indices) },
          band: { value: this.#texture(`${PATH}:band`, BAND_TABLE_SIZE.width, BAND_TABLE_SIZE.height, RedFormat, bandTable) },
          door: { value: this.#texture(`${PATH}:door`, SCREEN_DOOR_TABLE_SIZE.width, SCREEN_DOOR_TABLE_SIZE.height, RedFormat, screenDoorTable) },
          ramps: { value: this.#texture(`${PATH}:${key}`, ramps.colours, ramps.shades, RGBAFormat, () => ramps.rgba) },
          wrapRow: { value: 0 },
          bandRow: { value: 0 },
          logicalBuffer: logicalBufferUniform(),
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: BackSide,
      });
    }) as ShaderMaterial;
  }

  /** The texture under `key` of the texels `data()` gives when it is first acquired. */
  #texture(key: string, width: number, height: number, format: Format, data: () => Uint8Array<ArrayBuffer> | Float32Array<ArrayBuffer>): Texture {
    return this.#cache.texture(key, { width, height }, () => dataTexture(data(), width, height, format));
  }
}
