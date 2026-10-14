---
type: format
status: draft
phase: P0
updated: 2026-10-14
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
| `flags` | Miles loop count: 0 plays until stopped, *n* plays *n* times | **Confirmed (code):** the byte is the loop count argument. **Confirmed (meaning of 0 and 1):** from that code and the Miles API, which defines count 0 as loop indefinitely and 1 as play once. The game is consistent with it ([listening](#listening-comparison-p2-0810)): the `flags` 0 engine samples are heard as a continuous hum, and each compared `flags` 1 event plays its sample once. The local WAVs were played once per repetition, so they do not test looping themselves. **Value 8 (P3-03):** it occurs in the slice, on SND 10181 (Warp arrival, [below](#sounds-played-by-id-and-hud-sounds-p3-0110)). By the same code path and Miles API definition it plays the sample 8 times back to back: Likely, since this sound was not compared by listening |

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
  - **Slot 2:** when a missile object (kind `0x100000`, M2ID slot 20, no MODL) is created, from the launching ship's model. The missile builder `0x2e86c` posts that kind and decrements an ammunition count, except while the typed-cheat flag `0x174ed8` is set for the player ([W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code)). Both builders are called from `0x2d578`.
  - **Slot 4:** the impact builders `0x2a40c` (projectile or missile hit) and `0x2a5fc` post a hit event on the struck object. When the object's shield (+0x2c) was below 1 before the hit, that is, the hit reaches the hull or no shield is up, slot 4 plays; otherwise slot 3 does (Confirmed, code, P3-07/04, [D5](./executable.md#d5-other-entries-into-the-damage-rule--confirmed-code); corrected from "the object is destroyed": destruction is the dead flag +0xD8).
- **Warp start:** `0x2be00` runs for the Warp command (dispatcher `0x20d10`, message `0x400` sub-command 0). It takes the destination the map click stored (`0x2b9bc`), computes the distance and an energy cost (`0x30d2c`, see U-026), and refuses when energy is short. On success it posts a play-by-ID event for entry **10401**, and the dispatcher enters warp mode.
  - **Shared sample:** 10401 and the missile sample 10647 are the exact duplicate pair recorded above, so the missile launch and the Warp start use the same sound.
- **Explosion effects:** every EXPL record is {SND entry ID at +0, ANIM entry ID at +4}. The 17 EXPL entries reference four distinct sounds: 10213, 10215, 10217 and 10219 (1.05–2.20 s, against 0.12–0.29 s for the slot-4 samples). Effect objects of kind `0x400000` play their record's sound through `0x55534`.
  - **Selection (Confirmed, code, P3-03/05; first observed by listening):** by listening, the longer blast after an enemy kill, a missile kill and the player's death varies between occurrences among all four sounds, which suggested a random choice among the EXPL entries. The static trace confirms it: the mission build keeps 5, 5 and 3 entries of the three EXIC lists from random starts, and `0x2409c` gives each explosion a random kept entry of the list its variant selects ([textures §7](./textures.md#7-expl-explosion-records-confirmed)). When each variant plays is a P3 behaviour question.

Role correspondences:

| Role | Entries | Confidence |
|---|---|---|
| Fire | Slot 1: 10669 (player), 10179 and 10037 (the two enemy types), 10155 (base) | Confirmed (code and listening); the slice's base does fire |
| Missile | Slot 2: 10647 (all four models with sounds) | Confirmed (code and listening) |
| Explosion | Slot 4: 10175 (player destroyed), 10177 (other ships destroyed); EXPL effect sounds 10213, 10215, 10217, 10219 (longer blast after an enemy kill, a missile kill and the player's death in the first campaign mission) | Confirmed (code and listening) for slot 4, which the code plays on every hit that finds the shield down, the destroying hit included (P3-07/04), and by listening for the four effect sounds in those contexts; the choice among them follows the explosion's variant and a random kept EXPL entry (Confirmed, code, [textures §7](./textures.md#7-expl-explosion-records-confirmed)) |
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
- **Against the original:** the original comparison of all 12 entries is the [P2-08/10 listening](#listening-comparison-p2-0810) above, so the viewer path matches the original through the equal WAVs.
- **Direct comparison per role (Confirmed by listening, [P2-12 subtask 28](../../plan/p2/12/subtasks/28-a1-original-comparison.md#完成证据), 2026-10-08):** the developer compared one viewer Asset per role directly with the game in the baseline DOSBox-X, first campaign mission, each a match: fire `sound/fire/player` (10669), missile `sound/missile` (10647), Warp `sound/warp` (10401), and for explosion the longer blasts as a set, `sound/explosion/blast-v1` to `blast-v4` (10213, 10215, 10217, 10219): every blast heard at a kill in the game matched one of the four in the viewer. Which variant played each time was not noted (the game picks one per occurrence, as above), so this is a role-level comparison, not a per-variant one.
- **Observation (Unconfirmed):** in that session the developer hardly heard `sound/explosion/other` (10177) at kills, while the P2-08/10 listening records it heard and matching at an enemy kill. It may be masked by the longer blast. This does not change the role table; when and how audibly 10177 plays is a trigger question for P3.

#### Sounds played by ID and HUD sounds (P3-01/10)

**Confirmed (every play-by-ID poster):** a play-by-ID event is a sound message whose +8 holds an entry ID; `0x55924` loads that entry with `0x6affc` and plays it. Every poster writes a constant ID (the scan of all message allocations is in [executable](./executable.md#data-loaded-by-the-loop-p3-0110)):

| SND | Poster | Trigger |
|---|---|---|
| 11087 | Dispatcher, message type 2 | Posted by the target selection helpers `0x2799c`, `0x27a04`, `0x27884` and `0x27910` (the `t`/`f`, `u` and `r`/`y` cases of the [target modes](./executable.md#player-target-modes-and-enemy-classification)) |
| 11381 | Dispatcher, message type 4 | Posted by `0x2e4ec` on every selection key the player presses in a flight view (`/`, `.`, `>`, `,`, `<`; through `0x2d6dc`, `0x2d6f0`), also when the selection does not change, and when the rescue or the base re-arm cycles the player's lists; never for other objects ([W3](./executable.md#w3-selection--confirmed-code)) |
| 10485 | Dispatcher, message type 0x100000, after an optional left-display page change (`0x4cdf0`) | Posted by the flight key handler `0x264a0` (two sites), `0x27ab4` and the communications command handler `0x27b44` (seven sites) |
| 10463 | Map click `0x2b9bc` | A Warp destination is set |
| 10401 | Warp start `0x2be00` | As above |
| 10181 | Warp end `0x2bf08` | Arrival |
| 10055 | `0x38780` | A transponder-kind object (`0x4000`) is created at run time by an **active** creator, i.e. only by the flight key `b`; the wingman's parked drop creates the object without the sound (Confirmed, code, P3-08/06; [X2](./executable.md#x2-constructor-0x38780source--confirmed-code)). Reachable in normal play when `b` is (Likely, [key map](../input/key-map.md)) |
| 10167 | Docking `0x38ff4`, sub-commands 1 and 2 | The two selection keys of the base interior |
| 10169 | Docking `0x38ff4`, sub-command 3 | Enter, the selected base action |

These nine entries are exactly the `SR.NOB` entries whose directory flags are 0x50 ([imfat](./imfat.md) §2): loaded when the archive opens and never released.

**Confirmed (other loop sounds outside the models and EXPL):**

- SND 10455 and 10457, loaded at start-up by `0x45420`, are played by `0x46ecc`, which the overlay routine `0x45de0` and the view switch call with a target object and a value. For a live target (byte +3 at least 7), value 0 starts 10455 as a loop; a positive value plays 10457 once whenever the clock passes a due time and sets the next one value ÷ 2 units later. Likely a tone that speeds up as a condition tightens (a lock or approach); the value's source was not traced.
- SND 10409 is loaded by the initialiser of instrument type 9 (`0x4eaa0`, which keeps the block at `0x175f18`; the 73×8 strip above the navigation display). The instrument's update `0x4edf4` plays it as a loop (its `flags` is 0) on one of two voices; this corrects the earlier reading of a single flag (P3-03/24). While `0x175f14` is set and the voice handle `0x175f20` is empty, it passes a non-empty handle `0x175f1c` to `0x53dbc` and clears it (Likely ending that voice), starts the sound with `0x53bf0` into `0x175f20`, and then adjusts that voice (`0x53fec`, `0x53f24`); when `0x175f14` is clear, a non-empty `0x175f20` is passed to `0x53dbc` and cleared the same way. While `0x175f10` is set and both handles are empty, it starts the sound into `0x175f1c`. The two flags are those of the type-9 indicators: `0x175f14` for an enemy missile aimed at the player, `0x175f10` for an object of kinds `0x780` aimed at the player ([executable](./executable.md#hud-map-and-communications-text-from-the-exe-p3-0324), indicators). Its role is Unconfirmed.
- SND 10405 is played by the menu page runner (`0x33e8c`) and belongs to the pages.

**Confirmed (EXPL choice at mission start):** `0x23520` loads, from the three EXIC 10211 lists of 7, 7 and 3 EXPL entries, 5, 5 and 3 consecutive entries from random starts. Which loaded entry an explosion uses (`0x2409c`) is runtime state, chosen by the rule in [textures §7](./textures.md#7-expl-explosion-records-confirmed); across missions every one of the 17 entries and the four effect sounds can occur.

**`flags` of these sounds (Confirmed, data, P3-03/19):** of the 11 play-by-ID and HUD sounds the slice imports (all those above except 10401, which is a model and Warp sample already delivered, and 10405, which belongs to the menu pages), eight have `flags` 1 (play once): 11087, 11381, 10485, 10463, 10055, 10167, 10169 and 10457. SND 10455 and 10409 have `flags` 0 (loop until stopped). SND 10181, the Warp arrival sound, has `flags` 8, the only value outside 0 and 1 in the slice. Under the [playback interpretation](#playback-interpretation-p2-08) it plays 8 times (Likely). The import represents this as sound payload schema 2 with loop mode `repeat` and 8 plays (`sound/event/warp-arrival`; [P3-03 spec, sound payload schema 2](../../plan/p3/03/spec.md#声音-payload-schema-2)), and keeps every other sound's bytes as before. Asset IDs and roles are in the [P3-03 Asset table](../../plan/p3/03/spec.md#asset-与角色).

## 2. SONG and MUSC (Unconfirmed)

- `SR.NOB` has 12 `SONG` entries; `SCENARIO.NOB` has 5 `MUSC` entries, referenced by ID from the campaign table and the cut-scene table. The selected mission's slot (group 0, slot 1) names MUSC 3005, which the mission builder loads (Confirmed, data and EXE).
- Music is played through the Miles MIDI drivers (`.MDI`), so `SONG` is Likely XMIDI or a similar event format. Decoding is part of the music spike (master plan §3.4) and is not needed before P4.
