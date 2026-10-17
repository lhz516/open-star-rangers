/**
 * The strategic map's static rule data (docs/plan/p3/02/spec.md, MW-01): computed once at world creation from the
 * `mapGeometry` input (the `data/hud/map-geometry` Asset, read strictly with readMapGeometry; P3-03 修订 2) and the
 * mission's world, as the original's `0x49e74`, `0x3a41c` and `0x2b814` compute them
 * (docs/original/formats/executable.md, cursor, destination and marker). It is frozen and never part of a snapshot:
 * setupHash binds the input.
 *
 * Semantic checks, CoreInputError in this order (MW-01): the redraw interval lets every tick's frame end run the map
 * step; the cursor start lies in the main map; the scales are finite positive f32 values. The player craft's Warp
 * fields are the fourth check (craft-info-input.ts, checkPlayerWarp).
 */
import { MAP_GEOMETRY_FORMAT, type MapGeometry } from '../../content/hud/map-geometry-payload.ts';
import { CoreInputError } from '../errors.ts';
import { RUNTIME_SCALE, worldHalfExtent, type WorldFrame } from '../rules/coordinates.ts';
import { isFiniteFloat32 } from '../rules/float32.ts';

/** The bound of the main map's side, and so of a cursor pixel: the map geometry format's screen height. */
export const MAP_SIDE_LIMIT = MAP_GEOMETRY_FORMAT.height;

/** A cursor pixel: integers relative to the main map's origin, 0 ≤ column, row < side. */
export interface MapPixel {
  readonly column: number;
  readonly row: number;
}

/**
 * A projected pixel: integers relative to the main map's (or the zoom window's) origin in [−32768, 32767], the
 * original's i16. It can equal the side or lie outside the rectangle (an object on the world maximum, the player or a
 * wingman outside the world, a pixel moved by the de-overlap).
 */
export interface MapPoint {
  readonly column: number;
  readonly row: number;
}

/** A screen rectangle in pixels: x ≤ px < x + width, y likewise. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The world rectangle `0x3a41c` in i32 runtime units: ±7500 × sectors. */
export interface WorldRectangle {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface MapRuleData {
  /** s = y1 − y0 + 1. */
  readonly side: number;
  /** (x0, y0, s, s). */
  readonly main: PixelRect;
  /** (x0 + s, y0, x1 − (x0 + s), s >> 1). */
  readonly information: PixelRect;
  /** (x0 + s, y0 + (s >> 1), x1 − (x0 + s), s >> 1). */
  readonly zoom: PixelRect;
  /** (h − x0, h − y0) with h = (s − 1) >> 1: the cursor at creation and at every opening of the map. */
  readonly startPixel: MapPixel;
  readonly world: WorldRectangle;
  /** f32 ppX, ppY (`0x186464`, `0x186468`). */
  readonly pixelsPerUnit: { readonly x: number; readonly y: number };
  /** f32 wppX, wppY (`0x18646c`, `0x186470`): the reciprocals of the unrounded double. */
  readonly unitsPerPixel: { readonly x: number; readonly y: number };
  /** Integer runtime units (`0x18648c`, `0x186490`): the runtime scale truncated, and twice it. */
  readonly zoomExtent: { readonly x: number; readonly y: number };
  /** f32 (`0x186494`, `0x186498`): the zoom window's size ÷ zoomExtent. */
  readonly zoomPixelsPerUnit: { readonly x: number; readonly y: number };
  /** The imported glyph height of HUD font 1. */
  readonly informationLineHeight: number;
  /** i32: (s >> 1) ÷ informationLineHeight, signed division. */
  readonly informationCapacity: number;
}

const CONTENT = 'input.mapGeometry.content';

const isPositiveFloat32 = (value: number): boolean => isFiniteFloat32(value) && value > 0;

/**
 * The map's static rule data from the geometry as read, the mission's world and the run's step; see the module
 * comment. Throws CoreInputError for the first failed check; its reasons never repeat a value.
 */
export function buildMapRuleData(geometry: MapGeometry, frame: WorldFrame, clockUnitsPerTick: number): MapRuleData {
  const { rectangle: { x0, y0, x1, y1 }, redrawInterval, informationLineHeight } = geometry;
  if (redrawInterval !== 0 && redrawInterval >= clockUnitsPerTick) {
    throw new CoreInputError(`${CONTENT}.redrawInterval`, 'must be 0 or below the clock units per tick, so that every frame end runs the map step');
  }
  const side = y1 - y0 + 1;
  // The start point is half the inclusive extent measured from the screen origin, not from the rectangle's.
  const start = (side - 1) >> 1;
  if (start < x0 || start >= x0 + side || start < y0 || start >= y0 + side) {
    throw new CoreInputError(`${CONTENT}.rectangle`, 'must hold the map cursor\'s start point in the main map');
  }
  const half = side >> 1;
  const strip = x1 - (x0 + side);
  const halfExtent = worldHalfExtent(frame);
  // 0x3a3d8: the f32 world size, sectors × the grid scale; the map is square, so both axes are equal.
  const worldSize = Math.fround(RUNTIME_SCALE * frame.sectors);
  const ratio = side / worldSize;
  const pixelsPerUnit = Math.fround(ratio);
  const unitsPerPixel = Math.fround(1 / ratio);
  const zoomExtent = { x: Math.trunc(RUNTIME_SCALE), y: 2 * Math.trunc(RUNTIME_SCALE) };
  const zoomPixelsPerUnit = { x: Math.fround(strip / zoomExtent.x), y: Math.fround(half / zoomExtent.y) };
  if (![pixelsPerUnit, unitsPerPixel, zoomPixelsPerUnit.x, zoomPixelsPerUnit.y].every(isPositiveFloat32)) {
    throw new CoreInputError(`${CONTENT}.rectangle`, 'must give finite positive f32 map scales with the mission\'s world');
  }
  const rect = (x: number, y: number, width: number, height: number): PixelRect => Object.freeze({ x, y, width, height });
  return Object.freeze({
    side,
    main: rect(x0, y0, side, side),
    information: rect(x0 + side, y0, strip, half),
    zoom: rect(x0 + side, y0 + half, strip, half),
    startPixel: Object.freeze({ column: start - x0, row: start - y0 }),
    world: Object.freeze({ minX: -halfExtent, minY: -halfExtent, maxX: halfExtent, maxY: halfExtent }),
    pixelsPerUnit: Object.freeze({ x: pixelsPerUnit, y: pixelsPerUnit }),
    unitsPerPixel: Object.freeze({ x: unitsPerPixel, y: unitsPerPixel }),
    zoomExtent: Object.freeze(zoomExtent),
    zoomPixelsPerUnit: Object.freeze(zoomPixelsPerUnit),
    informationLineHeight,
    informationCapacity: Math.trunc(half / informationLineHeight),
  });
}
