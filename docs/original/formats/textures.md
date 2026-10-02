---
type: format
status: draft
phase: P0
updated: 2026-10-01
related: [U-001, U-006, U-018, U-019]
---

# Palettes, textures, and bitmaps (DATA, TEX, BITM)

Container format: [IMFAT](./imfat.md). Confidence labels as defined there. Structure only; no original content.

## 1. DATA: global palette (Confirmed)

768 bytes: 256 × RGB, each component a 6-bit VGA value (0–63). Scale to 8 bits for display.

## 2. Image header shared by TEX and BITM (Confirmed for TEX, Likely for BITM)

The first u32 of the block is an offset to the image header:

| Field | Type | Meaning |
|---|---|---|
| width | u32 | Pixels |
| height | u32 | Pixels |
| reserved | u32 | 0 |
| paletteOffset | u32 | Offset of the embedded palette (relocated pointer) |
| paletteCount | u32 | Number of colours in the embedded palette; 0 = none |
| pixelOffset | u32 | Offset of the pixel data (relocated pointer) |

Pixels are 1 byte each, stored row by row with no padding.

## 3. TEX: textures (Confirmed)

- Pixel values are shade indices into the texture's own palette, typically 0–15.
- Each texture embeds a small palette (usually 16 colours) of **8-bit RGB** values (0–255), not 6-bit VGA values.
- Observed sizes: 32×32, 64×64, 128×128, 256×256.
- 58 of 59 TEX entries decode correctly as hull-plating style textures with this rule; one has no embedded palette.

## 4. BITM: bitmaps (Likely)

- Pixel values are 8-bit palette indices.
- 6 entries embed a 256-colour palette (8-bit RGB) and decode correctly.
- 21 entries have no embedded palette; displayed with DATA their colours are clearly wrong, so their palette lives elsewhere (Unconfirmed, U-018).
- Observed sizes: 48×48, 96×96, 128×128, 640×316. The 640×316 entries are full-screen scenes, consistent with a 640-wide high-resolution mode (U-006).
- At least one portrait displays upside down: rows may be stored bottom-up, or the image may be intentionally flipped for texture mapping (Unconfirmed, U-019).
- One BITM (entry 10163) has pixel data extending past its block, so its structure differs (Unconfirmed). `tools/nob-check.ts` reports it as the only image failure.

Parser: [`src/original-data/payloads.ts`](../../../src/original-data/payloads.ts) (`parseImage`, `parseVgaPalette`).
