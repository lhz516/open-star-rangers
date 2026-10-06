import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { validateGroup } from '../../content/completeness.ts';
import { applyManifestIdentity } from '../../content/manifest-identity.ts';
import { pairGeometry, quadGeometry } from '../../content/models/models.test-support.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { DiscReadError } from '../disc/disc-error.ts';
import { SourceError } from '../source-error.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { buildImfat, syntheticMesh, syntheticModl, type SyntheticEntry, type SyntheticModlFields } from '../synthetic.ts';
import {
  countedVerifiedSource, dataPaletteBlock, expectSourceError, graphicsMapping, imageDeclaration, meshBlockFor, textureBlock,
} from './conversion.test-support.ts';
import { productionIdentityBasis } from './converter-version.ts';
import { runGraphicsStep } from './graphics-step.ts';
import { modelsGroupDraft, runModelStep } from './model-step.ts';

// A synthetic SR.NOB with one flight palette, one texture, three meshes and the six required model roles; never original data.
const ENTRY = Object.freeze({
  data: 10_001, texture: 10_003, quad: 10_101, pair: 10_102, tri: 10_103,
  player: 10_201, enemy: 10_202, base: 10_203, projectile: 10_204, missile: 10_205, debris: 10_206,
  soundA: 10_301, soundB: 10_302,
});

type ModelName = 'player' | 'enemy' | 'base' | 'projectile' | 'missile' | 'debris';
const ROLES: Readonly<Record<ModelName, string>> = { player: 'player-ship', enemy: 'enemy-ship', base: 'base', projectile: 'projectile', missile: 'missile', debris: 'debris' };
const id = (name: ModelName) => readAssetId(`model/synthetic-${name}`);

const MODLS: Readonly<Record<ModelName, SyntheticModlFields>> = {
  player: {
    partLists: [[{ mesh: ENTRY.quad, texture: ENTRY.texture }, { mesh: ENTRY.quad }, { mesh: ENTRY.pair, texture: ENTRY.texture }], [{ mesh: ENTRY.pair }], []],
    sounds: [ENTRY.soundA, 0, ENTRY.soundB, 0, 0],
  },
  enemy: { partLists: [[{ mesh: ENTRY.pair, texture: ENTRY.texture }], [], []], sounds: [ENTRY.soundA, 0, 0, 0, 0] },
  base: { partLists: [[{ mesh: ENTRY.quad }], [], []] },
  projectile: { partLists: [[{ mesh: ENTRY.tri }], [], []] },
  missile: { partLists: [[{ mesh: ENTRY.tri }], [], []] },
  debris: { partLists: [[], [{ mesh: ENTRY.quad }], []] },
};
const NAMES = Object.keys(MODLS) as ModelName[];

const TRIANGLE = syntheticMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: new Array(6).fill(0), normals: new Array(9).fill(0), shadingSlotCount: 1, faces: [[[0, 0], [1, 0], [2, 0]]] }).data;

function archive(replace: Partial<Record<keyof typeof ENTRY, Uint8Array | null>> = {}): Record<string, Uint8Array> {
  const blocks: Record<string, [string, Uint8Array]> = {
    data: ['DATA', dataPaletteBlock()], texture: ['TEX', textureBlock()],
    quad: ['MESH', meshBlockFor(quadGeometry())], pair: ['MESH', meshBlockFor(pairGeometry())], tri: ['MESH', TRIANGLE],
    ...Object.fromEntries(NAMES.map(name => [name, ['MODL', syntheticModl(MODLS[name]).data]])),
  };
  const entries: SyntheticEntry[] = Object.entries(blocks).flatMap(([name, [type, data]]) => {
    const block = replace[name as keyof typeof ENTRY];
    return block === null ? [] : [{ id: ENTRY[name as keyof typeof ENTRY], type, data: block ?? data }];
  });
  return { 'MAIN/SR.NOB': buildImfat(10_000, entries.sort((left, right) => left.id - right.id)) };
}

const modelMapping = (name: ModelName, entry: number = ENTRY[name], type = 'MODL', subresource: string | null = null) =>
  graphicsMapping(id(name), type, entry, subresource);
const MODEL_MAPPINGS = { sourceFingerprint: null, mappings: [...NAMES].sort((left, right) => compareText(id(left), id(right))).map(name => modelMapping(name)) };
/** The model mappings with `name`'s mapping replaced. */
const replaceMapping = (name: ModelName, mapping: Record<string, unknown>) =>
  ({ ...MODEL_MAPPINGS, mappings: MODEL_MAPPINGS.mappings.map(other => ((other.asset as { id: string }).id === id(name) ? mapping : other)) });
const MODEL_DECLARATIONS = NAMES.map(name => ({ asset: { id: id(name), kind: 'model' }, role: ROLES[name], group: 'models' }));
const REFERENCES = {
  textures: new Map([[ENTRY.texture, readAssetId('image/synthetic-texture')]]),
  sounds: new Map([[ENTRY.soundA, readAssetId('sound/synthetic-a')], [ENTRY.soundB, readAssetId('sound/synthetic-b')]]),
};

const GRAPHICS_DECLARATIONS = [
  { asset: { id: 'palette/flight/models', kind: 'palette' }, role: 'flight-palette', group: 'models' },
  { asset: { id: 'palette/synthetic-texture', kind: 'palette' }, role: 'texture-palette', group: 'models' },
  imageDeclaration('image/synthetic-texture', 'palette/synthetic-texture', { role: 'model-texture', group: 'models', display: { nearest: 'palette/flight/models' } }),
];
const graphicsMappings = (imageOverrides: Record<string, unknown> = {}) => ({
  sourceFingerprint: null,
  mappings: [
    { ...graphicsMapping('image/synthetic-texture', 'TEX', ENTRY.texture), ...imageOverrides },
    graphicsMapping('palette/flight/models', 'DATA', ENTRY.data),
    graphicsMapping('palette/synthetic-texture', 'TEX', ENTRY.texture, 'palette'),
  ],
});

const LIMITS: BudgetRecord = {
  ...EMPTY_BUDGET_USAGE, assets: 64, dependencyEdges: 64, vertices: 1_024, triangles: 1_024, paletteEntries: 512, imagePixels: 1_024, payloadBytes: 65_536,
};

const step = (source: VerifiedSource, mappings: unknown = MODEL_MAPPINGS, declarations: unknown = MODEL_DECLARATIONS) =>
  runModelStep(source, mappings, declarations, REFERENCES, LIMITS);

/** The source with every MESH read replaced by `read`. */
function withMeshReads(source: VerifiedSource, read: () => Promise<never>): VerifiedSource {
  return {
    ...source,
    openArchive: async path => {
      const handle = await source.openArchive(path);
      return {
        path: handle.path, entries: handle.entries, entry: (entryId, type) => handle.entry(entryId, type),
        read: (entryId, type) => (type === 'MESH' ? read() : handle.read(entryId, type)),
      };
    },
  };
}

/** The source with every MESH read failing at the disc layer, as a bad sector would. */
const failingMeshReads = (source: VerifiedSource): VerifiedSource =>
  withMeshReads(source, () => Promise.reject(new DiscReadError('read-failed', 'file:/MAIN/SR.NOB', 'the image could not be read')));

describe('model step', () => {
  it('converts every declared model from shared reads: each MODL and each MESH is read once', async () => {
    const { source, reads } = await countedVerifiedSource(archive());
    const { groups, usage } = await step(source);
    expect(groups.map(({ group, descriptors }) => [group, descriptors.map(({ id: asset }) => asset)])).toEqual([['models', NAMES.map(id).sort()]]);
    expect(groups[0].sources.map(({ id: asset, state }) => `${asset}:${state}`)).toEqual(NAMES.map(id).sort().map(asset => `${asset}:verified`));
    // The quad mesh is named by four parts across three models, the pair by three across two and the triangle by two
    // models, yet each is read once.
    const references = (entry: number) => NAMES.flatMap(name => MODLS[name].partLists.flat()).filter(({ mesh }) => mesh === entry).length;
    expect([references(ENTRY.quad), references(ENTRY.pair), references(ENTRY.tri)]).toEqual([4, 3, 2]);
    expect(Object.fromEntries(reads)).toEqual(Object.fromEntries([ENTRY.quad, ENTRY.pair, ENTRY.tri, ...NAMES.map(name => ENTRY[name])].map(entry => [entry, 1])));
    expect(usage).toMatchObject({ assets: 6, dependencyEdges: 3 + 2 + 0, sourceReadBytes: 0 });
    // Locator-free: no archive path, entry ID, type tag or source structure in the result.
    expect(JSON.stringify(groups.map(({ descriptors, sources }) => ({ descriptors, sources })))).not.toMatch(/SR\.NOB|MAIN|\b10[0-9]{3}\b|MODL|MESH|discPath|entry/);
  });

  it('merges with the graphics models partition into a complete group whose external requirements are the sounds', async () => {
    const { source } = await countedVerifiedSource(archive());
    const graphics = await runGraphicsStep(source, graphicsMappings(), GRAPHICS_DECLARATIONS, LIMITS);
    const models = await step(source);
    const draft = modelsGroupDraft(graphics, models, source.identity.fingerprint);
    expect(draft.assets.map(({ id: asset }) => asset)).toEqual(['image/synthetic-texture', ...NAMES.map(id).sort(), 'palette/flight/models', 'palette/synthetic-texture']);
    expect(draft.payloads.map(({ id: asset }) => asset)).toEqual(draft.assets.map(({ id: asset }) => asset));
    expect(draft.sources?.states.map(({ id: asset }) => asset)).toEqual(draft.assets.map(({ id: asset }) => asset));
    const [group] = applyManifestIdentity(productionIdentityBasis(source.identity.fingerprint), [draft]);
    expect(validateGroup(CLASSIC_P2_SLICE, group)).toMatchObject({
      status: 'group-complete', group: 'models',
      externalRequirements: [{ id: 'sound/synthetic-a', kind: 'sound' }, { id: 'sound/synthetic-b', kind: 'sound' }],
    });
  });

  it('is incomplete with source-not-ready while a texture the models need is unconfirmed', async () => {
    const { source } = await countedVerifiedSource(archive());
    const graphics = await runGraphicsStep(source, graphicsMappings({ confidence: 'unconfirmed', unknowns: ['U-028'] }), GRAPHICS_DECLARATIONS, LIMITS);
    const [group] = applyManifestIdentity(productionIdentityBasis(source.identity.fingerprint), [modelsGroupDraft(graphics, await step(source), source.identity.fingerprint)]);
    expect(validateGroup(CLASSIC_P2_SLICE, group)).toMatchObject({
      status: 'incomplete',
      diagnostics: [expect.objectContaining({ code: 'source-not-ready', assetId: 'image/synthetic-texture', unknowns: ['U-028'] })],
    });
  });

  it('rejects merging partitions that repeat an Asset ID', async () => {
    const { source } = await countedVerifiedSource(archive());
    const models = await step(source);
    expect(() => modelsGroupDraft(models, models, source.identity.fingerprint)).toThrow(expect.objectContaining({ code: 'duplicate-asset' }));
    expect(modelsGroupDraft({ groups: [], usage: EMPTY_BUDGET_USAGE }, { groups: [], usage: EMPTY_BUDGET_USAGE }, source.identity.fingerprint))
      .toEqual({ group: 'models', assets: [], payloads: [], sources: { sourceFingerprint: source.identity.fingerprint, states: [] } });
  });

  it('keeps the P2-03 location when mapping verification fails', async () => {
    const { source } = await countedVerifiedSource(archive({ base: null }));
    await expect(step(source)).rejects.toMatchObject({ name: 'SourceError', code: 'entry-not-found', location: 'sources.mappings[0].parts[0].alternatives[0]' });
  });

  it.each<[string, Partial<Record<keyof typeof ENTRY, Uint8Array | null>>, string]>([
    ['a missing mesh', { tri: null }, 'entry-not-found'],
    ['a mesh entry of another type', { missile: syntheticModl({ partLists: [[{ mesh: ENTRY.texture }], [], []] }).data }, 'entry-type-mismatch'],
  ])('locates %s at its first referencing part, keeping the P2-03 code', async (_, replace, code) => {
    const { source } = await countedVerifiedSource(archive(replace));
    // Models are read in Asset ID order, so the missile is the first to name the mesh.
    await expect(step(source)).rejects.toMatchObject({ name: 'SourceError', code, location: `models[${id('missile')}].parts[0][0].mesh` });
  });

  it('keeps the code, reason and limit of a mesh read failure, only relocating it', async () => {
    const { source } = await countedVerifiedSource(archive());
    const limit = { name: 'entryBytes' as const, limit: 64, observed: 65 };
    const tooLarge = withMeshReads(source, () => Promise.reject(new SourceError('limit-exceeded', 'archive:/MAIN/SR.NOB#10101', 'the entry is too large', limit)));
    await expect(step(tooLarge)).rejects.toMatchObject({
      name: 'SourceError', code: 'limit-exceeded', location: `models[${id('base')}].parts[0][0].mesh`, reason: 'the entry is too large', limit,
    });
  });

  it('rejects a mesh over the structural vertex limit at its first referencing part', async () => {
    const huge = meshBlockFor(pairGeometry());
    new DataView(huge.buffer).setUint32(12, 4_097, true);
    const { source } = await countedVerifiedSource(archive({ pair: huge }));
    await expect(step(source)).rejects.toMatchObject({
      name: 'SourceError', code: 'limit-exceeded', location: `models[${id('enemy')}].parts[0][0].mesh`, limit: { name: 'meshVertices', limit: 4_096, observed: 4_097 },
    });
  });

  it('passes a disc-layer failure through unchanged', async () => {
    const { source } = await countedVerifiedSource(archive());
    await expect(step(failingMeshReads(source))).rejects.toMatchObject({ name: 'DiscReadError', code: 'read-failed', location: 'file:/MAIN/SR.NOB' });
  });

  it('fails the whole step without results when one model breaks its format', async () => {
    const { source } = await countedVerifiedSource(archive({ quad: Uint8Array.of(...meshBlockFor(quadGeometry()), 0, 0, 0, 0) }));
    await expect(step(source)).rejects.toMatchObject({ name: 'SourceError', code: 'invalid-payload', location: `models[${id('base')}].parts[0][0].mesh` });
  });

  it('fails the whole step when a model exceeds the budget, keeping the source reads charged', async () => {
    const { source } = await countedVerifiedSource(archive());
    const before = source.usage().sourceReadBytes;
    await expect(runModelStep(source, MODEL_MAPPINGS, MODEL_DECLARATIONS, REFERENCES, { ...LIMITS, assets: 5 })).rejects.toMatchObject({
      name: 'SourceError', code: 'budget-exceeded', location: `models[${id('projectile')}].model`, limit: { name: 'assets', limit: 5, observed: 6 },
    });
    expect(source.usage().sourceReadBytes).toBeGreaterThan(before);
  });

  it.each<[string, () => [unknown, unknown], string]>([
    ['a declaration without a mapping', () => [{ ...MODEL_MAPPINGS, mappings: MODEL_MAPPINGS.mappings.slice(1) }, MODEL_DECLARATIONS], 'models.declarations[2]'],
    ['a mapping without a declaration', () => [MODEL_MAPPINGS, MODEL_DECLARATIONS.slice(1)], 'models.declarations'],
    ['a mapping to a MODL subresource', () => [
      replaceMapping('player', modelMapping('player', ENTRY.player, 'MODL', 'parts')),
      MODEL_DECLARATIONS,
    ], `models[${id('player')}].model`],
    ['a mapping to another entry type', () => [
      replaceMapping('enemy', modelMapping('enemy', ENTRY.quad, 'MESH')),
      MODEL_DECLARATIONS,
    ], `models[${id('enemy')}].model`],
  ])('rejects %s as an invalid declaration before reading', async (_, inputs, location) => {
    const { source, reads } = await countedVerifiedSource(archive());
    const [mappings, declarations] = inputs();
    let thrown: unknown;
    await step(source, mappings, declarations).catch(error => { thrown = error; });
    expectSourceError(() => { throw thrown; }, 'invalid-declaration', location);
    expect(reads.size).toBe(0);
  });
});
