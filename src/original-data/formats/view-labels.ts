import { VIEW_LABELS_FORMAT, VIEW_LABELS_LIMITS, type ViewLabels } from '../../content/hud/view-labels-payload.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { PayloadBlock } from './payload-block.ts';

// Directed reading of TABL 10399 item 8 into view labels (P3-03 spec, S-08; layout and evidence in
// docs/original/formats/hud.md, TABL 10399 labels). Only the pointer table and item 8's pointer and text are checked;
// items 0–7 (G-08) and 9–12 (use Unconfirmed) are neither converted nor checked.

/** TABL 10399 layout: 13 u32 string pointers, indexed by the player's sub-mode, then the strings. */
export const VIEW_LABEL_TABLE = Object.freeze({ labels: 13, pointerBytes: 4 });

/**
 * Structural limits of the entry (P3-03 spec, 限值与预算): twice the observed 242 bytes, rounded up to a power of two.
 * The label's text is limited by the payload's `VIEW_LABELS_LIMITS.textBytes`, which the reader shares.
 */
export const VIEW_LABEL_LIMITS = Object.freeze({ entryBytes: 512 });

const TABLE_BYTES = VIEW_LABEL_TABLE.labels * VIEW_LABEL_TABLE.pointerBytes;

/**
 * The NUL-terminated label at `offset` as a byte string of 0 to `textBytes` bytes, each kept as stored; at most one byte
 * past the limit is examined, and no relocation may overlap the label or its NUL.
 */
function readLabel(block: PayloadBlock, bytes: Uint8Array, offset: number, path: string): string {
  const limit = VIEW_LABELS_LIMITS.textBytes;
  const scanned = bytes.subarray(offset, Math.min(bytes.length, offset + limit + 1));
  const length = scanned.indexOf(0);
  if (length === -1) {
    if (scanned.length <= limit) block.invalid(path, 'the label has no terminating NUL');
    block.limit(path, 'textBytes', limit, scanned.length);
  }
  for (let at = offset - 3; at <= offset + length; at++) {
    if (block.isRelocated(at)) block.invalid(path, 'a relocation overlaps the label');
  }
  return String.fromCharCode(...scanned.subarray(0, length));
}

/** Parses the label of sub-mode 8 from the TABL 10399 entry `read` of `archive`. */
export function parseViewLabels(archive: DiscPath, read: ArchiveEntryRead): ViewLabels {
  const block = new PayloadBlock(archive, read, VIEW_LABEL_LIMITS.entryBytes);
  block.require(0, TABLE_BYTES, '/labels');
  const { subMode } = VIEW_LABELS_FORMAT;
  const path = `/labels[${subMode}]`;
  const target = block.target(subMode * VIEW_LABEL_TABLE.pointerBytes, 1, path);
  // Field rule 4: a pointer must target the start of its structure, a string after the pointer table.
  if (target < TABLE_BYTES) block.unsupported(path, 'the pointer targets the pointer table');
  const text = readLabel(block, read.bytes, target, path);
  return Object.freeze({ labels: Object.freeze([Object.freeze({ subMode, text })] as const) });
}
