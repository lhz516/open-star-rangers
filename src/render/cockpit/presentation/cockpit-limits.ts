/**
 * The cockpit presentation's limits (docs/plan/p3/13/spec.md, D-01 定稿 DC-08). Every general limit is checked before
 * the allocation or advance it bounds and is a `presentation-capacity` failure of the consumer; the message queue (drop
 * the new item, Δ-05), the Warp trail (shift) and the radar (keep the first 120, count the rest) apply their own policy
 * instead. A batch beyond `ticksPerAdvance` ticks or `eventsPerTick` events is `invalid-input`.
 */
import { CORE_LIMITS } from '../../../core/contracts/limits.ts';
import { PresentationError } from '../../flight/presentation/presentation-budget.ts';

export { checkCapacity, PresentationError, type PresentationErrorKind } from '../../flight/presentation/presentation-budget.ts';

export const COCKPIT_LIMITS = Object.freeze({
  /** P3-04 `MAX_TICKS_PER_FRAME`. */
  ticksPerAdvance: 5,
  eventsPerTick: CORE_LIMITS.eventsPerTick,
  /** B and S (DC-05). */
  surface: Object.freeze({ width: 640, height: 480 }),
  /** The left display's status picture (DC-06). */
  statusPicture: Object.freeze({ width: 96, height: 100 }),
  /** Decoded indexed pixels the run's cockpit keeps on the CPU. */
  imagePixels: 2 ** 20,
  /** Message line (DC-07): queued items, bytes per item, total text bytes. */
  messages: 64,
  messageBytes: 128,
  messageTextBytes: 8_192,
  /** G-03 summary bytes (DC-07). */
  summaryBytes: 58,
  /** Warp trail history entries (`+0x4C`). */
  warpTrail: 94,
  /** Radar entries (P3-02 CR-11, 差异 7). */
  radarEntries: 120,
  leftPages: 7,
  /** DIAG formatted text, from the original's 80-byte stack buffer. */
  diagBytes: 79,
  /** Comparisons per map zoom-window icon placement. */
  zoomComparisons: 10_000,
  /**
   * GPU plan: texels and render targets. The right display draws on a CPU device (D-01 revision, 20), so the cockpit
   * allocates no render target and no depth attachment.
   */
  gpuTexels: 2 ** 19,
  renderTargets: 0,
});

/** Before decoding `images`: `presentation-capacity` when their indexed pixels would exceed `imagePixels`. */
export function checkImagePixels(images: readonly { readonly width: number; readonly height: number }[], path: string): void {
  let pixels = 0;
  for (const { width, height } of images) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 0 || height < 0) {
      throw new PresentationError('invalid-input', path, 'needs non-negative integer image sizes');
    }
    pixels += width * height;
    if (pixels > COCKPIT_LIMITS.imagePixels) throw new PresentationError('presentation-capacity', path, `must not exceed ${COCKPIT_LIMITS.imagePixels} indexed pixels`);
  }
}
