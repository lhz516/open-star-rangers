import { describe, expect, it } from 'vitest';
import { RandStream } from '../../../core/rules/original-random.ts';
import { plot } from '../raster/indexed-surface.ts';
import { clockExceeds, COCKPIT_BAND_TOP, frameEndRows, layoutOf } from './cockpit-layout.ts';
import { checkCapacity, checkImagePixels, COCKPIT_LIMITS, PresentationError } from './cockpit-limits.ts';
import { cockpitPresentationSeed, cockpitRandom, fnv1a32 } from './cockpit-random.ts';
import {
  BASE_VIEW, cockpitContent, EXTERNAL_VIEW, FLIGHT_VIEW, isolatedDrawContext, MAP_VIEW, TEST_SEED, WARP_VIEW,
} from './cockpit.test-support.ts';

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

describe('cockpit presentation stream', () => {
  it('hashes with FNV-1a 32', () => {
    expect(fnv1a32([])).toBe(0x811c9dc5);
    expect(fnv1a32(ascii('a'))).toBe(0xe40c292c);
    expect(fnv1a32(ascii('foobar'))).toBe(0xbf9cf968);
  });

  it('derives its seed from the host seed in little-endian order and the label', () => {
    const seed = 0x0102_03f4;
    expect(cockpitPresentationSeed(seed)).toBe(fnv1a32([0xf4, 0x03, 0x02, 0x01, ...ascii('cockpit-presentation')]));
    expect(cockpitPresentationSeed(0)).toBe(fnv1a32([0, 0, 0, 0, ...ascii('cockpit-presentation')]));
    expect(cockpitPresentationSeed(0xffff_ffff)).toBe(fnv1a32([0xff, 0xff, 0xff, 0xff, ...ascii('cockpit-presentation')]));
    for (const bad of [-1, 2 ** 32, 1.5, Number.NaN]) expect(() => cockpitPresentationSeed(bad)).toThrow(PresentationError);
  });

  it('is a stream of its own, never the host seed used directly', () => {
    const own = cockpitRandom(TEST_SEED);
    const expected = new RandStream(cockpitPresentationSeed(TEST_SEED));
    const direct = new RandStream(TEST_SEED);
    const values = Array.from({ length: 8 }, () => own.next());
    expect(values).toEqual(Array.from({ length: 8 }, () => expected.next()));
    expect(values).not.toEqual(Array.from({ length: 8 }, () => direct.next()));
    expect(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 32767)).toBe(true);
  });
});

describe('cockpit layouts and clock', () => {
  const content = cockpitContent();

  it('selects the slot and shown rows of each view', () => {
    expect(layoutOf(FLIGHT_VIEW, content)).toMatchObject({ view: 'flight', slot: content.slots[0], palette: 'flight', screenRows: { top: 316, bottom: 479 }, worldRows: { top: 0, bottom: 315 } });
    expect(layoutOf(WARP_VIEW, content)).toMatchObject({ view: 'warp', slot: content.slots[0], palette: 'flight', screenRows: { top: 316, bottom: 479 } });
    expect(layoutOf(MAP_VIEW, content)).toMatchObject({ view: 'map', slot: content.slots[1], palette: 'map', screenRows: { top: 0, bottom: 479 }, worldRows: null });
    expect(layoutOf(EXTERNAL_VIEW, content)).toMatchObject({ view: 'external', slot: content.slots[2], palette: 'flight', screenRows: null, worldRows: { top: 0, bottom: 479 } });
    for (const viewMode of [BASE_VIEW, 0x13, 0x0d, -1]) expect(layoutOf(viewMode, content)).toMatchObject({ slot: null, palette: null, screenRows: null, worldRows: null });
    expect(layoutOf(BASE_VIEW, content).view).toBe('base');
    expect(layoutOf(0x13, content).view).toBe('none');
    expect(COCKPIT_BAND_TOP).toBe(316);
    expect(frameEndRows('flight')).toEqual({ top: 0, bottom: 315 });
    expect(frameEndRows('warp')).toEqual({ top: 0, bottom: 315 });
    expect(frameEndRows('map')).toEqual({ top: 0, bottom: 479 });
    expect(frameEndRows('external')).toEqual({ top: 0, bottom: 479 });
  });

  it('compares clock differences as u32, strictly', () => {
    expect(clockExceeds(10, 2, 7)).toBe(true);
    expect(clockExceeds(9, 2, 7)).toBe(false);
    expect(clockExceeds(1, 0xffff_ffff, 1)).toBe(true);
    expect(clockExceeds(0, 0xffff_ffff, 1)).toBe(false);
    expect(clockExceeds(2 ** 32 + 5, 2 ** 32 - 1, 5)).toBe(true);
  });
});

describe('cockpit limits', () => {
  it('fixes DC-08', () => {
    expect(COCKPIT_LIMITS).toMatchObject({
      ticksPerAdvance: 5, surface: { width: 640, height: 480 }, statusPicture: { width: 96, height: 100 }, imagePixels: 2 ** 20,
      messages: 64, messageBytes: 128, messageTextBytes: 8192, summaryBytes: 58, warpTrail: 94, radarEntries: 120, leftPages: 7,
      diagBytes: 79, zoomComparisons: 10_000, gpuTexels: 2 ** 19, renderTargets: 0,
    });
    expect(Object.isFrozen(COCKPIT_LIMITS)).toBe(true);
  });

  it('checks image pixels before allocation, at the limit and one past it', () => {
    expect(() => checkImagePixels([{ width: 1024, height: 1023 }, { width: 1024, height: 1 }], 'images')).not.toThrow();
    const over = (() => {
      try {
        checkImagePixels([{ width: 1024, height: 1024 }, { width: 1, height: 1 }], 'images');
      } catch (error) {
        return error;
      }
    })();
    expect(over).toBeInstanceOf(PresentationError);
    expect(over).toMatchObject({ kind: 'presentation-capacity', path: 'images' });
    expect(() => checkImagePixels([{ width: -1, height: 2 }], 'images')).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
  });

  it('checks a count before one more is allocated', () => {
    expect(() => checkCapacity(63, COCKPIT_LIMITS.messages, 'queue')).not.toThrow();
    expect(() => checkCapacity(64, COCKPIT_LIMITS.messages, 'queue')).toThrow(expect.objectContaining({ kind: 'presentation-capacity' }));
  });
});

describe('isolated draw context', () => {
  it('lets one handler draw and publish with the real stream', () => {
    const { context, surfaces, published } = isolatedDrawContext(3, { viewMode: FLIGHT_VIEW, fullRedraw: true });
    expect(context).toMatchObject({ tick: 3, clock: 6, fullRedraw: true, layout: { view: 'flight' } });
    plot(context.back, 5, 400, 9);
    context.publishRow(400, 0, 10);
    expect(published).toEqual([{ x0: 0, y0: 400, x1: 10, y1: 400 }]);
    expect(surfaces.screen.indices[400 * 640 + 5]).toBe(9);
    expect(context.random.next()).toBe(cockpitRandom(TEST_SEED).next());
  });
});
