---
type: format
status: verified
phase: P0
updated: 2026-10-16
related: [U-001, U-006, U-018, U-019, U-027, U-028, U-029, U-030]
---

# Palettes and images (DATA, image record, TEX, BITM, ANIM, EXPL)

Container format: [IMFAT](./imfat.md). Confidence labels as defined there. Structure only; no original content.

- Parser: [`src/original-data/conversion/source-graphics.ts`](../../../src/original-data/conversion/source-graphics.ts) (`readDataPalette`, `readImageRecordHeader`, `decodeImageRecord`, `readEmbeddedPalette`; encoding 1 only for ANIM frames); [`src/original-data/formats/anim.ts`](../../../src/original-data/formats/anim.ts) (`readAnimationFrames`, `decodeAnimationFrame`) and [`src/original-data/formats/explosion.ts`](../../../src/original-data/formats/explosion.ts) (`parseExplosionLists`, `parseExplosionRecord`) for §6–§7 (P3-03/14)
- Validation: `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` parses all TEX (59), BITM (28), and MFDD (3) entries, and since P3-03/21 decodes all 186 ANIM frames and checks the EXIC → EXPL → ANIM and SND references ([tools](../../guides/tools.md#封包结构核对)).

## 1. DATA: global palette (Confirmed)

768 bytes: 256 × RGB, each component a 6-bit VGA value (0–63). Expand to 8 bits by bit replication, `(c << 2) | (c >> 4)`; with this rule every pixel of four in-flight DOSBox-X screenshots matches a DATA colour exactly (Confirmed). This is the palette in effect during flight; the forward cockpit graphics display with correct colours using it (see [cockpit](./cockpit.md)).

**Wider check (P2-12/16, 2026-10-07):** of the 46 qualifying HI forward-view captures in the [cockpit comparison](./cockpit.md#all-qualifying-captures-p2-12), 45 have every pixel in DATA. `srangers_066.png`, taken during a Warp ([B-001](../behavior/B-001-strategic-map.md#战役地图与-warp-补充证据2026-10-03)), has 8,373 pixels whose colours are not in DATA, all outside the cockpit's static region, which matches. The game does change palette entries during a Warp: it replaces 106 entries with a green and a grey ramp for the whole screen until the Warp ends (Confirmed, code, P3-12/06; [executable](./executable.md#wt3-warp-start-0x50188-the-effect-part--confirmed-code)).

## 2. Image record, 36 bytes (Confirmed)

Every image in `SR.NOB` uses the same record: TEX and BITM entries start with it at offset 0, and MFDD, CCKD, ANIM, and some TABL entries embed it.

| Offset | Type | Meaning |
|---|---|---|
| +0 | u32 | Bits per pixel; always 8 |
| +4 | u32 | Encoding: 0 raw, 1 byte-run sprite RLE (ANIM frames only), 2 sprite RLE |
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

<a id="encoding-1-animation-unconfirmed"></a>

### Encoding 1: byte-run sprite RLE (Confirmed)

Used only by the 186 ANIM frames ([§6](#6-anim-explosion-animations-confirmed)). The only reader is the explosion sprite drawer `0x58d64`, which decodes a frame each time it draws it (P3-03/05).

**Rule (Confirmed, EXE `0x58d64`):** `height` rows, stored top to bottom, with no row header and no end marker. Each row is a sequence of u8 run lengths that alternate between transparent and opaque, starting with a transparent run:

- a transparent run is one byte, its length in pixels;
- an opaque run is one length byte followed by that many pixel bytes (palette indices);
- the row ends as soon as its run lengths reach the width, after either kind of run; the next byte starts the next row with a transparent run. Well-formed rows reach it exactly (all 186 frames, below).

This is the alternation of encoding 2 with 1-byte instead of u16 lengths. Decoding is driven by the width and height only; the code does not read the data-size field (+32).

**Every branch of the decoder (Confirmed, code):**

- A transparent run leaves the destination pixel unchanged. Opaque bytes are written unchanged, index 0 included; there is no colour key.
- A run length of 0 is accepted and means nothing special: a zero transparent run starts the row with an opaque run, and a zero opaque run draws nothing.
- Run lengths are not bounded by the width: the row ends at the first run that reaches or passes it. An opaque run that passes it still draws all its bytes, beyond the frame's box; a transparent one only advances.
- Clipping changes only what is drawn: rows above the screen are skipped by reading the same runs, a run that crosses the left edge is split, the rest of a row is still read after the right edge, and rows below the viewport are not read.
- Each source pixel becomes a square of `scale × scale` screen pixels (an integer from the caller). The whole square is drawn or skipped: it is drawn when it ends left of the screen's right edge and the sprite's depth is not greater than the 16-bit z-buffer value that the 3D renderer left at the square's top-left pixel.

**Not a delta encoding (Confirmed, code):** each frame record has its own pixel pointer, and the drawer decodes that frame alone onto the current frame buffer. No frame reads another frame's data or the previous frame's pixels.

**Baseline (Confirmed, local decode with this rule):** all 186 frames decode and consume exactly their stated data size; no row's runs pass the width; no run length is 0; and no opaque pixel has index 0. Zero-length runs and opaque index 0 are therefore handled by the code but do not occur.

## 3. TEX: textures (Confirmed)

- Pixel values index the texture's own palette, usually 16 colours, stored as 8-bit **BGR** triplets (0–255), not RGB and not 6-bit VGA values (Confirmed).
- **In game, texture colours are mapped to the nearest DATA colours.** Evidence: for the three textures of the player craft, 16 of 16, 8 of 14, and 4 of 5 palette colours, read as BGR and quantised to DATA, occur in a screenshot of that craft; read as RGB, almost none do. Rendered this way the craft matches the screenshot in colour (Confirmed).
- How lighting chooses brighter or darker shades is Confirmed (code, P3-12/02): one 4-shade ramp per palette entry, the shade picked per triangle or per pixel from a single fixed directional light and an ambient level ([executable](./executable.md#3d-lighting-and-shade-levels-p3-1202)); appearance Likely (U-028).
- Observed sizes: 32×32, 64×64, 96×96, 128×128, 256×256.
- 58 of 59 TEX entries embed a palette; TEX 11069 has none ([below](#tex-11069-hit-shimmer-band-map-confirmed)).
- **Header (Confirmed, all 59 entries and EXE):** a TEX entry starts with the 36-byte image record, followed by two u32 that are 0 in every entry; its pixel data starts at +44. At run time `0x660dc` stores the renderer image it builds in +0x24 and the renderer texture in +0x28.
- Besides model parts, the executable loads two TEX entries by ID for effects: TEX 10151 for debris and TEX 10377 for missiles ([executable](./executable.md#effect-presentation-sources)). Two more serve the hit shimmer (11069) and the right display's background (11089), below.

### Nearest-colour metric and tie rule (Confirmed)

That textures map to the nearest DATA colour is Confirmed (above). How the renderer measures "nearest" and which entry wins a tie are also Confirmed, from its colour manager's code (P2-06/12; see [executable](./executable.md#native-tex-preparation-and-nearest-colour-search)):

- **Search space:** the game expands DATA for the renderer by shifting each 6-bit component left by 2, so values are 0–252 in steps of 4. All 256 entries are allocated, and the search never adds a colour.
- **Metric:** the least (r − R)² + (g − G)² + (b − B)² over 8-bit integer components, where R, G, B are the DATA values times 4 and r, g, b the colour searched (Confirmed). The colour searched is a ramp entry built from the texture's 8-bit palette components, reordered from the stored BGR to R, G, B; the unshaded colour itself is searched for unlit parts and as the brightest shade of lit parts (Confirmed, code, P3-12/02, [executable](./executable.md#ls4-material-keys-and-colour-ramps--confirmed-code)).
- **Ties:** the lowest DATA index. An exact match returns the lowest of equal entries; otherwise a strict less-than scan runs in ascending index order.
- **Shading (Confirmed, code, P3-12/02):** in game, every texture palette entry gets a 4-shade ramp, entry i = min(255, chop(c·a + c·((i/3)·(1 − a)))) per component with a the ambient level, and every ramp entry is matched by the same search; entry 3 is the raw colour, entry 0 the ambient-only colour. When the ramp table is full, a colour shares the closest existing ramp under a different, ramp-level metric (Likely not reached in the slice). Which shade a pixel shows follows the lighting rules ([executable](./executable.md#3d-lighting-and-shade-levels-p3-1202)); the appearance is Likely (U-028). The project's `nearest` display mapping is the unshaded colour.

**Project implementation.** `nearestColourMap` is the only nearest-colour function (see [source structure](../../engineering/modules/content.md#图形-payload)). It compares the 8-bit source colour with each target component with its two low bits cleared. For a palette expanded from 6-bit values by bit replication, as DATA is, this gives exactly the values times 4. On all 58 embedded TEX palettes (1,335 entries) it chooses the same DATA entry as the confirmed rule.

**Entries that were ambiguous under the P2-05 candidate rules (historical).** P2-05/11 (2026-10-05) compared four rules with `local/research/p2-05/nearest-candidates.ts`:
- squared distance in 8-bit RGB, with DATA expanded to 8 bits by bit replication;
- squared distance in 6-bit VGA space (TEX components truncated by `>> 2`, DATA raw);
- each with ties going to the lower or to the higher index.

It recorded 78 palette entries across 29 TEX entries where a tied choice in either space would show a different DATA colour:

10001: 5; 10003: 1; 10061: 10; 10145: 0, 3, 10; 10149: 6, 8; 10321: 0, 3, 10; 10377: 1; 10419: 10; 10421: 9, 11; 10451: 3; 10613: 6; 10617: 3; 10625: 2, 4, 7; 10643: 1, 14, 15; 10645: 4; 10681: 1; 10887: 2; 10893: 1; 10895: 2; 10897: 9, 10; 10901: 0, 4; 11067: 2, 13; 11091: 38, 40, 44, 57, 61, 64, 65, 71, 84, 88, 93, 99, 105, 107, 109, 111, 112, 121, 126, 144, 151, 168, 171, 172, 174, 198, 199, 202, 204, 208, 210, 211, 215, 220, 251; 11163: 2; 11261: 0, 4; 11273: 2; 11297: 2; 11309: 0, 8; 11371: 6.

The confirmed rule resolves every one of them. It was not among the candidates. Compared with the earlier implementation (the 8-bit rule with lower-index ties), it shows a different DATA colour on 8 entries: 10145: 3; 10149: 6; 10321: 3; 10643: 14; 11067: 13; 11091: 65, 199, 215. Three of these are in slice textures (10149: 6, 10321: 3 and 11067: 13). In 71 entries several DATA entries still tie at different colours; the lowest-index rule decides them. Evidence: ignored `local/research/p2-06/nearest2/confirmed-rule.ts`.

**Consistency reference only.** The player craft is M2ID slot 0, MODL 10743. Its intact parts use TEX 10749, 10747 and 10681 (5, 14 and 16 colours). Each was converted with the production converter (`display: { nearest: DATA }`) and every palette entry expanded with `expandImage`. The recorded counts above (4 of 5, 8 of 14, 16 of 16 colours present) are reproduced exactly in local captures `srangers_008.png`, `srangers_010.png` and `srangers_013.png`; `srangers_091.png` shows 5, 9 and 16 of 92 captures checked. This shows the expansion path is consistent with the earlier observation; it does not measure the metric or the tie rule.

### Checked runtime image equivalence and exact source aliases

**Confirmed (current content equivalence):** the qualified full-span capture described in [executable](./executable.md#qualified-full-span-image-capture) supplies a complete 256×256 raw image and all sixteen palette entries. All 59 `SR.NOB` TEX headers were checked; five entries have the complete required shape. Comparing every pixel and canonical RGB palette byte, together with dimensions, raw row order and opacity, yields exactly two matches in this checked corpus: TEX entries 10147 and 10151. Hashes and direct byte equality both agree. No approximate colour match, row/pixel permutation or nearest-DATA remapping is used. Other entry families and archives are outside this comparison.

**Confirmed (whole-entry equivalence):** these two entries also have identical complete entry data, not merely equal decoded pixels. Both are 65,628 bytes, have directory flags 0 and two relocation positions at +28/+20, and share whole-entry SHA-256 `28b6255fb47647e2c67cac4431fb95072469c5adf53b4354e62043102ecb8fba`. Their different archive IDs/locations do not distinguish their content.

**Confirmed (exact-source corpus classes):** a conservative whole-entry and metadata comparison partitions all 59 TEX entries into 56 exact-source classes. The other duplicate pairs are 10145/10321 and 10901/11261. Class membership requires matching complete bytes, type, directory flags, size, relocation count and ordered positions; decoded-pixel equality alone is insufficient. These are source-equivalence classes, not automatically shared production Asset identities.

**Confirmed (existing model-source references):** this equivalent source family is already represented in all 54 existing candidate model-source closures; each of the three slot-1 closures references 10147. MODL entries 10091, 10143, 10309, 10373, 11063, 11161 and 11369 reference 10147; MODL 10383 references 10151. The observed content therefore does not identify a new image-content family outside those partial closures. This is not proof that the complete slice has no other images, nor a full canonical Asset/edge count.

**Unconfirmed (historical provenance):** the original request ID, actual constructor execution and absence of earlier/downstream mutation remain unobserved. The checked result is one exact content-equivalence family with two alternative source locators, not a choice of which entry the original program requested. Identical content alone does not establish identical semantic roles or version ownership across all consumers.

Evidence: ignored `current-tex-equivalence-34.json`, `runtime-full-content-34-milestone.json`, `exact-source-tex-subgraphs.ts/.json` and private capture files in `local/research/p2-01/`; complete entry data and metadata were independently compared with `parseImfat`/`entryData`, and model references were checked with `parseModel` against `source-profiles.json`. The corpus projection checks 3,481 pairwise comparisons and produces byte-identical JSON on rerun. Original pixels and palette values remain local.

### TEX 11069: hit-shimmer band map (Confirmed)

**Structure (Confirmed):** 64×64, encoding 0 (4,096 bytes), no embedded palette (pointer and count 0, only +0x1C relocated). The stored bytes take 254 distinct values spread over the 8-bit range.

**Its colours are never shown (Confirmed, EXE, P3-03/05):**

- `0x41c00` loads it once per program run through the TEX wrapper `0x65e28` and keeps the entry in `0x193c30`. For a record without a palette, `0x660dc` gives the renderer image a 256-entry default palette (`0x1b41b0`; a raw scan of the image finds that address only in this store and in the release check) and creates a renderer texture.
- A raw scan finds `0x193c30` only in its store, in its release at shutdown (`0x41dba` → `0x6b03c`), and in four reads in `0x41f88` and `0x4294c`. These read only the image's width, height and pixel buffer. The texture made for TEX 11069 is never applied to a mesh.

**Use as thresholds (Confirmed, EXE):**

- **Copy per struck craft:** for a struck object of a kind in `0x383`, `0x41dcc` → `0x41f88` makes a new texture from the image of the object's list-2 part's texture. That is TEX 11073 in all 16 list-2 parts, also 64×64 ([mesh](./mesh.md#2-modl-structure-confirmed-on-all-19-entries), list 2). Through `0x851cc` it gives that texture a second 8-bit image, a copy of TEX 11069's image. `0x851cc` rejects a second image whose depth is not 8 or whose width or height differs from the texture's image. The device's texture registration `0x7d09c` passes this second image (texture +0x5C) to the driver with the texture.
- **Band:** `0x4294c` rewrites the copy from the stored value *v* of the same texel and a band position *t*: 0xFF where *t* + 1 < *v* < *t* + 40; otherwise 0x7F where *t* − 3 < *v* < *t* + 43; otherwise 0. The comparisons are signed 32-bit on the zero-extended byte.
- **Band position:** `0x42664` computes *t* as the mission-clock units since the hit × 1/128 × 255, truncated. When *t* reaches 251 the effect ends.
- **Shared copies:** kinds in `0xf9c7c` (bases included) share 16 copies, precomputed at *t* = 0, 15, …, 225; each step shows copy min(*t*/15, 15).

**Display (Confirmed, code, P3-12/05):** the copy is the texture's second image, which the transparent rasterisers read as per-texel opacity at the colour texel's address: 0 is never drawn, 0xFF always, 0x7F through a 4 × 4 screen door anchored to the screen pixel (drawn where (x + y) is even in HI); a skipped pixel writes neither colour nor depth. The shell is unlit (one shade), TEX 11073's colour at that texel. The kind-`0x383` shell is a per-object copy wrapped by fixed sphere wraps (only kind 0x80's is sized from its mesh's bounds); the 16 shared copies of kinds `0xf9c7c` are built from the first such visual, each with wrap i of the shared list, and placed at the hit point. Stepping, wraps and end rules: [executable](./executable.md#hit-shimmer-and-effect-visuals-p3-1205). **Appearance (Likely):** in captures 103, 112 and 114 the shell pixels are the nearest DATA colours of TEX 11073's palette and form the band's solid stripes; frame-buffer reads of two baseline runs show the checkerboard on the predicted phase in early-band frames; its coverage later in the band was not observed ([HS6](./executable.md#hs6-how-the-opacity-image-is-drawn--confirmed-code), U-027).

**Requirements for conversion:**

- The 4,096 stored bytes are threshold values that the code compares in their stored 8-bit form, texel for texel against the part texture. They must be kept exactly and in stored order; remapping them as colour indices (for example to the nearest DATA colour) would move the band.
- There is no source palette, so no palette Asset can come from TEX 11069. Any palette an image payload is bound to serves only the viewer; it does not describe the game's display.

### TEX 11089: right-display background (Confirmed structure; display Likely)

**Structure (Confirmed):** 96×96, encoding 0 (9,216 bytes), and an embedded 256-entry BGR palette after the pixels. Relocations are at +0x1C and +0x14. The pixels use 14 distinct indices.

**Palette equals DATA (Confirmed, count):** all 256 entries equal the DATA entry of the same index as the renderer expands it (each 6-bit component shifted left by 2). So under the [confirmed nearest-colour rule](#nearest-colour-metric-and-tie-rule-confirmed), every used entry has an exact DATA match with the same colour as its own DATA entry. Direct display under DATA and nearest-DATA mapping show the same colours.

**Drawing path (Confirmed, EXE):**

- `0x42b04` (view switch `0x3f158`) creates the right display's 3D device: 100×100 in HI and 50×50 in LO, 8-bit, with the DATA colour table `0x186c00` as its palette. It loads TEX 11089, or 11091 in view mode 6, with `0x65e28`. The texture made by `0x660dc` (own palette, 4 shades) goes to `0x85730`, which stores it as the scene's background texture (+0x2D8).
- The viewport clear `0x7b8e0` hands it through `0x7d3c8` to `0x7d09c`, the device texture registration that mesh textures also use.
- How the background is fitted to the 100×100 viewport, and whether a shade is applied, are inside the renderer and were not traced (P3-13).

**Display (Likely):** colours as for mesh textures, which here equal DATA[index] for every pixel. The display's role is Likely (U-030).

Evidence for this section: ignored `local/research/p3-03/images/` (`tex-survey.ts`, `tex11089.ts`, `list2.ts`, Ghidra probes `out/p8`–`out/p16`).

## 4. BITM: bitmaps (Confirmed structure)

- 6 entries embed a 256-colour palette, also BGR: read that way, a portrait shows natural skin tones instead of blue (Likely).
  - By entry size and relocation count they are entries 10041, 10043, 10045, 10047, 10049 and 10051 (128×128).
- 22 entries have no embedded palette. Their palette lives elsewhere and is Unconfirmed for most of them (U-018). Exceptions (Confirmed): the left-display page backgrounds 10467 (HI), 10469 (HI, base interior; read as a craft type until P3-01/10) and 10471 (LO) are drawn while the default palette, DATA, is in effect ([hud](./hud.md#hud-and-map-drawing-paths-confirmed-exe)), and P2-12 matched 10467 under DATA directly (below); the 15 nebula backgrounds also show under DATA (below). Displayed with DATA, the colours of other entries looked clearly wrong (a visual judgement, not a code result).
- Observed sizes: 48×48, 96×96, 128×128, 320×200 (sprite RLE), 640×316. The 640×316 entries are full-screen scenes: TABL 10171 lists the three of them, and docking shows one chosen at random (Confirmed, EXE, P3-01/10).
- **The 15 nebula backgrounds (P3-01/10; P3-03/05):** NEBC 10661 lists 15 BITMs ([hud](./hud.md#3-id-lists-confirmed-structure)). Each is 128×128, encoding 0 (16,384 bytes), with no embedded palette; its pixels start at +36 and its only relocation is +0x1C (Confirmed, all 15). Flight draws six of them with `0x5b54c` ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)):
  - **Display direct under DATA (Confirmed, EXE):** `0x5b54c` copies every stored byte unchanged into the 8-bit frame buffer `0x1762a8`, with no colour lookup and no palette change. The 3D device renders into that buffer with DATA as its palette (`0x3d0b0`, colour table `0x186c00`). Flight setup sets the VGA palette to DATA (`0x3ed04`–`0x3ed09`, through `0x58288`). The cockpit slots of the world views carry no palette, so `0x49848` keeps DATA there ([cockpit](./cockpit.md#group-palette-and-drawing-confirmed)). Screen flashes replace the whole palette for a moment (`0x48f14`, [executable](./executable.md#screen-flashes-p3-1204)). P3-12/04 found 10 of the 15 images by exact colour equality in 19 local captures ([executable](./executable.md#nb6-capture-matching)), so display under DATA is Confirmed by code and captures, and the earlier visual judgement ("colours clearly wrong under DATA") does not hold for these 15.
  - **Opaque (Confirmed):** every source byte is written; there is no colour key.
  - **Shape (Confirmed):** the drawer addresses the source as 128 rows of 128 bytes (stride 0x80 in the code) through a rotation table at `0x1b2b20`, so it requires 128×128. The images are kept in stored row-major order.
  - **Orientation (Confirmed, code and captures, P3-12/04):** the angle argument's mirror and transpose flags always compose to a proper rotation, never a mirror; the stored row axis points along the projected direction of the slot's offset axis ([executable](./executable.md#nb4-the-rotated-blit-0x5b54c-and-its-table-0x5b440--confirmed-code)).
- At least one portrait displays upside down: rows may be stored bottom-up, or the image may be intentionally flipped (Unconfirmed, U-019).
- **The slice's BITM is drawn top-down (Confirmed):** the HUD blitters read source rows top-down in stored order ([hud](./hud.md#hud-and-map-drawing-paths-confirmed-exe)). In [P2-12 subtask 17](../../plan/p2/12/subtasks/17-hud-texture-coverage.md#完成证据), 10467 in stored row order under DATA was identified at the left display in seven forward-view captures: 8,601 of its 9,216 pixels are exposed and identical in at least one capture. The other 615 are never exposed there (564 under text, 51 under unidentified graphics) and rest on the same-source read. 10467 is the only BITM in the slice, so U-019 is resolved for the slice and stays open for the portraits.

## 5. Observed maxima against the P2-05 limits (Confirmed)

The P2-05 conversion limits come from [the P2-05 spec](../../plan/p2/05/spec.md#限值与预算). The 256-entry palette is a format rule (8-bit indices); the 640×480 image size is a project safety cap, not a format limit, because the width and height fields are u32. The baseline values below fit within both. `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` (2026-10-05) decodes every image record with the shared source readers:

- 123 image records in total: 59 TEX, 28 BITM, and the 36 records of the 3 MFDD entries;
- the DATA entry passes (768 bytes, every component at most 63);
- for the 64 records with an embedded palette (58 TEX, 6 BITM), every opaque pixel index is below the palette's entry count;
- records without an embedded palette are checked for structure only; 8-bit indices cannot exceed 256 entries.

The run is recorded in [P2-05 subtask 09](../../plan/p2/05/subtasks/09-local-structure-check.md#完成证据). Since P2-07 the same command also decodes the 38 CCKD element records (up to 640×480) and the 70 records of the TABL image lists (up to 20×52), 231 records in total; all fit the same limits ([cockpit §3](./cockpit.md#3-observed-counts-against-the-p2-07-limits-confirmed), [hud §2](./hud.md#tabl-image-lists-confirmed-structure)). The 186 ANIM frames (at most 128×128, no embedded palette) also fit them; their own observed values are in [§6](#6-anim-explosion-animations-confirmed).

| Quantity | Baseline maximum | P2-05 limit |
|---|---:|---:|
| Image width | 640 (BITM); TEX 256, MFDD 96 | 640 (safety cap) |
| Image height | 480 (CCKD elements, since P2-07); BITM 316, TEX 256, MFDD 96 | 480 (safety cap) |
| Embedded palette entries | 256 (TEX, BITM) | 256 (format rule) |
| DATA entries | 256 | exactly 256 (format rule) |

## 6. ANIM: explosion animations (Confirmed)

P3-03/05 established the structure from the EXE readers and all 17 entries. The frame encoding is [encoding 1](#encoding-1-byte-run-sprite-rle-confirmed).

| Offset | Type | Meaning | Evidence |
|---|---|---|---|
| +0x00 | u32, relocated pointer | Frame array; 8 in all 17 entries | `0x49004` reads frames through it |
| +0x04 | i32 | Frame count *n*; 12 in 14 entries, 6 in 3 | `0x2409c` compares the frame index with it by a signed compare (`JL`) |
| +0x08 | *n* × 40 bytes | Frame records, in display order | Stride 0x28 in `0x49004` |

A **frame record** is a 36-byte [image record](#2-image-record-36-bytes-confirmed) followed by four more bytes. The types of +0 to +32 are those of the image record (Confirmed there); the ANIM readers use only width, height and the pixel pointer:

| Offset | Type | Value in all 186 frames | Read for ANIM frames | Confidence |
|---|---|---|---|---|
| +0 bits per pixel | u32 | 8 | No | Confirmed (all frames) |
| +4 encoding | u32 | 1 | No; the drawer assumes encoding 1 | Confirmed (all frames and the drawer) |
| +8, +12 width, height | u32, used as signed 32-bit | 128×128 or 48×48; equal within an entry | Yes (`0x49004`, `0x58d64`) | Confirmed (code) |
| +16 | u32 | 0 | No | Confirmed (all frames) |
| +20 palette pointer, +24 palette count | u32, u32 | 0 and 0; +20 not relocated | No | Confirmed (all frames) |
| +28 pixel pointer | u32, relocated pointer | Start of the frame's data | Yes (`0x49004` → `0x58d64`) | Confirmed (code) |
| +32 data size | u32 | Equals the bytes encoding 1 consumes | No | Confirmed (all frames, local decode) |
| +36 | Unknown, 4 bytes | 0 | No reader found | Zero in all frames; type Unconfirmed |

- **Layout (Confirmed, all 17):** the relocations are +0x00 and each frame's +28 (1 + *n*). The frames' pixel data follow the frame array without gaps, in frame order, and end exactly at the end of the entry.
- **No load transform (Confirmed):** ANIM has no row in the per-type table `0x1766b4`. The EXPL loader requests it as a plain entry, so it is only relocated. The frame image is decoded at every draw; nothing is prepared at load.
- **Readers (Confirmed):** only the explosion object reaches an ANIM, through its EXPL record. `0x2409c` reads the frame count; `0x49004` reads the frame array, each frame's width, height and pixel pointer, and passes them to the drawer `0x58d64` through the queue `0x492d0`/`0x49330`. No reader of frame +16, +32 or +36 was found.

**Frame palette, transparency, row order and display (Confirmed, EXE):**

- **Palette:** the frames have no embedded palette. `0x58d64` writes their stored indices unchanged into the 8-bit frame buffer `0x1762a8`, which the 3D device renders into with DATA as its palette and the VGA palette shows as DATA in the world views ([§4](#4-bitm-bitmaps-confirmed-structure), nebula backgrounds, gives the same chain). So the frames display **directly under DATA**: in project terms `palette/flight/models` with display `direct`.
- **Transparency:** the transparent runs of encoding 1. Opaque bytes, index 0 included, are drawn.
- **Row order:** stored order, top-down.
- **Frames are complete images:** they are not deltas ([encoding 1](#encoding-1-byte-run-sprite-rle-confirmed)).

**Animation parameters (Confirmed, code; the rules belong to P3-07 and P3-12):** the data holds no per-frame duration, offset or anchor; timing and placement are code.

- **Timing:** `0x2409c` shows frame (14 × (*t* − *t*₀)) >> 6, with *t* the mission clock in 1/64 s and *t*₀ the explosion's start. That is 14 frames per second; the rate 14 is written only there. *t*₀ is the explosion's activation, in the request handling of the tick after its creation. At the first update whose frame index reaches the frame count the sprite is hidden (frame −1) and the explosion releases the object it holds (a missile, a fragment, or a craft that shed no fragments), which then leaves: 28 ticks after *t*₀ for 12-frame ANIMs and 14 for 6-frame ones at 2 units per tick. The explosion requests its own removal at the first update whose clock is strictly past *t*₀ + 0x60 units (1.5 s) with the frame index at the count, and leaves one tick later ([lifecycle](./executable.md#destruction-explosions-and-fragments-p3-0706), P3-07/06). Because every ANIM of a list has the same frame count, the random entry never changes these times.
- **Placement (Confirmed, code, P3-12/03):** `0x49004` centres the frame on the explosion's projected position, using the viewport's right edge as the scale of both axes and its half extents as the centre; it draws nothing at camera depth z ≤ 1 or ≥ 3800, or with the centre outside the viewport. The integer scale is a function of the explosion's variant ([§7](#7-expl-explosion-records-confirmed)) and of t = (z − 1)(F − 1)/((F − 2)z), F the current back plane: chop(4t), chop(3t) + 1, chop(4t + 0.4) or chop(2t) for variants 0–3, halved in LO; it is 3 for a large-craft explosion at the usual distances. `0x49330` sorts the sprites by the depth key chop(65535 t), nearest first, and draws them after the world, each s × s block only where the key is not greater than the depth buffer at the block's top-left pixel; no depth is written. Details and boundary distances: [executable](./executable.md#frame-composition-depth-and-explosion-sprites-p3-1203).

**Observed values (Confirmed, local decode; counts only):**

| Quantity | Value |
|---|---:|
| ANIM entries; bytes in all | 17; 345,059 |
| Largest entry | 58,087 bytes |
| Frames per entry | 12 (14 entries), 6 (3 entries) |
| Frames in all | 186: 84 of 128×128 (the 7 entries of EXIC list 1), 102 of 48×48 |
| Largest frame data | 7,411 bytes |
| Length bytes per row, at most | 11 |
| Longest opaque run; longest transparent run | 111; 128 (a blank 128-wide row) |
| Decoded pixels; of them opaque | 1,611,264; 299,061 |

Evidence: ignored `local/research/p3-03/images/` (`survey.ts`, `anim-check.ts` with `out/anim-check.txt`, Ghidra probes `out/p1`–`out/p7`, `out/p17`–`out/p23`, `out/p27`–`out/p28`; decoded frames stay in `out/frames/`).

**Appearance check against captures (P3-03/21):**

- **Method:** the 186 frames, decoded by the production decoder, were rendered under DATA (the palette they are bound to). In all 132 local captures (`local/StarRang/captures/`), a search looked for exact-colour placements at integer scales 1–4, each source pixel an s × s block ([§2](#encoding-1-byte-run-sprite-rle-confirmed)), aligned to whole blocks. For captures taken during a screen flash, every colour was taken as DATA with one constant added to each 6-bit component ([executable, RENS header](./executable.md#flight-message-strings-and-the-rens-header-p3-0304)).
- **Results:**

  | Capture | Frame | Scale | Matching opaque blocks; pixels | Controls (best pixels) |
  |---|---|---|---|---|
  | `srangers_110.png` | `image/explosion/03/06` | 3, no flash | 4,181 of 4,560; 38,646 of 41,040 (94.2%) | vertical flip 3,323; mirror 2,762; best other frame 7,009 |
  | `srangers_111.png` | `image/explosion/03/07` (the next frame) | 3 | 5,013 of 5,356; 46,178 of 48,141 (95.9%) | flip 3,834; mirror 3,356; best other frame 15,044 |
  | `srangers_120.png` | `image/explosion/03/04` | during a strong flash | 22,005 of 24,255 pixels | flip 15,804; weak support only, as the flash pushes most colours near white |

  In the first two captures every mismatching pixel lies on the ship silhouette, crosshair or speed text in front of the explosion (difference images checked by eye). Animation 03 is list 1, position 3 (128×128 frames), drawn at scale 3 in HI.
- **Confidence:** the appearance match is Likely: the P3-03 spec caps a comparison with captures or video at Likely. It agrees, with exact colour equality on emulator captures (not video), with the decoding, top-down row order, transparency and direct display under DATA that the code already confirms (above); the other 183 frames go through the same decoding path. A yellow effect in `srangers_044.png` (taken during a flash) matches no ANIM frame; its source was not identified, and it does not affect this result.
- **Evidence:** ignored `local/research/p3-03/local-check/` (`out/summary.json`; comparison images, frame exports and difference images in `out/appearance/`).

## 7. EXPL: explosion records (Confirmed)

**Structure (Confirmed, all 17 entries and `0x66ad8`):** 8 bytes, no relocations, and no other field:

| Offset | Type | Meaning |
|---|---|---|
| +0 | u32 entry ID | SND: the explosion's sound ([audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08)) |
| +4 | u32 entry ID | ANIM: the explosion's animation ([§6](#6-anim-explosion-animations-confirmed)) |

- **Load transform (Confirmed, EXE):** `0x65d10` reaches the EXPL row's loader `0x66ad8`, which requests both entries. Its completion `0x6685c` overwrites each field in place with the loaded block's pointer. `0x6b090` turns either form back into an ID: an odd value is an entry ID (all 701 IDs in `SR.NOB` are odd), and an even, non-zero value is a loaded block. The dependency lister `0x66a38` uses it to list SND and ANIM.
- **Readers (Confirmed):** an explosion object (kind `0x400000`) keeps its EXPL record at +0xF4 of its object data. `0x55534` plays +0 ([audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08)); `0x2409c` and `0x49004` read the ANIM at +4.

**EXIC 10211 and the 17 EXPL entries (Confirmed, data):** the three lists ([hud §3](./hud.md#3-id-lists-confirmed-structure)) hold 17 distinct IDs, exactly the 17 EXPL entries. Each EXPL names a different ANIM. Four sounds are used: 10213 by 8 entries, 10217 by 7, and 10215 and 10219 by one each.

| List | Positions | EXPL | ANIM | Sound | Frames |
|---|---|---|---|---|---|
| 1 | 1–7 | 10223, 10227, 10231, 10235, 10239, 10243, 10247 | 10183, 10187, 10191, 10195, 10199, 10203, 10207 | 10213, 10215, then 10213 ×5 | 12 × 128×128 |
| 2 | 1–7 | 10225, 10229, 10233, 10237, 10241, 10245, 10249 | 10185, 10189, 10193, 10197, 10201, 10205, 10209 | 10217, 10219, 10217, 10217, 10217, 10213, 10213 | 12 × 48×48 |
| 3 | 1–3 | 11389, 11391, 11393 | 11383, 11385, 11387 | 10217 ×3 | 6 × 48×48 |

**Which list an explosion uses (Confirmed, code; the rules belong to P3-07):** the mission build `0x23520` keeps 5, 5 and 3 consecutive entries of the three lists from random starts ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)).

- **Creation:** `0x23ac8` creates an explosion for a destroyed object and sets its variant byte (+0xF0): 3 when the object's kind has bit `0x100000` (a missile), 0 for kinds in `0xf9c7c`, otherwise 2. For kind 1 the first call only stores a time 0xC0 units (3 s) ahead and creates nothing; the first call strictly after that time creates the explosion. For kinds in `0xfffff` it adds, through `0x23fdc`, 0–3 secondary explosions (2–5 for kinds in `0xf9c7c`) at offsets built from the display camera's position and rows, with variant 0 for kinds in `0xf9c7c` and otherwise 2; each activates 0–20 units after its first update ([explosions](./executable.md#destruction-explosions-and-fragments-p3-0706)).
- **Choice of entry:** at its activation `0x2409c` draws one rand and picks a kept entry; the kept entries of list k are consecutive from the build's random start, in request order. Animation and sound use this one choice.
  - Variants 0 and 1 take list 1, and variant 3 takes list 3.
  - Variant 2 takes list 2 when the squared distance from the 3D camera position (`0x1b075c`, [cameras](./executable.md#cameras-interfaces-and-cross-frame-order-p3-0707)) to the explosion is at least 160000.0. Otherwise the variant becomes 1 and the entry comes from list 1.
- **Scale:** the variant also selects the draw scale in `0x49004` ([executable](./executable.md#fc7-sprite-projection-visibility-and-scale--confirmed-code)).

Evidence: ignored `local/research/p3-03/images/expl-check.ts` and Ghidra probes `out/p1`, `out/p2`, `out/p5`, `out/p22`.
