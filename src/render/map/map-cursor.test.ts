import { describe, expect, it } from 'vitest';
import { MAX_PIXEL_RATIO, type ViewportFrame } from '../viewport/viewport-layout.ts';
import { MapInputGeometryError, type MapInputGeometry, type MapPosition } from './map-input-geometry.ts';
import {
  createMapCursorDrawer, MAP_CURSOR_STYLE, mapBufferArea, mapCursorShape, type BufferSize, type MapCursorCanvas, type PixelRect,
} from './map-cursor.ts';

// Synthetic geometry only: a 64×48 logical screen with a 32×32 main map off its origin, shown 1:1 at 10 px from the
// container's left edge.
const SCREEN = { width: 64, height: 48 } as const;
const MAIN_MAP = { left: 8, top: 8, right: 40, bottom: 40 } as const;
const FRAME: ViewportFrame = { left: 10, top: 0, width: 64, height: 48 };
const GEOMETRY: MapInputGeometry = { screen: SCREEN, mainMap: MAIN_MAP, frame: FRAME };
const ONE_TO_ONE: BufferSize = { width: 64, height: 48 };
const AREA: PixelRect = { x: 8, y: 8, width: 32, height: 32 };
const { arm: ARM } = MAP_CURSOR_STYLE;

/** A drawing buffer that keeps every pixel, so tests read what a browser canvas would show. */
class FakeCanvas implements MapCursorCanvas {
  pixelRatio = 1;
  shown: ViewportFrame | null = null;
  width = 0;
  height = 0;
  pixels = new Uint8Array(0);
  removed = 0;
  readonly calls: string[] = [];
  readonly colours = new Set<string>();
  /** How many more clears and fills succeed before one throws; null never throws. */
  failAfter: number | null = null;

  show(frame: ViewportFrame): void { this.calls.push('show'); this.shown = frame; }
  hide(): void { this.calls.push('hide'); this.shown = null; }
  resize(width: number, height: number): void {
    this.calls.push(`resize ${width}×${height}`);
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
  }
  clear(area: PixelRect): void { this.#paint('clear'); this.#set(area, 0); }
  fill(area: PixelRect, colour: string): void { this.#paint('fill'); this.colours.add(colour); this.#set(area, 1); }
  readDevicePixelRatio(): number { return this.pixelRatio; }
  remove(): void { this.removed += 1; }

  #paint(operation: 'clear' | 'fill'): void {
    if (this.failAfter === 0) {
      this.failAfter = null;
      throw new Error(`${operation} failed`);
    }
    if (this.failAfter !== null) this.failAfter -= 1;
    this.calls.push(operation);
  }

  #set({ x, y, width, height }: PixelRect, value: number): void {
    for (let row = Math.max(0, y); row < Math.min(this.height, y + height); row += 1) {
      for (let column = Math.max(0, x); column < Math.min(this.width, x + width); column += 1) this.pixels[row * this.width + column] = value;
    }
  }

  /** Filled pixels as `x,y` strings. */
  filled(): Set<string> {
    const found = new Set<string>();
    this.pixels.forEach((value, index) => { if (value) found.add(`${index % this.width},${Math.floor(index / this.width)}`); });
    return found;
  }

  takeCalls(): string[] { return this.calls.splice(0); }
}

function pixelsOf(fills: readonly PixelRect[]): Set<string> {
  const found = new Set<string>();
  for (const { x, y, width, height } of fills) {
    for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) found.add(`${column},${row}`);
  }
  return found;
}

const within = (inner: PixelRect, outer: PixelRect): boolean => inner.width > 0 && inner.height > 0
  && inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

function setup(initial: MapInputGeometry | null = GEOMETRY, position: MapPosition | null = { right: 0.5, down: 0.5 }) {
  const canvas = new FakeCanvas();
  const state = { geometry: initial, position };
  const drawer = createMapCursorDrawer(canvas, { read: () => state.geometry }, { read: () => state.position });
  return { canvas, state, drawer };
}

describe('mapBufferArea', () => {
  it('rounds the main map to whole buffer pixels', () => {
    expect(mapBufferArea(GEOMETRY, ONE_TO_ONE)).toEqual(AREA);
    expect(mapBufferArea(GEOMETRY, { width: 128, height: 96 })).toEqual({ x: 16, y: 16, width: 64, height: 64 });
    expect(mapBufferArea(GEOMETRY, { width: 96, height: 72 })).toEqual({ x: 12, y: 12, width: 48, height: 48 });
  });

  it('is null when the main map covers no whole buffer pixel', () => {
    expect(mapBufferArea({ ...GEOMETRY, mainMap: { left: 8, top: 8, right: 8.25, bottom: 40 } }, ONE_TO_ONE)).toBeNull();
    // A one-pixel map at a quarter scale rounds to an empty column.
    expect(mapBufferArea({ ...GEOMETRY, mainMap: { left: 8, top: 8, right: 9, bottom: 9 } }, { width: 16, height: 12 })).toBeNull();
    expect(mapBufferArea(GEOMETRY, { width: 0, height: 0 })).toBeNull();
  });
});

describe('mapCursorShape', () => {
  it('centres a crosshair of the project style on the position', () => {
    const shape = mapCursorShape(GEOMETRY, { right: 0.5, down: 0.5 }, ONE_TO_ONE);
    // Logical (24, 24) at one buffer pixel per logical pixel.
    expect(shape).toEqual({
      bounds: { x: 24 - ARM, y: 24 - ARM, width: 2 * ARM + 1, height: 2 * ARM + 1 },
      fills: [{ x: 24 - ARM, y: 24, width: 2 * ARM + 1, height: 1 }, { x: 24, y: 24 - ARM, width: 1, height: 2 * ARM + 1 }],
    });
    expect(Object.isFrozen(shape) && Object.isFrozen(shape?.fills)).toBe(true);
  });

  it('scales with the buffer, so the device pixel ratio enters once through the buffer size', () => {
    // Bars keep an odd width centred on the position's pixel.
    const shape = mapCursorShape(GEOMETRY, { right: 0.5, down: 0.5 }, { width: 128, height: 96 });
    expect(shape?.fills).toEqual([
      { x: 48 - 2 * ARM, y: 47, width: 4 * ARM + 1, height: 3 }, { x: 47, y: 48 - 2 * ARM, width: 3, height: 4 * ARM + 1 },
    ]);
    expect(mapCursorShape(GEOMETRY, { right: 0.5, down: 0.5 }, { width: 96, height: 72 })?.fills[0])
      .toEqual({ x: 36 - 1.5 * ARM, y: 36, width: 3 * ARM + 1, height: 1 });
  });

  it.each([1, 1.5, 2, 3, 4])('cuts the crosshair alike at all four corners at scale %d', (scale) => {
    const buffer = { width: 64 * scale, height: 48 * scale };
    const visible = [{ right: 0, down: 0 }, { right: 1, down: 0 }, { right: 0, down: 1 }, { right: 1, down: 1 }].map((position) => {
      const shape = mapCursorShape(GEOMETRY, position, buffer);
      if (!shape) throw new Error('expected a shape');
      const [horizontal, vertical] = shape.fills;
      return [horizontal.width, horizontal.height, vertical.width, vertical.height];
    });
    expect(new Set(visible.map(sizes => sizes.join('×'))).size).toBe(1);
  });

  it('puts the right and bottom edges on the last map pixel', () => {
    const shape = mapCursorShape(GEOMETRY, { right: 1, down: 1 }, ONE_TO_ONE);
    expect(shape?.fills).toEqual([{ x: 39 - ARM, y: 39, width: ARM + 1, height: 1 }, { x: 39, y: 39 - ARM, width: 1, height: ARM + 1 }]);
  });

  const placements: readonly (readonly [string, MapPosition, number, number])[] = [
    ['top-left corner', { right: 0, down: 0 }, 8, 8], ['top-right corner', { right: 1, down: 0 }, 39, 8],
    ['bottom-left corner', { right: 0, down: 1 }, 8, 39], ['bottom-right corner', { right: 1, down: 1 }, 39, 39],
    ['left edge', { right: 0, down: 0.5 }, 8, 24], ['right edge', { right: 1, down: 0.5 }, 39, 24],
    ['top edge', { right: 0.5, down: 0 }, 24, 8], ['bottom edge', { right: 0.5, down: 1 }, 24, 39],
    ['beyond the top-left', { right: -2, down: -0.5 }, 8, 8], ['beyond the bottom-right', { right: 1.5, down: 9 }, 39, 39],
  ];

  it.each(placements)('clamps at the %s and draws nothing off the main map', (_, position, x, y) => {
    const shape = mapCursorShape(GEOMETRY, position, ONE_TO_ONE);
    if (!shape) throw new Error('expected a shape');
    const pixels = pixelsOf(shape.fills);
    expect(pixels.has(`${x},${y}`)).toBe(true);
    expect(shape.fills.every(fill => within(fill, AREA))).toBe(true);
    expect(within(shape.bounds, AREA)).toBe(true);
    // Only what lies off the map is cut; the arms on it keep their full length.
    expect(shape.fills[0].width).toBe(Math.min(x + ARM, 39) - Math.max(x - ARM, 8) + 1);
    expect(shape.fills[1].height).toBe(Math.min(y + ARM, 39) - Math.max(y - ARM, 8) + 1);
  });

  it('rejects a non-finite position and has no shape when the map covers no pixel', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => mapCursorShape(GEOMETRY, { right: value, down: 0 }, ONE_TO_ONE)).toThrow(RangeError);
      expect(() => mapCursorShape(GEOMETRY, { right: 0, down: value }, ONE_TO_ONE)).toThrow(RangeError);
    }
    expect(mapCursorShape(GEOMETRY, { right: 0.5, down: 0.5 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('createMapCursorDrawer', () => {
  it('is not ready before its first draw, nor while there is no geometry, and then leaves the canvas hidden', () => {
    const { canvas, state, drawer } = setup(null);
    expect(drawer.ready).toBe(false);
    expect(drawer.draw()).toBe(false);
    expect(drawer.ready).toBe(false);
    expect(canvas.takeCalls()).toEqual([]);
    state.geometry = { ...GEOMETRY, frame: { ...FRAME, width: 0 } };
    expect(drawer.draw()).toBe(false);
    expect(canvas.takeCalls()).toEqual([]);
  });

  it('shows the canvas over the frame and draws the cursor in the project colour', () => {
    const { canvas, drawer } = setup();
    expect(drawer.draw()).toBe(true);
    expect(drawer.ready).toBe(true);
    expect(canvas.shown).toEqual(FRAME);
    expect([canvas.width, canvas.height]).toEqual([64, 48]);
    expect(canvas.filled()).toEqual(pixelsOf(mapCursorShape(GEOMETRY, { right: 0.5, down: 0.5 }, ONE_TO_ONE)?.fills ?? []));
    expect([...canvas.colours]).toEqual([MAP_CURSOR_STYLE.colour]);
  });

  it('clears the old position after a move and repaints nothing for an unchanged frame', () => {
    const { canvas, state, drawer } = setup();
    drawer.draw();
    canvas.takeCalls();
    expect(drawer.draw()).toBe(true);
    expect(canvas.takeCalls()).toEqual([]);
    for (const position of [{ right: 0.1, down: 0.9 }, { right: 1, down: 0 }, { right: 0.11, down: 0.9 }]) {
      state.position = position;
      expect(drawer.draw()).toBe(true);
      expect(canvas.takeCalls()).toEqual(['clear', 'fill', 'fill']);
      expect(canvas.filled()).toEqual(pixelsOf(mapCursorShape(GEOMETRY, position, ONE_TO_ONE)?.fills ?? []));
    }
    // A move within one buffer pixel paints nothing.
    state.position = { right: 0.11 + 0.001, down: 0.9 };
    drawer.draw();
    expect(canvas.takeCalls()).toEqual([]);
  });

  it('hides the cursor for a null position and stays ready', () => {
    const { canvas, state, drawer } = setup();
    drawer.draw();
    state.position = null;
    expect(drawer.draw()).toBe(true);
    expect(canvas.filled().size).toBe(0);
    expect(canvas.shown).toEqual(FRAME);
    canvas.takeCalls();
    state.position = { right: 0.25, down: 0.25 };
    drawer.draw();
    expect(canvas.takeCalls()).toEqual(['fill', 'fill']);
  });

  it('follows a resize at the same normalised position', () => {
    const { canvas, state, drawer } = setup();
    state.position = { right: 0.75, down: 0.25 };
    drawer.draw();
    canvas.takeCalls();
    const frame = { left: 0, top: 30, width: 128, height: 96 };
    state.geometry = { ...GEOMETRY, frame };
    expect(drawer.draw()).toBe(true);
    expect(canvas.takeCalls()).toEqual(['show', 'resize 128×96', 'fill', 'fill']);
    expect(canvas.shown).toEqual(frame);
    const shape = mapCursorShape(state.geometry, state.position, { width: 128, height: 96 });
    expect(canvas.filled()).toEqual(pixelsOf(shape?.fills ?? []));
    expect(canvas.filled().has(`${16 + 48},${16 + 16}`)).toBe(true);
  });

  it('only moves the canvas when the frame moves at the same size', () => {
    const { canvas, state, drawer } = setup();
    drawer.draw();
    const before = canvas.filled();
    canvas.takeCalls();
    state.geometry = { ...GEOMETRY, frame: { ...FRAME, left: 200, top: 7 } };
    drawer.draw();
    expect(canvas.takeCalls()).toEqual(['show']);
    expect(canvas.filled()).toEqual(before);
  });

  it('sizes the buffer by the capped device pixel ratio without moving the cursor on the map', () => {
    const { canvas, state, drawer } = setup();
    state.position = { right: 0.25, down: 0.75 };
    for (const [ratio, scale] of [[2, 2], [1.5, 1.5], [3, MAX_PIXEL_RATIO], [0, 1], [Number.NaN, 1], [-2, 1]] as const) {
      canvas.pixelRatio = ratio;
      drawer.draw();
      expect([canvas.width, canvas.height]).toEqual([64 * scale, 48 * scale]);
      // The position's logical pixel (16, 32), scaled once.
      expect(canvas.filled().has(`${16 * scale},${32 * scale}`)).toBe(true);
      expect(canvas.shown).toEqual(FRAME);
    }
  });

  it('hides when the geometry goes away and shows again when it returns', () => {
    const { canvas, state, drawer } = setup();
    drawer.draw();
    state.geometry = null;
    expect(drawer.draw()).toBe(false);
    expect(drawer.ready).toBe(false);
    expect(canvas.shown).toBeNull();
    expect(canvas.takeCalls().at(-1)).toBe('hide');
    expect(drawer.draw()).toBe(false);
    expect(canvas.takeCalls()).toEqual([]);
    state.geometry = GEOMETRY;
    expect(drawer.draw()).toBe(true);
    expect(canvas.shown).toEqual(FRAME);
    expect(canvas.filled()).toEqual(pixelsOf(mapCursorShape(GEOMETRY, { right: 0.5, down: 0.5 }, ONE_TO_ONE)?.fills ?? []));
  });

  it('is not ready and hidden when the frame has a zero side or the map covers no buffer pixel', () => {
    for (const geometry of [{ ...GEOMETRY, frame: { ...FRAME, height: 0 } }, { ...GEOMETRY, frame: { ...FRAME, width: 0.4, height: 0.3 } }]) {
      const { canvas, state, drawer } = setup();
      drawer.draw();
      state.geometry = geometry;
      expect(drawer.draw()).toBe(false);
      expect(drawer.ready).toBe(false);
      expect(canvas.shown).toBeNull();
    }
  });

  it('hides and reports not ready, then rethrows, for an invalid geometry or position', () => {
    const invalid: readonly (readonly [Partial<{ geometry: MapInputGeometry; position: MapPosition }>, new (...args: never[]) => Error])[] = [
      [{ geometry: { ...GEOMETRY, mainMap: { ...MAIN_MAP, right: 4 } } }, MapInputGeometryError],
      [{ geometry: { ...GEOMETRY, screen: { width: Number.NaN, height: 48 } } }, MapInputGeometryError],
      [{ position: { right: Number.NaN, down: 0.5 } }, RangeError],
    ];
    for (const [change, error] of invalid) {
      const { canvas, state, drawer } = setup();
      drawer.draw();
      const before = canvas.filled();
      canvas.takeCalls();
      Object.assign(state, change);
      expect(() => drawer.draw()).toThrow(error);
      expect(drawer.ready).toBe(false);
      expect(canvas.takeCalls()).toEqual(['hide']);
      expect(canvas.filled()).toEqual(before);
      Object.assign(state, { geometry: GEOMETRY, position: { right: 0.5, down: 0.5 } });
      expect(drawer.draw()).toBe(true);
    }
  });

  it.each([
    ['clear', 0], ['first fill', 1], ['second fill', 2],
  ] as const)('repaints the whole buffer after a failed %s, even at an unchanged position', (operation, failAfter) => {
    const { canvas, state, drawer } = setup();
    drawer.draw();
    state.position = { right: 0.2, down: 0.8 };
    canvas.failAfter = failAfter;
    expect(() => drawer.draw()).toThrow(`${operation.split(' ').at(-1)} failed`);
    expect(drawer.ready).toBe(false);
    expect(canvas.shown).toBeNull();
    canvas.takeCalls();
    expect(drawer.draw()).toBe(true);
    expect(canvas.takeCalls()).toEqual(['show', 'resize 64×48', 'fill', 'fill']);
    expect(canvas.filled()).toEqual(pixelsOf(mapCursorShape(GEOMETRY, state.position, ONE_TO_ONE)?.fills ?? []));
  });

  it('removes the canvas once on dispose and draws nothing afterwards', () => {
    const { canvas, drawer } = setup();
    drawer.draw();
    canvas.takeCalls();
    drawer.dispose();
    drawer.dispose();
    expect(canvas.removed).toBe(1);
    expect(drawer.ready).toBe(false);
    expect(drawer.draw()).toBe(false);
    expect(canvas.takeCalls()).toEqual([]);
  });
});
