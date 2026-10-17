---
type: format
status: draft
phase: P0
updated: 2026-10-14
related: [U-001, U-006, U-011, U-029]
---

# Cockpit and MFD graphics (CCKD, MFDD)

Container format: [IMFAT](./imfat.md); images use the [image record](./textures.md#2-image-record-36-bytes-confirmed). Confidence labels as defined in the IMFAT doc. Structure only; no original content. Composites and renders stay in `local/research/`.

## 1. CCKD: cockpit layouts

`SR.NOB` has three CCKD entries:

| Entry | Size | Content | Status |
|---|---|---|---|
| 10103 | 827 KB | HI (640×480) cockpit set: 6 element groups | Confirmed (layout), Likely (roles) |
| 10101 | 312 KB | LO (320×240) cockpit set: the same 6 non-empty slots at half size, except slot 2 | Confirmed (layout) |
| 10097 | 142 KB | HI forward cockpit only (one slot, same layout as 10103 slot 0); the cockpit set of the base interior (view mode 6) | Confirmed (layout; use by EXE, P3-01/10) |

### Header (partly decoded)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 ptr, u32 count | Three bitmap fonts {u32 offset, u32 size}: two 8×8 and one 4×6 (Confirmed, see [hud](./hud.md) §1) |
| 0x08 | u32 ptr, u32 count | Directory of 32-byte group records: 1 slot in 10097, 8 slots in 10101 and 10103 (Confirmed structure) |

### Group directory (Confirmed structure on all three entries)

| Record offset | Type | Meaning | Status |
|---|---|---|---|
| +0x00 | i32 | Layout number: `0x49848` shows the slot whose +0x00 equals the layout number that `0x3f158` derives from the current view mode ([executable](./executable.md#automatic-views-and-cameras-p3-0109)). Slots 0–7 of 10103 and of 10101 hold 0, 5, 6, 1, 2, 3, 4 and 8; the only slot of 10097 holds 0 | Confirmed (EXE and data, P3-01/09) |
| +0x04 | u32 ptr | The group's palette: 256 entries of 6-bit VGA RGB (768 bytes, the DATA format); 0 when the group has none, which selects the default palette | Confirmed (EXE and screenshots, [below](#group-palette-and-drawing-confirmed)) |
| +0x08 | u32 | 768 when +0x04 is set, otherwise 0 (observed on every slot of all 3 entries); Likely the palette size in bytes. The palette path does not read it | Observed invariant; meaning Likely |
| +0x0C | u32 | Passed to the instrument handlers each frame | Meaning Unconfirmed |
| +0x10 | u32 ptr | Contiguous array of 52-byte elements | Confirmed |
| +0x14 | u32 | Element count; zero for empty slots | Confirmed |
| +0x18 | u32 ptr | Array of 48-byte instrument records: u32 type at +0, a screen rectangle (x0, y0, x1, y1, inclusive) at +4–+16; dispatched by type each frame | Type at +0, the 48-byte stride and the dispatch Confirmed (EXE, [below](#instrument-types-per-slot-confirmed-p3-0730)); rectangle Likely (EXE and screenshot, [below](#front-cockpit-source-r1)); the scheduler fields +0x18 and +0x1C Confirmed (EXE, [below](#instrument-types-per-slot-confirmed-p3-0730)); other fields Unconfirmed |
| +0x1C | u32 | Instrument record count | Confirmed (EXE, `0x49b2c`) |

The element pointer/count layout is validated by parsing every non-empty slot in 10097, 10101 and 10103 with the existing image parser. The eight directory slots are not eight non-empty views: slots 1 and 7 are empty in both full sets. Earlier group numbers below used a compact enumeration of non-empty groups; the table now uses actual directory slots. The palette pointer is set on slot 2 of 10101 and 10103 and on slot 0 of 10097, and is 0 on every other slot; its target is in the entry's relocation table. Each slot is selected by the view modes whose layout number it carries (+0x00, above); U-029 remains open for +0x0C and the instrument record fields. **Which set is loaded (Confirmed, EXE, P3-01/10):** TABL 10099 lists 10103, 10097 and 10101, and `0x497a0(n)` loads entry n − 1. The HUD set-up loads 10103 at start-up; entering the base interior (view mode 6) the view switch loads 10097, and leaving it loads 10103 again, or 10101 in LO ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)).

### Instrument types per slot (Confirmed, P3-07/30)

**Dispatch (Confirmed, EXE; native instructions read on a private read-only copy of the Ghidra project):**

- The frame render `0x3ee58` calls `0x49b2c` once per frame, only in view modes 1, 6, 8 and 0xC–0x12 (not in 0x13).
- `0x49b2c` returns when the loaded set has no selected slot (−1). Otherwise it walks the selected slot's instrument records in ascending order, 48 bytes apart, up to the count at +0x1C. For each record that is due, or when the draw is forced (gate in [T7](./executable.md#t7-right-target-display-confirmed-code)), it calls the first registered handler whose type equals the record's +0.
- The slot is the one whose +0x00 equals the layout number that `0x3f158` derives from the view mode ([automatic views](./executable.md#automatic-views-and-cameras-p3-0109); its jump table was re-read for this section and agrees).

**Types in record order (Confirmed, data):**

| Entry | Slot | Layout | Records | Types, in record order |
|---|---|---|---:|---|
| 10103 | 0 | 0 | 10 | 0, 1, 2, 3, 5, 7, 8, 6, 9, 12 |
| 10103 | 1 | 5 | 11 | 1, 0, 2, 3, 4, 5, 7, 8, 6, 9, 12 |
| 10103 | 2 | 6 | 2 | 10, 8 |
| 10103 | 3–7 | 1, 2, 3, 4, 8 | 1 each | 8 |
| 10101 | 0 | 0 | 10 | 0, 1, 2, 3, 5, 7, 6, 8, 9, 12 |
| 10101 | 1 | 5 | 11 | 1, 0, 2, 3, 4, 5, 7, 6, 9, 12, 8 |
| 10101 | 2 | 6 | 2 | 10, 8 |
| 10101 | 3–7 | 1, 2, 3, 4, 8 | 1 each | 8 |
| 10097 | 0 | 0 | 10 | 0, 1, 2, 3, 5, 7, 8, 6, 9, 12 |

No type occurs twice in a slot. The ignored script `local/research/p3-07/contract-facts/instrument-order.ts` reads only the directory and each record's +0, through the shared IMFAT reader with bounds checks.

**Consequences (Confirmed, EXE and data):**

- Types 7 (right display, [T7](./executable.md#t7-right-target-display-confirmed-code)) and 6 (left display, [T8](./executable.md#t8-left-display-no-target-reads-confirmed-code)) occur once each in layouts 0 and 5 and in no other slot. Their handlers therefore run only in view modes 0xC and 1 (layout 0), 6 (layout 0 of 10097) and 0xD (layout 5). The cursor-key views (layouts 1–4) and the external views (layout 8) have only type 8, the message line; the map (layout 6) has types 10 and 8.
- In every slot that holds them, type 7 comes before type 6. When both are due in the same frame, the right display's target clearing (T7) therefore runs before the left display's page-0 status display ([D9](./executable.md#d9-status-display-writes-subsystem-fields-1-5-and-8--confirmed-code)).
- The LO set places type 8 differently from the HI set; the order of types 7 and 6 is the same in all three entries.
- **Record fields read for the map (type 10; Confirmed, EXE, P3-05/03 and P3-09/04):** `0x49b2c` reads every record's +0x18 as a redraw interval in clock units (draw when it is 0, when forced, or when the sample minus +0x1C exceeds it, unsigned) and writes the sample to +0x1C (last draw time, run-time state); it passes +0x14 and +0x24 to the handler. The map's activation `0x49e74` reads only the inclusive rectangle +0x04–+0x10 (main map side = y1 − y0 + 1; the information and zoom strip x0 + side … x1, excluding the last column, each half the side tall), and the map draw `0x49f8c` reads none of +0x14, +0x18 or +0x24 itself ([zoom window](./executable.md#zoom-window-information-window-and-labels-p3-0904)). With the shipped type-10 records the map draws on every frame (data; values not recorded). The map's rule geometry therefore needs only the rectangle, and the interval to confirm every-frame drawing.

### Element, 52 bytes (Confirmed)

| Offset | Type | Meaning |
|---|---|---|
| +0 | Image record (36 bytes) | Encoding 0 or 2 |
| +36 | i32 | Screen x of the image's top-left corner |
| +40 | i32 | Screen y |
| +44 | u32 | Draw pass: 0 is drawn before the group's instrument records, 1 after them (Confirmed, EXE); 1 only in the strategic-map frame group |
| +48 | u32 | 1 redraws the element every frame; 0 draws it only when the whole cockpit is redrawn (Confirmed, EXE) |

### Groups in the HI set

| Directory slot | Elements | Likely role | Evidence |
|---|---|---|---|
| 0 | 4: bottom panel 640×164 at y 316, two side struts, a thin strip | Forward cockpit (F1) | Composite matches the original F1 screenshot except where instruments are drawn over it (DATA palette, [below](#front-cockpit-source-r1)). Layout 0, used by F1 (view mode 0xC), the Warp (mode 1) and the base interior (mode 6) (Confirmed, EXE) |
| 1 | Empty | Full-screen view (F2) | Layout 5, used by view mode 0xD, which F2 selects (Confirmed, EXE); zero element count |
| 7 | Empty | External views | Layout 8, used by view mode 0x11: the F3–F10 external views and the automatic destruction view (Confirmed, EXE); zero element count |
| 2 | 4: top 640×48, sides 82 and 79 wide, bottom 640×51 | Strategic-map frame | Every pixel the frame covers matches the original map screens under the group's own palette ([below](#group-palette-and-drawing-confirmed)). Layout 6, used by the map (view mode 8) (Confirmed, EXE) |
| 3–5 | 2 each: one large sprite plus a lower panel | Looking back, left, and right from the cockpit | Show the seat and side consoles from those angles. Layouts 1, 2 and 3, used by view modes 0x10, 0xF and 0xE, which the flight key handler posts for the Down, Left and Right cursor-key codes (Confirmed, EXE); whether those keys reach that handler in flight is U-011 |
| 6 | 3: two 480-high side pillars and a top bar | A narrow full-height frame | Layout 4, used by view mode 0x12 (the keypad-centre code; Confirmed, EXE); role Unconfirmed |

The LO set uses the same structure with 320×240 coordinates; its slot 2 still uses 640×480 coordinates, so the map frame is shared between modes (Likely). Both sets' slot-2 palettes are identical.

### Group palette and drawing (Confirmed)

Read-only analysis of `SRANGERS.EXE` (addresses only; no decompiled code is kept in tracked files):

- **Palette:** when a slot is selected, `0x49848` reads its directory +0x04. A nonzero pointer is passed to `0x3d1c0`, which reads 256 RGB triples of 6-bit components into the colour table, and the same pointer is passed on to `0x58288`; a null pointer passes the default palette instead. The palette therefore has the DATA format and applies to the whole screen while the slot is shown.
- **Draw order:** each frame `0x49b2c` draws the selected group's elements with +44 = 0 (`0x49c98`, first pass), dispatches the instrument records, then draws the elements with +44 = 1 (second pass).
- **Element draw:** `0x49c98` sends a raw record (encoding 0) to `0x59608`, a row copy that writes every pixel; a sprite RLE record goes to `0x59338`. A colour-keyed copy, `0x59774`, exists but is not used for elements. Raw elements are therefore opaque, index 0 included; sprite transparency comes from the encoding.

**Screenshot evidence (Confirmed):** composing slot 2 of 10103 under its +0x04 palette with the production composition matches 124,701 of 124,701 opaque pixels in each of the four map screenshots `srangers_000.png`, `srangers_001.png`, `srangers_004.png` and `srangers_059.png`. Each of the 216 indices the frame uses shows exactly one colour across all four screenshots, and a search of every covered file for a palette with those colours finds only the +0x04 targets of 10101 and 10103 slot 2. No DATA entry or embedded record palette in the seven `MAIN/` archives reproduces the frame (the best of 56 distinct candidates matches 4% of its pixels). Scripts: `local/research/p2-07/cockpit-palette.ts`, `map-palette-search.ts`, `map-palette-pointer.ts`, `group-palette-compare.ts`.

### Front cockpit source (R1)

Slot 0 of 10097 and slot 0 of 10103 have the same element count, positions and flags, but different images, and 10097's slot has its own palette. Against the F1 screenshot `srangers_002.png`:

| Composite | Matching pixels |
|---|---:|
| 10103 slot 0, DATA palette (Likely the default palette) | 111,440 / 132,505 |
| 10097 slot 0, its own palette | 51,503 / 132,505 |
| 10097 slot 0, DATA palette | 16,066 / 132,505 |

**10103 slot 0 is the HI forward cockpit (Likely).** Its 21,065 mismatching pixels all fall on the bottom panel in 17 regions where instruments are drawn over it at run time. The slot has 10 instrument records, one each of types 0–3, 5–9 and 12. Each record's rectangle at +4–+16 lies inside the 640×480 frame, and every mismatch region lies inside one of these rectangles (17 of 17 regions, 21,065 of 21,065 pixels). `0x49b2c` draws these records each frame after the +44 = 0 elements, so every mismatch has a recorded runtime overlay as its basis. By size the regions are two 96×97 MFD screens (the status display images are 96×96), four gauge-sized regions of about 30×55, the radar area with its crosshair lines, and small text-sized regions. The elements do not overlap. Where no instrument is drawn, the panel's index-0 pixels show the default palette's entry 0, consistent with the opaque draw. P2-07/15 matches each region to its instrument type. When 10097 is shown is Unconfirmed. Scripts: `local/research/p2-07/front-mismatch.ts`, `instrument-records.ts`.

### Production composites and element overlaps (R5)

Local check of [P2-07 subtask 15](../../plan/p2/07/subtasks/15-local-composite-check.md#完成证据), 2026-10-06. The local disc is opened through the product entry. The production graphics step converts the layouts, element images and palettes, and the production `composeLayout` draws each 640×480 frame. Script: `local/research/p2-07/composite-check.ts`. Only covered (opaque) frame pixels are compared, exactly, without scaling.

| Layout | Overlapping opaque pixels | Screenshot | Compared | Matching | Differing pixels |
|---|---:|---|---:|---:|---|
| Front cockpit (10103 slot 0) | 0 | `srangers_002.png` | 132,505 | 111,440 | 21,065, all inside 8 of the slot's 10 instrument rectangles, drawn each frame over the elements ([above](#front-cockpit-source-r1)) |
| Map frame (10103 slot 2) | 161 | `srangers_059.png`, `srangers_000.png`, `srangers_001.png`, `srangers_004.png` | 124,701 each | 124,701 each | None |

**Draw order (Confirmed for these layouts):** the front cockpit elements do not overlap. The map frame elements overlap on 161 opaque pixels, where every covering element has the same colour. Any draw order therefore gives the same frame, and the four map screenshots match the stored-order composite there. The production results equal the research composites of P2-07/08.

#### All qualifying captures (P2-12)

Local check of [P2-12 subtask 16](../../plan/p2/12/subtasks/16-layout-comparison.md#完成证据), 2026-10-07, on the P2-12 candidate (commit `97b70de`, converter version `osr-import.graphics-2.logic-1.audio-1.models-2`). The production `composeLayout` output is compared with an expected frame that an independent script decodes from CCKD 10103 and DATA 11075 (§1 and [textures](./textures.md#2-image-record-36-bytes-confirmed)), without the production converters. Each pixel is classed by the original draw path, not by the tested output: *static* (compared), *excluded* (a pass-0 element pixel inside an instrument rectangle, drawn over every frame), *transparent* (inside an element rectangle but not written) or *uncovered* (outside every element). Captures are native 640×480. Script: ignored `local/research/p2-12/layouts/layout-compare.ts`.

| Layout | Captures | Static pixels | Compared pixels | Differing | Excluded |
|---|---|---:|---:|---:|---|
| Front cockpit (10103 slot 0) | 46, `srangers_002.png`–`srangers_117.png` as listed in P2-12/13's inventory | 91,220 | 4,196,120 | 0 | The 10 instrument rectangles, 41,285 pixels |
| Map frame (10103 slot 2) | 10: `srangers_000/001/004/059/088/104–108.png` | 124,701 | 1,247,010 | 0 | None |

- **No selection bias:** over all 118 qualifying captures, the static region matches exactly in these 46 and 10 captures and in no other; every other capture differs on more than 25% of it.
- **Structure:** element count, order, positions, sizes, palette references, per-pixel masks and indices, and the 256 palette entries of both layouts equal the independent decode; so do the full-frame opaque masks and colours.
- **Instrument rectangles (front):** every one of the 10 rectangles differs from the panel in at least one capture, so each is drawn at run time in some state. In R1's single screenshot only 8 did: the 183×17 rectangle of type 8 (the message line, 3,111 pixels) and the 73×8 rectangle of type 9 (the strip above the navigation display, 584 pixels) differ in 1 and 25 pixels across the 46 captures. What is drawn there is Unconfirmed.

  | Record (type) | 0 (0) | 1 (1) | 2 (2) | 3 (3) | 4 (5) | 5 (7) | 6 (8) | 7 (6) | 8 (9) | 9 (12) |
  |---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
  | Rectangle | 30×55 | 30×55 | 30×55 | 30×55 | 117×110 | 96×97 | 183×17 | 96×97 | 73×8 | 23×6 |
  | Pixels differing in at least one capture | 699 | 703 | 672 | 613 | 994 | 9,263 | 1 | 9,312 | 25 | 82 |

  Basis of the exclusion: draw order Confirmed (EXE, [above](#group-palette-and-drawing-confirmed)); rectangle extent Likely (directory +0x18 structure).
- **Transparency:** opacity comes only from the draw path (raw elements write every pixel; RLE elements write only their opaque runs), never from capture colours. The front layout's three RLE elements leave 52,414 pixels unwritten, and the production frame is transparent at all of them: 47,084 vary across the captures (directly confirmed), the remaining 5,330 rest on the draw path (`0x49c98` through `0x59338`, Confirmed). The raw elements' index-0 pixels (686 front, 909 map) are opaque in the static region and match.
- **Map palette:** production `palette/map/screen` equals the expansion of slot 2's group palette, and every pixel of the 10 map captures has a colour of that palette. The flight palette check of the forward captures is in [textures](./textures.md#1-data-global-palette-confirmed).
- **Negative control:** moving one production element by 1 pixel fails both layouts.

### Bounded canonical graphics projection

**Confirmed structure/counts:** `local/research/p2-01/fixed-graphics-profile.ts` uses the public Asset-reference syntax checks and existing image/font/MFDD parsers to enumerate the fixed HI resources: two layout units for slots 0 and 2, eight associated image units, three font libraries, and twelve image units from player status MFDD 10473. This is a partial 25-unit projection with eight layout-to-image edges, not the complete slice graph. Header fields, layer indices and dimensions stay in the ignored local report; no original pixels or strings enter tracked output.

**Unconfirmed bindings:** palettes, HUD gauges, map/radar symbols, weapons/effects, core audio and runtime-created objects are not closed by this projection. It explicitly remains incomplete and cannot by itself satisfy P2-01/S-02 or prove any candidate qualified.

**Superseded by P2-07:** the [P2-07 production mappings](../../plan/p2/07/spec.md#生产-asset-与来源) now bind both layouts with their eight element images, the twelve status display images, the map palette (slot 2's group palette), and the gauge bar, left-display page background, map unit marker and zoom window icon families, each with its palette and transparency, so this projection is historical for those Assets; radar contacts, weapons/effects and runtime-created objects are not among them.

## 2. MFDD: multi-function display images (Confirmed structure)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 ptr, u32 count | List 0 of image records |
| 0x08 | u32 ptr, u32 count | List 1 of image records |

| Entry | Images | Content |
|---|---|---|
| 10473 | 3 + 9 of 96×96 | Ship status display: list 0 holds three full backgrounds (the ship outline with different shield-glow levels), list 1 holds nine labelled subsystem-damage overlays on a black background |
| 10475 | 3 + 9 of 96×96 | Same structure; replaces 10473 in HI in the base interior, view mode 6 (Confirmed, EXE; [hud](./hud.md#hud-and-map-drawing-paths-confirmed-exe); read as a craft type until P3-01/10) |
| 10477 | 3 + 9 of 48×48 | LO version |

All images are raw (encoding 0) and display with correct colours using DATA. The status display draws one list-0 background opaque and then the list-1 overlays with colour key 0 (Confirmed, EXE; [hud](./hud.md#hud-and-map-drawing-paths-confirmed-exe)).

## 3. Observed counts against the P2-07 limits (Confirmed)

The container limits come from [the P2-07 spec](../../plan/p2/07/spec.md#限值与预算). The record and element sizes are format rules; the counts are safety caps above these baseline values. `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` (2026-10-05) reads every CCKD directory and MFDD list with the shared container readers and decodes every element and record with the shared image reader; all 3 CCKD and 3 MFDD entries pass. The run is recorded in [P2-07 subtask 07](../../plan/p2/07/subtasks/07-local-structure-check.md#完成证据).

| Quantity | Baseline maximum | P2-07 limit |
|---|---:|---:|
| CCKD directory slots | 8 (10101, 10103); 1 in 10097 | 1–8 |
| Elements per slot | 4 | 0–16 |
| CCKD elements decoded | 38 in total, up to 640×480 | image limits of P2-05 |
| MFDD records per list | 9 | 0–16 |
| CCKD group palettes read | 3: 10097 slot 0, 10101 slot 2, 10103 slot 2 (2026-10-06, [P2-07 subtask 18](../../plan/p2/07/subtasks/18-cockpit-group-palette.md#完成证据)); every other slot's +0x04 is 0 | +0x08 = 768; components ≤ 63 |

The two element flag fields after the position (+44, +48) hold only 0 or 1 on every element: +44 is 1 on 8 of 38 elements and +48 on 33 of 38. Which elements set them, and what they mean, remains U-029.

## 4. Open questions

- Directory +0x0C, the meaning of +0x08, and the instrument record fields after the rectangle, including the pointer at +36 that some records hold (U-029). The records give the HUD instrument areas, which P2-07 leaves to P3.
- Whether the cursor keys that select slots 3–6 reach the flight key handler during flight (U-011).
