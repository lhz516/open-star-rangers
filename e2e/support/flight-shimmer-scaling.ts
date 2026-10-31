import type { Page } from '@playwright/test';
import type * as Harness from '../../src/render/flight/shimmer/shimmer-scaling.test-support.ts';

// P3-16/24 (docs/plan/p3/12/spec.md AC-05, AC-08, AC-16; technical decisions 3, 4): which device pixels a hit shimmer
// shell of one opacity must draw, computed here from the shared logical-pixel rule, not by the renderer's modules. From
// 640 wide a device pixel takes the screen door cell (x & 3, y & 3) of the logical pixel whose [x·s, (x + 1)·s) holds
// its centre, the later one when the centre lies exactly on an edge, kept on the logical screen (logical-screen.ts
// LOGICAL_PIXEL_GLSL); a narrower buffer takes its own device pixel, rows from the top (the approved difference).
// Opacity 0xFF is drawn everywhere, 0x7F where x + y is even, 0 nowhere (HS6).

const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 480;

/** The buffer height of the 4:3 layout for a buffer `width` wide. */
export const bufferHeight = (width: number): number => Math.round((width * 3) / 4);

/** The logical pixel of device pixel `device` along an axis, as an exact rational: ⌊(2d + 1) · 320 ÷ W⌋. */
const logicalOf = (device: number, width: number, size: number): number => Math.min(size - 1, Math.floor(((2 * device + 1) * 320) / width));

/** Whether device pixel `device`'s centre lies exactly on a logical pixel edge. */
const onEdge = (device: number, width: number): boolean => ((2 * device + 1) * 320) % width === 0;

/** The screen door cell's pixel along an axis: the logical pixel from 640 wide, else the device pixel. */
const cellOf = (device: number, width: number, size: number): number => (width < LOGICAL_WIDTH ? device : logicalOf(device, width, size));

/** Whether a shell of `opacity` is drawn at the cell pixel (x, y). */
const doorDrawn = (opacity: number, x: number, y: number): boolean => opacity === 0xff || (opacity === 0x7f && (x + y) % 2 === 0);

/** Per device pixel along an axis of `length` pixels: its cell pixel, its shared rule logical pixel, and whether on an edge. */
function axis(length: number, width: number, size: number) {
  const devices = Array.from({ length }, (_, device) => device);
  return {
    cells: devices.map((device) => cellOf(device, width, size)),
    logical: devices.map((device) => logicalOf(device, width, size)),
    edges: devices.map((device) => onEdge(device, width)),
  };
}

/** A device pixel that differs from the rule. */
export interface ShimmerMismatch {
  readonly opacity: number;
  readonly column: number;
  readonly row: number;
  readonly onEdge: boolean;
  readonly drawn: boolean;
}

/**
 * Every device pixel of the readouts that differs from the rule; how many pixels were read and how many of them lie on an
 * edge line; and how many the rule draws differently from the shared rule (nonzero only for the device grid).
 */
export function compareReadouts(readouts: readonly Harness.ShimmerReadout[], width: number) {
  const height = bufferHeight(width);
  const mismatches: ShimmerMismatch[] = [];
  let pixels = 0;
  let edgePixels = 0;
  let deviceGrid = 0;
  const columns = axis(width, width, LOGICAL_WIDTH);
  const rows = axis(height, width, LOGICAL_HEIGHT);
  for (const { opacity, drawn } of readouts) {
    const bytes = Buffer.from(drawn, 'base64');
    if (bytes.length !== width * height) throw new Error(`read ${bytes.length} pixels of ${width} × ${height}`);
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const edge = columns.edges[column] || rows.edges[row];
        pixels++;
        if (edge) edgePixels++;
        const seen = bytes[row * width + column] === 1;
        const expected = doorDrawn(opacity, columns.cells[column], rows.cells[row]);
        // What the approved device grid must keep differing from below 640 wide.
        if (expected !== doorDrawn(opacity, columns.logical[column], rows.logical[row])) deviceGrid++;
        if (seen !== expected) mismatches.push({ opacity, column, row, onEdge: edge, drawn: seen });
      }
    }
  }
  return { mismatches, pixels, edgePixels, deviceGrid };
}

/** Draws the shell with the real hit shimmer layer in a `width`-wide buffer on the development page without the app. */
export async function drawShimmer(page: Page, width: number): Promise<{ gpu: string; readouts: Harness.ShimmerReadout[] }> {
  if (!page.url().endsWith('/e2e/entries/blank.html')) await page.goto('/e2e/entries/blank.html');
  return page.evaluate(async ({ harness, width, height }) => {
    const { drawScaledShimmer } = await (import(harness) as Promise<typeof Harness>);
    return drawScaledShimmer(width, height);
  }, { harness: '/src/render/flight/shimmer/shimmer-scaling.test-support.ts', width, height: bufferHeight(width) });
}
