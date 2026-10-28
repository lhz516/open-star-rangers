/**
 * The strategic map's logical geometry for map input (P3-13 spec, 地图输入几何与指针 and D-01 定稿 DC-09; subtask
 * 06's geometry table): one source, `data/hud/map-geometry`, whose type-10 record rectangle is inclusive. The main map
 * is the square of side s = y1 − y0 + 1 from (x0, y0), half-open [x0, x0 + s) × [y0, y0 + s) in logical screen pixels,
 * so its continuous right and bottom edges are the last column and row + 1. The mouse clamp of the original is the
 * inclusive [x0, x0 + s − 1] (Core's `quantiseMapPoint`); the outlines, disc clip and pointer-box clamp reach x0 + s.
 *
 * Map input (subtask 23) adds the `frame`: where the logical screen is shown, with its origin at the border-box
 * top-left of the input zone (the Pointer Lock target), the same origin pointer sampling uses.
 */
import { MAP_GEOMETRY_FORMAT, type MapGeometry } from '../../../content/hud/map-geometry-payload.ts';

/** Continuous edges in logical screen pixels (`MapBounds` of map input). */
export interface MapPictureBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** `MapInputGeometry` (src/render/map/map-input-geometry.ts) without the frame, which the input zone's layout supplies. */
export interface MapPictureGeometry {
  readonly screen: { readonly width: number; readonly height: number };
  readonly mainMap: MapPictureBounds;
}

/** The logical screen of the map picture (640 × 480). */
export const MAP_PICTURE_SCREEN = Object.freeze({ width: MAP_GEOMETRY_FORMAT.width, height: MAP_GEOMETRY_FORMAT.height });

/** The main map's continuous bounds from its origin and side. */
export const mainMapBounds = (x: number, y: number, side: number): MapPictureBounds => Object.freeze({ left: x, top: y, right: x + side, bottom: y + side });

/** The logical geometry of `data/hud/map-geometry` as read (readMapGeometry). */
export function mapPictureGeometry({ rectangle: { x0, y0, y1 } }: MapGeometry): MapPictureGeometry {
  return Object.freeze({ screen: MAP_PICTURE_SCREEN, mainMap: mainMapBounds(x0, y0, y1 - y0 + 1) });
}
