import { describe, expect, it } from 'vitest';
import { parseIdList, parseMesh, parseModel, PayloadError } from './payloads.ts';
import { ByteWriter } from './synthetic.ts';

function triangleMesh(cornerCount = 3): Uint8Array {
  const body = new ByteWriter()
    .u32(3) // vertices
    .f32(0, 0, 0, 1, 0, 0, 0, 1, 0)
    .f32(0, 0, 1, 0, 0, 1) // UVs
    .u32(3) // slot count
    .f32(0, 0, 1, 0, 0, 1, 0, 0, 1) // normals
    .u32(1) // faces
    .u32(cornerCount, 0, 0, 1, 1, 2, 2)
    .u32(0); // trailer
  const bytes = body.toBytes();
  return new ByteWriter().u32(12, bytes.length, 0).raw(bytes).toBytes();
}

describe('parseMesh', () => {
  it('reads positions, UVs, normals, and triangle indices', () => {
    const mesh = parseMesh(triangleMesh());
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(mesh.uvs)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
    expect(Array.from(mesh.cornerSlots)).toEqual([0, 1, 2]);
    expect(mesh.slotCount).toBe(3);
  });

  it('rejects faces that are not triangles', () => {
    expect(() => parseMesh(triangleMesh(4))).toThrow(PayloadError);
  });
});

describe('parseModel', () => {
  function model(extraBytes = 0): Uint8Array {
    const w = new ByteWriter().u32(44, 1, 0, 0, 0, 0).u32(11, 0, 0, 0, 12);
    w.u32(3, 160, 160, 160, 0, 10001, 10003);
    for (let i = 0; i < extraBytes; i++) w.u8(0);
    return w.toBytes();
  }

  it('reads part lists and sound IDs', () => {
    const parsed = parseModel(model());
    expect(parsed.partLists[0]).toEqual([{ flags: 3, color: [160, 160, 160], meshId: 10001, textureId: 10003 }]);
    expect(parsed.partLists[1]).toEqual([]);
    expect(parsed.soundIds).toEqual([11, 0, 0, 0, 12]);
  });

  it('rejects a size that does not match the part lists', () => {
    expect(() => parseModel(model(4))).toThrow(/size/);
  });
});

describe('parseIdList', () => {
  it('reads an ID list', () => {
    expect(parseIdList(new ByteWriter().u32(8, 3, 10743, 10743, 0).toBytes())).toEqual([10743, 10743, 0]);
  });
});
