---
type: format
status: draft
phase: P0
updated: 2026-10-08
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
| 0x10 | u32 | Flags; observed 0, 1, 8; its low byte is the Miles loop count (see [playback interpretation](#playback-interpretation-p2-08)) |
| 0x14 | bytes | Raw PCM samples, no further header |

- 22 entries are 8-bit; their sample mean is about 128 in every case, so 8-bit samples are **unsigned** (Confirmed).
- 15 entries are 16-bit; they are **signed little-endian** (Confirmed by the playback code, sample statistics and listening; see [playback interpretation](#playback-interpretation-p2-08)).
- Total length is about 30 seconds.
- Playback in the browser needs only conversion to floating-point samples for Web Audio; no codec is required.

### Sample boundaries and candidate model references (Confirmed structure)

`local/research/p2-01/sound-source-profile.ts` validates all 37 SND entries. Every block has a single relocated sample pointer at header offset 0, pointing to byte 20; the declared sample length covers the remainder of the block and is divisible by the sample width. This supports a whole sample-region unit, not one Asset per sample point. The reported word count does not assume a channel count or resolve flags.

An exact comparison of sample bytes, rate, width and flags finds one duplicate pair, entry IDs 10401 and 10647, leaving 36 distinct sample/format bindings across the archive. Matching only sample bytes or only source IDs is insufficient. These aliases are represented by a shared provisional research reference; they are not approved semantic Asset IDs or converted payload identities.

The script independently reconstructs MODL sound references for all 54 candidate slots and cross-checks them with the [source profiles](./scenario.md#campaign-candidate-source-profiles-confirmed-structure). Each of the three slot-1 profiles has 13 distinct sample bindings and 18 distinct model-to-sound edges. Each includes only one member of the duplicate pair, so alias merging does not reduce these slot-1 counts.

**Coverage limit:** the ignored report explicitly has `complete: false` and `rankingAvailable: false`. Sound-slot meanings, channel/flag interpretation, the four required gameplay sound roles and fixed runtime audio remain unresolved (U-004/U-027; P2-08). Resolving structural model references does not qualify a mission or complete S-02 ranking. Reproduce with `node local/research/p2-01/sound-source-profile.ts`; only metadata and counts are reported, never sample data.

The P2-08 research below supersedes that coverage limit for the slice candidate.

### Playback interpretation (P2-08)

Addresses use the conventions of [executable §4](./executable.md#4-code-landmarks). The Miles sample functions are identified by the debug trace format string each wrapper references: `AIL_set_sample_address` `0x70925`, `AIL_set_sample_type` `0x709a7`, `AIL_start_sample` `0x70a29`, `AIL_set_sample_playback_rate` `0x70bdd`, `AIL_set_sample_volume` `0x70c53`, `AIL_set_sample_pan` `0x70cc9`, `AIL_set_sample_loop_count` `0x70d3f`.

**Confirmed (native code):** `0x53bf0` plays a loaded SND block by passing its header fields to Miles:
- **Address and rate:** the relocated sample pointer and the length go to `AIL_set_sample_address`, and the sample rate goes to `AIL_set_sample_playback_rate`.
- **Fixed settings:** volume is fixed at 127 and pan at 64 (centre).
- **Loop count:** the low byte of `flags` is passed unchanged to `AIL_set_sample_loop_count`.
- **Sample type:** a bit width of 8 selects `AIL_set_sample_type(S, 0, 0)`; any other width selects `(S, 1, 1)`. No other path in it reads the header.

| Fact | Result | Confidence and evidence |
|---|---|---|
| Channels | Mono for every SND | **Confirmed for the studied samples; Likely for the rest:** the only two type codes passed are 0 and 1, which the Miles DIG API defines as its mono formats (`DIG_F_MONO_8`, `DIG_F_MONO_16`); that mapping comes from the Miles API, not from a recorded local source. Of the 18 studied samples, 11 have byte counts not divisible by the stereo frame size, so they cannot be stereo, and every sample compared by [listening](#listening-comparison-p2-0810) played at the original pitch and speed as mono at its stored rate |
| 8-bit samples | Unsigned | **Confirmed:** by the sample means above; consistent with type flags 0 |
| 16-bit samples | Signed little-endian | **Confirmed:** type flags 1 is `DIG_PCM_SIGN`, and Miles reads native x86 (little-endian) words. Statistics on all 10 studied 16-bit samples agree: as signed little-endian, the mean is within ±0.013 of full scale and the mean absolute step between adjacent samples is 0.011–0.051. As unsigned little-endian the step is 0.07–0.49 with means up to −0.55; as signed big-endian it is 0.33–0.67. [Listening](#listening-comparison-p2-0810): 9 of the 10 (all but 11071, a slot-3 sample not compared) sound clean and match the game |
| `flags` | Miles loop count: 0 plays until stopped, *n* plays *n* times | **Confirmed (code):** the byte is the loop count argument. **Confirmed (meaning of 0 and 1):** from that code and the Miles API, which defines count 0 as loop indefinitely and 1 as play once. The game is consistent with it ([listening](#listening-comparison-p2-0810)): the `flags` 0 engine samples are heard as a continuous hum, and each compared `flags` 1 event plays its sample once. The local WAVs were played once per repetition, so they do not test looping themselves. Value 8 occurs outside the slice and is not studied |

The 18 studied samples are the 13 slice samples, Warp entry 10401 and the four EXPL sounds (see below). Their formats, from `local/research/p2-08/sound-research.json`:

| Measure | Result |
|---|---|
| Sample rate (Hz) | 9,000 × 1; 11,025 × 13; 17,000 × 1; 22,050 × 3 |
| Bit width | 8 × 8; 16 × 10 |
| `flags` 0 | 3 samples, all MODL slot-0 entries (10679, 11023, 10319). All are whole mono frames; two are also divisible into stereo frames. Meaning: loop until stopped (Confirmed) |
| `flags` 1 | 15 samples (every other studied sample). All are whole mono frames; 10 are not divisible into stereo frames. Meaning: play once (Confirmed) |

### Slice sample set and role correspondences (P2-08)

`local/research/p2-08/sound-research.ts` rebuilds the five sound slots of the [P2-01 candidate](./scenario.md#campaign-candidate-source-profiles-confirmed-structure)'s models (M2ID slots 0, 7, 8, 14, 17):

| M2ID slot / MODL | Slot 0 | Slot 1 | Slot 2 | Slot 3 | Slot 4 |
|---|---|---|---|---|---|
| 0 / 10743 (player) | 10679 | 10669 | 10647 | 0 | 10175 |
| 7 / 11063 | 11023 | 10179 | 10647 | 11071 | 10177 |
| 8 / 10373 | 10319 | 10037 | 10647 | 10665 | 10177 |
| 14 / 11399 (friendly transponder craft) | 0 | 0 | 0 | 0 | 0 |
| 17 / 10611 (base) | 0 | 10155 | 10647 | 10035 | 10177 |

**Confirmed (structure):** 13 distinct SND entries, as recorded above. The slice references 10647, one member of the duplicate pair; its other member 10401 is not a model slot.

**Confirmed (native code paths; meaning of slots 1, 2 and 4 confirmed by [listening](#listening-comparison-p2-0810)):** sound events are dispatched by `0x554a0`; object events go to `0x55534`, play-by-ID events to `0x55924`.
- **MODL sound slots:** `0x55534` plays slot *k* of an object's MODL (pointer at +0x18 + 4*k*):
  - **Slots 0 and 3:** played on other object events. They serve no core role, so P2-08 leaves their meanings **Unconfirmed**. Observations for later research:
    - **Slot 0:** retuned through `0x55d20`/`0x53fec` after it starts. Its three slice samples are the only `flags` 0 (loop) samples, and by listening they sound like the in-flight engine hum.
    - **Slot 3:** the code plays it when a hit leaves the object intact (see slot 4); not compared by listening.
  - **Slot 1:** when a gun projectile object (kind `0x200000`, M2ID slot 21, no MODL) is created, from the firing ship's model. The gun message builder `0x2e5e8` posts that kind.
  - **Slot 2:** when a missile object (kind `0x100000`, M2ID slot 20, no MODL) is created, from the launching ship's model. The missile builder `0x2e86c` posts that kind and decrements an ammunition count. Both builders are called from `0x2d578`.
  - **Slot 4:** the impact builders `0x2a40c` (projectile or missile hit) and `0x2a5fc` post a hit event on the struck object. When its value at +0x2c is below 1, i.e. the object is destroyed, slot 4 plays; otherwise slot 3 does.
- **Warp start:** `0x2be00` runs for the Warp command (dispatcher `0x20d10`, message `0x400` sub-command 0). It takes the destination the map click stored (`0x2b9bc`), computes the distance and an energy cost (`0x30d2c`, see U-026), and refuses when energy is short. On success it posts a play-by-ID event for entry **10401**, and the dispatcher enters warp mode.
  - **Shared sample:** 10401 and the missile sample 10647 are the exact duplicate pair recorded above, so the missile launch and the Warp start use the same sound.
- **Explosion effects:** every EXPL record is {SND entry ID at +0, ANIM entry ID at +4}. The 17 EXPL entries reference four distinct sounds: 10213, 10215, 10217 and 10219 (1.05–2.20 s, against 0.12–0.29 s for the slot-4 samples). Effect objects of kind `0x400000` play their record's sound through `0x55534`.
  - **Selection (Likely):** by listening, the longer blast after an enemy kill, a missile kill and the player's death varies between occurrences among all four sounds. The rule is therefore Likely a random choice among the EXPL entries (the EXIC lists group them); it is not traced statically. When each variant plays is a P3 behaviour question.

Role correspondences:

| Role | Entries | Confidence |
|---|---|---|
| Fire | Slot 1: 10669 (player), 10179 and 10037 (the two enemy types), 10155 (base) | Confirmed (code and listening); the slice's base does fire |
| Missile | Slot 2: 10647 (all four models with sounds) | Confirmed (code and listening) |
| Explosion | Slot 4: 10175 (player destroyed), 10177 (other ships destroyed); EXPL effect sounds 10213, 10215, 10217, 10219 (longer blast after an enemy kill, a missile kill and the player's death in the first campaign mission) | Confirmed (code and listening) for slot 4, and by listening for the four effect sounds in those contexts; Likely (random) for the choice among the four |
| Warp | 10401 at the Warp start (same bytes as 10647) | Confirmed (code and listening) |

#### Listening comparison (P2-08/10)

On 2026-10-05 the developer compared the converted samples with the game in the baseline DOSBox-X (Sound Blaster 16, `SB16.DIG`), in the first campaign mission. Each local WAV was made with the repository's SND converter and float mapping as mono at the stored rate, played once per repetition; no recording was made. For each item the developer judged three things: same sound, same pitch and speed, and no sign, byte-order or channel noise.

| Role or use | Entry | Trigger | Judgement |
|---|---|---|---|
| Fire (player) | 10669 | Main gun, no target | Match on all three |
| Fire (first enemy type) | 10179 | Enemy gun | Match on all three |
| Fire (second enemy type) | 10037 | Enemy gun | Match on all three |
| Fire (base) | 10155 | Base gun | Match on all three |
| Missile launch | 10647 | One missile | Match on all three |
| Warp start | 10401 | Map destination, then Warp | Match on all three |
| Explosion (player destroyed) | 10175 | Player ship destroyed | Match on all three |
| Explosion (other ship destroyed) | 10177 | Enemy ship destroyed | Match on all three |
| Explosion effects | 10213, 10215, 10217, 10219 | Enemy kill, missile kill, player death | Each heard and each a match on all three; the one played varies between occurrences |
| Engine sounds (slot 0, `flags` 0; meaning not part of the gate) | 10319, 10679, 11023 | In flight | Sound like the continuous engine hum; clean when repeated back to back |

Evidence (ignored `local/research/p2-08/`):
- read-only Ghidra scripts `Probe.java` and `Scan.java`, and their logs;
- `sound-research.ts` and `.json`, which hold entry IDs, slots, formats and statistics only;
- `snd-reference-scan.ts` and `expl-fields.ts`;
- local listening WAV files and `listening-checklist.md`, used in the [listening comparison](#listening-comparison-p2-0810); the developer's judgements are recorded above and in P2-08/10.

The project was opened with `-readOnly -noanalysis`; nothing was saved.

#### Viewer playback path (P2-12)

- **Sample equivalence (Confirmed, [P2-12 subtask 14](../../plan/p2/12/subtasks/14-sound-baseline-equivalence.md#完成证据), 2026-10-07):** for the 12 core Assets of the P2-12 candidate (commit `97b70de`, converter version `osr-import.graphics-2.logic-1.audio-1.models-2`) (4 fire, the missile, the Warp and 6 explosions; entries as in the role table above), the buffers the production viewer hands to Web Audio equal the P2-08/10 local WAVs: one channel, the same rate and frame count, and every one of 115,821 samples equal under the P2-08 float mapping. Each plays once without looping, and the expected entry for each Asset was listed independently of the production sound table.
- **Listening in the viewer (Confirmed for the WAV comparison, [P2-12 subtask 21](../../plan/p2/12/subtasks/21-user-comparison-session.md#完成证据), 2026-10-08):** after a real import and a same-origin restore, the developer played the 12 Assets one by one in the production viewer (Chrome 155, macOS) and judged each against its WAV: same sound, same pitch and speed, no sign, byte-order or channel noise; each played through once, and Stop stopped it at once.
- **Against the original:** the original comparison of these entries is the [P2-08/10 listening](#listening-comparison-p2-0810) above, so the viewer path matches the original through the equal WAVs. A direct P2-12 comparison of each role (fire, missile, Warp, explosion) with the original is not recorded: the developer reported comparing with the game but did not name the Asset compared for each role.

## 2. SONG and MUSC (Unconfirmed)

- `SR.NOB` has 12 `SONG` entries; `SCENARIO.NOB` has 5 `MUSC` entries, referenced by ID from the campaign table and the cut-scene table.
- Music is played through the Miles MIDI drivers (`.MDI`), so `SONG` is Likely XMIDI or a similar event format. Decoding is part of the music spike (master plan §3.4) and is not needed before P4.
