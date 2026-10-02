---
type: format
status: verified
phase: P0
updated: 2026-10-01
related: [U-001, U-020]
---

# IMFAT archive format (`.NOB` files)

Confidence labels: **Confirmed** = verified on all 9 `.NOB` files of the baseline version; **Likely** = several pieces of evidence, not checked exhaustively; **Unconfirmed** = hypothesis.

This document describes structure only and contains no bytes, images, text, or decoded output from the original files.

- Parser: [`src/original-data/imfat.ts`](../../../src/original-data/imfat.ts)
- Directory listing tool: `node tools/nob-list.ts <file.NOB>... [--entries]`
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

## 2. Directory entry, 36 bytes (Confirmed except `flags`)

| Offset | Type | Meaning |
|---|---|---|
| +0 | u32 | `flags`; observed 0, 0x10, 0x50; meaning Unconfirmed (U-020) |
| +4 | u32 | Entry ID; increasing within a file, usually in steps of 2 |
| +8 | char[4] | Type tag, NUL-padded (e.g. `TEX\0`) |
| +12 | u32 | Relocation count `n` |
| +16 | u32 | Data block offset from the start of the file |
| +20 | u32 | Data block size |
| +24 | u32 × 3 | Always 0 |

Every entry lies inside the file, no two entries overlap, and sorted by offset the blocks are contiguous apart from their relocation tables.

## 3. Data blocks and relocation tables (Confirmed)

Each data block is a serialized C struct graph. Pointer fields are stored as offsets relative to the start of the block. The block is immediately followed by `n` u32 values, each the position of one such pointer field inside the block. A loader restores pointers by adding the block's base address to the value at each listed position.

- Every relocation position lies inside the block, and every stored pointer is at most the block size.
- Relocation positions are **not necessarily 4-byte aligned**: structs are packed with 1-byte alignment, consistent with Watcom's `#pragma pack(1)`.
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
| `COMMFACE.NOB` / `COMMFAC2.NOB` (CD only) | 498 / 498 | CMOV 481, TABL 17 |

## 5. Entry types

| Type | Meaning | Status | Spec |
|---|---|---|---|
| DATA | Global 256-colour VGA palette | Confirmed | [textures](./textures.md) |
| TEX | Texture with its own small palette | Confirmed | [textures](./textures.md) |
| BITM | 8-bit bitmap, sometimes with its own palette | Likely | [textures](./textures.md) |
| MESH | Triangle mesh: float positions, UVs, normals | Confirmed | [mesh](./mesh.md) |
| MODL | Model: three part lists of {MESH, TEX, colour} plus five SND IDs | Structure Confirmed | [mesh](./mesh.md) |
| SND / SONG / MUSC | Digital sound / music (possibly XMIDI) / mission music configuration | Unconfirmed (names; Miles drivers) | |
| CCKD / MFDD | Cockpit images / multi-function display images | Unconfirmed (names, large sizes) | |
| ANIM / EXPL / EXIC | Animation / explosion / explosion-related | Unconfirmed (names) | |
| SCEN / SCCT | Missions (52) / campaign table | Structure Confirmed, field meanings partly Unconfirmed | [scenario](./scenario.md) |
| CINF | Craft info, 24 craft | Unconfirmed (file name `CRAFT`) | |
| MESC | Menu scene | Unconfirmed (large; in `OPTIONS`) | |
| CMOV | Comm-screen face animation | Unconfirmed (file name `COMMFACE`; the two files may hold two resolutions) | |
| DFPG / AICO | AI data | Unconfirmed (file name `AISTUFF`) | |
| TABL | Generic table, used in several files | Unconfirmed (name) | |

## 6. Open questions

- Meaning of `flags` (U-020).
- Cross-entry references: at least `SCCT` refers to `SCEN` and `MUSC` entries by **entry ID** (Confirmed, see [scenario](./scenario.md) §4). Whether other types do the same, and how references across files work, is Unconfirmed.
