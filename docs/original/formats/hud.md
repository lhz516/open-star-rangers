---
type: format
status: draft
phase: P0
updated: 2026-10-28
related: [U-001, U-028, U-029, U-030]
---

# HUD graphics, fonts, and ID lists (TABL, SNIP, DIAG, M2ID, NEBC, EXIC)

Container format: [IMFAT](./imfat.md); images use the [image record](./textures.md#2-image-record-36-bytes-confirmed). Confidence labels as defined in the IMFAT doc. Structure only; no original content.

- Parsers: [`src/original-data/conversion/source-graphics.ts`](../../../src/original-data/conversion/source-graphics.ts) (`readFontTable`, `readCockpitFonts`, `readCockpitFont`, `readImageRecordHeader`, `decodeImageRecord`) and [`src/original-data/payloads.ts`](../../../src/original-data/payloads.ts) (`parseIdList`)
- Validation: `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` parses the CCKD fonts and checks M2ID and NEBC references.

## 1. Bitmap fonts (Confirmed)

| Field | Type | Meaning |
|---|---|---|
| +0 | u8 | 0 |
| +1 | u8 | 1 in cockpit fonts, 8 in the menu font; meaning Unconfirmed. The text drawer does not read it (Confirmed, [§4.1](#41-primitives-text-and-formatting)) |
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
- **Mechanism (Confirmed, EXE, P2-12/27; earlier Likely):** in every table, text byte c draws glyph c, whose rows start at +4 + 8c; fonts/1 and fonts/2 first replace a–z with A–Z (Drawing, below). Evidence:
  - **Structure and glyph recognition:** the 4×6 table's 8-byte cells and the recognisable glyphs at ASCII positions described above.
  - **Capture pixel match:** each glyph was searched for exact pixel matches across the 92 local captures, at scale 1 and 2 (a match means the glyph's pixels share one colour and no other pixel of the cell has that colour). Only fonts/0 produced qualifying text runs: its glyphs form 231 runs of three or more alphanumeric glyphs at an 8-pixel advance in 47 captures. Read through the identity map, these runs have the shape of text: digit groups followed by lowercase letters, and capitalised words. No alphanumeric runs come from fonts/1 or from the small 4×6 glyphs (tested at advances of 3–6 pixels), so the captures neither confirm nor contradict those two tables.
  - **EXE:** P2-05/12's bounded search of the decompile found no text-drawing path; P2-12/27 found it through the instrument handlers (Drawing, below).
- **Drawing (Confirmed, EXE, P2-12/27):** `0x49694` builds one record per CCKD font table with `0x5acac` (cell width, cell height, glyph data at +4). It then sets the advance of fonts/1 and fonts/2 to 6 pixels, the height of fonts/2 to 6 rows, and an upper-case flag on both; fonts/0 keeps its cell width (8) as its advance. The text drawer `0x59fc8` replaces a–z with A–Z (`0x75572`) when the flag is set. It then draws the first `height` rows of each glyph with all 8 bit columns, in one colour given by the caller, reading glyphs at an 8-byte stride (16 only when the height exceeds 8), and moves on by the advance. So the game:
  - never draws rows 6–7 of the 4×6 table;
  - draws set pixels past the advance over the next cell;
  - draws lowercase codes with the uppercase glyphs in fonts/1 and fonts/2. The production character maps below do not apply this replacement.

  **HI never draws text with fonts/2 (Confirmed, EXE, P2-12/30; earlier unsettled):** `0x49a58` (table index to font record) is the only reader of the font array: all 20 uses of `0x1a23ac` lie in `0x49694`–`0x49b2c`. Every one of its 39 calls and every call of the text drawers `0x59f90` (52) and `0x59fc8` (17) was traced to its font index. The display mode is the global `0x1762a0` (`0x59e4c`; 1 = HI, 2 = LO). Each site uses fonts/0 or fonts/1 in HI and selects fonts/2 only in LO, either by testing the mode or through a parameter block chosen by mode and never written: `[[0x175afc]]` (set by `0x456ac`, flight-view overlays) and `[[0x175e88]+0x64]` (set by `0x4ca80`, the Warp page). While HI is selected, the only switch to LO is movie playback (`0x39f34`), which draws no text. So `font/hud/4x6` is not drawn on HI screens, the Classic baseline; the rows above still describe how LO draws it. Read-only Ghidra session; the per-site table is in the ignored `local/research/p2-12/hud/font4x6-30/report.md`.
- **Codes with evidence:** only these enter the production character maps (`PRODUCTION_GRAPHICS_DECLARATIONS` in [production-graphics.ts](../../../src/original-data/conversion/production-graphics.ts)). Each code maps to the glyph of the same number.

  | Table | Codes |
  |---|---|
  | fonts/0 (8×8) | 0x20–0x7a, 0x7c–0x7e |
  | fonts/1 (8×8) | 0x20–0x7e |
  | fonts/2 (4×6, 8 rows per glyph) | 0x20, 0x25, 0x27–0x3f, 0x41–0x5d |

  The other codes have no evidence of use as text: the control and graphics codes 0x00–0x1f and 0x7f–0xff, fonts/0 0x7b (an arrow whose text byte is unknown), and the 4×6 table's full-size cells.
- **Pixels outside the cell (draw semantics Confirmed, P2-12/27):** neither 8×8 table has any. In the 4×6 table read as 8-row glyphs, 135 of the 192 glyphs set pixels outside the 4×6 cell (the 134 non-empty fonts/1 copies and 0x6b); 115 of them in rows 6–7. The game does not clip to the cell: it draws rows 0–5 and all 8 columns (Drawing, above). Conversion keeps every bit and row.
- **Still Unconfirmed:** the meaning of header byte +1, which drawing does not read ([§4.1](#41-primitives-text-and-formatting), P3-13/05).

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
| F1-09–13 | F1 | Right (target) display | `font/hud/8x8-1` | 6 + 4 + 7 + 2 + 2 | 537 / 537 | 8 | 20 | 21 / 21 |
| F1-27, 28, 30, 31 | F1 | Gauge corner letters | `font/hud/8x8-1` | 4 single | 118 / 118 | — | 4 | 4 / 4 |
| Map-14–19 | Map | Labels in the map area | `font/hud/8x8-2` | 5 + 6 + 2 + 5 + 3 + 2 | 445 / 445 | 6 | 23 | 23 / 23 |
| Map-20–24 | Map | Right panel, upper text | `font/hud/8x8-2` | 5 + 6 + 4 + 4 + 4 | 410 / 410 | 6 | 23 | 23 / 23 |
| Map-25, 26 | Map | Right panel, lower title | `font/hud/8x8-2` | 4 + 6 | 199 / 199 | 6 | 10 | 10 / 10 |
| — | Map | Energy-cost text beside the selection box | `font/hud/8x8-2` (EXE) | 0 | not compared | 6 (EXE) | — | Unconfirmed |
| — | Map | Overlapping labels at the player's position | `font/hud/8x8-2` (EXE) | 0 | not compared | 6 (EXE) | — | Unconfirmed |

- **Fonts (Likely):** every listed run's set pixels match. In every run but two, every glyph discriminates; in F1-02 and F1-10 three of four do. Each place is therefore drawn by the one font shown. The gauge-area search also found one full-cell alias of `font/hud/8x8-2` overlapping a gauge letter's cell, offset by one column and two rows; at the letter's own origin only `font/hud/8x8-1` matches.
- **Spacing (Confirmed, P2-12/27; earlier Likely):** origin-to-origin advances are constant within each font and run: 6 pixels for `font/hud/8x8-2` text and 8 pixels for `font/hud/8x8-1` text. The advance is a property of the font record built at load (§1.1 Drawing); drawing text is P3's.
- **Codes:** every matched glyph is reachable through the production character maps (§1.1), so no map is extended. Lines and other labels cross the two unmatched places, and no glyph run matches there. The EXE draws both with fonts/1 at its advance of 6: the energy-cost text in `0x49f8c`, the labels in `0x4af78` (P2-12/27). Their sources (the format `0x171d10` and object names) lie within the production maps, like every slice text source ([§4.1](#41-primitives-text-and-formatting), P3-13/05).
- **4×6 font:** a bounded search found no qualifying run of mapped 4×6 glyphs, and no glyph with set pixels outside the 4×6 cell was observed in use. How such pixels are drawn is settled by the EXE (§1.1 Drawing). The wider P2-12 search found no 4×6 run either ([below](#slice-coverage-check-and-u-030-impact-p2-12)), as expected: HI never draws fonts/2 (§1.1 Drawing).
- **Map buttons:** the button labels on both sides of the map are part of the frame bitmap ([cockpit](./cockpit.md#group-palette-and-drawing-confirmed)), not font text.

## 2. TABL entries in `SR.NOB` (contents Likely)

TABL is a generic container; its meaning depends on the entry.

| Entry | Content | Status |
|---|---|---|
| 10099 | Three CCKD entry IDs (HI set, HI forward-only, LO set) | Confirmed (IDs resolve to CCKD) |
| 10171 | Three BITM entry IDs (the 640×316 full-screen scenes) | Confirmed (IDs resolve to BITM) |
| 11401 | 29 image records, drawn in the strategic map's zoom window by an index from a unit field | Confirmed (EXE drawing path, [below](#hud-and-map-drawing-paths-confirmed-exe)); image list structure Confirmed, see [below](#tabl-image-lists-confirmed-structure) |
| 10461 | 29 unit markers of 4×3 drawn in the strategic map's main area (records 20–25 are empty) | Confirmed (EXE drawing path); image list structure Confirmed |
| 10479, 10481 | 4 images each, 20×51 and 20×52: vertical gauge bars drawn on a left-display page; 10481 replaces 10479 in the base interior (view mode 6) | Confirmed (EXE drawing path); image list structure Confirmed |
| 10483 | 4 images, 12×26: LO version of the gauge bars | Likely; image list structure Confirmed |
| 10165 | Base interior items: 11 records of 0x7C bytes, each three 320×200 sprite-RLE [image records](./textures.md#2-image-record-36-bytes-confirmed) (+0x00, +0x24, +0x48; each image holds only a small part at a fixed position), a u32 subsystem selector (+0x6C; type, domain and readers [below](#tabl-10165-selectors-and-tabl-10399-labels-p3-0304)), two pointers (+0x70, +0x74) and a small integer (+0x78); data and strings follow the records. The record count comes from the EXE, not the entry | Record layout Confirmed (data and the base code, [executable](./executable.md#data-loaded-by-the-loop-p3-0110)); +0x6C Confirmed (P3-03/04); +0x70–+0x78 and the three images' roles Unconfirmed (U-030) |
| 10399 | 13 relocated string pointers, then their 13 NUL-terminated strings: the view labels of mode 0x11, indexed by sub-mode ([executable](./executable.md#automatic-views-and-cameras-p3-0109)); item 8 is the destruction view's label ([below](#tabl-10165-selectors-and-tabl-10399-labels-p3-0304)) | Confirmed (EXE, P3-01/09; layout and text rules P3-03/04); use of indices 9–12 Unconfirmed |
| 11375 | 20 records of 32 bytes, one per kind bit, read only by the cameras of the external views ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)) | Use Confirmed (EXE, P3-01/10); fields Unconfirmed |

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

One path draws every record of the list, selected by a unit field ([below](#hud-and-map-drawing-paths-confirmed-exe)), so the intervals share palette, transparency and row order. Which craft selects which record is R8's question.

**10165 has another structure.** Offset 0 holds an image record header of a 320×200 sprite, but record 0's first data offset is not a multiple of 36, and its 78 relocations include more than record pointer fields. It does not satisfy the rules above and is not parsed as an image list; its layout and purpose remain U-030.

### TABL 10165 selectors and TABL 10399 labels (P3-03/04)

Research of P3-03 [subtask 04](../../plan/p3/03/subtasks/04-comm-hud-text-research.md), 2026-10-09: read-only static analysis on a private copy of the Ghidra project (`-noanalysis -readOnly`), and a survey of both entries through the verified source chain that prints only offsets, lengths, counts and predicates. No selector values or label text are reproduced here.

**TABL 10165, locating the records (Confirmed, code and data):**

- Record k starts at k × 0x7C from offset 0; there is no header.
- The entry has no count field. The code takes the count, 11, from the word `0x174e18` in the EXE's data object. That word is initialised in the image and never written; its only references are reads in `0x39664`.
- The 11 records take 1,364 bytes of the 69,407-byte block. The rest of the records and the data after them are base-interior content (G-05) and are not described further.
- Docking sub-command 0 (`0x38ff4`) loads the entry through `0x6affc` into `0x174e14`, and sub-command 4 releases it. Nothing transforms the block at load beyond IMFAT relocation, and +0x6C is not relocated in any record.

**+0x6C, subsystem selector (Confirmed, code):** u32. The sort `0x39664` (run when docking), the state function `0x39cb4`, the repair step `0x398ec`, the display helper `0x39c94` (called by `0x4f550`) and docking sub-command 3 all read it with 32-bit loads; `0x39d24` also reads it but has no caller. Every comparison of the value is unsigned (`JBE`/`JA` against 5, 7, 8, 0x21 and 0x22).

- **Groups:** 0x21 (33) and 0x22 (34) select groups. `0x39cb4` aggregates the states of subsystem slots 15–18 and 10–14 respectively (a stepping count, not the maximum; [BS3](./executable.md#bs3-state-query-0x39cb4v--confirmed-code)), and `0x398ec` repairs every slot of the group.
- **Single slots:** any other value v is one slot. It reaches the slot accessors `0x52ac4` and `0x52a84`, which index three 32-entry tables: `0x1760b4` (bit shift), `0x1760d4` (word index) and `0x1760f4` (mask). Together they address 32 two-bit states in the two words at object +0xE8 and +0xEC.
- **Domain:** 0–31, 33 and 34. The value 32 and values above 34 index past the 32-entry tables.
- **Special cases:** `0x398ec` also treats the slots 5, 7 and 8 specially (extra calls), all within 0–31.

What each value does in the base service is in [TABL 10165 in the base service](#tabl-10165-in-the-base-service-p3-1005).

**+0x6C observed (Confirmed, data):** the 11 values are distinct. Nine are single slots and two are the group values; all lie in the set the P3-01 closure gives (0–9, 33 and 34), which is inside the domain above.

**TABL 10399, layout (Confirmed, data):**

- The block is 242 bytes: 13 u32 pointers at offsets 0–0x30, then 13 strings.
- The relocation table lists exactly the 13 pointer positions.
- The pointers ascend. The strings follow from offset 52 in index order, each starting right after the previous NUL, and the last ends exactly at the end of the block. No string is shared.

**TABL 10399, readers (Confirmed, code):** `0x45420` loads the entry into `0x175984` and the teardown at `0x4564d` releases it. Two readers index the pointer array by the player-state byte +0x2A (the sub-mode):

- the view setup `0x459a0`, for view mode 0x11, measures the string with a byte scan to its NUL to size the label box;
- `0x45de0` draws the string with `0x59f90` while the view mode is 0x11.

Item 8 is read when the sub-mode is 8, the destruction view ([automatic views](./executable.md#automatic-views-and-cameras-p3-0109)).

**Item 8 (Confirmed, data):** the pointer at +0x20 targets the string area. The string is 16 bytes without its NUL; it starts right after item 7's NUL, and item 9 starts right after its own NUL.

**Text rules (Confirmed):**

- Each label ends with a NUL inside the block.
- `0x59f90` measures the label to its NUL and `0x59fc8` draws every byte as its glyph, so no control or format codes exist.
- The font is that of the flight-overlay parameter block `[[0x175afc]]`, which is fonts/1 in HI; fonts/1 upper-cases a–z when drawing (§1.1). Conversion keeps the stored bytes.
- Any non-zero byte (1–255) can be stored and is drawn alike. In the baseline, all 13 labels are 10–18 bytes long without the NUL, and every byte is printable ASCII (0x20–0x7E), with no control bytes, no bytes of 0x80 or above and no `%`. These are observations, not constraints of the format.

**Static coverage:** the image was scanned for every 32-bit occurrence of the block pointers `0x174e14` and `0x175984` and of the count word `0x174e18`. The readers above are the only ones; no pointer is stored elsewhere. The [P3-01/10 ID scan](./executable.md#data-loaded-by-the-loop-p3-0110) finds 10165 as an immediate only in `0x38ff4`, and 10399 only in `0x45420` and its teardown. Evidence (ignored): `local/research/p3-03/comm-hud-text/` (`ghidra_scripts/CommProbe.java` outputs `out/d1`, `out/d2`, `out/d8`, `out/w1`, `out/x1`, `out/x9`, `out/x11`, `out/x12`; `structure.ts` with `out/structure.json`).

### TABL 10165 in the base service (P3-10/05)

Research of P3-10 [subtask 05](../../plan/p3/10/subtasks/05-base-service-research.md), merged by subtask 06, 2026-10-14; read from native instructions on a private copy of the Ghidra project (`-noanalysis -readOnly`). The rules are in [executable](./executable.md#base-interior-service-p3-1005); this section records only what the record fields select. Resolves the +0x6C part of U-030.

**Records and order (Confirmed, code):** the base interior keeps one ordered array of the 11 record indices, `0x186a70`, which is both the service queue and the screen order: row i of the base screen is record queue[i], the cursor is a row index, the head (row 0) is the record being serviced, a finished record moves to the last row and Enter moves the highlighted row to the top ([BS5](./executable.md#bs5-display-order--confirmed-code)). Docking sorts the records by their state, highest first, ties in record order.

**+0x6C, what each selector services (Confirmed, code):** the state of a record is `0x39cb4(+0x6C)`: the stored 2-bit subsystem field v, or for 0x21 and 0x22 a stepping count over fields 15–18 and 10–14 ([BS3](./executable.md#bs3-state-query-0x39cb4v--confirmed-code)). One repair step on the head ([BS6](./executable.md#bs6-per-frame-service-0x398ec--confirmed-code)):

| Selector | Repair step |
|---|---|
| 5 | Resets the first damaged mount of list 1 to level 0 and writes field 5 := the list's status, so the record stays at the head until every mount of that list is repaired |
| 8 | The same for list 0 and field 8 |
| 7 | Field 7 := 0 and also the disturbance and the control lock := 0 |
| 0x21 / 0x22 | Fields 15–18 / 10–14 := 0 |
| any other | Field v := 0 |

The mount repairs restore no ammunition. Hull, energy and missile refills are separate timed steps that no selector chooses.

**Images (Confirmed, code):** the drawing loop `0x4f550` takes the image at record +0x00, +0x24 or +0x48 for states 0, 1 and 2 of that row (`0x39d5c`).

**+0x70, +0x74, +0x78 (readers Confirmed, code; roles Unconfirmed):** read only through the row helpers `0x39d40` (+0x70) and `0x39dd8` (+0x74, +0x78), which only `0x4f550` calls; what they draw remains U-030 (P3-13).

### HUD and map drawing paths (Confirmed, EXE)

Read-only analysis of `SRANGERS.EXE` for [P2-07 subtask 09](../../plan/p2/07/subtasks/09-hud-family-research.md#完成证据), 2026-10-06. Only addresses and what the functions do are recorded here; no decompiled or disassembled code. The instrument and map functions below are reached only through tables built at run time and were not disassembled in the analysed project. Local Ghidra scripts in the ignored `local/research/p2-07/ghidra/` disassemble them in memory without saving the project: they locate entry IDs, handle addresses and every call to the blitters.

**Blitters:**

| Address | Operation |
|---|---|
| `0x59608` | Copies rows to the screen, writing every pixel (opaque, [cockpit](./cockpit.md#group-palette-and-drawing-confirmed)) |
| `0x59774` | Copies rows to the screen, skipping source pixels equal to a colour key; every caller below passes key 0 |
| `0x59cbc` | Copies rows into an off-screen buffer, writing every pixel |
| `0x59d38` | Copies rows into an off-screen buffer, skipping source pixels equal to a colour key; both callers below pass key 0 |

All four read the source rows top-down in stored order.

**Users:**

| Function | Draws |
|---|---|
| `0x4ca80` | Loads the five-entry HUD set from one of three tables: HI `0x175e8c` (MFDD 10473, BITM 10467, TABL 10479, SNIP 10487, DIAG 10489); HI `0x175eb4` when byte +0x28 of the block returned by `0x52694` is 6 (10475, 10469, 10481, 10487, 10489); LO `0x175ea0` (10477, 10471, 10483, 10487, 10491). That byte is the player-state view mode, and 6 is the base interior (corrected P3-01/10, [executable](./executable.md#data-loaded-by-the-loop-p3-0110)); the view switch `0x3f158` reloads the set through `0x4cd68` |
| `0x4d50c` | Status display, into an off-screen buffer: one MFDD list-0 background (record 0, 1 or 2, chosen by thresholds on the player's shield as a share of its capacity) with `0x59cbc`, then list-1 records chosen per subsystem state, some blinking, with `0x59d38`. It also writes the player's subsystem fields 1, 5 and 8, which the damage rule reads ([D9](./executable.md#d9-status-display-writes-subsystem-fields-1-5-and-8--confirmed-code)) |
| `0x4d0e0` | Copies that buffer with `0x59608` to (x0, y0 + 1) of its instrument rectangle, then draws two lines of message text from the DIAG entry's strings |
| `0x4d800` | A left-display page: BITM 10467 at (x0, y0 + 1) with `0x59608`; then two 10479 records chosen by the player object's two recharge levels (+0x34, +0x38; corrected by P3-07/01 from "the target object"), one near each side, with `0x59774`; then labelled bars (spare power in the middle, shield on the left, charge on the right, [D16](./executable.md#d16-hud-full-scales--confirmed-code-for-operands-drawing-p3-13)) and text. `0x59774` takes inclusive source bounds, and this call passes columns 0 to w and rows 0 to h − 2: every row but the last (which is colour key 0 in all four 10479 records), plus one column that repeats the next row's first pixel (P2-12/27) |
| `0x4da28`, `0x4dcec` | Other left-display pages: BITM 10467 at (x0, y0 + 1) with `0x59608`, then text. Entry addresses from the page table at `0x175c7c` (P2-12/27; earlier recorded as `0x4da25` and `0x4dce9`, the starts of in-memory disassembly) |
| `0x4d010` | A frame of SNIP 10487 chosen by time, at (x0, y0 + 1) of a display ([SNIP 10487](#snip-10487-confirmed-structure-p2-1227)) |
| `0x49e00` | Loads TABL 10461 and 11401 for the strategic map |
| `0x49f8c` | Strategic map: for each unit, the 10461 record selected by a unit field in the main map area (records 26 and 27 also mark special positions), and the 11401 record selected by another unit field in the zoom window, each through `0x4abe4` |
| `0x4abe4` | Draws one record with `0x59774`, clipped to the given area. When given a colour, it then draws a one-pixel box from the record's top-left corner, one pixel wider and taller than the record |
| `0x4b56c` | Moves zoom-window icon positions so that their rectangles do not overlap; reads only record sizes |

No other code uses the 10461 and 11401 handles apart from loading and freeing them; the only other user is `0x4c674`, which draws one 10461 record through `0x4abe4`. `0x4c674` is called only by `0x49f8c` and draws in the main map area; it is not a radar path (P2-12/27).

**Palettes:** the forward cockpit group (10103 slot 0) has no group palette, so the forward view and its HUD use the default palette, the DATA global palette ([textures](./textures.md#1-data-global-palette-confirmed), the production flight palette). The map screen uses the map group's palette for the whole screen ([cockpit](./cockpit.md#group-palette-and-drawing-confirmed)).

### SNIP 10487 (Confirmed structure, P2-12/27)

The only SNIP entry in `SR.NOB`. The HUD set loads it with the other four families (`0x4ca80`, all three tables).

| Offset | Content |
|---|---|
| +0 | u32 offset of the frame block (28); the entry's one relocation is this pointer |
| +4 | u32 size of the frame block (20,748) |
| +8 | Zero bytes up to the offset |
| Block +0 | u32 frame count (9) |
| Block +4 | u32 height (96) |
| Block +8 | u32 width (96) |
| Block +12 | The frames, each width × height / 4 bytes (2,304), in order |

- **Pixels:** 2 bits each, four per byte, the leftmost pixel in the lowest two bits, rows top-down. 12 + 9 × 2,304 bytes fill the block exactly. All four values occur.
- **Colours:** the entry holds no palette or index. Each 2-bit value selects one of four palette indices in a table in the EXE's initialised data at `0x175ed8`, passed by `0x4d010`.
- **Drawing (Confirmed, EXE):** `0x5bfc0` (HI) writes every pixel of the frame to the screen at (x0, y0 + 1) of the display. `0x5c098` (LO) draws every second row and column. `0x4d010` picks the frame from the game time, wrapping at the frame count.
- **Capture (Confirmed):** in `srangers_068.png`, all 9,216 pixels of the left display at (x0, y0 + 1) equal frame 6, read through the EXE table under the flight palette. No other accepted forward view shows a frame (best 3.8%).
- **When it is drawn (Confirmed, EXE; meaning of the states Likely):** the left-display dispatcher `0x4ce30` keeps a table at `0x175c7c` of seven page entries: the status display `0x4d0e0`, the bar page `0x4d800` (the energy page of `srangers_100.png`), three entries for `0x4da28`, one for `0x4dc50`, and the Warp page `0x4dcec`. Each entry holds the page's handler, a refresh period and a subsystem index (all pages but the Warp page). `0x4ce30` reads that subsystem's state with `0x52ac4`, the same function `0x4d50c` uses to choose the status overlays. While the state is 2 it draws the SNIP instead of the page. While the state is 1 it switches between the SNIP and the page at random intervals of 64–127 ticks. The pages' subsystems are fields 10 (status), 11 (energy) and 13 (communications and messages); damage raises them and repair or rescue clears them, and fields 10 and 13 never exceed 1 through damage, so those pages flicker but are never replaced for good (Confirmed, code, [D6](./executable.md#d6-two-bit-subsystem-fields--confirmed-code-meanings-likely-consumers), [D15](./executable.md#d15-left-display-pages--confirmed-code)). The SNIP is therefore the display's interference animation when the display is damaged (Likely for the appearance).
- **Right (target) display (Confirmed, EXE and capture, P2-12/30):** the type-7 draw handler `0x42d80` does the same for the right display (the target fields it shows and the target clears it makes: [T7](./executable.md#t7-right-target-display-confirmed-code)). It reads the state of subsystem 14 with `0x52ac4`; at state 2 it draws the SNIP through `0x4d010` instead of its own content, and at state 1 it switches between the two at random intervals of 64–127 ticks. In the recaptures `srangers_132.png` and `srangers_133.png`, all 9,216 pixels at (x0, y0 + 1) of the type-7 instrument rectangle, (491,347), equal frame 5; in `srangers_135.png` the left display equals frame 0.
- **User observation (2026-10-08, not independently verified):** the user reports from play that this interference picture appears after some parts of the craft are damaged. It agrees with the Likely reading above; the confidence of the state meaning is unchanged.
- **Conversion (P2-07 revision, 2026-10-08):** the import converts the 9 frames as opaque images `image/hud/display-interference/frame-<i>` under the flight palette. The colour table is read from the executable at `0x175ed8` (LE object 4, offset `0x5ed8`, 4 bytes); every byte value is a valid index of the 256-entry palette. In a local check of [P2-07 subtask 21](../../plan/p2/07/subtasks/21-snip-diag-local-check.md#完成证据), the production frames equal an independent decode of the entry and the table, and frame 6 through the production palette equals all 9,216 pixels of the left display at (58,347) in `srangers_068.png`.
- **P2-12 recheck (P2-12/31, 2026-10-08, Confirmed):** checked on the P2-12 candidate at commit `8ca0ed3` (converter version `osr-import.graphics-3.logic-1.audio-1.models-3`; build and content identity equal to the candidate P2-12/29 recorded at `02fd66f`). An independent reading uses the structure above, reads the table with its own LE region reader and uses the DATA palette. The production job's nine frames equal it, both as payload indices and as the viewer's expanded pictures. Each frame is opaque, uses `direct` display and depends only on the flight palette. The comparison place is (x0, y0 + 1) of the type-6 instrument rectangle, which the CCKD record puts at (58,347). On the 108 accepted P2-12 baselines, frame 6 in `srangers_068.png` is the only exact placement of any frame (all 9,216 pixels). On the other 39 forward views, no frame matches more than 3.8% of the display, as P2-12/27 found. In the P2-12 coverage check, frame 6 is compared directly. Frames 0–5, 7 and 8 rest on the same source and the same conversion rule. Scripts are in the ignored `local/research/p2-12/snip/` and `local/research/p2-12/hud/`. With the recaptures (P2-12/30, same candidate) frames 0, 5 and 6 are compared directly (right display above); frames 1–4, 7 and 8 still rest on the same source and rule.

### DIAG 10489 (Confirmed structure, P2-07 revision)

Read-only research of [P2-07 subtask 19](../../plan/p2/07/subtasks/19-snip-diag-research.md#完成证据), 2026-10-08: the entry's bytes and relocations locally, and the users `0x4d0e0`, `0x4d308`, `0x4d44c`, `0x4f050` and `0x4f108` disassembled in memory from the existing Ghidra project without saving it. Only structure, offsets, counts and addresses are recorded; no text.

The HUD set loads DIAG 10489 for HI and DIAG 10491 for LO (`0x4ca80`). Both have the structure below; 10489 is 489 bytes with 31 relocations, 10491 352 bytes with 27 (no startup messages). Every pointer is an entry-relative offset, relocated when the entry is loaded, and the relocations are exactly the pointer fields (both entries).

| Offset | Content |
|---|---|
| +0x00, +0x04 | u32 timings of the upper line: ticks per typed character, then ticks the finished message stays |
| +0x08, +0x0c | The same for the lower line |
| +0x10 | 4 u32 pointers: the upper line's formats |
| +0x20 | 5 {u32 pointer, i32 maximum} ratings |
| +0x48 | 15 u32 pointers: subsystem names |
| +0x84 | 3 u32 pointers: state words, by subsystem state 0–2 |
| +0x90 | u32 pointer to the startup message list (0 when there is none) |
| +0x94 | u32 count of startup messages (3 in 10489, 0 in 10491) |
| +0x98 | NUL-terminated texts; in 10489 the startup list (3 u32 pointers) lies among them, not 4-byte aligned |

- **Texts:** NUL-terminated byte strings in the entry. A `\n` byte splits a message into lines: `0x4f050` copies the message and replaces each one with NUL, and `0x4f108` draws the parts on successive lines. The formats hold printf-style conversions. `tools/nob-check.ts` reads 30 texts from 10489 and 27 from 10491, at most 22 bytes long.
- **Display (Confirmed, EXE):** `0x4d0e0` keeps one message per line and asks for the next when the current one has been typed out and its hold time has passed. `0x4f050` stores the line's timings; `0x4f108` types one more character each interval, then blinks the cursor ([sources](#sources-of-the-unidentified-elements-p2-1227)) until the hold time ends. Each line uses a fixed palette index from the code.
- **Timing (Confirmed, code, P3-13/03):** +0x00/+0x08 are typing intervals and +0x04/+0x0C hold times, in clock units. A step is due when next ≤ sample (unsigned, **not strict**, unlike the page refresh). Each `0x4f108` call advances at most one step and never catches up: while typing it shows the next visible character (a NUL made from a line break is passed in the same step); once typed it toggles the cursor each step; next := sample + interval. With interval 0 every call types a character or toggles. The call that finishes typing sets hold end := sample + hold; when hold end ≤ sample the line is released after that call's draw and the next call generates a new message. The cursor starts visible; it is a one-pixel outline of advance × height in the text colour. Typing, the cursor and the blink advance only while page 0 actually runs (not on other pages, not while its interference is on, not outside the cockpit views); the view rebuild `0x4cd68` releases both current messages but keeps the cycle indices. At 2 units per tick and one page-0 call per tick, interval k gives a step every max(1, ⌈k/2⌉) ticks (code level, U-021).
- **Upper line (`0x4d308`, Confirmed):** cycles format 0–3 (jump table `0x4d2f8`), formatting each at generation time with one value: 0 is 100 × shield ÷ c5C (signed truncation), 1 is max(0, 100 × hull ÷ c9C), 2 a rating text, 3 the player object's +0x28 (raw energy). The rating: the states of 19 subsystems (`0x52ac4`) are summed and the pairs are searched from the last to the first; the first whose maximum is not below the sum gives the text. When the sum exceeds every maximum the search reads the pointer before the table, which is format 2's own pointer (DIAG +0x18), so format 2 is formatted with its own bytes as the `%s` argument: the result depends only on the imported entry (Confirmed, code, P3-13/03). That needs a sum above the largest maximum (above the low twenties locally); with field 10 and 13 at most 1 through damage and the other 17 at most 2 the sum can reach 36, so heavy damage reaches it (reachability Likely). Formatting uses an 80-byte stack buffer.
- **Lower line (`0x4d44c`, Confirmed):** while the startup count is nonzero, each new lower message first draws one rand; when its low byte is below 0x55 (85/256) it shows the next startup message in turn. Nothing writes +0x94 (the only users of the DIAG pointer are `0x4ca80`, `0x4cc88`, `0x4d308` and `0x4d44c`), so the startup messages keep recurring at that probability for the whole mission (P3-13/03). Otherwise it cycles subsystem 0–14 and formats its name and the word of its current state with a format in the executable at `0x171e58` (LE object 4, offset `0x1e58`, 6 bytes with its NUL; two `%s` separated by a line break, so name and state word take one line each), not in the entry. A state of 3 would index past the state words (no writer, Likely unreachable). The three cycle indices `0x175ee8`, `0x175eec` and `0x175ef0` are touched only by these two routines and are kept across missions.
- **Conversion (P2-07 revision, 2026-10-08):** the import converts DIAG 10489 with that format into the `data` Asset `data/hud/status-display/messages` ([status display messages payload](../../engineering/modules/content.md#状态显示屏文字-payload)). The texts keep their bytes exactly. LO's 10491 is not converted; `tools/nob-check.ts` checks both entries.
- **P2-12 recheck (P2-12/31, 2026-10-08, Confirmed):** on the same candidate as the SNIP recheck, the Asset is a `data` Asset without dependencies and the only one of its role. Read with the content reader, it equals an independent reading of the entry and of the format region (the script's own LE region reader): the timings, the rating maxima and all 31 texts. The independent reading also confirms the structure in both entries. The relocations are exactly the pointer fields, and every pointer names a NUL-terminated text at or after +0x98. From +0x98 to the end, the texts with their NULs and the startup list cover every byte.

### Slice screen coverage and HUD image families (R3, R4, R6)

Research of [P2-07 subtask 09](../../plan/p2/07/subtasks/09-hud-family-research.md#完成证据), 2026-10-06, on the reference screens `srangers_002.png` (F1) and `srangers_059.png` (Map).

**Method:**

- **Full search:** every decodable image record of `SR.NOB` is searched for exact placements on both screens. That is 231 records: whole TEX and BITM entries, MFDD lists, CCKD elements and TABL image lists, with none undecodable. F1 is searched under the flight palette and the map under its group palette, with index 0 opaque and (raw records only) transparent: 880 readings. In 24 readings no pixel is opaque. 56 readings have one opaque colour; each matches somewhere, but such a record matches any area of its colour, so it cannot identify an element. Exact placements of multi-colour readings:
  - on F1, CCKD 10103 slot-0 elements 1–3 (the bottom panel, element 0, is covered by instruments; [cockpit](./cockpit.md#front-cockpit-source-r1));
  - on the map, the four slot-2 frame elements (10103, and the identical copy in 10101);
  - on the map, TABL 10461 records 7–10, 12, 13, 16 and 19 at 7 places, all inside 4 red ring markers (two places in three of them, offset by 3 pixels);
  - on the map, TABL 11401 record 17.
- **Wider capture set:** the composites classify 34 of the 92 local captures as HI forward views and 5 as map screens. On these, candidate families are searched exactly, and matched partially at their drawing places.
- **Scripts:** in the ignored `local/research/p2-07/`. Placements stay in their local output.

**Coverage of the reference screens:** confidence of each classification as in [the P2-07 rules](../../plan/p2/07/spec.md#研究与入选门槛). "Code drawing" rests on shape evidence plus the absence of any matching multi-colour record; the EXE paths for these elements were not traced.

| Screen | Visible element | Class | Confidence | Evidence |
|---|---|---|---|---|
| F1 | Cockpit panel, side struts, thin strip, frame of the Warp lamp | Packed bitmap: CCKD 10103 slot 0 | Likely | [cockpit](./cockpit.md#front-cockpit-source-r1); elements 1–3 exact |
| F1 | Warp indicator | Font text (run F1-05); its frame is in the panel | Likely | The 82 pixels that differ from the panel inside the Warp instrument rectangle are exactly F1-05's set pixels ([§1.2](#12-fonts-used-on-the-reference-screens-r7)) |
| F1 | Status display (left), image | Packed bitmap: MFDD 10473 list-0 background; no list-1 record shown | Confirmed | Drawing path above; comparison below |
| F1 | Status display, marks after runs F1-07 and F1-08 | Code drawing: the message cursor | Confirmed | Two marks in the next character cells; no glyph matches them. P2-12/27 traced them ([sources](#sources-of-the-unidentified-elements-p2-1227)) |
| F1 | Target display (right): grid and marker lines | TEX 11089 stretched as the 3D scene's background, the target's single-colour silhouette and fonts/0 text | Confirmed (P3-13/04) | Every non-text, non-model pixel on 49 captures equals the stretched background ([§4.5](#45-right-display-type-7)) |
| F1 | Gauges in the four corner areas: level stripes | Code drawing: the shaped bars of `0x417a4` (types 0–3) | Confirmed (code and 204 capture fits, P3-13/02) | Horizontal one-pixel stripes ([§4.2](#42-corner-gauges-types-04)). TABL 10479, the "gauge bar" images, are drawn only on the energy page (`0x4d800`), not in the corners |
| F1 | Radar rings (no crosshair) | Code drawing: `0x40b7c` | Confirmed (code and 51 captures, P3-13/02) | Three full circles, four short arcs at half radius across the axes and the centre pixel; no line ([§4.3](#43-radar-type-5)) |
| F1 | Radar contacts | Code drawing | Confirmed | Only single-colour records match there (non-unique). P2-12/27 traced the radar handler ([sources](#sources-of-the-unidentified-elements-p2-1227)) |
| F1 | Aiming reticle in the view | Code drawing: `0x466b4` in the overlay `0x45de0` | Confirmed (code and 46 captures, P3-13/04) | Partial circle and tick lines ([§4.6](#46-flight-view-overlay-0x45de0-and-view-label)) |
| F1 | Message line and the strip above the target display | Nothing drawn in this capture; the rectangles belong to the message line (type 8) and the two warning labels (type 9) | Confirmed (code, P3-13/05 and /07) | No pixel of either instrument rectangle differs from the panel (3,111 and 584 pixels): the queue was empty and no warning flag was set ([§4.7](#47-message-line-type-8), [§4.8](#48-indicator-strip-type-9-and-warp-lamp-type-12)) |
| F1, Map | Text | Font text; two map places unidentified | Likely | [§1.2](#12-fonts-used-on-the-reference-screens-r7). On F1, a colon glyph in the next cell after F1-06 is also matched by both 8×8 fonts, and its code is mapped |
| Map | Frame, including the button labels | Packed bitmap: CCKD 10103 slot 2 | Confirmed | [cockpit](./cockpit.md#group-palette-and-drawing-confirmed) |
| Map | Grid | Code drawing: `0x4ab08` | Confirmed (code and 10 captures, P3-13/06) | One-pixel lines ([§4.9](#49-strategic-map-type-10)) |
| Map | Fog and covered areas | Code drawing | Likely | Uniform filled discs |
| Map | Range ring, target line, selection box | Code drawing: hostile ring `0x4ad1c`, the player-to-cursor line `0x4c674`, the pointer box `0x4c8b0` | Confirmed (code and captures, P3-09/04, P3-13/06) | Ring, line and rectangle outline ([§4.9](#49-strategic-map-type-10)) |
| Map | Mouse cursor | No separate cursor drawn | Likely | No pointer shape other than the selection box, which follows the mouse ([B-001](../behavior/B-001-strategic-map.md)) |
| Map | Small unit markers in the main map area | Packed bitmap: TABL 10461 | Confirmed | Drawing path above; in screenshots only non-unique (single-colour) matches |
| Map | Ring markers in the main map area | Code drawing | Confirmed | No record matches a whole ring. Two-colour 10461 records match inside four of them, at 7 places (two in three of them), so those matches are not unique. P2-12/27 traced the circles ([sources](#sources-of-the-unidentified-elements-p2-1227)) |
| Map | Zoom window icons | Packed bitmap: TABL 11401 | Confirmed | Drawing path above; record 17 exact |
| Map | Box around a zoom window icon | Code drawing | Confirmed | `0x4abe4` draws it after the icon |

Elements left unidentified here were judged by P2-12 ([impact](#unidentified-elements-and-the-u-030-impact)); finding no source does not by itself hand an element to P3.

**Outside the reference screens:** in seven other forward views, the left display shows BITM 10467 at (58,347). The HUD set also loads SNIP 10487, an animation drawn into a display, and DIAG 10489, the status display's message strings. Neither is an image record list, so P2-07/09 did not convert them (U-030). Their structure and use are now known ([SNIP 10487](#snip-10487-confirmed-structure-p2-1227), [DIAG 10489](#diag-10489-confirmed-structure-p2-07-revision)), and a P2-07 revision (2026-10-08) converts both.

**Image families:** every candidate family is included unless there is at least Likely evidence that the slice does not use it ([P2-07 rules](../../plan/p2/07/spec.md#研究与入选门槛)). Choices marked Confirmed rest on the drawing paths above.

| Family | Use | Palette | Transparency | Rows | Decision |
|---|---|---|---|---|---|
| Status display backgrounds, MFDD 10473 list 0 | Confirmed: `0x4d50c` chooses records 0–2 | Flight (Confirmed) | Opaque (Confirmed). Screenshots cannot show it: the 71 index-0 pixels of each record lie at the same positions, all over panel pixels of entry 0's colour | Stored (Confirmed) | Included, delivered |
| Status display overlays, MFDD 10473 list 1 | Confirmed: `0x4d50c` chooses them per subsystem state | Flight (Confirmed) | Colour key 0 (Confirmed) | Stored (Confirmed) | Included, delivered |
| Left-display page background, BITM 10467 | Confirmed: `0x4d800`, `0x4da28`, `0x4dcec` | Flight (Confirmed) | No index-0 pixels; drawn opaque | Stored (Confirmed) | Included through a [spec revision](../../plan/p2/07/spec.md#审批); delivered |
| HI gauge bars, TABL 10479 | Confirmed: `0x4d800` | Flight (Confirmed) | Colour key 0 (Confirmed) | Stored (Confirmed); `0x4d800` draws only the top rows (but see the [energy page](#slice-coverage-check-and-u-030-impact-p2-12)) | Included, delivered |
| Map unit markers, TABL 10461 | Confirmed: `0x49f8c` | Map group palette (Confirmed) | Colour key 0 (Confirmed). Records 20–25 are entirely index 0 and draw nothing | Stored (Confirmed) | Included, delivered |
| Zoom window icons, TABL 11401 (all 29 records) | Confirmed for the list: `0x49f8c` draws the record a unit field selects. Which records the slice's units select is R8's question | Map group palette (Confirmed) | Colour key 0 (Confirmed) | Stored (Confirmed) | Included, delivered |
| MFDD 10475, BITM 10469, TABL 10481 | Loaded instead of 10473, 10467 and 10479 only in view mode 6, the base interior (P3-01/10). The reference forward view shows 10473 | — | — | — | Excluded (Confirmed: not in flight) |

**Comparisons:** non-zero pixels of the record under the stated palette, at its drawing place.

| Family | Screens and place | Compared / matching | Differences |
|---|---|---|---|
| 10473 list 0 | `srangers_002.png`, record 0 at (58,347) | 9,145 / 8,842 | Of all 9,216 pixels, 304 differ: 268 in runs F1-06–08, 8 in the colon glyph and 28 in the two unidentified marks. Over the 34 forward views, record 0 matches at least 95% in 18 and record 1 in 1 (at most 97.4% and 95.2%); record 2 at most 77.5% |
| 10473 list 1 | 34 forward views at (58,347) | 132–1,034 per record; at most 8.2% | None shown |
| BITM 10467 | Seven forward views at (58,347) | 9,216 / 7,620–8,719 | In six views the differences lie in 7-row bands at a 9-row pitch (text lines); one view also has unclassified blocks. Not used as evidence of the drawing rules |
| TABL 10479 | 34 forward views, the four corner gauge areas; top 6 rows within the left display on the seven 10467 views | At most 5%; no top-row match | None shown. Those views Likely show the other text pages |
| TABL 10461 | `srangers_059.png`, main map area | Two-colour records 7–10, 12, 13, 16, 19 (identical, 6 pixels): 7 exact places | Not unique, see the coverage table |
| TABL 11401 | Zoom window: `srangers_059.png` record 17 once; record 7 at 5 places on `srangers_000/001/004.png`; record 14 at 8 places on `srangers_000/001/004/088.png` | 120, 123 and 80 per place; all match | None. On `srangers_001.png`, 39 index-0 pixels at each of two record-7 places show the box drawn after the icon |
| MFDD 10475 | 34 forward views at (58,347) | 9,145 per background; at most 8.6% (overlays at most 7.0%) | Not shown |
| BITM 10469 | 34 forward views, both displays | At most 7% | Not shown |
| TABL 10481 | 34 forward views, the four corner gauge areas | At most 5% | Not shown |

The LO families (MFDD 10477, BITM 10471, TABL 10483) are outside the slice (HI only). The earlier purpose labels in §2 (radar blips for 10461; craft icons, blips and symbols for the 11401 intervals) were visual guesses; the drawing paths replace them.

**R4 (Confirmed):** in HI the status display is MFDD 10473 unless the view mode is 6 (the base interior), which selects 10475; the slice's reference view shows 10473. The condition was read as a craft type byte until P3-01/10. List 0 is drawn opaque and list 1 with colour key 0.

**R6 (bounded check):** TABL 10165 holds 33 records that decode through its pixel pointers, each with at least two colour indices. None has an exact placement in any of the 92 captures, at scale 1 or 2, under the flight or map palette. The program loads 10165 only in `0x38ff4`, within a distance threshold of an object and together with a screen-mode change. It is therefore Likely not part of the reference screens, and its remaining questions pass to P4 (U-030). P3-01/10: the load is the docking step (`0x38ff4` sub-command 0), and the records' structure and use are in §2 above.

### Zoom window icons by craft type (R8)

Research of [P2-07 subtask 11](../../plan/p2/07/subtasks/11-map-icon-research.md#完成证据), 2026-10-06 (addresses and roles only).

**Rule (Confirmed, EXE):**

- For each unit, the map drawer `0x49f8c` reads the unit's runtime kind and stores its bit position as both the 10461 marker index and the 11401 icon index. The kind is a single bit at runtime +4 ([executable](./executable.md#player-target-modes-and-enemy-classification)). One object referenced by the map state instead gets 10461 record 28; its 11401 index stays the bit position.
- For a model-backed craft kind, as in mission and wingman records, the bit position is its M2ID slot ([scenario](./scenario.md#p2-slice-candidate-evidence), `0x65ca4`).
- The same code tests the kind against the friendly-plus-player mask `0x6c87f`.

A craft's zoom window icon is therefore the 11401 record whose full-list index equals its M2ID slot. Other runtime kinds use the record at their bit position, which is not an M2ID slot.

**Selected mission:** SCCT group 0, slot 1 (SCEN 3019). It references M2ID slots 0, 7, 8, 14 and 17 ([scenario](./scenario.md#campaign-candidate-source-profiles-confirmed-structure)); the wingman roster adds slot 1, as in P2-09's craft binding.

| M2ID slot | 11401 record | Confidence | Seen in the captures |
|---|---|---|---|
| 0 | 0 | Confirmed (EXE rule) | Exact once on `srangers_104.png` (P2-12) |
| 1 | 1 | Confirmed (EXE rule) | Exact once on `srangers_104.png` (P2-12) |
| 7 | 7 | Confirmed (EXE rule) | Exact at 5 zoom window places on `srangers_000/001/004.png`; P2-12: 11 places on 6 captures, adding `srangers_104/105/107.png` |
| 8 | 8 | Confirmed (EXE rule) | Exact at 4 places on `srangers_105/107.png` (P2-12) |
| 14 | 14 | Confirmed (EXE rule) | Exact at 8 zoom window places on `srangers_000/001/004/088.png`; P2-12: 11 places on 6 captures, adding `srangers_104/105.png` |
| 17 | 17 | Confirmed (EXE rule) | Exact once on `srangers_059.png`; P2-12: 5 places on 3 captures, adding `srangers_104/106.png` |

The P2-12 placements are in the right-hand panel of the map ([below](#slice-coverage-check-and-u-030-impact-p2-12)); each record is multi-colour and the only one of its family placed there. In `srangers_105.png` the user named the zoom window's icons by craft type (P2-12/30): the second enemy type, the first enemy type and Xpon, in agreement with records 8, 7 and 14 placed there.

Records 20–28 correspond to bit positions 20–28. M2ID slots 20 and 21 are empty, and kinds 22, 24 and 25 are runtime kinds outside the M2ID table ([executable](./executable.md#player-target-modes-and-enemy-classification)). Canonical content has no craft-to-icon lookup table; P3 defines the map drawing rules (P2-07 technical decision 7). Scripts: `local/research/p2-07/ghidra/` (`ListRange` over the unit loop) and the family searches of subtask 09.

### Slice coverage check and U-030 impact (P2-12)

Research of [P2-12 subtask 17](../../plan/p2/12/subtasks/17-hud-texture-coverage.md#完成证据), 2026-10-07/08, on the P2-12 candidate (commit `97b70de`, converter version `osr-import.graphics-2.logic-1.audio-1.models-2`). An independent reader is compared with the production import: it shares only the verified disc and IMFAT readers, and re-implements image records, palettes, CCKD, MFDD, TABL, MODL, M2ID and the [nearest-colour rule](./textures.md#nearest-colour-metric-and-tie-rule-confirmed) from these documents. Baselines are 108 captures (the 92 frozen by P2-12/13 and the 16 accepted by P2-12/15): 40 HI forward views and 9 map screens among them. Scripts and the coverage table are in the ignored `local/research/p2-12/hud/`; only IDs, file names and counts are recorded.

**Same source (Confirmed):** all 100 slice images equal the independent read pixel for pixel when read as the [drawing paths](#hud-and-map-drawing-paths-confirmed-exe) draw them. The 20 palettes and the 3 fonts (glyph bytes, cell, 8-byte stride and the §1.1 character maps) are identical.

**Direct comparisons at the confirmed drawing places:**

- **Left display:** at (x0, y0 + 1) of the type-6 instrument rectangle, 38 of the 40 forward views are identified, each needing a match share of at least 0.9 outside text and a lead of at least 0.1 over the next picture. Status background 0 shows in 29, background 1 in 2 and the page background BITM 10467 in 7.

  | Picture | Exposed and identical in at least one capture | Never exposed | Of those, under text in every capture | Under unidentified marks or graphics |
  |---|---:|---:|---:|---:|
  | Status background 0 | 8,725 of 9,216 | 491 | 485 | 6 |
  | Status background 1 | 8,356 of 9,216 | 860 | 858 | 2 |
  | Page background (BITM 10467) | 8,601 of 9,216 | 615 | 564 | 51 |

  Pixels never exposed rest on the same-source read. None of them is unidentified residue in two or more captures, the pattern a local conversion fault would leave.
- **Status overlays (MFDD list 1):** overlay 6 in `srangers_102.png` (297 uncovered pixels) and overlay 7 in `srangers_101.png` (826) match with no difference, drawn with colour key 0. The R3 search had found none shown.
- **Damage recaptures (P2-12/30, candidate `8ca0ed3`):** in the user's recaptures `srangers_129.png`–`135.png` the left display is identified in each (match share at least 0.996).
  - Background 2 shows in `srangers_133.png` and `134.png` (7,688 of its 9,216 pixels exposed and identical in at least one), background 1 also in `132.png`.
  - Overlays 0 (`131`, `132`, `134`), 1 (`129`, `130`, `133`, `134`) and 4 (`132`, `134`) match with no difference where drawn and not covered by text or the message cursor (2,886, 2,626 and 680 pixels).
  - Several overlays can be drawn at once: `132.png` shows overlays 0 and 4, `134.png` overlays 0, 1 and 4. Where overlays 0 and 1 overlap in `134.png`, overlay 0 is on top (Confirmed for this pair; the drawing order of the other overlays is not established). Each overlay marks one part of the craft.
  - **User observation (2026-10-08, not independently verified):** each damaged part has its own overlay; with several damaged parts the display alternates between them (`130.png` and `131.png` are two such frames) or shows several together. `0x4d50c` chooses the overlays per subsystem state and blinks some of them (above); which state gives which behaviour is Unconfirmed.
  - **Backgrounds are not damage levels (user observation):** the user reports that `srangers_017.png` and `037.png`, which show background 1, had no damage. The two fields whose ratio selects the background (`0x4d50c`) remain Unconfirmed.
- **Gauge bars on the energy page:** in `srangers_100.png`, TABL 10479 records 1 and 2 are placed whole inside the left display (all 451 and 475 opaque pixels, multi-colour). This fits `0x4d800` (Confirmed, P2-12/27): the row it omits is the last, which is colour key 0 in all four records. Both records sit exactly at its two places, including the 7 pixels each of its extra column ([above](#hud-and-map-drawing-paths-confirmed-exe)).
- **Zoom window icons:** see [R8](#zoom-window-icons-by-craft-type-r8).
- **Map unit markers:** the two-colour 10461 records 7–10, 12, 13, 16 and 19, which are identical to each other, are placed exactly on all 9 map screens; record 27 (identical to 11401 record 27) once each on 3. With at most 9 pixels, these placements corroborate but do not identify.
  - **Identified by the units (P2-12/30):** the user named the units in the zoom window of several map screens (Xpon, the first and second enemy types). Inside the pointer rectangle of the main map, which bounds the zoom window's area, `srangers_105.png` and `107.png` show exactly two single-colour plus shapes where the zoom window shows two Xpons, and three two-colour markers where it shows four enemy craft (one hidden by an overlap); `srangers_088.png` shows two plus shapes for its two Xpons, and `000.png` two plus shapes and one two-colour marker for two Xpons and one first-type enemy. So the Xpon marker (record 14, identical to records 1–6, 11, 15, 17 and 18) and the enemy markers (records 7 and 8, identical to each other) are compared at identified units (Confirmed for these placements). The player's marker (record 0, not identical to any other) is covered by the leader lines and labels drawn after it on every map screen.
  - **Record 27 (the map-state point):** `0x49f8c` draws 10461 record 27 at the point the map state holds at +0x10 while its flag byte at +0 is set, the same point the zoom-window box test compares with (box row below; Confirmed, EXE). Its three placements (`srangers_004/088/107.png`) each sit next to the energy-cost text. That point is the stored destination: it is written only by the player's instantiation (zero), by the left-button select `0x2b9bc` and by `0x2bd74` (its z), and the flag byte is set only by the first select, so record 27 marks the last selection whether or not a Warp followed (Confirmed, code, P3-09/02, [marker](./executable.md#cursor-destination-and-marker-p3-0902)). The user's report that no Warp target had been set in `srangers_004.png` is therefore Likely a selection without a Warp.
  - **Record 26 (Likely the pointer mark):** `0x49f8c` draws 10461 record 26 at the screen point stored at `0x1864a0` when the flag at `0x1864a4` places it in the main map or the zoom window. No placement was found on the accepted map screens.
- **Fonts:** all 26 runs of [R7](#12-fonts-used-on-the-reference-screens-r7) are found again, with the same font, glyph counts and set-pixel totals. The search covered the instrument rectangles of types 6, 7, 8, 9 and 12, both sides of the crosshair, and the map's type-10 rectangle:
  - `font/hud/8x8-1`: 205 runs on 40 captures, 813 glyphs, advance always 8 pixels;
  - `font/hud/8x8-2`: 416 runs on 49 captures, 1,797 glyphs, advance always 6 pixels;
  - no matched glyph sets a pixel outside its cell;
  - `font/hud/4x6`: no run in these regions. Other screens, such as F2 and the communications menu, were not searched, so where it is used remains Unconfirmed.
- **Coverage limit (P2-12/17):** damage-state, page-bar, missile-image, 4×6-text and map-marker captures (P2-12/15, C-07 to C-10) were deferred by the user. 23 images, `palette/missile` and `font/hud/4x6` therefore had only same-source evidence.
- **After the recaptures ([P2-12/30](../../plan/p2/12/subtasks/30-deferred-recaptures.md#完成证据), same candidate as the rerun below):** background 2 and overlays 0, 1 and 4 are compared directly (above). Overlays 2, 3, 5 and 8 and gauge bars 0 and 3 rest on the same source and conversion rule as the directly compared members of their families (overlays 0, 1, 4, 6, 7; bars 1, 2). Map markers 7, 8, 14 and 27 are compared at identified units or at the map-state point (above). Markers 0, 26 and 28 and zoom icons 26–28 (identical to markers 26–28) rest on the map families' rule. The missile image is judged with its effect view. `font/hud/4x6` equals its source but is not drawn in HI (§1.1).
- **Rerun on the later candidate ([P2-12/31](../../plan/p2/12/subtasks/31-hud-resource-gap.md#完成证据), commit `8ca0ed3`):** the check now covers 109 images, including the nine SNIP frames of the P2-07 revision. The 123 earlier items have unchanged payloads and keep their verdicts. All nine frames equal the independent reading. With them as candidates for the left display, 39 of the 40 forward views are identified, `srangers_068.png` as frame 6. The font runs, the R7 cross-check and the U-030 search give the same results as before.

#### Unidentified elements and the U-030 impact

**Search (P2-12/17):** every one of the 231 decodable `SR.NOB` records was placed whole in each region under the screen palette (index 0 opaque, and for raw records also colour key 0), TEX and BITM records also under their own palette, and TEX records also under the nearest DATA colours; single-colour readings were only counted. Sub-images, cropped or composed drawing, SNIP frames and EXE drawing were outside the search, so a miss does not exclude a source.

| Element | Observation | Source (P2-12/27) |
|---|---|---|
| Status display: marks after text (R3) | 58 single-colour marks on 31 forward views; 52 are 17 pixels in a 6×8 box, 3 are 28 pixels in a 12×8 box with a 2×2 block. No code of the three HUD fonts or of the menu font (`OPTIONS.NOB` TABL 5007) covers any of them under §1.2's rule; no whole record is placed there | Code drawing (the message cursor) and single glyphs of the message text |
| Left display content in `srangers_068.png` | Not identified: 4 colours; the four converted display pictures match at most 0.8% outside text, and any `SR.NOB` record at the display origin at most 48.5% | SNIP 10487, frame 6; not in that candidate, converted by the P2-07 revision and matched on the later candidate ([P2-12/31](#snip-10487-confirmed-structure-p2-1227)) |
| Left display: stripes on the energy page (`srangers_100.png`) and a dotted bar during a Warp (`srangers_066.png`, 655 pixels) | Left after the page background (77.5% outside text on the energy page) and the gauge bars | Code drawing (bar lines) |
| Radar contacts (R3) | On 11 of the 40 forward views, 4×3 shapes in the radar rectangle (type 5) equal single-colour 10461 records: record 0 and those identical to it (1–6, 11, 14, 15, 17, 18), and record 28 with the identical 11401 record 28. No multi-colour record matches | Code drawing (contact shapes) |
| Map: ring markers (R3), the box around selected units and the information window above the zoom window ([B-001](../behavior/B-001-strategic-map.md#交互已确认)) | In the main map only the two-colour 10461 records, 10461 record 27 and 11401 record 27 are placed; in the right panel only 11401 records 0, 1, 7, 8, 14 and 17. No whole record forms a ring, a box or the window's content | Code drawing (circles, icon boxes) and text in `font/hud/8x8-2` |

##### Sources of the unidentified elements (P2-12/27)

Read-only analysis of `SRANGERS.EXE` in the existing Ghidra project, 2026-10-08, with every path checked against the accepted captures. Scripts and outputs are in the ignored `local/research/p2-12/u030/` (`verify.ts`). Only addresses, structure, counts, file names and verdicts are recorded; palette indices and positions stay in the local output.

**Instrument handlers (Confirmed, EXE):** `0x49db4` registers a handler set per instrument type, and `0x49b2c` calls the draw handler of each instrument record of the active cockpit slot. The draw handlers include the corner gauges `0x4117c`, `0x41238`, `0x4131c`, `0x41484` and `0x415d0` for types 0–4 (speed, commanded speed, energy, shield, hull; [D16](./executable.md#d16-hud-full-scales--confirmed-code-for-operands-drawing-p3-13)), `0x401e8` for type 5 (radar), `0x4ce30` for type 6 (left display), `0x49f8c` for type 10 (strategic map), `0x4e6c0` for type 8 (the scrolling message line) and `0x4f2a0` for type 12.

| Element | Drawing path (Confirmed, EXE) | Graphic read | Capture check (Confirmed) | Routing |
|---|---|---|---|---|
| Status display: marks after text | `0x4d0e0` draws the top message at (x0 + 4, y0 + 5) and the bottom message at (x0 + 4, y1 − 20), both with `0x4f108`, in font 1 (`font/hud/8x8-2`) with an 8-pixel line pitch. `0x4f108` types the message out one character at a time. After the last drawn character it draws a one-pixel rectangle outline (`0x5a170`) as wide as the font's advance and as tall as its height (6×8), in the text colour, while a blink flag is set. The flag toggles once the message is complete | None | All 52 marks of 6×8 are the full 24-pixel outline of the cell one advance after the last glyph, in the text colour, on the message grid. 47 follow a detected run (one of them with 3 further pixels inside the outline, not traced) and 5 follow a glyph outside any run. Each 12×8 mark is one mapped glyph of both 8×8 fonts followed by the cursor; each 2×2 block is a detached part of that glyph. Five fixed 5×1 marks are single mapped glyphs on the grid. P2-12/17's 17-pixel count came from 4×6 glyphs matching part of the outline as text | P3: dynamic HUD drawing |
| Left display in `srangers_068.png` | The SNIP drawn by `0x4ce30` → `0x4d010` → `0x5bfc0` instead of the page: always while the page's subsystem state is 2, at random intervals while it is 1 ([SNIP 10487](#snip-10487-confirmed-structure-p2-1227)) | SNIP 10487, not converted at the time | Frame 6 matches all 9,216 pixels | P2-07: resource gap, since closed (impact below) |
| Energy page stripes | `0x4d800` calls `0x4d6f0` for three bars: one at the display's middle and one each at x0 + 8 and x1 − 8, each in its own fixed palette index. `0x4d6f0` draws horizontal one-pixel lines (`0x5ad00`) every second row from y1 − 3 upward, as many as the bar's value allows. Each line's half-widths come from a 50-entry table that `0x4ca80` builds from a cubic curve, truncated (`0x74518` chops) and clamped to 5–45 pixels. The side bars keep a fixed 5 pixels on their outer side | None | `srangers_100.png`: of the 2,587 pixels that differ from the page background outside text, 1,900 are the predicted stripe pixels in the predicted colours and 687 belong to the two gauge records; none is left, and every predicted stripe pixel outside text is shown | P3 |
| Warp dotted bar | The Warp page `0x4dcec` calls `0x4e018` for three bars across the display (x0 + 2 to x1 − 2): one at y1 − 40 filled from both ends, one at y1 − 26, and a completion bar at y1 − 12. `0x4e018` draws vertical one-pixel lines every second column, 13 pixels tall (11 for the last bar), each bar in its own fixed index, then its label. The page also draws a history graph whose ticks fall every third column | None | `srangers_066.png`: the 655 pixels are 46 full lines of the first bar, 10 full lines of the completion bar and 12 tick pixels at a 3-pixel pitch; none is left | P3 |
| Radar contacts | `0x40370` builds up to 120 contacts with a position, a palette index chosen by side, kind and distance, a blink flag and a shape routine; `0x4017c` draws them. The shapes are a 3×3 plus (`0x40a98`), a 3×3 X (`0x40ad4`), a 5×5 X (`0x40b24`), a 5×5 box with its edge midpoints cleared (`0x409f4`, Likely the current target) and single pixels (`0x40a80`). With subsystem 12 at state 1, 0–7 random contacts and fake target boxes are appended after the real ones; at state 2 no real contact is shown, only 60 random ones (Confirmed, code, [T6](./executable.md#t6-radar-confirmed-code-unless-noted)). All are drawn with `0x5ad00`, `0x5a170` and `0x5afe0` | None | On 25 of the 40 forward views, single-colour 3×3 pluses (27) and Xs (15) in the radar rectangle, each in one of the contact colours. 10461 records 0 and 28 are this plus in a 4×3 box, which is why P2-12/17 matched them | P3 |
| Map ring markers | `0x4ad1c` (called by `0x49f8c`) handles every unit with a nonzero radius, the radius taken from its type data and scaled to the map (P3-09/03: trunc(F(craft record +0x0C) × F(map scale `0x186464`)), the same field as the map-visibility range; [map contacts](./executable.md#map-contacts-coverage-and-fog-p3-0903)). Units in the friendly-plus-player mask `0x6c87f` get a filled disc (`0x5a930`, or `0x5bca0` clipped at the edge); all others get a one-pixel midpoint circle (`0x5a390`) in one fixed index. Both are centred on the unit's position, where `0x4abe4` also draws the unit's marker | None | On the 9 map screens, 1,928 of the 1,947 main-map pixels of that index lie on exact `0x5a390` circles (radius 2–10, mostly 5–6, at least 75% of each circle shown), many centred on a two-colour 10461 marker; 19 pixels on one screen are left | P3 |
| Box around selected units | A left click in the main map sets a target point (`0x2b9bc`). `0x49f8c` then draws each zoom-window icon through `0x4abe4` with a box colour when each of the unit's three coordinates lies within a fixed distance (`0x1864a8`) of that point, otherwise without one. The point is read from the map state, and no box is drawn while its flag byte is 0 (P2-12/32); its z can come from the nearest map icon ([executable](./executable.md#strategic-map-projection)). `0x4abe4` draws a one-pixel box from the icon's top-left, one pixel wider and taller than the icon, so one click can box several units. Main-map markers are always drawn without a box; while the pointer is in the main map, `0x4c8b0` draws the pointer's rectangle there in the same colour. The boxes B-001 records after a click are Likely the zoom-window boxes | None | 5 boxes on `srangers_001/106/107.png`, each exactly one placed 11401 icon plus 1 pixel; the pointer rectangle shows on the map screens | P3 |
| Information window above the zoom window | `0x49e74` splits the type-10 rectangle into the square main map, an information area (upper half of the right panel) and the zoom window (lower half). While the pointer is in the main map, `0x4ba80` writes lines about the units within the zoom window's range, the units for which `0x49f8c` recorded a true result of `0x4c5ec` (P2-12/32): unit rows up to area height ÷ font-1 height (two rows per listed friendly-kind unit: kind word and name, then shield, hull and energy percentages), followed by per-kind count rows for the other kinds that this capacity does not limit (P3-09/04 correction, [information window](./executable.md#zoom-window-information-window-and-labels-p3-0904)). It draws them with font 1 at (x + 4, y + 4 + 8n), one index per line. `0x4b8fc` frames the three areas, the one under the pointer in a second colour | `font/hud/8x8-2` (delivered) | On all 9 map screens, every pixel in the information area that differs from its background is ink of `font/hud/8x8-2` runs on that grid (no other pixel); every frame pixel is in one of the two frame colours, with the main map's frame drawn last | P3 |

The map labels (`0x4af78`, covering `0x4afc0`–`0x4b360`) are leader lines (`0x5ad00`) and text in font 1, so they are code drawing and font text as well (§1.2). They are drawn per unit, not per group (P3-09/04).

**Map coverage (P3-09/03, Confirmed, code):** contacts of non-hostile kinds (`0x6c87f`) get the filled disc (the player's, kind 1, drawn after the others in its own colour); hostile kinds (`0x93780`) get the one-pixel circle, which is that hostile's own range, not coverage; a radius of 0 draws neither. Every map frame starts from a cleared back buffer, so the blue coverage is the union of the current discs and the black area is the cleared background ([map contacts](./executable.md#map-contacts-coverage-and-fog-p3-0903)).

**Warp page bars (P3-09/06, Confirmed, code):** the three bars of the Warp page are, from the top, the angle readout a (drawn from both ends), the error s and the completion p, each in [0, 1]; the history trace is the centring c ([Warp progress](./executable.md#warp-progress-completion-and-interruptions-p3-0906)). Map readouts beside the cursor and the destination: the Warp cost as a percentage of the current energy, at least 1 ([Warp cost](./executable.md#warp-cost-and-warp-start-p3-0905)).

**Impact (P2-12/27):** seven elements are code drawing or text in a delivered font, each with a traced path and a capture check. None passes to P3 merely for lack of a source.

- **Resource gap for P2-07:** SNIP 10487, needed for the left display's interference animation. The HUD set loads it unconditionally, and `0x4ce30` draws it on the status display and five other page entries while their subsystem state is nonzero (always at 2, intermittently at 1). Slice use is Likely: the slice already delivers the status overlays chosen by the same state function, and nothing limits the slice to undamaged displays. Converting it needs the 9 frames and the four palette indices of the EXE table at `0x175ed8`. AC-17 (agent part) therefore stays blocked on this gap. Resume when P2-07's spec and goal, revised with the user's approval, convert SNIP 10487 (or the user records that the interference is outside the slice), and P2-12 rechecks it on the new candidate against `srangers_068.png` (frame 6).
  - **Status (2026-10-08):** the user approved the revision, and P2-07 now converts SNIP 10487 ([conversion](#snip-10487-confirmed-structure-p2-1227)) together with DIAG 10489. P2-12/31 rechecked both on the later candidate (commit `8ca0ed3`): all nine frames equal the independent reading, and frame 6 equals all 9,216 pixels of the left display in `srangers_068.png` ([recheck](#snip-10487-confirmed-structure-p2-1227)). The resource gap is closed.
- **Routing rule (unchanged):** an element that needs a graphic the candidate lacks is a resource gap for P2-07 (HUD graphics), not P3. An element shown to be code drawing, or drawn from delivered graphics, passes to P3 as dynamic HUD drawing.

## 3. ID lists (Confirmed structure)

{u32 offset, u32 count} at 0x00, then `count` u32 entry IDs.

| Type | Entry | Content |
|---|---|---|
| M2ID | 10649 | **Craft type → MODL ID**, 22 slots (two are 0). The EXE loads this entry by its ID when it opens the archives. Slot 0 and 1 both name the player craft's model; slot 14 names the transponder craft's model. Both match screenshots in shape (see [mesh](./mesh.md) §3) |
| NEBC | 10039, 10661 | Lists of BITM IDs (6 and 15). 10661: the background set; each mission start takes six consecutive entries from index (clock sample mod 15), drawn at six fixed directions. 10039 (the six BITMs with embedded palettes) replaces them only through a cheat code (Confirmed, EXE; [executable](./executable.md#data-loaded-by-the-loop-p3-0110)) |
| EXIC | 10211 | Three ID lists at 0x00, 0x08, 0x10 (7, 7, and 3 IDs), all EXPL entries. Each mission start loads 5, 5 and 3 consecutive entries of the three lists from random starts (Confirmed, EXE). List 1 serves large kinds and explosions near the camera, list 2 other craft, list 3 missiles (Confirmed, code, [X4](./executable.md#x4-explosion-object-lifecycle--confirmed-code)) |

Additional slot/geometry comparisons are recorded in [mesh](./mesh.md#3-comparison-with-the-original-partial), including slots 7 and 17. The campaign source profiles in [scenario](./scenario.md#campaign-candidate-source-profiles-confirmed-structure) resolve the referenced slots without treating target labels as Asset IDs.

## 4. Instrument, overlay and map drawing (P3-13)

Drawing rules of the HI cockpit (CCKD 10103 slot 0), the flight-view overlay, the destruction-view label and the strategic map (slot 2), researched for P3-13 by read-only static analysis of `SRANGERS.EXE` on private copies of the Ghidra project (`-noanalysis -readOnly`; subtasks [01](../../plan/p3/13/subtasks/01-layout-scheduling-research.md#完成证据)–[07](../../plan/p3/13/subtasks/07-evidence-contract-baseline.md#完成证据)). Only addresses, structure, code constants (palette indices, positions, periods in clock units) and capture counts are recorded; text, pixels and decompiled code stay in the ignored `local/research/p3-13/`. Scheduling, full redraws, copies to the screen and what persists per view are in [cockpit](./cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301); the state each handler reads or writes is in the linked executable records. Positions are HI; LO paths are outside the slice. Cadences are in clock units (1/64 s) at the level of the code; how many units a real frame spans depends on cycles (U-021). Nothing here was observed at runtime unless a capture is named.

### 4.1 Primitives, text and formatting

**Primitives (Confirmed, code; P3-13/02, /04, /06):** none clips to an instrument rectangle; writes beyond 640×480 are not guarded.

| Routine | Draws |
|---|---|
| `0x5ad00` | Line: Bresenham with both end points included; x is the major axis only when 2\|dx\| > 2\|dy\| (ties are y-major); initial error 2\|minor\| − \|major\|, the minor coordinate steps when the error is ≥ 0 |
| `0x5afe0` | One pixel |
| `0x5a170` | One-pixel rectangle outline |
| `0x5aad0` | Filled rectangle |
| `0x5a390` | Midpoint circle (d = 1 − r, increments 3 and 5 − 2r): eight-way points, then the four axis points |
| `0x5a4d4` | The same circle limited to its first n steps per octant from the axes, plus the four axis points |
| `0x5a930` | Filled disc: four spans per row, then the centre row |
| `0x5bca0` | The disc with each span clipped to an inclusive box; callers use it only when the disc is not wholly inside |
| `0x4abe4` | One image record with colour key 0 at its top-left; it shrinks the record only on the right and bottom to the given area, never on the left or top; with a box colour it then draws a (w′ + 1) × (h′ + 1) outline from the top-left, over the record's first row and column |

**Text (Confirmed, code; P3-13/05; refines §1.1):** `0x5acac` stores header bytes 0–1 as the word at record +0, the advance (cell width) at +4, the height at +8, the upper-case flag at +0xC and the glyphs at +0x10; `0x49694` sets fonts/1's advance to 6 and its upper-case flag. `0x59fc8` reads only +4, +8, +0xC and the glyphs: with the flag set it replaces only 0x61–0x7A by subtracting 0x20 (`0x75572`); the glyph is data + code × 8 (× 16 when the height exceeds 8); it draws the first `height` rows and all 8 columns, each set bit in the caller's colour, with coordinates truncated to 16 bits and no clipping, and advances by +4. There is **no character map**: any byte draws the glyph of the same number (160 of fonts/0's and 159 of fonts/1's unmapped glyphs are non-empty). Header byte +1 is therefore not read when drawing (Confirmed); no other reader of record +0 was found (Likely). Every byte that the slice's text sources can supply (7 flight messages, the 64 HUD text regions, the view labels, DIAG, the communications menus, both name lists, craft, gun and missile names, mission names) lies within the production character maps of §1.1 after fonts/1's upper-casing; none is 0x7B, and line breaks occur only in DIAG (local data, counts only, P3-13/05).

**Formatting (Confirmed, code; P3-13/05; earlier Likely):** `0x74a3f` calls a Watcom-style `__prtf` (`0x8fe92` → `0x9042b`): ordinary bytes are copied, `%%` gives one `%`, `%s` copies the argument's bytes, `%d` goes through `0x74b67` (decimal with a leading `-` for negatives). `%.0f` goes through the handler installed at start-up (`0x9ce64` → `0xa4d57` → `0x13e776`): it takes the absolute value and the sign, estimates the decimal digits from the binary exponent (at most 16, recomputed on a carry), scales by a power of ten only when needed (never for `%.0f` in the slice) and converts with `0xa4a50`, **round half to even** (0.5 → 0, 1.5 → 2, 2.5 → 2). A negative value that rounds to 0 still prints the minus sign (Likely: read from the instructions, not executed). The slice's formats use no width or precision other than `.0`; `%15s` occurs only in the base interior.

### 4.2 Corner gauges (types 0–4)

Confirmed (code; P3-13/02). Operands and full scales are in [D16](./executable.md#d16-hud-full-scales--confirmed-code-for-operands-drawing-p3-13).

- **Damage branch:** types 0, 1, 2 and 3 read subsystem fields 17, 18, 16 and 15. State 0 shows the true value. State 1 draws `rand & 3`; on 3 it shows the true value, otherwise it draws once more and shows rand × (1/32767) × 0.1, a reading of 0–10 %. State 2 returns at once: nothing is drawn or cleared, so the last picture stays. State 3 has no writer (it would draw an uninitialised value). Type 4 (F2 only) reads no field and draws nothing random.
- **Colour:** types 0 and 1 always use record +0x14. Energy (type 2): below 0.25 it blinks between index 0 and 10 with period 0x10; from 0.25 to below 0.5 between 0xF and 0 with period 0x20; from 0.5 the record colour, period 0x40. Shield (type 3): below 0.5 it blinks between the record colour and 0 (period 0x10 below 0.25, else 0x20); from 0.5 the record colour, period 0x20. Hull (type 4): index 10 below 0.25. The tests are f32 "≥ threshold", so NaN takes the lowest band.
- **Own timers of types 2 and 3:** each has a due time and a phase. With slot +0x0C = 0 the handler returns at once while sample < due, drawing nothing and drawing no random number; the full-redraw flag does not bypass this. At sample ≥ due (**not strict**, unlike the radar) it draws, toggles the phase and sets due := sample + period. Initial values are static (due 0, period 0x40 for energy and 0x20 for shield, phase 1) and are never reset, so they carry over from mission to mission.
- **Shapes:** with record +0x24 null the flat bar `0x41680` draws a full-width line every second row upward from y1, n = chop((y1 − y0) × value) rows, then one more line above the last; the label is centred at ((x0 + x1) >> 1) − 3. With a +0x24 table the shaped bar `0x417a4` draws in mode m (0/1 grow up from y1, 2/3 down from y0; 0/2 anchored left, 1/3 right; other values as 3); its half-width table T is built by `0x41000`: T[i] = chop(min(f32((0.5 · max(i/56 − 0.25, 0))²) · 200 + 10, 29)), 56 entries in HI. It first clears each row of the shape to 0 at that row's own T, then draws every second row and one closing row. The closing row uses the advanced entry T[2J] in the buffer but is copied with the row's own T, so on screen it has the row's own width. n = 2k − 1 and 2k give the same picture. The label (a 2-byte EXE text, [HUD text](./executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)) is drawn in fonts/0 colour 8 at x0 + 2 or x1 − 8 and y0 + 2 or y1 − 9 by anchor and direction. Slot 0's four corner gauges use the shaped bar.
- **What reaches the screen:** with slot +0x0C = 0 each handler clears and copies only its own shape. Lines for values above 1 fall outside the rectangle and are not copied (the table index also runs past its end); a value below 0 gives only the cleared shape. Reachability: commanded speed ÷ maximum above 1 is reachable (the maximum can drop below a kept commanded speed, P3-06); speed ÷ B8 above 1 is Unconfirmed; energy and shield ratios stay ≤ 1 (local data).
- **Captures (appearance only):** on 51 accepted forward captures, 204 of 204 gauge pictures fit the code shapes (the "closing row = own T" rule) with the code colours; the mirrored side and T + 1 fit 0 of 204, and taking the buffer's T[2J] as the visible width fails 62 (P3-13/02). Scale, random readings, gates and periods have only code evidence.

### 4.3 Radar (type 5)

Confirmed (code; P3-13/02), correcting [T6](./executable.md#t6-radar-confirmed-code-unless-noted) where noted there.

- **Geometry:** r = (min(w, h) >> 1) − 2, scale = r − 2, centre = rectangle origin + (w >> 1, h >> 1). The set-up `0x3ffb4` builds per-row disc spans of half-width max(√\|r² − d²\| + 3, 10) for rows y0 … y1 − 1 (the last row is never cleared or copied) and skips rows with \|cy − y\| > r. Each rebuild clears these spans to 0, draws, and copies the spans. Contacts, noise and rings lie within r of the centre, so they stay inside the spans (Likely, from the bounds).
- **Contacts:** shapes and colours as in T6: missile 5×5 X, marker and contacts on the non-negative side of the camera's row-3 plane a plus, others a 3×3 X; the target box is a 5×5 outline with its four edge midpoints set to index 0 (not transparent); blinking entries use 0xA in phase 0.
- **Background `0x40b7c`, drawn after the contacts in index 0xD:** full circles of radius r, chop(0.9r) and chop(0.1r); at chop(0.5r) only the first 8 steps per octant plus the four axis points (four short arcs across the axes); the centre pixel. **There is no crosshair.** On 51 of 51 accepted forward captures all 661 predicted ring pixels have that colour and no other pixel of that colour lies in the radar rectangle; a 1-pixel shift reaches at most 30.3 % and radius ± 1 about 0 %.
- **Warp (view 1):** no rebuild, no contacts, no blink toggle; the spans are cleared and the rings drawn. Without a player node no rings are drawn.
- **Cadence:** the record interval (+0x18, sample − last > interval, strict) decides when the handler runs; inside it the rebuild runs when due < sample (strict), then due := sample + 5, so in slot 0 every scheduled call rebuilds; the blink toggles when its due < sample, then + 0x10. The pre-pass `0x40160` erases the previous contacts in the buffer and also tests the blink. The rebuild due, blink due and phase are static initial values, never reset.
- **Random draws (shared C library LCG in the original):** state 1: one draw for the count, then 5 per noise entry and, while entries remain, one for a fake box; state 2: 60 × 5. None in Warp.

### 4.4 Left display (type 6)

Confirmed (code; P3-13/03) unless marked. Page table, page changes and saved pages: [T8](./executable.md#t8-left-display-no-target-reads-confirmed-code), [D15](./executable.md#d15-left-display-pages--confirmed-code), [RQ8](./executable.md#rq8-page-5-and-the-other-saved-pages--confirmed-code).

- **Call and force:** slot 0's type-6 record has interval 0, so `0x4ce30` runs every frame; its force argument is directory +0x0C (0 in slot 0; 1 in F2's slot 1, where every page is forced every frame and neither the page period nor the SNIP frame skip applies).
- **Interference per page:** each of the 7 entries keeps its own on/off, next toggle and start; only `0x4ce30` touches them and nothing resets them (page changes, view rebuilds and missions keep them). Pages 2–5 share field 13 but switch independently; page 6 has no field. Field 2: when the sample is strictly past the next toggle and the entry is off, switch on and record the start (the toggle time is not advanced). Field 1: at each due toggle flip, record the start when switching on, draw one rand and set next toggle := sample + 0x40 + (rand & 0x3F). Both force the page's next refresh to 0. Field 0: off. While on, `0x4d010` draws SNIP frame ((sample − start) × 12, u32) >> 6 modulo the frame count; when not forced it skips the draw if the frame equals the global "last frame" `0x175ed4` (initially −1), which the right display shares, so two displays in interference can suppress each other's update (appearance detail).
- **Refresh:** a page is drawn when forced or when the sample is strictly past its next refresh; when not forced and the handler did not change the page (`0x1a9dc4`), next refresh := sample + period. `0x4ce18` (called only by the incoming page's entry `0x4e418`) makes the next call fill the whole rectangle with index 0.
- **Page 0, status (`0x4d0e0`):** each call first rebuilds the 96 × 100 off-screen buffer with `0x4d50c` (writing fields 1, 5 and 8, [D9](./executable.md#d9-status-display-writes-subsystem-fields-1-5-and-8--confirmed-code)) when the previous call toggled the blink or player +0xF0 is set, and only then tests its blink timer (toggle when sample > due, due := sample + 0x20). The background is MFDD list 0 record 0/1/2 by (shield << 8) ÷ c5C. Only fields 0–8 have overlays (list 1, record i for field i), drawn in the order 1, 0, 2, …, 8: state 2 always, state 1 when (i & 1) equals the blink phase. On a rebuild, a due line or a forced call it copies 96 rows × 97 columns opaque to (x0, y0 + 1), fills row y0 with 0 and draws the two message lines. The 97th column (x = 154) is never visible on any forward capture (59 of 59; the framing element covers it). Captures: on 48 forward views showing page 0, "one background + an overlay subset in code order" reproduces all 5,952 pixels outside the text bands; on `srangers_134` the reverse order gets all 89 differing overlap pixels wrong.
- **DIAG lines:** upper line at (x0 + 4, y0 + 5) and lower line at (x0 + 4, y1 − 20), fonts/1, line pitch 8; `0x4f108` ignores its clip argument. One colour for the upper line, one each for subsystem and start-up messages on the lower line (three colours, each unique on the 48 captures). Typing, hold, cursor, the rating overflow and the start-up messages: [DIAG](#diag-10489-confirmed-structure-p2-07-revision).
- **Page 1, energy (`0x4d800`):** drawn when player +0x44 (the energy-page redraw flag) is set, when forced, or when the view mode differs from the one of its last draw (`0x175ef4`, initially −1); it then clears +0x44. +0x44 is set by the player's 0x40-unit energy update (whether or not a value changed), level changes, shield damage `0x30c60`, charge spending and `0x3060c`; not by the page change `0x4cdf0`, the end of interference or a view rebuild. So after `e` or after interference ends in the same view, the old pixels (page 0 or a SNIP frame) stay until the next set, up to about 0x40 units. Content: BITM 10467 and row y0; the two TABL 10479 records chosen by L1 and L2 at (x0 + 18, y0 + 12) and (x1 − 18 − w, y0 + 12), rows 0 … h − 2; three bars `0x4d6f0` — centre E/T, left shield/c5C, right charge/c74 — centred at x0 + (x1 − x0)/2, x0 + 8 and x1 − 8, bottom y1 − 3, height h = y1 − y0 − 6. Length: full when value ≥ scale (signed), else h × value ÷ scale (`IMUL`, `IDIV`); a line every second row; value 0 still draws the bottom line, a negative value none; scale 0 with value ≥ 0 is full, with value < 0 a division fault (unreachable with shipped data, D10). Half-widths: 50 entries clamp(trunc(45 t³), 5, 45) from an f32 accumulated t (`0x4ca80`), used bottom-up so the base is widest; the side bars keep 5 on their outer side. Labels `0x171e60` (centre), `0x171e64` (left), `0x171e68` (right) in fonts/0 at (cx − advance/2, bottom − h).
- **Pages 2–4, communications:** [comm §4](./comm.md#4-text-rules-confirmed).
- **Page 5, incoming:** the current frame image of the message (every CMOV frame is 96 × 96) at (x0, y0 + 1), filling the panel below row y0; there is no text area ([RQ8](./executable.md#rq8-page-5-and-the-other-saved-pages--confirmed-code)).
- **Page 6, Warp (`0x4dcec`):** every call draws BITM 10467 and row y0. When the Warp-start flag `0x175d64` is set (only by `0x4ce24`, whose only caller is the Warp start `0x50188`) it empties the history; with 94 entries (parameter block +0x4C) it shifts left by one; it appends trunc(c × 50.0) (0–50; c is the centring, [Warp progress](./executable.md#warp-progress-completion-and-interruptions-p3-0906)). Outside view 1 it sets page 0 and empties the history. Drawing: point i of n at x = x0 + 94 − n + i, y = y0 + 2 + h[i], neighbours joined by one-pixel lines, every third point with a vertical line to y0 + 51; then the base line y0 + 52 from x0 + 2 to x1 − 2 (over the trace), the title in fonts/0 at (x1 − 66, y0 + 2), and the three bars of `0x4e018` — a at y1 − 40 … y1 − 28 from both ends (one line at each end when 0), s at y1 − 26 … y1 − 14 and p at y1 − 12 … y1 − 2 from the left (nothing when 0), a vertical line every second column, labels in fonts/0 at bar top + 1 (a centred, the others right-aligned). Period 0x10, strict; layout 0 does not force, so in view 1 a point is appended every 9 ticks at 2 units per tick. The history is always emptied at the first page-6 draw of a new Warp (the view switch into 1 sets page 6 and calls `0x50188`, its only caller; the Warp context has no `w`). `srangers_066`: base line 92 of 92 pixels; ticks at columns 84/87/90/93 and rows 51/53/54 as predicted for n = 10 and c = 1; error bar 0 pixels (s = 0).
- **Random draws:** only `0x4ce30` (one per interference toggle at field 1) and `0x4d44c` (one per lower-line message while start-up messages exist); a full scan of rel32 calls to `0x7453b`/`0x74535` finds no other on these paths. Both run inside the cockpit draw. In the original the interference toggle also decides whether page 0 runs and so when D9 writes its fields.

### 4.5 Right display (type 7)

Confirmed (code; P3-13/04) unless marked. State reads and writes: [T7](./executable.md#t7-right-target-display-confirmed-code).

- **Device and copy:** a 100 × 100 8-bit device (DATA colours, `0x42b04`), viewport back plane 900, projection centre (50.0, 50.0). Every draw copies the device window (2,1)–(98,98) to (x0, y0) = (491,346) and then the rectangle to the screen; a column and a row beyond the rectangle are written to the buffer but never copied. It draws (and copies) only when its refresh or countdown is due; in Warp likewise.
- **Model:** a copy of list 0 of the MODL attached to the target's visual record (the list the world uses), every face retextured with one colour (a 256-colour, single-shade texture): shield < 1 and kind not 0x2000/0x4000 → 0x0A; shield ratio > 0.25 or kind 0x6000 → 0x10; otherwise 0x0F. The scene has one ambient light of intensity 1.0, so lighting has no visible effect. Placement: the target at its position (+0x6C–+0x74) with dir = R2, up = R1; the camera on the line from the target to the player at the distance of table `0x175424` (20 f32, by kind bit), looking at the target with up = the player's R1, or a world-up look-at when \|player R2 · u\| ≤ 0.01. The scene has its own depth buffer; only colour is copied into the cockpit.
- **Background (Confirmed, captures, P3-13/04):** TEX 11089 stretched: device pixel (u, v) takes texel (⌊96u/100⌋, ⌊96v/100⌋), no shading ([textures](./textures.md#tex-11089-right-display-background-confirmed)).
- **Text (fonts/0, colour 8):** distance right-aligned with base x1 − 33 and 8-pixel steps at the thresholds 10, 99, 999, 9999, at y0 + 2; speed at y0 + 11; shield percentage from x0 + 3, three digits right-aligned, at y1 − 8; craft value at y1 − 8 (offset −12 when scaled twice); name at (x0 + 3, y1 − 17); the no-target and leaving notices at (x0 + 3, y1 − 8). c5C ≤ 0 gives 0 %.
- **Marker branch (kind 0x2000000):** no model (only the background); three fixed texts instead of the three numbers; a crosshair centred at (538,394) in 0x0F: ±16 horizontal and vertical, ±8 diagonals and four 4-pixel corner brackets. No capture shows this state.
- **Order per call:** clear the target when invalid or in view 6; a target with +0xCC = 1 → copy the 7-byte notice, countdown 20, clear the target → view change or device rebuild forces → a new target resets the scene → subsystem 14 (state 2 interference always; state 1 one rand per toggle, interval 0x40 + (rand & 0x3F), forcing the next refresh; state 0 not read); in interference it calls `0x4d010` (SNIP) and returns → during the countdown every call draws the notice and copies → without a target refresh every 0x80 → with a target every 9.
- **Captures:** 49 forward captures with the display: every pixel outside text and model equals the stretched background (centred, origin, tiled, flipped and centre-sampled fits all fail); the text rows 348, 357, 425 and 434 and the right edge match 45 + 6 captures; inside the rectangle only background indices, colour 8 and exactly one model colour occur (mostly 0x10; 0x0F on `srangers_002`; 0x0A on `srangers_114`, whose shield reads one digit). The silhouette's covered pixels have no pose-paired evidence.

### 4.6 Flight-view overlay `0x45de0` and view label

Confirmed (code; P3-13/04). `0x45de0` runs in views 0xC–0x12 (not in 1, 6, 8, 0x13). Before any visual gate it reads the lock progress `0x2e080` and runs the lock tone `0x46ecc` (P3-14), so subsystem-9 damage and the view never silence the tone. Mode 0x11 then draws the view label and returns; views other than 0xC and 0xD (flag `0x19b898` from `0x459a0`) return without drawing.

- **Subsystem 9:** state 2 never draws the overlay (one reticle in colour 0 every 0x20 units). State 1: after at least 0x40 units shown, each call skips with probability 44/256 (one rand, `(rand & 0xFF) < 0x2C`); a skip clears the marks, draws the reticle in colour 0 and lasts 0x20 units.
- **Elements, in draw order** (centre (319,157); not the renderer's (320,158)):

| Element | Shape | Colour and cadence |
|---|---|---|
| Rate indicator | A stem from the centre to (cx, cy + chop(s1·π·4)) and, around its end, a bar of radius 48 at angle θ with chevrons at radius 30/34 and ±10° | Stem 10, rest 0x13; geometry updated every 4 units, rates smoothed per second with 0.9599 rad/s² |
| Off-centre pointer | When the target is outside the ±50 aim box: (cx + 21b, cy − 21a)–(cx + 40b, cy − 40a), plus a line from the previous inner point; a, b are the radar's cached in-plane direction of the target (object block +0xB0/+0xB4, written only by the radar build `0x40370`) | 0x0F |
| Aim flag and target box | Projection x = chop(639x/z) + 319, y = chop(−639y/z) + 157; box when z > 1: half-size clamp((850 − chop z) >> 4, 8, 100), four 4-pixel corner brackets, both corners on screen; when z < the back plane also a centre cross and edge ticks; name (≤ 16 bytes) centred below | Locked 10, else 0x0F; name 0x0F |
| Lock rings | Progress v > 0: circles of radius v and 8 + v and partial circles; locked (v = 0): a circle shrinking from 80 by 8 every 2 units, back to 80 below 14 | 0x0F, 10 |
| Locked text `0x171c60` | At (277,191) while v = 0 | 10; its phase toggles every 8 units, shown in phase 1 |
| Weapon lines | Gun at (233,289), missile at (233,298): name, then the ammunition one advance after it (digits from the table `0x175b38` below 70) | In range 0x10, else 10 blinking with period 0x20; ammunition 0 → 10 |
| Lead marks | Guns in range (d ≤ gun +0x0C): lead point = target + R2 × target speed × d ÷ gun +0x08; only for kinds in 0x93780 a partial circle of radius chop(10 + lead distance) (steps 1–7, 0 by a per-call counter), a radius-10 circle and a line from the centre; the aim flag is recomputed at the lead point | 0x10 |
| Autopilot / speed-assist texts | (283,109) / (280,109); finite blink sequences stepped every 0x26 units; the speed-assist counter is started by the rule and advanced only here | Autopilot 0x10/0x0F; speed assist 0xC/0x13 |
| Reticle | Partial circle radius 20 (10 steps per octant), ticks 12–32 in four directions with 9-pixel bars at the inner ends, centre pixel; with the aim flag a second partial circle of radius 24 whose steps cycle 0–14 per call | 0xC; with the aim flag the circles alternate 0xC/10 by an 8-unit phase |
| Readouts | (234,177) own speed `%d`; (234,185) throttle percentage; (375,177) closing speed; (375,185) **time to target** = chop(distance ÷ closing speed) | 0x0F, 0x12, 0x10 (10 when negative), 0x10; refreshed every 16 units, drawn every call |

- **Erase `0x456e4`** (before the world layers, views 0xC, 0xD and 0x11): repaints last frame's marks in colour 0; this is equivalent to not drawing them. Exception: the two texts are erased only when their erase flag is set, so during a skip they stay (seen on `srangers_134`, where the reticle and readouts are missing but the autopilot text is present). Mark bounds are tested against 639 × 479, so marks can be written into rows 316–478 of the buffer; they become visible only if an instrument copy covers them (Likely rare).
- **View label (mode 0x11):** `0x459a0` sets the box (0,0)–(len × 6 + 1, 9) from TABL 10399 item 8 (97 × 9 in HI); `0x45de0` draws the item in fonts/1, colour 0x0F at (0,0) every frame and `0x456e4` fills the box with 0 before the world layers each frame. The box is only an erase area, not a visible frame. Captures: [cockpit R5 re-audit](./cockpit.md#all-qualifying-captures-p2-12) (`srangers_091`, `092`, `122`).
- **Captures (P3-13/04):** reticle rings 84/84 and ticks 117/117 pixels on all 46 forward captures that show it (full circle 84/112, 1-pixel shifts 30/84 and 58/117, radius 21 4/84 fail); absent in Warp (`066`) and in four damage captures (`129`, `131`, `132`, `134`); readouts at x 234/375 and rows 177/185 in 46 captures, weapon lines at x 233 in 43, autopilot text in 29. The lock text, speed-assist text, box, rings and lead marks depend on pose and state and were not compared.

### 4.7 Message line (type 8)

Confirmed (code; P3-13/05) unless marked. Queue and constants: [completion and beacon messages](./executable.md#completion-and-beacon-messages-p3-1103).

- **Queue `0x175f08`:** created by the HUD set-up `0x49440` (only caller `0x3ed2b`) and destroyed with the HUD (one queue per flight, Likely). Only `0x4e9e8` appends, at the tail, copying the text bytes; width = bytes × fonts/0 advance (8); expiry = post sample + ECX (u32). A failed node or text allocation silently drops the new item; there is no count limit.
- **Enqueue sites:**

| Site | Text | Colour | Mode | Unshown expiry | In the slice |
|---|---|---|---|---|---|
| `0x32c93` (state 4, after the flush `0x2cd20`) | `missionComplete` | 0x0C | 1 | 0x280 | Yes; posted before the render with the previous frame's sample |
| `0x33498` (`0x33464`, after the head drop `0x4e9b0`) | `beacon` | 0x0C | 1 | 0x3C0 | Yes |
| `0x269fb` / `0x26a1b` (`0x264a0`) | `speedAssistOn` / `speedAssistOff` by the toggled state | 0x0F | 2 | 0x140 | Yes |
| `0x26e45`, `0x26e78`, `0x26eac` | Joystick sensitivity texts | 0x0F | 2 | 0x140 | No (G-10) |
| `0x4e461` (`0x4e418`, any view including Warp) | CMOV message text | 8 | 1 | 0x200 | Yes; at the end of the render ([RQ5](./executable.md#rq5-incoming-channel-load-visible-end-and-callback--confirmed-code-and-runtime-baseline)) |
| `0x4e3fd` (docked text-only branch) | CMOV message text | 8 | 1 | 0x200 | No (needs a pending HI → LO switch in view 6) |
| `0x3cb30` (cheats), `0x68ff9` (wave mode) | — | — | — | — | No |

  Only `0x2cd20` (every flush) and `0x33464` (the beacon) call the head drop `0x4e9b0`; each drops exactly one head item and sets the clear flag even on an empty queue.
- **Order within a frame:** the flow step (completion, flushes) → object updates and dispatcher (beacon, key toggles, the player-loss flush) → render: `0x49b2c` runs the expiry `0x4e964` (global callback) before the type-8 draw; `0x4e368` enqueues the incoming text at the render's end. So the incoming text first shows in the next frame's draw; every other source is in place before the same frame's draw.
- **Expiry `0x4e964`:** only the head item; when it has never been drawn and sample > expiry (u32, strict) it is removed and the clear flag set, at most one per frame, before the draw. Waiting items never expire until they are the head. The draw does not test expiry, so after an expiry removes a stale head the next item starts in the same frame even if also stale.
- **Draw `0x4e6c0`** (arguments: view mode, the slot's always-redraw flag, rectangle):
  1. clear flag set and view ≠ 8: fill the whole rectangle (inclusive) with 0, copy it when not always-redraw, clear the flag;
  2. no head: return; at the head's first draw store the sample as its start ("first shown");
  3. font: fonts/2 in LO, else fonts/0; text row y = trunc((y0 + y1 − h) / 2); W = x1 − x0 − 1;
  4. offset: mode 0 → 0; mode 1 → W − ((dt × 48 mod 2³²) >> 6); other modes × 120; dt = sample − start (u32);
  5. width + offset ≤ 0 (signed), or mode 0 with start + 0x80 ≤ sample: remove the item, set the clear flag and **draw nothing this time**, so after a removal by the draw the next item starts in the next frame (after a drop or expiry it may start in the same frame);
  6. only whole glyphs: the first is 0 when offset ≥ 0, else ⌈−offset / advance⌉; glyph i at x0 + offset + i × advance; the last bound is min(length, trunc((W − offset − 1) / advance)); no half glyph on the left, the rightmost pixel ≤ x1 − 3;
  7. view ≠ 8: fill (x0, y)–(x1 − 1, y + h) with 0, draw, and copy only that band when not always-redraw. View 8: fill (x0, y0)–(x1 − 1, y1 − 1), draw, then a colour-8 outline (x1 − x0 − 1 wide, y1 − y0 − 1 tall); step 1 is skipped there because the map redraws the whole screen every frame.
- **HI rectangles:** slot 0 and 10097 slot 0: (229,456)–(411,472), text rows 460–467, clear band 460–468, columns 229–410, W = 181. Slot 2 (map): (152,411)–(392,427), W = 239, text rows 415–422, outline columns 152–390 and rows 411–425. Slot 7 (destruction and external views, always-redraw): (229,4)–(411,20), text rows 8–15, not copied by the handler. The queue and the start samples are kept across views; with another rectangle the offset is recomputed from the new W at once (F1 → map moves the text 58 pixels right relative to x0), and so is the removal test.
- **Pauses:** the clock does not run while paused. In views that do not draw (0x13) or without a player the line is frozen; on return a shown item continues from its accumulated dt and may leave at once.
- **Mode cadence at 2 units per tick (code level):** mode 1 moves 1 and 2 pixels alternately per tick, mode 2 about 3.75 pixels.
- **Captures:** on the 59 forward captures matching the panel, the only non-zero panel pixels in the type-8 rectangle lie outside the text band and are 0 on 33 of them, which only the whole-rectangle clear can produce; one capture has 141 colour-8 pixels forming exactly 7 whole fonts/0 glyphs on the 8-pixel grid in rows 460–467, between x0 and x1 − 3. None of the 10 map captures has the colour-8 outline (empty queue), so the map branch has no capture evidence.

### 4.8 Indicator strip (type 9) and Warp lamp (type 12)

Confirmed (code; read-only static analysis for P3-13/07: native disassembly of `0x4eb3c`, `0x4f2a0`, `0x4f268` and `0x4f3e4`, byte scans for their globals; private output `local/research/p3-13/comparison-plan/out/ghidra/`). The conditions and sampling behind the two warning flags (the global update `0x4edf4`) and the warning sounds are P3-14's research; their writers are listed in the [HUD text](./executable.md#hud-map-and-communications-text-from-the-exe-p3-0324) indicator rows.

- **Type 9 draw `0x4eb3c`:** its own blink clock (due `0x175f24`, phase `0x175f28`; static initial values 0, never reset) is separate from the warning update's due. The body runs only when the sample is strictly past the blink due or the slot's always-redraw flag is set; on a due it toggles the phase and sets due := sample + 0x15 (at 2 units per tick a toggle every 11 ticks). Each label has a "shown" flag (`0x175f2c` missile, `0x175f30` craft; static, initially 0), cleared only by an always-redraw call (F2's slot 1).
  - Missile flag `0x175f14` → text `0x171e98` in colour 10 at (second x range start, y0), shown in **phase 0**; craft flag `0x175f10` → text `0x171ea0` in colour 0xF at (first x range start, y0), shown in **phase 1**. The two labels therefore alternate when both flags are set. The second range is parameter-table entries 2–3, the first entries 0–1 (cockpit record +0x24). Text in fonts/1.
  - Flag set, in its label's phase, not shown: draw the label and mark it shown. Flag set, other phase, shown: fill its x range × rows y0–y1 with 0 and clear the mark. Flag clear and shown: fill the range with 0 without clearing the mark, so this repeats at every blink step until an always-redraw call clears the mark. LO in views 0xC and 1 fills the range with the label colour instead of drawing text (outside the slice).
  - When not always-redraw and anything was drawn or erased, it copies **both** x ranges (rows y0–y1); otherwise nothing reaches the screen. So the strip shows the panel until a label's first erase; after that the range is black at every blink step for as long as the mark stays set (a full redraw restores the panel only until the next step), and, the marks being static, across later missions of the same program run unless the player uses F2. In Warp the zeroed buffer makes a copied range black except the glyphs. No random draws.
  - **Captures (P3-13/07, counts; ignored `local/research/p3-13/comparison-plan/out/t9-initial.txt`):** the panel under each range has 24 non-zero pixels. The first range is black (24/24) on `srangers_109`–`117` and `124`–`128` and `132`–`135`; the second range is black on `123`–`128` and `132`–`135`; every other front capture shows the panel there. By the rule above a black range needs an earlier draw of that label, so both warning labels were drawn in those sessions (the first-mission recaptures of P2-12/15 and /30): both warning conditions occurred there (Likely, inference from code and captures; this contradicts the "unreachable" reading of P3-14 A-07). No capture shows label ink (colours 10 or 0xF in the ranges). On `114`–`117` one further pixel of the second range is black, consistent with a copy of both ranges publishing a colour-0 overlay erase that `0x456e4` left in the buffer's cockpit band ([§4.6](#46-flight-view-overlay-0x45de0-and-view-label); Likely).
- **Type 12 draw `0x4f2a0`:** the force flag `0x175f3c` is set by the activate callback `0x4f268` and by the update `0x4f3e4` whenever the lamp state `0x175f38` changes; no instruction clears it (byte scan of its address: three stores of 1 and one read), so after the first activation the handler acts on every call. Not always-redraw: lamp on → draw `0x171ea8` in fonts/1, colour 0x10, at (x0, y0) over the current buffer (no clear); lamp off → fill the rectangle with 0; then copy the rectangle. Always-redraw: lamp on → draw the text (LO in views 0xC/1: fill in 0x10), no copy. The update `0x4f3e4` (global callback, campaigns only) sets the lamp when player +0xC8 is 0 or 64 × the craft record's +0xA4 has passed since it (strict), otherwise clears it.
- **Captures:** the panel under the lamp rectangle is entirely index 0. The type-12 text (run F1-05 of §1.2, fonts/1) is the 82 pixels that differ from it on the reference view `srangers_002`; `srangers_066` (Warp) shows the same 82 pixels, so the lamp was lit in that Warp frame. Nothing else is drawn in the rectangle.

### 4.9 Strategic map (type 10)

Confirmed (code; P3-13/06) unless marked. Contacts, coverage, fog, the information window's rows, labels, numbers and the Warp cost are in the [P3-09 records](./executable.md#strategic-map-and-warp-p3-09); mouse reads and the right-button debounce in [map mouse input](./executable.md#map-mouse-input-p3-0503).

- **Frame order (view 8):** `0x599e8(0)` fills the buffer with 0 → `0x583fc` (rows 0–31 to video rows 480–511, off screen) → the flash step `0x48e6c` (VGA palette only; the whole screen changes together) → `0x49b2c`: global callbacks, type 10 (`0x49f8c`), type 8 (the message line; its rectangle lies over the bottom rows of the main map, so it is drawn on top of the map) → the four pass-1 frame elements (raw, opaque).
- **`0x49f8c` order:**
  1. `0x2b9bc` at the mouse block's point with buttons 0 (cursor world point, zoom bounds, debounce decrement);
  2. fonts/1; information capacity := information height ÷ font height; with the cursor in the main map, copy the confirmed cursor's local point;
  3. with a stored destination (ps +0x00 ≠ 0) its pixel and in-map flag (`0x4c524`); take the combat target;
  4. rebuild the icon table (radius, friendly, in-map and zoom flags; the combat target's main-map record becomes 28; remember the player's entry);
  5. information window `0x4ba80` (only with the cursor in the main map; drawn here);
  6. main-map de-overlap `0x4b3a8` (rule-relevant; Core already gives de-overlapped pixels);
  7. coverage `0x4ad1c`: discs for non-player friendlies in 0x11 → the player's disc (kind exactly 1) in 0x12 → hostile one-pixel rings in 9; radius 0 draws nothing; centres are the de-overlapped pixels, the in-map flag is not tested;
  8. grid `0x4ab08` in colour 4: lines at main-map origin + i × trunc(s / n) (n = the sector count);
  9. labels `0x4af78`;
  10. record 26 at the cursor, then the cursor's cost text (only when the player has an icon entry);
  11. record 27 at the destination when stored and in the map, then its cost text (same condition);
  12. the other in-map main-map icons (neither target nor player; never boxed) → the target's record 28 on top → the line `0x4c674` in colour 8 → the player's icon when in the map;
  13. the fixed caption `mapCornerLabel` (`0x171d18`) in colour 0xA at **the zoom window's origin + (4, 4)** (not the main map's corner);
  14. zoom de-overlap `0x4b56c` → numbers `0x4b98c` while the toggle is 1 → each zoom icon (TABL 11401 by kind bit; with a stored destination and all three \|chop(difference)\| < 1000.0 a 0xD box) immediately followed by its number (target 0xF, others 8, at zoom pixel + zoom origin + 2);
  15. panel outlines `0x4b8fc` with the cursor in the main map: information 0xD, zoom 0xD, main map 8, then the pointer box `0x4c8b0` in 0xD.
  The branches for a cursor in the zoom window, the information window or no area (with `0x171d24`/`0x171d2c` and a full-screen record 26) are unreachable: the mouse is clamped to the main map and every opening starts inside it.
- **Clipping and edges:** the clipped disc uses the inclusive box [x, x + s] × [y, y + s] (one column and row past the main map, later covered by the outline); enemy rings, text and leader lines are not clipped; records shrink only on the right and bottom. Outlines are drawn at x, x + w, y and y + h (one pixel past a half-open rectangle); with the shipped data the main-map and zoom bottom lines fall on the row below the type-10 rectangle, which no frame element covers (visible on the captures). Pointer box: width chop(zoom extent x × pixels per unit x), height likewise, halves truncated toward zero, centred on the cursor pixel; each edge only when inside [main origin, main origin + s], end points clamped to that range; drawn after the outlines, so it can cover them. The information rows are not clipped: overflow is covered by the information outline's right line and the frame; labels near the right edge can be drawn into the information or zoom window and stay visible.
- **Line `0x4c674`:** with the player in the map, straight to the cursor; otherwise the player's end is clipped to the inclusive main-map box first in x, then in y, with f32 slopes computed unconditionally; with the player and the cursor in the same column or row this raises an unmasked x87 division by zero (consequence Unconfirmed; reachable, since the player can leave the world rectangle).
- **Labels:** for every in-map icon of kind in 0x6887f: text above the icon (y − font height − 6) when its row is in the lower half of the main map, else below (y + 6), at the icon's x; leader lines in 0x10 from (x − 4, ym) to (x − advance, ym) and from (x, icon y) to (x − advance, ym), ym = text y + font height / 2. Colour: while object +0x17C ≠ 0, 0xA or 0xF by bit 5 of the frame's clock sample (period 64 units, phase from the absolute clock); otherwise 0xF for kinds 1 and 2, 0x10 for the others. Only whether +0x17C is non-zero is read.
- **Cost texts:** cursor: p = chop((c ÷ E) × 100.0), shown max(p, 1), at the confirmed cursor + (2, 2), moved left by 6 × advance + 2 when the local x > s − 6 × advance and up by font height + 2 when the local y > s − font height; colour ≥ 100 0xA, 67–99 0xF, else 8. Destination: destination pixel + (3, 3), no move, low band 0xD. E = 0 raises an x87 exception ([Warp cost](./executable.md#warp-cost-and-warp-start-p3-0905)).
- **Information colours:** unit rows and the 0x4000 count row 0x13, other count rows 0xA, at (x + 4, y + 4 + font height × k). Count rows past the capacity are drawn into the zoom area and then covered by the caption, icons and outlines. The shield, hull and energy capacities of every listed kind are positive in all 21 CINF entries (693 values), so the unguarded divisions do not fault with shipped data.
- **Zoom de-overlap `0x4b56c` (a different algorithm from the main map's; corrects the earlier "the same for the zoom pixels"):** steps (W + 2, H + 2) from each record's size; a box centred on the zoom pixel with truncated half sizes, touching counts as overlap. Entry 0 never moves; entry i overlapping any j moves by its own counter from its current place, with cumulative offsets (+sx, +sy), (−sx, +sy), (−sx, −sy), (+sx, −sy), (+sx, 0), (0, +sy), (−sx, 0), (0, −sy), then back to the original place, ending that entry; a position outside [0, zoom width] × [0, zoom height] tries the next step at once; when the counter runs out the entry returns to its original place; every move restarts the scan at j = 0; an entry stops after 10,000 comparisons. Only drawing (and the unreachable `0x4c3ec`) read these pixels.
- **Local pointer versus confirmed readings:** in the original one mouse-block point decides the pointer and every reading in the same frame. The pointer box `0x4c8b0` and record 26 depend only on that point; the cursor cost text (value and place), the line's end, the zoom bounds with their members, numbers and information rows, and the outline highlight all follow the cursor world point.
- **Captures (`srangers_000`, `001`, `004`, `059`, `088`, `104`–`108`; appearance and relative position only, the world → pixel mapping rests on code and P2-12's runtime readings):** criteria fixed before comparing. Outlines match 100 % on 9 captures; on `004` 2 pixels differ, exactly the clamped vertical edge ends of the pointer box (the box is drawn after the outlines); "outline inset by one" and "highlight swapped" reach about 36 % and 18 %. Grid: every inner line on all 10, no other colour-4 pixel in the main map, no grid pixel covered by a disc colour (discs before the grid); "exact division" fails on the 9 captures where it differs (on `088` the side divides exactly). Caption ink at the zoom origin + (4, 4) within 8 rows on all 10, and none at the main map's corner. 53 labels with whole leader lines all fit, text colours only 0x10 and 0xF. Ink of colours 8 and 0xF at the pointer box centre + (2, 2) is a position clue only (Likely; it overlaps the line and record 26). No capture shows: cost ≥ 100 (0xA), the numbers, the threat blink, information overflow, a moved cost text, a ring past the right edge, E = 0, the player outside the world, or a message on the map line.
