/**
 * The strategic map's conversions between cursor pixels and the world (docs/plan/p3/02/spec.md, MW-02, MW-07;
 * docs/original/formats/executable.md, cursor, destination and marker): the cursor world point (`0x4c4c0`) and the
 * zoom bounds (`0x2bc30`), which Core derives from the cursor pixel instead of storing them, as the original recomputes
 * them from the mouse block's point at every map read and map frame. Every intermediate is a double (the x87 at double
 * precision) and every stored value an f32.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { MapPixel, MapRuleData } from '../world/map-rule-data.ts';

/** The zoom window's world bounds (`0x2bc30`), f32: left ≤ x ≤ right, top ≤ y ≤ bottom. */
export interface ZoomBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * `0x4c4c0`: the world point of a cursor pixel, x = F(D(column × wppX) + minX), y likewise, z = +0.0. Pixel 0 maps to
 * the world minimum and the last pixel to below the maximum by about one pixel's width.
 */
export function mapPixelToWorld({ unitsPerPixel, world }: MapRuleData, { column, row }: MapPixel): Vec3 {
  return { x: Math.fround(column * unitsPerPixel.x + world.minX), y: Math.fround(row * unitsPerPixel.y + world.minY), z: 0 };
}

/**
 * `0x2bc30`: the zoom window around a world point, half its extent to each side, each side clamped to the world on its
 * own, so that near an edge the window shrinks rather than shifts.
 */
export function zoomBounds({ zoomExtent, world }: MapRuleData, { x, y }: Vec3): ZoomBounds {
  const halfX = Math.fround(zoomExtent.x * 0.5);
  const halfY = Math.fround(zoomExtent.y * 0.5);
  return {
    left: Math.max(Math.fround(world.minX), Math.fround(x - halfX)),
    right: Math.min(Math.fround(world.maxX), Math.fround(x + halfX)),
    top: Math.max(Math.fround(world.minY), Math.fround(y - halfY)),
    bottom: Math.min(Math.fround(world.maxY), Math.fround(y + halfY)),
  };
}
