/**
 * A G-02 placeholder page (docs/plan/p3/04/spec.md, 衔接占位): the missing cut-scene's label, its G ID and, for the
 * departure, the variant of this run. Focus starts on the skip button; the button, or a new Enter, Space or Esc press
 * inside the page, ends it early, once. Key repeats are suppressed, so a key held since the previous page neither skips
 * nor activates the button. A timer or clock failure stops the placeholder for good; the page then offers only the way
 * back to the main menu.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { MissionPlaceholder } from '../../app/mission/mission-owner.ts';
import { describeStructure } from './mission-copy.ts';
import { GapNote, SkeletonNote } from './MissionParts.tsx';
import { placeholderKeyAction } from './page-keys.ts';

const VARIANT = Object.freeze({ solo: 'Departure without a wingman', wingman: 'Departure with a wingman' });

export interface PlaceholderPageProps {
  readonly placeholder: MissionPlaceholder;
  /** Ends this placeholder; the owner ignores a placeholder that already ended. */
  readonly onSkip: (placeholderId: number) => void;
  readonly onReturn: () => void;
}

export function PlaceholderPage({ placeholder, onSkip, onReturn }: PlaceholderPageProps) {
  const { id, gap, variant, status, failure } = placeholder;
  const skipButton = useRef<HTMLButtonElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const failed = status === 'failed';
  useEffect(() => {
    (failed ? returnButton : skipButton).current?.focus();
  }, [failed]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const { key, repeat, ctrlKey, altKey, metaKey, nativeEvent } = event;
    const action = placeholderKeyAction({ key, repeat, ctrlKey, altKey, metaKey, isComposing: nativeEvent.isComposing });
    // A failed placeholder cannot be skipped: fresh presses then keep their native use, such as activating Return.
    if (action === null || (action === 'skip' && failed)) return;
    event.preventDefault();
    if (action === 'skip') onSkip(id);
  };
  const title = gap === 'G-02/1' ? 'Introduction' : 'Departure';
  return (
    <section aria-labelledby="mission-placeholder-heading" data-testid="mission-placeholder" data-gap={gap} data-status={status} onKeyDown={onKeyDown}>
      <h2 id="mission-placeholder-heading">{title} placeholder ({gap})</h2>
      <GapNote id={gap} />
      {variant !== null && <p data-testid="mission-placeholder-variant" data-variant={variant}>{VARIANT[variant]}.</p>}
      {status === 'waiting' && <p role="status">Waiting while the page is hidden; only visible time counts.</p>}
      {failed ? (
        <>
          <div role="alert" className="failure-alert" data-testid="mission-placeholder-failure">
            <p>The placeholder&apos;s timing failed, so it cannot end and nothing starts. Return to the main menu.</p>
            <pre>{describeStructure(failure?.cause)}</pre>
          </div>
          <p><button ref={returnButton} type="button" onClick={onReturn}>Return to main menu</button></p>
        </>
      ) : (
        <p>
          <button ref={skipButton} type="button" onClick={() => { onSkip(id); }}>Skip</button>
          {' '}Enter, Space or Esc also skips.
        </p>
      )}
      <SkeletonNote />
    </section>
  );
}
