---
type: format
status: draft
phase: P0
updated: 2026-10-09
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
| — | Map | Energy-cost text beside the selection box | `font/hud/8x8-2` (EXE) | 0 | not compared | 6 (EXE) | — | Unconfirmed |
| — | Map | Overlapping labels at the player's position | `font/hud/8x8-2` (EXE) | 0 | not compared | 6 (EXE) | — | Unconfirmed |

- **Fonts (Likely):** every listed run's set pixels match. In every run but two, every glyph discriminates; in F1-02 and F1-10 three of four do. Each place is therefore drawn by the one font shown. The gauge-area search also found one full-cell alias of `font/hud/8x8-2` overlapping a gauge letter's cell, offset by one column and two rows; at the letter's own origin only `font/hud/8x8-1` matches.
- **Spacing (Confirmed, P2-12/27; earlier Likely):** origin-to-origin advances are constant within each font and run: 6 pixels for `font/hud/8x8-2` text and 8 pixels for `font/hud/8x8-1` text. The advance is a property of the font record built at load (§1.1 Drawing); drawing text is P3's.
- **Codes:** every matched glyph is reachable through the production character maps (§1.1), so no map is extended. Lines and other labels cross the two unmatched places, and no glyph run matches there. The EXE draws both with fonts/1 at its advance of 6: the energy-cost text in `0x49f8c`, the labels in `0x4af78` (P2-12/27). The codes they need are Unconfirmed.
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
| 10165 | Base interior items: 11 records of 0x7C bytes, each three 320×200 sprite-RLE [image records](./textures.md#2-image-record-36-bytes-confirmed) (+0x00, +0x24, +0x48; each image holds only a small part at a fixed position), a subsystem selector (+0x6C), two pointers (+0x70, +0x74) and a small integer (+0x78); data and strings follow the records | Record layout Confirmed (data and the base code, [executable](./executable.md#data-loaded-by-the-loop-p3-0110)); +0x70–+0x78 and the three images' roles Unconfirmed (U-030) |
| 10399 | 13 string pointers: the view labels of mode 0x11, indexed by sub-mode ([executable](./executable.md#automatic-views-and-cameras-p3-0109)) | Confirmed (EXE, P3-01/09); use of indices 9–12 Unconfirmed |
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
| `0x4d50c` | Status display, into an off-screen buffer: one MFDD list-0 background (record 0, 1 or 2, chosen by thresholds on a ratio of two fields of the displayed craft) with `0x59cbc`, then list-1 records chosen per subsystem state, some blinking, with `0x59d38` |
| `0x4d0e0` | Copies that buffer with `0x59608` to (x0, y0 + 1) of its instrument rectangle, then draws two lines of message text from the DIAG entry's strings |
| `0x4d800` | A left-display page: BITM 10467 at (x0, y0 + 1) with `0x59608`; then two 10479 records chosen by fields of the target object, one near each side, with `0x59774`; then labelled bars and text. `0x59774` takes inclusive source bounds, and this call passes columns 0 to w and rows 0 to h − 2: every row but the last (which is colour key 0 in all four 10479 records), plus one column that repeats the next row's first pixel (P2-12/27) |
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
- **When it is drawn (Confirmed, EXE; meaning of the states Likely):** the left-display dispatcher `0x4ce30` keeps a table at `0x175c7c` of seven page entries: the status display `0x4d0e0`, the bar page `0x4d800` (the energy page of `srangers_100.png`), three entries for `0x4da28`, one for `0x4dc50`, and the Warp page `0x4dcec`. Each entry holds the page's handler, a refresh period and a subsystem index (all pages but the Warp page). `0x4ce30` reads that subsystem's state with `0x52ac4`, the same function `0x4d50c` uses to choose the status overlays. While the state is 2 it draws the SNIP instead of the page. While the state is 1 it switches between the SNIP and the page at random intervals of 64–127 ticks. The states are Likely the subsystem's damage levels. The SNIP is therefore Likely the display's interference animation when the display is damaged.
- **Right (target) display (Confirmed, EXE and capture, P2-12/30):** the type-7 draw handler `0x42d80` does the same for the right display. It reads the state of subsystem 14 with `0x52ac4`; at state 2 it draws the SNIP through `0x4d010` instead of its own content, and at state 1 it switches between the two at random intervals of 64–127 ticks. In the recaptures `srangers_132.png` and `srangers_133.png`, all 9,216 pixels at (x0, y0 + 1) of the type-7 instrument rectangle, (491,347), equal frame 5; in `srangers_135.png` the left display equals frame 0.
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
- **Upper line (`0x4d308`, Confirmed):** cycles format 0–3, formatting each with one value: 0 and 1 a percentage computed from two fields of the displayed craft (1 clamped at 0), 2 a rating text, 3 a field of the craft. The rating: the states of 19 subsystems (`0x52ac4`) are summed and the pairs are searched from the last to the first; the first whose maximum is not below the sum gives the text. When the sum exceeds every maximum the code reads the word before the table (not traced further).
- **Lower line (`0x4d44c`, Confirmed):** while the startup count is nonzero and a random byte (`0x7453b`) is below 0x55, it shows the next startup message in turn; whether the program later clears the count was not traced. Otherwise it cycles subsystem 0–14 and formats its name and the word of its current state with a format in the executable at `0x171e58` (LE object 4, offset `0x1e58`, 6 bytes with its NUL), not in the entry.
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
| F1 | Navigation display (right): grid and marker lines | Code drawing | Likely | One-pixel lines |
| F1 | Gauges in the four corner areas: level stripes | Code drawing | Likely | Horizontal one-pixel stripes. The HI gauge bars are drawn only on a left-display page (`0x4d800`) |
| F1 | Radar rings and crosshair | Code drawing | Likely | Circles and lines |
| F1 | Radar contacts | Code drawing | Confirmed | Only single-colour records match there (non-unique). P2-12/27 traced the radar handler ([sources](#sources-of-the-unidentified-elements-p2-1227)) |
| F1 | Aiming reticle in the view | Code drawing | Likely | Circle and tick lines |
| F1 | Message line and the strip above the navigation display | Nothing drawn | Likely | No pixel of either instrument rectangle differs from the panel (3,111 and 584 pixels) |
| F1, Map | Text | Font text; two map places unidentified | Likely | [§1.2](#12-fonts-used-on-the-reference-screens-r7). On F1, a colon glyph in the next cell after F1-06 is also matched by both 8×8 fonts, and its code is mapped |
| Map | Frame, including the button labels | Packed bitmap: CCKD 10103 slot 2 | Confirmed | [cockpit](./cockpit.md#group-palette-and-drawing-confirmed) |
| Map | Grid | Code drawing | Likely | One-pixel lines |
| Map | Fog and covered areas | Code drawing | Likely | Uniform filled discs |
| Map | Range ring, target line, selection box | Code drawing | Likely | Ring, line and rectangle outline |
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
  - **Record 27 (the map-state point):** `0x49f8c` draws 10461 record 27 at the point the map state holds at +0x10 while its flag byte at +0 is set, the same point the zoom-window box test compares with (box row below; Confirmed, EXE). Its three placements (`srangers_004/088/107.png`) each sit next to the energy-cost text. Whether that point is always the left-click (Warp) target that `0x2b9bc` stores ([executable](./executable.md#strategic-map-projection)) is Unconfirmed: the user reports that no Warp target had been set in `srangers_004.png`.
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

**Instrument handlers (Confirmed, EXE):** `0x49db4` registers a handler set per instrument type, and `0x49b2c` calls the draw handler of each instrument record of the active cockpit slot. The draw handlers include `0x401e8` for type 5 (radar), `0x4ce30` for type 6 (left display), `0x49f8c` for type 10 (strategic map), `0x4e6c0` for type 8 (the scrolling message line) and `0x4f2a0` for type 12.

| Element | Drawing path (Confirmed, EXE) | Graphic read | Capture check (Confirmed) | Routing |
|---|---|---|---|---|
| Status display: marks after text | `0x4d0e0` draws the top message at (x0 + 4, y0 + 5) and the bottom message at (x0 + 4, y1 − 20), both with `0x4f108`, in font 1 (`font/hud/8x8-2`) with an 8-pixel line pitch. `0x4f108` types the message out one character at a time. After the last drawn character it draws a one-pixel rectangle outline (`0x5a170`) as wide as the font's advance and as tall as its height (6×8), in the text colour, while a blink flag is set. The flag toggles once the message is complete | None | All 52 marks of 6×8 are the full 24-pixel outline of the cell one advance after the last glyph, in the text colour, on the message grid. 47 follow a detected run (one of them with 3 further pixels inside the outline, not traced) and 5 follow a glyph outside any run. Each 12×8 mark is one mapped glyph of both 8×8 fonts followed by the cursor; each 2×2 block is a detached part of that glyph. Five fixed 5×1 marks are single mapped glyphs on the grid. P2-12/17's 17-pixel count came from 4×6 glyphs matching part of the outline as text | P3: dynamic HUD drawing |
| Left display in `srangers_068.png` | The SNIP drawn by `0x4ce30` → `0x4d010` → `0x5bfc0` instead of the page: always while the page's subsystem state is 2, at random intervals while it is 1 ([SNIP 10487](#snip-10487-confirmed-structure-p2-1227)) | SNIP 10487, not converted at the time | Frame 6 matches all 9,216 pixels | P2-07: resource gap, since closed (impact below) |
| Energy page stripes | `0x4d800` calls `0x4d6f0` for three bars: one at the display's middle and one each at x0 + 8 and x1 − 8, each in its own fixed palette index. `0x4d6f0` draws horizontal one-pixel lines (`0x5ad00`) every second row from y1 − 3 upward, as many as the bar's value allows. Each line's half-widths come from a 50-entry table that `0x4ca80` builds from a cubic curve, truncated (`0x74518` chops) and clamped to 5–45 pixels. The side bars keep a fixed 5 pixels on their outer side | None | `srangers_100.png`: of the 2,587 pixels that differ from the page background outside text, 1,900 are the predicted stripe pixels in the predicted colours and 687 belong to the two gauge records; none is left, and every predicted stripe pixel outside text is shown | P3 |
| Warp dotted bar | The Warp page `0x4dcec` calls `0x4e018` for three bars across the display (x0 + 2 to x1 − 2): one at y1 − 40 filled from both ends, one at y1 − 26, and a completion bar at y1 − 12. `0x4e018` draws vertical one-pixel lines every second column, 13 pixels tall (11 for the last bar), each bar in its own fixed index, then its label. The page also draws a history graph whose ticks fall every third column | None | `srangers_066.png`: the 655 pixels are 46 full lines of the first bar, 10 full lines of the completion bar and 12 tick pixels at a 3-pixel pitch; none is left | P3 |
| Radar contacts | `0x40370` builds up to 120 contacts with a position, a palette index chosen by side, kind and distance, a blink flag and a shape routine; `0x4017c` draws them. The shapes are a 3×3 plus (`0x40a98`), a 3×3 X (`0x40ad4`), a 5×5 X (`0x40b24`), a 5×5 box with its edge midpoints cleared (`0x409f4`, Likely the current target) and single pixels (`0x40a80`). While the radar's subsystem state is nonzero (Likely damage), random contacts are added. All are drawn with `0x5ad00`, `0x5a170` and `0x5afe0` | None | On 25 of the 40 forward views, single-colour 3×3 pluses (27) and Xs (15) in the radar rectangle, each in one of the contact colours. 10461 records 0 and 28 are this plus in a 4×3 box, which is why P2-12/17 matched them | P3 |
| Map ring markers | `0x4ad1c` (called by `0x49f8c`) handles every unit with a nonzero radius, the radius taken from its type data and scaled to the map. Units in the friendly-plus-player mask `0x6c87f` get a filled disc (`0x5a930`, or `0x5bca0` clipped at the edge); all others get a one-pixel midpoint circle (`0x5a390`) in one fixed index. Both are centred on the unit's position, where `0x4abe4` also draws the unit's marker | None | On the 9 map screens, 1,928 of the 1,947 main-map pixels of that index lie on exact `0x5a390` circles (radius 2–10, mostly 5–6, at least 75% of each circle shown), many centred on a two-colour 10461 marker; 19 pixels on one screen are left | P3 |
| Box around selected units | A left click in the main map sets a target point (`0x2b9bc`). `0x49f8c` then draws each zoom-window icon through `0x4abe4` with a box colour when each of the unit's three coordinates lies within a fixed distance (`0x1864a8`) of that point, otherwise without one. The point is read from the map state, and no box is drawn while its flag byte is 0 (P2-12/32); its z can come from the nearest map icon ([executable](./executable.md#strategic-map-projection)). `0x4abe4` draws a one-pixel box from the icon's top-left, one pixel wider and taller than the icon, so one click can box several units. Main-map markers are always drawn without a box; while the pointer is in the main map, `0x4c8b0` draws the pointer's rectangle there in the same colour. The boxes B-001 records after a click are Likely the zoom-window boxes | None | 5 boxes on `srangers_001/106/107.png`, each exactly one placed 11401 icon plus 1 pixel; the pointer rectangle shows on the map screens | P3 |
| Information window above the zoom window | `0x49e74` splits the type-10 rectangle into the square main map, an information area (upper half of the right panel) and the zoom window (lower half). While the pointer is in the main map, `0x4ba80` writes lines about the units within the zoom window's range, the units for which `0x49f8c` recorded a true result of `0x4c5ec` (P2-12/32), as many as fit (area height / font height). It draws them with font 1 at (x + 4, y + 4 + 8n), one index per line. `0x4b8fc` frames the three areas, the one under the pointer in a second colour | `font/hud/8x8-2` (delivered) | On all 9 map screens, every pixel in the information area that differs from its background is ink of `font/hud/8x8-2` runs on that grid (no other pixel); every frame pixel is in one of the two frame colours, with the main map's frame drawn last | P3 |

The map labels (`0x4af78`, covering `0x4afc0`–`0x4b360`) are leader lines (`0x5ad00`) and text in font 1, so they are code drawing and font text as well (§1.2).

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
| EXIC | 10211 | Three ID lists at 0x00, 0x08, 0x10 (7, 7, and 3 IDs), all EXPL entries. Each mission start loads 5, 5 and 3 consecutive entries of the three lists from random starts (Confirmed, EXE); Likely explosion variants by size or kind |

Additional slot/geometry comparisons are recorded in [mesh](./mesh.md#3-comparison-with-the-original-partial), including slots 7 and 17. The campaign source profiles in [scenario](./scenario.md#campaign-candidate-source-profiles-confirmed-structure) resolve the referenced slots without treating target labels as Asset IDs.
