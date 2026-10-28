import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import { readAssetId } from '../../../content/asset-id.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import {
  RASTER_LIMITS, blit, clearRect, createIndexedSurface, drawCircle, drawLine, fillDisc, fillRect, isCovered, outlineRect, plot,
  resolveRows, toInt16, type IndexedSurface,
} from './indexed-surface.ts';

// Synthetic surfaces, images and palettes only. Pixel sets are written out by hand from the recorded routines
// (docs/original/formats/hud.md §4.1); each negative control asserts that a plausible variant gives other pixels.

const BACKGROUND = 9;

/** The written pixels of `surface` as sorted "x,y=index" strings, ignoring `background`. */
function pixelsOf(surface: IndexedSurface, background = 0): string[] {
  const out: string[] = [];
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const index = surface.indices[y * surface.width + x];
      if (index !== background) out.push(`${x},${y}=${index}`);
    }
  }
  return out.sort();
}

const at = (points: readonly (readonly [number, number])[], colour: number): string[] => points.map(([x, y]) => `${x},${y}=${colour}`).sort();
const indexAt = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * surface.width + x];

function backgroundSurface(width = 16, height = 12, coverage = false): IndexedSurface {
  const surface = createIndexedSurface(width, height, coverage);
  surface.indices.fill(BACKGROUND);
  return surface;
}

describe('indexed surfaces', () => {
  it('creates zeroed surfaces up to 640 × 480, with an optional uncovered coverage mask', () => {
    const screen = createIndexedSurface(RASTER_LIMITS.width, RASTER_LIMITS.height, true);
    expect(screen.indices).toHaveLength(640 * 480);
    expect(screen.coverage).toHaveLength(80 * 480);
    expect(screen.indices.every(index => index === 0)).toBe(true);
    expect(isCovered(screen, 0, 0)).toBe(false);
    expect(createIndexedSurface(96, 100).coverage).toBeNull();
    expect(isCovered(createIndexedSurface(96, 100), 95, 99)).toBe(true);
    expect(() => createIndexedSurface(641, 480)).toThrow(RangeError);
    expect(() => createIndexedSurface(640, 481)).toThrow(RangeError);
    expect(() => createIndexedSurface(0, 1)).toThrow(RangeError);
  });

  it('drops writes past each of the four screen edges without wrapping into the next row', () => {
    const screen = createIndexedSurface(640, 480);
    for (const [x, y] of [[-1, 0], [640, 0], [0, -1], [0, 480], [-1, -1], [640, 479]]) plot(screen, x, y, 7);
    expect(pixelsOf(screen)).toEqual([]);
    plot(screen, 0, 0, 7);
    plot(screen, 639, 479, 8);
    expect(pixelsOf(screen)).toEqual(['0,0=7', '639,479=8']);
  });

  it('drops far-off pixels of any integer coordinate and bounds only the 16-bit line ends and radii', () => {
    const surface = createIndexedSurface(8, 8);
    plot(surface, 1e9, 0, 1);
    plot(surface, 0, -1e9, 1);
    drawCircle(surface, 1e9, 3, 5, 1);
    fillDisc(surface, 3, -1e9, 5, 1);
    outlineRect(surface, -1e9, -1e9, 10, 10, 1);
    blit(surface, surface, 1e9, 0, 'opaque');
    expect(pixelsOf(surface)).toEqual([]);
    drawLine(surface, -32768, 2, 32767, 2, 1);
    fillRect(surface, -1e9, 5, 1e9, 5, 2);
    outlineRect(surface, -1e9, 7, 2e9, 1e9, 3);
    expect(pixelsOf(surface)).toHaveLength(24);
    expect(toInt16(32768)).toBe(-32768);
    expect(toInt16(65536 + 5)).toBe(5);
    expect(() => drawLine(surface, 0, 0, 32768, 0, 1)).toThrow(RangeError);
    expect(() => drawCircle(surface, 0, 0, 32768, 1)).toThrow(RangeError);
    expect(() => fillDisc(surface, 0, 0, -1, 1)).toThrow(RangeError);
    expect(() => plot(surface, 0.5, 0, 1)).toThrow(RangeError);
    expect(() => plot(surface, 0, 0, 256)).toThrow(RangeError);
    expect(() => outlineRect(surface, 0, 0, -1, 4, 1)).toThrow(RangeError);
  });
});

describe('fills', () => {
  it('fills an inclusive rectangle, clipped at all four edges, and nothing for reversed corners', () => {
    const surface = backgroundSurface(6, 5);
    fillRect(surface, 1, 1, 2, 3, 4);
    expect(pixelsOf(surface, BACKGROUND)).toEqual(at([[1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]], 4));
    const clipped = backgroundSurface(6, 5);
    fillRect(clipped, -3, -3, 0, 0, 4);
    fillRect(clipped, 5, 4, 20, 20, 5);
    expect(pixelsOf(clipped, BACKGROUND)).toEqual(['0,0=4', '5,4=5']);
    const reversed = backgroundSurface(6, 5);
    fillRect(reversed, 3, 1, 2, 3, 4);
    fillRect(reversed, 1, 3, 2, 1, 4);
    expect(pixelsOf(reversed, BACKGROUND)).toEqual([]);
  });

  it('covers a colour-0 fill opaquely but uncovers a clear (negative control: same indices, other coverage)', () => {
    const filled = createIndexedSurface(4, 2, true);
    const cleared = createIndexedSurface(4, 2, true);
    fillRect(filled, 0, 0, 3, 1, 3);
    fillRect(cleared, 0, 0, 3, 1, 3);
    fillRect(filled, 1, 0, 2, 0, 0);
    clearRect(cleared, 1, 0, 2, 0);
    expect(filled.indices).toEqual(cleared.indices);
    expect([isCovered(filled, 1, 0), isCovered(filled, 2, 0), isCovered(filled, 3, 0)]).toEqual([true, true, true]);
    expect([isCovered(cleared, 1, 0), isCovered(cleared, 2, 0), isCovered(cleared, 3, 0)]).toEqual([false, false, true]);
  });
});

describe('outlines and lines', () => {
  it('outlines width × height pixels from the top-left and draws nothing below 2 × 2', () => {
    const surface = createIndexedSurface(8, 8);
    outlineRect(surface, 1, 2, 4, 3, 6);
    expect(pixelsOf(surface)).toEqual(at([[1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [4, 3], [1, 4], [2, 4], [3, 4], [4, 4]], 6));
    const thin = createIndexedSurface(8, 8);
    outlineRect(thin, 1, 1, 1, 5, 6);
    outlineRect(thin, 1, 1, 5, 1, 6);
    outlineRect(thin, 1, 1, 0, 0, 6);
    expect(pixelsOf(thin)).toEqual([]);
    outlineRect(thin, 0, 0, 2, 2, 6);
    expect(pixelsOf(thin)).toEqual(at([[0, 0], [1, 0], [0, 1], [1, 1]], 6));
  });

  it('places the message line map outline in the recorded columns and rows', () => {
    // hud §4.7: rectangle (152,411)–(392,427), outline (x1 − x0 − 1) × (y1 − y0 − 1): columns 152–390, rows 411–425.
    const screen = createIndexedSurface(640, 480);
    outlineRect(screen, 152, 411, 392 - 152 - 1, 427 - 411 - 1, 8);
    expect([indexAt(screen, 390, 411), indexAt(screen, 391, 411), indexAt(screen, 152, 425), indexAt(screen, 152, 426)]).toEqual([8, 0, 8, 0]);
  });

  it('draws both end points with the recorded error rule, so the direction changes the pixels', () => {
    const forward = createIndexedSurface(8, 8);
    drawLine(forward, 0, 0, 4, 2, 5);
    expect(pixelsOf(forward)).toEqual(at([[0, 0], [1, 1], [2, 1], [3, 2], [4, 2]], 5));
    // Negative control: a strict "> 0" step would give (1,0) and (3,1) instead of (1,1) and (3,2).
    expect([indexAt(forward, 1, 0), indexAt(forward, 3, 1)]).toEqual([0, 0]);
    const backward = createIndexedSurface(8, 8);
    drawLine(backward, 4, 2, 0, 0, 5);
    expect(pixelsOf(backward)).toEqual(at([[0, 0], [1, 0], [2, 1], [3, 1], [4, 2]], 5));
    expect(pixelsOf(backward)).not.toEqual(pixelsOf(forward));
    const steep = createIndexedSurface(8, 8);
    drawLine(steep, 0, 0, 1, 3, 5);
    drawLine(steep, 6, 6, 6, 6, 7);
    expect(pixelsOf(steep)).toEqual([...at([[0, 0], [0, 1], [1, 2], [1, 3]], 5), '6,6=7'].sort());
  });

  it('clips a line at the screen edge without wrapping it into the previous row', () => {
    const screen = createIndexedSurface(640, 480);
    drawLine(screen, -2, 1, 2, 1, 4);
    drawLine(screen, 637, 2, 641, 2, 4);
    expect(pixelsOf(screen)).toEqual(at([[0, 1], [1, 1], [2, 1], [637, 2], [638, 2], [639, 2]], 4));
  });
});

describe('circles and discs', () => {
  const C = 8;
  const plus = (points: readonly (readonly [number, number])[]): (readonly [number, number])[] => points.map(([x, y]) => [C + x, C + y] as const);

  it('draws the midpoint circle as eight-way step points plus the four axis points', () => {
    const full = createIndexedSurface(17, 17);
    drawCircle(full, C, C, 3, 2);
    const axes = [[3, 0], [-3, 0], [0, 3], [0, -3]] as const;
    const firstStep = [[1, 3], [-1, 3], [1, -3], [-1, -3], [3, 1], [-3, 1], [3, -1], [-3, -1]] as const;
    const secondStep = [[2, 2], [-2, 2], [2, -2], [-2, -2]] as const;
    expect(pixelsOf(full)).toEqual(at(plus([...axes, ...firstStep, ...secondStep]), 2));
    const partial = createIndexedSurface(17, 17);
    drawCircle(partial, C, C, 3, 2, 1);
    expect(pixelsOf(partial)).toEqual(at(plus([...axes, ...firstStep]), 2));
    expect(indexAt(full, C + 2, C + 2) - indexAt(partial, C + 2, C + 2)).toBe(2);
    const axesOnly = createIndexedSurface(17, 17);
    drawCircle(axesOnly, C, C, 3, 2, 0);
    expect(pixelsOf(axesOnly)).toEqual(at(plus(axes), 2));
  });

  it('draws radius 1 without its centre and radius 0 as the centre', () => {
    const one = createIndexedSurface(17, 17);
    drawCircle(one, C, C, 1, 2);
    expect(pixelsOf(one)).toEqual(at(plus([[1, 0], [-1, 0], [0, 1], [0, -1]]), 2));
    const zero = createIndexedSurface(17, 17);
    drawCircle(zero, C, C, 0, 2);
    expect(pixelsOf(zero)).toEqual(at([[C, C]], 2));
  });

  it('reproduces the reticle ring pixel counts recorded from captures', () => {
    // hud §4.6: the radius-20 ring of 10 steps per octant has 84 pixels; the full circle would have 112.
    const ring = createIndexedSurface(64, 64);
    drawCircle(ring, 32, 32, 20, 1, 10);
    const full = createIndexedSurface(64, 64);
    drawCircle(full, 32, 32, 20, 1);
    expect(pixelsOf(ring)).toHaveLength(84);
    expect(pixelsOf(full)).toHaveLength(112);
  });

  it('fills a disc row by row and limits each span to an inclusive clip box', () => {
    const disc = createIndexedSurface(17, 17);
    fillDisc(disc, C, C, 2, 3);
    const rows: [number, number][] = [];
    for (const [dy, half] of [[-2, 1], [-1, 2], [0, 2], [1, 2], [2, 1]] as const) for (let dx = -half; dx <= half; dx++) rows.push([C + dx, C + dy]);
    expect(pixelsOf(disc)).toEqual(at(rows, 3));
    const clipped = createIndexedSurface(17, 17);
    fillDisc(clipped, C, C, 2, 3, { x0: C, y0: C - 1, x1: C + 5, y1: C + 5 });
    expect(pixelsOf(clipped)).toEqual(at(rows.filter(([x, y]) => x >= C && y >= C - 1), 3));
    expect(indexAt(disc, C - 1, C) - indexAt(clipped, C - 1, C)).toBe(3);
  });
});

describe('blits', () => {
  // 3 × 2: index 0 at (0,0) is opaque under the mask; (2,0) and (1,1) are transparent (index 0, as payloads require).
  const image: ImagePayload = Object.freeze({
    kind: 'image', width: 3, height: 2, palette: readAssetId('palette/test/a'), display: 'direct',
    indices: Uint8Array.of(0, 1, 0, 3, 0, 4), mask: Uint8Array.of(0b1100_0000, 0b1010_0000),
  });
  const original = { indices: image.indices.slice(), mask: image.mask!.slice() };

  function blitted(mode: 'opaque' | 'key' | 'mask'): IndexedSurface {
    const surface = backgroundSurface(6, 4, true);
    blit(surface, image, 2, 1, mode);
    return surface;
  }

  it('writes index 0 opaquely, skips it only for the colour key, and follows the mask only in mask mode', () => {
    const [opaque, key, mask] = [blitted('opaque'), blitted('key'), blitted('mask')];
    expect(pixelsOf(opaque, BACKGROUND)).toEqual(['2,1=0', '3,1=1', '2,2=3', '3,2=0', '4,1=0', '4,2=4'].sort());
    expect(pixelsOf(key, BACKGROUND)).toEqual(['3,1=1', '2,2=3', '4,2=4'].sort());
    expect(pixelsOf(mask, BACKGROUND)).toEqual(['2,1=0', '3,1=1', '2,2=3', '4,2=4'].sort());
    // Negative controls: the opaque 0 at (2,1) separates mask from key; the transparent (4,1) separates mask from opaque.
    expect([indexAt(mask, 2, 1), indexAt(key, 2, 1)]).toEqual([0, BACKGROUND]);
    expect([indexAt(mask, 4, 1), indexAt(opaque, 4, 1)]).toEqual([BACKGROUND, 0]);
    expect([isCovered(mask, 2, 1), isCovered(mask, 4, 1), isCovered(key, 2, 1)]).toEqual([true, false, false]);
    expect(image.indices).toEqual(original.indices);
    expect(image.mask).toEqual(original.mask);
  });

  it('reads columns past the row end from the next row, as the original blitters do', () => {
    const surface = createIndexedSurface(8, 4);
    blit(surface, image, 0, 0, 'opaque', { x0: 1, y0: 0, x1: 3, y1: 0 });
    expect(pixelsOf(surface)).toEqual(['0,0=1', '2,0=3']);
    expect(() => blit(surface, image, 0, 0, 'opaque', { x0: 0, y0: 0, x1: 3, y1: 1 })).toThrow(RangeError);
    expect(() => blit(surface, image, 0, 0, 'opaque', { x0: 0, y0: 1, x1: 0, y1: 0 })).toThrow(RangeError);
  });

  it('clips at the surface edges without wrapping and copies one surface into another', () => {
    const screen = createIndexedSurface(640, 480);
    blit(screen, image, 638, 479, 'opaque');
    blit(screen, image, -2, -1, 'key');
    expect(pixelsOf(screen)).toEqual(['0,0=4', '639,479=1']);
    const status = createIndexedSurface(3, 2);
    status.indices.set([5, 6, 7, 8, 9, 10]);
    const target = createIndexedSurface(8, 4);
    blit(target, status, 4, 2, 'opaque', { x0: 0, y0: 0, x1: 3, y1: 0 });
    expect(pixelsOf(target)).toEqual(['4,2=5', '5,2=6', '6,2=7', '7,2=8']);
  });

  it('refuses an image whose indices address another palette', () => {
    const nearest = { ...image, display: Object.freeze({ nearest: readAssetId('palette/test/b') }) };
    expect(() => blit(createIndexedSurface(4, 4), nearest, 0, 0, 'opaque')).toThrow(RangeError);
  });
});

describe('palette resolution', () => {
  // Entries that a second 6-bit expansion (× 4) would change.
  const palette: PalettePayload = Object.freeze({ kind: 'palette', entries: Uint8Array.of(1, 2, 3, 0xff, 0x7f, 0x41, 10, 20, 30) });

  it('resolves index 0 and 1 with the imported 8-bit entries and leaves uncovered pixels transparent', () => {
    const surface = createIndexedSurface(3, 2, true);
    fillRect(surface, 0, 0, 0, 0, 0);
    fillRect(surface, 1, 0, 1, 0, 1);
    const rgba = new Uint8Array(3 * 2 * 4).fill(0xaa);
    resolveRows(surface, palette, rgba, 0, 0);
    expect([...rgba.subarray(0, 12)]).toEqual([1, 2, 3, 255, 0xff, 0x7f, 0x41, 255, 0, 0, 0, 0]);
    expect([...rgba.subarray(12)].every(byte => byte === 0xaa)).toBe(true);
    // Negative control: re-expanding the entries would have given (4, 8, 12) for index 0.
    expect([...rgba.subarray(0, 3)]).not.toEqual([4, 8, 12]);
    expect(palette.entries).toEqual(Uint8Array.of(1, 2, 3, 0xff, 0x7f, 0x41, 10, 20, 30));
  });

  it('resolves every pixel of a surface without coverage and rejects indices past the palette', () => {
    const surface = createIndexedSurface(2, 1);
    surface.indices.set([2, 0]);
    const rgba = new Uint8Array(8);
    resolveRows(surface, palette, rgba);
    expect([...rgba]).toEqual([10, 20, 30, 255, 1, 2, 3, 255]);
    surface.indices[1] = 3;
    expect(() => resolveRows(surface, palette, rgba)).toThrow(ContentContractError);
    try {
      resolveRows(surface, palette, rgba);
    } catch (error) {
      expect((error as ContentContractError).code).toBe('palette-index-out-of-range');
    }
    expect(() => resolveRows(surface, palette, new Uint8Array(4))).toThrow(RangeError);
  });
});
