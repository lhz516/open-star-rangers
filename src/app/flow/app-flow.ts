/**
 * In-memory page flow: main menu, import, synthetic demo and resource viewer. Pure and DOM-free; the
 * React shell holds the current value, renders its screen and applies its focus target. A demo
 * cleanup failure latches for the life of the app instance and blocks new demos; a viewer release
 * failure likewise blocks the viewer only. The viewer opens only while a resource package is held. Contracts: docs/plan/p1/08/spec.md, docs/plan/p2/11/spec.md.
 */

export type AppScreen = 'menu' | 'import' | 'demo' | 'viewer';

/** Where the menu puts focus after a screen returns to it. */
export type AppFocusTarget = 'demo-entry' | 'import-entry' | 'viewer-entry' | 'menu-heading';

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
  /** Once set, the viewer cannot be opened until the page reloads; import and the demo are unaffected. */
  viewerFailure: AppCleanupFailure | null;
}>;

export type AppFlowInput =
  | { readonly type: 'open-demo' | 'open-import' | 'return-to-menu' }
  /** `holdsPackage`: whether the app holds a resource package to view. */
  | { readonly type: 'open-viewer'; readonly holdsPackage: boolean }
  | { readonly type: 'demo-release-failed' | 'viewer-release-failed'; readonly cause: unknown };

export const INITIAL_APP_FLOW: AppFlowState = Object.freeze({
  screen: 'menu', demoVisit: 0, focusTarget: null, cleanupFailure: null, viewerFailure: null,
});

/** The entry a screen returns focus to; after a release that failed, the disabled entry gives way to the heading. */
function returnFocus(screen: Exclude<AppScreen, 'menu'>, { cleanupFailure, viewerFailure }: AppFlowState): AppFocusTarget {
  if (screen === 'demo') return cleanupFailure ? 'menu-heading' : 'demo-entry';
  if (screen === 'viewer') return viewerFailure ? 'menu-heading' : 'viewer-entry';
  return 'import-entry';
}

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
      return Object.freeze({ ...state, screen: 'demo', demoVisit: demoVisit + 1, focusTarget: null });
    case 'open-import':
      if (screen !== 'menu') return state;
      return Object.freeze({ ...state, screen: 'import', focusTarget: null });
    case 'open-viewer':
      if (screen !== 'menu' || !input.holdsPackage || state.viewerFailure) return state;
      return Object.freeze({ ...state, screen: 'viewer', focusTarget: null });
    case 'return-to-menu':
      if (screen === 'menu') return state;
      return Object.freeze({ ...state, screen: 'menu', focusTarget: returnFocus(screen, state) });
    case 'demo-release-failed':
      // The first cause wins; a later failure neither replaces it nor moves focus.
      if (cleanupFailure) return state;
      return Object.freeze({
        ...state,
        focusTarget: screen === 'menu' ? 'menu-heading' : state.focusTarget,
        cleanupFailure: Object.freeze({ cause: input.cause }),
      });
    case 'viewer-release-failed':
      if (state.viewerFailure) return state;
      return Object.freeze({
        ...state,
        focusTarget: screen === 'menu' ? 'menu-heading' : state.focusTarget,
        viewerFailure: Object.freeze({ cause: input.cause }),
      });
  }
}
