---
type: format
status: draft
phase: P0
updated: 2026-10-18
related: [U-002, U-003, U-008, U-009, U-013, U-014, U-022, U-023, U-027, U-028]
---

# Missions and campaign table (SCEN, SCCT)

Container format: [IMFAT](./imfat.md). Both types live in `SCENARIO.NOB`. Confidence labels as defined in the IMFAT doc. Structure only; no names, text, or values from the original are reproduced here.

## 1. Where mission content lives (Confirmed)

- `SCENARIO.NOB` holds 52 `SCEN` entries and one `SCCT` entry.
- Every `SCEN` contains its own object names; 45 of them also hold summary text in their section-2 event triggers ([§2](#section-2-event-triggers-p3-03)).
- None of the 99 distinct strings of 20+ characters found in `SCEN` blocks occurs in `SRANGERS.EXE`. The EXE's long strings are installer hints, support messages, error/assert text, library text, and one generic in-game system message.

Conclusion: mission **content** is data in `SCENARIO.NOB`, not embedded in the EXE. Whether the EXE contains mission-specific hard-coded *logic* (e.g. special cases keyed on mission ID) is still open (U-022).

## 2. SCEN header (Confirmed on all 52 entries)

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 | **World width in sectors**; observed 6, 8, 10, 14. The code found reads only the low 16 bits; the observed values fit in them, and the meaning of the upper half is Unconfirmed. One sector is as wide as the coordinate scale at 0x08, and the world spans ±(sectors × scale ÷ 2) around the origin (Confirmed by code, see [world sector grid](./executable.md#mission-placement-scheduling-and-world-grid)) |
| 0x04 | u32 | **World height in sectors**; equal to the value at 0x00 in every mission (Confirmed by code, as 0x00) |
| 0x08 | f32 | **Coordinate reference scale**, 8000 in every mission. At load time the game multiplies the spatial fields of section 1 and sections 3–4 by (runtime world scale ÷ this value) and stores the runtime scale here; the runtime scale is 15000 (Confirmed by code, [executable](./executable.md) §4 and [runtime scale](./executable.md#runtime-scale-and-load-conversion-p3-0202)) |
| 0x0C | u32 | 0 in 51 missions, 1 in one; when set, the mission builder switches several runtime parameters and the spawn code runs a wave mode that reads the difficulty group ([difficulty readers](#difficulty-readers-p3-01), path 9) (gate Confirmed by code; meaning Unconfirmed) |
| 0x10 | {u32 ptr, u32 count} × 7 | Section table; a null pointer means the section is empty |

Section pointers are relocated (see IMFAT §3). Spatial fields below are those the loader rescales, which identifies them as coordinates or distances.

| # | Header | Count range | Element | Content | Status |
|---|---|---|---|---|---|
| 0 | 0x10 | 0–20 | u32 pointer | Pointers to NUL-terminated object names: the mission's **fallback name pool**. Name assignment `0x67d44` uses it for a record without candidate names whose kind is outside masks `0x6001`, `0x93780` and `0x78000`: from a random name, the first one not yet used in this build, all becoming unused again once every name has been used ([names](./executable.md#names-p3-0203)) | Confirmed (code) |
| 1 | 0x18 | 9–32 | 132-byte record | Mission objects (see §3) | Structure Confirmed, fields partly Likely |
| 2 | 0x20 | 0–2 | 28-byte event trigger | **Event triggers**, referenced by record +0x54 (and +0x30): each has a table of 20-byte ranges, each with a summary selector byte and optional summary text, three runtime event counters and a spawn-pair array built at run time. See [section-2 event triggers](#section-2-event-triggers-p3-03) | Structure and access Confirmed (code; all 52 missions); rule meaning P3-11 |
| 3 | 0x28 | 0–6 | 16 bytes | **Spawn rectangle**: four i32 x0, y0, x1, y1 (all rescaled). Records reference it through +0x44; `0x6883c` places an object uniformly from (x0, y0) over the absolute side lengths at z = 0, which is the rectangle itself because x0 ≤ x1 and y0 ≤ y1 in all 189 rectangles ([placement mappings](./executable.md#placement-mappings-p3-0202)), and `0x685e0` places on a grid inside it | Confirmed (placement logic) |
| 4 | 0x30 | 0–1 | 36 bytes | Eight i32 spatial values from +4 to +0x20 (all rescaled); Likely a zone or path | Likely |
| 5 | 0x38 | 2–8 | 28 bytes | Group spawns: see [section-5 member records](#section-5-member-records-confirmed-access) | Access Confirmed |
| 6 | 0x40 | 1–3 | {u32 ptr, u32 count} | **Formation layouts**: each entry points at `count` f32 x, y, z offsets and is referenced by section-5 +4. The loader does not rescale the offsets; it swaps +4 and +8 (y and z) of element 0 only (see below) | Confirmed (access) |

Structs are packed with 1-byte alignment; several pointer fields are unaligned.

**Section-6 load transform (Confirmed by native instructions):** the last loop of `0x68d2c` never advances its element index. For each section-6 entry whose count is positive, it swaps the f32 at +4 and +8 of element 0, then reads the next entry; it keeps going while counts stay positive, so after a final positive count it also reads the 8 bytes following the table. The remaining elements are never swapped. All 191 section-5 layout pointers in the 52 missions target section-6 entries.

### Section-2 event triggers (P3-03)

Read-only static analysis, 2026-10-09, on a private copy of the Ghidra project (`-noanalysis -readOnly`), and a structural survey of all 52 `SCEN` entries read through the verified source chain. Structure, counts and addresses only; no bounds, text or selector values are reproduced.

**Element kind (Confirmed by code and data):** section 2 is an array of 28-byte event-trigger headers. Header 0x20 points at the first and header 0x24 gives their number; every native reader steps through all of them with a stride of 0x1C (`0x6953c`, `0x69a70`, `0x69c54`). There is no type field and no other element kind, so every section-2 element is a trigger; the earlier reading of section 2 as group-name pointers is superseded. In the data:

- all 59 elements, in the 46 missions whose section 2 is not empty, are referenced by at least one record +0x54; 2 of them are also referenced by +0x30, both in SCEN 3121;
- every +0x54 and +0x30 pointer targets an element start;
- the trigger table, the range tables, the message-pointer arrays and their strings are laid out from the trigger table onwards without gaps or overlaps, and no array or string is shared.

**Trigger header, 28 bytes:**

| Offset | Type | Role | Evidence |
|---|---|---|---|
| +0x00 | u32 ptr | Range table: the first of +0x04 consecutive 20-byte ranges | Confirmed: read by `0x695c0` and `0x69c54`; relocated and inside the block in all 59 |
| +0x04 | i32 | Range count | Confirmed: signed tests and loop bounds in both readers |
| +0x08 | i32 | Runtime counter of instantiation events reported to `0x6977c` ([mission result](./executable.md#mission-result-success-path-and-campaign-restart-p3-0104) step 1) | Confirmed: `0x695c0` increments it; both readers load it with `FILD` (signed 32-bit) |
| +0x0C | i32 | Runtime counter of destruction events: every event type other than instantiation and world exit | As +0x08 |
| +0x10 | i32 | Runtime counter of world-exit events | As +0x08 |
| +0x14 | u32 heap pointer | Spawn-pair array, built at run time (below) | Confirmed: `0x69708` allocates it (`0x74190`) or enlarges it (`0x741ec`); `0x6953c` releases a non-zero value through `0x7422c` |
| +0x18 | i32 | Spawn-pair count, built at run time | Confirmed: `0x69708` increments it; signed tests in `0x695c0` and `0x69a70` |

**Range, 20 bytes:**

| Offset | Type | Role | Evidence |
|---|---|---|---|
| +0x00 | i32 | Lower bound, inclusive, compared with the scaled ratio (below) | Confirmed: signed `JL` in `0x695c0` and `0x69c54` |
| +0x04 | i32 | Upper bound, inclusive | Confirmed: signed `JG` in both |
| +0x08 | u32 ptr | Message-pointer array; null when +0x0C is 0 | Confirmed: read only by `0x69c54`; relocated whenever non-zero; null in exactly the 2 ranges whose count is 0 |
| +0x0C | i32 | Number of message pointers | Confirmed: signed loop bound in `0x69c54` |
| +0x10 | 8-bit, consumed as i8 | Summary selector byte | Confirmed: `0x69c54` copies the byte to `0x186864`; `0x3b8dc` compares it as a signed byte and sign-extends it; observed values in the [success list](./executable.md#cut-scenes-and-loop-transitions-p3-0108) |
| +0x11 to +0x13 | 3 bytes, storage type Unconfirmed | No reader found | Zero in all 125 ranges (Confirmed, data) |

**Messages (Confirmed by code):** range +0x08 points at +0x0C consecutive u32 pointers, each to a NUL-terminated byte string. The array ends by count, not by a null entry. `0x69c54` measures each string with a byte scan to its NUL, allocates the total length plus one through `0x74190`, and appends the strings in array order without separators. The result is the summary text `0x186860`, which page 0xF shows in its summary chapter ([mission result](./executable.md#mission-result-success-path-and-campaign-restart-p3-0104) step 5). When the total length is 0, nothing is allocated, but the selector byte is still copied. No byte is translated or interpreted on this path. How page 0xF draws the text was not traced (G-06).

**Spawn pairs (Confirmed by code):** pairs are not file data. At mission build, when +0x30 of a scheduled section-1 record (non-zero kind, zero +0x3C) or of a section-5 entry's template is non-zero, `0x6721c` calls `0x69708` instead of queueing it by time (§3). `0x69708` appends an 8-byte pair to the trigger at +0x30: the range index taken from +0x38, and an i32 target, which is the section-1 record index or −1 − the section-5 entry index. The wave mode `0x68f4c` (header 0x0C) appends pairs the same way for section-5 entries 0 and 1. `0x695c0` reads the pairs with a stride of 8. `0x69a70` instead reads the first +0x18 32-bit words of the array with a stride of 4 and treats each word as a target.

**Reset (Confirmed by code):** the builder `0x66c00` loads the SCEN and rescales it (`0x68d2c`), then calls `0x694f8`, which calls `0x6953c`, before `0x6721c` schedules the mission. `0x6953c` does the following for every trigger:

- sets +0x08, +0x0C and +0x10 to zero;
- passes a non-zero +0x14 to the heap release `0x7422c`;
- sets +0x14 and +0x18 to zero.

The stored counters are therefore never read, and a stored non-zero pair pointer would be released as a heap block. `0x6953c` is also called by the wave mode `0x68f4c` and by `0x66f78`, which also releases the entries loaded by the builder and the spawn queue. `0x66f78` is reached only through the table entry at `0x174894`; that it is the module's shutdown routine is Likely.

**Consumers (Confirmed by code; rule semantics belong to P3-11):**

- `0x6977c` takes record +0x54 of the runtime object's source record (object +0x190) and passes it, with the event type, to `0x695c0`, which increments the matching counter. When the pair count is positive, `0x695c0` divides the sum of +0x0C and +0x10 by +0x08 and scales the quotient by the f64 constant at `0x172613`. The result is truncated toward zero, because `0x74518` switches the FPU to chop mode for `FRNDINT`. For every range containing the result, it queues each pair whose range index equals that range's index. The due time is the elapsed mission time plus the +0x34 delay (§3) of the target record, or of the target entry's template.
- `0x69c54`, on success, takes the first trigger in section order whose +0x08 or +0x0C is non-zero. It divides +0x0C by +0x08 and scales the quotient by the f64 constant at `0x17261b`, truncated toward zero; the value is 0 when +0x08 is not positive. It then uses the first of that trigger's ranges that contains the value; when none does, it continues with the next trigger. The chosen range supplies the summary text and the selector byte. Rule meaning: [below](#summary-selection-rule-meaning-p3-11).
- `0x69a70` treats each word it reads from the pair array (above) as a target and counts one of an enemy kind as a pending enemy ([mission result](./executable.md#mission-result-success-path-and-campaign-restart-p3-0104) step 2). With a stride of 4 it does not visit the target of every pair: it reads range indices and targets alike, and stops halfway through the array.

**Load transforms (Confirmed by code):** none beyond IMFAT relocation of trigger +0x00, range +0x08 and the message pointers. The rescaling and the section-6 swap in `0x68d2c` do not touch section 2.

**Text rules (Confirmed, data):** every message string is NUL-terminated inside the block and is 1–72 bytes long without the NUL. All bytes lie in 0x20–0x7A (printable ASCII); there are no control bytes and no bytes of 0x80 or above.

**Observed maxima:**

| Quantity | SCEN 3019 | All 52 `SCEN` |
|---|---|---|
| Triggers per mission | 1 | 2 (59 in total; 6 missions have none) |
| Ranges per trigger | 3 | 3 (at least 1; 125 in total) |
| Message pointers per range | 1 (3 in total) | 6 (318 in total; the 2 ranges without any are the only ranges of SCEN 3121's two triggers, which also have zero selectors) |
| Bytes per message, without NUL | 57 | 72 |
| Bytes of a range's messages together | 57 | 310 |
| Records referencing one trigger through +0x54 | 1 | 134 references; 28 triggers have more than one |
| Ranges with a non-zero selector | 1 | 57 |

**Zero in the baseline (Confirmed, data):** trigger +0x08 to +0x18 in all 59 triggers (the runtime fields reset above), and range +0x11 to +0x13 in all 125 ranges. Within each trigger the ranges do not overlap, every bound lies within the values the scaled ratio can take, and no lower bound exceeds its upper bound; 3 triggers leave gaps between their ranges. In SCEN 3019, the three ranges are contiguous, together cover every value the scaled ratio can take, are stored in descending order, and only the first has a non-zero selector. +0x30, +0x38 and +0x54 are zero in all 5 SCCT wingman records.

**Static coverage (Confirmed method):** a scan of the whole image for the 32-bit address of the scene pointer `0x1766fc` (every hit lies in the scenario module `0x66c00`–`0x69e5c`); decompilation of every function in that module and disassembly of its undecoded routine `0x66f78`; scans for relative calls to `0x694f8`, `0x6953c`, `0x695c0`, `0x69708`, `0x69a70`, `0x69c54` and `0x6977c`; and a heuristic scan for loads of record +0x54 after loads of runtime-object +0x190, which found no other reader. Triggers are reachable only through header 0x20 and record +0x30/+0x54, whose readers are listed above; the wave mode also copies +0x54 from a template to generated records (`0x69194`). Not covered: accesses through computed pointers not derived from these.

Evidence (ignored): `local/research/p3-03/scen-events/` (`ghidra_scripts/ScenProbe.java` with outputs `out/p1.txt`–`out/p11.txt`, `section2-survey.ts` with `out/section2-survey.json`, `s3019-ranges.ts` with `out/s3019-ranges.json`).

#### Summary selection: rule meaning (P3-11)

**Confirmed (code; data where stated).** What section 2 means for a successful mission's summary, as `0x69c54` and the success handler use it. The code steps, the all-clear test that precedes them and the medal flags of `0x69e1c` are in [executable](./executable.md#all-clear-and-summary-selection-p3-1101).

- **Counted events:** +0x08 counts instantiations (event type 3), +0x0C destructions (types 0 and 1, by the player or otherwise) and +0x10 world exits (type 2), each only for objects whose own source record (runtime object +0x190) names the trigger through +0x54. Objects without a source record (dynamic Xpon, projectiles, fragments) never count ([object events](./executable.md#object-events-0x6977c-p3-1102)).
- **Trigger choice:** triggers are tried in section order. One whose +0x08 and +0x0C are both zero is skipped (+0x10 is not read). One with destructions but +0x08 ≤ 0 is not skipped and gets ratio 0.
- **Ratio:** destroyed ÷ instantiated × 100, truncated toward zero to an i32; 0 when +0x08 ≤ 0 (no division). World exits are not part of it, unlike the spawn-pair ratio of `0x695c0`, which uses +0x0C + +0x10. An enemy that leaves the world therefore counts toward the all-clear (it is no longer live) but not toward the summary ratio.
- **Range choice:** the first range in array order with lower ≤ ratio ≤ upper (signed). A range with lower > upper never matches; any i32 pair is well defined. No match → the next trigger.
- **Match:** the summary is the range's messages concatenated in array order without separators; when their total length is 0 no text is allocated (the pointer stays 0) but the selector is still copied. The search then stops.
- **No match at all** (or no triggers): the result is still success, with no summary text and the selector left at −1 (0xFF, written at the build), so no mission clip.
- **Selector domain:** the byte is consumed as i8. ≤ 0 → no mission clip, and the success handler considers medals and promotion; 1–11 → clip rows 1–11, which are not mission clips; **12 → stored as −1, colliding with the 0xFF "none" sentinel**: no clip and the medal path; 13–35 → that clip row; ≥ 36 → the clip player indexes past the 36-row table without a bound check ([cut-scenes](./executable.md#cut-scenes-and-loop-transitions-p3-0108)). Across the 52 missions only 0 and 13–19 occur (Confirmed, data, P3-03 survey), so 1–12 and ≥ 36 lie outside the shipped domain.
- **Timing:** the summary is chosen once, at the all-clear poll (state 3 → 4); events after it do not change the summary or the selector.
- **SCEN 3019 (Confirmed, data):** the only trigger is referenced only by the base record (kind `0x20000`, four objects, due at the start, not in a group). At any success it has four instantiations, so it is always chosen. The attainable ratios 0, 25, 50, 75 and 100 select the third, third, third, second and first range, so the summary is never empty, and the first range's clip (`BASELOSS`) follows exactly when all four bases were destroyed before the poll. These ratios are exact in binary, so the x87 precision does not matter here (U-009).

Evidence: ignored `local/research/p3-11/flow/` (`flow-data.ts` with `out/flow-data-3019.json`, Ghidra outputs listed in [executable](./executable.md#corrections-and-evidence-p3-1104)).

## 3. 132-byte object record (structure Confirmed, fields partly Likely)

Field meanings come from the mission loader and spawn code ([executable](./executable.md) §4), plus statistics over all 949 section-1 records. Offsets are in bytes.

| Offset | Type | Meaning | Status | Evidence |
|---|---|---|---|---|
| +0x00 | u32 | Single-bit model kind: the bit position indexes M2ID. Special handling: 0 = not spawned; 1 = the player, whose scheduling also queues the selected wingman; 2 = object linked to the player (its +0x48 is set to the kind-1 record) | Model lookup Confirmed; kinds 0, 1 and 2 Confirmed (code) | Model lookup `0x65ca4`; [spawn queue](./executable.md#spawn-queue-p3-0203), [instantiation](./executable.md#instantiation-p3-0203) |
| +0x04, +0x08 | {u32 ptr, u32 count} | Candidate object-name pointer list; spawn-time name assignment takes the first candidate that no object of the checked kinds holds, or, when the list is empty, a type name, no name or the section-0 pool depending on the kind ([names](./executable.md#names-p3-0203)) | Confirmed (code) | `0x67d44`; names are not reproduced |
| +0x0C | i32 | **Spawn probability** in percent. Defaults to 100 when 0; negative values are kept. When +0x80 is zero, each firing of the queue entry draws one rand and posts its requests only when rand % 100 < +0x0C, also at 100; residues 0–67 have 328 of the 32,768 rand values each, 68–99 have 327 | Confirmed (code) | `0x6744c`; [spawn queue](./executable.md#spawn-queue-p3-0203) |
| +0x10 | i32 | **Requests per firing** of a section-1 record's queue entry, each instantiating one object. Defaults to 1 when 0; negative values are kept and post none | Confirmed (code) | `0x6744c`; `0x67018` |
| +0x14 | i32 | **Spawn-count limit:** when non-zero, the entry fires only while the record's spawn counter +0x18 (for a section-5 template, the entry's +20) is below it; a limited entry leaves the queue without repeating. Wingman entries are never limited. The counters are never decremented, so this bounds spawns, not live objects ([object table](./executable.md#runtime-object-table-p3-0201)); because they grow only at instantiation, the last firing's requests (and overdue repeats in the same check) can take the total past it | Confirmed (code) | `0x67018` |
| +0x18 | u32 | Runtime spawn counter: incremented after each object instantiated from the record as a section-1 record or wingman, never decremented; section-5 members do not increment it | Confirmed (code) | `0x67678`, `0x68018` |
| +0x1C | u32 | Spawn time in seconds: shifted left by 6 into clock units of 1/64 s ([time base](./executable.md#simulation-time-base-p3-0106)) and inserted into a time-ordered spawn queue, relative to the mission's scheduling origin; the entry fires once elapsed time exceeds it. Not read for wingman records, which are due at 0 | Confirmed (code) | [Spawn queue](./executable.md#spawn-queue-p3-0203); time base |
| +0x20 | i32 | **Repeat interval** in seconds: when positive, every firing that passes the limit re-queues the entry at its previous due time plus this value shifted left by 6, whether or not the probability roll posted requests | Confirmed (code) | `0x67018` |
| +0x24, +0x28, +0x2C | f32 × 3 | Position x, y, z (rescaled at load) | Confirmed spatial, Likely position | World-scale code |
| +0x30 | u32 ptr | **Spawn-pair trigger**: a section-2 event trigger. When non-zero, `0x6721c` does not queue the record by time but registers it with that trigger as a spawn pair {+0x38, record index} (`0x69708`), and the trigger's range whose number matches +0x38 then queues it (`0x695c0`); a section-5 template's +0x30 does the same for its entry ([section-2 event triggers](#section-2-event-triggers-p3-03)) | Confirmed (scheduling, code); trigger semantics belong to P3-11 | `0x6721c`, `0x69708`, `0x695c0`; non-zero in 2 of the 949 records (local count), both in SCEN 3121 and both targeting element starts |
| +0x38 | 32-bit; signedness Unconfirmed (compared only for equality) | Range index within the +0x30 trigger, stored in the pair and compared for equality with a range's index | Confirmed (code) | `0x69708`, `0x695c0`; zero whenever +0x30 is zero, and below the trigger's range count otherwise (all 52 missions) |
| +0x34 | u32 | Delay in seconds (shifted left by 6) before a spawn scheduled by a section-2 event trigger; `0x695c0` adds it to the elapsed mission time | Confirmed (unit); Likely (role) | `0x695c0` |
| +0x3C | u32 ptr | **Member back-reference**: the section-5 entry that lists this record as a member. Scheduler `0x6721c` does not schedule a section-1 record whose +0x3C is non-zero | Confirmed (scheduling); Likely (membership meaning) | `0x6721c`; see below |
| +0x40 | i32 | **Grid spacing** (rescaled at load): when non-zero, the object is placed on a grid with this spacing inside the +0x44 rectangle | Confirmed (placement logic) | `0x68398`, `0x685e0` |
| +0x44 | u32 ptr | **Spawn rectangle**: a section-3 element | Confirmed (placement logic) | `0x68398`, `0x68598`, `0x6883c` |
| +0x48 | u32 ptr | **Placement anchor**: a record; the object is placed near the runtime object created from that record, with a random offset, or at a whole-world default position when none exists. For a kind-2 record every default fill sets it to the mission's kind-1 record, overwriting any value | Confirmed (placement logic and kind-2 default) | `0x68708`; `0x6744c` ([defaults](./executable.md#record-defaults-p3-0203)) |
| +0x4C, +0x50 | u32 ptr, u8 | Path-based placement through `0x688c4` when position, +0x44 and +0x48 are all zero. Instantiation's `0x68050` also reads them for an object without an AI target: +0x4C null gives a world-default goal point; otherwise +0x50 selects the path direction (2: one random draw; 1 and other values: a fixed direction) for `0x688c4` (Confirmed, code, P3-06/05, [`0x68050`](./executable.md#initial-flight-state-p3-0605)) | Likely (placement role); Confirmed (`0x68050` reads) | `0x68598`, `0x68050` |
| +0x54 | u32 ptr | **Event trigger**: a section-2 element, whose counters count this object's events ([section-2 event triggers](#section-2-event-triggers-p3-03)) | Confirmed (access) | `0x6977c` |
| +0x58 | u32 ptr | **AI target record**: while that record's spawn counter (+0x18) is positive, `0x68018` targets its kind (the target record's +0x00 word, with a filter on objects whose source is that record; P3-08/05); otherwise the +0x5C mask applies. Null in every kind-1 record of the 52 missions (local count), so the player's `0x68050` takes no AI target ([`0x68050`](./executable.md#initial-flight-state-p3-0605)) | Confirmed (logic) | `0x68018` (readers `0x68050`, `0x62760`) |
| +0x5C | u32 | Default AI target-kind mask, used when the descriptor at +0x58 is absent or inactive; not the object's own base capability flag. Zero in every kind-1 record of the 52 missions (local count) | Confirmed (fallback target selection) | `0x68018`; communication code `0x2cbb4` tests the runtime object's kind instead |
| +0x60, +0x64, +0x68 | i32 | Default 100 when 0; negative values clamp to 0. Instantiation scales craft-record values by them: +0x60 into object +0xD0, +0x68 and +0x64 through `0x3060c` ([instantiation](./executable.md#instantiation-p3-0203)) | Defaults Confirmed (code); Likely percentages (e.g. hull, shields, energy) | `0x6744c`, `0x67938` |
| +0x70, +0x74 | i32 | Default (difficulty group + 3) × mission number when 0, or 100 when the mission number is below 1; negative +0x70 clamps to 0, a negative +0x74 is kept. Spawn copies them to runtime +0xDC/+0xE0, which AI program selection compares ([difficulty readers](#difficulty-readers-p3-01)); the parked engagement chooses a missile only while runtime +0xE0 (+0x74) is non-negative ([parked engagement](./executable.md#parked-object-engagement-p3-0705)). P3-08 (Confirmed, code): the selection reads +0xDC and \|+0xE0\| once, before its draw; the interpreter's install path `0x5e4d0` reads both against program record +0x0C/+0x10 to scale the update period, the turn limits, the speed and turn fractions and the noise amplitude, and **writes a negative runtime +0xE0 back as its magnitude** (after the selection; no slice record is negative); the wingman uses +0xDC − 1 as its AICO element (`0x60f80`) and reply voice (`0x3c894`) ([ai §1](./ai.md#1-loading-the-id-chain-and-the-group-0-closure-confirmed), [§11.2](./ai.md#112-install-mode-0-0x64b54)). In the `SCCT` wingman records (§4), +0x70 doubles as the wingman's speaker face: face = +0x70 − 1 through runtime +0xDC; the 5 records give 5 distinct faces 0–4 ([executable RX1](./executable.md#rx1-helpers--confirmed-code-and-data), [RQ4](./executable.md#rq4-speaker-faces-and-message-lookup--confirmed-code)). No other writer exists, so both are otherwise constant after instantiation | Defaults and copy Confirmed (code); the +0x74 gate Confirmed (code); readers and the +0xE0 writer Confirmed (code); wingman face Confirmed (code and data, P3-10/03); "skill parameters that grow with difficulty and campaign progress" Likely | Default-filling code `0x6744c`; `0x67938`, `0x5de18`, `0x30150`, `0x5e4d0`, `0x60f80` |
| +0x78 | i32 | Default rand % 60 + 20 (20–79) when 0; negative values clamp to 0. Spawn copies it to runtime +0xE4. **AI parameter** with exactly three readers, all AI code on the object itself: the engagement share (in one branch, rand % 96 < +0xE4 decides whether the AI target +0x90 is engaged), the parked target search (rand % 100 ≤ +0xE4 decides whether the record's preferred target kinds are used) and the wingman's formation auto-engage radius (AICO +0x2C − +0xE4 × AICO +0x30) ([executable Q2](./executable.md#q2-readers-of-object-0xe4-record-0x78--confirmed-code)) | Defaults, copy and readers Confirmed (code; P3-08/03–06) | `0x6744c`, `0x67938` ([defaults](./executable.md#record-defaults-p3-0203)); `0x63538`, `0x627e6`, `0x61cdb` |
| +0x7C | u32 | **Always shown on the strategic map:** every pass, `0x2f028` sets the runtime object's map-visibility flag +0xD4 to (+0x7C ≠ 0) before the map reveal, so a hostile from such a record is a map contact even outside friendly coverage | Confirmed (code); only reader found (Likely: computed accesses not excluded) | `0x2f028` ([map contacts](./executable.md#map-contacts-coverage-and-fog-p3-0903)); non-zero in 6 of the 949 section-1 records (6 missions, all hostile kinds), zero in all 9 records of SCEN 3019 and in the 5 SCCT wingman records (local counts, P3-09/03) |
| +0x80 | u32 | When zero, enables the +0x0C probability roll. When non-zero, the entry posts its requests without a roll only when the build's flag `0x176714` is set: in the campaign a coin flip drawn before each briefing (rand % 100 ≥ 50), in practice never. Non-zero in 12 of the 949 records (local count) | Confirmed (code); its purpose (optional spawns) Likely | `0x67018`; [spawn queue](./executable.md#spawn-queue-p3-0203) |

Other observations:

- Relocated pointer fields occur at +4, +48, +60, +68, +72, +76, +84, +88; most are null in any given record.
- The model is selected through the single-bit kind at +0 ([hud](./hud.md) §3); faction and interaction capability are separate unresolved semantics (U-022).
- The same 132-byte record type appears in `SCCT` (§4).
- Defaults (+0x0C, +0x10, +0x48 of kind 2, +0x60–+0x78) are written into the loaded record once per build, before the origin is set; every build reads the `SCEN` afresh, while the `SCCT` wingman records keep their first fill for the program run ([record defaults](./executable.md#record-defaults-p3-0203)).
- Rescaling covers section-1 records only, each once; a record reachable only through section 5 keeps its file values, and the `SCCT` wingman records (§4) are never rescaled, so their spatial fields are runtime units ([runtime scale](./executable.md#runtime-scale-and-load-conversion-p3-0202)).

**Spawn placement order (Confirmed by code, `0x68398`):** a non-zero +0x40 selects grid placement in the +0x44 rectangle; otherwise a non-zero +0x48 selects anchor placement; otherwise a zero position (sign ignored) selects, in order, the +0x44 rectangle, the +0x4C path or a whole-world default (`0x68c98`, uniform over the world extent from header 0x00/0x04); otherwise the stored position is used. The result is then compared with the world rectangle inset by 200 runtime units and, when outside it, moved once 300 units toward the origin; kinds in mask `0x87c` get a fixed height. The random mappings, endpoints and initial pose are in [placement mappings](./executable.md#placement-mappings-p3-0202). The resulting values are runtime state, not record data.

### Section-5 member records (Confirmed access)

Each 28-byte section-5 record contains:

| Offset | Type | Meaning | Status |
|---|---|---|---|
| +0 | i32 | Number of spawn requests each time the entry fires, each instantiating every member, in the role record +0x10 has for section-1 records (`0x67018`); not default-filled, and a value ≤ 0 posts none | Confirmed (code) |
| +4 | u32 ptr | Formation layout: a section-6 entry | Confirmed (access) |
| +8 | u32 ptr | 132-byte template record; the scheduler queues the entry at the template's +0x1C, or through its +0x30/+0x38 path | Confirmed (scheduling) |
| +12 | u32 ptr | Array of object-record pointers (members); the same record may appear more than once | Confirmed (access) |
| +16 | u32 | Member count | Confirmed |
| +20, +24 | u32 | Runtime spawn counter (incremented once per completed request and compared with the template's +0x14) and the node of the current layout cycle's first member, written by dispatch | Confirmed (code) |

Spawn dispatch `0x67678` instantiates the member records from that array, not only the template at +8. For member *i*, it places the object at an anchor plus layout offset (*i* mod layout count); the anchor and its pose are computed from the template by the placement routine `0x68398` whenever *i* mod layout count is 0. Layout offsets are added, without rescaling, to the anchor position computed at run time, and member positions are not checked against the world rectangle. Before each member's instantiation, the template's +0x58 and +0x5C are copied into the member record when they are non-zero (Confirmed by code, [section-5 dispatch](./executable.md#section-5-dispatch-p3-0202)). The entry's timing, limit, probability and repeat come from the template's +0x1C, +0x14, +0x0C/+0x80 and +0x20, its counter is the entry's +20 ([spawn queue](./executable.md#spawn-queue-p3-0203)), and every template and member in the 52 missions is a section-1 record (local count). Complete model-reference research must include the member array even if it aliases section-1 records.

## 4. SCCT: campaign table (Confirmed structure, Likely meaning)

`SCENARIO.NOB` has exactly one `SCCT`, entry 3123.

| Offset | Type | Meaning |
|---|---|---|
| 0x00 | u32 ptr, u32 count | Group table: 3 groups, each {u32 slots ptr, u32 slot count} |
| 0x08 | u32 ptr, u32 count | 5 records of the 132-byte type (§3): **the selectable wingmen**. With a positive selector, scheduling the mission's kind-1 record also queues the selected record at time 0 (Confirmed by code; for selectors 0 and 1 in the selected mission also at runtime, P3-02/10, see the [runtime check](./executable.md#runtime-check-p3-0210)). The records are never rescaled and keep their default fill for the program run ([spawn queue](./executable.md#spawn-queue-p3-0203), [record defaults](./executable.md#record-defaults-p3-0203)) |
| 0x10 | {u32 ptr, u32 count} × 3 | The three groups' slot lists (18 slots each) |

- Each slot is 12 bytes: `SCEN` entry ID, `MUSC` entry ID, and a u32 that is a pointer only in slot 0 (to the group name) and 0 otherwise. The mission builder loads the slot's `SCEN` and `MUSC` by these IDs (Confirmed by code).
- Each group's 18 slots are followed by a 34-byte NUL-padded group name.
- **Entries reference other entries by entry ID**, not by offset.
- Slot 0 of all three groups references the same `SCEN`; the other 51 slots reference distinct missions, covering all 52 `SCEN` entries.
- **The three groups are Likely three difficulty versions of one campaign**, not three campaigns: the code maps a 0–100 value to group 0, 1, or 2 at thresholds 34 and 67, consistent with the campaign difficulty slider described in the README (U-003).
- The post-mission code keeps statistics for 17 missions and caps the mission number below 17 (Confirmed), consistent with 17 missions per group after the shared opening mission.
- **Other `SCENARIO.NOB` entries (Confirmed, EXE and data, P3-01/10):** the slot of the selected mission (group 0, slot 1) names MUSC 3005. The four TABL entries 3011, 3013, 3015 and 3017 are loaded once at start-up (`0x3a850`); 3015 and 3011 are read only by the statistics page formatters `0x3bc04` and `0x3bc28`, 3017 and 3013 by the statistics row and promotion `0x3b8dc` (3013 also by its reset `0x3b7b8`). None of them holds an entry ID ([executable](./executable.md#data-loaded-by-the-loop-p3-0110)).

**Confirmed selection logic:** the main flow at `0x3266c` passes slot 0 to the builder on its non-campaign branch and the zero-based campaign mission index plus 1 on its campaign branch. Group selection uses `0x38428`: values below 34 select group 0, values 34–66 select group 1, and values 67 or above select group 2. Thus the structural selector for the first campaign mission is slot 1, not the common slot 0. The selected wingman getter `0x33940` provides the selector subsequently used by `0x6721c`; zero skips wingman scheduling, positive selectors are clamped to the five-record SCCT list and converted to a zero-based index ([spawn queue](./executable.md#spawn-queue-p3-0203)).

**Confirmed (difficulty value identity and statistics-page binding):** `0x3266c` passes global `0x186844` to `0x38428` before it chooses between its campaign and non-campaign branches. Its writers, each taking a settings value from `0x38414`, are listed in [difficulty readers](#difficulty-readers-p3-01); the debug mission jump `0x33170` is one of them. Getter `0x33930` returns the global and has one caller, `0x36b10`, the only code found that formats `0x186844` as a number (the configuration writer `0x38004` formats only the settings pair). That routine formats three consecutive fields: the mission number (`0x33838`), this global, and an elapsed-time value (`0x3bc04` over a statistics field). These match the consecutive mission-number, difficulty and elapsed-time rows of the statistics page in [B-003](../behavior/B-003-campaign-flow.md#第一关统计样本已确认静态读数). The settings values that feed the global are read elsewhere only by `0x38414`, by `0x381ac` (which draws them without numeric formatting, beside `0x36b10` under menu-page handler `0x34c08`), and by the configuration-file handlers identified below. None of them calls the formatter used by `0x36b10`. The page's difficulty 19 is therefore the selector input, which maps to group 0: the user's observed first campaign mission was group 0, slot 1 (SCEN 3019). Evidence: ignored `difficulty-group-call.log`, `difficulty-global.c`, `difficulty-display-call.log`, `spawn-queue-and-stats.c`, `difficulty-settings-readers.c` and their read-only analysis logs in `local/research/p2-01/`.

### Difficulty readers (P3-01)

Read-only static enumeration, 2026-10-08, on a private copy of the Ghidra project (`-noanalysis -readOnly`). The raw difficulty and the difficulty group are different values: the raw value is a setting (the configuration parser accepts 0–100) and is what the statistics page shows; the group (0–2) is what `0x38428` derives from it. Structure and addresses only.

**Values and writers (Confirmed, code):**

- **Settings pair:** option 7 of the option getter/setter `0x381ac`/`0x382a0` holds two raw values, the practice value `0x1863dc` and the campaign value `0x1863e0`. `0x38414` returns the practice value when EAX = 1 and the campaign value otherwise. They are stored in `SRANGER.CFG` under the `CURR_LEVEL` key (U-013) through the configuration key table at `0x174d78`, which `0x37f54` iterates: the parser `0x37de0` reads two integers and keeps each only if it lies in 0–100, and `0x38004` writes them back in the same order. Option 8 (`0x1863e4`) is a separate flag.
- **Raw difficulty `0x186844`:** written from `0x38414` by the practice start `0x330ac` (practice value), the new-campaign start `0x330fc`, the saved-campaign load `0x332e8`, the debug mission jump `0x33170` (campaign value, when not already in a campaign) and the start-up initialiser `0x32580`. `0x32580` is run once by the module-initialisation loop `0x22c08` (called from `0x22d00`) through its entry in the table at `0x1747e0`; it takes the practice or campaign value according to option 8. A setter at `0x33928` has no caller and no pointer.
- **Campaign copy `0x18639c`:** `0x3b7b8` with argument 0 (new campaign, `0x32580`, `0x33170`) stores the campaign value at offset +0x4C8 of the campaign record block at `0x185ed4`.
- **Difficulty group `0x176708`:** the builder `0x66c00` stores the `0x38428` result there; its getter is `0x694f0`. The builder also stores the clamped slot at `0x176704`, used below as the mission number.

**Raw-value readers (Confirmed, code):**

| Reader | Use | Effect | Owner |
|---|---|---|---|
| `0x3266c` (`0x32877`) | `0x38428`, then the builder | Group selection on both practice and campaign starts; everything in the next table follows from it | Run configuration: P3-02, P3-04 |
| `0x33930` → `0x36b10` | Statistics page | Numeric display only | Statistics page (G-06) |
| `0x18639c` | Saved-campaign write `0x38698` and read `0x38644` (which restores `0x1863e0` before `0x332e8` sets the raw difficulty); high-score insertion `0x3b28c` (per-entry copy at +0x78 of the table at `0x185c88`, written to the high-score file by `0x3aae4`) and the current-player row `0x3b5d4` | Persistence and display only | Campaign saving and high scores (G-06, P4) |
| `0x1863dc`/`0x1863e0` | Options page `0x34c08` through `0x381ac`; `CURR_LEVEL` writer `0x38004` | Settings user interface and persistence only | G-07 |

**Group readers:** code paths Confirmed; "meaning" is Likely unless stated.

| # | Path | Effect | Reachability for the slice | Owner |
|---|---|---|---|---|
| 1 | `0x66c00` → `0x2cf38`(slot, group) | Selects the TABL 4003 column: the CINF entry ([weapon records](./executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)) and that pair's scale, stored at `0x1864d4`. The scale's only reader, getter `0x2cf0c`, has one caller, the parked-object engagement `0x30150`, which multiplies the summed damage of an engagement by it before its per-kind factors ([parked engagement](./executable.md#parked-object-engagement-p3-0705)). The attacker is a parked object; its target may be parked, active or docked. Projectile, missile and collision damage are not scaled (Confirmed, P3-07/05) | Every mission start; `0x30150` runs from the per-frame parked-object update `0x2f1b0`, for parked attackers only | P3-03 (TABL 4003 scale and CINF import), P3-07 (R-07, R-09) |
| 2 | `0x6721c` → `0x6744c` | §3 +0x70/+0x74 defaults: (group + 3) × mission number, or 100 when the mission number is below 1; the spawn routine `0x67938` copies +0x70/+0x74/+0x78 to runtime +0xDC/+0xE0/+0xE4 (Confirmed) | Records whose fields are zero; SCEN 3019 has such records (field inventory) | P3-02 (R-02), P3-08 (consumers) |
| 3 | `0x20990` → `0x5dbc8` → `0x64b1c` | Chooses an AI program from the group's table, `AISTUFF.NOB` TABL 6003, 6007 or 6005 for groups 0, 1 and 2, filtered by kind and by runtime +0xDC/+0xE0 in `0x5de18`; otherwise from the built-in table at `0x1762f8` (10 records of 0x54 bytes, handler at +0x18). The three tables are loaded at start-up by module initialiser `0x5db80` through `0x64970`/`0x649c8` (Confirmed) | At spawn, for kinds 2, 8, 0x10, 0x40, 0x80, 0x100, 0x200, 0x400, 0x800, 0x1000, 0x2000 and 0x8000–0x80000 (not 1, 4, 0x20 or 0x4000): the slice's wingman, both enemy types and base. The flag argument is always SCEN header +0x0C (0 in the slice). Slice results and the support closure: [ai §10](./ai.md#10-support-closure-of-the-slice-p3-0801) (Confirmed, P3-08/01) | P3-08 (R-11, R-12); P3-03 import; data closure |
| 4 | `0x64820` (from built-in handler `0x648fc`) | Passes `0x5e444` a random k × 64, k from 1 to (3 − group) × 2 + 2 (a duration: Likely) | Unreachable in the slice: only built-in record 8's handler calls it, and no slice object can select record 8 ([ai §10.3](./ai.md#103-built-in-handlers); Confirmed, P3-08/01) | P3-08 |
| 5 | `0x632a4` (called from `0x6019e` and `0x63656`) | Compares the share of kind-`0x380` craft already engaging the player, or the object from `0x38bb0`, with a per-group triple in AICO 6001 (`[0x1b41a0]` + group × 12) to choose what the craft engages | Reachable (Confirmed, P3-08/02–03): every interpreter update of the slice's enemy craft through the state machine's retarget timer; the computation is in [executable A9](./executable.md#a9-engagement-share-0x632a4c-difficulty-path-5--confirmed-code) | P3-08; P3-03 import (AICO 6001); data closure |
| 6 | `0x221fc` → `0x29670`, `0x29934` | Collision damage between the player and craft, between the player and fragment objects (kind `0x1000000`), and between other craft is divided by (3 − group), a signed integer division after the response's truncation; in one pass, fragments whose parameter record has a non-zero +0x5C damage the player only while a per-pass counter shared by all such fragments, which counts every contact, is below group × 2 + 2. Refinements (Confirmed, P3-07/03, [collisions](./executable.md#projectiles-missiles-hits-and-collisions-p3-0703)): "other craft" covers only pairs whose first member is of kind 2, 0x80, 0x100 or 0x200; a struck object of a kind in `0xf9c7c` takes half; fragments with non-zero +0x5C deal half damage and lose durability on every contact | Every update of dispatcher `0x20d10`; gate `0x174b30` is statically enabled and otherwise only referenced from a toggle table | P3-07 (R-08, R-09) |
| 7 | `0x2bf08` | Warp completion: continues the Warp started by `0x2be00` (origin `0x1864c8`, destination ps +0x10, flag +0xCC, recharge +0xC8) and offsets the arrival by s × (group + 1) × 5000 along ±z (sign from one draw; s the Warp error) before the nearest-object adjustment (Confirmed, code, P3-09/06; [completion](./executable.md#warp-progress-completion-and-interruptions-p3-0906)) | Every update of `0x20d10` during a Warp | P3-09 (R-16) |
| 8 | Player callback `0x25f90` (installed by `0x20990` for kind 1 only) | Sets controller +0x1B4 (the player's control block at object +0x14) to (group = 0); while it is set, each update runs `0x27f68`, which matches the player's speed to the object at player +0x8C through `0x21adc` (within the player's limits, at most every 0x20 clock units, 0.5 s; [time base](./executable.md#simulation-time-base-p3-0106)) when that object is of a kind in `0x380` and within a distance threshold: a low-difficulty speed assist. P3-06/03 (Confirmed, code): the distance is a squared 3-D distance compared with a squared range, equality included; the due time is re-armed from the sample of the match, with no catch-up, and also when the match fails for a missing block; out of range or before the due time the timer does not advance. +0x1B4 is the same switch that Ctrl+Enter toggles, so the group sets only its initial value; after a match, losing the target restores full throttle. Details in [speed assist](./executable.md#throttle-maximum-speed-and-speed-matching-p3-0603) | Active for group 0, the slice's group | P3-06 (R-04), with targeting from P3-07 |
| 9 | `0x67018`, `0x67678`, `0x67938` → `0x68f4c`, `0x69194`, `0x69344` | A wave mode: wave thresholds, wave composition and AI fields use the group | Only when SCEN header 0x0C is non-zero (§2); zero in SCEN 3019, so not in the slice | None in P3 |

**Static coverage and its limits (Confirmed method):** Ghidra reference lists; whole-image scans for the 32-bit absolute address of each cell above and of the blocks around them (`0x186800`–`0x1868ff`, `0x1863c0`–`0x1863ff`); scans for every relative call or jump to the getters `0x33930`, `0x38414`, `0x38428`, `0x694f0`, `0x2cf0c` and the setter `0x33928`, including undecoded bytes (for `0x2cf0c` also every conditional and short jump, P3-07/05); scans for the campaign-record base (`0x185ed4` and offset 0x4C8) and the high-score base `0x185c88`, through which no other access to `0x18639c` exists; and linear sweeps of the undecoded regions `0x3257b`–`0x32637`, `0x5db7e`–`0x5dbc7`, `0x62b53`–`0x637e3` and `0x63bfd`–`0x64b1b`, which hold `0x32580`, `0x5db80`, paths 4–5 and the table loader. No pointer to any getter exists. Not covered: accesses through computed pointers not derived from these bases (the only block copies found are the save and high-score copies), and the semantics of the data-driven AI programs that `AISTUFF.NOB` supplies and handler `0x64cb8` interprets. The known group-specific program selection (path 3) calls `0x694f0`, and no further reader was found within this coverage; what the programs do with their inputs remains with P3-08. The effects in paths 4–5 and the semantic labels of paths 7–8 need P3-08, P3-09 and P3-06 to confirm; P3-07 confirmed paths 1 and 6.

**Slice configuration (Confirmed within this coverage):** no identified reader remains unexplained. Every path is display, persistence or a rule handed to a P3 task above. Difficulty input 19 keeps group 0; the group-0 speed assist (8) and the group-dependent parameters (1–7) are part of that configuration's rules, not a reason to change it. Evidence: ignored `local/research/p3-01/difficulty/` (`findings.md`, scan and disassembly listings, local decompiled exports).

### P2 slice candidate evidence

Local read-only analysis confirms that all three groups' slot 0 selects `SCEN` entry 3121; P2 uses group index 1 only as the baseline configuration. That entry has ten section-1 records, two section-2 records, two section-5 records, and one section-6 list. Its section-1 kind distribution is one `0x1`, two `0x80`, and one each of `0x100`, `0x200`, `0x400`, `0x1000`, and `0x80000`, plus two zero-kind records. Sections 3 and 4 are empty.

Across all missions, non-zero kind values are single-bit powers spanning the 20 non-zero `M2ID` slots. Function `0x65ca4` maps a single-bit kind to its bit position and indexes the loaded M2ID table; the five SCCT wingman records all use kind `0x2`, which therefore resolves to slot 1. The kind-to-`M2ID` bit-position relation is **Confirmed**.

The shared slot 0 is **not qualified** by the available evidence. Its non-player records resolve structurally to six distinct `M2ID` slots (7, 8, 9, 10, 12, and 19); faction and base-capability fields remain unidentified. Section 2 is message data, not proven result-condition data; section 6 holds formation layouts (see §2), and the explicit section-3/4 spatial collections are empty. Empty collections alone do not prove that a gameplay feature is disabled.

Practice-mode observations and its rejection as a gameplay slice are recorded in [B-002](../behavior/B-002-practice-mode.md). Its association with this shared slot remains **Likely**, not Confirmed: the unique special-mode header is a clue, not a verified entry-point trace. The next research target is campaign fallback qualification, including mode-to-slot identity, faction/base/result semantics and the required resource closure; do not bind screenshot target labels directly to M2ID slots.

Campaign gameplay evidence is now recorded in [B-003](../behavior/B-003-campaign-flow.md), [B-004](../behavior/B-004-base-communications.md) and [B-001](../behavior/B-001-strategic-map.md). It establishes observable base interaction, map/Warp and successful mission progression in the user's first campaign mission. The shared difficulty value binds that run to group 0, slot 1 (SCEN 3019; see §4). Practice-to-slot-0 identity remains **Likely**. Rescue observations in [B-005](../behavior/B-005-campaign-rescue.md) must not be interpreted as immediate mission failure or silently omitted from a required mission closure.

**Confirmed (campaign structural gate):** under the player-relative [target modes](./executable.md#player-target-modes-and-enemy-classification), every non-zero campaign slot references the player slot 0 and the friendly slot 14. Only slots 1 and 2 of each group reference one or two enemy model types (two in each case); the other 45 reference three to six. This is a lower bound for those 45, since every directly referenced enemy type counts. Slots 1 and 2 also reference base kind 17, the only base-interaction kind they use. Six campaign slots therefore pass the structural player/enemy/base gate: slots 1 and 2 of groups 0–2. The three slot-1 scenes reference slots 0, 7, 8, 14 and 17. Each slot-2 scene references a strict superset (adding slots 3, 4 and 5). Result and map/Warp behaviour has been observed only in group 0, slot 1 (the user's run, §4); it has not been checked individually for the other five. Exact result and Warp formulas remain P3 research.

### Campaign candidate source profiles (Confirmed structure)

The local script `local/research/p2-01/profile-candidates.ts` checks all 54 SCCT slots covering 52 distinct SCEN entries. Report version 2 collects section-1 records, section-5 templates and every member-array record, deduplicates records, resolves each non-zero kind through M2ID, and follows all three MODL part lists and every non-zero SND reference. Bounds and referenced entry types are checked; no names, strings or payload content enter the report. Adding member traversal did not change the published slot-1 profiles or their per-type minima.

| Group | Slot | SCEN entry | Distinct referenced M2ID slots | MODL | MESH | TEX | SND | Distinct model-to-source edges |
|---|---|---|---|---|---|---|---|---|
| 0 | 1 | 3019 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |
| 1 | 1 | 3037 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |
| 2 | 1 | 3075 | 0, 7, 8, 14, 17 | 5 | 149 | 15 | 13 | 189 |

Each profile contains 182 distinct source entries. Across the 51 non-zero campaign slots, these three profiles independently attain the minimum count for each of MODL, MESH, TEX and SND. The section-1/5 unique record counts are 9, 10 and 10 respectively; records are not necessarily individual live craft, and group size/spawn timing semantics remain separate.

**Coverage limit:** these are source-reference counts, not canonical Asset counts or canonical dependency-edge counts. Fixed cockpit/HUD/map/fonts, palette subresources, weapon/effect data, runtime-created rescue objects and other implicit references are outside this script's coverage. It does not classify factions or establish complete slice qualification. The profile is reproducible with `node local/research/p2-01/profile-candidates.ts`; JSON and command output remain in the same ignored local directory. Existing `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` also passes with zero reference failures.

### Selected-mission field inventory (Confirmed structure)

P2-09 counts every field position of the slice mission, group 0 / slot 1 (SCEN 3019), read through the product source chain (`openVerifiedSource`) from the developer's CloneCD image. Counts are of non-zero values unless stated; no names, coordinates or other values are reproduced.

| Structure | Counts | Result |
|---|---|---|
| SCEN block | 1,934 bytes, 65 relocations, all aligned within their records | Header and section tables, section-0 pointers and strings, records, record name lists and strings, the section-2 region up to section 3, sections 3 and 5, member arrays, the section-6 table and its layout arrays cover every byte |
| Header | 0x00 equals 0x04; 0x0C is zero | Section counts 19, 9, 1, 3, 0, 3, 2 for sections 0–6 |
| Section 0 | 19 names, at most 11 bytes | All printable ASCII, NUL-terminated, relocated |
| Section 1 and section 5 records | 9 unique records: both templates and all 3 distinct members alias section-1 records; 6 member slots, each section-5 entry listing one record twice | 7 non-zero kinds, 2 zero-kind records (one of them a template) |
| Record words | +0x00: 7; +0x04/+0x08: 1; +0x10: 3; +0x1C: 1; +0x3C: 3; +0x44: 5; +0x48: 1; +0x54: 1; +0x58: 1; +0x5C: 3; +0x70/+0x74/+0x78: 4 | Every other word is zero in all 9 records, including position +0x24–+0x2C, +0x40, +0x0C, +0x30, +0x38, +0x4C/+0x50 and all bytes outside the documented fields |
| Record names | 1 candidate list, 4 candidates, 5–6 bytes each | All printable ASCII, NUL-terminated, relocated; none is a section-0 pointer |
| Pointer targets | +0x3C → section-5 entries (3, each the entry listing that record); +0x44 → section-3 element starts (5); +0x48 and +0x58 → the kind-1 record (1 each); +0x54 → the section-2 element start (1) | Every pointer field is relocated and targets the start of the expected structure |
| Section 2 | 1 element: the event trigger referenced by +0x54 | 3 ranges; spawn-pair pointer and count are zero. The trigger header, the ranges, each range's message-pointer cells and their NUL-terminated printable ASCII strings partition the region up to section 3 without gaps or overlaps |
| Section 3 | 3 rectangles | All referenced by +0x44 |
| Section 5 | 3 entries; +0, +4, +8, +12, +16 non-zero in all; +20/+24 zero | Two entries share one layout; member count never exceeds the layout count |
| Section 6 | 2 entries, 2 elements each | Both referenced as layouts; element 0 of both is the zero vector and the count read after the table is zero, so the load-time swap leaves the data unchanged |
| SCCT | 1,506 bytes, 18 relocations; 3 groups × 18 slots; 5 wingman records | Wingman words: +0x00 (kind `0x2` in all), +0x04/+0x08 (one name each, at most 8 bytes, printable ASCII), +0x70, +0x74; all others zero |
| M2ID 10649 | 96 bytes, 22 slots | Referenced slots 0, 1, 7, 8, 14 and 17, all non-zero, naming 5 distinct MODL entries (slots 0 and 1 share one) |

**Confirmed (member back-references across all missions):** over the 52 SCEN entries, every section-5 member record has a non-zero +0x3C; 317 of the 336 section-1 back-references point at the only section-5 entry listing that record, and 19 do not. All 191 layout pointers target section-6 entries; 11 entries have more members than layout elements, so the modulo wraps.

**Conclusions for the slice mission (Confirmed by data and code):** header 0x00/0x04 define the world extent used by default placement and the world rectangle; sections 3, 5 and 6 and record fields +0x3C, +0x44, +0x48, +0x54 and +0x58 are in use; position fields and +0x40 are zero, so every placement comes from a rectangle, an anchor or a section-5 layout. The section-6 load transform has no effect on this mission's data. Section-5 layout offsets are runtime units, unlike the reference units of records and rectangles.

Evidence (ignored): `local/research/p2-09/field-inventory.ts` with `field-inventory.json`, `pointer-targets.ts` with `pointer-targets-3019.json`, `member-backrefs.ts`, `section2-trigger.ts` and `section2-coverage.ts`; read-only Ghidra probes `local/research/p2-09/ghidra/Probe.java` with `probe-1.txt`–`probe-5.txt`, and the earlier decompiled exports in `local/research/`.

### Independent field comparison and Core load (P2-12)

[P2-12 subtask 18](../../plan/p2/12/subtasks/18-mission-comparison.md#完成证据), 2026-10-07, on the P2-12 candidate (commit `97b70de`, converter version `osr-import.graphics-2.logic-1.audio-1.models-2`). A local script reads SCCT, SCEN 3019, M2ID, MODL, MESH, TEX and SND itself, from §2–§4, [hud §3](./hud.md#3-id-lists-confirmed-structure), [mesh](./mesh.md), [textures](./textures.md#2-image-record-36-bytes-confirmed) and [audio](./audio.md#1-snd-digital-sound-effects-confirmed-on-all-37-entries); it shares only the verified disc and IMFAT readers, not the project's format parsers, converters or classification tables. Script: ignored `local/research/p2-12/mission/mission-check.ts`. Only counts and Asset IDs are recorded.

- **Rule inputs from other evidence:** factions from the [player target modes](./executable.md#player-target-modes-and-enemy-classification) and the player's own kind bit; base interaction from the [interaction-kind mask](./executable.md#bounded-slot-1-interaction-kind-evidence); map axes from [B-001](../behavior/B-001-strategic-map.md#地图框架与坐标轴高概率p2-09) and the [map projection](./executable.md#strategic-map-projection), whose runtime check later confirmed them (U-032); centre and half extent from the [world grid](./executable.md#mission-placement-scheduling-and-world-grid).
- **Fail-closed source fields (Confirmed for this mission):** the 199 words of the 9 SCEN records and 5 SCCT wingman records that the content model does not convert, or allows only at a default, are all zero; the +0x54 trigger, sections 4–6 and the member back-references satisfy the rules of the [field inventory](#selected-mission-field-inventory-confirmed-structure).
- **Field comparison:** a source table of 73 rows (35 verbatim, 18 transformed, 14 project identity, 6 research-derived) gives exactly one row to each of the 72 leaf paths of the three logic payloads and to one more path that is an empty array in every item. Mission 271, craft-type table 30 and wingman roster 106 leaf fields equal the independent reading, with no difference; the 15 counts and 3 payload sizes equal the P2-09 record.
- **Model bindings:** the 6 craft-type entries resolve to 5 model Assets; each model's full content (part flags and colours, textures, complete geometry bytes and empty sound slots) equals exactly one of the 19 MODL entries, the one its M2ID slot names, and the 19 entries are pairwise different. The 15 TEX and 13 SND references map one-to-one to image and sound Assets with equal dimensions and pixel indices, or equal rate, channel and frame count.
- **Core load:** the pure `loadMission` called twice on freshly decoded payloads gives 418 leaf fields equal to the independent expectation (player claim, groups and members, spawn regions, coordinates and map frame, craft types, factions, models, base interaction and wingman options), and the two results are deep-equal. No randomness or clock was read, and no tick ran.

These results agree with the records above and add no new format fact; U-022 and U-023 are unchanged.

### Selected-mission instantiation (P3-02/03)

The objects that SCEN 3019 and SCCT 3123 produce under the code rules of [spawn queue](./executable.md#spawn-queue-p3-0203), [record defaults](./executable.md#record-defaults-p3-0203), [names](./executable.md#names-p3-0203) and [instantiation](./executable.md#instantiation-p3-0203). A local script derives them from the archive with the shared IMFAT reader only, not with the project's content model or Core (`local/research/p3-02/spawn/derive.ts` and `activity.ts`); only counts, record and entry indices and clock units are recorded. Confirmed by data and code; the runs of P3-02/10 confirmed the list at runtime for selectors 0 and 1 (sources, order, counts, timing, placement supports and the +0xDC/+0xE0/+0xE4 defaults; names and activity were not checked), see the [runtime check](./executable.md#runtime-check-p3-0210).

No record of the mission has a limit, a repeat, a non-zero +0x80, a trigger route or a probability other than the default, so every entry fires once and posts all its requests:

| Order | Source | Kind | Objects | Due (clock units) |
|---|---|---|---|---|
| 1 | Section-1 record 0 | 1 | 1 | 0 |
| 2 | SCCT record s − 1, only with a wingman selector s ≥ 1 | 2 | 1 | 0 |
| 3 | Section-1 record 3: 2 requests | 0x80 | 2 | 0 |
| 4 | Section-1 record 7: 4 requests | 0x20000 | 4 | 0 |
| 5 | Section-1 record 8: 35 requests | 0x4000 | 35 | 0 |
| 6 | Section-5 entry 0 (template record 1): 2 requests × members record 4, record 4 | 0x80 | 4 | 0 |
| 7 | Section-5 entry 1 (template record 1): 2 requests × members record 6, record 6 | 0x100 | 4 | 0 |
| 8 | Section-5 entry 2 (template record 2): 3 requests × members record 5, record 5 | 0x80 | 6 | 19,200 (300 s) |

- **Totals:** 56 objects without a wingman (kind 1: 1, 0x80: 12, 0x100: 4, 0x20000: 4, 0x4000: 35) and 57 with one (plus kind 2: 1). The enemy class (`0x93780`, here equal to the counted mask `0x91780`) has 16 objects: 10 at time 0 and 6 at 19,200, as in [mission result](./executable.md#mission-result-success-path-and-campaign-restart-p3-0104). Selectors 1–5 choose SCCT records 0–4; any larger selector chooses record 4.
- **Timing:** rows 1–7 are due at 0 and are instantiated together, in the order of the table, request by request and member by member, at the first queue check whose elapsed time is positive: the build frame's own check (Confirmed at runtime, P3-02/10; see [spawn queue](./executable.md#spawn-queue-p3-0203)). Row 8 follows at the first check whose elapsed time exceeds 19,200, all three requests in that check. Each section-5 request has one layout cycle (no entry has more members than layout elements), so it computes one anchor from its template's rectangle.
- **Defaults at the build:** all 9 section-1 records are filled. +0x78 is drawn for the 5 records where it is zero, and for the wingman record on its first fill in a program run; +0x70/+0x74 take (0 + 3) × 1 = 3 in the 5 records where they are zero; +0x60–+0x68 become 100 in every record, the wingman record included. One probability draw per firing: 7, or 8 with a wingman.
- **Counters afterwards:** record +0x18 equals the object count for records 0, 3, 7 and 8 and stays 0 for the member records 4, 5 and 6; entry +20 equals the request count. Record 0's counter becomes 1 when the player is instantiated, which enables the +0x58 AI target that names it (`0x68018`).
- **Names:** kinds 1, 0x80, 0x100 and 0x4000 take type names from CINF 4037; the wingman takes its candidate; the four kind-0x20000 objects take candidates 0, 1, 2 and 3 of record 7 in instantiation order. No pool name, fallback or name draw occurs.
- **Order and first target (P3-06/05):** the player is the first object instantiated, in this mission and in all 52 (one kind-1 record each). Its `0x68050` draws twice (a world-default goal; +0x58 and +0x5C select nothing), so its instantiation draws five times: placement 2, `0x3060c` 1, `0x68050` 2 (Confirmed, code and data). Record 3's two kind-0x80 craft are the only enemy-mode objects active at time 0, so the automatic target selection after the player's first controllable update picks the nearer of them, provided both have reached state 7 by then (Likely; [initial flight state](./executable.md#initial-flight-state-p3-0605)).
- **Activity at instantiation:** the player, the wingman and record 3's two craft (both anchored on the player, at most 599 away per axis) are active; every section-5 object is parked, because its anchor rectangle lies farther than 7,500 plus a 600 margin (the one-time world move of either point) from the player's rectangle; record 7 and record 8 objects are active or parked depending on their placement draws.
