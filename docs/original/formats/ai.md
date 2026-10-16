---
type: format
status: draft
phase: P3
updated: 2026-10-16
related: [U-001, U-022]
---

# AI data (AICO, AI program tables, DFPG, AI scripts, built-in programs)

Container format: [IMFAT](./imfat.md). `AISTUFF.NOB` holds 45 entries: AICO 1, TABL 38, DFPG 6 ([imfat §4](./imfat.md#4-type-distribution-per-file-confirmed)). The executable adds one built-in program table. Confidence labels as defined in the IMFAT doc. Structure only: no names, text, parameter values or decompiled code from the original are reproduced here. Addresses are Ghidra addresses as in [executable §4](./executable.md#4-code-landmarks); Watcom passes arguments in EAX, EDX, EBX, ECX.

All structs are packed; every pointer listed as "in-block" is relocated by the entry's IMFAT relocation table ([imfat §3](./imfat.md#3-data-blocks-and-relocation-tables-confirmed)), and in every entry below the relocation table lists exactly those pointers.

## 1. Loading, the ID chain and the group-0 closure (Confirmed)

- **Start-up:** module initialiser `0x5db80` opens `AISTUFF.NOB`, calls `0x64970`, then loads AICO 6001 into the global `0x1b41a0`. `0x64970` loads the program tables TABL 6003, 6007 and 6005 through `0x649c8` into `0x176698`, `0x17669c` and `0x1766a0`, and their record counts into `0x1766a4`–`0x1766ac`; difficulty groups 0, 1 and 2 use them in that order ([difficulty readers](./scenario.md#difficulty-readers-p3-01), path 3).
- **Table loader `0x649c8`:** walks the 0x54-byte [program records](#31-the-0x54-byte-program-record) until a record whose first word is zero. For each record it applies the [load transforms](#6-load-transforms-and-conversion-dispositions), loads the entry named at record +0x1C, stores its address at record +0x20, and then loads, from **that entry**, the entry named at its +0x38 (when non-zero) and every ID of its six {pointer, count} lists at +0x3C/+0x40 … +0x64/+0x68.
- **Where the ID chain lives:** the +0x38 ID and the six lists are fields of the entry named at record +0x1C, not of the 0x54-byte record. Evidence: after loading that entry `0x649c8` keeps its address in EDX (`0x64a1c`), and every later access is EDX-relative; the loader `0x6affc` saves and restores EDX. At run time the program code reaches the same fields through record +0x20 (`0x64b54`, `0x64d58`). The data agree: in all 16 program records the record's own +0x38 … +0x68 hold flags and floats, never relocated pointers, while every +0x1C target is a [DFPG](#4-dfpg-program-parameters-and-script-lists) whose list pointers are relocated.
- **Run-time loads:** `0x5e940(id)` loads a [script](#5-ai-scripts-tabl) by ID, parses it (`0x5eae8`) and returns an execution state; `0x5e9a8` releases it. Its callers take the ID from a DFPG: its +0x38 (`0x64bf9`, once when a program is installed) and the six lists (`0x651c3`–`0x65308` in `0x64d58`, by a random index into the list of the state it chooses). The remaining call, at `0x65342` in the list helper `0x65324`, is unreachable: the helper has no caller or pointer. No other load call exists in the AI code (`0x5c000`–`0x65e00`, decompiled whole), and neither the script executor `0x5f4f4` nor its callees load entries, so script arguments are not entry IDs.
- **Group-0 closure:** TABL 6003 names 3 distinct DFPGs (5 records), whose +0x38 IDs and lists name 22 distinct TABL scripts: 25 entries, 22 TABL and 3 DFPG. The tables of groups 1 and 2 reach 16 further entries (13 TABL, 3 DFPG); the two sets are disjoint, and together they are every AISTUFF entry other than AICO 6001 and the three program tables. Method: an independent local reader recomputed the three closures by the loader's rule above and compared the sets ([evidence](#9-evidence-and-coverage)).
- **Group-0 closure entry IDs (Confirmed, data):** the entries of the production import mapping (P3-03/15) and of the closure above, all in `AISTUFF.NOB`:

  | Type | Entry IDs |
  |---|---|
  | DFPG (3) | 6013, 6025, 6031 |
  | TABL scripts (22) | 6009, 6011, 6015, 6017, 6019, 6021, 6023, 6027, 6029, 6033, 6035, 6037, 6039, 6041, 6043, 6045, 6051, 6053, 6055, 6057, 6059, 6061 |

  Groups 1 and 2 add 6047, 6049 and 6063–6089 (odd IDs), outside the slice. The production import job on the baseline parsed exactly these 25 entries with no entry left over or missing (P3-03/19, P3-03/21).
- **Selection (Confirmed, code; P3-08/01):** the only path is instantiation `0x67938` → `0x20990` → `0x5dbc8` → (`0x64b1c` → `0x5de18` on the group's table) then `0x5de18` on the [built-in table](#33-built-in-program-table-0x1762f8); each has one caller (`0x5de18` two) and no pointer. `0x20990` first sets the update callback (+0xC := `0x20c18`; kind 1 gets `0x25f90`, kind 0x4000 `0x3897c`) and selects only for kinds 2, 8, 0x10, 0x40, 0x80, 0x100, 0x200, 0x400, 0x800, 0x1000, 0x2000 and 0x8000–0x80000. It stores the selected record (or 0) at object +0x10 and **does not install a controller**; the allocator has zeroed +0x0C, +0x10 and +0x14.
  - **Flag:** always `0x694e4()` = the current SCEN header +0x0C (0 in SCEN 3019, so records with +0x04 = 1 are skipped; none of the baseline's has it).
  - **`0x5de18(object, flag, table, count, &partial)`:** loads the kind, \|runtime +0xE0\| (`NEG`; 0x80000000 stays negative) and runtime +0xDC **before** drawing; then one rand, start s = rand mod count (signed `IDIV`; a count of 0 would fault). It scans records s … count − 1, then 0 … s − 1, and stops after the first full match. A record is a partial match when (flag ≠ 0 or record +0x04 ≠ 1), the kind shares a bit with record +0x08 and runtime +0xDC ≤ record +0x0C (signed); the partial pointer is written for **every** partial match in scan order, the full one included; it is full when also \|runtime +0xE0\| ≥ record +0x10 (signed). Runtime +0xDC/+0xE0 are the [SCEN record](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) +0x70/+0x74.
  - **`0x5dbc8`:** the group table's full match, else its partial one (`0x64b1c`, group from `0x694f0`), else the built-in table's full, else its partial match, else 0.
  - **Draws:** one rand when the group table yields a full or partial match, two (group start, then built-in start) otherwise; none elsewhere on the path. *Confirmed (runtime, P3-08/27, fixed 40000):* the generator states around the 50 selection calls of e-02's build counted 1 draw for each kind-0x80 and kind-0x100 object, 2 for each base (built-in record 6) and 0 for the kind-0x4000 objects and the player. They come at [instantiation](./executable.md#instantiation-p3-0203) step 13, after the Warp-timer draw of step 12 and before `0x38cd4`'s possible draw.
  - **Once per object:** no path repeats the selection. +0xDC is written only by the allocator and instantiation; +0xE0 also by `0x5e4d0` (§11.2: a negative value becomes its magnitude), after the selection. Every object of one record therefore draws from the same support.
- **Installation (Confirmed, code; P3-08/01):** in the object's **first callback**, not at instantiation. The generic callback `0x20c18` (jump table `0x20bf8`: states 0–3 install, 4 nothing, 5 and 6 removal, 7 step) first calls the Warp-transit test `0x2f298` in states 0–3 and returns while a transit lasts; otherwise, when +0x10 ≠ 0 and +0x14 = 0, it takes a controller from pool `0x1832d4` (failure is the fatal exit), calls `0x5dc0c(handle, C, +0x10)`, stores C at +0x14 and posts its state message (`0x20ae4`). So the install happens in the `object-update` stage of the frame after instantiation (later during a Warp transit), and states 1–3 do not install again. *Confirmed (runtime, P3-08/27):* all 14 installs read in e-02 (kinds 0x80, 0x100 and the bases, parked and active) came exactly one frame after their selection call.
  - **`0x5dc0c`:** memset of the 0x16C bytes; C+0 := handle; C+0xF4 := record +0x14; C+0xF8 := record; C+0xFC := record +0x18 (the handler); C+0x104 := F(x), C+0x100 := F(−x) with x = (record +0x24 × f64 `0x17232c`) × f64 `0x172334` (in that order); C+0x10C/C+0x108 likewise from +0x28; C+0x110 := −record +0x2C (FCHS), C+0x114 := bit copy of +0x2C, C+0x118 := bit copy of +0x30; `0x5c530` (steering block); C+0x138 := 0. Then, by the activity +2 **at this moment**: 0 → `0x62250(0, C)`, otherwise the record handler in mode 0. `0x5dc0c` draws nothing.
  - **Mode 0 runs an update body** in every slice handler: the interpreter `0x64cb8` installs and then runs the state machine and the executor in the same call (§11.1); the wingman's `0x60f80(0)` and the base's `0x62b60(0)` return 0, so `0x610c8`/`0x62c10` continue into their update ([wingman](./executable.md#wingman-ai-p3-0804), [bases](./executable.md#a14-bases-built-in-record-6-and-the-automatic-mount-behaviours--confirmed-code-selection-from-data)); `0x62250(0)` only writes the deadline. The install's draws are those of this first update.
  - **Spec note:** the approved P3-08 spec places the install at the instantiation extension point `0x20990`; the original only selects there (P3-08/01; the revision is P3-08/08's, D-01 with P3-02 CR-07).
- **Scheduling (Confirmed, code):** `0x20c18` calls the AI step `0x5dcd4` only in state 7 with +0x10 and +0x14 set (other callers: the autopilot's device poll `0x2741a`/`0x27448` and the homing-missile callback `0x2abce`). Parked (+2 = 0): `0x62250(1)` when sample > C+0xF0 (unsigned, strict), nothing else. Active or docked (+2 = 1, 3): the trigger channels, the automatic mounts, then, inside the same "sample > C+0xF0" branch, the handler in mode 1 and the AI lock `0x5dfec` (the lock updates only on steps where the handler is due; Confirmed, code, P3-08/18) ([executable A12](./executable.md#a12-ai-step-channel-loop-presses-and-range--confirmed-code-refines-w10)). **The deadline is written by the handlers, not by the scheduler:** the interpreter at entry in every mode (sample + C+0xF4), `0x60f80`, `0x610c8`, `0x62c10`, `0x63c00` (sample + C+0xF4 or half of it), `0x62250` (sample + 0x40 at entry; in mode 1 the values of [the parked handler](./executable.md#d1-phase-callers-and-dispatch--confirmed-code), then + rand mod 0x40), `0x62578`, `0x62714`; a path that returns before writing it is retried at the next step. The period C+0xF4 is written by `0x5dc0c`, `0x5e4d0` (§11.2) and opcode 302.
- **Removal and reinstallation (Confirmed, code):** in state 5 or 6 with +0x10 and +0x14 set, `0x20c18` calls `0x5ddd4(C)` (`0x62250(2)` when +2 = 0, otherwise the handler in mode 2; no slice handler draws there), returns the controller to the pool, sets +0x14 := 0 and posts message 0x20. After the toggle the object starts again at state 0, and its next callback installs a **new zeroed controller from the same record +0x10**: no reselection, no selection draw, the handler's mode-0 work and draws repeat in full. `0x5de04` (remove then install) has no caller. +2 changes between 0 and non-zero only at instantiation and in the toggle (which follows the state-5 removal); docking switches 1 ↔ 3 only; no store of 2 exists. Install and removal therefore always use the same dispatch.
  - Instantiated parked (all section-5 objects of SCEN 3019): the first callback installs `0x62250`; the record's handler only after the first resume.
  - Park/resume: removal at the state-5 callback with the old activity, install at the next state-0 callback with the new one.
  - Destroyed while active: state 4 gets no callback, so the controller is neither stepped nor removed until the explosion sets state 6 ([X4](./executable.md#x4-explosion-object-lifecycle--confirmed-code)). Destroyed while parked: removal at the next callback.
  - Warp-out (message 0x800000): removal, park, then `0x62250` installed at once (+0xC8 = 0, no transit). Resume after a Warp jump: no install while the transit lasts.
  - Teardown: every object set to state 6 → removal. **Rescue:** `0x67b98` and the rescue branch of `0x32e14` reach none of `0x20c18`, `0x5dc0c`, `0x5dcd4`, `0x5ddd4`, `0x62250` (over-approximate reachability): no AI controller is removed or reinstalled ([executable Q4](./executable.md#q4-rescue-and-ai-state--confirmed-code)).

### 1.1 The 0x16C-byte controller (P3-08/01)

Confirmed (code) within the stated coverage: a register/stack-tracking walk over raw p-code from `0x5dc0c`, `0x5dcd4`, `0x5ddd4` and every slice handler (`0x64cb8`, `0x610c8`, `0x62c10`, `0x62250`, the missile handlers `0x60aa0`/`0x60b84`), across direct calls with register and stack arguments (1,267 function contexts, no depth cut-off reached), jump tables and the self-pointer C+8 = C+0x100, with indexed accesses filled in by hand. Its tracked indirect calls are the handler calls `[C+0xFC]` and two routines that do not take the controller. Not covered: pointers combined by other operations, and accesses to another object's controller through its +0x14.

| Offset | Content | Written by | Read by |
|---|---|---|---|
| +0x00 | Handle of O | `0x5dc0c` | everything |
| +0x04–+0xEF | Steering block S ([executable A1](./executable.md#a1-steering-block-fields--confirmed-code)) | `0x5c530`, the movement helpers, `0x5dab0`, `0x63c00`, `0x56dc0` | the same, the executor, `0x610c8`, `0x61a88`, `0x63c00`, `0x640d8`, `0x64474`, `0x64d58`, `0x5dfa4`, `0x5dfec` |
| +0xF0 | Update deadline (u32 clock) | the handlers (§1 *Scheduling*) | `0x5dcd4`, `0x62250` |
| +0xF4 | Update period (i32) | `0x5dc0c`, `0x5e4d0`, opcode 302 | handlers, `0x5e4d0`, `0x61740`, `0x63c00`, `0x64d58` |
| +0xF8 | Program record | `0x5dc0c` only | `0x5e4d0`, `0x64b54`, `0x64d58` only |
| +0xFC | Handler | `0x5dc0c` only | `0x5dc0c`, `0x5dcd4`, `0x5ddd4` |
| +0x100–+0x114 | Turn and speed limits (−a, a, −b, b, −sat, sat) | `0x5dc0c`; +0x108/+0x10C also `0x5e4d0` | `0x5cd1c` (through S+4) |
| +0x118 | Roll-match dot-product threshold (record +0x30) | `0x5dc0c` | `0x5cd1c` |
| +0x11C, +0x164 | — | zeroed only | none found (no instruction with these displacements) |
| +0x120, +0x124, +0x128 | Trigger value per channel | `0x5df20`, `0x5df84`, `0x5dcd4` | `0x5dcd4` |
| +0x12C, +0x130, +0x134 | Hold deadline per channel | `0x5df20` | `0x5dcd4` |
| +0x138 | AI missile-lock enable | `0x5dc0c` (0), `0x5e1b0`, `0x5e4d0` (1), `0x5e1d4`, `0x5dfec` (0) | `0x5dcd4`, `0x640d8` |
| +0x13C | Missile ready (result of `0x5dfec`) | `0x5dcd4` | `0x5e154` |
| +0x140 | Automatic-mount enable | `0x5e1f4` (base install) | `0x5dcd4` |
| +0x144–+0x14C | Engagement timer, period and kind mask | `0x63250`, `0x63600`, `0x63744` | `0x63600`, `0x63744`, `0x632a4` |
| +0x150–+0x160 | Attack-pass state | `0x63c00`, `0x640d8` | `0x63c00` |
| +0x168 | Handler-private word: interpreter → 0x18-byte state (§11.1); wingman → 0x14-byte block; base → a kind mask | `0x64b54`, `0x60f80`, `0x62b60` | the same handlers |

Every field lives from the install's memset to the removal; nothing clears the controller between steps, and the private blocks are freed by the handler's mode 2. Fields written only at install (+0x00, +0xF8, +0xFC, +0x100–+0x118 apart from `0x5e4d0`'s rewrite, +0x140, the base's +0x168) are configuration; the rest is state carried between steps. Own-object fields the same walk reaches: reads of +2, +3, +4, +8, +0x1C, +0x48–+0x74, +0x7C, +0x8C–+0xA8, +0xAC–+0xC8, +0xCC, +0xD0, +0xDC–+0xE4, +0x110, +0x118, +0x128, +0x12C–+0x150, +0x154, +0x158, +0x180, +0x184, +0x190; writes of +0x28, +0x30, +0x44, +0x8C, +0x90, +0xAC–+0xC4, +0xD0, +0xE0, +0xF8, +0x118, +0x11C, +0x128–+0x150, +0x180, +0x184.

## 2. AICO 6001: global AI parameters

One 192-byte block with two relocations (+0x00, +0x18). Every access goes through the global `0x1b41a0`; a whole-image scan finds 16 references to it, the store in `0x5db80` and 15 reads, all inspected below.

| Offset | Type | Reader and use | Status |
|---|---|---|---|
| +0x00 | in-block pointer | → the group triples (below); `0x632a4` indexes them by difficulty group × 12 | Confirmed |
| +0x04 | 32-bit | Number of triples, equal to the array the pointer addresses (block layout); no reader, so the sign is not observable | Likely (count) |
| +0x08 | i32 | `0x6313c` (built-in handler): loaded with FILD dword and copied as an integer | Confirmed |
| +0x0C, +0x10, +0x14 | f32 | `0x6313c`: compared, subtracted and divided as floats | Confirmed |
| +0x18 | in-block pointer | → 16-byte elements (below); `0x60f80` indexes them by (runtime +0xDC − 1) × 16, with no bound check | Confirmed |
| +0x1C | 32-bit | Number of 16-byte elements, equal to the array the pointer addresses (block layout); no reader, so the sign is not observable | Likely (count) |
| +0x20 | f32 | `0x610c8` (built-in handler): float compare after `0x2d37c` | Confirmed |
| +0x24 | f32 | `0x610c8`: compared with a clock difference converted to float | Confirmed |
| +0x28 | i32 | `0x614a8`, `0x61a88` and `0x61f20`: signed compare | Confirmed |
| +0x2C | i32 | `0x61a88` (a switch case at `0x61cd0`): subtraction and signed compare | Confirmed |
| +0x30 | i32 | The same case: IMUL | Confirmed |
| +0x34 | f32 | `0x63c00`: float compare after `0x2d37c` | Confirmed |
| +0x38 | u32 | `0x63c00`: unsigned compare with a clock difference | Confirmed |
| +0x3C, +0x40, +0x44, +0x48 | f32 | `0x63c00`: two {low, high} pairs of a random interpolation | Confirmed |
| +0x4C | triple array | Target of +0x00: 3 × 12 bytes, each {i32, i32, i32}; `0x632a4` subtracts, compares signed and shifts arithmetically | Confirmed |
| +0x70 | element array | Target of +0x18: 5 × 16 bytes, each four f32; `0x60f80` passes +0x00/+0x04 to `0x5c768` and +0x08/+0x0C to `0x5c7e8`, which use them as floats | Confirmed |

The header ends at +0x4C, the triples fill +0x4C–+0x6F and the elements fill +0x70 to the end of the block, with no gap.

**Who reads what (Confirmed):** only the triples are indexed by the difficulty group (path 5, `0x632a4`, reached from the interpreter's state machine `0x64d58` through `0x63600` when its timer expires, and by script opcodes 501 and 502). The other fields are read regardless of group: +0x34 … +0x48 by `0x63c00`, which the script executor runs for opcode 1101 and built-in handler `0x610c8` also calls; +0x18 and +0x20 … +0x30 by `0x610c8` and its sub-handlers `0x60f80`, `0x614a8` and `0x61a88`, and +0x28 also by `0x61f20`, which `0x62250` calls; +0x08 … +0x14 by built-in handler `0x6313c`. `0x2d37c` and `0x38fd8`, which some of these sites call with the AICO address in EDX, do not read it.

**Readers in detail (Confirmed, code and data; P3-08/03, P3-08/04):**

- **+0x00 triples** (path 5): the engagement share `0x632a4` ([executable A9](./executable.md#a9-engagement-share-0x632a4c-difficulty-path-5--confirmed-code)) compares T − (percentage of kind-`0x380` craft engaging the player, the wingman or anything else) and halves the terms with `SAR`. In group 0, T2 and T2 SAR 1 are positive (data, signs only).
- **+0x18 elements:** `0x60f80` indexes them by the wingman's runtime +0xDC − 1 without a bound check; for the five SCCT roster entries the index is in range (0–4) and pairwise distinct. Words +0x00/+0x04 are the speed and turn fractions (positive and ≤ 1 in all five), +0x08/+0x0C the throttle- and steering-noise amplitudes passed to `0x5c7e8`: throttle noise is enabled in four elements and disabled in the element of roster entry 1, steering noise disabled in all five (signs only). The same index selects the wingman's reply voice (`0x3c894`).
- **+0x20:** proximity clearance threshold of the wingman's evade (`0x610c8`, the proximity object's radius term only, strict). **+0x24:** the wingman's last-victim window (FILD of the zero-extended u32 clock difference, strict). **+0x28:** the friendly-fire threshold, read by `0x614a8` and `0x61f20` (a command waits while the accumulator is above it) and by `0x61a88` (anger); i32, signed, equality does not block ([executable WB6](./executable.md#wb6-friendly-fire-accumulator--confirmed-code-corrects-c2)). **+0x2C/+0x30:** the formation auto-engage radius +0x2C − object +0xE4 × +0x30 against the chopped distance of the candidate from the player (i32, signed strict); positive over the whole +0xE4 support of every roster entry (data).
- **+0x34 … +0x48:** `0x63c00`'s proximity threshold (both radii), the attacker window of its weave (u32 difference, strict) and the two {low, high} pairs of the weave's period and amplitude (+0x3C < +0x40 and +0x44 < +0x48, data).
- **+0x08 … +0x14:** only `0x6313c` (built-in record 9), unreachable in the slice (§10).

## 3. AI program tables

### 3.1 The 0x54-byte program record

The same layout is used by TABL 6003/6007/6005 and the built-in table. "Table" and "built-in" below distinguish the two where they differ.

| Offset | Type | Reader and use | Status |
|---|---|---|---|
| +0x00 | pointer to a NUL-terminated name | Table: in-block pointer; built-in: LE fixup to object 4. `0x649c8` stops at the first record whose word here is zero. No reader of the text was found | Pointer Confirmed; text Likely (every name is NUL-terminated printable ASCII; no reader) |
| +0x04 | 32-bit integer | `0x5de18`: equality with 1 only (skip unless the caller allows) | Confirmed (sign not observable) |
| +0x08 | u32 | Kind mask; `0x5de18` tests it against the object's kind | Confirmed |
| +0x0C | i32 | `0x5de18`: signed compare with runtime +0xDC; `0x5e4d0`: signed divisor (a value 0 with +0x50 set would fault, §12) | Confirmed |
| +0x10 | i32 | `0x5de18`: signed compare with \|runtime +0xE0\|; `0x5e4d0`: subtracted and converted with FILD; tested for zero | Confirmed |
| +0x14 | i32 | `0x5dc0c` copies it to controller +0xF4, which `0x64cb8` adds to the clock as the next update deadline and `0x5e4d0` scales with signed division | Confirmed |
| +0x18 | code pointer | Handler called with (mode, controller). Table: stored value zero, overwritten with `0x64cb8` by `0x649c8`; built-in: LE fixup to object 2 | Confirmed |
| +0x1C | entry ID | Table: a DFPG in every record (loaded by `0x649c8`); built-in: zero, not read | Confirmed |
| +0x20 | pointer | Table: stored value zero, overwritten by `0x649c8` with the address of the +0x1C entry and read through by `0x64b54`/`0x64d58`; built-in: zero, not read | Confirmed |
| +0x24, +0x28 | f32 | `0x5dc0c`: scaled by constants into controller limits; `0x5e4d0` also reads +0x28 | Confirmed |
| +0x2C | f32 | `0x5dc0c`: negated and copied into controller limits | Confirmed |
| +0x30 | f32 | Copied by `0x5dc0c` to controller +0x118, which `0x5cd1c` compares with a dot product: the roll-matching threshold ([executable A4](./executable.md#a4-steering-0x5cd1c-and-roll-matching--confirmed-code-extends-h5)) | Confirmed |
| +0x34 | 32-bit flag | `0x64b54`: tested for non-zero (then calls `0x5c768`) | Confirmed (sign not observable) |
| +0x38 | 32-bit flag | `0x64b54`: tested for non-zero after +0x34 (`0x5e1b0`, the AI-lock enable); passed to `0x5e4d0`, which enables the AI lock inline when it is non-zero and runtime +0xE0 ≥ 0 (§11.2) | Confirmed (sign not observable) |
| +0x3C, +0x40 | f32 | `0x64b54` passes them to `0x5c768` and `0x5e4d0`, which use them as floats | Confirmed |
| +0x44 | 32-bit flag | `0x64b54`: tested for non-zero (then calls `0x5c7e8`) | Confirmed (sign not observable) |
| +0x48, +0x4C | f32 | `0x64b54` passes them to `0x5c7e8`, which compares them with 0.0 and negates them | Confirmed |
| +0x50 | 32-bit flag | `0x64b54`: tested for non-zero (then calls `0x5e4d0`) | Confirmed (sign not observable) |

Fields +0x34 … +0x50 are read only by `0x64b54`, the install path of the interpreter `0x64cb8`, so they matter only for table records. "Flag" fields are only compared with zero; their storage is 32 bits.

### 3.2 Layout of TABL 6003, 6007 and 6005 (Confirmed on all three)

- The records start at +0x00. After the last record comes one terminator record of 0x54 bytes, all zero; `0x649c8` reads only its first word.
- The names follow the terminator: each record's +0x00 points into this area, the names are NUL-terminated and stored in record order, and together with their NULs they fill the area to the end of the block exactly.
- The relocation table lists exactly the records' +0x00 fields.
- Records: TABL 6003 has 5, TABL 6007 6, TABL 6005 5. Several records of one table may name the same DFPG.

### 3.3 Built-in program table `0x1762f8`

- Ten 0x54-byte records in object 4, followed at `0x176640` by their count as an i32 (passed to `0x5de18` as the record count). There is no terminator record and `0x649c8` never processes these records, so the [load transforms](#6-load-transforms-and-conversion-dispositions) do not apply to them.
- **LE fixups (Confirmed by decoding the fixup records):** exactly 20 fixups patch the 0x348 bytes of the table, all of source type 7 (32-bit offset) to an internal target: +0x00 of every record to object 4 (16-bit target offset) and +0x18 of every record to object 2 (32-bit target offset). The count word is not patched. The 10 handler fixups name 8 distinct targets in object 2. The file bytes at each fixup site equal the target offset, but the identity is defined by the fixup record (object number and target offset). The product reads this table with `readFixedUpRegion`, which decodes such internal 32-bit offset fixups; `readRegion` still rejects any region a fixup patches ([executable §1](./executable.md#1-format-and-toolchain-confirmed)).
- **Names:** the 10 name targets lie in object 4 between `0x1722b4` and `0x17231f`; each is NUL-terminated printable ASCII of 4–16 bytes, and no fixup patches them. The regions the import maps, in address order, each exactly a name and its NUL (lengths include the NUL); the ten records' +0x00 fixups target their starts, one each:

  | Region | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Address | `0x1722b4` | `0x1722c0` | `0x1722cc` | `0x1722d8` | `0x1722ec` | `0x1722f4` | `0x172304` | `0x17230c` | `0x172314` | `0x17231c` |
  | Bytes | 10 | 12 | 11 | 17 | 8 | 13 | 5 | 8 | 8 | 5 |

  The lengths come from the P3-03/03 read-only Ghidra output (lengths only). The production import job on the baseline confirmed them: the parser requires each fixup target to start a mapped region that covers exactly the text and its NUL, and the job succeeded (P3-03/19, P3-03/21).
- In all 10 records +0x04, +0x1C, +0x20 and +0x34 … +0x50 are zero.
- **Users (Confirmed):** the fallback of `0x5dbc8`; `0x27ee4` installs record 0 on the player's controller; `0x2ab94` installs record 1 or 2. Which records the slice reaches, and the handler of each, are in §10.3; records 4 and 5 (both the wingman handler `0x610c8`) differ only in +0x0C/+0x10 (selection), +0x14 (period; record 5's is longer) and +0x24/+0x28 (steering limits), with +0x2C, +0x30 equal and +0x34 … +0x50 zero.

## 4. DFPG: program parameters and script lists

The entry a table record names at +0x1C. All 6 DFPGs share the layout (Confirmed on all 6). Readers: the loader `0x649c8`, the interpreter's install path `0x64b54` and its state machine `0x64d58`, all through record +0x20.

| Offset | Type | Reader and use | Status |
|---|---|---|---|
| +0x00 | — | Zero in all 6; no reader | Unused (Likely) |
| +0x04 | i32 | `0x64b54` passes it to `0x63250`: 0 disarms a timer, otherwise the timer is set to the clock plus `rand() %` this value (IDIV) | Confirmed |
| +0x08 | f32 | Squared by `0x649c8` into +0x0C | Confirmed |
| +0x0C | f32 | Stored value zero; overwritten by `0x649c8`; `0x64d58` compares it as a float | Confirmed |
| +0x10, +0x14 | f32 | `0x64d58`: compared with controller +0x2C to choose state 1, 2 or 3 | Confirmed |
| +0x18 | u32 | `0x64d58`: unsigned compare with two clock differences | Confirmed |
| +0x1C | u32 | `0x64d58`: added to the clock as a state deadline (compared unsigned) | Confirmed (width; sign not observable) |
| +0x20 | f32 | `0x64d58`: float compare | Confirmed |
| +0x24 | u32 | `0x64d58`: unsigned compare with a clock difference | Confirmed |
| +0x28 | u32 | `0x64d58`: added to the clock as a deadline | Confirmed (width; sign not observable) |
| +0x2C, +0x30 | f32 | `0x64d58`: float compares, +0x30 with a dot product | Confirmed |
| +0x34 | 32-bit flag | `0x64d58`: tested for non-zero | Confirmed |
| +0x38 | entry ID | A TABL script, or 0 = none (`0x649c8` and `0x64b54` skip zero). `0x64b54` runs it once when the program is installed and releases it | Confirmed |
| +0x3C … +0x68 | six × {in-block pointer, i32 count} | Lists of entry IDs (TABL scripts). `0x649c8` loads every ID while `0 <` count (signed); `0x64d58` picks one with `rand() % count` (IDIV) and also tests counts for 0 and 1 | Confirmed |

**Lists and states (Confirmed, `0x64d58`):** state 1 uses the list at +0x3C/+0x40, state 2 +0x44/+0x48, state 3 +0x4C/+0x50, state 5 +0x54/+0x58, state 4 +0x5C/+0x60 and state 6 +0x64/+0x68. The states and the transitions between them are in §11.3.

**Layout (Confirmed on all 6):** the header is 0x6C bytes; the ID arrays of the non-empty lists follow it contiguously in list order, so the block is 0x6C + 4 × (sum of counts) bytes. An empty list has pointer 0 and count 0 and is not relocated. Every ID names a TABL entry; one script may appear in several lists, and twice in one DFPG.

## 5. AI scripts (TABL)

Every TABL that a DFPG names is a script (Confirmed on all 35 such entries in `AISTUFF.NOB`): an array of 0x18-byte items, then the argument text.

| Offset | Type | Use | Status |
|---|---|---|---|
| +0x00 | u32 | Opcode. The parser `0x5eb64` and the executor `0x5f4f4` branch on it | Confirmed |
| +0x04 | in-block pointer to NUL-terminated text, or 0 | The argument text, parsed by `0x5eb64` according to the opcode (below); 0 = no argument | Confirmed |
| +0x08 | 32-bit | Run-time slot: the parsed value, or a pointer to a parsed multi-value block. Stored value zero | Confirmed |
| +0x0C | 32-bit | Run-time flag: set when +0x08 points to an allocation. Stored value zero | Confirmed |
| +0x10 | i32 | Run-time use count: `0x5eb64` increments it and parses only when it was ≤ 0; `0x5eb1c` (from the release `0x5e9a8`) decrements it and frees the allocation at zero. Stored value zero | Confirmed |
| +0x14 | in-block pointer to an item, or 0 | Branch target: taken items continue there instead of at the next item | Confirmed |

- **Terminator:** the script ends with the first item whose opcode is 10000. `0x5eae8` parses item by item and stops after parsing that item; a parse failure makes `0x5e940` release the entry and return no script. The executor ends a run at opcode 9999 or 10000, storing that item's parsed integer in the execution state.
- **Layout (Confirmed on all 35):** the texts follow the terminator item, are stored in item order, are not shared or overlapped, and with their NULs fill the block to its end exactly. Every branch target is the start of an item before the terminator (in the baseline all branches go forward and none targets the terminator). The relocation table lists exactly the non-zero +0x04 and +0x14 fields. Runtime words +0x08, +0x0C and +0x10 are zero in every item.
- **Text:** every baseline text is 1 or more bytes of printable ASCII, with no trailing space. Items of the "none" class have no text; of the "integer" class only the opcodes 9999 and 10000 occur without text, which leaves the slot zero.
- **Control-flow opcodes (Confirmed, `0x5f4f4`):** 9000 jumps to the branch target; 9001 pushes the next item on a return stack in the execution state and jumps; 9002 returns to the pushed item, or, with an empty stack, restarts at the first item and yields; 9500 clears the stack and continues at the branch target, or at the first item when there is none, and yields.

**Argument classes (Confirmed, branch structure of `0x5eb64`; 210, 211 and 213 corrected by P3-08/02).** Opcodes outside this table make the parse fail.

| Opcodes | Argument |
|---|---|
| 106, 107, 110, 501, 502, 9000–9002, 9500 | None (text not read) |
| 109, 240, 302, 400–402, 404, 500, 1000, 1100, 2000–2003, 2100–2103, 2200–2203, 9999, 10000 | Integer (`0x60538`) |
| 104, 108, 112, 210, 211, 213, 1004 | Float (`0x60688`) |
| 101–103, 1001–1003 | Float multiplied by two constants at parse time |
| 215, 216 | Float multiplied by the same constants, stored as its cosine |
| 200–205, 212, 220–222, 232, 303, 1101, 1102, 2300–2303 | Boolean (`0x60810`: first letter of yes/true or no/false, either case) |
| 230, 231 / 300 / 301 / 403 | Keyword looked up in the code-side table `0x5ea40` / `0x5ea60` / `0x5ea98` / `0x5eac8` (pairs {name pointer, value}) |
| 100 | Four optional floats |
| 105 / 111 | Two / three floats |
| 304 / 305 | Two floats and one / two booleans |

**Correction (P3-08/02, Confirmed, code):** opcodes 210, 211 and 213 were listed as integer. Their parser branches (`0x5ee10`, `0x5ee26`) go to the float parser `0x60688`, and the executor compares their slots with float instructions (`0x5fd29`, `0x5fd3d`, `0x5fd70`). The difference is observable: across `AISTUFF.NOB` 6 of the 7 texts of opcodes 210/211 have a fraction (local data, counts only). Opcode 107 is a no-argument opcode whose executor case compares a primitive's result with its slot, i.e. with 0.

### 5.1 Execution state (P3-08/02)

Confirmed (code). `0x5e940` allocates 0x60 bytes per loaded script use (an *execution state* X):

| Offset | Type | Use |
|---|---|---|
| +0x00 | i32 | Exit value: the slot of the 9999/10000 item that ended the last run; no reader found |
| +0x04–+0x10 | 4 × i32 | Variables v0–v3 (opcodes 2000–2003 write, 2100–2103 compare) |
| +0x14–+0x20 | 4 × u32 clock | Timers t0–t3 (2200–2203 write clock + n, 2300–2303 compare) |
| +0x24, +0x28 | pointers | The script's first item; the current item |
| +0x2C–+0x48 | 8 × pointer | Return stack (9001 pushes the next item) |
| +0x4C | i32 | Return-stack depth; **aliases stack slot 8**: a 9th push overwrites it (no bound check) |
| +0x50, +0x54 | flag, u32 clock | Wait (opcodes 1000–1004) |
| +0x58, +0x5C | flag, u32 clock | Hold (opcode 1100) |

**Reset `0x5e9d8`:** +0x00, v0–v3, t0–t3 and +0x4C–+0x5C := 0; +0x28 := +0x24 (stack slots not cleared, unread at depth 0).

### 5.2 Load, release and the shared parse (P3-08/02)

Confirmed (code).

- **Load `0x5e940(id)`:** X := alloc 0x60 (failure → `0x22fe8`, return 0); X+0x24 := the entry (`0x6affc`, counted); `0x5eae8` parses item by item **up to and including the first 10000 item** (`0x5eb64` each); a parse failure releases the entry reference and frees X (return 0); otherwise `0x5e9d8`(X) and return X. **Release `0x5e9a8`(X):** when X ≠ 0 and X+0x24 ≠ 0, `0x5eb1c`(X) then the entry release; free X.
- **`0x5eb64(item)`:** c := item +0x10; item +0x10 := c + 1 **before** parsing; c > 0 (signed) → return 1 (shared: no parse, no draw); otherwise parse by class (§5.3). **`0x5eb1c(X)`:** for every item up to and including the first 10000, +0x10 −= 1; at exactly 0 with +0x0C ≠ 0 it frees +0x08 (neither word is cleared).
- **Residency:** the table loader takes one reference to every DFPG, install script and list script at start-up and never drops it, so a script entry is never freed and its items' run-time words persist for the program's lifetime. Residency does **not** keep parsed values: they are freed when the last execution state of the script is released, and the next load parses again with new draws, also within one mission.
- **Script-level count equivalence:** load and release always traverse the same items, so for a script whose every item parses, every item holds the same count (the number of live execution states, plus one during an install-script run), and parse and free happen for all items together. A script-level count that parses all items on 0 → 1 and frees them on 1 → 0 is exactly equivalent, provided parse failures are rejected beforehand and allocation and the i32 count never fail. The cache is keyed by the script entry: objects with different DFPGs that name the same script share it. Parse draws occur at the 0 → 1 load, in item order and, within an item, in token order.
- **Failure cleanup (original):** the count is incremented before parsing and the failure path does not call `0x5eb1c`, so the counts of every item up to the failing one stay incremented (with any blocks they allocated); later loads skip those items and the counts diverge permanently. Parse failure needs a statically detectable cause (unknown opcode, a range without `]`, an invalid boolean letter, an unknown keyword, missing text where the class needs it) or an allocation failure; random draws never make a parse fail. No item of the group-0 closure fails.

### 5.3 Argument parser (P3-08/02)

Confirmed (code); `0x5eb64` dispatches by the class table above.

- **Tokenizer `0x60924`** (multi-value arguments): skips leading spaces; copies characters while fewer than 32 are copied, the character is not NUL and it is not a delimiter or is inside brackets (`[` raises and `]` lowers a depth counter; brackets are copied); then skips every following delimiter and trims trailing spaces. Delimiters `0x172428`: comma and space. An exhausted text yields the empty token. **Range tokenizer `0x609e8`:** delimiter space only; up to 0x30 characters; stops at `]` and drops `[`; it writes only the terminating NUL.
- **Integer `0x60538`:** no text → slot unchanged (its stored zero). Otherwise skip spaces; not `[` → C `atoi` (`0x7551b`: optional sign, decimal digits, i32 wrap, trailing text ignored). `[lo hi sign]`: lo, hi by `atoi` of the first two range tokens; no `]` after the second → **parse fails**; value := lo + rand % (hi − lo + 1) (i32 wrap, signed `IDIV`; **hi − lo + 1 = 0 faults**; a negative divisor gives lo … lo + \|d\| − 1). When byte 0 or byte 1 of the third token is `-`: a second draw, and the value is negated (i32 NEG) when (rand & 2) ≠ 0. `+` has no effect. Support (lo ≤ hi): {lo … hi}, each value weighted ⌊32768/n⌋ or one more (modulo bias), mirrored with probability ½ when the sign token allows it (0 stays 0). **Stale byte:** for an empty sign token byte 1 still holds byte 1 of the previous token (hi); it is never `-` for a plain number, so rejecting non-numeric bounds at creation removes the quirk.
- **Float `0x60688`:** no text → slot := 0.0 (unlike the integer parser). Not `[` → F(C `strtod`) (`0x8708a`: whitespace, sign, digits with one `.`, exponent letters e, E, d, D; at most 17 significant digits; trailing text ignored). `[lo hi sign]`: lo, hi by `strtod` kept as f64; no `]` → fails; value := F(D(lo + D(D(r × c) × D(hi − lo)))), c = f32 `0x17244e` = f32(1/32767) = 32769/2³⁰ (r × c exact); the sign rule as for integers flips the f32 sign bit (0 can become −0). Reversed bounds interpolate downward. **`strtod` rounding (P3-08/07, Confirmed, code):** `0x9a05e` accumulates the digits into an exact 64-bit integer m (converted to f64 exactly by `0x9a0a9` while m < 2⁵³), and `0x9a13b` builds 10^\|e\| from a table of exact powers (`0x174750`: 10^216, 10^108, 10^54, 10^27, 10^14, 10^8, 10^4, 10^1 repeated) and performs one division or multiplication. For at most 15 significant digits and \|e\| ≤ 22 — every token in the baseline has at most 4 significant digits and no exponent — the power is exact and the result is the correctly rounded f64 under the 53-bit precision control (the [rounding direction](./executable.md#x87-precision-rounding-and-trigonometry-p3-0202) caveat of U-009 applies as everywhere).
- **Degrees and cosine:** 101–103 and 1001–1003: slot := F(D(D(v × f64 3.1415927) × f64 0.005555555555555555)) (`0x17242b`, `0x172433`, the same non-exact constants as [H5](./executable.md#h5-missiles--confirmed-code-unless-marked)). 215/216: the same value in a local f32, then slot := F(FCOS(that f32)). With no text the cosine classes give F(cos 0) = 1.0.
- **Boolean `0x60810`:** first character after spaces: N, F, n, f → 0; Y, T, y, t → 1; anything else fails. No null check (no text would read address 0; never in the data).
- **Keyword `0x60894`:** no text → fails. **Trims trailing spaces in place** (the script text keeps the trim; reparsing gives the same result), then walks {name pointer, i32 value} pairs until a null name and compares case-insensitively (only A–Z folded); first match → its value; none → fails.
- **Multi-value blocks** (slot +0x08 := block, +0x0C := 1; float tokens through `0x60688`, booleans through `0x60810`; sub-parser results ignored):

  | Opcode | Block | Layout |
  |---|---|---|
  | 100 | 0x20, zeroed | 4 × {i32 present, f32 value}; a token starting with `x`/`X` is absent; **an empty token is present with 0.0** |
  | 105 | 8 | f32 lo, f32 hi |
  | 111 | 0xC | 3 × f32 |
  | 304 / 305 | 0x20 | f32, f32, i32 boolean / f32, f32, i32 boolean₁, i32 boolean₂ |

- **Keyword tables (Confirmed, code and fixups):** four code-side tables in object 2 — `0x5ea40` (3 names; opcodes 230, 231), `0x5ea60` (6; 300), `0x5ea98` (5; 301), `0x5eac8` (3; 403) — each terminated by a null pair. Exactly 17 LE fixups patch `0x5ea40`–`0x5eae7`, all source type 7, internal, object 4, 16-bit target offset, one at +0 of every non-null pair; the value words are not patched and the stored words equal the target offsets, as in the [built-in table](#33-built-in-program-table-0x1762f8). The 14 distinct names lie at `0x1723a8`–`0x172427` (object 4), each NUL-terminated, starting 4-byte aligned, 111 bytes with their NULs; within a table the names are distinct even case-insensitively; the values are distinct small non-negative integers (value sets {0, 1, 2}, {0 … 5}, {0 … 4}, {0, 1, 2}); tables `0x5ea40` and `0x5eac8` have identical name targets and values. **Disposition:** the names are original text, so the tables are imported (pair order, i32 values, name bytes with NUL, the null terminator, fixup identity, regions covering exactly text + NUL, and the identity of the first and fourth tables); the delimiter sets and the numeric constants are code syntax and constants (P3-08/09, D-03). The slice needs `0x5ea40`, `0x5ea60` and `0x5ea98` (§10.2).
- **Name regions (Confirmed, P3-08/13):** the regions the import maps, in address order, each exactly a name and its NUL (lengths include the NUL); every pair's fixup targets the start of one, and tables `0x5ea40` and `0x5eac8` name the same three. The gaps between them are padding to the next 4-byte boundary.

  | Region | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | Address | `0x1723a8` | `0x1723b0` | `0x1723bc` | `0x1723c4` | `0x1723cc` | `0x1723d8` | `0x1723e0` | `0x1723e8` | `0x1723f4` | `0x172400` | `0x172408` | `0x172410` | `0x172418` | `0x172424` |
  | Bytes | 8 | 10 | 8 | 5 | 9 | 7 | 8 | 11 | 12 | 6 | 6 | 7 | 10 | 4 |

  A local LE fixup decoder independent of the product (lengths, flags and counts only) and the production import job on the baseline image agree: 17 fixups, all source type 7 with a 16-bit internal target offset into object 4, pairs 3, 6, 5 and 3, and the same digest of the tables (P3-08/13 completion evidence).

### 5.4 Executor `0x5f4f4`

Confirmed (code; P3-08/02, primitives P3-08/03). S = C+4; a = the item's slot.

- **Entry:** (1) with no hold flag: a set wait flag and sample < X+0x54 (unsigned, strict) → `0x5c8b0`, `0x5cd1c`; when the cone bits C+0xC4 = 3 and channel 0 is in range, press channel 0 with hold 0x20; **return 0** (no item runs). Otherwise the wait flag := 0. (2) `0x5c8b0` once per run. (3) A set hold flag and sample < X+0x5C → **hold step**: `0x5d090`(S, 0, 0.6, 1.0), `0x5cd1c`, `0x5d014`; ready and steady → press channel 1 (−1); cone = 3 and channel 0 in range → press channel 0 (2 × C+0xF4); target not ahead (S+0x68 bit 2 clear) and channel 2 in range → press channel 2 (2 × C+0xF4); return 0. (4) Hold flag := 0, then the loop.
- **Loop:** each iteration dispatches the item at X+0x28 (unsigned compares) and moves to the branch target or the next item: **actions** go to the target when non-zero, else to the next; **tests** go to the target only when the condition holds. There is **no step counter**: the loop ends only at a yield. The first of 203/204/205 computes `0x5cc6c` and caches it for the run.
- **Opcodes** (draws listed are the opcode's own):

| Op | Kind | Effect |
|---|---|---|
| 100 | action | block {f0,v0,…,f3,v3}: f0, f1, f2 set → `0x5d0ec`(S, v0, v1, v2, f3 ? v3 : −1.0); else `0x5d1ac`(S, f0, v0, f1, v1, f2, v2) and, when f3, `0x5d41c`(S, v3) |
| 101 / 102 / 103 | action | `0x5d1ac` with only row 1 / 2 / 3 set to a |
| 104 | action | `0x5d41c`(S, a) |
| 105 | action, 1 draw | `0x5d41c`(S, F(D(D(D(rand × c) × F(hi − lo)) + lo))) |
| 106 | action | `0x5cd1c`, `0x5d014` |
| 107 | test | `0x5d274`(S) = a (a is 0: branches when nothing was posted) |
| 108 | test | proximity +0x94 valid and `0x2d37c`(0, its +0x98, its kind) < F(a²) (strict) → `0x5d374`(S, it) and branch |
| 109 | test | attacker +0xA4 valid and sample − +0xA8 ≤ a (unsigned) → `0x5d374`(S, it) and branch |
| 110 / 111 | action | `0x5d080`(S) / `0x5d090`(S, b0, b1, b2) |
| 112 | special | target +0x10 valid and 0 < S+0x4C: v := F(D(D(target speed × D(1 + D(a × 0.01))) / S+0x4C)); v ≤ 1.0 → `0x5d41c`(S, v), target-or-next; else `0x5d41c`(S, 1.0) and **next**; preconditions false → next |
| 200 / 201 / 202 | test | (S+0x68 bit 2 / 1 / 0 set) = a |
| 203 / 204 / 205 | test | (S+0x78 bit 2 / 1 / 0 set) = a, after the cached `0x5cc6c` |
| 210 / 211 | test | C+0x2C < a / C+0x2C > a (f32, strict) |
| 212 | test | (C+0x2C < C+0x4C) = a |
| 213 | test | D(C+0x4C + a) < C+0x2C (strict, unrounded) |
| 215 / 216 | test | dot < a / dot > a, dot := F(D(D(D(T.r3y·O.r3y) + D(T.r3z·O.r3z)) + D(T.r3x·O.r3x))) with T the valid +0x8C, else 0.0 |
| 220 / 221 / 222 | test | (C+0xC4 bit 0 / bit 1 / any set) = a |
| 230 / 231 | test | channel (a low byte) **in range** / **not in range** (`0x5dfa4` ≠ 0 / = 0) |
| 232 | test | (ready and steady) = a (`0x5e15c` only after a true `0x5e154`) |
| 240 | test, 1 draw | rand % 101 < a (signed) |
| 300 | action | lead mode := a (`0x5c878`(S, a, 0, 0): constant 0 for modes 1, 2, 3, 5, kept for 0, 4) |
| 301 | action | size class := a, radius re-derived (`0x5c73c`) |
| 302 | action | C+0xF4 := a (takes effect at the next interpreter entry) |
| 303 | action | a ? `0x5e1b0` : `0x5e1d4` (AI lock on / off) |
| 304 / 305 | action | `0x5c768`(S, f0, f1, bool) / `0x5e4d0`(C, f0, f1, bool₂, bool₁) |
| 400 / 401 / 402 | action | press channel 0 / 1 / 2 with hold a |
| 403 | action | release channel (a low byte) |
| 404 | action | h := a ≠ 0 ? a : 2 × C+0xF4; the three conditional presses of the hold step with h |
| 500 | action, 1 draw when a ≠ 0 | `0x63250`(C, a, 0) |
| 501 / 502 | test | `0x632a4` ≠ 0 / `0x63600` ≠ 0 (each ≤ 1 draw) |
| 1000 | **yield** | wait: X+0x50 := 1, X+0x54 := sample + a; target-or-next; return 0 |
| 1001 / 1002 / 1003 | **yield** | as 1000 with sample + low32(trunc(D(D(a / C+0x58 / +0x5C / +0x60) × 64.0))) (a zero rate divides by zero) |
| 1004 | **yield** | as 1001 with C+0x50 (distance ÷ speed limit) |
| 1100 | **yield** | hold: X+0x58 := 1, X+0x5C := sample + a; target-or-next; return 0 |
| 1101 / 1102 | test | `0x63c00`(C) = a / `0x5e710`(C, a) ≠ 0 |
| 2000–2003 / 2100–2103 | action / test | v[n] := a / v[n] = a |
| 2200–2203 / 2300–2303 | action / test | t[n] := sample + a / (sample > t[n], unsigned strict) = a |
| 9000 | control | target-or-next, no yield |
| 9001 | control | push the next item, depth += 1 (no bound check), target-or-next |
| 9002 | control | depth 0 → current := first item, **yield**; else depth −= 1 and continue at the popped item |
| 9500 | **yield** | depth := 0; current := target, or the first item; return 0 |
| 9999, 10000 | **end** | X+0 := a; **return 1**; the current item is not advanced (a further run ends at once) |

Sample comparisons wrap modulo 2³². An opcode without a case would be a no-op that advances, but the parser rejects every such opcode. `0x60860` (a degree-float parser) has no caller or pointer.

## 6. Load transforms and conversion dispositions

Dispositions follow the P3-03 field rules ([spec](../../plan/p3/03/spec.md#字段处理规则), rules 3–6).

| Location | Original load behaviour (Confirmed) | Disposition |
|---|---|---|
| IMFAT pointers (all entries) | Relocated to absolute addresses | Structural: pointers become positions in the converted structure (rule 4) |
| Program record +0x08 (table) | 0 replaced by 0x380 | Source 0 converts to null; the consumer substitutes 0x380 (rule 3) |
| Program record +0x2C (table) | +0.0 or −0.0 (`value & 0x7fffffff == 0`) replaced by 1.0 | Source +0.0 and −0.0 convert to null; the consumer substitutes 1.0 (rule 3) |
| Program record +0x18 (table) | Overwritten with `0x64cb8` | Stored value not converted (rule 5) |
| Program record +0x20 (table) | Overwritten with the +0x1C entry's address | Stored value not converted (rule 5) |
| DFPG +0x0C | Overwritten with (+0x08)² | Arithmetic derivation, done by the consumer; stored value not converted (rule 5) |
| Script items +0x08, +0x0C, +0x10 | Written by parsing and release at run time | Not converted, and must be zero: the parser reads +0x10, and for an item it does not parse (no-argument opcodes, an integer opcode without text) the stored +0x08 and +0x0C survive and are read by the executor (opcodes 9999 and 10000 return +0x08) and by the release `0x5eb1c` (frees +0x08 when +0x0C is set) |
| Script text | Parsed per opcode at run time, with random draws, scaling and in-place trimming | Not performed at import; the text is kept as stored (rule 8) |
| Built-in +0x00, +0x18 | LE fixups | Code pointer (+0x18): opaque {object, offset} from the fixup record (rule 4). Name (+0x00): text read at the fixup target (rule 8) |
| Keyword table pairs (§5.3) | Name word: LE fixup; value word: none; read in place by `0x60894` | Imported into `data/ai-programs` (schema 2, P3-03 revision 3): the four tables in address order, pairs in stored order without the null pair, the name as the text at the fixup target (rule 8), the i32 value as stored. The null pair, the fixup set, the region boundaries and the case-folded distinctness within a table are checked at conversion, not carried |

Zero as "none" (Confirmed): DFPG +0x38 = 0, a list with count 0, script +0x04 = 0 and script +0x14 = 0. Other zeros (flags, the DFPG +0x04 timer value) are values the code tests, not absence markers.

Where the code never observes the sign of a 32-bit integer (flags compared only with 0 or 1, clock offsets added modulo 2^32, the two AICO counts), the stored bit pattern is the value; as u32 it is kept unchanged. The AICO counts are only consistent with the block when they equal the element counts the layout fixes.

## 7. Positions that are only zero in the baseline

| Location | Readers | Disposition |
|---|---|---|
| DFPG +0x00 (6 of 6) | None found | Unused: not converted; non-zero is unsupported (rule 6) |
| Table terminator record +0x04 … +0x53 (3 of 3) | None | Unused: as above |
| Built-in records +0x1C, +0x20 (10 of 10) | Read only for table programs | Typed by §3.1; zero in every built-in record |
| Built-in records +0x34 … +0x50 (10 of 10) | Read only by `0x64b54`, which built-in handlers do not use | As above |
| Program record +0x04 (16 table and 10 built-in records) | `0x5de18` | Typed, read; zero in every baseline record |
| Program record +0x34, +0x44, +0x48, +0x4C in TABL 6003 (5 of 5) | `0x64b54` | Typed, read; non-zero in TABL 6005 and 6007 |
| Script terminator +0x04 and +0x14 (22 of 22 in group 0) | +0x04 parsed as an integer; +0x14 not reached | Typed by §5 |

## 8. Observed maxima

Counted on the group-0 closure the slice loads (TABL 6003, its 25 entries, AICO 6001) and on the built-in table.

| Structure | Observed |
|---|---|
| AICO 6001 | 192 bytes; 2 relocations; 3 triples; 5 elements of 16 bytes |
| TABL 6003 | 572 bytes; 5 records and the terminator record; 5 relocations; name length 20 bytes at most (68 bytes of names) |
| DFPG (3) | 136–160 bytes; 4–6 relocations; list lengths at most 1, 6, 1, 1, 2, 5 (lists in offset order); 7–13 IDs per DFPG |
| Scripts (22) | 100–1217 bytes, 4838 in total; 4–40 items including the terminator, 157 in total; 1–30 texts per script, 103 in total; text length 1–37 bytes; 1–50 relocations; at most 20 branching items per script; 32 distinct opcodes, all in the classes of §5 |
| References | 5 program records → 3 distinct DFPGs; 33 list slots and 3 +0x38 IDs → 22 distinct scripts |
| Built-in table | 10 records; names 4–16 bytes; 20 fixups, 8 distinct handler targets |
| Keyword tables (EXE) | 4 tables, 168 bytes with their null pairs; 3, 6, 5 and 3 pairs (6 at most); 17 fixups; 14 distinct names of 3–11 bytes, 111 bytes with their NULs (§5.3) |

Across all of `AISTUFF.NOB` the script maxima are the same, a DFPG list holds at most 1, 6, 1, 2, 2, 5 IDs, and the tables of groups 1 and 2 have 6 and 5 records.

## 9. Evidence and coverage

- **Code (Confirmed):** native instructions and decompilation, read-only. The AI code `0x5c000`–`0x65e00` was decompiled as a whole (176 functions, including those reached only through pointers or found in gaps), with targeted disassembly of the loader, the filter, the install and state-machine paths, the parser and every AICO access. Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and calling conventions set in memory were discarded.
- **Data (Confirmed):** an independent local IMFAT reader surveyed all 45 `AISTUFF.NOB` entries (layouts, relocation sets, value classes per field, text coverage, branch targets, closures), and a local LE fixup decoder covered the built-in table and its name strings. The survey outputs hold entry IDs, offsets, sizes, counts and value classes; the raw word dumps used while reading the code stay private in the same ignored directory.
- **Search limits:** readers of the program record were sought through the controller's +0xF8 in the AI code and by a raw scan of the code object for 32-bit loads from offset 0xF8; readers of AICO through all 16 references to `0x1b41a0`. Accesses through pointers copied outside these paths are not excluded. No baseline run was made.
- **P3-08 (Confirmed, code and data):** §1 *Selection* to *Removal*, §1.1, §5 (correction and §5.1–§5.4), §10–§12 and the reader details of §2 come from the read-only research of P3-08/01–04 and 07, by the same method (native instructions; decompilation only to navigate; callers by whole-image scans; p-code register tracking for the controller fields; local data scripts printing indices, counts and verdicts). Evidence: ignored `local/research/p3-08/` (`selection/`, `interpreter/`, `combat/`, `wingman/`, `consolidation/`). No baseline run was made.
- **Local evidence:** ignored `local/research/p3-03/ai/` (`probe.sh`, `ghidra_scripts/AiProbe.java`, `ghidra_scripts/AiRegion.java`, `dump.ts`, `closure.ts`, `programs.ts`, `dfpg.ts`, `scripts.ts`, `opclass.ts`, `stats.ts`, `le-fixups.ts`, `rawscan.ts`, outputs in `out/`).

## 10. Support closure of the slice (P3-08/01)

Configuration: difficulty group 0, SCEN 3019 (header +0x0C = 0), wingman selector 0–5. Confirmed (code and data); the data checks print record indices, entry IDs, match classes, counts and preimage counts only.

### 10.1 Program records

| Object source | Kind | Selection draws | Possible results (preimage count over one rand output 0–32767) |
|---|---|---|---|
| SCEN records 3, 4, 5 (record 3 at time 0, 4 through section-5 entry 0, 5 through entry 2 at 300 s) | 0x80 | 1 | TABL 6003 record 0 (19,660), 1 (6,554), 2 (6,554); full matches 0–2, partial 3–4 |
| SCEN record 6 (section-5 entry 1) | 0x100 | 1 | TABL 6003 record 0 (26,214), 1 (6,554); full 0–1, partial 4 |
| SCEN record 7 | 0x20000 | 2 | built-in record 6, always |
| SCCT roster entries 0, 1, 2 | 2 | 2 | built-in record 5, always (record 4 matches only partially) |
| SCCT roster entries 3, 4 | 2 | 2 | built-in record 4 (29,491 second-draw values) or 5 (3,277) |
| Player, Xpon (record 8), templates (kind 0) | 1, 0x4000, 0 | 0 | none (no selection) |

- The counts are preimages of one rand output by residue, not probabilities over seeds. For the base and the wingman the result depends only on the second draw.
- TABL 6003 records 3 and 4 only ever match partially, and every start finds a full match first: they are unreachable for every slice object.
- **Wingman combinations:** records 4 and 5 both name the wingman handler `0x610c8`; the five roster entries use five distinct in-range AICO elements, so there are seven (roster entry, record) input combinations; their behaviour classes are in [executable WA10](./executable.md#wa10-parameters-and-behaviour-classes--confirmed-code-and-data).
- Runtime +0xDC/+0xE0 cannot change before the selection and the record defaults are fixed per build ([record defaults](./executable.md#record-defaults-p3-0203)), so every object of a record draws from the same support.

### 10.2 DFPGs, scripts and keyword tables

- **Load closure vs execution closure:** the start-up loader still loads and relocates every group-0 entry (3 DFPGs, 22 scripts, §1), so all of them stay inside the content and reference checks. Only DFPGs 6031 (records 0, 1) and 6013 (record 2) are installed or executed; **6025** is named only by TABL 6003 record 4 and is loaded but never installed or executed. Apart from the loader, DFPG fields are read only through C+0xF8 → record +0x20; C+0xF8 is written only by `0x5dc0c`, whose record comes from object +0x10, built-in record 0 (`0x27ee4`) or built-in records 1/2 (`0x2ab00`); record pointers originate only in the table cells, the built-in base and the two missile record addresses. No other route executes a DFPG.
- **Executable scripts:** 17 of the 22 — 6009, 6011, 6015, 6017, 6019, 6027, 6029, 6033, 6035, 6043, 6045, 6051, 6053, 6055, 6057, 6059, 6061 — with 100 items and 25 distinct opcodes: 100, 104, 106, 107, 111, 200, 210, 211, 222, 231, 232, 240, 300, 301, 400, 401, 402, 1000, 1001, 1002, 1003, 1101, 9500, 9999, 10000. This is conservative: every script a reachable DFPG names at +0x38 or in any list. Scripts 6021, 6023, 6037, 6039, 6041 (only through 6025) and the opcodes 203, 204, 205, 403, 2000, 2100 and 9000 that occur only there are loaded but never executed; opcode 1102 occurs in no group-0 script.
- **Keyword tables needed:** `0x5ea40` (231), `0x5ea60` (300) and `0x5ea98` (301); not `0x5eac8` (403).

### 10.3 Built-in handlers

| Record | Handler | Slice verdict |
|---|---|---|
| 0 | `0x60d54` (autopilot) | Reachable only through the player's `a` key (`0x27ee4`, player control block); outside the approved scope (G-09, P4) and not part of the AI closure |
| 1, 2 | `0x60aa0`, `0x60b84` | Reachable: homing missiles of every shooter through `0x2ab00` ([H5](./executable.md#h5-missiles--confirmed-code-unless-marked)) |
| 3 | `0x60b84` | Unreachable: its mask selects the missile kind 0x100000, which is created only by `0x2b00c` and never selected |
| 4, 5 | `0x610c8` | Reachable (wingman) |
| 6 | `0x62c10` | Reachable (bases) |
| 7 | `0x62d34` | Unreachable |
| 8 | `0x648fc` (calls `0x64820`, difficulty path 4) | Unreachable |
| 9 | `0x6313c` (range damage; the only reader of AICO +0x08–+0x14) | Unreachable |

The parked handler `0x62250` is not a record handler; it is reached by every parked, controller-bearing slice object (kinds 2, 0x80, 0x100, 0x20000), never by the player, missiles or Xpons ([executable D1](./executable.md#d1-phase-callers-and-dispatch--confirmed-code)).

**Exclusion of records 7–9:** (1) their masks share no bit with the slice's AI kinds 2, 0x80, 0x100, 0x20000 (data); (2) the built-in table is scanned only by `0x5dbc8` after the group table returned nothing, and the 0x80/0x100 objects always get a table match; (3) objects of other AI kinds are never created in the slice: instantiation creates only the SCEN 3019/SCCT kinds, and the other allocator callers (`0x23ac8`, `0x23fdc`, `0x24ec4`, `0x25124`, `0x25500`, `0x25b0c`, `0x2b00c`, `0x38780`, `0x3cb80`) never call `0x20990`, leave +0x10 at 0 and never install `0x20c18`; (4) the handler addresses occur only in the table, and only `0x648fc` calls `0x64820`; (5) over-approximate instruction-level reachability (fall-through, branches, direct calls, jump tables and every code-address constant) from `0x20c18`, `0x64cb8`, `0x610c8` and `0x62c10` covers 17,333 instructions and reaches none of `0x6313c`, `0x648fc`, `0x64820`, `0x62d34`, `0x60d54`, `0x20990`, `0x5dbc8`, `0x5de04`; it reaches `0x38780` and the Xpon callback `0x3897c` (through the wingman's parked step), and from `0x3897c` no AI install, step or handler code. Its unresolved indirect transfers are the handler calls, a list release callback and two I/O callbacks of the archive loader.

**Rule-created and late objects:** the section-5 reinforcement at 300 s (record 5, kind 0x80) has the same support as the time-0 0x80 craft, and SCEN 3019 has no trigger, repeat or probability route; `0x38780` (key `b` and the wingman's drop) creates kind 0x4000 with no program; missiles get records 1/2 only through `0x2ab00`.

## 11. Program interpreter (P3-08/02)

Confirmed (code). The interpreter `0x64cb8` is the handler of every table record: the install path `0x64b54`, the state machine `0x64d58` and the executor ([§5.4](#54-executor-0x5f4f4)). R = the program record (C+0xF8), D = its DFPG (R+0x20), I = the interpreter state (C+0x168). The primitives it calls (steering, targeting, firing, departure) are in [executable](./executable.md#ai-piloting-targeting-and-firing-p3-0803).

### 11.1 `0x64cb8(mode, C)` and the interpreter state

1. C+0xF0 := sample + C+0xF4 (32-bit add) — in **every** mode, first, with the current period.
2. r := `0x64b54(mode, C)`; r ≠ 0 → return 1 (mode 2, or an install whose install script fails to load).
3. I = 0 → return 0.
4. `0x64d58(C, I)` = 0 and I+4 ≠ 0 → I+8 := executor run of I+4 (through `0x5e9d0`).
5. Steering status C+0xC4 = 3 → I+0x0C := sample.
6. Return 1.

**Install link (Confirmed, code; P3-08/27):** because step 1 runs before `0x5e4d0` (§11.2), the deadline written by the install uses the record's period, and the rewritten period applies from the first update on.

**Mode 0 therefore runs steps 3–5 too:** an install is followed in the same call by a state-machine pass and, when a script was chosen, a first executor run.

| I offset | Type | Use |
|---|---|---|
| +0x00 | u8 | Current state 0–6 (0 = none yet) |
| +0x04 | pointer | Current execution state ([§5.1](#51-execution-state-p3-0802)), or 0 |
| +0x08 | i32 | Result of the last executor run (0 yielded, 1 ended); not cleared on a script change |
| +0x0C | u32 clock | Set to the sample after every update in which C+0xC4 = 3 |
| +0x10 | u32 clock | State deadline: sample + D+0x1C, written when state 3, 4 or 5 is entered from outside {3, 4, 5} |
| +0x14 | u32 clock | State-4 deadline: sample + D+0x28 when state 4 is entered with this word 0; cleared when leaving 4 |

C+0xC4 (the cone bits of the steering block) is distinct from object +0xC4 (the AI mode).

**Removal (mode 2):** when I ≠ 0, release I+4 when non-zero and free I (C+0x168 is not cleared; the caller returns the controller to the pool); return 1. Modes other than 0 and 2 behave as an update.

### 11.2 Install, mode 0 (`0x64b54`)

If D is 0 → return 0 (built-in records only). Otherwise, in order:

1. `0x63250(C, D+0x04, 0)`: the retarget timer ([executable A10](./executable.md#a10-engagement-timer--confirmed-code)); one draw when D+0x04 ≠ 0.
2. R+0x50 ≠ 0 → `0x5e4d0(C, R+0x40, R+0x3C, R+0x38, 1)` (below).
3. R+0x34 ≠ 0 → `0x5c768(S, R+0x40, R+0x3C, 1)`, then, when R+0x38 ≠ 0, `0x5e1b0(C)` (AI lock on).
4. R+0x44 ≠ 0 → `0x5c7e8(S, R+0x4C, R+0x48)` (noise).
5. D+0x38 ≠ 0 → load the install script; a failed load **returns 1 with no I**, so the object's program never runs and its removal does nothing; otherwise one executor run (result ignored; a wait or hold ends the script there) and release.
6. Allocate I (0x18 bytes, zeroed; failure → `0x22fe8`) and return 0, so `0x64cb8` continues with the first update.

**`0x5e4d0(C, a, b, g, c)`** (also opcode 305):

1. e := O+0xE0, k := O+0xDC. e < 0 → **O+0xE0 := −e** (written back) and the lock gate is off; else on.
2. s1 := 1.0 when R+0x10 = 0; else s1 := F(D((e − R+0x10) × 0.01)) (i32 subtraction, FILD), clamped below at 0. *P3-08/16 (Confirmed, code):* e here is the value after step 1's write-back, i.e. \|O+0xE0\|.
3. s2 := F(D(q × 0.01)), q := trunc(100 × (R+0x0C − k) / R+0x0C) (i32, signed `IDIV`; **R+0x0C = 0 faults**).
4. Gate on and g ≠ 0 → as `0x5e1b0` (AI lock on).
5. s2 > f32 0.5 → C+0xF4 := (3 × C+0xF4) / 2 (toward zero). Else s1 > f64 0.3 → C+0xF4 := (2 × C+0xF4) / 3 (signed `IDIV`); C+0x10C := F(D(D(D(R+0x28 × 3.1415927) × 0.005555555555555555) × D(D(1 + s1) × 0.5))), C+0x108 := its negation; then `0x5c530` re-initialises the steering block.
6. v1 := F(D(a − D(D(a × s2) × 0.125))), raised to f32 0.65 when the unrounded value is below 0.65; v2 likewise from b with a floor of f32 0.5; `0x5c768(S, v1, v2, c)`.
7. w := F(D(s2 × 0.0625)); `0x5c7e8(S, w, w)` — the same amplitude for throttle and steering noise.

Repeated calls (opcode 305, not in group 0) compound the period change. That s1 and s2 are skill terms of SCEN +0x70/+0x74 is Likely only.

**Group 0 (data, flags only):** all 5 TABL 6003 records have R+0x50 ≠ 0 and R+0x34 = R+0x44 = 0; R+0x38 ≠ 0 in 3 of 5; every DFPG has D+0x04 > 0. So every slice install draws once in `0x63250` and runs `0x5e4d0`, never `0x5c768`/`0x5c7e8` directly; no runtime +0xE0 is negative in the slice, so `0x5e4d0`'s write-back has no effect there. The install scripts have no range and none of the draw opcodes (0 draws).

### 11.3 State machine `0x64d58`

Returns 1 only from rule 1 (the executor is skipped for this update), 0 otherwise. st starts as the current state cur = I+0; t0 := O+0x8C before rule 2; t is the current target carried in a register; d := C+0x2C (f32).

1. **Proximity escape:** p := O+0x94 valid, `0x2d37c(O kind, O+0x98, p kind)` < D+0x0C (= D+0x08², f32) and `0x5e844(O, p)` (p ahead) → `0x5d374(S, p)`, return 1.
2. **Retarget:** `0x63600(C)` ([executable A10](./executable.md#a10-engagement-timer--confirmed-code)); t := O+0x8C. When t ≠ t0: `0x5c8b0`; st := 3 if d < D+0x14, else 2 if d < D+0x10, else 1 (f32, strict).
3. **State 5:** st ∉ {1, 2}, D+0x58 > 0 (signed) and t valid: st := 3 if st = 5; `0x5c8b0`; when S+0x68 bit 2 is clear and (`0x5cc6c`; S+0x78 bit 2 set) and d < D+0x2C and dot ≥ D+0x30, dot = D(D(D(O.r3y·T.r3y) + D(O.r3z·T.r3z)) + D(O.r3x·T.r3x)) (not rounded to f32): st := 5.
4. **Attacker:** a := O+0xA4 valid, **not** on O's side, and sample − O+0xA8 ≤ D+0x24 (unsigned): when t ≠ a, `0x63744(C, a)` and t := a; st := 3 when D+0x60 = 0, else 4 and, when I+0x14 = 0, I+0x14 := sample + D+0x28.
5. **Victim:** D+0x34 ≠ 0, v := O+0x9C non-zero, valid and **on** O's side, and sample − O+0xA0 ≤ C+0xF4 (unsigned): st := 2.
6. st = 1 and d < D+0x10 → st := 2.
7. **Stall:** st ∈ {3, 4, 5}, D+0x18 ≠ 0, t = t0 and sample > I+0x10 (unsigned, strict): x := sample − I+0x0C, y := sample − O+0xA0; `0x5c8b0`; (x > D+0x18 or y > D+0x18, unsigned strict) and d < D+0x20 → st := 6.
8. cur = 4, st ≠ 2, sample < I+0x14 (unsigned, strict) and t = t0 → st := 4.
9. cur = 4, st = 4 and sample > I+0x14 (unsigned, strict) → st := 3 (at equality neither 8 nor 9 applies).
10. (st = 1 and D+0x40 = 0) or (st = 2 and D+0x48 = 0) or (st = 6 and D+0x68 = 0) → I+0x14 := 0, st := 3.
11. **Same state** (st = cur): no script → return 0; script still running (I+8 = 0) → return 0. Ended: states 1, 3, 4, 5 with a list count of exactly 1 → **reset** the execution state (`0x5e9d8`, no draw, no reparse) and return 0; states 2 and 6 → st := 3 and continue; any other count → continue.
12. **Switch:** release I+4 when set, I+4 := 0; st ≠ 4 → I+0x14 := 0.
13. **Select** from st's list (§4): count ≠ 0 → load `list[rand % count]` (signed `IDIV`; **one draw, also for a count of 1**), else no script (a failed load also leaves 0). For st ∈ {3, 4, 5} entered from cur ∉ {3, 4, 5}: I+0x10 := sample + D+0x1C. I+0 := st. Return 0.

**Side test** (rules 4, 5 and `0x632a4`): with K = O's kind and Q the other's, "on O's side" ⇔ (K & `0x6C87F` ≠ 0 ? Q & `0x6C07F` : Q & `0x93F80`) ≠ 0.

**Consequences:** the empty-list branches of states 1, 2 and 6 are unreachable (rule 10); state 4 needs D+0x60 ≠ 0 and state 5 D+0x58 > 0; so "no script" occurs only in state 3, where the executor does not run. Every state change draws exactly once; rule 11's restart draws nothing. A script whose only user re-selects it is released first and loaded after, so it is parsed again (new parse draws); with another live user it is not. **Group-0 lists** (counts in state order 1, 2, 3, 5, 4, 6): DFPG 6013 {1, 6, 1, 1, 2, 2}, 6025 {1, 6, 1, 0, 0, 5}, 6031 {1, 3, 1, 1, 1, 0}: 6025 never enters 4 or 5, 6031's state 6 is redirected to 3, states 1 and 3 always restart, states 2 and 6 fall back to 3 when their script ends.

## 12. Script numerics and execution budget (P3-08/02)

Confirmed (code) unless marked; the cross-path summary is in [executable](./executable.md#numbers-and-draws-on-the-ai-paths-p3-08-q-12).

- **Storage:** I: u8 state, u32 clocks; execution state: i32 variables and exit value, u32 timers and deadlines, pointer stack, i32 depth; slots i32 (integer, boolean, keyword) or f32 (float classes); blocks per §5.3. C+0xF4 is i32 (opcode 302 stores it raw; `0x5e4d0` scales it).
- **Clock comparisons:** wait and hold resume when sample ≥ deadline (unsigned); 2300–2303 sample > t (unsigned, strict); 109 sample − A8 ≤ a (unsigned); state-machine rules 4 and 5 ≤, rule 7 >, rules 8 and 9 strict (all unsigned); `0x63600` fires at sample ≥ timer, timer 0 = disarmed. Deadline additions wrap modulo 2³².
- **Float → integer:** only 1001–1004 (`0x74518` chop, 64-bit FISTP, low dword); `0x5e4d0`'s s2 uses an integer quotient before FILD.
- **f32 write-backs:** parse results, 105's throttle and its difference, 112's v, 215/216's dot, the results of `0x5c768`/`0x5c7e8`/`0x5e4d0`. Unrounded comparisons: rule 3's dot, 213's sum; 112's 1.0 test is against the stored f32. Trigonometry: FCOS only (215/216 at parse time).
- **Draws:** install — `0x63250` (1 when D+0x04 ≠ 0), then the install script's parse and run; update — `0x63600` → `0x632a4` (≤ 1), then on a switch 1 (`rand % count`) and the new script's parse draws, then the executor's (105: 1; 240: 1; 500: 1 when a ≠ 0; 501/502: ≤ 1) and those of the primitives. Parse draws per item: a range 1, plus 1 when byte 0 or 1 of its sign token is `-`; multi-value items per float token in token order; plain numbers, booleans and keywords 0. All modulo operations are signed `IDIV` of a non-negative rand. 43 `rand` call sites exist in `0x5c000`–`0x65e00`: `0x5de18` 1 (selection), `0x60538` 2 and `0x60688` 2 (parser), `0x5f4f4` 2 (105, 240), `0x64d58` 5 (one per list), `0x63250` 1, `0x632a4` 1, `0x5d490` 6 and `0x5d6a8` 1 (noise), `0x5d274` 2 (unreachable), `0x60aa0` 1 (heat seeker, P3-07), `0x610c8` 1, `0x63c00` 3, `0x640d8` 2, `0x62250` 1, `0x62760` 2, `0x62b60` 1, and in unreachable code `0x62c90` 1, `0x62d34` 6, `0x64820` 1 and `0x6532c` 1.
- **Faults reachable from content (original crashes, which Core must reject at creation or fault on):** an integer range with hi − lo + 1 = 0 (#DE); 1001–1004 with a zero rate or speed limit (x87 divide-by-zero, unmasked); R+0x0C = 0 with R+0x50 ≠ 0 or opcode 305 (#DE); a 9th return-stack push (corrupts the depth); a run that never yields (hang); missing text for the boolean, keyword or multi-value classes.

**Execution budget (group-0 closure, static; for D-01):**

| Quantity | Group 0 | Basis | Original limit |
|---|---|---|---|
| Item dispatches per executor run | ≤ 18 (script 6021; next 15, 14) | longest yield-free path from every resume point (item 0, each wait/hold continuation, each 9500 target); every branch forward, no 9001/9002, no cycle | none (a yield-free loop hangs) |
| Dispatches per install call | ≤ 4 + 18 | install script (4 items) + first update run | none |
| Executor runs per object per tick | ≤ 1 (≤ 2 counting an install's install-script run) | `0x5dcd4` gate | — |
| Return-stack depth | 0 | no 9001 in group 0 (groups 1/2 use one pair, script 6063) | 8 slots, unchecked |
| Live execution states | ≤ objects with an installed table program, + 1 during an install | §11.2, §11.3 rule 12 | heap |
| Parse cache | ≤ 22 scripts, 157 items, 28 heap blocks (24 of 0x20, 4 of 0xC bytes) | the closure of TABL 6003 | heap |
| Parse draws per load | ≤ 5 (37 over all 22 scripts) | data survey | — |

The 18-dispatch bound holds for scripts without 9001/9002 and backward branches; a script with calls needs an (item, return stack) analysis. **Data survey of the group-0 closure (counts and verdicts):** no item fails to parse; every keyword matches exactly; ranges: 2 integer (opcode 1000), 2 degree (1001, 1002), 18 float tokens of opcode 100 (15 with a sign marker, each a valid `+`/`-` token); no reversed, degenerate or zero-divisor range, no negative bound, no number with trailing text; float tokens have at most 4 significant digits; opcode 100 uses `x` for 2 absent tokens and has no empty token; the longest token in all of `AISTUFF.NOB` is 11 bytes; only integer items (9999/10000, 37 items) lack text. **Negative plain value (Confirmed, data; P3-08/14):** outside ranges, one reachable script of the group-0 closure (entry 4, in the state-2 list of all three DFPGs) has an opcode-1001 item whose plain (non-range) angle is negative, so its wait (§5.4) gets a negative delay with the real turn rates. The original's deadline is sample + low32(delay), so the wait ends at the next executor run unless the sample is below \|delay\| (then it wraps to a very long wait); the Core treats a negative delay as 0 (approved difference, [P3-02 CR-24 decision 16](../../plan/p3/02/spec.md#cr-24-定稿的决定与已批准的差异d-01)) instead of rejecting the content.
