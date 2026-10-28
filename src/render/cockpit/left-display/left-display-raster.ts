/**
 * Arithmetic and copies the left display's pages share (docs/original/formats/hud.md §4.4).
 */
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import { blit, type BlitMode, type IndexedSurface } from '../raster/indexed-surface.ts';

/**
 * The i32 `IDIV` of two i32 values (callers exclude a zero divisor): the quotient truncated toward zero. The double
 * quotient never rounds across an integer for i32 operands, so truncating it is exact (as Core's `quotient`).
 */
export const idiv = (dividend: number, divisor: number): number => Math.trunc(dividend / divisor) + 0;

/**
 * The pages' image copies (`0x59608`, `0x59cbc`, `0x59774`, `0x59d38`): rows 0…`lastRow` of columns 0…width, one
 * column more than the image is wide, at (x, y). The extra column of a row is read as the next row's first pixel
 * (the blitters read each row linearly); the byte after the image, which the last row's extra column would read, is
 * not read, so that row has only the image's own columns.
 */
export function blitColumns(surface: IndexedSurface, image: ImagePayload, x: number, y: number, mode: BlitMode, lastRow = image.height - 1): void {
  const { width, height } = image;
  if (lastRow < 0) return;
  if (lastRow > 0) blit(surface, image, x, y, mode, { x0: 0, y0: 0, x1: width, y1: lastRow - 1 });
  blit(surface, image, x, y + lastRow, mode, { x0: 0, y0: lastRow, x1: lastRow < height - 1 ? width : width - 1, y1: lastRow });
}
