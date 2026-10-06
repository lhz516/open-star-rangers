/**
 * The application shell: the title, the page flow and the current screen, built from the ports its entry passes. It
 * owns the demo lifecycle, so a cleanup failure stays latched across screens and Fast Refresh of the pages, and its
 * cause stays visible without the demo owner or its panel; and the resource holder, which outlives every screen and
 * lists the cache again on each return to the menu. Contracts: docs/plan/p1/08/spec.md, docs/plan/p2/11/spec.md.
 */
import { useState, type ReactNode } from 'react';
import { describeError } from '../ui/game/describe-error.ts';
import { ImportPlaceholderPage } from '../ui/pages/ImportPlaceholderPage.tsx';
import { MainMenuPage } from '../ui/pages/MainMenuPage.tsx';
import { SyntheticDemoPage } from '../ui/pages/SyntheticDemoPage.tsx';
import { ViewerPage } from '../ui/viewer/ViewerPage.tsx';
import { createSyntheticDemoLifecycle, type SyntheticDemoLifecycle } from './composition/synthetic-demo-lifecycle.ts';
import { useResourceHolder } from './composition/use-resource-holder.ts';
import { useSyntheticDemoOwner } from './composition/use-synthetic-demo-owner.ts';
import { INITIAL_APP_FLOW, nextAppFlow, type AppFlowInput, type AppFlowState } from './flow/app-flow.ts';
import type { AppPorts } from './ports.ts';

/** Creates and releases the demo owner with the screen's view container. */
function DemoScreen({ lifecycle, demoBlocked, onReturn }: {
  readonly lifecycle: SyntheticDemoLifecycle;
  readonly demoBlocked: boolean;
  readonly onReturn: () => void;
}) {
  const { owner, containerRef } = useSyntheticDemoOwner(lifecycle);
  return <SyntheticDemoPage demo={owner} viewRef={containerRef} demoBlocked={demoBlocked} onReturn={onReturn} />;
}

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
  const { holder, snapshot } = useResourceHolder(ports);
  /** Why the demo could not be opened, such as exhausted demo visits; shown instead of entering it. */
  const [openFailure, setOpenFailure] = useState<{ readonly cause: unknown } | null>(null);
  const [lifecycle] = useState(() => createSyntheticDemoLifecycle({
    onCleanupFailure: cause => { setFlow(state => nextAppFlow(state, { type: 'demo-release-failed', cause })); },
    reportError: ports.reportError,
  }));
  const go = (input: AppFlowInput): void => { setFlow(state => nextAppFlow(state, input)); };
  const returnToMenu = (): void => {
    go({ type: 'return-to-menu' });
    holder?.relist();
  };
  const openDemo = (): void => {
    // Checked against the rendered state first, so a refused transition is shown rather than thrown from the update.
    try {
      nextAppFlow(flow, { type: 'open-demo' });
    } catch (cause) {
      setOpenFailure({ cause });
      return;
    }
    go({ type: 'open-demo' });
  };
  const demoBlocked = flow.cleanupFailure !== null;
  return (
    <main>
      <h1>Open Star Rangers</h1>
      <p>Browser re-implementation in progress. No original game content is included.</p>
      <p data-testid="project-rights">
        MIT applies only to this project&apos;s own code, documentation and synthetic resources, not original game content.
        This is an independent synthetic engineering demo, not original gameplay or an officially authorized product.
        Obtain your own original game data legally; no rights to original content are granted here.
      </p>
      {flow.cleanupFailure && (
        <FailureAlert testId="cleanup-failure" cause={flow.cleanupFailure.cause}>
          <strong>Releasing the synthetic demo&apos;s resources could not be confirmed.</strong> No new demo can be created
          until the page is reloaded.
        </FailureAlert>
      )}
      {openFailure && flow.screen === 'menu' && (
        <FailureAlert testId="open-demo-failure" cause={openFailure.cause}>
          <strong>The synthetic demo could not be opened.</strong>
        </FailureAlert>
      )}
      {flow.screen === 'menu' && (
        <MainMenuPage
          focusTarget={flow.focusTarget}
          demoBlocked={demoBlocked}
          resources={snapshot}
          onStartDemo={openDemo}
          onOpenImport={() => { go({ type: 'open-import' }); }}
          onOpenViewer={() => { go({ type: 'open-viewer', holdsPackage: holder?.current() != null }); }}
          onRestore={() => holder?.restore() ?? false}
          onSave={() => { holder?.save(); }}
        />
      )}
      {flow.screen === 'import' && <ImportPlaceholderPage onReturn={returnToMenu} />}
      {flow.screen === 'viewer' && <ViewerPage onReturn={returnToMenu} />}
      {flow.screen === 'demo' && (
        <DemoScreen
          key={flow.demoVisit}
          lifecycle={lifecycle}
          demoBlocked={demoBlocked}
          onReturn={() => {
            // Release before leaving, so a cleanup failure is latched before the menu appears.
            lifecycle.release();
            returnToMenu();
          }}
        />
      )}
    </main>
  );
}
