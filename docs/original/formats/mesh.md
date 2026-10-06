---
type: format
status: verified
phase: P0
updated: 2026-10-05
related: [U-001, U-009, U-027]
---

# Meshes and models (MESH, MODL)

Container format: [IMFAT](./imfat.md). Confidence labels as defined there. Structure only; no original content.

- Parser: [`src/original-data/payloads.ts`](../../../src/original-data/payloads.ts) (`parseMesh`, `parseModel`)
- Validation: `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` parses all 486 MESH and 19 MODL entries (13,166 vertices, 13,285 triangles) and checks every cross-reference.

## 1. MESH (Confirmed on all 486 entries)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 | Offset of the mesh struct; always 12 (relocated pointer) |
| 0x04 | u32 | Mesh struct length; always block size − 12 |
| 0x08 | u32 | 0 |
| 0x0C | u32 | Vertex count `nv` |
| | f32 × 3 × `nv` | Vertex positions (x, y, z) |
| | f32 × 2 × `nv` | Texture coordinates (u, v), one pair per vertex |
| | u32 | Slot count `ns` (see below) |
| | f32 × 3 × `nv` | Vertex normals; all unit length |
| | u32 | Face count `nf` |
| | Face × `nf` | `u32 corners` (always 3), then `corners` × {u32 vertex index, u32 slot index} |
| | u32 | Trailer; always 0 |

Notes:

- Every face is a triangle.
- Coordinates are **32-bit floats**. Mesh extents range from about 1.4 to 276 units, consistent with metres (fighters tens of metres, stations hundreds).
- UVs range from about −11 to 9.6, so textures tile (wrap) across faces.
- The **slot index** of a corner is always below `ns`, and the largest slot index used is exactly `ns − 1`. The slot table itself is not stored. In 288 meshes `ns` equals `nv` (all corners of a vertex share one slot); in 96 meshes `ns` equals the total corner count (every corner has its own slot, i.e. flat shading); the remaining 102 lie in between. Likely a per-corner shading table built at load time, equivalent to smoothing groups.
- Vertices are in model space: MODL applies no transform.

## 2. MODL (structure Confirmed on all 19 entries)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | {u32 ptr, u32 count} × 3 | Three part lists (relocated pointers) |
| 0x18 | u32 × 5 | SND entry IDs (0 = none). Confirmed by the playback code and listening: slot 1 gun fire, slot 2 missile launch, slot 4 destroyed. Slots 0 and 3 Unconfirmed; observations are recorded in [audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08) |
| 0x2C | Part[...] | Parts of all three lists, 28 bytes each |

Part, 28 bytes:

| Offset | Type | Meaning |
|---|---|---|
| +0 | u32 | Flags; observed 1 and 3; meaning Unconfirmed |
| +4 | u32 × 3 | Colour, 0–255 per channel; Likely the base colour for untextured parts |
| +16 | u32 | 0 |
| +20 | u32 | MESH entry ID |
| +24 | u32 | TEX entry ID, or 0 for none |

Block size is always `44 + 28 × (total parts)`. All MESH, TEX, and SND references resolve to entries of the expected type.

**Confirmed source reuse statistic:** collecting every part from all 19 MODL entries references 485 distinct MESH entries; one MESH source is referenced by more than one MODL. This is a source-format reuse relationship, not a decision that each MESH must become an independent canonical Asset. The unused/implicit geometry and the conversion ownership policy require separate analysis.

Part lists (meaning Unconfirmed, U-027):

- **List 0**: the intact model. Rendering list 0 of every MODL with its textures produces recognisable craft, stations, and structures (checked locally; renders stay in `local/`).
- **List 1**: hull fragments that look like a wrecked version of the same model; Likely used when it is destroyed. One MODL has an empty list 0 and only fragments in list 1 (Likely an asteroid or debris field).
- **List 2**: zero or one untextured, single-colour, roughly convex hull. Possibly a collision volume or a shield-hit effect.

### Bounded model/material dependency projection (Confirmed structure/counts)

`local/research/p2-01/model-material-subgraphs.ts` reconstructs model/material source closures for all 54 candidate slots and cross-checks the existing [source profiles](./scenario.md#campaign-candidate-source-profiles-confirmed-structure). Under the approved model-with-internal-geometry unit policy, each slot-1 profile contributes five model units, fifteen provisional parsed-image bindings and twenty-two distinct model-to-image edges. Its 149 MESH sources are internal model geometry, not independent Asset nodes or canonical dependency edges.

The 189 model-to-source edges are accounted for as 149 geometry references, 22 image references and 18 sound references. The separate [sound projection](./audio.md#sample-boundaries-and-candidate-model-references-confirmed-structure) resolves the latter structurally; it does not determine their gameplay roles.

### Secondary presentation model reuse (bounded)

**Confirmed (native references):** registered MODL handler `0x6662c` requests MESH and TEX fields from all three 28-byte part lists and the five SND fields before queuing model completion at `0x66864`. The discriminator-3 effect callback `0x3e590` consumes list 1 (pointer/count at model +8/+12), including each selected part's mesh and optional texture references. This establishes a model-part presentation path; it does not assign gameplay sound roles or prove every queued source is required for a given candidate.

**Confirmed (completion and ownership):** `0x66864` receives the loaded MODL payload, derives runtime colour handles from each part's own numeric colour fields across all three lists, and passes that same payload to the requested consumer. These colour parameters/handles are model-internal state, not independent Assets or an independently reused logic-data library. The effect path therefore retains the requested MODL's geometry/image/sample source family rather than creating an independent MESH Asset for each instance or part index; the existing model-with-internal-geometry projection remains unchanged.

**Unconfirmed (other context bindings):** discriminator-2 active model identity and cached geometry/texture provenance are not established by that completion binding. Production, selector-domain limits, candidate comparison and remaining source links are maintained only in [executable](./executable.md#model-completion-and-cached-handle-follow-up). Cached geometry is not labelled procedural or archive-derived without creation evidence.

**Coverage limit:** image identity merging, palettes, implicit objects and the rest of the slice remain outside this projection. The local report uses provisional research references and explicitly has `complete: false` and `rankingAvailable: false`; it is neither a production manifest nor an S-02 selection result. Reproduce with `node local/research/p2-01/model-material-subgraphs.ts`; parsing output and payload content remain ignored.

### Exact-source image-alias projection (partial)

**Confirmed (bounded reconstruction/counts):** `local/research/p2-01/exact-source-tex-subgraphs.ts` rebuilds all 54 candidate model/image subgraphs using the exact-source classes defined in [textures](./textures.md#checked-runtime-image-equivalence-and-exact-source-aliases). The union retains eighteen model handles and reduces image handles from 54 to 52: seventy nodes and eighty-eight model-to-image edges. Thirty-six candidates lose one image handle; no candidate loses an edge. Each slot-1 graph remains five model handles, fifteen provisional image handles and twenty-two edges.

Assertions independently reconstruct all three MODL part lists, compare every raw source closure/count with the prior profiles, validate public typed references, and reject dangling/duplicate nodes and edges. MESH geometry remains internal. Existing source, material and sound report hashes/versions are unchanged; replay produces byte-identical JSON.

**Coverage limit:** exact source aliases do not establish shared semantic roles/version ownership, a production SourceMapping or historical request provenance. Research IDs are provisional, not stable production semantic IDs. Palette identity, implicit/fixed presentation resources, mission/data, HUD and audio integration remain outside this partial graph. Its `complete`, `rankingAvailable` and `qualification` flags remain false; these counts cannot stand in for S-02 full-package ranking.

## 3. Comparison with the original (partial)

Compared against HI-resolution screenshots of all nine views (`local/StarRang/captures/srangers_006.png`–`014.png`, `018.png`):

- **Geometry matches.** The friendly transponder craft seen close up matches MODL 11399: same hourglass of two hexagonal frustums, and its untextured parts have the same grey as the part colour (Confirmed).
- **Texture colours match once palettes are read correctly.** Embedded texture palettes are stored in BGR order, and the game maps texture colours to the nearest colours of the global DATA palette ([textures](./textures.md) §3). Rendered this way, the player craft (tan hull, purple panels) and the transponder craft's textured centre (tan) match the screenshots (Confirmed). Earlier mismatches came from reading the palettes as RGB.
- **Craft-to-model mapping comes from M2ID** (see [hud](./hud.md) §3). Slot 0 and 1 name MODL 10743, which matches the player craft in the chase-plane view in shape (striped nose spine, wide wings with panels); slot 14 names MODL 11399, the transponder craft (Confirmed for these two). Earlier eye-matching of the player craft to another model was wrong.
- **Additional geometry comparisons (Confirmed for the pictured targets):** M2ID slot 7 names MODL 11063, whose rendered wing/body geometry matches the target in `local/StarRang/captures/srangers_020.png`; slot 17 names MODL 10611, whose paired circular sections, central surface and support framework match the base target in `srangers_067.png`. The local comparison renders are `local/research/models/MODL_11063.png` and `MODL_10611.png`. This confirms the depicted geometries and table references, not all faction/default-stat semantics or every object in a mission.

## 4. Open questions

- Meaning of part lists 1 and 2 and the part flags (U-027). Sound slots 1, 2 and 4 are confirmed; slots 0 and 3 remain Unconfirmed.
- How lighting selects shades (U-028); which craft type each M2ID slot is.
