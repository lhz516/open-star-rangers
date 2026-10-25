/**
 * The G-06 result page (docs/plan/p3/11/spec.md: 结果页、重试与返回, 勋章、统计与战役进度; docs/plan/p3/04/spec.md, 终局与救援衔接
 * （P3-11 的修订）: 结果页, 焦点): a project page in place of the original's statistics, replay choice, high-score list,
 * promotions and medals. It reads the session's frozen result from the owner's store, which the bridge published at the
 * completion, never Core, and shows the outcome in words and a mark, the rule that decided it, this attempt's rescues and
 * kills as a project summary, and the mission summary resolved from the package the run was started from, as a text
 * node. The result, the reason and the summary sit in the 4:3 view; restart and return follow it. Focus moves to the
 * heading as the page mounts on a visible page, and stays where it is on a hidden one.
 */
import { useEffect, useId, useMemo, useRef } from 'react';
import type { MissionOwner, MissionOwnerSnapshot } from '../../app/mission/mission-owner.ts';
import type { MissionTexts } from '../../app/resources/mission-texts.ts';
import type { GameStoreReader } from '../game/game-store.ts';
import { useGame } from '../game/use-game.ts';
import { ActionErrorAlert, GapNotes, SkeletonNote } from './MissionParts.tsx';
import { resultPageView, selectSessionResult, type ResultSummaryView } from './result-page.ts';
import { RESULT_PAGE } from './slice-gaps-copy.ts';

export interface ResultPageProps {
  readonly snapshot: Pick<MissionOwnerSnapshot, 'actionError' | 'cleanupFailure'>;
  readonly owner: Pick<MissionOwner, 'restart'>;
  readonly onReturn: () => void;
  /** The owner's UI store, which holds the session's frozen result. */
  readonly game: GameStoreReader;
  /** The imported texts of the package the owner bound. */
  readonly texts: MissionTexts;
}

function Summary({ view }: { readonly view: ResultSummaryView }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-testid="mission-result-summary" data-summary={view.state}>
      <h3 id={headingId}>{RESULT_PAGE.summary.title}</h3>
      <SummaryBody view={view} />
    </section>
  );
}

function SummaryBody({ view }: { readonly view: ResultSummaryView }) {
  const source = <p className="result-note">{RESULT_PAGE.summary.source}</p>;
  switch (view.state) {
    case 'text':
      return <><p className="result-summary-text" data-testid="mission-result-summary-text">{view.text}</p>{source}</>;
    case 'empty':
      return <><p>{view.note}</p>{source}</>;
    case 'none':
    case 'failure':
      return <p>{view.note}</p>;
    case 'failed':
      return (
        <div role="alert" className="failure-alert" data-testid="mission-result-summary-failure">
          <p>{view.note}</p>
          {view.detail !== null && <pre>{view.detail}</pre>}
        </div>
      );
  }
}

export function ResultPage({ snapshot, owner, onReturn, game, texts }: ResultPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const attemptId = useId();
  const result = useGame(game, selectSessionResult);
  const view = useMemo(() => (result === null ? null : resultPageView(result, texts)), [result, texts]);
  useEffect(() => {
    if (document.visibilityState === 'visible') heading.current?.focus();
    // Once, as the page mounts.
  }, []);
  const { actionError, cleanupFailure } = snapshot;
  return (
    <section
      aria-labelledby="mission-result-heading"
      data-testid="mission-result"
      data-outcome={view?.outcome ?? ''}
      data-reason={view?.reasonKey ?? ''}
    >
      <h2 id="mission-result-heading" ref={heading} tabIndex={-1}>{view?.heading ?? RESULT_PAGE.title}</h2>
      <div className="mission-view result-view" data-testid="mission-result-view">
        {view === null ? <p role="status">{RESULT_PAGE.pending}</p> : (
          <div className="result-page">
            <p className="result-outcome" data-testid="mission-result-outcome">
              <strong>{RESULT_PAGE.mark[view.outcome]} {view.outcomeText}</strong>
            </p>
            <p data-testid="mission-result-reason"><strong>{RESULT_PAGE.reasonLabel}:</strong> {view.reason}</p>
            <Summary view={view.summary} />
            <section aria-labelledby={attemptId} data-testid="mission-result-attempt">
              <h3 id={attemptId}>{RESULT_PAGE.attempt.title}</h3>
              <dl className="result-attempt">
                <dt>{RESULT_PAGE.attempt.rescues}</dt>
                <dd data-testid="mission-result-rescues">{view.rescues}</dd>
                <dt>{RESULT_PAGE.attempt.kills}</dt>
                <dd data-testid="mission-result-kills">{view.kills}</dd>
              </dl>
              <p className="result-note">{RESULT_PAGE.attempt.note}</p>
            </section>
          </div>
        )}
      </div>
      <p className="mission-actions">
        <button type="button" disabled={cleanupFailure !== null} onClick={() => { owner.restart(); }}>{RESULT_PAGE.restart}</button>
        <button type="button" onClick={onReturn}>{RESULT_PAGE.return}</button>
      </p>
      <ActionErrorAlert error={actionError} />
      <GapNotes ids={RESULT_PAGE.disclosures} />
      <SkeletonNote />
    </section>
  );
}
