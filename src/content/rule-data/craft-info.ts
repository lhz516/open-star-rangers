import {
  byteStrings, invalid, listOf, readF32, readI32, readIndex, readInt32, readNullable, readTuple, readU32, readU8, records,
  requireTarget, tuples, type ByteString, type Shape,
} from './rule-data-fields.ts';

// Canonical content of `data/craft-info` (P3-03 spec S-03): the selected TABL 4003 scale and every record of CINF 4037,
// with the structure of docs/original/formats/craft.md. Field names are neutral unless craft.md confirms a use: `atXX` is
// the source position +0xXX in its structure. Values are kept as stored (field rules 2–6): positions the load code
// overwrites (craft.md §3.8) and zero-only bytes are not carried, a record's first word is carried by its position, and
// pointers become positions in this content. Meanings beyond the uses craft.md states are Unconfirmed (U-001, U-008,
// U-026, U-027); the rules that use them belong to P3-06, P3-07, P3-09 and P3-10.

/** Fixed counts of the format: one craft record per kind bit, three mount lists per craft record. */
export const CRAFT_INFO_COUNTS = Object.freeze({ craft: 20, mountLists: 3 });

/**
 * Structural limits: twice the CINF 4037 maximum recorded in craft.md §3.9, rounded up to a power of two (guns 10, missiles
 * 9, bodies 9, mounts per craft 16, boxes per craft 32, mount-list entries per list 3, pairs per craft 3, name bytes 26).
 */
export const CRAFT_INFO_LIMITS = Object.freeze({
  guns: 32,
  missiles: 32,
  missileBodies: 32,
  mounts: 32,
  boxes: 64,
  mountListEntries: 8,
  pairs: 8,
  nameBytes: 64,
});

export type F32x3 = readonly [number, number, number];
export type F32x6 = readonly [number, number, number, number, number, number];
export type Int32x4 = readonly [number, number, number, number];

/** Box, 24 bytes (craft.md §3.6): f32 lower and upper corners. */
export interface Box {
  readonly lower: F32x3;
  readonly upper: F32x3;
}

/** Gun record, 48 bytes (craft.md §3.3; U-001, U-008); its index in `guns` is the first word the load code writes. */
export interface GunRecord {
  /** +0x04 text: the weapon name `0x2dcf0` returns. */
  readonly name: ByteString;
  /** +0x08 f32. */
  readonly at08: number;
  /** +0x14 i32. */
  readonly at14: number;
  /** +0x18 int32 (type Likely, data). */
  readonly at18: number;
  /** +0x1C int32. */
  readonly at1C: number;
  /** +0x20 f32 (type Likely, data). */
  readonly at20: number;
  /** +0x24 i32. */
  readonly at24: number;
  /** +0x28 u8. */
  readonly at28: number;
  /** +0x2C i32. */
  readonly at2C: number;
}

/** Missile record, 104 bytes (craft.md §3.4; U-001, U-008); its index in `missiles` is the first word the load code writes. */
export interface MissileRecord {
  /** +0x04 text: the weapon name `0x2dcf0` returns. */
  readonly name: ByteString;
  /** +0x14 pointer: index in `missileBodies`. */
  readonly body: number;
  /** +0x18 u8. */
  readonly at18: number;
  /** +0x1C int32. */
  readonly at1C: number;
  /** +0x20 int32. */
  readonly at20: number;
  /** +0x24 u8. */
  readonly at24: number;
  /** +0x28 f32. */
  readonly at28: number;
  /** +0x30 int32. */
  readonly at30: number;
  /** +0x34 i32. */
  readonly at34: number;
  /** +0x38 int32. */
  readonly at38: number;
  /** +0x3C int32. */
  readonly at3C: number;
  /** +0x40 f32; the stored values may be denormals. */
  readonly at40: number;
  /** +0x44 i32. */
  readonly at44: number;
  /** +0x48 int32. */
  readonly at48: number;
  /** +0x4C f32. */
  readonly at4C: number;
  /** +0x54 u32. */
  readonly at54: number;
  /** +0x58 i32. */
  readonly at58: number;
  /** +0x5C i32. */
  readonly at5C: number;
  /** +0x60 f32. */
  readonly at60: number;
  /** +0x64 f32. */
  readonly at64: number;
}

/**
 * Collision shape of a craft record, 68 bytes at record +0x10 (craft.md §3.5.1; U-001, U-027); `atXX` is the shape offset. Shape +0x04
 * is never carried: the load code overwrites it.
 */
export interface CraftCollisionShape {
  /** Shape +0x00 f32, the radius, kept only while `boxes` is empty; null otherwise, as the load code then overwrites it. */
  readonly at00: number | null;
  /** Shape +0x08–+0x1C f32 × 6, the bounds, kept only while `boxes` is empty; null otherwise, as for `at00`. */
  readonly at08: F32x6 | null;
  /** Shape +0x20 pointer and +0x24 i32 count. */
  readonly boxes: readonly Box[];
  /** Shape +0x28 int32. */
  readonly at28: number;
  /** Shape +0x2C–+0x40 f32 × 6, the box a non-zero `at28` excludes from the box test. */
  readonly at2C: F32x6;
}

/** Pair, 8 bytes (craft.md §3.6; U-001, U-026). */
export interface Pair {
  /** +0x00 i32. */
  readonly at00: number;
  /** +0x04 int32. */
  readonly at04: number;
}

/** Mount, 56 bytes (craft.md §3.6; U-001). */
export interface Mount {
  /** +0x00–+0x08 f32 × 3; for a gun mount the load code adds to +0x08, a consumer transform (craft.md §3.8). */
  readonly at00: F32x3;
  /** +0x0C int32. */
  readonly at0C: number;
  /** +0x10 u8: 0 makes `weapon` index `guns`, 1 makes it index `missiles`. */
  readonly at10: 0 | 1;
  /** +0x14 pointer: index in `guns` or `missiles`, as `at10` selects. */
  readonly weapon: number;
  /** +0x18 pointer: index in the same craft's `mounts`, or null for 0. */
  readonly at18: number | null;
  /** +0x1C pointer: as `at18`. */
  readonly at1C: number | null;
  /** +0x20 u32 bit set. */
  readonly at20: number;
  /** +0x24–+0x2C f32 × 3. */
  readonly at24: F32x3;
  /** +0x30 int32. */
  readonly at30: number;
  /** +0x34 int32. */
  readonly at34: number;
}

/** The fields craft records and missile body records share after their collision shapes (craft.md §3.5). */
interface CraftRecordValues {
  /** +0x54 i32. */
  readonly at54: number;
  /** +0x58 int32. */
  readonly at58: number;
  /** +0x5C i32. */
  readonly at5C: number;
  /** +0x60 i32. */
  readonly at60: number;
  /** +0x64–+0x70 int32 × 4. */
  readonly at64: Int32x4;
  /** +0x74 i32. */
  readonly at74: number;
  /** +0x78–+0x84 int32 × 4. */
  readonly at78: Int32x4;
  /** +0x88 i32. */
  readonly at88: number;
  /** +0x8C i32. */
  readonly at8C: number;
  /** +0x90 i32. */
  readonly at90: number;
}

interface CraftRecordTail {
  /** +0x9C i32. */
  readonly at9C: number;
  /** +0xA0 f32. */
  readonly atA0: number;
  /** +0xA4 int32. */
  readonly atA4: number;
  /** +0xA8 i32. */
  readonly atA8: number;
  /** +0xAC f32. */
  readonly atAC: number;
  /** +0xB0 f32. */
  readonly atB0: number;
  /** +0xB4 f32. */
  readonly atB4: number;
  /** +0xB8 f32. */
  readonly atB8: number;
  /** +0xBC f32 (type Likely, data). */
  readonly atBC: number;
  /** +0xC0 f32 (type Likely, data). */
  readonly atC0: number;
  /** +0xC4 int32. */
  readonly atC4: number;
  /** +0xC8 int32 (type Likely, data). */
  readonly atC8: number;
}

/** Craft record, 236 bytes (craft.md §3.5; U-001, U-008, U-026); its index in `craft` is its kind bit. */
export interface CraftRecord extends CraftRecordValues, CraftRecordTail {
  /** +0x00 text (text Likely: no reader). */
  readonly at00: ByteString;
  /** +0x04 text: the object name the communications code matches. */
  readonly name: ByteString;
  /** +0x08 f32 (type Likely, data). */
  readonly at08: number;
  /** +0x0C f32. */
  readonly at0C: number;
  /** +0x10–+0x53. */
  readonly collision: CraftCollisionShape;
  /** +0x94 pointer and +0x98 i32 count. */
  readonly pairs: readonly Pair[];
  /** Lists 0, 1 and 2 at +0xCC, +0xD4 and +0xDC (each a pointer and an i32 count): indexes in `mounts`. */
  readonly mountLists: readonly [readonly number[], readonly number[], readonly number[]];
  /** +0xE4 pointer and +0xE8 i32 count. */
  readonly mounts: readonly Mount[];
}

/** Collision shape of a missile body record: no load code writes a body record, so every typed position is kept. */
export interface BodyCollisionShape {
  /** Shape +0x00 f32. */
  readonly at00: number;
  /** Shape +0x04 f32. */
  readonly at04: number;
  /** Shape +0x08–+0x1C f32 × 6. */
  readonly at08: F32x6;
  /** Shape +0x28 int32. */
  readonly at28: number;
  /** Shape +0x2C–+0x40 f32 × 6. */
  readonly at2C: F32x6;
}

/**
 * Missile body record: the 236-byte craft layout with the craft types (craft.md §3.5; U-001, U-008). Its text, array and count
 * positions must be zero in the source, so it has no names, boxes, pairs, mount lists or mounts.
 */
export interface MissileBodyRecord extends CraftRecordValues, CraftRecordTail {
  /** +0x08 f32. */
  readonly at08: number;
  /** +0x0C f32. */
  readonly at0C: number;
  /** +0x10–+0x53. */
  readonly collision: BodyCollisionShape;
}

export interface CraftInfo {
  /** TABL 4003 pair +0x04 f32 of the selected slot and group: the scale of summed weapon-hit damage (craft.md §2). */
  readonly hitDamageScale: number;
  /** CINF header +0x00/+0x04, in source order. */
  readonly guns: readonly GunRecord[];
  /** CINF header +0x08/+0x0C, in source order. */
  readonly missiles: readonly MissileRecord[];
  /** CINF header +0x10/+0x14: exactly one record per kind bit 0–19, by kind bit. */
  readonly craft: readonly CraftRecord[];
  /** CINF header +0x18/+0x1C, in source order. */
  readonly missileBodies: readonly MissileBodyRecord[];
}

const readF32x3 = tuples<F32x3>(3, readF32);
const readF32x6 = tuples<F32x6>(6, readF32);
const readInt32x4 = tuples<Int32x4>(4, readInt32);
const readName = byteStrings(CRAFT_INFO_LIMITS.nameBytes);

export const BOX: Shape<Box> = { lower: readF32x3, upper: readF32x3 };

const GUN: Shape<GunRecord> = {
  name: readName, at08: readF32, at14: readI32, at18: readInt32, at1C: readInt32, at20: readF32, at24: readI32, at28: readU8,
  at2C: readI32,
};

const MISSILE: Shape<MissileRecord> = {
  name: readName, body: readIndex, at18: readU8, at1C: readInt32, at20: readInt32, at24: readU8, at28: readF32,
  at30: readInt32, at34: readI32, at38: readInt32, at3C: readInt32, at40: readF32, at44: readI32, at48: readInt32,
  at4C: readF32, at54: readU32, at58: readI32, at5C: readI32, at60: readF32, at64: readF32,
};

const CRAFT_SHAPE: Shape<CraftCollisionShape> = {
  at00: (value, path) => readNullable(value, path, readF32),
  at08: (value, path) => readNullable(value, path, readF32x6),
  boxes: listOf(CRAFT_INFO_LIMITS.boxes, records(BOX)),
  at28: readInt32,
  at2C: readF32x6,
};

const BODY_SHAPE: Shape<BodyCollisionShape> = { at00: readF32, at04: readF32, at08: readF32x6, at28: readInt32, at2C: readF32x6 };

const PAIR: Shape<Pair> = { at00: readI32, at04: readInt32 };

const MOUNT: Shape<Mount> = {
  at00: readF32x3,
  at0C: readInt32,
  at10: (value, path) => {
    const kind = readU8(value, path);
    return kind === 0 || kind === 1 ? kind : invalid(path, 'must be 0 or 1');
  },
  weapon: readIndex,
  at18: (value, path) => readNullable(value, path, readIndex),
  at1C: (value, path) => readNullable(value, path, readIndex),
  at20: readU32,
  at24: readF32x3,
  at30: readInt32,
  at34: readInt32,
};

const VALUES: Shape<CraftRecordValues> = {
  at54: readI32, at58: readInt32, at5C: readI32, at60: readI32, at64: readInt32x4, at74: readI32, at78: readInt32x4,
  at88: readI32, at8C: readI32, at90: readI32,
};

const TAIL: Shape<CraftRecordTail> = {
  at9C: readI32, atA0: readF32, atA4: readInt32, atA8: readI32, atAC: readF32, atB0: readF32, atB4: readF32, atB8: readF32,
  atBC: readF32, atC0: readF32, atC4: readInt32, atC8: readInt32,
};

const readMountList = listOf(CRAFT_INFO_LIMITS.mountListEntries, readIndex);
const readCraftShape = records(CRAFT_SHAPE);

const CRAFT: Shape<CraftRecord> = {
  at00: readName,
  name: readName,
  at08: readF32,
  at0C: readF32,
  collision: (value, path) => {
    const shape = readCraftShape(value, path);
    const boxed = shape.boxes.length > 0;
    if ((shape.at00 === null) !== boxed) invalid(`${path}.at00`, 'must be null exactly when the shape has boxes');
    if ((shape.at08 === null) !== boxed) invalid(`${path}.at08`, 'must be null exactly when the shape has boxes');
    return shape;
  },
  ...VALUES,
  pairs: listOf(CRAFT_INFO_LIMITS.pairs, records(PAIR)),
  ...TAIL,
  mountLists: (value, path) => readTuple(value, path, CRAFT_INFO_COUNTS.mountLists, readMountList) as CraftRecord['mountLists'],
  mounts: listOf(CRAFT_INFO_LIMITS.mounts, records(MOUNT)),
};

const BODY: Shape<MissileBodyRecord> = {
  at08: readF32,
  at0C: readF32,
  collision: records(BODY_SHAPE),
  ...VALUES,
  ...TAIL,
};

const readCraft = records(CRAFT);

const readInfo = records<CraftInfo>({
  hitDamageScale: readF32,
  guns: listOf(CRAFT_INFO_LIMITS.guns, records(GUN)),
  missiles: listOf(CRAFT_INFO_LIMITS.missiles, records(MISSILE)),
  craft: (value, path) => readTuple(value, path, CRAFT_INFO_COUNTS.craft, readCraft),
  missileBodies: listOf(CRAFT_INFO_LIMITS.missileBodies, records(BODY)),
});

/** Every position in the content names a record of the array its field selects. */
function checkReferences(info: CraftInfo, path: string): void {
  info.missiles.forEach(({ body }, index) => requireTarget(body, info.missileBodies.length, `${path}.missiles[${index}].body`, 'a missile body'));
  info.craft.forEach((craft, craftIndex) => {
    const at = `${path}.craft[${craftIndex}]`;
    const mounts = craft.mounts.length;
    craft.mountLists.forEach((list, listIndex) => list.forEach((mount, entry) =>
      requireTarget(mount, mounts, `${at}.mountLists[${listIndex}][${entry}]`, 'a mount of the craft')));
    craft.mounts.forEach((mount, mountIndex) => {
      const mountAt = `${at}.mounts[${mountIndex}]`;
      const [weapons, target] = mount.at10 === 0 ? [info.guns.length, 'a gun'] : [info.missiles.length, 'a missile'];
      requireTarget(mount.weapon, weapons, `${mountAt}.weapon`, target);
      if (mount.at18 !== null) requireTarget(mount.at18, mounts, `${mountAt}.at18`, 'a mount of the craft');
      if (mount.at1C !== null) requireTarget(mount.at1C, mounts, `${mountAt}.at1C`, 'a mount of the craft');
    });
  });
}

/** Strictly reads `data/craft-info` content into frozen data isolated from `value`. */
export function readCraftInfo(value: unknown, path = 'craftInfo'): CraftInfo {
  const info = readInfo(value, path);
  checkReferences(info, path);
  return info;
}
