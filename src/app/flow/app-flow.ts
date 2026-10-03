/**
 * In-memory page flow of the P1 menu prototype: main menu, import placeholder and synthetic demo.
 * Pure and DOM-free; the React shell holds the current value, renders its screen and applies its
 * focus target. A cleanup failure latches for the life of the app instance and blocks new demos.
 * Contract: docs/plan/p1/08/spec.md.
 */

export type AppScreen = 'menu' | 'import' | 'demo';

/** Where the menu puts focus after a screen returns to it. */
export type AppFocusTarget = 'demo-entry' | 'import-entry' | 'menu-heading';

/** The first cleanup or rollback failure; the record is frozen, its cause is not. */
export type AppCleanupFailure = Readonly<{ cause: unknown }>;

export type AppFlowState = Readonly<{
  screen: AppScreen;
  /** Demo visits so far; each one gets a new owner. */
  demoVisit: number;
  /** Set only on the menu; null elsewhere and on first load, which leaves focus alone. */
  focusTarget: AppFocusTarget | null;
  /** Once set, no new demo owner may be created until the page reloads. */
  cleanupFailure: AppCleanupFailure | null;
}>;

export type AppFlowInput =
  | { readonly type: 'open-demo' | 'open-import' | 'return-to-menu' }
  | { readonly type: 'demo-release-failed'; readonly cause: unknown };

export const INITIAL_APP_FLOW: AppFlowState = Object.freeze({
  screen: 'menu', demoVisit: 0, focusTarget: null, cleanupFailure: null,
});

/**
 * Returns the next state, or the same object when the input does not apply. Throws RangeError
 * instead of opening a demo once `demoVisit` can no longer grow.
 */
export function nextAppFlow(state: AppFlowState, input: AppFlowInput): AppFlowState {
  const { screen, demoVisit, cleanupFailure } = state;
  switch (input.type) {
    case 'open-demo':
      if (screen !== 'menu' || cleanupFailure) return state;
      if (demoVisit >= Number.MAX_SAFE_INTEGER) throw new RangeError('Demo visits exhausted');
      return Object.freeze({ screen: 'demo', demoVisit: demoVisit + 1, focusTarget: null, cleanupFailure });
    case 'open-import':
      if (screen !== 'menu') return state;
      return Object.freeze({ ...state, screen: 'import', focusTarget: null });
    case 'return-to-menu':
      if (screen === 'menu') return state;
      return Object.freeze({
        ...state, screen: 'menu', focusTarget: screen === 'import' ? 'import-entry' : cleanupFailure ? 'menu-heading' : 'demo-entry',
      });
    case 'demo-release-failed':
      // The first cause wins; a later failure neither replaces it nor moves focus.
      if (cleanupFailure) return state;
      return Object.freeze({
        ...state,
        focusTarget: screen === 'menu' ? 'menu-heading' : state.focusTarget,
        cleanupFailure: Object.freeze({ cause: input.cause }),
      });
  }
}
