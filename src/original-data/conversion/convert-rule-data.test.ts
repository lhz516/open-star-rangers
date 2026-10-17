import { describe, expect, it } from 'vitest';
import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { decodeRuleDataPayload, type RuleDataRole } from '../../content/rule-data/rule-data-payload.ts';
import { deepFrozen } from '../../content/rule-data/rule-data.test-support.ts';
import { openImfatArchive } from '../archive/archive-reader.ts';
import { IMFAT_HEADER_BYTES } from '../archive/imfat-rules.ts';
import type { DiscFile } from '../disc/disc-image.ts';
import { syntheticAiSources } from '../formats/ai.test-support.ts';
import { COMM_NOB } from '../formats/comm.test-support.ts';
import { COMMFACE_NOB, idTable, syntheticCmov } from '../formats/comm-face.test-support.ts';
import { CRAFT_NOB } from '../formats/craft.test-support.ts';
import { DEBRIS_NOB } from '../formats/debris.test-support.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import type { VerifiedSource } from '../source/identify-source.ts';
import { syntheticVerifiedSource } from '../source/source.test-support.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import { UNLIMITED_BUDGET } from './conversion.test-support.ts';
import { convertRuleData, ruleDataIncrement, type RuleDataConversion } from './convert-rule-data.ts';
import { ruleDataMappings, type RuleDataSources } from './production-rule-data.ts';
import {
  AISTUFF_NOB, COMMFAC2_NOB, MARKER, SR_NOB, SYNTHETIC_RULE_DATA_IDS as IDS, ruleDataFiles, syntheticRuleData, type SyntheticRuleData,
} from './rule-data.test-support.ts';

// P3-03 AC-03 to AC-06 (conversion parts), AC-13, AC-14 (share metering) and AC-18: code-generated archives and an LE file
// only; P3-10/29 adds the revision 2 comm-messages parts (P3-03 AC-22). The mapping table orders the Assets ai-programs,
// base-repair-items, comm-menus, comm-messages, craft-info, debris-parameters and flight-messages; within a mapping, entry
// parts come by type and ID, then regions by object and offset.

const ROLES: readonly RuleDataRole[] = ['ai-programs', 'base-repair-items', 'comm-menus', 'comm-messages', 'craft-info', 'debris-parameters', 'flight-messages'];
const part = (mapping: number, index: number) => `sources.mappings[${mapping}].parts[${index}].alternatives[0]`;
/**
 * The ai-programs region parts after its 8 entry parts: the keyword tables in object 2, the built-in names in object 3,
 * then in object 4 the built-in table and the keyword names after it (rule-data.test-support.ts).
 */
const KEYWORD_TABLES = 8;
const BUILT_IN_NAMES = 12;
const BUILT_IN_TABLE = 15;
const KEYWORD_NAMES = 16;
/** Synthetic AI entry IDs: AICO, the program table, then the content entries in first-reach order (ai.test-support.ts). */
const AI = Object.freeze({ globals: 7_101, table: 7_103, entries: [7_201, 7_203, 7_205, 7_207, 7_209, 7_211] });
/** The synthetic COMMFACE and name list IDs of the default fixture (comm-face.test-support.ts). */
const FACE = syntheticRuleData().sources.commMessages;
const HIDDEN = new RegExp(`${MARKER}|\\b(?:${[IDS.craftTable, IDS.craftInfo, IDS.otherCraftInfo, IDS.debris, IDS.baseRepair, ...AI.entries].join('|')})\\b`);

interface Run {
  fixture?: SyntheticRuleData;
  sources?: (sources: RuleDataSources) => RuleDataSources;
  limits?: BudgetRecord;
  usage?: BudgetRecord;
}

/** Read counts by `PATH header`, `PATH directory` or `PATH TYPE#ID` for archives, and by `PATH` for the executable. */
function logged(identified: VerifiedSource) {
  const log: { readonly path: string; readonly offset: number }[] = [];
  const openFile = async (path: string): Promise<DiscFile> => {
    const file = await identified.openFile(path);
    return { entry: file.entry, read: (offset, length) => (log.push({ path, offset }), file.read(offset, length)) };
  };
  const source: VerifiedSource = {
    identity: identified.identity, usage: () => identified.usage(), openFile, openArchive: async path => openImfatArchive(await openFile(path)),
  };
  async function counts(): Promise<Record<string, number>> {
    const labels = new Map<string, ReadonlyMap<number, string>>();
    const result: Record<string, number> = {};
    for (const { path, offset } of log) {
      let label = path;
      if (path.endsWith('.NOB')) {
        if (!labels.has(path)) {
          const { entries } = await identified.openArchive(path);
          labels.set(path, new Map([[0, 'header'], [IMFAT_HEADER_BYTES, 'directory'], ...entries.map(({ offset: at, id, type }) => [at, `${type}#${id}`] as const)]));
        }
        label = `${path} ${labels.get(path)!.get(offset) ?? `@${offset}`}`;
      }
      result[label] = (result[label] ?? 0) + 1;
    }
    return result;
  }
  return { source, counts };
}

/** Starts a conversion of `run` over a logged source; the read counts stay available when it fails. */
async function start({ fixture = syntheticRuleData(), sources = plan => plan, limits = UNLIMITED_BUDGET, usage = EMPTY_BUDGET_USAGE }: Run = {}) {
  const verified = await syntheticVerifiedSource(ruleDataFiles(fixture));
  const { source, counts } = logged(verified);
  return { source, counts, conversion: convertRuleData(source, limits, usage, sources(fixture.sources)) };
}

async function convert(run: Run = {}) {
  const { source, counts, conversion } = await start(run);
  return { source, counts, result: await conversion };
}

const failure = (run: Run) => sourceFailure(() => convert(run), HIDDEN);

/** Each payload decoded with its descriptor, by role. */
const decoded = ({ partition }: RuleDataConversion) =>
  Object.fromEntries(partition.assets.map((descriptor, index) => [descriptor.role, decodeRuleDataPayload(partition.payloads[index].bytes, descriptor).content]));

/** The usage the spec's metering gives, computed from the descriptors: one Asset and its payload bytes each, no dependencies. */
const independentUsage = ({ partition }: RuleDataConversion): BudgetRecord => ({
  ...EMPTY_BUDGET_USAGE,
  assets: partition.assets.length,
  dependencyEdges: partition.assets.reduce((sum, { dependencies }) => sum + dependencies.length, 0),
  payloadBytes: partition.assets.reduce((sum, { payloadIdentity }) => sum + payloadIdentity.byteLength, 0),
});

/** The fixture with the data of entry `id` of `archive` padded with zeros to `length` bytes. */
function withEntryBytes(archive: string, id: number, length: number): SyntheticRuleData {
  const fixture = syntheticRuleData();
  const entries = fixture.archives[archive];
  const index = entries.findIndex(entry => entry.id === id);
  const data = new Uint8Array(length);
  data.set(entries[index].data.subarray(0, length));
  entries[index] = { ...entries[index], data };
  return fixture;
}

describe('rule-data conversion', () => {
  it('converts the synthetic sources into the seven rule-data payloads with fingerprinted, verified source states', async () => {
    const fixture = syntheticRuleData();
    const { source, result } = await convert({ fixture });
    const { partition } = result;
    expect(partition.group).toBe('logic');
    expect(partition.assets.map(({ id, kind, role, group, dependencies, payloadIdentity }) => ({ id, kind, role, group, dependencies, schemaVersion: payloadIdentity.schemaVersion })))
      .toEqual(ROLES.map(role => ({ id: `data/${role}`, kind: 'data', role, group: 'logic', dependencies: [], schemaVersion: role === 'ai-programs' ? 2 : 1 })));
    expect(partition.payloads.map(({ id }) => id)).toEqual(ROLES.map(role => `data/${role}`));
    expect(decoded(result)).toEqual(fixture.contents);
    expect(partition.sources).toEqual({
      sourceFingerprint: source.identity.fingerprint,
      states: [
        { id: 'data/ai-programs', state: 'verified', unknowns: ['U-001', 'U-022'] },
        { id: 'data/base-repair-items', state: 'verified', unknowns: ['U-030'] },
        { id: 'data/comm-menus', state: 'verified', unknowns: ['U-001'] },
        { id: 'data/comm-messages', state: 'verified', unknowns: [] },
        { id: 'data/craft-info', state: 'verified', unknowns: ['U-001', 'U-008', 'U-026'] },
        { id: 'data/debris-parameters', state: 'verified', unknowns: ['U-001', 'U-027'] },
        { id: 'data/flight-messages', state: 'verified', unknowns: [] },
      ],
    });
    expect(deepFrozen(result.partition.assets) && Object.isFrozen(result) && Object.isFrozen(partition)).toBe(true);
  });

  it('takes the hit damage scale from the slice candidate pair and nothing from the decoy table or fields', async () => {
    const fixture = syntheticRuleData();
    const content = decoded((await convert({ fixture })).result);
    expect((content['craft-info'] as { hitDamageScale: number }).hitDamageScale).toBe(fixture.contents['craft-info'].hitDamageScale);
    // Only the record selectors of TABL 10165 and only the five menus are carried (AC-06).
    expect(Object.keys(content['base-repair-items'] as object)).toEqual(['subsystemSelectors']);
    expect(Object.keys(content['comm-menus'] as object).sort()).toEqual(['categories', 'gatedTargetCommands', 'kind2TargetCommands', 'objectListLastEntry', 'otherTargetCommands']);
  });

  it('reads each mapped entry once, with its archive header and directory once, and no other entry', async () => {
    const { counts } = await convert();
    const archiveReads = Object.fromEntries(Object.entries(await counts()).filter(([label]) => label.includes('.NOB ')));
    const once = (archive: string, ...labels: string[]) => Object.fromEntries([`${archive} header`, `${archive} directory`, ...labels.map(label => `${archive} ${label}`)].map(label => [label, 1]));
    expect(archiveReads).toEqual({
      ...once(CRAFT_NOB, `TABL#${IDS.craftTable}`, `CINF#${IDS.craftInfo}`),
      ...once(DEBRIS_NOB, `TABL#${IDS.debris}`),
      ...once(AISTUFF_NOB, `AICO#${AI.globals}`, `TABL#${AI.table}`, ...AI.entries.map((id, index) => `${[0, 4].includes(index) ? 'DFPG' : 'TABL'}#${id}`)),
      ...once(COMM_NOB, 'TABL#2003', 'TABL#2005', 'TABL#2007', 'TABL#2009', 'TABL#2013', `TABL#${FACE.names2001}`, `TABL#${FACE.names2011}`),
      ...once(SR_NOB, `TABL#${IDS.baseRepair}`),
      ...once(COMMFACE_NOB, ...[...FACE.faceTables, FACE.direct, ...FACE.subTables].map(id => `TABL#${id}`), ...FACE.messages.map(id => `CMOV#${id}`)),
    });
    expect(Object.keys(await counts()).filter(label => label.startsWith(COMMFAC2_NOB))).toEqual([]);
  });

  it('leaves the sub-resource and region mappings declared until the conversion has parsed them', async () => {
    const fixture = syntheticRuleData();
    const source = await syntheticVerifiedSource(ruleDataFiles(fixture));
    const verified = await verifySourceMappings(ruleDataMappings(fixture.sources), source);
    expect(Object.fromEntries(verified.mappings.map(({ asset, resolution }) => [asset.id, resolution]))).toEqual({
      'data/ai-programs': 'declared',
      'data/base-repair-items': 'declared',
      'data/comm-menus': 'verified',
      'data/comm-messages': 'declared',
      'data/craft-info': 'declared',
      'data/debris-parameters': 'verified',
      'data/flight-messages': 'declared',
    });
    // A part that fails to parse yields no partition at all, so nothing is ever reported verified for it.
    const broken = syntheticRuleData();
    const entry = broken.archives[SR_NOB].find(({ id }) => id === IDS.baseRepair)!;
    new DataView(entry.data.buffer).setUint32(2 * 0x7c + 0x6c, 32, true);
    expect(await failure({ fixture: broken }))
      .toEqual({ code: 'unsupported-payload', location: `archive:/${SR_NOB}#${IDS.baseRepair}/subsystemSelectors[2]`, limit: null });
  });
});

describe('rule-data ID chains and selections', () => {
  it('reports a CINF part other than the one the selected pair names as subresource-mismatch at the table part', async () => {
    expect(await failure({ sources: plan => ({ ...plan, craftInfo: { ...plan.craftInfo, craftInfo: IDS.otherCraftInfo } }) }))
      .toEqual({ code: 'subresource-mismatch', location: part(4, 1), limit: null });
  });

  it('reports a slice candidate slot outside TABL 4003 as subresource-mismatch', async () => {
    expect(await failure({ sources: plan => ({ ...plan, candidate: { ...plan.candidate, campaignSlot: 18 } }) }))
      .toEqual({ code: 'subresource-mismatch', location: `archive:/${CRAFT_NOB}#${IDS.craftTable}/rows[18]`, limit: null });
  });

  it('reports a slice candidate group outside TABL 4003 as subresource-mismatch once its AICO triple resolves', async () => {
    // AICO with four triples, the content's at group 3.
    const fixture = syntheticRuleData();
    const globals = syntheticAiSources(fixture.contents['ai-programs'], { triples: 4, group: 3 }).globals.block;
    const entries = fixture.archives[AISTUFF_NOB];
    const index = entries.findIndex(({ id }) => id === AI.globals);
    entries[index] = { ...entries[index], data: globals.bytes, relocations: globals.relocations };
    expect(await failure({ fixture, sources: plan => ({ ...plan, candidate: { ...plan.candidate, campaignGroup: 3 } }) }))
      .toEqual({ code: 'subresource-mismatch', location: `archive:/${CRAFT_NOB}#${IDS.craftTable}/rows[1]/pairs[3]`, limit: null });
  });

  it('reports a slice candidate group outside the AICO triples as subresource-mismatch', async () => {
    expect(await failure({ sources: plan => ({ ...plan, candidate: { ...plan.candidate, campaignGroup: 3 } }) }))
      .toEqual({ code: 'subresource-mismatch', location: `archive:/${AISTUFF_NOB}#${AI.globals}/groupTriples[3]`, limit: null });
  });

  it.each<[string, (ai: RuleDataSources['aiPrograms']) => Partial<RuleDataSources['aiPrograms']>, string]>([
    ['an extra script part outside the ID chain', ai => ({ scripts: [...ai.scripts, IDS.aiDecoyScript] }), `#${IDS.aiDecoyScript}`],
    ['an extra DFPG part outside the ID chain', ai => ({ parameters: [...ai.parameters, IDS.aiDecoyParameters] }), `#${IDS.aiDecoyParameters}`],
    ['a missing DFPG part', ai => ({ parameters: ai.parameters.slice(1) }), `#${AI.table}/programs[0]/parameters`],
    ['a missing script part', ai => ({ scripts: ai.scripts.filter(id => id !== AI.entries[5]) }), `#${AI.entries[4]}/stateScripts/state4[0]`],
  ])('reports %s as subresource-mismatch', async (_, change, at) => {
    expect(await failure({ sources: plan => ({ ...plan, aiPrograms: { ...plan.aiPrograms, ...change(plan.aiPrograms) } }) }))
      .toEqual({ code: 'subresource-mismatch', location: `archive:/${AISTUFF_NOB}${at}`, limit: null });
  });
});

describe('comm-messages ID chain', () => {
  const at = (id: number, path = '') => `archive:/${COMMFACE_NOB}#${id}${path}`;
  /** The fixture with the COMMFACE entry `id`'s block replaced. */
  function withFaceEntry(id: number, block: { bytes: Uint8Array; relocations: number[] }): SyntheticRuleData {
    const fixture = syntheticRuleData();
    const entries = fixture.archives[COMMFACE_NOB];
    const index = entries.findIndex(entry => entry.id === id);
    entries[index] = { ...entries[index], data: block.bytes, relocations: block.relocations };
    return fixture;
  }

  it.each<[string, (comm: RuleDataSources['commMessages']) => Partial<RuleDataSources['commMessages']>, string]>([
    ['an extra sub-table part no face table names', comm => ({ subTables: [...comm.subTables, IDS.faceDecoyTable] }), at(IDS.faceDecoyTable)],
    ['an extra CMOV part no table names', comm => ({ messages: [...comm.messages, IDS.faceDecoyMessage] }), at(IDS.faceDecoyMessage)],
    ['a missing sub-table part', comm => ({ subTables: comm.subTables.slice(1) }), at(FACE.faceTables[0], '/faces[0]')],
    ['a missing CMOV part', comm => ({ messages: comm.messages.slice(1) }), at(FACE.subTables[0], '/messages[0]')],
  ])('reports %s as subresource-mismatch', async (_, change, location) => {
    expect(await failure({ sources: plan => ({ ...plan, commMessages: { ...plan.commMessages, ...change(plan.commMessages) } }) }))
      .toEqual({ code: 'subresource-mismatch', location, limit: null });
  });

  it('reports a table naming an entry outside the mapping as subresource-mismatch without reading it', async () => {
    const fixture = withFaceEntry(FACE.direct, idTable([IDS.faceDecoyMessage]));
    const { counts, conversion } = await start({ fixture });
    expect(await sourceFailure(() => conversion, HIDDEN)).toEqual({ code: 'subresource-mismatch', location: at(FACE.direct, '/messages[0]'), limit: null });
    expect(await counts()).not.toHaveProperty([`${COMMFACE_NOB} CMOV#${IDS.faceDecoyMessage}`]);
  });

  it.each<[string, (cmov: ReturnType<typeof syntheticCmov>) => void, string, string]>([
    ['no frames', cmov => { new DataView(cmov.bytes.buffer).setInt32(8, 0, true); }, 'unsupported-payload', '/frames'],
    ['a negative duration', cmov => { new DataView(cmov.bytes.buffer).setInt32(cmov.headers[2], -8, true); }, 'unsupported-payload', '/frames[2]/duration'],
    ['frame records cut off', cmov => { new DataView(cmov.bytes.buffer).setUint32(4, cmov.bytes.length - 8, true); }, 'invalid-payload', '/frames'],
  ])('rejects a CMOV with %s', async (_, corrupt, code, path) => {
    const cmov = syntheticCmov([2, 3, 4]);
    corrupt(cmov);
    expect(await failure({ fixture: withFaceEntry(FACE.messages[1], cmov) })).toEqual({ code, location: at(FACE.messages[1], path), limit: null });
  });

  it('rejects a CMOV over the frame limit before reading its frames', async () => {
    const cmov = syntheticCmov([2, 3, 4]);
    new DataView(cmov.bytes.buffer).setInt32(8, 9, true);
    expect(await failure({ fixture: withFaceEntry(FACE.messages[0], cmov) }))
      .toEqual({ code: 'limit-exceeded', location: at(FACE.messages[0], '/frames'), limit: { name: 'payloadItems', limit: 8, observed: 9 } });
  });
});

describe('rule-data structural limits', () => {
  it.each<[string, string, string, number, number, string]>([
    ['TABL 4003', CRAFT_NOB, 'TABL', IDS.craftTable, 432, part(4, 1)],
    ['the CINF', CRAFT_NOB, 'CINF', IDS.craftInfo, 65_536, part(4, 0)],
    ['DEBRIS TABL 4501', DEBRIS_NOB, 'TABL', IDS.debris, 32_768, part(5, 0)],
    ['AICO', AISTUFF_NOB, 'AICO', AI.globals, 512, part(0, 0)],
    ['a DFPG', AISTUFF_NOB, 'DFPG', AI.entries[4], 512, part(0, 2)],
    ['the program table', AISTUFF_NOB, 'TABL', AI.table, 4_096, part(0, 3)],
    ['a script', AISTUFF_NOB, 'TABL', AI.entries[5], 4_096, part(0, 7)],
    ['a COMM menu table', COMM_NOB, 'TABL', 2_007, 512, part(2, 2)],
    ['a COMM name list', COMM_NOB, 'TABL', FACE.names2011, 512, part(3, 1)],
    // The name lists, then the CMOVs, then the COMMFACE TABLs by ID (31_101, 31_103, …).
    ['a face table', COMMFACE_NOB, 'TABL', FACE.faceTables[0], 1_024, part(3, 2 + FACE.messages.length + 1)],
    ['a CMOV', COMMFACE_NOB, 'CMOV', FACE.messages[0], 524_288, part(3, 2)],
    ['TABL 10165', SR_NOB, 'TABL', IDS.baseRepair, 262_144, part(1, 0)],
  ])('rejects %s one byte over its parser limit before reading it', async (_, archive, type, id, limit, location) => {
    const { counts, conversion } = await start({ fixture: withEntryBytes(archive, id, limit + 1) });
    expect(await sourceFailure(() => conversion, HIDDEN))
      .toEqual({ code: 'limit-exceeded', location, limit: { name: 'payloadEntryBytes', limit, observed: limit + 1 } });
    expect(await counts()).not.toHaveProperty([`${archive} ${type}#${id}`]);
  });

  it('accepts an entry at exactly its limit as far as the parser reads it', async () => {
    // TABL 10165 padded to its limit still has its records first, so the conversion succeeds.
    const { result } = await convert({ fixture: withEntryBytes(SR_NOB, IDS.baseRepair, 262_144) });
    expect(result.partition.assets).toHaveLength(7);
  });

  it('judges a flight message region longer than the text limit before reading it', async () => {
    const run: Run = {
      sources: plan => ({ ...plan, flightMessages: { ...plan.flightMessages, beacon: { ...plan.flightMessages.beacon, length: 130 } } }),
    };
    expect(await failure(run)).toEqual({ code: 'limit-exceeded', location: part(6, 1), limit: { name: 'textBytes', limit: 128, observed: 129 } });
  });

  it('rejects a flight message region that is not exactly its string and NUL', async () => {
    const run: Run = {
      sources: plan => ({ ...plan, flightMessages: { ...plan.flightMessages, speedAssistOn: { ...plan.flightMessages.speedAssistOn, length: 15 } } }),
    };
    expect(await failure(run)).toEqual({ code: 'invalid-payload', location: part(6, 2), limit: null });
  });

  it('judges the built-in table and name regions by their lengths before reading them', async () => {
    const names: Run = {
      sources: plan => ({ ...plan, aiPrograms: { ...plan.aiPrograms, builtInNames: plan.aiPrograms.builtInNames.map((name, index) => (index === 1 ? { ...name, length: 66 } : name)) } }),
    };
    expect(await failure(names)).toEqual({ code: 'limit-exceeded', location: part(0, BUILT_IN_NAMES + 1), limit: { name: 'textBytes', limit: 64, observed: 65 } });
    const table: Run = {
      sources: plan => ({ ...plan, aiPrograms: { ...plan.aiPrograms, builtIn: { ...plan.aiPrograms.builtIn, length: 33 * 0x54 + 4 } } }),
    };
    // A region structure path, which the archive location grammar does not cover; the diagnostic holds no value.
    await expect(convert(table)).rejects.toMatchObject({
      name: 'SourceError', code: 'limit-exceeded', location: `${part(0, BUILT_IN_TABLE)}/programs`, limit: { name: 'aiProgramRecords', limit: 32, observed: 33 },
    });
  });

  it('rejects a built-in name region that is not exactly the name and its NUL', async () => {
    const run: Run = {
      sources: plan => ({ ...plan, aiPrograms: { ...plan.aiPrograms, builtInNames: plan.aiPrograms.builtInNames.map((name, index) => (index === 0 ? { ...name, length: name.length + 1 } : name)) } }),
    };
    expect(await failure(run)).toEqual({ code: 'invalid-payload', location: part(0, BUILT_IN_NAMES), limit: null });
  });
});

describe('keyword tables (P3-03 AC-23)', () => {
  type Ai = RuleDataSources['aiPrograms'];
  const withAi = (change: (ai: Ai) => Partial<Ai>): Run => ({ sources: plan => ({ ...plan, aiPrograms: { ...plan.aiPrograms, ...change(plan.aiPrograms) } }) });

  it('maps the four tables and the distinct names in region order and converts them', async () => {
    const fixture = syntheticRuleData();
    const { keywordTables, keywordNames } = fixture.sources.aiPrograms;
    expect([keywordTables.length, keywordNames.length]).toEqual([4, 9]);
    const { result } = await convert({ fixture });
    expect((decoded(result)['ai-programs'] as { keywordTables: unknown }).keywordTables).toEqual(fixture.contents['ai-programs'].keywordTables);
    const mapped = ruleDataMappings(fixture.sources).mappings[0].parts.map(({ alternatives: [locator] }) => locator.subresource);
    expect(mapped.slice(KEYWORD_TABLES, KEYWORD_TABLES + 4)).toEqual(keywordTables.map(({ object, offset, length }) => `le/${object}/0x${offset.toString(16)}/${length}`));
    expect(mapped.slice(KEYWORD_NAMES)).toEqual(keywordNames.map(({ object, offset, length }) => `le/${object}/0x${offset.toString(16)}/${length}`));
  });

  it('judges the table and name regions by their lengths before reading them', async () => {
    const pairs = withAi(ai => ({ keywordTables: ai.keywordTables.map((table, index) => (index === 1 ? { ...table, length: 18 * 8 } : table)) as unknown as Ai['keywordTables'] }));
    await expect(convert(pairs)).rejects.toMatchObject({
      code: 'limit-exceeded', location: `${part(0, KEYWORD_TABLES + 1)}/entries`, limit: { name: 'aiKeywordEntries', limit: 16, observed: 17 },
    });
    const names = withAi(() => ({ keywordNames: Array.from({ length: 33 }, (_, index) => ({ object: 4, offset: 0x8000 + index * 2, length: 2 })) }));
    expect(await failure(names)).toEqual({ code: 'limit-exceeded', location: part(0, KEYWORD_NAMES + 32), limit: { name: 'aiKeywordNames', limit: 32, observed: 33 } });
    const bytes = withAi(ai => ({ keywordNames: [...ai.keywordNames.slice(0, -1), { ...ai.keywordNames.at(-1)!, length: 257 - ai.keywordNames.slice(0, -1).reduce((total, { length }) => total + length, 0) }] }));
    expect(await failure(bytes)).toEqual({ code: 'limit-exceeded', location: part(0, KEYWORD_NAMES + 8), limit: { name: 'aiKeywordNameBytes', limit: 256, observed: 257 } });
    const long = withAi(ai => ({ keywordNames: ai.keywordNames.map((name, index) => (index === 2 ? { ...name, length: 66 } : name)) }));
    expect(await failure(long)).toEqual({ code: 'limit-exceeded', location: part(0, KEYWORD_NAMES + 2), limit: { name: 'textBytes', limit: 64, observed: 65 } });
  });

  it('reports a mapped name region no pair names, and a pair naming an unmapped region, as subresource-mismatch', async () => {
    // The tail of the first name, a valid text and NUL that no pair names; it sorts right after that name.
    const extra = withAi(ai => ({ keywordNames: [...ai.keywordNames, { ...ai.keywordNames[0], offset: ai.keywordNames[0].offset + 1, length: ai.keywordNames[0].length - 1 }] }));
    expect(await failure(extra)).toEqual({ code: 'subresource-mismatch', location: part(0, KEYWORD_NAMES + 1), limit: null });
    const missing = withAi(ai => ({ keywordNames: ai.keywordNames.slice(1) }));
    await expect(convert(missing)).rejects.toMatchObject({ code: 'subresource-mismatch', location: `${part(0, KEYWORD_TABLES)}/entries[0]/name` });
  });
});

describe('rule-data budget', () => {
  const prior: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 5, paletteEntries: 512, payloadBytes: 1_000, missionObjects: 3 };

  it('charges one Asset and its payload bytes each, exactly the independently computed usage, on top of earlier usage', async () => {
    const alone = (await convert()).result;
    expect(alone.usage).toEqual(independentUsage(alone));
    expect(alone.usage.assets).toBe(7);
    const limits = addBudgets(prior, alone.usage);
    const { result } = await convert({ limits, usage: prior });
    expect(result.usage).toEqual(limits);
    expect(ruleDataIncrement(17)).toEqual({ assets: 1, dependencyEdges: 0, payloadBytes: 17 });
  });

  it('rejects the payload one byte over the budget at its Asset, with the earlier usage in the observed total', async () => {
    const alone = (await convert()).result;
    const limits = addBudgets(prior, { ...alone.usage, payloadBytes: alone.usage.payloadBytes - 1 });
    expect(await failure({ limits, usage: prior })).toEqual({
      code: 'budget-exceeded', location: part(6, 0), limit: { name: 'payloadBytes', limit: limits.payloadBytes, observed: limits.payloadBytes + 1 },
    });
  });

  it('rejects the Asset one over the budget and leaves the caller\'s usage unchanged', async () => {
    const alone = (await convert()).result;
    const limits = addBudgets(prior, { ...alone.usage, assets: 6 });
    const usage = { ...prior };
    expect(await failure({ limits, usage })).toEqual({
      code: 'budget-exceeded', location: part(6, 0), limit: { name: 'assets', limit: 11, observed: 12 },
    });
    expect(usage).toEqual(prior);
    expect((await convert({ limits: addBudgets(prior, alone.usage), usage })).result.usage).toEqual(addBudgets(prior, alone.usage));
  });

  it('rejects a starting usage that includes source reads', async () => {
    await expect(convert({ usage: { ...EMPTY_BUDGET_USAGE, sourceReadBytes: 1 } }))
      .rejects.toMatchObject({ name: 'ContentContractError', code: 'invalid-budget-value', path: 'usage.sourceReadBytes' });
  });
});
