import { describe, expect, it } from 'vitest';
import { payloadTransferList } from '../ownership.ts';
import { LOGIC_LIMITS, LOGIC_PAYLOAD_SCHEMA_VERSION, type LogicRole } from './logic-content.ts';
import { MARKER, syntheticLogicAsset, syntheticMission } from './logic-content.test-support.ts';
import { decodeLogicPayload, encodeLogicPayload } from './logic-payload.ts';
import { readLogicContent } from './logic-readers.ts';

type Descriptor = Parameters<typeof decodeLogicPayload>[1];

const contractError = (code: string, path: string) => expect.objectContaining({ name: 'ContentContractError', code, path });
const ascii = (text: string): Uint8Array => Uint8Array.from(text, character => character.charCodeAt(0));
const text = (bytes: Uint8Array): string => String.fromCharCode(...bytes);
const decode = (bytes: Uint8Array, descriptor: unknown) => decodeLogicPayload(bytes, descriptor as Descriptor);
const ROLES: readonly LogicRole[] = ['mission', 'craft-types', 'wingman-roster'];

/** The mission asset with its bytes replaced by `edit` of their text. */
function editedMission(edit: (json: string) => string) {
  const { bytes, descriptor } = syntheticLogicAsset('mission');
  return { bytes: ascii(edit(text(bytes))), descriptor };
}

describe('logic payload encoding', () => {
  it('declares schema version 2, which adds the event triggers', () => {
    expect(LOGIC_PAYLOAD_SCHEMA_VERSION).toBe(2);
  });

  it.each(ROLES)('round-trips %s byte for byte', role => {
    const { bytes, descriptor } = syntheticLogicAsset(role);
    const decoded = decode(bytes, descriptor);
    expect(decoded.role).toBe(role);
    expect(encodeLogicPayload(decoded)).toEqual(bytes);
    expect(decoded).toEqual(readLogicContent(role, JSON.parse(text(bytes))));
  });

  it('encodes equal content to equal bytes in a buffer of their own', () => {
    const first = syntheticLogicAsset('mission').bytes;
    const second = syntheticLogicAsset('mission').bytes;
    expect(second).toEqual(first);
    expect(second.buffer).not.toBe(first.buffer);
    expect(first.byteOffset).toBe(0);
    expect(first.buffer.byteLength).toBe(first.byteLength);
    expect(payloadTransferList([first, second])).toHaveLength(2);
  });

  it('writes contract field order without whitespace, -0 as 0 and escaped quotes', () => {
    const mission = syntheticMission();
    mission.declarations[0].position.x = -0;
    mission.namePool[0] = `${MARKER} "quoted" \\ name`;
    const json = text(encodeLogicPayload({ role: 'mission', content: mission } as never));
    expect(json.startsWith('{"campaign":{"group":0,"slot":1},"coordinates":{"unit":"scen-reference"')).toBe(true);
    expect(json).toContain('"position":{"x":0,"y":0,"z":0}');
    expect(json).not.toMatch(/[\n\r\t]|": |, /);
    expect(JSON.parse(json).namePool[0]).toBe(mission.namePool[0]);
  });

  it('writes message bytes outside printable ASCII as lower-case escapes and round-trips every byte from 1 to 255', () => {
    const mission = syntheticMission();
    const every = Array.from({ length: 255 }, (_, index) => String.fromCharCode(index + 1)).join('');
    mission.eventTriggers[1].ranges[0].messages = [every.slice(0, 128), every.slice(128)];
    const { bytes, descriptor } = syntheticLogicAsset('mission', mission);
    const json = text(bytes);
    expect(json).toContain(`"messages":["${MARKER}-part-1 ","${MARKER}-part-2\\u00e9\\u0001"]`);
    expect(json).toContain('\\u001f !\\"#');
    expect(json).toContain('}~\\u007f\\u0080');
    expect(bytes.every(byte => byte >= 0x20 && byte <= 0x7e)).toBe(true);
    const decoded = decode(bytes, descriptor);
    expect(decoded.role === 'mission' && decoded.content.eventTriggers[1].ranges[0].messages.join('')).toBe(every);
    expect(encodeLogicPayload(decoded)).toEqual(bytes);
  });

  it('round-trips names with quotes and backslashes and numbers in exponent form', () => {
    const mission = syntheticMission();
    mission.namePool[0] = `${MARKER} "quoted" \\ name`;
    mission.declarations[0].position = { x: 1e21, y: 5e-7, z: -1.5e-300 };
    const { bytes, descriptor } = syntheticLogicAsset('mission', mission);
    expect(text(bytes)).toContain('"position":{"x":1e+21,"y":5e-7,"z":-1.5e-300}');
    const decoded = decode(bytes, descriptor);
    expect(decoded.role === 'mission' && decoded.content.namePool[0]).toBe(mission.namePool[0]);
    expect(encodeLogicPayload(decoded)).toEqual(bytes);
    for (const [canonical, other] of [['1e+21', '1e21'], ['5e-7', '0.0000005'], ['-1.5e-300', '-15e-301']]) {
      expect(() => decode(ascii(text(bytes).replace(canonical, other)), descriptor)).toThrowError(contractError('non-canonical-payload', 'payload'));
    }
  });

  it('refuses to encode content beyond the payload byte limit', () => {
    const mission = syntheticMission();
    const extreme = { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE, z: -Number.MAX_VALUE };
    for (let group = mission.groups.length; group < 64; group++) {
      mission.groups.push({ template: 1, members: [], spawnCount: 0, layout: Array(LOGIC_LIMITS.layoutElements).fill(extreme) });
    }
    expect(() => encodeLogicPayload({ role: 'mission', content: mission } as never)).toThrowError(contractError('invalid-logic-payload', 'payload'));
    const reserved: number[] = [];
    const refuse = (byteLength: number) => {
      reserved.push(byteLength);
      throw new RangeError('over budget');
    };
    expect(() => encodeLogicPayload({ role: 'mission', content: mission } as never, refuse)).toThrowError(RangeError);
    expect(reserved).toHaveLength(1);
    expect(reserved[0]).toBeGreaterThan(LOGIC_LIMITS.payloadBytes);
  });

  it('reserves the exact byte length before allocating the bytes', () => {
    const reserved: number[] = [];
    const bytes = encodeLogicPayload({ role: 'mission', content: syntheticMission() } as never, byteLength => reserved.push(byteLength));
    expect(reserved).toEqual([bytes.length]);
  });

  it('rejects content its reader rejects', () => {
    const mission = syntheticMission();
    mission.groups[0].template = 0;
    expect(() => encodeLogicPayload({ role: 'mission', content: mission } as never))
      .toThrowError(contractError('logic-reference-mismatch', 'mission.groups[0].template'));
  });
});

describe('logic payload decoding', () => {
  it.each([
    ['whitespace between tokens', (json: string) => json.replace('{"group":0', '{"group": 0'), 'non-canonical-payload', 'payload'],
    ['another field order', (json: string) => json.replace('"group":0,"slot":1', '"slot":1,"group":0'), 'non-canonical-payload', 'payload'],
    ['-0', (json: string) => json.replace('"position":{"x":0', '"position":{"x":-0'), 'non-canonical-payload', 'payload'],
    ['a longer number spelling', (json: string) => json.replace('"referenceScale":1250', '"referenceScale":1.25e3'), 'non-canonical-payload', 'payload'],
    ['an escaped character', (json: string) => json.replace(`${MARKER}-a`, `\\u0050${MARKER.slice(1)}-a`), 'non-canonical-payload', 'payload'],
    ['a repeated key', (json: string) => json.replace('{"group":0,', '{"group":0,"group":0,'), 'non-canonical-payload', 'payload'],
    ['a trailing newline', (json: string) => `${json}\n`, 'invalid-logic-payload', 'payload'],
    ['text that is not JSON', (json: string) => json.slice(0, -1), 'invalid-logic-payload', 'payload'],
    ['a missing field', (json: string) => json.replace('"spawnCount":3,', ''), 'invalid-logic-payload', 'mission.groups[1].spawnCount'],
    ['an unknown field', (json: string) => json.replace('"slot":1}', '"slot":1,"extra":1}'), 'invalid-logic-payload', 'mission.campaign'],
    ['a wrong type', (json: string) => json.replace('"spawnCount":3', '"spawnCount":"3"'), 'invalid-logic-payload', 'mission.groups[1].spawnCount'],
    ['a reference error', (json: string) => json.replace('"template":3', '"template":9'), 'logic-reference-mismatch', 'mission.groups[1].template'],
    ['an upper-case byte escape', (json: string) => json.replace('\\u00e9', '\\u00E9'), 'non-canonical-payload', 'payload'],
    ['a short byte escape', (json: string) => json.replace('\\u0001', '\\x01'), 'invalid-logic-payload', 'payload'],
    ['another event trigger field order', (json: string) => json.replace('"lower":-5,"upper":5', '"upper":5,"lower":-5'), 'non-canonical-payload', 'payload'],
    ['a selector of -0', (json: string) => json.replace('"summarySelector":0', '"summarySelector":-0'), 'non-canonical-payload', 'payload'],
    ['a missing event triggers field', (json: string) => json.replace(/,"eventTriggers":.*}$/, '}'), 'invalid-logic-payload', 'mission.eventTriggers'],
    ['a missing range field', (json: string) => json.replace(',"summarySelector":9', ''), 'invalid-logic-payload', 'mission.eventTriggers[1].ranges[0].summarySelector'],
    ['a range bound of the wrong type', (json: string) => json.replace('"upper":5', '"upper":"5"'), 'invalid-logic-payload', 'mission.eventTriggers[1].ranges[0].upper'],
    ['a non-finite bound', (json: string) => json.replace('"upper":5', '"upper":1e999'), 'invalid-logic-payload', 'mission.eventTriggers[1].ranges[0].upper'],
    ['an event trigger reference error', (json: string) => json.replace('"eventTrigger":1', '"eventTrigger":2'), 'logic-reference-mismatch', 'mission.declarations[5].eventTrigger'],
  ])('rejects %s', (_, edit, code, path) => {
    const { bytes, descriptor } = editedMission(edit);
    expect(() => decode(bytes, descriptor)).toThrowError(contractError(code, path));
  });

  it('rejects non-ASCII bytes before parsing', () => {
    const { bytes, descriptor } = syntheticLogicAsset('mission');
    const changed = new Uint8Array(bytes);
    changed[text(bytes).indexOf(MARKER)] = 0xc3;
    expect(() => decode(changed, descriptor)).toThrowError(contractError('invalid-logic-payload', 'payload'));
  });

  it('checks the byte length limit before the descriptor or any byte', () => {
    const bytes = new Uint8Array(LOGIC_LIMITS.payloadBytes + 1);
    expect(() => decode(bytes, { role: 'unknown' })).toThrowError(contractError('invalid-logic-payload', 'payload'));
  });

  it('reads a __proto__ key as an unknown field without touching prototypes', () => {
    const { bytes, descriptor } = editedMission(json => json.replace('{"group":0,', '{"__proto__":{"polluted":1},"group":0,'));
    expect(() => decode(bytes, descriptor)).toThrowError(contractError('invalid-logic-payload', 'mission.campaign'));
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('rejects transferred bytes', () => {
    const { bytes, descriptor } = syntheticLogicAsset('craft-types');
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expect(() => decode(bytes, descriptor)).toThrowError(contractError('payload-detached', 'payload'));
  });

  it.each([
    ['mission', 'a missing dependency', (descriptor: { dependencies: unknown[] }) => { descriptor.dependencies.pop(); }],
    ['mission', 'an extra dependency', (descriptor: { dependencies: unknown[] }) => { descriptor.dependencies.push({ id: 'data/zz-extra', kind: 'data' }); }],
    ['craft-types', 'an unreferenced model', (descriptor: { dependencies: unknown[] }) => { descriptor.dependencies.push({ id: 'model/zz-extra', kind: 'model' }); }],
    ['craft-types', 'a missing model', (descriptor: { dependencies: unknown[] }) => { descriptor.dependencies.shift(); }],
    ['wingman-roster', 'another craft type table', (descriptor: { dependencies: unknown[] }) => { descriptor.dependencies[0] = { id: 'data/other-types', kind: 'data' }; }],
  ] as const)('rejects a %s descriptor with %s', (role, _, change) => {
    const { bytes, descriptor } = syntheticLogicAsset(role);
    change(descriptor);
    expect(() => decode(bytes, descriptor)).toThrowError(contractError('logic-reference-mismatch', 'descriptor.dependencies'));
  });

  it.each([
    ['an unknown role', (descriptor: { role: string }) => { descriptor.role = 'strategic-map-frame'; }, 'invalid-logic-payload', 'descriptor.role'],
    ['a kind that does not fit the role', (descriptor: { role: string }) => { descriptor.role = 'craft-types'; }, 'invalid-logic-payload', 'descriptor.kind'],
    ['the previous schema version', (descriptor: { payloadIdentity: { schemaVersion: number } }) => { descriptor.payloadIdentity.schemaVersion = 1; }, 'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
    ['a later schema version', (descriptor: { payloadIdentity: { schemaVersion: number } }) => { descriptor.payloadIdentity.schemaVersion = 3; }, 'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
  ] as const)('rejects a descriptor with %s', (_, change, code, path) => {
    const { bytes, descriptor } = syntheticLogicAsset('mission');
    change(descriptor as never);
    expect(() => decode(bytes, descriptor)).toThrowError(contractError(code, path));
  });

  it('returns a frozen result isolated from the input bytes and never echoes their content', () => {
    const { bytes, descriptor } = syntheticLogicAsset('mission');
    const decoded = decode(bytes, descriptor);
    bytes.fill(0x20);
    expect(decoded.content).toEqual(readLogicContent('mission', syntheticMission()).content);
    expect(Object.isFrozen(decoded)).toBe(true);
    const failure = editedMission(json => json.replace(`${MARKER}-a`, `${MARKER}-a\\u0001`));
    try {
      decode(failure.bytes, failure.descriptor);
      throw new Error('expected a failure');
    } catch (error) {
      expect(error).toEqual(contractError('invalid-logic-payload', 'mission.declarations[2].nameCandidates[0]'));
      expect(String((error as Error).message)).not.toContain(MARKER);
    }
  });
});
