---
type: format
status: draft
phase: P0
updated: 2026-10-03
related: [U-002, U-003, U-008, U-013, U-014, U-022, U-023, U-027, U-028]
---

# Missions and campaign table (SCEN, SCCT)

Container format: [IMFAT](./imfat.md). Both types live in `SCENARIO.NOB`. Confidence labels as defined in the IMFAT doc. Structure only; no names, text, or values from the original are reproduced here.

## 1. Where mission content lives (Confirmed)

- `SCENARIO.NOB` holds 52 `SCEN` entries and one `SCCT` entry.
- Every `SCEN` contains its own object names, group names, and in-mission message text.
- None of the 99 distinct strings of 20+ characters found in `SCEN` blocks occurs in `SRANGERS.EXE`. The EXE's long strings are installer hints, support messages, error/assert text, library text, and one generic in-game system message.

Conclusion: mission **content** is data in `SCENARIO.NOB`, not embedded in the EXE. Whether the EXE contains mission-specific hard-coded *logic* (e.g. special cases keyed on mission ID) is still open (U-022).

## 2. SCEN header (Confirmed on all 52 entries)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 | Unknown; observed 6, 8, 10, 14 |
| 0x04 | u32 | Unknown; always equal to the value at 0x00 |
| 0x08 | f32 | **Coordinate reference scale**, 8000 in every mission. At load time the game multiplies every spatial field by (runtime world scale ÷ this value) and stores the runtime scale here (Confirmed by code, [executable](./executable.md) §4) |
| 0x0C | u32 | 0 in 51 missions, 1 in one; when set, the mission builder switches several runtime parameters (meaning Unconfirmed) |
| 0x10 | {u32 ptr, u32 count} × 7 | Section table; a null pointer means the section is empty |

Section pointers are relocated (see IMFAT §3). Spatial fields below are those the loader rescales, which identifies them as coordinates or distances.

| # | Header | Count range | Element | Content | Status |
|---|---|---|---|---|---|
| 0 | 0x10 | 0–20 | u32 pointer | Pointers to NUL-terminated object names | Confirmed |
| 1 | 0x18 | 9–32 | 132-byte record | Mission objects (see §3) | Structure Confirmed, fields partly Likely |
| 2 | 0x20 | 0–2 | variable | Group-name pointers and message text; read by the in-mission message code | Likely |
| 3 | 0x28 | 0–6 | 16 bytes | Four i32 spatial values, Likely x, y, z, and a radius (all rescaled). Values are in the tens of thousands; the HUD shows target distances in metres of the same magnitude | Likely |
| 4 | 0x30 | 0–1 | 36 bytes | Eight i32 spatial values from +4 to +0x20 (all rescaled); Likely a zone or path | Likely |
| 5 | 0x38 | 2–8 | 28 bytes | Each entry holds at +8 a pointer to an object record like §3; these objects are scheduled for spawning separately from section 1 (Likely reinforcements or groups) | Likely |
| 6 | 0x40 | 1–3 | {u32 ptr, u32 count} | Lists of pointers to small structs whose fields at +4 and +8 the loader swaps (Likely a coordinate-axis conversion) | Unconfirmed |

Structs are packed with 1-byte alignment; several pointer fields are unaligned.

## 3. 132-byte object record (structure Confirmed, fields partly Likely)

Field meanings come from the mission loader and spawn code ([executable](./executable.md) §4), plus statistics over all 949 section-1 records. Offsets are in bytes.

| Offset | Type | Meaning | Status | Evidence |
|---|---|---|---|---|
| +0x00 | u32 | Single-bit model kind: the bit position indexes M2ID. Special handling: 0 = not spawned; 1 = the player's slot; 2 = object linked to the player (its +0x48 is set to the kind-1 record) | Model lookup Confirmed; special roles Likely | Model lookup `0x65ca4`; spawn and default-filling code |
| +0x04, +0x08 | {u32 ptr, u32 count} | Candidate object-name pointer list; spawn-time name assignment chooses an available name from this list, or falls back to other name sources when empty | Confirmed (access/assignment logic) | `0x67d44`; names are not reproduced |
| +0x0C | u32 | Defaults to 100 when 0 | Likely a percentage | Default-filling code |
| +0x10 | u32 | Defaults to 1 when 0 | Likely the number of craft in the group | Default-filling code |
| +0x1C | u32 | Spawn time: shifted left by 6 and inserted into a time-ordered spawn queue. Observed values such as 180 and 240 suggest seconds, which would make the queue unit 1/64 s | Likely | Spawn code |
| +0x24, +0x28, +0x2C | f32 × 3 | Position x, y, z (rescaled at load) | Confirmed spatial, Likely position | World-scale code |
| +0x30, +0x38 | u32 | When +0x30 is non-zero the object spawns through a different path that uses both fields (Likely a formation or path reference) | Likely | Spawn code |
| +0x3C | u32 | When non-zero the object is not scheduled at mission start (Likely a trigger condition) | Likely | Spawn code |
| +0x40 | i32 | A distance (rescaled at load) | Confirmed spatial | World-scale code |
| +0x48 | u32 | For kind 2: set at load to point at the kind-1 record | Likely | Default-filling code |
| +0x5C | u32 | Default AI target-kind mask, used when the descriptor at +0x58 is absent or inactive; not the object's own base capability flag | Confirmed (fallback target selection) | `0x68018`; communication code `0x2cbb4` tests the runtime object's kind instead |
| +0x60, +0x64, +0x68 | i32 | Default 100 when 0; negative values clamp to 0 | Likely percentages (e.g. hull, shields, energy) | Default-filling code |
| +0x70, +0x74 | i32 | Default (difficulty group + 3) × mission number when 0; negative clamps to 0 | Likely AI skill parameters that grow with difficulty and campaign progress | Default-filling code |
| +0x78 | i32 | Default random 20–79 when 0 | Likely another AI parameter | Default-filling code |

Other observations:

- Relocated pointer fields occur at +4, +48, +60, +68, +72, +76, +84, +88; most are null in any given record.
- The model is selected through the single-bit kind at +0 ([hud](./hud.md) §3); faction and interaction capability are separate unresolved semantics (U-022).
- The same 132-byte record type appears in `SCCT` (§4).

### Section-5 member records (Confirmed access)

Each 28-byte section-5 record contains a formation/layout pointer at +4, a 132-byte template pointer at +8, a pointer to an array of object-record pointers at +12, and the member count at +16. Spawn dispatch `0x67678` instantiates the member records from that array, not only the template at +8. Template fields +0x58 and non-zero +0x5C can be copied into members before instantiation. Complete model-reference research must include the member array even if it aliases section-1 records.

## 4. SCCT: campaign table (Confirmed structure, Likely meaning)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 ptr, u32 count | Group table: 3 groups, each {u32 slots ptr, u32 slot count} |
| 0x08 | u32 ptr, u32 count | 5 records of the 132-byte type (§3): **the selectable wingmen**. When a mission has a kind-1 record, the loader spawns the chosen wingman from this list (Likely, U-023) |
| 0x10 | {u32 ptr, u32 count} × 3 | The three groups' slot lists (18 slots each) |

- Each slot is 12 bytes: `SCEN` entry ID, `MUSC` entry ID, and a u32 that is a pointer only in slot 0 (to the group name) and 0 otherwise. The mission builder loads the slot's `SCEN` and `MUSC` by these IDs (Confirmed by code).
- Each group's 18 slots are followed by a 34-byte NUL-padded group name.
- **Entries reference other entries by entry ID**, not by offset.
- Slot 0 of all three groups references the same `SCEN`; the other 51 slots reference distinct missions, covering all 52 `SCEN` entries.
- **The three groups are Likely three difficulty versions of one campaign**, not three campaigns: the code maps a 0–100 value to group 0, 1, or 2 at thresholds 34 and 67, consistent with the campaign difficulty slider described in the README (U-003).
- The post-mission code keeps statistics for 17 missions and caps the mission number below 17 (Confirmed), consistent with 17 missions per group after the shared opening mission.

**Confirmed selection logic:** the main flow at `0x3266c` passes slot 0 to the builder on its non-campaign branch and the zero-based campaign mission index plus 1 on its campaign branch. Group selection uses `0x38428`: values below 34 select group 0, values 34–66 select group 1, and values 67 or above select group 2. Thus the structural selector for the first campaign mission is slot 1, not the common slot 0. The selected wingman getter `0x33940` provides the selector subsequently used by `0x6721c`; zero skips wingman scheduling, positive selectors are clamped to the five-record SCCT list and converted to a zero-based index.

### P2 slice candidate evidence

Local read-only analysis confirms that all three groups' slot 0 selects `SCEN` entry 3121; P2 uses group index 1 only as the baseline configuration. That entry has ten section-1 records, two section-2 records, two section-5 records, and one section-6 list. Its section-1 kind distribution is one `0x1`, two `0x80`, and one each of `0x100`, `0x200`, `0x400`, `0x1000`, and `0x80000`, plus two zero-kind records. Sections 3 and 4 are empty.

Across all missions, non-zero kind values are single-bit powers spanning the 20 non-zero `M2ID` slots. Function `0x65ca4` maps a single-bit kind to its bit position and indexes the loaded M2ID table; the five SCCT wingman records all use kind `0x2`, which therefore resolves to slot 1. The kind-to-`M2ID` bit-position relation is **Confirmed**.

The shared slot 0 is **not qualified** by the available evidence. Its non-player records resolve structurally to six distinct `M2ID` slots (7, 8, 9, 10, 12, and 19); faction and base-capability fields remain unidentified. Section 2 is message data, not proven result-condition data; section 6 remains Unconfirmed, and the explicit section-3/4 spatial collections are empty. Empty collections alone do not prove that a gameplay feature is disabled.

Practice-mode observations and its rejection as a gameplay slice are recorded in [B-002](../behavior/B-002-practice-mode.md). Its association with this shared slot remains **Likely**, not Confirmed: the unique special-mode header is a clue, not a verified entry-point trace. The next research target is campaign fallback qualification, including mode-to-slot identity, faction/base/result semantics and the required resource closure; do not bind screenshot target labels directly to M2ID slots.

Campaign gameplay evidence is now recorded in [B-003](../behavior/B-003-campaign-flow.md), [B-004](../behavior/B-004-base-communications.md) and [B-001](../behavior/B-001-strategic-map.md). It establishes observable base interaction, map/Warp and successful mission progression, but not a qualified structural selector or minimal dependency closure. The first-mission statistics sample uses difficulty 14; two non-zero kill categories do not prove one or two model types at the approved middle-group configuration. Mode-to-SCCT/SCEN identity, all direct/indirect references and source mappings remain **Unconfirmed**. Rescue observations in [B-005](../behavior/B-005-campaign-rescue.md) must not be interpreted as immediate mission failure or silently omitted from a required mission closure.

### Campaign candidate source profiles (Confirmed structure)

The local script `local/research/p2-01/profile-candidates.ts` checks all 54 SCCT slots covering 52 distinct SCEN entries. Report version 2 collects section-1 records, section-5 templates and every member-array record, deduplicates records, resolves each non-zero kind through M2ID, and follows all three MODL part lists and every non-zero SND reference. Bounds and referenced entry types are checked; no names, strings or payload content enter the report. Adding member traversal did not change the published slot-1 profiles or their per-type minima.

| Group | Slot | SCEN entry | Distinct referenced M2ID slots | MODL | MESH | TEX | SND | Distinct model-to-source edges |
|---|---|---|---|---|---|---|---|---|
| 0 | 1 | 3019 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |
| 1 | 1 | 3037 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |
| 2 | 1 | 3075 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |

Each profile contains 182 distinct source entries. Across the 51 non-zero campaign slots, these three profiles independently attain the minimum count for each of MODL, MESH, TEX and SND. The section-1/5 unique record counts are 9, 10 and 10 respectively; records are not necessarily individual live craft, and group size/spawn timing semantics remain separate.

**Coverage limit:** these are source-reference counts, not canonical Asset counts or canonical dependency-edge counts. Fixed cockpit/HUD/map/fonts, palette subresources, weapon/effect data, runtime-created rescue objects and other implicit references are outside this script's coverage. It does not classify factions or establish complete slice qualification. The profile is reproducible with `node local/research/p2-01/profile-candidates.ts`; JSON and command output remain in the same ignored local directory. Existing `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` also passes with zero reference failures.
