/**
 * In-memory page flow: main menu, import, mission and resource viewer. Pure and DOM-free; the React shell holds the
 * current value, renders its screen and applies its focus target. A mission owner's cleanup failure latches for the
 * life of the app instance and blocks new missions; a viewer release failure likewise blocks the viewer only. The
 * mission opens only while it is eligible to start, and the viewer only while a resource package is held. Contracts:
 * docs/plan/p1/08/spec.md, docs/plan/p2/11/spec.md, docs/plan/p3/04/spec.md (应用流程).
 */

export type AppScreen = 'menu' | 'import' | 'mission' | 'viewer';

/** Where the menu puts focus after a screen returns to it. */
export type AppFocusTarget = 'mission-entry' | 'import-entry' | 'viewer-entry' | 'menu-heading';

/** The first cleanup or rollback failure; the record is frozen, its cause is not. */
export type AppCleanupFailure = Readonly<{ cause: unknown }>;

export type AppFlowState = Readonly<{
  screen: AppScreen;
  /** Mission screen visits so far; each one gets a new mission owner. */
  missionVisit: number;
  /** Set only on the menu; null elsewhere and on first load, which leaves focus alone. */
  focusTarget: AppFocusTarget | null;
  /** A mission owner's cleanup failure: once set, no mission owner may be created until the page reloads. */
  cleanupFailure: AppCleanupFailure | null;
  /** Once set, the viewer cannot be opened until the page reloads; import and the mission are unaffected. */
  viewerFailure: AppCleanupFailure | null;
}>;

export type AppFlowInput =
  | { readonly type: 'open-import' | 'return-to-menu' }
  /** `eligible`: whether the start eligibility admits the mission (docs/plan/p3/04/spec.md, 开始资格). */
  | { readonly type: 'open-mission'; readonly eligible: boolean }
  /** `holdsPackage`: whether the app holds a resource package to view. */
  | { readonly type: 'open-viewer'; readonly holdsPackage: boolean }
  | { readonly type: 'mission-release-failed' | 'viewer-release-failed'; readonly cause: unknown };

export const INITIAL_APP_FLOW: AppFlowState = Object.freeze({
  screen: 'menu', missionVisit: 0, focusTarget: null, cleanupFailure: null, viewerFailure: null,
});

/**
 * The entry a screen returns focus to; after a release that failed, the disabled entry gives way to the heading. The
 * menu also falls back to the heading when the mission entry is disabled for another reason.
 */
function returnFocus(screen: Exclude<AppScreen, 'menu'>, { cleanupFailure, viewerFailure }: AppFlowState): AppFocusTarget {
  if (screen === 'mission') return cleanupFailure ? 'menu-heading' : 'mission-entry';
  if (screen === 'viewer') return viewerFailure ? 'menu-heading' : 'viewer-entry';
  return 'import-entry';
}

/**
 * Returns the next state, or the same object when the input does not apply. Throws RangeError instead of opening the
 * mission once `missionVisit` can no longer grow.
 */
export function nextAppFlow(state: AppFlowState, input: AppFlowInput): AppFlowState {
  const { screen, missionVisit, cleanupFailure } = state;
  switch (input.type) {
    case 'open-mission':
      if (screen !== 'menu' || !input.eligible || cleanupFailure) return state;
      if (missionVisit >= Number.MAX_SAFE_INTEGER) throw new RangeError('Mission visits exhausted');
      return Object.freeze({ ...state, screen: 'mission', missionVisit: missionVisit + 1, focusTarget: null });
    case 'open-import':
      if (screen !== 'menu') return state;
      return Object.freeze({ ...state, screen: 'import', focusTarget: null });
    case 'open-viewer':
      if (screen !== 'menu' || !input.holdsPackage || state.viewerFailure) return state;
      return Object.freeze({ ...state, screen: 'viewer', focusTarget: null });
    case 'return-to-menu':
      if (screen === 'menu') return state;
      return Object.freeze({ ...state, screen: 'menu', focusTarget: returnFocus(screen, state) });
    case 'mission-release-failed':
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
