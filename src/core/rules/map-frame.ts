/**
 * The strategic map's conversions between cursor pixels and the world (docs/plan/p3/02/spec.md, MW-02, MW-07;
 * docs/original/formats/executable.md, cursor, destination and marker): the cursor world point (`0x4c4c0`) and the
 * zoom bounds (`0x2bc30`), which Core derives from the cursor pixel instead of storing them, as the original recomputes
 * them from the mouse block's point at every map read and map frame, and a world point's map pixel (`0x4c524`). Every
 * intermediate is a double (the x87 at double precision) and every stored value an f32.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { MapPixel, MapPoint, MapRuleData } from '../world/map-rule-data.ts';

/**
 * The cursor pixel of a normalised point in the main map of side `side` (MW-04): column = min(⌊right × s⌋, s − 1), row
 * likewise, so that a pixel's centre lands on that pixel and right = 1 or down = 1 on the last one.
 */
export function quantiseMapPoint(side: number, right: number, down: number): MapPixel {
  return Object.freeze({ column: Math.min(Math.floor(right * side), side - 1), row: Math.min(Math.floor(down * side), side - 1) });
}

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

/** A projected pixel and whether its point lies in the world rectangle, `0x4c524`'s two results. */
export interface ProjectedPixel {
  readonly pixel: MapPoint;
  readonly inWorld: boolean;
}

const INT32_INDEFINITE = -0x80000000;

/**
 * An x87 truncation stored by `FISTP` to a dword and kept as its low 16 bits, signed: a value beyond i32 (or NaN)
 * stores the integer indefinite 0x80000000, whose low 16 bits are 0.
 */
function int16OfTruncation(value: number): number {
  const truncated = Math.trunc(value);
  const int32 = truncated >= INT32_INDEFINITE && truncated <= 0x7fffffff ? truncated : INT32_INDEFINITE;
  return (int32 << 16) >> 16;
}

/**
 * `0x4c524`: the main map's pixel of a world point, trunc(D(D(x − minX) × F(ppX))) and likewise for y, and whether the
 * point is in the world rectangle, minX ≤ x ≤ maxX and minY ≤ y ≤ maxY (inclusive; an unordered compare is outside).
 * An object exactly on the world maximum projects one beyond the last cursor pixel.
 */
export function worldToMapPixel({ pixelsPerUnit, world }: MapRuleData, { x, y }: Vec3): ProjectedPixel {
  return {
    pixel: { column: int16OfTruncation((x - world.minX) * pixelsPerUnit.x), row: int16OfTruncation((y - world.minY) * pixelsPerUnit.y) },
    inWorld: world.minX <= x && x <= world.maxX && world.minY <= y && y <= world.maxY,
  };
}
