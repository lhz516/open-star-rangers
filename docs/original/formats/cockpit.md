---
type: format
status: draft
phase: P0
updated: 2026-10-28
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
| +0x0C | u32 | **Always-redraw flag.** Non-zero: `0x49b2c` calls every instrument record of the slot on every frame, and the pre-pass callbacks of types 0–4, 9 and 12 clear their rectangles first; the handlers then leave the copy to the screen to the frame-end copy. Passed to the activate, pre-pass and draw callbacks (EAX/EBX). In 10103 only slots 1 and 7 hold 1; in 10101 every slot but 2 | Confirmed (code and data, P3-13/01; [scheduling](#instrument-records-scheduling-and-visible-persistence-p3-1301)) |
| +0x10 | u32 ptr | Contiguous array of 52-byte elements | Confirmed |
| +0x14 | u32 | Element count; zero for empty slots | Confirmed |
| +0x18 | u32 ptr | Array of 48-byte instrument records: u32 type at +0, a screen rectangle (x0, y0, x1, y1, inclusive) at +4–+16; dispatched by type each frame | Confirmed (EXE and data): type, stride and dispatch ([below](#instrument-types-per-slot-confirmed-p3-0730)); every record field ([record fields](#instrument-records-scheduling-and-visible-persistence-p3-1301), P3-13/01, which also confirms the rectangle as each handler's drawing and copy bound) |
| +0x1C | u32 | Instrument record count | Confirmed (EXE, `0x49b2c`) |

The element pointer/count layout is validated by parsing every non-empty slot in 10097, 10101 and 10103 with the existing image parser. The eight directory slots are not eight non-empty views: slots 1 and 7 are empty in both full sets. Earlier group numbers below used a compact enumeration of non-empty groups; the table now uses actual directory slots. The palette pointer is set on slot 2 of 10101 and 10103 and on slot 0 of 10097, and is 0 on every other slot; its target is in the entry's relocation table. Each slot is selected by the view modes whose layout number it carries (+0x00, above); +0x0C and the instrument record fields are confirmed by P3-13/01 ([below](#instrument-records-scheduling-and-visible-persistence-p3-1301)). **Which set is loaded (Confirmed, EXE, P3-01/10):** TABL 10099 lists 10103, 10097 and 10101, and `0x497a0(n)` loads entry n − 1. The HUD set-up loads 10103 at start-up; entering the base interior (view mode 6) the view switch loads 10097, and leaving it loads 10103 again, or 10101 in LO ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)).

### Instrument types per slot (Confirmed, P3-07/30)

**Dispatch (Confirmed, EXE; native instructions read on a private read-only copy of the Ghidra project):**

- The frame render `0x3ee58` calls `0x49b2c` once per frame, only in view modes 1, 6, 8 and 0xC–0x12 (not in 0x13).
- `0x49b2c` returns when the loaded set has no selected slot (−1) or there is no player state. Otherwise it walks the selected slot's instrument records in ascending order, 48 bytes apart, up to the count at +0x1C. For each record that is due, or when the draw is forced ([scheduling](#instrument-records-scheduling-and-visible-persistence-p3-1301)), it calls the first registered handler whose type equals the record's +0.
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

### Instrument records, scheduling and visible persistence (P3-13/01)

Read-only static analysis of `SRANGERS.EXE` on a private copy of the Ghidra project (`-noanalysis -readOnly`) for [P3-13/01](../../plan/p3/13/subtasks/01-layout-scheduling-research.md#完成证据), with the record fields of 10103, 10101 and 10097 read through the shared IMFAT reader (structure fields and counts only; values stay in the ignored `local/research/p3-13/01-layout/`). Not observed at runtime.

**Record fields (48 bytes; Confirmed, code and data unless noted):**

| Offset | Meaning | Readers |
|---|---|---|
| +0x00 | Instrument type; the handler set registered for it by `0x49db4` | `0x49848`, `0x49b2c` |
| +0x04–+0x10 | Inclusive rectangle (x0, y0, x1, y1), passed to every callback; each handler draws and copies to the screen within it (the shapes per type are in [hud §4](./hud.md#4-instrument-overlay-and-map-drawing-p3-13)) | all callbacks |
| +0x14 | First stack argument of the draw callback; non-zero only on types 0–4, where it is the bar colour ([hud §4.2](./hud.md#42-corner-gauges-types-04)) | types 0–4 |
| +0x18 | Redraw interval in clock units. In slot 0 non-zero only for types 0, 1, 5 and 7; zero in every record of slots 2 and 7 (values in the local output) | `0x49b2c` |
| +0x1C | Last draw sample, written at run time; 0 in the data | `0x49b2c` |
| +0x20, +0x2C | 0 in every record; not read by the scheduler, the slot select or the pre-pass (that no handler reads them through the record pointer is Likely) | — |
| +0x24 | Relocated pointer to an i32 parameter table placed after the record array, passed to every callback; null when absent. Types 0–3 of slot 0 have one entry (the shaped-bar mode), type 9 four (two inclusive x ranges, which both its pre-pass clear and its copy use) | callbacks |
| +0x28 | Entry count of that table (0 when +0x24 is null) | No run-time reader found; the count relation is a data observation (Likely) |

The import needs only the slot identity, the always-redraw flag (directory +0x0C), the elements' +44/+48, and per record the type, rectangle, +0x14, +0x18 and the +0x24 table; never +0x1C, +0x20, +0x2C or any pointer.

**Scheduler `0x49b2c` (Confirmed, code):** with a player state and a selected slot it runs, in this order:

1. the global per-frame callbacks registered in `0x1a23a0`, in registration order — message-line expiry `0x4e964` (type 8), the left-display page callback `0x4cff4` (type 6), the instrument-9 warning update `0x4edf4` and the type-12 update `0x4f3e4`. They run in every view that calls `0x49b2c` (1, 6, 8, 0xC–0x12), whether or not the slot holds their type;
2. the pass-0 elements (`0x49c98`);
3. one clock sample (`0x186414`), then every record in stored order: its draw callback runs when directory +0x0C ≠ 0, the full-redraw flag `0x175c70` ≠ 0, +0x18 = 0, or (sample − +0x1C) > +0x18 (unsigned, strict); the call stores the sample in +0x1C. A type's handler is the first registered one; there is no unregister;
4. the pass-1 elements;
5. clear the full-redraw flag.

Without a player state it returns before step 1 and leaves the flag set.

**Full redraw (Confirmed, code):** only the layout select `0x49848` sets `0x175c70`, at every call (also when the slot does not change), and only the next `0x49b2c` that passes its player and slot checks clears it. `0x49848` also fills the frame buffer with index 0 and copies the whole screen (the screen goes black); it calls the activate callbacks only when the slot really changes (the radar computes its geometry, the map its areas, type 12 sets its own force flag). Its callers are the flight initialisation, the view switch `0x3f158` (every view change selects a layout, F1 → Warp included) and the display rebuild `0x3f500`. A full redraw also resets every record's last draw time to that frame's sample. Changing the left-display page does not set the flag (the page table forces its own redraw, [D15](./executable.md#d15-left-display-pages--confirmed-code)).

**Pre-pass `0x49a6c` (Confirmed, code):** called in views 1 and 0xC–0x12 only, it runs the per-frame callback of each record's type (panel-type record +0x0C), not an element callback ([FC2](./executable.md#fc2-layers-per-view-mode--confirmed-code) step 9). In slot 0 only the radar's callback acts: it erases the previous contacts in the frame buffer with index 0 and may toggle the blink phase ([hud §4.3](./hud.md#43-radar-type-5)); type 7's callback is a bare return. With +0x0C ≠ 0 the callbacks of types 0–4, 9 and 12 fill their rectangles (type 9: its two x ranges) with index 0.

**Frame-end copy in HI (Confirmed, code; corrects [FC1](./executable.md#fc1-one-render-per-main-loop-iteration--confirmed-code)):** when the viewport's bottom row (`0x3d324`) is below 479 — views 0xC, 1, 6, 0xE, 0xF and 0x10 — `0x5b29b` copies only rows 0–315 of the frame buffer to video memory; otherwise `0x5b312` copies the whole screen. The cockpit band (rows 316–479) of those views reaches the screen only through the per-handler rectangle copies (`0x583fc`, row copy `0x58578`) and the element copies. The local captures are DOSBox-X pictures of video memory, so they show these copies, not the frame buffer; the game's own screenshot `0x5800c` writes the frame buffer and is not a substitute.

**What each view shows (Confirmed, code; equivalence with a per-frame composition Likely):**

| View / slot | Erased each frame | Visible instrument area |
|---|---|---|
| 0xC / slot 0 | World layers as in FC2 (with `0x456e4`); the cockpit band of the buffer is never cleared | Rows 316–479 change only through copies: black at the layout select, the panel (element 0, +48 = 0) at the full redraw, then each handler's copy area whenever it is called and reaches its copy. A handler not called leaves the screen as last copied; pixels drawn into the buffer but not copied appear only at that area's next copy |
| 1 (Warp) / slot 0 | The whole buffer is filled with index 0 every frame; the panel is drawn only in the entry frame's full redraw | As for 0xC, but pixels of a copy area that the handler does not write are published as index 0. Types 0–3, 5, 6 (page 6), 7 and 8 write every pixel they copy (clear-then-draw or an opaque background, [hud §4](./hud.md#4-instrument-overlay-and-map-drawing-p3-13)), so Warp and F1 agree there. Type 9 copies only when it draws or erases a label; until then the screen keeps the panel copied in the entry frame, which is what `srangers_066` shows (none of the 102 non-zero panel pixels under type 9 is black). Type 12 copies its rectangle every call, but the panel there is all index 0 ([hud §4.8](./hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12)). Left-display page 6 covers its whole rectangle ([hud §4.4](./hud.md#44-left-display-type-6)) |
| 8 (map) / slot 2 | Buffer filled with 0, whole screen copied | Nothing persists: both records have interval 0 and all four elements are pass 1, every frame; a handler that skips a region leaves it index 0 in that frame |
| 0x11/8 / slot 7 | World layers as in FC2; whole screen copied | +0x0C = 1, so type 8 runs every frame and does not copy itself; what persists depends only on what type 8 overwrites ([hud §4.7](./hud.md#47-message-line-type-8)) |

Copy areas per type (Confirmed, code): types 0–3 in slot 0 copy their shapes row segment by row segment (`0x58578`); type 5 clears and copies the disc's row spans; types 6 (pages and SNIP) and 12 copy the whole rectangle; type 7 copies the whole rectangle when it draws (three sites); type 8 copies the whole rectangle after a removal (view 8 excepted) and otherwise its text band; type 9 copies its two x ranges only in a call that drew or erased a label; type 12 copies its rectangle in every call while its force flag is set, which is always after the first activation. In HI, `0x583fc` also copies the cleared rows 0–31 to video rows 480–511 in `0x3f440`, `0x3f158` and view 8, outside the visible 640×480 (Likely no visible effect).

**Slot 7 (Confirmed, code and data):** no elements, no element pointer and no palette, +0x0C = 1 and one type-8 record. `0x49c98` does nothing for zero elements and the scheduler still runs the record, so a slot with instruments and no images is valid; it is not an empty layout.

**Clock (Confirmed, code):** the scheduler runs once per render, that is once per main-loop iteration and dispatcher pass, with that pass's sample of the 1/64-s mission clock (u32, unsigned difference, strictly greater to be due). Evaluating it once per project tick at 2 units per tick is equivalent at the level of clock units; the real number of units per frame depends on the emulator's cycles ([U-021](../unknowns.md)), so no real-time cadence follows from these rules.

### Element, 52 bytes (Confirmed)

| Offset | Type | Meaning |
|---|---|---|
| +0 | Image record (36 bytes) | Encoding 0 or 2 |
| +36 | i32 | Screen x of the image's top-left corner |
| +40 | i32 | Screen y |
| +44 | u32 | Draw pass: 0 is drawn before the group's instrument records, 1 after them (Confirmed, EXE); 1 only in the strategic-map frame group |
| +48 | u32 | 1 redraws the element every frame; 0 draws it only when the whole cockpit is redrawn (Confirmed, EXE). In HI, `0x49c98` copies an element to the screen (`0x583fc`) after its draw decision when +48 = 0 and the frame is a full redraw, or when +44 ≠ 0; so a pass-1 element with +48 = 0 would be copied in frames where it was not drawn. No shipped element has that combination (Confirmed, code and data, P3-13/01). In slot 0 the only +48 = 0 element is the raw bottom panel, exactly rows 316–479; the three +48 = 1 elements lie within rows ≤ 315. Slot 2's four elements are all pass 1 and every frame: the map frame has no pass-0 element |

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

**10103 slot 0 is the HI forward cockpit (Likely).** Its 21,065 mismatching pixels all fall on the bottom panel in 17 regions where instruments are drawn over it at run time. The slot has 10 instrument records, one each of types 0–3, 5–9 and 12. Each record's rectangle at +4–+16 lies inside the 640×480 frame, and every mismatch region lies inside one of these rectangles (17 of 17 regions, 21,065 of 21,065 pixels). `0x49b2c` draws these records each frame after the +44 = 0 elements, so every mismatch has a recorded runtime overlay as its basis. By size the regions are two 96×97 MFD screens (the status display images are 96×96), four gauge-sized regions of about 30×55, the radar area with its rings (there is no crosshair, [hud §4.3](./hud.md#43-radar-type-5)), and small text-sized regions. The elements do not overlap. Where no instrument is drawn, the panel's index-0 pixels show the default palette's entry 0, consistent with the opaque draw. P2-07/15 matches each region to its instrument type. When 10097 is shown is Unconfirmed. Scripts: `local/research/p2-07/front-mismatch.ts`, `instrument-records.ts`.

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
- **Instrument rectangles (front):** every one of the 10 rectangles differs from the panel in at least one capture, so each is drawn at run time in some state. In R1's single screenshot only 8 did: the 183×17 rectangle of type 8 (the message line, 3,111 pixels) and the 73×8 rectangle of type 9 (the strip above the target display, 584 pixels) differ in 1 and 25 pixels across the 46 captures. Type 8 is the message line ([hud §4.7](./hud.md#47-message-line-type-8); its text band and whole-rectangle clear are matched in the captures there) and type 9 the two warning labels ([hud §4.8](./hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12)), both Confirmed (code, P3-13/05 and /07). Type 9's 25 pixels are its first x range erased to black on `srangers_109`–`117` (24) plus one pixel of the second range on `114`–`117`; the later recaptures add erased ranges on `123`–`128` and `132`–`135` (P3-13/07).

  | Record (type) | 0 (0) | 1 (1) | 2 (2) | 3 (3) | 4 (5) | 5 (7) | 6 (8) | 7 (6) | 8 (9) | 9 (12) |
  |---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
  | Rectangle | 30×55 | 30×55 | 30×55 | 30×55 | 117×110 | 96×97 | 183×17 | 96×97 | 73×8 | 23×6 |
  | Pixels differing in at least one capture | 699 | 703 | 672 | 613 | 994 | 9,263 | 1 | 9,312 | 25 | 82 |

  Basis of the exclusion: draw order Confirmed (EXE, [above](#group-palette-and-drawing-confirmed)); rectangle extent Confirmed (each handler's drawing and copy bound, [record fields](#instrument-records-scheduling-and-visible-persistence-p3-1301); earlier Likely).
- **Transparency:** opacity comes only from the draw path (raw elements write every pixel; RLE elements write only their opaque runs), never from capture colours. The front layout's three RLE elements leave 52,414 pixels unwritten, and the production frame is transparent at all of them: 47,084 vary across the captures (directly confirmed), the remaining 5,330 rest on the draw path (`0x49c98` through `0x59338`, Confirmed). The raw elements' index-0 pixels (686 front, 909 map) are opaque in the static region and match.
- **Map palette:** production `palette/map/screen` equals the expansion of slot 2's group palette, and every pixel of the 10 map captures has a colour of that palette. The flight palette check of the forward captures is in [textures](./textures.md#1-data-global-palette-confirmed).
- **Negative control:** moving one production element by 1 pixel fails both layouts.

**Capture re-audit for P3-13 (P3-13/07, 2026-10-28; Confirmed, counts):** the same static region (91,220 front, 124,701 map pixels), decoded independently from 10103 slots 0 and 2 under DATA and the slot-2 palette, was compared with all 132 local captures (all eligible native 640×480 VGA frames). Script and per-capture output: ignored `local/research/p3-13/comparison-plan/` (`capture-audit.ts`, `out/capture-audit.json`).

- **Front:** 59 captures match with 0 differing static pixels: the 46 above (`srangers_002`–`117`) and the 13 later recaptures `srangers_123`–`135`. No other capture comes close (the map screens differ on about 90,000 pixels). Every SHA-256 equals the one P2-12 recorded where P2-12 recorded one; `115`–`117` and `123`–`127` are outside P2-12's hash allow-list, which is why a filter on that list yields 51.
- **Map:** the same 10 captures as above match with 0 differences; `srangers_108` is also outside the allow-list.
- **Palette state:** in all 59 front captures every pixel of rows 316–479 is a DATA colour, and in the 10 map captures every pixel is a slot-2 palette colour, so none was taken during a screen flash. Only `srangers_066` (the Warp page) has non-DATA colours, 8,373 pixels, all in rows 0–315 (the Warp world, [WT8](./executable.md#wt8-what-view-mode-1-draws--confirmed-code-unless-marked)).
- **Destruction view:** in `srangers_091`, `092` and `122` the view label (TABL 10399 item 8, fonts/1 upper-cased, index 0xF at (0,0)) matches all 282 predicted pixels; fonts/0, a 1-pixel shift and item 7 reach at most 176. `srangers_014` shows item 7 instead (another external view).

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

**Instrument records (P3-13/11 and /30, local check, counts only):** `nob-check` reads 17 instrument slots with 66 records and 17 parameter tables (at most 4 entries each) across the 3 CCKD entries, every relocation checked. The project's converted instrument schedule (`data/hud/instruments`: 3 slots of 10103, one of them always-redraw, 8 elements, 13 records, 5 parameter tables with 8 entries in total and the 20 view distances) is 2,351 bytes for the baseline package, under the project's 8,192-byte payload cap; the browser import and the Node import give the same payload hash (P3-13/31).

The two element flag fields after the position (+44, +48) hold only 0 or 1 on every element: +44 is 1 on 8 of 38 elements and +48 on 33 of 38. Their meaning is confirmed ([element](#element-52-bytes-confirmed), P3-13/01).

## 4. Open questions

- The meaning of directory +0x08 (Likely the palette size) and a run-time reader of record +0x28 (Likely only the table length); directory +0x0C and the other record fields are confirmed ([P3-13/01](#instrument-records-scheduling-and-visible-persistence-p3-1301)). Layouts 1–5 and the LO set are outside the P3 slice (U-029).
- Whether the cursor keys that select slots 3–6 reach the flight key handler during flight (U-011).
