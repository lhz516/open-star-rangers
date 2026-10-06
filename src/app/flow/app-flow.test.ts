import { describe, expect, it } from 'vitest';
import {
  INITIAL_APP_FLOW, nextAppFlow, type AppFlowInput, type AppFlowState, type AppScreen,
} from './app-flow.ts';

const FIRST = new Error('first release failure');
const LATER = new Error('later release failure');

function state(screen: AppScreen, locked: boolean, demoVisit = 3): AppFlowState {
  return Object.freeze({
    screen, demoVisit, focusTarget: screen === 'menu' ? 'demo-entry' : null,
    cleanupFailure: locked ? Object.freeze({ cause: FIRST }) : null,
  });
}

function run(start: AppFlowState, ...inputs: AppFlowInput[]): AppFlowState {
  return inputs.reduce(nextAppFlow, start);
}

const OPEN_DEMO = { type: 'open-demo' } as const;
const OPEN_IMPORT = { type: 'open-import' } as const;
const RETURN = { type: 'return-to-menu' } as const;
const OPEN_VIEWER = { type: 'open-viewer', holdsPackage: true } as const;
const NO_PACKAGE = { type: 'open-viewer', holdsPackage: false } as const;
const failed = (cause: unknown) => ({ type: 'demo-release-failed', cause }) as const;

describe('app flow', () => {
  it('starts on the menu with no visit, focus target or failure, frozen', () => {
    expect(INITIAL_APP_FLOW).toEqual({ screen: 'menu', demoVisit: 0, focusTarget: null, cleanupFailure: null });
    expect(Object.isFrozen(INITIAL_APP_FLOW)).toBe(true);
  });

  type Case = [screen: AppScreen, locked: boolean, input: AppFlowInput, expected: Partial<AppFlowState> | 'same'];
  const cases: Case[] = [
    ['menu', false, OPEN_DEMO, { screen: 'demo', demoVisit: 4, focusTarget: null }],
    ['menu', true, OPEN_DEMO, 'same'],
    ['import', false, OPEN_DEMO, 'same'],
    ['import', true, OPEN_DEMO, 'same'],
    ['demo', false, OPEN_DEMO, 'same'],
    ['demo', true, OPEN_DEMO, 'same'],
    ['menu', false, OPEN_IMPORT, { screen: 'import', demoVisit: 3, focusTarget: null }],
    ['menu', true, OPEN_IMPORT, { screen: 'import', demoVisit: 3, focusTarget: null }],
    ['import', false, OPEN_IMPORT, 'same'],
    ['import', true, OPEN_IMPORT, 'same'],
    ['demo', false, OPEN_IMPORT, 'same'],
    ['demo', true, OPEN_IMPORT, 'same'],
    ['menu', false, RETURN, 'same'],
    ['menu', true, RETURN, 'same'],
    ['import', false, RETURN, { screen: 'menu', focusTarget: 'import-entry' }],
    ['import', true, RETURN, { screen: 'menu', focusTarget: 'import-entry' }],
    ['demo', false, RETURN, { screen: 'menu', focusTarget: 'demo-entry' }],
    ['demo', true, RETURN, { screen: 'menu', focusTarget: 'menu-heading' }],
    ['menu', false, failed(LATER), { screen: 'menu', focusTarget: 'menu-heading', cleanupFailure: { cause: LATER } }],
    ['import', false, failed(LATER), { screen: 'import', focusTarget: null, cleanupFailure: { cause: LATER } }],
    ['demo', false, failed(LATER), { screen: 'demo', focusTarget: null, cleanupFailure: { cause: LATER } }],
    ['menu', true, failed(LATER), 'same'],
    ['import', true, failed(LATER), 'same'],
    ['demo', true, failed(LATER), 'same'],
    ['menu', false, OPEN_VIEWER, { screen: 'viewer', demoVisit: 3, focusTarget: null }],
    ['menu', true, OPEN_VIEWER, { screen: 'viewer', demoVisit: 3, focusTarget: null, cleanupFailure: { cause: FIRST } }],
    ['menu', false, NO_PACKAGE, 'same'],
    ['menu', true, NO_PACKAGE, 'same'],
    ['import', false, OPEN_VIEWER, 'same'],
    ['demo', false, OPEN_VIEWER, 'same'],
    ['viewer', false, OPEN_VIEWER, 'same'],
    ['viewer', false, OPEN_DEMO, 'same'],
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

  it('increments demoVisit strictly from 0 on every visit', () => {
    let current = INITIAL_APP_FLOW;
    for (let visit = 1; visit <= 3; visit++) {
      current = run(current, OPEN_DEMO);
      expect(current).toMatchObject({ screen: 'demo', demoVisit: visit });
      current = run(current, RETURN, OPEN_IMPORT, RETURN);
      expect(current).toMatchObject({ screen: 'menu', demoVisit: visit, focusTarget: 'import-entry' });
    }
  });

  it('throws RangeError instead of exceeding a safe demoVisit, and ignores it where opening does not apply', () => {
    const exhausted = state('menu', false, Number.MAX_SAFE_INTEGER);
    expect(() => nextAppFlow(exhausted, OPEN_DEMO)).toThrow(RangeError);
    expect(nextAppFlow(state('menu', false, Number.MAX_SAFE_INTEGER - 1), OPEN_DEMO).demoVisit).toBe(Number.MAX_SAFE_INTEGER);
    const lockedExhausted = state('menu', true, Number.MAX_SAFE_INTEGER);
    expect(nextAppFlow(lockedExhausted, OPEN_DEMO)).toBe(lockedExhausted);
    const importExhausted = state('import', false, Number.MAX_SAFE_INTEGER);
    expect(nextAppFlow(importExhausted, OPEN_DEMO)).toBe(importExhausted);
  });

  const causes = [['an Error', new Error('cleanup')], ['a non-Error value', 'cleanup failed'], ['null', null]] as const;
  it.each(causes.flatMap(([label, cause]) => (['menu', 'import', 'demo'] as const).map(screen => [label, screen, cause] as const)))(
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
    const fromDemo = run(INITIAL_APP_FLOW, OPEN_DEMO, failed(FIRST), failed(LATER), RETURN);
    expect(fromDemo).toEqual({ screen: 'menu', demoVisit: 1, focusTarget: 'menu-heading', cleanupFailure: { cause: FIRST } });
    expect(nextAppFlow(fromDemo, OPEN_DEMO)).toBe(fromDemo);
    const imported = run(fromDemo, OPEN_IMPORT, RETURN);
    expect(imported).toMatchObject({ screen: 'menu', focusTarget: 'import-entry' });
    expect(imported.cleanupFailure).toBe(fromDemo.cleanupFailure);
    expect(nextAppFlow(imported, failed(LATER))).toBe(imported);
    // A failure delivered on the menu after returning moves focus to the heading.
    const late = run(INITIAL_APP_FLOW, OPEN_DEMO, RETURN, failed(FIRST));
    expect(late).toMatchObject({ screen: 'menu', focusTarget: 'menu-heading', cleanupFailure: { cause: FIRST } });
  });
});
