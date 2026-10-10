/**
 * The application shell: the title, the page flow and the current screen, built from the ports its entry passes. It
 * owns the mission slot, so a mission cleanup failure stays latched across screens and Fast Refresh of the pages, and
 * its cause stays visible without the owner; and the resource holder, which outlives every screen, lists the cache
 * again on each return to the menu and is disposed only after the mission slot released its owner. Contracts:
 * docs/plan/p1/08/spec.md, docs/plan/p2/11/spec.md, docs/plan/p3/04/spec.md (应用流程, 开始资格).
 */
import { useState, type ReactNode } from 'react';
import { describeError } from '../ui/game/describe-error.ts';
import { MainMenuPage } from '../ui/pages/MainMenuPage.tsx';
import { createMissionSlot } from './composition/mission-slot.ts';
import { useResourceHolder } from './composition/use-resource-holder.ts';
import { ImportScreen } from './ImportScreen.tsx';
import { INITIAL_APP_FLOW, nextAppFlow, type AppFlowInput, type AppFlowState } from './flow/app-flow.ts';
import { missionEligibility } from './mission/mission-eligibility.ts';
import { MissionScreen } from './MissionScreen.tsx';
import type { AppPorts } from './ports.ts';
import type { ResourceHolder } from './resources/resource-holder.ts';
import { createViewerLifecycle } from './viewer/viewer-owner.ts';
import { ViewerScreen } from './ViewerScreen.tsx';

/** A failure the shell reports itself, with its original cause. */
function FailureAlert({ testId, children, cause }: { readonly testId: string; readonly children: ReactNode; readonly cause: unknown }) {
  return (
    <div role="alert" data-testid={testId} className="failure-alert">
      <p>{children}</p>
      <pre>{describeError(cause)}</pre>
    </div>
  );
}

export function App({ ports }: { readonly ports: AppPorts }) {
  const [flow, setFlow] = useState<AppFlowState>(INITIAL_APP_FLOW);
  /** Why the mission could not be opened, such as exhausted visits; shown instead of entering it. */
  const [openFailure, setOpenFailure] = useState<{ readonly cause: unknown } | null>(null);
  /** Set when replacing the resource package closed the mission; shown on the menu until the mission opens again. */
  const [packageReplaced, setPackageReplaced] = useState(false);
  const go = (input: AppFlowInput): void => { setFlow(state => nextAppFlow(state, input)); };
  const [slot] = useState(() => createMissionSlot({
    onCleanupFailure: cause => { setFlow(state => nextAppFlow(state, { type: 'mission-release-failed', cause })); },
    reportError: ports.reportError,
    // The slot has released the owner, latching any failure first; the menu says why the mission closed.
    onPackageReplaced: () => {
      setPackageReplaced(true);
      setFlow(state => nextAppFlow(state, { type: 'return-to-menu' }));
    },
  }));
  const { holder, snapshot } = useResourceHolder(ports, slot);
  const [viewerLifecycle] = useState(() => createViewerLifecycle({
    onCleanupFailure: cause => { setFlow(state => nextAppFlow(state, { type: 'viewer-release-failed', cause })); },
    reportError: ports.reportError,
  }));
  /** The holder the mission screen was entered with. */
  const [missionHolder, setMissionHolder] = useState<ResourceHolder | null>(null);
  // A refresh of this shell replaces the holder after releasing the mission it bound, which drops the package: leave.
  if (flow.screen === 'mission' && holder !== missionHolder) go({ type: 'return-to-menu' });
  const returnToMenu = (): void => {
    go({ type: 'return-to-menu' });
    holder?.relist();
  };
  const eligibility = snapshot && missionEligibility(snapshot, flow.cleanupFailure);
  const openMission = (): void => {
    const input = { type: 'open-mission', eligible: eligibility?.status === 'eligible' } as const;
    // Checked against the rendered state first, so a refused transition is shown rather than thrown from the update.
    try {
      nextAppFlow(flow, input);
    } catch (cause) {
      setOpenFailure({ cause });
      return;
    }
    setPackageReplaced(false);
    setMissionHolder(holder);
    go(input);
  };
  return (
    <main>
      <h1>Open Star Rangers</h1>
      <p>Browser re-implementation in progress. No original game content is included.</p>
      <p data-testid="project-rights">
        MIT applies only to this project&apos;s own code, documentation and synthetic resources, not original game content.
        This is an independent project, not original gameplay or an officially authorized product.
        Obtain your own original game data legally; no rights to original content are granted here.
      </p>
      <p data-testid="project-privacy">
        Original game data you import is read, converted and saved only in this browser. It is never uploaded.
      </p>
      {flow.cleanupFailure && (
        <FailureAlert testId="cleanup-failure" cause={flow.cleanupFailure.cause}>
          <strong>Releasing the mission&apos;s resources could not be confirmed.</strong> No new mission can be started
          until the page is reloaded; import and the viewer are unaffected.
        </FailureAlert>
      )}
      {flow.viewerFailure && (
        <FailureAlert testId="viewer-cleanup-failure" cause={flow.viewerFailure.cause}>
          <strong>Releasing the resource viewer&apos;s resources could not be confirmed.</strong> The viewer cannot be opened
          again until the page is reloaded; import and the mission are unaffected.
        </FailureAlert>
      )}
      {openFailure && flow.screen === 'menu' && (
        <FailureAlert testId="open-mission-failure" cause={openFailure.cause}>
          <strong>The mission could not be opened.</strong>
        </FailureAlert>
      )}
      {packageReplaced && flow.screen === 'menu' && (
        <p role="alert" data-testid="mission-package-replaced" className="failure-alert">
          The mission was closed because the resource package was replaced.
        </p>
      )}
      {flow.screen === 'menu' && (
        <MainMenuPage
          focusTarget={flow.focusTarget}
          mission={eligibility}
          viewerBlocked={flow.viewerFailure !== null}
          resources={snapshot}
          onStartMission={openMission}
          onOpenImport={() => { go({ type: 'open-import' }); }}
          onOpenViewer={() => { go({ type: 'open-viewer', holdsPackage: holder?.current() != null }); }}
          onRestore={() => holder?.restore() ?? false}
          onSave={() => { holder?.save(); }}
        />
      )}
      {flow.screen === 'import' && <ImportScreen ports={ports} holder={holder} resources={snapshot} onReturn={returnToMenu} />}
      {flow.screen === 'viewer' && (
        <ViewerScreen
          lifecycle={viewerLifecycle}
          ports={ports}
          holder={holder}
          resources={snapshot}
          onReturn={() => {
            // Release before leaving, so a synchronous release failure is latched before the menu appears.
            viewerLifecycle.close();
            returnToMenu();
          }}
        />
      )}
      {flow.screen === 'mission' && holder && (
        <MissionScreen
          key={flow.missionVisit}
          slot={slot}
          ports={ports}
          holder={holder}
          onReturn={() => {
            // Release before leaving, so a cleanup failure is latched before the menu appears.
            slot.release();
            returnToMenu();
          }}
        />
      )}
    </main>
  );
}
