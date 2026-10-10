import { describe, expect, it } from 'vitest';
import { computeViewportLayout, type ViewportFrame } from '../viewport/viewport-layout.ts';
import {
  checkMapInputGeometry, clampMapPosition, containerPointOf, insideMap, mapPositionAt, mapStartPosition, moveMapPosition,
  MapInputGeometryError, type MapInputGeometry, type MapInputGeometryErrorCode, type MapPosition,
} from './map-input-geometry.ts';

// Synthetic geometry only: a 640×480 logical screen with a 320×320 main map off its origin.
const SCREEN = { width: 640, height: 480 } as const;
const MAIN_MAP = { left: 20, top: 40, right: 340, bottom: 360 } as const;

function frameOf(width: number, height: number, devicePixelRatio = 1): ViewportFrame {
  const layout = computeViewportLayout({ width, height, devicePixelRatio, maxDrawingBufferSize: 16384 });
  if (!layout) throw new Error('fixture layout must be presentable');
  return layout.frame;
}

const geometryOf = (frame: ViewportFrame, mainMap: MapInputGeometry['mainMap'] = MAIN_MAP): MapInputGeometry => ({ screen: SCREEN, mainMap, frame });
/** 1000×600 container: an 800×600 frame between 100 px black bars, 1.25 CSS px per logical px. */
const WIDE = geometryOf(frameOf(1000, 600));

function expectPosition(actual: MapPosition, expected: MapPosition, digits = 9): void {
  expect(actual.right).toBeCloseTo(expected.right, digits);
  expect(actual.down).toBeCloseTo(expected.down, digits);
}

describe('checkMapInputGeometry', () => {
  it('returns a presentable geometry unchanged and treats null or a zero-size frame as not ready', () => {
    expect(checkMapInputGeometry(WIDE)).toBe(WIDE);
    expect(checkMapInputGeometry(null)).toBeNull();
    expect(checkMapInputGeometry(geometryOf({ ...WIDE.frame, width: 0 }))).toBeNull();
    expect(checkMapInputGeometry(geometryOf({ ...WIDE.frame, height: 0 }))).toBeNull();
    expect(checkMapInputGeometry(geometryOf(WIDE.frame, { left: 0, top: 0, right: 640, bottom: 480 }))).not.toBeNull();
  });

  const invalid = (path: string, value: number): MapInputGeometry => {
    const [group, field] = path.split('.') as ['screen' | 'mainMap' | 'frame', string];
    return { ...WIDE, [group]: { ...WIDE[group], [field]: value } };
  };

  const cases: readonly (readonly [string, number, MapInputGeometryErrorCode])[] = [
    ...['screen.width', 'screen.height', 'mainMap.left', 'mainMap.top', 'mainMap.right', 'mainMap.bottom',
      'frame.left', 'frame.top', 'frame.width', 'frame.height']
      .flatMap(path => [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(value => [path, value, 'non-finite'] as const)),
    ['screen.width', 0, 'non-positive'], ['screen.height', -480, 'non-positive'],
    ['mainMap.right', MAIN_MAP.left, 'non-positive'], ['mainMap.bottom', MAIN_MAP.top, 'non-positive'],
    ['mainMap.right', MAIN_MAP.left - 1, 'inverted'], ['mainMap.bottom', MAIN_MAP.top - 1, 'inverted'],
    ['frame.width', -1, 'inverted'], ['frame.height', -0.5, 'inverted'],
    ['mainMap.left', -1, 'outside-screen'], ['mainMap.top', -0.25, 'outside-screen'],
    ['mainMap.right', 640.5, 'outside-screen'], ['mainMap.bottom', 481, 'outside-screen'],
  ];

  it.each(cases)('reports %s = %d as a %s contract error, not as not ready', (path, value, code) => {
    let thrown: unknown;
    try {
      checkMapInputGeometry(invalid(path, value));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MapInputGeometryError);
    expect(thrown).toMatchObject({ name: 'MapInputGeometryError', code, path });
  });

  it('checks the screen and map before reporting a zero-size frame as not ready', () => {
    expect(() => checkMapInputGeometry({ ...invalid('frame.width', 0), screen: { width: Number.NaN, height: 480 } }))
      .toThrow(MapInputGeometryError);
  });
});

describe('container and map conversion', () => {
  it('maps the continuous map edges to 0 and 1, not the last whole pixel', () => {
    // Logical x 20 is CSS 100 + 20 × 1.25 = 125; logical 340 is 525; logical y 40 is 50 and 360 is 450.
    expectPosition(mapPositionAt(WIDE, { x: 125, y: 50 }), { right: 0, down: 0 });
    expectPosition(mapPositionAt(WIDE, { x: 525, y: 450 }), { right: 1, down: 1 });
    expectPosition(mapPositionAt(WIDE, { x: 325, y: 250 }), { right: 0.5, down: 0.5 });
    // The last logical pixel's top-left corner is not the right edge.
    expect(mapPositionAt(WIDE, { x: 100 + 339 * 1.25, y: 450 }).right).toBeCloseTo(319 / 320, 9);
    expect(containerPointOf(WIDE, { right: 1, down: 1 })).toEqual({ x: 525, y: 450 });
    expect(containerPointOf(WIDE, { right: 0, down: 0 })).toEqual({ x: 125, y: 50 });
  });

  it('subtracts the black bars, so bar points fall off the map', () => {
    const inLeftBar = mapPositionAt(WIDE, { x: 50, y: 250 });
    expect(inLeftBar.right).toBeLessThan(0);
    expect(insideMap(inLeftBar)).toBe(false);
    expect(insideMap(mapPositionAt(WIDE, { x: 950, y: 250 }))).toBe(false);
    // A narrow container letterboxes vertically: 600×1000 shows a 600×450 frame 275 px down.
    const tall = geometryOf(frameOf(600, 1000));
    expect(tall.frame).toEqual({ left: 0, top: 275, width: 600, height: 450 });
    const inTopBar = mapPositionAt(tall, { x: 100, y: 100 });
    expect(inTopBar.down).toBeLessThan(0);
    expect(insideMap(inTopBar)).toBe(false);
    expectPosition(mapPositionAt(tall, containerPointOf(tall, { right: 0.25, down: 0.75 })), { right: 0.25, down: 0.75 });
  });

  it('keeps a normalised position across resize and fullscreen while its container point scales', () => {
    const position = mapPositionAt(WIDE, { x: 400, y: 300 });
    for (const [width, height] of [[640, 480], [1920, 1080], [600, 1000], [333, 777]] as const) {
      const resized = geometryOf(frameOf(width, height));
      const point = containerPointOf(resized, position);
      expectPosition(mapPositionAt(resized, point), position);
      const scale = resized.frame.width / SCREEN.width;
      expect(point.x).toBeCloseTo(resized.frame.left + (MAIN_MAP.left + position.right * 320) * scale, 9);
    }
  });

  it('does not apply the device pixel ratio a second time', () => {
    const point = { x: 400, y: 300 };
    const base = mapPositionAt(WIDE, point);
    for (const ratio of [1.25, 1.5, 2, 3]) {
      const frame = frameOf(1000, 600, ratio);
      // The frame stays in CSS px; flooring the device buffer moves its edges by under one device pixel.
      expect(Math.abs(frame.width - WIDE.frame.width)).toBeLessThan(1);
      const position = mapPositionAt(geometryOf(frame), point);
      expect(Math.abs(position.right - base.right)).toBeLessThan(1 / 320);
      expect(Math.abs(position.down - base.down)).toBeLessThan(1 / 320);
    }
  });

  it('tells and clamps positions on the main map, edges included', () => {
    expect([0, 1, 0.5].every(value => insideMap({ right: value, down: value }))).toBe(true);
    expect(insideMap({ right: -Number.EPSILON, down: 0.5 })).toBe(false);
    expect(insideMap({ right: 0.5, down: 1 + Number.EPSILON })).toBe(false);
    expect(insideMap({ right: Number.NaN, down: 0.5 })).toBe(false);
    expect(clampMapPosition({ right: -3, down: 7 })).toEqual({ right: 0, down: 1 });
    expect(clampMapPosition({ right: 0.25, down: 0.75 })).toEqual({ right: 0.25, down: 0.75 });
    expect(Object.is(clampMapPosition({ right: -0, down: 0 }).right, 0)).toBe(true);
    expect(Object.isFrozen(clampMapPosition({ right: 0, down: 0 }))).toBe(true);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => clampMapPosition({ right: value, down: 0 })).toThrow(RangeError);
      expect(() => clampMapPosition({ right: 0, down: value })).toThrow(RangeError);
    }
  });

  it('moves by CSS px of the frame and clamps onto the map', () => {
    // 1.25 CSS px per logical px and a 320 px map: 1.25 CSS px are one logical px, 1/320 of the map.
    expectPosition(moveMapPosition(WIDE, { right: 0.5, down: 0.5 }, { x: 1.25, y: -2.5 }), { right: 0.5 + 1 / 320, down: 0.5 - 2 / 320 });
    expectPosition(moveMapPosition(WIDE, { right: 0, down: 0 }, { x: 400, y: 400 }), { right: 1, down: 1 });
    expect(moveMapPosition(WIDE, { right: 0.9, down: 0.1 }, { x: 1000, y: -1000 })).toEqual({ right: 1, down: 0 });
    // The same CSS movement on a frame twice as large is half the distance.
    const large = geometryOf(frameOf(2000, 1200));
    expectPosition(moveMapPosition(large, { right: 0.5, down: 0.5 }, { x: 1.25, y: 0 }), { right: 0.5 + 0.5 / 320, down: 0.5 });
  });
});

describe('mapStartPosition', () => {
  /** P3-09 quantises a position to the pixel holding it; the start must land on its own pixel. */
  const pixelOf = (position: MapPosition, map: MapInputGeometry['mainMap']): readonly [number, number] => [
    Math.floor(map.left + position.right * (map.right - map.left)), Math.floor(map.top + position.down * (map.bottom - map.top)),
  ];

  it.each([
    // Counted from the screen origin: column and row ⌊319/2⌋ = 159, inside the map, normalised at the pixel centre.
    [MAIN_MAP, 159, 159, (159.5 - 20) / 320, (159.5 - 40) / 320],
    [{ left: 0, top: 0, right: 320, bottom: 320 }, 159, 159, 159.5 / 320, 159.5 / 320],
    [{ left: 0, top: 0, right: 3, bottom: 4 }, 1, 1, 1.5 / 3, 1.5 / 4],
    // Clamped to the first column and row when the map starts beyond them.
    [{ left: 400, top: 300, right: 500, bottom: 400 }, 400, 300, 0.5 / 100, 0.5 / 100],
    [{ left: 10, top: 10, right: 11, bottom: 11 }, 10, 10, 0.5, 0.5],
    [{ left: 100, top: 0, right: 300, bottom: 480 }, 100, 239, 0.5 / 200, 239.5 / 480],
  ] as const)('starts %o at pixel (%d, %d)', (map, column, row, right, down) => {
    const start = mapStartPosition(map);
    expect(start.right).toBeCloseTo(right, 12);
    expect(start.down).toBeCloseTo(down, 12);
    expect(pixelOf(start, map)).toEqual([column, row]);
    expect(insideMap(start)).toBe(true);
    expect(Object.isFrozen(start)).toBe(true);
  });

  it('needs whole-pixel edges enclosing a pixel', () => {
    for (const map of [
      { left: 0.5, top: 0, right: 10, bottom: 10 }, { left: 0, top: 0, right: 10, bottom: 10.25 },
      { left: 0, top: 0, right: 0, bottom: 10 }, { left: 5, top: 0, right: 4, bottom: 10 },
      { left: Number.NaN, top: 0, right: 10, bottom: 10 }, { left: 0, top: 0, right: Number.POSITIVE_INFINITY, bottom: 10 },
    ]) expect(() => mapStartPosition(map)).toThrow(RangeError);
  });
});
