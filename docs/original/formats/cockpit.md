---
type: format
status: draft
phase: P0
updated: 2026-10-01
related: [U-001, U-006, U-029]
---

# Cockpit and MFD graphics (CCKD, MFDD)

Container format: [IMFAT](./imfat.md); images use the [image record](./textures.md#2-image-record-36-bytes-confirmed). Confidence labels as defined in the IMFAT doc. Structure only; no original content. Composites and renders stay in `local/research/`.

## 1. CCKD: cockpit layouts

`SR.NOB` has three CCKD entries:

| Entry | Size | Content | Status |
|---|---|---|---|
| 10103 | 827 KB | HI (640×480) cockpit set: 6 element groups | Confirmed (layout), Likely (roles) |
| 10101 | 312 KB | LO (320×240) cockpit set: the same 6 groups at half size, except group 1 | Confirmed (layout) |
| 10097 | 142 KB | HI forward cockpit only (one group, same layout as 10103 group 0) | Confirmed (layout) |

### Header (partly decoded)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 ptr, u32 count | Three bitmap fonts {u32 offset, u32 size}: two 8×8 and one 4×6 (Confirmed, see [hud](./hud.md) §1) |
| 0x08 | u32 ptr, u32 count | Group table: 1 group in 10097, 8 entries in 10101 and 10103 |

The group table layout is not decoded yet (U-029). Elements of one group are stored contiguously, which is enough to locate them.

### Element, 52 bytes (Confirmed)

| Offset | Type | Meaning |
|---|---|---|
| +0 | Image record (36 bytes) | Encoding 0 or 2 |
| +36 | i32 | Screen x of the image's top-left corner |
| +40 | i32 | Screen y |
| +44 | u32 | 0 or 1; 1 only in the strategic-map frame group, Likely "uses another palette" (U-029) |
| +48 | u32 | 0 or 1; meaning Unconfirmed |

### Groups in the HI set

| Group | Elements | Likely role | Evidence |
|---|---|---|---|
| 0 | Bottom panel 640×164 at y 316, two side struts, a thin strip | Forward cockpit (F1) | Composite matches the original F1 screenshot in layout and colour (DATA palette) |
| 1 | Top 640×48, sides 82 and 79 wide, bottom 640×51 | Strategic-map frame | Matches the original map screen in layout; colours wrong with DATA, so another palette is used (U-029) |
| 2–4 | One large sprite plus a lower panel | Looking back, left, and right from the cockpit | Show the seat and side consoles from those angles; which keys select them is Unconfirmed |
| 5 | Two 480-high side pillars and a top bar | A narrow full-height frame | Role Unconfirmed |

The LO set uses the same structure with 320×240 coordinates; its group 1 still uses 640×480 coordinates, so the map frame is shared between modes (Likely).

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

- CCKD group table layout, the alternate-palette flag, and which palette the map frame uses (U-029).
- Which key or state selects CCKD groups 2–5.
