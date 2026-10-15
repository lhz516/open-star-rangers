---
type: format
status: draft
phase: P3
updated: 2026-10-14
related: [U-001]
---

# Communications menus (`COMM.NOB` TABL)

Container format: [IMFAT](./imfat.md). Confidence labels as defined in the IMFAT doc. Structure, counts and addresses only; no original text or field values.

`COMM.NOB` holds seven TABL entries ([imfat](./imfat.md#5-entry-types)). This document covers the five menu tables the flight loop loads ([data closure](./executable.md#data-loaded-by-the-loop-p3-0110), item 24): 2003, 2005, 2007, 2009 and 2013. TABL 2001 and 2011 are name lists whose positions give the communications name indices ([RX1](./executable.md#rx1-helpers--confirmed-code-and-data)); P3-03 revision 2 imports them into `data/comm-messages`, and [§9](#9-name-lists-tabl-2001-and-2011-p3-1029) gives their structure. All five menu entries have directory flags 0x50, so they are loaded when the archive opens and never released ([imfat](./imfat.md#2-directory-entry-36-bytes-confirmed-flags-meaning-unconfirmed)).

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

The object list built by `0x2c9d0` holds the objects of the chosen kinds in state 7 and above, with a counted reference per entry ([§7.3](#73-builders-filters-order-and-references-confirmed-code)); each entry's text is made by the code from the object's name. Only its last entry comes from TABL 2009.

## 3. Item values (Confirmed, code)

| TABL | +0x04 | Use | Evidence |
|---|---|---|---|
| 2003, 2005, 2013 | u32 command code; 0 for the last item | The chosen entry's value goes to `0x2c7fc`, which posts a message of type 0x100 with the code at +0x10 to the target. The message dispatcher stores it at the target's +0x184 (`0x21353`). A value of 0 posts nothing and closes the menu. Code 9 also calls `0x333b4` ([cut-scenes and loop transitions](./executable.md#cut-scenes-and-loop-transitions-p3-0108)) | 32-bit loads and stores throughout. The base handler `0x3bed0` compares +0x184 unsigned (above 6, below 8, equal to 9). The wingman's active consumer `0x614a8` dispatches codes 1–8 through a jump table (`0x61488`) with an unsigned bound and ignores 0; its parked consumer `0x61f20` dispatches codes 1–7 (`0x61f04`) with an unsigned bound (`JA`) (P3-08/04) |
| 2007 | u32 kind mask; 0 for the last item | `0x2c850` passes each non-zero mask to `0x2c9d0` and leaves a category out of the menu when its object list is empty; the chosen entry's mask goes to `0x2c9d0` again. `0x2c9d0` walks the objects of every kind in the mask (`0x5261c`, lowest set bit first) | Bit iteration and masking only |
| 2009 | Not read | `0x2c9d0` reads only +0x00 of item 0 | Zero in the baseline |

**Observed (Confirmed, data):** every command code other than the last item's has bit 31 clear. TABL 2013 (the wingman menu) has 8 items: items 0–6 carry codes 1–7 in that order and item 7 code 0 (P3-08/04, counts and codes only).

**Wingman commands (Confirmed, code; P3-08/04):** `0x2c7fc` is the only poster of type 0x100 and the communications handler `0x27b44` its only caller; the dispatcher also stores the sender (the player) at the target's +0x188, which no rule reads. +0x184 is a single slot: a later message overwrites an unconsumed code, and an overwritten command is never executed or answered. The wingman consumes it at its next due AI update — through `0x614a8` while active (called by the wingman handler `0x610c8`) or `0x61f20` while parked (called only by the parked handler `0x62250`) — and clears it after the effect and the reply; while the friendly-fire accumulator exceeds the AICO threshold (and, for the active consumer, while there is no player) the code is kept, not refused. The effects of codes 1–7, which differ between the two consumers, and the replies are in [executable](./executable.md#wingman-commands-and-the-friendly-fire-accumulator-p3-0804). The base handler `0x3bed0` reads and clears +0x184 for bases (P3-10). Every 2007 mask other than the last item's is non-zero, uses only bits 0–19 (the 20 kind bits) and shares no bit with the other masks.

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

## 7. Menu state machine (P3-10/01)

Research of P3-10 [subtask 01](../../plan/p3/10/subtasks/01-menus-delivery-research.md), merged by subtask 06, 2026-10-14: read-only static analysis on a private copy of the Ghidra project (`-noanalysis -readOnly`), register-dependent conclusions from native instructions, callers and field accesses from raw scans of relative calls and of 32-bit displacements. Delivery of the chosen command, its consumers and the near-menu gate are in [executable](./executable.md#command-delivery-p3-1001). *Controller* = the player's controller block (player object +0x14, 0x1C0 bytes, created in `0x25f90`, initialised at `0x25fd0`); *page* = the left-display page `0x1a9dc8` ([D15](./executable.md#d15-left-display-pages--confirmed-code)).

### 7.1 Storage (Confirmed, code)

| Field | Type | Role | Writers | Readers |
|---|---|---|---|---|
| controller +0x19C | pointer to a menu array (§2) or 0 | The one open menu; its level is the page | `0x27b44` only; zeroed when the controller is created (`0x26030`) | `0x27b44`, `0x27e68` (panel getter) |
| controller +0x1A0 | node handle, **not counted** | The communications object: the object whose command menu is or was last built | `0x27b44` only (`0x27bfd`, `0x27ca6`; 0 at `c`, `0x27db6`) | `0x27b44` (arguments of `0x2cbb4`, `0x2c7fc`, `0x333b4`) |
| controller +0x1A4 | u32 page | Page saved when the menu opens | `0x27b44` only (`0x27dc5`) | `0x27b44` close paths |

**Coverage:** a raw scan of every initialised block for the 32-bit displacements 0x19C, 0x1A0 and 0x1A4, which also covers bytes Ghidra had not disassembled, plus the instruction scan find no other access in game code (the remaining hits are stack offsets, a 0x24C-byte pilot-roster structure at `0x3acac`, and renderer or library structures larger than both the object and the controller). An 8-bit displacement cannot reach these offsets. Not covered: accesses through a base already advanced into the controller (none was seen; the only `LEA` of these fields is `0x27b54`, for `0x2ccc4`). Every *only* below about these fields carries this limit, as in §6.

The incoming-message page saved by `0x4e418` (`0x175efc`) and the Warp page saved by `0x3f158` (`0x187020`) are separate globals; the three saves share no field.

### 7.2 Entry and dispatch by page (Confirmed, code)

`0x264a0` calls `0x27b44` (at `0x264b5`, key in AL, the player's handle in EDX, the controller in EBX) before its own compare tree; nothing else calls it. It reads the page (`0x4ce10`) and compares it unsigned:

| Page | On a key |
|---|---|
| 2 (category menu) | `0x27e10` matches the key; no match → not consumed. Match → value := entry +0x34 (a kind mask, or 0 for the exit entry); release the menu (`0x2ccc4`, +0x19C := 0). Value 0 → **close**. Otherwise build the object list `0x2c9d0(mask)` into +0x19C. No list (empty at this moment) → **close**. Count > 2 (signed) → post page 3. Count ≤ 2 (one object and the exit entry) → **skip**: +0x1A0 := entry 0's value, release the list, build the command menu `0x2cbb4(+0x1A0)`; built → post page 4, not built → **close** |
| 3 (object list) | Match → +0x1A0 := entry +0x34 (an object node, or 0 for the exit entry); release the list. +0x1A0 = 0 → **close**. Otherwise build the command menu; built → post page 4, not built → **close** |
| 4 (command menu) | Match → code := entry +0x34; release the menu. Code ≠ 0 → `0x2c7fc(+0x1A0, code)`; then, **whatever `0x2c7fc` returned**, code 9 → `0x333b4(player, +0x1A0)` (`0x27d4e`–`0x27d68`). Then post the saved page +0x1A4 |
| any other (0, 1, 5; 6 never reaches here) | Only `c` (0x63, exact) and only while `0x52ac4(player, 13)` ≠ 2: +0x1A0 := 0, +0x1A4 := page, +0x19C := `0x2c850()`; a menu built → post page 2. **The key is consumed even when no menu is built**, and then neither the page nor the sound changes. **The previous +0x19C is overwritten without `0x2ccc4`** (`0x27db6`–`0x27dd0`): a menu hidden by a flush or covered by page 5 is abandoned, not released; if it was an object list, its entries' counted references are never dropped, so those nodes stay allocated for the rest of the program run (no rule reads them; they only leave pool reuse, §7.4) |

**Close** = +0x19C := 0 and post message 0x100000 with the saved page +0x1A4. Every post above is message 0x100000 with the page at +0x10; the dispatcher (`0x21457`) sets the page when it is not negative and always adds the presentation item for SND 10485. So an open, a level change, a close and a delivery each produce exactly one page message, and `c` without a buildable menu produces none.

- **No skip at the category level:** a category menu with one category and the exit entry is shown; `0x2c850` discards only a menu with the exit entry alone (count 1 → released, returns 0).
- **No shortcut from the player's target:** none of `0x27b44`, `0x2c850`, `0x2c9d0` or `0x2cbb4` reads the player object's +0x8C (`0x2c7fc` reads ps +0x8C, the player's own handle). The communications object +0x1A0 and the combat target +0x8C are independent. `0x2cbb4` and `0x2c850` are called only from `0x27b44`, `0x2c9d0` only from `0x27b44` and `0x2c850`, and `0x2c7fc` and `0x333b4` only from `0x27b44`.
- **Keys on pages 2–4:** `0x27e10` returns the first entry whose byte 1 equals the key, both folded through `0x754d9` (A–Z → a–z only); a count ≤ 0 matches nothing. An unmatched key, `c` included, passes to the flight compare tree; Esc is never consumed. The generated key of position 12 is `C`, so `c` would select position 12 of a long list (unreachable in the selected mission, §8).
- **Stale +0x1A0 after a close:** a command-menu close does not clear +0x1A0, only the next `c` does; page 4 is reached only through a path that has just written it, so the stale value is never used.

### 7.3 Builders: filters, order and references (Confirmed, code)

- **Category menu `0x2c850`:** TABL 2007 items in order up to the item whose value is 0. For each non-zero mask it builds the object list with `0x2c9d0` and releases it at once; an empty list leaves the category out. Shown categories get generated keys by their position among the shown ones (1 first). Emptiness is evaluated with the object-list filter, at the moment `c` is handled.
- **Object list `0x2c9d0(mask)`:** walks `0x5261c(mask)` (ascending kind bit, allocation order within a kind) and admits a node when `0x52680` reports it valid (node and object pointer non-zero) and its state byte +3 ≥ 7 (signed `JL 7` after zero-extension). **No other filter:** activity (active, parked 0 and docked 3 are all admitted), the dead flag +0xD8, distance, faction, map visibility and the player's target are not read. Each admitted entry takes a **counted reference** (`0x52780`), kind byte 1, value = node, a generated key by position, and a text built from the separator at `0x170f98` and the name at +0x15C. Colour byte: 0x10 when activity is 1, otherwise 0x0A (blinking) when the threat stamp +0x17C ≠ 0, otherwise 0x0F (drawing: P3-13). Without entries the list is released and 0 returned; otherwise the exit entry from TABL 2009 item 0 is appended (kind 1, value 0, colour 0x0C).
- **Command menu `0x2cbb4(target)`:** 0 when `0x52680(target)` fails. Otherwise it chooses the table once, at build: kind exactly 2 → TABL 2013; kind in `0x68000` and `0x394c4(0, target)` = 1 and `0x33390()` = 1 ([near-menu gate](./executable.md#cd5-near-menu-gate-0x394c40-target--confirmed-code)) → TABL 2003; otherwise TABL 2005. It reads nothing else of the target.
- **Release `0x2ccc4`:** drops one reference for every kind-1 entry with a non-zero value, frees the array and clears the holder. Category and command entries hold no reference.

### 7.4 Object references and invalid objects (Confirmed, code; occurrence at run time Unconfirmed)

- While an object list is open its entries keep their nodes allocated. An object removed meanwhile (dispatcher message 0x20, `0x523cc`) keeps its entry, but its node's object pointer is cleared, so `0x52680` fails.
- On selection (page 3, or the page-2 skip) +0x1A0 receives the node **before** the list's references are released, and holds none itself. `0x2cbb4` fails for an invalid node and the menu closes.
- Until the command key the node is kept only by other holders (the kind list while the object lives, the player's target, AI references). When the object is removed and no holder remains, `0x53278` unlinks the node, clears its object pointer and returns the slot to the pool (`0x56784` marks it free and leaves its contents); `0x2c7fc` then finds it invalid and posts nothing. But `0x566dc` first reuses the most recently freed slot, so the next node allocation (any new object) takes it: +0x1A0 then resolves to that new object, and the command, and for code 9 the docking object, go to it.
- Code 9 still calls `0x333b4` when `0x2c7fc` posts nothing (§7.2), so the docking wait starts with whatever +0x1A0 holds; for an invalid object the next sub-state-3 check cancels it with a queue flush ([DK1](./executable.md#dk1-the-docking-wait-sub-states-35--confirmed-code)).

### 7.5 No refresh (Confirmed, code)

A menu is built only when `0x27b44` handles a key, and changed only there (§7.1). Nothing re-evaluates it afterwards: the category list does not follow later spawns or removals, the object list keeps removed objects (§7.4), and the command table chosen by `0x2cbb4` stays when the distance, the main-flow state or sub-state, or the target's activity change before the command key. In particular, the docking item of a TABL 2003 menu built at sub-state 0 can be chosen later in any sub-state: `0x333b4` writes sub-state 3 unconditionally, replacing for example sub-state 1 (the beacon wait after energy depletion, during which the player is alive and keys are polled; reachability of that sequence Likely, not observed).

The page-2–4 handler `0x4da28` only draws: when `0x27e68` returns no menu (no player handle, no controller, +0x19C null or count ≤ 0) it sets the page to 0 directly (`0x4da8f`), without a message or sound. It never rebuilds a menu.

### 7.6 Other contexts while a menu is open (Confirmed, code)

None of the following frees or clears +0x19C, +0x1A0 or +0x1A4; whether the menu becomes visible and usable again depends only on the page. Page writers (raw scan of `0x1a9dc8`): the setter `0x4cdf0` (from message 0x100000, the flush `0x2cd20`, Warp `0x3f158` ×3, message end `0x4e2a0`/`0x4e5a0` and message start `0x4e418`), the HUD reset `0x4ca80` (once from flight set-up, and inside `0x4cd68`, which writes the saved index back), and three handlers that set page 0 directly (`0x4da28` no menu, `0x4dc50` three failed draws, `0x4dcec` outside view 1).

| Context | Page | Menu after the context ends |
|---|---|---|
| Incoming message (`0x4e418`, view ≠ 1) | Saves the page in `0x175efc`, page 5 | The end restores `0x175efc` only while the page is still 5: the menu returns unchanged. On page 5 only `c` reaches the menu code; digits go to the flight tree. `c` there abandons the covered menu (§7.2) and opens a category menu with +0x1A4 = 5, so closing it returns to page 5 (with no message left, `0x4dc50` sets page 0 after three failed draws) |
| Warp (view 1, `0x3f158`) | Saves the page in `0x187020`, page 6 | Leaving restores it (0 when it was 5): a menu page returns with the same menu. Keys in Warp do not reach `0x27b44`; `0x4e418` does not take page 5 in view 1 |
| Page 5 covering a menu, then Warp | Warp saves 5; the message end during Warp finds page 6 and restores nothing | Warp exit writes 0; the menu stays stored but hidden (dormant) |
| Base interior (view 6) | `0x3f158` rebuilds the cockpit through `0x4cd68`, which keeps the page | Unchanged; docking and launch call neither `0x4cdf0` nor `0x2cd20`. Base keys do not reach `0x27b44`, so after launch an open menu is usable again as built. A message in the base takes page 5 as above |
| Map (view 8) | No page write | Unchanged; map keys do not reach `0x27b44` |
| Flush `0x2cd20` (docking cancels in sub-states 3/4, destruction `0x32d74`, beacon expiry, main-flow changes, mission start, `0x3bd94`) | Message end `0x4e2a0` (restores `0x175efc` if the page is 5), then page 0 | Dormant |
| Flush during Warp | Page 0, but `0x187020` still holds the menu page | Warp exit restores it: the dormant menu is visible and usable again (whether a flush can happen in Warp: Unconfirmed) |
| Player rescue | Flush first; `0x67b98` sets state 7 directly, so the controller is not re-created | Dormant |

A dormant menu is replaced (and abandoned) by the next `c`. +0x19C changes only together with a page message of `0x27b44`, and every other page write either restores an earlier page of the same menu or leaves pages 2–4.

### 7.7 Timing within a frame (Confirmed, code)

- Keys are read only in the player's update `0x25f90` (state 7, alive), at most one per keyboard poll, and polls are at least 18 units apart outside the base interior ([input polling](./executable.md#input-polling-p3-0201)); the original never handles two menu keys in one frame.
- The player is updated first in `0x20938`, so a menu built at a key reads the other objects as the previous frame left them. The menu fields change at once; the page changes in the same frame's message loop, so the next key (a later poll) sees both.
- A delivery's message 0x100 is posted before its page message and both are handled in the same loop; `0x333b4` acts at once, inside the player's update.

## 8. Selected-mission closure (P3-10/01)

Confirmed (code and data). Selected mission: SCEN 3019, every wingman selector. Data read directly from COMM.NOB, SCEN 3019 and SCCT with the shared IMFAT reader (not the project's COMM parser), together with the P3-02/03 instantiation derivation; output counts, booleans and key classes only.

- **Every allocation site:** the image has exactly ten relative calls to the allocator `0x520d4` and no 32-bit occurrence of its address, matching the [exhaustive allocation sources](./executable.md#player-target-modes-and-enemy-classification) (nine direct calls and the unreachable fragment constructor `0x25500`). Nine pass fixed kinds: `0x38780` kind 0x4000 (bit 14), `0x2b00c` bit 20, `0x25b0c` bit 21, `0x23ac8` and `0x23fdc` bit 22, `0x24ec4`, `0x25124` and `0x25500` bit 24, `0x3cb80` bit 25 ([inventory](./executable.md#remaining-direct-allocator-input-inventory)). The tenth, `0x67938`, takes the kind of a current SCEN section-1 or section-5 member record or of an SCCT wingman record.
- **Kinds that can exist:** the section-1 records of SCEN 3019 have kinds 0 (never scheduled), 1, 0x80, 0x100, 0x4000 and 0x20000; all 5 SCCT wingman records have kind 2. Every entry fires once (no limit, repeat, route, trigger or probability other than the default), so per kind at most 1 (kind 1), 1 (kind 2, only with a selector ≥ 1), 12 (0x80, 6 of them delayed to 19,200), 4 (0x100), 4 (0x20000) and 35 (0x4000) objects from records, plus any number of kind 0x4000 and bits 20–25 from the fixed-kind sites.
- **Categories:** TABL 2007 has three category items and the exit item. Every mask uses only bits 0–19, includes neither bit 0 (the player) nor bit 14, and the masks are pairwise disjoint. Against the kinds above, one category admits only kind 2 (at most 1 object), one admits only kind 0x20000 among the mission's kinds (at most 4 objects) and one admits none (always empty, never shown); no runtime-constructed kind falls in any category.
- **Bounds:** at most 2 categories are shown (generated keys 1–2) and at most 4 objects listed (generated keys 1–4; one object skips the list, §7.2); the exit entries of 2007 and 2009 carry data keys that fold to `x`.
- **Command menus:** in TABL 2003, 2005 and 2013 every item but the last has a digit 1–9 as its key, equal to its position, the keys are distinct after folding, and the last item's key folds to `x`. With 3, 2 and 8 items (§5) the command menus use the digits 1–2, 1 and 1–7.
- **Verdict:** every menu reachable in the selected mission is driven by the digits 1–9 and `x` alone. The conservative per-menu maxima, excluding the exit entry, are 2 categories, 4 objects and 7 commands, all below 9. These are per-menu counts: the wingman menu alone has 7 commands and the exit, 8 items (§5), so a bound holds per menu and no single figure covers every menu.
- **Spec-time record (archived):** the bounded check made while drafting the P3-10 spec (`local/research/p3-10/spec/comm-probe.ts` and `.out`) used the project's COMM parser and the totals of [scenario](./scenario.md) and found category hits of 1, 4 and 0 objects and the command codes of the three command tables. The independent reading above reproduces those numbers and adds runtime construction, every selector, member records and key classes; subtask 06 compared the two outputs again (`local/research/p3-10/spec/review-06.md`). The record needs no correction.

Evidence (ignored): `local/research/p3-10/menus/` (`ghidra_scripts/MenuProbe.java`, `probe.sh`, `out/d1`–`out/d35`, `out/s1`–`out/s2`, `out/b1`; `closure.ts` with `out/closure.out`).

## 9. Name lists TABL 2001 and 2011 (P3-10/29)

Read by `0x3c7bc` (TABL 2001) and `0x3c828` (TABL 2011), which load the entry on first use and return the position of the speaking object's name (+0x15C) in it, or −1 ([RX1](./executable.md#rx1-helpers--confirmed-code-and-data)).

- **Layout (Confirmed, code and data):** an array of u32 pointers from offset 0, ended by the first null pointer; each pointer is relocated and names a NUL-terminated name. The helpers walk the array 4 bytes at a time, compare each name with `0x7535e` (`strcmp`) and stop at the null pointer; the position counts from 0. There is no header or count field.
- **Data (Confirmed, data; P3-10/29 survey, counts only):** TABL 2001 holds 20 names and TABL 2011 19 (as RX1). Entry sizes 219 and 229 bytes. In both, every non-null pointer is relocated, the names start right after the null pointer, names are 1–11 bytes long and contain no byte of 0x80 or above.
- **Import:** `data/comm-messages` keeps both lists as byte strings in list order (P3-03 S-18). Limits: twice the observed maxima rounded up to a power of two, 64 names per list, 32 bytes per name and 512 bytes per entry; an empty name, which the baseline lacks and `strcmp` could match, is unsupported.

