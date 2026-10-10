/**
 * The mission start page (docs/plan/p3/04/spec.md, 任务开始配置), the project's replacement for the original briefing and
 * wingman pages (G-04) and campaign settings (G-07): the mission's campaign group and slot, the fixed difficulty, the
 * objectives and limits as project text, and the wingman choice in roster order with "No wingman". Focus starts on the
 * heading, so a key held on the previous page reaches no button here. Start confirms through the owner directly from
 * the click; a confirmation that created no run shows why in an alert and leaves the page for a retry or the way back.
 * Once no retry can succeed (a latched cleanup failure, a changed package), only the way back stays enabled and takes
 * focus. The injected full screen request runs first within the same click (docs/plan/p3/05/spec.md, 全屏与 Keyboard
 * Lock), so the click's user activation still applies to it.
 */
import { useEffect, useId, useRef } from 'react';
import type { MissionOwner, MissionOwnerSnapshot } from '../../app/mission/mission-owner.ts';
import { useFocusOnMount } from '../pages/use-focus-on-mount.ts';
import { startWithGesture } from './input-notices.ts';
import { startFailureText, startRetryable, wingmanLabel } from './mission-copy.ts';
import { ActionErrorAlert, GapNote, GapNotes, SkeletonNote } from './MissionParts.tsx';
import { MISSION_OBJECTIVES } from './slice-gaps-copy.ts';

export interface StartConfigPageProps {
  readonly snapshot: MissionOwnerSnapshot;
  readonly owner: Pick<MissionOwner, 'select' | 'start'>;
  readonly onReturn: () => void;
  /** Requests document fullscreen for this start; called synchronously within the Start click, before the start. */
  readonly requestFullscreen?: () => void;
}

export function StartConfigPage({ snapshot, owner, onReturn, requestFullscreen }: StartConfigPageProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const objectivesId = useId();
  const radioName = useId();
  const returnButton = useRef<HTMLButtonElement>(null);
  const { config, flow, actionError, cleanupFailure } = snapshot;
  const failure = flow.startFailure && startFailureText(flow.startFailure);
  const blocked = cleanupFailure !== null || (flow.startFailure !== null && !startRetryable(flow.startFailure));
  useEffect(() => {
    if (blocked) returnButton.current?.focus();
  }, [blocked]);
  return (
    <section aria-labelledby="mission-config-heading" data-testid="mission-config">
      <h2 id="mission-config-heading" ref={heading} tabIndex={-1}>Mission start</h2>
      <SkeletonNote />
      <GapNote id="G-04" />
      <GapNote id="G-07" />
      <dl data-testid="mission-config-mission">
        <dt>Mission</dt>
        <dd>Campaign group {config.campaign.group}, slot {config.campaign.slot}</dd>
        <dt>Difficulty</dt>
        <dd data-testid="mission-config-difficulty">{config.rawDifficulty} (fixed, G-07)</dd>
      </dl>
      <section aria-labelledby={objectivesId} data-testid="mission-objectives" data-gap={MISSION_OBJECTIVES.gap}>
        <h3 id={objectivesId}>{MISSION_OBJECTIVES.title} ({MISSION_OBJECTIVES.gap})</h3>
        <p>{MISSION_OBJECTIVES.objective}</p>
        <p>{MISSION_OBJECTIVES.limits}</p>
        <p><strong>{MISSION_OBJECTIVES.status}</strong></p>
        <ul>{MISSION_OBJECTIVES.sources.map(source => <li key={source}>{source}</li>)}</ul>
      </section>
      <fieldset data-testid="mission-wingmen" disabled={blocked}>
        <legend>Wingman</legend>
        {config.wingmanOptions.map(option => (
          <label key={option.index} className="mission-choice">
            <input
              type="radio"
              name={radioName}
              value={option.index}
              data-wingman={option.index}
              checked={flow.selection === option.index}
              onChange={() => { owner.select(option.index); }}
            />
            {' '}{wingmanLabel(option)}
          </label>
        ))}
        <label className="mission-choice">
          <input type="radio" name={radioName} value="none" data-wingman="none" checked={flow.selection === null} onChange={() => { owner.select(null); }} />
          {' '}No wingman
        </label>
      </fieldset>
      {failure && (
        <div role="alert" className="failure-alert" data-testid="mission-start-failure" data-kind={flow.startFailure!.kind}>
          <p>{failure.text}</p>
          {failure.detail !== null && <pre>{failure.detail}</pre>}
        </div>
      )}
      <ActionErrorAlert error={actionError} />
      <p className="mission-actions">
        <button type="button" disabled={blocked} onClick={() => { startWithGesture(requestFullscreen, () => { owner.start(); }); }}>
          Start
        </button>
        <button ref={returnButton} type="button" onClick={onReturn}>Return to main menu</button>
      </p>
      <GapNotes ids={['G-01', 'G-02/1', 'G-02/2']} />
    </section>
  );
}
