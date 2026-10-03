/**
 * The synthetic demo screen: Return to menu first, then the P1-07 synthetic view and the P1-06
 * development panel of the current owner. The owner is created and released outside this
 * component; the page only shows it. Contract: docs/plan/p1/08/spec.md.
 */
import type { Ref } from 'react';
import { SyntheticDevPanel, type SyntheticDevPanelProps } from '../dev/SyntheticDevPanel.tsx';
import { SyntheticRenderView } from '../render/SyntheticRenderView.tsx';
import type { SyntheticKeyboardReader } from '../game/synthetic-keyboard-input.ts';
import { useFocusOnMount } from './use-focus-on-mount.ts';

export interface SyntheticDemoPageProps {
  /** The current demo owner's store, actions and renderer; null while it is prepared or when none may be created. */
  readonly demo: (SyntheticDevPanelProps & { readonly keyboard: SyntheticKeyboardReader }) | null;
  /** The view container in which the owner's surface is created. */
  readonly viewRef: Ref<HTMLDivElement>;
  /** A cleanup failure is latched, so no owner will be created. */
  readonly demoBlocked: boolean;
  readonly onReturn: () => void;
}

export function SyntheticDemoPage({ demo, viewRef, demoBlocked, onReturn }: SyntheticDemoPageProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section aria-labelledby="demo-heading">
      <h2 id="demo-heading" ref={heading} tabIndex={-1}>Synthetic demo</h2>
      <p>
        <button type="button" onClick={onReturn}>Return to menu</button>
      </p>
      {demoBlocked && !demo ? (
        <p role="status">No synthetic demo was created because an earlier resource cleanup failed.</p>
      ) : (
        <>
          <SyntheticRenderView ref={viewRef} renderer={demo?.renderer ?? null} keyboard={demo?.keyboard ?? null} />
          {demo && <SyntheticDevPanel store={demo.store} dispatch={demo.dispatch} renderer={demo.renderer} />}
        </>
      )}
    </section>
  );
}
