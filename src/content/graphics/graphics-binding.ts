import type { AssetDescriptor } from '../asset-contract.ts';
import type { AssetId } from '../asset-id.ts';
import { compareText, fail } from '../contract-validation.ts';
import type { FontPayload } from './font-payload.ts';
import type { ImagePayload } from './image-payload.ts';
import type { PalettePayload } from './palette-payload.ts';

export type GraphicsPayload = PalettePayload | ImagePayload | FontPayload;

/** The palette Asset IDs a payload references, deduplicated in ascending order; palettes and fonts reference none. */
export function referencedPalettes(payload: GraphicsPayload): readonly AssetId[] {
  if (payload.kind !== 'image') return [];
  const { palette, display } = payload;
  if (display === 'direct' || display.nearest === palette) return [palette];
  return [palette, display.nearest].sort(compareText);
}

/** Checks that the descriptor's kind matches the payload and its dependencies are exactly the palettes it references. */
export function checkGraphicsBinding(descriptor: AssetDescriptor, payload: GraphicsPayload, path = 'asset'): void {
  if (descriptor.kind !== payload.kind) fail('binding-mismatch', `${path}.kind`, 'must match the payload kind');
  const expected = referencedPalettes(payload);
  const { dependencies } = descriptor;
  if (dependencies.length !== expected.length
    || dependencies.some((dependency, index) => dependency.kind !== 'palette' || dependency.id !== expected[index])) {
    fail('binding-mismatch', `${path}.dependencies`, 'must be exactly the palettes the payload references');
  }
}
