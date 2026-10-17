import { readAssetId, type AssetId } from '../../../content/asset-id.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import { readSceneSettings } from '../../../content/flight/flight-data-readers.ts';
import { syntheticSceneSettings } from '../../../content/flight/flight-data.test-support.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { ModelGeometry, ModelPart, ModelPayload } from '../../../content/models/model-payload.ts';
import type { ModelLightingContent } from './model-surfaces.ts';

// Code-generated synthetic lighting inputs; never original data.

export const DATA = readAssetId('palette/synthetic-data');
export const TEXTURE = readAssetId('image/synthetic-lit-texture');
export const TEXTURE_PALETTE = readAssetId('palette/synthetic-lit-texture');
export const MODEL = readAssetId('model/synthetic');

/** A 6-bit VGA value expanded to 8 bits by bit replication, as DATA is. */
export const vga = (value: number): number => (value << 2) | (value >> 4);

/** 256 entries: entry i is (vga(i % 64), vga((i * 5) % 64), vga((i * 11) % 64)), so many colours tie or nearly tie. */
export function dataPalette(): PalettePayload {
  const entries = new Uint8Array(768);
  for (let entry = 0; entry < 256; entry++) entries.set([vga(entry % 64), vga((entry * 5) % 64), vga((entry * 11) % 64)], entry * 3);
  return Object.freeze({ kind: 'palette', entries });
}

/** The nearest DATA entry by the confirmed rule, written out independently of `nearestColourMap`. */
export function bruteNearest(data: PalettePayload, [r, g, b]: readonly number[]): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let entry = 0; entry < data.entries.length / 3; entry++) {
    const [R, G, B] = [0, 1, 2].map((c) => data.entries[entry * 3 + c] & 0xfc);
    const distance = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (distance < bestDistance) [best, bestDistance] = [entry, distance];
  }
  return best;
}

/** A light colour of intensity `level` (the weights sum to 256). */
export const grey = (level: number): readonly [number, number, number] => [level, level, level];

/** Scene settings with a directional intensity of 0.5 (k = 1.5) and ambient 0.125 (byte 32). */
export function lightingSettings(overrides: Partial<Record<'lightType3Colour' | 'lightType0Colour' | 'deviceByte', unknown>> = {}): SceneSettings {
  return readSceneSettings({
    ...syntheticSceneSettings(), lightType3Colour: grey(0.5), lightType0Colour: grey(0.125), deviceByte: 3,
    deviceValues: { base: 600, kinds1c7c: 1200, kindsF8000: 4000 }, ...overrides,
  });
}

/** The texture's palette: four colours. */
export const TEXTURE_COLOURS = Object.freeze([[200, 40, 40], [40, 200, 40], [40, 40, 200], [103, 103, 103]] as const);

/** A 4 × 2 texture whose texels address all four palette entries. */
export function textureImage(overrides: Partial<ImagePayload> = {}): ImagePayload {
  return Object.freeze({
    kind: 'image', width: 4, height: 2, palette: TEXTURE_PALETTE, display: Object.freeze({ nearest: DATA }),
    indices: Uint8Array.of(0, 1, 2, 3, 3, 2, 1, 0), mask: null, ...overrides,
  });
}

/**
 * Two triangles on the xy plane, 0-1-2 with face normal +z and 3-2-0 with −z; four stored normals, the first two along
 * +z unnormalised and normalised, and corner slots 0–5, of which 4 and 5 lie beyond the four stored normals.
 */
export function squareGeometry(): ModelGeometry {
  return {
    positions: Float32Array.of(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0),
    uvs: Float32Array.of(0, 0, 1, 0, 1, 1, 0, 1),
    normals: Float32Array.of(0, 0, 2, 0, 0, 1, 1, 0, 0, 0, 3, 4),
    indices: Uint16Array.of(0, 1, 2, 3, 2, 0),
    cornerShading: Uint16Array.of(0, 1, 2, 3, 4, 5),
    shadingSlotCount: 6,
  };
}

const part = (sourceFlags: number, colour: readonly [number, number, number], texture: AssetId | null): ModelPart =>
  Object.freeze({ sourceFlags, colour, geometry: 0, texture });

/** List 0: a flat textured part, a Gouraud untextured part and an unlit textured part; one list-1 and list-2 part. */
export function litModel(): ModelPayload {
  return Object.freeze<ModelPayload>({
    kind: 'model',
    geometries: [squareGeometry()],
    partLists: [
      [part(2, [9, 9, 9], TEXTURE), part(0x8000_0003, [103, 103, 103], null), part(1, [0, 0, 0], TEXTURE)],
      [part(3, [10, 20, 30], null)],
      [part(1, [255, 255, 255], TEXTURE)],
    ],
    soundSlots: [null, null, null, null, null],
  });
}

export function lightingContent(overrides: Partial<ModelLightingContent> = {}): ModelLightingContent {
  const texturePalette: PalettePayload = { kind: 'palette', entries: Uint8Array.from(TEXTURE_COLOURS.flat()) };
  return {
    data: DATA,
    models: new Map([[MODEL, litModel()]]),
    images: new Map([[TEXTURE, textureImage()]]),
    palettes: new Map([[DATA, dataPalette()], [TEXTURE_PALETTE, texturePalette]]),
    ...overrides,
  };
}
