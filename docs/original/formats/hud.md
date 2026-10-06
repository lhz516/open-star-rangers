---
type: format
status: draft
phase: P0
updated: 2026-10-06
related: [U-001, U-028, U-029, U-030]
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
| 11401 | 29 image records, drawn in the strategic map's zoom window by an index from a unit field | Confirmed (EXE drawing path, [below](#hud-and-map-drawing-paths-confirmed-exe)); image list structure Confirmed, see [below](#tabl-image-lists-confirmed-structure) |
| 10461 | 29 unit markers of 4×3 drawn in the strategic map's main area (records 20–25 are empty) | Confirmed (EXE drawing path); image list structure Confirmed |
| 10479, 10481 | 4 images each, 20×51 and 20×52: vertical gauge bars drawn on a left-display page; 10481 replaces 10479 for one craft type | Confirmed (EXE drawing path); image list structure Confirmed |
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
| `0x4ca80` | Loads the five-entry HUD set from one of three tables: HI `0x175e8c` (MFDD 10473, BITM 10467, TABL 10479, SNIP 10487, DIAG 10489); HI `0x175eb4` when the type byte at +0x28 of the object returned by `0x52694` is 6 (10475, 10469, 10481, 10487, 10489); LO `0x175ea0` (10477, 10471, 10483, 10487, 10491) |
| `0x4d50c` | Status display, into an off-screen buffer: one MFDD list-0 background (record 0, 1 or 2, chosen by thresholds on a ratio of two fields of the displayed craft) with `0x59cbc`, then list-1 records chosen per subsystem state, some blinking, with `0x59d38` |
| `0x4d0e0` | Copies that buffer with `0x59608` to (x0, y0 + 1) of its instrument rectangle, then draws two lines of message text from the DIAG entry's strings |
| `0x4d800` | A left-display page: BITM 10467 at (x0, y0 + 1) with `0x59608`; then two 10479 records chosen by fields of the target object, one near each side, with `0x59774`, drawing only the top rows (the record height less a layout constant); then labelled bars and text |
| `0x4da25`, `0x4dce9` | Other left-display pages: BITM 10467 at (x0, y0 + 1) with `0x59608`, then text |
| `0x4d010` | A frame of SNIP 10487 chosen by time, at (x0, y0 + 1) of a display. The SNIP layout is not documented |
| `0x49e00` | Loads TABL 10461 and 11401 for the strategic map |
| `0x49f8c` | Strategic map: for each unit, the 10461 record selected by a unit field in the main map area (records 26 and 27 also mark special positions), and the 11401 record selected by another unit field in the zoom window, each through `0x4abe4` |
| `0x4abe4` | Draws one record with `0x59774`, clipped to the given area. When given a colour, it then draws a one-pixel box from the record's top-left corner, one pixel wider and taller than the record |
| `0x4b56c` | Moves zoom-window icon positions so that their rectangles do not overlap; reads only record sizes |

No other code uses the 10461 and 11401 handles apart from loading and freeing them; the only other user is `0x4c674`, which draws one 10461 record through `0x4abe4`.

**Palettes:** the forward cockpit group (10103 slot 0) has no group palette, so the forward view and its HUD use the default palette, the DATA global palette ([textures](./textures.md#1-data-global-palette-confirmed), the production flight palette). The map screen uses the map group's palette for the whole screen ([cockpit](./cockpit.md#group-palette-and-drawing-confirmed)).

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
| F1 | Status display, marks after runs F1-07 and F1-08 | Unidentified | Unconfirmed | Two bracket-shaped 4×8 marks in the next character cells; no glyph of the three production fonts matches them there |
| F1 | Navigation display (right): grid and marker lines | Code drawing | Likely | One-pixel lines |
| F1 | Gauges in the four corner areas: level stripes | Code drawing | Likely | Horizontal one-pixel stripes. The HI gauge bars are drawn only on a left-display page (`0x4d800`) |
| F1 | Radar rings and crosshair | Code drawing | Likely | Circles and lines |
| F1 | Radar contacts | Unidentified | Unconfirmed | Only single-colour records match there (non-unique). TABL 10461, the only list of such small markers, is drawn only by the strategic map |
| F1 | Aiming reticle in the view | Code drawing | Likely | Circle and tick lines |
| F1 | Message line and the strip above the navigation display | Nothing drawn | Likely | No pixel of either instrument rectangle differs from the panel (3,111 and 584 pixels) |
| F1, Map | Text | Font text; two map places unidentified | Likely | [§1.2](#12-fonts-used-on-the-reference-screens-r7). On F1, a colon glyph in the next cell after F1-06 is also matched by both 8×8 fonts, and its code is mapped |
| Map | Frame, including the button labels | Packed bitmap: CCKD 10103 slot 2 | Confirmed | [cockpit](./cockpit.md#group-palette-and-drawing-confirmed) |
| Map | Grid | Code drawing | Likely | One-pixel lines |
| Map | Fog and covered areas | Code drawing | Likely | Uniform filled discs |
| Map | Range ring, target line, selection box | Code drawing | Likely | Ring, line and rectangle outline |
| Map | Mouse cursor | No separate cursor drawn | Likely | No pointer shape other than the selection box, which follows the mouse ([B-001](../behavior/B-001-strategic-map.md)) |
| Map | Small unit markers in the main map area | Packed bitmap: TABL 10461 | Confirmed | Drawing path above; in screenshots only non-unique (single-colour) matches |
| Map | Red ring markers in the main map area | Unidentified | Unconfirmed | No record matches a whole ring. Two-colour 10461 records match inside four of them, at 7 places (two in three of them), so those matches are not unique |
| Map | Zoom window icons | Packed bitmap: TABL 11401 | Confirmed | Drawing path above; record 17 exact |
| Map | Box around a zoom window icon | Code drawing | Confirmed | `0x4abe4` draws it after the icon |

Unidentified elements are handed to P3 and judged by P2-12 and P2-13.

**Outside the reference screens:** in seven other forward views, the left display shows BITM 10467 at (58,347). The HUD set also loads SNIP 10487, an animation drawn into a display, and DIAG 10489, the status display's message strings. Neither is an image record list, and neither is converted here (U-030).

**Image families:** every candidate family is included unless there is at least Likely evidence that the slice does not use it ([P2-07 rules](../../plan/p2/07/spec.md#研究与入选门槛)). Choices marked Confirmed rest on the drawing paths above.

| Family | Use | Palette | Transparency | Rows | Decision |
|---|---|---|---|---|---|
| Status display backgrounds, MFDD 10473 list 0 | Confirmed: `0x4d50c` chooses records 0–2 | Flight (Confirmed) | Opaque (Confirmed). Screenshots cannot show it: the 71 index-0 pixels of each record lie at the same positions, all over panel pixels of entry 0's colour | Stored (Confirmed) | Included, delivered |
| Status display overlays, MFDD 10473 list 1 | Confirmed: `0x4d50c` chooses them per subsystem state | Flight (Confirmed) | Colour key 0 (Confirmed) | Stored (Confirmed) | Included, delivered |
| Left-display page background, BITM 10467 | Confirmed: `0x4d800`, `0x4da25`, `0x4dce9` | Flight (Confirmed) | No index-0 pixels; drawn opaque | Stored (Confirmed) | Included through a [spec revision](../../plan/p2/07/spec.md#审批); delivered |
| HI gauge bars, TABL 10479 | Confirmed: `0x4d800` | Flight (Confirmed) | Colour key 0 (Confirmed) | Stored (Confirmed); only the top rows are drawn | Included, delivered |
| Map unit markers, TABL 10461 | Confirmed: `0x49f8c` | Map group palette (Confirmed) | Colour key 0 (Confirmed). Records 20–25 are entirely index 0 and draw nothing | Stored (Confirmed) | Included, delivered |
| Zoom window icons, TABL 11401 (all 29 records) | Confirmed for the list: `0x49f8c` draws the record a unit field selects. Which records the slice's units select is R8's question | Map group palette (Confirmed) | Colour key 0 (Confirmed) | Stored (Confirmed) | Included, delivered |
| MFDD 10475, BITM 10469, TABL 10481 | Loaded instead of 10473, 10467 and 10479 only when the type byte is 6. The reference forward view shows 10473 | — | — | — | Excluded (Likely) |

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

**R4 (Confirmed):** in HI the status display is MFDD 10473 unless the type byte is 6, which selects 10475; the slice's reference view shows 10473 (Likely the slice's craft is not type 6). List 0 is drawn opaque and list 1 with colour key 0.

**R6 (bounded check):** TABL 10165 holds 33 records that decode through its pixel pointers, each with at least two colour indices. None has an exact placement in any of the 92 captures, at scale 1 or 2, under the flight or map palette. The program loads 10165 only in `0x38ff4`, within a distance threshold of an object and together with a screen-mode change. It is therefore Likely not part of the reference screens, and its remaining questions pass to P4 (U-030).

## 3. ID lists (Confirmed structure)

{u32 offset, u32 count} at 0x00, then `count` u32 entry IDs.

| Type | Entry | Content |
|---|---|---|
| M2ID | 10649 | **Craft type → MODL ID**, 22 slots (two are 0). The EXE loads this entry by its ID when it opens the archives. Slot 0 and 1 both name the player craft's model; slot 14 names the transponder craft's model. Both match screenshots in shape (see [mesh](./mesh.md) §3) |
| NEBC | 10039, 10661 | Lists of BITM IDs; Likely nebula backgrounds |
| EXIC | 10211 | Three ID lists at 0x00, 0x08, 0x10 (7, 7, and 3 IDs), all EXPL entries; Likely explosion variants by size or kind |

Additional slot/geometry comparisons are recorded in [mesh](./mesh.md#3-comparison-with-the-original-partial), including slots 7 and 17. The campaign source profiles in [scenario](./scenario.md#campaign-candidate-source-profiles-confirmed-structure) resolve the referenced slots without treating target labels as Asset IDs.
