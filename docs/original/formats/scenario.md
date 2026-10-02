---
type: format
status: draft
phase: P0
updated: 2026-10-01
related: [U-002, U-003, U-022, U-023]
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
| 0x08 | f32 | Constant across all missions (a scale or radius; meaning Unconfirmed) |
| 0x0C | u32 | 0 in 51 missions, 1 in one |
| 0x10 | {u32 ptr, u32 count} × 7 | Section table; a null pointer means the section is empty |

Section pointers are relocated (see IMFAT §3). Sections observed in mission order of appearance:

| # | Count range | Element | Content | Status |
|---|---|---|---|---|
| 0 | 0–20 | u32 pointer | Pointers to NUL-terminated object names | Confirmed |
| 1 | 9–32 | 132-byte record | Main mission records (see §3) | Structure Likely, meaning Unconfirmed |
| 2 | 0–2 | variable | Contains group-name pointers and message text | Likely |
| 3 | 0–6 | 16-byte record | Begins with three **int32** coordinates in the tens of thousands; waypoints or spawn points. Units are Likely metres: the in-game HUD shows target distances in metres of the same magnitude | Likely |
| 4 | 0–1 | unknown | | Unconfirmed |
| 5 | 2–8 | 36-byte record | Fields at unaligned offsets point back into other sections | Likely |
| 6 | 1–3 | unknown | | Unconfirmed |

Structs are packed with 1-byte alignment; several pointer fields are unaligned.

## 3. 132-byte record (Likely structure, Unconfirmed meaning)

Profiled over all 949 section-1 records:

- Bytes 0–2 behave like bit flags (values are mostly single bits such as 1, 32, 64, 128).
- Pointer fields (relocated) at +4, +48, +60, +68, +72, +76, +84, +88; most are null in any given record.
- +112, +116, +120 hold small multiples of 10 (typically 20–90), possibly AI or skill parameters.
- The same 132-byte record type also appears in `SCCT` (§4), so it is a shared structure (U-023).

Assigning field meanings needs the EXE's loading code or in-game observation (U-022).

## 4. SCCT: campaign table (Confirmed structure, Likely meaning)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 ptr, u32 count | Group table: 3 groups |
| 0x08 | u32 ptr, u32 count | 5 records of the 132-byte type (§3) |
| 0x10 | {u32 ptr, u32 count} × 3 | Each group: 18 slots |

- Each slot is 12 bytes: `SCEN` entry ID, `MUSC` entry ID, and a u32 that is a pointer only in slot 0 (to the group name) and 0 otherwise.
- Each group's 18 slots are followed by a 34-byte NUL-padded group name.
- **Entries reference other entries by entry ID**, not by offset.
- Slot 0 of all three groups references the same `SCEN`; the other 51 slots reference distinct missions, covering all 52 `SCEN` entries.

Likely interpretation: three campaigns of 17 missions each plus one shared opening mission. Whether the slot order is the play order, and whether missions branch, is Unconfirmed (U-003).
