---
type: format
status: draft
phase: P3
updated: 2026-10-16
related: [U-001, U-008, U-022, U-026, U-027]
---

# Craft and debris parameter tables (CRAFT.NOB, DEBRIS.NOB)

Container format: [IMFAT](./imfat.md). Confidence labels as defined in the IMFAT doc. Structure only: no names, text or values from the original files are reproduced here, and constants of the executable are given by address and type only.

Evidence labels used in the field tables:

- **Confirmed (code):** a native instruction reads or writes the position with the stated width and operation (an x87 `FLD`/`FST` of a float, `FILD` of a signed 32-bit integer, a byte or dword integer compare or arithmetic). The address of at least one such function is given.
- **Likely (data):** no reader was found, and every instance of the structure in all 24 `CINF` entries shows one value pattern: only zero or normal `f32` values for a float, only integers whose bit patterns are not plausible floats for an integer.

Integer types: **i32** is signed, with a sign-dependent operation on the value or on its direct copy as evidence (`FILD`, a signed compare, signed division or an arithmetic shift); **u32** is unsigned by its use (entry ID, bit set, unsigned compare); **int32** is a 32-bit integer whose traced uses do not depend on the sign (equality tests, addition, subtraction, low-half multiplication) or that has no reader. Every baseline int32 value is non-negative and below 2³¹, where the signed and unsigned readings agree; an int32 position is converted only in that range, and a value with bit 31 set is `unsupported-payload` because its sign is undetermined.

The **Handling** column applies the [field handling rules](../../plan/p3/03/spec.md#字段处理规则) of the P3-03 spec:

- **convert**: the stored value is kept as typed.
- **text**: a relocated pointer to a NUL-terminated byte string inside the block (§3.7).
- **index**: a relocated pointer that becomes a position in the named array; **null** where the stored value is zero.
- **position**: overwritten at load with the record's own array index, so the index is carried by the record's position.
- **not converted**: overwritten at load (§3.8, §4.4); the stored value is zero in every baseline instance.
- **consumer transform**: the load code changes the value arithmetically; the stored value is converted and the consumer applies the transform from this document.
- **zero only**: zero in every baseline instance and no type established; a non-zero byte is `unsupported-payload`.

## 1. Entries and loading (Confirmed, EXE)

| File | Entries | Flags |
|---|---|---|
| `CRAFT.NOB` | TABL 4003 (432 bytes, no relocations); 24 CINF, entries 4001–4049 except 4003 (18,447–19,491 bytes, 262–298 relocations) | 0x10 on TABL 4003, 0 on every CINF |
| `DEBRIS.NOB` | TABL 4501 only (8,200 bytes, 85 relocations) | 0x10 |

- **Start-up:** module initialiser `0x2ce90` opens `CRAFT.NOB` and loads TABL 4003 into `0x174b68`; it also stores the block size divided by 24 at `0x174b6c`, which no code reads (whole-image scan for the address). Its shutdown function `0x2ced8` releases the current CINF and TABL 4003. Initialiser `0x246a0` opens `DEBRIS.NOB`, loads TABL 4501 into `0x174b00`, sets the pair count `0x174b04` to the constant 20 and applies the transforms of §4.4.
- **CINF selection:** the mission builder `0x66c00` clamps its group argument to [0, SCCT group count − 1] and its slot argument to [0, the group's slot count − 1] (signed compares), then calls `0x2cf38` (its only caller) with the slot as the row and the group as the column selector. SCCT 3123 has 3 groups of 18 slots ([scenario](./scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)), so the row stays inside TABL 4003. `0x2cf38` does not clamp the row; it takes pair 0 for group 0, pair 1 for group 1 and pair 2 for any other value, releases the previous CINF, loads the pair's CINF by entry ID into `0x174b70`, stores the pair's scale at `0x1864d4` and applies the transforms of §3.8. The selected first mission (group 0, slot 1) uses CINF 4037.
- **Scale reader:** `0x2cf0c` returns the scale as an `f32` (`FLD`), or the `f32` 1.0 while no CINF is loaded; its only caller, the parked-object engagement `0x30150`, multiplies that engagement's summed damage by it ([difficulty readers](./scenario.md#difficulty-readers-p3-01), path 1; [parked engagement](./executable.md#parked-object-engagement-p3-0705)). Projectile, missile and collision damage are not scaled.
- **Record lookup:** `0x2d2d8(kind, i)` returns missile body record i for kind `0x100000` (no bounds check on i). For any other kind it returns the craft record at the kind's bit index (kinds are single bits), or null when that index is not below the header's craft count; so kinds above bit 19, such as the marker kind `0x2000000` of [the allocator paths](./executable.md#two-allocator-paths-native-inputs-and-profile-comparison), get no record. `0x2d3c4(i)` and `0x2d3dc(i)` return gun and missile record i; `0x2d3fc` returns a weapon record's first word.
- **Users of the record:** spawning (`0x67938`, `0x67b98`) and `0x38780` store the craft record in the object's +0x1C; the missile constructor `0x2b00c` stores the missile record's body record there. `0x3060c` initialises an object's state from it, and generic object code (physics, collision, damage) reads it through +0x1C. Shots carry their weapon record (event payload +0x58, then the projectile or missile object's auxiliary +0xF4).
- **Runtime writes:** after load, the only store into a CINF record found is `0x28110`, the function of row 19 of the typed cheat table `0x174ee8`, which writes 0 into the player's craft record +0xA4. TABL 4003 and DEBRIS records are not written after load.
- **Entry IDs:** TABL 4003 holds CINF entry IDs (§2). None of the loader calls of the [data closure](./executable.md#data-loaded-by-the-loop-p3-0110) takes a CINF or DEBRIS field, and no CINF or DEBRIS field is used as an entry ID by the readers listed below.

## 2. TABL 4003 (Confirmed)

18 rows of 3 pairs, 8 bytes per pair; row = clamped SCCT slot, pair = group column (§1).

| Pair offset | Type | Evidence | Handling |
|---|---|---|---|
| +0x00 | u32 entry ID of a CINF in `CRAFT.NOB` | Confirmed (code): `0x2cf38` passes it to the loader `0x6affc` | Verifies the mapped CINF part (spec ID chain); not carried |
| +0x04 | f32 | Confirmed (code): `0x2cf38` copies it to `0x1864d4`; `0x2cf0c` loads it with `FLD` | convert (the selected pair's scale) |

Observed (Confirmed, data): all 54 IDs are CINF entries of `CRAFT.NOB`; 21 of the 24 CINF entries are referenced, none in more than 5 cells; every scale is a positive normal `f32` (4 distinct values). Row 1, pair 0 names CINF 4037.

## 3. CINF

### 3.1 Graph and layout (Confirmed on all 24)

A CINF block is a header and four record arrays, plus the text and sub-arrays the records point to. A walk of this graph covers every byte of all 24 CINF blocks exactly once, accounts for every relocation as one of the pointer fields below, and finds every pointer target at the start of the expected structure. Observed order: header, gun records, gun names, missile records, missile names, craft records, then for each craft in record order its names and sub-arrays, and the body records last. Pointers are found through the relocation table, so the order is not needed to read the block.

Sizes: header 0x20, gun record 48, missile record 104, craft record 236, body record 236, mount 56, box 24, pair 8, mount-list entry 4. Records are packed: the missile records start at an odd block offset in every CINF.

### 3.2 Header (Confirmed)

| Offset | Type | Evidence | Handling |
|---|---|---|---|
| +0x00 | pointer to gun records | Confirmed (code): `0x2cf38`, `0x2d3c4` | the gun array |
| +0x04 | i32 gun count | Confirmed (code): signed compare in `0x2cf38` | array length |
| +0x08 | pointer to missile records | Confirmed (code): `0x2cf38`, `0x2d3dc` | the missile array |
| +0x0C | i32 missile count | Confirmed (code): signed compare in `0x2cf38` | array length |
| +0x10 | pointer to craft records | Confirmed (code): `0x2cf38`, `0x2d2d8` | the craft array |
| +0x14 | i32 craft count | Confirmed (code): signed compares in `0x2cf38`, `0x2d2d8` | array length; 20 is a format rule (one record per kind bit) |
| +0x18 | pointer to missile body records | Confirmed (code): `0x2d2d8` | the body array |
| +0x1C | int32 body count | Likely (data): equals the missile count in all 24; no reader found | array length |

Counts in all 24: 10 guns, 9 missiles, 20 craft, 9 bodies.

### 3.3 Gun record, 48 bytes

| Offset | Type | Evidence | Handling |
|---|---|---|---|
| +0x00 | 32-bit integer | Confirmed (code): `0x2cf38` stores the array index; `0x2d3fc` and the mount pass of `0x2cf38` read it (RENS record index, [weapon records](./executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)) | position |
| +0x04 | pointer to text | Confirmed (code): `0x2dcf0` returns it as the selected weapon's name pointer | text |
| +0x08 | f32 | Confirmed (code): `FMUL` in `0x2cf38`; `0x2e9d4` divides by it | convert |
| +0x0C | f32 | Confirmed (code): written by `0x2cf38` (§3.8); read by `0x30150`, `0x5dfec` | not converted |
| +0x10 | f32 | Confirmed (code): written by `0x2cf38`; float compares in `0x2d894`, `0x2ddbc` | not converted |
| +0x14 | i32 | Confirmed (code): `FILD` in `0x30150`; added to a clock value in `0x2dad0`, `0x2e5e8` | convert |
| +0x18 | i32 | Confirmed (code): signed compare with object +0x30 in `0x30cc8`, subtract in `0x30cec` | convert |
| +0x1C | int32 | Confirmed (code, width): integer add in `0x30150`, subtract in `0x28450` | convert |
| +0x20 | f32 | Likely (data) | convert |
| +0x24 | i32 | Confirmed (code): `FILD` in `0x2cf38`; added to the clock in `0x259b0` | convert |
| +0x28 | u8 | Confirmed (code): byte compares in `0x2cf38`, `0x2d72c`, `0x2d7cc`, `0x2dad0`, `0x2e5e8`, `0x25b0c`, `0x55984` | convert |
| +0x29–+0x2B | — | zero in all 240 | zero only |
| +0x2C | i32 | Confirmed (code): `0x2da58` copies it into the mount state +0x20, which `0x2dad0` compares as a signed integer and decrements | convert |

### 3.4 Missile record, 104 bytes

| Offset | Type | Evidence | Handling |
|---|---|---|---|
| +0x00 | 32-bit integer | Confirmed (code): `0x2cf38` stores the array index; read by `0x2d3fc` (missile visual type, [weapon records](./executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)) | position |
| +0x04 | pointer to text | Confirmed (code): `0x2dcf0` | text |
| +0x08 | f32 | Confirmed (code): written by `0x2cf38` (copy of the body's +0xB8); `FMUL` in `0x2cf38` | not converted |
| +0x0C | f32 | Confirmed (code): written by `0x2cf38`; float compares in `0x30150`, `0x5dfec` | not converted |
| +0x10 | f32 | Confirmed (code): written by `0x2cf38`; float compare in `0x2ddbc` | not converted |
| +0x14 | pointer to a body record | Confirmed (code): `0x2cf38` reads the body's +0xB8 through it; `0x2b00c` stores it in the missile object's +0x1C | index into the body array (equals the record's own index in all 24) |
| +0x18 | u8 | Confirmed (code): byte compares in `0x2ddbc`, `0x2e86c`, `0x5dfec`, `0x2b00c`, `0x2ab00` | convert |
| +0x19–+0x1B | — | zero in all 216 | zero only |
| +0x1C | int32 | Confirmed (code, width): added to a clock value in `0x2e86c` | convert |
| +0x20 | int32 | Confirmed (code, width): dword `!= 0` test in `0x2b00c` | convert |
| +0x24 | u8 | Confirmed (code): byte read by `0x2dd94` | convert |
| +0x25–+0x27 | — | zero in all 216 | zero only |
| +0x28 | f32 | Confirmed (code): `FLD` in `0x2cf38`; float compare in `0x2ddbc` | convert |
| +0x2C | f32 | Confirmed (code): written by `0x2cf38`; float compare in `0x5dfec` | not converted |
| +0x30 | int32 | Confirmed (code, width): added to the clock in `0x2ddbc` | convert |
| +0x34 | i32 | Confirmed (code): signed divide and shift in `0x2ddbc`, `0x2e080`, `0x5dfec` | convert |
| +0x38 | int32 | Confirmed (code, width): added to the clock in `0x2ddbc` | convert |
| +0x3C | int32 | Confirmed (code, width): dword `!= 0` test in `0x2ddbc` | convert |
| +0x40 | f32 | Confirmed (code): float compare in `0x2ddbc`. The non-zero stored values are small integer bit patterns, which read as `f32` denormals | convert |
| +0x44 | i32 | Confirmed (code): `FILD` in `0x2cf38`; `0x2aa40` copies it into the missile's guidance block, whose word `0x2ac10` adds to the clock | convert |
| +0x48 | int32 | Confirmed (code, width): copied by `0x2aa40`; `0x2ac10` adds it to the clock | convert |
| +0x4C | f32 | Confirmed (code): `FLD` in `0x2cf38` | convert |
| +0x50 | f32 | Confirmed (code): written by `0x2cf38`; copied by `0x2aa40` | not converted |
| +0x54 | u32 | Confirmed (code): copied by `0x2aa40`; `0x2ac10` compares the copy with the clock unsigned | convert |
| +0x58 | i32 | Confirmed (code): copied by `0x2aa40`; `0x2ac10` shifts the copy arithmetically and adds it to the clock | convert |
| +0x5C | i32 | Confirmed (code): integer add in `0x30150`; signed compare and `FILD` in `0x2b408` | convert |
| +0x60 | f32 | Confirmed (code): float compare in `0x2b408` | convert |
| +0x64 | f32 | Confirmed (code): float compare in `0x2b408` | convert |

### 3.5 Craft record and missile body record, 236 bytes

Craft records are indexed by kind bit (§1). Missile body records use the same layout (Confirmed, code): `0x2b00c` puts a body record in the object slot that holds a craft record; physics (`0x21dd0`, `0x21fd8`, the integrators `0x222f0` and `0x22600`) and `0x30e0c` read it with the offsets below, and `0x2cf38` copies its +0xB8 as an `f32`. The roles stated below for P3-06 come from its research ([flight motion](./executable.md#flight-motion-controls-speed-parking-and-take-off-p3-06)); they are uses in code, not names from the data.

| Offset | Type | Evidence | Handling |
|---|---|---|---|
| +0x00 | pointer to text | Pointer Confirmed (relocation in all 480 craft records); text Likely (data: §3.7); no reader found | text |
| +0x04 | pointer to text | Confirmed (code): `0x67d44` copies it byte by byte into the object's +0x15C, the name the communications code matches ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)) | text |
| +0x08 | f32 | Confirmed (code): `FLD` in `0x42d80` (display only) | convert |
| +0x0C | f32 | Confirmed (code): float reads in `0x62aa0`, `0x62760`, `0x2ee60`, `0x2f314`, `0x2ffec`, `0x3c040`, `0x3c3b0`. Uses (P3-06/04): the parked Warp jump needs a squared goal distance above its square times the f32 constant `0x170fd4` (`0x2f314`); the random offset length of parked travel toward a target, in AI mode 2 without a valid +0x8C, is drawn from the target's value; the range of parked combat (`0x2ffec`) and of map visibility (`0x2ee60`, 2-D) ([parked update](./executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)) | convert |
| +0x10–+0x53 | collision shape (§3.5.1) | Confirmed (code) | see §3.5.1 |
| +0x54 | i32 | Confirmed (code): signed divide in `0x3060c`, unsigned divide in `0x39664`; signed compare in `0x398ec`; `FILD` in `0x2b814`. Base service (P3-10/05): `0x39664` sets the rate trunc(+0x54 ÷ 240) and each energy step of `0x398ec` adds it, capped at +0x54 ([BS1](./executable.md#bs1-state--confirmed-code), [BS6](./executable.md#bs6-per-frame-service-0x398ec--confirmed-code)) | convert |
| +0x58 | int32 | Confirmed (code, width): integer subtract in `0x3060c`, `0x30b20`, `0x30bc0`. Use (P3-06/03): the energy operand E = +0x58 − (+0x64[level 1] + +0x78[level 2]) of the player's maximum speed ([maximum speed](./executable.md#throttle-maximum-speed-and-speed-matching-p3-0603)); Likely the generator energy | convert |
| +0x5C | i32 | Confirmed (code): integer multiply and divide in `0x3060c`; signed compares in `0x3071c`, `0x30994`; `FILD` in `0x434ce`, `0x44070` | convert |
| +0x60 | i32 | Confirmed (code): signed divide in `0x3071c`, `0x30994` | convert |
| +0x64–+0x70 | int32 × 4 | Confirmed (code, width): `0x3060c`, `0x30b20`, `0x30bc0` index it with an object level 0–3 (object +0x34) and subtract the element. Likely (P3-06/03): the shield allocation per recharge level | convert |
| +0x74 | i32 | Confirmed (code): `0x3060c`; signed compare in `0x3071c` | convert |
| +0x78–+0x84 | int32 × 4 | Confirmed (code, width): as +0x64, with a second object level (object +0x38). Likely (P3-06/03): the gun allocation per recharge level | convert |
| +0x88 | i32 | Confirmed (code): integer multiply in `0x3060c`; signed divide in `0x30e0c`. Use (P3-06/03): the divisor that turns the energy E into the player's energy-limited maximum speed, and a factor of the threshold T below which that branch applies ([maximum speed](./executable.md#throttle-maximum-speed-and-speed-matching-p3-0603)) | convert |
| +0x8C | i32 | Confirmed (code): signed compare in `0x3071c` | convert |
| +0x90 | i32 | Confirmed (code): signed compare in `0x3071c`; zero in all 480 | convert |
| +0x94 | pointer to pairs (§3.6) | Confirmed (code): `0x30d2c` | array; null when +0x98 is 0 |
| +0x98 | i32 pair count | Confirmed (code): signed compare in `0x30d2c` | array length |
| +0x9C | i32 | Confirmed (code): `FILD` in `0x67938`, `0x4f550`; signed compare in `0x398ec`; integer arithmetic in `0x38f20`, `0x39664`, `0x4d50c`, `0x614a8`, `0x61f20`. Base service (P3-10/05): `0x39664` sets the rate trunc(+0x9C ÷ 60) and each hull step of `0x398ec` adds it plus rand % 100, capped at +0x9C ([BS1](./executable.md#bs1-state--confirmed-code), [BS6](./executable.md#bs6-per-frame-service-0x398ec--confirmed-code)) | convert |
| +0xA0 | f32 | Confirmed (code): float compare and multiply in `0x2f314`. Use (P3-06/04): the length cap of the parked Warp jump, applied when it is above a fixed lower bound and below the goal distance ([parked update](./executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)) | convert |
| +0xA4 | i32 | Confirmed (code): integer multiply in `0x2be00`; `!= 0` test and shift left in `0x2bf08`; signed `> 0` test (`TEST`, `JLE`) and integer add with +0xA8 in `0x2ff98`, the parked path's Warp eligibility (P3-06/04, [parked update](./executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)); written only by `0x28110` (§1). Typed int32 until the signed test was found; every baseline value is non-negative, so the converted values do not change | convert |
| +0xA8 | i32 | Confirmed (code): `FILD` in `0x50068`; integer add and shift in `0x2ff98` and shift in `0x2f298`: +0xA8 + +0xA4 seconds after +0xC8 a parked craft may Warp again, and +0xA8 seconds is the length of its Warp transit (P3-06/04, [parked update](./executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)) | convert |
| +0xAC, +0xB0, +0xB4 | f32 each | Confirmed (code): `0x21dd0` multiplies control inputs by them; `0x21fd8`. Uses (P3-06/02): the full-deflection rotation rates about row 1 (+0xAC, pitch), row 3 (+0xB0, roll) and row 2 (+0xB4, yaw), stored in block +0x60, +0x68 and +0x64 ([flight controls](./executable.md#flight-controls-and-rotation-p3-0602)). Unit Likely radians per second: every record converts to whole degrees per second, and their order matches the printed manual's per-craft pitch, roll and yaw figures except one roll value (data and manual) | convert |
| +0xB8 | f32 | Confirmed (code): `FLD` in `0x3060c`, `0x30e0c`, `0x2f314`, `0x50508`; copied into missile +0x08 by `0x2cf38`. Uses (P3-06/01, 03, 04): the content base of the maximum speed, which `0x30e0c` returns except in the player's energy-limited branch, and a factor of that branch's threshold; the reference maximum that the block builders `0x21794`, `0x218e8` and `0x21a3c` copy to block +0x70 for the speed ratio; the speed of parked travel in `0x2f314` ([maximum speed](./executable.md#throttle-maximum-speed-and-speed-matching-p3-0603), [movement stage](./executable.md#movement-stage-and-integration-p3-0601), [parked update](./executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)) | convert |
| +0xBC | f32 | Confirmed (code): `FLD`/`FMUL` in `0x222f0` and `0x22600`: the acceleration toward a higher commanded speed, units/s² (P3-06/01, [movement stage](./executable.md#movement-stage-and-integration-p3-0601)); formerly Likely (data) | convert |
| +0xC0 | f32 | Confirmed (code): `FLD`/`FMUL` in `0x222f0`: the deceleration toward a lower commanded speed, units/s² (P3-06/01, [movement stage](./executable.md#movement-stage-and-integration-p3-0601)); formerly Likely (data) | convert |
| +0xC4 | int32 | Confirmed (code, width): dword `!= 0` tests in `0x222f0`, `0x22600` and `0x21cf8`. Use (P3-06/01): when non-zero, the steady row-2 (yaw) rate, scaled by the speed ratio, is coupled into the row-3 rotation while no timed row-3 rotation runs ([movement stage](./executable.md#movement-stage-and-integration-p3-0601)). Corrected: `0x21cf8` returns that rate in ST0 and the cockpit presentation `0x46fe0` uses it; the earlier "whose result has no effect" was wrong | convert |
| +0xC8 | int32 | Confirmed (code, width): dword `!= 0` tests in `0x222f0` and `0x22600`. Use (P3-06/01): when non-zero, the rotation angle per frame is rate × step; when zero, rate × speed ratio × step ([movement stage](./executable.md#movement-stage-and-integration-p3-0601)). Formerly Likely (data); non-zero in all 480 craft records | convert |
| +0xCC | pointer to mount list 0 (§3.6) | Confirmed (code): `0x2d400`, `0x2e310`, `0x2e3c8`, `0x2e438`, `0x2e4ec` | list of mount indices; null when +0xD0 is 0 |
| +0xD0 | i32 list-0 count | Confirmed (code): signed compares | list length |
| +0xD4 | pointer to mount list 1 | Confirmed (code): `0x2d400`, `0x2e150`, `0x2e1fc`, `0x2e264`, `0x2e4ec` | as +0xCC |
| +0xD8 | i32 list-1 count | Confirmed (code): signed compares | list length |
| +0xDC | pointer to mount list 2 | Confirmed (code): `0x2d400`, `0x2e4ec` | as +0xCC |
| +0xE0 | i32 list-2 count | Confirmed (code): signed compare in `0x2e4ec` | list length |
| +0xE4 | pointer to mounts (§3.6) | Confirmed (code): `0x2cf38`, `0x2d400` | array; null when +0xE8 is 0 |
| +0xE8 | i32 mount count | Confirmed (code): signed compare in `0x2cf38` | array length |

`0x2d400` builds one runtime state (0x50 bytes) per mount and selects the current mount of each list through `0x2e990` when that list's count is non-zero ([weapon records](./executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)). A zero pointer occurs exactly when its count is zero (all 480 records); the code tests the count before the pointer.

**Body records (Confirmed, data):** the 216 body records contain no relocations. Only +0xAC, +0xB0, +0xB4, +0xB8, +0xBC and +0xC8 are non-zero in any of them; every pointer position is zero and every count is zero. +0xC8 is zero in 192 of them, so most missiles turn at the speed ratio × step, and +0xC4 is zero in all (P3-06/01, local count).

**Craft records in motion (Confirmed, data; P3-06/01):** in CINF 4037, +0xC4 is non-zero in 10 of the 20 craft records, including kind bits 0 (the player) and 1 (the wingman), so a yaw input also rolls those craft. In all 24 CINF, the records of kind bits 15–18 have +0xB8, +0xBC and +0xC0 all zero, so they are built with speed 0 and never accelerate; kind bit 14 has +0xBC zero. **Handling:** converted with the craft-record types above; the pointer and count positions must be zero (no target structure exists for a body), otherwise `unsupported-payload`.

#### 3.5.1 Collision shape, 68 bytes

The same layout sits at craft record +0x10 and DEBRIS record +0x18 (Confirmed, code): `0x28450` passes craft record +0x10 and DEBRIS record +0x18 to the same routine `0x28efc`, and the point tests `0x29bf4` (craft) and `0x29d58` (DEBRIS) read the same fields at the two bases. Offsets are relative to the shape; "craft" gives the record offset.

| Shape offset (craft) | Type | Evidence | Craft handling |
|---|---|---|---|
| +0x00 (+0x10) | f32 | Confirmed (code): `FLD` in `0x2cf38`; `0x30150`, `0x5dab0` | convert when the box count is 0; not converted otherwise (§3.8) |
| +0x04 (+0x14) | f32 | Confirmed (code): written by `0x2cf38`; float compares in `0x29bf4`, `0x2adac`, `0x63a4c`, `0x2d37c` | not converted |
| +0x08–+0x1C (+0x18–+0x2C) | f32 × 6 | Confirmed (code): written by `0x2cf38` when boxes exist; `0x2874c` reads the DEBRIS copy | convert when the box count is 0; not converted otherwise |
| +0x20 (+0x30) | pointer to boxes (§3.6) | Confirmed (code): `0x29bf4`, `0x2adac`, `0x2cf38` | array; null when the count is 0 |
| +0x24 (+0x34) | i32 box count | Confirmed (code): signed compares in `0x29bf4`, `0x2adac`, `0x2cf38`; `0x28450` | array length |
| +0x28 (+0x38) | int32 | Confirmed (code, width): dword `== 0` tests in `0x29bf4`, `0x2adac` | convert |
| +0x2C–+0x40 (+0x3C–+0x50) | f32 × 6 | Confirmed (code): float compares in `0x29bf4`, `0x2adac` | convert |

Operation (Confirmed, code): a point within the radius test passes when the box count is zero; otherwise it hits when it lies strictly inside one of the boxes, and when +0x28 is non-zero a point strictly inside the box +0x2C–+0x40 is not tested against the boxes. In all 24 CINF, records whose box count is non-zero store zero at shape +0x00 and +0x08–+0x1C, records without boxes store a non-zero +0x00, and +0x28 is non-zero only in records with boxes, exactly when +0x2C–+0x40 is non-zero.

### 3.6 Sub-structures (Confirmed)

**Mount, 56 bytes** (array at craft +0xE4):

| Offset | Type | Evidence | Handling |
|---|---|---|---|
| +0x00–+0x08 | f32 × 3 | Confirmed (code): `FMUL` in `0x2e9d4`; copied into the shot position by `0x2dad0`, `0x2e5e8`, `0x2e86c` | convert; +0x08 of gun mounts is a consumer transform (§3.8) |
| +0x0C | int32 | Confirmed (code, width): `0x2d400` copies it to the mount state +0x08, which `0x30150` and `0x2e86c` test against zero and decrement | convert; non-zero exactly in the missile mounts (all 2,899 mounts) |
| +0x10 | u8 | Confirmed (code): byte compares in `0x2cf38`, `0x30150`, `0x2dd54`, `0x2dd94`, `0x4f550`; 0 selects a gun record, 1 a missile record | convert; only 0 and 1 occur, any other value is `unsupported-payload` because the target array is undefined |
| +0x11–+0x13 | — | zero in all 2,899 | zero only |
| +0x14 | pointer to a gun record (+0x10 = 0) or missile record (+0x10 = 1) | Confirmed (code): `0x2cf38`, `0x30150`, `0x2dad0`, `0x2e5e8`, `0x2e86c` | index into that array; in all 24 the target array always matches +0x10 |
| +0x18 | pointer to a mount of the same craft, or 0 | Confirmed (code): `0x2d400` maps it to the target mount's runtime state, whose chain `0x2ddbc` follows | index in the craft's mount array, or null |
| +0x1C | pointer to a mount of the same craft, or 0 | Confirmed (code): `0x2d400` | as +0x18 |
| +0x20 | u32 bit set | Confirmed (code): dword bit tests in `0x2d894`, `0x2e9d4`; byte test in `0x2e5e8` | convert |
| +0x24–+0x2C | f32 × 3 | Confirmed (code): float compares and negations in `0x2e9d4` | convert |
| +0x30 | int32 | Confirmed (code, width): dword `== 0` test in `0x2e5e8` | convert |
| +0x34 | int32 | Confirmed (code, width): dword `!= 0` test in `0x2e9d4` | convert |

**Mount-list entry, 4 bytes** (lists at craft +0xCC, +0xD4, +0xDC): a pointer to a mount of the same craft (Confirmed, code: `0x2d400`, `0x2e990`); handling: mount index.

**Box, 24 bytes** (array at shape +0x20, and nested in DEBRIS records): f32 × 3 lower corner, f32 × 3 upper corner (Confirmed, code: strict compares in `0x29bf4`, `0x29d58`, `0x2adac`; `0x2cf38` and `0x246a0` read both corners). Handling: convert; in DEBRIS records the corners are a consumer transform (§4.4).

**Pair, 8 bytes** (array at craft +0x94): i32, then int32 (Confirmed, code; signed compare of the first, multiplication of the second): `0x30d2c` takes the first pair whose first value is at least its argument divided by 1000 (signed division), or else the last pair, and returns the argument times that pair's second value, divided by 1000. Handling: convert.

### 3.7 Text

Gun +0x04, missile +0x04 and craft +0x00 and +0x04 point to byte strings that end with NUL inside the block, and every string is referenced by exactly one pointer (Confirmed on all 24). Code reads three of them as text (gun and missile +0x04 through `0x2dcf0`, craft +0x04 through `0x67d44`); craft +0x00 is text by its form only (Likely). Observed in all 24: lengths 3–26 bytes without the NUL, every byte printable ASCII (0x20–0x7E). The import keeps the bytes as a byte string per the spec's text rule.

### 3.8 Load transforms in `0x2cf38` (Confirmed, code)

Applied each time a CINF is loaded, to the freshly loaded block. Arithmetic runs on the x87 stack (the precision-control setting was not checked) and is rounded to `f32` on each store. The constants are in the executable's data object (§5).

1. **Gun records:** +0x00 ← the record's index; +0x0C ← (`FILD` +0x24) × `f32` constant `0x170fa2` × +0x08; +0x10 ← (+0x0C)².
2. **Missile records:** +0x00 ← index; +0x08 ← the body record's +0xB8 (copy, through +0x14); +0x0C ← (`FILD` +0x44) × `0x170fa2` × +0x08; +0x10 ← (+0x0C)²; +0x2C ← arc cosine of +0x28 (library routine `0x7558a`, which computes π/2 − atan2(x, √(1 − x²))); +0x50 ← (+0x4C)².
3. **Craft records** (not body records): +0x14 ← (+0x10)². For each mount whose +0x10 is 0 and whose gun record's +0x28 is not 2, mount +0x08 is increased by the length (+0x08) of the RENS 10751 record with the gun's index ([effect geometry](./executable.md#effect-geometry-data-p2-0614-research)), first multiplied by the `f64` constant `0x170fa6` for craft records 0 and 1. If the box count +0x34 is non-zero, r is the largest length of any box corner (0 when the count is negative); +0x18–+0x20 ← −r, +0x24–+0x2C ← r, +0x10 ← r, +0x14 ← r².

Classification for the import: the index rewrite only places the index, so it is structural and carried by position. Every other step is arithmetic: the positions it writes are not converted (their stored values are zero in all 24, except the conditional craft bounds, which are zero exactly in the records where they are written), and the mount +0x08 increase is a consumer transform. The mount step reads RENS 10751, which is delivered as `data/projectile-visuals`. Two empty loops follow the mount links +0x18 and +0x1C, and three empty loops count the mount lists; they change nothing.

**Arithmetic (Confirmed, code, P3-07/12):** under the start-up control word (53-bit precision, [H8](./executable.md#h8-numbers-on-these-paths--confirmed-code-unless-marked)), each f32 store rounding once:

- A range is `FILD` of the i32 lifetime, times the `f32` constant `0x170fa2`, times the `f32` speed (gun +0x08, or the missile's +0x08 copied from its body); a square multiplies the stored `f32` value by itself.
- A mount's +0x08 increase loads the `f32` length, multiplies it by `0x170fa6` for records 0 and 1, and adds the mount's `f32` +0x08 (`FADD`) before the store.
- A box corner's length is `FSQRT` of (y² + x²) + z² for the lower corner and (x² + y²) + z² for the upper one. Each root is stored as `f32` and compared, unrounded, with the `f32` maximum, which starts at +0 and is replaced only by a strictly larger root; r is therefore the largest of the `f32` corner lengths.

### 3.9 Zero-only positions and observed values

- The zero byte map of CINF 4037 equals that of all 24 CINF for every structure. Whole 4-byte positions that are zero everywhere: gun +0x00, +0x0C, +0x10; missile +0x00, +0x08–+0x10, +0x2C, +0x50; craft +0x14 and +0x90; and in body records everything except the six positions of §3.5. All of them have a type and handling above. The partial-slot zero ranges that have no type are gun +0x29–+0x2B, missile +0x19–+0x1B and +0x25–+0x27, and mount +0x11–+0x13 (zero only).
- Float positions: no negative zero, NaN or infinity occurs in any typed `f32` position of the 24 CINF or of DEBRIS TABL 4501 (records and boxes); the only denormals are the missile +0x40 values (one record per CINF).
- Every kind bit has a craft record, including kinds whose record has no boxes, mounts or pair list. In CINF 4037, 13 craft records have boxes, 16 have mounts, 14 have a pair list and 2 have the inner box.

| Quantity | CINF 4037 | Maximum over all 24 |
|---|---:|---:|
| Block bytes / relocations | 18,619 / 268 | 19,491 / 298 |
| Guns / missiles / craft / bodies | 10 / 9 / 20 / 9 | same in all |
| Mounts per craft / total | 16 / 115 | 18 / 130 |
| Boxes per craft / total | 32 / 114 | 32 / 114 |
| Mount list 0 / 1 / 2 entries per craft | 3 / 2 / 1 | 3 / 5 / 1 |
| Pairs per craft (every list) / craft with a pair list | 3 / 14 | 3 / 14 |
| Strings / longest gun, missile, craft +0x00, craft +0x04 name (bytes) | 59 / 18, 15, 26, 7 | same maxima |

### 3.10 Field roles in the combat rules (P3-07)

What the combat code does with each value (Confirmed, code, from native instructions, P3-07/01–06). Names such as "shield" or "hull" follow those uses and the HUD gauges; they are Likely only where marked. The rules themselves are in the linked [executable](./executable.md#combat-rules-p3-07) sections. P3-06 records the movement roles (for example of craft +0x88, +0xAC–+0xB8).

| Record | Offset | Role | Where |
|---|---|---|---|
| Gun | +0x08 | Projectile speed along the shot's forward row; the aim's time-of-flight divisor | [W7](./executable.md#w7-aim-solution-0x2e9d4-and-hemisphere-test-0x2d894--confirmed-code), [W11](./executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code) |
| Gun | +0x0C, +0x10 | Range (returned by `0x2dd54`; strict range test of the parked engagement) and range² (≤ in `0x2d894`); no in-flight reader | [W7](./executable.md#w7-aim-solution-0x2e9d4-and-hemisphere-test-0x2d894--confirmed-code), [E3](./executable.md#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code), [H2](./executable.md#h2-gun-projectiles--confirmed-code) |
| Gun | +0x14 | Cooldown in clock units (signed compare, fires at equality); also the multiplier of the parked shot count | [W6](./executable.md#w6-gun-shot-0x2e5e8handle-clock-state--confirmed-code), [W9](./executable.md#w9-automatic-mounts--confirmed-code), [E3](./executable.md#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code) |
| Gun | +0x18 | Charge per shot, player only | [W6](./executable.md#w6-gun-shot-0x2e5e8handle-clock-state--confirmed-code) |
| Gun | +0x1C | Damage per hit (unscaled); fragment durability decrement; damage per parked shot | [H3](./executable.md#h3-projectile-hit-test-0x28450--confirmed-code), [H4](./executable.md#h4-impact-ricochet-attribution-and-fragment-kills--confirmed-code), [E3](./executable.md#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code) |
| Gun | +0x24 | Projectile lifetime from its first update | [H2](./executable.md#h2-gun-projectiles--confirmed-code) |
| Gun | +0x28 | Firing type: 0 fixed, 1 aimed, 2 automatic; non-zero: the projectile takes the launch message's rows | [W6](./executable.md#w6-gun-shot-0x2e5e8handle-clock-state--confirmed-code), [W9](./executable.md#w9-automatic-mounts--confirmed-code), [W11](./executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code) |
| Gun | +0x2C | Automatic-mount burst length | [W9](./executable.md#w9-automatic-mounts--confirmed-code) |
| Missile | +0x0C, +0x10 | Range (parked missile choice, strict) and lock range² (strict) | [E3](./executable.md#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code), [W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code) |
| Missile | +0x18 | Guidance: 0 unguided; non-zero requires a target at launch and runs the lock; with launch byte ≥ 2, 1 selects the heat-seeking built-in program and any other value the other homing program | [W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code), [H5](./executable.md#h5-missiles--confirmed-code-unless-marked) |
| Missile | +0x1C | Launch cooldown (signed, fires at equality) | [W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code) |
| Missile | +0x20 | Non-zero: random launch rotation | [W11](./executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code) |
| Missile | +0x28, +0x2C | Cosine of the lock half-angle (strict); its arc cosine (load) is read only by AI code. Neither is read in flight | [W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code), [H5](./executable.md#h5-missiles--confirmed-code-unless-marked) |
| Missile | +0x30–+0x40 | Lock delay to level 1, stage duration (also the HUD progress divisor), grace interval, aspect-test switch and threshold | [W8](./executable.md#w8-missile-launch-0x2e86c-and-the-missile-lock-0x2ddbc--confirmed-code) |
| Missile | +0x44–+0x58 | Lifetime, arming delay, fuse radius and its square, proximity detonation delay, fuse check interval | [H5](./executable.md#h5-missiles--confirmed-code-unless-marked) |
| Missile | +0x5C–+0x64 | Blast damage (also the damage of a parked missile), full-damage radius, zero-damage radius | [H5](./executable.md#h5-missiles--confirmed-code-unless-marked), [E3](./executable.md#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code) |
| Craft | +0x08 | Shown × 0.001 on the right display (meaning Unconfirmed) | [T7](./executable.md#t7-right-target-display-confirmed-code) |
| Craft | +0x0C | Engagement radius of the multi-target parked engagement (squared, strict) | [E2](./executable.md#e2-multi-target-engagement-0x2ffecobject-elapsed--confirmed-code) |
| Craft | +0x10 (shape +0x00) | Radius subtracted from the parked engagement's L1 distance; not read by the hit or collision tests | [E3](./executable.md#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code), [H3](./executable.md#h3-projectile-hit-test-0x28450--confirmed-code) |
| Craft | +0x14 (shape +0x04) | r²: collision point tests (non-strict), missile contact fuse (strict), forward-target lateral limit | [H7](./executable.md#h7-point-tests--confirmed-code), [H5](./executable.md#h5-missiles--confirmed-code-unless-marked), [T2](./executable.md#t2-selection-helpers-confirmed-code) |
| Craft | +0x18–+0x2C (shape +0x08–+0x1C) | Unrotated world-axis box of the projectile segment test | [H3](./executable.md#h3-projectile-hit-test-0x28450--confirmed-code) |
| Craft | +0x54, +0x5C, +0x74, +0x9C | Capacities of energy (meaning Likely), shield, charge and hull: initial values with the record percentages, recharge limits, full repair, HUD full scales | [D13](./executable.md#d13-resource-initialisation-0x3060ceax-h-edx-craft-ebx-a-ecx-b-stack-c--confirmed-code), [D14](./executable.md#d14-energy-updates--confirmed-code), [D16](./executable.md#d16-hud-full-scales--confirmed-code-for-operands-drawing-p3-13) |
| Craft | +0x58, +0x64–+0x70, +0x78–+0x84 | Power budget; shield and charge recharge rates per level (energy per 64 clock units), which are also each level's power draw | [D10](./executable.md#d10-energy-levels-keys-ssgg--confirmed-code), [D14](./executable.md#d14-energy-updates--confirmed-code) |
| Craft | +0x60 | Energy cost per shield point × 1000 | [D14](./executable.md#d14-energy-updates--confirmed-code) |
| Craft | +0x88, +0x8C, +0x90 | Energy per speed unit × 1000; commanded-speed thresholds for double and triple speed cost (+0x90 is 0 in every record, so triple cost is unreachable) | [D14](./executable.md#d14-energy-updates--confirmed-code) |
| Mount | +0x00–+0x08 | Spawn offset of shots; aim origin when +0x34 ≠ 0 | [W7](./executable.md#w7-aim-solution-0x2e9d4-and-hemisphere-test-0x2d894--confirmed-code), [W11](./executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code) |
| Mount | +0x0C | Initial ammunition; the parked engagement needs it non-zero for missile mounts and decrements the chosen one | [W1](./executable.md#w1-per-object-weapon-block-and-mount-states--confirmed-code), [E3](./executable.md#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code) |
| Mount | +0x10 | 0 gun, 1 missile (other values contribute nothing to the parked engagement) | [W5](./executable.md#w5-trigger-routine-0x2d578handle-channel-value--confirmed-code), [E3](./executable.md#e3-engagement-rule-0x30150self-elapsed-divisor--confirmed-code) |
| Mount | +0x18, +0x1C | Fire-together link and alternate link | [W5](./executable.md#w5-trigger-routine-0x2d578handle-channel-value--confirmed-code) |
| Mount | +0x20–+0x2C | Arc bits and cone thresholds | [W7](./executable.md#w7-aim-solution-0x2e9d4-and-hemisphere-test-0x2d894--confirmed-code) |
| Mount | +0x30, +0x34 | Unaimed fallback even with an alternate; aim origin includes the mount offset | [W6](./executable.md#w6-gun-shot-0x2e5e8handle-clock-state--confirmed-code), [W7](./executable.md#w7-aim-solution-0x2e9d4-and-hemisphere-test-0x2d894--confirmed-code) |
| Craft | +0xCC, +0xD4, +0xDC | Mount lists 0 (main weapons, channel 0), 1 (missiles, channel 1) and 2 (channel 2, AI only) | [W2](./executable.md#w2-the-three-mount-lists--confirmed-code-slice-contents-confirmed-data) |
| DEBRIS | +0x00–+0x08 | Negated weights of the source's rows for the fragment's offset and launch direction | [X6](./executable.md#x6-discriminator-3-fragments-mode-3--confirmed-code) |
| DEBRIS | +0x5C | ≠ 0: durability 1200, a hitting projectile is always removed, half contact damage within the per-frame limit; = 0: durability 4000, a hit ricochets with probability 1/4, full bounce damage. 19 of the 67 records are non-zero after the load transform | [X6](./executable.md#x6-discriminator-3-fragments-mode-3--confirmed-code), [H3](./executable.md#h3-projectile-hit-test-0x28450--confirmed-code), [H6](./executable.md#h6-collision-passes--confirmed-code-collision-helper-spot-checked) |

**Runtime (Confirmed, P3-07/26, selected mission at fixed 40000 only):** the formal runs found these roles consumed
as listed for the records they exercised: the player's gun records 0 and 1 (+0x14 cooldown, +0x18 charge per shot,
+0x24 lifetime); the player's missile records 0, 1 and 3 (+0x44 lifetime, +0x48 arming delay, +0x58 fuse check
interval, halved on the unguided path in this configuration), missile 3's +0x30 and +0x34 (lock stages) and +0x5C
(the full blast damage at a contact); the player's craft record +0x74 and +0x78–+0x84 (charge capacity and refill
per level, at the charge-limited updates) and +0x88 and +0x8C (speed cost at both speed ranges); and a start enemy's
gun record (+0x14 cooldown, +0x1C damage per hit on the player). The shield recharge terms (craft +0x60–+0x70; no
judged update had the shield below its capacity), missile 3's grace interval (+0x38), proximity radius and delay
(+0x4C, +0x54) and falloff radii (missile +0x60, +0x64), the wingman's
and the enemies' missile and resource fields, and the records the runs did not exercise (bases, kind 0x100, other
missions) remain code-only. Statistics are in [B-009](../behavior/B-009-combat-rules.md#测量结果) and the
[runtime check](./executable.md#runtime-check-p3-0726).

## 4. DEBRIS TABL 4501

### 4.1 Loading and lookup (Confirmed, code)

`0x246a0` loads the block at start-up (§1). `0x249dc(kind, part)` returns `part × 0x60` plus the record pointer of the pair at the kind's bit index; for the kinds 1 and 2 it first subtracts 3 from `part` and returns null when the result is negative. It does not check `part` against the pair's count; in the shipped data no lookup goes past a pair's count or into a zero-count pair, and the only null results are part 0 of kinds 1 and 2 ([fragments](./executable.md#destruction-explosions-and-fragments-p3-0706)). Its only caller is the mode-3 fragment constructor `0x25124`, which stores the record in the fragment object's +0x1C ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)).

### 4.2 Layout (Confirmed)

- **Header, 160 bytes:** 20 pairs {pointer to records, i32 count}, one per kind bit. The counts are compared as signed integers in `0x246a0`. A pair with count 0 has a zero, unrelocated pointer.
- **Records:** 96 bytes, an array per pair.
- **Nested boxes:** each record points to an array of 24-byte boxes (§3.6).

The walk covers every byte of the block exactly once and accounts for all 85 relocations (18 pair pointers and 67 record pointers). Observed: 67 records; 18 kinds have records (2 to 8 each) and kinds 13 and 14 have none; every record has exactly one box.

### 4.3 Record, 96 bytes

| Offset | Type | Evidence | Handling |
|---|---|---|---|
| +0x00–+0x08 | f32 × 3 | Confirmed (code): `FLD`/`FCHS`/`FSTP` in `0x246a0`; `0x25124` uses them as the weights of three direction vectors | convert; consumer transform (negated at load, §4.4) |
| +0x0C–+0x14 | f32 × 3 | Confirmed (code): written by `0x246a0` | not converted |
| +0x18–+0x5B | collision shape (§3.5.1) | Confirmed (code) | see below |
| +0x18, +0x1C, +0x20–+0x34 | shape radius, its square, bounds | Confirmed (code): written by `0x246a0`; `0x29d58` reads +0x1C, `0x2874c` the bounds | not converted |
| +0x38 | pointer to boxes | Confirmed (code): `0x246a0`, `0x29d58` | array |
| +0x3C | i32 box count | Confirmed (code): signed compares in `0x246a0`, `0x29d58`; `0x28450` | array length |
| +0x40 | int32 | Confirmed (code, width): dword `== 0` test in `0x29d58` | convert |
| +0x44–+0x58 | f32 × 6 | Confirmed (code): float compares in `0x29d58` | convert |
| +0x5C | 32-bit integer | Confirmed (code): `0x246a0` writes 0 or 1; `0x25124`, `0x28450` and `0x29670` test it against zero | not converted |

Observed: +0x0C–+0x34, +0x40–+0x58 and +0x5C are zero in all 67 records; +0x3C is non-zero in all.

### 4.4 Load transforms in `0x246a0` (Confirmed, code)

For every record of every pair, in this order:

1. +0x0C–+0x14 ← +0x00–+0x08, then normalised in place by `0x56aa8` (divided by its length unless the length is zero).
2. +0x00–+0x08 ← their negation, in place.
3. For each box, every component of the lower corner is increased by the `f64` constant `0x170c27` and every component of the upper corner by the `f64` constant `0x170c2f`, each addition done twice with an `f32` store in between.
4. r ← the largest length of any adjusted box corner; +0x20–+0x28 ← −r, +0x2C–+0x34 ← r, +0x18 ← r, +0x1C ← r², and +0x5C ← 1 if r + `0x170c27` < the `f64` constant `0x170c37`, otherwise 0.

The record's stored first vector is therefore negated, and the copy at +0x0C is normalised but not negated.

**Arithmetic (Confirmed, code, P3-07/12):** under the start-up control word (53-bit precision, [H8](./executable.md#h8-numbers-on-these-paths--confirmed-code-unless-marked)):

- `0x56aa8` stores the length √((y² + x²) + z²) as `f32`; when its bits other than the sign are zero the vector is left as it is; otherwise each component becomes the `f32` of the component times (1 ÷ the stored length), the quotient kept in double.
- Step 3 adds the constant to the `f32` component in double and stores `f32`, twice per component.
- Step 4 takes the corner lengths and their maximum as in §3.8, and compares r + `0x170c27` with `0x170c37` in double. Classification for the import: steps 1 and 4 write positions that are not converted; steps 2 and 3 are arithmetic on converted positions, so they are consumer transforms. None of them is structural. The +0x5C that [difficulty path 6](./scenario.md#difficulty-readers-p3-01) tests is this computed value.

## 5. Executable constants used by the transforms

Code-side constants of the data object, by address and type (values not recorded): `f32` at `0x170fa2`; `f64` at `0x170fa6`, `0x170c27`, `0x170c2f` and `0x170c37`. Their use is §3.8 and §4.4. Like the other code-side constants of the closure ([P3-01 decision table](../../plan/p3/01/subtasks/10-data-closure.md#决定表), row 32), they are code rules, not imported data.

## 6. Open questions

- Field meanings are Unconfirmed beyond the uses stated above and in §3.10 (U-001). Gun +0x20 has no traced reader; its type rests on the data. P3-06/01 found the readers of craft +0xBC, +0xC0 and +0xC8.
- The unit of +0xAC–+0xB4 rests on the arithmetic, the data and the printed manual. The roles of +0x58 and +0x64–+0x84 in the energy rules are in §3.10 (P3-07/04, Confirmed, code); their names (power budget, recharge rates) remain Likely.
- +0xA4 is now typed i32 (above); the project reader `craft-info.ts` still reads it as int32, which rejects a value with bit 31 set. No baseline value is affected; aligning the reader is P3-03's.
- Body record positions other than the six non-zero ones are typed only through the shared layout.

Evidence for the arithmetic paragraphs of §3.8 and §4.4 (P3-07/12): ignored `local/research/p3-07/rule-data/` (`ghidra_scripts/RuleDataProbe.java`, `probe.sh`, outputs `out/p1`–`out/p5`), native instructions of `0x2cf38`, `0x246a0` and `0x56aa8` read `-noanalysis -readOnly` on a private copy of the Ghidra project; the constants' types were read from the local executable.

Evidence: ignored `local/research/p3-03/craft/`: `nob.ts`, `walk-cinf.ts`, `walk-debris.ts`, `tabl4003.ts`, `survey.ts`, `survey2.ts`, `zeros.ts`, `checks.ts`, `maxima.ts`, `floats.ts`, `order.ts` with `out/*.json` and `out/survey.txt` (structure, classes and counts only); the Ghidra scripts `ghidra_scripts/CraftProbe.java` and `CraftFlow.java` run through `probe.sh` with outputs `out/p1`–`out/p18` and `out/flow12b`, queried by `flowq.ts`, `q-roots.ts`, `q-aux.ts` and `q-mount.ts`. Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and calling conventions set in memory were discarded. Widths and operations were read from native instructions or from the decompiler's p-code operations on them.
