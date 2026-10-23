/**
 * The G-06 result page's view (docs/plan/p3/11/spec.md: 结果页、重试与返回, 缺省与标注; docs/plan/p3/04/spec.md, 终局与救援衔接
 * （P3-11 的修订）: 结果页): the frozen result the session published through the bridge, in project words, with the summary
 * resolved from the bound package. DOM-free, so Node tests read it. The summary text is the only imported text; it is
 * returned as a string for a text node, never markup.
 */
import type { MissionTexts, SummaryText } from '../../app/resources/mission-texts.ts';
import type { SessionResult } from '../../app/session/game-session.ts';
import type { GameUiState } from '../game/game-store.ts';
import { describeStructure } from './mission-copy.ts';
import { RESULT_PAGE, resultReason } from './slice-gaps-copy.ts';

/** How the summary shows: imported text, a note why there is none, or why it could not be read. */
export type ResultSummaryView =
  | { readonly state: 'text'; readonly text: string }
  | { readonly state: 'empty' | 'none' | 'failure'; readonly note: string }
  | { readonly state: 'failed'; readonly note: string; readonly detail: string | null };

export interface ResultPageView {
  readonly outcome: SessionResult['outcome'];
  /** The outcome in words, with a mark that repeats it, so it does not rest on colour. */
  readonly heading: string;
  readonly outcomeText: string;
  readonly reason: string;
  /** The reason as a data attribute: its type, and a third loss's kind. */
  readonly reasonKey: string;
  readonly rescues: string;
  readonly kills: number;
  readonly summary: ResultSummaryView;
}

/** The session's frozen result, as the bridge published it; null outside the completed phase. */
export const selectSessionResult = (state: GameUiState): SessionResult | null => state.status?.result ?? null;

const { summary: SUMMARY } = RESULT_PAGE;

/** The summary's view from the text its reference resolved to. */
export function summaryView(result: Pick<SessionResult, 'outcome' | 'summary'>, text: SummaryText): ResultSummaryView {
  if (result.summary === null) return result.outcome === 'failure' ? { state: 'failure', note: SUMMARY.failure } : { state: 'none', note: SUMMARY.none };
  switch (text.status) {
    case 'none':
      return { state: 'none', note: SUMMARY.none };
    case 'resolved':
      return text.text.length === 0 ? { state: 'empty', note: SUMMARY.empty } : { state: 'text', text: text.text };
    case 'failed': {
      const { failure } = text;
      switch (failure.kind) {
        case 'mission-mismatch':
          return { state: 'failed', note: `${SUMMARY.failed} ${SUMMARY.mismatch}`, detail: null };
        case 'out-of-range':
          return { state: 'failed', note: `${SUMMARY.failed} ${SUMMARY.outOfRange(failure.field, failure.index, failure.count)}`, detail: null };
        case 'content':
          return { state: 'failed', note: `${SUMMARY.failed} ${SUMMARY.content}`, detail: describeStructure(failure.cause) };
      }
    }
  }
}

/** The result page's view of `result`, its summary resolved by `texts`. */
export function resultPageView(result: SessionResult, texts: Pick<MissionTexts, 'summary'>): ResultPageView {
  const { outcome, reason, rescuesUsed, playerKills } = result;
  const outcomeText = RESULT_PAGE.outcome[outcome];
  return {
    outcome,
    heading: `${RESULT_PAGE.title}: ${RESULT_PAGE.mark[outcome]} ${outcomeText}`,
    outcomeText,
    reason: resultReason(reason),
    reasonKey: reason.type === 'third-loss' ? `third-loss:${reason.loss}` : reason.type,
    rescues: RESULT_PAGE.attempt.rescuesOf(rescuesUsed),
    kills: playerKills,
    summary: summaryView(result, texts.summary(result.summary)),
  };
}
