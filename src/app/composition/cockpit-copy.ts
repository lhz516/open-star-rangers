/**
 * The project copy the cockpit draws (docs/plan/p3/13/spec.md, 缺省与标注; D-01 定稿 DC-07, DC-09), injected through the
 * app's assembly so render never imports the UI's copy. The text itself is the UI's, in `slice-gaps-copy.ts`: each G-03
 * message's summary and page-5 label by its kind, the uncovered feedback for a message no kind covers, and the map's
 * `MAP_COST_UNAVAILABLE`. `summaries` and `labels` list every text `incoming` can return, so the cockpit content checks
 * all of them against the fonts before a run starts (`cockpitContentOf`); a violation is a copy contract error.
 */
import { MAP_COST_UNAVAILABLE, MESSAGE_SUMMARIES, messageLabel, messageSummary } from '../../ui/mission/slice-gaps-copy.ts';
import type { CockpitCopySource } from '../mission/cockpit-content.ts';

/** The cockpit's copy; see the module comment. */
export function cockpitCopy(): CockpitCopySource {
  const { text, label, uncovered } = MESSAGE_SUMMARIES;
  return Object.freeze({
    incoming: Object.freeze({
      summary: messageSummary,
      label: messageLabel,
      uncoveredSummary: uncovered.summary,
      uncoveredLabel: uncovered.label,
    }),
    summaries: Object.freeze(Object.values(text)),
    labels: Object.freeze(Object.values(label)),
    costUnavailable: MAP_COST_UNAVAILABLE,
  });
}
