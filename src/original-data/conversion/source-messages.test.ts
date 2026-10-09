import { describe, expect, it } from 'vitest';
import { STATUS_MESSAGES_LIMITS, statusMessagesPayloadLength } from '../../content/hud/status-messages-payload.ts';
import { syntheticDiag, type SyntheticDiagFields } from '../synthetic.test-support.ts';
import { expectSourceError as rejects } from './conversion.test-support.ts';
import { readStatusMessages } from './source-messages.ts';

// Synthetic DIAG blocks generated in code (hud, DIAG 10489); the texts are made up, never original text.
const fields = (startup = 2): SyntheticDiagFields => ({
  timings: [3, 40, 5, 0xffff_fff0],
  statusFormats: ['A\n%d%%', 'B %u', 'C:\n%s', ''],
  ratings: [['r0', 30], ['r1', 21], ['r2', -4], ['r3', 0], ['r4\xfe', 0x7fff_ffff]],
  subsystemNames: Array.from({ length: 15 }, (_, index) => `name ${index}`),
  stateWords: ['w0', 'w1', 'w2'],
  startupMessages: Array.from({ length: startup }, (_, index) => `start\n${index}`),
});
const FORMAT = Uint8Array.of(0x28, 0x25, 0x73, 0x2f, 0x25, 0x73, 0x29, 0);

const read = (entry = syntheticDiag(fields()), format = FORMAT) => readStatusMessages({ bytes: entry.data, relocations: entry.relocations }, format, 'graphics[data/a]');
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

describe('DIAG status messages', () => {
  it('reads timings, texts in header order, signed rating maxima and the startup messages', () => {
    const f = fields();
    expect(read()).toEqual({
      upper: { characterTicks: 3, holdTicks: 40 },
      lower: { characterTicks: 5, holdTicks: 0xffff_fff0 },
      statusFormats: f.statusFormats,
      ratings: f.ratings.map(([text, maximum]) => ({ text, maximum })),
      subsystemNames: f.subsystemNames,
      stateWords: f.stateWords,
      subsystemFormat: '(%s/%s)',
      startupMessages: f.startupMessages,
    });
    expect(Object.isFrozen(read().ratings[2])).toBe(true);
  });

  it('accepts no startup messages with a null list pointer, 16 messages, relocations in any order and shared texts', () => {
    expect(read(syntheticDiag(fields(0))).startupMessages).toEqual([]);
    expect(read(syntheticDiag(fields(STATUS_MESSAGES_LIMITS.startupMessages))).startupMessages).toHaveLength(16);
    const entry = syntheticDiag(fields());
    expect(read({ ...entry, relocations: [...entry.relocations].reverse() })).toEqual(read());
    // The fourth status format pointed into the middle of the first one: a suffix of another text is a text.
    const shared = Uint8Array.from(entry.data);
    view(shared).setUint32(0x1c, view(shared).getUint32(0x10, true) + 2, true);
    expect(read({ data: shared, relocations: entry.relocations }).statusFormats[3]).toBe('%d%%');
  });

  it('keeps texts of 255 bytes and rejects 256 at the field', () => {
    const longest = 'x'.repeat(STATUS_MESSAGES_LIMITS.textBytes);
    expect(read(syntheticDiag({ ...fields(), stateWords: ['w0', longest, 'w2'] })).stateWords[1]).toBe(longest);
    rejects(() => read(syntheticDiag({ ...fields(), stateWords: ['w0', `${longest}y`, 'w2'] })), 'limit-exceeded', 'graphics[data/a].messages',
      { name: 'diagTextBytes', limit: 255, observed: 256 });
    rejects(() => read(undefined, Uint8Array.of(...new Array(256).fill(0x61), 0)), 'limit-exceeded', 'graphics[data/a].format',
      { name: 'diagTextBytes', limit: 255, observed: 256 });
  });

  it.each<[string, () => { data: Uint8Array; relocations: number[] }]>([
    ['a header past the block', () => ({ data: syntheticDiag(fields()).data.subarray(0, 0x97), relocations: [] })],
    ['an unterminated last text', () => {
      const entry = syntheticDiag(fields(0));
      return { ...entry, data: entry.data.subarray(0, -1) };
    }],
    ['a text pointer past the block', () => {
      const entry = syntheticDiag(fields());
      view(entry.data).setUint32(0x48, entry.data.length, true);
      return entry;
    }],
    ['a startup list past the block', () => {
      const entry = syntheticDiag(fields());
      view(entry.data).setUint32(0x90, entry.data.length - 4, true);
      return entry;
    }],
    ['startup messages without a list pointer', () => {
      // The relocations match the fields a null list would name, so only the pointer rule rejects it.
      const entry = syntheticDiag(fields(1));
      view(entry.data).setUint32(0x90, 0, true);
      return { ...entry, relocations: [...entry.relocations.filter(offset => offset < 0x90), 0x90, 0] };
    }],
    ['a startup list pointer without messages', () => {
      const entry = syntheticDiag(fields());
      view(entry.data).setUint32(0x94, 0, true);
      return entry;
    }],
    ['a missing relocation', () => {
      const entry = syntheticDiag(fields());
      return { ...entry, relocations: entry.relocations.slice(1) };
    }],
    ['a relocation of a maximum', () => {
      const entry = syntheticDiag(fields());
      return { ...entry, relocations: [...entry.relocations.slice(1), 0x24] };
    }],
    ['a relocated timing', () => {
      const entry = syntheticDiag(fields());
      return { ...entry, relocations: [...entry.relocations, 0] };
    }],
  ])('rejects %s as invalid-payload', (_, entry) => {
    rejects(() => read(entry()), 'invalid-payload', 'graphics[data/a].messages');
  });

  it('limits the startup messages to 16 before reading them', () => {
    const entry = syntheticDiag(fields());
    view(entry.data).setUint32(0x94, 17, true);
    rejects(() => read(entry), 'limit-exceeded', 'graphics[data/a].messages', { name: 'diagStartupMessages', limit: 16, observed: 17 });
  });

  it.each([
    ['an empty format', new Uint8Array(0)],
    ['a format without its NUL', FORMAT.subarray(0, -1)],
    ['a format with an inner NUL', Uint8Array.of(0x61, 0, 0x62, 0)],
  ])('rejects %s at the format', (_, format) => {
    rejects(() => read(undefined, format), 'invalid-payload', 'graphics[data/a].format');
  });

  it('reserves the encoded length once the structure is checked and before any text is copied', () => {
    const reserved: number[] = [];
    const payload = readStatusMessages({ bytes: syntheticDiag(fields()).data, relocations: syntheticDiag(fields()).relocations }, FORMAT, 'graphics[data/a]', bytes => { reserved.push(bytes); });
    expect(reserved).toEqual([statusMessagesPayloadLength(payload)]);
    const refused = new Error('over budget');
    expect(() => read(syntheticDiag(fields()), FORMAT)).not.toThrow();
    expect(() => readStatusMessages({ bytes: syntheticDiag(fields()).data, relocations: syntheticDiag(fields()).relocations }, FORMAT, '', () => { throw refused; }))
      .toThrow(refused);
    // A structural failure is reported without reserving anything.
    const entry = syntheticDiag(fields());
    expect(() => readStatusMessages({ ...entry, bytes: entry.data, relocations: entry.relocations.slice(1) }, FORMAT, '', () => { reserved.push(-1); })).toThrow();
    expect(reserved).toHaveLength(1);
  });

  it('reads the empty format', () => {
    expect(read(undefined, Uint8Array.of(0)).subsystemFormat).toBe('');
  });
});
