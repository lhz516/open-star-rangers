---
type: format
status: draft
phase: P0
updated: 2026-10-01
related: [U-009, U-017]
---

# Main executable (`SRANGERS.EXE`)

Confidence labels as defined in the [IMFAT](./imfat.md) doc. No code or disassembly is reproduced here.

## 1. Format and toolchain (Confirmed)

- MZ stub + **LE** (Linear Executable) image for the DOS/4GW extender; 32-bit protected mode.
- Compiled with Watcom C/C++ (Watcom 32-bit run-time present).
- The installed copy is byte-identical to the CD copy (see [manifest](../manifest.md)).
- Loads in Ghidra 12.0.1 with the ghidra-lx-loader extension as 4 LE objects. Ghidra defaults to a Borland calling convention; Watcom passes arguments in EAX, EDX, EBX, ECX, so a custom calling convention is needed before decompiling.

## 2. Linked libraries (Confirmed unless noted)

| Library | Evidence | Relevance |
|---|---|---|
| Watcom C/C++ 32-bit run-time | Run-time banner | Calling convention, struct packing |
| Miles Audio Interface Library (AIL) | Over 100 `AIL_` references; matches the Miles 3.03 drivers on disc | Music and sound playback (U-004) |
| Smacker player (statically linked) | Code checks the `SMK2` signature | Cut-scene playback |
| In-house or unbranded 3D renderer (Likely) | Assertion text mentions a fixed-point-to-integer macro, viewports, tile maps, and versioned renderer components; no third-party brand strings found | The renderer uses **fixed point** internally, while mesh vertices are stored as floats (U-009) |

## 3. Content embedded in the EXE (Confirmed)

The EXE contains no mission text (see [scenario](./scenario.md) §1). Its long strings are installer and support messages, error/assert text, library text, and one generic in-game system message.

## 4. Code landmarks

Addresses are Ghidra addresses with the ghidra-lx-loader defaults (objects mapped at 0x10000, 0x20000, 0x140000, 0x170000) and the Watcom calling convention applied (see [baseline environment](../../guides/baseline-environment.md#静态分析)). Names are ours. No decompiled code is reproduced here.

| Address | Role | Status | Evidence |
|---|---|---|---|
| 0x6affc | Load an IMFAT entry by ID; returns the relocated block | Likely | Called with constant IDs of `OPTIONS.NOB`, `COMM.NOB`, and `SR.NOB` entries; results used as typed structs |
| 0x65bcb | Opens the archives and registers per-type callbacks | Likely | References the archive file name strings; walks a table at 0x1766b4 |
| 0x1766b4 | Per-type callback table: {type tag pointer, three callbacks}, 16 bytes per row | Confirmed (contents) | Four rows: EXPL, TEX, MESH, MODL. No row for SCEN, so missions use no type-specific load callback |
| 0x39f34 | Cut-scene sequence player | Likely | Plays videos in sequence, loads the matching music entry from a 12-byte-per-row table, and switches the display between 320 and 640 wide depending on the Cinematics HI/LO setting |
| 0x2cbb4 | Builds the communications menu for the current target | Likely | Chooses one of three `COMM.NOB` menu tables from the target's type value and the flag bits `0x68000` (see [scenario](./scenario.md) §3) |
| 0x282bf | Handles debug or cheat commands | Likely | References the strings for mission win/fail and mission selection; mission selection calls 0x33170 |
| 0x33170 | Jump to mission N: stores the mission number in a global and sets the game state | Likely | Called from the debug command handler with N − 1 |
| 0x3266c | Main mission flow: briefing, building the mission, in-mission loop, results | Likely | Reads the mission number global; calls 0x66c00 and 0x335f0 |
| 0x38428 | Maps a 0–100 value to campaign group 0, 1, or 2 at thresholds 34 and 67 | Confirmed (logic), Likely (difficulty slider) | Result is passed to 0x66c00 as the group |
| 0x66c00 | Mission builder: picks a `SCCT` slot by group and mission number, loads its `SCEN` and `MUSC` by ID, rescales, and spawns objects | Likely | See [scenario](./scenario.md) §4 |
| 0x68d2c | Rescales all spatial fields of the current `SCEN` by (runtime scale ÷ header scale) | Confirmed (logic) | Identifies the spatial fields in [scenario](./scenario.md) §2–3 |
| 0x6721c | Schedules mission objects: section-1 records, section-5 entries, and the selected wingman | Likely | Inserts {time, index, source} into a time-ordered queue via 0x67584 |
| 0x6744c | Fills default values into a 132-byte object record | Confirmed (logic) | Field defaults listed in [scenario](./scenario.md) §3 |
| 0x3b8dc | Records post-mission statistics (17 rows of 0x48 bytes) and decides promotion | Likely | Compares a rank field and the average of recent scores with a threshold table |

The mission module occupies roughly 0x67000–0x6a000; functions there read the current `SCEN` through one global pointer. Not yet located: the field that selects the craft type (and therefore the M2ID model) for each object (U-022).
