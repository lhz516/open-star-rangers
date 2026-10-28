/**
 * The cockpit frame: the elements of the selected slot's layout (docs/original/formats/cockpit.md, element and group
 * palette and drawing; P3-13 spec, 前视驾驶舱与仪表 and DC-02/DC-05). The presentation decides when an element is drawn
 * and copied (`0x49c98`: pass 0 before the records, pass 1 after them; every frame or only in a full redraw); this
 * module is its one element painter for every slot with a layout (front cockpit and map frame).
 *
 * An element writes its image at the layout position into B: a raw image every pixel, index 0 included (`0x59608`),
 * an RLE sprite only its opaque runs (`0x59338`), which is the image payload's mask; no colour key. It returns the
 * image's screen rectangle, which the presentation copies to S.
 */
import type { AssetId } from '../../../content/asset-id.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { LayoutPayload } from '../../../content/graphics/layout-payload.ts';
import type { CockpitInstruments } from '../../../content/hud/instruments-payload.ts';
import type { CockpitModule } from '../presentation/cockpit-contract.ts';
import { COCKPIT_LIMITS, PresentationError } from '../presentation/cockpit-limits.ts';
import { blit, type PixelRect } from '../raster/indexed-surface.ts';

export interface CockpitFrameInput {
  /** `data/hud/instruments`, the content the presentation runs. */
  readonly content: CockpitInstruments;
  /** Every layout a slot names, by Asset ID. */
  readonly layouts: ReadonlyMap<AssetId, LayoutPayload>;
  /** Every image those layouts draw, by Asset ID; each must display directly in the slot's palette. */
  readonly images: ReadonlyMap<AssetId, ImagePayload>;
}

interface Placement {
  readonly image: ImagePayload;
  readonly x: number;
  readonly y: number;
  readonly bounds: PixelRect;
}

const invalid = (path: string, reason: string): never => {
  throw new PresentationError('invalid-input', `cockpit.frame.${path}`, reason);
};

/** Checks every slot's layout and images before anything is drawn, and resolves each element's placement. */
function placements({ content, layouts, images }: CockpitFrameInput): ReadonlyMap<AssetId, readonly Placement[]> {
  const { width, height } = COCKPIT_LIMITS.surface;
  const resolved = new Map<AssetId, readonly Placement[]>();
  for (const { slot, layout: id, elements } of content.slots) {
    if (id === null) continue;
    const layout = layouts.get(id) ?? invalid(`slots[${slot}].layout`, `has no layout ${id}`);
    if (layout.elements.length !== elements.length) invalid(`slots[${slot}].elements`, `must match the ${layout.elements.length} elements of ${id}`);
    resolved.set(id, Object.freeze(layout.elements.map(({ image: imageId, x, y }, index) => {
      const path = `slots[${slot}].elements[${index}]`;
      if (elements[index].image !== imageId) invalid(path, `must draw ${imageId}, the layout's image`);
      const image = images.get(imageId) ?? invalid(path, `has no image ${imageId}`);
      if (image.display !== 'direct') invalid(path, 'must display its indices directly');
      if (x < 0 || y < 0 || x + image.width > width || y + image.height > height) invalid(path, `must lie inside the ${width} × ${height} screen`);
      return Object.freeze({ image, x, y, bounds: Object.freeze({ x0: x, y0: y, x1: x + image.width - 1, y1: y + image.height - 1 }) });
    })));
  }
  return resolved;
}

/** The element painter of one run. */
export function createCockpitFrame(input: CockpitFrameInput): CockpitModule {
  const resolved = placements(input);
  return {
    name: 'cockpit-frame',
    paintElement({ back, layout: { slot } }, _element, index) {
      const placement = slot?.layout ? resolved.get(slot.layout)?.[index] : undefined;
      if (placement === undefined) throw new PresentationError('invariant-violated', 'cockpit.frame', `has no element ${index} for the selected slot`);
      blit(back, placement.image, placement.x, placement.y, 'mask');
      return placement.bounds;
    },
  };
}
