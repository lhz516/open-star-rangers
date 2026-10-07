/**
 * Model textures shared by image Asset ID across the viewer's displays (P2-11 S-07): a texture is created on its first
 * use and disposed with its last, so switching between models that share one never uploads it twice. The owner
 * releases the shown item before the package is replaced, so an ID always names the same content while it is held.
 */
import type { DataTexture } from 'three';
import type { AssetId } from '../../content/asset-id.ts';
import type { ExpandedImage } from '../../content/graphics/expand-image.ts';
import { attemptAll } from '../scene/cleanup.ts';
import { modelTexture } from './viewer-presentation.ts';

export class ViewerTextures {
  readonly #entries = new Map<AssetId, { readonly texture: DataTexture; uses: number }>();

  /** Textures currently in use. */
  get size(): number {
    return this.#entries.size;
  }

  /** The texture of `id`, created from `picture` on its first use. */
  acquire(id: AssetId, picture: ExpandedImage): DataTexture {
    const entry = this.#entries.get(id);
    if (entry) {
      entry.uses++;
      return entry.texture;
    }
    const texture = modelTexture(picture);
    this.#entries.set(id, { texture, uses: 1 });
    return texture;
  }

  /** Ends one use of `id`, disposing the texture with its last; returns the failure, if any. */
  release(id: AssetId): unknown[] {
    const entry = this.#entries.get(id);
    if (!entry || --entry.uses > 0) return [];
    this.#entries.delete(id);
    return attemptAll([() => { entry.texture.dispose(); }]);
  }
}
