import { describe, expect, it } from 'vitest';
import { ContentContractError } from './contract-validation.ts';
import { payloadTransferList } from './ownership.ts';
import {
  readSoundPayload, soundChannelData, SOUND_LOOP_MODES, SOUND_PAYLOAD_HEADER_BYTES, SOUND_PAYLOAD_OFFSETS,
  SOUND_PAYLOAD_SCHEMA_VERSION, SOUND_REPEAT_PLAYS, writeSoundPayload, type SoundPayloadInput,
} from './sound-payload.ts';

const s16le = (...values: number[]): Uint8Array => {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return bytes;
};

const input = (overrides: Partial<SoundPayloadInput> = {}): SoundPayloadInput =>
  ({ sampleRate: 11_025, channels: 1, encoding: 'u8', loop: 'none', pcm: Uint8Array.of(0, 128, 255), ...overrides } as SoundPayloadInput);

/** A valid payload whose header bytes a test may then corrupt. */
const payload = (overrides: Partial<SoundPayloadInput> = {}) => {
  const bytes = writeSoundPayload(input(overrides));
  return { bytes, view: new DataView(bytes.buffer) };
};

const thrown = (action: () => unknown): ContentContractError => {
  try {
    action();
  } catch (error) {
    if (error instanceof ContentContractError) return error;
    throw error;
  }
  throw new Error('expected a ContentContractError');
};

describe('sound payload layout', () => {
  it('fixes schema 2 as a 16-byte little-endian header followed by the PCM', () => {
    expect(SOUND_PAYLOAD_SCHEMA_VERSION).toBe(2);
    expect(SOUND_PAYLOAD_HEADER_BYTES).toBe(16);
    expect(SOUND_PAYLOAD_OFFSETS).toEqual({ tag: 0, sampleRate: 4, frames: 8, channels: 12, encoding: 13, loop: 14, plays: 15, pcm: 16 });
    expect(SOUND_LOOP_MODES).toEqual({ none: 0, whole: 1, repeat: 2 });
    expect(SOUND_REPEAT_PLAYS).toEqual({ min: 2, max: 255 });

    const { bytes, view } = payload({ sampleRate: 22_050, channels: 2, encoding: 's16le', loop: 'whole', pcm: s16le(0x0102, -2, 3, 4) });
    expect(String.fromCharCode(...bytes.subarray(SOUND_PAYLOAD_OFFSETS.tag, SOUND_PAYLOAD_OFFSETS.tag + 4))).toBe('OSRS');
    expect(view.getUint32(SOUND_PAYLOAD_OFFSETS.sampleRate, true)).toBe(22_050);
    expect(view.getUint32(SOUND_PAYLOAD_OFFSETS.frames, true)).toBe(2);
    expect([SOUND_PAYLOAD_OFFSETS.channels, SOUND_PAYLOAD_OFFSETS.encoding, SOUND_PAYLOAD_OFFSETS.loop, SOUND_PAYLOAD_OFFSETS.plays]
      .map(offset => bytes[offset])).toEqual([2, 2, 1, 0]);
    expect([...bytes.subarray(SOUND_PAYLOAD_OFFSETS.pcm, SOUND_PAYLOAD_OFFSETS.pcm + 2)]).toEqual([0x02, 0x01]);
    expect(bytes.byteLength).toBe(16 + 8);

    const repeat = payload({ loop: 'repeat', plays: 9 }).bytes;
    expect([repeat[SOUND_PAYLOAD_OFFSETS.loop], repeat[SOUND_PAYLOAD_OFFSETS.plays]]).toEqual([2, 9]);
  });

  // Schema 1 had loop codes 0 and 1 and a reserved byte 15 of 0, so its `none` and `whole` sounds keep their bytes.
  it.each([['none', 0], ['whole', 1]] as const)('writes a %s sound with the bytes schema 1 gave it', (loop, code) => {
    const pcm = s16le(-3, 7, 0x1234);
    const schema1 = new Uint8Array(16 + pcm.byteLength);
    const view = new DataView(schema1.buffer);
    schema1.set([0x4f, 0x53, 0x52, 0x53]);
    view.setUint32(4, 17_000, true);
    view.setUint32(8, 3, true);
    schema1.set([1, 2, code, 0], 12);
    schema1.set(pcm, 16);
    expect([...writeSoundPayload(input({ sampleRate: 17_000, encoding: 's16le', loop, pcm }))]).toEqual([...schema1]);
  });

  it.each([
    ['u8 mono at 8000 Hz', input({ sampleRate: 8_000 })],
    ['u8 stereo', input({ channels: 2, pcm: Uint8Array.of(1, 2, 3, 4) })],
    ['s16le mono at 96000 Hz', input({ sampleRate: 96_000, encoding: 's16le', pcm: s16le(-32_768, 0, 32_767) })],
    ['s16le stereo looping', input({ channels: 2, encoding: 's16le', loop: 'whole', pcm: s16le(1, -1, 2, -2) })],
    ['u8 mono repeated twice', input({ loop: 'repeat', plays: 2 })],
    ['s16le stereo repeated 255 times', input({ channels: 2, encoding: 's16le', loop: 'repeat', plays: 255, pcm: s16le(5, -5) })],
  ])('round-trips %s', (_name, sound) => {
    const bytes = writeSoundPayload(sound);
    const read = readSoundPayload(bytes);
    expect({ ...read, pcm: [...read.pcm] }).toEqual({
      ...sound, frames: sound.pcm.byteLength / (sound.channels * (sound.encoding === 'u8' ? 1 : 2)), pcm: [...sound.pcm],
    });
    expect(Object.hasOwn(read, 'plays')).toBe(sound.loop === 'repeat');
    expect(Object.isFrozen(read)).toBe(true);
    expect([...writeSoundPayload(read)]).toEqual([...bytes]);
  });

  it('reads a payload at an offset inside a larger buffer', () => {
    const { bytes } = payload();
    const host = new Uint8Array(bytes.byteLength + 5);
    host.set(bytes, 3);
    const read = readSoundPayload(host.subarray(3, 3 + bytes.byteLength));
    expect([read.frames, ...read.pcm]).toEqual([3, 0, 128, 255]);
  });

  it('copies the PCM into an exclusive buffer and leaves the input view unchanged', () => {
    const source = Uint8Array.of(9, 1, 2, 3, 9);
    const pcm = source.subarray(1, 4);
    const bytes = writeSoundPayload(input({ pcm }));
    expect(bytes.buffer).not.toBe(source.buffer);
    expect(bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength).toBe(true);
    expect(payloadTransferList([bytes])).toEqual([bytes.buffer]);
    bytes[SOUND_PAYLOAD_OFFSETS.pcm] = 7;
    expect([...source]).toEqual([9, 1, 2, 3, 9]);
  });
});

describe('sound payload rejection', () => {
  it.each([
    ['a wrong tag', ({ bytes }) => { bytes[1] = 'X'.charCodeAt(0); }, 'payload.tag', 'X'],
    ['an unknown encoding', ({ bytes }) => { bytes[SOUND_PAYLOAD_OFFSETS.encoding] = 3; }, 'payload.encoding', '3'],
    ['0 channels', ({ bytes }) => { bytes[SOUND_PAYLOAD_OFFSETS.channels] = 0; }, 'payload.channels', '0'],
    ['3 channels', ({ bytes }) => { bytes[SOUND_PAYLOAD_OFFSETS.channels] = 3; }, 'payload.channels', '3'],
    ['loop mode 3', ({ bytes }) => { bytes[SOUND_PAYLOAD_OFFSETS.loop] = 3; }, 'payload.loop', '3'],
    ['7999 Hz', ({ view }) => { view.setUint32(SOUND_PAYLOAD_OFFSETS.sampleRate, 7_999, true); }, 'payload.sampleRate', '7999'],
    ['96001 Hz', ({ view }) => { view.setUint32(SOUND_PAYLOAD_OFFSETS.sampleRate, 96_001, true); }, 'payload.sampleRate', '96001'],
    ['a play count for none', ({ bytes }) => { bytes[SOUND_PAYLOAD_OFFSETS.plays] = 5; }, 'payload.plays', '5'],
    ['a play count for whole', ({ bytes }) => { bytes.set([1, 2], SOUND_PAYLOAD_OFFSETS.loop); }, 'payload.plays', null],
    ['repeat with a play count of 0', ({ bytes }) => { bytes[SOUND_PAYLOAD_OFFSETS.loop] = 2; }, 'payload.plays', null],
    ['repeat with a play count of 1', ({ bytes }) => { bytes.set([2, 1], SOUND_PAYLOAD_OFFSETS.loop); }, 'payload.plays', null],
    ['0 frames', ({ view }) => { view.setUint32(SOUND_PAYLOAD_OFFSETS.frames, 0, true); }, 'payload.frames', null],
    ['one PCM byte too few', ({ view }) => { view.setUint32(SOUND_PAYLOAD_OFFSETS.frames, 4, true); }, 'payload.pcm', '4'],
    ['a trailing byte', ({ view }) => { view.setUint32(SOUND_PAYLOAD_OFFSETS.frames, 2, true); }, 'payload.pcm', null],
  ] as const satisfies readonly (readonly [string, (target: ReturnType<typeof payload>) => void, string, string | null])[])(
    'rejects %s', (_name, corrupt, path, value) => {
      const target = payload();
      corrupt(target);
      const error = thrown(() => readSoundPayload(target.bytes));
      expect([error.code, error.path]).toEqual(['invalid-sound-payload', path]);
      if (value !== null) expect(error.message).not.toContain(value);
    },
  );

  it('rejects a payload shorter than the header', () => {
    const error = thrown(() => readSoundPayload(payload().bytes.subarray(0, 15)));
    expect([error.code, error.path]).toEqual(['invalid-sound-payload', 'payload']);
  });

  it('rejects an enormous declared frame count from the actual length without allocating it', () => {
    const { bytes, view } = payload({ channels: 2, encoding: 's16le', pcm: s16le(1, 2) });
    view.setUint32(SOUND_PAYLOAD_OFFSETS.frames, 0xffff_ffff, true);
    const error = thrown(() => readSoundPayload(bytes, 'groups.audio.payloads[0].bytes'));
    expect([error.code, error.path]).toEqual(['invalid-sound-payload', 'groups.audio.payloads[0].bytes.pcm']);
  });

  it('rejects a transferred payload', () => {
    const { bytes } = payload();
    structuredClone(bytes, { transfer: [bytes.buffer] });
    expect(thrown(() => readSoundPayload(bytes)).code).toBe('payload-detached');
  });

  it.each([
    ['7999 Hz', { sampleRate: 7_999 }, 'sound.sampleRate'],
    ['a fractional rate', { sampleRate: 11_025.5 }, 'sound.sampleRate'],
    ['3 channels', { channels: 3 as never }, 'sound.channels'],
    ['an unknown encoding', { encoding: 's8' as never }, 'sound.encoding'],
    ['an inherited encoding name', { encoding: 'toString' as never }, 'sound.encoding'],
    ['an unknown loop mode', { loop: 'ping-pong' as never }, 'sound.loop'],
    ['an inherited loop mode name', { loop: 'toString' as never }, 'sound.loop'],
    ['a play count for none', { loop: 'none', plays: 2 as never }, 'sound.plays'],
    ['a play count for whole', { loop: 'whole', plays: 2 as never }, 'sound.plays'],
    ['an undefined play count for none', { loop: 'none', plays: undefined }, 'sound.plays'],
    ['repeat without a play count', { loop: 'repeat' }, 'sound.plays'],
    ['repeat with a play count of 1', { loop: 'repeat', plays: 1 }, 'sound.plays'],
    ['repeat with a play count of 256', { loop: 'repeat', plays: 256 }, 'sound.plays'],
    ['repeat with a fractional play count', { loop: 'repeat', plays: 2.5 }, 'sound.plays'],
    ['repeat with a play count string', { loop: 'repeat', plays: '8' as never }, 'sound.plays'],
    ['empty PCM', { pcm: new Uint8Array(0) }, 'sound.pcm'],
    ['a partial s16le sample', { encoding: 's16le', pcm: Uint8Array.of(1, 2, 3) }, 'sound.pcm'],
    ['a partial stereo frame', { channels: 2, pcm: Uint8Array.of(1, 2, 3) }, 'sound.pcm'],
  ] as const satisfies readonly (readonly [string, Partial<SoundPayloadInput>, string])[])('refuses to write %s', (_name, overrides, path) => {
    const error = thrown(() => writeSoundPayload(input(overrides)));
    expect([error.code, error.path]).toEqual(['invalid-sound-payload', path]);
  });

  it('refuses to write transferred PCM', () => {
    const pcm = Uint8Array.of(1, 2);
    structuredClone(pcm, { transfer: [pcm.buffer] });
    expect(thrown(() => writeSoundPayload(input({ pcm }))).code).toBe('payload-detached');
  });
});

describe('sound float mapping', () => {
  const mapped = (sound: SoundPayloadInput) => soundChannelData(readSoundPayload(writeSoundPayload(sound))).map(channel => [...channel]);

  it('maps u8 and s16le exactly', () => {
    expect(mapped(input({ pcm: Uint8Array.of(0, 128, 255) }))).toEqual([[-1, 0, 127 / 128]]);
    expect(mapped(input({ encoding: 's16le', pcm: s16le(-32_768, 0, 32_767) }))).toEqual([[-1, 0, 32_767 / 32_768]]);
  });

  it('deinterleaves stereo frames', () => {
    expect(mapped(input({ channels: 2, pcm: Uint8Array.of(0, 255, 128, 64) }))).toEqual([[-1, 0], [127 / 128, -0.5]]);
    expect(mapped(input({ channels: 2, encoding: 's16le', pcm: s16le(-32_768, 16_384, 0, 32_767) })))
      .toEqual([[-1, 0], [0.5, 32_767 / 32_768]]);
  });

  it('returns new arrays that share no memory with the payload', () => {
    const bytes = writeSoundPayload(input({ channels: 2, pcm: Uint8Array.of(0, 255) }));
    const channels = soundChannelData(readSoundPayload(bytes));
    expect(channels.every(channel => channel instanceof Float32Array && channel.buffer !== bytes.buffer)).toBe(true);
    expect(channels[0].buffer).not.toBe(channels[1].buffer);
    bytes.fill(0);
    expect([channels[0][0], channels[1][0]]).toEqual([-1, 127 / 128]);
  });
});
