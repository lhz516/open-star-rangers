/**
 * The summary selection of a successful pre-settlement (docs/plan/p3/02/spec.md, ME-05; docs/original/formats/scenario.md,
 * summary selection: rule meaning, P3-11; executable.md, all-clear and summary selection, P3-11/01): `0x69c54`'s part
 * after the result word, for the state 3→4 step only. It returns a reference to the matched range, never its text, which
 * the UI resolves from the imported content.
 */
import type { AssetId } from '../../content/asset-id.ts';
import type { EventTrigger } from '../../content/logic/logic-content.ts';
import type { MissionEventCounts, Settlement } from '../world/world-state.ts';

/** The selector byte when no range matched: the build's 0xFF as an i8. */
export const NO_SUMMARY_SELECTOR = -1;

/**
 * The scaled ratio of a trigger: destroyed ÷ instantiated × 100 in f64, in the original's instruction order, truncated
 * toward zero; 0 without instantiations (no division). World exits take no part. The counts are non-negative and at
 * most the run's instantiations, so the result fits an i32.
 */
export function summaryRatio({ instantiated, destroyed }: MissionEventCounts): number {
  return instantiated > 0 ? Math.trunc((destroyed / instantiated) * 100) : 0;
}

/**
 * The triggers in section order, skipping one whose instantiation and destruction counts are both 0; for each, the first
 * range in array order with lower ≤ ratio ≤ upper (signed). The first match gives the summary and its selector, even
 * when its messages are empty; without any, no summary and the selector −1. `counts` is as long as `triggers`.
 */
export function selectSummary(mission: AssetId, triggers: readonly EventTrigger[], counts: readonly MissionEventCounts[]): Pick<Settlement, 'summary' | 'summarySelector'> {
  for (const [trigger, { ranges }] of triggers.entries()) {
    const count = counts[trigger];
    if (count.instantiated === 0 && count.destroyed === 0) continue;
    const ratio = summaryRatio(count);
    const range = ranges.findIndex(({ lower, upper }) => lower <= ratio && ratio <= upper);
    if (range >= 0) return { summary: { mission, trigger, range }, summarySelector: ranges[range].summarySelector };
  }
  return { summary: null, summarySelector: NO_SUMMARY_SELECTOR };
}
