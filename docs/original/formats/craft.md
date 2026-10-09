---
type: format
status: draft
phase: P3
updated: 2026-10-09
related: [U-001, U-008, U-026, U-027]
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
- **Scale reader:** `0x2cf0c` returns the scale as an `f32` (`FLD`), or the `f32` 1.0 while no CINF is loaded; its only caller `0x30150` multiplies the summed weapon-hit damage by it ([difficulty readers](./scenario.md#difficulty-readers-p3-01), path 1).
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
| +0x18 | int32 | Likely (data) | convert |
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

Craft records are indexed by kind bit (§1). Missile body records use the same layout (Confirmed, code): `0x2b00c` puts a body record in the object slot that holds a craft record; physics (`0x21dd0`, `0x21fd8`) and `0x30e0c` read it with the offsets below, and `0x2cf38` copies its +0xB8 as an `f32`.

| Offset | Type | Evidence | Handling |
|---|---|---|---|
| +0x00 | pointer to text | Pointer Confirmed (relocation in all 480 craft records); text Likely (data: §3.7); no reader found | text |
| +0x04 | pointer to text | Confirmed (code): `0x67d44` copies it byte by byte into the object's +0x15C, the name the communications code matches ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)) | text |
| +0x08 | f32 | Likely (data) | convert |
| +0x0C | f32 | Confirmed (code): float reads in `0x62aa0`, `0x62760`, `0x2ee60`, `0x2f314`, `0x2ffec`, `0x3c040`, `0x3c3b0` | convert |
| +0x10–+0x53 | collision shape (§3.5.1) | Confirmed (code) | see §3.5.1 |
| +0x54 | i32 | Confirmed (code): signed divide in `0x3060c`, unsigned divide in `0x39664`; signed compare in `0x398ec`; `FILD` in `0x2b814` | convert |
| +0x58 | int32 | Confirmed (code, width): integer subtract in `0x3060c`, `0x30b20`, `0x30bc0` | convert |
| +0x5C | i32 | Confirmed (code): integer multiply and divide in `0x3060c`; signed compares in `0x3071c`, `0x30994`; `FILD` in `0x434ce`, `0x44070` | convert |
| +0x60 | i32 | Confirmed (code): signed divide in `0x3071c`, `0x30994` | convert |
| +0x64–+0x70 | int32 × 4 | Confirmed (code, width): `0x3060c`, `0x30b20`, `0x30bc0` index it with an object level 0–3 and subtract the element | convert |
| +0x74 | i32 | Confirmed (code): `0x3060c`; signed compare in `0x3071c` | convert |
| +0x78–+0x84 | int32 × 4 | Confirmed (code, width): as +0x64, with a second object level | convert |
| +0x88 | i32 | Confirmed (code): integer multiply in `0x3060c`; signed divide in `0x30e0c` | convert |
| +0x8C | i32 | Confirmed (code): signed compare in `0x3071c` | convert |
| +0x90 | i32 | Confirmed (code): signed compare in `0x3071c`; zero in all 480 | convert |
| +0x94 | pointer to pairs (§3.6) | Confirmed (code): `0x30d2c` | array; null when +0x98 is 0 |
| +0x98 | i32 pair count | Confirmed (code): signed compare in `0x30d2c` | array length |
| +0x9C | i32 | Confirmed (code): `FILD` in `0x67938`, `0x4f550`; signed compare in `0x398ec`; integer arithmetic in `0x38f20`, `0x39664`, `0x4d50c`, `0x614a8`, `0x61f20` | convert |
| +0xA0 | f32 | Confirmed (code): float compare and multiply in `0x2f314` | convert |
| +0xA4 | int32 | Confirmed (code, width): integer multiply in `0x2be00`; `!= 0` test and shift left in `0x2bf08`; written only by `0x28110` (§1) | convert |
| +0xA8 | i32 | Confirmed (code): `FILD` in `0x50068` | convert |
| +0xAC, +0xB0, +0xB4 | f32 each | Confirmed (code): `0x21dd0` multiplies control inputs by them; `0x21fd8` | convert |
| +0xB8 | f32 | Confirmed (code): `FLD` in `0x3060c`, `0x30e0c`, `0x2f314`, `0x50508`; copied into missile +0x08 by `0x2cf38` | convert |
| +0xBC | f32 | Likely (data) | convert |
| +0xC0 | f32 | Likely (data) | convert |
| +0xC4 | int32 | Confirmed (code, width): dword `!= 0` test in `0x21cf8`, whose result has no effect | convert |
| +0xC8 | int32 | Likely (data): the same small value in all 480 craft records | convert |
| +0xCC | pointer to mount list 0 (§3.6) | Confirmed (code): `0x2d400`, `0x2e310`, `0x2e3c8`, `0x2e438`, `0x2e4ec` | list of mount indices; null when +0xD0 is 0 |
| +0xD0 | i32 list-0 count | Confirmed (code): signed compares | list length |
| +0xD4 | pointer to mount list 1 | Confirmed (code): `0x2d400`, `0x2e150`, `0x2e1fc`, `0x2e264`, `0x2e4ec` | as +0xCC |
| +0xD8 | i32 list-1 count | Confirmed (code): signed compares | list length |
| +0xDC | pointer to mount list 2 | Confirmed (code): `0x2d400`, `0x2e4ec` | as +0xCC |
| +0xE0 | i32 list-2 count | Confirmed (code): signed compare in `0x2e4ec` | list length |
| +0xE4 | pointer to mounts (§3.6) | Confirmed (code): `0x2cf38`, `0x2d400` | array; null when +0xE8 is 0 |
| +0xE8 | i32 mount count | Confirmed (code): signed compare in `0x2cf38` | array length |

`0x2d400` builds one runtime state (0x50 bytes) per mount and selects the current mount of each list through `0x2e990` when that list's count is non-zero ([weapon records](./executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)). A zero pointer occurs exactly when its count is zero (all 480 records); the code tests the count before the pointer.

**Body records (Confirmed, data):** the 216 body records contain no relocations. Only +0xAC, +0xB0, +0xB4, +0xB8, +0xBC and +0xC8 are non-zero in any of them; every pointer position is zero and every count is zero. **Handling:** converted with the craft-record types above; the pointer and count positions must be zero (no target structure exists for a body), otherwise `unsupported-payload`.

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

## 4. DEBRIS TABL 4501

### 4.1 Loading and lookup (Confirmed, code)

`0x246a0` loads the block at start-up (§1). `0x249dc(kind, part)` returns `part × 0x60` plus the record pointer of the pair at the kind's bit index; for the kinds 1 and 2 it first subtracts 3 from `part` and returns null when the result is negative. It does not check `part` against the pair's count. Its only caller is the mode-3 fragment constructor `0x25124`, which stores the record in the fragment object's +0x1C ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)).

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

The record's stored first vector is therefore negated, and the copy at +0x0C is normalised but not negated. Classification for the import: steps 1 and 4 write positions that are not converted; steps 2 and 3 are arithmetic on converted positions, so they are consumer transforms. None of them is structural. The +0x5C that [difficulty path 6](./scenario.md#difficulty-readers-p3-01) tests is this computed value.

## 5. Executable constants used by the transforms

Code-side constants of the data object, by address and type (values not recorded): `f32` at `0x170fa2`; `f64` at `0x170fa6`, `0x170c27`, `0x170c2f` and `0x170c37`. Their use is §3.8 and §4.4. Like the other code-side constants of the closure ([P3-01 decision table](../../plan/p3/01/subtasks/10-data-closure.md#决定表), row 32), they are code rules, not imported data.

## 6. Open questions

- Field meanings are Unconfirmed beyond the uses stated above (U-001). Craft +0x08, +0xBC, +0xC0, +0xC8 and gun +0x18, +0x20 have no traced reader; their types rest on the data.
- Body record positions other than the six non-zero ones are typed only through the shared layout.

Evidence: ignored `local/research/p3-03/craft/`: `nob.ts`, `walk-cinf.ts`, `walk-debris.ts`, `tabl4003.ts`, `survey.ts`, `survey2.ts`, `zeros.ts`, `checks.ts`, `maxima.ts`, `floats.ts`, `order.ts` with `out/*.json` and `out/survey.txt` (structure, classes and counts only); the Ghidra scripts `ghidra_scripts/CraftProbe.java` and `CraftFlow.java` run through `probe.sh` with outputs `out/p1`–`out/p18` and `out/flow12b`, queried by `flowq.ts`, `q-roots.ts`, `q-aux.ts` and `q-mount.ts`. Ghidra ran `-noanalysis -readOnly` on a private copy of the project; functions created and calling conventions set in memory were discarded. Widths and operations were read from native instructions or from the decompiler's p-code operations on them.
