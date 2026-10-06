import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { ImfatEntry } from '../archive/imfat-rules.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError, type SourceLimitName } from '../source-error.ts';

// Pointer-safe reading of one IMFAT entry's data block for payload conversion (P2-09 spec, S-03). A pointer is valid
// only at a position listed in the entry's relocation table, and its target structure must lie wholly in the block;
// conversely, a listed position may not overlap any value the parser reads. Diagnostics name the entry and a structure
// path such as `/records[3]/craftType`, never bytes, names or values.

/** Longest name a payload may hold, in bytes without the terminating NUL. */
export const MAX_NAME_BYTES = 63;

/** `archive:/PATH#ID`: the location prefix of an entry's diagnostics. */
export const entryLocation = (archive: DiscPath, entry: Pick<ImfatEntry, 'id'>): string => `archive:/${archive}#${entry.id}`;

/** Fails with `limit-exceeded` before an entry larger than `limit` bytes is read. */
export function requireEntryBytes(archive: DiscPath, entry: ImfatEntry, limit: number): void {
  if (entry.size > limit) {
    throw new SourceError('limit-exceeded', entryLocation(archive, entry), 'the entry is larger than the payload limit',
      { name: 'payloadEntryBytes', limit, observed: entry.size });
  }
}

export class PayloadBlock {
  readonly #view: DataView;
  readonly #bytes: Uint8Array;
  readonly #relocations: ReadonlySet<number>;
  readonly #location: string;

  constructor(archive: DiscPath, read: ArchiveEntryRead, limit: number) {
    requireEntryBytes(archive, read.entry, limit);
    this.#bytes = read.bytes;
    this.#view = new DataView(read.bytes.buffer, read.bytes.byteOffset, read.bytes.byteLength);
    this.#relocations = new Set(read.relocations);
    this.#location = entryLocation(archive, read.entry);
  }

  /** The diagnostic location of a structure path inside the block. */
  at(path: string): string {
    return `${this.#location}${path}`;
  }

  invalid(path: string, reason: string): never {
    throw new SourceError('invalid-payload', this.at(path), reason);
  }

  unsupported(path: string, reason: string): never {
    throw new SourceError('unsupported-payload', this.at(path), reason);
  }

  /** Fails with `limit-exceeded` when `observed` exceeds `limit`, before anything of that size is read. */
  limit(path: string, name: SourceLimitName, limit: number, observed: number): void {
    if (observed > limit) throw new SourceError('limit-exceeded', this.at(path), 'the structure exceeds its payload limit', { name, limit, observed });
  }

  /** Requires `[offset, offset + length)` to lie in the block. */
  require(offset: number, length: number, path: string): void {
    if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || offset + length > this.#bytes.byteLength) {
      this.invalid(path, 'the structure lies outside the data block');
    }
  }

  /** Rejects a relocated 4-byte field overlapping `[offset, offset + length)`, other than one starting at `except`. */
  #noPointerIn(offset: number, length: number, path: string, except = -1): void {
    for (let position = offset - 3; position < offset + length; position++) {
      if (position !== except && this.#relocations.has(position)) this.invalid(path, 'a relocation overlaps a value field');
    }
  }

  /** A u32 value field; it may not hold or overlap a relocated pointer. */
  u32(offset: number, path: string): number {
    this.require(offset, 4, path);
    this.#noPointerIn(offset, 4, path);
    return this.#view.getUint32(offset, true);
  }

  i32(offset: number, path: string): number {
    this.require(offset, 4, path);
    this.#noPointerIn(offset, 4, path);
    return this.#view.getInt32(offset, true);
  }

  f32(offset: number, path: string): number {
    this.require(offset, 4, path);
    this.#noPointerIn(offset, 4, path);
    const value = this.#view.getFloat32(offset, true);
    if (!Number.isFinite(value)) this.invalid(path, 'the value is not a finite number');
    return value + 0;
  }

  isRelocated(offset: number): boolean {
    return this.#relocations.has(offset);
  }

  /** Requires every relocation inside `[offset, offset + length)` to start at one of the `allowed` relative offsets. */
  requireRelocations(offset: number, length: number, allowed: ReadonlySet<number>, path: string): void {
    for (let at = 0; at < length; at++) {
      if (this.#relocations.has(offset + at) && !allowed.has(at)) this.invalid(path, 'a relocation is not at a pointer field');
    }
  }

  /**
   * The target offset of the pointer field at `offset`, or null for a zero field outside the relocation table. A
   * non-zero value at an unlisted position is not a pointer the loader would fix up, so it is invalid.
   */
  pointer(offset: number, path: string): number | null {
    this.require(offset, 4, path);
    this.#noPointerIn(offset, 4, path, offset);
    const value = this.#view.getUint32(offset, true);
    if (this.isRelocated(offset)) return value;
    if (value !== 0) this.invalid(path, 'the pointer is not listed in the relocation table');
    return null;
  }

  /** The target of a pointer field that must be set, with `length` bytes of its structure in the block. */
  target(offset: number, length: number, path: string): number {
    const target = this.pointer(offset, path);
    if (target === null) this.invalid(path, 'the pointer is null');
    this.require(target, length, path);
    return target;
  }

  /**
   * Reads a `{u32 pointer, u32 count}` array header whose items are `itemBytes` long. The count is checked against
   * `limit` before the array is bounds-checked or read; a null pointer requires a zero count, and a pointer with a
   * zero count is unsupported. A top-level array must start at or after `after`, past its root header.
   */
  array(offset: number, itemBytes: number, limit: number, path: string, after = 0): { readonly start: number; readonly count: number } {
    const count = this.u32(offset + 4, path);
    this.limit(path, 'payloadItems', limit, count);
    const start = this.pointer(offset, path);
    if (start === null) {
      if (count !== 0) this.invalid(path, 'a non-empty array has a null pointer');
      return { start: 0, count: 0 };
    }
    if (start < after) this.invalid(path, 'the array overlaps its header');
    this.require(start, count * itemBytes, path);
    if (count === 0) this.unsupported(path, 'an empty array has a pointer');
    return { start, count };
  }

  /** A NUL-terminated name of 1 to 63 printable ASCII bytes at `offset`; at most 64 bytes are examined. */
  name(offset: number, path: string): string {
    this.require(offset, 1, path);
    const scanned = this.#bytes.subarray(offset, Math.min(this.#bytes.byteLength, offset + MAX_NAME_BYTES + 1));
    const length = scanned.indexOf(0);
    if (length === -1) {
      if (scanned.length <= MAX_NAME_BYTES) this.invalid(path, 'the name has no terminating NUL');
      this.limit(path, 'textBytes', MAX_NAME_BYTES, scanned.length);
    }
    if (length === 0) this.invalid(path, 'the name is empty');
    this.#noPointerIn(offset, length + 1, path);
    const name = scanned.subarray(0, length);
    if (name.some(byte => byte < 0x20 || byte > 0x7e)) this.invalid(path, 'the name is not printable ASCII');
    return String.fromCharCode(...name);
  }

  /** Whether any of the `length` bytes of a value field at `offset` is non-zero. */
  hasNonZero(offset: number, length: number, path: string): boolean {
    this.require(offset, length, path);
    this.#noPointerIn(offset, length, path);
    return this.#bytes.subarray(offset, offset + length).some(byte => byte !== 0);
  }

  /** A pointer field that must be unset: a listed pointer whose target lies in the block is unsupported. */
  unsupportedPointer(offset: number, targetBytes: number, path: string, reason: string): void {
    const target = this.pointer(offset, path);
    if (target === null) return;
    this.require(target, targetBytes, path);
    this.unsupported(path, reason);
  }
}
