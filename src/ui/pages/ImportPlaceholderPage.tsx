/**
 * Placeholder for importing original game data. It only explains that this build cannot import:
 * it has no file input or drop zone and reads, stores and uploads nothing. Contract: docs/plan/p1/08/spec.md.
 */
import { useFocusOnMount } from './use-focus-on-mount.ts';

export interface ImportPlaceholderPageProps {
  readonly onReturn: () => void;
}

export function ImportPlaceholderPage({ onReturn }: ImportPlaceholderPageProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section aria-labelledby="import-heading">
      <h2 id="import-heading" ref={heading} tabIndex={-1}>Import original game data</h2>
      <p>
        Importing original game data is not implemented in this build. This build does not read, store or upload any
        original game files.
      </p>
      <p>
        A later version will import game data you own and process it locally in your browser.
      </p>
      <p>
        <button type="button" onClick={onReturn}>Return to menu</button>
      </p>
    </section>
  );
}
