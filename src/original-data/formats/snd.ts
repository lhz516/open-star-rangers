import {
  SOUND_ENCODING_BYTES, writeSoundPayload, type SoundChannelCount, type SoundEncoding, type SoundLoop,
} from '../../content/sound-payload.ts';
import { ConversionError } from '../conversion/conversion-error.ts';

// SND digital sound effects (docs/original/formats/audio.md §1): a 20-byte little-endian header whose relocated
// pointer at offset 0 addresses the raw PCM right after it.

export const SND_HEADER_BYTES = 20;
export const SND_HEADER_OFFSETS = Object.freeze({ sampleOffset: 0, sampleBytes: 4, sampleRate: 8, bitsPerSample: 12, flags: 16 } as const);
/** Web Audio's lowest guaranteed rate up to the Sound Blaster 16's highest, inclusive. */
export const SND_SAMPLE_RATE_RANGE = Object.freeze({ min: 8_000, max: 44_100 } as const);

/** What one confirmed `flags` value means for the canonical payload. */
export interface SndFlagRule {
  readonly value: number;
  readonly channels: SoundChannelCount;
  readonly loop: SoundLoop;
}

/** The sample interpretations a converter accepts; anything not listed is rejected rather than guessed. */
export interface SndFormatRules {
  /** The `flags` values research confirmed, each once. */
  readonly flags: readonly SndFlagRule[];
  /** Whether research confirmed 16-bit samples as signed little-endian; otherwise 16-bit entries are rejected. */
  readonly s16le: boolean;
}

/** An SND entry's data block and relocation positions, as a P2-03 archive read returns them. */
export interface SndBlock {
  readonly bytes: Uint8Array;
  readonly relocations: readonly number[];
}

/** The raw header fields of a structurally valid SND block; values are not yet checked against any rules. */
export interface SndHeader {
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly flags: number;
  readonly sampleBytes: number;
}

export interface ConvertedSound {
  /** A canonical schema 1 sound payload in a new exclusive buffer. */
  readonly payload: Uint8Array<ArrayBuffer>;
  /** Frames × channels, the `audioSamples` budget unit. */
  readonly samplePoints: number;
}

/**
 * Checks an SND block's structure — at least the header, exactly one relocation at offset 0 whose pointer is 20, and a
 * sample length covering the rest of the block — and returns its raw header fields. Failures are `invalid-sound` at
 * `location` plus a field name.
 */
export function readSndHeader(block: SndBlock, location: string): SndHeader {
  const { bytes, relocations } = block;
  if (bytes.byteLength < SND_HEADER_BYTES) throw new ConversionError('invalid-sound', `${location}.size`, 'the block is shorter than the 20-byte SND header');
  if (relocations.length !== 1 || relocations[0] !== SND_HEADER_OFFSETS.sampleOffset) {
    throw new ConversionError('invalid-sound', `${location}.relocations`, 'must be one relocated sample pointer at offset 0');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, SND_HEADER_BYTES);
  if (view.getUint32(SND_HEADER_OFFSETS.sampleOffset, true) !== SND_HEADER_BYTES) {
    throw new ConversionError('invalid-sound', `${location}.sampleOffset`, 'must point just past the 20-byte header');
  }
  const sampleBytes = view.getUint32(SND_HEADER_OFFSETS.sampleBytes, true);
  if (sampleBytes !== bytes.byteLength - SND_HEADER_BYTES) {
    throw new ConversionError('invalid-sound', `${location}.sampleBytes`, 'must cover the rest of the block');
  }
  return Object.freeze({
    sampleRate: view.getUint32(SND_HEADER_OFFSETS.sampleRate, true),
    bitsPerSample: view.getUint32(SND_HEADER_OFFSETS.bitsPerSample, true),
    flags: view.getUint32(SND_HEADER_OFFSETS.flags, true),
    sampleBytes,
  });
}

/**
 * Converts an SND block into a canonical sound payload under `rules`: structure (`invalid-sound`), then bit width,
 * sample rate and flags (`unsupported-sound-format`), then whole frames (`invalid-sound`, since the frame size depends on
 * the flags' channel count). The samples are copied unchanged; the block is never modified, and nothing is allocated
 * before every check passes.
 */
export function convertSnd(block: SndBlock, rules: SndFormatRules, location: string): ConvertedSound {
  const { sampleRate, bitsPerSample, flags, sampleBytes } = readSndHeader(block, location);
  const encoding: SoundEncoding | undefined = bitsPerSample === 8 ? 'u8' : bitsPerSample === 16 && rules.s16le ? 's16le' : undefined;
  if (!encoding) {
    throw new ConversionError('unsupported-sound-format', `${location}.bitsPerSample`, 'must be 8, or 16 where signed little-endian samples are confirmed');
  }
  if (sampleRate < SND_SAMPLE_RATE_RANGE.min || sampleRate > SND_SAMPLE_RATE_RANGE.max) {
    throw new ConversionError('unsupported-sound-format', `${location}.sampleRate`, 'must be from 8000 to 44100 Hz');
  }
  const rule = rules.flags.find(candidate => candidate.value === flags);
  if (!rule) throw new ConversionError('unsupported-sound-format', `${location}.flags`, 'must be a value whose meaning research confirmed');
  const sampleWidth = SOUND_ENCODING_BYTES[encoding];
  if (sampleBytes === 0 || sampleBytes % (sampleWidth * rule.channels) !== 0) {
    throw new ConversionError('invalid-sound', `${location}.sampleBytes`, 'must hold one or more whole frames');
  }
  const pcm = block.bytes.subarray(SND_HEADER_BYTES);
  return Object.freeze({
    payload: writeSoundPayload({ sampleRate, channels: rule.channels, encoding, loop: rule.loop, pcm }, location),
    samplePoints: sampleBytes / sampleWidth,
  });
}
