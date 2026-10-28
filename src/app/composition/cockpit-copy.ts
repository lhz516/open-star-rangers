/**
 * The project copy the cockpit draws (docs/plan/p3/13/spec.md, 缺省与标注; D-01 定稿 DC-07, DC-09), injected through the
 * app's assembly so render never imports the UI's copy. The text itself belongs to `slice-gaps-copy.ts`.
 *
 * Interim until P3-13/25 defines the final copy there: a summary is the G-03 project summary of the message's kind
 * (`messageSummary`) only where that text already keeps DC-07's limits (at most 58 printable bytes, no `{`); the
 * unidentified kind, every summary still too long and every page-5 label show the modules' explicit uncovered
 * feedback, which names the gap, G-03. `costUnavailable` (`MAP_COST_UNAVAILABLE`) is likewise interim. 25 replaces
 * all of these, and the checks before a run starts apply to whatever is given here.
 */
import type { MessageIdentity } from '../../core/world/world-state.ts';
import { MESSAGE_SUMMARIES, messageSummary, messageSummaryKind } from '../../ui/mission/slice-gaps-copy.ts';
import type { CockpitCopySource } from '../mission/cockpit-content.ts';

/** DC-07: at most 58 bytes of 0x20–0x7E without 0x7B. */
const fitsMessageLine = (text: string): boolean => text.length <= 58 && /^[\x20-\x7a\x7c-\x7e]+$/.test(text);

/** The gap the uncovered feedback stands for. */
const UNCOVERED = MESSAGE_SUMMARIES.gap;

/** The cockpit's copy; see the module comment. */
export function cockpitCopy(): CockpitCopySource {
  const covered = (message: MessageIdentity): boolean => messageSummaryKind(message) !== 'unidentified' && fitsMessageLine(messageSummary(message));
  return Object.freeze({
    incoming: Object.freeze({
      summary: (message: MessageIdentity) => (covered(message) ? messageSummary(message) : null),
      label: () => null,
      uncoveredSummary: UNCOVERED,
      uncoveredLabel: Object.freeze([UNCOVERED]),
    }),
    summaries: Object.freeze(Object.entries(MESSAGE_SUMMARIES.text).filter(([kind, text]) => kind !== 'unidentified' && fitsMessageLine(text)).map(([, text]) => text)),
    labels: Object.freeze([]),
    costUnavailable: 'N/A',
  });
}
