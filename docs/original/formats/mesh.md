---
type: format
status: draft
phase: P0
updated: 2026-09-30
related: [U-001, U-009]
---

# Meshes and models (MESH, MODL)

Container format: [IMFAT](./imfat.md). Confidence labels as defined there. Structure only; no original content.

## 1. MESH (partly confirmed)

- The first u32 of the block is an offset to the mesh header (Confirmed).
- The mesh header contains a vertex count followed by vertex positions (Likely).
- Vertex coordinates are **IEEE 754 32-bit floats** (x, y, z), not fixed point (Confirmed on sampled meshes). This matters for U-009: the original uses floating point at least for geometry.
- The smallest meshes have 3 vertices.
- Data after the vertices (faces, normals, UVs, texture references) is not yet decoded.

## 2. MODL (Unconfirmed)

Assumed to group several MESH entries into one model (19 MODL vs 486 MESH). Not yet examined.

## 3. Next steps

1. Decode faces, normals, UVs, and texture references in MESH.
2. Decode MODL and how it references MESH entries.
3. Export one craft model and compare it with screenshots of the original.
