/**
 * Geometry shared by strategic-map input and the project's map cursor (docs/plan/p3/05/spec.md 战略地图输入 and
 * 数据模型与契约 MapInputGeometry; technical decision 9). The map's presentation owner supplies it; drawing and input
 * read the same value. Main-map positions are continuous: the left/top edges are 0 and the right/bottom edges are 1,
 * never the index of the last whole pixel. Pure arithmetic over CSS pixels with no device pixel ratio, so it runs
 * unchanged in Node and a ratio change cannot scale a position twice.
 */
import type { ViewportFrame } from '../viewport/viewport-layout.ts';

/** Continuous edges in logical screen pixels. */
export interface MapBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MapInputGeometry {
  /** The logical screen, logical px. */
  readonly screen: { readonly width: number; readonly height: number };
  /** The main map inside the logical screen. */
  readonly mainMap: MapBounds;
  /** Where the logical screen is shown: CSS px inside the container whose content box the layout measured. */
  readonly frame: ViewportFrame;
}

/** The presentation owner's read-only port; null while the map cannot be presented ("地图输入未就绪"). */
export interface MapInputGeometryPort {
  read(): MapInputGeometry | null;
}

/** A normalised main-map position, as `map-point` carries it. */
export interface MapPosition {
  readonly right: number;
  readonly down: number;
}

/** CSS px from the top-left corner of the container's content box; also a movement in CSS px. */
export interface ContainerPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * - `non-finite`: a field is not a finite number.
 * - `non-positive`: the screen has a zero or negative side, or the main map a zero one.
 * - `inverted`: the main map's right edge lies left of its left edge or its bottom above its top, or the frame has a
 *   negative side.
 * - `outside-screen`: the main map extends beyond the logical screen.
 */
export type MapInputGeometryErrorCode = 'non-finite' | 'non-positive' | 'inverted' | 'outside-screen';

/** An input presentation contract error: the owner supplied an invalid geometry, which is not "not ready". */
export class MapInputGeometryError extends Error {
  readonly code: MapInputGeometryErrorCode;
  /** The offending field, e.g. `mainMap.right`. */
  readonly path: string;

  constructor(code: MapInputGeometryErrorCode, path: string, reason: string) {
    super(`Map input geometry ${path} ${reason}`);
    this.name = 'MapInputGeometryError';
    this.code = code;
    this.path = path;
  }
}

function checkEdges(low: number, high: number, extent: number, lowPath: string, highPath: string): void {
  if (high < low) throw new MapInputGeometryError('inverted', highPath, `must not be less than ${lowPath}`);
  if (high === low) throw new MapInputGeometryError('non-positive', highPath, `must exceed ${lowPath}`);
  if (low < 0) throw new MapInputGeometryError('outside-screen', lowPath, 'must not be negative');
  if (high > extent) throw new MapInputGeometryError('outside-screen', highPath, 'must not exceed the screen');
}

/**
 * Returns the geometry when it can be presented, or null when it is not ready: no geometry, or a frame with a zero
 * side, which disables map input. Throws MapInputGeometryError for a contract violation.
 */
export function checkMapInputGeometry(geometry: MapInputGeometry | null): MapInputGeometry | null {
  if (geometry === null) return null;
  const { screen, mainMap, frame } = geometry;
  for (const [path, value] of [
    ['screen.width', screen.width], ['screen.height', screen.height],
    ['mainMap.left', mainMap.left], ['mainMap.top', mainMap.top], ['mainMap.right', mainMap.right], ['mainMap.bottom', mainMap.bottom],
    ['frame.left', frame.left], ['frame.top', frame.top], ['frame.width', frame.width], ['frame.height', frame.height],
  ] as const) {
    if (!Number.isFinite(value)) throw new MapInputGeometryError('non-finite', path, 'must be a finite number');
  }
  for (const side of ['width', 'height'] as const) {
    if (screen[side] <= 0) throw new MapInputGeometryError('non-positive', `screen.${side}`, 'must be positive');
    if (frame[side] < 0) throw new MapInputGeometryError('inverted', `frame.${side}`, 'must not be negative');
  }
  checkEdges(mainMap.left, mainMap.right, screen.width, 'mainMap.left', 'mainMap.right');
  checkEdges(mainMap.top, mainMap.bottom, screen.height, 'mainMap.top', 'mainMap.bottom');
  return frame.width === 0 || frame.height === 0 ? null : geometry;
}

const position = (right: number, down: number): MapPosition => Object.freeze({ right, down });

/**
 * The position under a container point, unclamped: points off the main map, black bars included, fall outside
 * [0, 1]. Expects a geometry that checkMapInputGeometry returned.
 */
export function mapPositionAt({ screen, mainMap, frame }: MapInputGeometry, point: ContainerPoint): MapPosition {
  const x = ((point.x - frame.left) * screen.width) / frame.width;
  const y = ((point.y - frame.top) * screen.height) / frame.height;
  return position((x - mainMap.left) / (mainMap.right - mainMap.left), (y - mainMap.top) / (mainMap.bottom - mainMap.top));
}

/** The container point of a position; the inverse of mapPositionAt. */
export function containerPointOf({ screen, mainMap, frame }: MapInputGeometry, { right, down }: MapPosition): ContainerPoint {
  const x = mainMap.left + right * (mainMap.right - mainMap.left);
  const y = mainMap.top + down * (mainMap.bottom - mainMap.top);
  return Object.freeze({ x: frame.left + (x * frame.width) / screen.width, y: frame.top + (y * frame.height) / screen.height });
}

/** Whether a position lies on the main map, edges included; false for NaN. */
export function insideMap({ right, down }: MapPosition): boolean {
  return right >= 0 && right <= 1 && down >= 0 && down <= 1;
}

/** Clamps a position onto the main map. Throws RangeError for a non-finite coordinate. */
export function clampMapPosition({ right, down }: MapPosition): MapPosition {
  if (!Number.isFinite(right) || !Number.isFinite(down)) throw new RangeError('A map position must be finite');
  return position(Math.min(1, Math.max(0, right)), Math.min(1, Math.max(0, down)));
}

/** Moves a position by a movement in CSS px, which callers convert a host-reported unit to first, and clamps it. */
export function moveMapPosition({ screen, mainMap, frame }: MapInputGeometry, from: MapPosition, movement: ContainerPoint): MapPosition {
  return clampMapPosition(position(
    from.right + (movement.x * screen.width) / (frame.width * (mainMap.right - mainMap.left)),
    from.down + (movement.y * screen.height) / (frame.height * (mainMap.bottom - mainMap.top)),
  ));
}

/**
 * The original's start position (spec 战略地图输入 初始位置, finalised by checkpoint K) for a main map whose edges are
 * whole logical pixels: column ⌊(W−1)/2⌋ and row ⌊(H−1)/2⌋ counted from the screen origin, not the map's, clamped to
 * the map's pixels and normalised at the pixel centre. Throws RangeError for fractional edges or an empty map.
 */
export function mapStartPosition({ left, top, right, bottom }: MapBounds): MapPosition {
  if (![left, top, right, bottom].every(Number.isSafeInteger) || right <= left || bottom <= top) {
    throw new RangeError('The map start position needs whole-pixel main map edges enclosing at least one pixel');
  }
  const width = right - left;
  const height = bottom - top;
  const column = Math.min(right - 1, Math.max(left, Math.floor((width - 1) / 2)));
  const row = Math.min(bottom - 1, Math.max(top, Math.floor((height - 1) / 2)));
  return position((column + 0.5 - left) / width, (row + 0.5 - top) / height);
}
