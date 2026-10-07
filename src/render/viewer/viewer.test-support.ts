/**
 * Synthetic content for the viewer's Node tests, built in code through the content encoders and readers. Colours are
 * mid-range and distinct, so a pixel identifies its source and a colour-space conversion would change it.
 */
import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { encodeEffectPayload, readEffectPayload, type EffectPayload } from '../../content/effects/effect-payload.ts';
import { syntheticDebris, syntheticMissile, syntheticProjectile } from '../../content/effects/effects.test-support.ts';
import { composeLayout } from '../../content/graphics/compose-layout.ts';
import { expandImage, type ExpandedImage } from '../../content/graphics/expand-image.ts';
import { encodeFontPayload, readFontPayload, type FontPayload } from '../../content/graphics/font-payload.ts';
import { packMask } from '../../content/graphics/graphics.test-support.ts';
import { encodeImagePayload, readImagePayload, type ImagePayload } from '../../content/graphics/image-payload.ts';
import { encodeLayoutPayload, readLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { encodePalettePayload, readPalettePayload, type PalettePayload } from '../../content/graphics/palette-payload.ts';
import { expandModelTextures, modelPartItems } from '../../content/models/model-parts.ts';
import { encodeModelPayload, readModelPayload, type ModelPayload } from '../../content/models/model-payload.ts';
import { effectViews } from './viewer-effects.ts';
import type { ViewerItem } from './viewer-renderer.ts';

export const PALETTE_ID = readAssetId('palette/synthetic-viewer');

export function syntheticPalette(count: number, seed = 0): PalettePayload {
  const entries = Array.from({ length: count }, (_, entry) => [
    (entry * 37 + seed * 5 + 11) % 200 + 20, (entry * 53 + seed * 3 + 7) % 200 + 21, (entry * 71 + seed + 3) % 200 + 22,
  ]);
  return readPalettePayload(encodePalettePayload({ entries: Uint8Array.from(entries.flat()) }), 1);
}

/** Glyph g has row r = (g × 29 + r × 13) | 1, so glyphs differ and bit 0 lies past narrow cells; rows past the cell are 0xff. */
export function syntheticFont(glyphCount: number, cellWidth = 5, height = 6, glyphRows = 8): FontPayload {
  const glyphs = Uint8Array.from({ length: glyphCount * glyphRows }, (_, at) => {
    const [glyph, row] = [Math.floor(at / glyphRows), at % glyphRows];
    return row >= height ? 0xff : ((glyph * 29 + row * 13) & 0xff) | 0x01;
  });
  return readFontPayload(encodeFontPayload({ cellWidth, height, glyphRows, glyphs, charMap: [{ code: 65, glyph: 0 }] }), 1);
}

/** A masked image on PALETTE_ID: '1' is opaque, and opaque pixels take indices 1, 2, … in row-major order. */
export function syntheticImage(opacity: readonly string[]): ImagePayload {
  let next = 0;
  const indices = opacity.flatMap(row => [...row].map(bit => (bit === '1' ? (next++ % 15) + 1 : 0)));
  return readImagePayload(encodeImagePayload({
    width: opacity[0].length, height: opacity.length, palette: PALETTE_ID, display: 'direct',
    indices: Uint8Array.from(indices), mask: packMask(opacity),
  }), 1);
}

export const expandSynthetic = (image: ImagePayload, seed = 0): ExpandedImage =>
  expandImage(image, new Map([[PALETTE_ID, syntheticPalette(16, seed)]]));

/** An 8 × 6 layout frame with two overlapping images, leaving its right and bottom edges uncovered. */
export function syntheticLayout(): ExpandedImage {
  const a = readAssetId('image/synthetic-viewer-a');
  const b = readAssetId('image/synthetic-viewer-b');
  const images = new Map<AssetId, ImagePayload>([[a, syntheticImage(['111', '101', '111'])], [b, syntheticImage(['1111', '1111'])]]);
  const layout = readLayoutPayload(encodeLayoutPayload({
    frame: { width: 8, height: 6 }, elements: [{ image: a, x: 1, y: 1 }, { image: b, x: 3, y: 3 }],
  }), 1);
  return composeLayout(layout, images, new Map([[PALETTE_ID, syntheticPalette(16)]]));
}

/** Ten distinct items of every 2D kind, for switching between them. */
export function syntheticItems(): ViewerItem[] {
  const id = (name: string): AssetId => readAssetId(name);
  return [
    { kind: 'image', id: id('image/one'), picture: expandSynthetic(syntheticImage(['110', '011'])) },
    { kind: 'palette', id: id('palette/one'), palette: syntheticPalette(20) },
    { kind: 'font', id: id('font/one'), font: syntheticFont(18) },
    { kind: 'layout', id: id('layout/one'), picture: syntheticLayout() },
    { kind: 'image', id: id('image/two'), picture: expandSynthetic(syntheticImage(['1111', '1001', '1111']), 1) },
    { kind: 'palette', id: id('palette/two'), palette: syntheticPalette(256, 2) },
    { kind: 'font', id: id('font/two'), font: syntheticFont(256, 8, 8, 8) },
    { kind: 'image', id: id('image/three'), picture: expandSynthetic(syntheticImage(['1'])) },
    { kind: 'palette', id: id('palette/three'), palette: syntheticPalette(3, 3) },
    { kind: 'image', id: id('image/four'), picture: expandSynthetic(syntheticImage(['10', '01', '11']), 4) },
  ];
}

export const TEXTURE_ID = readAssetId('image/synthetic-viewer-texture');
/** A 4 × 2 model texture with one transparent texel. */
export const textureImage = (): ImagePayload => syntheticImage(['1111', '1101']);

/**
 * Model payload bytes. List 0: a triangle textured with `texture` (coloured when null) and a quadrilateral in a
 * mid-range colour that `seed` shifts; list 1: the quadrilateral alone in another colour; list 2 empty. Sound slot 0
 * holds `sound`. Coordinates have distinct non-zero z, so a z conversion shows.
 */
export function syntheticModelBytes({ seed = 0, texture = TEXTURE_ID as AssetId | null, sound = null as AssetId | null } = {}): Uint8Array<ArrayBuffer> {
  return encodeModelPayload({
    geometries: [
      {
        positions: Float32Array.of(0, 0, 0.5, 2, 0, 1, 0, 3, 2),
        uvs: Float32Array.of(0, 0, 1.5, 0, 0, 2),
        normals: Float32Array.of(0, 0, 1, 0.6, 0, 0.8, 0, 1, 0),
        indices: Uint16Array.of(0, 1, 2),
        cornerShading: Uint16Array.of(0, 0, 0),
        shadingSlotCount: 1,
      },
      {
        positions: Float32Array.of(-1, -1, -2, 1, -1, -2.5, 1, 1, -3, -1, 1, -1.5),
        uvs: Float32Array.of(0, 0, 1, 0, 1, 1, 0, 1),
        normals: Float32Array.of(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1),
        indices: Uint16Array.of(0, 1, 2, 0, 2, 3),
        cornerShading: Uint16Array.of(0, 0, 0, 0, 0, 0),
        shadingSlotCount: 1,
      },
    ],
    partLists: [
      [
        { sourceFlags: 0, colour: [200, 10, 10], geometry: 0, texture },
        { sourceFlags: 0, colour: [51 + seed, 102, 153], geometry: 1, texture: null },
      ],
      [{ sourceFlags: 1, colour: [90, 140, 60], geometry: 1, texture: null }],
      [],
    ],
    soundSlots: [sound, null, null, null, null],
  });
}

/** The default synthetic model read back through the content reader. */
export const syntheticModel = (seed = 0): ModelPayload => readModelPayload(syntheticModelBytes({ seed }), 1);

/** A model item of part list `list`, its textures expanded from `textureImage` on PALETTE_ID. */
export function modelItem(model = syntheticModel(), list = 0, id = 'model/synthetic-viewer'): ViewerItem {
  const textures = expandModelTextures(model, new Map([[TEXTURE_ID, textureImage()]]), new Map([[PALETTE_ID, syntheticPalette(16)]]));
  return { kind: 'model', id: readAssetId(id), parts: modelPartItems(model, list), textures };
}

/** The synthetic effect payloads of every kind, read back through the content reader. */
export function syntheticEffects(): readonly EffectPayload[] {
  return [syntheticProjectile(), syntheticMissile(), syntheticDebris()].map(payload => readEffectPayload(encodeEffectPayload(payload), 2, payload.kind));
}

/** The item of one effect view. */
export function effectItem(payload: EffectPayload, index = 0, id = `data/synthetic-${payload.kind}`): ViewerItem {
  const textures = new Map(payload.kind === 'projectile' ? [] : [[payload.texture, expandSynthetic(textureImage())]]);
  return { kind: 'effect', id: readAssetId(id), view: effectViews(payload)[index], textures };
}
