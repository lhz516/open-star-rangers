import { describe, expect, it } from 'vitest';
import { computeViewportLayout, MAX_PIXEL_RATIO, sameViewportLayout, type ViewportLayout } from './viewport-layout.ts';

const CONTAINERS: readonly (readonly [number, number])[] = [
  [1280, 720], [720, 1280], [640, 480], [800, 600], [641, 480], [300, 200], [1, 1], [0, 600], [600, 0], [0.4, 0.4],
  [Number.NaN, 480], [640, Number.NaN], [Number.POSITIVE_INFINITY, 480], [640, Number.POSITIVE_INFINITY], [-640, 480], [640, -480],
  [10000, 8000],
  // Beyond the spec's minimum table: a wide container that reaches the device limit.
  [12000, 4000],
];
const RATIOS = [1, 1.25, 1.5, 2, 3, 0, Number.NaN];
const MAXIMA = [16384, 4096];
const INVALID_MAXIMA = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];
const EPSILON = 1e-9;

/** Checks every inequality of the spec's 画面布局 section for one non-null result. */
function expectLayoutInvariants(width: number, height: number, dpr: number, max: number, layout: ViewportLayout): void {
  const requested = Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, MAX_PIXEL_RATIO);
  const { pixelRatio: r, bufferWidth: bw, bufferHeight: bh, frame } = layout;
  expect(Number.isSafeInteger(bw) && Number.isSafeInteger(bh)).toBe(true);
  expect(bw).toBeGreaterThanOrEqual(1);
  expect(bh).toBeGreaterThanOrEqual(1);
  expect(Math.max(bw, bh)).toBeLessThanOrEqual(max);
  expect(r).toBeGreaterThan(0);
  expect(r).toBeLessThanOrEqual(requested);
  const wide = width / height >= 4 / 3;
  if (r === requested) {
    if (wide) expect(bh).toBe(Math.floor(height * r));
    else expect(bw).toBe(Math.floor(width * r));
  } else {
    expect(Math.max(bw, bh)).toBeGreaterThanOrEqual(max - 4);
  }
  if (wide) expect(Math.abs(bw - (4 * bh) / 3)).toBeLessThan(1);
  else expect(Math.abs(bh - (3 * bw) / 4)).toBeLessThan(1);
  expect(bw).toBeLessThanOrEqual(width * r + EPSILON);
  expect(bh).toBeLessThanOrEqual(height * r + EPSILON);
  expect(frame.width).toBeCloseTo(bw / r, 9);
  expect(frame.height).toBeCloseTo(bh / r, 9);
  expect(frame.left).toBeCloseTo(Math.max(0, (width - bw / r) / 2), 9);
  expect(frame.top).toBeCloseTo(Math.max(0, (height - bh / r) / 2), 9);
  expect(frame.left).toBeGreaterThanOrEqual(0);
  expect(frame.top).toBeGreaterThanOrEqual(0);
  expect(frame.left + frame.width).toBeLessThanOrEqual(width + EPSILON);
  expect(frame.top + frame.height).toBeLessThanOrEqual(height + EPSILON);
  // The fitted side touches the container edge: wide by height, narrow by width.
  if (wide) expect(frame.height).toBeGreaterThan(height - 1 / r - EPSILON);
  else expect(frame.width).toBeGreaterThan(width - 1 / r - EPSILON);
  expect(Object.isFrozen(layout) && Object.isFrozen(frame)).toBe(true);
}

describe('computeViewportLayout', () => {
  for (const [width, height] of CONTAINERS) {
    for (const dpr of RATIOS) {
      for (const max of MAXIMA) {
        it(`${width}×${height} at DPR ${dpr}, M ${max}`, () => {
          const layout = computeViewportLayout({ width, height, devicePixelRatio: dpr, maxDrawingBufferSize: max });
          const validSize = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
          if (!validSize) {
            expect(layout).toBeNull();
            return;
          }
          const r = Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, MAX_PIXEL_RATIO);
          const wide = width / height >= 4 / 3;
          const fitted = wide ? Math.floor(height * r) : Math.floor(width * r);
          const other = wide ? Math.floor((fitted * 4) / 3) : Math.floor((fitted * 3) / 4);
          if (Math.min(fitted, other) < 1) {
            expect(layout).toBeNull();
            return;
          }
          expect(layout).not.toBeNull();
          expectLayoutInvariants(width, height, dpr, max, layout!);
        });
      }
    }
    it(`${width}×${height} rejects every invalid maximum drawing size`, () => {
      for (const max of INVALID_MAXIMA) {
        expect(() => computeViewportLayout({ width, height, devicePixelRatio: 1, maxDrawingBufferSize: max })).toThrow(RangeError);
      }
    });
  }

  it('produces the expected letterbox for representative containers', () => {
    const at = (width: number, height: number, devicePixelRatio = 1, maxDrawingBufferSize = 16384) =>
      computeViewportLayout({ width, height, devicePixelRatio, maxDrawingBufferSize });
    expect(at(1280, 720)).toEqual({ pixelRatio: 1, bufferWidth: 960, bufferHeight: 720, frame: { left: 160, top: 0, width: 960, height: 720 } });
    expect(at(720, 1280)).toEqual({ pixelRatio: 1, bufferWidth: 720, bufferHeight: 540, frame: { left: 0, top: 370, width: 720, height: 540 } });
    expect(at(640, 480)).toEqual({ pixelRatio: 1, bufferWidth: 640, bufferHeight: 480, frame: { left: 0, top: 0, width: 640, height: 480 } });
    expect(at(640, 480, 3)).toEqual({ pixelRatio: 2, bufferWidth: 1280, bufferHeight: 960, frame: { left: 0, top: 0, width: 640, height: 480 } });
    expect(at(320, 240, Number.NaN)).toMatchObject({ pixelRatio: 1, bufferWidth: 320, bufferHeight: 240 });
    expect(at(10000, 8000, 2, 4096)).toEqual({
      pixelRatio: 0.4096, bufferWidth: 4096, bufferHeight: 3072, frame: { left: 0, top: 250, width: 10000, height: 7500 },
    });
    expect(at(12000, 4000, 1, 4096)).toEqual({
      pixelRatio: 0.768, bufferWidth: 4096, bufferHeight: 3072, frame: { left: 3333.3333333333335, top: 0, width: 5333.333333333333, height: 4000 },
    });
    expect(at(0.4, 0.4, 2)).toBeNull();
    expect(at(1, 1)).toBeNull();
  });

  it('stays finite at extreme finite sizes and accepts integer maxima beyond the safe range', () => {
    for (const [width, height] of [[1e308, 1.5e308], [1.5e308, 1e308], [Number.MAX_VALUE, Number.MAX_VALUE]] as const) {
      for (const max of [4096, 2 ** 53, 2 ** 60]) {
        const layout = computeViewportLayout({ width, height, devicePixelRatio: 2, maxDrawingBufferSize: max });
        expect(layout).not.toBeNull();
        const { pixelRatio, bufferWidth, bufferHeight, frame } = layout!;
        expect([pixelRatio, bufferWidth, bufferHeight, frame.left, frame.top, frame.width, frame.height].every(Number.isFinite)).toBe(true);
        expect(Math.max(bufferWidth, bufferHeight)).toBeLessThanOrEqual(max);
        expect(width / height >= 4 / 3 ? frame.height : frame.width).toBeGreaterThan(0);
      }
    }
  });

  it('compares layouts by value', () => {
    const input = { width: 800, height: 600, devicePixelRatio: 1.5, maxDrawingBufferSize: 4096 };
    expect(sameViewportLayout(computeViewportLayout(input), computeViewportLayout({ ...input }))).toBe(true);
    expect(sameViewportLayout(computeViewportLayout(input), computeViewportLayout({ ...input, devicePixelRatio: 2 }))).toBe(false);
    expect(sameViewportLayout(null, null)).toBe(true);
    expect(sameViewportLayout(null, computeViewportLayout(input))).toBe(false);
  });
});
