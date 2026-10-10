import type { DiscPath } from '../disc/disc-path.ts';
import type { ExecutableRegion, ExecutableRegionLocator } from '../source-mapping.ts';

// Addresses in the production executable as the original-data docs record them (docs/original/formats/executable.md
// §4), turned into region locators. Only addresses and lengths are here, never the bytes they hold.

/** The executable production regions are read from. */
export const PRODUCTION_EXECUTABLE = 'MAIN/SRANGERS.EXE';

/** The objects' base addresses in the documented address space (executable §4): object n is at index n − 1. */
const OBJECT_BASES = Object.freeze([0x1_0000, 0x2_0000, 0x14_0000, 0x17_0000]);

/** The 1-based object and offset of a documented address. */
export function objectOffset(address: number): { readonly object: number; readonly offset: number } {
  const index = OBJECT_BASES.findLastIndex(base => base <= address);
  return { object: index + 1, offset: address - OBJECT_BASES[index] };
}

/** A region locator, as plain mapping data, of `length` bytes at a documented address of the executable. */
export function executableRegionAt(address: number, length: number) {
  const { object, offset } = objectOffset(address);
  return { discPath: PRODUCTION_EXECUTABLE, entry: null, subresource: `le/${object}/0x${offset.toString(16)}/${length}` };
}

/** The region of `length` bytes at a documented address of the executable. */
export const executableRegionOf = (address: number, length: number): ExecutableRegion => Object.freeze({ ...objectOffset(address), length });

/** The canonical locator of `region` in the executable at `discPath`. */
export const regionLocator = ({ object, offset, length }: ExecutableRegion, discPath = PRODUCTION_EXECUTABLE as DiscPath): ExecutableRegionLocator =>
  Object.freeze({ discPath, entry: null, subresource: `le/${object}/0x${offset.toString(16)}/${length}` });
