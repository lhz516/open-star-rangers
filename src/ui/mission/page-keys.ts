/**
 * Project page keys of the mission flow (docs/plan/p3/04/spec.md, 衔接占位 and 任务开始配置), not the original key map.
 * Only a new press counts: a repeat, such as the tail of a key held since the previous page, must neither end a page
 * nor activate the button that page focused.
 */

/** The parts of a keydown event the mapping reads; DOM-free, so Node tests can call it. */
export interface PageKey {
  readonly key: string;
  readonly repeat: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly isComposing: boolean;
}

/** `skip`: end the placeholder and prevent the default; `suppress`: only prevent the default; null: leave the key alone. */
export type PlaceholderKeyAction = 'skip' | 'suppress' | null;

const SKIP_KEYS: ReadonlySet<string> = new Set(['Enter', ' ', 'Escape']);

/**
 * Enter, Space and Esc end a G-02 placeholder early, handled only inside it. Repeats are suppressed whatever the
 * modifiers, since a held Enter or Space would otherwise activate the focused skip button once per repeat; new presses
 * with Control, Alt or Meta, and presses during composition, are left to the browser.
 */
export function placeholderKeyAction({ key, repeat, ctrlKey, altKey, metaKey, isComposing }: PageKey): PlaceholderKeyAction {
  if (!SKIP_KEYS.has(key)) return null;
  if (repeat) return 'suppress';
  return ctrlKey || altKey || metaKey || isComposing ? null : 'skip';
}

/** A repeat of Enter or Space, which would activate a focused button again: its default is to be prevented. */
export const isHeldActivation = ({ key, repeat }: Pick<PageKey, 'key' | 'repeat'>): boolean => repeat && (key === 'Enter' || key === ' ');

/** What a placeholder page knows as it mounts or fails. */
export interface PlaceholderFocusFacts {
  /** It is the placeholder of a running hold (G-02/3, G-02/4), shown in place of the flight shell. */
  readonly hold: boolean;
  /** Focus rests on nothing: the element that had it, such as the input zone, left with the page that ended. */
  readonly focusDropped: boolean;
  readonly visible: boolean;
}

/**
 * Whether a placeholder moves focus to its button. The flow's own pages always do, as before P3-10. A running hold's
 * placeholder does only on a visible page whose focus was dropped, so it takes no focus the user put on another
 * control, such as the diagnostics panel, and none from a hidden page.
 */
export const placeholderTakesFocus = ({ hold, focusDropped, visible }: PlaceholderFocusFacts): boolean =>
  !hold || (focusDropped && visible);
