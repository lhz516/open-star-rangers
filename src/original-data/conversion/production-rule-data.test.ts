import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE, readBudgetRecord } from '../../content/budget.ts';
import { decodeRuleDataPayload } from '../../content/rule-data/rule-data-payload.ts';
import { AI_PROGRAMS_LIMITS } from '../../content/rule-data/ai-programs.ts';
import { FLIGHT_MESSAGES_LIMITS } from '../../content/rule-data/flight-messages.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import {
  assetSourceStates, diagnoseSourceMappings, executableRegion, isRegionLocator, readSourceMappingTable, type OriginalAssetLocator,
} from '../source-mapping.ts';
import { buildImfat } from '../synthetic.test-support.ts';
import { countedVerifiedSource } from './conversion.test-support.ts';
import { convertRuleData } from './convert-rule-data.ts';
import { objectOffset } from './production-executable.ts';
import { regionExecutable } from './production-graphics.test-support.ts';
import { productionRuleData } from './production-rule-data.test-support.ts';
import {
  PRODUCTION_RULE_DATA_MAPPINGS, PRODUCTION_RULE_DATA_SHARE, PRODUCTION_RULE_DATA_SOURCES, ruleDataLocators, ruleDataMappings,
} from './production-rule-data.ts';

// P3-03 AC-13: the production rule-data mappings read as a P2-01 table with the spec's confidence and U items, record the
// slice candidate's selections as sub-resources and name the documented entries and regions. No source is read.

const describeLocator = (locator: OriginalAssetLocator) => (isRegionLocator(locator)
  ? `${locator.discPath} ${locator.subresource}`
  : `${locator.discPath}#${locator.entry.id}.${locator.entry.type}/${locator.subresource}`);

const table = readSourceMappingTable(PRODUCTION_RULE_DATA_MAPPINGS);
const parts = (id: string) => table.mappings.find(({ asset }) => asset.id === id)!.parts.map(({ alternatives }) => {
  expect(alternatives).toHaveLength(1);
  return describeLocator(alternatives[0]);
});

describe('production rule-data mappings', () => {
  it('read as a declared table with one mapping per rule-data Asset and the confidence and U items of the Asset table', () => {
    expect(table).toEqual(PRODUCTION_RULE_DATA_MAPPINGS);
    expect(table.sourceFingerprint).toBeNull();
    expect(table.mappings.map(({ asset, confidence, unknowns, resolution }) => ({ asset, confidence, unknowns, resolution }))).toEqual([
      { asset: { id: 'data/ai-programs', kind: 'data' }, confidence: 'likely', unknowns: ['U-001', 'U-022'], resolution: 'declared' },
      { asset: { id: 'data/base-repair-items', kind: 'data' }, confidence: 'likely', unknowns: ['U-030'], resolution: 'declared' },
      { asset: { id: 'data/comm-menus', kind: 'data' }, confidence: 'likely', unknowns: ['U-001'], resolution: 'declared' },
      { asset: { id: 'data/comm-messages', kind: 'data' }, confidence: 'confirmed', unknowns: [], resolution: 'declared' },
      { asset: { id: 'data/craft-info', kind: 'data' }, confidence: 'likely', unknowns: ['U-001', 'U-008', 'U-026'], resolution: 'declared' },
      { asset: { id: 'data/debris-parameters', kind: 'data' }, confidence: 'likely', unknowns: ['U-001', 'U-027'], resolution: 'declared' },
      { asset: { id: 'data/flight-messages', kind: 'data' }, confidence: 'confirmed', unknowns: [], resolution: 'declared' },
    ]);
    expect(table.mappings.every(({ evidence }) => evidence.length > 0)).toBe(true);
    // Every part's entry type or region can supply a data Asset, so nothing conflicts; nothing is verified before an import.
    expect(diagnoseSourceMappings(table, [])).toEqual([]);
    expect(assetSourceStates(table).states.every(({ state }) => state === 'unverified')).toBe(true);
  });

  it('record the slice candidate selections as the TABL 4003 and AICO sub-resources, and the TABL 10165 selector field', () => {
    // The candidate is group 0, slot 1: the TABL 4003 pair of row 1, column 0, and the AICO triple of group 0.
    expect(PRODUCTION_RULE_DATA_SOURCES.candidate).toBe(CLASSIC_P2_SLICE.candidate);
    expect(CLASSIC_P2_SLICE.candidate).toEqual({ campaignGroup: 0, campaignSlot: 1 });
    expect(parts('data/ai-programs')[0]).toBe('MAIN/AISTUFF.NOB#6001.AICO/group-0');
    expect(parts('data/craft-info')).toEqual(['MAIN/CRAFT.NOB#4037.CINF/null', 'MAIN/CRAFT.NOB#4003.TABL/group-0/slot-1']);
    expect(parts('data/base-repair-items')).toEqual(['MAIN/SR.NOB#10165.TABL/records/subsystem-selector']);
    expect(parts('data/debris-parameters')).toEqual(['MAIN/DEBRIS.NOB#4501.TABL/null']);
    expect(parts('data/comm-menus')).toEqual([2003, 2005, 2007, 2009, 2013].map(id => `MAIN/COMM.NOB#${id}.TABL/null`));
    const { commMenus } = ruleDataLocators(PRODUCTION_RULE_DATA_SOURCES);
    expect(Object.fromEntries(Object.entries(commMenus).map(([key, { entry }]) => [key, entry.id]))).toEqual({
      gatedTargetCommands: 2003, otherTargetCommands: 2005, categories: 2007, objectListLastEntry: 2009, kind2TargetCommands: 2013,
    });
  });

  it('name AICO 6001, TABL 6003 and the 25 entries of the group-0 closure, then the built-in table and its 10 names', () => {
    const ai = parts('data/ai-programs');
    expect(ai).toHaveLength(2 + 25 + 1 + 10);
    expect(ai[0]).toBe('MAIN/AISTUFF.NOB#6001.AICO/group-0');
    expect(ai.filter(part => part.endsWith('.DFPG/null'))).toHaveLength(3);
    expect(ai.filter(part => part.endsWith('.TABL/null'))).toHaveLength(23);
    expect(ai).toContain('MAIN/AISTUFF.NOB#6003.TABL/null');
    const { aiPrograms } = PRODUCTION_RULE_DATA_SOURCES;
    expect(new Set([aiPrograms.globals, aiPrograms.table, ...aiPrograms.parameters, ...aiPrograms.scripts]).size).toBe(27);

    // ai.md §3.3: ten 0x54-byte records and the count word; names of 4 to 16 bytes from 0x1722b4 to 0x17231f, in object 4.
    const regions = ruleDataLocators(PRODUCTION_RULE_DATA_SOURCES).aiPrograms;
    expect(executableRegion(regions.builtIn)).toEqual({ ...objectOffset(0x17_62f8), length: 0x34c });
    const names = regions.builtInNames.map(executableRegion);
    expect(names).toHaveLength(10);
    for (const { object, offset, length } of names) {
      expect(object).toBe(4);
      expect(offset).toBeGreaterThanOrEqual(objectOffset(0x17_22b4).offset);
      expect(offset).toBeLessThanOrEqual(objectOffset(0x17_231f).offset);
      expect(length - 1).toBeGreaterThanOrEqual(4);
      expect(length - 1).toBeLessThanOrEqual(Math.min(16, AI_PROGRAMS_LIMITS.programNameBytes));
    }
    names.slice(1).forEach((name, index) => expect(name.offset).toBeGreaterThanOrEqual(names[index].offset + names[index].length));
  });

  it('name the seven documented flight message regions, each within the text limit', () => {
    expect(parts('data/flight-messages')).toEqual([
      'MAIN/SRANGERS.EXE le/4/0xdb8/16', 'MAIN/SRANGERS.EXE le/4/0xdc8/17', 'MAIN/SRANGERS.EXE le/4/0xddc/28', 'MAIN/SRANGERS.EXE le/4/0xdf8/26',
      'MAIN/SRANGERS.EXE le/4/0xe14/25', 'MAIN/SRANGERS.EXE le/4/0x106c/40', 'MAIN/SRANGERS.EXE le/4/0x1094/46',
    ]);
    const { flightMessages } = ruleDataLocators(PRODUCTION_RULE_DATA_SOURCES);
    expect(Object.fromEntries(Object.entries(flightMessages).map(([key, locator]) => [key, locator.subresource]))).toEqual({
      missionComplete: 'le/4/0x106c/40', beacon: 'le/4/0x1094/46', speedAssistOn: 'le/4/0xdb8/16', speedAssistOff: 'le/4/0xdc8/17',
      joystickSensitivity1: 'le/4/0xddc/28', joystickSensitivity2: 'le/4/0xdf8/26', joystickSensitivity0: 'le/4/0xe14/25',
    });
    expect(Object.values(flightMessages).every(locator => executableRegion(locator).length - 1 <= FLIGHT_MESSAGES_LIMITS.textBytes)).toBe(true);
  });

  it('name the COMM name lists, the four COMMFACE tables, the 13 sub-tables and the 481 CMOVs by their frames, and no COMMFAC2 entry', () => {
    const comm = parts('data/comm-messages');
    expect(comm).toHaveLength(2 + 4 + 13 + 481);
    expect(comm.slice(0, 2)).toEqual(['MAIN/COMM.NOB#2001.TABL/null', 'MAIN/COMM.NOB#2011.TABL/null']);
    // imfat.md: COMMFACE holds 481 CMOV and 17 TABL entries; the CMOVs take every odd ID from 20021 to 20981.
    expect(comm.slice(2, 483)).toEqual(Array.from({ length: 481 }, (_, index) => `MAIN/COMMFACE.NOB#${20_021 + index * 2}.CMOV/frames/durations`));
    expect(comm.slice(483).map(part => part.replace(/^MAIN\/COMMFACE\.NOB#(\d+)\.TABL\/null$/, '$1')).map(Number)).toEqual([
      20_001, 20_003, 20_005, 20_007, 20_009, 20_011, 20_013, 20_015, 20_017, 20_019, 20_983, 20_985, 20_987, 20_989, 20_991, 20_993, 20_995,
    ]);
    expect(table.mappings.flatMap(({ parts: mapped }) => mapped.map(({ alternatives: [first] }) => first.discPath))).not.toContain('MAIN/COMMFAC2.NOB');
    expect(PRODUCTION_RULE_DATA_SOURCES.commMessages.faceTables).toEqual([20_011, 20_019, 20_985]);
    expect(PRODUCTION_RULE_DATA_SOURCES.commMessages.direct).toBe(20_983);
  });

  it('are built from their sources alone', () => {
    expect(ruleDataMappings(PRODUCTION_RULE_DATA_SOURCES)).toEqual(PRODUCTION_RULE_DATA_MAPPINGS);
    expect(Object.isFrozen(PRODUCTION_RULE_DATA_MAPPINGS) && Object.isFrozen(PRODUCTION_RULE_DATA_SOURCES)).toBe(true);
  });
});

describe('production rule-data sources in the production structure', () => {
  it('convert with the production plan and share, reading each mapped entry once and no decoy', async () => {
    const synthetic = productionRuleData();
    const { source, reads } = await countedVerifiedSource({
      ...synthetic.archives,
      'MAIN/SR.NOB': buildImfat(10_000, [...synthetic.srEntries]),
      'MAIN/SRANGERS.EXE': regionExecutable(synthetic.writes, synthetic.fixups),
    });
    const { partition, usage } = await convertRuleData(source, PRODUCTION_RULE_DATA_SHARE);
    expect(usage).toEqual(synthetic.usage);
    expect(partition.assets.map((descriptor, index) => decodeRuleDataPayload(partition.payloads[index].bytes, descriptor)))
      .toEqual(partition.assets.map(({ role }) => ({ role, content: synthetic.contents[role as keyof typeof synthetic.contents] })));
    expect(partition.sources?.states.every(({ state }) => state === 'verified')).toBe(true);
    const { aiPrograms, craftInfo, debrisParameters, commMenus, baseRepairItems, commMessages } = PRODUCTION_RULE_DATA_SOURCES;
    const mapped = [
      craftInfo.table, craftInfo.craftInfo, debrisParameters.table, aiPrograms.globals, aiPrograms.table, ...aiPrograms.parameters, ...aiPrograms.scripts,
      ...Object.values(commMenus.tables), baseRepairItems.table, commMessages.names2001, commMessages.names2011, ...commMessages.faceTables,
      commMessages.direct, ...commMessages.subTables, ...commMessages.messages,
    ];
    expect([...reads.keys()].sort()).toEqual([...mapped].sort());
    expect([...reads.values()].every(count => count === 1)).toBe(true);
  });
});

describe('production rule-data share', () => {
  it('is a complete frozen budget record of Assets and payload bytes (derived in production-package.test.ts)', () => {
    expect(readBudgetRecord(PRODUCTION_RULE_DATA_SHARE, 'share')).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 16, payloadBytes: 262_144 });
    expect(Object.isFrozen(PRODUCTION_RULE_DATA_SHARE)).toBe(true);
  });
});
