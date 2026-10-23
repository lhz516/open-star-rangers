import { describe, expect, it } from 'vitest';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { GameSessionError } from '../../app/session/session-errors.ts';
import { CoreFaultError, CoreInputError } from '../../core/errors.ts';
import { FIVE_WINGMAN_NAMES } from '../../original-data/formats/formats.test-support.ts';
import { MISSION_SCENARIOS } from '../../workers/import-scenarios.test-support.ts';
import {
  describeStructure, eligibilityReason, MISSION_SKELETON, pauseText, resumeBlockedText, startFailureText, startRetryable, wingmanLabel,
} from './mission-copy.ts';
import { MISSION_OBJECTIVES, SLICE_GAPS } from './slice-gaps-copy.ts';
import type { GameSessionStatus } from '../../app/session/game-session.ts';

// P3-04 S-03, S-11 and AC-19 (界面部分): the page copy of the mission flow, read without a DOM.

const LOAD_FAILED = MISSION_SCENARIOS['mission-load-failed'].failure;

describe('mission page copy', () => {
  it('says why the mission entry is disabled for every reason, with the category, path and reason of a failed load', () => {
    expect(eligibilityReason({ status: 'eligible', generation: 1 })).toBeNull();
    expect(eligibilityReason({ status: 'no-package' })).toMatch(/No resource package is held/);
    expect(eligibilityReason({ status: 'mission-not-attempted' })).toMatch(/not been loaded/);
    expect(eligibilityReason({ status: 'cleanup-failed', cause: new Error('x') })).toMatch(/cleanup failed.*reloaded/);
    expect(eligibilityReason({ status: 'mission-failed', failure: LOAD_FAILED }))
      .toBe(`The mission does not load: Core input error at ${LOAD_FAILED.path}: ${LOAD_FAILED.reason}.`);
    const diagnostic = { code: 'group-missing', path: 'groups.audio', assetId: null, unknowns: [], reason: 'missing' } as const;
    expect(eligibilityReason({ status: 'package-incomplete', groups: [{ group: 'audio', status: 'missing' }], diagnostics: [diagnostic] }))
      .toBe('The resource package is incomplete (audio missing).');
    // Complete groups that miss a cross-group dependency are named by the whole-package judgement instead.
    expect(eligibilityReason({ status: 'package-incomplete', groups: [], diagnostics: [diagnostic] }))
      .toBe('The resource package is incomplete (group-missing at groups.audio).');
  });

  it('labels wingman options in roster order as plain text: a project number, the one name, or every candidate', () => {
    const labels = FIVE_WINGMAN_NAMES.map((nameCandidates, index) => wingmanLabel({ index, nameCandidates }));
    expect(labels).toEqual([
      'Synthetic wingman A',
      'Wingman option 2: one of “Synthetic wingman B1”, “Synthetic wingman B2”',
      'Wingman option 3 (no name in the roster)',
      'Synthetic wingman D',
      'Wingman option 5: one of “Synthetic wingman E1”, “Synthetic wingman E2”, “<b>Synthetic wingman E3</b> & co”',
    ]);
  });

  it('explains every start failure; a refusal with its category, path and reason, others without message text', () => {
    const rejected = startFailureText({ kind: 'rejected', failure: { kind: 'content', path: 'a.b', reason: 'must be c' } });
    expect(rejected.text).toMatch(/^World creation refused the mission: content contract error at a\.b: must be c\. Change the selection/);
    expect(startFailureText({ kind: 'package-changed' }).text).toMatch(/package changed/);
    expect(startFailureText({ kind: 'cleanup-failed' }).text).toMatch(/cleanup failed/);
    const seed = startFailureText({ kind: 'seed', cause: new RangeError('secret seed text') });
    expect(seed.detail).toBe('RangeError');
    const kept = startFailureText({ kind: 'assembly', stage: 'leave-guard', cause: new Error('x'), rolledBack: true });
    expect(kept.text).toMatch(/registering the leave-page confirmation\. Everything acquired was released; you can try again\./);
    const latched = startFailureText({ kind: 'assembly', stage: 'consumer', cause: new Error('x'), rolledBack: false });
    expect(latched.text).toMatch(/only returning to the main menu remains/);
  });

  it('allows another start after a seed failure, a refusal or a rolled-back assembly failure only', () => {
    const cause = new Error('x');
    expect(startRetryable({ kind: 'seed', cause })).toBe(true);
    expect(startRetryable({ kind: 'rejected', failure: { kind: 'core-input', path: 'p', reason: 'r' } })).toBe(true);
    expect(startRetryable({ kind: 'assembly', stage: 'session', cause, rolledBack: true })).toBe(true);
    expect(startRetryable({ kind: 'assembly', stage: 'session', cause, rolledBack: false })).toBe(false);
    expect(startRetryable({ kind: 'package-changed' })).toBe(false);
    expect(startRetryable({ kind: 'cleanup-failed' })).toBe(false);
  });

  it('describes errors by class and structural fields, never by message', () => {
    const fault = new CoreFaultError('invariant-violated', 'world.step');
    const session = new GameSessionError({ kind: 'operation-failed', failures: [{ phase: 'runtime', cause: fault }] });
    const text = describeStructure(session);
    expect(text).toBe([
      'GameSessionError (kind operation-failed)',
      '  runtime failure:',
      '    CoreFaultError (code invariant-violated, site world.step)',
    ].join('\n'));
    const input = new CoreInputError('input.run.wingman', 'must be null or an option index');
    const rollback = new RollbackError(input, [new TypeError('MARKER-like message')], 'Mission start and rollback failed');
    expect(describeStructure(rollback)).toBe([
      'RollbackError',
      '  CoreInputError (path input.run.wingman, reason must be null or an option index)',
      '  TypeError',
    ].join('\n'));
    expect(describeStructure('a message string')).toBe('string value');
    expect(describeStructure(null)).toBe('null value');
    expect(describeStructure(new Error('outer', { cause: new Error('inner') }))).toBe('Error\n  caused by:\n    Error');
  });

  it('names the phase, the pause reason and why resume is unavailable', () => {
    const status = (overrides: Partial<GameSessionStatus>): GameSessionStatus => ({
      phase: 'paused', runId: 1, environmentVisible: true, pauseReason: 'user', transition: null, resumeRequired: false,
      stopReason: null, result: null, cleanupFailed: false, error: null, ...overrides,
    });
    expect(pauseText(status({}))).toBe('Paused by you');
    expect(pauseText(status({ pauseReason: 'hidden' }))).toMatch(/page was hidden/);
    expect(pauseText(status({ phase: 'running', pauseReason: null }))).toBeNull();
    expect(resumeBlockedText(status({}))).toBeNull();
    expect(resumeBlockedText(status({ environmentVisible: false, pauseReason: 'hidden' }))).toMatch(/hidden/);
    expect(resumeBlockedText(status({ phase: 'running', environmentVisible: false, pauseReason: null }))).toBeNull();
  });
});

describe('slice gap copy (G IDs)', () => {
  it('keys each marked gap by its G ID, with a title and a text', () => {
    expect(Object.keys(SLICE_GAPS)).toEqual([
      'G-01', 'G-02/1', 'G-02/2', 'G-02/3', 'G-02/4', 'G-02/5', 'G-02/6', 'G-02/7', 'G-02/8', 'G-02/9', 'G-02/10',
      'G-03', 'G-04', 'G-05', 'G-06', 'G-07', 'G-08', 'G-09', 'G-10',
    ]);
    for (const [id, copy] of Object.entries(SLICE_GAPS)) {
      expect(copy.title.length, id).toBeGreaterThan(0);
      expect(copy.text.length, id).toBeGreaterThan(0);
    }
    expect(SLICE_GAPS['G-07'].text).toMatch(/fixed at raw value 19/);
    expect(SLICE_GAPS['G-06'].text).toMatch(/does not reproduce the campaign state/);
    expect(SLICE_GAPS['G-06'].text).not.toMatch(/no results page/);
    expect(SLICE_GAPS['G-08'].text).toMatch(/only the forward cockpit view.*cursor and keypad.*P4/);
    expect(SLICE_GAPS['G-09'].text).toMatch(/does not implement.*autopilot.*no autopilot command.*P4/);
    expect(SLICE_GAPS['G-10'].text).toMatch(/fixed at Medium.*switching.*P4/);
  });

  it('keeps the objectives and limits as project text with the result wait, the third loss per attempt, the rare settlement failure, sources and confidence (reviewed by P3-11)', () => {
    expect(MISSION_OBJECTIVES.gap).toBe('G-04');
    expect(MISSION_OBJECTIVES.title).toMatch(/project text/);
    expect(MISSION_OBJECTIVES.objective).toMatch(/waiting period/);
    expect(MISSION_OBJECTIVES.objective).toMatch(/destroyed or has left the mission area/);
    expect(MISSION_OBJECTIVES.objective).toMatch(/does not end the mission at once/);
    expect(MISSION_OBJECTIVES.objective).toMatch(/5 seconds follows, extended while you are in warp.*15 more seconds/);
    expect(MISSION_OBJECTIVES.objective).toMatch(/rare case.*fails at the end of that wait/);
    expect(MISSION_OBJECTIVES.limits).toMatch(/first two times in one attempt/);
    expect(MISSION_OBJECTIVES.limits).toMatch(/third loss in the same attempt fails/);
    expect(MISSION_OBJECTIVES.limits).toMatch(/once the waiting period has begun neither rescues nor fails/);
    expect(MISSION_OBJECTIVES.status).toMatch(/Core decides the result/);
    expect(MISSION_OBJECTIVES.sources.join('\n')).toMatch(/Confirmed: docs\/original\/formats\/executable\.md[\s\S]*State-5 failure[\s\S]*Likely: docs\/original\/behavior\/B-003/);
    expect(MISSION_SKELETON).toMatch(/formal runtime skeleton, not yet a playable slice/);
    expect(MISSION_SKELETON).toMatch(/mission result included/);
    expect(MISSION_SKELETON).not.toMatch(/game controls/);
  });
});
