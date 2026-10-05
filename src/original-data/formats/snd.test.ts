import { describe, expect, it } from 'vitest';
import { payloadTransferList } from '../../content/ownership.ts';
import { readSoundPayload } from '../../content/sound-payload.ts';
import { ConversionError } from '../conversion/conversion-error.ts';
import { entryData, entryRelocations, parseImfat } from '../imfat.ts';
import { buildImfat, syntheticSnd, type SyntheticSndFields } from '../synthetic.ts';
import { convertSnd, readSndHeader, SND_HEADER_BYTES, SND_HEADER_OFFSETS, type SndBlock, type SndFormatRules } from './snd.ts';

// Synthetic flag values with test meanings only; production meanings come from research.
const RULES: SndFormatRules = Object.freeze({
  flags: Object.freeze([
    Object.freeze({ value: 100, channels: 1, loop: 'none' }),
    Object.freeze({ value: 101, channels: 1, loop: 'whole' }),
    Object.freeze({ value: 102, channels: 2, loop: 'none' }),
    Object.freeze({ value: 103, channels: 2, loop: 'whole' }),
  ]),
  s16le: true,
});
const AT = 'archive:/MAIN/SR.NOB#7';

const snd = (fields: Partial<SyntheticSndFields> = {}): SndBlock => {
  const { data, relocations } = syntheticSnd({ samples: [1, 2, 3, 4], flags: 100, ...fields });
  return { bytes: data, relocations };
};

const rejection = (block: SndBlock, rules: SndFormatRules = RULES): ConversionError => {
  try {
    convertSnd(block, rules, AT);
  } catch (error) {
    if (error instanceof ConversionError) return error;
    throw error;
  }
  throw new Error('expected a ConversionError');
};

describe('SND conversion', () => {
  it.each([
    ['8-bit mono at 8000 Hz', { sampleRate: 8_000, samples: [0, 128, 255] }, { channels: 1, encoding: 'u8', loop: 'none', frames: 3 }, 3],
    ['8-bit mono looping at 44100 Hz', { sampleRate: 44_100, flags: 101 }, { channels: 1, encoding: 'u8', loop: 'whole', frames: 4 }, 4],
    ['8-bit stereo', { flags: 102 }, { channels: 2, encoding: 'u8', loop: 'none', frames: 2 }, 4],
    ['16-bit mono', { bitsPerSample: 16 }, { channels: 1, encoding: 's16le', loop: 'none', frames: 2 }, 2],
    ['16-bit stereo looping', { bitsPerSample: 16, flags: 103, samples: [1, 2, 3, 4, 5, 6, 7, 8] }, { channels: 2, encoding: 's16le', loop: 'whole', frames: 2 }, 4],
  ] as const satisfies readonly (readonly [string, Partial<SyntheticSndFields>, object, number])[])('converts %s into the canonical payload', (_name, fields: Partial<SyntheticSndFields>, expected, samplePoints) => {
    const block = snd(fields);
    const converted = convertSnd(block, RULES, AT);
    const payload = readSoundPayload(converted.payload);
    expect({ ...payload, pcm: [...payload.pcm] }).toEqual({
      sampleRate: fields.sampleRate ?? 11_025, ...expected, pcm: [...block.bytes.subarray(SND_HEADER_BYTES)],
    });
    expect(converted.samplePoints).toBe(samplePoints);
    expect(payloadTransferList([converted.payload])).toEqual([converted.payload.buffer]);
    expect(converted.payload.buffer).not.toBe(block.bytes.buffer);
  });

  it('leaves the source block unchanged', () => {
    const block = snd({ bitsPerSample: 16, flags: 102 });
    const before = [...block.bytes];
    const { payload } = convertSnd(block, RULES, AT);
    payload.fill(0);
    expect([...block.bytes]).toEqual(before);
  });

  it('reads a synthetic SND through an IMFAT archive', () => {
    const archive = buildImfat(6, [{ id: 7, type: 'SND', ...syntheticSnd({ samples: [9, 8, 7], sampleRate: 22_050, flags: 5 }) }]);
    const [entry] = parseImfat(archive).entries;
    const block = { bytes: entryData(archive, entry), relocations: entryRelocations(archive, entry) };
    expect(readSndHeader(block, AT)).toEqual({ sampleRate: 22_050, bitsPerSample: 8, flags: 5, sampleBytes: 3 });
  });
});

describe('SND rejection', () => {
  const corrupt = (change: (view: DataView) => void, fields: Partial<SyntheticSndFields> = {}): SndBlock => {
    const block = snd(fields);
    change(new DataView(block.bytes.buffer, block.bytes.byteOffset));
    return block;
  };

  it.each([
    ['a 19-byte block', { bytes: snd().bytes.subarray(0, 19), relocations: [0] }, 'invalid-sound', `${AT}.size`],
    ['no relocation', { ...snd(), relocations: [] }, 'invalid-sound', `${AT}.relocations`],
    ['two relocations', { ...snd(), relocations: [0, 4] }, 'invalid-sound', `${AT}.relocations`],
    ['a relocation at 4', { ...snd(), relocations: [4] }, 'invalid-sound', `${AT}.relocations`],
    ['a sample pointer of 24', snd({ sampleOffset: 24 }), 'invalid-sound', `${AT}.sampleOffset`],
    ['a sample length unlike the block', snd({ sampleBytes: 3 }), 'invalid-sound', `${AT}.sampleBytes`],
    ['an enormous declared sample length', snd({ sampleBytes: 0xffff_fff0 }), 'invalid-sound', `${AT}.sampleBytes`],
    ['an odd 16-bit sample length', snd({ bitsPerSample: 16, samples: [1, 2, 3] }), 'invalid-sound', `${AT}.sampleBytes`],
    ['an odd stereo sample length', snd({ flags: 102, samples: [1, 2, 3] }), 'invalid-sound', `${AT}.sampleBytes`],
    ['no frames', snd({ samples: [] }), 'invalid-sound', `${AT}.sampleBytes`],
    ['12-bit samples', snd({ bitsPerSample: 12 }), 'unsupported-sound-format', `${AT}.bitsPerSample`],
    ['7999 Hz', snd({ sampleRate: 7_999 }), 'unsupported-sound-format', `${AT}.sampleRate`],
    ['44101 Hz', snd({ sampleRate: 44_101 }), 'unsupported-sound-format', `${AT}.sampleRate`],
    ['an unlisted flags value', snd({ flags: 104 }), 'unsupported-sound-format', `${AT}.flags`],
    ['a flags value differing in a high byte', corrupt(view => view.setUint32(SND_HEADER_OFFSETS.flags, 0x0100_0064, true)), 'unsupported-sound-format', `${AT}.flags`],
  ] as const)('rejects %s', (_name, block, code, location) => {
    const error = rejection(block);
    expect(error.toData()).toEqual({ code, location, reason: expect.any(String), limit: null });
  });

  it('rejects 16-bit samples unless the rules confirm them as signed little-endian', () => {
    const block = snd({ bitsPerSample: 16 });
    expect(convertSnd(block, RULES, AT).samplePoints).toBe(2);
    expect(rejection(block, { ...RULES, s16le: false }).toData())
      .toEqual({ code: 'unsupported-sound-format', location: `${AT}.bitsPerSample`, reason: expect.any(String), limit: null });
  });

  it('never echoes header values or sample bytes', () => {
    const samples = [0x71, 0x72, 0x73];
    for (const block of [snd({ sampleRate: 7_999, samples }), snd({ flags: 4_242, samples }), snd({ bitsPerSample: 12, samples })]) {
      const text = JSON.stringify(rejection(block).toData());
      expect(text).not.toMatch(/7999|4242|12|113|114|115/);
    }
  });
});
