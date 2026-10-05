---
type: format
status: verified
phase: P2
updated: 2026-10-05
related: [ADR-0003]
---

# Baseline disc image layout (CloneCD `.ccd`/`.img`)

Confidence labels: **Confirmed** = checked on the developer's baseline CloneCD file set (`STAR_RANGERS.*`, whose `.img` and `.sub` sizes and SHA-256 match the [manifest](../manifest.md#光盘镜像)) by the checks named in each section; **Likely** = consistent with those checks but not exhaustively verified; **Unconfirmed** = hypothesis.

This document records structure, counts and sizes only. It contains no bytes, text or decoded output from the original files. It describes one disc image, not the CloneCD or ISO9660 formats in general; the reader's supported subset, limits and error codes are owned by the [P2-02 spec](../../plan/p2/02/spec.md#支持布局).

- Reader: [`src/original-data/disc/`](../../../src/original-data/disc/), entry point `openDiscImage` in [`disc-image.ts`](../../../src/original-data/disc/disc-image.ts)
- Local check: `node tools/disc-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` ([tools guide](../../guides/tools.md#光盘镜像核对))
- Evidence: a read-only structure survey of the whole image (2026-10-04) and the local check run (2026-10-05); scripts and output stay in `local/research/p2-02/`.

## 1. File set (Confirmed)

The set has four files with one stem: `.ccd` (771 bytes), `.img` (174,530,160 bytes), `.sub` (7,123,680 bytes) and `.cue`. The local check opened all four and read 0 bytes from `.sub` and `.cue`.

## 2. Descriptor (`.ccd`) (Confirmed)

Printable ASCII; every line ends in CRLF (no bare LF), the last line included, and there are no blank lines. Sections, in order:

| Section | Keys |
|---|---|
| `[CloneCD]` | `Version` |
| `[Disc]` | `TocEntries`, `Sessions`, `DataTracksScrambled`, `CDTextLength` |
| `[Session 1]` | `PreGapMode`, `PreGapSubC` |
| `[Entry 0]` … `[Entry 3]` | `Session`, `Point`, `ADR`, `Control`, `TrackNo`, `AMin`, `ASec`, `AFrame`, `ALBA`, `Zero`, `PMin`, `PSec`, `PFrame`, `PLBA` |
| `[TRACK 1]` | `MODE`, `INDEX 1` |

`Point`, `ADR` and `Control` are written as `0x` hexadecimal, all other values as decimal. The values fit the spec's supported layout, as shown by the reader accepting the descriptor:

- version 3, one session, no scrambling;
- four TOC entries: first track, last track, lead-out and track 1, all in session 1 with ADR 1 and a data-track control;
- track 1 is MODE 1, `INDEX 1` is 0, and its start address is LBA 0;
- the lead-out address equals the image sector count.

## 3. Raw sectors (Confirmed)

The `.img` is exactly 74,205 raw sectors of 2,352 bytes; image sector *n* is LBA *n*. The survey checked every sector:

- every sector has the standard 12-byte sync pattern;
- every sector header carries the BCD MSF address of LBA + 150, so LBA 0 is 00:02:00;
- every sector's mode byte is 1.

EDC/ECC was not checked.

## 4. ISO9660 volume (Confirmed)

- **Descriptors:** two volume descriptors, the primary volume descriptor at LBA 16 and the terminator at LBA 17. There are no boot, supplementary or partition descriptors.
- **Primary volume descriptor:** logical block size 2,048, volume set size 1, volume sequence number 1, file structure version 1. Every checked field has matching little- and big-endian copies.
- **Volume space:** 74,193 blocks, 12 fewer than the image's raw sectors.
- **Path table:** 436 bytes. The reader checks the field but never reads the table.
- **Root directory record:** a valid 34-byte record whose extent lies inside the volume.

## 5. Directories and names (Confirmed)

The survey walked the whole tree from the root.

- **Tree:** 30 directories including the root, 7 of them at the top level, and 359 files. The deepest path has 4 segments.
- **Records:**
  - No record crosses a sector. All 30 directories together have 32 zero-length records, and each is followed only by zero bytes up to the end of its sector.
  - Every record has matching endian copies, volume sequence number 1, no extended attribute record, no interleaving and no System Use bytes.
  - Flags are only 0 (file) or 2 (directory): no hidden, associated, record-format, protection, reserved or multi-extent flags.
  - Every extent lies inside the volume.
  - Each directory starts with `.` and `..`, and the remaining identifiers are in ascending order.
- **Names:**
  - All 359 file identifiers end in version `;1`; none has a trailing `.` before the version.
  - No two names in a directory collide after removing the version.
  - Of 388 identifiers other than `.` and `..`, 386 are upper-case 8.3 names. The other 2 are directories under `CONTROLS/`, which the reader skips as unmatchable.

## 6. Observed maxima against the reader's limits (Confirmed)

| Quantity | Observed | Reader limit ([spec](../../plan/p2/02/spec.md#限值与预算)) |
|---|---|---|
| `.ccd` bytes | 771 | 1–65,536 |
| Image sectors | 74,205 | 18–449,850 |
| Volume descriptors | 2 | ≤ 16, terminator in LBA 16–31 |
| Directory length | 4,096 bytes | 2,048–65,536 bytes |
| Records in one directory, including `.` and `..` | 79 | ≤ 1,024 |
| Path segments | 4 | 1–8 |
| Largest file | 37,462,634 bytes | No separate file size cap: an extent must fit the volume, and one range read is at most 16,777,216 bytes, so larger files are read in parts |

Raw sector size (2,352), user data size and logical block size (2,048), mode 1 and the 150-frame MSF offset are exact format constants, not tunable limits.

## 7. Local check result (Confirmed)

`tools/disc-check.ts` passed on the baseline set.

- **Files:** all 50 rows of the manifest's game file table resolve through the reader and match in size and SHA-256. Files over 16 MiB are hashed in range reads of at most 16 MiB.
- **Reads:**
  - the metered `sourceReadBytes` was 144,178,371, equal to the sum of the requests the ports received and below the `.img` size;
  - `.sub` and `.cue` were read 0 bytes.

## 8. Scope

The checks cover only this file set. Other releases, other dumps of the same disc, BIN/CUE or ISO images, and multi-session or mixed-mode discs were not examined. The reader rejects layouts outside its supported subset; ADR-0003 defers them to P5.
