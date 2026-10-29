---
type: format
status: draft
phase: P0
updated: 2026-10-28
related: [U-004, U-016, U-021, U-027]
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
| `flags` | Miles loop count: 0 plays until stopped, *n* plays *n* times | **Confirmed (code):** the byte is the loop count argument. **Confirmed (meaning of 0 and 1):** from that code and the Miles API, which defines count 0 as loop indefinitely and 1 as play once. The game is consistent with it ([listening](#listening-comparison-p2-0810)): the `flags` 0 engine samples are heard as a continuous hum, and each compared `flags` 1 event plays its sample once. The local WAVs were played once per repetition, so they do not test looping themselves. **Value 8 (P3-03):** it occurs in the slice, on SND 10181 (Warp arrival, [below](#sounds-played-by-id-and-hud-sounds-p3-0110)). By the same code path and Miles API definition it plays the sample 8 times back to back: Likely, since this sound was not compared by listening. **P3-14/05:** the mechanism is now Confirmed (code) in the linked Miles library: the count is tested only when the source position reaches the end of the sample, and each count above 1 restarts it from the first sample, so *n* counts *n* complete source passes whatever the playback rate ([mixing](#digital-mixing-in-the-linked-miles-library-a-09)); not observed at runtime or by listening |

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
      **P3-14/05 (Confirmed, code):** slot 0 is a continuous per-object loop, started and kept by the camera step's update items and restarted after its voice is lost ([per-object table](#per-object-sound-table-a-02)). For the player it is the engine: its pitch follows the commanded speed and it is muted below 1.0 ([player sources](#player-sources-and-the-engine-a-05)). Other models' slot 0 gets the positional law of non-player sources; that it is their engine hum remains Likely (listening).
    - **Slot 3:** the code plays it when a hit leaves the object intact (see slot 4); not compared by listening.
      **P3-14/05 (Confirmed, code):** slot 3 is the hit sound while the victim's shield was at least 1 before the hit (hit item sub-code 4 with flag 0), in class 2 with preemption; on a slot whose previous hit has ended, the next hit is silent ([per-object table](#per-object-sound-table-a-02)). Still not compared by listening.
  - **Slot 1:** when a gun projectile object (kind `0x200000`, M2ID slot 21, no MODL) is created, from the firing ship's model. The gun message builder `0x2e5e8` posts that kind.
  - **Slot 2:** when a missile object (kind `0x100000`, M2ID slot 20, no MODL) is created, from the launching ship's model. The missile builder `0x2e86c` posts that kind and decrements an ammunition count, except while the typed-cheat flag `0x174ed8` is set for the player ([W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code)). Both builders are called from `0x2d578`.
  - **Slot 4:** the impact builders `0x2a40c` (projectile or missile hit) and `0x2a5fc` post a hit event on the struck object. When the object's shield (+0x2c) was below 1 before the hit, that is, the hit reaches the hull or no shield is up, slot 4 plays; otherwise slot 3 does (Confirmed, code, P3-07/04, [D5](./executable.md#d5-other-entries-into-the-damage-rule--confirmed-code); corrected from "the object is destroyed": destruction is the dead flag +0xD8).
- **Warp start:** `0x2be00` runs for the Warp command (dispatcher `0x20d10`, message `0x400` sub-command 0). It takes the destination the map click stored (`0x2b9bc`), computes the distance from the player's current position and an energy cost (`0x30d2c`), and refuses silently (no sound or text) when the interval has not passed or energy is short. It only checks the cost; the charge comes at the completion (P3-09/05, [Warp start](./executable.md#warp-cost-and-warp-start-p3-0905)). On success it posts a play-by-ID event for entry **10401**, and the dispatcher enters warp mode.
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
- **Observation (Unconfirmed):** in that session the developer hardly heard `sound/explosion/other` (10177) at kills, while the P2-08/10 listening records it heard and matching at an enemy kill. It may be masked by the longer blast. This does not change the role table. P3-14/05 established the competing mechanism ([10177 at kills](#10177-at-kills-mechanism-only)) and P3-14/24 observed it at runtime ([runtime references](#runtime-references-p3-1424)); the listening verdict belongs to P3-14/26.

#### Sounds played by ID and HUD sounds (P3-01/10)

**Confirmed (every play-by-ID poster):** a play-by-ID event is a sound message whose +8 holds an entry ID; `0x55924` loads that entry with `0x6affc` and plays it. Every poster writes a constant ID (the scan of all message allocations is in [executable](./executable.md#data-loaded-by-the-loop-p3-0110)):

| SND | Poster | Trigger |
|---|---|---|
| 11087 | Dispatcher, message type 2 | Posted by the target selection helpers `0x2799c`, `0x27a04`, `0x27884` and `0x27910` (the `t`/`f`, `u` and `r`/`y` cases of the [target modes](./executable.md#player-target-modes-and-enemy-classification)) |
| 11381 | Dispatcher, message type 4 | Posted by `0x2e4ec` on every selection key the player presses in a flight view (`/`, `.`, `>`, `,`, `<`; through `0x2d6dc`, `0x2d6f0`), also when the selection does not change, and when the rescue or the base re-arm cycles the player's lists (the base missile walk posts after the message loop, so its messages are never dispatched: [BS7](./executable.md#bs7-sounds--confirmed-code)); never for other objects ([W3](./executable.md#w3-selection--confirmed-code)) |
| 10485 | Dispatcher, message type 0x100000, after an optional left-display page change (`0x4cdf0`) | Posted by the flight key handler `0x264a0` (two sites), `0x27ab4` and the communications command handler `0x27b44` (seven sites) |
| 10463 | Map click `0x2b9bc` | A Warp destination is set |
| 10401 | Warp start `0x2be00` | As above |
| 10181 | Warp end `0x2bf08` | Arrival, only when an enemy (kinds `0x93780`, alive) lies strictly within the player's craft +0x0C of the arrival point (`0x3c040`); otherwise no sound (Confirmed, code, P3-09/06, [completion](./executable.md#warp-progress-completion-and-interruptions-p3-0906)) |
| 10055 | `0x38780` | A transponder-kind object (`0x4000`) is created at run time by an **active** creator, i.e. only by the flight key `b`; the wingman's parked drop creates the object without the sound (Confirmed, code, P3-08/06; [X2](./executable.md#x2-constructor-0x38780source--confirmed-code)). Reachable in normal play when `b` is (Likely, [key map](../input/key-map.md)) |
| 10167 | Docking `0x38ff4`, sub-commands 1 and 2 | The two selection keys of the base interior |
| 10169 | Docking `0x38ff4`, sub-command 3 | Enter, the selected base action |

These nine entries are exactly the `SR.NOB` entries whose directory flags are 0x50 ([imfat](./imfat.md) §2): loaded when the archive opens and never released.

**Confirmed (base interior, code; P3-10/05):** SND 10167 (Up, Down) and 10169 (Enter) are type-2 presentation items posted in request handling; the frame render calls `0x554a0` first, which plays them by ID in the same frame when sound is enabled, on every press, also at the cursor clamp and on a row that needs no service ([BS4](./executable.md#bs4-base-keys-sub-commands-13-of-message-0x400000--confirmed-code), [BS7](./executable.md#bs7-sounds--confirmed-code)). While the player is docked, `0x554a0` skips the object sound types 4 and 8 ([BS7](./executable.md#bs7-sounds--confirmed-code), [DK4](./executable.md#dk4-systems-while-docked-activity-3--confirmed-code-unless-marked)). The selection sound (11381) of the base missile walk is never dispatched (BS7).

**Confirmed (other loop sounds outside the models and EXPL):**

- SND 10455 and 10457, loaded at start-up by `0x45420`, are played by `0x46ecc`, which the overlay routine `0x45de0` and the view switch call with a target object and a value. For a live target (byte +3 at least 7), value 0 starts 10455 as a loop; a positive value plays 10457 once whenever the clock passes a due time and sets the next one value ÷ 2 units later. Likely a tone that speeds up as a condition tightens (a lock or approach); the value's source was not traced. **Correction (P3-14/05, Confirmed, code):** the value is the player's missile-lock progress `0x2e080` ([W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code)) for the player's target, so this is the lock tone. A positive value plays 10457 only on a frame where the value **changes** and the due time has passed; while the value holds, nothing plays ([lock tone](#lock-tone-a-06)).
- SND 10409 is loaded by the initialiser of instrument type 9 (`0x4eaa0`, which keeps the block at `0x175f18`; the 73×8 strip above the target display). The instrument's update `0x4edf4` plays it as a loop (its `flags` is 0) on one of two voices; this corrects the earlier reading of a single flag (P3-03/24). While `0x175f14` is set and the voice handle `0x175f20` is empty, it passes a non-empty handle `0x175f1c` to `0x53dbc` and clears it (Likely ending that voice; Confirmed by P3-14/03: `0x53dbc` stops the voice), starts the sound with `0x53bf0` into `0x175f20`, and then adjusts that voice (`0x53fec`, `0x53f24`); when `0x175f14` is clear, a non-empty `0x175f20` is passed to `0x53dbc` and cleared the same way. While `0x175f10` is set and both handles are empty, it starts the sound into `0x175f1c`. The two flags are those of the type-9 indicators: `0x175f14` for an enemy missile aimed at the player, `0x175f10` for an object of kinds `0x780` aimed at the player ([executable](./executable.md#hud-map-and-communications-text-from-the-exe-p3-0324), indicators). Its role is Unconfirmed. **Correction (P3-14/05, Confirmed, code):** `0x175f14` is set for an active, state ≥ 7, kind-20 (`0x100000`) missile targeting the player, with no owner, side or guidance test, so not only an enemy one; `0x175f10` also requires that object's weapon lock level (+0x118) to be 3 or 4. Cadence, gates and voice parameters are in [instrument-9 warning](#instrument-9-warning-a-07); both conditions are unreachable in the selected mission (Likely, with the P3-14/24 runtime check there).
- SND 10405 is played by the menu page runner (`0x33e8c`) and belongs to the pages.

**Confirmed (EXPL choice at mission start):** `0x23520` loads, from the three EXIC 10211 lists of 7, 7 and 3 EXPL entries, 5, 5 and 3 consecutive entries from random starts. Which loaded entry an explosion uses (`0x2409c`) is runtime state, chosen by the rule in [textures §7](./textures.md#7-expl-explosion-records-confirmed); across missions every one of the 17 entries and the four effect sounds can occur.

**`flags` of these sounds (Confirmed, data, P3-03/19):** of the 11 play-by-ID and HUD sounds the slice imports (all those above except 10401, which is a model and Warp sample already delivered, and 10405, which belongs to the menu pages), eight have `flags` 1 (play once): 11087, 11381, 10485, 10463, 10055, 10167, 10169 and 10457. SND 10455 and 10409 have `flags` 0 (loop until stopped). SND 10181, the Warp arrival sound, has `flags` 8, the only value outside 0 and 1 in the slice. Under the [playback interpretation](#playback-interpretation-p2-08) it plays 8 times (Likely; the mechanism, 8 complete source passes, is Confirmed in code by P3-14/05, [mixing](#digital-mixing-in-the-linked-miles-library-a-09)). The import represents this as sound payload schema 2 with loop mode `repeat` and 8 plays (`sound/event/warp-arrival`; [P3-03 spec, sound payload schema 2](../../plan/p3/03/spec.md#声音-payload-schema-2)), and keeps every other sound's bytes as before. Asset IDs and roles are in the [P3-03 Asset table](../../plan/p3/03/spec.md#asset-与角色).

### Flight sound presentation (P3-14)

P3-14/01–04 traced, read-only and static, how flight sounds are triggered, allocated, positioned and mixed and how they behave across modes; P3-14/05 checked the Miles natural-end path and entered the results. Every claim marked Confirmed (code) was read from native instructions; a full decompile was used only to navigate. No DOSBox run was made for 01–05; the runtime references of P3-14/24 are in [runtime references](#runtime-references-p3-1424). Clock values are units of the per-frame sample `0x186414` (1/64 s, advancing by 2; [time base](./executable.md#simulation-time-base-p3-0106)). "ps" is the player-state block `0x1b0638` (from `0x52694`), whose +0x8C is the player object; "activity" is object byte +2 (0 parked, 1 active, 3 docked) and "state" is byte +3.

#### Miles calls and sample status

- **Wrapper identities (Confirmed, the library's trace strings, P3-14/01):** besides the seven setters [above](#playback-interpretation-p2-08): `AIL_set_preference` `0x6f1ec`, `AIL_install_DIG_INI` `0x70316`, `AIL_allocate_sample_handle` `0x70561`, `AIL_release_sample_handle` `0x70745`, `AIL_init_sample` `0x707b2`, `AIL_stop_sample` `0x70a96`, `AIL_resume_sample` `0x70b03`, `AIL_end_sample` `0x70b70`, `AIL_sample_status` `0x70db5`, `AIL_set_digital_master_volume` `0x7122e`, `AIL_uninstall_DIG_driver` `0x704f4`, `AIL_shutdown` `0x6f159`; sequence allocate, release, stop, resume and end `0x72091`, `0x72176`, `0x72349`, `0x723b6`, `0x72423`. The library is the statically linked Miles 3.03 ([executable §2](./executable.md#2-linked-libraries-confirmed-unless-noted)).
- **Sample status in the linked library (Confirmed, code, P3-14/05):** init `0x8a200` sets status 2; start `0x8a430` resets the position and sets 4; stop `0x8a4b0` changes 4 to 8 and resume `0x8a4d0` 8 to 4, neither touching the position; end `0x8a530` sets 2 unless the status is 1 (free) or 2. The mixer mixes only status-4 samples, and `0x9cb20` sets 2 (at `0x9cceb`) when the final loop pass ends; the game's start path `0x53bf0` never queues a second buffer, so every finite sound ends this way. The status wrapper returns the library value unchanged. A natural end, `AIL_end_sample` and the game's stop-all therefore all leave a status other than 4.
- **Game-side tests (Confirmed, code):** `0x53b54(handle)` reports "still playing" only when the handle's serial still owns its voice, the voice is active and the status is 4; otherwise, when the serial matches, it ends the voice, unlocks its block, clears the active flag and decrements its class count. `0x53dbc(handle)` stops a voice (end, unlock, class count − 1) only when the serial matches and the voice is active, so a stale handle is a no-op. `0x545c0` reaps only status 2, never a paused (8) voice.

#### Presentation-item dispatch (A-01)

**Confirmed (code):**

- **Lists:** `0x52cb4(type)` takes an item from the pool `0x1b0750` and appends it to the tail of the list `0x1b078c[log2(type)]` (five lists, types 1, 2, 4, 8, 0x10). An item holds the type at +0, the subject handle (counted) at +4, a code at +8, a sub-code at +9 and dwords at +0xC and +0x10; a type-2 item holds the SND entry ID at +8, a skip byte at +0xC and a class word at +0xE. `0x52c3c` releases and empties all lists; its only caller is the start of the dispatcher pass `0x20d10` (`0x20d19`).
- **Dispatcher `0x554a0`:** called only by the frame render `0x3ee58` (at `0x3ee65`), after `0x40c90` and before any view-specific branch or drawing, so once per main-loop iteration. It returns at once while `0x17618c` (digital driver installed; set by `0x53414`, cleared by the full shutdown `0x53734`) is 0, and the items die at the next clear. It walks types 1, 2, 4, 8 in that order (`0x52d60`, mask 0xF), first in, first out within a type: type 2 goes to the play-by-ID `0x55924`, types 4 and 8 to the object path, type 1 is skipped (jump table `0x55480`). Its early exit on a negative result is dead code.
- **Docked skip:** while ps and its player exist and the player's activity is 3, every type-4 and type-8 item is skipped, removal items included; type-2 items are not affected. The gate is the activity, not the view or the input context.
- **Routing:** an object item with code 3 goes to the removal `0x55894`, every other to `0x55534`.
- **Order within a frame:** all play-by-ID sounds start before all type-4 items, and those before all type-8 items, each in posting order. A missile launch or a hit (type 4) is therefore handled before a gun shot or an explosion (type 8) of the same frame.

| Object item code | Posters (item type) | Sound handling |
|---|---|---|
| 0, creation or activation | missile constructor `0x2b00c` (4); gun-projectile constructor `0x25b0c` (8); instantiation or resume `0x2c3b0` (4); `0x38780` (4); explosion activation `0x2409c` (8); fragment constructors `0x24ec4`, `0x25124` (8) | Only for a gun projectile (`0x200000`) or a missile (`0x100000`): the **owner's** (block +0xFC) slot 1 or 2; an invalid owner gives no sound. Every other code-0 item touches no table |
| 1, update | only the camera step `0x21584`, while ps and its player exist, for every object with activity ≠ 0 and state 4 or ≥ 7: kinds `0x21fffff` as type 4, kinds `0x1600000` as type 8 | None for gun projectiles, missiles and kind `0x1000000`; an explosion (`0x400000`) plays its EXPL record's sound; every other kind its model slot 0. The map marker (`0x2000000`) is in the mask; whether it has a slot-0 sound was not traced (Unconfirmed) |
| 2, sub-code 4, hit | `0x2a40c` (projectile or missile impact) and `0x2a5fc` (other damage entries; skipped when the victim's dead flag +0xD8 is set); +0xC := 1 when the victim's shield +0x2C was ≤ 0 before the damage | The victim's slot 4 (+0xC ≠ 0) or slot 3 |
| 2, sub-codes 3, 5, 6 | explosion frames `0x2409c` (3); `0x216d4`, `0x2574c`, `0x3f500`, `0x67938`, `0x67b98` (5); the player flash `0x24314` (6) | None; no table access |
| 3, removal | `0x21650` (only for activity 1; callers include message 0x40 and the explosion end in `0x2409c`); the area check `0x3a4b0`; the dispatcher case at `0x214cb` | `0x55894` |

- **Parked hits:** the parked engagement `0x30150` posts no item ([E6](./executable.md#e6-comparison-with-active-area-hits--confirmed-code)) and parked objects get no update item, so code 2 sub-code 4 is the only hit-sound path.
- **Play-by-ID items:** every poster writes +0xC = 0 and +0xE = 0. `0x55924` plays only when +0xC is 0, uses the class at +0xE or 4 when it is 0, loads the entry and starts it with preemption and **without keeping a handle**, so such a voice ends only naturally or by a global stop. Posters are in the [table above](#sounds-played-by-id-and-hud-sounds-p3-0110), boundary cases [below](#play-by-id-boundaries-and-reachability-a-10).

**Survival by pipeline position (Confirmed, code; [frame pipeline](./executable.md#frame-pipeline-p3-0201)):** a frame runs `0x3266c`, `0x25894`, the update walk `0x20938` (the player first, with its key and mouse polls and the pause loop), then `0x20d10` (clear at `0x20d19`, radio step, spawn check, message loop, post-loop systems, camera step `0x21584`) and finally the render `0x3ee58` with `0x554a0`.

- (a) A presentation item posted before `0x20d19`, in `0x3266c` or any update callback, is discarded unhandled; so would be a 10055 item from the AI path `0x62aa0` → `0x38780` inside an update callback.
- (b) A dispatcher message posted before `0x20d19`, even before a pause in the same callback, survives and is handled in that frame's message loop; the item its handler posts plays.
- (c) An item posted after `0x20d19` survives a later global stop or page in the same frame, because `0x53978`, `0x53734` and the page runner `0x32fec` leave the lists alone; it starts at that frame's render.
- (d) Hence the escape-pod loss (`0x32e14` inside the message loop) can have same-frame survivors, while the beacon loss and the result-delay stop (in `0x3266c`) cannot; only items produced later from messages, such as the rescue's, play. Messages posted after the loop are never handled (the base re-arm's 11381).

#### Per-object sound table (A-02)

**Confirmed (code):**

- **Table:** in the subject's movement block (object +8): count byte +0xA4, pointer +0xA8, five 12-byte entries {voice handle, state word (0 idle, 1 started, 2 no sample), last-processed clock}. It is created, all states 0, by the first non-removal item that reaches it. Entry *k* is model slot *k* (MODL +0x18 + 4*k*, through the visual at block +0 → +4); for an explosion, entry 0 is its EXPL record's sound (block +0xF4 → +0). A null sample sets state 2, which is never retried for that block.
- **Whose table:** shots use the shooter's (slot 1 gun, 2 missile), hits the victim's (slot 3 or 4), updates the object's own (slot 0 or the EXPL sound).

| Item | Entry | Class | Preempt |
|---|---|---|---|
| Code 0, gun projectile | Shooter's slot 1 | 1 | Yes |
| Code 0, missile | Shooter's slot 2 | 1 | Yes |
| Code 2 sub-code 4 | Victim's slot 3 or 4 | 2 | Yes |
| Code 1, explosion | EXPL sound | 2 | On the first play (table creation) only; every later replay no |
| Code 1, other kinds | Model slot 0 | 5 | No |

- **Parameters after a play or a processed item:** when the sound's source (shooter, victim or object) is not the player, `0x55984` sets volume, rate and pan ([non-player sources](#non-player-sources-a-04)); when it is the player and the class is 5, `0x55d20` retunes the engine ([player sources](#player-sources-and-the-engine-a-05)); otherwise the start values stay. Update items address only entry 0, so shots and hits are parameterised once, at their start.
- **Throttle:** an update item (code 1) returns without any action while now − entry clock < 12 (unsigned): 12 units = **0.1875 s** of mission time, quantised by frames. Shots and hits are never throttled but refresh the clock. The clock is set before each (re)play attempt and after a successful play, but not at table creation, so a failed first start is retried on the next frame and a failed later restart at most every 12 units.
- **State machine:**
  - state 0: play (any code but 3);
  - state 1 with the voice still playing (`0x53b54`): an explosion clears its preempt flag; a shot or a hit plays again into a new voice and overwrites the handle (the older voice continues untracked until it ends or is cut); an update only refreshes the parameters;
  - state 1 with the voice not playing (natural end, preemption, stop-all and handle reuse are not distinguished): state := 0, then an explosion returns without playing, a hit **returns without sound**, and a shot or a slot-0 update plays at once from the start;
  - state 2: nothing. A failed play leaves the entry unchanged.
- **Natural end reaches the not-playing branch (Confirmed, code, P3-14/05):** the final pass of a sound sets status 2 ([Miles calls](#miles-calls-and-sample-status)); this supersedes P3-14/01's "Likely" premise.
- **Consequences:**
  1. **Slot 0 (continuous):** starts at the first update item once the object is active in state 4 or ≥ 7, never preempts (class 5), and after its voice is lost for any reason restarts from the beginning at the next unthrottled update when class 5 has room. A destroyed source in state 4 keeps it until its removal item.
  2. **Explosion:** its first update plays the EXPL sound with preemption. If its voice is later found not playing while the explosion lives, the next unthrottled update marks it idle and the following one replays it from the start **without** preemption, only when class 2 has room; this follows preemption, stop-all and natural end alike. Explosions live about 1.5 s ([X4](./executable.md#x4-explosion-object-lifecycle--confirmed-code)) and the four EXPL sounds last 1.05–2.20 s, so a short blast can restart for a fraction of a second and a long one is cut by the removal.
  3. **Hits:** a hit plays when the slot is idle, and plays again into a new voice while the previous hit on that slot still plays; a hit that finds the previous one ended is silent and only resets the slot. With hits spaced longer than the sample, every other hit on a slot is silent.
  4. **Shots:** always (re)played; overlapping shots of one shooter keep older voices untracked.
  5. **Removal `0x55894`:** skipped for kinds `0x3300000` (gun projectiles, missiles, fragments, map marker) and objects without block or table; for each entry in state 1 with a handle it stops the voice if still playing, then sets state 0. Removing an object therefore stops its engine and the last tracked shot and hit of each slot, and an explosion's removal stops its blast.
  6. **Docked:** all object items are skipped, so no object sound starts, updates or stops through this path while the player is docked.
- **After all voices are lost** (stop-all `0x53978`; Confirmed, code, independent of the natural-end path): tables keep state 1 with dead handles. Slot 0 of live objects restarts by itself from the start; a live explosion restarts from the start without preemption; one-shots never replay; the first hit per slot afterwards is silent. The HUD loops do **not** restart by themselves ([lock tone](#lock-tone-a-06), [instrument 9](#instrument-9-warning-a-07)).

#### Voice pool and classes (A-03)

**Confirmed (code):**

- **Voice count:** `0x53414(install, mode)` sets the Miles preferences and allocates 8 sample handles and 3 sequence handles in mode 0, 1 and 1 otherwise. The audio start-up `0x553d0` (from `0x3ec78`) installs the digital driver in mode 0 and registers the classes; the clip player `0x39f34` switches to mode 1 at entry (`0x5387c(1)`) and back to mode 0 with the classes re-registered (`0x5387c(0)`, `0x55428`) on both exits. Flight and menus therefore have **8 voices**, chosen by game mode, not by the sound card; the card only decides whether the driver installs (otherwise every play fails and `0x554a0` does nothing). The baseline SB16 installs ([listening](#listening-comparison-p2-0810)). The project's own 8-voice limit coincides but is not evidence.
- **Classes:** `0x540ac(id, cap)` registers (1, 2), (2, 1), (3, 1), (4, 2), (5, 2) in `0x1b07b0` (12-byte records {id, cap, active count}); the caps sum to the 8 voices.
- **Voice records:** 8 × 0x24 bytes at `0x1b0810`: Miles handle +0, block +4/+8, rate +0xC, pan +0x11 (start 64), loop count +0x12, volume +0x13 (start 127), active +0x14, paused +0x18, class slot +0x1C, handle +0x20 = serial << 16 | voice index.
- **Allocation `0x545c0(class, …, preempt)`:**
  1. reap at most one voice: the lowest-index active voice with status 2 is ended, unlocked, deactivated and uncounted;
  2. an unknown class fails (−10);
  3. below the cap: count + 1, and the lowest-index inactive voice is used;
  4. at the cap: without preemption give up (−9, nothing changes); with preemption end the **lowest-index voice whose class slot matches**, without testing whether it is active, and reuse it (count unchanged).
- Preemption is by voice index, not by age. **Edge (Confirmed, code; frequency Unconfirmed):** the class slot +0x1C is never cleared and is 0 (class 1) in never-used voices, so step 4 can take an inactive voice with a stale slot; then nothing is cut, the class runs one voice over its cap and its count later under-runs. Stop-all and re-initialisation reset the counts. A voice that ended naturally stays counted until step 1 or `0x53b54` reaps it.
- **Start `0x53bf0`:** (re)initialises the Miles sample, sets rate (SND header), volume 127, pan 64, loop count, type and address, starts it, marks it active and unpaused and stores the handle when asked; it returns −7 without a driver and −4 when allocation fails.

| Caller | Sound | Class (cap) | Preempt | Handle kept |
|---|---|---|---|---|
| `0x55534` shots | Model slot 1 or 2 | 1 (2) | Yes | Shooter's table |
| `0x55534` hits | Slot 3 or 4 | 2 (1) | Yes | Victim's table |
| `0x55534` explosions | EXPL sound | 2 (1) | First play only | Explosion's table |
| `0x55534` continuous | Model slot 0 | 5 (2) | No | Own table |
| `0x55924` play by ID | The nine IDs | 4 (2) | Yes | No |
| `0x46ecc` lock tone | 10455 loop, 10457 pulse | 4 (2) | Yes | `0x175994`, `0x175990` |
| `0x4edf4` instrument 9 | 10409 | 4 (2) | **No** | `0x175f20`, `0x175f1c` |
| `0x4e5a0` timed list `0x1a9f58` | Per entry; Likely the communications speech | 3 (1) | Yes | `0x1a9f54` |
| Menu pages `0x33e8c` | 10405 | Likely 4 | Likely no | — |

- **Interactions (Confirmed, code):** play-by-ID and lock-tone starts can preempt a running 10409 or 10455 loop (all class 4), which then stays silent; 10409 fails silently when class 4 is full and retries on later updates. Hits and explosions share one voice (class 2, cap 1). At most two engines sound at once, and they never displace anything.

##### 10177 at kills: mechanism only

For a non-player craft killed by a projectile in frame N (Confirmed, code, with [X1–X4](./executable.md#destruction-explosions-and-fragments-p3-0706)): the collision stage posts the hit item (shield ≤ 0, so slot 4, 10177 for the slice enemies) and creates the explosion object, and render N plays 10177 in class 2. In frame N + 1 the explosion becomes active and its first update item starts the EXPL sound in class 2 (cap 1) **with preemption**. `0x545c0` first reaps one finished voice; if 10177 is **still active**, the class is full and the request cuts the lowest-index class-2 voice, that is 10177; if it has already finished and been reaped, nothing is cut. Extra explosions starting later cut the main blast the same way, and a cut blast restarts only when class 2 is free. The player's 10175 is not cut this way (its explosion is delayed 0xC0 units). How long 10177 sounds first depends on the frame length and its 0.12–0.29 s sample (statically not determinable; measured at runtime by P3-14/24). **Runtime (P3-14/24):** see [runtime references](#runtime-references-p3-1424) for the kills observed: the blast's first play preempted 10177 before its end and was followed at once by the blast. Audibility is the listening question of P3-14/26.

#### Non-player sources (A-04)

**Confirmed (code), `0x55984(voice, source)`:** it runs inside the render after the camera step, so against this pass's camera ([C1](./executable.md#c1-the-3d-camera-and-its-readers--confirmed-code)); for gun projectiles and missiles the source is the shooter. Inputs: camera position C and rows R0–R2 (`0x52e14`, `0x52eec`); the source position P (+0x6C–+0x74), its third row R2ₛ (+0x60–+0x68) and its block's current speed sₛ (block +0x08); the player's current speed sₚ. F(·) is a store to f32; every float-to-integer conversion truncates toward zero (`0x74518`). Units are runtime world units and units per second.

1. **Distance (Manhattan):** d = F(|Δy| + |Δx| + |Δz|) with Δ = C − P (summed at x87 precision, Δy stored to f32 first).
2. **Volume:** g = F(3800 − d). If g ≤ 0, volume := 0 and the routine returns, leaving pan and rate as they were. Otherwise volume = trunc(g × 0.0334213428695565) (≈ 127/3800): 127 up to d ≈ 0.033, then linear in amplitude, 1 at d ≈ 3770.07 and 0 beyond about 3770.08.
3. **Rate condition:** dot = R2ₛ · R2 (camera); the rate is recomputed only when |dot| ≥ 1e−6 (NaN passes), otherwise it keeps its previous value. A further gate for gun projectiles with a non-automatic gun record is always open on reachable paths, because the shooter replaces the projectile (Likely).
4. **Rate (absolute, from relative velocity):** V = R2ₛ·sₛ − R2(camera)·sₚ, u = Δ × F(1/d), radial r = F(V·u) (positive = closing); rate = trunc((r + 800) × 0.00125 × 11025), that is 11025 × (1 + r/800) Hz, clamped by the game to 0–44100. **The SND header rate is ignored:** r = 0 gives 11025 Hz for every sample (a 22050 Hz sample sounds about an octave low), r = +800 gives 22050, r ≥ +2400 gives 44100, and r ≤ −800 gives 0, a near-stall ([mixing](#digital-mixing-in-the-linked-miles-library-a-09)). The listener velocity is always the camera's forward row times the player's current speed, also in views where the camera does not move with the player.
5. **Pan:** the offset is projected onto the plane without the camera's R1 component (`0x40d44`, plane 1), giving q with m = F(|q|₁). If m < 1e−6 the source is not projectable and pan := 64. Otherwise x = (q/m)·R0 ∈ [−1, 1] (approximately; the rows are not renormalised) and pan = trunc((1 + x) × 0.5 × 127), clamped to 0–127. A centred source gives **63**, not 64 (the same output, [mixing](#digital-mixing-in-the-linked-miles-library-a-09)); front and back are not distinguished.
6. **Order and timing:** volume, then rate (when the condition holds), then pan, all absolute. A one-shot gets them once, in the same call right after `AIL_start_sample`; continuous sounds and explosions at each unthrottled update item. Side writes go to block +0xB8/+0xBC, +0xCC–+0xE0 and +0xE8; the radar reads none of them (Likely).
7. **Zero distance (runtime result unresolved):** d = 0 gives volume 127 and, when the rate condition holds, a division by zero. The run-time's start-up x87 control word 0x127F (all exceptions masked) is changed to 0x1272 by `0xa505c` before gameplay, which unmasks divide-by-zero ([x87 precision](./executable.md#x87-precision-rounding-and-trigonometry-p3-0202)), so this traps (Confirmed, code); the reaction to the trap was not traced (Unconfirmed). It needs a non-player source exactly at the camera position (Likely rare; player sources never take this path). A null player reference is not checked on the rate path either; whether it can coincide with a sounding non-player source is Unconfirmed.
8. **Warp view (Likely, from C1):** the Warp view's render writes the camera later in the same render, so sound uses the previous render's Warp pose.

#### Player sources and the engine (A-05)

**Confirmed (code):**

- Sounds whose source is the player (its shots and missiles through the shooter, and hits on it) keep the start values in every view: volume 127, pan 64, the SND header rate.
- **Engine (class 5, `0x55d20`):** reads the player's **commanded speed** c (block +0x6C; not the current speed +0x08, the speed ratio or the possibly lowered maximum +0x78) and its craft record's maximum M (+0xB8, [craft §3.5](./craft.md#35-craft-record-and-missile-body-record-236-bytes)).
  - c ≥ 1.0 (or NaN): volume 127 and rate = trunc(c / M × 16000) + 3000 Hz, both absolute and clamped (0–127, 0–44100). Full throttle on an undamaged craft (c = M) gives 19000 Hz; 44100 needs c/M ≥ 2.5694. The player's engine 10679 is stored at 9000 Hz, so its pitch factor runs from 0.33 to 2.11.
  - c < 1.0: volume 0; the rate is not updated and the loop keeps running silently.
  - Updated at each unthrottled update item (at most once per ≥ 12 units), so it steps after a throttle change and follows the commanded value at once, not the speed ramp. M = 0 would trap like the zero distance above (reaction not traced; not checked against the player's data).

#### Digital mixing in the linked Miles library (A-09)

- **Game wrappers (Confirmed, code):** pan `0x53e5c`, volume `0x53f24` and rate `0x53fec` take a value and a flag (0 relative to the stored value, otherwise absolute), clamp to 0–127, 0–127 and 0–44100, store the value in the voice record and call the Miles setter; every game path uses absolute values. The 44100 Hz limit is the game's clamp, not a Miles or device limit: the library's rate setter `0x8a350` stores the value without a range check.
- **Master volume (Confirmed, code):** `0x53a64` keeps `0x17619c` (initially 127) and calls `AIL_set_digital_master_volume`, which rebuilds every allocated sample. The configuration handler and the settings page set it to trunc(level × 0.01 × 127) from the 0–100 `SOUND_LEVEL`; the baseline's 100 gives **127**.
- **Preferences and output format:** the game's install path requests a 22050 Hz hardware rate and stereo, with 8 sample handles and 3 sequences (11025 Hz, mono, 1 and 1 in the clip path) (Confirmed, code; preference roles from their use in the library). With the SB16.DIG format table (all four formats at 11025, 22050 and 44100 Hz) the negotiated output is **8-bit stereo at 22050 Hz** with a 2048-byte (1024-frame, about 46.4 ms) half-buffer (Confirmed, runtime, P3-14/24: driver +0x14 = 22050, format code +0x18 = 2, the 8-bit stereo code in Miles' numbering, +0x10 = 2048, master +0x68 = 127; [runtime references](#runtime-references-p3-1424)). 16-bit samples are then quantised to 8 bits at the output.
- **Per-voice gain (Confirmed, code, `0x88e60`):** v = trunc(volume × master / 127), clamped to 0–127. Pan table T: T[i] = 2i for i ≤ 62 and 128 for i ≥ 63; the first output channel uses T[127 − pan], the second T[pan]. Pan 0 gives (128, 0), 32 (128, 64), **63 and 64 (128, 128)**, 96 (62, 128) and 127 (0, 128): a linear balance law with both channels full at the centre, not constant power. A 16-bit sample adds (s × trunc(T × v / 127)) >> 7 per channel; an 8-bit one uses v′ = v + 1 (for v ≠ 0) in 256-entry tables, ((s × 256 × v′) >> 7) × T >> 7 with s = byte − 128. At volume 127, master 127 and pan 64 the unscaled fast path gives the same numbers. The volume and pan setters rebuild only when the value changes.
- **Resampling (Confirmed, code, `0x9cb20`):** step = floor(rate × 65536 / hardware rate), with rates below 1 treated as 1. When |step − 65536| ≤ 655 the sample plays 1:1 at the hardware rate (rates from about 21830 to 22270 Hz all play at 22050). Otherwise it is **point-sampled** (zero-order hold, no interpolation) with a 16-bit fraction that restarts at one half at every buffer fill and every loop restart. A game rate of 0 becomes 1 Hz: about one source sample per 1.49 s, not silence. Parameter changes take effect at the next half-buffer the service builds (Likely within one half-buffer plus 5 ms).
- **Loop count (Confirmed, code):** stored at sample +0x30 (`0x8a420`) and tested only when the position reaches the end of the sample: 0 restarts forever, 1 ends (status 2), *n* > 1 decrements and restarts from the first sample. Repeats are **complete source passes**, independent of rate and wall time.
- **Summation (Confirmed, code; output format Confirmed at runtime, P3-14/24):** all active voices accumulate in 32 bits per channel; with more than one voice the sum saturates to 16 bits; the 8-bit output byte is the high byte of the sum plus 128. The first channel is written first in each frame.
- **Pan direction chain:**
  1. **Row 0 → screen x:** in the game's own projections, the explosion screen gate `0x2443c` ([X5](./executable.md#x5-event-0x10-and-the-discriminator-12-fragments--confirmed-code)) and the radar `0x40370`, +R0 maps to increasing screen x (Confirmed, code). That increasing x is screen right, and that the 3D renderer draws +R0 to the right (P3-12), are Likely. A source on the right of the screen therefore gets pan above 64 (Likely, through those two).
  2. **Pan → interleaved channel (Confirmed, code):** pan 0 gives the first interleaved output channel full and the second silent, pan 127 the reverse; the stereo writer stores the first channel's byte at the lower address. A screen-right source favours the second channel.
  3. **Channel → speaker (Confirmed, runtime, baseline DOSBox-X SB16, P3-14/24):** the first channel is the left speaker and the second the right: with the player's engine muted (commanded speed 0) and the wingman's engine read at pan 94–95, the twelve 100 ms windows in which that engine was the only voice sounding recorded left/right amplitude ratios of 0.50–0.61 (table T[33]/T[94] and T[32]/T[95] = 0.52 and 0.50), the right channel louder in every one. The contract's enemy on the right of the screen was replaced by the wingman's engine, the one non-player voice that could be isolated ([runtime references](#runtime-references-p3-1424)). So a source with pan above 64 is louder on the right speaker; that this is screen right stays Likely through step 1.
- **Not established:** the SB16 mixer settings made by SB16.DIG and DOSBox-X's emulation gain and resampling, hence the **absolute device level** (R-08 was not run: it is needed only if loudness parity is required).
- **10179 pitch (resolved, Confirmed at runtime, P3-14/24):** enemy fire 10179 (stored at 17000 Hz) plays at 11025 × (1 + r/800) Hz as the formula says: eight enemy shots at the player were started at 12,270–12,435 Hz (r ≈ +90 to +102), 0.72–0.73 of the stored rate, with every integer equal to the recomputation ([runtime references](#runtime-references-p3-1424)). The [P2-08/10 listening](#listening-comparison-p2-0810) "same pitch and speed" therefore did not detect this difference; the formula stands.

#### Lock tone (A-06)

**Confirmed (code):** `0x46ecc(target, value)` has two callers: the flight overlay `0x45de0` (at `0x45e3f`), which passes the player's target (player +0x8C) and the player's lock progress `0x2e080`, and the view switch `0x3f158` (at `0x3f3ca`), which passes a null target on entering the Warp view (mode 1).

- **Where:** the render calls `0x45de0` only in view modes 0xC–0x12 (including the external and destruction view 0x11 and the cursor views where no overlay is drawn), not in 1, 6, 8 or 0x13, and only while `0x1b0754` and the player exist. The tone call precedes the overlay switches and the subsystem-9 read, so **subsystem-9 damage never silences the tone**.
- **Value:** −1 for a null or invalid target or a target with state < 7 (its activity is not tested; the player's own state is not tested). Otherwise the [W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code) value: −1 without a missile mount state, while losing or at lock level 0–1; 0 at level 4; 50–100 at level 2 and 0–50 at level 3, from the remaining stage time as a dimensionless fraction of the missile's c34.
- **State machine** (previous value `0x175b14`, initially −1; pulse due `0x175b18`, u32, initially 0; no other writer, and nothing resets them between missions):
  1. value = previous: **no action at all**;
  2. changed to −1: stop the pulse and the loop if their handles are non-zero, clear both;
  3. changed to 0: stop the pulse; start 10455 into `0x175994` (class 4, preempting), without stopping an existing loop handle;
  4. changed to any other value (1–100): if due < now (u32, strict), stop the loop, start 10457 into `0x175990` (class 4, preempting; the previous pulse handle is overwritten, not stopped) and set due := now + (value >> 1) units (arithmetic shift; set even when the start fails); otherwise only record the value.
- **Consequences:** at most one pulse per frame, only on a value change at or after the due time. While the value holds (two frames reading the same sample, level 2 after its deadline, integer plateaus of the fraction, 50 → 50 across the level change) nothing plays, however long. The interval is 25–50 units at level 2 and 0–25 at level 3. The loop starts once on the change to 0 and is not replayed; level 3 can reach 0 slightly before level 4.
- **Parameters:** start values only: volume 127, pan 64, stored rate (10455: 22,000 Hz, `flags` 0; 10457: 11,025 Hz, `flags` 1). No random draws.
- **Exits and transitions:** entering the Warp view stops both voices (Confirmed). In views 1, 6, 8 and 0x13 `0x45de0` is not called, so the machine freezes with its stored value and due time; what happens to its voices depends on the transition, not on that. Opening the map from flight stops nothing, so a running loop keeps sounding and the machine resumes from its stored value on return (Confirmed, runtime, P3-14/24: 3 s of map at level 4 without a call of `0x46ecc`, the loop voice playing throughout and after Esc; [runtime references](#runtime-references-p3-1424)). Docking, and so the base view and the map opened from it, ends every voice through the landing clip's driver re-initialisation, also with clips disabled, and teardown is reached only after a global stop (Confirmed, code, [modes](#modes-and-lifecycle-a-08)); both leave at most stale handles. In the destruction view (0x11, sub-mode 8) it keeps running while the lock level and deadline freeze, so pulses continue and accelerate into the loop until the target becomes invalid or the loss handling's stop-all (Likely). Stop-all leaves the handles stale: a stale handle is harmless at the next change to −1, but with an unchanged value it means silence. A failed loop start is not retried until the value changes. A second, untracked loop (0 → a positive value without a pulse → 0) is possible but Likely rare. The flight-module release `0x45638` stops both voices.

#### Instrument-9 warning (A-07)

**Confirmed (code):**

- **Registration:** the HUD set-up registers type 9 with `0x4edf4` as a **per-frame callback** in the global list `0x1a23a0`, which `0x49b2c` calls before drawing, whatever cockpit slot is active. It therefore runs in view modes 1, 6, 8 and 0xC–0x12 (including the map, the base interior, Warp and views without a type-9 strip), not in 0x13 or while no frame runs. The HUD teardown's release `0x4eab4` stops both voices but clears neither handles, flags nor due.
- **Conditions** (both walk kinds in ascending bit order and stop at the first match; "player" is ps +0x8C):
  - `0x4f000` → missile flag `0x175f14`: kind `0x100000` (kind bit 20), activity 1, state ≥ 7, +0x8C = player; no owner, side, guidance, lock or dead-flag test;
  - `0x4ef9c` → craft flag `0x175f10`: kinds `0x780` (bits 7–10), activity 1, state ≥ 7, +0x8C = player, and **weapon lock level** +0x118 (byte +0x24 of block +0xF4, [W1](./executable.md#w1-per-object-weapon-block-and-mount-states--confirmed-code)) of 3 or 4, not the AI mode; no dead-flag test.
- **Sampling:** only when the due `0x175f34` < now (u32, strict; initially 0, never reset). Without a player the flags are kept. Otherwise, with s = the player's subsystem 12 (radar): the craft condition is evaluated, and when it finds a craft `0x38c30` may queue the wingman's tail warning, a rule side effect owned by P3-08 and P3-10 that happens before and regardless of the radar gate; s = 0 keeps both results, s = 1 clears the craft flag and evaluates the missile flag, s ≥ 2 clears both. The next due is now + 0x40 when a flag is set, otherwise + 0x80; the next check runs on the first later frame whose sample is strictly greater, so the interval has no fixed length in seconds ([B-006](../behavior/B-006-simulation-timing.md)), and the flags hold in between.
- **Voices, on every call:**
  - missile flag set and `0x175f20` empty: stop and clear `0x175f1c`, start 10409 into `0x175f20` (class 4, **no preemption**), then set rate 22,000 Hz and volume 127 (absolute), about an octave above its stored 11,025 Hz;
  - craft flag set and **both** handles empty: start 10409 into `0x175f1c` (class 4, no preemption) with volume 50 at the stored rate;
  - a flag clear with its handle set: stop and clear it.
  - The missile voice therefore has priority and replaces the craft voice; when the missile flag clears, the craft voice may start in the same call. A failed start leaves the handle empty and is retried every frame. Parameters are set only at start. A handle whose voice was ended from outside (stop-all, preemption) stays set, so the original does not restart it until its flag clears. No random draws; the blinking of the drawn labels is a separate clock (P3-13).
- **Role and reachability:** a threat warning (Likely, from the conditions; never compared by listening). In the selected mission both conditions are **unreachable** (Likely, code and data, supported at runtime by P3-14/24): the slice enemies (kinds 0x80, 0x100) carry only a gun list, launch no missiles and keep lock level 0, and the wingman, the base and the player are outside the masks. Only other missions or debugger edits reach them.
  - **Runtime check (P3-14/24, the conflict raised by P3-13/07):** in the complete runs of the selected mission (active combat with three kills, a lock held on a live enemy for 3 min, the map, Warps, docking, a no-wingman engagement), both flags read 0 at all 199 reading pauses of 8 runs that read them, and both shown marks (`0x175f2c`, `0x175f30`) read 0 at all 154 of the 4 runs that read them, each of those 4 up to its last pause; breakpoints on the two match exits (`0x4eff2` for the craft walk, `0x4f03a` for the missile walk) were armed for 3 min of mission time while the player held a lock on a live enemy and never hit. A shown mark stays set from a label's first draw until an F2 redraw, so no warning label was drawn in those 4 runs. The inference from captures in [hud §4.8](./hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12) that both warnings occurred in the selected mission is therefore not reproduced; what blackened those strip ranges in the P2-12 capture sessions is not established (Unconfirmed; the marks also survive later missions of the same program run, so a draw before the captured mission would explain it). [Runtime references](#runtime-references-p3-1424).

#### Modes and lifecycle (A-08)

**Confirmed (code) unless marked.** The dispatcher has no view, pause or flow gate besides the docked skip; sound is held by not running frames, or ended by global stops (stop-all `0x53978` or the clip entry's full shutdown `0x53734`), which end voices but are not gates.

| Mode or transition | Sounding voices | New requests |
|---|---|---|
| Pause `p` (flight, map, Warp and base contexts) | **Frozen:** `0x538a0(1)` stops every in-use voice and sequence (`AIL_stop_sample`, status 8) and `0x538a0(0)` resumes them with their position; active flags and class counts are untouched | None: no frame runs. The paused interval is removed from the clock, so throttles and due times see no gap; after the pause the frame continues under the survival rules |
| Page run `0x32fec` (Esc page, joystick page, result and briefing pages) | Frozen as above; the page's restart, campaign-end, exit and retry actions stop all | None from the game; the page plays 10405 |
| Docking (`0x38ff4` sub-command 0) | **Stop all:** the landing clip's entry (`0x5387c(1)` → `0x53734`) ends and releases every voice and sequence, also with clips disabled; 8 voices and the classes are restored after it | From then on object items are skipped while the player's activity is 3; play-by-ID is unaffected |
| Base view 6, and the map opened from it | Play-by-ID sounds (base keys, map clicks, automatic targeting in the map) and instrument 9 | Object items still skipped |
| Departure (sub-command 4) | Stop all (launch clip), then activity 1 | All again; slot-0 loops restart from the same frame's update items |
| Map from flight (view 8) | Continue and update; nothing stops | Allowed |
| Warp start (view 1) | Continue; the lock tone's voices are stopped by the view switch | Allowed |
| Warp end | Continue; 10181 only with an enemy near | Allowed |
| Destruction view (0x11, sub-mode 8) | Continue: nothing stops, and the player stays active (activity 1; state 7 at first and 4 by the loss handling in the P3-14/24 run) | Allowed for the world. The player's own engine continues: its slot 0 stays 10679, its update items keep coming and its voice keeps volume 127 at the pitch of the commanded speed until the loss handling's stop-all (Confirmed, runtime, P3-14/24; [runtime references](#runtime-references-p3-1424)). A player destroyed while docked stays at activity 3, so object sounds stay muted, also after the rescue (Likely) |
| Loss handling `0x32e14` (state 3, pod or beacon expiry) | **Stop all** (`0x53978`, music `0x55fe8`) before any branch | Rescue: clips, then one 11381 per full-repair step, five in the slice (3 + 2 list entries), in one frame, all class 4 (cap 2): each request beyond the cap cuts the lowest-index class-4 voice, so how many are heard is a runtime question; survivors by rule (d) |
| Mission end (state 5 falls due) | Continue during the success delays; **stop all** at the due, before the result clips and pages | Allowed until then |
| Restart, new campaign, retry, exit, load, debug jump; teardown | Stop all on every path into state 0 (direct calls; Likely complete); teardown posts removal items for active objects | None: retired objects get no update items |
| Sound system not installed | — | All items dropped |

- **Listener:** the 3D camera as set by this pass's camera step: the craft pose in F1, Warp (1), base (6), map (8) and teardown (0x13) views, where no camera function runs for 1, 6, 8 and 0x13; the destruction camera in 0x11/8 ([C1](./executable.md#c1-the-3d-camera-and-its-readers--confirmed-code)).
- **Pause wrappers (P3-14/05):** `0x70a96` and `0x70b03` are `AIL_stop_sample` and `AIL_resume_sample` by their trace strings (P3-14/01), and the library keeps the position across them ([Miles calls](#miles-calls-and-sample-status)); this supersedes the "Likely" identities in [key contexts](./executable.md#key-reading-and-key-contexts-p3-0501-p3-0502). Audible continuation was not observed at runtime.

#### Play-by-ID boundaries and reachability (A-10)

Each plays in the render of the frame whose message loop or post-loop step posted it (Confirmed, code, unless marked).

| SND | Boundary cases |
|---|---|
| 11087 | Only when the target changes ([T4](./executable.md#t4-no-change-conditions-confirmed-code): no candidate or the same target posts nothing). Automatic targeting runs in every view except 0, 1, 6 and 0x11/8, so also in the map opened from the base while docked |
| 11381 | Every weapon-key press, also when the selection does not change; the rescue's full repair posts one per step and they play; the base re-arm's are posted after the loop and **never play**; never for other objects |
| 10485 | The page keys `e`/`d`, a successful energy-level change and the seven communications sites only; not `c` without a menu, direct page writes (incoming page 5, the queue flush, the Warp page) or a failed energy change |
| 10463 | Every left-button read inside the main map, also with an unchanged point and while held (reads are ≥ 8 units apart, its own throttle 4 units); also in the map opened from the base; not in the zoom or info windows; never from the map's own draw call |
| 10401 | Not on a refused Warp |
| 10181 | Only with an enemy near the arrival point (`0x3c040`); never for an abandoned Warp; 8 source passes |
| 10055 | Only for an active source: `b` in flight with the player active (reachable; normal play Likely, P3-08); the wingman's drop, or `b` while the player is not active, creates silently |
| 10167 | Up and Down in the base, also at both ends of the list |
| 10169 | Enter in the base, also when the row needs no service |

- **Reachability in the selected mission:** 10055, 10167, 10169 and the lock tone are reachable (10055 and the lock tone Confirmed at runtime, P3-14/24); instrument 9's two conditions are not (Likely, with a runtime check, [above](#instrument-9-warning-a-07)). The base sounds are not exempted by the project's replacement base screen.

#### Runtime references (P3-14/24)

P3-14/24 ran the original in private copies of the baseline (DOSBox-X baseline configuration, fixed 40000 cycles, SCEN 3019 group 0 slot 1, raw difficulty 19, wingman 1 unless noted) with the [runtime-measurement](../../guides/runtime-measurement.md) tool: recipe inputs inside the emulator only, memory reads at debugger stops, and the tool's [audio capture](../../guides/runtime-measurement.md#录音). The capture's SB track is the device output in emulated time; a recorded sound is identified by normalised cross-correlation (NCC) with the decoded SND entry at the rate the voice record shows. Voices are named by the SND entry whose byte length the voice record holds (unique among the 37 entries except the identical 10401/10647).

| Item | Result | Confidence |
|---|---|---|
| Output chain (R-06) | Driver hardware rate 22050, format code 2, half-buffer 2048 bytes, driver master 127, game master `0x17619c` 127 | Confirmed (runtime) |
| Channel → speaker (R-07) | See [mixing](#digital-mixing-in-the-linked-miles-library-a-09), pan direction chain step 3 | Confirmed (runtime, baseline DOSBox-X) |
| Player engine (R-10) | `\` then Shift+1 … Shift+0 (craft +0xB8 = 160): commanded speed 0, 0, 17.5, 35, … 140, 160; for every c ≥ 1 the voice's rate and volume equal trunc(c / 160 × 16000) + 3000 and 127 (4750 … 19000); for c = 0 volume 0 and the rate kept its previous value | Confirmed (runtime, 11 updates) |
| Non-player parameters (R-09) | 41 parameter calls: the wingman's engine 10679 (20), enemy shots 10179 (8), an enemy engine 11023 (6), explosions 10213 (7: first plays and updates). Volume, rate and pan equal the [A-04](#non-player-sources-a-04) recomputation from the inputs read at the same stop (f32 stores), and the computed distance and radial speed equal the block's side writes (+0xD0, +0xE0) exactly. Enemy fire played at 12,270–12,435 Hz | Confirmed (runtime) |
| Engine competition | With the wingman alive near the player both class-5 voices held the two 10679 engines throughout, so enemy slot-0 sounds got no voice; in a no-wingman run the enemy engine 11023 sounded | Confirmed (runtime, the [class rule](#voice-pool-and-classes-a-03) observed) |
| Lock tone (R-02) | 88 consecutive value changes (100 down to 0, one loss to −1 and a restart): 10 pulses, each on a changed value with clock > due and due := clock + (value >> 1) exactly; the three changes with clock = due gave none; the loss cleared both handles; the change to 0 started 10455 once. Every pulse and the loop are in the recording (NCC ≥ 0.9 for the pulses) | Confirmed (runtime) |
| Map at lock level 4 (R-03a) | 3 s in view 8: `0x46ecc` not called, the 10455 voice kept status 4 and its handle, and kept sounding after Esc (value unchanged, no action) | Confirmed (runtime) |
| Warp start (R-03b) | Map opened with the loop sounding, click, `w` in the map: at the view switch the loop voice still played (value 0, handle set); one second later the previous value was −1, both handles 0 and the loop voice gone | Confirmed (runtime) |
| 10177 at kills (R-16) | Three gun kills of kind-0x80 enemies (two runs): each slot-4 hit started 10177 (class 2, preempting the slot-3 hit 11071 where it still played); the explosion's first play came in the next frame, 20–42 mission units later, found 10177's voice still at status 4 (Miles position 505–1022 of its 3167 bytes) and took its voice with preemption. In the recordings 10177 was heard for about 0.1–0.24 s before the blast replaced it. In one kill an extra explosion 10 units later cut the first blast the same way | Confirmed (runtime, three kills); that 10177 never finishes first is not established |
| Play-by-ID (R-01) | IDs read at `0x55924`'s start call and found in the recording 47–81 ms later (NCC 0.67–0.97): 11087 (`t`), 11381 (`/`, `.`), 10485 (`e`, `d`), 10055 (`b`), 10463 (map click), 10401 (Warp start); in a docking run the communications keys' 10485 (4 of 5 keys found, NCC 0.97) and in the base interior Down, Down, Up (10167, cursor 0 → 1 → 2 → 1) and Enter (10169), NCC 0.81–0.94. 10181 after a Warp that ended near an enemy group: 8 consecutive passes of 278.75 ms at the stored rate (NCC ≈ 0.97 each), the voice's Miles loop count stepping down to 1 before it ended; Warps ending far from enemies played nothing | Confirmed (runtime) |
| Object-path sounds (R-01) | Identified by the sample passed to `0x53bf0` and in the recording: slot-3 hit 11071 on an enemy (rate 10960), 10177, the blast 10213, the lock tone 10455/10457 | Confirmed (runtime) |
| Destruction view (R-13) | Player destroyed by enemy fire (no-wingman run, P3-11/20's route): from the destruction to the loss handling `0x32e14` (about 520 units) the player's update items kept reaching `0x55534` with slot 0 = 10679; the engine voice stayed at status 4, volume 127, rate 10480 = trunc(74.8 / 160 × 16000) + 3000; 10175 played and ended. After the loss handling and rescue the engine voice was gone and two of the rescue's five 11381 requests were sounding (class 4, cap 2) | Confirmed (runtime, one destruction) |
| Instrument 9 (A-07; the P3-13 conflict) | See [instrument 9](#instrument-9-warning-a-07), role and reachability | — |

Optional items not run: R-04, R-05, R-08, R-11, R-12, R-14, R-15, R-17 (beyond the hit above), R-18.

Evidence (ignored `local/research/p3-14/24-references/`): `plan.md`, `run-notes.md`, recipe generators and recipes, run directories with reports, reads and recordings, analysis scripts and their outputs (counts, integers and correlation scores only).

#### Not established

Runtime results only: the zero-distance and zero-maximum traps; the absolute device level; audible pause continuation. The planned runtime references, their scope and the V-06 coverage baseline are kept in [P3-14/05](../../plan/p3/14/subtasks/05-evidence-contract-baseline.md#完成证据), their results in [runtime references](#runtime-references-p3-1424).

Evidence (ignored `local/research/p3-14/`):
- `01-triggers/`: dispatch, per-object table and voice pool; `miles/natural-end.md` for the library's status path;
- `02-mixing/`: positional, engine and mixing laws, with constants read from EXE data;
- `03-hud/`: lock tone and instrument 9;
- `04-modes/`: play-by-ID posting, mode matrix, reachability and copies of the upstream specs;
- each with its read-only Ghidra scripts and native listings; `decomp/` was used only to navigate. The project was opened with `-readOnly -noanalysis`; nothing was saved.

## 2. SONG and MUSC (Unconfirmed)

- `SR.NOB` has 12 `SONG` entries; `SCENARIO.NOB` has 5 `MUSC` entries, referenced by ID from the campaign table and the cut-scene table. The selected mission's slot (group 0, slot 1) names MUSC 3005, which the mission builder loads (Confirmed, data and EXE).
- Music is played through the Miles MIDI drivers (`.MDI`), so `SONG` is Likely XMIDI or a similar event format. Decoding is part of the music spike (master plan §3.4) and is not needed before P4.
