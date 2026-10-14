---
type: format
status: draft
phase: P0
updated: 2026-10-13
related: [U-001, U-007, U-008, U-009, U-010, U-011, U-012, U-017, U-021, U-022, U-024, U-026, U-027, U-029, U-031, U-032]
---

# Main executable (`SRANGERS.EXE`)

Confidence labels as defined in the [IMFAT](./imfat.md) doc. No code or disassembly is reproduced here.

## 1. Format and toolchain (Confirmed)

- MZ stub + **LE** (Linear Executable) image for the DOS/4GW extender; 32-bit protected mode.
- Compiled with Watcom C/C++ (Watcom 32-bit run-time present).
- The installed copy is byte-identical to the CD copy (see [manifest](../manifest.md)).
- **LE structure (Confirmed, local reader check 2026-10-06):** little-endian byte and word order, 4,096-byte pages, 342 pages in 4 objects, and fixup records for the loader. The fields the product reader [`le-executable.ts`](../../../src/original-data/formats/le-executable.ts) uses:

  | Structure | Layout |
  |---|---|
  | MZ header | `MZ` at 0x00; u32 LE header offset at 0x3C |
  | LE header | `LE` at 0x00; u8 byte order 0x02, u8 word order 0x03 (0 = little-endian); u32 page count 0x14; u32 page size 0x28; u32 bytes on the last page 0x2C; u32 object table offset 0x40 and u32 object count 0x44; u32 page map offset 0x48; u32 fixup page table offset 0x68; u32 fixup record table offset 0x6C (these offsets relative to the LE header); u32 data pages offset 0x80 (from the file start) |
  | Object entry, 24 bytes | u32 virtual size, u32 base address, u32 flags, u32 first page map index (1-based), u32 page count, u32 reserved |
  | Page map entry, 4 bytes | 3-byte stored page number, most significant byte first, then u8 type (0 = stored in the file). Stored page n is at data pages offset + (n − 1) × page size; only the last stored page may be short |
  | Fixup page table | page count + 1 u32 offsets into the fixup record table; page map entry i owns records [entry i − 1, entry i) |
  | Fixup record | u8 source type (low nibble: patched size 1, 2, 4, 2, 6, 4 or 4 bytes for types 0, 2, 3, 5, 6, 7, 8; 0x10 alias, only on selectors and pointers; 0x20 offset list); u8 target flags (low two bits: internal, import by ordinal, import by name, internal entry; 0x04 additive, 32-bit when 0x20; 0x10 32-bit target offset; 0x40 16-bit object or module; 0x80 8-bit import ordinal; 0x08 reserved); then a signed 16-bit source offset, or a count and the offset list after the target data. A fixup that crosses a page boundary is recorded on both pages, with a negative offset on the later one |

  `readRegion` rejects any region that a fixup patches. `readFixedUpRegion` (P3-03/11) accepts a region whose patches are all internal, non-additive 32-bit offset fixups (source type 7) lying wholly inside it, and returns the unpatched file bytes with each fixup's target object and offset; the AI built-in program table is read this way ([ai §3.3](./ai.md#33-built-in-program-table-0x1762f8)). All 28 planned effect regions (P2-06/16) read cleanly, and the opcode bytes of their 16 immediate-operand instructions match. Object numbers in region locators are the 1-based LE object numbers; offsets count from the object's start.
- Loads in Ghidra 12.0.1 with the ghidra-lx-loader extension as 4 LE objects. Ghidra defaults to a Borland calling convention; Watcom passes arguments in EAX, EDX, EBX, ECX, so a custom calling convention is needed before decompiling.

## 2. Linked libraries (Confirmed unless noted)

| Library | Evidence | Relevance |
|---|---|---|
| Watcom C/C++ 32-bit run-time | Run-time banner | Calling convention, struct packing |
| Miles Audio Interface Library (AIL) | Over 100 `AIL_` references; matches the Miles 3.03 drivers on disc | Music and sound playback (U-004) |
| Smacker player (statically linked) | Code checks the `SMK2` signature | Cut-scene playback |
| 3D renderer, Likely RenderMorphics Reality Lab (P2-06/12) | Assertion text mentions a fixed-point-to-integer macro, viewports, tile maps and versioned renderer components, and names source files under `..\rl\` and `..\rlpatch\` (such as `ramplt.c`, a ramp colour model); no brand string found | The renderer uses **fixed point** internally, while mesh vertices are stored as floats (U-009). Its colour manager does the nearest-colour search ([§4](#native-tex-preparation-and-nearest-colour-search)) |

## 3. Content embedded in the EXE (Confirmed)

The EXE contains no mission text (see [scenario](./scenario.md) §1). Its long strings are installer and support messages, error/assert text, library text, and one generic in-game system message.

## 4. Code landmarks

Addresses are Ghidra addresses with the ghidra-lx-loader defaults (objects mapped at 0x10000, 0x20000, 0x140000, 0x170000) and the Watcom calling convention applied (see [baseline environment](../../guides/baseline-environment.md#静态分析)). Names are ours. No decompiled code is reproduced here.

| Address | Role | Status | Evidence |
|---|---|---|---|
| 0x6affc | Load an IMFAT entry by ID; returns the relocated block | Confirmed (logic) | Looks the ID up in every open archive and counts a reference; every caller is listed in [data loaded by the loop](#data-loaded-by-the-loop-p3-0110) |
| 0x65ba0 | Opens the archives and registers per-type callbacks | Confirmed (logic) | Start-up initialiser; opens `SR.NOB`, `COMM.NOB`, `SCENARIO.NOB` and `COMMFACE.NOB`, walks the table at 0x1766b4 and loads M2ID 10649 (earlier listed at 0x65bcb, an address inside it; see [data loaded by the loop](#data-loaded-by-the-loop-p3-0110)) |
| 0x1766b4 | Per-type callback table: {type tag pointer, dependency lister, asynchronous loader, release callback}, 16 bytes per row | Confirmed (contents and use, P3-01/10) | Four rows: EXPL, TEX, MESH, MODL. No row for SCEN, so missions use no type-specific load callback |
| 0x6a7b4 | Builds a renderer mesh from a MESH struct; reached from the MESH row of 0x1766b4 through 0x663ac and its completion 0x663f4 | Confirmed (logic) | Field order and the texture-coordinate pairing are in [mesh §1](./mesh.md#texture-coordinate-block-order-confirmed) |
| 0x39f34 | Cut-scene list player | Confirmed (logic) | Plays a list of rows of the cut-scene table `CINC` 10095 (file and `SONG` entry per row) in order, switching the display to 320 or 640 wide by the `CINEMATIC` setting; Esc, Enter or Space ends the current clip; all ten callers are listed in [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108) |
| 0x38ff4 | Docking and launch: dispatcher message 0x400000, sub-commands 0–4 | Confirmed (logic) | Plays the docking and launch clips and switches to and from the base-interior view mode 6 (see [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108)) |
| 0x216d4 | Sets the player's view mode and sub-mode, then switches the display through `0x3f158` | Confirmed (logic) | Used by the flight handler's view keys, the destruction view, docking and launch; the map and Warp transitions write the mode directly. All writers of the view mode are listed in [automatic views](#automatic-views-and-cameras-p3-0109) |
| 0x30ef0 | Places the camera for the current view mode, once per dispatcher pass while the player state holds a player object | Confirmed (logic) | Per-mode and per-sub-mode function tables `0x174b88` and `0x174bdc`; see [automatic views](#automatic-views-and-cameras-p3-0109) |
| 0x2cbb4 | Builds the communications menu for the current target | Likely | Chooses one of three `COMM.NOB` menu tables from the target's type value and the flag bits `0x68000` (see [scenario](./scenario.md) §3) |
| 0x282bf | Handles debug or cheat commands | Confirmed (logic) | References the strings for mission win/fail and mission selection; win/fail post a request through `0x33874`, four kill commands use dispatcher event 0x800, and mission selection calls 0x33170 (see [mission result](#mission-result-success-path-and-campaign-restart-p3-0104)); how commands are entered is not traced |
| 0x33170 | Jump to mission N: stores the mission number in a global and sets the game state | Confirmed (logic) | Called from the debug command handler with N − 1; enters campaign mode at main-flow state 0 |
| 0x25894 | Per-frame sample of the mission clock and the simulation step | Confirmed (logic) | Called once per main-loop iteration and once at mission start; see [time base](#simulation-time-base-p3-0106) |
| 0x3266c | Main mission flow: briefing, building the mission, in-mission loop, results | Confirmed (logic) | Per-frame state machine over `0x1863ac`; reads the mission number global; calls 0x66c00 and the result handlers 0x335f0/0x3351c (see [mission result](#mission-result-success-path-and-campaign-restart-p3-0104)) |
| 0x32e14 | Player-loss handler: campaign rescue while the per-attempt rescue counter is below 2, otherwise mission failure; practice result pages | Confirmed (logic) | Reached after the player's destruction and after energy loss (see [mission failure](#mission-failure-player-loss-and-rescue-p3-0105)) |
| 0x3351c | Campaign mission failure handler: failure clips, page 0xC, retry prompt page 0xD | Confirmed (logic) | Called only by 0x32e14 and by state 5 of 0x3266c (see [mission failure](#mission-failure-player-loss-and-rescue-p3-0105)) |
| 0x38428 | Maps a 0–100 value to campaign group 0, 1, or 2 at thresholds 34 and 67 | Confirmed (logic), Likely (difficulty slider) | Result is passed to 0x66c00 as the group |
| 0x66c00 | Mission builder: picks a `SCCT` slot by group and mission number, loads its `SCEN` and `MUSC` by ID, rescales, and spawns objects | Likely | See [scenario](./scenario.md) §4 |
| 0x68d2c | Rescales the spatial fields of section-1 records and sections 3–4 of the current `SCEN` by (runtime scale ÷ header scale), then swaps y/z of element 0 of each section-6 entry | Confirmed (logic, native loop) | Identifies the spatial fields in [scenario](./scenario.md) §2–3; the builder passes the runtime scale 15000.0; rounding in [runtime scale](#runtime-scale-and-load-conversion-p3-0202) |
| 0x6721c | Schedules mission objects: section-1 records with a non-zero kind and zero +0x3C, section-5 entries by their template, and the selected wingman | Confirmed (code; runtime in the selected mission, P3-02/10) | Inserts {time, index, source} into a time-ordered queue via 0x67584; order, defaults and the wingman gate in [spawn queue](#spawn-queue-p3-0203) |
| 0x67018 | Processes due spawn-queue entries: spawn-count limit, probability and repeat checks, then posts the per-entry number of spawn requests | Confirmed (code) | [Spawn queue](#spawn-queue-p3-0203); fields in [scenario](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) +0x0C–+0x20 and +0x80 |
| 0x68398 | Computes an object's spawn position and initial pose from its record (see [placement](#mission-placement-scheduling-and-world-grid) and [placement mappings](#placement-mappings-p3-0202)) | Confirmed (logic) | Called by spawn dispatch for records and section-5 templates, and by the rescue `0x67b98` |
| 0x6744c | Fills default values into a 132-byte object record | Confirmed (code) | Field defaults listed in [scenario](./scenario.md) §3; when it runs in [defaults](#record-defaults-p3-0203) |
| 0x65ca4 | Maps a single-bit object kind to the corresponding M2ID model slot | Confirmed (logic) | Computes the bit position and indexes the M2ID table loaded from entry 10649 |
| 0x67678 | Dispatches queued spawns, including actual section-5 member records | Confirmed (access logic) | Follows the section-5 template, formation and member-pointer array; see [scenario](./scenario.md#section-5-member-records-confirmed-access) and [section-5 dispatch](#section-5-dispatch-p3-0202) |
| 0x67938 | Instantiates one object from a record, a position and a pose | Confirmed (code) | Called only by `0x67678`; see [instantiation](#instantiation-p3-0203) |
| 0x67d44 | Assigns a new object's name | Confirmed (code) | Called only by `0x67938`; see [names](#names-p3-0203) |
| 0x68018 | Returns a mission object's AI target-kind filter | Confirmed (logic) | Uses the active +0x58 descriptor or falls back to the +0x5C mask; not a base-capability field |
| 0x520d4 | Allocates a runtime object: stores its kind at +4 and appends it at the tail of the per-kind list for that kind's bit | Confirmed (logic) | Only writer referencing the list table at `0x1b06e4`; see [player target modes](#player-target-modes-and-enemy-classification) and [object table](#runtime-object-table-p3-0201) |
| 0x5261c | Iterates runtime objects whose kind bit is in a mask | Confirmed (logic) | Walks the per-kind lists in ascending bit order, each from head to tail, reading the next node as it goes ([object table](#runtime-object-table-p3-0201)) |
| 0x2799c | Selects the player's first target in enemy (`0x93780`) or friendly (`0x206c87e`) mode: the nearest candidate through `0x63858`; `0x27884`/`0x27910` cycle within the mode | Confirmed (logic and `t` key binding) | Called from the flight key handler `0x264a0` and by the automatic selection at the end of the player's callback ([initial flight state](#initial-flight-state-p3-0605)) |
| 0x33940 | Returns the selected wingman value | Confirmed (getter/access) | Zero suppresses wingman scheduling; positive values select from SCCT through `0x6721c` ([spawn queue](#spawn-queue-p3-0203); selectors 0 and 1 confirmed at runtime) |
| 0x3b8dc | Records post-mission statistics (17 rows of 0x48 bytes) and decides promotion | Likely | Compares a rank field and the average of recent scores with a threshold table |

The mission module occupies roughly 0x67000–0x6a000; functions there read the current `SCEN` through one global pointer. The object kind at +0 selects the M2ID slot through its single set bit and also fixes the player-relative enemy/friendly class ([player target modes](#player-target-modes-and-enemy-classification)). The success condition is recorded in [mission result](#mission-result-success-path-and-campaign-restart-p3-0104) and the failure condition in [mission failure](#mission-failure-player-loss-and-rescue-p3-0105); exact base-interaction conditions and the remaining object-field semantics are still open under U-022.

Local follow-up analysis found that previously generated C could retain `__fastcall` prototypes despite the installed compiler spec having `__watcall` as its default. Selected engine-function conventions were therefore overridden in memory during `-readOnly` analysis; the project was not overwritten or reimported. Parameter-sensitive claims use native call-site register metadata as a cross-check rather than trusting incomplete inferred signatures. Code/output remains in `local/research/p2-01/`.

### Mission placement, scheduling and world grid

**Confirmed (world sector grid):** after rescaling, the builder `0x66c00` passes the low 16 bits of `SCEN` header 0x00 and 0x04 and the (runtime) scale at 0x08 to `0x3a380`, which stores them as the world grid. `0x3a41c` returns the world rectangle ±(header value × scale × 0.5) on x and y. `0x3a61c` maps a world x/y to a signed sector coordinate with 1 ÷ scale (negative values are offset by one sector first), `0x3a680` adds half the grid size to obtain a zero-based sector index, and `0x3a6b0` returns a sector's centre at z = 0. The world is therefore header 0x00 × header 0x04 sectors of one scale unit each, centred on the origin in the x/y plane. Default placement `0x68c98` draws x and y uniformly over the same extent, computed directly from the header. Several callers query the world rectangle. Placement does not clamp but moves an edge point once toward the origin ([placement mappings](#placement-mappings-p3-0202)). **Corrected by P3-06/04:** the only clamp is the map viewport's, and it clamps only the map's own rectangle; no caller clamps, moves or refuses an object's position, and active objects are not bounded by the world rectangle ([world boundary](#world-boundary-active-area-parking-and-autopilot-p3-0604)).

**Confirmed (placement routines):** `0x68398` selects placement as recorded in [scenario](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely):

| Routine | Input | Result |
|---|---|---|
| `0x685e0` | Section-3 rectangle (+0x44) and spacing (+0x40) | Grid position with a random jitter, z = 0 |
| `0x68708` | Anchor record (+0x48) | Position of the runtime object created from that record plus a random signed offset per axis; `0x68c98` when none exists |
| `0x6883c` | Section-3 rectangle (+0x44) | Uniform x/y from the rectangle's first corner over the absolute side lengths, z = 0 |
| `0x688c4` | Path reference (+0x4C) and selector (+0x50) | Likely a position along or between path points |
| `0x68c98` | Header 0x00/0x04 and scale | Uniform x/y over the world extent, z = 0 |

Placement uses the runtime random generator; the resulting positions are runtime state, not record data. The random mappings, the world check and the initial pose are in [placement mappings](#placement-mappings-p3-0202). Spawn dispatch `0x67678` adds section-6 layout offsets to the template anchor for section-5 members (see [scenario](./scenario.md#section-5-member-records-confirmed-access) and [section-5 dispatch](#section-5-dispatch-p3-0202)).

**Confirmed (scheduling and AI-target access):** `0x6721c` skips section-1 records whose kind is zero or whose +0x3C member back-reference is set; records with a non-zero +0x30 go through `0x69708` instead of the time queue. Section-5 entries are queued by their template's +0x1C or +0x30. `0x68018` returns the +0x58 target record's kind while that record's spawn counter is positive, and the +0x5C mask otherwise. The event-trigger consumer `0x6977c` passes record +0x54 to `0x695c0`, which updates counters and, for matching ranges, queues the paired section-1 record or section-5 entry after a delay taken from +0x34 of that record or of the entry's template.

Evidence: ignored read-only probe outputs `local/research/p2-09/probe-1.txt`–`probe-5.txt` (references, constants and native loops) and the earlier decompiled exports in `local/research/`.

### Mission result, success path and campaign restart (P3-01/04)

Globals named here: main-flow state byte `0x1863ac`; in-mission sub-state byte `0x186881`; mission status byte `0x1b46fc` (setter `0x695a4`, getter `0x695b8`); the mission result word `0x18685c`, followed by the summary-text pointer `0x186860` and a summary selector byte `0x186864`; campaign flag `0x186882` (1 = campaign); campaign mission index `0x18683c`; difficulty global `0x186844` ([scenario §4](./scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)); wingman selector `0x186880` (getter `0x33940`, setter `0x33938`); rescue counter `0x186830`; next menu page `0x186840`, run by `0x32fec` through page dispatcher `0x33e8c`. Delays are in units of the mission clock global `0x186414`, 1/64 s each ([time base](#simulation-time-base-p3-0106)).

**Confirmed (main mission flow):** the main loop `0x22d00` calls `0x3266c` once per frame, followed by behaviour generation `0x20938`, the event dispatcher `0x20d10` and the frame update `0x3ee58`; it exits when `0x3266c` returns non-zero. `0x3266c` steps the state byte:

| State | Role | Next |
|---|---|---|
| 0 | Between missions | 1: `0x334bc`, called near the end of every `0x20d10`, sets state 1 and the caller then retires every runtime object (`0x21694`) |
| 1 | Teardown: waits until no runtime object remains | 2; on the practice result path it runs the pending page first |
| 2 | Campaign only: when the mission index is 0, the clip played before the first mission (`C-INTALL`); pre-mission page 0xF; a departure clip whose variant depends on the wingman selector (files in [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108)). All modes, after those pages: clears the result word, summary pointer and selector; resets the per-mission player-state counters (`0x3b734`); builds the mission with `0x66c00` (group from `0x38428` over the difficulty global, slot = mission index + 1, or 0 outside the campaign). Next page −1 instead returns 1 to quit | 3 |
| 3 | In mission; sub-state below | 4, 5, or reset to 0 |
| 4 | All-clear wait | 5 |
| 5 | Result delay | 0 through the success or failure handler |

In-mission sub-states: 0 = normal (polls the mission status and the wingman-loss timer); 1 = energy-beacon countdown; 2 = ending (player destruction or a debug result); 3–5 = base docking and launch steps (Likely, see [B-004](../behavior/B-004-base-communications.md)); 6 = end-campaign request. The mission builder sets the status to 0 on entry and 1 when the mission is built; status 4 means ended, and `0x695a4(4)` also clears the spawn-enable flag `0x17670c`, so `0x67018` stops processing the spawn queue.

**Confirmed (success result):**

1. `0x6977c` consumes object events by type: 3 = instantiated (`0x67938`); 0 = destroyed by the player; 1 = destroyed otherwise; 2 = a parked object reached its goal outside the world rectangle inset by 100 units (`0x2f314`; corrected by P3-06/04 from "extended by a 100-unit margin", see [world boundary](#world-boundary-active-area-parking-and-autopilot-p3-0604)). Damage handler `0x2a694` receives the attacking object's kind (`0x2a40c` passes the kind of the projectile's owner) and reports type 0 exactly when it is 1, the player's kind. For types 0–2 of an object in the enemy mask `0x93780`, when SCEN header 0x0C is zero and the status is not 4, it calls `0x69a70` with that object excluded; a zero return sets the status to 4 and clears the spawn-enable flag.
2. `0x69a70` returns 1 while any of these exists: a live object of a kind in `0x91780` (the enemy mask without bit `0x2000`), other than the excluded one, not flagged dead (+0xD8) and not in object state 6; a pending spawn-queue entry (array `0x1b46f8`, count `0x1b46f0`) whose section-1 record or section-5 member has such a kind; a word of a section-2 trigger's spawn-pair array that names one. It reads that array as 32-bit words with a stride of 4, so it does not visit the target of every pair ([scenario](./scenario.md#section-2-event-triggers-p3-03)). Otherwise it returns 0.
3. In state 3, sub-state 0, `0x3266c` sees status 4 and calls `0x69c54` with the result word and EDX = 0. `0x69c54` reruns `0x69a70` (which preserves EDX) and stores 0 when an enemy remains; otherwise it stores 1 and selects summary text from the section-2 trigger ranges by each trigger's destroyed-to-instantiated ratio. The state becomes 4, due after 0x140 clock units.
4. State 4 rechecks every 0x140 units while the player-state mode byte (`0x1b0638` +0x28) is 1, the warp mode entered by the [Warp start](./audio.md#slice-sample-set-and-role-correspondences-p2-08). Otherwise it posts a fixed EXE completion message through `0x4e9e8` (Likely the communications text area), and state 5 becomes due 0x3C0 units later.
5. State 5 calls `0x335f0` when the result word is non-zero. It calls `0x3af04(1)` (score) and `0x3b8dc` (statistics row and promotion; roles Likely, see §4), plays the clip list given in [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108) (a return clip in one of two variants, then a mission clip or medal clips, and promotion clips) and runs page 0xC (Likely the statistics page). After mission index 16 it plays a final clip, enters the campaign high score through `0x3b28c(1)`, runs page 0xB, clears the result word and resets for a new campaign. Otherwise the mission index increases by one and the state returns to 0. The next state 2 runs page 0xF, whose first chapter (the summary text selected in step 3) is enabled only when the result word is 1, followed by the briefing and wingman-selection chapters; the result word and summary are cleared after page 0xF returns.

**Confirmed (only non-debug success route):** only `0x69c54` writes a non-zero result word. Its address is taken only in `0x3266c`, whose two calls are the status-4 evaluation above and the debug win request; every other write stores 0. A campaign mission therefore succeeds, outside debug commands, only through the all-clear status of `0x6977c`, which requires SCEN header 0x0C to be zero (51 of 52 missions, including the selected one). The debug kill commands also report through `0x6977c` (type 1) and can reach the same status.

**Confirmed (kill statistics):** when the attacker is the player, `0x2a694` increments one of eight per-mission player-state counters by the destroyed object's kind: `0x80` → +0x30, `0x100` → +0x34, `0x200` → +0x48, `0x400` → +0x4C, `0x80000` → +0x50, `0x1000` → +0x54, `0x800` → +0x58 and `0x10000` → +0x5C. `0x3af04` stores their sum at +0x68. Destructions by other objects are not counted. Which page row shows which counter is not traced.

**Confirmed (selected mission, data and code):** `enemy-count.ts` resolves SCEN 3019 the way `0x6721c`, `0x67018` and `0x67678` schedule it: header 0x0C is zero; 4 section-1 records are queued directly and 3 section-5 entries as groups, each request instantiating every member; no source uses a repeat interval (+0x20), a spawn limit (+0x14), a spawn probability below 100 or the +0x30 path; the only section-2 trigger has no spawn pairs. The scheduled enemy-class objects number 16: 12 of kind `0x80` (slot 7) and 4 of kind `0x100` (slot 8). Six of them come from the one source scheduled after the mission start. In the selected mission the success status is therefore set when the last of the 16 is destroyed or leaves the world area after all have been instantiated. The result then follows once the player is not in warp mode at a state-4 check.

**Likely (normal-play path in the selected mission):** the player destroys all 16 enemy craft. The user's identity-bound successful run ([B-003](../behavior/B-003-campaign-flow.md#成功到下一关)) shows a mission kill total of 16 with non-zero rows 12 and 4, matching the scheduled per-kind counts. Together with the only-route result above, this is consistent with that run reaching success this way. The run did not record its last event, and the row-to-counter mapping is untraced; a runtime read of the status at the final destruction would make the path Confirmed.

**Confirmed (other mission endings):** the table gives, for each route, what happens to the result word. Which of them is a true mission failure and how it is reached in normal play (U-031) are in [mission failure](#mission-failure-player-loss-and-rescue-p3-0105). Every mission starts with the result word at 0 (state 2).

| Route | Entry | Result word | Effect |
|---|---|---|---|
| Debug win | `0x282bf` → `0x33874(−1)` stores the request in `0x186838` | 1, written by `0x69c54` with EDX = 1 (no enemy check) | Handled in state 3 (outside the campaign the request is cleared): status 4, sub-state 2, state 5 → `0x335f0` |
| Debug fail | `0x33874(−2)` | 0, written in state 3 | Sub-state 2, state 5 → failure handler `0x3351c(1)` |
| Player destroyed | `0x2a694` on kind 1 → `0x32d74` (sub-state 2); the destruction sequence later reaches `0x32e14(1)` through `0x256e4` ([chain](#mission-failure-player-loss-and-rescue-p3-0105)) | Not written or read; the failure handler is called directly | Campaign: while the rescue counter is below 2, a rescue clip list, the player object restored (the [B-005](../behavior/B-005-campaign-rescue.md) rescue) and counter + 1, which is not an ending; otherwise status 4 and `0x3351c(1)`. Practice: score, high-score check `0x3b0b4`, page 8 or 5, state 0 |
| Energy depleted | `0x3071c`/`0x30994` → `0x33464`: beacon message, sub-state 1 for 0x3C0 units | As above | `0x32e14(0)`, as above with other clip variants |
| Failure handler | `0x3351c(p)`, from state 5 with result 0 or from `0x32e14` | Cleared to 0 on answer 0; not written on answer 1 | Rescue counter 0, score `0x3af04(0)`, clip list (first clip depends on p), page 0xC, prompt page 0xD (Likely; callbacks `0x367b8`/`0x367d0` store 1/0 in `0x186850`). 1: `0x330fc(0)` restarts the same mission, keeping the index. 0: campaign high score `0x3b28c(0)`, page 0xB, new-campaign reset `0x330fc(1)`, page 9 |
| End campaign | `0x367b0` → `0x33264` (campaign, states 2–5) | Cleared to 0 by `0x338e8` | Status 4 and sub-state 6, then `0x3b28c(0)`, page 0xB, `0x330fc(1)`, page 9 |
| Restart mission | `0x367a8` → `0x331f4` | Not written; cleared after page 0xF of the next state 2 | See below |
| Exit game (button identity Likely) | `0x36390` → `0x332a8` | Not written | Practice mode, next page −1; state 2 then returns 1 and the main loop exits |

Only the success handler writes a campaign statistics row: `0x335f0` is the only caller of `0x3b8dc`. The wingman-loss path (`0x32dec`, then `0x3c4bc` after 0x780 units) is not an ending.

**Confirmed (campaign restart):** callback table `0x18698c` (filled at `0x33cd5`, used by page builder `0x34c08`) holds `0x36714` (stores the page's slider value through `0x382a0`, then `0x37f54` and the new-campaign reset `0x330fc(1)`), `0x367a8` (restart, `0x331f4`), `0x367b0` (end campaign, `0x33264`) and an empty slot. In flight, key code 0x1B (Esc) posts dispatcher event 0x400 sub-command 10, which runs the page in `0x186840`: 9 during a campaign mission. That this table is the B-003 campaign settings page (new campaign, restart, end campaign, cancel and the difficulty slider) and page 9 the options page leading to it is **Likely**.

`0x331f4` acts only when the campaign flag is set and the state is 2–5; otherwise it returns 0 and changes nothing. It sets state 0, next page 9, the rescue counter and `0x186834` to 0 and the status to 4, then calls three clean-up routines (`0x2cd20`, Likely the communications text and menus; `0x55fe8`; `0x53978`). It does not write the mission index, the difficulty global, the wingman selector, the campaign statistics table (`0x185ed4`, 17 rows of 0x48 bytes, filled by `0x3b8dc` after a success, cleared by `0x3b7b8` from the new-campaign reset or the debug mission jump, and loaded by campaign loading `0x38644`) or the high-score table, and it calls neither result handler. The following frames take the normal path: state 0 → 1 retires every runtime object; state 2 repeats the first-mission clip when the index is 0, runs page 0xF with the briefing and wingman chapters and the previous selector, plays the departure clip, clears the result word, resets the per-mission counters and rebuilds the same SCCT group and slot from SCEN with a new spawn queue. Page 0xF omits the summary chapter when the restart came from state 3, where the result word is still 0. A restart in states 4–5, after the all-clear has stored 1, discards that success, but page 0xF then still enables the summary chapter with the current mission's text before the word is cleared; whether the Esc menu is usable in those states was not checked.

Evidence: ignored `local/research/p3-01/terminal/` (`ghidra_scripts/TermProbe.java`, outputs `out/p1.txt`–`out/p12.txt`, `enemy-count.ts` and `out/enemy-count-3019.json`). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; the in-memory `__watcall` overrides were discarded. Register-sensitive steps (`0x69c54` storing EDX, `0x69a70` preserving it, the event type at each `0x6977c` call, the key code 0x1B) were read from native instructions.

### Mission failure, player loss and rescue (P3-01/05)

Uses the globals and the endings table of [mission result](#mission-result-success-path-and-campaign-restart-p3-0104). Also named here: the player-state block `0x1b0638` (returned by `0x52694`; byte +0x28 view mode, +0x2A view sub-mode, +0x8C the player object, +0x90 the object the destruction view follows) and the player-destruction timer `0x174ae4`.

**Confirmed (the failure result):** `0x3351c(p)` is the campaign's mission failure handler (effects in the endings table). Unlike the success handler and the rescue, it submits clip-list entry 8 and runs prompt page 0xD; it never calls `0x3b8dc`, so a failed attempt writes no campaign statistics row, and it does not advance the mission index. A scan of the whole image finds no 32-bit occurrence of its address, so its two direct calls are its only entries:

| Caller | Condition | Reached in normal play |
|---|---|---|
| `0x32e14(p)` at `0x32f69` | Campaign, main-flow state 3, rescue counter already 2; sets status 4 first | Yes: the third loss of the player craft in one attempt (below) |
| `0x3266c` state 5 at `0x32ce1` | Result word 0 when the result delay ends | The debug fail request stores 0 directly. Otherwise state 5 follows state 4, entered only after the all-clear status, and `0x69c54` stores 0 only if `0x69a70` finds an enemy-class object in the next frame. The object whose event set the status is by then flagged dead (+0xD8, which every caller that reports a destruction sets first: `0x2a694` and the dispatcher's three event-0x800 paths) or in object state 6 (left the world, set first by `0x2f314`); the status also disables the spawn queue; and SCEN 3019's only section-2 trigger has no spawn pairs. In the selected mission this caller is therefore reached only by the debug request |

**Confirmed (player loss → rescue or failure):** `0x32e14(p)` does nothing outside main-flow state 3, so a loss after the all-clear (states 4–5) neither rescues nor fails. In practice mode it shows the practice result pages ([B-002](../behavior/B-002-practice-mode.md)). In a campaign, while the rescue counter `0x186830` is 0 or 1, it passes a clip list to `0x39f34` (entries 5, 7, 10 after a destruction, p = 1; 6, 10 after energy loss, p = 0), re-initialises the existing player object from its SCEN record with `0x67b98`, sets in-mission sub-state 0 and increments the counter. Every other object, the spawn queue, the mission status and the kill counters are left as they are, so the same mission continues. When the counter is already 2 it sets status 4 and calls `0x3351c(p)`. The counter is incremented only there and set to 0 only by the failure handler, the success handler `0x335f0`, the retry/new-campaign reset `0x330fc`, the restart `0x331f4` and the debug mission jump `0x33170`; docking, state 2 and loading a saved campaign (`0x332e8`) leave it unchanged. Each attempt at a mission therefore allows two rescues, and the third loss of the player craft in the same attempt, whether destruction or energy loss, fails the mission. `0x32e14` is the only code that restores a lost player, so the campaign rescue observed in [B-005](../behavior/B-005-campaign-rescue.md) went through this branch.

**Confirmed (rescue placement):** `0x67b98` clears the dead flag, reloads the craft record and weapon mounts (`0x2d2d8`, `0x2d400`), re-applies the record's +0x64 and +0x68 values and 100 through `0x3060c` (Likely the [scenario §3](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) percentages) and, for the player, resets the view mode to 0xC. It then counts the live objects in kind mask `0x68000` (the [interaction kinds](#bounded-slot-1-interaction-kind-evidence), Likely bases), picks one with the C library generator `0x7453b` modulo that count, writes its position plus a fixed height offset into the player record's position (+0x24–+0x2C), clears +0x44, +0x48 and +0x4C, and places the player through `0x68398`. The rescue destination is thus the live object of those kinds that `rand() % count` selects, not chosen by distance; with none left, the zero position selects the whole-world default placement, so losing every such object does not prevent a rescue. SCEN 3019 schedules four objects of these kinds (kind `0x20000`, slot 17) at the start. The rescue creates no runtime object: `0x67b98` only posts a view message through the message pool `0x52cb4`, not the object allocator `0x520d4`, so there is no in-engine rescue ship.

**Confirmed (destruction sequence):** the damage handler `0x2a694` ignores the player while the destruction view follows an object (+0x90 set) or while flag `0x174ed8` is non-zero. That flag is 0 in the image and changes only through the typed cheat-code table at `0x174ee8` (rows of 0x18 bytes), which `0x3c970` matches against keys typed in flight; its row lies beyond the first 16, which are the only rows active until the table's master toggle `0x174ed0` has been typed. In normal play the player is therefore damageable. When `0x2a830` leaves no hull, `0x2a694` flags the object dead, reports event type 0 or 1 to `0x6977c`, and for kind 1 calls `0x32d74` and the explosion constructor `0x23ac8`.

1. `0x32d74` (state 3, sub-state not already 2) sets in-mission sub-state 2 and, through `0x216d4` and `0x31094`, puts the player-state in view mode 0x11, sub-mode 8: an external camera initialised from the player object's orientation and position. This automatic view replaces the cockpit without a key press; its camera is described in [automatic views](#automatic-views-and-cameras-p3-0109).
2. For kind 1, `0x23ac8` first only arms `0x174ae4` for 0xC0 clock units. After the message loop and the movement integration of each dispatcher pass ([frame pipeline](#frame-pipeline-p3-0201)), `0x23808` calls it again for the player object when that time has passed. It then creates the explosion and, through producer `0x24d78` in mode 3, one [fragment](#effect-presentation-sources) (kind `0x1000000`, discriminator 3) per list-1 part of the player's model, except parts 1 and 2, which `0x25124` skips for kinds 1 and 2.
3. The part-0 fragment becomes the followed object (+0x90). Its update callback `0x24ac4` gives it an expiry 0x140 units ahead (other fragments get random or no expiry; a wingman's part 0 gets 0x780) and, when it expires, posts message 0x10000. The dispatcher passes that message to `0x256e4`, which, for a fragment of source kind 1, discriminator 3 and part 0, clears +0x90 and calls `0x32e14(1)`. The expiry counts from the fragment's first update. Its first state-7 update also hands the source over (message 0x2000000), which for kind 1 only posts a presentation item: the destroyed player stays in object state 4 until the rescue ([fragment lifecycle](#destruction-explosions-and-fragments-p3-0706)).

While sub-state is 1 or 2, state 3 does not poll the status: an all-clear reached during the sequence is evaluated after a rescue, and a third loss fails the mission even then.

**Confirmed (energy loss):** the energy updates `0x3071c` and `0x30994` clamp an object's energy at 0 and, for kind 1, call `0x33464`. In state 3, sub-state 0, that shows a left-display notice for 0x3C0 units (`0x4e9e8`), sets sub-state 1 and a due time 0x3C0 units later, when `0x3266c` calls `0x32e14(0)` (its test uses the previous iteration's sample; later depleted updates do not re-arm it, [C3](#c3-cross-frame-consumption-by-the-main-flow--confirmed-code)). Energy drains with weapon and shield recharge, with the commanded speed (doubled and tripled above two craft-record thresholds; the tripled cost is unreachable with shipped data) and by ×10 or ×100 under subsystem field 0 ([energy updates](#damage-subsystems-and-energy-p3-0704)). How quickly normal flight empties it was not established.

**Likely (escape pod):** the part-0 fragment is the escape pod the user identified ([B-005](../behavior/B-005-campaign-rescue.md), [mesh](./mesh.md#p2-12-viewer-comparison-v-1)). The player's model (MODL 10743, M2ID slots 0 and 1) has 7 list-1 parts. Only parts 0 and 1 name TEX 11009 (`image/model-texture/14`), the pod's texture; part 1 is never shed by kind 1, and part 0 is a small mesh (12 vertices, 8 triangles; part 1 has 108 and 132). The pod needs nothing beyond the player model's own list 1.

**Not failure routes (Confirmed):** losses of base-kind objects only set the flags `0x176744`/`0x176748` in `0x6977c`, which `0x69e1c` reads to select success summary text; the rescue has no ship or destination that can be lost; sub-state 0 polls only the status and the wingman-loss timer, which only queues a radio message ([C3](#c3-cross-frame-consumption-by-the-main-flow--confirmed-code)), so there is no time limit; a wingman's loss is not an ending; end campaign, restart and exit do not reach `0x3351c`. The debug fail request does reach it, but is not normal play.

**Selected mission:** in SCEN 3019, one section-1 record of the first enemy type (kind `0x80`) is queued at the start with two requests and names the player's record as its AI target (+0x58); that type carries gun record 2 ([weapon records](#weapon-records-and-the-first-missions-shooters-p2-1230)). The other 14 enemy-class objects keep the default target mask `0x68000` (Confirmed, data and `0x68018`). **Likely (normal-play failure path):** new campaign → mission 1 (group 0 by the difficulty, slot 1) → while the mission is in progress, the player craft is lost three times in the same attempt, most directly shot down by those two interceptors → two rescues → status 4 and `0x3351c(1)`. Support: the handler and its third-loss entry above (code); the two armed interceptors that target the player, with no damage gate outside cheats (data and code); the user's observations that a campaign destruction happens in normal play and leads to the rescue ([B-005](../behavior/B-005-campaign-rescue.md)) and that a practice destruction shows the automatic external view and then the practice failure page ([B-002](../behavior/B-002-practice-mode.md)), as `0x32d74` and the practice branch of `0x32e14` predict. Limits: those observations are not bound to SCEN 3019, and no run has shown the number of rescues before a failure. An identity-bound baseline reproduction was not obtained: on this host Computer Use cannot operate DOSBox-X's mouse-driven menus (synthetic clicks do not move the guest cursor, and keys reach it only while it is the active app). A Confirmed rule and a real-content run remain P3-11's work before P3-15.

The clip-list entries are rows of the cut-scene table that `0x39f34` reads through `0x186b30`; their files, playback and skipping are in [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108). State 2 uses entry 10 for a departure without a wingman and 12 with one, so both rescue lists end with the no-wingman departure entry.

Evidence: ignored `local/research/p3-01/failure/` (`ghidra_scripts/FailProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p14.txt`; `kind-count.ts`, `targets.ts`, `pod-part.ts`, `pod-mesh.ts` with their `out/*.json`; the coordinator's two aborted private runs `cu-recon-*/` and `cu-run1-*/`, baseline hashes unchanged). Ghidra ran `-noanalysis -readOnly` on a private copy of the project, with in-memory `__watcall` overrides that were discarded. The register-sensitive steps (the zero stored by `0x335f0` and `0x3351c`, the player object passed by `0x23808`, the dispatcher's message tests) were read from native instructions.

### Simulation time base (P3-01/06)

Static answers to T-1–T-3 of the [P3-01 spec](../../plan/p3/01/spec.md#时基研究). Everything here is read from code; the rate against an independent reference and any dependence on DOSBox-X cycles are runtime questions for P3-01/07 and B-006. "Seconds" below are therefore the timer service's nominal seconds (see the rate paragraph).

Globals, with their LE object 4 offsets for runtime reads: raw counter `0x174b10` (u32, offset `0x4b10`, initialised data); the per-frame sample `0x186414`, which is the mission clock of the two sections above (u32, offset `0x16414`); the sample in seconds `0x18641c` (f32, `0x1641c`); frame counter `0x186418` (u32, `0x16418`); step in clock units `0x186420` (u32, `0x16420`) and in seconds `0x186424` (f32, `0x16424`); pause mark `0x186428` (u32, `0x16428`); spawn-queue origin `0x176740` (u32, `0x6740`). Offsets from `0x14000` on lie beyond object 4's 20 stored pages, in its zero-filled tail.

**Confirmed (T-1, source and writers):**

- The time source is the hardware timer interrupt, through the statically linked Miles timer service. Miles installs its handler `0x877a6` on INT 8 with the DOS set-vector call after saving the previous vector (in `0x8891f`), and starts slot 15 with a period of 54,925 µs as the chain to that previous handler, which keeps the BIOS tick at about 18.2 Hz. `0x8792f` programs PIT channel 0 for the shortest registered period (`0x878fc`, `0x878cc`, mode 3). On each IRQ0 the handler adds that period, in requested microseconds (`0x17b442`), to the accumulator of every started timer and counts one pending call for each accumulator that reaches its own period, subtracting the period. It then acknowledges the interrupt and makes the pending calls, so a late callback is caught up, not lost. An IRQ0 that arrives while the handler is still running (nesting count `0x17b446`) is acknowledged and discarded for every timer.
- `0x257a0`, called once by the main-loop function `0x22d00` before its loop, starts the game's timer. It locks the 13-byte callback `0x208ea` and the counter in memory, seeds the C library generator from the DOS time of day (`0x74e5c`, INT 21h function 2Ch; `0x7455f`), sets the raw counter to `rand() % 30000` and registers `0x208ea` through `0x53abc` at frequency 32. `0x53abc` calls `AIL_register_timer`, `AIL_set_timer_frequency` and `AIL_start_timer`, named by the library's own trace strings; the frequency becomes a period of 1,000,000 ÷ 32 = 31,250 µs (`0x880e0`). `0x174b14` points to the 12-byte record it allocates: {callback, 32, Miles handle}. The callback increments the raw counter twice, so it advances by 2 at each call.
- Only three places write the raw counter: that initialisation, the callback and the resume half of `0x258f8` (pauses, below). Shutdown `0x25848` (from `0x23018`) releases the timer. `0x2591c` would release or re-register it, but neither a call nor a pointer to it exists in the image. No code reads the BIOS tick count or calls INT 1Ah. Only `0x257a0` and `0x25894` write the sample: a byte scan of the image finds every other occurrence of its address to be a read, including those in code Ghidra had not disassembled.
- The counter therefore changes in steps of 2 (1/32 s), and its parity never changes after initialisation.

**Confirmed (T-2, how the simulation advances): one variable step per frame.**

- The main loop `0x22d00` repeats `0x3266c` (mission flow), `0x25894` (sample), `0x20938` (every object's update callback), `0x20d10` (the spawn-queue check `0x67018`, then the message loop, then once the movement integration `0x221fc` and the periodic systems; the full order is in [frame pipeline](#frame-pipeline-p3-0201)) and `0x3ee58` (frame render). Apart from one extra sample at mission start (below), each of these has only that one caller, so they run once per iteration.
- `0x25894` copies the raw counter into the sample and stores the difference from the previous sample in `0x186420`, which nothing reads. It stores counter × 1/64 as f32 seconds in `0x18641c` (constant `0x170d04`; `0x170cfc` at initialisation) and the difference of the seconds in `0x186424`, and increments the frame counter, which nothing else reads. Mission state 2 calls it once more after building the mission (`0x328da`), so the build and the clips before it do not enter the first step in flight.
- The step is the whole elapsed time. No code clamps `0x186424`, and its seven readers integrate with it directly: position from velocity, speed towards its target at the craft's rates, and turns as rate × step (`0x222f0` and `0x22600` for craft, `0x22818` for gun projectiles and explosions, `0x2285c` for fragments, `0x25b0c` and `0x2b00c` for a new projectile's spawn offset, `0x50508` for Warp progress). `0x2285c` uses the step only for the translation: a fragment turns by a fixed angle per frame, so its spin rate follows the frame rate ([H1](#h1-movement-modes-and-their-users--confirmed-code)). There is no sub-stepping and no upper limit on the advance in one frame.
- Every step is a multiple of 1/32 s. When frames run faster than 32 per second, some frames have a step of 0: nothing moves, but behaviours, due-time checks and rendering still run.
- Other timing compares the sample with a stored due time, so a delay ends at the first frame whose sample has passed it. The flow, HUD, effect and speed-assist delays in the table below are re-armed from the sample at which they fire, with no catch-up. A spawn-queue repeat (+0x20) is instead added to the entry's previous due time, so overdue repeats are all processed in the same frame (`0x67018`).
- A runtime reader that stops at `0x22e48`, the instruction after the main loop's call to `0x25894`, sees the sample, both step fields and the frame counter of the same frame. The extra call at mission start is the only other sample.
- **Likely (no frame limiter):** the only vertical-retrace waits are in mode setting, palette loading and the screen-flash effect `0x48e6c`, which waits only while that effect is active, and INT 10h appears only in mode setting. The frame rate is therefore set by processor speed. Bounded search: port `0x3DA` reads and INT 10h calls.

**Confirmed (T-3, units and consumers):** the clock unit is 1/64 s: the callback adds 2 at 32 Hz, and `0x25894` converts with 1/64. The simulation step and mission scheduling use this same clock, and so does every consumer below.

| Consumer | Clock use | Conversion |
|---|---|---|
| Simulation step | `0x186424` = Δsample ÷ 64 | Seconds |
| Mission scheduling | Elapsed = sample − `0x176740`. The mission builder `0x66c00` is its only writer and takes the sample current when it runs, which was taken before state 2 began: the state-2 clips and the build count as elapsed mission time, the pages do not (below). An entry is due once elapsed exceeds its time (`0x67018`, every frame) | [Scenario §3](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) +0x1C, +0x20 and +0x34 are shifted left by 6: seconds × 64 |
| Mission-flow delays ([mission result](#mission-result-success-path-and-campaign-restart-p3-0104), [mission failure](#mission-failure-player-loss-and-rescue-p3-0105)) | Due = sample + delay | 0xC0 = 3 s, 0x140 = 5 s, 0x3C0 = 15 s, 0x780 = 30 s |
| [DIAG](./hud.md#diag-10489-confirmed-structure-p2-07-revision) typing and hold | `0x4f108`: next = sample + interval | The DIAG timings +0x00–+0x0C are clock units. The hold ends at the sample when typing finished plus the hold time. At most one character per frame, so the typing period is the interval rounded up to frame boundaries. `0x4d0e0` also toggles the flag it passes to the status-overlay routine `0x4d50c` every 0x20 (0.5 s) |
| Left display refresh and [interference](./hud.md#snip-10487-confirmed-structure-p2-1227) | `0x4ce30`: a page redraws once the sample exceeds its last draw's sample plus the page's period (table `0x175c7c`, +8: 0, 0x10 or 0x40, so 0–1 s; 0 means whenever the sample has advanced). In damage state 1 it switches at sample + 64 + (rand & 63) | 64–127 units = 1–1.98 s. `0x4d010` shows SNIP frame ((sample − start) × 12) >> 6, modulo the frame count: 12 frames per second |
| Right display interference | `0x42d80`, the same switching rule | As above |
| Explosion fragment events (`0x23838`) | For a craft source, due 8, 12 and 16 units after the explosion's first update. Other sources get at most a mode-0 event (which creates nothing) 8 units after it, in one case in three; one without a source kind first waits a random 0–20 units before its event 0x200 | 0.125, 0.1875 and 0.25 s; 0–0.31 s |
| Player destruction and fragment expiry ([mission failure](#mission-failure-player-loss-and-rescue-p3-0105)) | As mission-flow delays | 0xC0 = 3 s; 0x140 = 5 s; a wingman's part 0, 0x780 = 30 s |
| Speed assist `0x27f68` ([difficulty readers](./scenario.md#difficulty-readers-p3-01)) | Re-armed at sample + 0x20 after each speed match | 0.5 s |

Owners for the exact behaviour of these consumers: spawn timing P3-02; movement and the speed assist P3-06 (mission-relative and instantiation-relative times for runtime readings: [initial flight state](#initial-flight-state-p3-0605)); fragment timing P3-07 and their drawing P3-12; mission-flow delays and rescue P3-11; HUD, DIAG and displays P3-13; pausing P3-04.

**Confirmed (pauses and cut-scenes):** `0x258f8(1)` records the raw counter in `0x186428`. The counter keeps running, and `0x258f8(0)` then subtracts the increase since that mark, so the next sample excludes the paused interval, to within the phase of one callback (2 units). It brackets every menu page run by `0x32fec`, including page 0xF in state 2 and the in-flight Esc page, and the pause key: in each of the four flight key contexts (`0x264a0`, `0x27118`, `0x271e0`, `0x27360`) `p` pauses the game until `p` or `P` is typed, and the time is removed the same way. The cut-scene player `0x39f34` has no clock control, and the game's timer runs for the whole session. Clips therefore count as time: those of state 2 as elapsed mission time, as above; a rescue clip list, played inside a frame by `0x32e14`, enters the next frame's step and the mission time in one piece. Not observed at runtime.

**Other time sources (Confirmed, not simulation):** the Smacker player uses its own Miles timer and reprograms and reads PIT channel 0 directly (`0x20100`, `0x200a0`, `0x202a0`, `0x20700`). `0x74e5c` returns the DOS time of day in 1/100 s; besides the seed it is used by page animation in the page dispatcher (`0x35158`), a disk-speed probe (`0x3cc48`) and a diagnostic print (`0x2637f`). The resource layer is given a getter of the raw counter (`0x65de4`, passed to `0x6abc0`); its use was not traced.

**Rate (code expectation for P3-01/07):** 64 units per nominal second of the timer service. Miles converts a period to PIT counts with ×10000 ÷ 8380 (`0x878fc`), while the PIT counts at about 1,193,182 Hz, so a nominal second lasts slightly longer than a guest second. When the game's 31,250 µs period sets the PIT, the raw counter should advance by 63.993 units per guest second if no IRQ0 is discarded. A faster Miles timer, such as an audio driver's, sets the PIT instead and changes this slightly through the truncation of its PIT count; in flight a 2,000 µs timer sets it (runtime cross-check below). The BIOS tick count (linear `0x46c`), driven by slot 15 from the same accumulators, keeps a fixed ratio of 2 × 54,925 ÷ 31,250 = 3.5152 raw units per tick whatever the PIT period. It therefore checks the callback accounting but cannot reveal discarded interrupts, which affect both counts. How guest time relates to host time at a given cycles value is not set by the code.

**Runtime cross-check (P3-01/07):** four complete measurement runs in the selected mission, two at fixed 40000 cycles and two at 20000. The mission was campaign mission 1 (group 0 / slot 1) at raw difficulty 19 with wingman selector 1, in the cockpit view. Each window is one uninterrupted emulator run between two debugger stops in flight, and emulated time is DOSBox-X's PIC clock at the stops. Method, error budget, statistics and the cycles decisions are in [B-006](../behavior/B-006-simulation-timing.md).

- **Confirmed (agrees with the code above):**
  - At all 16 stops (24 window ends) the raw counter equalled the frame's sample, and over each window the sample advanced exactly as the raw counter did.
  - Steps were even.
  - The f32 seconds equalled the sample ÷ 64.
  - The pause mark, the spawn-queue origin and the rescue counter stayed constant.
- **Confirmed (runtime, Miles timers in flight):** four Miles timers run in flight:
  - the game timer (its record's handle selects the third entry, 31,250 µs);
  - slot 15 (the 54,925 µs BIOS chain);
  - two timers of 5,000 µs and 2,000 µs, whose owners were not traced. The 200 Hz Smacker timer of [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108) has the 5,000 µs period; whether this is that timer was not checked.

  The PIT therefore runs at 2,000 µs, and the no-loss expectation is 64.010 raw units per emulated second.
- **Measured rate:** below that expectation in all 12 windows, and by more than the per-window resolution in 11 of them:
  - 63.95–63.99 in one 40000 run (−0.03 to −0.09 %);
  - 61.97–63.59 in the other, falling from window to window while the CPU cycles per frame rose (a load effect is Likely; load was not controlled);
  - 61.26–61.29 in all six windows at 20000 (−4.3 %).

  The pre-registered rate criterion was therefore not met.
- **Likely cause (not quantified):** some IRQ0s produce no callbacks.
  - The handler accumulates every timer, sends the end-of-interrupt and re-enables interrupts (`0x8782d`) before making the due callbacks. An IRQ0 that arrives during the callbacks is a nested entry and is discarded for every timer (above).
  - With a 2 ms PIT period, this happens whenever the callbacks of the two faster timers and the game timer take longer than 2 ms. That time grows as cycles fall.
  - Requests merged at the interrupt controller while interrupts are disabled elsewhere are another possible path.
  - The share of each path, and whether they account for the whole deficit, was not measured.
- **Consequence:** the game clock keeps its own 1/64 s conversion, but runs slower than emulated time. Its dependence on cycles passed the pre-registered rule against emulated time; against host time the rule did not detect it (resolution). By the user's decision of 2026-10-09, P3-01 accepts the time base on the structural relations above. The rate shortfall is a cycles-dependent result handed to U-021, not a pass of the pre-registered rate criterion.
- **Other relations:** emulated time kept pace with host time at both settings within the measurement bound. The frame rate (about 30 and 13 per emulated second) and the mean step (about 2.1 and 4.8 units) depend on cycles.

Evidence: ignored `local/research/p3-01/timing/` (`ghidra_scripts/TimeProbe.java`, `probe.sh`, outputs `out/p1`–`out/p50`). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Register and stack arguments, the Miles API names (the library's trace strings) and the conversion constants were read from native instructions and data, and direct calls to the timer helpers were checked by a raw scan of relative call targets.

### Cut-scenes and loop transitions (P3-01/08)

Static answers to the transition-media questions of the [P3-01 spec](../../plan/p3/01/spec.md#衔接媒体). Uses the globals of [mission result](#mission-result-success-path-and-campaign-restart-p3-0104) and [mission failure](#mission-failure-player-loss-and-rescue-p3-0105). Nothing here was observed at runtime; the matching user observations are in the behaviour documents linked at the end.

**Confirmed (the cut-scene table, data and code):** the start-up routine `0x39e74` (listed in the initialisation table at `0x174940`) loads `CINC` entry 10095 of `SR.NOB`, the archive's only `CINC`, into `0x186b30`. The block is {u32 pointer to the rows, u32 row count, 36}, then 36 rows of 12 bytes {u32 pointer to a NUL-terminated path, u32 `SONG` entry ID or 0, u32 passed to the music start routine, 0 in every row}, then the paths; its 37 relocations are the rows pointer and the 36 path pointers. The loader replaces the first two characters of every path with the CD drive letter and a colon. Start-up finds that letter by locating `FLICS/GARBSHIP.SMK` (`0x6bdc0`) and exits with an error when no drive has it. The loader also clears `0x174e54`, which is 1 in the image, so without the table no clip ever plays. The loop walks a fixed 36 rows rather than reading the count. The rows name these [manifest](../manifest.md) files:

| Rows | Files (`FLICS/`, `.SMK`) |
|---|---|
| 0–8 | `IMLOGO`, `INTRO`, `C-INTALL`, `LANDING`, `LAUNCH`, `RESCUE`, `NOGAS`, `CHEWOUT`, `GARBSHIP` |
| 9–12 | `FLYTO`, `FLYFROM`, `WFLYTO`, `WFLYFROM` |
| 13–19 | `MEDLLOSS`, `T-TRANS`, `DIPLOMAT`, `BASELOSS`, `TRADFLIC`, `INTEL`, `SETTLERS` |
| 20–26 | `MAIN-MDL`, then `MEDAL05`, `MEDAL01`, `MEDAL02`, `MEDAL06`, `MEDAL04`, `MEDAL03` |
| 27–33 | `PROMO01`, `PROMO03`, `PROMO04`, `PROMO05`, `PROMO06`, `PROMO07`, `PROMO08` |
| 34–35 | `ENDALL`, `CREDITS` |

`FLICS/PROMO02.SMK` is the only file of the directory that no row names. Rows 0, 1, 5–7, 13–20, 34 and 35 carry a `SONG` ID (rows 5 and 6 share 10753, rows 17–19 share 11267, row 7 uses 10093). While such a row plays, `0x39f34` loads that entry (`0x6affc`, `0x6a024`), starts it as music and afterwards stops and releases it. Every file is a Smacker version-2 file of 320 × 240 according to its header.

**Confirmed (the player `0x39f34`):** EAX points to a list {i32 count, then one byte per entry, each a row number}; EDX holds flags: bit 1 forces playback when cinematics are off, and bit 0 restricts the skip key.

- It returns at once, playing nothing, when the table did not load, or when the cinematics setting `0x1863c0` is 0 and flag bit 1 is clear. The setting is option 2 of the option getter/setter `0x381ac`/`0x382a0`, read from the `SRANGER.CFG` key `CINEMATIC` by `0x37ed0`: the off value or a boolean false gives 0, the low-resolution value or a boolean true gives 1, and any other value gives 2; the configuration writer `0x380d8` writes 0, 1 and 2 back as the off, low-resolution and high-resolution values. The baseline configuration holds the high-resolution value (2). Whether the settings page can select 0 was not traced.
- Otherwise it empties the keyboard buffer, switches the display to 320 × 240 for setting 1 or to 640 × 480 for setting 2 when it is not already in that mode, and plays the entries in list order. A file that cannot be opened (`0x79100`) is passed over without any other effect.
- Playback is paced by the Smacker library's own wait (`0x786d0`, `0x777d0`). The library registers a separate Miles timer of 200 Hz when the first file opens and releases it when the last one closes (`0x208b0`, `0x20100`, `0x20060`).
- After each frame it polls the keyboard through DOS (`0x754e7`, `0x754fe`: INT 21h functions 0Bh and 08h). With flag bit 0 clear, Esc, Enter or Space ends the current entry; with it set, only Ctrl+W (code 0x17) does. Any other key is read and dropped. The skip ends only the entry being played: the next entry of the list starts normally and needs its own key press. Nothing records a skip, and no caller's code after the list depends on it.
- At the end it restores the previous display mode and empties the keyboard buffer again, so keys typed during a clip never reach the game.
- It has no clock control ([time base](#simulation-time-base-p3-0106)), and no main-loop frame runs while a list plays: no object update, spawn processing, message dispatch, game input or rendering. The game timer keeps counting. While the 200 Hz Smacker timer is registered, the PIT runs at its shorter period; the [time base](#simulation-time-base-p3-0106) rate paragraph explains why that can change the counter's rate slightly. Whether it does was not established.

**Confirmed (every caller):** `0x39f34` has ten direct calls and no 32-bit address reference anywhere in the image; the Smacker library's open, frame, wait, next-frame and close entry points are called only from `0x39f34`. No other code plays a `FLICS` file.

| Call site | When | Entries (rows) | Flags |
|---|---|---|---|
| Main loop `0x22d00` (`0x22e13`) | Start-up, before the main loop | 0, 1 | bit 0 when `0x37d18` returns 1 (not traced) |
| `0x3266c` state 2 (`0x32765`) | Campaign only, mission index 0, before page 0xF | 2 | none |
| `0x3266c` state 2 (`0x327da`) | Campaign only, after page 0xF, before `0x66c00` builds the mission | 10 when the wingman selector is 0, otherwise 12 | none |
| `0x38ff4` sub-command 0 (`0x39180`) | Docking (below) | 3 | none |
| `0x38ff4` sub-command 4 (`0x392ea`) | Launch (below) | 4 | none |
| `0x32e14` (`0x32ecd`) | Rescue, before the player object is restored | 5, 7, 10 after a destruction; 6, 10 after energy loss | none |
| `0x3351c` (`0x3355c`) | Failure, before page 0xC | 5 (p = 1) or 6 (p = 0), then 8 | none |
| `0x335f0` (`0x336a8`) | Success, before page 0xC | Built as below | none |
| `0x335f0` (`0x336f4`) | After page 0xC of the 17th mission | 10, 34 | bits 0 and 1 |
| Page callback `0x363a4` (`0x363c2`) | A menu button whose callback table (`0x1869c0`) also holds the exit-game callback `0x36390` | 35 | none |

Practice mode plays nothing in state 2: both state-2 calls require the campaign flag. In the selected mission (mission index 0), state 2 therefore always plays row 2, then page 0xF, then row 10 or 12, at every start, every retry from the failure prompt and every restart.

**Confirmed (the success list):** `0x335f0` builds its list in this order.

1. Row 9, or row 11 when `0x3af04(1)` returns 1. That happens when the first object of the kind-2 list (the wingman, see [scenario §4](./scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)) exists and its byte +3 is at least 7, the same test under which `0x3af04` adds its bonus for each surviving base-kind object. The departure variant follows the selector; the return variant follows the wingman object at the end.
2. When the summary selector byte `0x186864` is positive, the row with that number. `0x69c54` copies it from byte +0x10 of the section-2 trigger range that selected the summary text ([mission result](#mission-result-success-path-and-campaign-restart-p3-0104) step 3); the statistics row keeps it as `0x186864` − 13 at +0x2C, and `0x335f0` adds 13 back. Across the 52 missions the byte is 0 or 13–19. In SCEN 3019 the only trigger is referenced by the base-kind record (kind `0x20000`, four objects), and only its first range (ratio 99–100) carries a row, 16 (`BASELOSS`); its other two ranges carry 0.
3. For each of the six medal flags of the new statistics row (+0x30 to +0x44) set by `0x3b8dc`: row 20 once, then row 21 + the medal index.
4. When the row's promotion byte (+0x2E) is not 0xFF: row 20 unless already added, then row 27 + the new rank (+0x2D).

`0x3b8dc` considers medals and promotion only when +0x2C is −1, that is, when step 2 added no row; promotion also requires a mission index of at least 2. The conditions for the individual medals and for promotion were not traced further. In the selected mission, then, the list is row 9 or 11, followed either by row 16 or by any medal rows; promotion rows cannot occur there.

**Confirmed (docking and launch, `0x38ff4`):** the dispatcher `0x20d10` passes messages of type 0x400000 to `0x38ff4`, which switches on the sub-command at +0x10 (table `0x38fe0`).

1. Choosing communications command 9 in the flight key handler (`0x27b44`) calls `0x333b4`: in-mission sub-state 3, with a limit 0x780 units (30 s) ahead. The addressed object's handler `0x3bed0` then queues a reply (Likely a communications message) whose callback `0x333d4`, if sub-state 3 is still current, sets sub-state 4 with a delay of 0x200 units (8 s). Sub-states 3 and 4 return to 0 when the player's target object (+0x194 of the player object) is no longer valid or its byte +3 is below 7; sub-state 3 also returns to 0 at its limit. When sub-state 4 is due, `0x3266c` posts sub-command 0 and sets sub-state 5. During sub-states 3 and 4 the player stays in flight with the current view and key context; no clip plays.
2. Sub-command 0 (dock) proceeds only when `0x3959c` returns the player's target object, otherwise sub-state 0. It saves the player's orientation and position, sets the player object's byte +2 to 3, docks a wingman whose byte +2 is 1 if it lies within a fixed distance (`0x39820`), plays row 3, loads TABL 10165, sets view mode 6 and calls `0x39664`.
3. View mode 6 uses key context `0x271e0`, polled every 4 clock units (16 elsewhere). Two selection keys post sub-commands 1 and 2, Enter posts 3 (the selected base action, `0x39cb4`), `l` or `L` posts 4, Esc posts the options-page request, and `p` pauses. In sub-state 5, `0x3266c` posts sub-command 4 by itself when the target object fails the sub-state 3–4 test.
4. Sub-command 4 (launch) calls `0x4f4e0`, plays row 4, sets the player's byte +2 back to 1, sets the view mode from player-state byte +0x29 (at least 0xC), returns docked wingmen to state 1, places the player from the saved orientation and position, releases TABL 10165 and sets sub-state 0 (`0x3340c`).

The base interior is view mode 6 of the running main loop, not a clip and not a menu page; neither the pause routine nor a page runner is called on this path. The movement of docked objects was not traced. Docking rules (range, base conditions, repair and supply) belong to P3-10.

**Confirmed (Warp, no clip):** no clip plays at the start or the end of a Warp. The Warp start `0x2be00` (message 0x400 sub-command 0) checks the minimum interval since the previous Warp (craft record +0xA4, in seconds) and the energy cost, posts sound 10401 ([audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08)) and leads to view mode 1, the warp mode of [mission result](#mission-result-success-path-and-campaign-restart-p3-0104) step 4. The dispatcher saves the current view mode in player-state +0x29 before setting mode 1 (`0x3f158` switches the view). Warp progress `0x50508`, called from the frame render `0x3ee58`, advances with the simulation step. After the message loop of each dispatcher pass, `0x2bf08` checks the progress; once it reaches 1 it restores the saved view mode (mode 8 becomes 0xC), switches the view back and sets the player's position at the destination with a random offset. The key context follows the view mode (`0x26284`): mode 6 uses `0x271e0`, mode 8 uses `0x27118`, modes 0–3 use `0x27360`, every other mode uses the flight handler `0x264a0`. `0x27360` handles only `p` (pause), `i`/`I` and `|`, so in warp mode every other keyboard command is ignored, including `m`, `c`, `t` and Esc. Warp mode is a running state of the main loop, not a pause. The arrival position, its error and the energy cost remain U-026.

**Confirmed (clip time against simulation time),** with the [time base](#simulation-time-base-p3-0106): a list's playing time is not removed from the mission clock.

- Rows 2 and 10/12 play in state 2 before the mission is built. Their time counts as elapsed spawn-queue time but is not part of the first step in flight. In SCEN 3019 every queued source except one section-5 group is due at time 0. That group's time is far longer than the nominal lengths of rows 2 and 10 together (below). The clips therefore do not change which objects exist in the first frame of flight; the time spent in them, whether watched or skipped, shortens the wait in flight for that group.
- Rows 3 and 4 play inside the dispatcher, and the rescue lists play inside `0x32e14`. The following frame's step and the spawn clock include the whole list's time in one piece, with no clamp, so every moving object advances by that step and due spawn entries are released. For the energy-loss rescue, which `0x3266c` runs before the frame's sample, that is the same main-loop iteration; for the escape-pod rescue in the message loop it is the next one ([C3](#c3-cross-frame-consumption-by-the-main-flow--confirmed-code)).
- The success and failure lists play after the status is 4, when spawning has stopped. Frames then pass through states 0 and 1, which retire every object.
- Skipping, setting 0 and an unreadable file all shorten that time and nothing else. Zero clip time is therefore a state of the original itself.

Nominal lengths are frame count × frame interval from each file's header, not measured: row 2 about 14 s, row 3 about 24 s, row 4 about 8 s, rows 5, 6 and 7 about 19, 21 and 6 s, row 8 about 29 s, rows 9–12 about 14 s each, row 16 about 9 s, row 20 about 20 s, each medal and promotion row about 5 s.

**Engine parts of the same transitions:** the destruction sequence and its external view (view mode 0x11, [mission failure](#mission-failure-player-loss-and-rescue-p3-0105)), the energy-beacon wait, the all-clear message and the result delays ([mission result](#mission-result-success-path-and-campaign-restart-p3-0104)), the docking countdown, the base interior (view mode 6) and the whole Warp (view mode 1) are drawn by the engine. The timed ones end at due times that `0x3266c` or the dispatcher checks every frame, and none of them calls the pause routine `0x258f8` (whose only callers are the four key contexts' `p` and the page runner `0x32fec`) or a page, so the main loop, object updates and the clock keep running through them; the spawn queue keeps running until the status becomes 4. Keys go to the context of the current view mode, but only while the player craft is not destroyed: during the destruction sequence its dead flag stops the polling of game keys ([input polling](#input-polling-p3-0201)); during the energy-beacon wait and the result delays they go to whichever context the player's current view selects. What the flight commands do while the craft is out of energy was not traced. The views and cameras of these phases are in [automatic views](#automatic-views-and-cameras-p3-0109).

Evidence: ignored `local/research/p3-01/transitions/` (`ghidra_scripts/TransProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p40.txt`; `cinc.ts`, `scen-clips.ts`, `trigger-refs.ts`, `spawn-times.ts`, `smk-meta.ts` with their `out/*.json`, which hold file names, entry IDs, small selector values, counts and header metadata only). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. The list bytes, the flag bits and key codes, the success-list conditions, the docking jump table, the key-context switch and the Warp entry and exit were read from native instructions and data; callers were checked by raw scans of relative calls and of 32-bit values. Behaviour: [B-003](../behavior/B-003-campaign-flow.md#出发与任务结束的衔接p3-0108), [B-004](../behavior/B-004-base-communications.md#入港与离港的衔接p3-0108), [B-005](../behavior/B-005-campaign-rescue.md#被毁救援与失败的衔接p3-0108), [B-001](../behavior/B-001-strategic-map.md#warp-的衔接p3-0108).

### Automatic views and cameras (P3-01/09)

Static answers to the automatic-view question of the [P3-01 spec](../../plan/p3/01/spec.md#视角范围): which engine views and cameras the loop's transitions use, apart from the Smacker clips of [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108). Uses the player-state block of [mission failure](#mission-failure-player-loss-and-rescue-p3-0105) (`0x1b0638`: +0x28 view mode, +0x29 previous view mode, +0x2A view sub-mode, +0x8C player object, +0x90 the object the destruction view follows). Nothing here was observed at runtime; the screenshot correspondences are in the behaviour documents linked at the end.

**Confirmed (switching views):** `0x3104c` stores the new view mode in +0x28 and the old one in +0x29; entering 0x11 from another mode clears the sub-mode. `0x216d4(object, mode, sub-mode)` calls it. For mode 0x11 it then sets the sub-mode through `0x31094`; a negative sub-mode selects the next one through `0x31168`, which cycles over 0–8 (count 9 at `0x174c00`) and skips 8. It also posts a renderer message that `0x3d9f8` handles: for mode 0x11 the player's own model is added to the scene, for every other mode it is removed (roles Likely). `0x3f158(new, old)` switches the display: for the new mode it selects a cockpit layout through `0x49848` and sets up the map, base and Warp screens. A whole-image scan for byte stores at +0x28 and +0x2A and raw call scans of `0x3104c`, `0x216d4`, `0x31094` and `0x3f158` find only these writers of the view mode:

| Writer | When | New view mode |
|---|---|---|
| Object instantiation `0x67938` (player kind, also sets +0x29) and main-flow state 2 at `0x32842` (after building the mission) | Mission start | 0xC |
| Flight key handler `0x264a0` → message 0x400, sub-command 0xC–0x12 → dispatcher `0x20d10` → `0x216d4` | View keys (below) | The key's mode and sub-mode |
| `0x32d74` → `0x216d4` | The player craft is destroyed (state 3, sub-state not yet 2), unless the view is already 0x11/8 | 0x11, sub-mode 8 |
| `0x67b98` (sets +0x28 and +0x29) and `0x32e14` | Rescue, after its clip list | 0xC |
| `0x38ff4` sub-command 0 → `0x216d4` | Docking, after the docking clip | 6 |
| `0x38ff4` sub-command 4 → `0x216d4` | Launch, after the launch clip | +0x29, at least 0xC |
| Dispatcher, message 0x400 sub-commands 8 and 9 | `m` opens the map when `0x33504` allows it; closing it | 8; then +0x29 |
| Dispatcher, sub-command 0 | Warp start accepted by `0x2be00` | 1 |
| `0x2bf08`; dispatcher sub-command 2 (sender not traced) | Warp end | +0x29, with 8 becoming 0xC |
| `0x334bc` | Main-flow state 0, before the teardown | 0x13 |
| `0x3f500` | A display-resolution change made on the options page | 0xC |

The energy-loss handler `0x33464`, the beacon wait, the all-clear wait and result delays, the docking countdown (sub-states 3–4), the failure handler and the pages change no view. None of the writers reads the mission number or SCEN data, and `0x32d74` does not test the campaign flag, so the views of the loop are the same in every campaign mission, the selected one included. Across the loop, the destruction view is therefore the only automatic view whose camera differs from F1's: the departure and the rescue end in 0xC; the docking countdown, the beacon wait and the success waits keep the current view; the base interior and the map draw no world; and the Warp uses the F1 camera pose (below).

**Confirmed (view keys by key context):** the key context follows the view mode (`0x26284`, see [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108)). Of the four key contexts, only the flight handler `0x264a0` has view keys; it serves every mode except 0–3 (the Warp handler), 6 (base) and 8 (map). The destruction view also selects it, but no game key is polled while the player craft is destroyed ([input polling](#input-polling-p3-0201)). The DOS key reader `0x75048` turns F1–F10 into codes 0x96–0x9F and the extended cursor scan codes into 0x80–0x8C (table `0x74f30`).

| Key | View mode, sub-mode | Cockpit layout (`0x3f158`) |
|---|---|---|
| F1; Up | 0xC | 0 |
| F2; Home | 0xD | 5 |
| F3–F8 | 0x11, sub-modes 0–5 | 8 |
| F9 | 0x11, sub-mode 7 | 8 |
| F10 | 0x11, sub-mode 6 | 8 |
| PgUp | 0x11, the next sub-mode (8 skipped) | 8 |
| Right; Left; Down; keypad centre | 0xE; 0xF; 0x10; 0x12 | 3; 2; 1; 4 |

Several Ctrl combinations produce the same extended codes. P3-06/02 settled the open question of U-011: the cursor keys reach this handler in flight as view keys, no key context writes a steering field, and the original has no keyboard steering ([flight controls](#flight-controls-and-rotation-p3-0602)). The map handler `0x27118`, the Warp handler `0x27360` and the base handler `0x271e0` handle no view key, so the view keys do nothing in the map, during a Warp and in the base; the base handler's two selection keys are the Up and Down cursor keys. No key selects sub-mode 8. The other layouts are: Warp (mode 1) 0, base (mode 6) 0, map (mode 8) 6, teardown (0x13) none. `0x49848` selects the CCKD slot whose directory +0x00 equals the layout number ([cockpit](./cockpit.md#group-directory-confirmed-structure-on-all-three-entries)).

**Confirmed (cameras and what each view draws):** the dispatcher calls `0x21584` once per pass, after its message loop; while the player state holds a player object (+0x8C), it calls `0x30ef0`. For mode 0x11 that takes a camera function from `0x174bdc` by sub-mode (nine entries; sub-mode 8 is `0x31bdc`); for mode 8 it runs `0x2b8ec` (Likely the map's visibility messages) and has no camera function; for every other mode it takes one from `0x174b88` by mode. Modes 0xC and 0xD use `0x31400`, which keeps the camera at the player craft's own position and orientation; modes 0xE, 0xF, 0x10 and 0x12 have their own functions (`0x31424`, `0x314ac`, `0x31524`, `0x315bc`; the first three reorder the craft's rows, [C1](#c1-the-3d-camera-and-its-readers--confirmed-code)); modes 0–0xB and 0x13 have none. Without a function the camera takes the craft's position and orientation as well, so at this step the Warp mode 1 places the camera exactly as F1 does; the render's Warp view then overwrites the camera and the player's pose ([C1](#c1-the-3d-camera-and-its-readers--confirmed-code)). The camera functions also store a 0–100 value at `0x1b0758`, the viewed object's speed as a share of the player craft's +0xB8, read only by a HUD overlay; it is 0 without a function. The frame render `0x3ee58` then draws by mode:

| View mode | Drawn |
|---|---|
| 0xC, 0xD, 0x11 | The world and the overlay routines `0x488b4`, `0x44f00`, `0x493d8`, `0x3d318`, `0x456e4`, `0x489d0`, `0x49004` and `0x45de0`; in mode 0x11, `0x45de0` draws the view label (below) |
| 0xE, 0xF, 0x10, 0x12 | The same without `0x456e4` |
| 1 (Warp) | The world and the Warp effect (`0x50508`, `0x505cc`), but none of those overlay routines; `0x3f158` switches the left display to page 6 on entry and back on exit (`0x4cdf0`) |
| 6 (base) | The base screens (`0x4f524`, `0x4f550`) inside layout 0; the scene routine `0x3d4e4` is passed 0x13 and draws no world |
| 8 (map) | The map; `0x3d4e4` draws no world |
| 0x13 | Nothing |

Which HUD elements each overlay routine draws in each mode belongs to P3-13.

**Confirmed (the destruction view, mode 0x11 sub-mode 8):**

- **Entry:** `0x31094` copies the player craft's orientation and position into the camera (`0x186514`–`0x186534`, `0x1864e4`–`0x1864ec`), rotates the orientation by 32° (0.5585 rad, `0x228cc`) about the axis of its first row, marks the follow distance `0x1864e0` as unset (−1) and records the time in seconds (`0x186538`, from `0x18641c`). The renderer message adds the player's own model (Likely, above), and layout 8 has no elements: the whole screen is the external view.
- **Before the explosion** (+0x90 empty; the explosion is due 0xC0 clock units after the hit, see [mission failure](#mission-failure-player-loss-and-rescue-p3-0105)): `0x31bdc` sets the camera position to the craft's current position plus the camera's third orientation row times −30 × the seconds since entry, with the entry orientation, so the camera recedes from the craft at 30 units per nominal second.
- **Following the escape pod** (+0x90 is the part-0 fragment, which expires 0x140 units later): each pass it turns the camera towards the fragment, rebuilds the other two axes from the previous ones by cross products, sets the distance to the current one when it is unset and then moves it a quarter of the way towards 30 units, and places the camera at that distance from the fragment along the view direction. The easing is per dispatcher pass, so it depends on the frame rate ([time base](#simulation-time-base-p3-0106)).
- **Label:** in mode 0x11, `0x45de0` draws the label of the current sub-mode at the top-left corner (position from `0x459a0`) with the text drawer `0x59f90`. The labels are rows of `TABL` 10399 of `SR.NOB`, which `0x45420` loads through `0x6affc` when it is not yet loaded and keeps in `0x175984`, indexed by the sub-mode (indices 0–8); the entry holds 13 string pointers, and the use of indices 9–12 was not traced.
- **Exit:** the fragment's expiry clears +0x90 and calls `0x32e14` in the same pass. In a campaign the rescue clip list follows and the view becomes 0xC; a third loss goes to the failure clips and pages, and state 0 then sets 0x13. No key leaves the destruction view: the player's update polls no game keys while the craft's dead flag is set, from the hit until the rescue clears it ([input polling](#input-polling-p3-0201); this corrects the earlier reading that F1, F2 and the other view keys switch away from it). The destruction sequence and its end do not depend on the view, and the rescue sets 0xC. No key or cycle returns to sub-mode 8 before the next loss.

Evidence: ignored `local/research/p3-01/views/` (`ghidra_scripts/ViewProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p34.txt`; `labels.ts` and `cckd-ids.ts` with `out/labels-10399.json` and `out/cckd-ids.json`, which hold offsets, lengths, counts, comparison results and directory numbers only). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. The key-code translation, the compare chain of `0x264a0`, the dispatcher's sub-commands, the camera tables and the destruction-camera constants were read from native instructions and data. Behaviour: [B-005](../behavior/B-005-campaign-rescue.md#被毁与救援时的视角p3-0109), [B-004](../behavior/B-004-base-communications.md#停靠时的视角p3-0109), [B-001](../behavior/B-001-strategic-map.md#warp-时的视角p3-0109).

### Data loaded by the loop (P3-01/10)

Static closure of the original data the selected mission's loop loads, for the [data closure](../../plan/p3/01/spec.md#数据闭包) of the P3-01 spec. Everything here is read from code and data; no run confirmed the requested IDs. The disposition of each source (import, delivered, code rule, slice gap, not used) and its owner are in the [P3-01/10 completion evidence](../../plan/p3/01/subtasks/10-data-closure.md#完成证据).

**Confirmed (loader interface):**

- `0x6affc(id)` looks the ID up in every open archive (`0x6b3c0`), loads the entry if it is not resident (`0x6b420`), counts a reference and returns the relocated block. `0x6b03c` drops a reference and frees the entry at zero unless its directory flags hold 0x20 or 0x40 ([imfat](./imfat.md) §2). `0x65e20` and `0x2cdd4` are jumps to `0x6affc`.
- Typed wrappers: `0x65e28` loads a TEX and prepares it for the renderer (`0x660dc`); `0x65e44` loads a MESH and builds its renderer mesh (`0x6a7b4`); `0x65e84` loads a MODL, every part's MESH and TEX, and its five SND IDs.
- Asynchronous requests: `0x65d10(id, callback, context)` calls the asynchronous loader of the entry's type row in `0x1766b4` (EXPL `0x66ad8`, TEX `0x662c8`, MESH `0x663ac`, MODL `0x6662c`), or queues a plain request (`0x6b828`, served by `0x6baf8` through `0x6bc70`). The EXPL and MODL loaders request the entries their records name. The dependency listers (EXPL `0x66a38`, MODL `0x66458`) feed the budget check below; `0x65ba0` registers the release callbacks, and one for type SND (`0x547c0`, which stops a playing sample).
- `0x6a024(id)` checks for every world sector that the entry and its dependencies fit the per-sector budget (`0x6a11c`, limit `0x176750`) and adds the ID to a resident set (`0x1b4704`). Loaders call it after loading; it loads nothing itself.
- **Search coverage:** raw scans of every rel32 call and jump in the code objects find 68 direct calls of `0x6affc` and every call of the wrappers, `0x65d10`, `0x6b828`, `0x6b3c0`, `0x6b420` and `0x6bc70`; no 32-bit occurrence of any of their addresses exists, so none is called through a pointer. A scan of the whole image for 32-bit values equal to an entry ID of the nine archives finds 145 immediate operands in code and three ID tables in the data object (`0x174c28`, `0x175478`, `0x175e8c`–`0x175ec7`); the remaining hits are not operands, and the immediates in `0x5b058`–`0x5b26e` (VESA function numbers), `0x53414` and `0x8a200` (a sample rate) are not IDs. `0x6607c`, `0x5e900` and the directory iterator `0x6b194` load by ID but have no caller and no pointer.

**Confirmed (start-up):** the module initialiser table `0x1747e0` holds 25 rows {initialiser, shutdown, result check, done flag}; `0x22c08` runs them once from `0x22d00` and stops at the first failure. The loading rows:

| Initialiser | Loads | Consumer |
|---|---|---|
| `0x65ba0` | Opens `SR.NOB`, `COMM.NOB`, `SCENARIO.NOB`, then `COMMFACE.NOB` or `COMMFAC2.NOB` from the CD drive (`0x3bcf0`, by `0x1863d8`); M2ID 10649 | Model slots |
| `0x5db80` | Opens `AISTUFF.NOB`; AICO 6001; TABL 6003, 6007 and 6005 with every entry they name (below) | AI ([difficulty readers](./scenario.md#difficulty-readers-p3-01), paths 3 and 5) |
| `0x2ce90` | Opens `CRAFT.NOB`; TABL 4003 | CINF selection (`0x2cf38`) |
| `0x66bbc` | SCCT 3123 | Mission builder |
| `0x3ec70` | DATA 11075; the 3D scene `0x3cfbb`; the HUD `0x49440`; `0x45420`; `0x484f0` (all below). The earlier sections' "flight setup" `0x3ed0d` lies in this initialiser, so the scene, effect, HUD and background resources are created once per program run | Flight |
| `0x246a0` | Opens `DEBRIS.NOB`; TABL 4501 | Fragment parameters (below) |
| `0x33b28` | Opens `OPTIONS.NOB` | Menu pages |
| `0x39e74` | CINC 10095 | Clips ([cut-scenes](#cut-scenes-and-loop-transitions-p3-0108)) |
| `0x3a850` | SCENARIO TABL 3015, 3011, 3017, 3013 | 3015 and 3011 only by the statistics formatters `0x3bc04` and `0x3bc28`; 3017 and 3013 by the statistics row and promotion `0x3b8dc`, 3013 also by its reset `0x3b7b8` |
| `0x30ec0` | TABL 11375 | External-view cameras (below) |

Within `0x3ec70`: `0x3cfbb` loads RENS 10751, TEX 10377 (`0x444ac`), TEX 11069 with MESH 11065, 10375, 10311, 10745 and 10397 (`0x41c00`), and TEX 10151 with MODL 10383 (`0x3e430`). `0x49440` loads TABL 10099 and the cockpit set it names (`0x497a0` → `0x49694`), the HUD set (`0x4ca80`), SND 10409 (`0x4eaa0`, the initialiser of instrument type 9, the strip above the navigation display; [hud](./hud.md#sources-of-the-unidentified-elements-p2-1227)) and TABL 10461 and 11401 (`0x49e00`). `0x45420` loads SND 10457 and 10455 and TABL 10399 (view labels, [automatic views](#automatic-views-and-cameras-p3-0109)); `0x484f0` loads NEBC 10661.

**Confirmed (mission start and flight):**

| When | Loader | Entries |
|---|---|---|
| Mission build `0x66c00` | itself | SCEN and MUSC of the SCCT slot: 3019 and 3005 for group 0, slot 1 |
| | `0x2cf38` | The CINF that TABL 4003 gives for the slot and group: 4037 ([weapon records](#weapon-records-and-the-first-missions-shooters-p2-1230); structure in [craft](./craft.md)) |
| | `0x486e4` | Six consecutive BITMs of NEBC 10661, from index (clock sample mod 15) and wrapping |
| | `0x23520` | EXIC 10211; from each of its three EXPL lists, 5, 5 and 3 consecutive entries from a random start (so the whole 3-entry list), each EXPL with its SND and ANIM ([audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08)) |
| An object's visual is created (`0x3d4e4`) | `0x65ca4`, `0x65d10` | Its M2ID MODL with that model's MESH, TEX and SND |
| View switch `0x3f158` | `0x42b04`, `0x4cd68`, `0x497a0` | TEX 11089, or 11091 in view mode 6, for the right (target) display; the HUD set and the cockpit set again |
| Docking `0x38ff4`, sub-command 0 | itself; `0x4f480` | TABL 10165; TABL 10171, one of its three BITMs at random (`0x7453b`), BITM 10163 |
| Play-by-ID sound event (`0x55924`) | | SND 10055, 10167, 10169, 10181, 10401, 10463, 10485, 11087, 11381 (posters in [audio](./audio.md#sounds-played-by-id-and-hud-sounds-p3-0110)) |
| Communications | `0x2cbb4`; `0x2c850`, `0x2c9d0` | COMM TABL 2013 for a target of kind 2, 2003 for kinds in `0x68000` when `0x394c4` and `0x33390` pass, otherwise 2005; 2007 and 2009 from the command handler `0x27b44` (structure in [comm](./comm.md)) |
| | `0x3c7bc`, `0x3c828`; `0x3c618` | COMM TABL 2001 and 2011: lists of name strings matched against the speaking object's name (`0x7535e` against +0x15C) to give a face index; COMMFACE TABL 20011, 20019, 20983 and 20985, the TABL each names at that index and the CMOV entries those list (20983 lists CMOV directly), only when `COMMFACE` opened |
| Menu pages (`0x33e8c`, `0x34c08`) | | OPTIONS TABL 5007, DPLU 5003, the 18 MESC entries of table `0x174c28`; SND 10405 |
| Clips (`0x39f34`) | | The row's SONG |

**Confirmed (hit shimmer, TEX 11069):** `0x41c00` loads TEX 11069 into `0x193c30` and sizes spherical texture wraps (`0x82ae8`, type 2) from mesh bounds: for kinds 1 and 2 from MESH 10745, for `0x80` from 11065, for `0x100` from 10375, for `0x200` from 10311, and one shared entry for every kind in `0xf9c7c` (bases included) from 10397. These meshes are the list-2 parts of MODL 10743, 11063, 10373, 10309 and 10611/11007 ([mesh](./mesh.md#2-modl-structure-confirmed-on-all-19-entries)). The impact builders `0x2a40c` and `0x2a5fc` post the hit message (byte +8 = 2, +9 = 4) that the scene message processor `0x3d4e4` handles: for the player, outside the destruction view, it runs the screen flash `0x48d64`; for any other object it starts the effect through `0x42514` unless the player object's +0xCC is 1. For kinds in `0x383`, `0x41dcc` gives the object's list-2 part a copy of TEX 11069 (`0x41f88`); while the effect runs, `0x42664` steps a band through the copy's pixel values with the mission clock (`0x4294c`: alpha 0xFF inside the band, 0x7F at its edges, 0 elsewhere), so the part shows only where the band is. Kinds in `0xf9c7c` share 16 precomputed band steps instead of a copy per object. That this is the dithered hull seen when a craft is hit ([mesh](./mesh.md#2-modl-structure-confirmed-on-all-19-entries), list 2) is Likely.

**Confirmed (RENS 10751 header):** `0x3cfbb` creates a light of type 3 coloured by the floats at +0x00–+0x08 and one of type 0 coloured by +0x0C–+0x14 (Likely directional and ambient, the light-type numbering of the renderer family); `0x3d0b0` passes byte +0x18 to the device and reads float +0x1C; `0x3df90` and `0x3e0cc` read +0x1C, +0x20 and +0x24 when adding and removing visuals (Likely distance thresholds); the three screen flashes `0x48d64`, `0x48dbc` and `0x48e14` read {+0x28, +0x2C, +0x30, int +0x34}, {+0x38 … +0x44} and {+0x48 … +0x54}. Meanings beyond these uses are Unconfirmed. Field types, the one unread position and a runtime write are in [the RENS header](#flight-message-strings-and-the-rens-header-p3-0304).

**Confirmed (fragment parameters, DEBRIS TABL 4501):** the block starts with 20 {pointer, count} pairs (count `0x174b04`), one per kind bit, each to an array of 96-byte records. `0x249dc` returns the record for a kind and a list-1 part index (minus 3 for kinds 1 and 2), and the mode-3 fragment constructor `0x25124` is its only caller. At load, `0x246a0` stores a normalised copy of each record's first vector at +0x0C, negates the vector itself in place, widens the nested boxes (+0x38, count +0x3C) and derives bounds and +0x5C from them; the copy at +0x0C is not negated ([craft §4.4](./craft.md#44-load-transforms-in-0x246a0-confirmed-code), correcting the earlier reading of a negated copy). Structure and field types are in [craft §4](./craft.md#4-debris-tabl-4501). Field meanings are Unconfirmed; the parameter record whose non-zero +0x5C limits fragment damage in [difficulty path 6](./scenario.md#difficulty-readers-p3-01) is Likely this record.

**Confirmed (external-view cameras, TABL 11375):** 20 records of 32 bytes, indexed by kind bit (`0x174c1c` + bit × 0x20). Its only readers, `0x31ee0`, `0x321d8` and `0x324d8`, are called only from the mode-0x11 camera functions of sub-modes 1–5 and 7 (`0x31634`, `0x317d0`, `0x31810`, `0x31854`, `0x31884`, `0x31ba4`), that is, from external views selected by F4–F9. The destruction view (sub-mode 8, `0x31bdc`), F1 and the Warp do not read it.

**Confirmed (base interior, view mode 6):** the HUD set and the cockpit set depend on the view mode, not on a craft type: `0x4ca80` takes `0x175eb4` (MFDD 10475, BITM 10469, TABL 10481, SNIP 10487, DIAG 10489) when the player-state view mode (+0x28 of the block `0x52694` returns) is 6, otherwise `0x175e8c` in HI or `0x175ea0` in LO ([hud](./hud.md#hud-and-map-drawing-paths-confirmed-exe)). Entering mode 6, `0x3f158` switches to the 640-wide display, reloads the HUD, the right display (TEX 11091) and the cockpit set with `0x497a0(2)`, which is CCKD 10097 (TABL 10099 index 1); leaving it, `0x497a0(1)` or `0x497a0(3)` restores 10103 or 10101. TABL 10165 holds 11 records of 0x7C bytes ([hud](./hud.md#2-tabl-entries-in-srnob-contents-likely)); the base code orders them by the damage state of the subsystem each names (`0x39664`, `0x39cb4`) and repairs the selected one (`0x398ec`), with fixed delays and two fields of the player's craft record (+0x54, +0x9C, through `0x2d2d8`).

**Confirmed (nebula backgrounds):** `0x484f0` sets six fixed directions; `0x489d0` draws the six BITMs of the current set with `0x5b54c` (a rotated copy of the stored indices into the frame buffer, with no colour lookup) at screen positions it computes from those directions (Likely their projection), and `0x488b4` clears the previous rectangles. The set is the six NEBC 10661 entries the mission build chose. NEBC 10039 (the six 128×128 BITMs with embedded palettes) replaces them only through `0x487a0`, which is the function of row 26 of the typed cheat table `0x174ee8`; rows beyond the first 16 work only after the table's master toggle ([mission failure](#mission-failure-player-loss-and-rescue-p3-0105)).

**Confirmed (AISTUFF closure):** TABL 6003, 6007 and 6005 are arrays of 0x54-byte records ended by a zero first word. `0x649c8` loads, for each record, the entry named at +0x1C, that entry's +0x38 entry and six ID lists at +0x3C/+0x40 … +0x64/+0x68. The AI later loads entries again by ID from the same lists (`0x5e940`, called at `0x651c3`–`0x65342`). Group 0's closure is TABL 6003 and 25 entries (22 TABL, 3 DFPG); the group-1 and group-2 tables reach the same 37 entries, 16 of them outside group 0's closure. AICO 6001 holds a pointer and a count of 3 at its start (the per-group triples of difficulty path 5); the loop also reads its header +0x08 … +0x48 and the 5 × 16-byte `f32` array its +0x18 points to ([ai §2](./ai.md#2-aico-6001-global-ai-parameters)). The ID chain's +0x38 and six lists are fields of the DFPG that record +0x1C names, not of the 0x54-byte record. Structure, field types and the entry IDs of the group-0 closure: [ai](./ai.md).

**Confirmed (EXE text and tables in the loop):** besides the regions already imported ([effect geometry](#effect-geometry-data-p2-0614-research), [SNIP 10487](./hud.md#snip-10487-confirmed-structure-p2-1227), [DIAG 10489](./hud.md#diag-10489-confirmed-structure-p2-07-revision)), the loop shows EXE strings through `0x4e9e8`, which queues text for the scrolling message line (instrument type 8, [hud](./hud.md#sources-of-the-unidentified-elements-p2-1227)): the completion message at `0x17106c` (state 4), the beacon message at `0x171094` (`0x33464`), and from the flight key handler the speed-assist toggle messages at `0x170db8` and `0x170dc8` and three joystick-sensitivity messages at `0x170ddc`, `0x170df8` and `0x170e14` (regions and text rules: [flight message strings](#flight-message-strings-and-the-rens-header-p3-0304)). AI program selection falls back to the built-in table `0x1762f8` (10 records of 0x54 bytes). The camera tables `0x174b88`/`0x174bdc`, the display page table `0x175c7c`, the key table `0x74f30` and the kind masks are code-side tables.

**Not loaded or not used by the loop (Confirmed):** NEBC 10039 (cheat only, above); TABL 11375 (external views only); the group-1 and group-2 AISTUFF entries (difficulty path 3 selects group 0's table); the OPTIONS pages, SCENARIO TABL 3011–3017, the base interior's images and texts and COMMFACE are loaded but serve pages, statistics, the base interior screens and the communications faces, which the [P3-01 slice gaps](../../plan/p3/01/spec.md#缺省清单) leave to P4. Which EXPL an explosion uses (`0x2409c`) and which nebula set a mission gets are chosen at run time from the sets above.

**Limits:** loads through pointers computed from bases other than the loaders above are not excluded; the data-driven AI programs interpreted by `0x64cb8` were not followed beyond the loader's lists (no load call exists outside the scanned sites; P3-03/03 later decompiled the whole AI code and found no other load call and no entry IDs in script arguments, [ai §1](./ai.md#1-loading-the-id-chain-and-the-group-0-closure-confirmed) and [§5](./ai.md#5-ai-scripts-tabl)); and no baseline run checked the requested IDs. Evidence: ignored `local/research/p3-01/closure/` (`ghidra_scripts/ClosureProbe.java`, `probe.sh`, outputs `out/p1`–`out/p54`, `out/id-immediates.txt`; `id-tables.ts`, `aistuff-comm.ts`, `data-id-refs.ts`, `model-meshes.ts`, `tabl-10165.ts`, `slot-musc.ts` and `delivered.ts` with their `out/*.json`, which hold entry IDs, offsets and counts only). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Register arguments and the immediates were read from native instructions.

**Addendum (P3-03/24, EXE text drawn without `0x4e9e8`):** the paragraph on EXE text above covers only the strings queued through `0x4e9e8`. HUD, map and communications code also draws literals of object 4 directly, or formats them first. In the selected mission, 64 such regions lie on the view paths of the HI forward cockpit and the map; their reachability is stated per literal. The others serve LO, the F2 view, typed cheats, the wave mode, the base interior or the menu pages. Literals, draw sites, conditions and coverage: [HUD, map and communications text from the EXE](#hud-map-and-communications-text-from-the-exe-p3-0324). Dispositions: the handoff record at the end of the [P3-01/10 completion evidence](../../plan/p3/01/subtasks/10-data-closure.md#完成证据).

### Object table, frame pipeline and input polling (P3-02/01)

Static answers to Q-08–Q-10 of the [P3-02 spec](../../plan/p3/02/spec.md#原版研究). Everything here is read from code; nothing was observed at runtime. Uses the globals of [mission result](#mission-result-success-path-and-campaign-restart-p3-0104), [mission failure](#mission-failure-player-loss-and-rescue-p3-0105) and the [time base](#simulation-time-base-p3-0106). "Sample" is the per-frame mission-clock sample `0x186414`.

#### Runtime object table (P3-02/01)

**Confirmed (storage):** module initialiser `0x51f10` (row 4 of `0x1747e0`) creates 26 per-kind lists, one per kind bit 0–25 (table `0x1b06e4`), an object pool of 300 slots of 0x198 bytes (`0x1b0634`) and an auxiliary pool of 300 slots of 0x110 bytes (`0x1b0630`, the movement block at object +8). A list header (`0x53160`) is {release callback, head, tail, node pool}; the kind lists use callback `0x523f4` and share one pool of 0x14-byte nodes (`0x1760a0`). A node is {object, reference count, next, previous, list}, and the rest of the code refers to an object by its node (a handle). Every pool (`0x56620`, allocation `0x566dc`) reuses free slots and, when full, chains a further block of 100 slots. Only a failed C-library allocation of a new block stops this: `0x22fe8` calls `0x23018(7)`, which prints the not-enough-memory text and exits the program. The node, dispatcher-message (`0x52f40`: 300 × 0x80 bytes) and presentation-item (`0x52b30`) pools work the same way.

**Confirmed (allocation `0x520d4`):** takes an object slot, initialises its fields (among them state bytes +2 and +3 = 0, update callback +0xC = 0, dead flag +0xD8 = 0, source record +0x190 = 0), stores the kind at +4 and appends a new node with reference count 1 at the **tail** of the list of the kind's bit (the index is a bit-position computation that assumes one set bit). It increments the live count `0x1760a4`; the peak `0x1760a8` is written and never read. Nothing compares the live count with a limit. The only zero return follows a failed pool allocation, that is, after the fatal exit above.

**Confirmed (iteration `0x5261c`):** arguments are a kind mask, the previous node (0 to start) and a state cell. Kinds are visited in ascending bit order (`0x52b10` returns the lowest set bit), each list from head to tail, so objects of one kind come in allocation order. The next node is read from the previous node at the time of each call: a node appended during a walk to the current list or to a list of a higher bit is visited in the same walk; one appended to a lower bit is not. The player's kind 1 is bit 0, so the player object comes first in every walk that includes it.

**Confirmed (object states):** byte +3 is the object's state and byte +2 its activity.

| +3 | Meaning | Set by |
|---|---|---|
| 0 | New | The allocator |
| 1, 3 | Presentation ready | The renderer's completion callbacks `0x3d904` and `0x3e590`: 0 becomes 1, otherwise 3 |
| 2 | Waiting for its presentation | Message 0x200 posted by the object's own callback in state 0 when it is active |
| 4 | Destroyed source: no callbacks, still moved | The explosion constructor `0x23ac8`, on the object it explodes (the explosion object itself starts in state 0) |
| 5 | Leaves or re-enters the active area | Area check `0x3a4b0`; also dispatcher message 0x800000, the AI's Warp-out request (traced by P3-06/04, [active area](#world-boundary-active-area-parking-and-autopilot-p3-0604)) |
| 6 | To be removed | `0x20938` and `0x21694` at teardown; `0x2a694` for a destroyed parked object; `0x2f314` (left the world); `0x3a4b0` for objects of kinds `0x1f00000` (formerly described as flag bits 0x1F0 at +6, which is the upper half of the kind; corrected by P3-06/04, [active area](#world-boundary-active-area-parking-and-autopilot-p3-0604)) |
| 7 | Active | Message 0x200 posted by the callback in state 0 (parked object), 1 or 3 |
| 8 | A projectile that has hit; the systems that need state 7 and above still include it | `0x25dc4`, called by the hit tests `0x28450` and `0x2a40c` |

Activity +2: 0 = parked outside the active area (`0x3a540`; `0x67938` parks a new object outside it unless it is the player or SCEN header 0x0C is set), 1 = active, 3 = docked; 2 suppresses the update callback (writer not traced). The generic callbacks are `0x20ae4` (from `0x20c18`) and the player's `0x25f90`; the dispatcher's message 0x200 stores the posted state (for kind `0x400000` it goes to `0x2409c` instead).

**Confirmed (removal):**

- An object leaves only through message 0x20. Its own update callback, finding state 5 or 6, releases its controller or AI block and posts message 0x20 for itself (`0x20ae4`, `0x25f90`). The dispatcher's message loop handles it:
  - state 5 with no kind bit of `0x1f00000` (the "flag bits 0x1F0 at +6" of earlier text) toggles parking: an active or docked object loses its movement block and gets +2 = +3 = 0 (and the player's target, player object +0x8C, is cleared if it is this object); a parked object gets +2 = 1, +3 = 0 and a new movement block and renderer object (`0x2c3b0`). Its state then starts again at 0;
  - otherwise (state 6, or a kind in `0x1f00000`) the object is removed: for kind 1 the player-state handle (`0x1b0638` +0x8C) is cleared first, then `0x523cc`.
- `0x523cc` decrements the live count (and the auxiliary count `0x1760ac`), unlinks the node from its kind list (`0x532a4` relinks the neighbours and fixes head and tail) and calls the list callback `0x523f4`. That releases the movement block and every reference the object holds (+0x7C, +0x8C, +0x90, +0x94, +0x9C, +0xA4, +0x188 and the reference in each 0x50-byte entry of the array at +0x158) and returns the slot to the pool. The node's object pointer is then cleared and its count decremented; the node survives while other holders still count it.
- Holders take counted references through setters such as `0x5310c`, `0x52898`, `0x528bc` and `0x52998` (`0x53270`/`0x53278`). A removed object's node reads as invalid (`0x52680` tests the node and its object pointer), and holders check that when they use it (for example the player's update drops an invalid target). Removal walks no list of referrers.
- `0x523cc` is the only routine that frees an object. Its callers are the dispatcher's 0x20 case and six effect constructors that free the new object when the auxiliary allocation `0x52324` fails. That allocation returns 0 or, after a failed pool allocation (the fatal exit above), −2: the test in `0x25b0c`, `0x2b00c`, `0x24ec4` and `0x25124` compares with −1 and never matches, and the test in `0x38780` and `0x3cb80` fails only after the fatal exit. Removal therefore happens only inside the message loop, never during a `0x5261c` walk.
- **Timing:** an object put in state 5 or 6 stays in its kind list until its own callback, at its next update, posts message 0x20 and the message loop of that frame handles it. That is the same frame when the state is set before the callback runs, as `0x20938` does at teardown; it is the next frame when the state is set in the message loop or after it, which is where damage (`0x2a694`), the parked update's exit test (`0x2f314`), the area check (`0x3a4b0`) and message 0x800000 set it. Walks in between still return the object; consumers filter by state or the dead flag (for example `0x69a70` skips +0xD8 and state 6, movement and collisions skip states below 7).
- **Mission data:** no removal step reads +0x190 or the current SCEN. The record's spawn counter +0x18 and the section-5 entry's +20 are only incremented, by spawn dispatch `0x67678`; the entry's +24 holds the node of the first member of the latest request (uncounted), which later members of the same request use, and is not cleared. The counters therefore count spawns, not live objects.
- **Names:** an object's name is a copy at +0x15C. Removal changes no name bookkeeping. Name assignment `0x67d44` checks a record's candidate names against the names of objects found by a walk, so a candidate becomes free once its holder is unlinked; the use counters of the section-0 pool (`0x176718`) are not decremented. The assignment rules themselves belong to Q-05.

**Confirmed (allocation-time refusal in instantiation), Unconfirmed (when it occurs):** `0x67938` allocates first and then calls `0x6a0b8`. When the per-sector resource test `0x6a11c` fails (the value `0x6a184`/`0x659e4` computes over a 2 × 2 block of sectors exceeds `0x176750`, which the mission module's initialiser `0x66bbc` sets to 0x800000 before it loads SCCT; P3-02/02), it returns 0 without releasing the object: the object stays in its kind list in state 0 with no update callback, and `0x67678` returns −1, which the dispatcher ignores. When the test can fail at run time was not established.

**Confirmed (rule limits against faults):** the allocator has no rule-level limit; running out of memory ends the program. The limits that refuse objects as a rule act before allocation, in the spawn queue (Q-01 and Q-04). A project fault budget therefore has no counterpart in the original and does not represent an original outcome.

#### Frame pipeline (P3-02/01)

**Confirmed (main loop):** `0x22d00` repeats `0x3266c` (it exits when this returns non-zero), `0x25894`, `0x20938` (a negative result ends the program with code 8 and a fatal message), `0x20d10` (a zero result does the same) and `0x3ee58`.

**Confirmed (dispatcher messages):** `0x53030` appends a 0x80-byte message at the tail of the single list `0x1b07a4`; the type is at +0xC and the subject's handle, a counted reference, at +8. The first thing `0x3266c` does every frame is `0x52fa4`, which releases the references of every message, resets the pool and empties the list. No message survives into the next frame: it is handled in the frame that posted it or dropped.

**Confirmed (the order inside `0x20d10`):**

1. `0x52c3c` empties the presentation-item lists and pool of `0x52cb4` (items for the renderer and sound, cleared every pass).
2. `0x2cd60` turns a due communications reply into a presentation item (Likely the reply text).
3. `0x67018` checks the spawn queue and, for each spawn request of a due entry, posts message 0x4000; it instantiates nothing itself (order of entries and requests: Q-01).
4. The message loop starts at the list head and follows the next links as they are when it advances, so a message posted while one is handled is handled in the same loop after all earlier ones. The loop therefore handles the messages of `0x3266c`, then those of the update callbacks in walk order, then the spawn requests of step 3, then those posted during the loop. A 0x4000 message instantiates through `0x67678` → `0x67938` while the main-flow state is not 1 (`0x339cc`). An unknown type makes `0x20d10` return 0 (the fatal exit above).
5. After the loop, once each: `0x221fc` (movement integration of the objects with +2 non-zero in states 4 or 7 and above, then the collision passes `0x29670`, player against the others, and `0x29934`, among the others, both for states 7 and above), `0x23808` (the delayed player explosion), `0x30590` (energy), `0x2ede0` (rebuilds the friendly and hostile craft sets through `0x2f028` and the map-visibility flag +0xD4; analysed by P3-06/04, [object sets](#world-boundary-active-area-parking-and-autopilot-p3-0604)), `0x2f1b0` (updates each parked object in state 7 and above once its last update is 64–127 units old, with a new random threshold at each check: the parked travel `0x2f314`, which contains the world-exit test, and parked combat ([parked engagement](#parked-object-engagement-p3-0705)); [parked update](#world-boundary-active-area-parking-and-autopilot-p3-0604)), `0x2bf08` (Warp completion), `0x398ec` (base interior, view mode 6), `0x334bc` (main-flow state 0: view mode 0x13 and state 1; when it returns 1, `0x21694` retires every object), `0x3a468` (area check `0x3a4b0` of the objects of kinds `0x1fffffe` in states 7 and above) and `0x21584` (camera; it always returns 1, so the fatal exit after it is unreachable, [C1](#c1-the-3d-camera-and-its-readers--confirmed-code)).

Messages posted after the loop are cleared at the next frame without being handled. A search of direct calls from the step-5 roots and `0x3ee58` finds only two paths to `0x53030`, both ending in `0x2e4ec`, which posts message type 4, a sound request: `0x2f1b0` → `0x2f314` → `0x39820` → `0x2d6dc`, and `0x398ec` → `0x2d6dc`. Callbacks called through pointers are outside that search.

**Confirmed (object updates, `0x20938`):** walks kinds `0x3ffffff`; in main-flow state 1 it first sets every object not in state 6 to 6; it calls the callback at +0xC unless +2 is 2 or +3 is 4. `0x20990` installs the callbacks by kind (`0x25f90` for kind 1, `0x3897c` for kind `0x4000`, `0x20c18` for the others). The player is updated before every other object. An object allocated during the walk is updated in the same walk when its kind bit is higher than the current one; direct calls from the callbacks reach the allocator only through the AI path `0x5dcd4`/`0x5ddd4` → `0x62250` → `0x62aa0` → `0x38780` (kind `0x4000`, gate in [two allocator paths](#two-allocator-paths-native-inputs-and-profile-comparison)).

**Confirmed (when a new object takes part):** every allocated object starts in state 0, and the per-object systems after the loop (movement, collisions, the parked-object update, the area check and the energy of active objects) act only on states 7 and above (movement also on state 4); only the energy update of parked objects ignores the state. An object instantiated in the message loop is therefore neither moved nor tested for collisions in that frame, and it gets no update callback in that frame, because `0x20938` has already run. Its first callback runs in the next frame's `0x20938` and posts its next state, which that frame's loop applies. When the presentation was already ready (state 1) the object reaches state 7 then, and is moved and tested for collisions after that loop, one frame after its instantiation; its state-7 behaviour starts in the following `0x20938`. Otherwise it waits in state 2 for the completion callback. When the renderer completes the request is not traced in general; for the player at mission start, P3-06/05 found it Likely complete within the build frame's render ([initial flight state](#initial-flight-state-p3-0605)).

#### Input polling (P3-02/01)

**Confirmed (where game input is read):** game keys, the joystick and the fire triggers are read only in the player's update callback `0x25f90`, in state 7 and only while the player object's dead flag +0xD8 is clear (native jump table at `0x25f70`, test at `0x2610b`). In that case it calls, in order, `0x2ddbc`, the speed assist `0x27f68` (when enabled), the keyboard poll `0x26284`, the device poll `0x273e4` and the map-cursor poll `0x27800`, posts message 0x20000 when the controller's axes changed, and then calls the trigger routine `0x2d578` for channels 0 and 1. The controller block (0x1C0 bytes, player object +0x14) holds the due times: +0 device, +4 keyboard, +8 map cursor. The dead flag is set by the damage handler `0x2a694` and the dispatcher's kill paths, and cleared only by the rescue `0x67b98`. During the destruction sequence no game key is polled: no view key, no pause and no command. Keys typed then stay in the DOS buffer until the rescue clip list empties it (the clip player reads only its skip keys). The other readers of the DOS buffer belong to the page system, joystick calibration and code next to the debug command handler (`0x2815a`, entry not traced).

**Confirmed (keyboard poll `0x26284`):**

- It acts only when the sample is strictly greater than the due time, and then sets the due time to the sample + 4 in view mode 6 or + 16 in every other mode, whether or not a key is waiting. Overdue polls are not caught up. Because samples change in steps of 2 and keep the parity set at initialisation ([time base](#simulation-time-base-p3-0106)), a due time has the parity of every later sample, so two polls are at least 6 units apart in the base interior and 18 in other modes, and more when frames are long.
- If DOS reports a waiting key (INT 21h function 0Bh, `0x74e8c`), it reads one with `0x3c970` (INT 21h function 07h, translation `0x75048`, case swap from the BIOS keyboard flags at `0x417`, typed-cheat matching) and passes it to the context of the view mode read at this poll: modes 0–3 `0x27360`, 6 `0x271e0`, 8 `0x27118`, all others `0x264a0`. It then reads and discards every other waiting key; each still goes through the cheat matching.
- At most one command per poll is therefore handled. Further keys typed between two polls are lost, and a held key acts at most once per poll through the BIOS key repeat ([keyboard hardware and repeat](#keyboard-hardware-and-repeat-p3-0507)).
- Most commands post dispatcher messages (views and the map: 0x400; the options page: 0x400 sub-command 10; Warp: 0x400 sub-command 0), which this frame's loop handles after the update walk. Some act at once inside the callback: target selection (`0x2799c` and the cycling helpers), the secondary trigger (below) and the throttle keys, which write the throttle field +0x1C and mark +0x0C, so that the same callback posts it with message 0x20000.

**Confirmed (device poll `0x273e4`):** the device is the game-port joystick, read by `0x57d70` through the driver table at `0x176204` (selected by `0x1761e4`); `0x57d70` marks each axis that changed since the previous read.

- View modes 0–1: read the device and apply only the changed axes (`0x275bc`) when the sample is strictly greater than the device due time, then set that time to the sample + 6 (at least 8 units between reads).
- Mode 6: nothing.
- Mode 8: no device read. When `0x174b24` is set, the autopilot's AI step `0x5dcd4` runs; then the device due time (+0), not the map-cursor due time, is re-armed to the sample + 6 by the same rule. The map-cursor due time (+8) belongs to the map poll `0x27800` ([map mouse input](#map-mouse-input-p3-0503)). Corrected by P3-05/03 from "the map-cursor timer only".
- Every other mode: with the same due-time rule, `0x274a4` reads the device, applies the changed axes, reads the fire buttons (`0x2760c`) and posts view messages for the hat (`0x2769c`). When the flag `0x174b24` is set (toggled by `a` through `0x27ee4`; the autopilot, Confirmed by P3-06/04, [autopilot](#world-boundary-active-area-parking-and-autopilot-p3-0604)), the AI step `0x5dcd4` runs instead, and when it returns 1, `0x27528` reads the device and takes the axes back only beyond a deflection of ±0x28.

**Confirmed (the two fire triggers):**

- Primary: controller +0x10 becomes 1 while joystick button bit 0x10 is down (the bits are active low) or the BIOS keyboard flag Alt (`0x417` bit 3) is set, otherwise 0. Only `0x2760c` writes it, that is, only at a device read in a flight mode. It is a level that holds between reads.
- Secondary: controller +0x14 becomes 1 when Space reaches the flight context (`0x26778` → `0x26a81`), at most once per keyboard poll, or when joystick button bit 0x40 is down at a device read whose sample is strictly greater than the button's due time, which is then set to the sample + 0x80. No other context sets it.
- In every frame of state 7 with the player alive, after the polls, `0x25f90` calls `0x2d578` with channel 0 and +0x10, then channel 1 and +0x14; channel 0 fires mount list 0 and channel 1 list 1 ([weapons](#weapons-mounts-selection-and-firing-p3-0702)). `0x2d578` stores the value at object +0xF4 + 4 × channel and, when it is non-zero, tries that channel's weapons; a shot posts launch message 8, whose projectile the loop creates. Then +0x14 is cleared, and so is +0x10 while +0x18 is set (+0x18 is zeroed when the controller is created; no other writer was found in `0x25f90`–`0x28100`). The firing rate comes from the weapons, not from the polls (P3-07).
- Joystick button bit 0x80 selects the target in front or cycles targets, with its own due time re-armed at the sample + 0x40 by the same rule.

**Confirmed (mode changes and earlier input):**

- Opening or closing the map, starting or ending a Warp and switching views empty no buffer. Of the readers of the DOS buffer, only the clip player empties it, before and after a list (docking, launch, rescue); pages read their own keys while they run.
- The context is chosen at each poll from the current view mode, so the first key waiting at the first poll after a switch is handled by the new context, and the others are discarded.
- The primary level and the axes are read only in flight modes (modes 0–1 read the axes only; modes 6 and 8 read neither), while the trigger calls run every frame. A primary level read at the last flight-mode device read before the map, a Warp or the base interior stays in effect until the next flight-mode read. Not observed at runtime.

Evidence: ignored `local/research/p3-02/pipeline/` (`ghidra_scripts/PipeProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p41.txt`). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. The list insertion, the walk, the states the callbacks post, the message clearing, the dispatcher order, the poll intervals and comparisons, the context switch, the trigger fields and the dead-flag test were read from native instructions. Callers were checked by raw scans of relative calls and of 32-bit values, and the message posts after the loop by a direct-call reachability search from each root.

#### Key reading and key contexts (P3-05/01, P3-05/02)

Static answers to Q-01, Q-02 and Q-04 of the [P3-05 spec](../../plan/p3/05/spec.md#原版研究): what the key reader delivers and what each of the four key contexts does with every code it can receive. Read from native instructions; the runtime samples of P3-05 subtask 06 (Q-05), which prove code to action only, are summarised [at the end of this section](#runtime-samples-p3-0506) and listed in the [key map](../input/key-map.md#运行样本q-05p3-0506). This extends [input polling](#input-polling-p3-0201), which records when the poll `0x26284` runs and how it picks the context by view mode. The per-key tables are in the [key map](../input/key-map.md#按键上下文代码确认p3-050102), with which keys and modifiers produce these codes: the emulator side (PC scan code to the bytes DOS returns) is Confirmed from the DOSBox-X source, while the host key to scan code mapping and the layout remain Likely for standard US keys and Unconfirmed otherwise: the runtime samples of P3-05 subtask 06 (Q-05) prove code to action only, and a user-operated physical probe is still outstanding.

**Confirmed (the key reader `0x3c970`):**

- `0x74ec8` reads one byte with INT 21h function 07h and, after a 0, a second byte, the scan code ([keyboard hardware](#keyboard-hardware-and-repeat-p3-0507)). `0x75048` returns a non-zero byte unchanged. For an extended key it translates the scan code through the 70-entry jump table `0x74f30` and range checks: the navigation keys, the keypad centre, two other keypad scan codes, F1–F12 and the Shift, Ctrl and Alt forms of the function keys get codes of their own, and Ctrl with Left, Right, Home, End, PgUp or PgDn gets the code of the plain key. Every other extended scan code becomes 0, which no context handles; among them are the Alt forms of letters, digits and punctuation, Ctrl+Up, Ctrl+Down, Ctrl with the keypad centre, Ins or Del, and Shift+Tab.
- **Caps Lock:** while the BIOS Caps Lock flag (`0x417` bit 6, read through `0x74e70`) is set, `0x3c995`–`0x3c9ca` swap the case of the letters A–Z and a–z; nothing else changes. Because the BIOS applies Caps Lock to letters, the case that reaches a context depends on Shift alone (BIOS side Confirmed for the baseline emulator, [key map](../input/key-map.md#修饰键与大小写p3-0501)).
- **Typed-word matcher** (`0x3c9ce`–`0x3cb68`): keeps the last 11 characters (buffer `0x17518c`, length `0x175198`) and compares them with the entries of the table `0x174ee8` (stride 0x18, count `0x175188`); entries from index 16 on are tried only while the gate flag below is set. A match can call a callback, toggle the integer its entry points to and show a message. It never consumes or changes the key: `0x3c970` always returns the translated key, also during a pause.
- **Cheat gate:** `0x3cb78` returns `0x174ed0` (0 in the image). Its only writer is the matcher, through the pointer of entry 0 (`0x174ef8`), so the gate opens and closes only when that entry's word is typed (the word is not recorded here). This settles "Likely the cheat flag" in [flight controls](#flight-controls-and-rotation-p3-0602).

**Confirmed (flight context `0x264a0`):** it offers the key to the communications prefilter `0x27b44`, then to the energy-page prefilter `0x27ab4`; when neither consumes it, the native compare tree from `0x264d9` handles it. The tree was evaluated for all 256 codes. The speed keys are in [throttle](#throttle-maximum-speed-and-speed-matching-p3-0603), the view keys in [automatic views](#automatic-views-and-cameras-p3-0109), F11, `a` and the absence of steering in [flight controls](#flight-controls-and-rotation-p3-0602). The target and weapon keys, the energy-page keys and the left-display pages are recorded by P3-07 (cross-checks below). The other leaves:

| Code (key) | Leaf | Action |
|---|---|---|
| `p` | `0x26f29` | Pause (below) |
| Esc | `0x270ec` | Message 0x400 sub-command 10 with +0x11 = 0: in this frame's message loop the dispatcher (`0x20f07`) runs the page runner `0x32fec` for the page in `0x186840`, then `0x32d10` (a pending display-mode change) |
| `J` (Shift+j) | `0x26fab` | The same sub-command with +0x11 = 1: `0x32f80` runs `0x32fec` with `0x186840` set to 0xE and then restores it; `0x32d10` is not called |
| `P` (Shift+p) | `0x26828` | Toggles the screen-flash enable `0x175c54` (initially 1), which only the screen flashes `0x48d64`, `0x48dbc` and `0x48e14` read |
| `\|` (Shift+`\`) | `0x267ec` | Sets the screenshot request `0x174b18`. At the end of the frame render `0x3ee58` (`0x3f07a`), `0x5800c` writes the screen as an uncompressed 8-bit BMP with the current palette to a numbered file (counter `0x1762b8`) and clears the request. The other three contexts set the same request |
| `b` | `0x26f0b` | Posts message 0x200000 with the player as subject; the dispatcher case `0x2148b` calls `0x38780`, which creates a kind-`0x4000` object from the player's pose ([two allocator paths](#two-allocator-paths-native-inputs-and-profile-comparison)). Gameplay role Unconfirmed (P3-08, P3-10) |
| `w`, `W` | `0x26f6a` | Message 0x400 sub-command 0 (Warp start; its own checks are in `0x2be00`) only when player-state byte +0 is 1 (role of that byte not traced) |
| `m` | `0x270c0` | Message 0x400 sub-command 8 (the map; the dispatcher requires `0x33504`) |
| `e`; `d` | `0x26fd5`; `0x2700a` | Left-display page change through message 0x100000 (page conditions: P3-07 D15) |
| `D`, `I`, `M`, `T`, `i`; F12 and its Shift, Ctrl and Alt forms | `0x267fd`, `0x267af`, `0x2687f`, `0x26843`, `0x267cf`; `0x26eb8` | Only while the cheat gate is set. `T` posts message 0x800 for the player's target, the kill event of the debug commands (§4); `I` and `i` step the music routine `0x561f0` up and down; `D`, `M` and the F12 family write globals whose roles were not traced |

Every other code reaches no case, among them the unshifted digits, `?`, `x`, `c`, `s`, `g`, `S` and `G` when the prefilters pass them on, End, PgDn, Ins, Del, the keypad codes `0x8A` and `0x8B`, the Shift, Ctrl and Alt forms of F1–F11, and 0 (per-key list in the [key map](../input/key-map.md#飞行)).

**Confirmed (the two prefilters; menu keys Confirmed, data):**

- `0x27b44` reads the left-display page (`0x4ce10` → `0x1a9dc8`). On pages 2–4 (the communications menu) `0x27e10` compares the key with byte 1 of each entry of the open menu in order, both folded through `0x754d9`, and the first match consumes the key; no match passes it on. `0x754d9` lower-cases A–Z ([comm §4](./comm.md#4-text-rules-confirmed) says upper-cased; the effect, case-insensitive letters and exact other bytes, is the same). On the other pages it consumes only `c`, and only while the communications subsystem (field 0xD, `0x52ac4`) is not in state 2: it saves the page and builds the category menu (TABL 2007, `0x2c850`). It never consumes Esc.
- **Generated keys:** the category builder `0x2c850` and the object-list builder `0x2c9d0` (objects in state 7 and above only) give their n-th entry (n from 1) the n-th character of the 36-character table `0x174b40` (count `0x174b64`), which holds the digits and then the letters: entries 1–9 get the digits 1–9 and entries 10–35 the letters. From entry 36 on, the key byte is the first decimal digit of n, which an earlier entry already uses, so the first match wins and those entries cannot be chosen by key.
- **Data keys:** the items keyed by data (all of TABL 2003, 2005 and 2013, the last item of 2007 and the item of 2009) use only the digits 1–7 and `x` (Confirmed, data, by class and count). Every menu ends with an item keyed `x` whose value 0 closes the menu and restores the saved page. `0` is never a menu key, and no control code is.
- `0x27ab4` acts only on page 1: `S`, `s`, `G` and `g` change an energy level and are consumed only when the change succeeds (rules: P3-07 D10).

**Confirmed (Warp `0x27360`, base `0x271e0`, map `0x27118`):** `0x27b44` and `0x27ab4` are called only from `0x264a0` (raw call scan), so no menu or energy-page key is handled in these contexts. None of them reads Alt or the joystick buttons ([input polling](#input-polling-p3-0201)).

| Context | Code (key) | Action |
|---|---|---|
| Warp | `p` | Pause (`0x273a9`) |
| | `\|` | Screenshot request |
| | `i`, `I` | Only while the cheat gate is set: the music routine `0x561f0` one step down or up, clamped |
| Base | Up, Down | Message 0x400000 sub-command 1 or 2 (`0x38ff4`): the base list cursor `0x186b20` −1 or +1, clamped at both ends without wrapping, with SND 10167. `0x39664` resets it to the first row at every docking |
| | Enter | Sub-command 3: when the entry under the cursor still needs service (`0x39cb4`), it moves to the head of the service queue `0x186a70`; SND 10169 either way. The base frame routine `0x398ec` services the head (rules: P3-10) |
| | `l`, `L` | Sub-command 4: launch |
| | Esc | As in flight (message 0x400 sub-command 10, +0x11 = 0); `0x32d10` applies no change in view mode 6 |
| | `m` | Message 0x400 sub-command 8 (the map, when `0x33504` allows it). The previous view mode stays 6, so closing the map returns to the base, and the map refuses `w` |
| | `P` | Toggles `0x175c54` |
| | `p` | Pause (`0x2724d`) |
| | `\|` | Screenshot request |
| Map | `m`, Esc | Message 0x400 sub-command 9: the dispatcher swaps +0x28 and +0x29 without a condition, which closes the map |
| | `w`, `W` | Message 0x400 sub-command 0 when the previous view mode (+0x29) is not 6 and player-state byte +0 is 1 |
| | `p` | Pause (`0x2714f`) |
| | `\|` | Screenshot request |

Every other code does nothing in these three contexts (the compare trees have no other case; per-key lists in the [key map](../input/key-map.md#按键上下文代码确认p3-050102)). Only Warp has cheat-gated keys. That index 0 of the base list is its top row is Likely (row arithmetic of the list drawing `0x4f550`).

**Confirmed (pause, all four contexts):** only `p` starts it. `0x258f8(1)` marks the time base ([time base](#simulation-time-base-p3-0106)) and `0x538a0(1)` pauses the playing samples and sequences (the Miles call identities are Likely). A blocking loop then reads keys through `0x3c970` until it gets `p` or `P`, and `0x538a0(0)` and `0x258f8(0)` resume and remove the paused interval. Nothing else runs meanwhile: no frame, drawing, device or mouse read, AI or dispatcher. Every other key, Esc included, is read, offered to the typed-word matcher and discarded.

**Confirmed (Esc and the pages):** the prefilters never consume Esc, so it reaches the flight tree also while the communications menu is open. The page runner `0x32fec` pauses the time base and the sound, runs the page dispatcher `0x33e8c` for the page in `0x186840`, then restores them and re-applies the view. During a campaign mission that page is 9 ([campaign restart](#mission-result-success-path-and-campaign-restart-p3-0104)); its value in practice mode was not traced. Page 9 is the options menu (MESC 5013) and page 0xE the joystick settings page (MESC 5009), by the control names of the page resources (Confirmed, data). That an Esc on page 9 continues the game is Confirmed at runtime (P3-05/06, code to action: the page dispatcher ran page 9 and an Esc given to the page key reader `0x371b0` returned to flight); the page code was not traced.

**Confirmed (entry points and key-read sites; P3-05/06):** the poll `0x26284` calls each context handler from one site, after `AND EAX,0xFF`: `0x26325` (flight `0x264a0`), `0x262f6` (map `0x27118`), `0x26305` (Warp `0x27360`) and `0x26314` (base `0x271e0`), so every handler receives the translated key in AL. These are the only callers (raw scan of relative calls), and no 32-bit value in the image points to any of the four entries. `0x3c970` is called only by the poll (the read at `0x262d2` and the discard loop at `0x26337`) and by the four pause loops (`0x26f41` flight, `0x27167` map, `0x273c1` Warp, `0x27265` base); inside it, `0x3c988` follows the DOS read `0x74ec8`, whose result is the character, or for an extended key the scan code shifted left by 8, before the translation `0x75048`. The energy-page prefilter `0x27ab4` is called at `0x264c8` with the key in EAX and the player's handle in EDX.

**Cross-checks:**

- **P3-06:** consistent with [flight controls](#flight-controls-and-rotation-p3-0602) and [throttle](#throttle-maximum-speed-and-speed-matching-p3-0603): no context writes a steering field, and the three non-flight contexts handle no speed or view key.
- **P3-07** (P3-05/01 compared `362f4fb3` and `589d780b` of the P3-07 work; T3, W3, D10, D15 and the P3-02 spec's CR-05 are unchanged between them and in the merged text): the leaves and helpers of `t`, `f`, `r`, `y` and `u` ([T3](#t3-entry-points-contexts-and-timing-confirmed-code)), of `/`, `,`, `<`, `.` and `>` ([W3](#w3-selection--confirmed-code)), the energy-page keys ([D10](#d10-energy-levels-keys-ssgg--confirmed-code)), the page conditions of `e` and `d` ([D15](#d15-left-display-pages--confirmed-code)) and the CR-05 command mapping agree with this reading. The forward-target mode of `u` comes from the native kind test at `0x27a35`, before message 2. This reading answers two points that T3 leaves open: upper-case `T` is the cheat-gated kill event above, and the data-keyed menus capture no letter.

##### Runtime samples (P3-05/06)

Q-05 of the P3-05 spec. Agent-alone runs on the baseline's private copy with [emulator-internal input](../../guides/runtime-measurement.md#模拟器内输入): each sample wrote one key's BIOS buffer word (and, where named, the BIOS shift flags) into the empty buffer at the keyboard poll `0x262c3` or before a pause loop's read, then read the DOS result at `0x3c988`, the AL at the handler entry and the state at the following poll. **Every sample proves code to action only**; which physical key produces the code was not obtained (the [key map](../input/key-map.md#运行样本q-05p3-0506) has the per-sample list and the reasons). Confirmed (runtime, code to action), all consistent with the static reading above:

- every DOS result and handler AL equalled the prediction of the reader and of `0x75048` (the Alt+letter code arrived as 0), and each key reached the handler of the view mode read at its poll: flight, map or Warp;
- flight: the Up and Left cursor codes switch views without touching a steering field; `5` does nothing; the Shift+5 and Shift+0 codes set the throttle presets; Alt held (the BIOS flag) gives the primary level while its letter code does nothing; `e`, `s`, `S`, `g`, `G`, `d` act as the energy-page and page rules predict;
- map: the Up code does nothing; `p` enters the map pause loop at `0x27165`, which reads Esc and keeps looping, and ends on `p` with the map still open; Esc closes the map; after one left-button report at a map read, `w` starts the Warp through the gate of the table above;
- Warp: Esc and `m` do nothing; `p` enters the Warp pause loop at `0x273bf` and ends on `p`.
- pages: Esc in flight made the page dispatcher run the page in `0x186840` (9 in the campaign mission) with the time base marked; an Esc at its key reader returned to flight in the cockpit view.

The left-button report was a declared device write into the game's copy of the INT 33h button state: at `0x653e9`, after both driver calls of `0x653c0` (the button state is already stored at block +8 and the function 0Bh counters are still on the stack, at ESP + 4 and ESP), before `0x2784c` posts it ([map mouse input](#map-mouse-input-p3-0503)). The pause loops' time-base calls were seen only as the mark at loop entry; the injected key ended each pause at once, so the removal of a paused interval was not exercised.

**No base sample (P3-05/06):** the base interior is entered by docking through the communications menu. All three base-kind objects read activity +2 = 0 at the start of the sampled flight (Confirmed, runtime reading), so docking was unavailable in that measured state. This means parked, not permanently ineligible: the [active-area toggle](#world-boundary-active-area-parking-and-autopilot-p3-0604) resumes parked objects when the player approaches. The docking predicate, the P3-05/34 attempts and the base sample that met Q-05's every-context threshold are recorded below.

##### Base docking gates (P3-05/34)

**Confirmed (native instructions):** `0x2cbb4` selects COMM menu 2003 for a base-kind object only when `0x394c4` and `0x33390` both return 1; otherwise it selects generic menu 2005. `0x394c4` requires activity +2 = 1, kind mask `0x68000`, and full three-dimensional squared distance at most 1,000,000 (1000 units). `0x33390` requires flow 3 and substate 0 (`0x339c4` reads `0x186881`). The execution search `0x3959c` instead returns the first active base-kind object strictly nearer than 1000 units; `0x38ff4` requires that result to equal the requested base reference before docking. Thus an exact-distance boundary or another earlier qualifying base can pass the menu check without satisfying the execution path.

**Confirmed (runtime exploration, not a base-key sample):** `q05-34-a-01` reached flight after a map-marker Warp. The `f` key selected kind `0x2000000` (the marker), and ordinary `a` autopilot approached that marker, not a base. The three real kind-17 bases remained parked and distant; the selected object's command menu offered value 7 rather than docking value 9. Their measured positions differed from the preceding exploration, so coordinates measured in another run did not establish a current-run route. The run timed out at the docking gate; integrity and process cleanup passed. Base-key samples were not obtained, and no conflict with Q-04 was established.

**Confirmed (second exploration, not a base-key sample):** `q05-34-b-01` reused the nearer region measured in the first attempt. This time one real base became active and the player reached docking distance; its command menu offered value 9 at `poll-08`. Substate advanced to 3 at `poll-12` and 4 at `poll-20`, but the view was still flight (12) at `poll-21`. The recipe injected Down and waited for the base handler without first gating on the base view (6); it timed out at `hk-21`. This does **not** show that docking is impossible: the recipe did not establish completion of the response/landing flow before attempting base input. Integrity and cleanup passed. Both permitted explorations are exhausted, no base sample was accepted, and further sampling requires a separately approved plan that checks current-run navigation and waits for the base context before injecting base keys.

**Confirmed (two additionally approved attempts, 2026-10-12; not base-key samples):** the recipes used current-run map/base observations and declared a docking-setup/view-6 gate before base keys; the user supplied physical map selection. `q05-34-c-01` received raw `w`, but the selected marker failed the current-base route predicate; the operator recorded `marker-not-current-base` and cancelled before the map handler executed it or started Warp. The revised `q05-34-c-02` first displayed the communications base list so the user could identify item 1, then used map-Up no-op checkpoints for selection readback. Its last calibration received `w`, not the declared Up code; the operator cancelled before that map handler ran. The last selected marker also failed the plan's distance predicate. Both reports are cancelled, with missing downstream samples and stimuli, but passed integrity and owned-process cleanup. Neither reached docking or supplied a base-key sample. **Unconfirmed:** why the physical cursor differed from the requested point or why the calibration input arrived at that stage; these failures do not establish that normal docking is unreachable. That two-run authorization was exhausted without a base sample and with no conflict against Q-04.

**Confirmed (runtime, code-to-action; user-docked, 2026-10-12):** after the bounded attempts above, the user approved flying and docking by hand. Recipe `q05-34-d` only navigates to mission start, then waits at the docking set-up breakpoint `0x39664`; the operator confirms base input only when that stop reads view 6, substate 5 and player activity 3. No recipe stimulus precedes the dock, so normal docking is reachable in this mission under physical play. `q05-34-d-02` is complete: 184/184 samples qualified, all stimuli applied, integrity and owned-process cleanup passed. At the base handler `0x271e0`, injected grey Down/Up delivered raw `0x5000`/`0x4800` and handler codes `0x86`/`0x81`; the service-list cursor moved 0→1→0 within its bounds. `p` (raw and handler `0x70`) entered the base pause loop `0x27263` with the time base marked; `p` read in that loop ended the pause with the base context kept. `l` (`0x6c`) launched to normal flight (view 12, substate 0, player activity 1). All agree with the Q-04 static conclusions. The earlier `q05-34-d-01` reached the same qualified readings, but its tool verdict failed integrity only because the coordinator wrote its own console log inside the evidence root; no original or configuration file changed. It is not counted. Physical key-to-code remains unconfirmed.

Evidence: ignored `local/research/p3-05/runtime/`, `out/s34-dock-native`, `out/s34-dock-constants`, `out/s34-activity-scan.txt`, `out/s34-approach.txt`, `q05-34-a-01/report.json`, `q05-34-b-01/report.json`, `q05-34-c-01/report.json`, `q05-34-c-02/report.json`, `q05-34-d-01/report.json`, `q05-34-d-02/report.json` and their qualified pause readings. The added attempts' frozen plans, recipes and operator notes are in the same ignored directory. Static analysis used the existing private Ghidra project with `-noanalysis -readOnly`; constants, comparisons and activity writes were checked against native instructions.

Evidence: ignored `local/research/p3-05/flight/` (`ghidra_scripts/KeyProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p13.txt`; the compare-tree evaluator `tools/tree.py` and `tools/leaves.py` with the per-code tables `out/flight-codes.tsv` and `out/prefilter-codes.tsv`; `tools/comm-keys.ts`, which outputs key classes and counts only) and `local/research/p3-05/contexts/` (`ghidra_scripts/CtxProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p12.txt`, per-code notes `codes.md`). Ghidra ran `-noanalysis -readOnly` on private copies of the project; functions created and `__watcall` set in memory were discarded. Every compare tree, the builders' key generation, the dispatcher cases and the pause loops were read from native instructions; callers were checked by raw scans of relative calls and of 32-bit values. Which keys produce which codes is recorded in the [key map](../input/key-map.md#修饰键与大小写p3-0501) (emulator side from the DOSBox-X source; host mapping Unconfirmed, the Q-05 samples prove code to action only). Runtime samples: ignored `local/research/p3-05/runtime/` (`plan.md`, recipes, `scripts/check_runs.py`, run directories); private read-only Ghidra copy for the entry and read sites (`out/p1.txt`–`out/p17.txt`).

#### Keyboard hardware and repeat (P3-05/07)

**Confirmed (the game leaves the keyboard and its repeat to the BIOS):** this adds to the keyboard sources in [flight controls](#flight-controls-and-rotation-p3-0602), which already rule out reads of ports 0x60/0x64 and a game INT 9 hook. The program also never programs the keyboard or its typematic delay and rate. A held key therefore repeats at whatever rate the keyboard, or the emulator's keyboard, puts into the BIOS buffer. The rate in the baseline and the cadence it gives with the polls above are in the [key map](../input/key-map.md#按住与自动重复q-06p3-0507).

- **No keyboard command:** no instruction writes port 0x60 or 0x64 either. Every `IN` and `OUT` goes to the VGA registers, the game port 0x201 or a port that Miles code computes from a driver's base address.
- **No game path invokes INT 16h:** no INT 16h instruction appears in the listing.
  - The only INT 16h opcode in the loaded objects is entry 0x16 of a table of 256 `INT n; RET` stubs at `0x99c90`. The generic interrupt caller `0x87085` (→ `0x99c0f`, `0x99c5c`) indexes that table with its interrupt-number argument.
  - The caller's only callers are the DOS key helpers `0x74e8c` (INT 21h function 0Bh) and `0x74ec8` (INT 21h function 07h; after a 0 it reads again and returns that value shifted left by 8). Both pass 0x21.
  - The only DPMI real-mode interrupt call (`0x87e2b`, function 0300h) issues INT 66h, the Miles driver interface.
- **Interrupt vectors written:**
  - INT 8, the Miles timer ([time base](#simulation-time-base-p3-0106));
  - the real-mode INT 66h vector (`AIL_set_real_vect`, `0x6f3db`);
  - the restore of a sound-driver IRQ handler (`AIL_restore_USE16_ISR`, `0x6f4de` → `0x87d7b`);
  - INT 23h and INT 1Bh, the C library's break handlers (`0x8f687`, `0x8f83b`, `0x8f873`, `0x8f98c`, through `0x9d019` and `0x9d044`);
  - INT 24h (`0x74726`);
  - the FPU exception vectors INT 2 and INT 75h (`0x13e95c`–`0x13eaea`, from `0xa4fa2`).

  The Miles API names come from the library's own trace strings.

Evidence: ignored `local/research/p3-05/repeat/` (`ghidra_scripts/PipeProbe.java` with added context, raw-byte and in-memory disassembly commands, `probe.sh`, outputs `out/p1-scan`–`out/p16`, notes in `notes.md`). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; instructions and functions created in memory were discarded. Bounded search:

- every `IN`, `OUT`, INT 16h, INT 9, INT 21h and INT 31h instruction in Ghidra's listing, with the instructions before each interrupt;
- raw byte scans of all loaded objects, including code Ghidra had not disassembled, for the opcodes of INT 16h, INT 9, `IN`/`OUT` with port 0x60 or 0x64, `MOV AL,0F3h`, and `MOV EDX`/`MOV DX` with 0x60 or 0x64.

Every hit outside the listing was checked. Apart from the stub table, the bytes are parts of the addresses or immediate values of other instructions, or call arguments.

### Placement, runtime scale and numbers (P3-02/02)

Static answers to Q-02, Q-03 and Q-11 of the [P3-02 spec](../../plan/p3/02/spec.md#原版研究), read from native instructions. The runtime check of P3-02/10 ([below](#runtime-check-p3-0210)) is noted where it applies: the supports, the section-5 layout addition and the rounding direction. Notation: *rand* is one call of the C library `rand()` `0x7453b`; *R(v)* is the rounding of an exact real value v to f32 under the x87 rounding control in effect ([x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202)); *C* is the f32 constant f32(1 ÷ 32767), which is exactly 2^−15 + 2^−30 = 32769 ÷ 2^30. Distances are runtime units.

**Confirmed (`rand()`):** `0x7453b` is the Watcom run-time `rand()`: a 32-bit linear congruential state at `0x1789e4` (multiplier 0x41C64E6D, increment 0x3039), returning bits 16–30 of the new state, so 0–32767. Its data getter `0x74535` returns a constant address, so the zero fallback never applies. Placement, the spawn queue and instantiation draw from this one generator.

#### Runtime scale and load conversion (P3-02/02)

**Confirmed (code):**

- The builder `0x66c00` pushes the f32 constant 15000.0 at `0x66d3e` as the only argument of `0x68d2c`: the runtime scale.
- `0x68d2c` computes q = R(15000 ÷ header 0x08) once, keeps it as f32, and overwrites header 0x08 with 15000; converting the same block again would use q = 1. With the reference scale 8000 of all 52 missions, q = 1.875 exactly.
- It walks the section-1 array once, so every section-1 record is converted exactly once, also when section 5 references it as a template or member. Position +0x24/+0x28/+0x2C becomes R(p × q): the product of two f32 values is exact in double precision, so this is one rounding. Grid spacing +0x40 becomes trunc(v × q), truncated toward zero by the conversion helper `0x74518`.
- Section-3 rectangles (all four i32 values) and section-4 elements (the eight i32 values at +4–+0x20) likewise become trunc(v × q). v × q is exact for |v| < 2^29, so the result is the exact product truncated toward zero; with q = 1.875 that is trunc(15v ÷ 8), and negative values move up. Every rectangle coordinate of the 52 missions is a multiple of 8 (local data count), so no truncation occurs in shipped data.
- Records reachable only through section 5 are not converted, and section 6 is not scaled (element-0 y/z swap only, [scenario §2](./scenario.md#2-scen-header-confirmed-on-all-52-entries)).
- `SCCT` wingman records are never converted: `0x68d2c` touches only the current `SCEN`, and the only instructions that read the `SCCT` pointer `0x1766f8` (in `0x66c00`, `0x67018`, `0x6721c` and `0x67678`) scale nothing. Their spatial fields are therefore runtime units, and dispatch places them from the `SCCT` array itself (source 2).
- World rectangle: `0x3a380` keeps the low 16 bits of header 0x00 and 0x04 as signed 16-bit sector counts n and the runtime scale; `0x3a41c` returns ±trunc(n × 15000 × 0.5) per axis, that is ±7500 × n exactly. A half extent of n × s ÷ 2 in reference units (s = header scale) times 15000 ÷ s gives the same value. Default placement `0x68c98` instead reads the full 32-bit header values; they are equal for all 52 missions (at most 14).

#### Placement mappings (P3-02/02)

**Confirmed (`0x68398`, beyond the [selection order](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely)):**

- The stored-position test masks the sign bit of each of the three f32 words, so ±0 counts as zero; any other bit pattern selects the stored position, copied bit for bit.
- After the selected routine: the world check below; then the per-sector resource test `0x6a11c` (the one instantiation uses, see [object table](#runtime-object-table-p3-0201)), on whose failure `0x68398` returns −1 and dispatch creates nothing; then the initial pose below; then z = 1000.0 for kinds in mask `0x87c` (`0x68598` also sets it for its own three routes).
- The fourth argument, message +0x18, reaches only the grid routine `0x685e0`.
- Other callers: the rescue `0x67b98` calls `0x68398`; the parked travel `0x2f314` calls `0x68598` for a new goal point on arrival in AI mode 4 ([parked update](#world-boundary-active-area-parking-and-autopilot-p3-0604)); `0x68050`, called by instantiation, calls `0x68c98` or the path routine `0x688c4` to set object +0xAC–+0xB4 when the new object has no AI target from `0x68018`: the initial goal point, which the parked travel `0x2f314` reads (Confirmed by P3-06/04 and 05, [parked update](#world-boundary-active-area-parking-and-autopilot-p3-0604), [`0x68050`](#initial-flight-state-p3-0605)), and `0x688c4` also calls `0x68c98`. Those draws belong to instantiation.

| Routine | Draws, in order | Result | Support |
|---|---|---|---|
| Rectangle `0x6883c` | x, y | x = R(x0 + \|x1 − x0\| × rand × C), y = R(y0 + \|y1 − y0\| × rand × C), z = +0 | From x0 (rand 0, exact) up to the rounding of x0 + \|x1 − x0\| × (1 − 2^−30) (rand 32767); likewise y. The span starts at x0 whatever the order of x0 and x1; all 189 rectangles of the 52 missions have x0 ≤ x1 and y0 ≤ y1 |
| World `0x68c98` | x, y | W = trunc(header 0x00 × 15000), half = W shifted right by 1; x = R(W × rand × C − half), y likewise from header 0x04, z = +0 | From −half (exact) up to the rounding of half − W × 2^−30 |
| Anchor `0x68708` | x sign, x size, y sign, y size, z sign, z size | Offset s × m per axis: s = +1 for an even rand, −1 for an odd one; m = 400 + (rand mod 200); x = R(px + s × m), likewise y and z | Offsets ±400 to ±599 inclusive on every axis, never 0 |
| Stored position | none | Record +0x24–+0x2C after conversion | One point |

- **Precision:** for these three routines every intermediate is exact in double precision while coordinates stay below 2^22 in magnitude (worlds reach 105,000), so each coordinate is one rounding of an exact rational value; for the rectangle, (x0 × 2^30 + \|x1 − x0\| × rand × 32769) ÷ 2^30. The world check and the pose normalisation below round at every step.
- **Endpoints:** in every case the result is R of the exact value; the lower ends are attained exactly. For rand 32767 the exact value lies \|x1 − x0\| × 2^−30 (world: W × 2^−30) below the upper end. When that deficit is smaller than the f32 spacing below the end, round-to-nearest (ties to even) gives the end itself if the deficit is also below half that spacing, and chop gives the f32 just below a positive end and the end itself for a negative one. That holds for every shipped world and every shipped rectangle axis except those whose upper end is exactly 0, where both directions give the exactly representable −\|x1 − x0\| × 2^−30: 15 of the 364 rectangle axes whose ends differ, one of them in the slice mission (local data count).
- **Preimages:** each coordinate of the rectangle and world routines uses one rand; the exact value rises strictly with it and the rounded value never falls. For every shipped world and every rectangle axis whose ends differ (364 of 378; the other 14 give one value), the 32,768 values give 32,768 distinct f32 results under either rounding mode, so every result has exactly one preimage (local enumeration). Small spans far from the origin can map several values to one result; counts then come from enumerating the 32,768 values. For the anchor, each sign has 16,384 preimages; m = 400–567 has 164 and m = 568–599 has 163 (168 × 164 + 32 × 163 = 32,768).
- **Correlation:** every axis consumes its own sequential calls, in the order listed, and the code adds no other link between axes. All calls come from one LCG, so consecutive values are deterministic functions of its state; their joint distribution was not analysed. A section-5 layout cycle shares one anchor computation (below).
- **Anchor lookup:** `0x68708` walks the list of the anchor record's kind (`0x5261c` with that kind as the mask, so a kind-0 anchor record finds nothing) from its head and takes the first object whose source record +0x190 is the anchor record: the oldest one still in its list, whatever its state (objects in states 4–6 stay listed until removal, see [object table](#runtime-object-table-p3-0201)). It reads that object's position +0x6C–+0x74 at that moment. When none exists it calls `0x68c98`, with that routine's two draws.
- **World check:** after every routine, x and y are compared with the world rectangle inset by 200: the point is inside when −X + 200 ≤ x ≤ X − 200 and the same holds for y (X = 7500 × n, bounds included; integer bounds against f32, exact). Otherwise it is moved once 300 units toward the origin in the x/y plane: L = √(x² + y²), dx = R((x × (1 ÷ L)) × −300) and dy likewise, each step rounded to double; then x = R(x + dx), y = R(y + dy); z is unchanged. There is no clamp and no second check: a point still outside stays outside. A world-default point always ends inside for worlds of at least 3 sectors, because the move reduces each coordinate in the band by more than 200. One of the slice mission's three rectangles reaches into the band (local data count), so this applies to some of its placements.
- **Initial pose:** with the final x and y, the third row is f = (sx, sy, 0) × c, where sx = +1 when x ≥ 0 (also for −0) and −1 otherwise, sy likewise, and c is the f32 0.70710677 (bits 0x3F3504F3) that `0x56aa8` produces from (±1, ±1, 0) under either rounding mode. The second row is (0, 0, 1) and the first is (−fy, fx, 0) (its z can be −0). `0x67938` copies the rows to object +0x48, +0x54 and +0x60 and the position to +0x6C–+0x74 unchanged. Movement mode 0 (`0x222f0`) advances the position along the third row, so the new object faces away from the world centre along the diagonal of its quadrant.

**Confirmed (runtime, support membership; P3-02/10):** in the two runs of the [runtime check](#runtime-check-p3-0210), all 113 positions lay in the supports above, derived from the rectangles, the anchor position and the world size read in the same run: rectangle routes, anchor routes around the player, and one opening point moved by the world check. Distributions, preimage counts and the correlation between draws were not tested at runtime. The pose was not read.

#### Section-5 dispatch (P3-02/02)

**Confirmed (`0x67678`):** the message carries a source (+0x14: 1 a section-5 entry, 2 a `SCCT` wingman record, otherwise a section-1 record) and an index (+0x10).

- **Section-1 record or wingman:** one `0x68398` on the record, then `0x67938`, then record +0x18 is incremented. A failure of either step skips the rest.
- **Section-5 entry:** with header 0x0C set, `0x69194` runs first (not in the slice). Then, for member i = 0 … count − 1 in member-array order, with L the layout count (a signed division; L is positive in shipped data and a zero count would fault):
  - when i mod L = 0, entry +24 is cleared and `0x68398` on the template computes a new anchor A and pose; the template's own route, world check, resource test and fixed height apply to A;
  - member i is placed at R(A + l) per axis, with l = layout[i mod L] (f32 runtime units). It is neither scaled nor checked against the world and gets no fixed height; it takes the cycle's anchor pose. At runtime all 14 second members of the two runs of P3-02/10 equal R(member 0 + layout[1]) bit for bit, member 0 being the anchor plus the zero layout[0] (Confirmed, runtime);
  - the template's +0x58 is copied into the member record when it is non-zero, and the template's +0x5C when it is non-zero, before each member's instantiation. The copy persists in that record, which may alias a section-1 record;
  - after instantiation, entry +24 is set to member i's node when i mod L = 0; later members of the cycle get a counted reference to it (`0x52898`): the formation leader, and object +0x80–+0x88 is set to R(l − layout[0]): the formation offset. Both were Likely; P3-06/04 confirmed them through their consumer, the formation snap of the [parked update](#world-boundary-active-area-parking-and-autopilot-p3-0604);
  - a failed anchor or instantiation ends the request: later members are not created and entry +20 is not incremented. After the last member, entry +20 is incremented.
- **Draw order:** a request's placement draws come before the draws inside `0x67938` (names `0x67d44`, `0x3060c`, `0x68050` and the timer at object +0xC8 for kinds other than 1 and 2), which belong to Q-04, Q-05 and Q-07. In a section-5 request the order is: the first anchor, member 0's instantiation, the following members of the cycle, then the next anchor.

#### x87 precision, rounding and trigonometry (P3-02/02)

**Confirmed (code):**

- **Start-up control word:** the run-time's FPU initialiser `0x8f45e` (an entry of the start-up table at `0x17f2c2`) detects the FPU and loads the control word stored at `0x17c980`, 0x127F: 53-bit (double) precision and round to nearest. `0xa505c` then unmasks the invalid-operation, divide-by-zero and overflow exceptions (0x1272) without changing precision or rounding. Every x87 add, subtract, multiply, divide and square root therefore rounds to double; FSIN, FCOS and FPATAN are not affected by the precision control.
- **Integer conversion:** every float-to-integer conversion on the paths above calls `0x74518`, which switches to 64-bit precision and chop, rounds to an integer and restores the control word: C truncation toward zero.
- **Rounding direction:** ten routines of the renderer object store the control word, set the rounding control to chop (OR 0x0C00), load it and never restore it; their FLDCW instructions are at `0x14392c`, `0x144358`, `0x1458cb`, `0x147ddb`, `0x14a8b5`, `0x14f9b1`, `0x1548aa`, `0x156bc2`, `0x1593e6` and `0x15d482`. A raw byte scan of the code objects for every x87 control-word, environment and state load (FLDCW, FLDENV, FRSTOR, FNINIT) finds besides them only the start-up initialisation (`0x8f45e` and `0x9cfaa`), the exception-mask pair `0xa5000`/`0xa505c` (low byte only), `0x74518`, the FPU exception handler at `0xa5173`, which keeps bits 8–11, and the run-time's save/restore pair `0x8f41a`/`0x8f41f`; the other byte matches are ModRM bytes inside other instructions or data. The start-up code stores the save/restore pair as hook pointers at `0x17c978`/`0x17c97c`, and no instruction or data word anywhere in the image reads those addresses, so `FRSTOR` never runs on the game's behalf. From these code facts P3-02/02 inferred that after the first call of one of the ten the program runs with double precision and chop until it exits, so that every rounded arithmetic result and every f32 store rounds toward zero. **That inference is contradicted at runtime** for every placement observed by P3-02/10 (runtime observation below); the code facts themselves stand.
- **Storage on the placement path:** positions are f32 (records +0x24–+0x2C, object +0x6C/+0x70/+0x74 for x, y, z); the pose is nine f32 values in three rows; rectangles, grid spacing and section-4 values are i32; the constants 200 and 400–599 are integers and 300 is a double. `0x67938` sets object +0xD0 to trunc((record +0x60 × 0.01) × the +0x9C value of the per-kind record that `0x2d2d8` returns), each product rounded to double (the meaning belongs to Q-07).
- **Axes:** x and y span the sector plane (world rectangle, sector mapping `0x3a61c`) and z is the axis out of that plane, called height here: rectangle and world placements set z = 0 and the fixed-height kinds 1000. No rule has gravity or a preferred up (Likely, P3-06/05). The player's pose is the identity whatever placement computes, so it starts with forward along +z, perpendicular to the sector plane, and up along +y ([initial flight state](#initial-flight-state-p3-0605)).
- **Square roots and trigonometry:** lengths use FSQRT (the world check and the normalisation `0x56aa8`). No routine containing FSIN, FCOS or FPATAN is reachable by direct calls from `0x67678`, `0x68398` or `0x67938`. The orientation rotations `0x228cc` (rows 2 and 3), `0x22a50` (rows 1 and 3) and `0x22990` (rows 1 and 2) take an f32 angle, compute FCOS and FSIN, store both as f32 and rotate the two rows; movement integrators `0x222f0` (mode 0), `0x22600` (mode 3) and `0x2285c` (mode 2) and the routines `0x25dc4`, `0x2b00c` and `0x31094` call them. Other FSIN/FCOS users are `0x45420`, `0x46fe0` (the cockpit presentation that follows the effective row-3 rate, [movement stage](#movement-stage-and-integration-p3-0601)), `0x5b54c`, `0x5eb64`, `0x92b74` and the start-up initialiser `0x568b0` ([numbers](#numbers-on-the-movement-path-p3-0601)), and FPATAN is in `0x85a8b`, called from `0x489d0`, `0x5cd1c`, `0x7558a` and `0x82c48`; the roles of these and of the other FSIN/FCOS users are in [combat numbers](#numbers-on-the-combat-paths-p3-0707) (P3-07/07).

**Likely (no trigonometric tables):** a scan of all four objects for sine or cosine tables found none: f32 and f64 of amplitude 1, i16 of amplitudes 2^8–2^15, i32 of amplitudes 2^12–2^30 (including 16.16), 32 to 65,536 steps per turn, starting at angle 0. The same scanner finds synthetic tables in those encodings. With the FSIN/FCOS rotations above, angles are therefore computed with x87 instructions, not looked up. The direction table that `0x568b0` builds at start-up with FSIN/FCOS is not stored in the image and serves random directions, not rotations ([numbers](#numbers-on-the-movement-path-p3-0601)). Fixed point remains confined to the renderer ([§2](#2-linked-libraries-confirmed-unless-noted)).

**Rounding at a given placement (code inference of P3-02/02; contradicted by runtime for flight placements):** that the ten chop routines run whenever 3D geometry is rasterised is Likely (they are entries of the renderer's function tables, for example `0x145794` at `0x17cc30` and `0x17cc38`). A mission's opening spawns are placed in the dispatcher of the frame that builds it, before that frame's render `0x3ee58`: the clips and the build count as elapsed mission time ([time base](#simulation-time-base-p3-0106)), so the time-0 entries are due at the first queue check (Likely; it needs the elapsed time to exceed 0). The inference was that the rounding is history-dependent: placements in a retry, in any later mission and after the first rendered frame of a mission round toward zero (formerly Likely; **contradicted at runtime** for placements about 9,000 frames into a mission), while the opening placements of the first mission after start-up round to nearest unless earlier menus or pages rasterised 3D (formerly Unconfirmed; round to nearest at runtime). Retries and later missions were not observed. Placements and their supports are given for both directions. A runtime reading of the control word at `0x68398` would show it for a given run, though whether the baseline emulator applies the rounding control to arithmetic and f32 stores was not checked.

**Runtime observation: round to nearest (P3-02/10).**

- **Confirmed (runtime, baseline DOSBox-X):** in the two complete runs of the [runtime check](#runtime-check-p3-0210), every one of the 113 placed positions is consistent with round to nearest. 77 are consistent with round to nearest only and none with chop only; the other 36 give the same f32 under either direction, among them the 14 layout additions.
- The 77 are 72 opening placements of the first mission after start-up (one of them moved by the world check, whose double-precision steps then also rounded to nearest) and 5 anchors of the delayed section-5 group, placed about 9,000 frames (main-loop iterations, each with one frame render) after the build frame. The user gave no flight input in either run; which 3D geometry was rasterised in that time was not observed.
- So at these placements the stored f32 results were rounded to nearest, and chop was not in effect for those stores, contrary to the inference above.
- **Cause (Unconfirmed):** one of
  - a control-word load or restore that the scan missed, for example in code outside the scanned LE objects (the DOS extender or an interrupt path);
  - the ten routines not having run before these placements;
  - the emulator not applying the rounding control to these operations. The 80-bit-to-f32 store conversion of current DOSBox-X master honours the rounding control (`convertToIEEE` in `src/fpu/fpu_float80.cpp`); whether the installed 2026.08.31 build takes that path and behaves the same was not verified.
- A breakpoint on one of the ten `FLDCW` sites during flight, or a read of the FPU control word at `0x68398`, would separate these explanations. Until then the runtime result is the observed behaviour of the baseline (U-009).

**Runtime observation in flight (P3-06/17):** the movement write-backs of mode 0 round to nearest too: 82 discriminating same-frame pairs in flight all match round to nearest and none chop ([runtime check](#runtime-check-p3-0617)). Confirmed (runtime, baseline DOSBox-X); the cause above stays Unconfirmed.

**Handoff:** P3-06 owns the movement integrators and rotation helpers (f32 angles, x87 FSIN/FCOS whose results are stored as f32; the rounding points, the start-up throttle and direction tables and the role of `0x46fe0` are in [numbers on the movement path](#numbers-on-the-movement-path-p3-0601) and [movement stage](#movement-stage-and-integration-p3-0601)); P3-07 owns the FPATAN users and guidance. Both inherit the double precision above; for the rounding direction they inherit the runtime observation (round to nearest) and its open cause, not the chop inference.

Evidence: ignored `local/research/p3-02/placement/` (`ghidra_scripts/PlaceProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p25.txt`; the image scan `sine-scan.py` with its self-test; the data counts `rect-check.ts`, `rect-preimage.ts` and `endpoint-check.ts` with their JSON). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and disassembled in memory were discarded. Constants were read from the data object; the raw x87 control scan and the call-site scans cover every initialised byte of the code objects.

### Spawn queue, defaults, names and instantiation (P3-02/03)

Static answers to Q-01, Q-04, Q-05, the code part of Q-06 and Q-07 of the [P3-02 spec](../../plan/p3/02/spec.md#原版研究), read from native instructions. What the runs of P3-02/10 confirmed at runtime is in the [runtime check](#runtime-check-p3-0210) at the end of this section and marked where it applies. *rand* is the C library `rand()` of [placement](#placement-runtime-scale-and-numbers-p3-0202) (0–32767). The record fields are those of [scenario §3](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely), which lists each field's default and meaning. *Elapsed* is the sample minus the scheduling origin `0x176740` ([time base](#simulation-time-base-p3-0106)); due times are u32 clock units and every comparison of them is unsigned.

#### Spawn queue (P3-02/03)

**Confirmed (scheduling `0x6721c`):** the builder `0x66c00` calls it once per build, after the rescale and before it sets the origin and the spawn enable flag `0x17670c`. It replaces the queue (array `0x1b46f8`, count `0x1b46f0`, capacity `0x1b46f4`) with room for (section-1 count + section-5 count) entries of 12 bytes {due, index, source}, where source 0 is a section-1 record, 1 a section-5 entry and 2 an `SCCT` wingman record. It then inserts, in this order:

1. For each section-1 record i in array order: the record's defaults (`0x6744c`, [below](#record-defaults-p3-0203)); then, when its kind is non-zero and +0x3C is zero, either the entry {+0x1C × 64, i, 0} or, when +0x30 is non-zero, a spawn pair on a section-2 trigger (`0x69708`, scenario §3 +0x30); then, when its kind is exactly 1 and the wingman selector is positive, the defaults of the selected `SCCT` record and the entry {0, w, 2} (below).
2. For each section-5 entry j in array order: {template +0x1C × 64, j, 1}, or the pair −1 − j through `0x69708` when the template's +0x30 is non-zero.

A failed allocation makes the build fail.

**Confirmed (ordering `0x67584`):** the array is kept in descending due order, and the processor takes entries from its end. A new entry goes before the first stored entry whose due time is less than or equal to its own, so it is taken after every earlier entry with the same due time. Entries are therefore taken in ascending due order, and in insertion order among equal due times: time-0 entries fire in section-1 array order, with the wingman directly after the kind-1 record, and then the section-5 entries. The array grows by one entry when it is full.

**Confirmed (wingman gate and selection):**

- The selector is the builder's third argument: the byte `0x186880` on the practice branch of `0x3266c`, the getter `0x33940` on the campaign branch ([mission result](#mission-result-success-path-and-campaign-restart-p3-0104) names `0x186880` as its cell).
- A selector of 0 queues no wingman. A positive selector s is clamped to 1 … n, where n is the `SCCT` record count at +0x0C (5), and w = s − 1.
- The entry is queued while scheduling a section-1 record whose kind is exactly 1 and whose +0x3C is zero, whatever that record's own route (time queue or trigger). The wingman record's own +0x1C is not read: its due time is 0.
- The selector variable is then overwritten by w, so a second kind-1 record would queue record w − 1 when w > 0. Every one of the 52 missions has exactly one kind-1 record (local count), so a mission gets at most one wingman entry.
- **Selection page (Confirmed, code; P3-02/10):** the new-campaign reset `0x330fc` sets `0x186880` to 1. The pre-mission page 0xF sets the image index of its wingman chapter (chapter element type 4) to `0x33940()`. Its two image-step buttons (keys `u` and `d`) add +1 and −1 to that index, wrapping over the chapter's 6 images. Its confirm button (`x`, Enter, Space; callback `0x367e4`) turns to the next chapter, or in the wingman chapter calls `0x33938` with the index and leaves the page. Esc leaves the page without calling the setter. The index is therefore the selector: 0 for no wingman, 1–5 for records 0–4. That index 0 shows the no-wingman card of [B-003](../behavior/B-003-campaign-flow.md) is Likely (the image order was not traced).
- **Runtime (Confirmed, selectors 0 and 1 in the selected mission; P3-02/10):** Esc on the briefing kept selector 1, and one `d` in the wingman chapter followed by Enter gave 0, as read from memory at every stop. With 0 the build queued no wingman entry and no kind-2 object appeared; with 1 the build queued exactly {0, 0, 2} directly after the kind-1 record and instantiated exactly one kind-2 object from `SCCT` record 0 ([runtime check](#runtime-check-p3-0210)). Selectors 2–5 and the clamp are code-only.

**Confirmed (processing `0x67018`):** called once per dispatcher pass while `0x17670c` is set, before the message loop ([frame pipeline](#frame-pipeline-p3-0201)). It computes elapsed once. While the queue is not empty and elapsed is greater than the due time of the last entry, it removes that entry and:

- **reads** the record and the request count: for source 0 the section-1 record and its +0x10, for source 2 the `SCCT` record and 1, for source 1 the entry's template and the entry's +0;
- **limit:** when the record's +0x14 is non-zero, source 0 continues only while record +0x18 < +0x14, and source 1 only while entry +20 < template +0x14 (signed); source 2 is never limited. A limited entry is dropped: it posts no request and is not repeated. The comparison is made before the requests of this firing are counted, so the total can exceed the limit (below);
- **music:** for a record of a kind in `0x93780` whose +0x48 names a kind-1 record, in a mission whose header 0x0C is zero, it calls the music routine `0x561f0` when origin + 0x80 is greater than elapsed (music belongs to P4);
- **probability:** when record +0x80 is zero it draws one rand and posts the requests only when rand % 100 < +0x0C (signed), also when +0x0C is 100. When +0x80 is non-zero it draws nothing and posts them only when `0x176714` is non-zero. That cell is the builder's fourth argument: on the campaign branch the flag `0x18684c`, which main-flow state 2 sets to (rand % 100 ≥ 50) before the briefing page (`0x3276a`); 0 on the practice branch;
- **requests:** posts that many 0x4000 messages (none when the count is ≤ 0) with +0x10 the index, +0x14 the source and +0x18 the request number 0, 1, …. Then, when elapsed exceeds `0x17674c`, it calls `0x3f09c` (renderer viewport set-up through `0x3d0b0` and `0x3d324`; purpose not analysed) and sets `0x17674c` to elapsed + 0x280; nothing resets `0x17674c`;
- **repeat:** when the record's +0x20 is positive (signed), it re-inserts {previous due + +0x20 × 64, index, source}, whether or not the roll posted requests.

Every due entry is therefore handled in the same call, including repeats that are already overdue, in ascending due order, and one entry's requests are consecutive messages. Counters are incremented only at instantiation ([object table](#runtime-object-table-p3-0201)), so neither the requests of one firing nor those of overdue repeats in the same call count against the limit: a limit caps the number of firings that start below it, not the number of objects.

**Confirmed (dispatch order):** the message loop handles the 0x4000 messages after those of the mission flow and of the update walk, in posting order. Each goes through `0x67678` ([section-5 dispatch](#section-5-dispatch-p3-0202)): one object for sources 0 and 2, every member for source 1. Objects are therefore instantiated in queue order, request by request and member by member, while the main-flow state is not 1.

**First queue check (code Confirmed; firing of time-0 entries Confirmed at runtime, [P3-02/10](#runtime-check-p3-0210)):** after the build, `0x3266c` sets main-flow state 3, samples again (`0x328da`) and returns. The same main-loop iteration then runs `0x25894`, `0x20938` and `0x20d10`, so the first queue check falls in the build frame, before its render. The origin is the sample current when the builder runs ([time base](#simulation-time-base-p3-0106)). Time-0 entries fire at that check when elapsed is already positive, that is, when the raw counter has advanced since that sample (the clips and the build take time; positive in both runs of P3-02/10, which dispatched every due entry at that check). Any later entry fires at the first check whose elapsed exceeds its due time, however late.

The success path clears `0x17670c` ([mission result](#mission-result-success-path-and-campaign-restart-p3-0104)); no entry fires after that.

#### Record defaults (P3-02/03)

**Confirmed (when `0x6744c` runs):**

- Only `0x6721c` calls it: once per build on every section-1 record in array order, whatever its kind, back-reference or route, and once on the selected `SCCT` record right after the kind-1 record's scheduling.
- It writes into the loaded record. Defaults are therefore per record, not per object: every object instantiated from a record shares the filled values, so does every section-5 alias of that record, and the +0x58/+0x5C copies of [section-5 dispatch](#section-5-dispatch-p3-0202) stay in the record.
- Dispatch does not call it. In the 52 missions every section-5 template and member is a section-1 record (617 member slots, local count), so every record that dispatch instantiates has been filled.

**Confirmed (fresh at every build):** each build drops its reference to the previous `SCEN` (`0x6b03c`) before it loads the slot's `SCEN` (`0x6affc`). The builder is the only loader of `SCEN` entries ([data loaded by the loop](#data-loaded-by-the-loop-p3-0110)), and every `SCENARIO.NOB` entry has directory flags 0, so the block is freed and read again from the archive. Defaults, spawn counters, copied +0x58/+0x5C and the rescale therefore start from the file values in every build, including a retry. The builder also reallocates and zeroes the name-pool use counters `0x176718`.

**Confirmed (`SCCT` records persist):** `SCCT` 3123 is loaded once at start-up by `0x66bbc` and never released. A wingman record is filled the first time it is scheduled in a program run and keeps those values, including its random +0x78; only +0x48 is rewritten at every fill. Its +0x18 counter keeps counting across missions; nothing reads it for source 2.

**Confirmed (draws):** one rand for each record whose +0x78 is zero when it is filled (rand % 60 + 20: values 20–27 have 547 preimages each, 28–79 have 546), in record order, with the wingman record's draw (first fill only) right after the kind-1 record's. No other default draws.

**Confirmed (runtime, P3-02/10):** in both runs every object's +0xDC/+0xE0/+0xE4 (step 8 of [instantiation](#instantiation-p3-0203)) equalled these defaults applied to its source record's file values, read before scheduling, and objects of one record shared them, including `SCCT` record 0 on its first fill. Zero and positive file values occurred for all three fields; the negative branches did not occur and remain code-only ([runtime check](#runtime-check-p3-0210)).

#### Names (P3-02/03)

**Confirmed (`0x67d44`):** the name is copied into the new object at +0x15C, which the allocator sets to the empty string. The record selects, in this order:

| Condition | Name |
|---|---|
| Kind in `0x6001` (kinds 1, 0x2000 and 0x4000) | The kind's type name |
| Candidate count +0x08 ≥ 1 | The first candidate, in list order, that no object of the kinds in the check mask holds. The mask is `0x68000` when the record's kind is in `0x78000`, otherwise `0x87c`; each candidate is compared with every object of those kinds by the C library `strcmp` (`0x75670`). When every candidate is held: a random one (rand % count, a duplicate) if section 0 is non-empty, otherwise no name |
| No candidates, kind in `0x93780` | The type name |
| No candidates, kind in `0x78000` | No name |
| No candidates, section 0 empty | The type name |
| No candidates otherwise | The section-0 pool: from rand % pool count, the first name, cycling forward, whose use counter is zero; its counter is incremented. When no counter is zero, all are reset and the starting name is taken (its counter becomes 1) |

- **Type name:** the string at +4 of the object's `CINF` craft record (`0x2d2d8`: the record of the kind bit in the `CINF` that `0x2cf38` loaded, [weapon records](#weapon-records-and-the-first-missions-shooters-p2-1230)). In `CINF` 4037 all 20 craft records hold a relocated pointer at +4 to a printable NUL-terminated string of at most 7 bytes (local count). The text is `CINF` data; the `SCEN`, `SCCT` and M2ID logic payloads do not contain it.
- **Occupancy and release:** a candidate is held while an object of the masked kinds bearing that name is still in its kind list, whatever its state; removal releases it ([object table](#runtime-object-table-p3-0201)). The mask, not the record's own kind, decides which objects count: a kind-2 wingman checks `0x87c`, which contains no kind-2 object, so it always gets its first candidate. Pool counters are never decremented on removal; they reset only when every pool name is in use, and at each build.
- **Draws:** only the random-candidate fallback and the pool draw (one rand each).
- **Shipped data (local counts over the 52 missions):** no record of a kind in `0x6001` has candidates; all 60 records of kinds 0x20000 and 0x40000 have candidates, so the no-name row is not reached; 21 records with candidates use the `0x87c` mask; 165 records without candidates and outside `0x6001`, `0x93780` and `0x78000` take the pool, or the type name when section 0 is empty.

#### Instantiation (P3-02/03)

**Confirmed (`0x67938`, in order):** given a record, a position and a pose, it:

1. Allocates the object of the record's kind ([object table](#runtime-object-table-p3-0201)); wave mode (header 0x0C) runs `0x69344`.
2. Runs the resource test `0x6a0b8` (failure as in the object table).
3. Sets +0x1C to the `CINF` craft record of the kind (`0x2d2d8`); `0x2d400` builds the weapon mounts from it.
4. Names the object (`0x67d44`, above) and sets +0x190 to the record (its source).
5. Copies position +0x6C–+0x74 and pose +0x48–+0x68 from placement ([placement mappings](#placement-mappings-p3-0202)).
6. Sets +0xD0 from record +0x60 and craft +0x9C ([x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202)): `FILD` of the record value times the `f64` constant `0x1725c4`, times `FILD` of craft +0x9C, then `FISTP` after the truncation call `0x74518` (Confirmed, code, P3-07/12; ignored `local/research/p3-07/rule-data/out/p5`).
7. Calls `0x3060c` with record +0x68, record +0x64 and 100. For kinds in `0xfffff` it sets +0x28 = (craft +0x54 ÷ 100) × the first, +0x2C = craft +0x5C × the second ÷ 100, +0x30 = craft +0x74 × 100 ÷ 100 (integer divisions truncate), +0x34 = 1 and +0x38 = 2 for kind 1, +0x3C and +0x40 from other craft fields, the maximum speed +0x78, +0x20 = sample, +0x44 = 1 and +0x24 = sample + 128 + rand % 64 (one draw). Other kinds get only +0x78. The maximum speed (`0x30e0c`) is craft +0xB8; for kind 1 it also depends on +0x3C, +0x40 and the two-bit field 2 below.
8. Copies record +0x70, +0x74 and +0x78 to +0xDC, +0xE0 and +0xE4 (no `CINF` dependence).
9. Clears 19 two-bit fields in the words at +0xE8 and +0xEC (`0x52a84`, shift and mask tables at `0x1760b4`–`0x176113`).
10. Runs `0x68050` (initial AI target and goal: the AI target +0x90 through `0x528e8`, the goal point and mode +0xAC–+0xC4; formerly "the target reference", corrected by P3-06/05: it never writes the player target +0x8C; branches and draw counts in [initial flight state](#initial-flight-state-p3-0605)): kinds 0x8000, 0x10000, 0x20000 and 0x40000 get only +0xC4 = 1, kinds 0x2000 and 0x4000 only +0xC4 = 5. The others take the nearest object of the kinds `0x68018` gives, or a random one of them (rand % count) when the nearest is of the other side and farther than 3 × the runtime scale; without such an object, a goal point from `0x68c98` or from the path routine `0x688c4` (one more rand when record +0x50 is 2). Its draws depend on the objects present.
11. Sets +0x18 to the sample: the time of the last parked update, which the parked-object update `0x2f1b0` compares with the sample (after its own rand) and rewrites; the Warp-out request (message 0x800000) also writes it, and parking and resuming leave it ([parked update](#world-boundary-active-area-parking-and-autopilot-p3-0604)).
12. For kinds other than 1 and 2, sets the Warp timer +0xC8 = sample + rand % 0x2D00 (one draw). The Warp start `0x2be00` refuses a Warp while +0xC8 is non-zero and the sample is below +0xC8 + craft +0xA4 × 64; the parked travel `0x2f314` (Warp eligibility through `0x2ff98`, [parked update](#world-boundary-active-area-parking-and-autopilot-p3-0604)), `0x2f298` (from the parked update and from the generic update callback) and the Warp completion `0x2bf08` read or set it. The initial value lies 0–180 s after the instantiation, so it postpones the first Warp, or Warp out of the world, of every craft other than the player and the wingman.
13. Runs `0x20990`: the update callback +0xC by kind and, for the AI kinds ([difficulty readers](./scenario.md#difficulty-readers-p3-01), path 3), the AI program +0x10 (`0x5dbc8`; its draws were not analysed).
14. **Activity:** sets +2 = 1 when the kind is 1, when header 0x0C is set, or when `0x3a540` finds the position inside the active area; otherwise +2 = 0 (parked) and step 15 is skipped. `0x3a540`, which the area check `0x3a4b0` also uses, returns 1 at once when header 0x0C is set. Otherwise it returns 0 while the player state holds no player object, and 1 exactly when (cx − x)² + (cy − y)² < 56,250,000, the f32 that `0x3a380` stores at `0x186b44` at the build (runtime scale² × 0.25: a circle of radius 7,500 in x and y). (cx, cy) is the player object's position, or player-state +0x10/+0x14 while the player object's +0xCC is set.
15. **Active objects:** `0x2c3b0` creates the movement block (+8) in mode 0 with throttle 0x80, the object's position and its pose, sets the block's speed to the throttle-table entry for 0x80 (`[0x1761dc]` + 0x200; the table is built at start-up by `0x568b0`, [numbers](#numbers-on-the-movement-path-p3-0601)) × +0x78, which equals +0x78 exactly ([initial block](#throttle-maximum-speed-and-speed-matching-p3-0603)), and posts a renderer creation item (type 4). For kind 1 it passes the identity matrix instead of the pose and `0x21794` writes that back to the object, so **the player's pose becomes the identity** (rows (1, 0, 0), (0, 1, 0), (0, 0, 1)) whatever placement computed. Next, kinds in `0x93780` call `0x38cd4`: when the head of the kind-2 list is active and in state 7 or above, the sample has passed `0x174e0c`, and the new object lies within 3,500 of it (squared 3D distance below the f32 12,250,000), the wingman reports through communications message 8 (`0x38d54`, one rand when it reports) and `0x174e0c` is set to the sample + 0x280. Kind 1 then sets up the player state: view mode +0x28 and previous view mode +0x29 to 0xC, byte +0 to 0, the player reference +0x8C to the object, +4–+0xC and +0x10–+0x18 to (0, 0, 0), and a presentation item (type 4, bytes 2 and 5).
16. Posts object event 3 through `0x6977c`: marks the kind bit as seen in the per-kind table `0x1b45b4` (−1 becomes 0); counts an instantiation in the record's +0x54 trigger (+8) and evaluates that trigger's spawn pairs (`0x695c0`); and sets `0x176744` (kinds in `0x68000`) or `0x176748` (kinds in `0x7c`) to 1 when negative (reader `0x69e1c`, not traced).

`0x67678` then counts the spawn and, for section-5 members, records the leader and the formation offset ([section-5 dispatch](#section-5-dispatch-p3-0202)).

- **Independent of the craft record:** source, name rule (the type-name text itself is `CINF` data), position, pose (the identity for the player), +0xDC/+0xE0/+0xE4, the parked-update time +0x18, the Warp timer +0xC8, activity, the player state and event 3.
- **Speed (Confirmed):** only active objects get a movement block, and its initial speed is the throttle-0x80 entry times the `CINF` maximum speed; parked objects have neither. P3-06/03 traced the table: the current and the commanded speed both equal the object's maximum speed exactly ([initial block](#throttle-maximum-speed-and-speed-matching-p3-0603)).
- **Draws within one instantiation (Confirmed order):** name (fallbacks only), `0x3060c`, `0x68050`, +0xC8, `0x20990`, `0x38cd4`; all of them come after the request's placement draws.

**Handoff:** P3-06 owns the movement block, the throttle table, the maximum speed and the parked update with its time +0x18 ([flight motion](#flight-motion-controls-speed-parking-and-take-off-p3-06)); P3-09 the Warp timer +0xC8, together with P3-06 for the world exit; P3-07 the +0xD0 and `0x3060c` fields, the weapon mounts and the two-bit fields; P3-08 `0x68050` and the AI program; P3-10 the `0x38cd4` report; P3-11 the per-kind table, trigger counters and flags of event 3; P3-03 imports the `CINF` craft records, including the type-name string at +4.

Evidence: ignored `local/research/p3-02/spawn/` (`ghidra_scripts/SpawnProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p20.txt`; `derive.ts`, `field-stats.ts` and `activity.ts` with their JSON, which hold counts, indices and clock units only). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. The queue comparisons, the limit, roll and repeat branches, the selector clamp, the default branches, the name branches, the activity test and the player pose were read from native instructions. Raw scans of rel32 calls and of 32-bit values show that `0x6721c`, `0x6744c`, `0x67018`, `0x67584`, `0x67678`, `0x67938` and `0x67d44` are reached only by the direct calls named here and in [frame pipeline](#frame-pipeline-p3-0201) (`0x67584` also from `0x695c0`), with no pointer to any of them.

#### Runtime check (P3-02/10)

Two complete measurement runs in the selected mission (campaign group 0 / slot 1, SCEN 3019, raw difficulty 19, fixed 40000 cycles, baseline cut-scene setting): `inst-nowing-01` with wingman selector 0 and `inst-wing1-01` with selector 1. Breakpoints read the queue, the clock, the record operands and every new object (the tail of its kind list, [object table](#runtime-object-table-p3-0201)):

- before scheduling (`0x66e2d`, the builder's call of `0x6721c`) and after the origin is set (`0x66e62`);
- at the queue check (`0x67018`, and `0x67072` for the first due entry of a check);
- after each `0x67938` call in `0x67678` (`0x67914` for section-1 records and the wingman, `0x677b2` for section-5 members);
- after the message loop (`0x2151d`).

The method, the criteria written before the runs and the per-run results are in [B-007](../behavior/B-007-mission-instantiation.md); only counts are recorded here. Every criterion held in both runs:

- **Queue (Confirmed, runtime):** after the build the queue equalled the insertion that `0x6721c` and `0x67584` give for the due times read in the run: 7 entries without a wingman, 8 with one, the wingman's {0, 0, 2} taken directly after the kind-1 record's.
- **First check (Confirmed, runtime):** the build frame's check had a positive elapsed time and dispatched every due entry (6, or 7 with the wingman) in that pass. All 50 or 51 opening objects were instantiated in the build frame, after which only the delayed section-5 entry remained.
- **Delayed entry (Confirmed, runtime):** section-5 entry 2 (due 19,200) fired at the first check whose elapsed exceeded its due time; the previous check's elapsed, taken as the current one minus the frame's step, did not. Its three requests (6 objects) were dispatched in that pass, about 9,000 frames after the build frame, and the queue was then empty.
- **Sources, numbers and order (Confirmed, runtime):** the 56 and 57 instantiations matched the [selected-mission list](./scenario.md#selected-mission-instantiation-p3-0203) object by object in source and order. Each object was in the kind list of its source record's kind, and the record and entry spawn counters rose from 0 to their request counts.
- **Placement (Confirmed, runtime: support membership):** every position lay in the support of [placement mappings](#placement-mappings-p3-0202) derived from the operands read in the same run, and every second section-5 member equalled R(member 0 + layout[1]) bit for bit. The rounding direction is in [x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202).
- **Defaults (Confirmed, runtime):** see [record defaults](#record-defaults-p3-0203).
- **Wingman gate (Q-06):** see [spawn queue](#spawn-queue-p3-0203).
- **Not checked at runtime:** names, activity, poses, the draws inside `0x67938`, limits, repeats, probabilities below 100 and trigger routes (the last four do not occur in the selected mission).

Evidence: ignored `local/research/p3-02/runtime/` (`plan.md`, `procedure.md`, `recipes/`, `scripts/`, the run directories with their reports and `run-notes.md`, and the analysis JSON files, which hold verdicts and counts only); read-only Ghidra outputs `out/p1.txt`–`out/p4.txt` (private project copy) for the breakpoint sites, the queue and list layouts and the selection page. The measurement tool `tools/baseline/` was used unchanged.

### Flight motion, controls, speed, parking and take-off (P3-06)

Static answers to M-01–M-10 of the [P3-06 spec](../../plan/p3/06/spec.md#原版研究) (their static parts), by subtasks 01–05 of that task. Details marked *P3-06/23* come from subtasks 10, 12 and 14, which checked them against native instructions while implementing, and P3-06/23 re-read each of them from native instructions (ignored `local/research/p3-06/records-23/`: `ghidra_scripts/RecProbe.java` run through `probe.sh`, outputs `out/r1`–`out/r7`). Everything was read from native instructions on a private copy of the Ghidra project; what P3-06/17's runs of the original confirmed is in the [runtime check](#runtime-check-p3-0617) at the end of this section, and the rest was not observed at runtime. Code constants are given by address and type only: they are code rules under the spec's technical decision 11, and their values stay in the ignored findings named in each evidence paragraph. Notation:

- *Block*: the movement block at object +8, an auxiliary-pool slot of 0x110 bytes ([object table](#runtime-object-table-p3-0201)). Offsets "block +x" count from its start; several routines address it through block + 4.
- *Controller*: the player's control block at player object +0x14 (0x1C0 bytes).
- Rows: row 1 = object +0x48–+0x50, row 2 = +0x54–+0x5C, row 3 = +0x60–+0x68; position +0x6C–+0x74.
- *dt*: the f32 step in seconds `0x186424`; *t*: the f32 sample in seconds `0x18641c`; *sample*: the clock sample `0x186414` ([time base](#simulation-time-base-p3-0106)).
- *C*: the object's record at +0x1C: a CINF craft record, or the body record for a missile ([craft §3.5](./craft.md#35-craft-record-and-missile-body-record-236-bytes)).
- Rounding points: D(x) is an x87 result rounded to double precision (the run-time precision control, [x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202)); F(x) is an f32 store under the rounding control in effect; X(x) is an FSIN or FCOS result (extended precision, not affected by the precision control). The product of two f32 values is exact in double precision.

#### Movement stage and integration (P3-06/01)

**Confirmed (stage `0x221fc`):**

- The dispatcher `0x20d10` calls it once per frame, at `0x2151d`, after its message loop ([frame pipeline](#frame-pipeline-p3-0201)). It walks kinds `0x3ffffff` with `0x5261c`, so the player comes first.
- Filter: activity +2 non-zero (active 1, docked 3 and the callback-suppressed 2 all pass; parked 0 is skipped) and state +3 equal to 4 or at least 7. Every object with a non-zero +2 has a block, because `0x2c3b0` builds one at instantiation and when an object resumes from parking; there is no null test.
- Dispatch on the mode, block +4: 0 → `0x222f0`; 3 → `0x22600`; 1 → `0x22818`, then the hit test `0x28450` when block +0x68 is non-zero; 2 → `0x2285c`; any other value (4) → nothing. Modes 0 and 3 receive the position, the rows, the block and C.
- Modes 0 and 3 read no other object, so the walk order matters only for the mode-1 hit test. After the walk come the collision passes `0x29670` and `0x29934` (P3-07).

**Confirmed (modes and their writers):**

| Mode | Integrator | Written by | Moves | Owner |
|---|---|---|---|---|
| 0 | `0x222f0` | `0x2c3b0` (instantiation and resume); `0x2b00c` (missile, with its body record); `0x38780` (kind `0x4000`, through `0x218e8`); rescue `0x32e14` (player, through `0x218e8`); Warp completion `0x2bf08` (3 → 0) | Every craft, missiles and kind `0x4000`. A destroyed source (state 4) keeps its mode-0 block and is still integrated with its last rates and speed; no callback runs for it, so nothing steers it again | P3-06 |
| 1 | `0x22818` | Projectile `0x25b0c`; explosion constructors `0x23ac8` (the new explosion takes the source's position and velocity; the source keeps its block) and `0x23fdc` (role not analysed) | Projectiles, explosions | P3-07, P3-12 |
| 2 | `0x2285c` | Fragment constructors `0x24ec4`, `0x25124`, `0x25500` | Fragments (block +0x6C selects the spin helper) | P3-07, P3-12 |
| 3 | `0x22600` | Only the Warp start `0x2be00` (byte store at `0x2bef6`), whose only caller is the dispatcher's case for message 0x400 sub-command 0 | The player's Warp (Likely: the only poster found is the player's key context; the poster scan is not exhaustive) | Trigger P3-09; integrator P3-06 |
| 4 | None | `0x3cb80` (the map marker kind `0x2000000`) | Nothing | P3-09, P3-13 |

Craft use modes 0 and 3 only. Mode 3 is written only by the Warp start, and that only the player's Warp triggers it is Likely (above). Besides the direct mode stores, the only block builders are `0x21794` and `0x218e8`. `0x21794` applies a parameter record: it writes the position and the rows and, when a block is given, clears block +4–+0xA3 and fills it for the mode. `0x218e8` builds a parameter record from an object and its old block for a new mode; for mode 0 it refreshes block +0x70/+0x74 and derives the throttle from the old speed ratio (f64 constant `0x17004c`, truncated toward zero by `0x74518`). In detail (Confirmed; P3-06/23, from 10): it clears the whole record and copies the position and the rows; without an old block it returns there, so the record keeps throttle 0 and mode 0 whatever mode was requested. With an old block it stores the requested mode; for mode 0 it sets block +0x70 = C +0xB8 and block +0x74 = F(D(speed ÷ +0x70)) (0 when +0x70 is not positive), then reloads that f32 ratio and takes the throttle chop(D(ratio × `0x17004c`)).

**Confirmed (block fields in modes 0 and 3):** readers and writers come from a p-code scan of every function for `[[n]+8]+offset` with one level of parameter passing.

| Block | Type | Meaning | After `0x2c3b0` (mode 0) | Writers |
|---|---|---|---|---|
| +0x04 | u8 | Mode | 0 | Builders; `0x2be00`; `0x2bf08` |
| +0x08 | f32 | Current speed, units/s | The object's maximum speed +0x78, exactly | Integrators; `0x21adc` (when the mode is not 0); Warp `0x50188`, `0x2bf08`; missile launch `0x21a3c` |
| +0x0C–+0x14 | f32 × 3 | Position copy at the build (mode 1: the previous position) | The position | Builders; `0x22818`. No mode-0/3 rule reads it |
| +0x18 | i32 | Impulse active | 0 | Set by `0x2b628`, `0x29eb8`, `0x2a12c`; cleared by `0x222f0` |
| +0x1C–+0x24 | f32 × 3 | Impulse direction | 0 | The same three writers |
| +0x28 | f32 | Impulse magnitude, units/s | 0 | The same; decayed by `0x222f0` |
| +0x2C, +0x30, +0x34 | i32 | Timed rotation active about row 1, 2, 3 | 0 | The same; cleared by the integrators |
| +0x38, +0x3C, +0x40 | f32 | Timed rotation rate, rad/s | 0 | The same; decayed by the integrators |
| +0x44, +0x48, +0x4C | f32 | Timed rate decay, rad/s² with the sign of the rate | 0 | The same three writers |
| +0x50, +0x54, +0x58 | f32 | Timed rotation end, seconds of t | 0 | The same three writers |
| +0x5C | i32 | Control lock ([controls](#flight-controls-and-rotation-p3-0602)) | 0 | `0x21ba0` |
| +0x60, +0x64, +0x68 | f32 | Steady rotation rate about row 1, 2, 3 (rad/s, Likely, following the craft rates) | 0 | `0x21dd0`, `0x21fd8` |
| +0x6C | f32 | Commanded speed, units/s | The initial speed | `0x21dd0`, `0x21adc`, `0x21ba0`, `0x21d88`, `0x2bf08`, `0x50188`, `0x21a3c` |
| +0x70 | f32 | Reference maximum speed: a copy of C +0xB8 | C +0xB8 | `0x21794`, `0x218e8`, `0x21a3c` (mode 0, only when it holds ±0; [W11](#w11-launch-message-8-and-the-two-constructors--confirmed-code)) |
| +0x74 | f32 | Speed ratio | F(D(speed ÷ +0x70)) when +0x70 > 0 or the compare is unordered, else 0 | Builders; integrators; `0x21a3c` |
| +0x78 | i32 | Commanded speed reached | 1 | Set by the integrators, `0x2bf08` and `0x21a3c`; cleared by every other writer of +0x6C |
| +0x7C, +0x80, +0x84 | i32 | Steady rotation enabled about row 1, 2, 3 | 0 | `0x21dd0`, `0x21fd8` |
| +0x88–+0xA0 | mixed | Disturbance level and biases ([controls](#flight-controls-and-rotation-p3-0602)) | 0 | `0x21bd4` |
| +0xAC–+0xEC | — | Read by `0x40370`, `0x45de0` and `0x55984` (camera and presentation, not analysed) | +0xB0 and +0xB4 are 0 (cleared by `0x2c3b0`); the others are not established (`0x21794` clears only up to +0xA3) | Not P3-06 rules |
| +0xF0–+0x10C | — | Projectile, fragment and missile data | — | P3-07 |

The mode-0/3 integrators do not read +0x0C–+0x14, +0x5C, +0x88–+0xA0 or anything from +0xA4 on. The column "After `0x2c3b0`" is the build at full throttle ([initial block](#throttle-maximum-speed-and-speed-matching-p3-0603)); a rebuild through `0x218e8` (rescue, kind `0x4000`) passes the throttle derived from the old ratio instead. The writers of +0x18–+0x58 belong to P3-07 (below).

**Confirmed (mode-0 integrator `0x222f0`, in order):**

1. **Impulse,** while block +0x18 ≠ 0: the components F(D(direction_i × D(magnitude × dt))) are computed first; the magnitude then becomes F(D(magnitude − D(dt × the f64 constant `0x170094`))), and +0x18 is cleared when the new magnitude is below 0 (ordered compare; the negative value stays stored); then position_i ← F(D(position_i + component_i)). The displacement therefore uses the magnitude before this frame's decay.
2. **Forward:** position_i ← F(D(position_i + F(D(row3_i × D(speed × dt))))), with the speed before this frame's update (explicit Euler). With an impulse the position is stored twice.
3. **Speed,** only while block +0x78 = 0. When D(commanded − speed) > 0, v = D(D(C +0xBC × dt) + speed); otherwise, equality included, v = D(speed − D(C +0xC0 × dt)). Speed ← F(v). When v, the double and not the stored f32, has passed the commanded speed (above it when accelerating, below it when decelerating), +0x78 ← 1 and the speed takes the commanded value bit for bit. Then, when block +0x70 > 0, ratio ← F(D(speed ÷ +0x70)).
   - Reaching the commanded speed exactly does not set the flag: the next frame with dt > 0 decelerates and arrives when C +0xC0 × dt > 0. With C +0xBC = 0 (or C +0xC0 = 0) the speed never moves toward a higher (or lower) commanded speed.
   - **No cap at the maximum speed:** the integrator never reads object +0x78. After `0x21d88` lowers the commanded speed to a lowered maximum ([maximum speed](#throttle-maximum-speed-and-speed-matching-p3-0603)), the current speed can be above the maximum and falls at C +0xC0 per second.
   - While +0x78 = 1, speed and ratio stay unchanged until a writer clears it.
4. **Turn factor** f = dt (bit copy) when C +0xC8 ≠ 0, otherwise F(D(ratio × dt)).
5. **About row 1** (`0x228cc`): with a timed rotation (+0x2C ≠ 0) the rate is +0x38, or F(D(+0x38 + +0x60)) when +0x7C ≠ 0; θ = F(D(rate × f)); rotate; then +0x38 ← F(D(+0x38 − D(+0x44 × dt))), and +0x2C is cleared when t > +0x50 (ordered). Otherwise, when +0x7C ≠ 0: θ = F(D(+0x60 × f)); rotate.
6. **About row 2** (`0x22a50`): the same with +0x30, +0x3C, +0x64, +0x80, +0x48 and +0x54.
7. **About row 3** (`0x22990`): with a timed rotation (+0x34), as step 5 with +0x40, +0x68, +0x84, +0x4C and +0x58. Otherwise, when C +0xC4 ≠ 0 and +0x80 ≠ 0, the steady row-2 rate is coupled in: base = F(D(D(+0x64 × ratio) + +0x68)) when +0x84 ≠ 0, else F(D(+0x64 × ratio)); θ = F(D(base × f)). Otherwise, when +0x84 ≠ 0: θ = F(D(+0x68 × f)).

Each step rotates the rows left by the previous one, in the order 1, 2, 3; the rotations do not commute. Nothing on the movement path renormalises or re-orthogonalises the rows (`0x56d18` is called only by `0x218e8` for an old mode 2, by `0x2e9d4` and by AI `0x5e200`; `0x56aa8` is not applied to object rows), so they slowly drift from unit length.

**Correction of [craft §3.5](./craft.md#35-craft-record-and-missile-body-record-236-bytes) +0xC4:** `0x21cf8` returns in ST0 (the decompiler loses it) the steady or coupled row-3 expression of step 7 without f, ignoring a timed row-3 rotation, and the cockpit presentation `0x46fe0` follows that value each frame. Its result is therefore used.

**Confirmed (mode-3 integrator `0x22600`):** no impulse and no translation. Speed: only the accelerating branch of step 3, with the same arrival; a commanded speed at or below the speed leaves it unchanged. The ratio then becomes F(D(speed ÷ commanded speed)) unconditionally: there is no positivity test, so a zero commanded speed with the flag clear divides by zero, and that exception is unmasked ([x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202)). The turn factor and the three rotations are those of mode 0, coupling included. During the player's Warp, `0x50188` (called from the display switch `0x3f158`; Likely the Warp view set-up) sets the player's speed to 0, the commanded speed to block +0x70 and +0x78 to 0. The Warp completion `0x2bf08` sets mode 0, +0x78 = 1, speed = commanded speed = object +0x78, and the Warp timer +0xC8 from the sample; `0x50508` reads the speed for the Warp progress. The Warp itself belongs to P3-09.

**Confirmed (rotation helpers):** each takes an f32 angle θ on the stack and the rows in EAX. c = F(X(cos θ)) and s = F(X(sin θ)), FCOS first, then FSIN of the same loaded value. The overwritten elements are copied first, so every new component is F(D(D(·) ± D(·))) of old values.

| Helper | Rows changed (a, b) | New a | New b |
|---|---|---|---|
| `0x228cc` | Row 2, row 3 (about row 1) | c·a + s·b | c·b − s·a |
| `0x22a50` | Row 1, row 3 (about row 2) | c·a + s·b | c·b − s·a |
| `0x22990` | Row 1, row 2 (about row 3) | c·a + s·b | c·b − s·a |

Other callers: `0x2285c` (fragments), `0x25dc4`, `0x2b00c` (P3-07) and the destruction camera `0x31094`.

**Confirmed (zero and long steps):**

- **dt = 0** (frames faster than 32 per second, [time base](#simulation-time-base-p3-0106)): everything stays bit-identical except signed zeros, because a −0 component plus a +0 term becomes +0 under round to nearest. Nothing arrives, decays or expires (t equals the previous frame's t), and θ = 0 gives c = 1 and s = 0.
- **Long dt:** nothing is clamped. The displacement uses the old speed and the old impulse for the whole step, so a long frame pushes farther than a continuous decay would; the speed stops at the commanded value when it crosses it; the impulse flag clears once the decayed magnitude is negative; a timed rotation uses its pre-decay rate for the whole frame.
- **Timed-rotation writers** (below) set each axis's end from t, the rate, the decay and a fixed margin, and activate an axis only when its stored f32 end is later than t (ordered); decay and expiry apply only to activated axes. The decay that follows a writer sums the steps of every frame from the writer's own frame on, including that frame's step when the writer ran in its message loop. A first step longer than the writer's margin can therefore carry the rate past zero before the expiry test clears the flag (derived from the code; not observed).

**Confirmed (pose authority):** modes 0 and 3 update object +0x48–+0x74 in place. There is no per-frame pose copy and no write-back; `0x21794` runs only when a block is (re)built. The other pose writers lie outside the movement stage: instantiation `0x67938` and the rescue `0x67b98` (through `0x21794`); the Warp routines `0x2bf08`, `0x50188` and `0x50a28` (P3-09); the parked update `0x2f314` through `0x6a2f8` ([parked update](#world-boundary-active-area-parking-and-autopilot-p3-0604)); the AI look-at `0x5e200` (P3-08); docking and launch `0x38ff4` (P3-10); the projectile hit `0x25dc4` (P3-07); the map marker `0x2b9bc`. `0x5d090` is not a pose writer: it posts the speed-match message 0x80000 for an AI object.

**Writers of impulse and timed rotation (Confirmed, code; reachability Likely, not observed):**

- `0x2b628`, from the missile-blast handler `0x2b408` (message 0x10000): every object of kinds `0xfffff` within the blast whose fall-off damage is positive and whose kind is not in mask `0xf9c7c` gets an impulse along the missile's row 3, scaled from the missile's speed, and timed rates on all three axes with a fixed decay; 6 draws (three magnitudes, three sign flips). Reachable in the slice: the player carries missiles ([weapon records](#weapon-records-and-the-first-missions-shooters-p2-1230)), and the player and the enemy kinds are outside the mask.
- `0x29eb8` and `0x2a12c`, the collision responses of `0x29670` and `0x29934`: impulse and timed rotations, with their own decay, 6 draws per call and the same end and activation rule; they also return a damage value. `0x29eb8` writes both objects (the second gets the negated rates), `0x2a12c` only the first (Confirmed, code, P3-07/03, [collisions](#h6-collision-passes--confirmed-code-collision-helper-spot-checked)). Reachable whenever objects collide.
- Gun hits (`0x25dc4`, `0x2a40c`) write none of these fields.
- Steering, matching and blast writers run in the message loop, before that frame's `0x221fc`; the collision writers run after it, so their effect starts in the next frame. All three writers and their constants belong to P3-07.

#### Numbers on the movement path (P3-06/01)

**Confirmed (code; extends [x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202)):**

- **Storage:** every continuous movement quantity is f32 (positions, rows, speeds, rates, decays, impulse, end times, ratio); the flags are i32; the mode is u8; dt and t are f32.
- **Precision:** every add, subtract, multiply and divide rounds to double; FSIN and FCOS results are extended and are rounded once by their f32 store. Because a product of two f32 values is exact, the first rounding usually falls at a sum or at the f32 store, which makes it a double rounding D → F.
- **Trigonometry:** FSIN and FCOS occur on the movement path only in the three rotation helpers, applied to the f32 angle the caller pushes. `0x221fc`, `0x222f0`, `0x22600` and the helpers contain no FSQRT, FPATAN or table lookup.
- **Float to integer:** none in the integrators or the helpers. Block rebuilds through `0x218e8` and the throttle readback `0x21ca8` truncate toward zero through `0x74518`.
- **Rounding direction:** not decidable statically. Every F() above is a point where it matters. The runtime observation of [x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202) (round to nearest) and its open cause stand until readings in flight decide it (U-009).

| Quantity | Write-back |
|---|---|
| Position, at the impulse step and at the forward step | Component F(D(·)), then F(D(position + component)) |
| Speed | F(D(D(rate × dt) ± speed)); on arrival a bit copy of the commanded speed |
| Ratio | F(D(speed ÷ reference)); mode 3 divides by the commanded speed |
| Turn factor | dt bit copy, or F(D(ratio × dt)) |
| Angle | F(D(rate × f)); with a timed and a steady rate, F(D(F(D(timed + steady)) × f)); coupled, F(D(F(D(D(row-2 rate × ratio) + row-3 rate)) × f)) |
| sin, cos | F(X(·)) |
| Rows | F(D(D(a·c) ± D(b·s))) per component |
| Impulse magnitude, timed rate | F(D(value − D(decay × dt))) |
| Expiry | Ordered compare of t with the f32 end |

End times are f32 sums at the magnitude of t, so the exact expiry frame depends on the absolute clock, which starts at a random value at program start ([time base](#simulation-time-base-p3-0106)). A clock with another origin cannot reproduce that rounding bit for bit.

**Confirmed (constants and tables; classification by the spec's technical decision 11):** the impulse decay (f64 `0x170094`), the throttle-from-ratio factor (f64 `0x17004c`), the player's build pose and build throttle in `0x2c3b0`, and the throttle table are code rules, not imported data.

- **Throttle table `[0x1761dc]`:** 129 f32 entries built at start-up by the module initialiser `0x568b0` (pointer at `0x1748e0` in the table `0x1747e0`). It is an exact linear ramp, accumulated with the f64 step at `0x17211c` and odd about its middle entry, and its last entry makes the full-throttle commanded speed equal the maximum speed exactly. It is computed, not stored in the image, and needs no import. Each step stores the negative entry first and then the positive one as a bit copy of the f32 running sum, so the middle entry, written twice, ends as +0 (Confirmed; P3-06/23, from 10).
- **Direction table `0x1b1310`:** the same initialiser builds 19 × 19 entries of 12 bytes, unit vectors from FSIN and FCOS of multiples of an angle step (f64 constants `0x17210c` and `0x172114`). It too is computed at start-up and absent from the image, which agrees with the image scan of [x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202). Its only reader `0x56b8c` returns a random direction with two draws (an entry index and a sign octant), for steering `0x21fd8`, fragments `0x24ec4`/`0x25500`, automatic guns `0x2dad0`, the parked update `0x2f314`, `0x40370` and AI `0x640d8`. It is not on the mode-0/3 path.
  - **Layout (Confirmed; P3-06/23, from 10):** an outer loop over the azimuth a and an inner loop over the polar angle b, both integer multiples of a fixed step from 0 up to a right angle (immediates at `0x5693c` and `0x56935`), each turned into radians as D(D(n × `0x17210c`) × `0x172114`). Entry 19 × (azimuth index) + (polar index) is (F(cos a × sin b), F(sin a × sin b), F(cos b)) from the FCOS and FSIN results, so every component is non-negative. The products round at the precision control in effect when the initialiser runs; its order relative to the run-time FPU initialiser was not traced.
  - **`0x56b8c` (Confirmed; P3-06/23, from 10):** the first draw, modulo the entry count, picks the entry; the second, modulo 8, the sign octant, which negates nothing (0), x (1), y (2), z (3), x and y (4), x and z (5), y and z (6) or all three (7). A negated component is the FCHS of the f32 entry, so a +0 component becomes −0; the others are bit copies.

Evidence: ignored `local/research/p3-06/motion/` (`ghidra_scripts/MotionProbe.java`, `BlockScan.java`, `ParamScan.java` and `ObjScan.java` run through `probe.sh`, `scan.sh`, `pscan.sh` and `oscan.sh`, with outputs `out/p1.txt`–`out/p22.txt`, `out/blk1–3.txt`, `out/par1–2.txt` and `out/obj1.txt`; `x87sym.py`, a symbolic trace of the native x87 listing whose subtract operand order was checked against the opcode bytes; `ref_step.py`, an independent exact-rational evaluator with explicit rounding points; `craft-fields.ts`, `craft-index.ts` and `craft-mag.ts`, which output classes, counts and bounds only). Before the scans, functions were discovered in memory from raw call targets, pointers to Watcom prologues and gaps after returns, raising the count from 1,811 to 2,381. Limits: the p-code scans follow `[[n]+8]+offset` and one parameter level, and code reached only through computed jumps and never disassembled is not covered. Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and conventions set in memory were discarded.

#### Flight controls and rotation (P3-06/02)

**Confirmed (message paths):** the dispatcher `0x20d10` sends message 0x20000 to the integer path `0x21dd0`, with four i32 {throttle, axis 1, axis 2, axis 3}, and message 0x40000 to the float path `0x21fd8`, with twelve f32. Message 0x80000 goes to the speed match `0x21adc` ([speed matching](#throttle-maximum-speed-and-speed-matching-p3-0603)). A raw byte scan finds three posters of 0x20000: the player's callback `0x25f90` (the controller's pending values, which it then resets to "unchanged"), the autopilot switch `0x27ee4` (when switching off: throttle unchanged and the three axes 0) and the speed assist `0x27f68` (full throttle, axes unchanged). The posters of 0x40000 are the AI movement helpers `0x5d014`, `0x5d0ec`, `0x5d1ac`, `0x5d274` and `0x5d41c`.

**Confirmed (integer path `0x21dd0`, the player's controls):**

- **Gate,** in order: a block, a craft record (object +0x1C) and block +0x5C (the lock) equal to 0. Otherwise nothing happens and nothing is drawn. The mode is not tested.
- **Disturbance draws:** when block +0x88 ≠ 0, three rand draws come first, one bounded offset per axis, to which the integer biases block +0x98/+0x9C/+0xA0 are added when +0x88 is 2. They happen for every accepted message, after the level test and before any payload field is read, also when all three axes are "unchanged" (a throttle-only message). Each offset is the draw modulo a fixed count minus a fixed bias (immediates at `0x21e1c` and `0x21e26`), drawn for axes 1, 2 and 3 in turn; the level-2 biases are i32 additions (Confirmed; P3-06/23, from 12).
- **Throttle** (payload 0), unless "unchanged": commanded speed block +0x6C = F(table[middle + (throttle SAR 1)] × object +0x78), where middle is the index of the table's middle entry, from the throttle table `[0x1761dc]` ([numbers](#numbers-on-the-movement-path-p3-0601)); block +0x78 = 0. The throttle is not range-checked ([domain edge](#throttle-maximum-speed-and-speed-matching-p3-0603)).
- **Axis k** (payloads 1–3): each field has a dedicated "unchanged" value (nothing is written), 0 (the axis's enable flag is cleared; its rate stays but is not applied) and signed deflections a within the symmetric deflection range of the device path (below). Then v = −a, or, with a disturbance, v = d_k − a clamped to that range (`0x22b54`), where d_k is that axis's drawn offset. Rate = F(the sensitivity table entry [middle + (v SAR 1)] × the craft rate), and the enable flag is set. The arithmetic shift floors the index, so the smallest negative deflection gives the middle entry, which is −0 at every sensitivity level (below): the rate is F(−0 × the craft rate), −0 for a positive craft rate, and the flag is set (Confirmed; P3-06/23, from 12). A disturbed v whose shifted index is the middle gives the same.

| Axis | Rate | Craft rate | Enable flag | Rotation |
|---|---|---|---|---|
| 1 | Block +0x60 | C +0xAC | Block +0x7C | About row 1 (pitch) |
| 2 | Block +0x64 | C +0xB4 | Block +0x80 | About row 2 (yaw) |
| 3 | Block +0x68 | C +0xB0 | Block +0x84 | About row 3 (roll) |

**Confirmed (float path `0x21fd8`, AI steering):** the same gate. The payload holds a scale s; per axis {clear, set, value}; a speed-set flag and a speed factor; the flags are tested as 32-bit integers.

- With block +0x88 ≠ 0 it draws a random direction through `0x56b8c` (two draws) and three more values, which give three float offsets (plus the float biases block +0x8C/+0x90/+0x94 when +0x88 is 2): five draws per accepted message. For axes 1, 2 and 3 in turn, one draw r gives p_k = F(D(D(D(D(r × the f32 constant `0x170060`) × the f64 constant `0x170064`) + the f64 constant `0x17006c`) × u_k)), where u_1, u_2 and u_3 are the direction's x, y and z; at level 2, p_k = F(D(p_k + the float bias)) (Confirmed; P3-06/23, from 12).
- Per axis: when set ≠ 0, rate = craft rate × (−s) × value, or with the disturbance × the value plus its offset clamped to [−s, s] (`0x22b68`), and the flag is set. Otherwise, when clear ≠ 0, pitch and roll clear their flag, but yaw clears its rate block +0x64 instead, and its flag stays set. The rate is linear in the value: no sensitivity table.
- **Write-back (Confirmed; P3-06/23, from 12):** −s is the FCHS of s. Without a disturbance, rate = F(D(D(craft rate × (−s)) × value)): the first product is exact in double and is never stored. With one, rate = F(D(F(craft rate × (−s)) × w)): that product is stored as f32 first, and w comes from `0x22b68`, which computes D(value + p_k), stores its f32, returns s when the double sum is above s (strict), otherwise −s when the stored f32 is below −s, otherwise the stored f32.
- When the speed flag is set: block +0x6C = F(object +0x78 × factor) and +0x78 = 0.
- **Callers:** the dispatcher for message 0x40000, posted by the AI movement helpers. The player's autopilot paths (`0x273e4` in the map mode, `0x27528`) call those helpers, and so do about 25 sites of the AI program interpreter (`0x5f5b9`–`0x6485a`, reached through its tables, not traced); the generic AI callback `0x20c18` runs the same AI step `0x5dcd4` as the autopilot (Likely: the float path steers every AI craft). Direct callers: `0x2ac10`, from the callbacks `0x2aa40` and `0x2ab00` that `0x2b00c` installs (P3-07), and the kind-`0x4000` callback `0x3897c` (at `0x38a78` on its first update, with random rates, and at `0x38b2e` in state 7). **The float path is therefore not autopilot-only.**

**Confirmed (lock and disturbance writers):**

- `0x21794` clears the lock, the rates and flags, the disturbance and its biases at every build.
- **Lock** `0x21ba0(object, value)` is the only other writer of block +0x5C and acts only in mode 0; value 1 also clears +0x78 and sets the commanded speed to 0, so the craft slows to a stop. Callers: the energy updates `0x3071c` (the player-state's craft) and `0x30994` (kinds `0xffffe`) set 1 when the object's energy +0x28 reaches zero or below and `0x30590` passed them the block (the player unless docked; other objects when active in state 7 or above; parked objects get none). The base repair `0x398ec` (selector 7) and `0x280ec` set 0; `0x280ec` (full repair and unlock of the player) is referenced only by a pointer at `0x1750a0` (Likely a debug or cheat table). While locked, both paths do nothing: throttle keys and steering are dropped and nothing is drawn. The enable flags are not cleared and the integrators do not test the lock, so a rotation in progress continues.
- **Disturbance** `0x21bd4(object, level)` is the only other writer of block +0x88 and acts only in mode 0: without a movement block or with a mode byte other than 0 it writes and draws nothing. It stores the level as given; level 2 also draws three integer biases, each rand % 193 − 96 (signed `IDIV` by 0xC1, then −0x60, so −96…96), stores them in draw order at +0x98/+0x9C/+0xA0 and their float copies at +0x8C/+0x90/+0x94 (scaled by the f64 constant `0x170054`) (Confirmed, code, P3-07/15). The damage routine `0x2a830` (from `0x2a694`, P3-07) raises it to 1 or 2 when the randomly chosen subsystem slot is 7 and its state was below 2 (the player has 19 slots and other craft 9; both include slot 7). The full repair `0x39820` (called by `0x280ec`, the parked update `0x2f314`, docking and launch `0x38ff4`, AI code at `0x61bd0`, the rescue `0x67b98` and `0x68f4c`) and the base repair `0x398ec` reset it to 0.
- The lock and disturbance writers belong to P3-07 (energy, damage), the resets to the base (P3-10) and the rescue (P3-01); P3-06 owns their consumers above.

**Sign chain (Confirmed, code), frame meaning (Likely), handedness (Unconfirmed):**

- **Code:** a > 0 gives v < 0, a negative table entry, a negative rate and θ < 0. With θ < 0, the row-1 rotation turns row 3 toward +row 2, the row-2 rotation turns row 3 toward +row 1, and the row-3 rotation, the coupled one included, turns row 2 toward +row 1.
- **Frame (Likely):** row 3 is forward: the F1 camera `0x31400` uses the pose unchanged. Row 1 is the pilot's right: the Right-view camera `0x31424` looks along +row 1, the Left one `0x314ac` along −row 1, the Down-key one `0x31524` along −row 3 and the keypad-centre one `0x315bc` along +row 2. Row 2 is up: the printed manual says that in the default Flight stick mode, stick back pitches up, and a game-port stick reads higher counts to the right and toward the pilot.
- **Mapping** (code chain Confirmed, screen meaning Likely): nose up ↔ axis 1 > 0 (stick back in the Flight mode; the Arcade mode, `0x1761e8` ≠ 0, negates Y in `0x57f44`); nose right ↔ axis 2 > 0 (stick right); clockwise roll as seen by the pilot ↔ axis 3 > 0 (stick right with Ctrl or stick button 2). The device never yields yaw and roll together: its X axis goes to yaw or to roll, Y to pitch, and there is no rudder axis.
- Model and renderer handedness is Unconfirmed ([mesh](./mesh.md)); the screen meaning needs a runtime check with steering input.

**Confirmed (keyboard and device input; extends [input polling](#input-polling-p3-0201)):**

- **Keyboard sources:** game keys come only through DOS INT 21h functions 0Bh and 07h (`0x74e8c`, `0x74ec8`) and the BIOS shift flags (`0x74e70`; callers `0x2760c` for Alt as the primary fire, `0x57f44` for Ctrl as the roll routing, `0x3c970` and `0x371b0` for the Caps Lock case swap). Raw scans find no read of ports 0x60/0x64, no other BIOS keyboard-area access and no game INT 9 hook.
- **Key contexts:** none of the four writes a steering field. The cursor keys, Home, PgUp and the keypad centre are view keys ([automatic views](#automatic-views-and-cameras-p3-0109)); End, PgDn, Ins, Del and the extended keypad codes `0x8A` and `0x8B` are not handled in flight; F11 cycles the sensitivity (below); the F12 family toggles a flag behind the gate `0x3cb78`, which only a typed word toggles (Confirmed by P3-05/01, [key contexts](#key-reading-and-key-contexts-p3-0501-p3-0502)). The only key-driven axis message is `a` switching the autopilot off ([autopilot](#world-boundary-active-area-parking-and-autopilot-p3-0604)), which sends three zeros (subject to the lock gate, and after the three disturbance draws when +0x88 is set).
- **The original has no keyboard steering:** pitch, yaw and roll come only from the game-port stick. The README and the printed manual describe steering only with the stick (secondary evidence). Mouse flight is excluded ([key map](../input/key-map.md#鼠标飞行已确认u-012)).
- **Device path:** `0x57d70` clears an 11-dword state and calls the driver `[0x176204 + 24 × 0x1761e4]` (seven entries; the joystick page's seven type buttons presumably select drivers 0–6 in order, not traced). It then marks each of five fields changed when it differs from the previous read at `0x1b2470`, and stores the read there. `0x56f74` reads only the axes whose bit is set in the mask `0x1b23fc` (others 0), through the port-0x201 timing loop `0x56edc`; `0x575bc` calibrates a two-way axis to a symmetric signed deflection range with an exact-zero dead zone, a throttle-type axis to the non-negative throttle range and a hat to a small direction code. `0x57f44` stores Y as pitch (negated in the Arcade mode) and X as yaw, or as roll while stick button 2 or Ctrl is down.
- **Stick throttle:** only drivers 4 and 5 (Likely the CH Flightstick and Flightstick Pro, by the page order) have a throttle axis. Its value lies within the throttle range (which end of the stick gives zero was not traced); it is applied only in flight views, not in view modes 0–1, and only when it changes. The other drivers report none; driver 1 (Likely the ThrustMaster FCS) reads its hat from that axis instead.
- **Configuration:** the `JOYSTICK=` line of `SRANGER.CFG` holds the driver, the stick mode, the sensitivity and a calibration string (`0x573e4`) whose first number is the axis mask, followed by a type and six calibration values for each of four axes (parsed at `0x57afe`, reached from the key handler at `0x37f4c`; written by `0x57a70`). In the baseline configuration (driver 0, Flight mode, Medium, all-zero calibration; DOSBox-X emulates no stick) the mask is 0: every device read yields zero axes, nothing changes and no axis message is posted. **Manual steering is impossible in the baseline configuration** (Confirmed, code and configuration).
- **Timing and gates** (player callback, state 7, dead flag clear): in view modes 0–1 (Warp) the device is read at its due time and only the axes are applied (no stick throttle, buttons or hat); mode 6 (base) reads nothing; mode 8 (map) only re-arms the due time, or runs the autopilot's AI step. Other modes read the axes, the stick throttle, the fire buttons and the hat while the autopilot is off. With the autopilot on, the AI step runs, and when it returns 1, `0x27528` reads the device without the due test and takes pitch and yaw back (throttle unchanged, roll untouched) only when there is no valid target or an axis is beyond the deflection threshold of [input polling](#input-polling-p3-0201); otherwise the AI keeps control. Only changed axes are copied to the controller (+0x20/+0x24/+0x28), and at most one 0x20000 message per callback is handled in the same frame's message loop, so new rates act in that frame's movement.
- **Persistence:** rates and flags live in the block and change only through messages. In modes that do not read the device (base, map) the last applied axes stay in effect, so a held turn continues while the map is open; the previous device state persists too, so the first flight-mode read after the map compares with the last read before it. A constant deflection posts one message; with a disturbance, the disturbed rate stays fixed until the next change.

**Confirmed (sensitivity):** level byte `0x1b249c` (labels Low, Medium and High for 0, 1 and 2, from the EXE strings near `0x170ddc`; the README names Medium the default) and table pointer `0x1761e0` (129 f32).

- `0x57c24(level)` rebuilds the table only when the level changes: cubic for 0, quadratic for 1, linear for 2, each odd about the middle entry, accumulated by repeated x87 additions of an f64 step (`0x1721c8` for the cubic, `0x1721c0` otherwise) and stored as f32. A level above 2 is stored without a rebuild. Medium and High reach the full craft rate at full deflection; Low stays below it. The running value x stays in double; the cubic entry is F(D(D(x × x) × x)), the quadratic F(D(x × x)) and the linear F(x). At every level each step stores the positive entry first and then its FCHS as the negative one, so the middle entry, written twice, ends as −0, unlike the throttle table's +0 ([numbers](#numbers-on-the-movement-path-p3-0601)) (Confirmed; P3-06/23, from 12).
- The module initialiser `0x576d0` builds Medium; the CFG parser then sets the driver `0x1761e4` (invalid values become 0), the stick mode `0x1761e8`, the level and the calibration (`0x573e4` → `0x1761ec`).
- In flight, F11 (translated by `0x75048`) in the flight context cycles Low → Medium → High → Low (`0x57d60`, `0x57c24`) and shows the new level through `0x4e9e8`; the joystick page `0x34c08` also sets it.
- The table shapes only non-zero stick deflections: the throttle uses its own table, and the keyboard produces no deflection. **The sensitivity changes nothing the keyboard can produce.**

Evidence: ignored `local/research/p3-06/controls/` (`ghidra_scripts/CtlProbe.java` run through `probe.sh`, outputs `out/p1.txt`–`out/p52.txt`; `cinf-flags.ts` and `rate-units.ts`, which output counts and comparisons only; a third-party scan of the printed manual under `manual/`, secondary evidence). Every rule was read from native instructions; callers come from raw E8/E9 and 32-bit value scans of all initialised blocks. Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded.

#### Throttle, maximum speed and speed matching (P3-06/03)

**Confirmed (no persistent throttle):** the controller is created by the player's callback `0x25f90` at its first callback (states 0, 1 or 3 with object +0x14 null, [initial flight state](#initial-flight-state-p3-0605)), not by `0x67938`. It is freed only in state 6; the rescue `0x67b98` keeps it, so the controller and its assist switch survive a destruction and rescue of the same player object, while a new mission's player object gets a new one. Controller +0x1C is the pending throttle and +0x20/+0x24/+0x28 are the pending axes, each "unchanged" until a writer sets it together with the changed flag +0x0C. At the end of the state-7 callback, when +0x0C is set, `0x25f90` posts message 0x20000 with the four values and resets them to "unchanged" (`0x2616f`–`0x261b4`). The persistent quantity is the block's commanded speed +0x6C. Writers of +0x1C: controller creation; the flight key handler `0x264a0`; the device poll's throttle axis (`0x274a4` → `0x275bc`, flight views only); the autopilot take-over `0x27528` ("unchanged"); the reset after the post.

**Confirmed (throttle table use and readback):** only `0x21dd0` and the build `0x21794` read `[0x1761dc]` ([numbers](#numbers-on-the-movement-path-p3-0601)); an odd throttle acts as the even value below it. The readback `0x21ca8`, which `+` and `−` use, returns 0 without a block or when the maximum is not positive, and otherwise chop(commanded ÷ maximum × the f32 constant `0x17005c`) (double division; chop through `0x74518`). After a match the commanded speed is arbitrary, so `+` and `−` then step from the matched ratio. For every throttle setting the keyboard produces and every player maximum of the 24 CINF, the readback returns that setting exactly (local data check); this does not hold for arbitrary commanded speeds.

**Confirmed (speed keys):** only the flight context `0x264a0` handles them. The Warp (`0x27360`), base (`0x271e0`, where Enter is a base command, P3-10) and map (`0x27118`) contexts handle none of the throttle keys, Enter or Ctrl+Enter (native compare trees).

| Key (translated code) | Effect in `0x264a0` |
|---|---|
| `+` or `=` | Pending throttle = the readback plus a fixed step, at most full; nothing when that equals the pending value |
| `-` | Pending throttle = the readback minus the same step, at least 0; the same compare |
| `\` | Pending throttle 0 |
| Backspace | Full throttle |
| The ASCII codes of Shift+1 … Shift+9 and Shift+0 | Ten fixed presets in ascending order, written without a compare: Shift+1 equals `\` and Shift+0 equals Backspace |
| `0`–`9` unshifted | Nothing (the switch falls through to the return at `0x26702`) |
| Enter | Manual match (below) |
| Ctrl+Enter (LF) | Toggles the speed assist (below) |

- The ASCII codes are Confirmed. That they come from Shift with the digit row, and that the keypad `+` and `-` produce the same codes, was Likely here; P3-05/01 confirmed both for the baseline emulator (DOSBox-X source), while the host key mapping and the layout stay Likely ([key map](../input/key-map.md#修饰键与大小写p3-0501)). Caps Lock swaps letter case only.
- The compare with the pending value can succeed only if the throttle was already written in the same callback. The keyboard poll is the first writer in the state-7 callback, so in practice it never succeeds (Likely, writer enumeration within decoded code).
- **Domain edge:** after `0x21d88` leaves the commanded speed above a lowered maximum, the readback exceeds full throttle, and `−`, which clamps only below, can pass a throttle above full to `0x21dd0`. That reads past the table's last entry, into undefined memory (Confirmed by the composition of the code; not observed). `+`, the presets, `\`, Backspace and the assist stay inside the table; device throttle values are bounded only by the driver.
- **Prefilters:** `0x27b44` (the communications menu, states 2–4 of `0x1a9dc8`) consumes a key only when `0x27e10` finds it in the open menu, so the speed keys keep working with the menu open unless the menu claims the code (which codes it claims: [key contexts](#key-reading-and-key-contexts-p3-0501-p3-0502); the menu effects belong to P3-10). `0x27ab4` (state 1, the energy page that `e` opens, [D15](#d15-left-display-pages--confirmed-code); [key contexts](#key-reading-and-key-contexts-p3-0501-p3-0502)) consumes `s`, `S`, `g` and `G` only when the level change succeeds.
- At most one key per keyboard poll ([input polling](#input-polling-p3-0201)).

**Confirmed (maximum speed `0x30e0c`):** its arguments are the object, its energy block (object +0x20) and its craft record; it writes object +0x78 (f32).

- Every kind except 1: C +0xB8.
- Kind 1: with E = object +0x3C and T = object +0x40, when E < T (signed) the maximum is F(the integer trunc(E × a code constant ÷ C +0x88)), from a 32-bit integer multiply and a signed division; otherwise C +0xB8. The two-bit subsystem field 2 (`0x52ac4(object, 2)`) then scales it by the f64 constant `0x171018` when it is 1 and `0x171010` when it is 2; values 0 and 3 leave it.
- `0x3060c` computes the operands for kinds in `0xfffff`: the levels +0x34 and +0x38 (their initial values for kind 1 are fixed by code), E = C +0x58 − (C +0x64[+0x34] + C +0x78[+0x38]) and T = trunc(chop(C +0xB8) × C +0x88 ÷ the same constant). Meanings (Likely; owned by P3-07): E is the generator energy left after the shield and gun allocations, and the levels are the `s`/`S` and `g`/`G` recharge levels 0–3.
- The content base (C +0xB8, which a build also copies to block +0x70) and the rule-computed current maximum (object +0x78) are separate values.
- **Recomputation times:** `0x30e0c` has four direct call sites and no pointer reference. Two are in `0x3060c`, which instantiation (step 7), the rescue `0x67b98`, the missile constructor `0x2b00c` and the kind-`0x4000` constructor `0x38780` call; the other two are `0x30b20` and `0x30bc0`, called only by the energy-menu keys `0x27ab4`. Each of these two changes one level within 0–3, recomputes E, lowers the other level while E < 0 (when that fails, it restores the changed level and leaves the other at 0, [D10](#d10-energy-levels-keys-ssgg--confirmed-code)), calls `0x30e0c` and `0x21d88`, and sets energy block +0x24 to 1. The only writers of object +0x78 are the allocator (0) and `0x30e0c`. **Damage that raises field 2 (`0x2a830`) and the base repair do not recompute the maximum**: the new factor takes effect at the next energy-allocation change, rescue or new player object. At instantiation the allocator has cleared the two-bit fields, so the initial maximum has no damage factor.
- **After a recompute, `0x21d88`:** when the block exists and the double-precision quotient current speed ÷ new maximum exceeds the unit threshold (strict), the commanded speed becomes the new maximum and +0x78 is cleared; otherwise nothing happens. For a positive maximum, as in all shipped data, this is the same as the current speed being above the new maximum. The current speed is not clamped and may stay above the new maximum while the integrator decelerates. A commanded speed above the new maximum is kept while the current speed is at or below it (for example while accelerating), and raising the maximum changes nothing. A zero maximum would raise the unmasked divide exception; the shipped data always give a positive maximum.
- **Local data (counts only):** over the 24 CINF, the initial player maximum is energy-limited in 16 and the base value in 8, CINF 4037 among the 8; 256 of the 384 level pairs are energy-limited, 6 of the 16 in CINF 4037 (Confirmed, local data; corrected by P3-06/23 from 7: 03's own output and P3-06/16's independent computation both give 6), reachable through the energy menu. No combination gives a non-positive energy, divisor or maximum, or overflows. The energy branch is therefore an ordinary case, decided by P3-07's live state.

**Confirmed (initial block):** `0x2c3b0`, at instantiation step 15 and on resuming from parking (`0x21104`), builds mode 0 at full throttle. The current and the commanded speed both equal object +0x78 exactly; +0x78 is set, +0x70 = C +0xB8 and +0x74 = F(speed ÷ +0x70) (0 when +0x70 is not positive); `0x2c3b0` then clears block +0xB0/+0xB4. The block stores no throttle.

**Confirmed (manual match and `0x21adc`):**

- `0x21adc(subject, target, a, lo, hi)` fails (returns 0 and writes nothing) unless the target handle is valid (`0x52680`), both objects have a block and the subject has a craft record. Otherwise v = (a + 1) × the target's current speed (block +8), and lo and hi are scaled by the subject's maximum (f32). The result is lo when v < lo (the double against the f32), hi when F(v) > hi, and F(v) otherwise. When the subject's block is in mode 0 it becomes the commanded speed and +0x78 is cleared; in any other mode it becomes the current speed. It returns 1.
- Callers: Enter in `0x264a0` and the assist `0x27f68`, both with arguments that clamp the target's current speed to [0, the player's maximum]; the dispatcher's message 0x80000 (`0x213e1`), posted with the same arguments by the AI helper `0x5d090` (through `0x5d080`) for an AI object and its AI target. P3-08 and the autopilot use the same rule.
- Enter acts only in the flight context and tests only that player +0x8C is non-null before the call: there is no kind mask, distance, timer, assist condition, message or HUD flash. With an invalid or block-less target nothing happens and nothing is shown.

**Confirmed (speed assist):**

- **One switch:** Ctrl+Enter (LF) in `0x264a0` (`0x26996`–`0x26a26`) toggles controller +0x1B4, the field that `0x25f90` initialises to (difficulty group = 0) and tests before calling `0x27f68` (`0x26142`). Switching on also clears +0x1B8 (the due time) and +0x1BC (matched) and, with the autopilot off and the flash counter `0x174b28` at 0, starts the HUD flash (`0x269d4`); switching off leaves +0x1B8 and +0x1BC. Every toggle shows the on or off message ([flight message strings](#flight-message-strings-and-the-rens-header-p3-0304)). Only `0x25f90`, `0x264a0` and `0x27f68` access the three fields. The automatic match of [difficulty path 8](./scenario.md#difficulty-readers-p3-01) and the Ctrl+Enter toggle are therefore the same switch; the manual match (Enter) is separate and stateless.
- **Where it runs:** in the player's callback, state 7 with the dead flag clear, after the invalid-target drop and `0x2ddbc`, and before the keyboard poll, the device poll and the 0x20000 post (`0x2611c`–`0x2615f`). While the autopilot flag `0x174b24` is set it does nothing.
- **No valid target** (player +0x8C null or invalid): when +0x1BC is set, it posts a 0x20000 message on the player with full throttle and the axes unchanged, which the loop handles before the controller's own message, posted later by the same callback; it starts the HUD flash when the counter is 0 and clears +0x1BC. Otherwise nothing.
- **Valid target:** it continues only when the target's kind has a bit of `0x380` (a 16-bit test of +4) and the sample is at or past +0x1B8 (unsigned). The distance is `0x56b50`, Σ dᵢ × F(dᵢ) over x, y and z with the differences in double: a squared 3-D distance, compared with the squared range in the f32 constant `0x170e2d`; it continues unless greater, so **equality matches**. Then, when the flash counter is 0, it starts the flash if |F(player speed) − target speed| exceeds the f64 constant `0x170e31` (strict; `0x21c78` gives a speed, 0 without a block). It calls `0x21adc` and ignores the result, sets +0x1BC, and sets +0x1B8 to this sample plus the interval of the [time base](#simulation-time-base-p3-0106) table (no catch-up), also when `0x21adc` failed because the target or the player has no block. Out of range, a wrong kind or not yet due: nothing, and the timer does not advance.
- **Target situations** (code; not observed): selecting another target resets neither +0x1B8 nor +0x1BC. A removed target reads invalid, and the callback clears it before the assist runs (`0x2611f`–`0x26136`), so the no-target branch applies. The parking toggle clears player +0x8C when the target parks (`0x210c4`–`0x210e2`), and the player's Warp start `0x2be00` clears it too (`0x2beaa`–`0x2beba`); in both cases the next frame's assist takes the no-target branch. A destroyed target not yet removed (state 4) keeps its handle and block: the explosion constructor `0x23ac8` only sets the source's state to 4 and neither frees nor rewrites its block, and neither `0x27f68` nor `0x21adc` tests the state or the dead flag, so Enter and the assist keep matching it until its removal (timing: P3-07). A target without a block gets no write, but +0x1BC is set and the timer advances. After switching off and on, +0x1BC is clear, so a later loss does nothing until a new match. A removed object's ID never resolves to a new object, because the node's object pointer is cleared.
- **Flash counter `0x174b28`** (presentation): started by switching on, by a loss after a match and by an assisted match with a large speed difference, each only when the counter is 0 and the autopilot is off. Only the HUD overlay `0x46d38` (called from `0x45de0`, drawn in view modes 0xC and 0xD) advances it, draws the flash text at some steps and resets it after its last step or while the autopilot is on ([HUD text](#hud-map-and-communications-text-from-the-exe-p3-0324)). It is global and is not reset at mission start.
- **Order within a frame:** the assist (direct write to block +0x6C) → the key command (Enter writes directly; throttle keys set the pending value; Ctrl+Enter changes the switch) → the device poll → the 0x20000 post. In the message loop the assist's loss message comes before the controller's message; the movement follows the loop, so all of them act on the same frame's integration. A switch or target change made by a key in frame N is first seen by the assist in frame N + 1.

**Confirmed (player target +0x8C):** the allocator sets it to 0. It is cleared by the invalid-target drop of the player's callback, by the parking toggle when the target parks, by the player's Warp start, and changed by the selection writers (P3-07); AI routines write it for the player only under the autopilot. A handle is valid when its node and the node's object pointer are non-null. How it is first set is in [initial flight state](#initial-flight-state-p3-0605).

Evidence: ignored `local/research/p3-06/speed/` (`ghidra_scripts/SpeedProbe.java` run through `probe.sh`, outputs `out/p1`–`out/p24`; `max-speed.ts` with `out/max-speed.json`, counts and verdicts only). The conclusions were read from native instructions, the callers from whole-image rel32 call scans and 32-bit pointer scans, and the controller's assist fields and the message types also from raw byte scans; undecoded regions were decoded only where a raw hit pointed. Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created, disassembly added and `__watcall` set in memory were discarded.

#### World boundary, active area, parking and autopilot (P3-06/04)

**Confirmed (autopilot):**

- The flag `0x174b24` (image value 0) has two writers: controller creation (`0x26093`, which clears it) and `0x27ee4`. Its readers are the `a` key path, the device poll (the AI step instead of the device), the speed assist (does nothing while it is set), the assist toggle's flash start and the HUD (`0x46b78`, `0x46d38`).
- `0x27ee4(player, controller, on)` returns at once when `on` equals the flag. Switching on requires a valid player target (+0x8C), otherwise it returns silently; it then sets the flag and installs built-in AI record 0 in controller +0x2C ([ai §3.3](./ai.md#33-built-in-program-table-0x1762f8)). Switching off removes the program (`0x5ddd4`) and posts a 0x20000 message with the throttle unchanged and the three axes 0.
- **Callers** (raw rel32 scan; no pointer): the `a` key in the flight context (`0x26eff`, a toggle; the Warp, base and map contexts do not call it), and the pending command `0x174b2c` of the state-7 callback (`0x2626c`, applied when non-negative and then reset to −1, only while the dead flag is clear). Besides controller creation and that reset, the pending command's only writer is `0x27edc`, whose three callers all pass 0: the player-versus-others collision pass `0x29670`, the rescue branch of `0x32e14`, and an AI handler (`0x60ea1`) reached only while a program runs on the player. They can only switch the autopilot off.
- **Consequence:** every new player object starts with the autopilot off; only `a` in the flight context with a valid target switches it on; no flow of the selected mission (spawn, mission flow, rescue, docking, Warp, map) switches it on, and no reader lies in the mission-flow, result or failure code. While the flag stays clear, the assist and the HUD flash starters take their autopilot-off branches, the device poll never runs the AI step on the player, the controller's AI block +0x2C is never installed, and only AI objects reach the float path.

**Confirmed (world rectangle and leaving the world):**

- **Callers of `0x3a41c`** (seven call sites, no pointer): the placement world check in `0x68398` ([placement mappings](#placement-mappings-p3-0202)); the parked exit test in `0x2f314` (below); the map icon list `0x2b8ec`, which only posts an icon item for each craft of kinds `0xfffff` that is not in Warp, not in state 6, visible and inside the rectangle, and for kinds 1 and 2 wherever they are; the map viewport `0x2bc30`, which clamps the map's own rectangle; the map-cursor and world-to-map conversions `0x4c4c0` and `0x4c524` (read only); and the AI leave order `0x5e710`, which sets the AI mode +0xC4 to 4, clears +0x90 and sets the goal +0xAC–+0xB4 to the current position with one coordinate replaced: on the dominant axis, the one with the larger truncated magnitude of x and y (signed compare at `0x5e781`; a tie chooses y), the coordinate becomes a point beyond the world edge on its own side (f64 constants `0x172398`, `0x1723a0`), and z is kept; then `0x5e6cc` may request a Warp out (below). Called with EDX = 0, it sets mode 3 instead of 4. **No caller clamps, moves or refuses an active object's position.** The leave order changes AI state only, and reaches the player's AI state only through the autopilot.
- **Active objects are not bounded:** the movement stage, the collision passes, the player's callback (autopilot off) and the generic callbacks reach none of `0x3a41c`, `0x3a540`, `0x6a2f8` or `0x2f314` by direct calls, and the grid globals `0x186b34`–`0x186b44` are referenced only inside the grid module `0x3a380`–`0x3a820`. Active objects, the player included, can fly beyond the world rectangle without any clamp, removal or message. An active non-player object outside the world stays active while it is inside the active area; outside the area it parks, and the parked update takes over.
- **The only exit** is the arrival branch of `0x2f314` (below): a parked object of a kind other than 2 whose subject arrives at its goal while outside the world rectangle inset by 100 units. The test uses the subject's position before this update, ignores z and compares strictly, f32 coordinates against integer bounds, so the inset bounds themselves count as inside. It sets state 6 and posts object event 2 through `0x6977c` at once, in the parked-update stage (its effects, the per-kind counter `0x1b45bc`, the record's trigger `0x695c0`, the sector bookkeeping `0x6a2b0` and, for enemy kinds outside wave mode, the remaining-enemy check `0x69a70` of [mission result](#mission-result-success-path-and-campaign-restart-p3-0104), belong to P3-11); the object is removed one frame later, when its own callback posts message 0x20 ([object table](#runtime-object-table-p3-0201)). Event 2 has no other source (all six callers of `0x6977c` were read). Kind 2, the wingman, never leaves. A goal inside the inset rectangle never leads to an exit; the shipped AI reaches one through the leave order.

**Confirmed (active area):**

- `0x3a468` walks kinds `0x1fffffe` (every kind except the player) and calls `0x3a4b0` for each object in state 7 or above, with EDX = 0 for the first and 1 afterwards. `0x3a4b0` tests the position with `0x3a540` ([instantiation](#instantiation-p3-0203) step 14), then:
  - outside with activity +2 = 1: posts a presentation item (type 4 for kinds in `0xfffff`, otherwise 8, with byte +8 = 3; Likely "remove the visual"), then sets state 6 when the kind has a bit of `0x1f00000` and state 5 otherwise;
  - outside with +2 ≠ 1 (parked, docked or 2): unchanged;
  - inside with +2 = 0 and +0xCC = 0: state 5;
  - inside otherwise (active, docked, or parked in Warp transit): unchanged.

  Nothing is released here; the block, the player's target and the AI controller are handled at the toggle.
- `0x3a540` returns 1 at once in wave mode. With EDX = 0 it recomputes the centre (the player object's position, or player-state +0x10/+0x14/+0x18 while the player object's +0xCC is set) or, without a player object, caches "no player" and returns 0; with EDX ≠ 0 it reuses the cache. The player does not move within one walk, so the cache gives the same result as recomputing. Without a player object every walked object is outside.
- **Correction (object states and removal, [object table](#runtime-object-table-p3-0201)):** the "flag bits 0x1F0 at +6" are kind bits `0x1f00000`. +6 is the upper half of the 32-bit kind at +4, and no game instruction writes +6 (raw store scan; stores through computed or indexed addresses and block copies are not covered). These kinds are `0x100000` (missiles), `0x200000` (gun projectiles), `0x400000` (explosions), `0x800000` (role not traced) and `0x1000000` (fragments). They are removed instead of parked when they leave the area, without event 2.
- **Toggle (message 0x20, `0x21060`–`0x2112b`)** for a state-5 object whose kind has no bit of `0x1f00000`:
  - **park** (+2 = 1 or 3): `0x525b8` releases the block (+8 = 0; it also frees block +0xA8 when set and, for kinds `0x300000`, drops the reference at block +0xFC), +2 = +3 = 0, and the player's target is cleared only when it is exactly this object. Other objects' AI targets, formation leaders and the assist state keep their references;
  - **resume** (+2 = 0): +2 = 1, +3 = 0, and `0x2c3b0` builds a new block (mode 0, full throttle, the current position and pose; the identity for kind 1) and posts the creation item;
  - +2 = 2: nothing; the state stays 5.

  Neither branch writes +0x18, +0xC8 or +0xCC. The object's own callback removes its AI controller in state 5 and installs it again in state 0, with the handler `0x62250` for a parked object ([ai §1](./ai.md#1-loading-the-id-chain-and-the-group-0-closure-confirmed)).
- **Frame timing:** the area check of frame N sets state 5; the loop of frame N + 1 toggles the object to state 0, and the stages of N + 1 skip it. A parked object's callback posts state 7 directly in frame N + 2, unless `0x2f298` reports a Warp transit, in which case it stays in state 0; the parked update of N + 2 can already process it. A resumed active object passes through state 2 and moves and is area-checked again only from state 7 ([frame pipeline](#frame-pipeline-p3-0201)).
- **Message 0x800000** (formerly "role not traced"): the Warp-out request. Only the AI routine `0x5e6cc` posts it, when the object is in state 7 or above, `0x2fef8` holds (activity 1, not in Warp, the goal outside the active area) and `0x2ff98` allows a Warp. The handler (`0x214a4`–`0x2150c`) checks again, posts the visual-removal item, sets state 5, +0xCC = 1 and +0xC8 = 0, and sets +0x18 so that the next parked check is due at once. The object parks at the next toggle, and its first parked update starts the Warp jump. The request's sender belongs to P3-08, the Warp to P3-09.

**Confirmed (parked update `0x2f1b0`):**

- **Selection and cadence:** it walks kinds `0xfffff` and selects parked (+2 = 0), state 7 or above, not dead (+0xD8 = 0). While the typed-cheat flag `0x174ee0` (row 21 of the cheat table `0x174ee8`) is clear, as in normal play, it draws one rand for **every** selected object in **every** frame and compares the sample (unsigned, at or past) with +0x18 plus that frame's random threshold ([frame pipeline](#frame-pipeline-p3-0201) step 5). When due: elapsed = sample − old +0x18 and +0x18 = sample, before anything else; then the next object when `0x2f298` reports a Warp transit; otherwise `0x2f314(object, elapsed)` and, by the AI mode +0xC4, the parked combat `0x2ffec` (mode 1) or `0x30150`. A negative result from either ends the walk.
- **+0x18:** written by instantiation step 11 (the sample), the due check (the sample) and the message-0x800000 handler. The allocator does not initialise it, and parking and resuming leave it unchanged, so an object that was active for a long time has a long elapsed time at its first parked check, and its first travel step can be long (capped by the goal distance). Edge (P3-08): the AI-path constructor `0x38780` (kind `0x4000`) never writes +0x18, so such an object created parked would start from the reused pool slot's value; whether that happens in the slice is Unconfirmed.
- **Warp transit `0x2f298`:** when +0xCC and +0xC8 are both non-zero, the transit lasts C +0xA8 seconds (converted to clock units by a shift), from the leader's craft record when +0x7C is a valid handle. While it has not elapsed (unsigned) it returns 1; afterwards it clears +0xCC and returns 0. The generic callback `0x20c18` also calls it in states 0–3, so an object in transit does not advance its state.
- **Warp eligibility `0x2ff98`:** C +0xA4 > 0 (signed) and either +0xC8 = 0 or the sample is past +0xC8 plus C +0xA8 + C +0xA4 seconds (summed as integers, converted to clock units by a shift; unsigned compare).
- **Parked travel `0x2f314`:**
  - **Inputs:** a formation leader +0x7C that is set but invalid is cleared through `0x52898`, and the update ends without motion. The subject is the valid leader, or the object itself. With the subject's AI mode +0xC4, the target is subject +0x8C in mode 2 when valid, otherwise subject +0x90. Modes 5 and 1, an invalid target or a target in Warp give no motion. The goal is subject +0xAC–+0xB4 without a target; with one, the target's position plus the subject's offset +0xB8–+0xC0, where a zero offset is first replaced by a random direction (`0x56b8c`) times a random length (draws) and stored. The distance is measured from the subject's position.
    - **Details (Confirmed; P3-06/23, from 14):** the zero test ignores the sign of each component. The random offset is stored in the subject, so in the leader when there is one, not in the object. It takes one draw for the length, then the direction's two; each component is F(D(u_k × F(length))). The goal is then F(D(target position + offset)) per axis.
    - **Distance (Confirmed; P3-06/23, from 14):** with δ = D(goal − subject position) per axis, S = D(D(δy × F(δy) + δz × F(δz)) + δx × F(δx)). The arrival test compares S itself; the Warp-jump test compares F(S) with D(D((C +0x0C)²) × `0x170fd4`); the pose rebuild uses F(S) and the stored F(δ).
  - **Arrival** (the squared distance below the f32 constant at `0x170fd0`, strict), in order: the wingman's base-arrival report (kind 2 with a target of kinds `0x68000`, through `0x39820`; P3-10); the offsets cleared when there is a target; a new goal from the source record's placement route through `0x68598` when there is no leader and the mode is 4 (with the route's draws); +0xCC = 0; the world-exit test above. The branch writes no position, and every exit of `0x2f314` returns 0.
    - **Details (Confirmed; P3-06/23, from 14):** the offset cleared is the object's own +0xB8–+0xC0, not the subject's, so a follower's leader keeps the offset its goal was built from. The mode tested is the object's own +0xC4, and the new goal goes to the object's +0xAC–+0xB4. The record passed to `0x68598` is the object's source record +0x190 or, when that record's member back-reference +0x3C is set, the template (entry +8) of that section-5 entry. `0x68598` takes the record's rectangle +0x44 when set, otherwise its path +0x4C with +0x50 passed unchanged as the direction (no direction draw, unlike `0x68050`), otherwise the world default `0x68c98`; it then sets the fixed height for record kinds in `0x87c`. There is no grid, anchor, stored position or world check.
  - **Warp jump** (the parked path of P3-09's Warp), taken when there is no leader, the squared distance exceeds (C +0x0C)² times the f32 constant `0x170fd4` (strict) and `0x2ff98` allows it; or when there is a leader whose +0xCC is set; or when +0xCC is set and +0xC8 is 0 (after message 0x800000). It sets +0xCC = 1. Without a leader: +0xC8 = sample, the pose faces the goal, and the object moves toward it by the distance, or by C +0xA0 when that is above a fixed lower bound and below the distance (both strict), plus a random jitter per axis (six draws, a sign and a magnitude per axis). With a leader: +0xC8 = the leader's +0xC8, then the formation snap.
  - **Normal travel** (no leader, no jump): the pose faces the goal; the step is elapsed in seconds × C +0xB8, the craft's base maximum speed, not the current maximum; the object moves by F(step), or by the distance when the step reaches it, plus a smaller random jitter (six draws).
    - **Step (Confirmed; P3-06/23, from 14):** the step is D(D(elapsed × the f32 constant `0x170fe0`) × C +0xB8), elapsed being the clock difference loaded as an unsigned integer. This unrounded step is compared with the f32 distance: when it reaches it (ordered, equality included) the object moves by the distance, otherwise by F(step).
  - **Move and jitter** (Warp jump and normal travel; Confirmed; P3-06/23, from 14): the position becomes F(D(p_k + F(D(row3_k × length)))) per axis. Then, for x, y and z in turn, a sign draw (odd adds, even subtracts) and a magnitude draw give a signed integer n, added as F(D(p_k + n)).
  - **Formation snap** (a valid leader without a jump of its own): the leader's pose is copied, and the position is `0x56e34`(leader pose, leader position, offset +0x80–+0x88) = leader position + o.x × row 1 + o.y × row 2 + o.z × row 3 (double accumulation, f32 stores; exactly, component k is F(D(p_k + F(D(D(o.y × row2_k + o.x × row1_k) + o.z × row3_k)))), the products exact in double; Confirmed, P3-06/23, from 14). Section-5 dispatch writes +0x7C through `0x52898` and +0x80–+0x88 in `0x67678`, so **the formation leader and offset of [section-5 dispatch](#section-5-dispatch-p3-0202) are confirmed by this consumer.**
  - **Pose rebuild:** row 3 = the normalised goal direction; the reference up is the x axis when |row 3 z| exceeds the f64 constant `0x170fd8`, otherwise the z axis; row 1 = the normalised cross product of up and row 3 (`0x56aa8`); row 2 = row 3 × row 1.
    - **Numbers (Confirmed; P3-06/23, from 14):** the distance is F(D(√F(S))) and q = D(1 ÷ distance). Row 3 is F(D(F(δ_k) × q)) per axis; it does not pass through `0x56aa8`. The up test compares |D(F(δz) × q)|, the unrounded value before row 3's store, with `0x170fd8` (strict). Each cross-product component is F(D(D(a × b) − D(c × d))) of f32 inputs. Row 2 is not normalised.
    - **`0x56aa8` (Confirmed; P3-06/23, from 14):** L = F(D(√D(D(y × y + x × x) + z × z))). When L is ±0 the vector is unchanged and 0 is returned; otherwise each component becomes F(D(c × D(1 ÷ L))) and L is returned.
  - **Commit** through `0x6a2f8(object, position)`: when the sector cells of the old and the new position differ (`0x3a680`, clamped by `0x6a408`), the per-sector resource test `0x6a11c` runs on the new position; on failure it returns −1 **without writing the position**, while the pose, +0xC8 and +0xCC written by this update stay. On success the object's resource entries move between the cells (`0x6592c`, `0x6569c`), and the position is written. After a successful write, when the new position is inside the active area and the kind is in `0x93780`, `0x3c3b0` runs (the base-proximity report through communications, P3-10).
- **Parked combat:** `0x2ffec` (mode 1, against every hostile craft within C +0x0C) and `0x30150` (against the subject's target; damage from the weapon mounts scaled by elapsed, through `0x2a694`; +0x24 of both set to the sample). Structure only; P3-07 and P3-08.
- **Classification:** the only true exit is the one above. Re-placement, a non-continuous move, happens only while parked: the Warp jump, each travel step and the formation snap; it posts no event and changes no activity, and a parked object has no visual until it resumes. Everything else stays. Active objects are never re-placed by these rules.
- **Handoff:** the AI inputs (mode, targets, goal, offset), their initial values (`0x68050`, [instantiation](#instantiation-p3-0203) step 10) and the programs that change them, including the leave order and message 0x800000, belong to P3-08; parked combat to P3-07 and P3-08; event 2's effects to P3-11; the reports of `0x39820` and `0x3c3b0` to P3-10; the player's Warp, its completion and the area centre during it to P3-09.

**Confirmed (object sets `0x2ede0`):** with a player state, it rebuilds through `0x2f028`, in practice every frame, the craft handle sets `0x174b74` (kinds `0xfffff` not in `0x93780`) and `0x174b78` (kinds in `0x93780`), and sets every craft's +0xD4 to (source record +0x7C ≠ 0). Its rate-limited branch is taken only while the remembered mode `0x174b7c` is −1 or both it and the current view mode are 8; it is set on the first frame with a player state and never reset. In view mode 8 it then calls `0x2ee60`, which drops invalid handles and sets +0xD4 = 1 on every friendly craft and on each hostile craft within a friendly craft's C +0x0C (2-D, strict): map visibility. The sets are read only by `0x2ede0`, `0x2ee60`, `0x2eff8` (release, from the main flow and the builder), `0x2f028` and the parked AI handler `0x62250`; +0xD4 by the map list `0x2b8ec`, `0x2e990`, `0x2ee60` and the AI code `0x5d6a8`/`0x62760`. **The area check, the toggle and the parked update read neither the sets nor +0xD4.**

**Local data (CINF 4037; verdicts only):** the two kinds of the selected mission's parked section-5 craft (`0x80`, `0x100`) satisfy the craft preconditions of the parked Warp jump (C +0xA4 and C +0xA0), and the wingman kind 2 satisfies the +0xA4 one, so the jump is reachable in the slice; whether it happens depends on the AI goals and the Warp timer. Kind `0x4000` (AI mode 5 after instantiation) has no parked motion, and kind `0x20000` (mode 1) has parked combat only. In all 480 craft records C +0x0C, +0xA0 and +0xB8 are finite, +0x0C is positive, +0xA8 is non-negative and (C +0xA8 + C +0xA4) × 64 never overflows.

Evidence: ignored `local/research/p3-06/area/` (`ghidra_scripts/AreaProbe.java` run through `probe.sh`, outputs `out/p1`–`out/p25`; `area-data.ts` with `out/area-data.json`, booleans and counts only). Every conclusion was read from native instructions; every routine named was checked with whole-image rel32 call scans and 32-bit pointer scans; reachability from the movement stage, the collision passes and the callbacks by direct calls; +6 by a raw store scan. Not traced: the AI programs that set modes, goals and the leave order (P3-08); the contents of `0x3c3b0` and `0x39820` (P3-10); the damage of `0x30150` (P3-07); when the resource test fails at run time; `0x2bf08` and `0x3a6e8` (P3-09). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created, disassembly added and `__watcall` set in memory were discarded.

#### Initial flight state (P3-06/05)

**Confirmed (the player's target is null at instantiation):** `0x68050` writes the AI target +0x90 (through `0x528e8`, which releases the old reference at +0x90 and stores the new one), never +0x8C, for every kind; only `0x67938` calls it. No direct-call path from `0x67938`, `0x67678`, `0x2c3b0`, `0x21794` or `0x68050` reaches the +0x8C setter `0x528bc`, and a scan of decoded stores finds no other writer of +0x8C. The allocator clears +0x8C, together with +0x90, +0x7C, +0x14, +0xC8, +0xCC and +0xD8, and sets +0xC4 to its default. Three references are distinct:

- **the player reference**, player-state `0x1b0638` +0x8C: the player's own handle (instantiation step 15, through `0x52998`), not a target;
- **the AI target and goal**: object +0x90, the goal point +0xAC–+0xB4, the offset +0xB8–+0xC0 and the mode +0xC4, written by `0x68050` (semantics P3-08);
- **the player target**, object +0x8C: written only through `0x528bc`, by the dispatcher's message 2 (`0x213fc`), and cleared as in [speed matching](#throttle-maximum-speed-and-speed-matching-p3-0603). Message 2 is posted by `0x2799c` (`t`, `f` and the automatic selection below), `0x27a04` (`u` and stick button 0x80) and the cycling helpers; its handler also posts a presentation item (a sound, P3-14).

**Confirmed (automatic target selection):** at the end of the state-7 player callback (`0x261f1`–`0x26251`), after the polls, the 0x20000 post and the triggers:

- when controller +0x1A8 is below the sample (unsigned, strict), the view mode is none of 0, 1 and 6 nor 0x11 with sub-mode 8, and player +0x8C is null, it calls `0x2799c(player, 0)` and on success sets controller +0x198 = 0 (enemy mode); in every case +0x1A8 is then re-armed at the sample plus a fixed interval. Controller creation sets +0x1A8 = 0, so the first state-7 callback always checks. The only writers of +0x1A8 are these two;
- `0x2799c(player, 0)` asks `0x63858` with the enemy mask `0x93780` (`0x206c87e` in mode 1) and, for a valid result different from +0x8C, posts message 2, which the same frame's message loop applies;
- **`0x63858` returns the nearest candidate, not the one in front.** It keeps objects with activity exactly 1 (parked and docked excluded), state 7 or above, other than the reference object and with +0xCC ≠ 1 (not in Warp), and scores them with the squared 3-D distance `0x637e4` (each difference in double times its f32 rounding; for x both factors are the f32 rounding). The best is replaced only by a strictly smaller score, so ties keep the earlier object in walk order;
- owner: P3-07 (the selection, its cadence and gate); P3-06 owns the field and its lifecycle. The player's target does not depend on P3-08.

**Timeline (Confirmed, code; one step Likely).** B is the build frame:

1. **Frame B:** the builder sets the scheduling origin and samples again; the dispatcher's first queue check instantiates the time-0 objects. **The player is the first object instantiated in all 52 missions** (one kind-1 record each, first in queue order; local data). For kind 1, `0x67938` runs `0x3060c` (step 7: the maximum speed, the energy timers +0x20 and +0x24, one draw), clears the two-bit fields (step 9), runs `0x68050` (step 10, below), sets +0x18 (step 11), skips step 12, installs the callback `0x25f90` without an AI program, sets activity 1 unconditionally, runs `0x2c3b0`, skips `0x38cd4`, and sets up the player state (view mode 0xC, the player reference). The player is in state 0, and the movement pass skips it.
2. **Presentation (Likely):** the frame's render `0x3ee58` → `0x3d4e4` requests the model with the completion callback `0x3d904` (`0x65ca4` → `0x65d10` → `0x6b828` → `0x6a8f0`). At the end of `0x3d4e4`, `0x65dec` calls `0x6b8ec(0)` while the player is below state 7, and `0x6baf8(queue, 0)` then has no deadline and an unlimited work budget (`0x6bd28`). The completion callback sets state 0 → 1, so the player is very likely in state 1 by the end of frame B. Whether `0x6bc70` can leave a request pending across calls was not established; if it can, the later steps shift by whole frames.
3. **Frame B + 1:** the first callback (`0x25f90`, states 0, 1 or 3 → `0x25fb4`) creates the controller and posts state 7 (state 2 when the state is still 0, `0x260b2`); the loop applies it, and `0x221fc` **moves the player for the first time**, with this frame's dt. No state-7 behaviour runs yet.
4. **Frame B + 2, the first controllable update** (the first state-7 callback), in order: the dead-flag test, +0x0C = 0, the invalid-target drop (nothing), `0x2ddbc` (missile lock-on; returns without a target), the speed assist when switched on (no target, not matched: nothing), the keyboard poll (due at once: one waiting key is handled), the device poll (due at once; in the baseline configuration every read is zero and posts nothing), the map-cursor poll, the 0x20000 post only when a key set a pending value, the triggers, the automatic selection and the pending autopilot command (none). The loop then applies message 2 and the movement pass moves the player again; the assist sees the new target from frame B + 3.

**Confirmed (pose, position and block at instantiation):** for kind 1, `0x2c3b0` passes mode 0, the object's own position (copied unchanged), the identity rows and full throttle; other kinds pass their rows. The pose that placement computed, copied at step 5, is overwritten before anything reads it. The block is that of the [initial block](#throttle-maximum-speed-and-speed-matching-p3-0603): speed = commanded speed = the maximum exactly, +0x78 set, +0x70 = C +0xB8, the ratio F(maximum ÷ C +0xB8) (exactly one when they are equal, as in the slice; below one when the maximum is energy-limited), and impulse, timed rotations, steady rates and flags, lock and disturbance all 0. The maximum at instantiation is deterministic: the initial levels are fixed by code, field 2 is clear, and it draws nothing. Until the first steering, throttle, match, impulse or timed-rotation write, the integrator changes only the position: row 3 is the z axis, so x and y gain +0 (a −0 coordinate becomes +0 under round to nearest) and z gains F(D(maximum × dt)), while speed, ratio and rows stay bit-identical. **The player flies straight along +z at its initial maximum.**

**Orientation in world terms (Confirmed as vectors, Likely as naming):** with the frame meanings of [controls](#flight-controls-and-rotation-p3-0602) (rows right, up and forward; row 3 as the direction of motion is Confirmed; the renderer update `0x3d4e4` case 1 passes rows 3 and 2, in that order, to `0x7abf0`, whose look and up roles are Likely), the player starts with right = +x, up = +y and forward = +z. Every rule that treats an axis specially treats z as the axis out of the sector plane: the world rectangle, the sector mapping, the active-area test and the strategic map use x and y only; rectangle and world placements set z = 0; the non-player placement poses and the parked pose rebuild take +z as up, with forward in or near the x/y plane. In the frame of every other placed craft, the player therefore starts pointing perpendicular to the sector plane. Calling z "height" is a naming convention only: no rule has gravity or a preferred up (Likely). The player record's route decides only the position (over the 52 missions: rectangle 49, anchor 2, stored position 1; the selected mission: a rectangle, z = +0), and no record field affects the player's pose.

**Confirmed (controller construction, frame B + 1):** the device, keyboard and map-cursor due times +0, +4 and +8 are 0 (due at once); +0x0C = 0; the trigger levels +0x10, +0x14 and +0x18 are 0; the pending throttle and axes +0x1C–+0x28 are "unchanged"; the target mode +0x198 is 0 (enemy); +0x19C, +0x1AC and +0x1B0 are 0 (roles not traced); the automatic-selection due +0x1A8 is 0; the speed assist +0x1B4 = (difficulty group `0x176708` = 0); +0x1B8 = +0x1BC = 0; the globals `0x174b2c` = −1 (no pending autopilot command) and `0x174b24` = 0 (autopilot off). The rest of the 0x1C0 bytes is not initialised. Only state-7 code reads the controller (the assist fields only in `0x25f90`, `0x264a0` and `0x27f68`), so setting these values at instantiation instead could not be observed (Likely: the readers of the other fields were not enumerated).

**Confirmed (`0x68050` for every kind; extends [instantiation](#instantiation-p3-0203) step 10):**

- The fixed kinds of step 10 get only +0xC4, with no search and no draw.
- The other kinds, the player included:
  1. `0x68018` gives the candidate mask from the source record: +0x58's kind while that record's spawn counter is positive, with a record filter; otherwise +0x5C. A zero mask skips to step 3.
  2. A walk of the mask finds the nearest object by squared 3-D distance (every state and activity counts, and the object itself when its kind is in the mask) and counts the n candidates. When the nearest is of the other side (for a subject of kinds `0x6c87f`, a candidate with no bit of `0x6c07f`; otherwise one with no bit of `0x93f80`) and farther than the distance of step 10, **one draw** selects the (rand % n)-th candidate in walk order, replaced by the nearest when that candidate's kind has a bit of `0x6000`. Then +0xB8–+0xC0 = 0, +0x90 = the choice (null when n = 0) and, when it is non-null, +0xC4 = 2 for the same side or 0 for the other.
     - **Search details (Confirmed; P3-06/23, from 10):** with δ = D(candidate − subject) per axis, each candidate's score is F(D(D(δy × F(δy) + δz × F(δz)) + δx × F(δx))). The best score starts at a negative sentinel (immediate at `0x680f4`) and is replaced while it is still negative or when a score is strictly smaller, so the first candidate in walk order is taken and ties keep the earlier one. The object itself is scored and counted in n like any other candidate.
     - **Threshold (Confirmed; P3-06/23, from 10):** "farther than the distance of step 10" means the nearest's f32 score is above F(D(t × F(t))), where t = D(the runtime scale at [header](./scenario.md#2-scen-header-confirmed-on-all-52-entries) 0x08, read through `0x1766fc`, × the f32 constant `0x1725d0`) stays unrounded on the stack while its f32 store F(t) is the other factor; the compare is f32 against f32 and strict, so an equal score is not farther. The random choice walks the list again with the same record filter.
     - **Offset only on this path (Confirmed; P3-06/23, from 10):** a zero mask skips both writes of this step. Neither the object allocator `0x520d4` nor the pool allocator `0x566dc` writes +0xB8–+0xC0 or the goal +0xAC–+0xB4, so a reused pool slot keeps its previous values there. Whether a fresh pool block from `0x56620` is cleared was not checked.
  3. When +0x90 is null, a goal point: record +0x4C null → `0x68c98` (**two draws**, x then y; z = 0). Otherwise record +0x50 = 2 → **one draw** for the path direction, 1 → direction 0, any other value → direction 1; then `0x688c4(path, direction)`: path type 0 → an endpoint (no draw), type 1 → **one draw**, types 2, 3 and above → `0x68c98` (**two draws**). +0xAC–+0xB4 = the point and +0xC4 = 4.
- The search draw always yields a non-null +0x90, which skips the goal point, so one call draws 0–3 times; the count depends on record +0x58, +0x5C, +0x4C and +0x50 and on the objects present.
- **The player:** in all 52 missions the kind-1 record has +0x58 null, +0x5C zero and +0x4C null (local data), so the player always takes the world-default goal: exactly two draws, +0x90 stays null, +0xAC–+0xB4 is a random world point with z = 0, +0xC4 = 4, and its offset +0xB8–+0xC0 is not written (Confirmed; P3-06/23, from 10). For the player these fields are read only by AI code, which runs for it only under the autopilot (Likely: the consumer enumeration is not exhaustive), but the two draws consume the shared generator between the player's `0x3060c` draw and the next object's placement. In the selected mission the player's instantiation draws five times: placement 2, `0x3060c` 1, `0x68050` 2.
- The order of the draws within one instantiation is that of [instantiation](#instantiation-p3-0203): placement, name fallbacks, `0x3060c`, `0x68050`, the Warp timer +0xC8 (kinds other than 1 and 2), `0x20990`, `0x38cd4`.

**Confirmed (mission-relative times):** absolute samples carry no meaning across runs, because the raw counter starts at a random value and runs through menus, clips and the build ([time base](#simulation-time-base-p3-0106)).

- The mission elapsed time E = sample − `0x176740` is what the spawn queue compares; at the build frame it already includes the state-2 clips and the build.
- The instantiation-relative time τ = sample − the sample of the instantiation frame suits the take-off state. The player's +0x18 holds that sample and is not rewritten, since kind 1 is never parked (Likely: the other writers of +0x18 were not enumerated).
- In the original, +0x18 and +0x20 hold the instantiation sample and +0x24 that sample plus a random offset. The controller's due fields start at absolute 0, "due at once"; every comparison with them happens at a positive sample, so 0 maps to 0, and the re-armed due times convert with τ. Timed-rotation expiry depends on the absolute f32 seconds ([numbers](#numbers-on-the-movement-path-p3-0601)) and cannot be reproduced by shifting the origin.

**Selected mission (code and local data; Likely, not observed):** the only enemy-mode objects active at time 0 are section-1 record 3's two kind-0x80 craft, anchored on the player ([scenario](./scenario.md#selected-mission-instantiation-p3-0203)); the section-5 objects start parked, and kinds 0x20000 and 0x4000 are not enemy-mode. They are instantiated right after the player in the same frame and follow the same state path; if they are in state 7 or above at the player's first state-7 callback, the player's target after the first controllable update is the nearer of the two. Their anchor offsets put them beyond the assist's range at first, so the assist does not match at once.

Evidence: ignored `local/research/p3-06/initial/` (`ghidra_scripts/InitProbe.java` run through `probe.sh`, outputs `out/p1`–`out/p17`; `player-record.ts` with `out/player-record.json`, classes and counts only). Every conclusion was read from native instructions; callers come from raw rel32 call scans, direct-call reachability and scans of decoded stores to +0x8C, +0x198 and +0x1A8 (decoded instructions only). Not traced: whether `0x6bc70` can keep a request pending; the roles of controller +0x19C, +0x1AC and +0x1B0; `0x27a04` and `0x63a4c`; the AI consumers of the player's +0x90 and +0xAC–+0xC4 under the autopilot; other writers of +0x18. Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created, disassembly added and `__watcall` set in memory were discarded.

#### Runtime check (P3-06/17)

**Confirmed (runtime, baseline DOSBox-X, fixed 40000 cycles, the selected mission at difficulty 19 with wingman 1):** 15 complete runs of [B-008](../behavior/B-008-flight-motion.md#测量结果) (all input written inside the emulator at recipe pauses), compared with the rules of this section and P3-06/01's independent exact evaluator. Statistics and verdicts only; the readings stay in ignored `local/research/p3-06/runtime/`.

- **Movement stage, mode 0:** 150 same-frame pairs before and after `0x221fc` (126 of the player, 24 of its target, an AI-flown craft; steps of 0, 2, 4 and 6 units and the long first movement; straight, accelerating, decelerating, every steering axis and sign, pitch with yaw, pitch with roll, and the first frame after a release) are reproduced bit for bit: position, rows, speed, speed ratio and the reached flag. Between frames the player's pose, speed and ratio are unchanged (34/34).
- **Rounding in flight (M-10):** 82 of these pairs give different results under round to nearest and chop. All 82 match round to nearest and none matches chop, so **the movement write-backs in flight round to nearest**. This extends P3-02/10's runtime observation from placements to the movement path; the cause of the contradiction with the static chop inference ([x87](#x87-precision-rounding-and-trigonometry-p3-0202)) is still Unconfirmed.
- **Controls:** a device value of ±128 written after the driver at `0x57dab` is applied in the same frame: rate = ∓1 × the craft's axis rate (0 ulp) with the enable flag set, on every axis and sign and in the combinations pitch with yaw and pitch with roll. When the previous-reading copy equals the new value, nothing is applied and rates and flags stay (32 unchanged reads during holds); a change back to the driver's 0 clears only the enable flag.
- **Speed keys:** Shift+1 … Shift+0, `\`, Backspace, `+` at full, `-` at 0, `+` and `-` at intermediate values, Shift+9 then Backspace, and `-` after a match (41 keys) give the commanded speed F(table entry × maximum) of the documented throttle, from the readback where it applies, in the same frame, and clear the reached flag.
- **Speed assist and Enter:** over 118 due frames (the target's kind always in the mask) the match happens exactly when the squared distance is within the f32 range squared, then the commanded speed is the target's speed clamped to [0, maximum] (0 ulp), reached is cleared, matched is set and the due time becomes the sample + 32; out of range the due time is unchanged. Six consecutive match intervals are all 32 units. Switching on clears the due time and matched and is followed by a match in the next frame when the target is in range; switching off keeps them; Enter writes the same result without changing the switch.
- **Due intervals:** keyboard poll 18 units (20 after a 4-unit frame), device read 8 units, automatic selection 66 units: the first frame strictly past the due time.
- **Take-off:** the instantiation fields of [initial flight state](#initial-flight-state-p3-0605) hold in both runs; the controller is built at B + 1 with the player in state 1 (the Likely step of the timeline), the first movement is at B + 1 and the first controllable update at B + 2, after which the target is the nearer opening enemy. In both runs the first movement's step was seconds long (the load time after instantiation; it depends on cycles and load), so the player first moves a long way along +z. The random placement and the `0x68050` goal point were not checked against their supports here (P3-06/18).
- **Area, parking and the world rectangle:** 200 area predictions match the objects' activity and state; at four toggles (two resumes, two parks) the exact area test on the positions at the toggle lies on the side the toggle requires, and the toggle builds or releases the block and keeps the pose (the frames of the state-5 write and of the return to state 7 were not read); 12 normal-travel and 6 formation-snap updates reproduce the rebuilt pose and the snapped position at 0 ulp, with integer jitter within ±19; 18 elapsed times lie in 66–86 units with +0x18 equal to the sample. The player flew past the +y edge of the world rectangle in two runs and stayed active and in state 7, moving straight within rounding. The parked Warp jump, arrival and true exit were not observed.

### Flight message strings and the RENS header (P3-03/04)

Research of P3-03 [subtask 04](../../plan/p3/03/subtasks/04-comm-hud-text-research.md), 2026-10-09: read-only static analysis on a private copy of the Ghidra project (`-noanalysis -readOnly`). It used probes through the verified source chain that print only offsets, lengths, byte classes and predicates: the EXE regions through the shared LE reader (`le-executable.ts`), and RENS 10751. No text or field values are reproduced here.

**Flight message strings (Confirmed, code and data):** at each of the seven call sites, the code loads the string's address into EAX as an immediate and calls `0x4e9e8` directly. The colour (DL), a second argument (EBX) and the display time (ECX) are code constants of the site. A 32-bit scan of the image finds each address exactly once, at its site.

`0x4e9e8` measures the string with a byte scan to its NUL, allocates the length plus one (`0x74190`) and copies the bytes unchanged into a record of the message queue `0x175f08`. The record holds the copy at +0x00, the colour at +0x04, the length at +0x0C, the width in pixels at +0x10 (the length times the advance of font record 0) and the expiry time at +0x18. The message-line drawer that reads the queue (instrument type 8, around `0x4e69b`–`0x4e95b`) draws a window of the copy with `0x59fc8`, which draws every byte as its glyph ([hud §1.1](./hud.md#11-glyph-layout-and-character-maps-likely)).

No code formats or interprets these strings: no formatting call is involved, so they hold no format specifiers in effect, and the data contains no `%` byte either.

| Address | Object, offset | Bytes with NUL | Region locator | Call site (function) | Sender and condition |
|---|---|---:|---|---|---|
| `0x17106c` | 4, 0x106C | 40 | `le/4/0x106c/40` | `0x32c93` (`0x3266c`) | Completion message, in-mission state 4 ([mission result](#mission-result-success-path-and-campaign-restart-p3-0104) step 4) |
| `0x171094` | 4, 0x1094 | 46 | `le/4/0x1094/46` | `0x33498` (`0x33464`) | Beacon message ([energy loss](#mission-failure-player-loss-and-rescue-p3-0105)) |
| `0x170db8` | 4, 0xDB8 | 16 | `le/4/0xdb8/16` | `0x269fb` (`0x264a0`) | Speed-assist toggle, when the toggled byte (controller +0x1B4, at player object +0x14; formerly given as player object +0x1B4, corrected by P3-06/03, [speed assist](#throttle-maximum-speed-and-speed-matching-p3-0603)) is now non-zero |
| `0x170dc8` | 4, 0xDC8 | 17 | `le/4/0xdc8/17` | `0x26a1b` (`0x264a0`) | Same toggle, when the byte is now zero |
| `0x170ddc` | 4, 0xDDC | 28 | `le/4/0xddc/28` | `0x26e45` (`0x264a0`) | Joystick sensitivity: `0x57d60` returned level 0 and `0x57c24(1)` set level 1 |
| `0x170df8` | 4, 0xDF8 | 26 | `le/4/0xdf8/26` | `0x26e78` (`0x264a0`) | Joystick sensitivity: level 1, `0x57c24(2)` set level 2 |
| `0x170e14` | 4, 0xE14 | 25 | `le/4/0xe14/25` | `0x26eac` (`0x264a0`) | Joystick sensitivity: level 2, `0x57c24(0)` set level 0 |

**Regions:**

- Object and offset follow the object bases in [production-executable.ts](../../../src/original-data/conversion/production-executable.ts).
- Every region lies in file-backed pages of object 4, and no fixup patches any of its bytes: the shared reader accepted each exact region.
- Every string starts at a 4-byte-aligned address. Five follow the previous string's NUL directly. Before `0x17106c` and `0x170e14`, two non-NUL padding bytes follow the previous NUL, and no 32-bit value in the image points at them. Each region starts at the address the code passes.

**Text rules (Confirmed):** neither `0x4e9e8` nor the drawer treats any non-zero byte (1–255) specially. In the data, every byte before the NUL is printable ASCII (0x20–0x7E), with no control bytes and no bytes of 0x80 or above; without the NUL the strings are 15–45 bytes long. These are observations, not constraints.

**RENS 10751 header (Confirmed, code and data):** the header is 96 bytes. `0x3cfbb` loads the entry through `0x6affc` into `0x17529c` and the teardown `0x3d203` releases it. Nothing transforms the header at load except the IMFAT relocation of +0x58, the only relocation in the entry. The 26 32-bit occurrences of `0x17529c` in the image are the readers in the table, the record readers `0x2cf38` and `0x3fb1c`, the load, the release and the cheat function. No site copies the pointer elsewhere.

| Offset | Type | Reader and use | Evidence | Baseline |
|---|---|---|---|---|
| +0x00, +0x04, +0x08 | f32 × 3 | `0x3cfbb` pushes them as the stack arguments of the light constructor `0x7b074(3, …)`. It stores them as floats at light +0x34–+0x3C and multiplies each by a float constant. `0x7b5d0` attaches the light to the scene | Confirmed (`FMUL` on the stored floats) | Non-zero, finite |
| +0x0C, +0x10, +0x14 | f32 × 3 | The same for the light of type 0 (Likely ambient; type 3 Likely directional, as above) | Confirmed | Non-zero, finite |
| +0x18 | u8, the low byte of a 32-bit slot | `0x3d0b0` loads only this byte, masks it to 8 bits and passes it through `0x7b8a0` to the device method at vtable +0x34. It does so every time it rebuilds the viewport; its callers are `0x3d294`, `0x3ed26`, `0x3f09c` and `0x3f500`. The only writer, a cheat (below), stores the whole 32-bit slot +0x18–+0x1B | Confirmed (byte load; dword store) | Non-zero, below 256 |
| +0x19–+0x1B | 3 bytes of the same slot; storage type of their own Unconfirmed | No reader. Read as a u8, +0x18 leaves these three bytes unconverted: under the [field rules](../../plan/p3/03/spec.md#字段处理规则) (rule 6) a non-zero value there is unsupported | Confirmed (no read) | Zero |
| +0x1C | f32 | `0x3d0b0` widens it to f64 into `0x175210` when that is still zero, and `0x3e0cc` restores it when no counted visual remains | Confirmed (`FLD` float) | Non-zero |
| +0x20 | f32 | `0x3df90` and `0x3e0cc` count visuals of the kinds in `0x1C7C` and apply this value while any is present: `0x3df90` raises `0x175210` to it, then updates the device (`0x7bec0`) | Confirmed | Non-zero |
| +0x24 | f32 | As +0x20 for the kinds in `0xF8000` | Confirmed | Non-zero |
| +0x28, +0x38, +0x48 | u32 bit mask | The flashes `0x48d64`, `0x48dbc` and `0x48e14` copy it to `0x1a1b98`. The flash update `0x48e6c` ANDs it with a random value (`0x7453b`) at each new draw and passes the result to `0x48f14` | Confirmed (`AND`) | +0x28 and +0x38 non-zero; +0x48 zero |
| +0x2C, +0x3C, +0x4C | f32 | Copied to `0x1a1b94`. `0x48e6c` compares the elapsed float clock (`0x18641c` minus the start) with it (`FCOMP`) and ends the flash once the elapsed time exceeds it. Until then, (value − elapsed) / value scales the flash level | Confirmed | Non-zero |
| +0x30, +0x40, +0x50 | u32 | Copied to `0x1a1b90`. `0x48e6c` adds it to the tick clock `0x186414` to schedule the next random draw, and compares the clock with that sum unsigned (`JBE`) | Confirmed (integer add, unsigned compare) | Non-zero |
| +0x34, +0x44, +0x54 | i32 | Loaded with `FILD` into `0x1a1b8c` and multiplied by the remaining fraction. `FISTP` turns the result into the level passed to `0x48f14` | Confirmed (`FILD`) | Non-zero |
| +0x58 | u32 ptr | The record array ([effect geometry](#effect-geometry-data-p2-0614-research)); relocated, and equal to the header length 0x60 | Confirmed | — |
| +0x5C | i32 | Record count. `0x3fa30` and `0x3fad0` compare it signed (`JL`) | Confirmed | 10 records, filling the 376-byte entry exactly |

- **Unread positions:** +0x19–+0x1B are the only bytes of +0x00–+0x5F that no code reads.
- **Runtime write:** the function of row 27 of the typed cheat table `0x174ee8` (`0x3e278`, through the pointer at `0x175178`) stores a 32-bit 0 or 3 at +0x18. It then rebuilds the viewport through `0x3f09c` → `0x3d0b0`. Like row 26 ([nebula backgrounds](#data-loaded-by-the-loop-p3-0110)), the row works only after the table's master toggle. This is a run-time change, not a load transform, so the stored value is the one the game starts with.
- **Zero in the baseline:** +0x48 (typed above) and +0x19–+0x1B (unread).
- **Floats:** every f32 field is finite.
- **Meanings:** they are P3-12's. The light types and the distance thresholds remain Likely as stated above.
- **Screen flash in captures (Likely, P3-03/21):** two local captures taken during a flash, `srangers_044.png` and `srangers_120.png`, show palettes in which each colour is a DATA entry with one constant added to each 6-bit component and clamped at 63; the constant was derived from the background, and in `srangers_044.png` all 76 colours of the examined area fit one constant. This is consistent with a flash level (`0x48f14`, whose palette writes were not traced) added uniformly to the whole palette. Evidence: two captures only; comparison data in ignored `local/research/p3-03/local-check/out/appearance/`.

Evidence (ignored): `local/research/p3-03/comm-hud-text/`. It holds `ghidra_scripts/CommProbe.java` and `probe.sh` with the outputs `out/d1`, `out/d2`, `out/w1`, `out/x1`–`out/x6`, `out/x9`, `out/x10` and `out/x16`, and `structure.ts` and `extra.ts` with `out/structure.json` and `out/extra.json`.

### HUD, map and communications text from the EXE (P3-03/24)

Research of P3-03 [subtask 24](../../plan/p3/03/subtasks/24-hud-exe-text-research.md), 2026-10-09: a bounded, read-only static trace on a private copy of the Ghidra project (`-noanalysis -readOnly`), plus a probe through the verified source chain and the shared LE reader that prints only verdicts, lengths and byte-class counts. No text is reproduced here. Dispositions are in the [P3-01/10 handoff record](../../plan/p3/01/subtasks/10-data-closure.md#完成证据).

**Coverage (Confirmed method):**

- **Drawers:** glyphs reach the screen only through `0x59fc8`, which draws them inline from a font record. Font records are built only by `0x5acac`, which is called at `0x33ed6` (the OPTIONS screen font `0x186924`) and at `0x496f1` (the three CCKD fonts, handed out only by `0x49a58`; [hud §1.1](./hud.md#11-glyph-layout-and-character-maps-likely)). Raw scans find 52 calls of `0x59f90`, which measures a string and calls `0x59fc8`, and 17 calls of `0x59fc8`, all direct. Every call's string argument was traced back to its source.
- **Message line:** instrument type 8 draws the queue `0x175f08`, which only `0x4e9e8` fills. It has 11 callers: the seven sites of [flight message strings](#flight-message-strings-and-the-rens-header-p3-0304), `0x3cb30`, `0x4e3fd`, `0x4e461` and `0x68ff9` (below).
- **Formatting:** `0x74a3f` takes a buffer, a format and values, calls the formatter `0x8fe92` and ends the result with NUL (Likely the C library's `sprintf`). `0x74b67` writes an integer's decimal digits (Likely `itoa`). Each formatted buffer is drawn by the sites below.
- **Object names (+0x15C):** the target display, the target box and the map draw them. Their only writers are the mission build's name assignment `0x67d44` (CINF craft record +0x04, [craft §3.5](./craft.md#35-craft-record-and-missile-body-record-236-bytes), or SCEN names, [scenario](./scenario.md)), the allocator's clear (`0x521ff`) and the map marker builder `0x3cb80` (below). Of the 32-bit values 0x15C in the game code, the remaining hits belong to other structures: a pilot record (`0x3acb7`, `0x3aec2`) and an AI state (`0x63c82`, `0x63cda`).
- **References:** for every literal below, the 32-bit occurrences of its address in the image are exactly the listed sites; for the Warp page titles, they are the parameter-block pointers. The regions of the drawn-in-mission literals and of the LO, F2, cheat, wave and base-interior literals (81 in all; not the menu pages' or the delivered `0x171e58`) lie in file-backed pages of object 4, start 4-byte aligned, end at their only NUL and contain no fixup: the shared reader accepted each exact region.
- **Limits:** static analysis only; no baseline run. Each instrument below is drawn on every frame of its view (Confirmed). Formatted values are named only by their code source.

**Text rules (Confirmed):** `0x59fc8` draws every byte as its glyph, so no byte acts as a control code. A literal that the code passes to `0x74a3f` is a format string; its conversions are listed, and `%%` yields one `%`. The other literals are drawn verbatim; `0x171e8c` holds one `%` byte, drawn as its glyph. In every region below, each byte before the NUL is printable ASCII (0x20–0x7E), except `0x171ec8` and `0x171ecc` (one control byte each, base interior) and the delivered `0x171e58` (one control byte).

**On the selected mission's view paths.** These are instruments of CCKD 10103 slot 0 (forward cockpit, F1) and slot 2 (map) ([cockpit](./cockpit.md#group-directory-confirmed-structure-on-all-three-entries)), plus the flight-view overlays; all are drawn in the selected mission. Regions are given as locators; the length includes the NUL. **Reachability** of each literal in the selected mission is Confirmed when the stated condition needs only the view, a target or the player's own input (key and map commands that the handlers accept). Otherwise the row ends with (Likely) or (Unconfirmed): the condition then depends on rules, AI behaviour or input not traced here.

*Target display* (instrument type 7, `0x42d80`). The formatted lines go to the buffers `0x19b20e`, `0x19b222`, `0x19b218` and `0x19b204` and are drawn at `0x43da6`–`0x43e17` in HI. The target's name (+0x15C) follows at `0x43e47`.

| Address | Region | Conversions | Site | When drawn |
|---|---|---|---|---|
| `0x171a34` | `le/4/0x1a34/7` | — | Copied to `0x19b1e4` at `0x42e1d`, drawn at `0x43079` for 20 frames | The target's +0xCC is 1, which the Warp start `0x2be00` sets on the warping object (also `0x214e7`, `0x2f7d2`); the display then drops the target (`0x528bc`). Needs a targeted object to warp (Unconfirmed) |
| `0x171a44` | `le/4/0x1a44/10` | — | `0x431c8` | HI, while there is no target |
| `0x171a50` | `le/4/0x1a50/6` | `%.0f` | `0x433cf`, `0x43a65` | Distance from the player to the target, below the `f32` at `0x171a8f` |
| `0x171a58` | `le/4/0x1a58/7` | `%.0f` | `0x433cf`, `0x43a65` | Otherwise: the distance times the `f64` at `0x171a93` |
| `0x171a60` | `le/4/0x1a60/8` | `%.0f` | `0x436e3` | The `f32` at +0x08 of the block at target +0x08, when that block exists |
| `0x171a68` | `le/4/0x1a68/7` | `%.0f`, `%%` | `0x437ca` | Target +0x2C over +0x5C of its craft record (object +0x1C), times the `f64` at `0x171ab3` |
| `0x171a70` | `le/4/0x1a70/7` | `%.0f` | `0x438a8` | The `f32` at +0x08 of that craft record, scaled by `0x171a93` twice when the once-scaled value exceeds the `f32` at `0x171abf` |
| `0x171a78` | `le/4/0x1a78/6` | `%.0f` | `0x438ee` | Otherwise, scaled once |
| `0x171a80` | `le/4/0x1a80/5` | none | `0x43a77` | Target of kind `0x2000000` (the map marker): these three take the places of `0x171a60`, `0x171a68` and `0x171a70`/`0x171a78`. Needs the marker as the target (Likely) |
| `0x171a88` | `le/4/0x1a88/4` | `%%` | `0x43a89` | As above |
| `0x171a8c` | `le/4/0x1a8c/3` | none | `0x43a9b` | As above |

*Bar gauges* (instrument types 0–3; the helpers `0x41680` and `0x417a4` draw the label the caller passes, at `0x41776`, `0x41969` or `0x41b79`):

| Address | Region | Instrument | Pushed at |
|---|---|---|---|
| `0x1719bc` | `le/4/0x19bc/2` | Type 0, `0x4117c` | `0x41201`, `0x41219` |
| `0x1719cc` | `le/4/0x19cc/2` | Type 1, `0x41238` | `0x412e4`, `0x412fc` |
| `0x1719dc` | `le/4/0x19dc/2` | Type 2, `0x4131c` | `0x4144d`, `0x41466` |
| `0x1719f4` | `le/4/0x19f4/2` | Type 3, `0x41484` | `0x41599`, `0x415b2` |

*Flight-view overlays* (`0x45de0`, called by the frame routine `0x3ee58`). They are drawn in view modes 0xC (F1) and 0xD (F2), for which `0x459a0` sets `0x19b898` to 1. `0x459a0` sets it to 2 for mode 1, but the frame routine does not call `0x45de0` during a Warp ([cameras](#automatic-views-and-cameras-p3-0109)), and the cursor views leave it at 0. The overlays are skipped while the player's subsystem slot 9 is in state 2, and at random while it is in state 1.

| Address | Region | Conversions | Site | When drawn |
|---|---|---|---|---|
| `0x171c30` | `le/4/0x1c30/13` | — | `0x46b78` (four sites) | Blinks for a few steps of 0x26 ticks after the autopilot flag `0x174b24` changes. `0x27ee4` sets that flag and installs built-in AI record 0 on the player ([ai](./ai.md)); the flight key handler toggles it at `0x26eff`, and `0x2626c` calls it for a pending command |
| `0x171c40` | `le/4/0x1c40/14` | — | `0x46d38` (four sites) | Blinks while the step counter `0x174b28` runs and the autopilot is off. The speed-assist toggle starts it at `0x269d4`, and so does `0x27f68` at `0x27ff0` and `0x280aa` (a loss of the target after a match, and a match with a large speed difference; [speed assist](#throttle-maximum-speed-and-speed-matching-p3-0603)) |
| `0x171c60` | `le/4/0x1c60/15` | — | `0x47e50` (`0x47f3a`) | Blinks every 8 ticks while `0x2e080` returns 0 for the player, that is, while the byte at +0xF4 +0x24 of the player object is 4 (Likely) |
| `0x171c70` | `le/4/0x1c70/6` | `%d` | `0x48055`, `0x48135` | Two integer readouts: one from the player's block (+0x08 → +0x08), one relative to the target |
| `0x171c78` | `le/4/0x1c78/5` | `%d`, `%%` | `0x48083` | A percentage |
| `0x171c80` | `le/4/0x1c80/3` | — | Copied into the last two readout buffers | No target, or a distance above 10,000 |
| `0x171c84` | `le/4/0x1c84/4` | `%d` | `0x481bf` | The integer distance up to 10,000 |
| `0x170fc4` | `le/4/0xfc4/5` | — | Returned by `0x2dcf0`, drawn at `0x47dfc` | No weapon in the slot; otherwise the name is CINF gun or missile record +0x04 ([craft §3.3](./craft.md#33-gun-record-48-bytes)). Needs an empty weapon slot (Unconfirmed) |
| `0x171860` | `le/4/0x1860/10` | — | Copied to the new object's +0x15C by `0x3cb80` | The name of the map/Warp marker (kind `0x2000000`) that the first left click in the main map creates ([strategic map projection](#strategic-map-projection)). It is drawn as the target's name (`0x43e47`, `0x47abd`) while the marker is the target (Likely: the target display has a branch for that kind) |

The four readout buffers (`0x19ba04`, `0x19ba0c`, `0x19ba14`, `0x19ba1c`) are refreshed every 16 ticks and drawn at `0x48272`, `0x48292`, `0x482ce` and `0x482ee`. The target box shows up to 16 bytes of the target's name (`0x47abd`). The ammunition count beside the weapon name (`0x483e4`, drawn at `0x47e42`) comes from the 70-pointer table `0x175b38` for counts below 70 and from `0x74b67` otherwise. Pointer i of that table addresses the decimal digits of i (local check, all 70 entries), so the count is code-drawn digits.

*Strategic map* (instrument type 10, `0x49f8c`; view mode 8, CCKD 10103 slot 2):

| Address | Region | Conversions | Site | When drawn |
|---|---|---|---|---|
| `0x171d18` | `le/4/0x1d18/12` | — | `0x4a76b` | Every map frame, at the top left of the main map |
| `0x171d10` | `le/4/0x1d10/8` | `%d`, `%%` | `0x4a43f` → `0x4a507`; `0x4a5f0` → `0x4a664` | Beside the marker and the cursor: a value computed through the Warp cost routine `0x30d2c` (U-026), at least 1, coloured by thresholds 100 and 66 |
| `0x171d24` | `le/4/0x1d24/5` | none | `0x4a826` → `0x4a8a5` | Cursor readout when `0x4c3ec` returns −1 |
| `0x171d2c` | `le/4/0x1d2c/8` | `%.0f` | `0x4a84f` → `0x4a8a5` | Cursor readout otherwise |
| `0x171d44` | `le/4/0x1d44/3` | `%d` | `0x4ba60` (in `0x4b98c`), drawn at `0x4a9e3` | Per-unit labels while the map flag `0x18649c` is 1. The map-state set-up `0x2b814` clears it at `0x2b8ab`, every map opening clears it at `0x49e41`, and the right mouse button in the main map toggles it at `0x2bc06` (Confirmed, code, P3-05/03; [map mouse input](#map-mouse-input-p3-0503)) |

The information window (`0x4ba80`; [hud](./hud.md#sources-of-the-unidentified-elements-p2-1227)) draws its lines at `0x4bf7c` and `0x4c2e5`. For each unit in the zoom window's range whose kind is in `0x6c87f` and is not `0x4000`, it formats a kind word with no argument, appends the name through `0x171db4`, and writes a line with three position components. It counts the units of the other listed kinds and writes one line per kind with a count. In the selected mission, SCEN 3019's records have kinds 1, 0x80, 0x100, 0x4000 and 0x20000, and the wingman roster has kind 2 ([selected-mission field inventory](./scenario.md#selected-mission-field-inventory-confirmed-structure); kinds read from the local P2-09 record table). So only the kind words of kinds 1, 2 and 0x20000 and the count lines of kinds 0x80, 0x100 and 0x4000 can appear there; the others need kinds the mission does not declare:

- **Kind words** (no conversion; `0x4bbf3`–`0x4bce6`): kind 1 `0x171d50` (`le/4/0x1d50/9`); 2 `0x171d74` (`le/4/0x1d74/7`); 4 `0x171d94` (`le/4/0x1d94/9`); 8 `0x171da0` (`le/4/0x1da0/8`); 0x10 `0x171da8` (`le/4/0x1da8/10`); 0x20 `0x171d88` (`le/4/0x1d88/9`); 0x40 and 0x800 `0x171d7c` (`le/4/0x1d7c/9`); 0x8000 `0x171d5c` (`le/4/0x1d5c/7`); 0x20000 `0x171d64` (`le/4/0x1d64/8`); 0x40000 `0x171d6c` (`le/4/0x1d6c/8`).
- **Name and position:** `0x171db4` (`le/4/0x1db4/3`, `%s` with the unit's +0x15C, `0x4bd1c`); `0x171db8` (`le/4/0x1db8/8`), `0x171dc0` (`le/4/0x1dc0/7`) and `0x171dc8` (`le/4/0x1dc8/6`), one `%.0f` each (`0x4bd90`, `0x4bdcf`, `0x4be2f`).
- **Count lines** (one `%d` each; `0x4bfea`–`0x4c292`): kind 0x80 `0x171dd0` (`le/4/0x1dd0/10`); 0x100 `0x171ddc` (`le/4/0x1ddc/12`); 0x200 `0x171de8` (`le/4/0x1de8/11`); 0x400 `0x171df4` (`le/4/0x1df4/12`); 0x80000 `0x171e00` (`le/4/0x1e00/12`); 0x2000 `0x171e0c` (`le/4/0x1e0c/9`); 0x4000 `0x171e18` (`le/4/0x1e18/12`); 0x10000 `0x171e24` (`le/4/0x1e24/10`); 0x1000 `0x171e30` (`le/4/0x1e30/11`).

The map labels (`0x4af78`) are the units' names (+0x15C) for kinds in `0x6887f`; they use no literal.

*Left display* (instrument type 6, `0x4ce30`):

| Address | Region | Site | When drawn |
|---|---|---|---|
| `0x171e60`, `0x171e64`, `0x171e68` | `le/4/0x1e60/2`, `le/4/0x1e64/2`, `le/4/0x1e68/2` | Energy page `0x4d800` → `0x4d6f0` (`0x4d7f1`) | Labels of the page's three bars |
| `0x171e6c` | `le/4/0x1e6c/15` | Communications panel `0x4da28` (`0x4db3c`) | HI, when the panel's argument is 0 |
| `0x170f98` | `le/4/0xf98/3` | Copied by `0x2c9d0` (`0x2caaa`) into each object-list entry, between the generated key and the object's name; drawn by the panel (`0x4dbec`) | Communications object lists ([comm](./comm.md)) |
| `0x171e44` | `le/4/0x1e44/9` | Warp page `0x4dcec` (`0x4df2a`), through the pointer at +0x68 of the HI parameter block `0x175d80` (at `0x175de8`) | Warp page title |
| `0x171e7c`, `0x171e84`, `0x171e8c` | `le/4/0x1e7c/6`, `le/4/0x1e84/6`, `le/4/0x1e8c/11` | `0x4e018` (`0x4e1a8`), called at `0x4df6a`, `0x4dfaa` and `0x4dfed`; drawn verbatim | Labels of the Warp page's three bars |

The key of a communications entry at position p comes from the 36-byte table `0x174b40` (count `0x174b64`) when p < 36, and from `0x74b67` otherwise. `0x2c850` and `0x2c9d0` both do this; `0x2ce1c` does the same but has no caller. Byte i of the table is the i-th upper-case base-36 digit symbol (local check, all 36 bytes), so the keys are a code rule.

*Indicators* (instrument types 9 and 12 of slot 0):

| Address | Region | Site | When drawn |
|---|---|---|---|
| `0x171e98` | `le/4/0x1e98/5` | Type 9, `0x4eb3c` (`0x4ec81`) | Blinks while `0x175f14` is set. Every 0x40 or 0x80 ticks, `0x4edf4` sets it when `0x4f000` finds a missile (kind `0x100000`, +0x02 = 1, +0x03 ≥ 7) whose +0x8C is the player, while the player's subsystem slot 0xC is in state 0 or 1. Needs an enemy missile aimed at the player (Unconfirmed) |
| `0x171ea0` | `le/4/0x1ea0/5` | Type 9 (`0x4ed45`) | Blinks while `0x175f10` is set: `0x4ef9c` finds an object of kinds `0x780` whose +0x8C is the player and whose byte at +0xF4 +0x24 is 3 or 4, while slot 0xC is in state 0. The selected mission's enemy kinds 0x80 and 0x100 are in that mask (Likely) |
| `0x171ea8` | `le/4/0x1ea8/5` | Type 12, `0x4f2a0` (`0x4f352`, `0x4f3d8`) | While `0x175f38` is set: `0x4f3e4` sets it when object +0xC8 is 0 or when 64 times the craft record's +0xA4 (the Warp interval, [craft §3.5](./craft.md#35-craft-record-and-missile-body-record-236-bytes)) has passed since +0xC8. `0x4f3e4` does this only while `0x33504` reports the state byte `0x186882` as 1 (Likely) |

**Observed values (Confirmed, local reader, P3-03/24–26):** the 64 regions on the view paths above total 467 bytes with their NULs (403 without); the longest is 15 bytes with its NUL. 39 are format strings (25 with value conversions, 14 without; 4 contain `%%`) and 25 are drawn verbatim. They are imported as `data/hud/text` ([P3-03/26](../../plan/p3/03/subtasks/26-hud-text-assembly.md)).

**Not drawn in the selected mission (Confirmed):**

- **LO only:** `0x171a3c` (`le/4/0x1a3c/8`), the target display without a target. `0x171e50` (`le/4/0x1e50/5`), the Warp page title through the LO block `0x175e04` (+0x68, at `0x175e6c`). The slice runs HI.
- **F2 only:** `0x171a0c` (`le/4/0x1a0c/2`), the label of bar type 4 (`0x415d0`). Type 4 occurs only in slot 1 (layout 5, the F2 view) of CCKD 10101 and 10103 (local count of instrument types per slot).
- **Typed cheats** ([mission failure](#mission-failure-player-loss-and-rescue-p3-0105)):
  - The information-window header `0x171d48` (`le/4/0x1d48/7`) and the AI-target labels `0x171d3c` (`le/4/0x1d3c/5`, `%s`, drawn at `0x4b354`) depend on `0x174edc`, the flag of cheat row 20 (pointer at `0x1750d8`).
  - `0x3c970` posts each matched row's own text, or formats it with `0x171858` (`le/4/0x1858/3`) or `0x17185c` (`le/4/0x185c/4`), through `0x4e9e8` (`0x3cb30`).
  - The frame counter `0x3f474` (digits through `0x74b67`) depends on `0x174a80`, the flag of row 1 (pointer at `0x174f10`).
- **Wave mode:** `0x68f4c` queues `0x1725ec` (`le/4/0x25ec/19`) at `0x68ff9`. This is the wave mode of [difficulty path 9](./scenario.md#difficulty-readers-p3-01), which SCEN 3019 does not use.
- **Base interior** (view mode 6; the frame routine calls `0x4f524` and then `0x4f550` at `0x3eee4`): besides TABL 10165 texts, `0x4f550` draws `0x171eb0`, `0x171eb8` and `0x171ec0` (5 bytes each), `0x171ec8` (2 bytes, two sites), `0x171ecc` (2), `0x171ed0` (22; `%d`, `%%`), `0x171ee8` (5; `%15s` with the weapon name from `0x2dcf0`), `0x171ef0` (5; `%d`) and `0x171ef8` (17).
- **Menu pages:** `0x33e8c` → `0x35158` → `0x37438` draw only with the OPTIONS font (8 drawer calls). The literals they reference are `0x171204`, `0x171208`, `0x171210`, `0x17121c`, `0x17122c`, `0x171234` and `0x1712a0`.

**Already delivered:** the status display's lower line formats a subsystem's name and state word with the EXE format `0x171e58` (`le/4/0x1e58/6`, two `%s`; formatted at `0x4d4e3` and drawn through `0x4f108`), which is converted with DIAG 10489 into `data/hud/status-display/messages` ([hud](./hud.md#diag-10489-confirmed-structure-p2-07-revision)).

**No EXE literal:** the sub-mode labels (TABL 10399); the communications menus (COMM TABL, [comm](./comm.md)); the status display's other text (DIAG 10489); object and weapon names; and the message-line text that `0x4e368` posts from a streamed entry. `0x4e308` requests that entry through `0x6b998` with the ID of a queued message, and the entry's first word points to the text. It runs only while `0x1863d8` is 0 (Likely the communications-face stream). Outside the drawers, `0x49e00` passes `0x171cc0` and `0x171ce8` to `0x74270` only when a map TABL fails to load.

Evidence (ignored): `local/research/p3-03/hud-text/`. It holds `ghidra_scripts/HudTextProbe.java` and `probe.sh` with the outputs `out/a1`, `out/a2`, `out/d1`–`out/d9`, `out/e1`–`out/e19`, `out/f1`–`out/f7` and `out/s1`–`out/s3`, and `instrument-types.ts` and `regions.ts` with `out/instrument-types.json` and `out/regions.json` (instrument types, verdicts, lengths and byte-class counts only). Ghidra ran on a private copy of the project; functions created in memory were discarded.

### Strategic map projection
**Confirmed (map-to-world conversion and Warp marker):** `0x2b9bc` classifies a mouse point against three screen rectangles. Inside the main map rectangle (origin and size at `0x186444`–`0x186450`) it converts the point with `0x4c4c0`, stores it as the cursor's world point and lets `0x2bc30` set the zoom-window bounds around it, clamped to the world rectangle of `0x3a41c`. While the left button is down (a level sampled at each map read, [map mouse input](#map-mouse-input-p3-0503)) it also stores the point as the target: `0x4c310` finds the nearest map icon, and `0x2bd74` replaces the target's z with that icon's stored value (0 when none is hit) while a player-state field is set. It then either creates the runtime kind-25 map/Warp marker at the target through `0x3cb80` or moves the existing marker to it. The vertical component therefore comes from runtime state, not mission data. `0x4c4c0` computes world x and y as the world rectangle's minimum corner plus the point's offset from the map origin times a per-axis world-per-pixel factor (`0x18646c`, `0x186470`), and sets z to 0. `0x4c310` picks the map icon nearest to a point within three pixels. Map icon labels are drawn by unanalysed code near `0x4afc0`–`0x4b360` from per-object screen coordinates relative to the same map origin.

**Confirmed (writer, units and world rectangle; P2-12 static resolution):** the factors' writer is `0x49e74`, inside the map module `0x49xxx`–`0x4cxxx`, which Ghidra had not made a function; earlier reference searches therefore missed it. The LE fixup table lists its stores to the two world-per-pixel factors at `0x49f78` and `0x49f7e`, and the only readers are in `0x4c4c0`. `0x49e74` writes the main map rectangle (`0x186444`–`0x186450`, int32; width and height are both derived from the vertical extent, so the map is square), the per-axis pixels-per-world factors (`0x186464`, `0x186468`, float32; used by the world-to-map path `0x4c524` and the zoom box) and the world-per-pixel factors (`0x18646c`, `0x186470`, float32, x87 extended reciprocals of the former). `0x3a41c` does not read a stored world rectangle: it computes int32 `{minX, minY, maxX, maxY}` from the world grid (sector counts, int16 at `0x186b38`/`0x186b3a`; grid scale, float32 at `0x186b34`; both written by `0x3a380` from the SCEN header), with the minimum the negation of the maximum. Before `0x3a380`, the mission builder `0x66c00` passes a runtime scale (an immediate at `0x66d3e`) to `0x68d2c`, which rescales the SCEN spatial fields. Units: the main map rectangle and origin are screen pixels; world coordinates, the world rectangle and the zoom bounds are runtime units (`scen-runtime` in the content model); the pixels-per-world factors are pixels per runtime unit and the world-per-pixel factors runtime units per pixel. The candidate's `StrategicMapFrame` is in reference units (`scen-reference`).

**Confirmed (orientation, extent, centre and scale; P2-12 runtime readout):** in the selected mission's map state, three user-coordinated debugger pauses at the left-click site `0x4c310` read every field above. Each run re-derived the CODE/DATA object bases for its own process (the bounded correlation method below), verified that every target page was readable, required stable repeated reads and verified the mission identity. At the actual storage precision the readings agree with the candidate `mapFrame` on all of the following:

- the runtime/reference unit ratio;
- the world rectangle, symmetric about the origin and covering the whole sector grid;
- the main map rectangle, equal to the square derived from the origin and vertical extent of the candidate's map instrument record (that CCKD 10103 is the source of the runtime rectangle was then Likely, since the live record pointer was not correlated; P3-05/03 confirmed it from the code chain and the shipped data, see [map mouse input](#map-mouse-input-p3-0503));
- orientation: map right = +x and map up = −y, since screen rows grow with world y;
- equal scale on both axes;
- the centre at the world origin, within float32 rounding;
- the bounds: the origin pixel maps exactly to the world minimum, and the zoom-window clamp reached all four world bounds.

The P2-09 first-mission screenshot check ([B-001](../behavior/B-001-strategic-map.md#地图框架与坐标轴高概率p2-09)) agrees. Field values are not recorded here.

**Likely (no Warp-specific static spatial data at destination selection):** the cursor-to-marker path uses the world rectangle, the map rectangle and runtime map-icon data; no Warp destination table, grid or range data was found on it. The Warp execution path (energy, travel, arrival, error) was not traced and remains U-026.

Evidence (P2-12): ignored `local/research/p2-12/map-frame/` (static field table, candidate expectation, harness `map-frame.py` and run `user-02/report.json`); the run used a hash-verified private copy of the installation and reaped its own emulator. Earlier evidence: ignored probe outputs `local/research/p2-09/probe-2.txt`–`probe-4.txt` (map references and the unanalysed label-drawing region) and decompiled exports in `local/research/all.c`; the screenshot comparison used `local/StarRang/captures/srangers_059.png` and the selected mission's spawn rectangles from `pointer-targets-3019.json`, checking only which half of the map each marker class falls in.

#### Map mouse input (P3-05/03)

Static answers to Q-03 of the [P3-05 spec](../../plan/p3/05/spec.md#原版研究), read from native instructions; not observed at runtime. The input facts and the start-point rule are summarised in the [key map](../input/key-map.md#战略地图鼠标代码确认p3-0503).

**Confirmed (driver requests):** the game issues three INT 33h requests, all through the C library's `int386x` (`0x86fd7`): function 00h once at start-up (`0x65440`, result cached at `0x1766b0`; without a driver the start-up check at `0x22d83` in `0x22d00` exits through `0x23018(2)`), function 03h (`0x65498`; only the button bits `BX & 7` are kept, the driver's position is discarded) and function 0Bh (`0x65508`; motion counters, sign-extended from 16 bits). It never shows the driver cursor, sets the driver's position, range, ratio or sensitivity, installs an event handler or reads the press/release counts. Bounded search: a byte scan of the image finds three `MOV EAX,0x33` loads, and the only executable INT 33h is entry 0x33 of the library's `INT n; RET` stub table (`0x99d29`); another raw hit lies in data.

**Confirmed (the game's mouse block):** `0x653c0` updates a block of int32 fields {x, y, buttons, dx, dy, minimum x/y, maximum x/y} (the map's block is `0x1a98ec`; the page system's is `0x186a38`): function 03h sets the buttons, function 0Bh the deltas, x and y add the deltas and each axis is clamped to its inclusive bounds. One counted unit moves the point by one pixel of the layout's screen coordinates (the 640×480 HI screen); the game adds no scaling, acceleration or remainder, so the physical-to-count ratio is the driver's. `0x65350(block, left, top, width, height)` sets the bounds to the rectangle inclusive of its last row and column, the buttons and deltas to 0, and x and y to half the inclusive extent, (maximum − minimum) / 2 with signed truncation, measured from screen 0 rather than from the rectangle's origin.

**Confirmed (when the map reads it):** the map poll `0x27800`, called from `0x25f90` after the keyboard and device polls ([input polling](#input-polling-p3-0201)), reads only while `0x1747dc` is set (set by the dispatcher's map open, 0x400 sub-command 8; cleared by the map close, sub-command 9) and only when the sample is strictly greater than the controller's map due time (+8, 0 at controller creation), which it then sets to the sample + 6. Reads are therefore at least 8 clock units apart, and further apart when frames are long. In view mode 8 each read posts message 0x1000 with the point and the buttons (`0x2784c`), which the same frame's message loop passes to `0x2b9bc` (dispatcher `0x20d10` at `0x211e3`). A Warp started from the map (`w`, sub-command 0) leaves `0x1747dc` set, so the reads continue in flight, without posts, until the next map close.

**Confirmed (start point at every opening; that it lies inside the main map is Confirmed with the shipped layout data):** only view mode 8 uses layout 6, so every entry into the map switches the layout, and the layout select `0x49848` calls the map panel's activate callback `0x49e3c` each time. It clears `0x18649c`, recomputes the map rectangles (`0x49e74`) and re-initialises the block with `0x65350` and the main map rectangle. The start point is therefore the main map's centre shifted up and left by the map's origin, not the centre. With the layout-6 map record of CCKD 10103 (and the identical one of 10101) it lies inside the main map, in its upper-left quadrant. The frame that opens the map draws the cursor there before any read (mode 8: `0x3ee58` → `0x49b2c` → `0x49f8c`). The position is not kept across openings. Motion the driver counted since the latest function-0Bh read is added at the first read after an opening and then clamped. Other readers consume the counters: the page system (`0x33e8c` at `0x342f4`) and the reads that continue in flight after a Warp from the map. Only residual motion therefore reaches the next opening, such as motion in flight after a normal close, and motion during a `p` pause in the map (the pause loop does not read the mouse) is applied at the next read. DOSBox-X counts motion only while the host mouse is captured.

**Confirmed (clamp):** the block's bounds are the main map rectangle, so after each read the point lies in the main map and every map pixel is reachable; the info and zoom windows are not. The region flags of `0x2b9bc` for those windows, and the draw path for a point in no rectangle (`0x4a9fa`), are unreachable through the mouse after the first read.

**Confirmed (buttons; function 03h returns the current state, not a latch):** `0x2b9bc` stores the point (`0x1864a0`, `0x1864a2`) and its region (`0x1864a4`). In the main map it converts the point to the cursor's world point and sets the zoom bounds ([above](#strategic-map-projection)).

- **Left (bit 0):** a level sampled at each read. While it is down, every read makes the same read's cursor world point the target (the cursor point is stored first), takes the nearest icon and z as above, creates or moves the map/Warp marker and posts click sound 10463, whose own due time (`0x174b38`, the sample + 4) is shorter than the read interval, so the sound is posted at every such read. The effect therefore occurs at the first read after a press, repeats at every read while the button is held (the target follows the cursor), and nothing happens on release. A press and release that both fall between two reads are not seen.
- **Right (bit 1):** in the main map and while the debounce counter `0x1864c4` is not positive, it toggles `0x18649c` and sets the counter to 20. Every `0x2b9bc` call decrements a positive counter, and the function runs once per read and once per map frame (below), so the debounce counts calls, not time, and a held right button toggles repeatedly. `0x18649c` makes the map draw call `0x4b98c`, which writes a number next to each unit icon in the zoom window (string `0x171d44`, [HUD text](#hud-map-and-communications-text-from-the-exe-p3-0324)). It is cleared at every opening (`0x49e41`) and by the map-state set-up `0x2b814` (from the mission builder).
- **Middle and wheel:** the middle-button bit is read but never tested; the wheel byte is masked off.

**Confirmed (pointer drawing; the draw cadence checked against the shipped layout record):** the map draw `0x49f8c` runs on every map frame and first calls `0x2b9bc` with buttons 0 at the block's current point, so drawing never selects. At the cursor it draws the selection rectangle (`0x4c8b0`: centred on the cursor pixel, sized by the zoom extent, edges outside the main map omitted and the rest clamped), TABL 10461 record 26 with its top-left at the cursor point (at `0x4a36d`, through `0x4abe4`) and the energy-cost text beside it; the panel containing the cursor gets a different outline colour (at `0x4aa2d`, through `0x4b8fc`). No other pointer is drawn, and the driver's cursor stays hidden.

**Confirmed (main map rectangle source; code and data, in agreement with the P2-12 readout):** the HUD set-up registers panel type 0xA at `0x4960c` through `0x49db4` (activate `0x49e3c`, draw `0x49f8c`, no deactivate or per-frame callback) in the list `0x1a23a8` of 20-byte panel-type records {type, deactivate, activate, per-frame, draw}. On a slot change, `0x49848` calls the deactivate callback of each old-slot instrument record's type and the activate callback of each new-slot record's type, passing the record's inclusive rectangle at +4. Layout 6 is directory slot 2; in CCKD 10103 (and 10101) that slot holds two instrument records, of types 10 (the map) and 8. `0x49e74` takes the main map origin from the rectangle's top-left and the square's side from its vertical extent; the strip to the right holds the info window (upper half) and the zoom window (lower half). The instrument frame draw `0x49b2c` calls a record's draw callback when forced, when record +0x18 is 0, or when the sample minus record +0x1C exceeds +0x18, and then stores the sample in +0x1C: +0x18 is a redraw interval in clock units and +0x1C the last draw time (U-029).

**Handoffs:** P3-09 (rules): the integer cursor pixel → world conversion `0x4c4c0` (pixel offset × world per pixel, no half pixel), so the reachable range ends one pixel short of the world maximum; the zoom bounds `0x2bc30`; the nearest icon `0x4c310`; z `0x2bd74`; retargeting while the left button is held and the click-sound rate. P3-13 (appearance): the selection rectangle `0x4c8b0`, record 26 placement `0x4abe4`, the energy-cost text and its colour thresholds (`0x49f8c`), the panel outlines (`0x4aa2d`), the zoom-window labels `0x4b98c`, and no system pointer.

Evidence: ignored `local/research/p3-05/map/` (`summary.md`, `flow.md`, `addresses.md`, `runtime-plan.md`, `ghidra_scripts/PipeProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p26.txt`, and `map-record.ts`, one local read of the CCKD layout-6 instrument records). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions and `__watcall` created in memory were discarded. Callers and address references were checked by raw scans of relative calls and 32-bit values. The semantics of functions 03h and 0Bh were checked against the baseline DOSBox-X source (tag `dosbox-x-v2026.08.31`, `src/ints/mouse.cpp`: `INT33_Handler` cases 0x03 and 0x0B, `Mouse_Read_Motion_Data`, `Mouse_CursorMoved`, `Mouse_ButtonPressed`/`Mouse_ButtonReleased`): 03h returns the current button state, rewritten at once on host press and release; 0Bh returns and clears the counters, which accumulate only while the host mouse is captured.

### Bounded slot-1 interaction-kind evidence

**Confirmed (access and predicate logic):** `0x520d4` stores the allocated object's kind at runtime offset +4; `0x67938` supplies the SCEN record's kind to that allocator. The communications builder `0x2cbb4` tests this runtime kind, not SCEN +0x5C. Its special interaction-menu path requires membership in the kind mask `0x68000` (M2ID slots 15, 17 and 18), a successful `0x394c4` check and a successful `0x33390` check. `0x394c4` additionally requires the runtime visibility field, a distance check and valid player state; `0x33390` applies another game-state gate. Kind membership alone does not establish that an interaction is currently available. The interpretation as base interaction is **Likely**, supported by [B-004](../behavior/B-004-base-communications.md); the precise state/distance meanings remain open.

**Confirmed (bounded source coverage):** `node local/research/p2-01/slot1-role-gates.ts` checks all section-1 records, section-5 templates and actual member-array records of the three slot-1 SCEN entries, without excluding non-zero spawn times or conditional scheduling fields. The unique record counts are 9/10/10, of which 3/4/4 occur in member arrays; each scene has one record with a non-zero spawn-time field. In all three scenes, slot 17 is the only referenced model slot admitted by the base-kind predicate. These are record counts, not live-craft counts or proof that every scheduled object arrives.

| M2ID slot | Confirmed structural result across all three slot-1 scenes | Role qualification limit |
|---|---|---|
| 0 | Referenced; outside the base-kind predicate | Player-kind handling remains as recorded in [scenario](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) |
| 7, 8 | Both referenced, including complete member/timing coverage; outside that predicate | **Unconfirmed** enemy classification from this analysis; non-base does not imply enemy |
| 14 | Referenced; outside that predicate | Model comparison is recorded in [mesh](./mesh.md#3-comparison-with-the-original-partial); not a faction proof |
| 17 | Referenced; admitted by that predicate | **Likely** base-interaction role; availability still depends on runtime gates |

**Confirmed (direct-reference count), Unconfirmed (additional model identities):** address-specific references to allocator `0x520d4` identify nine direct call sites in nine functions; eight are outside SCEN instantiation `0x67938`. A raw byte scan (P2-12/30) finds a tenth, `0x25539` in the fragment constructor `0x25500`, which nothing reaches ([fragment producers](#effect-presentation-sources)). This proves that a SCEN-only creation trace is not exhaustive, but does not prove that these other paths introduce a new model, or identify any as rescue/weapon/effect creation. Follow their kind/model inputs before claiming an implicit-model closure; a bounded next trace can start at callers `0x38780` and `0x3cb80`. Direct-reference enumeration alone does not exclude indirect calls; a later typed-reference check finds no data or pointer reference to the allocator (see [player target modes](#player-target-modes-and-enemy-classification)).

Evidence remains in ignored `local/research/p2-01/`: `role-runtime.c/.log` (five exact addresses), `role-gates.c/.log` (three exact addresses), `runtime-allocator-references.log` (one exact reference target), and `slot1-role-gates.ts/.json`. Ghidra used `-noanalysis -readOnly` and discarded in-memory changes. The report explicitly retains `complete: false`, `rankingAvailable: false`, `factionClassificationComplete: false` and `implicitModelCoverageComplete: false`; this milestone does not establish full enemy cardinality, implicit resource closure or S-02 ordering.

### Slot-1 hostility qualification boundary

**Confirmed (bounded target-path evidence, not faction):** one read-only, no-analysis export covers exactly `0x68050`, `0x688c4`, `0x68c98`, `0x68018` and `0x5261c`, with 647 native instructions in their complete bodies. The compiler default and in-memory overrides are `__watcall`. At `0x680c7`, the AI filter helper's returned EAX value is retained in ESI and supplied back in EAX to `0x5261c` at `0x68112`; the claim uses native register flow, not inferred C parameters. Two later pairwise kind-test windows start at `0x681e4` and `0x682a9`: they test runtime kind offset +4 against `0x6c87f` and compare another object's kind against `0x6c07f` or `0x93f80`. These are candidate-selection predicates, not evidence of a persistent faction field or an authoritative player-relative hostility decision.

**Confirmed (all slot-1 source records compared):** `slot1-hostility-boundary.ts` checks the previously enumerated section-1 records, section-5 templates and actual members against the unchanged version-2 profiles and local SCEN records. Counts remain 9/10/10, member counts 3/4/4, with one non-zero spawn-time record per scene. In each scene, referenced slots 0/14/17 belong to the `0x6c87f` comparison cohort and slots 7/8 do not; zero-kind templates are not model identities. The report records descriptor presence and raw fallback target membership separately. Neither is treated as the effective target set: template inheritance and active descriptor state remain relevant. No timing or conditional record is discarded.

**Superseded (actual enemy cardinality):** this AI candidate-selection path alone does not establish hostility relative to the player. The player-relative consumer was later found in the player's own target modes; the resulting cardinality and its input invariant are recorded in [player target modes](#player-target-modes-and-enemy-classification). Kind cohorts, non-base status, AI target masks, debris eligibility and [kill statistics](../behavior/B-003-campaign-flow.md#第一关统计样本已确认静态读数) remain insufficient on their own.

Evidence: ignored `local/research/p2-01/hostility-target-path.c`, `hostility-target-native.log`, `hostility-target-analysis.log` and `slot1-hostility-boundary.ts/.json`. That report preserves its own unknown roles/cardinality as null and completion/classification/ranking as false; the missing player-relative binding it names is supplied by the target-mode evidence below, without a wider AI/formula search.

### Bounded presentation-consumer follow-up

**Confirmed (exact caller/consumer binding, not IFF meaning):** a distinct follow-up starts from the already recorded direct reference to `0x5261c` at `0x296ee`, in `0x29670`. Its immediate caller is `0x221fc` at `0x22292`. Complete native exports cover only `0x29670`, `0x694f0` and `0x29bf4`, totalling 380 instructions, with the default and in-memory convention set to `__watcall`. In this path, the iterator is followed by the gate call `0x29722` to `0x29bf4`, the difficulty-group getter call `0x2979f` to `0x694f0`, and the calls `0x297ba`/`0x297cc` to `0x2a5fc`. The two-instruction getter returns the integer difficulty group stored at global cell `0x176708`, which `0x29670` uses only as a collision-damage divisor ([difficulty readers](./scenario.md#difficulty-readers-p3-01), path 6); it is not a table pointer or a kind-to-faction classifier. Native call references and getter register flow, not inferred C signatures, establish these bindings.

**Likely (presentation role), Unconfirmed (player-relative IFF/attack meaning):** spatial accesses, the gate and table consumption make `0x29670` a concrete presentation-consumer candidate. The bounded `0x29bf4` gate does not contain the earlier kind-cohort masks; it must not be relabelled an enemy test. Neither this attempt nor the prior initialization trace establishes an authoritative foe-marking or attack-permission branch. Actual enemy-model cardinality remains **unknown** for all three slot-1 scenes; no input invariant is proved, so no faction classification is propagated to main records, templates or members. A kind-based decision would suffice if its consumer meaning were proved; recovering a persistent faction field is not a prerequisite.

**Superseded (runtime observation):** the slot-8 runtime observation proposed at this point is no longer needed for enemy cardinality. The [player target modes](#player-target-modes-and-enemy-classification) provide the player-relative classification and its input invariant statically. The presentation role of `0x29670` remains Likely and is not used as that proof.

Evidence: ignored `local/research/p2-01/hostility-consumer.c`, `hostility-consumer-native.log`, `hostility-consumer-analysis.log`, the corresponding `hostility-icon-*` and `hostility-selection-*` exports, and `slot1-iff-consumer-attempt.ts/.json`. New assertions check the three complete exports, five direct call bindings, the exact getter cell, prior record counts and an unchanged source-profile hash. The report retains unknown cardinality as null and classification/completion/ranking as false. This distinct bounded attempt stops at the identified consumer/observation blocker; it does not reopen the independent cache-provenance branch or establish a candidate selection.

### Player target modes and enemy classification

**Confirmed (player-relative classification):** the flight key handler `0x264a0` compares the key against ASCII `t` (`0x74` at `0x265fe`) and branches to `0x2703d`, which calls `0x2799c` with EDX = 0 and on success stores mode 0 at player-controller offset +0x198. The adjacent case calls the same helper with EDX = 1 and stores mode 1; it is `f` (`0x66`, native compare at `0x2661c`, P3-07/01). The `r` and `y` cases pass the stored mode to `0x27910` and `0x27884`, which cycle to the next nearer or farther candidate through `0x63954`/`0x63858`. In all three helpers mode 0 selects candidates through kind mask `0x93780` and mode 1 through `0x206c87e`. These keys match the README labels for enemy/friendly target mode and target cycling in the [key map](../input/key-map.md). `0x2799c` takes the nearest candidate through `0x63858`, not the one in front, and the player's callback also calls it at a fixed interval while the player has no target, in flight views (P3-06/05, [automatic target selection](#initial-flight-state-p3-0605)).

| Player target mode | Kind mask | M2ID slots |
|---|---|---|
| Enemy (mode 0) | `0x93780` | 7, 8, 9, 10, 12, 13, 16, 19 |
| Friendly (mode 1) | `0x206c87e` | 1–6, 11, 14, 15, 17, 18, plus runtime kind 25 (the map/Warp marker) |

Every M2ID slot with a model, except the player's own slot 0, belongs to exactly one mode; slots 20 and 21 are empty. Helper `0x27a04` targets an object in front from all twenty model kinds and selects mode 1 exactly when its runtime kind is in `0x6c87f` (the friendly set plus slot 0), otherwise mode 0. Its `0x75` (`u`) key case is Confirmed by the native compare at `0x26589` (P3-07/01). The selection rules, timing and target lifetime are in [player targeting](#player-targeting-and-radar-p3-0701).

**Confirmed (input invariant):** iterator `0x5261c` walks per-kind object lists rooted at `0x1b06e4`, indexed by the set bits of the supplied mask. Allocator `0x520d4` writes the requested kind to runtime +4 and links the new object into the list for that kind's bit. These two functions are the only code references to the list table. SCEN objects receive their record kind through `0x67938`. An object's player target-mode class is therefore fixed by its allocation kind; no separate per-record faction field participates.

Mode 0 is the player's hostile set, by three independent sources: the README key label; the [Practice observation](../behavior/B-002-practice-mode.md) that the observed non-player units there were hostile and no friendly unit was seen (all referenced Practice slots, 7, 8, 9, 10, 12 and 19, are mode 0); and the [campaign observation](../behavior/B-003-campaign-flow.md) of a friendly wingman and dockable bases, whose kinds are mode 1.

**Confirmed (exhaustive enemy-mode allocation sources):** only objects linked into the per-kind lists can be selected in either mode, and only `0x520d4` links them. All nine references to `0x520d4` are direct calls; there is no data or pointer reference through which it could be called indirectly. (P2-12/30's raw scan adds a tenth direct call in the unreachable fragment constructor `0x25500`, kind bit 24, which does not change this conclusion.) Eight call sites pass fixed kinds: slot 14, runtime kind 25, bits 22 and 24, and empty slots 20 and 21 ([inventory](#remaining-direct-allocator-input-inventory)). None is in `0x93780`. The ninth, `0x67938`, is reached only from spawn dispatch `0x67678`. The queue it serves has five insertion sites: three in `0x6721c`, and one each in `0x67018` and `0x695c0`. Whichever site queued an entry, `0x67678` resolves it to one of three record kinds: a current-SCEN section-1 record, a current-SCEN section-5 member record, or an SCCT wingman record. Enemy-mode objects can therefore originate only from the current scene's section-1 and section-5 records.

**Confirmed (slot-1 enemy cardinality):** all section-1, section-5 template and member records of the three first-campaign scenes reference slots 0, 7, 8, 14 and 17. Slots 7 and 8 (MODL 11063 and 10373) are enemy-mode; slots 14 and 17 (MODL 11399 and 10611) are friendly-mode; slot 0 is the player. The SCCT wingmen use kind 2 (slot 1, the player model). Each slot-1 scene therefore depends on exactly two enemy model types. Their section-5 attack-group members also carry default AI target kinds 15, 17 and 18, the base kinds, without a descriptor. The [statistics page](../behavior/B-003-campaign-flow.md#第一关统计样本已确认静态读数) has eight enemy-kill rows, matching the eight enemy-mode kinds, and two non-zero rows in the observed run. The row-to-kind mapping is not traced, so this is consistency evidence only.

Across all 51 non-zero campaign slots, slots 1 and 2 of each group have two distinct enemy-mode models. The other 45 have three to six (2: 6 slots, 3: 9, 4: 16, 5: 14, 6: 6).

Evidence: ignored `local/research/p2-01/side-mask-sites.log/.c`, `target-mode-consumers.c`, `kind-list-owners.c`, `target-key-sites.log`, `flight-key-handler.log`, `spawn-queue-and-stats.c`, `SideMaskSites.java`, `ReferenceTypes.java` and `candidate-selection.ts/.json`. A raw byte search for the side masks found 31 immediates of `0x93780` and 23 of `0x6c87f`. Read-only, no-analysis Ghidra mapped them to their functions and callers, and typed references bound the allocator, spawn dispatch and queue insertion sites; in-memory `__watcall` conventions were discarded. The flight handler export reached its 600-instruction cap, so the `t` binding was traced natively and the other key cases through the decompiled compare tree plus native case-block registers. `candidate-selection.ts` asserts the mode partition, the slot-1 cardinality and the counts above.

### Combat rules (P3-07)

Static answers to Q-01–Q-12 of the [P3-07 spec](../../plan/p3/07/spec.md#原版研究), read from native instructions by P3-07/01–07 (2026-10-10). Nothing here was observed at runtime. Notation: *clock* or *sample* is the per-frame mission-clock sample `0x186414` (u32, 1/64 s units); *step* is `0x186424` (f32 seconds); *rand* is one call of the C library `rand()` `0x7453b` (0–32767), the one generator that rules and presentation share; a *handle* is a list node, *obj* the object it names; *ps* is the player-state block `0x1b0638`; *mb* is an object's movement block (object +8); the pose rows at object +0x48, +0x54 and +0x60 are called rows 1–3 or R0–R2, row 3 (R2) being the forward axis; P is the position +0x6C–+0x74; *craft kinds* are mask `0xfffff` and *large kinds* mask `0xf9c7c` (4, 8, 0x10, 0x20, 0x40, 0x400, 0x800, 0x1000, 0x8000–0x80000). Labels such as W6 name the numbered parts below. P3-06 records the movement stage and its modes 0 and 3, the control setters, the maximum speed, the parked-object update's scheduling and world exit, and the area check; the parts below refer to them where they meet.

#### Player targeting and radar (P3-07/01)

Q-01, Q-02 and the targeting part of Q-11. Extends [player target modes](#player-target-modes-and-enemy-classification). Below, *controller* is the player object's +0x14 block (0x1C0 bytes) and *aux* is the movement block.

##### T1. Target state (Confirmed, code)

| State | Where | Writers |
|---|---|---|
| Player's target | Player object +0x8C: a counted node handle (`0x528bc` swaps it, releasing the old reference). Allocation `0x520d4` zeroes it (`0x52181`, slot+0x8C) and the release callback `0x523f4` drops it | T5 |
| Target mode | Controller +0x198: 0 enemy, 1 friendly. Zeroed when the controller is created (`0x26026`) | `t`/`f` (`0x2704e`/`0x27073`), `u` and the joystick target button through the pointer passed to `0x27a04` (`0x27a46`), automatic targeting (`0x26243`). Read only by the cycle helpers (`0x27086`, `0x2709a`, `0x2768c`); a whole-image scan for `+ 0x198]` in game code finds no other reader |
| Automatic-target due time | Controller +0x1A8 (zeroed at creation) | `0x26251` |
| Joystick target-button due time | Controller +0x1B0 (zeroed at creation) | `0x2767b` |
| Dispatcher message type 2 | Subject +0x08 = the player node (`0x5310c`), payload +0x1C = the chosen node (`0x53130`, counted) | Posted only by the four helpers below: a whole-image scan for an immediate store of type 2 into a message finds exactly `0x278f1`, `0x2797d`, `0x279e7`, `0x27a58` |

**Message 2 handler (`0x213fc`):** `0x528bc(subject, payload)` — the subject's +0x8C becomes the
payload without revalidation — then a presentation item of type 2 (`0x52cb4(2)`) with +0x08 =
0x2B4F, +0x0C = 0, +0x0E = 0 (Likely a sound request, P3-14). No other state changes.

##### T2. Selection helpers (Confirmed, code)

All four share the candidate filter of the walkers they call: an object of the mask (walk
`0x5261c`: kind bit ascending, then allocation order) with activity +2 = 1, state +3 ≥ 7
(unsigned byte, so 8 "projectile that has hit" also passes) and +0xCC ≠ 1. Neither the dead flag
+0xD8 nor the parked/destroyed history is tested; a destroyed object leaves candidacy only when
its state leaves 7/8 (explosion constructor: 4; destroyed parked object: 6). `0x52680` is the
validity test: non-null node whose object pointer is non-null.

- **Distance `0x637e4(a, b)`:** squared Euclidean distance between the objects' positions
  +0x6C/+0x70/+0x74, returned on the x87 stack (no square root). Numerics in T10.
- **Farther `0x63858(self, ref, mask, out)`:** reference distance d_ref = `0x637e4(self, ref)`
  stored as f32 when ref is valid, otherwise 0 and no reference handle. Eligible: candidate ≠ ref
  handle and d ≥ d_ref (the test `JC` skips only d < d_ref). Picks the smallest d (first candidate
  unconditionally, later ones only when strictly smaller), so ties keep the earliest in walk order.
  When `out` is non-null it receives √(best) (x87 `FSQRT`, stored through a double to f32) or 0.
- **Nearer `0x63954(self, ref, mask, out)`:** with a valid ref, eligible only when d < d_ref
  (strict); in every case d must be strictly greater than the running best, which starts at +0.0,
  so a candidate at distance 0 is never chosen. Picks the largest d, ties keep the earliest. Same
  `out` handling.
- **Forward `0x63a4c(self, mask, out)`:** copies self's rows +0x48/+0x54/+0x60 and position.
  For each candidate other than self (node compare), with the same activity/state/+0xCC filter,
  `0x56dc0` transforms the candidate position into self's frame: x = d·row1(+0x48),
  y = d·row2(+0x54), z = d·row3(+0x60), d = candidate − self. Eligible when z > 5.0 (f32
  `0x1724cc`) and x² + y² ≤ the candidate's craft record +0x14 (r², written at load, craft §4.4;
  object +0x1C is the record). Picks the smallest z (strict `<`, ties earliest). There is **no
  range limit**: the player's forward axis, from 5 units ahead, must pass within the candidate's
  bounding radius. The current target is not excluded.

| Entry | Mask | Helper calls | Success needs | On success |
|---|---|---|---|---|
| `0x2799c(player, m)` (`t` m=0, `f` m=1, automatic) | m=0 `0x93780`, m=1 `0x206c87e` | `0x63858(player, 0, mask, 0)`: nearest candidate, current target not excluded | Result valid and ≠ player +0x8C | Posts message 2; returns 1 |
| `0x27910(player, mode)` (`r`) | by controller mode | `0x63954(player, cur, mask, 0)` with cur = +0x8C if valid else 0; when that finds nothing, `0x63954(player, 0, mask, 0)`: wrap to the farthest | Result valid and ≠ cur | Posts message 2 |
| `0x27884(player, mode)` (`y`, joystick fallback) | by controller mode | `0x63858(player, cur, …)`; wrap: `0x63858(player, 0, …)`, the nearest | Result valid and ≠ cur | Posts message 2 |
| `0x27a04(player, &mode)` (`u`, joystick) | `0xfffff` (all 20 model kinds) | `0x63a4c(player, 0xfffff, 0)` | Result valid and ≠ +0x8C | Writes mode = 1 when the result's kind & `0x6c87f`, else 0, **then** posts message 2 |

- **Direction (`r`/`y`):** `r` = nearer (cycles inward, wraps from the nearest to the farthest),
  `y` = farther (cycles outward, wraps from the farthest to the nearest). With no valid current
  target, `r` selects the farthest and `y` the nearest candidate. Mapping to the spec's commands:
  `r` → `next` → nearer, `y` → `previous` → farther.
- **Comparison types and ties (Confirmed, code):** let d be the double-precision value
  `0x637e4` returns and d32 its f32 rounding. The reference is always stored as d32_ref
  (`0x6389b`, `0x63997`).
  - `0x63858` (farther): the lower bound compares the candidate's unrounded d with d32_ref
    (`0x638ed` `FST` keeps d on the stack, `0x638f1` `FCOMP`): eligible when d ≥ d32_ref. The
    minimum search compares d32 values (`0x63905`), strict `<`, so among equal d32 values the
    earliest in walk order wins.
  - `0x63954` (nearer): both bounds compare f32 values (`0x639ea` stores d32 before `0x639f2`):
    eligible when d32 < d32_ref and d32 > best (best starts at +0.0), strict both ways; equal d32
    values keep the earliest.
  - Consequences: `r` skips every candidate whose d32 equals d32_ref, including geometrically
    nearer ones that round to the same f32. `y` admits a candidate whose d32 equals d32_ref only
    when its unrounded d is not below d32_ref; a candidate at the same geometric distance as the
    reference is excluded when d32_ref rounded upward. Two candidates A and B with d32_A = d32_B and
    both d_A ≥ d32_B and d_B ≥ d32_A make `y` alternate between them without advancing; otherwise
    `y` moves past them. Ties need only equal f32 roundings, not symmetric placements;
    reachability in play was not measured.

##### T3. Entry points, contexts and timing (Confirmed, code)

- **Keys (`0x264a0`, the flight key context):** native compares on the translated key byte:
  `t` (0x74, `0x265fe`) → `0x2703d`; `f` (0x66, `0x2661c` `JBE`) → `0x2705f`; `r` (0x72,
  `0x265f4` `JBE`) → `0x27098`; `y` (0x79, `0x265c2` `JBE`) → `0x27084`; `u` (0x75, `0x26589`
  `JBE`) → `0x270ac`. Upper-case letters reach other cases (for example `T`, 0x54, posts dispatcher
  message 0x800 through `0x26843`; P3-05 traced it as the cheat-gated kill event, [key contexts](#key-reading-and-key-contexts-p3-0501-p3-0502)). `t`/`f` store the mode only when
  `0x2799c` returns 1; `r`/`y` never write the mode.
- **Before the compare chain** `0x264a0` offers the key to `0x27b44` (communications) and `0x27ab4`
  (left-display page 1 keys `S`/`s`/`G`/`g`, [D10](#d10-energy-levels-keys-ssgg--confirmed-code)); either consuming it ends the handling.
  `0x27b44` on left-display pages 2–4 matches the key case-insensitively (`0x754d9`) against the
  shown menu entries' key byte (`0x27e10`, [comm §4](./comm.md#4-text-rules-confirmed)).
  Object-list menus (`0x2c9d0`) give their k-th entry the k+1-th character of the 36-entry table
  `0x174b40`: the target letters first occur at positions 15 (`f`), 27 (`r`), 29 (`t`), 30 (`u`)
  and 34 (`y`), so an object list of at least 15 entries captures `f` (and so on). Data-keyed
  menus may also capture them (not checked against the shipped tables here).
- **Contexts that never reach `0x264a0`:** view modes 0–3 (Warp context `0x27360`), 6 (base
  `0x271e0`) and 8 (map `0x27118`); no game key at all while the player's dead flag is set or the
  player is not in state 7 (P3-02/01). One key per keyboard poll (P3-02/01).
- **Joystick target button (`0x2760c`, called by `0x274a4`):** when the sample is strictly greater
  than controller +0x1B0 and button bit 0x80 reads 0 (active low): +0x1B0 := sample + 0x40, then
  `0x27a04` (forward, mode through the pointer); only when that returns 0, `0x27884` (farther, by
  the current mode).
- **Automatic targeting** is recorded in [initial flight state](#initial-flight-state-p3-0605) (P3-06/05); P3-07/01 adds that the interval is 0x40 units (+0x1A8 := sample + 0x40 at every check, so successive checks are more than 0x40 apart), that the view-mode gate lets it run with the map open (mode 8), and that the invalid-target drop earlier in the same callback (`0x2611f`) lets the zero test see only a valid target as set.
- **Order inside one player update (`0x25f90`):** invalid-target drop → `0x2ddbc` → speed assist →
  keyboard poll (target keys) → device poll (joystick target button) → map cursor → message
  0x20000 → `0x2d578` channel 0 and 1 (fire) → automatic targeting.
- **Write timing:** candidates are evaluated immediately, in the update callback, on positions and
  poses as left by the previous pass's movement (`0x221fc` runs after the message loop). The mode
  (`t`, `f`, `u`, joystick, automatic) is written immediately; the target is written when this
  frame's dispatcher loop handles message 2. The player's callback runs first in the update walk,
  so its message-2 posts precede every other object's messages of that frame (they follow only
  messages posted earlier in the frame, by `0x3266c` or `0x25894`). Several message-2 posts in one frame are applied in posting order; the last wins
  (for example `r` with no target, then automatic targeting in the same callback: the automatic
  nearest-enemy choice is applied last and the mode becomes 0).
- **Interaction with firing:** `0x2d578` runs before the message loop, so it sees the old target;
  launch message 8 is posted after the target key's message 2, and the dispatcher's missile
  constructor `0x2b00c` (message 8, `0x213b9`) copies the shooter's +0x8C into the missile's +0x8C
  (`0x2b0c0`, when valid) — the *new* target ([W11](#w11-launch-message-8-and-the-two-constructors--confirmed-code), [H5](#h5-missiles--confirmed-code-unless-marked)).

##### T4. No-change conditions (Confirmed, code)

| Command | No candidate | Same as current | Not delivered |
|---|---|---|---|
| `t`/`f` | No object of the mode passes the filter | The nearest equals +0x8C | Context, comms capture, dead/not state 7 |
| `r`/`y` | No candidate at all (even after the wrap) | Only the current target qualifies (first search excludes it; the wrap does not) | Same |
| `u` | Nothing in front within its radius | The object in front is +0x8C | Same |

In every no-change case nothing is written, the mode included. `r`/`y` change nothing when the
mode's mask has no candidate even if other-mode objects exist. "Not delivered" cases produce no
call at all (input routing, P3-05/Runtime), not a rejection inside the helpers.

##### T5. Target lifetime: writers of the player's +0x8C

**Coverage (Confirmed, code):** a raw scan finds 28 direct calls of the setter `0x528bc`; with the
scan of stores to `+0x8C` in game code, every site is attributed below. For the non-AI sites the
subject is fixed by the code (Confirmed). The AI sites act on the subject of an AI block; the
player is such a subject only under the autopilot (T11), and their reachability from the
autopilot was checked for direct calls only, so the AI part of the list is not proven exhaustive
(Unconfirmed; P3-08). The non-player sites set the +0x8C of the object they construct or update
(explosion `0x23bf7`, missile `0x2b0c0`, fragment `0x251d6`, kind `0x400000` handler `0x242d1`,
callbacks `0x23a84` and `0x24cd9`, cleanup `0x2b5c4`, parked update `0x30117`); the AI sites are
`0x5c598`, `0x5c5ca`, `0x5c674`, `0x5c8fc`, `0x5d409`, `0x618ec`, `0x619b5`, `0x61bb5`, `0x61c0e`,
`0x626df`, `0x62725`, `0x63623`, `0x636f4`.

| Event | Where | Effect on the player's target |
|---|---|---|
| Message 2 | `0x213fc` | Set to the payload |
| Player update finds +0x8C non-zero and invalid | `0x26136`, state 7, dead flag clear | Cleared (0). Not done while dead or in other states |
| Target object parks (message 0x20, state 5, flags clear) | `0x210e2` | Cleared when player +0x8C equals the parked node; only the player's target is checked |
| Target object removed (message 0x20, state 6 or flags) | — | The removal itself does not touch it: the node becomes invalid. The right display clears it in the same frame's render when that instrument is drawn (T7); otherwise the player's next update in state 7 drops it |
| Player starts a Warp (dispatcher 0x400 sub-command 0 accepted by `0x2be00`) | `0x2beba` | Subject's own target cleared (with +0xCC := 1) |
| View mode becomes 6 (base) | `0x3104c` (`0x3108a`) | Cleared |
| Destruction view entered (0x11 sub-mode 8, `0x31094`) | `0x31160` | Cleared |
| Right display drawn with an invalid target, in view mode 6, or with a target whose +0xCC = 1 | `0x42e21` (render path, T7) | Cleared |
| Autopilot (flag `0x174b24`): AI step `0x5dcd4` → `0x62250` → `0x62578`/`0x62714` | `0x626df`, `0x62725` | Set or cleared directly, without message 2, when the AI mode byte is 2 or 4 (P3-08) |

- **Destroyed target:** nothing clears the player's target when the target is destroyed. It stays
  the target in state 4 (exploding, still moved, still a radar contact with the target box, still
  shown on the right display) until it is removed and the player's next update drops the invalid
  node, or until the player retargets (a state-4 target still serves as the cycle reference).
- **Target enters Warp/leaves:** +0xCC = 1 is set for non-player objects by the dispatcher's
  message 0x800000 handler (`0x214e7`, for an active subject accepted by `0x2fef8`, together with
  state 5; role not traced in P3-02) and by the world-exit test `0x2f314` (parked objects only);
  AI code `0x5c768` also stores a value there (not traced). Allocation zeroes it. For an active target, state 5 makes its next
  callback post message 0x20, so it parks (target cleared) or is removed (dropped) one frame
  later; the right display clears it earlier, in the same frame's render, when drawn.

##### T6. Radar (Confirmed, code unless noted)

- **Build cadence:** the type-5 instrument draw handler `0x401e8` (called by `0x49b2c` from the
  frame render `0x3ee58`) calls the registered handler `[0x193930]` = `0x402a0` (registered by
  `0x3ff90`, called from the display switch `0x3f158` and `0x3f500`). `0x402a0` needs a player
  node; in view mode 1 it builds nothing; otherwise, when `0x1752c4` < sample, it rebuilds the
  contact buffer with `0x40370` and sets `0x1752c4` := sample + 5; then it draws the buffer
  (`0x4017c`). The radar therefore exists only while the active cockpit layout has a type-5
  instrument, and is rebuilt at most every 6 clock units, in the render path.
- **Contact source:** `0x40370` iterates the presentation items of type 4 (`0x52d60`) and keeps
  those with sub-type byte +0x08 = 1. The only producer of type-4 sub-type-1 items is the camera
  pass `0x21584` (`0x215e8`, end of the dispatcher pass, after `0x30ef0`): it walks kinds
  `0x21fffff` (bits 0–20 and 25: every craft kind, missiles `0x100000` and the map/Warp marker
  `0x2000000`) and posts one item per object with activity +2 ≠ 0 (active, docked or 2) and state
  4 or ≥ 7, in walk order. (`0x21584` posts type-8 items for kinds `0x1600000` with the same
  filter.) A scan of all `0x52cb4` call sites shows the other type-4 producers write sub-types 0,
  2 or 3.
- **Contact filter:** item object valid, aux +0x08 non-null, not the player (handle compare). No
  range, sector or visibility test: every such object is a contact. Gun projectiles (`0x200000`),
  explosions (`0x400000`) and fragments (`0x1000000`) are never contacts.
- **Capacity and order:** entries (count at `0x192f84`, then 0x14-byte entries {x, y, colour, blink,
  shape routine}) are appended in item order. After each real contact the count is tested: at
  ≥ 120 (0x78) the build stops. When the contact is the player's +0x8C and the count is still
  below 120, a target box entry follows at the same position (colour 0xF, blink 0, shape `0x409f4`)
  — without its own test. The 120 therefore counts the target box: with the target among the
  first contacts at most 119 real contacts show; when the target box takes index 119, one more
  real contact is written at index 120 (count 121).
- **Buffer bound:** the buffer holds the count and exactly 120 entries (`0x192f84`–`0x1938e7`); the
  next words are radar layout globals (`0x1938ec`, `0x1938f4` read by `0x401e8`/`0x402a0`;
  `0x193900`–`0x193918` written by the radar set-up at `0x40000`–`0x40084` and read by `0x40370`,
  `0x40b7c`). Index 120 (above) and the damaged-radar noise (below, no count test) write past it.
  Reachability needs ≥ 114 entries; Unconfirmed in shipped missions (not observed).
- **Classification:** friendly = kind & `0x6c87f` ≠ 0, except a missile (kind `0x100000`), which
  takes its launcher's (aux +0xFC, when valid) kind & `0x6c87f` and is hostile without one.
  Distance class: Manhattan |dx| + |dy| + |dz| from the player's position, truncated to i32
  (`0x74518`), "near" when < 600 (signed). Colour: friendly missile 0x10; friendly near 0x10, far
  0xF; hostile missile 0xC; map/Warp marker 8; hostile near 0xA, far 9. Blink flag = kind &
  `0x100000` (missiles). Shape: missile 5×5 X `0x40b24`; the marker, and contacts on the
  non-negative side of the camera row-3 plane (Likely in front of the camera; the plane offset's
  writer was not traced), plus `0x40a98`; the others X `0x40ad4`. (Palette indices and shapes:
  hud.md, P3-13.)
- **Blink:** `0x4017c` toggles `0x1752c8` when `0x1752cc` < sample, then `0x1752cc` := sample + 0x10;
  an entry with a non-zero blink flag is drawn in colour 0xA while the phase is 0.
- **Display geometry (camera-relative):** `0x40d44` reads the camera position `0x1b075c`–`0x1b0764`
  (`0x52e14`) and orientation `0x1b0768`–`0x1b0788` (`0x52e90`), which `0x52df4`/`0x52e34` set from
  `0x30ef0` and the per-view camera functions. The contact's position is projected onto the plane
  through the camera perpendicular to camera row 3 (offset from player-state +0xA8; +0xA0/+0xA4 for
  rows 1/2; writer not traced), normalised, and split into row components; a second projection on
  the row-1 or row-2 plane (chosen by |row-1 component| < 0.707) gives the forward component c;
  the screen point is the direction scaled by (1 − c) × 0.5 × scale + centre (`0x19390c`,
  `0x193900`, `0x193904`), truncated by `0x74518`. Distance does not move a contact. Each
  object's last three projections are cached in its aux block (+0xAC–+0xC8, +0xE4–+0xEC, with the
  sample) and reused when the projected length is within ±1e−6. So the radar turns with the
  camera: in F1/F2 the camera is the craft's pose (P3-01/09), in external views it is not. The
  contact set and classification do not depend on the camera.
- **Damage (player subsystem 12 through `0x52ac4`):**
  - state 0: as above;
  - state 1: after the real entries, N = rand & 7 more entries; each takes a direction from
    `0x56b8c` (rand mod 361 indexes the 361-entry f32 vector table `0x1b1310`, rand mod 8 picks one
    of eight sign patterns), colour 9 + (rand & 1 = 1), blink rand & 1, shape plus or X by rand & 1;
    after each, while entries remain, rand & 7 = 2 adds a fake target box at the same spot (counted
    in N). Real contacts are not replaced, but there is no count test, so at high counts the noise
    runs past the buffer (above);
  - state 2: no real contact and no target box; 60 noise entries (count < 0x3C), shapes by
    rand & 3 through the jump table `0x40360` (single pixel `0x40a80`, plus, X).
  - other values: the build tests the field only for 2 (`0x40399`, which skips the real contacts) and for 1 and 2
    (`0x4078a`, `0x408d1`, noise). A value of 3, which no damage path writes, therefore builds like state 0
    (Confirmed, code, P3-07/13).
  These rand calls run in the render path and draw from the same LCG as placement, spawning and
  other rule draws (P3-02/02), so in the original the radar's drawing shifts later rule draws.

##### T7. Right (target) display (Confirmed, code)

`0x42d80` is the type-7 instrument draw handler (`0x49b2c` passes EAX = player-state, EDX = view
mode, EBX = full-redraw flag, ECX = instrument rectangle, and calls a handler only when forced or
when the sample minus the instrument entry's last-draw time +0x1C exceeds its period +0x18, in
0x30-byte entries).

- **State writes in the render path:** at every call, when player +0x8C is invalid, or the view mode
  is 6, the handler clears the player's target (`0x528bc(player, 0)`, `0x42e21`). When the target
  is valid and its +0xCC = 1 it copies a 7-byte EXE notice (`0x171a34`) into the display's message
  buffer `0x19b1e4`, sets its countdown `0x19b1e0` = 20 (decremented per draw while shown) and
  clears the player's target. No message, event or sound is posted for these clears.
- **Cached display target:** `0x19b1c0` holds a counted reference to the shown target
  (`0x52780`/`0x52774`); a change resets the display's 3D view state.
- **Subsystem 14:** state 1 alternates content and the SNIP noise at rand-drawn intervals of
  0x40 + (rand & 0x3F); state 2 shows only the noise (hud.md).
- **Fields read from the target (refresh when `0x17547c` < sample, then `0x17547c` := sample + 9,
  or on a change; without a target the empty-display text is refreshed every 0x80):**
  - kind +0x04 (`0x2000000`, the map/Warp marker, gets a crosshair and its distance instead of a
    model and the other numbers; its name is still drawn);
  - name +0x15C (text drawn);
  - position +0x6C–+0x74 and rows +0x54–+0x68 (its model is drawn through the 3D library; the view
    distance comes from the per-kind table `0x175424` indexed by kind bit, +16 entries when the
    target's +0x06 word is non-zero; a |dot product| ≤ 0.01 test on the player's orientation
    (`0x43673`) selects one of two view set-ups);
  - Euclidean distance from the player: the differences (player − target) are formed in double, and each squared
    term is the unrounded difference times its own f32 store (`FST float` before `FMUL float`), summed as
    (dy² + dz²) + dx², then `FSQRT` and an f32 store (Confirmed, code, P3-07/23); shown as is or × 0.001 when
    ≥ 99999.0;
  - aux +0x08 f32 when aux exists (Likely the speed; P3-06);
  - +0x2C ÷ craft record +0x5C × 100 (`FILD`/`FILD`/`FDIVP`/× 100.0), 0 when +0x5C ≤ 0 (+0x2C is the shield,
    [D1](#d1-object-fields-of-this-section--confirmed-code));
  - craft record +0x08 f32 × 0.001 (× 0.001 again when > 1000.0) — the first code reader of that
    field ([craft §3.5](./craft.md#35-craft-record-and-missile-body-record-236-bytes)).
  Text formats and layout belong to P3-13.

##### T8. Left display: no target reads (Confirmed, code)

The type-6 handler `0x4ce30` draws page `0x1a9dc8` from the 7-entry page table `0x175c7c` (0x20
bytes each: handler, —, period, next due, subsystem index, flicker state, next flicker, time; the
periods are already recorded in the [time base](#simulation-time-base-p3-0106)):

| Page | Handler | Period | Subsystem |
|---|---|---|---|
| 0 | `0x4d0e0` | 0 | 10 |
| 1 | `0x4d800` | 0 | 11 |
| 2, 3, 4 | `0x4da28` | 0x40, 0x10, 0x40 | 13 |
| 5 | `0x4dc50` | 0 | 13 |
| 6 (Warp) | `0x4dcec` | 0x10 | none (−1) |

Page handlers receive EAX = rectangle, EDX = player-state, EBX = view mode, ECX = redraw flag; their
only +0x8C reads (`0x4d0f4`, `0x4d818`, and `0x27e6d` via `0x4da6e`) are of the player-state block,
i.e. the player node. No page handler or helper it calls directly (`0x4d50c`, `0x4d308`,
`0x4d44c`, `0x4e018`, `0x4d6f0`, `0x4d010`, `0x27e68`, `0x4e490`) reads the player's +0x8C. The
subsystem state is the player's (`0x52ac4` on the player node); flicker uses rand (`0x4ce30`,
`0x4d44c`).

##### T9. Object sets `0x2ede0`/`0x2f028` (Confirmed, code)

- **Sets:** `0x2ede0` (after `0x30590` in the dispatcher pass) rebuilds two object sets, `0x174b78` and
  `0x174b74`, through `0x2f028`; P3-06 records when and with which members ([object sets](#world-boundary-active-area-parking-and-autopilot-p3-0604)).
- **Readers:** `0x2ede0`, `0x2ee60`, `0x2eff8`, `0x2f028` and the AI step `0x62250` (five reads).
  The targeting helpers (`0x2799c`, `0x27910`, `0x27884`, `0x27a04`, `0x63858`, `0x63954`,
  `0x63a4c`, `0x637e4`), the radar (`0x402a0`, `0x40370`, `0x4017c`) and the camera pass `0x21584`
  do not reference them, nor does any other combat rule ([C4](#c4-object-sets--confirmed-code)). **Dependency:** the player's command and automatic targeting,
  the joystick target button and the radar do not depend on the two sets; the autopilot's target
  writes (T11) run through `0x62250`, which reads them, so that path depends on them and belongs
  to the P3-08 interface together with the AI's own use.

##### T10. Numbers on these paths (Confirmed, code)

Inherits P3-02/02: 53-bit x87 precision, conversions through `0x74518` (truncation), the rounding
direction observed at runtime (round to nearest, U-009).

- **`0x637e4`:** per-axis differences of f32 positions in double; dx² = f32(dx)·f32(dx);
  dy² = dy·f32(dy); dz² = dz·f32(dz) (each difference stored once to f32 with `FST`, the other
  factor kept in double); sum (dx² + dy²) + dz²; every product and sum rounded to double; returned
  unrounded. Callers store d as f32 (`FSTP`/`FST float`), except that `0x63858` compares the
  candidate's **unrounded** d with the f32 reference (`0x638f1`) and compares f32 values in its
  minimum search; `0x63954` compares f32 values throughout. No square root on the player paths
  (`out` is 0 in all four helpers).
- **`0x56dc0` (forward):** row-1 component from double differences, rows 2–3 from the f32-rounded
  differences; each component stored as f32. Each dot product adds the y term to the x term, then
  the z term (P3-07/12, ignored `local/research/p3-07/rule-data/out/p4`). z > 5.0 is an f32 compare; x² + y² is formed in double
  from the f32 components and compared unrounded with the f32 r².
- **Radar:** Manhattan sum in double from f32 positions, truncated to i32 (|sum| < 2^31 for any
  world ≤ 105,000 units, so no overflow); screen coordinates truncated to i32; projections stored
  as f32; the ±1e−6 degenerate-length test uses doubles.
- **Right display:** Euclidean distance with `FSQRT` in double, stored f32; ratios with `FILD`.
- **Timers:** all due-time tests (`0x1a8`, `0x1b0`, `0x1752c4`, `0x1752cc`, `0x17547c`) compare the
  sample unsigned (`JNC`/`JBE`/`JA`) with a due time formed by a wrapping 32-bit `ADD` (`0x2624e`,
  `0x27670`, `0x40330`, `0x401aa`, `0x43c52`). The raw counter starts below 30000 and advances by 2
  per 1/32 s while not paused ([time base](#simulation-time-base-p3-0106)),
  so the sample or a due time can wrap only after about 2^31 ÷ 32 s ≈ 777 days of unpaused
  running: unreachable in play (Confirmed, code and arithmetic). The automatic-target test fires on
  the first update whose sample is strictly greater than the due time, so its spacing is more than
  0x40 units (at least 66 with even samples).
- **rand:** none on the selection paths (no call to `0x7453b` in `0x2799c`, `0x27910`, `0x27884`,
  `0x27a04`, `0x63858`, `0x63954`, `0x63a4c`, `0x637e4`, `0x56dc0`, `0x5261c`). Render-path users:
  radar `0x40370` (`AND 7`, `AND 1`, `AND 3`) and `0x56b8c` (signed `IDIV` by 361 and by 8 of a value
  0–32767), right display (`AND 0x3F`), left display `0x4ce30` (`AND 0x3F`) and `0x4d44c`.

##### T11. Autopilot target writes (Confirmed reachability; P3-08)

With `0x174b24` set, the device poll runs `0x5dcd4` for the player; `0x5dcd4` → `0x62250` →
`0x62578` → `0x528bc` and → `0x62714` → `0x528bc` write the subject's +0x8C directly in AI modes 2
and 4 (and +0x90 through `0x528e8` otherwise), bypassing message 2 and the mode field; `0x62250`
also reads the two object sets. Of the other AI writers of +0x8C (`0x5c584`, `0x5c658`, `0x5c8b0`,
`0x5d3b2`, `0x61740`, `0x61b99`, `0x61be8`, `0x63623`, `0x636f4`), none is reachable from `0x5dcd4`
by direct calls (indirect calls not covered). Which AI mode the player's controller uses under the
autopilot was not traced.

Evidence: ignored `local/research/p3-07/targeting/` (`ghidra_scripts/TargetProbe.java`, `probe.sh`, outputs `out/t1`–`out/t36`). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Every Confirmed (code) step was read from native instructions, with the decompiler used only to navigate, and callers were checked by raw scans of relative transfers and of 32-bit values.

#### Weapons: mounts, selection and firing (P3-07/02)

Q-03 and Q-04. Extends [weapon records](#weapon-records-and-the-first-missions-shooters-p2-1230) and the fire triggers of [input polling](#input-polling-p3-0201). A *state* is a 0x50-byte mount state.

##### W1. Per-object weapon block and mount states — Confirmed (code)

`0x2d400(handle)` zeroes the 0x60 bytes at object +0xF4 and (re)builds the mount-state array. Fields
(object offsets):

| Offset | Type | Meaning | Writers / readers |
|---|---|---|---|
| +0xF4, +0xF8, +0xFC | i32 ×3 | Last trigger value of channels 0, 1, 2 | `0x2d578` stores it each call; channel 1's is cleared at the end of the call |
| +0x100, +0x104, +0x108 | i32 ×3 | Selected index in mount lists 0, 1, 2 | `0x2e4ec` |
| +0x10C, +0x110, +0x114 | pointer ×3 | Current mount state of lists 0, 1, 2 (null for an empty list) | `0x2d400`, `0x2e4ec`; read by `0x2d704` |
| +0x118 | u8 | Missile lock level 0–4 | `0x2ddbc` (lock machine), `0x2e4ec` (list-1 change → 0), `0x2e86c` (after a launch) |
| +0x11C | u32 | Lock stage deadline (clock) | `0x2ddbc` |
| +0x120 | i32 | Lock "losing" flag | `0x2ddbc` |
| +0x124 | u32 | Lock grace deadline (clock) | `0x2ddbc` |
| +0x128 | u32 | Next lock update (clock) | `0x2ddbc` |
| +0x12C | i32 | Aim-solution cache flag for the current trigger call | `0x2d578` clears it, `0x2e9d4` sets it |
| +0x130–+0x153 | f32 ×9 | Cached aim orientation (rows 1–3) | `0x2e9d4` via `0x2e5e8` |
| +0x154 | i32 | Mount-state count (= craft +0xE8) | `0x52750` → `0x5269c` |
| +0x158 | pointer | Array of 0x50-byte mount states, one per craft mount, in mount order | as above |

`0x5269c` keeps the existing array when the count is unchanged and reallocates (new tail zeroed) otherwise;
`0x2d400` then zeroes every state with a 0x50-byte memset (Confirmed, code).

Mount state, 0x50 bytes (offsets in the state):

| Offset | Type | Meaning | Source / writers |
|---|---|---|---|
| +0x00 | i32 | Mount index | `0x2d400` |
| +0x04 | i32 | Clock of the last shot or misfire (0 initially) | `0x2e5e8`, `0x2e86c`, `0x2dad0` |
| +0x08 | i32 | Ammunition | `0x2d400` copies mount +0x0C; `0x2e86c` decrements; mount damage (W4) reduces it |
| +0x0C | i32 | Damage level 0 intact, 1 damaged, 2 destroyed | `0x2d400` = 0; `0x2e310`/`0x2e150` increment; `0x2e3c8`/`0x2e1fc` reset |
| +0x10 | pointer | The craft mount (56-byte record) | `0x2d400` |
| +0x14 | pointer | State of the mount named by mount +0x18 ("fire-together" link), or null | `0x2d400` |
| +0x18 | pointer | State of the mount named by mount +0x1C ("alternate" link), or null | `0x2d400` |
| +0x1C | i32 | Tried-in-this-call flag | `0x2d578` |
| +0x20 | i32 | Automatic-mount burst counter | `0x2da58` loads gun +0x2C; `0x2dad0` decrements |
| +0x24–+0x47 | f32 ×9 | Automatic-mount aim orientation (rows 1–3) | `0x2e9d4` via `0x2da58` |
| +0x48 | handle | Automatic-mount target (counted reference) | `0x2daa0` → `0x52788`; `0x527d8` drops it when invalid; released by `0x523f4` |
| +0x4C | u32 | Automatic-mount retarget time | `0x2daa0` stores its argument unchanged; `0x2dabc` tests clock > it |

**Lists (Confirmed, code):** `0x2d400` sets, for each list c with a non-zero count (craft +0xD0, +0xD8, +0xE0), the
current state to entry 0 (`0x2e990(craft, c, 0)`), and null for an empty list. `0x2e990(craft, c, i)` returns the
mount index of entry i of list c (craft +0xCC, +0xD4, +0xDC), computed as the pointer difference ÷ 0x38.

**Callers (Confirmed, code):** instantiation `0x67938` (at `0x6799b`) and the rescue `0x67b98` (at `0x67bd1`); no
other caller (raw call scan). A rescue therefore restores every mount's ammunition from the craft record, clears
damage levels, burst counters, aim data and per-mount targets, resets each list's selection to entry 0, clears the
lock state and both trigger values. (Per-mount target references are overwritten without release; this leaks a
counted reference but has no rule effect.)

##### W2. The three mount lists — Confirmed (code); slice contents Confirmed (data)

- **List 0 = main weapons, channel 0 (primary trigger).** `0x2d704(handle, c)` returns object +0x10C + 4c, so
  `0x2d578(handle, 0, …)` fires list 0's current mount. The player's primary trigger (Alt / joystick button, a
  level) calls channel 0 every frame.
- **List 1 = missiles, channel 1 (secondary trigger).** The player's secondary trigger (Space / button, one-shot)
  calls channel 1; `0x2d578` clears the stored channel-1 value at the end of every call. Only list 1 drives the
  missile lock (`0x2ddbc` reads +0x110).
- **List 2 = channel 2, fired only by the AI step** (`0x5dcd4` loops over channels 0–2; the player update calls only
  channels 0 and 1). No key selects in list 2.
- **Automatic mounts are in no list** and are fired by `0x2dad0` only (W8).
- A list entry may hold guns or missiles: `0x2d578` dispatches on the mount's +0x10 type, so channel 0 also launches
  missiles (the player's missile type 0 is the third list-0 entry).
- **Slice (CINF 4037, local count):** player list 0 has three entries (gun 0 as a fire-together pair, gun 1 as an
  alternate pair, missile 0 as an alternate pair), list 1 two entries (missile 1 and missile 3, each an alternate
  pair), list 2 none. Wingman: list 0 two entries (guns 0, 1), list 1 two (missiles 1, 2); its missile-0 mounts are
  in no list. Enemy kinds 7 and 8: list 0 one entry of gun 2 (kind 7: a fire-together pair; kind 8: a fire-together
  chain of four).
  Transponder: no mounts. Base: four automatic gun-6 mounts in no list. No slice shooter has a list-2 entry.

##### W3. Selection — Confirmed (code)

- `0x2e4ec(handle, list, delta)`: adds delta to the list's index (+0x100 + 4·list). If the result is negative it
  becomes count − 1; otherwise, if it is ≥ count, it becomes 0 (wrap both ways). The current state becomes entry
  `index` of the list, or null when the count is 0. When the list is 1 it clears the lock level (+0x118 = 0). Then,
  **only when the object is the player** (player-state `0x1b0638` +0x8C equals the handle), it posts dispatcher
  message type 4 with the player as subject (the sound request of [audio](./audio.md),
  entry 11381). It returns 1.
- The index is changed and the message posted **whether or not the selection changes**: a single-entry list keeps
  entry 0 and still posts the request; an empty list keeps a null current state (its index may become −1) and still
  posts it. Precondition: `0x2e4ec` first returns 0 without any change or message when the object has no craft record
  or no mount-state array (+0x158 null, i.e. a craft with no mounts at all); the empty-list behaviour above applies to
  a craft that has mounts but none in that list. Unusable mounts (damage level 2, no ammunition) are **not skipped**;
  they stay selected and then fail to fire (W5).
- Wrappers: `0x2d6dc(handle, list)` = delta +1, `0x2d6f0(handle, list)` = delta −1.
- **Keys (flight key context `0x264a0`, compare chain on the translated key code):** 0x2F `/` → `0x2d6dc(·, 0)`
  (next main weapon); 0x2E `.` and 0x3E `>` → `0x2d6dc(·, 1)` (next missile); 0x2C `,` and 0x3C `<` →
  `0x2d6f0(·, 1)` (previous missile). There is no case for 0x3F `?`; the key read `0x3c970` swaps case only for
  letters (Caps Lock, BIOS flag bit 0x40), so a shifted `/` does not select. The manual's `?` is Likely the key's
  shifted legend; which key code a DOS read returns for that key is a P3-05 (U-011) question. The context serves
  every view mode except Warp (0–3), base (6) and map (8)
  ([view keys](#automatic-views-and-cameras-p3-0109)), so selection
  works only in flight modes.
- Other callers of the wrappers: base interior `0x39820`/`0x398ec` (P3-10) and AI code at `0x61355`, `0x6137b`,
  `0x63d4c`, `0x63caf` (P3-08; list argument not traced).
- **Weapon name `0x2dcf0(state)`:** the selected mount's weapon record +0x04 (gun or missile name), or a fixed
  default string of the data object at `0x170fc4` when the state is null. Callers `0x47d5c` (HUD weapon line) and
  `0x4f550` (P3-13).

##### W4. Mount damage, repair and status (subsystems 5 and 8) — Confirmed (code)

- `0x2a830` (subsystem damage, [D4](#d4-hull-and-subsystem-damage-0x2a830eax-victim-edx-source-ebx-hulldamage-ecx-noattacker--confirmed-code)) picks a subsystem index s and reads its 2-bit state; when that state is below 2:
  s = 5 calls `0x2e150` (list-1 mount damage), s = 8 calls `0x2e310` (list-0 mount damage), and in both cases it
  **skips the 2-bit increment** that every other index gets (`0x52a84`). Index 7 and 10/13 have their own rules
  (D4). It then sets object +0xF0 = 1 for every index.
- `0x2e310(handle)` (list 0): if the handle is valid, list 0 is non-empty and the state array exists, it draws
  rand % count0 (signed) to pick a list entry, then walks from that entry's state, following +0x14 when non-null and
  otherwise +0x18, to the first state whose level is not 2. If none, nothing happens (no other entry is tried).
  The level is incremented; if it became 1 and ammunition > 0, ammunition becomes rand % ammunition; otherwise
  ammunition becomes 0.
- `0x2e150(handle)` (list 1): the same, but the walk follows only +0x18.
- Repair (`0x2e3c8` list 0 following +0x14 else +0x18; `0x2e1fc` list 1 following +0x18): with flag 0 it resets the
  first damaged state found (list order, then chain order) to level 0 and returns 0; with a non-zero flag it resets
  all and returns 1; it returns 1 when nothing was damaged. Ammunition is not restored. Callers: base interior
  `0x39820`, `0x398ec` (P3-10).
- Status (`0x2e438` list 0, `0x2e264` list 1, same walks): counts states at levels 0, 1, 2 over every entry; returns
  0 when none is at level 1 or 2, 2 when every state is at level 2, otherwise 1. Callers `0x398ec` and `0x4d65a`/
  `0x4d673` (status display, P3-13). So the displayed state of subsystems 5 and 8 is derived from the mount lists
  (Likely; the display code was not read), while their own 2-bit fields are never incremented by `0x2a830`.
- Mounts in list 2 and automatic mounts are never damaged by this path.

##### W5. Trigger routine `0x2d578(handle, channel, value)` — Confirmed (code)

1. Stores value at object +0xF4 + 4·channel. Value 0 → returns 1 (nothing tried).
2. head = `0x2d704(handle, channel)` (current state of list `channel`). Null → returns 0.
3. Clears +0x1C of every state on **head's** +0x18 chain only, clears the aim cache flag (+0x12C), reads clock
   once.
4. For each *group* g on the +0x14 chain starting at head:
   - If g has no +0x18 link, the candidate is g, attempted without using the tried flag. Otherwise the candidate is,
     among the untried states of g's +0x18 chain (g included), the one with the smallest +0x04 strictly below clock
     (signed; the first wins ties); if none, g itself. A candidate already tried ends this group.
   - Because only head's chain is cleared, a later group with alternates would keep its tried flags from earlier
     calls. No list entry of the 24 CINF has that arrangement, nor a head with both links (local count over 398
     entries, `out/chain.txt`), so the case is unreachable with the shipped data.
   - The candidate is marked tried and attempted by its mount's +0x10 type:
     - gun (0): requires `0x30cc8` (charge gate, W6) and level ≠ 2, then `0x2e5e8`;
     - missile (1): requires ammunition > 0 (signed) and level ≠ 2, then `0x2e86c`;
     - any other type: not attempted (the previous result is kept).
   - On failure, when g has a +0x18 link, the next untried alternate is chosen by the same rule; otherwise the
     next group follows.
5. If channel is 1, the stored channel-1 value is cleared. Returns the result of the **last** attempt (not "any
   shot"). Neither the player update nor the AI step reads the return value.

Effects: groups on +0x14 fire together (one shot per group per call); members of a +0x18 chain alternate, the one
that fired least recently going first. The routine itself has no Warp, view-mode, state or dead-flag test; the player
update calls it only in state 7 with the dead flag clear, every frame (also in map and Warp modes,
[input polling](#input-polling-p3-0201)).

**Order of checks per attempt (for reason codes):**

| Weapon | Order |
|---|---|
| Gun | charge (player only) → destroyed mount → cooldown → damaged-mount misfire → aimed-gun target/arc (with fallback) → shot |
| Missile | ammunition → destroyed mount → target required (guided only) → cooldown → launch |

##### W6. Gun shot `0x2e5e8(handle, clock, state)` — Confirmed (code)

1. **Cooldown:** fails when clock < state +0x04 + gun +0x14 (signed). Equality fires.
2. **Misfire:** when the level is 1, one rand; if rand & 1 = 1 the attempt fails, but +0x04 = clock (the cooldown
   restarts) and no charge is spent. Exactly ½.
3. **Aim (gun +0x28 = 1 only):** if the shooter's target (object +0x8C) is valid, `0x2e9d4` computes or reuses the
   aim solution (W7) and tests the mount's arc; otherwise the result is 0. When the result is 0 **and** mount +0x30 =
   0 **and** the state has a +0x18 alternate, the attempt fails (no cooldown or charge change). Otherwise it fires
   unaimed.
4. **Shot:** +0x04 = clock; `0x30cec` spends charge (player only); posts message 8 (W9). For gun +0x28 = 1 the
   message carries an orientation: the aim orientation when aimed, otherwise the shooter's pose rows with rows 1 and
   3 negated when mount +0x20 has bit 0x08. For other guns the message carries no orientation. Returns non-zero.

**Charge (Confirmed, code):** `0x30cc8(handle, gun)` returns 0 when object kind has bit 0 (the player) and gun +0x18
> object +0x30 (signed), else 1; non-players are never gated. `0x30cec` (player only): object +0x30 −= gun +0x18 (0
when it would go negative; unreachable after the gate), and object +0x44 = 1 when the kind is exactly 1 (the energy-page redraw flag,
[D1](#d1-object-fields-of-this-section--confirmed-code)).

**Gun +0x28 values (Confirmed, code):** 0 fixed (no arc, no orientation in the message), 1 aimed (arc and target as
above), 2 automatic (only `0x2dad0`, `0x2d72c`, `0x2d7cc` use it; never fired by `0x2d578` as an automatic mount
because such mounts are in no list in the slice — Confirmed for the slice by data, the code itself would fire a
type-2 gun placed in a list like a fixed gun).

##### W7. Aim solution `0x2e9d4` and hemisphere test `0x2d894` — Confirmed (code)

`0x2e9d4(shooter, cacheFlag*, out[9], target, mount)` (stack argument popped by `RET 4`):

- If cacheFlag is non-null and set, the cached orientation is reused (only the arc test runs). `0x2e5e8` passes
  object +0x12C/+0x130, so within one `0x2d578` call the first aimed mount's solution is reused by later aimed
  mounts, even with different mount offsets. `0x2da58` passes no flag and always computes.
- Origin = shooter position, plus the mount offset transformed by the shooter's rows when mount +0x34 ≠ 0.
- Time of flight t = √|target − origin|² ÷ gun +0x08. Aim point = target position + (target speed × t) × target
  row 3, where target speed is the f32 at the target's movement block +0x08 (`0x21c78`; 0 without a block). Row 3
  of out = aim point − origin; `0x56d18` completes rows 1–2 (orthonormal frame; P3-06 helper). Sets the flag.
- Arc (mount +0x20 bits, d = row 3 of out, compared with the shooter's rows): 0x01 requires d·row3 ≥ +0x24; 0x08
  requires d·row3 ≤ −(+0x24); 0x02 requires d·row1 ≥ +0x28; 0x10 requires d·row1 ≤ −(+0x28); 0x04 requires d·row2 ≥
  +0x2C; 0x20 requires d·row2 ≤ −(+0x2C). Returns 1 when all present bits pass.
- **Numerics (Confirmed, native instructions, P3-07/14):** the origin is built like a spawn position of W11 with
  k = mount +0x08. t is stored to f32. With L = target speed × t, the aim point's x and y are F(F(L × row 3) +
  target) and row 3's x and y are F(aim − origin); z skips both stores: F((L × row3_z + target_z) − origin_z). Each
  arc product (the y, then z, then x terms) is stored to f32 before its comparison, unlike the general rule of W13.
  With the arguments of its two P3-07 callers (`0x2e9d4`, and `0x218e8` for a mode-2 source), `0x56d18` normalises
  row 3 (`0x56aa8`), sets row 1 = row 2 × row 3 (each component F(a·b − c·d)) and normalises it, then sets row 2 =
  row 3 × row 1 without normalising; the old row 1 is not read.

`0x2d894(shooter, target, state)`: returns 0 when |target − shooter|² > weapon +0x10 (range², non-strict in range);
then, with v = target − shooter (positions only, no mount offset), bit 0x01 requires v·row3 ≥ 0, 0x08 requires
v·row3 < 0, 0x02 requires v·row1 ≥ 0, 0x10 v·row1 < 0, 0x04 v·row2 ≥ 0, 0x20 v·row2 < 0. Callers: AI target choice
`0x5e444` only. The products v·row (y, z, then x terms) stay in double and are compared with 0 (P3-07/14).

##### W8. Missile launch `0x2e86c` and the missile lock `0x2ddbc` — Confirmed (code)

`0x2e86c(handle, clock, state)`:

1. When missile +0x18 ≠ 0 (guided), the shooter's target (+0x8C) must be non-null and valid; otherwise fails.
2. Cooldown: fails when clock < state +0x04 + missile +0x1C (signed).
3. +0x04 = clock; ammunition −1, except when the typed-cheat flag `0x174ed8` is set and the shooter is the player
   (the flag is entry 17 of the typed-cheat table, pointer at `0x175090`, toggled only by cheat matching in
   `0x3c970`; it is also read by `0x2a694`). The project implements no cheats, so ammunition always decreases.
4. Posts message 8 (W9) with the lock byte: object +0x118, minus 1 (floor 0) when the mount's level is 1.
5. For a guided missile, the lock level is cleared unless the shooter is the player and `0x2dd04(fired state)` > 0
   (ammunition left on the +0x18 chain from the fired state on: for an alternate pair, firing the first member
   counts both, firing the second counts only itself); for any non-player shooter it is always cleared.

The launch does **not** require any lock level; the lock level only selects the missile's behaviour at construction
(W9).

`0x2ddbc(handle)` runs once per frame in the player update (state 7, alive), before the polls; its only caller is
`0x2613d` (raw call and value scans). Using the current list-1 state s and the target (+0x8C):

1. Lock = 0 and return when there is no target, no s, subsystem 3's state (`0x52ac4(·,3)`) is 2, or the target's
   kind is in `0x206c87f` (friendly kinds and the player).
2. Return when clock < next update (+0x128, unsigned).
3. Walk s's +0x18 chain to the first state with ammunition ≠ 0; none, or its missile has +0x18 = 0 → return
   (next update unchanged).
4. ok = |target − shooter|² < missile +0x10 (strict) and (normalised direction · shooter row 3) > missile +0x28
   (strict); when missile +0x3C ≠ 0 also target row 3 · shooter row 3 > missile +0x40 (strict). **When subsystem 3's
   state is 1, ok is replaced by (rand & 0xFF) > 0x80** (signed compare; 127/256), discarding the geometric result.
5. Not ok: if the losing flag is set and clock ≥ grace deadline (unsigned) → lock = 0; otherwise losing = 1 and
   grace deadline = clock + missile +0x38 (so the lock is lost only when two consecutive failed updates are at least
   +0x38 apart).
6. ok: if losing was set, lock 2 → stage deadline = clock + (missile +0x34 >> 1); lock 3 or 4 → lock = 3 and
   deadline = clock + (missile +0x34 / 2, truncating); then losing = 0. Then the stage machine (jump table
   `0x2dda8`): 0 → 1 with deadline = clock + missile +0x30; 1 → 2 and 2 → 3 when clock ≥ deadline (unsigned), each
   with deadline = clock + (missile +0x34 >> 1); 3 → 4 when clock ≥ deadline; 4 stays.
7. Next update = clock + 0x15.

Helpers: `0x2dd04(state)` = sum of ammunition over the +0x18 chain of a missile entry (−1 for a gun or null);
`0x2dd94(state)` = missile +0x24 byte, or 2 for a gun; `0x2dd54(handle, channel, out)` = current entry's weapon +0x0C
(range) unless it is a missile entry without ammunition; `0x2e080(handle)` = HUD lock progress (signed): −1 when the handle is invalid, the current list-1 state (+0x110) is
null, the losing flag (+0x120) is 1 or the level is 0 or 1; 0 at level 4; otherwise r = stage deadline (+0x11C) − clock
(`SUB`, signed test), and at level 2 it is 50 when r < 0, else (100 × r) ÷ c34 + 50, at level 3 0 when r < 0, else
(100 × r) ÷ c34. Here 100 × r is formed with shifts and adds (wrapping as i32), the divide is a signed `IDIV`, and c34 is
+0x34 of the current list-1 state's own weapon record (state +0x10 → mount +0x14), read only when r ≥ 0; for a gun
mount that read falls past the 48-byte gun record (Confirmed, code, P3-07/23). Consumers: AI (`0x5dfa4`,
`0x5e070`, `0x63d3c`, `0x64132`), HUD `0x45de0`, `0x47d5c` (P3-08, P3-13).

##### W9. Automatic mounts — Confirmed (code)

- **Firing `0x2dad0(handle)`:** called only by the AI step `0x5dcd4` when AI block +0x140 ≠ 0. For every mount state
  in mount order: skip unless weapon +0x28 = 2, level ≠ 2, burst counter +0x20 > 0 and state +0x04 + weapon +0x14 ≤
  clock (signed). At level 1 one rand: fire only when (rand & 0xFF) < 0x80 (½). On fire it posts message 8 with the
  stored aim orientation (+0x24–+0x44) and the mount offset plus a jitter: a random direction from `0x56b8c` (two draws,
  [direction table](#numbers-on-the-movement-path-p3-0601)), each component multiplied by its own (rand × 1/32767 × 3 + 2); each
  jitter component F(that × u) is stored before F(offset + jitter) (P3-07/14). Fired or not, the
  burst counter decrements and +0x04 = clock. The routine does not test the mount type; no missile record in any of
  the 24 CINF has 2 in the byte at +0x28 (local count), so only guns fire this way.
- **Acquisition `0x2da58(handle, state)`:** target = `0x527d8` (state +0x48, dropped when invalid); when valid and
  `0x2e9d4` (no cache) passes the mount's arc, burst counter = weapon +0x2C. The burst is then fired along the
  orientation computed here; mid-burst mounts are not re-aimed (`0x2d72c` skips them). `0x2e9d4` writes the solution
  into the state's aim before its arc test, so a failed test still changes the aim; only the burst waits for a pass
  (P3-07/14).
- **A separate policy, not the list path:** automatic mounts never go through `0x2d578`/`0x2e5e8`. Compared with a
  list gun they have no charge gate or cost (also for the player), their own damage roll ((rand & 0xFF) < 0x80
  instead of rand & 1), a burst counter that is consumed and a cooldown that restarts on a failed roll as well, no
  aim or arc test at fire time (the orientation comes from acquisition), and a random spawn jitter. They share only
  the mount state, message 8 and the projectile constructor.
- **Target choice (AI, P3-08):** three AI behaviours (`0x62c28`, `0x6307c`, `0x64914`) walk idle automatic mounts
  with `0x2d72c` (next automatic mount after an index with burst 0 and level ≠ 2); for each, when `0x2dabc` (clock >
  state +0x4C, unsigned) holds they call `0x5e444(handle, state, kindMask, hold)`, then always `0x2da58`.
  `0x5e444` walks objects of `kindMask` (object-table walk order), skips the target held by the previous automatic
  mount (`0x2d7cc`, wrapping, which can return the mount itself; that target is kept as a fallback), accepts the
  first that passes `0x2d894`, and stores the result with `0x2daa0` (state +0x48, and +0x4C = hold, stored as given).
  Masks/holds seen: AI block +0x168 with 0x140 (two behaviours) and fixed 0x6c87f with 0xC0. A fourth behaviour
  (`0x62bce`) assigns targets with hold (rand & 7) << 6 and AI +0x168 but does not acquire. Candidate filtering
  beyond range and hemisphere, and whether the hold is meant as a duration, belong to P3-08.

##### W10. AI fire entry points (record only; P3-08) — Confirmed (code)

- `0x5df20(ai, channel, hold)` presses: if AI +0x120 + 4·channel is 0 it becomes 1 and the hold deadline AI +0x12C +
  4·channel becomes 0 (hold 0), clock + hold (hold > 0) or clock + 0x7D00 (hold < 0). 14 call sites in AI behaviours.
- `0x5df84(ai, channel)` releases: value 0 and `0x2d578(·, channel, 0)`.
- `0x5dcd4(ai)` (AI step; callers: generic update `0x20caa`, player autopilot in the device poll `0x2741a`/
  `0x27448`, and `0x2abce` inside the missile callback `0x2ab00`): for an active object, for channels 0–2 in order:
  when the held value is non-zero, `0x2d578(·, channel, value)`; then channel 1 is always released, channels 0 and 2
  when clock > hold deadline (unsigned). Then `0x2dad0` when AI +0x140 ≠ 0. Then the behaviour callback AI +0xFC
  when clock > AI +0xF0.
- `0x5dfa4(ai, channel)` = current weapon range (`0x2dd54`) > AI +0x2C (strict).
- Aimed guns and guided missiles of AI shooters use the shooter's object +0x8C as target, like the player.
- **The lock machine runs only for the player**, and no other writer of +0x118 was found among disassembled
  instructions, so AI-launched guided missiles carry lock 0 (Likely; undisassembled code not scanned).

##### W11. Launch message 8 and the two constructors — Confirmed (code)

**Message 8** (`0x53030` allocates a 0x80-byte slot and clears only +0x08 and +0x1C; the pool `0x566dc` does not
zero slots, so unwritten fields hold an earlier message's bytes):

| Offset | Content | Written by |
|---|---|---|
| +0x08 | Shooter handle (counted reference) | all three posters |
| +0x0C | Type 8 | all |
| +0x20–+0x40 | Orientation rows 1–3 (f32 ×9) | `0x2e5e8` for gun +0x28 = 1; `0x2dad0` |
| +0x44–+0x4C | Spawn offset (mount +0x00–+0x08; plus jitter for automatic mounts) | all |
| +0x50 | Kind: 0x200000 projectile, 0x100000 missile | all |
| +0x54 | 1 | `0x2e86c` only (stale for gun shots) |
| +0x58 | Weapon record | all |
| +0x5C | Lock byte (u8) | `0x2e86c` only |

The dispatcher (`0x20d10`, case type 8 at `0x21393`) handles it only when `0x339cc` passes (the gate also used for
spawns and fragment events), calling `0x25b0c` for kind 0x200000 and `0x2b00c` otherwise. Posters are only
`0x2e5e8`, `0x2e86c`, `0x2dad0` (P2-12/30 scan). The message carries **no mount index, list, channel or command
identity**; the constructors know only the shooter, the weapon record, the offset, the orientation and (missiles)
the lock byte.

**Spawn offset = load-transformed mount +0x00–+0x08:** the posters copy the mount's three floats as they are in
memory, i.e. after `0x2cf38` ([craft §3.8](./craft.md#38-load-transforms-in-0x2cf38-confirmed-code))
increased +0x08 by the RENS length of the gun's record (scaled by the f64 constant for craft records 0 and 1) for
gun mounts whose gun record +0x28 ≠ 2. Automatic (type 2) gun mounts and missile mounts keep their stored +0x08.
Automatic shots then add the jitter (W9). No constructor adds a further length.

**Projectile `0x25b0c(message)`:** allocates kind 0x200000 (state 0), activity 1, update callback `0x259b0`;
movement block +0xFC = shooter (counted reference, attribution), +0xF0 = message +0x54 (stale for guns; no reader
on projectile paths was found among disassembled instructions, [H2](#h2-gun-projectiles--confirmed-code)), +0xF4 = weapon record. Pose from the
shooter (`0x218e8`): rows = shooter rows, position p:

- p1 = f32(pos + f32(row1 · ox)), p2 = f32(p1 + f32(row2 · oy)) per component;
- k = oz + shooterSpeed × step when the shooter handle is valid (shooterSpeed = shooter movement block +0x08), else
  oz; p = f32(p2 + f32(row3 · k)). k is not stored: the speed from `0x21c78` times the f32 frame step `0x186424` (an
  exact product), plus oz, rounded once in double (Confirmed, native instructions, P3-07/14).

When weapon +0x28 ≠ 0 the rows are replaced by the message orientation, after the position above is computed with the
shooter's rows. `0x21794` then writes position and rows,
clears movement block +0x04–+0xA3, and sets (movement-block offsets) mode byte +0x04 = 1, start position +0x0C–+0x14,
speed +0x08 = gun +0x08, velocity +0x5C–+0x64 = f32(row3 × speed) and +0x68 = 1. The shooter's velocity is **not**
added. Posts presentation item 8 for the new object
(renderer/sound, P3-12/P3-14). Player shooter: player-state +0x38 += 1 (projectiles fired).

The projectile's update callback `0x259b0`, its lifetime and its hits are in [H2](#h2-gun-projectiles--confirmed-code).

**Missile `0x2b00c(message)`:** allocates kind 0x100000, activity 1; object +0x1C = missile +0x14 (body record);
calls `0x3060c(missile, body, 100, 0, 0)` (resource initialisation, [D13](#d13-resource-initialisation-0x3060ceax-h-edx-craft-ebx-a-ecx-b-stack-c--confirmed-code)); target = shooter's +0x8C when
valid (`0x528bc`), read **at construction**; callback `0x2ab00` when guided and lock byte ≥ 2, otherwise `0x2aa40`
([H5](#h5-missiles--confirmed-code-unless-marked)); movement block +0xFC = shooter, +0xF0 = 1, +0xF4 = missile record, +0x100 = lock byte. Position
as for projectiles, rows = shooter rows (no aim). Mode byte 0 with throttle value 0 (guided, missile +0x18 ≠ 0) or 0x80 (unguided); the mode-0
initial speed it gives belongs to P3-06. Guided: `0x21a3c` then sets the speed, the commanded speed and the ratio
from the smaller of object +0x78 and the shooter's speed (movement +0x08) (below). When missile +0x20 ≠ 0, three rand: roll by u·π/2 − π/4 (`0x22990`), then a coin
(rand & 1) chooses `0x22a50` (rows 1 and 3) or `0x228cc` (rows 2 and 3) for an angle u·2° − 1° (u = rand × 1/32767;
angles rounded to f32). Posts presentation item 4. Player shooter: player-state +0x40 += 1 (missiles fired), and
`0x3118c` stores the missile handle in `0x174c0c` (camera code, [C1](#c1-the-3d-camera-and-its-readers--confirmed-code)).
`0x2b00c` reads no clock and sets no lifetime: the missile's first callback (`0x2aa40` or `0x2ab00`, state 0)
allocates its guidance block at object +0x14 and posts state 7, and the timers live in that block and `0x2ac10`
([H5](#h5-missiles--confirmed-code-unless-marked)).

**Guided launch speed `0x21a3c(EAX = missile, EDX = its movement block, EBX = shooter)`** (Confirmed, native
instructions, P3-07/30). Its only caller is `0x2b00c` at `0x2b304` (raw call scan; no stored pointer to it), right after `0x21794`
has built the block, and only when the missile record's byte +0x18 is non-zero (guided):

1. It returns without writing anything when the missile's record pointer (object +0x1C) or the shooter's block
   pointer (shooter object +0x08) is null. It makes no validity test of the shooter handle.
2. **Block mode 0** (+0x04 = 0), in this order:
   - +0x78 ← 1 (commanded speed reached);
   - v ← object +0x78 (the missile's maximum speed, which `0x3060c` set to record +0xB8,
     [D13](#d13-resource-initialisation-0x3060ceax-h-edx-craft-ebx-a-ecx-b-stack-c--confirmed-code)) when it
     compares below the shooter's block +0x08, otherwise the shooter's speed. Equal values give the shooter's;
     an unordered compare gives object +0x78. The value is copied as bits, not rounded;
   - speed +0x08 ← v, then commanded speed +0x6C ← v;
   - when +0x70 is ±0 (every bit but the sign clear), +0x70 ← record +0xB8 (object +0x1C);
   - ratio +0x74 ← F(D(speed ÷ +0x70)) when 0 < +0x70 (an unordered compare also divides), otherwise 0.
3. **Any other mode:** only speed +0x08 ← the shooter's block +0x08, as bits. There is no minimum, and +0x6C,
   +0x70, +0x74 and +0x78 are not written.

On its only path the block is in mode 0: `0x2b00c` passes mode 0 to `0x21794`, which copies record +0xB8 of the
same object to +0x70 and sets +0x78 = 1 ([movement stage](#movement-stage-and-integration-p3-0601)). The effective
writes are therefore the speed, the commanded speed and the ratio; the ±0 test rewrites the value already there,
and step 3 is not reached.

**Timing:** the player's and the AI's triggers run in update callbacks (`0x20938` walk), so message 8 is handled in
the same frame's message loop, after earlier messages; the new object is neither moved nor collision-tested in that
frame and its first callback runs in the next frame
([frame pipeline](#frame-pipeline-p3-0201)).

##### W12. Random draws on these paths — Confirmed (code)

| Where | Condition | Draws, in order |
|---|---|---|
| `0x2e5e8` | gun, level 1, after cooldown passes | rand & 1 (misfire on 1) |
| `0x2dad0` | automatic mount ready, level 1 | rand & 0xFF (< 0x80 fires) |
| `0x2dad0` | shot | rand % 361, rand % 8 (`0x56b8c`), then rand for x, y, z |
| `0x2b00c` | missile +0x20 ≠ 0 | roll angle, coin, second angle |
| `0x2ddbc` | subsystem 3 at level 1, update due, guided entry with ammunition | rand & 0xFF (> 0x80 ok) |
| `0x2e310`/`0x2e150` | subsystem 8/5 chosen with state < 2 | rand % list count; then, when the chosen state becomes level 1 with ammunition > 0, rand % ammunition |

No draw in `0x2d400`, `0x2e4ec`, `0x2d578`, `0x2e86c` or `0x25b0c`.

##### W13. Numeric semantics — Confirmed (code)

- **Clock comparisons:** cooldowns (`0x2e5e8`, `0x2e86c`, `0x2dad0`) and the alternate choice in `0x2d578` use signed
  i32 compares; the lock deadlines, next-update time, projectile expiry, AI hold and retarget time use unsigned
  compares. Cooldowns are non-strict (fire at equality), the alternate choice strict, lock/expiry deadlines
  non-strict (≥), retarget and AI hold strict (>). All additions to the clock (`clock + n`, `last + cooldown`) are
  32-bit wrapping `ADD`s. Signed and unsigned agree while the clock and every sum stay below 2³¹. The sample counts
  1/64 s since program start (pauses excluded,
  [time base](#simulation-time-base-p3-0106)), so the sign boundary is
  reached only after about 388 days of uninterrupted running (2³² wrap after about 776 days); past it, a signed
  cooldown test compares a negative clock with a positive `last + cooldown` recorded before the boundary and refuses
  the shot, while the unsigned deadlines keep comparing normally until a sum wraps past 2³². Not reproduced: the Core
  clock follows the P3-02 safe-integer rule and faults instead of wrapping.
- **Integers:** ammunition, charge, costs, burst counts are i32 (`DEC`, `SUB`, signed `JLE`/`JG`). `rand % n` uses
  signed `IDIV` with rand ≥ 0, so the support is 0…n−1 with 32768 = q·n + r preimages split q+1 for values < r.
  `rand & 1` and `rand & 0xFF` are exact (½, ½, 127/256). The lock stage durations halve with an arithmetic shift
  (`SAR`) except the resume branch for levels 3–4, which divides by 2 truncating; both agree for non-negative data.
  HUD progress uses signed `IDIV`.
- **Floats:** all arithmetic on the x87 in double precision (control word of
  [x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202)).
  Differences of positions are stored to f32 before being squared in `0x2ddbc`, `0x2d894`, `0x2e9d4` (the first
  difference is squared as extended × f32); dot products stay on the x87 stack and are compared with f32 operands.
  Spawn positions and velocities are rounded to f32 at each stored partial result (W11). The missile launch angles are
  rounded to f32 before the FSIN/FCOS rotation helpers. `0x2e9d4` uses FSQRT and one division by gun +0x08 (non-zero
  in the slice). No float-to-integer conversion occurs on these paths: `0x25b0c` asks `0x218e8` for mode 1, whose
  branch copies the shooter's speed (then overwritten by gun +0x08); the conversion in `0x218e8`'s mode-0 branch
  (`0x74518` + `FISTP` into frame +0x34) is not reached from them, and `0x2b00c` builds its frame without `0x218e8`.
  The direction table of `0x56b8c` is built once at start-up ([numbers on the movement path](#numbers-on-the-movement-path-p3-0601)). Rounding direction: the P3-02/10
  runtime observation (round to nearest) applies.
- **Comparisons with NaN** (not expected with valid data) fall to the "less" branch of each `FCOMP`.
- **No fixed point or trigonometric tables** on these paths (supports U-009).

Evidence: ignored `local/research/p3-07/weapons/` (`ghidra_scripts/WeapProbe.java`, `probe.sh`, outputs `out/p0`–`out/p32`; `data-check.ts`, `byte28-check.ts` and `chain-check.ts`, whose outputs hold structure and counts only). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Every Confirmed (code) step was read from native instructions, with the decompiler used only to navigate, and callers were checked by raw scans of relative transfers and of 32-bit values.

#### Projectiles, missiles, hits and collisions (P3-07/03)

Q-05 and Q-06. *G* is a missile's guidance block (missile object +0x14), *g* the difficulty group `0x176708` (0–2, through `0x694f0`).

##### H1. Movement modes and their users — Confirmed (code)

- The movement stage `0x221fc` ([movement stage](#movement-stage-and-integration-p3-0601), P3-06) dispatches mode 1 to `0x22818` and mode 2 to `0x2285c`, and after a mode-1 move calls the hit test `0x28450` when the dword mb +0x68 is non-zero (H3). After the walk it calls `0x29670` then `0x29934` (H6).
- `0x21794`(obj, mb, item) writes the mode byte and, per mode: **mode 1** mb +8 := item +0x34 (speed), mb +0x68 := item +0x38 (hit-test flag), velocity mb +0x5C..+0x64 := item R2 × speed; **mode 2** mb +8 := item +0x34, velocity := item +0x38..+0x40, mb +0x68 := item +0x44 (spin angle), byte mb +0x6C := item +0x48 (spin axis). `0x218e8`(src, src mb, mode, item) builds the item from a source pose, adding the source's speed for modes 1 and 2.
- **Users of modes 1 and 2** (the table of [movement stage](#movement-stage-and-integration-p3-0601)): only P3-07's object kinds. Gun projectiles `0x25b0c` take mode 1 with hit-test flag 1; the explosions `0x23ac8` and `0x23fdc` take mode 1 with the hit-test flag explicitly 0, so they drift with the source's speed along its R2 and never hit-test; fragments `0x24ec4` (discriminators 1, 2) and `0x25124` (discriminator 3) take mode 2. Missiles `0x2b00c` fly in mode 0.
- **Mode 1 `0x22818`:** first copies P to mb +0x0C..+0x14 (the pre-move position), then P := P + v × step per axis (v f32, the product and sum in x87, one f32 store per axis). Velocity is constant; no drag, no gravity, no speed field use.
- **Mode 2 `0x2285c`:** P := P + v × step as above, then rotates the rows by the angle mb +0x68 about the axis chosen by byte mb +0x6C: 2 → `0x228cc` (rotates R1 and R2), 1 → `0x22a50` (R0 and R2), any other value → `0x22990` (R0 and R1). **The angle is not multiplied by the step** (the rotation helpers read only their angle argument; p1, p18): fragments spin by a fixed angle **per frame**, so their spin rate depends on the frame rate while their translation does not. This corrects the time-base paragraph that lists `0x2285c` among readers that turn "as rate × step" and calls it a projectile integrator (it is the fragment integrator).

##### H2. Gun projectiles — Confirmed (code)

- **Creation:** `0x25b0c`, in the message loop ([W11](#w11-launch-message-8-and-the-two-constructors--confirmed-code)). In CINF 4037 gun 0 has +0x28 = 0 and guns 1–9 non-zero (local data count), so only gun 0 keeps the shooter's rows. The stale mb +0xF0 of gun shots has no reader on these paths.
- **Update callback `0x259b0` (p2, p22):**
  - State 0 or 1: allocates a 3-word timer {due, first-state-8 flag, …} from pool `0x18642c`, due := sample + gun +0x24, flag := 1, stored at obj +0x14; posts message 0x200 with state 7 (**no wait for the presentation**). So a projectile created in frame N gets state 7 in frame N+1's loop and is moved and hit-tested in frame N+1; its lifetime counts from frame N+1's sample.
  - State 7: when sample ≥ due (unsigned), posts message 0x10000 → dispatcher → `0x25f48` (below); nothing when the pool gave the projectile no timer (Confirmed, code, P3-07/17).
  - State 8 (has hit): at the first state-8 callback (flag ≠ 0) clears the flag and sets due := sample + 0x80; afterwards, when sample ≥ due, posts 0x10000 (nothing when the pool gave the projectile no timer; Confirmed, code, P3-07/17). A hit projectile therefore lingers 0x80 units (2 s) before removal.
  - State 6: frees the timer and posts 0x20 (removal in that frame's loop).
- **`0x25f48` (removal request):** `0x21650` posts a presentation removal item and sets state 6, then releases the shooter reference (mb +0xFC := 0). Removal follows at the next callback (P3-02 timing).
- **Range:** gun +0x0C (= +0x24 × const × +0x08) and +0x10 (its square) are read only by firing/AI decisions (`0x2d894`, `0x2ddbc`, `0x30150`, `0x5dfec`); no in-flight routine reads them. Expiry is by time only.

##### H3. Projectile hit test `0x28450` — Confirmed (code)

Runs inside the movement walk, immediately after the projectile's own mode-1 move (p1, p6, p8).

- **Gate:** projectile state ≥ 7, and for kind `0x200000` exactly 7 (`0x25f30`): projectiles in state 8 are never hit-tested again.
- **Segment:** p0 = mb +0x0C..+0x14 (pre-move), p1 = P (post-move). Excluded object: the shooter handle mb +0xFC (compared as a node pointer; no other identity, side or team test — **friendly fire is possible**).
- **Pass 1 — craft:** walk kinds `0xfffff` (ascending kind bit, allocation order). Filter: +2 = 1 (parked and docked objects excluded), state ≥ 7 (states 4–6 excluded; state 8 objects would pass), not the shooter. The dead flag is not tested here.
  - Coarse test `0x2874c`(p1, p0, target P, bounds = craft record +0x18..+0x2C, i.e. shape +0x08..+0x1C): a **world-axis-aligned box** [P + min, P + max] (not rotated, each corner rounded to f32). Reject when both endpoints are strictly below the min, or both strictly above the max, on any axis. Hit when either endpoint lies strictly inside on all three axes. Otherwise, for each axis with a non-zero component of d = p1 − p0 (f32; the test is on the bit pattern, so ±0 counts as zero), t = (face − p0)/d is computed for the min face then the max face (x, y, z in that order) and stored as f32; a face hits when 0 ≤ t ≤ 1 (inclusive) and the other two coordinates p0 + d × t (f32) lie within [min, max] inclusive (`0x294c0`, `0x29550`, `0x295dc`). This is a proper segment–box test: **a projectile that crosses the box with both endpoints outside is detected**; there is no sphere test and the radius is not read.
  - Refined test, only when the craft record's box count (+0x34) ≠ 0: `0x28efc` transforms p0 and p1 into the target frame (`0x56dc0`: local_k = R_k · (point − P), differences stored as f32, dot products in x87, results f32). If the inner-box flag (shape +0x28) ≠ 0 and **both** endpoints lie strictly inside the inner box (+0x2C..+0x34 min, +0x38..+0x40 max), it misses. Otherwise each box (count > 0, signed) is tested by `0x28b48`: the same both-endpoints-outside reject (strict) and face crossings with t ∈ [0, 1] and inclusive face extents, **without** an endpoint-inside test (a segment wholly inside a box does not hit that box). The smallest t over all faces and boxes is kept (initial 2.0; replaced only when strictly smaller, so ties keep the earlier face/box; face order x-min, x-max, y-min, y-max, z-min, z-max = codes 0, 3, 1, 4, 2, 5).
  - On a hit (and only when the hit made it through the refined test where one applies) with a gun record present, `0x2a40c`(projectile, target, damage = gun +0x1C, impact record or null) is called. The impact record (0x60 bytes) holds the world point F((p1 − p0) × t + p0) and the local point F((l1 − l0) × t + l0) of the two endpoints in the target's frame (the difference and the product stay in x87, unlike d of the face tests, which is stored as f32; one f32 store per component; Confirmed, code, P3-07/17), the target's rows permuted and negated by the face code, and a face basis.
  - **Order and multiple targets:** the walk stops at the first object whose test (coarse, then refined) passes: the first in kind-bit and allocation order, **not the nearest**. Within one target the refined test does take the nearest entry point. Exactly one target is affected per projectile per frame. A coarse hit with no gun record still stops the walk without damage.
- **Pass 2 — fragments** (only when pass 1 found nothing): walk kind `0x1000000` with +2 = 1, state ≥ 7, DEBRIS record (obj +0x1C) ≠ 0 and durability obj +0xD0 > 0 (signed). Same coarse test with the DEBRIS bounds (record +0x20) and refined test with the DEBRIS shape (record +0x18) when its box count (+0x3C) ≠ 0. On a hit with a gun record:
  - if DEBRIS +0x5C = 0, one rand; when (rand AND 3) = 0 the projectile ricochets (`0x25dc4`, H4); otherwise, and always when +0x5C ≠ 0 (no draw), the projectile is removed (`0x25f48`);
  - obj +0xD0 −= gun +0x1C (i32); when the result ≤ 0, `0x24a6c` marks the fragment shot down (H4). No damage handler, no hit item, no attacker record for fragments.
  - The removal call is at `0x286fd` with EAX = the projectile (the stack slot that `0x285e5` passes to `0x2a40c`). *Runtime* (Confirmed, P3-07/39, run `a39-h4-01`, configuration as in [B-009](../behavior/B-009-combat-rules.md#39-的连续窗口补采2026-10-12)): a tracked player shot in state 7, before its due, stopped there with EAX = its node and had left by the next frame read; no stop at `0x2a40c` preceded it, and no state-6 frame read appears: in that frame the frame-site read came before the walk, and the node was already freed at the next read.
- **Timing consequences:** craft (bits 0–19) and missiles (bit 20) have already moved in this walk, so targets are tested at their post-move positions and treated as static during the projectile's segment; projectiles created earlier (allocation order) have already moved and tested; fragments (bit 24) are tested at their previous-frame positions. Missiles, explosions and other projectiles are never targets.
- **Callers:** `0x28450` ← only `0x221fc` (`0x2225d`); `0x2874c` and `0x28efc` ← only `0x28450` (p7).

##### H4. Impact, ricochet, attribution and fragment kills — Confirmed (code)

- **`0x2a40c`(source, victim, damage, impact)** (p5, p9). Source = a gun projectile (from `0x28450`) or a missile (from `0x2b408`). It does **nothing at all** when the victim handle is invalid or the victim's dead flag +0xD8 is set: in particular a gun projectile that strikes a dead object is neither removed nor turned into a ricochet and keeps flying; because `0x28450` has already counted that object as its hit, the walk ends there, so no object behind the dead one is tested in that frame, and the same dead object can be selected again in later frames while the segment overlaps it. Otherwise, in order:
  1. Attacker kind := the kind of the owner mb +0xFC when that handle is valid, else **`0x93780`** (the enemy mask, used as a kind value). If the owner is valid and has kind 1: player-state +0x44 += 1 when the source is a missile, else +0x3C += 1 (Likely hit statistics).
  2. If the owner is valid: `0x52a1c`(owner, victim, sample) sets owner +0x9C := counted reference to the victim and +0xA0 := sample; `0x52a50`(victim, owner, sample) sets victim +0xA4 := counted reference to the owner and +0xA8 := sample (last victim / last attacker records; consumers are AI, P3-08).
  3. Posts a type-4 item on the victim (byte +8 = 2, +9 = 4; +0x0C = 1 when the victim's +0x2C ≤ 0 **before** this damage, else 0 and +0x10 := a pooled copy of the impact record or 0) — the hit event of audio and the hit effect. (+0x2C is the shield, [D1](#d1-object-fields-of-this-section--confirmed-code); the dead flag is +0xD8.)
  4. r := `0x2a694`(attacker kind, source, victim, damage). `0x2a694` returns 1 only on its path where `0x30c60` leaves no residual damage ([D2](#d2-damage-entry-0x2a694eax-attackerkind-edx-source-ebx-victim-ecx-damage--confirmed-code)); 0 otherwise (including destruction).
  5. If r = 0 and victim +0xD0 ≥ 0 and victim kind ≠ 1: `0x254fc` (a no-op returning 0).
  6. If r ≠ 0, the source is a gun projectile, and (victim kind ≠ 1 or player-state view mode +0x28 = 0x11): ricochet `0x25dc4`(victim, projectile, impact). Otherwise a gun projectile is removed (`0x25f48`). Missiles are not changed here.
  - Damage reaches `0x2a694` unscaled: no TABL 4003 scale and no difficulty factor on this path.
  - **Attribution after the shooter is gone:** not retained. The owner handle is a counted reference, but once the owner has been removed the node is invalid and the attacker kind becomes `0x93780`, so `0x2a694` reports "destroyed otherwise" and no kill credit. The player object is never removed by the loss sequence (it is re-initialised), so the player's own shots keep their attribution.
- **Ricochet `0x25dc4`(struck, projectile, impact)** (p9): projectile state := 8; projectile P := the impact world point, or the struck object's P when there is none; one rand: odd → `0x22a50`, even → `0x228cc`, each rotating by angle = rand × (1/32767) × 1.2217305 + 2.5307275 rad (a second draw; 145°–215°); then velocity mb +0x5C, +0x60, +0x64 := (rand × (1/32767) × 82.5 + 55) × R2 component, one draw per axis. **5 rand calls** per ricochet. The projectile keeps moving in mode 1 but is never hit-tested again (state 8) and is removed 0x80 units after its next callback.
- **Fragment shot down:** `0x24a6c` (valid handle, block and timer required, else −1 and no effect) sets byte mb +0xF6 := 1 and timer +8 := 1. The fragment callback `0x24ac4` (state 7) then finds the expiry (1 ≤ sample) and posts message 0x10000; the dispatcher passes it to `0x256e4`, which, because mb +0xF6 = 1, calls the explosion constructor `0x23ac8` on the fragment (before and instead of the escape-pod rescue branch). So **a shot-down fragment is not removed directly: it explodes one frame later**. The escape pod (player part 0) has no DEBRIS record (craft §4.1) and is never a projectile target.

##### H5. Missiles — Confirmed (code) unless marked

- **Launch:** `0x2b00c`, in the message loop ([W11](#w11-launch-message-8-and-the-two-constructors--confirmed-code)), which takes the shooter's target when message 8 is handled, after any same-frame target change ([T3](#t3-entry-points-contexts-and-timing-confirmed-code)), and installs `0x2aa40` (unguided, or launch byte below 2) or `0x2ab00` (homing). In CINF 4037 only missile type 0 has the launch dispersion (+0x20 ≠ 0).
- **Callbacks:** both, in state 0 or 1, allocate a guidance block G once (0x1C bytes for `0x2aa40`; 0x188 for `0x2ab00`, whose +0x1C is an AI controller) with G+0 := missile +0x44, G+4 := +0x48, G+8 := +0x50, G+0x0C := +0x54, G+0x10 := +0x58, byte G+0x14 := 0 (phase), G+0x18 := 0, and post state 7 at once (no presentation wait). `0x2aa40` also sets mb +0x104 := 0; **`0x2ab00` does not**, and `0x52324`/`0x21794` do not clear +0x104, so a homing missile's +0x104 holds whatever the reused auxiliary slot last contained until a contact writes it (an explosion's constructor also writes that offset). In state 7, `0x2aa40` calls `0x2ac10`(missile, G, EBX = 0); `0x2ab00` first runs the AI controller update `0x5dcd4`(G+0x1C) and then `0x2ac10`(missile, G, EBX = G+0x1C). Other states go to the generic callback `0x20ae4` (`0x2ab00` releases the controller with `0x5ddd4` in state 6). In states 0 and 1, `0x2ab00` posts state 7 also when G already exists (G is made once); in state 6 it calls `0x5ddd4` (when G exists) before the generic callback `0x20ae4`, so the handler's mode-2 block is posted before the leave (Confirmed, code, P3-07/20).
- **Guidance phases `0x2ac10`** (jump table `0x2abfc`: phases 0–4, p10, p11):
  - 0 (first state-7 callback): G+0 += sample, G+4 += sample (relative → absolute). Unguided (EBX = 0): `0x21fd8` with a control block of full throttle and no turn — the missile flies straight at its maximum speed. The block, passed straight to `0x21fd8`, is scale 1.0, the three rows with clear, set and value 0, speed flag 1 and factor 1.0, in the word layout given under *Steering* below (Confirmed, code, P3-07/32). Homing: no control here. → phase 1.
  - 1: when sample > G+4 (unsigned, strict) → phase 2 (arming delay).
  - 2: when sample > G+0 (lifetime over): mb +0xF8 := 0, post 0x10000 (fizzle), and if player-state +0x8C is the missile's owner, `0x3119c`(missile, 0); the phase stays 2. Else when sample > G+0x18: fuse check `0x2adac`, then G+0x18 := sample + G+0x10 when the f32 at [EBX + 0x2C] ≥ 150.0, else sample + (G+0x10 SAR 1). For homing missiles [EBX+0x2C] is the AI controller's +0x2C, the distance from the missile to its target's position (Confirmed, `0x5c8b0`). **For unguided missiles EBX = 0, so the f32 read is at linear address 0x2C** — under DOS/4GW (flat DS, base 0) the real-mode interrupt vector of INT 0Bh; its value, and so the check interval of every missile on the `0x2aa40` path, depends on the machine's vector table. Read as an f32 (`FCOMP` with 150.0, then `SAHF`/`JNC`), vectors 0x4316:0000 (exactly 150.0) to 0x7F80:0000 (+∞) select the full interval. The NaN patterns 0x7F80:0001–0x7FFF:FFFF and 0xFF80:0001–0xFFFF:FFFF make the compare signal the invalid-operation exception, which the start-up code unmasks ([x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202)); what follows was not traced (Unconfirmed). Every other vector is below 150.0 (−0 and −∞ included) and selects the half interval.
    - *Runtime reading* (Confirmed, runtime, for the configuration below only; runs v-01 and v-02 of [P3-07/09](../../plan/p3/07/subtasks/09-original-pilot-runs.md#完成证据), recorded by P3-07/31): the u32 at linear 0x2C was 0xF000CE80, the vector F000:CE80 in the BIOS segment (Likely the emulator BIOS's own handler), as an f32 about −1.5945 × 10²⁹: finite and below 150.0, so **in this configuration the `0x2aa40` path re-arms the fuse check at sample + (G+0x10 SAR 1)**. Each run read it at three in-flight pauses (two flight keyboard polls `0x262c3` and one player energy update `0x30742`; DS base 0 at every stop) and all six reads were equal; the two runs started from different clock states. The re-armed fuse deadlines of unguided missiles in the other pilot runs agree: 7 per-frame re-arms in f-01, all at the half interval, and in c-01 and m-01 24 per-second readings whose next check was never more than half an interval ahead.
    - *Run identity:* baseline `manifest-b9bfecb3bf772fbf`, EXE SHA-256 `c1e0f456…`; DOSBox-X fixed 40000 cycles, core normal, cputype pentium, machine svga_s3, memsize 16; game settings `STARTUP_PRACTICE=FALSE` and `CURR_LEVEL=100 19`; campaign mission 0 (SCEN 3019, group 0 / slot 1), raw difficulty 19, wingman selector 1; recipe `p3-07-pilot-v` (`sha256:6f4e85a9…`), tool sources `sha256:043f2a98…` (v-01) and `sha256:62041c67…` (v-02). Both runs `complete`, all 42 required samples qualified, with file protection and process reaping passed; the only inputs were the recipe's BIOS keyboard-buffer keys of the entry route (title Enter, options Enter, briefing Esc), none from the host.
    - *Applicability:* one entry route and one emulator, BIOS and configuration were measured. Another BIOS or emulator, or a resident driver that hooks INT 0Bh, can install a different vector and so change the branch (ranges above). U-021 (cycles) is not frozen; the reading is recorded for the measured configuration only.
  - 3: when sample > G+0x0C: mb +0xF8 := 1, post 0x10000 (detonate) → phase 4.
  - 4: nothing.
- **Fuse `0x2adac`(missile, G)** (p10; collision helper §4.3): walks kinds `0xfffff` with **no activity, state, dead-flag or Warp filter** (parked, docked, destroyed and Warping craft can trigger it), and stops at the first trigger. Both tests use d² := `0x56b50`(missile P, craft P) stored as f32, the value `0x29bf4` also computes, see [H7](#h7-point-tests--confirmed-code) (Confirmed, code, P3-07/32):
  - *Contact:* only for craft whose record has boxes (+0x34 ≠ 0): d² < radius² (+0x14), strict; transform the missile position into the craft frame; if the inner flag is set and the point is strictly inside the inner box → no contact; else the point strictly inside any box → phase += 1 (to 3), G+0x0C := 0 (detonation at the next callback), mb +0x104 := craft (uncounted). This is a **point** test at check times only, so a fast missile can pass a box between checks. The launcher is not excluded.
  - *Proximity* (craft without contact): owner L = mb +0xFC and target t = missile +0x8C (0 when invalid). When L ≠ 0 and the craft is on L's side (L kind in `0x6c87f` ? craft kind in `0x6c07f` : craft kind in `0x93f80`) and the craft is not t, it is skipped. Otherwise when d² < G+8 (= (missile +0x4C)², strict): G+0x0C += sample, phase += 1 (to 3); detonation at the first callback whose sample is **strictly greater** than the trigger sample + missile +0x54. The side test is by kind masks, not by identity: the launcher is skipped only because its own kind is normally in the side mask, and the masks differ (`0x6c87f` contains bit 11, `0x800`, which `0x6c07f` lacks), so a launcher of kind `0x800` would not skip itself or other `0x800` craft.
- **Detonation `0x2b408`** (message 0x10000 on a missile, in the message loop, p10): when mb +0xF8 = 1: camera hook `0x3119c`(missile, 1) if the owner is the player-state's +0x8C object; explosion `0x23ac8`(missile) (the missile becomes a destroyed source); then for every object returned by `0x5c490`(mask `0xfffff`: +2 ≠ 0 — **docked included**, parked excluded — state ≥ 7, dead flag clear, Warp +0xCC = 0), with Euclidean distance d (FSQRT, f32):
  - d is taken as 0 for the object equal to mb +0x104 (the contact object; on homing missiles possibly a stale value, see above);
  - damage = 0 when d > r1 (+0x64); D = +0x5C when d < r0 (+0x60); otherwise trunc(D × (1 − (d − r0)/(r1 − r0))) (x87, `FILD` D, chop through `0x74518`);
  - when damage > 0 (signed): `0x2b628` (hit shake on the victim's movement block for kinds outside `0xf9c7c`, **6 rand calls**, fields consumed by mode 0/3 — P3-06; arithmetic below) and `0x2a40c`(missile, victim, damage, no impact).
    - *Shake* `0x2b628`(missile, missile mb, victim, damage) (Confirmed, code, P3-07/32; F and D are the rounding points of the [P3-06 notation](#flight-motion-controls-speed-parking-and-take-off-p3-06)): nothing, and no draw, when the victim's kind is in `0xf9c7c`. Otherwise u := D(damage × f64 `0x170f20` (0.0014285714285714286, 1/700)), A := F(u) and B := F(D(u × f64 `0x170f28` (0.7142857142857143, 5/7))); when D(u × 5/7), before that store, is below f64 `0x170f30` (0.0872664638888889, about 5°), or the compare is unordered, B := the f32 immediate `0x3db2b8c3` instead, which is F of that f64. Impulse: the victim's mb +0x1C–+0x24 := the missile's row 3 (bit copies), +0x18 := 1 and +0x28 := F(D(the missile's speed mb +8 × f64 `0x170f18` (0.0125))). Per row k = 1, 2, 3, two draws: rate_k := F(D(D(D(rand × f32 `0x170f38` (1/32767)) × D(A − B)) + B)) at +0x38/+0x3C/+0x40 and decay_k := the f32 immediate `0x3ec90fdb` (π/8) at +0x44/+0x48/+0x4C; when the second draw has bit 1 set, the sign bits of both flip. Then end_k := F(D(D(D(rate_k ÷ decay_k) + t) + f64 `0x170f3c` (−0.5))) at +0x50/+0x54/+0x58, and the active flag +0x2C/+0x30/+0x34 := 1 when end_k > t (ordered compare), else 0, with t the f32 mission time `0x18641c`. Derived: a row turns only when |rate_k| exceeds about π/16 (decay ÷ 2), so only for damage above about 137 (A > π/16); a weaker blast sets only the impulse, clears the three active flags and still draws 6 times.
  - **No exclusion of the launcher, the launcher's side or the player**: the blast damages every eligible craft in range, in walk order. In all 24 CINF r0 > 0 and r0 < r1 (local data count), so the contact object always takes the full D and no division by zero is reachable.
  - When mb +0xF8 ≠ 1 (lifetime fizzle): `0x2b590` releases the owner reference, `0x21650` (presentation removal, state 6) and clears missile +0x8C; no explosion, no damage.
- **Homing steering — Confirmed (code), native `out/p28.txt`–`out/p33.txt`.** `0x2ab00` installs built-in AI program record 1 (`0x17634c`, missile +0x18 = 1) or record 2 (`0x1763a0`, otherwise) with `0x5dc0c` (ai.md §3.3 lists `0x2ab94` as this installer); their handlers (record +0x18) are `0x60aa0` and `0x60b84`. The missile path uses only the following part of the shared AI library; the interpreter and scripts are not involved.
  - *Install* (`0x5dc0c`, in the missile's first callback, handler mode 0): the 0x16C-byte controller C (= G+0x1C) is zeroed; C+0xF4 := record +0x14 (update period), C+0xF8 := record, C+0xFC := handler; limits C+0x104 := F(D(D(record +0x24 × f64 `0x17232c`) × f64 `0x172334`)) and C+0x100 := its negation, where the constants are 3.1415927 and 0.005555555555555555, not the nearest doubles of π and 1/180, so for some whole-degree values (the first is 5°) C+0x104 differs from F(+0x24 × π ÷ 180); C+0x10C and C+0x108 likewise from record +0x28; C+0x114 := a bit copy of record +0x2C and C+0x110 := its negation (Confirmed, code, P3-07/32); C+0x118 := record +0x30; the steering block S = C+4 is set by `0x5c530` (0xEC bytes zeroed; S+0 missile, S+4 → C+0x100, S+8 body record, byte S+0x44 := 2, byte S+0x60 := 0, then `0x5c768`(1.0, 1.0, 0)); C+0x138 := 0 (no AI firing).
  - *Handler `0x60b84`*: returns 0 with no library call when missile +0x8C is 0 or invalid (`0x60b94`–`0x60bab`); a missile whose target is already gone at install therefore gets no control at all (not even full throttle) and keeps its launch speed. In mode 0 it then: `0x5c584`(target, S, −1.0) — S+0x0C := valid, S+0x10 := target, missile +0x8C := target (counted), S+0x1C.. := target P, S+0x30 := 0, S+0x28 := |target P − missile P| (FSQRT, f32; the same value the update below stores there again), `0x5dab0` (S+0x48 := target radius + 80.0; unused on this path), missile byte +0x118 := 0; by launch byte (mb +0x100): 4 → `0x5c768`(1.0, 1.0, 0); 3 → (1.0, F(0.65), 0) and C+0xF4 ×= 2; other → (1.0, F(0.2), 0) and C+0xF4 ×= 5 (f32 arguments; `0x5c768` stores the speed fraction at S+0xC8, the **turn fraction at S+0xCC**, and S+0xD0 := 1, which disables the roll-matching branch below); `0x5d41c`(S, 1.0) posts message 0x40000 with the throttle-only control block {scale 0, the three rows with clear, set and value 0, speed flag 1, factor F(1.0 × S+0xC8)} for full throttle (Confirmed, code, P3-07/32); `0x5c878`(S, 3, 0) selects lead mode 3 with lead constant S+0x64 := 0. Every mode (0, 1 update, 2 removal) then runs the update below and sets the deadline C+0xF0 (*Update scheduling*).
  - *Update scheduling* (`0x5dcd4`, from `0x2ab00` each state-7 callback): calls the handler in mode 1 only when C+0xF0 < sample (unsigned, strict); its trigger loop passes 0 to `0x2d578` for the missile (no weapon state) and `0x2dad0`/`0x5dfec` are not reached (C+0x140 and C+0x138 are 0). When the handler returns early (target invalid) the deadline is not advanced, so it is retried every frame. After every update (all modes) the handler sets C+0xF0 from the controller distance C+0x2C = S+0x28: sample + period when the distance ≥ 250.0; (sample + period) SHR 1 when 150.0 ≤ distance < 250.0; (sample + period) SHR 2 when the distance is below 150.0 or the compare is unordered. The shift applies to the sum, not to the period (Confirmed, code, P3-07/32).
  - *Target point* (`0x5c8b0`, at most once per sample, S+0x14): re-reads the target from missile +0x8C; if invalid it clears missile +0x8C and returns 0. Otherwise target point := target P; S+0x28 := distance to that point (f32); lead mode 3: v := the missile's speed (mb +8), w := S+0x2C := the target's speed, lead := F(D(D(D(d ÷ v) + S+0x64) × w)) with d = S+0x28 (v, w and d all f32) when v ≠ ±0, else 0; each offset_i := F(D(R2_i × lead)) (target R2) is stored before the sum, and target point_i := F(D(P_i + offset_i)) (Confirmed, code, P3-07/32). Local vector L := missile rows · (target point − missile P) (`0x56dc0`); flags S+0x68: bit 0 L.x > 0, bit 1 L.y > 0, bit 2 L.z > 0 (target ahead).
  - *Steering* (`0x5cd1c`, only when S+0x0C ≠ 0): control block CB (12 words at S+0x90: the scale, then clear, set and value for rows 1, 2 and 3, then the speed flag and the speed factor) := {scale S+0xCC, 1, 1, fA, 1, 1, fB, 1, 0, 0, 0, 0}: rows 1 and 2 cleared and set, row 3 cleared only, speed flag 0; the two words this routine does not write (row 3's value and the speed factor) are 0 on the missile path. If L.z is ±0: fA := +sat, fB := −sat (angles π/2). Otherwise angle A := atan2(L.y, L.z) and angle B := atan2(L.x, L.z) (x87 FPATAN through `0x85a8b`, which swaps the operands first), stored as f32 at S+0x88 and S+0x8C; each fraction := −sat when the unrounded angle < −a (an unordered compare too), else +sat when its f32 store > +a, else F(D(F(angle) ÷ D(a − (−a)))), with a = C+0x104, −a = C+0x100, sat = C+0x114 and −sat = C+0x110 from *Install* (Confirmed, code, P3-07/32); angles within ±(record +0x28) set bits of S+0xC0, which the missile path does not read. The roll-matching tail is skipped (S+0xD0 = 1).
  - *Output* (`0x5d014`): the noise routines `0x5d490` (enabled by S+0xE0) and `0x5d6a8` (by S+0xD4 and CB[10]) do nothing for missiles — those words are only zeroed for a missile controller and no writer was found in the code missiles reach (offset scans, `out/p30.txt`, `out/p31.txt`; Likely, since computed stores are not excluded) — then CB is posted as message 0x40000. The dispatcher applies it in the same frame's loop, before `0x221fc`, through the mode-0 control setter `0x21fd8`; how that setter turns the two fractions and the scale into turn rates, and the mode-0 integration, are P3-06's.
  - *Heat seeker extra* (`0x60aa0`, record 1): after a successful `0x60b84` in modes 0 and 1, when the controller distance > 120.0 (an f32 constant; ordered compare, so an unordered distance fails) and (missile R2 · target R2 < 0, or S+0x68 bit 2 is clear), one rand; the dot product is summed in double as (y·y′ + z·z′) + x·x′, and an unordered result goes on to the flag test (Confirmed, code, P3-07/32). When rand mod 2 = 0 (signed `IDIV`), `0x5d0ec` posts CB {S+0xCC, 0, 1, 0.5, 0, 1, 0, 0, 1, 0.5, 1, 1.0 × S+0xC8} (channel A half, channel B zero rate, roll half, full throttle) and C+0xF0 := sample + 4 × period. This is the only random draw on the homing path.
  - The update runs inside the missile's own update callback (`0x20938` walk); its controls take effect in that frame's loop, so a homing missile reacts to positions from the end of the previous frame.
- **Missile record +0x28/+0x2C** (lock cosine and angle) are not read by any in-flight routine examined (`0x2aa40`, `0x2ab00`, `0x2ac10`, `0x2adac`, `0x2b408`, `0x60aa0`, `0x60b84`); their readers are the firing decisions (craft §3.4). The in-flight "lock" is the inherited target plus the launch byte.

##### H6. Collision passes — Confirmed (code) (collision helper, spot-checked)

- **Callers and timing:** `0x221fc` is the only caller of both, back to back after the movement walk, so both use this frame's post-move positions; neither reads the pre-move position. Neither writes positions or rows: responses go into movement-block fields that the integrators consume from the next frame on (overlaps usually persist for several frames and repeat damage).
- **`0x29670` — player against others.** Gate: dword `0x174b30` ≠ 0 (initialised 1; only otherwise referenced from a pointer table at `0x175138`). The player (player-state +0x8C) must not be docked (+2 ≠ 3) and must be in state ≥ 7; **its dead flag, Warp flag and the destruction view are not tested** (a destroyed player in its 0xC0-unit delay still collides and pushes, but takes no damage because `0x2a5fc` ignores dead victims).
  - *Craft:* kinds `0xffffe` with +2 = 1 and state ≥ 7. Detection `0x29bf4`: the **player's centre** in the craft's shape (H7); the craft's centre is never tested against the player's shape. On contact: large := craft kind in `0xf9c7c`; raw := `0x2a12c`(player, craft) if large, else `0x29eb8`(player, craft); dmg := raw ÷ (3 − g) (signed `IDIV`, after the helper's truncation); `0x2a5fc`(player, dmg); if large, dmg SAR 1; `0x2a5fc`(craft, dmg); `0x27edc`(0) (Likely cancels the player's autopilot at its next update). Every overlapping craft is processed (no early exit), each with its own response, damages and 6 rand calls. For every eligible craft, hit or not, `0x529e4` sets craft +0x94 := the player (counted) and +0x98 := d² (f32).
  - *Fragments:* kind `0x1000000` with +2 = 1, state ≥ 7, DEBRIS record ≠ 0, +0xD0 > 0. Detection `0x29d58` (player's centre in the fragment's DEBRIS shape). With f = DEBRIS +0x5C: f = 0 → raw := `0x2a12c`(player, fragment); f ≠ 0 → raw := `0x29eb8`(player, fragment) SAR 1. dmg := raw ÷ (3 − g). The player takes dmg when f = 0, or when f ≠ 0 and a counter c < g × 2 + 2 (strict); c (a local, **reset every frame**, shared across all fragments) increments on every f ≠ 0 contact, including those over the limit. The fragment's +0xD0 −= dmg on every contact; ≤ 0 → `0x24a6c` (H4).
- **`0x29934` — others against others.** Gate `0x174b30`. A persistent array (`0x174b34`, cleared at the end) holds group A = kinds `0x382` (2, 0x80, 0x100, 0x200), then group B = kinds `0xffc7c`, both with +2 = 1 and state ≥ 7 (no dead or Warp test; player, projectiles, missiles, explosions and fragments are in neither). Pairs: A×A with i < j, and every A×B; **B×B pairs are never tested**. In each pair the A member's centre is tested against the other's shape (`0x29bf4`) only, so A×A detection depends on array order. Damage as for player–craft: dmg = raw ÷ (3 − g) to the A member, halved (SAR 1) to the other when it is large; no autopilot call. The A member's +0x94/+0x98 are replaced when +0x94 is 0 or the new d² is strictly smaller.
- **Responses:** `0x29eb8` (object 2 not large, or an f ≠ 0 fragment): both objects get a knock (the other's R2 as direction, the other's speed, and speed₁ × 2.0 for object 2) and an opposite random tumble; raw = 2 × trunc(X) + 150 with X = |R2₁·R2₂ − 1| × (speed₁ + speed₂). `0x2a12c` (large or f = 0 fragment): only object 1 bounces (direction R2₂ + a reflection term computed in place with an aliasing quirk; speed speed₁ × 1.2); raw = 2 × trunc((speed₁ + speed₂) × 2.0) + 150. Each response makes **6 rand calls** (per axis: magnitude then sign bit 1). Constants: 0.01 / 0.0125, ≈1/140, ≈5° floor, π/4 decay, −0.5 s, 1.2, 2.0, 30/s² knock decay in mode 0. Mode 0 consumes knock and tumble, mode 3 the tumble, mode 2 (fragments) neither. Arithmetic (Confirmed, code; the native listing of P3-07/03, read for P3-07/19): X and Y stay unrounded in the x87 register for hi and lo; only the raw damage reads their f32 store. hi = F(X × 0.01) (`0x2a12c`: F(Y × 0.0125)); lo = F(X × c) with c the f64 `0x3F7D41D41D41D41E` (one ulp above 1/140), replaced by the f32 `0x3DB2B8C3` when the unrounded X × c is below the f64 0.0872664638888889 or unordered. For the axes about rows 1, 2 and 3 in turn (block +0x38/+0x44, +0x3C/+0x48, +0x40/+0x4C): rate = F(rand × C × (hi − lo) + lo) with C the f32 1/32767, decay = the f32 `0x3F490FDB` (π/4); the next rand with bit 1 set flips both signs. Then each end = F((rate ÷ decay + t) + (−0.5)) (+0x50/+0x54/+0x58) and each flag = end > t (`SETA`: strict, false when unordered); `0x29eb8` copies the negated rates and decays, the ends and the flags to object 2. While lo is at its floor, hi < 0.123, so rate ÷ decay < 0.5 and no axis turns. In `0x2a12c` the offset P₁ − P₂ is stored f32 per component before `0x56aa8`; with v = −R2₁, w_x = F((d × 2.0) × n_x) is stored over v_x, then w_y and w_z likewise, each d = (n_y v_y + n_z v_z) + n_x v_x over v as already overwritten; the knock direction is F(R2₂ + w) per component and its speed F(speed₁ × 1.2). raw = 2 × trunc(F(X)) + 150 through `0x74518` and `FISTP` (a truncation beyond i32 raises the unmasked invalid-operation exception), then two wrapping integer additions.
- **`0x2a5fc`(victim, dmg)** applies collision damage without an attacker and without kill credit ([D5](#d5-other-entries-into-the-damage-rule--confirmed-code)).

##### H7. Point tests — Confirmed (code)

- `0x29bf4` (craft shape at record +0x10) and `0x29d58` (DEBRIS shape at record +0x18): sphere first, **d² ≤ r² (non-strict)**; box count 0 → hit on the sphere alone; otherwise the point in the target frame (`0x56dc0`), strict inner-box exclusion when the flag is set, then hit at the first box that contains it strictly; count ≤ 0 → miss. `0x29bf4` rounds d² to f32 before comparing and outputs it; `0x29d58` compares at x87 precision. Neither reads the bounds or the radius itself. d² = (dy·f32(dy) + dx·f32(dx)) + dz·f32(dz): each difference in double times its `f32` copy, the x term included, unlike `0x637e4` ([T10](#t10-numbers-on-these-paths-confirmed-code)) (P3-07/12; evidence ignored `local/research/p3-07/rule-data/`, `out/p4`, native).
- `0x2adac` (missile fuse): strict d² < r², only for records with boxes (H5).
- `0x2874c`/`0x28b48` (projectiles): segment tests (H3).

##### H8. Numbers on these paths — Confirmed (code) unless marked

- **Storage:** positions, rows, velocities, speeds, shape radii/boxes, impact records, distances, response fields: f32. Damage, durability +0xD0, box counts, flags, DEBRIS +0x5C, group, counters, missile damage +0x5C: i32 (signed compares). Clock values and guidance times: u32 (unsigned compares: projectile expiry `≥`, guidance `>`), with G+0x10 halved by `SAR` (signed) and the AI deadline halved/quartered by `SHR` (unsigned).
- **Arithmetic:** x87 at the start-up control word (53-bit); each f32 store rounds under the control word in effect. For the rounding direction these paths inherit the P3-02/10 runtime observation (round to nearest at every observed placement; the chop inference from the renderer's `FLDCW` sites is contradicted at runtime and its cause is open, U-009). Products of two f32 values are exact in double; sums then round to double and again to f32 at the store.
- **Integer conversion:** only through `0x74518` (chop) before `FISTP`: missile falloff damage, collision raw damage. Divisions: `IDIV` by (3 − g) ∈ {3, 2, 1}; halving by `SAR 1` (floor; equal to truncation for non-negative values). Overflow: collision raw damage overflows i32 only for X ≥ 2^30 (Unconfirmed reachability); `0x2a12c`'s raw is below 150 or negative if speed₁ + speed₂ < 0 (whether speeds can be negative is P3-06's).
- **Square roots and trigonometry:** FSQRT in `0x56b14` (missile blast distance, AI library) and `0x56aa8` (bounce normal); squared distances elsewhere. FSIN/FCOS only through the rotation helpers `0x228cc`, `0x22a50`, `0x22990` (fragment spin, ricochet, missile dispersion, tumble consumers). On these paths FPATAN occurs only in the AI steering library (`0x5cd1c` → `0x85a8b`, operands swapped, so atan2(L.y, L.z) and atan2(L.x, L.z); the image's other FPATAN users are in [N1](#n1-summary--confirmed-code)), reached by homing missiles; FSQRT also for the homing distance. No tables.
- **Random draws on these paths (all from the one C-library generator):** ricochet 5; fragment hit with DEBRIS +0x5C = 0: 1 (before the ricochet's 5 when it ricochets); missile launch with dispersion 3; missile blast 6 per damaged victim of a kind outside `0xf9c7c` (none for kinds inside it); collision response 6 per contact; heat-seeker lock-break 1 per eligible update; the homing path's only draw is the heat-seeker lock-break (the AI library's noise routines are disabled for missiles, Likely).
- **Frame-step dependence:** translation in modes 1 and 2 scales with the step; mode-2 spin and the ricochet angles do not. Mode 1 spawn offsets use the shooter's speed × step of the creation frame.

Evidence: ignored `local/research/p3-07/motion-hit/` (`ghidra_scripts/MotionHitProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p33.txt`; the collision probes and notes in `collision/`, spot-checked natively at `0x2979d`–`0x297e0` and `0x298af`–`0x29917`; `data-checks.ts` with `out/data-checks.json`, booleans and counts only). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Every Confirmed (code) step was read from native instructions, with the decompiler used only to navigate, and callers were checked by raw scans of relative transfers and of 32-bit values.

#### Damage, subsystems and energy (P3-07/04)

Q-07 and Q-08. *E block* is object +0x20–+0x47; `c54` and the like are fields of the object's craft record (object +0x1C).

##### D1. Object fields of this section — Confirmed (code)

| Offset | Type | Meaning | Writers (readers) |
|---|---|---|---|
| +0x20 | u32 | Clock of the last energy update | `0x3060c`, `0x3071c`, `0x30994` |
| +0x24 | u32 | Clock of the next energy update (due when clock ≥ it, unsigned) | `0x3060c`, `0x3071c`, `0x30994`; also `0x30150` (parked engagement, sets it to the clock for both objects, [E3](#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code)) |
| +0x28 | i32 | Energy | `0x3060c`, energy updates, `0x39820` (full repair) |
| +0x2C | i32 | Shield | `0x3060c`, `0x30c60`, energy updates |
| +0x30 | i32 | Gun charge (spent by `0x30cec`, [W6](#w6-gun-shot-0x2e5e8handle-clock-state--confirmed-code)) | `0x3060c`, `0x3071c` |
| +0x34 | i32 | Shield recharge level L1, 0–3 (index into craft +0x64[]) | `0x3060c` (player 1), `0x30b20` |
| +0x38 | i32 | Charge recharge level L2, 0–3 (index into craft +0x78[]) | `0x3060c` (player 2), `0x30bc0` |
| +0x3C | i32 | Spare power E = c58 − (c64[L1] + c78[L2]) | `0x3060c`, `0x30b20`, `0x30bc0` (read by `0x30e0c`, HUD) |
| +0x40 | i32 | Power needed for full speed T = trunc(c B8) × c88 ÷ 1000 | `0x3060c` (read by `0x30e0c`, HUD) |
| +0x44 | i32 | Energy-page redraw flag (set to 1) | `0x3060c`, energy updates, `0x30b20`/`0x30bc0`, `0x30c60` and `0x30cec` (player only); cleared by `0x4d800` after drawing. No rule reader found (Likely display only) |
| +0x78 | f32 | Maximum speed | `0x30e0c` (P3-06) |
| +0xD0 | i32 | Hull | instantiation, `0x2a830`, `0x39820` (= c9C), cheat key (C3) |
| +0xD8 | i32 | Dead flag | `0x2a694`, dispatcher kill paths; cleared by the rescue |
| +0xE8, +0xEC | u32 ×2 | 19 two-bit subsystem fields (D6) | `0x52a84` |
| +0xF0 | i32 | Status-display redraw flag | allocator (1), `0x2a830` (1), `0x4cd68` (1); `0x4d0e0` reads and clears it (D9) |

The allocator `0x520d4` zeroes +0x20…+0x47 (memset 0x28 bytes), +0xD0, +0xE8, +0xEC, +0xD8 and sets +0xF0 = 1.
So objects other than the player keep L1 = L2 = 0; only the player's keys change the levels.

##### D2. Damage entry `0x2a694(EAX attackerKind, EDX source, EBX victim, ECX damage)` — Confirmed (code)

1. **Gates, in order** (each returns 0 with no change at all): victim dead flag +0xD8 ≠ 0; ps non-null **and**
   ps +0x90 (destruction view follows an object) ≠ 0 **and** victim = ps +0x8C (the player); typed-cheat flag
   `0x174ed8` ≠ 0 and victim kind = 1. Only the player is protected by the view gate.
2. rem = `0x30c60`(victim, damage) (D3).
3. When attackerKind ≠ 0: `0x3c208`(attackerKind, source, victim, damage) — communications reaction
   ([C2](#c2-communications-reactions-0x3c208-and-0x3c0f4--confirmed-code)). It can draw rand (D12).
4. rem = 0 → `0x2a830`(victim, source, 0, noAttacker) and **return 1**. Otherwise hull = `0x2a830`(victim,
   source, rem, noAttacker); hull > 0 → return 0. noAttacker is the comparison attackerKind = 0 (1 when it is 0,
   else 0; `SETZ` before each call), so only collisions and AI area damage pass a non-zero noAttacker (Confirmed, code,
   P3-07/15).
5. **Destruction (hull ≤ 0):** +0xD8 = 1; `0x3c0f4`(attackerKind, source, victim) (communications, [C2](#c2-communications-reactions-0x3c208-and-0x3c0f4--confirmed-code); can draw
   rand); `0x6977c`(victim, event) with event 0 when attackerKind = 1 (destroyed by the player) and 1 otherwise.
   Then by victim kind:
   - kind & 3 = 0 (not player or wingman): when attackerKind = 1, one kill counter in ps by the victim's kind (D8);
     then a parked victim (+2 = 0) gets state 6 (removed, no explosion); otherwise `0x23ac8`(victim).
   - kind 1: `0x32d74` (player destruction sequence, P3-11), then `0x23ac8`(victim).
   - otherwise (kind 2): `0x32dec` (wingman-loss timer, [C3](#c3-cross-frame-consumption-by-the-main-flow--confirmed-code)), then parked → state 6, else `0x23ac8`.
   Returns 0.

**Return value (read by the ricochet test, [H4](#h4-impact-ricochet-attribution-and-fragment-kills--confirmed-code)):** 1 exactly when a non-gated hit left no residual damage after
the shield (damage ≤ shield, or damage 0, or a zero bypass), 0 otherwise — including gated hits, hull damage and
destruction.

**Attacker kind by caller:** `0x2a40c` passes the shooter's kind, or the fallback mask `0x93780`
when the shooter handle is invalid (never 0); `0x2a5fc` passes 0 and source 0 (collisions, AI area damage);
`0x30150` passes the attacker's kind and source 0 ([E3](#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code)). The kill counters and event 0 therefore only follow
live player shots and parked engagements by the player; collisions never credit a kill.

**No multiplier on this path:** `0x2a694`, `0x30c60` and `0x2a830` scale nothing. Scaled damage reaches them only
from `0x30150` (the TABL 4003 scale and f64 factors by the victim's kind, [E3](#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code))
and from the collision division by (3 − group) ([H6](#h6-collision-passes--confirmed-code-collision-helper-spot-checked)).

##### D3. Shield `0x30c60(EAX victim, EDX damage)` — Confirmed (code)

1. When subsystem 4's state is 1: one rand; (rand & 0xFF) < 0x54 (signed) → return damage unchanged (the shield
   is bypassed and keeps its value; probability 84/256 = 21/64). State 2 does **not** bypass: the remaining shield
   still absorbs (it is just no longer recharged, D13). No draw at states 0 and 2.
2. damage < shield (signed): shield −= damage, return 0. Otherwise shield = 0, return damage − old shield (0 when
   equal).
3. For the player (kind = 1), +0x44 = 1 in both branches.

##### D4. Hull and subsystem damage `0x2a830(EAX victim, EDX source, EBX hullDamage, ECX noAttacker)` — Confirmed (code)

1. hullDamage > 0: hull = +0xD0 − hullDamage (stored). Otherwise hull = +0xD0 (unchanged).
2. **Forced roll** f: drawn only when noAttacker ≠ 0, or the source is non-null with kind exactly 0x100000 (a
   missile); then f = (rand & 0xFF) < 0x32 (50/256). Otherwise f = 0 without a draw.
3. hullDamage = 0 and f = 0 → return hull (no subsystem roll).
4. **Damage roll** p: hull ≤ 0 → p = 1 without a draw. Otherwise t = trunc(768 × hullDamage ÷ hull) (32-bit
   `LEA`/`SUB`/`SHL 8`, signed `IDIV` by the *post-damage* hull) and one rand: p = t > (rand & 0xFF) (signed), i.e.
   probability min(max(t, 0), 256)/256. With hullDamage = 0 and hull > 0, t = 0 and p = 0 (the draw still happens).
5. f = 0 and p = 0 → return hull.
6. n = 19 when the victim's kind is 1 (the player), else 9 (wingman included). s = rand % n (signed `IDIV`).
   st = state(s).
7. **Forced-only search** (p = 0, hence f = 1): the first index ≥ s whose state is 0; if none, the first index in
   0…s−1 whose state is 0; if every field 0…n−1 is non-zero, one more rand: s = rand % n, st = state(s). (A
   damage roll, p = 1, takes s as drawn.)
8. **Apply** when st < 2 (st = 2: nothing, +0xF0 unchanged):
   - s = 5: `0x2e150` (list-1 mount damage), s = 8: `0x2e310` (list-0 mount damage), both **without** changing
     field s ([W4](#w4-mount-damage-repair-and-status-subsystems-5-and-8--confirmed-code));
   - otherwise field s := st + 1, except s = 10 or 13 with st = 1, which are written 1 again (they never reach 2
     through damage); for s = 7 additionally `0x21bd4`(victim, st + 1) (steering disturbance, [P3-06](#flight-controls-and-rotation-p3-0602); three rand at
     level 2);
   - +0xF0 = 1 (for 5 and 8 too).
9. **Threshold (player only):** whenever step 6 ran (also when st was 2), count the non-zero fields among 0–18:
   ≥ 14 → `0x69e5c`(1); 9–13 → `0x69e5c`(0); otherwise no call (D11).
10. Return hull.

Not edge-triggered: `0x69e5c` is called on every subsystem roll while the count is at least 9.

##### D5. Other entries into the damage rule — Confirmed (code)

- `0x2a5fc(EAX victim, EDX damage)` (collisions `0x29670`/`0x29934`, the AI area damage below): nothing when the victim
  is dead; posts a presentation item 4 on the victim (bytes +8 = 2, +9 = 4, +0x10 = 0, +0x0C = 1 when the victim's
  **shield** +0x2C ≤ 0 before the hit, else 0); `0x2a694`(0, 0, victim, damage); then `0x3c208`(0, 0, victim,
  damage) when hull ≥ 0, otherwise `0x3c0f4`(0, 0, victim). Because `0x2a694` with attackerKind 0 calls `0x3c0f4`
  itself on destruction, a collision kill with hull < 0 calls `0x3c0f4` twice; with hull exactly 0, once plus one
  `0x3c208`. A gated victim (player in the destruction view) still gets the item and the communications call.
- **AI area damage `0x6313c`** (AI behaviour, only reference a pointer at `0x176604`; P3-08): when its trigger
  distance is reached it calls the explosion constructor `0x23ac8` on its own object (without setting the dead
  flag) and damages every object of kinds `0xfffff` within range with a linear fall-off (parameter block at
  `0x1b41a0`: damage +8, full-damage radius +0x0C, zero radius +0x10; chop through `0x74518`) through `0x2a5fc`.
  Reachability in the slice is P3-08's question. *(Decompiler for the fall-off; call and arguments native.)*
- Hit items and the hit sound: the +0x0C flag of the items posted by `0x2a40c` and `0x2a5fc` is "victim shield ≤ 0
  before this hit", not "destroyed" ([audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08)).

##### D6. Two-bit subsystem fields — Confirmed (code); meanings Likely (consumers)

`0x52ac4(h, i)` returns (word[+0xE8 + 4·w(i)] >> s(i)) & 3 and `0x52a84(h, i, v)` clears those two bits and ORs
in v << s(i) (v is not masked). The tables at `0x1760b4` (shift) and `0x1760d4` (word index) put fields 0–15 in
+0xE8 at bits 2i and fields 16–31 in +0xEC; 19 are used. Instantiation clears 0–18; `0x39820` clears 0–18.

| Field | Damaged by `0x2a830` | Rule consumers | Display consumers | Likely subsystem |
|---|---|---|---|---|
| 0 | all | energy drain ×10/×100 per dt (D13) | status overlays | power/generator |
| 1 | all (player value overwritten by D9) | none | status (hull overlay) | hull |
| 2 | all | player maximum speed ×0.5/×0.25 (`0x30e0c`, P3-06) | status | engines |
| 3 | all | missile lock: 1 random, 2 none ([W8](#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code)) | status | targeting computer |
| 4 | all | shield bypass at 1 (D3), no recharge at 2 (D13) | status | shield generator |
| 5 | all (mount damage instead of the field) | — (player field written by D9) | status | missile mounts (list 1) |
| 6 | all | none found | status | unknown |
| 7 | all | steering disturbance level `0x21bd4` (P3-06) | status | steering/handling |
| 8 | all (mount damage instead of the field) | — (player field written by D9) | status | guns (list 0) |
| 9 | player | — | lock indicator `0x45de0` | — |
| 10 | player, max 1 | — | left display page 0 interference | — |
| 11 | player | — | left display page 1 interference | — |
| 12 | player | — | radar `0x40370`, `0x4eb3c` area | radar |
| 13 | player, max 1 | comms key `c` refused at 2 (`0x27b44`; unreachable by damage) | left display pages 2–5 | communications |
| 14 | player | — | right display `0x42d80` | — |
| 15–18 | player | — | corner gauges: shield (15), energy (16), speed (17), commanded speed (18) | — |

Base interior code (`0x39cb4`, `0x398ec`, P3-10) also reads/writes fields.

##### D7. Rescue and repair resets — Confirmed (code)

`0x67b98` (rescue, P3-01/05) runs, in order: dead flag 0; craft record; **`0x39820`** (full repair: fields 0–18 = 0;
`0x2e1fc`/`0x2e3c8` with flag 1 repair every list-1/list-0 mount; hull = c9C; energy = c54; refills missile mounts
of lists 0 and 1 up to their craft ammunition while cycling each list's selection with `0x2d6dc`, which posts the
selection sound request for the player; `0x21bd4`(·, 0)); `0x2d400` (mount states rebuilt, [W1](#w1-per-object-weapon-block-and-mount-states--confirmed-code));
`0x3060c`(record +0x68, record +0x64, 100) (D13). Net effect for the player: hull **full (c9C, not the record +0x60
percentage of instantiation)**, energy and shield from the record percentages, charge full, L1 = 1, L2 = 2, all
fields 0, disturbance 0, steering lock untouched by this path (`0x21ba0` is reset only by `0x280ec`/`0x398ec`,
P3-06). Kept: ps kill and shot counters, `0x176710` (D11), the player's target and every other object.
`0x39820` is also called by `0x280ec` (cheat/debug pointer table), the world-exit test `0x2f314`, docking/launch
`0x38ff4`, AI code `0x61bd0` and `0x68f4c` (P3-10, P3-06).

##### D8. Player kill and shot counters (ps) — Confirmed (code)

`0x2a694` increments, only for attackerKind = 1 and a destroyed victim of kind & 3 = 0, one i32 by the victim's kind:
0x80 → ps +0x30, 0x100 → +0x34, 0x200 → +0x48, 0x400 → +0x4C, 0x80000 → +0x50, 0x1000 → +0x54, 0x800 → +0x58,
0x10000 → +0x5C; other kinds are not counted. The interleaved +0x38/+0x3C/+0x40/+0x44 are the shot statistics
(projectiles fired `0x25b0c`, projectile hits and missile hits `0x2a40c`, missiles fired `0x2b00c`; [W11](#w11-launch-message-8-and-the-two-constructors--confirmed-code),
[H4](#h4-impact-ricochet-attribution-and-fragment-kills--confirmed-code)). Counted before the parked/explosion branch, so a parked kill by the player counts. The rescue does not
reset them; their reset points and readers belong to P3-11/P4 (not traced).

##### D9. Status display writes subsystem fields 1, 5 and 8 — Confirmed (code)

The left display's page-0 handler `0x4d0e0` (only through the page table, D15) calls `0x4d50c`(player, blink) when
its 0x20-unit blink timer has toggled since the last call or the player's +0xF0 is set, then clears +0xF0. The
blink phase toggles when clock > the timer, which is then set to clock + 0x20. `0x4d50c`:

- chooses the shield overlay by q = (shield << 8) ÷ c5C (signed): ≥ 0xE6 → 0; ≥ 0xC0 → blink; ≥ 0x80 → 1; ≥ 0x40 →
  1 + blink; else 2;
- **writes field 1** := 0 when (hull << 8) ÷ c9C ≥ 0xC0, := blink (0/1) when ≥ 0x4C, := 2 otherwise;
- **writes field 5** := `0x2e264` (list-1 mount status 0/1/2) and **field 8** := `0x2e438` (list-0 status);
- draws an overlay for each field 0, 2–8 at state 2, or at state 1 when (index & 1) = blink.

So for the player, fields 1, 5 and 8 are rule state written by a display routine, at display times: only while
the left display shows page 0, the page is not replaced by its interference animation (field 10, D15), and the
cockpit instruments are drawn. They feed `0x2a830`'s forced search, its st < 2 test and the threshold count.
Other objects' fields 1, 5, 8 change only through `0x2a830` (1) or never (5, 8).

##### D10. Energy levels: keys `s`/`S`/`g`/`G` — Confirmed (code)

`0x264a0` (flight key context) first offers each key to the communications handler `0x27b44`, then to
`0x27ab4`, then to its own compare chain. `0x27ab4` acts only when the left-display page (`0x4ce10` → `0x1a9dc8`)
is 1 (the energy page): `G` (0x47) → `0x30bc0`(+1), `g` (0x67) → `0x30bc0`(−1), `S` (0x53) → `0x30b20`(+1), `s`
(0x73) → `0x30b20`(−1). The calls run at once inside the player's update callback. A non-zero result posts
dispatcher message 0x100000 with +0x10 = −1 (no page change; the handler plays SND 10485, D15). Otherwise the key
falls through to the compare chain, which has no case for these four codes, so nothing happens.

`0x30b20(h, d)` (shield level L1; `0x30bc0` is the same with L1 and L2 exchanged):

1. new = L1 + d; new < 0 or new ≥ 4 → return 0, nothing changed.
2. L1 = new; repeat: E = c58 − (c78[L2] + c64[L1]) (stored); E < 0 → L2 −= 1; while E < 0 and L2 ≥ 0.
3. L2 < 0 → L2 = **0**, L1 = old L1, E recomputed (the changed level is restored, the other level stays at 0).
4. `0x30e0c` (maximum speed, P3-06), `0x21d88` (commanded-speed cap, P3-06), +0x44 = 1, return 1.

**Data (24 CINF, player record):** E ≥ 0 for all 16 level pairs, so step 2 never lowers the other level and step 3
is unreachable with shipped data. Step 3 sets the other level to 0, not back to its previous value (native
`0x30b7a`–`0x30b81`); the recomputed E can then still be negative.

##### D11. Calls handed to other tasks — Confirmed (code)

- `0x69e5c(v)` stores v in `0x176710`; the mission build `0x66c00` sets it to −1 and the success-summary
  routine `0x69e1c` reads it (0 → one summary flag, 1 → another). It is a "player heavily damaged" note for the
  summary (P3-11): last write wins, never reset by the rescue.
- `0x33464` (player energy loss): only in main-flow state 3 with sub-state 0 (`0x339c4`): posts a fixed EXE message,
  sub-state 1, due time clock + 0x3C0 (P3-01/05; P3-11). Repeated calls in later updates do nothing.
- `0x32dec` (wingman-loss timer) and `0x3c208`, `0x3c0f4` (communications reactions, call times in D2/D5): [C2](#c2-communications-reactions-0x3c208-and-0x3c0f4--confirmed-code), [C3](#c3-cross-frame-consumption-by-the-main-flow--confirmed-code).

##### D12. Random draws on these paths — Confirmed (code)

| Where | Condition | Draws, in order |
|---|---|---|
| `0x30c60` | field 4 = 1 | rand & 0xFF (< 0x54 bypass) |
| `0x3c208`, `0x3c0f4` | attackerKind ≠ 0 / destruction (and `0x2a5fc`) | see [C2](#c2-communications-reactions-0x3c208-and-0x3c0f4--confirmed-code) |
| `0x2a830` step 2 | noAttacker or missile source | rand & 0xFF (< 0x32) |
| `0x2a830` step 4 | (hullDamage ≠ 0 or f) and hull > 0 | rand & 0xFF |
| `0x2a830` step 6 | f or p | rand % n |
| `0x2a830` step 7 | forced only, all n fields non-zero | rand % n |
| `0x2e150`/`0x2e310` | s = 5/8, st < 2 | rand % count, then rand % ammunition when it applies ([W4](#w4-mount-damage-repair-and-status-subsystems-5-and-8--confirmed-code)) |
| `0x21bd4` | s = 7 at new level 2, mode-0 block | 3 × (rand % 193 − 96) (P3-06) |
| `0x23ac8` | destruction | explosion draws ([X11](#x11-numbers-and-random-draws--confirmed-code)) |
| `0x3060c` | kinds in `0xfffff` | rand % 64 |

Order within one damage: `0x30c60` → `0x3c208` → `0x2a830` (2, 4, 6, 7, effect) → [`0x3c0f4` → `0x6977c` (no
direct draw) → `0x32d74` (draws via the view switch, P3-11) → `0x23ac8`]. Supports: rand % 19 → values 0–11 have
1725 preimages, 12–18 have 1724; rand % 9 → 0–7 have 3641, 8 has 3640; rand % 64 → 512 each; rand & 0xFF → 128
each. The display routines `0x4ce30` (rand & 0x3F) and the corner gauges (D16) also call the same generator per
drawn frame (presentation; the original rule sequence therefore depends on rendering).

##### D13. Resource initialisation `0x3060c(EAX h, EDX craft, EBX a, ECX b, stack c)` — Confirmed (code)

- Kind & 0xFFFFF = 0 (missiles 0x100000, effects): only `0x30e0c` (+0x78 = craft +0xB8). The missile constructor's
  call `0x3060c(missile, body, 100, 0, 0)` therefore gives a missile no energy, shield, charge or levels (all 0
  from the allocator) and no energy updates (it is outside kinds `0xffffe`).
- Otherwise: energy = (c54 ÷ 100) × a; shield = c5C × b ÷ 100; charge = c74 × c ÷ 100 (signed `IDIV`, `IMUL`); kind
  1: L1 = 1, L2 = 2; E and T as in [maximum speed](#throttle-maximum-speed-and-speed-matching-p3-0603) (D1; the constant is 1000);
  `0x30e0c`; +0x20 = clock; +0x44 = 1; +0x24 = clock + 0x80 + rand % 64.
- Callers: instantiation (a = record +0x68, b = record +0x64, c = 100), rescue (same), missile constructor, kind
  0x4000 constructor `0x38780` (P3-10). Record percentages: +0x68 energy, +0x64 shield; charge always 100 %.
- **Data:** every c54 is a multiple of 100 and ≥ 100 (480 records), so energy = c54 × a ÷ 100 exactly.

##### D14. Energy updates — Confirmed (code)

**Order `0x30590`** (after `0x23808` in each dispatcher pass,
[frame pipeline](#frame-pipeline-p3-0201)):

1. The player (ps +0x8C) unless docked (+2 = 3): `0x3071c`(player, mv). No state or dead-flag test: the player's
   energy keeps updating while it is destroyed and during the destruction view.
2. Kinds `0xffffe` in walk order: docked → skip; parked (+2 = 0) → `0x30994`(h, 0) in **any** state (new, to be
   removed, dead); otherwise only state ≥ 7 → `0x30994`(h, mv). Active new objects (states 0–3) and exploded
   sources (state 4) are skipped. Projectiles, missiles, explosions, fragments are not updated.

**`0x3071c(h, mv)` (player), when clock ≥ +0x24 (unsigned):**

1. dt = clock − +0x20 (u32); ×8 when the typed-cheat flag `0x174ee0` (row 21 of the cheat table, pointer at
   `0x1750f0`; no other writer) is set and the object's +2 is 0 (parked). The test does not exclude the player; a
   parked player is Likely unreachable (instantiation makes kind 1 active and the area check does not park kind 1, P3-06;
   message 0x800000's writer was not traced). +0x20 = clock.
2. **Shield recharge** when shield < c5C and field 4 ≠ 2: r = trunc(c64[L1] × dt ÷ 64); r = min(r, energy);
   need = min(c60 × (c5C − shield), 1000 r); gain = need ÷ c60; when gain > 0: shield += gain, energy −= need ÷ 1000.
3. **Charge recharge** when charge < c74: r = min(trunc(c78[L2] × dt ÷ 64), energy); d = min(c74 − charge, 1000 r);
   charge += d; energy −= d ÷ 1000 (no positivity test).
4. **Speed cost:** v = trunc(mv +0x6C) (the commanded speed, not the current speed; c B8 when mv is null; chop
   `0x74518` + `FISTP`). When c8C ≠ 0 and v ≥ c8C: v ×= 2; otherwise when c90 ≠ 0 and v ≥ c90: v ×= 3 (the ×2 test
   has precedence). energy −= trunc((v × c88 ÷ 1000) × dt ÷ 64).
5. **Field 0:** state 1 → energy −= trunc(10 dt ÷ 64); state 2 or 3 → energy −= trunc(100 dt ÷ 64).
6. **Depletion** when energy ≤ 0: mv non-null → `0x21ba0`(h, 1) (mode-0 block: steering lock, commanded speed 0,
   [P3-06](#flight-controls-and-rotation-p3-0602)); energy = 0; kind 1 → `0x33464`. This branch runs at **every** update whose result is ≤ 0, not only at the
   transition; its effects are idempotent except that `0x21ba0` re-zeroes a commanded speed raised in between.
7. Next update: player clock + 0x40; others clock + 0x80 with mv, clock + 0x100 without; +0x44 = 1.

**`0x30994(h, mv)` (others):** steps 1, 2, 5, 6 (with `0x33464` only for kind 1, never reached) and 7; no charge
recharge and no speed cost. Units: rates are energy per 64 clock units (per nominal second); charge and shield
points cost 1/1000 and c60/1000 energy each; ÷ 64 and ÷ 1000 truncate toward zero; remainders are dropped (the next
update starts afresh).

Energy never regenerates in these routines (only repair/rescue/base: P3-10, P3-11).

**Data (24 CINF):** c90 = 0 in all 480 records, so ×3 is unreachable; c8C is 0 in 384 records, at or below the
truncated base maximum speed in 48 and above it in 48. In CINF 4037 the doubling is reachable for the player and
the wingman (c8C ≤ trunc(c B8)) and not for enemy kinds 7, 8, the base (14) or kind 17. No record has a shield
with c60 = 0 (no division by zero). The player's shield level 0 has a zero recharge rate in CINF 4037.

##### D15. Left display pages — Confirmed (code)

State: page index `0x1a9dc8` (0–6) and the 7-entry table `0x175c7c` (0x20 bytes: handler, —, refresh period,
next refresh, subsystem, interference on/off, next toggle, interference start; [T8](#t8-left-display-no-target-reads-confirmed-code)). The type-6
instrument handler `0x4ce30` per drawn frame: field s of the page's subsystem; s = 2 → interference on (start time
set once); s = 1 → toggle on/off when clock > next toggle, next toggle = clock + 0x40 + (rand & 0x3F); s = 0 → off.
Off pages call their handler when forced or their next refresh is due (period 0 = every frame), on pages draw
SNIP 10487.

| Page | Handler | Subsystem | Entered by | Left by |
|---|---|---|---|---|
| 0 status | `0x4d0e0` | 10 | init `0x4ca80`; `d` on page 1; comms close/clear `0x2cd20` (main-flow transitions, destruction `0x32d74`); auto-returns below | `e` |
| 1 energy | `0x4d800` | 11 | `e` on page 0 only | `d` (only here); comms `c`; incoming message; Warp |
| 2–4 comms menu | `0x4da28` | 13 | `c` (not on 2–4, field 13 ≠ 2) saves the page and opens 2; menu keys 3, 4 | menu end restores the saved page; handler with no menu → page 0 |
| 5 incoming message | `0x4dc50` | 13 | `0x4e418` (view mode ≠ 1): saves the page in `0x175efc` | message end `0x4e2a0`/`0x4e5a0` restore it; three failed draws → 0 |
| 6 Warp | `0x4dcec` | none | view switch `0x3f158` saves the page in `0x187020` | leaving Warp restores it (0 if it was 5); handler outside view mode 1 → 0 |

- `e` (0x65) posts message 0x100000 with page 1 only when the page is 0; `d` (0x64) posts page 0 only when the page
  is 1 (native `0x26fd5`, `0x2700a`). Elsewhere both do nothing.
- Message 0x100000 (dispatcher `0x21457`): page ≥ 0 → `0x4cdf0` (set page, force redraw); then always a
  presentation item 2 with SND 10485. So the page changes in the message loop of the key's frame.
- `0x4cd68` (cockpit/HUD rebuild on view switches) re-initialises the display at a given page and sets the
  player's +0xF0 = 1.

##### D16. HUD full scales — Confirmed (code) for operands; drawing P3-13

| Resource | Value | Full scale | Where |
|---|---|---|---|
| Energy | +0x28 | c54 (float division) | corner gauge type 2 `0x4131c`, field 16 |
| Shield | +0x2C | c5C | corner gauge type 3 `0x41484`, field 15; energy-page left bar `0x4d800`; status overlay (D9) |
| Hull | +0xD0 (clamped at 0) | c9C | corner gauge type 4 `0x415d0`; status field 1 (D9) |
| Charge | +0x30 | c74 | energy-page right bar `0x4d800` |
| Spare power | E +0x3C | T +0x40 | energy-page middle bar `0x4d800` |
| Speed | mv +8 | c B8 | corner gauge type 0 `0x4117c`, field 17 |
| Commanded speed | mv +0x6C | +0x78 (or c B8 by argument) | corner gauge type 1 `0x41238`, field 18 |

`0x4d6f0` draws a bar of length h × value ÷ max (signed `IDIV`) when value < max, else full. The two TABL 10479
records on the energy page are chosen by L1 and L2. Corner gauges at field state 1 show the true value only when
(rand & 3) = 3 and a random value otherwise; at state 2 they are not drawn. *(Decompiler for the gauge colour
thresholds.)*

##### D17. Numeric semantics — Confirmed (code)

- Types: resources, hull, levels, counters and damage are i32; clocks and due times u32; speeds and B8 f32. All
  resource, hull, level and counter arithmetic is i32 (`ADD`/`SUB`/`IMUL` wrapping, signed `IDIV` truncating,
  signed compares). Division by 64 uses `SAR 31; SHL 6; SBB; SAR 6` = truncation toward zero. Clock values: the due
  test is unsigned (`JC`), dt is a u32 difference used as i32.
- Overflow margins (data): rate × dt stays below 2³¹ for dt < 9.7 M units; (v × c88 ÷ 1000) × dt for dt < 3.3 M;
  c60 × c5C < 2³¹; shield and hull << 8 never overflow. 1000 × r is bounded by the rate term (r ≤ rate × dt ÷ 64), so
  it cannot overflow at realistic dt even though some c54 × 1000 exceed 2³¹.
- **768 × hullDamage in `0x2a830`** wraps only for a residual damage ≥ 2,796,203. Bounded here for projectile hits
  (gun +0x1C) and missile blasts (≤ missile +0x5C): no CINF record comes near it. **Not bounded here:** collision
  damage (`0x29eb8`/`0x2a12c` ÷ (3 − group); [H8](#h8-numbers-on-these-paths--confirmed-code-unless-marked) leaves its i32 overflow reachability Unconfirmed), parked
  engagement sums with their f64 factors ([E5](#e5-numeric-semantics--confirmed-code-exactness-by-arithmetic)) and the AI area damage block `0x1b41a0` (P3-08).
  If it wrapped, t would be garbage (possibly negative, p = 0). Reachability for those inputs stays open.
- Float to integer: only the commanded speed and c B8 (chop `0x74518` + `FISTP`) in `0x3071c`/`0x3060c`; `0x30e0c`
  converts back with `FILD` (P3-06). No fixed point or trigonometric tables (supports U-009).
- Divisions by data: c60 (only when shield < c5C, hence c5C > 0; non-zero in data), c9C and c5C in the player's
  status display (positive for the player), the post-damage hull (tested > 0 first).
- Negative inputs: a negative commanded speed would make the speed cost negative and raise energy; whether it can
  be negative is P3-06's question.

Evidence: ignored `local/research/p3-07/damage-energy/` (`ghidra_scripts/DmgProbe.java`, `probe.sh`, outputs `out/d1`–`out/d3`, `out/n1`–`out/n23`, `out/c1`; `data-check.ts` with `out/data-check.json`, counts and booleans over the 480 craft records of the 24 CINF). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Every Confirmed (code) step was read from native instructions, with the decompiler used only to navigate, and callers were checked by raw scans of relative transfers and of 32-bit values.

#### Parked-object engagement (P3-07/05)

Q-09: the abstract engagement of parked objects outside the active area.

##### E1. The call in the parked-object update `0x2f1b0` — Confirmed (code)

The parked-object update `0x2f1b0` (one call per dispatcher pass, at `0x21531`) belongs to P3-06 ([parked update](#world-boundary-active-area-parking-and-autopilot-p3-0604)), which records its walk, eligibility, cadence, elapsed time, Warp gate `0x2f298` and the parked movement and world exit `0x2f314`. For each object it updates, right after `0x2f314`, it runs the engagement with that elapsed time:

- object byte +0xC4 = 1 → `0x2ffec`(object, elapsed); any other value → `0x30150`(object, elapsed, divisor 1). Both return 0 on every path, so the "negative → −1" exits after them are unreachable;
- `0x2f314` also always returns 0, and an object it has just put in state 6 (left the world) still engages in the same update;
- objects are processed one after another, so the engagement's draws interleave per object with P3-06's draws: object i's update draws, its engagement draws, then object i+1. An object killed earlier in the same walk is skipped later (dead flag, state 6).

##### E2. Multi-target engagement `0x2ffec`(object, elapsed) — Confirmed (code)

Only for objects with +0xC4 = 1. Instantiation (`0x68050`) gives +0xC4 = 1 to kinds `0x8000`, `0x10000`, `0x20000`,
`0x40000`; AI code writes 0–5 later (`0x62250` writes 1; P3-08).

1. Copies its own position (+0x6C/+0x70/+0x74). Engagement radius² m := f32(R × R), R = craft record (+0x1C) +0x0C
   (FMUL then FSTP f32).
2. Walks kinds `0xfffff` and collects, in walk order, every object that passes the **side gate** (self kind in
   `0x6c87f` ? candidate kind ∉ A : candidate kind ∉ B, where A = `0x6c07f` and B = `0x93f80` are disjoint with union `0xfffff`, and `0x6c87f` = A + `0x800`) and whose squared distance from `0x56b50` is < m (strict; a NaN
   would pass). `0x56b50`(a, b) = (dy·f32(dy) + dx·f32(dx)) + dz·f32(dz) in double, with d = a − b per axis in double,
   each factor's second copy stored as f32 first. **No activity, state, dead-flag, Warp or self test**: active, docked
   and parked objects, new objects and destroyed ones are collected. Self is collected only for kind `0x800` (the only
   kind in `0x6c87f` but not in A).
3. The list is a growable array (`0x6a860`(4, 10, 5, 0), append with `0x6a8f0`(…, −1), count `0x6aa70`, free
   `0x6a8c8`); it holds uncounted handles. An allocation failure leaves it empty (no engagement).
4. n := count. For each collected handle in order: `0x528bc`(self, h) — **self +0x8C := counted reference to h**
   (the previous one released) — then `0x30150`(self, elapsed, divisor n) (EBX survives `0x528bc`).
5. Frees the list, returns 0. Afterwards self +0x8C holds the last candidate (unchanged when n = 0).

Ownership: the collection, the per-target division and the +0x8C write are part of the engagement rule (P3-07). The
+0x8C write overwrites the AI target that P3-08's code maintains, and `0x30150` reads the target through the leader
when +0x7C is set (E3.2), so with a leader the n calls engage the leader's target n times.

##### E3. Engagement rule `0x30150`(self, elapsed, divisor) — Confirmed (code)

Callers: only `0x2f1b0` (divisor 1) and `0x2ffec` (divisor n ≥ 1) (`xfer:` scan; no 32-bit pointer).

**E3.1 Non-engagement roll (self kind, one rand, before anything else):**

| Self kind (tested in this order) | Returns 0 when rand % 100 < | Engages with probability |
|---|---|---|
| bit `0x2` (wingman) | 80 | 20 × 327 / 32768 |
| in `0x87c` (4, 8, 0x10, 0x20, 0x40, 0x800) | 90 | 10 × 327 / 32768 |
| in `0x78000` (0x8000–0x40000) | 95 | 5 × 327 / 32768 |
| in `0xf9c7c`, i.e. effectively 0x400, 0x1000, 0x80000 | 90 | 10 × 327 / 32768 |
| any other (1, 0x80, 0x100, 0x200, 0x2000, 0x4000) | no draw | always |

(rand % 100 with rand 0–32767: values 0–67 have 328 preimages, 68–99 have 327.) The slice's enemy kinds 0x80 and
0x100 therefore engage at every parked update without a draw.

**E3.2 Leader and target (no draws):**

- Leader L := self when +0x7C = 0; otherwise the +0x7C object, and when that handle is invalid (`0x52680`) return 0.
  In both callers `0x2f314` has already run in the same update and clears an invalid +0x7C (`0x52898`(self, 0)), so
  the invalid-leader return is not reached from `0x2f1b0`. Among disassembled direct stores, object +0x7C is written
  only by `0x52898` (callers `0x67678`, section-5 cycle members: Likely the formation leader; `0x2f314`) and zeroed by
  the allocator.
- By L's byte +0xC4 (unsigned): 0 → target T := L +0x90; 1–4 → L +0x8C; **5 → return 0**; ≥ 6 → L +0x90. +0x90 is set by
  `0x528e8` (AI code: `0x5e710`, `0x61740`, `0x61dfc`, `0x61f20`, `0x62578`, `0x62714`, `0x68050`). Direct +0xC4
  stores write 0–5; three stores write a register value (`0x623c6`, `0x624ff`, `0x626f5`; P3-08).
- Gates, in order, each returning 0: T invalid; T +0xD0 ≤ 0 (signed; the hull, [D1](#d1-object-fields-of-this-section--confirmed-code)); T +0xCC ≠ 0 (Warp/leaving); side gate (self kind, not L's, against T's kind, as in E2). **Not tested:** T's
  activity, state and kind range (an active target, the player included, a docked one or a new one in state 0 qualify)
  and T's dead flag (tested only before damage, E3.6).

**E3.3 Distance (no conversion to an integer):** with s = self, t = T positions (f32):
d := f32((((|t.y − s.y| + |t.x − s.x|) + |t.z − s.z|) − r) × 3.0 × 0.25), r = T's craft/body record (+0x1C) +0x10
(shape +0x00, the radius that `0x2cf38` computes for box records). L1 metric minus the target radius, times 0.75 (f32
constants 3.0 at `0x170fe4` and 0.25 at `0x170fe8`, applied in that order); x87 double, one f32 store. d stays a
float; every range test compares two f32 values: in range ⇔ weapon range > d (strict; NaN → out of range).

**E3.4 Missile choice (only when self +0xE0 ≥ 0, signed; +0xE0 is SCEN record +0x74 copied at instantiation):**
count the mount states (array +0x158, count +0x154, mount order) whose mount type byte (+0x10) is 1, ammunition
(state +0x08) ≠ 0 and missile record +0x0C (range) > d. When the count c > 0: one rand, k := rand % c; the chosen mount
is the k-th qualifying one (0-based, mount order). Otherwise (c = 0 or +0xE0 < 0) none.

**E3.5 Damage sum** (i32 total from 0, mount states in mount order; **lists, firing type, damage level, ammunition of
guns, arcs, cooldown state and charge are not consulted**, so mounts in no list and automatic mounts count too):

- Gun mount (type byte 0) with gun +0x0C (range) > d: q := trunc(elapsed × (1/64) × gun +0x14) (FILD of elapsed as
  an unsigned 64-bit value, f32 constant 1/64 at `0x171004`, FILD of +0x14; `0x74518` truncation, FISTP i32);
  shots := q ÷ divisor (signed IDIV, toward zero); shots := 1 when shots ≤ 1; total += gun +0x1C, shots times (i32
  wrapping adds).
  Gun +0x14 is the list path's cooldown ([W6](#w6-gun-shot-0x2e5e8handle-clock-state--confirmed-code)), used here as a multiplier: q = floor(elapsed × cooldown ÷ 64).
- The chosen missile mount (type byte 1): when T's kind is exactly 2, one rand and missile +0x5C is added only when
  rand % 100 < 20 (20 × 328 / 32768); for any other T kind it is added without a draw. Its ammunition (state +0x08) is
  decremented in both cases. No other missile mount contributes.
- Other type values: nothing.

**E3.6 Factors and application:**

1. total := trunc(total × S) (FILD, FMULP, `0x74518`, FISTP), S = `0x2cf0c`: the f32 at `0x1864d4` (TABL 4003 scale of
   the mission's pair) while a CINF is loaded (`0x174b70` ≠ 0), else 1.0.
2. By **T's** kind: in `0x6c87f` → × 0.88 (`0x170ffc`) when in `0x78000`, else × 0.5 (`0x170ff4`) when in `0x87c`,
   else × 0.9 (`0x170fec`) (kinds 1, 2, 0x4000); not in `0x6c87f` → × 0.9 when in `0x81400` (0x400, 0x1000, 0x80000),
   else no factor (0x80, 0x100, 0x200, 0x2000, 0x10000). Each product is f64 × i32 then truncated (FISTP i32).
3. When total > 0 (signed) and T's dead flag +0xD8 = 0: `0x2a694`(attacker kind = **self's kind**, source = 0,
   victim = T, damage = total).
4. Always after a passed gate (E3.2), whether or not damage was dealt or T died: **self +0x24 := clock and T +0x24 :=
   clock**. +0x24 is the next energy-update time (`0x3060c` sets it at instantiation; the non-player update `0x30994`
   runs when clock ≥ +0x24, unsigned, and then sets it to clock + 0x100 for a parked object and clock + 0x80 otherwise;
   the player's `0x3071c` likewise reads it — intervals: [D14](#d14-energy-updates--confirmed-code)).
   The write makes both objects' energy update run at the next energy pass `0x30590`, i.e. in the next frame (it runs
   before `0x2f1b0`). The update itself and its elapsed time (+0x20) are D14's.
5. Returns 0.

##### E4. Draws per parked object and pass — Confirmed (code)

In order, interleaved object by object in walk order, each object's engagement draws follow the draws of its parked update (P3-06, E1):

- `0x30150` path: (a) the class roll when the self kind is in a rolling class (E3.1); stop on return.
   (b) after the gates: rand % c for the missile choice when c > 0 and +0xE0 ≥ 0. (c) rand % 100 for the chosen missile
   when T's kind is 2. (d) when damage is applied: the draws of `0x2a694`'s callees (`0x30c60`, `0x2a830`, `0x3c208`,
   `0x3c0f4`, and `0x23ac8` or `0x32d74` when an active target dies; `reach:` confirms each can call rand; their counts
   are in [D12](#d12-random-draws-on-these-paths--confirmed-code), [X11](#x11-numbers-and-random-draws--confirmed-code) and [C2](#c2-communications-reactions-0x3c208-and-0x3c0f4--confirmed-code)).
- `0x2ffec` path: no draw while collecting, then (a)–(d) once per candidate.
- No draw in `0x2cf0c`, `0x2f298`, `0x528bc`, `0x56b50` or the array helpers.

##### E5. Numeric semantics — Confirmed (code); exactness by arithmetic

- **Elapsed:** a u32 from the parked update (P3-06); FILD of the zero-extended value makes it an exact unsigned value.
- **Distance:** float only (E3.3); f32 store; f32 against f32 compares. With round-to-nearest (the P3-02/10 runtime
  observation, [x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202))
  JS double arithmetic in the same order followed by `Math.fround` reproduces d exactly.
- **Float to integer:** only through `0x74518` (64-bit precision, chop, FRNDINT, restore) + FISTP: the shot count, the
  scaled total and the per-kind total. Truncation toward zero.
  - q = floor(elapsed × cooldown ÷ 64) exactly (the product is exact below 2^53).
  - trunc(total × S) is exact for 0 ≤ total < 2^29 (24-bit S); every TABL 4003 scale is ≤ 1 (local data), so it cannot
    overflow.
  - The f64 factors are 0.9 + 2.2·10⁻¹⁷, exactly 0.5, and 0.88 + 4.4·10⁻¹⁸ (both inexact ones slightly above), so for
    0 < total < 2^31 the result equals floor(total × 9/10), floor(total/2) and floor(total × 22/25) under either
    rounding mode: the fractional part of the exact product is a multiple of 1/10 or 1/25, far larger than the error.
- **Integer division:** shots := q IDIV divisor (signed, toward zero), then max-with-1 by a signed compare (≤ 1 → 1).
- **Overflow (local data, all 24 CINF):**
  - *Shot count q:* elapsed is a u32 (also after the cheat's `SHL 3`), so q = floor(elapsed × cooldown ÷ 64) < 2^31
    whenever cooldown ≤ 32; every gun +0x14 in the 24 CINF is ≤ 32, so the FISTP (which would raise the unmasked
    invalid-operation exception) never overflows with shipped data. IDIV by a divisor ≥ 1 cannot overflow.
  - *Gun sum:* the repeated `ADD`s are i32 and **wrap**. No code bound limits elapsed (P3-06's elapsed time
    includes the time an object spent active), so a long active stretch followed by parking, or a long session, feeds it. For the worst craft
    the sum passes 2^31 − 1 after about 45 hours of elapsed time (about 45 ÷ 8 hours with the cheat flag). Not met in
    normal play, but reachable in principle: implementations reproduce i32 wrapping (or document a supported-domain
    cap). A wrapped total ≤ 0 deals no damage (step 3 of E3.6), since S and the per-kind factors are positive and every
    truncation is toward zero.
  - *Scaled and per-kind totals:* |total × S| ≤ |total| (every TABL 4003 scale ≤ 1) and the factors are < 1, so those
    two FISTPs cannot overflow.
- **rand:** `rand % 64`, `rand % 100`, `rand % c` with signed IDIV of a non-negative value (support 0…n−1, 32768 =
  q·n + r preimages split q+1 for values < r).
- **No fixed point or trigonometry** on this path (supports U-009).

##### E6. Comparison with active-area hits — Confirmed (code)

| Effect | Projectile/missile hit (`0x2a40c`) | Parked engagement (`0x30150`) |
|---|---|---|
| Shot objects, launch message 8, projectile/missile creation | Yes | **No** |
| Presentation item type 4 on the victim (hit sound/effect) | Yes | **No** |
| Last-victim/last-attacker records (`0x52a1c`/`0x52a50`, +0x9C/+0xA0, +0xA4/+0xA8) | When the owner is valid | **No** |
| Player hit statistics (player-state +0x3C/+0x44) | Player shooter | **No** |
| Ricochet or removal of a projectile | Yes | No |
| `0x2a694` arguments | owner kind (or `0x93780` when the owner is gone), projectile/missile handle | **self kind, source 0** |
| Inside `0x2a694` ([D2](#d2-damage-entry-0x2a694eax-attackerkind-edx-source-ebx-victim-ecx-damage--confirmed-code)): shield, hull, subsystems, communications, dead flag, object event, kill counters, then removal of a parked victim or explosion of an active one | Same | Same calls, with source 0 |
| TABL 4003 scale, per-kind factor | No | **Yes** |

- Event type and kill credit follow the attacker kind = the shooter's kind: type 0 and the player's kill counters only
  when that kind is 1, type 1 otherwise. A parked shooter of kind 1 was not found: instantiation always makes kind 1
  active, the area check (P3-06) does not park kind 1, and the only other activity-0 stores are the message-0x20 toggle (needs state 5)
  and the kind-`0x4000` allocator `0x38780`. Whether a state-5 writer not traced here (message 0x800000; the Warp-out
  case, whose gate `0x2fef8` does not test the kind) can park the player is open, so "a parked engagement never credits
  the player and always reports type 1" is Likely, not Confirmed. Implementations derive both from the shooter's kind.
- `0x3c208`/`0x3c0f4` ([C2](#c2-communications-reactions-0x3c208-and-0x3c0f4--confirmed-code)) are called with a non-zero attacker kind, so they also run for parked engagements.
- A destroyed **parked** victim goes to state 6 without an explosion (`0x2a7fa`/`0x2a81a`); an **active** victim (the
  gate does not exclude it) explodes as in an active hit.

##### E7. Reachability notes (local data, all 24 CINF) — Confirmed (data) unless marked

- 384 of 480 craft records have mounts and 96 have missile mounts; every gun mount's gun +0x14 is positive.
- No TABL 4003 scale exceeds 1.
- Target = the player: a parked shooter lies outside the active circle (xy distance ≥ 7,500 from the player at its
  last area check), so L1 ≥ 7,500 and d ≥ (7,500 − player radius) × 0.75. In CINF 4037 no mounted gun or missile range
  reaches that bound, and in all 24 no gun on any craft does; some side-B missile ranges in other CINF do. So in the
  slice mission a parked engagement cannot damage the player, except possibly in the one pass where the player has just
  moved next to a parked object before the area check re-activates it (Likely; window not measured).

Evidence: ignored `local/research/p3-07/parked/` (`ghidra_scripts/ParkProbe.java`, `probe.sh`, outputs `out/p1`–`out/p11`; `data-check.ts` with `out/data-check.json`, booleans, counts and coarse bounds only). The factor selection by the target's kind was re-read natively by P3-07/07 (`out/p1`, `0x304f2`–`0x30534`). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Every Confirmed (code) step was read from native instructions, with the decompiler used only to navigate, and callers were checked by raw scans of relative transfers and of 32-bit values.

#### Destruction, explosions and fragments (P3-07/06)

Q-10. Extends [effect presentation sources](#effect-presentation-sources) and the destruction sequence of [mission failure](#mission-failure-player-loss-and-rescue-p3-0105). Stage names are those of the Core pipeline: *object-update* `0x20938`, *request handling* the message loop of `0x20d10`, *movement* `0x221fc`, *collision* `0x29670`/`0x29934`, *delayed-player-explosion* `0x23808`; tick N+1 is the next dispatcher pass.

##### X1. Who destroys, and the branches — Confirmed (code)

- **Damage handler `0x2a694`** sets the dead flag, reports the object event and branches by the victim's kind ([D2](#d2-damage-entry-0x2a694eax-attackerkind-edx-source-ebx-victim-ecx-damage--confirmed-code)): the player arms its delayed explosion (X2) after `0x32d74`; a parked victim gets state 6 and never explodes; every other victim explodes through `0x23ac8`. **`0x32dec` is the wingman branch only** (a once-only wingman-loss timer, [C3](#c3-cross-frame-consumption-by-the-main-flow--confirmed-code)), not a general non-player branch.
- **Dispatcher event 0x800** (debug/cheat kills, `0x211ed`–`0x2132b`): byte +0x10 = 0 (the subject) or 1 (the subject's +0x8C): if not dead → dead := 1, `0x3c0f4`(`0x93780`, 0), `0x6977c`(subject, 1), `0x23ac8`, then kind 1 → `0x32d74`, kind 2 → `0x32dec` (the explosion constructor runs **before** `0x32d74` here, after it in `0x2a694`); = 2: every active (+2 = 1) object of kinds `0x93780` → dead, `0x6977c`, `0x23ac8`; = 3: the object at +0x194 of the player's target → dead, `0x6977c`, `0x23ac8`. Not normal play.
- **Built-in AI handler `0x6313c`** (record 9 of the built-in program table `0x1762f8`, handler pointer at `0x176604`; p8, p9): calls `0x23ac8` on its own subject **directly, without the dead flag or `0x6977c`**, then deals the area damage of [D5](#d5-other-entries-into-the-damage-rule--confirmed-code) (AICO 6001 +0x08 damage, +0x0C full radius, +0x10 outer radius). This runs in object-update. Which objects get program record 9 is P3-08's (Unconfirmed here).
- Other callers of `0x23ac8` (raw `E8` scan, p2): `0x23808` (X2), `0x256e4` (X7), `0x2b408` (missile detonation, [H5](#h5-missiles--confirmed-code-unless-marked)). No pointer to it exists. **Parked objects never explode** (state 6 in `0x2a694`; the spec's rule).

##### X2. Explosion constructor `0x23ac8`(h) — Confirmed (code)

Native `0x23ac8`–`0x23fda` (p3).

1. Returns −1 and does nothing when the handle is invalid or the object has no movement block.
2. **Kind 1 (delay):** when `0x174ae4` is 0 it stores sample + 0xC0 there and returns 0 (nothing else). When it is non-zero and > sample (unsigned) it returns 0. Otherwise it clears it and continues. `0x23808` (after movement and collisions, every pass) calls `0x23ac8`(player-state +0x8C) only when `0x174ae4` ≠ 0 and `0x174ae4` < sample (strict) and the player handle is non-zero. The explosion therefore happens in the first pass whose sample **exceeds** destruction sample + 0xC0 (at 2 units per tick: 97 ticks later), in the delayed-player-explosion stage. `0x174ae4` is written only by `0x23ac8` (p25) and is not reset by the mission build; leaving a mission inside the delay is not possible (no game key is polled while the player is dead, P3-02/01; state 3 does not poll the status in sub-state 2, P3-01/05), so a stale timer is Likely unreachable. A Core world starts without it.
3. Allocates kind `0x400000` (+2 := 1), its auxiliary block, callback `0x23838`; **then** source state := 4 (destroyed source: no callbacks, still moved). Explosion mb +0x104 := source kind. **Variant** byte mb +0xF0 := 3 when the source kind has bit `0x100000` (missile), else 0 for large kinds, else 2.
4. **Fragments and the source reference:** for craft kinds it calls the producer `0x24d78`(source, 3) (X6). Only when the source is not a craft kind **or the producer returned non-zero** does it set explosion +0x8C := counted reference to the source (`0x528bc`). So a craft that sheds fragments is *not* held by its explosion; its part-0 fragment holds it (X7).
5. Motion: `0x218e8`(source, source mb, mode 1, item), item hit-test flag := 0, `0x21794`(explosion) — mode 1 with velocity = the item's R2 × the source's current speed (for a mode-2 source, `0x218e8` first takes the source velocity as R2 and re-orthonormalises), no hit test (03 X1).
6. **Extra explosions (craft kinds only):** reads the 3D camera position (`0x52e14` ← `0x1b075c`) and rows (`0x52e90` ← `0x1b0768`, R0 at +0, R1 at +0xC), u := normalise(camera − source P) (`0x56aa8`). Count n := rand AND 3 (0–3), or (rand AND 3) + 2 (2–5) for large kinds. For each extra: six rands t₁…t₆, each tᵢ = rand × (1/32767) × K + C with (K, C) = (30, −15) or, for large kinds, (120, −60), multiplied by camera R0.x, R0.y, R0.z, R1.x, R1.y, R1.z respectively (one f32 store each); position = source P + 2.0 × u + (t₁·R0.x + t₄·R1.x, t₂·R0.y + t₅·R1.y, t₃·R0.z + t₆·R1.z), summed in x87 and stored f32 once per component; then `0x23fdc`(source, source mb, &position). The jitter is component-wise, not t·R0 + t′·R1.
7. Returns 0.

##### X3. Extra explosion `0x23fdc` — Confirmed (code)

Allocates kind `0x400000` (+2 := 1), auxiliary block, callback `0x23838`; mb +0x104 := 0 (no source kind); variant := 0 for large source kinds, else 2; motion as X2 step 5 but with the position replaced by the given point. It never sets +0x8C. **Its only inputs beyond the source pose are the display camera's position and rows** (X2 step 6).

##### X4. Explosion object lifecycle — Confirmed (code)

**Callback `0x23838`** (object-update; native p3):

- **State 0, first time:** allocates a 0x14-byte timer from pool `0x174ae0`, zeroed: [0] source kind (mb +0x104), [1] mode-0 event time, [2] mode-2 event time, [3] mode-1 event time, [4] activation delay. Then:
  - source kind is a craft kind: [1] := sample + 8, [3] := sample + 0xC, [2] := sample + 0x10, then the gate `0x2443c`(kind, copy of the explosion P, timer) (X5);
  - otherwise: if the source kind is 0 (an extra) [4] := sample + rand % 21; then, for every non-craft source, one rand: when rand % 3 = 0, [1] := sample + 8 (a mode-0 event, which creates nothing).
  - obj +0x14 := timer.
- **State 0:** when sample > [4] (unsigned, strict) it posts message 0x200 with new state 7. Main explosions ([4] = 0) do this at their first callback; extras wait until their delay has passed (sample > first-callback sample + 0..20).
- **State 7:** for [1] (mode 0), then [3] (mode 1), then [2] (mode 2): when non-zero and ≤ sample (unsigned) it posts message 0x10 with byte +0x10 = the mode and clears the field. Then it posts 0x200 with state 7 (every tick).
- **State 6:** when +0x8C is valid it posts message 0x40 on it (dispatcher → `0x24424` → `0x21650`: that object gets state 6); clears +0x8C; frees the timer; posts 0x20 (removal in that tick's request handling).
- **States 1–5:** nothing. Explosions do not wait for a presentation: nothing sets their state to 1, 2 or 3 on the paths examined (Likely: only model and fragment completions write those states).

**Message 0x200 → `0x2409c`(h, new state)** (request handling; the dispatcher calls it only for kind `0x400000`, `0x211a6`; native p3):

- **Activation** (current state ≠ 7 and new state = 7): state := 7; then the EXPL choice (X8): variant 0 or 1 → rand % count₁ in the list-1 subset; variant 2 → squared distance from the camera position to the explosion P (`0x56b50`: f32 differences, x87 sum) ≥ 160000.0 (f32, i.e. 400²) → rand % count₂ in the list-2 subset, otherwise variant := 1 and rand % count₁ in the list-1 subset; variant 3 → rand % count₃ in the list-3 subset (signed `IDIV`; a zero count would fault). mb +0xF4 := that EXPL record; posts presentation item type 8 byte 0 (start: animation and sound); mb +0xF8 (shown frame) := 0, +0x108 (flash pending) := 1, +0x10C := sample + 0x60, +0xFC (t₀) := sample, +0x100 := 14; posts item type 8 (2, 3) with frame 0. **One rand per activation.**
- **Update** (otherwise; every later 0x200): when +0x108 ≠ 0, the flash check `0x24314` (X4 flash) and +0x108 := 0. Frame f := (14 × (sample − t₀)) mod 2³² SHR 6 (`IMUL`, logical shift), compared **signed** with the ANIM frame count n (EXPL +4 → ANIM +4).
  - f ≥ n and +0x10C < sample (unsigned, strict): `0x21650`(explosion) (presentation removal item, state 6) and return. The object leaves at its next callback (state 6, above), one tick later.
  - Otherwise state := 7; when f ≥ n: if +0x8C is valid, `0x21650`(+0x8C) (**the held source gets state 6**) and +0x8C := 0; f := −1 (sprite hidden). When f differs from +0xF8 it is stored and posted as item 8 (2, 3, f).
- **Flash `0x24314`** (presentation): only for craft sources: large kinds always, others when the L1 distance from the camera is < 100.0, or < 150.0 and the camera's forward row (`0x52eec`(2)) · (P − camera) > 0.707 (unnormalised); it posts item type 4 (2, 6) on the player object. Its return value is unused.

**Release and removal times** (2 units per tick, t₀ = activation sample): with the shipped ANIMs (12 frames in every EXIC list-1 and list-2 entry, 6 in every list-3 entry; data check), f ≥ n first holds 28 ticks after activation for variants 0–2 and 14 ticks for variant 3; the own removal is requested at the first update with sample > t₀ + 0x60, i.e. 49 ticks after activation (f ≥ n already), and the object leaves one tick later. The 1.5 s of [textures §6](./textures.md#6-anim-explosion-animations-confirmed) is therefore the explosion's own lifetime; a **held** source is released at the end of the animation, earlier.

##### X5. Event 0x10 and the discriminator-1/2 fragments — Confirmed (code)

- **Gate `0x2443c`(kind, P, timer)** (called once, at the explosion's first callback, before it has moved): camera position and rows (`0x52e14`, `0x52e90`), viewport rectangle (`0x3f420` → `0x3d488` copies `0x175200`: left, top, right, bottom). Local point = rows · (P − camera) (`0x56dc0`). On screen only when 10.0 ≤ z < 3800.0 (f32) and, with W = right and the centre (right SAR 1, bottom SAR 1), sx = chop(W × x × (1/z)) + cx and sy = chop(−W × y × (1/z)) + cy satisfy left ≤ sx ≤ right and top ≤ sy ≤ bottom (signed). Off screen → [1], [2], [3] := 0. On screen: class 1 for kinds 4, 8, 0x10, 0x20, 0x40, 0x400, 0x800, 0x1000; class 2 for 0x8000, 0x10000, 0x20000, 0x40000, 0x80000; class 0 otherwise. With d² = |P − camera|² (components stored f32 into the caller's copy, sum in x87) and the f32 tables A = `0x174ae8` {90000, 202500, −1} and B = `0x174af4` {202500, −1, −1}: d² < A and B ≥ 0 → keep all; else d² < B and A ≥ 0 → keep only [2] (mode 2); else drop all. Net: class 0 keeps both under distance 300 and only mode 2 from 300 to under 450; classes 1 and 2 keep nothing.
- **Dispatcher 0x10** (`0x2136c`): only when `0x339cc` passes, i.e. main-flow state byte `0x1863ac` ≠ 1 (state 1 is the teardown state), **so it passes in flight**; then `0x24d78`(subject = the explosion, mode = byte +0x10).
- **Producer `0x24d78`(h, mode)** (jump table `0x24d68`): for an explosion handle the kind is its mb +0x104 (−1 without a block); mode > 3 → −1.
  - 0: nothing, returns 0.
  - 1: n := (rand AND 3) + 10 (drawn for every source kind); when the kind is in `0x91780`, n × `0x24ec4`(h, kind, 1, 0).
  - 2: n := rand % 5; when the kind is in `0x91780` and n > 0, `0x24ec4`(h, kind, 2, i) for i = 0…n−1.
  - 3: X6.
  - Of `0x91780` (0x80, 0x100, 0x200, 0x400, 0x1000, 0x10000, 0x80000) only class-0 kinds pass the gate, so **only kinds 0x80, 0x100 and 0x200 ever shed discriminator-1/2 fragments**; kinds 1, 2, 0x2000 and 0x4000 keep their events and spend the producer's rand without fragments.
- **Constructor `0x24ec4`(h = the explosion, kind, disc, i)** (native p3): allocates kind `0x1000000` (+2 := 1), auxiliary block (on failure frees the object, −1), callback `0x24ac4`; mb +0xF0 := source kind, +0xF4 := disc; disc 2: one rand, +0xF5 := i, +0xF6 := (rand % 10 = 0); disc 1: +0xF6 := 0 (+0xF5 not written). Item from `0x218e8`(explosion, its mb, mode 2): position and rows of the explosion, base velocity = R2 × the explosion's speed. Random direction u (`0x56b8c`: 2 rands; disc 1 calls it twice and keeps the second), then disc 1: spin = rand/32767 × 0.34906585 + 0.08726646 rad (5°–25°) and speed = rand/32767 × 14 + 4; disc 2: spin = rand/32767 × 0.17453293 + 0.08726646 (5°–15°) and speed = rand/32767 × 12 + 4 (each f32). Velocity := base + u × speed; rows := one of the 64 start-up rotations (`0x56cd4`: rand % 64); spin axis := 0 (disc 1) or table `0x174b08`[rand % 3] = {0, 1, 2} (disc 2); `0x21794` (mode 2); presentation item type 8 byte 0. **Not written:** obj +0x1C (DEBRIS record) and +0xD0 (durability), which the allocator zeroes (`0x520d4`, p5) — so these fragments are never projectile targets (pass 2 needs a record and +0xD0 > 0) nor player-collision contacts (same filter). Rands: 7 per fragment (disc 1: 2 + 2 + 1 + 1 + 1; disc 2: 1 + 2 + 1 + 1 + 1 + 1).
- Discriminator 0 is still never produced (P2-12/30 holds).

##### X6. Discriminator-3 fragments (mode 3) — Confirmed (code)

- **Count:** `0x24d78`(source, 3) reads the source's mb +0 (its visual record, created by `0x3d95c` and given the loaded MODL at +4 by the model completion `0x3d904`), that record's +4 (the MODL) and the MODL's list-1 count (+0x0C). It returns −1 (no fragments, the explosion then holds the source) when any of these is 0 or the count ≤ 0; otherwise it calls `0x25124`(source, kind, p) for p = 0…count−1 and returns 0. The MODL is the one `0x65ca4`(kind) names in M2ID 10649 for the kind's bit (the same lookup the visual uses). **Rules read only this count; no part flag, mesh or texture** (the visual completion `0x3e590` reads the part meshes and textures).
- **Constructor `0x25124`(source, kind, p)** (native p3):
  1. kinds 1 and 2 skip p = 1 and p = 2 (no object). (The visual draws parts 0, 1 and 2 together for their part-0 fragment, and prints a debug message for a stray part 1 or 2: `0x3e590`, presentation.)
  2. Allocates kind `0x1000000` (+2 := 1), auxiliary block (failure frees it, −1), callback `0x24ac4`; mb +0xF4 := 3, +0xF0 := source kind, +0xF5 := p (byte).
  3. p = 0: obj +0x8C := counted reference to the source.
  4. Explode-on-expiry flag mb +0xF6: kind 1 or 2 with p = 0 → 0 (kind 1 also sets player-state +0x90 := this fragment, `0x529c0`, the followed object); large kinds → 0; otherwise one rand, flag := (rand AND 7) = 0 (1 in 8).
  5. Item from `0x218e8`(source, source mb, mode 2): source P and rows; base velocity = R2 × source speed (mb +8), one f32 store per component; the item's speed, which becomes the fragment block's +8, is the source's speed. (`0x218e8` completes a mode-2 source's frame as in X2 step 5 before it branches on the new mode, so also for mode 2; no fragment source is in mode 2.)
  6. Record r := `0x249dc`(kind, p) (craft §4.1). With r: offset d := R0 × r[0] + R1 × r[1] + R2 × r[2] (r = DEBRIS +0x00–+0x08, negated at load; each of the nine products stored f32, then per component d = (R1 × r[1] + R2 × r[2]) + R0 × r[0] summed in x87 and stored f32 once; P3-07/18), position := P + d (one f32 store per component), d := normalise(d) (`0x56aa8`; zero length leaves it), **durability +0xD0 := 4000 when DEBRIS +0x5C = 0, 1200 when it is non-zero**. Without r (the pods of kinds 1/2): d := R1, no offset, +0xD0 stays 0. obj +0x1C := r.
  7. Speed s and per-frame spin (rand/32767 × K + C, f32): pods (kind 1/2, p = 0): one rand, s ∈ [2, 8] (×6 + 2), spin = −0.08726647 (−5°, a stored f32); other small kinds: two rands, s ∈ [2, 10] (×8 + 2), spin ∈ [1°, 15°] (×0.24434610 + 0.01745329); large kinds: two rands, s ∈ [2, 5] (×3 + 2), spin ∈ [0.1°, 0.7°] (×0.01047198 + 0.00174533).
  8. Velocity := base + d × s, the product and sum in x87 and one f32 store per component (P3-07/18). Spin axis := 2 for pods, else table[rand % 3]. `0x21794` (mode 2); presentation item type 8 byte 0.
- **Mapping in the shipped data** (data check, all 20 kind bits): for every kind the DEBRIS pair count equals the number of fragments that need a record (list-1 count, or list-1 count − 3 for kinds 1 and 2), so no index is out of range and no zero-count pair is indexed; kinds 13 and 14 have no list-1 parts and no records; the only null records are the part-0 pods of kinds 1 and 2 (player model 10743: 7 list-1 parts → 5 fragments: the pod and parts 3–6 on DEBRIS records 0–3). Out-of-range indices would read past the pair's array, and p > 0 on a zero-count pair a low linear address (`0x249dc` has no bound check) — not reachable with this data.
- **+0x5C classes** (load transform recomputed locally per craft §4.4): 19 of the 67 records are "small" (+0x5C = 1 → durability 1200, always removes a hitting projectile, half contact damage with the per-frame limit), 48 "large" (4000; ¼ ricochet chance; full bounce damage). The smallest distance of r − 3.5 from the threshold 20 is 2.25, so the classes do not depend on rounding details. The content import does not carry +0x5C (`debris-parameters.ts`); Core must compute it (consumer transform).

##### X7. Fragment lifecycle — Confirmed (code)

**Callback `0x24ac4`** (object-update; jump table `0x24aa4`: states 0, 1 → setup; 3 → post 7; 6 → free and leave; 7 → update; 2, 4, 5 → nothing):

- **States 0/1 (first callback):** allocates a timer from pool `0x186410`; expiry timer +8 (relative to this callback's sample s₁):
  - disc 0: s₁ + 0x10 + rand % 0x40 (unreachable); disc 1: s₁ + 0x100 + rand % 0xC0 (4–7 s); disc 2: s₁ + 0x200 + rand % 0xC0 (8–11 s);
  - disc 3, source kind 1, p = 0 (player pod): s₁ + 0x140; source kind 2, p = 0 (wingman pod): s₁ + 0x780;
  - disc 3 with +0xF6 = 1: s₁ + 0x80 + rand % 0xC0;
  - disc 3, large source kind: 0 (**never expires**);
  - other disc 3: s₁ + 0x3C0 + rand % 0x200 (15–23 s).
  obj +0x14 := timer. It posts 0x200 with state 7 when the state is 1 (presentation ready) and 2 when it is 0 (waits for the visual, which `0x3e590` completes; P3-02 lets Core treat new entities as ready). Rands: one, except the pods and large-kind fragments without the flag.
- **State 3:** posts 0x200 with state 7.
- **State 7:** first, when mb +0xF5 = 0 and +0x8C ≠ 0 (only part-0 disc-3 fragments hold one), it posts **message 0x2000000 on +0x8C** and releases the reference; then, when timer +8 ≠ 0 and ≤ sample (unsigned), it posts message 0x10000 and clears +8.
- **State 6:** frees the timer, posts 0x20.
- **Message 0x2000000 → `0x2574c`(source)** (request handling): for a kind-1 subject it only posts item type 4 (2, 5) on it (Likely hides the player model; P3-12) — **the player is not removed and stays in state 4**; any other valid subject gets `0x21650` (state 6) and leaves at its next callback. **This is how a destroyed craft that shed fragments is removed:** fragment created in tick N (state 0) → its first callback at N+1 (state 7 in that tick's request handling, moved in that tick) → hand-off at N+2's callback, source state 6 in N+2's request handling → source's callback at N+3 posts 0x20 → removed in N+3. If the area check (P3-06) removes the part-0 fragment at N+1, the hand-off never happens and the source stays in state 4 (moved, never updated, and not removed by the area check, which needs state 7 and above) until teardown (Confirmed code; Likely rare: the source must be destroyed at the edge of the active area).
- **Message 0x10000 (non-missile, non-projectile subject) → `0x256e4`** (request handling): +0xF6 = 1 → `0x23ac8`(fragment) (the fragment becomes a state-4 source of a variant-2 explosion, held by it and released at the end of its animation) and nothing else; otherwise when the fragment is source kind 1, disc 3, part 0 (player pod): player-state +0x90 := 0, then `0x32e14`(1) (P3-11's rescue or failure); then `0x2574c`(fragment) → state 6, removed next tick. The wingman pod only leaves (no call).
- **Shot down:** `0x24a6c` (projectile pass 2 and the player–fragment collision, [H4](#h4-impact-ricochet-attribution-and-fragment-kills--confirmed-code)) sets +0xF6 := 1 and the expiry to 1, so the next callback fires the expiry and `0x256e4` explodes the fragment.

##### X8. EXPL subset at the mission build — Confirmed (code) unless noted

- `0x23520` is called once per build by `0x66c00` (`0x66ed4`), **after** `0x6721c` (whose record defaults are the build's only other draws, P3-02/03) and `0x486e4` (no draw), and is the build's last draw site (`reach` over the builder's callees, p10). It frees the previous subsets (`0x236dc`), loads EXIC 10211 by ID, allocates three arrays (5, 5, 3 pointers at `0x1863ec`, `0x1863f4`, `0x1863fc`), zeroes their counts (`0x1863f0`, `0x1863f8`, `0x186400`), and for list k: start := rand % countₖ (signed `IDIV`), then requests list[(start + j) % countₖ] for j = 0…4 (0…2 for list 3) through `0x65d10` with completion `0x236c4` (appends the loaded EXPL block and increments the count). **Three rands per build**, in list order.
- Completion order (native p29–p31): the EXPL loader `0x66ad8` loads the record synchronously (`0x6affc`), requests its SND and then its ANIM through `0x65d10` with the completion `0x6685c` (which stores the loaded block into the record field), and then queues a marker request (ID 1) whose callback `0x66b90` calls the caller's callback (here `0x236c4`) with the record and frees the marker. SND and ANIM have no typed loader, so all three go to the plain request queue: `0x6b828` calls `0x6a8f0` with index −1 (append at the end), and the service `0x6baf8` always takes element 0, calls its callback when it is loaded (or at once for a marker) and removes element 0 (`0x6a9f8`(queue, 0)). The queue is a FIFO, so the subset arrays are filled in request order (consecutive from the random start, wrapping; repeats would be kept). The queue is serviced by the scene step (`0x3d4e4` → `0x65dec` → `0x6b8ec`) without a time limit while the player object is absent or below state 7, with a budget of 2 otherwise; so the whole subset is loaded at the first scene step, before any explosion can activate (Likely: timing of the first scene step relative to the first explosion not traced).
- With the shipped EXIC (7, 7, 3), lists 1 and 2 keep 5 distinct entries and list 3 all 3.

##### X9. Timing of directly created objects — Confirmed (code)

**Creation stages** (tick N): request handling (missile detonation `0x2b408`, fragment expiry `0x256e4`, event 0x10, debug kills); movement (projectile hit → `0x2a40c` → `0x2a694` → `0x23ac8`); collision (`0x2a5fc` → `0x2a694` → `0x23ac8`); delayed-player-explosion (`0x23808`); object-update (AI handler `0x6313c`, P3-08). The destroyed source is in state 4 from the call on: it is still moved, but no longer updated, collided or hit by later projectiles of the same walk (pass 1 needs state ≥ 7).

| Object | Created in request handling, movement, collision or delayed-player-explosion of tick N | Created in object-update of tick N (AI handler) |
|---|---|---|
| Main explosion | first callback N+1 → state 7 and activation (EXPL, t₀) in N+1's request handling → first move N+1 | its kind bit is above the walker's, so its first callback is in the same walk (N) → activation in N's request handling → first move N |
| Extra explosion | first callback N+1 at sample s₁; activation at the first callback with sample > s₁ + r, r = rand % 21: at 2 units per tick ⌊r/2⌋ + 1 ticks later → activation and first move N+2 … N+12 | first callback N → activation and first move N+1 … N+11 |
| Fragment (any discriminator) | first callback N+1: state 1 when its visual completed in N's scene step (the visual is requested by the presentation item posted at construction) → expiry set, state 7 in N+1's request handling, first move N+1; otherwise state 0 → 2 and it waits for the completion (when the renderer completes is not traced, P3-02/01) | first callback in the same walk (N), before any scene step: state 0 → posts state 2; its visual completes in N's scene step (state 3); callback N+1 posts state 7 → first move N+1. Its expiry counts from N |
| Source of a craft explosion with fragments | hand-off at the part-0 fragment's first state-7 callback (N+2) → state 6 in N+2's request handling → leaves in N+3 (kind 1: never released) | same: N+3 |
| Held source (missile, fragment, craft without list-1 parts) | released at the explosion update whose frame index reaches the ANIM frame count: activation + 28 ticks (12 frames) or + 14 (6 frames); leaves one tick later | same, from the earlier activation |
| Explosion itself | removal requested at activation + 49 ticks, leaves at + 50 | same |

Under P3-02's convention (Core treats a new entity as presentation-ready), fragments created in request handling and the later stages activate in N+1 as in the original's normal case; a fragment created in object-update and visited in the same walk would activate in N in Core but in N+1 in the original (one-tick difference, AI path only). Removal of every explosion and fragment goes through state 6 and the object's own next callback (message 0x20), as P3-02 specifies; **creation**, however, is not confined to request handling.

##### X10. What reads explosions and fragments (rule coupling) — Confirmed (code)

A scan of every 32-bit immediate with bit 22 or 24 set (p15, p27; and every use of `0x400000`, p28: message types and presentation only) finds these walks: object updates (`0x20938`), movement (`0x221fc`), projectile pass 2 and player–fragment collisions (fragments; both require obj +0x1C ≠ 0 and +0xD0 > 0), the area check (`0x3a468`), teardown (`0x21694`), the end-of-mission wait in `0x3266c` (waits until no object remains), the camera step's presentation items (`0x21584`, mask `0x1600000`), visuals and sound (`0x3d4e4`, `0x3e96c`, `0x55534`, `0x55894`), and **Warp completion `0x2bf08`**, which places the player's Warp exit at the nearest object of **any** kind (all states) within 600 units of the computed exit point (f32 d² < 360000.0), 600.0 above it (P3-09). No other immediate mask covering bit 22 or 24 exists in the image; radar, targeting, missile fuse/blast and object sets use craft masks ([T6](#t6-radar-confirmed-code-unless-noted), [H5](#h5-missiles--confirmed-code-unless-marked)). Masks built at run time are not excluded (AI walks: P3-08). The search (native p32) keeps the object with the strictly smallest squared distance (f32 differences, x87 sum stored f32; ties keep the earlier object in walk order) over mask `0x3ffffff` with no state, activity or kind filter, and moves the exit only when that distance is < 360000.0 (f32). So explosions and fragments influence rules only through: their own lifecycle (source state 4 and its release), disc-3 durability/contacts/shot-down/pod expiry, the Warp-exit nearest-object search, and the shared C generator.

Camera/viewport inputs (presentation state): the variant-2 list switch (`0x2409c`), the event gate (`0x2443c`, plus the viewport `0x175200`), the extra positions (`0x23ac8`) and the flash (`0x24314`) read the 3D camera written by `0x52df4`/`0x52e34`, whose callers are the view-mode camera functions (`0x30ef0`, `0x31xxx`, `0x31ee0`, `0x321d8`, `0x324d8`) and the Warp view (`0x50a28`). Their timing and the camera's values are in [C1](#c1-the-3d-camera-and-its-readers--confirmed-code).

##### X11. Numbers and random draws — Confirmed (code)

- **Storage:** positions, rows, velocities, speeds, spins, offsets f32; durability +0xD0 i32 (4000/1200, decremented by the gun record's i32 damage); DEBRIS +0x5C int (tested ≠ 0); list-1 count i32 (signed `JLE`); variant, discriminator, part, flag bytes; times u32.
- **Clock arithmetic:** sample + constant (u32); event and expiry tests unsigned and non-strict (due ≤ sample); the activation delay and the player-explosion test strict (sample > due); the explosion removal strict (+0x10C < sample). Frame index: 32-bit `IMUL` of 14 by (sample − t₀), logical `SHR 6`, then a **signed** compare with the frame count.
- **Random draws** (all from the single C generator): integer uses `rand % n` (signed `IDIV`, non-negative operand) for n = 3, 5, 10, 21, 0x40, 0xC0, 0x200, 361, 8, 64 and count₁₋₃; low bits `AND 3` and `AND 7`; real values rand × f32 (1/32767) × f64 K + f64 C in x87 at the start-up control word, one f32 store (extras: then × an f32 camera component, one more store). Per object: `0x23ac8` on a craft: fragments (pod 1; small kinds 4 = flag, speed, spin, axis; large kinds 3), then the extra count 1 + 6 per extra; explosion first callback: 0 (craft source), 1 (other source), 2 (extra); activation 1; mode-1 event 1 + 7 per disc-1 fragment; mode-2 event 1 + 7 per disc-2 fragment; fragment first callback 1 (0 for pods and flagless large-kind fragments); the fragment visual completion `0x3e590` draws 1 per disc-1 fragment (texture shape choice) and 3 per disc 0 (unreachable) in the scene step; build 3 (X8). Start-up `0x568b0` fills the 64-entry rotation table `0x1b0a10` with ≥ 128 draws (random forward rows from `0x56b8c`, R0/R1 completed in closed form), and the 361-entry direction table `0x1b1310` from FSIN/FCOS (P3-06).
- **Square roots and trigonometry:** FSQRT in `0x56aa8` (fragment offset, extra direction); squared distances elsewhere; FSIN/FCOS only in the rotation helpers (per-frame spin, 03) and the start-up direction table. No tables in the image (U-009 unchanged).
- **Overflow:** none reachable (small counts; u32 times wrap after 2³² units).

Evidence: ignored `local/research/p3-07/destruction/` (`ghidra_scripts/DestructionProbe.java`, `probe.sh`, outputs `out/p1.txt`–`out/p33.txt`; `data-checks.ts` with `out/data-checks.json`, entry IDs, counts, booleans and one numeric margin). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Every Confirmed (code) step was read from native instructions, with the decompiler used only to navigate, and callers were checked by raw scans of relative transfers and of 32-bit values.

#### Cameras, interfaces and cross-frame order (P3-07/07)

Q-11: what the camera is and which rules read it, the communications reactions called from the damage handler, and when the main flow consumes the facts that combat produces. Extends [automatic views](#automatic-views-and-cameras-p3-0109), [frame pipeline](#frame-pipeline-p3-0201) and [mission failure](#mission-failure-player-loss-and-rescue-p3-0105). *s(N)* is the sample `0x25894` takes in main-loop iteration N.

##### C1. The 3D camera and its readers — Confirmed (code)

- **Storage:** position f32 ×3 at `0x1b075c`–`0x1b0764` and rows f32 3×3 at `0x1b0768` + 12·r; setters `0x52df4` (position) and `0x52e34` (rows), getters `0x52e14` (position), `0x52e90` (rows) and `0x52eec`(r) (one row). Only the start-up initialiser `0x52b30` (an entry of the start-up table, origin and identity rows) sets it otherwise; the mission build does not reset it.
- **Writers:** raw scans of the range and of the setters find only `0x52b30`, the camera step `0x30ef0` with the per-mode camera functions of `0x174b88` and `0x174bdc` and their helpers `0x31ee0`, `0x321d8`, `0x324d8`, and the Warp view `0x50a28`. `0x30ef0` runs in `0x21584`, the last call of every dispatcher pass (it always returns 1, so the fatal exit after it is unreachable), whenever ps and ps +0x8C are non-zero; `0x50a28` runs in the render, only in view mode 1.
- **Value by view mode:** 0xC (F1) and 0xD (F2) give the player craft's own pose (they differ only in cockpit layout and viewport); 0xE, 0xF and 0x10 give the craft position with the rows reordered so that the view looks along R0, −R0 and −R2 (R1 kept); 0x12's function (`0x315bc`) was not disassembled. Mode 0x11 uses its sub-mode's function: 8 is the destruction camera of [automatic views](#automatic-views-and-cameras-p3-0109); 1, 4 and 7 are chase cameras over a 15-pose ring on the player, its target or the wingman; 2, 3 and 5 frame two objects; 6 is the missile camera (below); 0 a fixed offset. Modes without a function (Warp 1, base 6, map 8, 0x13) set the camera to the craft pose at the camera step; in mode 1 the render's `0x50a28` then computes the Warp path pose and writes it both to the camera and to the **player object's position and rows**, so in a Warp the render path writes rule state (P3-09).
- **Timing:** no camera write occurs in `0x3266c`, `0x25894`, the object-update walk or the message loop. Every rule-path reader therefore sees the camera of the previous pass's camera step, built from the poses after the previous pass's movement: in F1 and F2, the player's pose at the start of the pass; in mode 1, the Warp pose the previous render wrote. Readers in the movement, collision and delayed-player-explosion stages are thus one movement step behind the player. After a rescue (C3) readers see the pre-rescue camera until that pass's camera step. No rule-path reader sees a camera written in its own pass.
- **Readers** (12, 11 and 2 call sites of the three getters; no pointer to them; no other instruction reads the range):

  | Reader | Stage | Use | Effect on rule state |
  |---|---|---|---|
  | `0x23ac8` | any stage that destroys (X2) | positions of the extra explosions (camera position, R0, R1) | positions of objects that the Warp-exit nearest-object search can select (X10); the number of draws does not depend on the camera |
  | `0x2443c` | object update (an explosion's first callback) | screen gate and distance class (with the viewport) | decides whether the fragment events fire, hence whether discriminator-1/2 fragments and their draws exist (X5) |
  | `0x2409c` | request handling (activation) | variant-2 list switch by distance (X4) | one draw either way; with shipped data the release time does not change |
  | `0x24314` | request handling | flash | none (a presentation item) |
  | `0x40c90`, `0x40d44` (radar plane offsets ps +0xA0–+0xA8 and projection), `0x3defc`, `0x3fd60`, `0x44d94`/`0x44f74`, `0x489d0`, `0x49004`, `0x505cc`, `0x55984` (sound volume and pan) | render | projection, HUD, sprites, Warp effect, audio | none; `0x44f74` and `0x505cc` draw rand themselves (count not analysed) |

  No targeting, firing, AI, energy, area-check, spawn or main-flow routine reads the camera.
- **Missile camera `0x174c0c`:** written only by `0x3118c` (at launch, when the shooter is the player: the missile handle, uncounted) and `0x3119c` (the player's missile expiring or detonating: impact position and orientation, a 0x100-unit impact view, handle cleared). Its only reader is the sub-mode 6 camera `0x318d0` (F10). Presentation only.
- **Viewport `0x175200`** {left, top, right, bottom} (i32): written at display initialisation and by `0x3d324`(view mode) on every display switch; right is the screen width and bottom depends on the view mode and resolution (F1's cockpit window is shorter than F2's full screen). The fragment gate of X5 therefore depends on the view and the resolution.
- **`0x1b0758`:** min(100, trunc(100 × the viewed object's speed) ÷ the player craft's truncated +0xB8, cached at the first call), set by every camera function and by `0x50a28`; read only by the HUD overlay `0x44f74`. Presentation.

##### C2. Communications reactions `0x3c208` and `0x3c0f4` — Confirmed (code)

The damage handler calls `0x3c208`(attackerKind, source, victim, damage) when the attacker kind is non-zero, before the hull damage, and `0x3c0f4`(attackerKind, source, victim) after it sets the dead flag and before `0x6977c` ([D2](#d2-damage-entry-0x2a694eax-attackerkind-edx-source-ebx-victim-ecx-damage--confirmed-code)); `0x2a5fc` calls one of them after the damage, and a friendly's own update `0x3bed0` calls `0x3c208` with `0x93780` to re-announce a threat. They queue radio messages:

- **Queue:** `0x2c740` keeps an unbounded list (`0x174b3c`) of {message, due = sample + delay, callback}, sorted by due (equal dues first in, first out), every reaction using delay 0. The dispatcher's step `0x2cd60` takes at most one per pass, when sample ≥ due (u32), speech playback is idle and the main flow is in state 3 with sub-state ≠ 2, and posts it as a presentation item that the render plays. `0x2cd20` flushes the whole queue (destruction, beacon expiry, state changes, mission starts).
- **`0x3c208`:** returns at once for an invalid victim or source. (1) When the victim is the wingman (the first kind-2 object): with attacker kind 1 it adds the raw damage to a friendly-fire accumulator `0x174dfc`, which restarts at 0 when sample > its window end `0x174e00` (window 0x780 units); with any other attacker, when its hull is below 30 % of its capacity, it queues a wingman line at most every 0x5A00 units. (2) Attacker kind 1 hitting a friendly (`0x6807C`): a message at most every 0xF00 units (ps +0x78). (3) A friendly (`0x6887C`, not `0x800`) hit by a hostile: at most every 0x2D00 units per victim (+0x17C), a message chosen by the victim's activity and its name's index in TABL 2001 or 2011; for a base or an inactive friendly whose first message resolves, **one rand** (rand % 4) picks a second message. That draw needs the speech archive (`0x174e80`) to be open, so the draw count depends on installation and media state.
- **`0x3c0f4`:** (1) a kill by the wingman while it is active in state 7 and above queues a wingman line with **one rand** (rand % 3); (2) a friendly destroyed within 3500 units of the wingman by a hostile queues a wingman line; (3) when a player or wingman kill leaves no live enemy, every friendly that was under attack gets a thanks message and **ps +0x60** (thanks count) += 1; (4) the player destroying a friendly: a message at most every 0x3C0 units (ps +0x7C); (5) otherwise a friendly destroyed: a message.
- **Draws:** besides the two above, a voice assignment (`0x3c91c`) would draw when an object's +0x180 is negative, which no code writes (Likely never). The view switch to the destruction view draws nothing.
- **Effects on rules:** the friendly-fire accumulator is read by the wingman AI (`0x61f20` refuses commands and `0x61abd` sets AI mode 5 when it exceeds AICO 6001 +0x28; P3-08); ps +0x60 goes into the campaign statistics row (`0x3b8dc`, P3-11). The rescue clears ps +0x78 and +0x7C. Nothing else written here is read by a rule. **Owner:** P3-10 (reactions, timers and queue), with P3-08 and P3-11 consuming the accumulator and the statistic; the speech and left-display presentation is P3-13's.

##### C3. Cross-frame consumption by the main flow — Confirmed (code)

`0x3266c` runs before `0x25894`, so every time test in it compares the previous iteration's sample s(N−1) (u32, non-strict ≥), and its state changes take effect in the same iteration's updates and dispatcher. In state 3 it dispatches the in-mission sub-state `0x186881`: 0 polls the status and the wingman-loss timer, 1 the beacon wait, **2 does nothing**, 3–5 docking. Clip lists played inside `0x3266c` enter the same iteration's step; clip lists played in the dispatcher enter the next iteration's step.

| Fact | Immediate, in frame N | Consumer | Comparison | State that persists |
|---|---|---|---|---|
| Player destroyed | in the damage stage: dead flag, `0x3c0f4`, `0x6977c` (trigger counters, which may schedule spawns through `0x67584` for records with triggers; per-kind destroyed counter; P3-11), `0x32d74` (only in state 3 with sub-state ≠ 2: sub-state 2, queue flush, view 0x11/8 unless already there, which clears the player's target), `0x174ae4` := s(N) + 0xC0 | `0x23808` of a later pass ([X2](#x2-explosion-constructor-0x23ac8h--confirmed-code)) | sample > due, u32 strict | sub-state 2, `0x174ae4`, then ps +0x90 |
| Escape pod expires | request handling: `0x256e4` clears ps +0x90 and calls `0x32e14`(1), whose clip list **plays right there** (`0x39f34`, blocking), then re-initialises the player (`0x67b98`), sets view 0xC, object state 7 and sub-state 0, re-syncs its movement block and counts the rescue; then the pod leaves | the rest of pass N already sees the rescued player (movement with N's step, collisions at the rescue position, parked engagements); the clip time enters N+1's step | timer ≤ sample, u32 | rescue counter |
| Player energy ≤ 0 | energy stage: `0x21ba0` lock, energy 0, `0x33464`, which acts only in state 3 **and** sub-state 0: a left-display notice for 0x3C0 units (`0x4e9e8`), sub-state 1, due `0x186854` := s(N) + 0x3C0. Later depleted updates call it again without effect (no re-arm) | `0x3266c` sub-state 1 of a later iteration M: sub-state 2, flush, `0x32e14`(0) with its clips inside `0x3266c` | s(M−1) ≥ due, u32 | sub-state 1, due |
| Wingman destroyed | damage stage: `0x32dec`, only when flag `0x18682c` is 0: due `0x186818` := s(N) + 0x780, flag 1 (not re-armed while pending) | `0x3266c` **sub-state 0 only**, after the status test: flag 0 and `0x3c4bc`, which queues one radio message. Once the all-clear status is reached the test is never made again and the message is dropped | s(M−1) ≥ due, u32 | flag, due |
| Radio message | any stage (C2) | `0x2cd60` in a later pass | sample ≥ due, u32 | queue until taken or flushed |
| Camera | camera step (Warp: render) | rule readers of the next pass (C1) | — | camera globals |

- **Guards:** a destruction during the beacon wait (sub-state 1, or 3–5) is accepted by `0x32d74`; the beacon due is then ignored and the pod path rescues once, with the destruction clips. A destruction outside state 3 (after the all-clear) changes neither view nor sub-state, and the pod's `0x32e14` does nothing: the player stays dead. Energy depletion in sub-states 1–5 or while dead changes nothing in the flow, but `0x3071c` keeps re-applying the lock to the dead player at each energy update. The damage gates prevent a second destruction while dead.
- **Heavy-damage note:** `0x176710` is −1 at the mission build and written only by `0x69e5c` from `0x2a830` ([D4](#d4-hull-and-subsystem-damage-0x2a830eax-victim-edx-source-ebx-hulldamage-ecx-noattacker--confirmed-code)); its only reader `0x69e1c` sets one of two success-summary flags from it. The rescue does not reset it (P3-11).

##### C4. Object sets — Confirmed (code)

Every 32-bit occurrence of the two set addresses `0x174b78`/`0x174b74` lies in `0x2ede0`, `0x2ee60`, `0x2eff8`, `0x2f028` or the AI step `0x62250`. No combat rule (targeting, radar, firing, missile fuse and blast, collisions, damage, parked engagement) contains one or reaches those routines by direct calls; only the autopilot's and the AI's own target writes depend on them ([T9](#t9-object-sets-0x2ede00x2f028-confirmed-code), P3-08).

Evidence: ignored `local/research/p3-07/interfaces/` (`ghidra_scripts/IfaceProbe.java`, `probe.sh`, outputs `out/p1`–`out/p26`). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Every Confirmed (code) step was read from native instructions; writers and readers were found by raw scans of relative calls, of 32-bit values (pointers included) and, for object fields, of raw displacements.

#### Numbers on the combat paths (P3-07/07)

Q-12: a summary of the numeric semantics that T10, W13, H8, D17, E5 and X11 record path by path. It inherits [x87 precision](#x87-precision-rounding-and-trigonometry-p3-0202): 53-bit x87 precision and the runtime observation of round-to-nearest f32 stores, whose contradiction with the code inference stays open (U-009).

##### N1. Summary — Confirmed (code)

- **Storage:** positions, rows, velocities, speeds, collision shapes, distances, spins, offsets and impact records are f32; resources, hull, damage, durability, ammunition, charge costs, levels, counters and burst counts are i32 with signed compares; clocks and due times are u32. All rule arithmetic runs on the x87 at double precision with an f32 store at each written field; products of two f32 values are exact in double.
- **Float to integer:** always through `0x74518` (64-bit precision, chop, restore) before `FISTP`: truncation toward zero. On these paths: collision raw damage, missile blast fall-off damage, the parked shot count and the parked scaled totals, the commanded speed and craft +0xB8 in the energy rules, the radar's Manhattan distance and screen coordinates. No fixed point is used anywhere on these paths.
- **Integer division and shifts:** signed `IDIV` (toward zero) for `rand % n`, for the division by (3 − group), for the parked shots per target and for the energy and shield ratios; the division by 64 of the energy rules is the shift sequence `SAR 31; SHL 6; SBB; SAR 6`, also toward zero; halvings use `SAR 1` (floor, equal to truncation for the non-negative values that occur), and the AI deadline of homing missiles uses `SHR`. The explosion frame index is a 32-bit `IMUL` followed by a logical `SHR 6`, compared signed with the frame count.
- **Clock comparisons:** additions to the clock wrap at 32 bits. Comparisons are path by path: signed and non-strict for weapon cooldowns (a shot fires at equality); signed and strict for the alternate-mount choice; unsigned and non-strict for the lock stages, projectile expiry, fragment and explosion events, energy updates and the main flow's beacon and wingman timers; unsigned and strict for the automatic target, the keyboard and device polls, missile guidance, the explosion activation delay, the delayed player explosion and the explosion's own removal. Signed and unsigned agree while the clock is below 2³¹ (about 388 days of unpaused running); the Core clock follows the P3-02 safe-integer rule instead of wrapping.
- **Overflow:** none is reachable in normal play. In principle reachable: the parked engagement's gun-damage sum (i32 wrapping adds over an unbounded elapsed time, about 45 hours for the strongest craft; a wrapped total ≤ 0 deals no damage, E5). Not bounded by this research: collision raw damage for very large speed products, and the 768 × damage product in `0x2a830` for collision, parked and AI area damage inputs (D17).
- **Square roots and trigonometry:** FSQRT for lengths (`0x56aa8`, `0x56b14`, the aim's time of flight, the right display's distance); target selection compares squared distances and takes no root. FSIN and FCOS occur on rule paths only in the rotation helpers `0x228cc`, `0x22990`, `0x22a50` (fragment spin, ricochet, missile dispersion, and the movement integrators of P3-06) and in the start-up direction tables. FPATAN occurs on rule paths only through `0x85a8b` (atan2, operands swapped first) in the AI steering `0x5cd1c` that homing missiles use (H5). `0x7558a` is the arc cosine (π/2 − atan2(x, √(1 − x²)), with a checked square root `0x90e58`); in the rules it only computes missile +0x2C at the CINF load, which AI firing reads (P3-08). The other users are presentation or AI: `0x45420` (HUD label set-up), `0x46fe0` (overlays `0x456e4`, `0x45de0`), `0x5b54c` and `0x489d0` (overlay), `0x82c48` (visuals and HUD), `0x5eb64` (AI interpreter, P3-08), `0x92b74` and other 3D-library sites. No sine, cosine or arc table exists in the image; the 361-entry direction table and the 64 random rotations are built at start-up.
- **Random numbers:** one C-library generator serves rules and presentation. Rule draws use `rand % n` with a non-negative operand (support 0…n−1; with 32768 = q·n + r, the values below r have q + 1 preimages and the others q) and low-bit masks (`AND 1`, `AND 3`, `AND 7`, `AND 0xFF`, exact), or real values rand × (1/32767) × K + C stored once to f32. Presentation code draws from the same generator in every rendered frame (radar noise, left-display flicker, corner gauges, the right display's interference, the HUD overlay `0x44f74`, the Warp effect `0x505cc`, the discriminator-1 fragment visual), and the communications reactions draw in the damage handler (C2), so the original sequence of rule draws depends on rendering and on installation state. The draw counts per path are in W12, D12, E4, X11 and H8.

Evidence: the path sections above and ignored `local/research/p3-07/interfaces/` (`out/p4`–`out/p6`, `out/p13`, `out/p14`). Ghidra ran `-noanalysis -readOnly` on a private copy of the project.

#### Runtime check (P3-07/26)

The formal runs of P3-07/26 read these paths in the running original (selected mission, raw difficulty 19,
wingman selector 1, DOSBox-X fixed 40000 cycles; inputs only through recipe stimuli; method, runs and statistics in
[B-009](../behavior/B-009-combat-rules.md#测量结果)). Every item below is **Confirmed (runtime)** for that
configuration only (U-021) and agrees with the code reading above unless it says otherwise. Pause sites were pinned
read-only in Ghidra: the gun shot `0x2e6b6` (after cooldown, misfire and aim, before +0x04 := clock), the missile
launch `0x2e8bd`, the lock update `0x2de2b` (after the due test), the damage entry `0x2a694`, the point after its
gates `0x2a6e5`, the after-shield point `0x2a6ee` and the epilogue `0x2a829` (reached by every path after the gates,
including the fully absorbed one), the destruction branch `0x2a742`, the player's death branch `0x2a806`, the
delayed player explosion call `0x2382e`, the fragment expiry `0x24cfa`, the pod branch `0x25729`, the other-object
energy update `0x309ba`, the forward-search walk `0x63b12`, the camera pass walk `0x215c3` and the parked
engagement call `0x2f279`/`0x2f27e`; per-frame chains used the dispatcher pause `0x2151d` (before the movement
stage).

Counts, windows and the excluded samples are in B-009; the items below state what the runs confirmed.

- **Gun cadence (W5, W6):** with the trigger held, each list gun shot came at the first frame whose sample reached
  the mount's previous shot + cooldown (non-strict, rescheduled from the shot's own sample), for both player gun
  records; gun-1 mounts alternated as W5 chooses; every attempt passed the charge gate. Charge-limited firing matched
  W6 and D14 exactly: the charge balance at each energy update and the shots between two updates,
  ⌊(remainder + refill) ÷ cost⌋, including updates with dt > 64.
- **Projectiles (H1, H2, H4):** the first-callback sample (due − lifetime) followed the creating shot by one frame
  step (0–6 units; the frame count itself was not read). The expiry request came at the first frame with
  sample ≥ first callback + lifetime and the projectile was gone the next frame; mode-1 moves were reproduced bitwise
  from the recorded position, velocity and step, but every one of those sums was exact in f32, so they do not decide
  the rounding direction (U-009). A ricochet requested removal at the first frame with sample ≥ first state-8
  sample + 0x80 and was gone the next frame. The impact removal (`0x25f48`, state 6, then leave) occurred but was not
  followed per frame.
- **Lock (W8):** lock updates at the first frame with sample ≥ previous update + 0x15 and stage transitions
  0→1→2→3→4 at W8's deadlines, in three independent sequences. With no valid target `0x2ddbc` sets the lock to 0 and
  returns before its due test (step 1), so the first update after a target change is not anchored to the previous
  one. A guided launch at lock 4 carried byte 4; a launch after a target change carried byte 1 (unguided path).
- **Missiles (H5):** phase 0 at the second frame after creation; arming strict from that sample. The unguided path
  re-armed its fuse at sample + (G+0x10 SAR 1) at every check; the u32 at linear 0x2C matched the value recorded
  above (31) at every read in the formal runs, so the half-interval branch holds in this configuration. Homing
  missiles chose the full or half interval by the controller distance (≥ 150 full), and their guidance deadline
  followed sample + period at ≥ 250 units and the shifted sum below 250. Two homing missiles (independent start
  states) detonated by proximity at the first callback whose sample exceeded G+0x0C (strict); missile-0 flights
  fizzled at the first sample past their lifetime (strict) and were gone the next frame. A lifetime fizzle of a
  player missile calls the camera hook `0x3119c`(missile, 0) and clears `0x174c0c` (observed: the camera stopped
  naming the newer missile one frame before its own fizzle).
- **Missile blast (H5):** a missile-3 contact hit gave the target the full D (no falloff); the player, trailing
  under the autopilot, stayed beyond r1 and took no blast damage.
- **Targets (T2, T4):** `t`, `r`, `y` and `f` chose as T2 on the census of active candidates, with T4's no-change
  cases (nearest = current for `t`; only the current target qualifying for `r`/`y` in friendly mode; the wingman as
  the only active friendly for `f`). `u` walked all 51 craft objects of the mission, found nothing in front within
  a candidate's radius and wrote nothing (T4).
- **Radar (T6):** the buffer count equals the eligible contacts (activity ≠ 0, state 4 or ≥ 7, not the player) plus
  one target box, which directly follows the target's contact; the target box's shape word is the runtime address
  of `0x409f4` (code base 0x10039000 in these runs).
- **Energy keys (D10):** `e` page 0→1; `s`/`S` and `g`/`G` moved L1 and L2 with the total energy rates of D10; `d`
  on page 1 returned the left display to page 0.
- **Player energy (D14):** each update at the first frame with sample ≥ last + 64; every energy, shield and charge
  change exact from the recorded dt and operands, at commanded speeds below and above c8C (the doubled speed cost),
  including a dt-66 update.
- **Other objects' energy (D14, E3.6):** at the update event `0x309ba`, updates at a due of last + 0x80 (active) or
  + 0x100 (parked) came at the first frame with clock ≥ due; a due that the parked engagement had set to the clock
  was taken in the next frame's energy pass (`0x30590` runs before `0x2f1b0`), as E3.6 step 4.
- **Parked engagement (E3):** transponders (self +0x7C = 0, +0xC4 = 5) returned at E3.2 with no draw and no change;
  a led kind-0x80 craft and a leaderless kind-0x100 craft (target its own +0x90, a base) passed the gates and set
  their own +0x24 to the clock with no draw; the latter, with +0xE0 ≥ 0, found no qualifying missile mount and dealt
  no damage. Neither leader branch occurred. Damage between parked objects followed the shield step below.
- **Damage (D1–D5, `0x30c60`, `0x2a830`):** read at the entry (`0x2a694`) or as transactions after the gates
  (`0x2a6e5`), after the shield (`0x2a6ee`) and at the epilogue (`0x2a829`, reached by every path after the gates).
  The shield step (shield − damage when damage < shield, else shield 0 and the residual to the hull) and the hull
  step (hull − residual) held wherever they apply (hits with subsystem 4 damaged, whose bypass roll was not judged,
  excepted). Victims: craft hit by the player's guns and missiles (a contact missile gave the full damage; a kill
  set the dead flag), parked objects, and the player hit by enemy projectiles (the record damage, absorbed) and by
  collisions (`0x2a5fc`: attacker and source 0). Once a craft's shield was empty, every gun hit drew the subsystem
  roll; a collision changed a subsystem word even with no residual damage (the collision roll).
- **Enemy gun fire (W5, W6):** a start enemy (kind 0x80) firing at the passive player shot from its two mounts
  together, each shot at exactly the previous shot + cooldown, every gate passed. When the AI fires is P3-08's.
- **Destruction (X4, X7, X9; R-10 Core part):** each main explosion activated one frame after the destruction
  branch `0x2a742`; displayed frame (14Δ) >> 6 at every followed frame; removal requested at the first sample with
  Δ > 0x60 (strict) and the explosion gone the next frame; part-0 hand-offs. Fragment rows turned once per frame
  regardless of the step, for discriminators 1, 2 and 3; a fragment does not move in the frame it is created (X9).
  Fragment expiries came at the first frame with sample ≥ due; a discriminator-3 fragment shot down (durability 0)
  expired with the explode flag at its next callback (X7). The player's destruction: at the death branch `0x2a806`
  the delay timer `0x174ae4` held death sample + 0xC0; the delayed explosion call `0x2382e` came at the first sample
  above it (strict); the player's explosion activated the next frame and, with its extras, was removed at Δ > 0x60;
  the pod (the followed object, discriminator 3, part 0) got its expiry exactly 0x140 after its first update,
  turned once per frame and expired at the first frame with sample ≥ due (`0x25729`). A random-due
  discriminator-3 expiry of an enemy fragment fell outside the followed windows.
- **Untested here:** base automatic mounts (W9; all four bases parked at the mission start) and the destruction of a
  kind-0x100 craft (only the parked section-5 group has that kind, far away).

### Two allocator paths: native inputs and profile comparison

**Confirmed (native input sets):** the complete native bodies of `0x38780` and `0x3cb80` each contain one allocator call. At `0x38795`, EAX has the fixed kind `0x4000`, corresponding to M2ID slot 14 and MODL entry 11399. At `0x3cb8f`, EAX has the fixed runtime kind `0x2000000` (bit 25), outside the 22-slot M2ID table. Neither allocation input varies with a caller argument. Both setup paths pass their same kind in EAX and zero in EDX to `0x2d2d8`, which selects a bounded 236-byte parameter record, not an M2ID model. Neither allocation function directly calls the M2ID lookup or archive loader. Native registers/instructions, not inferred C signatures, establish these input sets.

**Confirmed (local and immediate-caller gates):**

- `0x38780` has no local gate before allocation; allocation failure returns failure. A visible source requires auxiliary state allocation; failure frees the newly created object. Other visibility-dependent initialization does not change the kind/model identity. Caller `0x62aa0` invokes it at `0x62b47` only when the source runtime field +0xCC is zero and no object selected by kind mask `0x6c000` is strictly nearer than its parameter-record +0x0C radius. The other call, `0x2148e` in dispatcher `0x20d10`, supplies the event payload at +8 in EAX. The dispatcher's event-case interpretation is **Likely** from read-only analysis; event production and reachability in each candidate remain **Unconfirmed**. P3-05/01 (Confirmed, code): the event is message 0x200000 (dispatcher compare at `0x20da4`, case `0x2148b`), which the flight key `b` posts with the player as subject ([key contexts](#key-reading-and-key-contexts-p3-0501-p3-0502)); other posters were not searched.
- `0x3cb80` likewise has no local pre-allocation gate; allocation or auxiliary allocation failure returns failure, with cleanup after the latter. Its only direct caller, `0x2b9bc`, requires input DL bit 0, effective region-flag bit 0, a non-null player controller, and controller phase byte zero. Region rectangles use inclusive lower/exclusive upper bounds; later matches overwrite earlier region flags. A non-zero controller phase updates an existing object of the same runtime kind rather than invoking this allocator. The input to `0x3cb80` is a pointer to three selected spatial values, not a model selector. Interpretation as a map/Warp destination marker is **Likely**, consistent with [B-001](../behavior/B-001-strategic-map.md); per-candidate input/controller reachability is **Unconfirmed**.

**Confirmed (comparison against existing profiles):** `node local/research/p2-01/two-allocator-profile.ts` compares both identity results against all 54 version-2 source profiles without rebuilding their graphs. Slot 14 / MODL 11399 is already represented in all 51 non-zero campaign slots, including all three slot-1 profiles. It is absent only from the three excluded slot-0 profiles; those must not acquire an unconditional extra-model requirement without reachability evidence. Runtime kind 25 has no M2ID identity and must not be counted as an additional MODL merely by taking its bit position. Thus these two paths establish no additional M2ID model requirement for the campaign candidates. This does **not** close the marker's presentation/parameter dependencies or prove that no downstream resource exists.

**Confirmed (direct-reference scope at that milestone):** six other allocator sites remained untraced; their subsequent input inventory is recorded in the [combined table below](#remaining-direct-allocator-input-inventory). Indirect allocator calls were later excluded by typed references (see [player target modes](#player-target-modes-and-enemy-classification)); full resource closure remains outside this result.

Evidence: ignored `local/research/p2-01/BoundedNative.java`, `two-allocator-native.log`, `two-allocator-guards-native.log`, `two-allocator-caller-gates-native.log`, associated read-only analysis logs/C, and `two-allocator-profile.ts/.json`. Complete native bodies were checked for the two allocation functions, two setup helpers and two immediate gate functions; only an address-bounded call window was read in the larger dispatcher. The report retains `complete: false`, `rankingAvailable: false` and `implicitModelCoverageComplete: false`; no executable-wide scalar scan or gameplay formula prerequisite was added.

### Remaining direct allocator input inventory

**Confirmed (native allocator inputs and local gates):** one complete six-address native export covers 1,321 instructions. Each function has exactly one call to `0x520d4`; its possible EAX input is the singleton shown below. No intervening write or branch bypasses the constant assignment before the call. M2ID positions are checked only when inside the 22-slot table, and a zero entry is not a MODL identity.

| Caller / allocation site | Complete allocator kind set | M2ID result | Local gate and caller/reachability limit |
|---|---|---|---|
| `0x23ac8` / `0x23b3c` | `0x400000` | Bit 22: outside table | Valid source wrapper and non-null runtime +8; a kind-1 source also has a pending/expired time gate. Eight direct caller sites exist (raw scan, P2-12/30; seven before); per-candidate reachability is **Unconfirmed** |
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
| Gun projectile | `0x3fa30` builds one geometry per RENS record (count at +0x5C, 28-byte records at +0x58) with `0x3f758` or `0x3f8c4`, chosen by the record's first field. Both builders only create and fill geometry: they set no texture and load no entry. `0x3fb1c` attaches the record the firing weapon selects | Confirmed (code): procedural geometry parameterised by RENS, with no MESH, MODL or image. Likely (screenshots): gun fire appears as thin coloured line segments. Which records the first mission uses: [weapon records](#weapon-records-and-the-first-missions-shooters-p2-1230) |
| Missile | `0x444ac` builds, for each missile type in a table in the executable's data object (0x7C-byte records at `0x1754a0`, count at `0x1758fc`), body geometry with `0x44848` and `0x44674`, which only create geometry, and one element with `0x44a80`, textured with TEX 10377. `0x44cd8` precomputes 32 rotated texture mappings and loads TEX 10377 by constant ID; only rotation 0 is applied, to the element as it is built. `0x4457c` attaches the body and a copy of the textured element, which keeps rotation 0's texture coordinates (corrected by P2-11/15, see [effect texture mappings](#effect-texture-mappings-p2-1115-research)) | Confirmed (code): TEX 10377 plus procedural geometry from executable tables. `srangers_099.png` shows a missile in flight: Likely type 1, the player's selected missile, whose outline it matches; P2-12/21 had matched it to type 5, which the first mission cannot launch ([weapon records](#weapon-records-and-the-first-missions-shooters-p2-1230)). Its textured element is the flame trail behind the body (Likely) |
| Debris (fragment objects) | `0x3e430` loads TEX 10151 into `0x187014` and MODL 10383 into `0x187010` by constant ID. It then builds three untextured geometries (`0x3e9db`, cells `0x1752a0`–`0x1752a8`) and two geometries that are textured with TEX 10151 when textures are enabled (`0x3eab4`, cells `0x1752ac` and `0x1752b0`), all from constant vertex tables in the executable. Callback `0x3e590` draws a fragment by its discriminator: 0, one of the three untextured geometries; 1, one of the two TEX 10151 geometries; 2, one list-1 part of MODL 10383 with its texture; 3, one or three list-1 parts of the source object's M2ID model | Confirmed (code) |

**Confirmed (destruction fragments and fragment events):** the explosion constructor `0x23ac8` calls producer `0x24d78` in mode 3 when the destroyed object is a craft kind (bits 0–19), so a destroyed craft sheds fragments from its own model's list 1 (discriminator 3). Dispatcher event `0x10` calls the producer with a mode from the event payload, giving discriminators 1 and 2 for kinds in mask `0x91780`. P2-12/30 found its poster and P3-07/06 its gate and timing (below and [destruction](#destruction-explosions-and-fragments-p3-0706)). Discriminator 0 is not emitted by this producer. The external-view capture `local/StarRang/captures/srangers_044.png` shows small textured fragments next to an explosion animation (Likely fragments).

**Fragment producers (P2-12/30, read-only; raw byte scans of the code object for direct transfers, 4-byte values with relocations and stores at the discriminator offset, cross-checked with a second scan):**

- **Discriminator 0 never occurs (Confirmed, code):** objects of kind `0x1000000` are allocated only by three constructors. `0x24ec4` writes discriminator 1 or 2 and is called only by producer `0x24d78` in modes 1 and 2. `0x25124` writes 3 and is called only in mode 3. `0x25500` would store a caller's value, but no transfer, pointer or relocation reaches it. No code changes an existing object's kind to `0x1000000`, and the auxiliary setup's default 0 is overwritten by both reachable constructors before the visual is created. The callbacks keep unused branches for discriminator 0. Not ruled out: stores through computed pointers, and save/restore paths; neither appears in any fragment code.
- **Event `0x10` (Confirmed, code):** it is posted only by `0x23838`, the update callback of explosion objects (kind `0x400000`), with modes 0, 1 and 2; mode 0 creates nothing. For an explosion whose source is a craft (kind bits 0–19), the three are due 8, 12 and 16 clock units (0.125–0.25 s, [time base](#simulation-time-base-p3-0106)) after it starts. The gate `0x2443c` first drops them unless the explosion is on screen. Kinds 4, 8, 0x10, 0x20, 0x40, 0x400, 0x800 and 0x1000 lose them all, and so do kinds 0x8000–0x80000. All other kinds keep both modes under distance 300, only mode 2 from 300 to under 450, and none beyond.
- **Consequence for the first mission (Confirmed, code, P3-07/06):** of mask `0x91780`, slots 7, 8 and 9 can shed discriminator-1 and -2 fragments; slots 10, 12, 16 and 19 never do. So the two enemy types shed them when destroyed near the camera, besides their own list-1 parts, while the player, wingman, transponder and base shed only list-1 parts. The handler runs only when the dispatcher gate `0x339cc` passes; it tests main-flow state ≠ 1, so it passes in flight (it also gates enemy spawning). In `srangers_098.png`, an enemy one's destruction, thin textured triangles like the two textured debris shapes appear beside a fragment of the craft's list 1.

#### Weapon records and the first mission's shooters (P2-12/30)

Read-only analysis of the weapon code and of CRAFT.NOB data, 2026-10-08 (structure, indices and entry IDs only; names are not recorded).

- **Weapon data (Confirmed):** an init routine loads CRAFT.NOB TABL 4003 into `0x174b68`: 18 rows, each three {entry ID, scale} pairs. The mission builder `0x66c00` calls `0x2cf38` (at `0x66dad`; its only caller) with the clamped SCCT slot as the row and the clamped group as the column, which loads that CINF entry into `0x174b70`. The selected first mission (group 0, slot 1) uses CINF 4037. A CINF holds 10 gun records, 9 missile records and 20 craft records indexed by kind bit (plus missile-body records). After loading, `0x2cf38` overwrites the first word of every gun and missile record with its array index, so gun record i draws RENS record i (`0x3fb1c`) and missile record j draws missile visual type j (`0x4457c`). It also rewrites derived fields: gun +0x0C and +0x10; missile +0x08, +0x0C, +0x10, +0x2C and +0x50; craft +0x14 and, when the craft has boxes, its bounds; and gun-mount +0x08 ([craft §3.8](./craft.md#38-load-transforms-in-0x2cf38-confirmed-code), which also gives the record layouts).
- **From craft to shot (Confirmed):** spawning (`0x67938`, `0x67b98`) gives each object the craft record of its kind bit, and `0x2d400` builds one state per weapon mount and the selection of three mount groups. Shots come only from `0x2e5e8` (guns), `0x2e86c` (missiles) and `0x2dad0` (mounts marked automatic, always as guns), each posting event 8 with the mount's weapon record; a scan finds no other poster. `0x25b0c` and `0x2b00c`, the only allocators of projectile and missile objects, pass that record to the visual.
- **The first mission's shooters (Confirmed, CINF 4037):**

  | Shooter (kind bit) | Guns (RENS records) | Missile types |
  |---|---|---|
  | Player (0) | 0, 1 | 0 (a third main-weapon entry, selected with `/`), 1 (default) and 3 (selected with `<`, `,`, `>` and `.`) |
  | Wingman (1) | 0, 1 | 1 and 2 in its missile group; whether its AI launches them was not traced (Likely) |
  | First and second enemy types (7, 8) | 2 | none |
  | Transponder (14) | none | none |
  | Base (17) | 6, automatic only | none |

  RENS records 3, 4, 5, 7, 8 and 9 and missile types 4–8 are used only by kinds that SCEN 3019 does not contain, so the first mission cannot draw them. Records 0 and 6 have the same colour. The enemies' missiles in the other groups' CINF files are outside the slice.
- **Captures (P2-12/30):** the player's two guns (`srangers_112.png`, `114.png`), the enemy guns (`113.png`, `109.png`) and the base guns (`128.png`) show records 0, 1, 2 and 6. In `srangers_017.png` the HUD weapon line names gun record 0 and missile record 1, the defaults (compared locally; names not recorded), and the first-mission captures `srangers_067`, `072`, `098`, `099`, `103`, `112` and `128` show the same missile name. A public gameplay video's match of record 5 to the second enemy type's shot comes from a later mission.
- **Untraced:** which wingman behaviours launch missiles (P3-08); writers of a mount's weapon other than `0x2d400` were not scanned exhaustively, while event posting was. The fire triggers are in [input polling](#input-polling-p3-0201); mounts, lists, selection and firing in [weapons](#weapons-mounts-selection-and-firing-p3-0702).

**Confirmed (structure and constant references):** MODL 10383, the only MODL outside M2ID, has only list 1: 6 parts with flag 3, 6 distinct meshes, 260 vertices and 240 triangles, and no sounds. Every part names TEX 10151. TEX 10151 is a raw 256 × 256 record with a 16-entry palette and uses no ambiguous entry. TEX 10377 is a raw 64 × 64 record with a 16-entry palette whose pixels use an ambiguous entry ([textures §3](./textures.md#nearest-colour-metric-and-tie-rule-confirmed)). A scan of the executable for 32-bit constants finds MODL 10383 named three times, all in the fragment effect setup and teardown. MODL 10383 is also passed to the generic model request `0x6a024`, which many callers use, including the mission builder. The one MESH that no MODL names (8 vertices, 4 triangles) is not named by any 32-bit constant in the executable; whether anything uses it is Unconfirmed.

Under [ASSET_UNITS](../../../src/content/asset-units.ts), MODL 10383 is a whole-entry model and TEX 10151 and TEX 10377 are whole-entry images. RENS records and the executable's vertex tables are not image or model sources; whether and how the import represents them is a P2-06 contract question (see U-027).

#### Effect geometry data (P2-06/14 research)

Same bounded read-only method, extended with native instruction exports of the exact ranges and counts-only probes of the RENS entry and the executable's data object (2026-10-06). Values are not recorded here.

**Confirmed (projectile visuals):** RENS entry 10751 (the only RENS entry, 376 bytes) has a 96-byte header followed by 10 records of 28 bytes. Header +0x58 is a relocated pointer to the records, equal to the header length, and +0x5C is their count. The other header fields, +0x00 to +0x54, feed the scene's lights, renderer settings and screen flashes ([data loaded by the loop](#data-loaded-by-the-loop-p3-0110)); their meaning is otherwise Unconfirmed. A record is:

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

Across all 9 records, segment counts are small integers, colours fit 24 bits and the floats are finite. `0x44cd8` precomputes 32 rotated texture mappings for the element, of which only rotation 0 is applied ([effect texture mappings](#effect-texture-mappings-p2-1115-research)). The weapon parameter's first word selects the type, clamped to the last one.

**Confirmed (debris shapes):** `0x3e9db` builds an untextured 6-vertex shape from code-object templates (vertices `0x3e2a0`, a per-vertex list of 18 words `0x3e2e8`, face list `0x3e330`) at a given scale. `0x3e430` calls it with three immediate scale constants. `0x3eab4` does the same from `0x3e368`, `0x3e3b0` and `0x3e3f8`, computes a cylindrical texture mapping from its bounding box (recorded as planar before P2-11/15), and binds TEX 10151 when a runtime flag is set (Likely the texture setting). `0x3e430` calls it with two immediate scale constants. The per-vertex list is passed where the projectile and missile builders pass none. It holds vertex normals (Confirmed, code, P2-11/15): `0x80c14` copies it into the mesh's normal array and normalises each entry; without it, the normals are averaged from the faces.

**Confirmed (face lists, corrected by P2-11/15):** a face list is a sequence of faces ending with 0. Each face is a corner count followed by one entry per corner. In `0x80c14`, an entry is a vertex index when the builder passes no per-vertex list (normal count, ECX, is 0). Otherwise it is a pair (vertex index, normal index): both the face-count loop and the build loop read the extra word.

- Every other effect builder clears ECX: the two projectile builders (`0x3f86f`, `0x3f9db`), fin (`0x447a8`), body (`0x449e0`), element (`0x44b9d`) and extra element (`0x44c9d`). Their templates hold triangles, and the element templates quadrilaterals; each parses to its last word, the only terminating 0 (P2-06/18 local check).
- Both debris builders pass a normal count equal to the vertex count (`0x3ea73`, `0x3eb4b`). Read as pairs, each debris template is a single face of 6 corners, ending at its last word, with the normal index equal to the vertex index at every corner (P2-11/15 local check, counts only). The renderer therefore accepts polygons with more than 4 corners.
- The reading before P2-11/15 (vertex indices only, giving one face of 6 corners and one of 5) also ends at the last word, but only by coincidence.

**Builder rules (Confirmed, code; structure only, no values):** for the geometry creation call `0x80c14`, every builder passes a vertex count, a vertex array (x, y, z per vertex), an optional per-vertex list and a face list. Colour and a mode word go to `0x82340`, and a second mode word to `0x8249c`. Their values are builder constants: RENS colour for projectiles, packed record colour times a scale constant for missile bodies and fins, and immediate operands otherwise.

- **Projectile:** the template's 4 vertices are processed in order. A component whose bits equal the unit marker or its negation is multiplied by the width. A z component that then equals the tail marker is multiplied by the length times the selected builder's length constant. Both markers are immediate operands of the builder's comparisons.
- **Missile body:** for k = 0 … n − 1 with angle θ = k × (angle constant ÷ n), accumulated by addition from 0:
  - vertex 2k is (r0 cos θ, r0 sin θ, 0) and vertex 2k + 1 is (r1 cos θ, r1 sin θ, length);
  - face j is the quadrilateral (2j, 2j + 2, 2j + 3, 2j + 1), each index taken modulo 2n;
  - the face list ends with 0.
- **Missile fin** (parameters p0–p3): 9 vertices (0, 0, p2 + p3), (±p0, 0, p3), (0, ±p0, p3), (±p1, 0, p3), (0, ±p1, p3), in that order, with each ± pair positive first. The face list is the template.
- **Missile element** (e0, e1, e2): for k = 0, 1, 2, with the angle accumulated by the element step constant, vertex 2k is (e0 cos θ, e0 sin θ, 0) and vertex 2k + 1 is (e1 cos θ, e1 sin θ, −e2). The face list is one of two templates, chosen by the flag. The texture mapping is rotation 0 of 32 precomputed rotations.
- **Missile extra element:** three vertices on a circle in the plane z = −e2 + c, where c is a data-object constant. The radius is e0 + (−z) × (e1 − e0) ÷ e2, the angle is accumulated by another step constant, and the face template has one triangle.
- **Debris:** every template vertex component is multiplied by the call's scale.
- **Texture mappings:** the missile element's rotations and the textured debris shape's mapping go through `0x82ae8`. P2-11/15 traced how they become texture coordinates; see [effect texture mappings](#effect-texture-mappings-p2-1115-research).

**Builder arguments (Confirmed, code; P2-06/17, structure only):**

- **Missile constants:** the 7 doubles from `0x171ac8` to `0x171b00`, in address order, are:
  1. the fin colour scale;
  2. the body angle (the step is it divided by the segment count);
  3. the body colour scale;
  4. the element angle step;
  5. the extra element's offset c;
  6. the extra element's angle step;
  7. the rotation angle step.

  The rotation scale is a double argument of `0x44cd8`, pushed as two halves: a 32-bit push at `0x444b5` (high half) and an 8-bit push at `0x444ba` (low half). Each rotation passes the reciprocal of this scale to `0x82ae8`.
- **Colours:** `0x82340` receives three floats, in argument order:
  - **Projectile:** the record's colour.
  - **Missile body and fin:** the packed colour's bits 16–23, 8–15 and 0–7, each times the body or fin colour scale.
  - **Missile extra element:** immediate pushes at `0x44cb2` (8-bit), `0x44cb4` and `0x44cbb`.
  - **Untextured debris:** immediate pushes at `0x3ea7f`, `0x3ea81` (both 8-bit) and `0x3ea85`.
  - **Textured debris:** immediate pushes at `0x3eb65`, `0x3eb6a` and `0x3eb71`.

  The push order is the reverse of argument order. The textured missile element calls no colour function.
- **Missile flag:** the element builder compares the flag as a float with zero, while the initialisation compares its 32-bit word with zero. So a negative zero selects the zero-flag face template and still adds the extra element.
- **Projectile markers:** each builder compares each axis against its own pair of 32-bit immediates (`CMP` with the immediate at +2):
  - x at `0x3f7bd` and `0x3f7c5`;
  - y at `0x3f7e4` and `0x3f7ec`;
  - z at `0x3f80b` and `0x3f813`.

  The tail comparison is at `0x3f82e` (immediate at +4). Builder `0x3f8c4` has the same instruction layout 0x16C bytes later. The pairs are the unit marker and its negation for every axis.
- **Mode words (Unconfirmed meaning):** both mode words are register arguments. Some builders set the register just before the call. Others call `0x8249c` or `0x82340` with the value still in the register from the preceding call: callees preserve registers under the Watcom convention.
- **Textured debris mapping:** the mapping depends on the shape's bounding box, the double at `0x1718ea` and immediate arguments of `0x82ae8`, all listed in [effect texture mappings](#effect-texture-mappings-p2-1115-research). P2-06 does not import it (spec technical decision 17).

**Confirmed (no load-time relocations):** Ghidra's relocation table (from the LE fixup records) has no entry inside any of the template, table, constant or immediate-operand ranges named above. The relocations next to the debris scale immediates belong to the following store instructions.

**Consequence:** every effect geometry is reproducible from RENS, static data in the executable and the builders' arithmetic, without runtime state. The projectile visuals depend on the executable's templates as well as on RENS. Normals for projectiles and missiles are not stored; the renderer computes shading.

Evidence: ignored `local/research/p2-06/effects/`: `NativeRange.java` and the native exports `native-projectile.txt` and `native-effects.txt`, decompilations `visual-builders.c`, `visual-inits.c` and `effect-init.c`, reference logs, and counts-only probes of RENS and the data object.

Evidence: ignored `local/research/p2-06/effects/`: the read-only scripts `DecompileEntry.java` and `FindPointerValues.java`, their logs and exports, the call-target and constant scans, the structure probe `effect-resources.ts/.json` and a capture contact sheet.

#### Effect texture mappings (P2-11/15 research)

Bounded read-only analysis for P2-11/15 (2026-10-06) by the same method: `-noanalysis -readOnly`, with disassembly done in memory and discarded. No decompiled code is reproduced here, and no values from the game's data (its doubles, scales or tables). Two kinds of value are stated because they define the formulas, as the builder rules above do: two library constants, named by the identity they hold (1/2π, 1/π), and the immediate operands that fix each wrap's type, axes and unit scale. The wrap object's layout agrees with Microsoft's DirectX 2 documentation of `IDirect3DRM::CreateWrap` and `IDirect3DRMWrap` in the retained-mode API derived from this renderer. That agreement only supports the reading; every statement below comes from the code.

**Confirmed (wrap creation `0x82ae8`):** under the Watcom register convention, EAX holds the wrap type (a byte) and EDX a reference frame handle or 0. Then come 13 floats on the stack (the callee pops 0x34 bytes), in argument order:

| Arguments | Wrap object offset | Meaning |
|---|---|---|
| type | +0x2C (byte) | 0 flat, 1 cylinder, 2 sphere, 3 chrome |
| frame | +0x30 | Reference frame; 0 for none |
| ox, oy, oz | +0x34 … +0x3C | Origin O |
| dx, dy, dz | +0x40 … +0x48 | Direction: the wrap's z axis |
| ux, uy, uz | +0x4C … +0x54 | Up: the wrap's y axis |
| ou, ov | +0x9C, +0xA0 | Texture origin |
| su, sv | +0xA4, +0xA8 | Texture scale |

It returns the wrap's handle. `0x92c40` builds the wrap frame:

- D = normalize(direction);
- U = normalize(up − (up · D) D);
- R = U × D.

The frame matrix has rows R, U and D, with O as translation. `0x94260` stores its inverse at +0x58; for this orthonormal case it calls `0x93e54`, which transposes and sets the translation to −(O·R, O·U, O·D). Normalisation (`0x948a4`) uses an exact reciprocal square root (`0x8777c`) and maps a zero vector to (1, 0, 0).

**Confirmed (application `0x82f88` and coordinates `0x82c48`):** applying a type 3 wrap to a mesh (class "Mesh", descriptor `0x178cc8`) does nothing. For the other types, every vertex (count +0x48, array +0x50, 0x30-byte records) is expressed in the wrap frame (`0x943b0`):

p = (p_x, p_y, p_z) = ((v − O)·R, (v − O)·U, (v − O)·D).

u and v are then written to the vertex at +0x10 and +0x14:

- **Flat (0):** u = su·p_x − ou and v = sv·p_y − ov.
- **Cylinder (1):** a = atan2(p_x, p_y) / 2π. `0x85a8b` is FPATAN with p_x as the first operand, and the double at `0x173a25` is 1/2π. a = 0 when p_x and p_y are both ±0, and a < 0 becomes a + 1. Then u = su·a − ou and v = sv·p_z − ov.
- **Sphere (2):** a is as for the cylinder. b = acos(p_z / |p|) / π (`0x7558a`, with 1/π at `0x173a2d`), or 0 when |p| is ±0 or |p_z / |p|| ≥ 1. Then u = su·a − ou and v = sv·b − ov.

Every stored value is a 32-bit float; intermediate results are x87 values, and the FPU precision setting was not examined. Faces have a count at +0x54 and an array at +0x5C of 0x78-byte records. The application then sets each face's byte +0x54 to 0 for flat or 0xC for cylinder and sphere, and byte +0x55 to 0.

The coordinates are computed once, when the wrap is applied. `0x82c48` has four call sites: two in `0x82f88` (`0x83002`, `0x83087`) and two in the relative application `0x830bc` (`0x8319e`, `0x8321f`), which no rel32 call or jump reaches. Type 3 (chrome) is computed from vertex normals by `0x82e18`, called only from `0x830bc` (`0x83174`); no effect uses it.

**Confirmed (missile element: only rotation 0 is applied):**

- During scene creation, `0x444ac` calls `0x44cd8` once with the rotation scale s, the double pushed at `0x444b5`/`0x444ba`. For k = 0 … 31, θₖ starts at 0 and is accumulated in double precision by the rotation angle step, the double at `0x171af8`. Wrap k has these arguments:

  | Argument | Value | Source (operand at +1 unless noted) |
  |---|---|---|
  | Type | 1 | `MOV EAX, imm32` at `0x44d30` |
  | Frame | none | `XOR EDX, EDX` at `0x44d2c` (no operand) |
  | O | (0, 0, 0) | `PUSH imm8` at `0x44d35`, `0x44d2e`, `0x44d2a` |
  | Direction | (0, 0, 1) | `PUSH imm8` at `0x44d28`, `0x44d26`; `PUSH imm32` at `0x44d21` |
  | Up | (cos θₖ, sin θₖ, 0) | FSINCOS results stored as floats at `0x44d1e` and `0x44d18`; `PUSH imm8` at `0x44d13` |
  | ou, ov | 0, 0 | `PUSH imm8` at `0x44d11`, `0x44d0f` |
  | su | 1 | `PUSH imm32` at `0x44d0a` |
  | sv | 1/s | reciprocal computed in double, stored as a float at `0x44d07` (no operand) |

  The handles go to a 32-entry table at `0x175900`.
- For a vertex at polar angle φ about the z axis (x = r cos φ, y = r sin φ, r > 0), wrap k gives u = frac((θₖ − φ) / 2π) and v = z / s.
- `0x44a80` applies the table's first entry (`0x44bb7`, `0x44bbe`) to each type's element mesh as it builds it. A scan of every initialised block finds exactly three 32-bit words that hold an address inside the table:
  - the teardown loop (`0x44477`);
  - this application;
  - the creation loop (`0x44d3c`).

  Wraps 1–31 are therefore created and released but never applied.
- `0x4457c` stores rand() mod 32 in the visual record (+0x1C), but no wrap is applied with it. It attaches a copy of the element made by `0x855f0`:
  - the call goes through the class method at descriptor +0x20;
  - class initialisation (`0x76470`) replaces the inherit marker `0x927a0` in that slot with the parent's entry, the generic copy `0x9274c`;
  - `0x9274c` creates a new mesh and calls the Mesh copy method `0x7fcf0`, which copies each vertex's u and v and each face's bytes +0x54 and +0x55.

  Every missile element therefore shows rotation 0's coordinates.

**Confirmed (textured debris: a cylindrical mapping):**

- `0x3eab4` builds the scaled shape and reads its bounding box with `0x826fc`: the minimum corner is at mesh +0x78 and the maximum at +0xCC, filled by `0x805fc` and `0x7a9b4`. It computes h = max_y − min_y and 1/h.
- It then creates a wrap with these arguments, where K is the double at `0x1718ea`, read by the `FMUL` at `0x3eb9d`:

  | Argument | Value | Source (operand at +1 unless noted) |
  |---|---|---|
  | Type | 1 | `MOV EAX, imm32` at `0x3ebd1` |
  | Frame | none | `XOR EDX, EDX` at `0x3ebd8` (no operand) |
  | O | (0, 0, 0) | `PUSH imm8` at `0x3ebda`, `0x3ebd6`, `0x3ebcf` |
  | Direction | (0, 1, 0) | `PUSH imm8` at `0x3ebcd`; `PUSH imm32` at `0x3ebc8`; `PUSH imm8` at `0x3ebc6` |
  | Up | (0, 0, 1) | `PUSH imm8` at `0x3ebc4`, `0x3ebc2`; `PUSH imm32` at `0x3ebbd` |
  | ou | 0 | `PUSH imm8` at `0x3ebbb` |
  | ov | min_y/h | computed, stored as a float at `0x3ebb8` (no operand) |
  | su | 1 | `PUSH imm32` at `0x3ebb0` |
  | sv | K/h | computed, stored as a float at `0x3eba6` (no operand) |

  It applies the wrap once to the shape (`0x3ebe5`) and releases it (`0x3ebec`).
- In model coordinates this gives u = frac(atan2(−x, z) / 2π), or 0 on the y axis, and v = (K·y − min_y) / h.
- `0x3e430` builds two shapes with this rule. The scale enters only through the vertices, so in exact arithmetic both scales give the same coordinates.

**Confirmed (unreachable third wrap):** in the fragment callback `0x3e590`, the discriminator 3 path holds a third wrap creation (`0x3e8cb`) and application (`0x3e8e1`). It is a cylinder built from a model part's bounding box and the double at `0x1718e2`. Its guard needs a local that every discriminator 3 path sets to 0, so it never runs, and model fragments keep their model coordinates.

**Unconfirmed (not examined):** the module that `0x41c00` initialises creates four wraps for its own visuals (`0x42328`, `0x42399`, `0x4242d`, `0x424ce`; the three checked are type 2) and applies wraps at `0x41eb5` and `0x42916`. These visuals are not among the three effects.

**Unconfirmed (seam interpolation):** after a cylinder wrap each vertex has a single (u, v). A face whose corners straddle the u = 0/1 seam is therefore drawn either across most of the texture or around the seam, depending on the renderer. The application gives cylinder-mapped faces byte +0x54 = 0xC. Two render preparation paths of the mesh (`0x7db10`, `0x7e640`) put bytes +0x54 and +0x55, with the texture, into each batch's state key. A third (`0x7d530`) passes them to `0x7d3c8`, which ignores them, so the rule may differ by path. The resulting command list is executed through a device method (`0x7cca3`), which was not traced, so the seam rule is Unconfirmed. The retained-mode documentation describes shortest-path interpolation enabled by separate u and v mapping flags, but this byte was not matched to them. Affected faces (counts only):

- missile element, zero-flag face template (`0x44334`): 1 of its 3 faces spans more than half the texture in u at rotation 0;
- missile element, other template (`0x44374`): 2 of its 6 faces;
- debris: its single 6-corner face; 4 of its 6 vertices lie on the wrap axis and take u = 0.

**Consequence:** the mapping inputs are static:

- **Missiles:** the rotation scale and rotation angle step, plus the immediate operands above.
- **Debris:** the template vertices and scales, the double at `0x1718ea`, plus the immediate operands above.

The coordinates do not depend on runtime state. The texture setting at `0x1863c8` only decides whether TEX 10151 is bound, and the random index does not affect the texture coordinates. How faces that span the seam are displayed remains Unconfirmed.

Evidence: ignored `local/research/p2-11/effect-mapping/`:

- the read-only scripts `NativeRange.java`, `DecompileEntry.java`, `CallSites.java`, `FindDisp.java`, `OperandScan.java`, `ConstRefs.java`, `DumpValues.java` and `DumpString.java`;
- the native exports `native-*.txt` and the decompilations `wrap-api.c`, `face-flags.c` and `group-state.c`;
- the Ghidra logs and the counts-only `seam-counts.py` and `debris-faces.py`.

**Confirmed (local import check, P2-11/16, 2026-10-07):** the mapping fields used by the schema-2 effect payloads were compared with an independent LE page-map reader of the catalog-matched local executable. Both fields (the missile rotation scale and debris K) match exactly: 2 comparisons, 0 differences. The 6 retained missile geometry constants were independently compared in source order, also with 0 differences. All 3 effect payloads use schema 2; the missile imports no rotation step, because only rotation 0 is used. The script and counts-only result remain in ignored `local/research/p2-11/effect-mapping-display-check.ts` and `.json`. This verifies imported fields, not original rasterisation or seam interpolation, which remains Unconfirmed.

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

**Confirmed (bounded negative result), Unconfirmed (where the nearest-DATA mapping happens):** P2-05 subtask 11 searched for the code that maps TEX colours to the nearest DATA colour (see [textures](./textures.md#nearest-colour-metric-and-tie-rule-confirmed)). The search was read-only, against the existing Ghidra project without reimport, and checked exactly these functions:

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

**Confirmed (nearest-colour search found, P2-06/12, 2026-10-06):** following the DATA palette instead of the TEX path found the search, inside the 3D renderer. The renderer is Likely RenderMorphics Reality Lab: its assertion texts name source files under `..\rl\` and `..\rlpatch\`, such as `ramplt.c` for its ramp colour model; the code below is Confirmed whatever the library is called.

- **Screen palette:** flight setup loads DATA 11075 at `0x3ecdc` and passes it to `0x3d1c0`. That function writes 256 four-byte entries at `0x186c00`: each 6-bit component shifted left by 2, with flag byte 1.
- **Devices:** the two 3D devices are created by `0x3d0b0` and `0x42b04` through `0x7b710`. Their static pixel-map descriptors at `0x175224` and `0x1753ac` give 8 bits per pixel, indexed, 256 palette entries, and the palette at `0x186c00` (descriptor +0x34 and +0x38).
- **Colour manager:** `0x952b0` creates the device's colour manager with `0x9e100` and enters every palette entry whose flag is 1 with `0x9e24c`. All 256 DATA colours are therefore allocated, and none is free.
- **Lookup `0x9e304`:** this is the manager's find method (slot +0x428, exposed through the interface at +0x424, which the driver returns for query token 0x10). It works in order:
  1. An exact match in a 257-bucket hash returns the existing entry. Entries are entered from the highest index down and each goes to the head of its bucket, so duplicate colours give the lowest index.
  2. An allocation callback at +0x418 is tried next; it is never set.
  3. A free entry is taken next; there are none.
  4. Otherwise a linear scan in ascending index order over the allocated entries keeps the strictly smallest (c0 − e0)² + (c1 − e1)² + (c2 − e2)² over integer components. It starts from a bound larger than any possible distance, so ties go to the lowest index.
- **Ramp shading (Likely for textures):** Reality Lab's ramp code (`0x6c8d4` and `0x6c0e8`, file `ramplt.c`) allocates colour ramps in a 4,096-slot table. The table is created by `0x9e6d0` for query token 0x11, and every slot is filled through `0x9e304` with 8-bit integer components.
  - A single-shade ramp passes its colour unchanged.
  - With more shades, each entry is the colour scaled by its position and combined with two other material terms, then rounded and clamped.
  - When `0x874f0` cannot allocate slots, `0x6c8d4` shares the closest existing ramp, chosen by `0x6c598` under a ramp-level metric.

  Textures are created with `0x850ec` and then given a colour count (`0x8526c`) and 4 shades (`0x852c8`), which matches ramp-model texture shading. The ramp builder for texture colours and how lighting picks a shade were not traced (U-028, lighting is P3).
- **Why the earlier scans missed it:** `0x9e304` is reached only through function pointers and was never disassembled. It holds only two syntactic self-multiplications, plus one through a register copy, which is below the earlier cluster criterion. On an 8-bit device, `0xa07d4` (token 0x10) builds a 6 × 6 × 6 colour cube through the same lookup, which maps RGB colours onto the palette; on other devices it builds channel masks instead. That textures use ramps rather than this cube is inferred from the ramp model (Likely).

Consequence: the renderer matches colours against the DATA values times 4 by squared Euclidean distance, with ties to the lowest index (Confirmed). That an unshaded TEX colour reaches this lookup as its 8-bit BGR palette components is Likely; see [textures §3](./textures.md#nearest-colour-metric-and-tie-rule-confirmed). Evidence: ignored `local/research/p2-06/nearest2/`, holding the read-only scripts `RangeRefs.java`, `DispScan.java`, `QueryScan.java` and `DumpWords.java`, native listings, and the rule comparison `confirmed-rule.ts`.
