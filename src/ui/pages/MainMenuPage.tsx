/**
 * The P1 main menu prototype: the original-data status and two entries, the synthetic demo and the
 * import placeholder. A modern web page, not the original game's menu; it offers no original
 * gameplay and claims no imported or verified data. Contract: docs/plan/p1/08/spec.md.
 */
import { useEffect, useRef } from 'react';
import type { AppFocusTarget } from '../../app/flow/app-flow.ts';

export interface MainMenuPageProps {
  /** Where to put focus when the menu appears or the target changes; null leaves focus alone. */
  readonly focusTarget: AppFocusTarget | null;
  /** A cleanup failure is latched, so the demo cannot be started. */
  readonly demoBlocked: boolean;
  readonly onStartDemo: () => void;
  readonly onOpenImport: () => void;
}

export function MainMenuPage({ focusTarget, demoBlocked, onStartDemo, onOpenImport }: MainMenuPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const demoEntry = useRef<HTMLButtonElement>(null);
  const importEntry = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusTarget) return;
    ({ 'demo-entry': demoEntry, 'import-entry': importEntry, 'menu-heading': heading })[focusTarget].current?.focus();
  }, [focusTarget]);
  return (
    <section aria-labelledby="main-menu-heading">
      <h2 id="main-menu-heading" ref={heading} tabIndex={-1}>Main menu</h2>
      <p data-testid="original-data-status">
        <strong>Original game data:</strong> none verified. This build cannot import or verify original game data.
      </p>
      <ul className="menu-entries">
        <li>
          <button ref={demoEntry} type="button" disabled={demoBlocked} aria-describedby="demo-entry-description" onClick={onStartDemo}>
            Start synthetic demo
          </button>
          <p id="demo-entry-description">
            A P1 synthetic engineering demo, not original gameplay. It needs no game data.
            {demoBlocked && ' Unavailable: an earlier resource cleanup failed, so no new demo can be created until the page is reloaded.'}
          </p>
        </li>
        <li>
          <button ref={importEntry} type="button" aria-describedby="import-entry-description" onClick={onOpenImport}>
            Import original game data
          </button>
          <p id="import-entry-description">Not implemented in this build.</p>
        </li>
      </ul>
    </section>
  );
}
