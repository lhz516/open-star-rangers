---
type: format
status: draft
phase: P0
updated: 2026-10-01
related: [U-004, U-016]
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

## 2. SONG and MUSC (Unconfirmed)

- `SR.NOB` has 12 `SONG` entries; `SCENARIO.NOB` has 5 `MUSC` entries, referenced by ID from the campaign table and the cut-scene table.
- Music is played through the Miles MIDI drivers (`.MDI`), so `SONG` is Likely XMIDI or a similar event format. Decoding is part of the music spike (master plan §3.4) and is not needed before P4.
