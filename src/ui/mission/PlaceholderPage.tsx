/**
 * A G-02 placeholder page (docs/plan/p3/04/spec.md: 衔接占位, 运行中衔接（P3-10 的修订）): the missing cut-scene's label,
 * its G ID and, for the departure, the variant of this run; for the docking (G-02/3) and launch (G-02/4) placeholders of a
 * running hold, the item's place in a hold of several. Focus starts on the skip button, except that a hold's placeholder
 * leaves focus the user put elsewhere, or on a hidden page, alone (`placeholderTakesFocus`); the button, or a new Enter,
 * Space or Esc press inside the page, ends it early, once. Key repeats are suppressed, so a key held since the previous
 * page neither skips nor activates the button. A timer or clock failure stops the placeholder for good; the page then
 * offers only the way back to the main menu.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { MissionPlaceholder, MissionTransitionPlaceholder } from '../../app/mission/mission-owner.ts';
import { describeStructure } from './mission-copy.ts';
import { GapNote, SkeletonNote } from './MissionParts.tsx';
import { placeholderKeyAction, placeholderTakesFocus } from './page-keys.ts';

const VARIANT = Object.freeze({ solo: 'Departure without a wingman', wingman: 'Departure with a wingman' });
const TITLE = Object.freeze({ 'G-02/1': 'Introduction', 'G-02/2': 'Departure', 'G-02/3': 'Docking', 'G-02/4': 'Launch',
  'G-02/5': 'Rescue after destruction', 'G-02/6': 'Rescue after energy loss',
});

export interface PlaceholderPageProps {
  readonly placeholder: MissionPlaceholder | MissionTransitionPlaceholder;
  /** Ends this placeholder; the owner ignores a placeholder that already ended. */
  readonly onSkip: (placeholderId: number) => void;
  readonly onReturn: () => void;
}

export function PlaceholderPage({ placeholder, onSkip, onReturn }: PlaceholderPageProps) {
  const { id, gap, status, failure } = placeholder;
  const variant = 'variant' in placeholder ? placeholder.variant : null;
  const hold = 'transitionId' in placeholder ? placeholder : null;
  const isHold = hold !== null;
  const skipButton = useRef<HTMLButtonElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const failed = status === 'failed';
  useEffect(() => {
    const active = document.activeElement;
    const focusDropped = active === null || active === document.body || active === document.documentElement;
    if (placeholderTakesFocus({ hold: isHold, focusDropped, visible: document.visibilityState === 'visible' })) {
      (failed ? returnButton : skipButton).current?.focus();
    }
  }, [failed, isHold]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const { key, repeat, ctrlKey, altKey, metaKey, nativeEvent } = event;
    const action = placeholderKeyAction({ key, repeat, ctrlKey, altKey, metaKey, isComposing: nativeEvent.isComposing });
    // A failed placeholder cannot be skipped: fresh presses then keep their native use, such as activating Return.
    if (action === null || (action === 'skip' && failed)) return;
    event.preventDefault();
    if (action === 'skip') onSkip(id);
  };
  return (
    <section
      aria-labelledby="mission-placeholder-heading"
      data-testid="mission-placeholder"
      data-gap={gap}
      data-status={status}
      data-transition={hold?.transitionId}
      onKeyDown={onKeyDown}
    >
      <h2 id="mission-placeholder-heading">{TITLE[gap]} placeholder ({gap})</h2>
      <GapNote id={gap} />
      {variant !== null && <p data-testid="mission-placeholder-variant" data-variant={variant}>{VARIANT[variant]}.</p>}
      {hold !== null && hold.count > 1 && (
        <p data-testid="mission-placeholder-sequence" data-index={hold.index} data-count={hold.count}>
          Transition {hold.index + 1} of {hold.count} from the same tick.
        </p>
      )}
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
