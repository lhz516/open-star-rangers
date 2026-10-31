import { expect, test } from './support/audited-test.ts';
import { compareReadouts, drawShimmer } from './support/flight-shimmer-scaling.ts';

// P3-16/24 (docs/plan/p3/12/spec.md AC-05, AC-08, AC-16): the real hit shimmer layer in Chrome at drawing buffer widths
// where device pixel centres lie exactly on logical pixel edges, with one synthetic shell covering the whole game image
// at opacities 0xFF and 0x7F. Every device pixel must be drawn exactly as the screen door cell of the shared
// logical-pixel rule decides (support/flight-shimmer-scaling.ts), the later pixel on an edge as every other layer that
// enlarges logical pixels; buffers narrower than 640 keep the approved device grid. The shell is code-generated.

test.describe.configure({ timeout: 120_000 });

for (const width of [485, 576, 800, 960, 1066]) {
  test(`the screen door in a buffer ${width} wide takes the shared rule's cell in every device pixel`, async ({ page }) => {
    const { gpu, readouts } = await drawShimmer(page, width);
    test.info().annotations.push({ type: 'gpu', description: gpu });
    expect(readouts.map(({ opacity }) => opacity)).toEqual([0xff, 0x7f]);
    const { mismatches, pixels, edgePixels, deviceGrid } = compareReadouts(readouts, width);
    test.info().annotations.push({ type: 'pixels', description: `${pixels} read, ${edgePixels} on an edge, ${deviceGrid} on the device grid apart from the shared rule` });
    if (width < 640) expect(deviceGrid).toBeGreaterThan(0);
    else expect([edgePixels > 0, deviceGrid]).toEqual([true, 0]);
    const count = (keep: (mismatch: (typeof mismatches)[number]) => boolean): number => mismatches.filter(keep).length;
    expect({
      full: count(({ opacity }) => opacity === 0xff),
      offEdge: count(({ onEdge }) => !onEdge),
      onEdge: count(({ onEdge }) => onEdge),
      first: mismatches.slice(0, 5),
    }).toEqual({ full: 0, offEdge: 0, onEdge: 0, first: [] });
  });
}
