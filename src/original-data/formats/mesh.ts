import { MODEL_LIMITS, type ModelGeometry } from '../../content/models/model-payload.ts';
import { SourceError, type SourceLimitName } from '../source-error.ts';

// MESH entry structure (docs/original/formats/mesh.md §1), little-endian:
//   0x00 u32 structure pointer, 12; 0x04 u32 structure length, the block length less 12; 0x08 u32 0
//   0x0C u32 vertex count V; V × 3 f32 positions; V f32 u values, then V f32 v values; u32 shading slot count S;
//        V × 3 f32 normals; u32 triangle count T; T faces of { u32 corner count 3; 3 × { u32 vertex index, u32 shading slot } }; u32 0
// The block is therefore exactly 28 + 32V + 28T bytes. Every failure is located at the caller's `path` exactly.

const STRUCTURE_AT = 12;
const VERTICES_AT = 16;
const FACE_BYTES = 28;

export interface MeshCounts {
  readonly vertices: number;
  readonly triangles: number;
}

/** The block length of a MESH with these counts. */
const meshBlockLength = ({ vertices, triangles }: MeshCounts): number => 28 + vertices * 32 + triangles * FACE_BYTES;

function invalid(path: string, reason: string): never {
  throw new SourceError('invalid-payload', path, reason);
}

function counted(value: number, name: SourceLimitName, limit: number, path: string): number {
  if (value < 1 || value > limit) throw new SourceError('limit-exceeded', path, 'the count is outside the supported range', { name, limit, observed: value });
  return value;
}

const viewOf = (block: Uint8Array): DataView => new DataView(block.buffer, block.byteOffset, block.byteLength);

/**
 * Checks the header, then reads only the vertex and triangle counts, each checked against its limit before anything
 * is sized from it, and requires the exact block length. A converter charges these counts before `readMesh` allocates.
 */
export function readMeshCounts(block: Uint8Array, path: string): MeshCounts {
  const view = viewOf(block);
  if (block.byteLength < VERTICES_AT) invalid(path, 'the mesh header is truncated');
  if (view.getUint32(0, true) !== STRUCTURE_AT) invalid(path, 'the mesh structure pointer must be 12');
  if (view.getUint32(4, true) !== block.byteLength - STRUCTURE_AT) invalid(path, 'the mesh structure length must be the block length less 12');
  if (view.getUint32(8, true) !== 0) invalid(path, 'the reserved header field must be 0');
  const vertices = counted(view.getUint32(STRUCTURE_AT, true), 'meshVertices', MODEL_LIMITS.meshVertices, path);
  const trianglesAt = 20 + vertices * 32;
  if (block.byteLength < trianglesAt + 4) invalid(path, 'the mesh is truncated');
  const triangles = counted(view.getUint32(trianglesAt, true), 'meshTriangles', MODEL_LIMITS.meshTriangles, path);
  const length = meshBlockLength({ vertices, triangles });
  if (block.byteLength < length) invalid(path, 'the mesh is truncated');
  if (block.byteLength > length) invalid(path, 'the mesh has trailing bytes');
  return { vertices, triangles };
}

/**
 * Reads a MESH block into a frozen geometry whose arrays are new buffers the caller owns. Floats are kept bit for bit
 * (including -0 and subnormals) and must be finite; the stored u and v arrays become one (u, v) pair per vertex. Faces
 * must be triangles whose vertex indices and shading slots are in range, with 1 to 3T shading slots; triangle order and
 * winding are as stored.
 */
export function readMesh(block: Uint8Array, path: string): ModelGeometry {
  const { vertices, triangles } = readMeshCounts(block, path);
  const view = viewOf(block);
  const slotsAt = VERTICES_AT + vertices * 20;
  const shadingSlotCount = view.getUint32(slotsAt, true);
  if (shadingSlotCount < 1 || shadingSlotCount > triangles * 3) invalid(path, 'the shading slot count must be 1 to the corner count');
  const float = (offset: number): number => {
    const value = view.getFloat32(offset, true);
    if (!Number.isFinite(value)) invalid(path, 'a vertex value is not a finite number');
    return value;
  };
  const floats = (offset: number, count: number): Float32Array => {
    const values = new Float32Array(count);
    for (let index = 0; index < count; index++) values[index] = float(offset + index * 4);
    return values;
  };
  const positions = floats(VERTICES_AT, vertices * 3);
  const uvsAt = VERTICES_AT + vertices * 12;
  const uvs = new Float32Array(vertices * 2);
  for (let vertex = 0; vertex < vertices; vertex++) {
    uvs[vertex * 2] = float(uvsAt + vertex * 4);
    uvs[vertex * 2 + 1] = float(uvsAt + (vertices + vertex) * 4);
  }
  const normals = floats(slotsAt + 4, vertices * 3);
  const indices = new Uint16Array(triangles * 3);
  const cornerShading = new Uint16Array(triangles * 3);
  for (let triangle = 0, at = slotsAt + 8 + vertices * 12; triangle < triangles; triangle++, at += FACE_BYTES) {
    if (view.getUint32(at, true) !== 3) invalid(path, 'every face must have 3 corners');
    for (let corner = 0; corner < 3; corner++) {
      const vertex = view.getUint32(at + 4 + corner * 8, true);
      const slot = view.getUint32(at + 8 + corner * 8, true);
      if (vertex >= vertices) invalid(path, 'a corner vertex index is out of range');
      if (slot >= shadingSlotCount) invalid(path, 'a corner shading slot is out of range');
      indices[triangle * 3 + corner] = vertex;
      cornerShading[triangle * 3 + corner] = slot;
    }
  }
  if (view.getUint32(block.byteLength - 4, true) !== 0) invalid(path, 'the mesh trailer must be 0');
  return Object.freeze({ positions, uvs, normals, indices, cornerShading, shadingSlotCount });
}
