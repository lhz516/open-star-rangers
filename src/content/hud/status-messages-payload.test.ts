import { describe, expect, it } from 'vitest';
import { readAssetDescriptor } from '../asset-contract.ts';
import { payloadTransferList } from '../ownership.ts';
import { sha256Fingerprint } from '../sha256.ts';
import { expectContractError, set32, set8 } from '../graphics/graphics.test-support.ts';
import {
  STATUS_MESSAGES_COUNTS, STATUS_MESSAGES_LIMITS, STATUS_MESSAGES_ROLE, STATUS_MESSAGES_SCHEMA_VERSION, checkStatusMessagesBinding,
  encodeStatusMessagesPayload, readStatusMessagesPayload, statusMessagesPayloadLength, type StatusMessagesPayload,
} from './status-messages-payload.ts';

// Synthetic texts generated in code: they exercise line breaks, printf-style conversions and high byte values, never
// original text.
const word = (prefix: string, index: number): string => `${prefix}${index}`;
const sample = (startup = 2): StatusMessagesPayload => ({
  upper: { characterTicks: 3, holdTicks: 0xffff_ffff },
  lower: { characterTicks: 0, holdTicks: 17 },
  statusFormats: ['F0\n%d%%', 'F1 %s', '', 'F3\xff%u'],
  ratings: Array.from({ length: 5 }, (_, index) => ({ text: word('rating-', index), maximum: index === 0 ? -0x8000_0000 : 40 - index * 7 })),
  subsystemNames: Array.from({ length: 15 }, (_, index) => word('unit ', index)),
  stateWords: ['s0', 's1', 's2'],
  subsystemFormat: '<%s|%s>',
  startupMessages: Array.from({ length: startup }, (_, index) => word('boot\n', index)),
});

const textBytes = (text: string): number[] => [text.length, ...Array.from(text, character => character.charCodeAt(0))];

describe('status display messages payload schema 1', () => {
  it('lays out the timings, rating maxima, startup count and length-prefixed texts in order', () => {
    const payload = sample();
    const bytes = encodeStatusMessagesPayload(payload);
    const view = new DataView(bytes.buffer);
    expect([0, 4, 8, 12].map(offset => view.getUint32(offset, true))).toEqual([3, 0xffff_ffff, 0, 17]);
    expect([0, 1, 2, 3, 4].map(index => view.getInt32(16 + index * 4, true))).toEqual(payload.ratings.map(({ maximum }) => maximum));
    expect(bytes[36]).toBe(2);
    expect([...bytes.subarray(37)]).toEqual([
      ...payload.statusFormats, ...payload.ratings.map(({ text }) => text), ...payload.subsystemNames, ...payload.stateWords,
      payload.subsystemFormat, ...payload.startupMessages,
    ].flatMap(textBytes));
    expect(statusMessagesPayloadLength(payload)).toBe(bytes.length);
  });

  it('round-trips into frozen data and encodes the same input to the same exclusive bytes', () => {
    for (const startup of [0, 2, STATUS_MESSAGES_LIMITS.startupMessages]) {
      const bytes = encodeStatusMessagesPayload(sample(startup));
      expect(payloadTransferList([bytes])).toEqual([bytes.buffer]);
      const read = readStatusMessagesPayload(bytes, STATUS_MESSAGES_SCHEMA_VERSION);
      expect(read).toEqual(sample(startup));
      expect(Object.isFrozen(read) && Object.isFrozen(read.ratings[0]) && Object.isFrozen(read.startupMessages)).toBe(true);
      expect(encodeStatusMessagesPayload(read)).toEqual(bytes);
    }
  });

  it('keeps every byte value 1 to 255 and texts of 255 bytes', () => {
    const every = String.fromCharCode(...Array.from({ length: 255 }, (_, index) => index + 1));
    const payload = { ...sample(), subsystemFormat: every };
    expect(readStatusMessagesPayload(encodeStatusMessagesPayload(payload), 1).subsystemFormat).toBe(every);
  });

  it.each<[string, (payload: StatusMessagesPayload) => unknown, string]>([
    ['a NUL byte', payload => ({ ...payload, subsystemFormat: 'a\0b' }), 'messages.subsystemFormat'],
    ['a wide character', payload => ({ ...payload, stateWords: ['s0', '\u0100', 's2'] }), 'messages.stateWords[1]'],
    ['a 256-byte text', payload => ({ ...payload, subsystemNames: [...payload.subsystemNames.slice(1), 'x'.repeat(256)] }), 'messages.subsystemNames[14]'],
    ['a missing format', payload => ({ ...payload, statusFormats: payload.statusFormats.slice(1) }), 'messages.statusFormats'],
    ['six ratings', payload => ({ ...payload, ratings: [...payload.ratings, payload.ratings[0]] }), 'messages.ratings'],
    ['17 startup messages', payload => ({ ...payload, startupMessages: Array(17).fill('x') }), 'messages.startupMessages'],
    ['a sparse list', payload => ({ ...payload, stateWords: Object.assign(new Array(3), { 0: 's0', 2: 's2' }) }), 'messages.stateWords'],
    ['a negative interval', payload => ({ ...payload, upper: { ...payload.upper, characterTicks: -1 } }), 'messages.upper.characterTicks'],
    ['a fractional maximum', payload => ({ ...payload, ratings: payload.ratings.map((rating, index) => (index === 3 ? { ...rating, maximum: 0.5 } : rating)) }),
      'messages.ratings[3].maximum'],
    ['a missing line', payload => ({ ...payload, lower: undefined }), 'messages.lower'],
    ['an unknown field', payload => ({ ...payload, colour: 7 }), 'messages'],
  ])('rejects encoder input with %s at its field', (_, change, path) => {
    expectContractError(() => encodeStatusMessagesPayload(change(sample()) as StatusMessagesPayload), 'invalid-status-messages-payload', path);
  });

  const encoded = () => encodeStatusMessagesPayload(sample());
  const FIRST_TEXT = 37;
  it.each<[string, () => unknown, string, string]>([
    ['an unknown schema', () => readStatusMessagesPayload(encoded(), 2), 'unsupported-payload-schema', 'payload.schemaVersion'],
    ['not bytes', () => readStatusMessagesPayload([1, 2], 1), 'invalid-status-messages-payload', 'payload'],
    ['a truncated header', () => readStatusMessagesPayload(encoded().subarray(0, 36), 1), 'invalid-status-messages-payload', 'payload'],
    ['a truncated text', () => readStatusMessagesPayload(encoded().subarray(0, -1), 1), 'invalid-status-messages-payload', 'payload'],
    ['a missing text', () => readStatusMessagesPayload(set8(encoded(), 36, 3), 1), 'invalid-status-messages-payload', 'payload'],
    ['trailing bytes', () => readStatusMessagesPayload(Uint8Array.from([...encoded(), 0]), 1), 'invalid-status-messages-payload', 'payload'],
    ['17 startup messages', () => readStatusMessagesPayload(set8(encoded(), 36, 17), 1), 'invalid-status-messages-payload', 'payload.startupMessages'],
    ['a NUL byte in a text', () => readStatusMessagesPayload(set8(encoded(), FIRST_TEXT + 1, 0), 1), 'invalid-status-messages-payload', 'payload.texts[0]'],
    ['a text length past the end', () => readStatusMessagesPayload(set8(encoded(), FIRST_TEXT, 255), 1), 'invalid-status-messages-payload', 'payload'],
  ])('rejects stored bytes with %s without echoing them', (_, action, code, path) => {
    expectContractError(action, code, path, ['%d', 'unit']);
  });

  it('rejects transferred bytes', () => {
    const detached = encoded();
    structuredClone(detached, { transfer: [detached.buffer] });
    expectContractError(() => readStatusMessagesPayload(detached, 1), 'payload-detached', 'payload');
  });

  it('reads stored maxima as signed and intervals as unsigned', () => {
    const bytes = set32(set32(encodeStatusMessagesPayload(sample()), 16, 0xffff_fffe), 0, 0x8000_0000);
    const read = readStatusMessagesPayload(bytes, 1);
    expect([read.ratings[0].maximum, read.upper.characterTicks]).toEqual([-2, 0x8000_0000]);
  });

  it('fixes the list lengths the program reads', () => {
    expect(STATUS_MESSAGES_COUNTS).toEqual({ statusFormats: 4, ratings: 5, subsystemNames: 15, stateWords: 3 });
  });

  it('binds only a dependency-free data Asset of the status messages role', () => {
    const bytes = encodeStatusMessagesPayload(sample());
    const descriptor = (changes: Record<string, unknown> = {}) => readAssetDescriptor({
      id: 'data/hud/status-display/messages', kind: 'data', role: STATUS_MESSAGES_ROLE, group: 'cockpit-hud-map', dependencies: [],
      payloadIdentity: { schemaVersion: 1, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) }, ...changes,
    });
    expect(() => checkStatusMessagesBinding(descriptor())).not.toThrow();
    expectContractError(() => checkStatusMessagesBinding(descriptor({ role: 'hud-mfd' })), 'binding-mismatch', 'asset.role');
    expectContractError(() => checkStatusMessagesBinding(descriptor({ dependencies: [{ id: 'palette/x', kind: 'palette' }] })), 'binding-mismatch', 'asset.dependencies');
    expectContractError(() => checkStatusMessagesBinding({ ...descriptor(), kind: 'image' }), 'binding-mismatch', 'asset.kind');
  });
});
