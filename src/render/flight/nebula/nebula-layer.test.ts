import type { DataTexture, Mesh, ShaderMaterial } from 'three';
import { Camera } from 'three';
import { describe, expect, it } from 'vitest';
import { readAssetId, type AssetId } from '../../../content/asset-id.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import type { CompositionFrame } from '../composition/flight-layers.ts';
import type { PresentationViewport } from '../presentation/presentation-contract.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { IDENTITY_ROWS as IDENTITY } from '../scene/drawn-pose.ts';
import { createNebulaLayer, NEBULA_FOOTPRINT, NEBULA_GPU_PLAN } from './nebula-layer.ts';
import { cameraRows, pitch, type Vec } from './nebula.test-support.ts';

// Code-generated images: each slot's image has four quadrants of its own indices, so position, orientation and slot
// can be read back from the drawn colours. Never original data.

const PALETTE = readAssetId('palette/synthetic/data');
const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });
/** F1's viewport bottom and the destruction view's (NB3). */
const F1: PresentationViewport = Object.freeze({ left: 0, top: 0, right: 639, bottom: 315 });
const DESTRUCTION: PresentationViewport = Object.freeze({ left: 0, top: 0, right: 639, bottom: 479 });

type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const QUADRANTS: readonly Quadrant[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** Index of a stored quadrant of slot `slot`'s image: 1–24. */
const quadrantIndex = (slot: number, quadrant: Quadrant): number => 1 + slot * 4 + QUADRANTS.indexOf(quadrant);

/** A distinct colour for every index, never black. */
const colourOf = (index: number): [number, number, number] => [index * 10, 255 - index * 10, (index * 37) % 256];

const palette: PalettePayload = Object.freeze({
  kind: 'palette', entries: new Uint8Array(Array.from({ length: 256 }, (_, index) => colourOf(index)).flat()),
});

function slotImage(slot: number, overrides: Partial<ImagePayload> = {}): ImagePayload {
  const indices = new Uint8Array(128 * 128);
  for (let row = 0; row < 128; row++) {
    for (let column = 0; column < 128; column++) {
      indices[row * 128 + column] = quadrantIndex(slot, `${row < 64 ? 'top' : 'bottom'}-${column < 64 ? 'left' : 'right'}` as Quadrant);
    }
  }
  return { kind: 'image', width: 128, height: 128, palette: PALETTE, display: 'direct', indices, mask: null, ...overrides };
}

const IMAGES = Object.freeze(Array.from({ length: 6 }, (_, slot) => slotImage(slot)));
const PALETTES: ReadonlyMap<AssetId, PalettePayload> = new Map([[PALETTE, palette]]);

function setup(images: readonly ImagePayload[] = IMAGES) {
  const cache = new FlightGpuCache(BINDING, () => ({ width: 640, height: 480 }));
  const layer = createNebulaLayer({ cache, images, palettes: PALETTES });
  const logicalCamera = new Camera();
  const frame = (cameraRows: Matrix3, viewport = F1, view: 'flight' | 'destruction' = 'flight'): CompositionFrame => ({
    view, logicalCamera,
    world: { scene: { view, viewport, camera: { position: { x: 5, y: 6, z: 7 }, rows: cameraRows } } },
  }) as unknown as CompositionFrame;
  return { cache, layer, frame, logicalCamera };
}

/** What a drawn frame shows: the mesh's logical origin and the colour, or null, at logical pixels. */
function drawn(passes: ReturnType<ReturnType<typeof setup>['layer']['passes']>) {
  expect(passes).toHaveLength(1);
  const mesh = passes[0].scene.children[0] as Mesh;
  const texture = (mesh.material as ShaderMaterial).uniforms.footprint.value as DataTexture;
  const data = texture.image.data as Uint8Array;
  const left = mesh.position.x;
  const top = mesh.position.y;
  const at = (x: number, y: number): [number, number, number] | null => {
    const i = x - left;
    const j = y - top;
    if (i < 0 || j < 0 || i >= NEBULA_FOOTPRINT || j >= NEBULA_FOOTPRINT) return null;
    const offset = (j * NEBULA_FOOTPRINT + i) * 4;
    return data[offset + 3] === 0 ? null : [data[offset], data[offset + 1], data[offset + 2]];
  };
  return { mesh, texture, data, left, top, at };
}

const shows = (slot: number, quadrant: Quadrant) => colourOf(quadrantIndex(slot, quadrant));

describe('nebula layer', () => {
  it('allocates its plan in the run\'s cache and draws in the nebula slot without depth', () => {
    const { cache, layer } = setup();
    expect(layer.slot).toBe('nebula');
    expect(cache.counts()).toEqual({
      geometries: 1, materials: 1, textures: 1, renderTargets: 0,
      vertices: NEBULA_GPU_PLAN.vertices, indices: NEBULA_GPU_PLAN.indices, texels: NEBULA_GPU_PLAN.texels,
    });
    expect(NEBULA_FOOTPRINT).toBe(183);
    cache.dispose();
    expect(cache.counts().texels).toBe(0);
  });

  it('draws slot 0 at the screen centre under the identity, turned so the stored top-left is at the top-right', () => {
    const { layer, frame, logicalCamera } = setup();
    const passes = layer.passes(frame(IDENTITY));
    expect(passes[0].camera).toBe(logicalCamera);
    expect(passes[0]).not.toHaveProperty('target');
    const { mesh, at } = drawn(passes);
    const material = mesh.material as ShaderMaterial;
    expect([material.depthTest, material.depthWrite]).toEqual([false, false]);
    expect([mesh.position.x, mesh.position.y]).toEqual([320 - 91, 240 - 91]);
    // θ = π: stored rows run left, stored columns down.
    expect(at(350, 210)).toEqual(shows(0, 'top-left'));
    expect(at(290, 210)).toEqual(shows(0, 'bottom-left'));
    expect(at(350, 270)).toEqual(shows(0, 'top-right'));
    expect(at(290, 270)).toEqual(shows(0, 'bottom-right'));
    expect(at(320 - 70, 240)).toBeNull();
    expect(at(320, 240 - 70)).toBeNull();
  });

  it('draws the slot the camera looks towards with that slot\'s image', () => {
    const { layer, frame } = setup();
    const looks: readonly [number, Vec, Vec][] = [
      [1, [0, 1, 0], [0, 0, -1]], [2, [0, 0, 1], [0, 1, 0]], [3, [0, 0, 1], [0, -1, 0]], [4, [0, 1, 0], [1, 0, 0]], [5, [0, 1, 0], [-1, 0, 0]],
    ];
    for (const [slot, up, dir] of looks) {
      const { at } = drawn(layer.passes(frame(cameraRows(up, dir))));
      const centre = at(330, 230);
      expect(QUADRANTS.some((quadrant) => JSON.stringify(centre) === JSON.stringify(shows(slot, quadrant))), `slot ${slot}`).toBe(true);
    }
  });

  it('clips at the view\'s viewport bottom: rows below 315 only in the destruction view', () => {
    const { layer, frame } = setup();
    const low = pitch(-0.106);
    const f1 = drawn(layer.passes(frame(low, F1)));
    expect(f1.top + 91).toBeGreaterThan(290);
    expect(f1.at(320, 315)).not.toBeNull();
    for (let y = 316; y < f1.top + NEBULA_FOOTPRINT; y++) expect(f1.at(320, y)).toBeNull();
    const destruction = drawn(layer.passes(frame(low, DESTRUCTION, 'destruction')));
    expect(destruction.at(320, 316)).not.toBeNull();
    expect(destruction.at(320, 340)).not.toBeNull();
  });

  it('never writes row 0', () => {
    const { layer, frame } = setup();
    const { top, at } = drawn(layer.passes(frame(pitch(0.33))));
    expect(top).toBeLessThan(0);
    expect(at(320, 0)).toBeNull();
    expect(at(320, 1)).not.toBeNull();
  });

  it('draws nothing when no slot is visible or the view has no world', () => {
    const { layer, frame } = setup();
    expect(layer.passes(frame(cameraRows([0, 1, 0], [Math.SQRT1_2, 0, Math.SQRT1_2])))).toEqual([]);
    expect(layer.passes({ ...frame(IDENTITY), world: null })).toEqual([]);
  });

  it('fills the footprint again only when the placement or the viewport bottom changes', () => {
    const { layer, frame } = setup();
    const { texture } = drawn(layer.passes(frame(IDENTITY)));
    const version = texture.version;
    layer.passes(frame([...IDENTITY] as unknown as Matrix3));
    expect(texture.version).toBe(version);
    layer.passes(frame(pitch(0.01)));
    expect(texture.version).toBe(version + 1);
    layer.passes(frame(pitch(0.01), DESTRUCTION, 'destruction'));
    expect(texture.version).toBe(version + 2);
    // Back at the identity, the earlier frame's pixels are gone.
    const back = drawn(layer.passes(frame(IDENTITY)));
    expect(back.at(350, 210)).toEqual(shows(0, 'top-left'));
  });

  it('shows the same image in every slot that repeats it', () => {
    const { layer, frame } = setup([IMAGES[3], IMAGES[3], IMAGES[3], IMAGES[3], IMAGES[3], IMAGES[3]]);
    expect(drawn(layer.passes(frame(IDENTITY))).at(350, 210)).toEqual(shows(3, 'top-left'));
  });

  it('rejects anything but six opaque, directly shown 128 × 128 images with their palette', () => {
    const reject = (images: readonly ImagePayload[], palettes = PALETTES) => {
      const cache = new FlightGpuCache(BINDING, () => ({ width: 640, height: 480 }));
      expect(() => createNebulaLayer({ cache, images, palettes })).toThrow(FlightRenderError);
      expect(cache.counts().textures).toBe(0);
    };
    reject(IMAGES.slice(0, 5));
    reject([...IMAGES, IMAGES[0]]);
    const replaced = (image: ImagePayload) => [image, ...IMAGES.slice(1)];
    reject(replaced(slotImage(0, { width: 64, indices: new Uint8Array(64 * 128) })));
    reject(replaced(slotImage(0, { display: { nearest: PALETTE } })));
    reject(replaced(slotImage(0, { mask: new Uint8Array(16 * 128).fill(0xff) })));
    reject(IMAGES, new Map());
  });
});
