---
type: format
status: draft
phase: P0
updated: 2026-10-05
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
| 0x00 | u32 | **World width in sectors**; observed 6, 8, 10, 14. The code found reads only the low 16 bits; the observed values fit in them, and the meaning of the upper half is Unconfirmed. One sector is as wide as the coordinate scale at 0x08, and the world spans ±(sectors × scale ÷ 2) around the origin (Confirmed by code, see [world sector grid](./executable.md#mission-placement-scheduling-and-world-grid)) |
| 0x04 | u32 | **World height in sectors**; equal to the value at 0x00 in every mission (Confirmed by code, as 0x00) |
| 0x08 | f32 | **Coordinate reference scale**, 8000 in every mission. At load time the game multiplies the spatial fields of section 1 and sections 3–4 by (runtime world scale ÷ this value) and stores the runtime scale here (Confirmed by code, [executable](./executable.md) §4) |
| 0x0C | u32 | 0 in 51 missions, 1 in one; when set, the mission builder switches several runtime parameters (meaning Unconfirmed) |
| 0x10 | {u32 ptr, u32 count} × 7 | Section table; a null pointer means the section is empty |

Section pointers are relocated (see IMFAT §3). Spatial fields below are those the loader rescales, which identifies them as coordinates or distances.

| # | Header | Count range | Element | Content | Status |
|---|---|---|---|---|---|
| 0 | 0x10 | 0–20 | u32 pointer | Pointers to NUL-terminated object names: the mission's **fallback name pool**. Name assignment `0x67d44` picks a random unused name from it for a record without candidate names whose kind is outside masks `0x6001`, `0x93780` and `0x78000` | Confirmed (access) |
| 1 | 0x18 | 9–32 | 132-byte record | Mission objects (see §3) | Structure Confirmed, fields partly Likely |
| 2 | 0x20 | 0–2 | variable | Group-name pointers and message text, read by the in-mission message code (Likely). An element referenced from record +0x54 is an **event trigger**: a 28-byte header {range-table pointer, range count, three runtime counters, spawn-pair pointer, pair count}, 20-byte ranges with a message reference at +8, and the referenced text. `0x6977c`/`0x695c0` count events against the referencing object; on each update, each pair whose range contains the current counter ratio schedules a section-1 record (index ≥ 0) or a section-5 entry (−1 − index) | Access Confirmed; meaning Likely |
| 3 | 0x28 | 0–6 | 16 bytes | **Spawn rectangle**: four i32 x0, y0, x1, y1 (all rescaled). Records reference it through +0x44; `0x6883c` places an object uniformly inside it at z = 0, and `0x685e0` places on a grid inside it | Confirmed (placement logic) |
| 4 | 0x30 | 0–1 | 36 bytes | Eight i32 spatial values from +4 to +0x20 (all rescaled); Likely a zone or path | Likely |
| 5 | 0x38 | 2–8 | 28 bytes | Group spawns: see [section-5 member records](#section-5-member-records-confirmed-access) | Access Confirmed |
| 6 | 0x40 | 1–3 | {u32 ptr, u32 count} | **Formation layouts**: each entry points at `count` f32 x, y, z offsets and is referenced by section-5 +4. The loader does not rescale the offsets; it swaps +4 and +8 (y and z) of element 0 only (see below) | Confirmed (access) |

Structs are packed with 1-byte alignment; several pointer fields are unaligned.

**Section-6 load transform (Confirmed by native instructions):** the last loop of `0x68d2c` never advances its element index. For each section-6 entry whose count is positive, it swaps the f32 at +4 and +8 of element 0, then reads the next entry; it keeps going while counts stay positive, so after a final positive count it also reads the 8 bytes following the table. The remaining elements are never swapped. All 191 section-5 layout pointers in the 52 missions target section-6 entries.

## 3. 132-byte object record (structure Confirmed, fields partly Likely)

Field meanings come from the mission loader and spawn code ([executable](./executable.md) §4), plus statistics over all 949 section-1 records. Offsets are in bytes.

| Offset | Type | Meaning | Status | Evidence |
|---|---|---|---|---|
| +0x00 | u32 | Single-bit model kind: the bit position indexes M2ID. Special handling: 0 = not spawned; 1 = the player's slot; 2 = object linked to the player (its +0x48 is set to the kind-1 record) | Model lookup Confirmed; special roles Likely | Model lookup `0x65ca4`; spawn and default-filling code |
| +0x04, +0x08 | {u32 ptr, u32 count} | Candidate object-name pointer list; spawn-time name assignment chooses an available name from this list, or, when empty, a type name, no name or the section-0 pool depending on the kind | Confirmed (access/assignment logic) | `0x67d44`; names are not reproduced |
| +0x0C | u32 | Defaults to 100 when 0; when +0x80 is zero, the spawn-queue processor `0x67018` spawns only if a 0–99 random roll is below it | Likely a spawn probability in percent | Default-filling code; `0x67018` |
| +0x10 | u32 | Defaults to 1 when 0; `0x67018` issues this many spawn requests each time the record's queue entry fires | Likely the number of craft in the group | Default-filling code; `0x67018` |
| +0x14 | u32 | When non-zero, `0x67018` spawns only while the runtime spawn counter +0x18 is below it | Likely a limit on live spawns | `0x67018` |
| +0x18 | u32 | Runtime spawn counter, incremented by spawn dispatch | Confirmed (access) | `0x67678`, `0x68018` |
| +0x1C | u32 | Spawn time: shifted left by 6 and inserted into a time-ordered spawn queue. Observed values such as 180 and 240 suggest seconds, which would make the queue unit 1/64 s | Likely | Spawn code |
| +0x20 | u32 | When positive, `0x67018` re-queues the entry this many (shifted) time units later | Likely a repeat interval | `0x67018` |
| +0x24, +0x28, +0x2C | f32 × 3 | Position x, y, z (rescaled at load) | Confirmed spatial, Likely position | World-scale code |
| +0x30, +0x38 | u32 | When +0x30 is non-zero the object spawns through a different path that uses both fields (Likely a formation or path reference) | Likely | Spawn code |
| +0x34 | u32 | Delay before a spawn scheduled by a section-2 event trigger (shifted left by 6) | Likely | `0x695c0` |
| +0x3C | u32 ptr | **Member back-reference**: the section-5 entry that lists this record as a member. Scheduler `0x6721c` does not schedule a section-1 record whose +0x3C is non-zero | Confirmed (scheduling); Likely (membership meaning) | `0x6721c`; see below |
| +0x40 | i32 | **Grid spacing** (rescaled at load): when non-zero, the object is placed on a grid with this spacing inside the +0x44 rectangle | Confirmed (placement logic) | `0x68398`, `0x685e0` |
| +0x44 | u32 ptr | **Spawn rectangle**: a section-3 element | Confirmed (placement logic) | `0x68398`, `0x68598`, `0x6883c` |
| +0x48 | u32 ptr | **Placement anchor**: a record; the object is placed near the runtime object created from that record, with a random offset, or at a whole-world default position when none exists. For kind 2 the loader also sets it to the kind-1 record | Confirmed (placement logic); kind-2 default Likely | `0x68708`; default-filling code |
| +0x4C, +0x50 | u32 ptr, u8 | Path-based placement through `0x688c4` when position, +0x44 and +0x48 are all zero | Likely | `0x68598` |
| +0x54 | u32 ptr | **Event trigger**: a section-2 element (§2) | Confirmed (access) | `0x6977c` |
| +0x58 | u32 ptr | **AI target record**: while that record's spawn counter (+0x18) is positive, `0x68018` targets its kind; otherwise the +0x5C mask applies | Confirmed (logic) | `0x68018` |
| +0x5C | u32 | Default AI target-kind mask, used when the descriptor at +0x58 is absent or inactive; not the object's own base capability flag | Confirmed (fallback target selection) | `0x68018`; communication code `0x2cbb4` tests the runtime object's kind instead |
| +0x60, +0x64, +0x68 | i32 | Default 100 when 0; negative values clamp to 0 | Likely percentages (e.g. hull, shields, energy) | Default-filling code |
| +0x70, +0x74 | i32 | Default (difficulty group + 3) × mission number when 0; negative clamps to 0 | Likely AI skill parameters that grow with difficulty and campaign progress | Default-filling code |
| +0x78 | i32 | Default random 20–79 when 0 | Likely another AI parameter | Default-filling code |
| +0x80 | u32 | When zero, enables the +0x0C probability roll | Likely | `0x67018` |

Other observations:

- Relocated pointer fields occur at +4, +48, +60, +68, +72, +76, +84, +88; most are null in any given record.
- The model is selected through the single-bit kind at +0 ([hud](./hud.md) §3); faction and interaction capability are separate unresolved semantics (U-022).
- The same 132-byte record type appears in `SCCT` (§4).
- Rescaling covers section-1 records only; a record reachable only through section 5 keeps its file values.

**Spawn placement order (Confirmed by code, `0x68398`):** a non-zero +0x40 selects grid placement in the +0x44 rectangle; otherwise a non-zero +0x48 selects anchor placement; otherwise a zero position (sign ignored) selects, in order, the +0x44 rectangle, the +0x4C path or a whole-world default (`0x68c98`, uniform over the world extent from header 0x00/0x04); otherwise the stored position is used. The result is then compared with the world rectangle, and kinds in mask `0x87c` get a fixed height. The resulting values are runtime state, not record data.

### Section-5 member records (Confirmed access)

Each 28-byte section-5 record contains:

| Offset | Type | Meaning | Status |
|---|---|---|---|
| +0 | u32 | Number of spawn requests each time the entry fires, in the role record +0x10 has for section-1 records (`0x67018`); not default-filled | Likely |
| +4 | u32 ptr | Formation layout: a section-6 entry | Confirmed (access) |
| +8 | u32 ptr | 132-byte template record; the scheduler queues the entry at the template's +0x1C, or through its +0x30/+0x38 path | Confirmed (scheduling) |
| +12 | u32 ptr | Array of object-record pointers (members); the same record may appear more than once | Confirmed (access) |
| +16 | u32 | Member count | Confirmed |
| +20, +24 | u32 | Runtime spawn counter and runtime object pointer, written by dispatch | Confirmed (access) |

Spawn dispatch `0x67678` instantiates the member records from that array, not only the template at +8. For member *i*, it places the object at an anchor plus layout offset (*i* mod layout count); the anchor is computed from the template by the placement routine `0x68398` whenever *i* mod layout count is 0. Layout offsets are added to rescaled anchor positions without rescaling. Template fields +0x58 and non-zero +0x5C can be copied into members before instantiation. Complete model-reference research must include the member array even if it aliases section-1 records.

## 4. SCCT: campaign table (Confirmed structure, Likely meaning)

`SCENARIO.NOB` has exactly one `SCCT`, entry 3123.

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

**Confirmed (difficulty value identity and statistics-page binding):** on the campaign branch, `0x3266c` passes global `0x186844` to `0x38428`. Only `0x330ac`, `0x330fc` and `0x332e8` write it, each from a settings value chosen by `0x38414`; the debug mission jump `0x33170` also references it. Getter `0x33930` returns the global and has one caller, `0x36b10`, the only code that formats a difficulty value as a number. That routine formats three consecutive fields: the mission number (`0x33838`), this global, and an elapsed-time value (`0x3bc04` over a statistics field). These match the consecutive mission-number, difficulty and elapsed-time rows of the statistics page in [B-003](../behavior/B-003-campaign-flow.md#第一关统计样本已确认静态读数). The settings values that feed the global are read elsewhere only by `0x38414`, by `0x381ac` (which draws them without numeric formatting, beside `0x36b10` under menu-page handler `0x34c08`), and by an unanalysed region that also writes them. A byte scan of that region finds runtime-library calls but no call to the formatter used by `0x36b10`. The page's difficulty 19 is therefore the selector input, which maps to group 0: the user's observed first campaign mission was group 0, slot 1 (SCEN 3019). Evidence: ignored `difficulty-group-call.log`, `difficulty-global.c`, `difficulty-display-call.log`, `spawn-queue-and-stats.c`, `difficulty-settings-readers.c` and their read-only analysis logs in `local/research/p2-01/`.

### P2 slice candidate evidence

Local read-only analysis confirms that all three groups' slot 0 selects `SCEN` entry 3121; P2 uses group index 1 only as the baseline configuration. That entry has ten section-1 records, two section-2 records, two section-5 records, and one section-6 list. Its section-1 kind distribution is one `0x1`, two `0x80`, and one each of `0x100`, `0x200`, `0x400`, `0x1000`, and `0x80000`, plus two zero-kind records. Sections 3 and 4 are empty.

Across all missions, non-zero kind values are single-bit powers spanning the 20 non-zero `M2ID` slots. Function `0x65ca4` maps a single-bit kind to its bit position and indexes the loaded M2ID table; the five SCCT wingman records all use kind `0x2`, which therefore resolves to slot 1. The kind-to-`M2ID` bit-position relation is **Confirmed**.

The shared slot 0 is **not qualified** by the available evidence. Its non-player records resolve structurally to six distinct `M2ID` slots (7, 8, 9, 10, 12, and 19); faction and base-capability fields remain unidentified. Section 2 is message data, not proven result-condition data; section 6 holds formation layouts (see §2), and the explicit section-3/4 spatial collections are empty. Empty collections alone do not prove that a gameplay feature is disabled.

Practice-mode observations and its rejection as a gameplay slice are recorded in [B-002](../behavior/B-002-practice-mode.md). Its association with this shared slot remains **Likely**, not Confirmed: the unique special-mode header is a clue, not a verified entry-point trace. The next research target is campaign fallback qualification, including mode-to-slot identity, faction/base/result semantics and the required resource closure; do not bind screenshot target labels directly to M2ID slots.

Campaign gameplay evidence is now recorded in [B-003](../behavior/B-003-campaign-flow.md), [B-004](../behavior/B-004-base-communications.md) and [B-001](../behavior/B-001-strategic-map.md). It establishes observable base interaction, map/Warp and successful mission progression in the user's first campaign mission. The shared difficulty value binds that run to group 0, slot 1 (SCEN 3019; see §4). Practice-to-slot-0 identity remains **Likely**. Rescue observations in [B-005](../behavior/B-005-campaign-rescue.md) must not be interpreted as immediate mission failure or silently omitted from a required mission closure.

**Confirmed (campaign structural gate):** under the player-relative [target modes](./executable.md#player-target-modes-and-enemy-classification), every non-zero campaign slot references the player slot 0 and the friendly slot 14. Only slots 1 and 2 of each group reference one or two enemy model types (two in each case); the other 45 reference three to six. This is a lower bound for those 45, since every directly referenced enemy type counts. Slots 1 and 2 also reference base kind 17, the only base-interaction kind they use. Six campaign slots therefore pass the structural player/enemy/base gate: slots 1 and 2 of groups 0–2. The three slot-1 scenes reference slots 0, 7, 8, 14 and 17. Each slot-2 scene references a strict superset (adding slots 3, 4 and 5). Result and map/Warp behaviour has been observed only in group 0, slot 1 (the user's run, §4); it has not been checked individually for the other five. Exact result and Warp formulas remain P3 research.

### Campaign candidate source profiles (Confirmed structure)

The local script `local/research/p2-01/profile-candidates.ts` checks all 54 SCCT slots covering 52 distinct SCEN entries. Report version 2 collects section-1 records, section-5 templates and every member-array record, deduplicates records, resolves each non-zero kind through M2ID, and follows all three MODL part lists and every non-zero SND reference. Bounds and referenced entry types are checked; no names, strings or payload content enter the report. Adding member traversal did not change the published slot-1 profiles or their per-type minima.

| Group | Slot | SCEN entry | Distinct referenced M2ID slots | MODL | MESH | TEX | SND | Distinct model-to-source edges |
|---|---|---|---|---|---|---|---|---|
| 0 | 1 | 3019 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |
| 1 | 1 | 3037 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |
| 2 | 1 | 3075 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |

Each profile contains 182 distinct source entries. Across the 51 non-zero campaign slots, these three profiles independently attain the minimum count for each of MODL, MESH, TEX and SND. The section-1/5 unique record counts are 9, 10 and 10 respectively; records are not necessarily individual live craft, and group size/spawn timing semantics remain separate.

**Coverage limit:** these are source-reference counts, not canonical Asset counts or canonical dependency-edge counts. Fixed cockpit/HUD/map/fonts, palette subresources, weapon/effect data, runtime-created rescue objects and other implicit references are outside this script's coverage. It does not classify factions or establish complete slice qualification. The profile is reproducible with `node local/research/p2-01/profile-candidates.ts`; JSON and command output remain in the same ignored local directory. Existing `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` also passes with zero reference failures.

### Selected-mission field inventory (Confirmed structure)

P2-09 counts every field position of the slice mission, group 0 / slot 1 (SCEN 3019), read through the product source chain (`openVerifiedSource`) from the developer's CloneCD image. Counts are of non-zero values unless stated; no names, coordinates or other values are reproduced.

| Structure | Counts | Result |
|---|---|---|
| SCEN block | 1,934 bytes, 65 relocations, all aligned within their records | Header and section tables, section-0 pointers and strings, records, record name lists and strings, the section-2 region up to section 3, sections 3 and 5, member arrays, the section-6 table and its layout arrays cover every byte |
| Header | 0x00 equals 0x04; 0x0C is zero | Section counts 19, 9, 1, 3, 0, 3, 2 for sections 0–6 |
| Section 0 | 19 names, at most 11 bytes | All printable ASCII, NUL-terminated, relocated |
| Section 1 and section 5 records | 9 unique records: both templates and all 3 distinct members alias section-1 records; 6 member slots, each section-5 entry listing one record twice | 7 non-zero kinds, 2 zero-kind records (one of them a template) |
| Record words | +0x00: 7; +0x04/+0x08: 1; +0x10: 3; +0x1C: 1; +0x3C: 3; +0x44: 5; +0x48: 1; +0x54: 1; +0x58: 1; +0x5C: 3; +0x70/+0x74/+0x78: 4 | Every other word is zero in all 9 records, including position +0x24–+0x2C, +0x40, +0x0C, +0x30, +0x38, +0x4C/+0x50 and all bytes outside the documented fields |
| Record names | 1 candidate list, 4 candidates, 5–6 bytes each | All printable ASCII, NUL-terminated, relocated; none is a section-0 pointer |
| Pointer targets | +0x3C → section-5 entries (3, each the entry listing that record); +0x44 → section-3 element starts (5); +0x48 and +0x58 → the kind-1 record (1 each); +0x54 → the section-2 element start (1) | Every pointer field is relocated and targets the start of the expected structure |
| Section 2 | 1 element: the event trigger referenced by +0x54 | 3 ranges; spawn-pair pointer and count are zero. The trigger header, the ranges, each range's message-pointer cells and their NUL-terminated printable ASCII strings partition the region up to section 3 without gaps or overlaps |
| Section 3 | 3 rectangles | All referenced by +0x44 |
| Section 5 | 3 entries; +0, +4, +8, +12, +16 non-zero in all; +20/+24 zero | Two entries share one layout; member count never exceeds the layout count |
| Section 6 | 2 entries, 2 elements each | Both referenced as layouts; element 0 of both is the zero vector and the count read after the table is zero, so the load-time swap leaves the data unchanged |
| SCCT | 1,506 bytes, 18 relocations; 3 groups × 18 slots; 5 wingman records | Wingman words: +0x00 (kind `0x2` in all), +0x04/+0x08 (one name each, at most 8 bytes, printable ASCII), +0x70, +0x74; all others zero |
| M2ID 10649 | 96 bytes, 22 slots | Referenced slots 0, 1, 7, 8, 14 and 17, all non-zero, naming 5 distinct MODL entries (slots 0 and 1 share one) |

**Confirmed (member back-references across all missions):** over the 52 SCEN entries, every section-5 member record has a non-zero +0x3C; 317 of the 336 section-1 back-references point at the only section-5 entry listing that record, and 19 do not. All 191 layout pointers target section-6 entries; 11 entries have more members than layout elements, so the modulo wraps.

**Conclusions for the slice mission (Confirmed by data and code):** header 0x00/0x04 define the world extent used by default placement and the world rectangle; sections 3, 5 and 6 and record fields +0x3C, +0x44, +0x48, +0x54 and +0x58 are in use; position fields and +0x40 are zero, so every placement comes from a rectangle, an anchor or a section-5 layout. The section-6 load transform has no effect on this mission's data. Section-5 layout offsets are runtime units, unlike the reference units of records and rectangles.

Evidence (ignored): `local/research/p2-09/field-inventory.ts` with `field-inventory.json`, `pointer-targets.ts` with `pointer-targets-3019.json`, `member-backrefs.ts`, `section2-trigger.ts` and `section2-coverage.ts`; read-only Ghidra probes `local/research/p2-09/ghidra/Probe.java` with `probe-1.txt`–`probe-5.txt`, and the earlier decompiled exports in `local/research/`.
