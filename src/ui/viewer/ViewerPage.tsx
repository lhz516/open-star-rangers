/**
 * The resource viewer screen. Until the viewer renders the held package (P2-11 subtask 11), it only names the screen
 * and returns to the menu.
 */
import { useFocusOnMount } from '../pages/use-focus-on-mount.ts';

export interface ViewerPageProps {
  readonly onReturn: () => void;
}

export function ViewerPage({ onReturn }: ViewerPageProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section aria-labelledby="viewer-heading">
      <h2 id="viewer-heading" ref={heading} tabIndex={-1}>Resource viewer</h2>
      <p>Viewing the held resources is not available in this build yet.</p>
      <p>
        <button type="button" onClick={onReturn}>Return to menu</button>
      </p>
    </section>
  );
}
