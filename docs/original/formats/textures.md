---
type: format
status: verified
phase: P0
updated: 2026-10-06
related: [U-001, U-006, U-018, U-019, U-028, U-029]
---

# Palettes and images (DATA, image record, TEX, BITM)

Container format: [IMFAT](./imfat.md). Confidence labels as defined there. Structure only; no original content.

- Parser: [`src/original-data/conversion/source-graphics.ts`](../../../src/original-data/conversion/source-graphics.ts) (`readDataPalette`, `readImageRecordHeader`, `decodeImageRecord`, `readEmbeddedPalette`)
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
- Besides model parts, the executable loads two TEX entries by ID for effects: TEX 10151 for debris and TEX 10377 for missiles ([executable](./executable.md#effect-presentation-sources)).

### Nearest-colour metric and tie rule (Unconfirmed)

That textures map to the nearest DATA colour is Confirmed (above). How the original measures "nearest", and which entry it picks on a tie, is Unconfirmed (U-028):

- **No EXE evidence yet.** A bounded read-only search found no nearest-colour code; see [executable](./executable.md#native-tex-preparation-and-nearest-colour-search).
- **Provisional project rule.** The importer records each texture's `nearest` binding to DATA. The production expansion path then applies one function, `nearestColourMap` (see [source structure](../../engineering/source-structure.md#图形-payload)): the least squared Euclidean distance in 8-bit RGB, with ties going to the lower DATA index. This is a project choice, not a finding, and its confidence is at most Likely. A mapping that uses `nearest` carries U-028.
- **Candidate check (P2-05 subtask 11, 2026-10-05).** `local/research/p2-05/nearest-candidates.ts` used the shared source readers and this function on all 58 embedded TEX palettes (1,335 entries). It compared a fixed candidate set: squared distance in 8-bit RGB and in 6-bit VGA space (TEX components truncated by `>> 2` against the raw DATA values), each with ties going to the lower or to the higher index. The implemented function matches the 8-bit lower-index candidate on every entry.

**Ambiguous entries (Unconfirmed).** An entry is visually ambiguous when any tied choice in either space would show a different DATA colour. This covers every tie rule in both spaces, not only the lowest and highest index. There are 78 such palette entries across 29 TEX entries:

- 32 have an index tie in 8-bit space and 71 in 6-bit space, and every one of these ties is between different DATA colours;
- in 8 entries the two spaces choose different indices, and the colours differ too;
- an entry can fall into more than one of these categories.

Agreement between candidates on the remaining entries is not evidence of the original rule. The ambiguous entries, as TEX entry: palette indices:

10001: 5; 10003: 1; 10061: 10; 10145: 0, 3, 10; 10149: 6, 8; 10321: 0, 3, 10; 10377: 1; 10419: 10; 10421: 9, 11; 10451: 3; 10613: 6; 10617: 3; 10625: 2, 4, 7; 10643: 1, 14, 15; 10645: 4; 10681: 1; 10887: 2; 10893: 1; 10895: 2; 10897: 9, 10; 10901: 0, 4; 11067: 2, 13; 11091: 38, 40, 44, 57, 61, 64, 65, 71, 84, 88, 93, 99, 105, 107, 109, 111, 112, 121, 126, 144, 151, 168, 171, 172, 174, 198, 199, 202, 204, 208, 210, 211, 215, 220, 251; 11163: 2; 11261: 0, 4; 11273: 2; 11297: 2; 11309: 0, 8; 11371: 6.

A slice texture that uses an ambiguous entry needs EXE evidence, or an unconfirmed mapping that blocks completeness (P2-01). The player craft's TEX 10681 is affected at palette index 1.

**Consistency reference only.** The player craft is M2ID slot 0, MODL 10743. Its intact parts use TEX 10749, 10747 and 10681 (5, 14 and 16 colours). Each was converted with the production converter (`display: { nearest: DATA }`) and every palette entry expanded with `expandImage`. The recorded counts above (4 of 5, 8 of 14, 16 of 16 colours present) are reproduced exactly in local captures `srangers_008.png`, `srangers_010.png` and `srangers_013.png`; `srangers_091.png` shows 5, 9 and 16 of 92 captures checked. This shows the expansion path is consistent with the earlier observation; it does not measure the metric or the tie rule.

### Checked runtime image equivalence and exact source aliases

**Confirmed (current content equivalence):** the qualified full-span capture described in [executable](./executable.md#qualified-full-span-image-capture) supplies a complete 256×256 raw image and all sixteen palette entries. All 59 `SR.NOB` TEX headers were checked; five entries have the complete required shape. Comparing every pixel and canonical RGB palette byte, together with dimensions, raw row order and opacity, yields exactly two matches in this checked corpus: TEX entries 10147 and 10151. Hashes and direct byte equality both agree. No approximate colour match, row/pixel permutation or nearest-DATA remapping is used. Other entry families and archives are outside this comparison.

**Confirmed (whole-entry equivalence):** these two entries also have identical complete entry data, not merely equal decoded pixels. Both are 65,628 bytes, have directory flags 0 and two relocation positions at +28/+20, and share whole-entry SHA-256 `28b6255fb47647e2c67cac4431fb95072469c5adf53b4354e62043102ecb8fba`. Their different archive IDs/locations do not distinguish their content.

**Confirmed (exact-source corpus classes):** a conservative whole-entry and metadata comparison partitions all 59 TEX entries into 56 exact-source classes. The other duplicate pairs are 10145/10321 and 10901/11261. Class membership requires matching complete bytes, type, directory flags, size, relocation count and ordered positions; decoded-pixel equality alone is insufficient. These are source-equivalence classes, not automatically shared production Asset identities.

**Confirmed (existing model-source references):** this equivalent source family is already represented in all 54 existing candidate model-source closures; each of the three slot-1 closures references 10147. MODL entries 10091, 10143, 10309, 10373, 11063, 11161 and 11369 reference 10147; MODL 10383 references 10151. The observed content therefore does not identify a new image-content family outside those partial closures. This is not proof that the complete slice has no other images, nor a full canonical Asset/edge count.

**Unconfirmed (historical provenance):** the original request ID, actual constructor execution and absence of earlier/downstream mutation remain unobserved. The checked result is one exact content-equivalence family with two alternative source locators, not a choice of which entry the original program requested. Identical content alone does not establish identical semantic roles or version ownership across all consumers.

Evidence: ignored `current-tex-equivalence-34.json`, `runtime-full-content-34-milestone.json`, `exact-source-tex-subgraphs.ts/.json` and private capture files in `local/research/p2-01/`; complete entry data and metadata were independently compared with `parseImfat`/`entryData`, and model references were checked with `parseModel` against `source-profiles.json`. The corpus projection checks 3,481 pairwise comparisons and produces byte-identical JSON on rerun. Original pixels and palette values remain local.

## 4. BITM: bitmaps (Confirmed structure)

- 6 entries embed a 256-colour palette, also BGR: read that way, a portrait shows natural skin tones instead of blue (Likely).
- 22 entries have no embedded palette. Displayed with DATA, their colours are clearly wrong, so their palette lives elsewhere (Unconfirmed, U-018).
- Observed sizes: 48×48, 96×96, 128×128, 320×200 (sprite RLE), 640×316. The 640×316 entries are full-screen scenes.
- At least one portrait displays upside down: rows may be stored bottom-up, or the image may be intentionally flipped (Unconfirmed, U-019).

## 5. Observed maxima against the P2-05 limits (Confirmed)

The P2-05 conversion limits come from [the P2-05 spec](../../plan/p2/05/spec.md#限值与预算). The 256-entry palette is a format rule (8-bit indices); the 640×480 image size is a project safety cap, not a format limit, because the width and height fields are u32. The baseline values below fit within both. `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` (2026-10-05) decodes every image record with the shared source readers:

- 123 image records in total: 59 TEX, 28 BITM, and the 36 records of the 3 MFDD entries;
- the DATA entry passes (768 bytes, every component at most 63);
- for the 64 records with an embedded palette (58 TEX, 6 BITM), every opaque pixel index is below the palette's entry count;
- records without an embedded palette are checked for structure only; 8-bit indices cannot exceed 256 entries.

The run is recorded in [P2-05 subtask 09](../../plan/p2/05/subtasks/09-local-structure-check.md#完成证据).

| Quantity | Baseline maximum | P2-05 limit |
|---|---:|---:|
| Image width | 640 (BITM); TEX 256, MFDD 96 | 640 (safety cap) |
| Image height | 316 (BITM); TEX 256, MFDD 96 | 480 (safety cap) |
| Embedded palette entries | 256 (TEX, BITM) | 256 (format rule) |
| DATA entries | 256 | exactly 256 (format rule) |

