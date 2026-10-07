/**
 * Pure RGBA pictures of the resource viewer's 2D items and where a picture sits in the drawing buffer (P2-11 S-07):
 * a palette is a grid of swatches and a font a sheet of glyphs in glyph order, both 16 cells to a row with 1-pixel grid
 * lines. Pictures have the layout of `expandImage` output: non-premultiplied RGBA, row 0 at the top, and (0, 0, 0, 0)
 * where nothing is shown, so the viewer's checkerboard appears there.
 */
import type { ExpandedImage } from '../../content/graphics/expand-image.ts';
import type { FontPayload } from '../../content/graphics/font-payload.ts';
import type { PalettePayload } from '../../content/graphics/palette-payload.ts';

/** Cells per sheet row; a sheet with fewer cells is one row of that many. */
export const SHEET_COLUMNS = 16;
/** Side of a palette swatch, in picture pixels. */
export const SWATCH_SIZE = 7;
/** Opaque neutral grey of the 1-pixel lines around every cell. */
export const SHEET_GRID_GREY = 64;

/** Picture pixel at the top-left of cell `index` in a sheet of `cellWidth` × `cellHeight` cells. */
export function sheetCellOrigin(index: number, cellWidth: number, cellHeight: number): { readonly x: number; readonly y: number } {
  return { x: 1 + (index % SHEET_COLUMNS) * (cellWidth + 1), y: 1 + Math.floor(index / SHEET_COLUMNS) * (cellHeight + 1) };
}

/** A grid-grey sheet of `count` cells; `paint` returns the RGB of each cell pixel, and cells past `count` are transparent. */
function sheet(
  count: number, cellWidth: number, cellHeight: number, paint: (index: number, x: number, y: number) => ArrayLike<number>,
): ExpandedImage {
  const columns = Math.min(count, SHEET_COLUMNS);
  const rows = Math.ceil(count / SHEET_COLUMNS);
  const width = columns * (cellWidth + 1) + 1;
  const height = rows * (cellHeight + 1) + 1;
  const rgba = new Uint8Array(width * height * 4).fill(SHEET_GRID_GREY);
  for (let alpha = 3; alpha < rgba.length; alpha += 4) rgba[alpha] = 255;
  for (let index = 0; index < rows * columns; index++) {
    const origin = sheetCellOrigin(index, cellWidth, cellHeight);
    for (let y = 0; y < cellHeight; y++) {
      for (let x = 0; x < cellWidth; x++) {
        const at = ((origin.y + y) * width + origin.x + x) * 4;
        if (index >= count) {
          rgba.fill(0, at, at + 4);
          continue;
        }
        const colour = paint(index, x, y);
        rgba[at] = colour[0];
        rgba[at + 1] = colour[1];
        rgba[at + 2] = colour[2];
      }
    }
  }
  return Object.freeze({ width, height, rgba });
}

/** Every palette entry as a swatch of exactly its colour, in entry order. */
export function paletteSheet(palette: PalettePayload): ExpandedImage {
  const { entries } = palette;
  return sheet(entries.length / 3, SWATCH_SIZE, SWATCH_SIZE, index => entries.subarray(index * 3, index * 3 + 3));
}

const GLYPH_ON = [255, 255, 255] as const;
const GLYPH_OFF = [0, 0, 0] as const;

/**
 * Every glyph in glyph order as its cell: `cellWidth` × `height` pixels, white where the glyph bit is set and black
 * elsewhere. HUD colours come from layouts or the runtime, so the viewer does not infer them.
 */
export function glyphSheet(font: FontPayload): ExpandedImage {
  const { glyphs, glyphRows, cellWidth, height } = font;
  return sheet(glyphs.length / glyphRows, cellWidth, height, (index, x, y) =>
    (glyphs[index * glyphRows + y] & (0x80 >> x)) !== 0 ? GLYPH_ON : GLYPH_OFF);
}

/**
 * How a picture fills the 4:3 drawing buffer: `integer` scales it by the largest whole factor that fits (shrinking to
 * fit only when it is larger than the buffer) and centres it; `cover` stretches it over the whole buffer.
 */
export type PictureFit = 'integer' | 'cover';

/** Drawing-buffer pixels, measured from the top-left corner. */
export interface PicturePlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function placePicture(
  picture: { readonly width: number; readonly height: number }, fit: PictureFit, bufferWidth: number, bufferHeight: number,
): PicturePlacement {
  if (fit === 'cover') return Object.freeze({ left: 0, top: 0, width: bufferWidth, height: bufferHeight });
  const scale = Math.min(bufferWidth / picture.width, bufferHeight / picture.height);
  const whole = scale >= 1 ? Math.floor(scale) : scale;
  const width = Math.max(1, Math.round(picture.width * whole));
  const height = Math.max(1, Math.round(picture.height * whole));
  return Object.freeze({
    left: Math.floor((bufferWidth - width) / 2), top: Math.floor((bufferHeight - height) / 2), width, height,
  });
}
