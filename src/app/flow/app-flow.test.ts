import { describe, expect, it } from 'vitest';
import {
  INITIAL_APP_FLOW, nextAppFlow, type AppFlowInput, type AppFlowState, type AppScreen,
} from './app-flow.ts';

const FIRST = new Error('first release failure');
const LATER = new Error('later release failure');

function state(screen: AppScreen, locked: boolean, missionVisit = 3): AppFlowState {
  return Object.freeze({
    screen, missionVisit, focusTarget: screen === 'menu' ? 'mission-entry' : null,
    cleanupFailure: locked ? Object.freeze({ cause: FIRST }) : null,
    viewerFailure: null,
  });
}

function run(start: AppFlowState, ...inputs: AppFlowInput[]): AppFlowState {
  return inputs.reduce(nextAppFlow, start);
}

const OPEN_MISSION = { type: 'open-mission', eligible: true } as const;
const NOT_ELIGIBLE = { type: 'open-mission', eligible: false } as const;
const OPEN_IMPORT = { type: 'open-import' } as const;
const RETURN = { type: 'return-to-menu' } as const;
const OPEN_VIEWER = { type: 'open-viewer', holdsPackage: true } as const;
const NO_PACKAGE = { type: 'open-viewer', holdsPackage: false } as const;
const failed = (cause: unknown) => ({ type: 'mission-release-failed', cause }) as const;

describe('app flow', () => {
  it('starts on the menu with no visit, focus target or failure, frozen', () => {
    expect(INITIAL_APP_FLOW).toEqual({ screen: 'menu', missionVisit: 0, focusTarget: null, cleanupFailure: null, viewerFailure: null });
    expect(Object.isFrozen(INITIAL_APP_FLOW)).toBe(true);
  });

  type Case = [screen: AppScreen, locked: boolean, input: AppFlowInput, expected: Partial<AppFlowState> | 'same'];
  const cases: Case[] = [
    ['menu', false, OPEN_MISSION, { screen: 'mission', missionVisit: 4, focusTarget: null }],
    ['menu', true, OPEN_MISSION, 'same'],
    ['menu', false, NOT_ELIGIBLE, 'same'],
    ['menu', true, NOT_ELIGIBLE, 'same'],
    ['import', false, NOT_ELIGIBLE, 'same'],
    ['mission', false, NOT_ELIGIBLE, 'same'],
    ['viewer', false, NOT_ELIGIBLE, 'same'],
    ['import', false, OPEN_MISSION, 'same'],
    ['import', true, OPEN_MISSION, 'same'],
    ['mission', false, OPEN_MISSION, 'same'],
    ['mission', true, OPEN_MISSION, 'same'],
    ['menu', false, OPEN_IMPORT, { screen: 'import', missionVisit: 3, focusTarget: null }],
    ['menu', true, OPEN_IMPORT, { screen: 'import', missionVisit: 3, focusTarget: null }],
    ['import', false, OPEN_IMPORT, 'same'],
    ['import', true, OPEN_IMPORT, 'same'],
    ['mission', false, OPEN_IMPORT, 'same'],
    ['mission', true, OPEN_IMPORT, 'same'],
    ['menu', false, RETURN, 'same'],
    ['menu', true, RETURN, 'same'],
    ['import', false, RETURN, { screen: 'menu', focusTarget: 'import-entry' }],
    ['import', true, RETURN, { screen: 'menu', focusTarget: 'import-entry' }],
    ['mission', false, RETURN, { screen: 'menu', focusTarget: 'mission-entry' }],
    ['mission', true, RETURN, { screen: 'menu', focusTarget: 'menu-heading' }],
    ['menu', false, failed(LATER), { screen: 'menu', focusTarget: 'menu-heading', cleanupFailure: { cause: LATER } }],
    ['import', false, failed(LATER), { screen: 'import', focusTarget: null, cleanupFailure: { cause: LATER } }],
    ['mission', false, failed(LATER), { screen: 'mission', focusTarget: null, cleanupFailure: { cause: LATER } }],
    ['menu', true, failed(LATER), 'same'],
    ['import', true, failed(LATER), 'same'],
    ['mission', true, failed(LATER), 'same'],
    ['menu', false, OPEN_VIEWER, { screen: 'viewer', missionVisit: 3, focusTarget: null }],
    ['menu', true, OPEN_VIEWER, { screen: 'viewer', missionVisit: 3, focusTarget: null, cleanupFailure: { cause: FIRST } }],
    ['menu', false, NO_PACKAGE, 'same'],
    ['menu', true, NO_PACKAGE, 'same'],
    ['import', false, OPEN_VIEWER, 'same'],
    ['mission', false, OPEN_VIEWER, 'same'],
    ['viewer', false, OPEN_VIEWER, 'same'],
    ['viewer', false, OPEN_MISSION, 'same'],
    ['viewer', false, OPEN_IMPORT, 'same'],
    ['viewer', false, RETURN, { screen: 'menu', focusTarget: 'viewer-entry' }],
    ['viewer', true, RETURN, { screen: 'menu', focusTarget: 'viewer-entry', cleanupFailure: { cause: FIRST } }],
    ['viewer', false, failed(LATER), { screen: 'viewer', focusTarget: null, cleanupFailure: { cause: LATER } }],
  ];

  it.each(cases)('%s (locked: %s) + %o', (screen, locked, input, expected) => {
    const before = state(screen, locked);
    const after = nextAppFlow(before, input);
    if (expected === 'same') {
      expect(after).toBe(before);
      return;
    }
    expect(after).not.toBe(before);
    expect(after).toEqual({ ...before, ...expected });
    expect(Object.isFrozen(after)).toBe(true);
    if (after.cleanupFailure) expect(Object.isFrozen(after.cleanupFailure)).toBe(true);
    // A failure that was already latched is kept by identity.
    if (locked) expect(after.cleanupFailure).toBe(before.cleanupFailure);
  });

  it('increments missionVisit strictly from 0 on every visit', () => {
    let current = INITIAL_APP_FLOW;
    for (let visit = 1; visit <= 3; visit++) {
      current = run(current, OPEN_MISSION);
      expect(current).toMatchObject({ screen: 'mission', missionVisit: visit });
      current = run(current, RETURN, OPEN_IMPORT, RETURN);
      expect(current).toMatchObject({ screen: 'menu', missionVisit: visit, focusTarget: 'import-entry' });
    }
  });

  it('throws RangeError instead of exceeding a safe missionVisit, and ignores it where opening does not apply', () => {
    const exhausted = state('menu', false, Number.MAX_SAFE_INTEGER);
    expect(() => nextAppFlow(exhausted, OPEN_MISSION)).toThrow(RangeError);
    expect(nextAppFlow(exhausted, NOT_ELIGIBLE)).toBe(exhausted);
    expect(nextAppFlow(state('menu', false, Number.MAX_SAFE_INTEGER - 1), OPEN_MISSION).missionVisit).toBe(Number.MAX_SAFE_INTEGER);
    const lockedExhausted = state('menu', true, Number.MAX_SAFE_INTEGER);
    expect(nextAppFlow(lockedExhausted, OPEN_MISSION)).toBe(lockedExhausted);
    const importExhausted = state('import', false, Number.MAX_SAFE_INTEGER);
    expect(nextAppFlow(importExhausted, OPEN_MISSION)).toBe(importExhausted);
  });

  const causes = [['an Error', new Error('cleanup')], ['a non-Error value', 'cleanup failed'], ['null', null]] as const;
  it.each(causes.flatMap(([label, cause]) => (['menu', 'import', 'mission'] as const).map(screen => [label, screen, cause] as const)))(
    'latches %s as the first cause on %s without freezing it',
    (_label, screen, cause) => {
      const locked = nextAppFlow(state(screen, false), failed(cause));
      expect(locked.cleanupFailure).toEqual({ cause });
      expect(locked.cleanupFailure!.cause).toBe(cause);
      expect(Object.isFrozen(locked.cleanupFailure)).toBe(true);
      if (cause instanceof Error) expect(Object.isFrozen(cause)).toBe(false);
    },
  );

  it('keeps the first cause and later navigation focus through repeated failures', () => {
    const fromMission = run(INITIAL_APP_FLOW, OPEN_MISSION, failed(FIRST), failed(LATER), RETURN);
    expect(fromMission).toEqual({ screen: 'menu', missionVisit: 1, focusTarget: 'menu-heading', cleanupFailure: { cause: FIRST }, viewerFailure: null });
    expect(nextAppFlow(fromMission, OPEN_MISSION)).toBe(fromMission);
    const imported = run(fromMission, OPEN_IMPORT, RETURN);
    expect(imported).toMatchObject({ screen: 'menu', focusTarget: 'import-entry' });
    expect(imported.cleanupFailure).toBe(fromMission.cleanupFailure);
    expect(nextAppFlow(imported, failed(LATER))).toBe(imported);
    // A failure delivered on the menu after returning moves focus to the heading.
    const late = run(INITIAL_APP_FLOW, OPEN_MISSION, RETURN, failed(FIRST));
    expect(late).toMatchObject({ screen: 'menu', focusTarget: 'menu-heading', cleanupFailure: { cause: FIRST } });
  });

  it('latches a viewer release failure for the viewer only, keeping the first cause', () => {
    const viewerFailed = (cause: unknown) => ({ type: 'viewer-release-failed', cause }) as const;
    const left = run(INITIAL_APP_FLOW, OPEN_VIEWER, viewerFailed(FIRST), viewerFailed(LATER), RETURN);
    expect(left).toEqual({ screen: 'menu', missionVisit: 0, focusTarget: 'menu-heading', cleanupFailure: null, viewerFailure: { cause: FIRST } });
    expect(Object.isFrozen(left.viewerFailure)).toBe(true);
    expect(nextAppFlow(left, OPEN_VIEWER)).toBe(left);
    // Import and the mission stay available, and their returns keep their own focus.
    expect(run(left, OPEN_IMPORT, RETURN)).toMatchObject({ screen: 'menu', focusTarget: 'import-entry', viewerFailure: { cause: FIRST } });
    expect(run(left, OPEN_MISSION, RETURN)).toMatchObject({ screen: 'menu', missionVisit: 1, focusTarget: 'mission-entry' });
    // Delivered on the menu after returning, as when an audio close is rejected later, it moves focus to the heading.
    const late = run(INITIAL_APP_FLOW, OPEN_VIEWER, RETURN);
    expect(late.focusTarget).toBe('viewer-entry');
    expect(nextAppFlow(late, viewerFailed(FIRST))).toMatchObject({ focusTarget: 'menu-heading', viewerFailure: { cause: FIRST } });
  });
});

describe('app flow: the mission screen (P3-04 应用流程)', () => {
  const fresh = (...inputs: AppFlowInput[]) => inputs.reduce(nextAppFlow, INITIAL_APP_FLOW);
  const OPEN_MISSION = { type: 'open-mission', eligible: true } as const;
  const RETURN = { type: 'return-to-menu' } as const;
  const missionFailed = (cause: unknown) => ({ type: 'mission-release-failed', cause }) as const;

  it('opens the mission only from the menu while eligible, one new visit each time, and returns focus to its entry', () => {
    expect(fresh({ type: 'open-mission', eligible: false })).toBe(INITIAL_APP_FLOW);
    const opened = fresh(OPEN_MISSION);
    expect(opened).toEqual({ screen: 'mission', missionVisit: 1, focusTarget: null, cleanupFailure: null, viewerFailure: null });
    expect(nextAppFlow(opened, OPEN_MISSION)).toBe(opened);
    expect(nextAppFlow(opened, { type: 'open-import' })).toBe(opened);
    expect(nextAppFlow(opened, { type: 'open-viewer', holdsPackage: true })).toBe(opened);
    const back = nextAppFlow(opened, RETURN);
    expect(back).toMatchObject({ screen: 'menu', missionVisit: 1, focusTarget: 'mission-entry' });
    expect(nextAppFlow(back, OPEN_MISSION)).toMatchObject({ screen: 'mission', missionVisit: 2, focusTarget: null });
  });

  it('latches a mission cleanup failure on the mission screen: no new visit, focus on the heading, the viewer unaffected', () => {
    const latched = fresh(OPEN_MISSION, missionFailed(FIRST));
    expect(latched).toMatchObject({ screen: 'mission', focusTarget: null, cleanupFailure: { cause: FIRST } });
    const back = nextAppFlow(latched, RETURN);
    expect(back).toMatchObject({ screen: 'menu', focusTarget: 'menu-heading', cleanupFailure: { cause: FIRST } });
    expect(back.cleanupFailure).toBe(latched.cleanupFailure);
    expect(nextAppFlow(back, OPEN_MISSION)).toBe(back);
    expect(nextAppFlow(back, { type: 'open-viewer', holdsPackage: true })).toMatchObject({ screen: 'viewer', cleanupFailure: { cause: FIRST } });
    // A release failure that arrives on the menu after returning moves focus to the heading too.
    expect(nextAppFlow(fresh(OPEN_MISSION, RETURN), missionFailed(LATER))).toMatchObject({ focusTarget: 'menu-heading', cleanupFailure: { cause: LATER } });
  });
});
