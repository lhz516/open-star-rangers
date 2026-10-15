import { describe, expect, it } from 'vitest';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { AI_PROGRAMS_COUNTS, AI_PROGRAMS_LIMITS, AI_SCRIPT_END_OPCODE } from './ai-programs.ts';
import { BASE_REPAIR_ITEM_COUNT } from './base-repair-items.ts';
import { COMM_MENUS_LIMITS } from './comm-menus.ts';
import { COMM_MESSAGES_LIMITS } from './comm-messages.ts';
import { CRAFT_INFO_COUNTS, CRAFT_INFO_LIMITS } from './craft-info.ts';
import { DEBRIS_PARAMETERS_LIMITS } from './debris-parameters.ts';
import { FLIGHT_MESSAGES_LIMITS } from './flight-messages.ts';
import { decodeRuleDataPayload, readRuleDataContent, type RuleDataRole } from './rule-data-payload.ts';
import {
  absentMessage, box, builtInProgram, commandItem, craft, debrisRecord, gun, keyword, missile, missileBody, mount, parameterEntry, script, scriptItem,
  message, syntheticAiPrograms, syntheticBaseRepairItems, syntheticCommMenus, syntheticCommMessages, syntheticCraftInfo,
  syntheticDebrisParameters, syntheticFlightMessages, syntheticRuleDataAsset, tableProgram, text,
} from './rule-data.test-support.ts';

// AC-14 (structural limits): every limit passes exactly at its value and fails one above it, before any item is read.

const times = <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => make(index));

/** `count` entries in first-reach order: one parameter entry whose install script and state lists name every script once. */
function reachableEntries(count: number) {
  const scripts = times(count - 1, index => index + 1);
  const [installScript = null, ...listed] = scripts;
  const lists = times(6, list => listed.slice(list * AI_PROGRAMS_LIMITS.stateScriptItems, (list + 1) * AI_PROGRAMS_LIMITS.stateScriptItems));
  const [state1, state2, state3, state5, state4, state6] = lists;
  return [parameterEntry(installScript, { state1, state2, state3, state5, state4, state6 }), ...scripts.map(() => script())];
}

interface LimitCase {
  readonly role: RuleDataRole;
  readonly limit: number;
  readonly path: string;
  readonly build: (count: number) => unknown;
}

const craftInfo = (change: (content: ReturnType<typeof syntheticCraftInfo>, count: number) => void) => (count: number) => {
  const content = syntheticCraftInfo();
  change(content, count);
  return content;
};

const aiPrograms = (change: (content: ReturnType<typeof syntheticAiPrograms>, count: number) => void) => (count: number) => {
  const content = syntheticAiPrograms();
  change(content, count);
  return content;
};

const LIMIT_CASES: Readonly<Record<string, LimitCase>> = {
  'craft-info guns': {
    role: 'craft-info', limit: CRAFT_INFO_LIMITS.guns, path: 'craftInfo.guns',
    build: craftInfo((content, count) => { content.guns = times(count, () => gun()); }),
  },
  'craft-info missiles': {
    role: 'craft-info', limit: CRAFT_INFO_LIMITS.missiles, path: 'craftInfo.missiles',
    build: craftInfo((content, count) => { content.missiles = times(count, () => missile()); }),
  },
  'craft-info missile bodies': {
    role: 'craft-info', limit: CRAFT_INFO_LIMITS.missileBodies, path: 'craftInfo.missileBodies',
    build: craftInfo((content, count) => { content.missileBodies = times(count, () => missileBody()); }),
  },
  'craft-info mounts': {
    role: 'craft-info', limit: CRAFT_INFO_LIMITS.mounts, path: 'craftInfo.craft[2].mounts',
    build: craftInfo((content, count) => { content.craft[2] = craft({ mounts: times(count, () => mount()) }); }),
  },
  'craft-info boxes': {
    role: 'craft-info', limit: CRAFT_INFO_LIMITS.boxes, path: 'craftInfo.craft[0].collision.boxes',
    build: craftInfo((content, count) => { content.craft[0].collision.boxes = times(count, () => box()); }),
  },
  'craft-info mount list entries': {
    role: 'craft-info', limit: CRAFT_INFO_LIMITS.mountListEntries, path: 'craftInfo.craft[0].mountLists[1]',
    build: craftInfo((content, count) => { content.craft[0].mountLists[1] = times(count, () => 2); }),
  },
  'craft-info pairs': {
    role: 'craft-info', limit: CRAFT_INFO_LIMITS.pairs, path: 'craftInfo.craft[3].pairs',
    build: craftInfo((content, count) => { content.craft[3] = craft({ pairs: times(count, index => ({ at00: index, at04: 1 })) }); }),
  },
  'craft-info name bytes': {
    role: 'craft-info', limit: CRAFT_INFO_LIMITS.nameBytes, path: 'craftInfo.craft[4].name',
    build: craftInfo((content, count) => { content.craft[4] = craft({ name: text(count) }); }),
  },
  'debris-parameters records': {
    role: 'debris-parameters', limit: DEBRIS_PARAMETERS_LIMITS.records, path: 'debrisParameters.byCraftType[19]',
    build: count => {
      const content = syntheticDebrisParameters();
      content.byCraftType[19] = times(count, () => debrisRecord());
      return content;
    },
  },
  'debris-parameters boxes': {
    role: 'debris-parameters', limit: DEBRIS_PARAMETERS_LIMITS.boxes, path: 'debrisParameters.byCraftType[0][0].collision.boxes',
    build: count => {
      const content = syntheticDebrisParameters();
      content.byCraftType[0][0] = debrisRecord({ collision: { boxes: times(count, () => box()), at28: 0, at2C: [0, 0, 0, 0, 0, 0] } });
      return content;
    },
  },
  'ai-programs program records': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.programRecords, path: 'aiPrograms.programs',
    build: aiPrograms((content, count) => { content.programs = [tableProgram(0), tableProgram(4), ...times(count - 2, () => tableProgram(4))]; }),
  },
  'ai-programs built-in program records': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.programRecords, path: 'aiPrograms.builtInPrograms',
    build: aiPrograms((content, count) => { content.builtInPrograms = times(count, index => builtInProgram(index * 4)); }),
  },
  'ai-programs program name bytes': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.programNameBytes, path: 'aiPrograms.builtInPrograms[1].name',
    build: aiPrograms((content, count) => { content.builtInPrograms[1].name = text(count); }),
  },
  'ai-programs global elements': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.globalElements, path: 'aiPrograms.globals.elements',
    build: aiPrograms((content, count) => { content.globals.elements = times(count, index => [index, 0, 0, 0]); }),
  },
  'ai-programs entries': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.entries, path: 'aiPrograms.entries',
    build: aiPrograms((content, count) => {
      content.programs = [tableProgram(0)];
      content.entries = reachableEntries(count);
    }),
  },
  'ai-programs state script items': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.stateScriptItems, path: 'aiPrograms.entries[4].stateScripts.state6',
    build: aiPrograms((content, count) => {
      (content.entries[4] as ReturnType<typeof parameterEntry>).stateScripts.state6 = times(count, () => 5);
    }),
  },
  'ai-programs script items': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.scriptItems, path: 'aiPrograms.entries[5].items',
    build: aiPrograms((content, count) => {
      content.entries[5] = script([...times(count - 1, () => scriptItem(500, text(1))), scriptItem(AI_SCRIPT_END_OPCODE)]);
    }),
  },
  'ai-programs script text bytes': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.scriptTextBytes, path: 'aiPrograms.entries[3].items[0].argument',
    build: aiPrograms((content, count) => { content.entries[3] = script([scriptItem(AI_SCRIPT_END_OPCODE, text(count))]); }),
  },
  'ai-programs keyword entries': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.keywordEntries, path: 'aiPrograms.keywordTables[2]',
    build: aiPrograms((content, count) => { content.keywordTables[2] = times(count, index => keyword(text(1 + index), index)); }),
  },
  'ai-programs keyword name bytes': {
    role: 'ai-programs', limit: AI_PROGRAMS_LIMITS.keywordNameBytes, path: 'aiPrograms.keywordTables[1][4].name',
    build: aiPrograms((content, count) => { content.keywordTables[1][4] = keyword(text(count), 4); }),
  },
  'comm-menus items': {
    role: 'comm-menus', limit: COMM_MENUS_LIMITS.items, path: 'commMenus.otherTargetCommands',
    build: count => ({ ...syntheticCommMenus(), otherTargetCommands: [...times(count - 1, index => commandItem(index + 1)), commandItem(0)] }),
  },
  'comm-menus text bytes': {
    role: 'comm-menus', limit: COMM_MENUS_LIMITS.textBytes, path: 'commMenus.objectListLastEntry',
    build: count => ({ ...syntheticCommMenus(), objectListLastEntry: text(count) }),
  },
  'comm-messages faces': {
    role: 'comm-messages', limit: COMM_MESSAGES_LIMITS.faces, path: 'commMessages.faceTables[1]',
    build: count => {
      const content = syntheticCommMessages();
      content.faceTables[1] = times(count, () => [absentMessage()]);
      return content;
    },
  },
  'comm-messages face messages': {
    role: 'comm-messages', limit: COMM_MESSAGES_LIMITS.faceMessages, path: 'commMessages.faceTables[2][1]',
    build: count => {
      const content = syntheticCommMessages();
      content.faceTables[2][1] = times(count, index => message(index + 1));
      return content;
    },
  },
  'comm-messages direct messages': {
    role: 'comm-messages', limit: COMM_MESSAGES_LIMITS.directMessages, path: 'commMessages.direct',
    build: count => ({ ...syntheticCommMessages(), direct: times(count, index => (index % 3 ? message(index, 2, 1) : absentMessage())) }),
  },
  'comm-messages frames': {
    role: 'comm-messages', limit: COMM_MESSAGES_LIMITS.frames, path: 'commMessages.direct[2].frameDurations',
    build: count => {
      const content = syntheticCommMessages();
      content.direct[2] = message(...times(count, index => index * 3));
      return content;
    },
  },
  'comm-messages names': {
    role: 'comm-messages', limit: COMM_MESSAGES_LIMITS.names, path: 'commMessages.names2011',
    build: count => ({ ...syntheticCommMessages(), names2011: times(count, index => text(1 + (index % 20))) }),
  },
  'comm-messages name bytes': {
    role: 'comm-messages', limit: COMM_MESSAGES_LIMITS.nameBytes, path: 'commMessages.names2001[0]',
    build: count => ({ ...syntheticCommMessages(), names2001: [text(count)] }),
  },
  'flight-messages text bytes': {
    role: 'flight-messages', limit: FLIGHT_MESSAGES_LIMITS.textBytes, path: 'flightMessages.speedAssistOff',
    build: count => ({ ...syntheticFlightMessages(), speedAssistOff: text(count) }),
  },
};

describe('rule-data structural limits', () => {
  it('derives each limit as twice the recorded observation, rounded up to a power of two', () => {
    const derive = (observed: number) => 2 ** Math.ceil(Math.log2(2 * observed));
    expect(CRAFT_INFO_LIMITS).toEqual({
      guns: derive(10), missiles: derive(9), missileBodies: derive(9), mounts: derive(16), boxes: derive(32),
      mountListEntries: derive(3), pairs: derive(3), nameBytes: derive(26),
    });
    expect(DEBRIS_PARAMETERS_LIMITS).toEqual({ records: derive(8), boxes: derive(1) });
    expect(AI_PROGRAMS_LIMITS).toEqual({
      programRecords: derive(10), programNameBytes: derive(20), globalElements: derive(5), entries: derive(25),
      stateScriptItems: derive(6), scriptItems: derive(40), scriptTextBytes: derive(37), keywordEntries: derive(6),
      // A keyword name is held to a program name's limit, above the 11 bytes observed.
      keywordNameBytes: AI_PROGRAMS_LIMITS.programNameBytes,
    });
    expect(AI_PROGRAMS_LIMITS.keywordNameBytes).toBeGreaterThanOrEqual(derive(11));
    expect(COMM_MENUS_LIMITS).toEqual({ items: derive(8), textBytes: derive(15) });
    expect(FLIGHT_MESSAGES_LIMITS).toEqual({ textBytes: derive(45) });
    expect(COMM_MESSAGES_LIMITS).toEqual({
      faces: derive(5), faceMessages: derive(61), directMessages: derive(85), frames: derive(4), names: derive(20), nameBytes: derive(11),
    });
    // The menu builders copy a text with its NUL into a 48-byte field, so the derived limit stays inside the format's.
    expect(COMM_MENUS_LIMITS.textBytes).toBeLessThanOrEqual(47);
  });

  it.each(Object.entries(LIMIT_CASES))('%s passes at the limit and fails one above it', (_, { role, limit, path, build }) => {
    const content = build(limit);
    expect(() => readRuleDataContent(role, content)).not.toThrow();
    const { bytes, descriptor } = syntheticRuleDataAsset(role, content);
    expect(decodeRuleDataPayload(bytes, descriptor as unknown as Parameters<typeof decodeRuleDataPayload>[1]).content).toEqual(content);
    expectContractError(() => readRuleDataContent(role, build(limit + 1)), 'invalid-logic-payload', path);
  });

  it('rejects an oversized list before reading any of its items', () => {
    const content = syntheticCraftInfo();
    content.guns = times(CRAFT_INFO_LIMITS.guns + 1, () => null as never);
    expectContractError(() => readRuleDataContent('craft-info', content), 'invalid-logic-payload', 'craftInfo.guns');
  });
});

describe('rule-data format counts', () => {
  const FIXED: readonly [string, RuleDataRole, number, string, (count: number) => unknown][] = [
    ['craft records', 'craft-info', CRAFT_INFO_COUNTS.craft, 'craftInfo.craft',
      craftInfo((content, count) => { content.craft = times(count, () => craft()); })],
    ['mount lists', 'craft-info', CRAFT_INFO_COUNTS.mountLists, 'craftInfo.craft[5].mountLists',
      craftInfo((content, count) => { content.craft[5] = craft({ mountLists: times(count, () => []) }); })],
    ['debris kind bits', 'debris-parameters', CRAFT_INFO_COUNTS.craft, 'debrisParameters.byCraftType',
      count => ({ byCraftType: times(count, () => []) })],
    ['group triple values', 'ai-programs', AI_PROGRAMS_COUNTS.triple, 'aiPrograms.groupTriple',
      aiPrograms((content, count) => { content.groupTriple = times(count, () => 1); })],
    ['keyword tables', 'ai-programs', AI_PROGRAMS_COUNTS.keywordTables, 'aiPrograms.keywordTables',
      aiPrograms((content, count) => { content.keywordTables = times(count, index => content.keywordTables[index % 4]); })],
    ['element values', 'ai-programs', AI_PROGRAMS_COUNTS.elementValues, 'aiPrograms.globals.elements[1]',
      aiPrograms((content, count) => { content.globals.elements[1] = times(count, () => 1); })],
    ['base repair items', 'base-repair-items', BASE_REPAIR_ITEM_COUNT, 'baseRepairItems.subsystemSelectors',
      count => ({ subsystemSelectors: times(count, () => 1) })],
  ];

  it.each(FIXED)('requires exactly the format count of %s', (_, role, count, path, build) => {
    expect(() => readRuleDataContent(role, build(count))).not.toThrow();
    expectContractError(() => readRuleDataContent(role, build(count - 1)), 'invalid-logic-payload', path);
    expectContractError(() => readRuleDataContent(role, build(count + 1)), 'invalid-logic-payload', path);
  });

  it('builds synthetic content with the format counts', () => {
    expect(syntheticBaseRepairItems().subsystemSelectors).toHaveLength(BASE_REPAIR_ITEM_COUNT);
    expect(syntheticCraftInfo().craft).toHaveLength(CRAFT_INFO_COUNTS.craft);
  });
});
