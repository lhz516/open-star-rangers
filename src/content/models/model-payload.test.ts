import { describe, expect, it } from 'vitest';
import type { AssetDescriptor } from '../asset-contract.ts';
import { readAssetId } from '../asset-id.ts';
import { asciiBytes } from '../graphics/graphics-format.ts';
import { expectContractError, set16, set32, set8 } from '../graphics/graphics.test-support.ts';
import { payloadTransferList } from '../ownership.ts';
import { sha256Fingerprint } from '../sha256.ts';
import {
  MODEL_LIMITS, MODEL_PAYLOAD_LAYOUT, checkModelBinding, encodeModelPayload, modelPayloadLength, modelReferences, readModelPayload,
  type ModelGeometry, type ModelPart, type ModelPayload,
} from './model-payload.ts';
import { SOUND_A, SOUND_B, TEXTURE_A, TEXTURE_B, expectSameGeometry, pairGeometry, quadGeometry, syntheticModel } from './models.test-support.ts';

type ModelInput = Omit<ModelPayload, 'kind'>;

const REFERENCES = [TEXTURE_A, TEXTURE_B, SOUND_A, SOUND_B];
const REFERENCES_AT = MODEL_PAYLOAD_LAYOUT.headerBytes;
const PARTS_AT = REFERENCES_AT + REFERENCES.reduce((sum, id) => sum + 1 + id.length, 0);
const partAt = (part: number): number => PARTS_AT + part * MODEL_PAYLOAD_LAYOUT.partBytes;
// Geometry 0 (four vertices, one triangle): header, then positions, UVs, normals, indices and corner shading slots.
const GEOMETRY_AT = partAt(4);
const POSITIONS_AT = GEOMETRY_AT + 6;
const UVS_AT = POSITIONS_AT + 48;
const NORMALS_AT = UVS_AT + 32;
const INDICES_AT = NORMALS_AT + 48;
const SHADING_AT = INDICES_AT + 6;

const encoded = (): Uint8Array<ArrayBuffer> => encodeModelPayload(syntheticModel());

/** The synthetic model with one part of list 0 replaced by `overrides`. */
function withPart(part: number, overrides: Record<string, unknown>): ModelInput {
  const model = syntheticModel();
  const list0 = model.partLists[0].map((item, index) => (index === part ? { ...item, ...overrides } : item));
  return { ...model, partLists: [list0, model.partLists[1], model.partLists[2]] } as ModelInput;
}

/** The synthetic model with geometry 0 replaced by `overrides`. */
function withGeometry(overrides: Record<string, unknown>): ModelInput {
  const model = syntheticModel();
  return { ...model, geometries: [{ ...model.geometries[0], ...overrides }, model.geometries[1]] } as ModelInput;
}

describe('model payload schema 1', () => {
  it('lays out the header, the ascending reference table and each part', () => {
    const bytes = encoded();
    expect([...bytes.subarray(0, REFERENCES_AT)]).toEqual([3, 5, 4, 0, 2, 0, 3, 0, 1, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 4, 0]);
    expect([...bytes.subarray(REFERENCES_AT, PARTS_AT)]).toEqual(REFERENCES.flatMap(id => [id.length, ...asciiBytes(id)]));
    expect([...bytes.subarray(partAt(0), partAt(2))]).toEqual([1, 0, 0, 0, 255, 255, 255, 0, 0, 2, 0, 3, 0, 0, 0x80, 0, 0, 0, 0, 0, 0, 0]);
    expect([...bytes.subarray(GEOMETRY_AT, POSITIONS_AT)]).toEqual([4, 0, 1, 0, 2, 0]);
    expect(bytes.length).toBe(GEOMETRY_AT + 6 + 4 * 32 + 12 + 6 + 3 * 32 + 2 * 12);
  });

  it('round-trips every field, keeping floats bit for bit, into frozen data with exclusive arrays', () => {
    const input = syntheticModel();
    const bytes = encodeModelPayload(input);
    const model = readModelPayload(bytes, 1);
    expect(model).toEqual({ kind: 'model', ...input });
    model.geometries.forEach((geometry, index) => expectSameGeometry(geometry, input.geometries[index]));
    expect(Object.is(model.geometries[0].positions[0], -0)).toBe(true);
    expect(model.geometries[0].positions[1]).toBe(2 ** -149);
    for (const value of [model, model.geometries, model.geometries[0], model.partLists, ...model.partLists, model.partLists[0][0],
      model.partLists[0][0].colour, model.soundSlots]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    model.geometries[0].positions[2] = 7;
    model.geometries[0].indices[0] = 3;
    input.geometries[1].normals[0] = 7;
    expectSameGeometry(readModelPayload(bytes, 1).geometries[0], quadGeometry());
    expectSameGeometry(readModelPayload(bytes, 1).geometries[1], pairGeometry());
    const arrays = model.geometries.flatMap(geometry => [geometry.positions, geometry.uvs, geometry.normals, geometry.indices, geometry.cornerShading]);
    expect(new Set(arrays.map(array => array.buffer)).size).toBe(arrays.length);
    expect(arrays.every(array => array.buffer !== bytes.buffer)).toBe(true);
  });

  it('encodes the same model to the same bytes, of the length its shape gives, in a buffer it owns', () => {
    const [first, second] = [encoded(), encoded()];
    expect(second).toEqual(first);
    expect(sha256Fingerprint(second)).toBe(sha256Fingerprint(first));
    expect(payloadTransferList([first])).toEqual([first.buffer]);
    const shape = { geometries: [{ vertices: 4, triangles: 1 }, { vertices: 3, triangles: 2 }], parts: 4, references: REFERENCES };
    expect(modelPayloadLength(shape)).toBe(first.length);
  });

  it('round-trips the structural limits: 4,096 vertices and triangles, and 256 parts', () => {
    const vertices = MODEL_LIMITS.meshVertices;
    const triangles = MODEL_LIMITS.meshTriangles;
    const large: ModelGeometry = {
      positions: new Float32Array(vertices * 3).fill(0.5), uvs: new Float32Array(vertices * 2), normals: new Float32Array(vertices * 3),
      indices: Uint16Array.from({ length: triangles * 3 }, (_, index) => (index * 7) % vertices),
      cornerShading: Uint16Array.from({ length: triangles * 3 }, (_, index) => index), shadingSlotCount: triangles * 3,
    };
    const parts: ModelPart[] = Array.from({ length: MODEL_LIMITS.modelParts }, (_, index) => ({ sourceFlags: index, colour: [0, 0, 0], geometry: 0, texture: null }));
    const input: ModelInput = { geometries: [large], partLists: [[], parts.slice(0, 200), parts.slice(200)], soundSlots: [null, null, null, null, null] };
    const model = readModelPayload(encodeModelPayload(input), 1);
    expect(model.partLists.map(list => list.length)).toEqual([0, 200, 56]);
    expectSameGeometry(model.geometries[0], large);
  });

  it('lists the distinct textures and sounds in ascending order with their kinds', () => {
    expect(modelReferences(syntheticModel())).toEqual([
      { id: TEXTURE_A, kind: 'image' }, { id: TEXTURE_B, kind: 'image' }, { id: SOUND_A, kind: 'sound' }, { id: SOUND_B, kind: 'sound' },
    ]);
  });

  it('rejects a 65,535-vertex geometry by its count field, before sizing anything from it', () => {
    const header = set16(encoded().slice(0, POSITIONS_AT), GEOMETRY_AT, 0xffff);
    expectContractError(() => readModelPayload(header, 1), 'invalid-model-payload', 'payload.geometries[0].vertexCount');
  });

  it.each<[string, (bytes: Uint8Array) => unknown, string, string]>([
    ['schema 2', bytes => readModelPayload(bytes, 2), 'unsupported-payload-schema', 'payload.schemaVersion'],
    ['a truncated header', bytes => readModelPayload(bytes.subarray(0, REFERENCES_AT - 1), 1), 'invalid-model-payload', 'payload'],
    ['a truncated geometry', bytes => readModelPayload(bytes.subarray(0, -1), 1), 'invalid-model-payload', 'payload'],
    ['a trailing byte', bytes => readModelPayload(Uint8Array.of(...bytes, 0), 1), 'invalid-model-payload', 'payload'],
    ['two part lists', bytes => readModelPayload(set8(bytes, 0, 2), 1), 'invalid-model-payload', 'payload.partLists'],
    ['six sound slots', bytes => readModelPayload(set8(bytes, 1, 6), 1), 'invalid-model-payload', 'payload.soundSlots'],
    ['262 references', bytes => readModelPayload(set16(bytes, 2, 262), 1), 'invalid-model-payload', 'payload.references'],
    ['no geometry', bytes => readModelPayload(set16(bytes, 4, 0), 1), 'invalid-model-payload', 'payload.geometries'],
    ['more geometries than parts', bytes => readModelPayload(set16(bytes, 4, 5), 1), 'invalid-model-payload', 'payload.geometries'],
    ['no parts', bytes => readModelPayload(set16(set16(bytes, 6, 0), 8, 0), 1), 'invalid-model-payload', 'payload.partLists'],
    ['257 parts', bytes => readModelPayload(set16(bytes, 6, 256), 1), 'invalid-model-payload', 'payload.partLists'],
    ['an empty reference', bytes => readModelPayload(set8(bytes, REFERENCES_AT, 0), 1), 'invalid-model-payload', 'payload.references[0]'],
    ['a malformed reference', bytes => readModelPayload(set8(bytes, REFERENCES_AT + 1, 0x49), 1), 'invalid-model-payload', 'payload.references[0]'],
    ['descending references', bytes => readModelPayload(set8(set8(bytes, REFERENCES_AT + 25, 0x62), REFERENCES_AT + 51, 0x61), 1),
      'invalid-model-payload', 'payload.references'],
    ['an unused reference', bytes => readModelPayload(set16(bytes, 16, 0), 1), 'invalid-model-payload', 'payload.references'],
    ['a sound slot beyond the references', bytes => readModelPayload(set16(bytes, 12, 5), 1), 'invalid-model-payload', 'payload.soundSlots[0]'],
    ['an image in a sound slot', bytes => readModelPayload(set16(bytes, 12, 1), 1), 'invalid-model-payload', 'payload.soundSlots[0]'],
    ['a texture beyond the references', bytes => readModelPayload(set16(bytes, partAt(0) + 9, 5), 1), 'invalid-model-payload', 'payload.partLists[0][0].texture'],
    ['a sound as a texture', bytes => readModelPayload(set16(bytes, partAt(0) + 9, 3), 1), 'invalid-model-payload', 'payload.partLists[0][0].texture'],
    ['a geometry index beyond the geometries', bytes => readModelPayload(set16(bytes, partAt(0) + 7, 2), 1), 'invalid-model-payload', 'payload.partLists[0][0].geometry'],
    ['geometries out of first-use order', bytes => readModelPayload(set16(bytes, partAt(0) + 7, 1), 1), 'invalid-model-payload', 'payload.partLists[0][0].geometry'],
    ['an unused geometry', bytes => readModelPayload(set16(set16(bytes, partAt(2) + 7, 0), partAt(3) + 7, 0), 1), 'invalid-model-payload', 'payload.geometries'],
    ['vertex count 0', bytes => readModelPayload(set16(bytes, GEOMETRY_AT, 0), 1), 'invalid-model-payload', 'payload.geometries[0].vertexCount'],
    ['vertex count 4,097', bytes => readModelPayload(set16(bytes, GEOMETRY_AT, 4097), 1), 'invalid-model-payload', 'payload.geometries[0].vertexCount'],
    ['triangle count 0', bytes => readModelPayload(set16(bytes, GEOMETRY_AT + 2, 0), 1), 'invalid-model-payload', 'payload.geometries[0].triangleCount'],
    ['triangle count 4,097', bytes => readModelPayload(set16(bytes, GEOMETRY_AT + 2, 4097), 1), 'invalid-model-payload', 'payload.geometries[0].triangleCount'],
    ['shading slot count 0', bytes => readModelPayload(set16(bytes, GEOMETRY_AT + 4, 0), 1), 'invalid-model-payload', 'payload.geometries[0].shadingSlotCount'],
    ['more shading slots than corners', bytes => readModelPayload(set16(bytes, GEOMETRY_AT + 4, 4), 1), 'invalid-model-payload', 'payload.geometries[0].shadingSlotCount'],
    ['a triangle index equal to the vertex count', bytes => readModelPayload(set16(bytes, INDICES_AT + 2, 4), 1), 'invalid-model-payload', 'payload.geometries[0].indices'],
    ['a corner slot equal to the slot count', bytes => readModelPayload(set16(bytes, SHADING_AT + 4, 2), 1), 'invalid-model-payload', 'payload.geometries[0].cornerShading'],
    ['a NaN position', bytes => readModelPayload(set32(bytes, POSITIONS_AT + 44, 0x7fc0_0000), 1), 'invalid-model-payload', 'payload.geometries[0].positions'],
    ['an infinite UV', bytes => readModelPayload(set32(bytes, UVS_AT, 0x7f80_0000), 1), 'invalid-model-payload', 'payload.geometries[0].uvs'],
    ['a negative infinite normal', bytes => readModelPayload(set32(bytes, NORMALS_AT + 4, 0xff80_0000), 1), 'invalid-model-payload', 'payload.geometries[0].normals'],
  ])('reader rejects %s', (_, read, code, path) => expectContractError(() => read(encoded()), code, path));

  it('reader rejects non-byte and transferred input', () => {
    expectContractError(() => readModelPayload([...encoded()], 1), 'invalid-model-payload', 'payload');
    const bytes = encoded();
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
    expectContractError(() => readModelPayload(bytes, 1), 'payload-detached', 'payload');
  });

  it.each<[string, ModelInput, string]>([
    ['colour channel 256', withPart(0, { colour: [255, 256, 0] }), 'model.partLists[0][0].colour[1]'],
    ['a negative colour channel', withPart(0, { colour: [-1, 0, 0] }), 'model.partLists[0][0].colour[0]'],
    ['a fractional colour channel', withPart(0, { colour: [0, 0, 0.5] }), 'model.partLists[0][0].colour[2]'],
    ['two colour channels', withPart(0, { colour: [0, 0] }), 'model.partLists[0][0].colour'],
    ['a flag word of 2^32', withPart(1, { sourceFlags: 2 ** 32 }), 'model.partLists[0][1].sourceFlags'],
    ['a geometry index beyond the geometries', withPart(1, { geometry: 2 }), 'model.partLists[0][1].geometry'],
    ['geometries out of first-use order', withPart(0, { geometry: 1 }), 'model.partLists[0][0].geometry'],
    ['a palette texture', withPart(0, { texture: 'palette/synthetic-texture' }), 'model.partLists[0][0].texture'],
    ['a malformed texture ID', withPart(0, { texture: 'image/Texture' }), 'model.partLists[0][0].texture'],
    ['a non-record part', { ...syntheticModel(), geometries: [quadGeometry()], partLists: [[null], [], []] } as unknown as ModelInput, 'model.partLists[0][0]'],
    ['an image in a sound slot', { ...syntheticModel(), soundSlots: [TEXTURE_A, null, null, null, null] }, 'model.soundSlots[0]'],
    // eslint-disable-next-line no-sparse-arrays
    ['a sparse colour', withPart(0, { colour: [0, , 0] }), 'model.partLists[0][0].colour'],
    // eslint-disable-next-line no-sparse-arrays
    ['sparse sound slots', { ...syntheticModel(), soundSlots: [null, , null, null, null] } as unknown as ModelInput, 'model.soundSlots'],
    ['a sparse part list', { ...syntheticModel(), partLists: [syntheticModel().partLists[0], Array(1), []] } as unknown as ModelInput, 'model.partLists[1]'],
    ['four sound slots', { ...syntheticModel(), soundSlots: [null, null, null, null] } as unknown as ModelInput, 'model.soundSlots'],
    ['two part lists', { ...syntheticModel(), partLists: [[], []] } as unknown as ModelInput, 'model.partLists'],
    ['no parts', { ...syntheticModel(), partLists: [[], [], []] }, 'model.partLists'],
    ['257 parts', { ...syntheticModel(), partLists: [Array(257).fill(syntheticModel().partLists[0][1]), [], []] }, 'model.partLists'],
    ['no geometry', { ...syntheticModel(), geometries: [] }, 'model.geometries'],
    ['more geometries than parts', { ...syntheticModel(), partLists: [[syntheticModel().partLists[0][1]], [], []] }, 'model.geometries'],
    ['an unused geometry', { ...syntheticModel(), geometries: [quadGeometry(), pairGeometry(), pairGeometry()] }, 'model.geometries'],
    ['Float64Array positions', withGeometry({ positions: new Float64Array(12) }), 'model.geometries[0].positions'],
    ['no vertices', withGeometry({ positions: new Float32Array(0) }), 'model.geometries[0].positions'],
    ['4,097 vertices', withGeometry({ positions: new Float32Array(4097 * 3) }), 'model.geometries[0].positions'],
    ['a partial vertex', withGeometry({ positions: new Float32Array(13) }), 'model.geometries[0].positions'],
    ['short UVs', withGeometry({ uvs: new Float32Array(7) }), 'model.geometries[0].uvs'],
    ['short normals', withGeometry({ normals: new Float32Array(11) }), 'model.geometries[0].normals'],
    ['a NaN normal', withGeometry({ normals: new Float32Array(12).fill(Number.NaN) }), 'model.geometries[0].normals'],
    ['Uint32Array indices', withGeometry({ indices: Uint32Array.of(0, 2, 1) }), 'model.geometries[0].indices'],
    ['a partial triangle', withGeometry({ indices: Uint16Array.of(0, 2, 1, 0) }), 'model.geometries[0].indices'],
    ['4,097 triangles', withGeometry({ indices: new Uint16Array(4097 * 3) }), 'model.geometries[0].indices'],
    ['a triangle index equal to the vertex count', withGeometry({ indices: Uint16Array.of(0, 4, 1) }), 'model.geometries[0].indices'],
    ['shading slot count 0', withGeometry({ shadingSlotCount: 0 }), 'model.geometries[0].shadingSlotCount'],
    ['more shading slots than corners', withGeometry({ shadingSlotCount: 4 }), 'model.geometries[0].shadingSlotCount'],
    ['short corner shading', withGeometry({ cornerShading: Uint16Array.of(0, 0) }), 'model.geometries[0].cornerShading'],
    ['a corner slot equal to the slot count', withGeometry({ cornerShading: Uint16Array.of(0, 2, 0) }), 'model.geometries[0].cornerShading'],
  ])('encoder rejects %s', (_, input, path) => expectContractError(() => encodeModelPayload(input), 'invalid-model-payload', path));

  it('encoder rejects transferred geometry arrays', () => {
    const positions = new Float32Array(12);
    structuredClone(positions.buffer, { transfer: [positions.buffer] });
    expectContractError(() => encodeModelPayload(withGeometry({ positions })), 'payload-detached', 'model.geometries[0].positions');
  });
});

describe('model payload binding', () => {
  /** A typed descriptor built without the reader, so tests can state inconsistent dependencies directly. */
  function descriptor(kind: 'model' | 'image', dependencies: readonly [string, string][]): AssetDescriptor {
    return {
      id: readAssetId(`${kind}/synthetic`), kind, role: 'synthetic', group: 'models',
      dependencies: dependencies.map(([dependencyKind, id]) => ({ kind: dependencyKind as 'image', id: readAssetId(id) })),
      payloadIdentity: { schemaVersion: 1, byteLength: 0, fingerprint: `sha256:${'0'.repeat(64)}` } as AssetDescriptor['payloadIdentity'],
    };
  }

  const model = (): ModelPayload => readModelPayload(encoded(), 1);
  const exact: [string, string][] = [['image', TEXTURE_A], ['image', TEXTURE_B], ['sound', SOUND_A], ['sound', SOUND_B]];

  it('accepts a model descriptor whose dependencies are exactly the referenced textures and sounds', () => {
    expect(() => checkModelBinding(descriptor('model', exact), model())).not.toThrow();
  });

  it.each<[string, AssetDescriptor, string]>([
    ['a non-model descriptor', descriptor('image', exact), 'asset.kind'],
    ['a missing sound', descriptor('model', exact.slice(0, 3)), 'asset.dependencies'],
    ['an extra texture', descriptor('model', [...exact.slice(0, 2), ['image', 'image/synthetic-texture-c'], ...exact.slice(2)]), 'asset.dependencies'],
    ['a dependency of the wrong kind', descriptor('model', [['image', TEXTURE_A], ['image', TEXTURE_B], ['image', SOUND_A], ['sound', SOUND_B]]), 'asset.dependencies'],
    ['a palette dependency', descriptor('model', [...exact, ['palette', 'palette/synthetic']]), 'asset.dependencies'],
  ])('rejects %s', (_, asset, path) => expectContractError(() => checkModelBinding(asset, model()), 'binding-mismatch', path));
});
