import { describe, expect, it } from 'vitest';
import { MODEL_LIMITS } from '../../content/models/model-payload.ts';
import { set32 } from '../../content/graphics/graphics.test-support.ts';
import { floatBits } from '../../content/models/models.test-support.ts';
import { expectSourceError } from '../conversion/conversion.test-support.ts';
import type { SourceLimit } from '../source-error.ts';
import { syntheticMesh, type SyntheticMeshFields } from '../synthetic.test-support.ts';
import { readMesh, readMeshCounts } from './mesh.ts';

const PATH = 'models[model/synthetic-ship].parts[0][1].mesh';

// Three vertices and one triangle whose floats include -0, both subnormal extremes and the largest finite value.
const TRIANGLE: SyntheticMeshFields = {
  positions: new Float32Array(new Uint32Array([0x8000_0000, 0x0000_0001, 0x007f_ffff, 0x3f80_0000, 0, 0, 0, 0x7f7f_ffff, 0xbf80_0000]).buffer),
  uvs: [0, 0, 1.5, -11, 0, 9.5],
  normals: [0, 0, 1, 0, 0, -1, 0, 1, 0],
  shadingSlotCount: 2,
  faces: [[[0, 1], [2, 0], [1, 1]]],
};

// Four vertices, the last unused, and two triangles with one shading slot per corner.
const QUAD: SyntheticMeshFields = {
  positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 5, 5, 5],
  uvs: [0, 0, 1, 0, 1, 1, 0.25, 0.75],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0],
  shadingSlotCount: 6,
  faces: [[[0, 0], [1, 1], [2, 2]], [[2, 3], [1, 4], [0, 5]]],
};

const block = (fields: Partial<SyntheticMeshFields> = {}): Uint8Array => syntheticMesh({ ...TRIANGLE, ...fields }).data;

/** Block offsets of the one-triangle mesh: counts, then the first float of each array, its face and its trailer. */
const AT = { vertices: 12, positions: 16, uvs: 52, slots: 76, normals: 80, triangles: 116, face: 120, trailer: 148 } as const;

const expectFailure = (action: () => unknown, code: string, reason: string, limit: SourceLimit | null = null): void =>
  expectSourceError(action, code, PATH, limit, reason);

describe('MESH source reading', () => {
  it('reads every float bit for bit, indices and corner shading slots into new buffers', () => {
    const data = block();
    expect(data.length).toBe(AT.trailer + 4);
    const mesh = readMesh(data, PATH);
    expect(floatBits(mesh.positions)).toEqual(floatBits(TRIANGLE.positions as Float32Array));
    expect(Object.is(mesh.positions[0], -0)).toBe(true);
    expect([...mesh.uvs]).toEqual(TRIANGLE.uvs);
    expect([...mesh.normals]).toEqual(TRIANGLE.normals);
    expect([...mesh.indices]).toEqual([0, 2, 1]);
    expect([...mesh.cornerShading]).toEqual([1, 0, 1]);
    expect(mesh.shadingSlotCount).toBe(2);
    expect(Object.isFrozen(mesh)).toBe(true);
    const buffers = [mesh.positions, mesh.uvs, mesh.normals, mesh.indices, mesh.cornerShading].map(array => array.buffer);
    expect(new Set([...buffers, data.buffer]).size).toBe(6);
  });

  it('keeps unused vertices and the stored triangle order and winding', () => {
    const mesh = readMesh(syntheticMesh(QUAD).data, PATH);
    expect([...mesh.positions]).toEqual(QUAD.positions);
    expect([...mesh.uvs]).toEqual(QUAD.uvs);
    expect([...mesh.indices]).toEqual([0, 1, 2, 2, 1, 0]);
    expect([...mesh.cornerShading]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(readMeshCounts(syntheticMesh(QUAD).data, PATH)).toEqual({ vertices: 4, triangles: 2 });
  });

  it('reads 4,096 vertices and 4,096 triangles', () => {
    const vertices = MODEL_LIMITS.meshVertices;
    const faces = Array.from({ length: MODEL_LIMITS.meshTriangles }, (_, face) =>
      [[face, 0], [(face + 1) % vertices, 1], [(face + 2) % vertices, 2]] as const);
    const mesh = readMesh(syntheticMesh({
      positions: new Float32Array(vertices * 3), uvs: new Float32Array(vertices * 2), normals: new Float32Array(vertices * 3), shadingSlotCount: 3, faces,
    }).data, PATH);
    expect([mesh.positions.length, mesh.indices.length]).toEqual([vertices * 3, MODEL_LIMITS.meshTriangles * 3]);
  });

  it.each<[string, () => Uint8Array, string]>([
    ['a truncated header', () => block().subarray(0, 15), 'the mesh header is truncated'],
    ['structure pointer 16', () => block({ structurePointer: 16 }), 'the mesh structure pointer must be 12'],
    ['a structure length that is not the block length less 12', () => block({ structureLength: 139 }), 'the mesh structure length must be the block length less 12'],
    ['a non-zero reserved header field', () => block({ reserved: 1 }), 'the reserved header field must be 0'],
    ['a block cut inside the vertices', () => set32(block().slice(0, 100), 4, 88), 'the mesh is truncated'],
    ['a block missing its last face', () => syntheticMesh({ ...QUAD, structureLength: syntheticMesh(QUAD).data.length - 40 }).data.subarray(0, -28),
      'the mesh is truncated'],
    ['a trailing word', () => { const data = Uint8Array.of(...block(), 0, 0, 0, 0); return set32(data, 4, data.length - 12); }, 'the mesh has trailing bytes'],
    ['no shading slots', () => block({ shadingSlotCount: 0 }), 'the shading slot count must be 1 to the corner count'],
    ['more shading slots than corners', () => block({ shadingSlotCount: 4 }), 'the shading slot count must be 1 to the corner count'],
    ['a NaN position', () => block({ positions: [0, 0, 0, Number.NaN, 0, 0, 0, 1, 0] }), 'a vertex value is not a finite number'],
    ['a NaN u', () => block({ uvs: [0, 0, Number.NaN, 0, 0, 1] }), 'a vertex value is not a finite number'],
    ['an infinite v', () => block({ uvs: [0, 0, 1, Infinity, 0, 1] }), 'a vertex value is not a finite number'],
    ['a negative infinite normal', () => block({ normals: [0, 0, 1, 0, 0, 1, 0, 0, -Infinity] }), 'a vertex value is not a finite number'],
    ['a face with 4 corners', () => set32(block(), AT.face, 4), 'every face must have 3 corners'],
    ['a vertex index equal to the vertex count', () => block({ faces: [[[0, 0], [3, 0], [1, 1]]] }), 'a corner vertex index is out of range'],
    ['a shading slot equal to the slot count', () => block({ faces: [[[0, 0], [2, 2], [1, 1]]] }), 'a corner shading slot is out of range'],
    ['a non-zero trailer', () => block({ trailer: 1 }), 'the mesh trailer must be 0'],
  ])('rejects %s as an invalid payload', (_, data, reason) => expectFailure(() => readMesh(data(), PATH), 'invalid-payload', reason));

  it.each<[string, number, number, 'meshVertices' | 'meshTriangles']>([
    ['no vertices', AT.vertices, 0, 'meshVertices'],
    ['4,097 vertices', AT.vertices, 4_097, 'meshVertices'],
    ['0xFFFFFFFF vertices', AT.vertices, 0xffff_ffff, 'meshVertices'],
    ['no triangles', AT.triangles, 0, 'meshTriangles'],
    ['4,097 triangles', AT.triangles, 4_097, 'meshTriangles'],
  ])('rejects %s by the count alone, before sizing anything from it', (_, offset, observed, name) => {
    const limit = { name, limit: 4_096, observed };
    expectFailure(() => readMeshCounts(set32(block(), offset, observed), PATH), 'limit-exceeded', 'the count is outside the supported range', limit);
    expectFailure(() => readMesh(set32(block(), offset, observed), PATH), 'limit-exceeded', 'the count is outside the supported range', limit);
  });

  it('pairs the stored u array and v array per vertex', () => {
    // Distinct values written straight into the block: interleaved reading would yield them in stored order instead.
    const data = block();
    const view = new DataView(data.buffer);
    [1, 2, 3, 4, 5, 6].forEach((value, index) => view.setFloat32(AT.uvs + index * 4, value, true));
    expect([...readMesh(data, PATH).uvs]).toEqual([1, 4, 2, 5, 3, 6]);
  });

  it('places the fields at the documented offsets', () => {
    const view = new DataView(block().buffer);
    expect([AT.vertices, AT.slots, AT.triangles, AT.face].map(offset => view.getUint32(offset, true))).toEqual([3, 2, 1, 3]);
    expect([view.getFloat32(AT.positions + 12, true), view.getFloat32(AT.normals + 20, true)]).toEqual([1, -1]);
    expect(Array.from({ length: 6 }, (_, index) => view.getFloat32(AT.uvs + index * 4, true))).toEqual([0, 1.5, 0, 0, -11, 9.5]);
  });
});
