/**
 * A G-02 placeholder page (docs/plan/p3/04/spec.md: 衔接占位, 运行中衔接（P3-10 的修订）, 终局与救援衔接（P3-11 的修订）): the
 * missing cut-scene's label, its G ID and, for the departure and the ending items, the variant of this run; for the
 * placeholders of a running hold (G-02/3 to G-02/6), the item's place in a hold of several, and for a completed run's
 * ending (G-02/7 to G-02/9) its place before the results page. One placeholder stands for the item's whole group of
 * clips. Focus starts on the skip button, except that a running hold's placeholder leaves focus the user put elsewhere
 * alone, and a hold's or an ending's leaves a hidden page alone (`placeholderTakesFocus`). The button, or a new Enter,
 * Space or Esc press inside the page, ends it early, once. Key repeats are suppressed, so a key held since the previous
 * page neither skips nor activates the button. A timer or clock failure stops the placeholder for good; the page then
 * offers only the way back to the main menu.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { MissionEndingPlaceholder, MissionPlaceholder, MissionTransitionPlaceholder } from '../../app/mission/mission-owner.ts';
import { describeStructure } from './mission-copy.ts';
import { GapNote, SkeletonNote } from './MissionParts.tsx';
import { placeholderKeyAction, placeholderTakesFocus } from './page-keys.ts';
import { endingVariant, PLACEHOLDER_PAGES } from './slice-gaps-copy.ts';

const isEnding = (placeholder: PlaceholderPageProps['placeholder']): placeholder is MissionEndingPlaceholder =>
  placeholder.gap === 'G-02/7' || placeholder.gap === 'G-02/8' || placeholder.gap === 'G-02/9';

/** The variant an ending or departure placeholder names, as text and as its data attribute; null for the others. */
function variantOf(placeholder: PlaceholderPageProps['placeholder']): { readonly text: string; readonly data: string } | null {
  if (isEnding(placeholder)) return { text: endingVariant(placeholder), data: placeholder.gap === 'G-02/9' ? String(placeholder.row) : placeholder.variant };
  const variant = 'variant' in placeholder ? placeholder.variant : null;
  return variant === null ? null : { text: PLACEHOLDER_PAGES.departure[variant], data: variant };
}

export interface PlaceholderPageProps {
  readonly placeholder: MissionPlaceholder | MissionTransitionPlaceholder | MissionEndingPlaceholder;
  /** Ends this placeholder; the owner ignores a placeholder that already ended. */
  readonly onSkip: (placeholderId: number) => void;
  readonly onReturn: () => void;
}

export function PlaceholderPage({ placeholder, onSkip, onReturn }: PlaceholderPageProps) {
  const { id, gap, status, failure } = placeholder;
  const variant = variantOf(placeholder);
  const hold = 'transitionId' in placeholder ? placeholder : null;
  const ending = isEnding(placeholder);
  const placement = ending ? 'ending' : hold !== null ? 'hold' : 'flow';
  const skipButton = useRef<HTMLButtonElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const failed = status === 'failed';
  useEffect(() => {
    const active = document.activeElement;
    const focusDropped = active === null || active === document.body || active === document.documentElement;
    if (placeholderTakesFocus({ placement, focusDropped, visible: document.visibilityState === 'visible' })) {
      (failed ? returnButton : skipButton).current?.focus();
    }
  }, [failed, placement]);
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
      <h2 id="mission-placeholder-heading">{PLACEHOLDER_PAGES.title[gap]} placeholder ({gap})</h2>
      <GapNote id={gap} />
      {variant !== null && <p data-testid="mission-placeholder-variant" data-variant={variant.data}>{variant.text}</p>}
      {hold !== null && (ending || hold.count > 1) && (
        <p data-testid="mission-placeholder-sequence" data-index={hold.index} data-count={hold.count}>
          {ending ? PLACEHOLDER_PAGES.ending(hold.index, hold.count) : PLACEHOLDER_PAGES.sequence(hold.index, hold.count)}
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
