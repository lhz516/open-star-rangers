---
type: format
status: verified
phase: P0
updated: 2026-10-08
related: [U-001, U-009, U-027, U-028]
---

# Meshes and models (MESH, MODL)

Container format: [IMFAT](./imfat.md). Confidence labels as defined there. Structure only; no original content.

- Readers: [`src/original-data/formats/mesh.ts`](../../../src/original-data/formats/mesh.ts) (`readMeshCounts`, `readMesh`) and [`src/original-data/formats/modl.ts`](../../../src/original-data/formats/modl.ts) (`readModel`), shared by the import and nob-check
- Validation: `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` parses all 486 MESH and 19 MODL entries (13,166 vertices, 13,285 triangles), checks every cross-reference and prints the [observed maxima](#observed-maxima-against-the-readers-limits-confirmed).

## 1. MESH (Confirmed on all 486 entries)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 | Offset of the mesh struct; always 12 (relocated pointer) |
| 0x04 | u32 | Mesh struct length; always block size − 12 |
| 0x08 | u32 | 0 |
| 0x0C | u32 | Vertex count `nv` |
| | f32 × 3 × `nv` | Vertex positions (x, y, z) |
| | f32 × `nv`, f32 × `nv` | Texture coordinates: two consecutive arrays, `nv` u values then `nv` v values, not one (u, v) pair per vertex. Order Confirmed by the native loader; axes Likely ([below](#texture-coordinate-block-order-confirmed)) |
| | u32 | Slot count `ns` (see below) |
| | f32 × 3 × `nv` | Vertex normals; all unit length |
| | u32 | Face count `nf` |
| | Face × `nf` | `u32 corners` (always 3), then `corners` × {u32 vertex index, u32 slot index} |
| | u32 | Trailer; always 0 |

Notes:

- Every face is a triangle.
- Coordinates are **32-bit floats**. Mesh extents range from about 1.4 to 276 units, consistent with metres (fighters tens of metres, stations hundreds).
- UVs range from about −11 to 9.6, so textures tile (wrap) across faces. Whether the original repeats or mirror-repeats them is Unconfirmed (P2-12/22).
- The **slot index** of a corner is always below `ns`, and the largest slot index used is exactly `ns − 1`. The slot table itself is not stored. In 288 meshes `ns` equals `nv` (all corners of a vertex share one slot); in 96 meshes `ns` equals the total corner count (every corner has its own slot, i.e. flat shading); the remaining 102 lie in between. Likely a per-corner shading table built at load time, equivalent to smoothing groups.
- Vertices are in model space: MODL applies no transform.

<a id="texture-coordinate-block-order-likely-p2-12"></a>

### Texture-coordinate block order (Confirmed)

The block holds two consecutive arrays of `nv` values each (*planar*), not one (u, v) pair per vertex (*interleaved*, the earlier reading). The native loader confirms the order; [P2-12 subtask 22](../../plan/p2/12/subtasks/22-presentation-verdicts.md#完成证据) (2026-10-08) first found it by comparing the two readings, with scripts and logs in the ignored `local/research/p2-12/presentation/` (only counts, angles and ratios are recorded).

- **Native load path (Confirmed, code; [P2-06 subtask 21](../../plan/p2/06/subtasks/21-mesh-uv-planar.md#完成证据), 2026-10-08):** the MESH row of the per-type callback table at `0x1766b4` (row `0x1766d4`) names the load callback `0x663ac`, which queues the completion `0x663f4`; the completion builds the mesh with `0x6a7b4`. That function receives the struct at entry offset 0x0C and locates the fields in the order of the table above: the coordinate block right after the positions, the slot count after 2 × `nv` floats of it, then the normals, the face count and the faces. It passes positions, normals and faces to `0x80c14`, then calls `0x8159c` once per vertex i with (i, block[i], block[`nv` + i]), from two pointers that start at the block and `nv` floats into it and advance together. `0x8159c` stores the two values at +0x10 and +0x14 of that vertex's 48-byte record; it has no other caller. The Ghidra output is in the ignored `local/research/p2-06/mesh-uv/`.
- **Texture-space distortion (Confirmed counts, P2-12/22):** for each triangle, the ratio σ1/σ2 of the singular values of its texture-to-model mapping (1 means no shear or stretch).

  | Scope | Meshes | Planar better | Interleaved better | Tie | All coordinates equal | Median σ1/σ2, interleaved / planar |
  |---|---:|---:|---:|---:|---:|---|
  | All MESH entries | 486 | 453 | 5 | 1 | 27 | 28.35 / 1.43 (12,149 triangles) |
  | Textured parts of the slice's six models (five craft models and MODL 10383) | 137 parts | 133 | 0 | 0 | 4 (the list-2 parts) | 13.66 / 1.20 (3,474 triangles) |

  Of the 133 slice parts, 128 are better by the median ratio and the other 5 are fully degenerate under the interleaved reading. The base model (MODL 10611) has 42 single-quad parts textured with the slice textures `image/model-texture/02` (28) and `/04` (14). Under the interleaved reading the angle between the u and v gradients of these 84 triangles ranges from 25° to 149°, and each quad's 4 vertices have only 3 distinct coordinates; under the planar reading the two gradients are orthogonal in all 84 and the two triangles of each quad agree.
- **Screenshot comparison (Likely, P2-12/22):** offline renders of the production geometry and textures with the planar reading match the base in `srangers_067.png`, the player craft in `srangers_008.png` and the first enemy type in `srangers_020.png`. The interleaved reading instead reproduces the sheared short stripes that the viewer shows, which none of these captures has.
- **Axes (Likely):** the first array is u (along texture columns) and the second is v. The loader passes the first array as the setter's first coordinate (+0x10) and the second as its second (+0x14); which of the two fields the rasterizer applies along texture columns was not traced, because the fields are copied into the render vertices (`0x7db10`) and consumed through driver-dispatched code. Swapping the arrays contradicts `srangers_067.png`. Under the project's convention that v = 0 is the texture's first stored row ([source structure](../../engineering/source-structure.md#资源查看渲染)), flipping v also contradicts it; a mirror in u cannot be distinguished, because the compared stripes are uniform along u.
- **Reader status:** since [P2-06 subtask 21](../../plan/p2/06/subtasks/21-mesh-uv-planar.md) the import's `readMesh` reads the two arrays and outputs one (u, v) pair per vertex, the first array as u; the model converter component is `models-3` (introduced with converter version `osr-import.graphics-2.logic-1.audio-1.models-3`). Imports with earlier converter versions, including the first P2-12 candidate (`97b70de`, `…models-2`), read one pair per vertex, so their texture coordinates are wrong on every textured part whose coordinates vary: 133 of the slice's 137. The 4 list-2 parts, whose coordinates are all equal, read the same either way. The new converter version keeps such caches from being restored; a re-import produces the corrected values.
- **Recheck of the corrected import ([P2-12 subtask 29](../../plan/p2/12/subtasks/29-mesh-uv-recheck.md#完成证据), 2026-10-08):** on the new P2-12 candidate (commit `02fd66f`, converter version `osr-import.graphics-3.logic-1.audio-1.models-3`) the six slice model payloads changed and no other existing payload did.
  - **Independent bytes (Confirmed):** a copy of the P2-12/18 local check that regroups the two arrays into one pair per vertex finds that each of the five craft models equals exactly the MODL entry its M2ID slot names, coordinate bytes included. With the interleaved reading none of the six craft-type bindings finds a matching MODL. The script and its outputs are in the ignored `local/research/p2-12/recheck/`.
  - **Viewer (Likely):** in the production viewer the base, both enemy types and the player craft now match their captures, and the base's difference of about 90° is gone ([§3](#p2-12-viewer-comparison-v-1)).

### Winding and vertex normals (Confirmed counts; meaning Unconfirmed)

Local statistics with the import's readers (`local/research/p2-06/structure-records.ts`, 2026-10-06; counts only). For each triangle, the cross product (b − a) × (c − a) of its corners in stored order is compared with the sum of its three stored vertex normals. The triangle agrees when the dot product is positive and opposes when it is negative. A dot product below 10⁻⁹ in magnitude is near zero and indeterminate, and does not decide a mesh's category.

| Scope | Meshes | No triangle opposes | Mixed | No triangle agrees | Triangles agreeing / opposing / near zero |
|---|---:|---:|---:|---:|---|
| The slice's five craft models | 149 | 98 | 51 | 0 | 1,934 / 1,453 / 73 |
| All MESH entries | 486 | 336 | 150 | 0 | 8,244 / 4,666 / 375 |

No mesh has only near-zero triangles, and every stored normal has unit length within 10⁻³. These are records only. They establish neither a front-face winding nor how the original lights faces (U-028). The payload keeps winding and normals as stored; the consumer boundary is in [source structure](../../engineering/source-structure.md#模型-payload). In the P2-12 viewer comparison ([§3](#p2-12-viewer-comparison-v-1)), the double-sided renders showed no face that the original hides; the front-face winding remains Unconfirmed.

## 2. MODL (structure Confirmed on all 19 entries)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | {u32 ptr, u32 count} × 3 | Three part lists (relocated pointers) |
| 0x18 | u32 × 5 | SND entry IDs (0 = none). Confirmed by the playback code and listening: slot 1 gun fire, slot 2 missile launch, slot 4 destroyed. Slots 0 and 3 Unconfirmed; observations are recorded in [audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08) |
| 0x2C | Part[...] | Parts of all three lists, 28 bytes each |

Part, 28 bytes:

| Offset | Type | Meaning |
|---|---|---|
| +0 | u32 | Flags; observed 1, 2 and 3 (see [part structure by list](#part-structure-by-list-confirmed-counts)); meaning Unconfirmed (U-027) |
| +4 | u32 × 3 | Colour, 0–255 per channel; Likely the base colour for untextured parts |
| +16 | u32 | 0 |
| +20 | u32 | MESH entry ID |
| +24 | u32 | TEX entry ID, or 0 for none |

Block size is always `44 + 28 × (total parts)`. All MESH, TEX, and SND references resolve to entries of the expected type.

**Confirmed on all 19 entries (local structure probe, 2026-10-05; counts only):** the three lists are stored contiguously in list order right after the header, so a non-empty list points at 0x2C plus 28 × the parts of the lists before it; every empty list (6 in total) has a null pointer and count 0. The part field at +16 is 0 in every part, and the MESH header field at 0x08 is 0 in all 486 MESH entries. The readers reject any other layout.

**Confirmed source reuse statistic:** collecting every part from all 19 MODL entries references 485 distinct MESH entries; one MESH source is referenced by more than one MODL. This is a source-format reuse relationship, not a decision that each MESH must become an independent canonical Asset. The unused/implicit geometry and the conversion ownership policy require separate analysis.

Part lists (meaning Unconfirmed, U-027):

- **List 0**: the intact model. Rendering list 0 of every MODL with its textures produces recognisable craft, stations, and structures (checked locally; renders stay in `local/`).
- **List 1**: hull fragments that look like a wrecked version of the same model. When a craft is destroyed, its fragment effects draw parts of its own model's list 1 (Confirmed by code, see [executable](./executable.md#effect-presentation-sources)). One MODL, 10383, has an empty list 0 and only fragments in list 1; the flight effect setup loads it by ID and fragment effects draw its parts as generic debris (Confirmed by code, same section).
- **List 2**: zero or one roughly convex hull that looked single-coloured in the local renders. It is not untextured: every list-2 part names a TEX entry, the same one in all 16, and no list-0 part names that entry (Confirmed counts). In the slice's 4 list-2 parts all texture coordinates are equal, so the part shows a single texel (Confirmed counts).
  - **Display (Likely, P2-12/21–22):** on both enemy types the original shows the hull only in frames where the craft is hit, dithered over the craft so that the craft shows through (`srangers_103.png`, `srangers_112.png`, `srangers_114.png`). Captures of the same types without a hit (`srangers_018.png`, `srangers_020.png`, `srangers_101.png`, `srangers_102.png`) show no hull. When it is shown and the dither pattern are runtime behaviour (P3, U-027); its static outline could not be compared, because it appears only dithered. The P2-12/30 recaptures add no undithered frame, and no capture or video frame shows the hull of the base or the player craft, so the static outline remains unjudged in P2-12 for lack of a baseline. The single texel the slice's list-2 parts show is in the same colour family as the dither in those captures.
  - **No transparency field:** neither MODL nor the image record has a transparency field (Confirmed). Flag value 1 alone is not a translucency flag (Likely): the list-2 parts carry it, but so do list-0 parts that the original shows opaque (the first enemy type's glow part, the second enemy type's window part and the player craft's tail glow). Whether list-2 membership itself selects the dithered drawing is Unconfirmed.
  - Whether it also serves as a collision volume is Unconfirmed.

### Part structure by list (Confirmed counts)

Local counts with the import's readers (`local/research/p2-06/structure-records.ts`, 2026-10-06). The meanings stay as in the list above and in U-027. The payload carries lists, flags and sound slots unchanged and gives them no meaning.

| List | MODL entries using it (of 19) | Parts by flag value, textured / untextured | Slice models using it (of 5) | Slice parts by flag value, textured / untextured |
|---|---:|---|---:|---|
| 0 | 18 | 1: 18 / 4; 2: 7 / 0; 3: 356 / 27 | 5 | 1: 6 / 0; 3: 104 / 17 |
| 1 | 17 | 3: 68 / 1 | 4 | 3: 17 / 1 |
| 2 | 16 | 1: 16 / 0 | 4 | 1: 4 / 0 |

- **Slice parts:** 127, 18 and 4 parts in lists 0, 1 and 2. Within each list every part names a different MESH entry, and no MESH of list 1 or 2 is also used by list 0, so the slice has 149 distinct meshes. The friendly craft model uses only list 0 (2 parts); the other four models use all three lists.
- **Flags:** flag values do not separate textured from untextured parts, because flags 1 and 3 both occur with and without a TEX entry. Flag 1 is not a translucency flag (Likely; see list 2 above). Flag meaning is otherwise Unconfirmed (U-027).
- **Sound slots:** across the five slice models, slots 0–4 are non-empty in 3, 4, 4, 3 and 4 models. Their meanings are the ones recorded in [audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08) and §2 above: slots 1, 2 and 4 Confirmed, slots 0 and 3 Unconfirmed. P2-06 assigns none.

### Observed maxima against the readers' limits (Confirmed)

The P2-06 reader limits are product constraints from [the P2-06 spec](../../plan/p2/06/spec.md#限值与预算), and the baseline values below fit within them. `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` prints them for passing entries; all 486 MESH and 19 MODL entries pass. The local run is recorded in [P2-06 subtask 10](../../plan/p2/06/subtasks/10-local-structure-records.md#完成证据).

| Quantity | Baseline maximum | Reader limit |
|---|---:|---:|
| Vertices per MESH | 284 | 4,096 (`meshVertices`) |
| Triangles per MESH | 494 | 4,096 (`meshTriangles`) |
| Shading slots per MESH | 1,105 | at most the mesh's corner count, 3 × triangles (format rule) |
| Parts per MODL, all three lists | 66 | 256 (`modelParts`) |
| Parts in list 0 / 1 / 2 (each the maximum over all MODL entries) | 57 / 8 / 1 | within `modelParts` |
| Part colour component | 252 | 255 (format rule) |
| Part flag values | 1, 2, 3 | none; carried unchanged |

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

### P2-12 viewer comparison (V-1)

Agent visual comparison in [P2-12 subtask 21](../../plan/p2/12/subtasks/21-user-comparison-session.md#完成证据) (2026-10-08): each slice model shown in the production viewer of the P2-12 candidate (commit `97b70de`, converter version `osr-import.graphics-2.logic-1.audio-1.models-2`), built from a checkout with the same build fingerprint (Classic 4:3, unlit) beside the local captures named below, with a user-specified public gameplay video as a secondary reference only where noted. Screenshots were not kept; the per-item record is the ignored `local/research/p2-12/session/record.md`. The model bindings were independently re-read in [P2-12 subtask 18](../../plan/p2/12/subtasks/18-mission-comparison.md#完成证据): six craft-type entries resolve to these five models, and each converted model equals exactly one of the 19 MODL entries, the one its M2ID slot names.

Texture appearance on the textured parts whose coordinates vary was not established by that comparison, because its viewer used the interleaved reading ([§1](#texture-coordinate-block-order-confirmed)). [P2-12 subtask 29](../../plan/p2/12/subtasks/29-mesh-uv-recheck.md#完成证据) (2026-10-08) rechecked the textured items in the same way on the corrected import (commit `02fd66f`, converter version `osr-import.graphics-3.logic-1.audio-1.models-3`); its per-item record is the ignored `local/research/p2-12/recheck/record.md`, and its texture verdicts replace subtask 21's. Where a local capture is named, outline and part layout are Confirmed for the pictured target, on the same basis as the comparisons above. Texture direction is Likely, because a mirror in u is not distinguished (§1, axes).

| Model (M2ID slot / MODL) | List 0 | List 1 | List 2 |
|---|---|---|---|
| Player craft (0, 1 / 10743) | Outline and part layout consistent with `srangers_008.png`. Textures consistent: the panel layout on the wings, the bands across the nose and the plate pattern | Parts consistent with the player's wreckage in `srangers_121.png` and `srangers_044.png`. Textures consistent: burn-marked plating, the box faces' framed pattern, and streaks on faces whose coordinates vary along one direction only, also seen in `srangers_121.png`. The direction of the pattern on the box faces cannot be resolved at the viewer's largest zoom; it rests on the shared reading (below, Likely). The wingman uses the same model (M2ID slots 0 and 1), so this also covers its wreckage | No capture or video frame; cannot be judged |
| First enemy type (7 / 11063) | Outline and part layout consistent with `srangers_020.png`. Textures consistent: the glow disc shows a round glow (the interleaved reading gave stripes) and the wing panels are segmented as in the capture | Likely consistent (P2-12/30): the user identified `srangers_098.png` as this type's destruction; its block fragment with a thin rod matches the list's hexagonal block and rods, and the fragment texture is the same family. Public video frames of this type's destruction show the same long rods and dark textured pieces. The fragments are too small for a face-by-face check | Shown only when hit ([§2](#2-modl-structure-confirmed-on-all-19-entries), list 2); static outline cannot be judged |
| Second enemy type (8 / 10373) | Outline and part layout consistent with `srangers_018.png`, `srangers_101.png` and `srangers_102.png` (two directions). Textures consistent: at an angle comparable to `srangers_018.png` the bars of the upper surface converge on the spine as in the capture | Likely consistent, video only (P2-12/30): three destructions of this type in public gameplay video frames show large irregular textured slabs with burn marks, as in the list. No local capture | As for the first enemy type (`srangers_103.png`) |
| Friendly transponder craft (14 / 11399) | Outline consistent with `srangers_011.png`. Its textured centre block is about 40 pixels wide there, too small to resolve the texture's direction or detail; consistent on the shared reading (below, Likely) | — (no list 1) | — |
| Base (17 / 10611) | Outline and parts consistent with `srangers_067.png` (video frame as secondary reference). Textures consistent: `image/model-texture/02` runs continuously along the rim and the window slits of `/04` run around the narrow cylinder. Subtask 21's difference of about 90° came from the interleaved reading | No capture or video frame of a destroyed base. Likely consistent on the user's recollection (P2-12/30, 2026-10-08): the user, who once saw a base destroyed, confirmed the viewer's list 1 | No capture or video frame; cannot be judged |
| Debris (MODL 10383, loaded by ID) | — (empty) | Likely consistent by the shared reading alone (P2-12/30): the two enemy types shed its parts when destroyed near the camera (Likely, [executable](./executable.md#effect-presentation-sources)), but no fragment in a capture or video frame can be attributed to this list, because an enemy type's fragment texture looks alike | — |

- **Shared reading (Likely):** where a capture or the viewer cannot resolve a texture's direction or detail, the verdict rests on evidence that holds for every part:
  - the converted geometry, coordinates included, equals the MODL and MESH bytes under the planar reading (§1 recheck, Confirmed for the five craft models);
  - each referenced TEX maps one-to-one to its image Asset with equal size and pixel indices, and the texture images and palettes equal the source reading ([P2-12 subtask 17](../../plan/p2/12/subtasks/17-hud-texture-coverage.md#完成证据); their payloads are unchanged on the new candidate);
  - the native loader treats every MESH entry alike (Confirmed);
  - the viewer draws every model through one presentation path, whose axis assignment and row convention match the base, both enemy types and the player craft above (Likely).
- **Handedness:** every compared craft is left-right symmetric, and the corrected textures add no feature in the captures that tells a mirror image apart. Handedness remains Unconfirmed.
- **Lighting:** the original's model views are darker overall than the unlit viewer; this is recorded under U-028 and was not used to explain any texture, colour or geometry difference.
- **Recaptures (P2-12/30, 2026-10-08):** on the candidate at commit `8ca0ed3` (build and content identity equal to `02fd66f`), the agent rechecked the list-1 and list-2 items in the production viewer against the user's recaptures and confirmations, public gameplay video frames (secondary reference, at most Likely) and, for the base's fragments, the user's recollection (same level). Per-item record: the ignored `local/research/p2-12/session/record-30.md`. The list-1 and list-2 cells above give the results.
- **Texture visibility (P2-12/30):** every textured list-0 texture is visible in a local capture: textures 01, 02 and 04 on the base in `srangers_067.png`, `072.png` and `128.png`; 06–08 on the first enemy type in `srangers_020.png` (07 and 08 also on the second type in `018.png`); 10 in `018.png`; 11 on the player craft and the transponder craft (`srangers_008.png`, `011.png`, `013.png`); 12 in `008.png` and `013.png`; 13 in `008.png` and `010.png`. Texture 03, on the end faces of the base's narrow cylinder, is seen only edge-on in the captures and face-on in a public video frame (Likely).
- **Escape pod (user observation, not independently verified):** the user identifies the box with a framed door pattern in `srangers_044.png` and `122.png` as the player's escape pod. In the agent's viewer comparison its outline and texture match the box part of the player craft's list 1 (`image/model-texture/14`; Likely); whether the pod is drawn with that part is Unconfirmed (see [B-005](../behavior/B-005-campaign-rescue.md)).

## 4. Open questions

- Meaning of part lists 1 and 2 and the part flags (U-027). Sound slots 1, 2 and 4 are confirmed; slots 0 and 3 remain Unconfirmed.
- Which texture-coordinate field the rasterizer applies along texture columns (§1; the first array, Likely). The original's texture wrap mode and front-face winding.
- How lighting selects shades (U-028); which craft type each M2ID slot is.
