---
type: format
status: draft
phase: P0
updated: 2026-10-04
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
| +0x00–0x0F | 16 bytes | Additional group metadata | Unconfirmed |
| +0x10 | u32 ptr | Contiguous array of 52-byte elements | Confirmed |
| +0x14 | u32 | Element count; zero for empty slots | Confirmed |
| +0x18–0x1F | 8 bytes | Additional group metadata | Unconfirmed |

The element pointer/count layout is validated by parsing every non-empty slot in 10097, 10101 and 10103 with the existing image parser. The eight directory slots are not eight non-empty views: slots 1 and 7 are empty in both full sets. Earlier group numbers below used a compact enumeration of non-empty groups; the table now uses actual directory slots. U-029 remains open for additional metadata, selection behavior and palette bindings.

### Element, 52 bytes (Confirmed)

| Offset | Type | Meaning |
|---|---|---|
| +0 | Image record (36 bytes) | Encoding 0 or 2 |
| +36 | i32 | Screen x of the image's top-left corner |
| +40 | i32 | Screen y |
| +44 | u32 | 0 or 1; 1 only in the strategic-map frame group, Likely "uses another palette" (U-029) |
| +48 | u32 | 0 or 1; meaning Unconfirmed |

### Groups in the HI set

| Directory slot | Elements | Likely role | Evidence |
|---|---|---|---|
| 0 | 4: bottom panel 640×164 at y 316, two side struts, a thin strip | Forward cockpit (F1) | Composite matches the original F1 screenshot in layout and colour (DATA palette) |
| 1, 7 | Empty | Unconfirmed | Zero element counts |
| 2 | 4: top 640×48, sides 82 and 79 wide, bottom 640×51 | Strategic-map frame | Matches the original map screen in layout; colours wrong with DATA, so another palette is used (U-029) |
| 3–5 | 2 each: one large sprite plus a lower panel | Looking back, left, and right from the cockpit | Show the seat and side consoles from those angles; which keys select them is Unconfirmed |
| 6 | 3: two 480-high side pillars and a top bar | A narrow full-height frame | Role Unconfirmed |

The LO set uses the same structure with 320×240 coordinates; its slot 2 still uses 640×480 coordinates, so the map frame is shared between modes (Likely).

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

## 3. Open questions

- Additional group metadata, the alternate-palette flag, and which palette the map frame uses (U-029).
- Which key or state selects CCKD slots 3–6.
