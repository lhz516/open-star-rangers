---
type: format
status: draft
phase: P0
updated: 2026-10-05
related: [U-001, U-028, U-030]
---

# HUD graphics, fonts, and ID lists (TABL, M2ID, NEBC, EXIC)

Container format: [IMFAT](./imfat.md); images use the [image record](./textures.md#2-image-record-36-bytes-confirmed). Confidence labels as defined in the IMFAT doc. Structure only; no original content.

- Parsers: [`src/original-data/conversion/source-graphics.ts`](../../../src/original-data/conversion/source-graphics.ts) (`readFontTable`, `readCockpitFonts`, `readCockpitFont`, `readImageRecordHeader`, `decodeImageRecord`) and [`src/original-data/payloads.ts`](../../../src/original-data/payloads.ts) (`parseIdList`)
- Validation: `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` parses the CCKD fonts and checks M2ID and NEBC references.

## 1. Bitmap fonts (Confirmed)

| Field | Type | Meaning |
|---|---|---|
| +0 | u8 | 0 |
| +1 | u8 | 1 in cockpit fonts, 8 in the menu font; meaning Unconfirmed |
| +2 | u8 | Glyph cell width (4 or 8) |
| +3 | u8 | Glyph cell height (6 or 8); the table holds 256 × height glyph bytes after the header |
| +4 | bytes | Glyph rows, one byte per row, bit 7 is the leftmost pixel. The 8×8 tables hold 256 glyphs of 8 rows; the 4×6 table Likely holds 192 glyphs of 8 rows, not 256 of 6 (§1.1) |

Where fonts are stored:

- **Each CCKD entry** begins with a table of three fonts ({u32 offset, u32 size} × 3 at the CCKD header): two 8×8 fonts and one 4×6 font. These are the HUD fonts for that cockpit set (see [cockpit](./cockpit.md)). In all three `SR.NOB` CCKD entries (10097, 10101, 10103) the directory order is the same: tables 0 and 1 are 8×8, table 2 is 4×6 (Confirmed: a local structure probe and `node tools/nob-check.ts`, 2026-10-05, see [P2-05 subtask 06](../../plan/p2/05/subtasks/06-production-graphics.md#完成证据)).
- **`OPTIONS.NOB` TABL 5007** holds an 8×8 font, Likely for menus.
- Glyph layout and character mapping: see §1.1.

Fonts are 1-bit; the drawing colour comes from the code. No colour is stored.

**Observed against the P2-05 limits (Confirmed):** every font table of the three CCKD entries passes the shared source reader: header byte 0 is 0, the table length is exactly `4 + 256 × height`, and the observed cells are 8×8 and 4×6. Both fit the [P2-05 limits](../../plan/p2/05/spec.md#限值与预算): cell width at most 8 (format rule, one byte per row) and height at most 8 (project safety cap; the height field is a u8). Command: `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`, recorded in [P2-05 subtask 09](../../plan/p2/05/subtasks/09-local-structure-check.md#完成证据).

### 1.1 Glyph layout and character maps (Likely)

Research of P2-05 [subtask 12](../../plan/p2/05/subtasks/12-character-map-research.md#完成证据), 2026-10-05, with local scripts under the ignored `local/research/p2-05/`. Counts are Confirmed; the conclusions are Likely.

- **Same tables everywhere (Confirmed):** the three font tables are byte-identical in all three CCKD entries (per-table SHA-256 comparison).
- **8×8 tables (fonts/0 and fonts/1):** glyph c is the 8 bytes at +4 + 8c. 253 of 256 glyphs are non-empty. In a local rendering, codes 0x20–0x7e show the glyph of that ASCII character, except fonts/0 code 0x7b, which shows an arrow instead of `{`; code 0x20 is blank.
- **4×6 table (fonts/2):** the header says 4×6 and the length is 4 + 256 × 6, but the 1,536 glyph bytes are laid out as 192 cells of 8 bytes (codes 0–191):
  - Read with an 8-byte stride, 136 of the 192 cells are byte-identical to the fonts/1 glyph of the same code, including the shade glyphs at codes 176–178. Read with the header's 6-byte stride, the glyphs line up with neither 8×8 table, and 177 of 256 set pixels beyond 4 columns.
  - The other 56 cells are codes 0x25, 0x27–0x3f, 0x41–0x5d and 0x6b. All but 0x6b are small glyphs of at most 3×5 pixels at the top left of the cell, recognisable as the ASCII character of their code (`%`, `'` to `?` including the digits, `A` to `]`). A 3×5 glyph plus one pixel of spacing fills the header's 4×6 cell. Code 0x6b holds a full-size glyph.
  - So the table is Likely a copy of an 8×8 font with the characters needed for small HUD text redrawn at 3×5. It was written out with the header's 256 × height length, which keeps only the first 192 cells.
- **Mechanism (Likely):** in every table, text byte c draws glyph c, whose rows start at +4 + 8c. Evidence:
  - **Structure and glyph recognition:** the 4×6 table's 8-byte cells and the recognisable glyphs at ASCII positions described above.
  - **Capture pixel match:** each glyph was searched for exact pixel matches across the 92 local captures, at scale 1 and 2 (a match means the glyph's pixels share one colour and no other pixel of the cell has that colour). Only fonts/0 produced qualifying text runs: its glyphs form 231 runs of three or more alphanumeric glyphs at an 8-pixel advance in 47 captures. Read through the identity map, these runs have the shape of text: digit groups followed by lowercase letters, and capitalised words. No alphanumeric runs come from fonts/1 or from the small 4×6 glyphs (tested at advances of 3–6 pixels), so the captures neither confirm nor contradict those two tables.
  - **EXE:** a bounded search of the local Ghidra decompile found no text-drawing path.
- **Codes with evidence:** only these enter the production character maps (`PRODUCTION_GRAPHICS_DECLARATIONS` in [production-graphics.ts](../../../src/original-data/conversion/production-graphics.ts)). Each code maps to the glyph of the same number.

  | Table | Codes |
  |---|---|
  | fonts/0 (8×8) | 0x20–0x7a, 0x7c–0x7e |
  | fonts/1 (8×8) | 0x20–0x7e |
  | fonts/2 (4×6, 8 rows per glyph) | 0x20, 0x25, 0x27–0x3f, 0x41–0x5d |

  The other codes have no evidence of use as text: the control and graphics codes 0x00–0x1f and 0x7f–0xff, fonts/0 0x7b (an arrow whose text byte is unknown), and the 4×6 table's full-size cells.
- **Pixels outside the cell (draw semantics Unconfirmed, U-030):** neither 8×8 table has any. In the 4×6 table read as 8-row glyphs, 135 of the 192 glyphs set pixels outside the 4×6 cell (the 134 non-empty fonts/1 copies and 0x6b); 115 of them in rows 6–7. Whether the game clips text to the cell is Unconfirmed. Conversion keeps every bit and row.
- **Still Unconfirmed:** the meaning of header byte +1.

### 1.2 Fonts used on the reference screens (R7)

Research of [P2-07 subtask 10](../../plan/p2/07/subtasks/10-font-text-research.md#完成证据), 2026-10-05, on the HI forward view `srangers_002.png` (F1) and the first mission's map `srangers_059.png` (Map).

- **Fonts:** taken from the production graphics step through the product entry. `font/hud/8x8-1` is fonts/0 and `font/hud/8x8-2` is fonts/1.
- **Matching a glyph:** at a candidate cell origin, all the glyph's set pixels share one colour, and no other pixel in the glyph's ink columns (all cell rows) has that colour. Colours are not asserted. All glyph aliases of both 8×8 fonts are kept at every origin.
- **Runs:** matches on one row and colour are chained when each glyph's ink starts 1–3 pixels after the previous glyph's ink. A run needs two alphanumeric glyphs.
- **Single letters:** the gauge letters are single glyphs, matched against the full 8×8 cell in both fonts.
- **What is recorded:** set-pixel counts, the origin-to-origin advance, and *discriminating glyphs*: glyphs whose same-code glyph in the other 8×8 font does not match at the same origin. Reachability is checked with `glyphFor` on each payload's character map. Text content and positions stay in the local output.
- **Script:** `local/research/p2-07/font-runs.ts`.

| Run | Screen | Place | Font | Glyphs | Set pixels matched | Advance (px) | Discriminating glyphs | Codes reachable |
|---|---|---|---|---:|---:|---|---:|---:|
| F1-01, F1-02 | F1 | Left of the crosshair | `font/hud/8x8-2` | 4 + 4 | 126 / 126 | 6 | 7 | 8 / 8 |
| F1-03, F1-04 | F1 | Right of the crosshair | `font/hud/8x8-2` | 4 + 4 | 124 / 124 | 6 | 8 | 8 / 8 |
| F1-05 | F1 | Indicator above the left display | `font/hud/8x8-2` | 4 | 82 / 82 | 6 | 4 | 4 / 4 |
| F1-06–08 | F1 | Left (status) display | `font/hud/8x8-2` | 6 + 4 + 4 | 248 / 248 | 6 | 14 | 14 / 14 |
| F1-09–13 | F1 | Right (navigation) display | `font/hud/8x8-1` | 6 + 4 + 7 + 2 + 2 | 537 / 537 | 8 | 20 | 21 / 21 |
| F1-27, 28, 30, 31 | F1 | Gauge corner letters | `font/hud/8x8-1` | 4 single | 118 / 118 | — | 4 | 4 / 4 |
| Map-14–19 | Map | Labels in the map area | `font/hud/8x8-2` | 5 + 6 + 2 + 5 + 3 + 2 | 445 / 445 | 6 | 23 | 23 / 23 |
| Map-20–24 | Map | Right panel, upper text | `font/hud/8x8-2` | 5 + 6 + 4 + 4 + 4 | 410 / 410 | 6 | 23 | 23 / 23 |
| Map-25, 26 | Map | Right panel, lower title | `font/hud/8x8-2` | 4 + 6 | 199 / 199 | 6 | 10 | 10 / 10 |
| — | Map | Energy-cost text beside the selection box | Unconfirmed | 0 | not compared | Unconfirmed | — | Unconfirmed |
| — | Map | Overlapping labels at the player's position | Unconfirmed | 0 | not compared | Unconfirmed | — | Unconfirmed |

- **Fonts (Likely):** every listed run's set pixels match. In every run but two, every glyph discriminates; in F1-02 and F1-10 three of four do. Each place is therefore drawn by the one font shown. The gauge-area search also found one full-cell alias of `font/hud/8x8-2` overlapping a gauge letter's cell, offset by one column and two rows; at the letter's own origin only `font/hud/8x8-1` matches.
- **Spacing (Likely):** origin-to-origin advances are constant within each font and run: 6 pixels for `font/hud/8x8-2` text and 8 pixels for `font/hud/8x8-1` text. Whether the advance is a property of the font or of the drawing call is Unconfirmed; drawing text is P3's.
- **Codes:** every matched glyph is reachable through the production character maps (§1.1), so no map is extended. For the two unmatched places, the font, spacing and the codes needed are Unconfirmed: lines and other labels cross them, and no glyph run matches there.
- **4×6 font:** a bounded search found no qualifying run of mapped 4×6 glyphs, and no glyph with set pixels outside the 4×6 cell was observed in use. The reference screens give no evidence on clipping such pixels (U-030).
- **Map buttons:** the button labels on both sides of the map are part of the frame bitmap ([cockpit](./cockpit.md#group-palette-and-drawing-confirmed)), not font text.

## 2. TABL entries in `SR.NOB` (contents Likely)

TABL is a generic container; its meaning depends on the entry.

| Entry | Content | Status |
|---|---|---|
| 10099 | Three CCKD entry IDs (HI set, HI forward-only, LO set) | Confirmed (IDs resolve to CCKD) |
| 10171 | Three BITM entry IDs (the 640×316 full-screen scenes) | Confirmed (IDs resolve to BITM) |
| 11401 | 29 image records: 18 craft icons of 20×20 used on the strategic map and in its zoom window, 9 radar blips of 4×3, 2 other symbols | Likely (icons match the map screenshots); image list structure Confirmed, see [below](#tabl-image-lists-confirmed-structure) |
| 10461 | 29 radar blips, 4×3, in several colours | Likely; image list structure Confirmed |
| 10479, 10481 | 4 images each, 20×51 and 20×52: vertical HUD gauge bars with pointer markers | Likely; image list structure Confirmed |
| 10483 | 4 images, 12×26: LO version of the gauge bars | Likely; image list structure Confirmed |
| 10165 | 33 sprite-RLE images on a 320×200 canvas; each contains only a small part at a fixed position | Purpose Unconfirmed (U-030); not an image list as defined below |
| 10399 | 13 offsets, Likely a string or record table | Unconfirmed |
| 11375 | 640 bytes of floats | Unconfirmed |

### TABL image lists (Confirmed structure)

Entries 10461, 10479, 10481, 10483 and 11401 have no header. They are `n` 36-byte [image records](./textures.md#2-image-record-36-bytes-confirmed) packed from offset 0, followed by the records' data.

| Rule | Detail |
|---|---|
| Record array | Record `i` starts at `36 × i`; there is no count or pointer field |
| Records | Every record is raw (encoding 0) with no embedded palette (palette count 0) |
| Record count | `n` is record 0's pixel data offset divided by 36 |
| Data | Every record's pixel data lies after the record array. In all five entries the data follows record order and covers the rest of the block exactly: no gaps, overlaps or trailing bytes |
| Relocations | The entry's relocation table lists exactly one position per record, its pixel pointer (+28) |

The count rule is derived from these instances. A TABL list with embedded palettes or other encodings has not been observed and is not part of this structure.

**Observed counts (Confirmed):** `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` (2026-10-05, [P2-07 subtask 07](../../plan/p2/07/subtasks/07-local-structure-check.md#完成证据)) parses all five lists with the shared reader and decodes their 70 records. The largest list holds 29 records, within the [P2-07 limit](../../plan/p2/07/spec.md#限值与预算) of 1–64, and the largest record is 20×52. None of the other TABL entries in the seven `MAIN/` archives parses as an image list.

**Evidence (Confirmed on every instance):** a local script read all 62 TABL entries of the seven `MAIN/` archives with the shared IMFAT reader and `readImageRecordHeader`/`decodeImageRecord` (`local/research/p2-07/tabl-structure.ts`, run with `node --preserve-symlinks --preserve-symlinks-main`). The five entries above pass every rule; no other TABL entry has this structure. How the program obtains `n` is Unconfirmed; it may use fixed counts.

| Entry | Records | Sizes by full-list index |
|---|---|---|
| 10461 | 29 | 0–28: 4×3 |
| 10479, 10481 | 4 each | 0–1: 20×51; 2–3: 20×52 |
| 10483 | 4 | 0–3: 12×26 |
| 11401 | 29 | 0–12 and 15–19: 20×20; 13: 16×15; 14: 12×15; 20–28: 4×3 |

**11401 intervals (Confirmed by size):** contiguous runs of equal record size, by full-list index:

| Interval | Records | Size |
|---|---|---|
| 0–12 | 13 | 20×20 |
| 13–14 | 2 | 16×15 and 12×15 |
| 15–19 | 5 | 20×20 |
| 20–28 | 9 | 4×3 |

The purposes in the table above (18 craft icons, 9 blips, 2 other symbols) come from the earlier visual research and are not yet evidenced to the [P2-07 thresholds](../../plan/p2/07/spec.md#研究与入选门槛). The 18 records of 20×20 fall in two runs separated by 13–14, and whether 13–14 belong to the craft icon sequence is Unconfirmed. P2-07/09 decides each interval's purpose and family from the slice coverage evidence.

**10165 has another structure.** Offset 0 holds an image record header of a 320×200 sprite, but record 0's first data offset is not a multiple of 36, and its 78 relocations include more than record pointer fields. It does not satisfy the rules above and is not parsed as an image list; its layout and purpose remain U-030.

## 3. ID lists (Confirmed structure)

{u32 offset, u32 count} at 0x00, then `count` u32 entry IDs.

| Type | Entry | Content |
|---|---|---|
| M2ID | 10649 | **Craft type → MODL ID**, 22 slots (two are 0). The EXE loads this entry by its ID when it opens the archives. Slot 0 and 1 both name the player craft's model; slot 14 names the transponder craft's model. Both match screenshots in shape (see [mesh](./mesh.md) §3) |
| NEBC | 10039, 10661 | Lists of BITM IDs; Likely nebula backgrounds |
| EXIC | 10211 | Three ID lists at 0x00, 0x08, 0x10 (7, 7, and 3 IDs), all EXPL entries; Likely explosion variants by size or kind |

Additional slot/geometry comparisons are recorded in [mesh](./mesh.md#3-comparison-with-the-original-partial), including slots 7 and 17. The campaign source profiles in [scenario](./scenario.md#campaign-candidate-source-profiles-confirmed-structure) resolve the referenced slots without treating target labels as Asset IDs.
