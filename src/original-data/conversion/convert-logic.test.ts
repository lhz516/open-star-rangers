import { describe, expect, it } from 'vitest';
import { chargeBudget, EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { validateGroup } from '../../content/completeness.ts';
import { declaration, ruleInputs } from '../../content/logic/logic-content.test-support.ts';
import type { CraftTypeTable, MissionContent, MissionDeclaration, WingmanRoster } from '../../content/logic/logic-content.ts';
import { decodeLogicPayload } from '../../content/logic/logic-payload.ts';
import { applyManifestIdentity } from '../../content/manifest-identity.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import {
  DEFAULT_MODEL_IDS, ENTRY_IDS, MARKER, defaultCampaignSpec, defaultScenarioSpec, syntheticCampaign, syntheticModelArchive, syntheticScenario,
  syntheticScenarioArchive, type CampaignSpec, type ScenarioSpec,
} from '../formats/formats.test-support.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import type { VerifiedSource } from '../source/identify-source.ts';
import { loggedReads, syntheticVerifiedSource } from '../source/source.test-support.ts';
import { PRODUCTION_LOGIC_SHARE, convertLogic, type LogicConversion } from './convert-logic.ts';
import { productionIdentityBasis } from './converter-version.ts';

const SCENARIO_AT = `archive:/MAIN/SCENARIO.NOB#${ENTRY_IDS.scenario}`;

interface Inputs {
  scenario?: (spec: ScenarioSpec) => void;
  campaign?: (spec: CampaignSpec) => void;
  modelIds?: readonly number[];
}

/** A disc with the synthetic `SCENARIO.NOB` and `SR.NOB`, the default specs changed by `inputs`. */
function filesWith({ scenario = () => {}, campaign = () => {}, modelIds = DEFAULT_MODEL_IDS }: Inputs = {}): Record<string, Uint8Array> {
  const scenarioSpec = defaultScenarioSpec();
  scenario(scenarioSpec);
  const campaignSpec = defaultCampaignSpec();
  campaign(campaignSpec);
  return {
    'MAIN/SCENARIO.NOB': syntheticScenarioArchive(syntheticCampaign(campaignSpec), syntheticScenario(scenarioSpec)),
    'MAIN/SR.NOB': syntheticModelArchive(modelIds),
  };
}

async function convert(inputs?: Inputs): Promise<{ source: VerifiedSource; result: LogicConversion }> {
  const source = await syntheticVerifiedSource(filesWith(inputs));
  return { source, result: await convertLogic(source, PRODUCTION_LOGIC_SHARE) };
}

/** The draft's payloads decoded with their descriptors, which are in ascending ID order. */
function decoded({ draft }: LogicConversion) {
  const [craftTypes, roster, mission] = draft.assets.map((descriptor, index) => decodeLogicPayload(draft.payloads[index].bytes, descriptor).content);
  return { craftTypes: craftTypes as CraftTypeTable, roster: roster as WingmanRoster, mission: mission as MissionContent };
}

const failure = (inputs: Inputs) => sourceFailure(() => convert(inputs), new RegExp(MARKER));

const region = (index: number) => ({ placement: { region: index, anchor: null } });
const model = (id: string) => ({ id, kind: 'model' });

/** Mission references counted by the spec rule from decoded declarations, written independently of the converter. */
function countedReferences(declarations: readonly MissionDeclaration[]): number {
  let count = 0;
  for (const { craftType, placement, memberOf, aiTarget } of declarations) {
    for (const value of [craftType, placement.region, placement.anchor, memberOf, aiTarget]) if (value !== null) count++;
  }
  return count;
}

describe('logic group conversion', () => {
  it('converts the synthetic source into the three canonical payloads field by field', async () => {
    const { mission, craftTypes, roster } = decoded((await convert()).result);
    expect(mission).toEqual({
      campaign: { group: 0, slot: 1 },
      coordinates: { unit: 'scen-reference', referenceScale: 900, layoutUnit: 'scen-runtime' },
      references: { craftTypes: 'data/craft-types', wingmanRoster: 'data/wingman-roster' },
      mapFrame: { rightAxis: '+x', upAxis: '-y', center: { right: 0, up: 0 }, halfExtent: 2700 },
      namePool: [`${MARKER}-pool-a`, `${MARKER}-pool-b`, `${MARKER}-pool-c`],
      spawnRegions: [
        { x0: -2000, y0: 1000, x1: 2000, y1: 2000 }, { x0: -2600, y0: -2600, x1: 2600, y1: 2600 }, { x0: -2000, y0: -2000, x1: 2000, y1: 0 },
      ],
      declarations: [
        declaration(0, { craftType: 0, ...region(2), ruleInputs: ruleInputs({ aiValueA: 6, aiValueB: 7, aiValueC: 33 }) }),
        declaration(1, { origins: ['object', 'group-template'], ...region(0), spawnTime: 90 }),
        declaration(2, { ...region(0), spawnTime: 120 }),
        declaration(3, { origins: ['object', 'group-template'], craftType: 7, placement: { region: null, anchor: 0 }, aiTarget: 0, aiTargetCraftTypes: [0, 17] }),
        declaration(4, { origins: ['object', 'group-member'], craftType: 7, memberOf: 0, ruleInputs: ruleInputs({ percentA: 0x80000000, percentB: -5 }) }),
        declaration(5, { origins: ['object', 'group-member'], craftType: 7, memberOf: 2 }),
        declaration(6, { origins: ['object', 'group-member'], craftType: 8, memberOf: 1, ruleInputs: ruleInputs({ craftCount: 2 }) }),
        declaration(7, { craftType: 17, ...region(2) }),
        declaration(8, { craftType: 14, ...region(1), nameCandidates: [`${MARKER}-x`, `${MARKER}-y`], ruleInputs: ruleInputs({ craftCount: 5 }) }),
      ],
      groups: [
        { template: 1, members: [4, 4], spawnCount: 2, layout: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] },
        { template: 1, members: [6, 6], spawnCount: 2, layout: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 70 }] },
        { template: 3, members: [5, 5], spawnCount: 3, layout: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] },
      ],
    });
    expect(craftTypes).toEqual({
      entries: [
        { craftType: 0, side: 'player', baseInteraction: false, model: model('model/player-ship') },
        { craftType: 1, side: 'friendly', baseInteraction: false, model: model('model/player-ship') },
        { craftType: 7, side: 'enemy', baseInteraction: false, model: model('model/enemy-ship-1') },
        { craftType: 8, side: 'enemy', baseInteraction: false, model: model('model/enemy-ship-2') },
        { craftType: 14, side: 'friendly', baseInteraction: false, model: model('model/friendly-craft-1') },
        { craftType: 17, side: 'friendly', baseInteraction: true, model: model('model/base-1') },
      ],
    });
    expect(roster).toEqual({
      references: { craftTypes: 'data/craft-types' },
      options: [
        declaration(0, { origins: ['wingman-option'], craftType: 1, nameCandidates: [`${MARKER}-w0`], ruleInputs: ruleInputs({ aiValueA: 3, aiValueB: 4 }) }),
        declaration(1, { origins: ['wingman-option'], craftType: 1, nameCandidates: [`${MARKER}-w1`], ruleInputs: ruleInputs({ aiValueA: 5, aiValueB: 5 }) }),
      ],
    });
  });

  it('carries positions, grid spacing, unsigned high bits and the layout transform through unchanged', async () => {
    const { mission } = decoded((await convert({
      scenario: spec => {
        spec.records[2] = { region: 0, position: [1.5, -2.25, 0.125], signed: { 0x40: -40, 0x64: -0x80000000 }, words: { 0x10: 0xffffffff, 0x1c: 0xffffffff } };
        spec.layouts![1] = [[1, 2, 3], [4, 5, 6]];
      },
    })).result);
    expect(mission.declarations[2]).toMatchObject({
      position: { x: 1.5, y: -2.25, z: 0.125 }, gridSpacing: -40, spawnTime: 0xffffffff, ruleInputs: ruleInputs({ craftCount: 0xffffffff, percentC: -0x80000000 }),
    });
    expect(mission.groups[1].layout).toEqual([{ x: 1, y: 3, z: 2 }, { x: 4, y: 5, z: 6 }]);
  });

  it.each([[[6, 6], 900, 2700], [[11, 11], 1234.5, 6789.75]] as const)(
    'takes the scale and map frame from the mission header (sectors %j, scale %d)',
    async (sectors, scale, halfExtent) => {
      const { mission } = decoded((await convert({ scenario: spec => Object.assign(spec, { sectors: [...sectors], scale }) })).result);
      expect(mission.coordinates.referenceScale).toBe(scale);
      expect(mission.mapFrame).toEqual({ rightAxis: '+x', upAxis: '-y', center: { right: 0, up: 0 }, halfExtent });
    },
  );

  it('forms a complete logic group whose external requirements are the bound models', async () => {
    const { source, result } = await convert();
    const { fingerprint } = source.identity;
    expect(result.draft.sources).toEqual({
      sourceFingerprint: fingerprint,
      states: [
        { id: 'data/craft-types', state: 'verified', unknowns: ['U-022', 'U-028'] },
        { id: 'data/wingman-roster', state: 'verified', unknowns: ['U-023'] },
        { id: 'mission/first-campaign', state: 'verified', unknowns: ['U-022'] },
      ],
    });
    expect(result.draft.assets.map(({ id, kind, role, group, dependencies }) => ({ id, kind, role, group, dependencies }))).toEqual([
      {
        id: 'data/craft-types', kind: 'data', role: 'craft-types', group: 'logic',
        dependencies: ['model/base-1', 'model/enemy-ship-1', 'model/enemy-ship-2', 'model/friendly-craft-1', 'model/player-ship'].map(model),
      },
      { id: 'data/wingman-roster', kind: 'data', role: 'wingman-roster', group: 'logic', dependencies: [{ id: 'data/craft-types', kind: 'data' }] },
      {
        id: 'mission/first-campaign', kind: 'mission', role: 'mission', group: 'logic',
        dependencies: [{ id: 'data/craft-types', kind: 'data' }, { id: 'data/wingman-roster', kind: 'data' }],
      },
    ]);

    const [group] = applyManifestIdentity(productionIdentityBasis(fingerprint), [result.draft]);
    const validation = validateGroup(CLASSIC_P2_SLICE, group);
    expect(validation).toMatchObject({
      status: 'group-complete',
      group: 'logic',
      externalRequirements: ['model/base-1', 'model/enemy-ship-1', 'model/enemy-ship-2', 'model/friendly-craft-1', 'model/player-ship'].map(model),
    });
    expect(validation.status === 'group-complete' && validation.identity.origin).toEqual({ type: 'original-import', sourceFingerprint: fingerprint });
    expect(payloadTransferList(group.payloads.map(({ bytes }) => bytes))).toHaveLength(3);

    const { bytes } = group.payloads[2];
    bytes[bytes.length - 2] ^= 1;
    expect(validateGroup(CLASSIC_P2_SLICE, group).status).toBe('incomplete');
  });

  it('charges exactly the usage the counting rules give for the decoded payloads', async () => {
    const { result } = await convert();
    const { mission, craftTypes, roster } = decoded(result);
    const groupReferences = mission.groups.reduce((sum, { members }) => sum + 1 + members.length, 0);
    const missionReferences = countedReferences(mission.declarations) + groupReferences + 2 + countedReferences(roster.options) + 1 + craftTypes.entries.length;
    expect(missionReferences).toBe(37);
    expect(result.usage).toEqual({
      ...EMPTY_BUDGET_USAGE,
      assets: 3,
      dependencyEdges: result.draft.assets.reduce((sum, { dependencies }) => sum + dependencies.length, 0),
      payloadBytes: result.draft.payloads.reduce((sum, { bytes }) => sum + bytes.length, 0),
      missionObjects: mission.declarations.length + roster.options.length,
      missionReferences,
    });
    expect(result.usage.dependencyEdges).toBe(8);
    expect(result.usage.missionObjects).toBe(11);
  });

  it('reads each directory and mapped entry once after identification, sharing reads between verification and conversion', async () => {
    const logged = loggedReads(await syntheticVerifiedSource(filesWith()));
    await convertLogic(logged.source, PRODUCTION_LOGIC_SHARE);
    const counts = await logged.counts();
    expect(counts).toEqual({
      'MAIN/SCENARIO.NOB header': 1,
      'MAIN/SCENARIO.NOB directory': 1,
      [`MAIN/SCENARIO.NOB SCCT#${ENTRY_IDS.campaign}`]: 1,
      [`MAIN/SCENARIO.NOB SCEN#${ENTRY_IDS.scenario}`]: 1,
      'MAIN/SR.NOB header': 1,
      'MAIN/SR.NOB directory': 1,
      [`MAIN/SR.NOB M2ID#${ENTRY_IDS.modelList}`]: 1,
    });
  });
});

describe('logic group budget', () => {
  const LIMITS = { assets: 8, dependencyEdges: 32, payloadBytes: 1_048_576, missionObjects: 256, missionReferences: 4_096 };

  it('shares out the five dimensions the spec approves and no other', () => {
    expect(PRODUCTION_LOGIC_SHARE).toEqual({ ...EMPTY_BUDGET_USAGE, ...LIMITS });
  });

  it.each(Object.entries(LIMITS))('passes %s at its share and rejects one more', (dimension, limit) => {
    expect(chargeBudget(PRODUCTION_LOGIC_SHARE, EMPTY_BUDGET_USAGE, { ...EMPTY_BUDGET_USAGE, [dimension]: limit }).status).toBe('within-budget');
    expect(chargeBudget(PRODUCTION_LOGIC_SHARE, EMPTY_BUDGET_USAGE, { ...EMPTY_BUDGET_USAGE, [dimension]: limit + 1 })).toMatchObject({
      status: 'over-budget', violations: [{ code: 'budget-exceeded', dimension, limit, observed: limit + 1 }],
    });
  });

  it('stays within the Asset and dependency edge limits even when every sided craft type has its own model', async () => {
    // The player type and the enemy and friendly masks of docs/original/formats/executable.md: 21 craft types.
    const bits = (mask: number) => Array.from({ length: 32 }, (_, bit) => bit).filter(bit => (mask >>> bit) & 1);
    const sided = [0, ...bits(0x93780), ...bits(0x206c87e)];
    expect(sided).toHaveLength(21);
    const { result } = await convert({
      scenario: spec => { spec.records.push(...sided.filter(type => type !== 0).map(type => ({ kind: 2 ** type }))); },
      modelIds: Array.from({ length: 32 }, (_, slot) => 20_000 + slot),
    });
    expect(result.usage).toMatchObject({ assets: 3, dependencyEdges: 21 + 1 + 2 });
  });

  it('fails with budget-exceeded at the mission when its references exceed the budget', async () => {
    // 64 groups listing their own record 64 times: 64 × 65 group references alone pass the limit.
    const records = Array.from({ length: 64 }, (_, index) => ({ kind: index === 0 ? 1 : 0, member: index }));
    const groups = records.map((_, index) => ({ spawnCount: 1, layout: 0, template: index, members: Array<number>(64).fill(index) }));
    const result = await failure({ scenario: spec => Object.assign(spec, { names: [], regions: [], trigger: undefined, records, groups, layouts: [[[0, 0, 0]]] }) });
    // Craft types 2 (player and wingman type), roster 2 + 1, mission 65 + 64 × 65 + 2.
    expect(result).toEqual({ code: 'budget-exceeded', location: SCENARIO_AT, limit: { name: 'missionReferences', limit: 4_096, observed: 4_232 } });
  });

  it('fails with budget-exceeded before allocating a mission payload beyond the byte budget', async () => {
    const value = Math.fround(-0.1);
    const layouts = Array.from({ length: 16 }, () => Array.from({ length: 256 }, (): [number, number, number] => [value, value, value]));
    const groups = Array.from({ length: 64 }, (_, index) => ({ spawnCount: 0, layout: index % 16, template: 0, members: [] }));
    const result = await failure({ scenario: spec => Object.assign(spec, { names: [], regions: [], trigger: undefined, records: [{ kind: 1 }], groups, layouts }) });
    expect(result).toMatchObject({ code: 'budget-exceeded', location: SCENARIO_AT, limit: { name: 'payloadBytes', limit: 1_048_576 } });
    expect((result.limit as { observed: number }).observed).toBeGreaterThan(1_048_576);
  });
});

describe('logic step usage', () => {
  const run = async (limits: unknown, usage: unknown) => convertLogic(await syntheticVerifiedSource(filesWith()), limits, usage);
  const prior = { ...EMPTY_BUDGET_USAGE, assets: 5, paletteEntries: 512, payloadBytes: 1_000 };

  it('charges on top of earlier steps against the job limits and returns the cumulative usage', async () => {
    const alone = (await run(PRODUCTION_LOGIC_SHARE, EMPTY_BUDGET_USAGE)).usage;
    const limits = { ...PRODUCTION_LOGIC_SHARE, assets: 13, paletteEntries: 512, payloadBytes: PRODUCTION_LOGIC_SHARE.payloadBytes + 1_000 };
    expect((await run(limits, prior)).usage).toEqual({ ...alone, assets: 8, paletteEntries: 512, payloadBytes: alone.payloadBytes + 1_000 });
  });

  it('rejects the Asset that exhausts the job budget, keeping the earlier usage in the observed total', async () => {
    await expect(sourceFailure(() => run(PRODUCTION_LOGIC_SHARE, { ...EMPTY_BUDGET_USAGE, assets: 6 }), new RegExp(MARKER))).resolves.toEqual({
      code: 'budget-exceeded', location: SCENARIO_AT, limit: { name: 'assets', limit: 8, observed: 9 },
    });
  });

  it('reports a total beyond the safe integer range as budget-exceeded without an observed value', async () => {
    const limits = { ...PRODUCTION_LOGIC_SHARE, missionReferences: Number.MAX_SAFE_INTEGER };
    const usage = { ...EMPTY_BUDGET_USAGE, missionReferences: Number.MAX_SAFE_INTEGER - 1 };
    await expect(sourceFailure(() => run(limits, usage), new RegExp(MARKER))).resolves.toEqual({
      code: 'budget-exceeded', location: `archive:/MAIN/SR.NOB#${ENTRY_IDS.modelList}`,
      limit: { name: 'missionReferences', limit: Number.MAX_SAFE_INTEGER, observed: null },
    });
  });

  it('refuses a starting usage that includes source reads', async () => {
    await expect(run(PRODUCTION_LOGIC_SHARE, { ...EMPTY_BUDGET_USAGE, sourceReadBytes: 1 }))
      .rejects.toMatchObject({ name: 'ContentContractError', code: 'invalid-budget-value', path: 'usage.sourceReadBytes' });
  });
});

describe('logic group assembly', () => {
  it('requires exactly one player record in the mission and none among the wingman options', async () => {
    await expect(failure({ scenario: spec => { spec.records[2].kind = 1; } })).resolves.toEqual({
      code: 'unsupported-payload', location: `${SCENARIO_AT}/records[2]/kind`, limit: null,
    });
    await expect(failure({ scenario: spec => { spec.records[0].kind = 0; }, campaign: spec => { spec.wingmen[1].kind = 1; } })).resolves.toEqual({
      code: 'unsupported-payload', location: `${SCENARIO_AT}/records`, limit: null,
    });
    await expect(failure({ campaign: spec => { spec.wingmen[1].kind = 1; } })).resolves.toEqual({
      code: 'unsupported-payload', location: `archive:/MAIN/SCENARIO.NOB#${ENTRY_IDS.campaign}/wingmen[1]/kind`, limit: null,
    });
    await expect(failure({ scenario: spec => { spec.records[0].kind = 0; } })).resolves.toEqual({
      code: 'invalid-payload', location: `archive:/MAIN/SR.NOB#${ENTRY_IDS.modelList}/ids[0]`, limit: null,
    });
  });

  it('passes parsing and binding failures through without a partial group', async () => {
    await expect(failure({ scenario: spec => { spec.sectors = [6, 7]; } })).resolves.toMatchObject({ code: 'unsupported-payload', location: `${SCENARIO_AT}/header/height` });
    await expect(failure({ campaign: spec => { spec.groups[0][1][0] = 3121; } })).resolves.toMatchObject({ code: 'subresource-mismatch' });
  });
});
