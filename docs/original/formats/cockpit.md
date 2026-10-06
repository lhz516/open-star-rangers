---
type: format
status: draft
phase: P0
updated: 2026-10-05
related: [U-001, U-006, U-029]
---

# Cockpit and MFD graphics (CCKD, MFDD)

Container format: [IMFAT](./imfat.md); images use the [image record](./textures.md#2-image-record-36-bytes-confirmed). Confidence labels as defined in the IMFAT doc. Structure only; no original content. Composites and renders stay in `local/research/`.

## 1. CCKD: cockpit layouts

`SR.NOB` has three CCKD entries:

| Entry | Size | Content | Status |
|---|---|---|---|
| 10103 | 827 KB | HI (640×480) cockpit set: 6 element groups | Confirmed (layout), Likely (roles) |
| 10101 | 312 KB | LO (320×240) cockpit set: the same 6 non-empty slots at half size, except slot 2 | Confirmed (layout) |
| 10097 | 142 KB | HI forward cockpit only (one slot, same layout as 10103 slot 0) | Confirmed (layout) |

### Header (partly decoded)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 ptr, u32 count | Three bitmap fonts {u32 offset, u32 size}: two 8×8 and one 4×6 (Confirmed, see [hud](./hud.md) §1) |
| 0x08 | u32 ptr, u32 count | Directory of 32-byte group records: 1 slot in 10097, 8 slots in 10101 and 10103 (Confirmed structure) |

### Group directory (Confirmed structure on all three entries)

| Record offset | Type | Meaning | Status |
|---|---|---|---|
| +0x00 | 4 bytes | Group metadata | Unconfirmed |
| +0x04 | u32 ptr | The group's palette: 256 entries of 6-bit VGA RGB (768 bytes, the DATA format); 0 when the group has none, which selects the default palette | Confirmed (EXE and screenshots, [below](#group-palette-and-drawing-confirmed)) |
| +0x08 | u32 | 768 when +0x04 is set, otherwise 0 (observed on every slot of all 3 entries); Likely the palette size in bytes. The palette path does not read it | Observed invariant; meaning Likely |
| +0x0C | u32 | Passed to the instrument handlers each frame | Meaning Unconfirmed |
| +0x10 | u32 ptr | Contiguous array of 52-byte elements | Confirmed |
| +0x14 | u32 | Element count; zero for empty slots | Confirmed |
| +0x18 | u32 ptr | Array of 48-byte instrument records: u32 type at +0, a screen rectangle (x0, y0, x1, y1, inclusive) at +4–+16; dispatched by type each frame | Structure Likely (EXE and screenshot, [below](#front-cockpit-source-r1)); other fields Unconfirmed |
| +0x1C | u32 | Instrument record count | Likely (EXE) |

The element pointer/count layout is validated by parsing every non-empty slot in 10097, 10101 and 10103 with the existing image parser. The eight directory slots are not eight non-empty views: slots 1 and 7 are empty in both full sets. Earlier group numbers below used a compact enumeration of non-empty groups; the table now uses actual directory slots. The palette pointer is set on slot 2 of 10101 and 10103 and on slot 0 of 10097, and is 0 on every other slot; its target is in the entry's relocation table. U-029 remains open for the remaining metadata and the selection of slots 3–6.

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
| 0 | 4: bottom panel 640×164 at y 316, two side struts, a thin strip | Forward cockpit (F1) | Composite matches the original F1 screenshot except where instruments are drawn over it (DATA palette, [below](#front-cockpit-source-r1)) |
| 1, 7 | Empty | Unconfirmed | Zero element counts |
| 2 | 4: top 640×48, sides 82 and 79 wide, bottom 640×51 | Strategic-map frame | Every pixel the frame covers matches the original map screens under the group's own palette ([below](#group-palette-and-drawing-confirmed)) |
| 3–5 | 2 each: one large sprite plus a lower panel | Looking back, left, and right from the cockpit | Show the seat and side consoles from those angles; which keys select them is Unconfirmed |
| 6 | 3: two 480-high side pillars and a top bar | A narrow full-height frame | Role Unconfirmed |

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

### Bounded canonical graphics projection

**Confirmed structure/counts:** `local/research/p2-01/fixed-graphics-profile.ts` uses the public Asset-reference syntax checks and existing image/font/MFDD parsers to enumerate the fixed HI resources: two layout units for slots 0 and 2, eight associated image units, three font libraries, and twelve image units from player status MFDD 10473. This is a partial 25-unit projection with eight layout-to-image edges, not the complete slice graph. Header fields, layer indices and dimensions stay in the ignored local report; no original pixels or strings enter tracked output.

**Unconfirmed bindings:** palettes, HUD gauges, map/radar symbols, weapons/effects, core audio and runtime-created objects are not closed by this projection. It explicitly remains incomplete and cannot by itself satisfy P2-01/S-02 or prove any candidate qualified.

## 2. MFDD: multi-function display images (Confirmed structure)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 ptr, u32 count | List 0 of image records |
| 0x08 | u32 ptr, u32 count | List 1 of image records |

| Entry | Images | Content |
|---|---|---|
| 10473 | 3 + 9 of 96×96 | Ship status display: list 0 holds three full backgrounds (the ship outline with different shield-glow levels), list 1 holds nine labelled subsystem-damage overlays on a black background |
| 10475 | 3 + 9 of 96×96 | Same structure; Likely another craft's status display |
| 10477 | 3 + 9 of 48×48 | LO version |

All images are raw (encoding 0) and display with correct colours using DATA. Overlays Likely treat colour 0 as transparent (Unconfirmed).

## 3. Observed counts against the P2-07 limits (Confirmed)

The container limits come from [the P2-07 spec](../../plan/p2/07/spec.md#限值与预算). The record and element sizes are format rules; the counts are safety caps above these baseline values. `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` (2026-10-05) reads every CCKD directory and MFDD list with the shared container readers and decodes every element and record with the shared image reader; all 3 CCKD and 3 MFDD entries pass. The run is recorded in [P2-07 subtask 07](../../plan/p2/07/subtasks/07-local-structure-check.md#完成证据).

| Quantity | Baseline maximum | P2-07 limit |
|---|---:|---:|
| CCKD directory slots | 8 (10101, 10103); 1 in 10097 | 1–8 |
| Elements per slot | 4 | 0–16 |
| CCKD elements decoded | 38 in total, up to 640×480 | image limits of P2-05 |
| MFDD records per list | 9 | 0–16 |

The two element flag fields after the position (+44, +48) hold only 0 or 1 on every element: +44 is 1 on 8 of 38 elements and +48 on 33 of 38. Which elements set them, and what they mean, remains U-029.

## 4. Open questions

- Directory +0x00 and +0x0C, the meaning of +0x08, and the instrument record fields after the rectangle, including the pointer at +36 that some records hold (U-029). The records give the HUD instrument areas, which P2-07 leaves to P3.
- Which key or state selects CCKD slots 3–6, and when 10097 is used.
