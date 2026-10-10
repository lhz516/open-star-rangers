/**
 * The main menu: the original-data status from the resource holder and the entries. A modern web page, not the
 * original game's menu (G-07). The mission entry is enabled only while the start eligibility admits it, and otherwise
 * says why; it opens the formal runtime skeleton, and nothing here claims the original gameplay is playable.
 * Contracts: docs/plan/p1/08/spec.md, docs/plan/p2/11/spec.md (S-01, S-04, 状态阶梯), docs/plan/p3/04/spec.md (开始资格).
 */
import { useEffect, useRef } from 'react';
import type { AppFocusTarget } from '../../app/flow/app-flow.ts';
import type { MissionEligibility } from '../../app/mission/mission-eligibility.ts';
import type { ResourceHolderSnapshot } from '../../app/resources/resource-holder.ts';
import { unsavedCache } from '../../app/resources/resource-status.ts';
import { cacheFailureCopy } from '../import/failure-copy.ts';
import { FailureNotice } from '../import/FailureNotice.tsx';
import { catalogText } from '../import/resource-copy.ts';
import { ResourceStatusList } from '../import/ResourceStatusList.tsx';
import { eligibilityReason, MISSION_SKELETON } from '../mission/mission-copy.ts';
import { GapNote } from '../mission/MissionParts.tsx';
import { isHeldActivation } from '../mission/page-keys.ts';

export interface MainMenuPageProps {
  /** Where to put focus when the menu appears or the target changes; null leaves focus alone. */
  readonly focusTarget: AppFocusTarget | null;
  /** Whether the mission may start, or why not; null until the resource holder exists. */
  readonly mission: MissionEligibility | null;
  /** A viewer release failure is latched, so the viewer cannot be opened. */
  readonly viewerBlocked: boolean;
  /** The resource holder's snapshot; null until the holder exists. */
  readonly resources: ResourceHolderSnapshot | null;
  readonly onStartMission: () => void;
  readonly onOpenImport: () => void;
  readonly onOpenViewer: () => void;
  /** Starts restoring the saved resources; false when none can be restored now. */
  readonly onRestore: () => boolean;
  readonly onSave: () => void;
}

export function MainMenuPage({
  focusTarget, mission, viewerBlocked, resources, onStartMission, onOpenImport, onOpenViewer, onRestore, onSave,
}: MainMenuPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const missionEntry = useRef<HTMLButtonElement>(null);
  const importEntry = useRef<HTMLButtonElement>(null);
  const viewerEntry = useRef<HTMLButtonElement>(null);
  /** Set while a restore started from its entry runs; when it holds a package, focus moves to the viewer entry that replaces it. */
  const restoreFocus = useRef(false);
  const held = resources?.package ?? null;
  const catalog = resources?.catalog ?? null;
  const restore = resources?.restore ?? null;
  const missionBlocked = mission?.status !== 'eligible';
  useEffect(() => {
    if (!focusTarget) return;
    // A disabled mission entry cannot take focus, so the heading takes it instead.
    const target = focusTarget === 'mission-entry' && missionEntry.current?.disabled !== false ? 'menu-heading' : focusTarget;
    ({ 'mission-entry': missionEntry, 'import-entry': importEntry, 'viewer-entry': viewerEntry, 'menu-heading': heading })[target].current?.focus();
  }, [focusTarget]);
  const restoring = restore?.status === 'restoring';
  useEffect(() => {
    if (!restoreFocus.current || restoring) return;
    restoreFocus.current = false;
    if (held !== null) viewerEntry.current?.focus();
  }, [held, restoring]);
  const restorable = held === null && catalog?.status === 'listed' && catalog.restorable !== null;
  const unsaved = unsavedCache(held);
  return (
    <section aria-labelledby="main-menu-heading">
      <h2 id="main-menu-heading" ref={heading} tabIndex={-1}>Main menu</h2>
      <p data-testid="original-data-status">
        <strong>Original game data:</strong> {held === null ? catalogText(catalog) : 'Resources are held in this page.'}
      </p>
      {held !== null && resources && <ResourceStatusList resources={resources} testId="resource-statuses" />}
      {catalog?.status === 'unavailable' && !(held?.cache.status === 'not-saved' && held.cache.failure === catalog.failure) && (
        <FailureNotice testId="storage-failure" copy={cacheFailureCopy(catalog.failure)} />
      )}
      {restoring && <p role="status">Restoring and verifying the saved resources…</p>}
      {restore?.status === 'failed' && (
        <FailureNotice testId="restore-failure" copy={cacheFailureCopy(restore.failure)} durationMs={restore.durationMs} />
      )}
      {unsaved?.status === 'not-saved' && unsaved.failure !== null && (
        <FailureNotice testId="save-failure" copy={cacheFailureCopy(unsaved.failure)} durationMs={unsaved.durationMs} />
      )}
      <ul className="menu-entries">
        <li>
          <button
            ref={missionEntry}
            type="button"
            disabled={missionBlocked}
            aria-describedby="mission-entry-description"
            data-eligibility={mission?.status ?? 'checking'}
            // A key held since the mission screen's return, whose repeats reach this entry, must not reopen the mission.
            onKeyDown={event => { if (isHeldActivation(event)) event.preventDefault(); }}
            onClick={onStartMission}
          >
            Start mission
          </button>
          <div id="mission-entry-description">
            <p>Opens the project start page of the first campaign mission from the imported resources. {MISSION_SKELETON}</p>
            {missionBlocked && (
              <p data-testid="mission-entry-reason">
                Not available now. {mission ? eligibilityReason(mission) : 'Checking the resources in this page.'}
              </p>
            )}
            <GapNote id="G-07" />
          </div>
        </li>
        <li>
          <button ref={importEntry} type="button" aria-describedby="import-entry-description" onClick={onOpenImport}>
            Import original game data
          </button>
          <p id="import-entry-description">Select the CloneCD files of your own disc; they are read and converted only in this browser.</p>
        </li>
        {held !== null && (
          <li>
            <button ref={viewerEntry} type="button" disabled={viewerBlocked} aria-describedby="viewer-entry-description" onClick={onOpenViewer}>
              View resources
            </button>
            <p id="viewer-entry-description">
              Inspect the resources held in this page.
              {viewerBlocked && ' Unavailable: an earlier viewer cleanup failed, so the viewer cannot be opened until the page is reloaded.'}
            </p>
          </li>
        )}
        {restorable && (
          <li>
            <button
              type="button"
              disabled={restoring}
              aria-describedby="restore-entry-description"
              onClick={() => { restoreFocus.current = onRestore(); }}
            >
              Open saved resources
            </button>
            <p id="restore-entry-description">Reads the resources saved in this browser and verifies them again.</p>
          </li>
        )}
        {unsaved !== null && (
          <li>
            <button type="button" disabled={unsaved.status === 'saving'} aria-describedby="save-entry-description" onClick={onSave}>
              Save again
            </button>
            <p id="save-entry-description">Saves the held resources in this browser.</p>
          </li>
        )}
      </ul>
    </section>
  );
}
