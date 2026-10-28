/**
 * The zoom window's de-overlap `0x4b56c` (docs/original/formats/hud.md §4.9; P3-13 spec, 战略地图画面 and D-01 定稿
 * DC-09; MW-11 leaves it to the drawing): a different algorithm from the main map's `0x4b3a8`, which Core applies.
 * Only the drawing reads the moved pixels.
 *
 * The entries are the whole map icon list in order; only zoom members take part. For each member i ≥ 1 (entry 0 never
 * moves), the step is the record size + 2 and its box is centred on its pixel with halves truncated toward zero; the
 * scan visits j = 0 … n − 1 and, when member j ≠ i touches or overlaps i's box, moves i by its own counter from where
 * it is: cumulative offsets (+sx, +sy), (−sx, +sy), (−sx, −sy), (+sx, −sy), (+sx, 0), (0, +sy), (−sx, 0), (0, −sy),
 * then back to the original place, which ends i's scan. A position outside [0, width] × [0, height] tries the next step
 * at once; once the counter has run out it restores the original place, without recomputing i's box. Every move
 * restarts the scan at j = 0; with the counter run out an overlap no longer moves i nor advances the scan. A scan ends
 * after `COCKPIT_LIMITS.zoomComparisons` visits (each j, members or not). Pixels are 16-bit, as in the original.
 */
import { COCKPIT_LIMITS } from '../presentation/cockpit-limits.ts';
import { toInt16 } from '../raster/indexed-surface.ts';

/** One map icon entry; `width` and `height` are its zoom record's, read only for members. */
export interface ZoomEntry {
  readonly member: boolean;
  readonly width: number;
  readonly height: number;
  /** The zoom pixel relative to the zoom window's origin; replaced in place. */
  x: number;
  y: number;
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const LAST_STEP = 8;

/** The cumulative offset of step c in units of (sx, sy), so step c moves by STEPS[c] − STEPS[c − 1]. */
const STEPS: readonly (readonly [number, number])[] = [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [0, -1], [0, 0]];

function boxOf({ x, y, width, height }: ZoomEntry): Box {
  const [halfWidth, halfHeight] = [Math.trunc(width / 2), Math.trunc(height / 2)];
  return { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight };
}

const overlaps = (a: Box, b: Box): boolean => !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);

/** Spreads the members of `entries` inside a zoom window of `width` × `height` pixels, in place. */
export function spreadZoomIcons(entries: readonly ZoomEntry[], width: number, height: number): void {
  const count = entries.length;
  for (let i = 1; i < count; i++) {
    const entry = entries[i];
    if (!entry.member) continue;
    const [stepX, stepY] = [entry.width + 2, entry.height + 2];
    const original = { x: entry.x, y: entry.y };
    let box = boxOf(entry);
    let counter = 0;
    for (let j = 0, visits = 0; j < count;) {
      const other = entries[j];
      if (j === i || !other.member || !overlaps(box, boxOf(other))) j++;
      else {
        for (;;) {
          const step = counter++;
          if (step <= LAST_STEP) {
            const [from, to] = [step === 0 ? [0, 0] : STEPS[step - 1], STEPS[step]];
            entry.x = toInt16(entry.x + (to[0] - from[0]) * stepX);
            entry.y = toInt16(entry.y + (to[1] - from[1]) * stepY);
            j = step === LAST_STEP ? count : 0;
          }
          if (entry.x >= 0 && entry.x <= width && entry.y >= 0 && entry.y <= height) {
            box = boxOf(entry);
            break;
          }
          if (counter > LAST_STEP) {
            [entry.x, entry.y] = [original.x, original.y];
            break;
          }
        }
      }
      if (++visits > COCKPIT_LIMITS.zoomComparisons) j = count;
    }
  }
}
