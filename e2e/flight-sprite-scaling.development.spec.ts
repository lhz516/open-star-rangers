import { expect, test } from './support/audited-test.ts';
import { SCALING_ANIMATION } from '../src/render/flight/sprites/sprite-scaling.test-support.ts';
import { compareReadouts, drawPlacements, edgeLines, edgePlacements } from './support/flight-sprite-scaling.ts';

// P3-16/19 (docs/plan/p3/12/spec.md AC-05, AC-13, AC-16): the real explosion sprite layer in Chrome at drawing buffer
// widths where device pixel centres lie exactly on logical pixel edges, with its block edges and outer edges on those
// lines, at scales 1 to 3, drawing the middle of three distinct frames. Every read device pixel must show what the
// shared logical-pixel rule gives (support/flight-sprite-scaling.ts): the later pixel on an edge, as every other layer
// that enlarges logical pixels, and never a pixel of another frame. The synthetic frames are code-generated.

test.describe.configure({ timeout: 120_000 });

for (const width of [485, 576, 800, 960, 1066]) {
  test(`a sprite in a buffer ${width} wide shows the shared rule's logical pixel in every device pixel`, async ({ page }) => {
    expect(edgeLines(width, 640).length).toBeGreaterThan(0);
    const placements = edgePlacements(width);
    const { gpu, readouts } = await drawPlacements(page, width, placements);
    test.info().annotations.push({ type: 'gpu', description: gpu });
    expect(readouts).toHaveLength(placements.length);
    const { mismatches, pixels, edgePixels } = compareReadouts(readouts, width);
    test.info().annotations.push({ type: 'pixels', description: `${pixels} read, ${edgePixels} on an edge, ${placements.length} sprites` });
    expect(edgePixels).toBeGreaterThan(0);
    const count = (keep: (mismatch: (typeof mismatches)[number]) => boolean): number => mismatches.filter(keep).length;
    expect({
      offEdge: count(({ onEdge }) => !onEdge),
      onEdge: count(({ onEdge }) => onEdge),
      previousFrame: count(({ seenFrame }) => seenFrame === SCALING_ANIMATION.shown - 1),
      nextFrame: count(({ seenFrame }) => seenFrame === SCALING_ANIMATION.shown + 1),
      first: mismatches.slice(0, 5),
    }).toEqual({ offEdge: 0, onEdge: 0, previousFrame: 0, nextFrame: 0, first: [] });
  });
}
