import { FLIGHT_DATA_FORMAT, FLIGHT_DATA_LIMITS } from '../../content/flight/flight-data-content.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { PayloadBlock } from './payload-block.ts';

// EXIC 10211 (docs/original/formats/hud.md §3, textures.md §7): three relocated {pointer, count} headers at +0x00,
// +0x08 and +0x10, each naming a list of u32 EXPL entry IDs; the three lists are a format rule. EXPL
// (textures.md §7): 8 bytes without relocations, the u32 SND entry ID at +0 and the u32 ANIM entry ID at +4, and no
// other field. The game overwrites both EXPL fields with loaded blocks when it loads them; the stored values are the
// IDs. Whether the IDs name the mapped entries is the converter's ID chain check.

const LIST_HEADER_BYTES = 8;
const LISTS_BYTES = FLIGHT_DATA_FORMAT.explosionLists * LIST_HEADER_BYTES;
const LIST_POINTERS: ReadonlySet<number> = new Set(Array.from({ length: FLIGHT_DATA_FORMAT.explosionLists }, (_, list) => list * LIST_HEADER_BYTES));

/**
 * Structural limits (P3-03 spec, 限值与预算). `listEntryBytes`: the EXIC entry, observed 92 bytes, twice that rounded up
 * to a power of two. `listItems`: one EXIC list, shared with the `explosion-table` payload. `recordBytes`: an EXPL
 * entry, fixed by the format.
 */
export const EXPLOSION_LIMITS = Object.freeze({ listEntryBytes: 256, listItems: FLIGHT_DATA_LIMITS.explosionListItems, recordBytes: 8 });

/** The three EXIC lists of EXPL entry IDs in stored order. */
export type ExplosionLists = readonly [readonly number[], readonly number[], readonly number[]];

/** One EXPL record's entry IDs. */
export interface ExplosionRecord {
  /** +0: the SND entry of the explosion's sound. */
  readonly sound: number;
  /** +4: the ANIM entry of the explosion's animation. */
  readonly animation: number;
}

/**
 * Parses the EXIC entry `read` of `archive` into its three lists. Each list follows the header block, and the list
 * pointers are the only relocations, so the entry holds exactly three lists.
 */
export function parseExplosionLists(archive: DiscPath, read: ArchiveEntryRead): ExplosionLists {
  const block = new PayloadBlock(archive, read, EXPLOSION_LIMITS.listEntryBytes);
  block.require(0, LISTS_BYTES, '/lists');
  block.requireRelocations(0, read.bytes.length, LIST_POINTERS, '/lists');
  const list = (index: number): readonly number[] => {
    const path = `/lists[${index}]`;
    const { start, count } = block.array(index * LIST_HEADER_BYTES, 4, EXPLOSION_LIMITS.listItems, path, LISTS_BYTES);
    return Object.freeze(Array.from({ length: count }, (_, item) => block.u32(start + item * 4, `${path}/ids[${item}]`)));
  };
  return Object.freeze([list(0), list(1), list(2)] as const);
}

/** Parses the EXPL entry `read` of `archive`; it must be exactly 8 bytes. */
export function parseExplosionRecord(archive: DiscPath, read: ArchiveEntryRead): ExplosionRecord {
  const block = new PayloadBlock(archive, read, EXPLOSION_LIMITS.recordBytes);
  block.require(0, EXPLOSION_LIMITS.recordBytes, '/record');
  return Object.freeze({ sound: block.u32(0, '/sound'), animation: block.u32(4, '/animation') });
}
