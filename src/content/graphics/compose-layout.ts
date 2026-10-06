import type { AssetId } from '../asset-id.ts';
import { fail } from '../contract-validation.ts';
import { expandImage, type ExpandedImage } from './expand-image.ts';
import { layoutImages, referencedPalettes } from './graphics-binding.ts';
import type { ImagePayload } from './image-payload.ts';
import type { LayoutPayload } from './layout-payload.ts';
import type { PalettePayload } from './palette-payload.ts';

/**
 * Composes a layout into a new frame-sized RGBA buffer the caller owns, at HI frame pixels without scaling. `images`
 * must hold exactly the images the layout draws and `palettes` exactly the palettes those images reference, keyed by
 * Asset ID. Elements are expanded with `expandImage` in draw order and only their opaque pixels are written, so a later
 * element covers an earlier one and transparent pixels leave what is below; uncovered pixels are (0, 0, 0, 0). This is
 * the project's only layout composition.
 */
export function composeLayout(
  layout: LayoutPayload,
  images: ReadonlyMap<AssetId, ImagePayload>,
  palettes: ReadonlyMap<AssetId, PalettePayload>,
  path = 'layout',
): ExpandedImage {
  const drawn = layoutImages(layout);
  if (images.size !== drawn.length || drawn.some(id => !images.has(id))) {
    fail('binding-mismatch', 'images', 'must be exactly the images the layout draws');
  }
  const referenced = new Set(drawn.flatMap(id => referencedPalettes(images.get(id)!)));
  if (palettes.size !== referenced.size || [...referenced].some(id => !palettes.has(id))) {
    fail('binding-mismatch', 'palettes', 'must be exactly the palettes the layout images reference');
  }
  const { width, height } = layout.frame;
  const rgba = new Uint8Array(width * height * 4);
  const target = new Uint32Array(rgba.buffer);
  for (const [index, { image, x, y }] of layout.elements.entries()) {
    const payload = images.get(image)!;
    const own = new Map(referencedPalettes(payload).map(id => [id, palettes.get(id)!]));
    const expanded = expandImage(payload, own, `images[${image}]`);
    if (x + expanded.width > width || y + expanded.height > height) {
      fail('layout-out-of-frame', `${path}.elements[${index}]`, 'must fit inside the frame at its image size');
    }
    const source = new Uint32Array(expanded.rgba.buffer);
    for (let row = 0; row < expanded.height; row++) {
      for (let column = 0; column < expanded.width; column++) {
        const pixel = row * expanded.width + column;
        if (expanded.rgba[pixel * 4 + 3] === 255) target[(y + row) * width + x + column] = source[pixel];
      }
    }
  }
  return Object.freeze({ width, height, rgba });
}
