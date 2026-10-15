---
type: format
status: verified
phase: P0
updated: 2026-10-14
related: [U-001, U-020]
---

# IMFAT archive format (`.NOB` files)

Confidence labels: **Confirmed** = verified on all 9 `.NOB` files of the baseline version; **Likely** = several pieces of evidence, not checked exhaustively; **Unconfirmed** = hypothesis.

This document describes structure only and contains no bytes, images, text, or decoded output from the original files.

- Structure rules shared by both readers: [`src/original-data/archive/imfat-rules.ts`](../../../src/original-data/archive/imfat-rules.ts)
- In-memory parser: [`src/original-data/imfat.ts`](../../../src/original-data/imfat.ts); on-demand reader: [`src/original-data/archive/archive-reader.ts`](../../../src/original-data/archive/archive-reader.ts)
- Directory listing tool: `node tools/nob-list.ts <file.NOB>... [--entries]`; whole-disc check: `node tools/source-check.ts <file.ccd> <file.img> ...`
- Entry payload formats: [textures](./textures.md), [mesh](./mesh.md)

## 1. Header (Confirmed)

All integers are little-endian.

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | char[8] | Magic `IMFAT\0\0\0` |
| 0x08 | u32 | Version; 1 in every file |
| 0x0C | u32 | Entry count |
| 0x10 | u32 | ID base (e.g. 10000 for `SR.NOB`); entry IDs start at base + 1 |
| 0x14 | u32 | Offset of the first data block; always `0x18 + count × 36` |
| 0x18 | Entry[count] | Directory |

## 2. Directory entry, 36 bytes (Confirmed; `flags` meaning Unconfirmed)

| Offset | Type | Meaning |
|---|---|---|
| +0 | u32 | `flags`; observed 0, 0x10, 0x50; meaning Unconfirmed (U-020) |
| +4 | u32 | Entry ID; strictly increasing within a file |
| +8 | char[4] | Type tag, NUL-padded (e.g. `TEX\0`) |
| +12 | u32 | Relocation count `n` |
| +16 | u32 | Data block offset from the start of the file |
| +20 | u32 | Data block size |
| +24 | u32 × 3 | Always 0 |

Every entry lies inside the file and no two entries overlap. The following details are Confirmed on all 9 files by a read-only survey of the baseline disc (2026-10-05) and by full validation with the P2-03 reader:

- **IDs:** the first entry's ID is the ID base + 1, and each later ID is exactly 2 above the previous one.
- **Type tags:** every tag is 3 or 4 characters of `A–Z` and `0–9`, followed only by NUL padding.
- **Flags:** observed values per file are `SR.NOB` {0, 0x10, 0x50}, `COMM.NOB` {0, 0x50}, `CRAFT.NOB` {0, 0x10}, `DEBRIS.NOB` {0x10}, and only 0 elsewhere. **Use by the game (Confirmed, EXE, P3-01/10):** when an archive opens (`0x6ac98`), an entry with bit 0x10 is loaded at once and one with bit 0x80 is queued for loading; releasing the last reference (`0x6b03c`) frees an entry only when neither bit 0x20 nor 0x40 is set. So 0x10 means loaded at start and 0x50 also never released. The 0x50 entries are the nine sounds played by ID and the five communications menus; the 0x10 entries are TABL 4003, DEBRIS TABL 4501, RENS 10751 and TABL 11375 ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)). Other readers of the field were not searched exhaustively (U-020).
- **Layout:** directory order is data order. The first block starts at the data-start offset; each later entry starts exactly where the previous entry's block and relocation table end (`offset + size + 4 × relocationCount`); and the last relocation table ends exactly at the end of the file. There are no gaps and no trailing bytes.
- **Block sizes:** every block is at least 8 bytes.

## 3. Data blocks and relocation tables (Confirmed)

Each data block is a serialized C struct graph. Pointer fields are stored as offsets relative to the start of the block. The block is immediately followed by `n` u32 values, each the position of one such pointer field inside the block. A loader restores pointers by adding the block's base address to the value at each listed position.

- Every relocation position lies inside the block, and every stored pointer is at most the block size. On the baseline, every stored pointer is strictly between 0 and the block size.
- Relocation positions are **not necessarily 4-byte aligned**: structs are packed with 1-byte alignment, consistent with Watcom's `#pragma pack(1)`.
- Within an entry, relocation positions are unique and never overlap: sorted, consecutive positions are at least 4 apart. The tables are **not necessarily sorted**: they are unsorted in some entries of `AISTUFF`, `CRAFT`, `DEBRIS`, `OPTIONS`, `SCENARIO` and `SR`, and sorted throughout `COMM` and both `COMMFACE` files. Confirmed on all 9 files.
- In most blocks the first u32 is a small offset (e.g. 0x08, 0x0C, 0x14) pointing to the first sub-structure right after the block header.

## 4. Type distribution per file (Confirmed)

| File | Entries | Types (count) |
|---|---:|---|
| `SR.NOB` | 701 | MESH 486, TEX 59, SND 37, BITM 28, MODL 19, ANIM 17, EXPL 17, SONG 12, TABL 10, CCKD 3, MFDD 3, NEBC 2, DIAG 2, CINC 1, EXIC 1, SNIP 1, M2ID 1, RENS 1, DATA 1 |
| `SCENARIO.NOB` | 62 | SCEN 52, MUSC 5, TABL 4, SCCT 1 |
| `CRAFT.NOB` | 25 | CINF 24, TABL 1 |
| `OPTIONS.NOB` | 20 | MESC 18, DPLU 1, TABL 1 |
| `AISTUFF.NOB` | 45 | TABL 38, DFPG 6, AICO 1 |
| `COMM.NOB` | 7 | TABL 7 |
| `DEBRIS.NOB` | 1 | TABL 1 |
| `COMMFACE.NOB` / `COMMFAC2.NOB` (CD only) | 498 / 498 | CMOV 481, TABL 17; ID base 20000 in both |

## 5. Entry types

| Type | Meaning | Status | Spec |
|---|---|---|---|
| DATA | Global 256-colour VGA palette | Confirmed | [textures](./textures.md) |
| TEX | Texture with its own small palette | Confirmed | [textures](./textures.md) |
| BITM | 8-bit bitmap, sometimes with its own palette | Confirmed structure | [textures](./textures.md) |
| MESH | Triangle mesh: float positions, UVs, normals | Confirmed | [mesh](./mesh.md) |
| MODL | Model: three part lists of {MESH, TEX, colour} plus five SND IDs | Structure Confirmed | [mesh](./mesh.md) |
| SND / SONG / MUSC | Raw PCM sound effect / music (Likely XMIDI) / mission music | SND Confirmed; SONG and MUSC Unconfirmed | [audio](./audio.md) |
| CCKD / MFDD | Cockpit layouts (positioned sprites) / multi-function display images | Element and image structure Confirmed; CCKD group table Unconfirmed | [cockpit](./cockpit.md) |
| ANIM / EXPL / EXIC | Explosion animation (frame records with image encoding 1) / explosion: {SND ID, ANIM ID} / three lists of EXPL IDs | Confirmed: ANIM structure, encoding 1 and display (P3-03/05, all 17 entries and 186 frames); EXPL and EXIC structure and use | [textures §2](./textures.md#encoding-1-byte-run-sprite-rle-confirmed), [§6](./textures.md#6-anim-explosion-animations-confirmed), [§7](./textures.md#7-expl-explosion-records-confirmed), [hud](./hud.md) §3 |
| SCEN / SCCT | Missions (52) / campaign table | Structure Confirmed, field meanings partly Unconfirmed | [scenario](./scenario.md) |
| CINF | Craft info: gun, missile, craft and missile-body records, chosen by `CRAFT.NOB` TABL 4003 per campaign slot and group | Structure Confirmed (P3-03/02, all 24 entries); field types Confirmed except a few Likely from the data (craft §3); field meanings mostly Unconfirmed | [craft](./craft.md#3-cinf), [executable](./executable.md#weapon-records-and-the-first-missions-shooters-p2-1230) |
| MESC | Menu scene | Unconfirmed (large; in `OPTIONS`) | |
| CMOV | Comm-screen message: text, frame records with per-frame durations, images and sounds | Structure Confirmed ([executable RQ9](./executable.md#rq9-cmov-structure--confirmed-code-and-data)); COMMFACE serves GAMEHIRES true and COMMFAC2 false ([RQ7](./executable.md#rq7-archive-choice-and-the-absence-of-a-media-off-path--confirmed-code-durations-confirmed-data)); meaning as a face animation with voice Likely; P3-03 revision 2 imports the frame counts and durations of COMMFACE's CMOVs | [executable RQ4, RQ9](./executable.md#rq9-cmov-structure--confirmed-code-and-data) |
| DFPG / AICO | AI program parameters and script lists / global AI parameters; `AISTUFF.NOB` TABL 6003/6005/6007 are per-group AI program tables naming DFPG entries, whose lists name the TABL scripts | Structure and field types Confirmed (P3-03/03); meanings Unconfirmed | [ai](./ai.md) |
| TABL | Generic container: ID lists, HUD image groups, fonts, and other tables, depending on the entry | Per entry: `SR.NOB` entries in hud; `CRAFT.NOB` 4003 and `DEBRIS.NOB` 4501 in craft; `AISTUFF.NOB` program tables and scripts in ai; `COMM.NOB` menus and name lists in comm; `COMMFACE.NOB` face and message ID lists in executable RQ4 | [hud](./hud.md) §2, [craft](./craft.md), [ai](./ai.md), [comm](./comm.md), [executable RQ4](./executable.md#rq4-speaker-faces-and-message-lookup--confirmed-code) |
| M2ID / NEBC / EXIC | ID lists: craft type → MODL / nebula BITMs / explosion EXPLs | Confirmed structure | [hud](./hud.md) §3 |

## 6. Observed maxima against the reader's limits (Confirmed)

The P2-03 reader limits are product constraints from [the P2-03 spec](../../plan/p2/03/spec.md#限值与预算); the baseline values below fit within them. Every entry of all 9 archives passes the P2-03 header, directory and relocation rules; the local run is recorded in [P2-03 subtask 09](../../plan/p2/03/subtasks/09-local-base-check.md#完成证据).

| Quantity | Baseline maximum | Reader limit |
|---|---:|---:|
| Entries per archive | 701 (`SR.NOB`) | 4,096 |
| Data block size | 827,089 bytes (`SR.NOB`) | 4,194,304 bytes |
| Relocations per entry | 445 (`OPTIONS.NOB`) | at most block size / 4 (format rule) |
| Archive file size | 37,462,634 bytes (`COMMFACE.NOB`) | none of its own; each read is bounded by the entry limits |

**`COMMFACE.NOB` message tables (Confirmed, data; P3-10/29 survey of the baseline, counts and sizes only).** The ID chain of [executable RQ4](./executable.md#rq4-speaker-faces-and-message-lookup--confirmed-code) names 13 distinct sub-tables and 481 distinct CMOVs, every CMOV of the archive once; no listed ID is 0, and no TABL has a relocation. P3-03 revision 2 derives its limits from these maxima (twice, rounded up to a power of two):

| Quantity | Baseline maximum | Import limit |
|---|---:|---:|
| COMMFACE TABL entry size | 340 bytes (TABL 20983) | 1,024 bytes |
| Faces per face table / messages per sub-table / direct messages | 5 / 61 / 85 | 16 / 128 / 256 |
| CMOV entry size | 137,556 bytes | 524,288 bytes |
| Frames per CMOV | 4 (every listed CMOV has 3 or 4) | 8 |
| Frame durations | none negative or zero | non-negative i32 |

## 7. Open questions

- Meaning of `flags` (U-020).
- Cross-entry references: entries refer to other entries by **entry ID**. Every chain confirmed so far stays within one archive; whether references can cross archives for other types is Unconfirmed. Confirmed: `SCCT` → `SCEN` and `MUSC` ([scenario](./scenario.md) §4), M2ID → MODL, MODL → MESH, TEX and SND, EXIC → EXPL → SND and ANIM, NEBC → BITM, CINC → `SONG`, TABL 10099 → CCKD, TABL 10171 → BITM, `CRAFT.NOB` TABL 4003 → CINF ([craft §2](./craft.md#2-tabl-4003-confirmed)), the `AISTUFF.NOB` program tables → DFPG → TABL scripts ([ai §1](./ai.md#1-loading-the-id-chain-and-the-group-0-closure-confirmed)), and the four `COMMFACE` TABL entries the EXE names → TABL lists → CMOV (20983 lists CMOV directly). A scan of the other loop-loaded entries (COMM, CINF 4037, DEBRIS, SCENARIO TABL, RENS, DIAG, the HUD and map TABLs, TABL 10165, 10399, 11375) finds no aligned value equal to an entry ID ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)). The EXE names the remaining entries by constant IDs.
