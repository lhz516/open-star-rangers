export { deepFrozen } from '../logic/logic-content.test-support.ts';
import { syntheticGroup } from '../synthetic-content.test-support.ts';
import { encodeRuleDataPayload, RULE_DATA_SCHEMA_VERSIONS, type RuleDataPayload, type RuleDataRole } from './rule-data-payload.ts';

// Code-generated synthetic rule-data content for tests; it never holds original data. Builders return fresh mutable plain
// data that a test may corrupt. Texts carry MARKER so privacy assertions can prove they never reach diagnostics, and bytes
// of 0x80 and above to prove byte strings keep them.

export const MARKER = 'PRIVATE-rd-3b9f';

/**
 * A text of exactly `length` bytes: A, MARKER, Z and padding, cut to the length. Like the shipped texts, every byte lies
 * in the HUD fonts' character maps, so the cockpit can draw the names, menus and messages made from it (hud §4.1); tests
 * of byte strings beyond them give their own.
 */
export const text = (length = 24): string => `A${MARKER}Z${'t'.repeat(length)}`.slice(0, length);

/** The smallest positive f32 denormal; JSON carries it bit for bit. */
export const F32_DENORMAL = 2 ** -149;

const zeros = (length: number): number[] => Array<number>(length).fill(0);

export const box = (lower = [-1, -2, -3], upper = [1, 2, 3]) => ({ lower, upper });

export const gun = (overrides: Record<string, unknown> = {}) => ({
  name: text(18), at08: 2.5, at14: -7, at18: 0x7fffffff, at1C: 3, at20: 0.25, at24: 40, at28: 2, at2C: -1, ...overrides,
});

/**
 * A missile record. Its lifetime +0x44 (an i32) is 320, 5 s, as Core rejects a negative guidance time (P3-07/24); a
 * content test of the i32's negative range sets one itself.
 */
export const missile = (overrides: Record<string, unknown> = {}) => ({
  name: text(15), body: 0, at18: 1, at1C: 5, at20: 6, at24: 255, at28: 0.5, at30: 7, at34: -8, at38: 9, at3C: 10,
  at40: F32_DENORMAL, at44: 320, at48: 12, at4C: 1.75, at54: 0xffffffff, at58: -13, at5C: 14, at60: -0.125, at64: 3.5,
  ...overrides,
});

export const mount = (overrides: Record<string, unknown> = {}) => ({
  at00: [0.5, -1, 2], at0C: 0, at10: 0, weapon: 0, at18: null as number | null, at1C: null as number | null,
  at20: 0x80000001, at24: [1, 0, -1], at30: 0, at34: 1, ...overrides,
});

const values = () => ({
  at54: -100, at58: 200, at5C: 300, at60: -400, at64: [1, 2, 3, 4], at74: 5, at78: [6, 7, 8, 9], at88: 10, at8C: -11, at90: 0,
});

const tail = () => ({
  at9C: 12, atA0: 1.5, atA4: 13, atA8: -14, atAC: 0.75, atB0: 0.5, atB4: 0.25, atB8: 64, atBC: 2, atC0: -2, atC4: 0, atC8: 15,
});

/** A craft record whose collision shape has no boxes, so its radius and bounds are kept. */
export const craft = (overrides: Record<string, unknown> = {}) => ({
  at00: text(26), name: text(7), at08: 1, at0C: -1,
  collision: {
    at00: 4 as number | null, at08: [-4, -4, -4, 4, 4, 4] as number[] | null, boxes: [] as ReturnType<typeof box>[], at28: 0, at2C: zeros(6),
  },
  ...values(),
  pairs: [] as { at00: number; at04: number }[],
  ...tail(),
  mountLists: [[], [], []] as number[][],
  mounts: [] as ReturnType<typeof mount>[],
  ...overrides,
});

export const missileBody = (overrides: Record<string, unknown> = {}) => ({
  at08: 0, at0C: 0, collision: { at00: 0, at04: 0, at08: zeros(6), at28: 0, at2C: zeros(6) }, ...values(), ...tail(), ...overrides,
});

/**
 * Craft info with two guns, two missiles and bodies, and 20 craft records: record 0 with mounts of both weapon kinds,
 * linked mounts, mount lists, pairs and a boxed shape; record 1 with an inner box; the rest plain.
 */
export function syntheticCraftInfo() {
  return {
    hitDamageScale: 1.25,
    guns: [gun(), gun({ name: text(3), at28: 0 })],
    missiles: [missile(), missile({ body: 1, name: text(5) })],
    craft: [
      craft({
        collision: { at00: null, at08: null, boxes: [box(), box([-5, -5, -5], [0, 0, 0])], at28: 1, at2C: [-1, -1, -1, 1, 1, 1] },
        pairs: [{ at00: -1000, at04: 3 }, { at00: 2000, at04: 0x7fffffff }],
        mountLists: [[0, 1], [2], []],
        mounts: [mount(), mount({ weapon: 1, at18: 2, at1C: 0 }), mount({ at10: 1, weapon: 1, at0C: 4 })],
      }),
      craft({ collision: { at00: 0, at08: zeros(6), boxes: [], at28: 1, at2C: [-2, -2, -2, 2, 2, 2] } }),
      ...Array.from({ length: 18 }, () => craft()),
    ],
    missileBodies: [missileBody({ atAC: 1, atB0: 2, atB4: 3, atB8: 4, atBC: 5, atC8: 6 }), missileBody()],
  };
}

export const debrisRecord = (overrides: Record<string, unknown> = {}) => ({
  at00: [0.5, -0.5, 1], collision: { boxes: [box()], at28: 0, at2C: zeros(6) }, ...overrides,
});

/** Debris parameters with records for some kind bits and none for others. */
export function syntheticDebrisParameters() {
  return {
    byCraftType: Array.from({ length: 20 }, (_, kind) =>
      (kind === 13 || kind === 14 ? [] : Array.from({ length: (kind % 3) + 1 }, (__, index) => debrisRecord({ at00: [kind, index, -1] })))),
  };
}

const programHead = (name: string) => ({ name, at04: 0 });
const programMiddle = () => ({ at0C: 3, at10: -4, at14: 70 });
const programTail = () => ({ at30: 0.5, at34: 0, at38: 1, at3C: 2.5, at40: -2.5, at44: 0xffffffff, at48: 0.125, at4C: 8, at50: 1 });

export const tableProgram = (parameters: number, overrides: Record<string, unknown> = {}) => ({
  ...programHead(text(20)), kindMask: 0x6 as number | null, ...programMiddle(), parameters, at24: 1, at28: 2,
  at2C: 0.75 as number | null, ...programTail(), ...overrides,
});

export const builtInProgram = (offset: number, overrides: Record<string, unknown> = {}) => ({
  ...programHead(text(16)), kindMask: 0, ...programMiddle(), handler: { object: 2, offset }, at24: 1, at28: 2, at2C: -0.5,
  ...programTail(), ...overrides,
});

const stateScripts = (overrides: Record<string, number[]> = {}) => ({
  state1: [] as number[], state2: [] as number[], state3: [] as number[], state5: [] as number[], state4: [] as number[],
  state6: [] as number[], ...overrides,
});

export const parameterEntry = (installScript: number | null, scripts: Record<string, number[]> = {}) => ({
  kind: 'parameters', at04: 0, at08: 1.5, at10: 2, at14: 3, at18: 4, at1C: 0xffffffff, at20: 0.5, at24: 6, at28: 7, at2C: -1,
  at30: 0.25, at34: 1, installScript, stateScripts: stateScripts(scripts),
});

export const keyword = (name: string, value: number) => ({ name, value });

export const scriptItem = (opcode: number, argument: string | null = null, branch: number | null = null) => ({ opcode, argument, branch });

export const script = (items = [scriptItem(109, text(37)), scriptItem(9000, null, 0), scriptItem(10000)]) => ({ kind: 'script', items });

/**
 * AI programs whose two programs share a parameter entry; entries are in first-reach order: parameters 0 with its install
 * script and lists (one script listed twice), then parameters 4 with a script reached again.
 */
export function syntheticAiPrograms() {
  return {
    groupTriple: [-1, 0, 0x7fffffff],
    globals: {
      at08: -5, at0C: 0.5, at10: 1, at14: F32_DENORMAL, elements: [[0, 1, 2, 3], [-1, -2, -3, -4]], at20: 2, at24: 3, at28: 4,
      at2C: -6, at30: 7, at34: 8.5, at38: 0xfffffffe, at3C: 0.125, at40: 0.25, at44: 0.375, at48: 0.5,
    },
    programs: [tableProgram(0), tableProgram(4, { kindMask: null, at2C: null }), tableProgram(0, { name: text(1) })],
    entries: [
      parameterEntry(1, { state1: [2], state2: [3, 2], state6: [3] }),
      script(),
      script([scriptItem(1101, text(2)), scriptItem(10000, text(1))]),
      script([scriptItem(10000)]),
      parameterEntry(null, { state4: [5, 2] }),
      script(),
    ],
    builtInPrograms: [builtInProgram(0x100), builtInProgram(0xfffffff0, { name: text(4) })],
    keywordTables: syntheticKeywordTables(),
  };
}

/**
 * Keyword tables of made-up names and values: the first and fourth tables are equal (they share their names), names
 * repeat across tables, and the values include 0, negative values and the sign bit. Names within a table differ even
 * with A–Z folded, and two of them differ only in a byte outside A–Z that a fold would not change.
 */
export function syntheticKeywordTables() {
  const first = [keyword(text(5), 0), keyword(`${text(3)}Q`, -1), keyword(text(11), 0x7fffffff)];
  return [
    first,
    [keyword(text(1), 3), keyword(`${text(3)}q\xc4`, 2), keyword(`${text(3)}q\xe4`, 1), keyword(text(7), -0x80000000), keyword(text(5), 4), keyword(text(2), 5)],
    [keyword(text(9), 0), keyword(text(1), 1)],
    first.map(entry => ({ ...entry })),
  ];
}

export const commandItem = (command: number, length = 10) => ({ text: text(length), command });
export const categoryItem = (kindMask: number, length = 13) => ({ text: text(length), kindMask });

export function syntheticCommMenus() {
  return {
    gatedTargetCommands: [commandItem(1), commandItem(0xffffffff), commandItem(0)],
    otherTargetCommands: [commandItem(0)],
    categories: [categoryItem(0x1), categoryItem(0x80000), categoryItem(0, 32)],
    objectListLastEntry: text(8),
    kind2TargetCommands: [commandItem(9), commandItem(7, 1), commandItem(0, 0)],
  };
}

export const syntheticBaseRepairItems = () => ({ subsystemSelectors: [0, 31, 33, 34, 5, 7, 8, 1, 2, 31, 3] });

export const syntheticFlightMessages = () => ({
  missionComplete: text(45), beacon: text(128), speedAssistOn: text(15), speedAssistOff: text(16), joystickSensitivity1: text(27),
  joystickSensitivity2: text(25), joystickSensitivity0: text(0),
});

/** A COMMFACE table entry of 0. */
export const absentMessage = () => ({ present: false });
/** A COMMFACE table entry naming a CMOV whose frames last `frameDurations`, in 1/8 s. */
export const message = (...frameDurations: number[]) => ({ present: true, frameDurations });

/**
 * Communications messages of made-up shape: face tables of 2, 1 and 3 faces with sub-tables of 1 to 3 messages, absent
 * entries, 1 to 4 frames, durations 0 and 2³¹−1, and name lists whose names carry MARKER, 0x80 and 0xFF. No list is
 * empty, as an archive entry cannot be.
 */
export function syntheticCommMessages() {
  return {
    faceTables: [
      [[message(3, 9, 2), absentMessage(), message(0, 1, 7, 0x7fffffff)], [message(6)]],
      [[absentMessage(), message(10, 1, 1)]],
      [[absentMessage()], [message(4, 12, 5), message(2, 2, 2, 2)], [message(9, 9, 9)]],
    ],
    direct: [message(13, 1, 8), absentMessage(), message(5, 7, 3, 1)],
    names2001: [text(9), text(1), text(32)],
    names2011: [text(17)],
  };
}

export const SYNTHETIC_RULE_DATA: Readonly<Record<RuleDataRole, () => unknown>> = Object.freeze({
  'craft-info': syntheticCraftInfo,
  'debris-parameters': syntheticDebrisParameters,
  'ai-programs': syntheticAiPrograms,
  'comm-menus': syntheticCommMenus,
  'base-repair-items': syntheticBaseRepairItems,
  'flight-messages': syntheticFlightMessages,
  'comm-messages': syntheticCommMessages,
});

/** The canonical bytes and a matching mutable descriptor for one role's synthetic content. */
export function syntheticRuleDataAsset(role: RuleDataRole, content: unknown = SYNTHETIC_RULE_DATA[role]()) {
  const bytes = encodeRuleDataPayload({ role, content } as RuleDataPayload);
  const [descriptor] = syntheticGroup('logic', [{ id: `data/${role}`, role, bytes, schemaVersion: RULE_DATA_SCHEMA_VERSIONS[role] }]).manifest.assets;
  return { bytes, descriptor };
}
