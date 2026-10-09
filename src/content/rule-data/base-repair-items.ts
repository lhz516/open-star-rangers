import { invalid, readTuple, readU32, records } from './rule-data-fields.ts';

// Canonical content of `data/base-repair-items` (P3-03 spec S-07): only the +0x6C subsystem selector of each TABL 10165
// record, with the structure of docs/original/formats/hud.md (TABL 10165 selectors). The rest of the records is base
// interior content (G-05) and is not carried. What the slots and repairs mean is P3-10's (U-030).

/** The record count the program fixes with the EXE word `0x174e18`. */
export const BASE_REPAIR_ITEM_COUNT = 11;

export interface BaseRepairItems {
  /** Record +0x6C u32, in record order: a subsystem slot 0–31 or a group 33 or 34, the domain the code accepts. */
  readonly subsystemSelectors: readonly number[];
}

function readSelector(value: unknown, path: string): number {
  const selector = readU32(value, path);
  // 0–31 address the 32-entry slot tables; 33 and 34 select the two groups.
  return selector < 32 || selector === 33 || selector === 34 ? selector : invalid(path, 'must be 0 to 31, 33 or 34');
}

const readItems = records<BaseRepairItems>({
  subsystemSelectors: (value, path) => readTuple(value, path, BASE_REPAIR_ITEM_COUNT, readSelector),
});

/** Strictly reads `data/base-repair-items` content into frozen data isolated from `value`. */
export const readBaseRepairItems = (value: unknown, path = 'baseRepairItems'): BaseRepairItems => readItems(value, path);
