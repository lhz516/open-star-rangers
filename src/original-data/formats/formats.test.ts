import { describe, expect, it } from 'vitest';
import { readMissionContent } from '../../content/logic/logic-readers.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError, type SourceLimit } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import {
  DEFAULT_MODEL_IDS, ENTRY_IDS, MARKER, defaultCampaignSpec, defaultScenarioSpec, entryRead, syntheticCampaign,
  syntheticModelList, syntheticScenario, type CampaignSpec, type ScenarioSpec, type SyntheticBlock,
} from './formats.test-support.ts';
import { MODEL_LIST_LIMITS, parseModelIdList } from './m2id.ts';
import { CAMPAIGN_LIMITS, parseCampaignTable } from './scct.ts';
import { SCENARIO_LIMITS, parseScenario } from './scen.ts';

const SCENARIO_NOB = 'MAIN/SCENARIO.NOB' as DiscPath;
const SR_NOB = 'MAIN/SR.NOB' as DiscPath;
const scenarioAt = `archive:/MAIN/SCENARIO.NOB#${ENTRY_IDS.scenario}`;
const campaignAt = `archive:/MAIN/SCENARIO.NOB#${ENTRY_IDS.campaign}`;
const modelListAt = `archive:/MAIN/SR.NOB#${ENTRY_IDS.modelList}`;

const parseScen = (block: SyntheticBlock) => parseScenario(SCENARIO_NOB, entryRead(ENTRY_IDS.scenario, 'SCEN', block));
const parseScct = (block: SyntheticBlock) => parseCampaignTable(SCENARIO_NOB, entryRead(ENTRY_IDS.campaign, 'SCCT', block));
const parseM2id = (block: SyntheticBlock) => parseModelIdList(SR_NOB, entryRead(ENTRY_IDS.modelList, 'M2ID', block));

const scenarioWith = (change: (spec: ScenarioSpec) => void) => {
  const spec = defaultScenarioSpec();
  change(spec);
  return syntheticScenario(spec);
};
const campaignWith = (change: (spec: CampaignSpec) => void) => {
  const spec = defaultCampaignSpec();
  change(spec);
  return syntheticCampaign(spec);
};
type BlockCase = readonly [string, () => SyntheticBlock, string];
/** The default scenario with raw edits through a view, keeping relocations unless `change` edits them too. */
const rawScenario = (change: (view: DataView, block: ReturnType<typeof syntheticScenario>) => void) => {
  const block = syntheticScenario(defaultScenarioSpec());
  change(new DataView(block.bytes.buffer), block);
  return block;
};
const pointTo = (block: SyntheticBlock, at: number, target: number) => {
  new DataView(block.bytes.buffer).setUint32(at, target, true);
  if (!block.relocations.includes(at)) block.relocations.push(at);
};
const unlist = (block: SyntheticBlock, at: number) => {
  expect(block.relocations).toContain(at);
  block.relocations.splice(block.relocations.indexOf(at), 1);
};
/** The default campaign with the offset of its wingman records, for raw edits. */
const rawCampaign = (change: (view: DataView, block: SyntheticBlock, wingmen: number) => void) => {
  const block = syntheticCampaign(defaultCampaignSpec());
  const view = new DataView(block.bytes.buffer);
  change(view, block, view.getUint32(8, true));
  return block;
};

function expectSourceError(action: () => unknown, code: string, location: string, limit?: SourceLimit) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SourceError);
  const data = (caught as SourceError).toData();
  expect({ code: data.code, location: data.location }).toEqual({ code, location });
  if (limit) expect(data.limit).toEqual(limit);
  expect(inLocationGrammar(data), data.location).toBe(true);
  expect(`${JSON.stringify(data)} ${(caught as Error).message}`).not.toContain(MARKER);
}

const nulls = { percentA: null, craftCount: null, percentB: null, percentC: null, percentD: null, aiValueA: null, aiValueB: null, aiValueC: null };

describe('SCEN parsing', () => {
  it('converts the synthetic mission field by field', () => {
    const parsed = parseScen(syntheticScenario(defaultScenarioSpec()));
    expect(parsed.sectors).toBe(6);
    expect(parsed.referenceScale).toBe(900);
    expect(parsed.namePool).toEqual([`${MARKER}-pool-a`, `${MARKER}-pool-b`, `${MARKER}-pool-c`]);
    expect(parsed.spawnRegions).toEqual([
      { x0: -2000, y0: 1000, x1: 2000, y1: 2000 }, { x0: -2600, y0: -2600, x1: 2600, y1: 2600 }, { x0: -2000, y0: -2000, x1: 2000, y1: 0 },
    ]);
    const { declarations, groups } = parsed;
    expect(declarations.map(({ index, origins, craftType, memberOf }) => ({ index, origins, craftType, memberOf }))).toEqual([
      { index: 0, origins: ['object'], craftType: 0, memberOf: null },
      { index: 1, origins: ['object', 'group-template'], craftType: null, memberOf: null },
      { index: 2, origins: ['object'], craftType: null, memberOf: null },
      { index: 3, origins: ['object', 'group-template'], craftType: 7, memberOf: null },
      { index: 4, origins: ['object', 'group-member'], craftType: 7, memberOf: 0 },
      { index: 5, origins: ['object', 'group-member'], craftType: 7, memberOf: 2 },
      { index: 6, origins: ['object', 'group-member'], craftType: 8, memberOf: 1 },
      { index: 7, origins: ['object'], craftType: 17, memberOf: null },
      { index: 8, origins: ['object'], craftType: 14, memberOf: null },
    ]);
    expect(declarations[0]).toMatchObject({ placement: { region: 2, anchor: null }, ruleInputs: { ...nulls, aiValueA: 6, aiValueB: 7, aiValueC: 33 } });
    expect(declarations[1]).toMatchObject({ placement: { region: 0, anchor: null }, spawnTime: 90, ruleInputs: nulls });
    expect(declarations[3]).toMatchObject({ placement: { region: null, anchor: 0 }, aiTarget: 0, aiTargetCraftTypes: [0, 17] });
    expect(declarations[4].ruleInputs).toEqual({ ...nulls, percentA: 0x80000000, percentB: -5 });
    expect(declarations[6].ruleInputs.craftCount).toBe(2);
    expect(declarations[8]).toMatchObject({ nameCandidates: [`${MARKER}-x`, `${MARKER}-y`], placement: { region: 1, anchor: null } });
    expect(declarations.every(({ position, gridSpacing }) => position.x === 0 && position.y === 0 && position.z === 0 && gridSpacing === 0)).toBe(true);
    expect(groups).toEqual([
      { template: 1, members: [4, 4], spawnCount: 2, layout: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] },
      { template: 1, members: [6, 6], spawnCount: 2, layout: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 70 }] },
      { template: 3, members: [5, 5], spawnCount: 3, layout: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }] },
    ]);
    expect(Object.isFrozen(parsed) && Object.isFrozen(declarations[0].placement) && Object.isFrozen(groups[0].layout[0])).toBe(true);
  });

  it('forms mission content its canonical reader accepts', () => {
    const parsed = parseScen(syntheticScenario(defaultScenarioSpec()));
    const { sectors, referenceScale, ...rest } = parsed;
    expect(() => readMissionContent({
      campaign: { group: 0, slot: 1 },
      coordinates: { unit: 'scen-reference', referenceScale, layoutUnit: 'scen-runtime' },
      references: { craftTypes: 'data/craft-types', wingmanRoster: 'data/wingman-roster' },
      mapFrame: { rightAxis: '+x', upAxis: '-y', center: { right: 0, up: 0 }, halfExtent: sectors * referenceScale / 2 },
      ...rest,
    })).not.toThrow();
  });

  it('applies the original load transform to element 0 of each layout only', () => {
    const parsed = parseScen(scenarioWith(spec => { spec.layouts![1] = [[1, 2, 3], [4, 5, 6]]; }));
    expect(parsed.groups[1].layout).toEqual([{ x: 1, y: 3, z: 2 }, { x: 4, y: 5, z: 6 }]);
  });

  it('keeps signed values, unsigned high bits, positions and grid spacing as stored', () => {
    const parsed = parseScen(scenarioWith(spec => {
      spec.records[2] = { region: 0, position: [1.5, -2.25, 0.125], signed: { 0x40: -40, 0x64: -0x80000000, 0x68: 0x7fffffff }, words: { 0x10: 0xffffffff, 0x1c: 0xffffffff } };
    }));
    expect(parsed.declarations[2]).toMatchObject({
      position: { x: 1.5, y: -2.25, z: 0.125 }, gridSpacing: -40, spawnTime: 0xffffffff,
      ruleInputs: { ...nulls, craftCount: 0xffffffff, percentC: -0x80000000, percentD: 0x7fffffff },
    });
  });

  it('accepts a mission without names, regions, groups, layouts or triggers', () => {
    const parsed = parseScen(syntheticScenario({ records: [{ kind: 1 }] }));
    expect(parsed).toMatchObject({ namePool: [], spawnRegions: [], groups: [], declarations: [{ index: 0, craftType: 0, origins: ['object'] }] });
  });

  it.each<BlockCase>([
    ...([[4, 0x3c, 'member'], [0, 0x44, 'region'], [3, 0x48, 'anchor'], [7, 0x54, 'trigger'], [3, 0x58, 'aiTarget']] as const).map(([record, offset, field]) =>
      [`an unlisted ${field} pointer`, () => rawScenario((_, block) => { unlist(block, block.offsets.records[record] + offset); }), `/records[${record}]/${field}`] satisfies BlockCase),
    ...([[4, 'layout'], [8, 'template'], [12, 'members']] as const).map(([offset, field]) =>
      [`an unlisted group ${field} pointer`, () => rawScenario((_, block) => { unlist(block, block.offsets.groups[0] + offset); }), `/groups[0]/${field}`] satisfies BlockCase),
    ['an unlisted member pointer', () => rawScenario((view, block) => { unlist(block, view.getUint32(block.offsets.groups[0] + 12, true) + 4); }), '/groups[0]/members[1]'],
    ['an unlisted layout pointer', () => rawScenario((_, block) => { unlist(block, block.offsets.layoutTable + 8); }), '/layouts[1]'],
    ['an unlisted section pointer', () => rawScenario((_, block) => { unlist(block, 0x28); }), '/sections[3]'],
    ['a section overlapping the header', () => rawScenario((_, block) => { pointTo(block, 0x28, 0x10); }), '/sections[3]'],
    ['a section-2 count without pointer', () => rawScenario((view, block) => { unlist(block, 0x20); view.setUint32(0x20, 0, true); }), '/sections[2]'],
    ['an unlisted formation pointer', () => scenarioWith(spec => { spec.records[2].words = { 0x30: 1 }; }), '/records[2]/formation'],
    ['an unlisted route pointer', () => scenarioWith(spec => { spec.records[2].words = { 0x4c: 1 }; }), '/records[2]/route'],
    ['an unlisted runtime object pointer', () => rawScenario((view, block) => { view.setUint32(block.offsets.groups[2] + 24, 4, true); }), '/groups[2]/runtime'],
    ['an unlisted spawn pair pointer', () => rawScenario((view, block) => { view.setUint32(block.offsets.trigger! + 20, 4, true); }), '/trigger'],
    ['a relocated sector count', () => rawScenario((_, block) => { block.relocations.push(0); }), '/header/width'],
    ['a relocated rectangle value', () => rawScenario((_, block) => { block.relocations.push(block.offsets.regions + 2); }), '/regions[0]'],
    ['a relocated layout element', () => rawScenario((view, block) => { block.relocations.push(view.getUint32(block.offsets.layoutTable, true) + 12); }), '/layouts[0]/elements[1]'],
    ['a relocated spawn count', () => rawScenario((_, block) => { block.relocations.push(block.offsets.groups[1]); }), '/groups[1]/spawnCount'],
    ['a relocation inside a name', () => rawScenario((view, block) => { block.relocations.push(view.getUint32(view.getUint32(0x10, true), true) + 2); }), '/names[0]'],
    ['a rectangle target past the block', () => rawScenario((_, block) => { pointTo(block, block.offsets.records[0] + 0x44, block.bytes.length - 4); }), '/records[0]/region'],
    ['a trigger target past the block', () => rawScenario((_, block) => { pointTo(block, block.offsets.records[7] + 0x54, block.bytes.length - 10); }), '/records[7]/trigger'],
    ['a pointer past the block', () => rawScenario((_, block) => { pointTo(block, block.offsets.groups[0] + 8, block.bytes.length - 100); }), '/groups[0]/template'],
    ['a section past the block', () => rawScenario((_, block) => { pointTo(block, 0x28, block.bytes.length - 8); }), '/sections[3]'],
    ['a relocation at a value field', () => rawScenario((_, block) => { block.relocations.push(block.offsets.records[0] + 0x0c); }), '/records[0]'],
    ['a relocated spawn time', () => rawScenario((_, block) => { block.relocations.push(block.offsets.records[1] + 0x1c); }), '/records[1]'],
    ['a relocated grid spacing', () => rawScenario((_, block) => { block.relocations.push(block.offsets.records[0] + 0x40); }), '/records[0]'],
    ['a relocated AI target mask', () => rawScenario((_, block) => { block.relocations.push(block.offsets.records[3] + 0x5c); }), '/records[3]'],
    ['an unaligned relocation in a record', () => rawScenario((_, block) => { block.relocations.push(block.offsets.records[2] + 0x45); }), '/records[2]'],
    ['a kind with two bits', () => scenarioWith(spec => { spec.records[0].kind = 3; }), '/records[0]/kind'],
    ['a non-finite position', () => scenarioWith(spec => { spec.records[2].position = [0, Number.NaN, 0]; }), '/records[2]/position'],
    ['an infinite layout element', () => scenarioWith(spec => { spec.layouts![0][1] = [Number.POSITIVE_INFINITY, 0, 0]; }), '/layouts[0]/elements[1]'],
    ['a non-ASCII name', () => scenarioWith(spec => { spec.records[8].names = [`${MARKER}\u00e9`]; }), '/records[8]/names[0]'],
    ['a control character in a pool name', () => scenarioWith(spec => { spec.names![1] = `${MARKER}\t`; }), '/names[1]'],
    ['an empty name', () => scenarioWith(spec => { spec.names![0] = ''; }), '/names[0]'],
    ['a name without NUL', () => rawScenario((view, block) => { block.bytes[block.bytes.length - 1] = 0x41; pointTo(block, view.getUint32(block.offsets.records[8] + 4, true), block.bytes.length - 1); }), '/records[8]/names[0]'],
    ['no sectors', () => scenarioWith(spec => { spec.sectors = [0, 0]; }), '/header/width'],
    ['a zero reference scale', () => scenarioWith(spec => { spec.scale = 0; }), '/header/scale'],
    ['a non-finite reference scale', () => scenarioWith(spec => { spec.scale = Number.NaN; }), '/header/scale'],
    ['a group without layout', () => rawScenario((view, block) => { view.setUint32(block.offsets.groups[0] + 4, 0, true); block.relocations.splice(block.relocations.indexOf(block.offsets.groups[0] + 4), 1); }), '/groups[0]/layout'],
    ['a layout count word past the block', () => scenarioWith(spec => { spec.tail = null; }), '/layouts'],
    ['a section-2 trigger header past the block', () => rawScenario((_, block) => { pointTo(block, 0x20, block.bytes.length - 10); }), '/sections[2]'],
  ])('rejects %s as invalid-payload', (_, build, path) => {
    expectSourceError(() => parseScen(build()), 'invalid-payload', `${scenarioAt}${path}`);
  });

  it.each<BlockCase>([
    ['the special header mode', () => scenarioWith(spec => { spec.mode = 1; }), '/header/mode'],
    ['a non-square world', () => scenarioWith(spec => { spec.sectors = [6, 7]; }), '/header/height'],
    ['a sector count beyond 16 bits', () => scenarioWith(spec => { spec.sectors = [32_768, 32_768]; }), '/header/width'],
    ['section 4', () => rawScenario(view => { view.setUint32(0x34, 1, true); }), '/sections[4]'],
    ...([[0x30, 'formation'], [0x4c, 'route']] as const).map(([offset, field]) =>
      [`record pointer ${field}`, () => rawScenario((_, block) => { pointTo(block, block.offsets.records[2] + offset, block.offsets.regions); }), `/records[2]/${field}`] satisfies BlockCase),
    ['record field formationIndex', () => scenarioWith(spec => { spec.records[2].words = { 0x38: 1 }; }), '/records[2]/formationIndex'],
    ['a section-4 pointer', () => rawScenario((_, block) => { pointTo(block, 0x30, block.offsets.regions); }), '/sections[4]'],
    ['a section-2 pointer without elements', () => rawScenario(view => { view.setUint32(0x24, 0, true); }), '/sections[2]'],
    ['a group runtime object pointer', () => rawScenario((_, block) => { pointTo(block, block.offsets.groups[2] + 24, block.offsets.regions); }), '/groups[2]/runtime'],
    ['a spawn pair pointer', () => rawScenario((_, block) => { pointTo(block, block.offsets.trigger! + 20, block.offsets.regions); }), '/trigger'],
    ...[0x14, 0x18, 0x20, 0x34, 0x50, 0x6c, 0x7c, 0x80].map(offset =>
      [`reserved record word ${offset}`, () => scenarioWith(spec => { spec.records[1].words = { 0x1c: 90, [offset]: 1 }; }), `/records[1]/words[${offset / 4}]`] satisfies BlockCase),
    ['a name list pointer without names', () => rawScenario((view, block) => { view.setUint32(block.offsets.records[8] + 8, 0, true); }), '/records[8]/names'],
    ['group runtime fields', () => rawScenario((view, block) => { view.setUint32(block.offsets.groups[1] + 20, 1, true); }), '/groups[1]/runtime'],
    ['an unused layout', () => scenarioWith(spec => { spec.layouts!.push([[0, 0, 0]]); }), '/layouts[2]'],
    ['an empty layout', () => scenarioWith(spec => { spec.layouts![1] = []; }), '/layouts[1]'],
    ['a positive count word after the layout table', () => scenarioWith(spec => { spec.tail = 1; }), '/layouts'],
    ['a template that is not a section-1 record', () => rawScenario((_, block) => { pointTo(block, block.offsets.groups[0] + 8, block.offsets.records[1] + 4); }), '/groups[0]/template'],
    ['a member that is not a section-1 record', () => rawScenario((view, block) => { pointTo(block, view.getUint32(block.offsets.groups[2] + 12, true), block.offsets.records[5] + 1); }), '/groups[2]/members[0]'],
    ['a layout that is not a section-6 entry', () => rawScenario((_, block) => { pointTo(block, block.offsets.groups[1] + 4, block.offsets.layoutTable + 4); }), '/groups[1]/layout'],
    ['a record listed by two groups', () => scenarioWith(spec => { spec.groups![1].members = [6, 4]; }), '/groups[1]/members[1]'],
    ['a back-reference to another group', () => scenarioWith(spec => { spec.records[4].member = 1; }), '/records[4]/member'],
    ['a listed member without back-reference', () => scenarioWith(spec => { delete spec.records[5].member; }), '/records[5]/member'],
    ['a back-reference to a non-group', () => rawScenario((_, block) => { pointTo(block, block.offsets.records[4] + 0x3c, block.offsets.regions); }), '/records[4]/member'],
    ['a rectangle that is not a section-3 element', () => rawScenario((_, block) => { pointTo(block, block.offsets.records[0] + 0x44, block.offsets.regions + 4); }), '/records[0]/region'],
    ['an anchor that is not a record', () => rawScenario((_, block) => { pointTo(block, block.offsets.records[3] + 0x48, block.offsets.records[0] + 4); }), '/records[3]/anchor'],
    ['an AI target that is not a record', () => rawScenario((_, block) => { pointTo(block, block.offsets.records[3] + 0x58, block.offsets.regions); }), '/records[3]/aiTarget'],
    ['a trigger that is not the first section-2 element', () => rawScenario((_, block) => { pointTo(block, block.offsets.records[7] + 0x54, block.offsets.trigger! + 28); }), '/records[7]/trigger'],
    ['a trigger that schedules spawns', () => scenarioWith(spec => { spec.trigger = { ranges: 2, pairs: 1 }; }), '/trigger'],
  ])('rejects %s as unsupported-payload', (_, build, path) => {
    expectSourceError(() => parseScen(build()), 'unsupported-payload', `${scenarioAt}${path}`);
  });

  const names = (count: number) => Array.from({ length: count }, (_, index) => `n${index}`);
  const records = (count: number) => Array.from({ length: count }, () => ({}));
  const layoutSpec = (elements: number): ScenarioSpec => ({
    records: [{}], groups: [{ spawnCount: 1, layout: 0, template: 0, members: [] }],
    layouts: [Array.from({ length: elements }, () => [0, 0, 0] as const)],
  });
  const limitCases: readonly (readonly [string, number, (count: number) => ScenarioSpec, string, 'payloadItems' | 'textBytes'])[] = [
    ['pool names', SCENARIO_LIMITS.names, count => ({ names: names(count), records: [{}] }), '/sections[0]', 'payloadItems'],
    ['records', SCENARIO_LIMITS.records, count => ({ records: records(count) }), '/sections[1]', 'payloadItems'],
    ['spawn rectangles', SCENARIO_LIMITS.regions, count => ({ records: [{}], regions: Array.from({ length: count }, () => [0, 0, 1, 1] as const) }), '/sections[3]', 'payloadItems'],
    ['groups', SCENARIO_LIMITS.groups, count => ({ records: [{}], layouts: [[[0, 0, 0]]], groups: Array.from({ length: count }, () => ({ spawnCount: 1, layout: 0, template: 0, members: [] })) }), '/sections[5]', 'payloadItems'],
    ['group members', SCENARIO_LIMITS.members, count => ({ records: [{}, { member: 0 }], layouts: [[[0, 0, 0]]], groups: [{ spawnCount: 1, layout: 0, template: 0, members: Array(count).fill(1) }] }), '/groups[0]/members', 'payloadItems'],
    ['layouts', SCENARIO_LIMITS.layouts, count => ({ records: [{}], layouts: Array.from({ length: count }, () => [[0, 0, 0] as const]), groups: Array.from({ length: count }, (_, layout) => ({ spawnCount: 1, layout, template: 0, members: [] })) }), '/sections[6]', 'payloadItems'],
    ['layout elements', SCENARIO_LIMITS.layoutElements, layoutSpec, '/layouts[0]', 'payloadItems'],
    ['name candidates', 32, count => ({ records: [{ names: names(count) }] }), '/records[0]/names', 'payloadItems'],
    ['name bytes', 63, length => ({ records: [{}], names: ['n'.repeat(length)] }), '/names[0]', 'textBytes'],
  ];

  it.each(limitCases)('accepts %s at the limit and rejects one more', (_, limit, spec, path, name) => {
    expect(() => parseScen(syntheticScenario(spec(limit)))).not.toThrow();
    expectSourceError(() => parseScen(syntheticScenario(spec(limit + 1))), 'limit-exceeded', `${scenarioAt}${path}`, { name, limit, observed: limit + 1 });
  });

  it('rejects a huge declared count before reading or allocating its array', () => {
    const block = rawScenario(view => { view.setUint32(0x1c, 0xffffffff, true); });
    expectSourceError(() => parseScen(block), 'limit-exceeded', `${scenarioAt}/sections[1]`, { name: 'payloadItems', limit: SCENARIO_LIMITS.records, observed: 0xffffffff });
  });

  it('checks the entry size first, accepting exactly the limit', () => {
    const block = syntheticScenario(defaultScenarioSpec());
    const padded = new Uint8Array(SCENARIO_LIMITS.entryBytes);
    padded.set(block.bytes);
    expect(parseScen({ ...block, bytes: padded }).declarations).toHaveLength(9);
    expectSourceError(() => parseScen({ bytes: new Uint8Array(SCENARIO_LIMITS.entryBytes + 1), relocations: [] }), 'limit-exceeded', scenarioAt,
      { name: 'payloadEntryBytes', limit: SCENARIO_LIMITS.entryBytes, observed: SCENARIO_LIMITS.entryBytes + 1 });
  });
});

describe('SCCT parsing', () => {
  it('selects the candidate slot among several groups and reads the wingmen', () => {
    const parsed = parseScct(syntheticCampaign(defaultCampaignSpec()));
    expect(parsed.scenarioEntryId).toBe(ENTRY_IDS.scenario);
    expect(parsed.wingmen).toEqual([0, 1].map(index => ({
      index, origins: ['wingman-option'], craftType: 1, nameCandidates: [`${MARKER}-w${index}`], position: { x: 0, y: 0, z: 0 },
      spawnTime: 0, gridSpacing: 0, placement: { region: null, anchor: null }, memberOf: null, aiTarget: null,
      ruleInputs: { ...nulls, aiValueA: index === 0 ? 3 : 5, aiValueB: index === 0 ? 4 : 5 }, aiTargetCraftTypes: [],
    })));
    expect(parseCampaignTable(SCENARIO_NOB, entryRead(ENTRY_IDS.campaign, 'SCCT', syntheticCampaign(defaultCampaignSpec())), { campaignGroup: 1, campaignSlot: 1 }).scenarioEntryId).toBe(3037);
  });

  it.each([
    ['a missing group', () => campaignWith(spec => { spec.groups = []; }), '/groups[0]'],
    ['a missing slot', () => campaignWith(spec => { spec.groups[0] = [[3121, 9100]]; }), '/groups[0]/slots[1]'],
  ])('reports %s as subresource-mismatch', (_, build, path) => {
    expectSourceError(() => parseScct(build()), 'subresource-mismatch', `${campaignAt}${path}`);
  });

  it.each([
    ['a mission reference', () => campaignWith(spec => { spec.wingmen[0] = { ...spec.wingmen[0], region: 0 }; }), '/wingmen[0]/region'],
    ['a position', () => campaignWith(spec => { spec.wingmen[1] = { ...spec.wingmen[1], position: [0, 0, 1] }; }), '/wingmen[1]/position'],
    ['a grid spacing', () => campaignWith(spec => { spec.wingmen[0] = { ...spec.wingmen[0], signed: { 0x40: 5 } }; }), '/wingmen[0]/gridSpacing'],
    ...([[0x30, 'formation'], [0x3c, 'member'], [0x48, 'anchor'], [0x54, 'trigger'], [0x58, 'aiTarget']] as const).map(([offset, field]) =>
      [`a ${field} pointer`, () => rawCampaign((_, block, wingmen) => { pointTo(block, wingmen + 132 + offset, wingmen); }), `/wingmen[1]/${field}`] as const),
  ] as const)('rejects a wingman with %s as unsupported-payload', (_, build, path) => {
    expectSourceError(() => parseScct(build()), 'unsupported-payload', `${campaignAt}${path}`);
  });

  it.each([
    ['the wingman list', () => rawCampaign((_, block) => { unlist(block, 8); }), '/wingmen'],
    ['an unselected group slot list', () => rawCampaign((view, block) => { unlist(block, view.getUint32(0, true) + 16); }), '/groups[2]/slots'],
    ['a wingman formation', () => rawCampaign((view, _, wingmen) => { view.setUint32(wingmen + 0x30, 2, true); }), '/wingmen[0]/formation'],
  ])('rejects an unlisted pointer in %s as invalid-payload', (_, build, path) => {
    expectSourceError(() => parseScct(build()), 'invalid-payload', `${campaignAt}${path}`);
  });

  it('checks the entry size first, accepting exactly the limit', () => {
    const block = syntheticCampaign(defaultCampaignSpec());
    const padded = new Uint8Array(CAMPAIGN_LIMITS.entryBytes);
    padded.set(block.bytes);
    expect(parseScct({ ...block, bytes: padded }).scenarioEntryId).toBe(ENTRY_IDS.scenario);
    expectSourceError(() => parseScct({ bytes: new Uint8Array(CAMPAIGN_LIMITS.entryBytes + 1), relocations: [] }), 'limit-exceeded', campaignAt,
      { name: 'payloadEntryBytes', limit: CAMPAIGN_LIMITS.entryBytes, observed: CAMPAIGN_LIMITS.entryBytes + 1 });
  });

  it.each([
    ['groups', CAMPAIGN_LIMITS.groups, (count: number) => campaignWith(spec => { spec.groups = Array.from({ length: count }, () => [[3121, 9100], [3019, 9101]]); }), '/groups'],
    ['slots', CAMPAIGN_LIMITS.slots, (count: number) => campaignWith(spec => { spec.groups[0] = Array.from({ length: count }, () => [3019, 9101]); }), '/groups[0]/slots'],
    ['slots of an unselected group', CAMPAIGN_LIMITS.slots, (count: number) => campaignWith(spec => { spec.groups[2] = Array.from({ length: count }, () => [3075, 9121]); }), '/groups[2]/slots'],
    ['wingmen', CAMPAIGN_LIMITS.wingmen, (count: number) => campaignWith(spec => { spec.wingmen = Array.from({ length: count }, () => ({ kind: 2 })); }), '/wingmen'],
  ])('accepts %s at the limit and rejects one more', (_, limit, build, path) => {
    expect(() => parseScct(build(limit))).not.toThrow();
    expectSourceError(() => parseScct(build(limit + 1)), 'limit-exceeded', `${campaignAt}${path}`, { name: 'payloadItems', limit, observed: limit + 1 });
  });
});

describe('M2ID parsing', () => {
  it('reads the MODL entry IDs by craft type', () => {
    expect(parseM2id(syntheticModelList(DEFAULT_MODEL_IDS))).toEqual(DEFAULT_MODEL_IDS);
  });

  it('rejects an unlisted or header-overlapping list pointer, a relocated ID and a list past the block', () => {
    const unlisted = syntheticModelList([1, 2]);
    unlisted.relocations.length = 0;
    expectSourceError(() => parseM2id(unlisted), 'invalid-payload', `${modelListAt}/ids`);
    const header = syntheticModelList([1, 2]);
    new DataView(header.bytes.buffer).setUint32(0, 0, true);
    expectSourceError(() => parseM2id(header), 'invalid-payload', `${modelListAt}/ids`);
    const relocated = syntheticModelList([1, 2]);
    relocated.relocations.push(12);
    expectSourceError(() => parseM2id(relocated), 'invalid-payload', `${modelListAt}/ids[1]`);
    const long = syntheticModelList([1, 2]);
    new DataView(long.bytes.buffer).setUint32(4, 3, true);
    expectSourceError(() => parseM2id(long), 'invalid-payload', `${modelListAt}/ids`);
  });

  it('limits the entry size and the ID count', () => {
    expect(parseM2id(syntheticModelList(Array(MODEL_LIST_LIMITS.ids).fill(7)))).toHaveLength(MODEL_LIST_LIMITS.ids);
    expectSourceError(() => parseM2id(syntheticModelList(Array(MODEL_LIST_LIMITS.ids + 1).fill(7))), 'limit-exceeded', modelListAt,
      { name: 'payloadEntryBytes', limit: MODEL_LIST_LIMITS.entryBytes, observed: MODEL_LIST_LIMITS.entryBytes + 4 });
    const huge = syntheticModelList([1]);
    new DataView(huge.bytes.buffer).setUint32(4, MODEL_LIST_LIMITS.ids + 1, true);
    expectSourceError(() => parseM2id(huge), 'limit-exceeded', `${modelListAt}/ids`, { name: 'payloadItems', limit: MODEL_LIST_LIMITS.ids, observed: MODEL_LIST_LIMITS.ids + 1 });
  });
});
