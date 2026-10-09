import { BASE_REPAIR_ITEM_COUNT, type BaseRepairItems } from '../../content/rule-data/base-repair-items.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { PayloadBlock } from './payload-block.ts';

// Directed reading of the subsystem selectors of SR.NOB TABL 10165 (docs/original/formats/hud.md, TABL 10165 selectors)
// into `data/base-repair-items` content (P3-03 spec, S-07). The records start at offset 0 without a header; their count is
// the EXE's (`BASE_REPAIR_ITEM_COUNT`). Only each record's +0x6C is read. The images, +0x70–+0x78, the texts and the data
// after the records are base-interior content (G-05): they are neither converted nor checked (field rule 6).

/** Record layout (hud.md): 0x7C bytes, with the u32 subsystem selector at +0x6C. */
export const BASE_REPAIR_RECORD = Object.freeze({ bytes: 0x7c, selector: 0x6c });

/** Entry limit of TABL 10165: twice its 69,407 bytes (hud.md), rounded up to a power of two. */
export const BASE_REPAIR_ENTRY_BYTES = 262_144;

/** The domain the code accepts (hud.md): a slot 0–31 of the 32-entry slot tables, or the group values 33 and 34. */
const inDomain = (selector: number): boolean => selector < 32 || selector === 33 || selector === 34;

/** Parses the selectors of the TABL 10165 entry `read` of `archive`, in record order. */
export function parseBaseRepairItems(archive: DiscPath, read: ArchiveEntryRead): BaseRepairItems {
  const block = new PayloadBlock(archive, read, BASE_REPAIR_ENTRY_BYTES);
  block.require(0, BASE_REPAIR_ITEM_COUNT * BASE_REPAIR_RECORD.bytes, '/records');
  const subsystemSelectors = Array.from({ length: BASE_REPAIR_ITEM_COUNT }, (_, index) => {
    const path = `/subsystemSelectors[${index}]`;
    const selector = block.u32(index * BASE_REPAIR_RECORD.bytes + BASE_REPAIR_RECORD.selector, path);
    if (!inDomain(selector)) block.unsupported(path, 'the selector is outside the domain the code accepts');
    return selector;
  });
  return Object.freeze({ subsystemSelectors: Object.freeze(subsystemSelectors) });
}
