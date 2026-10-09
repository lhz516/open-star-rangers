import {
  LOGIC_LIMITS, type EventRange, type EventTrigger, type MissionDeclaration, type MissionGroup, type SpawnRegion, type Vector3,
} from '../../content/logic/logic-content.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { readObjectRecord, RECORD_BYTES, type ObjectRecord } from './object-record.ts';
import { PayloadBlock } from './payload-block.ts';

// Directed parsing of one SCEN mission (docs/original/formats/scenario.md §2–3) under the P2-09 source field handling
// and the P3-03 section-2 event triggers. Pointers are resolved to canonical indexes; every position the handling does
// not support fails closed.

/**
 * Structural limits of a SCEN entry (P2-09 spec, 限值与预算). Section 2 is limited by the logic payload's event limits
 * (`LOGIC_LIMITS.event*`, P3-03), which the converter shares with the reader.
 */
export const SCENARIO_LIMITS = Object.freeze({
  entryBytes: 262_144,
  names: 64,
  records: 64,
  regions: 64,
  groups: 64,
  members: 64,
  layouts: 16,
  layoutElements: 256,
  /** Sector counts are read as 16-bit values by the original. */
  sectors: 32_767,
});

const HEADER_BYTES = 0x48;
const REGION_BYTES = 16;
const GROUP_BYTES = 28;
const LAYOUT_ENTRY_BYTES = 8;
const LAYOUT_ELEMENT_BYTES = 12;
const TRIGGER_BYTES = 28;
const RANGE_BYTES = 20;
const SECTION_4_BYTES = 36;
/** Trigger offsets of pointer fields: the range table and the run-time spawn-pair array. */
const TRIGGER_POINTERS: ReadonlySet<number> = new Set([0x00, 0x14]);
/** Range offset of its pointer field, the message-pointer array. */
const RANGE_POINTERS: ReadonlySet<number> = new Set([0x08]);

/** A SCEN mission in canonical terms, before campaign, references and the map frame are added. */
export interface ParsedScenario {
  /** World size in sectors per side (header 0x00 and 0x04, which must be equal). */
  readonly sectors: number;
  /** Coordinate reference scale (header 0x08). */
  readonly referenceScale: number;
  readonly namePool: readonly string[];
  readonly spawnRegions: readonly SpawnRegion[];
  /** Section-1 records in table order; templates and members must alias them. */
  readonly declarations: readonly MissionDeclaration[];
  readonly groups: readonly MissionGroup[];
  /** Section-2 event triggers in section order; each is the event trigger of at least one record. */
  readonly eventTriggers: readonly EventTrigger[];
}

/** Index of the `size`-byte item of a table at `start` with `count` items that `target` starts, or -1. */
function itemIndex(target: number, start: number, count: number, size: number): number {
  const index = (target - start) / size;
  return Number.isInteger(index) && index >= 0 && index < count ? index : -1;
}

/** Reads the section-6 layouts with the original load transform: y and z of element 0 of each list are swapped. */
function readLayouts(block: PayloadBlock, table: { start: number; count: number }): readonly (readonly Vector3[])[] {
  const layouts = Array.from({ length: table.count }, (_, index) => {
    const path = `/layouts[${index}]`;
    const list = block.array(table.start + index * LAYOUT_ENTRY_BYTES, LAYOUT_ELEMENT_BYTES, SCENARIO_LIMITS.layoutElements, path);
    if (list.count === 0) block.unsupported(path, 'the layout is empty');
    return Object.freeze(Array.from({ length: list.count }, (_, element): Vector3 => {
      const at = list.start + element * LAYOUT_ELEMENT_BYTES;
      const elementPath = `${path}/elements[${element}]`;
      const x = block.f32(at, elementPath);
      const y = block.f32(at + 4, elementPath);
      const z = block.f32(at + 8, elementPath);
      return Object.freeze(element === 0 ? { x, y: z, z: y } : { x, y, z });
    }));
  });
  if (table.count > 0) {
    // The original loop keeps reading counts past the table while they are positive.
    const next = block.i32(table.start + table.count * LAYOUT_ENTRY_BYTES + 4, '/layouts');
    if (next > 0) block.unsupported('/layouts', 'the load transform would read past the layout table');
  }
  return layouts;
}

/** A `{u32 pointer, i32 count}` array; a negative count, which the original reads as no items, is unsupported. */
function signedArray(block: PayloadBlock, offset: number, itemBytes: number, limit: number, path: string): { readonly start: number; readonly count: number } {
  if (block.i32(offset + 4, path) < 0) block.unsupported(path, 'the count is negative');
  return block.array(offset, itemBytes, limit, path);
}

/**
 * The NUL-terminated message at `offset`, a position in the block, as a byte string of 1 to `eventMessageBytes` bytes,
 * each kept as stored; at most one byte past the limit is examined, and no relocation may overlap the message or its NUL.
 */
function readMessage(block: PayloadBlock, bytes: Uint8Array, offset: number, path: string): string {
  const limit = LOGIC_LIMITS.eventMessageBytes;
  const scanned = bytes.subarray(offset, Math.min(bytes.length, offset + limit + 1));
  const length = scanned.indexOf(0);
  if (length === -1) {
    if (scanned.length <= limit) block.invalid(path, 'the message has no terminating NUL');
    block.limit(path, 'textBytes', limit, scanned.length);
  }
  if (length === 0) block.unsupported(path, 'the message is empty');
  for (let at = offset - 3; at <= offset + length; at++) {
    if (block.isRelocated(at)) block.invalid(path, 'a relocation overlaps the message');
  }
  return String.fromCharCode(...scanned.subarray(0, length));
}

/** Reads the 20-byte range at `at`: its bounds, its messages and its selector byte, whose three unread bytes must be zero. */
function readRange(block: PayloadBlock, bytes: Uint8Array, at: number, path: string): EventRange {
  block.requireRelocations(at, RANGE_BYTES, RANGE_POINTERS, path);
  const lower = block.i32(at, `${path}/lower`);
  const upper = block.i32(at + 4, `${path}/upper`);
  // The selector is the low byte, consumed as i8; no reader was found for +0x11 to +0x13 (field rule 6).
  const word = block.u32(at + 16, `${path}/summarySelector`);
  if (word > 0xff) block.unsupported(`${path}/reserved`, 'an unread byte is not zero');
  const list = signedArray(block, at + 8, 4, LOGIC_LIMITS.eventMessages, `${path}/messages`);
  const messages = Array.from({ length: list.count }, (_, index) => {
    const cell = `${path}/messages[${index}]`;
    return readMessage(block, bytes, block.target(list.start + index * 4, 1, cell), cell);
  });
  return Object.freeze({ lower, upper, messages: Object.freeze(messages), summarySelector: (word << 24) >> 24 });
}

/**
 * Reads the section-2 event triggers at `table`. The three event counters (+0x08 to +0x10) are reset when the mission
 * is built, so their stored values are neither converted nor checked; spawn pairs (+0x14, +0x18) exist only at run time,
 * so a stored pair array or count is unsupported.
 */
function readTriggers(block: PayloadBlock, bytes: Uint8Array, table: { readonly start: number; readonly count: number }): readonly EventTrigger[] {
  return Object.freeze(Array.from({ length: table.count }, (_, index): EventTrigger => {
    const at = table.start + index * TRIGGER_BYTES;
    const path = `/triggers[${index}]`;
    block.requireRelocations(at, TRIGGER_BYTES, TRIGGER_POINTERS, path);
    block.unsupportedPointer(at + 20, 1, `${path}/spawnPairs`, 'the event trigger holds spawn pairs');
    if (block.u32(at + 24, `${path}/spawnPairs`) !== 0) block.unsupported(`${path}/spawnPairs`, 'the event trigger holds spawn pairs');
    const ranges = signedArray(block, at, RANGE_BYTES, LOGIC_LIMITS.eventRanges, `${path}/ranges`);
    return Object.freeze({
      ranges: Object.freeze(Array.from({ length: ranges.count }, (_, position) =>
        readRange(block, bytes, ranges.start + position * RANGE_BYTES, `${path}/ranges[${position}]`))),
    });
  }));
}

/** Parses the SCEN entry `read` of `archive`, checking its size before anything else. */
export function parseScenario(archive: DiscPath, read: ArchiveEntryRead): ParsedScenario {
  const block = new PayloadBlock(archive, read, SCENARIO_LIMITS.entryBytes);
  block.require(0, HEADER_BYTES, '/header');
  const width = block.u32(0x00, '/header/width');
  const height = block.u32(0x04, '/header/height');
  if (width === 0 || height === 0) block.invalid('/header/width', 'the world has no sectors');
  if (width !== height) block.unsupported('/header/height', 'the world is not square');
  if (width > SCENARIO_LIMITS.sectors) block.unsupported('/header/width', 'the sector count exceeds 16 bits');
  const referenceScale = block.f32(0x08, '/header/scale');
  if (referenceScale <= 0) block.invalid('/header/scale', 'the reference scale is not positive');
  if (block.u32(0x0c, '/header/mode') !== 0) block.unsupported('/header/mode', 'the mission uses the special mode');

  const names = block.array(0x10, 4, SCENARIO_LIMITS.names, '/sections[0]', HEADER_BYTES);
  const records = block.array(0x18, RECORD_BYTES, SCENARIO_LIMITS.records, '/sections[1]', HEADER_BYTES);
  const triggerTable = block.array(0x20, TRIGGER_BYTES, LOGIC_LIMITS.eventTriggers, '/sections[2]', HEADER_BYTES);
  const regions = block.array(0x28, REGION_BYTES, SCENARIO_LIMITS.regions, '/sections[3]', HEADER_BYTES);
  block.unsupportedPointer(0x30, SECTION_4_BYTES, '/sections[4]', 'the mission uses section 4');
  if (block.u32(0x34, '/sections[4]') !== 0) block.unsupported('/sections[4]', 'the mission uses section 4');
  const groupTable = block.array(0x38, GROUP_BYTES, SCENARIO_LIMITS.groups, '/sections[5]', HEADER_BYTES);
  const layoutTable = block.array(0x40, LAYOUT_ENTRY_BYTES, SCENARIO_LIMITS.layouts, '/sections[6]', HEADER_BYTES);

  const namePool = Object.freeze(Array.from({ length: names.count }, (_, index) => {
    const path = `/names[${index}]`;
    return block.name(block.target(names.start + index * 4, 1, path), path);
  }));
  const parsed: readonly ObjectRecord[] = Array.from({ length: records.count },
    (_, index) => readObjectRecord(block, records.start + index * RECORD_BYTES, `/records[${index}]`));
  const recordIndex = (target: number | null, path: string, reason: string): number => {
    const index = target === null ? -1 : itemIndex(target, records.start, records.count, RECORD_BYTES);
    if (index === -1) block.unsupported(path, reason);
    return index;
  };
  const spawnRegions = Object.freeze(Array.from({ length: regions.count }, (_, index): SpawnRegion => {
    const at = regions.start + index * REGION_BYTES;
    const path = `/regions[${index}]`;
    return Object.freeze({ x0: block.i32(at, path), y0: block.i32(at + 4, path), x1: block.i32(at + 8, path), y1: block.i32(at + 12, path) });
  }));
  const eventTriggers = readTriggers(block, read.bytes, triggerTable);
  const layouts = readLayouts(block, layoutTable);

  const usedLayouts = new Set<number>();
  const templates = new Set<number>();
  /** The one group listing each member record. */
  const listingGroup = new Map<number, number>();
  const groups = Object.freeze(Array.from({ length: groupTable.count }, (_, index): MissionGroup => {
    const at = groupTable.start + index * GROUP_BYTES;
    const path = `/groups[${index}]`;
    const layout = block.target(at + 4, LAYOUT_ENTRY_BYTES, `${path}/layout`);
    const layoutIndex = itemIndex(layout, layoutTable.start, layoutTable.count, LAYOUT_ENTRY_BYTES);
    if (layoutIndex === -1) block.unsupported(`${path}/layout`, 'the layout is not a section-6 entry');
    usedLayouts.add(layoutIndex);
    const template = recordIndex(block.target(at + 8, RECORD_BYTES, `${path}/template`), `${path}/template`, 'the template is not a section-1 record');
    templates.add(template);
    const memberArray = block.array(at + 12, 4, SCENARIO_LIMITS.members, `${path}/members`);
    const members = Object.freeze(Array.from({ length: memberArray.count }, (_, position) => {
      const memberPath = `${path}/members[${position}]`;
      const member = recordIndex(block.target(memberArray.start + position * 4, RECORD_BYTES, memberPath), memberPath, 'the member is not a section-1 record');
      const listed = listingGroup.get(member);
      if (listed !== undefined && listed !== index) block.unsupported(memberPath, 'the record is a member of several groups');
      listingGroup.set(member, index);
      return member;
    }));
    if (block.u32(at + 20, `${path}/runtime`) !== 0) block.unsupported(`${path}/runtime`, 'the runtime spawn counter is not zero');
    block.unsupportedPointer(at + 24, 1, `${path}/runtime`, 'the runtime object pointer is set');
    return Object.freeze({ template, members, spawnCount: block.u32(at, `${path}/spawnCount`), layout: layouts[layoutIndex] });
  }));
  for (let index = 0; index < layoutTable.count; index++) {
    if (!usedLayouts.has(index)) block.unsupported(`/layouts[${index}]`, 'no group uses the layout');
  }

  const declarations = Object.freeze(parsed.map((record, index): MissionDeclaration => {
    const path = `/records[${index}]`;
    const { member, region, anchor, trigger, aiTarget } = record.links;
    const memberOf = member === null ? null : itemIndex(member, groupTable.start, groupTable.count, GROUP_BYTES);
    if (memberOf === -1 || memberOf !== (listingGroup.get(index) ?? null)) block.unsupported(`${path}/member`, 'the member back-reference does not match the listing group');
    const regionIndex = region === null ? null : itemIndex(region, regions.start, regions.count, REGION_BYTES);
    if (regionIndex === -1) block.unsupported(`${path}/region`, 'the spawn rectangle is not a section-3 element');
    const eventTrigger = trigger === null ? null : itemIndex(trigger, triggerTable.start, triggerTable.count, TRIGGER_BYTES);
    if (eventTrigger === -1) block.unsupported(`${path}/trigger`, 'the event trigger is not a section-2 element');
    const origins: MissionDeclaration['origins'] = Object.freeze([
      'object' as const,
      ...(templates.has(index) ? ['group-template' as const] : []),
      ...(listingGroup.has(index) ? ['group-member' as const] : []),
    ]);
    return Object.freeze({
      index,
      origins,
      craftType: record.craftType,
      nameCandidates: record.nameCandidates,
      position: record.position,
      spawnTime: record.spawnTime,
      gridSpacing: record.gridSpacing,
      placement: Object.freeze({
        region: regionIndex,
        anchor: anchor === null ? null : recordIndex(anchor, `${path}/anchor`, 'the anchor is not a section-1 record'),
      }),
      memberOf,
      aiTarget: aiTarget === null ? null : recordIndex(aiTarget, `${path}/aiTarget`, 'the AI target is not a section-1 record'),
      eventTrigger,
      ruleInputs: record.ruleInputs,
      aiTargetCraftTypes: record.aiTargetCraftTypes,
    });
  }));
  // Every section-2 element is an event trigger that some record +0x54 references.
  const referenced = new Set(declarations.map(({ eventTrigger }) => eventTrigger));
  eventTriggers.forEach((_, index) => {
    if (!referenced.has(index)) block.unsupported(`/triggers[${index}]`, 'no record references the event trigger');
  });
  return Object.freeze({ sectors: width, referenceScale, namePool, spawnRegions, declarations, groups, eventTriggers });
}
