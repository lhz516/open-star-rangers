import type { AssetDescriptor } from '../asset-contract.ts';
import type { AssetId } from '../asset-id.ts';
import { compareText, fail } from '../contract-validation.ts';
import type { FontPayload } from './font-payload.ts';
import type { ImagePayload } from './image-payload.ts';
import type { LayoutPayload } from './layout-payload.ts';
import type { PalettePayload } from './palette-payload.ts';

export type GraphicsPayload = PalettePayload | ImagePayload | FontPayload | LayoutPayload;

/** The palette Asset IDs an image with this binding references, deduplicated in ascending order. */
export function imagePalettes({ palette, display }: Pick<ImagePayload, 'palette' | 'display'>): readonly AssetId[] {
  if (display === 'direct' || display.nearest === palette) return [palette];
  return [palette, display.nearest].sort(compareText);
}

/** The palette Asset IDs a payload references, deduplicated in ascending order; palettes, fonts and layouts reference none. */
export function referencedPalettes(payload: GraphicsPayload): readonly AssetId[] {
  return payload.kind === 'image' ? imagePalettes(payload) : [];
}

/** The image Asset IDs a layout's elements draw, in ascending order; the layout contract makes them distinct. */
export function layoutImages({ elements }: Pick<LayoutPayload, 'elements'>): readonly AssetId[] {
  return elements.map(({ image }) => image).sort(compareText);
}

/**
 * Checks that the descriptor's kind matches the payload and its dependencies are exactly what the payload references:
 * the element images of a layout, otherwise the referenced palettes.
 */
export function checkGraphicsBinding(descriptor: AssetDescriptor, payload: GraphicsPayload, path = 'asset'): void {
  if (descriptor.kind !== payload.kind) fail('binding-mismatch', `${path}.kind`, 'must match the payload kind');
  const [kind, expected] = payload.kind === 'layout' ? ['image', layoutImages(payload)] : ['palette', referencedPalettes(payload)];
  const { dependencies } = descriptor;
  if (dependencies.length !== expected.length
    || dependencies.some((dependency, index) => dependency.kind !== kind || dependency.id !== expected[index])) {
    fail('binding-mismatch', `${path}.dependencies`, `must be exactly the ${kind}s the payload references`);
  }
}
