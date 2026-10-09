import type { RuleInputs, Vector3 } from '../../content/logic/logic-content.ts';
import type { PayloadBlock } from './payload-block.ts';

// The 132-byte object record shared by SCEN and SCCT (docs/original/formats/scenario.md §3), read under the P2-09
// source field handling: rule inputs keep their source values with 0 as null, unsupported fields must be default, and
// pointer fields are returned as target offsets for the enclosing structure to resolve.

export const RECORD_BYTES = 132;
export const MAX_NAME_CANDIDATES = 32;

/** Record offsets of pointer fields; a relocation anywhere else in a record is not part of the format. */
const POINTER_FIELDS: ReadonlySet<number> = new Set([0x04, 0x30, 0x3c, 0x44, 0x48, 0x4c, 0x54, 0x58]);
/** Words without a supported meaning; they must be zero (+0x50 also holds the +0x4C path selector byte). */
const RESERVED_WORDS = [0x14, 0x18, 0x20, 0x34, 0x50, 0x6c, 0x7c, 0x80] as const;

/** Bytes each link's target structure occupies: a section-5 group, a section-3 rectangle, a record or a trigger header. */
const LINK_TARGET_BYTES = Object.freeze({ member: 28, region: 16, anchor: RECORD_BYTES, trigger: 28, aiTarget: RECORD_BYTES });

/** Pointer fields as target offsets in the record's block, or null when unset; each target structure lies in the block. */
export interface RecordLinks {
  /** +0x3C: the section-5 entry listing the record as a member. */
  readonly member: number | null;
  /** +0x44: a section-3 spawn rectangle. */
  readonly region: number | null;
  /** +0x48: the placement anchor record. */
  readonly anchor: number | null;
  /** +0x54: a section-2 event trigger, which must be an element start of section 2. */
  readonly trigger: number | null;
  /** +0x58: the AI target record. */
  readonly aiTarget: number | null;
}

export interface ObjectRecord {
  readonly craftType: number | null;
  readonly nameCandidates: readonly string[];
  readonly position: Vector3;
  readonly spawnTime: number;
  readonly gridSpacing: number;
  readonly ruleInputs: RuleInputs;
  readonly aiTargetCraftTypes: readonly number[];
  readonly links: RecordLinks;
}

function bitPositions(mask: number): readonly number[] {
  const bits: number[] = [];
  for (let bit = 0; bit < 32; bit++) if ((mask >>> bit) & 1) bits.push(bit);
  return Object.freeze(bits);
}

/** Reads the record at `offset`, whose diagnostics use the structure path `path`. */
export function readObjectRecord(block: PayloadBlock, offset: number, path: string): ObjectRecord {
  block.require(offset, RECORD_BYTES, path);
  block.requireRelocations(offset, RECORD_BYTES, POINTER_FIELDS, path);
  // +0x30 and +0x38 register the record as a spawn pair of an event trigger instead of a timed spawn; spawn pairs are
  // not supported, so both must be zero (docs/original/formats/scenario.md, section-2 event triggers).
  block.unsupportedPointer(offset + 0x30, 1, `${path}/spawnTrigger`, 'the record is spawned by an event trigger');
  if (block.u32(offset + 0x38, `${path}/spawnRange`) !== 0) block.unsupported(`${path}/spawnRange`, 'the record is spawned by an event trigger');
  block.unsupportedPointer(offset + 0x4c, 1, `${path}/route`, 'the record uses an unsupported field');
  for (const at of RESERVED_WORDS) {
    if (block.hasNonZero(offset + at, 4, `${path}/words[${at / 4}]`)) block.unsupported(`${path}/words[${at / 4}]`, 'a reserved word is not zero');
  }
  const kind = block.u32(offset, `${path}/kind`);
  if (kind !== 0 && (kind & (kind - 1)) !== 0) block.invalid(`${path}/kind`, 'the kind has more than one bit');
  const names = block.array(offset + 0x04, 4, MAX_NAME_CANDIDATES, `${path}/names`);
  const u32 = (at: number, field: string): number | null => block.u32(offset + at, `${path}/${field}`) || null;
  const i32 = (at: number, field: string): number | null => block.i32(offset + at, `${path}/${field}`) || null;
  const link = (at: number, field: keyof RecordLinks): number | null => {
    const target = block.pointer(offset + at, `${path}/${field}`);
    if (target !== null) block.require(target, LINK_TARGET_BYTES[field], `${path}/${field}`);
    return target;
  };
  return Object.freeze({
    craftType: kind === 0 ? null : 31 - Math.clz32(kind),
    nameCandidates: Object.freeze(Array.from({ length: names.count }, (_, index) => {
      const at = `${path}/names[${index}]`;
      return block.name(block.target(names.start + index * 4, 1, at), at);
    })),
    position: Object.freeze({
      x: block.f32(offset + 0x24, `${path}/position`),
      y: block.f32(offset + 0x28, `${path}/position`),
      z: block.f32(offset + 0x2c, `${path}/position`),
    }),
    spawnTime: block.u32(offset + 0x1c, `${path}/spawnTime`),
    gridSpacing: block.i32(offset + 0x40, `${path}/gridSpacing`),
    ruleInputs: Object.freeze({
      percentA: u32(0x0c, 'percentA'),
      craftCount: u32(0x10, 'craftCount'),
      percentB: i32(0x60, 'percentB'),
      percentC: i32(0x64, 'percentC'),
      percentD: i32(0x68, 'percentD'),
      aiValueA: i32(0x70, 'aiValueA'),
      aiValueB: i32(0x74, 'aiValueB'),
      aiValueC: i32(0x78, 'aiValueC'),
    }),
    aiTargetCraftTypes: bitPositions(block.u32(offset + 0x5c, `${path}/aiMask`)),
    links: Object.freeze({
      member: link(0x3c, 'member'),
      region: link(0x44, 'region'),
      anchor: link(0x48, 'anchor'),
      trigger: link(0x54, 'trigger'),
      aiTarget: link(0x58, 'aiTarget'),
    }),
  });
}
