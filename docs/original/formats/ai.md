---
type: format
status: draft
phase: P3
updated: 2026-10-09
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
- **Selection:** `0x5de18(object, flag, table, count, &partial)` starts at a random record and wraps around. A record is a partial match when record +0x04 is not 1 (or the flag is non-zero), the object's kind (+0x04) shares a bit with record +0x08, and runtime +0xDC ≤ record +0x0C; it is a full match when also record +0x10 ≤ \|runtime +0xE0\| (runtime +0xDC/+0xE0 are the [SCEN record](./scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) +0x70/+0x74). It returns the first full match and stores the last partial match seen. `0x5dbc8` takes, in order: a full match in the group's table, else a partial one (both through `0x64b1c`, group from `0x694f0`), else a full and then a partial match in the [built-in table](#33-built-in-program-table-0x1762f8).
- **Installation:** `0x5dc0c(object, controller, record)` clears the 0x16C-byte controller and keeps the record at controller +0xF8; the handler at record +0x18 is then called with mode 0 (install), 1 (update, from `0x5dcd4` when the controller's deadline +0xF0 has passed) and 2 (remove, `0x5ddd4`). Every loaded table record's handler is the program interpreter `0x64cb8`. For an object whose runtime byte +2 is zero, all three call `0x62250` instead of the record's handler.

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

## 3. AI program tables

### 3.1 The 0x54-byte program record

The same layout is used by TABL 6003/6007/6005 and the built-in table. "Table" and "built-in" below distinguish the two where they differ.

| Offset | Type | Reader and use | Status |
|---|---|---|---|
| +0x00 | pointer to a NUL-terminated name | Table: in-block pointer; built-in: LE fixup to object 4. `0x649c8` stops at the first record whose word here is zero. No reader of the text was found | Pointer Confirmed; text Likely (every name is NUL-terminated printable ASCII; no reader) |
| +0x04 | 32-bit integer | `0x5de18`: equality with 1 only (skip unless the caller allows) | Confirmed (sign not observable) |
| +0x08 | u32 | Kind mask; `0x5de18` tests it against the object's kind | Confirmed |
| +0x0C | i32 | `0x5de18`: signed compare with runtime +0xDC; `0x5e4d0`: signed divisor | Confirmed |
| +0x10 | i32 | `0x5de18`: signed compare with \|runtime +0xE0\|; `0x5e4d0`: subtracted and converted with FILD; tested for zero | Confirmed |
| +0x14 | i32 | `0x5dc0c` copies it to controller +0xF4, which `0x64cb8` adds to the clock as the next update deadline and `0x5e4d0` scales with signed division | Confirmed |
| +0x18 | code pointer | Handler called with (mode, controller). Table: stored value zero, overwritten with `0x64cb8` by `0x649c8`; built-in: LE fixup to object 2 | Confirmed |
| +0x1C | entry ID | Table: a DFPG in every record (loaded by `0x649c8`); built-in: zero, not read | Confirmed |
| +0x20 | pointer | Table: stored value zero, overwritten by `0x649c8` with the address of the +0x1C entry and read through by `0x64b54`/`0x64d58`; built-in: zero, not read | Confirmed |
| +0x24, +0x28 | f32 | `0x5dc0c`: scaled by constants into controller limits; `0x5e4d0` also reads +0x28 | Confirmed |
| +0x2C | f32 | `0x5dc0c`: negated and copied into controller limits | Confirmed |
| +0x30 | f32 | Copied by `0x5dc0c` to controller +0x118, which `0x5cd1c` compares with a dot product | Confirmed |
| +0x34 | 32-bit flag | `0x64b54`: tested for non-zero (then calls `0x5c768`) | Confirmed (sign not observable) |
| +0x38 | 32-bit flag | `0x64b54`: tested for non-zero (`0x5e1b0`); passed to `0x5e4d0` and tested there | Confirmed (sign not observable) |
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
- **LE fixups (Confirmed by decoding the fixup records):** exactly 20 fixups patch the 0x348 bytes of the table, all of source type 7 (32-bit offset) to an internal target: +0x00 of every record to object 4 (16-bit target offset) and +0x18 of every record to object 2 (32-bit target offset). The count word is not patched. The 10 handler fixups name 8 distinct targets in object 2. The file bytes at each fixup site equal the target offset, but the identity is defined by the fixup record (object number and target offset). The product region reader currently rejects regions that a fixup patches ([executable §1](./executable.md#1-format-and-toolchain-confirmed)).
- **Names:** the 10 name targets lie in object 4 between `0x1722b4` and `0x17231f`; each is NUL-terminated printable ASCII of 4–16 bytes, and no fixup patches them.
- In all 10 records +0x04, +0x1C, +0x20 and +0x34 … +0x50 are zero.
- **Users (Confirmed):** the fallback of `0x5dbc8`; `0x27ee4` installs record 0 on the player's controller; `0x2ab94` installs record 1 or 2.

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

**Lists and states (Confirmed, `0x64d58`):** state 1 uses the list at +0x3C/+0x40, state 2 +0x44/+0x48, state 3 +0x4C/+0x50, state 5 +0x54/+0x58, state 4 +0x5C/+0x60 and state 6 +0x64/+0x68. What the states mean is P3-08's.

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

**Argument classes (Confirmed, branch structure of `0x5eb64`).** Opcodes outside this table make the parse fail.

| Opcodes | Argument |
|---|---|
| 106, 107, 110, 501, 502, 9000–9002, 9500 | None (text not read) |
| 109, 210, 211, 213, 240, 302, 400–402, 404, 500, 1000, 1100, 2000–2003, 2100–2103, 2200–2203, 9999, 10000 | Integer (`0x60538`) |
| 104, 108, 112, 1004 | Float (`0x60688`) |
| 101–103, 1001–1003 | Float multiplied by two constants at parse time |
| 215, 216 | Float multiplied by the same constants, stored as its cosine |
| 200–205, 212, 220–222, 232, 303, 1101, 1102, 2300–2303 | Boolean (`0x60810`: first letter of yes/true or no/false, either case) |
| 230, 231 / 300 / 301 / 403 | Keyword looked up in the code-side table `0x5ea40` / `0x5ea60` / `0x5ea98` / `0x5eac8` (pairs {name pointer, value}) |
| 100 | Four optional floats |
| 105 / 111 | Two / three floats |
| 304 / 305 | Two floats and one / two booleans |

**Tokens (Confirmed, `0x60924`, `0x60538`, `0x60688`):** multi-value arguments are split at the delimiter set at `0x172428`, at most 32 bytes per token; a token starting with the letter x (either case) marks an absent optional float. A number written as a bracketed range is drawn at parse time with `rand()`, and a sign marker in the range may negate it at random. The keyword parser `0x60894` trims trailing spaces from the text in place before looking it up. All parsing happens when `0x5e940` loads a script whose items are not in use, not at start-up.

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

Across all of `AISTUFF.NOB` the script maxima are the same, a DFPG list holds at most 1, 6, 1, 2, 2, 5 IDs, and the tables of groups 1 and 2 have 6 and 5 records.

## 9. Evidence and coverage

- **Code (Confirmed):** native instructions and decompilation, read-only. The AI code `0x5c000`–`0x65e00` was decompiled as a whole (176 functions, including those reached only through pointers or found in gaps), with targeted disassembly of the loader, the filter, the install and state-machine paths, the parser and every AICO access. Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and calling conventions set in memory were discarded.
- **Data (Confirmed):** an independent local IMFAT reader surveyed all 45 `AISTUFF.NOB` entries (layouts, relocation sets, value classes per field, text coverage, branch targets, closures), and a local LE fixup decoder covered the built-in table and its name strings. The survey outputs hold entry IDs, offsets, sizes, counts and value classes; the raw word dumps used while reading the code stay private in the same ignored directory.
- **Search limits:** readers of the program record were sought through the controller's +0xF8 in the AI code and by a raw scan of the code object for 32-bit loads from offset 0xF8; readers of AICO through all 16 references to `0x1b41a0`. Accesses through pointers copied outside these paths are not excluded. No baseline run was made.
- **Local evidence:** ignored `local/research/p3-03/ai/` (`probe.sh`, `ghidra_scripts/AiProbe.java`, `ghidra_scripts/AiRegion.java`, `dump.ts`, `closure.ts`, `programs.ts`, `dfpg.ts`, `scripts.ts`, `opclass.ts`, `stats.ts`, `le-fixups.ts`, `rawscan.ts`, outputs in `out/`).
