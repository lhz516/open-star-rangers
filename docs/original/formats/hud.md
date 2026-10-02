---
type: format
status: draft
phase: P0
updated: 2026-10-01
related: [U-001, U-028, U-030]
---

# HUD graphics, fonts, and ID lists (TABL, M2ID, NEBC, EXIC)

Container format: [IMFAT](./imfat.md); images use the [image record](./textures.md#2-image-record-36-bytes-confirmed). Confidence labels as defined in the IMFAT doc. Structure only; no original content.

- Parser: [`src/original-data/payloads.ts`](../../../src/original-data/payloads.ts) (`parseBitmapFont`, `parseIdList`, `parseImage`)
- Validation: `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` parses the CCKD fonts and checks M2ID and NEBC references.

## 1. Bitmap fonts (Confirmed)

| Field | Type | Meaning |
|---|---|---|
| +0 | u8 | 0 |
| +1 | u8 | 1 in cockpit fonts, 8 in the menu font; meaning Unconfirmed |
| +2 | u8 | Glyph cell width (4 or 8) |
| +3 | u8 | Glyph height (6 or 8) = bytes per glyph |
| +4 | bytes | 256 glyphs × height bytes; one byte per row, bit 7 is the leftmost pixel |

Where fonts are stored:

- **Each CCKD entry** begins with a table of three fonts ({u32 offset, u32 size} × 3 at the CCKD header): two 8×8 fonts and one 4×6 font. These are the HUD fonts for that cockpit set (see [cockpit](./cockpit.md)).
- **`OPTIONS.NOB` TABL 5007** holds an 8×8 font, Likely for menus.
- In the 8×8 fonts, glyphs sit at their ASCII positions (checked on letters and digits). In the 4×6 font they do not, so its character mapping is Unconfirmed (U-030).

Fonts are 1-bit; the drawing colour comes from the code. No colour is stored.

## 2. TABL entries in `SR.NOB` (contents Likely)

TABL is a generic container; its meaning depends on the entry.

| Entry | Content | Status |
|---|---|---|
| 10099 | Three CCKD entry IDs (HI set, HI forward-only, LO set) | Confirmed (IDs resolve to CCKD) |
| 10171 | Three BITM entry IDs (the 640×316 full-screen scenes) | Confirmed (IDs resolve to BITM) |
| 11401 | 29 image records: 18 craft icons of 20×20 used on the strategic map and in its zoom window, 9 radar blips of 4×3, 2 other symbols | Likely (icons match the map screenshots) |
| 10461 | 29 radar blips, 4×3, in several colours | Likely |
| 10479, 10481 | 4 images each, about 20×51: vertical HUD gauge bars with pointer markers | Likely |
| 10483 | 4 images, 12×26: LO version of the gauge bars | Likely |
| 10165 | 33 sprite-RLE images on a 320×200 canvas; each contains only a small part at a fixed position | Purpose Unconfirmed (U-030) |
| 10399 | 13 offsets, Likely a string or record table | Unconfirmed |
| 11375 | 640 bytes of floats | Unconfirmed |

## 3. ID lists (Confirmed structure)

{u32 offset, u32 count} at 0x00, then `count` u32 entry IDs.

| Type | Entry | Content |
|---|---|---|
| M2ID | 10649 | **Craft type → MODL ID**, 22 slots (two are 0). The EXE loads this entry by its ID when it opens the archives. Slot 0 and 1 both name the player craft's model; slot 14 names the transponder craft's model. Both match screenshots in shape (see [mesh](./mesh.md) §3) |
| NEBC | 10039, 10661 | Lists of BITM IDs; Likely nebula backgrounds |
| EXIC | 10211 | Three ID lists at 0x00, 0x08, 0x10 (7, 7, and 3 IDs), all EXPL entries; Likely explosion variants by size or kind |
