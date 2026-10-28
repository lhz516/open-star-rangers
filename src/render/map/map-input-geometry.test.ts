import { describe, expect, it } from 'vitest';
import { syntheticInstrumentAssets } from '../../content/hud/instruments.test-support.ts';
import { quantiseMapPoint } from '../../core/rules/map-frame.ts';
import { mapPictureGeometry } from '../cockpit/map-picture/map-picture-geometry.ts';
import { computeViewportLayout, type ViewportFrame } from '../viewport/viewport-layout.ts';
import {
  checkMapInputGeometry, clampMapPosition, containerPointOf, insideMap, mapPositionAt, mapStartPosition, moveMapPosition,
  createZoneGeometryPort, MapInputGeometryError, sameLogicalGeometry, sameMapInputGeometry, zoneMapGeometry, type ClientBox,
  type MapInputGeometry, type MapInputGeometryErrorCode, type MapLogicalGeometry, type MapPosition,
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

// P3-13 subtask 23: the production geometry (P3-13 spec 地图输入几何与指针 “生产几何”, DC-09 “几何”): the logical part
// from `data/hud/map-geometry` and the frame measured from the input zone's border box, the origin absolute samples use.
describe('zoneMapGeometry', () => {
  /** The synthetic type-10 record [13, 37, 503, 337]: side 301, so the continuous right and bottom are 314 and 338. */
  const LOGICAL = mapPictureGeometry(syntheticInstrumentAssets().mapGeometry);
  const SIDE = 301;
  /** A zone whose border box is at client (50, 30) and whose picture is shown 800×600 between 100 px bars and a 3 px border. */
  const ZONE = { left: 50, top: 30, width: 1006, height: 606 };
  const SHOWN = { left: 153, top: 33, width: 800, height: 600 };

  /** What the map input does with an absolute sample: the client point less the zone's border-box corner. */
  const sampled = (geometry: MapInputGeometry, clientX: number, clientY: number): MapPosition =>
    mapPositionAt(geometry, { x: clientX - ZONE.left, y: clientY - ZONE.top });
  /** The client point of a logical screen point under the shown box. */
  const client = (x: number, y: number, shown = SHOWN) => [shown.left + (x * shown.width) / 640, shown.top + (y * shown.height) / 480] as const;

  it('takes the main map from the map geometry content: the inclusive record\'s right and bottom + 1', () => {
    expect(LOGICAL).toEqual({ screen: { width: 640, height: 480 }, mainMap: { left: 13, top: 37, right: 13 + SIDE, bottom: 37 + SIDE } });
    const geometry = zoneMapGeometry(LOGICAL, ZONE, SHOWN)!;
    expect(geometry).toEqual({ ...LOGICAL, frame: { left: 103, top: 3, width: 800, height: 600 } });
    expect(Object.isFrozen(geometry) && Object.isFrozen(geometry.frame)).toBe(true);
    expect(checkMapInputGeometry(geometry)).toBe(geometry);
  });

  it('maps every main-map pixel centre, black bars and border included, to that pixel through Core\'s quantisation', () => {
    const geometry = zoneMapGeometry(LOGICAL, ZONE, SHOWN)!;
    for (const pixel of [0, 1, 150, SIDE - 1]) {
      const { right, down } = sampled(geometry, ...client(13 + pixel + 0.5, 37 + pixel + 0.5));
      expect(quantiseMapPoint(SIDE, right, down)).toEqual({ column: pixel, row: pixel });
    }
    // The continuous edges: the left/top edge is 0, the right/bottom edge (last column + 1) is 1 and still on the map,
    // which the clamp keeps on the last pixel; beyond it, and on the bars, is off the map.
    expectPosition(sampled(geometry, ...client(13, 37)), { right: 0, down: 0 });
    const edge = sampled(geometry, ...client(13 + SIDE, 37 + SIDE));
    expectPosition(edge, { right: 1, down: 1 });
    expect(insideMap(edge)).toBe(true);
    expect(quantiseMapPoint(SIDE, edge.right, edge.down)).toEqual({ column: SIDE - 1, row: SIDE - 1 });
    expect(insideMap(sampled(geometry, ...client(13 + SIDE + 0.5, 100)))).toBe(false);
    expect(insideMap(sampled(geometry, ZONE.left + 50, client(0, 100)[1]))).toBe(false);
  });

  it('follows fullscreen, zoom and the pixel ratio through the measured CSS boxes alone', () => {
    // Fullscreen 1920×1080: the 4:3 picture is 1440 wide between 240 px bars; the layout's frame is in CSS px, so the
    // pixel ratio changes the buffer, not the frame.
    for (const devicePixelRatio of [1, 1.5, 2]) {
      const layout = computeViewportLayout({ width: 1920, height: 1080, devicePixelRatio, maxDrawingBufferSize: 16384 })!;
      const shown = { ...layout.frame };
      const geometry = zoneMapGeometry(LOGICAL, { left: 0, top: 0, width: 1920, height: 1080 }, shown)!;
      expect(geometry.frame).toEqual({ left: 240, top: 0, width: 1440, height: 1080 });
      const [x, y] = client(13 + 200.5, 37 + 100.5, shown);
      const { right, down } = mapPositionAt(geometry, { x, y });
      expect(quantiseMapPoint(SIDE, right, down)).toEqual({ column: 200, row: 100 });
    }
    // A zone whose picture moved within the page (scroll or zoom) keeps the same frame: only the offset counts.
    const moved = zoneMapGeometry(LOGICAL, { ...ZONE, left: ZONE.left - 70, top: ZONE.top + 9 }, { ...SHOWN, left: SHOWN.left - 70, top: SHOWN.top + 9 });
    expect(sameMapInputGeometry(moved, zoneMapGeometry(LOGICAL, ZONE, SHOWN))).toBe(true);
  });

  it('is not ready without a geometry, a zone or a shown picture, or while the picture is hidden, and leaves invalid values to the check', () => {
    expect(zoneMapGeometry(null, ZONE, SHOWN)).toBeNull();
    expect(zoneMapGeometry(LOGICAL, null, SHOWN)).toBeNull();
    expect(zoneMapGeometry(LOGICAL, ZONE, null)).toBeNull();
    // A hidden canvas measures an empty box at the viewport origin.
    expect(checkMapInputGeometry(zoneMapGeometry(LOGICAL, ZONE, { left: 0, top: 0, width: 0, height: 0 }))).toBeNull();
    expect(() => checkMapInputGeometry(zoneMapGeometry(LOGICAL, ZONE, { ...SHOWN, left: Number.NaN }))).toThrow(
      expect.objectContaining({ code: 'non-finite', path: 'frame.left' }),
    );
    expect(() => checkMapInputGeometry(zoneMapGeometry(LOGICAL, ZONE, { ...SHOWN, width: -1 }))).toThrow(
      expect.objectContaining({ code: 'inverted', path: 'frame.width' }),
    );
  });

  it('compares geometries by value, with or without their frames', () => {
    const geometry = zoneMapGeometry(LOGICAL, ZONE, SHOWN)!;
    const resized = zoneMapGeometry(LOGICAL, ZONE, { ...SHOWN, width: 640 })!;
    expect(sameMapInputGeometry(geometry, { ...geometry, frame: { ...geometry.frame } })).toBe(true);
    expect(sameMapInputGeometry(geometry, resized)).toBe(false);
    expect(sameMapInputGeometry(geometry, null)).toBe(false);
    expect(sameMapInputGeometry(null, null)).toBe(true);
    expect(sameLogicalGeometry(geometry, resized)).toBe(true);
    expect(sameLogicalGeometry(geometry, { ...LOGICAL, mainMap: { ...LOGICAL.mainMap, right: 313 } })).toBe(false);
  });
});

describe('createZoneGeometryPort', () => {
  const LOGICAL = mapPictureGeometry(syntheticInstrumentAssets().mapGeometry);

  /** An element stand-in with the two members the port reads, counting its measurements. */
  function element(box: ClientBox) {
    const state = { box, isConnected: true, reads: 0 };
    return {
      state,
      value: {
        get isConnected() { return state.isConnected; },
        getBoundingClientRect: () => {
          state.reads += 1;
          return state.box;
        },
      },
    };
  }

  it('measures the frame from the zone\'s border box to the shown picture at each read', () => {
    const zone = element({ left: 8, top: 60, width: 1024, height: 640 });
    const canvas = element({ left: 8 + 85, top: 60, width: 853, height: 640 });
    let logical: MapLogicalGeometry | null = LOGICAL;
    const port = createZoneGeometryPort({ logical: () => logical, zone: () => zone.value, shown: () => canvas.value });
    expect(port.read()).toEqual({ ...LOGICAL, frame: { left: 85, top: 0, width: 853, height: 640 } });
    // A resize applies at the next read, with nothing observed or scheduled.
    canvas.state.box = { left: 8, top: 60, width: 1024, height: 768 };
    expect(port.read()?.frame).toEqual({ left: 0, top: 0, width: 1024, height: 768 });
    // Without content nothing is measured.
    logical = null;
    const reads = zone.state.reads + canvas.state.reads;
    expect(port.read()).toBeNull();
    expect(zone.state.reads + canvas.state.reads).toBe(reads);
  });

  it('is not ready without a mounted zone or picture', () => {
    const zone = element({ left: 0, top: 0, width: 640, height: 480 });
    const canvas = element({ left: 0, top: 0, width: 640, height: 480 });
    expect(createZoneGeometryPort({ logical: () => LOGICAL, zone: () => null, shown: () => canvas.value }).read()).toBeNull();
    expect(createZoneGeometryPort({ logical: () => LOGICAL, zone: () => zone.value, shown: () => null }).read()).toBeNull();
    canvas.state.isConnected = false;
    expect(createZoneGeometryPort({ logical: () => LOGICAL, zone: () => zone.value, shown: () => canvas.value }).read()).toBeNull();
  });
});
