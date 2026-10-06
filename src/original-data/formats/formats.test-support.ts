import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import { MARKER } from '../disc/disc.test-support.ts';
import { buildImfat } from '../synthetic.ts';

// Code-generated synthetic SCEN, SCCT and M2ID blocks for P2-09 tests; they never hold original data, and their
// numbers deliberately differ from the original's. Structures start at odd offsets, so pointers are unaligned, and
// relocation tables are written in reverse order. Names carry MARKER for privacy assertions.

export { MARKER };

/** Entry IDs of the production mapping (docs/original/formats/scenario.md §4, hud.md §3), reused by synthetic archives. */
export const ENTRY_IDS = Object.freeze({ campaign: 3123, scenario: 3019, modelList: 10649 });

/** A growable little-endian block whose pointer writes are recorded as relocations. */
class BlockWriter {
  #bytes = new Uint8Array(256);
  #view = new DataView(this.#bytes.buffer);
  length = 0;
  readonly relocations: number[] = [];

  /** Appends `size` zero bytes and returns their offset. */
  alloc(size: number): number {
    const at = this.length;
    if (at + size > this.#bytes.length) {
      const grown = new Uint8Array(Math.max(this.#bytes.length * 2, at + size));
      grown.set(this.#bytes);
      this.#bytes = grown;
      this.#view = new DataView(grown.buffer);
    }
    this.length += size;
    return at;
  }

  u32(at: number, value: number): this {
    this.#view.setUint32(at, value >>> 0, true);
    return this;
  }

  i32(at: number, value: number): this {
    this.#view.setInt32(at, value, true);
    return this;
  }

  f32(at: number, value: number): this {
    this.#view.setFloat32(at, value, true);
    return this;
  }

  pointer(at: number, target: number): this {
    this.relocations.push(at);
    return this.u32(at, target);
  }

  /** Appends a NUL-terminated ASCII name and returns its offset. */
  name(text: string): number {
    const at = this.alloc(text.length + 1);
    for (let index = 0; index < text.length; index++) this.#bytes[at + index] = text.charCodeAt(index);
    return at;
  }

  /** Appends pointers to new copies of `names` as a list and returns the list offset. */
  nameList(names: readonly string[]): number {
    const list = this.alloc(names.length * 4);
    names.forEach((text, index) => this.pointer(list + index * 4, this.name(text)));
    return list;
  }

  toBlock(): SyntheticBlock {
    return { bytes: this.#bytes.slice(0, this.length), relocations: [...this.relocations].reverse() };
  }
}

/** A data block and its relocation table, which tests may corrupt before wrapping it with `entryRead`. */
export interface SyntheticBlock {
  bytes: Uint8Array;
  relocations: number[];
}

/** The `ArchiveEntryRead` of a synthetic block, as `ImfatArchiveHandle.read` returns it. */
export function entryRead(id: number, type: string, { bytes, relocations }: SyntheticBlock): ArchiveEntryRead {
  return Object.freeze({
    entry: Object.freeze({ flags: 0, id, type, relocationCount: relocations.length, offset: 0, size: bytes.length }),
    bytes,
    relocations: Object.freeze([...relocations]),
  });
}

export interface RecordSpec {
  /** Raw kind word at +0x00. */
  kind?: number;
  names?: string[];
  /** Raw u32 words by record offset. */
  words?: Record<number, number>;
  /** Raw i32 words by record offset. */
  signed?: Record<number, number>;
  position?: [number, number, number];
  /** Group index for the +0x3C back-reference. */
  member?: number;
  /** Section-3 index for +0x44. */
  region?: number;
  /** Record indexes for +0x48 and +0x58. */
  anchor?: number;
  aiTarget?: number;
  /** Points +0x54 at the section-2 trigger. */
  trigger?: boolean;
}

export interface GroupSpec {
  spawnCount: number;
  layout: number;
  template: number;
  members: number[];
}

export interface ScenarioSpec {
  sectors?: [number, number];
  scale?: number;
  mode?: number;
  names?: string[];
  records: RecordSpec[];
  regions?: [number, number, number, number][];
  /** The section-2 event trigger: its range count and spawn pair count. */
  trigger?: { ranges: number; pairs?: number };
  groups?: GroupSpec[];
  /** Raw (file) layout elements, before the load transform. */
  layouts?: [number, number, number][][];
  /** The count word the load transform reads after the layout table, which ends the block; null omits it. */
  tail?: number | null;
}

/** Offsets of the laid-out structures, for tests that corrupt specific fields. */
export interface ScenarioOffsets {
  readonly records: readonly number[];
  readonly groups: readonly number[];
  readonly regions: number;
  readonly layoutTable: number;
  readonly trigger: number | null;
}

function writeRecord(writer: BlockWriter, at: number, spec: RecordSpec, targets: { records: number[]; groups: number[]; regions: number; trigger: number | null }): void {
  writer.u32(at, spec.kind ?? 0);
  if (spec.names?.length) writer.pointer(at + 0x04, writer.nameList(spec.names)).u32(at + 0x08, spec.names.length);
  for (const [offset, value] of Object.entries(spec.words ?? {})) writer.u32(at + Number(offset), value);
  for (const [offset, value] of Object.entries(spec.signed ?? {})) writer.i32(at + Number(offset), value);
  spec.position?.forEach((value, axis) => writer.f32(at + 0x24 + axis * 4, value));
  if (spec.member !== undefined) writer.pointer(at + 0x3c, targets.groups[spec.member]);
  if (spec.region !== undefined) writer.pointer(at + 0x44, targets.regions + spec.region * 16);
  if (spec.anchor !== undefined) writer.pointer(at + 0x48, targets.records[spec.anchor]);
  if (spec.trigger) writer.pointer(at + 0x54, targets.trigger!);
  if (spec.aiTarget !== undefined) writer.pointer(at + 0x58, targets.records[spec.aiTarget]);
}

/** Lays out a SCEN block from `spec`. */
export function syntheticScenario(spec: ScenarioSpec): SyntheticBlock & { readonly offsets: ScenarioOffsets } {
  const writer = new BlockWriter();
  const header = writer.alloc(0x48);
  writer.alloc(1);
  const names = spec.names ?? [];
  const pool = names.length ? writer.nameList(names) : 0;
  const recordStart = writer.alloc(spec.records.length * 132);
  const records = spec.records.map((_, index) => recordStart + index * 132);
  let trigger: number | null = null;
  if (spec.trigger) {
    trigger = writer.alloc(28 + spec.trigger.ranges * 20);
    writer.pointer(trigger, trigger + 28).u32(trigger + 4, spec.trigger.ranges);
    if (spec.trigger.pairs) writer.pointer(trigger + 20, writer.alloc(spec.trigger.pairs * 8)).u32(trigger + 24, spec.trigger.pairs);
  }
  const regionSpecs = spec.regions ?? [];
  const regions = writer.alloc(regionSpecs.length * 16);
  regionSpecs.forEach((region, index) => region.forEach((value, field) => writer.i32(regions + index * 16 + field * 4, value)));
  const groupSpecs = spec.groups ?? [];
  const groupStart = writer.alloc(groupSpecs.length * 28);
  const groups = groupSpecs.map((_, index) => groupStart + index * 28);
  groupSpecs.forEach((group, index) => {
    const at = groups[index];
    writer.u32(at, group.spawnCount).pointer(at + 8, records[group.template]);
    if (group.members.length) {
      const array = writer.alloc(group.members.length * 4);
      group.members.forEach((member, position) => writer.pointer(array + position * 4, records[member]));
      writer.pointer(at + 12, array).u32(at + 16, group.members.length);
    }
  });
  spec.records.forEach((record, index) => writeRecord(writer, records[index], record, { records, groups, regions, trigger }));
  // The layout table and the count word after it come last, so `tail: null` leaves that word outside the block.
  const layoutSpecs = spec.layouts ?? [];
  const arrays = layoutSpecs.map(elements => {
    const array = writer.alloc(elements.length * 12);
    elements.forEach((element, position) => element.forEach((value, axis) => writer.f32(array + position * 12 + axis * 4, value)));
    return array;
  });
  const layoutTable = writer.alloc(layoutSpecs.length * 8);
  arrays.forEach((array, index) => writer.pointer(layoutTable + index * 8, array).u32(layoutTable + index * 8 + 4, layoutSpecs[index].length));
  const layoutTail = layoutTable + layoutSpecs.length * 8;
  if (spec.tail !== null) writer.alloc(8);
  if (spec.tail) writer.u32(layoutTail + 4, spec.tail);
  groupSpecs.forEach((group, index) => writer.pointer(groups[index] + 4, layoutTable + group.layout * 8));
  const [width, height] = spec.sectors ?? [6, 6];
  writer.u32(header, width).u32(header + 4, height).f32(header + 8, spec.scale ?? 900).u32(header + 0x0c, spec.mode ?? 0);
  const section = (index: number, start: number, count: number): void => {
    if (count > 0) writer.pointer(header + 0x10 + index * 8, start).u32(header + 0x14 + index * 8, count);
  };
  section(0, pool, names.length);
  section(1, recordStart, spec.records.length);
  section(2, trigger ?? 0, trigger === null ? 0 : 1);
  section(3, regions, regionSpecs.length);
  section(5, groupStart, groupSpecs.length);
  section(6, layoutTable, layoutSpecs.length);
  return { ...writer.toBlock(), offsets: { records, groups, regions, layoutTable, trigger } };
}

/**
 * A mission shaped like the slice's: placement only by rectangle, anchor or layout, member back-references, an AI
 * target, a message-only trigger, a name pool and one record with name candidates.
 */
export function defaultScenarioSpec(): ScenarioSpec {
  return {
    names: [`${MARKER}-pool-a`, `${MARKER}-pool-b`, `${MARKER}-pool-c`],
    records: [
      { kind: 1 << 0, region: 2, signed: { 0x70: 6, 0x74: 7, 0x78: 33 } },
      { region: 0, words: { 0x1c: 90 } },
      { region: 0, words: { 0x1c: 120 } },
      { kind: 1 << 7, anchor: 0, aiTarget: 0, words: { 0x5c: (1 << 0) | (1 << 17) } },
      { kind: 1 << 7, member: 0, words: { 0x0c: 0x80000000 }, signed: { 0x60: -5 } },
      { kind: 1 << 7, member: 2 },
      { kind: 1 << 8, member: 1, words: { 0x10: 2 } },
      { kind: 1 << 17, region: 2, trigger: true },
      { kind: 1 << 14, region: 1, words: { 0x10: 5 }, names: [`${MARKER}-x`, `${MARKER}-y`] },
    ],
    regions: [[-2000, 1000, 2000, 2000], [-2600, -2600, 2600, 2600], [-2000, -2000, 2000, 0]],
    trigger: { ranges: 2 },
    groups: [
      { spawnCount: 2, layout: 0, template: 1, members: [4, 4] },
      { spawnCount: 2, layout: 1, template: 1, members: [6, 6] },
      { spawnCount: 3, layout: 0, template: 3, members: [5, 5] },
    ],
    layouts: [[[0, 0, 0], [30, 0, 0]], [[0, 0, 0], [0, 0, 70]]],
  };
}

export interface CampaignSpec {
  /** Each group's slots as [SCEN entry ID, MUSC entry ID]. */
  groups: [number, number][][];
  wingmen: RecordSpec[];
}

/** Lays out a SCCT block from `spec`. */
export function syntheticCampaign(spec: CampaignSpec): SyntheticBlock {
  const writer = new BlockWriter();
  const header = writer.alloc(16);
  writer.alloc(1);
  const groupTable = writer.alloc(spec.groups.length * 8);
  spec.groups.forEach((slots, index) => {
    const array = writer.alloc(slots.length * 12);
    slots.forEach(([scenario, music], slot) => writer.u32(array + slot * 12, scenario).u32(array + slot * 12 + 4, music));
    writer.pointer(groupTable + index * 8, array).u32(groupTable + index * 8 + 4, slots.length);
  });
  const wingmen = writer.alloc(spec.wingmen.length * 132);
  spec.wingmen.forEach((record, index) => writeRecord(writer, wingmen + index * 132, record, { records: [], groups: [], regions: 0, trigger: null }));
  if (spec.groups.length) writer.pointer(header, groupTable).u32(header + 4, spec.groups.length);
  if (spec.wingmen.length) writer.pointer(header + 8, wingmen).u32(header + 12, spec.wingmen.length);
  return writer.toBlock();
}

/** Three difficulty groups whose slot 1 differ, with two wingman options. */
export function defaultCampaignSpec(): CampaignSpec {
  return {
    groups: [
      [[3121, 9100], [ENTRY_IDS.scenario, 9101], [3020, 9102]],
      [[3121, 9100], [3037, 9111]],
      [[3121, 9100], [3075, 9121]],
    ],
    wingmen: [
      { kind: 1 << 1, names: [`${MARKER}-w0`], signed: { 0x70: 3, 0x74: 4 } },
      { kind: 1 << 1, names: [`${MARKER}-w1`], signed: { 0x70: 5, 0x74: 5 } },
    ],
  };
}

/** Craft types the default mission and roster reference, mapped to synthetic MODL entry IDs; slots 0 and 1 share one. */
export const DEFAULT_MODEL_IDS: readonly number[] = Object.freeze(Array.from({ length: 22 }, (_, slot) =>
  ({ 0: 20_001, 1: 20_001, 7: 20_007, 8: 20_008, 14: 20_014, 17: 20_017 } as Record<number, number>)[slot] ?? (slot % 3 === 0 ? 0 : 20_100 + slot)));

/** Lays out an M2ID block holding `ids`. */
export function syntheticModelList(ids: readonly number[]): SyntheticBlock {
  const writer = new BlockWriter();
  const header = writer.alloc(8);
  const array = writer.alloc(ids.length * 4);
  ids.forEach((id, slot) => writer.u32(array + slot * 4, id));
  writer.pointer(header, array).u32(header + 4, ids.length);
  return writer.toBlock();
}

/** `SCENARIO.NOB` with the campaign table, the selected and a decoy mission, and the referenced music entries. */
export function syntheticScenarioArchive(campaign = syntheticCampaign(defaultCampaignSpec()), scenario = syntheticScenario(defaultScenarioSpec())): Uint8Array {
  const decoy = syntheticScenario({ records: [{ kind: 1 << 0 }] });
  return buildImfat(3000, [
    { id: ENTRY_IDS.scenario, type: 'SCEN', data: scenario.bytes, relocations: scenario.relocations },
    { id: 3121, type: 'SCEN', data: decoy.bytes, relocations: decoy.relocations },
    { id: ENTRY_IDS.campaign, type: 'SCCT', data: campaign.bytes, relocations: campaign.relocations },
    { id: 9101, type: 'MUSC', data: new Uint8Array(16) },
  ]);
}

/** `SR.NOB` with the M2ID list and a placeholder MODL entry for every non-zero ID it names. */
export function syntheticModelArchive(ids: readonly number[] = DEFAULT_MODEL_IDS): Uint8Array {
  const list = syntheticModelList(ids);
  const models = [...new Set(ids.filter(id => id !== 0))].sort((left, right) => left - right);
  return buildImfat(10_000, [
    { id: ENTRY_IDS.modelList, type: 'M2ID', data: list.bytes, relocations: list.relocations },
    ...models.map(id => ({ id, type: 'MODL', data: new Uint8Array(8) })),
  ]);
}
