---
type: format
status: draft
phase: P0
updated: 2026-10-09
related: [U-008, U-009, U-010, U-011, U-017, U-022, U-029, U-031, U-032]
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

  The reader rejects any region that a fixup patches. All 28 planned effect regions (P2-06/16) read cleanly, and the opcode bytes of their 16 immediate-operand instructions match. Object numbers in region locators are the 1-based LE object numbers; offsets count from the object's start.
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

The mission module occupies roughly 0x67000–0x6a000; functions there read the current `SCEN` through one global pointer. The object kind at +0 selects the M2ID slot through its single set bit and also fixes the player-relative enemy/friendly class ([player target modes](#player-target-modes-and-enemy-classification)). The success condition is recorded in [mission result](#mission-result-success-path-and-campaign-restart-p3-0104) and the failure condition in [mission failure](#mission-failure-player-loss-and-rescue-p3-0105); exact base-interaction conditions and the remaining object-field semantics are still open under U-022.

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

### Mission result, success path and campaign restart (P3-01/04)

Globals named here: main-flow state byte `0x1863ac`; in-mission sub-state byte `0x186881`; mission status byte `0x1b46fc` (setter `0x695a4`, getter `0x695b8`); the mission result word `0x18685c`, followed by the summary-text pointer `0x186860` and a summary selector byte `0x186864`; campaign flag `0x186882` (1 = campaign); campaign mission index `0x18683c`; difficulty global `0x186844` ([scenario §4](./scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)); wingman selector `0x186880` (getter `0x33940`, setter `0x33938`); rescue counter `0x186830`; next menu page `0x186840`, run by `0x32fec` through page dispatcher `0x33e8c`. Delays are in units of the mission clock global `0x186414`, 1/64 s each ([time base](#simulation-time-base-p3-0106)).

**Confirmed (main mission flow):** the main loop `0x22d00` calls `0x3266c` once per frame, followed by behaviour generation `0x20938`, the event dispatcher `0x20d10` and the frame update `0x3ee58`; it exits when `0x3266c` returns non-zero. `0x3266c` steps the state byte:

| State | Role | Next |
|---|---|---|
| 0 | Between missions | 1: `0x334bc`, called at the end of every `0x20d10`, sets state 1 and the caller then retires every runtime object (`0x21694`) |
| 1 | Teardown: waits until no runtime object remains | 2; on the practice result path it runs the pending page first |
| 2 | Campaign only: when the mission index is 0, the clip played before the first mission (`C-INTALL`); pre-mission page 0xF; a departure clip whose variant depends on the wingman selector (files in [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108)). All modes, after those pages: clears the result word, summary pointer and selector; resets the per-mission player-state counters (`0x3b734`); builds the mission with `0x66c00` (group from `0x38428` over the difficulty global, slot = mission index + 1, or 0 outside the campaign). Next page −1 instead returns 1 to quit | 3 |
| 3 | In mission; sub-state below | 4, 5, or reset to 0 |
| 4 | All-clear wait | 5 |
| 5 | Result delay | 0 through the success or failure handler |

In-mission sub-states: 0 = normal (polls the mission status and the wingman-loss timer); 1 = energy-beacon countdown; 2 = ending (player destruction or a debug result); 3–5 = base docking and launch steps (Likely, see [B-004](../behavior/B-004-base-communications.md)); 6 = end-campaign request. The mission builder sets the status to 0 on entry and 1 when the mission is built; status 4 means ended, and `0x695a4(4)` also clears the spawn-enable flag `0x17670c`, so `0x67018` stops processing the spawn queue.

**Confirmed (success result):**

1. `0x6977c` consumes object events by type: 3 = instantiated (`0x67938`); 0 = destroyed by the player; 1 = destroyed otherwise; 2 = left the world rectangle extended by a 100-unit margin (`0x2f314`). Damage handler `0x2a694` receives the attacking object's kind (`0x2a40c` passes the kind of the projectile's owner) and reports type 0 exactly when it is 1, the player's kind. For types 0–2 of an object in the enemy mask `0x93780`, when SCEN header 0x0C is zero and the status is not 4, it calls `0x69a70` with that object excluded; a zero return sets the status to 4 and clears the spawn-enable flag.
2. `0x69a70` returns 1 while any of these exists: a live object of a kind in `0x91780` (the enemy mask without bit `0x2000`), other than the excluded one, not flagged dead (+0xD8) and not in object state 6; a pending spawn-queue entry (array `0x1b46f8`, count `0x1b46f0`) whose section-1 record or section-5 member has such a kind; a section-2 trigger spawn pair that references one. Otherwise it returns 0.
3. In state 3, sub-state 0, `0x3266c` sees status 4 and calls `0x69c54` with the result word and EDX = 0. `0x69c54` reruns `0x69a70` (which preserves EDX) and stores 0 when an enemy remains; otherwise it stores 1 and selects summary text from the section-2 trigger ranges by each trigger's destroyed-to-instantiated ratio. The state becomes 4, due after 0x140 clock units.
4. State 4 rechecks every 0x140 units while the player-state mode byte (`0x1b0638` +0x28) is 1, the warp mode entered by the [Warp start](./audio.md#slice-sample-set-and-role-correspondences-p2-08). Otherwise it posts a fixed EXE completion message through `0x4e9e8` (Likely the communications text area), and state 5 becomes due 0x3C0 units later.
5. State 5 calls `0x335f0` when the result word is non-zero. It calls `0x3af04(1)` (score) and `0x3b8dc` (statistics row and promotion; roles Likely, see §4), plays the clip list given in [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108) (a return clip in one of two variants, then a mission clip or medal clips, and promotion clips) and runs page 0xC (Likely the statistics page). After mission index 16 it plays a final clip, enters the campaign high score through `0x3b28c(1)`, runs page 0xB, clears the result word and resets for a new campaign. Otherwise the mission index increases by one and the state returns to 0. The next state 2 runs page 0xF, whose first chapter (the summary text selected in step 3) is enabled only when the result word is 1, followed by the briefing and wingman-selection chapters; the result word and summary are cleared after page 0xF returns.

**Confirmed (only non-debug success route):** only `0x69c54` writes a non-zero result word. Its address is taken only in `0x3266c`, whose two calls are the status-4 evaluation above and the debug win request; every other write stores 0. A campaign mission therefore succeeds, outside debug commands, only through the all-clear status of `0x6977c`, which requires SCEN header 0x0C to be zero (51 of 52 missions, including the selected one). The debug kill commands also report through `0x6977c` (type 1) and can reach the same status.

**Confirmed (kill statistics):** when the attacker is the player, `0x2a694` increments one of eight per-mission player-state counters by the destroyed object's kind: `0x80` → +0x30, `0x100` → +0x34, `0x200` → +0x48, `0x400` → +0x4C, `0x80000` → +0x50, `0x1000` → +0x54, `0x800` → +0x58 and `0x10000` → +0x5C. `0x3af04` stores their sum at +0x68. Destructions by other objects are not counted. Which page row shows which counter is not traced.

**Confirmed (selected mission, data and code):** `enemy-count.ts` resolves SCEN 3019 the way `0x6721c`, `0x67018` and `0x67678` schedule it: header 0x0C is zero; 4 section-1 records are queued directly and 3 section-5 entries as groups, each request instantiating every member; no source uses a repeat interval (+0x20), a live limit (+0x14), a spawn probability below 100 or the +0x30 path; the only section-2 trigger has no spawn pairs. The scheduled enemy-class objects number 16: 12 of kind `0x80` (slot 7) and 4 of kind `0x100` (slot 8). Six of them come from the one source scheduled after the mission start. In the selected mission the success status is therefore set when the last of the 16 is destroyed or leaves the world area after all have been instantiated. The result then follows once the player is not in warp mode at a state-4 check.

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
2. For kind 1, `0x23ac8` first only arms `0x174ae4` for 0xC0 clock units. At the end of each dispatcher pass, `0x23808` calls it again for the player object when that time has passed. It then creates the explosion and, through producer `0x24d78` in mode 3, one [fragment](#effect-presentation-sources) (kind `0x1000000`, discriminator 3) per list-1 part of the player's model, except parts 1 and 2, which `0x25124` skips for kinds 1 and 2.
3. The part-0 fragment becomes the followed object (+0x90). Its update callback `0x24ac4` gives it an expiry 0x140 units ahead (other fragments get random or no expiry; a wingman's part 0 gets 0x780) and, when it expires, posts message 0x10000. The dispatcher passes that message to `0x256e4`, which, for a fragment of source kind 1, discriminator 3 and part 0, clears +0x90 and calls `0x32e14(1)`.

While sub-state is 1 or 2, state 3 does not poll the status: an all-clear reached during the sequence is evaluated after a rescue, and a third loss fails the mission even then.

**Confirmed (energy loss):** the energy updates `0x3071c` and `0x30994` clamp an object's energy at 0 and, for kind 1, call `0x33464`. In state 3, sub-state 0, that posts a fixed EXE message (Likely the beacon notice in the communications text area), sets sub-state 1 and a due time 0x3C0 units later, when `0x3266c` calls `0x32e14(0)`. Energy drains with weapon and shield recharge, with speed (doubled and tripled above two craft-record thresholds) and by ×10 or ×100 under a two-bit object system state read through `0x52ac4`. How quickly normal flight empties it was not established.

**Likely (escape pod):** the part-0 fragment is the escape pod the user identified ([B-005](../behavior/B-005-campaign-rescue.md), [mesh](./mesh.md#p2-12-viewer-comparison-v-1)). The player's model (MODL 10743, M2ID slots 0 and 1) has 7 list-1 parts. Only parts 0 and 1 name TEX 11009 (`image/model-texture/14`), the pod's texture; part 1 is never shed by kind 1, and part 0 is a small mesh (12 vertices, 8 triangles; part 1 has 108 and 132). The pod needs nothing beyond the player model's own list 1.

**Not failure routes (Confirmed):** losses of base-kind objects only set the flags `0x176744`/`0x176748` in `0x6977c`, which `0x69e1c` reads to select success summary text; the rescue has no ship or destination that can be lost; sub-state 0 polls only the status and the wingman-loss timer, so there is no time limit; a wingman's loss is not an ending; end campaign, restart and exit do not reach `0x3351c`. The debug fail request does reach it, but is not normal play.

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

- The main loop `0x22d00` repeats `0x3266c` (mission flow), `0x25894` (sample), `0x20938` (every object's update callback), `0x20d10` (the spawn queue `0x67018` first, then the message loop, then once the movement integration `0x221fc` and the periodic systems) and `0x3ee58` (frame render). Apart from one extra sample at mission start (below), each of these has only that one caller, so they run once per iteration.
- `0x25894` copies the raw counter into the sample and stores the difference from the previous sample in `0x186420`, which nothing reads. It stores counter × 1/64 as f32 seconds in `0x18641c` (constant `0x170d04`; `0x170cfc` at initialisation) and the difference of the seconds in `0x186424`, and increments the frame counter, which nothing else reads. Mission state 2 calls it once more after building the mission (`0x328da`), so the build and the clips before it do not enter the first step in flight.
- The step is the whole elapsed time. No code clamps `0x186424`, and its seven readers integrate with it directly: position from velocity, speed towards its target at the craft's rates, and turns as rate × step (`0x222f0` and `0x22600` for craft, `0x22818` and `0x2285c` for projectiles, `0x25b0c` and `0x2b00c` for a new projectile's spawn offset, `0x50508` for Warp progress). There is no sub-stepping and no upper limit on the advance in one frame.
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

Owners for the exact behaviour of these consumers: spawn timing P3-02; movement and the speed assist P3-06; fragment timing P3-07 and their drawing P3-12; mission-flow delays and rescue P3-11; HUD, DIAG and displays P3-13; pausing P3-04.

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
- Rows 3 and 4 play inside the dispatcher, and the rescue lists play inside `0x32e14`. The following frame's step and the spawn clock include the whole list's time in one piece, with no clamp, so every moving object advances by that step and due spawn entries are released.
- The success and failure lists play after the status is 4, when spawning has stopped. Frames then pass through states 0 and 1, which retire every object.
- Skipping, setting 0 and an unreadable file all shorten that time and nothing else. Zero clip time is therefore a state of the original itself.

Nominal lengths are frame count × frame interval from each file's header, not measured: row 2 about 14 s, row 3 about 24 s, row 4 about 8 s, rows 5, 6 and 7 about 19, 21 and 6 s, row 8 about 29 s, rows 9–12 about 14 s each, row 16 about 9 s, row 20 about 20 s, each medal and promotion row about 5 s.

**Engine parts of the same transitions:** the destruction sequence and its external view (view mode 0x11, [mission failure](#mission-failure-player-loss-and-rescue-p3-0105)), the energy-beacon wait, the all-clear message and the result delays ([mission result](#mission-result-success-path-and-campaign-restart-p3-0104)), the docking countdown, the base interior (view mode 6) and the whole Warp (view mode 1) are drawn by the engine. The timed ones end at due times that `0x3266c` or the dispatcher checks every frame, and none of them calls the pause routine `0x258f8` (whose only callers are the four key contexts' `p` and the page runner `0x32fec`) or a page, so the main loop, object updates and the clock keep running through them; the spawn queue keeps running until the status becomes 4. Keys go to the context of the current view mode: during the destruction view (0x11) that is the flight handler `0x264a0`, and during the energy-beacon wait and the result delays whichever context the player's current view selects; what the flight commands do while the player is destroyed or out of energy was not traced. The views and cameras of these phases are in [automatic views](#automatic-views-and-cameras-p3-0109).

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

**Confirmed (view keys by key context):** the key context follows the view mode (`0x26284`, see [cut-scenes](#cut-scenes-and-loop-transitions-p3-0108)). Of the four key contexts, only the flight handler `0x264a0` has view keys; it serves every mode except 0–3 (the Warp handler), 6 (base) and 8 (map), so also the destruction view. The DOS key reader `0x75048` turns F1–F10 into codes 0x96–0x9F and the extended cursor scan codes into 0x80–0x8C (table `0x74f30`).

| Key | View mode, sub-mode | Cockpit layout (`0x3f158`) |
|---|---|---|
| F1; Up | 0xC | 0 |
| F2; Home | 0xD | 5 |
| F3–F8 | 0x11, sub-modes 0–5 | 8 |
| F9 | 0x11, sub-mode 7 | 8 |
| F10 | 0x11, sub-mode 6 | 8 |
| PgUp | 0x11, the next sub-mode (8 skipped) | 8 |
| Right; Left; Down; keypad centre | 0xE; 0xF; 0x10; 0x12 | 3; 2; 1; 4 |

Several Ctrl combinations produce the same extended codes. Whether the cursor keys reach this handler during flight, and whether they also steer, is part of U-011 and was not traced. The map handler `0x27118`, the Warp handler `0x27360` and the base handler `0x271e0` handle no view key, so the view keys do nothing in the map, during a Warp and in the base; the base handler's two selection keys are the Up and Down cursor keys. No key selects sub-mode 8. The other layouts are: Warp (mode 1) 0, base (mode 6) 0, map (mode 8) 6, teardown (0x13) none. `0x49848` selects the CCKD slot whose directory +0x00 equals the layout number ([cockpit](./cockpit.md#group-directory-confirmed-structure-on-all-three-entries)).

**Confirmed (cameras and what each view draws):** the dispatcher calls `0x21584` once per pass, after its message loop; while the player state holds a player object (+0x8C), it calls `0x30ef0`. For mode 0x11 that takes a camera function from `0x174bdc` by sub-mode (nine entries; sub-mode 8 is `0x31bdc`); for mode 8 it runs `0x2b8ec` (Likely the map's visibility messages) and has no camera function; for every other mode it takes one from `0x174b88` by mode. Modes 0xC and 0xD use `0x31400`, which keeps the camera at the player craft's own position and orientation; modes 0xE, 0xF, 0x10 and 0x12 have their own functions (`0x31424`, `0x314ac`, `0x31524`, `0x315bc`, not analysed); modes 0–0xB and 0x13 have none. Without a function the camera takes the craft's position and orientation as well, so the Warp mode 1 places the camera exactly as F1 does. `0x31400` also derives a 0–100 value from the craft's model (stored at `0x1b0758`, consumer not traced), which is 0 without a function. The frame render `0x3ee58` then draws by mode:

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
- **Exit:** the fragment's expiry clears +0x90 and calls `0x32e14` in the same pass. In a campaign the rescue clip list follows and the view becomes 0xC; a third loss goes to the failure clips and pages, and state 0 then sets 0x13. Because the destruction view uses the flight key context, F1, F2 and the other external keys switch away from it with no further test, and so would the cursor view keys if they reach that handler (U-011); the destruction sequence and its end do not depend on the view, and the rescue still sets 0xC. No key or cycle returns to sub-mode 8 before the next loss.

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
| | `0x2cf38` | The CINF that TABL 4003 gives for the slot and group: 4037 ([weapon records](#weapon-records-and-the-first-missions-shooters-p2-1230)) |
| | `0x486e4` | Six consecutive BITMs of NEBC 10661, from index (clock sample mod 15) and wrapping |
| | `0x23520` | EXIC 10211; from each of its three EXPL lists, 5, 5 and 3 consecutive entries from a random start (so the whole 3-entry list), each EXPL with its SND and ANIM ([audio](./audio.md#slice-sample-set-and-role-correspondences-p2-08)) |
| An object's visual is created (`0x3d4e4`) | `0x65ca4`, `0x65d10` | Its M2ID MODL with that model's MESH, TEX and SND |
| View switch `0x3f158` | `0x42b04`, `0x4cd68`, `0x497a0` | TEX 11089, or 11091 in view mode 6, for the right (target) display; the HUD set and the cockpit set again |
| Docking `0x38ff4`, sub-command 0 | itself; `0x4f480` | TABL 10165; TABL 10171, one of its three BITMs at random (`0x7453b`), BITM 10163 |
| Play-by-ID sound event (`0x55924`) | | SND 10055, 10167, 10169, 10181, 10401, 10463, 10485, 11087, 11381 (posters in [audio](./audio.md#sounds-played-by-id-and-hud-sounds-p3-0110)) |
| Communications | `0x2cbb4`; `0x2c850`, `0x2c9d0` | COMM TABL 2013 for a target of kind 2, 2003 for kinds in `0x68000` when `0x394c4` and `0x33390` pass, otherwise 2005; 2007 and 2009 from the command handler `0x27b44` |
| | `0x3c7bc`, `0x3c828`; `0x3c618` | COMM TABL 2001 and 2011: lists of name strings matched against the speaking object's name (`0x7535e` against +0x15C) to give a face index; COMMFACE TABL 20011, 20019, 20983 and 20985, the TABL each names at that index and the CMOV entries those list (20983 lists CMOV directly), only when `COMMFACE` opened |
| Menu pages (`0x33e8c`, `0x34c08`) | | OPTIONS TABL 5007, DPLU 5003, the 18 MESC entries of table `0x174c28`; SND 10405 |
| Clips (`0x39f34`) | | The row's SONG |

**Confirmed (hit shimmer, TEX 11069):** `0x41c00` loads TEX 11069 into `0x193c30` and sizes spherical texture wraps (`0x82ae8`, type 2) from mesh bounds: for kinds 1 and 2 from MESH 10745, for `0x80` from 11065, for `0x100` from 10375, for `0x200` from 10311, and one shared entry for every kind in `0xf9c7c` (bases included) from 10397. These meshes are the list-2 parts of MODL 10743, 11063, 10373, 10309 and 10611/11007 ([mesh](./mesh.md#2-modl-structure-confirmed-on-all-19-entries)). The impact builders `0x2a40c` and `0x2a5fc` post the hit message (byte +8 = 2, +9 = 4) that the scene message processor `0x3d4e4` handles: for the player, outside the destruction view, it runs the screen flash `0x48d64`; for any other object it starts the effect through `0x42514` unless the player object's +0xCC is 1. For kinds in `0x383`, `0x41dcc` gives the object's list-2 part a copy of TEX 11069 (`0x41f88`); while the effect runs, `0x42664` steps a band through the copy's pixel values with the mission clock (`0x4294c`: alpha 0xFF inside the band, 0x7F at its edges, 0 elsewhere), so the part shows only where the band is. Kinds in `0xf9c7c` share 16 precomputed band steps instead of a copy per object. That this is the dithered hull seen when a craft is hit ([mesh](./mesh.md#2-modl-structure-confirmed-on-all-19-entries), list 2) is Likely.

**Confirmed (RENS 10751 header):** `0x3cfbb` creates a light of type 3 coloured by the floats at +0x00–+0x08 and one of type 0 coloured by +0x0C–+0x14 (Likely directional and ambient, the light-type numbering of the renderer family); `0x3d0b0` passes byte +0x18 to the device and reads float +0x1C; `0x3df90` and `0x3e0cc` read +0x1C, +0x20 and +0x24 when adding and removing visuals (Likely distance thresholds); the three screen flashes `0x48d64`, `0x48dbc` and `0x48e14` read {+0x28, +0x2C, +0x30, int +0x34}, {+0x38 … +0x44} and {+0x48 … +0x54}. Meanings beyond these uses are Unconfirmed. Field types, the one unread position and a runtime write are in [the RENS header](#flight-message-strings-and-the-rens-header-p3-0304).

**Confirmed (fragment parameters, DEBRIS TABL 4501):** the block starts with 20 {pointer, count} pairs (count `0x174b04`), one per kind bit, each to an array of 96-byte records. `0x249dc` returns the record for a kind and a list-1 part index (minus 3 for kinds 1 and 2), and the mode-3 fragment constructor `0x25124` is its only caller. At load, `0x246a0` stores a normalised and negated copy of each record's first vector at +0x0C and adjusts a nested float array (+0x38, count +0x3C). Field meanings are Unconfirmed; the parameter record whose non-zero +0x5C limits fragment damage in [difficulty path 6](./scenario.md#difficulty-readers-p3-01) is Likely this record.

**Confirmed (external-view cameras, TABL 11375):** 20 records of 32 bytes, indexed by kind bit (`0x174c1c` + bit × 0x20). Its only readers, `0x31ee0`, `0x321d8` and `0x324d8`, are called only from the mode-0x11 camera functions of sub-modes 1–5 and 7 (`0x31634`, `0x317d0`, `0x31810`, `0x31854`, `0x31884`, `0x31ba4`), that is, from external views selected by F4–F9. The destruction view (sub-mode 8, `0x31bdc`), F1 and the Warp do not read it.

**Confirmed (base interior, view mode 6):** the HUD set and the cockpit set depend on the view mode, not on a craft type: `0x4ca80` takes `0x175eb4` (MFDD 10475, BITM 10469, TABL 10481, SNIP 10487, DIAG 10489) when the player-state view mode (+0x28 of the block `0x52694` returns) is 6, otherwise `0x175e8c` in HI or `0x175ea0` in LO ([hud](./hud.md#hud-and-map-drawing-paths-confirmed-exe)). Entering mode 6, `0x3f158` switches to the 640-wide display, reloads the HUD, the right display (TEX 11091) and the cockpit set with `0x497a0(2)`, which is CCKD 10097 (TABL 10099 index 1); leaving it, `0x497a0(1)` or `0x497a0(3)` restores 10103 or 10101. TABL 10165 holds 11 records of 0x7C bytes ([hud](./hud.md#2-tabl-entries-in-srnob-contents-likely)); the base code orders them by the damage state of the subsystem each names (`0x39664`, `0x39cb4`) and repairs the selected one (`0x398ec`), with fixed delays and two fields of the player's craft record (+0x54, +0x9C, through `0x2d2d8`).

**Confirmed (nebula backgrounds):** `0x484f0` sets six fixed directions; `0x489d0` draws the six BITMs of the current set with `0x5b54c` (a rotated copy of the stored indices into the frame buffer, with no colour lookup) at screen positions it computes from those directions (Likely their projection), and `0x488b4` clears the previous rectangles. The set is the six NEBC 10661 entries the mission build chose. NEBC 10039 (the six 128×128 BITMs with embedded palettes) replaces them only through `0x487a0`, which is the function of row 26 of the typed cheat table `0x174ee8`; rows beyond the first 16 work only after the table's master toggle ([mission failure](#mission-failure-player-loss-and-rescue-p3-0105)).

**Confirmed (AISTUFF closure):** TABL 6003, 6007 and 6005 are arrays of 0x54-byte records ended by a zero first word. `0x649c8` loads, for each record, the entry named at +0x1C, that entry's +0x38 entry and six ID lists at +0x3C/+0x40 … +0x64/+0x68. The AI later loads entries again by ID from the same lists (`0x5e940`, called at `0x651c3`–`0x65342`). Group 0's closure is TABL 6003 and 25 entries (22 TABL, 3 DFPG); the group-1 and group-2 tables reach the same 37 entries, 16 of them outside group 0's closure. AICO 6001 holds a pointer and a count of 3 at its start (the per-group triples of difficulty path 5).

**Confirmed (EXE text and tables in the loop):** besides the regions already imported ([effect geometry](#effect-geometry-data-p2-0614-research), [SNIP 10487](./hud.md#snip-10487-confirmed-structure-p2-1227), [DIAG 10489](./hud.md#diag-10489-confirmed-structure-p2-07-revision)), the loop shows EXE strings through `0x4e9e8`, which queues text for the scrolling message line (instrument type 8, [hud](./hud.md#sources-of-the-unidentified-elements-p2-1227)): the completion message at `0x17106c` (state 4), the beacon message at `0x171094` (`0x33464`), and from the flight key handler the speed-assist toggle messages at `0x170db8` and `0x170dc8` and three joystick-sensitivity messages at `0x170ddc`, `0x170df8` and `0x170e14` (regions and text rules: [flight message strings](#flight-message-strings-and-the-rens-header-p3-0304)). AI program selection falls back to the built-in table `0x1762f8` (10 records of 0x54 bytes). The camera tables `0x174b88`/`0x174bdc`, the display page table `0x175c7c`, the key table `0x74f30` and the kind masks are code-side tables.

**Not loaded or not used by the loop (Confirmed):** NEBC 10039 (cheat only, above); TABL 11375 (external views only); the group-1 and group-2 AISTUFF entries (difficulty path 3 selects group 0's table); the OPTIONS pages, SCENARIO TABL 3011–3017, the base interior's images and texts and COMMFACE are loaded but serve pages, statistics, the base interior screens and the communications faces, which the [P3-01 slice gaps](../../plan/p3/01/spec.md#缺省清单) leave to P4. Which EXPL an explosion uses (`0x2409c`) and which nebula set a mission gets are chosen at run time from the sets above.

**Limits:** loads through pointers computed from bases other than the loaders above are not excluded; the data-driven AI programs interpreted by `0x64cb8` were not followed beyond the loader's lists (no load call exists outside the scanned sites); and no baseline run checked the requested IDs. Evidence: ignored `local/research/p3-01/closure/` (`ghidra_scripts/ClosureProbe.java`, `probe.sh`, outputs `out/p1`–`out/p54`, `out/id-immediates.txt`; `id-tables.ts`, `aistuff-comm.ts`, `data-id-refs.ts`, `model-meshes.ts`, `tabl-10165.ts`, `slot-musc.ts` and `delivered.ts` with their `out/*.json`, which hold entry IDs, offsets and counts only). Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and `__watcall` set in memory were discarded. Register arguments and the immediates were read from native instructions.

**Addendum (P3-03/24, EXE text drawn without `0x4e9e8`):** the paragraph on EXE text above covers only the strings queued through `0x4e9e8`. HUD, map and communications code also draws literals of object 4 directly, or formats them first. In the selected mission, 64 such regions lie on the view paths of the HI forward cockpit and the map; their reachability is stated per literal. The others serve LO, the F2 view, typed cheats, the wave mode, the base interior or the menu pages. Literals, draw sites, conditions and coverage: [HUD, map and communications text from the EXE](#hud-map-and-communications-text-from-the-exe-p3-0324). Dispositions: the handoff record at the end of the [P3-01/10 completion evidence](../../plan/p3/01/subtasks/10-data-closure.md#完成证据).

### Flight message strings and the RENS header (P3-03/04)

Research of P3-03 [subtask 04](../../plan/p3/03/subtasks/04-comm-hud-text-research.md), 2026-10-09: read-only static analysis on a private copy of the Ghidra project (`-noanalysis -readOnly`). It used probes through the verified source chain that print only offsets, lengths, byte classes and predicates: the EXE regions through the shared LE reader (`le-executable.ts`), and RENS 10751. No text or field values are reproduced here.

**Flight message strings (Confirmed, code and data):** at each of the seven call sites, the code loads the string's address into EAX as an immediate and calls `0x4e9e8` directly. The colour (DL), a second argument (EBX) and the display time (ECX) are code constants of the site. A 32-bit scan of the image finds each address exactly once, at its site.

`0x4e9e8` measures the string with a byte scan to its NUL, allocates the length plus one (`0x74190`) and copies the bytes unchanged into a record of the message queue `0x175f08`. The record holds the copy at +0x00, the colour at +0x04, the length at +0x0C, the width in pixels at +0x10 (the length times the advance of font record 0) and the expiry time at +0x18. The message-line drawer that reads the queue (instrument type 8, around `0x4e69b`–`0x4e95b`) draws a window of the copy with `0x59fc8`, which draws every byte as its glyph ([hud §1.1](./hud.md#11-glyph-layout-and-character-maps-likely)).

No code formats or interprets these strings: no formatting call is involved, so they hold no format specifiers in effect, and the data contains no `%` byte either.

| Address | Object, offset | Bytes with NUL | Region locator | Call site (function) | Sender and condition |
|---|---|---:|---|---|---|
| `0x17106c` | 4, 0x106C | 40 | `le/4/0x106c/40` | `0x32c93` (`0x3266c`) | Completion message, in-mission state 4 ([mission result](#mission-result-success-path-and-campaign-restart-p3-0104) step 4) |
| `0x171094` | 4, 0x1094 | 46 | `le/4/0x1094/46` | `0x33498` (`0x33464`) | Beacon message ([energy loss](#mission-failure-player-loss-and-rescue-p3-0105)) |
| `0x170db8` | 4, 0xDB8 | 16 | `le/4/0xdb8/16` | `0x269fb` (`0x264a0`) | Speed-assist toggle, when the toggled byte (player object +0x1B4) is now non-zero |
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
| `0x171c40` | `le/4/0x1c40/14` | — | `0x46d38` (four sites) | Blinks while the step counter `0x174b28` runs and the autopilot is off. The speed-assist toggle starts it at `0x269d4`, and so does `0x27f68` at `0x27ff0` and `0x280aa` |
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
| `0x171d44` | `le/4/0x1d44/3` | `%d` | `0x4ba60` (in `0x4b98c`), drawn at `0x4a9e3` | Per-unit labels while the map flag `0x18649c` is 1. It is written at `0x2b8ab` and `0x2bc06` and cleared at `0x49e41` when the map opens; which input sets it was not traced (Unconfirmed) |

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
**Confirmed (map-to-world conversion and Warp marker):** `0x2b9bc` classifies a mouse point against three screen rectangles. Inside the main map rectangle (origin and size at `0x186444`–`0x186450`) it converts the point with `0x4c4c0`, stores it as the cursor's world point and lets `0x2bc30` set the zoom-window bounds around it, clamped to the world rectangle of `0x3a41c`. On a left click it also stores the point as the target: `0x4c310` finds the nearest map icon, and `0x2bd74` replaces the target's z with that icon's stored value (0 when none is hit) while a player-state field is set. It then either creates the runtime kind-25 map/Warp marker at the target through `0x3cb80` or moves the existing marker to it. The vertical component therefore comes from runtime state, not mission data. `0x4c4c0` computes world x and y as the world rectangle's minimum corner plus the point's offset from the map origin times a per-axis world-per-pixel factor (`0x18646c`, `0x186470`), and sets z to 0. `0x4c310` picks the map icon nearest to a point within three pixels. Map icon labels are drawn by unanalysed code near `0x4afc0`–`0x4b360` from per-object screen coordinates relative to the same map origin.

**Confirmed (writer, units and world rectangle; P2-12 static resolution):** the factors' writer is `0x49e74`, inside the map module `0x49xxx`–`0x4cxxx`, which Ghidra had not made a function; earlier reference searches therefore missed it. The LE fixup table lists its stores to the two world-per-pixel factors at `0x49f78` and `0x49f7e`, and the only readers are in `0x4c4c0`. `0x49e74` writes the main map rectangle (`0x186444`–`0x186450`, int32; width and height are both derived from the vertical extent, so the map is square), the per-axis pixels-per-world factors (`0x186464`, `0x186468`, float32; used by the world-to-map path `0x4c524` and the zoom box) and the world-per-pixel factors (`0x18646c`, `0x186470`, float32, x87 extended reciprocals of the former). `0x3a41c` does not read a stored world rectangle: it computes int32 `{minX, minY, maxX, maxY}` from the world grid (sector counts, int16 at `0x186b38`/`0x186b3a`; grid scale, float32 at `0x186b34`; both written by `0x3a380` from the SCEN header), with the minimum the negation of the maximum. Before `0x3a380`, the mission builder `0x66c00` passes a runtime scale (an immediate at `0x66d3e`) to `0x68d2c`, which rescales the SCEN spatial fields. Units: the main map rectangle and origin are screen pixels; world coordinates, the world rectangle and the zoom bounds are runtime units (`scen-runtime` in the content model); the pixels-per-world factors are pixels per runtime unit and the world-per-pixel factors runtime units per pixel. The candidate's `StrategicMapFrame` is in reference units (`scen-reference`).

**Confirmed (orientation, extent, centre and scale; P2-12 runtime readout):** in the selected mission's map state, three user-coordinated debugger pauses at the left-click site `0x4c310` read every field above. Each run re-derived the CODE/DATA object bases for its own process (the bounded correlation method below), verified that every target page was readable, required stable repeated reads and verified the mission identity. At the actual storage precision the readings agree with the candidate `mapFrame` on all of the following:

- the runtime/reference unit ratio;
- the world rectangle, symmetric about the origin and covering the whole sector grid;
- the main map rectangle, equal to the square derived from the origin and vertical extent of the candidate's map instrument record (that CCKD 10103 is the source of the runtime rectangle remains Likely: the live record pointer was not correlated);
- orientation: map right = +x and map up = −y, since screen rows grow with world y;
- equal scale on both axes;
- the centre at the world origin, within float32 rounding;
- the bounds: the origin pixel maps exactly to the world minimum, and the zoom-window clamp reached all four world bounds.

The P2-09 first-mission screenshot check ([B-001](../behavior/B-001-strategic-map.md#地图框架与坐标轴高概率p2-09)) agrees. Field values are not recorded here.

**Likely (no Warp-specific static spatial data at destination selection):** the cursor-to-marker path uses the world rectangle, the map rectangle and runtime map-icon data; no Warp destination table, grid or range data was found on it. The Warp execution path (energy, travel, arrival, error) was not traced and remains U-026.

Evidence (P2-12): ignored `local/research/p2-12/map-frame/` (static field table, candidate expectation, harness `map-frame.py` and run `user-02/report.json`); the run used a hash-verified private copy of the installation and reaped its own emulator. Earlier evidence: ignored probe outputs `local/research/p2-09/probe-2.txt`–`probe-4.txt` (map references and the unanalysed label-drawing region) and decompiled exports in `local/research/all.c`; the screenshot comparison used `local/StarRang/captures/srangers_059.png` and the selected mission's spawn rectangles from `pointer-targets-3019.json`, checking only which half of the map each marker class falls in.

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

**Confirmed (player-relative classification):** the flight key handler `0x264a0` compares the key against ASCII `t` (`0x74` at `0x265fe`) and branches to `0x2703d`, which calls `0x2799c` with EDX = 0 and on success stores mode 0 at player-controller offset +0x198. The adjacent case calls the same helper with EDX = 1 and stores mode 1; the decompiled compare tree assigns it to `f`. The `r` and `y` cases pass the stored mode to `0x27910` and `0x27884`, which cycle to the next nearer or farther candidate through `0x63954`/`0x63858`. In all three helpers mode 0 selects candidates through kind mask `0x93780` and mode 1 through `0x206c87e`. These keys match the README labels for enemy/friendly target mode and target cycling in the [key map](../input/key-map.md).

| Player target mode | Kind mask | M2ID slots |
|---|---|---|
| Enemy (mode 0) | `0x93780` | 7, 8, 9, 10, 12, 13, 16, 19 |
| Friendly (mode 1) | `0x206c87e` | 1–6, 11, 14, 15, 17, 18, plus runtime kind 25 (the map/Warp marker) |

Every M2ID slot with a model, except the player's own slot 0, belongs to exactly one mode; slots 20 and 21 are empty. Helper `0x27a04` targets an object in front from all twenty model kinds and selects mode 1 exactly when its runtime kind is in `0x6c87f` (the friendly set plus slot 0), otherwise mode 0. Its `0x75` (`u`) key case is Likely from the decompiled compare tree; the helper logic is Confirmed.

**Confirmed (input invariant):** iterator `0x5261c` walks per-kind object lists rooted at `0x1b06e4`, indexed by the set bits of the supplied mask. Allocator `0x520d4` writes the requested kind to runtime +4 and links the new object into the list for that kind's bit. These two functions are the only code references to the list table. SCEN objects receive their record kind through `0x67938`. An object's player target-mode class is therefore fixed by its allocation kind; no separate per-record faction field participates.

Mode 0 is the player's hostile set, by three independent sources: the README key label; the [Practice observation](../behavior/B-002-practice-mode.md) that the observed non-player units there were hostile and no friendly unit was seen (all referenced Practice slots, 7, 8, 9, 10, 12 and 19, are mode 0); and the [campaign observation](../behavior/B-003-campaign-flow.md) of a friendly wingman and dockable bases, whose kinds are mode 1.

**Confirmed (exhaustive enemy-mode allocation sources):** only objects linked into the per-kind lists can be selected in either mode, and only `0x520d4` links them. All nine references to `0x520d4` are direct calls; there is no data or pointer reference through which it could be called indirectly. (P2-12/30's raw scan adds a tenth direct call in the unreachable fragment constructor `0x25500`, kind bit 24, which does not change this conclusion.) Eight call sites pass fixed kinds: slot 14, runtime kind 25, bits 22 and 24, and empty slots 20 and 21 ([inventory](#remaining-direct-allocator-input-inventory)). None is in `0x93780`. The ninth, `0x67938`, is reached only from spawn dispatch `0x67678`. The queue it serves has five insertion sites: three in `0x6721c`, and one each in `0x67018` and `0x695c0`. Whichever site queued an entry, `0x67678` resolves it to one of three record kinds: a current-SCEN section-1 record, a current-SCEN section-5 member record, or an SCCT wingman record. Enemy-mode objects can therefore originate only from the current scene's section-1 and section-5 records.

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

**Confirmed (destruction fragments), Unconfirmed (other fragment events):** the explosion constructor `0x23ac8` calls producer `0x24d78` in mode 3 when the destroyed object is a craft kind (bits 0–19), so a destroyed craft sheds fragments from its own model's list 1 (discriminator 3). Dispatcher event `0x10` calls the producer with a mode from the event payload, giving discriminators 1 and 2 for kinds in mask `0x91780`. Which code posts that event was not found in this bounded search, so when discriminator 1 and 2 fragments appear is Unconfirmed. Discriminator 0 is not emitted by this producer. The external-view capture `local/StarRang/captures/srangers_044.png` shows small textured fragments next to an explosion animation (Likely fragments).

**Fragment producers (P2-12/30, read-only; raw byte scans of the code object for direct transfers, 4-byte values with relocations and stores at the discriminator offset, cross-checked with a second scan):**

- **Discriminator 0 never occurs (Confirmed, code):** objects of kind `0x1000000` are allocated only by three constructors. `0x24ec4` writes discriminator 1 or 2 and is called only by producer `0x24d78` in modes 1 and 2. `0x25124` writes 3 and is called only in mode 3. `0x25500` would store a caller's value, but no transfer, pointer or relocation reaches it. No code changes an existing object's kind to `0x1000000`, and the auxiliary setup's default 0 is overwritten by both reachable constructors before the visual is created. The callbacks keep unused branches for discriminator 0. Not ruled out: stores through computed pointers, and save/restore paths; neither appears in any fragment code.
- **Event `0x10` (Confirmed, code):** it is posted only by `0x23838`, the update callback of explosion objects (kind `0x400000`), with modes 0, 1 and 2; mode 0 creates nothing. For an explosion whose source is a craft (kind bits 0–19), the three are due 8, 12 and 16 clock units (0.125–0.25 s, [time base](#simulation-time-base-p3-0106)) after it starts. The gate `0x2443c` first drops them unless the explosion is on screen. Kinds 4, 8, 0x10, 0x20, 0x40, 0x400, 0x800 and 0x1000 lose them all, and so do kinds 0x8000–0x80000. All other kinds keep both modes under distance 300, only mode 2 from 300 to under 450, and none beyond.
- **Consequence for the first mission (Likely):** of mask `0x91780`, slots 7, 8 and 9 can shed discriminator-1 and -2 fragments; slots 10, 12, 16 and 19 never do. So the two enemy types shed them when destroyed near the camera, besides their own list-1 parts, while the player, wingman, transponder and base shed only list-1 parts. The handler runs only when the dispatcher gate `0x339cc` passes, which is inferred, not traced, to pass in single-player play (it also gates enemy spawning). In `srangers_098.png`, an enemy one's destruction, thin textured triangles like the two textured debris shapes appear beside a fragment of the craft's list 1.

#### Weapon records and the first mission's shooters (P2-12/30)

Read-only analysis of the weapon code and of CRAFT.NOB data, 2026-10-08 (structure, indices and entry IDs only; names are not recorded).

- **Weapon data (Confirmed):** an init routine loads CRAFT.NOB TABL 4003 into `0x174b68`: 18 rows, each three {entry ID, scale} pairs. The mission builder `0x66c00` calls `0x2cf38` (at `0x66dad`; its only caller) with the clamped SCCT slot as the row and the clamped group as the column, which loads that CINF entry into `0x174b70`. The selected first mission (group 0, slot 1) uses CINF 4037. A CINF holds 10 gun records, 9 missile records and 20 craft records indexed by kind bit (plus missile-body records). After loading, `0x2cf38` overwrites the first word of every gun and missile record with its array index, so gun record i draws RENS record i (`0x3fb1c`) and missile record j draws missile visual type j (`0x4457c`).
- **From craft to shot (Confirmed):** spawning (`0x67938`, `0x67b98`) gives each object the craft record of its kind bit, and `0x2d400` builds one state per weapon mount and the selection of three mount groups. Shots come only from `0x2e5e8` (guns), `0x2e86c` (missiles) and `0x2dad0` (mounts marked automatic, always as guns), each posting event 8 with the mount's weapon record; a scan finds no other poster. `0x25b0c` and `0x2b00c`, the only allocators of projectile and missile objects, pass that record to the visual.
- **The first mission's shooters (Confirmed, CINF 4037):**

  | Shooter (kind bit) | Guns (RENS records) | Missile types |
  |---|---|---|
  | Player (0) | 0, 1 | 0 (a third main-weapon entry, selected with `/`), 1 (default) and 3 (selected with `<` and `>`) |
  | Wingman (1) | 0, 1 | 1 and 2 in its missile group; whether its AI launches them was not traced (Likely) |
  | First and second enemy types (7, 8) | 2 | none |
  | Transponder (14) | none | none |
  | Base (17) | 6, automatic only | none |

  RENS records 3, 4, 5, 7, 8 and 9 and missile types 4–8 are used only by kinds that SCEN 3019 does not contain, so the first mission cannot draw them. Records 0 and 6 have the same colour. The enemies' missiles in the other groups' CINF files are outside the slice.
- **Captures (P2-12/30):** the player's two guns (`srangers_112.png`, `114.png`), the enemy guns (`113.png`, `109.png`) and the base guns (`128.png`) show records 0, 1, 2 and 6. In `srangers_017.png` the HUD weapon line names gun record 0 and missile record 1, the defaults (compared locally; names not recorded), and the first-mission captures `srangers_067`, `072`, `098`, `099`, `103`, `112` and `128` show the same missile name. A public gameplay video's match of record 5 to the second enemy type's shot comes from a later mission.
- **Untraced:** which wingman behaviours launch missiles; which keys set the two fire triggers (the key map gives Alt and space, Likely); writers of a mount's weapon other than `0x2d400` were not scanned exhaustively, while event posting was.

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
