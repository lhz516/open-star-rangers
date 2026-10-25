import { describe, expect, it, vi } from 'vitest';
import type { MissionTexts, SummaryText } from '../../app/resources/mission-texts.ts';
import type { GameSessionStatus, SessionResult } from '../../app/session/game-session.ts';
import type { AssetId } from '../../content/asset-id.ts';
import type { EndingGap, SummaryReference } from '../../core/world/world-state.ts';
import { createGameStore } from '../game/game-store.ts';
import { resultPageView, selectSessionResult, summaryView } from './result-page.ts';
import { endingVariant, PLACEHOLDER_PAGES, RESULT_PAGE, SLICE_GAPS } from './slice-gaps-copy.ts';

// P3-11 subtask 17 (S-10, AC-09, AC-12 page part): the G-06 result page's reading of the session's frozen result and of
// the summary resolved from the bound package, without a browser. Expectations come from the spec's 结果页、重试与返回
// and 缺省与标注, not from the code under test.

const MISSION = 'mission/campaign-1/mission-1' as AssetId;
const REFERENCE: SummaryReference = Object.freeze({ mission: MISSION, trigger: 0, range: 1 });

function result(overrides: Partial<SessionResult> = {}): SessionResult {
  return Object.freeze({
    readiness: 'ready', outcome: 'success', reason: { type: 'all-clear' }, summary: REFERENCE, rescuesUsed: 1,
    endingGaps: [{ gap: 'G-02/8', variant: 'wingman' }], playerKills: 7, latchTick: 600, completedTick: 601, ...overrides,
  } as SessionResult);
}

const textsOf = (text: SummaryText): Pick<MissionTexts, 'summary'> => ({ summary: vi.fn(() => text) });
/** A result without a summary reference resolves to none. */
const NONE = textsOf({ status: 'none' });

describe('the result page view (G-06)', () => {
  it('keeps an imported summary that looks like markup as the string the page puts in a text node', () => {
    const markup = '<img src=x onerror=alert(1)>&amp;';
    expect(resultPageView(result(), textsOf({ status: 'resolved', text: markup })).summary).toEqual({ state: 'text', text: markup });
  });

  it('shows a success with the all-clear rule, this attempt\'s counts and the summary of the referenced range', () => {
    const texts = textsOf({ status: 'resolved', text: 'synthetic summary' });
    const view = resultPageView(result(), texts);
    expect(texts.summary).toHaveBeenCalledWith(REFERENCE);
    expect(view).toEqual({
      outcome: 'success', heading: 'Mission result: ✓ Success', outcomeText: 'Success', reason: RESULT_PAGE.reason['all-clear'],
      reasonKey: 'all-clear', rescues: '1 of 2', kills: 7, summary: { state: 'text', text: 'synthetic summary' },
    });
  });

  it('tells the two third losses and the failed settlement apart, in words and with a mark', () => {
    const destroyed = resultPageView(result({ outcome: 'failure', reason: { type: 'third-loss', loss: 'destroyed' }, summary: null, rescuesUsed: 2 }), NONE);
    expect(destroyed).toMatchObject({ outcome: 'failure', heading: 'Mission result: ✗ Failure', reasonKey: 'third-loss:destroyed', rescues: '2 of 2' });
    expect(destroyed.reason).toMatch(/destroyed after both rescues/);
    const energy = resultPageView(result({ outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, summary: null, rescuesUsed: 2 }), NONE);
    expect([energy.reasonKey, energy.reason]).toEqual(['third-loss:energy', expect.stringMatching(/ran out of energy after both rescues/)]);
    const settlement = resultPageView(result({ outcome: 'failure', reason: { type: 'settlement-failed' }, summary: null, rescuesUsed: 0 }), NONE);
    expect([settlement.reasonKey, settlement.reason]).toEqual(['settlement-failed', expect.stringMatching(/same moment.*rare case/)]);
    // A failure has no summary; the page says so rather than reading content.
    expect(settlement.summary).toEqual({ state: 'failure', note: RESULT_PAGE.summary.failure });
  });

  it('separates an empty summary, a success without a matching range, and summaries that could not be read', () => {
    const success = result();
    expect(summaryView(success, { status: 'resolved', text: '' })).toEqual({ state: 'empty', note: RESULT_PAGE.summary.empty });
    expect(summaryView(result({ summary: null }), { status: 'none' })).toEqual({ state: 'none', note: RESULT_PAGE.summary.none });
    expect(summaryView(success, { status: 'failed', failure: { kind: 'mission-mismatch', expected: MISSION, referenced: 'mission/other' as AssetId } }))
      .toEqual({ state: 'failed', note: expect.stringMatching(/another mission Asset/), detail: null });
    expect(summaryView(success, { status: 'failed', failure: { kind: 'out-of-range', field: 'range', index: 4, count: 2 } }))
      .toEqual({ state: 'failed', note: expect.stringMatching(/range 4 lies outside the mission's 2 ranges/), detail: null });
    const corrupt = summaryView(success, { status: 'failed', failure: { kind: 'content', cause: new TypeError('PRIVATE-message') } });
    expect(corrupt).toMatchObject({ state: 'failed', note: expect.stringMatching(/does not decode/), detail: 'TypeError' });
  });

  it('reads the session\'s frozen result from the store, only while completed', () => {
    const store = createGameStore(1);
    expect(selectSessionResult(store.reader.getState())).toBeNull();
    const final = result();
    const status = { phase: 'completed', runId: 1, environmentVisible: true, pauseReason: null, transition: null, resumeRequired: false,
      stopReason: null, result: final, cleanupFailed: false, error: null } satisfies GameSessionStatus;
    store.commit({ status });
    expect(selectSessionResult(store.reader.getState())).toBe(final);
  });
});

describe('the ending placeholders\' and the result page\'s copy (G-02/5 to G-02/10, G-06)', () => {
  it('names each ending variant, the failed settlement taking the destruction variant', () => {
    const items: readonly EndingGap[] = [
      { gap: 'G-02/7', variant: 'destroyed' }, { gap: 'G-02/7', variant: 'energy' }, { gap: 'G-02/8', variant: 'solo' },
      { gap: 'G-02/8', variant: 'wingman' }, { gap: 'G-02/9', row: 13 },
    ];
    expect(items.map(endingVariant)).toEqual([
      expect.stringMatching(/destruction cut-scene.*failed settlement.*no craft was lost/), expect.stringMatching(/out of energy/), expect.stringMatching(/without a wingman/),
      expect.stringMatching(/with your wingman/), expect.stringMatching(/row 13/),
    ]);
    expect(PLACEHOLDER_PAGES.title).toMatchObject({ 'G-02/7': 'Mission failure', 'G-02/8': 'Return', 'G-02/9': 'Mission cut-scene' });
  });

  it('says one placeholder stands for a rescue\'s whole group, that the rescue ship exists only in the cut-scenes, and what G-06 replaces', () => {
    for (const id of ['G-02/5', 'G-02/6'] as const) {
      expect(SLICE_GAPS[id].text).toMatch(/one project placeholder for the whole group/);
      expect(SLICE_GAPS[id].text).toMatch(/rescue ship exists only in those cut-scenes/);
      expect(SLICE_GAPS[id].text).toMatch(/3 seconds of visible time or when you skip it/);
    }
    expect(SLICE_GAPS['G-02/10'].text).toMatch(/does not decide medals/);
    expect(SLICE_GAPS['G-06'].text).toMatch(/statistics page.*high-score list, promotions and medals \(P4\)/);
    expect(RESULT_PAGE.attempt.note).toMatch(/not the original statistics/);
    expect(RESULT_PAGE.summary.source).toMatch(/next mission's departure/);
  });
});
