import { describe, expect, it } from 'vitest';
import type { BaseServiceView, CombatPlayer, Projection } from '../../core/projections/projection.ts';
import type { MessageIdentity } from '../../core/world/world-state.ts';
import type { GameUiState, UiCommandResult, UiMessageLine } from '../game/game-store.ts';
import {
  baseActionError, baseFeedbackStart, baseMessagesView, basePageView, lastBaseCommand, selectBaseShown, serviceItemName,
} from './base-page.ts';
import { BASE_PAGE, MESSAGE_SUMMARIES, messageSummary, messageSummaryKind, SLICE_GAPS } from './slice-gaps-copy.ts';

// P3-10 S-10 (subtask 22): the G-05 base page's reading of the projection and the G-02/3, G-02/4, G-03 and G-05 copy,
// read without a DOM, and P3-13/25's bridged message line (DC-07). Expectations come from the specs' 缺省与标注 and
// executable.md (BS5, BS6, RQ1, RX1–RX3, WB3–WB5), not from the code under test.

const FLAGS = Object.freeze({ repairsComplete: false, energyAndMissilesFull: true, hullFull: false });

/** A projection double with only the partitions the page reads. */
function projection(base: BaseServiceView | null, combat: Partial<CombatPlayer> | null = null): Projection {
  return {
    communications: { readiness: 'ready', player: base === undefined ? null : { base } },
    flight: { combat: combat === null ? { readiness: 'not-implemented' } : { readiness: 'ready', player: combat } },
  } as unknown as Projection;
}

const service = (cursor: number, rows: readonly [record: number, selector: number, state: number][]): BaseServiceView => ({
  baseEntityId: 12, cursor, flags: FLAGS, rows: rows.map(([record, selector, state]) => ({ record, selector, state })),
});

describe('the base page view (G-05)', () => {
  it('keeps the one service order, marks the top row in service only while it needs service, and the cursor row', () => {
    const view = basePageView(projection(service(2, [[4, 2, 2], [0, 6, 1], [9, 0x21, 0], [1, 9, 0]])))!;
    expect(view.rows.map(({ row, record, state, inService, selected }) => [row, record, state, inService, selected])).toEqual([
      [0, 4, 2, true, false], [1, 0, 1, false, false], [2, 9, 0, false, true], [3, 1, 0, false, false],
    ]);
    expect(view).toMatchObject({ baseEntityId: 12, cursor: 2, flags: FLAGS, energy: null, hull: null, missiles: null });
    // A top row that needs no service is not being serviced, and the steps never pass it to a later row that does: the
    // repair step then only sets the completion mark (BS6), so no row is marked.
    expect(basePageView(projection(service(0, [[3, 7, 0], [5, 8, 1]])))!.rows.map(({ inService }) => inService)).toEqual([false, false]);
  });

  it('names items by subsystem with the D6 confidence, and an unknown subsystem by its number', () => {
    expect(serviceItemName(2)).toBe('Engines');
    expect(serviceItemName(0x22)).toBe('Displays, radar and communications (subsystems 10–14)');
    for (const selector of [6, 9, 31]) expect(serviceItemName(selector)).toBe(`Subsystem ${selector} (unknown)`);
    // Not a prototype member either.
    expect(serviceItemName('constructor' as unknown as number)).toBe('Subsystem constructor (unknown)');
    expect(BASE_PAGE.namesNote).toMatch(/project names \(Likely\)/);
  });

  it('reads energy, hull and the selected missile ammunition from the combat readings', () => {
    const combat = {
      resources: { energy: { current: 80, maximum: 960 }, hull: { current: -3, maximum: 600 } },
      weapons: [{ ammunition: null }, { ammunition: 4 }],
    } as unknown as CombatPlayer;
    expect(basePageView(projection(service(0, [[0, 1, 1]]), combat))).toMatchObject({
      energy: { current: 80, maximum: 960 }, hull: { current: -3, maximum: 600 }, missiles: 4,
    });
  });

  it('is absent outside the base view, and the shell\'s selector follows it as a scalar', () => {
    expect(basePageView(projection(null))).toBeNull();
    const state = (value: Projection | null) => ({ projection: value }) as GameUiState;
    expect(selectBaseShown(state(null))).toBe(false);
    expect(selectBaseShown(state(projection(null)))).toBe(false);
    expect(selectBaseShown(state({ communications: { readiness: 'not-implemented' } } as Projection))).toBe(false);
    expect(selectBaseShown(state({ communications: { readiness: 'ready', player: null } } as Projection))).toBe(false);
    expect(selectBaseShown(state(projection(service(0, [[0, 1, 0]]))))).toBe(true);
  });

  it('shows the latest base command settled since the page opened, with its outcome and reason', () => {
    const result = (runId: number, commandId: number, commandType: string, outcome: string, reason: string | null) =>
      ({ runId, commandId, commandType, outcome, reason }) as UiCommandResult;
    // At the base entry: Enter's speed match from flight settled, M from flight is pending, and an earlier failure shows.
    const flightError = { operation: 'fire', cause: new Error('x') };
    const entry = {
      status: { runId: 2 }, pendingCommands: [{ runId: 2, commandId: 6 }],
      recentResults: [result(1, 40, 'launch', 'accepted', null), result(2, 5, 'confirm-selection', 'accepted', null)], actionError: flightError,
    } as unknown as GameUiState;
    const start = baseFeedbackStart(entry);
    expect(start).toEqual({ runId: 2, commandId: 6, actionError: flightError });
    expect(lastBaseCommand(entry.recentResults, start)).toBeNull();
    expect(lastBaseCommand([...entry.recentResults, result(2, 6, 'toggle-map', 'rejected', 'not-implemented')], start)).toBeNull();
    expect(lastBaseCommand([
      result(2, 7, 'confirm-selection', 'accepted', null), result(2, 8, 'toggle-map', 'rejected', 'not-implemented'), result(2, 9, 'fire', 'ignored', 'x'),
    ], start)).toBe('toggle-map: rejected (not-implemented)');
    expect(lastBaseCommand([result(2, 7, 'launch', 'cancelled', 'transition')], start)).toBe('launch: cancelled (transition)');
    expect(baseActionError(flightError, start)).toBeNull();
    const baseError = { operation: 'launch', cause: new Error('y') };
    expect(baseActionError(baseError, start)).toBe(baseError);
    expect(baseFeedbackStart({ status: null, pendingCommands: [], recentResults: [], actionError: null } as unknown as GameUiState))
      .toEqual({ runId: null, commandId: 0, actionError: null });
  });
});

describe('the base keys (G-05)', () => {
  it('lists the wired base keys, the strategic map (P3-09) among them, apart from the project controls', () => {
    expect(BASE_PAGE.keys.map(({ keys, status }) => [keys, status])).toEqual([
      ['Up, Down', 'wired'], ['Enter', 'wired'], ['L', 'wired'], ['M', 'wired'], ['P', 'project'], ['Esc', 'project'],
    ]);
    expect(BASE_PAGE.keys.find(({ keys }) => keys === 'M')!.text).toMatch(/strategic map.*back into the base/i);
  });
});

describe('radio message summaries (G-03)', () => {
  const face = (table: 20011 | 20019 | 20985, index: number): MessageIdentity => ({ table, face: 0, index });
  const direct = (index: number): MessageIdentity => ({ table: 20983, face: null, index });

  it('tell the docking reply, the two status replies, the alert and the thanks of a base apart (RQ1, RX3, RX6)', () => {
    expect([0, 1, 4, 2, 3].map(index => messageSummaryKind(face(20011, index)))).toEqual([
      'docking-reply', 'base-status-clear', 'base-status-threat', 'base-enemy-near', 'base-thanks',
    ]);
    expect(messageSummaryKind(face(20011, 5))).toBeNull();
  });

  it('tell a friendly craft\'s replies and its named call for help apart (RQ1, RX2: 2011 position + 3)', () => {
    expect([0, 1, 2, 3, 21, 22].map(index => messageSummaryKind(face(20019, index)))).toEqual([
      'craft-status-clear', 'craft-status-threat', 'craft-thanks', 'friendly-under-attack', 'friendly-under-attack', null,
    ]);
  });

  it('read the direct list by its fixed entries and its 2011/2001 name offsets (RX2, RX3)', () => {
    const kinds = Object.fromEntries([0, 3, 4, 5, 6, 7, 25, 26, 45, 46, 64, 65, 84, 85].map(index => [index, messageSummaryKind(direct(index))]));
    expect(kinds).toEqual({
      0: 'friendly-under-attack-follow-up', 3: 'friendly-under-attack-follow-up', 4: 'player-hit-friendly', 5: 'player-destroyed-friendly',
      6: 'wingman-lost', 7: 'friendly-under-attack', 25: 'friendly-under-attack', 26: 'friendly-under-attack', 45: 'friendly-under-attack',
      46: 'friendly-destroyed', 64: 'friendly-destroyed', 65: 'friendly-destroyed', 84: 'friendly-destroyed', 85: null,
    });
  });

  it('read the wingman\'s lines by line type with its draws, and the command replies by code (RX1, WB3–WB5)', () => {
    const indices = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 40, 41, 60, 61];
    const kinds = Object.fromEntries(indices.map(index => [index, messageSummaryKind(face(20985, index))]));
    expect(kinds).toEqual({
      // Line 0 draws 0–2: the refusal; line 3 draws 3–4: code 2 and unknown codes.
      0: 'wingman-order-unable', 2: 'wingman-order-unable', 3: 'wingman-order-acknowledged', 4: 'wingman-order-acknowledged',
      // Line 7 draws 5–7: the kill report, the only caller of those indices (0x38bf8's type-5 branch is dead code).
      5: 'wingman-kill', 6: 'wingman-kill', 7: 'wingman-kill', 8: 'wingman-enemy-appears', 9: 'wingman-enemy-appears', 10: 'wingman-enemy-on-tail',
      // Code 7's status by hull: 0xB at 80% or more, 0xC from 50%, 0xD below.
      11: 'wingman-status-high', 12: 'wingman-status-medium', 13: 'wingman-status-low',
      14: 'wingman-formation', 15: 'wingman-formation', 16: 'wingman-attack', 17: 'wingman-attack', 18: 'wingman-move',
      19: 'wingman-low-hull', 20: 'wingman-engage', 21: 'wingman-move-unable',
      22: 'wingman-friendly-lost', 40: 'wingman-friendly-lost', 41: 'wingman-friendly-lost', 60: 'wingman-friendly-lost', 61: null,
    });
  });

  it('give each kind its own project text under G-03, with no docking refusal summary', () => {
    const texts = Object.values(MESSAGE_SUMMARIES.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(MESSAGE_SUMMARIES.gap).toBe('G-03');
    expect(Object.keys(MESSAGE_SUMMARIES.text).some(kind => /docking.*(refus|reject|cancel)/.test(kind))).toBe(false);
    expect(messageSummary(face(20011, 0))).toBe(MESSAGE_SUMMARIES.text['docking-reply']);
  });
});

describe('the base page\'s message line (G-03, P3-13 DC-07)', () => {
  const docking: MessageIdentity = { table: 20011, face: 1, index: 0 };
  const unknown: MessageIdentity = { table: 20985, face: 2, index: 0x3d };
  const line = (head: UiMessageLine['head'], incoming: UiMessageLine['incoming']): UiMessageLine => Object.freeze({ runId: 1, head, incoming });

  it('is empty without a run\'s cockpit or an item', () => {
    expect(baseMessagesView(null)).toEqual({ line: null, incoming: null });
    expect(baseMessagesView(line(null, null))).toEqual({ line: null, incoming: null });
  });

  it('labels imported text as imported and a summary as project text, never as the original line', () => {
    const view = baseMessagesView(line(
      { serial: 3, origin: 'original', text: 'imported text', message: null, covered: true },
      { message: docking, summary: MESSAGE_SUMMARIES.text['docking-reply'], covered: true, shown: true },
    ));
    expect(view.line).toEqual({ text: 'imported text', origin: 'original', source: BASE_PAGE.messages.origin.original, uncovered: null });
    expect(view.incoming).toEqual({
      text: MESSAGE_SUMMARIES.text['docking-reply'], origin: 'project', source: BASE_PAGE.messages.origin.project, uncovered: null,
    });
    expect(BASE_PAGE.messages.origin.project).toMatch(/not the original line/);
  });

  it('keeps a missing mapping visible with the message it stands for', () => {
    const uncovered = MESSAGE_SUMMARIES.uncovered.summary;
    const view = baseMessagesView(line(
      { serial: 4, origin: 'project', text: uncovered, message: unknown, covered: false },
      { message: { table: 20983, face: null, index: 85 }, summary: uncovered, covered: false, shown: false },
    ));
    expect(view.line).toMatchObject({ text: uncovered, origin: 'project', uncovered: 'Not covered: table 20985, face 2, message 61.' });
    expect(view.incoming).toMatchObject({ text: uncovered, uncovered: 'Not covered: table 20983, message 85.' });
  });
});

describe('the P3-10 gap notes', () => {
  it('say that the running holds take no time and skip no rule, and what the base page and the summaries replace', () => {
    for (const id of ['G-02/3', 'G-02/4'] as const) {
      expect(SLICE_GAPS[id].text).toMatch(/no time passes for the missing cut-scene, and skipping it skips no rule/);
      expect(SLICE_GAPS[id].text).toMatch(/3 seconds of visible time/);
    }
    expect(SLICE_GAPS['G-03'].text).toMatch(/project words.*short project label.*message line and the base page/s);
    expect(SLICE_GAPS['G-05'].text).toMatch(/unknown shows its number.*no countdown/s);
    expect(BASE_PAGE.gap).toBe('G-05');
  });
});
