import type { Page } from '@playwright/test';
import { SCALING_ANIMATION, scalingIndex, scalingOpaque, type SpritePlacement, type SpriteReadout } from '../../src/render/flight/sprites/sprite-scaling.test-support.ts';
import type * as Harness from '../../src/render/flight/sprites/sprite-scaling.test-support.ts';

// P3-16/19 (docs/plan/p3/12/spec.md AC-05, AC-13, AC-16; technical decisions 3, 4): what a scaled explosion sprite must
// show in every device pixel, computed here from the shared logical-pixel rule, not by the renderer's modules: a device
// pixel shows the logical pixel whose [x·s, (x + 1)·s) holds its centre, the later one when the centre lies exactly on
// an edge (logical-screen.ts LOGICAL_PIXEL_GLSL), and that logical pixel shows its block's frame pixel of the shown frame.

const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 480;
/** The F1 viewport's bottom; a block is drawn only above bottom − s (FC8). */
const VIEWPORT_BOTTOM = 315;
/** Device pixels read around a sprite's blocks: more than the one logical pixel its quad extends past them. */
const MARGIN = 4;

/** The buffer height of the 4:3 layout for a buffer `width` wide. */
export const bufferHeight = (width: number): number => Math.round((width * 3) / 4);

/** The logical pixel of device pixel `device` along an axis, as an exact rational: ⌊(2d + 1) · 320 ÷ W⌋. */
const logicalOf = (device: number, width: number, size: number): number => Math.min(size - 1, Math.floor(((2 * device + 1) * 320) / width));

/** Whether device pixel `device`'s centre lies exactly on a logical pixel edge. */
const onEdge = (device: number, width: number): boolean => ((2 * device + 1) * 320) % width === 0;

/** The logical edges b, from 1 to `size` − 1, on which some device pixel's centre lies exactly: b·W ÷ 320 is odd. */
export const edgeLines = (width: number, size: number): number[] =>
  Array.from({ length: size - 1 }, (_, at) => at + 1).filter((b) => (b * width) % 320 === 0 && ((b * width) / 320) % 2 === 1);

/**
 * Sprites at scales 1 to 3 with their left, interior and right block edges on edge columns, and their top, interior and
 * bottom edges on edge rows, every block drawn; and at each scale four sprites clipped at the screen's left and right and
 * the viewport's top and bottom, with an interior edge on an edge line.
 */
export function edgePlacements(width: number): SpritePlacement[] {
  const { width: w, height: h } = SCALING_ANIMATION;
  const pick = (lines: readonly number[]): number[] => [...new Set([lines[Math.floor(lines.length / 2)], lines[Math.floor(lines.length / 3)]])];
  const columns = pick(edgeLines(width, LOGICAL_WIDTH).filter((b) => b > 3 * w && b < LOGICAL_WIDTH - 3 * w));
  const rows = pick(edgeLines(width, LOGICAL_HEIGHT).filter((b) => b > 3 * h && b < VIEWPORT_BOTTOM - 4 * h));
  const placements: SpritePlacement[] = [];
  for (const s of [1, 2, 3]) {
    for (const column of columns) for (const row of rows) {
      for (const kx of [0, 1, 2, 5, w]) for (const ky of [0, 1, 3, h]) placements.push({ s, left: column - s * kx, top: row - s * ky });
    }
    placements.push(
      { s, left: -s - 1, top: rows[0] - s },
      { s, left: LOGICAL_WIDTH + 1 - s * w, top: rows[0] - s },
      { s, left: columns[0] - s, top: -s - 1 },
      { s, left: columns[0] - s, top: VIEWPORT_BOTTOM + s - s * h },
    );
  }
  return placements;
}

/** A device pixel that differs from the rule. */
export interface SpriteMismatch {
  readonly placement: SpritePlacement;
  readonly column: number;
  readonly row: number;
  readonly onEdge: boolean;
  readonly seen: number;
  readonly expected: number;
  /** The frame the seen red belongs to, when it is a frame pixel's. */
  readonly seenFrame: number | null;
}

const frameOfIndex = (index: number): number | null => (index === 0 ? null : Math.floor((index - 1) / (SCALING_ANIMATION.width * SCALING_ANIMATION.height)));

/**
 * The red device pixel (column, row) must show for a sprite placed at `placement`: its frame pixel's index, or 0. A block
 * at (x, y) is drawn only when x ≥ 0, x + s < 640, y ≥ 0 and y < bottom − s (FC8).
 */
export function expectedRed({ s, left, top }: SpritePlacement, column: number, row: number, width: number): number {
  const x = logicalOf(column, width, LOGICAL_WIDTH);
  const y = logicalOf(row, width, LOGICAL_HEIGHT);
  const { width: w, height: h, shown } = SCALING_ANIMATION;
  if (x < left || y < top || x >= left + w * s || y >= top + h * s) return 0;
  const i = Math.floor((x - left) / s);
  const j = Math.floor((y - top) / s);
  const [blockX, blockY] = [left + s * i, top + s * j];
  if (blockX < 0 || blockX + s >= LOGICAL_WIDTH || blockY < 0 || blockY >= VIEWPORT_BOTTOM - s) return 0;
  return scalingOpaque(i, j) ? scalingIndex(shown, i, j) : 0;
}

/** Every device pixel of the readouts that differs from the rule, and how many read pixels lie on an edge. */
export function compareReadouts(readouts: readonly SpriteReadout[], width: number): { mismatches: SpriteMismatch[]; pixels: number; edgePixels: number } {
  const mismatches: SpriteMismatch[] = [];
  let pixels = 0;
  let edgePixels = 0;
  for (const { region, red, ...placement } of readouts) {
    const bytes = Buffer.from(red, 'base64');
    for (let r = 0; r < region.height; r++) {
      for (let c = 0; c < region.width; c++) {
        const column = region.x + c;
        const row = region.y + r;
        const edge = onEdge(column, width) || onEdge(row, width);
        pixels++;
        if (edge) edgePixels++;
        const seen = bytes[r * region.width + c];
        const expected = expectedRed(placement, column, row, width);
        if (seen !== expected) mismatches.push({ placement, column, row, onEdge: edge, seen, expected, seenFrame: frameOfIndex(seen) });
      }
    }
  }
  return { mismatches, pixels, edgePixels };
}

/** Draws `placements` with the real sprite layer in a `width`-wide buffer on the development page without the app. */
export async function drawPlacements(page: Page, width: number, placements: readonly SpritePlacement[]): Promise<{ gpu: string; readouts: SpriteReadout[] }> {
  if (!page.url().endsWith('/e2e/entries/blank.html')) await page.goto('/e2e/entries/blank.html');
  return page.evaluate(async ({ harness, width, height, placements, margin }) => {
    const { drawScaledSprites } = await (import(harness) as Promise<typeof Harness>);
    return drawScaledSprites(width, height, placements, margin);
  }, { harness: '/src/render/flight/sprites/sprite-scaling.test-support.ts', width, height: bufferHeight(width), placements, margin: MARGIN });
}
