---
type: format
status: draft
phase: P0
updated: 2026-10-06
related: [U-009, U-017, U-022, U-032]
---

# Main executable (`SRANGERS.EXE`)

Confidence labels as defined in the [IMFAT](./imfat.md) doc. No code or disassembly is reproduced here.

## 1. Format and toolchain (Confirmed)

- MZ stub + **LE** (Linear Executable) image for the DOS/4GW extender; 32-bit protected mode.
- Compiled with Watcom C/C++ (Watcom 32-bit run-time present).
- The installed copy is byte-identical to the CD copy (see [manifest](../manifest.md)).
- Loads in Ghidra 12.0.1 with the ghidra-lx-loader extension as 4 LE objects. Ghidra defaults to a Borland calling convention; Watcom passes arguments in EAX, EDX, EBX, ECX, so a custom calling convention is needed before decompiling.

## 2. Linked libraries (Confirmed unless noted)

| Library | Evidence | Relevance |
|---|---|---|
| Watcom C/C++ 32-bit run-time | Run-time banner | Calling convention, struct packing |
| Miles Audio Interface Library (AIL) | Over 100 `AIL_` references; matches the Miles 3.03 drivers on disc | Music and sound playback (U-004) |
| Smacker player (statically linked) | Code checks the `SMK2` signature | Cut-scene playback |
| In-house or unbranded 3D renderer (Likely) | Assertion text mentions a fixed-point-to-integer macro, viewports, tile maps, and versioned renderer components; no third-party brand strings found | The renderer uses **fixed point** internally, while mesh vertices are stored as floats (U-009) |

## 3. Content embedded in the EXE (Confirmed)

The EXE contains no mission text (see [scenario](./scenario.md) §1). Its long strings are installer and support messages, error/assert text, library text, and one generic in-game system message.

## 4. Code landmarks

Addresses are Ghidra addresses with the ghidra-lx-loader defaults (objects mapped at 0x10000, 0x20000, 0x140000, 0x170000) and the Watcom calling convention applied (see [baseline environment](../../guides/baseline-environment.md#静态分析)). Names are ours. No decompiled code is reproduced here.

| Address | Role | Status | Evidence |
|---|---|---|---|
| 0x6affc | Load an IMFAT entry by ID; returns the relocated block | Likely | Called with constant IDs of `OPTIONS.NOB`, `COMM.NOB`, and `SR.NOB` entries; results used as typed structs |
| 0x65bcb | Opens the archives and registers per-type callbacks | Likely | References the archive file name strings; walks a table at 0x1766b4 |
| 0x1766b4 | Per-type callback table: {type tag pointer, three callbacks}, 16 bytes per row | Confirmed (contents) | Four rows: EXPL, TEX, MESH, MODL. No row for SCEN, so missions use no type-specific load callback |
| 0x39f34 | Cut-scene sequence player | Likely | Plays videos in sequence, loads the matching music entry from a 12-byte-per-row table, and switches the display between 320 and 640 wide depending on the Cinematics HI/LO setting |
| 0x2cbb4 | Builds the communications menu for the current target | Likely | Chooses one of three `COMM.NOB` menu tables from the target's type value and the flag bits `0x68000` (see [scenario](./scenario.md) §3) |
| 0x282bf | Handles debug or cheat commands | Likely | References the strings for mission win/fail and mission selection; mission selection calls 0x33170 |
| 0x33170 | Jump to mission N: stores the mission number in a global and sets the game state | Likely | Called from the debug command handler with N − 1 |
| 0x3266c | Main mission flow: briefing, building the mission, in-mission loop, results | Likely | Reads the mission number global; calls 0x66c00 and 0x335f0 |
| 0x38428 | Maps a 0–100 value to campaign group 0, 1, or 2 at thresholds 34 and 67 | Confirmed (logic), Likely (difficulty slider) | Result is passed to 0x66c00 as the group |
| 0x66c00 | Mission builder: picks a `SCCT` slot by group and mission number, loads its `SCEN` and `MUSC` by ID, rescales, and spawns objects | Likely | See [scenario](./scenario.md) §4 |
| 0x68d2c | Rescales the spatial fields of section-1 records and sections 3–4 of the current `SCEN` by (runtime scale ÷ header scale), then swaps y/z of element 0 of each section-6 entry | Confirmed (logic, native loop) | Identifies the spatial fields in [scenario](./scenario.md) §2–3; the builder passes a constant runtime scale |
| 0x6721c | Schedules mission objects: section-1 records with a non-zero kind and zero +0x3C, section-5 entries by their template, and the selected wingman | Confirmed (scheduling conditions) | Inserts {time, index, source} into a time-ordered queue via 0x67584 |
| 0x67018 | Processes due spawn-queue entries: probability, live-limit and repeat checks, then issues the per-entry number of spawn requests | Likely (field roles) | See [scenario](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) +0x0C–+0x20 |
| 0x68398 | Computes an object's spawn position from its record (see [placement](#mission-placement-scheduling-and-world-grid)) | Confirmed (logic) | Called by spawn dispatch for records and section-5 templates |
| 0x6744c | Fills default values into a 132-byte object record | Confirmed (logic) | Field defaults listed in [scenario](./scenario.md) §3 |
| 0x65ca4 | Maps a single-bit object kind to the corresponding M2ID model slot | Confirmed (logic) | Computes the bit position and indexes the M2ID table loaded from entry 10649 |
| 0x67678 | Dispatches queued spawns, including actual section-5 member records | Confirmed (access logic) | Follows the section-5 template, formation and member-pointer array; see [scenario](./scenario.md#section-5-member-records-confirmed-access) |
| 0x68018 | Returns a mission object's AI target-kind filter | Confirmed (logic) | Uses the active +0x58 descriptor or falls back to the +0x5C mask; not a base-capability field |
| 0x520d4 | Allocates a runtime object: stores its kind at +4 and links it into the per-kind list for that kind's bit | Confirmed (logic) | Only writer referencing the list table at `0x1b06e4`; see [player target modes](#player-target-modes-and-enemy-classification) |
| 0x5261c | Iterates runtime objects whose kind bit is in a mask | Confirmed (logic) | Walks the per-kind lists by the mask's set bits |
| 0x2799c | Selects the player's first target in enemy (`0x93780`) or friendly (`0x206c87e`) mode; `0x27884`/`0x27910` cycle within the mode | Confirmed (logic and `t` key binding) | Called from the flight key handler `0x264a0` |
| 0x33940 | Returns the selected wingman value | Confirmed (getter/access) | Zero suppresses wingman scheduling; positive values select from SCCT through `0x6721c` |
| 0x3b8dc | Records post-mission statistics (17 rows of 0x48 bytes) and decides promotion | Likely | Compares a rank field and the average of recent scores with a threshold table |

The mission module occupies roughly 0x67000–0x6a000; functions there read the current `SCEN` through one global pointer. The object kind at +0 selects the M2ID slot through its single set bit and also fixes the player-relative enemy/friendly class ([player target modes](#player-target-modes-and-enemy-classification)). Exact base-interaction conditions, result conditions and the remaining object-field semantics are still open under U-022.

Local follow-up analysis found that previously generated C could retain `__fastcall` prototypes despite the installed compiler spec having `__watcall` as its default. Selected engine-function conventions were therefore overridden in memory during `-readOnly` analysis; the project was not overwritten or reimported. Parameter-sensitive claims use native call-site register metadata as a cross-check rather than trusting incomplete inferred signatures. Code/output remains in `local/research/p2-01/`.

### Mission placement, scheduling and world grid

**Confirmed (world sector grid):** after rescaling, the builder `0x66c00` passes the low 16 bits of `SCEN` header 0x00 and 0x04 and the (runtime) scale at 0x08 to `0x3a380`, which stores them as the world grid. `0x3a41c` returns the world rectangle ±(header value × scale × 0.5) on x and y. `0x3a61c` maps a world x/y to a signed sector coordinate with 1 ÷ scale (negative values are offset by one sector first), `0x3a680` adds half the grid size to obtain a zero-based sector index, and `0x3a6b0` returns a sector's centre at z = 0. The world is therefore header 0x00 × header 0x04 sectors of one scale unit each, centred on the origin in the x/y plane. Default placement `0x68c98` draws x and y uniformly over the same extent, computed directly from the header. Several callers clamp positions or query objects against the world rectangle.

**Confirmed (placement routines):** `0x68398` selects placement as recorded in [scenario](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely):

| Routine | Input | Result |
|---|---|---|
| `0x685e0` | Section-3 rectangle (+0x44) and spacing (+0x40) | Grid position with a random jitter, z = 0 |
| `0x68708` | Anchor record (+0x48) | Position of the runtime object created from that record plus a random signed offset per axis; `0x68c98` when none exists |
| `0x6883c` | Section-3 rectangle (+0x44) | Uniform x/y inside the rectangle, z = 0 |
| `0x688c4` | Path reference (+0x4C) and selector (+0x50) | Likely a position along or between path points |
| `0x68c98` | Header 0x00/0x04 and scale | Uniform x/y over the world extent, z = 0 |

Placement uses the runtime random generator; the resulting positions are runtime state, not record data. Spawn dispatch `0x67678` adds section-6 layout offsets to the template anchor for section-5 members (see [scenario](./scenario.md#section-5-member-records-confirmed-access)).

**Confirmed (scheduling and AI-target access):** `0x6721c` skips section-1 records whose kind is zero or whose +0x3C member back-reference is set; records with a non-zero +0x30 go through `0x69708` instead of the time queue. Section-5 entries are queued by their template's +0x1C or +0x30. `0x68018` returns the +0x58 target record's kind while that record's spawn counter is positive, and the +0x5C mask otherwise. The event-trigger consumer `0x6977c` passes record +0x54 to `0x695c0`, which updates counters and, for matching ranges, queues the paired section-1 record or section-5 entry after a delay taken from +0x34 of that record or of the entry's template.

Evidence: ignored read-only probe outputs `local/research/p2-09/probe-1.txt`–`probe-5.txt` (references, constants and native loops) and the earlier decompiled exports in `local/research/`.

### Strategic map projection

**Confirmed (map-to-world conversion and Warp marker):** `0x2b9bc` classifies a mouse point against three screen rectangles. Inside the main map rectangle (origin and size at `0x186444`–`0x186450`) it converts the point with `0x4c4c0`, stores it as the cursor's world point and lets `0x2bc30` set the zoom-window bounds around it, clamped to the world rectangle of `0x3a41c`. On a left click it also stores the point as the target: `0x4c310` finds the nearest map icon, and `0x2bd74` replaces the target's z with that icon's stored value (0 when none is hit) while a player-state field is set. It then either creates the runtime kind-25 map/Warp marker at the target through `0x3cb80` or moves the existing marker to it. The vertical component therefore comes from runtime state, not mission data. `0x4c4c0` computes world x and y as the world rectangle's minimum corner plus the point's offset from the map origin times a per-axis world-per-pixel factor (`0x18646c`, `0x186470`), and sets z to 0. `0x4c310` picks the map icon nearest to a point within three pixels. Map icon labels are drawn by unanalysed code near `0x4afc0`–`0x4b360` from per-object screen coordinates relative to the same map origin.

**Likely (orientation and extent):** no writer of the two world-per-pixel factors was found by reference search, so their values are inferred.

- **Orientation:** the map origin is the top-left pixel and corresponds to the world's minimum corner, so positive factors give map right = +x and map up = −y. A local comparison with the first-mission map screenshot ([B-001](../behavior/B-001-strategic-map.md#地图框架与坐标轴高概率p2-09)) agrees: enemy markers lie only in the half predicted for their spawn rectangle.
- **Extent:** that the main map shows the entire world rests on the same screenshot. The drawn grid has as many cells per side as the mission has sectors, consistent with one cell per sector.

**Likely (no Warp-specific static spatial data at destination selection):** the cursor-to-marker path uses the world rectangle, the map rectangle and runtime map-icon data; no Warp destination table, grid or range data was found on it. The Warp execution path (energy, travel, arrival, error) was not traced and remains U-026.

Evidence: ignored probe outputs `local/research/p2-09/probe-2.txt`–`probe-4.txt` (map references and the unanalysed label-drawing region) and decompiled exports in `local/research/all.c`; the screenshot comparison used `local/StarRang/captures/srangers_059.png` and the selected mission's spawn rectangles from `pointer-targets-3019.json`, checking only which half of the map each marker class falls in.

### Bounded slot-1 interaction-kind evidence

**Confirmed (access and predicate logic):** `0x520d4` stores the allocated object's kind at runtime offset +4; `0x67938` supplies the SCEN record's kind to that allocator. The communications builder `0x2cbb4` tests this runtime kind, not SCEN +0x5C. Its special interaction-menu path requires membership in the kind mask `0x68000` (M2ID slots 15, 17 and 18), a successful `0x394c4` check and a successful `0x33390` check. `0x394c4` additionally requires the runtime visibility field, a distance check and valid player state; `0x33390` applies another game-state gate. Kind membership alone does not establish that an interaction is currently available. The interpretation as base interaction is **Likely**, supported by [B-004](../behavior/B-004-base-communications.md); the precise state/distance meanings remain open.

**Confirmed (bounded source coverage):** `node local/research/p2-01/slot1-role-gates.ts` checks all section-1 records, section-5 templates and actual member-array records of the three slot-1 SCEN entries, without excluding non-zero spawn times or conditional scheduling fields. The unique record counts are 9/10/10, of which 3/4/4 occur in member arrays; each scene has one record with a non-zero spawn-time field. In all three scenes, slot 17 is the only referenced model slot admitted by the base-kind predicate. These are record counts, not live-craft counts or proof that every scheduled object arrives.

| M2ID slot | Confirmed structural result across all three slot-1 scenes | Role qualification limit |
|---|---|---|
| 0 | Referenced; outside the base-kind predicate | Player-kind handling remains as recorded in [scenario](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) |
| 7, 8 | Both referenced, including complete member/timing coverage; outside that predicate | **Unconfirmed** enemy classification from this analysis; non-base does not imply enemy |
| 14 | Referenced; outside that predicate | Model comparison is recorded in [mesh](./mesh.md#3-comparison-with-the-original-partial); not a faction proof |
| 17 | Referenced; admitted by that predicate | **Likely** base-interaction role; availability still depends on runtime gates |

**Confirmed (direct-reference count), Unconfirmed (additional model identities):** address-specific references to allocator `0x520d4` identify nine direct call sites in nine functions; eight are outside SCEN instantiation `0x67938`. This proves that a SCEN-only creation trace is not exhaustive, but does not prove that these other paths introduce a new model, or identify any as rescue/weapon/effect creation. Follow their kind/model inputs before claiming an implicit-model closure; a bounded next trace can start at callers `0x38780` and `0x3cb80`. Direct-reference enumeration alone does not exclude indirect calls; a later typed-reference check finds no data or pointer reference to the allocator (see [player target modes](#player-target-modes-and-enemy-classification)).

Evidence remains in ignored `local/research/p2-01/`: `role-runtime.c/.log` (five exact addresses), `role-gates.c/.log` (three exact addresses), `runtime-allocator-references.log` (one exact reference target), and `slot1-role-gates.ts/.json`. Ghidra used `-noanalysis -readOnly` and discarded in-memory changes. The report explicitly retains `complete: false`, `rankingAvailable: false`, `factionClassificationComplete: false` and `implicitModelCoverageComplete: false`; this milestone does not establish full enemy cardinality, implicit resource closure or S-02 ordering.

### Slot-1 hostility qualification boundary

**Confirmed (bounded target-path evidence, not faction):** one read-only, no-analysis export covers exactly `0x68050`, `0x688c4`, `0x68c98`, `0x68018` and `0x5261c`, with 647 native instructions in their complete bodies. The compiler default and in-memory overrides are `__watcall`. At `0x680c7`, the AI filter helper's returned EAX value is retained in ESI and supplied back in EAX to `0x5261c` at `0x68112`; the claim uses native register flow, not inferred C parameters. Two later pairwise kind-test windows start at `0x681e4` and `0x682a9`: they test runtime kind offset +4 against `0x6c87f` and compare another object's kind against `0x6c07f` or `0x93f80`. These are candidate-selection predicates, not evidence of a persistent faction field or an authoritative player-relative hostility decision.

**Confirmed (all slot-1 source records compared):** `slot1-hostility-boundary.ts` checks the previously enumerated section-1 records, section-5 templates and actual members against the unchanged version-2 profiles and local SCEN records. Counts remain 9/10/10, member counts 3/4/4, with one non-zero spawn-time record per scene. In each scene, referenced slots 0/14/17 belong to the `0x6c87f` comparison cohort and slots 7/8 do not; zero-kind templates are not model identities. The report records descriptor presence and raw fallback target membership separately. Neither is treated as the effective target set: template inheritance and active descriptor state remain relevant. No timing or conditional record is discarded.

**Superseded (actual enemy cardinality):** this AI candidate-selection path alone does not establish hostility relative to the player. The player-relative consumer was later found in the player's own target modes; the resulting cardinality and its input invariant are recorded in [player target modes](#player-target-modes-and-enemy-classification). Kind cohorts, non-base status, AI target masks, debris eligibility and [kill statistics](../behavior/B-003-campaign-flow.md#第一关统计样本已确认静态读数) remain insufficient on their own.

Evidence: ignored `local/research/p2-01/hostility-target-path.c`, `hostility-target-native.log`, `hostility-target-analysis.log` and `slot1-hostility-boundary.ts/.json`. That report preserves its own unknown roles/cardinality as null and completion/classification/ranking as false; the missing player-relative binding it names is supplied by the target-mode evidence below, without a wider AI/formula search.

### Bounded presentation-consumer follow-up

**Confirmed (exact caller/consumer binding, not IFF meaning):** a distinct follow-up starts from the already recorded direct reference to `0x5261c` at `0x296ee`, in `0x29670`. Its immediate caller is `0x221fc` at `0x22292`. Complete native exports cover only `0x29670`, `0x694f0` and `0x29bf4`, totalling 380 instructions, with the default and in-memory convention set to `__watcall`. In this path, the iterator is followed by the gate call `0x29722` to `0x29bf4`, the table-getter call `0x2979f` to `0x694f0`, and the calls `0x297ba`/`0x297cc` to `0x2a5fc`. The two-instruction getter returns the pointer stored at global cell `0x176708`; it is not itself a kind-to-faction classifier. Native call references and getter register flow, not inferred C signatures, establish these bindings.

**Likely (presentation role), Unconfirmed (player-relative IFF/attack meaning):** spatial accesses, the gate and table consumption make `0x29670` a concrete presentation-consumer candidate. The bounded `0x29bf4` gate does not contain the earlier kind-cohort masks; it must not be relabelled an enemy test. Neither this attempt nor the prior initialization trace establishes an authoritative foe-marking or attack-permission branch. Actual enemy-model cardinality remains **unknown** for all three slot-1 scenes; no input invariant is proved, so no faction classification is propagated to main records, templates or members. A kind-based decision would suffice if its consumer meaning were proved; recovering a persistent faction field is not a prerequisite.

**Superseded (runtime observation):** the slot-8 runtime observation proposed at this point is no longer needed for enemy cardinality. The [player target modes](#player-target-modes-and-enemy-classification) provide the player-relative classification and its input invariant statically. The presentation role of `0x29670` remains Likely and is not used as that proof.

Evidence: ignored `local/research/p2-01/hostility-consumer.c`, `hostility-consumer-native.log`, `hostility-consumer-analysis.log`, the corresponding `hostility-icon-*` and `hostility-selection-*` exports, and `slot1-iff-consumer-attempt.ts/.json`. New assertions check the three complete exports, five direct call bindings, the exact getter cell, prior record counts and an unchanged source-profile hash. The report retains unknown cardinality as null and classification/completion/ranking as false. This distinct bounded attempt stops at the identified consumer/observation blocker; it does not reopen the independent cache-provenance branch or establish a candidate selection.

### Player target modes and enemy classification

**Confirmed (player-relative classification):** the flight key handler `0x264a0` compares the key against ASCII `t` (`0x74` at `0x265fe`) and branches to `0x2703d`, which calls `0x2799c` with EDX = 0 and on success stores mode 0 at player-controller offset +0x198. The adjacent case calls the same helper with EDX = 1 and stores mode 1; the decompiled compare tree assigns it to `f`. The `r` and `y` cases pass the stored mode to `0x27910` and `0x27884`, which cycle to the next nearer or farther candidate through `0x63954`/`0x63858`. In all three helpers mode 0 selects candidates through kind mask `0x93780` and mode 1 through `0x206c87e`. These keys match the README labels for enemy/friendly target mode and target cycling in the [key map](../input/key-map.md).

| Player target mode | Kind mask | M2ID slots |
|---|---|---|
| Enemy (mode 0) | `0x93780` | 7, 8, 9, 10, 12, 13, 16, 19 |
| Friendly (mode 1) | `0x206c87e` | 1–6, 11, 14, 15, 17, 18, plus runtime kind 25 (the map/Warp marker) |

Every M2ID slot with a model, except the player's own slot 0, belongs to exactly one mode; slots 20 and 21 are empty. Helper `0x27a04` targets an object in front from all twenty model kinds and selects mode 1 exactly when its runtime kind is in `0x6c87f` (the friendly set plus slot 0), otherwise mode 0. Its `0x75` (`u`) key case is Likely from the decompiled compare tree; the helper logic is Confirmed.

**Confirmed (input invariant):** iterator `0x5261c` walks per-kind object lists rooted at `0x1b06e4`, indexed by the set bits of the supplied mask. Allocator `0x520d4` writes the requested kind to runtime +4 and links the new object into the list for that kind's bit. These two functions are the only code references to the list table. SCEN objects receive their record kind through `0x67938`. An object's player target-mode class is therefore fixed by its allocation kind; no separate per-record faction field participates.

Mode 0 is the player's hostile set, by three independent sources: the README key label; the [Practice observation](../behavior/B-002-practice-mode.md) that the observed non-player units there were hostile and no friendly unit was seen (all referenced Practice slots, 7, 8, 9, 10, 12 and 19, are mode 0); and the [campaign observation](../behavior/B-003-campaign-flow.md) of a friendly wingman and dockable bases, whose kinds are mode 1.

**Confirmed (exhaustive enemy-mode allocation sources):** only objects linked into the per-kind lists can be selected in either mode, and only `0x520d4` links them. All nine references to `0x520d4` are direct calls; there is no data or pointer reference through which it could be called indirectly. Eight call sites pass fixed kinds: slot 14, runtime kind 25, bits 22 and 24, and empty slots 20 and 21 ([inventory](#remaining-direct-allocator-input-inventory)). None is in `0x93780`. The ninth, `0x67938`, is reached only from spawn dispatch `0x67678`. The queue it serves has five insertion sites: three in `0x6721c`, and one each in `0x67018` and `0x695c0`. Whichever site queued an entry, `0x67678` resolves it to one of three record kinds: a current-SCEN section-1 record, a current-SCEN section-5 member record, or an SCCT wingman record. Enemy-mode objects can therefore originate only from the current scene's section-1 and section-5 records.

**Confirmed (slot-1 enemy cardinality):** all section-1, section-5 template and member records of the three first-campaign scenes reference slots 0, 7, 8, 14 and 17. Slots 7 and 8 (MODL 11063 and 10373) are enemy-mode; slots 14 and 17 (MODL 11399 and 10611) are friendly-mode; slot 0 is the player. The SCCT wingmen use kind 2 (slot 1, the player model). Each slot-1 scene therefore depends on exactly two enemy model types. Their section-5 attack-group members also carry default AI target kinds 15, 17 and 18, the base kinds, without a descriptor. The [statistics page](../behavior/B-003-campaign-flow.md#第一关统计样本已确认静态读数) has eight enemy-kill rows, matching the eight enemy-mode kinds, and two non-zero rows in the observed run. The row-to-kind mapping is not traced, so this is consistency evidence only.

Across all 51 non-zero campaign slots, slots 1 and 2 of each group have two distinct enemy-mode models. The other 45 have three to six (2: 6 slots, 3: 9, 4: 16, 5: 14, 6: 6).

Evidence: ignored `local/research/p2-01/side-mask-sites.log/.c`, `target-mode-consumers.c`, `kind-list-owners.c`, `target-key-sites.log`, `flight-key-handler.log`, `spawn-queue-and-stats.c`, `SideMaskSites.java`, `ReferenceTypes.java` and `candidate-selection.ts/.json`. A raw byte search for the side masks found 31 immediates of `0x93780` and 23 of `0x6c87f`. Read-only, no-analysis Ghidra mapped them to their functions and callers, and typed references bound the allocator, spawn dispatch and queue insertion sites; in-memory `__watcall` conventions were discarded. The flight handler export reached its 600-instruction cap, so the `t` binding was traced natively and the other key cases through the decompiled compare tree plus native case-block registers. `candidate-selection.ts` asserts the mode partition, the slot-1 cardinality and the counts above.

### Two allocator paths: native inputs and profile comparison

**Confirmed (native input sets):** the complete native bodies of `0x38780` and `0x3cb80` each contain one allocator call. At `0x38795`, EAX has the fixed kind `0x4000`, corresponding to M2ID slot 14 and MODL entry 11399. At `0x3cb8f`, EAX has the fixed runtime kind `0x2000000` (bit 25), outside the 22-slot M2ID table. Neither allocation input varies with a caller argument. Both setup paths pass their same kind in EAX and zero in EDX to `0x2d2d8`, which selects a bounded 236-byte parameter record, not an M2ID model. Neither allocation function directly calls the M2ID lookup or archive loader. Native registers/instructions, not inferred C signatures, establish these input sets.

**Confirmed (local and immediate-caller gates):**

- `0x38780` has no local gate before allocation; allocation failure returns failure. A visible source requires auxiliary state allocation; failure frees the newly created object. Other visibility-dependent initialization does not change the kind/model identity. Caller `0x62aa0` invokes it at `0x62b47` only when the source runtime field +0xCC is zero and no object selected by kind mask `0x6c000` is strictly nearer than its parameter-record +0x0C radius. The other call, `0x2148e` in dispatcher `0x20d10`, supplies the event payload at +8 in EAX. The dispatcher's event-case interpretation is **Likely** from read-only analysis; event production and reachability in each candidate remain **Unconfirmed**.
- `0x3cb80` likewise has no local pre-allocation gate; allocation or auxiliary allocation failure returns failure, with cleanup after the latter. Its only direct caller, `0x2b9bc`, requires input DL bit 0, effective region-flag bit 0, a non-null player controller, and controller phase byte zero. Region rectangles use inclusive lower/exclusive upper bounds; later matches overwrite earlier region flags. A non-zero controller phase updates an existing object of the same runtime kind rather than invoking this allocator. The input to `0x3cb80` is a pointer to three selected spatial values, not a model selector. Interpretation as a map/Warp destination marker is **Likely**, consistent with [B-001](../behavior/B-001-strategic-map.md); per-candidate input/controller reachability is **Unconfirmed**.

**Confirmed (comparison against existing profiles):** `node local/research/p2-01/two-allocator-profile.ts` compares both identity results against all 54 version-2 source profiles without rebuilding their graphs. Slot 14 / MODL 11399 is already represented in all 51 non-zero campaign slots, including all three slot-1 profiles. It is absent only from the three excluded slot-0 profiles; those must not acquire an unconditional extra-model requirement without reachability evidence. Runtime kind 25 has no M2ID identity and must not be counted as an additional MODL merely by taking its bit position. Thus these two paths establish no additional M2ID model requirement for the campaign candidates. This does **not** close the marker's presentation/parameter dependencies or prove that no downstream resource exists.

**Confirmed (direct-reference scope at that milestone):** six other allocator sites remained untraced; their subsequent input inventory is recorded in the [combined table below](#remaining-direct-allocator-input-inventory). Indirect allocator calls were later excluded by typed references (see [player target modes](#player-target-modes-and-enemy-classification)); full resource closure remains outside this result.

Evidence: ignored `local/research/p2-01/BoundedNative.java`, `two-allocator-native.log`, `two-allocator-guards-native.log`, `two-allocator-caller-gates-native.log`, associated read-only analysis logs/C, and `two-allocator-profile.ts/.json`. Complete native bodies were checked for the two allocation functions, two setup helpers and two immediate gate functions; only an address-bounded call window was read in the larger dispatcher. The report retains `complete: false`, `rankingAvailable: false` and `implicitModelCoverageComplete: false`; no executable-wide scalar scan or gameplay formula prerequisite was added.

### Remaining direct allocator input inventory

**Confirmed (native allocator inputs and local gates):** one complete six-address native export covers 1,321 instructions. Each function has exactly one call to `0x520d4`; its possible EAX input is the singleton shown below. No intervening write or branch bypasses the constant assignment before the call. M2ID positions are checked only when inside the 22-slot table, and a zero entry is not a MODL identity.

| Caller / allocation site | Complete allocator kind set | M2ID result | Local gate and caller/reachability limit |
|---|---|---|---|
| `0x23ac8` / `0x23b3c` | `0x400000` | Bit 22: outside table | Valid source wrapper and non-null runtime +8; a kind-1 source also has a pending/expired time gate. Seven direct caller sites exist; per-candidate reachability is **Unconfirmed** |
| `0x23fdc` / `0x23ff0` | `0x400000` | Bit 22: outside table | No local pre-allocation gate. Its only direct caller is `0x23ac8`, whose lower-kind-mask branch and non-zero randomized repeat count control invocation; per-candidate reachability is **Unconfirmed** |
| `0x25b0c` / `0x25b3d` | `0x200000` | Slot 21: zero entry, no MODL | No local pre-allocation gate. Dispatcher call at `0x213ad`; event production/reachability is **Unconfirmed** |
| `0x2b00c` / `0x2b042` | `0x100000` | Slot 20: zero entry, no MODL | No local pre-allocation gate. Dispatcher call at `0x213b9`; event production/reachability is **Unconfirmed** |
| `0x24ec4` / `0x24ed9` | `0x1000000` | Bit 24: outside table | No local pre-allocation gate. Two direct invocations from `0x24d78`; its upstream conditions are not traced here |
| `0x25124` / `0x25160` | `0x1000000` | Bit 24: outside table | Skips allocation when incoming EDX and EBX are both in `{1, 2}`. One direct invocation from `0x24d78`; its upstream conditions are not traced here |

All six bodies test a null allocator return and compare auxiliary setup status with -1. Post-allocation subtype/position choices do not change the fixed allocator input. **Confirmed (secondary-selector storage), Unconfirmed (presentation identity):** the last two constructors retain incoming EDX separately at auxiliary +0xF0; that value is not the fixed allocator kind. Thus absence of a direct M2ID target must not be used to discard possible secondary presentation references. A next bounded trace can follow selector production in `0x24d78` into consumption by `0x3e530` before adding any model requirement.

**Confirmed (bounded comparison):** `node local/research/p2-01/remaining-allocator-profile.ts` compares all six results with all 54 existing source profiles (324 path/profile comparisons), verifies the source-profile hash is unchanged, and establishes zero direct MODL identities from these six allocator inputs. Together with the earlier SCEN/two-path work, all nine **previously inventoried direct allocation sites** now have input evidence; this is not whole-executable or implicit-resource closure. Presentation dependencies, indirect calls, candidate reachability, enemy cardinality and canonical ordering remain **Unconfirmed**.

Evidence stays in ignored `local/research/p2-01/`: the single combined recipe/report `remaining-allocator-profile.ts/.json`, `remaining-allocator-native.log`, `remaining-allocator-paths.c` and associated analysis logs. The first native export hit its 300-instruction per-function cap in the fourth function; the same six-address metadata export then completed with a 600-instruction cap (largest actual body: 313 instructions). Ghidra used `-noanalysis -readOnly`; no original project was saved, executable-wide scan was performed or profile graph rebuilt. The report separates known direct-input inventory coverage from `complete: false`, `rankingAvailable: false`, and false presentation/indirect/implicit-model/enemy coverage flags.

### Secondary presentation selector: bounded production and dispatch

**Confirmed (native local production):** `0x24d78` takes the source runtime kind at +4, except for kind `0x400000`, whose saved source kind comes from auxiliary +0x104. Producer mode 0 emits no instance; modes 1/2 require mask `0x91780` membership and emit discriminator 1/2; mode 3 emits discriminator 3 only with the required non-null part-pointer chain and positive count. Under the known single-bit kind contract, the mask admits slots 7, 8, 9, 10, 12, 16 and 19. The complete local emitted discriminator set is `{1, 2, 3}`; this is not a proof of every runtime selector value or per-candidate reachability. Consumer discriminator 0 exists but is not emitted by this producer.

| Discriminator | Confirmed selector/consumer link | Source-binding limit |
|---|---|---|
| 1 | `0x3e530` supplies dispatcher selector 1; callback `0x3e590` uses two cached handles rooted at `0x1752ac` | `0x3ec20` updates their texture bindings, not geometry creation; geometry/texture provenance remains **Unconfirmed**, see [follow-up](#model-completion-and-cached-handle-follow-up) |
| 2 | Same dispatcher selector; callback reads parts from active model context `0x187010` | The active model's source identity remains **Unconfirmed**, not an automatic binding to the effect's allocator kind |
| 3 | Native lookup at `0x3e55e` maps auxiliary +0xF0 through M2ID, then `0x65d10` dispatches to the registered type handler | MODL completion argument binding is now **Confirmed**; part/source-family evidence is owned by [mesh](./mesh.md#secondary-presentation-model-reuse-bounded), not proof of other active-context bindings |

**Superseded (discriminator 1 and 2 sources):** discriminator 1 draws procedural geometry textured with TEX 10151 and discriminator 2 draws list-1 parts of MODL 10383; see [effect presentation sources](#effect-presentation-sources).

**Confirmed (bounded identity comparison):** the M2ID table has 20 non-zero slot bindings to 18 distinct MODL entries. For every existing candidate's recorded source kinds, mode-3 requests resolve to models already represented by that profile; the local recipe checks all 54 profiles without rebuilding their graphs. It does not prove those requests reachable, close invalid/zero/out-of-range runtime inputs, or prove the cached branches have no resources. Selector 1 is not a demonstrated MODL source ID: `SR.NOB` has no entry 1, and dispatch can use the queued callback fallback.

**Confirmed (lookup shape), Unconfirmed (independent data identity):** `0x249dc` indexes 96-byte parameter records through the table rooted at `0x174b00`, separately from M2ID. Its source/initialization and ownership remain unbound. Under [ASSET_UNITS](../../../src/content/asset-units.ts), numeric selectors, part indexes and transforms alone are owner-internal values, not one Asset per number. A mapped model reference still needs an Asset ID. An independent `data` unit requires independently reused logic-data identity; cached handles or a numeric table alone do not establish that boundary. No extra Asset/edge count is assigned while these links are open.

Evidence: ignored `local/research/p2-01/secondary-selector-profile.ts/.json` and the associated exact-address native/link/C reports. Temporary callback/handler boundaries and conventions were created only in read-only analysis memory and discarded. The report distinguishes complete local discriminator production from incomplete selector domain, presentation, implicit-model and canonical ranking coverage. Exact next linkers are MODL completion `0x66864` and cache-owner references in `0x3ec20`; no procedural-origin claim is made before tracing creation.

### Model completion and cached-handle follow-up

**Confirmed (native callback binding):** completion `0x66864` invokes the consumer with original request ID in EAX, loaded MODL payload in EDX and consumer context in EBX, then frees the temporary wrapper. Wrapper offsets are +0 request ID, +4 callback, +8 context and +12 payload. Model preparation/part ownership consequences are maintained in [mesh](./mesh.md#secondary-presentation-model-reuse-bounded); this resolves the valid MODL completion link, not discriminator 2's separate active context.

**Confirmed (operation), Unconfirmed (source provenance):** `0x3ec20` does not create geometry. It passes the two cached geometry handles at `0x1752ac`/`0x1752b0` to setter `0x82364`, with either a texture handle from context `0x187014` at +0x28 or zero, depending on the runtime flag. The setter resolves geometry/texture handles through `0x7a5e8` and changes their runtime texture associations. This establishes a texture-binding dependency, but no TEX/image source ID. Zero removes the texture association; it does not establish absent geometry or a closed presentation branch.

**Confirmed (initial state only):** the five adjacent cache cells and active-model/texture cells are zero in the loaded program image. Exact references currently expose consumers, not creation/source assignments. Initial zero values do not describe runtime state or prove procedural presentation. Source identities for cached geometry, active model `0x187010` and active texture `0x187014` remain **Unconfirmed**. Registered TEX handler `0x662c8` is an exact source-side lead for a next bounded trace, not an established writer of these cells. An additional exact probe identifies `0x6ac98` as archive opening, not callback execution; it supplies no cache/model binding evidence.

**Superseded (source provenance):** the active model `0x187010` is MODL 10383, the active texture `0x187014` is TEX 10151, and the cached geometry `0x1752ac`/`0x1752b0` is procedural geometry textured with TEX 10151; see [effect presentation sources](#effect-presentation-sources).

Under [ASSET_UNITS](../../../src/content/asset-units.ts), runtime handles are neither Asset IDs nor locators, and per-part colour values stay internal to the model. No independently reused logic-data identity or procedural-only presentation family has been demonstrated here. Additional required Asset/edge counts remain unknown, not zero; candidate reachability, remaining presentation references and S-02 closure stay open.

Evidence: ignored combined recipe/report `local/research/p2-01/presentation-closure-profile.ts/.json` plus exact-address native/link/C outputs. Read-only, memory-only function/convention changes were discarded; no candidate graph or profile was rerun. The report separates `modelCompletionBindingClosed: true` from false whole-presentation/implicit-model/qualification coverage.

### Final bounded static cache-writer attempt

**Confirmed (bounded reference metadata):** exact queries for `0x1752ac`, `0x1752b0`, `0x187010` and `0x187014` expose consumers but no direct write/address-transfer reference. Ghidra describes each as a standalone four-byte undefined record at offset zero; no containing root structure or larger field layout is recovered. To include possible indexed/relative-base references, the query also covers only the nearby byte windows `0x175280`–`0x1752bf` and `0x186ff0`–`0x18701f` (112 addresses total). These windows are a bounded diagnostic scope, not a claim that they are the true root structures.

The query returns 49 references, including six writes to neighbouring cells `0x1752b4`, `0x1752b8`, `0x1752bc` and `0x18701c`. One native address-list pass checks the four resulting candidate functions `0x3f500`, `0x3edf0`, `0x3f474` and `0x3f158` (331 instructions). Their inspected direct stores do not assign the four target cells or establish resource-source provenance. No demonstrated link to registered TEX handler `0x662c8` was found in this scope; it was not pursued as an unrelated loader tangent.

**Unconfirmed (runtime writer and sources):** the missing evidence is the actual runtime assignment/creation path. A computed or indirect store, a base outside these windows, or a caller-mediated write remains possible; this static result proves none of them absent. It therefore cannot classify the cached branches as procedural, empty, model-internal reuse or independently referenced content. Additional Asset/edge counts remain unknown under ASSET_UNITS, not zero.

**Smallest required local runtime probe (not executed):** translate the four static LE locations to the runtime mappings and arm four four-byte write watchpoints before graphics/resource initialization. Capture writer PC, old/new handle or pointer, registers, call stack and current source entry ID/type or creation/lookup context where available. Continue only through initialization and the first discriminator-1/2 presentation instances; stop once each cell has a source-linked assignment, or record exactly which cells were not written. Raw program/content output stays ignored; public evidence records metadata and own-word conclusions only. No further speculative static-address expansion is proposed.

**Superseded (writer found):** fragment effect setup `0x3e430` assigns all four cells, from code that had not been disassembled; see [effect presentation sources](#effect-presentation-sources). The runtime probe above and the runtime watch attempts below are no longer needed to identify these sources; their recorded results stay as they were.

Evidence: ignored `local/research/p2-01/CacheWriteMetadata.java`, the single combined `cache-writer-profile.ts/.json`, targeted reference/native/C logs and read-only analysis results. Exact reference counts, inspected address-list coverage and unknown/null report boundaries are asserted by the recipe. The existing MODL completion closure remains valid; whole presentation, candidate reachability, enemy cardinality and S-02 closure do not follow from it.

### Effect presentation sources

Bounded read-only analysis for P2-06/11 (2026-10-06): `-noanalysis -readOnly`, with functions created only in memory and discarded. Evidence stays in ignored `local/research/p2-06/effects/`; no decompiled code is reproduced here.

**Confirmed (where the effect resources are created):** flight setup `0x3ed0d` calls 3D scene creation `0x3cfbb`. That function loads RENS entry 10751 by ID through `0x6affc` into `0x17529c`, creates the scene, camera and lights, then initialises the missile visuals (`0x444ac`), the projectile visuals (`0x3fa30`), `0x41c00` (not examined) and the fragment effects (`0x3e430`). Teardown `0x3d203` releases them in reverse, including `0x3e4b0`. These functions had not been disassembled in the project and are reached only by relative calls, which is why the earlier reference queries found no writer. Their entries were found by scanning the relative call targets of the code object.

**Confirmed (visual dispatch by kind):** the scene message processor `0x3d4e4` creates an object's visual by its runtime kind: missiles (`0x100000`) and gun projectiles (`0x200000`) through `0x3d9b8`, which calls `0x4457c` and `0x3fb1c` respectively; fragment objects (`0x1000000`) through `0x3e530`; every other kind through its M2ID model (`0x65ca4`, `0x65d10`). It removes them through `0x4462c`, `0x3fb80` and `0x3e96c`.

| Effect | Sources the executable uses | Status |
|---|---|---|
| Gun projectile | `0x3fa30` builds one geometry per RENS record (count at +0x5C, 28-byte records at +0x58) with `0x3f758` or `0x3f8c4`, chosen by the record's first field. Both builders only create and fill geometry: they set no texture and load no entry. `0x3fb1c` attaches the record the firing weapon selects | Confirmed (code): procedural geometry parameterised by RENS, with no MESH, MODL or image. Likely (screenshots): gun fire appears as thin coloured line segments |
| Missile | `0x444ac` builds, for each missile type in a table in the executable's data object (0x7C-byte records at `0x1754a0`, count at `0x1758fc`), body geometry with `0x44848` and `0x44674`, which only create geometry, and one element with `0x44a80`, textured with TEX 10377. `0x44cd8` precomputes 32 rotated texture mappings and loads TEX 10377 by constant ID. `0x4457c` attaches the body and the textured element with one of the 32 rotations chosen at random | Confirmed (code): TEX 10377 plus procedural geometry from executable tables. What the textured element depicts is Unconfirmed, because no capture shows a missile in flight |
| Debris (fragment objects) | `0x3e430` loads TEX 10151 into `0x187014` and MODL 10383 into `0x187010` by constant ID. It then builds three untextured geometries (`0x3e9db`, cells `0x1752a0`–`0x1752a8`) and two geometries that are textured with TEX 10151 when textures are enabled (`0x3eab4`, cells `0x1752ac` and `0x1752b0`), all from constant vertex tables in the executable. Callback `0x3e590` draws a fragment by its discriminator: 0, one of the three untextured geometries; 1, one of the two TEX 10151 geometries; 2, one list-1 part of MODL 10383 with its texture; 3, one or three list-1 parts of the source object's M2ID model | Confirmed (code) |

**Confirmed (destruction fragments), Unconfirmed (other fragment events):** the explosion constructor `0x23ac8` calls producer `0x24d78` in mode 3 when the destroyed object is a craft kind (bits 0–19), so a destroyed craft sheds fragments from its own model's list 1 (discriminator 3). Dispatcher event `0x10` calls the producer with a mode from the event payload, giving discriminators 1 and 2 for kinds in mask `0x91780`. Which code posts that event was not found in this bounded search, so when discriminator 1 and 2 fragments appear is Unconfirmed. Discriminator 0 is not emitted by this producer. The external-view capture `local/StarRang/captures/srangers_044.png` shows small textured fragments next to an explosion animation (Likely fragments).

**Confirmed (structure and constant references):** MODL 10383, the only MODL outside M2ID, has only list 1: 6 parts with flag 3, 6 distinct meshes, 260 vertices and 240 triangles, and no sounds. Every part names TEX 10151. TEX 10151 is a raw 256 × 256 record with a 16-entry palette and uses no ambiguous entry. TEX 10377 is a raw 64 × 64 record with a 16-entry palette whose pixels use an ambiguous entry ([textures §3](./textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)). A scan of the executable for 32-bit constants finds MODL 10383 named three times, all in the fragment effect setup and teardown. MODL 10383 is also passed to the generic model request `0x6a024`, which many callers use, including the mission builder. The one MESH that no MODL names (8 vertices, 4 triangles) is not named by any 32-bit constant in the executable; whether anything uses it is Unconfirmed.

Under [ASSET_UNITS](../../../src/content/asset-units.ts), MODL 10383 is a whole-entry model and TEX 10151 and TEX 10377 are whole-entry images. RENS records and the executable's vertex tables are not image or model sources; whether and how the import represents them is a P2-06 contract question (see U-027).

#### Effect geometry data (P2-06/14 research)

Same bounded read-only method, extended with native instruction exports of the exact ranges and counts-only probes of the RENS entry and the executable's data object (2026-10-06). Values are not recorded here.

**Confirmed (projectile visuals):** RENS entry 10751 (the only RENS entry, 376 bytes) has a 96-byte header followed by 10 records of 28 bytes. Header +0x58 is a relocated pointer to the records, equal to the header length, and +0x5C is their count. The other header fields from +0x18 to +0x54 feed scene and renderer settings; their meaning is Unconfirmed. A record is:

| Offset | Type | Use |
|---|---|---|
| +0x00 | u32 | Builder selector: 0 → `0x3f758`, otherwise `0x3f8c4` (9 records 0, 1 non-zero) |
| +0x04 | f32 | Width |
| +0x08 | f32 | Length; the weapon code also uses it (`0x2cf38`) |
| +0x0C | u32 | Runtime geometry handle; 0 in every record on disc |
| +0x10 | f32 × 3 | Colour, red, green, blue |

Each builder copies a 4-vertex template and a face list from the code object (`0x3f670`/`0x3f6a0` and `0x3f6e4`/`0x3f714`), scales the marked template components by the width and by the length times a constant in the data object (`0x1718f4` or `0x1718fc`), and sets the record's colour. A weapon's parameter object starts with the index of its RENS record (`0x2d3fc`); `0x3fb1c` attaches that record's geometry. The parameter objects themselves are loaded by entry ID through the table at `0x174b68`, outside this research.

**Confirmed (missile visuals):** the data object holds a table of 9 missile type records of 0x7C bytes at `0x1754a0`, with the count at `0x1758fc`. The only direct references to the count and the table are readers in `0x4457c`; initialisation `0x444ac` writes only the runtime handle slots. A record is:

| Offset | Type | Use |
|---|---|---|
| +0x00 | u32 | Number of parts: the body and one or two fins |
| +0x04 | u32 × 6 | Runtime geometry handles; 0 on disc |
| +0x1C | 20 bytes | Body: f32 × 3 (two radii and a length), i32 segment count, u32 packed RGB colour. `0x44848` generates a ring of 2 × segments vertices and quadrilateral faces |
| +0x30 | 20 bytes per fin | Fin: f32 × 4 and u32 packed RGB colour. `0x44674` builds 9 vertices from these values with the face list template at `0x44270` |
| +0x6C | f32 × 3 | Textured element: `0x44a80` generates a ring of 6 vertices, textured with TEX 10377 |
| +0x78 | f32 | Zero selects the element's face list template `0x44334`, otherwise `0x44374`; non-zero also adds the element `0x44be8` (template `0x443f0`); set in 3 records |

Across all 9 records, segment counts are small integers, colours fit 24 bits and the floats are finite. `0x44cd8` precomputes 32 rotated texture mappings for the element, and `0x4457c` attaches one at random. The weapon parameter's first word selects the type, clamped to the last one.

**Confirmed (debris shapes):** `0x3e9db` builds an untextured 6-vertex shape from code-object templates (vertices `0x3e2a0`, a per-vertex list of 18 words `0x3e2e8`, face list `0x3e330`) at a given scale. `0x3e430` calls it with three immediate scale constants. `0x3eab4` does the same from `0x3e368`, `0x3e3b0` and `0x3e3f8`, computes a planar texture mapping from its bounding box, and binds TEX 10151 when a runtime flag is set (Likely the texture setting). `0x3e430` calls it with two immediate scale constants. The per-vertex list is passed where the projectile and missile builders pass none; that it holds vertex normals is Likely.

**Confirmed (face lists, code-generated) / Likely (templates):** the generated face lists are a sequence of {corner count, vertex indices} ending with 0. The templates have lengths consistent with the same form, so their exact form is Likely.

**Builder rules (Confirmed, code; structure only, no values):** for the geometry creation call `0x80c14`, every builder passes a vertex count, a vertex array (x, y, z per vertex), an optional per-vertex list and a face list. Colour and a mode word go to `0x82340`, and a second mode word to `0x8249c`. Their values are builder constants: RENS colour for projectiles, packed record colour times a scale constant for missile bodies and fins, and immediate operands otherwise.

- **Projectile:** the template's 4 vertices are processed in order. A component whose bits equal the unit marker or its negation is multiplied by the width. A z component that then equals the tail marker is multiplied by the length times the selected builder's length constant. Both markers are immediate operands of the builder's comparisons.
- **Missile body:** for k = 0 … n − 1 with angle θ = k × (angle constant ÷ n), accumulated by addition from 0:
  - vertex 2k is (r0 cos θ, r0 sin θ, 0) and vertex 2k + 1 is (r1 cos θ, r1 sin θ, length);
  - face j is the quadrilateral (2j, 2j + 2, 2j + 3, 2j + 1), each index taken modulo 2n;
  - the face list ends with 0.
- **Missile fin** (parameters p0–p3): 9 vertices (0, 0, p2 + p3), (±p0, 0, p3), (0, ±p0, p3), (±p1, 0, p3), (0, ±p1, p3), in that order, with each ± pair positive first. The face list is the template.
- **Missile element** (e0, e1, e2): for k = 0, 1, 2, with the angle accumulated by the element step constant, vertex 2k is (e0 cos θ, e0 sin θ, 0) and vertex 2k + 1 is (e1 cos θ, e1 sin θ, −e2). The face list is one of two templates, chosen by the flag. The texture mapping comes from 32 precomputed rotations.
- **Missile extra element:** three vertices on a circle in the plane z = −e2 + c, where c is a data-object constant. The radius is e0 + (−z) × (e1 − e0) ÷ e2, the angle is accumulated by another step constant, and the face template has one triangle.
- **Debris:** every template vertex component is multiplied by the call's scale.
- **Texture mappings:** the missile element's rotations and the textured debris shape's planar mapping go through `0x82ae8`. That function's semantics were not traced, so how they become texture coordinates is Unconfirmed.

**Confirmed (no load-time relocations):** Ghidra's relocation table (from the LE fixup records) has no entry inside any of the template, table, constant or immediate-operand ranges named above. The relocations next to the debris scale immediates belong to the following store instructions.

**Consequence:** every effect geometry is reproducible from RENS, static data in the executable and the builders' arithmetic, without runtime state. The projectile visuals depend on the executable's templates as well as on RENS. Normals for projectiles and missiles are not stored; the renderer computes shading.

Evidence: ignored `local/research/p2-06/effects/`: `NativeRange.java` and the native exports `native-projectile.txt` and `native-effects.txt`, decompilations `visual-builders.c`, `visual-inits.c` and `effect-init.c`, reference logs, and counts-only probes of RENS and the data object.

Evidence: ignored `local/research/p2-06/effects/`: the read-only scripts `DecompileEntry.java` and `FindPointerValues.java`, their logs and exports, the call-target and constant scans, the structure probe `effect-resources.ts/.json` and a capture contact sheet.

### Bounded runtime CODE/DATA object correlation

**Confirmed (observed pause, not a universal load address):** the installed debugger's `VRT` command permits timed pauses without an application selector guess or a DOS interrupt-route assumption. `local/research/p2-01/runtime-vrt-map.py` verifies a paused application using a unique 128-byte CODE window and an independent 64-byte DATA window. The checked run maps object 2 at `0x10059000` and object 4 at `0x1019a000`; their offsets from the LE preferred bases differ. A single common shift from Ghidra addresses is therefore not valid for this observed image.

| Window | Source object / offset | Observed runtime range | Exact comparison |
|---|---|---|---|
| CODE | 2 / `0x67f2c` | `0x100c0f2c`–`0x100c0fac` | 112 non-fixup bytes and 4 documented 32-bit relocations |
| DATA | 4 / `0x66b4` | `0x101a06b4`–`0x101a06f4` | 8 literal bytes and 14 documented relocations |

The CODE references independently agree on the object-4 base. DATA then confirms ten callbacks into object 2 and four pointers into object 4 against those same bases. Both complete windows match their relocated source bytes exactly. The source decoder was additionally cross-checked against two exact read-only Ghidra memory-window hashes. Object 3 was not needed or mapped by this proof.

**Confirmed (address derivation), Unconfirmed (entry execution and initialization timing):** the mapped entry location is object 2 plus `0x54b84`, yielding `0x100adb84` in this run; execution at that entry was not observed. The four cache/context locations derive to `0x1019f2ac`, `0x1019f2b0`, `0x101b1010` and `0x101b1014`. These are checked-run locations, not constants to reuse in another process. No pre-initialization watch or source-linked assignment follows from address correlation.

Evidence: ignored `runtime-vrt-map-12/report.json`, `runtime-vrt-map-offline-12.json`, the combined recipe and associated private source/runtime windows in `local/research/p2-01/`. The recipe derives per-object bases, rejects the wrong common-shift hypothesis and keeps all bytes/native output private. The sole native capture completed in 17.29 seconds; its own PID was reaped, and original files, configuration and 115 prior evidence files remained unchanged. The report separates `mappingEstablished: true` from `qualification: false` and zero watch coverage. Remaining presentation provenance, IFF/cardinality and canonical S-02 closure remain unproved.

### Watch registration and address-space availability boundary

**Confirmed (observed read availability):** after fresh CODE/DATA correlation, run 18 reads the two object-4 words at offsets `0x52ac` and `0x52b0` as zero and verifies their current linear-to-physical page lookup. Reads at `0x17010` and `0x17014` instead contain fault markers and no resolved physical lookup. Their values are **Unconfirmed**, not zero. An address derived from the checked object base does not by itself establish that its page is readable in every execution context.

**Confirmed (registered coverage), Unconfirmed (assignment):** the latest native breakpoint list contains eight distinct linear-memory watchpoints covering only the readable pair, so coverage is 8/16 bytes. A subsequent alert occurs after protection and paging have been disabled (`CR0 = 0x10`); the checked DATA fingerprint and physical lookup no longer validate that context. The guard stops without interpreting the alert as a cache update. A whole-word change, writer and source entry remain unproved; initial zero values and the absence of a qualified change do not establish resource absence.

Earlier binary-dump output in run 14 must not be used as proof that all four words were zero: that interface can zero-fill failed reads. The later direct-linear fault/lookup checks distinguish valid zeros from inaccessible memory. Historical reports remain intact, with the interpretation qualified by `runtime-linear-assignment-18/report.json` and its stop diagnostics in ignored `local/research/p2-01/`. That run reverified the mapping, reaped its own process, and preserved originals, configuration and 211 prior evidence files.

**Confirmed (bounded mode recovery and qualified snapshots):** run 21 completes three suspension/return/revalidation/rearm cycles. Native list acquisitions verify byte coverage transitions `8 → 0 → 16 → 0 → 16 → 0 → 16`. On the first qualified return, the previously inaccessible pair becomes readable with a verified page lookup; that availability transition is not a store. Exact DATA-source identity, relevant physical lookups and complete-word reads are checked before interpretation. The last qualified snapshot has four readable zero words, but no qualified word change, writer or source entry was established. Suspended intervals and the bounded startup context are not proof that these resources are absent or never change.

Evidence: ignored `runtime-linear-assignment-21/report.json` and `verified-final-summary.json`. All eight native list acquisitions completed; the sole child finished in 39.16 seconds, was reaped, and preserved originals, configuration and 352 prior evidence files. The next evidence needs a scoped presentation/3D-creation context, not another identical startup-only capture.

### Qualified startup interval change before manual activation

**Confirmed (checked word endpoints), Unconfirmed (writer and source):** run 23's longer, user-coordinated observation detects object-4 offset `0x17014` changing from zero to `0x103bf030` between two qualified reads. The checked runtime location is `0x101b1014`; the relevant page/source identity is revalidated. The change occurs across watch suspension, so neither the exact store nor its writer is captured. The interval-end register context is not relabelled as the application writer. This supplies a non-zero context pointer for further source binding, not a confirmed TEX entry ID, allocation, or independent Asset.

No practice-entry click, flight or other gameplay input was performed before this observation; the controller paused during startup and the user reported a black debugger-enabled window. Thus the earlier claim that a manual entry was needed for this particular observed change is superseded. This does not prove the meaning or sufficiency of that startup context for every watched resource.

Evidence: ignored `runtime-manual-activation-23/report.json` and its qualified read/lookup snapshots in `local/research/p2-01/`. The isolated session ended within its user-coordination bound; its own process was reaped, and original configuration, scores, executable, private configuration and prior reports remained unchanged. Source ID, creation context and package qualification remain false.

**Confirmed (bounded context read), Likely (record interpretation):** a fresh automatic run revalidates that interval change and reads 64 bytes at the resulting pointer after checked DATA/page identity and stable owning-field/register checks. The fields are compatible with a 256×256 raw image and sixteen palette entries; this is not a unique source binding. The existing consumer's +0x28 field has value `0x5a0`, an opaque runtime handle, not an archive entry ID. Exact native TEX-handler calls at `0x662d0` to `0x74190` and `0x662dd` to `0x22fe8` provide the next ownership linkers, not evidence that either produced this particular pointer.

Evidence: ignored `runtime-source-snapshot-24/milestone.json` and its 64-byte private snapshot. The sole owned capture completed in 75.04 seconds, was reaped, and preserved originals/configuration and 912 prior evidence files. No user/gameplay input, exact store, source request or whole-payload/locator comparison was observed; header compatibility cannot substitute for those proofs.

**Confirmed (native TEX continuation), Unconfirmed (actual request/consumer ownership):** the registered TEX row at `0x1766c4` names handlers `0x662c8` and `0x66338`. The continuation beyond `0x662e9` fills wrapper fields +0/+4/+8. At `0x662fa`, its call to `0x6b828` supplies the same value stored at wrapper +0 in EAX, completion target `0x66310` in EDX and the wrapper pointer in EBX. This establishes the concrete completion linker; it does not independently identify that numeric value as a source entry ID or bind the wrapper/consumer to the changed runtime pointer. The +4/+8 callback/context interpretations require the completion's native argument flow, not analogy to another resource handler.

Evidence: ignored `tex-source-binding-25.json` and the bounded 184-instruction export/call-input metadata. Synthetic indirect-callback guards validate the research method, not an observed source request. No new emulator or payload dump was launched; originals and the checked 852-file evidence scope remained unchanged. Source identity, exact writer and candidate qualification remain unproved.

**Confirmed (native completion flow), Unconfirmed (actual owner/request):** the full reachable body of `0x66310` covers eighteen instructions and both return paths; preparation callee `0x660dc` covers 146 instructions. On the successful path, consumer call `0x66327` targets wrapper +4 with wrapper +0 in EAX, the same loaded payload pointer received by completion in EDX and wrapper +8 in EBX. The completion neither reads nor writes +12; that field must not be named a payload/source field without separate evidence. Forwarding the +0 value is not proof that it is an original archive entry ID.

Evidence: ignored `tex-completion-26-milestone.json` and exact-address native/call-flow outputs. Its single runtime attempt revalidates mapping but fails the protected/paged-context guard before breakpoint arming; no wrapper/request/consumer sample was obtained. The owned child was reaped after 23.43 seconds, with originals/configuration and the checked 1,363-file evidence scope unchanged. The missing association remains actual consumer +4 and context +8 for the observed pointer, together with independent archive-ID semantics.

**Confirmed (request-carrier flow), Unconfirmed (registered runtime hook and ID semantics):** exact native input tracing shows `0x6b828` carrying incoming EAX/EDX/EBX into descriptor +0/+4/+8 before calling `0x6a8f0`. This identifies the next source-side semantic boundary, not an archive-directory lookup. A fresh run verifies CODE/DATA and physical lookup before issuing the mapped completion hook, but its command response has neither a BP echo nor registration acknowledgement. Hook registration is therefore unproved; zero qualified events in that window do not establish that completion ran earlier or never recurs.

Evidence: ignored `tex-completion-27-milestone.json` and bounded request-flow/native outputs. No wrapper/consumer instance or payload dump was captured. The sole owned child ended after 107.66 seconds and was reaped, preserving originals/configuration and the checked 1,418-file evidence scope. An actual verified hook and source/pointer association remain necessary before naming the forwarded number an original source ID.

**Confirmed (registered code hook and carrier operation), Unconfirmed (owner/source association):** run 28 obtains a fresh BP acknowledgement, command completion and native list with exactly one mapped code-breakpoint row in 0.553 seconds. Ten negative registry fixtures cover the reader; the actual list, not those fixtures, proves registration. No qualified completion events occur in the ensuing bounded window; this does not prove absence, prior execution or non-recurrence. Exact analysis of `0x6a8f0` identifies opaque-record insertion/copying with a separate insertion selector, not an IMFAT directory-ID resolution. The carried +0 value remains semantically unbound.

Evidence: ignored `code-registry-28-milestone.json`, native registration/capture and exact-address carrier outputs. The verified observation window is 82.74 seconds; its sole owned process ends after 107.75 seconds, is reaped, and preserves originals/configuration and the checked 1,507-file scope. The completion-hook method stops at this bounded negative result; no actual wrapper/consumer/payload association or source ID has been established.

**Confirmed (helper operations), Unconfirmed (accepted pointer production):** `0x74190` forwards the incoming size through allocation paths; the TEX handler supplies sixteen bytes. This call must not be named image preparation. `0x22fe8` supplies selector 7, clears EDX and tail-transfers to `0x23018`; no renderer-preparation ownership follows from that dispatch. The observed preparation body `0x660dc` contains a sixty-byte allocation request and accesses a secondary-record link at +36. Its relationship to the accepted changed context, palette +20/+24 and pixels +28/+32 still needs proof, including aliasing and mutations.

Evidence: ignored `source-binding-29-milestone.json` and bounded helper/native outputs. The exact `0x23018` export exceeds its 180-instruction cap, so it is incomplete, not empty. No complete image/palette comparison, archive candidate scan, generated-only classification or source locator was obtained. The owned analysis child was reaped after 5.25 seconds, preserving the checked 2,227-file evidence scope; no emulator or input was started. The existing nearest-DATA colour rule alone cannot prove this particular buffer's transformation.

**Confirmed (native preparation layout), Unconfirmed (actual two-record ownership):** `0x660dc` reads owner +36. A non-zero link skips construction; otherwise it requests sixty bytes and stores the allocation at owner +36. Owner +20/+24 are palette pointer/count and +28/+32 are pixel pointer/byte size. In the preparation record, +20 is the indexed-branch flag, +24 row width, +28 an alias of the owner's pixels, +32 literal zero, and +52/+56 palette count/pointer. These offsets must not be interpreted identically across the two records.

For a positive embedded palette, the checked loop converts three-byte BGR entries to four-byte RGB entries with literal fourth byte 1; this loop is not nearest-DATA mapping. The four direct helpers cover 106 instructions and include resource-field setters and a +16 integer increment. `0x83250` is not a proved memory-copy operation. The retained context has a non-zero +36 field, but its sixty-byte target was not read in this milestone; constructor association and downstream alias/mutation through `0x850ec` remain unproved.

Evidence: ignored `preparation-layout-30.json`, exact-field assertions and synthetic conversion checks. The owned analysis child ends after 4.95 seconds and is reaped; the checked 2,233-file evidence scope, including prior source/capture reports, remains unchanged. No full image/palette comparison or generated/reused-only/source-locator conclusion follows from this static layout.

**Confirmed (actual linked records and palette relation), Unconfirmed (constructor execution/source):** a fresh guarded capture reads the accepted owner header (64 bytes), its +36 linked record (60 bytes), the owner's sixteen BGR entries (48 bytes), and the prepared entries (64 bytes). The linked record's +28 equals the owner pixel pointer, +24 equals row width, +32 is zero and +52 equals owner palette count. All sixteen converted entries exactly match RGB order with fourth byte 1. Owner/link/buffer pointers, both records and palettes remain stable across checked source/page identity and paused-register guards. This associates the actual records with the native layout/conversion, not an observed constructor call or unique archive source.

Evidence: ignored `runtime-ownership-31-milestone.json` and private record/palette snapshots. The sole automatic capture completes in 80.98 seconds, is reaped, and preserves the checked 2,238-file scope and originals/configuration. The direct +84 write in `0x850ec` does not establish owner-buffer alias/mutation or returned-handle provenance. No owner-pixel/full-source comparison was attempted in this milestone; source ID, exact writer, generated-only classification and canonical counts remain unproved.

**Confirmed (full-read guard), Unconfirmed (complete payload/source match):** a fresh owner again declares a 256×256 raw image, 65,536 pixel bytes and sixteen colours; the linked-record and all-entry palette checks pass before the bulk guard. The currently selected ordinary-data segment is only 34,816 bytes and does not cover the pixel pointer or complete extent. The guard rejects that route before issuing a bulk dump. The unaligned buffer spans seventeen pages, not sixteen. This does not prove that a separately validated full-span selector or direct-linear route is unavailable.

Evidence: ignored `runtime-full-content-32-guard.json`. Complete pixels read and comparisons performed are both zero; the match count is unknown, not zero. The single child ends after 85.35 seconds, is reaped, and preserves originals/configuration and the checked 2,738-file scope. The remaining question is a verified read route for the entire current buffer, not a header-based locator or wider graphics-history claim.

**Confirmed (fresh route descriptor body), Unconfirmed (receipt binding/full read):** the next run queries that child's saved initial DATA selector rather than substituting current DS or a selector from another process. A fresh numerical `SELINFO` response contains one unlabelled descriptor body matching the initial present/writable/32-bit flat, full-span descriptor; CPU evidence is protected and paged with VM disabled. The experimental receipt decoder nevertheless requires a selector label/command echo and rejects the unlabelled result before bulk reading. That failure is not proof that numerical selector queries or full-span routes are unsupported.

Evidence: ignored `runtime-full-content-33-guard.json`. Complete pixels read, comparisons and all matches remain unobserved/unknown. No register mutation or truncated-segment fallback is used. The sole child ends after 84.66 seconds and is reaped, preserving originals/configuration and the checked 3,268-file scope.

### Qualified full-span image capture

**Confirmed (complete current-buffer capture):** run 34 binds a fresh numerical selector query to its serialized response/completion, accepting the native unlabelled descriptor rather than requiring a printed selector label. The child's saved initial flat DATA descriptor covers the complete span; no register mutation or truncated-segment substitution is used. Two complete 65,536-byte reads agree. All seventeen pixel pages have stable physical identities, with thirty-four direct samples before and thirty-four after; every sample agrees with both full reads. Owner/preparation records, their links, all palette entries, checked CODE/DATA identity and paused registers remain stable across the reads. Dump size alone and zero-filled failed reads are not accepted.

The resulting source-corpus comparison and exact equivalent-locator boundary are maintained in [textures](./textures.md#checked-runtime-image-equivalence-and-exact-source-aliases). A complete current-buffer match does not retroactively prove the original request, constructor execution or historical nonmutation.

Evidence: ignored `runtime-full-content-34-milestone.json` and private capture files. The sole owned child completes in 103.2 seconds and is reaped; originals/configuration and 3,790 prior evidence files remain unchanged.

### Native TEX preparation and nearest-colour search

**Confirmed (bounded negative result), Unconfirmed (where the nearest-DATA mapping happens):** P2-05 subtask 11 searched for the code that maps TEX colours to the nearest DATA colour (see [textures](./textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)). The search was read-only, against the existing Ghidra project without reimport, and checked exactly these functions:

- the documented TEX handlers `0x662c8` and `0x66338`, the preparation function `0x660dc` and the helper `0x850ec`, with their direct callees (17 functions in total);
- every call site of `0x660dc`: in `0x65e28`, in the documented TEX completion `0x66310`, and in the 12-byte stub `0x66834`;
- the direct callers of `0x850ec`: `0x660dc` and `0x41f88`.

The two TEX handlers have no direct code references; they are reached only through the per-type callback table at `0x1766b4` (row `0x1766c4`), whose dispatcher was not part of this search. No checked function computes a colour distance or searches the 256 DATA entries; the documented BGR-to-RGB loop in `0x660dc` is not a nearest-colour mapping. The mapping therefore lies outside this checked set, and both its location and its metric and tie rule stay Unconfirmed (U-028).

Evidence: ignored `tex-path.c`, `callsites-0x660dc.c`, `callers-0x660dc.c`, `callers-0x850ec.c`, `callers-0x662c8.c`, `callers-0x66338.c` and `ghidra-tex-path.log` in `local/research/p2-05/`, produced by `DumpAt.java` and `DumpCallers.java`.

**Confirmed (wider bounded negative result, P2-06/12, 2026-10-06):** a second read-only search also found no nearest-colour code:
- **TEX load path to depth 3:** the functions reached from TEX load `0x65e28`, preparation `0x660dc`, texture setter `0x82364` and handle resolver `0x7a5e8`, 56 in all. `0x660dc` gives the renderer an indexed image with the texture's own palette, reordered from BGR into 4-byte entries, through `0x850ec`, `0x8526c` and `0x852c8`. No checked function compares colours or searches DATA.
- **Shape scans of every exported function:** squared or table-driven component differences, and packed-RGB lookup indices. The only matches are vector, nearest-object and texture-coordinate maths.
- **Raw scans of the code object, including code never disassembled:** it holds only 6 integer self-multiplications, none clustered, and 25 clusters of floating-point self-multiplications. The 8 clusters checked in renderer and game code compute vectors and texture coordinates; none loops over palette entries.

The mapping was not found in the checked set. Renderer-side processing after the indexed image is handed over is only a hypothesis for the next search: indirect callbacks, precomputed tables or a different algorithm shape are not excluded. The location, metric and tie rule stay Unconfirmed (U-028). Evidence: ignored `local/research/p2-06/nearest/`, including `scans.py` and `scans.log` with the scan criteria, totals and hit addresses.

