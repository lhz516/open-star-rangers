import { describe, expect, it } from 'vitest';
import type { ExpandedImage } from '../../content/graphics/expand-image.ts';
import { syntheticFont, syntheticPalette } from './viewer.test-support.ts';
import {
  SHEET_COLUMNS, SHEET_GRID_GREY, SWATCH_SIZE, glyphSheet, paletteSheet, placePicture, sheetCellOrigin,
} from './viewer-pictures.ts';

const pixel = (picture: ExpandedImage, x: number, y: number): number[] => [...picture.rgba.subarray((y * picture.width + x) * 4, (y * picture.width + x) * 4 + 4)];
const GRID = [SHEET_GRID_GREY, SHEET_GRID_GREY, SHEET_GRID_GREY, 255];

/** Asserts the 1-pixel grid lines around every cell, and transparency in the cells past `count`. */
function expectGrid(picture: ExpandedImage, count: number, cellWidth: number, cellHeight: number): void {
  const columns = Math.min(count, SHEET_COLUMNS);
  const rows = Math.ceil(count / SHEET_COLUMNS);
  expect([picture.width, picture.height]).toEqual([columns * (cellWidth + 1) + 1, rows * (cellHeight + 1) + 1]);
  for (let y = 0; y < picture.height; y++) {
    for (let x = 0; x < picture.width; x++) {
      const line = x % (cellWidth + 1) === 0 || y % (cellHeight + 1) === 0;
      const index = Math.floor(y / (cellHeight + 1)) * SHEET_COLUMNS + Math.floor(x / (cellWidth + 1));
      if (line) expect(pixel(picture, x, y)).toEqual(GRID);
      else if (index >= count) expect(pixel(picture, x, y)).toEqual([0, 0, 0, 0]);
    }
  }
}

describe('palette sheet', () => {
  it.each([1, 3, 16, 20, 256])('shows each of %i entries as a swatch of exactly its colour', count => {
    const palette = syntheticPalette(count);
    const picture = paletteSheet(palette);
    expectGrid(picture, count, SWATCH_SIZE, SWATCH_SIZE);
    for (let entry = 0; entry < count; entry++) {
      const origin = sheetCellOrigin(entry, SWATCH_SIZE, SWATCH_SIZE);
      const colour = [...palette.entries.subarray(entry * 3, entry * 3 + 3), 255];
      for (let y = 0; y < SWATCH_SIZE; y++) {
        for (let x = 0; x < SWATCH_SIZE; x++) expect(pixel(picture, origin.x + x, origin.y + y)).toEqual(colour);
      }
    }
    expect(Object.isFrozen(picture)).toBe(true);
  });
});

describe('glyph sheet', () => {
  it.each([[1, 1, 1, 1], [18, 5, 6, 8], [256, 8, 8, 8], [3, 4, 6, 6]])(
    'shows each of %i glyphs of %i × %i (%i rows) white on black, only inside the cell',
    (count, cellWidth, height, glyphRows) => {
      const font = syntheticFont(count, cellWidth, height, glyphRows);
      const picture = glyphSheet(font);
      expectGrid(picture, count, cellWidth, height);
      for (let glyph = 0; glyph < count; glyph++) {
        const origin = sheetCellOrigin(glyph, cellWidth, height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < cellWidth; x++) {
            const on = (font.glyphs[glyph * glyphRows + y] & (0x80 >> x)) !== 0;
            expect(pixel(picture, origin.x + x, origin.y + y)).toEqual(on ? [255, 255, 255, 255] : [0, 0, 0, 255]);
          }
        }
      }
    },
  );
});

describe('picture placement', () => {
  it.each([
    // Whole scale 160, filling the buffer.
    [{ width: 4, height: 3 }, 640, 480, { left: 0, top: 0, width: 640, height: 480 }],
    // Whole scale 128 by width, centred vertically.
    [{ width: 5, height: 3 }, 640, 480, { left: 0, top: 48, width: 640, height: 384 }],
    // Whole scale 48 by height, centred horizontally.
    [{ width: 10, height: 10 }, 640, 480, { left: 80, top: 0, width: 480, height: 480 }],
    // 5.88 by width, 15 by height: whole scale 5; odd margins round down.
    [{ width: 17, height: 5 }, 100, 75, { left: 7, top: 25, width: 85, height: 25 }],
    // Larger than the buffer: shrinks to fit.
    [{ width: 640, height: 480 }, 320, 240, { left: 0, top: 0, width: 320, height: 240 }],
    [{ width: 640, height: 100 }, 320, 240, { left: 0, top: 95, width: 320, height: 50 }],
  ])('places %o at a whole scale, centred, in %i × %i', (picture, bufferWidth, bufferHeight, expected) => {
    expect(placePicture(picture, 'integer', bufferWidth, bufferHeight)).toEqual(expected);
  });

  it('stretches a covering picture over the whole buffer', () => {
    expect(placePicture({ width: 640, height: 480 }, 'cover', 961, 720)).toEqual({ left: 0, top: 0, width: 961, height: 720 });
    expect(placePicture({ width: 8, height: 6 }, 'cover', 100, 75)).toEqual({ left: 0, top: 0, width: 100, height: 75 });
  });
});
