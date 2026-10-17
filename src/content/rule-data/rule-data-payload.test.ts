import { describe, expect, it } from 'vitest';
import { asciiBytes, asciiText } from '../graphics/graphics-format.ts';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { LOGIC_LIMITS } from '../logic/logic-content.ts';
import { payloadTransferList } from '../ownership.ts';
import {
  checkRuleDataBinding, decodeRuleDataPayload, encodeRuleDataPayload, readRuleDataContent, RULE_DATA_ROLES,
  RULE_DATA_SCHEMA_VERSIONS, type RuleDataPayload, type RuleDataRole,
} from './rule-data-payload.ts';
import { foldKeywordName } from './ai-programs.ts';
import { deepFrozen, F32_DENORMAL, MARKER, SYNTHETIC_RULE_DATA, syntheticRuleDataAsset } from './rule-data.test-support.ts';

type Descriptor = Parameters<typeof decodeRuleDataPayload>[1];

const ascii = asciiBytes;
const json = asciiText;
/** JSON text of `value` with every code unit outside printable ASCII escaped, so it is ASCII. */
const asciiJson = (value: unknown): string =>
  JSON.stringify(value).replace(/[^\x20-\x7e]/g, unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`);
const decode = (bytes: Uint8Array, descriptor: unknown) => decodeRuleDataPayload(bytes, descriptor as Descriptor);
const encode = (role: RuleDataRole, content: unknown) => encodeRuleDataPayload({ role, content } as RuleDataPayload);

/** The first key of the role's content and the key after it, to swap their order. */
const FIRST_KEYS: Readonly<Record<RuleDataRole, readonly [string, string]>> = {
  'craft-info': ['hitDamageScale', 'guns'],
  'debris-parameters': ['byCraftType', 'byCraftType'],
  'ai-programs': ['groupTriple', 'globals'],
  'comm-menus': ['gatedTargetCommands', 'otherTargetCommands'],
  'base-repair-items': ['subsystemSelectors', 'subsystemSelectors'],
  'flight-messages': ['missionComplete', 'beacon'],
  'comm-messages': ['faceTables', 'direct'],
};

/** The reader path of each role's content. */
const ROOTS: Readonly<Record<RuleDataRole, string>> = {
  'craft-info': 'craftInfo',
  'debris-parameters': 'debrisParameters',
  'ai-programs': 'aiPrograms',
  'comm-menus': 'commMenus',
  'base-repair-items': 'baseRepairItems',
  'flight-messages': 'flightMessages',
  'comm-messages': 'commMessages',
};

describe('rule-data payload encoding', () => {
  it('has a schema for each of the seven logic group roles: 2 for ai-programs with its keyword tables, 1 otherwise', () => {
    expect(RULE_DATA_ROLES).toEqual(['craft-info', 'debris-parameters', 'ai-programs', 'comm-menus', 'base-repair-items', 'flight-messages', 'comm-messages']);
    expect(Object.values(RULE_DATA_SCHEMA_VERSIONS)).toEqual([1, 1, 2, 1, 1, 1, 1]);
    expect(Object.isFrozen(RULE_DATA_ROLES) && Object.isFrozen(RULE_DATA_SCHEMA_VERSIONS)).toBe(true);
  });

  it.each(RULE_DATA_ROLES)('round-trips %s byte for byte into frozen content', role => {
    const { bytes, descriptor } = syntheticRuleDataAsset(role);
    const decoded = decode(bytes, descriptor);
    expect(decoded.role).toBe(role);
    expect(deepFrozen(decoded)).toBe(true);
    expect(decoded.content).toEqual(SYNTHETIC_RULE_DATA[role]());
    expect(encodeRuleDataPayload(decoded)).toEqual(bytes);
    expect(decoded).toEqual(readRuleDataContent(role, JSON.parse(json(bytes))));
  });

  it.each(RULE_DATA_ROLES)('isolates %s from its input and earlier results', role => {
    const input = SYNTHETIC_RULE_DATA[role]() as Record<string, unknown>;
    const first = readRuleDataContent(role, input);
    const [key] = FIRST_KEYS[role];
    const value = input[key];
    if (Array.isArray(value)) value.length = 0;
    else input[key] = null;
    expect(first.content).toEqual(SYNTHETIC_RULE_DATA[role]());
    expect(() => { (first.content as unknown as Record<string, unknown>)[key] = null; }).toThrow(TypeError);
    const { bytes, descriptor } = syntheticRuleDataAsset(role);
    expect(decode(bytes, descriptor)).toEqual(decode(bytes, descriptor));
    expect(decode(bytes, descriptor)).not.toBe(decode(bytes, descriptor));
  });

  it('encodes equal content to equal bytes in a buffer of their own, without whitespace and in field order', () => {
    const first = syntheticRuleDataAsset('craft-info').bytes;
    const second = syntheticRuleDataAsset('craft-info').bytes;
    expect(second).toEqual(first);
    expect(second.buffer).not.toBe(first.buffer);
    expect(first.buffer.byteLength).toBe(first.byteLength);
    expect(payloadTransferList([first, second])).toHaveLength(2);
    const reordered = { missileBodies: [], craft: [], missiles: [], guns: [], hitDamageScale: 1 };
    expect(() => encode('craft-info', reordered)).toThrow();
    const content = SYNTHETIC_RULE_DATA['craft-info']() as Record<string, unknown>;
    const shuffled = Object.fromEntries(Object.entries(content).reverse());
    expect(encode('craft-info', shuffled)).toEqual(first);
    expect(json(first)).toMatch(/^\{"hitDamageScale":1.25,"guns":\[\{"name":"\\u0080/);
    expect(json(first)).not.toMatch(/\s/);
  });

  it('keeps f32 denormals and byte strings with 0x80–0xFF exactly', () => {
    const { bytes, descriptor } = syntheticRuleDataAsset('craft-info');
    const decoded = decode(bytes, descriptor);
    const info = decoded.role === 'craft-info' ? decoded.content : undefined;
    expect(info?.missiles[0].at40).toBe(F32_DENORMAL);
    expect(Object.is(Math.fround(info!.missiles[0].at40), F32_DENORMAL)).toBe(true);
    expect(info?.guns[0].name).toMatch(/^\x80/);
    expect(json(bytes)).toContain('\\u0080');
    expect(json(bytes)).toContain('\\u00ff');
  });

  it('charges the byte length to reserve once, before the limit', () => {
    const reserved: number[] = [];
    const bytes = encodeRuleDataPayload({ role: 'flight-messages', content: SYNTHETIC_RULE_DATA['flight-messages']() } as RuleDataPayload,
      length => { reserved.push(length); });
    expect(reserved).toEqual([bytes.length]);
    const refuse = () => { throw new RangeError('over budget'); };
    expect(() => encodeRuleDataPayload({ role: 'flight-messages', content: SYNTHETIC_RULE_DATA['flight-messages']() } as RuleDataPayload, refuse))
      .toThrow(RangeError);
  });

  it('rejects content of an unknown role', () => {
    expectContractError(() => encode('mission' as RuleDataRole, {}), 'invalid-logic-payload', 'role');
    expectContractError(() => readRuleDataContent('craft-types' as RuleDataRole, {}, 'content'), 'invalid-logic-payload', 'content');
  });
});

describe('rule-data payload decoding', () => {
  it.each(RULE_DATA_ROLES)('rejects non-canonical encodings of %s', role => {
    const { bytes, descriptor } = syntheticRuleDataAsset(role);
    const source = json(bytes);
    const [first, second] = FIRST_KEYS[role];
    const parsed = JSON.parse(source) as Record<string, unknown>;
    const variants = [
      ` ${source}`,
      `${source} `,
      source.replace(':', ': '),
      source.replaceAll(',', ', '),
      // Field order: the second key first.
      first === second ? source.replace(/^\{/, '{ ') : asciiJson({ [second]: parsed[second], ...parsed }),
    ];
    for (const variant of variants) expectContractError(() => decode(ascii(variant), descriptor), 'non-canonical-payload', 'payload', [MARKER]);
    // Line breaks are not printable ASCII, so the bytes are no payload text at all.
    expectContractError(() => decode(ascii(`${source}\n`), descriptor), 'invalid-logic-payload', 'payload');
  });

  it('rejects -0, longer number spellings and escapes of printable characters', () => {
    const { bytes, descriptor } = syntheticRuleDataAsset('craft-info');
    const source = json(bytes);
    for (const [canonical, other] of [
      ['"at90":0', '"at90":-0'], ['1.25', '1.250'], ['"at14":-7', '"at14":-7e0'], ['"hitDamageScale"', '"hitDamageScal\\u0065"'],
      ['\\u00ff', '\\u00FF'],
    ]) {
      expect(source).toContain(canonical);
      expectContractError(() => decode(ascii(source.replace(canonical, other)), descriptor), 'non-canonical-payload', 'payload');
    }
  });

  it.each(RULE_DATA_ROLES)('rejects %s with a missing, unknown or mistyped field, by code and path', role => {
    const { descriptor } = syntheticRuleDataAsset(role);
    const [key] = FIRST_KEYS[role];
    const root = ROOTS[role];
    const edit = (change: (content: Record<string, unknown>) => void) => {
      const content = SYNTHETIC_RULE_DATA[role]() as Record<string, unknown>;
      change(content);
      return ascii(asciiJson(content));
    };
    expectContractError(() => decode(edit(content => { delete content[key]; }), descriptor), 'invalid-logic-payload', `${root}.${key}`, [MARKER]);
    expectContractError(() => decode(edit(content => { content.extra = 1; }), descriptor), 'invalid-logic-payload', root, [MARKER]);
    expectContractError(() => decode(edit(content => { content[key] = true; }), descriptor), 'invalid-logic-payload', `${root}.${key}`, [MARKER]);
    expectContractError(() => decode(ascii('[]'), descriptor), 'invalid-logic-payload', root);
    expectContractError(() => decode(ascii('{"a":'), descriptor), 'invalid-logic-payload', 'payload');
  });

  it('rejects non-finite numbers and values an f32 cannot hold', () => {
    const { bytes, descriptor } = syntheticRuleDataAsset('craft-info');
    const source = json(bytes);
    expectContractError(() => decode(ascii(source.replace('"hitDamageScale":1.25', '"hitDamageScale":1e999')), descriptor),
      'invalid-logic-payload', 'craftInfo.hitDamageScale');
    expectContractError(() => decode(ascii(source.replace('"hitDamageScale":1.25', '"hitDamageScale":0.1')), descriptor),
      'invalid-logic-payload', 'craftInfo.hitDamageScale');
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.1, 2 ** 128]) {
      const content = SYNTHETIC_RULE_DATA['craft-info']() as Record<string, unknown>;
      content.hitDamageScale = value;
      expectContractError(() => encode('craft-info', content), 'invalid-logic-payload', 'craftInfo.hitDamageScale');
    }
  });

  it('checks the byte limit before anything else, then bytes and descriptor', () => {
    const { descriptor } = syntheticRuleDataAsset('base-repair-items');
    const oversized = new Uint8Array(LOGIC_LIMITS.payloadBytes + 1).fill(0x20);
    expectContractError(() => decode(oversized, { bogus: true }), 'invalid-logic-payload', 'payload');
    expectContractError(() => decode([] as unknown as Uint8Array, descriptor), 'invalid-logic-payload', 'payload');
    const bytes = syntheticRuleDataAsset('base-repair-items').bytes;
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expectContractError(() => decode(bytes, descriptor), 'payload-detached', 'payload');
    expectContractError(() => decode(ascii('{}'), { bogus: true }), 'invalid-record', 'descriptor.id');
    expectContractError(() => decode(Uint8Array.of(0x7b, 0x80, 0x7d), descriptor), 'invalid-logic-payload', 'payload');
  });
});

describe('ai-programs keyword tables', () => {
  const content = () => SYNTHETIC_RULE_DATA['ai-programs']() as { keywordTables: { name: string; value: number }[][] };
  const read = (change: (tables: { name: string; value: number }[][]) => void) => {
    const plain = content();
    change(plain.keywordTables);
    return () => readRuleDataContent('ai-programs', plain);
  };

  it('keeps the four tables, their pair order, i32 values and name bytes as given, shared names included', () => {
    const decoded = readRuleDataContent('ai-programs', content());
    const tables = decoded.role === 'ai-programs' ? decoded.content.keywordTables : [];
    expect(tables).toEqual(content().keywordTables);
    expect(tables[3]).toEqual(tables[0]);
    expect(tables.flat().map(({ value }) => value)).toEqual(expect.arrayContaining([0, -1, 0x7fffffff, -0x80000000]));
    // Bytes outside A–Z are not folded, so these two names of one table differ.
    expect(foldKeywordName(tables[1][1].name)).not.toBe(foldKeywordName(tables[1][2].name));
    expect(foldKeywordName('AZaz@[\xc4')).toBe('azaz@[\xc4');
  });

  it('rejects a name repeated within a table with A–Z folded, and accepts it across tables', () => {
    expectContractError(read(tables => { tables[1][3].name = tables[1][0].name; }), 'invalid-logic-payload', 'aiPrograms.keywordTables[1][3].name', [MARKER]);
    expectContractError(read(tables => { tables[0][2].name = tables[0][1].name.toLowerCase(); }), 'invalid-logic-payload', 'aiPrograms.keywordTables[0][2].name', [MARKER]);
    expect(read(tables => { tables[2][0].name = tables[1][3].name; })).not.toThrow();
  });

  it('rejects an empty table, an empty name, a NUL, and values outside i32', () => {
    expectContractError(read(tables => { tables[2] = []; }), 'invalid-logic-payload', 'aiPrograms.keywordTables[2]');
    expectContractError(read(tables => { tables[0][0].name = ''; }), 'invalid-logic-payload', 'aiPrograms.keywordTables[0][0].name');
    expectContractError(read(tables => { tables[0][0].name = 'a\0b'; }), 'invalid-logic-payload', 'aiPrograms.keywordTables[0][0].name');
    expectContractError(read(tables => { tables[0][0].value = 0x80000000; }), 'invalid-logic-payload', 'aiPrograms.keywordTables[0][0].value');
    expectContractError(read(tables => { tables[0][0].value = 1.5; }), 'invalid-logic-payload', 'aiPrograms.keywordTables[0][0].value');
  });
});

describe('rule-data descriptor binding', () => {
  const withDescriptor = (role: RuleDataRole, change: (descriptor: Record<string, unknown>) => void) => {
    const { bytes, descriptor } = syntheticRuleDataAsset(role);
    const edited = structuredClone(descriptor) as unknown as Record<string, unknown>;
    change(edited);
    return { bytes, descriptor: edited };
  };

  it.each(RULE_DATA_ROLES)('accepts the data Asset of %s without dependencies', role => {
    expect(checkRuleDataBinding(syntheticRuleDataAsset(role).descriptor as unknown as Descriptor)).toBe(role);
  });

  it('rejects another role, kind, dependencies or schema version', () => {
    const cases: [RuleDataRole, (descriptor: Record<string, unknown>) => void, string, string][] = [
      ['craft-info', descriptor => { descriptor.role = 'craft-types'; }, 'invalid-logic-payload', 'descriptor.role'],
      ['craft-info', descriptor => { descriptor.id = 'mission/craft-info'; descriptor.kind = 'mission'; }, 'invalid-logic-payload', 'descriptor.kind'],
      ['ai-programs', descriptor => { descriptor.dependencies = [{ id: 'data/craft-info', kind: 'data' }]; },
        'logic-reference-mismatch', 'descriptor.dependencies'],
      ['comm-menus', descriptor => { (descriptor.payloadIdentity as Record<string, unknown>).schemaVersion = 2; },
        'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
      // Schema 1 had no keyword tables (P3-03 revision 3): such a payload is never read.
      ['ai-programs', descriptor => { (descriptor.payloadIdentity as Record<string, unknown>).schemaVersion = 1; },
        'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
    ];
    for (const [role, change, code, path] of cases) {
      const { bytes, descriptor } = withDescriptor(role, change);
      expectContractError(() => decode(bytes, descriptor), code, path);
      if (code !== 'unsupported-payload-schema') expectContractError(() => checkRuleDataBinding(descriptor as unknown as Descriptor), code, path);
    }
  });

  it('decodes bytes only with the descriptor of their own role', () => {
    const craft = syntheticRuleDataAsset('craft-info');
    const messages = syntheticRuleDataAsset('flight-messages');
    expectContractError(() => decode(craft.bytes, messages.descriptor), 'invalid-logic-payload', 'flightMessages.missionComplete');
  });
});
