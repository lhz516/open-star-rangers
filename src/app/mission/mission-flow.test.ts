import { describe, expect, it } from 'vitest';
import {
  FLOW_SESSION_PHASES, INITIAL_MISSION_FLOW, nextMissionFlow, preselectWingman, type MissionFlowInput, type MissionFlowPosition, type MissionFlowState,
} from './mission-flow.ts';

// P3-04 S-03/S-04 (docs/plan/p3/04/spec.md, 应用流程): the pure mission flow and the start page's preselection.

const at = (position: MissionFlowPosition, change: Partial<MissionFlowState> = {}): MissionFlowState =>
  Object.freeze({ ...INITIAL_MISSION_FLOW, position, ...change });

const INPUTS: readonly MissionFlowInput[] = [
  { type: 'intro-ended', preselection: 0 },
  { type: 'select', wingman: 3 },
  { type: 'start-failed', failure: { kind: 'package-changed' } },
  { type: 'started', runId: 1 },
  { type: 'departure-ended' },
  { type: 'transition-held' },
  { type: 'transition-ended' },
  { type: 'menu-opened' },
  { type: 'menu-closed' },
  { type: 'run-ended', reason: 'faulted' },
  { type: 'restarted' },
];

/** Where each input applies; elsewhere it returns the same state object. */
const APPLIES: Readonly<Record<MissionFlowInput['type'], readonly MissionFlowPosition[]>> = {
  'intro-ended': ['intro'],
  select: ['config'],
  'start-failed': ['config'],
  started: ['config'],
  'departure-ended': ['departure'],
  'transition-held': ['flight'],
  'transition-ended': ['transition'],
  'menu-opened': ['flight'],
  'menu-closed': ['menu'],
  'run-ended': ['departure', 'flight', 'transition', 'menu'],
  restarted: ['flight', 'menu', 'ended'],
};

describe('mission flow', () => {
  it('goes from the introduction through the start page, departure, flight, a running hold and menu, and restarts at the introduction', () => {
    let state = INITIAL_MISSION_FLOW;
    expect(state).toEqual({ position: 'intro', selection: null, startFailure: null, runId: null, ended: null });
    const steps: [MissionFlowInput, Partial<MissionFlowState>][] = [
      [{ type: 'intro-ended', preselection: 0 }, { position: 'config', selection: 0 }],
      [{ type: 'select', wingman: null }, { position: 'config', selection: null }],
      [{ type: 'start-failed', failure: { kind: 'seed', cause: 'x' } }, { startFailure: { kind: 'seed', cause: 'x' } }],
      [{ type: 'started', runId: 4 }, { position: 'departure', startFailure: null, runId: 4 }],
      [{ type: 'departure-ended' }, { position: 'flight' }],
      [{ type: 'transition-held' }, { position: 'transition', runId: 4 }],
      [{ type: 'transition-ended' }, { position: 'flight', runId: 4 }],
      [{ type: 'menu-opened' }, { position: 'menu' }],
      [{ type: 'menu-closed' }, { position: 'flight' }],
      [{ type: 'run-ended', reason: 'stopped' }, { position: 'ended', ended: 'stopped' }],
      [{ type: 'restarted' }, { position: 'intro', runId: null, ended: null, selection: null }],
      // The selection stays until the next start page sets its own preselection.
      [{ type: 'intro-ended', preselection: 2 }, { position: 'config', selection: 2 }],
    ];
    for (const [input, expected] of steps) {
      const next = nextMissionFlow(state, input);
      expect(next, input.type).toMatchObject(expected);
      expect(Object.isFrozen(next)).toBe(true);
      state = next;
    }
  });

  it.each(INPUTS)('applies $type only where it belongs and returns the same object elsewhere', (input) => {
    for (const position of Object.keys(FLOW_SESSION_PHASES) as MissionFlowPosition[]) {
      const state = at(position, position === 'ended' ? { ended: 'faulted' } : {});
      const next = nextMissionFlow(state, input);
      expect(next !== state, `${input.type} at ${position}`).toBe(APPLIES[input.type].includes(position));
    }
  });

  it('ignores a selection equal to the current one', () => {
    const state = at('config', { selection: 2 });
    expect(nextMissionFlow(state, { type: 'select', wingman: 2 })).toBe(state);
  });

  it('ends a restart whose cleanup failed for good: no restart follows, and only that reason replaces a fault', () => {
    const faulted = at('ended', { ended: 'faulted', runId: 1 });
    const failed = nextMissionFlow(faulted, { type: 'run-ended', reason: 'cleanup-failed' });
    expect(failed).toMatchObject({ position: 'ended', ended: 'cleanup-failed', runId: 1 });
    expect(nextMissionFlow(faulted, { type: 'run-ended', reason: 'stopped' })).toBe(faulted);
    expect(nextMissionFlow(failed, { type: 'restarted' })).toBe(failed);
    expect(nextMissionFlow(failed, { type: 'run-ended', reason: 'cleanup-failed' })).toBe(failed);
    expect(nextMissionFlow(at('flight'), { type: 'run-ended', reason: 'cleanup-failed' })).toMatchObject({ position: 'ended', ended: 'cleanup-failed' });
  });

  it('pairs each position with the session phases it runs beside', () => {
    expect(FLOW_SESSION_PHASES).toEqual({
      intro: ['idle'], config: ['idle'], departure: ['transition'], flight: ['running', 'paused'], transition: ['transition'], menu: ['paused'],
      ended: ['faulted', 'stopped', 'idle'],
    });
  });
});

describe('wingman preselection', () => {
  it('defaults to the first option, or none without options', () => {
    expect(preselectWingman(null, 'a', 5)).toBe(0);
    expect(preselectWingman(null, 'a', 0)).toBeNull();
  });

  it('keeps the last confirmed selection for the same content identity, no wingman included', () => {
    for (const wingman of [null, 0, 1, 2, 3, 4]) expect(preselectWingman({ identity: 'a', wingman }, 'a', 5)).toBe(wingman);
  });

  it('resets for another content identity, whatever the index, and for an index the roster lacks', () => {
    expect(preselectWingman({ identity: 'a', wingman: 3 }, 'b', 5)).toBe(0);
    expect(preselectWingman({ identity: 'a', wingman: null }, 'b', 5)).toBe(0);
    expect(preselectWingman({ identity: 'a', wingman: 4 }, 'a', 4)).toBe(0);
  });
});
