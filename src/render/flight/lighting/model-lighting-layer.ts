/**
 * The world layer of lit models (docs/plan/p3/12/spec.md, 模型、光照与第 2 列表; docs/original/formats/executable.md,
 * LS5–LS7, RS4, RS5; AC-07): every drawn entity whose presentation is a model, its list-0 parts at the entity's drawn
 * pose, each pixel one DATA colour of the part's ramps (model-surfaces.ts). P3-12/23 adds it to a run with
 * `FlightRunRender.addLayer`; its resources come from the run's GPU cache within `ModelSurfaces.plan`.
 *
 * - **Light:** per entity and frame, L′ of its drawn orientation (lighting-math.ts), exact on the CPU; the vertex
 *   shader forms d = (L′y·ny + L′x·nx) + L′z·nz and round-half-even(256·d) in GPU single precision, which can differ
 *   from the original's double-then-f32 value only where 256·d lies within a few f32 steps of a half-integer.
 * - **Shade:** flat and unlit parts use the triangle's value unchanged (`flat`); Gouraud parts interpolate it linearly in
 *   screen space (the original's spans step it affinely, LS7, interpolation Likely), then (value + 0x80) >> 8.
 * - **Texels:** u and v are interpolated affinely too, repeat by their fractional part and pick the nearest texel of
 *   the single level (LS7); the texel's source index selects its ramp. Without dither.
 * - **Faces:** the original keeps triangles running clockwise on screen, whose (b − a) × (c − a) faces the camera
 *   (RS4). Camera space is x right, y up, z away (logical-screen.ts), a mirror of WebGL's, so those are WebGL's back
 *   faces: parts are drawn with `BackSide`. Depth is tested new ≤ stored and written (RS5).
 * - **Order:** entities in the scene's ascending ID order, parts in stored order; it only matters for equal depths.
 * - **Limits:** the 3D world is drawn at device pixels (ADR-0009) by WebGL's continuous rasteriser, not by the
 *   original's fixed-point one. Pixels can therefore differ where the original's rounded rows, chopped 16.16 steps
 *   without prestep or 16-bit depth decide differently: the face test of a triangle whose rows round together (RS4),
 *   a pixel next to a texel or shade boundary (RS2, RS3, LS7) and nearly coplanar surfaces (RS5). Colours, shades,
 *   texels and culling direction follow the rules everywhere else.
 */
import {
  BackSide, BufferAttribute, BufferGeometry, DataTexture, Matrix4, Mesh, NearestFilter, RedFormat, RGBAFormat, Scene, ShaderMaterial, Vector3,
  type Texture,
} from 'three';
import type { AssetId } from '../../../content/asset-id.ts';
import { fail } from '../../../content/contract-validation.ts';
import type { EntityId } from '../../../core/world/entity-table.ts';
import type { CompositionFrame, FlightLayer, LayerPass } from '../composition/flight-layers.ts';
import type { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { modelLight } from './lighting-math.ts';
import type { LitPart, ModelSurfaces } from './model-surfaces.ts';

const PATH = 'lighting';

const VERTEX = `
uniform vec3 light;
in vec3 litNormal;
#ifdef FLAT
flat out float flatValue;
#endif
out vec3 affine;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float d = (light.y * litNormal.y + light.x * litNormal.x) + light.z * litNormal.z;
  float value = d > 0.0 ? roundEven(256.0 * d) : 0.0;
#ifdef FLAT
  flatValue = value;
#endif
  // Multiplied by w here and by 1/w (gl_FragCoord.w) per pixel: interpolated linearly in screen space.
  affine = vec3(uv, value) * gl_Position.w;
}`;

const FRAGMENT = `
uniform highp sampler2D ramps;
#ifdef TEXTURED
uniform highp sampler2D texels;
#endif
#ifdef FLAT
flat in float flatValue;
#endif
in vec3 affine;
void main() {
  vec3 screen = affine * gl_FragCoord.w;
#ifdef FLAT
  float value = flatValue;
#else
  float value = screen.z;
#endif
  int shade = clamp(int(floor((value + 128.0) / 256.0)), 0, textureSize(ramps, 0).y - 1);
  int colour = 0;
#ifdef TEXTURED
  ivec2 size = textureSize(texels, 0);
  ivec2 at = min(ivec2(floor(fract(screen.xy) * vec2(size))), size - 1);
  colour = int(texelFetch(texels, at, 0).r * 255.0 + 0.5);
#endif
  gl_FragColor = texelFetch(ramps, ivec2(colour, shade), 0);
}`;

function dataTexture(data: Uint8Array<ArrayBuffer>, width: number, height: number, format: typeof RedFormat | typeof RGBAFormat): DataTexture {
  const texture = new DataTexture(data, width, height, format);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** One drawn entity's meshes and the L′ they are drawn with. */
interface DrawnModel {
  readonly model: AssetId;
  readonly light: Vector3;
  readonly meshes: readonly Mesh[];
}

export class ModelLightingLayer implements FlightLayer {
  readonly slot = 'world';
  readonly #surfaces: ModelSurfaces;
  readonly #cache: FlightGpuCache;
  readonly #scene = new Scene();
  readonly #drawn = new Map<EntityId, DrawnModel>();
  readonly #pose = new Matrix4();

  constructor(surfaces: ModelSurfaces, cache: FlightGpuCache) {
    this.#surfaces = surfaces;
    this.#cache = cache;
    this.#scene.name = 'lit-models';
  }

  passes(frame: CompositionFrame): readonly LayerPass[] {
    if (!frame.world) return [];
    const { scale } = this.#surfaces.lighting;
    const drawn = frame.world.scene.entities.flatMap(({ entity, position, rows }) =>
      entity.presentation.type === 'model' ? [{ id: entity.id, model: this.#model(entity.id, entity.presentation.model), position, rows }] : []);
    const seen = new Set(drawn.map(({ id }) => id));
    for (const id of this.#drawn.keys()) if (!seen.has(id)) this.#drawn.delete(id);
    this.#scene.clear();
    let order = 0;
    for (const { model, position, rows } of drawn) {
      const { x, y, z } = modelLight(rows, scale);
      model.light.set(x, y, z);
      // Columns X, U and D: a vertex (x, y, z) lies at P + x·X + y·U + z·D (drawn-pose.ts).
      this.#pose.set(
        rows[0], rows[3], rows[6], position.x,
        rows[1], rows[4], rows[7], position.y,
        rows[2], rows[5], rows[8], position.z,
        0, 0, 0, 1,
      );
      for (const mesh of model.meshes) {
        mesh.matrix.copy(this.#pose);
        mesh.matrixWorld.copy(this.#pose);
        mesh.renderOrder = order++;
        this.#scene.add(mesh);
      }
    }
    return [{ scene: this.#scene, camera: frame.world.camera }];
  }

  /** The meshes of entity `id` drawn as `model`, made again when its model changes. */
  #model(id: EntityId, model: AssetId): DrawnModel {
    const known = this.#drawn.get(id);
    if (known?.model === model) return known;
    const parts = this.#surfaces.models.get(model) ?? fail('binding-mismatch', `${PATH}.models[${model}]`, 'is drawn but has no prepared surfaces');
    const light = new Vector3();
    const meshes = parts.map((part, index) => {
      const mesh = new Mesh(this.#geometry(model, index, part), this.#material(part));
      mesh.name = `${model}:${index}`;
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldAutoUpdate = false;
      mesh.frustumCulled = false;
      // Parts share materials across entities: each draw uploads its entity's L′ (three.js uploads a shader material's
      // uniforms again when uniformsNeedUpdate is set).
      mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
        const shader = material as ShaderMaterial;
        shader.uniforms.light.value.copy(light);
        shader.uniformsNeedUpdate = true;
      };
      return mesh;
    });
    const drawn = Object.freeze({ model, light, meshes: Object.freeze(meshes) });
    this.#drawn.set(id, drawn);
    return drawn;
  }

  #geometry(model: AssetId, index: number, { corners, positions, uvs, normals }: LitPart): BufferGeometry {
    return this.#cache.geometry(`${PATH}:geometry:${model}:${index}`, { vertices: corners, indices: 0 }, () => new BufferGeometry()
      .setAttribute('position', new BufferAttribute(positions, 3))
      .setAttribute('uv', new BufferAttribute(uvs, 2))
      .setAttribute('litNormal', new BufferAttribute(normals, 3)));
  }

  #material({ quality, ramps: { key, ramps }, texture }: LitPart): ShaderMaterial {
    const flat = quality < 3;
    return this.#cache.material(`${PATH}:material:${key}:${flat ? 'flat' : 'smooth'}`, () => {
      const uniforms: Record<string, { value: unknown }> = {
        light: { value: new Vector3() },
        ramps: { value: this.#texture(`${PATH}:${key}`, ramps.rgba, ramps.colours, ramps.shades, RGBAFormat) },
      };
      if (texture) uniforms.texels = { value: this.#texture(`${PATH}:texture:${texture.id}`, texture.indices, texture.width, texture.height, RedFormat) };
      return new ShaderMaterial({
        name: 'flight-lit-model', uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: BackSide,
        defines: { ...(flat ? { FLAT: '' } : {}), ...(texture ? { TEXTURED: '' } : {}) },
      });
    }) as ShaderMaterial;
  }

  #texture(key: string, data: Uint8Array<ArrayBuffer>, width: number, height: number, format: typeof RedFormat | typeof RGBAFormat): Texture {
    return this.#cache.texture(key, { width, height }, () => dataTexture(data, width, height, format));
  }
}
