import type { AssetId } from '../asset-id.ts';
import { fail } from '../contract-validation.ts';
import { referencedPalettes } from './graphics-binding.ts';
import { isOpaque, type ImagePayload } from './image-payload.ts';
import type { PalettePayload } from './palette-payload.ts';

export interface ExpandedImage {
  readonly width: number;
  readonly height: number;
  /** width × height × 4 bytes of non-premultiplied RGBA, row 0 at the top; transparent pixels are (0, 0, 0, 0). */
  readonly rgba: Uint8Array<ArrayBuffer>;
}

/**
 * For each source entry, the index of the target entry at the least squared Euclidean distance in 8-bit RGB, ties going
 * to the lower index. This is a provisional project rule: the original metric and tie rule are not yet evidenced
 * (U-028), so synthetic tests prove only this algorithm, not fidelity. It is the project's only nearest-colour logic.
 */
export function nearestColourMap(source: PalettePayload, target: PalettePayload): Uint8Array<ArrayBuffer> {
  const [from, to] = [source.entries, target.entries];
  const map = new Uint8Array(from.length / 3);
  for (let entry = 0; entry < map.length; entry++) {
    const [red, green, blue] = from.subarray(entry * 3, entry * 3 + 3);
    let best = 0;
    let bestDistance = Infinity;
    for (let candidate = 0; candidate < to.length; candidate += 3) {
      const distance = (red - to[candidate]) ** 2 + (green - to[candidate + 1]) ** 2 + (blue - to[candidate + 2]) ** 2;
      if (distance < bestDistance) {
        best = candidate / 3;
        bestDistance = distance;
      }
    }
    map[entry] = best;
  }
  return map;
}

/** The RGB triple shown for each source palette entry under the image's display mapping. */
function displayColours(image: ImagePayload, source: PalettePayload, palettes: ReadonlyMap<AssetId, PalettePayload>): Uint8Array {
  if (image.display === 'direct') return source.entries;
  const target = palettes.get(image.display.nearest)!;
  const map = nearestColourMap(source, target);
  const colours = new Uint8Array(source.entries.length);
  for (let entry = 0; entry < map.length; entry++) colours.set(target.entries.subarray(map[entry] * 3, map[entry] * 3 + 3), entry * 3);
  return colours;
}

/**
 * Expands an image into a new RGBA buffer the caller owns. `palettes` must hold exactly the palettes the image
 * references, keyed by Asset ID; every opaque index must address an entry of the image's own palette.
 */
export function expandImage(image: ImagePayload, palettes: ReadonlyMap<AssetId, PalettePayload>, path = 'image'): ExpandedImage {
  const referenced = referencedPalettes(image);
  if (palettes.size !== referenced.length || referenced.some(id => !palettes.has(id))) {
    fail('binding-mismatch', 'palettes', 'must be exactly the palettes the image references');
  }
  const { width, height, indices, mask } = image;
  const source = palettes.get(image.palette)!;
  const entryCount = source.entries.length / 3;
  const colours = displayColours(image, source, palettes);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isOpaque(mask, width, x, y)) continue;
      const pixel = y * width + x;
      const index = indices[pixel];
      if (index >= entryCount) fail('palette-index-out-of-range', `${path}.indices`, 'must address an entry of the image palette');
      rgba[pixel * 4] = colours[index * 3];
      rgba[pixel * 4 + 1] = colours[index * 3 + 1];
      rgba[pixel * 4 + 2] = colours[index * 3 + 2];
      rgba[pixel * 4 + 3] = 255;
    }
  }
  return Object.freeze({ width, height, rgba });
}
