import { describe, expect, it } from 'vitest';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import { LOGIC_IDS, MARKER, syntheticMission } from '../../content/logic/logic-content.test-support.ts';
import { readFlightMessages } from '../../content/rule-data/flight-messages.ts';
import { SYNTHETIC_RULE_DATA } from '../../content/rule-data/rule-data.test-support.ts';
import type { SummaryReference } from '../../core/world/world-state.ts';
import { imported, logicGroupInput } from './resource-holder.test-support.ts';
import { missionTexts } from './mission-texts.ts';

// The result page's summary and the message line's flight messages from the bound package (P3-11 subtask 17, AC-09):
// one range's messages appended without separators, the empty and the absent summary told apart, and a reference of
// another package or outside the table, or a corrupt mission Asset, each reported as its own failure.

const MISSION = LOGIC_IDS.mission as AssetId;
const reference = (trigger: number, range: number, mission: AssetId = MISSION): SummaryReference => ({ mission, trigger, range });
const textsOf = (logic: Parameters<typeof missionTexts>[0] = imported('logic')) => missionTexts(logic);

/** The synthetic logic group without its `flight-messages` Asset. */
function withoutFlightMessages() {
  const input = logicGroupInput();
  const manifest = input.manifest as { assets: { role: string }[] };
  return imported('logic', { ...input, manifest: { ...manifest, assets: manifest.assets.filter(({ role }) => role !== 'flight-messages') } });
}

describe('mission texts', () => {
  it('appends the referenced range\'s messages in array order without separators, as the stored code units', () => {
    const texts = textsOf();
    expect(texts.summary(reference(0, 0))).toEqual({ status: 'resolved', text: `${MARKER}-won` });
    expect(texts.summary(reference(0, 1))).toEqual({ status: 'resolved', text: `${MARKER}-part-1 ${MARKER}-part-2\u00e9\u0001` });
  });

  it('tells a range without messages (an empty summary) from a result without a summary', () => {
    const texts = textsOf();
    expect(texts.summary(reference(1, 0))).toEqual({ status: 'resolved', text: '' });
    expect(texts.summary(null)).toEqual({ status: 'none' });
  });

  it('refuses a reference to another mission Asset, or outside the trigger or range table', () => {
    const texts = textsOf();
    const other = 'mission/other' as AssetId;
    expect(texts.summary(reference(0, 0, other))).toEqual({
      status: 'failed', failure: { kind: 'mission-mismatch', expected: MISSION, referenced: other },
    });
    const triggers = syntheticMission().eventTriggers;
    expect(texts.summary(reference(triggers.length, 0))).toEqual({
      status: 'failed', failure: { kind: 'out-of-range', field: 'trigger', index: triggers.length, count: triggers.length },
    });
    expect(texts.summary(reference(-1, 0))).toMatchObject({ status: 'failed', failure: { kind: 'out-of-range', field: 'trigger' } });
    expect(texts.summary(reference(0, 2))).toEqual({
      status: 'failed', failure: { kind: 'out-of-range', field: 'range', index: 2, count: 2 },
    });
    expect(texts.summary(reference(0, 0.5))).toMatchObject({ status: 'failed', failure: { kind: 'out-of-range', field: 'range' } });
  });

  it('reports a corrupt or missing mission Asset as a content failure, decoding it once', () => {
    const texts = textsOf(imported('logic', logicGroupInput({ missionBytes: new TextEncoder().encode('{"campaign":') })));
    const first = texts.summary(reference(0, 0));
    expect(first).toEqual({ status: 'failed', failure: { kind: 'content', cause: expect.any(ContentContractError) } });
    expect(first).toMatchObject({ failure: { cause: { path: `logic[${LOGIC_IDS.mission}].payload` } } });
    // Decoded once: the next read reports the same failure.
    expect(texts.summary(reference(0, 0))).toEqual(first);
    // A result without a summary needs no content.
    expect(texts.summary(null)).toEqual({ status: 'none' });
    expect(missionTexts(undefined).summary(reference(0, 0))).toMatchObject({ status: 'failed', failure: { kind: 'content' } });
  });

  it('decodes the flight messages of the same logic group, or reports their absence', () => {
    expect(textsOf().flightMessages()).toEqual({ status: 'resolved', messages: readFlightMessages(SYNTHETIC_RULE_DATA['flight-messages']()) });
    expect(missionTexts(undefined).flightMessages()).toEqual({ status: 'failed', cause: undefined });
    const without = textsOf(withoutFlightMessages());
    expect(without.flightMessages()).toEqual({ status: 'failed', cause: undefined });
    // The summary does not read them.
    expect(without.summary(reference(0, 0))).toMatchObject({ status: 'resolved' });
  });
});
