---
type: format
status: draft
phase: P3
updated: 2026-10-09
related: [U-001]
---

# Communications menus (`COMM.NOB` TABL)

Container format: [IMFAT](./imfat.md). Confidence labels as defined in the IMFAT doc. Structure, counts and addresses only; no original text or field values.

`COMM.NOB` holds seven TABL entries ([imfat](./imfat.md#5-entry-types)). This document covers the five menu tables the flight loop loads ([data closure](./executable.md#data-loaded-by-the-loop-p3-0110), item 24): 2003, 2005, 2007, 2009 and 2013. TABL 2001 and 2011 are name lists for the communications faces, which the P3-01 closure leaves out of the slice (G-03); they are not described here. All five menu entries have directory flags 0x50, so they are loaded when the archive opens and never released ([imfat](./imfat.md#2-directory-entry-36-bytes-confirmed-flags-meaning-unconfirmed)).

Research of P3-03 [subtask 04](../../plan/p3/03/subtasks/04-comm-hud-text-research.md), 2026-10-09: read-only static analysis on a private copy of the Ghidra project (`-noanalysis -readOnly`), and a survey of the five entries read through the verified source chain that prints only offsets, lengths, counts and byte classes.

## 1. Item list (Confirmed)

Every menu table is a list of 8-byte items starting at offset 0. There is no header and no count field.

| Offset | Type | Role | Evidence |
|---|---|---|---|
| +0x00 | u32 ptr | Item text: a NUL-terminated byte string in the same block | Confirmed: read by every builder (§2); relocated in every item |
| +0x04 | u32 | Item value. Its role depends on the table (§3); 0 marks the last item | Confirmed: §3 |

**List rule (Confirmed, code):** each builder reads the items in order with a stride of 8. It stops after the first item whose +0x04 is 0 and includes that item in the menu as its last entry. TABL 2009 is read differently: only item 0's text (§2).

**Block layout (Confirmed, data, all five entries):**

- the item array comes first;
- the texts follow in item order, each starting right after the previous NUL;
- the last text ends exactly at the end of the block, so there are no gaps, overlaps, shared texts or trailing bytes;
- the relocation table lists exactly the +0x00 position of every item, in ascending order.

In TABL 2009, the single item's +0x04 is 0, so its list also ends at item 0.

## 2. Builders and selection (Confirmed, code)

The communications handler `0x27b44`, called by the flight key handler `0x264a0`, drives the menus. It calls all three builders, and `0x2c850` also calls `0x2c9d0`. Which state follows which choice, and what the commands do, are rules for P3-10 and P3-08. Only the reading of the tables is recorded here.

| TABL | Builder | When it is used | Value at +0x04 |
|---|---|---|---|
| 2007 | `0x2c850` | Key `c` in flight, while subsystem slot 0xD of the object `0x264a0` passes is not in state 2 (`0x52ac4`) | Kind mask |
| 2009 | `0x2c9d0` | When the object list for a chosen 2007 mask is built: item 0's text becomes the list's last entry | Not read |
| 2013 | `0x2cbb4` | Command menu for a target whose runtime kind (object +4) is exactly 2 | Command code |
| 2003 | `0x2cbb4` | Command menu for a target whose kind is in the mask `0x68000`, when `0x394c4(0, target)` and `0x33390()` both return 1 ([access and predicate logic](./executable.md#bounded-slot-1-interaction-kind-evidence)) | Command code |
| 2005 | `0x2cbb4` | Command menu for any other target | Command code |

Each builder loads its table through `0x6affc` by a constant ID. It keeps the block pointer in a local variable, copies item texts and values into a new menu, and drops the reference with `0x6b03c` before returning. A menu is an array of 56-byte entries built by `0x6a860` (entry size 0x38) and `0x6a8f0`. Each entry holds a 48-byte text field at +0x00, a kind byte at +0x30 and the value at +0x34.

The menus are read by:

- `0x27e10`: key matching (§4);
- `0x27b44`: the chosen entry's value;
- `0x2ccc4`: release of object references held by entries of kind 1;
- `0x27e68`: a getter for the menu panel `0x4da6e`, which draws the entries (§4).

The object list built by `0x2c9d0` holds the objects of the chosen kinds; each entry's text is made by the code from the object's name. Only its last entry comes from TABL 2009.

## 3. Item values (Confirmed, code)

| TABL | +0x04 | Use | Evidence |
|---|---|---|---|
| 2003, 2005, 2013 | u32 command code; 0 for the last item | The chosen entry's value goes to `0x2c7fc`, which posts a message of type 0x100 with the code at +0x10 to the target. The message dispatcher stores it at the target's +0x184 (`0x21353`). A value of 0 posts nothing and closes the menu. Code 9 also calls `0x333b4` ([cut-scenes and loop transitions](./executable.md#cut-scenes-and-loop-transitions-p3-0108)) | 32-bit loads and stores throughout. The base handler `0x3bed0` compares +0x184 unsigned (above 6, below 8, equal to 9). The AI handler `0x61f20` dispatches codes 1–7 through a jump table with an unsigned bound (`JA`) |
| 2007 | u32 kind mask; 0 for the last item | `0x2c850` passes each non-zero mask to `0x2c9d0` and leaves a category out of the menu when its object list is empty; the chosen entry's mask goes to `0x2c9d0` again. `0x2c9d0` walks the objects of every kind in the mask (`0x5261c`, lowest set bit first) | Bit iteration and masking only |
| 2009 | Not read | `0x2c9d0` reads only +0x00 of item 0 | Zero in the baseline |

**Observed (Confirmed, data):** every command code other than the last item's has bit 31 clear. Every 2007 mask other than the last item's is non-zero, uses only bits 0–19 (the 20 kind bits) and shares no bit with the other masks.

## 4. Text rules (Confirmed)

- **Termination:** every text pointer targets an offset inside the block, and every text ends with a NUL inside the block (data, all 18 items).
- **Length:** each builder copies the whole text, up to and including the NUL, into the 48-byte text field of a menu entry. The copy has no length check. The builders set the kind byte and the value, which follow the field, before copying. A text of more than 47 bytes before the NUL would therefore overwrite them, so 48 bytes including the NUL is the largest text the menus support (code, buffer layout).
- **Byte 0:** in its copy, each builder replaces byte 0 with a colour index set by the code: 0x0F for an ordinary entry, 0x0C for the last entry, and other constants for the entries of the object list. The stored byte 0 is never displayed or compared.
- **Byte 1, the key:** `0x27e10` compares the pressed key with byte 1 of each entry in order, both upper-cased through `0x754d9`, and takes the first match. The key comes from the data in every item of 2003, 2005, 2013 and 2009, and in the last item of 2007.

  For the other 2007 items, `0x2c850` replaces bytes 0 and 1 and copies the text from byte 2 onwards. Byte 1 becomes a key the code generates from the entry's position among the shown categories: a character from the 36-entry table at `0x174b40` (count `0x174b64`), or the position's decimal digits from 36 on. The stored bytes 0 and 1 of those items are therefore never displayed.
- **Display:** `0x4da6e` draws each entry in the colour that byte 0 selects (0x0A blinks to 0x0F). It has two layouts, chosen by one of its arguments:
  - when the argument is 0, the text from byte 1 onwards;
  - otherwise, byte 1, a space, then the text from byte 4 onwards, so bytes 2 and 3 are not drawn.

  Which panels use the second layout was not traced (P3-13). Either way, the panel cuts the text to its width in characters (`0x758ae`) and draws it with `0x59f90`, which draws every byte as its glyph ([hud §1.1](./hud.md#11-glyph-layout-and-character-maps-likely)). No byte is interpreted as a control or format code.
- **Character range:** the code accepts any non-zero byte (1–255) before the NUL and treats every byte alike, apart from the upper-casing of byte 1 for key matching. In the baseline (data), every byte before the NUL is printable ASCII (0x20–0x7E), with no control bytes, no bytes of 0x80 or above and no `%`, and byte 1 is a letter or digit in every item. These are observations, not constraints of the format.

**Load transforms (Confirmed, code):** none beyond the IMFAT relocation of item +0x00. The builders only read the blocks; they change byte 0 and byte 1 in their own copies.

## 5. Observed sizes (Confirmed, data)

| TABL | Block bytes | Items, including the last | Longest text, bytes without NUL |
|---|---:|---:|---:|
| 2003 | 53 | 3 | 10 |
| 2005 | 36 | 2 | 10 |
| 2007 | 77 | 4 | 13 |
| 2009 | 17 | 1 | 8 |
| 2013 | 166 | 8 | 15 |

In total there are 18 items. Each block holds one relocation per item.

**Zero in the baseline (Confirmed, data):** the last item's +0x04 in every list, which is the list terminator, and TABL 2009 +0x04, which is not read; under the [field rules](../../plan/p3/03/spec.md#字段处理规则) (rule 6) a non-zero value there is unsupported. No other position is zero in every instance.

## 6. Static coverage (Confirmed method)

- **IDs:** each of the five IDs occurs as an immediate exactly once in the image, at its builder's load call. The [P3-01/10 ID scan](./executable.md#data-loaded-by-the-loop-p3-0110) found 2003, 2005 and 2013 in `0x2cbb4`, 2007 in `0x2c850` and 2009 in `0x2c9d0`.
- **Builders:** raw scans of relative calls find `0x2cbb4` called twice and `0x2c850` once, all from `0x27b44`. They find `0x2c9d0` called from `0x27b44` and `0x2c850`.
- **Blocks:** the block pointers are never stored outside the builders.
- **Menu fields:** the readers of the menu entries' +0x30 and +0x34 are those listed in §2.

Not covered: accesses through pointers computed from other bases.

Evidence (ignored): `local/research/p3-03/comm-hud-text/`. It holds `ghidra_scripts/CommProbe.java` and `probe.sh` with the outputs `out/d1`–`out/d8`, `out/w1`, `out/x1`–`out/x16` and `out/s1`–`out/s2`, and `structure.ts` and `extra.ts` with `out/structure.json` and `out/extra.json`.
