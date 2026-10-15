import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { MARKER as RULE_DATA_MARKER } from '../../content/rule-data/rule-data.test-support.ts';
import { CoreInputError } from '../errors.ts';
import { nameIndexOf, type NameIndexTable } from './comm-input.ts';
import { createWorld, initialWorldState } from './create-world.ts';
import {
  asCreateInput, baseRepairItemsContent, commMenusContent, commMessagesContent, craftInfoContent, MARKER, menuText, originalImportIdentity, rosterContent,
  ruleInputs, sliceMission, worldInput, type WorldInputParts,
} from './create-world.test-support.ts';
import { thrownBy } from './world.test-support.ts';

// World creation's communications inputs and their semantic checks (docs/plan/p3/02/spec.md, CB-01; P3-10 AC-02).
// Synthetic content only; expectations follow from CB-01 and comm.md, not from the code under test.

type Menus = ReturnType<typeof commMenusContent>;
type Messages = ReturnType<typeof commMessagesContent>;
type CommandTable = 'gatedTargetCommands' | 'otherTargetCommands' | 'kind2TargetCommands';

const MENUS = 'input.commMenus.content';
const SELECTORS = 'input.baseRepairItems.content.subsystemSelectors';
const COMMAND_TABLES: readonly CommandTable[] = ['gatedTargetCommands', 'otherTargetCommands', 'kind2TargetCommands'];
const code = (key: string): number => key.charCodeAt(0);

const create = (input: unknown) => initialWorldState(asCreateInput(input));
const communications = (parts: WorldInputParts = {}) => create(worldInput(parts)).ruleData.communications;

/** Menus, selectors or messages after `change`. */
function menusWith(change: (menus: Menus) => void): Menus {
  const menus = commMenusContent();
  change(menus);
  return menus;
}

function messagesWith(change: (messages: Messages) => void): Messages {
  const messages = commMessagesContent();
  change(messages);
  return messages;
}

/** Asserts that creation from `input` throws `type` at `path`, naming no imported value. */
function expectInputRejected(input: unknown, path: string, reason?: string, type: new (...args: never[]) => Error = CoreInputError): void {
  const error = thrownBy(() => createWorld(asCreateInput(input)));
  expect(error).toBeInstanceOf(type);
  expect(error).toMatchObject({ path });
  if (reason !== undefined) expect((error as CoreInputError).reason).toContain(reason);
  expect((error as Error).message).not.toContain(MARKER);
  expect((error as Error).message).not.toContain(RULE_DATA_MARKER);
}

/** expectInputRejected for the input of `parts`. */
const expectRejected = (parts: WorldInputParts, path: string, reason?: string, type?: new (...args: never[]) => Error): void =>
  expectInputRejected(worldInput(parts), path, reason, type);

const expectAccepted = (parts: WorldInputParts) => expect(() => createWorld(asCreateInput(worldInput(parts)))).not.toThrow();

/** The slice-shaped mission with the base record's (declaration 7, kind bit 17) requests per firing set to `craftCount`. */
function withBases(craftCount: number) {
  const mission = sliceMission();
  mission.declarations[7].ruleInputs = ruleInputs({ craftCount });
  return mission;
}

const categories = (...masks: number[]) => menusWith((menus) => {
  menus.categories = [...masks.map((kindMask, index) => ({ text: menuText(String(index + 1)), kindMask })), { text: menuText('x'), kindMask: 0 }];
});

describe('communications inputs (CB-01): reading', () => {
  it('requires the three fields, each exactly { id, content }', () => {
    for (const field of ['commMenus', 'baseRepairItems', 'commMessages']) {
      const missing = worldInput() as Record<string, unknown>;
      Reflect.deleteProperty(missing, field);
      expectInputRejected(missing, `input.${field}`, 'is required');
      const extra = worldInput() as unknown as Record<string, Record<string, unknown>>;
      extra[field].extra = 1;
      expectInputRejected(extra, `input.${field}`, 'contains unknown fields');
    }
  });

  it('takes data Asset IDs: any for synthetic content, only the production Asset for original-import content', () => {
    for (const [field, production] of [['commMenus', 'data/comm-menus'], ['baseRepairItems', 'data/base-repair-items'], ['commMessages', 'data/comm-messages']] as const) {
      const renamed = (id: string, identity?: Record<string, unknown>) => {
        const input = worldInput(identity ? { identity } : {}) as unknown as Record<string, { id: string }>;
        input[field].id = id;
        return input;
      };
      expect(() => createWorld(asCreateInput(renamed('data/other')))).not.toThrow();
      expectInputRejected(renamed('model/other'), `input.${field}.id`, 'must be a data Asset ID');
      expectInputRejected(renamed('data/Bad'), `input.${field}.id`, undefined, ContentContractError);
      expectInputRejected(renamed('data/other', originalImportIdentity()), `input.${field}.id`, 'must be the production Asset');
      expect(() => createWorld(asCreateInput(renamed(production, originalImportIdentity())))).not.toThrow();
    }
  });

  it('keeps the content readers\' ContentContractError', () => {
    expectRejected({ commMenus: menusWith((menus) => void (menus.otherTargetCommands = [])) }, `${MENUS}.otherTargetCommands`, undefined, ContentContractError);
    expectRejected({ baseRepairItems: { subsystemSelectors: [...baseRepairItemsContent().subsystemSelectors.slice(0, 10), 32] } }, `${SELECTORS}[10]`, undefined, ContentContractError);
    expectRejected({ commMessages: messagesWith((messages) => void (messages.names2001[0] = '')) }, 'input.commMessages.content.names2001[0]', undefined, ContentContractError);
    expectRejected({ commMessages: messagesWith((messages) => void ((messages.direct as unknown[])[0] = { present: true, frameDurations: [] })) },
      'input.commMessages.content.direct[0].frameDurations', undefined, ContentContractError);
  });

  it('keeps the complete contents as read, frozen, and nothing of the input', () => {
    const input = worldInput();
    const state = create(input);
    const { inputs } = state.ruleData;
    expect(inputs.commMenus).toEqual({ id: 'data/comm-menus', content: commMenusContent() });
    expect(inputs.baseRepairItems).toEqual({ id: 'data/base-repair-items', content: baseRepairItemsContent() });
    expect(inputs.commMessages).toEqual({ id: 'data/comm-messages', content: commMessagesContent() });
    expect(deepFrozen(state.ruleData)).toBe(true);
    const before = structuredClone(state.ruleData);
    const menus = input.commMenus.content as Menus;
    menus.gatedTargetCommands[0].text = menuText('2');
    menus.categories.reverse();
    (input.baseRepairItems.content as { subsystemSelectors: number[] }).subsystemSelectors[0] = 9;
    const messages = input.commMessages.content as Messages;
    (messages.faceTables[0][0][0] as unknown as { frameDurations: number[] }).frameDurations[0] = 99;
    messages.names2001[0] = `${MARKER}-pool-0`;
    expect(state.ruleData).toEqual(before);
  });
});

describe('communications rule data (CB-01)', () => {
  it('keeps the menus\' raw keys and values in order, the selectors and the messages by table, face and index', () => {
    const data = communications();
    expect(data.menus).toEqual({
      categories: [{ key: code('W'), kindMask: 0x2 }, { key: code('B'), kindMask: 0x20000 }, { key: code('N'), kindMask: 0x40000 }, { key: code('x'), kindMask: 0 }],
      objectListExitKey: code('X'),
      commands: {
        gated: [{ key: code('1'), code: 7 }, { key: code('2'), code: 9 }, { key: code('X'), code: 0 }],
        other: [{ key: code('1'), code: 7 }, { key: code('x'), code: 0 }],
        kind2: [...[1, 2, 3, 4, 5, 6, 7].map((value) => ({ key: code(String(value)), code: value })), { key: code('x'), code: 0 }],
      },
    });
    expect(data.serviceSelectors).toEqual([0, 33, 34, 5, 7, 8, 1, 2, 18, 3, 9]);
    expect(data.messages).toEqual({
      faceTables: {
        20011: [[[3, 9], null], [[6]]],
        20019: [[null, [1, 1]]],
        20985: [[null], [[4, 0, 5]]],
      },
      direct: [[5], null, [0]],
    });
    expect(deepFrozen(data)).toBe(true);
  });

  it('keeps a stored byte 1 or 0 as the unread key of a shown category', () => {
    const menus = menusWith((value) => {
      value.categories[0].text = 'a';
      value.categories[1].text = '';
    });
    expect(communications({ commMenus: menus }).menus.categories.slice(0, 2)).toEqual([{ key: 0, kindMask: 0x2 }, { key: 0, kindMask: 0x20000 }]);
  });

  describe('name indexes (RX1, D-03 item 4)', () => {
    it('gives each name its first position in TABL 2001 and 2011 by byte equality, null where absent', () => {
      const info = craftInfoContent();
      info.craft[17].name = `${MARKER}-17`;
      const messages = messagesWith((value) => {
        value.names2011.push(info.craft[17].name, `${MARKER}-pool-1`);
        value.names2001.push(`${MARKER}-w1`, `${MARKER}-BASE-1`);
      });
      const roster = rosterContent();
      roster.options[1].nameCandidates = [`${MARKER}-w0`, `${MARKER}-w1`];
      const table: NameIndexTable = communications({ commMessages: messages, roster, craftInfo: info }).nameIndexes;
      const none = { in2001: null, in2011: null };
      expect(table.none).toEqual(none);
      expect(table.candidates.mission[7]).toEqual([{ in2001: null, in2011: 1 }, none, { in2001: 0, in2011: null }, none]);
      expect(table.candidates.mission[0]).toEqual([]);
      expect(table.candidates.wingman.map((candidates) => candidates.at(-1))).toEqual([none, { in2001: 3, in2011: null }, none, none, none]);
      expect(table.candidates.wingman[1][0]).toEqual(none);
      expect(table.pool).toEqual([none, { in2001: 1, in2011: 3 }]);
      expect(table.craftTypes).toHaveLength(20);
      expect(table.craftTypes[17]).toEqual({ in2001: null, in2011: 2 });
      expect(table.craftTypes.filter((_, kindBit) => kindBit !== 17)).toEqual(Array.from({ length: 19 }, () => none));
      expect(deepFrozen(table)).toBe(true);
    });

    it('looks every kind of name reference up', () => {
      const { nameIndexes } = communications();
      expect(nameIndexOf(nameIndexes, { type: 'none' })).toBe(nameIndexes.none);
      expect(nameIndexOf(nameIndexes, { type: 'candidate', declaration: { collection: 'mission', index: 7 }, candidate: 2 })).toEqual({ in2001: 0, in2011: null });
      expect(nameIndexOf(nameIndexes, { type: 'candidate', declaration: { collection: 'wingman', index: 1 }, candidate: 0 })).toEqual({ in2001: null, in2011: null });
      expect(nameIndexOf(nameIndexes, { type: 'pool', index: 1 })).toEqual({ in2001: 1, in2011: null });
      expect(nameIndexOf(nameIndexes, { type: 'craft-type', kindBit: 7 })).toBe(nameIndexes.craftTypes[7]);
    });
  });
});

describe('check 1: menu keys', () => {
  it('rejects a command item, the category exit or the object-list exit of fewer than 2 bytes', () => {
    for (const table of COMMAND_TABLES) {
      for (const [index, text] of [[0, 'a'], [0, ''], [-1, 'x']] as const) {
        const menus = menusWith((value) => void (value[table].at(index)!.text = text));
        const at = index < 0 ? menus[table].length - 1 : index;
        expectRejected({ commMenus: menus }, `${MENUS}.${table}[${at}].text`, 'at least 2 bytes');
      }
    }
    expectRejected({ commMenus: menusWith((menus) => void (menus.categories[3].text = 'x')) }, `${MENUS}.categories[3].text`, 'at least 2 bytes');
    expectRejected({ commMenus: menusWith((menus) => void (menus.objectListLastEntry = '')) }, `${MENUS}.objectListLastEntry`, 'at least 2 bytes');
  });

  it('rejects a command key other than 1–9, which select-number cannot express', () => {
    for (const table of COMMAND_TABLES) {
      for (const key of ['0', 'a', 'x', 'X', ':', '\x80', ' ']) {
        expectRejected({ commMenus: menusWith((menus) => void (menus[table][0].text = menuText(key))) }, `${MENUS}.${table}[0].text`, 'key of 1 to 9');
      }
    }
  });

  it('rejects an exit key that does not fold to x', () => {
    for (const table of COMMAND_TABLES) {
      for (const key of ['1', 'y', 'c', '\xd8']) {
        const menus = menusWith((value) => void (value[table].at(-1)!.text = menuText(key)));
        expectRejected({ commMenus: menus }, `${MENUS}.${table}[${menus[table].length - 1}].text`, 'folds to x');
      }
    }
    expectRejected({ commMenus: menusWith((menus) => void (menus.categories[3].text = menuText('1'))) }, `${MENUS}.categories[3].text`, 'folds to x');
    expectRejected({ commMenus: menusWith((menus) => void (menus.objectListLastEntry = menuText('c'))) }, `${MENUS}.objectListLastEntry`, 'folds to x');
  });

  it('accepts x and X, duplicate keys in first-match order, any command code, and does not read shown categories\' keys', () => {
    const menus = menusWith((value) => {
      value.gatedTargetCommands = [{ text: menuText('1'), command: 7 }, { text: menuText('1'), command: 0xffff_ffff }, { text: menuText('x'), command: 0 }];
      value.otherTargetCommands[1].text = menuText('X');
      value.categories[0].text = menuText('x');
      value.categories[1].text = '';
      value.objectListLastEntry = menuText('x');
    });
    expect(communications({ commMenus: menus }).menus.commands.gated).toEqual([
      { key: code('1'), code: 7 }, { key: code('1'), code: 0xffff_ffff }, { key: code('x'), code: 0 },
    ]);
  });

  it('accepts the 8-item wingman menu and command menus beyond 9 items, which generated keys do not bound', () => {
    expectAccepted({});
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '9', '1'];
    expectAccepted({ commMenus: menusWith((menus) => {
      menus.kind2TargetCommands = [...keys.map((key, index) => ({ text: menuText(key), command: index + 1 })), { text: menuText('x'), command: 0 }];
    }) });
  });
});

describe('check 2: generated keys', () => {
  it('bounds a category\'s objects by 9 over the run: 9 bases pass, 10 are rejected', () => {
    expectAccepted({ mission: withBases(9) });
    expectRejected({ mission: withBases(10) }, `${MENUS}.categories[1].kindMask`, 'more than 9 objects');
  });

  it('sums the kinds of a mask over records and each request of a group for every member', () => {
    // Kind bit 8 has 2 requests × 2 members (group 1); kind bit 17 the base record's requests.
    expectAccepted({ mission: withBases(5), commMenus: categories(0x20100) });
    expectRejected({ mission: withBases(6), commMenus: categories(0x20100) }, `${MENUS}.categories[0].kindMask`, 'more than 9 objects');
    // Kind bit 7: 2 from record 3, 2 × 2 from group 0 and 3 × 2 from the delayed group 2.
    expectRejected({ commMenus: categories(0x80) }, `${MENUS}.categories[0].kindMask`, 'more than 9 objects');
  });

  it('counts the wingman only when one is selected', () => {
    const menus = categories(0x2 | 0x20000);
    expectAccepted({ mission: withBases(9), commMenus: menus });
    expectAccepted({ mission: withBases(8), commMenus: menus, run: { wingman: 0 } });
    expectRejected({ mission: withBases(9), commMenus: menus, run: { wingman: 0 } }, `${MENUS}.categories[0].kindMask`, 'more than 9 objects');
  });

  it('counts only queue entries that post requests', () => {
    // A u32 count of 2³² − 1 is −1 requests, which post none.
    expectAccepted({ mission: withBases(0xffff_ffff), commMenus: categories(...Array.from({ length: 9 }, () => 0x1), 0x20000) });
    expectRejected({ mission: withBases(1), commMenus: categories(...Array.from({ length: 9 }, () => 0x1), 0x20000) }, `${MENUS}.categories`, 'more than 9 categories');
  });

  it('bounds the shown categories by 9: those whose bound is above 0', () => {
    const players = (count: number) => Array.from({ length: count }, () => 0x1);
    expectAccepted({ commMenus: categories(...players(9)) });
    expectAccepted({ commMenus: categories(...players(9), 0x40000, 0x4000000) });
    expectRejected({ commMenus: categories(...players(10)) }, `${MENUS}.categories`, 'more than 9 categories');
  });

  it('rejects a mask with a kind only runtime construction allocates, whatever the mission holds', () => {
    for (const mask of [0x4000, 0x100000, 0x200000, 0x400000, 0x800000, 0x1000000, 0x2000000, 0x2 | 0x4000]) {
      expectRejected({ commMenus: categories(0x40000, mask) }, `${MENUS}.categories[1].kindMask`, 'runtime construction');
    }
    expectAccepted({ commMenus: categories(0x4000000, 0x80000000) });
  });

  it('runs after check 1', () => {
    const menus = categories(0x4000);
    menus.objectListLastEntry = '';
    expectRejected({ commMenus: menus }, `${MENUS}.objectListLastEntry`, 'at least 2 bytes');
  });
});

describe('checks 3–5: service selectors, the base energy rate and messages', () => {
  it('accepts selectors 0–18, 33 and 34 and rejects 19–31, which address fields Core does not have', () => {
    const selectors = (...values: number[]) => ({ subsystemSelectors: [...values, ...baseRepairItemsContent().subsystemSelectors.slice(values.length)] });
    expectAccepted({ baseRepairItems: selectors(0, 18, 33, 34, 17) });
    for (const selector of [19, 24, 31]) expectRejected({ baseRepairItems: selectors(18, selector) }, `${SELECTORS}[1]`, 'must be 0 to 18, 33 or 34');
  });

  it('rejects a negative energy capacity +0x54 of the player\'s record only', () => {
    const info = (kindBit: number, at54: number) => {
      const content = craftInfoContent();
      content.craft[kindBit].at54 = at54;
      return content;
    };
    expectAccepted({ craftInfo: info(0, 0) });
    expectAccepted({ craftInfo: info(19, -1) });
    expectRejected({ craftInfo: info(0, -1) }, 'input.craftInfo.content.craft[0].at54', 'must not be negative for the player');
  });

  it('rejects nothing of the message metadata the reader admits: absent entries and zero durations are the original\'s branches', () => {
    expectAccepted({ commMessages: messagesWith((messages) => {
      messages.faceTables = [[[{ present: false }]], [[{ present: true, frameDurations: [0] }]], [[]]] as never;
      messages.direct = [];
      messages.names2001 = [];
      messages.names2011 = [];
    }) });
  });
});
