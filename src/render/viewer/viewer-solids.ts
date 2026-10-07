/**
 * The viewer's 3D display of models and effects (P2-11 S-07, S-09). Each display creates its own geometries and
 * materials; model textures come from the renderer's shared ViewerTextures. The camera frames the bounding sphere of
 * everything shown from a fixed distance outside it; the view rotates the content about the sphere's centre and
 * magnifies with the camera's zoom. The bounding box only serves the framing and implies no rule.
 */
import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, PerspectiveCamera, Vector3, type Material, type Scene, type Texture } from 'three';
import type { AssetId } from '../../content/asset-id.ts';
import type { EffectShape } from '../../content/effects/expand-effects.ts';
import type { ExpandedImage } from '../../content/graphics/expand-image.ts';
import type { ModelPartItem } from '../../content/models/model-parts.ts';
import { attemptAll } from '../scene/cleanup.ts';
import { VIEWPORT_ASPECT } from '../viewport/viewport-layout.ts';
import type { ViewerDisplay } from './viewer-display.ts';
import { fanTriangles } from './viewer-effects.ts';
import { effectAppearance, neutralLights, partColour, solidMaterial, toViewerSpace, VIEWER_FOV } from './viewer-presentation.ts';
import type { ViewerTextures } from './viewer-textures.ts';
import type { ViewerView } from './viewer-view.ts';

/** One mesh to build: its geometry in viewer space, display bytes of its colour, and its texture if any. */
interface Solid {
  readonly geometry: BufferGeometry;
  readonly rgb: readonly [number, number, number];
  readonly texture: AssetId | null;
}

/** A model part's geometry in viewer space: positions and normals with z negated, indices and UVs as stored. */
export function modelPartGeometry(part: ModelPartItem): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(toViewerSpace(part.positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(toViewerSpace(part.normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(part.uvs, 2));
  geometry.setIndex(new BufferAttribute(part.indices, 1));
  return geometry;
}

/** An effect shape's geometry in viewer space: positions with z negated, faces fanned from their first corner. */
export function effectShapeGeometry(shape: EffectShape): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(toViewerSpace(shape.positions), 3));
  geometry.setIndex(new BufferAttribute(fanTriangles(shape.faces), 1));
  return geometry;
}

/** A sphere around every vertex, centred on their bounding box; a radius of 1 when there is no extent. */
function boundingSphere(geometries: readonly BufferGeometry[]): { readonly centre: Vector3; readonly radius: number } {
  const box = new Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  const centre = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());
  const point = new Vector3();
  let radius = 0;
  for (const geometry of geometries) {
    const positions = geometry.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex++) radius = Math.max(radius, point.fromBufferAttribute(positions, vertex).distanceTo(centre));
  }
  return { centre, radius: radius > 0 ? radius : 1 };
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Builds the meshes of `solids` and adds them to the scene. Textures are leased from `textures`; when building fails,
 * every lease is returned before the error is thrown.
 */
function createSolidDisplay(
  scene: Scene, name: string, solids: readonly Solid[], lightable: boolean,
  textures: { readonly cache: ViewerTextures; readonly pictures: ReadonlyMap<AssetId, ExpandedImage> } | null, initial: ViewerView,
): ViewerDisplay {
  const owned: { dispose(): void }[] = solids.map(({ geometry }) => geometry);
  const leased: AssetId[] = [];
  const release = (): unknown[] => [
    ...attemptAll(owned.map(resource => () => { resource.dispose(); })),
    ...leased.flatMap(id => textures!.cache.release(id)),
  ];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    owned.push(resource);
    return resource;
  };
  let meshes: { readonly mesh: Mesh; readonly unlit: Material; readonly lit: Material | null }[];
  try {
    const maps = new Map<AssetId, Texture>();
    for (const id of new Set(solids.flatMap(({ texture }) => (texture === null ? [] : [texture])))) {
      const picture = textures?.pictures.get(id);
      if (!picture) throw new RangeError(`The item has no picture for texture ${id}`);
      maps.set(id, textures!.cache.acquire(id, picture));
      leased.push(id);
    }
    meshes = solids.map(({ geometry, rgb, texture }, index) => {
      const map = texture === null ? null : maps.get(texture)!;
      const unlit = own(solidMaterial(rgb, map, false));
      const lit = lightable ? own(solidMaterial(rgb, map, true)) : null;
      const mesh = new Mesh(geometry, unlit);
      mesh.name = `${name}#${index}`;
      return { mesh, unlit, lit };
    });
  } catch (cause) {
    const errors = release();
    if (errors.length === 0) throw cause;
    throw new AggregateError([cause, ...errors], 'Viewer display creation and cleanup failed', { cause });
  }

  const { centre, radius } = boundingSphere(solids.map(({ geometry }) => geometry));
  // The camera stays where the sphere just fits the vertical field of view, outside it whatever the zoom, so near and
  // far enclose the whole sphere; the 4:3 view is wider than it is tall.
  const distance = radius / Math.sin(radians(VIEWER_FOV / 2));
  const content = new Group();
  content.position.copy(centre).negate();
  // three.js reports an error for add() without an object, as an empty part list would give.
  if (meshes.length > 0) content.add(...meshes.map(({ mesh }) => mesh));
  const pivot = new Group();
  pivot.name = name;
  pivot.add(content);
  const lights = lightable ? neutralLights().map(own) : [];
  const camera = new PerspectiveCamera(VIEWER_FOV, VIEWPORT_ASPECT, (distance - radius) * 0.99, (distance + radius) * 1.01);
  camera.position.set(0, 0, distance);
  let view = initial;

  const apply = (): void => {
    pivot.rotation.set(radians(view.pitch), radians(view.yaw), 0, 'XYZ');
    camera.zoom = view.zoom;
    camera.updateProjectionMatrix();
    for (const { mesh, unlit, lit } of meshes) mesh.material = view.lit && lit ? lit : unlit;
    for (const light of lights) light.visible = view.lit;
  };
  apply();
  scene.add(pivot, ...lights);

  return {
    camera,
    place({ bufferWidth, bufferHeight }) {
      camera.aspect = bufferWidth / bufferHeight;
      camera.updateProjectionMatrix();
      return Object.freeze({ left: 0, top: 0, width: bufferWidth, height: bufferHeight });
    },
    view(next) {
      const changed = next.yaw !== view.yaw || next.pitch !== view.pitch || next.zoom !== view.zoom || (lightable && next.lit !== view.lit);
      view = next;
      if (changed) apply();
      return changed;
    },
    dispose() {
      scene.remove(pivot, ...lights);
      return release();
    },
  };
}

/**
 * A model's parts: untextured parts show their colour, textured parts their texels. Its textures are shared through
 * `cache` by image Asset ID.
 */
export function createModelDisplay(
  scene: Scene, name: string, parts: readonly ModelPartItem[], pictures: ReadonlyMap<AssetId, ExpandedImage>, cache: ViewerTextures, view: ViewerView,
): ViewerDisplay {
  const solids = parts.map((part): Solid => ({
    geometry: modelPartGeometry(part),
    rgb: partColour(part.material),
    texture: 'texture' in part.material ? part.material.texture : null,
  }));
  return createSolidDisplay(scene, name, solids, true, { cache, pictures }, view);
}

/** Effect shapes in their effect colours or the diagnostic grey, always unlit and untextured. */
export function createEffectDisplay(scene: Scene, name: string, shapes: readonly EffectShape[], view: ViewerView): ViewerDisplay {
  const solids = shapes.map((shape): Solid => ({ geometry: effectShapeGeometry(shape), rgb: effectAppearance(shape).rgb, texture: null }));
  return createSolidDisplay(scene, name, solids, false, null, view);
}
