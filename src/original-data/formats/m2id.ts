import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { PayloadBlock } from './payload-block.ts';

// The M2ID craft type → MODL entry ID list (docs/original/formats/hud.md §3): a relocated {pointer, count} header and
// `count` u32 entry IDs, index = craft type. Slots may be 0; resolving them is the binding's job.

/** Structural limits of the M2ID entry (P2-09 spec, 限值与预算). */
export const MODEL_LIST_LIMITS = Object.freeze({ entryBytes: 4_096, ids: (4_096 - 8) / 4 });

/** Parses the M2ID entry `read` of `archive` into its MODL entry IDs by craft type. */
export function parseModelIdList(archive: DiscPath, read: ArchiveEntryRead): readonly number[] {
  const block = new PayloadBlock(archive, read, MODEL_LIST_LIMITS.entryBytes);
  const ids = block.array(0, 4, MODEL_LIST_LIMITS.ids, '/ids', 8);
  return Object.freeze(Array.from({ length: ids.count }, (_, slot) => block.u32(ids.start + slot * 4, `/ids[${slot}]`)));
}
