---
type: format
status: draft
phase: P0
updated: 2026-10-01
related: [U-002, U-003, U-008, U-013, U-014, U-022, U-023]
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
| +0x00 | u32 | Object kind: 0 = not spawned; 1 = the player's slot (a selected wingman from `SCCT` is spawned alongside it); 2 = object linked to the player (its +0x48 is set to the kind-1 record) | Likely | Spawn and default-filling code |
| +0x0C | u32 | Defaults to 100 when 0 | Likely a percentage | Default-filling code |
| +0x10 | u32 | Defaults to 1 when 0 | Likely the number of craft in the group | Default-filling code |
| +0x1C | u32 | Spawn time: shifted left by 6 and inserted into a time-ordered spawn queue. Observed values such as 180 and 240 suggest seconds, which would make the queue unit 1/64 s | Likely | Spawn code |
| +0x24, +0x28, +0x2C | f32 × 3 | Position x, y, z (rescaled at load) | Confirmed spatial, Likely position | World-scale code |
| +0x30, +0x38 | u32 | When +0x30 is non-zero the object spawns through a different path that uses both fields (Likely a formation or path reference) | Likely | Spawn code |
| +0x3C | u32 | When non-zero the object is not scheduled at mission start (Likely a trigger condition) | Likely | Spawn code |
| +0x40 | i32 | A distance (rescaled at load) | Confirmed spatial | World-scale code |
| +0x48 | u32 | For kind 2: set at load to point at the kind-1 record | Likely | Default-filling code |
| +0x5C | u32 | Flag word such as `0x68000`; the communications-menu code tests the same mask on the current target | Likely type or capability flags (e.g. dockable base) | Comm-menu code |
| +0x60, +0x64, +0x68 | i32 | Default 100 when 0; negative values clamp to 0 | Likely percentages (e.g. hull, shields, energy) | Default-filling code |
| +0x70, +0x74 | i32 | Default (difficulty group + 3) × mission number when 0; negative clamps to 0 | Likely AI skill parameters that grow with difficulty and campaign progress | Default-filling code |
| +0x78 | i32 | Default random 20–79 when 0 | Likely another AI parameter | Default-filling code |

Other observations:

- Relocated pointer fields occur at +4, +48, +60, +68, +72, +76, +84, +88; most are null in any given record.
- The craft type that selects a model through M2ID ([hud](./hud.md) §3) has not been located in this record yet (U-022).
- The same 132-byte record type appears in `SCCT` (§4).

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
