/**
 * The pausing mission menu (docs/plan/p3/04/spec.md, 任务菜单、暂停与退出), the project's replacement for the original's
 * in-flight options and campaign settings (G-07): a page in place of the mission screen, opened only once the run is
 * paused. Continue resumes through the owner, which closes the menu only when that succeeded; restart begins a new
 * mission instance (G-06); return leaves for the main menu. Focus starts on the heading.
 */
import type { MissionOwner, MissionOwnerSnapshot } from '../../app/mission/mission-owner.ts';
import { useFocusOnMount } from '../pages/use-focus-on-mount.ts';
import { pauseText, resumeBlockedText } from './mission-copy.ts';
import { ActionErrorAlert, GapNote, SkeletonNote } from './MissionParts.tsx';

export interface MissionMenuPageProps {
  readonly snapshot: MissionOwnerSnapshot;
  readonly owner: Pick<MissionOwner, 'continueFromMenu' | 'restart'>;
  readonly onReturn: () => void;
}

export function MissionMenuPage({ snapshot, owner, onReturn }: MissionMenuPageProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const { session, actionError, cleanupFailure } = snapshot;
  const blocked = resumeBlockedText(session);
  return (
    <section aria-labelledby="mission-menu-heading" data-testid="mission-menu">
      <h2 id="mission-menu-heading" ref={heading} tabIndex={-1}>Mission menu</h2>
      <p role="status" data-testid="mission-menu-status">{pauseText(session) ?? 'The run is paused while this menu shows.'}</p>
      {blocked && <p id="mission-menu-resume-blocked">{blocked}</p>}
      <p className="mission-actions">
        <button
          type="button"
          disabled={blocked !== null}
          aria-describedby={blocked ? 'mission-menu-resume-blocked' : undefined}
          onClick={() => { owner.continueFromMenu(); }}
        >
          Continue
        </button>
        <button type="button" disabled={cleanupFailure !== null} onClick={() => { owner.restart(); }}>Restart mission</button>
        <button type="button" onClick={onReturn}>Return to main menu</button>
      </p>
      <ActionErrorAlert error={actionError} />
      <GapNote id="G-07" />
      <GapNote id="G-06" />
      <SkeletonNote />
    </section>
  );
}
