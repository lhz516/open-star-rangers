---
type: format
status: verified
phase: P0
updated: 2026-10-01
related: [U-001, U-006, U-018, U-019, U-029]
---

# Palettes and images (DATA, image record, TEX, BITM)

Container format: [IMFAT](./imfat.md). Confidence labels as defined there. Structure only; no original content.

- Parser: [`src/original-data/payloads.ts`](../../../src/original-data/payloads.ts) (`parseVgaPalette`, `parseImage`, `decodeSpriteRle`)
- Validation: `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` parses all TEX (59), BITM (28), and MFDD (3) entries.

## 1. DATA: global palette (Confirmed)

768 bytes: 256 × RGB, each component a 6-bit VGA value (0–63). Expand to 8 bits by bit replication, `(c << 2) | (c >> 4)`; with this rule every pixel of four in-flight DOSBox-X screenshots matches a DATA colour exactly (Confirmed). This is the palette in effect during flight; the forward cockpit graphics display with correct colours using it (see [cockpit](./cockpit.md)).

## 2. Image record, 36 bytes (Confirmed)

Every image in `SR.NOB` uses the same record: TEX and BITM entries start with it at offset 0, and MFDD, CCKD, ANIM, and some TABL entries embed it.

| Offset | Type | Meaning |
|---|---|---|
| +0 | u32 | Bits per pixel; always 8 |
| +4 | u32 | Encoding: 0 raw, 1 animation (ANIM only, not decoded), 2 sprite RLE |
| +8 | u32 | Width |
| +12 | u32 | Height |
| +16 | u32 | 0 |
| +20 | u32 | Offset of the embedded palette (relocated pointer); unused when the count is 0. Colours are 8-bit **BGR** triplets (see §3) |
| +24 | u32 | Number of colours in the embedded palette; 0 = none |
| +28 | u32 | Offset of the pixel data (relocated pointer) |
| +32 | u32 | Pixel data size in bytes |

Pixels are 8-bit palette indices.

### Encoding 0: raw (Confirmed)

`width × height` bytes, row by row, no padding. The size field equals `width × height`.

### Encoding 2: sprite RLE (Confirmed on all 55 instances)

Each row is a sequence of u16 run lengths that alternate between transparent and opaque, starting with a transparent run (which may be 0). Each opaque run length is followed by that many pixel bytes. A row ends when its runs add up to the width; a fully transparent row is a single transparent run equal to the width. Decoding every encoding-2 image consumes exactly its stated size.

Used by 21 cockpit images (CCKD), 33 TABL images, and one BITM (entry 10163, 320×200).

### Encoding 1: animation (Unconfirmed)

Used only by the 186 ANIM frames; the data is smaller than `width × height`, so it is compressed, possibly as deltas between frames. Not needed before P4 (explosions and similar effects may need it in P3).

## 3. TEX: textures (Confirmed)

- Pixel values index the texture's own palette, usually 16 colours, stored as 8-bit **BGR** triplets (0–255), not RGB and not 6-bit VGA values (Confirmed).
- **In game, texture colours are mapped to the nearest DATA colours.** Evidence: for the three textures of the player craft, 16 of 16, 8 of 14, and 4 of 5 palette colours, read as BGR and quantised to DATA, occur in a screenshot of that craft; read as RGB, almost none do. Rendered this way the craft matches the screenshot in colour (Confirmed).
- How lighting chooses brighter or darker shades is Unconfirmed (U-028).
- Observed sizes: 32×32, 64×64, 128×128, 256×256.
- 58 of 59 TEX entries embed a palette; one has none.

## 4. BITM: bitmaps (Confirmed structure)

- 6 entries embed a 256-colour palette, also BGR: read that way, a portrait shows natural skin tones instead of blue (Likely).
- 22 entries have no embedded palette. Displayed with DATA, their colours are clearly wrong, so their palette lives elsewhere (Unconfirmed, U-018).
- Observed sizes: 48×48, 96×96, 128×128, 320×200 (sprite RLE), 640×316. The 640×316 entries are full-screen scenes.
- At least one portrait displays upside down: rows may be stored bottom-up, or the image may be intentionally flipped (Unconfirmed, U-019).
