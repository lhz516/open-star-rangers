import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, type BudgetDimension, type BudgetRecord } from '../../content/budget.ts';
import { MODEL_PAYLOAD_SCHEMA_VERSION, encodeModelPayload, readModelPayload } from '../../content/models/model-payload.ts';
import { SOUND_A, SOUND_B, TEXTURE_A, TEXTURE_B, pairGeometry, quadGeometry, syntheticModel } from '../../content/models/models.test-support.ts';
import { payloadTransferList } from '../../content/ownership.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import { syntheticMesh, syntheticModl, type SyntheticModlFields } from '../synthetic.test-support.ts';
import { expectSourceError, meshBlockFor } from './conversion.test-support.ts';
import { MODEL_CONVERTER_COMPONENT, convertModels, type ModelReferences, type ModelSources } from './convert-models.ts';

// Entry IDs of the synthetic sources; they appear only here, never in diagnostics.
const MESH = { quad: 20_001, pair: 20_002, bad: 20_003 } as const;
const TEX = { a: 20_101, b: 20_102 } as const;
const SND = { a: 20_201, b: 20_202 } as const;

const SHIP = readAssetId('model/synthetic-ship');
const WRECK = readAssetId('model/synthetic-wreck');

// The ship's parts and slots mirror the content test model, so its payload must equal that model's encoding.
const SHIP_MODL: SyntheticModlFields = {
  partLists: [
    [
      { mesh: MESH.quad, texture: TEX.b, flags: 1, colour: [255, 255, 255] },
      { mesh: MESH.quad, flags: 0x8000_0003, colour: [0, 0, 0] },
      { mesh: MESH.pair, texture: TEX.a, flags: 2, colour: [12, 34, 56] },
    ],
    [{ mesh: MESH.pair, texture: TEX.a, flags: 0xffff_ffff, colour: [255, 0, 128] }],
    [],
  ],
  sounds: [SND.b, 0, SND.a, 0, SND.b],
};
// A second model whose only part, in list 1, reuses the ship's quad mesh.
const WRECK_MODL: SyntheticModlFields = { partLists: [[], [{ mesh: MESH.quad, flags: 3, colour: [9, 9, 9] }], []] };

const DECLARATIONS = [
  { asset: { id: WRECK, kind: 'model' }, role: 'debris', group: 'models' },
  { asset: { id: SHIP, kind: 'model' }, role: 'player-ship', group: 'models' },
];
const REFERENCES: ModelReferences = Object.freeze({
  textures: new Map([[TEX.a, TEXTURE_A], [TEX.b, TEXTURE_B]]),
  sounds: new Map([[SND.a, SOUND_A], [SND.b, SOUND_B]]),
});
const LIMITS: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 16, dependencyEdges: 96, vertices: 8_192, triangles: 8_192, payloadBytes: 1_048_576 };

function sources(models: Partial<Record<'ship' | 'wreck', Uint8Array>> = {}, meshes: Partial<Record<keyof typeof MESH, Uint8Array>> = {}): ModelSources {
  const blocks = { quad: meshBlockFor(quadGeometry()), pair: meshBlockFor(pairGeometry()), ...meshes };
  return {
    models: new Map([[SHIP, models.ship ?? syntheticModl(SHIP_MODL).data], [WRECK, models.wreck ?? syntheticModl(WRECK_MODL).data]]),
    meshes: new Map(Object.entries(blocks).map(([name, block]) => [MESH[name as keyof typeof MESH], block])),
  };
}

const convert = (overrides: { sources?: ModelSources; references?: ModelReferences; limits?: BudgetRecord; usage?: BudgetRecord } = {}) =>
  convertModels(DECLARATIONS, overrides.sources ?? sources(), overrides.references ?? REFERENCES, overrides.limits ?? LIMITS, overrides.usage);

const shipBytes = (): Uint8Array => encodeModelPayload(syntheticModel());
const wreckBytes = (): Uint8Array => encodeModelPayload({
  geometries: [quadGeometry()], partLists: [[], [{ sourceFlags: 3, colour: [9, 9, 9], geometry: 0, texture: null }], []],
  soundSlots: [null, null, null, null, null],
});

/** The ship and wreck charged together. */
const totals = (): BudgetRecord => ({
  ...EMPTY_BUDGET_USAGE, assets: 2, dependencyEdges: 4, vertices: 4 + 3 + 4, triangles: 1 + 2 + 1, payloadBytes: shipBytes().length + wreckBytes().length,
});

describe('model conversion', () => {
  it('converts each model into its canonical payload and descriptor, in Asset ID order', () => {
    const { assets, usage } = convert();
    expect(assets.map(({ descriptor }) => descriptor.id)).toEqual([SHIP, WRECK]);
    const [ship, wreck] = assets;
    expect(ship.payload.bytes).toEqual(shipBytes());
    expect(wreck.payload.bytes).toEqual(wreckBytes());
    expect(ship.descriptor).toEqual({
      id: SHIP, kind: 'model', role: 'player-ship', group: 'models',
      dependencies: [{ id: TEXTURE_A, kind: 'image' }, { id: TEXTURE_B, kind: 'image' }, { id: SOUND_A, kind: 'sound' }, { id: SOUND_B, kind: 'sound' }],
      payloadIdentity: { schemaVersion: MODEL_PAYLOAD_SCHEMA_VERSION, byteLength: ship.payload.bytes.length, fingerprint: sha256Fingerprint(ship.payload.bytes) },
    });
    expect(wreck.descriptor).toEqual(expect.objectContaining({ role: 'debris', dependencies: [] }));
    expect(ship.payload).toEqual({ id: SHIP, schemaVersion: MODEL_PAYLOAD_SCHEMA_VERSION, bytes: ship.payload.bytes });
    expect(payloadTransferList(assets.map(({ payload }) => payload.bytes))).toHaveLength(2);
    for (const value of [assets, ship, ship.descriptor, ship.payload]) expect(Object.isFrozen(value)).toBe(true);
    expect(usage).toEqual(totals());
  });

  it('stores a mesh used twice in one model once, and gives each model its own copy of a shared mesh', () => {
    const [ship, wreck] = convert().assets.map(({ payload }) => readModelPayload(payload.bytes, 1));
    expect(ship.geometries).toHaveLength(2);
    expect(ship.partLists[0].map(part => part.geometry)).toEqual([0, 0, 1]);
    expect(wreck.geometries).toHaveLength(1);
    expect(wreck.geometries[0]).toEqual(ship.geometries[0]);
  });

  it('gives the same payload bytes and SHA-256 for the same input', () => {
    const [first, second] = [convert(), convert()];
    expect(second.assets.map(({ payload }) => payload.bytes)).toEqual(first.assets.map(({ payload }) => payload.bytes));
    expect(second.assets.map(({ descriptor }) => descriptor.payloadIdentity.fingerprint)).toEqual(first.assets.map(({ descriptor }) => descriptor.payloadIdentity.fingerprint));
  });

  it('charges on top of the starting usage and converts an empty set to nothing', () => {
    const start = { ...EMPTY_BUDGET_USAGE, assets: 3, payloadBytes: 100 };
    expect(convert({ usage: start, limits: { ...LIMITS, assets: 5, payloadBytes: totals().payloadBytes + 100 } }).usage)
      .toEqual({ ...totals(), assets: 5, payloadBytes: totals().payloadBytes + 100 });
    expect(convertModels([], { models: new Map(), meshes: new Map() }, REFERENCES, LIMITS, start)).toEqual({ assets: [], usage: start });
    expect(MODEL_CONVERTER_COMPONENT).toBe('models-4');
  });

  it('passes when the totals equal the limits exactly', () => {
    expect(convert({ limits: totals() }).usage).toEqual(totals());
  });

  it.each<[BudgetDimension, string]>([
    ['assets', WRECK],
    ['dependencyEdges', SHIP],
    ['vertices', WRECK],
    ['triangles', WRECK],
    ['payloadBytes', WRECK],
  ])('rejects %s one over the limit at the model that crosses it, with no result', (dimension, model) => {
    const limit = totals()[dimension] - 1;
    const usage = { ...EMPTY_BUDGET_USAGE };
    expectSourceError(() => convert({ limits: { ...totals(), [dimension]: limit }, usage }), 'budget-exceeded', `models[${model}].model`,
      { name: dimension, limit, observed: totals()[dimension] });
    expect(usage).toEqual(EMPTY_BUDGET_USAGE);
  });

  it('reports a total beyond the safe integer range with a null observed value', () => {
    const limits = { ...LIMITS, vertices: Number.MAX_SAFE_INTEGER };
    expectSourceError(() => convert({ limits, usage: { ...EMPTY_BUDGET_USAGE, vertices: Number.MAX_SAFE_INTEGER } }), 'budget-exceeded', `models[${SHIP}].model`,
      { name: 'vertices', limit: Number.MAX_SAFE_INTEGER, observed: null });
  });

  it('charges a mesh by its counts before decoding it', () => {
    const bad = syntheticMesh({ positions: [Number.NaN, 0, 0, 1, 0, 0, 0, 1, 0], uvs: new Array(6).fill(0), normals: new Array(9).fill(0), shadingSlotCount: 1, faces: [[[0, 0], [1, 0], [2, 0]]] }).data;
    const wreck = syntheticModl({ partLists: [[], [{ mesh: MESH.bad }], []] }).data;
    const input = sources({ wreck }, { bad });
    expectSourceError(() => convert({ sources: input, limits: { ...LIMITS, vertices: 9 } }), 'budget-exceeded', `models[${WRECK}].model`,
      { name: 'vertices', limit: 9, observed: 10 });
    expectSourceError(() => convert({ sources: input }), 'invalid-payload', `models[${WRECK}].parts[1][0].mesh`);
  });

  it('rejects a mesh declaring 0xFFFFFFFF vertices by its count, before sizing anything', () => {
    const huge = meshBlockFor(quadGeometry());
    new DataView(huge.buffer).setUint32(12, 0xffff_ffff, true);
    expectSourceError(() => convert({ sources: sources({}, { quad: huge }) }), 'limit-exceeded', `models[${SHIP}].parts[0][0].mesh`,
      { name: 'meshVertices', limit: 4_096, observed: 0xffff_ffff });
  });

  it.each<[string, () => ReturnType<typeof convert>, string, string]>([
    ['a MODL that breaks its format', () => convert({ sources: sources({ ship: Uint8Array.of(...syntheticModl(SHIP_MODL).data, 0, 0, 0, 0) }) }),
      'invalid-payload', `models[${SHIP}].model`],
    ['a MESH that breaks its format', () => convert({ sources: sources({}, { pair: Uint8Array.of(...meshBlockFor(pairGeometry()).subarray(0, -4), 1, 0, 0, 0) }) }),
      'invalid-payload', `models[${SHIP}].parts[0][2].mesh`],
    ['a texture missing from the texture table', () => convert({ references: { ...REFERENCES, textures: new Map([[TEX.a, TEXTURE_A]]) } }),
      'invalid-declaration', `models[${SHIP}].parts[0][0].texture`],
    ['a sound missing from the sound table', () => convert({ references: { ...REFERENCES, sounds: new Map([[SND.b, SOUND_B]]) } }),
      'invalid-declaration', `models[${SHIP}].sounds[2]`],
    ['a mesh the step did not supply', () => convert({ sources: { ...sources(), meshes: new Map([[MESH.quad, meshBlockFor(quadGeometry())]]) } }),
      'invalid-declaration', `models[${SHIP}].parts[0][2].mesh`],
    ['a declared model without a source', () => convert({ sources: { ...sources(), models: new Map([[SHIP, syntheticModl(SHIP_MODL).data]]) } }),
      'invalid-declaration', 'models.declarations[0]'],
    ['a declaration in another group', () => convertModels([{ ...DECLARATIONS[1], group: 'logic' }], sources(), REFERENCES, LIMITS),
      'invalid-declaration', 'models.declarations[0].group'],
  ])('rejects %s', (_, action, code, location) => expectSourceError(action, code, location));

  it('rejects a starting usage that counts source reads', () => {
    expect(() => convert({ usage: { ...EMPTY_BUDGET_USAGE, sourceReadBytes: 1 } })).toThrow(expect.objectContaining({ code: 'invalid-budget-value', path: 'usage.sourceReadBytes' }));
  });
});
