import { describe, expect, it } from 'vitest';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { AI_SCRIPT_END_OPCODE } from './ai-programs.ts';
import { readRuleDataContent, type RuleDataRole } from './rule-data-payload.ts';
import {
  absentMessage, box, builtInProgram, categoryItem, commandItem, craft, F32_DENORMAL, MARKER, message, mount, parameterEntry, script,
  scriptItem, SYNTHETIC_RULE_DATA, syntheticCommMenus, type syntheticCommMessages, syntheticDebrisParameters, type syntheticAiPrograms, type syntheticCraftInfo,
  tableProgram, text,
} from './rule-data.test-support.ts';

type Content = Record<string, unknown>;

const F32_MAX = 3.4028234663852886e38;

/** Reads the role's synthetic content after `change`. */
function read(role: RuleDataRole, change: (content: never) => void) {
  const content = SYNTHETIC_RULE_DATA[role]();
  change(content as never);
  return readRuleDataContent(role, content).content as unknown as Content;
}

const expectInvalid = (role: RuleDataRole, change: (content: never) => void, path: string, code = 'invalid-logic-payload') =>
  expectContractError(() => read(role, change), code, path, [MARKER]);

const expectMismatch = (role: RuleDataRole, change: (content: never) => void, path: string) =>
  expectInvalid(role, change, path, 'logic-reference-mismatch');

type Craft = ReturnType<typeof syntheticCraftInfo>;
type Ai = ReturnType<typeof syntheticAiPrograms>;

describe('rule-data field types', () => {
  // Each storage type on one representative field: values the type holds pass unchanged, others fail at the field's path.
  const TYPES: readonly [string, RuleDataRole, string, (content: never, value: unknown) => void, readonly unknown[], readonly unknown[]][] = [
    ['i32', 'craft-info', 'craftInfo.guns[0].at14', (content: Craft, value) => { content.guns[0].at14 = value as number; },
      [-0x80000000, 0x7fffffff, 0], [0x80000000, -0x80000001, 1.5, '1', null, true]],
    ['u32', 'craft-info', 'craftInfo.missiles[0].at54', (content: Craft, value) => { content.missiles[0].at54 = value as number; },
      [0, 0xffffffff], [-1, 0x100000000, 0.5]],
    ['int32', 'craft-info', 'craftInfo.guns[0].at18', (content: Craft, value) => { content.guns[0].at18 = value as number; },
      [0, 0x7fffffff], [0x80000000, 0xffffffff, -1]],
    ['u8', 'craft-info', 'craftInfo.guns[0].at28', (content: Craft, value) => { content.guns[0].at28 = value as number; },
      [0, 255], [256, -1]],
    ['f32', 'craft-info', 'craftInfo.guns[0].at08', (content: Craft, value) => { content.guns[0].at08 = value as number; },
      [F32_DENORMAL, -F32_DENORMAL, F32_MAX, -F32_MAX, 0], [0.1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 128, 2 ** -150, null, '1']],
    ['byte string', 'craft-info', 'craftInfo.guns[0].name', (content: Craft, value) => { content.guns[0].name = value as string; },
      ['', '\x01\x7f\x80\xff', text(64)], ['\x00', '\u0100', '\ud800', 5, null]],
    ['nullable index', 'craft-info', 'craftInfo.craft[0].mounts[1].at18', (content: Craft, value) => {
      content.craft[0].mounts[1].at18 = value as number;
    }, [null, 0, 2], [-1, 0.5, '0']],
    ['code identity offset', 'ai-programs', 'aiPrograms.builtInPrograms[0].handler.offset', (content: Ai, value) => {
      content.builtInPrograms[0].handler.offset = value as number;
    }, [0, 0xffffffff], [-1, 0x100000000, null]],
    ['code identity object', 'ai-programs', 'aiPrograms.builtInPrograms[0].handler.object', (content: Ai, value) => {
      content.builtInPrograms[0].handler.object = value as number;
    }, [1, 0xffff], [0, 0x10000, null]],
  ];

  it.each(TYPES)('%s keeps the values it holds and rejects others', (_, role, path, set, valid, invalid) => {
    const field = (content: Content) => path.split(/\.|\[|\]\.?/).filter(Boolean).slice(1)
      .reduce<unknown>((value, key) => (value as Content)[key], content);
    for (const value of valid) {
      const content = read(role, content => set(content, value));
      expect(Object.is(field(content), value === 0 ? 0 : value)).toBe(true);
    }
    for (const value of invalid) expectInvalid(role, content => set(content, value), path);
  });

  it('reads -0 as 0', () => {
    const content = read('craft-info', (info: Craft) => { info.guns[0].at08 = -0; info.guns[0].at14 = -0; });
    const [first] = content.guns as Content[];
    expect(Object.is(first.at08, 0) && Object.is(first.at14, 0)).toBe(true);
  });

  it('rejects arrays with extra fields, holes or accessors', () => {
    const holes = [box()];
    holes.length = 2;
    expectInvalid('craft-info', (info: Craft) => { info.craft[0].collision.boxes = holes; }, 'craftInfo.craft[0].collision.boxes');
    const extra = Object.assign([0, 0, 0, 0, 0, 0], { more: 1 });
    expectInvalid('craft-info', (info: Craft) => { info.craft[0].collision.at2C = extra; }, 'craftInfo.craft[0].collision.at2C');
    const accessor = Object.defineProperty({ ...syntheticCommMenus() }, 'objectListLastEntry', { get: () => 'x', enumerable: true });
    expectContractError(() => readRuleDataContent('comm-menus', accessor), 'invalid-logic-payload', 'commMenus');
  });
});

describe('craft-info content', () => {
  it('keeps the radius and bounds of a shape exactly when it has no boxes', () => {
    expectInvalid('craft-info', (info: Craft) => { info.craft[0].collision.at00 = 1 as never; }, 'craftInfo.craft[0].collision.at00');
    expectInvalid('craft-info', (info: Craft) => { info.craft[0].collision.at08 = [0, 0, 0, 0, 0, 0] as never; }, 'craftInfo.craft[0].collision.at08');
    expectInvalid('craft-info', (info: Craft) => { info.craft[1].collision.at00 = null as never; }, 'craftInfo.craft[1].collision.at00');
    expectInvalid('craft-info', (info: Craft) => { info.craft[1].collision.at08 = null as never; }, 'craftInfo.craft[1].collision.at08');
    expectInvalid('craft-info', (info: Craft) => { info.craft[1].collision.at08 = [0, 0, 0, 0, 0] as never; }, 'craftInfo.craft[1].collision.at08');
  });

  it('allows only the two weapon arrays a mount can select', () => {
    expectInvalid('craft-info', (info: Craft) => { info.craft[0].mounts[0].at10 = 2; }, 'craftInfo.craft[0].mounts[0].at10');
  });

  it('has no text, box, pair, list or mount fields in missile bodies', () => {
    const content = read('craft-info', () => undefined);
    const [body] = content.missileBodies as Content[];
    for (const key of ['at00', 'name', 'pairs', 'mountLists', 'mounts']) expect(Object.keys(body)).not.toContain(key);
    expect(Object.keys(body.collision as Content)).toEqual(['at00', 'at04', 'at08', 'at28', 'at2C']);
    expectInvalid('craft-info', (info: Craft) => { (info.missileBodies[0] as Content).mounts = []; }, 'craftInfo.missileBodies[0]');
  });

  it('carries the fields in source order and no position the load code overwrites', () => {
    const content = read('craft-info', () => undefined);
    const [gun] = content.guns as Content[];
    expect(Object.keys(gun)).toEqual(['name', 'at08', 'at14', 'at18', 'at1C', 'at20', 'at24', 'at28', 'at2C']);
    const [missile] = content.missiles as Content[];
    for (const key of ['at00', 'at08', 'at0C', 'at10', 'at2C', 'at50']) expect(Object.keys(missile)).not.toContain(key);
    expect(Object.keys(missile).slice(0, 3)).toEqual(['name', 'body', 'at18']);
    const [first] = content.craft as Content[];
    expect(Object.keys(first)).toEqual([
      'at00', 'name', 'at08', 'at0C', 'collision', 'at54', 'at58', 'at5C', 'at60', 'at64', 'at74', 'at78', 'at88', 'at8C', 'at90',
      'pairs', 'at9C', 'atA0', 'atA4', 'atA8', 'atAC', 'atB0', 'atB4', 'atB8', 'atBC', 'atC0', 'atC4', 'atC8', 'mountLists', 'mounts',
    ]);
  });

  it.each([
    ['a missile body', (info: Craft) => { info.missiles[1].body = 2; }, 'craftInfo.missiles[1].body'],
    ['a gun', (info: Craft) => { info.craft[0].mounts[0].weapon = 2; }, 'craftInfo.craft[0].mounts[0].weapon'],
    ['a missile', (info: Craft) => { info.craft[0].mounts[2].weapon = 2; }, 'craftInfo.craft[0].mounts[2].weapon'],
    ['a linked mount', (info: Craft) => { info.craft[0].mounts[1].at1C = 3; }, 'craftInfo.craft[0].mounts[1].at1C'],
    ['a listed mount', (info: Craft) => { info.craft[0].mountLists[2] = [3]; }, 'craftInfo.craft[0].mountLists[2][0]'],
    ['a mount of a craft without mounts', (info: Craft) => { info.craft[7].mountLists[0] = [0]; }, 'craftInfo.craft[7].mountLists[0][0]'],
  ] as const)('rejects a reference past %s', (_, change, path) => expectMismatch('craft-info', change, path));

  it('accepts a mount whose weapon index is valid only in the array its kind selects', () => {
    const content = read('craft-info', (info: Craft) => {
      info.guns.push(info.guns[0]);
      info.craft[0].mounts[0].weapon = 2;
    });
    expect(((content.craft as Content[])[0].mounts as Content[])[0].weapon).toBe(2);
    expectMismatch('craft-info', (info: Craft) => {
      info.guns.push(info.guns[0]);
      info.craft[0].mounts[0] = mount({ at10: 1, weapon: 2 });
    }, 'craftInfo.craft[0].mounts[0].weapon');
  });

  it('keeps craft records by kind bit, including plain ones', () => {
    const content = read('craft-info', (info: Craft) => { info.craft[19] = craft({ at54: -1 }); });
    expect(((content.craft as Content[])[19]).at54).toBe(-1);
  });
});

describe('debris-parameters content', () => {
  it('keeps empty kind bits and the stored first vector', () => {
    const content = readRuleDataContent('debris-parameters', syntheticDebrisParameters()).content as unknown as Content;
    const kinds = content.byCraftType as Content[][];
    expect(kinds[13]).toEqual([]);
    expect(kinds[2][2].at00).toEqual([2, 2, -1]);
    expect(Object.keys(kinds[0][0])).toEqual(['at00', 'collision']);
    expect(Object.keys(kinds[0][0].collision as Content)).toEqual(['boxes', 'at28', 'at2C']);
  });

  it('rejects malformed records', () => {
    type Debris = ReturnType<typeof syntheticDebrisParameters>;
    expectInvalid('debris-parameters', (debris: Debris) => { debris.byCraftType[0][0].at00 = [1, 2]; }, 'debrisParameters.byCraftType[0][0].at00');
    expectInvalid('debris-parameters', (debris: Debris) => { debris.byCraftType[0][0].collision.boxes = [{ lower: [0, 0, 0] }] as never; },
      'debrisParameters.byCraftType[0][0].collision.boxes[0].upper');
    expectInvalid('debris-parameters', (debris: Debris) => { debris.byCraftType[1] = null as never; }, 'debrisParameters.byCraftType[1]');
  });
});

describe('ai-programs content', () => {
  it('carries null for the source zeros the load code replaces and rejects 0 itself', () => {
    const content = read('ai-programs', () => undefined);
    const programs = content.programs as Content[];
    expect([programs[1].kindMask, programs[1].at2C]).toEqual([null, null]);
    expectInvalid('ai-programs', (ai: Ai) => { ai.programs[0].kindMask = 0; }, 'aiPrograms.programs[0].kindMask');
    expectInvalid('ai-programs', (ai: Ai) => { ai.programs[0].at2C = 0; }, 'aiPrograms.programs[0].at2C');
    expectInvalid('ai-programs', (ai: Ai) => { ai.programs[0].at2C = -0; }, 'aiPrograms.programs[0].at2C');
  });

  it('keeps built-in programs as stored, without load transforms or entry references', () => {
    const content = read('ai-programs', (ai: Ai) => { ai.builtInPrograms[0].at2C = 0; });
    const [builtIn] = content.builtInPrograms as Content[];
    expect([builtIn.kindMask, builtIn.at2C]).toEqual([0, 0]);
    expect(Object.keys(builtIn)).not.toEqual(expect.arrayContaining(['parameters']));
    expect(builtIn.handler).toEqual({ object: 2, offset: 0x100 });
    expectInvalid('ai-programs', (ai: Ai) => { ai.builtInPrograms[0].kindMask = null as never; }, 'aiPrograms.builtInPrograms[0].kindMask');
    expectInvalid('ai-programs', (ai: Ai) => { (ai.builtInPrograms[0] as Content).parameters = 0; }, 'aiPrograms.builtInPrograms[0]');
  });

  it('ends every script exactly at its last item', () => {
    expectInvalid('ai-programs', (ai: Ai) => { ai.entries[3] = script([scriptItem(109)]); }, 'aiPrograms.entries[3].items[0].opcode');
    expectInvalid('ai-programs', (ai: Ai) => { ai.entries[3] = script([scriptItem(AI_SCRIPT_END_OPCODE), scriptItem(AI_SCRIPT_END_OPCODE)]); },
      'aiPrograms.entries[3].items[0].opcode');
    expectInvalid('ai-programs', (ai: Ai) => { ai.entries[3] = script([]); }, 'aiPrograms.entries[3].items');
    expectMismatch('ai-programs', (ai: Ai) => { ai.entries[3] = script([scriptItem(9000, null, 2), scriptItem(AI_SCRIPT_END_OPCODE)]); },
      'aiPrograms.entries[3].items[0].branch');
  });

  it('reads each entry by its kind', () => {
    expectInvalid('ai-programs', (ai: Ai) => { (ai.entries[3] as Content).kind = 'table'; }, 'aiPrograms.entries[3].kind');
    expectInvalid('ai-programs', (ai: Ai) => { (ai.entries[3] as Content).kind = 'parameters'; }, 'aiPrograms.entries[3].at04');
    expectInvalid('ai-programs', (ai: Ai) => { delete (ai.entries[3] as Content).kind; }, 'aiPrograms.entries[3].kind');
    const content = read('ai-programs', () => undefined);
    expect((content.entries as Content[]).map(entry => entry.kind)).toEqual(['parameters', 'script', 'script', 'script', 'parameters', 'script']);
  });

  it.each([
    ['a program past the entries', (ai: Ai) => { ai.programs[2].parameters = 6; }, 'aiPrograms.programs[2].parameters'],
    ['a program naming a script', (ai: Ai) => { ai.programs[2].parameters = 1; }, 'aiPrograms.programs[2].parameters'],
    ['an install script naming parameters', (ai: Ai) => { (ai.entries[4] as Content).installScript = 0; }, 'aiPrograms.entries[4].installScript'],
    ['a state list past the entries', (ai: Ai) => { ai.entries[0] = parameterEntry(1, { state1: [2], state2: [3], state3: [9] }); },
      'aiPrograms.entries[0].stateScripts.state3[0]'],
    ['entries out of first-reach order', (ai: Ai) => { ai.entries[0] = parameterEntry(1, { state1: [3], state2: [2] }); },
      'aiPrograms.entries[0].stateScripts.state1[0]'],
    ['a program reaching entries late', (ai: Ai) => { ai.programs = [tableProgram(4), tableProgram(0)]; }, 'aiPrograms.programs[0].parameters'],
    ['an entry no program reaches', (ai: Ai) => { ai.entries.push(script()); }, 'aiPrograms.entries[6]'],
    ['entries without programs', (ai: Ai) => { ai.programs = []; }, 'aiPrograms.entries[0]'],
  ] as const)('rejects %s', (_, change, path) => expectMismatch('ai-programs', change, path));

  it('allows scripts listed repeatedly and programs sharing parameters, and nothing at all', () => {
    const content = read('ai-programs', (ai: Ai) => { (ai.entries[0] as ReturnType<typeof parameterEntry>).stateScripts.state5 = [1, 1, 3]; });
    expect(((content.entries as Content[])[0].stateScripts as Content).state5).toEqual([1, 1, 3]);
    const empty = read('ai-programs', (ai: Ai) => { ai.programs = []; ai.entries = []; ai.builtInPrograms = []; ai.globals.elements = []; });
    expect([empty.programs, empty.entries, empty.builtInPrograms]).toEqual([[], [], []]);
    expect(builtInProgram(0).handler).toEqual({ object: 2, offset: 0 });
  });
});

describe('comm-menus content', () => {
  type Menus = ReturnType<typeof syntheticCommMenus>;

  it('ends each list exactly at its item whose value is 0', () => {
    expectInvalid('comm-menus', (menus: Menus) => { menus.kind2TargetCommands[2].command = 3; }, 'commMenus.kind2TargetCommands[2].command');
    expectInvalid('comm-menus', (menus: Menus) => { menus.kind2TargetCommands[0].command = 0; }, 'commMenus.kind2TargetCommands[0].command');
    expectInvalid('comm-menus', (menus: Menus) => { menus.categories = [categoryItem(1)]; }, 'commMenus.categories[0].kindMask');
    expectInvalid('comm-menus', (menus: Menus) => { menus.otherTargetCommands = []; }, 'commMenus.otherTargetCommands');
    expectInvalid('comm-menus', (menus: Menus) => { menus.categories = [commandItem(0)] as never; }, 'commMenus.categories[0].kindMask');
  });

  it('keeps the texts and values as stored', () => {
    const content = read('comm-menus', () => undefined);
    expect(Object.keys(content)).toEqual(['gatedTargetCommands', 'otherTargetCommands', 'categories', 'objectListLastEntry', 'kind2TargetCommands']);
    expect((content.gatedTargetCommands as Content[])[1]).toEqual({ text: text(10), command: 0xffffffff });
    expect(content.objectListLastEntry).toBe(text(8));
  });
});

describe('comm-messages content', () => {
  type Messages = ReturnType<typeof syntheticCommMessages>;

  it('keeps the tables, absent entries, durations and names as stored, in field order', () => {
    const content = read('comm-messages', () => undefined);
    expect(Object.keys(content)).toEqual(['faceTables', 'direct', 'names2001', 'names2011']);
    const faceTables = content.faceTables as Content[][][];
    expect(faceTables.map(table => table.map(sub => sub.length))).toEqual([[3, 1], [2], [1, 2, 1]]);
    expect(faceTables[0][0]).toEqual([message(3, 9, 2), absentMessage(), message(0, 1, 7, 0x7fffffff)]);
    expect(Object.keys(faceTables[0][0][0])).toEqual(['present', 'frameDurations']);
    expect(content.names2001).toEqual([text(9), text(1), text(32)]);
  });

  it.each([
    ['a fourth face table', (messages: Messages) => { messages.faceTables.push([]); }, 'commMessages.faceTables'],
    ['two face tables', (messages: Messages) => { messages.faceTables.pop(); }, 'commMessages.faceTables'],
    ['a message without frames', (messages: Messages) => { messages.direct[0] = message(); }, 'commMessages.direct[0].frameDurations'],
    ['a negative duration', (messages: Messages) => { messages.faceTables[2][2][1] = message(4, -1); }, 'commMessages.faceTables[2][2][1].frameDurations[1]'],
    ['a duration beyond i32', (messages: Messages) => { messages.direct[2] = message(0x80000000); }, 'commMessages.direct[2].frameDurations[0]'],
    ['a fractional duration', (messages: Messages) => { messages.direct[2] = message(1.5); }, 'commMessages.direct[2].frameDurations[0]'],
    ['an absent message with durations', (messages: Messages) => { messages.direct[1] = { present: false, frameDurations: [1] } as never; },
      'commMessages.direct[1]'],
    ['a present message without durations', (messages: Messages) => { messages.direct[1] = { present: true } as never; }, 'commMessages.direct[1].frameDurations'],
    ['a present flag that is no boolean', (messages: Messages) => { messages.direct[1] = { present: 1 } as never; }, 'commMessages.direct[1].present'],
    ['an unknown message field', (messages: Messages) => { messages.direct[0] = { ...message(1), frames: 1 } as never; }, 'commMessages.direct[0]'],
    ['a sub-table that is no list', (messages: Messages) => { messages.faceTables[0][1] = {} as never; }, 'commMessages.faceTables[0][1]'],
    ['an empty name', (messages: Messages) => { messages.names2011[0] = ''; }, 'commMessages.names2011[0]'],
    ['a name with a NUL', (messages: Messages) => { messages.names2001[1] = 'a\x00'; }, 'commMessages.names2001[1]'],
    ['a name beyond bytes', (messages: Messages) => { messages.names2001[1] = '\u0100'; }, 'commMessages.names2001[1]'],
    ['an unknown field', (messages: Messages) => { Object.assign(messages, { names2003: [] }); }, 'commMessages'],
  ])('rejects %s', (_, change, path) => {
    expectInvalid('comm-messages', change, path);
  });

  it('accepts empty tables and lists', () => {
    const content = read('comm-messages', (messages: Messages) => {
      messages.faceTables = [[], [[]], []];
      messages.direct = [];
      messages.names2001 = [];
      messages.names2011 = [];
    });
    expect(content).toEqual({ faceTables: [[], [[]], []], direct: [], names2001: [], names2011: [] });
  });
});

describe('base-repair-items content', () => {
  it.each([0, 31, 33, 34])('accepts the selector %i', selector => {
    const content = read('base-repair-items', (items: { subsystemSelectors: number[] }) => { items.subsystemSelectors[0] = selector; });
    expect((content.subsystemSelectors as number[])[0]).toBe(selector);
  });

  it.each([32, 35, 0xffffffff, -1, 1.5])('rejects the selector %d', selector => {
    expectInvalid('base-repair-items', (items: { subsystemSelectors: number[] }) => { items.subsystemSelectors[4] = selector; },
      'baseRepairItems.subsystemSelectors[4]');
  });
});

describe('flight-messages content', () => {
  it('keys the seven messages by sender and condition, in source order', () => {
    expect(Object.keys(read('flight-messages', () => undefined))).toEqual([
      'missionComplete', 'beacon', 'speedAssistOn', 'speedAssistOff', 'joystickSensitivity1', 'joystickSensitivity2', 'joystickSensitivity0',
    ]);
    expectInvalid('flight-messages', (messages: Content) => { messages.beacon = '\x00'; }, 'flightMessages.beacon');
  });
});
