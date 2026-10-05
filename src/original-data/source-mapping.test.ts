import { describe, expect, it } from 'vitest';
import { readAssetDescriptor, readAssetReference } from '../content/asset-contract.ts';
import { ASSET_KINDS } from '../content/asset-id.ts';
import { readSourceStateSet } from '../content/source-state.ts';
import { assetSourceStates, diagnoseSourceMappings, readSourceMappingTable, SOURCE_ENTRY_TYPES, type SourceMappingTable } from './source-mapping.ts';

// Synthetic locators only: structural shapes, not research claims about any original entry.
const locator = (type: string, id: number, subresource: string | null = null) =>
  ({ discPath: 'MAIN/SYNTH.NOB', entry: { id, type }, subresource });

const mapping = (id: string, kind: string, parts: ReturnType<typeof locator>[][], overrides: Record<string, unknown> = {}) => ({
  asset: { id, kind },
  parts: parts.map(alternatives => ({ alternatives })),
  confidence: 'confirmed',
  unknowns: [] as string[],
  evidence: ['docs/original/formats/imfat.md#5-entry-types'],
  resolution: 'verified',
  ...overrides,
});

const table = () => ({
  sourceFingerprint: 'source:synthetic-disc',
  mappings: [
    // Many-to-one: two image Assets share one locator, and a palette uses a sub-resource of it.
    mapping('image/synthetic-hull', 'image', [[locator('TEX', 20), locator('TEX', 24)]]),
    mapping('image/synthetic-hull-variant', 'image', [[locator('TEX', 20)]]),
    // One-to-many: a mission needs two parts; a model has one root part plus geometry.
    mapping('mission/synthetic-first', 'mission', [[locator('SCCT', 1, 'group-0/slot-1')], [locator('SCEN', 5)]]),
    mapping('model/synthetic-ship', 'model', [[locator('MESH', 31)], [locator('MESH', 32)], [locator('MODL', 30)]]),
    mapping('palette/synthetic-hull', 'palette', [[locator('TEX', 20, 'palette')]],
      { confidence: 'likely', unknowns: ['U-028'] }),
  ],
});

const required = (...ids: string[]) => ids.map(id => readAssetReference({ id, kind: id.split('/')[0] }));

describe('source mapping table', () => {
  it('expresses one-to-many and many-to-one mappings with confidence and U items', () => {
    const input = table();
    expect(readSourceMappingTable(input)).toEqual(input);
  });

  it('returns deeply frozen values isolated from caller changes', () => {
    const input = table();
    const result = readSourceMappingTable(input);
    input.mappings[0].parts[0].alternatives[0].entry.id = 99;
    input.mappings.pop();
    expect(result).toEqual(readSourceMappingTable(table()));
    const containers = [result, result.mappings, ...result.mappings.flatMap(entry => [
      entry, entry.asset, entry.parts, entry.unknowns, entry.evidence,
      ...entry.parts.flatMap(part => [part, part.alternatives, ...part.alternatives.flatMap(item => [item, item.entry])]),
    ])];
    for (const container of containers) expect(Object.isFrozen(container)).toBe(true);
  });

  it('keeps Asset IDs and dependencies unchanged when only an equivalent locator changes', () => {
    const descriptor = readAssetDescriptor({
      id: 'model/synthetic-ship', kind: 'model', role: 'player-ship', group: 'models',
      dependencies: [{ id: 'image/synthetic-hull', kind: 'image' }],
      payloadIdentity: { schemaVersion: 1, byteLength: 8, fingerprint: `sha256:${'c'.repeat(64)}` },
    });
    const before = readSourceMappingTable(table());
    const swapped = table();
    swapped.mappings[0].parts[0].alternatives = [locator('TEX', 24)];
    const after = readSourceMappingTable(swapped);
    expect(after.mappings[0].asset).toEqual(before.mappings[0].asset);
    expect(after.mappings[0].parts).not.toEqual(before.mappings[0].parts);
    expect(Object.keys(descriptor)).toEqual(['id', 'kind', 'role', 'group', 'dependencies', 'payloadIdentity']);
    expect(JSON.stringify(descriptor)).not.toMatch(/discPath|entry|subresource|SYNTH/);
  });

  const rejections: [string, (input: ReturnType<typeof table>) => void, string, string][] = [
    ['unknown field', input => Object.assign(input.mappings[0], { sourceName: 'x' }), 'invalid-record', 'sources.mappings[0]'],
    ['lower-case disc path', input => { input.mappings[0].parts[0].alternatives[0].discPath = 'main/synth.nob'; }, 'invalid-source-mapping', 'sources.mappings[0].parts[0].alternatives[0].discPath'],
    ['traversing disc path', input => { input.mappings[0].parts[0].alternatives[0].discPath = '../MAIN/SYNTH.NOB'; }, 'invalid-source-mapping', 'sources.mappings[0].parts[0].alternatives[0].discPath'],
    ['absolute disc path', input => { input.mappings[0].parts[0].alternatives[0].discPath = '/MAIN/SYNTH.NOB'; }, 'invalid-source-mapping', 'sources.mappings[0].parts[0].alternatives[0].discPath'],
    ['fractional entry ID', input => { input.mappings[0].parts[0].alternatives[0].entry.id = 1.5; }, 'invalid-source-mapping', 'sources.mappings[0].parts[0].alternatives[0].entry.id'],
    ['long entry type', input => { input.mappings[0].parts[0].alternatives[0].entry.type = 'TEXTURE'; }, 'invalid-source-mapping', 'sources.mappings[0].parts[0].alternatives[0].entry.type'],
    ['invalid sub-resource', input => { input.mappings[0].parts[0].alternatives[0].subresource = '../palette'; }, 'invalid-source-mapping', 'sources.mappings[0].parts[0].alternatives[0].subresource'],
    ['empty parts', input => { input.mappings[0].parts = []; }, 'invalid-source-mapping', 'sources.mappings[0].parts'],
    ['empty alternatives', input => { input.mappings[0].parts[0].alternatives = []; }, 'invalid-source-mapping', 'sources.mappings[0].parts[0].alternatives'],
    ['repeated alternative', input => { input.mappings[0].parts[0].alternatives[1] = locator('TEX', 20); }, 'duplicate-mapping', 'sources.mappings[0].parts[0].alternatives[1]'],
    ['unordered alternatives', input => { input.mappings[0].parts[0].alternatives.reverse(); }, 'mapping-order', 'sources.mappings[0].parts[0].alternatives[1]'],
    ['mixed-type equivalents', input => { input.mappings[3].parts = [{ alternatives: [locator('MESH', 31), locator('MODL', 30)] }]; }, 'invalid-source-mapping', 'sources.mappings[3].parts[0].alternatives[1]'],
    ['mixed sub-resource equivalents', input => { input.mappings[0].parts[0].alternatives = [locator('TEX', 20, 'palette'), locator('TEX', 24)]; }, 'invalid-source-mapping', 'sources.mappings[0].parts[0].alternatives[1]'],
    ['order error before a later malformed item', input => {
      input.mappings[0].parts[0].alternatives = [locator('TEX', 24), locator('TEX', 20), { ...locator('TEX', 26), discPath: 'bad' }];
    }, 'mapping-order', 'sources.mappings[0].parts[0].alternatives[1]'],
    ['locator repeated across parts', input => {
      input.mappings[2].parts = [
        { alternatives: [locator('SCCT', 0, 'group-0/slot-1'), locator('SCCT', 1, 'group-0/slot-1')] },
        { alternatives: [locator('SCCT', 1, 'group-0/slot-1')] },
      ];
    }, 'duplicate-mapping', 'sources.mappings[2].parts'],
    ['repeated Asset', input => { input.mappings[1] = mapping('image/synthetic-hull', 'image', [[locator('TEX', 21)]]); }, 'duplicate-mapping', 'sources.mappings[1]'],
    ['unordered Assets', input => { input.mappings.reverse(); }, 'mapping-order', 'sources.mappings[1]'],
    ['unknown confidence', input => { input.mappings[0].confidence = 'probable'; }, 'invalid-source-mapping', 'sources.mappings[0].confidence'],
    ['unlinked unconfirmed mapping', input => { input.mappings[0].confidence = 'unconfirmed'; }, 'invalid-source-mapping', 'sources.mappings[0].unknowns'],
    ['invalid U item', input => { input.mappings[4].unknowns = ['U-28']; }, 'invalid-source-mapping', 'sources.mappings[4].unknowns[0]'],
    ['missing evidence', input => { input.mappings[0].evidence = []; }, 'invalid-source-mapping', 'sources.mappings[0].evidence'],
    ['evidence outside docs/original', input => { input.mappings[0].evidence = ['local/research/p2-01/report.json']; }, 'invalid-source-mapping', 'sources.mappings[0].evidence[0]'],
    ['verified without fingerprint', input => { Object.assign(input, { sourceFingerprint: null }); }, 'invalid-source-mapping', 'sources.mappings[0].resolution'],
    ['fixture used as fingerprint', input => { Object.assign(input, { sourceFingerprint: 'synthetic-disc' }); }, 'invalid-identity', 'sources.sourceFingerprint'],
  ];

  it.each(rejections)('rejects %s', (_name, mutate, code, path) => {
    const input = table();
    mutate(input);
    expect(() => readSourceMappingTable(input)).toThrowError(expect.objectContaining({ code, path }));
  });

  it('allows declared research mappings without a source fingerprint', () => {
    const input = { ...table(), sourceFingerprint: null };
    for (const entry of input.mappings) entry.resolution = 'declared';
    expect(readSourceMappingTable(input).sourceFingerprint).toBeNull();
  });
});

describe('source mapping diagnostics', () => {
  it('reports nothing for confirmed or likely verified mappings of compatible entry types', () => {
    const result = readSourceMappingTable(table());
    expect(diagnoseSourceMappings(result, required('mission/synthetic-first', 'model/synthetic-ship', 'palette/synthetic-hull'))).toEqual([]);
  });

  it('reports missing, conflicting, unconfirmed and unverified sources with safe fields only', () => {
    const input = table();
    input.mappings[1].parts[0].alternatives = [locator('SND', 40)];
    Object.assign(input.mappings[3], { confidence: 'unconfirmed', unknowns: ['U-027'], resolution: 'declared' });
    const diagnostics = diagnoseSourceMappings(readSourceMappingTable(input),
      required('model/synthetic-ship', 'sound/synthetic-fire', 'image/synthetic-hull-variant', 'model/synthetic-ship'));
    expect(diagnostics).toEqual([
      { code: 'source-type-conflict', assetId: 'image/synthetic-hull-variant', path: 'mappings[1].parts[0].alternatives[0].entry.type', unknowns: [] },
      { code: 'source-unconfirmed', assetId: 'model/synthetic-ship', path: 'mappings[3].confidence', unknowns: ['U-027'] },
      { code: 'source-unverified', assetId: 'model/synthetic-ship', path: 'mappings[3].resolution', unknowns: ['U-027'] },
      { code: 'source-missing', assetId: 'sound/synthetic-fire', path: 'required[1]', unknowns: [] },
    ]);
    for (const diagnostic of diagnostics) {
      expect(Object.keys(diagnostic)).toEqual(['code', 'assetId', 'path', 'unknowns']);
      expect(Object.isFrozen(diagnostic) && Object.isFrozen(diagnostic.unknowns)).toBe(true);
    }
    expect(Object.isFrozen(diagnostics)).toBe(true);
  });

  it('reports entry-type conflicts even for non-required mappings, but not their research state', () => {
    const input = table();
    Object.assign(input.mappings[0], { confidence: 'unconfirmed', unknowns: ['U-028'], resolution: 'declared' });
    input.mappings[0].parts[0].alternatives = [locator('MODL', 50)];
    expect(diagnoseSourceMappings(readSourceMappingTable(input), [])).toEqual([
      { code: 'source-type-conflict', assetId: 'image/synthetic-hull', path: 'mappings[0].parts[0].alternatives[0].entry.type', unknowns: ['U-028'] },
    ]);
  });

  it('copies U items so diagnostics stay isolated from a caller-built table', () => {
    const unknowns = ['U-027'];
    const built = { sourceFingerprint: null, mappings: [{ ...readSourceMappingTable(table()).mappings[3], confidence: 'unconfirmed', unknowns }] };
    const [diagnostic] = diagnoseSourceMappings(built as SourceMappingTable, required('model/synthetic-ship'));
    unknowns.push('U-028');
    expect(diagnostic.unknowns).toEqual(['U-027']);
    expect(Object.isFrozen(diagnostic.unknowns)).toBe(true);
  });

  it('derives one locator-free state per mapped Asset, most severe first', () => {
    const input = table();
    input.mappings[1].parts[0].alternatives = [locator('SND', 40)];
    Object.assign(input.mappings[1], { confidence: 'unconfirmed', unknowns: ['U-028'] });
    Object.assign(input.mappings[3], { confidence: 'unconfirmed', unknowns: ['U-027'], resolution: 'declared' });
    input.mappings[2].resolution = 'declared';
    const states = assetSourceStates(readSourceMappingTable(input));
    expect(states.sourceFingerprint).toBe('source:synthetic-disc');
    expect(states.states).toEqual([
      { id: 'image/synthetic-hull', state: 'verified', unknowns: [] },
      { id: 'image/synthetic-hull-variant', state: 'conflict', unknowns: ['U-028'] },
      { id: 'mission/synthetic-first', state: 'unverified', unknowns: [] },
      { id: 'model/synthetic-ship', state: 'unconfirmed', unknowns: ['U-027'] },
      { id: 'palette/synthetic-hull', state: 'verified', unknowns: ['U-028'] },
    ]);
    expect(readSourceStateSet(structuredClone(states))).toEqual(states);
    expect(JSON.stringify(states)).not.toMatch(/discPath|entry|subresource|SYNTH/);
  });

  it('defines compatible archive entry types for every Asset kind', () => {
    expect(Object.keys(SOURCE_ENTRY_TYPES)).toEqual([...ASSET_KINDS]);
    for (const types of Object.values(SOURCE_ENTRY_TYPES)) {
      expect(types.length).toBeGreaterThan(0);
      expect(Object.isFrozen(types)).toBe(true);
    }
    expect(Object.isFrozen(SOURCE_ENTRY_TYPES)).toBe(true);
  });
});
