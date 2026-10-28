/**
 * The Warp effect's line drawer `0x51bc8` and its clip `0x51ab4` (docs/original/formats/executable.md, WT6): a line
 * three logical pixels wide across its minor axis, a centre colour between two edge colours, in the HI bounds the Warp
 * start sets (`0x1b0618`/`0x1b061c`). All arithmetic is the original's 32-bit integer arithmetic; with the coordinates
 * limited to ±1200 none of it overflows, and the 16-bit compares and steps never wrap.
 */

/** The inner bounds of the HI frame (WT3 step 5): an endpoint is inside when 2 ≤ x ≤ 637 and 2 ≤ y ≤ 313. */
const WARP_LINE_MIN = 2;
const WARP_LINE_MAX_X = 637;
export const WARP_LINE_MAX_Y = 313;
/** A line with any coordinate beyond ±1200 is rejected. */
const COORDINATE_LIMIT = 1200;

/** Receives each pixel in drawing order; a later pixel overwrites an earlier one. */
export type WarpPlot = (x: number, y: number, colour: number) => void;

const inside = (x: number, y: number): boolean => x >= WARP_LINE_MIN && x <= WARP_LINE_MAX_X && y >= WARP_LINE_MIN && y <= WARP_LINE_MAX_Y;

/** trunc(trunc(a × b × 256 ÷ divisor) ÷ 256), as `IDIV` and the compiler's signed shift by 8. */
const scaled = (a: number, b: number, divisor: number): number => Math.trunc(Math.trunc((a * b * 256) / divisor) / 256);

/**
 * `0x51ab4`: moves the outside endpoint (x, y) towards the inside one (xi, yi), first onto x = 2 or x = 637 when the x
 * coordinates differ, then, from that result, onto y = 2 or y = 313 when the y coordinates differ.
 */
function clip(x: number, y: number, xi: number, yi: number): [number, number] {
  if (xi !== x) {
    if (x < WARP_LINE_MIN) {
      y = yi + scaled(y - yi, WARP_LINE_MIN - xi, x - xi);
      x = WARP_LINE_MIN;
    } else if (x > WARP_LINE_MAX_X) {
      y = yi + scaled(y - yi, WARP_LINE_MAX_X - xi, x - xi);
      x = WARP_LINE_MAX_X;
    }
  }
  if (yi !== y) {
    if (y < WARP_LINE_MIN) {
      x = xi + scaled(x - xi, WARP_LINE_MIN - yi, y - yi);
      y = WARP_LINE_MIN;
    } else if (y > WARP_LINE_MAX_Y) {
      x = xi + scaled(WARP_LINE_MAX_Y - yi, x - xi, y - yi);
      y = WARP_LINE_MAX_Y;
    }
  }
  return [x, y];
}

/**
 * `0x51bc8`: rejects a line with a coordinate beyond ±1200, equal endpoints, or neither endpoint inside; clips the
 * outside endpoint; then steps from the first endpoint to the second along the major axis (Bresenham), plotting at each
 * step the edge colour, the centre colour and the edge colour across the minor axis, in that order.
 */
export function drawWarpLine(x0: number, y0: number, x1: number, y1: number, centre: number, edge: number, plot: WarpPlot): void {
  if (Math.abs(x0) > COORDINATE_LIMIT || Math.abs(y0) > COORDINATE_LIMIT || Math.abs(x1) > COORDINATE_LIMIT || Math.abs(y1) > COORDINATE_LIMIT) return;
  if (x0 === x1 && y0 === y1) return;
  const first = inside(x0, y0);
  const second = inside(x1, y1);
  if (!first && !second) return;
  if (!first) [x0, y0] = clip(x0, y0, x1, y1);
  else if (!second) [x1, y1] = clip(x1, y1, x0, y0);
  const dx2 = 2 * Math.abs(x1 - x0);
  const dy2 = 2 * Math.abs(y1 - y0);
  const sx = x1 - x0 < 0 ? -1 : 1;
  const sy = y1 - y0 < 0 ? -1 : 1;
  let x = x0;
  let y = y0;
  if (dy2 < dx2) {
    let error = dy2 - dx2 / 2;
    for (;;) {
      plot(x, y - 1, edge);
      plot(x, y, centre);
      plot(x, y + 1, edge);
      if (x === x1) break;
      if (error >= 0) {
        error -= dx2;
        y += sy;
      }
      error += dy2;
      x += sx;
    }
  } else {
    let error = dx2 - dy2 / 2;
    for (;;) {
      plot(x - 1, y, edge);
      plot(x, y, centre);
      plot(x + 1, y, edge);
      if (y === y1) break;
      if (error >= 0) {
        error -= dy2;
        x += sx;
      }
      y += sy;
      error += dx2;
    }
  }
}
