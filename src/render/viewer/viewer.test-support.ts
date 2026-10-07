/**
 * Synthetic content for the viewer's Node tests, built in code through the content encoders and readers. Colours are
 * mid-range and distinct, so a pixel identifies its source and a colour-space conversion would change it.
 */
import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { composeLayout } from '../../content/graphics/compose-layout.ts';
import { expandImage, type ExpandedImage } from '../../content/graphics/expand-image.ts';
import { encodeFontPayload, readFontPayload, type FontPayload } from '../../content/graphics/font-payload.ts';
import { packMask } from '../../content/graphics/graphics.test-support.ts';
import { encodeImagePayload, readImagePayload, type ImagePayload } from '../../content/graphics/image-payload.ts';
import { encodeLayoutPayload, readLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { encodePalettePayload, readPalettePayload, type PalettePayload } from '../../content/graphics/palette-payload.ts';
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
