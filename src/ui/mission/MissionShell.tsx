/**
 * The mission screen during flight and after a run ended (docs/plan/p3/04/spec.md: 应用流程, 任务菜单、暂停与退出): the
 * game view area, left for the flight view, cockpit and HUD of P3-12 and P3-13; the project status bar outside it with
 * the phase, the pause reason, why resume is unavailable and the missing music (G-01); pause, resume and mission menu
 * controls; and, once the run faulted or stopped, its reason without imported content, with restart (unless a cleanup
 * failed) and the way back. Focus starts on the heading.
 */
import type { MissionOwner, MissionOwnerSnapshot } from '../../app/mission/mission-owner.ts';
import { useFocusOnMount } from '../pages/use-focus-on-mount.ts';
import { describeStructure, pauseText, phaseText, resumeBlockedText } from './mission-copy.ts';
import { ActionErrorAlert, GapNote, GapNotes, SkeletonNote } from './MissionParts.tsx';
import { SLICE_GAPS } from './slice-gaps-copy.ts';

export interface MissionShellProps {
  readonly snapshot: MissionOwnerSnapshot;
  readonly owner: Pick<MissionOwner, 'pause' | 'resume' | 'openMenu' | 'restart'>;
  readonly onReturn: () => void;
}

function EndedNotice({ snapshot, owner, onReturn }: Pick<MissionShellProps, 'snapshot' | 'owner' | 'onReturn'>) {
  const { flow, session, cleanupFailure } = snapshot;
  const canRestart = cleanupFailure === null && flow.ended !== 'cleanup-failed';
  return (
    <div data-testid="mission-ended" data-ended={flow.ended}>
      <div role="alert" className="failure-alert">
        {flow.ended === 'stopped' && (
          <p>
            The run stopped: its development recording reached its capacity. The diagnostics panel can still export it;
            restarting or returning discards it.
          </p>
        )}
        {flow.ended === 'faulted' && <p>The run stopped on a fault and cannot continue.</p>}
        {flow.ended === 'cleanup-failed' && <p>Ending the run could not be cleaned up, so no new run can start.</p>}
        {session.error && <pre>{describeStructure(session.error)}</pre>}
      </div>
      <p className="mission-actions">
        {canRestart && <button type="button" onClick={() => { owner.restart(); }}>Restart mission</button>}
        <button type="button" onClick={onReturn}>Return to main menu</button>
      </p>
      {canRestart && <GapNote id="G-06" />}
    </div>
  );
}

export function MissionShell({ snapshot, owner, onReturn }: MissionShellProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const { session, flow, actionError } = snapshot;
  const paused = pauseText(session);
  const blocked = resumeBlockedText(session);
  const inFlight = flow.position === 'flight';
  return (
    <section aria-labelledby="mission-shell-heading" data-testid="mission-shell">
      <h2 id="mission-shell-heading" ref={heading} tabIndex={-1}>Mission</h2>
      <SkeletonNote />
      <div className="mission-view" data-testid="mission-view">
        <p>Game view: the flight view, cockpit and HUD are not implemented yet.</p>
      </div>
      <div className="mission-status-bar" data-testid="mission-status" data-phase={session.phase} data-pause={session.pauseReason ?? ''}>
        <span>Phase: {phaseText(session.phase)}</span>
        {paused && <span>{paused}</span>}
        {blocked && <span id="mission-resume-blocked">{blocked}</span>}
        <span data-gap="G-01">{SLICE_GAPS['G-01'].title} (G-01)</span>
      </div>
      {inFlight && (
        <p className="mission-actions">
          {/* One control that switches between pause and resume, so focus stays on it. */}
          {session.phase === 'paused' ? (
            <button
              type="button"
              disabled={blocked !== null}
              aria-describedby={blocked ? 'mission-resume-blocked' : undefined}
              onClick={() => { owner.resume(); }}
            >
              Resume
            </button>
          ) : (
            <button type="button" disabled={session.phase !== 'running'} onClick={() => { owner.pause(); }}>Pause</button>
          )}
          <button type="button" disabled={session.phase !== 'running' && session.phase !== 'paused'} onClick={() => { owner.openMenu(); }}>
            Mission menu
          </button>
        </p>
      )}
      <ActionErrorAlert error={actionError} />
      {flow.position === 'ended' && <EndedNotice snapshot={snapshot} owner={owner} onReturn={onReturn} />}
      <GapNotes ids={['G-01', 'G-02/1', 'G-02/2']} />
    </section>
  );
}
