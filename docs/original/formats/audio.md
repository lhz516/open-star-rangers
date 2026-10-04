---
type: format
status: draft
phase: P0
updated: 2026-10-04
related: [U-004, U-016, U-027]
---

# Audio (SND, SONG, MUSC)

Container format: [IMFAT](./imfat.md). Confidence labels as defined there. Structure only; no original content.

## 1. SND: digital sound effects (Confirmed on all 37 entries)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 | Offset of the sample data; always 20 (relocated pointer) |
| 0x04 | u32 | Sample data length in bytes; always block size − 20 |
| 0x08 | u32 | Sample rate in Hz; observed 9000, 11025, 12000, 15000, 17000, 22000, 22050 |
| 0x0C | u32 | Bits per sample: 8 or 16 |
| 0x10 | u32 | Flags; observed 0, 1, 8; meaning Unconfirmed (possibly looping or channel layout) |
| 0x14 | bytes | Raw PCM samples, no further header |

- 22 entries are 8-bit; their sample mean is about 128 in every case, so 8-bit samples are **unsigned** (Confirmed).
- 15 entries are 16-bit; Likely signed little-endian (the usual Sound Blaster 16 format), not yet verified by playback.
- Total length is about 30 seconds.
- Playback in the browser needs only conversion to floating-point samples for Web Audio; no codec is required.

### Sample boundaries and candidate model references (Confirmed structure)

`local/research/p2-01/sound-source-profile.ts` validates all 37 SND entries. Every block has a single relocated sample pointer at header offset 0, pointing to byte 20; the declared sample length covers the remainder of the block and is divisible by the sample width. This supports a whole sample-region unit, not one Asset per sample point. The reported word count does not assume a channel count or resolve flags.

An exact comparison of sample bytes, rate, width and flags finds one duplicate pair, entry IDs 10401 and 10647, leaving 36 distinct sample/format bindings across the archive. Matching only sample bytes or only source IDs is insufficient. These aliases are represented by a shared provisional research reference; they are not approved semantic Asset IDs or converted payload identities.

The script independently reconstructs MODL sound references for all 54 candidate slots and cross-checks them with the [source profiles](./scenario.md#campaign-candidate-source-profiles-confirmed-structure). Each of the three slot-1 profiles has 13 distinct sample bindings and 18 distinct model-to-sound edges. Each includes only one member of the duplicate pair, so alias merging does not reduce these slot-1 counts.

**Coverage limit:** the ignored report explicitly has `complete: false` and `rankingAvailable: false`. Sound-slot meanings, channel/flag interpretation, the four required gameplay sound roles and fixed runtime audio remain unresolved (U-004/U-027; P2-08). Resolving structural model references does not qualify a mission or complete S-02 ranking. Reproduce with `node local/research/p2-01/sound-source-profile.ts`; only metadata and counts are reported, never sample data.

## 2. SONG and MUSC (Unconfirmed)

- `SR.NOB` has 12 `SONG` entries; `SCENARIO.NOB` has 5 `MUSC` entries, referenced by ID from the campaign table and the cut-scene table.
- Music is played through the Miles MIDI drivers (`.MDI`), so `SONG` is Likely XMIDI or a similar event format. Decoding is part of the music spike (master plan §3.4) and is not needed before P4.
