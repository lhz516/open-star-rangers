import { describe, expect, it } from 'vitest';
import {
  ENTRY_IDS, MARKER, defaultCampaignSpec, defaultScenarioSpec, syntheticCampaign, syntheticModelArchive, syntheticScenario,
  syntheticScenarioArchive,
} from '../formats/formats.test-support.ts';
import { buildImfat } from '../synthetic.ts';
import { archiveLocator, readSourceMappingTable } from '../source-mapping.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import { loggedReads, syntheticVerifiedSource } from '../source/source.test-support.ts';
import { LOGIC_SOURCE_MAPPINGS, logicEntryReader, verifyLogicSources } from './logic-sources.ts';

const filesWith = (scenario = syntheticScenarioArchive()) => ({ 'MAIN/SCENARIO.NOB': scenario, 'MAIN/SR.NOB': syntheticModelArchive() });

const verify = async (files: Record<string, Uint8Array>, mappings?: unknown) => {
  const source = await syntheticVerifiedSource(files);
  return { source, result: await verifyLogicSources(source, logicEntryReader(source), mappings) };
};

const failure = (action: () => Promise<unknown>) => sourceFailure(action, new RegExp(`${MARKER}|\\b(?:3019|3121|3123)\\b`));

describe('logic source mappings', () => {
  it('declares one likely mapping per logic Asset with the spec unknowns', () => {
    const table = readSourceMappingTable(LOGIC_SOURCE_MAPPINGS);
    expect(table.sourceFingerprint).toBeNull();
    expect(table.mappings.map(({ asset, confidence, unknowns, resolution, parts }) => ({
      asset, confidence, unknowns, resolution,
      parts: parts.map(({ alternatives }) => alternatives.map(archiveLocator).map(({ discPath, entry, subresource }) => `${discPath}#${entry.id}.${entry.type}/${subresource}`)),
    }))).toEqual([
      { asset: { id: 'data/craft-types', kind: 'data' }, confidence: 'likely', unknowns: ['U-022', 'U-028'], resolution: 'declared', parts: [['MAIN/SR.NOB#10649.M2ID/null']] },
      { asset: { id: 'data/wingman-roster', kind: 'data' }, confidence: 'likely', unknowns: ['U-023'], resolution: 'declared', parts: [['MAIN/SCENARIO.NOB#3123.SCCT/wingmen']] },
      {
        asset: { id: 'mission/first-campaign', kind: 'mission' }, confidence: 'likely', unknowns: ['U-022'], resolution: 'declared',
        parts: [['MAIN/SCENARIO.NOB#3123.SCCT/group-0/slot-1'], ['MAIN/SCENARIO.NOB#3019.SCEN/null']],
      },
    ]);
  });

  it('verifies every mapping from one source, binding the states to its fingerprint and returning the parsed campaign', async () => {
    const { source, result } = await verify(filesWith());
    expect(result.table.sourceFingerprint).toBe(source.identity.fingerprint);
    expect(result.table.mappings.map(mapping => mapping.resolution)).toEqual(['verified', 'verified', 'verified']);
    expect(result.sources).toEqual({
      sourceFingerprint: source.identity.fingerprint,
      states: [
        { id: 'data/craft-types', state: 'verified', unknowns: ['U-022', 'U-028'] },
        { id: 'data/wingman-roster', state: 'verified', unknowns: ['U-023'] },
        { id: 'mission/first-campaign', state: 'verified', unknowns: ['U-022'] },
      ],
    });
    expect(result.campaign.scenarioEntryId).toBe(ENTRY_IDS.scenario);
    expect(result.campaign.wingmen).toHaveLength(2);
    expect(Object.isFrozen(result) && Object.isFrozen(result.table)).toBe(true);
  });

  it('reports a campaign slot naming another mission as subresource-mismatch', async () => {
    const spec = defaultCampaignSpec();
    spec.groups[0][1] = [3121, 9101];
    expect(await failure(() => verify(filesWith(syntheticScenarioArchive(syntheticCampaign(spec))))))
      .toEqual({ code: 'subresource-mismatch', location: 'sources.mappings[2].parts[0].alternatives[0]', limit: null });
  });

  it('rejects sub-resources in two campaign tables or ones the converter does not resolve', async () => {
    const files = filesWith();
    const declared = readSourceMappingTable(LOGIC_SOURCE_MAPPINGS);
    const withLocator = (index: number, change: Record<string, unknown>) => ({
      ...declared,
      mappings: declared.mappings.map((mapping, at) => (at !== index ? mapping : {
        ...mapping, parts: mapping.parts.map((part, position) => (position !== 0 ? part : { alternatives: [{ ...part.alternatives[0], ...change }] })),
      })),
    });
    expect(await failure(() => verify(files, withLocator(1, { subresource: 'pilots' }))))
      .toEqual({ code: 'subresource-mismatch', location: 'sources.mappings[1].parts[0].alternatives[0]', limit: null });
    const second = buildImfat(3000, [
      { id: ENTRY_IDS.scenario, type: 'SCEN', data: syntheticScenario(defaultScenarioSpec()).bytes, relocations: syntheticScenario(defaultScenarioSpec()).relocations },
      { id: ENTRY_IDS.campaign, type: 'SCCT', data: syntheticCampaign(defaultCampaignSpec()).bytes, relocations: syntheticCampaign(defaultCampaignSpec()).relocations },
      { id: ENTRY_IDS.campaign + 1, type: 'SCCT', data: syntheticCampaign(defaultCampaignSpec()).bytes, relocations: syntheticCampaign(defaultCampaignSpec()).relocations },
    ]);
    expect(await failure(() => verify(filesWith(second), withLocator(2, { entry: { id: ENTRY_IDS.campaign + 1, type: 'SCCT' } }))))
      .toEqual({ code: 'subresource-mismatch', location: 'sources.mappings[2].parts[0].alternatives[0]', limit: null });
  });

  it('checks mapped entry sizes against the payload limits before reading them', async () => {
    const campaign = syntheticCampaign(defaultCampaignSpec());
    const oversized = new Uint8Array(262_145);
    oversized.set(campaign.bytes);
    const scenario = syntheticScenario(defaultScenarioSpec());
    const archive = buildImfat(3000, [
      { id: ENTRY_IDS.scenario, type: 'SCEN', data: scenario.bytes, relocations: scenario.relocations },
      { id: ENTRY_IDS.campaign, type: 'SCCT', data: oversized, relocations: campaign.relocations },
    ]);
    const logged = loggedReads(await syntheticVerifiedSource(filesWith(archive)));
    // Mapping verification reports the directory check at the first mapping naming the SCCT.
    expect(await failure(() => verifyLogicSources(logged.source, logicEntryReader(logged.source)))).toEqual({
      code: 'limit-exceeded', location: 'sources.mappings[1].parts[0].alternatives[0]',
      limit: { name: 'payloadEntryBytes', limit: 262_144, observed: 262_145 },
    });
    // The oversized entry's bytes are never read.
    expect(await logged.counts()).toEqual({
      'MAIN/SR.NOB header': 1, 'MAIN/SR.NOB directory': 1, [`MAIN/SR.NOB M2ID#${ENTRY_IDS.modelList}`]: 1,
      'MAIN/SCENARIO.NOB header': 1, 'MAIN/SCENARIO.NOB directory': 1,
    });
  });
});
